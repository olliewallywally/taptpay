import "./support/test-env";

import request from "supertest";
import { ROUTE_POLICY } from "../route-policy";
import crypto from "crypto";
import { signedIn, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 4):
 * routes that no screen or app calls are removed rather than kept "public by design". A removed
 * route is registered nowhere, so the app answers it as it answers any unknown address (the
 * harness has no page fallback: Express's own 404), and nothing is read or written.
 */
const UNUSED_PUBLIC_LOOKUPS: Array<[string, string]> = [
  // The whole board row by its sequential number: counting listed every board of every business.
  ["GET /api/tapt-stones/:id", "/api/tapt-stones/{board}"],
  // Whether payments are on, the provider's endpoint and the names of the settings behind them.
  ["GET /api/windcave/status", "/api/windcave/status"],
  // A User-Agent guess and the platform's provider account id; its wallet routes are retired.
  ["GET /api/payments/digital-wallet/config", "/api/payments/digital-wallet/config"],
];

beforeEach(() => {
  resetTestStorage();
});

describe("the three unused public look-ups are removed (batch 3c)", () => {
  it.each(UNUSED_PUBLIC_LOOKUPS)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(UNUSED_PUBLIC_LOOKUPS)("%s answers as an unknown address and reads nothing", async (_key, address) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await request(app).post(`/api/merchants/${owner.merchantId}/tapt-stones`).set(signedIn(owner)).send({});
    expect(board.status).toBe(200);
    const before = storageSnapshot();

    const res = await request(app).get(address.replace("{board}", String(board.body.id)));

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("the unused sign-up and invoice routes, and the old business-details page's, are removed (batches 3a, 3b)", () => {
  // [route, method, address, body]; {business} is a real business, {token} a waiting application's link.
  const REMOVED: Array<[string, "get" | "post" | "put", string, Record<string, unknown> | undefined]> = [
    // Confirmed an application with its emailed link and a password of the caller's choosing.
    ["POST /api/merchants/verify", "post", "/api/merchants/verify", { token: "{token}", password: "Password1" }],
    // Paid a checkout invoice; no page used it (the page uses /api/checkout/:token/session).
    ["POST /api/checkout/pay", "post", "/api/checkout/pay", { token: "anything", paymentMethod: "card" }],
    // Told anyone which business numbers exist and which confirmed their email.
    ["GET /api/merchants/:id/email-status", "get", "/api/merchants/{business}/email-status", undefined],
    // The old /business-details page's save; nothing else calls it.
    ["PUT /api/merchants/:id/business-details", "put", "/api/merchants/{business}/business-details",
      { businessName: "Changed Ltd", director: "Someone Else", contactEmail: "else@harness.test", contactPhone: "021 000 0000", businessAddress: "9 Else Street", nzbn: "", gstNumber: "" }],
  ];

  it.each(REMOVED)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(REMOVED)("%s answers as an unknown address and changes nothing", async (_key, method, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = crypto.randomBytes(32).toString("hex");
    const waiting = await storage.createMerchantWithSignup({
      name: "Waiting Owner", businessName: "Waiting Ltd", businessType: "retail",
      email: `waiting.${crypto.randomBytes(4).toString("hex")}@harness.test`,
      phone: "021 555 0100", address: "1 Waiting Street, Auckland", verificationToken: token,
    } as any);
    const fill = (text: string) => text.replace("{business}", String(waiting.id)).replace("{token}", token);
    const before = storageSnapshot();

    let pending = request(app)[method](fill(address)).set(signedIn(owner));
    if (body) pending = pending.send(JSON.parse(fill(JSON.stringify(body))));
    const res = await pending;

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("the public business read by number is retired (batch 3c)", () => {
  // Counting through business numbers listed every business, unconfirmed sign-ups included:
  // name, address, phone, GST number and NZBN. Customer pages now get these with their sale
  // (business-details-with-sale.test.ts).
  it("is registered nowhere", () => {
    expect(ROUTE_POLICY["GET /api/merchants/:id"]).toBeUndefined();
  });

  it("answers as an unknown address and reads nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).get(`/api/merchants/${owner.merchantId}`);

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(storageSnapshot()).toBe(before);
  });
});
