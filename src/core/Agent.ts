import { AgentCore } from './AgentCore.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { HierarchyRepository } from '../database/repositories/HierarchyRepository.js';
import { BudgetService } from '../services/BudgetService.js';
import { AgentService } from '../services/AgentService.js';
import { config } from '../config/env.js';
import { logger } from '../utils/Logger.js';
import type {
  Agent as AgentModel,
  CreateAgent,
  AgentStatusType,
} from '../models/Agent.js';

/**
 * Agent State Machine Transitions
 *
 * Valid state transitions:
 * - pending → executing (when spawn() is called)
 * - executing → completed (successful execution)
 * - executing → failed (execution error)
 * - executing → terminated (manual termination)
 * - Any state can transition to terminated (force termination)
 */
const VALID_TRANSITIONS: Record<AgentStatusType, AgentStatusType[]> = {
  pending: ['executing', 'terminated'],
  executing: ['completed', 'failed', 'terminated'],
  completed: ['terminated'], // Allow cleanup
  failed: ['terminated'], // Allow cleanup
  terminated: [], // Terminal state
};

/**
 * Agent - Presentation Layer for Agent Orchestration
 *
 * Provides the public interface for agent operations and manages the agent lifecycle.
 * Implements state machine pattern for status transitions.
 *
 * Architecture: Facade Pattern
 * - Coordinates between AgentCore (business logic) and AgentRepository (data access)
 * - Manages agent state machine and transitions
 * - Provides high-level operations for agent lifecycle
 *
 * Lifecycle:
 * 1. Create Agent instance (either new or from existing ID)
 * 2. spawn() - Transition to executing and start task
 * 3. execute() - Run the agent's task (async)
 * 4. Complete - Transition to completed/failed
 * 5. terminate() - Force stop execution
 */
export class Agent {
  private core: AgentCore;
  private repository: AgentRepository;
  private model?: AgentModel;
  private logger = logger.child({ component: 'Agent' });
  private executionPromise?: Promise<void>;

  /**
   * Create a new Agent instance
   *
   * @param id - Agent UUID (if loading existing) or undefined (if creating new)
   * @param core - AgentCore instance for business logic
   * @param repository - AgentRepository instance for data access
   */
  constructor(
    private id?: string,
    core?: AgentCore,
    repository?: AgentRepository
  ) {
    this.core = core || new AgentCore();
    this.repository = repository || new AgentRepository();
  }

  /**
   * Spawn a new agent and start execution
   *
   * This method:
   * 1. Creates the agent in the database
   * 2. Transitions to 'executing' state
   * 3. Starts asynchronous execution
   * 4. Returns immediately with the agent ID
   *
   * @param params - Agent creation parameters
   * @returns Agent ID
   * @throws Error if spawning fails
   */
  async spawn(params: CreateAgent): Promise<string> {
    const spawnLogger = this.logger.child({ role: params.role });

    try {
      spawnLogger.info('Spawning new agent');

      // Create agent in database with 'pending' status
      this.model = await this.repository.create({
        ...params,
        status: 'pending',
      });
      this.id = this.model.id;

      spawnLogger.info({ agentId: this.id }, 'Agent created in database');

      // Validate transition to executing
      await this.validateTransition('executing');

      // Transition to executing
      await this.updateStatus('executing');
      spawnLogger.info({ agentId: this.id }, 'Agent transitioned to executing');

      // Start execution asynchronously (fire and forget)
      this.executionPromise = this.execute()
        .then(async () => {
          spawnLogger.info({ agentId: this.id }, 'Agent execution completed successfully');
          await this.updateStatus('completed', { completed_at: new Date() });
        })
        .catch(async (error) => {
          spawnLogger.error({ error, agentId: this.id }, 'Agent execution failed');
          await this.updateStatus('failed', { completed_at: new Date() });
        });

      return this.id;
    } catch (error) {
      spawnLogger.error({ error }, 'Failed to spawn agent');
      throw error;
    }
  }

  /**
   * Execute the agent's task
   *
   * This method is called internally by spawn() and runs asynchronously.
   * It delegates to AgentCore for the actual execution logic.
   *
   * @throws Error if execution fails
   */
  private async execute(): Promise<void> {
    if (!this.model) {
      throw new Error('Cannot execute: agent model not loaded');
    }

    const executeLogger = this.logger.child({ agentId: this.id, role: this.model.role });

    try {
      executeLogger.info('Starting agent execution');

      // Delegate to AgentCore for business logic
      const result = await this.core.execute(this.model);

      executeLogger.info(
        {
          tokensUsed: result.tokensUsed,
          finishReason: result.finishReason,
          contentLength: result.content.length,
        },
        'Agent execution completed'
      );

      // Store execution result (could be extended to save in database)
      // For now, we just log it
      executeLogger.debug({ content: result.content }, 'Agent output');
    } catch (error) {
      executeLogger.error({ error }, 'Agent execution failed');
      throw error;
    }
  }

  /**
   * Execute with streaming support
   *
   * @param params - Agent creation parameters
   * @param onChunk - Callback for each content chunk
   * @returns Agent ID
   */
  async spawnStreaming(
    params: CreateAgent,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const spawnLogger = this.logger.child({ role: params.role });

    try {
      spawnLogger.info('Spawning new streaming agent');

      // Create agent in database
      this.model = await this.repository.create({
        ...params,
        status: 'pending',
      });
      this.id = this.model.id;

      // Validate and transition to executing
      await this.validateTransition('executing');
      await this.updateStatus('executing');

      // Start streaming execution asynchronously
      this.executionPromise = this.executeStreaming(onChunk)
        .then(async () => {
          spawnLogger.info({ agentId: this.id }, 'Streaming agent execution completed');
          await this.updateStatus('completed', { completed_at: new Date() });
        })
        .catch(async (error) => {
          spawnLogger.error({ error, agentId: this.id }, 'Streaming agent execution failed');
          await this.updateStatus('failed', { completed_at: new Date() });
        });

      return this.id;
    } catch (error) {
      spawnLogger.error({ error }, 'Failed to spawn streaming agent');
      throw error;
    }
  }

  /**
   * Execute with streaming (internal method)
   */
  private async executeStreaming(onChunk: (chunk: string) => void): Promise<void> {
    if (!this.model) {
      throw new Error('Cannot execute: agent model not loaded');
    }

    const executeLogger = this.logger.child({ agentId: this.id, role: this.model.role });

    try {
      executeLogger.info('Starting streaming agent execution');

      const result = await this.core.executeStreaming(this.model, onChunk);

      executeLogger.info(
        {
          tokensUsed: result.tokensUsed,
          finishReason: result.finishReason,
          contentLength: result.content.length,
        },
        'Streaming execution completed'
      );
    } catch (error) {
      executeLogger.error({ error }, 'Streaming execution failed');
      throw error;
    }
  }

  /**
   * Terminate the agent
   *
   * Stops execution and transitions to 'terminated' state.
   * This is a forced stop, different from natural completion/failure.
   *
   * @throws Error if termination fails
   */
  async terminate(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot terminate: agent not spawned');
    }

    const terminateLogger = this.logger.child({ agentId: this.id });

    try {
      terminateLogger.info('Terminating agent');

      // Validate transition
      await this.validateTransition('terminated');

      // Update status to terminated
      await this.updateStatus('terminated', { completed_at: new Date() });

      terminateLogger.info('Agent terminated successfully');
    } catch (error) {
      terminateLogger.error({ error }, 'Failed to terminate agent');
      throw error;
    }
  }

  /**
   * Get current agent status and details
   *
   * @returns Agent model with current state
   * @throws Error if agent not found
   */
  async getStatus(): Promise<AgentModel> {
    if (!this.id) {
      throw new Error('Cannot get status: agent not spawned');
    }

    if (!this.model) {
      this.model = await this.repository.findById(this.id);
    } else {
      // Refresh from database to get latest state
      this.model = await this.repository.findById(this.id);
    }

    return this.model;
  }

  /**
   * Wait for agent execution to complete
   *
   * @returns Final agent status
   * @throws Error if execution fails
   */
  async waitForCompletion(): Promise<AgentModel> {
    if (!this.executionPromise) {
      throw new Error('Cannot wait: agent not executing');
    }

    // Wait for execution to complete
    await this.executionPromise;

    // Return final status
    return this.getStatus();
  }

  /**
   * Get agent ID
   */
  getId(): string | undefined {
    return this.id;
  }

  /**
   * Load an existing agent by ID
   *
   * @param id - Agent UUID
   * @returns Agent instance
   */
  static async load(id: string): Promise<Agent> {
    const repository = new AgentRepository();
    const core = new AgentCore();
    const agent = new Agent(id, core, repository);

    // Load the model from database
    agent.model = await repository.findById(id);

    return agent;
  }

  /**
   * Update agent status in database
   *
   * @param status - New status
   * @param additionalUpdates - Additional fields to update
   */
  private async updateStatus(
    status: AgentStatusType,
    additionalUpdates?: Partial<AgentModel>
  ): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot update status: agent not spawned');
    }

    this.model = await this.repository.update(this.id, {
      status,
      ...additionalUpdates,
    });
  }

  /**
   * Validate state transition
   *
   * @param newStatus - Target status
   * @throws Error if transition is invalid
   */
  private async validateTransition(newStatus: AgentStatusType): Promise<void> {
    if (!this.model) {
      // No current status, allow any initial status
      return;
    }

    const currentStatus = this.model.status;
    const validNextStates = VALID_TRANSITIONS[currentStatus];

    if (!validNextStates.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${currentStatus} → ${newStatus}. Valid transitions: ${validNextStates.join(', ')}`
      );
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics() {
    return {
      agentId: this.id,
      status: this.model?.status,
      budgetStats: this.core.getBudgetStats(),
      createdAt: this.model?.created_at,
      completedAt: this.model?.completed_at,
    };
  }

  /**
   * Spawn a subordinate (child) agent
   *
   * Creates a child agent with automatic parent-child relationship and budget delegation.
   * The child agent inherits depth level from parent and has its own budget allocated.
   *
   * @param role - Role/type of the subordinate agent
   * @param taskDescription - Task description for the subordinate
   * @param allocatedBudget - Token budget to allocate to the child
   * @returns Child agent ID
   * @throws Error if validation fails or spawning fails
   */
  async spawnSubordinate(
    role: string,
    taskDescription: string,
    allocatedBudget: number
  ): Promise<string> {
    if (!this.id) {
      throw new Error('Cannot spawn subordinate: parent agent not spawned');
    }

    if (!this.model) {
      // Load current agent model if not already loaded
      this.model = await this.repository.findById(this.id);
    }

    const spawnLogger = this.logger.child({
      parentId: this.id,
      parentRole: this.model.role,
      childRole: role
    });

    try {
      spawnLogger.info('Spawning subordinate agent');

      // 1. Validate max depth
      const childDepth = this.model.depth_level + 1;
      if (childDepth > config.agent.maxDepth) {
        throw new Error(
          `Cannot spawn subordinate: max depth ${config.agent.maxDepth} would be exceeded ` +
          `(current: ${this.model.depth_level}, child: ${childDepth})`
        );
      }

      // 2. Check parent has sufficient budget
      const budgetService = new BudgetService();
      const hasSufficientBudget = await budgetService.hasSufficientBudget(
        this.id,
        allocatedBudget
      );

      if (!hasSufficientBudget) {
        const remaining = await budgetService.getRemainingBudget(this.id);
        throw new Error(
          `Insufficient budget to spawn subordinate. ` +
          `Required: ${allocatedBudget}, Available: ${remaining}`
        );
      }

      // 3. Call AgentService.spawnAgent() with parent_id
      const agentService = new AgentService();
      const childId = await agentService.spawnAgent(
        role,
        taskDescription,
        allocatedBudget,
        this.id // parent_id
      );

      spawnLogger.info({ childId, childDepth }, 'Child agent created');

      // 4. Create hierarchy relationship
      const hierarchyRepo = new HierarchyRepository();
      await hierarchyRepo.create(this.id, childId);

      spawnLogger.info({ childId }, 'Hierarchy relationship created');

      // 5. Delegate budget from parent (reserve tokens in parent's budget)
      // Note: The budget triggers in the database handle budget reclamation
      // For now, we just log the delegation. In production, you might want to
      // reserve these tokens in the parent's budget using BudgetRepository.reserve()
      spawnLogger.info(
        {
          childId,
          allocatedToChild: allocatedBudget,
          parentRemaining: await budgetService.getRemainingBudget(this.id)
        },
        'Budget delegated to subordinate'
      );

      // 6. Update parent's updated_at timestamp to reflect the spawn
      // Note: Parent-child relationship is tracked in the hierarchies table
      // If metadata tracking is needed in the future, add a JSONB metadata column
      // to the agents table and update the Agent model schema
      await this.repository.update(this.id, {
        updated_at: new Date(),
      });

      spawnLogger.info({ childId }, 'Subordinate spawned successfully');

      return childId;
    } catch (error) {
      spawnLogger.error({ error, role, allocatedBudget }, 'Failed to spawn subordinate');
      throw error;
    }
  }
}
