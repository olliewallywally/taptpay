// R1-T10c-1 — the device matrix as one gate.
//
// The real pages on the real routes, in a real browser, at the four sizes the plan names, signed in
// through the real login route. No dev server, no database, no request off this machine.
//
// Why it exists: the older device gates sign their pages in the way the app did before R1-T4 phase E
// (a token in localStorage and their own answer to /api/auth/me). The app now asks
// GET /api/auth/session with its cookie, so those gates look at "We couldn't check your session"
// and can still say "passed". Here a cell passes only when it shows a mark of ITS OWN screen.
//
// What it stands up, in this one process:
// - this tree's app (server/app.ts and the real routes) over https on a loopback port, with a
//   certificate made here for this run, in-memory storage, no ambient credential, simulated email;
// - one business in good standing with retail rows in that storage, and property and trades rows
//   behind the eleven storage reads those screens' lists come from (the in-memory storage has none
//   of its own). The routes, their checks and their replies are the real ones; for property and
//   trades the storage underneath is not exercised.
//
// It opens the merchant's screens (22 at each size) and the pages outside the merchant frame: the
// landing page, sign-in, sign-up, the password pages, the info and legal pages, onboarding; and what a
// customer opens: a sale's own link at checkout, at the split page and at its receipt, a payment
// board with no sale, with an open sale (which moves on to checkout) and with one just paid, a board
// sale's checkout, split page and receipt by its number, and the two notices.
//
// What each cell (a screen at a size) must show:
// - the address it was sent to, still (not the login page);
// - a mark of its own screen: a target of that screen's own tutorial, for that device class. Where
//   none of the tutorial's own targets is on the page, its named fallback is taken (never a bare
//   element such as "main"), and the cell is listed apart: that is a finding about the tutorial;
// - the shell the plan expects: none of the desktop frame on a phone; the frame filling the window
//   on a tablet; a centred, rounded frame holding the 1180x880 canvas on a desktop, short or not;
//   and no merchant frame at any size on a page outside it, which is known by a mark of its own
//   (a control or the words only that page has);
// - no page error, no console error, no failed request to this app, with no allowance: where
//   nobody is signed in, GET /api/auth/session answers 200 and says so, and nothing else is asked;
// - every /api address it asks for is one the server registers. The server answers an address it
//   does not have with the app's own page and a 200 (the fallback in server/vite.ts serveStatic), so
//   a wrong address would not show as a failed request: each one is held to the route policy instead;
// - and it lists what the page asked of any other machine (nothing is sent; an empty reply is given).
//
//   npx vite build --outDir "$PWD/<build dir>"
//   node --import tsx scripts/verify-r1-t10-device-matrix.ts <evidence dir> "$PWD/<build dir>"
//     [--context phone|tablet|desktop|desktop-short] [--surface /path] [--self-test] [--measure <selector>]
//
// --measure records the box of the first element a selector finds in each cell (results.json), to
// compare a screen before and after a change.
//
// --self-test plants one fault at a time (signed out, the wrong screen or page, a console error, a
// page error, a failed request, an address the server does not have, the wrong shell) and exits 0
// only when every one is caught and the unplanted controls pass. Exits 1 when a cell fails. Chromium on Linux is not Safari on an iPhone:
// real devices are the owner's check.
import express from "express";
import bcrypt from "bcrypt";
import https from "node:https";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type BrowserContext, type Page, type Request as BrowserRequest } from "playwright";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";
import { tutorialStepsForDevice } from "../client/src/features/tutorial/tutorial-registry";
import type { TutorialPageKey } from "../shared/tutorial";
import { measureGeometry, GEOMETRY_SOURCE_SHA256 } from "./device-geometry.mjs";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(name);
  if (at < 0) return null;
  const value = argv[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  argv.splice(at, 2);
  return value;
};
const ONLY_CONTEXT = flag("--context");
const ONLY_SURFACE = flag("--surface");
const MEASURE = flag("--measure");
const SELF_TEST = argv.includes("--self-test") ? (argv.splice(argv.indexOf("--self-test"), 1), true) : false;
const out = argv[0];
const builtClient = argv[1];
if (argv.length !== 2 || !out || !builtClient || !existsSync(path.join(builtClient, "index.html"))) {
  throw new Error("usage: verify-r1-t10-device-matrix.ts <evidence dir> <absolute built client dir>   (npx vite build --outDir <that dir> first)");
}
if (ONLY_CONTEXT && !["phone", "tablet", "desktop", "desktop-short"].includes(ONLY_CONTEXT)) {
  throw new Error(`unknown --context: ${ONLY_CONTEXT}`);
}
if (SELF_TEST && (ONLY_CONTEXT || ONLY_SURFACE)) throw new Error("--self-test cannot be combined with matrix filters");
mkdirSync(out, { recursive: true });

const OWNER_PASSWORD = "Matrix-password-1";
const OWNER_EMAIL = "owner@matrix.test";
const ADMIN_EMAIL = "admin@matrix.test";
const ADMIN_PASSWORD = "Matrix-admin-password-1";

// ── The app, in this process ─────────────────────────────────────────────────────────────────────
const freePort = () => new Promise<number>((resolve) => {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const found = (probe.address() as AddressInfo).port;
    probe.close(() => resolve(found));
  });
});
const port = await freePort();
const base = `https://localhost:${port}`;
const certDir = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "taptpay-matrix-"));
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"),
], { stdio: "ignore" });
const tls = { key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) };
// The browser is told to trust this run's certificate, by its key and no other. Telling it instead to
// overlook certificate errors made the first page of a fresh browser lose its stylesheet about one run
// in ten (net::ERR_TOO_MANY_RETRIES while the exception was still being made), and come up unstyled.
const certKeyHash = execFileSync("sh", ["-c",
  `openssl x509 -pubkey -noout -in "${path.join(certDir, "cert.pem")}" | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`,
], { encoding: "utf8" }).trim();

// A clean environment before the app reads its configuration.
for (const key of Object.keys(process.env)) {
  if (!["PATH", "HOME", "TMPDIR", "PLAYWRIGHT_CHROMIUM_PATH"].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "development",
  APP_ENV: "development",
  ENV_VALIDATION_MODE: "audit",
  PAYMENT_MODE: "disabled",
  EMAIL_PROVIDER: "simulation",
  JWT_SECRET: "device-matrix-not-a-real-secret-0001",
  PUBLIC_ORIGIN: base,
  ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH: bcrypt.hashSync(ADMIN_PASSWORD, 4),
});

const { createApp } = await import("../server/app");
const { registerRoutes } = await import("../server/routes");
const { createGlobalErrorHandler } = await import("../server/http-error-handler");
const { storage } = await import("../server/storage");
const { createUser } = await import("../server/auth");
const { ROUTE_POLICY } = await import("../server/route-policy");

/** The server's own registrations, to tell an address it has from one it would answer with the app's page. */
const REGISTERED = Object.entries(ROUTE_POLICY as Record<string, { method: string; path: string }>)
  .map(([key, entry]) => ({ key, method: entry.method, segments: entry.path.split("/") }));
function routeFor(method: string, pathname: string): string | null {
  const segments = pathname.split("/");
  const found = REGISTERED.find((route) => (route.method === method || route.method === "ALL")
    && route.segments.length === segments.length
    && route.segments.every((segment, index) => (segment.startsWith(":") ? segments[index] !== "" : segment === segments[index])));
  return found?.key ?? null;
}

const requestLog: string[] = [];
const app = createApp({ writeRequestLog: (line: string) => requestLog.push(line) });
await registerRoutes(app);
app.use(createGlobalErrorHandler());
// As server/vite.ts serveStatic does in production: the built files, and the app's page for any other address.
app.use(express.static(builtClient));
app.use("*", (_req, res) => res.sendFile(path.join(builtClient, "index.html")));
const server = https.createServer(tls, app);
await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

// ── One business in good standing, with rows for all three verticals ─────────────────────────────
const DAY = 24 * 3600_000;
const daysAgo = (days: number, hour = 10) => { const at = new Date(Date.now() - days * DAY); at.setHours(hour, 15, 0, 0); return at; };
const inDays = (days: number) => new Date(Date.now() + days * DAY);
const uuid = (group: number, n: number) => `${String(group).repeat(8)}-${String(group).repeat(4)}-4${String(group).repeat(3)}-8${String(group).repeat(3)}-${String(n).padStart(12, "0")}`;

const merchant = await storage.createMerchant({
  name: "Matrix Owner", businessName: "Matrix Coffee", businessType: "limited-company",
  email: OWNER_EMAIL, phone: "021 555 0100", address: "1 Matrix Street, Auckland",
} as any);
const merchantId = merchant.id as number;
await storage.updateMerchantStatus(merchantId, "active");
await storage.updateMerchant(merchantId, { onboardingCompleted: true, tutorialAutoEnabled: false } as any);
await createUser(OWNER_EMAIL, OWNER_PASSWORD, merchantId, "merchant");
// A card on file and a paid month, as the server's own served tests make one (support/matrix-served.ts).
await storage.getOrCreateSubscription(merchantId);
await storage.bindSubscriptionCardSession(merchantId, "matrix-paid-session");
const paid = await storage.completeSubscriptionCardSetup(
  merchantId, "matrix-paid-session",
  { windcaveCardId: "matrix-card", brand: "visa", last4: "4242", expiry: "1230" },
  async () => ({ success: true as const, approved: true, windcaveTransactionId: "matrix-first-month" }),
);
if (!paid.ok) throw new Error(`seed: the paid month failed: ${paid.reason}`);

// A second business that has signed up and not finished onboarding: the one page it is sent to.
const NEW_EMAIL = "new@matrix.test";
const newcomer = await storage.createMerchant({
  name: "Matrix Newcomer", businessName: "Matrix New Business", businessType: "sole-trader",
  email: NEW_EMAIL, phone: "021 555 0101", address: "2 Matrix Street, Auckland",
} as any);
await storage.updateMerchantStatus(newcomer.id as number, "active");
await createUser(NEW_EMAIL, OWNER_PASSWORD, newcomer.id as number, "merchant");

// Retail: in the in-memory storage itself.
for (const [name, cost, description, emoji] of [
  ["flat white", "5.50", "double shot", "☕"], ["latte", "6.00", "house blend", "☕"], ["big brunch", "24.00", "all day", "🍳"],
  ["muffin", "6.00", "baked today", "🧁"], ["toastie", "9.00", "ham and cheese", "🥪"],
] as const) {
  await storage.createStockItemForMerchant(merchantId, { name, cost, description, emoji } as any);
}
const counter = await storage.createTaptStone({ merchantId, name: "Counter", stoneNumber: 1 } as any);
await storage.createTaptStone({ merchantId, name: "Courtyard", stoneNumber: 2 } as any);
for (const [itemName, price, status, paymentMethod] of [
  ["flat white", "5.50", "completed", "qr_code"], ["latte", "6.00", "completed", "qr_code"], ["muffin", "6.00", "pending", "qr_code"],
  ["toastie", "9.00", "failed", "qr_code"], ["flat white", "5.50", "completed", "qr_code"], ["big brunch", "24.00", "completed", "qr_code"],
  ["latte", "6.00", "completed", "qr_code"],
] as const) {
  // A sale is made pending, said outright: the in-memory storage has no default for it, as the database has.
  const sale = await storage.createTransactionForMerchant(merchantId, { merchantId, itemName, price, paymentMethod, status: "pending", taptStoneId: counter.id } as any);
  if (status !== "pending") await storage.updateTransactionStatusForMerchant(sale.id, merchantId, status);
}

// What a customer opens: sales with a link of their own, and sales on boards kept for this.
const { createPaymentCredential } = await import("../server/payment-credential");
async function sale(itemName: string, price: string, status: string, where: { board?: number; link?: true; shared?: true }) {
  const credential = where.link ? createPaymentCredential() : null;
  const made = await storage.createTransactionForMerchant(merchantId, {
    merchantId, itemName, price, paymentMethod: "qr_code", status: "pending",
    ...(where.board ? { taptStoneId: where.board } : {}), ...(credential ? { paymentTokenHash: credential.hash } : {}), ...(where.shared ? { splitEnabled: true } : {}),
  } as any);
  if (status !== "pending") await storage.updateTransactionStatusForMerchant(made.id, merchantId, status);
  return { id: made.id as number, token: credential?.rawToken ?? "" };
}
const linkOpen = await sale("flat white", "5.50", "pending", { link: true });
const linkShared = await sale("table of four", "120.00", "pending", { link: true, shared: true });
const linkPaid = await sale("big brunch", "24.00", "completed", { link: true });
const quiet = await storage.createTaptStone({ merchantId, name: "Window", stoneNumber: 3 } as any);
const busy = await storage.createTaptStone({ merchantId, name: "Patio", stoneNumber: 4 } as any);
const sharing = await storage.createTaptStone({ merchantId, name: "Bar", stoneNumber: 5 } as any);
const justPaid = await storage.createTaptStone({ merchantId, name: "Garden", stoneNumber: 6 } as any);
const boardOpen = await sale("long black", "5.00", "pending", { board: busy.id });
const boardShared = await sale("sharing platter", "60.00", "pending", { board: sharing.id, shared: true });
const boardPaid = await sale("scone", "7.00", "completed", { board: justPaid.id });

// Property and trades: rows behind the storage reads their screens' lists come from.
const TENANTS = [
  { id: uuid(1, 1), firstName: "Josh", lastName: "Smith", propertyAddress: "12 Kauri Road", phone: "0221111111", email: "josh@example.test" },
  { id: uuid(1, 2), firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", phone: "0222222222", email: "mia@example.test" },
  { id: uuid(1, 3), firstName: "Tane", lastName: "Walker", propertyAddress: "88 Harbour View", phone: "0223333333", email: "tane@example.test" },
  { id: uuid(1, 4), firstName: "Ruby", lastName: "Nolan", propertyAddress: "12 Kauri Road", phone: "0224444444", email: "ruby@example.test" },
].map((row) => ({ ...row, merchantId, preferredChannel: "email", status: "active", notes: null, createdAt: daysAgo(40), updatedAt: daysAgo(40) }));
const RENT = [
  [1, 1, 65000, "paid", -6], [2, 2, 80000, "paid", -5], [3, 3, 52000, "paid_external", -3], [4, 2, 80000, "overdue", -4],
  [5, 3, 52000, "overdue", -9], [6, 1, 65000, "dispatched", 2], [7, 2, 80000, "dispatched", 5], [8, 3, 60000, "dispatched", 4],
  [9, 4, 61000, "pending_dispatch", 6], [10, 4, 24000, "dispatched", 3],
].map(([n, tenant, amountCents, status, due]) => ({
  id: uuid(2, n as number), merchantId, tenantProfileId: uuid(1, tenant as number), amountCents, status, kind: "rent",
  token: `matrix-rent-${n}`, deliveryChannel: "email", dueAt: due as number < 0 ? daysAgo(-(due as number)) : inDays(due as number),
  paidAt: String(status).startsWith("paid") ? daysAgo(-(due as number)) : null, createdAt: daysAgo(12), updatedAt: daysAgo(1),
  splitEnabled: false, splitCount: 1, splitPaidCount: 0,
}));
const RENT_SCHEDULES = [[1, 1, 65000, 2], [2, 2, 80000, 5]].map(([n, tenant, amountCents, next]) => ({
  id: uuid(3, n), merchantId, tenantProfileId: uuid(1, tenant), amountCents, frequency: "weekly", deliveryChannel: "email",
  status: "active", startDate: daysAgo(70), nextRunDate: inDays(next), createdAt: daysAgo(70),
}));
const CLIENTS = [
  { id: uuid(5, 1), firstName: "Karen", lastName: "Vaile", email: "karen@example.test", phone: "0212223333", siteAddress: "18 Rimu Street" },
  { id: uuid(5, 2), firstName: "Hemi", lastName: "Ngata", email: "hemi@example.test", phone: "0213334444", siteAddress: "402 Beach Road" },
  { id: uuid(5, 3), firstName: "Dot", lastName: "Fairweather", email: "dot@example.test", phone: "0214445555", siteAddress: "7 Miro Lane" },
].map((row) => ({ ...row, merchantId, preferredChannel: "email", status: "active", notes: null, createdAt: daysAgo(40), updatedAt: daysAgo(40) }));
const JOBS = [
  [1, 1, 48000, "dispatched", 3], [2, 2, 126500, "overdue", -5], [3, 3, 32000, "paid", -8], [4, 1, 91000, "dispatched", 6], [5, 2, 21500, "pending_dispatch", 9],
].map(([n, client, amountCents, status, due]) => ({
  id: uuid(6, n as number), merchantId, clientProfileId: uuid(5, client as number), quoteId: null, kind: "full", amountCents, status,
  token: `matrix-job-${n}`, deliveryChannel: "email", dueAt: due as number < 0 ? daysAgo(-(due as number)) : inDays(due as number),
  paidAt: status === "paid" ? daysAgo(-(due as number)) : null, createdAt: daysAgo(14), updatedAt: daysAgo(1),
  description: ["gutter clean", "bathroom reseal", "tap washer", "deck stain", "callout"][(n as number) - 1],
}));
const QUOTES = [[1, 1, 145000, "sent"], [2, 3, 61000, "accepted"]].map(([n, client, totalCents, status]) => ({
  id: uuid(7, n as number), merchantId, clientProfileId: uuid(5, client as number), token: `matrix-quote-${n}`, status,
  lineItems: [{ description: "Labour and materials", qty: 1, unitPriceCents: totalCents, lineTotalCents: totalCents }],
  subtotalCents: totalCents, gstCents: 0, gstMode: null, totalCents, depositEnabled: false, depositType: null, depositValue: null,
  depositCents: 0, deliveryChannel: "email", createdAt: daysAgo(4), updatedAt: daysAgo(3),
}));
const JOB_SCHEDULES = [{
  id: uuid(8, 1), merchantId, clientProfileId: uuid(5, 1), amountCents: 50000, frequency: "weekly", deliveryChannel: "email",
  startDate: daysAgo(70), nextRunDate: inDays(3), status: "active", createdAt: daysAgo(70),
}];
{
  const live = storage as any;
  const mine = (id: unknown) => id === merchantId;
  const stand = (name: string, rows: (...args: any[]) => unknown, merchantArg: number) => {
    const real = live[name].bind(live);
    live[name] = async (...args: any[]) => (mine(args[merchantArg]) ? rows(...args) : real(...args));
  };
  stand("getTenantProfilesByMerchant", () => TENANTS, 0);
  stand("getTenantProfileForMerchant", (id: string) => TENANTS.find((row) => row.id === id), 1);
  stand("getInvoiceRentRequestsByMerchant", (_m: number, opts?: { tenantProfileId?: string; status?: string }) =>
    RENT.filter((row) => (!opts?.tenantProfileId || row.tenantProfileId === opts.tenantProfileId) && (!opts?.status || row.status === opts.status)), 0);
  stand("getActiveSchedulesByMerchant", () => RENT_SCHEDULES, 0);
  stand("getTransactionEventsByTenantForMerchant", () => [], 1);
  stand("getClientProfilesByMerchant", () => CLIENTS, 0);
  stand("getClientProfileForMerchant", (id: string) => CLIENTS.find((row) => row.id === id), 1);
  stand("getJobInvoicesByMerchant", (_m: number, opts?: { clientProfileId?: string; status?: string }) =>
    JOBS.filter((row) => (!opts?.clientProfileId || row.clientProfileId === opts.clientProfileId) && (!opts?.status || row.status === opts.status)), 0);
  stand("getQuotesByMerchant", (_m: number, opts?: { status?: string }) => QUOTES.filter((row) => !opts?.status || row.status === opts.status), 0);
  stand("getJobSchedulesByMerchant", () => JOB_SCHEDULES, 0);
  stand("getJobEventsByClientForMerchant", () => [], 1);
}

// ── The sizes and the screens ────────────────────────────────────────────────────────────────────
type DeviceClass = "mobile" | "tablet" | "desktop";
interface Size { name: string; width: number; height: number; touch: boolean; deviceClass: DeviceClass }
const SIZES: Size[] = [
  { name: "phone", width: 390, height: 844, touch: true, deviceClass: "mobile" },
  { name: "tablet", width: 1194, height: 834, touch: true, deviceClass: "tablet" },
  { name: "desktop", width: 1440, height: 900, touch: false, deviceClass: "desktop" },
  // Decision D10: a short window with a mouse is the desktop, never the phone.
  { name: "desktop-short", width: 1440, height: 650, touch: false, deviceClass: "desktop" },
];
type Mode = "retail" | "property" | "trades";
interface Surface { path: string; pageKey: TutorialPageKey; mode: Mode }
/** Every merchant route App.tsx gives a tutorial page to; Settings once per vertical (its chrome follows the vertical). */
const SURFACES: Surface[] = [
  { path: "/dashboard", pageKey: "retail-dashboard", mode: "retail" },
  { path: "/terminal", pageKey: "retail-terminal", mode: "retail" },
  { path: "/stack", pageKey: "retail-payment-stack", mode: "retail" },
  { path: "/transactions", pageKey: "retail-transactions", mode: "retail" },
  { path: "/stock", pageKey: "retail-stock", mode: "retail" },
  { path: "/nfc", pageKey: "retail-nfc", mode: "retail" },
  { path: "/board-builder", pageKey: "payment-board-builder", mode: "retail" },
  { path: "/settings", pageKey: "settings", mode: "retail" },
  { path: "/property", pageKey: "property-dashboard", mode: "property" },
  { path: "/property/tenants", pageKey: "property-tenants", mode: "property" },
  { path: `/property/tenants/${TENANTS[0].id}`, pageKey: "property-tenant-profile", mode: "property" },
  { path: "/property/terminal", pageKey: "property-terminal", mode: "property" },
  { path: "/property/analytics", pageKey: "property-analytics", mode: "property" },
  { path: "/settings", pageKey: "settings", mode: "property" },
  { path: "/trades", pageKey: "trades-dashboard", mode: "trades" },
  { path: "/trades/clients", pageKey: "trades-clients", mode: "trades" },
  { path: `/trades/clients/${CLIENTS[0].id}`, pageKey: "trades-client-profile", mode: "trades" },
  { path: "/trades/terminal", pageKey: "trades-terminal", mode: "trades" },
  { path: "/trades/quote", pageKey: "trades-quote", mode: "trades" },
  { path: "/trades/recurring", pageKey: "trades-recurring", mode: "trades" },
  { path: "/trades/analytics", pageKey: "trades-analytics", mode: "trades" },
  { path: "/settings", pageKey: "settings", mode: "trades" },
];

/**
 * A page outside the merchant frame: who opens it, and a control or the words only that page has.
 * `name` is what it is called in the output where its address holds a sale's link; `movesTo` is where
 * it is meant to end up when it is not meant to stay.
 */
interface Outside { path: string; who: "nobody" | "a new business" | "admin"; mark: { selector?: string; text?: string }; name?: string; movesTo?: string }
const OUTSIDE: Outside[] = [
  { path: "/", who: "nobody", mark: { selector: "#tp-nav" } },
  { path: "/login", who: "nobody", mark: { selector: '[data-testid="button-login"]' } },
  { path: "/signup", who: "nobody", mark: { text: "start with you" } },
  { path: "/forgot-password", who: "nobody", mark: { selector: 'input[placeholder="Enter your email"]' } },
  // With no token in its address it is its own screen, and says so.
  { path: "/reset-password", who: "nobody", mark: { text: "Invalid Reset Link" } },
  { path: "/check-email", who: "nobody", mark: { text: "Check your email" } },
  { path: "/info", who: "nobody", mark: { text: "info pack" } },
  { path: "/terms", who: "nobody", mark: { text: "1. Service Description" } },
  { path: "/privacy", who: "nobody", mark: { text: "Office of the Privacy Commissioner" } },
  { path: "/onboarding", who: "a new business", mark: { text: "Complete Your Business Profile" } },
  // What a customer opens. A sale with a link of its own:
  { path: `/pay/t/${linkOpen.token}`, name: "/pay/t/:token", who: "nobody", mark: { text: "enter credit card" }, movesTo: `/checkout/t/${linkOpen.token}` },
  { path: `/checkout/t/${linkOpen.token}`, name: "/checkout/t/:token", who: "nobody", mark: { text: "enter credit card" } },
  { path: `/split/t/${linkShared.token}`, name: "/split/t/:token", who: "nobody", mark: { text: "each pays" } },
  { path: `/receipt/t/${linkPaid.token}`, name: "/receipt/t/:token", who: "nobody", mark: { text: "Payment Accepted!" } },
  // A payment board: with no sale; with an open one, which moves on to its checkout; and with one just
  // paid, which the server still hands the page for three minutes and which is not a fault.
  { path: `/pay/${merchantId}/stone/${quiet.id}`, name: "/pay/:id/stone/:stone (no sale)", who: "nobody", mark: { text: "Waiting for Payment" } },
  { path: `/pay/${merchantId}/stone/${busy.id}`, name: "/pay/:id/stone/:stone (an open sale)", who: "nobody", mark: { text: "enter credit card" }, movesTo: `/checkout/${boardOpen.id}` },
  { path: `/pay/${merchantId}/stone/${justPaid.id}`, name: "/pay/:id/stone/:stone (a sale just paid)", who: "nobody", mark: { text: "Waiting for Payment" } },
  // A board's sale by its number:
  { path: `/checkout/${boardOpen.id}`, name: "/checkout/:number", who: "nobody", mark: { text: "enter credit card" } },
  { path: `/split/${boardShared.id}`, name: "/split/:number", who: "nobody", mark: { text: "each pays" } },
  { path: `/receipt/${boardPaid.id}`, name: "/receipt/:number", who: "nobody", mark: { text: "Payment Accepted!" } },
  // The two notices: no board and no link; and a return from the bank this browser did not start.
  { path: `/pay/${merchantId}`, name: "/pay/:id", who: "nobody", mark: { text: "Ask for your payment link" } },
  { path: "/pay/return/not-a-state-this-browser-holds", name: "/pay/return/:state", who: "nobody", mark: { text: "Reopen the original payment link" } },
  // The admin opens these with its own cookie; these pages never use the merchant frame.
  { path: "/admin", who: "admin", mark: { selector: '[data-testid="stat-total-revenue"]' } },
  { path: "/admin/merchants", who: "admin", mark: { selector: '[data-testid="input-search-merchants"]' } },
  { path: `/admin/merchants/${merchantId}`, name: "/admin/merchants/:id", who: "admin", mark: { text: "Account Information" } },
  { path: "/admin/api", who: "admin", mark: { selector: '[data-testid="api-management-unavailable"]' } },
  { path: "/admin/analytics", who: "admin", mark: { text: "Revenue & Platform" } },
  { path: "/admin/web-analytics", who: "admin", mark: { text: "Revenue & Platform" } },
  { path: "/admin/settings", who: "admin", mark: { text: "Settings page coming soon" } },
];

// ── What is read from a page (a string, not a function: tsx wraps nested functions in a helper the page lacks) ──
const FACTS = `(function (selectors) {
  function box(el) { var r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }
  function shown(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
    }
    return true;
  }
  var marks = selectors.map(function (step) {
    var target = null, fallback = null;
    try { target = document.querySelector(step.target); } catch (e) { target = null; }
    try { fallback = step.fallbackTarget ? document.querySelector(step.fallbackTarget) : null; } catch (e) { fallback = null; }
    return { target: step.target, shown: shown(target), fallbackShown: shown(fallback) };
  });
  var viewport = document.querySelector('[data-testid="desktop-frame"]');
  var frame = viewport ? viewport.querySelector(':scope > .tapt-desktop-frame') : null;
  var canvas = document.querySelector('[data-testid="desktop-scaled-canvas"]');
  return {
    path: location.pathname,
    text: document.body.innerText,
    marks: marks,
    window: { width: window.innerWidth, height: window.innerHeight },
    coarse: window.matchMedia("(pointer: coarse)").matches,
    deviceClass: viewport ? viewport.getAttribute("data-device-class") : null,
    frame: frame ? Object.assign(box(frame), { radius: parseFloat(getComputedStyle(frame).borderRadius) || 0, overflow: getComputedStyle(frame).overflow }) : null,
    canvas: canvas ? { width: canvas.style.width, height: canvas.style.height, scale: canvas.getAttribute("data-desktop-scale") } : null,
    running: document.getAnimations().filter(function (a) { var t = a.effect && a.effect.getComputedTiming(); return a.playState === "running" && t && isFinite(t.endTime); }).length
  };
})`;
interface Facts {
  path: string; text: string; marks: Array<{ target: string; shown: boolean; fallbackShown: boolean }>;
  window: { width: number; height: number }; coarse: boolean; deviceClass: string | null;
  frame: { x: number; y: number; width: number; height: number; radius: number; overflow: string } | null;
  canvas: { width: string; height: string; scale: string | null } | null; running: number;
}
const readFacts = (page: Page, steps: Array<{ target: string; fallbackTarget?: string }>): Promise<Facts> =>
  page.evaluate(`${FACTS}(${JSON.stringify(steps.map((step) => ({ target: step.target, fallbackTarget: step.fallbackTarget ?? null })))})`) as Promise<Facts>;

/** The shell the plan expects at a size; the arithmetic is scripts/verify-r0-device-containment.mjs's. */
function shellFaults(facts: Facts, size: Size): string[] {
  const faults: string[] = [];
  const close = (actual: number, expected: number, what: string) => {
    if (Math.abs(actual - expected) >= 1.25) faults.push(`${what}: expected ${expected.toFixed(1)}, measured ${actual.toFixed(1)}`);
  };
  if (facts.window.width !== size.width || facts.window.height !== size.height) faults.push(`the window is ${facts.window.width}x${facts.window.height}, not ${size.width}x${size.height}`);
  if (facts.coarse !== size.touch) faults.push(`the pointer reads ${facts.coarse ? "coarse" : "fine"}`);
  if (size.deviceClass === "mobile") {
    if (facts.frame || facts.deviceClass) faults.push("a phone is shown the desktop frame");
    return faults;
  }
  if (!facts.frame || !facts.canvas) { faults.push("no tablet/desktop frame"); return faults; }
  if (facts.deviceClass !== size.deviceClass) faults.push(`the frame says it is for a ${facts.deviceClass}`);
  if (facts.canvas.width !== "1180px" || facts.canvas.height !== "880px") faults.push(`the canvas is ${facts.canvas.width} x ${facts.canvas.height}, not 1180px x 880px`);
  if (facts.frame.overflow !== "hidden") faults.push("the frame does not clip its canvas");
  if (size.deviceClass === "tablet") {
    close(facts.frame.width, size.width, "tablet frame width");
    close(facts.frame.height, size.height, "tablet frame height");
    close(facts.frame.x, 0, "tablet frame left");
    close(facts.frame.y, 0, "tablet frame top");
    if (facts.frame.radius !== 0) faults.push(`the tablet frame has rounded corners (${facts.frame.radius}px)`);
  } else {
    const width = Math.min(1000, size.width * 0.94, size.height * 0.94 * 59 / 44);
    close(facts.frame.width, width, "desktop frame width");
    close(facts.frame.height, width * 44 / 59, "desktop frame height");
    close(facts.frame.x + facts.frame.width / 2, size.width / 2, "desktop frame centre, across");
    close(facts.frame.y + facts.frame.height / 2, size.height / 2, "desktop frame centre, down");
    if (facts.frame.radius < 24) faults.push(`the desktop frame's corners are ${facts.frame.radius}px`);
  }
  return faults;
}

// ── The browser ──────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH, headless: true,
  // For this browser only: localhost is this machine, and this run's certificate is trusted by its key.
  args: ["--host-resolver-rules=MAP localhost 127.0.0.1", `--ignore-certificate-errors-spki-list=${certKeyHash}`],
});

interface Watch { pageErrors: string[]; consoleErrors: Array<{ text: string; from: string }>; failed: string[]; elsewhere: string[]; sent: string[]; routes: Set<string>; pending: Set<BrowserRequest> }
async function openContext(size: Size): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch,
    deviceScaleFactor: 1, serviceWorkers: "block", timezoneId: "Pacific/Auckland",
  });
  // Sandboxed Chromium has only loopback and reports itself offline; the app would cover itself with "Connection Lost".
  await context.addInitScript('Object.defineProperty(Navigator.prototype, "onLine", { get: function () { return true; } });');
  return context;
}

/** A page of the context that records what it does. Nothing leaves this machine: another machine's reply is empty. */
async function openPage(context: BrowserContext, mode: Mode | null): Promise<{ page: Page; watch: Watch }> {
  const page = await context.newPage();
  const watch: Watch = { pageErrors: [], consoleErrors: [], failed: [], elsewhere: [], sent: [], routes: new Set(), pending: new Set() };
  if (mode) await page.addInitScript(`try { localStorage.setItem("taptMode", ${JSON.stringify(mode)}); } catch (e) {}`);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    watch.elsewhere.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    const kind = route.request().resourceType();
    return route.fulfill({ status: 200, contentType: kind === "stylesheet" ? "text/css" : kind === "script" ? "text/javascript" : "text/plain", body: "" });
  });
  page.on("pageerror", (error) => watch.pageErrors.push(String(error).slice(0, 300)));
  page.on("console", (message) => { if (message.type() === "error") watch.consoleErrors.push({ text: message.text().slice(0, 300), from: message.location().url ?? "" }); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== base) return;
    watch.pending.add(request);
    if (!url.pathname.startsWith("/api/")) return;
    watch.sent.push(`${request.method()} ${url.pathname}`);
    const route = routeFor(request.method(), url.pathname);
    if (route) watch.routes.add(route);
    else watch.failed.push(`no such route: ${request.method()} ${url.pathname}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === base && response.status() >= 400) watch.failed.push(`${response.status()} ${response.request().method()} ${url.pathname}${url.search}`);
    // A stream need not finish, but must answer with its own content type before it is considered open.
    if (response.headers()["content-type"]?.startsWith("text/event-stream")) watch.pending.delete(response.request());
  });
  page.on("requestfinished", (request) => watch.pending.delete(request));
  page.on("requestfailed", (request) => {
    watch.pending.delete(request);
    const url = new URL(request.url());
    const why = request.failure()?.errorText ?? "failed";
    // A request the page itself gave up (it moved on, or closed a stream) is not a failure of this app.
    if (url.origin === base && why !== "net::ERR_ABORTED") watch.failed.push(`${why} ${request.method()} ${url.pathname}`);
  });
  return { page, watch };
}

async function signIn(context: BrowserContext, email = OWNER_EMAIL, realm: "business" | "admin" = "business", beforeProbe?: (page: Page) => Promise<void>): Promise<void> {
  const { page, watch } = await openPage(context, null);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (realm === "admin") await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.fill('[data-testid="input-email"]', email, { timeout: 60_000 });
  await page.fill('[data-testid="input-password"]', realm === "admin" ? ADMIN_PASSWORD : OWNER_PASSWORD);
  try {
    await page.click('[data-testid="button-login"]', { timeout: 8_000 });
  } catch (error) {
    // Say what was in the way, with a picture, rather than only that the tap did not land.
    const state = await page.evaluate(`(function () {
      var b = document.querySelector('[data-testid="button-login"]'); var r = b.getBoundingClientRect();
      var at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      var v = window.visualViewport;
      return { button: { x: r.x, y: r.y, width: r.width, height: r.height }, atItsCentre: at ? at.tagName + "." + String(at.className).slice(0, 60) : null,
        window: { width: innerWidth, height: innerHeight, scrollY: scrollY }, visual: v ? { scale: v.scale, offsetTop: v.offsetTop, height: v.height, width: v.width } : null,
        active: document.activeElement ? document.activeElement.tagName : null, kbOpen: document.documentElement.hasAttribute("data-kb-open") };
    })()`);
    await page.screenshot({ path: path.join(out, `sign-in-tap-missed-${Date.now()}.png`) });
    throw new Error(`the login button could not be tapped: ${JSON.stringify(state)}; failed requests: ${JSON.stringify(watch.failed)} — ${String(error).split("\n")[0]}`);
  }
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), undefined, { timeout: 60_000 });
  if (beforeProbe) await beforeProbe(page);
  const endpoint = realm === "admin" ? "/api/admin/auth/me" : "/api/auth/session";
  const session = await page.evaluate(async (endpoint) => {
    const reply = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
    return { status: reply.status, body: await reply.json() };
  }, endpoint);
  const expectedMerchant = email === NEW_EMAIL ? newcomer.id : merchantId;
  const identityMatches = realm === "admin"
    ? session.body?.user?.role === "admin" && session.body?.user?.email === ADMIN_EMAIL
    : session.body?.signedIn === true && session.body?.user?.email === email && session.body?.user?.merchantId === expectedMerchant;
  if (session.status !== 200 || !identityMatches || typeof session.body?.csrfToken !== "string") {
    throw new Error(`sign-in did not leave the expected ${realm} session (GET ${endpoint} answered ${session.status})`);
  }
  // The sign-in pages are held like any cell: a request of theirs that failed is not passed over.
  if (watch.failed.length || watch.pageErrors.length || watch.consoleErrors.length) throw new Error(`signing in: ${[...watch.failed.map((line) => `failed request: ${line}`), ...watch.pageErrors.map((line) => `page error: ${line}`), ...watch.consoleErrors.map((error) => `console error: ${error.text}`)].join("; ")}`);
  await page.close();
}

interface Cell { size: string; path: string; mode: Mode | "outside"; pageKey: string; faults: string[]; mark: string | null; byFallback: boolean; elsewhere: string[]; sent: number; routes: string[]; measured?: unknown; geometry?: Awaited<ReturnType<typeof measureGeometry>> }
/** A fallback that names something of the screen's own (a class, an attribute), not any page's furniture. */
const ownFallback = (selector: string | undefined | null): boolean => !!selector && /[.#\[]/.test(selector);
const ERROR_SCREENS = /Something went wrong|couldn't check your session|taking longer than expected|Connection Lost/i;

/**
 * One screen at one size. `as` lets the self-test judge a cell by another screen's mark or another size's
 * shell; `plant` lets it break the page after it has settled.
 */
async function visit(context: BrowserContext, size: Size, surface: Surface | Outside, options: { as?: { pageKey?: TutorialPageKey; size?: Size }; plant?: (page: Page) => Promise<void>; shot?: boolean } = {}): Promise<Cell> {
  const outside = "who" in surface ? surface : null;
  const mode: Mode = outside ? "retail" : (surface as Surface).mode;
  const { page, watch } = await openPage(context, outside ? null : mode);
  const judgedKey = options.as?.pageKey ?? (outside ? null : (surface as Surface).pageKey);
  const judgedSize = options.as?.size ?? size;
  const steps: Array<{ target: string; fallbackTarget?: string }> = judgedKey
    ? tutorialStepsForDevice(judgedKey, judgedSize.deviceClass)
    : outside?.mark.selector ? [{ target: outside.mark.selector }] : [];
  const words = judgedKey ? null : outside?.mark.text ?? null;
  const called = outside?.name ?? surface.path;
  const faults: string[] = [];
  let mark: string | null = null;
  let byFallback = false;
  let measured: unknown;
  let geometry: Cell["geometry"];
  try {
    await page.goto(`${base}${surface.path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Settled: a mark is up (or the wait runs out), nothing is being fetched, and no finite animation is running.
    const deadline = Date.now() + 20_000;
    let facts = await readFacts(page, steps);
    let quietSince = Date.now(); let lastSent = watch.sent.length;
    for (;;) {
      await page.waitForTimeout(250);
      facts = await readFacts(page, steps);
      if (watch.sent.length !== lastSent) { lastSent = watch.sent.length; quietSince = Date.now(); }
      const marked = facts.marks.some((step, index) => step.shown || (step.fallbackShown && ownFallback(steps[index].fallbackTarget)))
        || (words !== null && facts.text.includes(words));
      if (marked && facts.running === 0 && watch.pending.size === 0 && Date.now() - quietSince >= 1000) break;
      if (Date.now() > deadline) break;
    }
    if (options.plant) { await options.plant(page); await page.waitForTimeout(600); facts = await readFacts(page, steps); }

    const meantFor = outside?.movesTo ?? surface.path;
    if (facts.path !== meantFor) faults.push(`sent to ${called}, ${outside?.movesTo ? `meant to move to ${outside.movesTo}, ` : ""}ended at ${facts.path}`);
    const found = facts.marks.find((step) => step.shown);
    const fallback = found ? -1 : facts.marks.findIndex((step, index) => step.fallbackShown && ownFallback(steps[index].fallbackTarget));
    mark = found?.target ?? (fallback >= 0 ? steps[fallback].fallbackTarget ?? null : null);
    byFallback = !found && fallback >= 0;
    if (!mark && words !== null && facts.text.includes(words)) mark = `"${words}"`;
    if (!mark) faults.push(judgedKey
      ? `no mark of the ${judgedKey} screen is shown (looked for ${facts.marks.length} tutorial targets)`
      : `no mark of the ${called} page is shown (${outside?.mark.selector ?? `the words "${words}"`})`);
    if (ERROR_SCREENS.test(facts.text)) faults.push(`an error screen: "${(facts.text.match(ERROR_SCREENS) ?? [""])[0]}"`);
    if (facts.running > 0) faults.push(`${facts.running} animation(s) still running when the wait ran out`);
    if (outside && !options.as?.size) {
      // Outside the merchant frame at every size: only the window and the pointer are held.
      if (facts.frame || facts.deviceClass) faults.push("a page outside the merchant frame is shown inside it");
      if (facts.window.width !== size.width || facts.window.height !== size.height) faults.push(`the window is ${facts.window.width}x${facts.window.height}, not ${size.width}x${size.height}`);
      if (facts.coarse !== size.touch) faults.push(`the pointer reads ${facts.coarse ? "coarse" : "fine"}`);
    } else {
      faults.push(...shellFaults(facts, judgedSize));
    }
    for (const error of watch.pageErrors) faults.push(`page error: ${error}`);
    for (const error of watch.consoleErrors) faults.push(`console error: ${error.text}`);
    for (const failure of watch.failed) faults.push(`failed request: ${failure}`);
    for (const request of watch.pending) faults.push(`request did not settle: ${request.method()} ${new URL(request.url()).pathname}`);
    const terminalRows = !outside && ["/terminal", "/property/terminal", "/trades/terminal"].includes(surface.path)
      ? size.deviceClass === "mobile" ? ".tp-stack-row"
        : mode === "retail" ? ".rt-rows .rt-row" : mode === "property" ? ".pt-rows .pt-row" : ".tt-rows .tt-row"
      : null;
    geometry = await measureGeometry(page, terminalRows);
    if (geometry.docOverflow > 1) faults.push(`document overflow: ${geometry.docOverflow}px`);
    if (geometry.edgeCrosserCount) faults.push(`window edge crossing: ${geometry.edgeCrosserCount} rendered elements`);
    if (geometry.clippedTextCount) faults.push(`clipped text: ${geometry.clippedTextCount} elements`);
    if (geometry.tapCentreMiss) faults.push(`tap centre miss: ${geometry.tapCentreMiss} controls`);
    if (geometry.terminalRows && geometry.terminalRows.visible === 0) faults.push(`terminal has zero visible rows (${geometry.terminalRows.total} mounted)`);
    if (MEASURE) {
      measured = await page.evaluate(`(function (selector) { var el = document.querySelector(selector); if (!el) return null; var r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(${JSON.stringify(MEASURE)})`);
    }
    if (options.shot !== false) {
      const slug = `${size.name}-${outside ? "outside" : mode}-${called.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 60) || "root"}`;
      await page.screenshot({ path: path.join(out, `${slug}.png`) });
    }
  } catch (error) {
    faults.push(`the visit itself failed: ${String(error).slice(0, 200)}`);
  } finally {
    await page.close().catch(() => undefined);
  }
  return { size: size.name, path: called, mode: outside ? "outside" : mode, pageKey: outside ? outside.who : (surface as Surface).pageKey, faults, mark, byFallback, elsewhere: [...new Set(watch.elsewhere)], sent: watch.sent.length, routes: [...watch.routes].sort(), geometry, ...(MEASURE ? { measured } : {}) };
}

let exitCode = 0;
try {
  const sizes = SIZES.filter((size) => !ONLY_CONTEXT || size.name === ONLY_CONTEXT);
  const surfaces = SURFACES.filter((surface) => !ONLY_SURFACE || surface.path === ONLY_SURFACE);
  const pages = OUTSIDE.filter((page) => !ONLY_SURFACE || page.path === ONLY_SURFACE || page.name === ONLY_SURFACE);
  if (!sizes.length || (!surfaces.length && !pages.length)) throw new Error("matrix filters selected zero cells");
  if (SELF_TEST) {
    // One fault at a time, on the phone's terminal and the desktop's; every one must be caught.
    const phone = SIZES[0]; const desktop = SIZES[2]; const tablet = SIZES[1];
    const terminal = SURFACES.find((surface) => surface.path === "/terminal")!;
    const home = SURFACES.find((surface) => surface.path === "/dashboard")!;
    const signedIn = await openContext(phone); await signIn(signedIn);
    const signedOut = await openContext(phone);
    const onDesktop = await openContext(desktop); await signIn(onDesktop);
    const plants: Array<[string, RegExp, () => Promise<Cell>]> = [
      ["nobody is signed in", /ended at \/login|no mark of the/, () => visit(signedOut, phone, terminal, { shot: false })],
      ["the wrong screen is up (the home, judged as the stock page)", /no mark of the retail-stock screen/, () => visit(signedIn, phone, home, { as: { pageKey: "retail-stock" }, shot: false })],
      ["a console error", /console error: planted by the self-test/, () => visit(signedIn, phone, terminal, { plant: (page) => page.evaluate("console.error('planted by the self-test')") as Promise<void>, shot: false })],
      ["a page error", /page error: .*planted by the self-test/, () => visit(signedIn, phone, terminal, { plant: (page) => page.evaluate("setTimeout(function () { throw new Error('planted by the self-test'); }, 0)") as Promise<void>, shot: false })],
      ["a failed request to this app (another business's profile)", /failed request: 40[34] GET \/api\/merchants\/987654\/profile/, () => visit(signedIn, phone, terminal, { plant: (page) => page.evaluate("fetch('/api/merchants/987654/profile').then(function () {})") as Promise<void>, shot: false })],
      ["a request to an address the server does not have", /failed request: no such route: GET \/api\/no-such-route/, () => visit(signedIn, phone, terminal, { plant: (page) => page.evaluate("fetch('/api/no-such-route').then(function () {})") as Promise<void>, shot: false })],
      ["a phone shown as if it were a tablet", /no tablet\/desktop frame|the window is/, () => visit(signedIn, phone, terminal, { as: { size: tablet }, shot: false })],
      ["a desktop judged by the tablet's shell", /tablet frame width|the pointer reads|the frame says/, () => visit(onDesktop, desktop, terminal, { as: { size: { ...tablet, width: desktop.width, height: desktop.height } }, shot: false })],
      ["a desktop frame pushed off centre", /desktop frame centre/, () => visit(onDesktop, desktop, terminal, { plant: (page) => page.evaluate(`document.querySelector('[data-testid="desktop-frame"] > .tapt-desktop-frame').style.transform = 'translateX(40px)'`) as Promise<void>, shot: false })],
    ];
    // And on the pages outside the merchant frame.
    const login = OUTSIDE.find((page) => page.path === "/login")!;
    const terms = OUTSIDE.find((page) => page.path === "/terms")!;
    const privacy = OUTSIDE.find((page) => page.path === "/privacy")!;
    const onboarding = OUTSIDE.find((page) => page.path === "/onboarding")!;
    plants.push(
      ["onboarding opened with nobody signed in", /ended at \/login|no mark of the \/onboarding page/, () => visit(signedOut, phone, onboarding, { shot: false })],
      ["the wrong page is up (the terms, judged by the privacy page's words)", /no mark of the \/terms page/, () => visit(signedOut, phone, { ...terms, mark: privacy.mark }, { shot: false })],
      ["a signed-out page asking for a business's data", /failed request: 401 GET \/api\/merchants\/1\/profile/, () => visit(signedOut, phone, login, { plant: (page) => page.evaluate("fetch('/api/merchants/1/profile').then(function () {})") as Promise<void>, shot: false })],
      ["a page outside the frame judged as a merchant's desktop screen", /no tablet\/desktop frame/, () => visit(onDesktop, desktop, login, { as: { size: desktop }, shot: false })],
    );
    // And on what a customer opens.
    const receipt = OUTSIDE.find((page) => page.name === "/receipt/t/:token")!;
    const checkout = OUTSIDE.find((page) => page.name === "/checkout/t/:token")!;
    const emptyBoard = OUTSIDE.find((page) => page.name === "/pay/:id/stone/:stone (no sale)")!;
    const openBoard = OUTSIDE.find((page) => page.name === "/pay/:id/stone/:stone (an open sale)")!;
    plants.push(
      ["the wrong customer page is up (the receipt, judged by the checkout's words)", /no mark of the \/receipt\/t\/:token page/, () => visit(signedOut, phone, { ...receipt, mark: checkout.mark }, { shot: false })],
      ["a board that was meant to move on to checkout and did not", /meant to move to \/checkout\/\d+, ended at \/pay\//, () => visit(signedOut, phone, { ...emptyBoard, movesTo: openBoard.movesTo }, { shot: false })],
      ["a board that moved on when it was meant to stay", /ended at \/checkout\//, () => visit(signedOut, phone, { ...openBoard, movesTo: undefined }, { shot: false })],
      ["a sale's link that is not one (the server's 404 is a failure here)", /failed request: 404 GET \/api\/pay\/t\/not-a-real-link/, () => visit(signedOut, phone, { ...checkout, path: "/checkout/t/not-a-real-link" }, { shot: false })],
      ["a required request that never answers", /request did not settle: GET \/api\/auth\/session/, () => visit(signedIn, phone, terminal, { plant: async (page) => {
        await page.route("**/api/auth/session", () => {});
        await page.evaluate("void fetch('/api/auth/session')");
      }, shot: false })],
    );
    // Session status alone is not proof of sign-in, and console errors during sign-in cannot disappear.
    const signInPlants: Array<[string, RegExp, (page: Page) => Promise<void>]> = [
      ["a signed-out session reply with HTTP 200", /did not leave the expected business session/, (page) => page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: false }) }))],
      ["another business's session reply with HTTP 200", /did not leave the expected business session/, (page) => page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: true, csrfToken: "fixture", user: { email: OWNER_EMAIL, merchantId: newcomer.id } }) }))],
      ["a console error during sign-in", /console error: planted sign-in fault/, (page) => page.evaluate("console.error('planted sign-in fault')") as Promise<void>],
    ];
    for (const [name, expected, plant] of signInPlants) {
      const context = await openContext(phone);
      let reason = "";
      try { await signIn(context, OWNER_EMAIL, "business", plant); }
      catch (error) { reason = String(error); }
      finally { await context.close(); }
      const caught = expected.test(reason);
      if (!caught) exitCode = 1;
      console.log(`${caught ? "caught" : "MISSED"} ${name}`);
    }
    const adminContext = await openContext(desktop);
    await signIn(adminContext, ADMIN_EMAIL, "admin");
    const adminHome = OUTSIDE.find((page) => page.path === "/admin")!;
    const adminApi = OUTSIDE.find((page) => page.path === "/admin/api")!;
    plants.push(
      ["the admin's page opened with nobody signed in", /ended at \/login|no mark of the \/admin page/, () => visit(signedOut, phone, adminHome, { shot: false })],
      ["the wrong admin page (home judged by the API page's mark)", /no mark of the \/admin page/, () => visit(adminContext, desktop, { ...adminHome, mark: adminApi.mark }, { shot: false })],
    );
    const control = [await visit(signedIn, phone, terminal, { shot: false }), await visit(onDesktop, desktop, terminal, { shot: false }), await visit(signedOut, phone, login, { shot: false }), await visit(signedOut, phone, openBoard, { shot: false })];
    for (const cell of control) {
      const ok = cell.faults.length === 0;
      if (!ok) exitCode = 1;
      console.log(`${ok ? "PASS" : "FAIL"} control: ${cell.size} ${cell.path} with nothing planted${ok ? "" : ` — ${cell.faults.join("; ")}`}`);
    }
    for (const [name, expected, run] of plants) {
      const cell = await run();
      const caught = cell.faults.some((fault) => expected.test(fault));
      if (!caught) exitCode = 1;
      console.log(`${caught ? "caught" : "MISSED"} ${name} — ${cell.faults.find((fault) => expected.test(fault)) ?? cell.faults.join("; ") ?? "no fault reported"}`);
    }
    await adminContext.close();
    console.log(`${plants.length + signInPlants.length} planted, ${exitCode ? "checks failed (see controls and plants)" : "all caught"}`);
  } else {
    const cells: Cell[] = [];
    for (const size of sizes) {
      const context = await openContext(size);
      await signIn(context);
      const say = (cell: Cell) => console.log(`${cell.faults.length ? "FAIL" : "PASS"} ${size.name.padEnd(13)} ${cell.mode.padEnd(8)} ${cell.path}${cell.faults.length ? ` — ${cell.faults.join("; ")}` : `  [${cell.mark}]${cell.byFallback ? " (a fallback: none of this screen's tutorial targets is on the page)" : ""}`}`);
      for (const surface of surfaces) {
        const cell = await visit(context, size, surface);
        cells.push(cell); say(cell);
      }
      await context.close();
      // The pages outside the merchant frame: with nobody signed in, and onboarding as a business that has just signed up.
      if (pages.some((page) => page.who === "nobody")) {
        const nobody = await openContext(size);
        for (const page of pages.filter((each) => each.who === "nobody")) { const cell = await visit(nobody, size, page); cells.push(cell); say(cell); }
        await nobody.close();
      }
      if (pages.some((page) => page.who === "a new business")) {
        const fresh = await openContext(size);
        await signIn(fresh, NEW_EMAIL);
        for (const page of pages.filter((each) => each.who === "a new business")) { const cell = await visit(fresh, size, page); cells.push(cell); say(cell); }
        await fresh.close();
      }
      if (pages.some((page) => page.who === "admin")) {
        const admin = await openContext(size);
        await signIn(admin, ADMIN_EMAIL, "admin");
        for (const page of pages.filter((each) => each.who === "admin")) { const cell = await visit(admin, size, page); cells.push(cell); say(cell); }
        await admin.close();
      }
    }
    const failed = cells.filter((cell) => cell.faults.length);
    const elsewhere = [...new Set(cells.flatMap((cell) => cell.elsewhere))].sort();
    const routes = [...new Set(cells.flatMap((cell) => cell.routes))].sort();
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ base: "in-process", geometrySourceSha256: GEOMETRY_SOURCE_SHA256, cells, elsewhere, routes }, null, 1));
    console.log(`\n${cells.length} cells: ${cells.length - failed.length} pass, ${failed.length} fail`);
    console.log(`${cells.reduce((sum, cell) => sum + cell.sent, 0)} requests to this app's API, to ${routes.length} of the server's routes; none to an address it does not have${failed.some((cell) => cell.faults.some((fault) => fault.includes("no such route"))) ? " — NOT TRUE, see the failures" : ""}`);
    console.log(`asked of other machines (refused here, answered empty): ${elsewhere.length ? elsewhere.join(", ") : "nothing"}`);
    const fallbackOnly = cells.filter((cell) => cell.byFallback);
    console.log(`known by a tutorial fallback only: ${fallbackOnly.length ? fallbackOnly.map((cell) => `${cell.size} ${cell.path} [${cell.mark}]`).join(", ") : "none"}`);
    if (failed.length) exitCode = 1;
  }
} finally {
  await browser.close().catch(() => undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(certDir, { recursive: true, force: true });
}
process.exit(exitCode);
