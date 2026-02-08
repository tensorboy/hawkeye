/**
 * Simple Logger Utility
 *
 * Provides scoped logging with different log levels.
 * Inspired by loguru but simplified for the Hawkeye project.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Current log level (can be changed at runtime)
 */
let currentLogLevel: LogLevel = 'info';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Check if a log level is enabled
 */
function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLogLevel];
}

/**
 * Format timestamp
 */
function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/**
 * Create a scoped logger
 */
function createScopedLogger(scope: string): Logger {
  return {
    debug(...args: unknown[]): void {
      if (isLevelEnabled('debug')) {
        console.debug(`[${formatTimestamp()}] [${scope}]`, ...args);
      }
    },
    info(...args: unknown[]): void {
      if (isLevelEnabled('info')) {
        console.info(`[${formatTimestamp()}] [${scope}]`, ...args);
      }
    },
    warn(...args: unknown[]): void {
      if (isLevelEnabled('warn')) {
        console.warn(`[${formatTimestamp()}] [${scope}]`, ...args);
      }
    },
    error(...args: unknown[]): void {
      if (isLevelEnabled('error')) {
        console.error(`[${formatTimestamp()}] [${scope}]`, ...args);
      }
    },
  };
}

/**
 * Loguru-compatible logger factory
 *
 * Usage:
 * ```typescript
 * import { loguru } from '../debug';
 * const logger = loguru.scope('MyModule');
 * logger.info('Hello world');
 * ```
 */
export const loguru = {
  scope: createScopedLogger,
};

export default loguru;
