/**
 * R1-T2 — source inventory of every Express registration on `app`.
 *
 * AST-based (TypeScript compiler API), not regex: the 2026-08-29 correction
 * register on this remediation records that an earlier regex-based count
 * missed the five `app.all(...)` registrations. Walking the parsed AST for
 * every `app.<method>(...)` call, regardless of formatting or nesting,
 * closes that specific class of miss.
 *
 * This module is imported BOTH by the one-off generator
 * (scripts/generate-route-policy.ts, which writes server/route-policy.ts and
 * the documentation table) and by the completeness-gate test
 * (server/__tests__/route-policy-inventory.test.ts, which re-parses the
 * source fresh on every run) — so a route added to server/routes.ts without
 * a matching server/route-policy.ts entry is caught immediately, not only
 * when someone remembers to regenerate.
 */
import * as ts from "typescript";
import fs from "fs";
import path from "path";

export type HttpRegistrationMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

export interface RouteRegistration {
  method: HttpRegistrationMethod;
  path: string;
  /** 1-based source line, for humans regenerating the table. */
  line: number;
}

export interface MiddlewareUse {
  /** The mount path, or null for a path-less app.use(fn). */
  path: string | null;
  /** true when the argument looks like a mounted Router (an Identifier, not an inline function). */
  looksLikeMountedRouter: boolean;
  /**
   * What is mounted, as the middleware policy names it: a call as
   * `callee(…)` (`helmet(…)`, `express.static(…)`), a reference as written
   * (`vite.middlewares`, `extraRouter`), an inline function as
   * "inline function"; several arguments are joined with ", ".
   */
  mounts: string;
  line: number;
}

export interface SourceInventory {
  registrations: RouteRegistration[];
  uses: MiddlewareUse[];
}

const ROUTE_METHODS: Record<string, HttpRegistrationMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  all: "ALL",
};

/**
 * Type names that make a parameter an Express app or router
 * (`registerRoutes(app: Express)`, `serveStatic(app: Express)`).
 */
const EXPRESS_TYPE_NAMES = new Set([
  "Express",
  "Application",
  "Router",
  "IRouter",
  "express.Express",
  "express.Application",
  "express.Router",
  "express.IRouter",
]);

/**
 * Calls whose result is an Express app or router: `express()`,
 * `express.Router()`, `Router()`, and server/app.ts's `createApp(…)`, which
 * server/index.ts serves.
 */
const EXPRESS_FACTORY_CALLS = new Set(["express", "express.Router", "Router", "createApp"]);

/**
 * The local names bound to an Express app or router in one file: variables
 * initialised by an Express factory call, and parameters typed as an Express
 * app or router. Registrations are read only on these names, so an unrelated
 * `.use(…)` (a Map, a plugin system) is never mistaken for middleware.
 */
export function findExpressBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      EXPRESS_FACTORY_CALLS.has(node.initializer.expression.getText(sourceFile))
    ) {
      names.add(node.name.text);
    }
    if (
      ts.isParameter(node) &&
      ts.isIdentifier(node.name) &&
      node.type &&
      EXPRESS_TYPE_NAMES.has(node.type.getText(sourceFile))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

/** How the middleware policy names what one `use` argument mounts. */
function describeMount(node: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "inline function";
  if (ts.isCallExpression(node)) return `${node.expression.getText(sourceFile)}(…)`;
  return node.getText(sourceFile);
}

/**
 * Names this codebase gives an Express app or router by convention. Read as
 * bindings in every file even when findExpressBindings() cannot see where the
 * value came from (`const app = buildApp()`), so such a file still shows up
 * in discoverRegistrationFiles() instead of slipping past it.
 */
const CONVENTIONAL_BINDINGS = ["app", "router"];

/**
 * @param appIdentifier the local name the app/router is bound to. Omitted,
 * every Express binding findExpressBindings() finds in the file is read,
 * plus the conventional names.
 */
export function extractSourceInventory(
  sourceText: string,
  fileName: string,
  appIdentifier?: string,
): SourceInventory {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const bindings = appIdentifier
    ? new Set([appIdentifier])
    : new Set([...findExpressBindings(sourceFile), ...CONVENTIONAL_BINDINGS]);
  const registrations: RouteRegistration[] = [];
  const uses: MiddlewareUse[] = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      bindings.has(node.expression.expression.text)
    ) {
      const prop = node.expression.name.text;
      const firstArg = node.arguments[0];

      if (prop in ROUTE_METHODS) {
        // `app.get("env")` (one argument) reads a setting; a route has a handler.
        if (firstArg && ts.isStringLiteralLike(firstArg) && node.arguments.length >= 2) {
          registrations.push({ method: ROUTE_METHODS[prop], path: firstArg.text, line: lineOf(node) });
        }
      } else if (prop === "use") {
        const pathArg = firstArg && ts.isStringLiteralLike(firstArg) ? firstArg : null;
        const mounted = pathArg ? node.arguments.slice(1) : [...node.arguments];
        uses.push({
          path: pathArg ? pathArg.text : null,
          looksLikeMountedRouter: !!pathArg && mounted.length > 0 && ts.isIdentifier(mounted[0]),
          mounts: mounted.map((arg) => describeMount(arg, sourceFile)).join(", "),
          line: lineOf(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { registrations, uses };
}

export function extractSourceInventoryFromFile(filePath: string, appIdentifier?: string): SourceInventory {
  return extractSourceInventory(fs.readFileSync(filePath, "utf8"), filePath, appIdentifier);
}

/**
 * Every file that registers a route or middleware on the app production
 * serves, repo-relative, in the order the app is assembled: the pipeline
 * (createApp), the routes, then what server/index.ts adds after them and the
 * Vite/static serving it calls. route-policy-inventory.test.ts proves no other
 * server file registers anything (discoverRegistrationFiles).
 */
export const REGISTRATION_FILES = [
  "server/app.ts",
  "server/routes.ts",
  "server/index.ts",
  "server/vite.ts",
] as const;

export type RegistrationFile = (typeof REGISTRATION_FILES)[number];

/** The source inventory of every registration file, keyed by its repo-relative path. */
export function extractRegistrationInventory(repoRoot = process.cwd()): Record<RegistrationFile, SourceInventory> {
  const inventory = {} as Record<RegistrationFile, SourceInventory>;
  for (const file of REGISTRATION_FILES) {
    inventory[file] = extractSourceInventoryFromFile(path.join(repoRoot, file));
  }
  return inventory;
}

function listTypeScriptFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      found.push(...listTypeScriptFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every non-test TypeScript file under server/ that registers a route or
 * middleware on an Express app or router binding, repo-relative and sorted.
 */
export function discoverRegistrationFiles(repoRoot = process.cwd()): string[] {
  return listTypeScriptFiles(path.join(repoRoot, "server"))
    .filter((file) => {
      const inventory = extractSourceInventoryFromFile(file);
      return inventory.registrations.length > 0 || inventory.uses.length > 0;
    })
    .map((file) => path.relative(repoRoot, file).split(path.sep).join("/"))
    .sort();
}

/**
 * Compares each file's `use` registrations, in order, with its middleware
 * policy, and describes every difference: a registration the policy does not
 * list (a new middleware or a mounted router), a listed one that is gone, or
 * one that moved. Empty when they agree.
 */
export function middlewarePolicyDiff(
  inventory: Record<string, SourceInventory>,
  policy: Record<string, ReadonlyArray<{ path: string | null; mounts: string }>>,
): string[] {
  const problems: string[] = [];
  const describe = (entry: { path: string | null; mounts: string }) =>
    `"${entry.mounts}" on ${entry.path === null ? "every path" : `"${entry.path}"`}`;

  for (const file of Object.keys(policy)) {
    if (!(file in inventory)) problems.push(`${file}: has a middleware policy but is not an inventoried registration file`);
  }
  for (const [file, { uses }] of Object.entries(inventory)) {
    const listed = policy[file];
    if (!listed) {
      if (uses.length > 0) problems.push(`${file}: registers middleware but has no middleware policy`);
      continue;
    }
    const length = Math.max(uses.length, listed.length);
    for (let i = 0; i < length; i++) {
      const found = uses[i];
      const expected = listed[i];
      if (found && !expected) {
        problems.push(`${file}:${found.line}: use #${i + 1} ${describe(found)} has no middleware policy entry`);
      } else if (!found && expected) {
        problems.push(`${file}: policy entry #${i + 1} ${describe(expected)} is no longer registered`);
      } else if (found && expected && (found.path !== expected.path || found.mounts !== expected.mounts)) {
        problems.push(
          `${file}:${found.line}: use #${i + 1} is ${describe(found)}, but its policy entry is ${describe(expected)}`,
        );
      }
    }
  }
  return problems;
}

export function registrationKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * Known gate/guard identifiers this repo already uses, detected as plain
 * substring matches in the slice of source between one `app.<method>(` call
 * and the next (the same slicing technique server/__tests__/subscription-route-security.test.ts
 * already uses to isolate one handler's body). This is deliberately a
 * mechanical marker list, not a semantic classifier — see server/route-policy.ts's
 * header for what it does and does not assert.
 */
export const KNOWN_GATE_MARKERS = [
  "authenticateToken",
  "authorizeCronRequest",
  "authenticateApiKey",
  "requireEcommerceApi",
  "checkMerchantOwnership",
  "checkAccountOwnership",
  "isAccountOwner",
  "req.user?.role === \"admin\"",
  "req.user?.role !== \"admin\"",
  "req.user.role === 'admin'",
  "req.user.role !== 'admin'",
  // R1-T2 2026-09-12 classifier extension (docs/evidence/remediation-v2-2/r1/ —
  // seven analysis passes over server/routes.ts): `authenticateAdmin` is a
  // real, strict gate (server/routes.ts ~line 430 — wraps authenticateToken,
  // then requires role==="admin", merchantId===0, and an exact
  // config.admin.email match) used as the literal middleware argument on
  // every /api/admin/* route but the sign-in (and on POST
  // /api/merchants/:id/test-payment-link until its removal on 2026-09-26).
  // It was previously invisible to this list, so every route gated ONLY by
  // it fell through to "unclassified" despite being the most tightly gated
  // routes in the file.
  "authenticateAdmin",
] as const;

export function detectGateMarkers(handlerSlice: string): string[] {
  return KNOWN_GATE_MARKERS.filter((marker) => handlerSlice.includes(marker));
}

/**
 * R1-T2 2026-09-12 classifier extension — literal call-site substrings this
 * repo already uses that signal "this handler was deliberately designed to
 * be reached with no session", not merely "no known gate marker was found
 * near it". Each entry here was verified by reading the actual handler body
 * in server/routes.ts (not inferred from the path alone) during the seven
 * R1-T2 analysis passes recorded under docs/evidence/remediation-v2-2/r1/.
 * These are NOT auth gates — detectPublicMarkers() is only consulted by
 * classifyPrincipal() (scripts/generate-route-policy.ts) after every real
 * gate marker above has already failed to match, so a route that also
 * carries e.g. authenticateToken is classified "merchant-user" regardless
 * of whether one of these substrings also appears in its slice (some of
 * these helpers — generatePaymentUrl(, isTokenAddressedTransaction( — are
 * reused by authenticated handlers too, purely to build a response field).
 *
 * What each one stands for (see the R1-T2 evidence for the per-route
 * findings that motivated it):
 *  - resolvePaymentToken(, loadTokenReceipt(, prepareTokenCompletion(:
 *    the /api/pay/t/:token/* bearer-token customer payment flow. The latter
 *    two are intermediate helpers whose OWN definition (not each call site)
 *    contains resolvePaymentToken( — sliceHandlerBodies() does not attribute
 *    a helper's body to every caller, so the helper-call identifier itself
 *    is the marker that actually lands in each route's own slice.
 *  - isTokenAddressedTransaction(: the numeric-id customer payment flow
 *    (/api/transactions/:id/*, /api/split-payments/:id) — excludes
 *    token-addressed transactions, the only gate these routes have.
 *  - getCheckoutInvoiceByToken(: the /api/checkout/* hosted rent/trades
 *    checkout flow's token lookup.
 *  - publicBoardBrandDto(, publicTransactionDto(: the two
 *    hand-allowlisted "public<Name>Dto(" response projections
 *    (server/http-contracts.ts) in use for customer-facing reads (the board
 *    brand read replaced the retired by-number business read, 2026-09-26).
 *  - generatePaymentUrl(: pure string templating (server/url-utils.ts), no
 *    storage access — used by the NFC tap-landing redirects and printable
 *    QR routes to build the already-public payment URL.
 *  - paymentAttempts.resolveReturnState(: the HMAC-derived opaque state
 *    token gating the Windcave hosted-payment browser-return redirect.
 *  - validateResetToken(, resetPassword(, requestPasswordReset(: the
 *    password-reset flow, necessarily reachable with no session.
 *  - getMerchantByToken(, getQuoteByToken(, getUserByInviteToken(,
 *    storage.verifyMerchant(: this codebase's established
 *    "opaque-token-is-the-credential" idiom (email-confirmation, trades
 *    quote magic links, team invite acceptance, merchant signup
 *    verification) — every `*ByToken(`/`verifyMerchant(` call site in
 *    routes.ts was checked and none sit in a route that ALSO carries a real
 *    gate marker.
 *  - billingCardCallback: the named handler reference shared by the
 *    GET/POST /api/billing/card/callback pair — their own registration line
 *    IS their entire slice (no inline body), so the bare identifier is the
 *    only text available to match.
 */
export const KNOWN_PUBLIC_MARKERS = [
  "resolvePaymentToken(",
  "loadTokenReceipt(",
  "prepareTokenCompletion(",
  "isTokenAddressedTransaction(",
  "getCheckoutInvoiceByToken(",
  "publicBoardBrandDto(",
  "publicTransactionDto(",
  "generatePaymentUrl(",
  "paymentAttempts.resolveReturnState(",
  "validateResetToken(",
  "resetPassword(",
  "requestPasswordReset(",
  "getMerchantByToken(",
  "getQuoteByToken(",
  "getUserByInviteToken(",
  "storage.verifyMerchant(",
  "billingCardCallback",
] as const;

export function detectPublicMarkers(handlerSlice: string): string[] {
  return KNOWN_PUBLIC_MARKERS.filter((marker) => handlerSlice.includes(marker));
}

/**
 * R1-T2 2026-09-12 classifier extension — call-site substrings that signal a
 * deliberate provider-to-server webhook gate (possession of a shared secret
 * the provider echoes back, verified in the handler itself) rather than a
 * bearer-token/session check. This is deliberately small: the dominant
 * provider-webhook shape in this codebase — Windcave's notificationUrl
 * callbacks — is caught by path/method instead (see
 * isNotificationWebhookRegistration below), because those handlers
 * distrust the inbound body entirely and re-query the provider, leaving no
 * positive call-site marker to match on.
 */
export const KNOWN_PROVIDER_WEBHOOK_MARKERS = ['req.headers["apikey"]'] as const;

export function detectProviderWebhookMarkers(handlerSlice: string): string[] {
  return KNOWN_PROVIDER_WEBHOOK_MARKERS.filter((marker) => handlerSlice.includes(marker));
}

/**
 * R1-T2 2026-09-12 — this repo's consistent naming convention for a
 * Windcave (or equivalent payment-provider) server-to-server notification
 * URL: registered with `app.all(...)` (the provider may retry with a
 * different verb) on a path with a "notification" segment, and the handler
 * never trusts the inbound body — it re-queries the provider before acting.
 * Verified against all 5 occurrences in server/routes.ts (ALL
 * /api/pay/notification/:state, /api/windcave/notification,
 * /api/windcave/rent-notification, /api/windcave/trades-notification,
 * /api/billing/card/notification) before adding this rule; checked ahead of
 * every marker-based rule in classifyPrincipal so it is not defeated by
 * helper-function text that a neighboring route's slice happens to swallow
 * (see the sliceHandlerBodies boundary note on KNOWN_PUBLIC_MARKERS above).
 */
export function isNotificationWebhookRegistration(method: string, routePath: string): boolean {
  return method === "ALL" && /notification/i.test(routePath);
}

/**
 * R1-T2 2026-09-12 — routes with no reliable call-site text to match on at
 * all (a static/no-op handler, or the one genuinely-intended marker sits in
 * a leading comment that sliceHandlerBodies attributes to the PRECEDING
 * registration, not this one — see the R1-T2 evidence for each). Each entry
 * was read in full against server/routes.ts, not inferred from its path;
 * the comment on each line is that reading's conclusion, not a guess.
 * Curated allowlist, not a text marker — exactly what several of the R1-T2
 * analysis passes independently recommended for this class of route.
 */
export const PUBLIC_PATH_ALLOWLIST: Record<string, string> = {
  "GET /robots.txt": "static well-known text file, no middleware",
  "GET /.well-known/apple-developer-merchantid-domain-association":
    "Apple Pay domain-verification file Apple's own servers must fetch unauthenticated",
  "GET /api/merchants/:id/stone/:stoneId/qr":
    "printable per-stone payment QR PNG (stone.paymentUrl, already public); no PII",
  "GET /api/merchants/:id/qr":
    "retired business-wide no-board QR (owner decision 2026-09-25): validates the id, then a constant 410 NO_BOARD_ADDRESS_RETIRED tombstone; reads nothing",
  "GET /nfc/:merchantId":
    "retired business-wide no-board NFC tag address (owner decision 2026-09-25): validates the id, then a constant 410 notice page with no script or onward link; reads nothing",
  "GET /api/push/capabilities": "static VAPID/APNs-configured booleans, no secret",
  "GET /api/push/vapid-key": "Web Push VAPID PUBLIC key — not a secret by the standard's own design",
  "GET /api/windcave/env": "publishable Apple/Google Pay merchant ids for the unauthenticated checkout page",
  "GET /uploads/:folder/:name":
    "public by design for merchant logos only (shown to customers on hosted checkout pages); PUBLIC_UPLOAD_FOLDERS in upload-policy.ts is an allowlist checked before the database or disk is consulted, so any other folder — invoice documents in particular — is a 404. Invoice documents are served by GET /api/invoice-documents/:name (authenticated, tenant-scoped) and GET /api/checkout/document/:token (checkout-token). Gap 13, Option C",
  "GET /api/nfc/capabilities": "static tap-to-pay capability booleans, no secret",
  "GET /api/auth/google": "OAuth consent-redirect initiation; necessarily pre-session",
  "GET /api/auth/google/callback":
    "OAuth callback that issues the one-time sign-in handoff code (R1-T4 phase A); necessarily pre-session",
  "POST /api/auth/google/session":
    "redeems the one-time handoff code its HttpOnly cookie carries, once, for the account token (R1-T4 phase A); the code is the credential, so necessarily pre-session",
  "POST /api/auth/login": "credential-checked login endpoint that issues the JWT; necessarily pre-session",
  "POST /api/admin/auth/login": "credential-checked admin login endpoint that issues the admin JWT; necessarily pre-session",
  "POST /api/auth/resend-confirmation":
    "leading '// Resend confirmation email (public — for check-email screen)' comment is misattributed by sliceHandlerBodies to the preceding registration; rate-limited, resends only to the account's own on-file email",
  "POST /api/merchants/signup": "account-creation endpoint; necessarily pre-session, rate-limited",
  "POST /api/info-pack-leads": "leading '// public endpoint, no auth required' comment misattributed; rate-limited lead capture",
  "POST /api/board-builder/submit": "leading '(public endpoint)' comment misattributed; emails a submitted PDF, no sensitive read",
};

/**
 * Routes that LOOK like they should require auth and do not, in at least one
 * reachable branch — a deliberate loud flag ("unauthenticated-suspect"), not a
 * fix. Empty since 2026-09-25: its one entry, `GET /api/merchants/:id/events`
 * (flagged R1-T2 2026-09-12 for its anonymous "legacy-no-board" branch, gap 12),
 * was resolved when that branch was retired (owner decision 2026-09-25,
 * server/no-board-address.ts). The route's two remaining branches are a signed-in
 * merchant and a board's customer page, scoped to that board.
 */
export const SUSPECTED_GAP_ROUTES: Record<string, string> = {};

/** Slices from one registration's start line to just before the next `app.` call, for marker detection. */
export function sliceHandlerBodies(sourceText: string, registrations: RouteRegistration[]): string[] {
  const lines = sourceText.split("\n");
  const starts = registrations
    .map((r) => r.line - 1)
    .sort((a, b) => a - b);
  return registrations.map((r) => {
    const startLine = r.line - 1;
    const nextStart = starts.find((s) => s > startLine) ?? lines.length;
    return lines.slice(startLine, nextStart).join("\n");
  });
}
