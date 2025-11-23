# Integration Tests

This directory contains integration tests for the multi-agent orchestration system.

## Overview

Integration tests verify that different components of the system work together correctly:

- **01-single-agent.test.ts**: Tests for single agent spawn, lifecycle, and budget management (US1)
  - Agent spawning with correct initial status
  - Budget allocation and tracking
  - Agent status transitions (state machine)
  - Parent-child agent relationships
  - Token usage tracking
  - Agent termination and failure scenarios

## Prerequisites

### 1. PostgreSQL Database

You need a PostgreSQL database for testing. The tests use a separate test database to avoid affecting development data.

### 2. Environment Variables

Copy `.env.example` to `.env` and configure the test database settings:

```bash
# Test Database Configuration
TEST_DATABASE_URL=postgresql://postgres:your_password@localhost:5432/multi_agent_builder_test
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=multi_agent_builder_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=your_password
```

### 3. Test Database Setup

Run the setup script to create and migrate the test database:

```bash
# Create test database and run migrations
npx tsx tests/setup/test-db-setup.ts setup

# Or reset the database (drop and recreate)
npx tsx tests/setup/test-db-setup.ts reset

# To teardown the test database
npx tsx tests/setup/test-db-setup.ts teardown
```

## Running Tests

### Run All Integration Tests

```bash
npm test tests/integration
```

### Run Specific Test File

```bash
npm test tests/integration/01-single-agent.test.ts
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Run in Watch Mode

```bash
npm test -- --watch
```

## Test Structure

### Test Organization

Each test file follows this structure:

```typescript
describe('Feature: Description', () => {
  beforeAll(async () => {
    // Initialize database connection
    await db.initialize();
  });

  afterAll(async () => {
    // Close database connections
    await db.shutdown();
  });

  beforeEach(async () => {
    // Clean test data before each test
    await cleanDatabase();
  });

  describe('Specific functionality', () => {
    it('should do something specific', async () => {
      // Test implementation
    });
  });
});
```

### Mocking Strategy

- **Anthropic API**: Mocked using Vitest's `vi.mock()` to avoid real API calls
- **Database**: Real PostgreSQL database (test instance)
- **File System**: Real file system operations (in test workspace)

## Test Coverage Goals

Target: **>80% code coverage** for core agent functionality

Coverage includes:
- Agent lifecycle management
- Budget allocation and tracking
- Status transitions
- Error handling
- Database operations

## Debugging Tests

### Enable Verbose Logging

Set the log level in your test environment:

```bash
LOG_LEVEL=debug npm test
```

### Run Single Test

Use `.only` to run a single test:

```typescript
it.only('should spawn agent with correct initial status', async () => {
  // This test will run exclusively
});
```

### Skip Flaky Tests

Use `.skip` to temporarily skip a test:

```typescript
it.skip('should handle concurrent spawns', async () => {
  // This test will be skipped
});
```

## Common Issues

### Database Connection Errors

**Problem**: `Failed to connect to database`

**Solution**:
1. Ensure PostgreSQL is running
2. Verify TEST_DB_* environment variables
3. Check that the test database exists (run setup script)
4. Verify database credentials

### Test Timeout Errors

**Problem**: Tests timeout after 5 seconds

**Solution**:
1. Increase test timeout in vitest.config.ts
2. Check for hanging database connections
3. Ensure proper cleanup in afterEach/afterAll

### Clean Database Failures

**Problem**: Foreign key constraint violations during cleanup

**Solution**:
- Tables are deleted in correct order (respecting foreign keys)
- If issues persist, run: `npx tsx tests/setup/test-db-setup.ts reset`

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Setup Test Database
  run: npx tsx tests/setup/test-db-setup.ts setup

- name: Run Integration Tests
  run: npm test tests/integration

- name: Generate Coverage Report
  run: npm test -- --coverage
```

### Docker Compose Example

```yaml
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: multi_agent_builder_test
    ports:
      - "5432:5432"
```

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Clean Data**: Always clean test data in `beforeEach` hooks
3. **Descriptive Names**: Use clear, descriptive test names
4. **One Assertion Focus**: Each test should verify one specific behavior
5. **Mock External APIs**: Never make real API calls in tests
6. **Fast Tests**: Keep tests fast by minimizing database operations
7. **Deterministic**: Tests should produce the same results every time

## Maintenance

### Adding New Tests

1. Create a new test file: `XX-feature-name.test.ts`
2. Follow the existing test structure
3. Update this README with new test descriptions
4. Ensure >80% coverage for new code

### Updating Tests

When updating the codebase:
1. Update corresponding tests
2. Verify all tests pass
3. Check coverage hasn't decreased
4. Update test documentation if needed

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
