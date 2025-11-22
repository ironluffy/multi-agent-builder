import { HierarchyRepository, Hierarchy } from '../database/repositories/HierarchyRepository.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { config } from '../config/env.js';
import { logger } from '../utils/Logger.js';
import type { Agent } from '../models/Agent.js';

/**
 * Hierarchy Service
 * High-level service for managing parent-child relationships between agents
 *
 * Responsibilities:
 * - Establish and manage hierarchical relationships
 * - Validate hierarchy constraints (cycles, depth, self-reference)
 * - Query parent-child relationships
 * - Enforce business rules for agent hierarchies
 */
export class HierarchyService {
  private hierarchyRepo: HierarchyRepository;
  private agentRepo: AgentRepository;
  private serviceLogger = logger.child({ component: 'HierarchyService' });

  constructor() {
    this.hierarchyRepo = new HierarchyRepository();
    this.agentRepo = new AgentRepository();
  }

  /**
   * Create a parent-child relationship between two agents
   *
   * Validates:
   * - Agents exist
   * - No self-referencing
   * - No cycles
   * - Max depth not exceeded
   *
   * @param parent_id - Parent agent UUID
   * @param child_id - Child agent UUID
   * @returns Created hierarchy relationship
   * @throws Error if validation fails or creation fails
   */
  async createRelationship(parent_id: string, child_id: string): Promise<Hierarchy> {
    this.serviceLogger.info({ parent_id, child_id }, 'Creating hierarchy relationship');

    try {
      // 1. Validate hierarchy rules
      await this.validateHierarchy(parent_id, child_id);

      // 2. Create the relationship
      const hierarchy = await this.hierarchyRepo.create(parent_id, child_id);

      this.serviceLogger.info(
        { parent_id, child_id, hierarchy_id: hierarchy.id },
        'Hierarchy relationship created successfully'
      );

      return hierarchy;
    } catch (error) {
      this.serviceLogger.error(
        { error, parent_id, child_id },
        'Failed to create hierarchy relationship'
      );
      throw error;
    }
  }

  /**
   * Validate hierarchy rules before creating a relationship
   *
   * Checks:
   * - Both agents exist
   * - Parent and child are different agents (no self-reference)
   * - No cycle would be created
   * - Max depth limit would not be exceeded
   *
   * @param parent_id - Parent agent UUID
   * @param child_id - Child agent UUID
   * @throws Error if any validation fails
   */
  async validateHierarchy(parent_id: string, child_id: string): Promise<void> {
    // 1. Check agents exist
    const parent = await this.agentRepo.findById(parent_id);
    const child = await this.agentRepo.findById(child_id);

    if (!parent) {
      throw new Error(`Parent agent not found: ${parent_id}`);
    }

    if (!child) {
      throw new Error(`Child agent not found: ${child_id}`);
    }

    // 2. Prevent self-referencing
    if (parent_id === child_id) {
      throw new Error('Agent cannot be its own parent (self-reference not allowed)');
    }

    // 3. Check for cycles
    const wouldCreateCycle = await this.hierarchyRepo.wouldCreateCycle(parent_id, child_id);
    if (wouldCreateCycle) {
      throw new Error(
        `Creating relationship would create a cycle: ${child_id} is already an ancestor of ${parent_id}`
      );
    }

    // 4. Validate max depth
    const childDepth = parent.depth_level + 1;
    if (childDepth > config.agent.maxDepth) {
      throw new Error(
        `Max depth exceeded: parent depth=${parent.depth_level}, ` +
        `child would be depth=${childDepth}, max=${config.agent.maxDepth}`
      );
    }

    this.serviceLogger.debug(
      { parent_id, child_id, parent_depth: parent.depth_level, child_depth: childDepth },
      'Hierarchy validation passed'
    );
  }

  /**
   * Get all direct children of a parent agent
   *
   * @param parent_id - Parent agent UUID
   * @returns Array of child agent IDs
   */
  async getChildren(parent_id: string): Promise<string[]> {
    try {
      const hierarchies = await this.hierarchyRepo.findByParent(parent_id);
      const childIds = hierarchies.map(h => h.child_id);

      this.serviceLogger.debug(
        { parent_id, count: childIds.length },
        'Retrieved children'
      );

      return childIds;
    } catch (error) {
      this.serviceLogger.error(
        { error, parent_id },
        'Failed to get children'
      );
      throw error;
    }
  }

  /**
   * Get all child agents with full details
   *
   * @param parent_id - Parent agent UUID
   * @returns Array of child agents with details
   */
  async getChildAgents(parent_id: string): Promise<Agent[]> {
    try {
      const childIds = await this.getChildren(parent_id);
      const children = await Promise.all(
        childIds.map(id => this.agentRepo.findById(id))
      );

      // Filter out any null results (shouldn't happen with valid data)
      return children.filter((agent): agent is Agent => agent !== null);
    } catch (error) {
      this.serviceLogger.error(
        { error, parent_id },
        'Failed to get child agents'
      );
      throw error;
    }
  }

  /**
   * Get parent of a child agent
   *
   * @param child_id - Child agent UUID
   * @returns Parent agent ID or null if no parent
   */
  async getParent(child_id: string): Promise<string | null> {
    try {
      const hierarchy = await this.hierarchyRepo.findByChild(child_id);

      if (!hierarchy) {
        this.serviceLogger.debug({ child_id }, 'No parent found (root agent)');
        return null;
      }

      this.serviceLogger.debug(
        { child_id, parent_id: hierarchy.parent_id },
        'Retrieved parent'
      );

      return hierarchy.parent_id;
    } catch (error) {
      this.serviceLogger.error(
        { error, child_id },
        'Failed to get parent'
      );
      throw error;
    }
  }

  /**
   * Get parent agent with full details
   *
   * @param child_id - Child agent UUID
   * @returns Parent agent or null if no parent
   */
  async getParentAgent(child_id: string): Promise<Agent | null> {
    try {
      const parentId = await this.getParent(child_id);

      if (!parentId) {
        return null;
      }

      return await this.agentRepo.findById(parentId);
    } catch (error) {
      this.serviceLogger.error(
        { error, child_id },
        'Failed to get parent agent'
      );
      throw error;
    }
  }

  /**
   * Remove hierarchy relationship for a child agent
   * Used when agent is deleted or when re-parenting
   *
   * @param child_id - Child agent UUID
   */
  async removeRelationship(child_id: string): Promise<void> {
    this.serviceLogger.info({ child_id }, 'Removing hierarchy relationship');

    try {
      await this.hierarchyRepo.deleteByChild(child_id);

      this.serviceLogger.info(
        { child_id },
        'Hierarchy relationship removed successfully'
      );
    } catch (error) {
      this.serviceLogger.error(
        { error, child_id },
        'Failed to remove hierarchy relationship'
      );
      throw error;
    }
  }

  /**
   * Get all descendants (children, grandchildren, etc.) of an agent
   *
   * @param agent_id - Agent UUID
   * @returns Array of descendant agent IDs
   */
  async getDescendants(agent_id: string): Promise<string[]> {
    try {
      const descendants = await this.hierarchyRepo.getDescendants(agent_id);

      this.serviceLogger.debug(
        { agent_id, count: descendants.length },
        'Retrieved descendants'
      );

      return descendants;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get descendants'
      );
      throw error;
    }
  }

  /**
   * Get all ancestors (parent, grandparent, etc.) of an agent
   *
   * @param agent_id - Agent UUID
   * @returns Array of ancestor agent IDs
   */
  async getAncestors(agent_id: string): Promise<string[]> {
    try {
      const ancestors = await this.hierarchyRepo.getAncestors(agent_id);

      this.serviceLogger.debug(
        { agent_id, count: ancestors.length },
        'Retrieved ancestors'
      );

      return ancestors;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get ancestors'
      );
      throw error;
    }
  }

  /**
   * Get the complete hierarchy tree starting from a root agent
   *
   * @param root_id - Root agent UUID
   * @returns Hierarchy tree structure
   */
  async getHierarchyTree(root_id: string): Promise<any> {
    try {
      const tree = await this.hierarchyRepo.getHierarchyTree(root_id);

      this.serviceLogger.debug(
        { root_id, nodes: tree.length },
        'Retrieved hierarchy tree'
      );

      return tree;
    } catch (error) {
      this.serviceLogger.error(
        { error, root_id },
        'Failed to get hierarchy tree'
      );
      throw error;
    }
  }

  /**
   * Get siblings of an agent (other agents with same parent)
   *
   * @param agent_id - Agent UUID
   * @returns Array of sibling agent IDs
   */
  async getSiblings(agent_id: string): Promise<string[]> {
    try {
      const siblings = await this.hierarchyRepo.getSiblings(agent_id);

      this.serviceLogger.debug(
        { agent_id, count: siblings.length },
        'Retrieved siblings'
      );

      return siblings;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get siblings'
      );
      throw error;
    }
  }

  /**
   * Check if a relationship exists between parent and child
   *
   * @param parent_id - Parent agent UUID
   * @param child_id - Child agent UUID
   * @returns True if relationship exists
   */
  async relationshipExists(parent_id: string, child_id: string): Promise<boolean> {
    try {
      return await this.hierarchyRepo.exists(parent_id, child_id);
    } catch (error) {
      this.serviceLogger.error(
        { error, parent_id, child_id },
        'Failed to check relationship existence'
      );
      return false;
    }
  }

  /**
   * Get depth level of an agent in the hierarchy
   *
   * @param agent_id - Agent UUID
   * @returns Depth level (0 for root, 1 for first level child, etc.)
   */
  async getDepthLevel(agent_id: string): Promise<number> {
    try {
      const agent = await this.agentRepo.findById(agent_id);

      if (!agent) {
        throw new Error(`Agent not found: ${agent_id}`);
      }

      return agent.depth_level;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get depth level'
      );
      throw error;
    }
  }

  /**
   * Check if an agent is a root agent (has no parent)
   *
   * @param agent_id - Agent UUID
   * @returns True if agent is root (no parent)
   */
  async isRootAgent(agent_id: string): Promise<boolean> {
    try {
      const parent = await this.getParent(agent_id);
      return parent === null;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to check if root agent'
      );
      throw error;
    }
  }

  /**
   * Check if an agent is a leaf agent (has no children)
   *
   * @param agent_id - Agent UUID
   * @returns True if agent is leaf (no children)
   */
  async isLeafAgent(agent_id: string): Promise<boolean> {
    try {
      const children = await this.getChildren(agent_id);
      return children.length === 0;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to check if leaf agent'
      );
      throw error;
    }
  }
}
