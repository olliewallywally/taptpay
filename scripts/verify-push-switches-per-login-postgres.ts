/** Each login its own notification switches (owner decision 2026-09-26,
 * docs/decisions/2026-09-26-c10-batch-5-owner-answers.md, answer 2), against real PostgreSQL:
 * the database storage's getPushSubscriptionsForLogin, getPushNotificationPreferences,
 * updatePushNotificationPreferences and createPushSubscription. The harness tests run on the
 * in-memory storage; this runs the same rules on the real one.
 * Run only against an EMPTY, explicitly marked disposable database:
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-push-switches-per-login-postgres.ts
 * The URL must carry a user and a password: the migration runner validates its target.
 * Applies the real migration chain through the project runner (0025 with the inventory drafted
 * from this empty database, which has nothing to own). Synthetic rows are retained.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
// Check BOTH ambient targets before loading config or application modules.
assertSafePostgresVerifierEnvironment({ testDatabaseUrl,
  configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 5 });
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const REPAIR = "0025_verified_upload_ownership.sql";
const testUrl = new URL(testDatabaseUrl);
const pgTarget = { host: testUrl.hostname, port: Number(testUrl.port || 5432),
  database: decodeURIComponent(testUrl.pathname.slice(1)) };
const DEFAULTS = { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false };
const QUIET = { paymentReceived: false, dailyPayoutSummary: false, failedPaymentAlerts: false };
const fcm = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires an empty disposable database; no cleanup is automatic");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === REPAIR) break; // The rest go through the runner with a verified inventory.
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts,
      { target: pgTarget, approvedBy: "synthetic verifier", approvedAt: "2026-09-26T00:00:00Z" });
    assert.equal(inventory.entries.length, 0, "an empty database has no invoice documents to own");
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, sha(source), pgTarget);
    const { appliedNow } = await runner.runPendingMigrations(client,
      { log: () => undefined, uploadOwnershipInventory: verified });
    console.log(`MIGRATIONS applied through the runner: ${appliedNow.join(", ")}`);
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const storage = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const business = async (name: string) => {
    const merchant = (await pool.query(`INSERT INTO merchants(name,business_name,email,status)
      VALUES ($1,$2,$3,'active') RETURNING id`, [name, `${name} Ltd`, `${name.toLowerCase()}@c10.test`])).rows[0].id as number;
    const login = async (role: string, email: string) => (await pool.query(`INSERT INTO users(email,password,merchant_id,role,status)
      VALUES ($1,'synthetic-hash',$2,$3,'active') RETURNING id`, [email, merchant, role])).rows[0].id as number;
    return { merchant, owner: await login("owner", `owner.${merchant}@c10.test`), member: await login("member", `member.${merchant}@c10.test`) };
  };
  const device = (merchantId: number, userId: number | null, endpoint: string) =>
    storage.createPushSubscription({ merchantId, userId, endpoint, p256dh: "p", auth: "a" });
  const switchesOf = async (endpoint: string) =>
    (await pool.query("SELECT preferences FROM push_subscriptions WHERE endpoint=$1", [endpoint])).rows[0].preferences;

  const one = await business("One");
  const other = await business("Other");
  await device(one.merchant, one.owner, fcm("owner-laptop"));
  await device(one.merchant, one.member, fcm("member-laptop"));
  await device(one.merchant, null, fcm("from-before"));
  await device(other.merchant, other.member, fcm("other-member"));

  await check("a teammate's switches are written to their own devices only", async () => {
    await storage.updatePushNotificationPreferences(one.merchant, one.member, QUIET);
    assert.deepEqual(await switchesOf(fcm("member-laptop")), QUIET);
    assert.deepEqual(await switchesOf(fcm("owner-laptop")), DEFAULTS);
    assert.deepEqual(await switchesOf(fcm("from-before")), DEFAULTS);
    assert.deepEqual(await switchesOf(fcm("other-member")), DEFAULTS);
  });

  await check("each login reads its own switches; no login reads the unattributed ones", async () => {
    assert.deepEqual(await storage.getPushNotificationPreferences(one.merchant, one.member), QUIET);
    assert.deepEqual(await storage.getPushNotificationPreferences(one.merchant, one.owner), DEFAULTS);
    await storage.updatePushNotificationPreferences(one.merchant, null, { ...DEFAULTS, failedPaymentAlerts: true });
    assert.deepEqual(await storage.getPushNotificationPreferences(one.merchant, null), { ...DEFAULTS, failedPaymentAlerts: true });
    assert.deepEqual(await storage.getPushNotificationPreferences(one.merchant, one.owner), DEFAULTS);
  });

  await check("a login's new device starts with that login's switches", async () => {
    await device(one.merchant, one.member, fcm("member-phone"));
    assert.deepEqual(await switchesOf(fcm("member-phone")), QUIET);
  });

  await check("a device moving to another login takes that login's switches", async () => {
    await device(one.merchant, one.member, fcm("owner-laptop"));
    assert.deepEqual(await switchesOf(fcm("owner-laptop")), QUIET);
    const owned = (await pool.query("SELECT user_id FROM push_subscriptions WHERE endpoint=$1", [fcm("owner-laptop")])).rows[0].user_id;
    assert.equal(owned, one.member);
  });

  await check("a login's device list is its own active devices", async () => {
    const mine = (await storage.getPushSubscriptionsForLogin(one.merchant, one.member)).map((sub) => sub.endpoint).sort();
    assert.deepEqual(mine, [fcm("member-laptop"), fcm("member-phone"), fcm("owner-laptop")].sort());
    assert.deepEqual(await storage.getPushSubscriptionsForLogin(one.merchant, one.owner), []);
    await storage.deactivatePushSubscriptionByEndpoint(fcm("member-phone"));
    const after = (await storage.getPushSubscriptionsForLogin(one.merchant, one.member)).map((sub) => sub.endpoint).sort();
    assert.deepEqual(after, [fcm("member-laptop"), fcm("owner-laptop")].sort());
  });

  assert.deepEqual(failures, [], "per-login push switch PostgreSQL verification failed");
  console.log("Per-login push switch PostgreSQL verification passed");
} finally {
  await pool.end();
}
