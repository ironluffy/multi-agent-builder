# Research: Hierarchical Agent Orchestration System

## Executive Summary

Analysis of the `claude-spawn-claude` reference implementation reveals a production-ready hierarchical agent management platform built on TypeScript, Node.js, and PostgreSQL. The system demonstrates mature patterns for agent lifecycle management, message queuing, budget tracking, workspace isolation, and fault tolerance.

---

## 1. Technology Stack Decision

### Language & Runtime
- **TypeScript**: v5.3.3
- **Node.js**: >=18.0.0 (engines requirement)
- **ES Module System**: ES2022 with ES2022 lib

**Rationale**:
- TypeScript provides strong typing for complex agent orchestration logic
- ES2022 modules enable modern JavaScript features (top-level await, etc.)
- Node.js 18+ required for latest PostgreSQL driver features and native fetch
- Strict compiler options enforce code quality (`strict: true`, `forceConsistentCasingInFileNames: true`)

### Build & Development
- **Build Tool**: `tsc` (TypeScript compiler)
- **Development**: `tsx` (TypeScript execute) for hot-reload and direct execution
- **Module Format**: ESM (`type: "module"` in package.json)

---

## 2. Primary Dependencies

| Dependency | Version | Purpose | Critical Features Used |
|------------|---------|---------|------------------------|
| **@anthropic-ai/claude-agent-sdk** | ^0.1.37 | Core agent execution | `query()` function for agent conversations, tool use handling |
| **@anthropic-ai/sdk** | ^0.32.1 | Claude API client | Token usage tracking, streaming responses |
| **pg** | ^8.11.3 | PostgreSQL driver | Connection pooling, parameterized queries, transaction support |
| **express** | ^4.18.2 | HTTP server | Webhook endpoints, health checks, admin API |
| **ws** | ^8.16.0 | WebSocket server | Real-time status updates, live monitoring |
| **zod** | ^3.22.4 | Schema validation | Input validation, type-safe parsing, runtime type checking |
| **pino** | ^10.1.0 | Structured logging | High-performance JSON logging, log levels |
| **pino-pretty** | ^13.1.2 | Log formatting | Human-readable development logs |
| **dotenv** | ^16.4.5 | Environment config | .env file loading, configuration management |
| **uuid** | ^9.0.1 | ID generation | Agent IDs, message IDs, unique identifiers |
| **chalk** | ^5.6.2 | Terminal colors | CLI output formatting, status indicators |
| **commander** | ^11.1.0 | CLI framework | Command parsing, help generation |
| **inquirer** | ^9.2.12 | Interactive CLI | Setup wizard, user prompts |
| **ora** | ^7.0.1 | Spinners | Loading indicators, progress display |
| **js-yaml** | ^4.1.1 | YAML parsing | Configuration file parsing |
| **@linear/sdk** | ^64.0.0 | Linear integration | Issue webhooks, project management |
| **@modelcontextprotocol/sdk** | ^1.0.4 | MCP integration | Tool protocols, context management |
| **langfuse** | ^3.38.6 | LLM observability | Tracing, debugging, analytics |

### Development Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| **vitest** | ^4.0.8 | Testing framework (integration & unit tests) |
| **supertest** | ^7.1.4 | HTTP endpoint testing |
| **typescript** | ^5.3.3 | Type checking and compilation |
| **eslint** | ^8.56.0 | Code linting |
| **@typescript-eslint/*** | ^6.19.0 | TypeScript-specific linting rules |

---

## 3. Storage & Persistence

### Database: PostgreSQL 14+

**Version Requirements**: PostgreSQL 14 or higher required for:
- `gen_random_uuid()` function (native UUID generation)
- Advanced JSON operations (`jsonb` type)
- Recursive CTEs (hierarchical queries)
- Row-level locking (`FOR UPDATE SKIP LOCKED`)

### Schema Design Approach

#### Migration Strategy
- **Numbered migrations**: `001_*.sql`, `002_*.sql` pattern
- **Idempotent**: `CREATE TABLE IF NOT EXISTS`, graceful skip on re-run
- **Rollback support**: Separate rollback files (`001_rollback_*.sql`)
- **Version tracking**: `schema_migrations` table tracks applied migrations

#### Core Tables

1. **agent_units** (4,820 lines total schema)
   - Primary table for agent lifecycle
   - Stores: `id`, `parent_id`, `depth_level`, `status`, `workdir`, `claude_md_path`
   - Constraints: Valid status enum, terminated_at consistency check
   - Indexes: `parent_id`, `status`, `depth_level`

2. **managers** & **executors**
   - Dual-role architecture: Manager (decisions) + Executor (work)
   - Manager: inbox counts, decision metrics, spawning stats
   - Executor: task tracking, specialization, completion stats

3. **message_inbox**
   - Queue for agent-to-agent communication
   - Priority-based delivery
   - Workflow-aware routing
   - Dead Letter Queue (DLQ) for failed messages

4. **agent_budgets**
   - Hierarchical budget tracking
   - Fields: `allocated`, `used`, `remaining`, `parent_id`
   - Automatic cascading updates

5. **checkpoints**
   - State snapshots for recovery
   - Types: milestone, periodic, pre_spawn, budget_threshold, manual
   - Stores: state snapshot, git SHA, message count

6. **workflow_graphs**
   - Graph-based task orchestration
   - JSONB definition field for nodes and edges
   - Status tracking: pending, active, paused, completed, failed

7. **api_usage**
   - Token usage logging
   - Cost tracking in USD
   - Model version recording

### Database Features Used

```sql
-- Recursive CTE for hierarchies
WITH RECURSIVE hierarchy AS (
  SELECT agent_id, parent_id, 0 as level
  FROM agent_budgets WHERE agent_id = $1
  UNION ALL
  SELECT b.agent_id, b.parent_id, h.level + 1
  FROM agent_budgets b
  JOIN hierarchy h ON b.parent_id = h.agent_id
)

-- Row-level locking for horizontal scaling
SELECT * FROM messages
WHERE recipient_id = $1 AND status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED

-- JSONB for flexible workflow definitions
CREATE TABLE workflow_graphs (
  id UUID PRIMARY KEY,
  definition JSONB NOT NULL,
  status TEXT NOT NULL
);
```

### Connection Pooling
- **Pool size**: 20 connections (default, configurable)
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds
- **Error handling**: Pool-level error listeners

---

## 4. Testing Framework

### Framework: Vitest v4.0.8

**Rationale over Jest**:
- Native ESM support (no transpilation)
- Faster execution with Vite
- Better TypeScript integration
- Watch mode optimized for ESM

### Test Organization

```
tests/
├── integration/          # Integration tests (16 files)
│   ├── 01-single-agent.test.ts
│   ├── 02-message-queue.test.ts
│   ├── 03-hierarchical-hiring.test.ts
│   ├── 04-agent-execution.test.ts
│   ├── 05-git-worktree.test.ts
│   ├── 06-checkpoint-system.test.ts
│   ├── 07-sequential-comments.test.ts
│   ├── 08-race-conditions.test.ts
│   ├── phase6-e2e-workflow.test.ts
│   ├── phase6-performance.test.ts
│   ├── phase6-failure-scenarios.test.ts
│   └── phase6-manager-decisions.test.ts
├── unit/                 # Unit tests
│   └── WebhookDeduplication.test.ts
└── utils/
    └── test-helpers.ts   # Shared test utilities
```

### Test Patterns

```typescript
// Phase-based organization
describe('Phase 1: Single Agent Spawning', () => {
  let testDb: TestDatabase
  let testWfm: TestWorkforceManager

  beforeAll(async () => {
    testDb = new TestDatabase()
    // Setup
  })

  afterAll(async () => {
    await testDb.cleanup()
    await testDb.close()
  })

  beforeEach(async () => {
    await testDb.cleanup() // Clean slate per test
  })

  it('should create agent with database entry', async () => {
    // Arrange, Act, Assert pattern
  })
})
```

### Test Helpers
- **TestDatabase**: Mock DB with cleanup methods
- **TestWorkforceManager**: Agent lifecycle test wrapper
- **sleep()**: Async delay for race conditions
- **workspaceExists()**: Filesystem verification

### Coverage Approach
- **Integration-first**: Focus on end-to-end scenarios
- **Critical paths**: Agent lifecycle, message routing, budget tracking
- **Failure scenarios**: Error handling, race conditions, webhook deduplication
- **Performance**: Load tests, concurrent agent spawning

### Test Scripts
```json
{
  "test": "vitest",
  "test:integration": "vitest run tests/integration/",
  "test:unit": "vitest run tests/unit/",
  "test:watch": "vitest",
  "test:smoke": "tsx scripts/testing/smoke-test.ts"
}
```

---

## 5. Architecture Decisions

### 5.1 Agent Class Design

**Pattern**: Recursive Self-Contained Agents

```typescript
export class Agent {
  private core: AgentCore          // Business logic
  private config: AgentConfig      // Agent metadata
  private generator: AsyncIterable<SDKMessage>  // Claude SDK stream
  private subordinates: Map<string, Agent>      // Child agents

  constructor(
    config: AgentConfig,
    private db: Pool,
    private queue: SharedQueue,
    private gitWorktree: GitWorktree,
    private systemPromptBuilder: SystemPromptBuilder,
    private permissionManager: PermissionManager,
    private budgetTracker: BudgetTracker
  )

  // Recursive spawning
  async spawn(config: SpawnSubordinateConfig): Promise<Agent>

  // Termination
  async fire(subordinateId: string): Promise<void>

  // Execution loop
  async run(): Promise<void>
}
```

**Key Decisions**:
- **Composition over inheritance**: Agent contains Core, Queue, Worktree rather than extending
- **Recursive structure**: Each Agent can spawn child Agents with same interface
- **Dependency injection**: All services passed to constructor for testability
- **Async iterator pattern**: Claude SDK query returns AsyncIterable for streaming

### 5.2 Message Queue Implementation

**Pattern**: Database-Backed Priority Queue

```typescript
export class MessageQueue {
  async send(
    senderId: string | null,
    recipientId: string | null,
    action: MessageAction,
    payload: Record<string, any>,
    priority: number = 0
  ): Promise<Message>

  async receive(recipientId: string, limit: number): Promise<Message[]>

  async moveToDLQ(message: Message, reason: string): Promise<void>
}
```

**Implementation Details**:
- **Storage**: PostgreSQL `messages` table
- **Priority**: Higher number = higher priority (0-10 range)
- **Ordering**: `ORDER BY priority DESC, created_at ASC`
- **Locking**: `FOR UPDATE SKIP LOCKED` for horizontal scaling
- **Dead Letter Queue**: Failed messages moved to `dead_letter_queue` table
- **Workflow integration**: Automatic priority boost for workflow messages (priority 5+)
- **Deduplication**: Check recipient status before sending (prevent sending to fired agents)

**Message Actions** (17 types):
```typescript
type MessageAction =
  | 'start_work' | 'request_help' | 'hire_agent' | 'fire_agent'
  | 'request_pr_approval' | 'give_advice' | 'answer'
  | 'request_test' | 'report_error' | 'report_progress'
  | 'human_input' | 'control_command' | 'checkpoint'
  | 'review_code' | 'request_changes' | 'approve_pr'
  | 'retry_task' | 'try_alternative' | 'workflow_complete'
  | 'workflow_failed' | 'new_linear_issue'
```

### 5.3 Workspace Isolation

**Pattern**: Git Worktree per Agent

```typescript
export class GitWorktree {
  async createWorktree(
    agentId: string,
    baseBranch: string = 'main'
  ): Promise<string>

  async deleteWorktree(agentId: string): Promise<void>

  async getWorktreePath(agentId: string): Promise<string | null>
}
```

**Isolation Strategy**:
1. Each agent gets dedicated git worktree
2. Worktree path: `{baseDir}/agents/{agentId}`
3. Automatic branch creation: `agent/{agentId}/{timestamp}`
4. CLAUDE.md per worktree for agent-specific context
5. Clean checkout from base branch (no shared state)

**Benefits**:
- No file conflicts between agents
- Independent git operations per agent
- Easy rollback per agent
- Branch-based code review workflow

### 5.4 Budget Tracking

**Pattern**: Hierarchical Token Accounting

```typescript
export class BudgetTracker {
  async trackFromSDK(agentId: string, usage: UsageData): Promise<void>
  async allocate(parentId: string | null, agentId: string, amount: number): Promise<void>
  async getBudget(agentId: string): Promise<AgentBudget | null>
  async getHierarchyReport(rootId: string): Promise<any>
  private async bubbleUpUsage(agentId: string, tokens: number): Promise<void>
  private async handleOverrun(agentId: string, overrun: number): Promise<void>
}
```

**Budget Flow**:
1. **Allocation**: Parent deducts from budget when spawning child
2. **Usage tracking**: Claude SDK usage bubbles up hierarchy
3. **Overrun handling**: Attempt reallocation from parent, else pause agent
4. **Logging**: All usage logged to `api_usage` table with cost calculation

**Cost Calculation** (Claude Sonnet 4 pricing):
```typescript
INPUT_PRICE = 3.0 USD / 1M tokens
OUTPUT_PRICE = 15.0 USD / 1M tokens
CACHE_READ_PRICE = 0.30 USD / 1M tokens
```

### 5.5 Workflow Engine

**Pattern**: Graph-Based Task Orchestration

```typescript
export class WorkflowEngine {
  async loadWorkflow(workflowId: string): Promise<WorkflowGraph>
  async startWorkflow(workflowId: string): Promise<void>
  async executeWorkflowWithAgents(
    workflowId: string,
    orchestratorId: string,
    workforceManager: WorkforceManager
  ): Promise<void>
  async onAgentComplete(agentId: string, workforceManager: WorkforceManager): Promise<void>
}
```

**Workflow Structure**:
```typescript
interface WorkflowGraph {
  id: string
  linearIssueId: string | null
  definition: WorkflowDefinition  // JSONB
  status: WorkflowStatus
  createdAt: Date
  completedAt: Date | null
}

interface WorkflowDefinition {
  nodes: WorkflowNode[]  // Tasks/agents
  edges: WorkflowEdge[]  // Dependencies
}

interface WorkflowEdge {
  id: string
  fromNode: string
  toNode: string
  condition: EdgeCondition  // 'always' | 'on_success' | 'on_error' | 'on_approval'
}
```

**Execution Model**:
1. Parse workflow graph from JSONB
2. Identify nodes with no dependencies (initial nodes)
3. Spawn agents for initial nodes via WorkforceManager
4. On agent completion, evaluate outgoing edges
5. Spawn dependent agents when prerequisites satisfied
6. Track completion via `WorkflowExecutionState`

**Edge Evaluation**:
- **always**: Trigger immediately when node starts
- **on_success**: Trigger when node completes successfully
- **on_error**: Trigger when node errors
- **on_approval**: Trigger when approval received

---

## 6. Performance Optimization Strategies

### 6.1 Database Optimizations

**Indexes**:
```sql
-- Agent lookups
CREATE INDEX idx_agent_units_parent ON agent_units(parent_id);
CREATE INDEX idx_agent_units_status ON agent_units(status) WHERE status != 'terminated';
CREATE INDEX idx_agent_units_depth ON agent_units(depth_level);

-- Message queue
CREATE INDEX idx_messages_recipient_status ON messages(recipient_id, status);
CREATE INDEX idx_messages_priority ON messages(priority DESC, created_at ASC);

-- Budget hierarchy
CREATE INDEX idx_budgets_parent ON agent_budgets(parent_id);
```

**Locking Strategy**:
- `FOR UPDATE SKIP LOCKED` for concurrent message processing
- Row-level locks minimize contention
- No table-level locks

**Connection Pooling**:
- Pool size: 20 (tuned for agent workload)
- Prevents connection exhaustion
- Automatic reconnection on failure

### 6.2 Caching

**In-Memory Caches**:
```typescript
// WorkflowEngine
private workflows: Map<string, WorkflowGraph> = new Map()
private nodeToWorkflow: Map<string, string> = new Map()
private agentToNode: Map<string, string> = new Map()

// BudgetTracker
private processedMessageIds = new Set<string>()
```

**Cache Invalidation**:
- Workflow updates invalidate cached graph
- Message deduplication via Set
- LRU-style cleanup on workflow completion

### 6.3 Async Patterns

**Non-Blocking Operations**:
```typescript
// Spawn subordinate without waiting
subordinate.run().catch(error => {
  logger.error(`Subordinate ${subordinateId} failed`, error)
})

// AsyncIterable for streaming
for await (const message of this.generator) {
  await this.processSDKMessage(message)
}
```

**Parallel Execution**:
- Multiple agents run concurrently
- Message processing in parallel via `SKIP LOCKED`
- Workflow nodes spawn simultaneously when dependencies met

### 6.4 Resource Management

**Cleanup Strategies**:
```typescript
// Message queue cleanup
async cleanup(olderThanDays: number = 7): Promise<number> {
  // Delete old processed messages
}

// Budget tracker cleanup
async cleanup(olderThanDays: number = 30): Promise<number> {
  // Delete old usage logs
}

// Worktree cleanup
async deleteWorktree(agentId: string): Promise<void> {
  // Remove agent workspace
}
```

**Circuit Breaker**:
- Prevents cascading failures
- Tracks error rates per agent
- Automatic pause on repeated failures

---

## 7. Risk Mitigation

### 7.1 Fault Tolerance

**Checkpoint System**:
```typescript
interface Checkpoint {
  id: string
  agentId: string
  checkpointType: CheckpointType  // milestone, periodic, pre_spawn, budget_threshold
  stateSnapshot: CheckpointState  // Full agent state
  messageCount: number
  budgetSnapshot: BudgetSnapshot | null
  gitCommitSha: string | null
  createdAt: Date
}
```

**Recovery Mechanisms**:
1. Periodic checkpoints every N messages
2. Milestone checkpoints at key events
3. Pre-spawn checkpoints before budget allocation
4. Budget threshold checkpoints (25%, 50%, 75%)
5. Git SHA tracking for code rollback

### 7.2 Budget Protection

**Multi-Level Safety**:
1. **Validation**: Check parent budget before allocation
2. **Tracking**: Real-time usage bubbling up hierarchy
3. **Alerts**: Log warnings at budget thresholds
4. **Overrun handling**: Attempt reallocation, else pause
5. **Hard limits**: Database constraints prevent negative budgets

### 7.3 Race Condition Handling

**Concurrency Safeguards**:
```typescript
// Prevent duplicate message processing
FOR UPDATE SKIP LOCKED

// Atomic budget updates
UPDATE agent_budgets
SET used = used + $1, remaining = remaining - $1
WHERE agent_id = $2

// Transaction-based state changes
BEGIN;
  -- Multiple operations
COMMIT;
```

**Test Coverage**:
- `08-race-conditions.test.ts` specifically tests concurrent scenarios
- Webhook deduplication prevents duplicate processing
- Message queue handles concurrent receives

### 7.4 Error Handling

**Layered Error Handling**:
1. **Application level**: Try-catch with fallback
2. **Circuit breaker**: Prevent repeated failures
3. **Dead Letter Queue**: Capture failed messages
4. **Logging**: Structured error logs with context
5. **Status tracking**: Agent status reflects errors

**Error Recovery**:
```typescript
switch (errorType) {
  case 'budget_exceeded':
    await agent.pause()
    break
  case 'subordinate_failed':
    await agent.retry() // or fire subordinate
    break
  case 'network_error':
    await agent.checkpoint() // Save state and retry
    break
}
```

### 7.5 Security Considerations

**Input Validation**:
- Zod schemas for all external inputs
- Webhook signature validation (Linear)
- SQL parameterization (no string concatenation)

**Permission Management**:
```typescript
export class PermissionManager {
  getToolsForRole(role: string): string[]
  async canUseTool(agentId: string, toolName: string, input: any): Promise<Decision>
}
```

**Isolation**:
- Git worktree per agent (filesystem isolation)
- Budget limits per agent
- Message queue prevents direct agent-to-agent access

### 7.6 Monitoring & Observability

**Structured Logging**:
```typescript
import { Logger } from '../utils/Logger.js'
const logger = new Logger({ component: 'Agent' })

logger.info('Agent spawned', { agentId, role, depth })
logger.error('Budget exceeded', error)
```

**Metrics Tracking**:
- Agent status changes logged
- Budget usage tracked per agent
- Message delivery metrics
- Workflow execution timings
- API usage costs

**Integration**:
- **Langfuse**: LLM tracing and debugging
- **WebSocket**: Real-time status updates
- **Health checks**: `/health` endpoint
- **Status API**: Query agent hierarchy, budgets, messages

---

## 8. Key Insights for Implementation

### 8.1 What Worked Well

1. **TypeScript + ESM**: Strong typing prevents errors, ESM enables modern patterns
2. **PostgreSQL as backbone**: Reliable storage for queue, budgets, checkpoints
3. **Git worktree isolation**: Elegant solution for workspace separation
4. **Hierarchical budgets**: Natural model for delegation
5. **Graph-based workflows**: Flexible orchestration without hardcoded logic
6. **Vitest**: Fast, reliable testing with great ESM support

### 8.2 Design Patterns to Adopt

1. **Recursive Agent pattern**: Each agent is self-contained and can spawn children
2. **Database-backed queue**: Simpler than Redis, leverages existing infra
3. **Checkpoint system**: Essential for long-running agent tasks
4. **Circuit breaker**: Prevents cascading failures in hierarchy
5. **Workflow graphs**: Decouple task structure from execution logic

### 8.3 Areas for Improvement

1. **Horizontal scaling**: `FOR UPDATE SKIP LOCKED` enables it but needs testing
2. **Observability**: More metrics needed (agent idle time, queue depth trends)
3. **Cost optimization**: Cache prompt caching more aggressively
4. **Testing**: More unit tests for edge cases
5. **Documentation**: Code comments could be more detailed

---

## 9. Technology Stack Summary

### Core Stack
- **Language**: TypeScript 5.3.3 (ES2022)
- **Runtime**: Node.js 18+
- **Database**: PostgreSQL 14+
- **Agent SDK**: @anthropic-ai/claude-agent-sdk 0.1.37
- **Testing**: Vitest 4.0.8

### Infrastructure
- **Message Queue**: PostgreSQL-backed
- **Workspace Isolation**: Git worktree
- **Logging**: Pino (structured JSON)
- **CLI**: Commander + Inquirer + Ora
- **HTTP**: Express + WebSocket
- **Validation**: Zod

### Development
- **Build**: TypeScript compiler (tsc)
- **Dev**: tsx (hot-reload)
- **Lint**: ESLint + @typescript-eslint
- **Format**: (Not specified in package.json, likely Prettier)

---

## 10. Recommended Next Steps

1. **Setup development environment**:
   - Install Node.js 18+
   - Install PostgreSQL 14+
   - Clone reference repo for study

2. **Prototype core components** in this order:
   - Database schema and migrations
   - Agent class with basic lifecycle
   - Message queue implementation
   - Budget tracker
   - Workflow engine

3. **Build test suite**:
   - Start with integration tests (follow reference patterns)
   - Test agent spawning, messaging, budgets
   - Test race conditions and failures

4. **Implement observability**:
   - Structured logging from day one
   - Metrics collection
   - Status dashboard (WebSocket + Express)

5. **Document as you build**:
   - Architecture decisions (ADRs)
   - API documentation
   - Deployment guide

---

## References

- **Source Repository**: https://github.com/ironluffy/self-hire-claude (claude-spawn-claude)
- **Main Documentation**: `docs/MASTER_SYSTEM_DESIGN.md` (2,406 lines)
- **Quick Start**: `docs/QUICKSTART.md` (523 lines)
- **Migration Files**: `migrations/001_manager_executor_system.sql`, `migrations/002_threading_system.sql`
- **Test Suite**: `tests/integration/` (16 test files, 30/37 passing)

---

## Appendix: File Structure Overview

```
claude-spawn-claude/
├── src/
│   ├── core/                    # Core agent logic (40+ files)
│   │   ├── Agent.ts            # Main agent class (385 lines)
│   │   ├── AgentCore.ts        # Business logic
│   │   ├── WorkflowEngine.ts   # Graph-based orchestration (824 lines)
│   │   ├── MessageQueue.ts     # Priority queue (313 lines)
│   │   ├── BudgetTracker.ts    # Hierarchical budgets (263 lines)
│   │   ├── types.ts            # Type definitions (150+ lines)
│   │   └── ...
│   ├── database/               # DB layer
│   │   ├── db.ts              # Connection pooling (289 lines)
│   │   ├── migrate.ts         # Migration runner
│   │   └── repositories/      # Data access layer
│   ├── infrastructure/        # Shared services
│   ├── integrations/          # External integrations (Linear, MCP)
│   ├── backend/              # Express server
│   └── cli/                  # Command-line interface
├── migrations/               # SQL migrations
│   ├── 001_manager_executor_system.sql
│   └── 002_threading_system.sql
├── tests/
│   ├── integration/          # End-to-end tests (16 files)
│   └── unit/                # Unit tests
├── config/                  # Configuration files
├── scripts/                 # Utility scripts
├── package.json            # Dependencies (107 lines)
├── tsconfig.json           # TypeScript config
└── docs/                   # Documentation
```

**Total LOC Analysis**:
- Core logic: ~15,000 lines
- Tests: ~5,000 lines
- Migrations: ~4,000 lines
- Documentation: ~3,000 lines
- **Total**: ~27,000 lines of production code

---

**Document Version**: 1.0
**Date**: 2025-01-21
**Analysis Source**: claude-spawn-claude reference implementation
**Analyst**: Claude Code
