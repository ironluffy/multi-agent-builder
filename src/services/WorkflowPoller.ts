import { WorkflowEngine } from '../core/WorkflowEngine.js';
import { WorkflowRepository } from '../database/repositories/WorkflowRepository.js';
import { AgentRepository } from '../database/repositories/AgentRepository.js';
import { logger } from '../utils/Logger.js';

/**
 * WorkflowPoller
 * Polls for completed agents and triggers workflow continuation.
 *
 * This service bridges agent completion with workflow orchestration by:
 * - Detecting when workflow agents complete
 * - Triggering processCompletedNode() for event-driven continuation
 * - Handling workflow failures and timeouts
 *
 * Usage:
 * - Start polling: await poller.start()
 * - Stop polling: await poller.stop()
 * - One-time poll: await poller.pollOnce()
 */
export class WorkflowPoller {
  private workflowEngine: WorkflowEngine;
  private workflowRepo: WorkflowRepository;
  private agentRepo: AgentRepository;
  private pollerLogger = logger.child({ component: 'WorkflowPoller' });

  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;

  // Configurable polling settings
  private pollIntervalMs: number;
  private maxRetries: number;

  constructor(pollIntervalMs = 5000, maxRetries = 3) {
    this.workflowEngine = new WorkflowEngine();
    this.workflowRepo = new WorkflowRepository();
    this.agentRepo = new AgentRepository();
    this.pollIntervalMs = pollIntervalMs;
    this.maxRetries = maxRetries;
  }

  /**
   * Start continuous polling for completed agents
   */
  async start(): Promise<void> {
    if (this.isPolling) {
      this.pollerLogger.warn('Poller already running');
      return;
    }

    this.isPolling = true;
    this.pollerLogger.info({ intervalMs: this.pollIntervalMs }, 'Starting workflow poller');

    // Run initial poll
    await this.pollOnce();

    // Start interval
    this.intervalId = setInterval(async () => {
      try {
        await this.pollOnce();
      } catch (error) {
        this.pollerLogger.error({ error }, 'Polling cycle failed');
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop continuous polling
   */
  async stop(): Promise<void> {
    if (!this.isPolling) {
      this.pollerLogger.warn('Poller not running');
      return;
    }

    this.isPolling = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.pollerLogger.info('Workflow poller stopped');
  }

  /**
   * Perform a single polling cycle
   * Checks for completed agents and triggers workflow continuation
   */
  async pollOnce(): Promise<void> {
    this.pollerLogger.debug('Starting poll cycle');

    try {
      // 1. Find all active workflow graphs
      const activeGraphs = await this.workflowRepo.findGraphsByStatus('active');

      if (activeGraphs.length === 0) {
        this.pollerLogger.debug('No active workflows');
        return;
      }

      this.pollerLogger.info({ count: activeGraphs.length }, 'Found active workflows');

      // 2. For each active workflow, check for newly completed nodes
      for (const graph of activeGraphs) {
        await this.processWorkflow(graph.id);
      }

    } catch (error) {
      this.pollerLogger.error({ error }, 'Poll cycle failed');
      throw error;
    }
  }

  /**
   * Process a single workflow graph
   * Checks for completed agents and triggers continuation
   */
  private async processWorkflow(graphId: string): Promise<void> {
    try {
      // 1. Get all nodes for this workflow
      const nodes = await this.workflowRepo.findNodesByGraphId(graphId);

      // 2. Find nodes that are 'executing' but have completed agents
      const executingNodes = nodes.filter(n => n.execution_status === 'executing' && n.agent_id);

      if (executingNodes.length === 0) {
        this.pollerLogger.debug({ graphId }, 'No executing nodes');
        return;
      }

      this.pollerLogger.debug(
        { graphId, executingCount: executingNodes.length },
        'Checking executing nodes'
      );

      // 3. Check agent status for each executing node
      for (const node of executingNodes) {
        const agent = await this.agentRepo.findById(node.agent_id!);

        if (!agent) {
          this.pollerLogger.warn(
            { nodeId: node.id, agentId: node.agent_id },
            'Agent not found for node'
          );
          continue;
        }

        // 4. If agent completed, trigger workflow continuation
        if (agent.status === 'completed') {
          this.pollerLogger.info(
            { graphId, nodeId: node.id, agentId: agent.id, role: node.role },
            'Agent completed - triggering workflow continuation'
          );

          // Extract result from agent (currently stored in node.result)
          // TODO: Add metadata field to Agent model for result storage
          const result = node.result || undefined;

          // Trigger event-driven continuation
          await this.workflowEngine.processCompletedNode(agent.id, result);
        }

        // 5. If agent failed, mark node as failed
        else if (agent.status === 'failed') {
          this.pollerLogger.warn(
            { graphId, nodeId: node.id, agentId: agent.id, role: node.role },
            'Agent failed - marking node as failed'
          );

          await this.workflowRepo.updateNode(node.id, {
            execution_status: 'failed',
            error_message: 'Agent failed',
            completion_timestamp: new Date(),
          });

          // Check if workflow should be terminated (all nodes failed/completed)
          await this.checkWorkflowFailure(graphId);
        }

        // 6. Check for timeouts (optional - requires timeout tracking)
        // TODO: Add timeout handling
      }

    } catch (error) {
      this.pollerLogger.error({ error, graphId }, 'Failed to process workflow');

      // Mark workflow as failed if processing fails repeatedly
      // TODO: Add retry counter and failure threshold
    }
  }

  /**
   * Check if workflow should be marked as failed
   * Called when a node fails
   */
  private async checkWorkflowFailure(graphId: string): Promise<void> {
    try {
      const progress = await this.workflowEngine.getWorkflowProgress(graphId);

      // If there are failed nodes and no pending/executing nodes, workflow failed
      if (progress.failed > 0 && progress.executing === 0 && progress.pending === 0) {
        this.pollerLogger.error(
          { graphId, failedCount: progress.failed },
          'Workflow failed - terminating'
        );

        await this.workflowEngine.terminateWorkflow(graphId);
      }
    } catch (error) {
      this.pollerLogger.error({ error, graphId }, 'Failed to check workflow failure');
    }
  }

  /**
   * Get poller status
   */
  getStatus(): {
    isPolling: boolean;
    pollIntervalMs: number;
    maxRetries: number;
  } {
    return {
      isPolling: this.isPolling,
      pollIntervalMs: this.pollIntervalMs,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Update polling interval (only when stopped)
   */
  setPollingInterval(intervalMs: number): void {
    if (this.isPolling) {
      throw new Error('Cannot change polling interval while poller is running');
    }
    this.pollIntervalMs = intervalMs;
  }
}
