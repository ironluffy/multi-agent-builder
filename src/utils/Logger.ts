import pino from 'pino';
import type { Logger as PinoLogger, LoggerOptions } from 'pino';

/**
 * Structured logging utility using Pino
 * Provides centralized logging with support for child loggers and context
 */
class Logger {
  private static instance: Logger;
  private logger: PinoLogger;

  private constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const isDevelopment = process.env.NODE_ENV !== 'production';

    const options: LoggerOptions = {
      level: logLevel,
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      serializers: {
        error: pino.stdSerializers.err,
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
    };

    // Use pino-pretty transport in development for readable logs
    const pinoDefault = (pino as any).default || pino;
    if (isDevelopment) {
      this.logger = pinoDefault({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{msg}',
          },
        },
      });
    } else {
      this.logger = pinoDefault(options);
    }
  }

  /**
   * Get the singleton Logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Create a child logger with additional context
   * @param context - Context object to be included in all logs from this child logger
   * @returns A new child logger instance
   * @example
   * const serviceLogger = logger.child({ component: 'AgentService', agentId: '123' });
   * serviceLogger.info('Agent started'); // Logs will include component and agentId
   */
  public child(context: Record<string, unknown>): PinoLogger {
    return this.logger.child(context);
  }

  /**
   * Log a debug message
   * @param obj - Object to log or message string
   * @param msg - Optional message if first param is an object
   */
  public debug(obj: unknown, msg?: string): void {
    if (typeof obj === 'string') {
      this.logger.debug(obj);
    } else {
      this.logger.debug(obj, msg);
    }
  }

  /**
   * Log an info message
   * @param obj - Object to log or message string
   * @param msg - Optional message if first param is an object
   */
  public info(obj: unknown, msg?: string): void {
    if (typeof obj === 'string') {
      this.logger.info(obj);
    } else {
      this.logger.info(obj, msg);
    }
  }

  /**
   * Log a warning message
   * @param obj - Object to log or message string
   * @param msg - Optional message if first param is an object
   */
  public warn(obj: unknown, msg?: string): void {
    if (typeof obj === 'string') {
      this.logger.warn(obj);
    } else {
      this.logger.warn(obj, msg);
    }
  }

  /**
   * Log an error message
   * @param obj - Object to log or message string
   * @param msg - Optional message if first param is an object
   */
  public error(obj: unknown, msg?: string): void {
    if (typeof obj === 'string') {
      this.logger.error(obj);
    } else {
      this.logger.error(obj, msg);
    }
  }

  /**
   * Log a fatal message (critical errors that may cause application shutdown)
   * @param obj - Object to log or message string
   * @param msg - Optional message if first param is an object
   */
  public fatal(obj: unknown, msg?: string): void {
    if (typeof obj === 'string') {
      this.logger.fatal(obj);
    } else {
      this.logger.fatal(obj, msg);
    }
  }

  /**
   * Get the underlying Pino logger instance
   * @returns The Pino logger instance
   */
  public getPinoLogger(): PinoLogger {
    return this.logger;
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export Logger class for testing or advanced use cases
export { Logger };

// Export Pino types for consumers
export type { PinoLogger };
