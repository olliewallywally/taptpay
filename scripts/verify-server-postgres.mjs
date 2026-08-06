#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import pg from "pg";

import {
  assertSafePostgresVerifierEnvironment,
  assertVerifierSchemaName,
  createVerifierSchemaName,
  prepareMigrationSql,
  quoteVerifierSchema,
} from "./postgres-verifier-safety.mjs";

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRE_INDEX_MIGRATIONS = [
  "0000_vengeful_zaladane.sql",
  "0001_add_email_verified.sql",
  "0002_add_billing_card_fields.sql",
  "0003_property_management.sql",
  "0004_rent_reminders.sql",
  "0005_split_bill.sql",
  "0006_whatsapp_delivery.sql",
  "0007_trades_vertical.sql",
  "0008_trades_phase3c_fixes.sql",
  "0009_trades_gst_mode.sql",
  "0010_merchant_tutorial_progress.sql",
  "0010a_reconcile_retail_payment_baseline.sql",
];
const FINAL_MIGRATION = "0011_payment_links_and_board_numbers.sql";

function stage(message) {
  console.log(`[postgres-verifier] ${message}`);
}

async function setIsolatedSearchPath(client, schemaName) {
  const quotedSchema = quoteVerifierSchema(schemaName);
  await client.query(`SET search_path TO ${quotedSchema}, pg_catalog`);
  const result = await client.query("SELECT current_schema() AS schema_name");
  assert.equal(result.rows[0]?.schema_name, schemaName);
}

async function applyMigration(client, schemaName, fileName) {
  await setIsolatedSearchPath(client, schemaName);
  const migrationPath = resolve(repositoryRoot, "migrations", fileName);
  const source = await readFile(migrationPath, "utf8");
  const sql = prepareMigrationSql(fileName, source);
  try {
    await client.query(sql);
  } catch (error) {
    // Some migrations own a BEGIN/COMMIT block. Do not return an aborted client
    // to the pool if one fails before its COMMIT.
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error(`migration ${fileName} failed: ${error.message}`, {
      cause: error,
    });
  }
  stage(`applied ${fileName}`);
}

async function insertMerchant(client, label) {
  const suffix = randomBytes(8).toString("hex");
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const result = await client.query(
    `INSERT INTO merchants (name, business_name, email, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [label, label, `${slug}-${suffix}@example.test`],
  );
  return result.rows[0].id;
}

async function verifyObjectsStayInSchema(client, schemaName) {
  const result = await client.query(
    `SELECT DISTINCT target_ns.nspname AS target_schema,
                     referenced_ns.nspname AS referenced_schema
       FROM pg_constraint constraint_row
       JOIN pg_class target_table
         ON target_table.oid = constraint_row.conrelid
       JOIN pg_namespace target_ns
         ON target_ns.oid = target_table.relnamespace
       JOIN pg_class referenced_table
         ON referenced_table.oid = constraint_row.confrelid
       JOIN pg_namespace referenced_ns
         ON referenced_ns.oid = referenced_table.relnamespace
      WHERE constraint_row.contype = 'f'
        AND target_ns.nspname = $1`,
    [schemaName],
  );
  assert.ok(result.rows.length > 0, "expected isolated foreign keys");
  assert.deepEqual(
    [...new Set(result.rows.map((row) => row.referenced_schema))],
    [schemaName],
    "a verifier foreign key escaped the disposable schema",
  );
}

async function verifySettlementBaseline(client, schemaName) {
  const expectedColumns = {
    platform_fees: [
      "collected_at",
      "created_at",
      "fee_amount",
      "id",
      "merchant_id",
      "status",
      "transaction_amount",
      "transaction_id",
    ],
    merchant_subscriptions: [
      "billing_frequency",
      "cancellation_effective_date",
      "cancellation_reason",
      "cancellation_requested_at",
      "created_at",
      "current_month_transactions",
      "id",
      "last_billing_date",
      "merchant_id",
      "month_start_date",
      "next_billing_date",
      "status",
      "stripe_customer_id",
      "stripe_payment_method_id",
      "stripe_subscription_id",
      "tier",
      "total_lifetime_transactions",
      "unbilled_amount",
      "unbilled_transaction_count",
      "updated_at",
    ],
  };
  const columns = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name, column_name`,
    [schemaName, Object.keys(expectedColumns)],
  );
  for (const [tableName, expected] of Object.entries(expectedColumns)) {
    assert.deepEqual(
      columns.rows
        .filter((row) => row.table_name === tableName)
        .map((row) => row.column_name),
      expected,
      `${tableName} does not match the legacy settlement baseline`,
    );
  }

  const expectedConstraints = [
    ["merchant_subscriptions", "merchant_subscriptions_merchant_id_merchants_id_fk", "f"],
    ["merchant_subscriptions", "merchant_subscriptions_merchant_id_unique", "u"],
    ["merchant_subscriptions", "merchant_subscriptions_pkey", "p"],
    ["platform_fees", "platform_fees_merchant_id_merchants_id_fk", "f"],
    ["platform_fees", "platform_fees_pkey", "p"],
    ["platform_fees", "platform_fees_transaction_id_transactions_id_fk", "f"],
  ];
  const constraints = await client.query(
    `SELECT table_row.relname AS table_name,
            constraint_row.conname AS constraint_name,
            constraint_row.contype AS constraint_type
       FROM pg_constraint constraint_row
       JOIN pg_class table_row
         ON table_row.oid = constraint_row.conrelid
       JOIN pg_namespace table_ns
         ON table_ns.oid = table_row.relnamespace
      WHERE table_ns.nspname = $1
        AND table_row.relname = ANY($2::text[])
      ORDER BY table_row.relname, constraint_row.conname`,
    [schemaName, Object.keys(expectedColumns)],
  );
  assert.deepEqual(
    constraints.rows.map((row) => [
      row.table_name,
      row.constraint_name,
      row.constraint_type,
    ]),
    expectedConstraints,
  );
  stage("proved the clean-schema fee/subscription settlement baseline");
}

async function verifyPreIndexFixtures(client, schemaName) {
  const indexResult = await client.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname IN (
          'tapt_stones_active_merchant_number_uq',
          'transactions_payment_token_hash_uq',
          'split_payments_transaction_split_uq'
        )`,
    [schemaName],
  );
  assert.deepEqual(indexResult.rows, [], "0011 indexes exist before 0011");

  const merchantId = await insertMerchant(client, "Pre-index scope merchant");
  const foreignMerchantId = await insertMerchant(
    client,
    "Pre-index foreign merchant",
  );
  const stoneResult = await client.query(
    `INSERT INTO tapt_stones (merchant_id, name, stone_number, is_active)
     VALUES ($1, 'Scope board', 1, true)
     RETURNING id`,
    [merchantId],
  );
  const foreignStoneResult = await client.query(
    `INSERT INTO tapt_stones (merchant_id, name, stone_number, is_active)
     VALUES ($1, 'Foreign board', 1, true)
     RETURNING id`,
    [foreignMerchantId],
  );
  const stoneId = stoneResult.rows[0].id;
  const commonTime = new Date("2026-08-06T12:00:00.000Z");

  const inserted = await client.query(
    `INSERT INTO transactions
       (merchant_id, tapt_stone_id, item_name, price, status, created_at)
     VALUES
       ($1, NULL, $2, '10.00', 'pending', $5),
       ($1, $3, $4, '20.00', 'pending', $5),
       ($6, $7, 'foreign board row', '30.00', 'pending', $5)
     RETURNING id, merchant_id, tapt_stone_id, item_name`,
    [
      merchantId,
      "legacy no-board row",
      stoneId,
      "selected board row",
      commonTime,
      foreignMerchantId,
      foreignStoneResult.rows[0].id,
    ],
  );
  const noBoard = inserted.rows.find(
    (row) => row.item_name === "legacy no-board row",
  );
  const board = inserted.rows.find(
    (row) => row.item_name === "selected board row",
  );
  assert.equal(board.tapt_stone_id, stoneId, "selected board was not persisted");

  const merchantAny = await client.query(
    `SELECT id
       FROM transactions
      WHERE merchant_id = $1
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [merchantId],
  );
  const noBoardScope = await client.query(
    `SELECT id
       FROM transactions
      WHERE merchant_id = $1
        AND tapt_stone_id IS NULL
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [merchantId],
  );
  const boardScope = await client.query(
    `SELECT id
       FROM transactions
      WHERE merchant_id = $1
        AND tapt_stone_id = $2
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [merchantId, stoneId],
  );
  assert.equal(merchantAny.rows[0].id, board.id);
  assert.equal(noBoardScope.rows[0].id, noBoard.id);
  assert.equal(boardScope.rows[0].id, board.id);
  stage("proved pre-index board persistence and Phase 0 scope isolation");
}

async function runDuplicatePreflight(client) {
  const boardDuplicates = await client.query(
    `SELECT merchant_id, stone_number, count(*)::integer AS rows
       FROM tapt_stones
      WHERE is_active IS TRUE
        AND merchant_id IS NOT NULL
      GROUP BY merchant_id, stone_number
     HAVING count(*) > 1`,
  );
  const splitNullParents = await client.query(
    `SELECT count(*)::integer AS rows
       FROM split_payments
      WHERE transaction_id IS NULL`,
  );
  const splitDuplicates = await client.query(
    `SELECT transaction_id, split_index, count(*)::integer AS rows
       FROM split_payments
      GROUP BY transaction_id, split_index
     HAVING count(*) > 1`,
  );
  assert.deepEqual(boardDuplicates.rows, []);
  assert.equal(splitNullParents.rows[0].rows, 0);
  assert.deepEqual(splitDuplicates.rows, []);
  stage("duplicate-board and split-parent preflights are clean");
}

function postgresError(error) {
  let current = error;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    if (typeof current.code === "string") return current;
    seen.add(current);
    current = current.cause;
  }
  return undefined;
}

async function expectPostgresError(operation, code, constraint) {
  try {
    await operation();
  } catch (error) {
    const pgError = postgresError(error);
    assert.equal(pgError?.code, code);
    if (constraint) assert.equal(pgError?.constraint, constraint);
    return;
  }
  assert.fail(`expected PostgreSQL error ${code}`);
}

async function verifyPostIndexConstraints(client, schemaName) {
  const requiredIndexes = [
    "payment_attempts_live_transaction_share_uq",
    "payment_attempts_return_state_hash_uq",
    "payment_attempts_transaction_share_key_uq",
    "split_payments_transaction_split_uq",
    "tapt_stones_active_merchant_number_uq",
    "transactions_payment_token_hash_uq",
  ];
  const indexResult = await client.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname = ANY($2::text[])
      ORDER BY indexname`,
    [schemaName, requiredIndexes],
  );
  assert.deepEqual(
    indexResult.rows.map((row) => row.indexname),
    [...requiredIndexes].sort(),
  );

  const merchantId = await insertMerchant(client, "Constraint merchant");
  const board = await client.query(
    `INSERT INTO tapt_stones (merchant_id, name, stone_number, is_active)
     VALUES ($1, 'Indexed board', 1, true)
     RETURNING id`,
    [merchantId],
  );
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO tapt_stones (merchant_id, name, stone_number, is_active)
         VALUES ($1, 'Duplicate active board', 1, true)`,
        [merchantId],
      ),
    "23505",
    "tapt_stones_active_merchant_number_uq",
  );
  await client.query(
    `INSERT INTO tapt_stones (merchant_id, name, stone_number, is_active)
     VALUES ($1, 'Archived board number', 1, false)`,
    [merchantId],
  );

  const tokenHash = randomBytes(32).toString("hex");
  const transaction = await client.query(
    `INSERT INTO transactions
       (merchant_id, tapt_stone_id, item_name, price, status, payment_token_hash)
     VALUES ($1, NULL, 'Token lookup row', '19.95', 'pending', $2)
     RETURNING id`,
    [merchantId, tokenHash],
  );
  const transactionId = transaction.rows[0].id;
  const tokenLookup = await client.query(
    `SELECT id
       FROM transactions
      WHERE payment_token_hash = $1`,
    [tokenHash],
  );
  assert.deepEqual(tokenLookup.rows, [{ id: transactionId }]);
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO transactions
           (merchant_id, item_name, price, status, payment_token_hash)
         VALUES ($1, 'Duplicate token row', '1.00', 'pending', $2)`,
        [merchantId, tokenHash],
      ),
    "23505",
    "transactions_payment_token_hash_uq",
  );
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO transactions
           (merchant_id, item_name, price, status, payment_token_hash)
         VALUES ($1, 'Malformed token row', '1.00', 'pending', 'not-a-digest')`,
        [merchantId],
      ),
    "23514",
    "transactions_payment_token_hash_shape_check",
  );

  await client.query(
    `INSERT INTO split_payments
       (transaction_id, merchant_id, split_index, amount, status)
     VALUES ($1, $2, 1, '9.97', 'pending')`,
    [transactionId, merchantId],
  );
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO split_payments
           (transaction_id, merchant_id, split_index, amount, status)
         VALUES ($1, $2, 1, '9.98', 'pending')`,
        [transactionId, merchantId],
      ),
    "23505",
    "split_payments_transaction_split_uq",
  );
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO split_payments
           (transaction_id, merchant_id, split_index, amount, status)
         VALUES (NULL, $1, 2, '9.98', 'pending')`,
        [merchantId],
      ),
    "23502",
  );

  const idempotencyKey = randomUUID();
  const returnStateHash = randomBytes(32).toString("hex");
  const attempt = await client.query(
    `INSERT INTO payment_attempts
       (transaction_id, share_index, idempotency_key, state,
        lease_expires_at, processor_session_id, processor_x_id,
        return_state_hash, return_state_expires_at)
     VALUES
       ($1, 0, $2, 'ready', now() + interval '4 minutes',
        'constraint-session', 'constraint-xid', $3,
        now() + interval '20 minutes')
     RETURNING id`,
    [transactionId, idempotencyKey, returnStateHash],
  );
  const returnLookup = await client.query(
    `SELECT id
       FROM payment_attempts
      WHERE return_state_hash = $1`,
    [returnStateHash],
  );
  assert.deepEqual(returnLookup.rows, [{ id: attempt.rows[0].id }]);
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO payment_attempts
           (transaction_id, share_index, idempotency_key, state,
            lease_expires_at)
         VALUES ($1, 2, $2, 'claiming', now() + interval '6 minutes')`,
        [transactionId, randomUUID()],
      ),
    "23514",
    "payment_attempts_lease_expiry_check",
  );
  await expectPostgresError(
    () =>
      client.query(
        `INSERT INTO payment_attempts
           (transaction_id, share_index, idempotency_key, state,
            lease_expires_at, return_state_hash, return_state_expires_at)
         VALUES
           ($1, 2, $2, 'claiming', now() + interval '1 minute',
            'bad-hash', now() + interval '2 minutes')`,
        [transactionId, randomUUID()],
      ),
    "23514",
    "payment_attempts_return_state_hash_shape_check",
  );
  stage("proved 0011 indexes, board conflict, token lookup, and constraints");
}

async function runStorageWorker({
  phase,
  schemaName,
  testDatabaseUrl,
  configuredDatabaseUrl,
}) {
  const workerPath = resolve(
    repositoryRoot,
    "scripts",
    "verify-server-postgres-storage.mjs",
  );
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", workerPath],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: testDatabaseUrl,
          TEST_DATABASE_URL: testDatabaseUrl,
          TAPTPAY_VERIFY_CONFIGURED_DATABASE_URL: configuredDatabaseUrl ?? "",
          TAPTPAY_VERIFY_SCHEMA: schemaName,
          TAPTPAY_VERIFY_PHASE: phase,
        },
        stdio: "inherit",
      },
    );
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolvePromise();
      rejectPromise(
        new Error(
          `isolated storage worker ${phase} failed (${signal ?? `exit ${code}`})`,
        ),
      );
    });
  });
}

async function main() {
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    configuredDatabaseUrl,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  const schemaName = createVerifierSchemaName();
  const quotedSchema = quoteVerifierSchema(schemaName);
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    application_name: "taptpay-server-postgres-verifier",
    max: 20,
  });
  let schemaCreated = false;

  try {
    const migrationClient = await pool.connect();
    try {
      await migrationClient.query("SET statement_timeout = '30s'");
      await migrationClient.query("SET lock_timeout = '5s'");
      await migrationClient.query(`CREATE SCHEMA ${quotedSchema}`);
      schemaCreated = true;
      stage(`created disposable schema ${schemaName}`);

      for (const migration of PRE_INDEX_MIGRATIONS) {
        await applyMigration(migrationClient, schemaName, migration);
      }
      await verifySettlementBaseline(migrationClient, schemaName);
      await verifyObjectsStayInSchema(migrationClient, schemaName);
      await verifyPreIndexFixtures(migrationClient, schemaName);
      await runStorageWorker({
        phase: "pre-index",
        schemaName,
        testDatabaseUrl,
        configuredDatabaseUrl,
      });
      await setIsolatedSearchPath(migrationClient, schemaName);
      await runDuplicatePreflight(migrationClient);
      await applyMigration(
        migrationClient,
        schemaName,
        FINAL_MIGRATION,
      );
      await verifyPostIndexConstraints(migrationClient, schemaName);
    } finally {
      migrationClient.release();
    }

    await runStorageWorker({
      phase: "post-index",
      schemaName,
      testDatabaseUrl,
      configuredDatabaseUrl,
    });
    stage("all disposable PostgreSQL checks passed");
  } finally {
    try {
      if (schemaCreated) {
        // The drop target can only be the exact cryptographically generated name
        // retained in this process. Never accept a cleanup target from argv/env.
        assertVerifierSchemaName(schemaName);
        const cleanupClient = await pool.connect();
        try {
          await cleanupClient.query("SET search_path TO pg_catalog");
          await cleanupClient.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
          stage(`dropped disposable schema ${schemaName}`);
        } finally {
          cleanupClient.release();
        }
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  const pgError = postgresError(error);
  const suffix = pgError?.code ? ` [PostgreSQL ${pgError.code}]` : "";
  console.error(`[postgres-verifier] FAILED${suffix}: ${error.message}`);
  process.exitCode = 1;
});
