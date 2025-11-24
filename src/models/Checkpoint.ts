import { z } from 'zod';

/**
 * Checkpoint model schema
 * Represents a snapshot of agent state for recovery and rollback
 */
export const CheckpointSchema = z.object({
  /** Unique identifier for the checkpoint */
  id: z.string().uuid(),

  /** Associated agent ID */
  agent_id: z.string().uuid(),

  /** Serialized state data (agent context, variables, memory, etc.) */
  state_data: z.record(z.unknown()),

  /** Optional human-readable label for this checkpoint */
  label: z.string().max(255).nullable(),

  /** Timestamp when the checkpoint was created */
  created_at: z.date(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

/**
 * Schema for creating a new checkpoint (without auto-generated fields)
 */
export const CreateCheckpointSchema = CheckpointSchema.omit({
  id: true,
  created_at: true,
}).extend({
  label: z.string().max(255).nullable().optional(),
});

export type CreateCheckpoint = z.infer<typeof CreateCheckpointSchema>;

/**
 * Schema for checkpoint state data structure
 */
export const CheckpointStateSchema = z.object({
  /** Current agent status at checkpoint time */
  status: z.string(),

  /** Agent task description */
  task_description: z.string().optional(),

  /** Current depth level */
  depth_level: z.number().int().min(0).optional(),

  /** Parent agent ID */
  parent_id: z.string().uuid().nullable().optional(),

  /** Agent's working memory/context */
  memory: z.record(z.unknown()).optional(),

  /** Current step in task execution */
  execution_step: z.number().int().min(0).optional(),

  /** List of completed subtasks */
  completed_subtasks: z.array(z.string()).optional(),

  /** Pending subtasks */
  pending_subtasks: z.array(z.string()).optional(),

  /** Tool/function call history */
  tool_history: z.array(z.object({
    tool: z.string(),
    timestamp: z.string(),
    result: z.unknown().optional(),
  })).optional(),

  /** Budget information at checkpoint */
  budget_snapshot: z.object({
    tokens_used: z.number().int(),
    token_limit: z.number().int(),
    estimated_cost: z.number(),
  }).optional(),

  /** Additional custom state */
  custom: z.record(z.unknown()).optional(),
});

export type CheckpointState = z.infer<typeof CheckpointStateSchema>;

/**
 * Helper to create a labeled checkpoint
 */
export function createLabeledCheckpoint(
  agent_id: string,
  state_data: Record<string, unknown>,
  label: string
): CreateCheckpoint {
  return {
    agent_id,
    state_data,
    label,
  };
}

/**
 * Helper to create an auto-checkpoint
 */
export function createAutoCheckpoint(
  agent_id: string,
  state_data: Record<string, unknown>
): CreateCheckpoint {
  const timestamp = new Date().toISOString();
  return {
    agent_id,
    state_data,
    label: `auto-checkpoint-${timestamp}`,
  };
}

/**
 * Helper to validate checkpoint state data
 */
export function validateCheckpointState(state_data: unknown): CheckpointState {
  return CheckpointStateSchema.parse(state_data);
}

/**
 * Helper to compare two checkpoints
 */
export function compareCheckpoints(
  checkpoint1: Checkpoint,
  checkpoint2: Checkpoint
): {
  timeDiff: number;
  stateChanged: boolean;
  changedKeys: string[];
} {
  const timeDiff = checkpoint2.created_at.getTime() - checkpoint1.created_at.getTime();
  const keys1 = Object.keys(checkpoint1.state_data);
  const keys2 = Object.keys(checkpoint2.state_data);
  const changedKeys = keys1.filter(
    (key) => JSON.stringify(checkpoint1.state_data[key]) !== JSON.stringify(checkpoint2.state_data[key])
  );

  return {
    timeDiff,
    stateChanged: changedKeys.length > 0 || keys1.length !== keys2.length,
    changedKeys,
  };
}
