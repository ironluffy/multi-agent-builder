/**
 * Workflow API Contracts
 * Feature: Hierarchical Agent Orchestration System - Workflow Composition
 * Maps to: FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Workflow execution status (FR-022)
 */
export type WorkflowStatus =
  | 'created'       // Graph defined but not started
  | 'active'        // Executing nodes
  | 'paused'        // Temporarily paused
  | 'completed'     // All nodes completed successfully
  | 'failed'        // One or more nodes failed

/**
 * Workflow node execution status (FR-022)
 */
export type NodeStatus =
  | 'pending'       // Waiting for dependencies
  | 'ready'         // Dependencies met, ready to spawn
  | 'spawning'      // Agent being created
  | 'running'       // Agent executing
  | 'completed'     // Node finished successfully
  | 'failed'        // Node failed
  | 'skipped'       // Skipped due to upstream failure

/**
 * Dependency type between workflow nodes (FR-017)
 */
export type DependencyType =
  | 'sequential'    // Target waits for source to complete
  | 'parallel'      // Target can run concurrently with source
  | 'conditional'   // Target runs based on source outcome

/**
 * Edge activation condition (FR-017)
 */
export type EdgeCondition =
  | 'on_complete'   // Activate when source completes (any outcome)
  | 'on_success'    // Activate only if source succeeds
  | 'on_fail'       // Activate only if source fails
  | 'conditional'   // Evaluate custom condition

/**
 * Workflow node definition (FR-017)
 */
export interface WorkflowNode {
  /** Unique node identifier within workflow */
  id: string

  /** Agent ID once spawned (null until spawned) */
  agentId: string | null

  /** Role for agent to spawn */
  role: string

  /** Task description for this node */
  task: string

  /** Budget allocated to this node */
  budgetAllocation: number

  /** IDs of nodes this node depends on */
  dependencyNodeIds: string[]

  /** Current execution status */
  status: NodeStatus

  /** Timestamp when agent was spawned */
  spawnedAt: Date | null

  /** Timestamp when node completed */
  completedAt: Date | null

  /** Node-specific metadata */
  metadata: Record<string, unknown>

  /** Position in visual representation */
  position?: { x: number; y: number }
}

/**
 * Workflow edge definition (FR-017)
 */
export interface WorkflowEdge {
  /** Unique edge identifier within workflow */
  id: string

  /** Source node ID */
  fromNode: string

  /** Target node ID */
  toNode: string

  /** Dependency type */
  dependencyType: DependencyType

  /** Activation condition */
  condition: EdgeCondition

  /** Custom condition expression (if condition === 'conditional') */
  conditionExpression?: string

  /** Edge status */
  status: 'active' | 'satisfied' | 'failed'
}

/**
 * Workflow graph definition (FR-016, FR-017)
 */
export interface WorkflowGraph {
  /** Unique workflow graph identifier */
  id: string

  /** Workflow graph name */
  name: string

  /** Description of workflow purpose */
  description: string

  /** List of workflow nodes */
  nodes: WorkflowNode[]

  /** List of workflow edges (dependencies) */
  edges: WorkflowEdge[]

  /** Overall workflow status */
  status: WorkflowStatus

  /** Total budget for entire workflow */
  totalBudget: number

  /** Workflow creation timestamp */
  createdAt: Date

  /** Workflow completion timestamp */
  completedAt: Date | null

  /** Workflow metadata */
  metadata: Record<string, unknown>
}

/**
 * Workflow agent configuration (FR-016, FR-019)
 */
export interface WorkflowAgentConfig {
  /** Workflow graph definition */
  workflowGraph: WorkflowGraph

  /** Overall task description for the workflow */
  task: string

  /** Total budget for workflow coordination */
  budget: number

  /** Parent agent ID (if spawned by another agent) */
  parentId: string | null

  /** Depth level in hierarchy */
  depthLevel: number

  /** Base git branch for workspace isolation */
  baseBranch?: string
}

/**
 * Workflow execution progress (FR-022)
 */
export interface WorkflowProgress {
  /** Workflow graph ID */
  workflowId: string

  /** Overall status */
  status: WorkflowStatus

  /** Node completion statistics */
  nodeStats: {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    skipped: number
  }

  /** Budget consumption */
  budgetStats: {
    allocated: number
    consumed: number
    remaining: number
    percentUsed: number
    estimatedFinalUsage: number
  }

  /** Coordination overhead */
  coordinationOverhead: {
    messagesExchanged: number
    coordinationBudget: number
    overheadPercent: number
  }

  /** Execution timing */
  timing: {
    startedAt: Date
    estimatedCompletion: Date | null
    elapsedSeconds: number
  }

  /** Current active nodes */
  activeNodes: NodeProgress[]

  /** Failed nodes (if any) */
  failedNodes: NodeFailure[]
}

/**
 * Individual node progress information
 */
export interface NodeProgress {
  nodeId: string
  agentId: string
  role: string
  status: NodeStatus
  budgetRemaining: number
  progressPercent: number
}

/**
 * Node failure information
 */
export interface NodeFailure {
  nodeId: string
  agentId: string | null
  role: string
  error: {
    message: string
    code: string
    timestamp: Date
  }
}

/**
 * Workflow template definition (FR-020)
 */
export interface WorkflowTemplate {
  /** Unique template identifier */
  id: string

  /** Template name */
  name: string

  /** Template description */
  description: string

  /** Node templates with roles and budget percentages */
  nodeTemplates: NodeTemplate[]

  /** Edge patterns defining dependencies */
  edgePatterns: EdgePattern[]

  /** Estimated total budget requirement */
  estimatedBudget: number

  /** Complexity rating (1-10) */
  complexity: number

  /** Usage metadata */
  metadata: {
    usageCount: number
    successRate: number
    averageDuration: number
    createdBy: string | null
    createdAt: Date
  }
}

/**
 * Node template for workflow templates
 */
export interface NodeTemplate {
  id: string
  role: string
  taskTemplate: string // Template string with variables like {{feature}}
  budgetPercent: number // Percentage of total workflow budget
  dependencyIds: string[] // References to other node template IDs
  metadata: Record<string, unknown>
}

/**
 * Edge pattern for workflow templates
 */
export interface EdgePattern {
  fromNodeId: string // Reference to node template ID
  toNodeId: string // Reference to node template ID
  dependencyType: DependencyType
  condition: EdgeCondition
}

/**
 * Task decomposition request (FR-018)
 */
export interface DecompositionRequest {
  /** Task description to decompose */
  task: string

  /** Available budget for entire workflow */
  budget: number

  /** Optional hints for decomposition */
  hints?: {
    /** Suggested roles */
    roles?: string[]
    /** Preferred complexity level */
    complexity?: 'simple' | 'moderate' | 'complex'
    /** Parallelization preference */
    parallelization?: 'sequential' | 'balanced' | 'maximal'
  }
}

/**
 * Task decomposition result (FR-018)
 */
export interface DecompositionResult {
  /** Generated workflow graph */
  workflowGraph: WorkflowGraph

  /** Reasoning for decomposition strategy */
  reasoning: string

  /** Confidence score (0-1) */
  confidence: number

  /** Warnings or considerations */
  warnings: string[]
}

/**
 * Workflow validation result (FR-021)
 */
export interface ValidationResult {
  /** Whether workflow is valid */
  isValid: boolean

  /** Validation errors (if invalid) */
  errors: ValidationError[]

  /** Validation warnings (non-blocking) */
  warnings: ValidationWarning[]

  /** Graph analysis */
  analysis: {
    isAcyclic: boolean
    hasOrphanNodes: boolean
    maxParallelNodes: number
    estimatedDuration: number
    topologicalOrder: string[] | null
  }
}

export interface ValidationError {
  type: 'cycle' | 'invalid_role' | 'insufficient_budget' | 'invalid_dependency'
  message: string
  affectedNodes: string[]
  affectedEdges: string[]
}

export interface ValidationWarning {
  type: 'budget_imbalance' | 'deep_nesting' | 'high_parallelism'
  message: string
  recommendation: string
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when workflow graph is invalid (FR-021)
 */
export class WorkflowValidationError extends Error {
  constructor(
    public errors: ValidationError[],
    public workflowId: string
  ) {
    super(`Workflow validation failed: ${errors.map(e => e.message).join(', ')}`)
    this.name = 'WorkflowValidationError'
  }
}

/**
 * Thrown when workflow template not found
 */
export class TemplateNotFoundError extends Error {
  constructor(public templateId: string) {
    super(`Workflow template not found: ${templateId}`)
    this.name = 'TemplateNotFoundError'
  }
}

/**
 * Thrown when workflow operation fails
 */
export class WorkflowExecutionError extends Error {
  constructor(
    public workflowId: string,
    public failedNodes: NodeFailure[],
    message: string
  ) {
    super(message)
    this.name = 'WorkflowExecutionError'
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Creates a workflow agent from workflow graph (FR-016, FR-019)
 *
 * Spawns a special workflow agent that coordinates multiple subordinate agents
 * according to the provided workflow graph. The workflow agent presents as a
 * single logical unit to its parent.
 *
 * @param config - Workflow agent configuration
 * @returns Promise<WorkflowAgent> - Created workflow agent instance
 * @throws WorkflowValidationError if graph is invalid
 * @throws InsufficientBudgetError if budget insufficient
 *
 * @example
 * ```typescript
 * const workflowAgent = await createWorkflow({
 *   workflowGraph: backendDevGraph,
 *   task: 'Build REST API',
 *   budget: 200000,
 *   parentId: 'agent-orchestrator',
 *   depthLevel: 1
 * })
 * ```
 */
export interface CreateWorkflow {
  (config: WorkflowAgentConfig): Promise<WorkflowAgent>
}

export interface WorkflowAgent {
  /** Agent ID for the workflow coordinator */
  id: string

  /** Associated workflow graph ID */
  workflowGraphId: string

  /** Overall workflow status */
  status: WorkflowStatus

  /** Depth in hierarchy */
  depthLevel: number

  /** Parent agent ID */
  parentId: string | null

  /** Creation timestamp */
  createdAt: Date
}

/**
 * Decomposes task into workflow graph automatically (FR-018)
 *
 * Uses LLM-based analysis to decompose a complex task into a structured
 * workflow graph with appropriate roles, dependencies, and budget allocations.
 *
 * @param request - Decomposition request
 * @returns Promise<DecompositionResult> - Generated workflow graph
 *
 * @example
 * ```typescript
 * const result = await decomposeTask({
 *   task: 'Build full-stack e-commerce application',
 *   budget: 500000,
 *   hints: { complexity: 'complex', parallelization: 'balanced' }
 * })
 *
 * if (result.confidence > 0.8) {
 *   const agent = await createWorkflow({
 *     workflowGraph: result.workflowGraph,
 *     ...
 *   })
 * }
 * ```
 */
export interface DecomposeTask {
  (request: DecompositionRequest): Promise<DecompositionResult>
}

/**
 * Validates workflow graph before execution (FR-021)
 *
 * Checks workflow graph for cycles, invalid roles, budget sufficiency,
 * and dependency correctness. Returns detailed validation results.
 *
 * @param graph - Workflow graph to validate
 * @returns Promise<ValidationResult> - Validation results
 *
 * @example
 * ```typescript
 * const validation = await validateWorkflow(myGraph)
 *
 * if (!validation.isValid) {
 *   console.error('Validation errors:', validation.errors)
 *   return
 * }
 *
 * if (validation.warnings.length > 0) {
 *   console.warn('Validation warnings:', validation.warnings)
 * }
 * ```
 */
export interface ValidateWorkflow {
  (graph: WorkflowGraph): Promise<ValidationResult>
}

/**
 * Gets workflow execution progress (FR-022)
 *
 * Retrieves detailed progress information including node statuses,
 * budget consumption, coordination overhead, and timing estimates.
 *
 * @param workflowId - Workflow graph identifier
 * @returns Promise<WorkflowProgress> - Current workflow progress
 * @throws WorkflowNotFoundError if workflow does not exist
 *
 * @example
 * ```typescript
 * const progress = await getWorkflowProgress('wf-123')
 * console.log(`Nodes completed: ${progress.nodeStats.completed}/${progress.nodeStats.total}`)
 * console.log(`Budget used: ${progress.budgetStats.percentUsed}%`)
 * console.log(`Overhead: ${progress.coordinationOverhead.overheadPercent}%`)
 * ```
 */
export interface GetWorkflowProgress {
  (workflowId: string): Promise<WorkflowProgress>
}

/**
 * Loads workflow template by ID (FR-020)
 *
 * @param templateId - Template identifier
 * @returns Promise<WorkflowTemplate> - Workflow template
 * @throws TemplateNotFoundError if template does not exist
 *
 * @example
 * ```typescript
 * const template = await loadTemplate('backend-dev-workflow')
 * const graph = instantiateTemplate(template, { task: 'Build API', budget: 200000 })
 * ```
 */
export interface LoadTemplate {
  (templateId: string): Promise<WorkflowTemplate>
}

/**
 * Saves workflow template for reuse (FR-020)
 *
 * @param template - Template to save
 * @returns Promise<string> - Saved template ID
 *
 * @example
 * ```typescript
 * const templateId = await saveTemplate({
 *   name: 'microservice-workflow',
 *   description: 'Standard microservice development pattern',
 *   nodeTemplates: [...],
 *   edgePatterns: [...],
 *   estimatedBudget: 150000,
 *   complexity: 6,
 *   metadata: { ... }
 * })
 * ```
 */
export interface SaveTemplate {
  (template: Omit<WorkflowTemplate, 'id'>): Promise<string>
}

/**
 * Lists available workflow templates (FR-020)
 *
 * @param filter - Optional filter criteria
 * @returns Promise<WorkflowTemplate[]> - List of templates
 *
 * @example
 * ```typescript
 * const templates = await listTemplates({ complexity: 'moderate' })
 * templates.forEach(t => console.log(`${t.name}: ${t.description}`))
 * ```
 */
export interface ListTemplates {
  (filter?: TemplateFilter): Promise<WorkflowTemplate[]>
}

export interface TemplateFilter {
  complexity?: 'simple' | 'moderate' | 'complex'
  minSuccessRate?: number
  createdBy?: string
}

/**
 * Instantiates workflow graph from template (FR-020)
 *
 * Creates a concrete workflow graph from a template by filling in
 * task variables and calculating actual budget allocations.
 *
 * @param templateId - Template identifier
 * @param params - Instantiation parameters
 * @returns Promise<WorkflowGraph> - Instantiated workflow graph
 * @throws TemplateNotFoundError if template does not exist
 *
 * @example
 * ```typescript
 * const graph = await instantiateTemplate('backend-dev-workflow', {
 *   task: 'Build authentication service',
 *   budget: 200000,
 *   variables: { feature: 'authentication', framework: 'Express' }
 * })
 * ```
 */
export interface InstantiateTemplate {
  (templateId: string, params: TemplateInstantiationParams): Promise<WorkflowGraph>
}

export interface TemplateInstantiationParams {
  /** Overall task description */
  task: string

  /** Total budget for workflow */
  budget: number

  /** Variables to fill in task templates */
  variables?: Record<string, string>

  /** Override default budget allocations */
  budgetOverrides?: Record<string, number> // nodeId -> budget
}

/**
 * Pauses workflow execution (FR-022)
 *
 * @param workflowId - Workflow identifier
 * @returns Promise<void>
 * @throws WorkflowNotFoundError if workflow does not exist
 */
export interface PauseWorkflow {
  (workflowId: string): Promise<void>
}

/**
 * Resumes paused workflow execution (FR-022)
 *
 * @param workflowId - Workflow identifier
 * @returns Promise<void>
 * @throws WorkflowNotFoundError if workflow does not exist
 */
export interface ResumeWorkflow {
  (workflowId: string): Promise<void>
}

/**
 * Gets workflow graph definition (FR-017)
 *
 * @param workflowId - Workflow identifier
 * @returns Promise<WorkflowGraph> - Workflow graph
 * @throws WorkflowNotFoundError if workflow does not exist
 */
export interface GetWorkflowGraph {
  (workflowId: string): Promise<WorkflowGraph>
}

/**
 * Lists all workflows matching filter criteria (FR-016)
 *
 * @param filter - Optional filter criteria
 * @returns Promise<WorkflowAgent[]> - List of workflow agents
 */
export interface ListWorkflows {
  (filter?: WorkflowFilter): Promise<WorkflowAgent[]>
}

export interface WorkflowFilter {
  status?: WorkflowStatus
  parentId?: string
  depthLevel?: number
}
