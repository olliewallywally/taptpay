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
 * @param appIdentifier the local variable name the app/router is bound to —
 * "app" for server/routes.ts's `registerRoutes(app: Express)`.
 */
export function extractSourceInventory(
  sourceText: string,
  fileName: string,
  appIdentifier = "app",
): SourceInventory {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
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
      node.expression.expression.text === appIdentifier
    ) {
      const prop = node.expression.name.text;
      const firstArg = node.arguments[0];

      if (prop in ROUTE_METHODS) {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          registrations.push({ method: ROUTE_METHODS[prop], path: firstArg.text, line: lineOf(node) });
        }
      } else if (prop === "use") {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          const second = node.arguments[1];
          uses.push({
            path: firstArg.text,
            looksLikeMountedRouter: !!second && ts.isIdentifier(second),
            line: lineOf(node),
          });
        } else {
          uses.push({ path: null, looksLikeMountedRouter: false, line: lineOf(node) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { registrations, uses };
}

export function extractSourceInventoryFromFile(filePath: string, appIdentifier = "app"): SourceInventory {
  return extractSourceInventory(fs.readFileSync(filePath, "utf8"), filePath, appIdentifier);
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
  // every /api/admin/* route plus POST /api/merchants/:id/test-payment-link.
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
 *  - publicMerchantBrandDto(, publicTransactionDto(: the two
 *    hand-allowlisted "public<Name>Dto(" response projections
 *    (server/http-contracts.ts) already in use for customer-facing reads.
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
  "publicMerchantBrandDto(",
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
  "GET /api/merchants/:id/email-status":
    "boolean-only lookup for the pre-session /business-details soft gate; leading '// Public' comment is misattributed by sliceHandlerBodies to the preceding registration",
  "GET /api/payments/digital-wallet/config":
    "static Apple/Google Pay capability booleans + publishable merchant ids, no secret",
  "GET /api/push/capabilities": "static VAPID/APNs-configured booleans, no secret",
  "GET /api/push/vapid-key": "Web Push VAPID PUBLIC key — not a secret by the standard's own design",
  "GET /api/windcave/env": "publishable Apple/Google Pay merchant ids for the unauthenticated checkout page",
  "GET /api/windcave/status": "diagnostic booleans + non-secret API base URL",
  "GET /uploads/:folder/:name":
    "public by design for merchant logos only (shown to customers on hosted checkout pages); PUBLIC_UPLOAD_FOLDERS in upload-policy.ts is an allowlist checked before the database or disk is consulted, so any other folder — invoice documents in particular — is a 404. Invoice documents are served by GET /api/invoice-documents/:name (authenticated, tenant-scoped) and GET /api/checkout/document/:token (checkout-token). Gap 13, Option C",
  "GET /api/nfc/capabilities": "static tap-to-pay capability booleans, no secret",
  "GET /api/tapt-stones/:id":
    "raw row has no sensitive fields (id/merchantId/name/stoneNumber/qrCodeUrl/paymentUrl/isActive/timestamps) — paymentUrl/qrCodeUrl are already the public payment link",
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
