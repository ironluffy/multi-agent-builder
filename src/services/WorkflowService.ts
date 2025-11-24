import { WorkflowRepository } from '../database/repositories/WorkflowRepository.js';
import { WorkflowEngine } from '../core/WorkflowEngine.js';
import { logger } from '../utils/Logger.js';
import type {
  WorkflowGraph,
  CreateWorkflowGraph,
} from '../models/WorkflowGraph.js';
import type {
  WorkflowNode,
  CreateWorkflowNode,
} from '../models/WorkflowNode.js';
import type {
  WorkflowTemplate,
  CreateWorkflowTemplate,
} from '../models/WorkflowTemplate.js';

/**
 * WorkflowService
 * High-level service for workflow composition and execution
 *
 * Responsibilities:
 * - Template management (create, instantiate)
 * - Workflow graph creation and validation
 * - Workflow execution orchestration
 * - Progress tracking and monitoring
 */
export class WorkflowService {
  private workflowRepo: WorkflowRepository;
  private workflowEngine: WorkflowEngine;
  private serviceLogger = logger.child({ component: 'WorkflowService' });

  constructor() {
    this.workflowRepo = new WorkflowRepository();
    this.workflowEngine = new WorkflowEngine();
  }

  // ========================================================================
  // Template Management
  // ========================================================================

  /**
   * Create a new workflow template
   */
  async createTemplate(data: CreateWorkflowTemplate): Promise<WorkflowTemplate> {
    this.serviceLogger.info({ name: data.name }, 'Creating workflow template');

    try {
      // Validate budget percentages sum to ~100%
      const totalPercentage = data.node_templates.reduce(
        (sum, node) => sum + node.budget_percentage,
        0
      );

      if (Math.abs(totalPercentage - 100) > 0.1) {
        throw new Error(
          `Budget percentages must sum to 100%, got ${totalPercentage}%`
        );
      }

      const template = await this.workflowRepo.createTemplate(data);

      this.serviceLogger.info(
        { templateId: template.id, name: template.name },
        'Workflow template created'
      );

      return template;
    } catch (error) {
      this.serviceLogger.error({ error, name: data.name }, 'Failed to create template');
      throw error;
    }
  }

  /**
   * Get template by name
   */
  async getTemplateByName(name: string): Promise<WorkflowTemplate | null> {
    return await this.workflowRepo.findTemplateByName(name);
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<WorkflowTemplate[]> {
    return await this.workflowRepo.findEnabledTemplates();
  }

  /**
   * Instantiate a template into a workflow graph
   *
   * @param templateId - Template UUID
   * @param name - Name for new workflow
   * @param task - Overall task description (replaces {TASK} placeholders)
   * @param totalBudget - Total budget for all nodes
   * @returns Created workflow graph with nodes
   */
  async instantiateTemplate(
    templateId: string,
    name: string,
    task: string,
    totalBudget: number
  ): Promise<{ graph: WorkflowGraph; nodes: WorkflowNode[] }> {
    this.serviceLogger.info({ templateId, name, totalBudget }, 'Instantiating template');

    try {
      // 1. Load template
      const template = await this.workflowRepo.findTemplateById(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      if (totalBudget < template.min_budget_required) {
        throw new Error(
          `Budget ${totalBudget} is less than minimum required ${template.min_budget_required}`
        );
      }

      // 2. Create workflow graph
      const graphData: CreateWorkflowGraph = {
        name,
        description: `Instantiated from template: ${template.name}`,
        template_id: templateId,
        status: 'active',
        validation_status: 'pending',
        total_nodes: template.node_templates.length,
        total_edges: template.edge_patterns.length,
        estimated_budget: totalBudget,
        complexity_rating: template.complexity_rating,
      };

      const graph = await this.workflowRepo.createGraph(graphData);

      // 3. Create nodes from template
      const nodes: WorkflowNode[] = [];
      const nodeIdMap = new Map<string, string>(); // template node_id → actual node UUID

      for (const nodeTemplate of template.node_templates) {
        const budgetAllocation = Math.floor((totalBudget * nodeTemplate.budget_percentage) / 100);
        const taskDescription = nodeTemplate.task_template.replace('{TASK}', task);

        const nodeData: CreateWorkflowNode = {
          workflow_graph_id: graph.id,
          agent_id: null,
          role: nodeTemplate.role,
          task_description: taskDescription,
          budget_allocation: budgetAllocation,
          dependencies: [], // Will be mapped below
          execution_status: 'pending',
          position: nodeTemplate.position,
          metadata: nodeTemplate.metadata || null,
        };

        const node = await this.workflowRepo.createNode(nodeData);
        nodes.push(node);
        nodeIdMap.set(nodeTemplate.node_id, node.id);
      }

      // 4. Update node dependencies with actual UUIDs
      for (let i = 0; i < template.node_templates.length; i++) {
        const nodeTemplate = template.node_templates[i];
        const node = nodes[i];

        if (nodeTemplate.dependencies && nodeTemplate.dependencies.length > 0) {
          const mappedDeps = nodeTemplate.dependencies
            .map(depId => nodeIdMap.get(depId))
            .filter(id => id !== undefined) as string[];

          if (mappedDeps.length > 0) {
            // Update node with mapped dependencies
            const updatedNode = await this.workflowRepo.updateNode(node.id, {
              dependencies: mappedDeps,
            });
            nodes[i] = updatedNode;
          }
        }
      }

      // 5. Increment template usage count
      await this.workflowRepo.incrementTemplateUsage(templateId);

      this.serviceLogger.info(
        { graphId: graph.id, templateId, nodeCount: nodes.length },
        'Template instantiated successfully'
      );

      return { graph, nodes };
    } catch (error) {
      this.serviceLogger.error({ error, templateId }, 'Failed to instantiate template');
      throw error;
    }
  }

  // ========================================================================
  // Workflow Execution
  // ========================================================================

  /**
   * Create and execute a workflow
   *
   * @param graphId - Workflow graph UUID
   * @param parentAgentId - Parent agent orchestrating this workflow
   * @returns Map of node IDs to spawned agent IDs
   */
  async executeWorkflow(
    graphId: string,
    parentAgentId: string
  ): Promise<Map<string, string>> {
    this.serviceLogger.info({ graphId, parentAgentId }, 'Executing workflow');

    try {
      const spawnedAgents = await this.workflowEngine.executeWorkflow(graphId, parentAgentId);

      this.serviceLogger.info(
        { graphId, agentCount: spawnedAgents.size },
        'Workflow execution started'
      );

      return spawnedAgents;
    } catch (error) {
      this.serviceLogger.error({ error, graphId }, 'Workflow execution failed');
      throw error;
    }
  }

  /**
   * Validate a workflow graph
   */
  async validateWorkflow(graphId: string): Promise<{
    valid: boolean;
    errors: Array<{ code: string; details: string }>;
  }> {
    return await this.workflowEngine.validateWorkflowGraph(graphId);
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
    percentage: number;
  }> {
    const progress = await this.workflowEngine.getWorkflowProgress(graphId);

    return {
      ...progress,
      percentage: progress.total > 0 ? (progress.completed / progress.total) * 100 : 0,
    };
  }

  /**
   * Get workflow graph with all nodes
   */
  async getWorkflowWithNodes(graphId: string): Promise<{
    graph: WorkflowGraph | null;
    nodes: WorkflowNode[];
  }> {
    const graph = await this.workflowRepo.findGraphById(graphId);
    const nodes = graph ? await this.workflowRepo.findNodesByGraphId(graphId) : [];

    return { graph, nodes };
  }
}
