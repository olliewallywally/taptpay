import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import {
  assertSafePostgresVerifierEnvironment,
  assertVerifierSchemaName,
} from "./postgres-verifier-safety.mjs";

const { Pool } = pg;
const phase = process.env.TAPTPAY_VERIFY_PHASE;
if (phase !== "pre-index" && phase !== "post-index") {
  throw new Error("TAPTPAY_VERIFY_PHASE must be pre-index or post-index");
}

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl: process.env.TAPTPAY_VERIFY_CONFIGURED_DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
const schemaName = assertVerifierSchemaName(
  process.env.TAPTPAY_VERIFY_SCHEMA ?? "",
);

const pool = new Pool({
  connectionString: testDatabaseUrl,
  application_name: `taptpay-storage-verifier-${phase}`,
  max: 20,
  options: `-c search_path=${schemaName},pg_catalog`,
});

function stage(message) {
  console.log(`[postgres-verifier:${phase}] ${message}`);
}

async function insertMerchant(label) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomBytes(8).toString("hex");
  const result = await pool.query(
    `INSERT INTO merchants (name, business_name, email, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [label, label, `${slug}-${suffix}@example.test`],
  );
  return result.rows[0].id;
}

function digest() {
  return randomBytes(32).toString("hex");
}

async function verifyPreIndexAllocator(storage, storageModule) {
  const index = await pool.query(
    `SELECT 1
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname = 'tapt_stones_active_merchant_number_uq'`,
    [schemaName],
  );
  assert.deepEqual(index.rows, [], "active-board index unexpectedly exists");

  const merchantId = await insertMerchant("Concurrent allocator merchant");
  await storage.createTaptStone({
    merchantId,
    name: "Existing one",
    stoneNumber: 1,
    isActive: true,
  });
  await storage.createTaptStone({
    merchantId,
    name: "Archived two",
    stoneNumber: 2,
    isActive: false,
  });
  await storage.createTaptStone({
    merchantId,
    name: "Existing three",
    stoneNumber: 3,
    isActive: true,
  });

  // There is deliberately no unique index here. Only the advisory lock can
  // prevent two successful allocators from choosing the same first-free slot.
  const created = await Promise.all(
    Array.from({ length: 8 }, (_, indexValue) =>
      storage.createNextTaptStone(
        merchantId,
        `Concurrent ${indexValue + 1}`,
      ),
    ),
  );
  assert.deepEqual(
    created.map((stone) => stone.stoneNumber).sort((a, b) => a - b),
    [2, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(new Set(created.map((stone) => stone.stoneNumber)).size, 8);
  await assert.rejects(
    storage.createNextTaptStone(merchantId),
    (error) => error instanceof storageModule.TaptStoneCapacityError,
  );

  const duplicates = await pool.query(
    `SELECT stone_number, count(*)::integer AS rows
       FROM tapt_stones
      WHERE merchant_id = $1
        AND is_active IS TRUE
      GROUP BY stone_number
     HAVING count(*) > 1`,
    [merchantId],
  );
  assert.deepEqual(duplicates.rows, []);
  stage("proved first-free gap allocation and 8-way pre-index serialization");
}

function transactionInput(
  storageModule,
  { merchantId, itemName, price, selectedStoneId = null, tokenHash },
) {
  return storageModule.toTransactionStorageInput(
    {
      merchantId,
      itemName,
      price,
      status: "pending",
      paymentMethod: "qr_code",
      selectedStoneId,
      splitEnabled: true,
    },
    tokenHash === undefined ? {} : { paymentTokenHash: tokenHash },
  );
}

async function verifyPostIndexStorage(storage, storageModule) {
  const merchantId = await insertMerchant("Post-index storage merchant");
  const board = await storage.createNextTaptStone(merchantId, "Persisted board");
  const boardTransaction = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Selected board transaction",
      price: "12.34",
      selectedStoneId: board.id,
    }),
  );
  assert.equal(boardTransaction.taptStoneId, board.id);
  const persistedBoard = await pool.query(
    "SELECT tapt_stone_id FROM transactions WHERE id = $1",
    [boardTransaction.id],
  );
  assert.equal(persistedBoard.rows[0].tapt_stone_id, board.id);

  const legacyOne = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Legacy one",
      price: "10.00",
    }),
  );
  const legacyTwo = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Legacy two",
      price: "11.00",
    }),
  );
  const tokenHash = digest();
  assert.equal(
    await storage.getTransactionByPaymentTokenHash(tokenHash),
    undefined,
  );
  const tokenTransaction = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Token transaction",
      price: "13.00",
      tokenHash,
    }),
  );
  assert.equal(
    (await storage.getTransactionByPaymentTokenHash(tokenHash))?.id,
    tokenTransaction.id,
  );

  const tiedCreatedAt = new Date("2026-08-06T13:00:00.000Z");
  await pool.query(
    `UPDATE transactions
        SET created_at = $1
      WHERE id = ANY($2::integer[])`,
    [
      tiedCreatedAt,
      [
        boardTransaction.id,
        legacyOne.id,
        legacyTwo.id,
        tokenTransaction.id,
      ],
    ],
  );
  assert.equal(
    (
      await storage.getActiveTransactionByMerchant(merchantId, {
        kind: "merchant-any",
      })
    )?.id,
    tokenTransaction.id,
  );
  assert.equal(
    (
      await storage.getActiveTransactionByMerchant(merchantId, {
        kind: "legacy-no-board",
      })
    )?.id,
    legacyTwo.id,
  );
  assert.equal(
    (
      await storage.getActiveTransactionByMerchant(merchantId, {
        kind: "board",
        stoneId: board.id,
      })
    )?.id,
    boardTransaction.id,
  );

  const foreignMerchantId = await insertMerchant("Foreign token merchant");
  const foreignHash = digest();
  const foreignTransaction = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId: foreignMerchantId,
      itemName: "Foreign token transaction",
      price: "14.00",
      tokenHash: foreignHash,
    }),
  );
  assert.equal(
    (await storage.getTransactionByPaymentTokenHash(tokenHash))?.id,
    tokenTransaction.id,
  );
  assert.equal(
    (await storage.getTransactionByPaymentTokenHash(foreignHash))?.id,
    foreignTransaction.id,
  );
  stage("proved canonical board persistence, final scopes, and token lookup");

  await verifyPaymentAttemptConcurrency(storage, storageModule, merchantId);
  await verifySplitCompareAndSet(storage, storageModule, merchantId);
}

async function verifyPaymentAttemptConcurrency(
  storage,
  storageModule,
  merchantId,
) {
  const transaction = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Attempt concurrency transaction",
      price: "21.00",
      tokenHash: digest(),
    }),
  );
  const now = new Date();
  const idempotencyKey = randomUUID();
  const claimInput = {
    transactionId: transaction.id,
    shareIndex: 0,
    idempotencyKey,
    now,
    leaseExpiresAt: new Date(now.getTime() + 4 * 60 * 1000),
  };
  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.claimPaymentAttemptRecord(claimInput),
    ),
  );
  assert.equal(claims.filter((result) => result.kind === "claimed").length, 1);
  assert.equal(claims.filter((result) => result.kind === "reused").length, 7);
  const attempt = claims[0].attempt;
  assert.ok(attempt);
  assert.equal(
    (
      await storage.getPaymentAttemptByTransactionShareKey(
        transaction.id,
        0,
        idempotencyKey,
      )
    )?.id,
    attempt.id,
  );

  const conflict = await storage.claimPaymentAttemptRecord({
    ...claimInput,
    idempotencyKey: randomUUID(),
  });
  assert.equal(conflict.kind, "conflict");

  const returnStateHash = digest();
  const attached = await storage.attachPaymentAttemptSessionRecord({
    attemptId: attempt.id,
    processorSessionId: "postgres-verifier-session",
    processorXId: "postgres-verifier-xid",
    returnStateHash,
    returnStateExpiresAt: new Date(now.getTime() + 20 * 60 * 1000),
    now: new Date(now.getTime() + 1000),
  });
  assert.equal(attached.kind, "attached");
  assert.equal(
    (await storage.getPaymentAttemptByReturnStateHash(returnStateHash))?.id,
    attempt.id,
  );

  const finalizationClaims = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.claimPaymentAttemptFinalizationRecord({
        attemptId: attempt.id,
        processorSessionId: "postgres-verifier-session",
        now: new Date(now.getTime() + 2000),
      }),
    ),
  );
  assert.equal(
    finalizationClaims.filter((result) => result.kind === "claimed").length,
    1,
  );
  assert.equal(
    finalizationClaims.filter((result) => result.kind === "reused").length,
    7,
  );

  const finalized = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.finalizePaymentAttemptRecord({
        attemptId: attempt.id,
        processorSessionId: "postgres-verifier-session",
        processorTransactionId: null,
        paymentMethod: "card",
        outcome: "declined",
        receiptShare: null,
        now: new Date(now.getTime() + 3000),
      }),
    ),
  );
  assert.equal(
    finalized.filter((result) => result.kind === "finalized").length,
    1,
  );
  assert.equal(
    finalized.filter((result) => result.kind === "reused").length,
    7,
  );
  assert.ok(
    finalized.every(
      (result) =>
        result.attempt.state === "declined" &&
        result.transaction.status === "failed" &&
        result.platformFee === null &&
        result.counterIncremented === false,
      ),
  );
  const declinedEffects = await Promise.all([
    pool.query(
      "SELECT count(*)::integer AS rows FROM platform_fees WHERE transaction_id = $1",
      [transaction.id],
    ),
    pool.query(
      "SELECT count(*)::integer AS rows FROM merchant_subscriptions WHERE merchant_id = $1",
      [merchantId],
    ),
  ]);
  assert.equal(declinedEffects[0].rows[0].rows, 0);
  assert.equal(declinedEffects[1].rows[0].rows, 0);
  stage(
    "proved same-key claim reuse, live-key conflict, and effect-free declined CAS",
  );
}

async function verifySplitCompareAndSet(storage, storageModule, merchantId) {
  const first = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Split transaction A",
      price: "10.01",
      tokenHash: digest(),
    }),
  );
  const second = await storage.createTransaction(
    transactionInput(storageModule, {
      merchantId,
      itemName: "Split transaction B",
      price: "7.00",
      tokenHash: digest(),
    }),
  );

  const sameCount = await Promise.all(
    Array.from({ length: 8 }, () => storage.createBillSplit(first.id, 3)),
  );
  assert.ok(sameCount.every((transaction) => transaction?.totalSplits === 3));
  await assert.rejects(
    storage.createBillSplit(first.id, 4),
    (error) => error instanceof storageModule.BillSplitConflictError,
  );
  await Promise.all(
    Array.from({ length: 4 }, () => storage.createBillSplit(second.id, 2)),
  );

  const rows = await pool.query(
    `SELECT transaction_id, split_index, amount
       FROM split_payments
      WHERE transaction_id = ANY($1::integer[])
      ORDER BY transaction_id, split_index`,
    [[first.id, second.id]],
  );
  const firstRows = rows.rows.filter((row) => row.transaction_id === first.id);
  const secondRows = rows.rows.filter((row) => row.transaction_id === second.id);
  assert.deepEqual(
    firstRows.map((row) => [row.split_index, row.amount]),
    [
      [1, "3.33"],
      [2, "3.33"],
      [3, "3.35"],
    ],
  );
  assert.deepEqual(
    secondRows.map((row) => [row.split_index, row.amount]),
    [
      [1, "3.50"],
      [2, "3.50"],
    ],
  );
  assert.equal(new Set(rows.rows.map((row) => row.transaction_id)).size, 2);
  stage("proved split compare-and-set idempotency and transaction isolation");

  await verifyApprovedSplitFinalization(storage, first, merchantId);
}

async function verifyApprovedSplitFinalization(
  storage,
  transaction,
  merchantId,
) {
  // Keep this settlement race inside one lease. Processor-bound expired
  // attempts must be queried/finalized through the return path, not replaced
  // by a new claim; that separate expiry contract is intentionally not blurred
  // into this exactly-once settlement proof.
  const start = new Date("2026-08-06T16:00:00.000Z");
  const idempotencyKey = randomUUID();
  const sessionId = `postgres-verifier-approved-${transaction.id}`;
  const processorTransactionId =
    `postgres-verifier-processor-${transaction.id}`;
  const claimInput = {
    transactionId: transaction.id,
    shareIndex: 2,
    idempotencyKey,
    now: start,
    leaseExpiresAt: new Date(start.getTime() + 4 * 60 * 1000),
  };
  const claims = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.claimPaymentAttemptRecord(claimInput),
    ),
  );
  assert.equal(claims.filter((result) => result.kind === "claimed").length, 1);
  assert.equal(claims.filter((result) => result.kind === "reused").length, 7);
  const attempt = claims[0].attempt;
  assert.ok(attempt);
  assert.equal(
    (
      await storage.getPaymentAttemptByTransactionShareKey(
        transaction.id,
        2,
        idempotencyKey,
      )
    )?.id,
    attempt.id,
  );

  const attached = await storage.attachPaymentAttemptSessionRecord({
    attemptId: attempt.id,
    processorSessionId: sessionId,
    processorXId: `postgres-verifier-approved-xid-${transaction.id}`,
    returnStateHash: digest(),
    returnStateExpiresAt: new Date(start.getTime() + 20 * 60 * 1000),
    now: new Date(start.getTime() + 1000),
  });
  assert.equal(attached.kind, "attached");

  const finalizationClaims = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.claimPaymentAttemptFinalizationRecord({
        attemptId: attempt.id,
        processorSessionId: sessionId,
        now: new Date(start.getTime() + 2000),
      }),
    ),
  );
  assert.equal(
    finalizationClaims.filter((result) => result.kind === "claimed").length,
    1,
  );
  assert.equal(
    finalizationClaims.filter((result) => result.kind === "reused").length,
    7,
  );

  const finalizeInput = {
    attemptId: attempt.id,
    processorSessionId: sessionId,
    processorTransactionId,
    paymentMethod: "card",
    outcome: "approved",
    receiptShare: 2,
    now: new Date(start.getTime() + 3000),
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.finalizePaymentAttemptRecord(finalizeInput),
    ),
  );
  assert.equal(
    results.filter((result) => result.kind === "finalized").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.kind === "reused").length,
    7,
  );
  assert.ok(
    results.every(
      (result) =>
        (result.kind === "finalized" || result.kind === "reused") &&
        result.attempt.state === "approved" &&
        result.attempt.outcome === "approved" &&
        result.attempt.receiptShare === 2 &&
        result.transaction.id === transaction.id &&
        result.transaction.status === "pending" &&
        result.transaction.completedSplits === 1 &&
        result.splitPayment?.splitIndex === 2 &&
        result.splitPayment.status === "completed",
    ),
  );

  const winner = results.find((result) => result.kind === "finalized");
  assert.ok(winner);
  assert.equal(winner.platformFee?.transactionId, transaction.id);
  assert.equal(winner.platformFee?.merchantId, merchantId);
  assert.equal(winner.platformFee?.feeAmount, "0.10");
  assert.equal(winner.platformFee?.transactionAmount, "3.33");
  assert.equal(winner.platformFee?.status, "collected");
  assert.equal(winner.counterIncremented, true);
  assert.ok(
    results
      .filter((result) => result.kind === "reused")
      .every(
        (result) =>
          result.platformFee === null &&
          result.counterIncremented === false,
      ),
  );

  const persisted = await Promise.all([
    pool.query(
      `SELECT state, outcome, receipt_share
         FROM payment_attempts
        WHERE id = $1`,
      [attempt.id],
    ),
    pool.query(
      `SELECT status, completed_splits
         FROM transactions
        WHERE id = $1`,
      [transaction.id],
    ),
    pool.query(
      `SELECT split_index, status, windcave_transaction_id, payment_method
         FROM split_payments
        WHERE transaction_id = $1
        ORDER BY split_index`,
      [transaction.id],
    ),
    pool.query(
      `SELECT transaction_id, merchant_id, fee_amount, transaction_amount, status
         FROM platform_fees
        WHERE transaction_id = $1`,
      [transaction.id],
    ),
    pool.query(
      `SELECT merchant_id, current_month_transactions,
              total_lifetime_transactions, unbilled_transaction_count,
              unbilled_amount
         FROM merchant_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    ),
  ]);
  assert.deepEqual(persisted[0].rows, [
    { state: "approved", outcome: "approved", receipt_share: 2 },
  ]);
  assert.deepEqual(persisted[1].rows, [
    { status: "pending", completed_splits: 1 },
  ]);
  assert.deepEqual(
    persisted[2].rows.map((row) => [
      row.split_index,
      row.status,
      row.windcave_transaction_id,
      row.payment_method,
    ]),
    [
      [1, "pending", null, "qr_code"],
      [2, "completed", processorTransactionId, "card"],
      [3, "pending", null, "qr_code"],
    ],
  );
  assert.deepEqual(persisted[3].rows, [
    {
      transaction_id: transaction.id,
      merchant_id: merchantId,
      fee_amount: "0.10",
      transaction_amount: "3.33",
      status: "collected",
    },
  ]);
  assert.deepEqual(persisted[4].rows, [
    {
      merchant_id: merchantId,
      current_month_transactions: 1,
      total_lifetime_transactions: 1,
      unbilled_transaction_count: 0,
      unbilled_amount: "0.00",
    },
  ]);

  const replay = await storage.finalizePaymentAttemptRecord(finalizeInput);
  assert.equal(replay.kind, "reused");
  assert.equal(replay.platformFee, null);
  assert.equal(replay.counterIncremented, false);
  const stableEffects = await Promise.all([
    pool.query(
      "SELECT count(*)::integer AS rows FROM platform_fees WHERE transaction_id = $1",
      [transaction.id],
    ),
    pool.query(
      `SELECT current_month_transactions, total_lifetime_transactions,
              unbilled_transaction_count, unbilled_amount
         FROM merchant_subscriptions
        WHERE merchant_id = $1`,
      [merchantId],
    ),
  ]);
  assert.equal(stableEffects[0].rows[0].rows, 1);
  assert.deepEqual(stableEffects[1].rows, [
    {
      current_month_transactions: 1,
      total_lifetime_transactions: 1,
      unbilled_transaction_count: 0,
      unbilled_amount: "0.00",
    },
  ]);
  stage(
    "proved 8-way approved split finalization, one fee/counter effect, and stable replay",
  );
}

async function main() {
  const schemaResult = await pool.query("SELECT current_schema() AS schema_name");
  assert.equal(schemaResult.rows[0]?.schema_name, schemaName);

  // Import the application only after DATABASE_URL has been replaced by the
  // guarded disposable URL in the parent process. Then replace the class's
  // driver with node-postgres bound to the random schema.
  const [schema, storageModule] = await Promise.all([
    import("../shared/schema.ts"),
    import("../server/storage.ts"),
  ]);
  const isolatedDb = drizzle(pool, { schema });
  const storage = new storageModule.DatabaseStorage();
  Reflect.set(storage, "db", isolatedDb);

  if (phase === "pre-index") {
    await verifyPreIndexAllocator(storage, storageModule);
  } else {
    await verifyPostIndexStorage(storage, storageModule);
  }
}

try {
  await main();
} finally {
  try {
    await pool.end();
  } finally {
    // Importing DatabaseStorage initializes the repository's normal Neon pool,
    // but the verifier never queries it. Close it so the worker has no open handle.
    const importedDatabase = await import("../server/db.ts").catch(
      () => undefined,
    );
    await importedDatabase?.pool?.end().catch(() => undefined);
  }
}
