import "./support/test-env";
import net from "node:net";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sseBroker } from "../sse-broker";
import { DatabaseStorage } from "../storage";
import {
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  bearer,
} from "./support/http-harness";

/**
 * Gap 12 Option C — fail closed on concurrent-stoneless-sale ambiguity.
 *
 * docs/decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md,
 * "Option C — Keep merchant-wide, but fail closed on ambiguity and narrow
 * the payload", §3.3 "The concurrency case is a correctness defect, not
 * only a leak".
 *
 * THE DEFECT (pre-fix): for the unauthenticated "legacy-no-board" scope
 * only, getActiveTransactionByMerchant orders by createdAt desc and takes
 * the single newest pending/processing stoneless transaction. If a merchant
 * has TWO such transactions open at once, every anonymous customer polling
 * or subscribed gets routed onto the NEWEST one — including a customer
 * already correctly shown the OTHER one. customer-payment.tsx redirects to
 * /checkout/:id whenever the transaction id it's watching changes, so
 * customer A can be redirected onto customer B's checkout and pay customer
 * B's amount.
 */
describe("R1-T2 gap 12 Option C — legacy-no-board ambiguity fails closed", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  async function stonelessPendingTransaction(merchantId: number, overrides: Record<string, unknown> = {}) {
    return storage.createTransaction({
      merchantId,
      itemName: "Ambiguity fixture",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
      ...overrides,
    } as any);
  }

  /** Raw bytes off the socket — matches r1-t2-gap12-events-ratelimit.test.ts's helper. */
  function collectRaw(port: number, path: string, waitMs = 500): Promise<string> {
    return new Promise((resolve, reject) => {
      let raw = "";
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
        );
      });
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        raw += chunk;
      });
      socket.on("error", reject);
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(raw);
      }, waitMs);
      socket.on("close", () => {
        clearTimeout(timer);
        resolve(raw);
      });
    });
  }

  function framesFromRaw(raw: string): any[] {
    return raw
      .split("\n\n")
      .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data:")))
      .filter((line): line is string => !!line)
      .map((line) => JSON.parse(line.slice(5).trimStart()));
  }

  describe("storage: getLegacyNoBoardActiveTransactionOrAmbiguous (MemStorage)", () => {
    test("0 candidates -> none, 1 -> found, 2+ -> ambiguous", async () => {
      const { merchantId } = await createOwnerPrincipal();

      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
        .resolves.toEqual({ kind: "none" });

      const only = await stonelessPendingTransaction(merchantId);
      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
        .resolves.toMatchObject({ kind: "found", transaction: { id: only.id } });

      const second = await stonelessPendingTransaction(merchantId);
      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
        .resolves.toEqual({ kind: "ambiguous" });

      // Board-scoped and per-payment transactions must not count toward
      // ambiguity — the legacy-no-board scope excludes both.
      await storage.createTransaction({
        merchantId,
        itemName: "Board sale",
        price: "5.00",
        status: "pending",
        paymentMethod: "qr_code",
        splitEnabled: false,
        taptStoneId: (await storage.createNextTaptStone(merchantId)).id,
      } as any);
      await storage.createTransaction({
        merchantId,
        itemName: "Per-payment sale",
        price: "5.00",
        status: "pending",
        paymentMethod: "qr_code",
        splitEnabled: false,
        paymentTokenHash: "a".repeat(64),
      } as any);
      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
        .resolves.toEqual({ kind: "ambiguous" }); // still exactly the same 2, unchanged

      await storage.updateTransactionStatus(second.id, "failed");
      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
        .resolves.toMatchObject({ kind: "found", transaction: { id: only.id } });
    });

    test("falls back to the completed-within-3-minutes bucket only when the pending bucket is empty, with the same ambiguity rule", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
      try {
        const { merchantId } = await createOwnerPrincipal();
        const a = await stonelessPendingTransaction(merchantId);
        const b = await stonelessPendingTransaction(merchantId);

        await storage.updateTransactionStatus(a.id, "completed");
        // Pending bucket still has b — completed bucket must not be consulted.
        await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
          .resolves.toMatchObject({ kind: "found", transaction: { id: b.id } });

        await storage.updateTransactionStatus(b.id, "completed");
        // Both now completed within the window -> ambiguous, not "pick the newest".
        await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
          .resolves.toEqual({ kind: "ambiguous" });

        jest.setSystemTime(new Date("2026-09-15T10:04:00.000Z")); // > 3 min later
        await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId))
          .resolves.toEqual({ kind: "none" });
      } finally {
        jest.useRealTimers();
      }
    });

    test("independent per merchant", async () => {
      const owner = await createOwnerPrincipal();
      const other = await createOwnerPrincipal();
      await stonelessPendingTransaction(owner.merchantId);
      await stonelessPendingTransaction(owner.merchantId);
      await stonelessPendingTransaction(other.merchantId);

      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(owner.merchantId))
        .resolves.toEqual({ kind: "ambiguous" });
      await expect(storage.getLegacyNoBoardActiveTransactionOrAmbiguous(other.merchantId))
        .resolves.toMatchObject({ kind: "found" });
    });
  });

  describe("storage: getLegacyNoBoardActiveTransactionOrAmbiguous (DatabaseStorage query shape)", () => {
    function fakeDbSequence(resultsQueue: unknown[][]) {
      const calls: { sql: string; params: unknown[]; limit: number }[] = [];
      const db = {
        select: () => ({
          from: () => ({
            where: (condition: unknown) => ({
              orderBy: () => ({
                limit: async (n: number) => {
                  const query = new PgDialect().sqlToQuery(condition as any);
                  calls.push({ sql: query.sql, params: query.params as unknown[], limit: n });
                  return resultsQueue.shift() ?? [];
                },
              }),
            }),
          }),
        }),
      };
      return { db, calls };
    }

    function withFakeDb(resultsQueue: unknown[][]) {
      const { db, calls } = fakeDbSequence(resultsQueue);
      const dbStorage = new DatabaseStorage();
      (dbStorage as unknown as { db: unknown }).db = db;
      return { dbStorage, calls };
    }

    test("fetches 2 (not 1) at each step, and both steps scope to null board and null payment token", async () => {
      const { dbStorage, calls } = withFakeDb([[{ id: 1 }, { id: 2 }]]);

      await expect(dbStorage.getLegacyNoBoardActiveTransactionOrAmbiguous(7))
        .resolves.toEqual({ kind: "ambiguous" });

      expect(calls).toHaveLength(1); // completed-bucket query never runs once 2+ pending found
      expect(calls[0].limit).toBe(2);
      expect(calls[0].sql).toContain('"transactions"."tapt_stone_id" is null');
      expect(calls[0].sql).toContain('"transactions"."payment_token_hash" is null');
      expect(calls[0].sql).toContain('"transactions"."status" in ($2, $3)');
    });

    test("exactly 1 pending row -> found, without ever querying the completed bucket", async () => {
      const expected = { id: 41, status: "pending" };
      const { dbStorage, calls } = withFakeDb([[expected]]);

      await expect(dbStorage.getLegacyNoBoardActiveTransactionOrAmbiguous(7))
        .resolves.toEqual({ kind: "found", transaction: expected });
      expect(calls).toHaveLength(1);
    });

    test("0 pending rows falls back to the completed bucket with the same limit(2) rule", async () => {
      const { dbStorage, calls } = withFakeDb([[], [{ id: 9 }, { id: 10 }]]);

      await expect(dbStorage.getLegacyNoBoardActiveTransactionOrAmbiguous(7))
        .resolves.toEqual({ kind: "ambiguous" });
      expect(calls).toHaveLength(2);
      expect(calls[1].limit).toBe(2);
      expect(calls[1].sql).toContain('"transactions"."status" = $2');
      expect(calls[1].sql).toContain('"transactions"."created_at" >=');
    });

    test("0 pending, 0 completed -> none", async () => {
      const { dbStorage } = withFakeDb([[], []]);
      await expect(dbStorage.getLegacyNoBoardActiveTransactionOrAmbiguous(7))
        .resolves.toEqual({ kind: "none" });
    });
  });

  describe("mandate #4 — the superseded path stays intact", () => {
    test("getActiveTransactionByMerchant({kind:'legacy-no-board'}) still silently prefers the newest (unchanged, pinning test)", async () => {
      const { merchantId } = await createOwnerPrincipal();
      const older = await stonelessPendingTransaction(merchantId);
      const newer = await stonelessPendingTransaction(merchantId);

      await expect(storage.getActiveTransactionByMerchant(merchantId, { kind: "legacy-no-board" }))
        .resolves.toMatchObject({ id: newer.id });
      // ...which is exactly why this branch is documented SUPERSEDED for
      // anonymous use and must never be reached for a new anonymous code
      // path again — the new method above is what routes.ts calls instead.
      void older;
    });
  });

  describe("REST: GET /api/merchants/:id/active-transaction", () => {
    test("2 concurrent pending stoneless transactions -> null body + ambiguous header, not a silently-chosen transaction", async () => {
      const { app } = await createTestApp();
      const { merchantId } = await createOwnerPrincipal();
      await stonelessPendingTransaction(merchantId);
      const second = await stonelessPendingTransaction(merchantId);

      const response = await request(app).get(`/api/merchants/${merchantId}/active-transaction`);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
      expect(response.headers["x-legacy-no-board-ambiguous"]).toBe("true");
      // Never the (wrong) newest transaction's data leaking through some
      // other field.
      expect(JSON.stringify(response.body)).not.toContain(String(second.id));
    });

    test("exactly 1 pending stoneless transaction -> resolves normally, no ambiguous header", async () => {
      const { app } = await createTestApp();
      const { merchantId } = await createOwnerPrincipal();
      const only = await stonelessPendingTransaction(merchantId);

      const response = await request(app).get(`/api/merchants/${merchantId}/active-transaction`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: only.id });
      expect(response.headers["x-legacy-no-board-ambiguous"]).toBeUndefined();
    });

    test("zero stoneless transactions -> byte-identical null body to the ambiguous case, no header", async () => {
      const { app } = await createTestApp();
      const { merchantId } = await createOwnerPrincipal();

      const response = await request(app).get(`/api/merchants/${merchantId}/active-transaction`);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
      expect(response.headers["x-legacy-no-board-ambiguous"]).toBeUndefined();
    });

    test("board branch (?stoneId=) is completely unaffected by a no-board ambiguity on the same merchant", async () => {
      const { app } = await createTestApp();
      const { merchantId } = await createOwnerPrincipal();
      // Two concurrent AMBIGUOUS no-board sales...
      await stonelessPendingTransaction(merchantId);
      await stonelessPendingTransaction(merchantId);
      // ...alongside one unambiguous board sale.
      const stone = await storage.createNextTaptStone(merchantId);
      const boardSale = await storage.createTransaction({
        merchantId,
        itemName: "Board sale",
        price: "20.00",
        status: "pending",
        paymentMethod: "qr_code",
        splitEnabled: false,
        taptStoneId: stone.id,
      } as any);

      const response = await request(app).get(
        `/api/merchants/${merchantId}/active-transaction?stoneId=${stone.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: boardSale.id });
      expect(response.headers["x-legacy-no-board-ambiguous"]).toBeUndefined();
    });
  });

  describe("SSE: GET /api/merchants/:id/events (legacy-no-board)", () => {
    test("2 concurrent pending stoneless transactions -> subscriber receives an ambiguous frame carrying no transaction data, not the raw second transaction", async () => {
      const { app, httpServer } = await createTestApp();
      const { merchantId, token } = await createOwnerPrincipal();
      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const port = (httpServer.address() as net.AddressInfo).port;

      try {
        await stonelessPendingTransaction(merchantId);
        const second = await stonelessPendingTransaction(merchantId);

        const rawPromise = collectRaw(port, `/api/merchants/${merchantId}/events`, 700);
        // Give the raw socket a moment to actually subscribe before firing
        // the broadcast that should reach it.
        await new Promise((resolve) => setTimeout(resolve, 100));

        await request(app)
          .patch(`/api/transactions/${second.id}/split-enabled`)
          .set(bearer({ token }))
          .send({ splitEnabled: true });

        const raw = await rawPromise;
        const frames = framesFromRaw(raw);
        const ambiguousFrame = frames.find((frame) => frame.type === "legacy_no_board_ambiguous");

        expect(ambiguousFrame).toBeDefined();
        expect(ambiguousFrame.addressingMode).toBe("legacy-no-board");
        expect(ambiguousFrame).not.toHaveProperty("transaction");
        expect(ambiguousFrame).not.toHaveProperty("transactionId");
        expect(raw).not.toContain("Ambiguity fixture");
        expect(raw).not.toMatch(/"id":\s*\d/); // no transaction id of either candidate leaks
        void second;
      } finally {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    });

    test("exactly 1 pending stoneless transaction -> subscriber still receives the real transaction_updated event (baseline unaffected)", async () => {
      const { app, httpServer } = await createTestApp();
      const { merchantId, token } = await createOwnerPrincipal();
      await new Promise<void>((resolve) => httpServer.listen(0, resolve));
      const port = (httpServer.address() as net.AddressInfo).port;

      try {
        const only = await stonelessPendingTransaction(merchantId);

        const rawPromise = collectRaw(port, `/api/merchants/${merchantId}/events`, 700);
        await new Promise((resolve) => setTimeout(resolve, 100));

        await request(app)
          .patch(`/api/transactions/${only.id}/split-enabled`)
          .set(bearer({ token }))
          .send({ splitEnabled: true });

        const raw = await rawPromise;
        const frames = framesFromRaw(raw);
        const updated = frames.find((frame) => frame.type === "transaction_updated");

        expect(updated).toBeDefined();
        expect(updated.addressingMode).toBe("legacy-no-board");
        expect(updated.transaction.id).toBe(only.id);
        expect(frames.find((frame) => frame.type === "legacy_no_board_ambiguous")).toBeUndefined();
      } finally {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    });
  });

  describe("mandatory fix #1 — merchant/board delivery stays synchronous while a legacy-no-board ambiguity check is in flight", () => {
    test("board and merchant subscribers receive their events immediately, unaffected by a same-merchant legacy-no-board check still pending", async () => {
      const { app } = await createTestApp();
      const { merchantId, token } = await createOwnerPrincipal();

      const stone = await storage.createNextTaptStone(merchantId);
      const boardSale = await storage.createTransaction({
        merchantId,
        itemName: "Board sale",
        price: "5.00",
        status: "pending",
        paymentMethod: "qr_code",
        splitEnabled: false,
        taptStoneId: stone.id,
      } as any);
      const stonelessSale = await stonelessPendingTransaction(merchantId);

      const merchantConn = { frames: [] as any[], write(chunk: string) { pushFrame(this.frames, chunk); }, end: () => {} };
      const boardConn = { frames: [] as any[], write(chunk: string) { pushFrame(this.frames, chunk); }, end: () => {} };
      const legacyConn = { frames: [] as any[], write(chunk: string) { pushFrame(this.frames, chunk); }, end: () => {} };
      function pushFrame(target: any[], chunk: string) {
        const data = chunk.match(/^data: (.+)\n\n$/)?.[1];
        if (data) target.push(JSON.parse(data));
      }

      // sseBroker is a module-level singleton shared by every test in this
      // file (routes.ts's dispatch logic talks to that exact instance, not
      // an injectable one), and resetTestStorage() resets the merchant-id
      // counter back to 1 every test — so these manual subscriptions MUST be
      // torn down, or a later test reusing the same numeric merchantId would
      // silently inherit stale subscribers left behind here.
      const unsubMerchant = sseBroker.subscribe(merchantId, { kind: "merchant", userId: 1, principal: "user" }, merchantConn);
      const unsubBoard = sseBroker.subscribe(merchantId, { kind: "board", stoneId: stone.id }, boardConn);
      const unsubLegacy = sseBroker.subscribe(merchantId, { kind: "legacy-no-board" }, legacyConn);
      merchantConn.frames.length = 0;
      boardConn.frames.length = 0;
      legacyConn.frames.length = 0;

      // Manually-controlled promise standing in for the ambiguity DB check —
      // it will not resolve until this test explicitly resolves it below.
      let releaseCheck!: () => void;
      const gate = new Promise<void>((resolve) => { releaseCheck = resolve; });
      const spy = jest.spyOn(storage, "getLegacyNoBoardActiveTransactionOrAmbiguous")
        .mockImplementation(async () => {
          await gate;
          return { kind: "found", transaction: stonelessSale };
        });

      try {
        // First call: stoneless (legacy-no-board-eligible) — merchant gets
        // it synchronously; the legacy-no-board leg is now blocked on `gate`.
        const stonelessResponse = await request(app)
          .patch(`/api/transactions/${stonelessSale.id}/split-enabled`)
          .set(bearer({ token }))
          .send({ splitEnabled: true });
        expect(stonelessResponse.status).toBe(200);

        expect(merchantConn.frames).toHaveLength(1);
        expect(merchantConn.frames[0].transaction.id).toBe(stonelessSale.id);
        expect(spy).toHaveBeenCalledTimes(1); // the check has started...
        expect(legacyConn.frames).toHaveLength(0); // ...but not resolved yet.

        // Second call, same merchant, board-scoped — must be delivered to
        // merchant + board immediately, with the first call's ambiguity
        // check still unresolved.
        const boardResponse = await request(app)
          .patch(`/api/transactions/${boardSale.id}/split-enabled`)
          .set(bearer({ token }))
          .send({ splitEnabled: true });
        expect(boardResponse.status).toBe(200);

        expect(merchantConn.frames).toHaveLength(2);
        expect(merchantConn.frames[1].transaction.id).toBe(boardSale.id);
        expect(boardConn.frames).toHaveLength(1);
        expect(boardConn.frames[0].transaction.id).toBe(boardSale.id);
        expect(boardConn.frames[0].addressingMode).toBe("board");
        // Still nothing on the legacy-no-board connection — proves the
        // second (board) delivery did not have to wait on the first call's
        // still-pending async leg, and did not accidentally resolve it.
        expect(legacyConn.frames).toHaveLength(0);
        expect(spy).toHaveBeenCalledTimes(1); // board-scoped data never triggers this check at all

        // Now let the first call's check resolve.
        releaseCheck();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(legacyConn.frames).toHaveLength(1);
        expect(legacyConn.frames[0].transaction.id).toBe(stonelessSale.id);
        // Merchant/board frame counts are unchanged by the check resolving.
        expect(merchantConn.frames).toHaveLength(2);
        expect(boardConn.frames).toHaveLength(1);
      } finally {
        spy.mockRestore();
        unsubMerchant();
        unsubBoard();
        unsubLegacy();
      }
    });
  });

  describe("mandatory fix #2 — audience-scoped short-circuit", () => {
    test("a stoneless broadcast triggers zero ambiguity DB checks when the merchant has zero legacy-no-board subscribers, even with a merchant-audience subscriber connected", async () => {
      const { app } = await createTestApp();
      const { merchantId, token } = await createOwnerPrincipal();
      const stonelessSale = await stonelessPendingTransaction(merchantId);

      const merchantConn = { frames: [] as any[], write(chunk: string) {
        const data = chunk.match(/^data: (.+)\n\n$/)?.[1];
        if (data) this.frames.push(JSON.parse(data));
      }, end: () => {} };
      const unsubMerchant = sseBroker.subscribe(merchantId, { kind: "merchant", userId: 1, principal: "user" }, merchantConn);
      merchantConn.frames.length = 0;

      const spy = jest.spyOn(storage, "getLegacyNoBoardActiveTransactionOrAmbiguous");

      try {
        expect(sseBroker.legacyNoBoardSubscriberCount(merchantId)).toBe(0);

        const response = await request(app)
          .patch(`/api/transactions/${stonelessSale.id}/split-enabled`)
          .set(bearer({ token }))
          .send({ splitEnabled: true });

        expect(response.status).toBe(200);
        expect(merchantConn.frames).toHaveLength(1); // merchant leg is fully independent
        expect(spy).not.toHaveBeenCalled(); // the audience-scoped short-circuit fired
      } finally {
        spy.mockRestore();
        unsubMerchant();
      }
    });

    test("legacyNoBoardSubscriberCount counts only legacy-no-board subscribers, not subscriberCount's audience-agnostic total", () => {
      const merchantConn = { write: () => {}, end: () => {} };
      const boardConn = { write: () => {}, end: () => {} };
      const legacyConn = { write: () => {}, end: () => {} };
      // A literal, out-of-range id (never produced by the auto-incrementing
      // in-memory merchant counter, which resetTestStorage() resets to 1
      // every test) so this test's unsubscribed-by-design subscriptions can
      // never collide with another test's merchantId in this file.
      const merchantId = 999_001;

      sseBroker.subscribe(merchantId, { kind: "merchant", userId: 1, principal: "user" }, merchantConn);
      sseBroker.subscribe(merchantId, { kind: "board", stoneId: 1 }, boardConn);
      sseBroker.subscribe(merchantId, { kind: "legacy-no-board" }, legacyConn);

      expect(sseBroker.subscriberCount(merchantId)).toBe(3);
      expect(sseBroker.legacyNoBoardSubscriberCount(merchantId)).toBe(1);
    });
  });
});
