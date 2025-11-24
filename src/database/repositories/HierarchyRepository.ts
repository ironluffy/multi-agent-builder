import { pool } from '../db.js';
import { logger } from '../../utils/Logger.js';

/**
 * Hierarchy data structure based on database schema
 */
export interface Hierarchy {
  id: string;
  parent_id: string;
  child_id: string;
  created_at: Date;
}

/**
 * Hierarchy Repository
 * Manages parent-child relationships between agents
 */
export class HierarchyRepository {
  /**
   * Create a new hierarchy relationship
   * Validates that the relationship doesn't create cycles
   */
  async create(parent_id: string, child_id: string): Promise<Hierarchy> {
    // Validate: agent can't be its own parent
    if (parent_id === child_id) {
      throw new Error('Agent cannot be its own parent');
    }

    // Check if relationship would create a cycle
    const wouldCycle = await this.wouldCreateCycle(parent_id, child_id);
    if (wouldCycle) {
      throw new Error(
        `Creating relationship from ${parent_id} to ${child_id} would create a cycle`
      );
    }

    const query = `
      INSERT INTO hierarchies (parent_id, child_id)
      VALUES ($1, $2)
      RETURNING *
    `;

    try {
      const result = await pool.query<Hierarchy>(query, [parent_id, child_id]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create hierarchy relationship');
      }

      logger.info({ parent_id, child_id }, 'Hierarchy relationship created');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, parent_id, child_id }, 'Failed to create hierarchy');
      throw error;
    }
  }

  /**
   * Find all children of a parent agent
   */
  async findByParent(parent_id: string): Promise<Hierarchy[]> {
    const query = `
      SELECT * FROM hierarchies
      WHERE parent_id = $1
      ORDER BY created_at ASC
    `;

    try {
      const result = await pool.query<Hierarchy>(query, [parent_id]);
      return result.rows;
    } catch (error) {
      logger.error({ error, parent_id }, 'Failed to find children');
      throw error;
    }
  }

  /**
   * Find parent of a child agent
   */
  async findByChild(child_id: string): Promise<Hierarchy | null> {
    const query = `
      SELECT * FROM hierarchies
      WHERE child_id = $1
      LIMIT 1
    `;

    try {
      const result = await pool.query<Hierarchy>(query, [child_id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, child_id }, 'Failed to find parent');
      throw error;
    }
  }

  /**
   * Check if a hierarchy relationship exists
   */
  async exists(parent_id: string, child_id: string): Promise<boolean> {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM hierarchies
        WHERE parent_id = $1 AND child_id = $2
      ) as exists
    `;

    try {
      const result = await pool.query<{ exists: boolean }>(query, [parent_id, child_id]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error({ error, parent_id, child_id }, 'Failed to check hierarchy exists');
      throw error;
    }
  }

  /**
   * Delete hierarchy relationships for a child agent
   * Used when agent is deleted
   */
  async deleteByChild(child_id: string): Promise<void> {
    const query = `
      DELETE FROM hierarchies
      WHERE child_id = $1
    `;

    try {
      await pool.query(query, [child_id]);
      logger.info({ child_id }, 'Hierarchy relationships deleted for child');
    } catch (error) {
      logger.error({ error, child_id }, 'Failed to delete hierarchy');
      throw error;
    }
  }

  /**
   * Delete hierarchy relationships for a parent agent
   * Used when parent agent is deleted
   */
  async deleteByParent(parent_id: string): Promise<void> {
    const query = `
      DELETE FROM hierarchies
      WHERE parent_id = $1
    `;

    try {
      await pool.query(query, [parent_id]);
      logger.info({ parent_id }, 'Hierarchy relationships deleted for parent');
    } catch (error) {
      logger.error({ error, parent_id }, 'Failed to delete hierarchy');
      throw error;
    }
  }

  /**
   * Get all descendants (children, grandchildren, etc.) of an agent
   * Uses recursive CTE for efficient querying
   */
  async getDescendants(agent_id: string): Promise<string[]> {
    const query = `
      WITH RECURSIVE descendants AS (
        -- Base case: direct children
        SELECT child_id
        FROM hierarchies
        WHERE parent_id = $1

        UNION ALL

        -- Recursive case: children of children
        SELECT h.child_id
        FROM hierarchies h
        INNER JOIN descendants d ON h.parent_id = d.child_id
      )
      SELECT child_id FROM descendants
    `;

    try {
      const result = await pool.query<{ child_id: string }>(query, [agent_id]);
      return result.rows.map((row) => row.child_id);
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get descendants');
      throw error;
    }
  }

  /**
   * Get all ancestors (parent, grandparent, etc.) of an agent
   * Uses recursive CTE for efficient querying
   */
  async getAncestors(agent_id: string): Promise<string[]> {
    const query = `
      WITH RECURSIVE ancestors AS (
        -- Base case: direct parent
        SELECT parent_id
        FROM hierarchies
        WHERE child_id = $1

        UNION ALL

        -- Recursive case: parents of parents
        SELECT h.parent_id
        FROM hierarchies h
        INNER JOIN ancestors a ON h.child_id = a.parent_id
      )
      SELECT parent_id FROM ancestors
    `;

    try {
      const result = await pool.query<{ parent_id: string }>(query, [agent_id]);
      return result.rows.map((row) => row.parent_id);
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get ancestors');
      throw error;
    }
  }

  /**
   * Check if creating a relationship would create a cycle
   * A cycle occurs if the child is already an ancestor of the parent
   */
  async wouldCreateCycle(parent_id: string, child_id: string): Promise<boolean> {
    try {
      // Check if parent is a descendant of child
      const parentAncestors = await this.getAncestors(parent_id);
      return parentAncestors.includes(child_id);
    } catch (error) {
      logger.error({ error, parent_id, child_id }, 'Failed to check for cycles');
      throw error;
    }
  }

  /**
   * Get the complete hierarchy tree starting from a root agent
   */
  async getHierarchyTree(root_id: string): Promise<any> {
    const query = `
      WITH RECURSIVE tree AS (
        -- Root agent
        SELECT
          a.id,
          a.role,
          a.status,
          a.depth_level,
          a.parent_id,
          0 as level
        FROM agents a
        WHERE a.id = $1

        UNION ALL

        -- Recursive: get children
        SELECT
          a.id,
          a.role,
          a.status,
          a.depth_level,
          a.parent_id,
          t.level + 1
        FROM agents a
        INNER JOIN hierarchies h ON a.id = h.child_id
        INNER JOIN tree t ON h.parent_id = t.id
      )
      SELECT * FROM tree ORDER BY level, id
    `;

    try {
      const result = await pool.query(query, [root_id]);
      return result.rows;
    } catch (error) {
      logger.error({ error, root_id }, 'Failed to get hierarchy tree');
      throw error;
    }
  }

  /**
   * Get siblings of an agent (other agents with the same parent)
   */
  async getSiblings(agent_id: string): Promise<string[]> {
    const query = `
      SELECT h2.child_id
      FROM hierarchies h1
      INNER JOIN hierarchies h2 ON h1.parent_id = h2.parent_id
      WHERE h1.child_id = $1 AND h2.child_id != $1
    `;

    try {
      const result = await pool.query<{ child_id: string }>(query, [agent_id]);
      return result.rows.map((row) => row.child_id);
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get siblings');
      throw error;
    }
  }
}
