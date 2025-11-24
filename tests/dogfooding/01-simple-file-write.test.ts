/**
 * Dogfooding Test 1: Simple File Write
 *
 * This test verifies the basic agent execution flow:
 * 1. Spawn an agent with a simple task
 * 2. Agent executes and writes a file
 * 3. Verify the file was created with correct content
 *
 * This validates the entire execution layer end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentService } from '../../src/services/AgentService.js';
import { AgentRepository } from '../../src/database/repositories/AgentRepository.js';
import { WorkspaceRepository } from '../../src/database/repositories/WorkspaceRepository.js';
import { db } from '../../src/infrastructure/SharedDatabase.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Dogfooding Test 1: Simple File Write', () => {
  let agentService: AgentService;
  let agentRepo: AgentRepository;
  let workspaceRepo: WorkspaceRepository;

  beforeAll(async () => {
    // Initialize database connection
    await db.initialize();

    agentService = new AgentService();
    agentRepo = new AgentRepository();
    workspaceRepo = new WorkspaceRepository();
  });

  afterAll(async () => {
    await db.shutdown();
  });

  it('should spawn agent, execute task, and create file', async () => {
    // Step 1: Spawn an agent with a simple file-writing task
    const agentId = await agentService.spawnAgent(
      'file-writer',
      'Create a file named "hello.txt" with the content "Hello from autonomous agent!"',
      50000, // 50k tokens
      undefined // no parent
    );

    expect(agentId).toBeTruthy();

    // Step 2: Verify agent was created in pending status
    let agent = await agentRepo.findById(agentId);
    expect(agent).toBeTruthy();
    expect(agent!.status).toBe('pending');
    expect(agent!.role).toBe('file-writer');

    // Step 3: Get workspace path
    const workspace = await workspaceRepo.findByAgentId(agentId);
    expect(workspace).toBeTruthy();
    const workspacePath = workspace!.worktree_path;

    // Step 4: Manually trigger agent execution (simulating AgentExecutionWorker)
    await agentService.runAgent(agentId);

    // Step 5: Verify agent status is now completed
    agent = await agentRepo.findById(agentId);
    expect(agent!.status).toBe('completed');

    // Step 6: Verify the file was created
    const filePath = join(workspacePath, 'hello.txt');
    expect(existsSync(filePath)).toBe(true);

    // Step 7: Verify file content
    const content = readFileSync(filePath, 'utf-8');
    expect(content.toLowerCase()).toContain('hello');

    console.log('✅ Dogfooding Test 1 PASSED');
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Workspace: ${workspacePath}`);
    console.log(`   File created: ${filePath}`);
    console.log(`   Content: ${content}`);
  }, 60000); // 60 second timeout for agent execution

  it('should handle parent-child agent execution', async () => {
    // Step 1: Spawn parent agent
    const parentId = await agentService.spawnAgent(
      'spec-writer',
      'Create a specification document named "calculator-spec.md" that describes a simple add(a, b) function',
      50000,
      undefined
    );

    // Execute parent
    await agentService.runAgent(parentId);

    // Verify parent completed
    const parent = await agentRepo.findById(parentId);
    expect(parent!.status).toBe('completed');

    // Get parent workspace
    const parentWorkspace = await workspaceRepo.findByAgentId(parentId);
    const parentPath = parentWorkspace!.worktree_path;

    // Verify spec was created
    const specPath = join(parentPath, 'calculator-spec.md');
    expect(existsSync(specPath)).toBe(true);

    console.log('✅ Parent agent completed successfully');
    console.log(`   Parent ID: ${parentId}`);
    console.log(`   Spec created: ${specPath}`);

    // Step 2: Spawn child agent
    const childId = await agentService.spawnAgent(
      'implementer',
      'Implement the calculator function described in ../[parent-workspace]/calculator-spec.md. Create calculator.ts',
      50000,
      parentId // child of parent
    );

    // Execute child
    await agentService.runAgent(childId);

    // Verify child completed
    const child = await agentRepo.findById(childId);
    expect(child!.status).toBe('completed');

    // Get child workspace
    const childWorkspace = await workspaceRepo.findByAgentId(childId);
    const childPath = childWorkspace!.worktree_path;

    // Verify implementation was created
    const implPath = join(childPath, 'calculator.ts');
    expect(existsSync(implPath)).toBe(true);

    console.log('✅ Child agent completed successfully');
    console.log(`   Child ID: ${childId}`);
    console.log(`   Implementation created: ${implPath}`);

    console.log('\n✅ Dogfooding Test 2 (Parent-Child) PASSED');
  }, 120000); // 2 minute timeout for two agents
});
