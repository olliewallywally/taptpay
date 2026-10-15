/**
 * R1-T5b on actual PostgreSQL: Apple identities (migration 0033) and the one-transaction creation of
 * a business with its identity.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-apple-identities-postgres.ts
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
const business = (email: string) => ({ name: "Synthetic Owner", businessName: "Synthetic Owner", email });

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
  const { DatabaseStorage, AppleIdentityTakenError } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(otherPool, { schema }) as any) as any;
  const counts = async () => (await pool.query(
    "SELECT (SELECT count(*) FROM merchants)::int AS merchants, (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM apple_identities)::int AS identities, (SELECT count(*) FROM merchant_subscriptions)::int AS subscriptions")).rows[0];
  const raw = async (k: { subject: string }) => (await pool.query("SELECT * FROM apple_identities WHERE subject=$1", [k.subject])).rows[0];

  await check("an identity is found only by issuer, client id and subject together", async () => {
    const k = key();
    await one.recordPendingAppleIdentity(k, { email: address(), isPrivateEmail: false });
    assert.equal((await one.getAppleIdentity(k))?.subject, k.subject);
    assert.equal(await one.getAppleIdentity({ ...k, issuer: "https://appleid.apple.com.example.test" }), undefined);
    assert.equal(await one.getAppleIdentity({ ...k, clientId: "nz.taptpay.other" }), undefined);
    assert.equal(await one.getAppleIdentity(key()), undefined);
    // The same subject under another client id is a different identity, and both can exist.
    await one.recordPendingAppleIdentity({ ...k, clientId: "nz.taptpay.other" }, { isPrivateEmail: false });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM apple_identities WHERE subject=$1", [k.subject])).rows[0].n, 2);
  });

  await check("a pending identity is recorded once, keeps the first email it is given and no later one", async () => {
    const k = key(); const first = address("first");
    const made = await one.recordPendingAppleIdentity(k, { isPrivateEmail: false });
    assert.equal(made.userId, null); assert.equal(made.email, null); assert.equal(made.linkedAt, null);
    assert.equal((await one.recordPendingAppleIdentity(k, { email: first, isPrivateEmail: true })).email, first);
    const again = await one.recordPendingAppleIdentity(k, { email: address("later"), isPrivateEmail: false });
    assert.equal(again.id, made.id); assert.equal(again.email, first); assert.equal(again.isPrivateEmail, true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM apple_identities WHERE subject=$1", [k.subject])).rows[0].n, 1);
  });

  await check("a new business, its owner login, its subscription and its identity are made together", async () => {
    const k = key(); const email = address("owner");
    const before = await counts();
    const { merchant, userId } = await one.createMerchantWithAppleIdentity(business(`  ${email.toUpperCase()} `), "synthetic-hash", k, { isPrivateEmail: true });
    assert.equal(merchant.email, email); assert.equal(merchant.status, "verified");
    const login = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
    assert.equal(login.merchant_id, merchant.id); assert.equal(login.role, "owner"); assert.equal(login.email, email);
    const identity = await raw(k);
    assert.equal(identity.user_id, userId); assert.equal(identity.email, email); assert.equal(identity.is_private_email, true); assert.ok(identity.linked_at);
    const after = await counts();
    assert.deepEqual(after, { merchants: before.merchants + 1, users: before.users + 1, identities: before.identities + 1, subscriptions: before.subscriptions + 1 });
  });

  await check("a pending identity becomes the new login's own; its row is kept, not duplicated", async () => {
    const k = key(); const email = address("pending");
    const pending = await one.recordPendingAppleIdentity(k, { email, isPrivateEmail: false });
    const { userId } = await one.createMerchantWithAppleIdentity(business(email), "synthetic-hash", k, { isPrivateEmail: false });
    const identity = await raw(k);
    assert.equal(identity.id, pending.id); assert.equal(identity.user_id, userId); assert.ok(identity.linked_at);
  });

  await check("a linked identity is never moved: the second creation fails and makes nothing", async () => {
    const k = key();
    const first = await one.createMerchantWithAppleIdentity(business(address("first")), "synthetic-hash", k, { isPrivateEmail: false });
    const before = await counts();
    await assert.rejects(one.createMerchantWithAppleIdentity(business(address("second")), "synthetic-hash", k, { isPrivateEmail: false }), AppleIdentityTakenError);
    assert.deepEqual(await counts(), before);
    assert.equal((await raw(k)).user_id, first.userId);
    // Recording it as pending again changes nothing either.
    const row = await raw(k);
    await one.recordPendingAppleIdentity(k, { email: address("attacker"), isPrivateEmail: true });
    assert.deepEqual(await raw(k), row);
  });

  await check("an address a business already uses makes nothing, and leaves no identity behind", async () => {
    const email = address("taken");
    await one.createMerchantWithAppleIdentity(business(email), "synthetic-hash", key(), { isPrivateEmail: false });
    const k = key(); const before = await counts();
    await assert.rejects(one.createMerchantWithAppleIdentity(business(email.toUpperCase()), "synthetic-hash", k, { isPrivateEmail: false }));
    assert.deepEqual(await counts(), before);
    assert.equal(await raw(k), undefined);
  });

  await check("an identity that cannot be written leaves no business, login or subscription", async () => {
    const before = await counts();
    await pool.query(`CREATE FUNCTION t5b_refuse_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic identity failure'; END $$`);
    await pool.query("CREATE TRIGGER t5b_refuse_identity BEFORE INSERT ON apple_identities FOR EACH ROW EXECUTE FUNCTION t5b_refuse_identity()");
    try {
      await assert.rejects(one.createMerchantWithAppleIdentity(business(address("rolled")), "synthetic-hash", key(), { isPrivateEmail: false }));
    } finally {
      await pool.query("DROP TRIGGER t5b_refuse_identity ON apple_identities");
      await pool.query("DROP FUNCTION t5b_refuse_identity()");
    }
    assert.deepEqual(await counts(), before);
  });

  await check("two first sign-ins at once make one business for the identity", async () => {
    for (let round = 0; round < 6; round++) {
      const k = key(); const email = address(`race${round}`); const before = await counts();
      const results = await Promise.allSettled([
        one.createMerchantWithAppleIdentity(business(email), "synthetic-hash", k, { isPrivateEmail: false }),
        two.createMerchantWithAppleIdentity(business(email), "synthetic-hash", k, { isPrivateEmail: false }),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const after = await counts();
      assert.deepEqual(after, { merchants: before.merchants + 1, users: before.users + 1, identities: before.identities + 1, subscriptions: before.subscriptions + 1 });
      const winner = (results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<any>).value;
      assert.equal((await raw(k)).user_id, winner.userId);
    }
  });

  await check("the same person under two different addresses at once: one identity, one business", async () => {
    const k = key(); const before = await counts();
    const results = await Promise.allSettled([
      one.createMerchantWithAppleIdentity(business(address("a")), "synthetic-hash", k, { isPrivateEmail: false }),
      two.createMerchantWithAppleIdentity(business(address("b")), "synthetic-hash", k, { isPrivateEmail: false }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await counts()).merchants, before.merchants + 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM apple_identities WHERE subject=$1", [k.subject])).rows[0].n, 1);
  });

  await check("the table's own rules: one identity per login, a login for every linked row, gone with its login", async () => {
    const k = key();
    const { userId, merchant } = await one.createMerchantWithAppleIdentity(business(address("rules")), "synthetic-hash", k, { isPrivateEmail: false });
    // A second Apple identity cannot be linked to the same login.
    await assert.rejects(pool.query(
      "INSERT INTO apple_identities(issuer,client_id,subject,user_id,linked_at) VALUES ($1,$2,$3,$4,now())", [ISSUER, CLIENT, key().subject, userId]));
    // Linked and unlinked are each all-or-nothing.
    await assert.rejects(pool.query("INSERT INTO apple_identities(issuer,client_id,subject,user_id) VALUES ($1,$2,$3,$4)", [ISSUER, CLIENT, key().subject, userId]));
    await assert.rejects(pool.query("INSERT INTO apple_identities(issuer,client_id,subject,linked_at) VALUES ($1,$2,$3,now())", [ISSUER, CLIENT, key().subject]));
    // The same subject twice under one issuer and client id is refused.
    await assert.rejects(pool.query("INSERT INTO apple_identities(issuer,client_id,subject) VALUES ($1,$2,$3)", [ISSUER, CLIENT, k.subject]));
    // A member login of the business goes: its own identity goes with it; the owner's stays.
    const member = (await pool.query(
      "INSERT INTO users(email,password,merchant_id,role,status) VALUES ($1,'synthetic-hash',$2,'member','active') RETURNING id", [address("member"), merchant.id])).rows[0].id;
    const memberKey = key();
    await pool.query("INSERT INTO apple_identities(issuer,client_id,subject,user_id,linked_at) VALUES ($1,$2,$3,$4,now())", [ISSUER, CLIENT, memberKey.subject, member]);
    await pool.query("DELETE FROM users WHERE id=$1", [member]);
    assert.equal(await raw(memberKey), undefined);
    assert.equal((await raw(k)).user_id, userId);
  });
} finally {
  await Promise.all([pool.end(), otherPool.end()]);
}
console.log(`APPLE IDENTITIES POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
