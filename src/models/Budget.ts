import { z } from 'zod';

/**
 * Budget model schema
 * Tracks token usage and cost management for each agent
 */
export const BudgetSchema = z.object({
  /** Unique identifier for the budget record */
  id: z.string().uuid(),

  /** Associated agent ID */
  agent_id: z.string().uuid(),

  /** Total tokens allocated to this agent */
  allocated: z.number().int().min(0),

  /** Number of tokens used by this agent */
  used: z.number().int().min(0),

  /** Tokens reserved for child agents */
  reserved: z.number().int().min(0),

  /** Timestamp when the budget record was created */
  created_at: z.date(),

  /** Timestamp when the budget was last updated */
  updated_at: z.date(),
});

export type Budget = z.infer<typeof BudgetSchema>;

/**
 * Schema for creating a new budget (without auto-generated fields)
 */
export const CreateBudgetSchema = BudgetSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  used: z.number().int().min(0).default(0),
  reserved: z.number().int().min(0).default(0),
});

export type CreateBudget = z.infer<typeof CreateBudgetSchema>;

/**
 * Schema for updating a budget
 */
export const UpdateBudgetSchema = BudgetSchema.partial().omit({
  id: true,
  agent_id: true,
  created_at: true,
});

export type UpdateBudget = z.infer<typeof UpdateBudgetSchema>;

/**
 * Schema for incrementing token usage
 */
export const IncrementTokensSchema = z.object({
  /** Number of tokens to add to the current usage */
  tokens: z.number().int().min(0),

  /** Cost per token (used to update estimated_cost) */
  cost_per_token: z.number().min(0).optional(),
});

export type IncrementTokens = z.infer<typeof IncrementTokensSchema>;

/**
 * Helper to check if budget is exceeded
 */
export function isBudgetExceeded(budget: Budget): boolean {
  return budget.used >= budget.allocated;
}

/**
 * Helper to calculate remaining budget (available = allocated - used - reserved)
 */
export function getRemainingTokens(budget: Budget): number {
  return Math.max(0, budget.allocated - budget.used - budget.reserved);
}

/**
 * Helper to calculate budget usage percentage
 */
export function getBudgetUsagePercentage(budget: Budget): number {
  if (budget.allocated === 0) return 0;
  return (budget.used / budget.allocated) * 100;
}
