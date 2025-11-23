// Configure test environment before imports
import '../setup/test-env-setup.js';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { AgentService } from '../../src/services/AgentService.js';
import { db } from '../../src/infrastructure/SharedDatabase.js';
import { AgentRepository } from '../../src/database/repositories/AgentRepository.js';
import { BudgetRepository } from '../../src/database/repositories/BudgetRepository.js';
import type { Agent } from '../../src/models/Agent.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Integration Tests for US1: Single Agent System
 *
 * Tests the core agent lifecycle:
 * - T043: Single agent spawn and completion
 * - T044: Agent status transitions and state machine
 *
 * Coverage Goals: >80% of agent core functionality
 */

// Mock Anthropic API to avoid real API calls in tests
vi.mock('@anthropic-ai/sdk', () => {
  const MessagesMock = {
    create: vi.fn().mockResolvedValue({
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Test response from mock Anthropic API',
        },
      ],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    }),
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: MessagesMock,
    })),
  };
});

describe('US1: Single Agent Spawn and Completion', () => {
  let agentService: AgentService;
  let agentRepo: AgentRepository;
  let budgetRepo: BudgetRepository;

  beforeAll(async () => {
    // Initialize test database connection
    await db.initialize();

    // Initialize services and repositories
    agentService = new AgentService();
    agentRepo = new AgentRepository();
    budgetRepo = new BudgetRepository();
  });

  afterAll(async () => {
    // Clean up and close database connections
    await db.shutdown();
  });

  beforeEach(async () => {
    // Clean test data before each test to ensure isolation
    // Delete in reverse order of foreign key dependencies
    await db.query('DELETE FROM checkpoints');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM agents');
  });

  describe('Agent Spawning', () => {
    it('should spawn agent with correct initial status', async () => {
      const agentId = await agentService.spawnAgent(
        'researcher',
        'Analyze the latest trends in AI research',
        10000
      );

      // Verify agent ID format (UUID v4)
      expect(agentId).toBeDefined();
      expect(agentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      // Verify agent was created in database with correct properties
      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('pending');
      expect(agent.role).toBe('researcher');
      expect(agent.depth_level).toBe(0);
      expect(agent.task_description).toBe('Analyze the latest trends in AI research');
      expect(agent.parent_id).toBeNull();
      expect(agent.created_at).toBeInstanceOf(Date);
      expect(agent.updated_at).toBeInstanceOf(Date);
      expect(agent.completed_at).toBeNull();
    });

    it('should spawn multiple agents with unique IDs', async () => {
      const agentId1 = await agentService.spawnAgent('researcher', 'Task 1', 5000);
      const agentId2 = await agentService.spawnAgent('coder', 'Task 2', 8000);
      const agentId3 = await agentService.spawnAgent('reviewer', 'Task 3', 6000);

      // All IDs should be unique
      expect(agentId1).not.toBe(agentId2);
      expect(agentId2).not.toBe(agentId3);
      expect(agentId1).not.toBe(agentId3);

      // All agents should exist in database
      const agent1 = await agentRepo.findById(agentId1);
      const agent2 = await agentRepo.findById(agentId2);
      const agent3 = await agentRepo.findById(agentId3);

      expect(agent1.role).toBe('researcher');
      expect(agent2.role).toBe('coder');
      expect(agent3.role).toBe('reviewer');
    });

    it('should create hierarchical agent with correct depth level', async () => {
      // Create parent agent
      const parentId = await agentService.spawnAgent('coordinator', 'Coordinate tasks', 20000);
      const parent = await agentRepo.findById(parentId);
      expect(parent.depth_level).toBe(0);

      // Create child agent
      const childId = await agentService.spawnAgent('worker', 'Execute subtask', 5000, parentId);
      const child = await agentRepo.findById(childId);

      expect(child.depth_level).toBe(1);
      expect(child.parent_id).toBe(parentId);

      // Create grandchild agent
      const grandchildId = await agentService.spawnAgent('specialist', 'Specialized task', 2000, childId);
      const grandchild = await agentRepo.findById(grandchildId);

      expect(grandchild.depth_level).toBe(2);
      expect(grandchild.parent_id).toBe(childId);
    });

    it('should handle spawning with default token limit', async () => {
      const agentId = await agentService.spawnAgent(
        'tester',
        'Run comprehensive tests'
        // No token limit specified - should use default
      );

      const budget = await agentService.getBudget(agentId);
      expect(budget.token_limit).toBe(100000); // Default from AgentService
    });
  });

  describe('Budget Allocation', () => {
    it('should allocate budget correctly on agent spawn', async () => {
      const tokenLimit = 50000;
      const agentId = await agentService.spawnAgent('coder', 'Write code', tokenLimit);

      const budget = await budgetRepo.getByAgentId(agentId);
      expect(budget).not.toBeNull();
      expect(budget!.allocated).toBe(tokenLimit);
      expect(budget!.used).toBe(0);
      expect(budget!.reserved).toBe(0);
      expect(budget!.agent_id).toBe(agentId);
    });

    it('should create budget record for every agent', async () => {
      const agentIds = [
        await agentService.spawnAgent('agent1', 'Task 1', 10000),
        await agentService.spawnAgent('agent2', 'Task 2', 20000),
        await agentService.spawnAgent('agent3', 'Task 3', 15000),
      ];

      for (const agentId of agentIds) {
        const budget = await budgetRepo.getByAgentId(agentId);
        expect(budget).not.toBeNull();
        expect(budget!.used).toBe(0);
      }
    });

    it('should reserve budget from parent when spawning child', async () => {
      const parentTokens = 100000;
      const childTokens = 25000;

      // Create parent agent
      const parentId = await agentService.spawnAgent('parent', 'Parent task', parentTokens);
      const parentBudgetBefore = await budgetRepo.getByAgentId(parentId);
      expect(parentBudgetBefore!.reserved).toBe(0);

      // Create child agent - should reserve from parent
      const childId = await agentService.spawnAgent('child', 'Child task', childTokens, parentId);

      // Verify child budget
      const childBudget = await budgetRepo.getByAgentId(childId);
      expect(childBudget!.allocated).toBe(childTokens);
      expect(childBudget!.used).toBe(0);

      // Verify parent budget has reserved amount
      const parentBudgetAfter = await budgetRepo.getByAgentId(parentId);
      expect(parentBudgetAfter!.reserved).toBe(childTokens);
      expect(parentBudgetAfter!.used).toBe(0);
      expect(parentBudgetAfter!.allocated).toBe(parentTokens);
    });

    it('should reject child spawn if parent has insufficient budget', async () => {
      const parentTokens = 10000;
      const childTokens = 15000; // More than parent has

      const parentId = await agentService.spawnAgent('parent', 'Parent task', parentTokens);

      // Attempt to spawn child with more budget than parent has
      await expect(
        agentService.spawnAgent('child', 'Child task', childTokens, parentId)
      ).rejects.toThrow(/Insufficient budget/i);
    });

    it('should track remaining budget correctly', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      // Initial state
      let remaining = await budgetRepo.getRemainingBudget(agentId);
      expect(remaining).toBe(10000);

      // Consume some tokens
      await budgetRepo.incrementUsed(agentId, 3000);
      remaining = await budgetRepo.getRemainingBudget(agentId);
      expect(remaining).toBe(7000);

      // Consume more tokens
      await budgetRepo.incrementUsed(agentId, 2000);
      remaining = await budgetRepo.getRemainingBudget(agentId);
      expect(remaining).toBe(5000);
    });

    it('should prevent consuming more tokens than allocated', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 5000);

      // Try to consume more than allocated
      await expect(
        budgetRepo.incrementUsed(agentId, 6000)
      ).rejects.toThrow(/Insufficient budget/i);
    });
  });

  describe('Agent Status Retrieval', () => {
    it('should retrieve agent status correctly', async () => {
      const agentId = await agentService.spawnAgent('researcher', 'Research task', 10000);

      const status = await agentService.getAgentStatus(agentId);
      expect(status).toBeDefined();
      expect(status.id).toBe(agentId);
      expect(status.status).toBe('pending');
      expect(status.role).toBe('researcher');
    });

    it('should throw error when retrieving non-existent agent', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        agentService.getAgentStatus(fakeId)
      ).rejects.toThrow(/Agent not found/i);
    });

    it('should retrieve system summary correctly', async () => {
      // Create agents with different statuses
      const agent1 = await agentService.spawnAgent('agent1', 'Task 1', 10000);
      const agent2 = await agentService.spawnAgent('agent2', 'Task 2', 15000);
      const agent3 = await agentService.spawnAgent('agent3', 'Task 3', 20000);

      // Update statuses
      await agentService.updateAgentStatus(agent1, 'executing');
      await agentService.updateAgentStatus(agent2, 'completed');

      const summary = await agentService.getSystemSummary();

      expect(summary.totalAgents).toBe(3);
      expect(summary.byStatus.pending).toBe(1);
      expect(summary.byStatus.executing).toBe(1);
      expect(summary.byStatus.completed).toBe(1);
      expect(summary.totalTokensUsed).toBe(0);
    });
  });

  describe('Agent Completion', () => {
    it('should transition from pending to executing to completed', async () => {
      const agentId = await agentService.spawnAgent('tester', 'Run tests', 20000);

      // Initial status: pending
      let agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('pending');
      expect(agent.completed_at).toBeNull();

      // Transition to executing
      await agentService.updateAgentStatus(agentId, 'executing');
      agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('executing');
      expect(agent.completed_at).toBeNull();

      // Transition to completed
      await agentService.updateAgentStatus(agentId, 'completed');
      agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('completed');
      expect(agent.completed_at).toBeInstanceOf(Date);
      expect(agent.completed_at!.getTime()).toBeGreaterThan(agent.created_at.getTime());
    });

    it('should update timestamps correctly on completion', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      const beforeCompletion = new Date();

      // Complete the agent
      await agentService.updateAgentStatus(agentId, 'completed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.completed_at).not.toBeNull();
      expect(agent.completed_at!.getTime()).toBeGreaterThanOrEqual(beforeCompletion.getTime());
      expect(agent.updated_at.getTime()).toBeGreaterThanOrEqual(agent.created_at.getTime());
    });

    it('should allow direct completion from pending', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Quick task', 5000);

      // Skip executing and go directly to completed
      await agentService.updateAgentStatus(agentId, 'completed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('completed');
      expect(agent.completed_at).toBeInstanceOf(Date);
    });
  });

  describe('Child Agent Management', () => {
    it('should retrieve all child agents of a parent', async () => {
      const parentId = await agentService.spawnAgent('parent', 'Parent task', 50000);

      // Spawn multiple children
      const child1 = await agentService.spawnAgent('child1', 'Child task 1', 10000, parentId);
      const child2 = await agentService.spawnAgent('child2', 'Child task 2', 15000, parentId);
      const child3 = await agentService.spawnAgent('child3', 'Child task 3', 8000, parentId);

      const children = await agentService.getChildAgents(parentId);

      expect(children).toHaveLength(3);
      expect(children.map(c => c.id)).toContain(child1);
      expect(children.map(c => c.id)).toContain(child2);
      expect(children.map(c => c.id)).toContain(child3);

      // All children should have correct parent_id
      children.forEach(child => {
        expect(child.parent_id).toBe(parentId);
        expect(child.depth_level).toBe(1);
      });
    });

    it('should return empty array for agent with no children', async () => {
      const agentId = await agentService.spawnAgent('lonely', 'Solo task', 10000);

      const children = await agentService.getChildAgents(agentId);
      expect(children).toHaveLength(0);
    });
  });

  describe('Token Usage Tracking', () => {
    it('should update token usage correctly', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      // Initial usage
      let budget = await agentService.getBudget(agentId);
      expect(budget.tokens_used).toBe(0);

      // Update token usage
      await agentService.updateTokenUsage(agentId, 1500);
      budget = await agentService.getBudget(agentId);
      expect(budget.tokens_used).toBe(1500);

      // Update again
      await agentService.updateTokenUsage(agentId, 2500);
      budget = await agentService.getBudget(agentId);
      expect(budget.tokens_used).toBe(4000);
    });

    it('should calculate estimated cost correctly', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      const tokensUsed = 1000;
      const costPerToken = 0.000003; // Default Claude Sonnet pricing

      await agentService.updateTokenUsage(agentId, tokensUsed, costPerToken);

      const budget = await agentService.getBudget(agentId);
      expect(budget.estimated_cost).toBeCloseTo(tokensUsed * costPerToken, 10);
    });

    it('should detect budget exceeded correctly', async () => {
      const tokenLimit = 5000;
      const agentId = await agentService.spawnAgent('agent', 'Task', tokenLimit);

      // Not exceeded initially
      let exceeded = await agentService.isBudgetExceeded(agentId);
      expect(exceeded).toBe(false);

      // Use some tokens, not exceeded
      await budgetRepo.incrementUsed(agentId, 3000);
      exceeded = await agentService.isBudgetExceeded(agentId);
      expect(exceeded).toBe(false);

      // Use more tokens, now exceeded
      await budgetRepo.incrementUsed(agentId, 2000);
      exceeded = await agentService.isBudgetExceeded(agentId);
      expect(exceeded).toBe(true);
    });
  });
});

describe('US1: Agent Status Transitions', () => {
  let agentService: AgentService;
  let agentRepo: AgentRepository;

  beforeAll(async () => {
    await db.initialize();
    agentService = new AgentService();
    agentRepo = new AgentRepository();
  });

  afterAll(async () => {
    await db.shutdown();
  });

  beforeEach(async () => {
    // Clean test data
    await db.query('DELETE FROM checkpoints');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM agents');
  });

  describe('State Machine Transitions', () => {
    it('should allow valid transition: pending -> executing', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'executing');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('executing');
    });

    it('should allow valid transition: executing -> completed', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'completed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('completed');
    });

    it('should allow valid transition: executing -> failed', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'failed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('failed');
      expect(agent.completed_at).toBeInstanceOf(Date);
    });

    it('should allow valid transition: pending -> terminated', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'terminated');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('terminated');
      expect(agent.completed_at).toBeInstanceOf(Date);
    });

    it('should allow valid transition: executing -> terminated', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'terminated');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('terminated');
    });

    it('should handle all status types correctly', async () => {
      const statuses: Array<'pending' | 'executing' | 'completed' | 'failed' | 'terminated'> = [
        'pending',
        'executing',
        'completed',
        'failed',
        'terminated',
      ];

      for (const status of statuses) {
        const agentId = await agentService.spawnAgent('agent', `Task ${status}`, 10000);
        await agentService.updateAgentStatus(agentId, status);

        const agent = await agentRepo.findById(agentId);
        expect(agent.status).toBe(status);
      }
    });
  });

  describe('Terminal Status Behavior', () => {
    it('should set completed_at for completed status', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'completed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.completed_at).not.toBeNull();
      expect(agent.completed_at).toBeInstanceOf(Date);
    });

    it('should set completed_at for failed status', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'failed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.completed_at).not.toBeNull();
    });

    it('should set completed_at for terminated status', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'terminated');

      const agent = await agentRepo.findById(agentId);
      expect(agent.completed_at).not.toBeNull();
    });

    it('should not set completed_at for pending status', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('pending');
      expect(agent.completed_at).toBeNull();
    });

    it('should not set completed_at for executing status', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'executing');

      const agent = await agentRepo.findById(agentId);
      expect(agent.completed_at).toBeNull();
    });
  });

  describe('Agent Termination', () => {
    it('should terminate pending agent', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      await agentService.updateAgentStatus(agentId, 'terminated');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('terminated');
      expect(agent.completed_at).toBeInstanceOf(Date);
    });

    it('should terminate executing agent', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'terminated');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('terminated');
    });

    it('should allow termination at any non-terminal state', async () => {
      // Test termination from pending
      const agent1 = await agentService.spawnAgent('agent1', 'Task', 10000);
      await agentService.updateAgentStatus(agent1, 'terminated');
      let status1 = await agentRepo.findById(agent1);
      expect(status1.status).toBe('terminated');

      // Test termination from executing
      const agent2 = await agentService.spawnAgent('agent2', 'Task', 10000);
      await agentService.updateAgentStatus(agent2, 'executing');
      await agentService.updateAgentStatus(agent2, 'terminated');
      let status2 = await agentRepo.findById(agent2);
      expect(status2.status).toBe('terminated');
    });
  });

  describe('Failure Scenarios', () => {
    it('should handle agent failure correctly', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      // Simulate failure
      await agentService.updateAgentStatus(agentId, 'failed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('failed');
      expect(agent.completed_at).toBeInstanceOf(Date);
    });

    it('should allow failure from executing state', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');

      await agentService.updateAgentStatus(agentId, 'failed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('failed');
    });

    it('should preserve failure state', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      await agentService.updateAgentStatus(agentId, 'executing');
      await agentService.updateAgentStatus(agentId, 'failed');

      // Check that failed state persists
      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('failed');

      // Verify it's still failed after another query
      const agentAgain = await agentService.getAgentStatus(agentId);
      expect(agentAgain.status).toBe('failed');
    });
  });

  describe('Status Updates in Database', () => {
    it('should persist status changes to database', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      // Update status
      await agentService.updateAgentStatus(agentId, 'executing');

      // Verify by direct database query
      const result = await db.query<Agent>(
        'SELECT status FROM agents WHERE id = $1',
        [agentId]
      );
      expect(result.rows[0].status).toBe('executing');
    });

    it('should update updated_at timestamp on status change', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);
      const initialAgent = await agentRepo.findById(agentId);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await agentService.updateAgentStatus(agentId, 'executing');
      const updatedAgent = await agentRepo.findById(agentId);

      expect(updatedAgent.updated_at.getTime()).toBeGreaterThan(
        initialAgent.updated_at.getTime()
      );
    });

    it('should handle multiple rapid status updates', async () => {
      const agentId = await agentService.spawnAgent('agent', 'Task', 10000);

      // Rapid status changes
      await agentService.updateAgentStatus(agentId, 'executing');
      await agentService.updateAgentStatus(agentId, 'completed');

      const agent = await agentRepo.findById(agentId);
      expect(agent.status).toBe('completed');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when updating non-existent agent', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // The update won't throw but won't update anything
      await agentService.updateAgentStatus(fakeId, 'executing');

      // Verify agent doesn't exist
      await expect(
        agentRepo.findById(fakeId)
      ).rejects.toThrow(/Agent not found/i);
    });

    it('should handle invalid agent ID format gracefully', async () => {
      const invalidId = 'not-a-valid-uuid';

      await expect(
        agentRepo.findById(invalidId)
      ).rejects.toThrow();
    });
  });
});
