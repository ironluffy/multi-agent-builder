# Data Model: Hierarchical Agent Orchestration System

**Feature**: 001-agent-orchestration-system
**Created**: 2025-11-21
**Version**: 1.0.0

## Overview

This document defines the comprehensive data models for all entities in the Hierarchical Agent Orchestration System. The design supports hierarchical agent coordination, message-based communication, budget tracking, workspace isolation, and workflow-based composition patterns.

## Entity Relationship Diagram

```
┌─────────────────┐         ┌──────────────────┐
│     Agent       │◄────────│ WorkflowAgent    │
│                 │         │ (extends Agent)  │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         │ 1                         │ 1
         │                           │
         │ *                         │ *
    ┌────┴─────┐              ┌─────┴──────┐
    │ Message  │              │  Workflow  │
    │          │              │   Graph    │
    └──────────┘              └─────┬──────┘
         │                          │
         │                          │ 1
         │                          │
         │                          │ *
    ┌────┴─────┐              ┌─────┴──────────┐
    │  Budget  │              │ WorkflowNode   │
    └──────────┘              │ WorkflowEdge   │
         │                    └────────────────┘
         │                          │
         │                          │
    ┌────┴─────┐              ┌─────┴──────┐
    │Workspace │              │  Workflow  │
    │          │              │  Template  │
    └──────────┘              └────────────┘
         │
         │
    ┌────┴──────┐
    │Checkpoint │
    │           │
    └───────────┘

Relationships:
- Agent.parent_id → Agent.id (self-referential hierarchy)
- Message.sender_id → Agent.id
- Message.recipient_id → Agent.id
- Budget.agent_id → Agent.id
- Budget.parent_id → Agent.id
- Workspace.agent_id → Agent.id
- Checkpoint.agent_id → Agent.id
- WorkflowAgent.workflow_graph_id → WorkflowGraph.id
- WorkflowNode.workflow_graph_id → WorkflowGraph.id
- WorkflowNode.agent_id → Agent.id
- WorkflowEdge.workflow_graph_id → WorkflowGraph.id
- WorkflowEdge.source_node_id → WorkflowNode.id
- WorkflowEdge.target_node_id → WorkflowNode.id
```

## Core Entities

### Agent

**Purpose**: Represents an autonomous AI agent that can execute tasks, spawn subordinates, and coordinate via messages.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique agent identifier (generated) |
| parent_id | UUID | NULLABLE, FK → Agent.id | Reference to parent agent (NULL for root orchestrator) |
| role | VARCHAR(100) | NOT NULL | Agent's specialized role (e.g., "implementer", "coordinator", "tester") |
| task | TEXT | NOT NULL | Task description assigned to this agent |
| depth_level | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | Depth in hierarchy (0 = root, 1 = child of root, etc.) |
| status | VARCHAR(20) | NOT NULL, CHECK (valid_status) | Current lifecycle state |
| workspace_id | UUID | NOT NULL, FK → Workspace.id | Reference to isolated workspace |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Agent creation timestamp |
| started_at | TIMESTAMP | NULLABLE | When agent began executing task |
| completed_at | TIMESTAMP | NULLABLE | When agent completed task |
| terminated_at | TIMESTAMP | NULLABLE | When agent was terminated by parent |
| result | JSONB | NULLABLE | Agent's final output/result |
| error_message | TEXT | NULLABLE | Error details if status = 'failed' |
| metadata | JSONB | NULLABLE | Extensible metadata (specialization, capabilities, etc.) |

**Relationships**:
- `parent_id` → Agent.id (self-referential, CASCADE on parent delete to clean up orphaned subtrees)
- Has many: subordinate agents (via `parent_id` FK)
- Has one: Workspace (via `workspace_id`)
- Has one: Budget (via Agent.id in Budget table)
- Has many: sent Messages (via Message.sender_id)
- Has many: received Messages (via Message.recipient_id)
- Has many: Checkpoints (via Checkpoint.agent_id)

**State Machine**:

```
States:
  created → running → [completed | failed | terminated]
           ↓      ↑
           → waiting (blocked on subordinates/messages)

Valid Transitions:
  created → running: Agent begins task execution
  running → waiting: Agent spawns subordinates or awaits messages
  waiting → running: Subordinates complete or messages received
  running → completed: Task finished successfully
  running → failed: Task execution error
  * → terminated: Parent fires agent or cascade termination
```

**Constraints**:
- CHECK: `status IN ('created', 'running', 'waiting', 'completed', 'failed', 'terminated')`
- CHECK: `depth_level >= 0`
- CHECK: `completed_at IS NULL OR completed_at >= started_at`
- CHECK: `terminated_at IS NULL OR status = 'terminated'`
- UNIQUE: (parent_id, role) optional for preventing duplicate role assignments

**Indexes**:
- `idx_agent_parent_id` ON (parent_id) - for hierarchy traversal queries
- `idx_agent_status` ON (status) WHERE status IN ('running', 'waiting') - for active agent queries
- `idx_agent_depth` ON (depth_level) - for depth-based filtering
- `idx_agent_created_at` ON (created_at DESC) - for recent agent queries

**Validation Rules** (from FR):
- FR-001: role, task, and budget (via Budget table) must be specified at creation
- FR-002: status must follow valid state transitions
- FR-003: parent_id must reference existing agent if not root
- FR-004: depth_level must be parent.depth_level + 1 if parent exists

---

### Message

**Purpose**: Represents asynchronous communication between agents for coordination, status updates, and data sharing.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique message identifier |
| sender_id | UUID | NULLABLE, FK → Agent.id | Sending agent (NULL for system messages) |
| recipient_id | UUID | NOT NULL, FK → Agent.id | Receiving agent |
| thread_id | UUID | NULLABLE, FK → MessageThread.id | Conversation thread for related messages |
| message_type | VARCHAR(50) | NOT NULL | Type of message (task_assigned, status_update, etc.) |
| payload | JSONB | NOT NULL | Message content and structured data |
| priority | INTEGER | NOT NULL, DEFAULT 5, CHECK 1-10 | Message priority (1=lowest, 10=highest) |
| requires_reply | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether sender expects reply |
| reply_timeout | TIMESTAMP | NULLABLE | Deadline for reply if requires_reply=TRUE |
| reply_to_message_id | UUID | NULLABLE, FK → Message.id | Reference to message this replies to |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Delivery status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Message creation time |
| delivered_at | TIMESTAMP | NULLABLE | When recipient received message |
| processed_at | TIMESTAMP | NULLABLE | When recipient processed message |

**Relationships**:
- `sender_id` → Agent.id (SET NULL on sender delete to preserve message history)
- `recipient_id` → Agent.id (CASCADE on recipient delete)
- `thread_id` → MessageThread.id (NULLABLE for standalone messages)
- `reply_to_message_id` → Message.id (self-referential for reply chains)

**State Machine**:

```
States: pending → delivered → processed

Transitions:
  pending → delivered: Message queued for recipient
  delivered → processed: Recipient consumed message
```

**Constraints**:
- CHECK: `status IN ('pending', 'delivered', 'processed')`
- CHECK: `priority BETWEEN 1 AND 10`
- CHECK: `delivered_at IS NULL OR delivered_at >= created_at`
- CHECK: `processed_at IS NULL OR processed_at >= delivered_at`
- CHECK: `requires_reply = FALSE OR reply_timeout IS NOT NULL`

**Indexes**:
- `idx_message_recipient_status` ON (recipient_id, status, priority DESC, created_at) - for recipient's inbox queries
- `idx_message_sender` ON (sender_id, created_at DESC) - for sender's sent messages
- `idx_message_thread` ON (thread_id, created_at) - for thread chronological ordering
- `idx_message_unprocessed` ON (recipient_id, created_at) WHERE status = 'delivered' - for pending message alerts
- `idx_message_reply_timeout` ON (reply_timeout) WHERE requires_reply = TRUE AND status != 'processed' - for timeout monitoring

**Validation Rules** (from FR):
- FR-005: Messages must maintain FIFO ordering per recipient (enforced by created_at ordering)
- FR-006: Messages must be persisted (handled by database)
- FR-012: Message delivery failures must be logged in error_message field (add optional error_message TEXT field)

---

### Budget

**Purpose**: Tracks token allocation and consumption for agents, enabling hierarchical budget management and cost control.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent_id | UUID | PRIMARY KEY, NOT NULL, FK → Agent.id | Agent owning this budget |
| parent_id | UUID | NULLABLE, FK → Agent.id | Parent agent who allocated budget (NULL for root) |
| allocated_units | INTEGER | NOT NULL, CHECK > 0 | Total tokens allocated to agent |
| used_units | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | Tokens consumed by agent |
| reserved_units | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | Tokens allocated to child agents |
| remaining_units | INTEGER | GENERATED ALWAYS AS (allocated_units - used_units - reserved_units) STORED | Available tokens |
| warning_threshold | DECIMAL(3,2) | NOT NULL, DEFAULT 0.80 | Threshold (0.0-1.0) for low budget alerts |
| alerted_at | TIMESTAMP | NULLABLE | When low budget alert was last sent |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last budget modification time |

**Relationships**:
- `agent_id` → Agent.id (CASCADE delete when agent deleted)
- `parent_id` → Agent.id (NULLABLE, SET NULL if parent deleted)

**Constraints**:
- CHECK: `allocated_units > 0`
- CHECK: `used_units >= 0`
- CHECK: `reserved_units >= 0`
- CHECK: `used_units + reserved_units <= allocated_units` (budget integrity)
- CHECK: `warning_threshold BETWEEN 0.0 AND 1.0`

**Indexes**:
- `idx_budget_agent` ON (agent_id) - for agent budget lookups
- `idx_budget_parent` ON (parent_id) WHERE parent_id IS NOT NULL - for parent's children budget queries
- `idx_budget_remaining` ON (remaining_units) WHERE remaining_units <= 1000 - for low budget alerts

**Validation Rules** (from FR):
- FR-008: Budget consumption must be tracked in real-time (via database triggers on updates)
- FR-009: Unused budget reclaimed on child completion (trigger on Agent.status = 'completed' | 'terminated')
- FR-014: Spawn requests validated against remaining_units > child_allocation

**Database Triggers**:

```sql
-- Trigger: Allocate budget to child on agent spawn
CREATE FUNCTION allocate_child_budget() RETURNS TRIGGER AS $$
BEGIN
  UPDATE Budget
  SET reserved_units = reserved_units + NEW.allocated_units
  WHERE agent_id = NEW.parent_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_allocate_child_budget
AFTER INSERT ON Budget
FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
EXECUTE FUNCTION allocate_child_budget();

-- Trigger: Reclaim budget on child termination
CREATE FUNCTION reclaim_child_budget() RETURNS TRIGGER AS $$
DECLARE
  child_budget Budget%ROWTYPE;
BEGIN
  SELECT * INTO child_budget FROM Budget WHERE agent_id = NEW.id;

  UPDATE Budget
  SET reserved_units = reserved_units - child_budget.allocated_units
  WHERE agent_id = NEW.parent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reclaim_child_budget
AFTER UPDATE ON Agent
FOR EACH ROW WHEN (NEW.status IN ('completed', 'failed', 'terminated') AND OLD.status NOT IN ('completed', 'failed', 'terminated'))
EXECUTE FUNCTION reclaim_child_budget();
```

---

### Workspace

**Purpose**: Provides isolated execution environment for each agent to prevent concurrent modification conflicts.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique workspace identifier |
| agent_id | UUID | NOT NULL, UNIQUE, FK → Agent.id | Agent owning this workspace |
| worktree_path | TEXT | NOT NULL, UNIQUE | Absolute path to git worktree |
| base_commit_sha | VARCHAR(40) | NOT NULL | Git commit SHA workspace was created from |
| branch_name | VARCHAR(255) | NOT NULL, UNIQUE | Git branch name for this workspace |
| isolation_status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Workspace state |
| disk_usage_bytes | BIGINT | NOT NULL, DEFAULT 0 | Storage consumed by workspace |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Workspace creation time |
| last_modified_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last file modification time |
| merged_at | TIMESTAMP | NULLABLE | When changes were merged to main |
| cleaned_up_at | TIMESTAMP | NULLABLE | When workspace was deleted |

**Relationships**:
- `agent_id` → Agent.id (UNIQUE, CASCADE delete when agent deleted)

**State Machine**:

```
States: active → [merged | abandoned] → cleaned_up

Transitions:
  active → merged: Changes successfully merged to main codebase
  active → abandoned: Agent terminated/failed without merge
  merged → cleaned_up: Workspace deleted after merge
  abandoned → cleaned_up: Workspace deleted after review
```

**Constraints**:
- CHECK: `isolation_status IN ('active', 'merged', 'abandoned', 'cleaned_up')`
- CHECK: `disk_usage_bytes >= 0`
- CHECK: `merged_at IS NULL OR isolation_status = 'merged'`
- CHECK: `cleaned_up_at IS NULL OR isolation_status = 'cleaned_up'`
- UNIQUE: (worktree_path) - prevent path collisions
- UNIQUE: (branch_name) - prevent branch name collisions

**Indexes**:
- `idx_workspace_agent` ON (agent_id) - for agent workspace lookup
- `idx_workspace_status` ON (isolation_status) - for active workspace queries
- `idx_workspace_cleanup` ON (cleaned_up_at) WHERE isolation_status != 'cleaned_up' - for cleanup jobs

**Validation Rules** (from FR):
- FR-007: Each agent must have exactly one isolated workspace (enforced by UNIQUE constraint on agent_id)
- Workspaces created via git worktree add for true isolation

---

### Hierarchy

**Purpose**: Represents explicit parent-child relationships for efficient hierarchy traversal and cascade operations.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique relationship identifier |
| parent_id | UUID | NOT NULL, FK → Agent.id | Parent agent in relationship |
| child_id | UUID | NOT NULL, FK → Agent.id | Child agent in relationship |
| depth_level | INTEGER | NOT NULL, CHECK >= 0 | Depth in hierarchy (child's depth) |
| relationship_status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Relationship state |
| hired_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | When parent spawned child |
| fired_at | TIMESTAMP | NULLABLE | When parent terminated child |
| reason_hired | TEXT | NOT NULL | Why parent spawned child (task delegation) |
| reason_fired | TEXT | NULLABLE | Why parent terminated child |

**Relationships**:
- `parent_id` → Agent.id (CASCADE delete)
- `child_id` → Agent.id (CASCADE delete)

**Constraints**:
- CHECK: `relationship_status IN ('active', 'terminated')`
- CHECK: `depth_level >= 0`
- CHECK: `parent_id != child_id` (prevent self-loops)
- CHECK: `fired_at IS NULL OR relationship_status = 'terminated'`
- UNIQUE: (parent_id, child_id) - prevent duplicate relationships

**Indexes**:
- `idx_hierarchy_parent` ON (parent_id, relationship_status) - for parent's children queries
- `idx_hierarchy_child` ON (child_id) - for child's parent lookup
- `idx_hierarchy_depth` ON (depth_level) - for depth-based queries

**Validation Rules** (from FR):
- FR-003: Parent agents can spawn subordinates (relationship created on spawn)
- FR-004: Hierarchy depth is unlimited (no depth constraint beyond CHECK >= 0)
- FR-010: Parents can terminate subordinates (relationship_status = 'terminated', fired_at set)

**Notes**:
- This table is denormalized from Agent.parent_id for performance and richer metadata.
- Consider materialized path or closure table for complex hierarchy queries if needed.

---

### Checkpoint

**Purpose**: Saves agent execution state for fault tolerance, long-running tasks, and system restarts.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique checkpoint identifier |
| agent_id | UUID | NOT NULL, FK → Agent.id | Agent being checkpointed |
| checkpoint_type | VARCHAR(30) | NOT NULL | Checkpoint trigger reason |
| milestone | VARCHAR(30) | NULLABLE | Milestone name if type = 'milestone' |
| state_snapshot | JSONB | NOT NULL | Complete agent state |
| message_count | INTEGER | NOT NULL, DEFAULT 0 | Number of messages processed at checkpoint |
| budget_snapshot | JSONB | NULLABLE | Budget state at checkpoint time |
| git_commit_sha | VARCHAR(40) | NULLABLE | Git commit SHA of workspace at checkpoint |
| worktree_path | TEXT | NULLABLE | Workspace path at checkpoint |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Checkpoint creation time |
| resume_capability | BOOLEAN | NOT NULL, DEFAULT TRUE | Whether checkpoint can be used to resume agent |

**Relationships**:
- `agent_id` → Agent.id (CASCADE delete when agent deleted)

**Constraints**:
- CHECK: `checkpoint_type IN ('milestone', 'periodic', 'pre_spawn', 'budget_threshold', 'manual')`
- CHECK: `milestone IN ('hired', 'work_started', 'work_completed', 'pr_requested', 'pre_restart') OR milestone IS NULL`
- CHECK: `message_count >= 0`

**Indexes**:
- `idx_checkpoint_agent` ON (agent_id, created_at DESC) - for agent's checkpoints chronologically
- `idx_checkpoint_type` ON (checkpoint_type) - for checkpoint type queries
- `idx_checkpoint_milestone` ON (milestone) WHERE milestone IS NOT NULL - for milestone checkpoints

**Validation Rules** (from FR):
- FR-013: System must support checkpointing for fault tolerance
- state_snapshot JSONB contains: currentTask, filesModified, actionsPerformed, pendingMessages, processedMessageIds, conversationSummary, role, depth, status, stateMachineState, lastMessageTimestamp
- budget_snapshot JSONB contains: allocated, used, remaining, percentUsed, totalCostUsd, timestamp

**State Snapshot Structure** (JSONB):

```json
{
  "currentTask": "Implement REST API endpoints",
  "filesModified": ["/src/server.js", "/tests/server.test.js"],
  "actionsPerformed": [
    {"type": "tool_use", "timestamp": "2025-11-21T10:30:00Z", "details": {...}},
    {"type": "file_edit", "timestamp": "2025-11-21T10:35:00Z", "details": {...}}
  ],
  "pendingMessages": [...],
  "processedMessageIds": ["uuid1", "uuid2"],
  "conversationSummary": "Agent has created server skeleton...",
  "role": "implementer",
  "depth": 2,
  "status": "running",
  "stateMachineState": "executing_task",
  "lastMessageTimestamp": "2025-11-21T10:40:00Z"
}
```

---

## Workflow Composition Models

### WorkflowAgent

**Purpose**: Extends Agent to represent a composite agent that coordinates multiple internal sub-agents according to a workflow graph. Presents as a single agent externally while managing an internal team.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent_id | UUID | PRIMARY KEY, NOT NULL, FK → Agent.id | Base agent identifier (extends Agent) |
| workflow_graph_id | UUID | NOT NULL, FK → WorkflowGraph.id | Workflow definition this agent follows |
| coordination_mode | VARCHAR(20) | NOT NULL, DEFAULT 'workflow' | How sub-agents are coordinated |
| composition_type | VARCHAR(30) | NOT NULL | Source of workflow definition |
| internal_agents | JSONB | NOT NULL, DEFAULT '[]' | Map of node_id → spawned agent_id |
| workflow_state | VARCHAR(20) | NOT NULL, DEFAULT 'initializing' | Workflow execution state |
| nodes_completed | INTEGER | NOT NULL, DEFAULT 0 | Count of completed workflow nodes |
| nodes_total | INTEGER | NOT NULL | Total nodes in workflow graph |
| progress_percentage | DECIMAL(5,2) | GENERATED ALWAYS AS ((nodes_completed::DECIMAL / NULLIF(nodes_total, 0)) * 100) STORED | Workflow progress |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Workflow agent creation time |
| started_at | TIMESTAMP | NULLABLE | When workflow execution began |
| completed_at | TIMESTAMP | NULLABLE | When all workflow nodes completed |

**Relationships**:
- `agent_id` → Agent.id (CASCADE delete, one-to-one extension)
- `workflow_graph_id` → WorkflowGraph.id (CASCADE delete)

**Constraints**:
- CHECK: `coordination_mode IN ('single', 'workflow', 'auto')`
- CHECK: `composition_type IN ('template', 'auto_decomposed', 'manual')`
- CHECK: `workflow_state IN ('initializing', 'running', 'waiting', 'completed', 'failed')`
- CHECK: `nodes_completed >= 0 AND nodes_completed <= nodes_total`
- CHECK: `nodes_total > 0`
- CHECK: `progress_percentage BETWEEN 0.0 AND 100.0`

**Indexes**:
- `idx_workflow_agent_state` ON (workflow_state) - for active workflow agents
- `idx_workflow_agent_progress` ON (progress_percentage) - for progress monitoring

**Validation Rules** (from FR):
- FR-016: Workflow agents coordinate subordinate agents following dependency graph
- FR-019: Workflow agents present as single unit to parent (base Agent entity handles external interface)
- internal_agents JSONB maps WorkflowNode.id → Agent.id for spawned sub-agents

**Internal Agents Structure** (JSONB):

```json
{
  "node_uuid_1": "agent_uuid_a",
  "node_uuid_2": "agent_uuid_b",
  "node_uuid_3": null  // Not yet spawned
}
```

---

### WorkflowGraph

**Purpose**: Represents a directed acyclic graph (DAG) defining how sub-agents are spawned, coordinated, and sequenced within a workflow agent.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique workflow graph identifier |
| name | VARCHAR(200) | NOT NULL | Human-readable workflow name |
| description | TEXT | NULLABLE | Workflow purpose and usage |
| template_id | UUID | NULLABLE, FK → WorkflowTemplate.id | Template this was instantiated from |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Workflow execution status |
| validation_status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Graph validation state |
| validation_errors | JSONB | NULLABLE | List of validation errors if invalid |
| total_nodes | INTEGER | NOT NULL, DEFAULT 0 | Count of nodes in graph |
| total_edges | INTEGER | NOT NULL, DEFAULT 0 | Count of edges in graph |
| estimated_budget | INTEGER | NULLABLE | Total estimated tokens for all nodes |
| complexity_rating | DECIMAL(3,1) | NULLABLE, CHECK 0-10 | Overall workflow complexity (0=simple, 10=very complex) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Graph creation time |
| validated_at | TIMESTAMP | NULLABLE | When graph validation completed |
| completed_at | TIMESTAMP | NULLABLE | When workflow execution finished |

**Relationships**:
- `template_id` → WorkflowTemplate.id (SET NULL if template deleted)
- Has many: WorkflowNode (via WorkflowNode.workflow_graph_id)
- Has many: WorkflowEdge (via WorkflowEdge.workflow_graph_id)

**State Machine**:

```
States: pending → validated → [active → completed | active → failed]
                  ↓
                invalid (validation failed)

Transitions:
  pending → validated: Graph passes validation (acyclic, valid roles, sufficient budget)
  pending → invalid: Graph fails validation
  validated → active: Workflow agent starts executing graph
  active → completed: All nodes successfully executed
  active → failed: One or more nodes failed
```

**Constraints**:
- CHECK: `status IN ('active', 'paused', 'completed', 'failed')`
- CHECK: `validation_status IN ('pending', 'validated', 'invalid')`
- CHECK: `complexity_rating IS NULL OR complexity_rating BETWEEN 0.0 AND 10.0`
- CHECK: `total_nodes >= 0`
- CHECK: `total_edges >= 0`
- CHECK: `estimated_budget IS NULL OR estimated_budget > 0`

**Indexes**:
- `idx_workflow_graph_status` ON (status) - for active workflow queries
- `idx_workflow_graph_template` ON (template_id) WHERE template_id IS NOT NULL - for template usage tracking
- `idx_workflow_graph_validation` ON (validation_status) - for validation monitoring

**Validation Rules** (from FR):
- FR-021: Workflow graphs must be validated before execution (validation_status = 'validated' required)
- Validation checks: acyclic (topological sort), valid roles exist, sufficient budget, no orphaned nodes

**Validation Errors Structure** (JSONB):

```json
[
  {"code": "CIRCULAR_DEPENDENCY", "details": "Cycle detected: node_1 → node_2 → node_1"},
  {"code": "INVALID_ROLE", "details": "Node node_3 references undefined role 'data-scientist'"},
  {"code": "INSUFFICIENT_BUDGET", "details": "Total estimated budget 150k exceeds allocated 100k"}
]
```

---

### WorkflowNode

**Purpose**: Represents an individual agent position within a workflow graph. Maps to an actual Agent instance when spawned during workflow execution.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique node identifier |
| workflow_graph_id | UUID | NOT NULL, FK → WorkflowGraph.id | Parent workflow graph |
| agent_id | UUID | NULLABLE, FK → Agent.id | Spawned agent (NULL until node executes) |
| role | VARCHAR(100) | NOT NULL | Required agent role for this node |
| task_description | TEXT | NOT NULL | Task assigned to agent spawned for this node |
| budget_allocation | INTEGER | NOT NULL, CHECK > 0 | Tokens allocated to this node's agent |
| dependencies | JSONB | NOT NULL, DEFAULT '[]' | List of node IDs this node depends on |
| execution_status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Node execution state |
| spawn_timestamp | TIMESTAMP | NULLABLE | When agent for this node was spawned |
| completion_timestamp | TIMESTAMP | NULLABLE | When node's agent completed |
| result | JSONB | NULLABLE | Output/result from node's agent |
| error_message | TEXT | NULLABLE | Error details if execution_status = 'failed' |
| position | INTEGER | NOT NULL | Display position for visualization (optional ordering) |
| metadata | JSONB | NULLABLE | Node-specific metadata (subtask details, keywords, etc.) |

**Relationships**:
- `workflow_graph_id` → WorkflowGraph.id (CASCADE delete when graph deleted)
- `agent_id` → Agent.id (SET NULL if agent deleted)

**State Machine**:

```
States: pending → spawned → running → [completed | failed]
               ↓
             blocked (waiting for dependencies)

Transitions:
  pending → spawned: All dependencies completed, agent spawned
  pending → blocked: Dependencies not yet satisfied
  blocked → spawned: Dependencies completed
  spawned → running: Agent begins task execution
  running → completed: Agent task finished successfully
  running → failed: Agent task failed
```

**Constraints**:
- CHECK: `execution_status IN ('pending', 'blocked', 'spawned', 'running', 'completed', 'failed')`
- CHECK: `budget_allocation > 0`
- CHECK: `completion_timestamp IS NULL OR completion_timestamp >= spawn_timestamp`
- UNIQUE: (workflow_graph_id, position) - unique positions within graph

**Indexes**:
- `idx_workflow_node_graph` ON (workflow_graph_id, execution_status) - for graph status queries
- `idx_workflow_node_agent` ON (agent_id) WHERE agent_id IS NOT NULL - for agent-to-node mapping
- `idx_workflow_node_status` ON (execution_status) - for status filtering

**Validation Rules** (from FR):
- FR-017: Nodes define dependencies via JSONB array of node IDs
- dependencies JSONB format: ["node_uuid_1", "node_uuid_2"]
- metadata JSONB can contain SubtaskMetadata: {subtaskId, title, prompt, estimatedTokens, estimatedComplexity, successCriteria, keywords}

**Dependencies Structure** (JSONB):

```json
["node_uuid_1", "node_uuid_2", "node_uuid_3"]
```

**Metadata Structure** (JSONB - optional SubtaskMetadata):

```json
{
  "subtaskId": "subtask_123",
  "title": "Implement authentication",
  "prompt": "Build JWT-based auth system...",
  "estimatedTokens": 25000,
  "estimatedComplexity": 7.5,
  "successCriteria": ["All tests pass", "Security review approved"],
  "keywords": ["authentication", "JWT", "security"]
}
```

---

### WorkflowEdge

**Purpose**: Represents a dependency relationship between workflow nodes, defining execution order and coordination rules.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique edge identifier |
| workflow_graph_id | UUID | NOT NULL, FK → WorkflowGraph.id | Parent workflow graph |
| source_node_id | UUID | NOT NULL, FK → WorkflowNode.id | Source node (dependency provider) |
| target_node_id | UUID | NOT NULL, FK → WorkflowNode.id | Target node (dependent) |
| dependency_type | VARCHAR(20) | NOT NULL, DEFAULT 'sequential' | Edge type |
| condition | VARCHAR(30) | NOT NULL, DEFAULT 'on_complete' | Activation condition |
| edge_status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Edge state |
| weight | INTEGER | NULLABLE, DEFAULT 1 | Edge weight for critical path analysis |

**Relationships**:
- `workflow_graph_id` → WorkflowGraph.id (CASCADE delete)
- `source_node_id` → WorkflowNode.id (CASCADE delete)
- `target_node_id` → WorkflowNode.id (CASCADE delete)

**Constraints**:
- CHECK: `dependency_type IN ('sequential', 'parallel')`
- CHECK: `condition IN ('on_complete', 'on_fail', 'conditional', 'always')`
- CHECK: `edge_status IN ('active', 'disabled')`
- CHECK: `source_node_id != target_node_id` (prevent self-loops)
- UNIQUE: (workflow_graph_id, source_node_id, target_node_id) - prevent duplicate edges

**Indexes**:
- `idx_workflow_edge_graph` ON (workflow_graph_id) - for graph edge queries
- `idx_workflow_edge_source` ON (source_node_id) - for outgoing edges from node
- `idx_workflow_edge_target` ON (target_node_id) - for incoming edges to node

**Validation Rules** (from FR):
- FR-017: Edges define sequential and parallel execution constraints
- Edge condition determines when target node can execute:
  - `on_complete`: Target waits for source to complete successfully
  - `on_fail`: Target executes only if source fails (error handling paths)
  - `conditional`: Target executes based on source result evaluation
  - `always`: Target executes regardless of source outcome

**Notes**:
- `dependency_type = 'parallel'` means source and target CAN run in parallel (no blocking)
- `dependency_type = 'sequential'` means target MUST wait for source (blocking)
- Graph validation ensures no cycles by performing topological sort on edges

---

### WorkflowTemplate

**Purpose**: Represents a reusable workflow pattern definition that can be instantiated with different tasks and budgets. Enables standard composition patterns like "backend-dev-workflow" or "TDD-workflow".

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique template identifier |
| name | VARCHAR(200) | NOT NULL, UNIQUE | Template name (e.g., "backend-dev-workflow") |
| description | TEXT | NOT NULL | Template purpose and usage instructions |
| category | VARCHAR(50) | NULLABLE | Template category (development, testing, deployment, etc.) |
| node_templates | JSONB | NOT NULL | List of node definitions |
| edge_patterns | JSONB | NOT NULL | List of edge definitions |
| total_estimated_budget | INTEGER | NOT NULL, CHECK > 0 | Estimated token budget for template |
| complexity_rating | DECIMAL(3,1) | NOT NULL, CHECK 0-10 | Template complexity (0=simple, 10=very complex) |
| min_budget_required | INTEGER | NOT NULL, CHECK > 0 | Minimum budget to instantiate template |
| usage_count | INTEGER | NOT NULL, DEFAULT 0 | Number of times template instantiated |
| success_rate | DECIMAL(5,2) | NULLABLE, CHECK 0-100 | Percentage of successful completions |
| created_by | UUID | NULLABLE, FK → Agent.id | Agent or system that created template |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Template creation time |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last template modification |
| enabled | BOOLEAN | NOT NULL, DEFAULT TRUE | Whether template can be instantiated |

**Relationships**:
- `created_by` → Agent.id (SET NULL if creator agent deleted)
- Referenced by: WorkflowGraph.template_id

**Constraints**:
- CHECK: `complexity_rating BETWEEN 0.0 AND 10.0`
- CHECK: `total_estimated_budget > 0`
- CHECK: `min_budget_required > 0 AND min_budget_required <= total_estimated_budget`
- CHECK: `success_rate IS NULL OR success_rate BETWEEN 0.0 AND 100.0`
- CHECK: `usage_count >= 0`
- UNIQUE: (name) - prevent duplicate template names

**Indexes**:
- `idx_workflow_template_name` ON (name) - for template lookup by name
- `idx_workflow_template_category` ON (category) WHERE enabled = TRUE - for category browsing
- `idx_workflow_template_complexity` ON (complexity_rating) - for complexity-based filtering
- `idx_workflow_template_usage` ON (usage_count DESC) - for popular templates

**Validation Rules** (from FR):
- FR-020: Templates define reusable composition patterns
- Templates are instantiated to create WorkflowGraph instances
- node_templates JSONB contains parameterizable node definitions (role, budget_percentage, dependencies)
- edge_patterns JSONB defines edge relationships between nodes

**Node Templates Structure** (JSONB):

```json
[
  {
    "node_id": "architect",
    "role": "architect",
    "task_template": "Design system architecture for: {TASK}",
    "budget_percentage": 20,
    "dependencies": [],
    "position": 0
  },
  {
    "node_id": "implementer",
    "role": "implementer",
    "task_template": "Implement according to architecture: {TASK}",
    "budget_percentage": 50,
    "dependencies": ["architect"],
    "position": 1
  },
  {
    "node_id": "tester",
    "role": "tester",
    "task_template": "Test implementation: {TASK}",
    "budget_percentage": 20,
    "dependencies": ["implementer"],
    "position": 2
  },
  {
    "node_id": "reviewer",
    "role": "reviewer",
    "task_template": "Review code quality: {TASK}",
    "budget_percentage": 10,
    "dependencies": ["tester"],
    "position": 3
  }
]
```

**Edge Patterns Structure** (JSONB):

```json
[
  {
    "source": "architect",
    "target": "implementer",
    "dependency_type": "sequential",
    "condition": "on_complete"
  },
  {
    "source": "implementer",
    "target": "tester",
    "dependency_type": "sequential",
    "condition": "on_complete"
  },
  {
    "source": "tester",
    "target": "reviewer",
    "dependency_type": "sequential",
    "condition": "on_complete"
  }
]
```

---

## Supporting Entities

### MessageThread

**Purpose**: Groups related messages into conversation threads for context tracking.

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL | Unique thread identifier |
| initiator_id | UUID | NULLABLE, FK → Agent.id | Agent who started thread |
| participants | UUID[] | NOT NULL, DEFAULT '{}' | Array of agent IDs in thread |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Thread state |
| summary | TEXT | NULLABLE | Thread summary for context |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Thread creation time |
| last_activity_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last message in thread |
| closed_at | TIMESTAMP | NULLABLE | When thread was closed |

**Relationships**:
- `initiator_id` → Agent.id (SET NULL if initiator deleted)
- Referenced by: Message.thread_id

**Constraints**:
- CHECK: `status IN ('active', 'waiting_reply', 'resolved', 'archived', 'closed')`
- CHECK: `closed_at IS NULL OR status = 'closed'`

**Indexes**:
- `idx_message_thread_participants` ON participants USING GIN - for participant queries
- `idx_message_thread_status` ON (status, last_activity_at DESC) - for active threads

---

## Database Schema Considerations

### Normalization

**Level**: 3NF (Third Normal Form) with selective denormalization for performance.

**Rationale**:
- **3NF ensures**: No transitive dependencies, minimal redundancy, clear entity boundaries
- **Denormalized fields**:
  - `Agent.depth_level` (derivable from parent chain, cached for performance)
  - `Budget.remaining_units` (GENERATED column, computed from allocated/used/reserved)
  - `WorkflowAgent.progress_percentage` (GENERATED column, computed from nodes_completed/nodes_total)
  - `WorkflowGraph.total_nodes`, `total_edges` (cached counts, updated via triggers)

### JSON/JSONB Fields

**Usage**:
- **JSONB for flexibility**: Metadata, snapshots, validation errors, templates
- **JSONB fields**:
  - `Agent.result`, `Agent.metadata`: Extensible agent outputs and capabilities
  - `Message.payload`: Variable message content structures
  - `Checkpoint.state_snapshot`, `budget_snapshot`: Complex state serialization
  - `WorkflowAgent.internal_agents`: Dynamic node-to-agent mapping
  - `WorkflowGraph.validation_errors`: Variable error structures
  - `WorkflowNode.dependencies`, `metadata`, `result`: Flexible node data
  - `WorkflowTemplate.node_templates`, `edge_patterns`: Reusable pattern definitions

**Benefits**:
- Schema evolution without migrations (add new metadata fields)
- Variable structures per entity type (different agent roles have different metadata)
- Efficient querying with PostgreSQL JSONB operators and GIN indexes

**Indexes**:
- GIN indexes on JSONB fields for key/value searches: `CREATE INDEX idx_agent_metadata ON Agent USING GIN (metadata);`

### Partitioning

**Current**: No partitioning (premature optimization for MVP).

**Future Considerations** (if scale requires):
- **Message table**: Partition by `created_at` (monthly or weekly ranges) for high-volume messaging
- **Checkpoint table**: Partition by `created_at` (time-based retention cleanup)
- **Trigger**: Automatically create partitions as time progresses

**Example**:

```sql
CREATE TABLE Message (
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE Message_2025_11 PARTITION OF Message
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

### Constraints and Triggers

**Cross-Table Constraints**:

1. **Budget Integrity**: `Budget.used_units + Budget.reserved_units <= Budget.allocated_units`
   - Enforced via CHECK constraint and triggers on insert/update

2. **Agent-Workspace Relationship**: Each agent must have exactly one workspace
   - Enforced via UNIQUE constraint on `Workspace.agent_id`

3. **Workflow Graph Acyclicity**: Workflow graphs must not contain cycles
   - Enforced via validation trigger on WorkflowEdge insert/update (topological sort)

4. **Hierarchy Depth Consistency**: `Hierarchy.depth_level = Agent.depth_level` for child agent
   - Enforced via trigger on Hierarchy insert (validates depth matches child's depth)

**Triggers**:

```sql
-- Validate workflow graph acyclicity on edge insert
CREATE FUNCTION validate_workflow_acyclic() RETURNS TRIGGER AS $$
DECLARE
  has_cycle BOOLEAN;
BEGIN
  -- Perform topological sort on workflow graph
  -- If cycle detected, RAISE EXCEPTION
  SELECT detect_cycle(NEW.workflow_graph_id) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'Workflow graph contains cycle involving edge from % to %', NEW.source_node_id, NEW.target_node_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_workflow_acyclic
BEFORE INSERT OR UPDATE ON WorkflowEdge
FOR EACH ROW
EXECUTE FUNCTION validate_workflow_acyclic();
```

---

## Migration Strategy

### Initial Schema

**Approach**: Single initial migration creating all tables, indexes, constraints, and triggers.

**Script**: `/migrations/001_initial_schema.sql`

**Structure**:

```sql
-- 001_initial_schema.sql
BEGIN;

-- Create tables in dependency order
CREATE TABLE Agent (...);
CREATE TABLE Workspace (...);
CREATE TABLE Budget (...);
CREATE TABLE Message (...);
CREATE TABLE MessageThread (...);
CREATE TABLE Checkpoint (...);
CREATE TABLE Hierarchy (...);
CREATE TABLE WorkflowGraph (...);
CREATE TABLE WorkflowNode (...);
CREATE TABLE WorkflowEdge (...);
CREATE TABLE WorkflowTemplate (...);
CREATE TABLE WorkflowAgent (...);

-- Create indexes
CREATE INDEX idx_agent_parent_id ON Agent(parent_id);
...

-- Create triggers
CREATE FUNCTION allocate_child_budget() RETURNS TRIGGER AS $$ ... $$;
CREATE TRIGGER trigger_allocate_child_budget ...;
...

-- Insert initial data (root orchestrator, default templates)
INSERT INTO Agent (id, parent_id, role, task, ...) VALUES (...);
INSERT INTO WorkflowTemplate (name, description, ...) VALUES ('backend-dev-workflow', ...);

COMMIT;
```

### Versioning

**Tracking**: `schema_migrations` table (already in reference implementation).

**Structure**:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  description TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Process**:
1. Each migration file numbered sequentially: `001_initial_schema.sql`, `002_add_workflow_templates.sql`
2. Migration runner checks `schema_migrations` table for applied versions
3. Applies pending migrations in order, records in `schema_migrations`

### Backwards Compatibility

**Strategy**: Additive changes only for minor versions, breaking changes require major version bump.

**Examples**:
- **Additive (compatible)**: Add new optional column, add new index, add new table
- **Breaking (incompatible)**: Remove column, change column type, remove table, change constraint

**Handling Breaking Changes**:
1. Deprecation notice in prior version
2. Dual-write period (support old and new schema)
3. Data migration script
4. Remove deprecated schema in next major version

**Example**: Adding `Agent.priority` field (additive, compatible):

```sql
-- 002_add_agent_priority.sql
BEGIN;

ALTER TABLE Agent ADD COLUMN priority INTEGER NOT NULL DEFAULT 5;
ALTER TABLE Agent ADD CONSTRAINT check_priority CHECK (priority BETWEEN 1 AND 10);
CREATE INDEX idx_agent_priority ON Agent(priority);

INSERT INTO schema_migrations (version, description) VALUES (2, 'Add agent priority field');

COMMIT;
```

---

## Validation Rules

This section maps functional requirements to database constraints and application-level validation.

### From Functional Requirements

| Requirement | Validation Rule | Enforcement |
|-------------|-----------------|-------------|
| **FR-001**: Spawn with role, task, budget | `Agent.role NOT NULL`, `Agent.task NOT NULL`, `Budget.allocated_units > 0` | DB constraint |
| **FR-002**: Track lifecycle states | `Agent.status CHECK IN (valid states)`, state machine transitions | DB constraint + app logic |
| **FR-003**: Parent spawns children | `Budget.remaining_units >= child_allocation`, `Hierarchy.parent_id → Agent.id` | DB trigger + app validation |
| **FR-004**: Unlimited hierarchy depth | `Agent.depth_level >= 0` (no upper bound), `Hierarchy.depth_level >= 0` | DB constraint |
| **FR-005**: FIFO message ordering | `Message.created_at` ordering, `priority DESC, created_at ASC` index | DB index + app query ordering |
| **FR-006**: Persist state for restarts | All entities stored in PostgreSQL with ACID guarantees | Database durability |
| **FR-007**: Isolated workspaces | `Workspace.agent_id UNIQUE`, `Workspace.worktree_path UNIQUE` | DB constraint |
| **FR-008**: Real-time budget tracking | `Budget.used_units` updated on token consumption, triggers on updates | DB trigger + app logic |
| **FR-009**: Reclaim unused budget | Trigger on `Agent.status → completed/terminated` updates `Budget.reserved_units` | DB trigger |
| **FR-010**: Parent terminates children | `Hierarchy.relationship_status = 'terminated'`, `Hierarchy.fired_at` set | App logic + DB constraint |
| **FR-011**: Agent status queries | Indexed queries on `Agent.status`, `Budget.remaining_units`, etc. | DB indexes |
| **FR-012**: Graceful failure handling | `Agent.error_message` populated, `status = 'failed'`, parent notified via Message | App logic + DB fields |
| **FR-013**: Checkpointing | `Checkpoint` entity with `state_snapshot`, `resume_capability` | DB schema + app logic |
| **FR-014**: Validate spawn requests | Check `Budget.remaining_units > child_allocation` before insert | App validation + DB constraint |
| **FR-015**: Log all actions | `ActionRecord` in `Checkpoint.state_snapshot`, message logs in `Message` | DB storage |
| **FR-016**: Workflow composition | `WorkflowAgent` extends `Agent`, coordinates via `WorkflowGraph` | DB schema |
| **FR-017**: Workflow DAG | `WorkflowNode.dependencies` JSONB, `WorkflowEdge` relationships | DB schema + validation trigger |
| **FR-018**: Auto task decomposition | Generate `WorkflowGraph` from LLM analysis, validate before execution | App logic + validation trigger |
| **FR-019**: Workflow as single unit | `WorkflowAgent` presents as `Agent` to parent, internal coordination hidden | DB schema design |
| **FR-020**: Workflow templates | `WorkflowTemplate` entity with `node_templates`, `edge_patterns` | DB schema |
| **FR-021**: Validate workflow graphs | `WorkflowGraph.validation_status`, cycle detection, role/budget checks | Validation trigger + app logic |
| **FR-022**: Track workflow progress | `WorkflowAgent.nodes_completed`, `progress_percentage`, `WorkflowNode.execution_status` | DB generated columns + indexes |

### From Success Criteria

| Success Criterion | Database Support |
|-------------------|------------------|
| **SC-001**: Simple task completion < 2 min | Indexed queries on `Agent.status`, `created_at` for performance |
| **SC-002**: 5 depth levels | `Agent.depth_level`, `Hierarchy.depth_level` with no upper bound |
| **SC-003**: 99.9% message reliability | ACID transactions, `Message.status` tracking, retry logic |
| **SC-004**: 100% budget accuracy | Triggers for budget allocation/reclamation, CHECK constraints |
| **SC-005**: 100% workspace isolation | `Workspace.worktree_path UNIQUE`, git worktree enforcement |
| **SC-006**: Agent spawn < 5 seconds | Indexed lookups, minimal joins for spawn queries |
| **SC-007**: 50 concurrent agents | No schema limits, indexes optimized for concurrent access |
| **SC-008**: Budget reclamation < 1 second | Fast trigger execution, indexed budget lookups |
| **SC-009**: Status query < 100ms | Indexed queries on `Agent.status`, `Budget`, `Workspace` |
| **SC-010**: Restart recovery < 30 seconds | `Checkpoint` indexed on `agent_id`, fast resume queries |
| **SC-011**: Workflow coordination 99% reliability | `WorkflowGraph.validation_status`, indexed node/edge queries |
| **SC-012**: Auto decomposition < 10 seconds | Fast graph validation triggers, indexed template lookups |
| **SC-013**: Template instantiation < 2 seconds | Indexed `WorkflowTemplate` queries, fast graph creation |

---

## Performance Optimization

### Query Optimization

**Common Queries**:

1. **Get active agents for user dashboard**:

```sql
SELECT a.id, a.role, a.status, a.depth_level, b.remaining_units, w.worktree_path
FROM Agent a
JOIN Budget b ON a.id = b.agent_id
JOIN Workspace w ON a.id = w.agent_id
WHERE a.status IN ('running', 'waiting')
ORDER BY a.created_at DESC
LIMIT 50;
```

**Indexes**: `idx_agent_status`, `idx_agent_created_at`

2. **Get agent's subordinates**:

```sql
SELECT a.id, a.role, a.status, a.depth_level
FROM Agent a
WHERE a.parent_id = $1
ORDER BY a.created_at;
```

**Indexes**: `idx_agent_parent_id`

3. **Get pending messages for agent**:

```sql
SELECT m.id, m.sender_id, m.message_type, m.payload, m.priority, m.created_at
FROM Message m
WHERE m.recipient_id = $1 AND m.status = 'delivered'
ORDER BY m.priority DESC, m.created_at ASC
LIMIT 100;
```

**Indexes**: `idx_message_recipient_status`

4. **Get workflow progress**:

```sql
SELECT wa.workflow_state, wa.progress_percentage, wa.nodes_completed, wa.nodes_total,
       wn.id, wn.role, wn.execution_status, a.id AS agent_id, a.status AS agent_status
FROM WorkflowAgent wa
JOIN WorkflowGraph wg ON wa.workflow_graph_id = wg.id
JOIN WorkflowNode wn ON wn.workflow_graph_id = wg.id
LEFT JOIN Agent a ON wn.agent_id = a.id
WHERE wa.agent_id = $1
ORDER BY wn.position;
```

**Indexes**: `idx_workflow_node_graph`, `idx_workflow_agent_state`

### Caching Strategy

**Application-Level Caching**:
- **Agent metadata**: Cache frequently accessed agent roles, statuses (TTL: 60s)
- **Workflow templates**: Cache all templates on startup, invalidate on update
- **Budget snapshots**: Cache parent budget checks (TTL: 5s) to reduce trigger load

**Database-Level Caching**:
- **Materialized Views**: For complex hierarchy aggregations if needed
- **GENERATED columns**: Already cached (`Budget.remaining_units`, `WorkflowAgent.progress_percentage`)

### Connection Pooling

**Recommended**: PgBouncer or built-in connection pooling (Node.js: `pg.Pool`)

**Configuration**:
- Max connections: 20 per application instance
- Idle timeout: 10s
- Connection timeout: 5s

---

## Security Considerations

### Input Validation

**User Inputs**:
- `Agent.role`, `Agent.task`: Sanitize to prevent SQL injection (use parameterized queries)
- `Message.payload`: Validate JSON structure, limit size (10KB max)
- `WorkflowTemplate.node_templates`: Validate JSON schema before insert

**Database-Level**:
- All queries use parameterized statements (no raw SQL concatenation)
- CHECK constraints on enums and ranges

### Access Control

**Future Scope** (Assumption #9: single-user initially):
- Multi-tenancy: Add `tenant_id` column to all tables, row-level security (RLS) in PostgreSQL
- Agent permissions: Define which agents can spawn others, access messages, etc.

### Data Sanitization

**Output Sanitization**:
- `Agent.result`, `Message.payload`: Sanitize before rendering in UI to prevent XSS
- `Checkpoint.state_snapshot`: Filter sensitive data (API keys, secrets) before storage

### Audit Logging

**Logged Events**:
- Agent spawns, terminations (recorded in `Hierarchy` table)
- Budget allocations, reclamations (recorded in `Budget.updated_at`, triggers log to audit table)
- Message deliveries (recorded in `Message.created_at`, `delivered_at`, `processed_at`)
- Workflow validations (recorded in `WorkflowGraph.validation_errors`)

**Audit Table** (optional enhancement):

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_id UUID,  -- Agent or user who performed action
  changes JSONB,  -- Before/after values
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, timestamp DESC);
```

---

## Testing Considerations

### Test Data

**Fixtures**:
- Seed script: `/tests/fixtures/seed_data.sql`
- Sample agents: root orchestrator, 2 levels of hierarchy (coordinator → implementer)
- Sample messages: task assignments, status updates, replies
- Sample workflows: simple 2-node graph, complex 5-node graph with parallel execution
- Sample templates: "backend-dev-workflow", "TDD-workflow"

**Cleanup**:
- Truncate all tables after each test suite
- Reset sequences: `TRUNCATE Agent, Budget, ... RESTART IDENTITY CASCADE;`

### Integration Tests

**Database Tests**:
1. **Hierarchy traversal**: Insert 5-level hierarchy, query all descendants of root
2. **Budget allocation**: Spawn child, verify parent budget reserved, terminate child, verify budget reclaimed
3. **Message FIFO**: Insert 100 messages with varying priorities, verify delivery order
4. **Workflow validation**: Insert graph with cycle, verify validation trigger rejects
5. **Checkpoint restore**: Create checkpoint, delete agent, restore from checkpoint, verify state matches

**Performance Tests**:
1. Insert 50 concurrent agents, measure spawn time (should be < 5s per SC-006)
2. Query pending messages for agent with 1000 messages, measure query time (should be < 100ms)
3. Reclaim budget from 20 terminated children, measure trigger execution time (should be < 1s per SC-008)

---

## Conclusion

This data model comprehensively supports all 11 entities defined in the feature specification, with:

- **Complete entity definitions**: All required fields, constraints, relationships, and indexes
- **State machines**: Clearly defined for Agent, Message, Workspace, WorkflowGraph, WorkflowNode
- **Workflow composition**: Full support for WorkflowAgent, WorkflowGraph, WorkflowNode, WorkflowEdge, WorkflowTemplate
- **Performance optimization**: Strategic indexes aligned with success criteria queries
- **Validation rules**: Database constraints and triggers mapped to functional requirements
- **Migration strategy**: Versioned schema with backwards compatibility plan
- **Reference implementation alignment**: Incorporates patterns from claude-spawn-claude database schema

**Next Steps**:
1. Implement initial migration script: `001_initial_schema.sql`
2. Create database access layer (DAO/Repository pattern) in application code
3. Write integration tests for all entities and relationships
4. Implement validation triggers (workflow acyclicity, budget integrity)
5. Set up monitoring for database performance (query times, connection pool usage)

**Quality Checklist**:
- [x] Every entity from spec.md is modeled
- [x] Relationships are bidirectional where needed
- [x] Performance indexes align with success criteria queries
- [x] State machines match spec.md requirements
- [x] Workflow entities correctly model DAG structure
- [x] Validation rules from functional requirements map to database constraints
- [x] Migration strategy and versioning defined
- [x] Security and testing considerations documented
