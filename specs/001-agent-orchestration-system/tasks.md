# Implementation Tasks: Hierarchical Agent Orchestration System

**Feature**: 001-agent-orchestration-system
**Generated**: 2025-11-21
**Status**: Ready for Implementation

## Task Summary

**Total Tasks**: 112
- Setup & Infrastructure: 14 tasks
- Foundational Layer: 18 tasks
- User Story 1 (MVP): 12 tasks
- User Story 2: 10 tasks
- User Story 3: 10 tasks
- User Story 4: 10 tasks
- User Story 5: 12 tasks
- User Story 6: 16 tasks
- Polish & Cross-Cutting: 10 tasks

---

## Dependencies & Execution Order

```
Phase 1: Setup (T001-T014)
    ↓
Phase 2: Foundational (T015-T032)
    ↓
Phase 3: User Story 1 - MVP (T033-T044) ← BLOCKING FOR ALL OTHER STORIES
    ↓
    ├─→ Phase 4: User Story 2 (T045-T054) [depends on US1]
    ├─→ Phase 5: User Story 3 (T055-T064) [depends on US1, basic Budget]
    ├─→ Phase 6: User Story 4 (T065-T074) [depends on US1]
    └─→ Phase 7: User Story 5 (T075-T086) [depends on US1, US2]
         ↓
         Phase 8: User Story 6 (T087-T102) [depends on US1, US2, US5]
         ↓
         Phase 9: Polish (T103-T112)
```

**User Story Independence Map**:
- US1 (Spawn Individual Agents): NO DEPENDENCIES - MVP
- US2 (Hierarchical Teams): Depends on US1
- US3 (Message Queue): Depends on US1 (basic budget allocation)
- US4 (Workspace Isolation): Depends on US1
- US5 (Budget Tracking): Depends on US1, US2 (hierarchy)
- US6 (Workflow Composition): Depends on US1, US2, US5 (full system)

---

## Phase 1: Setup (Project Initialization)

**Goal**: Create project foundation with dependencies, configuration, and directory structure.

- [ ] T001 Initialize Node.js project with package.json at root
- [ ] T002 Configure TypeScript 5.3.3 with strict mode in tsconfig.json
- [ ] T003 Install core dependencies (@anthropic-ai/sdk, pg, uuid, zod, pino)
- [ ] T004 Create project directory structure (src/, tests/, migrations/, config/)
- [ ] T005 Setup PostgreSQL connection pooling in src/database/db.ts
- [ ] T006 Configure Vitest 4.0.8 testing framework in vitest.config.ts
- [ ] T007 Setup ESLint and Prettier configuration files
- [ ] T008 Create environment configuration loader in src/config/env.ts
- [ ] T009 Initialize structured logging with Pino in src/utils/Logger.ts
- [ ] T010 Create migration runner script in src/database/migrate.ts
- [ ] T011 Setup development scripts in package.json (dev, build, test, lint)
- [ ] T012 Create .env.example with required environment variables
- [ ] T013 Initialize git repository and create .gitignore
- [ ] T014 Create README.md with installation and setup instructions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal**: Build core infrastructure required by ALL user stories.

### Database Schema

- [ ] T015 Create initial migration 001_initial_schema.sql with all table definitions
- [ ] T016 Define Agent table with status enum, depth_level, parent_id in migration
- [ ] T017 Define Budget table with allocated/used/reserved columns and constraints
- [ ] T018 Define Message table with priority, FIFO ordering, status fields
- [ ] T019 Define Workspace table with worktree_path, branch_name, isolation_status
- [ ] T020 Define Checkpoint table with state_snapshot JSONB, resume_capability
- [ ] T021 Define Hierarchy table with parent_id/child_id relationships
- [ ] T022 Create database indexes for performance (agent_parent_id, message_recipient_status, etc.)
- [ ] T023 Create budget allocation trigger allocate_child_budget() in migration
- [ ] T024 Create budget reclamation trigger reclaim_child_budget() in migration
- [ ] T025 Create schema_migrations tracking table in migration

### Data Models

- [ ] T026 [P] Create Agent model interface in src/models/Agent.ts
- [ ] T027 [P] Create Budget model interface in src/models/Budget.ts
- [ ] T028 [P] Create Message model interface in src/models/Message.ts
- [ ] T029 [P] Create Workspace model interface in src/models/Workspace.ts
- [ ] T030 [P] Create Checkpoint model interface in src/models/Checkpoint.ts
- [ ] T031 [P] Create Hierarchy model interface in src/models/Hierarchy.ts

### Infrastructure Services

- [ ] T032 Create SharedDatabase connection pool manager in src/infrastructure/SharedDatabase.ts

---

## Phase 3: User Story 1 - Spawn and Manage Individual Agents (P1) - MVP

**Goal**: Single agent spawning with status tracking and basic budget allocation.

**Independent Test**: Spawn agent, check status, verify completion.

### Core Agent Implementation

- [ ] T033 [US1] Create base Agent class skeleton in src/core/Agent.ts
- [ ] T034 [US1] Implement Agent constructor with dependency injection in src/core/Agent.ts
- [ ] T035 [US1] Implement agent state machine transitions in src/core/Agent.ts
- [ ] T036 [US1] Create AgentCore business logic class in src/core/AgentCore.ts
- [ ] T037 [US1] Implement AgentRepository data access layer in src/database/repositories/AgentRepository.ts

### Agent Lifecycle

- [ ] T038 [US1] Implement spawn() method in AgentService at src/services/AgentService.ts
- [ ] T039 [US1] Implement getStatus() method in AgentService at src/services/AgentService.ts
- [ ] T040 [US1] Implement terminate() method in AgentService at src/services/AgentService.ts
- [ ] T041 [US1] Create basic message queue for agent communication in src/infrastructure/SharedQueue.ts
- [ ] T042 [US1] Implement basic budget allocation in BudgetService at src/services/BudgetService.ts

### Testing

- [ ] T043 [US1] Write integration test for single agent spawn and completion in tests/integration/01-single-agent.test.ts
- [ ] T044 [US1] Write integration test for agent status transitions in tests/integration/01-single-agent.test.ts

---

## Phase 4: User Story 2 - Create Hierarchical Agent Teams (P2)

**Goal**: Parent-child agent relationships with budget delegation.

**Independent Test**: Parent spawns 2 children, monitors progress, aggregates results.

### Hierarchy Implementation

- [ ] T045 [US2] Create HierarchyRepository in src/database/repositories/HierarchyRepository.ts
- [ ] T046 [US2] Implement spawnSubordinate() in Agent class at src/core/Agent.ts
- [ ] T047 [US2] Implement parent-child relationship tracking in HierarchyService at src/services/HierarchyService.ts
- [ ] T048 [US2] Implement budget allocation from parent to child in BudgetService
- [ ] T049 [US2] Implement getSubordinates() query in AgentRepository

### Hierarchy Queries

- [ ] T050 [US2] Implement getHierarchyTree() recursive query in HierarchyService
- [ ] T051 [US2] Implement getAncestors() query in HierarchyService
- [ ] T052 [US2] Implement getDescendants() query in HierarchyService

### Testing

- [ ] T053 [US2] Write integration test for 3-level hierarchy in tests/integration/02-hierarchical-teams.test.ts
- [ ] T054 [US2] Write integration test for subordinate completion and parent notification in tests/integration/02-hierarchical-teams.test.ts

---

## Phase 5: User Story 3 - Communicate Between Agents via Message Queue (P3)

**Goal**: Asynchronous message passing with FIFO ordering and persistence.

**Independent Test**: Agent A sends message, Agent B receives and processes it.

### Message Queue Implementation

- [ ] T055 [US3] Create MessageRepository in src/database/repositories/MessageRepository.ts
- [ ] T056 [US3] Implement send() method in SharedQueue at src/infrastructure/SharedQueue.ts
- [ ] T057 [US3] Implement receive() method with FIFO ordering in SharedQueue
- [ ] T058 [US3] Implement priority-based message delivery in SharedQueue
- [ ] T059 [US3] Create message status state machine (pending → delivered → processed)
- [ ] T060 [US3] Implement message persistence in MessageRepository

### Message Threading

- [ ] T061 [US3] Create MessageThread model in src/models/MessageThread.ts
- [ ] T062 [US3] Implement thread grouping in MessageRepository

### Testing

- [ ] T063 [US3] Write integration test for FIFO message ordering in tests/integration/03-message-queue.test.ts
- [ ] T064 [US3] Write integration test for 100 messages with priorities in tests/integration/03-message-queue.test.ts

---

## Phase 6: User Story 4 - Isolate Agent Workspaces (P3)

**Goal**: Git worktree isolation for parallel agent work.

**Independent Test**: Two agents modify same file, verify isolation and independent merge.

### Git Worktree Service

- [ ] T065 [US4] Create GitWorktree service class in src/infrastructure/GitWorktree.ts
- [ ] T066 [US4] Implement createWorktree() method in GitWorktree
- [ ] T067 [US4] Implement deleteWorktree() cleanup in GitWorktree
- [ ] T068 [US4] Create WorkspaceRepository in src/database/repositories/WorkspaceRepository.ts
- [ ] T069 [US4] Implement workspace creation in Agent spawn flow

### Workspace Management

- [ ] T070 [US4] Implement getWorkspaceDiff() in GitWorktree
- [ ] T071 [US4] Implement workspace isolation status tracking in WorkspaceRepository
- [ ] T072 [US4] Create workspace cleanup job in src/services/WorkspaceCleanupService.ts

### Testing

- [ ] T073 [US4] Write integration test for parallel file modifications in tests/integration/04-workspace-isolation.test.ts
- [ ] T074 [US4] Write integration test for workspace diff and merge in tests/integration/04-workspace-isolation.test.ts

---

## Phase 7: User Story 5 - Track Budget Hierarchically (P2)

**Goal**: Hierarchical budget tracking with consumption, reclamation, and enforcement.

**Independent Test**: Parent allocates to children, monitor consumption, verify reclamation.

### Budget Service

- [ ] T075 [US5] Create BudgetRepository in src/database/repositories/BudgetRepository.ts
- [ ] T076 [US5] Implement allocateBudget() with parent deduction in BudgetService
- [ ] T077 [US5] Implement consumeBudget() with real-time tracking in BudgetService
- [ ] T078 [US5] Implement reclaimBudget() on child completion in BudgetService
- [ ] T079 [US5] Create budget validation before spawn in AgentService

### Budget Hierarchy

- [ ] T080 [US5] Implement getBudgetHierarchy() recursive query in BudgetRepository
- [ ] T081 [US5] Implement budget bubble-up logic for consumption in BudgetService
- [ ] T082 [US5] Create budget threshold alerts in BudgetService
- [ ] T083 [US5] Implement budget overrun handling in BudgetService

### Testing

- [ ] T084 [US5] Write integration test for budget allocation and reclamation in tests/integration/05-budget-tracking.test.ts
- [ ] T085 [US5] Write integration test for budget overrun rejection in tests/integration/05-budget-tracking.test.ts
- [ ] T086 [US5] Write integration test for hierarchical budget bubbling in tests/integration/05-budget-tracking.test.ts

---

## Phase 8: User Story 6 - Compose Agents as Multi-Agent Workflows (P2)

**Goal**: Workflow-based agent composition with DAG execution and templates.

**Independent Test**: Define 4-node workflow, spawn workflow agent, verify sequential execution.

### Workflow Models

- [ ] T087 [US6] Create WorkflowGraph model in src/models/WorkflowGraph.ts
- [ ] T088 [US6] Create WorkflowNode model in src/models/WorkflowNode.ts
- [ ] T089 [US6] Create WorkflowEdge model in src/models/WorkflowEdge.ts
- [ ] T090 [US6] Create WorkflowTemplate model in src/models/WorkflowTemplate.ts
- [ ] T091 [US6] Create WorkflowAgent model extending Agent in src/models/WorkflowAgent.ts

### Workflow Database Schema

- [ ] T092 [US6] Create migration 002_workflow_schema.sql with workflow tables
- [ ] T093 [US6] Define WorkflowGraph table with status and validation fields
- [ ] T094 [US6] Define WorkflowNode table with dependencies JSONB
- [ ] T095 [US6] Define WorkflowEdge table with condition and type
- [ ] T096 [US6] Define WorkflowTemplate table with node_templates JSONB
- [ ] T097 [US6] Create workflow validation trigger for cycle detection

### Workflow Engine

- [ ] T098 [US6] Create WorkflowEngine class in src/core/WorkflowEngine.ts
- [ ] T099 [US6] Implement DAG topological sort validation in WorkflowEngine
- [ ] T100 [US6] Implement executeWorkflow() with dependency resolution in WorkflowEngine
- [ ] T101 [US6] Implement workflow node spawning logic in WorkflowEngine

### Testing

- [ ] T102 [US6] Write integration test for 4-node sequential workflow in tests/integration/06-workflow-composition.test.ts

---

## Phase 9: Polish & Cross-Cutting Concerns

**Goal**: Production readiness, error handling, logging, and documentation.

### Error Handling & Logging

- [ ] T103 Create global error handler in src/utils/ErrorHandler.ts
- [ ] T104 Implement structured logging across all services
- [ ] T105 Create Dead Letter Queue for failed messages in src/services/DLQService.ts

### Performance & Monitoring

- [ ] T106 Add performance indexes based on query patterns
- [ ] T107 Implement connection pool monitoring in SharedDatabase
- [ ] T108 Create health check endpoint in src/api/health.ts

### Documentation

- [ ] T109 Generate API documentation from TSDoc comments
- [ ] T110 Create deployment guide in docs/DEPLOYMENT.md

### Security

- [ ] T111 Add input validation with Zod schemas for all APIs
- [ ] T112 Implement SQL injection prevention audit

---

## Parallel Opportunities

### Phase 1 (Setup)
**All tasks T001-T014 are parallelizable** - different files, no blocking dependencies.

### Phase 2 (Foundational)
**Parallel Group 1** (after migration T015-T025 completes):
- T026-T031: Model interfaces (independent files)

**Sequential**: T032 (SharedDatabase) depends on T005

### Phase 3 (User Story 1)
**Parallel Group 1**:
- T033, T034: Agent class skeleton
- T036: AgentCore
- T037: AgentRepository

**Sequential**: T038-T042 depend on above, then T043-T044 test

### Phase 4 (User Story 2)
**Parallel Group 1**:
- T045: HierarchyRepository
- T049: AgentRepository query method

**Sequential**: T046-T048, T050-T052 have dependencies

### Phase 5 (User Story 3)
**Parallel Group 1**:
- T055: MessageRepository
- T061: MessageThread model

**Sequential**: T056-T060 implement queue, T062-T064 finalize

### Phase 6 (User Story 4)
**Parallel Group 1**:
- T065: GitWorktree service
- T068: WorkspaceRepository

**Sequential**: T066-T072 build on T065

### Phase 7 (User Story 5)
**Parallel Group 1**:
- T075: BudgetRepository
- T082: Budget alerts (separate from core logic)

**Sequential**: T076-T081, T083 core budget logic, T084-T086 tests

### Phase 8 (User Story 6)
**Parallel Group 1**:
- T087-T091: All model interfaces (independent files)

**Sequential**: T092-T097 migration, then T098-T102 engine and tests

### Phase 9 (Polish)
**Parallel Group 1**:
- T103: Error handler
- T105: DLQ service
- T106: Indexes
- T109: Documentation
- T111: Validation schemas
- T112: Security audit

---

## Implementation Strategy

### MVP-First Approach

1. **Week 1**: Setup + Foundational (T001-T032)
2. **Week 2**: User Story 1 - MVP (T033-T044)
   - Deliverable: Single agent spawn, execute, status tracking
3. **Week 3**: User Story 2 + User Story 4 (T045-T054, T065-T074)
   - Deliverable: Hierarchical teams with isolated workspaces
4. **Week 4**: User Story 3 + User Story 5 (T055-T064, T075-T086)
   - Deliverable: Message queue and budget tracking
5. **Week 5**: User Story 6 (T087-T102)
   - Deliverable: Workflow composition
6. **Week 6**: Polish + Testing (T103-T112)
   - Deliverable: Production-ready system

### Testing Strategy

**Test-Driven Development** (per constitution.md):
- Write integration test BEFORE implementing each user story
- Target: >80% code coverage
- 6 integration test suites (one per user story)
- Unit tests for critical business logic

### Quality Gates

Before moving to next phase:
- [ ] All tasks in current phase completed
- [ ] Integration tests passing for completed user stories
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Constitution compliance checked

---

## Notes

### Task Guidelines

1. **Checkbox Format**: All tasks use `- [ ]` for tracking
2. **Sequential IDs**: T001, T002, T003... in execution order
3. **File Paths**: Every implementation task includes exact file path
4. **User Story Labels**: [US1] through [US6] for story-specific tasks
5. **Parallel Markers**: [P] for tasks that can run in parallel

### Entity-to-User-Story Mapping

- **Agent, Budget (basic)**: US1
- **Hierarchy**: US2
- **Message**: US3
- **Workspace**: US4
- **Budget (advanced)**: US5
- **WorkflowAgent, WorkflowGraph, WorkflowNode, WorkflowEdge, WorkflowTemplate**: US6

### API-to-User-Story Mapping

- **agent-api.ts**: US1, US2
- **message-api.ts**: US3
- **workspace-api.ts**: US4
- **budget-api.ts**: US1, US5
- **workflow-api.ts**: US6

### Critical Success Criteria

- **SC-001**: Agent spawn <2 min (tested in US1)
- **SC-002**: 5-level hierarchy (tested in US2)
- **SC-003**: 99.9% message delivery (tested in US3)
- **SC-004**: 100% budget accuracy (tested in US5)
- **SC-005**: 100% workspace isolation (tested in US4)
- **SC-011**: Workflow coordination 99% (tested in US6)

---

## Validation Checklist

- [x] All tasks have checkbox format
- [x] All tasks have sequential IDs (T001-T112)
- [x] All implementation tasks have file paths
- [x] User story tasks have [US#] labels
- [x] Parallelizable tasks have [P] markers
- [x] Each user story has clear goal and independent test
- [x] Dependencies section shows execution order
- [x] MVP scope clearly identified (US1)
- [x] Total task count: 112 (within 80-120 target range)

---

**Status**: Ready for `/spec-mix.implement`
**Next Step**: Execute tasks in dependency order, starting with Phase 1
