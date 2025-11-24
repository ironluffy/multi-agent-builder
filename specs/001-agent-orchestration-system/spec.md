# Feature Specification: Hierarchical Agent Orchestration System

**Feature Branch**: `001-agent-orchestration-system`
**Created**: 2025-11-21
**Status**: Draft
**Input**: User description: "I want to make a system like ../claude-spawn-claude"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spawn and Manage Individual Agents (Priority: P1)

A developer wants to create autonomous AI agents that can execute tasks independently. The system should allow spawning a single agent with a defined role, task description, and budget allocation. The agent should execute the task and report completion or errors.

**Why this priority**: This is the foundation of the system. Without the ability to create and manage individual agents, no higher-level orchestration is possible. This represents the minimal viable product (MVP) that delivers immediate value.

**Independent Test**: Can be fully tested by spawning a single agent with a simple task (e.g., "create a README file") and verifying that the task completes successfully with budget tracking and status updates.

**Acceptance Scenarios**:

1. **Given** a system with no active agents, **When** a developer spawns an agent with role "implementer", task "create a simple function", and budget 10,000 tokens, **Then** the system creates the agent, allocates the budget, and begins task execution

2. **Given** an agent is actively executing a task, **When** the developer checks agent status, **Then** the system displays current execution state, budget consumed, and progress indicators

3. **Given** an agent has completed its task successfully, **When** the developer queries task results, **Then** the system provides completion status, outputs produced, and final budget usage

4. **Given** an agent encounters an error during execution, **When** the error occurs, **Then** the system captures the error details, halts execution gracefully, and makes error information available for inspection

---

### User Story 2 - Create Hierarchical Agent Teams (Priority: P2)

A lead developer wants to spawn subordinate agents that can themselves spawn additional agents, forming a hierarchical tree structure. The parent agent should coordinate subordinates, allocate budgets from its own allocation, and aggregate results.

**Why this priority**: Hierarchical organization enables complex task decomposition where a coordinating agent breaks down work and delegates to specialists. This is essential for scaling beyond simple single-agent tasks to sophisticated multi-agent workflows.

**Independent Test**: Can be tested independently by spawning a coordinator agent that creates two subordinate agents with different roles, monitors their progress, and aggregates their outputs into a final result.

**Acceptance Scenarios**:

1. **Given** a parent agent with budget 100,000 tokens, **When** it spawns two child agents with budgets 30,000 and 40,000 tokens each, **Then** the system allocates child budgets from parent budget, establishes parent-child relationships, and tracks hierarchy depth

2. **Given** a child agent completes its task, **When** the parent agent queries children status, **Then** the parent receives completion notification, can access child outputs, and sees remaining budget

3. **Given** a three-level hierarchy (orchestrator � coordinators � implementers), **When** implementers at level 3 complete tasks, **Then** results flow upward through coordinators to orchestrator with full traceability

---

### User Story 3 - Communicate Between Agents via Message Queue (Priority: P3)

Developers want agents to asynchronously send messages to each other for coordination, data sharing, and status updates. Messages should be delivered reliably with FIFO ordering and persistence.

**Why this priority**: Message-based communication enables loose coupling between agents, allowing them to work asynchronously without blocking on each other. This improves system resilience and enables more sophisticated coordination patterns.

**Independent Test**: Can be tested by creating two agents where one sends a message (e.g., "data ready for processing") and the other receives it, processes the information, and respondsall verified through message logs.

**Acceptance Scenarios**:

1. **Given** two agents (Agent A and Agent B), **When** Agent A sends a message to Agent B with payload "process data X", **Then** the message is queued, delivered to Agent B, and marked as delivered in message logs

2. **Given** multiple agents sending messages to a single recipient, **When** messages arrive in order M1, M2, M3, **Then** the recipient processes them in the same FIFO order without reordering

3. **Given** an agent sends a message but the recipient is offline, **When** the recipient agent comes online later, **Then** the system delivers all pending messages in order upon recipient startup

---

### User Story 4 - Isolate Agent Workspaces (Priority: P3)

Developers need each agent to work in an isolated workspace to prevent conflicts when multiple agents modify the same codebase simultaneously. Each agent should have a sandboxed environment with its own copy of the repository.

**Why this priority**: Workspace isolation prevents race conditions and merge conflicts when agents work in parallel. This is critical for reliability but can be implemented after basic spawning and hierarchy since early testing can use serial execution.

**Independent Test**: Can be tested by spawning two agents that modify the same file in different ways, verifying that each agent's changes are isolated, and confirming that changes can be reviewed and merged independently.

**Acceptance Scenarios**:

1. **Given** the main codebase is at commit C1, **When** an agent is spawned, **Then** the system creates an isolated workspace with a copy of the codebase at C1, separate from other agents

2. **Given** two agents working in parallel, **When** Agent A modifies file X and Agent B modifies file X differently, **Then** neither agent sees the other's changes until explicitly merged

3. **Given** an agent completes its work, **When** the developer reviews changes, **Then** the system provides a clear diff between the agent's workspace and the main codebase for review and merge

---

### User Story 5 - Track Budget Hierarchically (Priority: P2)

Developers want to set token budgets for agents and have the system automatically track usage, enforce limits, and reclaim unused budget when agents complete or are terminated. Budgets should flow hierarchically from parent to child agents.

**Why this priority**: Budget management is essential for cost control when using LLM APIs. Hierarchical budget tracking ensures that parent agents can manage their team's costs effectively without exceeding their own allocations.

**Independent Test**: Can be tested by allocating a budget to a parent agent, having it spawn children with sub-budgets, monitoring token consumption, and verifying that unused budget is reclaimed when agents complete.

**Acceptance Scenarios**:

1. **Given** a parent agent with 100,000 token budget, **When** it spawns a child with 30,000 tokens, **Then** parent's available budget reduces to 70,000 and child has 30,000 allocated

2. **Given** an agent is executing a task, **When** it consumes tokens (e.g., 5,000 tokens used), **Then** the system updates the agent's remaining budget in real-time and reflects consumption in parent's tracking

3. **Given** a child agent completes and has 10,000 tokens unused, **When** the child terminates or is fired by parent, **Then** the 10,000 unused tokens are returned to the parent's available budget

4. **Given** an agent attempts to spawn a child with budget exceeding available tokens, **When** the spawn request is made, **Then** the system rejects the request with an insufficient budget error

---

### User Story 6 - Compose Agents as Multi-Agent Workflows (Priority: P2)

Developers want to define complex agents as coordinated workflows of specialized sub-agents, where a single logical "agent" is internally implemented as multiple agents working together according to a predefined dependency graph. This enables reusable composition patterns and automatic task decomposition.

**Why this priority**: Workflow composition enables specialization (each sub-agent focuses on one thing), parallel execution (independent workflow nodes run concurrently), and reusability (common patterns like "backend-dev-workflow" or "TDD-workflow" can be templated). This transforms the system from ad-hoc hierarchical delegation to structured, repeatable multi-agent coordination patterns.

**Independent Test**: Can be tested by defining a "backend-developer" workflow agent that internally coordinates 4 sub-agents (architect → implementer → tester → reviewer) with dependency constraints, spawning this workflow agent with a task, and verifying that all sub-agents execute in correct order and the workflow completes as a single logical unit.

**Acceptance Scenarios**:

1. **Given** a workflow template "backend-dev-workflow" with 4 nodes (architect, implementer, tester, reviewer) and dependencies, **When** developer spawns an agent using this workflow with task "Build REST API" and budget 200,000 tokens, **Then** the system creates a workflow agent that internally spawns 4 sub-agents according to template, allocates budgets proportionally, and coordinates execution respecting dependencies

2. **Given** a workflow agent with parallel nodes (architect and database-specialist have no dependencies), **When** workflow execution begins, **Then** both nodes spawn and execute concurrently, and subsequent dependent nodes (implementer) wait for both to complete before starting

3. **Given** a workflow agent is executing with 3 nodes complete and 2 nodes remaining, **When** parent queries the workflow agent's status, **Then** the system reports workflow agent as "running" with progress showing 3/5 nodes complete and estimated remaining budget

4. **Given** a developer provides a complex task without specifying workflow, **When** using "auto" mode spawn with task "Build full-stack application", **Then** the system analyzes task complexity, automatically decomposes it into a workflow graph (e.g., architect → backend → frontend → tester), and spawns workflow agent accordingly

5. **Given** a workflow node (tester) fails during execution, **When** the failure is detected, **Then** the workflow agent halts dependent nodes, marks workflow as failed, reports failure to parent, and reclaims budgets from unexecuted nodes

---

### Edge Cases

- What happens when an agent crashes mid-execution and has partially consumed budget?
  - System should track consumed budget up to crash point and mark agent as failed with budget accounting accurate

- What happens when the message queue fills up or experiences backpressure?
  - System should implement bounded queue limits and provide backpressure signals to sending agents

- What happens when an agent tries to spawn more children than system resource limits allow?
  - System should enforce maximum concurrent agents limit and queue spawn requests or return capacity errors

- What happens when workspace isolation fails (e.g., disk full, permissions issues)?
  - System should fail agent spawn gracefully with clear error messages and not create partially initialized agents

- What happens when parent agent terminates before child agents complete?
  - System should implement cascade termination where children are automatically stopped and budgets reclaimed

- What happens when a workflow node fails and other nodes are already executing in parallel?
  - System should implement graceful workflow failure: halt spawning of new dependent nodes, allow running nodes to complete or timeout, aggregate partial results, reclaim unused budgets

- What happens when workflow automatic decomposition produces an invalid or circular dependency graph?
  - System should validate workflow graphs before execution, detect cycles using topological sort, reject invalid graphs with descriptive error messages

- What happens when a workflow template references undefined roles or has insufficient budget for minimum node allocation?
  - System should validate template applicability before spawning, check role definitions exist, verify budget sufficiency (minimum per node), fail fast with clear errors

- What happens when workflow coordination overhead exceeds estimated budget allocation?
  - System should monitor coordination costs (message passing, state tracking) separately, warn when overhead exceeds 15% threshold, allow workflow to complete but flag for optimization

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow spawning agents with specified role, task description, and token budget allocation

- **FR-002**: System MUST track agent lifecycle states (created, running, completed, failed, terminated)

- **FR-003**: System MUST enable parent agents to spawn subordinate child agents with budget allocated from parent's available budget

- **FR-004**: System MUST maintain hierarchical relationships between parent and child agents with unlimited depth support

- **FR-005**: System MUST provide message queue for asynchronous agent-to-agent communication with FIFO ordering guarantees

- **FR-006**: System MUST persist agent state, messages, and budget tracking to survive system restarts

- **FR-007**: System MUST provide isolated workspaces for each agent to prevent concurrent modification conflicts

- **FR-008**: System MUST track token budget consumption in real-time and prevent agents from exceeding allocated budgets

- **FR-009**: System MUST reclaim unused budget from child agents when they complete or are terminated by parents

- **FR-010**: System MUST allow parent agents to terminate subordinate agents and receive budget refunds

- **FR-011**: System MUST provide agent status queries showing current state, budget usage, and task progress

- **FR-012**: System MUST handle agent failures gracefully and update parent agents of subordinate failures

- **FR-013**: System MUST support checkpointing agent state for fault tolerance and resume after interruptions

- **FR-014**: System MUST validate all spawn requests for budget availability before creating new agents

- **FR-015**: System MUST log all agent actions, state transitions, and message exchanges for auditing and debugging

- **FR-016**: System MUST support workflow-based agent composition where a single logical agent is internally implemented as a coordinated set of subordinate agents following a dependency graph

- **FR-017**: System MUST allow agents to define internal workflows with nodes (sub-agents), edges (dependencies), parallel execution capabilities, and sequential ordering constraints

- **FR-018**: System MUST provide automatic task decomposition capability that analyzes task complexity and generates appropriate workflow graphs using LLM-based reasoning

- **FR-019**: System MUST enable workflow agents to present as single units externally while coordinating multiple internal agents, abstracting internal complexity from parent agents

- **FR-020**: System MUST support workflow templates that define reusable composition patterns with parameterizable roles, budget allocations, and dependency structures

- **FR-021**: System MUST validate workflow graphs before execution by detecting circular dependencies, verifying role definitions, checking budget sufficiency, and ensuring graph validity

- **FR-022**: System MUST track workflow execution progress including node completion status, parallel execution state, budget consumption per node, and overall workflow health

### Key Entities

- **Agent**: Represents an autonomous AI agent with unique ID, role, task description, budget allocation, lifecycle state, workspace path, parent reference (if child), and list of subordinate agents (if parent). Agents can spawn children, send/receive messages, execute tasks, and report status.

- **Message**: Represents asynchronous communication between agents with sender ID, recipient ID, payload data, timestamp, delivery status, and priority. Messages are queued and delivered in FIFO order per recipient.

- **Budget**: Tracks token allocation and consumption with total allocated amount, consumed amount, available remaining amount, and allocation source (parent or system). Budgets flow hierarchically and are reclaimed upon agent completion.

- **Workspace**: Represents isolated execution environment for agent with unique path, git worktree reference, base commit hash, and isolation status. Workspaces prevent agents from interfering with each other's changes.

- **Hierarchy**: Represents parent-child relationship between agents with parent ID, child ID, depth level, and relationship status. Enables traversal of agent tree structure and cascade operations.

- **Checkpoint**: Represents saved state of agent execution with checkpoint ID, agent ID, timestamp, state snapshot, and resume capability flag. Enables fault tolerance and long-running task resilience.

- **WorkflowAgent**: Extends Agent to represent a composite agent that coordinates multiple internal sub-agents according to a workflow graph. Contains workflow graph definition, map of internal agent instances, coordination mode (single/workflow/auto), composition type, workflow execution state, and node completion tracking. Presents as single agent to parent while managing internal agent team.

- **WorkflowGraph**: Represents a directed acyclic graph (DAG) defining agent workflow structure with unique ID, list of workflow nodes, list of workflow edges, overall status (active/completed/failed), progress metrics, and validation state. Defines how sub-agents are spawned, coordinated, and sequenced within a workflow agent.

- **WorkflowNode**: Represents individual agent position within workflow graph with node ID, assigned agent ID (null until spawned), role specification, task description, budget allocation, list of dependency node IDs, execution status, spawn timestamp, completion timestamp, and metadata. Maps to actual agent instance during workflow execution.

- **WorkflowEdge**: Represents dependency relationship between workflow nodes with edge ID, source node ID, target node ID, dependency type (sequential/parallel), condition for edge activation (on_complete/on_fail/conditional), and edge status. Defines execution order and coordination rules between workflow nodes.

- **WorkflowTemplate**: Represents reusable workflow pattern definition with template ID, name, description, list of node templates (role, budget percentage, dependencies), edge patterns, total estimated budget, complexity rating, and usage metadata. Enables standard workflow compositions like "backend-dev-workflow" or "TDD-workflow" to be instantiated with different tasks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can spawn a single agent and have it successfully complete a simple task (e.g., create a file) in under 2 minutes from spawn to completion

- **SC-002**: System supports hierarchies of at least 5 depth levels (orchestrator � coordinator � lead � specialist � implementer) without performance degradation

- **SC-003**: Message delivery between agents achieves 99.9% reliability with FIFO ordering maintained across 1,000 messages

- **SC-004**: Budget tracking accuracy is 100% with zero budget leaks when agents spawn, execute, and terminate across hierarchies

- **SC-005**: Workspace isolation prevents 100% of conflicts when 10 agents modify the same codebase areas simultaneously

- **SC-006**: Agent spawning completes in under 5 seconds from request to agent ready state

- **SC-007**: System handles at least 50 concurrent agents without message delivery delays exceeding 1 second

- **SC-008**: Budget reclamation from terminated agents completes within 1 second and is immediately available to parent

- **SC-009**: Agent status queries return current state in under 100ms for hierarchies up to 20 agents

- **SC-010**: System restart with 20 active agents recovers full state and resumes all agents within 30 seconds

- **SC-011**: Workflow agents successfully coordinate 5 or more internal sub-agents with 99% reliability, correctly handling parallel execution, dependency ordering, and budget allocation across nodes

- **SC-012**: Automatic task decomposition generates valid workflow graphs in under 10 seconds for tasks of moderate complexity, with generated graphs passing validation (acyclic, valid roles, sufficient budget)

- **SC-013**: Workflow templates reduce agent configuration time by 80% compared to manual hierarchical spawning for common patterns, with template instantiation completing in under 2 seconds

## Assumptions

1. **Execution Environment**: Agents will execute using Claude Code SDK or compatible AI SDK with tool-calling capabilities

2. **Storage Backend**: PostgreSQL database is available for persisting agent state, messages, and budgets with ACID transaction support

3. **Version Control**: Git is installed and accessible for creating isolated worktree workspaces

4. **Token Budget Units**: Budget is measured in tokens compatible with the underlying LLM API (e.g., Claude tokens)

5. **Message Payload Size**: Individual messages are limited to reasonable sizes (e.g., 10KB per message) for queue efficiency

6. **Concurrency Model**: System supports concurrent agent execution with shared-nothing architecture per agent

7. **Error Recovery**: Agents that crash are not automatically restarted; parent agents decide on retry logic

8. **Workspace Cleanup**: Completed agent workspaces are preserved for review and must be manually or programmatically cleaned

9. **Authentication**: Initial version assumes single-user or trusted environment; multi-user authentication is future scope

10. **Monitoring**: Basic console logging is sufficient initially; structured logging and dashboards are future enhancements

11. **Workflow Coordination Overhead**: Workflow orchestration (message routing, state tracking, node management) consumes approximately 10-15% of total workflow budget as coordination overhead

12. **Workflow Template Storage**: Workflow templates are stored as structured data (JSON/YAML) in database or filesystem, loaded on demand, and cached for performance

13. **Workflow Decomposition**: Automatic task decomposition uses LLM-based analysis with prompting strategies; decomposition quality depends on task description clarity and domain knowledge

14. **Workflow Node Granularity**: Individual workflow nodes represent meaningful units of work (not trivial operations); minimum recommended budget per node is 5,000 tokens to allow effective agent execution

15. **Workflow Nesting**: Workflow agents can be nested (workflow node spawns another workflow agent) but excessive nesting (>3 levels) may impact performance and debugging complexity
