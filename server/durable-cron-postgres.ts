import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  CRON_INTERVAL_MS,
  CRON_LEASE_MS,
  CRON_BUDGET_MS,
  CRON_JOB_NAMES,
  cronJobName,
  cronMetrics,
  cronReplaySafe,
  type CronJobName,
  type CronMetrics,
} from './cron-contract';
import { CronStopped } from './cron-checkpoint';
import { isOperationId } from './operation-context';
import type {
  CronRepository,
  CronLease,
  CronRun,
  CronCompleted,
} from './durable-cron';
export interface CronSqlClient {
  query(
    text: string,
    values?: any[]
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(destroy?: boolean): void;
  on?(event: 'error', listener: () => void): unknown;
  removeListener?(event: 'error', listener: () => void): unknown;
}
export interface CronSqlPool {
  connect(): Promise<CronSqlClient>;
}
export const CRON_LOCK_KEYS = [1818324006, 6] as const;
const safeJobs = CRON_JOB_NAMES.filter(cronReplaySafe);
const durationSQL =
  'GREATEST(0,floor(extract(epoch FROM (clock_timestamp()-started_at))*1000))::bigint';
const validParent =
  "id=$1 AND owner=$2 AND state='running' AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp()";
const integer = (value: unknown) => {
  const n =
    typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
    throw Error('invalid_cron_status');
  return n;
};
const date = (value: unknown) => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw Error('invalid_cron_status');
  return value;
};
function runRow(row: any): CronRun {
  if (
    !row ||
    !['running', 'succeeded', 'failed', 'abandoned'].includes(row.state)
  )
    throw Error('invalid_cron_status');
  return {
    id: row.id,
    owner: row.owner,
    slot: date(row.scheduled_for),
    startedAt: date(row.started_at),
    deadlineAt: date(row.deadline_at),
    attempt: integer(row.attempt),
    state: row.state,
    ...(row.finished_at
      ? {
          finishedAt: date(row.finished_at),
          durationMs: integer(row.duration_ms),
        }
      : {}),
    ...(row.remaining_ms !== undefined
      ? { remainingMs: integer(row.remaining_ms) }
      : {}),
  };
}
async function jobResults(
  client: CronSqlClient,
  run: CronRun
): Promise<CronCompleted> {
  const rows = (
    await client.query(
      'SELECT name,state,metrics,error_code FROM public.cron_jobs WHERE run_id=$1 ORDER BY started_at,id',
      [run.id]
    )
  ).rows;
  const jobs: CronCompleted['jobs'] = {},
    failedPasses: CronJobName[] = [];
  for (const row of rows) {
    const name: unknown = row.name;
    if (!cronJobName(name)) throw Error('invalid_cron_status');
    if (
      ['succeeded', 'resolved_complete'].includes(row.state) ||
      (row.state === 'skipped' && row.error_code === 'already_completed')
    )
      jobs[name] = cronMetrics(row.metrics);
    else {
      failedPasses.push(name);
      jobs[name] = {
        error:
          row.state === 'held' || row.error_code === 'held_job'
            ? 'Job held for reconciliation'
            : row.state === 'resolved_retry'
              ? 'Job resolved for later retry'
              : 'Pass failed',
      };
    }
  }
  return {
    kind: 'completed',
    ok: run.state === 'succeeded',
    runId: run.id,
    ranAt: run.startedAt.toISOString(),
    jobs,
    failedPasses: CRON_JOB_NAMES.filter(n => failedPasses.includes(n)),
  };
}
async function abandonRun(
  client: CronSqlClient,
  id: string,
  owner: string,
  code: 'lease_expired' | 'ownership_lost'
) {
  if (
    !(
      await client.query(
        "SELECT id FROM public.cron_runs WHERE id=$1 AND owner=$2 AND state='running' FOR UPDATE",
        [id, owner]
      )
    ).rows.length
  )
    return;
  await client.query(
    `UPDATE public.cron_jobs SET state=CASE WHEN name=ANY($3::text[]) THEN 'failed' ELSE 'held' END,
  finished_at=clock_timestamp(),duration_ms=${durationSQL},error_code=$4
  WHERE run_id=$1 AND state='running' AND EXISTS(SELECT 1 FROM public.cron_runs WHERE id=$1 AND owner=$2 AND state='running')`,
    [id, owner, safeJobs, code]
  );
  await client.query(
    `UPDATE public.cron_runs SET state='abandoned',finished_at=clock_timestamp(),duration_ms=${durationSQL}
  WHERE id=$1 AND owner=$2 AND state='running'`,
    [id, owner]
  );
}
/** Every operation pins a backend only for its short transaction. */
async function cronTransaction<T>(
  pool: CronSqlPool,
  run: (client: CronSqlClient) => Promise<T>,
  readOnly = false
): Promise<T> {
  const client = await pool.connect();
  let transaction = false,
    broken = false;
  const onError = () => {
    broken = true;
  };
  client.on?.('error', onError);
  try {
    await client.query(
      readOnly
        ? 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
        : 'BEGIN'
    );
    transaction = true;
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await run(client);
    await client.query('COMMIT');
    transaction = false;
    return result;
  } catch (error) {
    broken = true;
    throw error;
  } finally {
    if (transaction)
      try {
        await client.query('ROLLBACK');
      } catch {
        broken = true;
      }
    client.removeListener?.('error', onError);
    client.release(broken);
  }
}
async function parentLocked(client: CronSqlClient, run: CronRun) {
  return (
    (
      await client.query(
        `SELECT id FROM public.cron_runs WHERE ${validParent} FOR UPDATE`,
        [run.id, run.owner]
      )
    ).rows.length === 1
  );
}
export class PostgresCronRepository implements CronRepository {
  constructor(private readonly pool: CronSqlPool) {}
  async acquire(): Promise<Awaited<ReturnType<CronRepository['acquire']>>> {
    const started = performance.now();
    const result = await cronTransaction(this.pool, async client => {
      const locked =
        (
          await client.query(
            'SELECT pg_try_advisory_xact_lock($1,$2) AS locked',
            [...CRON_LOCK_KEYS]
          )
        ).rows[0]?.locked === true;
      if (!locked) return { kind: 'busy' as const };
      const active = (
        await client.query(
          "SELECT *,lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() AS live FROM public.cron_runs WHERE state='running' FOR UPDATE"
        )
      ).rows;
      if (active.some(row => row.live)) return { kind: 'busy' as const };
      for (const row of active)
        await abandonRun(client, row.id, row.owner, 'lease_expired');
      const clock = (
        await client.query(
          'SELECT clock_timestamp() AS now,to_timestamp(floor(extract(epoch FROM clock_timestamp())/($1::int/1000))*($1::int/1000)) AS slot',
          [CRON_INTERVAL_MS]
        )
      ).rows[0];
      const prior = (
        await client.query(
          'SELECT * FROM public.cron_runs WHERE scheduled_for=$1 ORDER BY attempt DESC LIMIT 1',
          [clock.slot]
        )
      ).rows[0];
      if (prior && ['succeeded', 'failed'].includes(prior.state))
        return {
          kind: 'duplicate' as const,
          result: await jobResults(client, runRow(prior)),
        };
      const row = (
        await client.query(
          `INSERT INTO public.cron_runs(id,owner,scheduled_for,attempt,started_at,heartbeat_at,lease_expires_at,deadline_at)
    VALUES($1,$2,$3,$4,$5,$5,$5::timestamptz+$6::int*interval '1 millisecond',$5::timestamptz+$7::int*interval '1 millisecond')
    RETURNING *,GREATEST(0,floor(extract(epoch FROM(deadline_at-clock_timestamp()))*1000))::bigint AS remaining_ms,
    GREATEST(0,floor(extract(epoch FROM(lease_expires_at-clock_timestamp()))*1000))::bigint AS lease_remaining_ms`,
          [
            randomUUID(),
            randomUUID(),
            clock.slot,
            (prior?.attempt ?? 0) + 1,
            clock.now,
            CRON_LEASE_MS,
            CRON_BUDGET_MS,
          ]
        )
      ).rows[0];
      return {
        kind: 'new' as const,
        run: runRow(row),
        leaseRemaining: integer(row.lease_remaining_ms),
      };
    });
    if (result.kind !== 'new') return result;
    const elapsed = performance.now() - started + 100;
    result.run.remainingMs = Math.max(
      0,
      (result.run.remainingMs ?? CRON_BUDGET_MS) - elapsed
    );
    return {
      kind: 'acquired',
      lease: new PostgresCronLease(
        this.pool,
        result.run,
        Math.max(0, result.leaseRemaining - elapsed)
      ),
    };
  }
  async status(): Promise<Record<string, unknown>> {
    return cronTransaction(
      this.pool,
      async client => {
        const snapshot = (
          await client.query(`SELECT clock_timestamp() AS now,
    (SELECT count(*)::text FROM public.cron_runs WHERE state='running') AS running,
    (SELECT count(*)::text FROM public.cron_runs WHERE state='running' AND lease_expires_at<=clock_timestamp()) AS expired,
    (SELECT max(finished_at) FROM public.cron_runs WHERE state='succeeded') AS last_success,
    (SELECT count(*)::text FROM public.cron_jobs WHERE state='held') AS held,
    (SELECT count(*)::text FROM public.payment_notification_inbox WHERE status='dead_letter') AS inbox_dead,
    (SELECT count(*)::text FROM public.payment_delivery_outbox WHERE status='dead_letter') AS outbox_dead,
    (SELECT count(*)::text FROM public.payment_delivery_targets WHERE state='held') AS delivery_held,
    (SELECT GREATEST(0,floor(extract(epoch FROM(clock_timestamp()-min(first_received_at)))*1000))::bigint FROM public.payment_notification_inbox WHERE status IN ('pending','retry','processing')) AS reconciliation_age,
    (SELECT count(*)::text FROM public.merchant_subscriptions WHERE billing_claim_token IS NOT NULL AND (billing_claimed_at IS NULL OR billing_claimed_at<(clock_timestamp() AT TIME ZONE 'UTC')-interval '10 minutes')) AS billing_claims,
    (SELECT count(*)::text FROM public.subscription_billing_attempts WHERE applied_at IS NULL AND state IN ('claiming','unknown') AND updated_at<clock_timestamp()-interval '10 minutes' AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())) AS billing_backlog`)
        ).rows[0];
        const latest = (
          await client.query(
            'SELECT * FROM public.cron_runs ORDER BY started_at DESC,id DESC LIMIT 1'
          )
        ).rows[0];
        const now = date(snapshot.now),
          lastSuccess = snapshot.last_success
            ? date(snapshot.last_success)
            : null;
        const stale =
          !lastSuccess ||
          now.getTime() - lastSuccess.getTime() >= 2 * CRON_INTERVAL_MS;
        const running = integer(snapshot.running) > 0,
          held = integer(snapshot.held),
          deadLetters =
            integer(snapshot.inbox_dead) + integer(snapshot.outbox_dead),
          deliveryHeld = integer(snapshot.delivery_held);
        const reconciliationAgeMs =
            snapshot.reconciliation_age === null
              ? null
              : integer(snapshot.reconciliation_age),
          stuckBillingClaims = integer(snapshot.billing_claims),
          billingBacklog = integer(snapshot.billing_backlog),
          expired = integer(snapshot.expired);
        const run = latest ? runRow(latest) : null,
          result = run ? await jobResults(client, run) : null;
        const heldJobs = (
          await client.query(
            "SELECT id,run_id,name,started_at,error_code FROM public.cron_jobs WHERE state='held' ORDER BY started_at,id LIMIT 12"
          )
        ).rows.map(row => {
          const job: unknown = row.name;
          if (
            !cronJobName(job) ||
            !isOperationId(row.id) ||
            !isOperationId(row.run_id) ||
            !(
              row.error_code === null ||
              [
                'job_failed',
                'lease_expired',
                'ownership_lost',
                'held_job',
                'already_completed',
              ].includes(row.error_code)
            )
          )
            throw Error('invalid_cron_status');
          return {
            jobId: row.id,
            runId: row.run_id,
            job,
            startedAt: date(row.started_at).toISOString(),
            errorCode: row.error_code,
          };
        });
        return {
          configured: true,
          running,
          startedAt: running && run ? run.startedAt.toISOString() : null,
          lastRun: run
            ? {
                runId: run.id,
                startedAt: run.startedAt.toISOString(),
                finishedAt: run.finishedAt?.toISOString() ?? null,
                durationMs: run.durationMs ?? null,
                ok: run.state === 'succeeded',
                state: run.state,
                failedPasses: result?.failedPasses ?? [],
                subscriptionBilling: result?.jobs.subscriptionBilling ?? null,
                jobs: result?.jobs ?? {},
              }
            : null,
          asOf: now.toISOString(),
          expectedIntervalMs: CRON_INTERVAL_MS,
          lastSuccessfulAt: lastSuccess?.toISOString() ?? null,
          counts: {
            heldJobs: held,
            expiredRuns: expired,
            deadLetters,
            heldDeliveries: deliveryHeld,
            stuckBillingClaims,
            billingBacklog,
          },
          reconciliationAgeMs,
          heldJobs,
          alerts: {
            schedulerStale: stale,
            uncertainJobs: held > 0,
            expiredRun: expired > 0,
            deadLettersPresent: deadLetters > 0,
            heldDeliveries: deliveryHeld > 0,
            reconciliationAged:
              reconciliationAgeMs !== null &&
              reconciliationAgeMs >= 2 * CRON_INTERVAL_MS,
            stuckBilling: stuckBillingClaims > 0 || billingBacklog > 0,
          },
        };
      },
      true
    );
  }
  async resolveHeld(input: {
    runId: string;
    jobId: string;
    resolution: 'verified_complete' | 'verified_safe_retry';
    reviewDigest: string;
  }): Promise<boolean> {
    if (
      !isOperationId(input.runId) ||
      !isOperationId(input.jobId) ||
      !/^[0-9a-f]{64}$/.test(input.reviewDigest) ||
      !['verified_complete', 'verified_safe_retry'].includes(input.resolution)
    )
      throw Error('invalid_cron_resolution');
    return cronTransaction(this.pool, async client => {
      const locked =
        (
          await client.query(
            'SELECT pg_try_advisory_xact_lock($1,$2) AS locked',
            [...CRON_LOCK_KEYS]
          )
        ).rows[0]?.locked === true;
      if (!locked) return false;
      // The lease row, not a session, protects an ongoing cycle between transactions.
      if (
        (
          await client.query(
            "SELECT id FROM public.cron_runs WHERE state='running' FOR UPDATE"
          )
        ).rows.length
      )
        return false;
      const result = await client.query(
        `UPDATE public.cron_jobs SET state=$3,resolved_at=clock_timestamp(),review_digest=$4
    WHERE id=$1 AND run_id=$2 AND state='held' AND EXISTS(SELECT 1 FROM public.cron_runs WHERE id=$2 AND state<>'running') RETURNING id`,
        [
          input.jobId,
          input.runId,
          input.resolution === 'verified_complete'
            ? 'resolved_complete'
            : 'resolved_retry',
          input.reviewDigest,
        ]
      );
      return result.rows.length === 1;
    });
  }
}
class PostgresCronLease implements CronLease {
  private closed = false;
  private lost = false;
  private leaseUntil: number;
  constructor(
    private readonly pool: CronSqlPool,
    readonly run: CronRun,
    remainingMs: number
  ) {
    this.leaseUntil = performance.now() + remainingMs;
  }
  checkpoint() {
    if (this.closed || this.lost || performance.now() >= this.leaseUntil)
      throw new CronStopped();
  }
  async heartbeat() {
    const started = performance.now();
    try {
      this.checkpoint();
      const result = await cronTransaction(
        this.pool,
        async client =>
          (
            await client.query(
              `UPDATE public.cron_runs SET heartbeat_at=clock_timestamp(),lease_expires_at=LEAST(deadline_at,clock_timestamp()+$3::int*interval '1 millisecond') WHERE ${validParent}
    RETURNING GREATEST(0,floor(extract(epoch FROM(lease_expires_at-clock_timestamp()))*1000))::bigint AS remaining_ms`,
              [this.run.id, this.run.owner, CRON_LEASE_MS]
            )
          ).rows[0]
      );
      if (!result) {
        this.lost = true;
        return false;
      }
      this.leaseUntil =
        performance.now() +
        integer(result.remaining_ms) -
        (performance.now() - started) -
        100;
      return true;
    } catch {
      this.lost = true;
      return false;
    }
  }
  async startJob(
    name: CronJobName,
    id: string
  ): Promise<Awaited<ReturnType<CronLease['startJob']>>> {
    this.checkpoint();
    if (!cronJobName(name) || !isOperationId(id))
      throw Error('invalid_cron_job');
    return cronTransaction(this.pool, async client => {
      if (!(await parentLocked(client, this.run))) throw new CronStopped();
      const previous = (
        await client.query(
          `SELECT j.state,j.metrics FROM public.cron_jobs j JOIN public.cron_runs r ON r.id=j.run_id
    WHERE j.name=$1 AND r.scheduled_for=$2 AND j.state IN ('succeeded','resolved_complete') ORDER BY j.started_at DESC LIMIT 1`,
          [name, this.run.slot]
        )
      ).rows[0];
      const held = (
        await client.query(
          "SELECT id FROM public.cron_jobs WHERE name=$1 AND state IN ('held','running') LIMIT 1",
          [name]
        )
      ).rows[0];
      const state = held || previous ? 'skipped' : 'running',
        metrics = previous ? cronMetrics(previous.metrics) : {},
        code = held ? 'held_job' : previous ? 'already_completed' : null;
      await client.query(
        `INSERT INTO public.cron_jobs(id,run_id,name,state,metrics,error_code,started_at,finished_at,duration_ms)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,statement_timestamp(),CASE WHEN $4::text='running' THEN NULL ELSE statement_timestamp() END,CASE WHEN $4::text='running' THEN NULL ELSE 0 END)`,
        [id, this.run.id, name, state, JSON.stringify(metrics), code]
      );
      if (held) return { kind: 'held' };
      if (previous) return { kind: 'completed', metrics };
      return { kind: 'started', id };
    });
  }
  async finishJob(
    id: string,
    state: 'succeeded' | 'failed' | 'held',
    metrics: CronMetrics,
    errorCode: 'job_failed' | null
  ) {
    this.checkpoint();
    return cronTransaction(this.pool, async client => {
      if (!(await parentLocked(client, this.run))) return false;
      const result = await client.query(
        `UPDATE public.cron_jobs SET state=$3,metrics=$4::jsonb,error_code=$5,finished_at=clock_timestamp(),duration_ms=${durationSQL}
    WHERE id=$2 AND run_id=$1 AND state='running' RETURNING id`,
        [
          this.run.id,
          id,
          state,
          JSON.stringify(cronMetrics(metrics)),
          errorCode,
        ]
      );
      return result.rows.length === 1;
    });
  }
  async finish(ok: boolean) {
    this.checkpoint();
    return cronTransaction(this.pool, async client => {
      if (!(await parentLocked(client, this.run))) return false;
      return (
        (
          await client.query(
            `UPDATE public.cron_runs SET state=$2,finished_at=clock_timestamp(),duration_ms=${durationSQL} WHERE id=$1
    AND NOT EXISTS(SELECT 1 FROM public.cron_jobs WHERE run_id=$1 AND state='running')
    AND ($2::text='failed' OR NOT EXISTS(SELECT 1 FROM public.cron_jobs WHERE run_id=$1 AND state NOT IN ('succeeded','resolved_complete') AND NOT(state='skipped' AND error_code='already_completed'))) RETURNING id`,
            [this.run.id, ok ? 'succeeded' : 'failed']
          )
        ).rows.length === 1
      );
    });
  }
  async abandon() {
    if (!this.closed)
      await cronTransaction(this.pool, client =>
        abandonRun(client, this.run.id, this.run.owner, 'ownership_lost')
      );
  }
  async close() {
    this.closed = true;
  }
}
