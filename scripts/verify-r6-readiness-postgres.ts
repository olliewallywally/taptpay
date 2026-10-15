/** Explicit owned local clones only. No provider action or shared/live mutation. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ApplicationHealth } from '../server/application-health';
import {
  SchemaReadinessMonitor,
  verifyReadinessSchema,
  READINESS_SCHEMA_DIGEST,
} from '../server/schema-readiness';
import {
  applyMigration,
  ensureMigrationLedger,
  baselineMigrations,
} from '../server/migrate';
import { safeErrorSummary } from '../server/log-redaction';
// @ts-expect-error Standalone verifier safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
// @ts-expect-error Canonical standalone metadata collector.
import { collectSchema, fingerprintDocument } from './schema-fingerprint.mjs';
let phase = 'guard',
  checks = 0;
async function check(name: string, run: () => Promise<void>) {
  phase = name;
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
    throw Error('OWNED_READINESS_SOURCE_REQUIRED');
  const name = `r6_ready_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  if (!/^r6_ready_[a-f0-9]{12}$/.test(name))
    throw Error('OWNED_READINESS_TARGET_REQUIRED');
  const target = new URL(source);
  target.pathname = '/' + name;
  const admin = new pg.Client({
    connectionString: source.href,
    connectionTimeoutMillis: 2000,
    query_timeout: 3000,
  });
  admin.on('error', () => undefined);
  let pool: pg.Pool | undefined, probe: pg.Pool | undefined;
  try {
    phase = 'source_connect';
    await admin.connect();
    phase = 'source_fingerprint';
    const base = JSON.parse(
      await readFile(
        new URL(
          '../docs/evidence/remediation-v2-2/r5/R5-through-0048c-fingerprint-2026-10-14.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    const before = fingerprintDocument(await collectSchema(admin));
    assert.equal(before.digest, base.digest);
    const countsBefore = (
      await admin.query(
        'SELECT (SELECT count(*)::int FROM merchants) AS merchants,(SELECT count(*)::int FROM transactions) AS transactions'
      )
    ).rows;
    phase = 'owned_clone';
    await admin.query(`CREATE DATABASE ${name} TEMPLATE r5_full_scratch`);
    pool = new pg.Pool({
      connectionString: target.href,
      max: 2,
      connectionTimeoutMillis: 1500,
      query_timeout: 1000,
    });
    pool.on('error', () => undefined);
    const client = await pool.connect();
    try {
      const migration = '0049a_durable_cron.sql',
        bytes = await readFile(
          new URL('../migrations/' + migration, import.meta.url)
        );
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        '8b3aefa3997197b75345f726a9a05f62dcb0e8c5472c262f9326d81647760dfc'
      );
      phase = 'forward_migration';
      await ensureMigrationLedger(client);
      await applyMigration(client, migration, bytes.toString('utf8'));
      const d9='0049b_subscription_entitlements.sql',d9Bytes=await readFile(new URL('../migrations/'+d9,import.meta.url));
      assert.equal(createHash('sha256').update(d9Bytes).digest('hex'),'e8d4303ab2463f9e8aa9d2cfd95d0e8383e5e8cb61eaf9253cb1e6afbab157dc');
      await applyMigration(client,d9,d9Bytes.toString('utf8'));
      // This clone has independently verified canonical effects, but the R5
      // source did not carry historical ledger rows. Baseline only this clone,
      // using the normal complete effect verifier, without replaying old SQL.
      phase = 'owned_clone_baseline';
      await baselineMigrations(client, {
        confirm: true,
        force: true,
        log: () => undefined,
      });
    } finally {
      client.release();
    }
    const db = pool;
    await check('canonical_schema_and_complete_ledger', async () =>
      assert.equal(await verifyReadinessSchema(db), true)
    );
    await check('metadata_snapshot_is_read_only', async () => {
      let observed = false;
      assert.equal(
        await verifyReadinessSchema({
          connect: async () => {
            const c = await db.connect();
            return {
              query: async <Row = unknown>(sql: string, params?: unknown[]) => {
                if (sql.includes('SELECT filename, checksum')) {
                  assert.equal(
                    (await c.query('SHOW transaction_read_only')).rows[0]
                      .transaction_read_only,
                    'on'
                  );
                  observed = true;
                }
                return { rows: (await c.query(sql, params)).rows as Row[] };
              },
              release: (destroy?: boolean) => c.release(destroy),
            };
          },
        }),
        true
      );
      assert.equal(observed, true);
    });
    const monitor = new SchemaReadinessMonitor(() => verifyReadinessSchema(db));
    probe = new pg.Pool({
      connectionString: target.href,
      max: 1,
      connectionTimeoutMillis: 1000,
      query_timeout: 1000,
    });
    probe.on('error', () => undefined);
    const health = new ApplicationHealth({
      configValid: true,
      schemaValid: () => monitor.valid(),
      cacheMs: 0,
      database: async () =>
        (await probe!.query('SELECT 1 AS ready')).rows[0].ready === 1,
    });
    await check('startup_and_valid_readiness', async () => {
      assert.equal(await health.ready(), false);
      assert.equal(await monitor.refresh(), true);
      health.completeBoot();
      assert.equal(await health.ready(), true);
    });
    await check('schema_drift_refuses_and_recovers', async () => {
      await db.query(
        'ALTER TABLE public.cron_runs ADD COLUMN r6_readiness_probe boolean'
      );
      try {
        assert.equal(await monitor.refresh(), false);
        assert.equal(await health.ready(), false);
      } finally {
        await db.query(
          'ALTER TABLE public.cron_runs DROP COLUMN r6_readiness_probe'
        );
      }
      assert.equal(await monitor.refresh(), true);
      assert.equal(await health.ready(), true);
    });
    await check('ledger_checksum_drift_refuses_and_recovers', async () => {
      const row = (
        await db.query(
          'SELECT filename,checksum FROM drizzle.applied_migrations ORDER BY filename LIMIT 1'
        )
      ).rows[0];
      await db.query(
        'UPDATE drizzle.applied_migrations SET checksum=$1 WHERE filename=$2',
        ['0'.repeat(64), row.filename]
      );
      try {
        assert.equal(await monitor.refresh(), false);
        assert.equal(await health.ready(), false);
      } finally {
        await db.query(
          'UPDATE drizzle.applied_migrations SET checksum=$1 WHERE filename=$2',
          [row.checksum, row.filename]
        );
      }
      assert.equal(await monitor.refresh(), true);
      assert.equal(await health.ready(), true);
    });
    await check(
      'actual_closed_connection_pool_refuses_and_recovers',
      async () => {
        await probe!.end();
        assert.equal(await health.ready(), false);
        probe = new pg.Pool({
          connectionString: target.href,
          max: 1,
          connectionTimeoutMillis: 1000,
          query_timeout: 1000,
        });
        probe.on('error', () => undefined);
        assert.equal(await health.ready(), true);
      }
    );
    await check('draining_never_becomes_ready', async () => {
      health.beginDrain();
      health.completeBoot();
      assert.equal(await health.ready(), false);
    });
    await check('final_schema_and_original_source_preserved', async () => {
      const c = await db.connect();
      try {
        assert.equal(
          fingerprintDocument(await collectSchema(c)).digest,
          READINESS_SCHEMA_DIGEST
        );
      } finally {
        c.release();
      }
      assert.equal(
        fingerprintDocument(await collectSchema(admin)).digest,
        before.digest
      );
      assert.deepEqual(
        (
          await admin.query(
            'SELECT (SELECT count(*)::int FROM merchants) AS merchants,(SELECT count(*)::int FROM transactions) AS transactions'
          )
        ).rows,
        countsBefore
      );
    });
    monitor.stop();
    await monitor.drain();
    console.log(
      JSON.stringify({
        checks,
        providerCalls: 0,
        sharedDatabaseMutations: 0,
        ownedTarget: name,
        sourceUnchanged: true,
        fingerprint: READINESS_SCHEMA_DIGEST,
      })
    );
  } finally {
    await Promise.allSettled([probe?.end(), pool?.end()]);
    await admin.end();
  }
}
verify().catch(error => {
  console.error(
    JSON.stringify({
      error: 'R6_READINESS_VERIFIER_FAILED',
      phase,
      ...safeErrorSummary(error),
    })
  );
  process.exitCode = 1;
});
