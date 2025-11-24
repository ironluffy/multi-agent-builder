/**
 * AgentExecutionWorker - Polls for pending agents and executes them
 *
 * This worker runs in the background and continuously checks for agents
 * in 'pending' status. When found, it triggers their execution.
 *
 * This enables fully autonomous multi-agent operation where spawning an
 * agent automatically triggers its execution without manual intervention.
 */

import { AgentService } from './AgentService.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { logger } from '../utils/Logger.js';

export class AgentExecutionWorker {
  private agentService: AgentService;
  private agentRepo: AgentRepository;
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollIntervalMs: number;
  private workerLogger = logger.child({ component: 'AgentExecutionWorker' });
  private runningAgents = new Set<string>();

  constructor(pollIntervalMs: number = 5000, agentService?: AgentService) {
    this.pollIntervalMs = pollIntervalMs;
    this.agentService = agentService || new AgentService();
    this.agentRepo = new AgentRepository();
  }

  /**
   * Start the execution worker polling loop
   */
  async start(): Promise<void> {
    if (this.isPolling) {
      this.workerLogger.warn('Worker already running');
      return;
    }

    this.isPolling = true;
    this.workerLogger.info({ pollIntervalMs: this.pollIntervalMs }, 'Agent execution worker starting');

    // Run first poll immediately
    await this.pollOnce();

    // Then poll at intervals
    this.intervalId = setInterval(async () => {
      try {
        await this.pollOnce();
      } catch (error) {
        this.workerLogger.error({ error }, 'Polling cycle failed');
      }
    }, this.pollIntervalMs);

    this.workerLogger.info('Agent execution worker started');
  }

  /**
   * Stop the execution worker
   */
  async stop(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    this.isPolling = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.workerLogger.info('Agent execution worker stopped');
  }

  /**
   * Poll once for pending agents and execute them
   */
  async pollOnce(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    try {
      // Find all pending agents
      const pendingAgents = await this.agentRepo.findByStatus('pending');

      if (pendingAgents.length === 0) {
        this.workerLogger.debug('No pending agents found');
        return;
      }

      this.workerLogger.info(
        { count: pendingAgents.length },
        'Found pending agents'
      );

      // Execute each pending agent (if not already running)
      for (const agent of pendingAgents) {
        // Skip if agent is already being executed
        if (this.runningAgents.has(agent.id)) {
          this.workerLogger.debug({ agentId: agent.id }, 'Agent already running, skipping');
          continue;
        }

        // Mark as running
        this.runningAgents.add(agent.id);

        this.workerLogger.info(
          { agentId: agent.id, role: agent.role },
          'Starting agent execution'
        );

        // Execute agent asynchronously
        this.agentService
          .runAgent(agent.id)
          .then(() => {
            this.workerLogger.info({ agentId: agent.id }, 'Agent execution completed');
            this.runningAgents.delete(agent.id);
          })
          .catch((error) => {
            this.workerLogger.error(
              { agentId: agent.id, error },
              'Agent execution failed'
            );
            this.runningAgents.delete(agent.id);
          });
      }
    } catch (error) {
      this.workerLogger.error({ error }, 'Failed to poll for pending agents');
    }
  }

  /**
   * Get current worker status
   */
  getStatus(): {
    isRunning: boolean;
    runningAgentCount: number;
    pollIntervalMs: number;
  } {
    return {
      isRunning: this.isPolling,
      runningAgentCount: this.runningAgents.size,
      pollIntervalMs: this.pollIntervalMs,
    };
  }
}
