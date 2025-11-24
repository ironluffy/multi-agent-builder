/**
 * Agent API Contracts
 * Feature: Hierarchical Agent Orchestration System
 * Maps to: FR-001, FR-002, FR-003, FR-004, FR-010, FR-011, FR-012, FR-014
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Agent lifecycle states (FR-002)
 */
export type AgentStatus =
  | 'created'      // Agent instantiated but not started
  | 'running'      // Actively executing task
  | 'completed'    // Task finished successfully
  | 'failed'       // Task failed with error
  | 'terminated'   // Manually stopped by parent

/**
 * Agent configuration for spawning (FR-001, FR-003)
 */
export interface AgentConfig {
  /** Unique identifier for the agent */
  id?: string // Auto-generated if not provided

  /** Role/specialization of the agent (e.g., "implementer", "reviewer", "tester") */
  role: string

  /** Task description for the agent to execute */
  task: string

  /** Token budget allocated to this agent */
  budget: number

  /** Depth level in hierarchy (0 = root) */
  depthLevel: number

  /** Parent agent ID (null for root agents) */
  parentId: string | null

  /** Working directory path for isolated workspace */
  workdir?: string

  /** Spawn mode: single agent, workflow composition, or auto-decide */
  mode?: 'single' | 'workflow' | 'auto'

  /** Workflow graph definition (required if mode === 'workflow') */
  workflowGraph?: WorkflowGraph

  /** Base git branch for workspace isolation */
  baseBranch?: string

  /** Additional metadata for the agent */
  metadata?: Record<string, unknown>
}

/**
 * Agent instance representation (FR-002, FR-004)
 */
export interface Agent {
  /** Unique agent identifier */
  id: string

  /** Agent role/specialization */
  role: string

  /** Current lifecycle status */
  status: AgentStatus

  /** Task description */
  task: string

  /** Depth in hierarchy (0 = root) */
  depthLevel: number

  /** Parent agent ID (null if root) */
  parentId: string | null

  /** IDs of subordinate agents spawned by this agent */
  subordinateIds: string[]

  /** Isolated workspace path */
  workdir: string

  /** Spawn mode */
  mode: 'single' | 'workflow' | 'auto'

  /** Workflow graph ID (if mode === 'workflow') */
  workflowGraphId: string | null

  /** Creation timestamp */
  createdAt: Date

  /** Last activity timestamp */
  lastActive: Date

  /** Completion/failure timestamp */
  completedAt: Date | null

  /** Termination timestamp (if terminated by parent) */
  terminatedAt: Date | null

  /** Error details (if status === 'failed') */
  error: AgentError | null

  /** Agent metadata */
  metadata: Record<string, unknown>
}

/**
 * Agent error information (FR-012)
 */
export interface AgentError {
  /** Error code */
  code: string

  /** Human-readable error message */
  message: string

  /** Detailed error context */
  details: Record<string, unknown>

  /** Timestamp when error occurred */
  timestamp: Date

  /** Stack trace (if available) */
  stack?: string
}

/**
 * Agent status query result (FR-011)
 */
export interface AgentStatus {
  /** Agent basic info */
  agent: Agent

  /** Budget information */
  budget: {
    allocated: number
    consumed: number
    remaining: number
    percentUsed: number
  }

  /** Task execution progress */
  progress: {
    status: string
    description: string
    percentComplete: number
    estimatedTimeRemaining: number | null
  }

  /** Subordinate agent statuses (if any) */
  subordinates: AgentStatusSummary[]

  /** Recent activity log entries */
  recentActivity: ActivityEntry[]
}

/**
 * Abbreviated agent status for subordinate lists
 */
export interface AgentStatusSummary {
  id: string
  role: string
  status: AgentStatus
  budgetRemaining: number
  progressPercent: number
}

/**
 * Activity log entry (FR-015)
 */
export interface ActivityEntry {
  timestamp: Date
  type: 'spawn' | 'message' | 'state_change' | 'error' | 'terminate'
  description: string
  details: Record<string, unknown>
}

/**
 * Hierarchy tree node (FR-004)
 */
export interface HierarchyNode {
  agent: Agent
  children: HierarchyNode[]
  depth: number
}

/**
 * Agent execution result
 */
export interface AgentResult {
  /** Agent ID */
  agentId: string

  /** Execution status */
  status: 'success' | 'failure'

  /** Output produced by agent */
  output: Record<string, unknown>

  /** Files modified in workspace */
  filesModified: string[]

  /** Total budget consumed */
  budgetConsumed: number

  /** Execution duration in seconds */
  durationSeconds: number

  /** Error details (if status === 'failure') */
  error: AgentError | null
}

// Forward declaration for workflow types
export interface WorkflowGraph {
  id: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  agentId: string | null
  role: string
}

export interface WorkflowEdge {
  id: string
  fromNode: string
  toNode: string
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when insufficient budget for operation (FR-014)
 */
export class InsufficientBudgetError extends Error {
  constructor(
    public required: number,
    public available: number,
    public agentId: string
  ) {
    super(`Insufficient budget: required ${required}, available ${available}`)
    this.name = 'InsufficientBudgetError'
  }
}

/**
 * Thrown when agent configuration is invalid (FR-001)
 */
export class ValidationError extends Error {
  constructor(
    public field: string,
    public reason: string
  ) {
    super(`Validation failed for ${field}: ${reason}`)
    this.name = 'ValidationError'
  }
}

/**
 * Thrown when agent is not found
 */
export class AgentNotFoundError extends Error {
  constructor(public agentId: string) {
    super(`Agent not found: ${agentId}`)
    this.name = 'AgentNotFoundError'
  }
}

/**
 * Thrown when operation not allowed in current state (FR-010)
 */
export class InvalidOperationError extends Error {
  constructor(
    public operation: string,
    public currentStatus: AgentStatus,
    public reason: string
  ) {
    super(`Cannot ${operation} when agent is ${currentStatus}: ${reason}`)
    this.name = 'InvalidOperationError'
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Spawns a new agent (FR-001, FR-003, FR-014, FR-016)
 *
 * Creates a new agent instance with specified configuration. If parentId is provided,
 * allocates budget from parent's available budget. Validates configuration before
 * spawning.
 *
 * @param config - Agent configuration
 * @returns Promise<Agent> - Created agent instance
 * @throws InsufficientBudgetError if parent has insufficient budget
 * @throws ValidationError if config is invalid
 * @throws AgentNotFoundError if parentId does not exist
 *
 * @example
 * ```typescript
 * const agent = await spawn({
 *   role: 'implementer',
 *   task: 'Create REST API endpoints',
 *   budget: 50000,
 *   depthLevel: 1,
 *   parentId: 'agent-123',
 *   mode: 'single'
 * })
 * ```
 */
export interface SpawnAgent {
  (config: AgentConfig): Promise<Agent>
}

/**
 * Gets current status of an agent (FR-011)
 *
 * Retrieves comprehensive status information including execution state,
 * budget usage, progress indicators, and subordinate summaries.
 *
 * @param agentId - Agent identifier
 * @returns Promise<AgentStatus> - Current agent status
 * @throws AgentNotFoundError if agent does not exist
 *
 * @example
 * ```typescript
 * const status = await getStatus('agent-123')
 * console.log(`Progress: ${status.progress.percentComplete}%`)
 * console.log(`Budget remaining: ${status.budget.remaining}`)
 * ```
 */
export interface GetAgentStatus {
  (agentId: string): Promise<AgentStatus>
}

/**
 * Terminates an agent and its subordinates (FR-010)
 *
 * Gracefully stops agent execution, terminates all subordinate agents recursively,
 * reclaims unused budget to parent, and cleans up resources. Only callable by
 * parent agent or system administrator.
 *
 * @param agentId - Agent identifier to terminate
 * @param reason - Reason for termination (for audit log)
 * @returns Promise<TerminationResult> - Termination details
 * @throws AgentNotFoundError if agent does not exist
 * @throws InvalidOperationError if agent already terminated/completed
 *
 * @example
 * ```typescript
 * const result = await terminate('agent-456', 'Task no longer needed')
 * console.log(`Reclaimed ${result.budgetReclaimed} tokens`)
 * ```
 */
export interface TerminateAgent {
  (agentId: string, reason: string): Promise<TerminationResult>
}

export interface TerminationResult {
  /** Terminated agent ID */
  agentId: string

  /** Number of subordinates also terminated */
  subordinatesTerminated: number

  /** Budget reclaimed to parent */
  budgetReclaimed: number

  /** Termination timestamp */
  terminatedAt: Date
}

/**
 * Gets hierarchy tree rooted at agent (FR-004)
 *
 * Retrieves complete hierarchy tree showing all subordinate agents
 * recursively with depth information.
 *
 * @param agentId - Root agent identifier
 * @returns Promise<HierarchyNode> - Hierarchy tree
 * @throws AgentNotFoundError if agent does not exist
 *
 * @example
 * ```typescript
 * const tree = await getHierarchy('agent-root')
 * console.log(`Total subordinates: ${countNodes(tree) - 1}`)
 * ```
 */
export interface GetAgentHierarchy {
  (agentId: string): Promise<HierarchyNode>
}

/**
 * Lists all agents matching filter criteria (FR-002)
 *
 * @param filter - Optional filter criteria
 * @returns Promise<Agent[]> - List of matching agents
 *
 * @example
 * ```typescript
 * const runningAgents = await listAgents({ status: 'running' })
 * const childAgents = await listAgents({ parentId: 'agent-123' })
 * ```
 */
export interface ListAgents {
  (filter?: AgentFilter): Promise<Agent[]>
}

export interface AgentFilter {
  status?: AgentStatus
  parentId?: string
  role?: string
  depthLevel?: number
  mode?: 'single' | 'workflow' | 'auto'
}

/**
 * Gets execution result of completed agent (FR-011)
 *
 * @param agentId - Agent identifier
 * @returns Promise<AgentResult> - Execution result
 * @throws AgentNotFoundError if agent does not exist
 * @throws InvalidOperationError if agent not completed/failed
 *
 * @example
 * ```typescript
 * const result = await getResult('agent-789')
 * console.log(`Modified files: ${result.filesModified.join(', ')}`)
 * ```
 */
export interface GetAgentResult {
  (agentId: string): Promise<AgentResult>
}

/**
 * Starts execution of a created agent (FR-002)
 *
 * Transitions agent from 'created' to 'running' state and begins task execution.
 *
 * @param agentId - Agent identifier
 * @returns Promise<void>
 * @throws AgentNotFoundError if agent does not exist
 * @throws InvalidOperationError if agent not in 'created' state
 *
 * @example
 * ```typescript
 * const agent = await spawn({ role: 'tester', ... })
 * await start(agent.id)
 * ```
 */
export interface StartAgent {
  (agentId: string): Promise<void>
}

/**
 * Updates agent metadata (FR-015)
 *
 * @param agentId - Agent identifier
 * @param metadata - Metadata updates
 * @returns Promise<void>
 * @throws AgentNotFoundError if agent does not exist
 */
export interface UpdateAgentMetadata {
  (agentId: string, metadata: Record<string, unknown>): Promise<void>
}
