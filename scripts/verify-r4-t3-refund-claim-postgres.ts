/**
 * R4-T3 on actual PostgreSQL (docs/decisions/2026-10-14-r4-t3-atomic-refund-claim.md): the refund
 * claim, send intent and settle in DatabaseStorage, against migration 0048's checks and trigger,
 * from an empty database with a non-UTC session time zone. Concurrency uses two connections.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-r4-t3-refund-claim-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const options = "-c TimeZone=Pacific/Auckland";
const pools = [new pg.Pool({ connectionString: testDatabaseUrl, max: 6, options }), new pg.Pool({ connectionString: testDatabaseUrl, max: 6, options })];
const [pool] = pools;
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${(error as Error).message}`); }
}
const token = () => randomBytes(6).toString("hex");

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const [one, two] = pools.map((p) => new DatabaseStorage(drizzle(p, { schema }) as any));

  {
    const client = await pool.connect();
    try {
      await runner.ensureMigrationLedger(client);
      for (const file of runner.listMigrationFiles()) {
        if (file === "0023_uploaded_files_tenant_column.sql") break;
        await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
      }
      const inventories = await import("../server/upload-ownership-inventory");
      const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
      const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
      const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-14T00:00:00Z" });
      const source = JSON.stringify(inventory);
      const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
      await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    } finally { client.release(); }
  }

  const merchant = async () => (await pool.query(`INSERT INTO merchants (name, business_name, email, status) VALUES ('Synthetic', 'Synthetic', $1, 'active') RETURNING id`,
    [`r4t3-${token()}@example.test`])).rows[0].id as number;
  const owner = async (merchantId: number) => (await pool.query(`INSERT INTO users (email, password, merchant_id, role) VALUES ($1, 'synthetic-hash', $2, 'owner') RETURNING id`,
    [`r4t3-user-${token()}@example.test`, merchantId])).rows[0].id as number;
  const A = await merchant(), B = await merchant();
  const userA = await owner(A), userB = await owner(B);
  // Each sale's seeded legacy refunded cents, for the closing invariant.
  const seeded = new Map<number, number>();
  const sale = async (over: { merchantId?: number; price?: string; status?: string; capture?: string | null; refunded?: string; split?: boolean } = {}) => {
    const id = (await pool.query(`INSERT INTO transactions (merchant_id, item_name, price, status, windcave_transaction_id, total_refunded, refundable_amount, is_split)
      VALUES ($1, 'Synthetic sale', $2, $3, $4, $5, $2, $6) RETURNING id`,
      [over.merchantId ?? A, over.price ?? "20.00", over.status ?? "completed", over.capture === undefined ? `cap${token()}` : over.capture,
        over.refunded ?? "0.00", over.split ?? false])).rows[0].id as number;
    seeded.set(id, Math.round(Number(over.refunded ?? "0.00") * 100));
    return id;
  };
  const claim = (store: typeof one, transactionId: number, over: Record<string, unknown> = {}) => store.claimRefundOperationForMerchant(A, {
    merchantId: A, userId: userA, transactionId, idempotencyKey: randomUUID(), amountCents: 500, reasonText: "Synthetic", ...over } as any);
  const events = async (operationId: string) => (await pool.query(`SELECT event_type FROM transaction_events WHERE payload->>'operationId' = $1 ORDER BY created_at, id`, [operationId]))
    .rows.map((r) => r.event_type);
  const submitted = async (over: Parameters<typeof sale>[0] = {}) => {
    const id = await sale(over);
    const claimed = await claim(one, id); assert.equal(claimed.kind, "claimed"); if (claimed.kind !== "claimed") throw new Error("fixture");
    assert.equal((await one.markRefundSubmittedForMerchant(claimed.operation.operationId, A, claimed.leaseOwner, "uat")).kind, "submitted");
    return { id, op: claimed.operation, lease: claimed.leaseOwner };
  };
  const saleRow = async (id: number) => (await pool.query(`SELECT status, total_refunded, refundable_amount FROM transactions WHERE id = $1`, [id])).rows[0];

  await check("a claim writes one requested operation 0048 accepts, and one audit event", async () => {
    const id = await sale();
    const result = await claim(one, id);
    assert.equal(result.kind, "claimed"); if (result.kind !== "claimed") return;
    const row = (await pool.query(`SELECT state, status, amount_cents, refund_amount, merchant_reference, operation_id, processor_x_id,
      lease_owner, next_reconciliation_at = lease_expires_at AS due_at_lease_end, requested_at <= now() AS stamped FROM refunds WHERE id = $1`, [result.operation.id])).rows[0];
    assert.deepEqual({ state: row.state, status: row.status, cents: row.amount_cents, amount: row.refund_amount, due: row.due_at_lease_end, stamped: row.stamped },
      { state: "requested", status: "pending", cents: "500", amount: "5.00", due: true, stamped: true });
    assert.equal(row.merchant_reference, `TAPTR_${row.operation_id.replace(/-/g, "")}`);
    assert.match(row.processor_x_id, /^[0-9a-f]{32}$/);
    assert.deepEqual(await events(result.operation.operationId), ["Refund_Requested"]);
  });

  await check("the same key replays (any case, any reason); a different payload or sale conflicts; another key waits for the live one", async () => {
    const id = await sale(), key = randomUUID();
    assert.equal((await claim(one, id, { idempotencyKey: key })).kind, "claimed");
    assert.equal((await claim(two, id, { idempotencyKey: key.toUpperCase(), reasonText: "Reworded" })).kind, "reused");
    assert.equal((await claim(one, id, { idempotencyKey: key, amountCents: 600 })).kind, "conflict");
    assert.equal((await claim(one, await sale(), { idempotencyKey: key })).kind, "conflict");
    assert.deepEqual(await claim(one, id), { kind: "in-progress" });
  });

  await check("what cannot be refunded is refused before anything is written", async () => {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM refunds`)).rows[0].n;
    assert.deepEqual(await claim(one, await sale({ status: "pending" })), { kind: "not-refundable", reason: "status" });
    assert.deepEqual(await claim(one, await sale({ split: true })), { kind: "not-refundable", reason: "split" });
    assert.deepEqual(await claim(one, await sale({ capture: null })), { kind: "not-refundable", reason: "capture_missing" });
    assert.deepEqual(await claim(one, await sale({ capture: "WC_1.5" })), { kind: "not-refundable", reason: "capture_invalid" });
    assert.deepEqual(await claim(one, await sale({ merchantId: B })), { kind: "not-found" });
    assert.deepEqual(await claim(one, await sale(), { userId: userB }), { kind: "not-found" });
    assert.deepEqual(await claim(one, await sale({ refunded: "18.00" }), { amountCents: 201 }), { kind: "insufficient", remainingCents: 200 });
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM refunds`)).rows[0].n, before);
  });

  await check("two connections with different keys on one sale: one claim, one in-progress", async () => {
    const id = await sale();
    const results = await Promise.all([claim(one, id), claim(two, id), claim(one, id), claim(two, id)]);
    assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
    assert.equal(results.filter((r) => r.kind === "in-progress").length, 3);
  });

  await check("two connections with the same key: one claim, the rest replays (advisory lock, no 23505)", async () => {
    const id = await sale(), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => claim(i % 2 ? two : one, id, { idempotencyKey: key })));
    assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
    assert.equal(results.filter((r) => r.kind === "reused").length, 5);
  });

  await check("the send intent happens once, for the lease holder, in the operation's environment", async () => {
    const id = await sale();
    const claimed = await claim(one, id); if (claimed.kind !== "claimed") throw new Error("fixture");
    const op = claimed.operation;
    assert.equal((await one.markRefundSubmittedForMerchant(op.operationId, A, randomUUID(), "uat")).kind, "not-sent");
    assert.equal((await one.markRefundSubmittedForMerchant(op.operationId, A, claimed.leaseOwner, "production")).kind, "not-sent");
    assert.equal((await one.markRefundSubmittedForMerchant(op.operationId, B, claimed.leaseOwner, "uat")).kind, "not-found");
    const [first, second] = await Promise.all([one.markRefundSubmittedForMerchant(op.operationId, A, claimed.leaseOwner, "uat"),
      two.markRefundSubmittedForMerchant(op.operationId, A, claimed.leaseOwner, "uat")]);
    assert.deepEqual([first.kind, second.kind].sort(), ["not-sent", "submitted"]);
    assert.deepEqual(await events(op.operationId), ["Refund_Requested", "Refund_Submitted"]);
  });

  await check("another request takes over a requested operation only once its lease has expired (database time)", async () => {
    const id = await sale();
    const claimed = await claim(one, id); if (claimed.kind !== "claimed") throw new Error("fixture");
    assert.equal((await two.markRefundSubmittedForMerchant(claimed.operation.operationId, A, randomUUID(), "uat")).kind, "not-sent");
    await pool.query(`UPDATE refunds SET lease_expires_at = now() - interval '1 second', next_reconciliation_at = now() - interval '1 second' WHERE id = $1`, [claimed.operation.id]);
    const taken = await two.markRefundSubmittedForMerchant(claimed.operation.operationId, A, randomUUID(), "uat");
    assert.equal(taken.kind, "submitted");
    assert.equal((await one.markRefundSubmittedForMerchant(claimed.operation.operationId, A, claimed.leaseOwner, "uat")).kind, "not-sent");
  });

  await check("refunded: succeeded, and the totals and status move in the same transaction", async () => {
    const { id, op, lease } = await submitted();
    const settled = await one.settleRefundOperationForMerchant(op.operationId, A, lease, { kind: "refunded", refundTransactionId: `ref${token()}` });
    assert.equal(settled.kind, "settled");
    assert.equal((settled as any).operation.state, "succeeded");
    assert.deepEqual(await saleRow(id), { status: "partially_refunded", total_refunded: "5.00", refundable_amount: "15.00" });
    const full = await submitted({ refunded: "15.00" });
    await one.settleRefundOperationForMerchant(full.op.operationId, A, full.lease, { kind: "refunded", refundTransactionId: `ref${token()}` });
    assert.deepEqual(await saleRow(full.id), { status: "refunded", total_refunded: "20.00", refundable_amount: "0.00" });
    assert.deepEqual(await events(op.operationId), ["Refund_Requested", "Refund_Submitted", "Refund_Succeeded"]);
  });

  await check("a refund ID another operation holds is caught in a savepoint and parks the operation, totals untouched", async () => {
    const shared = `ref${token()}`;
    const first = await submitted();
    await one.settleRefundOperationForMerchant(first.op.operationId, A, first.lease, { kind: "refunded", refundTransactionId: shared });
    const second = await submitted();
    const dup = await one.settleRefundOperationForMerchant(second.op.operationId, A, second.lease, { kind: "refunded", refundTransactionId: shared });
    assert.equal((dup as any).operation.state, "unknown");
    const row = (await pool.query(`SELECT state, next_reconciliation_at, last_error_code, provider_refund_transaction_id FROM refunds WHERE id = $1`, [second.op.id])).rows[0];
    assert.deepEqual(row, { state: "unknown", next_reconciliation_at: null, last_error_code: "provider_refund_id_invalid", provider_refund_transaction_id: null });
    assert.equal((await saleRow(second.id)).total_refunded, "0.00");
  });

  await check("declined, pending, mismatch and a thrown call each write what 0048 accepts", async () => {
    for (const [outcome, state, parked] of [
      [{ kind: "declined" }, "failed", false], [{ kind: "pending", refundTransactionId: `pend${token()}` }, "unknown", false],
      [{ kind: "mismatch", field: "amount" }, "unknown", true], [{ kind: "thrown" }, "unknown", false],
      [{ kind: "rejected", status: 404 }, "failed", false], [{ kind: "unknown", reason: "timeout" }, "unknown", false],
    ] as const) {
      const { id, op, lease } = await submitted();
      const settled = await one.settleRefundOperationForMerchant(op.operationId, A, lease, outcome as any);
      assert.equal((settled as any).operation.state, state, JSON.stringify(outcome));
      const row = (await pool.query(`SELECT next_reconciliation_at IS NULL AS parked FROM refunds WHERE id = $1`, [op.id])).rows[0];
      if (state === "unknown") assert.equal(row.parked, parked, JSON.stringify(outcome));
      assert.equal((await saleRow(id)).total_refunded, "0.00");
    }
  });

  await check("the lease holder still settles after its lease expired; anyone else changes nothing", async () => {
    const { op, lease } = await submitted();
    await pool.query(`UPDATE refunds SET lease_expires_at = now() - interval '1 second', next_reconciliation_at = now() - interval '1 second' WHERE id = $1`, [op.id]);
    assert.equal((await one.settleRefundOperationForMerchant(op.operationId, A, randomUUID(), { kind: "declined" })).kind, "unchanged");
    assert.equal((await one.settleRefundOperationForMerchant(op.operationId, A, lease, { kind: "declined" })).kind, "settled");
    assert.equal((await one.settleRefundOperationForMerchant(op.operationId, A, lease, { kind: "refunded", refundTransactionId: `r${token()}` })).kind, "unchanged");
  });

  await check("the legacy path is fenced on any operation; it still works on a sale without one", async () => {
    const { id, op, lease } = await submitted();
    await one.settleRefundOperationForMerchant(op.operationId, A, lease, { kind: "refunded", refundTransactionId: `fin${token()}` });
    assert.equal(await one.releaseRefundAmountForMerchant(id, A, 5), false);
    assert.equal(await one.reserveRefundAmountForMerchant(id, A, 1), null);
    assert.equal(await one.updateRefundStatusForMerchant(op.id, A, "failed"), undefined);
    assert.deepEqual(await saleRow(id), { status: "partially_refunded", total_refunded: "5.00", refundable_amount: "15.00" });
    const plain = await sale();
    assert.notEqual(await one.reserveRefundAmountForMerchant(plain, A, 2), null);
    assert.equal(await one.releaseRefundAmountForMerchant(plain, A, 2), true);
  });

  await check("a legacy release waiting on the sale lock sees an operation committed meanwhile, and refuses", async () => {
    const id = await sale();
    const holder = await pools[1].connect();
    let pending: Promise<boolean> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT id FROM transactions WHERE id = $1 FOR UPDATE`, [id]);
      pending = one.releaseRefundAmountForMerchant(id, A, 1);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const capture = (await holder.query(`SELECT windcave_transaction_id FROM transactions WHERE id = $1`, [id])).rows[0].windcave_transaction_id;
      await holder.query(`INSERT INTO refunds (transaction_id, merchant_id, refund_amount, refund_method, status, state, idempotency_key, request_fingerprint,
          processor_x_id, merchant_reference, original_provider_transaction_id, original_share_index, provider_environment, amount_cents, currency,
          initiated_by_user_id, requested_at, updated_at, next_reconciliation_at, lease_owner, lease_expires_at)
        VALUES ($1, $2, '1.00', 'original_payment_method', 'pending', 'requested', $3, $4, $5, $6, $7, 0, 'uat', 100, 'NZD', $8, now(), now(),
          now() + interval '1 minute', $9, now() + interval '1 minute')`,
        [id, A, randomUUID(), "a".repeat(64), token(), `TAPTR_${token()}`, capture, userA, randomUUID()]);
      await holder.query("COMMIT");
      assert.equal(await pending, false);
    } finally { holder.release(); if (pending) await pending.catch(() => undefined); }
  });

  await check("invariant: every sale's total_refunded is its seeded legacy amount plus its succeeded operations", async () => {
    const rows = (await pool.query(`SELECT t.id, round(coalesce(t.total_refunded, 0) * 100)::int AS total,
        coalesce((SELECT sum(r.amount_cents) FROM refunds r WHERE r.transaction_id = t.id AND r.state = 'succeeded'), 0)::int AS succeeded
      FROM transactions t WHERE t.id = ANY($1::int[])`, [[...seeded.keys()]])).rows;
    assert.ok(rows.length > 10);
    for (const row of rows) assert.equal(row.total, seeded.get(row.id)! + row.succeeded, `sale ${row.id}`);
  });
} finally {
  await Promise.all(pools.map((p) => p.end()));
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
