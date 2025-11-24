/**
 * Vitest Global Setup
 *
 * This file runs once before all tests.
 * Use it for global test configuration and environment setup.
 */

import { beforeAll, afterAll } from 'vitest';
import './test-env-setup.js';

// Global test timeout (10 seconds for integration tests)
export const testTimeout = 10000;

// You can add global beforeAll/afterAll hooks here if needed
// These will run once for the entire test suite

console.log('🚀 Vitest setup complete');
