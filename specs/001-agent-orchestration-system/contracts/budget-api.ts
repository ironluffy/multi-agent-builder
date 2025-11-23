/**
 * Budget API Contracts
 * Feature: Hierarchical Agent Orchestration System - Budget Tracking
 * Maps to: FR-008, FR-009, FR-010, FR-014
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Budget allocation record (FR-008)
 */
export interface BudgetAllocation {
  /** Unique allocation identifier */
  id: string

  /** Agent ID receiving budget */
  agentId: string

  /** Parent agent ID providing budget (null for root) */
  parentId: string | null

  /** Total tokens allocated */
  allocated: number

  /** Tokens consumed so far */
  consumed: number

  /** Tokens remaining */
  remaining: number

  /** Percentage of budget used */
  percentUsed: number

  /** Allocation timestamp */
  allocatedAt: Date

  /** Last consumption update timestamp */
  lastUpdatedAt: Date

  /** Budget status */
  status: BudgetStatus

  /** Budget metadata */
  metadata: Record<string, unknown>
}

/**
 * Budget status
 */
export type BudgetStatus =
  | 'active'       // Budget available and in use
  | 'exhausted'    // Budget fully consumed
  | 'reclaimed'    // Budget returned to parent
  | 'frozen'       // Budget temporarily frozen

/**
 * Budget consumption record (FR-008)
 */
export interface BudgetConsumption {
  /** Unique consumption record identifier */
  id: string

  /** Agent ID consuming budget */
  agentId: string

  /** Tokens consumed in this record */
  tokensUsed: number

  /** Cost in USD (if applicable) */
  costUsd: number

  /** Model used for consumption */
  model: string

  /** Consumption breakdown */
  breakdown: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }

  /** Operation that caused consumption */
  operation: string

  /** Consumption timestamp */
  timestamp: Date

  /** Consumption metadata */
  metadata: Record<string, unknown>
}

/**
 * Budget reclamation result (FR-009, FR-010)
 */
export interface BudgetReclamation {
  /** Agent ID from which budget was reclaimed */
  agentId: string

  /** Parent agent ID receiving reclaimed budget */
  parentId: string

  /** Amount of budget reclaimed */
  amount: number

  /** Reason for reclamation */
  reason: 'completion' | 'termination' | 'failure' | 'reallocation'

  /** Reclamation timestamp */
  reclaimedAt: Date
}

/**
 * Budget hierarchy view (FR-008)
 */
export interface BudgetHierarchy {
  /** Agent ID */
  agentId: string

  /** Agent role */
  role: string

  /** Agent's budget allocation */
  budget: BudgetAllocation

  /** Child agents' budget allocations */
  children: BudgetHierarchy[]

  /** Total budget in subtree (including this agent) */
  subtreeBudget: {
    allocated: number
    consumed: number
    remaining: number
  }
}

/**
 * Budget transfer record (FR-009)
 */
export interface BudgetTransfer {
  /** Unique transfer identifier */
  id: string

  /** Source agent ID (giving budget) */
  fromAgentId: string

  /** Destination agent ID (receiving budget) */
  toAgentId: string

  /** Amount transferred */
  amount: number

  /** Transfer type */
  type: 'allocation' | 'reallocation' | 'reclamation'

  /** Transfer timestamp */
  timestamp: Date

  /** Transfer reason/description */
  reason: string
}

/**
 * Budget limit configuration (FR-008, FR-014)
 */
export interface BudgetLimits {
  /** Maximum tokens per agent */
  maxTokensPerAgent: number

  /** Maximum cost in USD */
  maxCostUsd: number

  /** Maximum execution time in minutes */
  maxTimeMinutes: number

  /** Alert threshold percentage (0-100) */
  alertThreshold: number

  /** Hard stop threshold percentage (0-100) */
  stopThreshold: number
}

/**
 * Budget alert
 */
export interface BudgetAlert {
  /** Alert identifier */
  id: string

  /** Agent ID triggering alert */
  agentId: string

  /** Alert type */
  type: 'threshold' | 'exhaustion' | 'overrun'

  /** Alert severity */
  severity: 'warning' | 'critical'

  /** Current budget state */
  currentState: {
    allocated: number
    consumed: number
    remaining: number
    percentUsed: number
  }

  /** Alert message */
  message: string

  /** Alert timestamp */
  timestamp: Date
}

/**
 * Budget statistics (FR-015)
 */
export interface BudgetStatistics {
  /** Total budget allocated across all agents */
  totalAllocated: number

  /** Total budget consumed across all agents */
  totalConsumed: number

  /** Total budget remaining across all agents */
  totalRemaining: number

  /** Total cost in USD */
  totalCostUsd: number

  /** Number of agents with active budgets */
  activeAgentCount: number

  /** Number of agents with exhausted budgets */
  exhaustedAgentCount: number

  /** Budget utilization by depth level */
  byDepthLevel: Record<number, {
    allocated: number
    consumed: number
    remaining: number
  }>

  /** Budget utilization by role */
  byRole: Record<string, {
    allocated: number
    consumed: number
    remaining: number
  }>

  /** Top consumers */
  topConsumers: Array<{
    agentId: string
    role: string
    consumed: number
    percentOfTotal: number
  }>
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when insufficient budget for allocation (FR-014)
 */
export class InsufficientBudgetError extends Error {
  constructor(
    public agentId: string,
    public required: number,
    public available: number
  ) {
    super(`Insufficient budget for agent ${agentId}: required ${required}, available ${available}`)
    this.name = 'InsufficientBudgetError'
  }
}

/**
 * Thrown when budget exhausted (FR-008)
 */
export class BudgetExhaustedError extends Error {
  constructor(
    public agentId: string,
    public allocated: number
  ) {
    super(`Budget exhausted for agent ${agentId}: ${allocated} tokens used`)
    this.name = 'BudgetExhaustedError'
  }
}

/**
 * Thrown when budget allocation not found
 */
export class BudgetNotFoundError extends Error {
  constructor(public agentId: string) {
    super(`Budget allocation not found for agent: ${agentId}`)
    this.name = 'BudgetNotFoundError'
  }
}

/**
 * Thrown when budget operation is invalid
 */
export class InvalidBudgetOperationError extends Error {
  constructor(
    public operation: string,
    public reason: string
  ) {
    super(`Invalid budget operation ${operation}: ${reason}`)
    this.name = 'InvalidBudgetOperationError'
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Allocates budget from parent to child agent (FR-003, FR-014)
 *
 * Transfers budget from parent agent's available budget to newly spawned
 * child agent. Validates that parent has sufficient available budget before
 * allocation.
 *
 * @param parentId - Parent agent identifier
 * @param childId - Child agent identifier
 * @param amount - Budget amount to allocate in tokens
 * @returns Promise<boolean> - True if allocation successful
 * @throws InsufficientBudgetError if parent lacks sufficient budget
 * @throws AgentNotFoundError if parent or child does not exist
 * @throws BudgetNotFoundError if parent has no budget allocation
 *
 * @example
 * ```typescript
 * const success = await allocate('agent-parent', 'agent-child', 50000)
 * if (success) {
 *   console.log('Budget allocated successfully')
 * }
 * ```
 */
export interface AllocateBudget {
  (parentId: string, childId: string, amount: number): Promise<boolean>
}

/**
 * Records budget consumption by agent (FR-008)
 *
 * Updates agent's budget consumption in real-time. Enforces budget limits
 * and triggers alerts when thresholds are crossed.
 *
 * @param agentId - Agent identifier
 * @param consumption - Consumption details
 * @returns Promise<void>
 * @throws BudgetExhaustedError if consumption would exceed budget
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * await consume('agent-123', {
 *   tokensUsed: 5000,
 *   costUsd: 0.15,
 *   model: 'claude-sonnet-4-5',
 *   breakdown: {
 *     inputTokens: 3000,
 *     outputTokens: 2000
 *   },
 *   operation: 'code_generation',
 *   metadata: {}
 * })
 * ```
 */
export interface ConsumeBudget {
  (agentId: string, consumption: Omit<BudgetConsumption, 'id' | 'agentId' | 'timestamp'>): Promise<void>
}

/**
 * Reclaims unused budget from agent to parent (FR-009, FR-010)
 *
 * Returns remaining budget from terminated or completed child agent back
 * to parent's available budget. Automatically called on agent termination
 * or completion.
 *
 * @param agentId - Agent identifier to reclaim from
 * @returns Promise<number> - Amount of budget reclaimed
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * const reclaimed = await reclaim('agent-completed')
 * console.log(`Reclaimed ${reclaimed} tokens to parent`)
 * ```
 */
export interface ReclaimBudget {
  (agentId: string): Promise<number>
}

/**
 * Gets available budget for agent (FR-008)
 *
 * Returns the amount of budget remaining and available for allocation
 * to subordinates.
 *
 * @param agentId - Agent identifier
 * @returns Promise<number> - Available budget in tokens
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * const available = await getAvailable('agent-parent')
 * if (available >= 30000) {
 *   await spawnChild({ budget: 30000, ... })
 * }
 * ```
 */
export interface GetAvailableBudget {
  (agentId: string): Promise<number>
}

/**
 * Gets budget allocation details for agent (FR-008)
 *
 * @param agentId - Agent identifier
 * @returns Promise<BudgetAllocation> - Budget allocation details
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * const budget = await getBudget('agent-456')
 * console.log(`Used ${budget.percentUsed}% of ${budget.allocated} tokens`)
 * console.log(`Remaining: ${budget.remaining} tokens`)
 * ```
 */
export interface GetBudget {
  (agentId: string): Promise<BudgetAllocation>
}

/**
 * Gets budget hierarchy tree (FR-008)
 *
 * Retrieves budget allocations for entire agent hierarchy starting
 * from specified root agent.
 *
 * @param rootAgentId - Root agent identifier
 * @returns Promise<BudgetHierarchy> - Budget hierarchy tree
 * @throws BudgetNotFoundError if root agent has no budget
 *
 * @example
 * ```typescript
 * const hierarchy = await getBudgetHierarchy('agent-root')
 * console.log(`Total subtree budget: ${hierarchy.subtreeBudget.allocated}`)
 * ```
 */
export interface GetBudgetHierarchy {
  (rootAgentId: string): Promise<BudgetHierarchy>
}

/**
 * Lists budget consumption history (FR-015)
 *
 * @param agentId - Agent identifier
 * @param options - Query options
 * @returns Promise<BudgetConsumption[]> - Consumption history
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * const history = await getConsumptionHistory('agent-789', {
 *   limit: 50,
 *   orderBy: 'timestamp',
 *   order: 'desc'
 * })
 *
 * const totalUsed = history.reduce((sum, c) => sum + c.tokensUsed, 0)
 * ```
 */
export interface GetConsumptionHistory {
  (agentId: string, options?: QueryOptions): Promise<BudgetConsumption[]>
}

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: 'timestamp' | 'tokensUsed' | 'costUsd'
  order?: 'asc' | 'desc'
  startDate?: Date
  endDate?: Date
}

/**
 * Gets budget transfer history (FR-009)
 *
 * @param agentId - Agent identifier (shows transfers involving this agent)
 * @param options - Query options
 * @returns Promise<BudgetTransfer[]> - Transfer history
 *
 * @example
 * ```typescript
 * const transfers = await getTransferHistory('agent-parent')
 * const totalAllocated = transfers
 *   .filter(t => t.type === 'allocation' && t.fromAgentId === 'agent-parent')
 *   .reduce((sum, t) => sum + t.amount, 0)
 * ```
 */
export interface GetTransferHistory {
  (agentId: string, options?: QueryOptions): Promise<BudgetTransfer[]>
}

/**
 * Sets budget limits for agent (FR-008, FR-014)
 *
 * @param agentId - Agent identifier
 * @param limits - Budget limit configuration
 * @returns Promise<void>
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * await setBudgetLimits('agent-123', {
 *   maxTokensPerAgent: 100000,
 *   maxCostUsd: 10.0,
 *   maxTimeMinutes: 60,
 *   alertThreshold: 80, // Alert at 80% usage
 *   stopThreshold: 95   // Hard stop at 95% usage
 * })
 * ```
 */
export interface SetBudgetLimits {
  (agentId: string, limits: BudgetLimits): Promise<void>
}

/**
 * Gets budget alerts for agent (FR-008)
 *
 * @param agentId - Agent identifier (or null for all alerts)
 * @param options - Filter options
 * @returns Promise<BudgetAlert[]> - Budget alerts
 *
 * @example
 * ```typescript
 * const alerts = await getBudgetAlerts(null, { severity: 'critical' })
 * alerts.forEach(alert => {
 *   console.warn(`ALERT [${alert.agentId}]: ${alert.message}`)
 * })
 * ```
 */
export interface GetBudgetAlerts {
  (agentId: string | null, options?: AlertFilter): Promise<BudgetAlert[]>
}

export interface AlertFilter {
  type?: 'threshold' | 'exhaustion' | 'overrun'
  severity?: 'warning' | 'critical'
  since?: Date
}

/**
 * Gets system-wide budget statistics (FR-015)
 *
 * @returns Promise<BudgetStatistics> - Budget statistics
 *
 * @example
 * ```typescript
 * const stats = await getBudgetStatistics()
 * console.log(`Total allocated: ${stats.totalAllocated}`)
 * console.log(`Total consumed: ${stats.totalConsumed}`)
 * console.log(`Total cost: $${stats.totalCostUsd.toFixed(2)}`)
 * console.log(`Top consumer: ${stats.topConsumers[0].agentId}`)
 * ```
 */
export interface GetBudgetStatistics {
  (): Promise<BudgetStatistics>
}

/**
 * Transfers budget between sibling agents (FR-009)
 *
 * Reallocates budget from one agent to another (requires same parent).
 *
 * @param fromAgentId - Source agent identifier
 * @param toAgentId - Destination agent identifier
 * @param amount - Amount to transfer
 * @returns Promise<BudgetTransfer> - Transfer record
 * @throws InsufficientBudgetError if source lacks sufficient budget
 * @throws InvalidBudgetOperationError if agents are not siblings
 *
 * @example
 * ```typescript
 * const transfer = await transferBudget('agent-1', 'agent-2', 10000)
 * console.log(`Transferred ${transfer.amount} tokens`)
 * ```
 */
export interface TransferBudget {
  (fromAgentId: string, toAgentId: string, amount: number): Promise<BudgetTransfer>
}

/**
 * Freezes agent budget (prevents consumption) (FR-008)
 *
 * @param agentId - Agent identifier
 * @param reason - Reason for freezing
 * @returns Promise<void>
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * await freezeBudget('agent-problematic', 'Suspected infinite loop')
 * ```
 */
export interface FreezeBudget {
  (agentId: string, reason: string): Promise<void>
}

/**
 * Unfreezes agent budget (FR-008)
 *
 * @param agentId - Agent identifier
 * @returns Promise<void>
 * @throws BudgetNotFoundError if agent has no budget allocation
 *
 * @example
 * ```typescript
 * await unfreezeBudget('agent-problematic')
 * ```
 */
export interface UnfreezeBudget {
  (agentId: string): Promise<void>
}
