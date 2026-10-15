import "./support/test-env";

import request from "supertest";
import { createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, type Principal } from "./support/http-harness";
import { observeRefusalEffects } from "./support/refusal-effects";

beforeEach(() => resetTestStorage());

/** The six signed-in routes that change a business's settings: the purpose each must name, and its columns. */
const ROUTES = [
  {
    key: "POST /api/merchants/:id/onboarding", kind: "onboarding", method: "post", byPath: true, strict: true, who: "owner",
    path: (id: number) => `/api/merchants/${id}/onboarding`,
    body: { director: "Dee Rector", nzbn: "9429041234567", gstNumber: "123-456-789", websiteUrl: "https://settings.example", estimatedAnnualTurnover: "$50k–$150k", businessDescription: "Coffee cart" },
    written: { director: "Dee Rector", nzbn: "9429041234567", gstNumber: "123-456-789", websiteUrl: "https://settings.example", estimatedAnnualTurnover: "$50k–$150k", businessDescription: "Coffee cart", onboardingCompleted: true },
  },
  {
    key: "PUT /api/merchants/:id/daily-goal", kind: "daily-goal", method: "put", byPath: true, strict: false, who: "owner",
    path: (id: number) => `/api/merchants/${id}/daily-goal`,
    body: { dailyGoal: "750.00" }, written: { dailyGoal: "750.00" },
  },
  {
    key: "PUT /api/merchants/:id", kind: "profile", method: "put", byPath: true, strict: true, who: "owner",
    path: (id: number) => `/api/merchants/${id}`,
    body: { businessName: "Renamed Ltd", director: "Dee Rector", address: "1 New Street", nzbn: "9429", phone: "021 000 111", gstNumber: "111-222-333", contactEmail: "renamed@settings.test", contactPhone: "022 000 111", businessAddress: "2 New Street" },
    written: { businessName: "Renamed Ltd", director: "Dee Rector", address: "1 New Street", nzbn: "9429", phone: "021 000 111", gstNumber: "111-222-333", contactEmail: "renamed@settings.test", contactPhone: "022 000 111", businessAddress: "2 New Street" },
  },
  {
    key: "PUT /api/property/reminder-settings", kind: "rent-reminders", method: "put", byPath: false, strict: false, who: "member",
    path: () => "/api/property/reminder-settings",
    body: { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 0 },
    written: { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 0 },
  },
  {
    key: "PUT /api/trades/reminder-settings", kind: "trade-reminders", method: "put", byPath: false, strict: false, who: "member",
    path: () => "/api/trades/reminder-settings",
    body: { tradeRemindersEnabled: false }, written: { tradeRemindersEnabled: false },
  },
  {
    key: "PUT /api/trades/gst-settings", kind: "trade-gst", method: "put", byPath: false, strict: false, who: "owner",
    path: () => "/api/trades/gst-settings",
    body: { gstRegistered: true, tradeGstMode: "exclusive" }, written: { gstRegistered: true, tradeGstMode: "exclusive" },
  },
] as const;

/** What no settings route may write, and every other route's columns. */
const NEVER = {
  id: 999, merchantId: 999, email: "stolen@settings.test", status: "suspended", passwordHash: "hash", googleId: "google",
  windcaveApiKey: "key", windcaveMerchantId: "wm", themeId: "other", customLogoUrl: "/uploads/logos/merchant-999.png",
  billingCardLast4: "0000", resetToken: "reset", tutorialGeneration: 9,
};
function strays(route: (typeof ROUTES)[number]) {
  const others: Record<string, unknown> = {};
  for (const other of ROUTES) for (const [key, value] of Object.entries(other.written)) if (!(key in route.written)) others[key] = value;
  return { ...NEVER, ...others };
}

async function seed() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const member = await createMemberPrincipal(owner.merchantId);
  const other = await createOwnerPrincipal();
  return { app, owner, member, other };
}
const row = async (who: Principal) => JSON.stringify(await storage.getMerchant(who.merchantId));
const send = (app: any, route: (typeof ROUTES)[number], who: Principal, merchantId: number, body: object) =>
  (request(app) as any)[route.method](route.path(merchantId)).set(signedIn(who)).send(body);

describe.each(ROUTES)("R1-T7 S5a — $key", (route) => {
  test("writes by its own purpose to the caller's business, never through the general update", async () => {
    const ctx = await seed();
    const who = ctx[route.who];
    const otherBefore = await row(ctx.other);
    const settings = jest.spyOn(storage as any, "updateMerchantSettings");
    const general = jest.spyOn(storage, "updateMerchant");
    const res = await send(ctx.app, route, who, ctx.owner.merchantId, route.body);
    expect(res.status).toBe(200);
    expect(settings.mock.calls.map(([merchantId, change]: any[]) => [merchantId, change.kind])).toEqual([[ctx.owner.merchantId, route.kind]]);
    expect(general).not.toHaveBeenCalled();
    expect(await storage.getMerchant(ctx.owner.merchantId)).toMatchObject(route.written);
    expect(await row(ctx.other)).toBe(otherBefore);
  });

  test("stray fields in the body reach no column", async () => {
    const ctx = await seed();
    const who = ctx[route.who];
    const before = (await storage.getMerchant(ctx.owner.merchantId))!;
    const planted = strays(route);
    const res = await send(ctx.app, route, who, ctx.owner.merchantId, { ...planted, ...route.body });
    // A strict schema refuses the body outright; the others drop what they do not know.
    expect(res.status).toBe(route.strict ? 400 : 200);
    const after = (await storage.getMerchant(ctx.owner.merchantId))! as any;
    for (const key of Object.keys(planted)) expect([key, after[key]]).toEqual([key, (before as any)[key]]);
    if (route.strict) expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    else expect(after).toMatchObject(route.written);
  });
});

describe("R1-T7 S5a — the business named is the caller's", () => {
  test.each(ROUTES.filter((route) => route.byPath))("$key refuses another business's path and changes neither", async (route) => {
    const ctx = await seed();
    const mine = await row(ctx.owner);
    const theirs = await row(ctx.other);
    const effects = observeRefusalEffects();
    try {
      const res = await send(ctx.app, route, ctx.owner, ctx.other.merchantId, route.body);
      expect(res.status).toBe(403);
      expect(await row(ctx.owner)).toBe(mine);
      expect(await row(ctx.other)).toBe(theirs);
      effects.assertNone();
    } finally { effects.restore(); }
  });

  test.each(ROUTES.filter((route) => !route.byPath))("$key takes the business from the sign-in, whatever the body names", async (route) => {
    const ctx = await seed();
    const theirs = await row(ctx.other);
    const who = ctx[route.who];
    const res = await send(ctx.app, route, who, ctx.owner.merchantId, { ...route.body, merchantId: ctx.other.merchantId, id: ctx.other.merchantId });
    expect(res.status).toBe(200);
    expect(await storage.getMerchant(ctx.owner.merchantId)).toMatchObject(route.written);
    expect(await row(ctx.other)).toBe(theirs);
  });

  test("a teammate's reminder switches cannot reach the owner's GST setting", async () => {
    const ctx = await seed();
    const refused = await request(ctx.app).put("/api/trades/gst-settings").set(signedIn(ctx.member)).send({ gstRegistered: true });
    expect(refused.status).toBe(403);
    for (const path of ["/api/property/reminder-settings", "/api/trades/reminder-settings"]) {
      const res = await request(ctx.app).put(path).set(signedIn(ctx.member))
        .send({ tradeRemindersEnabled: false, rentReminderEnabled: false, gstRegistered: true, tradeGstMode: "exclusive" });
      expect(res.status).toBe(200);
    }
    expect(await storage.getMerchant(ctx.owner.merchantId)).toMatchObject({ gstRegistered: false, tradeGstMode: "inclusive", rentReminderEnabled: false, tradeRemindersEnabled: false });
  });
});
