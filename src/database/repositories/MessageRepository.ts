import { pool } from '../db.js';
import { logger } from '../../utils/Logger.js';

/**
 * Message status enum
 */
export type MessageStatus = 'pending' | 'delivered' | 'processed';

/**
 * Thread status enum
 */
export type ThreadStatus = 'active' | 'archived' | 'closed';

/**
 * Message data structure based on database schema
 */
export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  payload: Record<string, any>;
  priority: number;
  status: MessageStatus;
  created_at: Date;
  processed_at: Date | null;
  thread_id: string | null;
}

/**
 * MessageThread data structure
 */
export interface MessageThread {
  id: string;
  title: string;
  description: string | null;
  participants: string[];
  metadata: Record<string, any> | null;
  status: ThreadStatus;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

/**
 * Message Repository
 * Manages inter-agent messaging and queue operations
 */
export class MessageRepository {
  /**
   * Send a message from one agent to another
   */
  async create(
    sender_id: string,
    recipient_id: string,
    payload: Record<string, any>,
    priority: number = 0,
    thread_id?: string
  ): Promise<Message> {
    const query = `
      INSERT INTO messages (sender_id, recipient_id, payload, priority, status, thread_id)
      VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING *
    `;

    try {
      const result = await pool.query<Message>(query, [
        sender_id,
        recipient_id,
        JSON.stringify(payload),
        priority,
        thread_id || null,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create message');
      }

      logger.debug(
        { sender_id, recipient_id, priority, thread_id },
        'Message sent'
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ error, sender_id, recipient_id }, 'Failed to send message');
      throw error;
    }
  }

  /**
   * Get pending messages for a recipient (FIFO order)
   * Returns messages ordered by priority (DESC) and creation time (ASC)
   */
  async getPendingMessages(recipient_id: string, limit: number = 10): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE recipient_id = $1 AND status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT $2
    `;

    try {
      const result = await pool.query<Message>(query, [recipient_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, recipient_id }, 'Failed to get pending messages');
      throw error;
    }
  }

  /**
   * Mark a message as delivered
   */
  async markAsDelivered(message_id: string): Promise<Message> {
    const query = `
      UPDATE messages
      SET status = 'delivered'
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `;

    try {
      const result = await pool.query<Message>(query, [message_id]);

      if (result.rows.length === 0) {
        throw new Error(`Message ${message_id} not found or already delivered`);
      }

      logger.debug({ message_id }, 'Message marked as delivered');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, message_id }, 'Failed to mark message as delivered');
      throw error;
    }
  }

  /**
   * Mark a message as processed
   */
  async markAsProcessed(message_id: string): Promise<Message> {
    const query = `
      UPDATE messages
      SET status = 'processed',
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('pending', 'delivered')
      RETURNING *
    `;

    try {
      const result = await pool.query<Message>(query, [message_id]);

      if (result.rows.length === 0) {
        throw new Error(`Message ${message_id} not found or already processed`);
      }

      logger.debug({ message_id }, 'Message marked as processed');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, message_id }, 'Failed to mark message as processed');
      throw error;
    }
  }

  /**
   * Get message by ID
   */
  async getById(message_id: string): Promise<Message | null> {
    const query = `
      SELECT * FROM messages
      WHERE id = $1
    `;

    try {
      const result = await pool.query<Message>(query, [message_id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, message_id }, 'Failed to get message');
      throw error;
    }
  }

  /**
   * Get all messages for an agent (both sent and received)
   */
  async getMessagesByAgent(agent_id: string, limit: number = 50): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE sender_id = $1 OR recipient_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query<Message>(query, [agent_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get messages by agent');
      throw error;
    }
  }

  /**
   * Delete old processed messages (cleanup)
   */
  async deleteProcessedBefore(before_date: Date): Promise<number> {
    const query = `
      DELETE FROM messages
      WHERE status = 'processed' AND processed_at < $1
    `;

    try {
      const result = await pool.query(query, [before_date]);
      const count = result.rowCount || 0;

      logger.info({ count, before_date }, 'Old messages deleted');
      return count;
    } catch (error) {
      logger.error({ error, before_date }, 'Failed to delete old messages');
      throw error;
    }
  }

  /**
   * Get messages sent by a specific agent
   */
  async getBySender(sender_id: string, limit: number = 50): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE sender_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query<Message>(query, [sender_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, sender_id }, 'Failed to get messages by sender');
      throw error;
    }
  }

  /**
   * Get all messages for a recipient (any status)
   */
  async getForRecipient(recipient_id: string, limit: number = 50): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE recipient_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query<Message>(query, [recipient_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, recipient_id }, 'Failed to get messages for recipient');
      throw error;
    }
  }

  /**
   * Get conversation between two agents (bidirectional)
   */
  async getConversation(
    agent1_id: string,
    agent2_id: string,
    limit: number = 100
  ): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE (sender_id = $1 AND recipient_id = $2)
         OR (sender_id = $2 AND recipient_id = $1)
      ORDER BY created_at ASC
      LIMIT $3
    `;

    try {
      const result = await pool.query<Message>(query, [agent1_id, agent2_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, agent1_id, agent2_id }, 'Failed to get conversation');
      throw error;
    }
  }

  /**
   * Count pending messages for a recipient
   */
  async countPending(recipient_id: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM messages
      WHERE recipient_id = $1 AND status = 'pending'
    `;

    try {
      const result = await pool.query<{ count: string }>(query, [recipient_id]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error({ error, recipient_id }, 'Failed to count pending messages');
      throw error;
    }
  }

  /**
   * Get message statistics for an agent
   */
  async getStats(agent_id: string): Promise<{
    sent: number;
    received: number;
    pending: number;
    delivered: number;
    processed: number;
  }> {
    try {
      const queries = [
        pool.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM messages WHERE sender_id = $1',
          [agent_id]
        ),
        pool.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1',
          [agent_id]
        ),
        pool.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND status = $2',
          [agent_id, 'pending']
        ),
        pool.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND status = $2',
          [agent_id, 'delivered']
        ),
        pool.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND status = $2',
          [agent_id, 'processed']
        ),
      ];

      const [sentResult, receivedResult, pendingResult, deliveredResult, processedResult] =
        await Promise.all(queries);

      return {
        sent: parseInt(sentResult.rows[0].count, 10),
        received: parseInt(receivedResult.rows[0].count, 10),
        pending: parseInt(pendingResult.rows[0].count, 10),
        delivered: parseInt(deliveredResult.rows[0].count, 10),
        processed: parseInt(processedResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get message stats');
      throw error;
    }
  }

  /**
   * Update message status (generic)
   */
  async updateStatus(message_id: string, status: MessageStatus): Promise<Message> {
    const query = `
      UPDATE messages
      SET status = $2,
          processed_at = CASE WHEN $2 = 'processed' THEN CURRENT_TIMESTAMP ELSE processed_at END
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query<Message>(query, [message_id, status]);

      if (result.rows.length === 0) {
        throw new Error(`Message ${message_id} not found`);
      }

      logger.info({ message_id, status }, 'Message status updated');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, message_id, status }, 'Failed to update message status');
      throw error;
    }
  }

  /**
   * Delete a specific message
   */
  async delete(message_id: string): Promise<void> {
    const query = `
      DELETE FROM messages
      WHERE id = $1
    `;

    try {
      const result = await pool.query(query, [message_id]);

      if (result.rowCount === 0) {
        throw new Error(`Message ${message_id} not found`);
      }

      logger.info({ message_id }, 'Message deleted');
    } catch (error) {
      logger.error({ error, message_id }, 'Failed to delete message');
      throw error;
    }
  }

  /**
   * Alias for getById (consistency with other repositories)
   */
  async findById(message_id: string): Promise<Message | null> {
    return this.getById(message_id);
  }

  // ============================================================================
  // Thread Management Methods
  // ============================================================================

  /**
   * Create a new message thread
   */
  async createThread(
    title: string,
    participants: string[],
    options?: {
      description?: string;
      metadata?: Record<string, any>;
      status?: ThreadStatus;
    }
  ): Promise<MessageThread> {
    const query = `
      INSERT INTO message_threads (title, description, participants, metadata, status)
      VALUES ($1, $2, $3::uuid[], $4, $5)
      RETURNING *
    `;

    try {
      const result = await pool.query<MessageThread>(query, [
        title,
        options?.description || null,
        participants,
        options?.metadata ? JSON.stringify(options.metadata) : null,
        options?.status || 'active',
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create message thread');
      }

      logger.info(
        { thread_id: result.rows[0].id, title, participant_count: participants.length },
        'Message thread created'
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ error, title, participants }, 'Failed to create message thread');
      throw error;
    }
  }

  /**
   * Get message thread by ID
   */
  async getThreadById(thread_id: string): Promise<MessageThread | null> {
    const query = `
      SELECT * FROM message_threads
      WHERE id = $1
    `;

    try {
      const result = await pool.query<MessageThread>(query, [thread_id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, thread_id }, 'Failed to get message thread');
      throw error;
    }
  }

  /**
   * Get all messages in a thread
   */
  async getThreadMessages(thread_id: string, limit: number = 100): Promise<Message[]> {
    const query = `
      SELECT * FROM messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    `;

    try {
      const result = await pool.query<Message>(query, [thread_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, thread_id }, 'Failed to get thread messages');
      throw error;
    }
  }

  /**
   * Add an existing message to a thread
   */
  async addMessageToThread(message_id: string, thread_id: string): Promise<Message> {
    const query = `
      UPDATE messages
      SET thread_id = $2
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query<Message>(query, [message_id, thread_id]);

      if (result.rows.length === 0) {
        throw new Error(`Message ${message_id} not found`);
      }

      logger.debug({ message_id, thread_id }, 'Message added to thread');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, message_id, thread_id }, 'Failed to add message to thread');
      throw error;
    }
  }

  /**
   * Get all threads for a participant agent
   */
  async getThreadsByParticipant(
    agent_id: string,
    options?: {
      status?: ThreadStatus;
      limit?: number;
    }
  ): Promise<MessageThread[]> {
    const status = options?.status;
    const limit = options?.limit || 50;

    const query = `
      SELECT * FROM message_threads
      WHERE $1 = ANY(participants)
        ${status ? 'AND status = $2' : ''}
      ORDER BY updated_at DESC
      LIMIT $${status ? 3 : 2}
    `;

    try {
      const params = status ? [agent_id, status, limit] : [agent_id, limit];
      const result = await pool.query<MessageThread>(query, params);
      return result.rows;
    } catch (error) {
      logger.error({ error, agent_id }, 'Failed to get threads by participant');
      throw error;
    }
  }

  /**
   * Update message thread
   */
  async updateThread(
    thread_id: string,
    updates: {
      title?: string;
      description?: string | null;
      metadata?: Record<string, any> | null;
      status?: ThreadStatus;
    }
  ): Promise<MessageThread> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);

      if (updates.status === 'closed') {
        fields.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(thread_id);

    const query = `
      UPDATE message_threads
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query<MessageThread>(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Thread ${thread_id} not found`);
      }

      logger.info({ thread_id, updates }, 'Message thread updated');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, thread_id, updates }, 'Failed to update message thread');
      throw error;
    }
  }

  /**
   * Close a message thread
   */
  async closeThread(thread_id: string): Promise<MessageThread> {
    return this.updateThread(thread_id, { status: 'closed' });
  }

  /**
   * Archive a message thread
   */
  async archiveThread(thread_id: string): Promise<MessageThread> {
    return this.updateThread(thread_id, { status: 'archived' });
  }
}
