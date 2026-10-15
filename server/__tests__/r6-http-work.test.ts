import './support/test-env';
import http from 'node:http';
import { createApp } from '../app';
import { ApplicationHealth } from '../application-health';
import { HttpWorkTracker } from '../http-work';
import { installAsyncRouteGuard } from '../async-route-guard';
import { RuntimeResources, installShutdownHandlers } from '../server-shutdown';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
it('drains an async handler after its client disconnected before closing pools', async () => {
  const health = new ApplicationHealth({
      database: async () => true,
      schemaValid: () => true,
      configValid: true,
    }),
    work = new HttpWorkTracker(),
    started = deferred(),
    released = deferred(),
    finished = deferred();
  const app = createApp({ writeRequestLog: () => {}, health, work });
  installAsyncRouteGuard(app);
  app.get('/accepted', async (_req, res) => {
    started.resolve();
    await released.promise;
    finished.resolve();
    if (!res.destroyed) res.end();
  });
  health.completeBoot();
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const resources = new RuntimeResources(),
    closed = jest.fn();
  resources.add({
    stop: () => work.stop(),
    drain: () => work.drain(),
    close: async () => {
      closed();
    },
  });
  let code: number | undefined;
  const shutdown = installShutdownHandlers(server, {
    health,
    resources,
    exit: value => {
      code = value;
    },
    audit: async () => true,
  });
  const request = http.get({
    host: '127.0.0.1',
    port: (server.address() as { port: number }).port,
    path: '/accepted',
  });
  request.on('error', () => {});
  try {
    await started.promise;
    const disconnected = new Promise<void>(r => request.once('close', r));
    request.destroy();
    await disconnected;
    const drain = shutdown.begin('SIGTERM');
    await new Promise<void>(r => setTimeout(r, 15));
    expect(closed).not.toHaveBeenCalled();
    released.resolve();
    await finished.promise;
    await drain;
    expect(closed).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  } finally {
    released.resolve();
    shutdown.dispose();
    server.closeAllConnections();
    server.close();
  }
});
it('a callback completing after disconnect cannot dispatch a new handler during drain', async () => {
  const work = new HttpWorkTracker(),
    started = deferred(),serverDisconnected=deferred();
  let nextLater!: () => void;
  const app = createApp({ writeRequestLog: () => {}, work });
  installAsyncRouteGuard(app);
  const effect = jest.fn((_req, res) => res.end('effect'));
  app.post(
    '/late',
    (_req, res, next) => {
      res.once('close',serverDisconnected.resolve);
      nextLater = next;
      started.resolve();
    },
    effect
  );
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const request = http.request({
    host: '127.0.0.1',
    port: (server.address() as { port: number }).port,
    path: '/late',
    method: 'POST',
  });
  request.on('error', () => {});
  request.end();
  try {
    await started.promise;
    const disconnected = new Promise<void>(r => request.once('close', r));
    request.destroy();
    await disconnected;
    await serverDisconnected.promise;
    work.stop();
    nextLater();
    await work.drain();
    expect(effect).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  }
});
