/**
 * LinearWebhookService
 * Handles incoming Linear webhooks, verifies signatures, and routes events
 * to the delegation engine for automatic agent spawning.
 *
 * Features:
 * - Webhook signature verification (HMAC-SHA256)
 * - Event routing and filtering
 * - Rate limiting per webhook
 * - Event logging for debugging
 * - Bidirectional sync support
 */

import crypto from 'crypto';
import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';

// Types
export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: string;  // 'Issue', 'Comment', 'Project', etc.
  data: LinearIssue | LinearComment | Record<string, any>;
  url: string;
  createdAt: string;
  organizationId?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;  // e.g., "ENG-123"
  title: string;
  description?: string;
  priority: number;  // 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  state: {
    id: string;
    name: string;
    type: string;
  };
  team: {
    id: string;
    key: string;
    name: string;
  };
  labels: {
    nodes: Array<{
      id: string;
      name: string;
    }>;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinearComment {
  id: string;
  body: string;
  issue: {
    id: string;
    identifier: string;
  };
  user: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface WebhookConfig {
  id: string;
  webhookId: string;
  secretHash: string;
  enabled: boolean;
  eventTypes: string[];
}

export interface ProcessedEvent {
  eventId: string;
  processed: boolean;
  actions: Array<{
    action: string;
    result?: any;
    error?: string;
  }>;
}

export class LinearWebhookService {
  private serviceLogger = logger.child({ component: 'LinearWebhookService' });

  // ===========================================================================
  // Webhook Verification
  // ===========================================================================

  /**
   * Verify Linear webhook signature
   * Linear uses HMAC-SHA256 with the webhook secret
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get webhook configuration by ID
   */
  async getWebhookConfig(webhookId: string): Promise<WebhookConfig | null> {
    const result = await db.query(
      `SELECT * FROM linear_webhooks WHERE webhook_id = $1 AND enabled = TRUE`,
      [webhookId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      webhookId: row.webhook_id,
      secretHash: row.secret_hash,
      enabled: row.enabled,
      eventTypes: row.event_types || ['Issue', 'Comment'],
    };
  }

  // ===========================================================================
  // Event Processing
  // ===========================================================================

  /**
   * Process incoming webhook event
   */
  async processWebhook(
    webhookId: string,
    signature: string,
    rawPayload: string,
    headers: Record<string, string>
  ): Promise<ProcessedEvent> {
    const eventId = headers['linear-delivery'] || crypto.randomUUID();

    this.serviceLogger.info({ webhookId, eventId }, 'Processing webhook');

    // 1. Get webhook configuration
    const config = await this.getWebhookConfig(webhookId);
    if (!config) {
      this.serviceLogger.warn({ webhookId }, 'Unknown webhook ID');
      await this.logWebhookEvent(webhookId, 'unknown', rawPayload, headers, 'failed', 'Unknown webhook ID');
      return { eventId, processed: false, actions: [{ action: 'reject', error: 'Unknown webhook' }] };
    }

    // 2. Verify signature
    if (!this.verifySignature(rawPayload, signature, config.secretHash)) {
      this.serviceLogger.warn({ webhookId }, 'Invalid webhook signature');
      await this.logWebhookEvent(webhookId, 'invalid_signature', rawPayload, headers, 'failed', 'Invalid signature');
      return { eventId, processed: false, actions: [{ action: 'reject', error: 'Invalid signature' }] };
    }

    // 3. Parse payload
    let payload: LinearWebhookPayload;
    try {
      payload = JSON.parse(rawPayload);
    } catch (error) {
      this.serviceLogger.error({ error, webhookId }, 'Failed to parse webhook payload');
      await this.logWebhookEvent(webhookId, 'parse_error', rawPayload, headers, 'failed', 'Parse error');
      return { eventId, processed: false, actions: [{ action: 'reject', error: 'Invalid JSON' }] };
    }

    // 4. Check if event type is subscribed
    if (!config.eventTypes.includes(payload.type)) {
      this.serviceLogger.debug({ webhookId, type: payload.type }, 'Event type not subscribed');
      await this.logWebhookEvent(webhookId, payload.type, rawPayload, headers, 'ignored', 'Event type not subscribed');
      return { eventId, processed: true, actions: [{ action: 'ignore', result: 'Event type not subscribed' }] };
    }

    // 5. Update webhook last received timestamp
    await this.updateWebhookTimestamp(config.id);

    // 6. Route to appropriate handler
    const actions: Array<{ action: string; result?: any; error?: string }> = [];

    try {
      switch (payload.type) {
        case 'Issue':
          const issueResult = await this.handleIssueEvent(payload.action, payload.data as LinearIssue);
          actions.push({ action: 'handle_issue', result: issueResult });
          break;

        case 'Comment':
          const commentResult = await this.handleCommentEvent(payload.action, payload.data as LinearComment);
          actions.push({ action: 'handle_comment', result: commentResult });
          break;

        default:
          this.serviceLogger.debug({ type: payload.type }, 'Unhandled event type');
          actions.push({ action: 'skip', result: 'Unhandled event type' });
      }

      await this.logWebhookEvent(webhookId, `${payload.type}.${payload.action}`, rawPayload, headers, 'processed', null, actions);
      return { eventId, processed: true, actions };

    } catch (error) {
      this.serviceLogger.error({ error, webhookId, eventId }, 'Failed to process webhook');
      await this.logWebhookEvent(webhookId, payload.type, rawPayload, headers, 'failed', String(error));
      return { eventId, processed: false, actions: [{ action: 'error', error: String(error) }] };
    }
  }

  // ===========================================================================
  // Issue Event Handlers
  // ===========================================================================

  /**
   * Handle Issue events (create, update, remove)
   */
  private async handleIssueEvent(action: string, issue: LinearIssue): Promise<any> {
    this.serviceLogger.info(
      { action, issueId: issue.id, identifier: issue.identifier },
      'Handling issue event'
    );

    switch (action) {
      case 'create':
        return this.handleIssueCreated(issue);

      case 'update':
        return this.handleIssueUpdated(issue);

      case 'remove':
        return this.handleIssueRemoved(issue);

      default:
        return { skipped: true, reason: `Unknown action: ${action}` };
    }
  }

  /**
   * Handle new issue creation
   * Check delegation rules and potentially spawn an agent
   */
  private async handleIssueCreated(issue: LinearIssue): Promise<any> {
    // Import delegation engine dynamically to avoid circular deps
    const { DelegationEngine } = await import('./DelegationEngine.js');
    const delegationEngine = new DelegationEngine();

    // Check for matching delegation rules
    const delegation = await delegationEngine.findMatchingRule(
      'linear',
      'issue.created',
      this.issueToPayload(issue)
    );

    if (!delegation) {
      this.serviceLogger.debug({ issueId: issue.id }, 'No matching delegation rule');
      return { delegated: false, reason: 'No matching rule' };
    }

    // Create or request approval
    if (delegation.requiresApproval) {
      const approvalId = await delegationEngine.createApprovalRequest(
        'spawn_agent',
        issue.id,
        {
          linear_issue: issue,
          delegation_rule: delegation.rule,
          task_description: delegation.taskDescription,
          budget: delegation.budget,
        }
      );
      return { delegated: false, pendingApproval: true, approvalId };
    }

    // Auto-delegate: spawn agent immediately
    const result = await delegationEngine.executeDelegate(
      delegation,
      issue.id,
      issue.identifier
    );

    return { delegated: true, agentId: result.agentId, mappingId: result.mappingId };
  }

  /**
   * Handle issue status updates
   * Sync status changes with agent
   */
  private async handleIssueUpdated(issue: LinearIssue): Promise<any> {
    // Check if this issue is mapped to an agent
    const mapping = await this.getMappingByIssueId(issue.id);

    if (!mapping) {
      // Maybe check for new delegation rules that now match
      return { synced: false, reason: 'No existing mapping' };
    }

    // Sync status if changed
    if (mapping.linear_status !== issue.state.name) {
      await this.syncStatusFromLinear(mapping.id, issue.state);
      return { synced: true, statusChange: { from: mapping.linear_status, to: issue.state.name } };
    }

    return { synced: true, noChanges: true };
  }

  /**
   * Handle issue deletion
   */
  private async handleIssueRemoved(issue: LinearIssue): Promise<any> {
    const mapping = await this.getMappingByIssueId(issue.id);

    if (mapping) {
      // Mark mapping as deleted but don't remove (for audit)
      await db.query(
        `UPDATE linear_agent_mappings SET sync_enabled = FALSE WHERE id = $1`,
        [mapping.id]
      );
      return { unmapped: true, mappingId: mapping.id };
    }

    return { unmapped: false, reason: 'No existing mapping' };
  }

  // ===========================================================================
  // Comment Event Handlers
  // ===========================================================================

  /**
   * Handle Comment events
   */
  private async handleCommentEvent(action: string, comment: LinearComment): Promise<any> {
    if (action !== 'create') {
      return { handled: false, reason: 'Only create events handled' };
    }

    // Check if this issue is mapped to an agent
    const mapping = await this.getMappingByIssueId(comment.issue.id);

    if (!mapping) {
      return { handled: false, reason: 'Issue not mapped' };
    }

    // Store comment for agent context
    await this.storeLinearComment(mapping.id, comment);

    // Optionally create intervention if this is a directive
    const isDirective = this.detectDirective(comment.body);
    if (isDirective && mapping.agent_id) {
      await this.createAgentIntervention(mapping.agent_id, comment);
      return { handled: true, intervention: true };
    }

    return { handled: true, stored: true };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private issueToPayload(issue: LinearIssue): Record<string, any> {
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      'state.name': issue.state.name,
      'state.type': issue.state.type,
      'team.id': issue.team.id,
      'team.key': issue.team.key,
      'labels.names': issue.labels.nodes.map(l => l.name),
      hasLabels: issue.labels.nodes.map(l => l.name),  // For "in" operator
    };
  }

  private async getMappingByIssueId(issueId: string): Promise<any> {
    const result = await db.query(
      `SELECT * FROM linear_agent_mappings WHERE linear_issue_id = $1`,
      [issueId]
    );
    return result.rows[0] || null;
  }

  private async syncStatusFromLinear(mappingId: string, state: { id: string; name: string }): Promise<void> {
    // Get status mapping
    const statusMapping = await db.query(
      `SELECT agent_status FROM linear_status_mappings
       WHERE linear_state_name = $1 AND sync_linear_to_agent = TRUE
       ORDER BY priority DESC LIMIT 1`,
      [state.name]
    );

    if (statusMapping.rows.length === 0) {
      this.serviceLogger.warn({ stateName: state.name }, 'No status mapping found');
      return;
    }

    const agentStatus = statusMapping.rows[0].agent_status;

    // Update mapping
    await db.query(
      `UPDATE linear_agent_mappings
       SET linear_status = $2, status_mismatch = (agent_status != $3), last_synced_at = NOW()
       WHERE id = $1`,
      [mappingId, state.name, agentStatus]
    );

    // Get agent ID and update agent status
    const mapping = await db.query(`SELECT agent_id FROM linear_agent_mappings WHERE id = $1`, [mappingId]);
    if (mapping.rows[0]?.agent_id) {
      await db.query(
        `UPDATE agents SET status = $2, updated_at = NOW() WHERE id = $1`,
        [mapping.rows[0].agent_id, agentStatus]
      );
    }

    // Log sync event
    await db.query(
      `INSERT INTO linear_sync_events (mapping_id, direction, event_type, linear_data, sync_status)
       VALUES ($1, 'linear_to_agent', 'status_update', $2, 'success')`,
      [mappingId, JSON.stringify({ state, agentStatus })]
    );
  }

  private async storeLinearComment(mappingId: string, comment: LinearComment): Promise<void> {
    await db.query(
      `INSERT INTO linear_comments (mapping_id, linear_comment_id, content, author_type, author_name, synced_to_linear)
       VALUES ($1, $2, $3, 'human', $4, TRUE)`,
      [mappingId, comment.id, comment.body, comment.user.name]
    );
  }

  private detectDirective(body: string): boolean {
    const directivePatterns = [
      /^@agent\s/i,
      /^\/agent\s/i,
      /please\s+(do|change|update|fix|implement)/i,
      /agent:\s/i,
    ];
    return directivePatterns.some(pattern => pattern.test(body));
  }

  private async createAgentIntervention(agentId: string, comment: LinearComment): Promise<void> {
    await db.query(
      `INSERT INTO agent_interventions (agent_id, intervention_type, intervened_by, message, context)
       VALUES ($1, 'guidance', $2, $3, $4)`,
      [agentId, `Linear: ${comment.user.name}`, comment.body, JSON.stringify({ source: 'linear_comment', commentId: comment.id })]
    );
  }

  private async updateWebhookTimestamp(configId: string): Promise<void> {
    await db.query(
      `UPDATE linear_webhooks
       SET last_received_at = NOW(), total_events_received = total_events_received + 1
       WHERE id = $1`,
      [configId]
    );
  }

  private async logWebhookEvent(
    _webhookId: string,  // Reserved for future filtering
    eventType: string,
    payload: string,
    headers: Record<string, string>,
    status: string,
    errorMessage?: string | null,
    actions?: any[]
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO webhook_event_log (source, event_type, delivery_id, headers, payload, processing_status, error_message, actions_taken, processed_at)
         VALUES ('linear', $1, $2, $3, $4, $5, $6, $7, CASE WHEN $5 != 'pending' THEN NOW() ELSE NULL END)`,
        [
          eventType,
          headers['linear-delivery'] || null,
          JSON.stringify(headers),
          payload,
          status,
          errorMessage || null,
          JSON.stringify(actions || []),
        ]
      );
    } catch (error) {
      this.serviceLogger.error({ error }, 'Failed to log webhook event');
    }
  }

  // ===========================================================================
  // Webhook Configuration Management
  // ===========================================================================

  /**
   * Register a new Linear webhook
   */
  async registerWebhook(linearWebhookId: string, secret: string, label?: string): Promise<string> {
    const result = await db.query(
      `INSERT INTO linear_webhooks (webhook_id, secret_hash, label)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [linearWebhookId, secret, label || linearWebhookId]
    );
    return result.rows[0].id;
  }

  /**
   * List all configured webhooks
   */
  async listWebhooks(): Promise<any[]> {
    const result = await db.query(`
      SELECT id, webhook_id, label, enabled, event_types, created_at, last_received_at, total_events_received
      FROM linear_webhooks
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Enable/disable a webhook
   */
  async setWebhookEnabled(id: string, enabled: boolean): Promise<void> {
    await db.query(
      `UPDATE linear_webhooks SET enabled = $2 WHERE id = $1`,
      [id, enabled]
    );
  }
}
