import { query } from '../db.js';
import type { Agent, CreateAgent, UpdateAgent } from '../../models/Agent.js';
import { AgentSchema } from '../../models/Agent.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/Logger.js';

/**
 * AgentRepository - Data Access Layer for agents table
 *
 * Provides CRUD operations and queries for agent entities.
 * Handles database interactions and ensures data consistency.
 *
 * Architecture: Repository Pattern
 * - Separates data access logic from business logic
 * - Provides type-safe database operations
 * - Centralizes query management
 */
export class AgentRepository {
  private logger = logger.child({ component: 'AgentRepository' });

  /**
   * Create a new agent in the database
   *
   * @param data - Agent creation data
   * @returns Created agent with generated ID and timestamps
   * @throws Error if creation fails
   */
  async create(data: CreateAgent): Promise<Agent> {
    const id = uuidv4();
    const now = new Date();

    try {
      const result = await query<Agent>(
        `INSERT INTO agents (
          id, role, status, depth_level, parent_id, task_description,
          created_at, updated_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          id,
          data.role,
          data.status ?? 'pending',
          data.depth_level ?? 0,
          data.parent_id ?? null,
          data.task_description,
          now,
          now,
          data.completed_at ?? null,
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to create agent: no rows returned');
      }

      const agent = this.mapRowToAgent(result.rows[0]);
      this.logger.info({ agentId: id, role: data.role }, 'Agent created');

      return agent;
    } catch (error) {
      this.logger.error({ error, data }, 'Failed to create agent');
      throw error;
    }
  }

  /**
   * Find an agent by ID
   *
   * @param id - Agent UUID
   * @returns Agent if found
   * @throws Error if agent not found
   */
  async findById(id: string): Promise<Agent> {
    try {
      const result = await query<Agent>(
        'SELECT * FROM agents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error(`Agent not found: ${id}`);
      }

      return this.mapRowToAgent(result.rows[0]);
    } catch (error) {
      this.logger.error({ error, agentId: id }, 'Failed to find agent by ID');
      throw error;
    }
  }

  /**
   * Find all child agents of a parent
   *
   * @param parentId - Parent agent UUID
   * @returns Array of child agents
   */
  async findByParentId(parentId: string): Promise<Agent[]> {
    try {
      const result = await query<Agent>(
        'SELECT * FROM agents WHERE parent_id = $1 ORDER BY created_at ASC',
        [parentId]
      );

      return result.rows.map(row => this.mapRowToAgent(row));
    } catch (error) {
      this.logger.error({ error, parentId }, 'Failed to find agents by parent ID');
      throw error;
    }
  }

  /**
   * Find agents by status
   *
   * @param status - Agent status to filter by
   * @returns Array of agents with matching status
   */
  async findByStatus(status: string): Promise<Agent[]> {
    try {
      const result = await query<Agent>(
        'SELECT * FROM agents WHERE status = $1 ORDER BY created_at ASC',
        [status]
      );

      return result.rows.map(row => this.mapRowToAgent(row));
    } catch (error) {
      this.logger.error({ error, status }, 'Failed to find agents by status');
      throw error;
    }
  }

  /**
   * Update an agent
   *
   * @param id - Agent UUID
   * @param data - Fields to update
   * @returns Updated agent
   * @throws Error if agent not found
   */
  async update(id: string, data: UpdateAgent): Promise<Agent> {
    try {
      // Build dynamic UPDATE query based on provided fields
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        values.push(data.role);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(data.status);
      }
      if (data.depth_level !== undefined) {
        updates.push(`depth_level = $${paramIndex++}`);
        values.push(data.depth_level);
      }
      if (data.parent_id !== undefined) {
        updates.push(`parent_id = $${paramIndex++}`);
        values.push(data.parent_id);
      }
      if (data.task_description !== undefined) {
        updates.push(`task_description = $${paramIndex++}`);
        values.push(data.task_description);
      }
      if (data.completed_at !== undefined) {
        updates.push(`completed_at = $${paramIndex++}`);
        values.push(data.completed_at);
      }
      if (data.updated_at !== undefined) {
        updates.push(`updated_at = $${paramIndex++}`);
        values.push(data.updated_at);
      }

      // Always update updated_at
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updates.length === 0) {
        // No fields to update, just return current state
        return this.findById(id);
      }

      values.push(id);
      const result = await query<Agent>(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Agent not found: ${id}`);
      }

      const agent = this.mapRowToAgent(result.rows[0]);
      this.logger.info({ agentId: id, updates: Object.keys(data) }, 'Agent updated');

      return agent;
    } catch (error) {
      this.logger.error({ error, agentId: id, data }, 'Failed to update agent');
      throw error;
    }
  }

  /**
   * Delete an agent (soft delete - not typically used, CASCADE handles cleanup)
   *
   * @param id - Agent UUID
   * @throws Error if deletion fails
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await query(
        'DELETE FROM agents WHERE id = $1',
        [id]
      );

      if (result.rowCount === 0) {
        throw new Error(`Agent not found: ${id}`);
      }

      this.logger.info({ agentId: id }, 'Agent deleted');
    } catch (error) {
      this.logger.error({ error, agentId: id }, 'Failed to delete agent');
      throw error;
    }
  }

  /**
   * Get all agents at a specific depth level
   *
   * @param depthLevel - Hierarchical depth level
   * @returns Array of agents at that depth
   */
  async findByDepthLevel(depthLevel: number): Promise<Agent[]> {
    try {
      const result = await query<Agent>(
        'SELECT * FROM agents WHERE depth_level = $1 ORDER BY created_at ASC',
        [depthLevel]
      );

      return result.rows.map(row => this.mapRowToAgent(row));
    } catch (error) {
      this.logger.error({ error, depthLevel }, 'Failed to find agents by depth level');
      throw error;
    }
  }

  /**
   * Get total agent count
   *
   * @returns Total number of agents
   */
  async count(): Promise<number> {
    try {
      const result = await query<{ count: string }>(
        'SELECT COUNT(*) as count FROM agents'
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      this.logger.error({ error }, 'Failed to count agents');
      throw error;
    }
  }

  /**
   * Get agent hierarchy tree starting from a root agent
   *
   * @param rootId - Root agent UUID
   * @returns Array of agents in hierarchical order
   */
  async getHierarchy(rootId: string): Promise<Agent[]> {
    try {
      // Recursive CTE to traverse the hierarchy
      const result = await query<Agent>(
        `WITH RECURSIVE agent_tree AS (
          -- Base case: start with root agent
          SELECT * FROM agents WHERE id = $1
          UNION ALL
          -- Recursive case: get children
          SELECT a.* FROM agents a
          INNER JOIN agent_tree at ON a.parent_id = at.id
        )
        SELECT * FROM agent_tree ORDER BY depth_level, created_at`,
        [rootId]
      );

      return result.rows.map(row => this.mapRowToAgent(row));
    } catch (error) {
      this.logger.error({ error, rootId }, 'Failed to get agent hierarchy');
      throw error;
    }
  }

  /**
   * Get subordinates (child agents) using JOIN with hierarchies table
   *
   * This method retrieves all subordinate agents for a given parent by joining
   * with the hierarchies table. Supports optional depth-based recursion and
   * status filtering.
   *
   * @param parentId - Parent agent UUID
   * @param options - Optional query parameters
   * @param options.recursive - If true, retrieve all descendants (children, grandchildren, etc.)
   * @param options.maxDepth - Maximum depth to traverse (only with recursive=true)
   * @param options.status - Filter by agent status
   * @returns Array of subordinate agents
   */
  async getSubordinates(
    parentId: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      status?: string;
    }
  ): Promise<Agent[]> {
    try {
      const { recursive = false, maxDepth, status } = options || {};

      if (recursive) {
        // Recursive query to get all descendants
        const params: any[] = [parentId];
        let paramIndex = 2;

        // Build WHERE conditions
        const whereConditions: string[] = [];
        if (status !== undefined) {
          whereConditions.push(`a.status = $${paramIndex++}`);
          params.push(status);
        }
        if (maxDepth !== undefined) {
          whereConditions.push(`a.depth_level <= (SELECT depth_level FROM agents WHERE id = $1) + $${paramIndex++}`);
          params.push(maxDepth);
        }

        const whereClause = whereConditions.length > 0
          ? ` AND ${whereConditions.join(' AND ')}`
          : '';

        const result = await query<Agent>(
          `WITH RECURSIVE descendants AS (
            -- Base case: direct children
            SELECT h.child_id
            FROM hierarchies h
            WHERE h.parent_id = $1

            UNION ALL

            -- Recursive case: children of children
            SELECT h.child_id
            FROM hierarchies h
            INNER JOIN descendants d ON h.parent_id = d.child_id
          )
          SELECT a.* FROM agents a
          INNER JOIN descendants d ON a.id = d.child_id${whereClause}
          ORDER BY a.depth_level, a.created_at`,
          params
        );

        return result.rows.map(row => this.mapRowToAgent(row));
      } else {
        // Non-recursive: only direct children
        const params: any[] = [parentId];
        let paramIndex = 2;

        // Build WHERE conditions
        const whereConditions: string[] = [];
        if (status !== undefined) {
          whereConditions.push(`a.status = $${paramIndex++}`);
          params.push(status);
        }

        const whereClause = whereConditions.length > 0
          ? ` AND ${whereConditions.join(' AND ')}`
          : '';

        const result = await query<Agent>(
          `SELECT a.* FROM agents a
           INNER JOIN hierarchies h ON a.id = h.child_id
           WHERE h.parent_id = $1${whereClause}
           ORDER BY a.created_at`,
          params
        );

        return result.rows.map(row => this.mapRowToAgent(row));
      }
    } catch (error) {
      this.logger.error(
        { error, parentId, options },
        'Failed to get subordinates'
      );
      throw error;
    }
  }

  /**
   * Map database row to Agent model with proper type conversion
   *
   * @param row - Raw database row
   * @returns Typed Agent object
   */
  private mapRowToAgent(row: any): Agent {
    return AgentSchema.parse({
      id: row.id,
      role: row.role,
      status: row.status,
      depth_level: row.depth_level,
      parent_id: row.parent_id,
      task_description: row.task_description,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
    });
  }
}

// Export singleton instance
export const agentRepository = new AgentRepository();
