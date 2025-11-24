import * as readline from 'readline';
import { AgentService } from '../services/AgentService.js';
import { logger } from '../utils/Logger.js';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

/**
 * Interactive CLI for Multi-Agent Orchestrator
 *
 * Provides a terminal-based chat interface for interacting with the root agent.
 * Supports real-time agent status display, budget tracking, and conversational interaction.
 */
export class InteractiveCLI {
  private rl: readline.Interface;
  private agentService: AgentService;
  private rootAgentId?: string;
  private isRunning: boolean = false;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.formatPrompt('> '),
    });
    this.agentService = new AgentService();
  }

  /**
   * Start the interactive CLI session
   */
  async start(): Promise<void> {
    this.isRunning = true;

    // Display banner
    this.displayBanner();

    try {
      // Spawn root agent
      console.log(this.colorize('Initializing root agent...', colors.cyan));
      this.rootAgentId = await this.agentService.spawnAgent(
        'assistant',
        'Interactive conversation with human user. Provide helpful, accurate, and friendly responses.',
        100000
      );

      // Update agent to executing status
      await this.agentService.updateAgentStatus(this.rootAgentId, 'executing');

      console.log(this.colorize(`\nRoot agent ready: ${this.rootAgentId}`, colors.green));
      console.log(this.colorize('Type your message or /help for commands\n', colors.gray));

      // Set up readline handlers
      this.rl.prompt();

      this.rl.on('line', (input) => {
        void this.handleInput(input.trim()).then(() => {
          if (this.isRunning) {
            this.rl.prompt();
          }
        });
      });

      this.rl.on('close', () => {
        this.handleClose();
      });

    } catch (error) {
      logger.error({ error }, 'Failed to start interactive CLI');
      console.error(this.colorize('Failed to initialize agent system', colors.red));
      process.exit(1);
    }
  }

  /**
   * Display the CLI banner
   */
  private displayBanner(): void {
    console.clear();
    console.log(this.colorize('━'.repeat(70), colors.cyan));
    console.log(this.colorize('🤖  Multi-Agent Orchestrator - Interactive CLI', colors.bright + colors.cyan));
    console.log(this.colorize('━'.repeat(70), colors.cyan));
    console.log();
  }

  /**
   * Handle user input
   */
  private async handleInput(input: string): Promise<void> {
    if (!input) {
      return;
    }

    if (input.startsWith('/')) {
      await this.handleCommand(input);
    } else {
      await this.sendMessageToAgent(input);
    }
  }

  /**
   * Handle CLI commands
   */
  private async handleCommand(cmd: string): Promise<void> {
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();

    try {
      switch (command) {
        case '/status':
          await this.showStatus();
          break;

        case '/budget':
          await this.showBudget();
          break;

        case '/history':
          this.showHistory();
          break;

        case '/clear':
          this.clearScreen();
          break;

        case '/system':
          await this.showSystemSummary();
          break;

        case '/help':
          this.showHelp();
          break;

        case '/quit':
        case '/exit':
          await this.quit();
          break;

        default:
          console.log(this.colorize(`Unknown command: ${String(command)}`, colors.red));
          console.log(this.colorize('Type /help for available commands', colors.gray));
      }
    } catch (error) {
      logger.error({ error, command }, 'Command execution failed');
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(this.colorize(`Error executing command: ${errorMsg}`, colors.red));
    }
  }

  /**
   * Send a message to the root agent
   */
  private async sendMessageToAgent(message: string): Promise<void> {
    if (!this.rootAgentId) {
      console.log(this.colorize('Error: Root agent not initialized', colors.red));
      return;
    }

    try {
      // Store user message
      await this.agentService.storeMessage(this.rootAgentId, 'user', message);
      this.conversationHistory.push({ role: 'user', content: message });

      // Display thinking indicator
      process.stdout.write(this.colorize('Agent: ', colors.magenta));
      process.stdout.write(this.colorize('[Processing...] ', colors.dim));

      // Simulate agent processing (in real implementation, this would call Claude API)
      const response = await this.simulateAgentResponse(message);

      // Clear the processing indicator
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      // Display agent response
      console.log(this.colorize('Agent: ', colors.magenta) + response);
      console.log();

      // Store agent response
      await this.agentService.storeMessage(this.rootAgentId, 'assistant', response);
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Update token usage (simulated)
      const estimatedTokens = Math.ceil((message.length + response.length) / 4);
      await this.agentService.updateTokenUsage(this.rootAgentId, estimatedTokens);

    } catch (error) {
      logger.error({ error, message }, 'Failed to send message to agent');
      console.log(this.colorize('Error: Failed to process message', colors.red));
    }
  }

  /**
   * Simulate agent response (placeholder for actual Claude API integration)
   */
  private async simulateAgentResponse(message: string): Promise<string> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate contextual response based on message
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! I'm your assistant agent. How can I help you today?";
    } else if (lowerMessage.includes('help')) {
      return "I'm here to assist you! You can ask me questions, request tasks, or use commands like /status to check my status.";
    } else if (lowerMessage.includes('status')) {
      return "I'm currently executing and ready to help. You can check detailed status with the /status command.";
    } else if (lowerMessage.includes('thank')) {
      return "You're welcome! Feel free to ask if you need anything else.";
    } else if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
      return "Goodbye! Use /quit to exit the CLI.";
    } else {
      return `I received your message: "${message}". I'm a simulated agent response. In the full implementation, I would process this through Claude API and provide intelligent responses.`;
    }
  }

  /**
   * Show agent status
   */
  private async showStatus(): Promise<void> {
    if (!this.rootAgentId) {
      console.log(this.colorize('Error: No active agent', colors.red));
      return;
    }

    try {
      const status = await this.agentService.getAgentStatus(this.rootAgentId);
      const budget = await this.agentService.getBudget(this.rootAgentId);

      console.log();
      console.log(this.colorize('┌─ Agent Status ─────────────────────────────────┐', colors.cyan));
      console.log(this.formatStatusLine('ID', status.id));
      console.log(this.formatStatusLine('Role', status.role));
      console.log(this.formatStatusLine('Status', this.formatStatus(status.status)));
      console.log(this.formatStatusLine('Depth Level', status.depth_level.toString()));
      console.log(this.formatStatusLine('Task', status.task_description));
      console.log(this.formatStatusLine('Created', this.formatDate(status.created_at)));
      console.log(this.formatStatusLine('Updated', this.formatDate(status.updated_at)));

      const budgetPercent = ((budget.used / budget.allocated) * 100).toFixed(1);
      const budgetBar = this.createProgressBar(budget.used, budget.allocated, 20);
      console.log(this.formatStatusLine('Budget',
        `${budgetBar} ${budgetPercent}% (${budget.used.toLocaleString()}/${budget.allocated.toLocaleString()} tokens)`
      ));

      console.log(this.colorize('└────────────────────────────────────────────────┘', colors.cyan));
      console.log();
    } catch (error) {
      logger.error({ error }, 'Failed to show status');
      console.log(this.colorize('Error: Failed to retrieve agent status', colors.red));
    }
  }

  /**
   * Show budget information
   */
  private async showBudget(): Promise<void> {
    if (!this.rootAgentId) {
      console.log(this.colorize('Error: No active agent', colors.red));
      return;
    }

    try {
      const budget = await this.agentService.getBudget(this.rootAgentId);
      const remaining = budget.allocated - budget.used - budget.reserved;
      const percentUsed = ((budget.used / budget.allocated) * 100).toFixed(1);

      console.log();
      console.log(this.colorize('┌─ Budget Information ───────────────────────────┐', colors.cyan));
      console.log(this.formatStatusLine('Tokens Used', budget.used.toLocaleString()));
      console.log(this.formatStatusLine('Token Allocated', budget.allocated.toLocaleString()));
      console.log(this.formatStatusLine('Remaining', remaining.toLocaleString()));
      console.log(this.formatStatusLine('Usage', `${percentUsed}%`));

      // Calculate estimated cost ($3/million input, $15/million output, averaging $9/million)
      const estimatedCost = (budget.used / 1_000_000) * 9;
      console.log(this.formatStatusLine('Estimated Cost', `$${estimatedCost.toFixed(4)}`));

      const progressBar = this.createProgressBar(budget.used, budget.allocated, 40);
      console.log(this.formatStatusLine('Progress', progressBar));

      console.log(this.colorize('└────────────────────────────────────────────────┘', colors.cyan));
      console.log();
    } catch (error) {
      logger.error({ error }, 'Failed to show budget');
      console.log(this.colorize('Error: Failed to retrieve budget information', colors.red));
    }
  }

  /**
   * Show conversation history
   */
  private showHistory(): void {
    if (this.conversationHistory.length === 0) {
      console.log(this.colorize('No conversation history yet.', colors.gray));
      return;
    }

    console.log();
    console.log(this.colorize('┌─ Conversation History ─────────────────────────┐', colors.cyan));

    this.conversationHistory.forEach((msg, idx) => {
      const roleColor = msg.role === 'user' ? colors.green : colors.magenta;
      const roleLabel = msg.role === 'user' ? 'You' : 'Agent';
      console.log(this.colorize(`[${idx + 1}] ${roleLabel}:`, roleColor), msg.content);
    });

    console.log(this.colorize('└────────────────────────────────────────────────┘', colors.cyan));
    console.log();
  }

  /**
   * Show system-wide summary
   */
  private async showSystemSummary(): Promise<void> {
    try {
      const summary = await this.agentService.getSystemSummary();

      console.log();
      console.log(this.colorize('┌─ System Summary ───────────────────────────────┐', colors.cyan));
      console.log(this.formatStatusLine('Total Agents', summary.totalAgents.toString()));
      console.log(this.formatStatusLine('By Status', ''));

      Object.entries(summary.byStatus).forEach(([status, count]) => {
        console.log(this.formatStatusLine(`  ${status}`, count.toString()));
      });

      console.log(this.formatStatusLine('Total Tokens Used', summary.totalTokensUsed.toLocaleString()));
      console.log(this.formatStatusLine('Total Estimated Cost', `$${summary.totalEstimatedCost.toFixed(4)}`));
      console.log(this.colorize('└────────────────────────────────────────────────┘', colors.cyan));
      console.log();
    } catch (error) {
      logger.error({ error }, 'Failed to show system summary');
      console.log(this.colorize('Error: Failed to retrieve system summary', colors.red));
    }
  }

  /**
   * Clear the screen
   */
  private clearScreen(): void {
    console.clear();
    this.displayBanner();
    console.log(this.colorize('Screen cleared. Continue your conversation...\n', colors.gray));
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log();
    console.log(this.colorize('┌─ Available Commands ───────────────────────────┐', colors.cyan));
    console.log(this.formatStatusLine('/status', 'Show root agent status and information'));
    console.log(this.formatStatusLine('/budget', 'Display detailed budget and token usage'));
    console.log(this.formatStatusLine('/history', 'Show conversation history'));
    console.log(this.formatStatusLine('/system', 'Display system-wide agent summary'));
    console.log(this.formatStatusLine('/clear', 'Clear the screen'));
    console.log(this.formatStatusLine('/help', 'Show this help message'));
    console.log(this.formatStatusLine('/quit', 'Exit the CLI'));
    console.log(this.colorize('└────────────────────────────────────────────────┘', colors.cyan));
    console.log();
    console.log(this.colorize('Just type your message to chat with the agent!', colors.gray));
    console.log();
  }

  /**
   * Quit the CLI
   */
  private async quit(): Promise<void> {
    this.isRunning = false;

    console.log();
    console.log(this.colorize('Shutting down...', colors.yellow));

    if (this.rootAgentId) {
      try {
        // Update agent status to completed
        await this.agentService.updateAgentStatus(this.rootAgentId, 'completed');

        // Show final stats
        const budget = await this.agentService.getBudget(this.rootAgentId);
        const estimatedCost = (budget.used / 1_000_000) * 9;
        console.log(this.colorize(`Final token usage: ${budget.used.toLocaleString()} tokens`, colors.gray));
        console.log(this.colorize(`Estimated cost: $${estimatedCost.toFixed(4)}`, colors.gray));
      } catch (error) {
        logger.error({ error }, 'Error during cleanup');
      }
    }

    console.log(this.colorize('Goodbye!', colors.green));
    console.log();

    this.rl.close();
  }

  /**
   * Handle CLI close event
   */
  private handleClose(): void {
    if (this.isRunning) {
      this.quit().then(() => {
        process.exit(0);
      }).catch(() => {
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  }

  // Utility methods for formatting

  private colorize(text: string, color: string): string {
    return `${color}${text}${colors.reset}`;
  }

  private formatPrompt(prompt: string): string {
    return this.colorize(prompt, colors.green + colors.bright);
  }

  private formatStatus(status: string): string {
    let color = colors.white;
    switch (status) {
      case 'pending':
        color = colors.yellow;
        break;
      case 'executing':
        color = colors.cyan;
        break;
      case 'completed':
        color = colors.green;
        break;
      case 'failed':
        color = colors.red;
        break;
      case 'terminated':
        color = colors.gray;
        break;
    }
    return this.colorize(status.toUpperCase(), color);
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleString();
  }

  private formatStatusLine(label: string, value: string): string {
    const labelFormatted = this.colorize(`│ ${label}:`, colors.gray);
    const padding = label.length < 15 ? ' '.repeat(15 - label.length) : '';
    return `${labelFormatted}${padding} ${value}`;
  }

  private createProgressBar(current: number, total: number, width: number): string {
    const percent = Math.min(current / total, 1);
    const filled = Math.floor(width * percent);
    const empty = width - filled;

    let color = colors.green;
    if (percent > 0.9) color = colors.red;
    else if (percent > 0.7) color = colors.yellow;

    const bar = this.colorize('█'.repeat(filled), color) +
                this.colorize('░'.repeat(empty), colors.gray);

    return `[${bar}]`;
  }
}
