import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { logOperation } from './structured-log';
import { closeSecurityAuditLog } from './security-audit-log';

interface Resource {
  stop?(): void;
  drain?(): Promise<unknown>;
  close?(): Promise<unknown>;
}
export class RuntimeResources {
  private resources: Resource[] = [];
  private stopped = false;
  private stopFailed = false;
  add(resource: Resource) {
    this.resources.push(resource);
    if (this.stopped) this.stopOne(resource);
  }
  private stopOne(resource: Resource) {
    try {
      resource.stop?.();
    } catch {
      this.stopFailed = true;
      logOperation('error', 'shutdown_stop_failed');
    }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const resource of this.resources) this.stopOne(resource);
  }
  async drain() {
    await Promise.all(this.resources.map(r => r.drain?.()));
    if (this.stopFailed) throw Error('shutdown_stop_failed');
  }
  async close() {
    await Promise.all(this.resources.map(r => r.close?.()));
  }
}
export interface ShutdownOptions {
  health?: { beginDrain(): void };
  resources?: RuntimeResources;
  production?: boolean;
  exit?: (code: number) => void;
  audit?: (timeoutMs: number) => Promise<boolean>;
  drainMs?: number;
  closeMs?: number;
  auditMs?: number;
  hardMs?: number;
}
async function within(work: Promise<unknown>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then(
        () => true,
        () => false
      ),
      new Promise<false>(resolve => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Installs before asynchronous bootstrap; only this process's sockets are closed. */
export function installShutdownHandlers(
  server: Server,
  options: ShutdownOptions = {}
) {
  const resources = options.resources ?? new RuntimeResources(),
    sockets = new Set<Socket>();
  const exit = options.exit ?? (code => process.exit(code)),
    audit = options.audit ?? closeSecurityAuditLog;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  server.on('connection', track);
  let running: Promise<void> | undefined,
    fatal = false,
    finished = false,
    stopping = false;
  const activeRequests = new Map<Socket, number>();
  const trackRequest = (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse
  ) => {
    const socket = req.socket;
    activeRequests.set(socket, (activeRequests.get(socket) ?? 0) + 1);
    let complete = false;
    const done = () => {
      if (complete) return;
      complete = true;
      const count = (activeRequests.get(socket) ?? 1) - 1;
      if (count > 0) activeRequests.set(socket, count);
      else {
        activeRequests.delete(socket);
        if (stopping) socket.end();
      }
    };
    res.once('finish', done);
    res.once('close', done);
  };
  server.on('request', trackRequest);
  const destroy = () => {
    for (const socket of sockets) socket.destroy();
  };
  const begin = (reason: string) => {
    if (reason === 'UNCAUGHT_EXCEPTION' || reason === 'STARTUP_FAILURE')
      fatal = true;
    if (running) return running;
    stopping = true;
    options.health?.beginDrain();
    resources.stop();
    logOperation('info', 'server_draining');
    const hard = setTimeout(() => {
      if (finished) return;
      destroy();
      logOperation('error', 'shutdown_deadline_exceeded');
      exit(1);
    }, options.hardMs ?? 10000);
    running = (async () => {
      let ok = false;
      try {
        const httpClosed = new Promise<void>((resolve, reject) =>
          server.close(error => {
            if (
              !error ||
              (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING'
            )
              resolve();
            else reject(error);
          })
        );
        server.closeIdleConnections?.();
        const drained = await within(
          Promise.all([httpClosed, resources.drain()]),
          options.drainMs ?? 7000
        );
        if (!drained) {
          destroy();
          logOperation('error', 'shutdown_drain_incomplete');
        }
        // An active worker may still need its DB connection. On timeout retain
        // its durable claim/hold and let process exit expire it; do not race it
        // with normal pool closure or pretend the external request was cancelled.
        const closed =
          drained && (await within(resources.close(), options.closeMs ?? 1000));
        if (drained && !closed)
          logOperation('error', 'shutdown_resource_close_incomplete');
        const flushed = await within(
          Promise.resolve()
            .then(() => audit(options.auditMs ?? 1500))
            .then(result => {
              if (!result) throw Error('audit_incomplete');
            }),
          options.auditMs ?? 1500
        );
        ok = drained && closed && flushed && !fatal;
      } catch {
        destroy();
        logOperation('error', 'shutdown_failed');
      } finally {
        finished = true;
        clearTimeout(hard);
        logOperation(
          ok ? 'info' : 'error',
          ok ? 'server_shutdown_complete' : 'server_shutdown_incomplete'
        );
        exit(ok ? 0 : 1);
      }
    })();
    return running;
  };
  const term = () => {
      void begin('SIGTERM');
    },
    interrupt = () => {
      void begin('SIGINT');
    };
  const exception = () => {
    logOperation('error', 'uncaught_exception');
    if (options.production) void begin('UNCAUGHT_EXCEPTION');
  };
  const rejection = () => {
    logOperation('error', 'unhandled_rejection');
  };
  process.on('SIGTERM', term);
  process.on('SIGINT', interrupt);
  process.on('uncaughtException', exception);
  process.on('unhandledRejection', rejection);
  return {
    begin,
    dispose() {
      server.removeListener('connection', track);
      server.removeListener('request', trackRequest);
      process.removeListener('SIGTERM', term);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('uncaughtException', exception);
      process.removeListener('unhandledRejection', rejection);
    },
  };
}
