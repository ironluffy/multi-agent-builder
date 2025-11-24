-- ============================================================================
-- Migration 005: Add Agent Tracing and Monitoring Tables
-- ============================================================================
-- UP

-- ============================================================================
-- agent_traces: Stores detailed execution traces for each agent
-- Captures every SDK message for complete observability
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trace_index INTEGER NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Message type from Claude SDK
  message_type VARCHAR(50) NOT NULL, -- 'thinking', 'assistant', 'tool_use', 'tool_result', 'result', 'user'

  -- Content of the message
  content TEXT,

  -- Structured metadata (full SDK message as JSON)
  metadata JSONB DEFAULT '{}',

  -- Token usage at this point
  input_tokens INTEGER,
  output_tokens INTEGER,

  CONSTRAINT unique_agent_trace_index UNIQUE (agent_id, trace_index)
);

CREATE INDEX idx_agent_traces_agent ON agent_traces(agent_id, trace_index);
CREATE INDEX idx_agent_traces_timestamp ON agent_traces(timestamp);
CREATE INDEX idx_agent_traces_type ON agent_traces(message_type);

COMMENT ON TABLE agent_traces IS 'Detailed execution traces capturing every SDK message from agent execution';
COMMENT ON COLUMN agent_traces.trace_index IS 'Sequential index for ordering traces within an agent';
COMMENT ON COLUMN agent_traces.message_type IS 'Type of SDK message: thinking, assistant, tool_use, tool_result, result';

-- ============================================================================
-- agent_tool_usage: Records all tool calls made by agents
-- Enables analysis of what tools agents use and how
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trace_id UUID REFERENCES agent_traces(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Tool information
  tool_name VARCHAR(100) NOT NULL,
  tool_input JSONB NOT NULL,
  tool_output JSONB,

  -- Execution metadata
  execution_time_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  -- File operations tracking (for file-related tools)
  files_read TEXT[],
  files_written TEXT[],
  files_modified TEXT[]
);

CREATE INDEX idx_tool_usage_agent ON agent_tool_usage(agent_id, timestamp);
CREATE INDEX idx_tool_usage_tool_name ON agent_tool_usage(tool_name);
CREATE INDEX idx_tool_usage_timestamp ON agent_tool_usage(timestamp DESC);

COMMENT ON TABLE agent_tool_usage IS 'Records all tool calls made by agents with inputs, outputs, and timing';
COMMENT ON COLUMN agent_tool_usage.tool_name IS 'Name of the tool used (Read, Write, Bash, etc.)';
COMMENT ON COLUMN agent_tool_usage.execution_time_ms IS 'How long the tool took to execute in milliseconds';

-- ============================================================================
-- agent_events: Timeline of agent lifecycle events
-- Provides high-level event log for monitoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Event type
  event_type VARCHAR(50) NOT NULL, -- 'spawned', 'started', 'status_change', 'child_spawned', 'completed', 'failed'

  -- Event details (structured data)
  event_data JSONB DEFAULT '{}',

  -- Human-readable message
  message TEXT NOT NULL
);

CREATE INDEX idx_agent_events_agent ON agent_events(agent_id, timestamp);
CREATE INDEX idx_agent_events_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_timestamp ON agent_events(timestamp DESC);

COMMENT ON TABLE agent_events IS 'High-level lifecycle events for agents (spawned, started, completed, etc.)';
COMMENT ON COLUMN agent_events.event_type IS 'Type of event: spawned, started, status_change, child_spawned, completed, failed';

-- ============================================================================
-- agent_decisions: High-level decisions/reasoning made by agents
-- Captures the "why" behind agent actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Decision information
  decision_type VARCHAR(50) NOT NULL, -- 'task_decomposition', 'spawn_child', 'file_operation', 'approach_selection'
  reasoning TEXT NOT NULL,
  action_taken TEXT,

  -- Related entities
  child_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  affected_files TEXT[],

  -- Confidence/metadata
  confidence DECIMAL(3,2), -- 0.0 to 1.0
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_agent_decisions_agent ON agent_decisions(agent_id, timestamp);
CREATE INDEX idx_agent_decisions_type ON agent_decisions(decision_type);
CREATE INDEX idx_agent_decisions_timestamp ON agent_decisions(timestamp DESC);

COMMENT ON TABLE agent_decisions IS 'High-level decisions and reasoning made by agents during execution';
COMMENT ON COLUMN agent_decisions.decision_type IS 'Category of decision: task_decomposition, spawn_child, file_operation, approach_selection';
COMMENT ON COLUMN agent_decisions.reasoning IS 'The reasoning or thought process behind the decision';

-- ============================================================================
-- Add execution metadata columns to agents table
-- ============================================================================
DO $$
BEGIN
  -- Add result_data column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'result_data'
  ) THEN
    ALTER TABLE agents ADD COLUMN result_data JSONB;
  END IF;

  -- Add error_details column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'error_details'
  ) THEN
    ALTER TABLE agents ADD COLUMN error_details TEXT;
  END IF;

  -- Add tokens_used column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'tokens_used'
  ) THEN
    ALTER TABLE agents ADD COLUMN tokens_used INTEGER DEFAULT 0;
  END IF;

  -- Add execution_duration_ms column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'execution_duration_ms'
  ) THEN
    ALTER TABLE agents ADD COLUMN execution_duration_ms INTEGER;
  END IF;
END $$;

COMMENT ON COLUMN agents.result_data IS 'Structured execution result data from agent';
COMMENT ON COLUMN agents.error_details IS 'Detailed error information if agent failed';
COMMENT ON COLUMN agents.tokens_used IS 'Total tokens consumed by this agent';
COMMENT ON COLUMN agents.execution_duration_ms IS 'Total execution time in milliseconds';

-- ============================================================================
-- Create view for agent monitoring dashboard
-- ============================================================================
CREATE OR REPLACE VIEW agent_monitoring_view AS
SELECT
  a.id,
  a.role,
  a.status,
  a.depth_level,
  a.parent_id,
  a.task_description,
  a.tokens_used,
  a.execution_duration_ms,
  a.created_at,
  a.updated_at,
  a.completed_at,
  b.allocated as budget_allocated,
  b.used as budget_used,
  b.reserved as budget_reserved,
  (b.allocated - b.used - b.reserved) as budget_available,
  w.worktree_path,
  w.branch_name,
  w.isolation_status as workspace_status,
  -- Count related data
  (SELECT COUNT(*) FROM agent_traces WHERE agent_id = a.id) as trace_count,
  (SELECT COUNT(*) FROM agent_tool_usage WHERE agent_id = a.id) as tool_usage_count,
  (SELECT COUNT(*) FROM agent_events WHERE agent_id = a.id) as event_count,
  (SELECT COUNT(*) FROM agent_decisions WHERE agent_id = a.id) as decision_count,
  -- Latest event
  (SELECT message FROM agent_events WHERE agent_id = a.id ORDER BY timestamp DESC LIMIT 1) as latest_event
FROM agents a
LEFT JOIN budgets b ON a.id = b.agent_id
LEFT JOIN workspaces w ON a.id = w.agent_id
ORDER BY a.created_at DESC;

COMMENT ON VIEW agent_monitoring_view IS 'Comprehensive view for agent monitoring dashboard';

-- ============================================================================

-- DOWN
-- DROP VIEW IF EXISTS agent_monitoring_view;
-- ALTER TABLE agents DROP COLUMN IF EXISTS result_data;
-- ALTER TABLE agents DROP COLUMN IF EXISTS error_details;
-- ALTER TABLE agents DROP COLUMN IF EXISTS tokens_used;
-- ALTER TABLE agents DROP COLUMN IF EXISTS execution_duration_ms;
-- DROP TABLE IF EXISTS agent_decisions;
-- DROP TABLE IF EXISTS agent_events;
-- DROP TABLE IF EXISTS agent_tool_usage;
-- DROP TABLE IF EXISTS agent_traces;
