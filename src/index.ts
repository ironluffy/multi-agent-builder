import { config, validateConfig } from './config/env.js';
import { logger } from './utils/Logger.js';
import { db } from './infrastructure/SharedDatabase.js';
import { InteractiveCLI } from './cli/InteractiveCLI.js';

/**
 * Multi-Agent Orchestration System
 * Entry point for the application
 */

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
  await db.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await db.shutdown();
  process.exit(0);
});

main();
