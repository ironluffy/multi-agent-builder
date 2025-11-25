// Agent types
export type AgentStatus = 'pending' | 'executing' | 'completed' | 'failed';
export type ControlState = 'running' | 'paused' | 'terminating' | 'terminated';

export interface Agent {
  id: string;
  parent_id: string | null;
  role: string;
  task_description: string;
  status: AgentStatus;
  control_state: ControlState;
  budget_allocated: number;
  tokens_used: number;
  spawned_at: string;
  completed_at: string | null;
  result: string | null;
  children_count?: number;
}

export interface AgentWithMonitoring extends Agent {
  execution_time_ms?: number;
  recent_commands?: ControlCommand[];
}

// Workflow types
export type WorkflowStatus = 'draft' | 'active' | 'completed' | 'failed' | 'paused';

export interface WorkflowNode {
  id: string;
  graph_id: string;
  node_type: 'agent' | 'checkpoint' | 'merge' | 'split';
  name: string;
  role: string | null;
  task_description: string | null;
  status: AgentStatus;
  agent_id: string | null;
  dependencies: string[];
  position: { x: number; y: number } | null;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
  nodes: WorkflowNode[];
}

// Control commands
export type CommandType = 'pause' | 'resume' | 'terminate' | 'kill' | 'intervention' | 'priority_change';

export interface ControlCommand {
  id: string;
  agent_id: string;
  command_type: CommandType;
  issued_by: string;
  issued_at: string;
  executed_at: string | null;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

// Approval types
export type ApprovalRequestType = 'spawn' | 'budget_increase' | 'sensitive_action' | 'workflow_start' | 'intervention';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';

export interface ApprovalRequest {
  id: string;
  request_type: ApprovalRequestType;
  requester_agent_id: string | null;
  workflow_graph_id: string | null;
  title: string;
  description: string;
  request_data: Record<string, unknown>;
  status: ApprovalStatus;
  priority: number;
  requires_comment: boolean;
  created_at: string;
  expires_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

// Linear integration types
export interface LinearMapping {
  mapping_id: string;
  linear_issue_id: string;
  linear_issue_identifier: string;
  linear_issue_title: string;
  linear_issue_url: string;
  linear_status: string;
  agent_id: string | null;
  agent_role: string | null;
  agent_status: AgentStatus | null;
  workflow_id: string | null;
  workflow_name: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  status_mismatch: boolean;
}

export interface DelegationRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  enabled: boolean;
  trigger_source: string;
  trigger_event: string;
  trigger_conditions: Record<string, unknown>;
  agent_role: string;
  agent_task_template: string;
  agent_budget: number;
  requires_approval: boolean;
  trigger_count: number;
  last_triggered_at: string | null;
}

// Metrics types
export interface SystemMetrics {
  total_agents: number;
  active_agents: number;
  pending_approvals: number;
  total_workflows: number;
  active_workflows: number;
  total_tokens_used: number;
  total_budget_allocated: number;
  agents_by_status: Record<AgentStatus, number>;
  agents_by_control_state: Record<ControlState, number>;
}

// Notification types
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'action_required';

export interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  created_at: string;
  read_at: string | null;
  action_url: string | null;
  agent_id: string | null;
  workflow_id: string | null;
}

// WebSocket event types
export interface AgentUpdate {
  type: 'status' | 'tokens' | 'control' | 'complete';
  agent: Agent;
}

export interface WorkflowUpdate {
  type: 'status' | 'node_update' | 'complete';
  workflow: WorkflowGraph;
}
