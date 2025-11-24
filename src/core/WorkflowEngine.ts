import { WorkflowRepository } from '../database/repositories/WorkflowRepository.js';
import { AgentService } from '../services/AgentService.js';
import { logger } from '../utils/Logger.js';
import type { WorkflowNode } from '../models/WorkflowNode.js';

/**
 * WorkflowEngine
 * Core orchestration logic for executing workflow graphs as coordinated multi-agent systems.
 *
 * Responsibilities:
 * - DAG validation (cycle detection, topological sort)
 * - Dependency resolution
 * - Node spawning with proper sequencing
 * - Parallel execution of independent nodes
 * - Workflow progress tracking
 */
export class WorkflowEngine {
  private workflowRepo: WorkflowRepository;
  private agentService: AgentService;
  private engineLogger = logger.child({ component: 'WorkflowEngine' });

  constructor() {
    this.workflowRepo = new WorkflowRepository();
    this.agentService = new AgentService();
  }

  /**
   * Validate workflow graph structure
   * Checks for:
   * - Acyclic graph (no circular dependencies)
   * - Valid topological ordering
   * - All dependencies reference existing nodes
   *
   * @param graphId - Workflow graph UUID
   * @returns Validation result with errors if invalid
   */
  async validateWorkflowGraph(graphId: string): Promise<{
    valid: boolean;
    errors: Array<{ code: string; details: string }>;
  }> {
    this.engineLogger.info({ graphId }, 'Validating workflow graph');

    const errors: Array<{ code: string; details: string }> = [];

    try {
      // 1. Load graph and nodes
      const graph = await this.workflowRepo.findGraphById(graphId);
      if (!graph) {
        errors.push({ code: 'GRAPH_NOT_FOUND', details: `Graph ${graphId} not found` });
        return { valid: false, errors };
      }

      const nodes = await this.workflowRepo.findNodesByGraphId(graphId);
      if (nodes.length === 0) {
        errors.push({ code: 'EMPTY_GRAPH', details: 'Graph has no nodes' });
        return { valid: false, errors };
      }

      // 2. Build node map for quick lookups
      const nodeMap = new Map<string, WorkflowNode>();
      nodes.forEach(node => nodeMap.set(node.id, node));

      // 3. Validate dependencies reference existing nodes
      for (const node of nodes) {
        const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
        for (const depId of deps) {
          if (!nodeMap.has(depId)) {
            errors.push({
              code: 'INVALID_DEPENDENCY',
              details: `Node ${node.id} references non-existent dependency ${depId}`,
            });
          }
        }
      }

      // 4. Detect cycles using DFS
      const hasCycle = this.detectCycle(nodes, nodeMap);
      if (hasCycle) {
        errors.push({
          code: 'CIRCULAR_DEPENDENCY',
          details: 'Graph contains circular dependencies (cycle detected)',
        });
      }

      // 5. Verify topological sort is possible
      if (!hasCycle) {
        const sorted = this.topologicalSort(nodes, nodeMap);
        if (!sorted) {
          errors.push({
            code: 'TOPOLOGICAL_SORT_FAILED',
            details: 'Cannot compute topological ordering',
          });
        }
      }

      const valid = errors.length === 0;

      // Update graph validation status
      await this.workflowRepo.updateGraph(graphId, {
        validation_status: valid ? 'validated' : 'invalid',
        validation_errors: errors.length > 0 ? errors : null,
        validated_at: new Date(),
      });

      this.engineLogger.info(
        { graphId, valid, errorCount: errors.length },
        'Workflow graph validation complete'
      );

      return { valid, errors };
    } catch (error) {
      this.engineLogger.error({ error, graphId }, 'Workflow validation failed');
      throw error;
    }
  }

  /**
   * Detect cycles in workflow graph using DFS
   */
  private detectCycle(nodes: WorkflowNode[], nodeMap: Map<string, WorkflowNode>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // Cycle detected
      }
      if (visited.has(nodeId)) {
        return false; // Already processed
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node) {
        const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
        for (const depId of deps) {
          if (dfs(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Compute topological sort order for workflow nodes
   * Returns null if cycle is detected
   */
  private topologicalSort(
    nodes: WorkflowNode[],
    nodeMap: Map<string, WorkflowNode>
  ): string[] | null {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    });

    // Build adjacency list and in-degree counts
    nodes.forEach(node => {
      const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
      deps.forEach(depId => {
        if (nodeMap.has(depId)) {
          adjList.get(depId)!.push(node.id);
          inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
        }
      });
    });

    // Kahn's algorithm
    const queue: string[] = [];
    const sorted: string[] = [];

    // Start with nodes that have no dependencies
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      neighbors.forEach(neighborId => {
        const newDegree = (inDegree.get(neighborId) || 0) - 1;
        inDegree.set(neighborId, newDegree);
        if (newDegree === 0) {
          queue.push(neighborId);
        }
      });
    }

    // If sorted length != nodes length, there's a cycle
    return sorted.length === nodes.length ? sorted : null;
  }

  /**
   * Execute workflow by spawning ONLY nodes with zero dependencies
   *
   * IMPORTANT: This method only spawns the initial nodes. Subsequent nodes
   * are spawned by processCompletedNode() when their dependencies complete.
   *
   * @param graphId - Workflow graph UUID
   * @param parentAgentId - Parent agent orchestrating this workflow
   * @returns Map of spawned node IDs to agent IDs (only initial nodes)
   */
  async executeWorkflow(
    graphId: string,
    parentAgentId: string
  ): Promise<Map<string, string>> {
    this.engineLogger.info({ graphId, parentAgentId }, 'Starting workflow execution');

    try {
      // 1. Validate graph first
      const validation = await this.validateWorkflowGraph(graphId);
      if (!validation.valid) {
        throw new Error(
          `Workflow validation failed: ${validation.errors.map(e => e.details).join(', ')}`
        );
      }

      // 2. Load nodes
      const nodes = await this.workflowRepo.findNodesByGraphId(graphId);

      // 3. Find nodes with ZERO dependencies (starting nodes)
      const startingNodes = nodes.filter(node => {
        const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
        return deps.length === 0;
      });

      if (startingNodes.length === 0) {
        throw new Error('Workflow has no starting nodes (all nodes have dependencies)');
      }

      // 4. Spawn ONLY starting nodes
      const spawnedAgents = new Map<string, string>();

      for (const node of startingNodes) {
        this.engineLogger.info(
          { nodeId: node.id, role: node.role },
          'Spawning initial workflow node'
        );

        const agentId = await this.agentService.spawnAgent(
          node.role,
          node.task_description,
          node.budget_allocation,
          parentAgentId
        );

        spawnedAgents.set(node.id, agentId);

        // Update node status
        await this.workflowRepo.updateNode(node.id, {
          agent_id: agentId,
          execution_status: 'executing',
          spawn_timestamp: new Date(),
        });
      }

      // 5. Mark graph as active
      await this.workflowRepo.updateGraph(graphId, {
        status: 'active',
      });

      this.engineLogger.info(
        { graphId, startingNodesSpawned: spawnedAgents.size, totalNodes: nodes.length },
        'Workflow execution started - waiting for nodes to complete'
      );

      return spawnedAgents;
    } catch (error) {
      this.engineLogger.error({ error, graphId }, 'Workflow execution failed');

      await this.workflowRepo.updateGraph(graphId, {
        status: 'failed',
      });

      throw error;
    }
  }

  /**
   * Process a completed node and spawn dependent nodes if ready
   *
   * This method should be called when an agent completes (via polling or event).
   * It checks which workflow nodes depend on the completed node and spawns them
   * if all their dependencies are now satisfied.
   *
   * @param agentId - Completed agent UUID
   * @param result - Agent's execution result (optional)
   */
  async processCompletedNode(agentId: string, result?: Record<string, any>): Promise<void> {
    this.engineLogger.info({ agentId }, 'Processing completed node');

    try {
      // 1. Find the workflow node for this agent
      const nodes = await this.workflowRepo.findNodesByGraphId(''); // Need to query by agent_id
      // TODO: Add findNodeByAgentId() to repository
      const completedNode = nodes.find(n => n.agent_id === agentId);

      if (!completedNode) {
        this.engineLogger.warn({ agentId }, 'No workflow node found for agent');
        return;
      }

      // 2. Update node status and result
      await this.workflowRepo.updateNode(completedNode.id, {
        execution_status: 'completed',
        completion_timestamp: new Date(),
        result: result || null,
      });

      // 3. Find all nodes in the workflow
      const allNodes = await this.workflowRepo.findNodesByGraphId(completedNode.workflow_graph_id);

      // 4. Check which nodes are now ready to spawn
      for (const node of allNodes) {
        if (node.execution_status !== 'pending') {
          continue; // Skip already spawned/completed nodes
        }

        const deps = Array.isArray(node.dependencies) ? node.dependencies : [];

        // Check if ALL dependencies are completed
        const allDepsCompleted = deps.every(depId => {
          const depNode = allNodes.find(n => n.id === depId);
          return depNode && depNode.execution_status === 'completed';
        });

        if (allDepsCompleted) {
          // Spawn this node!
          this.engineLogger.info(
            { nodeId: node.id, role: node.role, completedDeps: deps },
            'All dependencies completed, spawning node'
          );

          // Get parent agent from workflow graph
          const graph = await this.workflowRepo.findGraphById(node.workflow_graph_id);
          if (!graph) continue;

          // Gather dependency results for context
          const depResults = deps.map(depId => {
            const depNode = allNodes.find(n => n.id === depId);
            return depNode?.result || {};
          });

          // Enhance task description with dependency outputs
          let enhancedTask = node.task_description;
          if (depResults.length > 0 && depResults.some(r => Object.keys(r).length > 0)) {
            enhancedTask += `\n\nDependency outputs:\n${JSON.stringify(depResults, null, 2)}`;
          }

          const newAgentId = await this.agentService.spawnAgent(
            node.role,
            enhancedTask,
            node.budget_allocation,
            agentId // Use completed agent as parent
          );

          await this.workflowRepo.updateNode(node.id, {
            agent_id: newAgentId,
            execution_status: 'executing',
            spawn_timestamp: new Date(),
          });
        }
      }

      // 5. Check if workflow is complete
      const progress = await this.getWorkflowProgress(completedNode.workflow_graph_id);
      if (progress.total === progress.completed) {
        await this.workflowRepo.updateGraph(completedNode.workflow_graph_id, {
          status: 'completed',
          completed_at: new Date(),
        });
        this.engineLogger.info(
          { graphId: completedNode.workflow_graph_id },
          'Workflow execution completed'
        );
      }

    } catch (error) {
      this.engineLogger.error({ error, agentId }, 'Failed to process completed node');
      throw error;
    }
  }

  /**
   * Terminate all active nodes in a workflow (kill switch)
   *
   * Used when workflow fails or needs to be stopped.
   *
   * @param graphId - Workflow graph UUID
   */
  async terminateWorkflow(graphId: string): Promise<void> {
    this.engineLogger.info({ graphId }, 'Terminating workflow');

    try {
      const nodes = await this.workflowRepo.findNodesByGraphId(graphId);

      for (const node of nodes) {
        if (node.agent_id && node.execution_status === 'executing') {
          this.engineLogger.info(
            { nodeId: node.id, agentId: node.agent_id },
            'Terminating node agent'
          );

          // TODO: Add terminateAgent() to AgentService
          // await this.agentService.terminateAgent(node.agent_id);

          await this.workflowRepo.updateNode(node.id, {
            execution_status: 'skipped',
            error_message: 'Workflow terminated',
          });
        }
      }

      await this.workflowRepo.updateGraph(graphId, {
        status: 'failed',
        completed_at: new Date(),
      });

      this.engineLogger.info({ graphId }, 'Workflow terminated');
    } catch (error) {
      this.engineLogger.error({ error, graphId }, 'Failed to terminate workflow');
      throw error;
    }
  }

  /**
   * Get workflow execution progress
   */
  async getWorkflowProgress(graphId: string): Promise<{
    total: number;
    completed: number;
    executing: number;
    pending: number;
    failed: number;
  }> {
    const nodes = await this.workflowRepo.findNodesByGraphId(graphId);

    const completed = nodes.filter(n => n.execution_status === 'completed').length;
    const executing = nodes.filter(n => n.execution_status === 'executing').length;
    const pending = nodes.filter(n => n.execution_status === 'pending').length;
    const failed = nodes.filter(n => n.execution_status === 'failed').length;

    return {
      total: nodes.length,
      completed,
      executing,
      pending,
      failed,
    };
  }
}
