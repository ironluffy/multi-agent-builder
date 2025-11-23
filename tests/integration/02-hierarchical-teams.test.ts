import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { AgentService } from '../../src/services/AgentService.js';
import { HierarchyService } from '../../src/services/HierarchyService.js';
import { BudgetService } from '../../src/services/BudgetService.js';
import { Agent } from '../../src/core/Agent.js';
import { db } from '../../src/infrastructure/SharedDatabase.js';

/**
 * Integration Tests for US2: Hierarchical Teams
 *
 * Tests 3-level agent hierarchy with budget flow:
 * - Root agent (depth 0): 10,000 tokens
 * - 2 child agents (depth 1): 3,000 tokens each
 * - 4 grandchild agents (depth 2): 1,000 tokens each
 *
 * Total: 7 agents across 3 levels
 */

describe('US2: Hierarchical Teams', () => {
  let agentService: AgentService;
  let hierarchyService: HierarchyService;
  let budgetService: BudgetService;

  beforeAll(() => {
    agentService = new AgentService();
    hierarchyService = new HierarchyService();
    budgetService = new BudgetService();
  });

  afterEach(async () => {
    // Clean up test data in reverse dependency order
    await db.query('DELETE FROM checkpoints');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM agents');
  });

  describe('3-Level Hierarchy Creation', () => {
    it('should create a complete 3-level hierarchy with 7 agents', async () => {
      // Level 0: Spawn root agent
      const rootId = await agentService.spawnAgent(
        'coordinator',
        'Coordinate multi-agent team',
        10000
      );

      expect(rootId).toBeDefined();

      // Verify root agent
      const rootAgent = await agentService.getAgentStatus(rootId);
      expect(rootAgent.depth_level).toBe(0);
      expect(rootAgent.parent_id).toBeNull();

      // Verify root budget
      const rootBudget = await budgetService.getBudget(rootId);
      expect(rootBudget).toBeDefined();
      expect(rootBudget!.allocated).toBe(10000);
      expect(rootBudget!.used).toBe(0);
      expect(rootBudget!.reserved).toBe(0);

      // Level 1: Create Agent wrapper and spawn 2 children
      const rootAgentWrapper = await Agent.load(rootId);

      const child1Id = await rootAgentWrapper.spawnSubordinate(
        'researcher',
        'Research task 1',
        3000
      );

      const child2Id = await rootAgentWrapper.spawnSubordinate(
        'coder',
        'Coding task 1',
        3000
      );

      // Verify children
      const child1 = await agentService.getAgentStatus(child1Id);
      const child2 = await agentService.getAgentStatus(child2Id);

      expect(child1.depth_level).toBe(1);
      expect(child1.parent_id).toBe(rootId);
      expect(child2.depth_level).toBe(1);
      expect(child2.parent_id).toBe(rootId);

      // Verify children budgets
      const child1Budget = await budgetService.getBudget(child1Id);
      const child2Budget = await budgetService.getBudget(child2Id);

      expect(child1Budget!.allocated).toBe(3000);
      expect(child2Budget!.allocated).toBe(3000);

      // Verify parent budget reserved tokens
      const updatedRootBudget = await budgetService.getBudget(rootId);
      expect(updatedRootBudget!.reserved).toBe(6000); // 3000 + 3000

      // Level 2: Each child spawns 2 grandchildren
      const child1Wrapper = await Agent.load(child1Id);
      const child2Wrapper = await Agent.load(child2Id);

      const grandchild1Id = await child1Wrapper.spawnSubordinate(
        'analyst',
        'Analysis subtask 1',
        1000
      );

      const grandchild2Id = await child1Wrapper.spawnSubordinate(
        'writer',
        'Writing subtask 1',
        1000
      );

      const grandchild3Id = await child2Wrapper.spawnSubordinate(
        'tester',
        'Testing subtask 1',
        1000
      );

      const grandchild4Id = await child2Wrapper.spawnSubordinate(
        'reviewer',
        'Review subtask 1',
        1000
      );

      // Verify grandchildren
      const grandchildren = await Promise.all([
        agentService.getAgentStatus(grandchild1Id),
        agentService.getAgentStatus(grandchild2Id),
        agentService.getAgentStatus(grandchild3Id),
        agentService.getAgentStatus(grandchild4Id),
      ]);

      grandchildren.forEach((gc, index) => {
        expect(gc.depth_level).toBe(2);
        expect([child1Id, child2Id]).toContain(gc.parent_id);
      });

      // Verify total agent count
      const allAgents = await db.query('SELECT COUNT(*) as count FROM agents');
      expect(parseInt(allAgents.rows[0].count)).toBe(7);
    });

    it('should correctly track parent-child relationships in hierarchy table', async () => {
      // Create hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root task', 10000);
      const rootWrapper = await Agent.load(rootId);

      const child1Id = await rootWrapper.spawnSubordinate('child1', 'Child 1', 3000);
      const child2Id = await rootWrapper.spawnSubordinate('child2', 'Child 2', 3000);

      // Verify hierarchies table
      const hierarchies = await db.query(
        'SELECT * FROM hierarchies WHERE parent_id = $1 ORDER BY created_at',
        [rootId]
      );

      expect(hierarchies.rows.length).toBe(2);
      expect(hierarchies.rows[0].child_id).toBe(child1Id);
      expect(hierarchies.rows[1].child_id).toBe(child2Id);

      // Verify via HierarchyService
      const children = await hierarchyService.getChildren(rootId);
      expect(children).toEqual([child1Id, child2Id]);
    });
  });

  describe('Budget Flow Through Hierarchy', () => {
    it('should correctly allocate and reserve budgets through 3 levels', async () => {
      // Create hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      // Spawn child - should reserve 3000 from root
      const childId = await rootWrapper.spawnSubordinate('child', 'Child', 3000);

      // Check root budget after child creation
      const rootBudgetAfterChild = await budgetService.getBudget(rootId);
      expect(rootBudgetAfterChild!.allocated).toBe(10000);
      expect(rootBudgetAfterChild!.reserved).toBe(3000);
      expect(rootBudgetAfterChild!.used).toBe(0);

      // Available budget = allocated - reserved - used
      const rootAvailable = await budgetService.getRemainingBudget(rootId);
      expect(rootAvailable).toBe(7000);

      // Spawn grandchild - should reserve 1000 from child
      const childWrapper = await Agent.load(childId);
      const grandchildId = await childWrapper.spawnSubordinate('grandchild', 'Grandchild', 1000);

      // Check child budget
      const childBudget = await budgetService.getBudget(childId);
      expect(childBudget!.allocated).toBe(3000);
      expect(childBudget!.reserved).toBe(1000);
      expect(childBudget!.used).toBe(0);

      // Check grandchild budget
      const grandchildBudget = await budgetService.getBudget(grandchildId);
      expect(grandchildBudget!.allocated).toBe(1000);
      expect(grandchildBudget!.reserved).toBe(0);
      expect(grandchildBudget!.used).toBe(0);
    });

    it('should prevent child spawning when parent has insufficient budget', async () => {
      const rootId = await agentService.spawnAgent('root', 'Root', 5000);
      const rootWrapper = await Agent.load(rootId);

      // Spawn child with 4000 tokens
      await rootWrapper.spawnSubordinate('child1', 'Child 1', 4000);

      // Try to spawn another child with 2000 tokens (should fail - only 1000 available)
      await expect(
        rootWrapper.spawnSubordinate('child2', 'Child 2', 2000)
      ).rejects.toThrow(/insufficient budget/i);
    });
  });

  describe('Hierarchy Query Methods', () => {
    it('should return complete hierarchy tree with getHierarchyTree()', async () => {
      // Create 3-level hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      const child1Id = await rootWrapper.spawnSubordinate('child1', 'Child 1', 3000);
      const child2Id = await rootWrapper.spawnSubordinate('child2', 'Child 2', 3000);

      const child1Wrapper = await Agent.load(child1Id);
      const grandchild1Id = await child1Wrapper.spawnSubordinate('gc1', 'Grandchild 1', 1000);
      const grandchild2Id = await child1Wrapper.spawnSubordinate('gc2', 'Grandchild 2', 1000);

      // Get hierarchy tree
      const tree = await hierarchyService.getHierarchyTree(rootId);

      // Verify root
      expect(tree.id).toBe(rootId);
      expect(tree.depth_level).toBe(0);
      expect(tree.children.length).toBe(2);

      // Verify children
      const treeChild1 = tree.children.find(c => c.id === child1Id);
      const treeChild2 = tree.children.find(c => c.id === child2Id);

      expect(treeChild1).toBeDefined();
      expect(treeChild2).toBeDefined();
      expect(treeChild1!.depth_level).toBe(1);
      expect(treeChild2!.depth_level).toBe(1);

      // Verify grandchildren under child1
      expect(treeChild1!.children.length).toBe(2);
      expect(treeChild1!.children[0].depth_level).toBe(2);
      expect(treeChild1!.children[1].depth_level).toBe(2);

      // Verify child2 has no children
      expect(treeChild2!.children.length).toBe(0);
    });

    it('should return correct ancestors with getAncestorAgents()', async () => {
      // Create 3-level hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      const childId = await rootWrapper.spawnSubordinate('child', 'Child', 3000);
      const childWrapper = await Agent.load(childId);

      const grandchildId = await childWrapper.spawnSubordinate('grandchild', 'Grandchild', 1000);

      // Get ancestors of grandchild
      const ancestors = await hierarchyService.getAncestorAgents(grandchildId);

      // Should return [root, child] ordered from root to parent
      expect(ancestors.length).toBe(2);
      expect(ancestors[0].id).toBe(rootId);
      expect(ancestors[0].role).toBe('root');
      expect(ancestors[1].id).toBe(childId);
      expect(ancestors[1].role).toBe('child');
    });

    it('should return correct descendants with getDescendantAgents()', async () => {
      // Create hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      const child1Id = await rootWrapper.spawnSubordinate('child1', 'Child 1', 3000);
      const child2Id = await rootWrapper.spawnSubordinate('child2', 'Child 2', 3000);

      const child1Wrapper = await Agent.load(child1Id);
      const grandchild1Id = await child1Wrapper.spawnSubordinate('gc1', 'GC1', 1000);
      const grandchild2Id = await child1Wrapper.spawnSubordinate('gc2', 'GC2', 1000);

      // Get all descendants of root (breadth-first)
      const descendants = await hierarchyService.getDescendantAgents(rootId);

      // Should return 4 agents: child1, child2, gc1, gc2
      expect(descendants.length).toBe(4);

      // Check breadth-first ordering (level 1 before level 2)
      expect(descendants[0].depth_level).toBe(1);
      expect(descendants[1].depth_level).toBe(1);
      expect(descendants[2].depth_level).toBe(2);
      expect(descendants[3].depth_level).toBe(2);
    });
  });

  describe('SC-002: Max Depth Validation', () => {
    it('should enforce max depth limit (5 levels)', async () => {
      // Get max depth from config (should be 5)
      const { config } = await import('../../src/config/env.js');
      expect(config.agent.maxDepth).toBe(5);

      // Create agents up to depth 4 (0, 1, 2, 3, 4)
      let currentId = await agentService.spawnAgent('root', 'Level 0', 50000);

      for (let depth = 1; depth <= 4; depth++) {
        const wrapper = await Agent.load(currentId);
        currentId = await wrapper.spawnSubordinate(
          `agent-depth-${depth}`,
          `Level ${depth}`,
          10000
        );

        const agent = await agentService.getAgentStatus(currentId);
        expect(agent.depth_level).toBe(depth);
      }

      // Try to spawn at depth 5 (should succeed - max is 5)
      const depth4Wrapper = await Agent.load(currentId);
      const depth5Id = await depth4Wrapper.spawnSubordinate('agent-depth-5', 'Level 5', 1000);
      const depth5Agent = await agentService.getAgentStatus(depth5Id);
      expect(depth5Agent.depth_level).toBe(5);

      // Try to spawn at depth 6 (should fail - exceeds max)
      const depth5Wrapper = await Agent.load(depth5Id);
      await expect(
        depth5Wrapper.spawnSubordinate('agent-depth-6', 'Level 6', 500)
      ).rejects.toThrow(/max depth.*would be exceeded/i);
    });
  });

  describe('Hierarchy Relationships', () => {
    it('should correctly identify root, leaf, and intermediate agents', async () => {
      // Create hierarchy
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      const childId = await rootWrapper.spawnSubordinate('child', 'Child', 3000);
      const childWrapper = await Agent.load(childId);

      const grandchildId = await childWrapper.spawnSubordinate('grandchild', 'Grandchild', 1000);

      // Root agent checks
      const isRootRoot = await hierarchyService.isRootAgent(rootId);
      const isRootLeaf = await hierarchyService.isLeafAgent(rootId);
      expect(isRootRoot).toBe(true);
      expect(isRootLeaf).toBe(false);

      // Child agent checks (intermediate)
      const isChildRoot = await hierarchyService.isRootAgent(childId);
      const isChildLeaf = await hierarchyService.isLeafAgent(childId);
      expect(isChildRoot).toBe(false);
      expect(isChildLeaf).toBe(false);

      // Grandchild agent checks (leaf)
      const isGrandchildRoot = await hierarchyService.isRootAgent(grandchildId);
      const isGrandchildLeaf = await hierarchyService.isLeafAgent(grandchildId);
      expect(isGrandchildRoot).toBe(false);
      expect(isGrandchildLeaf).toBe(true);
    });

    it('should return siblings correctly', async () => {
      // Create hierarchy with siblings
      const rootId = await agentService.spawnAgent('root', 'Root', 10000);
      const rootWrapper = await Agent.load(rootId);

      const child1Id = await rootWrapper.spawnSubordinate('child1', 'Child 1', 2000);
      const child2Id = await rootWrapper.spawnSubordinate('child2', 'Child 2', 2000);
      const child3Id = await rootWrapper.spawnSubordinate('child3', 'Child 3', 2000);

      // Get siblings of child1
      const siblings = await hierarchyService.getSiblings(child1Id);

      expect(siblings.length).toBe(2);
      expect(siblings).toContain(child2Id);
      expect(siblings).toContain(child3Id);
      expect(siblings).not.toContain(child1Id);
    });
  });
});
