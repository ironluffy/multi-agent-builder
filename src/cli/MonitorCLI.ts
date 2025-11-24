/**
 * MonitorCLI - Terminal-based real-time monitoring interface
 *
 * Displays a live dashboard of all agents, their status, and current activity.
 * Refreshes automatically to show real-time progress.
 */

import { db } from '../infrastructure/SharedDatabase.js';
import { logger } from '../utils/Logger.js';

export interface AgentSummary {
  id: string;
  role: string;
  status: string;
  depth_level: number;
  parent_id: string | null;
  tokens_used: number;
  budget_allocated: number;
  budget_used: number;
  budget_reserved: number;
  budget_available: number;
  created_at: Date;
  latest_event: string | null;
}

export class MonitorCLI {
  private refreshIntervalMs: number;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(refreshIntervalMs: number = 2000) {
    this.refreshIntervalMs = refreshIntervalMs;
  }

  /**
   * Start the monitoring CLI
   */
  async start(): Promise<void> {
    this.isRunning = true;

    // Initialize database
    await db.initialize();

    // Initial render
    await this.render();

    // Set up interval for updates
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.render();
      }
    }, this.refreshIntervalMs);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });
  }

  /**
   * Stop the monitoring CLI
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await db.shutdown();
  }

  /**
   * Render the monitoring dashboard
   */
  async render(): Promise<void> {
    // Clear screen (using ANSI escape codes)
    console.clear();
    console.log('\x1b[H'); // Move cursor to top

    // Header
    this.printHeader();

    // Fetch all agents
    const agents = await this.fetchAllAgents();

    if (agents.length === 0) {
      console.log('\n  No agents found. Spawn an agent to see it here!\n');
      this.printFooter();
      return;
    }

    // Agent table
    this.printAgentTable(agents);

    // Current activity
    const activeAgent = agents.find((a) => a.status === 'executing');
    if (activeAgent) {
      await this.printCurrentActivity(activeAgent.id);
    }

    // Budget summary
    await this.printBudgetSummary(agents);

    // Footer
    this.printFooter();
  }

  /**
   * Print header
   */
  private printHeader(): void {
    const width = 100;
    console.log('═'.repeat(width));
    console.log('  🤖 Multi-Agent System Monitor (Real-time)'.padEnd(width - 1) + '║');
    console.log('═'.repeat(width));
  }

  /**
   * Print footer
   */
  private printFooter(): void {
    console.log('\n  Press Ctrl+C to exit');
    console.log(`  Last updated: ${new Date().toLocaleTimeString()}`);
  }

  /**
   * Print agent table
   */
  private printAgentTable(agents: AgentSummary[]): void {
    console.log('\n' + '─'.repeat(100));
    console.log(
      'Agent ID'.padEnd(15) +
        ' │ ' +
        'Role'.padEnd(15) +
        ' │ ' +
        'Status'.padEnd(12) +
        ' │ ' +
        'Tokens'.padEnd(8) +
        ' │ ' +
        'Progress'
    );
    console.log('─'.repeat(100));

    for (const agent of agents) {
      const agentIdShort = agent.id.substring(0, 12);
      const status = this.colorizeStatus(agent.status);
      const progress = this.renderProgress(agent.status);
      const tokens = agent.tokens_used.toString();

      console.log(
        agentIdShort.padEnd(15) +
          ' │ ' +
          agent.role.padEnd(15) +
          ' │ ' +
          status.padEnd(20) + // Extra padding for ANSI colors
          ' │ ' +
          tokens.padEnd(8) +
          ' │ ' +
          progress
      );
    }

    console.log('─'.repeat(100));
  }

  /**
   * Print current activity for active agent
   */
  private async printCurrentActivity(agentId: string): Promise<void> {
    try {
      const recentTraces = await db.query(
        `SELECT timestamp, message_type, content
         FROM agent_traces
         WHERE agent_id = $1
         ORDER BY trace_index DESC
         LIMIT 5`,
        [agentId]
      );

      if (recentTraces.rows.length === 0) {
        return;
      }

      console.log('\n📝 Recent Activity:');
      console.log('─'.repeat(100));

      for (const trace of recentTraces.rows) {
        const time = new Date(trace.timestamp).toLocaleTimeString();
        const content = trace.content.substring(0, 70).replace(/\n/g, ' ');
        console.log(`  [${time}] ${trace.message_type.padEnd(15)}: ${content}`);
      }
    } catch (error) {
      // Silently fail if query errors
    }
  }

  /**
   * Print budget summary
   */
  private async printBudgetSummary(agents: AgentSummary[]): Promise<void> {
    const totalAllocated = agents.reduce((sum, a) => sum + (a.budget_allocated || 0), 0);
    const totalUsed = agents.reduce((sum, a) => sum + (a.tokens_used || 0), 0);
    const totalReserved = agents.reduce((sum, a) => sum + (a.budget_reserved || 0), 0);
    const totalAvailable = totalAllocated - totalUsed - totalReserved;

    console.log('\n💰 Budget Summary:');
    console.log('─'.repeat(100));
    console.log(`  Total Allocated:  ${totalAllocated.toLocaleString()} tokens`);
    console.log(`  Total Used:       ${totalUsed.toLocaleString()} tokens (${((totalUsed / totalAllocated) * 100).toFixed(1)}%)`);
    console.log(`  Total Reserved:   ${totalReserved.toLocaleString()} tokens`);
    console.log(`  Available:        ${totalAvailable.toLocaleString()} tokens`);
  }

  /**
   * Fetch all agents with monitoring view
   */
  private async fetchAllAgents(): Promise<AgentSummary[]> {
    try {
      const result = await db.query(`
        SELECT * FROM agent_monitoring_view
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return result.rows as AgentSummary[];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch agents for monitoring');
      return [];
    }
  }

  /**
   * Render progress bar based on status
   */
  private renderProgress(status: string): string {
    const bars: Record<string, string> = {
      pending: '░░░░░░░░',
      executing: '▓▓▓▓░░░░',
      completed: '▓▓▓▓▓▓▓▓',
      failed: '✗✗✗✗✗✗✗✗',
      terminated: '⊗⊗⊗⊗⊗⊗⊗⊗',
    };
    return bars[status] || '????????';
  }

  /**
   * Colorize status with ANSI colors
   */
  private colorizeStatus(status: string): string {
    const colors: Record<string, string> = {
      pending: '\x1b[33m' + status + '\x1b[0m', // Yellow
      executing: '\x1b[36m' + status + '\x1b[0m', // Cyan
      completed: '\x1b[32m' + status + '\x1b[0m', // Green
      failed: '\x1b[31m' + status + '\x1b[0m', // Red
      terminated: '\x1b[90m' + status + '\x1b[0m', // Gray
    };
    return colors[status] || status;
  }
}

// Allow running directly from command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new MonitorCLI(2000);
  monitor.start().catch((error) => {
    console.error('Failed to start monitor:', error);
    process.exit(1);
  });
}
