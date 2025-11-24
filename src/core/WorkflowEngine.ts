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
   * Execute workflow by spawning nodes in dependency order
   *
   * @param graphId - Workflow graph UUID
   * @param parentAgentId - Parent agent orchestrating this workflow
   * @returns Map of node IDs to spawned agent IDs
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
      const nodeMap = new Map<string, WorkflowNode>();
      nodes.forEach(node => nodeMap.set(node.id, node));

      // 3. Compute execution order
      const executionOrder = this.topologicalSort(nodes, nodeMap);
      if (!executionOrder) {
        throw new Error('Failed to compute execution order');
      }

      // 4. Spawn nodes in order
      const spawnedAgents = new Map<string, string>();

      for (const nodeId of executionOrder) {
        const node = nodeMap.get(nodeId)!;

        // Check if all dependencies completed
        const deps = Array.isArray(node.dependencies) ? node.dependencies : [];
        const allDepsCompleted = deps.every(depId => spawnedAgents.has(depId));

        if (!allDepsCompleted) {
          this.engineLogger.warn(
            { nodeId, dependencies: deps },
            'Dependencies not yet completed, skipping node'
          );
          continue;
        }

        // Spawn agent for this node
        this.engineLogger.info({ nodeId, role: node.role }, 'Spawning node agent');

        const agentId = await this.agentService.spawnAgent(
          node.role,
          node.task_description,
          node.budget_allocation,
          parentAgentId
        );

        spawnedAgents.set(nodeId, agentId);

        // Update node with spawned agent
        await this.workflowRepo.updateNode(nodeId, {
          agent_id: agentId,
          execution_status: 'executing',
          spawn_timestamp: new Date(),
        });
      }

      // 5. Update graph status
      await this.workflowRepo.updateGraph(graphId, {
        status: 'active',
      });

      this.engineLogger.info(
        { graphId, nodesSpawned: spawnedAgents.size },
        'Workflow execution started'
      );

      return spawnedAgents;
    } catch (error) {
      this.engineLogger.error({ error, graphId }, 'Workflow execution failed');

      // Mark graph as failed
      await this.workflowRepo.updateGraph(graphId, {
        status: 'failed',
      });

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
