import "./support/test-env";

import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

const INVALID_TENANTS = [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1];

/** Columns no settings purpose may write: identity, sign-in, status, credentials, rates, links, branding, billing, tutorial. */
const FORBIDDEN = {
  id: 999, name: "stolen", email: "stolen@settings.test", businessType: "other", status: "suspended",
  passwordHash: "hash", googleId: "google", verificationToken: "token", resetToken: "reset", resetTokenExpiry: new Date(0),
  windcaveApiKey: "key", windcaveMerchantId: "wm", qrCodeUrl: "/qr", paymentUrl: "/pay",
  currentProviderRate: "0.5000", ourRate: "0.5000", bankName: "bank", bankAccountNumber: "12-3456",
  customLogoUrl: "/uploads/logos/merchant-2.png", themeId: "other", emailVerified: true,
  billingCardLast4: "0000", billingCardBrand: "visa", billingCardExpiry: "0101",
  tutorialGeneration: 9, tutorialAutoEnabled: false, createdAt: new Date(0),
};

/** Each purpose, a request for it, and exactly the columns it may write. */
const PURPOSES = [
  {
    kind: "profile",
    change: { kind: "profile", changes: { businessName: "New Name", director: "Dee", address: "1 New St", nzbn: "9429", phone: "021", gstNumber: "123-456", contactEmail: "new@settings.test", contactPhone: "022", businessAddress: "2 New St" } },
    written: { businessName: "New Name", director: "Dee", address: "1 New St", nzbn: "9429", phone: "021", gstNumber: "123-456", contactEmail: "new@settings.test", contactPhone: "022", businessAddress: "2 New St" },
  },
  { kind: "daily-goal", change: { kind: "daily-goal", dailyGoal: "750.00" }, written: { dailyGoal: "750.00" } },
  {
    kind: "rent-reminders",
    change: { kind: "rent-reminders", changes: { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 0 } },
    written: { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 0 },
  },
  { kind: "trade-reminders", change: { kind: "trade-reminders", tradeRemindersEnabled: false }, written: { tradeRemindersEnabled: false } },
  {
    kind: "trade-gst",
    change: { kind: "trade-gst", changes: { gstRegistered: true, tradeGstMode: "exclusive" } },
    written: { gstRegistered: true, tradeGstMode: "exclusive" },
  },
  {
    kind: "onboarding",
    change: { kind: "onboarding", details: { director: "Dee", nzbn: "9429", gstNumber: "123-456", websiteUrl: "https://settings.test", estimatedAnnualTurnover: "Under $100k", businessDescription: "Coffee" } },
    written: { director: "Dee", nzbn: "9429", gstNumber: "123-456", websiteUrl: "https://settings.test", estimatedAnnualTurnover: "Under $100k", businessDescription: "Coffee", onboardingCompleted: true },
  },
] as const;

/** Every other purpose's columns, with values that differ from any fixture's. */
function othersColumns(kind: string) {
  const mine = new Set(Object.keys(PURPOSES.find((p) => p.kind === kind)!.written));
  const strays: Record<string, unknown> = { onboardingCompleted: false };
  for (const purpose of PURPOSES) for (const key of Object.keys(purpose.written)) if (!mine.has(key)) strays[key] = `stray-${key}`;
  if (mine.has("onboardingCompleted")) delete strays.onboardingCompleted;
  return strays;
}

/** The request with stray fields planted wherever a careless spread could pick them up. */
function withStrays(purpose: (typeof PURPOSES)[number]) {
  const strays = { ...FORBIDDEN, ...othersColumns(purpose.kind) };
  const change: any = { ...strays, ...purpose.change };
  if (change.changes) change.changes = { ...strays, ...change.changes };
  if (change.details) change.details = { ...strays, ...change.details, onboardingCompleted: false };
  return change;
}

async function seeded() {
  const storage = new MemStorage();
  const mine = await storage.createMerchant({ name: "mine", businessName: "Mine Ltd", email: "mine@settings.test" } as any);
  const other = await storage.createMerchant({ name: "other", businessName: "Other Ltd", email: "other@settings.test" } as any);
  return { storage: storage as any, mine, other };
}

const changedKeys = (before: any, after: any) =>
  Object.keys({ ...before, ...after }).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();

describe("R1-T7 S5a — a business's settings are written by purpose", () => {
  test.each(PURPOSES)("$kind writes its own columns on the business's row and nothing else", async (purpose) => {
    const { storage, mine, other } = await seeded();
    const before = { ...(await storage.getMerchant(mine.id)) };
    const otherBefore = JSON.stringify(await storage.getMerchant(other.id));
    const updated = await storage.updateMerchantSettings(mine.id, purpose.change);
    expect(updated).toMatchObject({ id: mine.id, ...purpose.written });
    const after = await storage.getMerchant(mine.id);
    // Every column this purpose owns was given a new value by the fixture, so all of them moved.
    expect(changedKeys(before, after).filter((key) => key !== "updatedAt")).toEqual(Object.keys(purpose.written).sort());
    expect(JSON.stringify(await storage.getMerchant(other.id))).toBe(otherBefore);
  });

  test.each(PURPOSES)("$kind never writes identity, credentials, status, billing or another purpose's columns", async (purpose) => {
    const { storage, mine } = await seeded();
    const before = { ...(await storage.getMerchant(mine.id)) };
    const updated = await storage.updateMerchantSettings(mine.id, withStrays(purpose));
    expect(updated).toMatchObject({ id: mine.id, email: "mine@settings.test", status: "pending", ...purpose.written });
    const after = await storage.getMerchant(mine.id);
    expect(changedKeys(before, after).filter((key) => key !== "updatedAt")).toEqual(Object.keys(purpose.written).sort());
  });

  test("only completing onboarding marks it complete, whatever the caller says", async () => {
    const { storage, mine } = await seeded();
    for (const purpose of PURPOSES.filter((p) => p.kind !== "onboarding")) {
      await storage.updateMerchantSettings(mine.id, { ...purpose.change, onboardingCompleted: true });
      expect((await storage.getMerchant(mine.id)).onboardingCompleted).not.toBe(true);
    }
    const onboarding = PURPOSES.find((p) => p.kind === "onboarding")!;
    await storage.updateMerchantSettings(mine.id, { kind: "onboarding", details: { ...onboarding.change.details, onboardingCompleted: false } });
    expect((await storage.getMerchant(mine.id)).onboardingCompleted).toBe(true);
  });

  test("an omitted field is kept and an explicit null is written", async () => {
    const { storage, mine } = await seeded();
    await storage.updateMerchantSettings(mine.id, { kind: "profile", changes: { director: "Dee", nzbn: "9429" } });
    const updated = await storage.updateMerchantSettings(mine.id, { kind: "profile", changes: { nzbn: null, phone: undefined } });
    expect(updated).toMatchObject({ director: "Dee", nzbn: null, businessName: "Mine Ltd" });
    const partial = await storage.updateMerchantSettings(mine.id, { kind: "rent-reminders", changes: { rentReminderDelayDays: 9 } });
    expect(partial).toMatchObject({ rentReminderDelayDays: 9, rentReminderEnabled: true, rentReminderIntervalDays: 3, rentReminderMaxCount: 3 });
    // The onboarding page sends "no value" as null (routes: `nzbn || null`).
    const onboarded = await storage.updateMerchantSettings(mine.id, { kind: "onboarding", details: { director: "Dee", nzbn: null, gstNumber: null, websiteUrl: null, estimatedAnnualTurnover: null, businessDescription: null } });
    expect(onboarded).toMatchObject({ director: "Dee", nzbn: null, websiteUrl: null, onboardingCompleted: true });
  });

  test("a purpose with nothing to change still answers the row, and changes none of its settings", async () => {
    const { storage, mine } = await seeded();
    const before = { ...(await storage.getMerchant(mine.id)) };
    const updated = await storage.updateMerchantSettings(mine.id, { kind: "rent-reminders", changes: {} });
    expect(updated).toMatchObject({ id: mine.id });
    expect(changedKeys(before, await storage.getMerchant(mine.id)).filter((key) => key !== "updatedAt")).toEqual([]);
  });

  test.each([undefined, null, {}, { kind: "everything", changes: FORBIDDEN }, { kind: "constructor", changes: { businessName: "x" } }, { changes: { businessName: "x" } }, "profile"])(
    "an unknown purpose %j writes nothing", async (change) => {
      const { storage, mine } = await seeded();
      const before = JSON.stringify(await storage.getMerchant(mine.id));
      expect(await storage.updateMerchantSettings(mine.id, change)).toBeUndefined();
      expect(JSON.stringify(await storage.getMerchant(mine.id))).toBe(before);
    });

  test("a business that does not exist is not found, and nothing is made", async () => {
    const { storage } = await seeded();
    for (const purpose of PURPOSES) expect(await storage.updateMerchantSettings(99_999, purpose.change)).toBeUndefined();
    expect(await storage.getMerchant(99_999)).toBeUndefined();
  });

  test.each(INVALID_TENANTS)("invalid business %s reads and changes nothing", async (tenant) => {
    const { storage, mine, other } = await seeded();
    // A row keyed by the invalid value itself must not be reachable either.
    storage.merchants.set(tenant, { ...mine, id: tenant });
    const before = JSON.stringify([...storage.merchants.entries()]);
    expect(await storage.getMerchant(tenant)).toBeUndefined();
    for (const purpose of PURPOSES) expect(await storage.updateMerchantSettings(tenant, purpose.change)).toBeUndefined();
    expect(await storage.updateMerchantDetails(tenant, { businessName: "x", contactEmail: "x@x.test", contactPhone: "1", businessAddress: "x" })).toBeUndefined();
    expect(await storage.updateMerchantTheme(tenant, "other")).toBeUndefined();
    expect(await storage.updateMerchantLogoUrl(tenant, "/uploads/logos/x.png")).toBeUndefined();
    expect(JSON.stringify([...storage.merchants.entries()])).toBe(before);
    expect(await storage.getMerchant(other.id)).toMatchObject({ id: other.id });
  });

  test("details are four named fields in memory, whatever else is handed over", async () => {
    const { storage, mine } = await seeded();
    const before = { ...(await storage.getMerchant(mine.id)) };
    await storage.updateMerchantDetails(mine.id, { ...FORBIDDEN, businessName: "Named", contactEmail: "named@settings.test", contactPhone: "09", businessAddress: "3 St" });
    expect(changedKeys(before, await storage.getMerchant(mine.id))).toEqual(["businessAddress", "businessName", "contactEmail", "contactPhone"]);
  });
});

/** Capture the actual SQL expression and SET object passed to Drizzle, with no database connection. */
function queryCapture() {
  const captured: { where?: any; set?: any } = {};
  const where = (predicate: any) => {
    captured.where = predicate;
    return { limit: async () => [], returning: async () => [] };
  };
  const db = {
    select: () => ({ from: () => ({ where }) }),
    update: () => ({ set: (value: any) => { captured.set = value; return { where }; } }),
  };
  return { captured, storage: new DatabaseStorage(db as any) as any };
}

describe("R1-T7 S5a — PostgreSQL statements", () => {
  test.each(PURPOSES)("$kind sets exactly its columns on the business's row", async (purpose) => {
    const { storage, captured } = queryCapture();
    await storage.updateMerchantSettings(29, withStrays(purpose));
    expect(captured.set).toEqual({ ...purpose.written, updatedAt: expect.any(Date) });
    const query = new PgDialect().sqlToQuery(captured.where);
    expect(query.sql).toBe('"merchants"."id" = $1');
    expect(query.params).toEqual([29]);
  });

  test("details set four named columns in the database too", async () => {
    const { storage, captured } = queryCapture();
    await storage.updateMerchantDetails(29, { ...FORBIDDEN, businessName: "Named", contactEmail: "named@settings.test", contactPhone: "09", businessAddress: "3 St" });
    expect(captured.set).toEqual({ businessName: "Named", contactEmail: "named@settings.test", contactPhone: "09", businessAddress: "3 St" });
    expect(new PgDialect().sqlToQuery(captured.where).params).toEqual([29]);
  });

  test("an unknown purpose issues no statement", async () => {
    const { storage, captured } = queryCapture();
    expect(await storage.updateMerchantSettings(29, { kind: "everything", changes: FORBIDDEN })).toBeUndefined();
    expect(captured).toEqual({});
  });

  test.each([
    ["getMerchant", []],
    ["updateMerchantSettings", [{ kind: "daily-goal", dailyGoal: "1.00" }]],
    ["updateMerchantDetails", [{ businessName: "x", contactEmail: "x@x.test", contactPhone: "1", businessAddress: "x" }]],
    ["updateMerchantTheme", ["other"]],
    ["updateMerchantLogoUrl", ["/uploads/logos/x.png"]],
  ] as const)("%s issues no query for an invalid business", async (method, args) => {
    for (const invalid of INVALID_TENANTS) {
      const { storage, captured } = queryCapture();
      expect(await storage[method](invalid, ...args)).toBeUndefined();
      expect(captured).toEqual({});
    }
    const { storage, captured } = queryCapture();
    await storage[method](29, ...args);
    expect(new PgDialect().sqlToQuery(captured.where).params).toEqual([29]);
  });
});
