import { MessageRepository } from '../database/repositories/MessageRepository.js';
import type { Message } from '../database/repositories/MessageRepository.js';
import { logger } from '../utils/Logger.js';
import { config } from '../config/env.js';

/**
 * Message payload type - flexible JSONB structure
 */
export type MessagePayload = Record<string, any>;

/**
 * Shared Queue
 * PostgreSQL-backed message queue for inter-agent communication
 *
 * Features:
 * - FIFO message delivery with priority support
 * - Persistent message storage
 * - Status tracking (pending -> delivered -> processed)
 * - Automatic cleanup of old messages
 *
 * Architecture:
 * - Uses PostgreSQL messages table for persistence
 * - Priority-based ordering (higher priority first)
 * - FIFO within same priority level
 */
export class SharedQueue {
  private messageRepo: MessageRepository;
  private queueLogger = logger.child({ component: 'SharedQueue' });
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.messageRepo = new MessageRepository();
    this.startCleanupScheduler();
  }

  /**
   * Send a message from one agent to another
   * Creates a new message in pending status
   *
   * @param from - Sender agent ID
   * @param to - Recipient agent ID
   * @param payload - Message payload (any JSON-serializable object)
   * @param priority - Message priority (higher = more urgent, default: 0)
   * @returns Created message
   */
  async send(
    from: string,
    to: string,
    payload: MessagePayload,
    priority: number = 0
  ): Promise<Message> {
    try {
      const message = await this.messageRepo.create(from, to, payload, priority);

      this.queueLogger.debug(
        {
          message_id: message.id,
          from,
          to,
          priority,
        },
        'Message sent to queue'
      );

      return message;
    } catch (error) {
      this.queueLogger.error(
        { error, from, to, priority },
        'Failed to send message'
      );
      throw error;
    }
  }

  /**
   * Receive pending messages for an agent (FIFO order)
   * Returns messages ordered by priority (DESC) then creation time (ASC)
   *
   * @param agentId - Recipient agent ID
   * @param limit - Maximum number of messages to retrieve (default: 10)
   * @returns Array of pending messages
   */
  async receive(agentId: string, limit: number = 10): Promise<Message[]> {
    try {
      const messages = await this.messageRepo.getPendingMessages(agentId, limit);

      if (messages.length > 0) {
        this.queueLogger.debug(
          {
            agent_id: agentId,
            count: messages.length,
          },
          'Messages received from queue'
        );
      }

      return messages;
    } catch (error) {
      this.queueLogger.error(
        { error, agent_id: agentId },
        'Failed to receive messages'
      );
      throw error;
    }
  }

  /**
   * Mark a message as delivered
   * Transitions message from pending to delivered status
   *
   * @param messageId - Message UUID
   * @returns Updated message
   */
  async markDelivered(messageId: string): Promise<Message> {
    try {
      const message = await this.messageRepo.markAsDelivered(messageId);

      this.queueLogger.debug(
        { message_id: messageId },
        'Message marked as delivered'
      );

      return message;
    } catch (error) {
      this.queueLogger.error(
        { error, message_id: messageId },
        'Failed to mark message as delivered'
      );
      throw error;
    }
  }

  /**
   * Mark a message as processed
   * Transitions message to final processed status with timestamp
   *
   * @param messageId - Message UUID
   * @returns Updated message
   */
  async markProcessed(messageId: string): Promise<Message> {
    try {
      const message = await this.messageRepo.markAsProcessed(messageId);

      this.queueLogger.debug(
        { message_id: messageId },
        'Message marked as processed'
      );

      return message;
    } catch (error) {
      this.queueLogger.error(
        { error, message_id: messageId },
        'Failed to mark message as processed'
      );
      throw error;
    }
  }

  /**
   * Get a specific message by ID
   *
   * @param messageId - Message UUID
   * @returns Message if found, null otherwise
   */
  async getMessage(messageId: string): Promise<Message | null> {
    try {
      return await this.messageRepo.getById(messageId);
    } catch (error) {
      this.queueLogger.error(
        { error, message_id: messageId },
        'Failed to get message'
      );
      throw error;
    }
  }

  /**
   * Get all messages for an agent (sent and received)
   *
   * @param agentId - Agent UUID
   * @param limit - Maximum number of messages (default: 50)
   * @returns Array of messages
   */
  async getMessagesByAgent(agentId: string, limit: number = 50): Promise<Message[]> {
    try {
      return await this.messageRepo.getMessagesByAgent(agentId, limit);
    } catch (error) {
      this.queueLogger.error(
        { error, agent_id: agentId },
        'Failed to get agent messages'
      );
      throw error;
    }
  }

  /**
   * Clean up old processed messages
   * Removes messages older than retention period
   *
   * @returns Number of messages deleted
   */
  async cleanup(): Promise<number> {
    try {
      const retentionDays = config.messageQueue.retentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const count = await this.messageRepo.deleteProcessedBefore(cutoffDate);

      if (count > 0) {
        this.queueLogger.info(
          { count, cutoff_date: cutoffDate },
          'Old messages cleaned up'
        );
      }

      return count;
    } catch (error) {
      this.queueLogger.error({ error }, 'Failed to cleanup old messages');
      throw error;
    }
  }

  /**
   * Start automatic cleanup scheduler
   * Runs cleanup every 24 hours
   */
  private startCleanupScheduler(): void {
    // Run cleanup daily
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.queueLogger.error({ error }, 'Scheduled cleanup failed');
      }
    }, CLEANUP_INTERVAL);

    this.queueLogger.info('Message cleanup scheduler started');
  }

  /**
   * Stop cleanup scheduler
   * Call this when shutting down the application
   */
  stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.queueLogger.info('Message cleanup scheduler stopped');
    }
  }

  /**
   * Get conversation between two agents
   *
   * @param agent1Id - First agent UUID
   * @param agent2Id - Second agent UUID
   * @param limit - Maximum number of messages (default: 100)
   * @returns Array of messages in both directions
   */
  async getConversation(
    agent1Id: string,
    agent2Id: string,
    limit: number = 100
  ): Promise<Message[]> {
    try {
      return await this.messageRepo.getConversation(agent1Id, agent2Id, limit);
    } catch (error) {
      this.queueLogger.error(
        { error, agent1Id, agent2Id },
        'Failed to get conversation'
      );
      throw error;
    }
  }

  /**
   * Get message count for an agent
   *
   * @param agentId - Agent UUID
   * @returns Number of pending messages
   */
  async getPendingCount(agentId: string): Promise<number> {
    try {
      return await this.messageRepo.countPending(agentId);
    } catch (error) {
      this.queueLogger.error(
        { error, agent_id: agentId },
        'Failed to get pending count'
      );
      throw error;
    }
  }

  /**
   * Get message statistics for an agent
   *
   * @param agentId - Agent UUID
   * @returns Message statistics
   */
  async getStats(agentId: string): Promise<{
    sent: number;
    received: number;
    pending: number;
    delivered: number;
    processed: number;
  }> {
    try {
      return await this.messageRepo.getStats(agentId);
    } catch (error) {
      this.queueLogger.error(
        { error, agent_id: agentId },
        'Failed to get message stats'
      );
      throw error;
    }
  }

  /**
   * Broadcast message to multiple recipients
   *
   * @param from - Sender agent ID
   * @param toList - Array of recipient agent IDs
   * @param payload - Message payload
   * @param priority - Message priority (default: 0)
   * @returns Array of created messages
   */
  async broadcast(
    from: string,
    toList: string[],
    payload: MessagePayload,
    priority: number = 0
  ): Promise<Message[]> {
    try {
      const messages = await Promise.all(
        toList.map(to => this.messageRepo.create(from, to, payload, priority))
      );

      this.queueLogger.info(
        {
          from,
          recipientCount: toList.length,
          priority,
        },
        'Broadcast message sent'
      );

      return messages;
    } catch (error) {
      this.queueLogger.error(
        { error, from, recipientCount: toList.length },
        'Failed to broadcast message'
      );
      throw error;
    }
  }
}
