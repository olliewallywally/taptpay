/**
 * R4-T2 on actual PostgreSQL: migration 0039 (refund operations on `refunds`) from an empty
 * database, with a non-UTC session time zone throughout. It applies over legacy rows of any
 * shape (including R1's mismatched ones); legacy rows and every legacy writer are untouched;
 * and every rule of the ADR's operation shape and state graph accepts what it should and
 * refuses the rest.
 * docs/decisions/2026-10-14-r4-t2-refund-operation-schema.md
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-r4-t2-refund-operations-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync as readFileSyncFs } from "node:fs";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

const MIGRATION = "0039_refund_operations.sql";
const readFileSync = (file: string) => readFileSyncFs(`migrations/${file}`, "utf8");
// Every rule must hold whatever the session time zone (the 0037 lesson).
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4, options: "-c TimeZone=Pacific/Auckland" });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${(error as Error).message}`); }
}
type SqlError = { code?: string; constraint?: string; message: string; detail?: string; cause?: SqlError };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); } catch (error) { return error as SqlError; }
  throw new Error("expected the statement to be refused");
}
const fingerprint = () => createHash("sha256").update(randomBytes(16)).digest("hex");
const token = () => randomBytes(8).toString("hex");

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const storage = new DatabaseStorage(drizzle(pool, { schema }) as any);

  const client = await pool.connect();
  try {
    // Every migration before 0039 through the runner, from a copy of the folder; 0023-0025
    // take the (empty) upload-ownership inventory as in production.
    await runner.ensureMigrationLedger(client);
    const files = runner.listMigrationFiles();
    const position = files.indexOf(MIGRATION);
    assert.ok(position >= 0, "0039 is present in the complete migration history");
    assert.equal(position, files.length - 1, "0039 is the latest migration");
    const before = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), "r4t2-migrations-"));
    for (const file of files.slice(0, position)) await copyFile(`migrations/${file}`, path.join(before, file));
    for (const file of files) {
      if (file === "0023_uploaded_files_tenant_column.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const inventories = await import("../server/upload-ownership-inventory");
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-14T00:00:00Z" });
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { dir: before, log: () => undefined, uploadOwnershipInventory: verified });

    const merchant = async () => (await client.query(
      `INSERT INTO merchants (name, business_name, email, status) VALUES ('Synthetic', 'Synthetic', $1, 'active') RETURNING id`,
      [`r4t2-${token()}@example.test`])).rows[0].id as number;
    const captures = new Map<number, string>();
    const sale = async (merchantId: number) => {
      const capture = `cap${token()}`;
      const id = (await client.query(
        `INSERT INTO transactions (merchant_id, item_name, price, status, windcave_transaction_id) VALUES ($1, 'Synthetic sale', '999999.99', 'completed', $2) RETURNING id`,
        [merchantId, capture])).rows[0].id as number;
      captures.set(id, capture);
      return id;
    };
    const A = await merchant(), B = await merchant();
    const saleA = await sale(A), saleB = await sale(B);
    const owner = async (merchantId: number) => (await client.query(
      `INSERT INTO users (email, password, merchant_id, role) VALUES ($1, 'synthetic-hash', $2, 'owner') RETURNING id`,
      [`r4t2-user-${token()}@example.test`, merchantId])).rows[0].id as number;
    const user = await owner(A), userB = await owner(B);
    const legacyInsert = (transactionId: number, merchantId: number) => client.query(
      `INSERT INTO refunds (transaction_id, merchant_id, refund_amount, refund_method, status) VALUES ($1, $2, '5.00', 'original_payment_method', 'pending') RETURNING id`,
      [transactionId, merchantId]);
    const legacy = (await legacyInsert(saleA, A)).rows[0].id as number;
    const mismatched = (await legacyInsert(saleA, B)).rows[0].id as number;

    await check("0039 applies through the runner over legacy rows of any shape; they get an operation ID and stay legacy", async () => {
      await runner.applyMigration(client, MIGRATION, readFileSync(MIGRATION));
      const ledger = await client.query(`SELECT 1 FROM drizzle.applied_migrations WHERE filename = $1`, [MIGRATION]);
      assert.equal(ledger.rowCount, 1);
      const kept = await client.query(`SELECT state FROM refunds WHERE id = $1`, [mismatched]);
      assert.deepEqual(kept.rows, [{ state: null }], "R1's mismatched legacy row is left alone");
      const row = await client.query(`SELECT operation_id, state, attempt_count, status, refund_amount FROM refunds WHERE id = $1`, [legacy]);
      assert.match(row.rows[0].operation_id, /^[0-9a-f-]{36}$/);
      assert.deepEqual({ ...row.rows[0], operation_id: undefined },
        { operation_id: undefined, state: null, attempt_count: 0, status: "pending", refund_amount: "5.00" });
    });

    await check("0039's baseline contract finds every effect it declares", async () => {
      const { findMissingBaselineEffects } = await import("../server/migration-baseline-contract");
      assert.deepEqual(await findMissingBaselineEffects(client, [MIGRATION]), []);
    });

    await check("re-running 0039's body refuses the existing shape", async () => {
      const body = readFileSync(MIGRATION).replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
      await client.query("BEGIN");
      const error = await sqlError(() => client.query(body));
      await client.query("ROLLBACK");
      assert.match(error.message, /0039 aborted: a refund operation column or function already exists/);
    });

    await check("the legacy writers still work: create (scoped and not), complete with a provider ID, fail, and R1's ownership move", async () => {
      const unscoped = await storage.createRefund({ transactionId: saleA, merchantId: B, refundAmount: "2.00" });
      assert.equal(unscoped.state, null);
      const moved = await sale(A);
      await storage.createRefund({ transactionId: moved, merchantId: A, refundAmount: "1.00" });
      await client.query(`UPDATE transactions SET merchant_id = $1 WHERE id = $2`, [B, moved]);
      const created = await storage.createRefundForMerchant(saleA, A, { refundAmount: "2.50", refundReason: "Synthetic", refundMethod: "original_payment_method" });
      assert.ok(created);
      assert.equal(created.state, null);
      const completed = await storage.updateRefundStatusForMerchant(created.id, A, "completed", `legacy${token()}`);
      assert.equal(completed?.status, "completed");
      const other = await storage.createRefundForMerchant(saleA, A, { refundAmount: "1.00", refundReason: null, refundMethod: "manual" });
      assert.equal((await storage.updateRefundStatusForMerchant(other!.id, A, "failed"))?.status, "failed");
    });

    await check("a legacy row can never become an operation", async () => {
      const error = await sqlError(() => client.query(`UPDATE refunds SET state = 'requested' WHERE id = $1`, [legacy]));
      assert.equal(error.code, "23514");
      assert.match(error.message, /a legacy refund cannot become an operation/);
    });

    await check("a legacy row carrying an operation field is refused", async () => {
      const error = await sqlError(() => client.query(
        `INSERT INTO refunds (transaction_id, merchant_id, refund_amount, amount_cents) VALUES ($1, $2, '1.00', 100)`, [saleA, A]));
      assert.equal(error.code, "23514");
      assert.equal(error.constraint, "refunds_legacy_shape_check");
    });

    // A valid provider operation, with any column overridden.
    type Row = Record<string, unknown>;
    const provider = (over: Row = {}): Row => ({
      transaction_id: saleA, merchant_id: A, refund_amount: "12.34", refund_method: "original_payment_method",
      status: "pending", state: "requested", idempotency_key: randomUUID(), request_fingerprint: fingerprint(),
      processor_x_id: token(), merchant_reference: `REFUND-${token()}`, original_provider_transaction_id: captures.get(Number(over.transaction_id ?? saleA)),
      original_share_index: 0, provider_environment: "uat", amount_cents: 1234, currency: "NZD",
      initiated_by_user_id: user, reason_code: "requested_by_customer", reason_text: "Synthetic reason",
      requested_at: new Date("2026-10-14T00:00:00Z"), updated_at: new Date("2026-10-14T00:00:00Z"),
      next_reconciliation_at: new Date("2026-10-14T00:05:00Z"), ...over,
    });
    const insert = async (row: Row) => {
      const keys = Object.keys(row);
      const result = await client.query(
        `INSERT INTO refunds (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
        keys.map((key) => row[key]));
      return result.rows[0].id as number;
    };
    const update = (id: number, set: Row) => {
      const keys = Object.keys(set);
      return client.query(`UPDATE refunds SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} WHERE id = $1`,
        [id, ...keys.map((key) => set[key])]);
    };
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 0, minutes));
    const submit = (id: number) => update(id, { state: "submitted", status: "processing", submitted_at: at(1), next_reconciliation_at: at(5),
      lease_owner: randomUUID(), lease_expires_at: at(2), attempt_count: 1, updated_at: at(1) });
    const succeed = (id: number) => update(id, { state: "succeeded", status: "completed", provider_refund_transaction_id: `ref${token()}`,
      finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null, updated_at: at(3) });

    await check("a provider operation is inserted requested", async () => {
      await insert(provider());
    });

    await check("an operation cannot be inserted already sent or already refunded", async () => {
      for (const over of [
        { state: "submitted", status: "processing", submitted_at: at(1), next_reconciliation_at: at(5) },
        { state: "succeeded", status: "completed", submitted_at: at(1), finished_at: at(2), provider_refund_transaction_id: `ref${token()}` },
        { attempt_count: 1 },
      ]) {
        const error = await sqlError(() => insert(provider(over)));
        assert.equal(error.code, "23514");
        assert.match(error.message, /a refund operation starts requested, or recorded/);
      }
    });

    await check("the full provider path: requested, submitted, unknown (re-checked), succeeded, then frozen", async () => {
      const id = await insert(provider());
      await submit(id);
      await update(id, { state: "unknown", last_error_code: "provider_timeout", updated_at: at(2) });
      await update(id, { attempt_count: 2, next_reconciliation_at: at(9), updated_at: at(2) });
      await succeed(id);
      const frozen = await sqlError(() => update(id, { last_error_code: "late", updated_at: at(4) }));
      assert.match(frozen.message, /a finished refund operation is frozen/);
      await update(id, { customer_notified: true });
    });

    await check("submitted may fail, and a declined refund may carry its provider number", async () => {
      const id = await insert(provider());
      await submit(id);
      await update(id, { state: "failed", status: "failed", provider_refund_transaction_id: `dec${token()}`, finished_at: at(2),
        lease_owner: null, lease_expires_at: null, next_reconciliation_at: null, updated_at: at(2) });
    });

    await check("requested may be cancelled, never sent", async () => {
      const id = await insert(provider());
      await update(id, { state: "cancelled", status: "failed", finished_at: at(1), next_reconciliation_at: null, updated_at: at(1) });
    });

    await check("a refund that was sent can never be cancelled, from submitted or unknown", async () => {
      for (const unknown of [false, true]) {
        const id = await insert(provider()); await submit(id);
        if (unknown) await update(id, { state: "unknown" });
        const error = await sqlError(() => update(id, { state: "cancelled", status: "failed", finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null }));
        assert.match(error.message, /cannot change to that state/);
      }
    });

    await check("a pending reply's refund ID is kept from submitted on, written once, and carried to success", async () => {
      const id = await insert(provider()); await submit(id);
      const pending = `pend${token()}`;
      await update(id, { provider_refund_transaction_id: pending });
      await update(id, { state: "unknown" });
      assert.match((await sqlError(() => update(id, { provider_refund_transaction_id: `other${token()}` }))).message, /written once/);
      assert.match((await sqlError(() => update(id, { provider_refund_transaction_id: null }))).message, /written once/);
      await update(id, { state: "succeeded", status: "completed", finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null });
      const requested = await insert(provider());
      const early = await sqlError(() => update(requested, { provider_refund_transaction_id: `pend${token()}` }));
      assert.equal(early.constraint, "refunds_operation_state_shape_check");
    });

    await check("an unknown operation can be parked for review, keeping its reservation", async () => {
      const id = await insert(provider()); await submit(id);
      await update(id, { state: "unknown", next_reconciliation_at: null, lease_owner: null, lease_expires_at: null, last_error_code: "provider_mismatch:amount" });
      const live = await client.query(`SELECT 1 FROM refunds WHERE id = $1 AND state IN ('requested', 'submitted', 'unknown')`, [id]);
      assert.equal(live.rowCount, 1);
    });

    await check("a finished row allows only notification, its update time and clearing the reason", async () => {
      const id = await insert(provider()); await submit(id); await succeed(id);
      await update(id, { customer_notified: true, updated_at: at(9) });
      await update(id, { reason_text: null });
      assert.match((await sqlError(() => update(id, { reason_text: "rewritten" }))).message, /immutable refund operation identity/);
      for (const set of [{ windcave_fee_refunded: "0.10" }, { last_error_code: "late" }, { attempt_count: 9 }, { finished_at: at(10) }]) {
        assert.match((await sqlError(() => update(id, set))).message, /frozen/);
      }
    });

    await check("amounts that are not whole dollars match exactly", async () => {
      for (const [amount, cents] of [["0.01", 1], ["10.50", 1050], ["99999999.99", 9999999999]] as const) {
        await insert(provider({ refund_amount: amount, amount_cents: cents }));
      }
      const error = await sqlError(() => insert(provider({ refund_amount: "10.50", amount_cents: 1000 })));
      assert.equal(error.constraint, "refunds_operation_shape_check");
    });

    await check("every arrow outside the graph is refused", async () => {
      const requested = await insert(provider());
      for (const [state, status, extra] of [
        ["succeeded", "completed", { submitted_at: at(1), finished_at: at(2), provider_refund_transaction_id: `ref${token()}` }],
        ["unknown", "processing", { submitted_at: at(1), next_reconciliation_at: at(5) }],
        ["failed", "failed", { submitted_at: at(1), finished_at: at(2) }],
      ] as const) {
        const error = await sqlError(() => update(requested, { state, status, ...extra }));
        assert.match(error.message, /refund operation requested cannot change to that state/);
      }
      const submitted = await insert(provider()); await submit(submitted);
      for (const [state, status] of [["requested", "pending"], ["cancelled", "failed"]] as const) {
        const error = await sqlError(() => update(submitted, { state, status, submitted_at: null, next_reconciliation_at: null, finished_at: state === "cancelled" ? at(3) : null, lease_owner: null, lease_expires_at: null }));
        assert.match(error.message, /refund operation submitted cannot change to that state/);
      }
      const unknown = await insert(provider()); await submit(unknown);
      await update(unknown, { state: "unknown" });
      const back = await sqlError(() => update(unknown, { state: "submitted" }));
      assert.match(back.message, /refund operation unknown cannot change to that state/);
      const failed = await insert(provider()); await submit(failed);
      await update(failed, { state: "failed", status: "failed", finished_at: at(2), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null });
      const reopen = await sqlError(() => update(failed, { state: "unknown", status: "processing", finished_at: null, next_reconciliation_at: at(9) }));
      assert.match(reopen.message, /a finished refund operation is frozen/);
    });

    await check("identity never changes, submission is written once, attempts never decrease", async () => {
      const id = await insert(provider()); await submit(id);
      for (const set of [{ amount_cents: 1, refund_amount: "0.01" }, { processor_x_id: token() }, { idempotency_key: randomUUID() },
        { original_provider_transaction_id: `cap${token()}` }, { merchant_reference: "other" }, { reason_text: "changed" }]) {
        const error = await sqlError(() => update(id, set));
        assert.match(error.message, /immutable refund operation identity/);
      }
      assert.match((await sqlError(() => update(id, { submitted_at: at(2) }))).message, /submitted once/);
      assert.match((await sqlError(() => update(id, { attempt_count: 0 }))).message, /never decreases/);
      assert.match((await sqlError(() => update(id, { state: null }))).message, /cannot become legacy/);
    });

    await check("each state carries what it must (CHECKs)", async () => {
      const expect = async (row: Row | (() => Promise<unknown>), constraint: string) => {
        const error = await sqlError(typeof row === "function" ? row : () => insert(row));
        assert.equal(error.code, "23514", constraint);
        assert.equal(error.constraint, constraint);
      };
      await expect(provider({ status: "processing" }), "refunds_operation_status_check");
      await expect(provider({ refund_amount: "12.35" }), "refunds_operation_shape_check");
      await expect(provider({ windcave_refund_id: "legacy" }), "refunds_operation_shape_check");
      await expect(provider({ request_fingerprint: null }), "refunds_operation_shape_check");
      await expect(provider({ processor_x_id: null }), "refunds_operation_method_check");
      await expect(provider({ processor_x_id: "has space" }), "refunds_processor_x_id_check");
      await expect(provider({ request_fingerprint: "ABC" }), "refunds_fingerprint_check");
      await expect(provider({ currency: "nzd" }), "refunds_currency_check");
      await expect(provider({ amount_cents: 0, refund_amount: "0.00" }), "refunds_amount_cents_check");
      await expect(provider({ reason_text: "x".repeat(501) }), "refunds_reason_text_check");
      await expect(provider({ reason_code: "Has Caps" }), "refunds_reason_code_check");
      await expect(provider({ provider_environment: "live" }), "refunds_provider_environment_check");
      await expect(provider({ updated_at: new Date("2026-10-13T23:59:00Z") }), "refunds_operation_time_check");
      await expect(provider({ lease_owner: randomUUID() }), "refunds_lease_pair_check");
      const id = await insert(provider());
      await expect(provider({ next_reconciliation_at: null }), "refunds_operation_state_shape_check");
      await expect(() => update(id, { state: "submitted", status: "processing", submitted_at: at(1), next_reconciliation_at: null }), "refunds_operation_state_shape_check");
      await expect(() => update(id, { state: "submitted", status: "processing", next_reconciliation_at: at(5) }), "refunds_operation_state_shape_check");
      await submit(id);
      await expect(() => update(id, { state: "succeeded", status: "completed", finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null }), "refunds_operation_state_shape_check");
      await expect(() => update(id, { last_error_code: "Provider said: no" }), "refunds_error_code_check");
    });

    await check("a record-only refund is recorded once and can never say the provider moved money", async () => {
      const manual = (over: Row = {}) => provider({ refund_method: "manual", processor_x_id: null, merchant_reference: null,
        original_provider_transaction_id: null, original_share_index: null, provider_environment: null,
        state: "succeeded", status: "completed", finished_at: at(1), next_reconciliation_at: null, ...over });
      const id = await insert(manual());
      assert.match((await sqlError(() => update(id, { state: "cancelled", status: "failed" }))).message, /frozen/);
      assert.match((await sqlError(() => insert(manual({ state: "requested", status: "pending", finished_at: null })))).message, /starts requested, or recorded/);
      assert.match((await sqlError(() => insert(manual({ state: "cancelled", status: "failed" })))).message, /starts requested, or recorded/);
      for (const over of [{ processor_x_id: token() }, { provider_refund_transaction_id: `ref${token()}` }, { submitted_at: at(1) }, { original_provider_transaction_id: `cap${token()}` }]) {
        const error = await sqlError(() => insert(manual(over)));
        assert.equal(error.constraint, "refunds_operation_method_check");
      }
      await insert(manual({ refund_method: "bank_transfer" }));
    });

    await check("uniqueness: key per business, X-ID, provider refund number, never the capture itself", async () => {
      const key = randomUUID();
      await insert(provider({ idempotency_key: key }));
      const again = await sqlError(() => insert(provider({ idempotency_key: key })));
      assert.equal(again.constraint, "refunds_merchant_idempotency_key_uq");
      await insert(provider({ idempotency_key: key, transaction_id: saleB, merchant_id: B, initiated_by_user_id: userB }));
      const xId = token();
      await insert(provider({ processor_x_id: xId }));
      assert.equal((await sqlError(() => insert(provider({ processor_x_id: xId })))).constraint, "refunds_processor_x_id_uq");
      const first = await insert(provider()); await submit(first); await succeed(first);
      const number = (await client.query(`SELECT provider_refund_transaction_id FROM refunds WHERE id = $1`, [first])).rows[0].provider_refund_transaction_id;
      const second = await insert(provider()); await submit(second);
      assert.equal((await sqlError(() => update(second, { state: "succeeded", status: "completed", provider_refund_transaction_id: number,
        finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null }))).constraint, "refunds_provider_refund_transaction_id_uq");
      const capture = captures.get(saleA)!;
      const third = await insert(provider()); await submit(third);
      assert.equal((await sqlError(() => update(third, { state: "succeeded", status: "completed", provider_refund_transaction_id: capture,
        finished_at: at(3), lease_owner: null, lease_expires_at: null, next_reconciliation_at: null }))).constraint, "refunds_provider_refund_transaction_check");
    });

    await check("an operation must name a sale of its own business, and a capture of that sale", async () => {
      const foreign = await sqlError(() => insert(provider({ transaction_id: saleB, merchant_id: A })));
      assert.equal(foreign.code, "23514");
      assert.match(foreign.message, /a refund operation names a sale of its own business/);
      const manualForeign = await sqlError(() => insert(provider({ transaction_id: saleB, merchant_id: A, refund_method: "manual", processor_x_id: null,
        merchant_reference: null, original_provider_transaction_id: null, original_share_index: null, provider_environment: null,
        state: "succeeded", status: "completed", finished_at: at(1), next_reconciliation_at: null })));
      assert.match(manualForeign.message, /a refund operation names a sale of its own business/);
      for (const over of [{ original_provider_transaction_id: captures.get(saleB) }, { original_provider_transaction_id: `cap${token()}` }, { original_share_index: 1 }]) {
        const error = await sqlError(() => insert(provider(over)));
        assert.match(error.message, /a refund operation refunds a capture of its own sale/);
      }
      // A share's capture, and one recorded only on a payment attempt for that share.
      const split = await sale(A);
      const shareCapture = `share${token()}`;
      await client.query(`INSERT INTO split_payments (transaction_id, merchant_id, split_index, amount, status, windcave_transaction_id) VALUES ($1, $2, 2, '5.00', 'completed', $3)`, [split, A, shareCapture]);
      await insert(provider({ transaction_id: split, original_provider_transaction_id: shareCapture, original_share_index: 2 }));
      const wrongShare = await sqlError(() => insert(provider({ transaction_id: split, original_provider_transaction_id: shareCapture, original_share_index: 1 })));
      assert.match(wrongShare.message, /refunds a capture of its own sale/);
      const attempted = await sale(A);
      const attemptCapture = `att${token()}`;
      await client.query(`UPDATE transactions SET windcave_transaction_id = NULL WHERE id = $1`, [attempted]);
      const attempt = async (outcome: string, environment: string, capture: string) => client.query(
        `INSERT INTO payment_attempts (transaction_id, share_index, idempotency_key, state, outcome, lease_expires_at, provider_transaction_id,
           expected_amount_cents, expected_currency, expected_merchant_reference, provider_environment, created_at, updated_at)
         VALUES ($1, 0, $2, $3, $3, now() + interval '4 minutes', $4, 5000, 'NZD', $5, $6, now(), now())`,
        [attempted, randomUUID(), outcome, capture, `TAPT_${token()}`, environment]);
      await attempt("approved", "uat", attemptCapture);
      await insert(provider({ transaction_id: attempted, original_provider_transaction_id: attemptCapture }));
      // Only an approved attempt's capture, in the refund's own environment.
      const other = `att${token()}`;
      await attempt("approved", "production", other);
      assert.match((await sqlError(() => insert(provider({ transaction_id: attempted, original_provider_transaction_id: other })))).message, /refunds a capture of its own sale/);
      const declined = `att${token()}`;
      await attempt("declined", "uat", declined);
      assert.match((await sqlError(() => insert(provider({ transaction_id: attempted, original_provider_transaction_id: declined })))).message, /refunds a capture of its own sale/);
      // A split sale's own column holds its last share's capture: never refundable as share 0.
      const splitSale = await sale(A);
      await client.query(`UPDATE transactions SET is_split = true, total_splits = 2 WHERE id = $1`, [splitSale]);
      assert.match((await sqlError(() => insert(provider({ transaction_id: splitSale })))).message, /refunds a capture of its own sale/);
      // The initiating user belongs to the business.
      assert.match((await sqlError(() => insert(provider({ initiated_by_user_id: userB })))).message, /names a user of its own business/);
    });

    await check("an operation always names its method, refused by the trigger and by the CHECK on its own", async () => {
      const nullMethod = provider({ refund_method: null, processor_x_id: null, merchant_reference: null,
        original_provider_transaction_id: null, original_share_index: null, provider_environment: null,
        state: "succeeded", status: "completed", finished_at: at(1), next_reconciliation_at: null });
      const byTrigger = await sqlError(() => insert(nullMethod));
      assert.equal(byTrigger.code, "23514");
      assert.match(byTrigger.message, /a refund operation starts requested, or recorded/);
      // Each layer alone: the CHECK still refuses with the trigger off (rolled back).
      await client.query("BEGIN");
      try {
        await client.query("ALTER TABLE refunds DISABLE TRIGGER refund_operation_guard");
        const byCheck = await sqlError(() => insert(nullMethod));
        assert.equal(byCheck.constraint, "refunds_operation_shape_check");
      } finally { await client.query("ROLLBACK"); }
    });

    await check("a sale cannot change business while an operation naming it is being inserted", async () => {
      const held = await sale(A);
      const other = await pool.connect();
      try {
        await client.query("BEGIN");
        await insert(provider({ transaction_id: held }));
        let moved = false;
        const move = other.query(`UPDATE transactions SET merchant_id = $1 WHERE id = $2`, [B, held]).then(() => { moved = true; });
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(moved, false, "the ownership move waits for the insert to commit");
        await client.query("ROLLBACK");
        await move;
      } finally { other.release(); }
    });

    await check("a sent operation is always held by a lease", async () => {
      const id = await insert(provider());
      const error = await sqlError(() => update(id, { state: "submitted", status: "processing", submitted_at: at(1), next_reconciliation_at: at(5) }));
      assert.equal(error.constraint, "refunds_operation_state_shape_check");
    });

    await check("an operation is never deleted; a legacy row still can be, and its operation ID never changes", async () => {
      const live = await insert(provider());
      assert.match((await sqlError(() => client.query(`DELETE FROM refunds WHERE id = $1`, [live]))).message, /never deleted/);
      const done = await insert(provider()); await submit(done); await succeed(done);
      assert.match((await sqlError(() => client.query(`DELETE FROM refunds WHERE id = $1`, [done]))).message, /never deleted/);
      const old = (await legacyInsert(saleA, A)).rows[0].id;
      assert.match((await sqlError(() => client.query(`UPDATE refunds SET operation_id = gen_random_uuid() WHERE id = $1`, [old]))).message, /operation ID never changes/);
      await client.query(`DELETE FROM refunds WHERE id = $1`, [old]);
    });

    await check("live operations are the reservation: the sum counts requested, submitted and unknown only", async () => {
      const fresh = await sale(A);
      const live = async (cents: number) => insert(provider({ transaction_id: fresh, amount_cents: cents, refund_amount: (cents / 100).toFixed(2) }));
      await live(100);
      const s = await live(200); await submit(s);
      const u = await live(400); await submit(u); await update(u, { state: "unknown" });
      const done = await live(800); await submit(done); await succeed(done);
      const cancelled = await live(1600); await update(cancelled, { state: "cancelled", status: "failed", finished_at: at(1), next_reconciliation_at: null });
      const sum = await client.query(`SELECT COALESCE(sum(amount_cents), 0)::int AS n FROM refunds
        WHERE transaction_id = $1 AND state IN ('requested', 'submitted', 'unknown')`, [fresh]);
      assert.equal(sum.rows[0].n, 700);
      const plan = await client.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'refunds_live_transaction_idx'`);
      assert.match(plan.rows[0].indexdef, /WHERE \(state = ANY \(ARRAY\['requested'::text, 'submitted'::text, 'unknown'::text\]\)\)/);
    });

    await check("the rules do not depend on the session time zone", async () => {
      await client.query(`SET TIME ZONE 'Pacific/Chatham'`);
      try {
        const id = await insert(provider()); await submit(id); await succeed(id);
      } finally { await client.query(`RESET TIME ZONE`); }
    });
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
