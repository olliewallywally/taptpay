import "./support/test-env";

jest.mock("../email-service", () => ({
  ...jest.requireActual("../email-service"),
  sendEmail: jest.fn(async () => true),
}));

import request from "supertest";
import * as emailService from "../email-service";
import { ROUTE_POLICY } from "../route-policy";
import {
  signedIn, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storageSnapshot,
} from "./support/http-harness";

const sendEmailMock = emailService.sendEmail as unknown as jest.Mock;

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-4-owner-answers.md, answers
 * 1–3): the platform admin's routes that no screen calls are removed, with the admin sign-up and
 * the test email. Activate and the email status stay. A removed route is registered nowhere, so
 * the app answers it as it answers any unknown address (the harness has no page fallback:
 * Express's own 404), and nothing is read, written or sent, even for the platform admin.
 */
type Method = "get" | "post" | "put" | "delete";
// [route, method, address, body]; {business} is a real business.
const RETIRED: Array<[string, Method, string, Record<string, unknown> | undefined]> = [
  // Answer 1. A stub answering 410, pointing to the admin sign-up.
  ["POST /api/admin/merchants", "post", "/api/admin/merchants", { name: "Stub Ltd" }],
  // Answer 1. A stub answering 410: it tested the retired business-wide no-board link.
  ["POST /api/merchants/:id/test-payment-link", "post", "/api/merchants/{business}/test-payment-link", {}],
  // Answer 1. The ecommerce API's administration was never built: five stubs answering 404.
  ["GET /api/admin/api-keys", "get", "/api/admin/api-keys", undefined],
  ["POST /api/admin/api-keys", "post", "/api/admin/api-keys", { keyName: "Synthetic key", environment: "sandbox" }],
  ["POST /api/admin/api-keys/:keyId/revoke", "post", "/api/admin/api-keys/1/revoke", undefined],
  ["GET /api/admin/api-metrics", "get", "/api/admin/api-metrics", undefined],
  ["GET /api/admin/api-usage", "get", "/api/admin/api-usage", undefined],
  // Answer 1. The overview gets the same figures from GET /api/admin/analytics.
  ["GET /api/admin/subscription-revenue", "get", "/api/admin/subscription-revenue", undefined],
  // Answer 1. Edited a business's contact details, with no body schema.
  ["PUT /api/admin/merchants/:id", "put", "/api/admin/merchants/{business}", { businessName: "Changed Ltd" }],
  // Answer 1. Deleted a business and its sales (the database refused any real business).
  ["DELETE /api/admin/merchants/:id", "delete", "/api/admin/merchants/{business}", undefined],
  // Answer 1. A debugging leftover: three addresses written in, deleted from memory only.
  ["POST /api/admin/clear-merchants", "post", "/api/admin/clear-merchants", undefined],
  // Answer 2. Made a business with a password the admin chose.
  ["POST /api/admin/merchants/signup", "post", "/api/admin/merchants/signup", {
    name: "Made Owner", businessName: "Made Ltd", businessType: "retail", email: "made@harness.test",
    phone: "021 555 0100", address: "1 Made Street, Auckland", password: "Password1!", confirmPassword: "Password1!",
  }],
  // Answer 3. Sent the admin a test email; a failure answered with the provider's error.
  ["POST /api/admin/test-email", "post", "/api/admin/test-email", undefined],
];

// Kept by the same answers, and the removed routes' neighbours on the same addresses.
const KEPT = [
  "POST /api/admin/merchants/:id/activate",
  "GET /api/admin/email-status",
  "GET /api/admin/merchants",
  "GET /api/admin/merchants/:id",
  "GET /api/admin/analytics",
];

beforeEach(() => {
  resetTestStorage();
  sendEmailMock.mockClear();
});

describe("the admin routes no screen calls are removed (batch 4)", () => {
  it.each(RETIRED)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(RETIRED)("%s answers the platform admin as an unknown address and changes nothing", async (_key, method, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const admin = await createAdminPrincipal();
    const before = storageSnapshot();

    let pending = request(app)[method](address.replace("{business}", String(owner.merchantId))).set(signedIn(admin));
    if (body) pending = pending.send(body);
    const res = await pending;

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(storageSnapshot()).toBe(before);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it.each(KEPT)("%s is still registered", (key) => {
    expect(ROUTE_POLICY[key]).toBeDefined();
  });

  it("the admin still reads one business, on the address the edit and delete shared", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).get(`/api/admin/merchants/${owner.merchantId}`).set(signedIn(await createAdminPrincipal()));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(owner.merchantId);
  });
});
