// Configure test environment before imports
import '../setup/test-env-setup.js';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../src/infrastructure/SharedDatabase.js';
import { AgentService } from '../../src/services/AgentService.js';
import { SharedQueue } from '../../src/infrastructure/SharedQueue.js';
import type { MessagePayload } from '../../src/infrastructure/SharedQueue.js';

/**
 * Integration Tests for US3: Message Queue
 *
 * Tests verify:
 * - FIFO message ordering with priority support
 * - High-volume message delivery (100+ messages)
 * - SC-003: 99.9% message delivery guarantee
 * - Thread-based message grouping
 */

describe('US3: Message Queue', () => {
  let agentService: AgentService;
  let queue: SharedQueue;

  let senderAgentId: string;
  let recipientAgentId: string;

  beforeAll(async () => {
    // Initialize test database connection
    await db.initialize();

    agentService = new AgentService();
    queue = new SharedQueue();
  });

  afterAll(async () => {
    queue.stopCleanupScheduler();
    await db.shutdown();
  });

  beforeEach(async () => {
    // Clean up messages and agents before each test
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM agents');

    // Create sender and recipient agents
    senderAgentId = await agentService.spawnAgent('SenderAgent', 'Send messages', 10000);
    recipientAgentId = await agentService.spawnAgent('RecipientAgent', 'Receive messages', 10000);
  });

  // ==========================================================================
  // WP05.9: FIFO Message Ordering
  // ==========================================================================

  it('should deliver 10 messages in FIFO order (same priority)', async () => {
    // Send 10 messages with same priority
    const messageCount = 10;
    const sentMessages = [];

    for (let i = 0; i < messageCount; i++) {
      const payload: MessagePayload = {
        type: 'task',
        sequence: i,
        content: `Message ${i}`,
      };

      const message = await queue.send(senderAgentId, recipientAgentId, payload, 0);
      sentMessages.push(message);

      // Small delay to ensure different created_at timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Receive all messages
    const receivedMessages = await queue.receive(recipientAgentId, messageCount);

    // Verify count
    expect(receivedMessages).toHaveLength(messageCount);

    // Verify FIFO order (should match sent order)
    for (let i = 0; i < messageCount; i++) {
      expect(receivedMessages[i].payload.sequence).toBe(i);
      expect(receivedMessages[i].payload.content).toBe(`Message ${i}`);
      expect(receivedMessages[i].id).toBe(sentMessages[i].id);
    }

    // Verify all messages are pending
    receivedMessages.forEach(msg => {
      expect(msg.status).toBe('pending');
    });
  });

  it('should prioritize high-priority messages over low-priority', async () => {
    // Send messages with varying priorities
    const lowPriorityMsg = await queue.send(senderAgentId, recipientAgentId, { content: 'Low' }, 0);
    await new Promise(resolve => setTimeout(resolve, 10));

    const mediumPriorityMsg = await queue.send(senderAgentId, recipientAgentId, { content: 'Medium' }, 5);
    await new Promise(resolve => setTimeout(resolve, 10));

    const highPriorityMsg = await queue.send(senderAgentId, recipientAgentId, { content: 'High' }, 10);
    await new Promise(resolve => setTimeout(resolve, 10));

    const anotherHighMsg = await queue.send(senderAgentId, recipientAgentId, { content: 'High 2' }, 10);

    // Receive messages
    const received = await queue.receive(recipientAgentId, 10);

    // Verify priority ordering
    expect(received).toHaveLength(4);

    // First two should be high priority (in FIFO order within same priority)
    expect(received[0].payload.content).toBe('High');
    expect(received[0].priority).toBe(10);

    expect(received[1].payload.content).toBe('High 2');
    expect(received[1].priority).toBe(10);

    // Then medium priority
    expect(received[2].payload.content).toBe('Medium');
    expect(received[2].priority).toBe(5);

    // Then low priority
    expect(received[3].payload.content).toBe('Low');
    expect(received[3].priority).toBe(0);
  });

  it('should maintain FIFO order within same priority level', async () => {
    // Send 5 messages with priority 5
    const messages = [];
    for (let i = 0; i < 5; i++) {
      const msg = await queue.send(
        senderAgentId,
        recipientAgentId,
        { sequence: i },
        5 // same priority
      );
      messages.push(msg);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Receive messages
    const received = await queue.receive(recipientAgentId, 10);

    // All should have same priority
    expect(received.every(m => m.priority === 5)).toBe(true);

    // Should be in FIFO order (sequence 0, 1, 2, 3, 4)
    for (let i = 0; i < 5; i++) {
      expect(received[i].payload.sequence).toBe(i);
    }
  });

  // ==========================================================================
  // WP05.10: High-Volume Message Delivery (100 messages)
  // ==========================================================================

  it('should deliver 100 messages with varying priorities (SC-003: 99.9% delivery)', async () => {
    const messageCount = 100;
    const sentMessages = [];

    // Send 100 messages with random priorities (0-10)
    for (let i = 0; i < messageCount; i++) {
      const priority = Math.floor(Math.random() * 11); // 0-10
      const payload: MessagePayload = {
        type: 'bulk-test',
        sequence: i,
        priority,
        timestamp: new Date().toISOString(),
      };

      const message = await queue.send(senderAgentId, recipientAgentId, payload, priority);
      sentMessages.push(message);
    }

    // Verify all messages were created
    expect(sentMessages).toHaveLength(messageCount);

    // Receive all messages (using large limit)
    const receivedMessages = await queue.receive(recipientAgentId, messageCount);

    // Verify delivery count (SC-003: 99.9% delivery)
    const deliveryRate = (receivedMessages.length / messageCount) * 100;
    expect(deliveryRate).toBeGreaterThanOrEqual(99.9);
    expect(receivedMessages.length).toBe(messageCount);

    // Verify all messages are unique (no duplicates)
    const messageIds = new Set(receivedMessages.map(m => m.id));
    expect(messageIds.size).toBe(messageCount);

    // Verify priority ordering: higher priority comes first
    for (let i = 0; i < receivedMessages.length - 1; i++) {
      const current = receivedMessages[i];
      const next = receivedMessages[i + 1];

      // Either current priority is higher, or priorities are equal
      expect(current.priority >= next.priority).toBe(true);
    }

    // Verify FIFO within same priority
    const priorityGroups = new Map<number, typeof receivedMessages>();
    receivedMessages.forEach(msg => {
      const group = priorityGroups.get(msg.priority) || [];
      group.push(msg);
      priorityGroups.set(msg.priority, group);
    });

    // Within each priority group, verify FIFO order (created_at ASC)
    priorityGroups.forEach((group, priority) => {
      for (let i = 0; i < group.length - 1; i++) {
        const current = new Date(group[i].created_at);
        const next = new Date(group[i + 1].created_at);
        expect(current.getTime()).toBeLessThanOrEqual(next.getTime());
      }
    });

    // Verify all messages have pending status
    expect(receivedMessages.every(m => m.status === 'pending')).toBe(true);
  });

  it('should handle concurrent message sending (parallel writes)', async () => {
    const messageCount = 50;

    // Send 50 messages concurrently using Promise.all
    const sendPromises = Array.from({ length: messageCount }, (_, i) =>
      queue.send(senderAgentId, recipientAgentId, { sequence: i, content: `Concurrent ${i}` }, 0)
    );

    const sentMessages = await Promise.all(sendPromises);

    // Verify all messages were created
    expect(sentMessages).toHaveLength(messageCount);

    // Verify all messages are unique
    const messageIds = new Set(sentMessages.map(m => m.id));
    expect(messageIds.size).toBe(messageCount);

    // Receive messages
    const receivedMessages = await queue.receive(recipientAgentId, messageCount);

    // Verify all messages were received
    expect(receivedMessages).toHaveLength(messageCount);

    // Verify all received messages match sent messages
    const receivedIds = new Set(receivedMessages.map(m => m.id));
    sentMessages.forEach(sent => {
      expect(receivedIds.has(sent.id)).toBe(true);
    });
  });

  // ==========================================================================
  // Message Status State Machine
  // ==========================================================================

  it('should transition message status: pending → delivered → processed', async () => {
    const message = await queue.send(senderAgentId, recipientAgentId, { content: 'Test' }, 0);

    // Initial status: pending
    expect(message.status).toBe('pending');

    // Mark as delivered
    const deliveredMsg = await queue.markDelivered(message.id);
    expect(deliveredMsg.status).toBe('delivered');
    expect(deliveredMsg.id).toBe(message.id);

    // Mark as processed
    const processedMsg = await queue.markProcessed(message.id);
    expect(processedMsg.status).toBe('processed');
    expect(processedMsg.processed_at).not.toBeNull();
    expect(processedMsg.id).toBe(message.id);

    // Verify processed message is not in pending queue
    const pendingMessages = await queue.receive(recipientAgentId, 10);
    expect(pendingMessages.find(m => m.id === message.id)).toBeUndefined();
  });

  it('should not return processed messages in pending queue', async () => {
    // Send 5 messages
    const messages = [];
    for (let i = 0; i < 5; i++) {
      const msg = await queue.send(senderAgentId, recipientAgentId, { sequence: i }, 0);
      messages.push(msg);
    }

    // Process first 3 messages
    for (let i = 0; i < 3; i++) {
      await queue.markDelivered(messages[i].id);
      await queue.markProcessed(messages[i].id);
    }

    // Receive pending messages
    const pending = await queue.receive(recipientAgentId, 10);

    // Should only get 2 remaining messages (sequence 3 and 4)
    expect(pending).toHaveLength(2);
    expect(pending[0].payload.sequence).toBe(3);
    expect(pending[1].payload.sequence).toBe(4);
  });

  // ==========================================================================
  // Message Statistics
  // ==========================================================================

  it('should accurately track message statistics', async () => {
    // Sender sends 5 messages
    for (let i = 0; i < 5; i++) {
      await queue.send(senderAgentId, recipientAgentId, { content: `Message ${i}` }, 0);
    }

    // Recipient receives 3 messages and processes 2
    const received = await queue.receive(recipientAgentId, 3);
    await queue.markDelivered(received[0].id);
    await queue.markProcessed(received[0].id);
    await queue.markDelivered(received[1].id);
    await queue.markProcessed(received[1].id);

    // Get statistics
    const senderStats = await queue.getStats(senderAgentId);
    const recipientStats = await queue.getStats(recipientAgentId);

    // Sender stats
    expect(senderStats.sent).toBe(5);
    expect(senderStats.received).toBe(0);

    // Recipient stats
    expect(recipientStats.sent).toBe(0);
    expect(recipientStats.received).toBe(5);
    expect(recipientStats.pending).toBe(3); // 5 - 2 processed
    expect(recipientStats.processed).toBe(2);
  });

  // ==========================================================================
  // Broadcast Messaging
  // ==========================================================================

  it('should broadcast message to multiple recipients', async () => {
    // Create 3 additional recipient agents
    const recipients = await Promise.all([
      agentService.spawnAgent('Recipient1', 'Receive', 1000),
      agentService.spawnAgent('Recipient2', 'Receive', 1000),
      agentService.spawnAgent('Recipient3', 'Receive', 1000),
    ]);

    // Broadcast message
    const messages = await queue.broadcast(
      senderAgentId,
      recipients,
      { content: 'Broadcast message', type: 'announcement' },
      5
    );

    // Verify 3 messages created
    expect(messages).toHaveLength(3);

    // Verify each recipient got the message
    for (const recipientId of recipients) {
      const received = await queue.receive(recipientId, 10);
      expect(received).toHaveLength(1);
      expect(received[0].payload.content).toBe('Broadcast message');
      expect(received[0].sender_id).toBe(senderAgentId);
      expect(received[0].priority).toBe(5);
    }
  });

  // ==========================================================================
  // Conversation History
  // ==========================================================================

  it('should retrieve bidirectional conversation between two agents', async () => {
    // Agent A sends 3 messages to Agent B
    await queue.send(senderAgentId, recipientAgentId, { content: 'A→B: Message 1' }, 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    await queue.send(senderAgentId, recipientAgentId, { content: 'A→B: Message 2' }, 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    await queue.send(senderAgentId, recipientAgentId, { content: 'A→B: Message 3' }, 0);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Agent B sends 2 messages to Agent A
    await queue.send(recipientAgentId, senderAgentId, { content: 'B→A: Reply 1' }, 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    await queue.send(recipientAgentId, senderAgentId, { content: 'B→A: Reply 2' }, 0);

    // Get conversation
    const conversation = await queue.getConversation(senderAgentId, recipientAgentId, 100);

    // Should have 5 messages total
    expect(conversation).toHaveLength(5);

    // Should be in chronological order
    expect(conversation[0].payload.content).toBe('A→B: Message 1');
    expect(conversation[1].payload.content).toBe('A→B: Message 2');
    expect(conversation[2].payload.content).toBe('A→B: Message 3');
    expect(conversation[3].payload.content).toBe('B→A: Reply 1');
    expect(conversation[4].payload.content).toBe('B→A: Reply 2');
  });

  // ==========================================================================
  // Pending Message Count
  // ==========================================================================

  it('should accurately count pending messages', async () => {
    // Initially no messages
    let pendingCount = await queue.getPendingCount(recipientAgentId);
    expect(pendingCount).toBe(0);

    // Send 5 messages
    for (let i = 0; i < 5; i++) {
      await queue.send(senderAgentId, recipientAgentId, { content: `Message ${i}` }, 0);
    }

    // Should have 5 pending
    pendingCount = await queue.getPendingCount(recipientAgentId);
    expect(pendingCount).toBe(5);

    // Process 2 messages
    const received = await queue.receive(recipientAgentId, 2);
    await queue.markProcessed(received[0].id);
    await queue.markProcessed(received[1].id);

    // Should have 3 pending remaining
    pendingCount = await queue.getPendingCount(recipientAgentId);
    expect(pendingCount).toBe(3);
  });
});
