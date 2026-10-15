import './support/test-env';
import { startDrainingLoop } from '../draining-loop';
import { SseBroker } from '../sse-broker';
import { CronCoordinator } from '../durable-cron';
import { MemoryCronRepository } from './support/memory-cron';
import { startPaymentReconciliationLoop } from '../payment-runtime';
import { startSubscriptionPaymentLoop } from '../subscription-payment-runtime';
import { startPaymentDeliveryLoop } from '../payment-delivery-runtime';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => jest.useRealTimers());
it('the real payment loop finishes the claimed item without claiming the next', async () => {
  jest.useFakeTimers();
  const pending = deferred(),
    runOne = jest.fn(async () => {
      await pending.promise;
      return true;
    });
  const stop = startPaymentReconciliationLoop(
    { worker: { runOne } } as any,
    10
  );
  await jest.advanceTimersByTimeAsync(10);
  stop();
  pending.resolve();
  await stop.drain();
  await jest.advanceTimersByTimeAsync(100);
  expect(runOne).toHaveBeenCalledTimes(1);
});
it('the subscription loop stops between activation recovery and billing recovery', async () => {
  jest.useFakeTimers();
  const pending = deferred(),
    recoverActivations = jest.fn(
      async (_limit: number, _canContinue: () => boolean) => {
        await pending.promise;
        return 1;
      }
    ),
    reconcileDue = jest.fn();
  const stop = startSubscriptionPaymentLoop(
    { card: { recoverActivations }, billing: { reconcileDue } } as any,
    10
  );
  await jest.advanceTimersByTimeAsync(10);
  stop();
  expect(recoverActivations.mock.calls[0][1]()).toBe(false);
  pending.resolve();
  await stop.drain();
  expect(reconcileDue).not.toHaveBeenCalled();
});
it('delivery drain tracks both the durable worker and the realtime observer', async () => {
  jest.useFakeTimers();
  const work = deferred(),
    feed = deferred(),
    runOne = jest.fn(async () => {
      await work.promise;
      return true;
    }),
    realtime = jest.fn(async () => {
      await feed.promise;
    });
  const stop = startPaymentDeliveryLoop(
    { worker: { runOne }, receiver: { realtime } } as any,
    10
  );
  await jest.advanceTimersByTimeAsync(10);
  stop();
  let done = false;
  const drain = stop.drain().then(() => {
    done = true;
  });
  work.resolve();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  feed.resolve();
  await drain;
  await jest.advanceTimersByTimeAsync(100);
  expect(runOne).toHaveBeenCalledTimes(1);
  expect(realtime).toHaveBeenCalledTimes(1);
});
it('stops new ticks immediately but awaits the active task before draining', async () => {
  jest.useFakeTimers();
  const pending = deferred(),
    task = jest.fn(() => pending.promise),
    stop = startDrainingLoop(task, 10);
  await jest.advanceTimersByTimeAsync(10);
  expect(task).toHaveBeenCalledTimes(1);
  stop();
  let done = false;
  const drain = stop.drain().then(() => {
    done = true;
  });
  await jest.advanceTimersByTimeAsync(100);
  expect(done).toBe(false);
  expect(task).toHaveBeenCalledTimes(1);
  pending.resolve();
  await drain;
  expect(done).toBe(true);
});
it('SSE drain ends all streams, rejects new subscriptions and suppresses pending writes', async () => {
  const broker = new SseBroker(),
    authorize = deferred(),
    write = jest.fn(),
    end = jest.fn();
  broker.subscribe(
    1,
    { kind: 'merchant', userId: 2, principal: 'user' },
    { write, end },
    async () => {
      await authorize.promise;
      return true;
    }
  );
  const pending = broker.broadcast(1, null, { type: 'updated' });
  await Promise.resolve();
  const drain = broker.drain();
  expect(end).toHaveBeenCalledTimes(1);
  expect(broker.subscriberCount()).toBe(0);
  const next = { write: jest.fn(), end: jest.fn() };
  broker.subscribe(1, { kind: 'board', stoneId: 3 }, next);
  expect(next.write).not.toHaveBeenCalled();
  expect(next.end).toHaveBeenCalledTimes(1);
  authorize.resolve();
  await pending;
  await drain;
  expect(write).toHaveBeenCalledTimes(1);
});
it('cron drain includes acquisition/lease cleanup and holds a send that cannot be confirmed', async () => {
  const repo = new MemoryCronRepository(),
    cron = new CronCoordinator(repo),
    started = deferred(),
    effect = deferred();
  const run = cron.run([
    {
      name: 'dispatch',
      run: async () => {
        started.resolve();
        await effect.promise;
        return { sent: 1 };
      },
    },
  ]);
  await started.promise;
  cron.stop();
  await cron.drain();
  expect(await run).toEqual({ kind: 'unavailable' });
  expect(
    await cron.run([{ name: 'dispatch', run: async () => ({ sent: 1 }) }])
  ).toEqual({ kind: 'unavailable' });
  expect(JSON.stringify(await repo.status())).toContain('held');
  effect.resolve();
});
