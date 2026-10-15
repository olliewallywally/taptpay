import { randomUUID } from 'node:crypto';
import {
  CronCoordinator,
  type CronLease,
  type CronRepository,
} from '../durable-cron';
import { getOperationContext } from '../operation-context';
import { cronCheckpoint, CronStopped } from '../cron-checkpoint';
function fixture() {
  const events: string[] = [],
    owner = randomUUID(),
    id = randomUUID();
  let active = true;
  const lease: CronLease = {
    run: {
      id,
      owner,
      slot: new Date(),
      startedAt: new Date(),
      deadlineAt: new Date(Date.now() + 240000),
      state: 'running',
      attempt: 1,
    },
    heartbeat: jest.fn(async () => active),
    checkpoint: () => {
      if (!active) throw new CronStopped();
    },
    startJob: jest.fn(async (name, jobId) => {
      events.push('start:' + name);
      return { kind: 'started', id: jobId } as const;
    }),
    finishJob: jest.fn(async (_id, state) => {
      events.push('finish:' + state);
      return active;
    }),
    finish: jest.fn(async ok => {
      events.push('parent:' + ok);
      return active;
    }),
    abandon: jest.fn(async () => {
      events.push('abandon');
    }),
    close: jest.fn(async () => {
      events.push('close');
    }),
  };
  const repository: CronRepository = {
    acquire: jest.fn(async () => ({ kind: 'acquired' as const, lease })),
    status: jest.fn(),
  };
  return {
    repository,
    lease,
    events,
    lose: () => {
      active = false;
    },
  };
}
test('billing starts independently; persisted starts precede effects, one failed pass does not suppress later jobs', async () => {
  const f = fixture(),
    contexts: any[] = [];
  let release!: () => void;
  const barrier = new Promise<void>(r => {
    release = r;
  });
  const result = await new CronCoordinator(f.repository).run([
    {
      name: 'subscriptionBilling',
      run: async () => {
        await barrier;
        contexts.push(getOperationContext());
        f.events.push('effect:billing');
        return { charged: 1, errors: 0 };
      },
    },
    {
      name: 'generate',
      run: async () => {
        release();
        f.events.push('effect:generate');
        throw Error('private-provider-fault');
      },
    },
    {
      name: 'dispatch',
      run: async () => {
        contexts.push(getOperationContext());
        f.events.push('effect:dispatch');
        return { dispatched: 1, errors: 0 };
      },
    },
  ]);
  expect(result.kind).toBe('completed');
  if (result.kind !== 'completed') throw Error('expected_completed');
  expect(result.ok).toBe(false);
  expect(result.failedPasses).toEqual(['generate']);
  expect(f.events.indexOf('start:generate')).toBeLessThan(
    f.events.indexOf('effect:generate')
  );
  expect(f.events.indexOf('start:dispatch')).toBeLessThan(
    f.events.indexOf('effect:dispatch')
  );
  expect(f.events).toContain('parent:false');
  expect(f.events.at(-1)).toBe('close');
  expect(contexts.every(c => typeof c.jobId === 'string')).toBe(true);
  expect(new Set(contexts.map(c => c.jobId)).size).toBe(2);
  expect(JSON.stringify(result)).not.toContain('private-');
});
test('lost ownership prevents further side effects and completion success', async () => {
  const f = fixture(),
    later = jest.fn();
  const result = await new CronCoordinator(f.repository).run([
    {
      name: 'generate',
      run: async () => {
        f.lose();
        await cronCheckpoint();
        return { generated: 1 };
      },
    },
    { name: 'dispatch', run: later },
  ]);
  expect(result.kind).toBe('unavailable');
  expect(later).not.toHaveBeenCalled();
  expect(f.lease.finish).not.toHaveBeenCalled();
  expect(f.lease.abandon).toHaveBeenCalled();
  expect(f.lease.close).toHaveBeenCalled();
});
test('busy and already-completed slot do not execute a job', async () => {
  const task = jest.fn();
  for (const outcome of [
    { kind: 'busy' },
    {
      kind: 'duplicate',
      result: {
        kind: 'completed',
        ok: true,
        runId: randomUUID(),
        ranAt: new Date().toISOString(),
        failedPasses: [],
        jobs: {},
        duplicate: true,
      },
    },
  ] as const) {
    const coordinator = new CronCoordinator({
      acquire: async () => outcome,
      status: jest.fn(),
    } as any);
    await coordinator.run([{ name: 'generate', run: task }]);
  }
  expect(task).not.toHaveBeenCalled();
});
test('a hard deadline returns unavailable even when the in-flight provider promise has not settled', async () => {
  const f = fixture();
  f.lease.run.deadlineAt = new Date(Date.now() + 20);
  let release!: () => void;
  const barrier = new Promise<void>(r => {
    release = r;
  });
  const pending = new CronCoordinator(f.repository).run([
    {
      name: 'dispatch',
      run: async () => {
        await barrier;
        return { dispatched: 1 };
      },
    },
  ]);
  try {
    const result = await Promise.race([
      pending,
      new Promise<'deadline_missed'>(r =>
        setTimeout(() => r('deadline_missed'), 100)
      ),
    ]);
    expect(result).toEqual({ kind: 'unavailable' });
    expect(f.lease.abandon).toHaveBeenCalled();
    expect(f.lease.finishJob).not.toHaveBeenCalled();
  } finally {
    release();
    await pending;
  }
});
test('stop interrupts an in-flight job, holds its uncertainty and prevents new claims', async () => {
  const f = fixture(),
    coordinator = new CronCoordinator(f.repository);
  let release!: () => void, arrived!: () => void;
  const wait = new Promise<void>(r => {
      release = r;
    }),
    started = new Promise<void>(r => {
      arrived = r;
    });
  const pending = coordinator.run([
    {
      name: 'dispatch',
      run: async () => {
        arrived();
        await wait;
        return { dispatched: 1 };
      },
    },
  ]);
  await started;
  coordinator.stop();
  try {
    expect(await pending).toEqual({ kind: 'unavailable' });
    expect(f.lease.abandon).toHaveBeenCalled();
    expect(f.lease.finishJob).not.toHaveBeenCalled();
    expect(
      await coordinator.run([{ name: 'generate', run: jest.fn() }])
    ).toEqual({ kind: 'unavailable' });
    expect(f.repository.acquire).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await pending;
  }
});
