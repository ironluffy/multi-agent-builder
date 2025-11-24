import { z } from 'zod';

/**
 * Workflow graph status enum
 * - active: Workflow is currently executing
 * - paused: Workflow execution is paused
 * - completed: All nodes successfully executed
 * - failed: One or more nodes failed
 */
export const WorkflowGraphStatus = z.enum(['active', 'paused', 'completed', 'failed']);
export type WorkflowGraphStatusType = z.infer<typeof WorkflowGraphStatus>;

/**
 * Workflow validation status enum
 * - pending: Graph has not been validated yet
 * - validated: Graph passed all validation checks
 * - invalid: Graph failed validation
 */
export const WorkflowValidationStatus = z.enum(['pending', 'validated', 'invalid']);
export type WorkflowValidationStatusType = z.infer<typeof WorkflowValidationStatus>;

/**
 * Validation error structure
 */
export const ValidationErrorSchema = z.object({
  /** Error code (e.g., CIRCULAR_DEPENDENCY, INVALID_ROLE) */
  code: z.string(),

  /** Detailed error description */
  details: z.string(),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * WorkflowGraph model schema
 * Represents a directed acyclic graph (DAG) defining how sub-agents
 * are spawned, coordinated, and sequenced within a workflow agent.
 */
export const WorkflowGraphSchema = z.object({
  /** Unique workflow graph identifier */
  id: z.string().uuid(),

  /** Human-readable workflow name */
  name: z.string().min(1).max(200),

  /** Workflow purpose and usage description */
  description: z.string().nullable(),

  /** Template this was instantiated from */
  template_id: z.string().uuid().nullable(),

  /** Workflow execution status */
  status: WorkflowGraphStatus.default('active'),

  /** Graph validation state */
  validation_status: WorkflowValidationStatus.default('pending'),

  /** List of validation errors if invalid */
  validation_errors: z.array(ValidationErrorSchema).nullable(),

  /** Count of nodes in graph */
  total_nodes: z.number().int().min(0).default(0),

  /** Count of edges in graph */
  total_edges: z.number().int().min(0).default(0),

  /** Total estimated tokens for all nodes */
  estimated_budget: z.number().int().positive().nullable(),

  /** Overall workflow complexity (0=simple, 10=very complex) */
  complexity_rating: z.number().min(0).max(10).nullable(),

  /** Graph creation time */
  created_at: z.date(),

  /** When graph validation completed */
  validated_at: z.date().nullable(),

  /** When workflow execution finished */
  completed_at: z.date().nullable(),
});

export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;

/**
 * Schema for creating a new workflow graph (without auto-generated fields)
 */
export const CreateWorkflowGraphSchema = WorkflowGraphSchema.omit({
  id: true,
  created_at: true,
}).partial({
  status: true,
  validation_status: true,
  total_nodes: true,
  total_edges: true,
  validated_at: true,
  completed_at: true,
  validation_errors: true,
});

export type CreateWorkflowGraph = z.infer<typeof CreateWorkflowGraphSchema>;

/**
 * Schema for updating a workflow graph
 */
export const UpdateWorkflowGraphSchema = WorkflowGraphSchema.omit({
  id: true,
  created_at: true,
}).partial();

export type UpdateWorkflowGraph = z.infer<typeof UpdateWorkflowGraphSchema>;
