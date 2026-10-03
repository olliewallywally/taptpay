import "./support/test-env";

import * as delivery from "../trades-delivery";
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
  CLIENT,
  INVOICE,
  MADE_CLIENT,
  MADE_INVOICE,
  MADE_QUOTE,
  MADE_SCHEDULE,
  QUOTE,
  SCHEDULE,
  fakeTrades,
  inDays,
  seedTrades,
  type TradesFake,
} from "./support/trades-fake";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the trades family (clients, quotes, invoices,
 * recurring invoices, reminders, GST). Every route serves the business's owner, and its teammates on
 * all but the GST setting (the owner's); never the platform admin. Each allowed caller's real request
 * is served: the route's success status, and what the success did or returned. The customer's quote
 * link (its three routes, with their own gate) is the own-gate family's.
 *
 * The in-memory storage keeps no trades data, so the records live in the shared fake
 * (support/trades-fake.ts): what is proven is the routes' decisions, not their SQL. Sending a quote,
 * an invoice or a receipt is stubbed as delivered (the delivery module is tested on its own).
 */

let fake: TradesFake;
const CLIENT_FIELDS = { firstName: "Nico", lastName: "Newclient", siteAddress: "2 Site Road", email: "nico@example.test" };

function seeded(ctx: ServedCtx, state?: Parameters<typeof seedTrades>[2]) {
  seedTrades(fake, ctx.merchantId, state);
}
const eventTypes = (clientId = CLIENT) => fake.events.filter((row) => row.clientProfileId === clientId).map((row) => row.eventType);
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

const RECIPES: Record<string, ServedRecipe> = {
  // The business's trades settings.
  "GET /api/trades/reminder-settings": async (ctx) => {
    await storage.updateMerchant(ctx.merchantId, { tradeRemindersEnabled: false } as any);
    return { req: { method: "get", path: "/api/trades/reminder-settings" }, status: 200, check: (res) => expect(res.body).toEqual({ tradeRemindersEnabled: false }) };
  },
  "PUT /api/trades/reminder-settings": (ctx) => ({
    req: { method: "put", path: "/api/trades/reminder-settings", body: { tradeRemindersEnabled: false } }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ tradeRemindersEnabled: false });
      expect((await storage.getMerchant(ctx.merchantId))?.tradeRemindersEnabled).toBe(false);
    },
  }),
  "GET /api/trades/gst-settings": async (ctx) => {
    await storage.updateMerchant(ctx.merchantId, { gstRegistered: true, tradeGstMode: "exclusive" } as any);
    return {
      req: { method: "get", path: "/api/trades/gst-settings" }, status: 200,
      check: (res) => expect(res.body).toEqual({ gstRegistered: true, tradeGstMode: "exclusive" }),
    };
  },
  "PUT /api/trades/gst-settings": (ctx) => ({
    req: { method: "put", path: "/api/trades/gst-settings", body: { gstRegistered: true, tradeGstMode: "exclusive" } }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ gstRegistered: true, tradeGstMode: "exclusive" });
      expect(await storage.getMerchant(ctx.merchantId)).toMatchObject({ gstRegistered: true, tradeGstMode: "exclusive" });
    },
  }),
  // Clients.
  "GET /api/trades/clients": (ctx) => {
    seeded(ctx);
    return { req: { method: "get", path: "/api/trades/clients" }, status: 200, check: (res) => expect(ids(res.body)).toEqual([CLIENT]) };
  },
  "POST /api/trades/clients": (ctx) => ({
    req: { method: "post", path: "/api/trades/clients", body: CLIENT_FIELDS }, status: 201,
    check: (res) => {
      expect(res.body).toMatchObject({ id: MADE_CLIENT, merchantId: ctx.merchantId, ...CLIENT_FIELDS, preferredChannel: "email", status: "active" });
      expect(fake.clients.get(MADE_CLIENT)).toMatchObject({ merchantId: ctx.merchantId, firstName: "Nico" });
    },
  }),
  "GET /api/trades/clients/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: `/api/trades/clients/${CLIENT}` }, status: 200,
      check: (res) => expect(res.body).toMatchObject({ id: CLIENT, merchantId: ctx.merchantId, firstName: "Cal" }),
    };
  },
  "PUT /api/trades/clients/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "put", path: `/api/trades/clients/${CLIENT}`, body: { firstName: "Callum" } }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: CLIENT, firstName: "Callum", lastName: "Client" });
        expect(fake.clients.get(CLIENT)).toMatchObject({ firstName: "Callum", lastName: "Client" });
      },
    };
  },
  "POST /api/trades/clients/:id/archive": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/trades/clients/${CLIENT}/archive` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: CLIENT, status: "archived" });
        // Its recurring invoices are cancelled with it.
        expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated" });
      },
    };
  },
  "POST /api/trades/clients/:id/unarchive": (ctx) => {
    seeded(ctx, { client: { status: "archived", archivedAt: new Date() } });
    return {
      req: { method: "post", path: `/api/trades/clients/${CLIENT}/unarchive` }, status: 200,
      check: (res) => expect(res.body).toMatchObject({ id: CLIENT, status: "active", archivedAt: null }),
    };
  },
  "POST /api/trades/clients/:id/promote": (ctx) => {
    seeded(ctx, { client: { status: "prospect" } });
    return {
      req: { method: "post", path: `/api/trades/clients/${CLIENT}/promote` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: CLIENT, status: "active" });
        expect(fake.clients.get(CLIENT)?.status).toBe("active");
      },
    };
  },
  "GET /api/trades/clients/:id/events": async (ctx) => {
    seeded(ctx);
    await as(ctx, ctx.owner).post(`/api/trades/invoices/${INVOICE}/void`);
    await as(ctx, ctx.owner).put(`/api/trades/schedules/${SCHEDULE}`, { status: "paused" });
    return {
      req: { method: "get", path: `/api/trades/clients/${CLIENT}/events` }, status: 200,
      // The client's history, newest first.
      check: (res) => expect(res.body.map((row: { eventType: string }) => row.eventType)).toEqual(["schedule_paused", "invoice_voided"]),
    };
  },
  // Quotes (paid access for a new one: the fake reports a card ready).
  "GET /api/trades/quotes": (ctx) => {
    seeded(ctx);
    return { req: { method: "get", path: "/api/trades/quotes" }, status: 200, check: (res) => expect(ids(res.body)).toEqual([QUOTE]) };
  },
  "POST /api/trades/quotes": (ctx) => {
    seeded(ctx);
    return {
      req: {
        method: "post", path: "/api/trades/quotes",
        body: {
          clientProfileId: CLIENT, deliveryChannel: "email", depositEnabled: true, depositType: "percent", depositValue: 25,
          lineItems: [{ description: "Replace the switchboard", qty: 2, unitPriceCents: 40_000, lineTotalCents: 80_000 }],
        },
      },
      status: 201,
      check: (res) => {
        // The line totals and the deposit are the server's sums (the business is not GST-registered).
        expect(res.body).toMatchObject({
          id: MADE_QUOTE, merchantId: ctx.merchantId, clientProfileId: CLIENT, status: "sent",
          subtotalCents: 80_000, gstCents: 0, totalCents: 80_000, depositCents: 20_000, delivered: true,
        });
        expect(delivery.sendTradeQuote).toHaveBeenCalledWith(MADE_QUOTE, expect.any(String));
        expect(eventTypes()).toEqual(["quote_sent"]);
      },
    };
  },
  "GET /api/trades/quotes/:id/pdf": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: `/api/trades/quotes/${QUOTE}/pdf`, binary: true }, status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
        expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="quote-.+-QUOTE-TO\.pdf"$/);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      },
    };
  },
  // Invoices.
  "GET /api/trades/invoices": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "get", path: `/api/trades/invoices?clientProfileId=${CLIENT}` }, status: 200,
      check: (res) => expect(ids(res.body)).toEqual([INVOICE]),
    };
  },
  "POST /api/trades/invoices": (ctx) => {
    seeded(ctx);
    return {
      req: {
        method: "post", path: "/api/trades/invoices",
        body: { clientProfileId: CLIENT, amountCents: 30_000, deliveryChannel: "email", dueAt: inDays(14).toISOString(), kind: "deposit", quoteId: QUOTE },
      },
      status: 201,
      check: (res) => {
        expect(res.body).toMatchObject({
          id: MADE_INVOICE, merchantId: ctx.merchantId, clientProfileId: CLIENT, quoteId: QUOTE, kind: "deposit",
          amountCents: 30_000, status: "pending_dispatch", delivered: true,
        });
        expect(delivery.resendTradeInvoice).toHaveBeenCalledWith(MADE_INVOICE, expect.any(String));
        expect(eventTypes()).toEqual(["invoice_sent"]);
      },
    };
  },
  "POST /api/trades/invoices/:id/send-balance": (ctx) => {
    // A paid deposit of 20,000 on the 100,000 quote: the balance is what is left.
    seeded(ctx, { invoice: { kind: "deposit", quoteId: QUOTE, amountCents: 20_000, status: "paid" } });
    return {
      req: { method: "post", path: `/api/trades/invoices/${INVOICE}/send-balance`, body: { splitEnabled: false } }, status: 201,
      check: (res) => {
        expect(res.body).toMatchObject({ id: MADE_INVOICE, kind: "balance", amountCents: 80_000, quoteId: QUOTE, delivered: true });
        expect(eventTypes()).toEqual(["balance_sent"]);
      },
    };
  },
  "POST /api/trades/invoices/:id/mark-paid-external": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/trades/invoices/${INVOICE}/mark-paid-external`, body: { externalPaymentReference: "Cash on site" } },
      status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, status: "paid_external", externalPaymentReference: "Cash on site" });
        // The client is sent the paid invoice, by the service that takes the business (R1-T7 S4b1).
        expect(delivery.sendTradePaymentInvoiceForMerchant).toHaveBeenCalledWith(INVOICE, ctx.merchantId);
        expect(delivery.sendTradePaymentInvoice).not.toHaveBeenCalled();
        expect(eventTypes()).toEqual(["paid_external"]);
      },
    };
  },
  "POST /api/trades/invoices/:id/complete": (ctx) => {
    seeded(ctx, { invoice: { status: "paid" } });
    return {
      req: { method: "post", path: `/api/trades/invoices/${INVOICE}/complete` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, completedAt: expect.any(String) });
        expect(eventTypes()).toEqual(["job_completed"]);
      },
    };
  },
  "POST /api/trades/invoices/:id/void": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "post", path: `/api/trades/invoices/${INVOICE}/void` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: INVOICE, status: "voided", voidedAt: expect.any(String) });
        expect(eventTypes()).toEqual(["invoice_voided"]);
      },
    };
  },
  // Recurring invoices.
  "GET /api/trades/schedules": (ctx) => {
    seeded(ctx);
    return { req: { method: "get", path: "/api/trades/schedules" }, status: 200, check: (res) => expect(ids(res.body)).toEqual([SCHEDULE]) };
  },
  "POST /api/trades/schedules": (ctx) => {
    seeded(ctx);
    const startDate = inDays(7).toISOString();
    return {
      req: {
        method: "post", path: "/api/trades/schedules",
        body: { clientProfileId: CLIENT, amountCents: 25_000, frequency: "monthly", deliveryChannel: "email", startDate },
      },
      status: 201,
      check: (res) => {
        expect(res.body).toMatchObject({ id: MADE_SCHEDULE, merchantId: ctx.merchantId, clientProfileId: CLIENT, amountCents: 25_000, frequency: "monthly", status: "active" });
        expect(new Date(res.body.nextRunDate).toISOString()).toBe(startDate);
        expect(eventTypes()).toEqual(["schedule_created"]);
      },
    };
  },
  "PUT /api/trades/schedules/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "put", path: `/api/trades/schedules/${SCHEDULE}`, body: { status: "paused" } }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: SCHEDULE, status: "paused" });
        expect(eventTypes()).toEqual(["schedule_paused"]);
      },
    };
  },
  "DELETE /api/trades/schedules/:id": (ctx) => {
    seeded(ctx);
    return {
      req: { method: "delete", path: `/api/trades/schedules/${SCHEDULE}` }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: SCHEDULE, status: "terminated", terminatedAt: expect.any(String) });
        expect(eventTypes()).toEqual(["schedule_terminated"]);
      },
    };
  },
};

const ROWS = familyRows("trades");
const SERVED = servedPairs(ROWS);

beforeEach(() => {
  resetTestStorage();
  fake = fakeTrades();
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the trades family: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves the owner everywhere, a teammate on all but the GST setting, and never the platform admin", () => {
    expect(servedTo(ROWS, "owner")).toEqual(Object.keys(RECIPES).sort());
    expect(servedTo(ROWS, "member")).toEqual(Object.keys(RECIPES).filter((key) => key !== "PUT /api/trades/gst-settings").sort());
    expect(servedTo(ROWS, "platform-admin")).toEqual([]);
  });

  it.each(SERVED)("%s, by the %s", (key, caller) => expectServed(RECIPES, key, caller));
});
