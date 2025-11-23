# Multi-Agent Orchestration System

A hierarchical agent orchestration system supporting workflow composition, budget tracking, and workspace isolation for autonomous AI agents.

## Overview

This system enables autonomous AI agents to spawn subordinates, communicate via message queues, track budgets hierarchically, work in isolated workspaces, and compose into multi-agent workflows. It implements a recursive agent pattern where each agent is a complete, self-contained system capable of delegating work to specialized subordinate agents.

### Key Features

- **Hierarchical Agent Trees**: Unlimited-depth parent-child agent relationships with cascade operations
- **Workflow Composition**: Define complex agents as coordinated workflows of specialized sub-agents
- **Budget Management**: Hierarchical token budget allocation, tracking, and automatic reclamation
- **Workspace Isolation**: Git worktree-based isolation preventing concurrent modification conflicts
- **Message Queue**: Asynchronous agent-to-agent communication with FIFO ordering guarantees
- **Fault Tolerance**: State checkpointing for long-running tasks and system restart resilience
- **Template System**: Reusable workflow patterns (e.g., "backend-dev-workflow", "TDD-workflow")
- **Auto-Decomposition**: LLM-based task analysis that generates appropriate workflow graphs

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 14.0 or higher (with JSONB support)
- **Git**: 2.30 or higher (for worktree support)
- **TypeScript**: 5.3.3 (included in dev dependencies)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/multi-agent-builder.git
cd multi-agent-builder
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

Create a PostgreSQL database for the orchestration system:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE agent_orchestration;

# Create user (optional)
CREATE USER agent_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE agent_orchestration TO agent_user;
```

### 4. Environment Configuration

Create a `.env` file in the project root:

```bash
# Database Configuration
DATABASE_URL=postgresql://agent_user:your_secure_password@localhost:5432/agent_orchestration

# Anthropic API (for Claude agents)
ANTHROPIC_API_KEY=your_anthropic_api_key

# System Configuration
MAX_CONCURRENT_AGENTS=50
DEFAULT_AGENT_TIMEOUT=300000
LOG_LEVEL=info

# Workspace Configuration
WORKSPACE_BASE_PATH=/tmp/agent-workspaces
WORKSPACE_CLEANUP_POLICY=on_completion
```

### 5. Run Database Migrations

```bash
npm run migrate
```

This will create all necessary tables, indexes, constraints, and triggers.

## Quick Start

### Spawn Your First Agent

```typescript
import { Agent } from './src/core/Agent';
import { SharedDatabase } from './src/infrastructure/SharedDatabase';

// Initialize database connection
const db = await SharedDatabase.getInstance();

// Spawn a simple agent
const agent = await Agent.spawn({
  role: 'implementer',
  task: 'Create a README.md file with project overview',
  budget: 10000, // 10,000 tokens
  workspaceConfig: {
    basePath: '/tmp/agent-workspaces',
    isolationEnabled: true
  }
});

// Run the agent
const result = await agent.run();

console.log('Agent completed:', result.status);
console.log('Tokens consumed:', result.budgetConsumed);
console.log('Output:', result.output);
```

### Create a Hierarchical Team

```typescript
// Spawn a coordinator agent
const coordinator = await Agent.spawn({
  role: 'coordinator',
  task: 'Build a REST API with tests',
  budget: 100000
});

// Coordinator spawns subordinates
const backend = await coordinator.spawn({
  role: 'backend-developer',
  task: 'Implement Express.js API endpoints',
  budget: 40000
});

const tester = await coordinator.spawn({
  role: 'tester',
  task: 'Write integration tests for API',
  budget: 30000
});

// Run coordinator (orchestrates subordinates)
await coordinator.run();
```

### Use Workflow Composition

```typescript
import { WorkflowAgent } from './src/core/WorkflowAgent';

// Spawn a workflow agent using a template
const workflow = await WorkflowAgent.spawnFromTemplate({
  templateId: 'backend-dev-workflow',
  task: 'Build authentication API',
  budget: 200000
});

// Workflow automatically coordinates:
// 1. Architect (designs API)
// 2. Implementer (writes code)
// 3. Tester (creates tests)
// 4. Reviewer (validates quality)

await workflow.run();
```

## Project Structure

```
multi-agent-builder/
├── src/
│   ├── core/                 # Core agent system
│   │   ├── Agent.ts          # Base recursive agent class
│   │   ├── WorkflowAgent.ts  # Workflow composition agent
│   │   ├── AgentCore.ts      # Reusable agent logic
│   │   └── WorkflowEngine.ts # DAG execution engine
│   ├── infrastructure/       # Shared services
│   │   ├── SharedDatabase.ts # PostgreSQL connection pool
│   │   ├── SharedQueue.ts    # Message queue implementation
│   │   └── GitWorktree.ts    # Workspace isolation
│   ├── models/               # Data models (11 entities)
│   │   ├── Agent.model.ts
│   │   ├── WorkflowGraph.model.ts
│   │   ├── Message.model.ts
│   │   ├── Budget.model.ts
│   │   └── ...
│   ├── services/             # Business logic services
│   │   ├── AgentService.ts
│   │   ├── BudgetService.ts
│   │   ├── MessageService.ts
│   │   └── WorkflowService.ts
│   ├── database/             # Database schema & migrations
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── migrate.ts
│   └── cli/                  # Command-line interface
│       └── index.ts
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests (6 suites)
│   │   ├── spawn-agent.test.ts
│   │   ├── hierarchical-teams.test.ts
│   │   ├── message-queue.test.ts
│   │   ├── workspace-isolation.test.ts
│   │   ├── budget-tracking.test.ts
│   │   └── workflow-composition.test.ts
│   └── contract/             # API contract validation
├── specs/                    # Feature specifications
│   └── 001-agent-orchestration-system/
│       ├── spec.md           # Feature specification
│       ├── plan.md           # Implementation plan
│       ├── data-model.md     # Database design
│       ├── quickstart.md     # Usage guide
│       └── contracts/        # TypeScript API contracts
├── config/                   # Configuration files
├── docs/                     # Additional documentation
└── migrations/               # Database migration files
```

## Development Scripts

### Development Mode

Run the application with hot reload:

```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

The compiled output is in the `dist/` directory.

### Testing

Run all tests with Vitest:

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test -- --watch
```

Run tests with coverage:

```bash
npm run test -- --coverage
```

### Type Checking

Verify TypeScript types without emitting files:

```bash
npm run typecheck
```

### Linting

Check code quality with ESLint:

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run lint -- --fix
```

### Database Migrations

Apply database migrations:

```bash
npm run migrate
```

## Architecture Overview

### Recursive Agent Pattern

Every Agent IS a complete system, not managed by a centralized coordinator. This recursive pattern enables unlimited hierarchical depth:

```typescript
class Agent {
  // Each agent can spawn subordinates recursively
  async spawn(config: AgentConfig): Promise<Agent>

  // Parent can terminate subordinates
  async fire(subordinateId: string): Promise<void>

  // Execute the agent's task
  async run(): Promise<AgentResult>

  // Send messages to other agents
  async sendMessage(recipientId: string, payload: any): Promise<void>
}
```

### Workflow as First-Class Citizen

WorkflowAgent extends Agent to manage internal directed acyclic graphs (DAGs) of coordinated sub-agents:

```typescript
class WorkflowAgent extends Agent {
  private graph: WorkflowGraph;
  private internalAgents: Map<string, Agent>;

  // Execute workflow nodes respecting dependencies
  async executeWorkflow(): Promise<void>
}
```

Workflows support:
- **Parallel execution**: Independent nodes run concurrently
- **Sequential dependencies**: Nodes wait for prerequisites
- **Budget allocation**: Proportional distribution across nodes
- **Failure handling**: Graceful degradation with partial results

### Hierarchical Budget Flow

Budget flows DOWN from parent to child, reclaimed UP on completion:

```
Orchestrator (100,000 tokens)
    ├─> Coordinator A (40,000)
    │       ├─> Implementer (20,000)
    │       └─> Tester (15,000) -> completes, 5,000 returned
    └─> Coordinator B (30,000)
```

- **ACID transactions** prevent double-spending
- **Automatic reclamation** when agents complete/terminate
- **Real-time tracking** via database triggers
- **100% accuracy** guaranteed (no budget leaks)

### Message Queue with FIFO Ordering

PostgreSQL-backed asynchronous messaging:

```sql
-- Messages delivered in priority + FIFO order
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
```

Features:
- 99.9% delivery reliability
- FIFO ordering per recipient
- Persistent across restarts
- Backpressure handling

### Git Worktree Isolation

Each agent gets an isolated Git worktree:

```
main-repo/
worktrees/
    ├─> agent-abc123/     # Agent 1's isolated workspace
    ├─> agent-def456/     # Agent 2's isolated workspace
    └─> agent-ghi789/     # Agent 3's isolated workspace
```

Benefits:
- **Zero-copy isolation**: Shared Git object store
- **Parallel modification**: No merge conflicts during execution
- **Easy review**: Compare workspace to main with git diff
- **Lightweight**: No Docker overhead

## Usage Examples

For comprehensive examples and detailed usage instructions, see:

- **[Quickstart Guide](specs/001-agent-orchestration-system/quickstart.md)** - 2,500+ line guide with 6 complete examples
- **[API Contracts](specs/001-agent-orchestration-system/contracts/)** - TypeScript interface definitions
- **[Data Model](specs/001-agent-orchestration-system/data-model.md)** - Database schema and entity relationships

### Example: Message Passing Between Agents

```typescript
// Agent A sends data to Agent B
await agentA.sendMessage(agentB.id, {
  type: 'data_ready',
  payload: { records: 1000, status: 'processed' }
});

// Agent B receives messages
const messages = await agentB.receiveMessages();
for (const msg of messages) {
  console.log('Received:', msg.payload);
}
```

### Example: Budget Tracking

```typescript
// Check agent's current budget
const budget = await agent.getBudgetStatus();
console.log(`Allocated: ${budget.allocated}`);
console.log(`Consumed: ${budget.consumed}`);
console.log(`Available: ${budget.available}`);

// Fire subordinate and reclaim budget
await parentAgent.fire(childAgent.id);
// Child's unused budget automatically returned to parent
```

### Example: Workflow Templates

```typescript
// Define reusable workflow template
const template = {
  id: 'tdd-workflow',
  name: 'Test-Driven Development',
  nodes: [
    { role: 'architect', budgetPercent: 15, dependencies: [] },
    { role: 'tester', budgetPercent: 25, dependencies: ['architect'] },
    { role: 'implementer', budgetPercent: 40, dependencies: ['tester'] },
    { role: 'reviewer', budgetPercent: 20, dependencies: ['implementer'] }
  ]
};

// Use template
const workflow = await WorkflowAgent.spawnFromTemplate({
  templateId: 'tdd-workflow',
  task: 'Build payment processing module',
  budget: 150000
});
```

## Performance Characteristics

Based on success criteria from [spec.md](specs/001-agent-orchestration-system/spec.md):

- **Agent spawning**: <5 seconds from request to ready state (SC-006)
- **Message delivery**: <1 second latency for 50 concurrent agents (SC-007)
- **Status queries**: <100ms for hierarchies up to 20 agents (SC-009)
- **Budget tracking**: 100% accuracy with zero budget leaks (SC-004)
- **Hierarchy depth**: 5+ levels without performance degradation (SC-002)
- **Workflow reliability**: 99% success rate for multi-agent coordination (SC-011)
- **System restart**: Full state recovery in <30 seconds (SC-010)

## Troubleshooting

### Database Connection Issues

If you encounter "connection refused" errors:

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql postgresql://agent_user:password@localhost:5432/agent_orchestration
```

### Agent Spawn Failures

Enable debug logging in `.env`:

```bash
LOG_LEVEL=debug
```

Check agent logs for detailed error messages.

### Workspace Disk Space

Monitor workspace directory:

```bash
du -sh /tmp/agent-workspaces
```

Clean up completed workspaces:

```bash
npm run workspace:cleanup
```

## Contributing

This project follows Test-Driven Development (TDD) workflow:

1. Write tests first (in `tests/`)
2. Implement features to pass tests
3. Ensure >80% code coverage
4. Run linting and type checking
5. Submit pull requests with clear descriptions

## License

MIT License - see LICENSE file for details

## Additional Documentation

- **[Feature Specification](specs/001-agent-orchestration-system/spec.md)** - Complete requirements and user stories
- **[Implementation Plan](specs/001-agent-orchestration-system/plan.md)** - Technical approach and architecture
- **[Data Model](specs/001-agent-orchestration-system/data-model.md)** - Database schema with ERD diagrams
- **[Research Document](specs/001-agent-orchestration-system/research.md)** - Technology decisions and patterns
- **[API Contracts](specs/001-agent-orchestration-system/contracts/)** - TypeScript interface definitions
- **[Quickstart Guide](specs/001-agent-orchestration-system/quickstart.md)** - Comprehensive usage examples

## Support

For issues, questions, or contributions:

- **Issues**: https://github.com/yourusername/multi-agent-builder/issues
- **Documentation**: See `specs/001-agent-orchestration-system/`
- **Examples**: See `specs/001-agent-orchestration-system/quickstart.md`
