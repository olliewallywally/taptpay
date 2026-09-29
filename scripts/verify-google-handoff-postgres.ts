/** R1-T4 sign-in storage against real PostgreSQL: phase A's one-time code (Google sign-in),
 * phase D's session versions (a password reset and "sign out everywhere"), the push
 * subscriptions each login now owns (0029), and phase C's shared sign-in throttle (0028).
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
  // Phase D follow-up: push_subscriptions.user_id (0029, owner decision 2026-09-22).
  const otherMerchant = (await pool.query(`INSERT INTO merchants(name,business_name,email,status)
    VALUES ('Other','Other','other@r1-t4.test','active') RETURNING id`)).rows[0].id as number;
  const otherLogin = (await pool.query(`INSERT INTO users(email,password,merchant_id,role)
    VALUES ('other@r1-t4.test','synthetic-not-a-hash',$1,'owner') RETURNING id`, [otherMerchant])).rows[0].id as number;
  const push = (name: string) => `https://push.r1-t4.test/${name}`;
  const subscribe = async (merchantId: number, userId: number | null, endpoint: string, via = one) =>
    assert.ok(await via.createPushSubscription({ merchantId, userId, endpoint, p256dh: "synthetic", auth: "synthetic" }),
      `subscription ${endpoint} was stored`);
  const pushRows = async (endpoints: string[]) => Object.fromEntries((await pool.query(
    "SELECT endpoint, is_active, user_id FROM push_subscriptions WHERE endpoint = ANY($1)", [endpoints])).rows
    .map((r) => [r.endpoint, { active: r.is_active, userId: r.user_id }]));
  const activeOf = async (endpoints: string[]) =>
    Object.fromEntries(Object.entries(await pushRows(endpoints)).map(([k, v]) => [k, v.active]));
  await check("a subscription records its login, and moves with the device to the next login that registers it", async () => {
    const [first, second] = [await addUser("push-first@r1-t4.test", "member"), await addUser("push-second@r1-t4.test", "member")];
    await subscribe(merchant, first, push("shared"));
    assert.deepEqual(await pushRows([push("shared")]), { [push("shared")]: { active: true, userId: first } });
    await subscribe(merchant, second, push("shared"), two);
    assert.deepEqual(await pushRows([push("shared")]), { [push("shared")]: { active: true, userId: second } });
  });
  await check("a subscription cannot name a login that does not exist", async () => {
    const quiet = console.error;
    console.error = () => undefined; // createPushSubscription logs the refusal it returns as null.
    try {
      assert.equal(await one.createPushSubscription({ merchantId: merchant, userId: 2_000_000_000,
        endpoint: push("nobody"), p256dh: "synthetic", auth: "synthetic" }), null);
    } finally { console.error = quiet; }
  });
  await check("ending a login's sessions stops its devices and its business's unattributed ones, never a teammate's or another business's", async () => {
    const [ended, teammate] = [await addUser("push-ended@r1-t4.test", "member"), await addUser("push-teammate@r1-t4.test", "member")];
    await subscribe(merchant, ended, push("ended-web"));
    await subscribe(merchant, ended, "apns://ended-phone-token");
    await subscribe(merchant, null, push("unattributed-web"));
    await subscribe(merchant, null, "apns://unattributed-phone-token");
    await subscribe(merchant, teammate, push("teammate-web"));
    await subscribe(otherMerchant, otherLogin, push("other-web"));
    await subscribe(otherMerchant, null, push("other-unattributed-web"));
    await two.deactivatePushSubscriptionsForLogin(merchant, ended);
    assert.deepEqual(await activeOf([push("ended-web"), "apns://ended-phone-token", push("unattributed-web"),
      "apns://unattributed-phone-token", push("teammate-web"), push("other-web"), push("other-unattributed-web")]), {
      [push("ended-web")]: false, "apns://ended-phone-token": false, [push("unattributed-web")]: false,
      "apns://unattributed-phone-token": false, [push("teammate-web")]: true, [push("other-web")]: true,
      [push("other-unattributed-web")]: true,
    });
  });
  await check("turning notifications off with no device token stops that login's and its business's unattributed iPhones only", async () => {
    const [phoneOwner, teammate] = [await addUser("push-phone@r1-t4.test", "member"), await addUser("push-phone-mate@r1-t4.test", "member")];
    await subscribe(merchant, phoneOwner, "apns://phone-owner-token");
    await subscribe(merchant, phoneOwner, push("phone-owner-web"));
    await subscribe(merchant, null, "apns://phone-unattributed-token");
    await subscribe(merchant, null, push("phone-unattributed-web"));
    await subscribe(merchant, teammate, "apns://phone-mate-token");
    await subscribe(otherMerchant, null, "apns://other-unattributed-token");
    await one.deactivateNativePushSubscriptionsForLogin(merchant, phoneOwner);
    assert.deepEqual(await activeOf(["apns://phone-owner-token", push("phone-owner-web"), "apns://phone-unattributed-token",
      push("phone-unattributed-web"), "apns://phone-mate-token", "apns://other-unattributed-token"]), {
      "apns://phone-owner-token": false, [push("phone-owner-web")]: true, "apns://phone-unattributed-token": false,
      [push("phone-unattributed-web")]: true, "apns://phone-mate-token": true, "apns://other-unattributed-token": true,
    });
  });
  await check("a deleted login's subscriptions are deleted with it; unattributed ones stay", async () => {
    const leaving = await addUser("push-leaving@r1-t4.test", "member");
    await subscribe(merchant, leaving, push("leaving"));
    await subscribe(merchant, null, push("staying"));
    await pool.query("DELETE FROM users WHERE id=$1", [leaving]);
    assert.deepEqual(Object.keys(await pushRows([push("leaving"), push("staying")])), [push("staying")]);
  });
  // Phase C: auth_throttle (0028) — attempts counted across instances, slowed not locked.
  const throttle = await import("../server/auth-throttle");
  const { SIGN_IN_POLICY } = throttle;
  const bucketOf = (key: string) => ({ key, policy: SIGN_IN_POLICY });
  const throttleRow = async (key: string) => (await pool.query(
    "SELECT failures, next_allowed_at FROM auth_throttle WHERE bucket_key=$1", [key])).rows[0] as
    { failures: number; next_allowed_at: Date | null } | undefined;
  const take = (buckets: { key: string; policy: typeof SIGN_IN_POLICY }[], via = one) =>
    via.takeAuthThrottleSlot(buckets, new Date());
  await check("24 simultaneous sign-in attempts from two instances: exactly 5 let through and counted; no email stored", async () => {
    const bucket = throttle.signInAccountBucket("merchant", "Burst@R1-T4.test");
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => take([bucket], i % 2 ? two : one)));
    assert.equal(results.filter((r) => r.allowed).length, 5);
    const stored = await throttleRow(bucket.key);
    assert.equal(stored?.failures, 5);
    const wait = stored!.next_allowed_at!.getTime() - started;
    assert.ok(wait >= 30_000 && wait < 35_000, `the fifth starts a 30-second wait (${wait} ms)`);
    assert.ok(!bucket.key.includes("@") && !/burst/i.test(bucket.key), "the key holds no email");
  });
  await check("a waiting bucket refuses, says how long, and counts nothing", async () => {
    const bucket = throttle.signInAccountBucket("merchant", "burst@r1-t4.test");
    const refused = await take([bucket], two);
    assert.equal(refused.allowed, false);
    assert.ok(!refused.allowed && refused.retryAfterMs > 25_000 && refused.retryAfterMs <= 30_000);
    assert.equal((await throttleRow(bucket.key))?.failures, 5);
  });
  await check("an attempt counts against every bucket or none: one waiting bucket refuses the lot", async () => {
    const waiting = throttle.signInAccountBucket("merchant", "burst@r1-t4.test");
    const [fresh, other] = [bucketOf("verifier-all-or-none:fresh"), bucketOf("verifier-all-or-none:other")];
    assert.equal((await take([fresh, waiting])).allowed, false);
    assert.equal((await throttleRow(fresh.key))?.failures ?? 0, 0, "the free bucket was not counted");
    assert.equal((await take([other, fresh], two)).allowed, true);
    assert.deepEqual([(await throttleRow(fresh.key))?.failures, (await throttleRow(other.key))?.failures], [1, 1]);
  });
  await check("20 attempts naming two buckets in opposite orders, from two instances: no deadlock, 5 through", async () => {
    const [a, b] = [bucketOf("verifier-order:a"), bucketOf("verifier-order:b")];
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      take(i % 2 ? [a, b] : [b, a], i % 4 < 2 ? one : two)));
    assert.equal(results.filter((r) => r.allowed).length, 5);
    assert.deepEqual([(await throttleRow(a.key))?.failures, (await throttleRow(b.key))?.failures], [5, 5]);
  });
  await check("a void attempt gives back its count and its wait; a success clears the bucket", async () => {
    const bucket = bucketOf("verifier-settle:x");
    for (let i = 0; i < 5; i += 1) assert.equal((await take([bucket])).allowed, true);
    assert.ok((await throttleRow(bucket.key))?.next_allowed_at, "the fifth started a wait");
    await two.settleAuthThrottle([bucket], "void", new Date());
    assert.deepEqual(await throttleRow(bucket.key), { failures: 4, next_allowed_at: null });
    assert.equal((await take([bucket])).allowed, true, "let through again at once");
    await one.settleAuthThrottle([bucket], "success", new Date());
    assert.deepEqual(await throttleRow(bucket.key), { failures: 0, next_allowed_at: null });
  });
  await check("forgetting clears the named keys and every key under a prefix — and nothing else", async () => {
    const keys = ["signin-device:v1:phone", "signin-device:v1:laptop", "signin-device:v2:phone",
      "signin-account:v1", "wild_%:1", "wildAB:1"];
    for (const key of keys) await take([bucketOf(key)]);
    await two.forgetAuthThrottle(["signin-account:v1"], ["signin-device:v1:", "wild_%:"]);
    const left = (await pool.query("SELECT bucket_key FROM auth_throttle WHERE bucket_key = ANY($1) ORDER BY 1", [keys]))
      .rows.map((r) => r.bucket_key);
    assert.deepEqual(left, ["signin-device:v2:phone", "wildAB:1"]);
  });
  await check("rows untouched for a day are reclaimed by the next attempt; a day less a minute stays", async () => {
    await pool.query(`INSERT INTO auth_throttle(bucket_key, failures, updated_at) VALUES
      ('verifier-reclaim:old', 3, now() - interval '1 day 1 minute'),
      ('verifier-reclaim:recent', 3, now() - interval '1 day' + interval '1 minute')`);
    await take([bucketOf("verifier-reclaim:trigger")], two);
    assert.equal(await throttleRow("verifier-reclaim:old"), undefined);
    assert.equal((await throttleRow("verifier-reclaim:recent"))?.failures, 3);
  });
  await check("an attempt's reclaim skips a row another attempt holds — never waits for it, never deletes it", async () => {
    await pool.query(`INSERT INTO auth_throttle(bucket_key, failures, updated_at)
      VALUES ('verifier-held:stale', 2, now() - interval '2 days')`);
    const blocker = await pool.connect();
    let outcome: unknown;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM auth_throttle WHERE bucket_key='verifier-held:stale' FOR UPDATE");
      outcome = await Promise.race([
        take([bucketOf("verifier-held:other")], two).then(() => "done"),
        new Promise((resolve) => setTimeout(resolve, 3_000, "blocked")),
      ]);
    } finally {
      await blocker.query("COMMIT").catch(() => undefined);
      blocker.release();
    }
    assert.equal(outcome, "done", "the attempt queued behind a row it was only tidying away");
    assert.equal((await throttleRow("verifier-held:stale"))?.failures, 2, "a held row is left for a later reclaim");
  });
  await check("a row deleted while an attempt waits to lock it is made again and counted, not lost", async () => {
    const bucket = bucketOf("verifier-vanish:x");
    await take([bucket]);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM auth_throttle WHERE bucket_key=$1 FOR UPDATE", [bucket.key]);
      const pending = take([bucket], two);
      for (let i = 0; ; i += 1) {
        const waiting = await pool.query(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`);
        if (waiting.rows[0].n > 0) break;
        assert.ok(i < 100, "the attempt never queued behind the lock");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await blocker.query("DELETE FROM auth_throttle WHERE bucket_key=$1", [bucket.key]);
      await blocker.query("COMMIT");
      assert.equal((await pending).allowed, true);
      assert.deepEqual(await throttleRow(bucket.key), { failures: 1, next_allowed_at: null });
    } finally { blocker.release(); }
  });
  assert.deepEqual(failures, [], "R1-T4 sign-in PostgreSQL verification failed");
  console.log("R1-T4 sign-in PostgreSQL verification passed");
} finally {
  await Promise.all(pools.map((p) => p.end()));
}
