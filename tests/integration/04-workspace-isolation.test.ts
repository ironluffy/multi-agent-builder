// Configure test environment before imports
import '../setup/test-env-setup.js';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../src/infrastructure/SharedDatabase.js';
import { AgentService } from '../../src/services/AgentService.js';
import { GitWorktree } from '../../src/infrastructure/GitWorktree.js';
import { WorkspaceRepository } from '../../src/database/repositories/WorkspaceRepository.js';
import { WorkspaceCleanupService } from '../../src/services/WorkspaceCleanupService.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Integration Tests for US4: Workspace Isolation
 *
 * Tests verify:
 * - Git worktree creation per agent
 * - Isolated file modifications (SC-005: no conflicts)
 * - Workspace diff tracking
 * - Cleanup and status management
 */

describe('US4: Workspace Isolation', () => {
  let agentService: AgentService;
  let gitWorktree: GitWorktree;
  let workspaceRepo: WorkspaceRepository;
  let cleanupService: WorkspaceCleanupService;

  beforeAll(async () => {
    // Initialize test database connection
    await db.initialize();

    agentService = new AgentService();
    gitWorktree = new GitWorktree();
    workspaceRepo = new WorkspaceRepository();
    cleanupService = new WorkspaceCleanupService();
  });

  afterAll(async () => {
    // Cleanup all test workspaces
    try {
      await gitWorktree.cleanupAllWorktrees();
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }

    await db.shutdown();
  });

  beforeEach(async () => {
    // Clean test data
    await db.query('DELETE FROM workspaces');
    await db.query('DELETE FROM budgets');
    await db.query('DELETE FROM hierarchies');
    await db.query('DELETE FROM agents');

    // Clean test worktrees
    try {
      await gitWorktree.cleanupAllWorktrees();
    } catch (error) {
      // Ignore cleanup errors in beforeEach
    }
  });

  // ==========================================================================
  // Workspace Creation
  // ==========================================================================

  it('should create isolated workspace when spawning agent', async () => {
    const agentId = await agentService.spawnAgent(
      'TestAgent',
      'Test workspace isolation',
      10000
    );

    // Verify workspace record exists
    const workspace = await workspaceRepo.findByAgentId(agentId);

    expect(workspace).not.toBeNull();
    expect(workspace!.agent_id).toBe(agentId);
    expect(workspace!.isolation_status).toBe('active');
    expect(workspace!.worktree_path).toContain(agentId);
    expect(workspace!.branch_name).toBe(`agent-${agentId}`);

    // Verify worktree directory exists
    const workspaceInfo = await gitWorktree.getWorktreeInfo(agentId);
    expect(workspaceInfo).not.toBeNull();
    expect(workspaceInfo!.agentId).toBe(agentId);
  });

  it('should list all worktrees', async () => {
    // Create 3 agents with workspaces
    const agent1 = await agentService.spawnAgent('Agent1', 'Task 1', 5000);
    const agent2 = await agentService.spawnAgent('Agent2', 'Task 2', 5000);
    const agent3 = await agentService.spawnAgent('Agent3', 'Task 3', 5000);

    // List all worktrees
    const worktrees = await gitWorktree.listWorktrees();

    // Should have main worktree + 3 agent worktrees
    expect(worktrees.length).toBeGreaterThanOrEqual(3);

    // Verify agent worktrees are present
    const agentIds = [agent1, agent2, agent3];
    for (const agentId of agentIds) {
      const worktreeInfo = await gitWorktree.getWorktreeInfo(agentId);
      expect(worktreeInfo).not.toBeNull();
    }
  });

  // ==========================================================================
  // WP06.9: Parallel File Modifications (SC-005)
  // ==========================================================================

  it('should isolate file modifications between agents (SC-005)', async () => {
    // Create two agents
    const agent1 = await agentService.spawnAgent('Agent1', 'Modify file', 5000);
    const agent2 = await agentService.spawnAgent('Agent2', 'Modify file', 5000);

    // Get workspace info
    const workspace1 = await workspaceRepo.findByAgentId(agent1);
    const workspace2 = await workspaceRepo.findByAgentId(agent2);

    expect(workspace1).not.toBeNull();
    expect(workspace2).not.toBeNull();

    // Create test file in agent 1's workspace
    const testFile1 = path.join(workspace1!.worktree_path, 'test.txt');
    await fs.writeFile(testFile1, 'Agent 1 content\n', 'utf-8');

    // Create test file in agent 2's workspace (same name, different content)
    const testFile2 = path.join(workspace2!.worktree_path, 'test.txt');
    await fs.writeFile(testFile2, 'Agent 2 content\n', 'utf-8');

    // Verify files exist and have different content
    const content1 = await fs.readFile(testFile1, 'utf-8');
    const content2 = await fs.readFile(testFile2, 'utf-8');

    expect(content1).toBe('Agent 1 content\n');
    expect(content2).toBe('Agent 2 content\n');
    expect(content1).not.toBe(content2);

    // Verify workspaces are truly isolated (different paths)
    expect(workspace1!.worktree_path).not.toBe(workspace2!.worktree_path);
  });

  it('should allow parallel modifications without conflicts', async () => {
    // Create 3 agents
    const agents = await Promise.all([
      agentService.spawnAgent('ParallelAgent1', 'Task 1', 3000),
      agentService.spawnAgent('ParallelAgent2', 'Task 2', 3000),
      agentService.spawnAgent('ParallelAgent3', 'Task 3', 3000),
    ]);

    // Modify files in parallel
    const modifications = agents.map(async (agentId, index) => {
      const workspace = await workspaceRepo.findByAgentId(agentId);
      const testFile = path.join(workspace!.worktree_path, 'parallel.txt');
      await fs.writeFile(testFile, `Content from agent ${index + 1}\n`, 'utf-8');
      return { agentId, file: testFile };
    });

    // Wait for all modifications
    const results = await Promise.all(modifications);

    // Verify all files were created successfully
    expect(results).toHaveLength(3);

    // Verify each file has unique content
    for (let i = 0; i < results.length; i++) {
      const content = await fs.readFile(results[i].file, 'utf-8');
      expect(content).toBe(`Content from agent ${i + 1}\n`);
    }
  });

  // ==========================================================================
  // WP06.10: Workspace Diff and Merge
  // ==========================================================================

  it('should track workspace diff for modified files', async () => {
    const agentId = await agentService.spawnAgent('DiffAgent', 'Test diff', 5000);

    const workspace = await workspaceRepo.findByAgentId(agentId);
    expect(workspace).not.toBeNull();

    // Initially, no changes
    const initialDiff = await gitWorktree.getWorkspaceDiff(agentId);
    expect(initialDiff.trim()).toBe('');

    // Modify a file
    const testFile = path.join(workspace!.worktree_path, 'modified.txt');
    await fs.writeFile(testFile, 'This file was modified\n', 'utf-8');

    // Check for uncommitted changes
    const hasChanges = await gitWorktree.hasUncommittedChanges(agentId);
    expect(hasChanges).toBe(true);

    // Get changed files list
    const changedFiles = await gitWorktree.getChangedFiles(agentId);
    expect(changedFiles).toContain('modified.txt');

    // Get diff with stats
    const diffWithStats = await gitWorktree.getWorkspaceDiff(agentId, { stat: true });
    expect(diffWithStats).toContain('modified.txt');
  });

  it('should get workspace diff with different options', async () => {
    const agentId = await agentService.spawnAgent('DiffOptionsAgent', 'Test diff options', 5000);

    const workspace = await workspaceRepo.findByAgentId(agentId);
    const testFile = path.join(workspace!.worktree_path, 'options.txt');
    await fs.writeFile(testFile, 'Test content\n', 'utf-8');

    // Test different diff options
    const diffNameOnly = await gitWorktree.getWorkspaceDiff(agentId, { nameOnly: true });
    expect(diffNameOnly.trim()).toBe('options.txt');

    const diffStat = await gitWorktree.getWorkspaceDiff(agentId, { stat: true });
    expect(diffStat).toContain('options.txt');
    expect(diffStat).toContain('1 file changed');
  });

  it('should detect multiple file changes', async () => {
    const agentId = await agentService.spawnAgent('MultiFileAgent', 'Modify multiple files', 5000);

    const workspace = await workspaceRepo.findByAgentId(agentId);

    // Create multiple files
    const file1 = path.join(workspace!.worktree_path, 'file1.txt');
    const file2 = path.join(workspace!.worktree_path, 'file2.txt');
    const file3 = path.join(workspace!.worktree_path, 'file3.txt');

    await fs.writeFile(file1, 'File 1\n', 'utf-8');
    await fs.writeFile(file2, 'File 2\n', 'utf-8');
    await fs.writeFile(file3, 'File 3\n', 'utf-8');

    // Get changed files
    const changedFiles = await gitWorktree.getChangedFiles(agentId);

    expect(changedFiles).toHaveLength(3);
    expect(changedFiles).toContain('file1.txt');
    expect(changedFiles).toContain('file2.txt');
    expect(changedFiles).toContain('file3.txt');
  });

  // ==========================================================================
  // Workspace Cleanup
  // ==========================================================================

  it('should cleanup merged workspaces', async () => {
    const agentId = await agentService.spawnAgent('MergedAgent', 'Test cleanup', 5000);

    const workspace = await workspaceRepo.findByAgentId(agentId);
    expect(workspace).not.toBeNull();

    // Mark workspace as merged
    await workspaceRepo.updateStatus(workspace!.id, 'merged');

    // Run cleanup (maxAge = 0 for immediate cleanup)
    const cleaned = await cleanupService.cleanupByStatus('merged', { maxAge: 0 });

    expect(cleaned).toBe(1);

    // Verify workspace was deleted
    const deletedWorkspace = await workspaceRepo.findByAgentId(agentId);
    expect(deletedWorkspace).toBeNull();
  });

  it('should get cleanup statistics', async () => {
    // Create 3 agents with different statuses
    const agent1 = await agentService.spawnAgent('Active1', 'Active', 3000);
    const agent2 = await agentService.spawnAgent('Active2', 'Active', 3000);
    const agent3 = await agentService.spawnAgent('Merged1', 'Merged', 3000);

    // Mark one as merged
    const workspace3 = await workspaceRepo.findByAgentId(agent3);
    await workspaceRepo.updateStatus(workspace3!.id, 'merged');

    // Get stats
    const stats = await cleanupService.getCleanupStats();

    expect(stats.active).toBe(2);
    expect(stats.merged).toBe(1);
    expect(stats.total).toBe(3);
  });

  // ==========================================================================
  // Workspace Status Management
  // ==========================================================================

  it('should update workspace isolation status', async () => {
    const agentId = await agentService.spawnAgent('StatusAgent', 'Test status', 5000);

    const workspace = await workspaceRepo.findByAgentId(agentId);
    expect(workspace!.isolation_status).toBe('active');

    // Update to merged
    const updated = await workspaceRepo.updateStatus(workspace!.id, 'merged');
    expect(updated.isolation_status).toBe('merged');

    // Verify in database
    const fetched = await workspaceRepo.findById(workspace!.id);
    expect(fetched!.isolation_status).toBe('merged');
  });

  it('should filter workspaces by status', async () => {
    // Create agents with different statuses
    const agent1 = await agentService.spawnAgent('Active1', 'Active', 3000);
    const agent2 = await agentService.spawnAgent('Active2', 'Active', 3000);
    const agent3 = await agentService.spawnAgent('Merged1', 'Merged', 3000);

    const workspace3 = await workspaceRepo.findByAgentId(agent3);
    await workspaceRepo.updateStatus(workspace3!.id, 'merged');

    // Filter by active
    const activeWorkspaces = await workspaceRepo.getByStatus('active');
    expect(activeWorkspaces).toHaveLength(2);

    // Filter by merged
    const mergedWorkspaces = await workspaceRepo.getByStatus('merged');
    expect(mergedWorkspaces).toHaveLength(1);
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  it('should handle workspace deletion gracefully', async () => {
    const agentId = await agentService.spawnAgent('DeleteAgent', 'Test delete', 5000);

    // Delete worktree
    const deleted = await gitWorktree.deleteWorktree(agentId);
    expect(deleted).toBe(true);

    // Try to delete again (should return false)
    const deletedAgain = await gitWorktree.deleteWorktree(agentId);
    expect(deletedAgain).toBe(false);
  });

  it('should handle non-existent workspace diff gracefully', async () => {
    const fakeAgentId = '00000000-0000-0000-0000-000000000000';

    // Attempting to get diff for non-existent workspace should throw
    await expect(gitWorktree.getWorkspaceDiff(fakeAgentId)).rejects.toThrow();
  });
});
