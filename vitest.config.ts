import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node.js environment for testing
    environment: 'node',

    // Enable global test APIs (describe, it, expect, etc.)
    globals: true,

    // Test file patterns
    include: ['tests/**/*.test.ts'],

    // Setup files to run before tests
    setupFiles: ['tests/setup/vitest.setup.ts'],

    // Test timeout (10 seconds for integration tests)
    testTimeout: 10000,

    // Coverage configuration
    coverage: {
      // Use V8 provider for coverage collection
      provider: 'v8',

      // Coverage reporters
      reporter: ['text', 'json', 'html'],

      // Coverage thresholds (80% minimum)
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },

      // Exclude common directories from coverage
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'tests/**',
      ],
    },
  },
});
