/**
 * Output formatter. Two modes:
 *   - pretty: ANSI color, human-readable. Default.
 *   - json: one JSON value per write to stdout, machine-readable.
 */

type OutputMode = 'pretty' | 'json';

let mode: OutputMode = 'pretty';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const isTTY = (): boolean => Boolean(process.stdout.isTTY);

function color(text: string, code: keyof typeof COLORS): string {
  if (!isTTY()) return text;
  return `${COLORS[code]}${text}${COLORS.reset}`;
}

export function setOutputMode(next: OutputMode): void {
  mode = next;
}

export function getOutputMode(): OutputMode {
  return mode;
}

export function printResult(label: string, value: unknown): void {
  if (mode === 'json') {
    process.stdout.write(JSON.stringify({ label, value }) + '\n');
    return;
  }
  process.stdout.write(color(`▸ ${label}`, 'cyan') + '\n');
  process.stdout.write(formatPretty(value) + '\n');
}

export function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (mode === 'json') {
    process.stderr.write(
      JSON.stringify({
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      }) + '\n'
    );
    return;
  }
  process.stderr.write(color(`✖ ${message}`, 'red') + '\n');
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    process.stderr.write(color(err.stack, 'gray') + '\n');
  }
}

export function printEvent(event: string, data: unknown): void {
  if (mode === 'json') {
    process.stdout.write(
      JSON.stringify({ event, ts: Date.now(), data }) + '\n'
    );
    return;
  }
  const ts = new Date().toISOString();
  process.stdout.write(
    `${color(ts, 'gray')} ${color(event, 'magenta')} ${formatPretty(data)}\n`
  );
}

export function printInfo(message: string): void {
  if (mode === 'json') return; // Don't pollute JSON streams with chatter.
  process.stdout.write(color(`ℹ ${message}`, 'blue') + '\n');
}

export function printSuccess(message: string): void {
  if (mode === 'json') return;
  process.stdout.write(color(`✓ ${message}`, 'green') + '\n');
}

function formatPretty(value: unknown): string {
  if (value === undefined) return color('(undefined)', 'gray');
  if (value === null) return color('null', 'gray');
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
