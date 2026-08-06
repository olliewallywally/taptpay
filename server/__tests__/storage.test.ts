jest.mock("../database", () => ({
  getDb: () => null,
  isDatabaseConnected: () => false,
}));

import type { InsertTransaction } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  DatabaseStorage,
  MemStorage,
  PUSH_NOTIFICATION_DELIVERY_LEASE_MS,
  TaptStoneCapacityError,
  TaptStoneConflictError,
  type TransactionStorageInput,
  toTransactionStorageInput,
} from "../storage";

function transactionInput(
  overrides: Partial<TransactionStorageInput> = {},
): TransactionStorageInput {
  return {
    merchantId: 1,
    itemName: "Storage test sale",
    price: "10.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    ...overrides,
  } as TransactionStorageInput;
}

describe("transaction storage addressing", () => {
  test("maps selectedStoneId and strips caller-owned token fields", () => {
    const request = {
      ...transactionInput(),
      selectedStoneId: 7,
      paymentTokenHash: "b".repeat(64),
      rawToken: "caller-secret",
      paymentToken: "caller-secret",
      token: "caller-secret",
    } as unknown as InsertTransaction;

    const canonical = toTransactionStorageInput(request);

    expect(canonical.taptStoneId).toBe(7);
    expect(canonical).not.toHaveProperty("selectedStoneId");
    expect(canonical).not.toHaveProperty("paymentTokenHash");
    expect(canonical).not.toHaveProperty("rawToken");
    expect(canonical).not.toHaveProperty("paymentToken");
    expect(canonical).not.toHaveProperty("token");

    const serverHash = "a".repeat(64);
    expect(toTransactionStorageInput(request, { paymentTokenHash: serverHash }))
      .toMatchObject({ taptStoneId: 7, paymentTokenHash: serverHash });
  });

  test("uses explicit merchant, no-board, and board scopes without stale misses", async () => {
    const storage = new MemStorage();

    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "legacy-no-board" }),
    ).resolves.toBeUndefined();

    const boardOne = await storage.createTransaction(transactionInput({ taptStoneId: 11 }));
    const noBoard = await storage.createTransaction(transactionInput({ taptStoneId: null }));
    const boardTwo = await storage.createTransaction(transactionInput({
      taptStoneId: 12,
      status: "processing",
    }));
    const tokenizedNoBoard = await storage.createTransaction(transactionInput({
      taptStoneId: null,
      paymentTokenHash: "a".repeat(64),
    }));
    await storage.createTransaction(transactionInput({ merchantId: 2, taptStoneId: null }));

    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "merchant-any" }),
    ).resolves.toMatchObject({ id: tokenizedNoBoard.id });
    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "legacy-no-board" }),
    ).resolves.toMatchObject({ id: noBoard.id });
    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "board", stoneId: 11 }),
    ).resolves.toMatchObject({ id: boardOne.id });
    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "board", stoneId: 12 }),
    ).resolves.toMatchObject({ id: boardTwo.id });

    await storage.updateTransactionStatus(noBoard.id, "failed");
    await expect(
      storage.getActiveTransactionByMerchant(1, { kind: "legacy-no-board" }),
    ).resolves.toBeUndefined();
  });

  test("prefers the newest active transaction and then a recent completion", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-06T10:00:00.000Z"));
    try {
      const storage = new MemStorage();
      const older = await storage.createTransaction(transactionInput({ taptStoneId: null }));
      const newer = await storage.createTransaction(transactionInput({ taptStoneId: null }));

      // Both rows have the exact same createdAt, so this proves the ID tie-break.
      await expect(
        storage.getActiveTransactionByMerchant(1, { kind: "legacy-no-board" }),
      ).resolves.toMatchObject({ id: newer.id });

      await storage.updateTransactionStatus(older.id, "failed");
      await storage.updateTransactionStatus(newer.id, "completed");
      await expect(
        storage.getActiveTransactionByMerchant(1, { kind: "legacy-no-board" }),
      ).resolves.toMatchObject({ id: newer.id, status: "completed" });
    } finally {
      jest.useRealTimers();
    }
  });

  test("looks up only the exact persisted payment-token digest", async () => {
    const storage = new MemStorage();
    const paymentTokenHash = "a".repeat(64);
    const tokenized = await storage.createTransaction(
      transactionInput({ paymentTokenHash }),
    );
    await storage.createTransaction(transactionInput());

    await expect(
      storage.getTransactionByPaymentTokenHash(paymentTokenHash),
    ).resolves.toMatchObject({ id: tokenized.id, paymentTokenHash });
    await expect(
      storage.getTransactionByPaymentTokenHash("b".repeat(64)),
    ).resolves.toBeUndefined();
  });

  test("never persists a raw bearer token passed at runtime", async () => {
    const storage = new MemStorage();
    const transaction = await storage.createTransaction({
      ...transactionInput({ paymentTokenHash: "a".repeat(64) }),
      rawToken: "must-not-be-stored",
      paymentToken: "must-not-be-stored",
      token: "must-not-be-stored",
    } as unknown as TransactionStorageInput);

    expect(transaction).not.toHaveProperty("rawToken");
    expect(transaction).not.toHaveProperty("paymentToken");
    expect(transaction).not.toHaveProperty("token");
  });
});

describe("push notification preference storage", () => {
  test("persists preferences across unsubscribe and reactivation", async () => {
    const storage = new MemStorage();
    const created = await storage.createPushSubscription({
      merchantId: 7,
      endpoint: "https://push.example.test/device",
      p256dh: "public-key",
      auth: "auth-secret",
    });
    expect(created.preferences).toEqual({
      paymentReceived: true,
      dailyPayoutSummary: true,
      failedPaymentAlerts: false,
    });

    const updated = {
      paymentReceived: false,
      dailyPayoutSummary: true,
      failedPaymentAlerts: true,
    };
    await storage.updatePushNotificationPreferences(7, updated);
    await storage.deactivatePushSubscriptionByEndpoint(created.endpoint);
    await storage.createPushSubscription({
      merchantId: 7,
      endpoint: created.endpoint,
      p256dh: "rotated-public-key",
      auth: "rotated-auth-secret",
    });

    await expect(storage.getPushNotificationPreferences(7)).resolves.toEqual(updated);
    await expect(storage.getPushSubscriptionsByMerchant(7)).resolves.toEqual([
      expect.objectContaining({ preferences: updated, isActive: true }),
    ]);
  });

  test("reacquires failed and stale claims while fencing stale workers", async () => {
    const storage = new MemStorage();
    const startedAt = new Date("2026-08-06T00:00:00.000Z");
    const first = await storage.claimPushNotificationDelivery(
      7,
      "daily_payout_summary",
      "2026-08-05",
      startedAt,
    );
    expect(first).toEqual(expect.any(String));
    await expect(storage.claimPushNotificationDelivery(
      7,
      "daily_payout_summary",
      "2026-08-05",
      new Date(startedAt.getTime() + 1_000),
    )).resolves.toBeNull();

    await storage.completePushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05", first!, "failed",
    );
    const retry = await storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05",
      new Date(startedAt.getTime() + 2_000),
    );
    expect(retry).toEqual(expect.any(String));
    expect(retry).not.toBe(first);
    await storage.completePushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05", retry!, "failed",
    );
    await storage.completePushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05", first!, "processed",
    );
    await expect(storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05",
      new Date(startedAt.getTime() + 3_000),
    )).resolves.toEqual(expect.any(String));

    const otherDate = "2026-08-04";
    await storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", otherDate, startedAt,
    );
    await expect(storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", otherDate,
      new Date(startedAt.getTime() + PUSH_NOTIFICATION_DELIVERY_LEASE_MS - 1),
    )).resolves.toBeNull();
    await expect(storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", otherDate,
      new Date(startedAt.getTime() + PUSH_NOTIFICATION_DELIVERY_LEASE_MS),
    )).resolves.toEqual(expect.any(String));
  });
});

describe("MemStorage board allocation", () => {
  test("reuses the first inactive-number gap", async () => {
    const storage = new MemStorage();
    const first = await storage.createTaptStone({
      merchantId: 1,
      name: "Old one",
      stoneNumber: 1,
    });
    await storage.createTaptStone({ merchantId: 1, name: "Three", stoneNumber: 3 });
    await storage.deleteTaptStone(first.id);

    await expect(storage.createNextTaptStone(1)).resolves.toMatchObject({
      merchantId: 1,
      name: "Stone 1",
      stoneNumber: 1,
      isActive: true,
    });
  });

  test("serializes concurrent creation and enforces the ten-board cap", async () => {
    const storage = new MemStorage();

    const stones = await Promise.all(
      Array.from({ length: 10 }, () => storage.createNextTaptStone(1)),
    );

    expect(stones.map((stone) => stone.stoneNumber).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    await expect(storage.createNextTaptStone(1)).rejects.toBeInstanceOf(
      TaptStoneCapacityError,
    );
  });

  test("allocates independently for different merchants", async () => {
    const storage = new MemStorage();

    const [merchantOne, merchantTwo] = await Promise.all([
      storage.createNextTaptStone(1, "Front counter"),
      storage.createNextTaptStone(2, "Front counter"),
    ]);

    expect(merchantOne).toMatchObject({ merchantId: 1, stoneNumber: 1 });
    expect(merchantTwo).toMatchObject({ merchantId: 2, stoneNumber: 1 });
  });
});

describe("DatabaseStorage write shape", () => {
  test("inserts taptStoneId without forwarding selectedStoneId to Drizzle", async () => {
    let inserted: Record<string, unknown> | undefined;
    const fakeDb = {
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          inserted = value;
          return { returning: async () => [{ id: 1, ...value }] };
        },
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;
    const request = {
      ...transactionInput(),
      selectedStoneId: 8,
    } as InsertTransaction;

    await storage.createTransaction(request);

    expect(inserted).toMatchObject({ taptStoneId: 8 });
    expect(inserted).not.toHaveProperty("selectedStoneId");
  });

  test("queries the exact payment-token digest column", async () => {
    const paymentTokenHash = "a".repeat(64);
    const expected = { id: 41, paymentTokenHash };
    let whereCondition: any;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereCondition = condition;
            return { limit: async () => [expected] };
          },
        }),
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;

    await expect(
      storage.getTransactionByPaymentTokenHash(paymentTokenHash),
    ).resolves.toBe(expected);

    const query = new PgDialect().sqlToQuery(whereCondition);
    expect(query.sql).toBe('"transactions"."payment_token_hash" = $1');
    expect(query.params).toEqual([paymentTokenHash]);
  });

  test("looks up a payment attempt by the full transaction/share/idempotency key", async () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    const expected = { id: "attempt-id", transactionId: 41, shareIndex: 2 };
    let whereCondition: any;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereCondition = condition;
            return { limit: async () => [expected] };
          },
        }),
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;

    await expect(storage.getPaymentAttemptByTransactionShareKey(
      41,
      2,
      idempotencyKey,
    )).resolves.toBe(expected);

    const query = new PgDialect().sqlToQuery(whereCondition);
    expect(query.sql).toContain('"payment_attempts"."transaction_id" = $1');
    expect(query.sql).toContain('"payment_attempts"."share_index" = $2');
    expect(query.sql).toContain('"payment_attempts"."idempotency_key" = $3');
    expect(query.params).toEqual([41, 2, idempotencyKey]);
  });

  test("forwards only a server digest and strips raw-token runtime fields", async () => {
    let inserted: Record<string, unknown> | undefined;
    const fakeDb = {
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          inserted = value;
          return { returning: async () => [{ id: 1, ...value }] };
        },
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;

    await storage.createTransaction({
      ...transactionInput({ paymentTokenHash: "a".repeat(64) }),
      rawToken: "must-not-be-stored",
      paymentToken: "must-not-be-stored",
      token: "must-not-be-stored",
    } as unknown as TransactionStorageInput);

    expect(inserted).toMatchObject({ paymentTokenHash: "a".repeat(64) });
    expect(inserted).not.toHaveProperty("rawToken");
    expect(inserted).not.toHaveProperty("paymentToken");
    expect(inserted).not.toHaveProperty("token");
  });

  test("locks before reading and inserts the first free active number", async () => {
    const calls: string[] = [];
    let inserted: Record<string, unknown> | undefined;
    const fakeTx = {
      execute: async () => {
        calls.push("lock");
      },
      select: () => ({
        from: () => ({
          where: async () => {
            calls.push("select");
            return [{ stoneNumber: 1 }, { stoneNumber: 3 }];
          },
        }),
      }),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          calls.push("insert");
          inserted = value;
          return {
            returning: async () => [{ id: 2, isActive: true, ...value }],
          };
        },
      }),
    };
    const fakeDb = {
      transaction: async (operation: (tx: typeof fakeTx) => Promise<unknown>) =>
        operation(fakeTx),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;

    const stone = await storage.createNextTaptStone(4);

    expect(calls).toEqual(["lock", "select", "insert"]);
    expect(inserted).toEqual({ merchantId: 4, stoneNumber: 2, name: "Stone 2" });
    expect(stone).toMatchObject({ merchantId: 4, stoneNumber: 2 });
  });

  test("translates the future active-number unique violation", async () => {
    const uniqueError = Object.assign(new Error("duplicate"), { code: "23505" });
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = {
      transaction: async () => {
        throw uniqueError;
      },
    };

    await expect(storage.createNextTaptStone(1)).rejects.toBeInstanceOf(
      TaptStoneConflictError,
    );
  });

  test("atomically reacquires only failed or lease-expired push claims", async () => {
    let inserted: Record<string, unknown> | undefined;
    let conflict: any;
    const fakeDb = {
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          inserted = value;
          return {
            onConflictDoUpdate: (config: unknown) => {
              conflict = config;
              return {
                returning: async () => [{ claimToken: value.claimToken }],
              };
            },
          };
        },
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;
    const now = new Date("2026-08-06T12:00:00.000Z");

    const token = await storage.claimPushNotificationDelivery(
      7, "daily_payout_summary", "2026-08-05", now,
    );

    expect(token).toEqual(expect.any(String));
    expect(inserted).toMatchObject({
      merchantId: 7,
      eventType: "daily_payout_summary",
      eventKey: "2026-08-05",
      status: "claimed",
      claimedAt: now,
      claimToken: token,
    });
    expect(conflict.set).toMatchObject({
      status: "claimed",
      claimedAt: now,
      completedAt: null,
      claimToken: token,
    });
    const setWhere = new PgDialect().sqlToQuery(conflict.setWhere);
    expect(setWhere.sql).toContain('"push_notification_deliveries"."status" = $1');
    expect(setWhere.sql).toContain('"push_notification_deliveries"."claimed_at" <= $3');
    expect(setWhere.params).toEqual([
      "failed",
      "claimed",
      new Date(now.getTime() - PUSH_NOTIFICATION_DELIVERY_LEASE_MS).toISOString(),
    ]);
  });

  test("fences delivery completion by the current claim token", async () => {
    let whereCondition: any;
    const fakeDb = {
      update: () => ({
        set: () => ({
          where: async (condition: unknown) => {
            whereCondition = condition;
          },
        }),
      }),
    };
    const storage = new DatabaseStorage();
    (storage as unknown as { db: unknown }).db = fakeDb;

    await storage.completePushNotificationDelivery(
      7,
      "daily_payout_summary",
      "2026-08-05",
      "11111111-1111-4111-8111-111111111111",
      "processed",
    );

    const query = new PgDialect().sqlToQuery(whereCondition);
    expect(query.sql).toContain('"push_notification_deliveries"."claim_token" = $4');
    expect(query.params).toEqual([
      7,
      "daily_payout_summary",
      "2026-08-05",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });
});
