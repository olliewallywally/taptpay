import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePreflightArguments,
  assertPreflightTarget,
} from '../server/encryption-preflight';
import { preflightConnectionSettings } from './r5-encryption-preflight';
import { isOperationId } from '../server/operation-context';
import {
  PostgresCronRepository,
  type CronSqlPool,
} from '../server/durable-cron-postgres';
export function parseCronResolution(argv: readonly string[]) {
  const options = new Map<string, string>(),
    allowed = [
      'expected-host',
      'expected-port',
      'expected-database',
      'run-id',
      'job-id',
      'resolution',
      'review-digest',
      'execute',
      'acknowledge-inflight-stopped',
    ];
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match || !allowed.includes(match[1]) || options.has(match[1]))
      throw Error('invalid_cron_resolution_arguments');
    options.set(match[1], match[2]);
  }
  const runId = options.get('run-id'),
    jobId = options.get('job-id'),
    resolution = options.get('resolution'),
    reviewDigest = options.get('review-digest');
  const execute = options.get('execute') ?? 'false',
    ack = options.get('acknowledge-inflight-stopped') ?? 'false';
  if (
    !isOperationId(runId) ||
    !isOperationId(jobId) ||
    !['verified_complete', 'verified_safe_retry'].includes(resolution ?? '') ||
    !reviewDigest ||
    !/^[0-9a-f]{64}$/.test(reviewDigest) ||
    !['true', 'false'].includes(execute) ||
    !['true', 'false'].includes(ack) ||
    (execute === 'true' && ack !== 'true')
  )
    throw Error('invalid_cron_resolution_arguments');
  const target = parsePreflightArguments(
    ['expected-host', 'expected-port', 'expected-database'].map(
      key => `--${key}=${options.get(key) ?? ''}`
    )
  );
  return {
    target,
    runId,
    jobId,
    resolution: resolution as 'verified_complete' | 'verified_safe_retry',
    reviewDigest,
    execute: execute === 'true',
  };
}
export async function runCronResolution(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
) {
  const options = parseCronResolution(argv),
    settings = preflightConnectionSettings({
      R5_PREFLIGHT_DATABASE_URL: env.R6_CRON_DATABASE_URL,
    });
  assertPreflightTarget(options.target, settings);
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    ...settings,
    max: 1,
    statement_timeout: 5000,
    query_timeout: 5000,
    application_name: 'taptpay-r6-cron-resolution',
  });
  pool.on('error', () => undefined);
  const guarded: CronSqlPool = {
    connect: async () => {
      const client = await pool.connect();
      try {
        const row = (
          await client.query('SELECT current_database() AS database')
        ).rows[0];
        assertPreflightTarget(options.target, settings, row.database);
        return client;
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
  };
  try {
    if (options.execute) {
      const resolved = await new PostgresCronRepository(guarded).resolveHeld(
        options
      );
      return { mode: 'execute' as const, resolved };
    }
    const client = await guarded.connect();
    let transaction = false;
    try {
      await client.query(
        'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
      );
      transaction = true;
      const row = (
        await client.query(
          'SELECT j.state,r.state AS parent_state FROM public.cron_jobs j JOIN public.cron_runs r ON r.id=j.run_id WHERE j.id=$1 AND j.run_id=$2',
          [options.jobId, options.runId]
        )
      ).rows[0];
      return {
        mode: 'dry-run' as const,
        matched: !!row,
        held: row?.state === 'held',
        parentStopped: !!row && row.parent_state !== 'running',
        resolution: options.resolution,
        reviewDigest: options.reviewDigest,
      };
    } finally {
      try {
        if (transaction) await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await runCronResolution(process.argv.slice(2), process.env);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.mode === 'execute' && !result.resolved) {
      process.stderr.write('R6_CRON_RESOLUTION_NOT_APPLIED\n');
      process.exitCode = 2;
    }
  } catch {
    process.stderr.write('R6_CRON_RESOLUTION_FAILED\n');
    process.exitCode = 1;
  }
}
