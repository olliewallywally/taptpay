import "./support/test-env";

import * as propertyCron from "../property-cron";
import { resetTestStorage, storage } from "./support/http-harness";
import {
  as,
  expectServed,
  familyRows,
  servedPairs,
  servedTo,
  type ServedCtx,
  type ServedRecipe,
} from "./support/matrix-served";
import {
  INVOICE,
  MADE_INVOICE,
  MADE_SCHEDULE,
  MADE_TENANT,
  SCHEDULE,
  TENANT,
  fakeProperty,
  inDays,
  seedProperty,
  type PropertyFake,
} from "./support/property-fake";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the property family (tenants, rent automations,
 * invoices, reminders). Every route serves the business's owner and its teammates alike, and never the
 * platform admin (no business of its own); each allowed caller's real request is served: the route's
 * success status, and what the success did or returned.
 *
 * The in-memory storage has no property tables, so the records live in the shared fake
 * (support/property-fake.ts): what is proven is the routes' decisions, not their SQL. Sending an
 * invoice's link is stubbed as delivered (its channels are the property cron's, tested there).
 */

let fake: PropertyFake;
const PDF = Buffer.from("%PDF-1.4\n%matrix\n");
const TENANT_FIELDS = { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road", email: "nia@example.test" };
const REMINDERS = { rentReminderEnabled: false, rentReminderDelayDays: 5, rentReminderIntervalDays: 7, rentReminderMaxCount: 2 };

/** The business's records, and this route's success, with the fake's tenant, automation and invoice. */
function seeded(ctx: ServedCtx, state?: Parameters<typeof seedProperty>[2]) {
  seedProperty(fake, ctx.merchantId, state);
}
const eventTypes = (tenantId = TENANT) => fake.events.filter((row) => row.tenantProfileId === tenantId).map((row) => row.eventType);

const RECIPES: Record<string, ServedRecipe> = {
  // Tenants.
  "GET /api/property/tenants": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: "/api/property/tenants" }, status: 200,
      check: (res) => expect(res.body.map((row: { id: string }) => row.id)).toEqual([TENANT]),
    };
  },
  "POST /api/property/tenants": (ctx) => ({
    req: { method: "post", path: "/api/property/tenants", body: TENANT_FIELDS }, status: 201,
    check: (res) => {
      expect(res.body).toMatchObject({ id: MADE_TENANT, merchantId: ctx.merchantId, ...TENANT_FIELDS, preferredChannel: "email" });
      expect(fake.tenants.get(MADE_TENANT)).toMatchObject({ merchantId: ctx.merchantId, firstName: "Nia" });
      expect(eventTypes(MADE_TENANT)).toEqual(["Tenant_Created"]);
    },
  }),
  "GET /api/property/tenants/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: `/api/property/tenants/${TENANT}` }, status: 200,
      check: (res) => expect(res.body).toMatchObject({ id: TENANT, merchantId: ctx.merchantId, firstName: "Tess" }),
    };
  },
  "PUT /api/property/tenants/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "put", path: `/api/property/tenants/${TENANT}`, body: { firstName: "Tessa" } }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: TENANT, firstName: "Tessa", lastName: "Tenant" });
        expect(fake.tenants.get(TENANT)).toMatchObject({ firstName: "Tessa", lastName: "Tenant" });
      },
    };
  },
  "POST /api/property/tenants/:id/archive": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/property/tenants/${TENANT}/archive` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: TENANT, status: "archived" });
        expect(eventTypes()).toEqual(["Tenant_Archived"]);
      },
    };
  },
  "POST /api/property/tenants/:id/unarchive": (ctx) => {
    seeded(ctx, { tenant: { status: "archived" } });
    return {
      req: { method: "post", path: `/api/property/tenants/${TENANT}/unarchive` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: TENANT, status: "active" });
        expect(eventTypes()).toEqual(["Tenant_Restored"]);
      },
    };
  },
  "GET /api/property/tenants/:id/events": async (ctx) => {
    seeded(ctx);
    await as(ctx, ctx.owner).post(`/api/property/tenants/${TENANT}/archive`);
    await as(ctx, ctx.owner).post(`/api/property/tenants/${TENANT}/unarchive`);
    return {
      req: { method: "get", path: `/api/property/tenants/${TENANT}/events` }, status: 200,
      // The tenant's history, newest first.
      check: (res) => expect(res.body.map((row: { eventType: string }) => row.eventType)).toEqual(["Tenant_Restored", "Tenant_Archived"]),
    };
  },
  // Rent automations (paid access for a new one: the fake reports a card ready).
  "GET /api/property/schedules": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: "/api/property/schedules" }, status: 200,
      check: (res) => expect(res.body.map((row: { id: string }) => row.id)).toEqual([SCHEDULE]),
    };
  },
  "POST /api/property/tenants/:tenantId/schedules": (ctx) => {
    seeded(ctx);
    const startDate = inDays(7).toISOString();
    return {
      req: {
        method: "post", path: `/api/property/tenants/${TENANT}/schedules`,
        body: { amountCents: 60_000, frequency: "fortnightly", deliveryChannel: "email", startDate },
      },
      status: 201,
      check: (res) => {
        expect(res.body).toMatchObject({ id: MADE_SCHEDULE, merchantId: ctx.merchantId, tenantProfileId: TENANT, amountCents: 60_000, frequency: "fortnightly", status: "active" });
        expect(new Date(res.body.nextRunDate).toISOString()).toBe(startDate);
        // The tenant's one rent automation: the new one replaces the old.
        expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated" });
      },
    };
  },
  "PUT /api/property/schedules/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "put", path: `/api/property/schedules/${SCHEDULE}`, body: { status: "paused" } }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: SCHEDULE, status: "paused" });
        expect(eventTypes()).toEqual(["Schedule_Paused"]);
      },
    };
  },
  "DELETE /api/property/schedules/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "delete", path: `/api/property/schedules/${SCHEDULE}` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: SCHEDULE, status: "terminated" });
        expect(eventTypes()).toEqual(["Schedule_Terminated"]);
      },
    };
  },
  // Invoices.
  "GET /api/property/invoices": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: "/api/property/invoices" }, status: 200,
      check: (res) => expect(res.body).toEqual([
        expect.objectContaining({ id: INVOICE, tenantName: "Tess Tenant", propertyAddress: "1 Test Road", owingCents: 50_000, sharesLeft: null }),
      ]),
    };
  },
  "POST /api/property/invoices/document": (ctx) => ({
    req: { method: "post", path: "/api/property/invoices/document", attach: { field: "document", bytes: PDF, filename: "bill.pdf", contentType: "application/pdf" } },
    status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ documentUrl: expect.stringMatching(/^\/uploads\/invoices\/invoice-\d+-[0-9a-f]{16}\.pdf$/), documentName: "bill.pdf" });
      // Kept for the business that uploaded it: the invoice create checks the reference against it.
      const stored = await storage.getUploadedFileForMerchant(res.body.documentUrl.replace(/^\/uploads\//, ""), ctx.merchantId);
      expect(stored).toBeTruthy();
    },
  }),
  "POST /api/property/invoices": (ctx) => {
    seeded(ctx);
    fake.invoices.clear();
    return {
      req: {
        method: "post", path: "/api/property/invoices",
        body: { tenantProfileId: TENANT, amountCents: 12_000, deliveryChannel: "email", dueAt: inDays(14).toISOString(), kind: "charge", chargeType: "cleaning", description: "End of tenancy clean" },
      },
      status: 201,
      check: (res) => {
        expect(res.body).toMatchObject({
          id: MADE_INVOICE, merchantId: ctx.merchantId, tenantProfileId: TENANT, amountCents: 12_000, kind: "charge",
          status: "pending_dispatch", resent: false, delivered: true,
        });
        expect(fake.invoices.get(MADE_INVOICE)?.token).toEqual(expect.any(String));
        expect(propertyCron.resendInvoiceEmail).toHaveBeenCalledWith(MADE_INVOICE, expect.any(String));
        expect(eventTypes()).toEqual(["Charge_Created"]);
      },
    };
  },
  "POST /api/property/invoices/:id/resend": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/property/invoices/${INVOICE}/resend` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, status: "dispatched" });
        expect(propertyCron.resendInvoiceEmail).toHaveBeenCalledWith(INVOICE, expect.any(String));
      },
    };
  },
  "POST /api/property/invoices/:id/void": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/property/invoices/${INVOICE}/void` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, status: "voided", voidedAt: expect.any(String) });
        expect(eventTypes()).toEqual(["Invoice_Voided"]);
      },
    };
  },
  "POST /api/property/invoices/:id/mark-paid-external": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/property/invoices/${INVOICE}/mark-paid-external`, body: { externalPaymentReference: "Bank transfer 2026-09-27" } },
      status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, status: "paid_external", externalPaymentReference: "Bank transfer 2026-09-27" });
        expect(eventTypes()).toEqual(["Payment_External"]);
      },
    };
  },
  // Reminders (the business's own settings, on the business row).
  "GET /api/property/reminder-settings": async (ctx) => {
    await storage.updateMerchant(ctx.merchantId, REMINDERS as any);
    return { req: { method: "get", path: "/api/property/reminder-settings" }, status: 200, check: (res) => expect(res.body).toEqual(REMINDERS) };
  },
  "PUT /api/property/reminder-settings": (ctx) => ({
    req: { method: "put", path: "/api/property/reminder-settings", body: REMINDERS }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual(REMINDERS);
      expect(await storage.getMerchant(ctx.merchantId)).toMatchObject(REMINDERS);
    },
  }),
};

const ROWS = familyRows("property");
const SERVED = servedPairs(ROWS);

beforeEach(() => {
  resetTestStorage();
  fake = fakeProperty();
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the property family: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves the owner and a teammate everywhere, and never the platform admin", () => {
    expect(servedTo(ROWS, "owner")).toEqual(Object.keys(RECIPES).sort());
    expect(servedTo(ROWS, "member")).toEqual(Object.keys(RECIPES).sort());
    expect(servedTo(ROWS, "platform-admin")).toEqual([]);
  });

  it.each(SERVED)("%s, by the %s", (key, caller) => expectServed(RECIPES, key, caller));
});
