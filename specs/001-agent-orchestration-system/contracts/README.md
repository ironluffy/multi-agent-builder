# API Contracts - Hierarchical Agent Orchestration System

This directory contains TypeScript API contract definitions for the Hierarchical Agent Orchestration System. These contracts define the programmatic interface for all agent operations and workflow management.

## Overview

The API is organized into five main contract files, each covering a distinct functional area:

1. **agent-api.ts** - Core agent operations
2. **workflow-api.ts** - Workflow composition and orchestration
3. **message-api.ts** - Inter-agent communication
4. **budget-api.ts** - Budget allocation and tracking
5. **workspace-api.ts** - Workspace isolation and management

## Contract Files

### 1. agent-api.ts

**Functional Requirements**: FR-001, FR-002, FR-003, FR-004, FR-010, FR-011, FR-012, FR-014

**Key APIs**:
- `spawn(config)` - Spawn new agents with role, task, and budget
- `getStatus(agentId)` - Query agent execution status and progress
- `terminate(agentId, reason)` - Terminate agent and reclaim budget
- `getHierarchy(agentId)` - Get hierarchical agent tree
- `getResult(agentId)` - Get execution result from completed agent
- `listAgents(filter)` - List agents by status, role, or parent

**Core Types**:
- `Agent` - Agent instance with lifecycle state
- `AgentConfig` - Configuration for spawning agents
- `AgentStatus` - Comprehensive status including budget and progress
- `HierarchyNode` - Tree representation of agent hierarchy

### 2. workflow-api.ts

**Functional Requirements**: FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022

**Key APIs**:
- `createWorkflow(config)` - Create workflow agent from DAG
- `decomposeTask(request)` - Auto-decompose task into workflow graph
- `validateWorkflow(graph)` - Validate workflow before execution
- `getWorkflowProgress(workflowId)` - Monitor workflow execution
- `loadTemplate(templateId)` - Load reusable workflow template
- `saveTemplate(template)` - Save workflow pattern for reuse
- `instantiateTemplate(templateId, params)` - Create graph from template

**Core Types**:
- `WorkflowGraph` - DAG defining multi-agent workflow
- `WorkflowNode` - Individual agent position in workflow
- `WorkflowEdge` - Dependency between workflow nodes
- `WorkflowTemplate` - Reusable workflow pattern
- `WorkflowProgress` - Execution progress with node completion

### 3. message-api.ts

**Functional Requirements**: FR-005, FR-006, FR-015

**Key APIs**:
- `send(message)` - Send message between agents
- `receive(agentId, filter)` - Receive pending messages
- `subscribe(agentId, callback, filter)` - Real-time message subscription
- `markProcessed(messageId)` - Mark message as processed
- `sendBatch(messages)` - Batch send multiple messages
- `broadcast(message, recipientIds)` - Broadcast to multiple agents
- `getQueueStats()` - Queue performance statistics

**Core Types**:
- `Message` - Message with sender, recipient, action, payload
- `MessageAction` - Message types (start_work, report_progress, etc.)
- `MessagePriority` - Priority levels (critical, high, normal, low)
- `MessageStatus` - Delivery status (pending, delivered, processed)
- `QueueStatistics` - Queue performance metrics

### 4. budget-api.ts

**Functional Requirements**: FR-008, FR-009, FR-010, FR-014

**Key APIs**:
- `allocate(parentId, childId, amount)` - Allocate budget from parent to child
- `consume(agentId, consumption)` - Record budget consumption
- `reclaim(agentId)` - Reclaim unused budget to parent
- `getAvailable(agentId)` - Get available budget for allocation
- `getBudget(agentId)` - Get budget allocation details
- `getBudgetHierarchy(rootAgentId)` - Get budget tree
- `getConsumptionHistory(agentId)` - Budget usage history
- `setBudgetLimits(agentId, limits)` - Configure budget limits/alerts
- `getBudgetStatistics()` - System-wide budget statistics

**Core Types**:
- `BudgetAllocation` - Budget allocation with consumed/remaining
- `BudgetConsumption` - Token consumption record with breakdown
- `BudgetReclamation` - Budget return to parent
- `BudgetHierarchy` - Tree view of budget allocations
- `BudgetLimits` - Budget limit configuration

### 5. workspace-api.ts

**Functional Requirements**: FR-007, FR-013, FR-015

**Key APIs**:
- `createWorkspace(agentId, config)` - Create isolated workspace
- `getWorkspace(agentId)` - Get workspace details
- `getWorkspaceDiff(workspaceId)` - Get changes from base commit
- `mergeWorkspace(workspaceId, targetBranch)` - Merge workspace changes
- `cleanupWorkspace(workspaceId)` - Archive and cleanup workspace
- `createCheckpoint(workspaceId, checkpoint)` - Save workspace state
- `restoreCheckpoint(workspaceId, checkpointId)` - Restore checkpoint
- `listFileModifications(workspaceId)` - List file changes
- `getWorkspaceStatistics(workspaceId)` - Workspace metrics

**Core Types**:
- `Workspace` - Isolated workspace with git worktree
- `WorkspaceStatus` - Lifecycle state (active, dirty, merged, etc.)
- `WorkspaceDiff` - Changes from base commit
- `MergeResult` - Merge status with conflicts
- `WorkspaceCheckpoint` - Saved workspace state
- `FileModification` - File change record

## Design Principles

### 1. Type Safety
- No `any` types used
- Explicit error types with typed fields
- Strict null checking with `| null` annotations
- Union types for enums (e.g., `'running' | 'completed'`)

### 2. Error Handling
- Custom error classes for each failure mode
- `@throws` JSDoc declarations for all possible errors
- Explicit error types in function signatures
- Retryable vs non-retryable errors distinguished

### 3. Promise-Based Async
- All operations return `Promise<T>`
- No callback-based APIs (except `subscribe` for real-time)
- Consistent async/await patterns

### 4. Comprehensive Documentation
- Every interface/type documented
- JSDoc with `@param`, `@returns`, `@throws`, `@example`
- Usage examples for all major APIs
- Maps to functional requirements (FR-XXX)

### 5. Hierarchical Budget Flow
- Budget flows parent → child via `allocate()`
- Budget returns child → parent via `reclaim()`
- Validation before allocation via `getAvailable()`
- Real-time tracking via `consume()`

### 6. Workflow as First-Class Concept
- WorkflowAgent extends Agent semantics
- Internal coordination abstracted from parent
- DAG validation before execution
- Template system for reusable patterns
- Auto-decomposition for task complexity

### 7. FIFO Message Ordering
- Per-recipient FIFO guarantees
- Priority-based delivery
- Subscription-based real-time updates
- Batch operations for efficiency

### 8. Workspace Isolation
- Git worktree for zero-copy isolation
- Checkpoint/restore for fault tolerance
- Merge conflict detection
- Automatic cleanup after completion

## Requirements Coverage

### Functional Requirements Mapping

| FR | Requirement | Contract File | Key APIs |
|----|------------|---------------|----------|
| FR-001 | Agent spawning with role/task/budget | agent-api.ts | `spawn()` |
| FR-002 | Agent lifecycle tracking | agent-api.ts | `getStatus()`, `listAgents()` |
| FR-003 | Parent spawns subordinates | agent-api.ts | `spawn()` with `parentId` |
| FR-004 | Hierarchical relationships | agent-api.ts | `getHierarchy()` |
| FR-005 | Message queue with FIFO | message-api.ts | `send()`, `receive()`, `subscribe()` |
| FR-006 | State persistence | All | (Implicit in all data types) |
| FR-007 | Workspace isolation | workspace-api.ts | `createWorkspace()`, `mergeWorkspace()` |
| FR-008 | Budget tracking | budget-api.ts | `allocate()`, `consume()`, `getBudget()` |
| FR-009 | Budget reclamation | budget-api.ts | `reclaim()` |
| FR-010 | Parent terminate subordinates | agent-api.ts | `terminate()` |
| FR-011 | Agent status queries | agent-api.ts | `getStatus()`, `getResult()` |
| FR-012 | Failure handling | agent-api.ts | `AgentError`, error propagation |
| FR-013 | Checkpointing | workspace-api.ts | `createCheckpoint()`, `restoreCheckpoint()` |
| FR-014 | Budget validation | budget-api.ts | `allocate()` validates availability |
| FR-015 | Audit logging | All | Statistics and history APIs |
| FR-016 | Workflow-based composition | workflow-api.ts | `createWorkflow()` |
| FR-017 | Workflow DAG definition | workflow-api.ts | `WorkflowGraph`, `WorkflowNode`, `WorkflowEdge` |
| FR-018 | Automatic task decomposition | workflow-api.ts | `decomposeTask()` |
| FR-019 | Workflow abstraction | workflow-api.ts | `WorkflowAgent` presents as single unit |
| FR-020 | Workflow templates | workflow-api.ts | `loadTemplate()`, `saveTemplate()`, `instantiateTemplate()` |
| FR-021 | Workflow validation | workflow-api.ts | `validateWorkflow()` |
| FR-022 | Workflow progress tracking | workflow-api.ts | `getWorkflowProgress()` |

### User Story Support

All user stories (US1-US6) are fully supported through these API contracts:

- **US1** (Individual Agents): `spawn()`, `getStatus()`, `getResult()`
- **US2** (Hierarchical Teams): `spawn()` with `parentId`, `getHierarchy()`, budget flow
- **US3** (Message Queue): `send()`, `receive()`, `subscribe()` with FIFO guarantees
- **US4** (Workspace Isolation): `createWorkspace()`, `getWorkspaceDiff()`, `mergeWorkspace()`
- **US5** (Budget Tracking): `allocate()`, `consume()`, `reclaim()`, `getBudget()`
- **US6** (Workflow Composition): `createWorkflow()`, `decomposeTask()`, `validateWorkflow()`, templates

## Usage Examples

### Example 1: Spawn Single Agent
```typescript
// Spawn a single agent with task and budget
const agent = await spawn({
  role: 'implementer',
  task: 'Create REST API endpoints for user management',
  budget: 50000,
  depthLevel: 0,
  parentId: null,
  mode: 'single'
})

// Monitor status
const status = await getStatus(agent.id)
console.log(`Progress: ${status.progress.percentComplete}%`)
console.log(`Budget remaining: ${status.budget.remaining}`)

// Get result when complete
const result = await getResult(agent.id)
console.log(`Modified files: ${result.filesModified.join(', ')}`)
```

### Example 2: Hierarchical Agent Team
```typescript
// Spawn coordinator agent
const coordinator = await spawn({
  role: 'coordinator',
  task: 'Build backend authentication system',
  budget: 200000,
  depthLevel: 0,
  parentId: null,
  mode: 'single'
})

// Coordinator spawns subordinates
const architect = await spawn({
  role: 'architect',
  task: 'Design authentication schema and API',
  budget: 50000,
  depthLevel: 1,
  parentId: coordinator.id,
  mode: 'single'
})

const implementer = await spawn({
  role: 'implementer',
  task: 'Implement authentication endpoints',
  budget: 80000,
  depthLevel: 1,
  parentId: coordinator.id,
  mode: 'single'
})

// View hierarchy
const tree = await getHierarchy(coordinator.id)
console.log(`Total subordinates: ${countNodes(tree) - 1}`)
```

### Example 3: Workflow Composition
```typescript
// Load workflow template
const template = await loadTemplate('backend-dev-workflow')

// Instantiate workflow for specific task
const graph = await instantiateTemplate(template.id, {
  task: 'Build user authentication service',
  budget: 200000,
  variables: { feature: 'authentication', framework: 'Express' }
})

// Validate workflow
const validation = await validateWorkflow(graph)
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors)
  return
}

// Create workflow agent
const workflowAgent = await createWorkflow({
  workflowGraph: graph,
  task: 'Build authentication service',
  budget: 200000,
  parentId: null,
  depthLevel: 0
})

// Monitor progress
const progress = await getWorkflowProgress(graph.id)
console.log(`Nodes complete: ${progress.nodeStats.completed}/${progress.nodeStats.total}`)
console.log(`Budget used: ${progress.budgetStats.percentUsed}%`)
```

### Example 4: Message Communication
```typescript
// Subscribe to messages
const subscription = await subscribe('agent-child', async (message) => {
  if (message.action === 'start_work') {
    console.log('Received work assignment:', message.payload)
    await processTask(message.payload)

    // Send progress report
    await send({
      senderId: 'agent-child',
      recipientId: message.senderId,
      action: 'report_progress',
      payload: { status: 'in_progress', percentComplete: 50 },
      priority: 'normal',
      expiresAt: null,
      metadata: {}
    })
  }
}, { actions: ['start_work', 'give_approval'] })
```

### Example 5: Budget Management
```typescript
// Allocate budget to child
await allocate('agent-parent', 'agent-child', 50000)

// Child consumes budget
await consume('agent-child', {
  tokensUsed: 5000,
  costUsd: 0.15,
  model: 'claude-sonnet-4-5',
  breakdown: { inputTokens: 3000, outputTokens: 2000 },
  operation: 'code_generation',
  metadata: {}
})

// Check remaining budget
const available = await getAvailable('agent-parent')
console.log(`Parent has ${available} tokens available`)

// Reclaim when child completes
const reclaimed = await reclaim('agent-child')
console.log(`Reclaimed ${reclaimed} tokens to parent`)
```

### Example 6: Workspace Isolation
```typescript
// Create isolated workspace
const workspace = await createWorkspace('agent-123', {
  type: 'worktree',
  baseBranch: 'main',
  createBranch: true,
  branchName: 'agent-123-feature',
  copyGitignore: true,
  initializeHooks: false
})

// Work in workspace...
// Create checkpoint
const checkpoint = await createCheckpoint(workspace.id, {
  type: 'milestone',
  label: 'API endpoints complete',
  description: 'All REST endpoints implemented'
})

// Get diff
const diff = await getWorkspaceDiff(workspace.id)
console.log(`Files modified: ${diff.filesModified.length}`)
console.log(`Lines added: ${diff.linesAdded}`)

// Merge to main
const mergeResult = await mergeWorkspace(workspace.id, 'main', {
  strategy: 'recursive',
  deleteBranchAfterMerge: true
})

if (mergeResult.status === 'success') {
  await cleanupWorkspace(workspace.id, { removeDirectory: true })
}
```

## Next Steps

1. **Implementation Phase**: Use these contracts as interface definitions for implementation
2. **Database Schema**: Design database schema to persist these data structures
3. **Integration Tests**: Write integration tests validating contract compliance
4. **SDK Development**: Build SDK wrapping these APIs for external consumers
5. **Documentation**: Generate API reference documentation from JSDoc

## Notes

- These are **programmatic APIs** (TypeScript/JavaScript), not REST APIs
- All operations are async (Promise-based) for database/I/O operations
- Error handling is explicit with typed error classes
- Types are designed for strict TypeScript compilation
- Examples demonstrate common usage patterns for each API category
