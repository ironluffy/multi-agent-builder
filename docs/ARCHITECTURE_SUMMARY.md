# Multi-Agent Orchestration System - Architecture Summary for Review

## System Overview
Hierarchical multi-agent orchestration system with budget tracking, message queues, and workspace isolation.

## Core Architecture (5 Layers)
1. **Presentation**: Agent class (facade pattern)
2. **Business**: AgentService, BudgetService, HierarchyService, MessageService, WorkspaceService
3. **Infrastructure**: SharedDatabase, GitWorktree
4. **Data**: 6 repositories (Agent, Budget, Hierarchy, Message, Workspace, Checkpoint)
5. **Persistence**: PostgreSQL with triggers

## Database Schema (7 Tables)
- **agents**: id, role, task, status, depth_level, parent_id, created_at, completed_at
- **budgets**: id, agent_id, allocated, used, reserved, reclaimed, created_at, updated_at
- **hierarchies**: id, parent_id, child_id, created_at
- **messages**: id, sender_id, recipient_id, content, priority, status, thread_id, created_at
- **workspaces**: id, agent_id, path, branch_name, status, created_at
- **checkpoints**: id, agent_id, checkpoint_data, created_at
- **message_threads**: id, name, created_by, created_at

## Critical Database Triggers
1. **allocate_child_budget**: Reserves parent budget when child is created (INSERT on budgets)
2. **reclaim_child_budget**: Returns unused budget when agent completes (UPDATE on agents)
3. **update_updated_at_column**: Auto-updates timestamps (UPDATE on agents, budgets, workspaces)

## Budget Management Flow
```
Parent (allocated: 10000, used: 0, reserved: 0)
  ↓ spawn child with 3000 tokens
Parent (allocated: 10000, used: 0, reserved: 3000)  ← trigger reserves
Child (allocated: 3000, used: 0, reserved: 0)
  ↓ child consumes 2000 tokens
Child (allocated: 3000, used: 2000, reserved: 0)
  ↓ child completes
Parent (allocated: 10000, used: 0, reserved: 2000)  ← trigger reclaims 1000
Child (allocated: 3000, used: 2000, reclaimed: true)
```

## Issues FIXED
1. ✅ **Double Budget Reclamation**: Added `reclaimed` flag, prevents manual + automatic reclaim
2. ✅ **Missing Cycle Detection**: Added detectCycle() call before creating hierarchy
3. ✅ **Message Ordering**: Added `id ASC` tie-breaker for deterministic ordering
4. ✅ **SQL Column Errors**: Fixed `tokens_used` → `used` column references

## Remaining Design Decisions
1. **Parent Budget Starvation**: Reserved tokens are locked (can't be borrowed by parent)
   - Current: SAFE but RESTRICTIVE
   - Alternative: Allow dynamic borrowing with validation

2. **Workspace Creation Failures**: Currently graceful degradation (agent runs without workspace)
   - Current: NON-BLOCKING
   - Alternative: Fail fast or retry logic

3. **Max Depth Validation**: Enforced at database level, not application level
   - Current: DATABASE CONSTRAINT ONLY
   - Better: Early validation with better error messages

## Race Condition Analysis
- ✅ **Concurrent Child Spawning**: Protected by FOR UPDATE locks
- ✅ **Budget Trigger Parent Lookup**: Uses agents.parent_id (set before trigger)
- ✅ **Message Queue Concurrent Writes**: PostgreSQL MVCC handles concurrency

## Questions for Review
1. Are there any remaining architectural vulnerabilities?
2. Is the budget reservation model too restrictive (parent starvation issue)?
3. Should workspace creation failure block agent spawning?
4. Are there hidden race conditions we missed?
5. Is the database trigger approach appropriate or should logic move to application layer?
6. Any concerns with the hierarchical model scaling beyond depth 5?
7. Should we add circuit breakers or rate limiting for agent spawning?
