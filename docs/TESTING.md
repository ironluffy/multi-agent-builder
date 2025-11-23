# Testing Guide

This guide covers how to run and write tests for the multi-agent orchestration system.

## Quick Start

### 1. Prerequisites

Ensure you have:
- Node.js 18+ installed
- PostgreSQL running locally
- A PostgreSQL user with database creation privileges

### 2. Configure Environment

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
cp .env.example .env
```

Update the database credentials for your local PostgreSQL:

```bash
# Use your actual PostgreSQL username instead of 'postgres'
DB_USER=your_username
DB_PASSWORD=your_password

# Test database will be created automatically
TEST_DB_NAME=multi_agent_builder_test
TEST_DB_USER=your_username
TEST_DB_PASSWORD=your_password
```

**Common macOS Setup:**
If you installed PostgreSQL via Homebrew, your username is typically your macOS username:

```bash
DB_USER=$(whoami)
DB_PASSWORD=  # Often no password for local Homebrew installations
TEST_DB_USER=$(whoami)
TEST_DB_PASSWORD=
```

### 3. Setup Test Database

Run the setup script to create the test database:

```bash
npx tsx tests/setup/test-db-setup.ts setup
```

This will:
- Create the test database
- Run all migrations
- Verify tables are created

### 4. Run Tests

```bash
# Run all tests
npm test

# Run only integration tests
npm test tests/integration

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Test Types

### Unit Tests
Location: `tests/unit/`

Test individual functions and classes in isolation:
- Pure functions
- Class methods
- Utility functions

Example:
```typescript
import { TokenCounter } from '../../src/core/AgentCore.js';

describe('TokenCounter', () => {
  it('should estimate tokens correctly', () => {
    const text = 'Hello, world!';
    const tokens = TokenCounter.estimateTokens(text);
    expect(tokens).toBe(4);
  });
});
```

### Integration Tests
Location: `tests/integration/`

Test how components work together:
- Database operations
- Service interactions
- API integrations (mocked)

Example:
```typescript
import { AgentService } from '../../src/services/AgentService.js';
import { db } from '../../src/infrastructure/SharedDatabase.js';

describe('Agent Lifecycle', () => {
  beforeAll(async () => {
    await db.initialize();
  });

  it('should spawn and complete agent', async () => {
    const agentId = await agentService.spawnAgent('test', 'task', 10000);
    await agentService.updateAgentStatus(agentId, 'completed');

    const agent = await agentService.getAgentStatus(agentId);
    expect(agent.status).toBe('completed');
  });
});
```

### Contract Tests
Location: `tests/contract/`

Test API contracts and interfaces:
- Request/response schemas
- Type definitions
- Interface contracts

### End-to-End Tests
Location: `tests/e2e/`

Test complete user workflows:
- Full agent spawning and execution
- Multi-level agent hierarchies
- Real-world scenarios

## Writing Tests

### Test Structure

Follow this pattern for all tests:

```typescript
describe('Feature: Description', () => {
  // Setup before all tests in this suite
  beforeAll(async () => {
    // Initialize resources
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Close connections, cleanup
  });

  // Reset state before each test
  beforeEach(async () => {
    // Clean test data
  });

  // Cleanup after each test
  afterEach(async () => {
    // Optional cleanup
  });

  describe('Specific functionality', () => {
    it('should do something specific', async () => {
      // Arrange: Set up test data
      const input = 'test';

      // Act: Execute the code
      const result = await someFunction(input);

      // Assert: Verify expectations
      expect(result).toBe('expected');
    });
  });
});
```

### Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
   ```typescript
   // Good
   it('should spawn agent with correct initial status', async () => {});

   // Bad
   it('test agent', async () => {});
   ```

2. **Test Isolation**: Each test should be independent
   ```typescript
   beforeEach(async () => {
     // Clean database before each test
     await cleanDatabase();
   });
   ```

3. **Mock External Services**: Never call real external APIs
   ```typescript
   vi.mock('@anthropic-ai/sdk', () => ({
     default: vi.fn().mockImplementation(() => ({
       messages: {
         create: vi.fn().mockResolvedValue({
           content: [{ type: 'text', text: 'mock response' }],
           usage: { input_tokens: 10, output_tokens: 20 }
         })
       }
     }))
   }));
   ```

4. **Test Both Success and Failure**: Cover error cases
   ```typescript
   it('should handle missing agent gracefully', async () => {
     await expect(
       agentService.getAgentStatus('nonexistent-id')
     ).rejects.toThrow('Agent not found');
   });
   ```

5. **Use Assertions Effectively**: Be specific about what you're testing
   ```typescript
   // Good
   expect(agent.status).toBe('completed');
   expect(agent.completed_at).toBeInstanceOf(Date);

   // Bad
   expect(agent).toBeTruthy();
   ```

## Mocking

### Mocking Anthropic API

The Anthropic API is mocked in integration tests to avoid real API calls:

```typescript
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          content: [{ type: 'text', text: 'Test response' }],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      }
    }))
  };
});
```

### Mocking Database

For unit tests, you may want to mock database operations:

```typescript
vi.mock('../../src/infrastructure/SharedDatabase.js', () => ({
  db: {
    query: vi.fn(),
    transaction: vi.fn(),
    initialize: vi.fn(),
    shutdown: vi.fn()
  }
}));
```

## Test Coverage

### Checking Coverage

```bash
# Run tests with coverage
npm test -- --coverage

# Open HTML coverage report
open coverage/index.html
```

### Coverage Goals

- **Minimum**: 80% for all metrics (lines, branches, functions, statements)
- **Target**: 90%+ for core business logic

### Coverage Configuration

See `vitest.config.ts` for coverage thresholds:

```typescript
coverage: {
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  }
}
```

## Debugging Tests

### Run Single Test

```typescript
it.only('should spawn agent', async () => {
  // Only this test will run
});
```

### Skip Test

```typescript
it.skip('should handle complex scenario', async () => {
  // This test will be skipped
});
```

### Enable Verbose Logging

```bash
LOG_LEVEL=debug npm test
```

### Debug in VSCode

Add this configuration to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test", "--", "--run"],
  "console": "integratedTerminal"
}
```

## Common Issues

### Database Connection Errors

**Problem**: `role "postgres" does not exist`

**Solution**: Update `.env` with your actual PostgreSQL username:
```bash
DB_USER=$(whoami)
TEST_DB_USER=$(whoami)
```

### Test Timeout

**Problem**: Tests timeout after 10 seconds

**Solution**: Increase timeout in test:
```typescript
it('should handle slow operation', async () => {
  // Test code
}, 20000); // 20 second timeout
```

### Flaky Tests

**Problem**: Tests pass sometimes, fail other times

**Solution**:
1. Ensure proper cleanup in `beforeEach`
2. Check for race conditions
3. Use deterministic test data
4. Avoid time-dependent assertions

### Port Already in Use

**Problem**: `EADDRINUSE` error

**Solution**: Kill the process using the port:
```bash
lsof -ti:5432 | xargs kill -9
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: multi_agent_builder_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Setup test database
        run: npx tsx tests/setup/test-db-setup.ts setup
        env:
          TEST_DB_USER: postgres
          TEST_DB_PASSWORD: postgres
          TEST_DB_HOST: localhost

      - name: Run tests
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [PostgreSQL Testing](https://www.postgresql.org/docs/current/regress.html)
