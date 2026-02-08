/**
 * Cron Utilities
 *
 * Helper functions for parsing and computing cron schedules.
 */

import type { CronSchedule } from './types';

/**
 * Simple cron expression parser
 *
 * Supports standard 5-field cron expressions:
 * minute hour day-of-month month day-of-week
 *
 * Special characters: * , - /
 *
 * Examples:
 * - "0 9 * * 1-5" - Weekdays at 9 AM
 * - "0 0 * * *" - Daily at midnight
 * - "* /15 * * * *" (without space) - Every 15 minutes
 */
export function parseField(field: string, min: number, max: number): number[] {
  const values: Set<number> = new Set();

  // Handle asterisk (all values)
  if (field === '*') {
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return Array.from(values).sort((a, b) => a - b);
  }

  // Split by comma for multiple values
  const parts = field.split(',');

  for (const part of parts) {
    // Handle step values (*/n or m-n/s)
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);

      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid step value: ${stepStr}`);
      }

      let start = min;
      let end = max;

      if (range !== '*') {
        if (range.includes('-')) {
          const [s, e] = range.split('-').map((v) => parseInt(v, 10));
          start = s;
          end = e;
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) {
          values.add(i);
        }
      }
    }
    // Handle range (m-n)
    else if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid range: ${part}`);
      }

      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) {
          values.add(i);
        }
      }
    }
    // Handle single value
    else {
      const value = parseInt(part, 10);
      if (isNaN(value)) {
        throw new Error(`Invalid value: ${part}`);
      }
      if (value >= min && value <= max) {
        values.add(value);
      }
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * Parse a cron expression into its component parts
 */
export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  // Track if original fields were wildcards (needed for standard cron day matching)
  dayOfMonthIsWildcard: boolean;
  dayOfWeekIsWildcard: boolean;
}

/**
 * Check if a field is a wildcard (matches all values)
 */
function isWildcard(field: string): boolean {
  // * or */1 are wildcards
  return field === '*' || field === '*/1';
}

/**
 * Parse a 5-field cron expression
 */
export function parseCronExpression(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    daysOfMonth: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    daysOfWeek: parseField(fields[4], 0, 6), // 0 = Sunday
    dayOfMonthIsWildcard: isWildcard(fields[2]),
    dayOfWeekIsWildcard: isWildcard(fields[4]),
  };
}

/**
 * Get the next run time for a cron expression
 *
 * @param expr - Cron expression
 * @param fromMs - Start time in ms (default: now)
 * @param _timezone - Timezone (currently not implemented, uses system timezone)
 * @returns Next run time in ms, or null if no next run
 *
 * Note: Timezone support is not yet implemented. All calculations use
 * the system's local timezone. For timezone-aware scheduling, consider
 * using a library like luxon or date-fns-tz.
 */
export function getNextCronTime(expr: string, fromMs: number = Date.now(), _timezone?: string): number | null {
  const parsed = parseCronExpression(expr);

  // Start from the next minute
  const date = new Date(fromMs);
  date.setSeconds(0);
  date.setMilliseconds(0);
  date.setMinutes(date.getMinutes() + 1);

  // Search for the next matching time (limit to 2 years)
  const maxIterations = 2 * 365 * 24 * 60; // ~2 years in minutes
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const month = date.getMonth() + 1; // 1-12
    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay(); // 0-6, 0 = Sunday
    const hour = date.getHours();
    const minute = date.getMinutes();

    // Check if month matches
    if (!parsed.months.includes(month)) {
      // Jump to next month
      date.setMonth(date.getMonth() + 1);
      date.setDate(1);
      date.setHours(0);
      date.setMinutes(0);
      continue;
    }

    // Check if day matches
    // Standard cron behavior:
    // - If both day-of-month and day-of-week are wildcards (*), match any day
    // - If both are specified (not *), use OR logic (match either)
    // - If only one is specified, use AND logic (must match the specified one)
    const dayOfMonthMatches = parsed.daysOfMonth.includes(dayOfMonth);
    const dayOfWeekMatches = parsed.daysOfWeek.includes(dayOfWeek);

    let dayMatches: boolean;
    if (parsed.dayOfMonthIsWildcard && parsed.dayOfWeekIsWildcard) {
      // Both are wildcards - any day matches
      dayMatches = true;
    } else if (!parsed.dayOfMonthIsWildcard && !parsed.dayOfWeekIsWildcard) {
      // Both are specified - use OR logic (standard cron behavior)
      dayMatches = dayOfMonthMatches || dayOfWeekMatches;
    } else if (parsed.dayOfMonthIsWildcard) {
      // Only day-of-week is specified - must match day-of-week
      dayMatches = dayOfWeekMatches;
    } else {
      // Only day-of-month is specified - must match day-of-month
      dayMatches = dayOfMonthMatches;
    }

    if (!dayMatches) {
      // Jump to next day
      date.setDate(date.getDate() + 1);
      date.setHours(0);
      date.setMinutes(0);
      continue;
    }

    // Check if hour matches
    if (!parsed.hours.includes(hour)) {
      // Find next matching hour
      const nextHour = parsed.hours.find((h) => h > hour);
      if (nextHour !== undefined) {
        date.setHours(nextHour);
        date.setMinutes(parsed.minutes[0]);
      } else {
        // Jump to next day
        date.setDate(date.getDate() + 1);
        date.setHours(parsed.hours[0]);
        date.setMinutes(parsed.minutes[0]);
      }
      continue;
    }

    // Check if minute matches
    if (!parsed.minutes.includes(minute)) {
      // Find next matching minute
      const nextMinute = parsed.minutes.find((m) => m > minute);
      if (nextMinute !== undefined) {
        date.setMinutes(nextMinute);
      } else {
        // Jump to next hour
        const nextHour = parsed.hours.find((h) => h > hour);
        if (nextHour !== undefined) {
          date.setHours(nextHour);
          date.setMinutes(parsed.minutes[0]);
        } else {
          // Jump to next day
          date.setDate(date.getDate() + 1);
          date.setHours(parsed.hours[0]);
          date.setMinutes(parsed.minutes[0]);
        }
      }
      continue;
    }

    // All fields match!
    return date.getTime();
  }

  // No match found within 2 years
  return null;
}

/**
 * Compute the next run time for a schedule
 *
 * @param schedule - Schedule configuration
 * @param fromMs - Start time in ms (default: now)
 * @returns Next run time in ms, or null if no next run
 */
export function computeNextRunTime(schedule: CronSchedule, fromMs: number = Date.now()): number | null {
  switch (schedule.kind) {
    case 'once':
      // One-time schedule: return if in the future
      if (schedule.runAtMs && schedule.runAtMs > fromMs) {
        return schedule.runAtMs;
      }
      return null;

    case 'interval':
      // Interval schedule: add interval to fromMs
      if (schedule.intervalMs && schedule.intervalMs > 0) {
        return fromMs + schedule.intervalMs;
      }
      return null;

    case 'cron':
      // Cron schedule: compute next matching time
      if (schedule.cronExpr) {
        return getNextCronTime(schedule.cronExpr, fromMs, schedule.timezone);
      }
      return null;

    default:
      return null;
  }
}

/**
 * Validate a cron expression
 *
 * @param expr - Cron expression to validate
 * @returns true if valid, throws Error if invalid
 */
export function validateCronExpression(expr: string): boolean {
  parseCronExpression(expr);
  return true;
}

/**
 * Format a cron expression in human-readable form
 *
 * @param expr - Cron expression
 * @returns Human-readable description
 */
export function describeCronExpression(expr: string): string {
  const parsed = parseCronExpression(expr);

  const parts: string[] = [];

  // Minutes
  if (parsed.minutes.length === 60) {
    parts.push('every minute');
  } else if (parsed.minutes.length === 1) {
    parts.push(`at minute ${parsed.minutes[0]}`);
  } else {
    parts.push(`at minutes ${parsed.minutes.join(', ')}`);
  }

  // Hours
  if (parsed.hours.length === 24) {
    parts.push('every hour');
  } else if (parsed.hours.length === 1) {
    parts.push(`at ${parsed.hours[0]}:00`);
  } else {
    parts.push(`at hours ${parsed.hours.join(', ')}`);
  }

  // Days
  if (parsed.daysOfMonth.length < 31) {
    parts.push(`on days ${parsed.daysOfMonth.join(', ')}`);
  }

  // Months
  if (parsed.months.length < 12) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    parts.push(`in ${parsed.months.map((m) => monthNames[m - 1]).join(', ')}`);
  }

  // Days of week
  if (parsed.daysOfWeek.length < 7) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    parts.push(`on ${parsed.daysOfWeek.map((d) => dayNames[d]).join(', ')}`);
  }

  return parts.join(', ');
}

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

/**
 * Get current time formatted for logging
 */
export function formatTimestamp(ms: number = Date.now()): string {
  return new Date(ms).toISOString();
}
