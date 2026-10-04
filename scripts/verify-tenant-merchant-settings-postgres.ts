/**
 * R1-T7 S5a: a business's own settings row on actual PostgreSQL: each purpose writes its own columns,
 * never another's or the row's identity, credentials, status or billing; invalid businesses issue nothing;
 * two purposes written at the same moment both land.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-tenant-merchant-settings-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL, configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const url = new URL(testDatabaseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s\d_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
const writerName = "taptpay-t7-s5a-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}

const INVALID = [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1];
/** Columns no settings purpose may write. Keys are the storage layer's (camel case); the row is read back in SQL. */
const FORBIDDEN = {
  id: 999_999, name: "stolen", email: "stolen@tenant-storage.test", businessType: "other", status: "suspended",
  passwordHash: "hash", googleId: "google", verificationToken: "token", resetToken: "reset", resetTokenExpiry: new Date(0),
  windcaveApiKey: "key", windcaveMerchantId: "wm", qrCodeUrl: "/qr", paymentUrl: "/pay",
  currentProviderRate: "0.5000", ourRate: "0.5000", bankName: "bank", bankAccountNumber: "12-3456",
  customLogoUrl: "/uploads/logos/merchant-2.png", themeId: "other", emailVerified: true,
  billingCardLast4: "0000", billingCardBrand: "visa", billingCardExpiry: "0101",
  tutorialGeneration: 9, tutorialAutoEnabled: false, createdAt: new Date(0),
};
/** Each purpose, a request for it, and exactly the database columns it may change. */
const PURPOSES: Array<{ kind: string; change: any; columns: Record<string, unknown> }> = [
  {
    kind: "profile",
    change: { kind: "profile", changes: { businessName: "New Name", director: "Dee", address: "1 New St", nzbn: "9429", phone: "021", gstNumber: "123-456", contactEmail: "new@tenant-storage.test", contactPhone: "022", businessAddress: "2 New St" } },
    columns: { business_name: "New Name", director: "Dee", address: "1 New St", nzbn: "9429", phone: "021", gst_number: "123-456", contact_email: "new@tenant-storage.test", contact_phone: "022", business_address: "2 New St" },
  },
  { kind: "daily-goal", change: { kind: "daily-goal", dailyGoal: "750.00" }, columns: { daily_goal: 750 } },
  {
    kind: "rent-reminders",
    change: { kind: "rent-reminders", changes: { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 0 } },
    columns: { rent_reminder_enabled: false, rent_reminder_delay_days: 5, rent_reminder_interval_days: 7, rent_reminder_max_count: 0 },
  },
  { kind: "trade-reminders", change: { kind: "trade-reminders", tradeRemindersEnabled: false }, columns: { trade_reminders_enabled: false } },
  { kind: "trade-gst", change: { kind: "trade-gst", changes: { gstRegistered: true, tradeGstMode: "exclusive" } }, columns: { gst_registered: true, trade_gst_mode: "exclusive" } },
  {
    kind: "onboarding",
    change: { kind: "onboarding", details: { director: "Dee", nzbn: "9429", gstNumber: "123-456", websiteUrl: "https://tenant-storage.test", estimatedAnnualTurnover: "Under $50k", businessDescription: "Coffee" } },
    columns: { director: "Dee", nzbn: "9429", gst_number: "123-456", website_url: "https://tenant-storage.test", estimated_annual_turnover: "Under $50k", business_description: "Coffee", onboarding_completed: true },
  },
];
/** The request with the forbidden columns and every other purpose's fields planted wherever a spread would take them. */
function withStrays(purpose: (typeof PURPOSES)[number]) {
  const strays: Record<string, unknown> = { ...FORBIDDEN, onboardingCompleted: purpose.kind === "onboarding" ? undefined : true };
  for (const other of PURPOSES) {
    if (other.kind === purpose.kind) continue;
    const fields = other.change.changes ?? other.change.details ?? Object.fromEntries(Object.entries(other.change).filter(([key]) => key !== "kind"));
    for (const key of Object.keys(fields)) if (!(key in (purpose.change.changes ?? purpose.change.details ?? purpose.change))) strays[key] = `stray-${key}`;
  }
  const change: any = { ...strays, ...purpose.change };
  if (change.changes) change.changes = { ...strays, ...change.changes };
  if (change.details) change.details = { ...strays, ...change.details, onboardingCompleted: false };
  return change;
}

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === "0025_verified_upload_ownership.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-04T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any) as any;
  await writerPool.query("SET statement_timeout='10s'");
  let made = 0;
  const addMerchant = async (): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id",
    [`s5a-tenant-${++made}`, `s5a-tenant-${made}@tenant-storage.test`],
  )).rows[0].id;
  /** The stored row as PostgreSQL holds it, every column. */
  const raw = async (id: number): Promise<Record<string, unknown>> =>
    (await pool.query("SELECT to_jsonb(m) AS row FROM merchants m WHERE id=$1", [id])).rows[0]?.row;
  const changed = (before: Record<string, unknown>, after: Record<string, unknown>) =>
    Object.keys({ ...before, ...after }).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
  const count = async () => (await pool.query("SELECT count(*)::int AS n FROM merchants")).rows[0].n as number;

  for (const purpose of PURPOSES) {
    await check(`${purpose.kind} writes exactly its own columns on its own business, strays or not`, async () => {
      for (const change of [purpose.change, withStrays(purpose)]) {
        const mine = await addMerchant(); const other = await addMerchant();
        const before = await raw(mine); const otherBefore = await raw(other);
        const updated = await one.updateMerchantSettings(mine, change);
        assert.equal(updated?.id, mine);
        const after = await raw(mine);
        assert.deepEqual(changed(before, after).filter((key) => key !== "updated_at"), Object.keys(purpose.columns).sort());
        for (const [column, value] of Object.entries(purpose.columns)) assert.deepEqual(after[column], value);
        assert.notEqual(after.updated_at, before.updated_at);
        assert.deepEqual(await raw(other), otherBefore);
      }
    });
  }

  await check("only completing onboarding marks it complete, whatever the caller says", async () => {
    const mine = await addMerchant();
    for (const purpose of PURPOSES.filter((p) => p.kind !== "onboarding")) {
      await one.updateMerchantSettings(mine, { ...purpose.change, onboardingCompleted: true });
      assert.equal((await raw(mine)).onboarding_completed, false);
    }
    await one.updateMerchantSettings(mine, { kind: "onboarding", details: { director: "Dee", onboardingCompleted: false } });
    assert.equal((await raw(mine)).onboarding_completed, true);
  });

  await check("an omitted field is kept, an explicit null is written, and nothing to change changes no setting", async () => {
    const mine = await addMerchant();
    await one.updateMerchantSettings(mine, { kind: "profile", changes: { director: "Dee", nzbn: "9429" } });
    const updated = await one.updateMerchantSettings(mine, { kind: "profile", changes: { nzbn: null, phone: undefined } });
    assert.equal(updated.director, "Dee"); assert.equal(updated.nzbn, null);
    const before = await raw(mine);
    const empty = await one.updateMerchantSettings(mine, { kind: "rent-reminders", changes: {} });
    assert.equal(empty?.id, mine);
    assert.deepEqual(changed(before, await raw(mine)).filter((key) => key !== "updated_at"), []);
  });

  await check("an unknown purpose and a business that does not exist write nothing and make nothing", async () => {
    const mine = await addMerchant(); const before = await raw(mine); const rows = await count();
    for (const change of [undefined, null, {}, "profile", { kind: "everything", changes: FORBIDDEN }, { changes: { businessName: "x" } }, { kind: "constructor", changes: { businessName: "x" } }]) {
      assert.equal(await one.updateMerchantSettings(mine, change), undefined);
    }
    for (const purpose of PURPOSES) assert.equal(await one.updateMerchantSettings(2_000_000_000, purpose.change), undefined);
    assert.equal(await one.getMerchant(2_000_000_000), undefined);
    assert.deepEqual(await raw(mine), before);
    assert.equal(await count(), rows);
  });

  await check("invalid businesses neither read nor change a row", async () => {
    const mine = await addMerchant(); const before = await raw(mine);
    for (const invalid of INVALID) {
      assert.equal(await one.getMerchant(invalid), undefined);
      for (const purpose of PURPOSES) assert.equal(await one.updateMerchantSettings(invalid, purpose.change), undefined);
      assert.equal(await one.updateMerchantDetails(invalid, { businessName: "x", contactEmail: "x@tenant-storage.test", contactPhone: "1", businessAddress: "x" }), undefined);
      assert.equal(await one.updateMerchantTheme(invalid, "other"), undefined);
      assert.equal(await one.updateMerchantLogoUrl(invalid, "/uploads/logos/x.png"), undefined);
    }
    assert.deepEqual(await raw(mine), before);
    assert.equal((await one.getMerchant(mine))?.id, mine);
  });

  await check("details, theme and logo write their own columns on their own business only", async () => {
    const mine = await addMerchant(); const other = await addMerchant();
    const otherBefore = await raw(other);
    let before = await raw(mine);
    await one.updateMerchantDetails(mine, { ...FORBIDDEN, businessName: "Named", contactEmail: "named@tenant-storage.test", contactPhone: "09", businessAddress: "3 St" });
    assert.deepEqual(changed(before, await raw(mine)), ["business_address", "business_name", "contact_email", "contact_phone"]);
    before = await raw(mine);
    await one.updateMerchantTheme(mine, "midnight");
    assert.deepEqual(changed(before, await raw(mine)), ["theme_id"]);
    before = await raw(mine);
    await one.updateMerchantLogoUrl(mine, `/uploads/logos/merchant-${mine}.png`);
    assert.deepEqual(changed(before, await raw(mine)), ["custom_logo_url", "updated_at"]);
    assert.deepEqual(await raw(other), otherBefore);
  });

  await check("the general update still never writes a Windcave credential", async () => {
    const mine = await addMerchant();
    await one.updateMerchant(mine, { windcaveApiKey: "key", googleId: "google-subject" });
    const after = await raw(mine);
    assert.equal(after.windcave_api_key, null); assert.equal(after.google_id, "google-subject");
  });

  // A settings write that waited for another column's committed change must keep that change:
  // only the purpose's own columns are written, never the row as it was read.
  for (const purpose of PURPOSES) {
    await check(`${purpose.kind} written beside another change keeps both`, async () => {
      const mine = await addMerchant();
      const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
      try {
        await locker.query("BEGIN"); open = true;
        await locker.query("UPDATE merchants SET theme_id='midnight', status='suspended', custom_logo_url='/uploads/logos/kept.png' WHERE id=$1", [mine]);
        pending = two.updateMerchantSettings(mine, purpose.change); void pending.catch(() => undefined);
        let didWait = false;
        for (let i = 0; i < 200; i++) {
          const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [writerName]);
          if (state.rowCount) { didWait = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(didWait, "the settings write waited on the row");
        await locker.query("COMMIT"); open = false;
        assert.equal((await pending)?.id, mine);
        const after = await raw(mine);
        assert.equal(after.theme_id, "midnight"); assert.equal(after.status, "suspended"); assert.equal(after.custom_logo_url, "/uploads/logos/kept.png");
        for (const [column, value] of Object.entries(purpose.columns)) assert.deepEqual(after[column], value);
      } finally {
        if (open) await locker.query("ROLLBACK");
        await pending?.catch(() => undefined);
        locker.release();
      }
    });
  }
} finally {
  await Promise.all([pool.end(), writerPool.end()]);
}
console.log(`TENANT MERCHANT SETTINGS POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
