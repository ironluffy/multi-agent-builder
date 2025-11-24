-- UP
-- Migration: 001_initial_schema
-- Description: Create all core tables for multi-agent orchestration system
-- Tasks: T015-T025

-- ============================================================================
-- T015: Agents Table
-- ============================================================================
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'terminated')),
  depth_level INTEGER NOT NULL DEFAULT 0,
  parent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  task_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ============================================================================
-- T016: Budgets Table
-- ============================================================================
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  allocated INTEGER NOT NULL CHECK (allocated >= 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT budget_limits CHECK (used + reserved <= allocated)
);

-- ============================================================================
-- T017: Messages Table
-- ============================================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'delivered', 'processed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- ============================================================================
-- T018: Workspaces Table
-- ============================================================================
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  worktree_path VARCHAR(512) UNIQUE NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  isolation_status VARCHAR(50) NOT NULL CHECK (isolation_status IN ('active', 'merged', 'deleted')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- T019: Checkpoints Table
-- ============================================================================
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  state_snapshot JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- T020-T021: Hierarchies Table
-- ============================================================================
CREATE TABLE hierarchies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_parent_child UNIQUE (parent_id, child_id),
  CONSTRAINT no_self_reference CHECK (parent_id != child_id)
);

-- ============================================================================
-- T022: Indexes for Performance Optimization
-- ============================================================================

-- Agent indexes
CREATE INDEX idx_agents_parent_id ON agents(parent_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_depth_level ON agents(depth_level);
CREATE INDEX idx_agents_created_at ON agents(created_at);

-- Budget indexes
CREATE INDEX idx_budgets_agent ON budgets(agent_id);

-- Message indexes
CREATE INDEX idx_messages_recipient_status ON messages(recipient_id, status);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_priority ON messages(priority DESC);

-- Workspace indexes
CREATE INDEX idx_workspaces_agent ON workspaces(agent_id);
CREATE INDEX idx_workspaces_status ON workspaces(isolation_status);

-- Checkpoint indexes
CREATE INDEX idx_checkpoints_agent ON checkpoints(agent_id);
CREATE INDEX idx_checkpoints_created ON checkpoints(created_at DESC);

-- Hierarchy indexes
CREATE INDEX idx_hierarchies_parent ON hierarchies(parent_id);
CREATE INDEX idx_hierarchies_child ON hierarchies(child_id);

-- ============================================================================
-- T023: Budget Allocation Trigger (Deduct from Parent)
-- ============================================================================
CREATE OR REPLACE FUNCTION allocate_child_budget()
RETURNS TRIGGER AS $$
DECLARE
  parent_agent_id UUID;
BEGIN
  -- Get the parent agent ID
  SELECT parent_id INTO parent_agent_id
  FROM agents
  WHERE id = NEW.agent_id;

  -- If this agent has a parent, reserve budget from parent
  IF parent_agent_id IS NOT NULL THEN
    UPDATE budgets
    SET reserved = reserved + NEW.allocated,
        updated_at = CURRENT_TIMESTAMP
    WHERE agent_id = parent_agent_id;

    -- Verify parent has enough budget
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent agent % has no budget record', parent_agent_id;
    END IF;

    -- Check if parent has sufficient available budget
    IF (SELECT (allocated - used - reserved) FROM budgets WHERE agent_id = parent_agent_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient budget in parent agent %', parent_agent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_allocate_child_budget
AFTER INSERT ON budgets
FOR EACH ROW
EXECUTE FUNCTION allocate_child_budget();

-- ============================================================================
-- T024: Budget Reclaim Trigger (Return Unused Budget to Parent)
-- ============================================================================
CREATE OR REPLACE FUNCTION reclaim_child_budget()
RETURNS TRIGGER AS $$
DECLARE
  parent_agent_id UUID;
  child_allocated INTEGER;
  child_used INTEGER;
  unused_budget INTEGER;
BEGIN
  -- Only process when agent transitions to terminal state
  IF NEW.status IN ('completed', 'failed', 'terminated') AND
     OLD.status NOT IN ('completed', 'failed', 'terminated') THEN

    -- Get parent agent ID
    SELECT parent_id INTO parent_agent_id
    FROM agents
    WHERE id = NEW.id;

    -- If this agent has a parent, reclaim unused budget
    IF parent_agent_id IS NOT NULL THEN
      -- Get child's budget allocation and usage
      SELECT allocated, used INTO child_allocated, child_used
      FROM budgets
      WHERE agent_id = NEW.id;

      -- Calculate unused budget (allocated - used)
      unused_budget := child_allocated - child_used;

      -- Return unused budget to parent by reducing reserved amount
      UPDATE budgets
      SET reserved = reserved - child_allocated + child_used,
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = parent_agent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reclaim_child_budget
AFTER UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION reclaim_child_budget();

-- ============================================================================
-- T025: Schema Migrations Tracking
-- ============================================================================
-- Note: The schema_migrations table is created by migration
-- 20250122100000_create_schema_migrations.sql and managed by migrate.ts
-- This migration will be recorded there upon successful execution.

-- ============================================================================
-- Additional Helper Functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER trigger_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_budgets_updated_at
BEFORE UPDATE ON budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_workspaces_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOWN
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_reclaim_child_budget ON agents;
DROP TRIGGER IF EXISTS trigger_allocate_child_budget ON budgets;
DROP TRIGGER IF EXISTS trigger_agents_updated_at ON agents;
DROP TRIGGER IF EXISTS trigger_budgets_updated_at ON budgets;
DROP TRIGGER IF EXISTS trigger_workspaces_updated_at ON workspaces;

-- Drop functions
DROP FUNCTION IF EXISTS reclaim_child_budget();
DROP FUNCTION IF EXISTS allocate_child_budget();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in reverse order (respecting foreign key constraints)
DROP TABLE IF EXISTS hierarchies;
DROP TABLE IF EXISTS checkpoints;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS agents;
