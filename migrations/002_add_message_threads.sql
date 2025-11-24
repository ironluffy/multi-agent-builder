-- ============================================================================
-- Migration 002: Add Message Threads Support
-- ============================================================================
-- This migration adds support for organizing messages into conversation threads.
-- Threads group related messages by topic, task, or workflow context.

-- ============================================================================
-- Message Threads Table
-- ============================================================================
CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  participants UUID[] NOT NULL,
  metadata JSONB,
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'archived', 'closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  CONSTRAINT participants_minimum CHECK (array_length(participants, 1) >= 2)
);

-- Index for participant lookups
CREATE INDEX idx_message_threads_participants ON message_threads USING GIN (participants);

-- Index for status
CREATE INDEX idx_message_threads_status ON message_threads(status);

-- Index for created_at
CREATE INDEX idx_message_threads_created_at ON message_threads(created_at DESC);

-- ============================================================================
-- Add thread_id to messages table
-- ============================================================================
ALTER TABLE messages
  ADD COLUMN thread_id UUID REFERENCES message_threads(id) ON DELETE SET NULL;

-- Index for thread-based message retrieval
CREATE INDEX idx_messages_thread_id ON messages(thread_id, created_at ASC);

-- ============================================================================
-- Trigger to update message_threads.updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_message_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_message_thread_timestamp
  BEFORE UPDATE ON message_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_message_thread_timestamp();
