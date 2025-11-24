import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration schema using Zod for runtime validation
 */
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string().default('multi_agent_orchestrator'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().optional(),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_POOL_MAX: z.string().default('20'),
  DB_POOL_IDLE_TIMEOUT: z.string().default('30000'),
  DB_POOL_CONNECTION_TIMEOUT: z.string().default('2000'),

  // Anthropic API Configuration
  ANTHROPIC_API_KEY: z.string().min(1).describe('Anthropic API key for Claude'),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  ANTHROPIC_MAX_TOKENS: z.string().default('4096'),

  // Application Configuration
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Application environment'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info')
    .describe('Logging level'),
  PORT: z.string().default('3000').describe('HTTP server port'),

  // Agent Configuration
  DEFAULT_AGENT_BUDGET: z.string().default('10000').describe('Default token budget for agents'),
  MAX_AGENT_DEPTH: z.string().default('5').describe('Maximum hierarchy depth'),
  AGENT_TIMEOUT: z.string().default('300000').describe('Agent execution timeout (ms)'),

  // Interactive Session Configuration
  ENABLE_INTERACTIVE_UI: z.enum(['true', 'false']).default('true'),
  WS_PORT: z.string().default('3001').describe('WebSocket server port'),
  SESSION_TIMEOUT: z.string().default('3600000').describe('Session idle timeout (ms)'),
  APPROVAL_TIMEOUT: z.string().default('300000').describe('Approval request timeout (ms)'),

  // Workspace Configuration
  WORKTREE_BASE_PATH: z.string().default('./worktrees').describe('Base path for git worktrees'),
  WORKSPACE_CLEANUP_INTERVAL: z.string().default('3600000').describe('Cleanup interval (ms)'),

  // Message Queue Configuration
  MESSAGE_QUEUE_POLL_INTERVAL: z.string().default('1000').describe('Queue polling interval (ms)'),
  MESSAGE_RETENTION_DAYS: z.string().default('7').describe('Message retention period'),
});

/**
 * Parsed and validated environment configuration
 */
const parseEnv = () => {
  try {
    const parsed = envSchema.parse(process.env);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

// Validate and export configuration
const envConfig = parseEnv();

/**
 * Typed configuration object with parsed values
 */
export const config = {
  // Database
  database: {
    url: envConfig.DATABASE_URL,
    host: envConfig.DB_HOST,
    port: parseInt(envConfig.DB_PORT, 10),
    name: envConfig.DB_NAME,
    user: envConfig.DB_USER,
    password: envConfig.DB_PASSWORD,
    ssl: envConfig.DB_SSL === 'true',
    pool: {
      max: parseInt(envConfig.DB_POOL_MAX, 10),
      idleTimeout: parseInt(envConfig.DB_POOL_IDLE_TIMEOUT, 10),
      connectionTimeout: parseInt(envConfig.DB_POOL_CONNECTION_TIMEOUT, 10),
    },
  },

  // Anthropic API
  anthropic: {
    apiKey: envConfig.ANTHROPIC_API_KEY,
    model: envConfig.ANTHROPIC_MODEL,
    maxTokens: parseInt(envConfig.ANTHROPIC_MAX_TOKENS, 10),
  },

  // Application
  app: {
    env: envConfig.NODE_ENV,
    logLevel: envConfig.LOG_LEVEL,
    port: parseInt(envConfig.PORT, 10),
  },

  // Agent
  agent: {
    defaultBudget: parseInt(envConfig.DEFAULT_AGENT_BUDGET, 10),
    maxDepth: parseInt(envConfig.MAX_AGENT_DEPTH, 10),
    timeout: parseInt(envConfig.AGENT_TIMEOUT, 10),
  },

  // Interactive Session
  interactive: {
    enabled: envConfig.ENABLE_INTERACTIVE_UI === 'true',
    wsPort: parseInt(envConfig.WS_PORT, 10),
    sessionTimeout: parseInt(envConfig.SESSION_TIMEOUT, 10),
    approvalTimeout: parseInt(envConfig.APPROVAL_TIMEOUT, 10),
  },

  // Workspace
  workspace: {
    basePath: envConfig.WORKTREE_BASE_PATH,
    cleanupInterval: parseInt(envConfig.WORKSPACE_CLEANUP_INTERVAL, 10),
  },

  // Message Queue
  messageQueue: {
    pollInterval: parseInt(envConfig.MESSAGE_QUEUE_POLL_INTERVAL, 10),
    retentionDays: parseInt(envConfig.MESSAGE_RETENTION_DAYS, 10),
  },
} as const;

// Export type for TypeScript inference
export type Config = typeof config;

/**
 * Validate that all required environment variables are present
 * Exits the process if validation fails
 */
export const validateConfig = (): void => {
  console.log('✓ Environment configuration validated successfully');
  console.log(`  Environment: ${config.app.env}`);
  console.log(`  Log Level: ${config.app.logLevel}`);
  console.log(`  Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`  Interactive UI: ${config.interactive.enabled ? 'Enabled' : 'Disabled'}`);
};
