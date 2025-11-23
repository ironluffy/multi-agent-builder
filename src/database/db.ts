import { Pool, PoolConfig, QueryResult, PoolClient, QueryResultRow } from 'pg';

/**
 * PostgreSQL Connection Pool Configuration
 *
 * Environment Variables Required:
 * - DB_HOST: Database host
 * - DB_PORT: Database port (default: 5432)
 * - DB_NAME: Database name
 * - DB_USER: Database user
 * - DB_PASSWORD: Database password
 * - DB_SSL: Enable SSL (default: false)
 */

// Pool configuration from environment variables
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'multi_agent_builder',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

// Create the connection pool
export const pool = new Pool(poolConfig);

// Pool event handlers for monitoring
pool.on('connect', () => {
  console.log('New client connected to the database pool');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('remove', () => {
  console.log('Client removed from pool');
});

/**
 * Execute a query with automatic connection handling
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns Query result
 *
 * @example
 * const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error: unknown) {
    console.error('Query error', { text, error });
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 *
 * @param callback - Function that performs queries using the client
 * @returns Result from the callback function
 *
 * @example
 * await transaction(async (client) => {
 *   await client.query('INSERT INTO users (name) VALUES ($1)', ['John']);
 *   await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
 * });
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    console.log('Transaction committed successfully');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction rolled back due to error', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate database connection
 *
 * @returns True if connection is successful
 * @throws Error if connection fails
 */
export async function validateConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connection validated', { time: result.rows[0].current_time });
    return true;
  } catch (error: unknown) {
    console.error('Database connection validation failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to connect to database: ${message}`);
  }
}

/**
 * Get pool statistics
 *
 * @returns Pool statistics
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Close the database pool
 * Call this when shutting down the application
 */
export async function closePool(): Promise<void> {
  console.log('Closing database pool...');
  await pool.end();
  console.log('Database pool closed');
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

// Export pool for advanced usage
export default pool;
