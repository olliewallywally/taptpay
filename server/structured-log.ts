import { createHash } from 'node:crypto';
import { getOperationContext, isOperationId } from './operation-context';
import {
  redactSensitive,
  isSafeLogCode,
  errorDataProperty,
} from './log-redaction';
export type LogLevel = 'info' | 'warn' | 'error';
const ENUMS = new Set([
  'approved',
  'declined',
  'pending',
  'unknown',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'abandoned',
  'ready',
  'not_ready',
  'error',
  'owner',
  'admin',
  'member',
  'enabled',
  'disabled',
]);
const CRON_JOBS = new Set([
  'subscriptionBilling',
  'generate',
  'tradesGenerate',
  'dispatch',
  'tradesDispatch',
  'overdue',
  'tradesOverdue',
  'reminders',
  'tradesReminders',
  'dailyPayoutNotifications',
  'uploadScans',
  'uploadRetention',
]);
/** Diagnostic SHA256 prefix (96 bits), never a credential or authorization key. */
export function logCorrelation(value: string | number) {
  return `h_${createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
function safeDetails(value: unknown, key = ''): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value)) return value.map(v => safeDetails(v));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, safeDetails(v, k)])
    );
  if (typeof value !== 'string') return '[REDACTED]';
  if (
    /^\[(?:REDACTED[^\]]*|CIRCULAR|TRUNCATED|OMITTED|UNSUPPORTED|INVALID_NUMBER|BIGINT|REDACTION_FAILED)\]$/.test(
      value
    )
  )
    return value;
  if ((key === 'requestId' || key === 'jobId') && isOperationId(value))
    return value.toLowerCase();
  if (
    key === 'method' &&
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|OTHER)$/.test(value)
  )
    return value;
  if (
    key === 'route' &&
    (value === '[unmatched]' || /^\/[A-Za-z0-9_/:.*()\-]{0,255}$/.test(value))
  )
    return value;
  if (key === 'code' && isSafeLogCode(value)) return value;
  if (key === 'job' && CRON_JOBS.has(value)) return value;
  if (key === 'email' && /^[^@\s]{0,2}\*\*\*@[^@\s]+$/.test(value))
    return value;
  if (['status', 'state', 'kind', 'role'].includes(key) && ENUMS.has(value))
    return value;
  if (key === 'correlation' && /^h_[0-9a-f]{24}$/.test(value)) return value;
  if (/(?:Id|Reference)$/.test(key)) return logCorrelation(value);
  return '[REDACTED]';
}
export function serializeStructuredEvent(
  event: string,
  details: Record<string, unknown> = {},
  level: LogLevel = 'info'
): string {
  const safe = safeDetails(redactSensitive(details)) as Record<string, unknown>;
  // Preserve a diagnostic join when raw session identifiers are redacted.
  // Descriptor-only reads avoid executing arbitrary SDK/caller accessors.
  const session = errorDataProperty(details, 'sessionId');
  if (
    typeof session === 'string' &&
    session.length > 0 &&
    session.length <= 512 &&
    !session.startsWith('[') &&
    !safe.correlation
  )
    safe.correlation = logCorrelation(session);
  const entry = {
    ...safe,
    ...getOperationContext(),
    timestamp: new Date().toISOString(),
    level,
    event: /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(event)
      ? event
      : 'invalid_event',
  };
  const line = JSON.stringify(entry);
  return Buffer.byteLength(line) <= 16 * 1024
    ? line
    : JSON.stringify({
        timestamp: entry.timestamp,
        level,
        event: entry.event,
        ...getOperationContext(),
        details: '[OMITTED_TOO_LARGE]',
      });
}
export function createStructuredLogger(
  write: (line: string, level: LogLevel) => void = (line, level) =>
    console[level === 'info' ? 'log' : level](line)
) {
  return (
    level: LogLevel,
    event: string,
    details: Record<string, unknown> = {}
  ) => {
    try {
      write(serializeStructuredEvent(event, details, level), level);
    } catch {
      /* Diagnostic sinks cannot break a money/request path. */
    }
  };
}
export const logOperation = createStructuredLogger();
