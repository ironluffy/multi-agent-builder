import { db } from '../../infrastructure/SharedDatabase.js';
import type {
  WorkflowGraph,
  CreateWorkflowGraph,
  UpdateWorkflowGraph,
} from '../../models/WorkflowGraph.js';
import type {
  WorkflowNode,
  CreateWorkflowNode,
  UpdateWorkflowNode,
} from '../../models/WorkflowNode.js';
import type {
  WorkflowTemplate,
  CreateWorkflowTemplate,
} from '../../models/WorkflowTemplate.js';

/**
 * WorkflowRepository
 * Data access layer for workflow-related entities (graphs, nodes, templates)
 */
export class WorkflowRepository {

  // ========================================================================
  // WorkflowGraph CRUD Operations
  // ========================================================================

  /**
   * Create a new workflow graph
   */
  async createGraph(data: CreateWorkflowGraph): Promise<WorkflowGraph> {
    const query = `
      INSERT INTO workflow_graphs (
        name, description, template_id, status, validation_status,
        validation_errors, total_nodes, total_edges, estimated_budget,
        complexity_rating
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await db.query<WorkflowGraph>(query, [
      data.name,
      data.description || null,
      data.template_id || null,
      data.status || 'active',
      data.validation_status || 'pending',
      data.validation_errors ? JSON.stringify(data.validation_errors) : null,
      data.total_nodes || 0,
      data.total_edges || 0,
      data.estimated_budget || null,
      data.complexity_rating || null,
    ]);

    return result.rows[0];
  }

  /**
   * Find workflow graph by ID
   */
  async findGraphById(id: string): Promise<WorkflowGraph | null> {
    const query = 'SELECT * FROM workflow_graphs WHERE id = $1';
    const result = await db.query<WorkflowGraph>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update workflow graph
   */
  async updateGraph(id: string, data: UpdateWorkflowGraph): Promise<WorkflowGraph> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.validation_status !== undefined) {
      updates.push(`validation_status = $${paramIndex++}`);
      values.push(data.validation_status);
    }
    if (data.validation_errors !== undefined) {
      updates.push(`validation_errors = $${paramIndex++}`);
      values.push(data.validation_errors ? JSON.stringify(data.validation_errors) : null);
    }
    if (data.total_nodes !== undefined) {
      updates.push(`total_nodes = $${paramIndex++}`);
      values.push(data.total_nodes);
    }
    if (data.total_edges !== undefined) {
      updates.push(`total_edges = $${paramIndex++}`);
      values.push(data.total_edges);
    }
    if (data.validated_at !== undefined) {
      updates.push(`validated_at = $${paramIndex++}`);
      values.push(data.validated_at);
    }
    if (data.completed_at !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(data.completed_at);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE workflow_graphs
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query<WorkflowGraph>(query, values);
    return result.rows[0];
  }

  /**
   * Delete workflow graph and all its nodes (CASCADE)
   */
  async deleteGraph(id: string): Promise<void> {
    const query = 'DELETE FROM workflow_graphs WHERE id = $1';
    await db.query(query, [id]);
  }

  /**
   * Find all graphs by status
   */
  async findGraphsByStatus(status: string): Promise<WorkflowGraph[]> {
    const query = 'SELECT * FROM workflow_graphs WHERE status = $1 ORDER BY created_at DESC';
    const result = await db.query<WorkflowGraph>(query, [status]);
    return result.rows;
  }

  // ========================================================================
  // WorkflowNode CRUD Operations
  // ========================================================================

  /**
   * Create a new workflow node
   */
  async createNode(data: CreateWorkflowNode): Promise<WorkflowNode> {
    const query = `
      INSERT INTO workflow_nodes (
        workflow_graph_id, agent_id, role, task_description,
        budget_allocation, dependencies, execution_status,
        position, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await db.query<WorkflowNode>(query, [
      data.workflow_graph_id,
      data.agent_id || null,
      data.role,
      data.task_description,
      data.budget_allocation,
      JSON.stringify(data.dependencies || []),
      data.execution_status || 'pending',
      data.position,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]);

    return result.rows[0];
  }

  /**
   * Find workflow node by ID
   */
  async findNodeById(id: string): Promise<WorkflowNode | null> {
    const query = 'SELECT * FROM workflow_nodes WHERE id = $1';
    const result = await db.query<WorkflowNode>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find all nodes for a workflow graph
   */
  async findNodesByGraphId(graphId: string): Promise<WorkflowNode[]> {
    const query = `
      SELECT * FROM workflow_nodes
      WHERE workflow_graph_id = $1
      ORDER BY position ASC
    `;
    const result = await db.query<WorkflowNode>(query, [graphId]);
    return result.rows;
  }

  /**
   * Update workflow node
   */
  async updateNode(id: string, data: UpdateWorkflowNode): Promise<WorkflowNode> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.agent_id !== undefined) {
      updates.push(`agent_id = $${paramIndex++}`);
      values.push(data.agent_id);
    }
    if (data.execution_status !== undefined) {
      updates.push(`execution_status = $${paramIndex++}`);
      values.push(data.execution_status);
    }
    if (data.spawn_timestamp !== undefined) {
      updates.push(`spawn_timestamp = $${paramIndex++}`);
      values.push(data.spawn_timestamp);
    }
    if (data.completion_timestamp !== undefined) {
      updates.push(`completion_timestamp = $${paramIndex++}`);
      values.push(data.completion_timestamp);
    }
    if (data.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(data.result ? JSON.stringify(data.result) : null);
    }
    if (data.error_message !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(data.error_message);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE workflow_nodes
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query<WorkflowNode>(query, values);
    return result.rows[0];
  }

  /**
   * Find nodes by execution status
   */
  async findNodesByStatus(graphId: string, status: string): Promise<WorkflowNode[]> {
    const query = `
      SELECT * FROM workflow_nodes
      WHERE workflow_graph_id = $1 AND execution_status = $2
      ORDER BY position ASC
    `;
    const result = await db.query<WorkflowNode>(query, [graphId, status]);
    return result.rows;
  }

  // ========================================================================
  // WorkflowTemplate CRUD Operations
  // ========================================================================

  /**
   * Create a new workflow template
   */
  async createTemplate(data: CreateWorkflowTemplate): Promise<WorkflowTemplate> {
    const query = `
      INSERT INTO workflow_templates (
        name, description, category, node_templates, edge_patterns,
        total_estimated_budget, complexity_rating, min_budget_required,
        created_by, enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await db.query<WorkflowTemplate>(query, [
      data.name,
      data.description,
      data.category || null,
      JSON.stringify(data.node_templates),
      JSON.stringify(data.edge_patterns),
      data.total_estimated_budget,
      data.complexity_rating,
      data.min_budget_required,
      data.created_by || null,
      data.enabled !== undefined ? data.enabled : true,
    ]);

    return result.rows[0];
  }

  /**
   * Find workflow template by ID
   */
  async findTemplateById(id: string): Promise<WorkflowTemplate | null> {
    const query = 'SELECT * FROM workflow_templates WHERE id = $1';
    const result = await db.query<WorkflowTemplate>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find workflow template by name
   */
  async findTemplateByName(name: string): Promise<WorkflowTemplate | null> {
    const query = 'SELECT * FROM workflow_templates WHERE name = $1';
    const result = await db.query<WorkflowTemplate>(query, [name]);
    return result.rows[0] || null;
  }

  /**
   * Find all enabled templates
   */
  async findEnabledTemplates(): Promise<WorkflowTemplate[]> {
    const query = `
      SELECT * FROM workflow_templates
      WHERE enabled = TRUE
      ORDER BY usage_count DESC, name ASC
    `;
    const result = await db.query<WorkflowTemplate>(query);
    return result.rows;
  }

  /**
   * Update template usage count
   */
  async incrementTemplateUsage(id: string): Promise<void> {
    const query = 'UPDATE workflow_templates SET usage_count = usage_count + 1 WHERE id = $1';
    await db.query(query, [id]);
  }

  /**
   * Update template success rate
   */
  async updateTemplateSuccessRate(id: string, successRate: number): Promise<void> {
    const query = 'UPDATE workflow_templates SET success_rate = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    await db.query(query, [successRate, id]);
  }
}
