/**
 * Workspace API Contracts
 * Feature: Hierarchical Agent Orchestration System - Workspace Isolation
 * Maps to: FR-007, FR-013, FR-015
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Workspace status (FR-007)
 */
export type WorkspaceStatus =
  | 'creating'     // Workspace being initialized
  | 'active'       // Workspace ready and in use
  | 'dirty'        // Workspace has uncommitted changes
  | 'merging'      // Workspace changes being merged
  | 'merged'       // Workspace successfully merged
  | 'conflicted'   // Workspace has merge conflicts
  | 'archived'     // Workspace archived after completion
  | 'error'        // Workspace in error state

/**
 * Workspace definition (FR-007)
 */
export interface Workspace {
  /** Unique workspace identifier */
  id: string

  /** Agent ID owning this workspace */
  agentId: string

  /** Absolute path to workspace directory */
  path: string

  /** Git worktree name (if using worktree isolation) */
  worktreeName: string | null

  /** Base git commit SHA */
  baseCommitSha: string

  /** Current git branch name */
  branchName: string

  /** Workspace status */
  status: WorkspaceStatus

  /** Isolation type */
  isolationType: 'worktree' | 'directory' | 'container'

  /** Creation timestamp */
  createdAt: Date

  /** Last modification timestamp */
  lastModifiedAt: Date

  /** Archived timestamp (if archived) */
  archivedAt: Date | null

  /** Workspace metadata */
  metadata: Record<string, unknown>
}

/**
 * File modification record (FR-015)
 */
export interface FileModification {
  /** Unique modification identifier */
  id: string

  /** Workspace ID */
  workspaceId: string

  /** Agent ID that made modification */
  agentId: string

  /** File path relative to workspace */
  filePath: string

  /** Modification type */
  modificationType: 'create' | 'update' | 'delete' | 'rename'

  /** Previous file path (if renamed) */
  previousPath: string | null

  /** Modification timestamp */
  timestamp: Date

  /** Git commit SHA (if committed) */
  commitSha: string | null

  /** Modification metadata */
  metadata: Record<string, unknown>
}

/**
 * Workspace diff information (FR-007)
 */
export interface WorkspaceDiff {
  /** Workspace ID */
  workspaceId: string

  /** Base commit SHA */
  baseCommitSha: string

  /** Current commit SHA */
  currentCommitSha: string | null

  /** Files created */
  filesCreated: string[]

  /** Files modified */
  filesModified: string[]

  /** Files deleted */
  filesDeleted: string[]

  /** Files renamed */
  filesRenamed: Array<{
    from: string
    to: string
  }>

  /** Total lines added */
  linesAdded: number

  /** Total lines deleted */
  linesDeleted: number

  /** Diff summary by file */
  fileDiffs: Array<{
    path: string
    linesAdded: number
    linesDeleted: number
    diffContent: string
  }>

  /** Diff generation timestamp */
  generatedAt: Date
}

/**
 * Workspace merge result (FR-007)
 */
export interface MergeResult {
  /** Workspace ID that was merged */
  workspaceId: string

  /** Merge status */
  status: 'success' | 'conflict' | 'error'

  /** Target branch that was merged into */
  targetBranch: string

  /** Merge commit SHA (if successful) */
  mergeCommitSha: string | null

  /** Files with merge conflicts (if any) */
  conflicts: Array<{
    filePath: string
    conflictMarkers: Array<{
      line: number
      type: 'ours' | 'theirs' | 'base'
      content: string
    }>
  }>

  /** Files successfully merged */
  mergedFiles: string[]

  /** Merge timestamp */
  mergedAt: Date

  /** Error message (if status === 'error') */
  error: string | null
}

/**
 * Workspace checkpoint (FR-013)
 */
export interface WorkspaceCheckpoint {
  /** Unique checkpoint identifier */
  id: string

  /** Workspace ID */
  workspaceId: string

  /** Agent ID */
  agentId: string

  /** Checkpoint type */
  type: 'manual' | 'automatic' | 'pre_merge' | 'milestone'

  /** Git commit SHA at checkpoint */
  commitSha: string

  /** Checkpoint label/name */
  label: string

  /** Checkpoint description */
  description: string | null

  /** Files modified since last checkpoint */
  filesSinceLastCheckpoint: string[]

  /** Budget consumed since last checkpoint */
  budgetSinceLastCheckpoint: number

  /** Checkpoint timestamp */
  createdAt: Date

  /** Checkpoint metadata */
  metadata: Record<string, unknown>
}

/**
 * Workspace statistics (FR-015)
 */
export interface WorkspaceStatistics {
  /** Workspace ID */
  workspaceId: string

  /** Total files in workspace */
  totalFiles: number

  /** Total directories in workspace */
  totalDirectories: number

  /** Workspace size in bytes */
  sizeBytes: number

  /** Number of commits made */
  commitCount: number

  /** Number of file modifications */
  modificationCount: number

  /** Number of checkpoints */
  checkpointCount: number

  /** Most modified files */
  mostModifiedFiles: Array<{
    path: string
    modificationCount: number
  }>

  /** Time spent in workspace (seconds) */
  timeSpentSeconds: number
}

/**
 * Workspace isolation configuration (FR-007)
 */
export interface WorkspaceIsolationConfig {
  /** Isolation type */
  type: 'worktree' | 'directory' | 'container'

  /** Base git branch to isolate from */
  baseBranch: string

  /** Create new branch for workspace */
  createBranch: boolean

  /** Branch name (auto-generated if not provided) */
  branchName?: string

  /** Copy .gitignore to workspace */
  copyGitignore: boolean

  /** Initialize git hooks in workspace */
  initializeHooks: boolean

  /** Custom workspace directory (for 'directory' type) */
  customDirectory?: string

  /** Container image (for 'container' type) */
  containerImage?: string
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when workspace creation fails (FR-007)
 */
export class WorkspaceCreationError extends Error {
  constructor(
    public agentId: string,
    public reason: string
  ) {
    super(`Failed to create workspace for agent ${agentId}: ${reason}`)
    this.name = 'WorkspaceCreationError'
  }
}

/**
 * Thrown when workspace not found
 */
export class WorkspaceNotFoundError extends Error {
  constructor(public workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`)
    this.name = 'WorkspaceNotFoundError'
  }
}

/**
 * Thrown when merge fails (FR-007)
 */
export class MergeConflictError extends Error {
  constructor(
    public workspaceId: string,
    public conflicts: Array<{ filePath: string }>
  ) {
    super(`Merge conflict in workspace ${workspaceId}: ${conflicts.length} files`)
    this.name = 'MergeConflictError'
  }
}

/**
 * Thrown when workspace operation is invalid
 */
export class InvalidWorkspaceOperationError extends Error {
  constructor(
    public operation: string,
    public workspaceStatus: WorkspaceStatus,
    public reason: string
  ) {
    super(`Cannot ${operation} when workspace is ${workspaceStatus}: ${reason}`)
    this.name = 'InvalidWorkspaceOperationError'
  }
}

/**
 * Thrown when checkpoint restoration fails (FR-013)
 */
export class CheckpointRestoreError extends Error {
  constructor(
    public checkpointId: string,
    public reason: string
  ) {
    super(`Failed to restore checkpoint ${checkpointId}: ${reason}`)
    this.name = 'CheckpointRestoreError'
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Creates isolated workspace for agent (FR-007)
 *
 * Initializes a new isolated workspace with its own copy of the codebase
 * at specified base commit. Uses git worktree, directory copy, or container
 * based on configuration.
 *
 * @param agentId - Agent identifier
 * @param config - Workspace isolation configuration
 * @returns Promise<Workspace> - Created workspace
 * @throws WorkspaceCreationError if creation fails
 * @throws AgentNotFoundError if agent does not exist
 *
 * @example
 * ```typescript
 * const workspace = await createWorkspace('agent-123', {
 *   type: 'worktree',
 *   baseBranch: 'main',
 *   createBranch: true,
 *   branchName: 'agent-123-feature',
 *   copyGitignore: true,
 *   initializeHooks: false
 * })
 *
 * console.log(`Workspace created at: ${workspace.path}`)
 * ```
 */
export interface CreateWorkspace {
  (agentId: string, config: WorkspaceIsolationConfig): Promise<Workspace>
}

/**
 * Gets workspace details (FR-007)
 *
 * @param agentId - Agent identifier
 * @returns Promise<Workspace> - Workspace details
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const workspace = await getWorkspace('agent-456')
 * console.log(`Status: ${workspace.status}`)
 * console.log(`Path: ${workspace.path}`)
 * ```
 */
export interface GetWorkspace {
  (agentId: string): Promise<Workspace>
}

/**
 * Gets workspace diff from base commit (FR-007)
 *
 * Retrieves comprehensive diff showing all changes made in workspace
 * compared to base commit.
 *
 * @param workspaceId - Workspace identifier
 * @returns Promise<WorkspaceDiff> - Workspace diff
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const diff = await getWorkspaceDiff('ws-789')
 * console.log(`Files created: ${diff.filesCreated.length}`)
 * console.log(`Files modified: ${diff.filesModified.length}`)
 * console.log(`Lines added: ${diff.linesAdded}`)
 * console.log(`Lines deleted: ${diff.linesDeleted}`)
 *
 * // Review specific file changes
 * diff.fileDiffs.forEach(fd => {
 *   console.log(`${fd.path}: +${fd.linesAdded} -${fd.linesDeleted}`)
 * })
 * ```
 */
export interface GetWorkspaceDiff {
  (workspaceId: string): Promise<WorkspaceDiff>
}

/**
 * Merges workspace changes to target branch (FR-007)
 *
 * Attempts to merge all workspace changes into specified target branch.
 * Returns conflict information if merge cannot be completed automatically.
 *
 * @param workspaceId - Workspace identifier
 * @param targetBranch - Target branch to merge into
 * @param options - Merge options
 * @returns Promise<MergeResult> - Merge result
 * @throws WorkspaceNotFoundError if workspace does not exist
 * @throws InvalidWorkspaceOperationError if workspace not ready for merge
 *
 * @example
 * ```typescript
 * const result = await mergeWorkspace('ws-789', 'main', {
 *   strategy: 'recursive',
 *   createPullRequest: true,
 *   deleteBranchAfterMerge: false
 * })
 *
 * if (result.status === 'success') {
 *   console.log(`Merged successfully: ${result.mergeCommitSha}`)
 * } else if (result.status === 'conflict') {
 *   console.error(`Merge conflicts in ${result.conflicts.length} files`)
 *   result.conflicts.forEach(c => console.error(`  - ${c.filePath}`))
 * }
 * ```
 */
export interface MergeWorkspace {
  (workspaceId: string, targetBranch: string, options?: MergeOptions): Promise<MergeResult>
}

export interface MergeOptions {
  /** Merge strategy */
  strategy?: 'recursive' | 'ours' | 'theirs' | 'octopus'

  /** Create pull request instead of direct merge */
  createPullRequest?: boolean

  /** Delete workspace branch after successful merge */
  deleteBranchAfterMerge?: boolean

  /** Squash commits before merging */
  squash?: boolean

  /** Merge commit message */
  commitMessage?: string
}

/**
 * Cleans up workspace (FR-007)
 *
 * Archives workspace and optionally removes workspace directory.
 * Only callable after workspace is merged or agent is terminated.
 *
 * @param workspaceId - Workspace identifier
 * @param options - Cleanup options
 * @returns Promise<void>
 * @throws WorkspaceNotFoundError if workspace does not exist
 * @throws InvalidWorkspaceOperationError if workspace has unmerged changes
 *
 * @example
 * ```typescript
 * await cleanupWorkspace('ws-completed', {
 *   removeDirectory: true,
 *   removeWorktree: true,
 *   archiveMetadata: true
 * })
 * ```
 */
export interface CleanupWorkspace {
  (workspaceId: string, options?: CleanupOptions): Promise<void>
}

export interface CleanupOptions {
  /** Remove workspace directory from filesystem */
  removeDirectory?: boolean

  /** Remove git worktree (if using worktree isolation) */
  removeWorktree?: boolean

  /** Archive workspace metadata in database */
  archiveMetadata?: boolean
}

/**
 * Creates checkpoint of workspace state (FR-013)
 *
 * Saves current workspace state for potential rollback or resume.
 * Commits all current changes and stores checkpoint metadata.
 *
 * @param workspaceId - Workspace identifier
 * @param checkpoint - Checkpoint details
 * @returns Promise<WorkspaceCheckpoint> - Created checkpoint
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const checkpoint = await createCheckpoint('ws-123', {
 *   type: 'milestone',
 *   label: 'API endpoints complete',
 *   description: 'All REST endpoints implemented and tested'
 * })
 *
 * console.log(`Checkpoint created: ${checkpoint.id}`)
 * ```
 */
export interface CreateCheckpoint {
  (workspaceId: string, checkpoint: CheckpointRequest): Promise<WorkspaceCheckpoint>
}

export interface CheckpointRequest {
  type: 'manual' | 'automatic' | 'pre_merge' | 'milestone'
  label: string
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * Lists checkpoints for workspace (FR-013)
 *
 * @param workspaceId - Workspace identifier
 * @param options - Query options
 * @returns Promise<WorkspaceCheckpoint[]> - List of checkpoints
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const checkpoints = await listCheckpoints('ws-123', {
 *   type: 'milestone',
 *   orderBy: 'createdAt',
 *   order: 'desc'
 * })
 * ```
 */
export interface ListCheckpoints {
  (workspaceId: string, options?: CheckpointQueryOptions): Promise<WorkspaceCheckpoint[]>
}

export interface CheckpointQueryOptions {
  type?: 'manual' | 'automatic' | 'pre_merge' | 'milestone'
  limit?: number
  orderBy?: 'createdAt'
  order?: 'asc' | 'desc'
}

/**
 * Restores workspace to checkpoint state (FR-013)
 *
 * Rolls back workspace to a previous checkpoint state. All changes
 * made after checkpoint are lost unless committed.
 *
 * @param workspaceId - Workspace identifier
 * @param checkpointId - Checkpoint identifier to restore
 * @returns Promise<void>
 * @throws WorkspaceNotFoundError if workspace does not exist
 * @throws CheckpointRestoreError if restore fails
 *
 * @example
 * ```typescript
 * await restoreCheckpoint('ws-123', 'cp-milestone-456')
 * console.log('Workspace restored to checkpoint')
 * ```
 */
export interface RestoreCheckpoint {
  (workspaceId: string, checkpointId: string): Promise<void>
}

/**
 * Lists file modifications in workspace (FR-015)
 *
 * @param workspaceId - Workspace identifier
 * @param options - Query options
 * @returns Promise<FileModification[]> - List of file modifications
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const mods = await listFileModifications('ws-789', {
 *   modificationType: 'update',
 *   limit: 100
 * })
 *
 * console.log(`Total modifications: ${mods.length}`)
 * ```
 */
export interface ListFileModifications {
  (workspaceId: string, options?: FileModificationQueryOptions): Promise<FileModification[]>
}

export interface FileModificationQueryOptions {
  modificationType?: 'create' | 'update' | 'delete' | 'rename'
  filePath?: string // Filter by specific file path
  since?: Date
  limit?: number
  orderBy?: 'timestamp'
  order?: 'asc' | 'desc'
}

/**
 * Gets workspace statistics (FR-015)
 *
 * @param workspaceId - Workspace identifier
 * @returns Promise<WorkspaceStatistics> - Workspace statistics
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const stats = await getWorkspaceStatistics('ws-123')
 * console.log(`Total files: ${stats.totalFiles}`)
 * console.log(`Workspace size: ${(stats.sizeBytes / 1024 / 1024).toFixed(2)} MB`)
 * console.log(`Commits: ${stats.commitCount}`)
 * console.log(`Most modified: ${stats.mostModifiedFiles[0]?.path}`)
 * ```
 */
export interface GetWorkspaceStatistics {
  (workspaceId: string): Promise<WorkspaceStatistics>
}

/**
 * Lists all workspaces matching filter (FR-007)
 *
 * @param filter - Optional filter criteria
 * @returns Promise<Workspace[]> - List of workspaces
 *
 * @example
 * ```typescript
 * const activeWorkspaces = await listWorkspaces({ status: 'active' })
 * const dirtyWorkspaces = await listWorkspaces({ status: 'dirty' })
 * ```
 */
export interface ListWorkspaces {
  (filter?: WorkspaceFilter): Promise<Workspace[]>
}

export interface WorkspaceFilter {
  status?: WorkspaceStatus
  agentId?: string
  isolationType?: 'worktree' | 'directory' | 'container'
  createdAfter?: Date
  createdBefore?: Date
}

/**
 * Commits changes in workspace (FR-007)
 *
 * Commits all uncommitted changes in workspace with specified message.
 *
 * @param workspaceId - Workspace identifier
 * @param commitMessage - Commit message
 * @returns Promise<string> - Commit SHA
 * @throws WorkspaceNotFoundError if workspace does not exist
 *
 * @example
 * ```typescript
 * const commitSha = await commitChanges('ws-123', 'Implement user authentication')
 * console.log(`Committed: ${commitSha}`)
 * ```
 */
export interface CommitWorkspaceChanges {
  (workspaceId: string, commitMessage: string): Promise<string>
}
