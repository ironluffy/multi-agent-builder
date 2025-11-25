-- Migration 007: Linear Integration Tables
-- Enables Linear webhook integration, delegation rules, and bidirectional sync

-- ============================================================================
-- Linear Webhook Configuration
-- Store Linear webhook settings and secrets
-- ============================================================================
CREATE TABLE IF NOT EXISTS linear_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linear webhook identifiers
  webhook_id VARCHAR(255) UNIQUE NOT NULL,  -- Linear's webhook ID
  team_id VARCHAR(255),                     -- Linear team ID (optional)
  label VARCHAR(255),                       -- Human-readable label

  -- Security
  secret_hash TEXT NOT NULL,                -- Hashed webhook secret for verification

  -- Configuration
  enabled BOOLEAN DEFAULT TRUE,
  event_types TEXT[] DEFAULT ARRAY['Issue', 'Comment'],  -- Subscribed event types

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_received_at TIMESTAMP,
  total_events_received INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMP
);

CREATE INDEX idx_linear_webhooks_webhook_id ON linear_webhooks(webhook_id);
CREATE INDEX idx_linear_webhooks_enabled ON linear_webhooks(enabled);

-- ============================================================================
-- Agent Delegation Rules
-- Define rules for automatically spawning agents based on Linear events
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_delegation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,  -- Higher priority rules match first
  enabled BOOLEAN DEFAULT TRUE,

  -- Trigger configuration
  trigger_source VARCHAR(50) NOT NULL CHECK (trigger_source IN (
    'linear', 'github', 'webhook', 'schedule', 'manual'
  )),
  trigger_event VARCHAR(100) NOT NULL,  -- 'issue.created', 'issue.updated', etc.

  -- Match conditions (JSON matching logic)
  -- Example: {"labels.name": "bug", "priority": 1, "state.name": "Todo"}
  trigger_conditions JSONB NOT NULL DEFAULT '{}',

  -- Agent configuration
  agent_role VARCHAR(255) NOT NULL,
  agent_task_template TEXT NOT NULL,  -- Template with {{issue.title}}, {{issue.description}} etc.
  agent_budget INTEGER DEFAULT 50000,
  max_agents_per_day INTEGER DEFAULT 10,  -- Rate limiting

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_timeout_minutes INTEGER DEFAULT 60,
  auto_approve_conditions JSONB,  -- Conditions for auto-approval

  -- Workflow integration (optional)
  workflow_template_id UUID REFERENCES workflow_templates(id),

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  last_triggered_at TIMESTAMP,
  trigger_count INTEGER DEFAULT 0
);

CREATE INDEX idx_delegation_rules_source ON agent_delegation_rules(trigger_source, enabled);
CREATE INDEX idx_delegation_rules_priority ON agent_delegation_rules(priority DESC, enabled);
CREATE INDEX idx_delegation_rules_event ON agent_delegation_rules(trigger_event, enabled);

-- ============================================================================
-- Linear Issue to Agent Mapping
-- Track which Linear issues have been delegated to agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS linear_agent_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linear issue details
  linear_issue_id VARCHAR(255) NOT NULL,
  linear_issue_identifier VARCHAR(50),  -- e.g., "ENG-123"
  linear_issue_url TEXT,
  linear_issue_title TEXT,
  linear_team_id VARCHAR(255),
  linear_project_id VARCHAR(255),

  -- Agent/Workflow reference (one must be set)
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  workflow_graph_id UUID REFERENCES workflow_graphs(id) ON DELETE SET NULL,

  -- Rule that triggered this mapping
  delegation_rule_id UUID REFERENCES agent_delegation_rules(id),

  -- Sync state
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMP,
  sync_direction VARCHAR(50) DEFAULT 'bidirectional' CHECK (sync_direction IN (
    'linear_to_agent', 'agent_to_linear', 'bidirectional', 'none'
  )),

  -- Status mapping
  linear_status VARCHAR(100),       -- Current Linear issue status
  agent_status VARCHAR(50),         -- Current agent status
  status_mismatch BOOLEAN DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure at least one target is set
  CONSTRAINT mapping_has_target CHECK (
    (agent_id IS NOT NULL) OR (workflow_graph_id IS NOT NULL)
  ),

  -- Unique constraint on Linear issue
  CONSTRAINT unique_linear_issue UNIQUE (linear_issue_id)
);

CREATE INDEX idx_linear_mappings_issue ON linear_agent_mappings(linear_issue_id);
CREATE INDEX idx_linear_mappings_agent ON linear_agent_mappings(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_linear_mappings_workflow ON linear_agent_mappings(workflow_graph_id) WHERE workflow_graph_id IS NOT NULL;
CREATE INDEX idx_linear_mappings_sync ON linear_agent_mappings(sync_enabled, last_synced_at);
CREATE INDEX idx_linear_mappings_team ON linear_agent_mappings(linear_team_id);

-- ============================================================================
-- Linear Sync Events
-- Audit trail for all synchronization events
-- ============================================================================
CREATE TABLE IF NOT EXISTS linear_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID REFERENCES linear_agent_mappings(id) ON DELETE CASCADE,

  -- Sync details
  direction VARCHAR(50) NOT NULL CHECK (direction IN (
    'linear_to_agent', 'agent_to_linear'
  )),
  event_type VARCHAR(100) NOT NULL,  -- 'status_update', 'comment', 'completion', etc.

  -- Payload data
  linear_data JSONB,                 -- Data from/to Linear
  agent_data JSONB,                  -- Data from/to agent

  -- Result
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_status VARCHAR(50) DEFAULT 'success' CHECK (sync_status IN (
    'success', 'failed', 'partial', 'skipped'
  )),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Performance tracking
  duration_ms INTEGER
);

CREATE INDEX idx_sync_events_mapping ON linear_sync_events(mapping_id);
CREATE INDEX idx_sync_events_status ON linear_sync_events(sync_status, synced_at);
CREATE INDEX idx_sync_events_type ON linear_sync_events(event_type, synced_at);
CREATE INDEX idx_sync_events_failed ON linear_sync_events(mapping_id)
  WHERE sync_status = 'failed';

-- ============================================================================
-- Linear Comments
-- Store comments synced between Linear and agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS linear_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID NOT NULL REFERENCES linear_agent_mappings(id) ON DELETE CASCADE,

  -- Comment identifiers
  linear_comment_id VARCHAR(255),    -- Linear's comment ID (if from Linear)
  agent_trace_id UUID,               -- Agent trace ID (if from agent)

  -- Content
  content TEXT NOT NULL,
  author_type VARCHAR(50) NOT NULL CHECK (author_type IN (
    'human', 'agent', 'system'
  )),
  author_name VARCHAR(255),

  -- Sync state
  synced_to_linear BOOLEAN DEFAULT FALSE,
  synced_to_agent BOOLEAN DEFAULT FALSE,
  sync_error TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP
);

CREATE INDEX idx_linear_comments_mapping ON linear_comments(mapping_id);
CREATE INDEX idx_linear_comments_unsynced_linear ON linear_comments(mapping_id)
  WHERE synced_to_linear = FALSE AND author_type = 'agent';
CREATE INDEX idx_linear_comments_unsynced_agent ON linear_comments(mapping_id)
  WHERE synced_to_agent = FALSE AND author_type = 'human';

-- ============================================================================
-- Status Mapping Configuration
-- Define how agent statuses map to Linear statuses
-- ============================================================================
CREATE TABLE IF NOT EXISTS linear_status_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Team-specific (optional)
  linear_team_id VARCHAR(255),

  -- Agent status to Linear status
  agent_status VARCHAR(50) NOT NULL,
  linear_state_id VARCHAR(255) NOT NULL,
  linear_state_name VARCHAR(100) NOT NULL,

  -- Bidirectional mapping
  sync_agent_to_linear BOOLEAN DEFAULT TRUE,
  sync_linear_to_agent BOOLEAN DEFAULT TRUE,

  -- Priority (for conflicts)
  priority INTEGER DEFAULT 0,

  CONSTRAINT unique_agent_status_per_team UNIQUE (linear_team_id, agent_status)
);

CREATE INDEX idx_status_mappings_team ON linear_status_mappings(linear_team_id);
CREATE INDEX idx_status_mappings_agent ON linear_status_mappings(agent_status);

-- Insert default status mappings
INSERT INTO linear_status_mappings (agent_status, linear_state_id, linear_state_name) VALUES
  ('pending', 'backlog', 'Backlog'),
  ('executing', 'started', 'In Progress'),
  ('completed', 'done', 'Done'),
  ('failed', 'canceled', 'Canceled')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Webhook Event Log
-- Log all incoming webhook events for debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source VARCHAR(50) NOT NULL,       -- 'linear', 'github', etc.
  webhook_id UUID,                   -- Reference to webhook config

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_id VARCHAR(255),             -- Source's event ID
  delivery_id VARCHAR(255),          -- Delivery attempt ID

  -- Payload
  headers JSONB,
  payload JSONB NOT NULL,

  -- Processing
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  processing_status VARCHAR(50) DEFAULT 'pending' CHECK (processing_status IN (
    'pending', 'processing', 'processed', 'failed', 'ignored'
  )),
  error_message TEXT,

  -- Actions taken
  actions_taken JSONB DEFAULT '[]'   -- [{action: 'spawn_agent', agent_id: '...'}]
);

CREATE INDEX idx_webhook_log_source ON webhook_event_log(source, received_at);
CREATE INDEX idx_webhook_log_status ON webhook_event_log(processing_status, received_at);
CREATE INDEX idx_webhook_log_event ON webhook_event_log(event_type, received_at);
CREATE INDEX idx_webhook_log_pending ON webhook_event_log(received_at)
  WHERE processing_status = 'pending';

-- ============================================================================
-- Rate Limiting Table
-- Track delegation triggers for rate limiting
-- ============================================================================
CREATE TABLE IF NOT EXISTS delegation_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES agent_delegation_rules(id) ON DELETE CASCADE,

  -- Time window
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,

  -- Counts
  trigger_count INTEGER DEFAULT 0,
  agent_count INTEGER DEFAULT 0,

  CONSTRAINT unique_rule_window UNIQUE (rule_id, window_start)
);

CREATE INDEX idx_rate_limits_rule ON delegation_rate_limits(rule_id, window_start);

-- ============================================================================
-- Linear Integration View
-- Comprehensive view of Linear-Agent relationships
-- ============================================================================
CREATE OR REPLACE VIEW linear_integration_view AS
SELECT
  m.id as mapping_id,
  m.linear_issue_id,
  m.linear_issue_identifier,
  m.linear_issue_title,
  m.linear_issue_url,
  m.linear_status,

  -- Agent info
  a.id as agent_id,
  a.role as agent_role,
  a.status as agent_status,
  a.task_description as agent_task,
  a.tokens_used as agent_tokens,

  -- Workflow info
  wg.id as workflow_id,
  wg.name as workflow_name,
  wg.status as workflow_status,

  -- Rule info
  r.id as rule_id,
  r.name as rule_name,

  -- Sync state
  m.sync_enabled,
  m.last_synced_at,
  m.status_mismatch,

  -- Recent sync events
  (
    SELECT COUNT(*)
    FROM linear_sync_events se
    WHERE se.mapping_id = m.id
      AND se.synced_at > NOW() - INTERVAL '24 hours'
  ) as sync_events_24h,

  (
    SELECT COUNT(*)
    FROM linear_sync_events se
    WHERE se.mapping_id = m.id
      AND se.sync_status = 'failed'
      AND se.synced_at > NOW() - INTERVAL '24 hours'
  ) as failed_syncs_24h

FROM linear_agent_mappings m
LEFT JOIN agents a ON m.agent_id = a.id
LEFT JOIN workflow_graphs wg ON m.workflow_graph_id = wg.id
LEFT JOIN agent_delegation_rules r ON m.delegation_rule_id = r.id
ORDER BY m.created_at DESC;

-- ============================================================================
-- Function: Process delegation rule match
-- ============================================================================
CREATE OR REPLACE FUNCTION match_delegation_rules(
  p_source VARCHAR(50),
  p_event VARCHAR(100),
  p_payload JSONB
)
RETURNS TABLE (
  rule_id UUID,
  rule_name VARCHAR(255),
  agent_role VARCHAR(255),
  agent_task TEXT,
  agent_budget INTEGER,
  requires_approval BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.agent_role,
    r.agent_task_template,
    r.agent_budget,
    r.requires_approval
  FROM agent_delegation_rules r
  WHERE r.enabled = TRUE
    AND r.trigger_source = p_source
    AND r.trigger_event = p_event
    AND (
      r.trigger_conditions = '{}'::jsonb
      OR p_payload @> r.trigger_conditions
    )
  ORDER BY r.priority DESC
  LIMIT 1;  -- Return only highest priority match
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Check rate limit
-- ============================================================================
CREATE OR REPLACE FUNCTION check_delegation_rate_limit(
  p_rule_id UUID,
  p_max_per_day INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  window_start TIMESTAMP;
BEGIN
  -- Get start of current day
  window_start := DATE_TRUNC('day', CURRENT_TIMESTAMP);

  -- Get or create rate limit record
  INSERT INTO delegation_rate_limits (rule_id, window_start, window_end, trigger_count)
  VALUES (p_rule_id, window_start, window_start + INTERVAL '1 day', 1)
  ON CONFLICT (rule_id, window_start)
  DO UPDATE SET trigger_count = delegation_rate_limits.trigger_count + 1
  RETURNING trigger_count INTO current_count;

  -- Check if under limit
  RETURN current_count <= p_max_per_day;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Update mapping timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mapping_updated
  BEFORE UPDATE ON linear_agent_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_mapping_timestamp();

-- ============================================================================
-- Trigger: Update rule timestamps
-- ============================================================================
CREATE TRIGGER trigger_rule_updated
  BEFORE UPDATE ON agent_delegation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_mapping_timestamp();
