# Dogfooding Guide: Using the Multi-Agent System

This guide shows you how to use the multi-agent orchestration system with full monitoring and tracing capabilities.

## Prerequisites

1. **Database**: PostgreSQL running with `multi_agent_builder_test` database
2. **API Key**: Anthropic API key set in `.env` file
3. **Build**: Run `npm run build` to compile TypeScript

## Quick Start

### 1. Run the Simple Demo (No API Key Required)

This demonstrates agent spawning, budgets, and workspace isolation:

```bash
npm run demo
```

You'll see:
- ✅ Parent agent spawned with 100k token budget
- ✅ Child agent spawned (50k tokens reserved from parent)
- ✅ Workspaces created in `.worktrees/`
- ✅ Hierarchical budget management working

### 2. Start Real-Time Monitoring

Open two terminal windows:

**Terminal 1 - HTTP Monitoring Server:**
```bash
npm run monitor:server
```

- Opens HTTP API on `http://localhost:3001`
- Visit `http://localhost:3001` in browser
- API endpoints:
  - `GET /agents` - List all agents
  - `GET /agents/:id` - Agent details with traces
  - `GET /stream` - Real-time SSE updates

**Terminal 2 - CLI Monitor:**
```bash
npm run monitor:cli
```

- Live terminal dashboard refreshing every 2 seconds
- Shows all agents with status, tokens, progress bars
- Displays recent activity and budget summary
- Press Ctrl+C to exit

## Monitoring Features

### What You Can See

#### Agent Status Dashboard
```
╔═══════════════════════════════════════════════════════╗
║ Agent ID   │ Role        │ Status    │ Tokens │ Progress ║
╠═══════════════════════════════════════════════════════╣
║ abc-123    │ spec-writer │ executing │ 1250   │ ▓▓▓▓░░░░ ║
║ def-456    │ implementer │ completed │ 3420   │ ▓▓▓▓▓▓▓▓ ║
╚═══════════════════════════════════════════════════════╝
```

#### Recent Activity
```
📝 Recent Activity:
──────────────────────────────────────────────────────────
  [14:23:45] assistant      : I will create a specification document...
  [14:23:50] tool_use       : Tool requested: Write
  [14:23:52] assistant      : The specification has been written...
```

#### Budget Tracking
```
💰 Budget Summary:
──────────────────────────────────────────────────────────
  Total Allocated:  150,000 tokens
  Total Used:       4,670 tokens (3.1%)
  Total Reserved:   50,000 tokens
  Available:        95,330 tokens
```

### Detailed Agent Information

Query specific agent via HTTP API:

```bash
curl http://localhost:3001/agents/[agent-id] | jq
```

Returns:
- **Agent info**: role, status, budget, workspace
- **Traces**: Every SDK message captured
- **Tool usage**: All tool calls with inputs/outputs
- **Decisions**: Reasoning and decision-making process
- **Events**: Timeline of lifecycle events

## Using with Actual Execution (Requires API Key)

### Set Up API Key

```bash
# Add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

### Test Agent Execution

```bash
# Run dogfooding test with actual agent execution
npm test tests/dogfooding/01-simple-file-write.test.ts
```

This will:
1. Spawn a `file-writer` agent
2. Agent executes autonomously using Claude SDK
3. Creates `hello.txt` in isolated workspace
4. All traces, decisions, tool usage recorded
5. Visible in monitoring dashboard

### Watch It Live

1. Start monitoring: `npm run monitor:cli` in one terminal
2. Run test in another terminal
3. Watch real-time as agent:
   - Changes from `pending` → `executing` → `completed`
   - Token usage increments
   - Recent activity shows tool calls
   - Budget updated

## Database Schema

### Monitoring Tables

**agent_traces** - Every SDK message
```sql
SELECT * FROM agent_traces WHERE agent_id = '[id]' ORDER BY trace_index;
```

**agent_tool_usage** - All tool calls
```sql
SELECT tool_name, tool_input, execution_time_ms
FROM agent_tool_usage
WHERE agent_id = '[id]';
```

**agent_decisions** - Reasoning and decisions
```sql
SELECT decision_type, reasoning, action_taken
FROM agent_decisions
WHERE agent_id = '[id]';
```

**agent_events** - Lifecycle timeline
```sql
SELECT event_type, message, timestamp
FROM agent_events
WHERE agent_id = '[id]'
ORDER BY timestamp;
```

### Monitoring View

```sql
SELECT * FROM agent_monitoring_view;
```

Combines agents, budgets, workspaces, and counts for quick dashboard queries.

## Building Your Own Workflows

### Simple Parent-Child Example

```typescript
import { AgentService } from './src/services/AgentService';

const service = new AgentService();

// Spawn parent
const parentId = await service.spawnAgent(
  'spec-writer',
  'Write a spec for a TODO app',
  100000
);

// Spawn child (reserves tokens from parent)
const childId = await service.spawnAgent(
  'implementer',
  'Implement the TODO app from parent spec',
  50000,
  parentId  // parent ID
);

// Execute them
await service.runAgent(parentId);
await service.runAgent(childId);
```

### Workflow DAG Example

```typescript
import { WorkflowService, WorkflowEngine } from './src/services';

const workflowService = new WorkflowService();

// Create workflow graph
const graphId = await workflowService.createWorkflowGraph(
  'my-workflow',
  'Build something cool'
);

// Add nodes with dependencies
const node1 = await workflowService.addNode(graphId, {
  role: 'spec-writer',
  task_description: 'Write spec',
  budget_allocation: 10000,
  dependencies: [],
});

const node2 = await workflowService.addNode(graphId, {
  role: 'implementer',
  task_description: 'Implement from spec',
  budget_allocation: 30000,
  dependencies: [node1],  // Depends on node1
});

// Execute workflow (spawns nodes in topological order)
const engine = new WorkflowEngine();
await engine.executeWorkflow(graphId, orchestratorAgentId);

// WorkflowPoller automatically continues when nodes complete
```

## Troubleshooting

### No agents showing in monitor?

```bash
# Check database connection
psql -h localhost -U [user] -d multi_agent_builder_test -c "SELECT COUNT(*) FROM agents;"

# Check if agents exist
npm run demo  # This creates agents
```

### Monitoring server won't start?

```bash
# Check if port 3001 is already in use
lsof -i :3001

# Use different port
PORT=3002 npm run monitor:server
```

### Traces not appearing?

- Traces only created during agent **execution** (not just spawning)
- Requires Anthropic API key for actual execution
- Check: `SELECT COUNT(*) FROM agent_traces;`

## Next Steps

1. **Build a Real Application**: Use agents to collaboratively build a TODO app, calculator, or any multi-file project
2. **Monitor Everything**: Watch decision-making, tool usage, budget consumption in real-time
3. **Analyze Performance**: Query traces to understand agent behavior and optimize prompts
4. **Scale Up**: Create complex workflows with 5+ agents working in parallel

## Example: Complete Dogfooding Session

```bash
# Terminal 1: Start monitoring
npm run monitor:server

# Terminal 2: Watch in real-time
npm run monitor:cli

# Terminal 3: Run actual work
npm test tests/dogfooding/01-simple-file-write.test.ts

# Terminal 4: Query specific agent
curl http://localhost:3001/agents/[agent-id] | jq '.decisions'
```

---

**You now have full observability into your multi-agent system!** 🎉

Every decision, every tool call, every token spent is tracked and visible. Use this to:
- Debug agent behavior
- Optimize prompts and budgets
- Understand collaboration patterns
- Build confidence in autonomous systems
