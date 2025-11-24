import { GitWorktree } from '../infrastructure/GitWorktree.js';
import { WorkspaceRepository } from '../database/repositories/WorkspaceRepository.js';
import { logger } from '../utils/Logger.js';
import type { IsolationStatus } from '../database/repositories/WorkspaceRepository.js';

/**
 * Workspace Cleanup Service
 * Periodically cleans up abandoned, merged, or deleted workspaces
 *
 * Features:
 * - Automatic cleanup of old workspaces
 * - Status-based filtering (merged, deleted)
 * - Configurable cleanup intervals
 * - Safe removal with error recovery
 */
export class WorkspaceCleanupService {
  private cleanupLogger = logger.child({ component: 'WorkspaceCleanupService' });
  private gitWorktree: GitWorktree;
  private workspaceRepo: WorkspaceRepository;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.gitWorktree = new GitWorktree();
    this.workspaceRepo = new WorkspaceRepository();
  }

  /**
   * Cleanup workspaces with specific status
   *
   * @param status - Status to cleanup ('merged' or 'deleted')
   * @param maxAge - Maximum age in days (optional, defaults to immediate cleanup)
   * @returns Number of workspaces cleaned
   */
  async cleanupByStatus(
    status: IsolationStatus,
    options?: {
      maxAge?: number;
      force?: boolean;
    }
  ): Promise<number> {
    try {
      const workspaces = await this.workspaceRepo.getByStatus(status);
      let cleaned = 0;

      this.cleanupLogger.info(
        { status, count: workspaces.length },
        'Starting workspace cleanup'
      );

      for (const workspace of workspaces) {
        try {
          // Check age if maxAge specified
          if (options?.maxAge) {
            const ageInDays = this.getWorkspaceAgeInDays(workspace.updated_at);
            if (ageInDays < options.maxAge) {
              this.cleanupLogger.debug(
                { workspace_id: workspace.id, age: ageInDays, maxAge: options.maxAge },
                'Workspace too recent, skipping cleanup'
              );
              continue;
            }
          }

          // Delete worktree from filesystem
          const deleted = await this.gitWorktree.deleteWorktree(
            workspace.agent_id,
            options?.force || false
          );

          if (deleted) {
            // Remove workspace record from database
            await this.workspaceRepo.delete(workspace.id);
            cleaned++;

            this.cleanupLogger.info(
              { workspace_id: workspace.id, agent_id: workspace.agent_id },
              'Workspace cleaned up'
            );
          }
        } catch (error) {
          this.cleanupLogger.warn(
            { error, workspace_id: workspace.id, agent_id: workspace.agent_id },
            'Failed to cleanup individual workspace'
          );
          // Continue with next workspace
        }
      }

      this.cleanupLogger.info({ status, cleaned }, 'Workspace cleanup complete');
      return cleaned;
    } catch (error) {
      this.cleanupLogger.error({ error, status }, 'Failed to cleanup workspaces');
      throw error;
    }
  }

  /**
   * Cleanup all merged workspaces
   * Removes workspaces that have been successfully merged
   *
   * @param maxAge - Maximum age in days before cleanup
   * @returns Number of workspaces cleaned
   */
  async cleanupMerged(maxAge: number = 7): Promise<number> {
    return this.cleanupByStatus('merged', { maxAge });
  }

  /**
   * Cleanup all deleted workspaces
   * Removes workspaces marked as deleted
   *
   * @param maxAge - Maximum age in days before cleanup
   * @returns Number of workspaces cleaned
   */
  async cleanupDeleted(maxAge: number = 1): Promise<number> {
    return this.cleanupByStatus('deleted', { maxAge });
  }

  /**
   * Run complete cleanup cycle
   * Cleans up both merged and deleted workspaces
   *
   * @returns Total number of workspaces cleaned
   */
  async runCleanupCycle(): Promise<number> {
    this.cleanupLogger.info('Starting cleanup cycle');

    try {
      const mergedCount = await this.cleanupMerged(7); // 7 days for merged
      const deletedCount = await this.cleanupDeleted(1); // 1 day for deleted

      const total = mergedCount + deletedCount;

      this.cleanupLogger.info(
        { merged: mergedCount, deleted: deletedCount, total },
        'Cleanup cycle complete'
      );

      return total;
    } catch (error) {
      this.cleanupLogger.error({ error }, 'Cleanup cycle failed');
      throw error;
    }
  }

  /**
   * Start automatic cleanup scheduler
   * Runs cleanup cycle periodically
   *
   * @param intervalHours - Interval in hours between cleanup cycles (default: 24)
   */
  startScheduler(intervalHours: number = 24): void {
    if (this.cleanupInterval) {
      this.cleanupLogger.warn('Cleanup scheduler already running');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.runCleanupCycle();
      } catch (error) {
        this.cleanupLogger.error({ error }, 'Scheduled cleanup failed');
      }
    }, intervalMs);

    this.cleanupLogger.info(
      { intervalHours },
      'Workspace cleanup scheduler started'
    );
  }

  /**
   * Stop automatic cleanup scheduler
   */
  stopScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.cleanupLogger.info('Workspace cleanup scheduler stopped');
    }
  }

  /**
   * Get workspace age in days
   *
   * @param updatedAt - Last updated timestamp
   * @returns Age in days
   */
  private getWorkspaceAgeInDays(updatedAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - new Date(updatedAt).getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  /**
   * Get cleanup statistics
   *
   * @returns Statistics about workspaces
   */
  async getCleanupStats(): Promise<{
    active: number;
    merged: number;
    deleted: number;
    total: number;
  }> {
    try {
      return await this.workspaceRepo.countByStatus();
    } catch (error) {
      this.cleanupLogger.error({ error }, 'Failed to get cleanup stats');
      throw error;
    }
  }
}
