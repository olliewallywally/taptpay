/**
 * R1-T5c on actual PostgreSQL: connecting an Apple identity to a signed-in owner's login, and
 * disconnecting it. A linked identity is never moved; a login has one; only an active owner's login
 * takes one; the races resolve to one winner.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-apple-connect-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
const otherPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}
const ISSUER = "https://appleid.apple.com"; const CLIENT = "nz.taptpay.signin.verifier";
const key = () => ({ issuer: ISSUER, clientId: CLIENT, subject: `001234.${randomBytes(16).toString("hex")}.0123` });
const address = (who = "person") => `${who}.${randomBytes(4).toString("hex")}@example.test`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-06T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage, AppleIdentityTakenError } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(otherPool, { schema }) as any) as any;

  /** A verified business and its active owner login, made as sign-up makes them; no Apple identity. */
  const owner = async (who = "owner") => {
    const email = address(who);
    const merchant = await one.createMerchantWithPassword({ name: "Synthetic Owner", businessName: "Synthetic Owner", email, status: "verified" }, "synthetic-hash");
    const login = (await pool.query("SELECT id FROM users WHERE merchant_id=$1 AND role='owner'", [merchant.id])).rows[0];
    return { merchantId: merchant.id as number, userId: login.id as number, email };
  };
  const raw = async (k: { subject: string }) => (await pool.query("SELECT * FROM apple_identities WHERE subject=$1", [k.subject])).rows[0];
  const ofLogin = async (userId: number) => (await pool.query("SELECT * FROM apple_identities WHERE user_id=$1", [userId])).rows;
  const everything = async () => JSON.stringify([
    (await pool.query("SELECT * FROM apple_identities ORDER BY id")).rows,
    (await pool.query("SELECT id, email, role, status, merchant_id, session_version FROM users ORDER BY id")).rows,
    (await pool.query("SELECT count(*)::int AS n FROM merchants")).rows,
  ]);

  await check("an identity never seen becomes the owner's, with the email given and the moment it was linked", async () => {
    const who = await owner(); const k = key(); const email = address("apple");
    assert.equal(await one.getAppleIdentityForLogin(who.userId), undefined);
    assert.equal(await one.connectAppleIdentity(who.userId, k, { email, isPrivateEmail: true }), "connected");
    const row = await raw(k);
    assert.equal(row.user_id, who.userId); assert.equal(row.email, email); assert.equal(row.is_private_email, true); assert.ok(row.linked_at);
    assert.equal(row.issuer, ISSUER); assert.equal(row.client_id, CLIENT);
    const read = await one.getAppleIdentityForLogin(who.userId);
    assert.equal(read.id, row.id); assert.equal(read.subject, k.subject);
    // A token with no email writes none, and marks no relay.
    const silent = await owner(); const quiet = key();
    assert.equal(await one.connectAppleIdentity(silent.userId, quiet, { isPrivateEmail: false }), "connected");
    assert.equal((await raw(quiet)).email, null); assert.equal((await raw(quiet)).is_private_email, false);
  });

  await check("a pending identity becomes the owner's as the same row; its email is replaced only by one given now", async () => {
    // Nothing given now: the row keeps the address and the relay mark it was first seen with.
    const who = await owner(); const k = key(); const first = address("first");
    const pending = await one.recordPendingAppleIdentity(k, { email: first, isPrivateEmail: true });
    assert.equal(await one.connectAppleIdentity(who.userId, k, { isPrivateEmail: false }), "connected");
    let row = await raw(k);
    assert.equal(row.id, pending.id); assert.equal(row.user_id, who.userId); assert.ok(row.linked_at);
    assert.equal(row.email, first); assert.equal(row.is_private_email, true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM apple_identities WHERE subject=$1", [k.subject])).rows[0].n, 1);
    // One given now replaces it, with its own relay mark.
    const second = await owner(); const other = key(); const now = address("now");
    await one.recordPendingAppleIdentity(other, { email: address("then"), isPrivateEmail: true });
    assert.equal(await one.connectAppleIdentity(second.userId, other, { email: now, isPrivateEmail: false }), "connected");
    row = await raw(other);
    assert.equal(row.email, now); assert.equal(row.is_private_email, false);
    // The pending row's email was ANOTHER business's address: it joined nobody to that business.
    const elsewhere = await owner("elsewhere"); const third = await owner(); const theirs = key();
    await one.recordPendingAppleIdentity(theirs, { email: elsewhere.email, isPrivateEmail: false });
    assert.equal(await one.connectAppleIdentity(third.userId, theirs, { isPrivateEmail: false }), "connected");
    assert.equal((await raw(theirs)).user_id, third.userId);
    assert.deepEqual(await ofLogin(elsewhere.userId), []);
  });

  await check("the same identity again changes nothing, not even when it was linked", async () => {
    const who = await owner(); const k = key();
    await one.connectAppleIdentity(who.userId, k, { email: address(), isPrivateEmail: false });
    const before = await everything();
    assert.equal(await one.connectAppleIdentity(who.userId, k, { email: address("later"), isPrivateEmail: true }), "already-connected");
    assert.equal(await everything(), before);
  });

  await check("an identity that is another login's is never moved, however it came to be theirs", async () => {
    const first = await owner(); const second = await owner(); const k = key();
    await one.connectAppleIdentity(first.userId, k, { email: address(), isPrivateEmail: false });
    // One that made its own business by signing in.
    const made = key();
    const maker = await one.createMerchantWithAppleIdentity({ name: "Maker", businessName: "Maker", email: address("maker") }, "synthetic-hash", made, { isPrivateEmail: false });
    const before = await everything();
    assert.equal(await one.connectAppleIdentity(second.userId, k, { email: address("attacker"), isPrivateEmail: true }), "identity-taken");
    assert.equal(await one.connectAppleIdentity(second.userId, made, { isPrivateEmail: false }), "identity-taken");
    assert.equal(await everything(), before);
    assert.equal((await raw(k)).user_id, first.userId); assert.equal((await raw(made)).user_id, maker.userId);
    assert.equal(await one.getAppleIdentityForLogin(second.userId), undefined);
  });

  await check("a login that has an identity takes no second one, and the second is not recorded", async () => {
    const who = await owner(); const k = key(); const other = key();
    await one.connectAppleIdentity(who.userId, k, { isPrivateEmail: false });
    // A second identity that is pending stays pending, untouched.
    const pending = key(); await one.recordPendingAppleIdentity(pending, { email: address("pending"), isPrivateEmail: false });
    const before = await everything();
    assert.equal(await one.connectAppleIdentity(who.userId, other, { email: address("x"), isPrivateEmail: false }), "login-has-another");
    assert.equal(await one.connectAppleIdentity(who.userId, pending, { isPrivateEmail: false }), "login-has-another");
    assert.equal(await everything(), before);
    assert.equal(await raw(other), undefined); assert.equal((await raw(pending)).user_id, null);
  });

  await check("only an active owner's login takes an identity", async () => {
    const who = await owner();
    const member = (await pool.query(
      "INSERT INTO users(email,password,merchant_id,role,status) VALUES ($1,'synthetic-hash',$2,'member','active') RETURNING id", [address("member"), who.merchantId])).rows[0].id;
    const invited = (await pool.query(
      "INSERT INTO users(email,password,merchant_id,role,status) VALUES ($1,'synthetic-hash',$2,'owner','invited') RETURNING id", [address("invited"), who.merchantId])).rows[0].id;
    const disabled = await owner("disabled");
    await pool.query("UPDATE users SET status='disabled' WHERE id=$1", [disabled.userId]);
    const before = await everything();
    for (const userId of [member, invited, disabled.userId, 2_000_000_000]) {
      const k = key();
      assert.equal(await one.connectAppleIdentity(userId, k, { email: address(), isPrivateEmail: false }), "no-login", `login ${userId}`);
      assert.equal(await raw(k), undefined);
    }
    assert.equal(await everything(), before);
    // Switched back on, the same login takes one.
    await pool.query("UPDATE users SET status='active' WHERE id=$1", [disabled.userId]);
    assert.equal(await one.connectAppleIdentity(disabled.userId, key(), { isPrivateEmail: false }), "connected");
  });

  await check("a login switched off while a connect waits for its row is refused when the row is released", async () => {
    // The write re-reads the login under its row lock: of a connect and a switch-off at once, the
    // switch-off that got there first is seen, not the row as it was when the connect began.
    for (const change of ["status='disabled'", "role='member'"]) {
      const who = await owner(); const k = key();
      const holder = await pool.connect();
      let settled = false;
      try {
        await holder.query("BEGIN");
        await holder.query(`UPDATE users SET ${change} WHERE id=$1`, [who.userId]);
        const connecting = two.connectAppleIdentity(who.userId, k, { email: address(), isPrivateEmail: false }).finally(() => { settled = true; });
        await pause(300);
        assert.equal(settled, false, "the connect waits for the login's row");
        await holder.query("COMMIT");
        assert.equal(await connecting, "no-login", change);
      } finally { await holder.query("ROLLBACK").catch(() => undefined); holder.release(); }
      assert.equal(await raw(k), undefined);
    }
  });

  await check("two connects at once for one login link one identity; the other finds the login has one", async () => {
    for (let round = 0; round < 8; round++) {
      const who = await owner(`race${round}`); const a = key(); const b = key();
      const results = await Promise.all([
        one.connectAppleIdentity(who.userId, a, { email: address("a"), isPrivateEmail: false }),
        two.connectAppleIdentity(who.userId, b, { email: address("b"), isPrivateEmail: false }),
      ]);
      assert.deepEqual([...results].sort(), ["connected", "login-has-another"]);
      const rows = await ofLogin(who.userId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].subject, results[0] === "connected" ? a.subject : b.subject);
      // The loser's identity was not recorded at all.
      assert.equal(await raw(results[0] === "connected" ? b : a), undefined);
    }
  });

  await check("two logins connecting one identity at once: one gets it, the other finds it taken", async () => {
    for (let round = 0; round < 8; round++) {
      const first = await owner(`first${round}`); const second = await owner(`second${round}`); const k = key();
      // Half the rounds start from a pending row, half from an identity never seen.
      if (round % 2) await one.recordPendingAppleIdentity(k, { email: address("pending"), isPrivateEmail: false });
      const results = await Promise.all([
        one.connectAppleIdentity(first.userId, k, { isPrivateEmail: false }),
        two.connectAppleIdentity(second.userId, k, { isPrivateEmail: false }),
      ]);
      assert.deepEqual([...results].sort(), ["connected", "identity-taken"]);
      const winner = results[0] === "connected" ? first : second; const loser = winner === first ? second : first;
      assert.equal((await raw(k)).user_id, winner.userId);
      assert.deepEqual(await ofLogin(loser.userId), []);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM apple_identities WHERE subject=$1", [k.subject])).rows[0].n, 1);
    }
  });

  await check("the same connect twice at once links once", async () => {
    for (let round = 0; round < 6; round++) {
      const who = await owner(`twice${round}`); const k = key();
      const results = await Promise.all([
        one.connectAppleIdentity(who.userId, k, { isPrivateEmail: false }),
        two.connectAppleIdentity(who.userId, k, { isPrivateEmail: false }),
      ]);
      assert.deepEqual([...results].sort(), ["already-connected", "connected"]);
      assert.equal((await ofLogin(who.userId)).length, 1);
    }
  });

  await check("a connect and a first sign-in with one identity at once: one of them has it, and nothing is half-made", async () => {
    for (let round = 0; round < 6; round++) {
      const who = await owner(`mixed${round}`); const k = key(); const email = address(`maker${round}`);
      const merchantsBefore = (await pool.query("SELECT count(*)::int AS n FROM merchants")).rows[0].n;
      const [connected, made] = await Promise.allSettled([
        one.connectAppleIdentity(who.userId, k, { isPrivateEmail: false }),
        two.createMerchantWithAppleIdentity({ name: "Maker", businessName: "Maker", email }, "synthetic-hash", k, { isPrivateEmail: false }),
      ]);
      assert.equal(connected.status, "fulfilled");
      const row = await raw(k);
      const merchantsAfter = (await pool.query("SELECT count(*)::int AS n FROM merchants")).rows[0].n;
      if ((connected as PromiseFulfilledResult<string>).value === "connected") {
        // The connect won: the sign-in made no business, and said the identity was taken.
        assert.equal(made.status, "rejected");
        assert.ok((made as PromiseRejectedResult).reason instanceof AppleIdentityTakenError);
        assert.equal(row.user_id, who.userId); assert.equal(merchantsAfter, merchantsBefore);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE lower(email)=lower($1)", [email])).rows[0].n, 0);
      } else {
        assert.equal((connected as PromiseFulfilledResult<string>).value, "identity-taken");
        assert.equal(made.status, "fulfilled");
        assert.equal(row.user_id, (made as PromiseFulfilledResult<any>).value.userId); assert.equal(merchantsAfter, merchantsBefore + 1);
        assert.deepEqual(await ofLogin(who.userId), []);
      }
    }
  });

  await check("disconnecting removes that login's identity and no one else's, and it can be connected again", async () => {
    const first = await owner(); const second = await owner(); const k = key(); const other = key(); const pending = key();
    await one.connectAppleIdentity(first.userId, k, { email: address(), isPrivateEmail: false });
    await one.connectAppleIdentity(second.userId, other, { isPrivateEmail: false });
    await one.recordPendingAppleIdentity(pending, { email: first.email, isPrivateEmail: false });
    const total = async () => (await pool.query("SELECT count(*)::int AS n FROM apple_identities")).rows[0].n;
    const before = await total();
    assert.equal(await one.disconnectAppleIdentity(first.userId), true);
    assert.equal(await raw(k), undefined); assert.equal(await one.getAppleIdentityForLogin(first.userId), undefined);
    assert.equal((await raw(other)).user_id, second.userId); assert.equal((await raw(pending)).user_id, null);
    assert.equal(await total(), before - 1);
    // Nothing to remove: false, and nothing changes. A pending row belongs to no login and stays.
    assert.equal(await one.disconnectAppleIdentity(first.userId), false);
    assert.equal(await one.disconnectAppleIdentity(2_000_000_000), false);
    assert.equal(await total(), before - 1);
    // The login and its business are untouched; the identity is unknown again and can be connected, to anyone.
    assert.equal((await pool.query("SELECT status FROM users WHERE id=$1", [first.userId])).rows[0].status, "active");
    assert.equal(await one.connectAppleIdentity(second.userId, k, { isPrivateEmail: false }), "login-has-another");
    assert.equal(await one.connectAppleIdentity(first.userId, k, { isPrivateEmail: false }), "connected");
    assert.equal((await raw(k)).user_id, first.userId);
  });

  await check("a login's identity is read by that login's id alone", async () => {
    const who = await owner(); const stranger = await owner(); const k = key();
    await one.recordPendingAppleIdentity(key(), { email: who.email, isPrivateEmail: false });
    assert.equal(await one.getAppleIdentityForLogin(who.userId), undefined);
    await one.connectAppleIdentity(who.userId, k, { isPrivateEmail: false });
    assert.equal((await one.getAppleIdentityForLogin(who.userId)).subject, k.subject);
    assert.equal(await one.getAppleIdentityForLogin(stranger.userId), undefined);
    assert.equal(await one.getAppleIdentityForLogin(2_000_000_000), undefined);
  });
} finally {
  await Promise.all([pool.end(), otherPool.end()]);
}
console.log(`APPLE CONNECT POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
