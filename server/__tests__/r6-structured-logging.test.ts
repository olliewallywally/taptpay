import './support/test-env';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequestLogger, redactSensitive } from '../request-log';
import {
  getOperationContext,
  runWithOperationContext,
} from '../operation-context';
import {
  createStructuredLogger,
  serializeStructuredEvent,
} from '../structured-log';
import { createGlobalErrorHandler } from '../http-error-handler';
import { startPaymentReconciliationLoop } from '../payment-runtime';
let server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r, j) => server!.close(e => (e ? j(e) : r())));
    server = undefined;
  }
});
async function serve(app: express.Express) {
  server = createServer(app);
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}

test('safe inbound request ID survives awaits and response; invalid values become fresh UUIDs', async () => {
  const logs: string[] = [],
    app = express();
  app.use(createRequestLogger(line => logs.push(line)));
  app.get('/api/work/:id', async (_req, res) => {
    await Promise.resolve();
    res.json(getOperationContext());
  });
  const origin = await serve(app),
    id = randomUUID();
  const res = await fetch(
    `${origin}/api/work/secret-route-value?code=private-oauth-code`,
    { headers: { 'X-Request-Id': id } }
  );
  expect(res.headers.get('x-request-id')).toBe(id);
  expect((await res.json()).requestId).toBe(id);
  const entry = JSON.parse(logs[0]);
  expect(entry).toMatchObject({
    event: 'http_request',
    requestId: id,
    method: 'GET',
    route: '/api/work/:id',
    status: 200,
  });
  expect(logs[0]).not.toMatch(/secret-route-value|private-oauth-code/);
  const bad = await fetch(`${origin}/api/work/another`, {
    headers: { 'X-Request-Id': 'Bearer-sensitive-input' },
  });
  expect(bad.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(bad.headers.get('x-request-id')).not.toBe(id);
  expect(JSON.stringify(logs)).not.toContain('Bearer-sensitive-input');
});
test('overlapping requests and nested jobs keep their own async context', async () => {
  const lines: string[] = [],
    write = createStructuredLogger(line => lines.push(line)),
    app = express();
  let arrived = 0,
    release!: () => void;
  const barrier = new Promise<void>(r => (release = r));
  app.use(createRequestLogger(() => {}));
  app.get('/api/work', async (_req, res) => {
    const before = getOperationContext().requestId;
    if (++arrived === 2) release();
    await barrier;
    const jobId = randomUUID();
    await runWithOperationContext({ jobId }, async () => {
      await Promise.resolve();
      write('info', 'job_finished', { count: 1 });
      expect(getOperationContext().requestId).toBe(before);
    });
    expect(getOperationContext().jobId).toBeUndefined();
    res.json({ requestId: getOperationContext().requestId });
  });
  const origin = await serve(app),
    ids = [randomUUID(), randomUUID()];
  const responses = await Promise.all(
    ids.map(requestId =>
      fetch(`${origin}/api/work`, { headers: { 'X-Request-Id': requestId } })
    )
  );
  expect(await Promise.all(responses.map(r => r.json()))).toEqual(
    ids.map(requestId => ({ requestId }))
  );
  expect(new Set(lines.map(s => JSON.parse(s).requestId))).toEqual(
    new Set(ids)
  );
  expect(getOperationContext()).toEqual({});
});
test('unmatched paths and malformed JSON errors have correlation without URL or body leakage', async () => {
  const lines: string[] = [],
    app = express();
  app.use(createRequestLogger(s => lines.push(s)));
  app.use(express.json());
  app.use(createGlobalErrorHandler(() => {}));
  const origin = await serve(app);
  const unknown = await fetch(
    `${origin}/api/not-a-route/private-token?authorization=private-query`
  );
  expect(unknown.status).toBe(404);
  const bad = await fetch(`${origin}/api/bad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"token":"private-body",',
  });
  expect(bad.status).toBe(400);
  expect(bad.headers.get('x-request-id')).toBeTruthy();
  expect(JSON.stringify(await bad.json())).not.toContain('private-body');
  expect(lines.map(s => JSON.parse(s).route)).toEqual([
    '[unmatched]',
    '[unmatched]',
  ]);
  expect(lines.join('')).not.toMatch(
    /private-token|private-query|private-body/
  );
});
test('central structured output suppresses nested secrets, arbitrary prose, buffers, errors and getter causes', () => {
  const getter = jest.fn(() => {
    throw Error('private-getter');
  });
  const details: any = {
    count: 3,
    authorization: 'private-auth',
    nested: [
      {
        cardId: 'private-card',
        bankName: 'private-bank',
        oauthCode: 'private-code',
        tokenHash: 'private-hash',
        rawBody: 'private-body',
      },
    ],
    message: 'private-prose',
    error: Object.assign(new Error('private-error'), {
      cause: new Error('private-cause'),
    }),
    data: Buffer.from('private-bytes'),
  };
  Object.defineProperty(details, 'getter', { enumerable: true, get: getter });
  details.self = details;
  const line = serializeStructuredEvent('worker_failed', details, 'error');
  expect(() => JSON.parse(line)).not.toThrow();
  expect(line).not.toContain('private-');
  expect(getter).not.toHaveBeenCalled();
  expect(line.length).toBeLessThan(16000);
  expect(JSON.parse(line).count).toBe(3);
});
test('bounded redaction preserves compatible URL templates and never invokes toJSON', () => {
  const payload: any = {
    url: '/api/pay/t/private-token?token=private-query',
    notificationBody: { any: 'private-body' },
    headers: { cookie: 'private-cookie' },
    error: new Error('private-error'),
    big: Array.from({ length: 10000 }, () => ({ password: 'private-secret' })),
    toJSON: () => {
      throw Error('should not execute');
    },
  };
  payload.self = payload;
  const redacted: any = redactSensitive(payload);
  expect(redacted.url).toBe('/api/pay/t/:token?token=[REDACTED]');
  expect(JSON.stringify(redacted)).not.toMatch(
    /private-(token|query|body|cookie|error|secret)/
  );
  expect(JSON.stringify(redacted).length).toBeLessThan(16000);
});
test('global 5xx logs and responses discard upstream message, stack, cause and headers', async () => {
  const logged: any[] = [],
    app = express();
  app.use(createRequestLogger(() => {}));
  app.get('/api/fail', () => {
    throw Object.assign(new Error('private-provider-message'), {
      cause: { token: 'private-cause-token' },
      headers: { authorization: 'private-auth' },
    });
  });
  app.use(createGlobalErrorHandler((...args) => logged.push(args)));
  const origin = await serve(app);
  const res = await fetch(`${origin}/api/fail`);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ message: 'Internal Server Error' });
  expect(JSON.stringify(logged)).not.toContain('private-');
  expect(res.headers.get('x-request-id')).toBeTruthy();
});

test('actual outbox worker propagates parent request context and a server job ID to its receiver', async () => {
  const { PaymentOutboxWorker } = await import('../payment-outbox');
  const contexts: any[] = [];
  const worker = new PaymentOutboxWorker(
    {
      claimOutbox: async owner => ({
        id: randomUUID(),
        eventId: randomUUID(),
        channel: 'payer_receipt',
        owner,
        attemptCount: 1,
        leaseExpiresAt: new Date(Date.now() + 10000),
      }),
      finishOutbox: async () => true,
    },
    {
      deliver: async () => {
        await Promise.resolve();
        contexts.push(getOperationContext());
      },
    }
  );
  const requestId = randomUUID();
  expect(
    await runWithOperationContext({ requestId }, () =>
      worker.runOne(randomUUID())
    )
  ).toBe(true);
  expect(contexts[0].requestId).toBe(requestId);
  expect(contexts[0].jobId).toMatch(/^[0-9a-f-]{36}$/);
  expect(getOperationContext()).toEqual({});
});

test('untrusted error codes cannot smuggle a credential through a format-only allowlist', () => {
  const line = serializeStructuredEvent(
    'upstream_failed',
    { code: 'E_PRIVATE_SECRET_VALUE' },
    'error'
  );
  expect(line).not.toContain('E_PRIVATE_SECRET_VALUE');
});

test('hostile error getters and a failing diagnostic sink cannot change the sanitized 500 response', async () => {
  const app = express();
  app.use(createRequestLogger(() => {}));
  app.get('/api/fail', () => {
    const error = new Error('private-upstream');
    Object.defineProperty(error, 'status', {
      get: () => {
        throw Error('private-status-getter');
      },
    });
    throw error;
  });
  app.use(
    createGlobalErrorHandler(() => {
      throw Error('private-log-sink');
    })
  );
  const origin = await serve(app);
  const res = await fetch(`${origin}/api/fail`);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ message: 'Internal Server Error' });
});

test('audit session joins remain possible through a diagnostic hash without logging the raw session ID', () => {
  const raw = 'private-session-id';
  const line = serializeStructuredEvent('session_revoked', { sessionId: raw });
  const record = JSON.parse(line);
  expect(line).not.toContain(raw);
  expect(record.correlation).toMatch(/^h_[0-9a-f]{24}$/);
  expect(record.sessionId).toBe('[REDACTED]');
});
test('worker-loop failure diagnostics have job context and stopping the loop prevents another invocation', async () => {
  jest.useFakeTimers();
  const logged = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const runOne = jest.fn(async () => {
    throw Error('private-worker-fault');
  });
  const stop = startPaymentReconciliationLoop(
    { worker: { runOne } } as any,
    10
  );
  try {
    await jest.advanceTimersByTimeAsync(10);
    expect(runOne).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0]?.[0],
      entry = JSON.parse(line);
    expect(entry.event).toBe('PAYMENT_RECONCILIATION_UNAVAILABLE');
    expect(entry.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line).not.toContain('private-worker-fault');
    expect(getOperationContext()).toEqual({});
    stop();
    await jest.advanceTimersByTimeAsync(30);
    expect(runOne).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    logged.mockRestore();
    jest.useRealTimers();
  }
});
