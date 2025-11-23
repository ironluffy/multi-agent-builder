import { z } from 'zod';

/**
 * Message role enum
 * - user: Message from the user
 * - assistant: Message from an AI assistant/agent
 * - system: System-generated message
 */
export const MessageRole = z.enum(['user', 'assistant', 'system']);
export type MessageRoleType = z.infer<typeof MessageRole>;

/**
 * Message model schema
 * Represents communication between agents or between user and agents
 */
export const MessageSchema = z.object({
  /** Unique identifier for the message */
  id: z.string().uuid(),

  /** Agent ID that sent or received this message */
  agent_id: z.string().uuid(),

  /** Role of the message sender */
  role: MessageRole,

  /** Content of the message */
  content: z.string(),

  /** Optional metadata (e.g., tool calls, function results, tokens used) */
  metadata: z.record(z.unknown()).nullable(),

  /** Timestamp when the message was created */
  created_at: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Schema for creating a new message (without auto-generated fields)
 */
export const CreateMessageSchema = MessageSchema.omit({
  id: true,
  created_at: true,
}).extend({
  metadata: z.record(z.unknown()).nullable().optional(),
});

export type CreateMessage = z.infer<typeof CreateMessageSchema>;

/**
 * Schema for updating a message (limited fields)
 */
export const UpdateMessageSchema = z.object({
  content: z.string().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export type UpdateMessage = z.infer<typeof UpdateMessageSchema>;

/**
 * Schema for message metadata structure
 */
export const MessageMetadataSchema = z.object({
  /** Number of tokens in this message */
  tokens: z.number().int().min(0).optional(),

  /** Model used to generate this message */
  model: z.string().optional(),

  /** Tool calls made in this message */
  tool_calls: z.array(z.object({
    name: z.string(),
    arguments: z.record(z.unknown()),
  })).optional(),

  /** Function results returned */
  function_results: z.array(z.object({
    name: z.string(),
    result: z.unknown(),
  })).optional(),

  /** Error information if message failed */
  error: z.string().optional(),

  /** Additional custom metadata */
  custom: z.record(z.unknown()).optional(),
});

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

/**
 * Helper to create a user message
 */
export function createUserMessage(
  agent_id: string,
  content: string,
  metadata?: Record<string, unknown>
): CreateMessage {
  return {
    agent_id,
    role: 'user',
    content,
    metadata: metadata ?? null,
  };
}

/**
 * Helper to create an assistant message
 */
export function createAssistantMessage(
  agent_id: string,
  content: string,
  metadata?: Record<string, unknown>
): CreateMessage {
  return {
    agent_id,
    role: 'assistant',
    content,
    metadata: metadata ?? null,
  };
}

/**
 * Helper to create a system message
 */
export function createSystemMessage(
  agent_id: string,
  content: string,
  metadata?: Record<string, unknown>
): CreateMessage {
  return {
    agent_id,
    role: 'system',
    content,
    metadata: metadata ?? null,
  };
}
