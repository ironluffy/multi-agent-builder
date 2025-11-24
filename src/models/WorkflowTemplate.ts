import { z } from 'zod';

/**
 * Node template structure for workflow templates
 * Defines a parameterizable node within a template
 */
export const NodeTemplateSchema = z.object({
  /** Unique node identifier within template */
  node_id: z.string(),

  /** Required agent role */
  role: z.string(),

  /** Task template with placeholders (e.g., "{TASK}") */
  task_template: z.string(),

  /** Percentage of total budget allocated to this node */
  budget_percentage: z.number().min(0).max(100),

  /** List of node_id dependencies */
  dependencies: z.array(z.string()).default([]),

  /** Display position */
  position: z.number().int().min(0),

  /** Optional metadata */
  metadata: z.record(z.any()).optional(),
});
export type NodeTemplate = z.infer<typeof NodeTemplateSchema>;

/**
 * Edge pattern structure for workflow templates
 * Defines relationships between nodes in a template
 */
export const EdgePatternSchema = z.object({
  /** Source node ID */
  source_node_id: z.string(),

  /** Target node ID */
  target_node_id: z.string(),

  /** Optional edge label */
  label: z.string().optional(),
});
export type EdgePattern = z.infer<typeof EdgePatternSchema>;

/**
 * WorkflowTemplate model schema
 * Represents a reusable workflow pattern definition that can be instantiated
 * with different tasks and budgets.
 */
export const WorkflowTemplateSchema = z.object({
  /** Unique template identifier */
  id: z.string().uuid(),

  /** Template name (e.g., "backend-dev-workflow") */
  name: z.string().min(1).max(200),

  /** Template purpose and usage instructions */
  description: z.string().min(1),

  /** Template category (development, testing, deployment, etc.) */
  category: z.string().max(50).nullable(),

  /** List of node definitions */
  node_templates: z.array(NodeTemplateSchema),

  /** List of edge definitions */
  edge_patterns: z.array(EdgePatternSchema),

  /** Estimated token budget for template */
  total_estimated_budget: z.number().int().positive(),

  /** Template complexity (0=simple, 10=very complex) */
  complexity_rating: z.number().min(0).max(10),

  /** Minimum budget to instantiate template */
  min_budget_required: z.number().int().positive(),

  /** Number of times template instantiated */
  usage_count: z.number().int().min(0).default(0),

  /** Percentage of successful completions */
  success_rate: z.number().min(0).max(100).nullable(),

  /** Agent or system that created template */
  created_by: z.string().uuid().nullable(),

  /** Template creation time */
  created_at: z.date(),

  /** Last template modification */
  updated_at: z.date(),

  /** Whether template can be instantiated */
  enabled: z.boolean().default(true),
});

export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;

/**
 * Schema for creating a new workflow template (without auto-generated fields)
 */
export const CreateWorkflowTemplateSchema = WorkflowTemplateSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial({
  usage_count: true,
  success_rate: true,
  enabled: true,
});

export type CreateWorkflowTemplate = z.infer<typeof CreateWorkflowTemplateSchema>;

/**
 * Schema for updating a workflow template
 */
export const UpdateWorkflowTemplateSchema = WorkflowTemplateSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial();

export type UpdateWorkflowTemplate = z.infer<typeof UpdateWorkflowTemplateSchema>;
