# Quick Start Guide - Running Integration Tests

## TL;DR

```bash
# 1. Setup (one-time)
npm run test:setup

# 2. Run tests
npm run test:integration

# 3. View coverage
npm run test:coverage
```

## First Time Setup

### Step 1: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and set your PostgreSQL credentials
# Use your actual macOS username instead of 'postgres'
nano .env
```

**Common macOS Setup** (Homebrew PostgreSQL):
```bash
DB_USER=$(whoami)
DB_PASSWORD=  # Leave empty if no password
TEST_DB_USER=$(whoami)
TEST_DB_PASSWORD=
```

### Step 2: Create Test Database

```bash
# This creates the test database and runs migrations
npm run test:setup
```

You should see:
```
📦 Creating test database: multi_agent_builder_test
✅ Test database created successfully
🚀 Running migrations on test database...
✅ Migrations completed successfully
✅ Test database is ready for integration tests!
```

### Step 3: Run Tests

```bash
# Run all integration tests
npm run test:integration
```

## All Test Commands

```bash
# Basic commands
npm test                      # Run all tests
npm run test:unit             # Run unit tests only
npm run test:integration      # Run integration tests only
npm run test:coverage         # Run with coverage report

# Development commands
npm test -- --watch           # Watch mode for TDD
npm test -- --ui              # Visual UI for tests
npm test -- -t "agent spawn"  # Run specific test

# Database commands
npm run test:setup            # Create test database
npm run test:teardown         # Drop test database
npm run test:reset            # Drop and recreate test database

# Debugging
LOG_LEVEL=debug npm test      # Verbose logging
npm test -- --reporter=verbose # Detailed test output
```

## Test Files

```
tests/
├── integration/
│   └── 01-single-agent.test.ts   # 48 tests for US1 (T043-T044)
├── unit/                          # Unit tests (future)
├── contract/                      # Contract tests (future)
├── e2e/                           # E2E tests (future)
└── setup/
    ├── test-env-setup.ts          # Environment configuration
    ├── test-db-setup.ts           # Database utilities
    └── vitest.setup.ts            # Vitest config
```

## Viewing Coverage

```bash
# Generate and view HTML coverage report
npm run test:coverage
open coverage/index.html
```

**Coverage Goals**: >80% for lines, branches, functions, statements

## Troubleshooting

### "role 'postgres' does not exist"
Your PostgreSQL user is different. Update `.env`:
```bash
DB_USER=$(whoami)
TEST_DB_USER=$(whoami)
```

### "database does not exist"
Create the test database:
```bash
npm run test:setup
```

### "connection refused"
PostgreSQL is not running. Start it:
```bash
# macOS (Homebrew)
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

### Tests are slow
Running integration tests with real database takes time. Use unit tests for faster feedback:
```bash
npm run test:unit -- --watch
```

### Need to reset everything
```bash
npm run test:reset
```

## What Tests Cover

### T043: Single Agent Spawn and Completion
- ✅ Agent spawning with role and task
- ✅ Budget allocation and tracking
- ✅ Agent status retrieval
- ✅ Agent completion lifecycle
- ✅ Child agent management
- ✅ Token usage tracking

### T044: Agent Status Transitions
- ✅ State machine transitions (pending → executing → completed)
- ✅ Terminal status behavior (completed, failed, terminated)
- ✅ Agent termination at any state
- ✅ Failure scenarios
- ✅ Database persistence of status changes
- ✅ Error handling for invalid states

**Total**: 48 comprehensive test cases

## Next Steps

1. **Run tests regularly** during development
2. **Add new tests** when adding features
3. **Keep coverage high** (>80%)
4. **Read the docs**:
   - `tests/integration/README.md` - Integration test details
   - `docs/TESTING.md` - Comprehensive testing guide
   - `docs/TEST-SUMMARY.md` - Coverage analysis

## Getting Help

**Common Resources**:
- Tests failing? Check `docs/TESTING.md` troubleshooting section
- Need to understand tests? Read `tests/integration/IMPLEMENTATION-NOTES.md`
- Want to add tests? Follow examples in `01-single-agent.test.ts`

**Quick Tips**:
- Use `it.only()` to run a single test
- Use `it.skip()` to skip a flaky test
- Use `--watch` mode for TDD workflow
- Check coverage report to find untested code

---

🚀 **You're ready to go!** Start with `npm run test:setup` then `npm run test:integration`
