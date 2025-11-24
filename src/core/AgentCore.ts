import Anthropic from '@anthropic-ai/sdk';
import type { Agent as AgentModel } from '../models/Agent.js';
import { logger } from '../utils/Logger.js';

/**
 * Token counting utility
 * Uses approximate calculation: ~4 characters per token for English text
 */
export class TokenCounter {
  private static readonly CHARS_PER_TOKEN = 4;

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  static estimateMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const message of messages) {
      if (typeof message.content === 'string') {
        total += this.estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text') {
            total += this.estimateTokens(block.text);
          }
        }
      }
    }
    return total;
  }
}

/**
 * Budget tracker for agent token usage
 */
export class BudgetTracker {
  private allocated: number;
  private used: number = 0;
  private logger = logger.child({ component: 'BudgetTracker' });

  constructor(allocated: number) {
    this.allocated = allocated;
  }

  /**
   * Check if there's enough budget for an operation
   */
  hasAvailable(amount: number): boolean {
    return this.used + amount <= this.allocated;
  }

  /**
   * Reserve tokens for an upcoming operation
   * @throws Error if insufficient budget
   */
  reserve(amount: number): void {
    if (!this.hasAvailable(amount)) {
      throw new Error(
        `Insufficient budget: need ${amount} tokens, have ${this.allocated - this.used} available`
      );
    }
  }

  /**
   * Record token usage
   */
  consume(amount: number): void {
    this.used += amount;
    this.logger.debug({ used: this.used, allocated: this.allocated }, 'Tokens consumed');
  }

  /**
   * Get remaining budget
   */
  getRemaining(): number {
    return this.allocated - this.used;
  }

  /**
   * Get usage statistics
   */
  getStats() {
    return {
      allocated: this.allocated,
      used: this.used,
      remaining: this.getRemaining(),
      percentUsed: (this.used / this.allocated) * 100,
    };
  }
}

/**
 * AgentCore - Business Logic Layer for Agent Execution
 *
 * Handles:
 * - Anthropic API integration
 * - Token counting and budget tracking
 * - Error handling and recovery
 * - Streaming and message processing
 *
 * Architecture: Service Layer Pattern
 * - Encapsulates complex business logic
 * - Manages external API interactions
 * - Provides error handling and retry logic
 */
export class AgentCore {
  private anthropic: Anthropic;
  private logger = logger.child({ component: 'AgentCore' });
  private budgetTracker?: BudgetTracker;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Initialize budget tracking for an agent
   *
   * @param allocated - Total tokens allocated to this agent
   */
  initializeBudget(allocated: number): void {
    this.budgetTracker = new BudgetTracker(allocated);
    this.logger.info({ allocated }, 'Budget initialized');
  }

  /**
   * Execute agent task using Anthropic API
   *
   * @param agent - Agent model with task information
   * @returns Execution result with generated content and token usage
   * @throws Error if execution fails or budget exceeded
   */
  async execute(agent: AgentModel): Promise<{
    content: string;
    tokensUsed: number;
    finishReason: string;
  }> {
    const executionLogger = this.logger.child({ agentId: agent.id, role: agent.role });

    try {
      executionLogger.info('Starting agent execution');

      // Build system prompt with role context
      const systemPrompt = this.buildSystemPrompt(agent);

      // Build user message with task description
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: agent.task_description,
        },
      ];

      // Estimate token usage for budget check
      const estimatedTokens =
        TokenCounter.estimateTokens(systemPrompt) +
        TokenCounter.estimateMessageTokens(messages) +
        1000; // Buffer for response

      if (this.budgetTracker && !this.budgetTracker.hasAvailable(estimatedTokens)) {
        throw new Error(
          `Insufficient budget for execution. Estimated: ${estimatedTokens} tokens, Available: ${this.budgetTracker.getRemaining()}`
        );
      }

      // Make API request to Anthropic
      executionLogger.debug('Sending request to Anthropic API');
      const response = await this.anthropic.messages.create({
        model: this.getModelName(),
        max_tokens: this.getMaxTokens(),
        system: systemPrompt,
        messages,
      });

      // Extract content from response
      const content = this.extractContent(response);
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      // Track token usage
      if (this.budgetTracker) {
        this.budgetTracker.consume(tokensUsed);
        executionLogger.info(
          { tokensUsed, budgetStats: this.budgetTracker.getStats() },
          'Execution completed'
        );
      } else {
        executionLogger.info({ tokensUsed }, 'Execution completed (no budget tracking)');
      }

      return {
        content,
        tokensUsed,
        finishReason: response.stop_reason || 'unknown',
      };
    } catch (error) {
      executionLogger.error({ error }, 'Agent execution failed');
      throw this.handleError(error);
    }
  }

  /**
   * Execute with streaming support
   *
   * @param agent - Agent model with task information
   * @param onChunk - Callback for each content chunk
   * @returns Final execution result
   */
  async executeStreaming(
    agent: AgentModel,
    onChunk: (chunk: string) => void
  ): Promise<{
    content: string;
    tokensUsed: number;
    finishReason: string;
  }> {
    const executionLogger = this.logger.child({ agentId: agent.id, role: agent.role });

    try {
      executionLogger.info('Starting streaming agent execution');

      const systemPrompt = this.buildSystemPrompt(agent);
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: agent.task_description,
        },
      ];

      // Estimate and check budget
      const estimatedTokens =
        TokenCounter.estimateTokens(systemPrompt) +
        TokenCounter.estimateMessageTokens(messages) +
        1000;

      if (this.budgetTracker && !this.budgetTracker.hasAvailable(estimatedTokens)) {
        throw new Error(
          `Insufficient budget for execution. Estimated: ${estimatedTokens} tokens, Available: ${this.budgetTracker.getRemaining()}`
        );
      }

      // Create streaming request
      const stream = await this.anthropic.messages.create({
        model: this.getModelName(),
        max_tokens: this.getMaxTokens(),
        system: systemPrompt,
        messages,
        stream: true,
      });

      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = 'unknown';

      // Process stream
      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const chunk = event.delta.text;
            fullContent += chunk;
            onChunk(chunk);
          }
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
          finishReason = event.delta.stop_reason || 'unknown';
        }
      }

      const tokensUsed = inputTokens + outputTokens;

      // Track token usage
      if (this.budgetTracker) {
        this.budgetTracker.consume(tokensUsed);
        executionLogger.info(
          { tokensUsed, budgetStats: this.budgetTracker.getStats() },
          'Streaming execution completed'
        );
      } else {
        executionLogger.info({ tokensUsed }, 'Streaming execution completed (no budget tracking)');
      }

      return {
        content: fullContent,
        tokensUsed,
        finishReason,
      };
    } catch (error) {
      executionLogger.error({ error }, 'Streaming agent execution failed');
      throw this.handleError(error);
    }
  }

  /**
   * Build system prompt with role-specific instructions
   */
  private buildSystemPrompt(agent: AgentModel): string {
    return `You are an AI agent with the role: ${agent.role}.

Your task is assigned within a multi-agent orchestration system. You are operating at depth level ${agent.depth_level} in the agent hierarchy.

${agent.parent_id ? `You were spawned by a parent agent (ID: ${agent.parent_id}) to accomplish a specific sub-task.` : 'You are a root-level agent.'}

Guidelines:
- Focus on completing your assigned task effectively and efficiently
- Provide clear, actionable outputs
- If you need to spawn sub-agents, clearly indicate this in your response
- Track your progress and report any blockers or issues
- Optimize for quality and clarity in your deliverables

Your unique agent ID is: ${agent.id}`;
  }

  /**
   * Extract text content from Anthropic message response
   */
  private extractContent(response: Anthropic.Message): string {
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    if (textBlocks.length === 0) {
      throw new Error('No text content in response');
    }

    return textBlocks.map(block => block.text).join('\n');
  }

  /**
   * Get model name from environment or use default
   */
  private getModelName(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Get max tokens from environment or use default
   */
  private getMaxTokens(): number {
    const maxTokens = process.env.ANTHROPIC_MAX_TOKENS;
    return maxTokens ? parseInt(maxTokens, 10) : 4096;
  }

  /**
   * Handle and transform errors for better reporting
   */
  private handleError(error: unknown): Error {
    if (error instanceof Anthropic.APIError) {
      return new Error(
        `Anthropic API Error (${error.status}): ${error.message}`
      );
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(`Unknown error: ${String(error)}`);
  }

  /**
   * Get current budget statistics
   */
  getBudgetStats() {
    return this.budgetTracker?.getStats() || null;
  }
}
