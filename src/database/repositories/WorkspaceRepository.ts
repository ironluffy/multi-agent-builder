import { pool } from '../db.js';
import { logger } from '../../utils/Logger.js';

/**
 * Workspace isolation status enum
 */
export type IsolationStatus = 'active' | 'merged' | 'deleted';

/**
 * Workspace data structure based on database schema
 */
export interface Workspace {
  id: string;
  agent_id: string;
  worktree_path: string;
  branch_name: string;
  isolation_status: IsolationStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Workspace Repository
 * Manages workspace CRUD operations and status tracking
 *
 * Each workspace represents an isolated Git worktree for an agent:
 * - One workspace per agent (unique agent_id)
 * - Unique worktree path on filesystem
 * - Dedicated Git branch per workspace
 * - Lifecycle tracking via isolation_status
 */
export class WorkspaceRepository {
  private workspaceLogger = logger.child({ component: 'WorkspaceRepository' });

  /**
   * Create a new workspace
   *
   * @param agent_id - Agent UUID
   * @param worktree_path - Absolute path to worktree directory
   * @param branch_name - Git branch name for this workspace
   * @returns Created workspace
   */
  async create(
    agent_id: string,
    worktree_path: string,
    branch_name: string
  ): Promise<Workspace> {
    const query = `
      INSERT INTO workspaces (agent_id, worktree_path, branch_name, isolation_status)
      VALUES ($1, $2, $3, 'active')
      RETURNING *
    `;

    try {
      const result = await pool.query<Workspace>(query, [
        agent_id,
        worktree_path,
        branch_name,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create workspace');
      }

      this.workspaceLogger.info(
        {
          workspace_id: result.rows[0].id,
          agent_id,
          branch_name,
        },
        'Workspace created'
      );

      return result.rows[0];
    } catch (error) {
      this.workspaceLogger.error(
        { error, agent_id, worktree_path },
        'Failed to create workspace'
      );
      throw error;
    }
  }

  /**
   * Find workspace by ID
   *
   * @param workspace_id - Workspace UUID
   * @returns Workspace if found, null otherwise
   */
  async findById(workspace_id: string): Promise<Workspace | null> {
    const query = `
      SELECT * FROM workspaces
      WHERE id = $1
    `;

    try {
      const result = await pool.query<Workspace>(query, [workspace_id]);
      return result.rows[0] || null;
    } catch (error) {
      this.workspaceLogger.error(
        { error, workspace_id },
        'Failed to find workspace by ID'
      );
      throw error;
    }
  }

  /**
   * Find workspace by agent ID
   *
   * @param agent_id - Agent UUID
   * @returns Workspace if found, null otherwise
   */
  async findByAgentId(agent_id: string): Promise<Workspace | null> {
    const query = `
      SELECT * FROM workspaces
      WHERE agent_id = $1
    `;

    try {
      const result = await pool.query<Workspace>(query, [agent_id]);
      return result.rows[0] || null;
    } catch (error) {
      this.workspaceLogger.error(
        { error, agent_id },
        'Failed to find workspace by agent ID'
      );
      throw error;
    }
  }

  /**
   * Find workspace by worktree path
   *
   * @param worktree_path - Absolute path to worktree
   * @returns Workspace if found, null otherwise
   */
  async findByPath(worktree_path: string): Promise<Workspace | null> {
    const query = `
      SELECT * FROM workspaces
      WHERE worktree_path = $1
    `;

    try {
      const result = await pool.query<Workspace>(query, [worktree_path]);
      return result.rows[0] || null;
    } catch (error) {
      this.workspaceLogger.error(
        { error, worktree_path },
        'Failed to find workspace by path'
      );
      throw error;
    }
  }

  /**
   * Update workspace status
   *
   * @param workspace_id - Workspace UUID
   * @param status - New isolation status
   * @returns Updated workspace
   */
  async updateStatus(
    workspace_id: string,
    status: IsolationStatus
  ): Promise<Workspace> {
    const query = `
      UPDATE workspaces
      SET isolation_status = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query<Workspace>(query, [workspace_id, status]);

      if (result.rows.length === 0) {
        throw new Error(`Workspace ${workspace_id} not found`);
      }

      this.workspaceLogger.info(
        { workspace_id, status },
        'Workspace status updated'
      );

      return result.rows[0];
    } catch (error) {
      this.workspaceLogger.error(
        { error, workspace_id, status },
        'Failed to update workspace status'
      );
      throw error;
    }
  }

  /**
   * Update workspace by agent ID
   *
   * @param agent_id - Agent UUID
   * @param updates - Fields to update
   * @returns Updated workspace
   */
  async updateByAgentId(
    agent_id: string,
    updates: {
      worktree_path?: string;
      branch_name?: string;
      isolation_status?: IsolationStatus;
    }
  ): Promise<Workspace> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.worktree_path !== undefined) {
      fields.push(`worktree_path = $${paramIndex++}`);
      values.push(updates.worktree_path);
    }

    if (updates.branch_name !== undefined) {
      fields.push(`branch_name = $${paramIndex++}`);
      values.push(updates.branch_name);
    }

    if (updates.isolation_status !== undefined) {
      fields.push(`isolation_status = $${paramIndex++}`);
      values.push(updates.isolation_status);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    // Always update timestamp
    fields.push('updated_at = CURRENT_TIMESTAMP');

    values.push(agent_id);

    const query = `
      UPDATE workspaces
      SET ${fields.join(', ')}
      WHERE agent_id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query<Workspace>(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Workspace for agent ${agent_id} not found`);
      }

      this.workspaceLogger.info(
        { agent_id, updates },
        'Workspace updated'
      );

      return result.rows[0];
    } catch (error) {
      this.workspaceLogger.error(
        { error, agent_id, updates },
        'Failed to update workspace'
      );
      throw error;
    }
  }

  /**
   * Get all active workspaces
   *
   * @returns Array of active workspaces
   */
  async getActive(): Promise<Workspace[]> {
    const query = `
      SELECT * FROM workspaces
      WHERE isolation_status = 'active'
      ORDER BY created_at DESC
    `;

    try {
      const result = await pool.query<Workspace>(query);
      return result.rows;
    } catch (error) {
      this.workspaceLogger.error({ error }, 'Failed to get active workspaces');
      throw error;
    }
  }

  /**
   * Get all workspaces with a specific status
   *
   * @param status - Isolation status to filter by
   * @returns Array of workspaces
   */
  async getByStatus(status: IsolationStatus): Promise<Workspace[]> {
    const query = `
      SELECT * FROM workspaces
      WHERE isolation_status = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await pool.query<Workspace>(query, [status]);
      return result.rows;
    } catch (error) {
      this.workspaceLogger.error(
        { error, status },
        'Failed to get workspaces by status'
      );
      throw error;
    }
  }

  /**
   * Delete workspace by ID
   *
   * @param workspace_id - Workspace UUID
   * @returns True if deletion succeeded
   */
  async delete(workspace_id: string): Promise<boolean> {
    const query = `
      DELETE FROM workspaces
      WHERE id = $1
    `;

    try {
      const result = await pool.query(query, [workspace_id]);

      if (result.rowCount === 0) {
        this.workspaceLogger.warn(
          { workspace_id },
          'Workspace not found for deletion'
        );
        return false;
      }

      this.workspaceLogger.info({ workspace_id }, 'Workspace deleted');
      return true;
    } catch (error) {
      this.workspaceLogger.error(
        { error, workspace_id },
        'Failed to delete workspace'
      );
      throw error;
    }
  }

  /**
   * Delete workspace by agent ID
   *
   * @param agent_id - Agent UUID
   * @returns True if deletion succeeded
   */
  async deleteByAgentId(agent_id: string): Promise<boolean> {
    const query = `
      DELETE FROM workspaces
      WHERE agent_id = $1
    `;

    try {
      const result = await pool.query(query, [agent_id]);

      if (result.rowCount === 0) {
        this.workspaceLogger.warn(
          { agent_id },
          'Workspace not found for deletion'
        );
        return false;
      }

      this.workspaceLogger.info({ agent_id }, 'Workspace deleted');
      return true;
    } catch (error) {
      this.workspaceLogger.error(
        { error, agent_id },
        'Failed to delete workspace by agent ID'
      );
      throw error;
    }
  }

  /**
   * Count workspaces by status
   *
   * @returns Object with counts for each status
   */
  async countByStatus(): Promise<{
    active: number;
    merged: number;
    deleted: number;
    total: number;
  }> {
    const query = `
      SELECT
        COUNT(CASE WHEN isolation_status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN isolation_status = 'merged' THEN 1 END) as merged,
        COUNT(CASE WHEN isolation_status = 'deleted' THEN 1 END) as deleted,
        COUNT(*) as total
      FROM workspaces
    `;

    try {
      const result = await pool.query<{
        active: string;
        merged: string;
        deleted: string;
        total: string;
      }>(query);

      const row = result.rows[0];

      return {
        active: parseInt(row.active, 10),
        merged: parseInt(row.merged, 10),
        deleted: parseInt(row.deleted, 10),
        total: parseInt(row.total, 10),
      };
    } catch (error) {
      this.workspaceLogger.error({ error }, 'Failed to count workspaces by status');
      throw error;
    }
  }

  /**
   * Check if workspace exists for agent
   *
   * @param agent_id - Agent UUID
   * @returns True if workspace exists
   */
  async exists(agent_id: string): Promise<boolean> {
    const query = `
      SELECT EXISTS(SELECT 1 FROM workspaces WHERE agent_id = $1) as exists
    `;

    try {
      const result = await pool.query<{ exists: boolean }>(query, [agent_id]);
      return result.rows[0].exists;
    } catch (error) {
      this.workspaceLogger.error(
        { error, agent_id },
        'Failed to check workspace existence'
      );
      throw error;
    }
  }
}
