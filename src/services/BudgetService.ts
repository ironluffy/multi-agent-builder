import { BudgetRepository, Budget } from '../database/repositories/BudgetRepository.js';
import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';

/**
 * Budget Service
 * High-level service for managing agent budgets and token allocation
 *
 * Responsibilities:
 * - Allocate budgets to agents
 * - Track token consumption
 * - Validate budget constraints
 * - Provide budget status information
 */
export class BudgetService {
  private budgetRepo: BudgetRepository;
  private serviceLogger = logger.child({ component: 'BudgetService' });

  constructor() {
    this.budgetRepo = new BudgetRepository();
  }

  /**
   * Allocate a budget to an agent
   * Creates a new budget record with specified token allocation
   *
   * @param agent_id - Agent UUID
   * @param tokens - Number of tokens to allocate
   * @returns Created budget record
   * @throws Error if allocation fails or agent already has a budget
   */
  async allocateBudget(agent_id: string, tokens: number): Promise<Budget> {
    if (tokens <= 0) {
      throw new Error('Budget allocation must be positive');
    }

    try {
      // Check if budget already exists
      const existing = await this.budgetRepo.getByAgentId(agent_id);
      if (existing) {
        throw new Error(`Agent ${agent_id} already has a budget allocated`);
      }

      const budget = await this.budgetRepo.create(agent_id, tokens);

      this.serviceLogger.info(
        { agent_id, allocated: tokens },
        'Budget allocated to agent'
      );

      return budget;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id, tokens },
        'Failed to allocate budget'
      );
      throw error;
    }
  }

  /**
   * Consume tokens from an agent's budget
   * Decrements the available budget and validates limits
   *
   * @param agent_id - Agent UUID
   * @param tokens - Number of tokens to consume
   * @returns Updated budget record
   * @throws Error if insufficient budget or consumption fails
   */
  async consumeTokens(agent_id: string, tokens: number): Promise<Budget> {
    if (tokens <= 0) {
      throw new Error('Token consumption must be positive');
    }

    try {
      // Check remaining budget before consuming
      const remaining = await this.budgetRepo.getRemainingBudget(agent_id);

      if (remaining < tokens) {
        throw new Error(
          `Insufficient budget for agent ${agent_id}. ` +
          `Available: ${remaining}, Requested: ${tokens}`
        );
      }

      const budget = await this.budgetRepo.incrementUsed(agent_id, tokens);

      this.serviceLogger.debug(
        {
          agent_id,
          consumed: tokens,
          used: budget.used,
          remaining: budget.allocated - budget.used - budget.reserved,
        },
        'Tokens consumed'
      );

      return budget;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id, tokens },
        'Failed to consume tokens'
      );
      throw error;
    }
  }

  /**
   * Get remaining available budget for an agent
   * Returns the number of tokens available (allocated - used - reserved)
   *
   * @param agent_id - Agent UUID
   * @returns Number of remaining tokens
   * @throws Error if agent has no budget
   */
  async getRemainingBudget(agent_id: string): Promise<number> {
    try {
      return await this.budgetRepo.getRemainingBudget(agent_id);
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get remaining budget'
      );
      throw error;
    }
  }

  /**
   * Get full budget information for an agent
   *
   * @param agent_id - Agent UUID
   * @returns Complete budget record
   * @throws Error if agent has no budget
   */
  async getBudget(agent_id: string): Promise<Budget | null> {
    try {
      const budget = await this.budgetRepo.getByAgentId(agent_id);

      if (!budget) {
        throw new Error(`No budget found for agent ${agent_id}`);
      }

      return budget;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to get budget'
      );
      throw error;
    }
  }

  /**
   * Check if an agent has sufficient budget for an operation
   *
   * @param agent_id - Agent UUID
   * @param required_tokens - Number of tokens required
   * @returns True if sufficient budget available
   */
  async hasSufficientBudget(agent_id: string, required_tokens: number): Promise<boolean> {
    try {
      const remaining = await this.budgetRepo.getRemainingBudget(agent_id);
      return remaining >= required_tokens;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id, required_tokens },
        'Failed to check budget sufficiency'
      );
      return false;
    }
  }

  /**
   * Get budget usage percentage
   *
   * @param agent_id - Agent UUID
   * @returns Usage percentage (0-100)
   */
  async getBudgetUsagePercentage(agent_id: string): Promise<number> {
    try {
      const budget = await this.budgetRepo.getByAgentId(agent_id);

      if (!budget) {
        throw new Error(`No budget found for agent ${agent_id}`);
      }

      if (budget.allocated === 0) {
        return 0;
      }

      return (budget.used / budget.allocated) * 100;
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to calculate budget usage'
      );
      throw error;
    }
  }

  /**
   * Allocate budget from parent to child agent
   *
   * This method handles hierarchical budget delegation:
   * 1. Validates parent has sufficient available budget
   * 2. Creates budget record for child
   * 3. Database trigger automatically reserves tokens from parent
   * 4. Returns updated budget states for both parent and child
   *
   * Uses database transaction to ensure atomicity of the operation.
   *
   * @param parent_id - Parent agent UUID
   * @param child_id - Child agent UUID
   * @param tokens - Number of tokens to allocate to child
   * @returns Object with parent and child budget states
   * @throws Error if parent has insufficient budget or allocation fails
   */
  async allocateFromParent(
    parent_id: string,
    child_id: string,
    tokens: number
  ): Promise<{ parent: Budget; child: Budget }> {
    if (tokens <= 0) {
      throw new Error('Token allocation must be positive');
    }

    this.serviceLogger.info(
      { parent_id, child_id, tokens },
      'Allocating budget from parent to child'
    );

    try {
      // Use transaction to ensure atomicity
      const result = await db.transaction(async (client) => {
        // 1. Check parent budget exists and has sufficient tokens
        const parentBudgetResult = await client.query<Budget>(
          'SELECT * FROM budgets WHERE agent_id = $1 FOR UPDATE',
          [parent_id]
        );

        if (parentBudgetResult.rows.length === 0) {
          throw new Error(`Parent agent ${parent_id} has no budget record`);
        }

        const parentBudget = parentBudgetResult.rows[0];
        const availableParentBudget = parentBudget.allocated - parentBudget.used - parentBudget.reserved;

        if (availableParentBudget < tokens) {
          throw new Error(
            `Insufficient budget in parent agent ${parent_id}. ` +
            `Available: ${availableParentBudget}, Requested: ${tokens}`
          );
        }

        this.serviceLogger.debug(
          {
            parent_id,
            parentBudget: {
              allocated: parentBudget.allocated,
              used: parentBudget.used,
              reserved: parentBudget.reserved,
              available: availableParentBudget,
            },
            requestedTokens: tokens,
          },
          'Parent budget validation passed'
        );

        // 2. Check child doesn't already have a budget
        const existingChildBudget = await client.query<Budget>(
          'SELECT * FROM budgets WHERE agent_id = $1',
          [child_id]
        );

        if (existingChildBudget.rows.length > 0) {
          throw new Error(`Child agent ${child_id} already has a budget allocated`);
        }

        // 3. Create budget for child
        // The database trigger 'allocate_child_budget' will automatically:
        // - Reserve tokens from parent's budget
        // - Validate parent has sufficient budget
        const childBudgetResult = await client.query<Budget>(
          `INSERT INTO budgets (agent_id, allocated, used, reserved)
           VALUES ($1, $2, 0, 0)
           RETURNING *`,
          [child_id, tokens]
        );

        if (childBudgetResult.rows.length === 0) {
          throw new Error('Failed to create child budget');
        }

        const childBudget = childBudgetResult.rows[0];

        this.serviceLogger.info(
          { child_id, allocated: tokens },
          'Child budget created'
        );

        // 4. Fetch updated parent budget (after trigger execution)
        const updatedParentResult = await client.query<Budget>(
          'SELECT * FROM budgets WHERE agent_id = $1',
          [parent_id]
        );

        const updatedParent = updatedParentResult.rows[0];

        this.serviceLogger.info(
          {
            parent_id,
            child_id,
            allocatedToChild: tokens,
            parentReservedBefore: parentBudget.reserved,
            parentReservedAfter: updatedParent.reserved,
            parentAvailableAfter: updatedParent.allocated - updatedParent.used - updatedParent.reserved,
          },
          'Budget successfully allocated from parent to child'
        );

        return {
          parent: updatedParent,
          child: childBudget,
        };
      });

      return result;
    } catch (error) {
      this.serviceLogger.error(
        { error, parent_id, child_id, tokens },
        'Failed to allocate budget from parent'
      );
      throw error;
    }
  }

  /**
   * Reclaim unused budget from child agent back to parent
   *
   * This method is typically called when a child agent completes its task.
   * It returns unused tokens (allocated - used) from the child back to the parent's
   * available budget by reducing the parent's reserved amount.
   *
   * Note: The database trigger 'reclaim_child_budget' automatically handles
   * reclamation on agent status changes. This method provides explicit control
   * for manual reclamation scenarios.
   *
   * @param child_id - Child agent UUID
   * @returns Object with updated parent and child budget states
   * @throws Error if child has no parent or reclamation fails
   */
  async reclaimBudget(child_id: string): Promise<{ parent: Budget; child: Budget }> {
    this.serviceLogger.info({ child_id }, 'Reclaiming budget from child to parent');

    try {
      const result = await db.transaction(async (client) => {
        // 1. Get child's budget
        const childBudgetResult = await client.query<Budget & { reclaimed: boolean }>(
          'SELECT * FROM budgets WHERE agent_id = $1 FOR UPDATE',
          [child_id]
        );

        if (childBudgetResult.rows.length === 0) {
          throw new Error(`Child agent ${child_id} has no budget record`);
        }

        const childBudget = childBudgetResult.rows[0];

        // Check if budget was already reclaimed
        if (childBudget.reclaimed) {
          throw new Error(`Budget for agent ${child_id} was already reclaimed`);
        }

        // 2. Get child's parent from agents table
        const parentResult = await client.query<{ parent_id: string | null }>(
          'SELECT parent_id FROM agents WHERE id = $1',
          [child_id]
        );

        if (parentResult.rows.length === 0) {
          throw new Error(`Child agent ${child_id} not found`);
        }

        const parentId = parentResult.rows[0].parent_id;

        if (!parentId) {
          throw new Error(`Child agent ${child_id} has no parent`);
        }

        // 3. Calculate unused budget
        const unusedBudget = childBudget.allocated - childBudget.used;

        this.serviceLogger.debug(
          {
            child_id,
            parent_id: parentId,
            child_allocated: childBudget.allocated,
            child_used: childBudget.used,
            unused: unusedBudget,
          },
          'Calculated unused budget for reclamation'
        );

        // 4. Update parent's reserved budget (reduce by unused amount)
        // reserved was increased by child.allocated during allocation
        // now we reduce it by unused amount: reserved -= (allocated - used)
        // which effectively means: reserved -= allocated; reserved += used
        const parentUpdateResult = await client.query<Budget>(
          `UPDATE budgets
           SET reserved = reserved - $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE agent_id = $1
           RETURNING *`,
          [parentId, unusedBudget]
        );

        if (parentUpdateResult.rows.length === 0) {
          throw new Error(`Parent agent ${parentId} has no budget record`);
        }

        const updatedParent = parentUpdateResult.rows[0];

        // 5. Mark child budget as reclaimed to prevent double reclamation
        const updatedChildResult = await client.query<Budget>(
          `UPDATE budgets
           SET reclaimed = TRUE,
               updated_at = CURRENT_TIMESTAMP
           WHERE agent_id = $1
           RETURNING *`,
          [child_id]
        );

        const updatedChild = updatedChildResult.rows[0];

        this.serviceLogger.info(
          {
            child_id,
            parent_id: parentId,
            reclaimed: unusedBudget,
            parent_reserved_before: updatedParent.reserved + unusedBudget,
            parent_reserved_after: updatedParent.reserved,
            parent_available_after: updatedParent.allocated - updatedParent.used - updatedParent.reserved,
          },
          'Budget successfully reclaimed from child to parent'
        );

        return {
          parent: updatedParent,
          child: updatedChild,
        };
      });

      return result;
    } catch (error) {
      this.serviceLogger.error(
        { error, child_id },
        'Failed to reclaim budget from child'
      );
      throw error;
    }
  }

  /**
   * Delete budget record for an agent
   * Typically called when agent is terminated
   *
   * @param agent_id - Agent UUID
   */
  async deleteBudget(agent_id: string): Promise<void> {
    try {
      await this.budgetRepo.delete(agent_id);

      this.serviceLogger.info(
        { agent_id },
        'Budget deleted'
      );
    } catch (error) {
      this.serviceLogger.error(
        { error, agent_id },
        'Failed to delete budget'
      );
      throw error;
    }
  }
}
