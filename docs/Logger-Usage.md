# Logger Usage Guide

## Overview

The Logger utility provides structured logging using Pino with support for different log levels, child loggers, and context-aware logging.

## Basic Usage

```typescript
import { logger } from '../utils/Logger';

// Simple string logging
logger.info('Application started');
logger.debug('Debug information');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Critical error');

// Object logging with message
logger.info({ userId: '123', action: 'login' }, 'User logged in');
logger.error({ error: new Error('Something failed') }, 'Operation failed');
```

## Child Loggers with Context

Create child loggers to automatically include context in all log entries:

```typescript
import { logger } from '../utils/Logger';

// Create a child logger for a specific component
const agentLogger = logger.child({
  component: 'AgentService',
  agentId: 'agent-001'
});

// All logs from this child will include component and agentId
agentLogger.info('Agent initialized');
agentLogger.debug({ status: 'ready' }, 'Agent ready for tasks');
```

## Configuration

The logger respects the following environment variables:

- `LOG_LEVEL`: Set the minimum log level (default: 'info')
  - Available levels: trace, debug, info, warn, error, fatal
- `NODE_ENV`: When set to 'production', uses JSON logging. Otherwise uses pino-pretty for readable output.

## Example: Using in AgentService

```typescript
import { logger } from '../utils/Logger';

class AgentService {
  private logger;

  constructor(agentId: string) {
    // Create a child logger with component context
    this.logger = logger.child({
      component: 'AgentService',
      agentId
    });
  }

  async startAgent() {
    this.logger.info('Starting agent');
    try {
      // ... agent logic ...
      this.logger.info('Agent started successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start agent');
      throw error;
    }
  }
}
```

## Features

- **Singleton Pattern**: Single logger instance across the application
- **Structured Logging**: Logs in JSON format for easy parsing and analysis
- **Child Loggers**: Add persistent context to related log entries
- **Pretty Printing**: Human-readable logs in development
- **Error Serialization**: Automatic error object serialization
- **TypeScript Support**: Full type definitions included
- **Performance**: Pino is one of the fastest Node.js loggers
