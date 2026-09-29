import "./support/test-env";

import http from "http";
import request from "supertest";
import * as database from "../database";
import * as push from "../push";
import { sseBroker } from "../sse-broker";
import { ROUTE_POLICY } from "../route-policy";
import { createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";

/**
 * R1-T2 (C10): "an ALL policy expands into tests for every method the handler
 * can receive". Express's app.all() registers the handler for every method in
 * Node's http.METHODS (the list Express itself is built from). Node never
 * hands CONNECT to Express — without a 'connect' listener it drops the socket
 * — so every other method is one these handlers can receive.
 */
const RECEIVABLE_METHODS = http.METHODS.filter((method) => method !== "CONNECT").map((method) =>
  method.toLowerCase(),
);

const ALL_ROUTES = Object.values(ROUTE_POLICY)
  .filter((entry) => entry.method === "ALL")
  .sort((a, b) => a.path.localeCompare(b.path));

/**
 * The provider callbacks' policy, for every method: acknowledge at once with
 * 200 "OK" (so the provider stops retrying), and treat the call only as a nudge
 * to re-query the provider about a session this server created — so a session
 * it does not know changes nothing and calls nothing.
 */
function withUnknownSession(routePath: string): string {
  return `${routePath.replace(":state", "unknown-return-state")}?sessionid=unknown-provider-session`;
}

/** The handlers answer first and look the session up after; let that finish before comparing. */
function afterTheHandlerFinishes(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

describe("R1-T2 — an ALL registration, expanded to every method it can receive (C10)", () => {
  it("is the five provider callbacks", () => {
    expect(ALL_ROUTES.map((entry) => entry.path)).toEqual([
      "/api/billing/card/notification",
      "/api/pay/notification/:state",
      "/api/windcave/notification",
      "/api/windcave/rent-notification",
      "/api/windcave/trades-notification",
    ]);
    expect(ALL_ROUTES.every((entry) => entry.principal === "provider-webhook")).toBe(true);
  });

  it("covers the standard methods and the unusual ones alike", () => {
    expect(RECEIVABLE_METHODS).toEqual(
      expect.arrayContaining(["get", "head", "post", "put", "patch", "delete", "options", "trace", "propfind"]),
    );
    expect(RECEIVABLE_METHODS).not.toContain("connect");
  });

  describe.each(ALL_ROUTES.map((entry) => [entry.path] as const))("%s", (routePath) => {
    beforeEach(() => {
      resetTestStorage();
      jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("Unexpected outbound call from a provider callback with an unknown session");
      });
      jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
      jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({
        eligibleSubscriptions: 0,
        attempted: 0,
        delivered: 0,
        failed: 0,
      });
      // MemStorage's event log is a no-op, invisible to the snapshot.
      jest.spyOn(storage, "logTransactionEvent");
      jest.spyOn(database, "getDb");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test.each(RECEIVABLE_METHODS)("%s is answered by the handler and changes nothing", async (method) => {
      const { app } = await createTestApp();
      const before = storageSnapshot();

      const response = await (request(app) as any)[method](withUnknownSession(routePath));
      await afterTheHandlerFinishes();

      expect(response.status).toBe(200);
      // HEAD carries no body; every other method gets the handler's own "OK",
      // not the router's 404 page or an error.
      if (method !== "head") expect(response.text).toBe("OK");
      expect(storageSnapshot()).toBe(before);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(sseBroker.broadcast).not.toHaveBeenCalled();
      expect(push.sendPushToMerchant).not.toHaveBeenCalled();
      expect(storage.logTransactionEvent).not.toHaveBeenCalled();
      expect(database.getDb).not.toHaveBeenCalled();
    });
  });
});
