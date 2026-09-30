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
  openEventStream,
  storage,
  type EventStream,
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
  /** A route with its own gate: the credential its caller brings (a cookie, the scheduler's secret, a key). */
  headers?: Record<string, string>;
  /** A live event stream (read as a browser's EventSource does): the response's body is its first event. */
  stream?: true;
}

/** A response; for a live event stream, its first event as the body and a way to read the next. */
export type ServedResponse = request.Response & { nextEvent?: EventStream["nextEvent"] };

export interface Served {
  req: ServedRequest;
  /** The route's success status. */
  status: number;
  /** What the success did or returned. (Not `then`: that would make each recipe a promise.) */
  check: (res: ServedResponse) => void | Promise<void>;
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

/** Sends a recipe's request, as the signed-in caller when there is one. */
export async function sendServed(ctx: ServedCtx, who: Principal | null, req: ServedRequest) {
  let pending = request(ctx.app)[req.method](req.path);
  if (who) pending = pending.set(bearer(who));
  for (const [name, value] of Object.entries(req.headers ?? {})) pending = pending.set(name, value);
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

/** The served tests (route-matrix-served-<family>.test.ts). */
export type ServedFamily =
  | "account" | "business" | "property" | "trades" | "admin"
  | "sign-in" | "public" | "retail-pay" | "checkout" | "provider";

/**
 * Which served test holds which routes: its routes' gate and key pattern. Every route that serves a caller
 * falls in exactly one family (route-matrix.test.ts), and each family's test has a request for every one
 * of its routes, so a new route cannot arrive with its allowed callers untested.
 */
export const SERVED_FAMILIES: Record<ServedFamily, { gate: MatrixGate; family: RegExp }> = {
  account: {
    gate: "session",
    family: /^[A-Z]+ \/api\/(auth\/(me|sign-out-everywhere|logout)$|tutorial\/|push\/|subscription|team|billing\/|board-builder\/|invoice-documents\/)/,
  },
  business: { gate: "session", family: /^[A-Z]+ \/api\/(merchants|transactions)(\/|$)/ },
  property: { gate: "session", family: /^[A-Z]+ \/api\/property\// },
  trades: { gate: "session", family: /^[A-Z]+ \/api\/trades\// },
  admin: { gate: "admin", family: /^[A-Z]+ \/api\/admin\// },
  "sign-in": { gate: "own", family: /^[A-Z]+ \/api\/(auth\/|admin\/auth\/login$|merchants\/signup$|team\/accept-invite$)/ },
  public: {
    gate: "own",
    family: /^[A-Z]+ \/(robots\.txt|sitemap\.xml|\.well-known\/|nfc\/|uploads\/|api\/(merchants\/:id\/|nfc\/capabilities|windcave\/env|push\/(capabilities|vapid-key)|billing\/card\/callback|info-pack-leads))/,
  },
  "retail-pay": { gate: "own", family: /^[A-Z]+ \/api\/(pay\/(t\/|return\/)|transactions\/:id|split-payments\/:id|windcave\/callback)/ },
  checkout: { gate: "own", family: /^[A-Z]+ \/api\/(checkout\/|trades\/quotes\/token\/)/ },
  provider: {
    gate: "own",
    family: /^[A-Z]+ \/api\/(pay\/notification\/|windcave\/(notification|rent-notification|trades-notification)$|billing\/card\/notification$|webhooks\/|internal\/cron|v1\/)/,
  },
};

/** A served test's routes: the matrix's rows of its family, each served to at least one caller. */
export function familyRows(name: ServedFamily) {
  const { gate, family } = SERVED_FAMILIES[name];
  return gate === "own" ? ownServedRows(family) : servedRows(family, gate);
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
  await expectSuccess(ctx, who, caller, served);
}

async function expectSuccess(ctx: ServedCtx, who: Principal | null, caller: string, served: Served) {
  if (served.req.stream) return expectStreamServed(ctx, who, caller, served);
  const res = await sendServed(ctx, who, served.req);
  expect({ caller, status: res.status, body: res.status === served.status ? "…" : res.body })
    .toEqual({ caller, status: served.status, body: "…" });
  await served.check(res);
}

/** A live event stream is served when it opens with the route's status; the check reads its events. */
async function expectStreamServed(ctx: ServedCtx, who: Principal | null, caller: string, served: Served) {
  const stream = await openEventStream(ctx.app, served.req.path, { ...(who ? bearer(who) : {}), ...served.req.headers });
  try {
    expect({ caller, status: stream.status }).toEqual({ caller, status: served.status });
    const first = await stream.nextEvent();
    // Not a supertest response: only what a stream has (its status, headers, events).
    await served.check({ status: stream.status, headers: stream.headers, body: first, nextEvent: stream.nextEvent } as unknown as ServedResponse);
  } finally {
    await stream.close();
  }
}

// ── The routes with their own gates ──

/**
 * The callers a route with its own gate serves, each named by a branch of its review: anyone with no
 * sign-in (a public page, a board's page, a sale's number, sign-in itself), a link's holder, the
 * provider, the scheduler, an ecommerce key; and on the two routes a business also reads signed in
 * (its open sale, its live updates), the business's logins.
 */
export type OwnServedCaller = Extract<
  MatrixCaller,
  "signed-out" | "link-holder" | "provider" | "scheduler" | "api-key" | "owner" | "member" | "platform-admin"
>;
export const OWN_SERVED_CALLERS: OwnServedCaller[] = [
  "signed-out", "link-holder", "provider", "scheduler", "api-key", "owner", "member", "platform-admin",
];

/** An own-gate route's recipe: its request brings the caller's own credential (headers, cookie, token, key). */
export type OwnServedRecipe = (ctx: ServedCtx, caller: OwnServedCaller) => Promise<Served> | Served;

/** The matrix's own-gate rows of a family (by route key), each served to at least one caller. */
export function ownServedRows(family: RegExp) {
  return Object.entries(ROUTE_MATRIX).filter(([key, row]) =>
    row.gate === "own" && family.test(key) && OWN_SERVED_CALLERS.some((caller) => row.answers[caller] === "allowed"));
}

/** Every (route, caller) the matrix answers "allowed" among own-gate rows. */
export function ownServedPairs(rows: ReturnType<typeof ownServedRows>): Array<[string, OwnServedCaller]> {
  return rows.flatMap(([key, row]) =>
    OWN_SERVED_CALLERS.filter((caller) => row.answers[caller] === "allowed").map((caller): [string, OwnServedCaller] => [key, caller]));
}

/** Who each own-gate route among the rows serves, as the matrix records it. */
export function ownServedBy(rows: ReturnType<typeof ownServedRows>): Record<string, OwnServedCaller[]> {
  return Object.fromEntries(rows.map(([key, row]) => [key, OWN_SERVED_CALLERS.filter((caller) => row.answers[caller] === "allowed")]));
}

/** Runs one own-gate (route, caller): signed in only for the business's logins, else as its recipe says. */
export async function expectOwnServed(recipes: Record<string, OwnServedRecipe>, key: string, caller: OwnServedCaller) {
  const ctx = await servedContext();
  const served = await recipes[key](ctx, caller);
  const who = caller === "owner" || caller === "member" || caller === "platform-admin" ? principalFor(ctx, caller) : null;
  await expectSuccess(ctx, who, caller, served);
}
