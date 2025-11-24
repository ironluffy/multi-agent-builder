/**
 * Message API Contracts
 * Feature: Hierarchical Agent Orchestration System - Message Queue
 * Maps to: FR-005, FR-006, FR-015
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Message status (FR-005)
 */
export type MessageStatus =
  | 'pending'      // Queued but not delivered
  | 'delivered'    // Delivered to recipient
  | 'processed'    // Processed by recipient
  | 'failed'       // Delivery or processing failed

/**
 * Message priority level (FR-005)
 */
export type MessagePriority =
  | 'critical'     // System-critical messages (priority 1)
  | 'high'         // Important coordination messages (priority 2)
  | 'normal'       // Standard messages (priority 3)
  | 'low'          // Non-urgent messages (priority 4)

/**
 * Message action types (FR-005)
 */
export type MessageAction =
  | 'start_work'           // Parent instructs child to begin task
  | 'request_help'         // Child requests assistance from parent
  | 'hire_agent'           // Parent delegates to child
  | 'fire_agent'           // Parent terminates child
  | 'report_progress'      // Child reports progress to parent
  | 'report_completion'    // Child reports task completion
  | 'report_error'         // Child reports error to parent
  | 'request_approval'     // Child requests approval from parent
  | 'give_approval'        // Parent approves child request
  | 'share_data'           // Data exchange between agents
  | 'coordinate'           // Coordination message between siblings
  | 'checkpoint'           // Checkpoint notification
  | 'system_notification'  // System-level notification

/**
 * Message definition (FR-005, FR-015)
 */
export interface Message {
  /** Unique message identifier */
  id: string

  /** Sender agent ID (null for system messages) */
  senderId: string | null

  /** Recipient agent ID (null for broadcast) */
  recipientId: string | null

  /** Message action/type */
  action: MessageAction

  /** Message payload data */
  payload: Record<string, unknown>

  /** Message priority */
  priority: MessagePriority

  /** Current message status */
  status: MessageStatus

  /** Message creation timestamp */
  createdAt: Date

  /** Delivery timestamp */
  deliveredAt: Date | null

  /** Processing timestamp */
  processedAt: Date | null

  /** Expiration timestamp (if applicable) */
  expiresAt: Date | null

  /** Retry count for failed deliveries */
  retryCount: number

  /** Error details (if status === 'failed') */
  error: MessageError | null

  /** Message metadata */
  metadata: Record<string, unknown>
}

/**
 * Message error information
 */
export interface MessageError {
  code: string
  message: string
  timestamp: Date
  retryable: boolean
}

/**
 * Message subscription handle
 */
export interface Subscription {
  /** Subscription identifier */
  id: string

  /** Subscribed agent ID */
  agentId: string

  /** Filter criteria (if any) */
  filter: MessageFilter | null

  /** Unsubscribe function */
  unsubscribe: () => Promise<void>
}

/**
 * Message filter criteria
 */
export interface MessageFilter {
  /** Filter by sender ID */
  senderId?: string

  /** Filter by action types */
  actions?: MessageAction[]

  /** Filter by priority */
  priority?: MessagePriority

  /** Filter by status */
  status?: MessageStatus

  /** Filter by creation time range */
  createdAfter?: Date
  createdBefore?: Date
}

/**
 * Message queue statistics (FR-015)
 */
export interface QueueStatistics {
  /** Total messages in queue */
  totalMessages: number

  /** Messages by status */
  byStatus: Record<MessageStatus, number>

  /** Messages by priority */
  byPriority: Record<MessagePriority, number>

  /** Messages by action */
  byAction: Record<MessageAction, number>

  /** Average delivery time in milliseconds */
  avgDeliveryTimeMs: number

  /** Average processing time in milliseconds */
  avgProcessingTimeMs: number

  /** Failed message count */
  failedCount: number

  /** Oldest pending message age in seconds */
  oldestPendingAgeSeconds: number | null
}

/**
 * Batch send result
 */
export interface BatchSendResult {
  /** Successfully sent message IDs */
  successIds: string[]

  /** Failed message sends */
  failures: Array<{
    message: Omit<Message, 'id'>
    error: string
  }>

  /** Total sent count */
  totalSent: number

  /** Total failed count */
  totalFailed: number
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when message delivery fails
 */
export class MessageDeliveryError extends Error {
  constructor(
    public messageId: string,
    public reason: string,
    public retryable: boolean
  ) {
    super(`Message delivery failed: ${reason}`)
    this.name = 'MessageDeliveryError'
  }
}

/**
 * Thrown when recipient not found
 */
export class RecipientNotFoundError extends Error {
  constructor(public recipientId: string) {
    super(`Recipient not found: ${recipientId}`)
    this.name = 'RecipientNotFoundError'
  }
}

/**
 * Thrown when queue capacity exceeded
 */
export class QueueCapacityError extends Error {
  constructor(
    public currentSize: number,
    public maxSize: number
  ) {
    super(`Queue capacity exceeded: ${currentSize}/${maxSize}`)
    this.name = 'QueueCapacityError'
  }
}

/**
 * Thrown when message not found
 */
export class MessageNotFoundError extends Error {
  constructor(public messageId: string) {
    super(`Message not found: ${messageId}`)
    this.name = 'MessageNotFoundError'
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Sends a message from one agent to another (FR-005)
 *
 * Queues a message for asynchronous delivery to recipient agent.
 * Messages are delivered in FIFO order per recipient with priority
 * consideration.
 *
 * @param message - Message to send (without id, status, timestamps)
 * @returns Promise<string> - Created message ID
 * @throws RecipientNotFoundError if recipient does not exist
 * @throws QueueCapacityError if queue is full
 *
 * @example
 * ```typescript
 * const messageId = await send({
 *   senderId: 'agent-123',
 *   recipientId: 'agent-456',
 *   action: 'share_data',
 *   payload: { data: 'API schema complete' },
 *   priority: 'normal',
 *   expiresAt: new Date(Date.now() + 3600000), // 1 hour
 *   metadata: {}
 * })
 * ```
 */
export interface SendMessage {
  (message: Omit<Message, 'id' | 'status' | 'createdAt' | 'deliveredAt' | 'processedAt' | 'retryCount' | 'error'>): Promise<string>
}

/**
 * Receives pending messages for an agent (FR-005)
 *
 * Retrieves all pending messages for the specified agent in FIFO order.
 * Messages are marked as 'delivered' upon retrieval.
 *
 * @param agentId - Agent identifier
 * @param filter - Optional message filter
 * @returns Promise<Message[]> - List of pending messages
 * @throws AgentNotFoundError if agent does not exist
 *
 * @example
 * ```typescript
 * const messages = await receive('agent-456')
 * for (const msg of messages) {
 *   console.log(`From ${msg.senderId}: ${msg.action}`)
 *   await processMessage(msg)
 *   await markProcessed(msg.id)
 * }
 * ```
 */
export interface ReceiveMessages {
  (agentId: string, filter?: MessageFilter): Promise<Message[]>
}

/**
 * Subscribes to messages for an agent with callback (FR-005)
 *
 * Establishes a real-time subscription where callback is invoked
 * when new messages arrive for the agent. Returns subscription handle
 * for unsubscribing.
 *
 * @param agentId - Agent identifier
 * @param callback - Callback invoked for each new message
 * @param filter - Optional message filter
 * @returns Promise<Subscription> - Subscription handle
 * @throws AgentNotFoundError if agent does not exist
 *
 * @example
 * ```typescript
 * const sub = await subscribe('agent-789', async (message) => {
 *   console.log(`Received ${message.action} from ${message.senderId}`)
 *   await handleMessage(message)
 * }, { actions: ['report_progress', 'report_error'] })
 *
 * // Later: await sub.unsubscribe()
 * ```
 */
export interface SubscribeToMessages {
  (agentId: string, callback: MessageCallback, filter?: MessageFilter): Promise<Subscription>
}

export type MessageCallback = (message: Message) => Promise<void> | void

/**
 * Marks a message as processed (FR-005)
 *
 * Updates message status to 'processed' after agent has handled it.
 *
 * @param messageId - Message identifier
 * @returns Promise<void>
 * @throws MessageNotFoundError if message does not exist
 *
 * @example
 * ```typescript
 * await markProcessed('msg-123')
 * ```
 */
export interface MarkMessageProcessed {
  (messageId: string): Promise<void>
}

/**
 * Gets a specific message by ID (FR-015)
 *
 * @param messageId - Message identifier
 * @returns Promise<Message> - Message details
 * @throws MessageNotFoundError if message does not exist
 *
 * @example
 * ```typescript
 * const message = await getMessage('msg-456')
 * console.log(`Status: ${message.status}`)
 * ```
 */
export interface GetMessage {
  (messageId: string): Promise<Message>
}

/**
 * Lists messages matching filter criteria (FR-015)
 *
 * @param filter - Filter criteria
 * @param options - Query options (pagination, sorting)
 * @returns Promise<Message[]> - List of messages
 *
 * @example
 * ```typescript
 * const errorMessages = await listMessages(
 *   { action: 'report_error', status: 'processed' },
 *   { limit: 50, orderBy: 'createdAt', order: 'desc' }
 * )
 * ```
 */
export interface ListMessages {
  (filter: MessageFilter, options?: QueryOptions): Promise<Message[]>
}

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: 'createdAt' | 'deliveredAt' | 'priority'
  order?: 'asc' | 'desc'
}

/**
 * Sends multiple messages in batch (FR-005)
 *
 * Efficiently sends multiple messages in a single operation.
 * Returns results indicating success/failure for each message.
 *
 * @param messages - Array of messages to send
 * @returns Promise<BatchSendResult> - Batch send results
 *
 * @example
 * ```typescript
 * const result = await sendBatch([
 *   { senderId: 'agent-1', recipientId: 'agent-2', action: 'coordinate', ... },
 *   { senderId: 'agent-1', recipientId: 'agent-3', action: 'coordinate', ... },
 * ])
 *
 * console.log(`Sent ${result.totalSent}, Failed ${result.totalFailed}`)
 * ```
 */
export interface SendBatchMessages {
  (messages: Array<Omit<Message, 'id' | 'status' | 'createdAt' | 'deliveredAt' | 'processedAt' | 'retryCount' | 'error'>>): Promise<BatchSendResult>
}

/**
 * Gets queue statistics (FR-015)
 *
 * Retrieves comprehensive statistics about the message queue.
 *
 * @returns Promise<QueueStatistics> - Queue statistics
 *
 * @example
 * ```typescript
 * const stats = await getQueueStats()
 * console.log(`Total messages: ${stats.totalMessages}`)
 * console.log(`Pending: ${stats.byStatus.pending}`)
 * console.log(`Avg delivery time: ${stats.avgDeliveryTimeMs}ms`)
 * ```
 */
export interface GetQueueStatistics {
  (): Promise<QueueStatistics>
}

/**
 * Purges old processed messages (FR-006)
 *
 * Removes processed messages older than specified age to free storage.
 *
 * @param olderThanDays - Remove messages older than this many days
 * @returns Promise<number> - Number of messages purged
 *
 * @example
 * ```typescript
 * const purged = await purgeMessages(30) // Remove messages older than 30 days
 * console.log(`Purged ${purged} old messages`)
 * ```
 */
export interface PurgeMessages {
  (olderThanDays: number): Promise<number>
}

/**
 * Retries failed message delivery (FR-005)
 *
 * Attempts to redeliver a failed message.
 *
 * @param messageId - Message identifier
 * @returns Promise<boolean> - True if retry successful
 * @throws MessageNotFoundError if message does not exist
 *
 * @example
 * ```typescript
 * const success = await retryMessage('msg-failed-789')
 * if (!success) {
 *   console.error('Retry failed, message permanently failed')
 * }
 * ```
 */
export interface RetryMessage {
  (messageId: string): Promise<boolean>
}

/**
 * Broadcasts message to multiple recipients (FR-005)
 *
 * Sends the same message to multiple agents efficiently.
 *
 * @param message - Message to broadcast (recipientId ignored)
 * @param recipientIds - List of recipient agent IDs
 * @returns Promise<BatchSendResult> - Broadcast results
 *
 * @example
 * ```typescript
 * const result = await broadcast({
 *   senderId: 'agent-coordinator',
 *   action: 'system_notification',
 *   payload: { announcement: 'System maintenance in 1 hour' },
 *   priority: 'high',
 *   ...
 * }, ['agent-1', 'agent-2', 'agent-3'])
 * ```
 */
export interface BroadcastMessage {
  (
    message: Omit<Message, 'id' | 'recipientId' | 'status' | 'createdAt' | 'deliveredAt' | 'processedAt' | 'retryCount' | 'error'>,
    recipientIds: string[]
  ): Promise<BatchSendResult>
}
