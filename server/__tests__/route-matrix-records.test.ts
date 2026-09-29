import "./support/test-env";

// Refund initiation checks its capability flag first (503); with it on, the record check is observed.
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import crypto from "crypto";
import request from "supertest";
import { ROUTE_MATRIX } from "../route-matrix";
import * as windcave from "../windcave";
import {
  bearer,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  storageSnapshot,
  type Principal,
} from "./support/http-harness";

/**
 * R1-T3 (plan C10): a route that reads one record by id answers another business's record exactly as
 * it answers a missing one (P2.2's tenant-safe 404): the same status and body, and nothing changes. The
 * owner's own request for the record is the positive control. The property and trades record routes are
 * held to the same rule by their batch tests (c10-batch-6c-property, c10-batch-6d-trades).
 */

interface Ctx {
  app: any;
  owner: Principal;
  other: Principal;
  merchantId: number;
}
interface Req {
  method: "get" | "post" | "put" | "delete";
  path: string;
  body?: Record<string, unknown>;
}
type Recipe = { make: (ctx: Ctx) => Promise<string>; ask: (id: string) => Req; missing: string };

const email = (who: string) => `${who}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const sale = (status: string) => async (ctx: Ctx) =>
  String((await storage.createTransaction({
    merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status, paymentMethod: "cash", splitEnabled: false,
  } as any)).id);
const invited = async (ctx: Ctx) => {
  // A seat to invite into: the team plan (a new business is on solo, the owner's one seat).
  await storage.getOrCreateSubscription(ctx.merchantId);
  await storage.changeSubscriptionPlan(ctx.merchantId, "team");
  const res = await request(ctx.app).post("/api/team/invite").set(bearer(ctx.owner)).send({ email: email("invitee") });
  if (res.status >= 300) throw new Error(`fixture: invite failed ${res.status}`);
  return String(res.body.member.id);
};
const teammate = async (ctx: Ctx) => String((await createMemberPrincipal(ctx.merchantId)).user.id);
const PDF = Buffer.from("%PDF-1.4\n%matrix\n");
const document = async (ctx: Ctx) => {
  const res = await request(ctx.app).post("/api/property/invoices/document").set(bearer(ctx.owner))
    .attach("document", PDF, { filename: "bill.pdf", contentType: "application/pdf" });
  if (res.status >= 300) throw new Error(`fixture: upload failed ${res.status}`);
  return String(res.body.documentUrl).split("/").pop()!;
};

/** Per route: how to make the business's record, how to ask for one, and an id no record has. */
const RECIPES: Record<string, Recipe> = {
  "POST /api/transactions/:id/cancel": {
    make: sale("pending"), ask: (id) => ({ method: "post", path: `/api/transactions/${id}/cancel` }), missing: "999999",
  },
  "POST /api/transactions/:transactionId/refunds": {
    make: sale("completed"),
    ask: (id) => ({ method: "post", path: `/api/transactions/${id}/refunds`, body: { refundAmount: "1.00", refundReason: "Changed their mind" } }),
    missing: "999999",
  },
  "GET /api/transactions/:transactionId/refunds": {
    make: sale("completed"), ask: (id) => ({ method: "get", path: `/api/transactions/${id}/refunds` }), missing: "999999",
  },
  "POST /api/team/:userId/resend": { make: invited, ask: (id) => ({ method: "post", path: `/api/team/${id}/resend` }), missing: "999999" },
  "DELETE /api/team/:userId/invite": { make: invited, ask: (id) => ({ method: "delete", path: `/api/team/${id}/invite` }), missing: "999999" },
  "PUT /api/team/:userId/status": {
    make: teammate, ask: (id) => ({ method: "put", path: `/api/team/${id}/status`, body: { status: "disabled" } }), missing: "999999",
  },
  "DELETE /api/team/:userId": { make: teammate, ask: (id) => ({ method: "delete", path: `/api/team/${id}` }), missing: "999999" },
  "GET /api/invoice-documents/:name": {
    make: document, ask: (name) => ({ method: "get", path: `/api/invoice-documents/${name}` }),
    missing: `invoice-${Date.now()}-0123456789abcdef.pdf`,
  },
};

async function send(ctx: Ctx, who: Principal, req: Req) {
  let pending = request(ctx.app)[req.method](req.path).set(bearer(who));
  if (req.body) pending = pending.send(req.body);
  return pending;
}

/** The record routes outside property and trades, whose other-business answer is the missing record's. */
const ROWS = Object.entries(ROUTE_MATRIX).filter(([key, row]) =>
  row.answers["other-owner"] === 404 && !key.includes("/api/property/") && !key.includes("/api/trades/"));

beforeEach(() => {
  resetTestStorage();
  // A refund reaching the provider is answered as a failure here: no live system (R1-T1).
  jest.spyOn(windcave, "createWindcaveRefund").mockResolvedValue({ success: false, error: "stubbed" } as any);
});

afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — another business's record is answered as a missing one", () => {
  it("has a recipe for every such route", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it.each(ROWS)("%s", async (key, row) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const ctx: Ctx = { app, owner, other, merchantId: owner.merchantId };
    const recipe = RECIPES[key];
    const id = await recipe.make(ctx);

    const before = storageSnapshot();
    const theirs = await send(ctx, other, recipe.ask(id));
    const missing = await send(ctx, other, recipe.ask(recipe.missing));
    expect({ status: theirs.status, body: theirs.body }).toEqual({ status: row.answers["other-owner"], body: missing.body });
    expect(missing.status).toBe(row.answers["other-owner"]);
    expect(storageSnapshot()).toBe(before);

    // The positive control: the owner's own request for the record is not refused as a stranger's.
    const served = await send(ctx, owner, recipe.ask(id));
    expect({ refused: [401, 403, 404].includes(served.status), status: served.status }).toEqual({ refused: false, status: served.status });
  });
});
