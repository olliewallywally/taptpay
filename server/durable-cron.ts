import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  cronJobName,
  cronMetrics,
  cronJobDisposition,
  cronReplaySafe,
  CRON_HEARTBEAT_MS,
  type CronJobName,
  type CronMetrics,
} from './cron-contract';
import { CronStopped, withCronCheckpoint } from './cron-checkpoint';
import { runWithOperationContext } from './operation-context';
import { logOperation } from './structured-log';
export interface CronRun {
  id: string;
  owner: string;
  slot: Date;
  startedAt: Date;
  deadlineAt: Date;
  remainingMs?: number;
  attempt: number;
  state: 'running' | 'succeeded' | 'failed' | 'abandoned';
  finishedAt?: Date;
  durationMs?: number;
}
export type CronJobResult = CronMetrics | { error: string };
export interface CronCompleted {
  kind: 'completed';
  ok: boolean;
  runId: string;
  ranAt: string;
  failedPasses: CronJobName[];
  jobs: Partial<Record<CronJobName, CronJobResult>>;
  duplicate?: boolean;
}
export interface CronLease {
  run: CronRun;
  checkpoint(): void | Promise<void>;
  heartbeat(): Promise<boolean>;
  startJob(
    name: CronJobName,
    id: string
  ): Promise<
    | { kind: 'started'; id: string }
    | { kind: 'completed'; metrics: CronMetrics }
    | { kind: 'held' }
  >;
  finishJob(
    id: string,
    state: 'succeeded' | 'failed' | 'held',
    metrics: CronMetrics,
    errorCode: 'job_failed' | null
  ): Promise<boolean>;
  finish(ok: boolean): Promise<boolean>;
  abandon(): Promise<void>;
  close(): Promise<void>;
}
export interface CronRepository {
  acquire(): Promise<
    | { kind: 'busy' }
    | { kind: 'duplicate'; result: CronCompleted }
    | { kind: 'acquired'; lease: CronLease }
  >;
  status(): Promise<Record<string, unknown>>;
}
export interface CronJob {
  name: CronJobName;
  run(): Promise<unknown>;
}
export class CronCoordinator {
  private stopped = false;
  private aborters = new Set<() => void>();
  constructor(
    readonly repository: CronRepository,
    private readonly heartbeatMs = CRON_HEARTBEAT_MS
  ) {
    if (
      !Number.isInteger(heartbeatMs) ||
      heartbeatMs < 1 ||
      heartbeatMs > 30000
    )
      throw Error('invalid_cron_configuration');
  }
  stop() {
    this.stopped = true;
    for (const abort of this.aborters) abort();
  }
  status() {
    return this.repository.status();
  }
  async run(
    jobs: readonly CronJob[]
  ): Promise<CronCompleted | { kind: 'busy' } | { kind: 'unavailable' }> {
    if (this.stopped) return { kind: 'unavailable' };
    if (
      !jobs.length ||
      jobs.length > 12 ||
      jobs.some(j => !cronJobName(j.name)) ||
      new Set(jobs.map(j => j.name)).size !== jobs.length
    )
      throw Error('invalid_cron_jobs');
    let claim: Awaited<ReturnType<CronRepository['acquire']>>;
    try {
      claim = await this.repository.acquire();
    } catch {
      logOperation('error', 'cron_coordinator_unavailable');
      return { kind: 'unavailable' };
    }
    if (claim.kind === 'busy') return claim;
    if (claim.kind === 'duplicate') return { ...claim.result, duplicate: true };
    const lease = claim.lease;
    let lost = false,
      heartbeatTask: Promise<void> | undefined;
    const cycleStarted = performance.now();
    const controller = new AbortController(),
      remaining =
        lease.run.remainingMs ?? lease.run.deadlineAt.getTime() - Date.now(),
      deadline = performance.now() + Math.max(0, Math.min(240000, remaining));
    const abort = () => {
      lost = true;
      controller.abort();
    };
    this.aborters.add(abort);
    const deadlineTimer = setTimeout(
      abort,
      Math.max(0, Math.min(240000, remaining))
    );
    deadlineTimer.unref();
    const checkpoint = async () => {
      if (lost || this.stopped || performance.now() >= deadline)
        throw new CronStopped();
      await lease.checkpoint();
    };
    const interruptible = <T>(work: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const stop = () => reject(new CronStopped());
        if (controller.signal.aborted) {
          reject(new CronStopped());
          void work.catch(() => undefined);
          return;
        }
        controller.signal.addEventListener('abort', stop, { once: true });
        work
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener('abort', stop))
          .catch(() => undefined);
      });
    const timer = setInterval(() => {
      if (heartbeatTask || lost) return;
      heartbeatTask = lease
        .heartbeat()
        .then(valid => {
          if (!valid) abort();
        }, abort)
        .finally(() => {
          heartbeatTask = undefined;
        });
    }, this.heartbeatMs);
    timer.unref();
    return runWithOperationContext({ jobId: lease.run.id }, async () => {
      const failed = new Set<CronJobName>(),
        results: CronCompleted['jobs'] = {};
      const execute = async (job: CronJob) => {
        await checkpoint();
        const id = randomUUID(),
          start = await lease.startJob(job.name, id);
        if (start.kind === 'completed') {
          results[job.name] = start.metrics;
          return;
        }
        if (start.kind === 'held') {
          results[job.name] = { error: 'Job held for reconciliation' };
          failed.add(job.name);
          return;
        }
        await runWithOperationContext({ jobId: id }, () =>
          withCronCheckpoint(checkpoint, async () => {
            const jobStarted = performance.now();
            let metrics: CronMetrics = {},
              state: 'succeeded' | 'failed' | 'held' = 'succeeded';
            try {
              await checkpoint();
              metrics = cronMetrics(
                await interruptible(Promise.resolve().then(() => job.run()))
              );
              await checkpoint();
              state = cronJobDisposition(job.name, metrics);
            } catch (error) {
              if (error instanceof CronStopped) throw error;
              await checkpoint();
              state = cronReplaySafe(job.name) ? 'failed' : 'held';
            }
            if (
              !(await lease.finishJob(
                id,
                state,
                metrics,
                state === 'succeeded' ? null : 'job_failed'
              ))
            )
              throw new CronStopped();
            if (state !== 'succeeded') {
              failed.add(job.name);
              results[job.name] = {
                error:
                  state === 'held'
                    ? 'Job held for reconciliation'
                    : 'Pass failed',
              };
              logOperation('error', 'cron_pass_failed', {
                job: job.name,
                held: state === 'held',
              });
            } else {
              results[job.name] = metrics;
              logOperation('info', 'cron_pass_finished', {
                job: job.name,
                state: 'succeeded',
                ...metrics,
                durationMs: Math.max(
                  0,
                  Math.floor(performance.now() - jobStarted)
                ),
              });
            }
          })
        );
      };
      let billingSettled: Promise<void> | undefined;
      try {
        const billing = jobs.find(j => j.name === 'subscriptionBilling');
        if (billing) billingSettled = execute(billing).catch(abort);
        for (const job of jobs) {
          if (job.name === 'subscriptionBilling') continue;
          await execute(job);
        }
        await billingSettled;
        await checkpoint();
        const ok = failed.size === 0;
        if (!(await lease.finish(ok))) throw new CronStopped();
        logOperation('info', 'cron_cycle_finished', {
          ok,
          failed: failed.size,
          durationMs: Math.max(0, Math.floor(performance.now() - cycleStarted)),
        });
        return {
          kind: 'completed',
          ok,
          runId: lease.run.id,
          ranAt: lease.run.startedAt.toISOString(),
          failedPasses: jobs.map(j => j.name).filter(n => failed.has(n)),
          jobs: results,
        };
      } catch {
        abort();
        await billingSettled;
        await lease.abandon().catch(() => undefined);
        logOperation('error', 'cron_ownership_lost');
        return { kind: 'unavailable' };
      } finally {
        clearInterval(timer);
        clearTimeout(deadlineTimer);
        this.aborters.delete(abort);
        await heartbeatTask;
        await lease.close().catch(() => undefined);
      }
    });
  }
}
