import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { AgentService } from '../../src/services/AgentService.js';
import { BudgetService } from '../../src/services/BudgetService.js';
import { BudgetRepository } from '../../src/database/repositories/BudgetRepository.js';
import { Agent } from '../../src/core/Agent.js';
import { db } from '../../src/infrastructure/SharedDatabase.js';

/**
 * Integration Tests for US5: Budget Tracking
 *
 * Validates hierarchical budget management:
 * - Budget allocation and consumption
 * - Parent budget validation before spawn
 * - Budget reclamation on child completion
 * - Hierarchical budget queries
 * - SC-004: 100% accuracy in budget tracking across hierarchy
 */

describe('US5: Budget Tracking', () => {
  let agentService: AgentService;
  let budgetService: BudgetService;
  let budgetRepo: BudgetRepository;

  beforeAll(async () => {
    await db.initialize();
    agentService = new AgentService();
    budgetService = new BudgetService();
    budgetRepo = new BudgetRepository();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query('DELETE FROM checkpoints');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM agents');
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db.query('DELETE FROM checkpoints');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM agents');
  });

  describe('Basic Budget Allocation', () => {
    it('should allocate budget when spawning root agent', async () => {
      const agentId = await agentService.spawnAgent('coordinator', 'Root task', 10000);

      const budget = await budgetService.getBudget(agentId);

      expect(budget).toBeDefined();
      expect(budget!.allocated).toBe(10000);
      expect(budget!.used).toBe(0);
      expect(budget!.reserved).toBe(0);
    });

    it('should consume tokens and update budget', async () => {
      const agentId = await agentService.spawnAgent('worker', 'Task', 5000);

      await budgetService.consumeTokens(agentId, 1000);

      const budget = await budgetService.getBudget(agentId);
      expect(budget!.used).toBe(1000);
      expect(budget!.allocated - budget!.used - budget!.reserved).toBe(4000);
    });

    it('should throw error when consuming more than available budget', async () => {
      const agentId = await agentService.spawnAgent('worker', 'Task', 1000);

      await expect(
        budgetService.consumeTokens(agentId, 1500)
      ).rejects.toThrow('Insufficient budget');
    });

    it('should track budget usage percentage', async () => {
      const agentId = await agentService.spawnAgent('worker', 'Task', 10000);

      await budgetService.consumeTokens(agentId, 3000);

      const percentage = await budgetService.getBudgetUsagePercentage(agentId);
      expect(percentage).toBe(30);
    });
  });

  describe('Hierarchical Budget Allocation', () => {
    it('should reserve parent budget when spawning child (WP07.2)', async () => {
      // Spawn root with 10,000 tokens
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);

      // Create Agent wrapper and spawn child
      const rootAgent = await Agent.load(rootId);
      const childId = await rootAgent.spawnSubordinate('worker', 'Child task', 3000);

      // Verify child budget
      const childBudget = await budgetService.getBudget(childId);
      expect(childBudget!.allocated).toBe(3000);
      expect(childBudget!.used).toBe(0);
      expect(childBudget!.reserved).toBe(0);

      // Verify parent budget has reserved tokens
      const parentBudget = await budgetService.getBudget(rootId);
      expect(parentBudget!.allocated).toBe(10000);
      expect(parentBudget!.reserved).toBe(3000);
      expect(parentBudget!.allocated - parentBudget!.used - parentBudget!.reserved).toBe(7000);
    });

    it('should prevent spawning child when parent has insufficient budget (WP07.5)', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 5000);
      const rootAgent = await Agent.load(rootId);

      // Try to spawn child with more tokens than parent has
      await expect(
        rootAgent.spawnSubordinate('worker', 'Child task', 6000)
      ).rejects.toThrow('Insufficient budget');
    });

    it('should handle multiple children reserving parent budget', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      // Spawn 3 children
      await rootAgent.spawnSubordinate('worker1', 'Task 1', 2000);
      await rootAgent.spawnSubordinate('worker2', 'Task 2', 3000);
      await rootAgent.spawnSubordinate('worker3', 'Task 3', 1500);

      const parentBudget = await budgetService.getBudget(rootId);
      expect(parentBudget!.reserved).toBe(6500); // 2000 + 3000 + 1500
      expect(parentBudget!.allocated - parentBudget!.used - parentBudget!.reserved).toBe(3500);
    });

    it('should fail spawning child when available budget is insufficient', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      // Spawn children that use up most of the budget
      await rootAgent.spawnSubordinate('worker1', 'Task 1', 4000);
      await rootAgent.spawnSubordinate('worker2', 'Task 2', 5000);

      // Try to spawn another child (only 1000 left, but requesting 2000)
      await expect(
        rootAgent.spawnSubordinate('worker3', 'Task 3', 2000)
      ).rejects.toThrow('Insufficient budget');
    });
  });

  describe('Budget Reclamation (WP07.4)', () => {
    it('should reclaim unused budget from child to parent manually', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      // Spawn child with 3000 tokens
      const childId = await rootAgent.spawnSubordinate('worker', 'Child task', 3000);

      // Child consumes 1000 tokens (2000 unused)
      await budgetService.consumeTokens(childId, 1000);

      // Manually reclaim budget
      const result = await budgetService.reclaimBudget(childId);

      // Parent's reserved should be reduced by 2000 (unused amount)
      expect(result.parent.reserved).toBe(1000); // Was 3000, now 3000 - 2000 = 1000
      expect(result.child.allocated).toBe(3000);
      expect(result.child.used).toBe(1000);

      // Parent's available budget should increase
      const available = result.parent.allocated - result.parent.used - result.parent.reserved;
      expect(available).toBe(9000); // 10000 - 0 - 1000
    });

    it('should throw error when reclaiming from agent with no parent', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);

      await expect(
        budgetService.reclaimBudget(rootId)
      ).rejects.toThrow('has no parent');
    });

    it('should reclaim full budget when child uses no tokens', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      const childId = await rootAgent.spawnSubordinate('worker', 'Child task', 3000);

      // Child uses no tokens
      const result = await budgetService.reclaimBudget(childId);

      // Parent's reserved should be reduced by 3000 (full allocation)
      expect(result.parent.reserved).toBe(0);

      const available = result.parent.allocated - result.parent.used - result.parent.reserved;
      expect(available).toBe(10000);
    });
  });

  describe('Budget Hierarchy Queries (WP07.6)', () => {
    it('should retrieve budget hierarchy for 3-level tree', async () => {
      // Create 3-level hierarchy
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      const child1Id = await rootAgent.spawnSubordinate('worker1', 'Child 1', 3000);
      const child2Id = await rootAgent.spawnSubordinate('worker2', 'Child 2', 2000);

      const child1Agent = await Agent.load(child1Id);
      const grandchild1Id = await child1Agent.spawnSubordinate('worker1.1', 'Grandchild 1', 1000);
      const grandchild2Id = await child1Agent.spawnSubordinate('worker1.2', 'Grandchild 2', 500);

      // Query budget hierarchy
      const hierarchy = await budgetRepo.getBudgetHierarchy(rootId);

      // Should return 5 budgets (root + 2 children + 2 grandchildren)
      expect(hierarchy.length).toBe(5);

      // Verify root
      const root = hierarchy.find(b => b.agent_id === rootId);
      expect(root?.depth_level).toBe(0);
      expect(root?.allocated).toBe(10000);
      expect(root?.reserved).toBe(5000); // 3000 + 2000

      // Verify child1
      const child1 = hierarchy.find(b => b.agent_id === child1Id);
      expect(child1?.depth_level).toBe(1);
      expect(child1?.allocated).toBe(3000);
      expect(child1?.reserved).toBe(1500); // 1000 + 500
      expect(child1?.parent_id).toBe(rootId);

      // Verify grandchildren
      const grandchild1 = hierarchy.find(b => b.agent_id === grandchild1Id);
      const grandchild2 = hierarchy.find(b => b.agent_id === grandchild2Id);
      expect(grandchild1?.depth_level).toBe(2);
      expect(grandchild2?.depth_level).toBe(2);
      expect(grandchild1?.parent_id).toBe(child1Id);
      expect(grandchild2?.parent_id).toBe(child1Id);
    });

    it('should respect maxDepth option in hierarchy query', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 10000);
      const rootAgent = await Agent.load(rootId);

      const childId = await rootAgent.spawnSubordinate('worker', 'Child', 3000);
      const childAgent = await Agent.load(childId);
      await childAgent.spawnSubordinate('worker2', 'Grandchild', 1000);

      // Query with maxDepth = 1 (should only get root and children, not grandchildren)
      const hierarchy = await budgetRepo.getBudgetHierarchy(rootId, { maxDepth: 1 });

      expect(hierarchy.length).toBe(2); // root + 1 child
      expect(hierarchy.every(b => b.depth_level <= 1)).toBe(true);
    });
  });

  describe('SC-004: Hierarchical Budget Accuracy (WP07.12)', () => {
    it('should maintain 100% budget accuracy across 3-level hierarchy', async () => {
      // Create hierarchy: Root -> 2 Children -> 2 Grandchildren each
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 100000);
      const rootAgent = await Agent.load(rootId);

      const child1Id = await rootAgent.spawnSubordinate('worker1', 'Child 1', 30000);
      const child2Id = await rootAgent.spawnSubordinate('worker2', 'Child 2', 40000);

      const child1Agent = await Agent.load(child1Id);
      const child2Agent = await Agent.load(child2Id);

      const gc1Id = await child1Agent.spawnSubordinate('worker1.1', 'GC 1.1', 10000);
      const gc2Id = await child1Agent.spawnSubordinate('worker1.2', 'GC 1.2', 15000);
      const gc3Id = await child2Agent.spawnSubordinate('worker2.1', 'GC 2.1', 20000);
      const gc4Id = await child2Agent.spawnSubordinate('worker2.2', 'GC 2.2', 10000);

      // Simulate consumption at all levels
      await budgetService.consumeTokens(rootId, 5000);      // Root uses 5000
      await budgetService.consumeTokens(child1Id, 3000);    // Child1 uses 3000
      await budgetService.consumeTokens(child2Id, 7000);    // Child2 uses 7000
      await budgetService.consumeTokens(gc1Id, 8000);       // GC1 uses 8000
      await budgetService.consumeTokens(gc2Id, 12000);      // GC2 uses 12000
      await budgetService.consumeTokens(gc3Id, 15000);      // GC3 uses 15000
      await budgetService.consumeTokens(gc4Id, 6000);       // GC4 uses 6000

      // Verify budget accuracy at each level
      const rootBudget = await budgetService.getBudget(rootId);
      const child1Budget = await budgetService.getBudget(child1Id);
      const child2Budget = await budgetService.getBudget(child2Id);
      const gc1Budget = await budgetService.getBudget(gc1Id);
      const gc2Budget = await budgetService.getBudget(gc2Id);
      const gc3Budget = await budgetService.getBudget(gc3Id);
      const gc4Budget = await budgetService.getBudget(gc4Id);

      // Root: allocated 100k, used 5k, reserved 70k (30k + 40k)
      expect(rootBudget!.allocated).toBe(100000);
      expect(rootBudget!.used).toBe(5000);
      expect(rootBudget!.reserved).toBe(70000);

      // Child1: allocated 30k, used 3k, reserved 25k (10k + 15k)
      expect(child1Budget!.allocated).toBe(30000);
      expect(child1Budget!.used).toBe(3000);
      expect(child1Budget!.reserved).toBe(25000);

      // Child2: allocated 40k, used 7k, reserved 30k (20k + 10k)
      expect(child2Budget!.allocated).toBe(40000);
      expect(child2Budget!.used).toBe(7000);
      expect(child2Budget!.reserved).toBe(30000);

      // Grandchildren: no children, so reserved = 0
      expect(gc1Budget!.used).toBe(8000);
      expect(gc1Budget!.reserved).toBe(0);
      expect(gc2Budget!.used).toBe(12000);
      expect(gc2Budget!.reserved).toBe(0);
      expect(gc3Budget!.used).toBe(15000);
      expect(gc3Budget!.reserved).toBe(0);
      expect(gc4Budget!.used).toBe(6000);
      expect(gc4Budget!.reserved).toBe(0);

      // Verify total consumption
      const totalUsed = rootBudget!.used + child1Budget!.used + child2Budget!.used +
                        gc1Budget!.used + gc2Budget!.used + gc3Budget!.used + gc4Budget!.used;
      expect(totalUsed).toBe(56000); // 5k + 3k + 7k + 8k + 12k + 15k + 6k

      // Verify budget equation holds for all agents
      // allocated >= used + reserved
      const agents = [rootBudget!, child1Budget!, child2Budget!, gc1Budget!, gc2Budget!, gc3Budget!, gc4Budget!];
      agents.forEach(budget => {
        expect(budget.allocated).toBeGreaterThanOrEqual(budget.used + budget.reserved);
      });
    });

    it('should accurately track budget after reclamation', async () => {
      const rootId = await agentService.spawnAgent('coordinator', 'Root', 50000);
      const rootAgent = await Agent.load(rootId);

      const child1Id = await rootAgent.spawnSubordinate('worker1', 'Child 1', 20000);
      const child2Id = await rootAgent.spawnSubordinate('worker2', 'Child 2', 15000);

      // Children consume partial budgets
      await budgetService.consumeTokens(child1Id, 12000); // 8000 unused
      await budgetService.consumeTokens(child2Id, 15000); // 0 unused

      // Reclaim from child1
      await budgetService.reclaimBudget(child1Id);

      const rootBudget = await budgetService.getBudget(rootId);

      // Root reserved should now be: 15000 + 12000 = 27000
      // (child2's 15k + child1's used 12k)
      expect(rootBudget!.reserved).toBe(27000);

      // Root available: 50000 - 0 - 27000 = 23000
      const available = rootBudget!.allocated - rootBudget!.used - rootBudget!.reserved;
      expect(available).toBe(23000);
    });
  });

  describe('Budget Edge Cases', () => {
    it('should handle zero token allocation', async () => {
      await expect(
        agentService.spawnAgent('worker', 'Task', 0)
      ).rejects.toThrow();
    });

    it('should handle consuming zero tokens', async () => {
      const agentId = await agentService.spawnAgent('worker', 'Task', 1000);

      await expect(
        budgetService.consumeTokens(agentId, 0)
      ).rejects.toThrow('Token consumption must be positive');
    });

    it('should check budget sufficiency correctly', async () => {
      const agentId = await agentService.spawnAgent('worker', 'Task', 5000);

      const sufficient1 = await budgetService.hasSufficientBudget(agentId, 3000);
      expect(sufficient1).toBe(true);

      const sufficient2 = await budgetService.hasSufficientBudget(agentId, 5001);
      expect(sufficient2).toBe(false);
    });

    it('should handle budget queries for non-existent agent', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        budgetService.getBudget(fakeId)
      ).rejects.toThrow();
    });
  });
});
