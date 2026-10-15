import './support/test-env';
import http from 'node:http';
import { ApplicationHealth } from '../application-health';
import { createApp } from '../app';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
function health(
  database = jest.fn(async () => true),
  schemaValid = () => true,
  configValid = true,
  probeTimeoutMs = 30
) {
  return new ApplicationHealth({
    database,
    schemaValid,
    configValid,
    probeTimeoutMs,
    cacheMs: 0,
  });
}
it('requires boot, config and cached schema validity before probing the DB', async () => {
  const query = jest.fn(async () => true);
  let schema = false;
  const state = health(query, () => schema);
  expect(await state.ready()).toBe(false);
  expect(query).not.toHaveBeenCalled();
  state.completeBoot();
  expect(await state.ready()).toBe(false);
  schema = true;
  expect(await state.ready()).toBe(true);
  expect(query).toHaveBeenCalledTimes(1);
  const invalid = health(query, () => true, false);
  invalid.completeBoot();
  expect(await invalid.ready()).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
});
it('recovers from DB outage without restarting or changing liveness', async () => {
  const query = jest
    .fn()
    .mockRejectedValueOnce(Error('secret://database'))
    .mockResolvedValue(true);
  const state = health(query);
  state.completeBoot();
  expect(await state.ready()).toBe(false);
  expect(await state.ready()).toBe(true);
});
it('bounds hung probes and does not build a queue of abandoned queries', async () => {
  const pending = deferred<boolean>(),
    query = jest.fn(() => pending.promise),
    state = health(query);
  state.completeBoot();
  expect(
    await Promise.all(Array.from({ length: 30 }, () => state.ready()))
  ).toEqual(Array(30).fill(false));
  expect(await state.ready()).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
  pending.resolve(true);
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(await state.ready()).toBe(true);
  expect(query).toHaveBeenCalledTimes(2);
});
it('a late positive result cannot restore readiness after drain begins', async () => {
  const pending = deferred<boolean>(),
    state = health(jest.fn(() => pending.promise));
  state.completeBoot();
  const answer = state.ready();
  state.beginDrain();
  state.completeBoot();
  pending.resolve(true);
  expect(await answer).toBe(false);
  expect(await state.ready()).toBe(false);
  expect(state.draining).toBe(true);
});
it('serves secret-free no-store probes and rejects new work before parsing during drain', async () => {
  const query = jest.fn(async () => true),
    state = health(query),
    log: string[] = [],
    app = createApp({ writeRequestLog: x => log.push(x), health: state });
  const action = jest.fn((_req, res) => res.json({ accepted: true }));
  app.post('/api/test-initiation', action);
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const request = (path: string, body?: string) =>
    new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path,
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        res => {
          let value = '';
          res.on('data', x => (value += x));
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: value,
            })
          );
        }
      );
      req.on('error', reject);
      req.end(body);
    });
  try {
    const live = await request('/healthz');
    expect(live.status).toBe(200);
    expect(JSON.parse(live.body)).toEqual({ status: 'ok' });
    expect(live.headers['cache-control']).toContain('no-store');
    expect(live.headers['x-content-type-options']).toBe('nosniff');
    expect(query).not.toHaveBeenCalled();
    expect((await request('/readyz')).status).toBe(503);
    state.completeBoot();
    const ready = await request('/readyz');
    expect(ready.status).toBe(200);
    expect(JSON.parse(ready.body)).toEqual({ status: 'ready' });
    state.beginDrain();
    const refused = await request('/api/test-initiation', '{malformed');
    expect(refused.status).toBe(503);
    expect(action).not.toHaveBeenCalled();
    expect(refused.headers.connection).toBe('close');
    expect((await request('/healthz')).status).toBe(200);
    expect((await request('/readyz')).status).toBe(503);
    expect([live, ready, refused].map(r => r.body).join('')).not.toMatch(
      /database|migration|fingerprint|secret|host|token/i
    );
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }
});
