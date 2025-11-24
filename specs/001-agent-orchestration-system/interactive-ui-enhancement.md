# Interactive UI Enhancement - Human-in-the-Loop Architecture

**Created**: 2025-11-22
**Status**: Architecture Design
**Priority**: P1 - Critical Differentiator

## Overview

**Key Differentiator from claude-flow**: Our system provides a **conversational, real-time UI** that allows humans to naturally interact with the root agent and monitor the entire agent hierarchy.

## Problem Statement

Current multi-agent systems (like claude-flow) lack:
1. **Real-time visibility** into agent hierarchy and execution
2. **Natural conversation interface** with the root agent
3. **Interactive intervention** - pause, redirect, or provide feedback mid-execution
4. **Visual debugging** - see what each agent is doing in real-time
5. **Human approval gates** - require human confirmation for critical decisions

## Solution: Interactive Agent Control Interface (IACI)

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Web UI (React/Terminal)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Chat Panel  │  │ Agent Tree   │  │ Budget Monitor   │   │
│  │ (with Root) │  │ (Real-time)  │  │ (Live Updates)   │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                    WebSocket / SSE
                            │
┌─────────────────────────────────────────────────────────────┐
│              Interactive Session Manager                     │
│  - Bidirectional messaging                                   │
│  - Real-time event streaming                                 │
│  - Human approval workflows                                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Root Agent                              │
│  - Receives human messages via interactive session           │
│  - Spawns child agents based on conversation                 │
│  - Streams progress updates to UI                            │
│  - Pauses for human approval when needed                     │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         [Child Agent] [Child Agent] [Child Agent]
```

### Core Features

#### 1. Conversational Root Agent Interface
```typescript
// Human sends message to root agent
await session.sendMessage({
  to: 'root-agent',
  content: 'Build a REST API for user authentication',
  mode: 'conversational' // or 'approval-required'
});

// Root agent responds conversationally
{
  from: 'root-agent',
  content: "I'll break this into 3 sub-agents: API designer, implementer, and tester. Shall I proceed?",
  suggestedActions: ['approve', 'modify', 'cancel']
}
```

#### 2. Real-Time Agent Hierarchy Visualization
```typescript
{
  rootAgent: {
    id: 'agent-001',
    status: 'executing',
    currentTask: 'Coordinating authentication API build',
    children: [
      {
        id: 'agent-002',
        role: 'API Designer',
        status: 'completed',
        progress: 100,
        output: 'OpenAPI spec created'
      },
      {
        id: 'agent-003',
        role: 'Backend Implementer',
        status: 'executing',
        progress: 45,
        currentFile: 'src/auth/controller.ts'
      }
    ]
  }
}
```

#### 3. Interactive Approval Gates
```typescript
// Agent requests human approval
await rootAgent.requestApproval({
  question: 'I want to delete 50 obsolete files. Proceed?',
  context: {
    files: ['file1.ts', 'file2.ts', ...],
    reason: 'Refactoring to new structure'
  },
  timeout: 300000 // 5 minutes, then auto-reject
});

// Human responds via UI
await session.respondToApproval('approval-123', {
  decision: 'approved',
  modifications: 'Skip config files'
});
```

#### 4. Live Event Streaming
```typescript
// Stream all agent events to UI
session.on('agent.spawned', (event) => {
  // Update UI with new agent in tree
});

session.on('agent.progress', (event) => {
  // Update progress bar
});

session.on('agent.message', (event) => {
  // Show inter-agent communication
});

session.on('budget.updated', (event) => {
  // Update budget visualization
});
```

#### 5. Human Intervention Controls
```typescript
// Pause entire hierarchy
await session.pauseAgent('agent-001', { cascade: true });

// Inject message to specific agent
await session.injectMessage('agent-003', {
  from: 'human',
  content: 'Use JWT instead of sessions for auth'
});

// Terminate misbehaving agent
await session.terminateAgent('agent-004', {
  reason: 'Taking too long',
  reclaimBudget: true
});
```

## Technical Implementation

### New Components

1. **InteractiveSession** (`src/interactive/InteractiveSession.ts`)
   - Manages bidirectional communication
   - WebSocket server for real-time updates
   - Session persistence and reconnection

2. **ApprovalGate** (`src/interactive/ApprovalGate.ts`)
   - Queue human approval requests
   - Timeout handling
   - Response validation

3. **EventStreamer** (`src/interactive/EventStreamer.ts`)
   - Broadcast agent events to connected clients
   - Filter by session/agent
   - Event replay for reconnections

4. **Web UI** (`ui/` - React/Next.js)
   - Chat interface with root agent
   - Real-time agent tree visualization (React Flow)
   - Budget monitor dashboard
   - Approval request panel

### Database Schema Additions

```sql
-- Interactive sessions
CREATE TABLE interactive_sessions (
  id UUID PRIMARY KEY,
  root_agent_id UUID REFERENCES agents(id),
  user_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP,
  status session_status -- active, paused, completed
);

-- Human approval requests
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES interactive_sessions(id),
  agent_id UUID REFERENCES agents(id),
  question TEXT NOT NULL,
  context JSONB,
  status approval_status, -- pending, approved, rejected, timeout
  requested_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  response JSONB
);

-- Event stream
CREATE TABLE agent_events (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES interactive_sessions(id),
  agent_id UUID REFERENCES agents(id),
  event_type VARCHAR(50), -- spawned, progress, completed, error
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

```typescript
// REST API
POST   /api/sessions                    // Create new interactive session
GET    /api/sessions/:id                // Get session details
POST   /api/sessions/:id/messages       // Send message to root agent
GET    /api/sessions/:id/tree           // Get agent hierarchy
POST   /api/sessions/:id/approvals/:id  // Respond to approval request
POST   /api/sessions/:id/pause          // Pause session
DELETE /api/sessions/:id/agents/:id     // Terminate agent

// WebSocket
WS     /ws/sessions/:id                 // Real-time event stream
```

## User Experience Flow

### Example: Building a Feature

1. **User opens UI, starts chat with root agent**
   ```
   User: "Build a REST API for managing todos"
   ```

2. **Root agent responds conversationally**
   ```
   Root: "I'll create a todo management API. I'll spawn:
   - Database schema designer
   - API implementation agent
   - Testing agent

   This will use about 50,000 tokens. Proceed?"

   [Approve] [Modify Plan] [Cancel]
   ```

3. **User approves, sees real-time hierarchy**
   ```
   Root Agent [executing]
   ├─ Schema Designer [completed] ✓
   ├─ API Implementer [45% complete] ⚙️
   │  └─ Current: src/routes/todos.ts
   └─ Tester [waiting]

   Budget: 25,000 / 50,000 tokens used
   ```

4. **Agent requests approval mid-execution**
   ```
   API Implementer: "Should I add pagination to the list endpoint?
   This will add 5 minutes but improve performance."

   [Yes] [No] [Ask me later]
   ```

5. **User sees completion and reviews results**
   ```
   Root: "✓ Todo API complete!
   - 5 endpoints implemented
   - 15 tests passing (100% coverage)
   - Swagger docs generated

   Files modified: src/routes/todos.ts, src/models/Todo.ts, tests/todos.test.ts

   [Review Code] [Deploy] [Make Changes]
   ```

## Key Differentiators vs claude-flow

| Feature | claude-flow | Our System |
|---------|-------------|------------|
| **Human Interaction** | Fire-and-forget | Conversational, bidirectional |
| **Visibility** | Logs only | Real-time visual hierarchy |
| **Control** | Start/stop only | Pause, redirect, inject messages |
| **Approval Gates** | None | Built-in human approval workflow |
| **UI** | CLI only | Web UI + CLI |
| **Debugging** | Parse logs | Visual debugger with live updates |
| **Intervention** | Kill process | Graceful pause/modify/resume |

## Implementation Priority

### Phase 1 (MVP) - Add to existing US1
- Basic InteractiveSession manager
- WebSocket event streaming
- Simple CLI-based chat (before web UI)

### Phase 2 - After US1-US3
- Web UI with React
- Agent tree visualization
- Budget monitoring dashboard

### Phase 3 - After US6 (Workflows)
- Approval gates
- Human intervention controls
- Session persistence and replay

## Technical Considerations

### Performance
- WebSocket connection pooling
- Event batching for high-frequency updates
- Lazy loading for large agent trees

### Security
- Session authentication (JWT)
- Rate limiting on human messages
- Approval timeout enforcement

### Scalability
- Redis pub/sub for multi-instance WebSocket
- Event stream pagination
- Archive old sessions to cold storage

## Success Metrics

- **SC-014**: Human can chat with root agent with <100ms latency
- **SC-015**: Agent hierarchy updates in real-time (<500ms lag)
- **SC-016**: Approval requests timeout gracefully (100% reliability)
- **SC-017**: UI supports 10+ concurrent sessions per instance

## Next Steps

1. Add InteractiveSession to spec.md as **User Story 7 (P1)**
2. Update tasks.md with interactive UI tasks
3. Implement basic CLI chat in Phase 3 (with US1)
4. Build web UI in Phase 4-5
5. Add approval gates in Phase 6

---

**This makes our system uniquely human-friendly and production-ready for real-world use cases where oversight and collaboration are essential.**
