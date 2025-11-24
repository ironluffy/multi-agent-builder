import { config, validateConfig } from './config/env.js';
import { logger } from './utils/Logger.js';
import { db } from './infrastructure/SharedDatabase.js';
import { InteractiveCLI } from './cli/InteractiveCLI.js';
import { WorkflowPoller } from './services/WorkflowPoller.js';
import { AgentExecutionWorker } from './services/AgentExecutionWorker.js';

/**
 * Multi-Agent Orchestration System
 * Entry point for the application
 */

// Global instances
let workflowPoller: WorkflowPoller | null = null;
let agentExecutionWorker: AgentExecutionWorker | null = null;

async function main() {
  try {
    // Validate environment configuration
    validateConfig();

    logger.info('🚀 Starting Multi-Agent Orchestration System');
    logger.info(`Environment: ${config.app.env}`);
    logger.info(`Port: ${config.app.port}`);

    // Initialize database connection
    await db.initialize();
    logger.info('✓ Database connection established');

    // Start workflow poller for event-driven workflow execution
    workflowPoller = new WorkflowPoller(5000); // Poll every 5 seconds
    await workflowPoller.start();
    logger.info('✓ Workflow poller started');

    // Start agent execution worker for autonomous agent execution
    agentExecutionWorker = new AgentExecutionWorker(5000); // Poll every 5 seconds
    await agentExecutionWorker.start();
    logger.info('✓ Agent execution worker started');

    // Start interactive CLI
    if (config.interactive.enabled) {
      logger.info('Starting Interactive CLI...');
      const cli = new InteractiveCLI();
      await cli.start();
    } else {
      logger.info('Interactive mode is disabled. Set INTERACTIVE_ENABLED=true to enable.');
      logger.info('✓ System initialized successfully');
    }
  } catch (error) {
    logger.fatal(error, 'Failed to start system');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught Exception');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (agentExecutionWorker) {
    await agentExecutionWorker.stop();
    logger.info('✓ Agent execution worker stopped');
  }
  if (workflowPoller) {
    await workflowPoller.stop();
    logger.info('✓ Workflow poller stopped');
  }
  await db.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (agentExecutionWorker) {
    await agentExecutionWorker.stop();
    logger.info('✓ Agent execution worker stopped');
  }
  if (workflowPoller) {
    await workflowPoller.stop();
    logger.info('✓ Workflow poller stopped');
  }
  await db.shutdown();
  process.exit(0);
});

main();
