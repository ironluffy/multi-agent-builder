#!/usr/bin/env node

/**
 * Database Connection Test Script
 *
 * This script tests the database connection and pool configuration.
 * Run this after setting up your .env file to verify database connectivity.
 *
 * Usage:
 *   ts-node src/database/test-connection.ts
 *   OR
 *   node dist/database/test-connection.js
 */

import { validateConnection, getPoolStats, closePool } from './db.js';

async function testConnection() {
  console.log('Testing database connection...\n');

  try {
    // Test 1: Validate connection
    console.log('Test 1: Validating database connection...');
    const isValid = await validateConnection();
    console.log(`✓ Connection validated: ${isValid}\n`);

    // Test 2: Get pool statistics
    console.log('Test 2: Checking pool statistics...');
    const stats = getPoolStats();
    console.log('Pool Statistics:');
    console.log(`  - Total clients: ${stats.totalCount}`);
    console.log(`  - Idle clients: ${stats.idleCount}`);
    console.log(`  - Waiting clients: ${stats.waitingCount}\n`);

    // Test 3: Execute a test query
    console.log('Test 3: Executing test query...');
    const { query } = await import('./db.js');
    const result = await query('SELECT version() as db_version');
    console.log(`✓ Database version: ${result.rows[0].db_version}\n`);

    console.log('✅ All tests passed! Database is ready.');
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    console.error('\nPlease check:');
    console.error('1. PostgreSQL is running');
    console.error('2. .env file is configured correctly');
    console.error('3. Database credentials are valid');
    console.error('4. Database exists and is accessible');
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run the test
testConnection();
