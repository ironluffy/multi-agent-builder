import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../utils/Logger.js';

const execAsync = promisify(exec);

/**
 * Worktree information
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  agentId: string;
}

/**
 * GitWorktree Service
 * Manages Git worktree creation, deletion, and operations for agent workspace isolation
 *
 * Features:
 * - Create isolated Git worktrees for each agent
 * - Automatic branch creation with agent-specific names
 * - Cleanup and removal of worktrees on agent completion
 * - Status tracking and validation
 *
 * Each agent gets its own worktree:
 * - Isolated file system workspace
 * - Dedicated Git branch
 * - No conflicts with other agents
 */
export class GitWorktree {
  private worktreeLogger = logger.child({ component: 'GitWorktree' });
  private readonly baseWorktreePath: string;
  private readonly mainRepoPath: string;

  constructor(options?: {
    baseWorktreePath?: string;
    mainRepoPath?: string;
  }) {
    this.mainRepoPath = options?.mainRepoPath || process.cwd();
    this.baseWorktreePath = options?.baseWorktreePath ||
      path.join(this.mainRepoPath, '.worktrees');
  }

  /**
   * Create a new Git worktree for an agent
   * Creates isolated workspace with dedicated branch
   *
   * @param agentId - Agent UUID
   * @param branchName - Optional custom branch name (defaults to agent-{agentId})
   * @returns WorktreeInfo with path and branch details
   */
  async createWorktree(
    agentId: string,
    branchName?: string
  ): Promise<WorktreeInfo> {
    const branch = branchName || `agent-${agentId}`;
    const worktreePath = path.join(this.baseWorktreePath, agentId);

    try {
      // Ensure base worktree directory exists
      await fs.mkdir(this.baseWorktreePath, { recursive: true });

      // Check if worktree already exists
      const exists = await this.worktreeExists(worktreePath);
      if (exists) {
        this.worktreeLogger.warn(
          { agent_id: agentId, path: worktreePath },
          'Worktree already exists, removing old worktree'
        );
        await this.deleteWorktree(agentId);
      }

      // Create new worktree with branch
      // git worktree add -b <branch> <path> HEAD
      const command = `git worktree add -b ${branch} "${worktreePath}" HEAD`;

      this.worktreeLogger.debug(
        { agent_id: agentId, command },
        'Creating worktree'
      );

      const { stderr } = await execAsync(command, {
        cwd: this.mainRepoPath,
      });

      if (stderr && !stderr.includes('Preparing worktree')) {
        this.worktreeLogger.warn(
          { agent_id: agentId, stderr },
          'Git worktree creation warning'
        );
      }

      this.worktreeLogger.info(
        {
          agent_id: agentId,
          branch,
          path: worktreePath,
        },
        'Worktree created successfully'
      );

      return {
        path: worktreePath,
        branch,
        agentId,
      };
    } catch (error: any) {
      // Handle case where branch already exists
      if (error.message?.includes('already exists')) {
        this.worktreeLogger.warn(
          { agent_id: agentId, branch },
          'Branch already exists, creating worktree from existing branch'
        );

        try {
          // Create worktree from existing branch
          const command = `git worktree add "${worktreePath}" ${branch}`;
          await execAsync(command, { cwd: this.mainRepoPath });

          this.worktreeLogger.info(
            { agent_id: agentId, branch, path: worktreePath },
            'Worktree created from existing branch'
          );

          return {
            path: worktreePath,
            branch,
            agentId,
          };
        } catch (retryError) {
          this.worktreeLogger.error(
            { error: retryError, agent_id: agentId, branch },
            'Failed to create worktree from existing branch'
          );
          throw retryError;
        }
      }

      this.worktreeLogger.error(
        { error, agent_id: agentId, branch },
        'Failed to create worktree'
      );
      throw error;
    }
  }

  /**
   * Delete a Git worktree for an agent
   * Removes workspace and cleans up branch
   *
   * @param agentId - Agent UUID
   * @param force - Force removal even if worktree has uncommitted changes
   * @returns True if deletion succeeded
   */
  async deleteWorktree(agentId: string, force: boolean = false): Promise<boolean> {
    const worktreePath = path.join(this.baseWorktreePath, agentId);

    try {
      // Check if worktree exists
      const exists = await this.worktreeExists(worktreePath);
      if (!exists) {
        this.worktreeLogger.warn(
          { agent_id: agentId, path: worktreePath },
          'Worktree does not exist, nothing to delete'
        );
        return false;
      }

      // Get branch name before deletion
      const branch = await this.getWorktreeBranch(worktreePath);

      // Remove worktree
      const forceFlag = force ? '--force' : '';
      const command = `git worktree remove ${forceFlag} "${worktreePath}"`;

      this.worktreeLogger.debug(
        { agent_id: agentId, command },
        'Deleting worktree'
      );

      const { stderr } = await execAsync(command, {
        cwd: this.mainRepoPath,
      });

      if (stderr) {
        this.worktreeLogger.warn(
          { agent_id: agentId, stderr },
          'Git worktree removal warning'
        );
      }

      // Prune worktree references
      await execAsync('git worktree prune', { cwd: this.mainRepoPath });

      this.worktreeLogger.info(
        {
          agent_id: agentId,
          branch,
          path: worktreePath,
        },
        'Worktree deleted successfully'
      );

      return true;
    } catch (error) {
      this.worktreeLogger.error(
        { error, agent_id: agentId },
        'Failed to delete worktree'
      );
      throw error;
    }
  }

  /**
   * Check if a worktree exists at the given path
   *
   * @param worktreePath - Full path to worktree
   * @returns True if worktree exists
   */
  private async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the branch name for a worktree
   *
   * @param worktreePath - Full path to worktree
   * @returns Branch name
   */
  private async getWorktreeBranch(worktreePath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', {
        cwd: worktreePath,
      });
      return stdout.trim();
    } catch (error) {
      this.worktreeLogger.error(
        { error, path: worktreePath },
        'Failed to get worktree branch'
      );
      return 'unknown';
    }
  }

  /**
   * List all worktrees
   *
   * @returns Array of worktree information
   */
  async listWorktrees(): Promise<Array<{
    path: string;
    branch: string;
    commit: string;
  }>> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: this.mainRepoPath,
      });

      const worktrees: Array<{ path: string; branch: string; commit: string }> = [];
      const lines = stdout.trim().split('\n');

      let current: any = {};
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch refs/heads/'.length);
        } else if (line.startsWith('HEAD ')) {
          current.commit = line.substring('HEAD '.length);
        } else if (line === '') {
          if (current.path) {
            worktrees.push(current);
          }
          current = {};
        }
      }

      // Add last worktree if exists
      if (current.path) {
        worktrees.push(current);
      }

      return worktrees;
    } catch (error) {
      this.worktreeLogger.error({ error }, 'Failed to list worktrees');
      throw error;
    }
  }

  /**
   * Get worktree information for a specific agent
   *
   * @param agentId - Agent UUID
   * @returns WorktreeInfo if exists, null otherwise
   */
  async getWorktreeInfo(agentId: string): Promise<WorktreeInfo | null> {
    const worktreePath = path.join(this.baseWorktreePath, agentId);

    try {
      const exists = await this.worktreeExists(worktreePath);
      if (!exists) {
        return null;
      }

      const branch = await this.getWorktreeBranch(worktreePath);

      return {
        path: worktreePath,
        branch,
        agentId,
      };
    } catch (error) {
      this.worktreeLogger.error(
        { error, agent_id: agentId },
        'Failed to get worktree info'
      );
      return null;
    }
  }

  /**
   * Cleanup all worktrees (use with caution!)
   * Removes all agent worktrees
   *
   * @returns Number of worktrees deleted
   */
  async cleanupAllWorktrees(): Promise<number> {
    try {
      const worktrees = await this.listWorktrees();
      let deleted = 0;

      for (const wt of worktrees) {
        // Skip main worktree
        if (wt.path === this.mainRepoPath) {
          continue;
        }

        // Extract agent ID from path
        const agentId = path.basename(wt.path);

        try {
          await this.deleteWorktree(agentId, true);
          deleted++;
        } catch (error) {
          this.worktreeLogger.warn(
            { error, agent_id: agentId },
            'Failed to delete worktree during cleanup'
          );
        }
      }

      this.worktreeLogger.info({ deleted }, 'Cleanup complete');
      return deleted;
    } catch (error) {
      this.worktreeLogger.error({ error }, 'Failed to cleanup worktrees');
      throw error;
    }
  }

  /**
   * Get workspace diff for an agent
   * Shows changes in the agent's worktree compared to HEAD
   *
   * @param agentId - Agent UUID
   * @param options - Diff options
   * @returns Git diff output
   */
  async getWorkspaceDiff(
    agentId: string,
    options?: {
      cached?: boolean;
      nameOnly?: boolean;
      stat?: boolean;
    }
  ): Promise<string> {
    const worktreePath = path.join(this.baseWorktreePath, agentId);

    try {
      // Check if worktree exists
      const exists = await this.worktreeExists(worktreePath);
      if (!exists) {
        throw new Error(`Worktree for agent ${agentId} does not exist`);
      }

      // Build git diff command
      let command = 'git diff';

      if (options?.cached) {
        command += ' --cached';
      }

      if (options?.nameOnly) {
        command += ' --name-only';
      }

      if (options?.stat) {
        command += ' --stat';
      }

      this.worktreeLogger.debug(
        { agent_id: agentId, command },
        'Getting workspace diff'
      );

      const { stdout } = await execAsync(command, {
        cwd: worktreePath,
      });

      return stdout;
    } catch (error) {
      this.worktreeLogger.error(
        { error, agent_id: agentId },
        'Failed to get workspace diff'
      );
      throw error;
    }
  }

  /**
   * Check if worktree has uncommitted changes
   *
   * @param agentId - Agent UUID
   * @returns True if there are uncommitted changes
   */
  async hasUncommittedChanges(agentId: string): Promise<boolean> {
    try {
      const diff = await this.getWorkspaceDiff(agentId);
      return diff.trim().length > 0;
    } catch (error) {
      this.worktreeLogger.error(
        { error, agent_id: agentId },
        'Failed to check for uncommitted changes'
      );
      throw error;
    }
  }

  /**
   * Get list of changed files in worktree
   *
   * @param agentId - Agent UUID
   * @returns Array of changed file paths
   */
  async getChangedFiles(agentId: string): Promise<string[]> {
    try {
      const diff = await this.getWorkspaceDiff(agentId, { nameOnly: true });
      return diff
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch (error) {
      this.worktreeLogger.error(
        { error, agent_id: agentId },
        'Failed to get changed files'
      );
      throw error;
    }
  }
}
