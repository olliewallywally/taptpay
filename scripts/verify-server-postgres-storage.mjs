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
  await verifyTeamSeatConcurrency(storage);
  await verifyPasswordResetAtomicity(storage);
  const paidSubscription = await verifySubscriptionCardLifecycle(storage);
  await verifyPaidSubscriptionPlanChanges(storage, paidSubscription);
  await verifyDeclinedSubscriptionCardSetup(storage);
  await verifySubscriptionBillingClaimConcurrency(storage, storageModule);
}

async function verifyTeamSeatConcurrency(storage) {
  const merchantId = await insertMerchant("Concurrent team-seat merchant");
  const subscription = await storage.getOrCreateSubscription(merchantId);
  await pool.query(
    `UPDATE merchant_subscriptions
        SET plan_id = 'team',
            seat_limit = 5,
            price_cents = 899,
            status = 'active'
      WHERE id = $1`,
    [subscription.id],
  );

  const ownerEmail =
    `postgres-verifier-owner-${randomBytes(8).toString("hex")}@example.test`;
  await pool.query(
    `INSERT INTO users (email, password, merchant_id, role, status)
     VALUES ($1, 'owner-password-hash', $2, 'owner', 'active')`,
    [ownerEmail, merchantId],
  );

  const invitations = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      storage.inviteTeamMember(merchantId, {
        email:
          `postgres-verifier-invite-${index}-${randomBytes(8).toString("hex")}@example.test`,
        name: `Concurrent invite ${index + 1}`,
        inviteTokenHash: digest(),
        inviteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    ),
  );
  assert.equal(invitations.filter((result) => result.ok).length, 4);
  assert.equal(
    invitations.filter(
      (result) => !result.ok && result.reason === "seat-limit",
    ).length,
    4,
  );
  assert.equal(await storage.countSeatsInUse(merchantId), 5);

  const persisted = await pool.query(
    `SELECT role, status, count(*)::integer AS rows
       FROM users
      WHERE merchant_id = $1
      GROUP BY role, status
      ORDER BY role, status`,
    [merchantId],
  );
  assert.deepEqual(persisted.rows, [
    { role: "member", status: "invited", rows: 4 },
    { role: "owner", status: "active", rows: 1 },
  ]);

  const caseCollision = await storage.inviteTeamMember(merchantId, {
    email: ownerEmail.toUpperCase(),
    name: "Duplicate owner",
    inviteTokenHash: digest(),
    inviteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  assert.deepEqual(caseCollision, { ok: false, reason: "email-taken" });
  stage("proved 8-way team invite serialization and case-insensitive identity uniqueness");
}

async function verifyPasswordResetAtomicity(storage) {
  const merchantId = await insertMerchant("Atomic reset merchant");
  const userResult = await pool.query(
    `INSERT INTO users (email, password, merchant_id, role, status)
     VALUES ($1, 'old-password-hash', $2, 'owner', 'active')
     RETURNING id`,
    [
      `postgres-verifier-reset-${randomBytes(8).toString("hex")}@example.test`,
      merchantId,
    ],
  );
  const userId = userResult.rows[0].id;
  const tokenHash = digest();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  await storage.setUserResetToken(userId, tokenHash, expiresAt);
  assert.equal((await storage.getUserByResetToken(tokenHash))?.id, userId);

  const consumed = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.resetUserPasswordByToken(
        tokenHash,
        "new-password-hash",
        new Date(),
      ),
    ),
  );
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.equal(await storage.getUserByResetToken(tokenHash), undefined);

  const persisted = await Promise.all([
    pool.query(
      `SELECT password, reset_token, reset_token_expiry
         FROM users
        WHERE id = $1`,
      [userId],
    ),
    pool.query(
      "SELECT password_hash FROM merchants WHERE id = $1",
      [merchantId],
    ),
  ]);
  assert.deepEqual(persisted[0].rows, [
    {
      password: "new-password-hash",
      reset_token: null,
      reset_token_expiry: null,
    },
  ]);
  assert.deepEqual(persisted[1].rows, [
    { password_hash: "new-password-hash" },
  ]);

  const expiredHash = digest();
  await storage.setUserResetToken(
    userId,
    expiredHash,
    new Date(Date.now() - 1000),
  );
  assert.equal(
    await storage.resetUserPasswordByToken(
      expiredHash,
      "must-not-be-written",
      new Date(),
    ),
    null,
  );
  const unchanged = await pool.query(
    "SELECT password FROM users WHERE id = $1",
    [userId],
  );
  assert.equal(unchanged.rows[0].password, "new-password-hash");
  stage("proved single-winner reset-token consumption, expiry, and owner hash sync");
}

async function verifySubscriptionCardLifecycle(storage) {
  const merchantId = await insertMerchant("Approved subscription-card merchant");
  const foreignMerchantId = await insertMerchant("Foreign subscription-card merchant");
  const subscription = await storage.getOrCreateSubscription(merchantId);
  await storage.getOrCreateSubscription(foreignMerchantId);

  const sessionId =
    `postgres-verifier-card-session-${randomBytes(8).toString("hex")}`;
  const foreignSessionId =
    `postgres-verifier-foreign-session-${randomBytes(8).toString("hex")}`;
  assert.equal(
    await storage.bindSubscriptionCardSession(merchantId, `  ${sessionId}  `),
    true,
  );
  assert.equal(
    await storage.bindSubscriptionCardSession(
      foreignMerchantId,
      foreignSessionId,
    ),
    true,
  );

  let mismatchedChargeCalls = 0;
  const mismatch = await storage.completeSubscriptionCardSetup(
    foreignMerchantId,
    sessionId,
    {
      windcaveCardId: "foreign-card-must-not-save",
      brand: "Visa",
      last4: "9999",
      expiry: "12/30",
    },
    async () => {
      mismatchedChargeCalls += 1;
      return { success: true, approved: true };
    },
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "session-mismatch");
  assert.equal(mismatchedChargeCalls, 0);
  const foreignState = await pool.query(
    `SELECT windcave_card_id, last_billing_date
       FROM merchant_subscriptions
      WHERE merchant_id = $1`,
    [foreignMerchantId],
  );
  assert.deepEqual(foreignState.rows, [
    { windcave_card_id: null, last_billing_date: null },
  ]);

  const chargeRequests = [];
  const card = {
    windcaveCardId: "postgres-verifier-card-approved",
    brand: "Visa",
    last4: "4242",
    expiry: "12/30",
  };
  const callbacks = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.completeSubscriptionCardSetup(
        merchantId,
        sessionId,
        card,
        async (request) => {
          chargeRequests.push(request);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            success: true,
            approved: true,
            windcaveTransactionId: "postgres-verifier-initial-approved",
          };
        },
      ),
    ),
  );
  assert.ok(callbacks.every((result) => result.ok));
  assert.equal(
    callbacks.filter((result) => result.ok && result.charged).length,
    1,
  );
  assert.equal(
    callbacks.filter((result) => result.ok && !result.charged).length,
    7,
  );
  assert.equal(chargeRequests.length, 1);
  assert.equal(chargeRequests[0].subscriptionId, subscription.id);
  assert.equal(chargeRequests[0].merchantId, merchantId);
  assert.equal(chargeRequests[0].cardId, card.windcaveCardId);
  assert.equal(chargeRequests[0].amountCents, 799);
  assert.match(
    chargeRequests[0].idempotencyKey,
    new RegExp(`^sub-${subscription.id}-card-[0-9a-f]{16}$`),
  );

  const approvedState = await Promise.all([
    pool.query(
      `SELECT plan_id, seat_limit, price_cents, status,
              current_period_start, current_period_end, next_billing_date,
              last_billing_date, failed_payment_count,
              windcave_card_id, card_brand, card_last4, card_expiry,
              windcave_billing_ref
         FROM merchant_subscriptions
        WHERE id = $1`,
      [subscription.id],
    ),
    pool.query(
      `SELECT billing_type, amount, billing_period_start, billing_period_end,
              windcave_transaction_id, idempotency_key, attempt_number,
              status, failure_reason, paid_at
         FROM subscription_billing_history
        WHERE subscription_id = $1
          AND billing_type = 'monthly_subscription'
        ORDER BY id`,
      [subscription.id],
    ),
  ]);
  const persistedSubscription = approvedState[0].rows[0];
  assert.deepEqual(
    [
      persistedSubscription.plan_id,
      persistedSubscription.seat_limit,
      persistedSubscription.price_cents,
      persistedSubscription.status,
      persistedSubscription.failed_payment_count,
      persistedSubscription.windcave_card_id,
      persistedSubscription.card_brand,
      persistedSubscription.card_last4,
      persistedSubscription.card_expiry,
      persistedSubscription.windcave_billing_ref,
    ],
    [
      "solo",
      1,
      799,
      "active",
      0,
      card.windcaveCardId,
      card.brand,
      card.last4,
      card.expiry,
      sessionId,
    ],
  );
  assert.ok(persistedSubscription.current_period_start instanceof Date);
  assert.ok(persistedSubscription.current_period_end instanceof Date);
  assert.ok(persistedSubscription.next_billing_date instanceof Date);
  assert.equal(
    persistedSubscription.current_period_end.getTime(),
    persistedSubscription.next_billing_date.getTime(),
  );
  assert.equal(typeof persistedSubscription.last_billing_date, "string");

  assert.equal(approvedState[1].rows.length, 1);
  const approvedHistory = approvedState[1].rows[0];
  assert.deepEqual(
    [
      approvedHistory.billing_type,
      approvedHistory.amount,
      approvedHistory.windcave_transaction_id,
      approvedHistory.idempotency_key,
      approvedHistory.attempt_number,
      approvedHistory.status,
      approvedHistory.failure_reason,
    ],
    [
      "monthly_subscription",
      "7.99",
      "postgres-verifier-initial-approved",
      chargeRequests[0].idempotencyKey,
      1,
      "succeeded",
      null,
    ],
  );
  assert.ok(approvedHistory.billing_period_start instanceof Date);
  assert.ok(approvedHistory.billing_period_end instanceof Date);
  assert.ok(approvedHistory.paid_at instanceof Date);

  const replacementSessionId =
    `postgres-verifier-replacement-session-${randomBytes(8).toString("hex")}`;
  assert.equal(
    await storage.bindSubscriptionCardSession(merchantId, replacementSessionId),
    true,
  );
  let replacementChargeCalls = 0;
  const replacement = await storage.completeSubscriptionCardSetup(
    merchantId,
    replacementSessionId,
    {
      windcaveCardId: "postgres-verifier-card-replacement",
      brand: "Mastercard",
      last4: "4444",
      expiry: "11/31",
    },
    async () => {
      replacementChargeCalls += 1;
      return {
        success: true,
        approved: true,
        windcaveTransactionId: "must-not-charge-replacement",
      };
    },
  );
  assert.equal(replacement.ok, true);
  assert.equal(replacement.charged, false);
  assert.equal(replacementChargeCalls, 0);

  const replacementState = await Promise.all([
    pool.query(
      `SELECT windcave_card_id, card_brand, card_last4, card_expiry,
              status, last_billing_date
         FROM merchant_subscriptions
        WHERE id = $1`,
      [subscription.id],
    ),
    pool.query(
      `SELECT count(*)::integer AS rows
         FROM subscription_billing_history
        WHERE subscription_id = $1`,
      [subscription.id],
    ),
  ]);
  assert.deepEqual(replacementState[0].rows, [
    {
      windcave_card_id: "postgres-verifier-card-replacement",
      card_brand: "Mastercard",
      card_last4: "4444",
      card_expiry: "11/31",
      status: "active",
      last_billing_date: persistedSubscription.last_billing_date,
    },
  ]);
  assert.equal(replacementState[1].rows[0].rows, 1);

  stage(
    "proved card-session ownership, single-charge activation replay, and charge-free paid-period replacement",
  );
  return {
    merchantId,
    subscriptionId: subscription.id,
    currentPeriodEnd: persistedSubscription.current_period_end,
  };
}

async function verifyPaidSubscriptionPlanChanges(storage, paidSubscription) {
  const chargeRequests = [];
  const upgrades = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.changeSubscriptionPlan(
        paidSubscription.merchantId,
        "team",
        async (request) => {
          chargeRequests.push(request);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            success: true,
            approved: true,
            windcaveTransactionId: "postgres-verifier-upgrade-approved",
          };
        },
      ),
    ),
  );
  assert.ok(upgrades.every((result) => result.ok));
  assert.ok(
    upgrades.every(
      (result) => result.ok && result.applied === "immediate",
    ),
  );
  assert.equal(chargeRequests.length, 1);
  assert.equal(chargeRequests[0].subscriptionId, paidSubscription.subscriptionId);
  assert.equal(chargeRequests[0].merchantId, paidSubscription.merchantId);
  assert.equal(chargeRequests[0].targetPlanId, "team");
  assert.equal(chargeRequests[0].cardId, "postgres-verifier-card-replacement");
  assert.ok(chargeRequests[0].amountCents > 0);
  assert.ok(chargeRequests[0].amountCents <= 100);
  assert.match(
    chargeRequests[0].idempotencyKey,
    new RegExp(`^plan-${paidSubscription.subscriptionId}-\\d{4}-\\d{2}-\\d{2}-team-a1$`),
  );

  const upgraded = await Promise.all([
    pool.query(
      `SELECT plan_id, seat_limit, price_cents, pending_plan_id,
              pending_plan_effective_at, current_period_end, last_billing_date
         FROM merchant_subscriptions
        WHERE id = $1`,
      [paidSubscription.subscriptionId],
    ),
    pool.query(
      `SELECT amount, windcave_transaction_id, idempotency_key,
              attempt_number, status
         FROM subscription_billing_history
        WHERE subscription_id = $1 AND billing_type = 'plan_change'`,
      [paidSubscription.subscriptionId],
    ),
  ]);
  const upgradedSubscription = upgraded[0].rows[0];
  assert.deepEqual(
    [
      upgradedSubscription.plan_id,
      upgradedSubscription.seat_limit,
      upgradedSubscription.price_cents,
      upgradedSubscription.pending_plan_id,
      upgradedSubscription.pending_plan_effective_at,
    ],
    ["team", 5, 899, null, null],
  );
  assert.equal(upgraded[1].rows.length, 1);
  assert.deepEqual(
    [
      upgraded[1].rows[0].amount,
      upgraded[1].rows[0].windcave_transaction_id,
      upgraded[1].rows[0].idempotency_key,
      upgraded[1].rows[0].attempt_number,
      upgraded[1].rows[0].status,
    ],
    [
      (chargeRequests[0].amountCents / 100).toFixed(2),
      "postgres-verifier-upgrade-approved",
      chargeRequests[0].idempotencyKey,
      1,
      "succeeded",
    ],
  );

  let downgradeChargeCalls = 0;
  const downgrade = await storage.changeSubscriptionPlan(
    paidSubscription.merchantId,
    "solo",
    async () => {
      downgradeChargeCalls += 1;
      return { success: true, approved: true };
    },
  );
  assert.equal(downgrade.ok, true);
  assert.equal(downgrade.applied, "queued");
  assert.equal(downgradeChargeCalls, 0);

  const downgraded = await pool.query(
    `SELECT plan_id, seat_limit, price_cents, pending_plan_id,
            pending_plan_effective_at, current_period_end
       FROM merchant_subscriptions
      WHERE id = $1`,
    [paidSubscription.subscriptionId],
  );
  assert.deepEqual(
    [
      downgraded.rows[0].plan_id,
      downgraded.rows[0].seat_limit,
      downgraded.rows[0].price_cents,
      downgraded.rows[0].pending_plan_id,
    ],
    ["team", 5, 899, "solo"],
  );
  assert.equal(
    downgraded.rows[0].pending_plan_effective_at.getTime(),
    downgraded.rows[0].current_period_end.getTime(),
  );
  assert.equal(
    downgraded.rows[0].current_period_end.getTime(),
    paidSubscription.currentPeriodEnd.getTime(),
  );

  const historyCount = await pool.query(
    `SELECT count(*)::integer AS rows
       FROM subscription_billing_history
      WHERE subscription_id = $1 AND billing_type = 'plan_change'`,
    [paidSubscription.subscriptionId],
  );
  assert.equal(historyCount.rows[0].rows, 1);
  stage("proved paid upgrade proration/idempotency and charge-free queued downgrade");
}

async function verifyDeclinedSubscriptionCardSetup(storage) {
  const merchantId = await insertMerchant("Declined subscription-card merchant");
  const subscription = await storage.getOrCreateSubscription(merchantId);
  const sessionId =
    `postgres-verifier-declined-session-${randomBytes(8).toString("hex")}`;
  assert.equal(
    await storage.bindSubscriptionCardSession(merchantId, sessionId),
    true,
  );

  let chargeCalls = 0;
  const callbacks = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.completeSubscriptionCardSetup(
        merchantId,
        sessionId,
        {
          windcaveCardId: "postgres-verifier-card-declined",
          brand: "Visa",
          last4: "0002",
          expiry: "10/30",
        },
        async () => {
          chargeCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            success: true,
            approved: false,
            windcaveTransactionId: "postgres-verifier-initial-declined",
            declineReason: "Verifier decline",
          };
        },
      ),
    ),
  );
  assert.equal(chargeCalls, 1);
  assert.ok(
    callbacks.every(
      (result) => !result.ok && result.reason === "declined",
    ),
  );

  const declined = await Promise.all([
    pool.query(
      `SELECT status, failed_payment_count, last_payment_failure_reason,
              current_period_start, current_period_end, next_billing_date,
              last_billing_date, windcave_card_id, card_last4
         FROM merchant_subscriptions
        WHERE id = $1`,
      [subscription.id],
    ),
    pool.query(
      `SELECT amount, windcave_transaction_id, idempotency_key,
              attempt_number, status, failure_reason, paid_at
         FROM subscription_billing_history
        WHERE subscription_id = $1
        ORDER BY id`,
      [subscription.id],
    ),
  ]);
  assert.deepEqual(
    [
      declined[0].rows[0].status,
      declined[0].rows[0].failed_payment_count,
      declined[0].rows[0].last_payment_failure_reason,
      declined[0].rows[0].current_period_start,
      declined[0].rows[0].current_period_end,
      declined[0].rows[0].last_billing_date,
      declined[0].rows[0].windcave_card_id,
      declined[0].rows[0].card_last4,
    ],
    [
      "past_due",
      1,
      "Verifier decline",
      null,
      null,
      null,
      "postgres-verifier-card-declined",
      "0002",
    ],
  );
  assert.ok(declined[0].rows[0].next_billing_date instanceof Date);
  assert.equal(declined[1].rows.length, 1);
  assert.deepEqual(
    [
      declined[1].rows[0].amount,
      declined[1].rows[0].windcave_transaction_id,
      declined[1].rows[0].attempt_number,
      declined[1].rows[0].status,
      declined[1].rows[0].failure_reason,
      declined[1].rows[0].paid_at,
    ],
    [
      "7.99",
      "postgres-verifier-initial-declined",
      1,
      "failed",
      "Verifier decline",
      null,
    ],
  );
  assert.match(
    declined[1].rows[0].idempotency_key,
    new RegExp(`^sub-${subscription.id}-card-[0-9a-f]{16}$`),
  );

  // Keep this deliberately declined fixture out of the due-row claim proof.
  await pool.query(
    `UPDATE merchant_subscriptions
        SET status = 'pending',
            windcave_card_id = NULL,
            next_billing_date = NULL
      WHERE id = $1`,
    [subscription.id],
  );
  stage("proved declined activation replay records one failure and one dunning increment");
}

async function verifySubscriptionBillingClaimConcurrency(
  storage,
  storageModule,
) {
  const merchantId = await insertMerchant("Billing claim merchant");
  const subscription = await storage.getOrCreateSubscription(merchantId);
  const claimedAt = new Date();
  const dueAt = new Date(claimedAt.getTime() - 1000);
  const periodStart = new Date(
    dueAt.getTime() - 30 * 24 * 60 * 60 * 1000,
  );
  await pool.query(
    `UPDATE merchant_subscriptions
        SET status = 'active',
            windcave_card_id = 'postgres-verifier-claim-card',
            current_period_start = $2,
            current_period_end = $3,
            next_billing_date = $3,
            last_billing_date = $4,
            billing_claim_token = NULL,
            billing_claimed_at = NULL
      WHERE id = $1`,
    [subscription.id, periodStart, dueAt, periodStart.toISOString()],
  );

  const initialClaims = await storage.claimSubscriptionsDueForBilling(
    claimedAt,
    100,
  );
  assert.equal(initialClaims.length, 1);
  assert.equal(initialClaims[0].id, subscription.id);
  const firstToken = initialClaims[0].billingClaimToken;
  assert.equal(typeof firstToken, "string");

  const overlappingClaims = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.claimSubscriptionsDueForBilling(claimedAt, 100),
    ),
  );
  assert.equal(overlappingClaims.flat().length, 0);

  const reclaimedAt = new Date(
    claimedAt.getTime()
      + storageModule.SUBSCRIPTION_BILLING_CLAIM_LEASE_MS
      + 1,
  );
  const reclaimed = await storage.claimSubscriptionsDueForBilling(
    reclaimedAt,
    100,
  );
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].id, subscription.id);
  const secondToken = reclaimed[0].billingClaimToken;
  assert.equal(typeof secondToken, "string");
  assert.notEqual(secondToken, firstToken);

  const staleHistoryKey = `stale-billing-${randomUUID()}`;
  assert.equal(
    await storage.finalizeSubscriptionBillingClaim(
      subscription.id,
      firstToken,
      { status: "suspended", failedPaymentCount: 99 },
      {
        merchantId,
        subscriptionId: subscription.id,
        billingType: "monthly_subscription",
        amount: "7.99",
        idempotencyKey: staleHistoryKey,
        attemptNumber: 99,
        status: "failed",
      },
    ),
    false,
  );
  const afterStale = await Promise.all([
    pool.query(
      `SELECT status, failed_payment_count, billing_claim_token
         FROM merchant_subscriptions
        WHERE id = $1`,
      [subscription.id],
    ),
    pool.query(
      `SELECT count(*)::integer AS rows
         FROM subscription_billing_history
        WHERE idempotency_key = $1`,
      [staleHistoryKey],
    ),
  ]);
  assert.equal(afterStale[0].rows[0].status, "active");
  assert.equal(afterStale[0].rows[0].failed_payment_count, 0);
  assert.equal(afterStale[0].rows[0].billing_claim_token, secondToken);
  assert.equal(afterStale[1].rows[0].rows, 0);

  const nextPeriodStart = dueAt;
  const nextPeriodEnd = new Date(
    dueAt.getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  const historyKey = `billing-finalize-${randomUUID()}`;
  const finalizeInput = [
    subscription.id,
    secondToken,
    {
      status: "active",
      currentPeriodStart: nextPeriodStart,
      currentPeriodEnd: nextPeriodEnd,
      nextBillingDate: nextPeriodEnd,
      lastBillingDate: reclaimedAt.toISOString(),
      failedPaymentCount: 0,
      lastPaymentFailureAt: null,
      lastPaymentFailureReason: null,
      updatedAt: reclaimedAt,
    },
    {
      merchantId,
      subscriptionId: subscription.id,
      billingType: "monthly_subscription",
      amount: "7.99",
      billingPeriodStart: nextPeriodStart,
      billingPeriodEnd: nextPeriodEnd,
      windcaveTransactionId: "postgres-verifier-renewal-approved",
      idempotencyKey: historyKey,
      attemptNumber: 1,
      status: "succeeded",
      description: "Verifier renewal",
      paidAt: reclaimedAt,
    },
  ];
  const finalizations = await Promise.all(
    Array.from({ length: 8 }, () =>
      storage.finalizeSubscriptionBillingClaim(...finalizeInput),
    ),
  );
  assert.equal(finalizations.filter(Boolean).length, 1);

  const finalized = await Promise.all([
    pool.query(
      `SELECT status, current_period_start, current_period_end,
              next_billing_date, last_billing_date, failed_payment_count,
              billing_claim_token, billing_claimed_at
         FROM merchant_subscriptions
        WHERE id = $1`,
      [subscription.id],
    ),
    pool.query(
      `SELECT amount, windcave_transaction_id, idempotency_key,
              attempt_number, status
         FROM subscription_billing_history
        WHERE subscription_id = $1 AND idempotency_key = $2`,
      [subscription.id, historyKey],
    ),
  ]);
  assert.deepEqual(
    [
      finalized[0].rows[0].status,
      finalized[0].rows[0].current_period_start.getTime(),
      finalized[0].rows[0].current_period_end.getTime(),
      finalized[0].rows[0].next_billing_date.getTime(),
      finalized[0].rows[0].last_billing_date,
      finalized[0].rows[0].failed_payment_count,
      finalized[0].rows[0].billing_claim_token,
      finalized[0].rows[0].billing_claimed_at,
    ],
    [
      "active",
      nextPeriodStart.getTime(),
      nextPeriodEnd.getTime(),
      nextPeriodEnd.getTime(),
      reclaimedAt.toISOString(),
      0,
      null,
      null,
    ],
  );
  assert.deepEqual(finalized[1].rows, [
    {
      amount: "7.99",
      windcave_transaction_id: "postgres-verifier-renewal-approved",
      idempotency_key: historyKey,
      attempt_number: 1,
      status: "succeeded",
    },
  ]);
  stage(
    "proved billing claim exclusion, stale-lease takeover, and single-winner claim finalization",
  );
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
  assert.equal(winner.counterIncremented, true);
  assert.ok(
    results
      .filter((result) => result.kind === "reused")
      .every((result) => result.counterIncremented === false),
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
  // No per-transaction fee is charged or accrued under subscription pricing.
  assert.deepEqual(persisted[3].rows, []);
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
  assert.equal(stableEffects[0].rows[0].rows, 0);
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
