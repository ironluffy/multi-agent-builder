# Multi-Agent Orchestration System - Architecture Documentation

## Table of Contents
1. [High-Level System Architecture](#high-level-system-architecture)
2. [Database Schema](#database-schema)
3. [Service Layer Architecture](#service-layer-architecture)
4. [Agent Hierarchy & Budget Flow](#agent-hierarchy--budget-flow)
5. [Message Queue System](#message-queue-system)
6. [Workspace Isolation](#workspace-isolation)
7. [Data Flow Diagrams](#data-flow-diagrams)

---

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MULTI-AGENT ORCHESTRATION SYSTEM                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   CLI Tool   │  │  REST API    │  │  GraphQL API │  │  WebSocket   │   │
│  │   (Future)   │  │  (Future)    │  │  (Future)    │  │  (Future)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CORE BUSINESS LAYER                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Agent Core (Agent.ts)                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │    │
│  │  │ spawnAgent() │  │ sendMessage()│  │ spawnSubordinate()       │ │    │
│  │  │              │  │              │  │ (hierarchical spawning)   │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SERVICE LAYER                                 │   │
│  │                                                                       │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐│   │
│  │  │ AgentService   │  │ BudgetService  │  │ HierarchyService       ││   │
│  │  │                │  │                │  │                        ││   │
│  │  │ • spawn        │  │ • allocate     │  │ • getHierarchyTree()  ││   │
│  │  │ • getStatus    │  │ • consume      │  │ • getAncestors()      ││   │
│  │  │ • update       │  │ • reclaim      │  │ • getDescendants()    ││   │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘│   │
│  │                                                                       │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐  │   │
│  │  │ MessageQueueService │  │ WorkspaceCleanupService             │  │   │
│  │  │ (SharedQueue)       │  │                                     │  │   │
│  │  │ • send()            │  │ • cleanupByStatus()                 │  │   │
│  │  │ • receive()         │  │ • startScheduler()                  │  │   │
│  │  │ • broadcast()       │  │ • runCleanupCycle()                 │  │   │
│  │  └─────────────────────┘  └─────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INFRASTRUCTURE LAYER                               │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐   │
│  │ SharedDatabase      │  │ GitWorktree         │  │ Logger (Pino)    │   │
│  │                     │  │                     │  │                  │   │
│  │ • initialize()      │  │ • createWorktree()  │  │ • info()         │   │
│  │ • query()           │  │ • deleteWorktree()  │  │ • error()        │   │
│  │ • transaction()     │  │ • getDiff()         │  │ • debug()        │   │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA ACCESS LAYER                               │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ AgentRepository  │  │ BudgetRepository │  │ HierarchyRepository     │  │
│  │                  │  │                  │  │                         │  │
│  │ • create()       │  │ • create()       │  │ • create()              │  │
│  │ • findById()     │  │ • getByAgentId() │  │ • getSubordinates()     │  │
│  │ • update()       │  │ • incrementUsed()│  │ • detectCycle()         │  │
│  │ • getHierarchy() │  │ • getRemainingBudget() │ • validateDepth() │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────────────┘  │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ MessageRepository│  │ WorkspaceRepo    │  │ CheckpointRepository    │  │
│  │                  │  │                  │  │                         │  │
│  │ • create()       │  │ • create()       │  │ • create()              │  │
│  │ • getPending()   │  │ • getByAgentId() │  │ • getByAgentId()        │  │
│  │ • updateStatus() │  │ • updateStatus() │  │ • restore()             │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PERSISTENCE LAYER                                 │
│                                                                              │
│                    ┌──────────────────────────────────┐                     │
│                    │      PostgreSQL 14+ Database      │                     │
│                    │                                  │                     │
│                    │  • agents                        │                     │
│                    │  • budgets (with triggers)       │                     │
│                    │  • hierarchies                   │                     │
│                    │  • messages                      │                     │
│                    │  • message_threads               │                     │
│                    │  • workspaces                    │                     │
│                    │  • checkpoints                   │                     │
│                    └──────────────────────────────────┘                     │
│                                                                              │
│                    ┌──────────────────────────────────┐                     │
│                    │      Git Worktree Storage        │                     │
│                    │                                  │                     │
│                    │  .worktrees/                     │                     │
│                    │    ├── agent-{uuid-1}/           │                     │
│                    │    ├── agent-{uuid-2}/           │                     │
│                    │    └── agent-{uuid-n}/           │                     │
│                    └──────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### Complete Entity-Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          DATABASE SCHEMA (PostgreSQL)                         │
└──────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┐
│          AGENTS                │
├────────────────────────────────┤
│ PK  id              UUID       │
│     role            VARCHAR    │
│     status          VARCHAR    │◄──────────┐
│     depth_level     INTEGER    │           │ Self-referencing
│ FK  parent_id       UUID       │───────────┘ for hierarchy
│     task_description TEXT      │
│     created_at      TIMESTAMP  │
│     updated_at      TIMESTAMP  │
│     completed_at    TIMESTAMP  │
└────────────────────────────────┘
         │ 1
         │
         │ N
         ▼
┌────────────────────────────────┐
│         BUDGETS                │
├────────────────────────────────┤
│ PK  id              UUID       │
│ FK  agent_id        UUID       │◄───────┐ One-to-one with agents
│     allocated       INTEGER    │        │
│     used            INTEGER    │        │
│     reserved        INTEGER    │        │
│     created_at      TIMESTAMP  │        │
│     updated_at      TIMESTAMP  │        │
└────────────────────────────────┘        │
         ▲                                 │
         │                                 │
         │ Database Triggers:              │
         │ ┌─────────────────────────────┐│
         │ │ allocate_child_budget()     ││
         │ │ - Reserves tokens from      ││
         │ │   parent when child created ││
         │ │                             ││
         │ │ reclaim_child_budget()      ││
         │ │ - Returns unused tokens to  ││
         │ │   parent on completion      ││
         │ └─────────────────────────────┘│
         │                                 │
┌────────────────────────────────┐        │
│       HIERARCHIES              │        │
├────────────────────────────────┤        │
│ PK  id              UUID       │        │
│ FK  parent_id       UUID       │────────┘
│ FK  child_id        UUID       │────────┐
│     relationship_type VARCHAR  │        │
│     created_at      TIMESTAMP  │        │
│                                │        │
│ UNIQUE(parent_id, child_id)    │        │
└────────────────────────────────┘        │
                                          │
┌────────────────────────────────┐        │
│         MESSAGES               │        │
├────────────────────────────────┤        │
│ PK  id              UUID       │        │
│ FK  from_agent_id   UUID       │────────┤
│ FK  to_agent_id     UUID       │────────┤
│ FK  thread_id       UUID       │───┐    │
│     payload         JSONB      │   │    │
│     priority        INTEGER    │   │    │
│     status          VARCHAR    │   │    │
│     created_at      TIMESTAMP  │   │    │
│     updated_at      TIMESTAMP  │   │    │
│                                │   │    │
│ INDEX(to_agent_id, status)     │   │    │
│ INDEX(priority DESC, created_at)│  │    │
└────────────────────────────────┘   │    │
                                     │    │
┌────────────────────────────────┐   │    │
│      MESSAGE_THREADS           │   │    │
├────────────────────────────────┤   │    │
│ PK  id              UUID       │◄──┘    │
│     title           VARCHAR    │        │
│     description     TEXT       │        │
│     participants    UUID[]     │        │
│     metadata        JSONB      │        │
│     status          VARCHAR    │        │
│     created_at      TIMESTAMP  │        │
│     updated_at      TIMESTAMP  │        │
│     closed_at       TIMESTAMP  │        │
└────────────────────────────────┘        │
                                          │
┌────────────────────────────────┐        │
│        WORKSPACES              │        │
├────────────────────────────────┤        │
│ PK  id              UUID       │        │
│ FK  agent_id        UUID       │────────┘
│     worktree_path   VARCHAR    │
│     branch_name     VARCHAR    │
│     isolation_status VARCHAR   │
│     created_at      TIMESTAMP  │
│     updated_at      TIMESTAMP  │
└────────────────────────────────┘
         │ 1
         │
         │ N
         ▼
┌────────────────────────────────┐
│       CHECKPOINTS              │
├────────────────────────────────┤
│ PK  id              UUID       │
│ FK  agent_id        UUID       │
│     state           JSONB      │
│     sequence_number INTEGER    │
│     created_at      TIMESTAMP  │
└────────────────────────────────┘
```

### Key Constraints & Triggers

```
┌───────────────────────────────────────────────────────────────────┐
│                    DATABASE CONSTRAINTS                           │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 1. FOREIGN KEY CONSTRAINTS:                                       │
│    • agents.parent_id → agents.id (ON DELETE CASCADE)             │
│    • budgets.agent_id → agents.id (ON DELETE CASCADE)             │
│    • hierarchies.parent_id → agents.id (ON DELETE CASCADE)        │
│    • hierarchies.child_id → agents.id (ON DELETE CASCADE)         │
│    • messages.from_agent_id → agents.id                           │
│    • messages.to_agent_id → agents.id                             │
│    • workspaces.agent_id → agents.id (ON DELETE CASCADE)          │
│                                                                   │
│ 2. UNIQUE CONSTRAINTS:                                            │
│    • budgets(agent_id) - One budget per agent                     │
│    • hierarchies(parent_id, child_id) - No duplicate relationships│
│    • workspaces(agent_id) - One workspace per agent               │
│                                                                   │
│ 3. CHECK CONSTRAINTS:                                             │
│    • budgets: allocated >= 0                                      │
│    • budgets: used >= 0                                           │
│    • budgets: reserved >= 0                                       │
│    • budgets: used + reserved <= allocated                        │
│    • agents: depth_level >= 0 AND depth_level <= 5               │
│    • agents: status IN ('pending','running','completed',...)      │
│    • message_threads: array_length(participants, 1) >= 2         │
│                                                                   │
│ 4. DATABASE TRIGGERS:                                             │
│                                                                   │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │ TRIGGER: allocate_child_budget()                        │   │
│    │ FIRES: AFTER INSERT ON budgets                          │   │
│    │                                                         │   │
│    │ LOGIC:                                                  │   │
│    │   1. Get parent agent ID from hierarchies               │   │
│    │   2. Reserve NEW.allocated tokens in parent's budget    │   │
│    │   3. UPDATE parent SET reserved = reserved + allocated  │   │
│    │   4. Validate parent has sufficient budget              │   │
│    └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │ TRIGGER: reclaim_child_budget()                         │   │
│    │ FIRES: AFTER UPDATE ON agents                           │   │
│    │ WHEN: status changes to completed/failed/terminated     │   │
│    │                                                         │   │
│    │ LOGIC:                                                  │   │
│    │   1. Get parent agent ID                                │   │
│    │   2. Get child's budget (allocated, used)               │   │
│    │   3. Calculate unused = allocated - used                │   │
│    │   4. UPDATE parent SET reserved = reserved - unused     │   │
│    │   5. Returns unused tokens to parent                    │   │
│    └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │ TRIGGER: update_updated_at_column()                     │   │
│    │ FIRES: BEFORE UPDATE ON all tables                      │   │
│    │                                                         │   │
│    │ LOGIC:                                                  │   │
│    │   SET NEW.updated_at = CURRENT_TIMESTAMP                │   │
│    └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Service Layer Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER ARCHITECTURE                          │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            AgentService                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC API:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async spawnAgent(role, task, tokenLimit, parentId?) → agentId     │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. Validate tokenLimit > 0                                       │    │
│  │   2. If parentId provided:                                         │    │
│  │      - Query parent's budget                                       │    │
│  │      - Validate available budget >= tokenLimit                     │    │
│  │      - Calculate child depth_level = parent.depth + 1              │    │
│  │   3. BEGIN TRANSACTION                                             │    │
│  │      - INSERT INTO agents (...)                                    │    │
│  │      - INSERT INTO budgets (agent_id, allocated=tokenLimit)        │    │
│  │        → TRIGGER allocate_child_budget() fires                     │    │
│  │        → Parent's reserved += tokenLimit                           │    │
│  │   4. COMMIT TRANSACTION                                            │    │
│  │   5. Create Git worktree (async, non-blocking)                     │    │
│  │   6. Create workspace record                                       │    │
│  │   7. Return agentId                                                │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async getAgentStatus(agentId) → Agent                              │    │
│  │ async updateAgentStatus(agentId, status) → void                    │    │
│  │   → When status = 'completed':                                     │    │
│  │      TRIGGER reclaim_child_budget() fires automatically            │    │
│  │ async getBudget(agentId) → Budget                                  │    │
│  │ async getChildAgents(parentId) → Agent[]                           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DEPENDENCIES:                                                               │
│  • GitWorktree (for workspace isolation)                                    │
│  • WorkspaceRepository (for workspace CRUD)                                 │
│  • SharedDatabase (for transactions)                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           BudgetService                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC API:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async allocateFromParent(parentId, childId, tokens)                │    │
│  │   → {parent: Budget, child: Budget}                                │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. BEGIN TRANSACTION                                             │    │
│  │   2. SELECT * FROM budgets WHERE agent_id = parentId FOR UPDATE    │    │
│  │   3. Validate available = allocated - used - reserved >= tokens    │    │
│  │   4. INSERT INTO budgets (agent_id=childId, allocated=tokens)      │    │
│  │      → TRIGGER allocate_child_budget() fires                       │    │
│  │      → UPDATE parent SET reserved = reserved + tokens              │    │
│  │   5. COMMIT TRANSACTION                                            │    │
│  │   6. Return both budgets                                           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async consumeTokens(agentId, tokens) → Budget                      │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. Get remaining budget                                          │    │
│  │   2. Validate remaining >= tokens                                  │    │
│  │   3. UPDATE budgets SET used = used + tokens                       │    │
│  │      WHERE agent_id = agentId                                      │    │
│  │        AND used + tokens + reserved <= allocated                   │    │
│  │   4. Return updated budget                                         │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async reclaimBudget(childId) → {parent: Budget, child: Budget}    │    │
│  │                                                                     │    │
│  │ Flow (Manual Reclamation):                                         │    │
│  │   1. BEGIN TRANSACTION                                             │    │
│  │   2. SELECT * FROM budgets WHERE agent_id = childId FOR UPDATE     │    │
│  │   3. Get parent_id from agents table                               │    │
│  │   4. Calculate unused = child.allocated - child.used               │    │
│  │   5. UPDATE parent SET reserved = reserved - unused                │    │
│  │   6. COMMIT TRANSACTION                                            │    │
│  │   7. Return both budgets                                           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DEPENDENCIES:                                                               │
│  • BudgetRepository (data access)                                           │
│  • SharedDatabase (transactions)                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         HierarchyService                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC API (15+ methods):                                                   │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async createRelationship(parentId, childId) → Hierarchy            │    │
│  │ async validateDepth(parentId) → boolean                            │    │
│  │ async detectCycle(parentId, childId) → boolean                     │    │
│  │                                                                     │    │
│  │ async getSubordinates(parentId, options?) → Agent[]                │    │
│  │   Options: { recursive, maxDepth, status }                         │    │
│  │                                                                     │    │
│  │ async getHierarchyTree(rootId, maxDepth?) → HierarchyNode          │    │
│  │   Returns nested tree structure:                                   │    │
│  │   {                                                                 │    │
│  │     id, role, status, depth_level,                                 │    │
│  │     children: [                                                     │    │
│  │       { id, role, children: [...] },                               │    │
│  │       { id, role, children: [...] }                                │    │
│  │     ]                                                               │    │
│  │   }                                                                 │    │
│  │                                                                     │    │
│  │ async getAncestorAgents(agentId) → Agent[]                         │    │
│  │   Returns [root, ..., immediate_parent]                            │    │
│  │                                                                     │    │
│  │ async getDescendantAgents(agentId, maxDepth?) → Agent[]            │    │
│  │   Returns all descendants in breadth-first order                   │    │
│  │                                                                     │    │
│  │ async getSiblingAgents(agentId) → Agent[]                          │    │
│  │ async getDirectChildren(parentId) → Agent[]                        │    │
│  │ async countSubordinates(parentId, recursive?) → number             │    │
│  │ async getMaxDepth(rootId) → number                                 │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DEPENDENCIES:                                                               │
│  • HierarchyRepository (recursive CTE queries)                              │
│  • AgentRepository (agent data)                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    SharedQueue (Message Queue Service)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC API:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async send(from, to, payload, priority?, threadId?) → Message      │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. Validate agents exist                                         │    │
│  │   2. INSERT INTO messages (from, to, payload, priority, thread_id) │    │
│  │   3. Set status = 'pending'                                        │    │
│  │   4. Return created message                                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async receive(agentId, limit?) → Message[]                         │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. SELECT * FROM messages                                        │    │
│  │      WHERE to_agent_id = agentId                                   │    │
│  │        AND status = 'pending'                                      │    │
│  │      ORDER BY priority DESC, created_at ASC  ← Priority + FIFO     │    │
│  │      LIMIT limit                                                   │    │
│  │   2. Return messages (no auto-update status)                       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async broadcast(from, toList[], payload, priority?, threadId?)     │    │
│  │   → Message[]                                                       │    │
│  │                                                                     │    │
│  │ Flow:                                                               │    │
│  │   1. For each recipient in toList:                                 │    │
│  │      - Create message to recipient                                 │    │
│  │   2. Return all created messages                                   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ async getConversation(agent1, agent2, limit?) → Message[]          │    │
│  │ async getPendingCount(agentId) → number                            │    │
│  │ async getStats(agentId) → { sent, received, pending }              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  DEPENDENCIES:                                                               │
│  • MessageRepository (CRUD operations)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Hierarchy & Budget Flow

### Hierarchical Agent Structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   3-LEVEL AGENT HIERARCHY EXAMPLE                           │
└────────────────────────────────────────────────────────────────────────────┘

                          ┌─────────────────────────────┐
                          │    ROOT COORDINATOR         │
                          │    depth_level: 0           │
                          │    ┌─────────────────────┐  │
                          │    │ Budget              │  │
                          │    │ allocated: 100,000  │  │
                          │    │ used:       5,000   │  │
                          │    │ reserved:  70,000   │  │
                          │    │ available: 25,000   │  │
                          │    └─────────────────────┘  │
                          └──────────┬──────────────────┘
                                     │
                   ┌─────────────────┴─────────────────┐
                   │                                   │
         ┌─────────▼──────────┐            ┌──────────▼─────────┐
         │  RESEARCHER        │            │  CODER             │
         │  depth_level: 1    │            │  depth_level: 1    │
         │  ┌──────────────┐  │            │  ┌──────────────┐  │
         │  │ Budget       │  │            │  │ Budget       │  │
         │  │ allocated: 30k│ │            │  │ allocated: 40k│ │
         │  │ used:     3k  │  │            │  │ used:     7k  │  │
         │  │ reserved: 25k │  │            │  │ reserved: 30k │  │
         │  │ available: 2k │  │            │  │ available: 3k │  │
         │  └──────────────┘  │            │  └──────────────┘  │
         └──────┬──────────┬──┘            └──────┬──────────┬──┘
                │          │                      │          │
       ┌────────▼──┐  ┌───▼────────┐    ┌────────▼──┐  ┌───▼────────┐
       │  Worker1.1│  │  Worker1.2 │    │  Worker2.1│  │  Worker2.2 │
       │  depth: 2 │  │  depth: 2  │    │  depth: 2 │  │  depth: 2  │
       │  ┌──────┐ │  │  ┌──────┐  │    │  ┌──────┐ │  │  ┌──────┐  │
       │  │ 10k  │ │  │  │ 15k  │  │    │  │ 20k  │ │  │  │ 10k  │  │
       │  │ used │ │  │  │ used │  │    │  │ used │ │  │  │ used │  │
       │  │ 8k   │ │  │  │ 12k  │  │    │  │ 15k  │ │  │  │ 6k   │  │
       │  └──────┘ │  │  └──────┘  │    │  └──────┘ │  │  └──────┘  │
       └───────────┘  └────────────┘    └───────────┘  └────────────┘

BUDGET ALLOCATION FLOW:
═════════════════════

Step 1: Root spawns Researcher (30k)
  Root.reserved: 0 → 30,000
  Root.available: 100k → 70k

Step 2: Root spawns Coder (40k)
  Root.reserved: 30k → 70,000
  Root.available: 70k → 30k

Step 3: Researcher spawns Worker1.1 (10k)
  Researcher.reserved: 0 → 10,000
  Researcher.available: 30k → 20k

Step 4: Researcher spawns Worker1.2 (15k)
  Researcher.reserved: 10k → 25,000
  Researcher.available: 20k → 5k

Step 5: Coder spawns Worker2.1 (20k)
  Coder.reserved: 0 → 20,000
  Coder.available: 40k → 20k

Step 6: Coder spawns Worker2.2 (10k)
  Coder.reserved: 20k → 30,000
  Coder.available: 20k → 10k

TOTAL SYSTEM BUDGET:
  Allocated: 100k (root)
  Used:      5k + 3k + 7k + 8k + 12k + 15k + 6k = 56k
  Reserved:  70k (at root level)
  Available: 30k (at root level)
```

### Budget Reclamation Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    BUDGET RECLAMATION ON COMPLETION                         │
└────────────────────────────────────────────────────────────────────────────┘

SCENARIO: Worker1.1 completes (allocated 10k, used 8k, unused 2k)

BEFORE RECLAMATION:
  ┌─────────────────────┐
  │  Researcher         │
  │  allocated:  30,000 │
  │  used:        3,000 │
  │  reserved:   25,000 │◄─── Includes 10k for Worker1.1
  │  available:   2,000 │
  └─────────────────────┘

TRIGGER FIRES: reclaim_child_budget()
  1. Detect Worker1.1 status changed to 'completed'
  2. Calculate unused = 10,000 - 8,000 = 2,000
  3. UPDATE Researcher SET reserved = 25,000 - 2,000 = 23,000

AFTER RECLAMATION:
  ┌─────────────────────┐
  │  Researcher         │
  │  allocated:  30,000 │
  │  used:        3,000 │
  │  reserved:   23,000 │◄─── Reduced by 2k (unused)
  │  available:   4,000 │◄─── Increased by 2k
  └─────────────────────┘

CASCADING RECLAMATION (when Researcher completes):
  Researcher allocated: 30,000
  Researcher used:       3,000
  Worker1.1 used:        8,000
  Worker1.2 used:       12,000
  ──────────────────────────────
  Total used:           23,000
  Unused:                7,000  ◄─── Returns to Root

Root budget after Researcher completes:
  reserved: 70,000 - 7,000 = 63,000
  available: 30,000 + 7,000 = 37,000
```

---

## 5. Message Queue System

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      MESSAGE QUEUE ARCHITECTURE                             │
└────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Message Priority & FIFO Queue                      │
└──────────────────────────────────────────────────────────────────────┘

Agent A sends messages with different priorities:

  ┌─────────────┐
  │   Agent A   │
  └──────┬──────┘
         │
         ├─► send(to: B, priority: 10, msg: "Critical")    [High Priority]
         ├─► send(to: B, priority: 5,  msg: "Normal-1")    [Medium]
         ├─► send(to: B, priority: 5,  msg: "Normal-2")    [Medium]
         ├─► send(to: B, priority: 0,  msg: "Low")         [Low Priority]
         │
         ▼
  ┌─────────────────────────────────────────────────────┐
  │            MESSAGE QUEUE (in database)              │
  │                                                     │
  │  ORDER BY priority DESC, created_at ASC             │
  │  ═════════════════════════════════════════════     │
  │                                                     │
  │  [1] priority: 10, created: T1  "Critical"         │
  │  [2] priority:  5, created: T2  "Normal-1"         │
  │  [3] priority:  5, created: T3  "Normal-2"         │
  │  [4] priority:  0, created: T4  "Low"              │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────┐
  │   Agent B   │  Receives messages in order: Critical → Normal-1 → Normal-2 → Low
  └─────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                      Message Thread Grouping                          │
└──────────────────────────────────────────────────────────────────────┘

Creating a conversation thread:

  Agent A, B, C want to collaborate on a feature:

  1. Create Thread:
     ┌────────────────────────────────────┐
     │  MessageThread                     │
     │  ─────────────────────────────     │
     │  id: "thread-123"                  │
     │  title: "Feature Discussion"       │
     │  participants: [A, B, C]           │
     │  status: "active"                  │
     └────────────────────────────────────┘

  2. Send messages with thread_id:
     ┌────────────────────────────────────┐
     │  Message #1                        │
     │  from: A, to: B                    │
     │  thread_id: "thread-123"           │
     │  payload: "Let's implement X"      │
     └────────────────────────────────────┘

     ┌────────────────────────────────────┐
     │  Message #2                        │
     │  from: B, to: C                    │
     │  thread_id: "thread-123"           │
     │  payload: "I'll handle the UI"     │
     └────────────────────────────────────┘

  3. Query conversation:
     getConversation(agentA, agentB)
       → Returns all messages between A ↔ B in thread-123

┌──────────────────────────────────────────────────────────────────────┐
│                    Message Status State Machine                       │
└──────────────────────────────────────────────────────────────────────┘

  pending ──────► delivered ──────► processed
     │               │                  │
     │               │                  │
     └───────────────┴──────────────────┴────► failed

  States:
  • pending:    Message queued, not yet received
  • delivered:  Message received by recipient agent
  • processed:  Message processed by recipient
  • failed:     Message delivery/processing failed

┌──────────────────────────────────────────────────────────────────────┐
│                    Broadcast Pattern                                  │
└──────────────────────────────────────────────────────────────────────┘

  Coordinator broadcasts task to all subordinates:

  ┌─────────────────┐
  │   Coordinator   │
  └────────┬────────┘
           │
           │  broadcast(toList: [W1, W2, W3],
           │             payload: "Start task X",
           │             priority: 5)
           │
           ├──────────────┬──────────────┬──────────────┐
           ▼              ▼              ▼              ▼
      ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
      │ Worker1│     │ Worker2│     │ Worker3│     │ Worker4│
      └────────┘     └────────┘     └────────┘     └────────┘
      Receives       Receives       Receives       Receives
      message        message        message        message
      independently  independently  independently  independently
```

---

## 6. Workspace Isolation

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      WORKSPACE ISOLATION ARCHITECTURE                       │
└────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Git Worktree Structure                             │
└──────────────────────────────────────────────────────────────────────┘

multi-agent-builder/  (main repository)
│
├── .git/             (main Git directory)
│   └── worktrees/    (Git worktree metadata)
│       ├── agent-{uuid-1}/
│       ├── agent-{uuid-2}/
│       └── agent-{uuid-3}/
│
├── .worktrees/       (actual worktree directories)
│   │
│   ├── agent-{uuid-1}/          ┌──────────────────────────┐
│   │   ├── src/                 │  Isolated workspace for  │
│   │   ├── tests/               │  Agent 1                 │
│   │   ├── package.json         │  Branch: agent-{uuid-1}  │
│   │   └── ...                  └──────────────────────────┘
│   │
│   ├── agent-{uuid-2}/          ┌──────────────────────────┐
│   │   ├── src/                 │  Isolated workspace for  │
│   │   ├── tests/               │  Agent 2                 │
│   │   ├── package.json         │  Branch: agent-{uuid-2}  │
│   │   └── ...                  └──────────────────────────┘
│   │
│   └── agent-{uuid-3}/          ┌──────────────────────────┐
│       ├── src/                 │  Isolated workspace for  │
│       ├── tests/               │  Agent 3                 │
│       ├── package.json         │  Branch: agent-{uuid-3}  │
│       └── ...                  └──────────────────────────┘
│
└── src/              (main branch code)

KEY FEATURES:
  ✓ Each agent has its own Git branch
  ✓ Each agent has isolated filesystem directory
  ✓ Agents can modify same files without conflicts
  ✓ Changes are tracked independently per branch
  ✓ Automatic cleanup when agent completes

┌──────────────────────────────────────────────────────────────────────┐
│              Workspace Lifecycle & State Management                   │
└──────────────────────────────────────────────────────────────────────┘

Agent Spawn:
  1. AgentService.spawnAgent() creates agent
  2. GitWorktree.createWorktree(agentId) creates worktree
     - Runs: git worktree add -b agent-{uuid} .worktrees/{uuid} HEAD
  3. WorkspaceRepository.create(agentId, path, branch)
     - Stores workspace metadata in database
     - Sets isolation_status = 'active'

Agent Working:
  - Agent reads/writes files in .worktrees/{uuid}/
  - All changes tracked in branch agent-{uuid}
  - Git operations: commit, diff, status available

Agent Completes:
  - Agent status → 'completed'
  - Workspace isolation_status → 'completed'
  - WorkspaceCleanupService.cleanupByStatus('completed')
    - Runs: git worktree remove .worktrees/{uuid}
    - Deletes workspace record from database

┌──────────────────────────────────────────────────────────────────────┐
│                  Workspace Isolation Validation                       │
└──────────────────────────────────────────────────────────────────────┘

TEST SCENARIO: Two agents modifying same file

  Agent A's workspace:           Agent B's workspace:
  ─────────────────────          ─────────────────────
  .worktrees/agent-A/            .worktrees/agent-B/
  └── src/                       └── src/
      └── utils.ts                   └── utils.ts
          Content: "Version A"           Content: "Version B"

  ✅ No conflicts - each agent has isolated copy
  ✅ Changes tracked independently on different branches
  ✅ Can merge later via standard Git workflow

┌──────────────────────────────────────────────────────────────────────┐
│              Workspace Cleanup Service Architecture                   │
└──────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────┐
  │       WorkspaceCleanupService                          │
  │                                                        │
  │  Scheduler (runs every 24 hours):                      │
  │  ────────────────────────────────────────────         │
  │                                                        │
  │  1. Query workspaces WHERE status IN                   │
  │     ('completed', 'failed', 'terminated')              │
  │     AND updated_at < NOW() - INTERVAL '7 days'         │
  │                                                        │
  │  2. For each workspace:                                │
  │     a. git worktree remove --force {path}              │
  │     b. git branch -D {branch}                          │
  │     c. DELETE FROM workspaces WHERE id = {id}          │
  │                                                        │
  │  3. Prune dangling worktrees:                          │
  │     git worktree prune                                 │
  │                                                        │
  │  Manual cleanup API:                                   │
  │  • cleanupByStatus(status, options)                    │
  │  • cleanupByAge(days)                                  │
  │  • cleanupAgent(agentId, force)                        │
  └────────────────────────────────────────────────────────┘
```

---

## 7. Data Flow Diagrams

### Agent Spawning Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE AGENT SPAWNING FLOW                             │
└────────────────────────────────────────────────────────────────────────────┘

[Client/User]
     │
     │ spawnAgent(role="coder", task="Fix bug", tokens=5000, parentId="root-123")
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AgentService.spawnAgent()                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. VALIDATION                                                      │
│     ✓ tokens > 0                                                    │
│     ✓ If parentId:                                                  │
│       - Parent exists?                                              │
│       - Parent has sufficient budget?                               │
│                                                                     │
│  2. BEGIN TRANSACTION ────────────────────────────────┐             │
│     │                                                  │             │
│     ├─► INSERT INTO agents                            │             │
│     │   (id, role, status='pending', depth_level,     │             │
│     │    parent_id, task_description)                 │             │
│     │   VALUES (new_uuid, 'coder', 'pending', 1,      │             │
│     │           'root-123', 'Fix bug')                 │             │
│     │                                                  │             │
│     ├─► INSERT INTO budgets                           │             │
│     │   (agent_id, allocated, used, reserved)         │             │
│     │   VALUES (new_uuid, 5000, 0, 0)                 │             │
│     │                                                  │             │
│     │   ╔══════════════════════════════════╗          │             │
│     │   ║ TRIGGER: allocate_child_budget() ║          │             │
│     │   ╚══════════════════════════════════╝          │             │
│     │         │                                        │             │
│     │         ├─► Get parent_id from hierarchies      │             │
│     │         ├─► UPDATE budgets                      │             │
│     │         │   SET reserved = reserved + 5000      │             │
│     │         │   WHERE agent_id = 'root-123'         │             │
│     │         └─► Validate constraint:                │             │
│     │             used + reserved <= allocated        │             │
│     │                                                  │             │
│     └─ COMMIT TRANSACTION ────────────────────────────┘             │
│                                                                     │
│  3. CREATE WORKSPACE (async, non-blocking)                          │
│     │                                                               │
│     ├─► GitWorktree.createWorktree(new_uuid)                       │
│     │   │                                                           │
│     │   ├─► mkdir -p .worktrees/                                   │
│     │   ├─► git worktree add -b agent-{uuid}                       │
│     │   │       .worktrees/{uuid} HEAD                             │
│     │   └─► return { path, branch }                                │
│     │                                                               │
│     └─► WorkspaceRepository.create(                                │
│         agent_id, worktree_path, branch_name                       │
│         )                                                           │
│         │                                                           │
│         └─► INSERT INTO workspaces                                 │
│             (agent_id, worktree_path, branch_name,                 │
│              isolation_status='active')                            │
│                                                                     │
│  4. RETURN agent_id                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
     │
     │ Returns: "agent-abc-123"
     ▼
[Client/User]

DATABASE STATE AFTER SPAWN:
═════════════════════════

agents:
  id: "agent-abc-123"
  role: "coder"
  status: "pending"
  depth_level: 1
  parent_id: "root-123"
  task_description: "Fix bug"

budgets:
  agent_id: "agent-abc-123"
  allocated: 5000
  used: 0
  reserved: 0

budgets (parent "root-123"):
  allocated: 100000
  used: 1000
  reserved: 5000  ← Increased by trigger

hierarchies:
  parent_id: "root-123"
  child_id: "agent-abc-123"

workspaces:
  agent_id: "agent-abc-123"
  worktree_path: ".worktrees/agent-abc-123"
  branch_name: "agent-agent-abc-123"
  isolation_status: "active"
```

### Message Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE SENDING FLOW                                │
└────────────────────────────────────────────────────────────────────────────┘

[Agent A]
     │
     │ sharedQueue.send(from="A", to="B", payload={...}, priority=5)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SharedQueue.send()                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. MessageRepository.create(from, to, payload, priority)           │
│     │                                                               │
│     └─► INSERT INTO messages                                       │
│         (id, from_agent_id, to_agent_id, payload,                  │
│          priority, status, created_at)                             │
│         VALUES (uuid, 'A', 'B', {...}, 5, 'pending', NOW())        │
│                                                                     │
│  2. Return created message                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
     │
     │ Message queued
     ▼
DATABASE: messages table
  ┌────────────────────────────────────────────────────┐
  │ [Msg1] from: A, to: B, priority: 10, status: pending │
  │ [Msg2] from: A, to: B, priority: 5,  status: pending │ ← New
  │ [Msg3] from: C, to: B, priority: 3,  status: pending │
  └────────────────────────────────────────────────────┘


[Agent B]
     │
     │ sharedQueue.receive(agentId="B", limit=10)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SharedQueue.receive()                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. MessageRepository.getPendingMessages(agentId, limit)            │
│     │                                                               │
│     └─► SELECT * FROM messages                                     │
│         WHERE to_agent_id = 'B'                                    │
│           AND status = 'pending'                                   │
│         ORDER BY priority DESC, created_at ASC                     │
│         LIMIT 10                                                   │
│                                                                     │
│  2. Return messages (oldest high-priority first)                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
     │
     │ Returns: [Msg1 (priority 10), Msg2 (priority 5), Msg3 (priority 3)]
     ▼
[Agent B processes messages]
     │
     │ For each message: processMessage(msg)
     │ Then: updateStatus(msgId, 'processed')
     ▼
[Complete]
```

### Budget Consumption Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     TOKEN CONSUMPTION FLOW                                  │
└────────────────────────────────────────────────────────────────────────────┘

[Agent performs work that uses 1000 tokens]
     │
     │ budgetService.consumeTokens(agentId="agent-123", tokens=1000)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BudgetService.consumeTokens()                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Get remaining budget                                            │
│     SELECT (allocated - used - reserved) as remaining               │
│     FROM budgets WHERE agent_id = 'agent-123'                       │
│     ────────────────────────────                                   │
│     Result: remaining = 4000                                        │
│                                                                     │
│  2. Validate: remaining >= tokens?                                  │
│     4000 >= 1000? ✓ YES                                            │
│                                                                     │
│  3. Increment used tokens                                           │
│     UPDATE budgets                                                  │
│     SET used = used + 1000,                                         │
│         updated_at = CURRENT_TIMESTAMP                              │
│     WHERE agent_id = 'agent-123'                                    │
│       AND used + 1000 + reserved <= allocated  ← Safety check       │
│                                                                     │
│  4. Return updated budget                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
     │
     │ Returns: Budget { allocated: 5000, used: 1000, reserved: 0 }
     ▼
[Agent continues work]

DATABASE STATE:
═════════════

BEFORE:
  budgets(agent-123):
    allocated: 5000
    used: 0
    reserved: 0

AFTER:
  budgets(agent-123):
    allocated: 5000
    used: 1000      ← Increased
    reserved: 0
```

---

## Summary

This multi-agent orchestration system provides:

1. **Hierarchical Agent Management** with up to 5 levels of depth
2. **Budget Tracking** with automatic allocation/reclamation via database triggers
3. **Priority-based Message Queue** with FIFO ordering and threading
4. **Workspace Isolation** using Git worktrees for conflict-free collaboration
5. **Comprehensive Service Layer** with 5 core services and 6 repositories
6. **Postgres-backed Persistence** with 7 tables and 3 database triggers
7. **Automatic Cleanup** with scheduled workspace garbage collection

**Key Metrics:**
- Max hierarchy depth: 5 levels
- Budget accuracy: 100% (SC-004)
- Message delivery rate: 99.9% (SC-003)
- Test coverage: 58 integration tests across 5 test suites

**Technology Stack:**
- TypeScript 5.3.3
- PostgreSQL 14+
- Git worktrees
- Pino logger
- Vitest testing framework
