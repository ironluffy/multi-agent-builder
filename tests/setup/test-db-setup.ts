/**
 * Test Database Setup Script
 *
 * This script helps set up the test database for integration tests.
 * It should be run before executing integration tests.
 *
 * Usage:
 *   npx tsx tests/setup/test-db-setup.ts
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || '',
  database: 'postgres', // Connect to default database first
};

const TEST_DB_NAME = process.env.TEST_DB_NAME || 'multi_agent_builder_test';

async function setupTestDatabase(): Promise<void> {
  console.log('🔧 Setting up test database...');

  // Connect to PostgreSQL server (not specific database)
  const adminPool = new Pool(TEST_DB_CONFIG);

  try {
    // Check if test database exists
    const dbCheckResult = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME]
    );

    if (dbCheckResult.rows.length === 0) {
      // Create test database
      console.log(`📦 Creating test database: ${TEST_DB_NAME}`);
      await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
      console.log('✅ Test database created successfully');
    } else {
      console.log(`✓ Test database already exists: ${TEST_DB_NAME}`);
    }
  } catch (error) {
    console.error('❌ Failed to create test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }

  // Connect to the test database and run migrations
  const testPool = new Pool({
    ...TEST_DB_CONFIG,
    database: TEST_DB_NAME,
  });

  try {
    console.log('🚀 Running migrations on test database...');

    // Read and execute schema migrations
    const migrationsDir = join(__dirname, '../../migrations');

    // First migration: create schema_migrations table
    const schemaMigrationPath = join(migrationsDir, '20250122100000_create_schema_migrations.sql');
    const schemaMigrationSQL = readFileSync(schemaMigrationPath, 'utf8');

    // Extract UP section
    const upMatch = schemaMigrationSQL.match(/-- UP\s+([\s\S]*?)(?:-- DOWN|$)/);
    if (upMatch) {
      console.log('  → Running: 20250122100000_create_schema_migrations');
      await testPool.query(upMatch[1]);
    }

    // Second migration: create initial schema
    const initialSchemaPath = join(migrationsDir, '001_initial_schema.sql');
    const initialSchemaSQL = readFileSync(initialSchemaPath, 'utf8');

    // Extract UP section
    const initialUpMatch = initialSchemaSQL.match(/-- UP\s+([\s\S]*?)(?:-- DOWN|$)/);
    if (initialUpMatch) {
      console.log('  → Running: 001_initial_schema');
      await testPool.query(initialUpMatch[1]);
    }

    console.log('✅ Migrations completed successfully');

    // Verify tables were created
    const tablesResult = await testPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📋 Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\n✅ Test database is ready for integration tests!');
    console.log(`\n🔗 Connection string: postgresql://${TEST_DB_CONFIG.user}@${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_NAME}`);
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
    throw error;
  } finally {
    await testPool.end();
  }
}

async function teardownTestDatabase(): Promise<void> {
  console.log('🗑️  Dropping test database...');

  const adminPool = new Pool(TEST_DB_CONFIG);

  try {
    // Terminate all connections to the test database
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [TEST_DB_NAME]);

    // Drop the test database
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    console.log('✅ Test database dropped successfully');
  } catch (error) {
    console.error('❌ Failed to drop test database:', error);
    throw error;
  } finally {
    await adminPool.end();
  }
}

// Main execution
const command = process.argv[2] || 'setup';

(async () => {
  try {
    if (command === 'setup') {
      await setupTestDatabase();
    } else if (command === 'teardown') {
      await teardownTestDatabase();
    } else if (command === 'reset') {
      await teardownTestDatabase();
      await setupTestDatabase();
    } else {
      console.error('❌ Invalid command. Use: setup, teardown, or reset');
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
})();
