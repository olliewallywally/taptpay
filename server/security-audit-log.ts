import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_EVENT_BYTES = 16 * 1024;
const MAX_QUEUED_BYTES = 1024 * 1024;
const MAX_QUEUED_EVENTS = 1024;

interface AuditLoggerOptions {
  filePath: string;
  maxQueuedBytes?: number;
  maxQueuedEvents?: number;
  /** Injectable sink for checking slow/failing disks without a real disk outage. */
  writeLine?: (line: string) => Promise<void>;
}

// This is a diagnostic audit log, not a durable transaction ledger. A failed or
// overloaded sink must not take down authentication or grow memory unboundedly.
// Diagnostics contain counts only: event details and filesystem errors may hold
// personal information or credentials and must not be copied to stderr.
export function createSecurityAuditLogger(options: AuditLoggerOptions) {
  const maxQueuedBytes = options.maxQueuedBytes ?? MAX_QUEUED_BYTES;
  const maxQueuedEvents = options.maxQueuedEvents ?? MAX_QUEUED_EVENTS;
  const queue: string[] = [];
  let queuedBytes = 0; // Includes the single in-flight append.
  let activeBytes = 0;
  let running = false;
  let closed = false;
  let directoryReady = false;
  let dropped = 0;
  let failed = 0;
  let closePromise: Promise<boolean> | undefined;
  let finishClose: (() => void) | undefined;

  const report = (reason: string, count: number) => {
    // First failure and powers of two make persistent failures visible without
    // replacing a disk backlog with one console write per request.
    if (count === 1 || Number.isInteger(Math.log2(count))) {
      console.error(`[SECURITY_LOG_ERROR] reason=${reason} count=${count}`);
    }
  };

  const writeLine = options.writeLine ?? (async (line: string) => {
    if (!directoryReady) {
      await fs.mkdir(path.dirname(options.filePath), { recursive: true });
      directoryReady = true;
    }
    await fs.appendFile(options.filePath, line, { encoding: 'utf8', mode: 0o600 });
  });

  const drain = async () => {
    running = true;
    while (queue.length > 0) {
      const line = queue.shift()!;
      activeBytes = Buffer.byteLength(line);
      try {
        await writeLine(line);
      } catch {
        directoryReady = false;
        report('write_failed', ++failed);
      } finally {
        queuedBytes -= activeBytes;
        activeBytes = 0;
      }
    }
    running = false;
    finishClose?.();
  };

  return {
    log(event: string, details: Record<string, unknown>): void {
      if (closed) {
        report('logger_closed', ++dropped);
        return;
      }
      let line: string;
      try {
        line = serializeEvent(event, details);
      } catch {
        report('invalid_event', ++dropped);
        return;
      }
      const bytes = Buffer.byteLength(line);
      if (queuedBytes + bytes > maxQueuedBytes || queue.length + Number(running) >= maxQueuedEvents) {
        // Drop the newest event; never evict already accepted events. The
        // aggregate diagnostic explicitly signals incomplete audit coverage.
        report('queue_full', ++dropped);
        return;
      }
      queue.push(line);
      queuedBytes += bytes;
      if (!running) void drain();
    },

    /** Stop accepting events and await pending appends, with a finite deadline. */
    close(timeoutMs = 2000): Promise<boolean> {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          console.error(`[SECURITY_LOG_ERROR] reason=shutdown_timeout pending=${queue.length + Number(running)} bytes=${queuedBytes}`);
          queue.length = 0;
          queuedBytes = activeBytes;
          finishClose = undefined;
          resolve(false);
        }, timeoutMs);
        finishClose = () => {
          clearTimeout(timer);
          finishClose = undefined;
          if (failed || dropped) {
            console.error(`[SECURITY_LOG_ERROR] reason=incomplete_audit failed=${failed} dropped=${dropped}`);
          }
          resolve(failed === 0 && dropped === 0);
        };
        if (!running) finishClose();
      });
      return closePromise;
    },
  };
}

function serializeEvent(event: string, details: Record<string, unknown>): string {
  let remainingFields = 128;
  const seen = new WeakSet<object>();
  const sanitize = (value: unknown, key: string, depth: number): unknown => {
    if (/password|secret|token|authorization|cookie|api.?key/i.test(key)) return '[REDACTED]';
    if (/email/i.test(key)) {
      if (typeof value !== 'string') return '[REDACTED]';
      const at = value.indexOf('@');
      return at > 0
        ? `${at > 2 ? value.slice(0, 2) : ''}***${value.slice(at, at + 255)}`
        : '[REDACTED]';
    }
    if (typeof value === 'string') return value.slice(0, 1024);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR]';
    if (depth >= 4 || remainingFields <= 0) return '[TRUNCATED]';
    seen.add(value);
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
    for (const key of Object.keys(value).slice(0, 32)) {
      if (remainingFields-- <= 0) break;
      (result as Record<string, unknown>)[key] = sanitize((value as Record<string, unknown>)[key], key, depth + 1);
    }
    return result;
  };
  const timestamp = new Date().toISOString();
  const safeEvent = typeof event === 'string' ? event.slice(0, 128) : '[INVALID_EVENT]';
  // Preserve the existing flat record shape, but details cannot replace the
  // event name or timestamp. Redaction covers field names, not arbitrary prose.
  const entry = { ...sanitize(details, '', 0) as object, timestamp, event: safeEvent };
  const line = `${JSON.stringify(entry)}\n`;
  return Buffer.byteLength(line) <= MAX_EVENT_BYTES ? line : `${JSON.stringify({
    timestamp, event: safeEvent, details: '[OMITTED_TOO_LARGE]',
  })}\n`;
}

const securityAuditLogger = createSecurityAuditLogger({
  filePath: path.join(process.cwd(), 'logs', 'security-audit.log'),
});

export const writeSecurityAuditEvent = securityAuditLogger.log;
export const closeSecurityAuditLog = securityAuditLogger.close;
