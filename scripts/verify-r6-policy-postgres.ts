/** Owned local synthetic clones only. Injected billing provider; no network calls. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import { inventoryEntitlements } from '../server/entitlement-inventory';
import { operateEntitlements } from '../server/entitlement-operations';
import { billingCardIsReady } from '../server/billing-card';
import {
  applyMigration,
  ensureMigrationLedger,
  baselineMigrations,
} from '../server/migrate';
import { findMissingBaselineEffects } from '../server/migration-baseline-contract';
import { runEntitlementOperation } from './r6-entitlement-policy';
// @ts-expect-error Existing standalone verifier safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
// @ts-expect-error Canonical standalone catalog collector.
import * as fingerprint from './schema-fingerprint.mjs';
const { collectSchema, fingerprintDocument, serialise } = fingerprint;
let phase = 'guard',
  checks = 0;
const folder = '/tmp/taptpay-r6-d9',
  review = 'a'.repeat(64),
  empty = { version: 1, periods: [], revocations: [] };
async function check(name: string, run: () => Promise<void>) {
  phase = name;
  await run();
  checks++;
  console.log('PASS ' + name);
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
    throw Error('R6_OWNED_SOURCE_REQUIRED');
  const database = 'r6_policy_' + randomUUID().replace(/-/g, '').slice(0, 12),
    restored = database + '_restore',
    target = { host: source.hostname, port: 55440, database };
  const url = new URL(source);
  url.pathname = '/' + database;
  const admin = new pg.Client({ connectionString: source.href });
  await admin.connect();
  const before = fingerprintDocument(await collectSchema(admin));
  const base = JSON.parse(
    await readFile(
      'docs/evidence/remediation-v2-2/r5/R5-through-0048c-fingerprint-2026-10-14.json',
      'utf8'
    )
  );
  assert.equal(before.digest, base.digest);
  const sourceCounts = (
    await admin.query(
      'SELECT (SELECT count(*)::int FROM merchants) AS merchants,(SELECT count(*)::int FROM transactions) AS transactions'
    )
  ).rows;
  await admin.query(`CREATE DATABASE ${database} TEMPLATE r5_full_scratch`);
  const pool = new pg.Pool({ connectionString: url.href, max: 4 }),
    client = await pool.connect();
  try {
    await check(
      'forward migration is empty-history and preserves legacy gate',
      async () => {
        await ensureMigrationLedger(client);
        const old = await readFile('migrations/0049a_durable_cron.sql');
        assert.equal(
          createHash('sha256').update(old).digest('hex'),
          '8b3aefa3997197b75345f726a9a05f62dcb0e8c5472c262f9326d81647760dfc'
        );
        for (const migration of [
          '0049a_durable_cron.sql',
          '0049b_subscription_entitlements.sql',
        ])
          await applyMigration(
            client,
            migration,
            await readFile('migrations/' + migration, 'utf8')
          );
        assert.equal(
          (
            await client.query(
              'SELECT stage FROM subscription_entitlement_control'
            )
          ).rows[0].stage,
          'legacy'
        );
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlements'
            )
          ).rows[0].n,
          0
        );
        const bytes = await readFile(
          'migrations/0049b_subscription_entitlements.sql'
        );
        await writeFile(
          folder + '/applied-0049b.sha256',
          createHash('sha256').update(bytes).digest('hex') + '\n'
        );
        await baselineMigrations(client, {
          confirm: true,
          force: true,
          log: () => undefined,
        });
      }
    );
    await import('../server/__tests__/support/test-env');
    const { DatabaseStorage } = await import('../server/storage'),
      { DurableSubscriptionBilling } = await import(
        '../server/durable-subscription-billing'
      );
    const storage = new DatabaseStorage(drizzle(pool, { schema }) as any),
      now = new Date(),
      start = new Date(now.getTime() - 86400000),
      end = new Date(now.getTime() + 20 * 86400000);
    async function fixture(status = 'active', paid = false) {
      const mid = (
        await client.query(
          "INSERT INTO merchants(name,business_name,email) VALUES('R6 policy','R6 policy',$1) RETURNING id",
          [randomUUID() + '@synthetic.test']
        )
      ).rows[0].id;
      return (
        await client.query(
          "INSERT INTO merchant_subscriptions(merchant_id,status,current_period_start,current_period_end,last_billing_date,next_billing_date,windcave_card_id) VALUES($1,$2,$3,$4,$5,$6,'synthetic-card') RETURNING *",
          [
            mid,
            status,
            start,
            end,
            paid ? start.toISOString() : null,
            status === 'pending' ? now : end,
          ]
        )
      ).rows[0];
    }
    const grant = await fixture(),
      paid = await fixture('active', true);
    const manifest = {
      version: 1,
      periods: [
        {
          subscriptionId: grant.id,
          merchantId: grant.merchant_id,
          source: 'migration_grant',
          start: start.toISOString(),
          end: end.toISOString(),
        },
      ],
      revocations: [],
    };
    await check(
      'unclassified paid/grant claims refuse activation without changing policy',
      async () => {
        const report = await inventoryEntitlements(client, target);
        assert.equal(report.currentGate.allowed, 1);
        assert.equal(report.proposedGate.newlyBlocked, 1);
        assert.equal(report.unclassifiedCurrent, 2);
        await assert.rejects(
          operateEntitlements(client, target, empty, {
            action: 'activate',
            reviewDigest: review,
            execute: true,
            acknowledgeReleaseChecks: true,
          })
        );
        assert.equal(
          (
            await client.query(
              'SELECT stage FROM subscription_entitlement_control'
            )
          ).rows[0].stage,
          'legacy'
        );
      }
    );
    await check(
      'classification dry-run is physically READ ONLY and never inserts',
      async () => {
        let observed = false;
        const checked = {
          query: async (q: string, v?: unknown[]) => {
            if (q.includes('SELECT current_period_start')) {
              observed = true;
              assert.equal(
                (await client.query('SHOW transaction_read_only')).rows[0]
                  .transaction_read_only,
                'on'
              );
            }
            return client.query(q, v);
          },
        };
        const result = await operateEntitlements(checked, target, manifest, {
          action: 'classify',
          reviewDigest: review,
        });
        assert.equal(result.periods, 1);
        assert.equal(observed, true);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlements'
            )
          ).rows[0].n,
          0
        );
      }
    );
    await check(
      'reviewed grant is idempotent and never changes billing history',
      async () => {
        const a = await operateEntitlements(client, target, manifest, {
          action: 'classify',
          reviewDigest: review,
          execute: true,
        });
        assert.equal(a.periods, 1);
        assert.equal(
          (
            await operateEntitlements(client, target, manifest, {
              action: 'classify',
              reviewDigest: review,
              execute: true,
            })
          ).unchanged,
          1
        );
        assert.equal(
          (
            await client.query(
              'SELECT last_billing_date FROM merchant_subscriptions WHERE id=$1',
              [grant.id]
            )
          ).rows[0].last_billing_date,
          null
        );
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_billing_history'
            )
          ).rows[0].n,
          0
        );
      }
    );
    await check(
      'cross-tenant, invalid paid source and immutable history are rejected by PostgreSQL',
      async () => {
        await assert.rejects(
          client.query("UPDATE subscription_entitlements SET source='trial'"),
          (e: any) => e.code === '23514'
        );
        await assert.rejects(
          client.query('DELETE FROM subscription_entitlements'),
          (e: any) => e.code === '23514'
        );
        await assert.rejects(
          client.query(
            "INSERT INTO subscription_entitlements(subscription_id,merchant_id,source,source_key,period_start,period_end,review_digest) VALUES($1,$2,'migration_grant','bad-tenant',$3,$4,$5)",
            [grant.id, paid.merchant_id, start, end, review]
          ),
          (e: any) => e.code === '23503'
        );
        await assert.rejects(
          client.query(
            "INSERT INTO subscription_entitlements(subscription_id,merchant_id,source,source_key,period_start,period_end,billing_history_id,review_digest) VALUES($1,$2,'paid','bad-paid',$3,$4,999999,$5)",
            [paid.id, paid.merchant_id, start, end, review]
          ),
          (e: any) => e.code === '23514'
        );
      }
    );
    const history = (
      await client.query(
        "INSERT INTO subscription_billing_history(merchant_id,subscription_id,billing_type,amount,billing_period_start,billing_period_end,windcave_transaction_id,status,paid_at) VALUES($1,$2,'monthly_subscription','7.99',$3,$4,'synthetic-historical-payment','succeeded',$3) RETURNING id",
        [paid.merchant_id, paid.id, start, end]
      )
    ).rows[0].id;
    await check(
      'historical paid classification binds exact tenant, source and period',
      async () => {
        const p = {
          subscriptionId: paid.id,
          merchantId: paid.merchant_id,
          source: 'paid',
          start: start.toISOString(),
          end: end.toISOString(),
          billingHistoryId: history,
        };
        await assert.rejects(
          operateEntitlements(
            client,
            target,
            {
              version: 1,
              periods: [{ ...p, merchantId: grant.merchant_id }],
              revocations: [],
            },
            { action: 'classify', reviewDigest: review, execute: true }
          )
        );
        await operateEntitlements(
          client,
          target,
          { version: 1, periods: [p], revocations: [] },
          { action: 'classify', reviewDigest: review, execute: true }
        );
      }
    );
    await check(
      'single-statement application projection changes only after guarded activation',
      async () => {
        assert.equal(
          billingCardIsReady(await storage.getSubscription(grant.merchant_id)),
          false
        );
        const result = await operateEntitlements(client, target, empty, {
          action: 'activate',
          reviewDigest: review,
          execute: true,
          acknowledgeReleaseChecks: true,
        });
        assert.equal(result.stage, 'enforced');
        assert.equal(
          billingCardIsReady(await storage.getSubscription(grant.merchant_id)),
          true
        );
        for (const status of ['past_due', 'suspended']) {
          await client.query(
            'UPDATE merchant_subscriptions SET status=$2,failed_payment_count=4 WHERE id=$1',
            [grant.id, status]
          );
          assert.equal(
            billingCardIsReady(
              await storage.getSubscription(grant.merchant_id)
            ),
            true
          );
        }
        assert.equal(
          billingCardIsReady(await storage.getSubscription(paid.merchant_id)),
          true
        );
      }
    );
    await check(
      'get-or-create projects enforced policy and public DTO omits internal provenance',
      async () => {
        const mid = (
          await client.query(
            "INSERT INTO merchants(name,business_name,email) VALUES('R6 fresh','R6 fresh',$1) RETURNING id",
            [randomUUID() + '@synthetic.test']
          )
        ).rows[0].id;
        const created = await storage.getOrCreateSubscription(mid);
        assert.equal((created as any).entitlement.stage, 'enforced');
        assert.equal(billingCardIsReady(created), false);
        assert.equal(
          billingCardIsReady(
            await storage.getOrCreateSubscription(grant.merchant_id)
          ),
          true
        );
        const { subscriptionDto } = await import('../server/http-contracts');
        const dto = subscriptionDto(created, 1);
        assert.ok(
          !JSON.stringify(dto).match(
            /entitlement|review_digest|source_key|synthetic-card/
          )
        );
      }
    );
    let sends = 0;
    await check(
      'two real billing engines produce one paid period, bill and provider send',
      async () => {
        const row = await fixture('pending'),
          tx = 'synthetic-' + randomUUID();
        const provider = {
          purchase: async () => {
            sends++;
            return { success: true, approved: true, windcaveTransactionId: tx };
          },
          query: async () => ({
            success: true,
            approved: true,
            windcaveTransactionId: tx,
          }),
        };
        const engines = [0, 1].map(
          () =>
            new DurableSubscriptionBilling(
              pool,
              provider,
              { environment: 'uat', providerAccount: 'synthetic' },
              () => new Date(),
              () => true
            )
        );
        const intent = {
          subscriptionId: row.id,
          merchantId: row.merchant_id,
          kind: 'activation' as const,
          cardId: 'synthetic-card',
          amountCents: 799,
          planId: 'solo' as const,
          idempotencyKey: 'synthetic-' + randomUUID(),
          reference: 'synthetic',
        };
        const results = await Promise.all(engines.map(e => e.charge(intent)));
        assert.ok(results.some(r => r.kind === 'approved'));
        assert.equal(sends, 1);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlements WHERE subscription_id=$1 AND source=$2',
              [row.id, 'paid']
            )
          ).rows[0].n,
          1
        );
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_billing_history WHERE subscription_id=$1',
              [row.id]
            )
          ).rows[0].n,
          1
        );
        assert.equal(
          billingCardIsReady(await storage.getSubscription(row.merchant_id)),
          true
        );
        const again = await engines[0].charge(intent);
        assert.equal(again.reused, true);
        assert.equal(sends, 1);
      }
    );
    await check(
      'unknown billing never creates a paid entitlement or advances a decline',
      async () => {
        const row = await fixture('pending');
        let attempts = 0;
        const engine = new DurableSubscriptionBilling(
          pool,
          {
            purchase: async () => {
              attempts++;
              throw Error('synthetic-timeout');
            },
            query: async () => ({ success: false }),
          },
          { environment: 'uat', providerAccount: 'synthetic' },
          () => new Date(),
          () => true
        );
        const intent = {
          subscriptionId: row.id,
          merchantId: row.merchant_id,
          kind: 'activation' as const,
          cardId: 'synthetic-card',
          amountCents: 799,
          planId: 'solo' as const,
          idempotencyKey: 'synthetic-' + randomUUID(),
          reference: 'synthetic',
        };
        assert.equal((await engine.charge(intent)).kind, 'processing');
        assert.equal((await engine.charge(intent)).kind, 'processing');
        assert.equal(attempts, 1);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlements WHERE subscription_id=$1',
              [row.id]
            )
          ).rows[0].n,
          0
        );
        assert.equal(
          (
            await client.query(
              'SELECT failed_payment_count FROM merchant_subscriptions WHERE id=$1',
              [row.id]
            )
          ).rows[0].failed_payment_count,
          0
        );
      }
    );
    await check(
      'failure after paid capture rolls back history and recovers with query only',
      async () => {
        const row = await fixture('pending'),
          tx = 'synthetic-' + randomUUID();
        let lost = true,
          posts = 0,
          queries = 0,
          clock = new Date();
        const guarded = {
          connect: async () => {
            const c = await pool.connect();
            return {
              query: async (q: string, v?: unknown[]) => {
                const result = await c.query(q, v);
                if (
                  lost &&
                  q.includes(
                    'UPDATE subscription_billing_attempts SET state=$2,applied_at'
                  )
                ) {
                  lost = false;
                  throw Error('synthetic_commit_loss');
                }
                return result;
              },
              release: () => c.release(),
            };
          },
        };
        const provider = {
          purchase: async () => {
            posts++;
            return { success: true, approved: true, windcaveTransactionId: tx };
          },
          query: async () => {
            queries++;
            return { success: true, approved: true, windcaveTransactionId: tx };
          },
        };
        const engine = new DurableSubscriptionBilling(
          guarded as any,
          provider,
          { environment: 'uat', providerAccount: 'synthetic' },
          () => clock,
          () => true
        );
        const intent = {
          subscriptionId: row.id,
          merchantId: row.merchant_id,
          kind: 'activation' as const,
          cardId: 'synthetic-card',
          amountCents: 799,
          planId: 'solo' as const,
          idempotencyKey: 'synthetic-' + randomUUID(),
          reference: 'synthetic',
        };
        assert.equal((await engine.charge(intent)).kind, 'processing');
        for (const table of [
          'subscription_entitlements',
          'subscription_billing_history',
        ])
          assert.equal(
            (
              await client.query(
                `SELECT count(*)::int AS n FROM ${table} WHERE subscription_id=$1`,
                [row.id]
              )
            ).rows[0].n,
            0
          );
        clock = new Date(clock.getTime() + 61000);
        assert.equal((await engine.charge(intent)).kind, 'approved');
        assert.equal(posts, 1);
        assert.equal(queries, 1);
        for (const table of [
          'subscription_entitlements',
          'subscription_billing_history',
        ])
          assert.equal(
            (
              await client.query(
                `SELECT count(*)::int AS n FROM ${table} WHERE subscription_id=$1`,
                [row.id]
              )
            ).rows[0].n,
            1
          );
      }
    );
    await check(
      'standalone CLI verifies manifest digest and dedicated named target',
      async () => {
        const raw = JSON.stringify(manifest),
          path = folder + '/synthetic-manifest.json';
        await writeFile(path, raw);
        await chmod(path, 0o600);
        const args = [
          `--expected-host=${target.host}`,
          `--expected-port=${target.port}`,
          `--expected-database=${target.database}`,
          '--action=classify',
          `--review-digest=${review}`,
          `--manifest=${path}`,
          '--manifest-sha256=' + createHash('sha256').update(raw).digest('hex'),
        ];
        const result = await runEntitlementOperation(args, {
          R6_ENTITLEMENT_DATABASE_URL: url.href,
        });
        assert.equal(result.executed, false);
        assert.equal(result.unchanged, 1);
        await assert.rejects(
          runEntitlementOperation(
            args.map(a =>
              a.startsWith('--manifest-sha256=')
                ? '--manifest-sha256=' + '0'.repeat(64)
                : a
            ),
            { R6_ENTITLEMENT_DATABASE_URL: url.href }
          )
        );
      }
    );
    await check(
      'classification cannot revoke currently effective granted access',
      async () => {
        const id = (
          await client.query(
            'SELECT id FROM subscription_entitlements WHERE subscription_id=$1',
            [grant.id]
          )
        ).rows[0].id;
        await assert.rejects(
          operateEntitlements(
            client,
            target,
            {
              version: 1,
              periods: [],
              revocations: [
                {
                  entitlementId: id,
                  subscriptionId: grant.id,
                  merchantId: grant.merchant_id,
                },
              ],
            },
            { action: 'classify', reviewDigest: review, execute: true }
          )
        );
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlement_revocations'
            )
          ).rows[0].n,
          0
        );
        assert.equal(
          billingCardIsReady(await storage.getSubscription(grant.merchant_id)),
          true
        );
      }
    );
    await check(
      'revocation appends evidence without erasing the original period',
      async () => {
        // Explicitly cancelled fixture is already blocked: revocation cannot introduce a lockout.
        await client.query(
          "UPDATE merchant_subscriptions SET status='cancelled' WHERE id=$1",
          [grant.id]
        );
        const id = (
          await client.query(
            'SELECT id FROM subscription_entitlements WHERE subscription_id=$1',
            [grant.id]
          )
        ).rows[0].id;
        const m = {
          version: 1,
          periods: [],
          revocations: [
            {
              entitlementId: id,
              subscriptionId: grant.id,
              merchantId: grant.merchant_id,
            },
          ],
        };
        await operateEntitlements(client, target, m, {
          action: 'classify',
          reviewDigest: review,
          execute: true,
        });
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlements WHERE id=$1',
              [id]
            )
          ).rows[0].n,
          1
        );
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM subscription_entitlement_revocations'
            )
          ).rows[0].n,
          1
        );
        await assert.rejects(
          client.query('DELETE FROM subscription_entitlement_revocations'),
          (e: any) => e.code === '23514'
        );
      }
    );
    const canonical = fingerprintDocument(await collectSchema(client));
    await check(
      'canonical catalog and complete baseline contract cover the forward migration',
      async () => {
        assert.deepEqual(
          await findMissingBaselineEffects(client, [
            '0049b_subscription_entitlements.sql',
          ]),
          []
        );
        await writeFile(
          folder + '/through-0049b-fingerprint.json',
          serialise(canonical)
        );
      }
    );
    await check(
      'populated R5 clone keeps every existing row and the same canonical catalog',
      async () => {
        const pu = new URL(source);
        pu.pathname = '/r5_full_restore';
        const original = new pg.Client({ connectionString: pu.href });
        await original.connect();
        const counts = async (c: pg.Client | pg.PoolClient) =>
          (
            await c.query(
              'SELECT (SELECT count(*)::int FROM merchants) AS merchants,(SELECT count(*)::int FROM merchant_subscriptions) AS subscriptions,(SELECT count(*)::int FROM invoices_rent_requests)+(SELECT count(*)::int FROM job_invoices)+(SELECT count(*)::int FROM quotes) AS links'
            )
          ).rows;
        const previous = await counts(original),
          catalog = fingerprintDocument(await collectSchema(original));
        assert.equal(catalog.digest, base.digest);
        await original.end();
        const name = database + '_populated';
        await admin.query(`CREATE DATABASE ${name} TEMPLATE r5_full_restore`);
        pu.pathname = '/' + name;
        const populated = new pg.Client({ connectionString: pu.href });
        await populated.connect();
        try {
          await ensureMigrationLedger(populated);
          for (const migration of [
            '0049a_durable_cron.sql',
            '0049b_subscription_entitlements.sql',
          ])
            await applyMigration(
              populated,
              migration,
              await readFile('migrations/' + migration, 'utf8')
            );
          assert.deepEqual(await counts(populated), previous);
          assert.equal(
            fingerprintDocument(await collectSchema(populated)).digest,
            canonical.digest
          );
          assert.equal(
            (
              await populated.query(
                'SELECT count(*)::int AS n FROM subscription_entitlements'
              )
            ).rows[0].n,
            0
          );
          assert.equal(
            (
              await populated.query(
                'SELECT stage FROM subscription_entitlement_control'
              )
            ).rows[0].stage,
            'legacy'
          );
          const originalAfter = new pg.Client({
            connectionString: new URL('/r5_full_restore', source).href,
          });
          await originalAfter.connect();
          try {
            assert.deepEqual(await counts(originalAfter), previous);
            assert.equal(
              fingerprintDocument(await collectSchema(originalAfter)).digest,
              catalog.digest
            );
          } finally {
            await originalAfter.end();
          }
        } finally {
          await populated.end();
        }
      }
    );
    await check(
      'logical restore preserves provenance, policy and billing history',
      async () => {
        const bin =
            '/workspace/.onboarding/r3-postgres/root/usr/lib/postgresql/17/bin',
          dump = folder + '/synthetic-policy.dump';
        const env = {
          ...process.env,
          PGHOST: source.hostname,
          PGPORT: source.port,
          PGUSER: decodeURIComponent(source.username),
          PGPASSWORD: decodeURIComponent(source.password),
        };
        let child = spawnSync(
          bin + '/pg_dump',
          ['-Fc', '--file', dump, database],
          { env, encoding: 'utf8', timeout: 60000 }
        );
        assert.equal(child.status, 0);
        await chmod(dump, 0o600);
        await admin.query(`CREATE DATABASE ${restored}`);
        child = spawnSync(
          bin + '/pg_restore',
          ['--exit-on-error', '--dbname', restored, dump],
          { env, encoding: 'utf8', timeout: 60000 }
        );
        assert.equal(child.status, 0);
        const ru = new URL(url);
        ru.pathname = '/' + restored;
        const r = new pg.Client({ connectionString: ru.href });
        await r.connect();
        try {
          assert.equal(
            fingerprintDocument(await collectSchema(r)).digest,
            canonical.digest
          );
          assert.deepEqual(
            (
              await r.query(
                'SELECT source,source_key,period_start,period_end FROM subscription_entitlements ORDER BY id'
              )
            ).rows,
            (
              await client.query(
                'SELECT source,source_key,period_start,period_end FROM subscription_entitlements ORDER BY id'
              )
            ).rows
          );
          const { asOf: restoredClock, ...restoredCounts } =
              await inventoryEntitlements(r, { ...target, database: restored }),
            { asOf: originalClock, ...originalCounts } =
              await inventoryEntitlements(client, target);
          assert.ok(
            Number.isFinite(Date.parse(restoredClock)) &&
              Number.isFinite(Date.parse(originalClock))
          );
          assert.deepEqual(restoredCounts, originalCounts);
        } finally {
          await r.end();
        }
      }
    );
    await check(
      'original source catalog and business counts remain unchanged',
      async () => {
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
          sourceCounts
        );
      }
    );
    console.log(
      JSON.stringify({
        checks,
        database,
        restored,
        fingerprint: canonical.digest,
        realProviderCalls: 0,
        syntheticApprovedSends: sends,
      })
    );
  } finally {
    client.release();
    await pool.end();
    await admin.end();
  }
}
verify().catch(error => {
  const code = (error as any)?.code,
    message = (error as any)?.message;
  console.error(
    JSON.stringify({
      error: 'R6_POLICY_VERIFICATION_FAILED',
      phase,
      code:
        typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)
          ? code
          : 'assertion_or_guard',
      reason:
        typeof message === 'string' && /^[A-Z0-9_]{1,80}$/.test(message)
          ? message
          : 'assertion_or_driver',
    })
  );
  process.exitCode = 1;
});
