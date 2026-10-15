import { promises as fs } from 'node:fs';
import path from 'node:path';
import {serializeStructuredEvent,logOperation} from './structured-log';

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
      logOperation('error',`security_log_${reason}`,{count});
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
          logOperation('error','security_log_shutdown_timeout',{pending:queue.length+Number(running),bytes:queuedBytes});
          queue.length = 0;
          queuedBytes = activeBytes;
          finishClose = undefined;
          resolve(false);
        }, timeoutMs);
        finishClose = () => {
          clearTimeout(timer);
          finishClose = undefined;
          if (failed || dropped) {
            logOperation('error','security_log_incomplete_audit',{failed,dropped});
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
  return `${serializeStructuredEvent(event,details)}\n`;
}

const securityAuditLogger = createSecurityAuditLogger({
  filePath: path.join(process.cwd(), 'logs', 'security-audit.log'),
});

export const writeSecurityAuditEvent = securityAuditLogger.log;
export const closeSecurityAuditLog = securityAuditLogger.close;
