/**
 * AgentTracer - Captures detailed execution traces for monitoring
 *
 * This class logs every aspect of agent execution to enable:
 * - Real-time monitoring of agent activity
 * - Debugging and troubleshooting
 * - Performance analysis
 * - Decision-making transparency
 * - Complete execution replay
 */

import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export interface TraceMetadata {
  [key: string]: any;
}

export interface ToolUsageInfo {
  toolName: string;
  input: any;
  output: any;
  success: boolean;
  executionTimeMs: number;
  errorMessage?: string;
  filesRead?: string[];
  filesWritten?: string[];
  filesModified?: string[];
}

export interface DecisionInfo {
  decisionType: 'task_decomposition' | 'spawn_child' | 'file_operation' | 'approach_selection' | 'reasoning';
  reasoning: string;
  actionTaken?: string;
  confidence?: number;
  childAgentId?: string;
  affectedFiles?: string[];
}

export interface EventInfo {
  eventType: 'spawned' | 'started' | 'status_change' | 'child_spawned' | 'completed' | 'failed' | 'execution_started' | 'tool_use';
  message: string;
  data?: any;
}

export class AgentTracer {
  private agentId: string;
  private traceIndex = 0;
  private tracerLogger = logger.child({ component: 'AgentTracer' });

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  /**
   * Log a trace entry from SDK message
   */
  async logTrace(
    messageType: string,
    content: string,
    metadata: TraceMetadata = {},
    tokens?: { input: number; output: number }
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO agent_traces
         (agent_id, trace_index, message_type, content, metadata, input_tokens, output_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          this.agentId,
          this.traceIndex++,
          messageType,
          content,
          JSON.stringify(metadata),
          tokens?.input || null,
          tokens?.output || null,
        ]
      );

      this.tracerLogger.debug(
        {
          agentId: this.agentId,
          traceIndex: this.traceIndex - 1,
          messageType,
        },
        'Trace logged'
      );
    } catch (error) {
      this.tracerLogger.error(
        { error, agentId: this.agentId },
        'Failed to log trace'
      );
    }
  }

  /**
   * Log tool usage
   */
  async logToolUse(info: ToolUsageInfo): Promise<void> {
    try {
      await db.query(
        `INSERT INTO agent_tool_usage
         (agent_id, tool_name, tool_input, tool_output, execution_time_ms, success, error_message, files_read, files_written, files_modified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.agentId,
          info.toolName,
          JSON.stringify(info.input),
          JSON.stringify(info.output),
          info.executionTimeMs,
          info.success,
          info.errorMessage || null,
          info.filesRead || null,
          info.filesWritten || null,
          info.filesModified || null,
        ]
      );

      this.tracerLogger.debug(
        {
          agentId: this.agentId,
          toolName: info.toolName,
          success: info.success,
        },
        'Tool usage logged'
      );
    } catch (error) {
      this.tracerLogger.error(
        { error, agentId: this.agentId },
        'Failed to log tool usage'
      );
    }
  }

  /**
   * Log a decision or reasoning
   */
  async logDecision(info: DecisionInfo): Promise<void> {
    try {
      await db.query(
        `INSERT INTO agent_decisions
         (agent_id, decision_type, reasoning, action_taken, confidence, child_agent_id, affected_files)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          this.agentId,
          info.decisionType,
          info.reasoning,
          info.actionTaken || null,
          info.confidence || null,
          info.childAgentId || null,
          info.affectedFiles || null,
        ]
      );

      this.tracerLogger.debug(
        {
          agentId: this.agentId,
          decisionType: info.decisionType,
        },
        'Decision logged'
      );
    } catch (error) {
      this.tracerLogger.error(
        { error, agentId: this.agentId },
        'Failed to log decision'
      );
    }
  }

  /**
   * Log an event
   */
  async logEvent(info: EventInfo): Promise<void> {
    try {
      await db.query(
        `INSERT INTO agent_events (agent_id, event_type, message, event_data)
         VALUES ($1, $2, $3, $4)`,
        [
          this.agentId,
          info.eventType,
          info.message,
          JSON.stringify(info.data || {}),
        ]
      );

      this.tracerLogger.debug(
        {
          agentId: this.agentId,
          eventType: info.eventType,
        },
        'Event logged'
      );
    } catch (error) {
      this.tracerLogger.error(
        { error, agentId: this.agentId },
        'Failed to log event'
      );
    }
  }

  /**
   * Extract content from SDK message
   */
  extractContent(message: SDKMessage): string {
    if (message.type === 'assistant') {
      const content = message.message.content;
      if (!Array.isArray(content)) return '';

      return content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');
    }

    if (message.type === 'result') {
      return 'subtype' in message ? `Result: ${message.subtype}` : 'Result';
    }

    return JSON.stringify(message).substring(0, 500);
  }

  /**
   * Extract thinking/reasoning from assistant message
   */
  extractThinking(message: SDKMessage): string | null {
    if (message.type !== 'assistant') return null;

    const content = message.message.content;
    if (!Array.isArray(content)) return null;

    // Look for thinking blocks or text that appears to be reasoning
    for (const block of content) {
      if (block.type === 'text' && 'text' in block) {
        const text = block.text;
        // Simple heuristic: if text contains reasoning keywords
        if (
          text.includes('I will') ||
          text.includes('Let me') ||
          text.includes('First') ||
          text.includes('because') ||
          text.includes('reasoning')
        ) {
          return text.substring(0, 1000); // Limit length
        }
      }
    }

    return null;
  }

  /**
   * Extract tool use information from SDK message
   */
  extractToolUse(message: SDKMessage): { name: string; input: any } | null {
    if (message.type !== 'assistant') return null;

    const content = message.message.content;
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      if (block.type === 'tool_use') {
        return {
          name: 'name' in block ? block.name : 'unknown',
          input: 'input' in block ? block.input : {},
        };
      }
    }

    return null;
  }

  /**
   * Get current trace count
   */
  getTraceCount(): number {
    return this.traceIndex;
  }

  /**
   * Static method to get traces for an agent
   */
  static async getAgentTraces(agentId: string, limit: number = 100): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM agent_traces
       WHERE agent_id = $1
       ORDER BY trace_index DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  /**
   * Static method to get recent tool usage
   */
  static async getAgentToolUsage(agentId: string, limit: number = 50): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM agent_tool_usage
       WHERE agent_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  /**
   * Static method to get agent decisions
   */
  static async getAgentDecisions(agentId: string, limit: number = 50): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM agent_decisions
       WHERE agent_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  /**
   * Static method to get agent events
   */
  static async getAgentEvents(agentId: string, limit: number = 100): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM agent_events
       WHERE agent_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  /**
   * Static method to get agent summary
   */
  static async getAgentSummary(agentId: string): Promise<any> {
    const result = await db.query(
      `SELECT * FROM agent_monitoring_view WHERE id = $1`,
      [agentId]
    );
    return result.rows[0] || null;
  }
}
