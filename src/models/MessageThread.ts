import { z } from 'zod';

/**
 * MessageThread model schema
 * Represents a conversation thread between agents, grouping related messages
 *
 * A thread tracks bidirectional communication between two or more agents,
 * organizing messages by topic, task, or workflow context.
 */
export const MessageThreadSchema = z.object({
  /** Unique identifier for the thread */
  id: z.string().uuid(),

  /** Thread title/subject */
  title: z.string().min(1).max(255),

  /** Optional description of the thread topic */
  description: z.string().nullable(),

  /** Participant agent IDs (array of UUIDs) */
  participants: z.array(z.string().uuid()).min(2),

  /** Thread metadata (e.g., workflow_id, task_id, tags) */
  metadata: z.record(z.unknown()).nullable(),

  /** Thread status */
  status: z.enum(['active', 'archived', 'closed']),

  /** Timestamp when thread was created */
  created_at: z.date(),

  /** Timestamp when thread was last updated */
  updated_at: z.date(),

  /** Timestamp when thread was closed (null if active) */
  closed_at: z.date().nullable(),
});

export type MessageThread = z.infer<typeof MessageThreadSchema>;

/**
 * Schema for creating a new message thread
 */
export const CreateMessageThreadSchema = MessageThreadSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  closed_at: true,
}).extend({
  description: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  status: z.enum(['active', 'archived', 'closed']).default('active'),
});

export type CreateMessageThread = z.infer<typeof CreateMessageThreadSchema>;

/**
 * Schema for updating a message thread
 */
export const UpdateMessageThreadSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  participants: z.array(z.string().uuid()).min(2).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  status: z.enum(['active', 'archived', 'closed']).optional(),
});

export type UpdateMessageThread = z.infer<typeof UpdateMessageThreadSchema>;

/**
 * Thread metadata schema
 */
export const ThreadMetadataSchema = z.object({
  /** Associated workflow ID */
  workflow_id: z.string().uuid().optional(),

  /** Associated task ID */
  task_id: z.string().optional(),

  /** Thread tags for categorization */
  tags: z.array(z.string()).optional(),

  /** Priority level */
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),

  /** Custom metadata fields */
  custom: z.record(z.unknown()).optional(),
});

export type ThreadMetadata = z.infer<typeof ThreadMetadataSchema>;

/**
 * Helper to create a new message thread between agents
 */
export function createMessageThread(
  title: string,
  participants: string[],
  options?: {
    description?: string;
    metadata?: Record<string, unknown>;
  }
): CreateMessageThread {
  return {
    title,
    participants,
    description: options?.description ?? null,
    metadata: options?.metadata ?? null,
    status: 'active',
  };
}
