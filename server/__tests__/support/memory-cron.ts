/** Explicit no-database test double. Never imported by application code. */
import { randomUUID } from 'node:crypto';
import { CronStopped } from '../../cron-checkpoint';
import type {
  CronRepository,
  CronLease,
  CronCompleted,
} from '../../durable-cron';
import type { CronJobName, CronMetrics } from '../../cron-contract';
export class MemoryCronRepository implements CronRepository {
  private active = false;
  private last: CronCompleted | undefined;
  private held = new Set<CronJobName>();
  reset() {
    this.active = false;
    this.last = undefined;
    this.held.clear();
  }
  async acquire(): Promise<Awaited<ReturnType<CronRepository['acquire']>>> {
    if (this.active) return { kind: 'busy' };
    if (this.last) return { kind: 'duplicate', result: this.last };
    this.active = true;
    const now = new Date(),
      id = randomUUID(),
      owner = randomUUID(),
      records = new Map<
        string,
        { name: CronJobName; state: string; metrics: CronMetrics }
      >();
    const checkpoint = () => {
      if (!this.active) throw new CronStopped();
    };
    const lease: CronLease = {
      run: {
        id,
        owner,
        slot: now,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 240000),
        attempt: 1,
        state: 'running',
      },
      checkpoint,
      heartbeat: async () => this.active,
      startJob: async (name, jobId) => {
        checkpoint();
        if (this.held.has(name)) {
          records.set(jobId, { name, state: 'held', metrics: {} });
          return { kind: 'held' };
        }
        records.set(jobId, { name, state: 'running', metrics: {} });
        return { kind: 'started', id: jobId };
      },
      finishJob: async (jobId, state, metrics) => {
        checkpoint();
        const record = records.get(jobId);
        if (!record) return false;
        Object.assign(record, { state, metrics });
        if (state === 'held') this.held.add(record.name);
        return true;
      },
      finish: async ok => {
        checkpoint();
        const jobs: CronCompleted['jobs'] = {},
          failedPasses: CronJobName[] = [];
        for (const r of records.values()) {
          jobs[r.name] =
            r.state === 'succeeded' ? r.metrics : { error: 'Pass failed' };
          if (r.state !== 'succeeded') failedPasses.push(r.name);
        }
        this.last = {
          kind: 'completed',
          ok,
          runId: id,
          ranAt: now.toISOString(),
          jobs,
          failedPasses,
        };
        this.active = false;
        return true;
      },
      abandon: async () => {
        for (const r of records.values())
          if (r.state === 'running') this.held.add(r.name);
        this.active = false;
      },
      close: async () => {},
    };
    return { kind: 'acquired', lease };
  }
  async status() {
    return {
      configured: true,
      running: this.active,
      startedAt: null,
      lastRun: this.last ?? null,
      counts: { heldJobs: this.held.size },
      alerts: { schedulerStale: !this.last?.ok },
    };
  }
}
