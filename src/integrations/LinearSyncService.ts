/**
 * LinearSyncService
 * Orchestrates bidirectional synchronization between agents and Linear issues.
 *
 * Agent → Linear sync:
 * - Updates Linear issue status when agent completes/fails
 * - Posts agent results as comments on Linear issues
 * - Logs all sync events for audit
 */

import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import { LinearApiClient, WorkflowState } from './LinearApiClient.js';

const serviceLogger = logger.child({ component: 'LinearSyncService' });

export interface AgentCompletionData {
  agentId: string;
  status: 'completed' | 'failed' | 'terminated';
  result?: string;
  tokensUsed?: number;
  durationMs?: number;
  errorMessage?: string;
}

export interface SyncResult {
  success: boolean;
  mappingId?: string;
  statusUpdated?: boolean;
  commentPosted?: boolean;
  error?: string;
}

interface LinearMapping {
  id: string;
  linear_issue_id: string;
  linear_issue_identifier: string;
  linear_team_id: string;
  agent_id: string;
  sync_enabled: boolean;
  sync_direction: string;
}

interface StatusMapping {
  linear_state_id: string;
  linear_state_name: string;
}

export class LinearSyncService {
  private apiClient: LinearApiClient | null = null;
  private workflowStatesCache: Map<string, WorkflowState[]> = new Map();

  constructor() {
    // Initialize API client if token is available
    const apiToken = process.env.LINEAR_API_TOKEN;
    if (apiToken) {
      this.apiClient = new LinearApiClient({ apiToken });
    }
  }

  /**
   * Handle agent completion - main entry point for Agent → Linear sync
   * Called when an agent reaches completed/failed/terminated status
   */
  async handleAgentCompletion(data: AgentCompletionData): Promise<SyncResult> {
    const { agentId, status, result, tokensUsed, durationMs, errorMessage } = data;

    serviceLogger.info({ agentId, status }, 'Handling agent completion for Linear sync');

    // 1. Check if API client is configured
    if (!this.apiClient) {
      serviceLogger.warn('Linear API token not configured, skipping sync');
      return { success: false, error: 'Linear API not configured' };
    }

    // 2. Find Linear mapping for this agent
    const mapping = await this.getMappingByAgentId(agentId);
    if (!mapping) {
      serviceLogger.debug({ agentId }, 'No Linear mapping found for agent');
      return { success: true, mappingId: undefined }; // Not an error, just no mapping
    }

    if (!mapping.sync_enabled) {
      serviceLogger.debug({ agentId, mappingId: mapping.id }, 'Sync disabled for this mapping');
      return { success: true, mappingId: mapping.id };
    }

    if (mapping.sync_direction === 'linear_to_agent' || mapping.sync_direction === 'none') {
      serviceLogger.debug({ agentId, direction: mapping.sync_direction }, 'Sync direction does not allow agent-to-linear');
      return { success: true, mappingId: mapping.id };
    }

    const startTime = Date.now();
    let statusUpdated = false;
    let commentPosted = false;
    let syncError: string | undefined;

    try {
      // 3. Update Linear issue status
      const statusResult = await this.syncStatusToLinear(mapping, status);
      statusUpdated = statusResult.success;
      if (!statusResult.success) {
        syncError = statusResult.error;
      }

      // 4. Post result as comment
      const commentContent = this.formatResultComment({
        status,
        result,
        tokensUsed,
        durationMs,
        errorMessage,
        issueIdentifier: mapping.linear_issue_identifier,
      });

      const commentResult = await this.apiClient.createComment(
        mapping.linear_issue_id,
        commentContent
      );
      commentPosted = commentResult.success;
      if (!commentResult.success && !syncError) {
        syncError = commentResult.error;
      }

      // 5. Update mapping status
      await this.updateMappingStatus(mapping.id, status);

      // 6. Log sync event
      await this.logSyncEvent(mapping.id, {
        direction: 'agent_to_linear',
        eventType: 'completion',
        agentData: { agentId, status, result, tokensUsed },
        linearData: { statusUpdated, commentPosted },
        syncStatus: statusUpdated || commentPosted ? 'success' : 'failed',
        errorMessage: syncError,
        durationMs: Date.now() - startTime,
      });

      serviceLogger.info(
        { agentId, mappingId: mapping.id, statusUpdated, commentPosted },
        'Agent completion synced to Linear'
      );

      return {
        success: statusUpdated || commentPosted,
        mappingId: mapping.id,
        statusUpdated,
        commentPosted,
        error: syncError,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      serviceLogger.error({ error, agentId, mappingId: mapping.id }, 'Failed to sync agent completion to Linear');

      await this.logSyncEvent(mapping.id, {
        direction: 'agent_to_linear',
        eventType: 'completion',
        agentData: { agentId, status },
        syncStatus: 'failed',
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        mappingId: mapping.id,
        error: errorMsg,
      };
    }
  }

  /**
   * Sync agent status to Linear issue state
   */
  private async syncStatusToLinear(
    mapping: LinearMapping,
    agentStatus: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.apiClient) {
      return { success: false, error: 'API client not configured' };
    }

    // Get status mapping from database
    const statusMapping = await this.getStatusMapping(mapping.linear_team_id, agentStatus);
    if (!statusMapping) {
      serviceLogger.warn(
        { agentStatus, teamId: mapping.linear_team_id },
        'No Linear status mapping found for agent status'
      );
      return { success: false, error: `No status mapping for: ${agentStatus}` };
    }

    // Try to get the actual state ID from Linear (the DB might have placeholder IDs)
    let stateId = statusMapping.linear_state_id;
    if (mapping.linear_team_id && !stateId.match(/^[a-f0-9-]{36}$/i)) {
      // Placeholder ID, try to resolve from Linear
      const states = await this.getWorkflowStates(mapping.linear_team_id);
      const matchingState = states.find(
        s => s.name.toLowerCase() === statusMapping.linear_state_name.toLowerCase()
      );
      if (matchingState) {
        stateId = matchingState.id;
      } else {
        serviceLogger.warn(
          { stateName: statusMapping.linear_state_name },
          'Could not find Linear state ID'
        );
        return { success: false, error: `State not found: ${statusMapping.linear_state_name}` };
      }
    }

    // Update the issue state
    const result = await this.apiClient.updateIssueState(mapping.linear_issue_id, stateId);
    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Get workflow states for a team (with caching)
   */
  private async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    if (this.workflowStatesCache.has(teamId)) {
      return this.workflowStatesCache.get(teamId)!;
    }

    if (!this.apiClient) {
      return [];
    }

    const states = await this.apiClient.getWorkflowStates(teamId);
    this.workflowStatesCache.set(teamId, states);
    return states;
  }

  /**
   * Format agent result as a comment for Linear
   */
  private formatResultComment(data: {
    status: string;
    result?: string;
    tokensUsed?: number;
    durationMs?: number;
    errorMessage?: string;
    issueIdentifier: string;
  }): string {
    const statusEmoji = data.status === 'completed' ? '✅' : data.status === 'failed' ? '❌' : '⏹️';
    const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);

    let comment = `## ${statusEmoji} Agent ${statusLabel}\n\n`;

    // Add metrics if available
    const metrics: string[] = [];
    if (data.durationMs !== undefined) {
      const duration = data.durationMs < 1000
        ? `${data.durationMs}ms`
        : `${(data.durationMs / 1000).toFixed(1)}s`;
      metrics.push(`**Duration:** ${duration}`);
    }
    if (data.tokensUsed !== undefined) {
      metrics.push(`**Tokens Used:** ${data.tokensUsed.toLocaleString()}`);
    }

    if (metrics.length > 0) {
      comment += metrics.join(' | ') + '\n\n';
    }

    // Add result or error
    if (data.status === 'completed' && data.result) {
      comment += '### Result\n\n';
      // Truncate long results
      const maxLength = 2000;
      if (data.result.length > maxLength) {
        comment += data.result.substring(0, maxLength) + '\n\n*[Result truncated...]*\n';
      } else {
        comment += data.result + '\n';
      }
    } else if (data.status === 'failed' && data.errorMessage) {
      comment += '### Error\n\n';
      comment += '```\n' + data.errorMessage + '\n```\n';
    }

    comment += '\n---\n*Synced by Multi-Agent Orchestrator*';

    return comment;
  }

  /**
   * Get Linear mapping by agent ID
   */
  private async getMappingByAgentId(agentId: string): Promise<LinearMapping | null> {
    const result = await db.query(
      `SELECT id, linear_issue_id, linear_issue_identifier, linear_team_id,
              agent_id, sync_enabled, sync_direction
       FROM linear_agent_mappings
       WHERE agent_id = $1`,
      [agentId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get status mapping from database
   */
  private async getStatusMapping(
    teamId: string | null,
    agentStatus: string
  ): Promise<StatusMapping | null> {
    // Try team-specific mapping first
    let result = await db.query(
      `SELECT linear_state_id, linear_state_name
       FROM linear_status_mappings
       WHERE agent_status = $1
         AND (linear_team_id = $2 OR linear_team_id IS NULL)
         AND sync_agent_to_linear = TRUE
       ORDER BY
         CASE WHEN linear_team_id = $2 THEN 0 ELSE 1 END,
         priority DESC
       LIMIT 1`,
      [agentStatus, teamId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update mapping status after sync
   */
  private async updateMappingStatus(mappingId: string, agentStatus: string): Promise<void> {
    await db.query(
      `UPDATE linear_agent_mappings
       SET agent_status = $2,
           last_synced_at = NOW(),
           status_mismatch = FALSE
       WHERE id = $1`,
      [mappingId, agentStatus]
    );
  }

  /**
   * Log sync event for audit trail
   */
  private async logSyncEvent(
    mappingId: string,
    event: {
      direction: 'agent_to_linear' | 'linear_to_agent';
      eventType: string;
      agentData?: Record<string, unknown>;
      linearData?: Record<string, unknown>;
      syncStatus: 'success' | 'failed' | 'partial' | 'skipped';
      errorMessage?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO linear_sync_events
         (mapping_id, direction, event_type, agent_data, linear_data, sync_status, error_message, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          mappingId,
          event.direction,
          event.eventType,
          JSON.stringify(event.agentData || {}),
          JSON.stringify(event.linearData || {}),
          event.syncStatus,
          event.errorMessage || null,
          event.durationMs || null,
        ]
      );
    } catch (error) {
      serviceLogger.error({ error, mappingId }, 'Failed to log sync event');
    }
  }

  /**
   * Clear workflow states cache (useful for testing or when states change)
   */
  clearCache(): void {
    this.workflowStatesCache.clear();
  }
}
