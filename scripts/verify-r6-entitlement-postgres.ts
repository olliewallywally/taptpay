/** Owned synthetic entitlement inventory proof; never an ambient application target. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  inventoryEntitlements,
  ENTITLEMENT_INVENTORY_PAGE,
} from '../server/entitlement-inventory';
import { runEntitlementInventory } from './r6-entitlement-inventory';
import {applyMigration,ensureMigrationLedger} from '../server/migrate';
import {readFile} from 'node:fs/promises';
// @ts-expect-error Existing standalone safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    checks++;
    console.log(`PASS ${name}`);
  } catch {
    throw Error('R6_ENTITLEMENT_CHECK_FAILED');
  }
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
  const sourceUrl = new URL(testDatabaseUrl);
  if (
    sourceUrl.hostname !== '127.0.0.1' ||
    sourceUrl.port !== '55440' ||
    sourceUrl.pathname !== '/r5_full_scratch'
  )
    throw Error('R6_OWNED_SOURCE_REQUIRED');
  const database = `r6_inventory_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const source = new pg.Client({ connectionString: testDatabaseUrl });
  await source.connect();
  try {
    await source.query(`CREATE DATABASE ${database} TEMPLATE r5_full_scratch`);
  } finally {
    await source.end();
  }
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${database}`;
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  const target = { host: url.hostname, port: Number(url.port), database };
  try {
    await ensureMigrationLedger(c);
    for(const name of ['0049a_durable_cron.sql','0049b_subscription_entitlements.sql']) await applyMigration(c,name,await readFile('migrations/'+name,'utf8'));
    const now = new Date(),
      start = new Date(now.getTime() - 30 * 86400000),
      end = new Date(now.getTime() + 30 * 86400000),
      yesterday = new Date(now.getTime() - 86400000),
      expired = new Date(now.getTime() - 10 * 86400000);
    const fixture = [
      {
        status: 'active',
        paid: start.toISOString(),
        end,
        card: 'synthetic-card',
      },
      { status: 'active', paid: null, end, card: null },
      {
        status: 'past_due',
        paid: start.toISOString(),
        end: yesterday,
        card: 'synthetic-card',
      },
      { status: 'active', paid: start.toISOString(), end: expired, card: null },
      {
        status: 'cancelled',
        paid: start.toISOString(),
        end,
        card: 'synthetic-card',
      },
    ];
    for (const row of fixture) {
      const id = (
        await c.query(
          "INSERT INTO merchants(name,business_name,email) VALUES('R6 fixture','R6 fixture',$1) RETURNING id",
          [`${randomUUID()}@synthetic.test`]
        )
      ).rows[0].id;
      await c.query(
        'INSERT INTO merchant_subscriptions(merchant_id,status,last_billing_date,current_period_start,current_period_end,next_billing_date,windcave_card_id,failed_payment_count) VALUES($1,$2,$3,$4,$5,$5,$6,$7)',
        [
          id,
          row.status,
          row.paid,
          start,
          row.end,
          row.card,
          row.status === 'past_due' ? 1 : 0,
        ]
      );
    }
    await c.query(
      "INSERT INTO merchants(name,business_name,email) VALUES('R6 fixture','R6 fixture',$1)",
      [`${randomUUID()}@synthetic.test`]
    );
    const snapshot = async () =>
      (
        await c.query(
          'SELECT id,status,last_billing_date,current_period_start,current_period_end,windcave_card_id FROM merchant_subscriptions ORDER BY id'
        )
      ).rows;
    const before = await snapshot();
    await check(
      'current gate counts preserve paid access, flag the unclassified grant candidate and never infer approval',
      async () => {
        const report = await inventoryEntitlements(c, target, 2);
        assert.equal(report.subscriptions, 5);
        assert.deepEqual(report.merchantCoverage, {
          merchants: 6,
          withoutSubscription: 1,
        });
        assert.deepEqual(report.currentGate, { allowed: 2, blocked: 4 });
        assert.equal(report.activeWithoutBillingDate, 1);
        assert.equal(report.missingProviderToken, 2);
        assert.equal(report.due, 2);
        assert.equal(report.overdue, 2);
        assert.equal(report.provenance.unclassified, 5);
        assert.deepEqual(report.proposedGate, {
          assessment: 'approved_D9',allowed:0,blocked:6,newlyAllowed:0,newlyBlocked:2,
        });
        assert.ok(!JSON.stringify(report).includes('synthetic'));
      }
    );
    await check(
      'every actual page is read-only and PostgreSQL rejects a forced write',
      async () => {
        let pages = 0;
        const observed = {
          query: async (text: string, values?: unknown[]) => {
            if (text === ENTITLEMENT_INVENTORY_PAGE) {
              pages++;
              assert.equal(
                (await c.query('SHOW transaction_read_only')).rows[0]
                  .transaction_read_only,
                'on'
              );
              await c.query('SAVEPOINT r6_readonly_proof');
              await assert.rejects(
                c.query(
                  "UPDATE public.merchants SET business_name='must not persist'"
                ),
                (e: any) => e.code === '25006'
              );
              await c.query('ROLLBACK TO SAVEPOINT r6_readonly_proof');
              await c.query('RELEASE SAVEPOINT r6_readonly_proof');
            }
            return c.query(text, values);
          },
        };
        await inventoryEntitlements(observed, target, 1);
        assert.ok(pages >= 5);
        assert.equal(
          (await c.query('SHOW transaction_read_only')).rows[0]
            .transaction_read_only,
          'off'
        );
      }
    );
    await check(
      'real standalone service scans only its explicit dedicated URI',
      async () => {
        const report = await runEntitlementInventory(
          [
            `--expected-host=${target.host}`,
            `--expected-port=${target.port}`,
            `--expected-database=${database}`,
          ],
          { R6_ENTITLEMENT_DATABASE_URL: url.toString() }
        );
        assert.equal(report.subscriptions, 5);
        await assert.rejects(
          runEntitlementInventory(
            [
              `--expected-host=${target.host}`,
              `--expected-port=${target.port}`,
              '--expected-database=wrong',
            ],
            { R6_ENTITLEMENT_DATABASE_URL: url.toString() }
          )
        );
      }
    );
    await check(
      'snapshot contents and original source policy remain unchanged',
      async () => {
        assert.deepEqual(await snapshot(), before);
        const original = new pg.Client({ connectionString: testDatabaseUrl });
        await original.connect();
        try {
          assert.equal(
            (
              await original.query(
                'SELECT count(*)::int AS n FROM merchant_subscriptions'
              )
            ).rows[0].n,
            0
          );
          assert.deepEqual(
            (
              await original.query(
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
          await original.end();
        }
      }
    );
    console.log(
      JSON.stringify({
        checks,
        syntheticMerchants: 6,
        syntheticSubscriptions: 5,
        mutationsDuringInventory: 0,
        liveProviderCalls: 0,
        proposedPolicyAssessed: true,
      })
    );
  } finally {
    await c.end();
  }
}
try {
  await verify();
} catch {
  console.error('R6_ENTITLEMENT_POSTGRES_VERIFICATION_FAILED');
  process.exitCode = 1;
}
