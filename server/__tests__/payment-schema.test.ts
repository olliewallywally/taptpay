import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  insertTransactionSchema,
  paymentAttempts,
  PAYMENT_ATTEMPT_MAX_LEASE_MS,
  PAYMENT_RETURN_STATE_MAX_AGE_MS,
  retailTransactionCreateRequestSchema,
  splitPayments,
  taptStones,
  transactions,
} from "@shared/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

const migration = readFileSync(
  resolve(process.cwd(), "migrations/0011_payment_links_and_board_numbers.sql"),
  "utf8",
);

describe("Phase 2 Drizzle schema", () => {
  test("models the digest, payment-attempt, split, and active-board indexes", () => {
    const transactionConfig = getTableConfig(transactions);
    const attemptConfig = getTableConfig(paymentAttempts);
    const splitConfig = getTableConfig(splitPayments);
    const stoneConfig = getTableConfig(taptStones);

    expect(transactionConfig.columns.find(({ name }) => name === "payment_token_hash"))
      .toMatchObject({ notNull: false });
    expect(transactionConfig.indexes.map(({ config }) => config.name)).toContain(
      "transactions_payment_token_hash_uq",
    );
    expect(transactionConfig.checks.map(({ name }) => name)).toContain(
      "transactions_payment_token_hash_shape_check",
    );

    expect(attemptConfig.columns.find(({ name }) => name === "transaction_id"))
      .toMatchObject({ notNull: true });
    expect(attemptConfig.columns.find(({ name }) => name === "idempotency_key"))
      .toMatchObject({ notNull: true, dataType: "string" });
    expect(attemptConfig.indexes.map(({ config }) => config.name).sort()).toEqual([
      "payment_attempts_live_transaction_share_uq",
      "payment_attempts_return_state_hash_uq",
      "payment_attempts_transaction_idx",
      "payment_attempts_transaction_share_key_uq",
    ]);
    expect(attemptConfig.checks.map(({ name }) => name).sort()).toEqual([
      "payment_attempts_lease_expiry_check",
      "payment_attempts_outcome_check",
      "payment_attempts_receipt_share_check",
      "payment_attempts_return_state_expiry_check",
      "payment_attempts_return_state_hash_shape_check",
      "payment_attempts_return_state_pair_check",
      "payment_attempts_share_index_check",
      "payment_attempts_state_check",
    ]);

    expect(splitConfig.columns.find(({ name }) => name === "transaction_id"))
      .toMatchObject({ notNull: true });
    expect(splitConfig.indexes.map(({ config }) => config.name)).toContain(
      "split_payments_transaction_split_uq",
    );
    expect(stoneConfig.indexes.map(({ config }) => config.name)).toContain(
      "tapt_stones_active_merchant_number_uq",
    );
  });

  test("exports the exact service lifetime bounds enforced by SQL", () => {
    expect(PAYMENT_ATTEMPT_MAX_LEASE_MS).toBe(5 * 60 * 1000);
    expect(PAYMENT_RETURN_STATE_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(migration).toContain("created_at + interval '5 minutes'");
    expect(migration).toContain("created_at + interval '30 minutes'");
  });

  test("keeps token material outside caller-owned transaction schemas", () => {
    const base = {
      merchantId: 7,
      itemName: "Phase 2 sale",
      price: "12.34",
    };

    for (const forbidden of [
      { paymentTokenHash: "a".repeat(64) },
      { rawToken: "caller-secret" },
      { paymentToken: "caller-secret" },
      { token: "caller-secret" },
    ]) {
      expect(retailTransactionCreateRequestSchema.safeParse({
        ...base,
        ...forbidden,
      }).success).toBe(false);
    }

    const parsedInsert = insertTransactionSchema.parse({
      ...base,
      paymentTokenHash: "a".repeat(64),
      completedAt: new Date("2026-08-09T00:00:00.000Z"),
    }) as Record<string, unknown>;
    expect(parsedInsert).not.toHaveProperty("paymentTokenHash");
    expect(parsedInsert).not.toHaveProperty("completedAt");
  });
});

describe("0011 migration fail-safes", () => {
  test("creates the security table with exact checks instead of accepting an old shape", () => {
    expect(migration).toMatch(/CREATE TABLE payment_attempts \(/);
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS payment_attempts/);
    expect(migration).toContain("idempotency_key uuid NOT NULL");
    expect(migration).toContain(
      "WHERE state IN ('claiming', 'ready', 'finalizing')",
    );
    expect(migration).toContain(
      "WHERE return_state_hash IS NOT NULL",
    );
  });

  test("audits and locks split rows before hardening their parent and uniqueness", () => {
    const lock = migration.indexOf("LOCK TABLE split_payments IN SHARE MODE");
    const nullPreflight = migration.indexOf("WHERE transaction_id IS NULL");
    const notNull = migration.indexOf("ALTER COLUMN transaction_id SET NOT NULL");
    const unique = migration.indexOf("split_payments_transaction_split_uq");

    expect(lock).toBeGreaterThan(-1);
    expect(nullPreflight).toBeGreaterThan(lock);
    expect(notNull).toBeGreaterThan(nullPreflight);
    expect(unique).toBeGreaterThan(notNull);
    expect(migration).toContain(
      "0011 aborted: duplicate transaction-local split indexes exist",
    );
  });

  test("aborts on duplicate active boards before creating their unique index", () => {
    const lock = migration.indexOf("LOCK TABLE tapt_stones IN SHARE MODE");
    const preflight = migration.indexOf(
      "0011 aborted: duplicate active payment-board numbers exist",
    );
    const index = migration.indexOf(
      "CREATE UNIQUE INDEX IF NOT EXISTS tapt_stones_active_merchant_number_uq",
    );

    expect(lock).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(lock);
    expect(index).toBeGreaterThan(preflight);
    expect(migration).toContain("WHERE is_active IS TRUE");
    expect(migration).not.toMatch(/\b(?:DELETE FROM|DROP TABLE)\b/i);
  });
});
