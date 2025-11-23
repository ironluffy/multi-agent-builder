#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { pool, query, transaction } from './db.js';

/**
 * Migration Runner
 *
 * Manages database schema migrations with UP and DOWN support
 * Tracks executed migrations in schema_migrations table
 *
 * Usage:
 * - Run migrations: node dist/database/migrate.js up
 * - Rollback last migration: node dist/database/migrate.js down
 * - Rollback N migrations: node dist/database/migrate.js down 3
 */

interface Migration {
  id: string;
  filename: string;
  timestamp: number;
  up: string;
  down: string;
}

// Migration tracking - ID and execution timestamp

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Initialize schema_migrations table
 */
async function initMigrationsTable(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      filename VARCHAR(255) NOT NULL
    );
  `;

  try {
    await query(createTableSQL);
    console.log(`Migrations table '${MIGRATIONS_TABLE}' initialized`);
  } catch (error) {
    console.error('Failed to initialize migrations table', error);
    throw error;
  }
}

/**
 * Load all migration files from the migrations directory
 *
 * Migration file format:
 * - Filename: YYYYMMDDHHMMSS_description.sql
 * - Content sections separated by: -- UP and -- DOWN
 *
 * @returns Array of migration objects sorted by timestamp
 */
export async function loadMigrations(): Promise<Migration[]> {
  // Ensure migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`Creating migrations directory: ${MIGRATIONS_DIR}`);
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort by filename (timestamp-based)

  const migrations: Migration[] = [];

  for (const filename of files) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');

    // Parse migration ID from filename (timestamp part)
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      console.warn(`Skipping invalid migration filename: ${filename}`);
      continue;
    }

    const id = match[1];
    const timestamp = parseInt(id, 10);

    // Split content into UP and DOWN sections
    const upMatch = content.match(/--\s*UP\s*\n([\s\S]*?)(?=--\s*DOWN|$)/i);
    const downMatch = content.match(/--\s*DOWN\s*\n([\s\S]*?)$/i);

    if (!upMatch) {
      console.warn(`Migration ${filename} missing UP section`);
      continue;
    }

    migrations.push({
      id,
      filename,
      timestamp,
      up: upMatch[1].trim(),
      down: downMatch ? downMatch[1].trim() : '',
    });
  }

  console.log(`Loaded ${migrations.length} migration(s)`);
  return migrations;
}

/**
 * Get list of executed migrations from database
 */
async function getExecutedMigrations(): Promise<Set<string>> {
  try {
    const result = await query(
      `SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY executed_at`
    );
    return new Set(result.rows.map((row: any) => row.id));
  } catch (error: unknown) {
    console.error('Failed to fetch executed migrations', error);
    throw error;
  }
}

// Migration recording handled inline in transactions

/**
 * Run pending migrations
 *
 * @param limit - Optional limit on number of migrations to run
 */
export async function runMigrations(limit?: number): Promise<void> {
  console.log('Starting migration process...');

  // Initialize migrations table
  await initMigrationsTable();

  // Load migrations and get executed ones
  const allMigrations = await loadMigrations();
  const executedMigrationIds = await getExecutedMigrations();

  // Filter pending migrations
  const pendingMigrations = allMigrations.filter(
    migration => !executedMigrationIds.has(migration.id)
  );

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations to run');
    return;
  }

  // Apply limit if specified
  const migrationsToRun = limit
    ? pendingMigrations.slice(0, limit)
    : pendingMigrations;

  console.log(`Found ${pendingMigrations.length} pending migration(s)`);
  console.log(`Running ${migrationsToRun.length} migration(s)...`);

  // Execute each migration in a transaction
  for (const migration of migrationsToRun) {
    console.log(`\nRunning migration: ${migration.filename}`);

    try {
      await transaction(async (client) => {
        // Execute UP migration
        await client.query(migration.up);

        // Record migration
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (id, filename) VALUES ($1, $2)`,
          [migration.id, migration.filename]
        );
      });

      console.log(`✓ Migration ${migration.filename} completed successfully`);
    } catch (error: unknown) {
      console.error(`✗ Migration ${migration.filename} failed:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration failed at ${migration.filename}: ${message}`);
    }
  }

  console.log(`\n✓ Successfully ran ${migrationsToRun.length} migration(s)`);
}

/**
 * Rollback migrations
 *
 * @param count - Number of migrations to rollback (default: 1)
 */
export async function rollbackMigrations(count: number = 1): Promise<void> {
  console.log(`Starting rollback of ${count} migration(s)...`);

  // Load migrations and get executed ones
  const allMigrations = await loadMigrations();
  const executedMigrationIds = await getExecutedMigrations();

  // Filter executed migrations and sort in reverse order
  const executedMigrations = allMigrations
    .filter(migration => executedMigrationIds.has(migration.id))
    .reverse()
    .slice(0, count);

  if (executedMigrations.length === 0) {
    console.log('No migrations to rollback');
    return;
  }

  console.log(`Rolling back ${executedMigrations.length} migration(s)...`);

  // Execute each rollback in a transaction
  for (const migration of executedMigrations) {
    console.log(`\nRolling back migration: ${migration.filename}`);

    if (!migration.down) {
      console.warn(`⚠ Migration ${migration.filename} has no DOWN section, skipping...`);
      continue;
    }

    try {
      await transaction(async (client) => {
        // Execute DOWN migration
        await client.query(migration.down);

        // Remove migration record
        await client.query(
          `DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`,
          [migration.id]
        );
      });

      console.log(`✓ Migration ${migration.filename} rolled back successfully`);
    } catch (error: unknown) {
      console.error(`✗ Rollback of ${migration.filename} failed:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Rollback failed at ${migration.filename}: ${message}`);
    }
  }

  console.log(`\n✓ Successfully rolled back ${executedMigrations.length} migration(s)`);
}

/**
 * Show migration status
 */
export async function showMigrationStatus(): Promise<void> {
  await initMigrationsTable();

  const allMigrations = await loadMigrations();
  const executedMigrationIds = await getExecutedMigrations();

  console.log('\nMigration Status:');
  console.log('=================\n');

  if (allMigrations.length === 0) {
    console.log('No migrations found');
    return;
  }

  for (const migration of allMigrations) {
    const status = executedMigrationIds.has(migration.id) ? '✓ Executed' : '○ Pending';
    console.log(`${status} - ${migration.filename}`);
  }

  const pendingCount = allMigrations.filter(m => !executedMigrationIds.has(m.id)).length;
  console.log(`\nTotal: ${allMigrations.length} | Executed: ${executedMigrationIds.size} | Pending: ${pendingCount}`);
}

/**
 * CLI interface
 */
async function cli() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'up':
        const upLimit = args[1] ? parseInt(args[1], 10) : undefined;
        await runMigrations(upLimit);
        break;

      case 'down':
        const downCount = args[1] ? parseInt(args[1], 10) : 1;
        await rollbackMigrations(downCount);
        break;

      case 'status':
        await showMigrationStatus();
        break;

      default:
        console.log('Usage:');
        console.log('  node dist/database/migrate.js up [limit]     - Run pending migrations');
        console.log('  node dist/database/migrate.js down [count]   - Rollback migrations');
        console.log('  node dist/database/migrate.js status         - Show migration status');
        process.exit(1);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run CLI if executed directly (ES module detection)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  cli();
}
