-- Migration 006: Human Interaction Tables
-- Enables human-in-the-loop workflows, agent control, and approval systems

-- ============================================================================
-- Agent Control Commands
-- Track pause/resume/terminate commands issued to agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_control_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Command details
  command_type VARCHAR(50) NOT NULL CHECK (command_type IN (
    'pause', 'resume', 'terminate', 'kill', 'intervention', 'priority_change'
  )),

  -- Who issued the command
  issued_by VARCHAR(255) NOT NULL,  -- User email or 'system'
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Execution tracking
  executed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'executing', 'executed', 'failed', 'cancelled'
  )),
  error_message TEXT,

  -- Additional context
  metadata JSONB DEFAULT '{}',

  -- Indexes for common queries
  CONSTRAINT valid_command_status CHECK (
    (status = 'executed' AND executed_at IS NOT NULL) OR
    (status != 'executed')
  )
);

CREATE INDEX idx_control_commands_agent ON agent_control_commands(agent_id);
CREATE INDEX idx_control_commands_status ON agent_control_commands(status, issued_at);
CREATE INDEX idx_control_commands_issued_by ON agent_control_commands(issued_by);

-- ============================================================================
-- Approval Requests
-- Human-in-the-loop approval workflows for sensitive operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request type and target
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'spawn_agent', 'workflow_start', 'budget_increase', 'file_operation',
    'external_api_call', 'database_write', 'high_risk_task', 'custom'
  )),
  entity_type VARCHAR(50) NOT NULL,  -- 'agent', 'workflow', 'budget', etc.
  entity_id UUID NOT NULL,           -- Agent ID, Workflow ID, etc.

  -- Request context
  requested_by VARCHAR(255),         -- System, parent agent, or user
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  request_data JSONB NOT NULL,       -- Full context for decision

  -- Risk assessment
  risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN (
    'low', 'medium', 'high', 'critical'
  )),
  estimated_cost INTEGER,            -- Token cost estimate

  -- Review status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'expired', 'auto_approved'
  )),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  review_notes TEXT,

  -- Auto-expiry
  expires_at TIMESTAMP,

  -- Audit trail
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status, requested_at);
CREATE INDEX idx_approval_requests_entity ON approval_requests(entity_type, entity_id);
CREATE INDEX idx_approval_requests_expires ON approval_requests(expires_at) WHERE status = 'pending';
CREATE INDEX idx_approval_requests_risk ON approval_requests(risk_level, status);

-- ============================================================================
-- Agent Interventions
-- Human guidance, corrections, and feedback during agent execution
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Intervention details
  intervention_type VARCHAR(50) NOT NULL CHECK (intervention_type IN (
    'guidance', 'correction', 'approval', 'clarification', 'abort', 'redirect'
  )),

  -- Who intervened
  intervened_by VARCHAR(255) NOT NULL,
  intervened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Message exchange
  message TEXT NOT NULL,              -- Human's message to agent
  context JSONB DEFAULT '{}',         -- What agent was doing when intervened

  -- Agent's response
  agent_acknowledged_at TIMESTAMP,
  agent_response TEXT,

  -- Resolution
  resolved_at TIMESTAMP,
  resolution_status VARCHAR(50) CHECK (resolution_status IN (
    'acknowledged', 'applied', 'ignored', 'failed', NULL
  )),

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interventions_agent ON agent_interventions(agent_id);
CREATE INDEX idx_interventions_type ON agent_interventions(intervention_type);
CREATE INDEX idx_interventions_unresolved ON agent_interventions(agent_id)
  WHERE resolved_at IS NULL;

-- ============================================================================
-- Dashboard Sessions
-- Track active dashboard connections for real-time updates
-- ============================================================================
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session info
  user_id VARCHAR(255) NOT NULL,
  user_email VARCHAR(255),
  session_token VARCHAR(255) UNIQUE NOT NULL,

  -- Connection details
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TIMESTAMP,

  -- Subscription state
  subscribed_agents UUID[] DEFAULT '{}',    -- Agents being watched
  subscribed_workflows UUID[] DEFAULT '{}', -- Workflows being watched

  -- Client info
  client_ip VARCHAR(45),
  user_agent TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'active', 'idle', 'disconnected'
  ))
);

CREATE INDEX idx_dashboard_sessions_user ON dashboard_sessions(user_id);
CREATE INDEX idx_dashboard_sessions_active ON dashboard_sessions(status, last_heartbeat)
  WHERE status = 'active';
CREATE INDEX idx_dashboard_sessions_token ON dashboard_sessions(session_token);

-- ============================================================================
-- Notification Queue
-- Store notifications for dashboard clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN (
    'user', 'role', 'broadcast'
  )),
  target_id VARCHAR(255),           -- User ID, role name, or NULL for broadcast

  -- Content
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
    'agent_completed', 'agent_failed', 'approval_required', 'budget_warning',
    'workflow_completed', 'intervention_needed', 'system_alert', 'custom'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',

  -- Priority and urgency
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN (
    'low', 'normal', 'high', 'urgent'
  )),

  -- Status
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX idx_notifications_target ON notifications(target_type, target_id);
CREATE INDEX idx_notifications_unread ON notifications(target_id, created_at)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_type ON notifications(notification_type, created_at);

-- ============================================================================
-- Agent State Extensions
-- Add columns to agents table for control state
-- ============================================================================
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS control_state VARCHAR(50) DEFAULT 'running'
    CHECK (control_state IN ('running', 'paused', 'terminating', 'terminated')),
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paused_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- ============================================================================
-- Dashboard Metrics View
-- Aggregated metrics for dashboard display
-- ============================================================================
CREATE OR REPLACE VIEW dashboard_metrics_view AS
SELECT
  -- Time bucket (5-minute intervals)
  DATE_TRUNC('minute', created_at) -
    (EXTRACT(MINUTE FROM created_at)::integer % 5) * INTERVAL '1 minute' as time_bucket,

  -- Agent counts
  COUNT(*) as total_agents,
  COUNT(*) FILTER (WHERE status = 'executing') as active_agents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_agents,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_agents,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_agents,

  -- Control state counts
  COUNT(*) FILTER (WHERE control_state = 'paused') as paused_agents,
  COUNT(*) FILTER (WHERE control_state = 'terminating') as terminating_agents,

  -- Token metrics
  COALESCE(SUM(tokens_used), 0) as total_tokens_used,
  COALESCE(AVG(tokens_used), 0) as avg_tokens_per_agent,

  -- Duration metrics
  COALESCE(AVG(execution_duration_ms), 0) as avg_duration_ms,
  COALESCE(MAX(execution_duration_ms), 0) as max_duration_ms

FROM agents
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY time_bucket
ORDER BY time_bucket DESC;

-- ============================================================================
-- Pending Approvals View
-- Quick access to pending approval requests
-- ============================================================================
CREATE OR REPLACE VIEW pending_approvals_view AS
SELECT
  ar.*,
  a.role as agent_role,
  a.task_description as agent_task,
  a.status as agent_status,
  b.allocated as budget_allocated,
  b.used as budget_used
FROM approval_requests ar
LEFT JOIN agents a ON ar.entity_type = 'agent' AND ar.entity_id = a.id
LEFT JOIN budgets b ON a.id = b.agent_id
WHERE ar.status = 'pending'
  AND (ar.expires_at IS NULL OR ar.expires_at > NOW())
ORDER BY
  CASE ar.risk_level
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  ar.requested_at ASC;

-- ============================================================================
-- Function: Auto-expire pending approvals
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_pending_approvals()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE approval_requests
  SET status = 'expired',
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Create notification for approval
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_approval_required()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (
    target_type,
    target_id,
    notification_type,
    title,
    message,
    data,
    priority
  ) VALUES (
    'role',
    'operator',
    'approval_required',
    'Approval Required: ' || NEW.request_type,
    'A new ' || NEW.request_type || ' request requires approval',
    jsonb_build_object(
      'approval_id', NEW.id,
      'request_type', NEW.request_type,
      'risk_level', NEW.risk_level,
      'entity_id', NEW.entity_id
    ),
    CASE NEW.risk_level
      WHEN 'critical' THEN 'urgent'
      WHEN 'high' THEN 'high'
      ELSE 'normal'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_approval_required
  AFTER INSERT ON approval_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_approval_required();

-- ============================================================================
-- Grant permissions (adjust as needed for your setup)
-- ============================================================================
-- GRANT SELECT, INSERT, UPDATE ON agent_control_commands TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON approval_requests TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON agent_interventions TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_sessions TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON notifications TO app_user;
