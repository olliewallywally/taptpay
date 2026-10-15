/** Owned synthetic databases only; no application target or provider calls. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import {
  PostgresCronRepository,
  type CronSqlPool,
} from '../server/durable-cron-postgres';
import { CronCoordinator, type CronLease } from '../server/durable-cron';
import { CronStopped } from '../server/cron-checkpoint';
import { ensureMigrationLedger, applyMigration } from '../server/migrate';
import { findMissingBaselineEffects } from '../server/migration-baseline-contract';
import { safeErrorSummary } from '../server/log-redaction';
import { runCronResolution } from './r6-cron-resolve';
// @ts-expect-error Standalone safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
// @ts-expect-error Standalone catalog helper.
import { collectSchema, fingerprintDocument } from './schema-fingerprint.mjs';
let phase = 'guard',
  checks = 0;
const root = new URL('../', import.meta.url),
  folder = '/tmp/taptpay-r6-cron';
async function check(name: string, run: () => Promise<void>) {
  phase = name;
  console.log(`CHECK ${name}`);
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
async function verify() {
  const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
    testDatabaseUrl: process.env.R6_TEST_DATABASE_URL,
    configuredDatabaseUrl: process.env.DATABASE_URL,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  assertSafePostgresVerifierEnvironment({
    testDatabaseUrl,
    configuredDatabaseUrl: process.env.NEON_DATABASE_URL,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  const source = new URL(testDatabaseUrl);
  if (
    source.hostname !== '127.0.0.1' ||
    source.port !== '55440' ||
    source.pathname !== '/r5_full_scratch'
  )
    throw Error('OWNED_CRON_SOURCE_REQUIRED');
  const stem = `r6_cron_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    database = `${stem}_fresh`,
    populated = `${stem}_populated`,
    restored = `${stem}_restored`;
  const urlFor = (name: string) => {
    if (!/^r6_cron_[a-f0-9]{12}_(fresh|populated|restored)$/.test(name))
      throw Error('OWNED_CRON_TARGET_REQUIRED');
    const u = new URL(source);
    u.pathname = `/${name}`;
    return u;
  };
  const admin = new pg.Client({ connectionString: source.href });
  admin.on('error', () => undefined);
  await admin.connect();
  const sourceCounts = await admin.query(
    'SELECT count(*)::text AS n FROM merchants'
  );
  await admin.query(`CREATE DATABASE ${database} TEMPLATE r5_full_scratch`);
  await admin.query(`CREATE DATABASE ${populated} TEMPLATE r5_full_restore`);
  const popSourceUrl = new URL(source);
  popSourceUrl.pathname = '/r5_full_restore';
  const popSource = new pg.Client({ connectionString: popSourceUrl.href });
  await popSource.connect();
  const originalPopCounts = (
    await popSource.query(
      'SELECT (SELECT count(*) FROM merchants)::int AS merchants,(SELECT count(*) FROM invoices_rent_requests)::int+(SELECT count(*) FROM job_invoices)::int+(SELECT count(*) FROM quotes)::int AS links'
    )
  ).rows;
  await popSource.end();
  await admin.end();
  const client = new pg.Client({ connectionString: urlFor(database).href });
  client.on('error', () => undefined);
  await client.connect();
  const pop = new pg.Client({ connectionString: urlFor(populated).href });
  pop.on('error', () => undefined);
  await pop.connect();
  const poolA = new pg.Pool({
      connectionString: urlFor(database).href,
      max: 4,
      connectionTimeoutMillis: 3000,
    }),
    poolB = new pg.Pool({
      connectionString: urlFor(database).href,
      max: 4,
      connectionTimeoutMillis: 3000,
    });
  poolA.on('error', () => undefined);
  poolB.on('error', () => undefined);
  const leased: pg.PoolClient[] = [];
  const tracked: CronSqlPool = {
    connect: async () => {
      const c = await poolA.connect();
      leased.push(c);
      return c;
    },
  };
  const trackedB: CronSqlPool = {
    connect: async () => {
      const c = await poolB.connect();
      leased.push(c);
      return c;
    },
  };
  const repoA = new PostgresCronRepository(tracked),
    repoB = new PostgresCronRepository(trackedB);
  const reset = async () => {
    assert.equal(
      (await client.query('SELECT current_database() AS name')).rows[0].name,
      database
    );
    await client.query('TRUNCATE cron_jobs,cron_runs');
  };
  const acquire = async (repo = repoA) => {
    const claim = await repo.acquire();
    assert.equal(claim.kind, 'acquired');
    if (claim.kind !== 'acquired') throw Error('EXPECTED_CRON_LEASE');
    return claim.lease;
  };
  const seedHeld = async () => {
    const runId = randomUUID(),
      jobId = randomUUID();
    await client.query(
      `WITH t AS (SELECT clock_timestamp()-interval '1 hour' AS start)
   INSERT INTO cron_runs(id,owner,scheduled_for,attempt,state,started_at,heartbeat_at,lease_expires_at,deadline_at,finished_at,duration_ms)
   SELECT $1,$2,date_trunc('hour',start),1,'abandoned',start,start,start+interval '45 seconds',start+interval '240 seconds',start+interval '1 second',1000 FROM t`,
      [runId, randomUUID()]
    );
    await client.query(
      "INSERT INTO cron_jobs(id,run_id,name,state,started_at,finished_at,duration_ms,error_code) VALUES($1,$2,'dispatch','held',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'+interval '1 second',1000,'lease_expired')",
      [jobId, runId]
    );
    return { runId, jobId };
  };
  try {
    const expected = JSON.parse(
      await readFile(
        new URL(
          'docs/evidence/remediation-v2-2/r5/R5-through-0048c-fingerprint-2026-10-14.json',
          root
        ),
        'utf8'
      )
    ).digest;
    await check(
      'both owned R5 bases match the frozen catalog before forward migration',
      async () => {
        assert.equal(
          fingerprintDocument(await collectSchema(client)).digest,
          expected
        );
        assert.equal(
          fingerprintDocument(await collectSchema(pop)).digest,
          expected
        );
      }
    );
    let canonical: any;
    await check(
      'forward migration applies to scratch and populated clones without changing original sources',
      async () => {
        const sql = await readFile(
            new URL('migrations/0049a_durable_cron.sql', root),
            'utf8'
          ),
          digest = createHash('sha256').update(sql).digest('hex');
        let frozen: string | undefined;
        try {
          frozen = (
            await readFile(`${folder}/applied-0049a.sha256`, 'utf8')
          ).trim();
        } catch {}
        if (frozen && frozen !== digest)
          throw Error('APPLIED_MIGRATION_CHANGED');
        phase = 'apply forward migration on scratch';
        await ensureMigrationLedger(client);
        await applyMigration(client, '0049a_durable_cron.sql', sql);
        await mkdir(folder, { recursive: true });
        await writeFile(`${folder}/applied-0049a.sha256`, digest + '\n');
        phase = 'apply forward migration on populated clone';
        await ensureMigrationLedger(pop);
        await applyMigration(pop, '0049a_durable_cron.sql', sql);
        phase = 'compare scratch and populated catalogs';
        canonical = fingerprintDocument(await collectSchema(client));
        assert.equal(
          fingerprintDocument(await collectSchema(pop)).digest,
          canonical.digest
        );
        phase = 'verify forward baseline contract';
        const missing = await findMissingBaselineEffects(client, [
          '0049a_durable_cron.sql',
        ]);
        assert.equal(missing.length, 0);
        await writeFile(
          `${folder}/through-0049a-fingerprint.json`,
          JSON.stringify(canonical, null, 2) + '\n'
        );
      }
    );
    await check(
      'two independent PostgreSQL coordinators execute one job once and slot retry reuses durable completion',
      async () => {
        await reset();
        let effects = 0,
          release!: () => void,
          arrived!: () => void;
        const wait = new Promise<void>(r => {
            release = r;
          }),
          started = new Promise<void>(r => {
            arrived = r;
          });
        const a = new CronCoordinator(repoA).run([
          {
            name: 'generate',
            run: async () => {
              effects++;
              arrived();
              await wait;
              return { generated: 1 };
            },
          },
        ]);
        await started;
        const b = await new CronCoordinator(repoB).run([
          {
            name: 'generate',
            run: async () => {
              effects++;
              return { generated: 1 };
            },
          },
        ]);
        assert.deepEqual(b, { kind: 'busy' });
        release();
        assert.equal((await a).kind, 'completed');
        const retry = await new CronCoordinator(repoB).run([
          {
            name: 'generate',
            run: async () => {
              effects++;
              return { generated: 1 };
            },
          },
        ]);
        assert.equal(retry.kind, 'completed');
        if (retry.kind === 'completed') assert.equal(retry.duplicate, true);
        assert.equal(effects, 1);
        assert.equal(
          (await client.query('SELECT count(*)::int AS n FROM cron_runs'))
            .rows[0].n,
          1
        );
        assert.equal(
          (await client.query('SELECT count(*)::int AS n FROM cron_jobs'))
            .rows[0].n,
          1
        );
      }
    );
    await check(
      'transaction pooling changes backend every transaction without weakening ownership',
      async () => {
        await reset();
        let sequence = 0;
        const backends = new Set<number>();
        const switched: CronSqlPool = {
          connect: async () => {
            let connection: pg.PoolClient | undefined;
            return {
              query: async (text: string, values?: any[]) => {
                if (text.startsWith('BEGIN')) {
                  assert.equal(connection, undefined);
                  connection = await [poolA, poolB][sequence++ % 2].connect();
                  backends.add(
                    (connection as unknown as { processID: number }).processID
                  );
                }
                if (!connection) throw Error('SQL_OUTSIDE_TRANSACTION');
                const result = await connection.query(text, values);
                if (text === 'COMMIT' || text === 'ROLLBACK') {
                  connection.release();
                  connection = undefined;
                }
                return { rows: result.rows, rowCount: result.rowCount };
              },
              release: () => {
                if (connection) {
                  connection.release(true);
                  connection = undefined;
                  throw Error('UNCLOSED_TRANSACTION');
                }
              },
            };
          },
        };
        const repo = new PostgresCronRepository(switched);
        let effects = 0;
        const result = await new CronCoordinator(repo).run([
          {
            name: 'subscriptionBilling',
            run: async () => {
              effects++;
              return { charged: 1 };
            },
          },
          {
            name: 'generate',
            run: async () => {
              effects++;
              return { generated: 1 };
            },
          },
        ]);
        assert.equal(result.kind, 'completed');
        if (result.kind === 'completed') assert.equal(result.ok, true);
        assert.equal(effects, 2);
        assert.ok(backends.size >= 2);
        assert.equal(
          ((await repo.status()) as any).alerts.schedulerStale,
          false
        );
      }
    );
    await check(
      'one unsafe fault is held while later jobs persist their success and duplicate retry sends nothing',
      async () => {
        await reset();
        let later = 0;
        const result = await new CronCoordinator(repoA).run([
          {
            name: 'dispatch',
            run: async () => {
              throw Error('private-provider-fault');
            },
          },
          {
            name: 'overdue',
            run: async () => {
              later++;
              return { markedOverdue: 1 };
            },
          },
        ]);
        assert.equal(result.kind, 'completed');
        if (result.kind === 'completed') {
          assert.equal(result.ok, false);
          assert.deepEqual(result.failedPasses, ['dispatch']);
        }
        assert.equal(later, 1);
        assert.deepEqual(
          (await client.query('SELECT name,state FROM cron_jobs ORDER BY name'))
            .rows,
          [
            { name: 'dispatch', state: 'held' },
            { name: 'overdue', state: 'succeeded' },
          ]
        );
        assert.ok(!JSON.stringify(result).includes('private-'));
      }
    );
    await check(
      'expired takeover skips completed work, holds unfinished work and fences a still-alive old owner',
      async () => {
        await reset();
        const old = await acquire();
        const done = randomUUID(),
          unknown = randomUUID();
        await old.startJob('generate', done);
        assert.equal(
          await old.finishJob(done, 'succeeded', { generated: 1 }, null),
          true
        );
        await old.startJob('dispatch', unknown);
        assert.deepEqual(await repoB.acquire(), { kind: 'busy' });
        await client.query(
          'UPDATE cron_runs SET lease_expires_at=started_at WHERE id=$1',
          [old.run.id]
        );
        const next = await acquire(repoB);
        assert.equal(next.run.attempt, 2);
        assert.deepEqual(await next.startJob('generate', randomUUID()), {
          kind: 'completed',
          metrics: { generated: 1 },
        });
        assert.deepEqual(await next.startJob('dispatch', randomUUID()), {
          kind: 'held',
        });
        assert.equal(
          await old.finishJob(unknown, 'succeeded', { dispatched: 1 }, null),
          false
        );
        assert.equal(await old.heartbeat(), false);
        assert.equal(
          (
            await client.query('SELECT state FROM cron_jobs WHERE id=$1', [
              unknown,
            ])
          ).rows[0].state,
          'held'
        );
        assert.equal(await next.finish(false), true);
        await next.close();
        await old.close();
      }
    );
    await check(
      'reviewed replay-safe billing recovery retries without releasing unsafe holds',
      async () => {
        await reset();
        const old = await acquire(),
          jobId = randomUUID();
        await old.startJob('subscriptionBilling', jobId);
        await client.query(
          'UPDATE cron_runs SET lease_expires_at=started_at WHERE id=$1',
          [old.run.id]
        );
        const next = await acquire(repoB),
          newId = randomUUID();
        assert.deepEqual(await next.startJob('subscriptionBilling', newId), {
          kind: 'started',
          id: newId,
        });
        assert.equal(
          (
            await client.query('SELECT state FROM cron_jobs WHERE id=$1', [
              jobId,
            ])
          ).rows[0].state,
          'failed'
        );
        assert.equal(
          await old.finishJob(jobId, 'succeeded', { charged: 1 }, null),
          false
        );
        assert.equal(
          await next.finishJob(newId, 'succeeded', { charged: 1 }, null),
          true
        );
        assert.equal(await next.finish(true), true);
        await next.close();
        await old.close();
      }
    );
    await check(
      'actual backend disconnect retains unfinished history across a fresh connection',
      async () => {
        await reset();
        const old = await acquire(),
          jobId = randomUUID();
        await old.startJob('reminders', jobId);
        const pid = (leased.at(-1) as unknown as { processID: number })
          .processID;
        assert.ok(Number.isInteger(pid) && pid > 0);
        let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
        const disconnected = new Promise<boolean>(resolve => {
          disconnectTimer = setTimeout(() => resolve(false), 2000);
          poolA.once('error', () => resolve(true));
        });
        assert.equal(
          (
            await client.query(
              'SELECT pg_terminate_backend(pid) AS ended FROM pg_stat_activity WHERE pid=$1 AND datname=$2',
              [pid, database]
            )
          ).rows[0].ended,
          true
        );
        assert.equal(await disconnected, true);
        if (disconnectTimer) clearTimeout(disconnectTimer);
        assert.equal(await old.heartbeat(), true);
        assert.deepEqual(await repoB.acquire(), { kind: 'busy' });
        await client.query(
          'UPDATE cron_runs SET lease_expires_at=started_at WHERE id=$1',
          [old.run.id]
        );
        const next = await acquire(repoB);
        assert.equal(
          (
            await client.query('SELECT state FROM cron_runs WHERE id=$1', [
              old.run.id,
            ])
          ).rows[0].state,
          'abandoned'
        );
        assert.deepEqual(await next.startJob('reminders', randomUUID()), {
          kind: 'held',
        });
        assert.equal(
          await old.finishJob(jobId, 'succeeded', { sent: 1 }, null),
          false
        );
        await next.finish(false);
        await next.close();
        await old.close().catch(() => undefined);
      }
    );
    await check(
      'later slots never bypass a held job, and an unrelated job still progresses',
      async () => {
        await reset();
        await seedHeld();
        let sent = 0,
          other = 0;
        const result = await new CronCoordinator(repoA).run([
          {
            name: 'dispatch',
            run: async () => {
              sent++;
              return { dispatched: 1 };
            },
          },
          {
            name: 'generate',
            run: async () => {
              other++;
              return { generated: 1 };
            },
          },
        ]);
        assert.equal(sent, 0);
        assert.equal(other, 1);
        assert.equal(result.kind, 'completed');
        assert.equal(((await repoB.status()) as any).counts.heldJobs, 1);
      }
    );
    await check(
      'only exact reviewed hold resolution permits a later safe retry',
      async () => {
        await reset();
        const held = await seedHeld(),
          reviewDigest = 'a'.repeat(64);
        assert.equal(
          await repoA.resolveHeld({
            ...held,
            runId: randomUUID(),
            resolution: 'verified_safe_retry',
            reviewDigest,
          }),
          false
        );
        await assert.rejects(
          repoA.resolveHeld({
            ...held,
            resolution: 'verified_safe_retry',
            reviewDigest: 'invalid',
          })
        );
        const live = await acquire();
        assert.equal(
          await repoB.resolveHeld({
            ...held,
            resolution: 'verified_safe_retry',
            reviewDigest,
          }),
          false
        );
        await live.abandon();
        await live.close();
        const args = [
          `--expected-host=${source.hostname}`,
          `--expected-port=${source.port}`,
          `--expected-database=${database}`,
          `--run-id=${held.runId}`,
          `--job-id=${held.jobId}`,
          '--resolution=verified_safe_retry',
          `--review-digest=${reviewDigest}`,
        ];
        const dry = spawnSync(
          process.execPath,
          ['--import', 'tsx', 'scripts/r6-cron-resolve.ts', ...args],
          {
            cwd: new URL('../', import.meta.url),
            env: {
              PATH: process.env.PATH,
              R6_CRON_DATABASE_URL: urlFor(database).href,
            },
            encoding: 'utf8',
            timeout: 15000,
          }
        );
        assert.equal(dry.status, 0);
        assert.equal(JSON.parse(dry.stdout).mode, 'dry-run');
        assert.equal(JSON.parse(dry.stdout).held, true);
        assert.equal(
          (
            await client.query('SELECT state FROM cron_jobs WHERE id=$1', [
              held.jobId,
            ])
          ).rows[0].state,
          'held'
        );
        assert.deepEqual(
          await runCronResolution(
            [...args, '--execute=true', '--acknowledge-inflight-stopped=true'],
            { R6_CRON_DATABASE_URL: urlFor(database).href }
          ),
          { mode: 'execute', resolved: true }
        );
        let sent = 0;
        await new CronCoordinator(repoA).run([
          {
            name: 'dispatch',
            run: async () => {
              sent++;
              return { dispatched: 1 };
            },
          },
        ]);
        assert.equal(sent, 1);
        assert.deepEqual(
          (
            await client.query(
              'SELECT state,review_digest FROM cron_jobs WHERE id=$1',
              [held.jobId]
            )
          ).rows[0],
          { state: 'resolved_retry', review_digest: reviewDigest }
        );
      }
    );
    await check(
      'history constraints reject raw payloads, invalid counts, missing finish evidence and rewritten identities',
      async () => {
        await reset();
        const lease = await acquire(),
          id = randomUUID();
        await lease.startJob('dispatch', id);
        for (const metrics of [
          { body: 'private-marker' },
          { generated: -1 },
          { errors: 0.5 },
          { scannerAvailable: 1 },
        ])
          await assert.rejects(
            client.query('UPDATE cron_jobs SET metrics=$2::jsonb WHERE id=$1', [
              id,
              JSON.stringify(metrics),
            ]),
            (e: any) => e.code === '23514'
          );
        await assert.rejects(
          client.query(
            "UPDATE cron_jobs SET state='succeeded',finished_at=clock_timestamp(),duration_ms=NULL WHERE id=$1",
            [id]
          ),
          (e: any) => e.code === '23514'
        );
        await assert.rejects(
          client.query('UPDATE cron_runs SET owner=$2 WHERE id=$1', [
            lease.run.id,
            randomUUID(),
          ]),
          (e: any) => e.code === '23514'
        );
        await assert.rejects(
          client.query('DELETE FROM cron_jobs WHERE id=$1', [id]),
          (e: any) => e.code === '23514'
        );
        await lease.abandon();
        await lease.close();
      }
    );
    await check(
      'authenticated-ops data distinguishes fresh, stale, aged reconciliation, stuck billing and dead letters',
      async () => {
        await reset();
        assert.equal(
          ((await repoA.status()) as any).alerts.schedulerStale,
          true
        );
        await new CronCoordinator(repoA).run([
          { name: 'overdue', run: async () => ({ markedOverdue: 0 }) },
        ]);
        assert.equal(
          ((await repoB.status()) as any).alerts.schedulerStale,
          false
        );
        await client.query(
          "INSERT INTO payment_notification_inbox(provider,kind,session_id,status,first_received_at,last_received_at,next_attempt_at) VALUES('windcave','poll','synthetic-aged-inbox','pending',clock_timestamp()-interval '11 minutes',clock_timestamp(),clock_timestamp()),('windcave','fprn','synthetic-dead-inbox','dead_letter',clock_timestamp(),clock_timestamp(),clock_timestamp())"
        );
        const merchant = (
          await client.query(
            "INSERT INTO merchants(name,business_name,email) VALUES('Synthetic R6','Synthetic R6',$1) RETURNING id",
            [`${randomUUID()}@synthetic.test`]
          )
        ).rows[0].id;
        await client.query(
          "INSERT INTO merchant_subscriptions(merchant_id,status,billing_claim_token,billing_claimed_at) VALUES($1,'active','synthetic-claim',(clock_timestamp() AT TIME ZONE 'UTC')-interval '11 minutes')",
          [merchant]
        );
        const status = (await repoB.status()) as any;
        assert.equal(status.alerts.reconciliationAged, true);
        assert.equal(status.alerts.deadLettersPresent, true);
        assert.equal(status.alerts.stuckBilling, true);
        assert.equal(status.counts.deadLetters, 1);
        assert.ok(!JSON.stringify(status).includes('synthetic-'));
      }
    );
    await check(
      'scheduler freshness becomes stale after two intervals and recovers after a committed run',
      async () => {
        await reset();
        await client.query(
          `WITH t AS (SELECT clock_timestamp()-interval '12 minutes' AS start)
       INSERT INTO cron_runs(id,owner,scheduled_for,attempt,state,started_at,heartbeat_at,lease_expires_at,deadline_at,finished_at,duration_ms)
       SELECT $1,$2,date_trunc('hour',start)-interval '1 hour',1,'succeeded',start,start,start+interval '45 seconds',start+interval '240 seconds',start+interval '1 second',1000 FROM t`,
          [randomUUID(), randomUUID()]
        );
        const old = (await repoA.status()) as any;
        assert.equal(old.alerts.schedulerStale, true);
        assert.ok(old.lastSuccessfulAt);
        const result = await new CronCoordinator(repoB).run([
          { name: 'overdue', run: async () => ({ markedOverdue: 0 }) },
        ]);
        assert.equal(result.kind, 'completed');
        assert.equal(
          ((await repoA.status()) as any).alerts.schedulerStale,
          false
        );
      }
    );
    await check(
      'logical restore of the populated target preserves strict catalog fingerprint and existing link counts',
      async () => {
        const bin =
            '/workspace/.onboarding/r3-postgres/root/usr/lib/postgresql/17/bin',
          dump = `${folder}/${stem}.dump`;
        await writeFile(dump, '', { mode: 0o600, flag: 'wx' });
        const pgEnv = {
          PATH: process.env.PATH,
          PGHOST: source.hostname,
          PGPORT: source.port,
          PGUSER: decodeURIComponent(source.username),
          PGPASSWORD: decodeURIComponent(source.password),
          PGPASSFILE: '/dev/null',
          PGSERVICEFILE: '/dev/null',
          PGCONNECT_TIMEOUT: '5',
        };
        let child = spawnSync(
          `${bin}/pg_dump`,
          ['--format=custom', '--file', dump, populated],
          { env: pgEnv, stdio: 'pipe', timeout: 60000 }
        );
        assert.equal(child.status, 0);
        await chmod(dump, 0o600);
        const a = new pg.Client({ connectionString: source.href });
        await a.connect();
        try {
          await a.query(`CREATE DATABASE ${restored}`);
        } finally {
          await a.end();
        }
        child = spawnSync(
          `${bin}/pg_restore`,
          ['--exit-on-error', '--dbname', restored, dump],
          { env: pgEnv, stdio: 'pipe', timeout: 60000 }
        );
        assert.equal(child.status, 0);
        const r = new pg.Client({ connectionString: urlFor(restored).href });
        await r.connect();
        try {
          assert.equal(
            fingerprintDocument(await collectSchema(r)).digest,
            canonical.digest
          );
          assert.deepEqual(
            (
              await r.query(
                'SELECT (SELECT count(*) FROM invoices_rent_requests)::int+(SELECT count(*) FROM job_invoices)::int+(SELECT count(*) FROM quotes)::int AS n'
              )
            ).rows,
            (
              await pop.query(
                'SELECT (SELECT count(*) FROM invoices_rent_requests)::int+(SELECT count(*) FROM job_invoices)::int+(SELECT count(*) FROM quotes)::int AS n'
              )
            ).rows
          );
        } finally {
          await r.end();
        }
      }
    );
    await check(
      'original sources retain their policies, counts and old schema',
      async () => {
        const c = new pg.Client({ connectionString: source.href });
        await c.connect();
        try {
          assert.deepEqual(
            (await c.query('SELECT count(*)::text AS n FROM merchants')).rows,
            sourceCounts.rows
          );
          assert.equal(
            (
              await c.query(
                "SELECT to_regclass('public.cron_runs')::text AS name"
              )
            ).rows[0].name,
            null
          );
          assert.deepEqual(
            (
              await c.query(
                'SELECT stage,active_secret_stage,credential_policy FROM data_encryption_control'
              )
            ).rows[0],
            {
              stage: 'legacy',
              active_secret_stage: 'legacy',
              credential_policy: 'unselected',
            }
          );
        } finally {
          await c.end();
        }
      }
    );
    const originalPop = new pg.Client({ connectionString: popSourceUrl.href });
    await originalPop.connect();
    try {
      assert.deepEqual(
        (
          await originalPop.query(
            'SELECT (SELECT count(*) FROM merchants)::int AS merchants,(SELECT count(*) FROM invoices_rent_requests)::int+(SELECT count(*) FROM job_invoices)::int+(SELECT count(*) FROM quotes)::int AS links'
          )
        ).rows,
        originalPopCounts
      );
      assert.equal(
        (
          await originalPop.query(
            "SELECT to_regclass('public.cron_runs')::text AS name"
          )
        ).rows[0].name,
        null
      );
    } finally {
      await originalPop.end();
    }
    console.log(
      JSON.stringify({
        checks,
        providerCalls: 0,
        sharedDatabaseMutations: 0,
        fingerprint: canonical.digest,
        ownedTargets: [database, populated, restored],
      })
    );
  } finally {
    for (const c of leased)
      try {
        c.release(true);
      } catch {}
    await poolA.end();
    await poolB.end();
    await client.end();
    await pop.end();
  }
}
try {
  await verify();
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'R6_CRON_POSTGRES_FAILED',
      phase,
      ...safeErrorSummary(error),
    })
  );
  process.exitCode = 1;
}
