# Quickstart Guide - Hierarchical Agent Orchestration System

Get from zero to spawning your first autonomous agent in under 10 minutes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Quick Start (5-Minute Guide)](#quick-start-5-minute-guide)
- [Core Concepts](#core-concepts)
- [Usage Examples](#usage-examples)
- [Testing Your Setup](#testing-your-setup)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

### Required

- **Node.js 18+** - JavaScript runtime
  ```bash
  node --version  # Should show v18.0.0 or higher
  ```

- **PostgreSQL 14+** - Database for agent state persistence
  ```bash
  psql --version  # Should show 14.0 or higher
  ```

- **Git** - Version control for workspace isolation
  ```bash
  git --version  # Should show 2.30 or higher
  ```

### Recommended

- **TypeScript 5.3+** - For type-safe development
  ```bash
  npm install -g typescript
  tsc --version  # Should show 5.3.0 or higher
  ```

- **curl or Postman** - For API testing
  ```bash
  curl --version
  ```

---

## Installation & Setup

### Step 1: Clone Repository

```bash
# Clone the project
git clone https://github.com/your-org/agent-orchestration-system.git
cd agent-orchestration-system

# Install dependencies
npm install

# Build the project
npm run build
```

**Success indicator:** `dist/` directory created with compiled JavaScript files.

### Step 2: Configure Database

#### Option A: Local PostgreSQL (Recommended for Development)

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt-get install postgresql-16
sudo systemctl start postgresql

# Create database
createdb agent_orchestration

# Verify connection
psql agent_orchestration -c "SELECT version();"
```

**Success indicator:** PostgreSQL version information displayed.

#### Option B: Docker PostgreSQL

```bash
# Run PostgreSQL in Docker
docker run -d \
  --name agent-postgres \
  -e POSTGRES_DB=agent_orchestration \
  -e POSTGRES_USER=agent_user \
  -e POSTGRES_PASSWORD=agent_password \
  -p 5432:5432 \
  postgres:16

# Verify connection
docker exec -it agent-postgres psql -U agent_user -d agent_orchestration -c "SELECT 1;"
```

**Success indicator:** Returns `1` without errors.

### Step 3: Configure Environment

Create `.env` file in project root:

```bash
# Database Configuration
DATABASE_URL=postgresql://agent_user:agent_password@localhost:5432/agent_orchestration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=agent_orchestration
DATABASE_USER=agent_user
DATABASE_PASSWORD=agent_password

# Server Configuration
PORT=3000
NODE_ENV=development

# Agent Configuration
DEFAULT_AGENT_BUDGET=100000
MAX_HIERARCHY_DEPTH=10
WORKSPACE_BASE_PATH=/tmp/agent-workspaces

# Optional: Claude API Configuration
ANTHROPIC_API_KEY=your_api_key_here  # Optional if using Claude Code session
```

**Important:** Replace `agent_password` and `your_api_key_here` with your actual credentials.

### Step 4: Run Database Migrations

```bash
# Run all migrations
npm run migrate

# Or manually using psql
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

**Success indicator:**
```
✅ Creating agents table...
✅ Creating messages table...
✅ Creating budgets table...
✅ Creating workspaces table...
✅ Creating workflow_graphs table...
✅ Creating checkpoints table...
✅ All migrations completed successfully
```

### Step 5: Verify Installation

```bash
# Run type checking
npm run typecheck

# Run tests
npm run test

# Start development server
npm run dev
```

**Success indicator:**
```
🚀 Agent Orchestration System starting...
✅ Database connected
✅ Message queue initialized
✅ Workspace manager ready
✅ Server listening on http://localhost:3000
```

---

## Quick Start (5-Minute Guide)

Let's spawn your first agent and complete a simple task.

### Example 1: Basic Agent Spawning (User Story 1)

**Goal:** Spawn a single agent that creates a README file.

#### Step 1: Start the Server

```bash
npm run dev
```

Leave this terminal running and open a new terminal for the next steps.

#### Step 2: Spawn Agent via API

```typescript
// save as: test-spawn.ts
import { spawn, getStatus, getResult } from './src/api/agent-api';

async function main() {
  // Spawn an agent with a simple task
  const agent = await spawn({
    role: 'implementer',
    task: 'Create a README.md file with project introduction',
    budget: 10000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Agent spawned:', agent.id);
  console.log('📍 Workspace:', agent.workspace.worktreePath);

  // Monitor status
  const status = await getStatus(agent.id);
  console.log('📊 Status:', status.state);
  console.log('💰 Budget remaining:', status.budgetConsumed, '/', agent.budget);

  // Wait for completion (in real app, use polling or webhooks)
  await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

  // Get result
  const result = await getResult(agent.id);
  console.log('✅ Task completed!');
  console.log('📝 Files modified:', result.filesModified.join(', '));
  console.log('🎯 Result:', result.output);
}

main().catch(console.error);
```

Run the test:

```bash
npx ts-node test-spawn.ts
```

**Expected Output:**
```
✅ Agent spawned: 550e8400-e29b-41d4-a716-446655440000
📍 Workspace: /tmp/agent-workspaces/agent-550e8400
📊 Status: running
💰 Budget remaining: 0 / 10000
✅ Task completed!
📝 Files modified: README.md
🎯 Result: Created README.md with project introduction
```

#### Step 3: Verify the Result

```bash
# Check the agent's workspace
ls -la /tmp/agent-workspaces/agent-550e8400/

# View the created file
cat /tmp/agent-workspaces/agent-550e8400/README.md
```

**Success indicator:** README.md file exists with project introduction content.

#### Step 4: Check Agent Status in Database

```bash
# Connect to database
psql $DATABASE_URL

# View agent record
SELECT id, role, status, task, created_at, completed_at
FROM agents
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

# View budget tracking
SELECT agent_id, allocated_units, used_units, remaining_units
FROM budgets
WHERE agent_id = '550e8400-e29b-41d4-a716-446655440000';
```

**Expected Result:**
```
id                                   | role        | status    | task                                      | created_at          | completed_at
-------------------------------------|-------------|-----------|-------------------------------------------|---------------------|---------------------
550e8400-e29b-41d4-a716-446655440000 | implementer | completed | Create a README.md file with project...  | 2025-11-21 10:00:00 | 2025-11-21 10:01:30
```

---

## Core Concepts

Understanding these concepts will help you use the system effectively.

### 1. Agent Lifecycle

Every agent goes through these states:

```
created → running → [completed | failed | terminated]
           ↓     ↑
           → waiting (blocked on subordinates)
```

**States:**
- `created`: Agent spawned but not yet executing
- `running`: Agent actively working on task
- `waiting`: Agent blocked on subordinate completion or message
- `completed`: Task finished successfully
- `failed`: Task execution error
- `terminated`: Parent stopped agent execution

**Code Example:**
```typescript
import { spawn, getStatus } from './src/api/agent-api';

const agent = await spawn({ role: 'developer', task: '...', budget: 50000 });

// Check lifecycle state
const status = await getStatus(agent.id);
console.log('Current state:', status.state); // 'running', 'completed', etc.
```

### 2. Hierarchical Spawning

Agents can spawn subordinate agents to delegate work:

```
Root Agent (Orchestrator)
  ├─ Child 1 (Coordinator)
  │   ├─ Grandchild 1 (Implementer)
  │   └─ Grandchild 2 (Tester)
  └─ Child 2 (Reviewer)
```

**Key Properties:**
- **Unlimited depth**: No limit on hierarchy levels
- **Budget flows downward**: Parents allocate budget to children
- **Parent-child relationships**: Tracked in `Hierarchy` table
- **Cascade termination**: Terminating parent stops all descendants

**Code Example:**
```typescript
// Parent agent
const parent = await spawn({
  role: 'coordinator',
  task: 'Build authentication system',
  budget: 200000,
  depthLevel: 0,
  parentId: null
});

// Child agent spawned by parent
const child = await spawn({
  role: 'implementer',
  task: 'Implement JWT authentication',
  budget: 80000,
  depthLevel: 1,
  parentId: parent.id  // Link to parent
});
```

### 3. Budget Management

Budget tracks token consumption hierarchically:

**Budget Flow:**
```
Parent (200,000 tokens)
  ├─ Allocated to Child 1: 80,000 tokens
  ├─ Allocated to Child 2: 60,000 tokens
  └─ Remaining: 60,000 tokens
```

**Key Operations:**
- `allocate()`: Parent allocates budget to child
- `consume()`: Agent uses tokens (tracked in real-time)
- `reclaim()`: Unused budget returned to parent on completion
- `getAvailable()`: Check parent's remaining budget

**Code Example:**
```typescript
import { allocate, consume, reclaim, getBudget } from './src/api/budget-api';

// Allocate budget from parent to child
await allocate('parent-id', 'child-id', 50000);

// Child consumes tokens
await consume('child-id', {
  tokensUsed: 5000,
  costUsd: 0.15,
  model: 'claude-sonnet-4-5',
  breakdown: { inputTokens: 3000, outputTokens: 2000 },
  operation: 'code_generation',
  metadata: {}
});

// Check budget status
const budget = await getBudget('child-id');
console.log('Remaining:', budget.remaining); // 45,000

// Reclaim unused budget when child completes
const reclaimed = await reclaim('child-id');
console.log('Reclaimed to parent:', reclaimed); // 45,000 tokens
```

### 4. Message Passing

Agents communicate asynchronously via message queue:

**Message Flow:**
```
Agent A  ──[start_work]──>  Agent B
Agent A  <─[report_progress]──  Agent B
Agent A  ──[give_approval]──>  Agent B
```

**Message Properties:**
- **FIFO ordering**: Per-recipient message order guaranteed
- **Priority-based**: Critical messages delivered first
- **Persistent**: Stored in database, survives restarts
- **Typed actions**: Predefined message types (start_work, report_progress, etc.)

**Code Example:**
```typescript
import { send, receive, subscribe } from './src/api/message-api';

// Send message from parent to child
await send({
  senderId: 'parent-id',
  recipientId: 'child-id',
  action: 'start_work',
  payload: {
    task: 'Implement feature X',
    deadline: '2025-11-25T17:00:00Z'
  },
  priority: 'high',
  expiresAt: null,
  metadata: {}
});

// Child receives messages
const messages = await receive('child-id', { limit: 10 });
for (const msg of messages) {
  console.log('Message:', msg.action, msg.payload);
  await markProcessed(msg.id);
}

// Or subscribe for real-time updates
await subscribe('child-id', async (message) => {
  console.log('New message:', message.action);
  // Handle message
}, { actions: ['start_work', 'give_approval'] });
```

### 5. Workspace Isolation

Each agent works in an isolated Git worktree:

**Workspace Structure:**
```
/tmp/agent-workspaces/
  ├─ agent-123/  (Agent 1's workspace)
  │   ├─ src/
  │   └─ .git/
  └─ agent-456/  (Agent 2's workspace)
      ├─ src/
      └─ .git/
```

**Benefits:**
- **Zero conflicts**: Each agent has independent copy of codebase
- **Parallel work**: Multiple agents modify same files simultaneously
- **Clean isolation**: Changes don't affect main branch until merged
- **Git integration**: Full git history and branching

**Code Example:**
```typescript
import { createWorkspace, getWorkspaceDiff, mergeWorkspace } from './src/api/workspace-api';

// Create isolated workspace for agent
const workspace = await createWorkspace('agent-123', {
  type: 'worktree',
  baseBranch: 'main',
  createBranch: true,
  branchName: 'agent-123-feature',
  copyGitignore: true,
  initializeHooks: false
});

console.log('Workspace path:', workspace.path);

// Agent works in workspace...

// Get diff of changes
const diff = await getWorkspaceDiff(workspace.id);
console.log('Files modified:', diff.filesModified.length);
console.log('Lines added:', diff.linesAdded);

// Merge to main when complete
const mergeResult = await mergeWorkspace(workspace.id, 'main', {
  strategy: 'recursive',
  deleteBranchAfterMerge: true
});

if (mergeResult.status === 'success') {
  console.log('✅ Merged successfully!');
}
```

### 6. Workflow Composition

Complex agents can be composed as workflows:

**Workflow Structure:**
```
Workflow Agent (Backend Developer)
  ├─ Node 1: Architect (design schema)
  ├─ Node 2: Implementer (write code) [depends on Node 1]
  ├─ Node 3: Tester (write tests) [depends on Node 2]
  └─ Node 4: Reviewer (code review) [depends on Node 3]
```

**Key Features:**
- **DAG (Directed Acyclic Graph)**: Nodes connected by dependencies
- **Parallel execution**: Independent nodes run concurrently
- **Sequential ordering**: Dependent nodes wait for prerequisites
- **Templates**: Reusable workflow patterns
- **Auto-decomposition**: LLM analyzes task and generates workflow

**Code Example:**
```typescript
import {
  createWorkflow,
  loadTemplate,
  instantiateTemplate,
  validateWorkflow,
  getWorkflowProgress
} from './src/api/workflow-api';

// Load pre-built template
const template = await loadTemplate('backend-dev-workflow');

// Instantiate for specific task
const graph = await instantiateTemplate(template.id, {
  task: 'Build user authentication service',
  budget: 200000,
  variables: {
    feature: 'authentication',
    framework: 'Express'
  }
});

// Validate workflow before execution
const validation = await validateWorkflow(graph);
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
  return;
}

// Create workflow agent (internally spawns 4 sub-agents)
const workflowAgent = await createWorkflow({
  workflowGraph: graph,
  task: 'Build authentication service',
  budget: 200000,
  parentId: null,
  depthLevel: 0
});

// Monitor progress
const progress = await getWorkflowProgress(graph.id);
console.log(`Nodes complete: ${progress.nodeStats.completed}/${progress.nodeStats.total}`);
console.log(`Budget used: ${progress.budgetStats.percentUsed}%`);
```

---

## Usage Examples

Complete working examples for each user story.

### Example 1 (US1): Basic Agent Spawning

**Scenario:** Spawn a single agent to create a file and verify completion.

```typescript
// File: examples/01-basic-agent-spawning.ts
import { spawn, getStatus, getResult } from './src/api/agent-api';

async function basicAgentExample() {
  console.log('🚀 Example 1: Basic Agent Spawning\n');

  // Step 1: Spawn agent
  const agent = await spawn({
    role: 'implementer',
    task: 'Create a README.md file explaining what this project does',
    budget: 10000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Agent created:', agent.id);
  console.log('📍 Workspace:', agent.workspace.worktreePath);
  console.log('💰 Budget allocated:', agent.budget, 'tokens\n');

  // Step 2: Check status periodically
  let status;
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    status = await getStatus(agent.id);
    console.log(`[${attempts + 1}] Status: ${status.state}, Budget consumed: ${status.budgetConsumed}`);

    if (status.state === 'completed' || status.state === 'failed') {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    attempts++;
  }

  // Step 3: Get result
  if (status.state === 'completed') {
    const result = await getResult(agent.id);
    console.log('\n✅ Task completed successfully!');
    console.log('📝 Files modified:', result.filesModified.join(', '));
    console.log('📊 Budget used:', status.budgetConsumed, '/', agent.budget);
    console.log('🎯 Output:', result.output);
  } else if (status.state === 'failed') {
    console.error('\n❌ Task failed:', status.errorMessage);
  } else {
    console.warn('\n⚠️  Task timeout after', attempts * 2, 'seconds');
  }

  // Step 4: Cleanup
  console.log('\n🧹 To cleanup workspace:');
  console.log(`   rm -rf ${agent.workspace.worktreePath}`);
}

// Run example
basicAgentExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/01-basic-agent-spawning.ts
```

**Expected Output:**
```
🚀 Example 1: Basic Agent Spawning

✅ Agent created: 550e8400-e29b-41d4-a716-446655440000
📍 Workspace: /tmp/agent-workspaces/agent-550e8400
💰 Budget allocated: 10000 tokens

[1] Status: running, Budget consumed: 0
[2] Status: running, Budget consumed: 1200
[3] Status: running, Budget consumed: 2500
[4] Status: completed, Budget consumed: 3800

✅ Task completed successfully!
📝 Files modified: README.md
📊 Budget used: 3800 / 10000
🎯 Output: Created comprehensive README.md with project overview

🧹 To cleanup workspace:
   rm -rf /tmp/agent-workspaces/agent-550e8400
```

---

### Example 2 (US2): Hierarchical Agent Teams

**Scenario:** Parent agent spawns two children to implement and test a feature.

```typescript
// File: examples/02-hierarchical-teams.ts
import { spawn, getStatus, getHierarchy } from './src/api/agent-api';
import { allocate, getBudget } from './src/api/budget-api';

async function hierarchicalTeamExample() {
  console.log('🚀 Example 2: Hierarchical Agent Teams\n');

  // Step 1: Spawn coordinator (parent)
  const coordinator = await spawn({
    role: 'coordinator',
    task: 'Build and test a simple calculator function',
    budget: 100000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Coordinator spawned:', coordinator.id);
  console.log('💰 Coordinator budget:', coordinator.budget, 'tokens\n');

  // Step 2: Coordinator spawns implementer (child 1)
  await allocate(coordinator.id, 'child-implementer-id', 40000);

  const implementer = await spawn({
    role: 'implementer',
    task: 'Implement calculator with add, subtract, multiply, divide',
    budget: 40000,
    depthLevel: 1,
    parentId: coordinator.id,
    mode: 'single'
  });

  console.log('✅ Implementer spawned:', implementer.id);
  console.log('   Parent:', implementer.parentId);
  console.log('   Depth level:', implementer.depthLevel);

  // Check coordinator's budget after allocation
  const coordBudgetAfterImpl = await getBudget(coordinator.id);
  console.log('💰 Coordinator budget remaining:', coordBudgetAfterImpl.remaining, 'tokens\n');

  // Step 3: Coordinator spawns tester (child 2)
  await allocate(coordinator.id, 'child-tester-id', 30000);

  const tester = await spawn({
    role: 'tester',
    task: 'Write comprehensive tests for calculator functions',
    budget: 30000,
    depthLevel: 1,
    parentId: coordinator.id,
    mode: 'single'
  });

  console.log('✅ Tester spawned:', tester.id);
  console.log('   Parent:', tester.parentId);
  console.log('   Depth level:', tester.depthLevel);

  // Final budget check
  const coordBudgetFinal = await getBudget(coordinator.id);
  console.log('💰 Coordinator budget remaining:', coordBudgetFinal.remaining, 'tokens\n');

  // Step 4: Wait for children to complete
  console.log('⏳ Waiting for children to complete...\n');

  let implStatus, testStatus;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    implStatus = await getStatus(implementer.id);
    testStatus = await getStatus(tester.id);

    console.log(`[${attempts + 1}] Implementer: ${implStatus.state}, Tester: ${testStatus.state}`);

    if (
      (implStatus.state === 'completed' || implStatus.state === 'failed') &&
      (testStatus.state === 'completed' || testStatus.state === 'failed')
    ) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  // Step 5: View hierarchy
  console.log('\n📊 Agent Hierarchy:\n');
  const hierarchy = await getHierarchy(coordinator.id);
  printHierarchy(hierarchy, 0);

  // Step 6: Check budget reclamation
  const finalBudget = await getBudget(coordinator.id);
  console.log('\n💰 Final Budget Status:');
  console.log('   Allocated:', finalBudget.allocated);
  console.log('   Used by coordinator:', finalBudget.used);
  console.log('   Reserved for children:', finalBudget.reserved);
  console.log('   Remaining:', finalBudget.remaining);
}

// Helper to print hierarchy tree
function printHierarchy(node: any, indent: number) {
  const prefix = '  '.repeat(indent) + (indent > 0 ? '├─ ' : '');
  console.log(`${prefix}${node.role} (${node.id.substring(0, 8)}...) - ${node.status}`);

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      printHierarchy(child, indent + 1);
    }
  }
}

// Run example
hierarchicalTeamExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/02-hierarchical-teams.ts
```

**Expected Output:**
```
🚀 Example 2: Hierarchical Agent Teams

✅ Coordinator spawned: a1b2c3d4-e5f6-7890-abcd-ef1234567890
💰 Coordinator budget: 100000 tokens

✅ Implementer spawned: b2c3d4e5-f678-90ab-cdef-123456789012
   Parent: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Depth level: 1
💰 Coordinator budget remaining: 60000 tokens

✅ Tester spawned: c3d4e5f6-7890-abcd-ef12-34567890abcd
   Parent: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Depth level: 1
💰 Coordinator budget remaining: 30000 tokens

⏳ Waiting for children to complete...

[1] Implementer: running, Tester: running
[2] Implementer: running, Tester: running
[3] Implementer: completed, Tester: running
[4] Implementer: completed, Tester: completed

📊 Agent Hierarchy:

coordinator (a1b2c3d4...) - waiting
  ├─ implementer (b2c3d4e5...) - completed
  ├─ tester (c3d4e5f6...) - completed

💰 Final Budget Status:
   Allocated: 100000
   Used by coordinator: 5000
   Reserved for children: 52000
   Remaining: 43000
```

---

### Example 3 (US3): Message Queue Communication

**Scenario:** Two agents communicate via message queue to coordinate work.

```typescript
// File: examples/03-message-queue.ts
import { spawn } from './src/api/agent-api';
import { send, receive, subscribe, markProcessed } from './src/api/message-api';

async function messageQueueExample() {
  console.log('🚀 Example 3: Message Queue Communication\n');

  // Step 1: Spawn two agents
  const agentA = await spawn({
    role: 'data-processor',
    task: 'Process data and send to analyzer',
    budget: 30000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  const agentB = await spawn({
    role: 'data-analyzer',
    task: 'Analyze processed data',
    budget: 30000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Agent A (processor):', agentA.id);
  console.log('✅ Agent B (analyzer):', agentB.id, '\n');

  // Step 2: Agent A sends message to Agent B
  console.log('📤 Agent A sending message to Agent B...\n');

  await send({
    senderId: agentA.id,
    recipientId: agentB.id,
    action: 'data_ready',
    payload: {
      datasetId: 'dataset-12345',
      recordCount: 1000,
      processingTime: 5.2,
      status: 'ready_for_analysis'
    },
    priority: 'high',
    expiresAt: null,
    metadata: { source: 'processor', version: '1.0' }
  });

  console.log('✅ Message sent\n');

  // Step 3: Agent B receives messages (polling approach)
  console.log('📥 Agent B checking for messages...\n');

  const messages = await receive(agentB.id, {
    limit: 10,
    actions: ['data_ready', 'start_work']
  });

  console.log(`📨 Agent B received ${messages.length} message(s):\n`);

  for (const msg of messages) {
    console.log('   Message ID:', msg.id);
    console.log('   From:', msg.senderId.substring(0, 8) + '...');
    console.log('   Action:', msg.action);
    console.log('   Payload:', JSON.stringify(msg.payload, null, 2));
    console.log('   Priority:', msg.priority);
    console.log('   Received at:', msg.createdAt);
    console.log();

    // Process message
    if (msg.action === 'data_ready') {
      console.log('   ✅ Processing data...');

      // Agent B processes data and replies
      await send({
        senderId: agentB.id,
        recipientId: msg.senderId,
        action: 'analysis_complete',
        payload: {
          datasetId: msg.payload.datasetId,
          insights: ['Trend detected', 'Anomaly found at record 456'],
          confidence: 0.92
        },
        priority: 'normal',
        expiresAt: null,
        metadata: {}
      });

      console.log('   📤 Sent reply to Agent A\n');
    }

    // Mark message as processed
    await markProcessed(msg.id);
  }

  // Step 4: Agent A receives reply
  console.log('📥 Agent A checking for reply...\n');

  const replies = await receive(agentA.id, { limit: 10 });

  for (const reply of replies) {
    console.log('   Reply from Agent B:');
    console.log('   Action:', reply.action);
    console.log('   Insights:', reply.payload.insights);
    console.log('   Confidence:', reply.payload.confidence);
    console.log();

    await markProcessed(reply.id);
  }

  // Step 5: Real-time subscription example
  console.log('📡 Setting up real-time subscription for Agent B...\n');

  const subscription = await subscribe(
    agentB.id,
    async (message) => {
      console.log('🔔 Real-time message received!');
      console.log('   Action:', message.action);
      console.log('   From:', message.senderId.substring(0, 8) + '...');
      console.log('   Payload:', message.payload);

      // Auto-process message
      await markProcessed(message.id);
    },
    {
      actions: ['data_ready', 'urgent_request'],
      priorities: ['critical', 'high']
    }
  );

  console.log('✅ Subscription active for Agent B');
  console.log('   Listening for: data_ready, urgent_request');
  console.log('   Priorities: critical, high\n');

  // Step 6: Test subscription with urgent message
  console.log('📤 Sending urgent message to test subscription...\n');

  await send({
    senderId: agentA.id,
    recipientId: agentB.id,
    action: 'urgent_request',
    payload: { message: 'Immediate analysis needed!' },
    priority: 'critical',
    expiresAt: null,
    metadata: {}
  });

  // Wait for subscription to trigger
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n✅ Example complete!');
}

// Run example
messageQueueExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/03-message-queue.ts
```

**Expected Output:**
```
🚀 Example 3: Message Queue Communication

✅ Agent A (processor): a1b2c3d4-e5f6-7890-abcd-ef1234567890
✅ Agent B (analyzer): b2c3d4e5-f678-90ab-cdef-123456789012

📤 Agent A sending message to Agent B...

✅ Message sent

📥 Agent B checking for messages...

📨 Agent B received 1 message(s):

   Message ID: m1n2o3p4-q5r6-s7t8-u9v0-w1x2y3z4a5b6
   From: a1b2c3d4...
   Action: data_ready
   Payload: {
     "datasetId": "dataset-12345",
     "recordCount": 1000,
     "processingTime": 5.2,
     "status": "ready_for_analysis"
   }
   Priority: high
   Received at: 2025-11-21T10:30:00.000Z

   ✅ Processing data...
   📤 Sent reply to Agent A

📥 Agent A checking for reply...

   Reply from Agent B:
   Action: analysis_complete
   Insights: [ 'Trend detected', 'Anomaly found at record 456' ]
   Confidence: 0.92

📡 Setting up real-time subscription for Agent B...

✅ Subscription active for Agent B
   Listening for: data_ready, urgent_request
   Priorities: critical, high

📤 Sending urgent message to test subscription...

🔔 Real-time message received!
   Action: urgent_request
   From: a1b2c3d4...
   Payload: { message: 'Immediate analysis needed!' }

✅ Example complete!
```

---

### Example 4 (US4): Workspace Isolation

**Scenario:** Two agents modify the same file in isolation without conflicts.

```typescript
// File: examples/04-workspace-isolation.ts
import { spawn, getStatus } from './src/api/agent-api';
import {
  createWorkspace,
  getWorkspaceDiff,
  listFileModifications,
  mergeWorkspace
} from './src/api/workspace-api';

async function workspaceIsolationExample() {
  console.log('🚀 Example 4: Workspace Isolation\n');

  // Step 1: Spawn two agents with different tasks on same file
  const agentA = await spawn({
    role: 'feature-developer',
    task: 'Add user authentication feature to src/app.ts',
    budget: 40000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  const agentB = await spawn({
    role: 'performance-optimizer',
    task: 'Add caching layer to src/app.ts',
    budget: 40000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Agent A (auth feature):', agentA.id);
  console.log('   Workspace:', agentA.workspace.worktreePath);
  console.log();
  console.log('✅ Agent B (caching):', agentB.id);
  console.log('   Workspace:', agentB.workspace.worktreePath);
  console.log();

  // Step 2: Verify workspaces are isolated
  console.log('🔒 Verifying workspace isolation...\n');

  const workspaceA = agentA.workspace;
  const workspaceB = agentB.workspace;

  console.log('Agent A workspace:');
  console.log('   Path:', workspaceA.worktreePath);
  console.log('   Branch:', workspaceA.branchName);
  console.log('   Base commit:', workspaceA.baseCommitSha);
  console.log();

  console.log('Agent B workspace:');
  console.log('   Path:', workspaceB.worktreePath);
  console.log('   Branch:', workspaceB.branchName);
  console.log('   Base commit:', workspaceB.baseCommitSha);
  console.log();

  // Step 3: Wait for both agents to complete work
  console.log('⏳ Waiting for agents to complete work...\n');

  let statusA, statusB;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    statusA = await getStatus(agentA.id);
    statusB = await getStatus(agentB.id);

    console.log(`[${attempts + 1}] Agent A: ${statusA.state}, Agent B: ${statusB.state}`);

    if (
      (statusA.state === 'completed' || statusA.state === 'failed') &&
      (statusB.state === 'completed' || statusB.state === 'failed')
    ) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }
  console.log();

  // Step 4: Review changes from each agent
  console.log('📝 Agent A changes:\n');

  const diffA = await getWorkspaceDiff(workspaceA.id);
  console.log('   Files modified:', diffA.filesModified.length);
  console.log('   Lines added:', diffA.linesAdded);
  console.log('   Lines removed:', diffA.linesRemoved);
  console.log('   Files:', diffA.filesModified.join(', '));
  console.log();

  const modsA = await listFileModifications(workspaceA.id);
  for (const mod of modsA) {
    console.log(`   - ${mod.filePath}: ${mod.modificationType} (${mod.linesAdded} added, ${mod.linesRemoved} removed)`);
  }
  console.log();

  console.log('📝 Agent B changes:\n');

  const diffB = await getWorkspaceDiff(workspaceB.id);
  console.log('   Files modified:', diffB.filesModified.length);
  console.log('   Lines added:', diffB.linesAdded);
  console.log('   Lines removed:', diffB.linesRemoved);
  console.log('   Files:', diffB.filesModified.join(', '));
  console.log();

  const modsB = await listFileModifications(workspaceB.id);
  for (const mod of modsB) {
    console.log(`   - ${mod.filePath}: ${mod.modificationType} (${mod.linesAdded} added, ${mod.linesRemoved} removed)`);
  }
  console.log();

  // Step 5: Demonstrate isolation (changes don't conflict)
  console.log('🔒 Isolation verification:\n');
  console.log('   ✅ Agent A made changes to src/app.ts in workspace A');
  console.log('   ✅ Agent B made changes to src/app.ts in workspace B');
  console.log('   ✅ No conflicts detected - workspaces are isolated!');
  console.log();

  // Step 6: Merge Agent A's work first
  console.log('🔀 Merging Agent A changes to main branch...\n');

  const mergeResultA = await mergeWorkspace(workspaceA.id, 'main', {
    strategy: 'recursive',
    deleteBranchAfterMerge: false  // Keep branch for review
  });

  if (mergeResultA.status === 'success') {
    console.log('   ✅ Agent A changes merged successfully');
    console.log('   Commit SHA:', mergeResultA.commitSha);
  } else if (mergeResultA.status === 'conflicts') {
    console.log('   ⚠️  Merge conflicts detected:');
    for (const conflict of mergeResultA.conflicts || []) {
      console.log(`      - ${conflict.filePath}`);
    }
  }
  console.log();

  // Step 7: Attempt to merge Agent B's work
  console.log('🔀 Merging Agent B changes to main branch...\n');

  const mergeResultB = await mergeWorkspace(workspaceB.id, 'main', {
    strategy: 'recursive',
    deleteBranchAfterMerge: false
  });

  if (mergeResultB.status === 'success') {
    console.log('   ✅ Agent B changes merged successfully');
    console.log('   Commit SHA:', mergeResultB.commitSha);
  } else if (mergeResultB.status === 'conflicts') {
    console.log('   ⚠️  Merge conflicts detected (expected - both modified same file):');
    for (const conflict of mergeResultB.conflicts || []) {
      console.log(`      - ${conflict.filePath}`);
      console.log(`        Lines: ${conflict.conflictStart}-${conflict.conflictEnd}`);
    }
    console.log();
    console.log('   💡 Conflicts can be resolved manually or by spawning a resolver agent');
  }
  console.log();

  console.log('✅ Example complete!');
  console.log('\n📚 Key Takeaways:');
  console.log('   1. Each agent works in isolated Git worktree');
  console.log('   2. Agents can modify same files without interfering');
  console.log('   3. Changes are merged independently to main branch');
  console.log('   4. Conflicts are detected and can be resolved systematically');
}

// Run example
workspaceIsolationExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/04-workspace-isolation.ts
```

---

### Example 5 (US5): Budget Tracking

**Scenario:** Track budget allocation, consumption, and reclamation across hierarchy.

```typescript
// File: examples/05-budget-tracking.ts
import { spawn, terminate } from './src/api/agent-api';
import {
  allocate,
  consume,
  reclaim,
  getBudget,
  getBudgetHierarchy,
  getConsumptionHistory
} from './src/api/budget-api';

async function budgetTrackingExample() {
  console.log('🚀 Example 5: Budget Tracking\n');

  // Step 1: Spawn parent agent with budget
  const parent = await spawn({
    role: 'project-manager',
    task: 'Coordinate development team',
    budget: 200000,
    depthLevel: 0,
    parentId: null,
    mode: 'single'
  });

  console.log('✅ Parent agent spawned:', parent.id);
  console.log('💰 Initial budget:', parent.budget, 'tokens\n');

  // Check initial budget
  const parentBudget1 = await getBudget(parent.id);
  console.log('📊 Parent budget details:');
  console.log('   Allocated:', parentBudget1.allocated);
  console.log('   Used:', parentBudget1.used);
  console.log('   Reserved:', parentBudget1.reserved);
  console.log('   Remaining:', parentBudget1.remaining);
  console.log();

  // Step 2: Parent allocates budget to child 1
  console.log('💸 Allocating 60,000 tokens to child 1...\n');

  await allocate(parent.id, 'child-1-id', 60000);

  const child1 = await spawn({
    role: 'backend-developer',
    task: 'Implement REST API',
    budget: 60000,
    depthLevel: 1,
    parentId: parent.id,
    mode: 'single'
  });

  console.log('✅ Child 1 spawned:', child1.id);

  const parentBudget2 = await getBudget(parent.id);
  console.log('💰 Parent budget after Child 1 allocation:');
  console.log('   Remaining:', parentBudget2.remaining, 'tokens');
  console.log('   Reserved for children:', parentBudget2.reserved, 'tokens');
  console.log();

  // Step 3: Parent allocates budget to child 2
  console.log('💸 Allocating 50,000 tokens to child 2...\n');

  await allocate(parent.id, 'child-2-id', 50000);

  const child2 = await spawn({
    role: 'frontend-developer',
    task: 'Build user interface',
    budget: 50000,
    depthLevel: 1,
    parentId: parent.id,
    mode: 'single'
  });

  console.log('✅ Child 2 spawned:', child2.id);

  const parentBudget3 = await getBudget(parent.id);
  console.log('💰 Parent budget after Child 2 allocation:');
  console.log('   Remaining:', parentBudget3.remaining, 'tokens');
  console.log('   Reserved for children:', parentBudget3.reserved, 'tokens');
  console.log();

  // Step 4: Children consume budget
  console.log('⚡ Simulating child 1 consuming tokens...\n');

  await consume(child1.id, {
    tokensUsed: 15000,
    costUsd: 0.45,
    model: 'claude-sonnet-4-5',
    breakdown: {
      inputTokens: 9000,
      outputTokens: 6000
    },
    operation: 'api_implementation',
    metadata: { endpoint: '/api/users', method: 'POST' }
  });

  const child1Budget1 = await getBudget(child1.id);
  console.log('💰 Child 1 budget after consumption:');
  console.log('   Allocated:', child1Budget1.allocated);
  console.log('   Used:', child1Budget1.used);
  console.log('   Remaining:', child1Budget1.remaining);
  console.log();

  // More consumption
  await consume(child1.id, {
    tokensUsed: 12000,
    costUsd: 0.36,
    model: 'claude-sonnet-4-5',
    breakdown: {
      inputTokens: 7000,
      outputTokens: 5000
    },
    operation: 'testing',
    metadata: { testType: 'integration' }
  });

  const child1Budget2 = await getBudget(child1.id);
  console.log('💰 Child 1 budget after second consumption:');
  console.log('   Used:', child1Budget2.used);
  console.log('   Remaining:', child1Budget2.remaining);
  console.log();

  // Step 5: View consumption history
  console.log('📜 Child 1 consumption history:\n');

  const history = await getConsumptionHistory(child1.id);
  for (const record of history) {
    console.log(`   [${record.timestamp}]`);
    console.log(`   Operation: ${record.operation}`);
    console.log(`   Tokens: ${record.tokensUsed}`);
    console.log(`   Cost: $${record.costUsd}`);
    console.log(`   Model: ${record.model}`);
    console.log();
  }

  // Step 6: View budget hierarchy
  console.log('📊 Complete budget hierarchy:\n');

  const hierarchy = await getBudgetHierarchy(parent.id);
  printBudgetHierarchy(hierarchy, 0);

  // Step 7: Child 1 completes and budget is reclaimed
  console.log('✅ Child 1 completing work...\n');

  const reclaimedAmount = await reclaim(child1.id);
  console.log('💰 Budget reclaimed from Child 1:', reclaimedAmount, 'tokens');
  console.log('   (Unused portion returned to parent)');
  console.log();

  const parentBudget4 = await getBudget(parent.id);
  console.log('💰 Parent budget after Child 1 reclamation:');
  console.log('   Reserved:', parentBudget4.reserved, 'tokens (decreased)');
  console.log('   Remaining:', parentBudget4.remaining, 'tokens (increased)');
  console.log();

  // Step 8: Parent terminates child 2 (reclaims full allocation)
  console.log('🛑 Parent terminating Child 2 early...\n');

  await terminate(child2.id, 'Project priorities changed');

  const reclaimedAmount2 = await reclaim(child2.id);
  console.log('💰 Budget reclaimed from Child 2:', reclaimedAmount2, 'tokens');
  console.log('   (Full allocation returned since child used nothing)');
  console.log();

  const parentBudgetFinal = await getBudget(parent.id);
  console.log('💰 Parent final budget:');
  console.log('   Allocated:', parentBudgetFinal.allocated);
  console.log('   Used:', parentBudgetFinal.used);
  console.log('   Reserved:', parentBudgetFinal.reserved);
  console.log('   Remaining:', parentBudgetFinal.remaining);
  console.log();

  console.log('✅ Example complete!');
  console.log('\n📚 Key Takeaways:');
  console.log('   1. Budget flows hierarchically from parent to children');
  console.log('   2. Token consumption is tracked in real-time');
  console.log('   3. Unused budget is reclaimed when agents complete');
  console.log('   4. Parents can terminate children and recover allocations');
  console.log('   5. Budget integrity maintained at 100% accuracy');
}

// Helper to print budget hierarchy
function printBudgetHierarchy(node: any, indent: number) {
  const prefix = '  '.repeat(indent) + (indent > 0 ? '├─ ' : '');
  console.log(`${prefix}Agent ${node.agentId.substring(0, 8)}...`);
  console.log(`${prefix}   Allocated: ${node.allocated}, Used: ${node.used}, Remaining: ${node.remaining}`);

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      printBudgetHierarchy(child, indent + 1);
    }
  }
}

// Run example
budgetTrackingExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/05-budget-tracking.ts
```

---

### Example 6 (US6): Workflow Composition

**Scenario:** Use workflow template to build a feature with coordinated sub-agents.

```typescript
// File: examples/06-workflow-composition.ts
import {
  loadTemplate,
  instantiateTemplate,
  validateWorkflow,
  createWorkflow,
  getWorkflowProgress
} from './src/api/workflow-api';

async function workflowCompositionExample() {
  console.log('🚀 Example 6: Workflow Composition\n');

  // Step 1: Load a pre-built workflow template
  console.log('📋 Loading "backend-dev-workflow" template...\n');

  const template = await loadTemplate('backend-dev-workflow');

  console.log('✅ Template loaded:', template.name);
  console.log('   Description:', template.description);
  console.log('   Nodes:', template.nodeTemplates.length);
  console.log('   Estimated budget:', template.totalEstimatedBudget, 'tokens');
  console.log('   Complexity:', template.complexityRating, '/10');
  console.log();

  console.log('📊 Template structure:\n');
  for (const node of template.nodeTemplates) {
    console.log(`   ${node.position}. ${node.role} (${node.budgetPercentage}%)`);
    console.log(`      Task: ${node.taskTemplate}`);
    console.log(`      Dependencies: ${node.dependencies.join(', ') || 'none'}`);
    console.log();
  }

  // Step 2: Instantiate template with specific task
  console.log('🔨 Instantiating template for "User Authentication Service"...\n');

  const graph = await instantiateTemplate(template.id, {
    task: 'Build user authentication service with JWT',
    budget: 200000,
    variables: {
      feature: 'authentication',
      framework: 'Express',
      database: 'PostgreSQL'
    }
  });

  console.log('✅ Workflow graph created:', graph.id);
  console.log('   Total nodes:', graph.totalNodes);
  console.log('   Total edges:', graph.totalEdges);
  console.log('   Estimated budget:', graph.estimatedBudget, 'tokens');
  console.log();

  // Step 3: Validate workflow before execution
  console.log('🔍 Validating workflow graph...\n');

  const validation = await validateWorkflow(graph);

  if (validation.isValid) {
    console.log('✅ Workflow is valid!');
    console.log('   ✓ No circular dependencies');
    console.log('   ✓ All roles are defined');
    console.log('   ✓ Budget is sufficient');
    console.log('   ✓ Graph is properly formed');
  } else {
    console.error('❌ Workflow validation failed:');
    for (const error of validation.errors) {
      console.error(`   - ${error.code}: ${error.message}`);
    }
    return; // Exit if invalid
  }
  console.log();

  // Step 4: Create workflow agent (spawns all sub-agents internally)
  console.log('🚀 Creating workflow agent...\n');

  const workflowAgent = await createWorkflow({
    workflowGraph: graph,
    task: 'Build user authentication service with JWT',
    budget: 200000,
    parentId: null,
    depthLevel: 0
  });

  console.log('✅ Workflow agent created:', workflowAgent.id);
  console.log('   Mode: workflow (coordinates 4 internal sub-agents)');
  console.log('   Status:', workflowAgent.status);
  console.log();

  // Step 5: Monitor workflow progress
  console.log('⏳ Monitoring workflow execution...\n');

  let progress;
  let attempts = 0;
  const maxAttempts = 120; // 4 minutes max

  while (attempts < maxAttempts) {
    progress = await getWorkflowProgress(graph.id);

    console.log(`[${attempts + 1}] Workflow status: ${progress.status}`);
    console.log(`   Nodes: ${progress.nodeStats.completed}/${progress.nodeStats.total} completed`);
    console.log(`   Budget: ${progress.budgetStats.percentUsed}% used (${progress.budgetStats.used}/${progress.budgetStats.allocated})`);
    console.log(`   Current nodes executing: ${progress.nodeStats.running}`);
    console.log();

    // Show node-by-node status
    for (const node of progress.nodes) {
      const status = node.status === 'completed' ? '✅' :
                     node.status === 'running' ? '⚙️' :
                     node.status === 'failed' ? '❌' : '⏳';
      console.log(`   ${status} ${node.role}: ${node.status}`);
      if (node.budgetUsed > 0) {
        console.log(`      Budget used: ${node.budgetUsed} tokens`);
      }
    }
    console.log();

    if (progress.status === 'completed' || progress.status === 'failed') {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  // Step 6: Review final results
  if (progress.status === 'completed') {
    console.log('✅ Workflow completed successfully!\n');

    console.log('📊 Final Statistics:');
    console.log('   Total time:', Math.round(progress.executionTime / 1000), 'seconds');
    console.log('   Nodes completed:', progress.nodeStats.completed);
    console.log('   Total budget used:', progress.budgetStats.used, 'tokens');
    console.log('   Budget efficiency:', Math.round(100 - progress.budgetStats.percentUsed), '% saved');
    console.log();

    console.log('📝 Node Results:\n');
    for (const node of progress.nodes) {
      console.log(`   ${node.role}:`);
      console.log(`     Status: ${node.status}`);
      console.log(`     Budget: ${node.budgetUsed} / ${node.budgetAllocated} tokens`);
      if (node.result) {
        console.log(`     Output: ${node.result.summary}`);
      }
      console.log();
    }
  } else if (progress.status === 'failed') {
    console.error('❌ Workflow failed!\n');

    console.error('Failed nodes:');
    for (const node of progress.nodes) {
      if (node.status === 'failed') {
        console.error(`   - ${node.role}: ${node.errorMessage}`);
      }
    }
  }

  console.log('✅ Example complete!');
  console.log('\n📚 Key Takeaways:');
  console.log('   1. Workflow templates define reusable composition patterns');
  console.log('   2. Templates are instantiated with specific tasks and budgets');
  console.log('   3. Workflow validation ensures graph correctness before execution');
  console.log('   4. Workflow agents coordinate multiple sub-agents internally');
  console.log('   5. Progress tracking shows node-by-node execution status');
  console.log('   6. Parallel nodes execute concurrently for efficiency');
}

// Run example
workflowCompositionExample().catch(console.error);
```

**Run it:**
```bash
npx ts-node examples/06-workflow-composition.ts
```

**Expected Output:**
```
🚀 Example 6: Workflow Composition

📋 Loading "backend-dev-workflow" template...

✅ Template loaded: Backend Development Workflow
   Description: Standard backend development with architecture, implementation, testing, and review
   Nodes: 4
   Estimated budget: 200000 tokens
   Complexity: 7.5 /10

📊 Template structure:

   0. architect (20%)
      Task: Design system architecture for: {TASK}
      Dependencies: none

   1. implementer (50%)
      Task: Implement according to architecture: {TASK}
      Dependencies: architect

   2. tester (20%)
      Task: Test implementation: {TASK}
      Dependencies: implementer

   3. reviewer (10%)
      Task: Review code quality: {TASK}
      Dependencies: tester

🔨 Instantiating template for "User Authentication Service"...

✅ Workflow graph created: wf-a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Total nodes: 4
   Total edges: 3
   Estimated budget: 200000 tokens

🔍 Validating workflow graph...

✅ Workflow is valid!
   ✓ No circular dependencies
   ✓ All roles are defined
   ✓ Budget is sufficient
   ✓ Graph is properly formed

🚀 Creating workflow agent...

✅ Workflow agent created: agent-b2c3d4e5-f678-90ab-cdef-123456789012
   Mode: workflow (coordinates 4 internal sub-agents)
   Status: running

⏳ Monitoring workflow execution...

[1] Workflow status: running
   Nodes: 0/4 completed
   Budget: 5% used (10000/200000)
   Current nodes executing: 1

   ⚙️ architect: running
   ⏳ implementer: pending
   ⏳ tester: pending
   ⏳ reviewer: pending

[15] Workflow status: running
   Nodes: 1/4 completed
   Budget: 25% used (50000/200000)
   Current nodes executing: 1

   ✅ architect: completed
      Budget used: 40000 tokens
   ⚙️ implementer: running
   ⏳ tester: pending
   ⏳ reviewer: pending

[45] Workflow status: running
   Nodes: 2/4 completed
   Budget: 75% used (150000/200000)
   Current nodes executing: 1

   ✅ architect: completed
      Budget used: 40000 tokens
   ✅ implementer: completed
      Budget used: 100000 tokens
   ⚙️ tester: running
   ⏳ reviewer: pending

[60] Workflow status: completed
   Nodes: 4/4 completed
   Budget: 95% used (190000/200000)
   Current nodes executing: 0

   ✅ architect: completed
   ✅ implementer: completed
   ✅ tester: completed
   ✅ reviewer: completed

✅ Workflow completed successfully!

📊 Final Statistics:
   Total time: 120 seconds
   Nodes completed: 4
   Total budget used: 190000 tokens
   Budget efficiency: 5% saved

📝 Node Results:

   architect:
     Status: completed
     Budget: 40000 / 40000 tokens
     Output: System architecture designed with JWT authentication, PostgreSQL database, and Express middleware

   implementer:
     Status: completed
     Budget: 100000 / 100000 tokens
     Output: Implemented JWT authentication with user registration, login, token refresh, and password reset

   tester:
     Status: completed
     Budget: 40000 / 40000 tokens
     Output: Created 25 unit tests and 8 integration tests with 95% code coverage

   reviewer:
     Status: completed
     Budget: 10000 / 20000 tokens
     Output: Code review complete - no major issues, suggested minor refactoring for error handling

✅ Example complete!

📚 Key Takeaways:
   1. Workflow templates define reusable composition patterns
   2. Templates are instantiated with specific tasks and budgets
   3. Workflow validation ensures graph correctness before execution
   4. Workflow agents coordinate multiple sub-agents internally
   5. Progress tracking shows node-by-node execution status
   6. Parallel nodes execute concurrently for efficiency
```

---

## Testing Your Setup

### Test 1: Health Check

Verify the server is running:

```bash
curl http://localhost:3000/api/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-21T10:00:00.000Z",
  "database": "connected",
  "messageQueue": "active"
}
```

### Test 2: Database Connection

Verify database is accessible:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM agents;"
```

**Expected:**
```
 count
-------
     0
(1 row)
```

### Test 3: Spawn Simple Agent

Verify agent spawning works:

```bash
curl -X POST http://localhost:3000/api/agents/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "role": "test-agent",
    "task": "Create a test.txt file with content: Hello World",
    "budget": 5000
  }'
```

**Expected:**
```json
{
  "success": true,
  "agent": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "test-agent",
    "status": "created",
    "budget": 5000
  }
}
```

### Test 4: Run Integration Tests

Run the full test suite:

```bash
npm run test
```

**Expected:**
```
 ✓ src/tests/agent-api.test.ts (10 tests) 2500ms
 ✓ src/tests/budget-api.test.ts (8 tests) 1800ms
 ✓ src/tests/message-api.test.ts (6 tests) 1200ms
 ✓ src/tests/workspace-api.test.ts (7 tests) 3000ms
 ✓ src/tests/workflow-api.test.ts (6 tests) 2200ms

Test Files  5 passed (5)
     Tests  37 passed (37)
  Start at  10:00:00
  Duration  10.7s
```

### Test 5: Verify Workspace Isolation

Check worktrees are created correctly:

```bash
# Spawn an agent
AGENT_ID=$(curl -s -X POST http://localhost:3000/api/agents/spawn \
  -H "Content-Type: application/json" \
  -d '{"role":"tester","task":"Test workspace","budget":5000}' \
  | jq -r '.agent.id')

# Verify workspace exists
ls -la /tmp/agent-workspaces/agent-$AGENT_ID/

# Check git worktree
git worktree list
```

**Expected:**
```
/path/to/main/repo           abc1234 [main]
/tmp/agent-workspaces/agent-550e8400  def5678 [agent-550e8400-feature]
```

---

## Common Patterns

### Pattern 1: Error Handling

Always wrap agent operations in try-catch:

```typescript
import { spawn, getStatus } from './src/api/agent-api';
import { AgentError, BudgetExceededError } from './src/errors';

async function safeSpawn() {
  try {
    const agent = await spawn({
      role: 'developer',
      task: 'Build feature',
      budget: 50000
    });

    console.log('Agent spawned:', agent.id);
    return agent;

  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.error('Insufficient budget:', error.message);
      // Handle budget error (request more, reschedule, etc.)
    } else if (error instanceof AgentError) {
      console.error('Agent error:', error.message);
      // Handle agent-specific error
    } else {
      console.error('Unexpected error:', error);
      // Handle unexpected error
    }

    throw error; // Re-throw if needed
  }
}
```

### Pattern 2: Polling Agent Status

Poll agent status with exponential backoff:

```typescript
import { getStatus } from './src/api/agent-api';

async function waitForCompletion(agentId: string, maxWaitMs: number = 300000) {
  const startTime = Date.now();
  let delay = 1000; // Start with 1 second
  const maxDelay = 10000; // Max 10 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getStatus(agentId);

    if (status.state === 'completed') {
      return { success: true, status };
    } else if (status.state === 'failed') {
      return { success: false, status };
    }

    // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }

  throw new Error(`Agent ${agentId} did not complete within ${maxWaitMs}ms`);
}
```

### Pattern 3: Checkpointing Long-Running Agents

Create checkpoints at milestones:

```typescript
import { createCheckpoint, restoreCheckpoint } from './src/api/workspace-api';

async function longRunningTask(agentId: string, workspaceId: string) {
  try {
    // Checkpoint at start
    await createCheckpoint(workspaceId, {
      type: 'milestone',
      label: 'task_started',
      description: 'Agent began long-running task'
    });

    // Do work phase 1
    performPhase1();

    // Checkpoint at phase 1 complete
    await createCheckpoint(workspaceId, {
      type: 'milestone',
      label: 'phase_1_complete',
      description: 'Completed data processing phase'
    });

    // Do work phase 2
    performPhase2();

    // Checkpoint at phase 2 complete
    await createCheckpoint(workspaceId, {
      type: 'milestone',
      label: 'phase_2_complete',
      description: 'Completed analysis phase'
    });

  } catch (error) {
    console.error('Task failed, can restore from last checkpoint');

    // Restore from latest checkpoint
    const checkpoints = await listCheckpoints(workspaceId);
    const latest = checkpoints[checkpoints.length - 1];
    await restoreCheckpoint(workspaceId, latest.id);

    // Retry from checkpoint
    throw error;
  }
}
```

### Pattern 4: Budget Monitoring with Alerts

Monitor budget and alert when low:

```typescript
import { getBudget } from './src/api/budget-api';

async function monitorBudget(agentId: string, alertThreshold: number = 0.8) {
  const checkInterval = 5000; // Check every 5 seconds

  const intervalId = setInterval(async () => {
    try {
      const budget = await getBudget(agentId);
      const percentUsed = budget.used / budget.allocated;

      if (percentUsed >= alertThreshold) {
        console.warn(`⚠️  Agent ${agentId} has used ${Math.round(percentUsed * 100)}% of budget!`);
        console.warn(`   Remaining: ${budget.remaining} tokens`);

        // Send alert (email, Slack, etc.)
        sendBudgetAlert(agentId, percentUsed, budget.remaining);
      }

      if (budget.remaining <= 0) {
        console.error(`❌ Agent ${agentId} has exhausted budget!`);
        clearInterval(intervalId);
      }

    } catch (error) {
      console.error('Error monitoring budget:', error);
    }
  }, checkInterval);

  return intervalId; // Return so caller can clear interval
}
```

### Pattern 5: Optimizing Budget Allocation

Allocate budget proportionally based on task complexity:

```typescript
import { spawn } from './src/api/agent-api';
import { allocate } from './src/api/budget-api';

async function optimizedTeamSpawning(parentId: string, totalBudget: number) {
  // Estimate complexity for each role
  const tasks = [
    { role: 'architect', complexity: 0.2, task: 'Design system' },
    { role: 'implementer', complexity: 0.5, task: 'Write code' },
    { role: 'tester', complexity: 0.2, task: 'Test code' },
    { role: 'reviewer', complexity: 0.1, task: 'Review code' }
  ];

  // Allocate budget proportionally
  const agents = [];
  for (const { role, complexity, task } of tasks) {
    const budget = Math.floor(totalBudget * complexity);

    await allocate(parentId, `child-${role}-id`, budget);

    const agent = await spawn({
      role,
      task,
      budget,
      depthLevel: 1,
      parentId
    });

    console.log(`Spawned ${role} with ${budget} tokens (${complexity * 100}% of total)`);
    agents.push(agent);
  }

  return agents;
}
```

---

## Troubleshooting

### Issue 1: Database Connection Failed

**Error:**
```
Error: connection to server at "localhost" (127.0.0.1), port 5432 failed
```

**Solutions:**

1. Verify PostgreSQL is running:
   ```bash
   # macOS
   brew services list | grep postgresql

   # Linux
   sudo systemctl status postgresql

   # Check connection
   psql -U postgres -c "SELECT 1"
   ```

2. Check connection string in `.env`:
   ```bash
   cat .env | grep DATABASE_URL
   ```

3. Verify database exists:
   ```bash
   psql -U postgres -l | grep agent_orchestration
   ```

4. Create database if missing:
   ```bash
   createdb agent_orchestration
   ```

### Issue 2: Agent Spawn Fails

**Error:**
```
AgentError: Failed to create workspace
```

**Solutions:**

1. Check workspace directory exists and is writable:
   ```bash
   ls -la /tmp/agent-workspaces/
   mkdir -p /tmp/agent-workspaces/
   chmod 755 /tmp/agent-workspaces/
   ```

2. Verify git is available:
   ```bash
   git --version
   which git
   ```

3. Check git repository is initialized:
   ```bash
   git status
   git log --oneline -1
   ```

4. Review agent spawn logs:
   ```bash
   tail -f logs/agent-orchestration.log
   ```

### Issue 3: Budget Exceeded Error

**Error:**
```
BudgetExceededError: Insufficient budget for allocation
```

**Solutions:**

1. Check parent agent's available budget:
   ```typescript
   import { getBudget, getAvailable } from './src/api/budget-api';

   const available = await getAvailable('parent-agent-id');
   console.log('Available budget:', available);
   ```

2. Reduce child allocation amount:
   ```typescript
   // Instead of:
   await allocate(parentId, childId, 100000);

   // Try:
   await allocate(parentId, childId, 50000);
   ```

3. Reclaim budget from completed children:
   ```typescript
   import { reclaim } from './src/api/budget-api';

   const reclaimed = await reclaim('completed-child-id');
   console.log('Reclaimed:', reclaimed, 'tokens');
   ```

### Issue 4: Message Queue Not Working

**Error:**
```
MessageError: No messages received
```

**Solutions:**

1. Verify message queue is initialized:
   ```bash
   curl http://localhost:3000/api/health | jq '.messageQueue'
   ```

2. Check PostgreSQL LISTEN/NOTIFY is enabled:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM pg_listening_channels();"
   ```

3. Test message send/receive manually:
   ```typescript
   import { send, receive } from './src/api/message-api';

   // Send test message
   await send({
     senderId: 'test-sender',
     recipientId: 'test-recipient',
     action: 'test',
     payload: { test: true },
     priority: 'normal'
   });

   // Receive test message
   const messages = await receive('test-recipient');
   console.log('Received:', messages.length, 'messages');
   ```

4. Check message table in database:
   ```bash
   psql $DATABASE_URL -c "SELECT id, sender_id, recipient_id, status FROM messages ORDER BY created_at DESC LIMIT 10;"
   ```

### Issue 5: Workflow Validation Fails

**Error:**
```
WorkflowValidationError: Circular dependency detected
```

**Solutions:**

1. Review workflow graph structure:
   ```typescript
   import { validateWorkflow } from './src/api/workflow-api';

   const validation = await validateWorkflow(graph);
   if (!validation.isValid) {
     console.log('Errors:', validation.errors);
   }
   ```

2. Check for circular dependencies:
   ```
   Example circular dependency:
   Node A depends on Node B
   Node B depends on Node C
   Node C depends on Node A  <-- CYCLE!
   ```

3. Fix by removing cycle:
   ```typescript
   // Remove the edge that creates cycle
   // or restructure workflow to be acyclic
   ```

4. Validate roles exist:
   ```bash
   psql $DATABASE_URL -c "SELECT DISTINCT role FROM agents;"
   ```

### Issue 6: Workspace Merge Conflicts

**Error:**
```
MergeError: Merge conflict in src/app.ts
```

**Solutions:**

1. Review conflict details:
   ```typescript
   import { mergeWorkspace } from './src/api/workspace-api';

   const result = await mergeWorkspace(workspaceId, 'main');

   if (result.status === 'conflicts') {
     console.log('Conflicts:', result.conflicts);
   }
   ```

2. Resolve manually:
   ```bash
   cd /tmp/agent-workspaces/agent-{id}

   # View conflict
   git status
   cat src/app.ts

   # Resolve conflict manually
   vim src/app.ts

   # Mark as resolved
   git add src/app.ts
   git commit -m "Resolve merge conflict"
   ```

3. Or spawn resolver agent:
   ```typescript
   const resolver = await spawn({
     role: 'conflict-resolver',
     task: `Resolve merge conflict in ${conflictFile}`,
     budget: 20000,
     parentId: originalAgentId
   });
   ```

---

## Next Steps

Congratulations on completing the quickstart! Here's what to explore next:

### 1. Read Full Documentation

- **[Data Model](./data-model.md)** - Complete database schema and entity relationships
- **[API Contracts](./contracts/)** - Detailed API specifications for all modules
- **[Feature Specification](./spec.md)** - Complete feature requirements and user stories

### 2. Advanced Features

- **Auto Task Decomposition**: Let LLM analyze tasks and generate workflow graphs automatically
  ```typescript
  import { decomposeTask } from './src/api/workflow-api';

  const graph = await decomposeTask({
    task: 'Build full-stack e-commerce platform',
    budget: 500000,
    complexity: 'high'
  });
  ```

- **Budget Enforcement**: Set hard limits and automatic agent termination
  ```typescript
  import { setBudgetLimits } from './src/api/budget-api';

  await setBudgetLimits(agentId, {
    maxTokens: 100000,
    maxCostUsd: 3.00,
    alertThresholds: [0.5, 0.75, 0.9]
  });
  ```

- **Checkpoint-based Resume**: Resume agents from checkpoints after failures
  ```typescript
  import { restoreCheckpoint } from './src/api/workspace-api';

  await restoreCheckpoint(workspaceId, checkpointId);
  ```

### 3. Build Custom Workflows

Create your own workflow templates:

```typescript
import { saveTemplate } from './src/api/workflow-api';

const customTemplate = await saveTemplate({
  name: 'ml-model-workflow',
  description: 'Machine learning model development workflow',
  category: 'machine-learning',
  nodeTemplates: [
    {
      nodeId: 'data-engineer',
      role: 'data-engineer',
      taskTemplate: 'Prepare dataset for: {TASK}',
      budgetPercentage: 20,
      dependencies: [],
      position: 0
    },
    {
      nodeId: 'ml-engineer',
      role: 'ml-engineer',
      taskTemplate: 'Train model for: {TASK}',
      budgetPercentage: 50,
      dependencies: ['data-engineer'],
      position: 1
    },
    {
      nodeId: 'evaluator',
      role: 'evaluator',
      taskTemplate: 'Evaluate model performance: {TASK}',
      budgetPercentage: 20,
      dependencies: ['ml-engineer'],
      position: 2
    },
    {
      nodeId: 'deployer',
      role: 'deployer',
      taskTemplate: 'Deploy model to production: {TASK}',
      budgetPercentage: 10,
      dependencies: ['evaluator'],
      position: 3
    }
  ],
  edgePatterns: [
    { source: 'data-engineer', target: 'ml-engineer', dependencyType: 'sequential' },
    { source: 'ml-engineer', target: 'evaluator', dependencyType: 'sequential' },
    { source: 'evaluator', target: 'deployer', dependencyType: 'sequential' }
  ],
  totalEstimatedBudget: 300000,
  complexityRating: 8.5
});
```

### 4. Integrate with External Systems

- **CI/CD Integration**: Trigger agents on git push, PR creation
- **Slack/Discord Bots**: Chat interface for spawning agents
- **Webhook Endpoints**: Integrate with Linear, Jira, GitHub
- **Monitoring**: Send metrics to DataDog, Prometheus

### 5. Production Deployment

- Set up production PostgreSQL (managed service recommended)
- Configure environment variables for production
- Set up logging and monitoring
- Implement rate limiting and authentication
- Configure backup and disaster recovery

### 6. Community & Support

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share patterns
- **Contributing**: Submit PRs for improvements
- **Documentation**: Help improve guides and examples

---

## Quick Reference

### Key Commands

```bash
# Setup
npm install                    # Install dependencies
npm run build                  # Build TypeScript
npm run migrate                # Run database migrations

# Development
npm run dev                    # Start dev server with auto-reload
npm run typecheck              # Check TypeScript types
npm run test                   # Run tests
npm run test:watch             # Run tests in watch mode

# Database
psql $DATABASE_URL             # Connect to database
npm run db:reset               # Reset database (WARNING: deletes all data)
npm run db:seed                # Seed test data
```

### Key Endpoints

```bash
# Health & Status
GET  /api/health               # Health check
GET  /api/status               # System status

# Agents
POST /api/agents/spawn         # Spawn new agent
GET  /api/agents/:id           # Get agent details
GET  /api/agents/:id/status    # Get agent status
POST /api/agents/:id/terminate # Terminate agent
GET  /api/agents/:id/hierarchy # Get agent hierarchy

# Messages
POST /api/messages/send        # Send message
GET  /api/messages/:agentId    # Get messages for agent

# Budget
GET  /api/budget/:agentId      # Get budget details
POST /api/budget/allocate      # Allocate budget to child
POST /api/budget/consume       # Record budget consumption

# Workflows
POST /api/workflows/create     # Create workflow agent
GET  /api/workflows/:id        # Get workflow details
GET  /api/workflows/:id/progress # Get workflow progress
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agent_orchestration

# Server
PORT=3000
NODE_ENV=development

# Agent Configuration
DEFAULT_AGENT_BUDGET=100000
MAX_HIERARCHY_DEPTH=10
WORKSPACE_BASE_PATH=/tmp/agent-workspaces
```

---

**You're all set!** Start spawning agents and building autonomous AI systems. Refer back to this guide anytime you need help.

For more information, see the [complete system documentation](./README.md).
