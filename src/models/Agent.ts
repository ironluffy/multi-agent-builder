import { z } from 'zod';

/**
 * Agent status enum
 * - pending: Agent is waiting to start execution
 * - executing: Agent is currently running its task
 * - completed: Agent successfully completed its task
 * - failed: Agent encountered an error and failed
 * - terminated: Agent was manually terminated before completion
 */
export const AgentStatus = z.enum(['pending', 'executing', 'completed', 'failed', 'terminated']);
export type AgentStatusType = z.infer<typeof AgentStatus>;

/**
 * Agent model schema
 * Represents an autonomous agent in the multi-agent system
 */
export const AgentSchema = z.object({
  /** Unique identifier for the agent */
  id: z.string().uuid(),

  /** Role or type of the agent (e.g., 'researcher', 'coder', 'reviewer') */
  role: z.string().min(1).max(255),

  /** Current execution status of the agent */
  status: AgentStatus,

  /** Hierarchical depth level (0 = root, 1 = first level child, etc.) */
  depth_level: z.number().int().min(0),

  /** Parent agent ID for hierarchical relationships (null for root agents) */
  parent_id: z.string().uuid().nullable(),

  /** Detailed description of the task assigned to this agent */
  task_description: z.string(),

  /** Timestamp when the agent was created */
  created_at: z.date(),

  /** Timestamp when the agent was last updated */
  updated_at: z.date(),

  /** Timestamp when the agent completed its task (null if not completed) */
  completed_at: z.date().nullable(),
});

export type Agent = z.infer<typeof AgentSchema>;

/**
 * Schema for creating a new agent (without auto-generated fields)
 */
export const CreateAgentSchema = AgentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  completed_at: true,
}).extend({
  status: AgentStatus.default('pending'),
  depth_level: z.number().int().min(0).default(0),
  parent_id: z.string().uuid().nullable().optional(),
  completed_at: z.date().nullable().optional(),
});

export type CreateAgent = z.infer<typeof CreateAgentSchema>;

/**
 * Schema for updating an agent (all fields optional except status transitions)
 */
export const UpdateAgentSchema = AgentSchema.partial().omit({
  id: true,
  created_at: true,
});

export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
