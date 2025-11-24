# Phase 9: Agent Execution Layer - Design Document

## Overview

Phase 9 adds the **execution layer** that makes agents actually perform tasks. Currently agents are just database records with metadata - they don't execute anything. This phase bridges the orchestration system with actual work execution.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────┐
│  AgentExecutor                              │
│  - execute(agent): Runs the agent's task   │
│  - Uses Claude Agent SDK                    │
└─────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────┐
│  Claude Agent SDK (query)                   │
│  - Manages LLM conversation                 │
│  - Handles tool execution                   │
│  - Returns results                          │
└─────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────┐
│  Built-in Tools                             │
│  - Bash: Execute commands                   │
│  - Read: Read files                         │
│  - Write: Write files                       │
│  - Edit: Edit files                         │
│  - Git operations                           │
└─────────────────────────────────────────────┘
```

### Integration with Existing System

```typescript
// AgentService spawns agent
const agentId = await agentService.spawnAgent(parentId, role, task, workspace);

// NEW: AgentExecutor runs the agent
const executor = new AgentExecutor();
const result = await executor.execute(agentId);

// Update agent with result
await agentService.updateAgentStatus(agentId, 'completed', result);
```

### Workspace Isolation

Each agent executes in its own workspace:

```
multi-agent-builder/
├── .worktrees/
│   ├── agent-{id}-{timestamp}/   ← Agent 1's workspace
│   ├── agent-{id}-{timestamp}/   ← Agent 2's workspace
│   └── ...
```

The executor runs Claude Agent SDK with `cwd` set to the agent's workspace directory.

## Implementation Plan

### 1. AgentExecutor Class

**File**: `src/execution/AgentExecutor.ts`

```typescript
export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  tokensUsed: number;
  durationMs: number;
}

export class AgentExecutor {
  async execute(agentId: string): Promise<AgentResult> {
    // 1. Load agent from database
    const agent = await this.agentRepo.findById(agentId);

    // 2. Get agent's workspace directory
    const workspace = agent.workspace_path;

    // 3. Create Claude Agent SDK query
    const query = sdk.query({
      prompt: agent.task_description,
      options: {
        cwd: workspace,
        model: 'claude-3-5-sonnet-20241022',
        maxTurns: 10,
        permissionMode: 'acceptEdits',
      }
    });

    // 4. Execute and collect results
    let output = '';
    for await (const message of query) {
      if (message.type === 'assistant') {
        output += extractText(message);
      }
      if (message.type === 'result') {
        return {
          success: !message.is_error,
          output: message.result,
          tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
          durationMs: message.duration_ms,
        };
      }
    }
  }
}
```

### 2. Integration Points

**Update AgentService** (`src/services/AgentService.ts`):

```typescript
async runAgent(agentId: string): Promise<void> {
  // Mark as active
  await this.updateAgent(agentId, { status: 'active' });

  try {
    // NEW: Execute the agent
    const executor = new AgentExecutor();
    const result = await executor.execute(agentId);

    // Store result and mark completed
    await this.updateAgent(agentId, {
      status: 'completed',
      result: result.output,
      completed_at: new Date(),
    });

    // Notify workflow engine
    await this.workflowEngine.processCompletedNode(agentId, { output: result.output });

  } catch (error) {
    await this.updateAgent(agentId, {
      status: 'failed',
      error_message: error.message,
    });
  }
}
```

### 3. Automatic Execution Trigger

**Option A: Background Worker** (Recommended)

```typescript
export class AgentExecutionWorker {
  private pollIntervalMs = 5000;

  async pollOnce(): Promise<void> {
    // Find pending agents
    const pendingAgents = await this.agentRepo.findByStatus('pending');

    for (const agent of pendingAgents) {
      // Run agent asynchronously
      this.agentService.runAgent(agent.id).catch(err => {
        logger.error({ agentId: agent.id, error: err }, 'Agent execution failed');
      });
    }
  }
}
```

**Option B: Immediate Spawn-and-Run**

```typescript
async spawnAgent(...): Promise<string> {
  const agentId = await this.createAgent(...);

  // Immediately start execution in background
  this.runAgent(agentId).catch(err => {
    logger.error({ agentId, error: err }, 'Agent execution failed');
  });

  return agentId;
}
```

## Dogfooding Test Plan

### Test 1: Single Agent File Write

```typescript
const agentId = await agentService.spawnAgent(
  null, // no parent
  'file-writer',
  'Create a file called hello.txt with the content "Hello from agent!"',
  '/path/to/.worktrees/test-workspace'
);

await agentService.runAgent(agentId);

// Verify: hello.txt exists with correct content
```

### Test 2: Parent-Child Execution

```typescript
// Parent writes spec
const parentId = await agentService.spawnAgent(
  null,
  'spec-writer',
  'Create a specification document for a calculator function in spec.md',
  workspace1
);
await agentService.runAgent(parentId);

// Child implements from spec
const childId = await agentService.spawnAgent(
  parentId,
  'implementer',
  'Read spec.md and implement the calculator function in calculator.js',
  workspace2
);
await agentService.runAgent(childId);
```

### Test 3: Workflow Execution

```typescript
// Create workflow: Design → Implement → Test
const graphId = await workflowService.createGraph(null, 'calculator-workflow');

await workflowService.addNode(graphId, 'design', 'Write calculator spec', []);
await workflowService.addNode(graphId, 'implement', 'Implement calculator', ['design']);
await workflowService.addNode(graphId, 'test', 'Write tests', ['implement']);

// Start workflow
await workflowEngine.executeWorkflow(graphId, parentAgentId);

// Wait for completion (WorkflowPoller + AgentExecutionWorker handle rest)
```

## Success Criteria

1. ✅ Single agent can execute and write files
2. ✅ Agent execution happens in isolated workspace
3. ✅ Agent results stored in database
4. ✅ Parent-child execution works
5. ✅ Workflow composition triggers agent execution
6. ✅ Can dogfood: Use system to build a simple feature

## Next Steps After Phase 9

- **Phase 10**: Advanced tool system (git, npm, testing)
- **Phase 11**: Agent communication (read parent outputs)
- **Phase 12**: Production hardening (timeouts, retries, scaling)
- **Dogfooding**: Use system to build Phase 10!

---

**Status**: Ready for implementation
**Estimated Effort**: 4-6 hours
**Blockers**: None - Claude Agent SDK installed
