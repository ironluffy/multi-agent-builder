import { v4 as uuidv4 } from 'uuid';
import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';
import { GitWorktree } from '../infrastructure/GitWorktree.js';
import { WorkspaceRepository } from '../database/repositories/WorkspaceRepository.js';
import { AgentExecutor } from '../execution/AgentExecutor.js';
import { WorkflowEngine } from '../core/WorkflowEngine.js';
import type { Agent, AgentStatusType } from '../models/Agent.js';
import type { Budget } from '../models/Budget.js';
import type { Message } from '../models/Message.js';

/**
 * Agent Service
 * Handles agent lifecycle management, communication, and status tracking
 */
export class AgentService {
  private gitWorktree: GitWorktree;
  private workspaceRepo: WorkspaceRepository;
  private executor: AgentExecutor;
  private workflowEngine?: WorkflowEngine;

  constructor() {
    this.gitWorktree = new GitWorktree();
    this.workspaceRepo = new WorkspaceRepository();
    this.executor = new AgentExecutor();
  }

  /**
   * Set workflow engine for post-execution notifications
   * Must be called after construction to avoid circular dependency
   */
  setWorkflowEngine(engine: WorkflowEngine): void {
    this.workflowEngine = engine;
  }

  /**
   * Spawn a new agent with the given role and task
   *
   * @param role - The role/type of the agent (e.g., 'assistant', 'researcher', 'coder')
   * @param taskDescription - Description of the task the agent should perform
   * @param tokenLimit - Maximum tokens this agent can use (default: 100000)
   * @param parentId - Optional parent agent ID for hierarchical relationships
   * @returns The ID of the newly created agent
   */
  async spawnAgent(
    role: string,
    taskDescription: string,
    tokenLimit: number = 100000,
    parentId?: string
  ): Promise<string> {
    // Validate token limit
    if (tokenLimit <= 0) {
      throw new Error('Token limit must be greater than 0');
    }

    const agentId = uuidv4();
    const now = new Date();

    try {
      await db.transaction(async (client) => {
        // Determine depth level and validate parent budget if spawning child
        let depthLevel = 0;
        if (parentId) {
          const parentResult = await client.query<Agent>(
            'SELECT depth_level FROM agents WHERE id = $1',
            [parentId]
          );
          if (parentResult.rows.length > 0) {
            depthLevel = parentResult.rows[0].depth_level + 1;
          }

          // Validate parent has sufficient budget before spawning child
          const parentBudgetResult = await client.query<Budget>(
            'SELECT allocated, used, reserved FROM budgets WHERE agent_id = $1',
            [parentId]
          );

          if (parentBudgetResult.rows.length === 0) {
            throw new Error(
              `Cannot spawn child agent: parent ${parentId} has no budget record`
            );
          }

          const parentBudget = parentBudgetResult.rows[0];
          const availableParentBudget =
            parentBudget.allocated - parentBudget.used - parentBudget.reserved;

          if (availableParentBudget < tokenLimit) {
            throw new Error(
              `Cannot spawn child agent: parent ${parentId} has insufficient budget. ` +
              `Available: ${availableParentBudget}, Required: ${tokenLimit}`
            );
          }

          logger.debug(
            {
              parent_id: parentId,
              available_budget: availableParentBudget,
              requested: tokenLimit,
            },
            'Parent budget validation passed'
          );
        }

        // Create agent
        await client.query(
          `INSERT INTO agents (id, role, status, depth_level, parent_id, task_description, created_at, updated_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [agentId, role, 'pending', depthLevel, parentId || null, taskDescription, now, now, null]
        );

        // Create budget
        const budgetId = uuidv4();
        await client.query(
          `INSERT INTO budgets (id, agent_id, allocated, used, reserved, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [budgetId, agentId, tokenLimit, 0, 0, now, now]
        );

        logger.info({ agentId, role, parentId, depthLevel }, 'Agent spawned successfully');
      });

      // Create isolated workspace for agent (outside transaction)
      try {
        const worktreeInfo = await this.gitWorktree.createWorktree(agentId);
        await this.workspaceRepo.create(
          agentId,
          worktreeInfo.path,
          worktreeInfo.branch
        );

        logger.info(
          {
            agentId,
            worktree_path: worktreeInfo.path,
            branch: worktreeInfo.branch,
          },
          'Workspace created for agent'
        );
      } catch (workspaceError) {
        logger.warn(
          { error: workspaceError, agentId },
          'Failed to create workspace, agent will run without isolated workspace'
        );
        // Don't fail agent spawn if workspace creation fails
        // Agent can still operate without isolated workspace
      }

      return agentId;
    } catch (error) {
      logger.error({ error, agentId, role }, 'Failed to spawn agent');
      throw error;
    }
  }

  /**
   * Get the current status of an agent
   *
   * @param agentId - The ID of the agent
   * @returns Agent status information
   */
  async getAgentStatus(agentId: string): Promise<Agent> {
    try {
      const result = await db.query<Agent>(
        'SELECT * FROM agents WHERE id = $1',
        [agentId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to get agent status');
      throw error;
    }
  }

  /**
   * Update agent status
   *
   * @param agentId - The ID of the agent
   * @param status - The new status
   */
  async updateAgentStatus(agentId: string, status: AgentStatusType): Promise<void> {
    try {
      const now = new Date();
      const completedAt = status === 'completed' || status === 'failed' || status === 'terminated' ? now : null;

      await db.query(
        'UPDATE agents SET status = $1, updated_at = $2, completed_at = $3 WHERE id = $4',
        [status, now, completedAt, agentId]
      );

      logger.info({ agentId, status }, 'Agent status updated');
    } catch (error) {
      logger.error({ error, agentId, status }, 'Failed to update agent status');
      throw error;
    }
  }

  /**
   * Store a message for an agent
   *
   * @param agentId - The ID of the agent
   * @param role - The role of the message sender
   * @param content - The message content
   * @param metadata - Optional metadata
   * @returns The ID of the created message
   */
  async storeMessage(
    agentId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    try {
      const messageId = uuidv4();
      const now = new Date();

      await db.query(
        `INSERT INTO messages (id, agent_id, role, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, agentId, role, content, JSON.stringify(metadata || null), now]
      );

      logger.debug({ messageId, agentId, role }, 'Message stored');
      return messageId;
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to store message');
      throw error;
    }
  }

  /**
   * Get all messages for an agent
   *
   * @param agentId - The ID of the agent
   * @param limit - Maximum number of messages to return (default: 100)
   * @returns Array of messages
   */
  async getMessages(agentId: string, limit: number = 100): Promise<Message[]> {
    try {
      const result = await db.query<Message>(
        'SELECT * FROM messages WHERE agent_id = $1 ORDER BY created_at ASC LIMIT $2',
        [agentId, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to get messages');
      throw error;
    }
  }

  /**
   * Get budget information for an agent
   *
   * @param agentId - The ID of the agent
   * @returns Budget information
   */
  async getBudget(agentId: string): Promise<Budget> {
    try {
      const result = await db.query<Budget>(
        'SELECT * FROM budgets WHERE agent_id = $1',
        [agentId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Budget not found for agent: ${agentId}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to get budget');
      throw error;
    }
  }

  /**
   * Update token usage for an agent
   *
   * @param agentId - The ID of the agent
   * @param tokensUsed - Number of tokens used
   * @param costPerToken - Cost per token (default: 0.000003 for Claude Sonnet)
   */
  async updateTokenUsage(
    agentId: string,
    tokensUsed: number,
    costPerToken: number = 0.000003
  ): Promise<void> {
    try {
      const cost = tokensUsed * costPerToken;
      const now = new Date();

      await db.query(
        `UPDATE budgets
         SET used = used + $1,
             updated_at = $2
         WHERE agent_id = $3`,
        [tokensUsed, now, agentId]
      );

      logger.debug({ agentId, tokensUsed, cost }, 'Token usage updated');
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to update token usage');
      throw error;
    }
  }

  /**
   * Get all child agents for a parent agent
   *
   * @param parentId - The ID of the parent agent
   * @returns Array of child agents
   */
  async getChildAgents(parentId: string): Promise<Agent[]> {
    try {
      const result = await db.query<Agent>(
        'SELECT * FROM agents WHERE parent_id = $1 ORDER BY created_at ASC',
        [parentId]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, parentId }, 'Failed to get child agents');
      throw error;
    }
  }

  /**
   * Check if agent has exceeded budget
   *
   * @param agentId - The ID of the agent
   * @returns True if budget exceeded, false otherwise
   */
  async isBudgetExceeded(agentId: string): Promise<boolean> {
    try {
      const budget = await this.getBudget(agentId);
      return budget.used >= budget.allocated;
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to check budget');
      throw error;
    }
  }

  /**
   * Get a summary of all agents in the system
   *
   * @returns Summary statistics
   */
  async getSystemSummary(): Promise<{
    totalAgents: number;
    byStatus: Record<string, number>;
    totalTokensUsed: number;
    totalEstimatedCost: number;
  }> {
    try {
      // Get agent counts by status
      const statusResult = await db.query<{ status: string; count: string }>(
        'SELECT status, COUNT(*) as count FROM agents GROUP BY status'
      );

      const byStatus: Record<string, number> = {};
      statusResult.rows.forEach(row => {
        byStatus[row.status] = parseInt(row.count, 10);
      });

      // Get total agents
      const totalResult = await db.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM agents'
      );
      const totalAgents = parseInt(totalResult.rows[0].count, 10);

      // Get budget totals
      const budgetResult = await db.query<{ total_used: string }>(
        'SELECT SUM(used) as total_used FROM budgets'
      );

      const totalTokensUsed = parseInt(budgetResult.rows[0]?.total_used || '0', 10);
      const totalEstimatedCost = totalTokensUsed * 0.000003; // Estimated cost per token

      return {
        totalAgents,
        byStatus,
        totalTokensUsed,
        totalEstimatedCost,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get system summary');
      throw error;
    }
  }

  /**
   * Execute an agent's task using the AgentExecutor
   * This method runs the agent, updates its status, and notifies the workflow engine
   *
   * @param agentId - The ID of the agent to execute
   */
  async runAgent(agentId: string): Promise<void> {
    logger.info({ agentId }, 'Starting agent execution');

    try {
      // Update status to executing
      await this.updateAgentStatus(agentId, 'executing');

      // Execute the agent using AgentExecutor
      const result = await this.executor.execute(agentId);

      if (result.success) {
        // Store result and mark completed
        await db.query(
          `UPDATE agents SET status = $1, result = $2, completed_at = $3, updated_at = $4
           WHERE id = $5`,
          ['completed', JSON.stringify({ output: result.output }), new Date(), new Date(), agentId]
        );

        // Update budget with tokens used
        await db.query(
          'UPDATE budgets SET used = used + $1, updated_at = $2 WHERE agent_id = $3',
          [result.tokensUsed, new Date(), agentId]
        );

        logger.info(
          {
            agentId,
            tokensUsed: result.tokensUsed,
            costUsd: result.costUsd,
            durationMs: result.durationMs,
          },
          'Agent execution completed successfully'
        );

        // Notify workflow engine if available
        if (this.workflowEngine) {
          await this.workflowEngine.processCompletedNode(agentId, { output: result.output });
        }
      } else {
        // Mark as failed
        await db.query(
          `UPDATE agents SET status = $1, error_message = $2, completed_at = $3, updated_at = $4
           WHERE id = $5`,
          ['failed', result.error || 'Unknown error', new Date(), new Date(), agentId]
        );

        logger.error(
          { agentId, error: result.error },
          'Agent execution failed'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark agent as failed
      await db.query(
        `UPDATE agents SET status = $1, error_message = $2, completed_at = $3, updated_at = $4
         WHERE id = $5`,
        ['failed', errorMessage, new Date(), new Date(), agentId]
      );

      logger.error({ error, agentId }, 'Agent execution crashed');
      throw error;
    }
  }
}
