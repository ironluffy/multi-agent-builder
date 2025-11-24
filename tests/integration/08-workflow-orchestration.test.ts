/**
 * Integration Tests - Phase 8: Workflow Orchestration
 * Tests for event-driven workflow execution, dependency resolution, and result passing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../src/infrastructure/SharedDatabase.js';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';
import { WorkflowRepository } from '../../src/database/repositories/WorkflowRepository.js';
import { AgentRepository } from '../../src/database/repositories/AgentRepository.js';
import { BudgetRepository } from '../../src/database/repositories/BudgetRepository.js';
import type { WorkflowTemplate } from '../../src/models/WorkflowTemplate.js';

describe('US6: Workflow Composition - Integration Tests', () => {
  let workflowService: WorkflowService;
  let workflowEngine: WorkflowEngine;
  let workflowRepo: WorkflowRepository;
  let agentRepo: AgentRepository;
  let budgetRepo: BudgetRepository;

  // Test fixtures
  let parentAgentId: string;
  let rootBudgetId: string;

  beforeAll(async () => {
    await db.initialize();
    workflowService = new WorkflowService();
    workflowEngine = new WorkflowEngine();
    workflowRepo = new WorkflowRepository();
    agentRepo = new AgentRepository();
    budgetRepo = new BudgetRepository();
  });

  afterAll(async () => {
    await db.shutdown();
  });

  beforeEach(async () => {
    // Create root agent and budget for each test
    const rootAgent = await agentRepo.create({
      role: 'orchestrator',
      task_description: 'Root orchestrator',
      depth_level: 0,
      parent_id: null,
    });
    parentAgentId = rootAgent.id;

    const rootBudget = await budgetRepo.create(parentAgentId, 1000000);
    rootBudgetId = rootBudget.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM workflow_nodes');
    await db.query('DELETE FROM workflow_graphs');
    await db.query('DELETE FROM workflow_templates');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM agents');
  });

  describe('Template Creation and Instantiation', () => {
    it('should create a workflow template with node templates', async () => {
      const template = await workflowService.createTemplate({
        name: 'backend-dev-workflow',
        description: 'Backend development workflow',
        category: 'development',
        node_templates: [
          {
            node_id: 'architect',
            role: 'system-architect',
            task_template: 'Design architecture for: {TASK}',
            budget_percentage: 20,
            dependencies: [],
            position: 0,
          },
          {
            node_id: 'implementer',
            role: 'backend-dev',
            task_template: 'Implement backend for: {TASK}',
            budget_percentage: 40,
            dependencies: ['architect'],
            position: 1,
          },
          {
            node_id: 'tester',
            role: 'tester',
            task_template: 'Test implementation for: {TASK}',
            budget_percentage: 30,
            dependencies: ['implementer'],
            position: 2,
          },
          {
            node_id: 'reviewer',
            role: 'reviewer',
            task_template: 'Review code for: {TASK}',
            budget_percentage: 10,
            dependencies: ['tester'],
            position: 3,
          },
        ],
        edge_patterns: [],
        total_estimated_budget: 500000,
        complexity_rating: 7.5,
        min_budget_required: 400000,
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('backend-dev-workflow');
      expect(template.node_templates).toHaveLength(4);
      expect(template.usage_count).toBe(0);
    });

    it('should instantiate a template into a workflow graph', async () => {
      // Create template
      const template = await workflowService.createTemplate({
        name: 'simple-workflow',
        description: 'Simple 2-node workflow',
        category: 'test',
        node_templates: [
          {
            node_id: 'task1',
            role: 'coder',
            task_template: 'Code: {TASK}',
            budget_percentage: 60,
            dependencies: [],
            position: 0,
          },
          {
            node_id: 'task2',
            role: 'tester',
            task_template: 'Test: {TASK}',
            budget_percentage: 40,
            dependencies: ['task1'],
            position: 1,
          },
        ],
        edge_patterns: [],
        total_estimated_budget: 100000,
        complexity_rating: 3.0,
        min_budget_required: 80000,
      });

      // Instantiate template
      const { graph, nodes } = await workflowService.instantiateTemplate(
        template.id,
        'auth-feature',
        'authentication system',
        100000
      );

      expect(graph.id).toBeDefined();
      expect(graph.name).toBe('auth-feature');
      expect(graph.template_id).toBe(template.id);
      expect(graph.status).toBe('active');
      expect(nodes).toHaveLength(2);

      // Check budget allocation
      expect(nodes[0].budget_allocation).toBe(60000); // 60% of 100k
      expect(nodes[1].budget_allocation).toBe(40000); // 40% of 100k

      // Check task substitution
      expect(nodes[0].task_description).toContain('authentication system');
      expect(nodes[1].task_description).toContain('authentication system');
    });

    it('should reject instantiation with insufficient budget', async () => {
      const template = await workflowService.createTemplate({
        name: 'expensive-workflow',
        description: 'Expensive workflow',
        category: 'test',
        node_templates: [
          {
            node_id: 'task1',
            role: 'coder',
            task_template: 'Code: {TASK}',
            budget_percentage: 100,
            dependencies: [],
            position: 0,
          },
        ],
        edge_patterns: [],
        total_estimated_budget: 500000,
        complexity_rating: 5.0,
        min_budget_required: 400000,
      });

      await expect(
        workflowService.instantiateTemplate(template.id, 'test', 'test task', 300000)
      ).rejects.toThrow('less than minimum');
    });
  });

  describe('DAG Validation', () => {
    it('should validate a valid DAG workflow', async () => {
      // Create a simple linear workflow
      const { graph, nodes } = await createLinearWorkflow(3);

      const validation = await workflowEngine.validateWorkflowGraph(graph.id);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Check graph updated
      const updatedGraph = await workflowRepo.findGraphById(graph.id);
      expect(updatedGraph?.validation_status).toBe('validated');
    });

    it('should detect cycles in workflow dependencies', async () => {
      // Create graph with nodes
      const graph = await workflowRepo.createGraph({
        name: 'cyclic-workflow',
        description: 'Workflow with cycle',
        total_nodes: 3,
        estimated_budget: 100000,
      });

      // Create nodes with circular dependency: A -> B -> C -> A
      const nodeA = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'task-a',
        task_description: 'Task A',
        budget_allocation: 30000,
        dependencies: [], // Will add C's ID after creation
        position: 0,
      });

      const nodeB = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'task-b',
        task_description: 'Task B',
        budget_allocation: 30000,
        dependencies: [nodeA.id],
        position: 1,
      });

      const nodeC = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'task-c',
        task_description: 'Task C',
        budget_allocation: 40000,
        dependencies: [nodeB.id],
        position: 2,
      });

      // Create cycle: A depends on C
      await workflowRepo.updateNode(nodeA.id, {
        // @ts-expect-error Testing invalid state
        dependencies: [nodeC.id],
      });

      // Validate - should detect cycle
      const validation = await workflowEngine.validateWorkflowGraph(graph.id);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);

      const updatedGraph = await workflowRepo.findGraphById(graph.id);
      expect(updatedGraph?.validation_status).toBe('invalid');
    });

    it('should detect invalid dependencies', async () => {
      const graph = await workflowRepo.createGraph({
        name: 'invalid-deps',
        description: 'Workflow with invalid dependencies',
        total_nodes: 1,
        estimated_budget: 50000,
      });

      // Create node with non-existent dependency
      await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'task-a',
        task_description: 'Task A',
        budget_allocation: 50000,
        dependencies: ['00000000-0000-0000-0000-000000000000'], // Non-existent UUID
        position: 0,
      });

      const validation = await workflowEngine.validateWorkflowGraph(graph.id);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === 'INVALID_DEPENDENCY')).toBe(true);
    });
  });

  describe('Event-Driven Workflow Execution', () => {
    it('should spawn only zero-dependency nodes initially', async () => {
      // Create a 4-node linear workflow: A -> B -> C -> D
      const { graph, nodes } = await createLinearWorkflow(4);

      // Execute workflow
      const spawnedAgents = await workflowEngine.executeWorkflow(graph.id, parentAgentId);

      // Should only spawn first node (zero dependencies)
      expect(spawnedAgents.size).toBe(1);
      expect(spawnedAgents.has(nodes[0].id)).toBe(true);

      // Check node status
      const node0 = await workflowRepo.findNodeById(nodes[0].id);
      expect(node0?.execution_status).toBe('executing');
      expect(node0?.agent_id).toBeDefined();

      // Other nodes should still be pending
      const node1 = await workflowRepo.findNodeById(nodes[1].id);
      const node2 = await workflowRepo.findNodeById(nodes[2].id);
      const node3 = await workflowRepo.findNodeById(nodes[3].id);

      expect(node1?.execution_status).toBe('pending');
      expect(node2?.execution_status).toBe('pending');
      expect(node3?.execution_status).toBe('pending');
    });

    it('should spawn dependent nodes after dependencies complete', async () => {
      // Create 3-node workflow: A -> B -> C
      const { graph, nodes } = await createLinearWorkflow(3);

      // Execute workflow - spawns node A
      const spawnedAgents = await workflowEngine.executeWorkflow(graph.id, parentAgentId);
      const nodeA = await workflowRepo.findNodeById(nodes[0].id);
      const agentAId = nodeA!.agent_id!;

      // Simulate node A completion
      await agentRepo.update(agentAId, { status: 'completed' });
      await workflowEngine.processCompletedNode(agentAId, { output: 'A result' });

      // Check node A marked as completed
      const completedA = await workflowRepo.findNodeById(nodes[0].id);
      expect(completedA?.execution_status).toBe('completed');
      expect(completedA?.result).toEqual({ output: 'A result' });

      // Check node B spawned (depends on A)
      const nodeB = await workflowRepo.findNodeById(nodes[1].id);
      expect(nodeB?.execution_status).toBe('executing');
      expect(nodeB?.agent_id).toBeDefined();

      // Node C should still be pending (depends on B)
      const nodeC = await workflowRepo.findNodeById(nodes[2].id);
      expect(nodeC?.execution_status).toBe('pending');
    });

    it('should pass dependency results to dependent nodes', async () => {
      // Create 2-node workflow: A -> B
      const { graph, nodes } = await createLinearWorkflow(2);

      // Execute and complete node A with result
      await workflowEngine.executeWorkflow(graph.id, parentAgentId);
      const nodeA = await workflowRepo.findNodeById(nodes[0].id);
      const agentAId = nodeA!.agent_id!;

      const resultFromA = {
        api_design: 'REST endpoints defined',
        schemas: ['User', 'Post'],
      };

      await agentRepo.update(agentAId, { status: 'completed' });
      await workflowEngine.processCompletedNode(agentAId, resultFromA);

      // Check node B received A's result
      const nodeB = await workflowRepo.findNodeById(nodes[1].id);
      expect(nodeB?.execution_status).toBe('executing');

      // Check that B's agent got enhanced task description with A's result
      const agentB = await agentRepo.findById(nodeB!.agent_id!);
      expect(agentB?.task_description).toContain('Dependency outputs');
      expect(agentB?.task_description).toContain('REST endpoints defined');
    });

    it('should mark workflow as completed when all nodes finish', async () => {
      // Create 2-node workflow
      const { graph, nodes } = await createLinearWorkflow(2);

      // Execute workflow
      await workflowEngine.executeWorkflow(graph.id, parentAgentId);

      // Complete node A
      const nodeA = await workflowRepo.findNodeById(nodes[0].id);
      await agentRepo.update(nodeA!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(nodeA!.agent_id!);

      // Workflow should still be active
      let graphStatus = await workflowRepo.findGraphById(graph.id);
      expect(graphStatus?.status).toBe('active');

      // Complete node B
      const nodeB = await workflowRepo.findNodeById(nodes[1].id);
      await agentRepo.update(nodeB!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(nodeB!.agent_id!);

      // Workflow should now be completed
      graphStatus = await workflowRepo.findGraphById(graph.id);
      expect(graphStatus?.status).toBe('completed');
      expect(graphStatus?.completed_at).toBeDefined();
    });
  });

  describe('Parallel Execution (Diamond Pattern)', () => {
    it('should spawn parallel nodes when dependencies are met', async () => {
      // Create diamond pattern: A -> B, A -> C, B -> D, C -> D
      const graph = await workflowRepo.createGraph({
        name: 'diamond-workflow',
        description: 'Diamond dependency pattern',
        total_nodes: 4,
        estimated_budget: 200000,
      });

      const nodeA = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'architect',
        task_description: 'Design architecture',
        budget_allocation: 50000,
        dependencies: [],
        position: 0,
      });

      const nodeB = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'backend-dev',
        task_description: 'Build backend',
        budget_allocation: 60000,
        dependencies: [nodeA.id],
        position: 1,
      });

      const nodeC = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'frontend-dev',
        task_description: 'Build frontend',
        budget_allocation: 60000,
        dependencies: [nodeA.id],
        position: 2,
      });

      const nodeD = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: 'integrator',
        task_description: 'Integration',
        budget_allocation: 30000,
        dependencies: [nodeB.id, nodeC.id],
        position: 3,
      });

      // Execute - spawns only A
      await workflowEngine.executeWorkflow(graph.id, parentAgentId);

      // Complete A
      const freshA = await workflowRepo.findNodeById(nodeA.id);
      await agentRepo.update(freshA!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(freshA!.agent_id!);

      // Both B and C should spawn (parallel branches)
      const freshB = await workflowRepo.findNodeById(nodeB.id);
      const freshC = await workflowRepo.findNodeById(nodeC.id);
      expect(freshB?.execution_status).toBe('executing');
      expect(freshC?.execution_status).toBe('executing');

      // D should still be pending (needs both B and C)
      const freshD = await workflowRepo.findNodeById(nodeD.id);
      expect(freshD?.execution_status).toBe('pending');

      // Complete B (D should still wait for C)
      await agentRepo.update(freshB!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(freshB!.agent_id!);

      const freshD2 = await workflowRepo.findNodeById(nodeD.id);
      expect(freshD2?.execution_status).toBe('pending');

      // Complete C (now D should spawn)
      await agentRepo.update(freshC!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(freshC!.agent_id!);

      const freshD3 = await workflowRepo.findNodeById(nodeD.id);
      expect(freshD3?.execution_status).toBe('executing');
    });
  });

  describe('Workflow Termination', () => {
    it('should terminate all executing nodes when workflow fails', async () => {
      const { graph, nodes } = await createLinearWorkflow(3);

      // Start workflow
      await workflowEngine.executeWorkflow(graph.id, parentAgentId);

      // Complete node A to spawn node B
      const nodeA = await workflowRepo.findNodeById(nodes[0].id);
      await agentRepo.update(nodeA!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(nodeA!.agent_id!);

      // Now terminate workflow
      await workflowEngine.terminateWorkflow(graph.id);

      // Check workflow status
      const terminatedGraph = await workflowRepo.findGraphById(graph.id);
      expect(terminatedGraph?.status).toBe('failed');

      // Check executing nodes marked as skipped
      const nodeB = await workflowRepo.findNodeById(nodes[1].id);
      expect(nodeB?.execution_status).toBe('skipped');
      expect(nodeB?.error_message).toContain('terminated');
    });
  });

  describe('Workflow Progress Tracking', () => {
    it('should accurately track workflow progress', async () => {
      const { graph, nodes } = await createLinearWorkflow(4);

      // Initial progress (no nodes started)
      let progress = await workflowEngine.getWorkflowProgress(graph.id);
      expect(progress.total).toBe(4);
      expect(progress.pending).toBe(4);
      expect(progress.executing).toBe(0);
      expect(progress.completed).toBe(0);

      // Start workflow (spawns node 0)
      await workflowEngine.executeWorkflow(graph.id, parentAgentId);
      progress = await workflowEngine.getWorkflowProgress(graph.id);
      expect(progress.executing).toBe(1);
      expect(progress.pending).toBe(3);

      // Complete node 0
      const node0 = await workflowRepo.findNodeById(nodes[0].id);
      await agentRepo.update(node0!.agent_id!, { status: 'completed' });
      await workflowEngine.processCompletedNode(node0!.agent_id!);

      progress = await workflowEngine.getWorkflowProgress(graph.id);
      expect(progress.completed).toBe(1);
      expect(progress.executing).toBe(1); // Node 1 spawned
      expect(progress.pending).toBe(2);
    });
  });

  // Helper function to create linear workflow
  async function createLinearWorkflow(nodeCount: number): Promise<{
    graph: any;
    nodes: any[];
  }> {
    const graph = await workflowRepo.createGraph({
      name: `linear-workflow-${nodeCount}`,
      description: `Linear workflow with ${nodeCount} nodes`,
      total_nodes: nodeCount,
      estimated_budget: nodeCount * 25000,
    });

    const nodes = [];
    let prevNodeId: string | null = null;

    for (let i = 0; i < nodeCount; i++) {
      const node = await workflowRepo.createNode({
        workflow_graph_id: graph.id,
        role: `task-${i}`,
        task_description: `Task ${i}`,
        budget_allocation: 25000,
        dependencies: prevNodeId ? [prevNodeId] : [],
        position: i,
      });
      nodes.push(node);
      prevNodeId = node.id;
    }

    return { graph, nodes };
  }
});
