/**
 * AgentExecutor - Executes agent tasks using Claude Agent SDK
 *
 * This class bridges the orchestration system with actual task execution.
 * It takes an agent ID, loads its configuration, and runs the task using
 * Claude Code's agent capabilities with proper workspace isolation.
 */

import { query, type Query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { Agent } from '../models/Agent.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { WorkspaceRepository } from '../database/repositories/WorkspaceRepository.js';
import { logger } from '../utils/Logger.js';

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  tokensUsed: number;
  durationMs: number;
  costUsd: number;
}

export class AgentExecutor {
  private agentRepo: AgentRepository;
  private workspaceRepo: WorkspaceRepository;
  private executionLogger = logger.child({ component: 'AgentExecutor' });

  constructor(agentRepo?: AgentRepository, workspaceRepo?: WorkspaceRepository) {
    this.agentRepo = agentRepo || new AgentRepository();
    this.workspaceRepo = workspaceRepo || new WorkspaceRepository();
  }

  /**
   * Execute an agent's task using Claude Agent SDK
   *
   * @param agentId - ID of the agent to execute
   * @returns AgentResult with execution outcome
   */
  async execute(agentId: string): Promise<AgentResult> {
    const startTime = Date.now();
    this.executionLogger.info({ agentId }, 'Starting agent execution');

    try {
      // 1. Load agent from database
      const agent = await this.agentRepo.findById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      if (!agent.task_description) {
        throw new Error(`Agent ${agentId} has no task description`);
      }

      // 2. Get agent's workspace
      const workspace = await this.workspaceRepo.findByAgentId(agentId);
      const workspacePath = workspace?.worktree_path || process.cwd();

      // 3. Prepare execution options
      const options: Options = {
        cwd: workspacePath,
        model: this.getModelForRole(agent.role),
        maxTurns: 20,
        permissionMode: 'acceptEdits',
        systemPrompt: this.buildSystemPrompt(agent, workspacePath),
      };

      this.executionLogger.debug({ agentId, workspacePath, options }, 'Executing with options');

      // 4. Execute using Claude Agent SDK
      const result = await this.runQuery(agent, options);

      const durationMs = Date.now() - startTime;
      this.executionLogger.info(
        { agentId, success: result.success, durationMs },
        'Agent execution completed'
      );

      return {
        ...result,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.executionLogger.error({ agentId, error: errorMessage }, 'Agent execution failed');

      return {
        success: false,
        output: '',
        error: errorMessage,
        tokensUsed: 0,
        durationMs,
        costUsd: 0,
      };
    }
  }

  /**
   * Run the Claude Agent SDK query and collect results
   */
  private async runQuery(agent: Agent, options: Options): Promise<Omit<AgentResult, 'durationMs'>> {
    const agentQuery: Query = query({
      prompt: agent.task_description,
      options,
    });

    let output = '';
    let tokensUsed = 0;
    let costUsd = 0;

    try {
      for await (const message of agentQuery) {
        this.executionLogger.debug(
          { agentId: agent.id, messageType: message.type },
          'Received SDK message'
        );

        // Collect assistant responses
        if (message.type === 'assistant') {
          const text = this.extractTextFromAssistant(message);
          if (text) {
            output += text + '\n';
          }
        }

        // Handle final result
        if (message.type === 'result') {
          tokensUsed = message.usage.input_tokens + message.usage.output_tokens;
          costUsd = message.total_cost_usd;

          if (message.subtype === 'success') {
            return {
              success: true,
              output: message.result || output,
              tokensUsed,
              costUsd,
            };
          } else {
            // Error during execution
            const errors = 'errors' in message ? message.errors.join('\n') : 'Unknown error';
            return {
              success: false,
              output,
              error: `Execution error: ${message.subtype}\n${errors}`,
              tokensUsed,
              costUsd,
            };
          }
        }
      }

      // If we exit the loop without a result message, something went wrong
      throw new Error('Query completed without result message');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output,
        error: errorMessage,
        tokensUsed,
        costUsd,
      };
    }
  }

  /**
   * Extract text content from assistant message
   */
  private extractTextFromAssistant(message: SDKMessage): string {
    if (message.type !== 'assistant') return '';

    const content = message.message.content;
    if (!Array.isArray(content)) return '';

    return content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('\n');
  }

  /**
   * Build system prompt based on agent role
   */
  private buildSystemPrompt(agent: Agent, workspacePath: string): string {
    const basePrompt = `You are an AI agent with the role: ${agent.role}.`;

    const rolePrompts: Record<string, string> = {
      'spec-writer': `Your task is to write clear, detailed specifications.
Focus on requirements, constraints, and success criteria.
Use markdown format with sections for Overview, Requirements, and Acceptance Criteria.`,

      'implementer': `Your task is to implement code based on specifications.
Write clean, well-structured code with proper error handling.
Follow best practices and use TypeScript types correctly.`,

      'tester': `Your task is to write comprehensive tests.
Use Vitest for testing and aim for high coverage.
Test both happy paths and edge cases.`,

      'reviewer': `Your task is to review code for quality and correctness.
Check for bugs, security issues, and code style.
Provide constructive feedback with specific suggestions.`,

      'file-writer': `Your task is to create and write files.
Ensure file content is exactly as requested.
Use proper file permissions and encoding.`,
    };

    const roleSpecificPrompt = rolePrompts[agent.role] || '';

    let prompt = basePrompt;
    if (roleSpecificPrompt) {
      prompt += '\n\n' + roleSpecificPrompt;
    }

    prompt += `\n\nYou are working in the directory: ${workspacePath}`;
    prompt += `\nAll file operations should be relative to this directory.`;

    return prompt;
  }

  /**
   * Get appropriate Claude model for agent role
   */
  private getModelForRole(role: string): string {
    const modelMap: Record<string, string> = {
      'spec-writer': 'claude-3-5-sonnet-20241022',
      'implementer': 'claude-3-5-sonnet-20241022',
      'reviewer': 'claude-3-5-sonnet-20241022',
      'tester': 'claude-3-5-sonnet-20241022',
      'file-writer': 'claude-3-5-haiku-20241022', // Haiku for simple tasks
    };

    return modelMap[role] || 'claude-3-5-sonnet-20241022';
  }
}
