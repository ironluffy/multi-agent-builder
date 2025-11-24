import { z } from 'zod';

/**
 * Workflow node execution status enum
 * - pending: Node is waiting for dependencies
 * - ready: Dependencies satisfied, ready to spawn
 * - spawning: Agent is being spawned for this node
 * - executing: Node's agent is currently running
 * - completed: Node's agent successfully completed
 * - failed: Node's agent encountered an error
 * - skipped: Node was skipped due to upstream failures
 */
export const WorkflowNodeStatus = z.enum([
  'pending',
  'ready',
  'spawning',
  'executing',
  'completed',
  'failed',
  'skipped',
]);
export type WorkflowNodeStatusType = z.infer<typeof WorkflowNodeStatus>;

/**
 * WorkflowNode model schema
 * Represents an individual agent position within a workflow graph.
 * Maps to an actual Agent instance when spawned during workflow execution.
 */
export const WorkflowNodeSchema = z.object({
  /** Unique node identifier */
  id: z.string().uuid(),

  /** Parent workflow graph */
  workflow_graph_id: z.string().uuid(),

  /** Spawned agent (null until node executes) */
  agent_id: z.string().uuid().nullable(),

  /** Required agent role for this node */
  role: z.string().min(1).max(100),

  /** Task assigned to agent spawned for this node */
  task_description: z.string().min(1),

  /** Tokens allocated to this node's agent */
  budget_allocation: z.number().int().positive(),

  /** List of node IDs this node depends on */
  dependencies: z.array(z.string().uuid()).default([]),

  /** Node execution state */
  execution_status: WorkflowNodeStatus.default('pending'),

  /** When agent for this node was spawned */
  spawn_timestamp: z.date().nullable(),

  /** When node's agent completed */
  completion_timestamp: z.date().nullable(),

  /** Output/result from node's agent */
  result: z.record(z.any()).nullable(),

  /** Error details if execution_status = 'failed' */
  error_message: z.string().nullable(),

  /** Display position for visualization */
  position: z.number().int().min(0),

  /** Node-specific metadata */
  metadata: z.record(z.any()).nullable(),

  /** Node creation timestamp */
  created_at: z.date(),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

/**
 * Schema for creating a new workflow node (without auto-generated fields)
 */
export const CreateWorkflowNodeSchema = WorkflowNodeSchema.omit({
  id: true,
  created_at: true,
}).partial({
  agent_id: true,
  dependencies: true,
  execution_status: true,
  spawn_timestamp: true,
  completion_timestamp: true,
  result: true,
  error_message: true,
  metadata: true,
});

export type CreateWorkflowNode = z.infer<typeof CreateWorkflowNodeSchema>;

/**
 * Schema for updating a workflow node
 */
export const UpdateWorkflowNodeSchema = WorkflowNodeSchema.omit({
  id: true,
  workflow_graph_id: true,
  created_at: true,
}).partial();

export type UpdateWorkflowNode = z.infer<typeof UpdateWorkflowNodeSchema>;
