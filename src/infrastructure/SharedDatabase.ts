import { query, transaction, validateConnection, closePool, getPoolStats } from '../database/db.js';
import { logger } from '../utils/Logger.js';
import type { QueryResult, PoolClient, QueryResultRow } from 'pg';

/**
 * Shared Database Manager
 *
 * Centralized database access layer providing connection pooling,
 * monitoring, and graceful shutdown capabilities.
 *
 * Features:
 * - Singleton pattern with lazy initialization
 * - Wrapper around the existing db.ts pool
 * - Centralized access point for all repositories
 * - Monitoring and health check capabilities
 * - Graceful shutdown support
 *
 * @example
 * ```typescript
 * import { db } from './infrastructure/SharedDatabase.js';
 *
 * // Initialize on application startup
 * await db.initialize();
 *
 * // Use in repositories
 * const result = await db.query('SELECT * FROM agents WHERE id = $1', [agentId]);
 *
 * // Execute transactions
 * await db.transaction(async (client) => {
 *   await client.query('INSERT INTO agents (name) VALUES ($1)', ['agent-1']);
 *   await client.query('INSERT INTO tasks (agent_id) VALUES ($1)', [agentId]);
 * });
 *
 * // Health check
 * const isHealthy = await db.healthCheck();
 *
 * // Get pool statistics
 * const stats = db.getStats();
 *
 * // Shutdown on application exit
 * await db.shutdown();
 * ```
 */
export class SharedDatabase {
  private static instance: SharedDatabase;
  private isInitialized = false;

  private constructor() {}

  /**
   * Get the singleton instance
   *
   * @returns The SharedDatabase singleton instance
   *
   * @example
   * const db = SharedDatabase.getInstance();
   */
  public static getInstance(): SharedDatabase {
    if (!SharedDatabase.instance) {
      SharedDatabase.instance = new SharedDatabase();
    }
    return SharedDatabase.instance;
  }

  /**
   * Initialize the database connection
   *
   * Should be called once during application startup.
   * Validates the connection and sets the initialized flag.
   *
   * @throws Error if connection validation fails
   *
   * @example
   * await db.initialize();
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Database already initialized');
      return;
    }

    try {
      await validateConnection();
      logger.info('Database connection established');
      this.isInitialized = true;
    } catch (error) {
      logger.fatal(error, 'Failed to initialize database');
      throw error;
    }
  }

  /**
   * Execute a query
   *
   * Automatically handles connection pooling and logging.
   *
   * @template T - The type of rows returned by the query
   * @param text - SQL query string
   * @param params - Optional query parameters
   * @returns Query result
   * @throws Error if database is not initialized or query fails
   *
   * @example
   * const result = await db.query<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);
   * const agents = result.rows;
   */
  public async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    this.ensureInitialized();
    return query<T>(text, params);
  }

  /**
   * Execute a transaction
   *
   * Automatically handles BEGIN, COMMIT, and ROLLBACK.
   *
   * @template T - The return type of the transaction callback
   * @param callback - Function that performs queries using the client
   * @returns Result from the callback function
   * @throws Error if database is not initialized or transaction fails
   *
   * @example
   * const agentId = await db.transaction(async (client) => {
   *   const result = await client.query('INSERT INTO agents (name) VALUES ($1) RETURNING id', ['agent-1']);
   *   const agentId = result.rows[0].id;
   *   await client.query('INSERT INTO agent_metadata (agent_id, key, value) VALUES ($1, $2, $3)',
   *     [agentId, 'created_by', 'system']);
   *   return agentId;
   * });
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    this.ensureInitialized();
    return transaction(callback);
  }

  /**
   * Get pool statistics
   *
   * Returns current connection pool metrics.
   *
   * @returns Object containing pool statistics
   * - totalCount: Total number of clients in the pool
   * - idleCount: Number of idle clients
   * - waitingCount: Number of queued requests waiting for a client
   *
   * @example
   * const stats = db.getStats();
   * console.log(`Pool: ${stats.idleCount}/${stats.totalCount} idle, ${stats.waitingCount} waiting`);
   */
  public getStats() {
    return getPoolStats();
  }

  /**
   * Health check
   *
   * Validates database connectivity and logs pool statistics.
   * Useful for monitoring and readiness probes.
   *
   * @returns True if connection is healthy, false otherwise
   *
   * @example
   * app.get('/health', async (req, res) => {
   *   const isHealthy = await db.healthCheck();
   *   res.status(isHealthy ? 200 : 503).json({ database: isHealthy });
   * });
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await validateConnection();
      const stats = getPoolStats();
      logger.debug({ stats }, 'Database health check passed');
      return true;
    } catch (error) {
      logger.error(error, 'Database health check failed');
      return false;
    }
  }

  /**
   * Gracefully close all connections
   *
   * Should be called during application shutdown.
   * Waits for all active queries to complete before closing the pool.
   *
   * @example
   * process.on('SIGTERM', async () => {
   *   await db.shutdown();
   *   process.exit(0);
   * });
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down database connections...');
    await closePool();
    this.isInitialized = false;
    logger.info('Database shutdown complete');
  }

  /**
   * Check if database is initialized
   *
   * @returns True if initialized, false otherwise
   *
   * @example
   * if (db.isReady()) {
   *   await db.query('SELECT 1');
   * }
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure database is initialized before operations
   *
   * @throws Error if database is not initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance for convenient access
export const db = SharedDatabase.getInstance();
