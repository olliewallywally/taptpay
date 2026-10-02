import "./support/test-env";
// Web push is set up, so its key and capabilities are served (the key is 503 while it is not).
import "./support/push-test-env";
// The info pack's email goes through the mocked provider below, so its recipient is read.
import "./support/resend-capture-env";

import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import request from "supertest";

type Sent = { to: string | string[]; subject: string; html?: string; text?: string };
const mockSent: Sent[] = [];
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (message: Sent) => {
        mockSent.push(message);
        return { data: { id: "captured" }, error: null };
      }),
    },
  })),
}));

import { config } from "../config";
import { ownerTransactionDto, publicTransactionDto } from "../http-contracts";
import { NO_BOARD_ADDRESS_RETIRED, noBoardAddressRetiredHtml } from "../no-board-address";
import { getWindcaveEnv } from "../windcave";
import { signedIn, resetTestStorage, storage } from "./support/http-harness";
import {
  expectOwnServed,
  familyRows,
  ownServedBy,
  ownServedPairs,
  paidMonth,
  sendServed,
  type OwnServedCaller,
  type OwnServedRecipe,
  type ServedCtx,
  type ServedRequest,
} from "./support/matrix-served";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the public pages, a board's pages and the platform's
 * public settings, routes with their own gates. Each serves anyone with no sign-in; a business's open
 * sale and its live updates also serve the business signed in (the owner, a teammate, the platform
 * admin), each with its own view. Each case sends a real request and checks the route's success status
 * and what the success did or returned. A retired address's success is its notice (410), which it
 * gives everyone. The refusals: route-matrix-own-gates.test.ts (and the R1-T6 and no-board tests for a
 * malformed or retired address).
 */

const ORIGIN = "https://harness.test";
// A whole 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const get = (pathname: string): ServedRequest => ({ method: "get", path: pathname });
const download = (pathname: string): ServedRequest => ({ method: "get", path: pathname, binary: true });
/** A JSON round trip: what a response body holds for a value (dates as strings, no undefined). */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));
const sentTo = (address: string) => mockSent.filter((message) => [message.to].flat()[0] === address);

async function board(ctx: ServedCtx): Promise<number> {
  return (await storage.createNextTaptStone(ctx.merchantId, "Front till")).id;
}
const boardPage = (ctx: ServedCtx, stoneId: number) => `${ORIGIN}/pay/${ctx.merchantId}/stone/${stoneId}`;
const boardQr = (ctx: ServedCtx, stoneId: number) => `${ORIGIN}/api/merchants/${ctx.merchantId}/stone/${stoneId}/qr`;

/** An open sale on a board, as the terminal leaves one waiting for its customer. */
async function boardSale(ctx: ServedCtx, stoneId: number) {
  return storage.createTransaction({
    merchantId: ctx.merchantId, taptStoneId: stoneId, itemName: "Flat white", price: "5.50", status: "pending",
    paymentMethod: "qr_code", splitEnabled: false,
  } as any);
}

/** The text each QR image encodes (the real image is still made). */
function qrTexts() {
  const toBuffer = jest.spyOn(QRCode, "toBuffer");
  return () => toBuffer.mock.calls.map((call) => call[0]);
}

const RECIPES: Record<string, OwnServedRecipe> = {
  // For crawlers, and Apple Pay's domain check.
  "GET /robots.txt": () => ({
    req: get("/robots.txt"), status: 200,
    check: (res) => {
      expect(res.headers["content-type"]).toMatch(/^text\/plain/);
      // The signed-in screens and the API are kept out of search results.
      for (const kept of ["/dashboard", "/terminal", "/settings", "/nfc", "/admin", "/api/"]) expect(res.text).toContain(`Disallow: ${kept}\n`);
      expect(res.text).toContain("Sitemap: https://taptpay.com/sitemap.xml");
    },
  }),
  "GET /sitemap.xml": () => ({
    req: download("/sitemap.xml"), status: 200,
    check: (res) => {
      expect(res.headers["content-type"]).toMatch(/^application\/xml/);
      const pages = [...(res.body as Buffer).toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
      expect(pages).toEqual(["/", "/signup", "/login", "/terms", "/privacy"].map((page) => `https://taptpay.com${page}`));
    },
  }),
  "GET /.well-known/apple-developer-merchantid-domain-association": () => ({
    req: download("/.well-known/apple-developer-merchantid-domain-association"), status: 200,
    check: (res) => {
      const file = fs.readFileSync(path.resolve("client/public/.well-known/apple-developer-merchantid-domain-association"));
      expect((res.body as Buffer).equals(file)).toBe(true);
    },
  }),
  // A board's NFC tag, and the retired no-board tag and QR.
  "GET /nfc/:merchantId/stone/:stoneId": async (ctx) => {
    const stoneId = await board(ctx);
    return {
      req: get(`/nfc/${ctx.merchantId}/stone/${stoneId}`), status: 200,
      check: (res) => {
        expect(res.headers["cache-control"]).toBe("no-store");
        // The page opens the board's page, in Chrome from an Android in-app browser.
        expect(res.text).toContain(JSON.stringify(boardPage(ctx, stoneId)));
        expect(res.text).toContain(JSON.stringify(`intent://harness.test/pay/${ctx.merchantId}/stone/${stoneId}#Intent;scheme=https;package=com.android.chrome;end`));
      },
    };
  },
  "GET /nfc/:merchantId": (ctx) => ({
    req: get(`/nfc/${ctx.merchantId}`), status: 410,
    check: (res) => {
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.text).toBe(noBoardAddressRetiredHtml());
    },
  }),
  "GET /api/merchants/:id/qr": (ctx) => ({
    req: get(`/api/merchants/${ctx.merchantId}/qr`), status: 410,
    check: (res) => expect(res.body).toEqual(NO_BOARD_ADDRESS_RETIRED),
  }),
  // A board's page: its printed QR, its name and logo, its open sale, its live updates.
  "GET /api/merchants/:id/stone/:stoneId/qr": async (ctx) => {
    const stoneId = await board(ctx);
    const encoded = qrTexts();
    return {
      req: download(`/api/merchants/${ctx.merchantId}/stone/${stoneId}/qr`), status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("image/png");
        expect(res.headers["cache-control"]).toBe("public, max-age=2592000");
        expect((res.body as Buffer).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        expect(encoded()).toEqual([boardPage(ctx, stoneId)]);
      },
    };
  },
  "GET /api/merchants/:id/stone/:stoneId/brand": async (ctx) => {
    const stoneId = await board(ctx);
    await storage.updateMerchant(ctx.merchantId, { businessName: "Board Brand Ltd", customLogoUrl: "/uploads/logos/brand.png" } as any);
    return {
      req: get(`/api/merchants/${ctx.merchantId}/stone/${stoneId}/brand`), status: 200,
      // The name and logo only.
      check: (res) => expect(res.body).toEqual({ businessName: "Board Brand Ltd", customLogoUrl: "/uploads/logos/brand.png" }),
    };
  },
  "GET /api/merchants/:id/active-transaction": async (ctx, caller) => {
    const stoneId = await board(ctx);
    const sale = await boardSale(ctx, stoneId);
    const withAddresses = { ...sale, paymentUrl: boardPage(ctx, stoneId), qrCodeUrl: boardQr(ctx, stoneId) };
    const onTheBoard = caller === "signed-out";
    return {
      // The board's page asks for its board; the business's terminal, signed in, for its newest open sale.
      req: get(`/api/merchants/${ctx.merchantId}/active-transaction${onTheBoard ? `?stoneId=${stoneId}` : ""}`), status: 200,
      check: (res) => {
        expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
        expect(res.body).toEqual(asJson(onTheBoard ? publicTransactionDto(withAddresses) : ownerTransactionDto(withAddresses)));
      },
    };
  },
  "GET /api/merchants/:id/events": async (ctx, caller) => {
    const stoneId = await board(ctx);
    const onTheBoard = caller === "signed-out";
    return {
      req: { ...get(`/api/merchants/${ctx.merchantId}/events${onTheBoard ? `?stoneId=${stoneId}` : ""}`), stream: true },
      status: 200,
      check: async (res) => {
        expect(res.headers["content-type"]).toBe("text/event-stream");
        expect(res.headers["cache-control"]).toBe("private, no-cache, no-store");
        expect(res.body).toEqual(onTheBoard ? { type: "connected", audience: "board", stoneId } : { type: "connected", audience: "merchant" });
        // A new sale on the board reaches the stream.
        await paidMonth(ctx);
        const created = await sendServed(ctx, ctx.owner, {
          method: "post", path: "/api/transactions",
          body: { merchantId: ctx.merchantId, itemName: "Board sale", price: "8.00", selectedStoneId: stoneId },
        });
        if (created.status !== 200) throw new Error(`fixture: sale failed ${created.status}`);
        await expect(res.nextEvent!()).resolves.toMatchObject({
          type: "transaction_updated", transaction: { id: created.body.id, itemName: "Board sale", taptStoneId: stoneId },
        });
      },
    };
  },
  // The platform's public settings: what a checkout page and a browser's notifications need.
  "GET /api/nfc/capabilities": () => ({
    req: get("/api/nfc/capabilities"), status: 200,
    check: (res) => {
      const tap = config.features.tapToPay;
      // The wallets always report false: their routes are retired.
      expect(res.body).toEqual({
        nfcSupported: tap, applePay: false, googlePay: false, samsungPay: false, contactlessCard: tap, webNFC: false,
        recommendations: tap ? [] : ["Use QR code for payment"],
      });
    },
  }),
  "GET /api/windcave/env": () => ({
    req: get("/api/windcave/env"), status: 200,
    check: (res) => expect(res.body).toEqual({
      env: getWindcaveEnv(), applePayMerchantId: config.windcave.applePayMerchantId || "",
      googlePayMerchantId: config.windcave.googlePayMerchantId || "", googlePayEnv: config.wallets.googlePayEnvironment,
    }),
  }),
  "GET /api/push/capabilities": () => ({
    req: get("/api/push/capabilities"), status: 200,
    check: (res) => expect(res.body).toEqual({
      webPush: { available: true },
      nativePush: { available: false, reason: "APNs credentials not configured", bundleId: config.push.apnsBundleId },
    }),
  }),
  "GET /api/push/vapid-key": () => ({
    req: get("/api/push/vapid-key"), status: 200,
    check: (res) => expect(res.body).toEqual({ publicKey: process.env.VAPID_PUBLIC_KEY }),
  }),
  // The browser's return from adding a card: sent back to billing, with one of four results.
  "GET /api/billing/card/callback": () => ({
    req: get("/api/billing/card/callback?result=approved&sessionId=never-in-our-address"), status: 302,
    check: (res) => expect(res.headers.location).toBe("/settings?section=billing&card=approved"),
  }),
  "POST /api/billing/card/callback": () => ({
    req: { method: "post", path: "/api/billing/card/callback", body: { result: "declined" } }, status: 302,
    check: (res) => expect(res.headers.location).toBe("/settings?section=billing&card=declined"),
  }),
  // A business's logo, public for its board's page and receipts.
  "GET /uploads/:folder/:name": async (ctx) => {
    const uploaded = await request(ctx.app).post(`/api/merchants/${ctx.merchantId}/logo`).set(signedIn(ctx.owner))
      .attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
    if (uploaded.status !== 200) throw new Error(`fixture: logo failed ${uploaded.status}`);
    return {
      req: download(uploaded.body.logoUrl), status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("image/png");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect((res.body as Buffer).equals(PNG)).toBe(true);
      },
    };
  },
  // The landing page's info pack.
  "POST /api/info-pack-leads": () => {
    const created = jest.spyOn(storage, "createInfoPackLead");
    return {
      req: { method: "post", path: "/api/info-pack-leads", body: { name: "Robin Lead", email: "robin.lead@harness.test" } }, status: 201,
      check: (res) => {
        expect(res.body).toEqual({ id: expect.any(Number) });
        // Kept (the in-memory store keeps no leads: the call is what is checked), and the platform's admin is told.
        expect(created.mock.calls).toEqual([[{ name: "Robin Lead", email: "robin.lead@harness.test" }]]);
        expect(sentTo(config.admin.email!).map((message) => message.subject)).toEqual(["New info pack request from Robin Lead"]);
      },
    };
  },
};

const ROWS = familyRows("public");
const SERVED = ownServedPairs(ROWS);

/**
 * Who each route serves, stated by hand. The matrix derives it from the reviews; the two must agree, so
 * a review that stopped naming a caller (or started naming one) cannot quietly drop or add a case here.
 */
const ANYONE: OwnServedCaller[] = ["signed-out"];
const SERVED_BY: Record<string, OwnServedCaller[]> = {
  "GET /robots.txt": ANYONE,
  "GET /sitemap.xml": ANYONE,
  "GET /.well-known/apple-developer-merchantid-domain-association": ANYONE,
  "GET /nfc/:merchantId/stone/:stoneId": ANYONE,
  "GET /nfc/:merchantId": ANYONE,
  "GET /api/merchants/:id/qr": ANYONE,
  "GET /api/merchants/:id/stone/:stoneId/qr": ANYONE,
  "GET /api/merchants/:id/stone/:stoneId/brand": ANYONE,
  "GET /api/merchants/:id/active-transaction": ["signed-out", "owner", "member", "platform-admin"],
  "GET /api/merchants/:id/events": ["signed-out", "owner", "member", "platform-admin"],
  "GET /api/nfc/capabilities": ANYONE,
  "GET /api/windcave/env": ANYONE,
  "GET /api/push/capabilities": ANYONE,
  "GET /api/push/vapid-key": ANYONE,
  "GET /api/billing/card/callback": ANYONE,
  "POST /api/billing/card/callback": ANYONE,
  "GET /uploads/:folder/:name": ANYONE,
  "POST /api/info-pack-leads": ANYONE,
};

beforeEach(() => {
  resetTestStorage();
  mockSent.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the public pages, a board's pages and the public settings: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves each route to the callers stated", () => {
    expect(ownServedBy(ROWS)).toEqual(SERVED_BY);
  });

  // A loop, not it.each: a matrix serving no one here is the first test's failure, not a file that cannot load.
  for (const [key, caller] of SERVED) it(`${key}, by the ${caller}`, () => expectOwnServed(RECIPES, key, caller));
});
