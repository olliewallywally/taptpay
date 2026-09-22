/** R1-T4 sign-in storage against real PostgreSQL: phase A's one-time code (Google sign-in)
 * and phase D's session versions (a password reset and "sign out everywhere").
 * Run only against an EMPTY, explicitly marked disposable database:
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-google-handoff-postgres.ts
 * The URL must carry a user and a password: the migration runner validates its target.
 * Applies the real migration chain through the project runner (0025 with the inventory
 * drafted from this empty database, which has nothing to own), then exercises actual
 * DatabaseStorage from two instances on separate pools, as two servers would.
 * Synthetic rows are retained for inspection; nothing is dropped.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
const pools = [new pg.Pool({ connectionString: testDatabaseUrl, max: 10 }),
  new pg.Pool({ connectionString: testDatabaseUrl, max: 10 })];
const [pool] = pools;
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
// As server/google-sign-in.ts issues them: 32 random bytes, only the SHA-256 stored.
const codeHash = () => sha(randomBytes(32).toString("base64url"));
const REPAIR = "0025_verified_upload_ownership.sql";
const testUrl = new URL(testDatabaseUrl);
const pgTarget = { host: testUrl.hostname, port: Number(testUrl.port || 5432),
  database: decodeURIComponent(testUrl.pathname.slice(1)) };
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
      { target: pgTarget, approvedBy: "synthetic verifier", approvedAt: "2026-09-22T00:00:00Z" });
    assert.equal(inventory.entries.length, 0, "an empty database has no invoice documents to own");
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, sha(source), pgTarget);
    const { appliedNow } = await runner.runPendingMigrations(client,
      { log: () => undefined, uploadOwnershipInventory: verified });
    assert.ok(appliedNow.includes("0026_auth_handoff_codes.sql"), "0026 applied through the runner");
    console.log(`MIGRATIONS applied through the runner: ${appliedNow.join(", ")}`);
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const [one, two] = pools.map((p) => new DatabaseStorage(drizzle(p, { schema }) as any));
  const merchant = (await pool.query(`INSERT INTO merchants(name,business_name,email,status)
    VALUES ('Handoff','Handoff','handoff@r1-t4.test','active') RETURNING id`)).rows[0].id;
  const addUser = async (email: string, role: string) => (await pool.query(`INSERT INTO users(email,password,merchant_id,role)
    VALUES ($1,'synthetic-not-a-hash',$2,$3) RETURNING id`, [email, merchant, role])).rows[0].id as number;
  const user = await addUser("handoff@r1-t4.test", "owner");
  const inAMinute = () => new Date(Date.now() + 60_000);
  const issue = (hash: string, expiresAt: Date, userId = user, newUser = false) =>
    one.createAuthHandoffCode({ codeHash: hash, userId, newUser, expiresAt });
  const stored = async (hash: string) =>
    (await pool.query("SELECT consumed_at FROM auth_handoff_codes WHERE code_hash=$1", [hash])).rows[0];

  await check("a code is redeemed exactly once, even by 24 simultaneous attempts from two instances", async () => {
    const hash = codeHash();
    await issue(hash, inAMinute(), user, true);
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) =>
      (i % 2 ? two : one).consumeAuthHandoffCode(hash, new Date())));
    const won = results.filter(Boolean);
    assert.equal(won.length, 1);
    assert.deepEqual(won[0], { userId: user, newUser: true });
    assert.ok((await stored(hash)).consumed_at, "the redemption is recorded");
    assert.equal(await one.consumeAuthHandoffCode(hash, new Date()), undefined, "and never repeated");
  });
  await check("an expired code is refused, including one expiring at the moment of redemption", async () => {
    const now = new Date();
    const [past, edge] = [codeHash(), codeHash()];
    await issue(past, new Date(now.getTime() - 1_000));
    await issue(edge, now);
    assert.equal(await two.consumeAuthHandoffCode(past, now), undefined);
    assert.equal(await two.consumeAuthHandoffCode(edge, now), undefined);
    assert.equal((await stored(past)).consumed_at, null, "a refused code is left unconsumed");
    assert.equal((await stored(edge)).consumed_at, null, "a refused code is left unconsumed");
  });
  await check("an unknown code is refused", async () => {
    assert.equal(await two.consumeAuthHandoffCode(codeHash(), new Date()), undefined);
  });
  await check("the same code cannot be issued twice, nor for a user who does not exist", async () => {
    const hash = codeHash();
    await issue(hash, inAMinute());
    await assert.rejects(two.createAuthHandoffCode({ codeHash: hash, userId: user, newUser: false, expiresAt: inAMinute() }));
    await assert.rejects(issue(codeHash(), inAMinute(), 2_000_000_000));
  });
  await check("codes a day past expiry are reclaimed when the next is issued; recent ones stay", async () => {
    const [stale, recent] = [codeHash(), codeHash()];
    await issue(stale, new Date(Date.now() - 2 * 86_400_000));
    assert.ok(await stored(stale), "the stale code was stored");
    await issue(recent, new Date(Date.now() - 3_600_000));
    assert.equal(await stored(stale), undefined, "reclaimed");
    assert.ok(await stored(recent), "an hour past expiry is not yet reclaimed");
  });
  await check("a deleted user's codes are deleted with them", async () => {
    const member = await addUser("handoff-member@r1-t4.test", "member");
    const hash = codeHash();
    await issue(hash, inAMinute(), member);
    await pool.query("DELETE FROM users WHERE id=$1", [member]);
    assert.equal(await stored(hash), undefined);
  });
  // Phase D: users.session_version (0027).
  const versionOf = async (id: number) =>
    (await pool.query("SELECT session_version FROM users WHERE id=$1", [id])).rows[0].session_version as number;
  await check("a login starts at session version 0", async () => {
    assert.equal(await versionOf(await addUser("fresh@r1-t4.test", "member")), 0);
  });
  await check("20 simultaneous 'sign out everywhere' from two instances advance it 20 times, none lost", async () => {
    const login = await addUser("busy@r1-t4.test", "member");
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? two : one).advanceUserSessionVersion(login)));
    assert.ok(results.every(Boolean));
    assert.equal(await versionOf(login), 20);
  });
  await check("a password reset advances it in the same statement that sets the password", async () => {
    const login = await addUser("reset@r1-t4.test", "member");
    const resetHash = sha(randomBytes(32).toString("hex"));
    await one.setUserResetToken(login, resetHash, new Date(Date.now() + 3_600_000));
    const updated = await two.resetUserPasswordByToken(resetHash, "synthetic-new-hash", new Date());
    assert.ok(updated, "the reset applied");
    const row = (await pool.query("SELECT password, reset_token, session_version FROM users WHERE id=$1", [login])).rows[0];
    assert.deepEqual(row, { password: "synthetic-new-hash", reset_token: null, session_version: 1 });
    assert.equal(await one.resetUserPasswordByToken(resetHash, "again", new Date()), null, "the reset token is spent");
    assert.equal(await versionOf(login), 1, "a refused reset advances nothing");
  });
  await check("advancing an unknown login reports false", async () => {
    assert.equal(await one.advanceUserSessionVersion(2_000_000_000), false);
  });
  assert.deepEqual(failures, [], "R1-T4 sign-in PostgreSQL verification failed");
  console.log("R1-T4 sign-in PostgreSQL verification passed");
} finally {
  await Promise.all(pools.map((p) => p.end()));
}
