/**
 * R1-T3 (plan C10): what the "allowed callers succeed" tests share (route-matrix-served-*.test.ts).
 * Each family's test states, per route, a real request each allowed caller is served, the route's
 * success status and what the success did or returned; this module runs them against the matrix.
 *
 * Import after "./test-env" (and any capability flags), as the harness itself.
 */
import request from "supertest";
import { ROUTE_MATRIX, type MatrixCaller, type MatrixGate } from "../../route-matrix";
import {
  bearer,
  createAdminPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  storage,
  type Principal,
} from "./http-harness";

/** The signed-in callers a gated route can serve. */
export type ServedCaller = Extract<MatrixCaller, "owner" | "member" | "platform-admin">;
export const SERVED_CALLERS: ServedCaller[] = ["owner", "member", "platform-admin"];

export interface ServedCtx {
  app: any;
  owner: Principal;
  /** A teammate of the owner's business (the business moves to the team plan for its seat). */
  member: Principal;
  admin: Principal;
  merchantId: number;
}

export interface ServedRequest {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  body?: Record<string, unknown>;
  /** A file sent as multipart form data. */
  attach?: { field: string; bytes: Buffer; filename: string; contentType: string };
  /** A download: its bytes are the body. */
  binary?: true;
}

export interface Served {
  req: ServedRequest;
  /** The route's success status. */
  status: number;
  /** What the success did or returned. (Not `then`: that would make each recipe a promise.) */
  check: (res: request.Response) => void | Promise<void>;
}

export type ServedRecipe = (ctx: ServedCtx, who: Principal, caller: ServedCaller) => Promise<Served> | Served;

export async function servedContext(): Promise<ServedCtx> {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const member = await createMemberPrincipal(owner.merchantId);
  return { app, owner, member, admin: createAdminPrincipal(), merchantId: owner.merchantId };
}

export function principalFor(ctx: ServedCtx, caller: ServedCaller): Principal {
  return { owner: ctx.owner, member: ctx.member, "platform-admin": ctx.admin }[caller];
}

/** Reads a download's bytes (supertest parses only text and JSON). */
function bytes(res: any, done: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
}

export async function sendServed(ctx: ServedCtx, who: Principal, req: ServedRequest) {
  let pending = request(ctx.app)[req.method](req.path).set(bearer(who));
  if (req.attach) pending = pending.attach(req.attach.field, req.attach.bytes, { filename: req.attach.filename, contentType: req.attach.contentType });
  else if (req.body) pending = pending.send(req.body);
  if (req.binary) pending = pending.buffer(true).parse(bytes);
  return pending;
}

/** Short requests as one caller, for fixtures and for reading back what a success did. */
export function as(ctx: ServedCtx, who: Principal) {
  return {
    get: (path: string) => request(ctx.app).get(path).set(bearer(who)),
    post: (path: string, body: Record<string, unknown> = {}) => request(ctx.app).post(path).set(bearer(who)).send(body),
    put: (path: string, body: Record<string, unknown>) => request(ctx.app).put(path).set(bearer(who)).send(body),
    delete: (path: string) => request(ctx.app).delete(path).set(bearer(who)),
  };
}

export const CARD = { cardId: "matrix-card", brand: "visa", last4: "4242", expiry: "1230" };

/** A card on file and a paid month, as the card setup leaves them (its charge approved): paid access. */
export async function paidMonth(ctx: Pick<ServedCtx, "merchantId">) {
  await storage.getOrCreateSubscription(ctx.merchantId);
  await storage.bindSubscriptionCardSession(ctx.merchantId, "matrix-paid-session");
  const done = await storage.completeSubscriptionCardSetup(
    ctx.merchantId, "matrix-paid-session",
    { windcaveCardId: CARD.cardId, brand: CARD.brand, last4: CARD.last4, expiry: CARD.expiry },
    async () => ({ success: true as const, approved: true, windcaveTransactionId: "matrix-first-month" }),
  );
  if (!done.ok) throw new Error(`fixture: paid month failed ${done.reason}`);
}

/** The matrix's rows of a family (by route key) behind the given gate, served to at least one caller. */
export function servedRows(family: RegExp, gate: MatrixGate) {
  return Object.entries(ROUTE_MATRIX).filter(([key, row]) =>
    row.gate === gate && family.test(key) && SERVED_CALLERS.some((caller) => row.answers[caller] === "allowed"));
}

/** Every (route, caller) the matrix answers "allowed" among the rows. */
export function servedPairs(rows: ReturnType<typeof servedRows>): Array<[string, ServedCaller]> {
  return rows.flatMap(([key, row]) =>
    SERVED_CALLERS.filter((caller) => row.answers[caller] === "allowed").map((caller): [string, ServedCaller] => [key, caller]));
}

/** The routes among the rows the matrix serves to one caller. */
export function servedTo(rows: ReturnType<typeof servedRows>, caller: ServedCaller): string[] {
  return rows.filter(([, row]) => row.answers[caller] === "allowed").map(([key]) => key).sort();
}

/** Runs one (route, caller): the request is served with the route's success status, then its check. */
export async function expectServed(recipes: Record<string, ServedRecipe>, key: string, caller: ServedCaller) {
  const ctx = await servedContext();
  const who = principalFor(ctx, caller);
  const served = await recipes[key](ctx, who, caller);
  const res = await sendServed(ctx, who, served.req);
  expect({ caller, status: res.status, body: res.status === served.status ? "…" : res.body })
    .toEqual({ caller, status: served.status, body: "…" });
  await served.check(res);
}
