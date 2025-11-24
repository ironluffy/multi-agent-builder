import { z } from 'zod';
import { AgentSchema } from './Agent.js';

/**
 * WorkflowAgent model schema
 * Extends Agent to represent an agent that internally coordinates
 * a workflow of sub-agents according to a predefined graph.
 */
export const WorkflowAgentSchema = AgentSchema.extend({
  /** Reference to the workflow graph this agent executes */
  workflow_graph_id: z.string().uuid(),

  /** Progress tracking: number of nodes completed */
  nodes_completed: z.number().int().min(0).default(0),

  /** Progress tracking: total number of nodes in workflow */
  nodes_total: z.number().int().min(0).default(0),

  /** Current phase of workflow execution */
  workflow_phase: z.enum(['initializing', 'executing', 'finalizing']).default('initializing'),
});

export type WorkflowAgent = z.infer<typeof WorkflowAgentSchema>;

/**
 * Schema for creating a new workflow agent
 */
export const CreateWorkflowAgentSchema = WorkflowAgentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial({
  nodes_completed: true,
  nodes_total: true,
  workflow_phase: true,
});

export type CreateWorkflowAgent = z.infer<typeof CreateWorkflowAgentSchema>;

/**
 * Schema for updating a workflow agent
 */
export const UpdateWorkflowAgentSchema = WorkflowAgentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial();

export type UpdateWorkflowAgent = z.infer<typeof UpdateWorkflowAgentSchema>;
