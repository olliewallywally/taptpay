import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertSafePostgresVerifierEnvironment,
  assertVerifierSchemaName,
  createVerifierSchemaName,
  postgresDatabaseIdentity,
  prepareMigrationSql,
  quoteVerifierSchema,
} from "./postgres-verifier-safety.mjs";

test("requires both the disposable URL and the exact test-only marker", () => {
  assert.throws(
    () =>
      assertSafePostgresVerifierEnvironment({
        marker: "1",
      }),
    /TEST_DATABASE_URL is required/,
  );
  assert.throws(
    () =>
      assertSafePostgresVerifierEnvironment({
        testDatabaseUrl: "postgres://tester@db/test",
        marker: "true",
      }),
    /TAPTPAY_TEST_DATABASE must be exactly 1/,
  );
});

test("rejects the configured database even when credentials and options differ", () => {
  assert.throws(
    () =>
      assertSafePostgresVerifierEnvironment({
        testDatabaseUrl:
          "postgres://test-user:test-pass@DB.EXAMPLE:5432/taptpay?sslmode=require",
        configuredDatabaseUrl:
          "postgresql://live-user:live-pass@db.example/taptpay?application_name=app",
        marker: "1",
      }),
    /same database as DATABASE_URL/,
  );
});

test("accepts a distinct explicitly marked database", () => {
  const result = assertSafePostgresVerifierEnvironment({
    testDatabaseUrl: "postgres://tester@localhost/taptpay_test",
    configuredDatabaseUrl: "postgres://app@localhost/taptpay",
    marker: "1",
  });
  assert.equal(result.testIdentity, "localhost:5432/taptpay_test");
});

test("database identity validates protocol, host, and database name", () => {
  assert.equal(
    postgresDatabaseIdentity("postgresql://user@DB.EXAMPLE:5544/a%20test"),
    "db.example:5544/a test",
  );
  assert.throws(
    () => postgresDatabaseIdentity("https://db.example/test"),
    /must use postgres/,
  );
  assert.throws(
    () => postgresDatabaseIdentity("postgres:///test"),
    /hostname/,
  );
  assert.throws(
    () => postgresDatabaseIdentity("postgres://db.example"),
    /name a database/,
  );
});

test("generates and quotes only the exact random verifier schema shape", () => {
  const schemaName = createVerifierSchemaName((length) => {
    assert.equal(length, 16);
    return Buffer.alloc(16, 0xab);
  });
  assert.equal(
    schemaName,
    "taptpay_verify_abababababababababababababababab",
  );
  assert.equal(quoteVerifierSchema(schemaName), `"${schemaName}"`);
  assert.throws(() => assertVerifierSchemaName("public"), /refusing/);
  assert.throws(
    () => createVerifierSchemaName(() => Buffer.alloc(15)),
    /exactly 16 bytes/,
  );
});

test("rewrites only migration 0000's two known public foreign keys in memory", () => {
  const original = [
    'REFERENCES "public"."merchants"("id")',
    'REFERENCES "public"."merchants"("id")',
  ].join(";\n");
  const prepared = prepareMigrationSql("0000_vengeful_zaladane.sql", original);
  assert.equal(prepared.includes('"public"."merchants"'), false);
  assert.equal(
    prepared.split('REFERENCES "merchants"("id")').length - 1,
    2,
  );
  assert.throws(
    () =>
      prepareMigrationSql(
        "0000_vengeful_zaladane.sql",
        'REFERENCES "public"."merchants"("id")',
      ),
    /reference count changed/,
  );
  assert.throws(
    () => prepareMigrationSql("future.sql", "SELECT * FROM public.merchants"),
    /isolation is not proven/,
  );
});

test("the checked-in migration 0000 still matches the isolated rewrite contract", async () => {
  const migration = await readFile(
    new URL("../migrations/0000_vengeful_zaladane.sql", import.meta.url),
    "utf8",
  );
  const prepared = prepareMigrationSql(
    "0000_vengeful_zaladane.sql",
    migration,
  );
  assert.equal(prepared.includes('"public"."merchants"'), false);
  assert.equal(
    prepared.split('REFERENCES "merchants"("id")').length - 1,
    2,
  );
});

test("0010a contains the additive approved-settlement baseline", async () => {
  const migration = await readFile(
    new URL(
      "../migrations/0010a_reconcile_retail_payment_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const settlementOffset = migration.indexOf(
    "CREATE TABLE IF NOT EXISTS platform_fees",
  );
  assert.notEqual(settlementOffset, -1, "platform_fees baseline is missing");
  const settlementBaseline = migration.slice(settlementOffset);
  for (const expected of [
    "CREATE TABLE IF NOT EXISTS platform_fees",
    "fee_amount numeric(10, 2) NOT NULL",
    "transaction_amount numeric(10, 2) NOT NULL",
    "platform_fees_transaction_id_transactions_id_fk",
    "platform_fees_merchant_id_merchants_id_fk",
    "CREATE TABLE IF NOT EXISTS merchant_subscriptions",
    "merchant_id integer NOT NULL",
    "current_month_transactions integer DEFAULT 0",
    "total_lifetime_transactions integer DEFAULT 0",
    "unbilled_transaction_count integer DEFAULT 0",
    "unbilled_amount numeric(10, 2) DEFAULT '0.00'",
    "merchant_subscriptions_merchant_id_merchants_id_fk",
    "merchant_subscriptions_merchant_id_unique UNIQUE (merchant_id)",
  ]) {
    assert.ok(
      settlementBaseline.includes(expected),
      `0010a settlement baseline is missing: ${expected}`,
    );
  }
  assert.doesNotMatch(
    settlementBaseline,
    /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i,
    "settlement reconciliation must not rewrite or remove merchant data",
  );
});
