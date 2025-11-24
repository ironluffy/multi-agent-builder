import { pool } from '../db.js';
import { logger } from '../../utils/Logger.js';

/**
 * Budget data structure based on database schema
 */
export interface Budget {
  id: string;
  agent_id: string;
  allocated: number;
  used: number;
  reserved: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Budget Repository
 * Manages budget allocation and tracking for agents
 */
export class BudgetRepository {
  /**
   * Create a new budget record
   */
  async create(agent_id: string, allocated: number): Promise<Budget> {
    const query = `
      INSERT INTO budgets (agent_id, allocated, used, reserved)
      VALUES ($1, $2, 0, 0)
      RETURNING *
    `;

    try {
      const result = await pool.query<Budget>(query, [agent_id, allocated]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create budget record');
      }

      logger.info({ agent_id, allocated }, 'Budget created');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, agent_id, allocated }, 'Failed to create budget');
      throw error;
    }
  }

  /**
   * Get budget by agent ID
   */
  async getByAgentId(agent_id: string): Promise<Budget | null> {
    const query = `
      SELECT * FROM budgets
      WHERE agent_id = $1
    `;

    try {
      const result = await pool.query<Budget>(query, [agent_id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get budget');
      throw error;
    }
  }

  /**
   * Increment used tokens for an agent
   * Validates that the new total doesn't exceed allocated + reserved
   */
  async incrementUsed(agent_id: string, tokens: number): Promise<Budget> {
    const query = `
      UPDATE budgets
      SET used = used + $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $1
        AND used + $2 + reserved <= allocated
      RETURNING *
    `;

    try {
      const result = await pool.query<Budget>(query, [agent_id, tokens]);

      if (result.rows.length === 0) {
        // Check if budget exists
        const budget = await this.getByAgentId(agent_id);
        if (!budget) {
          throw new Error(`No budget found for agent ${agent_id}`);
        }

        // Budget exceeded
        throw new Error(
          `Insufficient budget for agent ${agent_id}. ` +
          `Available: ${budget.allocated - budget.used - budget.reserved}, ` +
          `Requested: ${tokens}`
        );
      }

      logger.debug({ agent_id, tokens, new_used: result.rows[0].used }, 'Budget consumed');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, agent_id, tokens }, 'Failed to consume budget');
      throw error;
    }
  }

  /**
   * Get remaining available budget (allocated - used - reserved)
   */
  async getRemainingBudget(agent_id: string): Promise<number> {
    const query = `
      SELECT (allocated - used - reserved) as remaining
      FROM budgets
      WHERE agent_id = $1
    `;

    try {
      const result = await pool.query<{ remaining: number }>(query, [agent_id]);

      if (result.rows.length === 0) {
        throw new Error(`No budget found for agent ${agent_id}`);
      }

      return result.rows[0].remaining;
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get remaining budget');
      throw error;
    }
  }

  /**
   * Get budget hierarchy for entire agent tree
   *
   * Uses recursive CTE to traverse the agent hierarchy and fetch budget
   * information for each agent in the tree.
   *
   * @param root_agent_id - Root agent UUID to start hierarchy from
   * @param options - Optional configuration (maxDepth to limit recursion depth)
   * @returns Array of budgets with hierarchy information (depth_level, parent_id)
   */
  async getBudgetHierarchy(
    root_agent_id: string,
    options?: { maxDepth?: number }
  ): Promise<Array<Budget & { depth_level: number; parent_id: string | null }>> {
    const maxDepth = options?.maxDepth ?? 10;

    const query = `
      WITH RECURSIVE budget_tree AS (
        -- Base case: root agent
        SELECT
          b.*,
          a.depth_level,
          a.parent_id,
          0 AS recursion_depth
        FROM budgets b
        JOIN agents a ON b.agent_id = a.id
        WHERE a.id = $1

        UNION ALL

        -- Recursive case: children
        SELECT
          b.*,
          a.depth_level,
          a.parent_id,
          bt.recursion_depth + 1
        FROM budgets b
        JOIN agents a ON b.agent_id = a.id
        JOIN budget_tree bt ON a.parent_id = bt.agent_id
        WHERE bt.recursion_depth < $2
      )
      SELECT
        id,
        agent_id,
        allocated,
        used,
        reserved,
        created_at,
        updated_at,
        depth_level,
        parent_id
      FROM budget_tree
      ORDER BY depth_level ASC, created_at ASC
    `;

    try {
      const result = await pool.query<Budget & { depth_level: number; parent_id: string | null }>(
        query,
        [root_agent_id, maxDepth]
      );

      logger.debug(
        { root_agent_id, count: result.rows.length },
        'Retrieved budget hierarchy'
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, root_agent_id }, 'Failed to get budget hierarchy');
      throw error;
    }
  }

  /**
   * Delete budget record (usually when agent is deleted)
   */
  async delete(agent_id: string): Promise<void> {
    const query = `
      DELETE FROM budgets
      WHERE agent_id = $1
    `;

    try {
      await pool.query(query, [agent_id]);
      logger.info({ agent_id }, 'Budget deleted');
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to delete budget');
      throw error;
    }
  }
}
