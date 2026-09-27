import "./support/test-env";

jest.mock("../email-service", () => ({
  ...jest.requireActual("../email-service"),
  sendEmail: jest.fn(async () => true),
}));

import request from "supertest";
import * as emailService from "../email-service";
import { ROUTE_POLICY } from "../route-policy";
import {
  VALID_PASSWORD, bearer, createAdminPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
  storageSnapshot,
} from "./support/http-harness";

const sendEmailMock = emailService.sendEmail as unknown as jest.Mock;

/**
 * C10 route review, batch 6 (the business's own routes), 2026-09-27.
 */
beforeEach(() => {
  resetTestStorage();
  sendEmailMock.mockClear();
});

const DETAILS = {
  director: "Dee Rector",
  nzbn: "9429041234567",
  gstNumber: "123-456-789",
  websiteUrl: "https://deerector.co.nz",
  estimatedAnnualTurnover: "$50k–$150k",
  businessDescription: "Coffee cart at the Saturday market",
};

/**
 * The onboarding page (client/src/pages/merchant-onboarding.tsx) collects six details "for KYC, AML,
 * and payment processing purposes". The route read them without a schema and stored three: the
 * website, turnover and description only reached the admin's email.
 */
describe("onboarding keeps what it is sent, held to sign-up's rules", () => {
  it("stores all six details", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post(`/api/merchants/${owner.merchantId}/onboarding`).set(bearer(owner)).send(DETAILS);

    expect(res.status).toBe(200);
    expect(await storage.getMerchant(owner.merchantId)).toMatchObject({ ...DETAILS, onboardingCompleted: true });
  });

  it("stores empty optional details as none", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post(`/api/merchants/${owner.merchantId}/onboarding`).set(bearer(owner))
      .send({ director: "Dee Rector", nzbn: "", gstNumber: "", websiteUrl: "", estimatedAnnualTurnover: "", businessDescription: "" });

    expect(res.status).toBe(200);
    expect(await storage.getMerchant(owner.merchantId)).toMatchObject({
      director: "Dee Rector", nzbn: null, gstNumber: null, websiteUrl: null, estimatedAnnualTurnover: null,
      businessDescription: null, onboardingCompleted: true,
    });
  });

  it.each([
    ["no director", { ...DETAILS, director: "" }],
    ["a website that is not an address", { ...DETAILS, websiteUrl: "not a website" }],
    ["a turnover that is not one of the ranges", { ...DETAILS, estimatedAnnualTurnover: "loads" }],
    ["an NZBN over 20 characters", { ...DETAILS, nzbn: "1".repeat(21) }],
    ["a description over 500 characters", { ...DETAILS, businessDescription: "x".repeat(501) }],
    ["a director that is not text", { ...DETAILS, director: 42 }],
    ["a field the page never sends", { ...DETAILS, status: "active" }],
  ])("refuses %s, and changes and sends nothing", async (_what, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).post(`/api/merchants/${owner.merchantId}/onboarding`).set(bearer(owner)).send(body);

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(storageSnapshot()).toBe(before);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

/** Creating a board caps its name at 60 characters; renaming one took any length. */
describe("renaming a board is held to the name rule creating one uses", () => {
  it("refuses a name over 60 characters, and keeps the old one", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await request(app).post(`/api/merchants/${owner.merchantId}/tapt-stones`).set(bearer(owner)).send({ name: "Front till" });

    const res = await request(app).put(`/api/merchants/${owner.merchantId}/tapt-stones/${board.body.id}`).set(bearer(owner))
      .send({ name: "x".repeat(61) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Board name must be 60 characters or fewer" });
    expect(await storage.getTaptStone(board.body.id)).toMatchObject({ name: "Front till" });
  });

  it("still takes a 60-character name", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await request(app).post(`/api/merchants/${owner.merchantId}/tapt-stones`).set(bearer(owner)).send({});

    const res = await request(app).put(`/api/merchants/${owner.merchantId}/tapt-stones/${board.body.id}`).set(bearer(owner))
      .send({ name: "y".repeat(60) });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("y".repeat(60));
  });
});

/**
 * Owner decision 2026-09-27 (docs/decisions/2026-09-27-c10-batch-6a-owner-answers.md, answer 1):
 * three settings routes no screen calls are removed. Rates and bank account answered 410 to
 * everyone; the business-type switch let any login of the business, a teammate included, move it
 * between retail and property.
 */
describe("the unused settings routes are removed", () => {
  const RETIRED: Array<[string, string, Record<string, unknown>]> = [
    ["PUT /api/merchants/:id/rates", "/api/merchants/{business}/rates", { currentProviderRate: "0.02" }],
    ["PUT /api/merchants/:id/bank-account", "/api/merchants/{business}/bank-account", { bankName: "Harness Bank" }],
    ["PUT /api/merchants/:merchantId/sector", "/api/merchants/{business}/sector", { sector: "propertyManagement" }],
  ];

  it.each(RETIRED)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(RETIRED)("%s answers a teammate and the owner as an unknown address, and changes nothing", async (_key, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const before = storageSnapshot();

    for (const who of [member, owner]) {
      const res = await request(app).put(address.replace("{business}", String(owner.merchantId))).set(bearer(who)).send(body);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).not.toMatch(/json/);
    }
    expect(storageSnapshot()).toBe(before);
  });

  it("the owner still updates the business's details on the same address family", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).put(`/api/merchants/${owner.merchantId}/details`).set(bearer(owner))
      .send({ businessName: "Still Here Ltd", contactEmail: "still@harness.test", contactPhone: "021 000", businessAddress: "1 Road" });

    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe("Still Here Ltd");
  });
});

/**
 * Change-password changes the caller's own login. The platform admin has none: it passed the
 * business check and then stopped at 401 for want of a login id. It is refused as such, as
 * sign-out everywhere refuses it.
 */
describe("change-password is for a TaptPay login", () => {
  it("refuses the platform admin (403), and changes nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(bearer(createAdminPrincipal()))
      .send({ currentPassword: VALID_PASSWORD, newPassword: "NewHarness456!", confirmPassword: "NewHarness456!" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Only a TaptPay login can do this." });
    expect(storageSnapshot()).toBe(before);
  });
});

/** Guards: who may manage the business's stock, before and after it uses checkMerchantOwnership. */
describe("stock belongs to the business's logins and the platform admin", () => {
  const seed = async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const other = await createOwnerPrincipal();
    const item = await request(app).post(`/api/merchants/${owner.merchantId}/stock-items`).set(bearer(owner)).send({ name: "Seed", cost: "1.00" });
    return { app, owner, member, other, itemId: item.body.id as number };
  };

  it("another business's owner is refused on every stock route, and nothing changes", async () => {
    const { app, owner, other, itemId } = await seed();
    const before = storageSnapshot();
    const base = `/api/merchants/${owner.merchantId}/stock-items`;

    expect((await request(app).get(base).set(bearer(other))).status).toBe(403);
    expect((await request(app).post(base).set(bearer(other)).send({ name: "Theirs", cost: "2.00" })).status).toBe(403);
    expect((await request(app).put(`${base}/${itemId}`).set(bearer(other)).send({ name: "Theirs", cost: "2.00" })).status).toBe(403);
    expect((await request(app).delete(`${base}/${itemId}`).set(bearer(other))).status).toBe(403);
    expect(storageSnapshot()).toBe(before);
  });

  it("a teammate and the platform admin manage it", async () => {
    const { app, owner, member, itemId } = await seed();
    const base = `/api/merchants/${owner.merchantId}/stock-items`;

    expect((await request(app).get(base).set(bearer(member))).status).toBe(200);
    expect((await request(app).put(`${base}/${itemId}`).set(bearer(member)).send({ name: "Renamed", cost: "3.00" })).status).toBe(200);
    expect((await request(app).get(base).set(bearer(createAdminPrincipal()))).status).toBe(200);
    expect((await request(app).delete(`${base}/${itemId}`).set(bearer(createAdminPrincipal()))).status).toBe(200);
  });
});
