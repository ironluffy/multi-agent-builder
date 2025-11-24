/**
 * Test Environment Setup
 *
 * This module configures environment variables for testing.
 * Import this at the top of test files to ensure proper configuration.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config();

// Override with test-specific configurations if not already set
if (!process.env.DB_HOST) {
  process.env.DB_HOST = 'localhost';
}

if (!process.env.DB_PORT) {
  process.env.DB_PORT = '5432';
}

if (!process.env.DB_NAME) {
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'multi_agent_builder_test';
}

if (!process.env.DB_USER) {
  process.env.DB_USER = process.env.TEST_DB_USER || process.env.USER || 'postgres';
}

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
}

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Set log level to warn to reduce noise in tests
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'warn';
}

// Mock Anthropic API key for tests (not used due to mocking)
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
}

export const testConfig = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
  },
};

console.log('🧪 Test environment configured:', {
  database: testConfig.db.database,
  user: testConfig.db.user,
  host: testConfig.db.host,
  port: testConfig.db.port,
});
