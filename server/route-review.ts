/**
 * R1-T2 / R1-T3 (plan C10) — the reviewed policy of each route: who may call
 * it and on which tenant's data, and the judgments the plan asks for (input
 * validation, gates, idempotency, side effects, success DTO, error
 * disclosure, and for every caller without a session: authenticity, replay
 * and rate controls).
 *
 * Hand-written, route by route, from reading the handler. The facts it is
 * judged against are generated (route-policy.ts, from route-facts.ts), and
 * route-policy-review.test.ts ties each claim here to them: a route reviewed
 * as owner-only must call an owner check, a merchant route must authenticate,
 * every value read raw must be explained, every error text reaching a response
 * must be accounted for, and so on. Change a handler so a claim stops being
 * true and that test fails.
 *
 * Routes not reviewed yet are listed in REVIEW_PENDING, which may only shrink
 * (PENDING_CEILING): a new route must arrive reviewed.
 */

/** Who a branch of a route serves. */
export type ReviewedPrincipal =
  | "merchant" // a signed-in merchant login (owner or member)
  | "platform-admin" // the validated platform admin (authenticateAdmin / isValidatedPlatformAdmin)
  | "public-bearer" // anyone holding one resource's credential (a payment, checkout, quote, reset or invite token)
  | "public" // anyone at all
  | "provider" // the payment or messaging provider's servers
  | "cron" // the scheduler, with CRON_SECRET
  | "api-key"; // an ecommerce API key

export type MerchantRole = "owner" | "member";

/** Where the tenant (merchant) a request acts on comes from, and how it is held to the caller. */
export type TenantSource =
  | "session" // the session's own merchant; nothing in the request selects a merchant
  | "path-merchant" // a merchant id in the path, checked against the session
  | "resource" // a resource read by id, then held to the caller's merchant
  | "token" // a bearer credential that addresses exactly one resource
  | "board" // a board (stone) of the merchant in the path: a board's public page
  | "number" // a sequential sale number any caller can guess, held to nobody (always a finding)
  | "provider-session" // the provider's own reference (session or message id) selects the resource
  | "key" // the API key's merchant
  | "any-merchant" // the platform admin, across merchants
  | "system" // a scheduled job over every merchant
  | "credentials" // sign-in: the login an email and its password, or Google's verified email, name
  | "mailbox" // the account an address (or number) names, acted on only by emailing that address; the same answer for any
  | "none"; // no merchant data

/** What an error response can reveal. */
export type ErrorDisclosure =
  | "fixed" // fixed messages only
  | "input-issues" // validation issues about the caller's own input
  | "domain-errors" // this app's own domain errors (fixed text per error)
  | "provider-text"; // a provider's or library's error text — always also a finding

export interface ReviewedBranch {
  principal: ReviewedPrincipal;
  /** What selects this branch, when a route has more than one. */
  when?: string;
  /** For a merchant branch: the roles admitted. */
  roles?: MerchantRole[];
  /** For a merchant branch: the validated platform admin is admitted too. */
  platformAdmin?: true;
  tenant: TenantSource;
  /** The ownership rule in words; for "resource", names the storage read or comparison that holds it. */
  tenantRule: string;
}

export interface UnauthenticatedControls {
  /** How the caller proves who they are, or why nothing needs proving. */
  authenticity: string;
  /** What a replayed request can do. */
  replay: string;
  /** The rate limit; starts with "none" when there is none. */
  rate: string;
}

export interface RouteReview {
  branches: ReviewedBranch[];
  /** Path, query and body validation; names every value read without a strict parser. */
  input: string;
  /** Capability or payment-mode gate, or null. */
  capability: string | null;
  /** Billing / entitlement gate, or null. */
  entitlement: string | null;
  /** Idempotency scope: what repeating the request does. */
  idempotency: string;
  /** Effects outside this server's storage, or null. */
  sideEffects: string | null;
  /** What a success returns. */
  successDto: string;
  errorDisclosure: ErrorDisclosure[];
  /** Required when any branch serves a caller without a session. */
  controls?: UnauthenticatedControls;
  /** Anything wrong or doubtful: to fix, or to put to the owner. */
  findings?: string[];
}

const PROVIDER_ACK = '200 "OK" at once, before any work; nothing else is returned';

// ── Per-payment links (/api/pay/t/:token) ──
const TOKEN_TENANT_RULE =
  "the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404";
const TOKEN_INPUT = "token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up";
const TOKEN_AUTHENTICITY =
  "holding the sale's link: its token is the credential for that one sale and for nothing else";
const TOKEN_SHARE_INPUT =
  "share: read with Number() and required to be a whole number of at least 1 (not the strict parser: finding)";
const TOKEN_SHARE_FINDING =
  "share is parsed with Number(), which accepts forms such as 1e0, 0x1 and ' 1' that the plan's strict parser (§8.4) refuses; the same on the receipt, its PDF and its QR.";
// ── Numbered (board) sales: /api/transactions/:id and friends ──
const NUMBER_TENANT_RULE =
  "the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)";
const NUMBER_AUTHENTICITY =
  "anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting";
const NUMBERED_SALE_FINDING =
  "Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.";
const CHECK_RATE_LIMIT =
  "checkRateLimit (100 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)";
const SPLIT_SHARE_FINDING =
  "A split share is marked paid without comparing what the provider charged with the share. Until 2026-09-26 the pay route let the customer choose the amount, so every share of a $100 sale could be paid with $0.01 and the sale showed fully paid (shown in the harness); the owner chose exact shares only, and the pay route now opens every session for exactly what is owed. What remains is one session settling twice (gap 11's replay; the read-then-write settlement, R3/C20); the amount check itself is R2/R3 (plan lines 870, 1511).";
const GAP11_REPLAY_FINDING =
  "Gap 11 (known, escalated 2026-09-13): the finaliser re-settles on every call with the bound session, and after a share it resets the session to pending, so one approved session can complete the next share too. Closed by moving onto the payment_attempts engine (C3).";

// ── Invoice checkout (property rent and trades invoices): /api/checkout/* ──
const CHECKOUT_TENANT_RULE =
  "the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404";
const CHECKOUT_AUTHENTICITY =
  "holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else";
const CHECKOUT_RATE =
  "tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)";
const SPLIT_INVOICE_SHARE_FINDING =
  "What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment: sessions opened at once are all charged the equal share, so up to one cent per share of the remainder can go uncharged. Since 2026-09-26 the count locks once any session is opened (0030), so a share opened at 1/12 can no longer count as 1/2. The remainder is R3's (payment attempts).";
const RESESSION_FINDING =
  "Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).";
const QUOTE_TENANT_RULE =
  "the quote's token (20 random bytes, base64url) selects its one quote (getQuoteByToken); an unknown token is 404";
const QUOTE_AUTHENTICITY = "holding the quote's link: its token is the credential for that one quote";
const QUOTE_WHOLE_ROW_FINDING =
  "Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).";

// ── Sign-in entry points: /api/auth/*, the admin sign-in, sign-up, confirmation, invites ──
// The attempt limits (server/auth-throttle.ts) are counted in the database (auth_throttle), so
// across server instances; an address's own count starts only once TRUST_PROXY_HOPS is set.
const SIGN_IN_RATE =
  "takeAuthThrottleSlot before the password is checked: per email (a device that has signed in with it is counted on its own), 5 free, then waits from 30 s doubling to 15 minutes, never a lockout; per visitor address (50 free) once TRUST_PROXY_HOPS is set (R1-T4 phase B). Counted in the database, so across server instances";
const EVEN_ANSWER =
  "one fixed message for every address, never sooner than ACCOUNT_EMAIL_REPLY_FLOOR_MS after the request began (owner decision 2026-09-23), so neither the answer nor its timing tells which addresses have accounts";
const ONE_TIME_TOKEN_RATE =
  "none — the token is 32 random bytes and only its hash is looked up, so it cannot be guessed; a password is hashed only once a live token is found";
const CONFIRMATION_TOKEN_FINDING =
  "The sign-up confirmation token is stored as it was sent, not hashed (reset and invite tokens keep only a SHA-256), and never expires: anyone who can read the merchants table holds every waiting application's link. Here the link alone confirms nothing (the password chosen at sign-up is asked for).";

// ── Public pages, configuration and boards ──
const FIXED_CONTENT_CONTROLS: UnauthenticatedControls = {
  authenticity: "none needed: the same fixed content for every caller",
  replay: "read-only",
  rate: "none — no limit; nothing is looked up",
};
const CONFIGURATION_CONTROLS: UnauthenticatedControls = {
  authenticity: "none needed: the platform's own settings, none of them secret",
  replay: "read-only",
  rate: "none — no limit; nothing is looked up",
};
const RETIRED_NO_BOARD_RULE =
  "none: the business-wide no-board address was retired on 2026-09-25 (server/no-board-address.ts); every well-formed number gets the same 410 notice, and nothing is read";
const RETIRED_NO_BOARD_CONTROLS: UnauthenticatedControls = {
  authenticity: "none needed: the same notice for every number",
  replay: "read-only",
  rate: "none — no limit; nothing is read",
};
const BOARD_PAGE_AUTHENTICITY =
  "none: a board's page is public by design (owner 2026-09-25: with a board, its own page and stream are unchanged); the business and board numbers are both sequential, so anyone can follow any board's open sale, its item and price, by counting";
const BOARD_PAGE_RULE =
  "a board's customer page: the board (stoneId) must belong to the business in the path, and only that board's open sale is shown, never a sale with its own link";
const SIGNED_IN_BUSINESS_RULE =
  "checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business";

// ── The platform admin (batch 4) ──
const ADMIN_AUDIT =
  "an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)";
const ADMIN_ANY_BUSINESS =
  "any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses";
const ADMIN_EVERY_BUSINESS =
  "every business at once: the validated platform admin (authenticateAdmin) sees the whole platform";
const ADMIN_OWN = "none: the admin's own session or request; no business's data";
const NO_ADMIN_SCREEN =
  "No admin screen calls it: the live admin area (/admin: the overview, the businesses, one business, API, analytics) does not, and admin-merchant.tsx, admin-merchant-broken.tsx, admin-dashboard.tsx, admin-api.tsx, admin-revenue.tsx and create-merchant.tsx are mounted nowhere (checked 2026-09-26)";
const ADMIN_EACH_BUSINESS_FINDING =
  "Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.";

// ── The account (batch 5) ──
/** The platform admin passes authenticateToken with no business; these routes then refuse it. */
const adminRefused = (refusal: string) => `the platform admin, with no business, is refused (${refusal})`;
const sessionBusiness = (refusal: string) =>
  `the session's own business: nothing in the request names one; ${adminRefused(refusal)}`;
/** P2.2's answer to a principal without the tenant; it was 400 "Merchant ID required" or 401 "Authentication required", route by route. */
const ADMIN_403 = '403 "Merchant access required", since 2026-09-27 (R1-T3)';
const CREATES_SUBSCRIPTION = "apart from getOrCreateSubscription, which makes the business's subscription row if it has none";
const TUTORIAL_SHARED =
  "The tutorial is the business's, not the login's: a teammate's progress, dismissal or restart applies to every login of the business, the owner's included (shown in the harness: a teammate's restart moved the business to generation 2). A product choice, recorded.";
const PUSH_SWITCHES_FAULT_AS_DEFAULTS =
  "A database fault reading the switches reads as the defaults (getPushNotificationPreferences answers them on any error), so the page shows the default switches instead of that it could not check (R1-T9's rule).";
const OWN_SWITCHES = "each login its own (owner decision 2026-09-26)";

// ── The business's own settings, boards and stock (batch 6) ──
const BUSINESS_OWNER_RULE =
  "checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business";
const TEAM_BOARDS =
  "Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).";
const BOARD_ROW = "a whole board row (number, name, page and QR addresses, whether active, when made and changed)";
const STOCK_ROW = "a whole item row (name, description, cost, emoji, variations, whether active, when made and changed)";

// ── The business's sales, refunds and reports (batch 6b) ──
const ADMIN_MONEY =
  "The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales, take Tap to Pay and cancel sales for any business; no admin screen does: kept by the owner's decision (2026-09-29).";
const REFUND_ROW = "whole refund rows (amount, reason, method, status, the provider's refund id, when made and completed)";

// ── The property routes (batch 6c) ──
const PROPERTY_ADMIN = adminRefused(ADMIN_403);
const propertyRecord = (what: string, read: string) =>
  `the ${what} read by id (${read}) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403)`;
const propertyId = (name: string) =>
  `${name}: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)`;
const PROPERTY_TEAM =
  "Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).";
const TENANT_ROW =
  "a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)";
const AUTOMATION_ROW =
  "a whole automation row (the tenant, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)";
const RENT_INVOICE_ROW =
  "a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id)";
const RENT_DELIVERY =
  "sends the tenant the payment link by the invoice's channel: WhatsApp or SMS when chosen, configured and the tenant has a phone, otherwise email (resendInvoiceEmail, then deliverInvoice, server/property-cron.ts)";
const paidElsewhereFinding = (action: string) =>
  `${action} while the tenant is paying: the provider's completion then finds the invoice settled (finalizeRentInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (Split_Share_Unrecorded). R3 (payment attempts).`;

// ── The trades routes (batch 6d) ──
const TRADES_ADMIN = adminRefused(ADMIN_403);
const tradesRecord = (what: string, read: string) =>
  `the ${what} read by id (${read}) must be the session's business's: another business's is 404, the same as a missing one`;
const tradesId = (name: string) =>
  `${name}: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)`;
const TRADES_TEAM =
  "Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).";
const CLIENT_ROW =
  "a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)";
const QUOTE_ROW =
  "a whole quote row (the client, the public link's token, status, line items, subtotal, GST and how it was counted, total, the deposit's type, value and amount, channel, valid until, notes, an attached document's reference and name, when sent, viewed, accepted or declined, made and changed)";
const JOB_INVOICE_ROW =
  "a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id)";
const RECURRING_ROW =
  "a whole recurring invoice row (the client, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)";
const tradesDelivery = (what: string) =>
  `sends the client ${what} by its channel: WhatsApp or SMS when chosen, configured and the client has a phone, otherwise email (server/trades-delivery.ts)`;
const INVOICE_DELIVERY_REASON = "deliveryReason (a fixed code: not_found, not_payable, missing_data, send_failed or no_deliverable)";
const tradesPaidElsewhereFinding = (action: string) =>
  `${action} while the client is paying: the provider's completion then finds the invoice settled (finalizeTradeInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (split_share_unrecorded). R3 (payment attempts).`;
const archivedStillFinding = (what: string) =>
  `An archived client can still be ${what} here; no screen offers it (the pickers list only current clients). Only a recurring invoice is refused for one (owner decision 2026-09-27).`;

function tokenRate(family: string, perMinute: number): string {
  return (
    `requirePaymentTokenRateLimit (the ${family} family: ${perMinute} a minute per visitor address, counted in ` +
    "this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)"
  );
}

export const ROUTE_REVIEW: Record<string, RouteReview> = {
  // ── Batch 1 (2026-09-26): provider callbacks, cron, the ecommerce API, billing callbacks ──

  "ALL /api/pay/notification/:state": {
    branches: [
      {
        principal: "provider",
        tenant: "token",
        tenantRule:
          "the return state (HMAC-derived, one per payment attempt) selects one attempt through paymentAttempts.resolveReturnState; an unknown state does nothing",
      },
    ],
    input:
      "state: an opaque return state, only resolved by its hash; result (query or body): read only to label a provider-declined outcome as cancelled rather than declined",
    capability: "isWindcaveConfigured(): with no provider configured the attempt stays pending",
    entitlement: null,
    idempotency:
      "paymentAttempts.claimFinalization claims the attempt before the provider is queried; a terminal or conflicting attempt is left alone, so repeated or concurrent notifications settle it once",
    sideEffects:
      "queries the provider for the attempt's session; on settlement, a live update and a push to the business (persistTokenOutcome, broadcastToStone)",
    successDto: PROVIDER_ACK,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none needed: the call only prompts a re-read, and the outcome comes from querying the provider, never from the request",
      replay: "harmless: a settled attempt is terminal and the claim is atomic",
      rate: "requirePaymentTokenRateLimit (the completion family, per visitor address)",
    },
  },

  "ALL /api/windcave/notification": {
    branches: [
      {
        principal: "provider",
        tenant: "provider-session",
        tenantRule:
          "the provider's session id selects the one sale created with it (storage.getTransactionByWindcaveSessionId); an unknown id does nothing",
      },
    ],
    input:
      "sessionId / sessionid (query or body): an opaque provider session id, used only to find the sale and to query the provider; the rest of the body is ignored",
    capability: "isWindcaveConfigured(): unconfigured, the notification is ignored before any write",
    entitlement: null,
    idempotency:
      "only a sale whose session is still pending is processed, but pending → processing is a read then a write, not a claim (finding)",
    sideEffects:
      "queries the provider; settles the sale or its next split share, counts the sale on the business, and sends the business a live update and a push",
    successDto: PROVIDER_ACK,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none needed from the caller: the outcome comes from querying the provider with the stored session id",
      replay: "a settled session is skipped (no longer pending); two simultaneous duplicates can both pass the read",
      rate: "none — anyone can make the server query the provider about a pending session whose id they hold; the ids are unguessable provider session ids",
    },
    findings: [
      "pending → processing is a read then a write, not an atomic claim: two simultaneous notifications for one session can both query the provider and both settle it (a second count increment, a second push). Plan 22.7 / R3 (C20) owns the single atomic finaliser.",
      "Logs the raw query (with the session id), and the query and body when no session id is found, to the server log.",
    ],
  },

  "POST /api/v1/transactions": {
    branches: [
      {
        principal: "api-key",
        tenant: "key",
        tenantRule: "the sale is created for the API key's own merchant (req.apiKey.merchantId); no merchant id is read from the request",
      },
    ],
    input:
      "the key's create_transactions permission is checked first (403), then the body: apiV1CreateTransactionSchema (amount, currency, item_name, and webhook_url as a URL of at most 2048 characters)",
    capability:
      "requireEcommerceApi (FEATURE_ECOMMERCE_API, off by default: 404) and config.features.newRetailPayments (503 while per-payment links are off)",
    entitlement: "requireBillingCard: 402 BILLING_CARD_REQUIRED without a paid plan",
    idempotency: "none: every call creates another sale and another payment link (no idempotency key)",
    sideEffects:
      "creates a per-payment sale (createRetailTransaction, server/retail-transaction-service.ts), writes an API log row, and records a webhook delivery row that nothing sends",
    successDto:
      "fields listed one by one: id, amount, currency, item_name, status, payment_url, qr_code_url (the payment link's raw token, given once), created_at; publicTransactionDto is only the stored webhook payload",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "a Bearer API key found with storage.getApiKeyByKey and active; create_transactions permission",
      replay: "a replayed request creates another sale",
      rate: "none — no per-key or per-address limit",
    },
    findings: [
      "webhook_url from the caller is stored as a webhook delivery row. Nothing delivers those rows today; any future delivery worker must restrict destinations (server-side request forgery).",
      "No rate limit and no idempotency key on an API that creates payment links (behind FEATURE_ECOMMERCE_API, off by default; plan 15.5 decides the API's future).",
    ],
  },

  "GET /api/v1/transactions/:id": {
    branches: [
      {
        principal: "api-key",
        tenant: "resource",
        tenantRule:
          "storage.getTransaction(id), then the sale's merchant must equal the key's merchant; another merchant's sale answers the same 404 as a missing one",
      },
    ],
    input: "id: strictPositiveIntegerParam (400 otherwise); the raw id is only echoed into the error log row",
    capability: "requireEcommerceApi (FEATURE_ECOMMERCE_API, off by default: 404)",
    entitlement: null,
    idempotency: "read-only (it writes an API log row)",
    sideEffects: null,
    successDto:
      "fields listed one by one: id, amount, currency, item_name, status, created_at, windcave_transaction_id",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "a Bearer API key found with storage.getApiKeyByKey and active; read_transactions permission",
      replay: "read-only",
      rate: "none — no per-key or per-address limit",
    },
  },

  "ALL /api/billing/card/notification": {
    branches: [{ principal: "provider", tenant: "none", tenantRule: "reads nothing and writes nothing" }],
    input: "nothing is read",
    capability: null,
    entitlement: null,
    idempotency: "does nothing",
    sideEffects: null,
    successDto: '200 "OK"',
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none needed: the call does nothing. A stored card is saved only when the signed-in owner's browser confirms it (POST /api/billing/card/confirm), which re-reads the session from the provider",
      replay: "harmless",
      rate: "none — there is nothing to limit",
    },
  },

  "GET /api/billing/card/callback": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "reads nothing; sends the browser back to billing settings" }],
    input:
      "result (query or body): reduced by safeBillingCardCallbackResult to approved, declined, cancelled or unknown before it enters the redirect",
    capability: null,
    entitlement: null,
    idempotency: "does nothing",
    sideEffects: null,
    successDto: "302 to /settings?section=billing&card=<one of the four results>",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "anyone: the redirect carries only one of four fixed words, and the settings page then asks the server, signed in, to confirm the card",
      replay: "harmless",
      rate: "none — there is nothing to limit",
    },
  },

  "POST /api/billing/card/callback": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "reads nothing; sends the browser back to billing settings" }],
    input:
      "result (query or body): reduced by safeBillingCardCallbackResult to approved, declined, cancelled or unknown before it enters the redirect",
    capability: null,
    entitlement: null,
    idempotency: "does nothing",
    sideEffects: null,
    successDto: "302 to /settings?section=billing&card=<one of the four results>",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "anyone: the redirect carries only one of four fixed words, and the settings page then asks the server, signed in, to confirm the card",
      replay: "harmless",
      rate: "none — there is nothing to limit",
    },
  },

  "ALL /api/windcave/rent-notification": {
    branches: [
      {
        principal: "provider",
        tenant: "provider-session",
        tenantRule:
          "the provider's session id selects the one rent invoice created with it (storage.getInvoiceRentRequestByWindcaveSessionId), or the split invoice it was recorded for (getInvoiceSplitSession, since 2026-09-26); an unknown id does nothing",
      },
    ],
    input: "sessionId / sessionid (query or body): an opaque provider session id; nothing else is read",
    capability: "isWindcaveConfigured(): unconfigured, the notification is ignored",
    entitlement: null,
    idempotency:
      "a settled invoice (paid, paid externally, voided) is skipped; a split share is claimed atomically per session (storage.atomicClaimSplitShare), but a single payment is marked paid by a read then a write (finding)",
    sideEffects: "queries the provider; when paid, emails the GST invoice (sendRentGstInvoices → sendGstInvoices)",
    successDto: PROVIDER_ACK,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none needed from the caller: the outcome comes from querying the provider with the stored session id",
      replay: "a settled invoice is skipped; two simultaneous duplicates of a single payment can both pass the read",
      rate: "none — any caller can prompt a provider query for a pending session whose id they hold",
    },
    findings: [
      "finalizeRentInvoice marks a single (unsplit) payment paid after a plain read: this notification and the browser's return arriving together can both record it, logging Payment_Received twice and sending the GST invoice twice. Plan 22.7 / R3 (C20).",
    ],
  },

  "ALL /api/windcave/trades-notification": {
    branches: [
      {
        principal: "provider",
        tenant: "provider-session",
        tenantRule:
          "the provider's session id selects the one job invoice created with it (storage.getJobInvoiceByWindcaveSessionId), or the split invoice it was recorded for (getInvoiceSplitSession, since 2026-09-26); an unknown id does nothing",
      },
    ],
    input: "sessionId / sessionid (query or body): an opaque provider session id; nothing else is read",
    capability: "isWindcaveConfigured(): unconfigured, the notification is ignored",
    entitlement: null,
    idempotency:
      "a settled invoice is skipped; a split share is claimed atomically per session (storage.atomicClaimJobSplitShare), but a single payment is marked paid by a read then a write (finding)",
    sideEffects:
      "queries the provider; when paid, sends the payment invoice (sendTradePaymentInvoice: email or SMS). The facts also list the rent path's GST email, which finalizeCheckoutInvoice can call, but this route always passes a trades invoice",
    successDto: PROVIDER_ACK,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none needed from the caller: the outcome comes from querying the provider with the stored session id",
      replay: "a settled invoice is skipped; two simultaneous duplicates of a single payment can both pass the read",
      rate: "none — any caller can prompt a provider query for a pending session whose id they hold",
    },
    findings: [
      "finalizeTradeInvoice marks a single payment paid after a plain read: a notification and the browser's return arriving together can both record it and send the payment invoice twice. Plan 22.7 / R3 (C20).",
    ],
  },

  "POST /api/webhooks/whatsapp": {
    branches: [
      {
        principal: "provider",
        tenant: "provider-session",
        tenantRule:
          "the WhatsApp message id selects the property or trades invoice that sent it (getInvoiceRentRequestByWhatsappMessageId / getJobInvoiceByWhatsappMessageId); an unknown id does nothing",
      },
    ],
    input:
      "body: event and data read without a schema; only event 'messages.update' is used, and from each update only key.id and update.status",
    capability: null,
    entitlement: null,
    idempotency:
      "the delivered time is stamped once (only while unset); every status is appended as an event, so a replay adds duplicate events",
    sideEffects: null,
    successDto: PROVIDER_ACK,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "the apikey header must equal EVOLUTION_API_KEY, compared in constant time (presentedSecretMatches); with no key configured nobody is believed (it failed open until 2026-09-26)",
      replay: "a caller with the key can replay a status: it adds a duplicate event; the delivered time is set once",
      rate: "none — no limit",
    },
  },

  "GET /api/internal/cron/status": {
    branches: [{ principal: "cron", tenant: "none", tenantRule: "no merchant data: whether a run is in progress, and the last run's summary" }],
    input: "nothing is read but the x-cron-secret header",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ configured, running, startedAt, lastRun }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "x-cron-secret must equal CRON_SECRET, compared in constant time (authorizeCronRequest); 503 when CRON_SECRET is unset",
      replay: "read-only",
      rate: "none — the secret is the only gate",
    },
  },

  "POST /api/internal/cron": {
    branches: [{ principal: "cron", tenant: "system", tenantRule: "a scheduled run over every merchant's billing, invoices and reminders" }],
    input: "nothing is read but the x-cron-secret header (link URLs come from getBaseUrl(req))",
    capability: null,
    entitlement: null,
    idempotency:
      "one run at a time in this server process (409 while one runs); each pass is meant to act once per period. Another server instance can run at the same time (finding)",
    sideEffects:
      "charges stored cards for due subscriptions (server/subscription-cron.ts); generates and sends property and trades invoices and reminders by email or SMS (server/property-cron.ts, server/trades-cron.ts, server/trades-delivery.ts); daily payout notifications (server/daily-payout-notifications.ts)",
    successDto: "200, or 207 when a pass failed: { ok, ranAt, failedPasses, and each pass's counts }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "x-cron-secret must equal CRON_SECRET, compared in constant time (authorizeCronRequest); 503 when CRON_SECRET is unset",
      replay: "starts another run once the last has finished; each pass is meant to be idempotent per period",
      rate: "none — the secret is the only gate",
    },
    findings: [
      "Overlapping runs are refused only within one server process (the in-memory cronRunning flag): two instances can run the passes at once. Plan 13.3 (durable cron leases).",
    ],
  },

  // ── Batch 2a (2026-09-26): per-payment links and the payment return ──

  "GET /api/pay/t/:token": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: TOKEN_TENANT_RULE }],
    input: `${TOKEN_INPUT}; nothing else is read`,
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "tokenPaymentDto: the sale's item, price, status and split state, and the business's public details (name, contact, address, GST number, NZBN, logo, theme); a failed or cancelled sale answers 410 with the same",
    errorDisclosure: ["fixed"],
    controls: { authenticity: TOKEN_AUTHENTICITY, replay: "read-only", rate: tokenRate("resolve", 120) },
  },

  "GET /api/pay/t/:token/qr": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: TOKEN_TENANT_RULE }],
    input: `${TOKEN_INPUT}; size: strictBoundedIntegerQueryParam (100 to 800, default 300)`,
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PNG QR code of this link's own address (/pay/t/<token>), never cached",
    errorDisclosure: ["fixed"],
    controls: { authenticity: TOKEN_AUTHENTICITY, replay: "read-only", rate: tokenRate("qr", 30) },
  },

  "POST /api/pay/t/:token/split": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: TOKEN_TENANT_RULE }],
    input: `${TOKEN_INPUT}; body: { totalSplits: a whole number from 2 to 10 }, nothing else (strict)`,
    capability: null,
    entitlement: null,
    idempotency:
      "only while the sale is pending and the business allowed splitting; storage.createBillSplit sets it up atomically and a sale already split is refused (BillSplitConflictError, 409)",
    sideEffects: "a live update to the business's screens (broadcastToStone)",
    successDto: "tokenPaymentDto of the split sale; no split-payment id is returned",
    errorDisclosure: ["domain-errors"],
    controls: {
      authenticity: TOKEN_AUTHENTICITY,
      replay: "a second split is refused (409)",
      rate: tokenRate("session", 20),
    },
  },

  "GET /api/pay/t/:token/receipt": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${TOKEN_TENANT_RULE}; for a split sale, share picks one of its completed shares (loadTokenReceipt)`,
      },
    ],
    input: `${TOKEN_INPUT}; ${TOKEN_SHARE_INPUT}`,
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "tokenReceiptDto: the sale's item, price, status, method, split counts and date, the business's public details, and the share's index, amount, method and paid time; no internal ids",
    errorDisclosure: ["fixed"],
    controls: { authenticity: TOKEN_AUTHENTICITY, replay: "read-only", rate: tokenRate("resolve", 120) },
    findings: [TOKEN_SHARE_FINDING],
  },

  "POST /api/pay/t/:token/receipt-pdf": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${TOKEN_TENANT_RULE}; for a split sale, share picks one of its completed shares (loadTokenReceipt)`,
      },
    ],
    input: `${TOKEN_INPUT}; ${TOKEN_SHARE_INPUT}`,
    capability: null,
    entitlement: null,
    idempotency: "read-only (a POST so the download is not a link)",
    sideEffects: null,
    successDto: "a PDF receipt of the sale or share (generateReceiptPdf), as an attachment",
    errorDisclosure: ["fixed"],
    controls: { authenticity: TOKEN_AUTHENTICITY, replay: "read-only", rate: tokenRate("completion", 40) },
  },

  "GET /api/pay/t/:token/receipt-qr": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${TOKEN_TENANT_RULE}; for a split sale, share picks one of its completed shares (loadTokenReceipt)`,
      },
    ],
    input: `${TOKEN_INPUT}; ${TOKEN_SHARE_INPUT}; size: strictBoundedIntegerQueryParam (100 to 800)`,
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PNG QR code of the receipt page's address (/receipt/t/<token>, with ?share=n for a share)",
    errorDisclosure: ["fixed"],
    controls: { authenticity: TOKEN_AUTHENTICITY, replay: "read-only", rate: tokenRate("qr", 30) },
  },

  "POST /api/pay/t/:token/session": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: TOKEN_TENANT_RULE }],
    input: `${TOKEN_INPUT}; body: tokenSessionRequestSchema, strict (idempotencyKey: a UUID; amount: optional, and must equal what is owed)`,
    capability:
      "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE) and PAYMENT_RETURN_STATE_SECRET (503 PAYMENT_RETURN_STATE_UNAVAILABLE)",
    entitlement: null,
    idempotency:
      "per sale share and idempotency key: paymentAttempts.claim keeps one active attempt; the same key resumes its attempt and session, another key while one is active is 409, and concurrent creation of one attempt's session is coalesced in this process",
    sideEffects:
      "creates a payment session with the provider (createWindcaveSession); an expired attempt is first reconciled by querying the provider, which can settle it (live update and push to the business)",
    successDto:
      "the provider session id, its hosted-page and submit URLs, attemptState and shareIndex; or, for a settled attempt, its outcome",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: TOKEN_AUTHENTICITY,
      replay: "the same idempotency key returns the same attempt and session; a new key while one is active is refused",
      rate: tokenRate("session", 20),
    },
  },

  "POST /api/pay/t/:token/hosted-fields-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${TOKEN_TENANT_RULE}; the attempt must be this sale's, for this share and idempotency key, with this provider session (prepareTokenCompletion)`,
      },
    ],
    input: `${TOKEN_INPUT}; body: idempotencyKey (a UUID), sessionId (1 to 512 characters), shareIndex (0 to 10), paymentMethod card or apple_pay; strict`,
    capability: "isWindcaveConfigured() (503 while unconfigured: the outcome waits)",
    entitlement: null,
    idempotency: "paymentAttempts.claimFinalization: one finaliser per attempt; a settled attempt returns its outcome",
    sideEffects: "queries the provider for the session's outcome; on settlement a live update and a push to the business",
    successDto: "{ approved, outcome, receiptShare } (tokenAttemptOutcome)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${TOKEN_AUTHENTICITY}, together with the attempt's idempotency key and provider session id`,
      replay: "returns the settled outcome; the outcome always comes from the provider, never from the request",
      rate: tokenRate("completion", 40),
    },
  },

  "POST /api/pay/t/:token/googlepay-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${TOKEN_TENANT_RULE}; the attempt must be this sale's, for this share and idempotency key, with this provider session (prepareTokenCompletion)`,
      },
    ],
    input: `${TOKEN_INPUT}; body: idempotencyKey (a UUID), sessionId (1 to 512 characters), shareIndex (0 to 10), and googlePayToken, an object passed to the provider as it is; strict`,
    capability: "isWindcaveConfigured() (503 while unconfigured: the outcome waits)",
    entitlement: null,
    idempotency:
      "paymentAttempts.claimFinalization: only the first finaliser submits the wallet token; a replay only queries the session, so it cannot charge twice",
    sideEffects:
      "the first finaliser submits the Google Pay token to the provider's submit URL cached for this attempt (assertWindcaveUrl checks it is the provider's); otherwise queries the session; on settlement a live update and a push to the business",
    successDto: "{ approved, outcome, receiptShare } (tokenAttemptOutcome)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${TOKEN_AUTHENTICITY}, together with the attempt's idempotency key and provider session id`,
      replay: "never resubmits the wallet token; returns the settled outcome",
      rate: tokenRate("completion", 40),
    },
  },

  "GET /api/pay/return/:state": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the return state (HMAC-derived from one payment attempt) selects that attempt (paymentAttempts.resolveReturnState); an unknown state is 404",
      },
    ],
    input:
      "state: an opaque return state, resolved by its hash; source: only 'hpp' is acted on; result: only 'cancelled' changes anything (a provider-declined outcome is labelled cancelled)",
    capability: "isWindcaveConfigured() (unconfigured, the attempt stays pending)",
    entitlement: null,
    idempotency:
      "the provider's browser return reconciles through paymentAttempts.claimFinalization, once per attempt; a plain read is read-only",
    sideEffects:
      "on the provider's browser return: queries the provider and settles the attempt (live update and push to the business)",
    successDto: "a browser return is always 303 to /pay/return/<state>; a plain read returns only { outcome, receiptShare }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "holding the attempt's return state, the credential for that one attempt",
      replay: "harmless: settlement is claimed once, and reads are read-only",
      rate: tokenRate("resolve", 120),
    },
  },

  // ── Batch 2b (2026-09-26): numbered (board) sales, their receipts, the Windcave browser return ──

  "POST /api/transactions/:id/split": {
    branches: [{ principal: "public", tenant: "number", tenantRule: NUMBER_TENANT_RULE }],
    input: "id: strictPositiveIntegerParam; body: { totalSplits: a whole number from 2 to 10 }, nothing else (strict, since 2026-09-26)",
    capability: null,
    entitlement: null,
    idempotency:
      "only a pending sale the business allowed to split (409 otherwise, since 2026-09-26); storage.createBillSplit sets it up atomically, returns an exact retry unchanged, and refuses a different split (BillSplitConflictError, 409)",
    sideEffects: "a live update to the business's screens (broadcastToStone)",
    successDto: "publicTransactionDto of the split sale, with its board's page and QR addresses",
    errorDisclosure: ["domain-errors"],
    controls: {
      authenticity: NUMBER_AUTHENTICITY,
      replay: "an exact retry returns the same split; a different one is refused",
      rate: "none — no limit",
    },
    findings: [NUMBERED_SALE_FINDING],
  },

  "GET /api/split-payments/:id": {
    branches: [
      {
        principal: "public",
        tenant: "number",
        tenantRule: "the share's sequential number selects it; a share of a sale with its own link is hidden (404)",
      },
    ],
    input: "id: strictPositiveIntegerParam (checked twice)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "publicSplitPaymentDto: the share's id, sale number, index, amount, status, method and times",
    errorDisclosure: ["fixed"],
    controls: { authenticity: NUMBER_AUTHENTICITY, replay: "read-only", rate: "none — no limit" },
    findings: [NUMBERED_SALE_FINDING],
  },

  "POST /api/transactions/:id/pay": {
    branches: [{ principal: "public", tenant: "number", tenantRule: NUMBER_TENANT_RULE }],
    input:
      "id: strictPositiveIntegerParam; body: paymentRequestSchema (merchantId, stoneId, paymentMethod, cardLast4, amount — all optional; a merchantId or stoneId given must match the sale); amount: never charged — what is owed (the next share, or the whole price) is; an amount given must equal it to the cent, or 400 before any provider session (owner decision 2026-09-26)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE while unconfigured)",
    entitlement: null,
    idempotency:
      "a completed or processing sale is refused (409); otherwise every call creates a new provider session and binds it to the sale, replacing the last one",
    sideEffects:
      "creates a payment session with the provider (createWindcaveSession); when the provider reports the session already complete, settles the sale (live update and push)",
    successDto: "the provider session id and its hosted-page and submit URLs (kept server-side too, and never taken back from a client)",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: NUMBER_AUTHENTICITY,
      replay: "each call opens another provider session for the same sale",
      rate: CHECK_RATE_LIMIT,
    },
    findings: [NUMBERED_SALE_FINDING],
  },

  "POST /api/transactions/:id/hosted-fields-complete": {
    branches: [
      {
        principal: "public",
        tenant: "number",
        tenantRule: `${NUMBER_TENANT_RULE}; the session id sent must be the one bound to the sale (403 otherwise)`,
      },
    ],
    input:
      "id: strictPositiveIntegerParam; body read without a schema: sessionId (required, compared with the bound session) and paymentMethod (only apple_pay is kept, anything else is card)",
    capability: "isWindcaveConfigured() (503 while unconfigured)",
    entitlement: null,
    idempotency: "none: every call queries the provider and settles again (gap 11, finding)",
    sideEffects:
      "queries the provider for the bound session; settles the sale or its next share, counts it on the business, and sends a live update and a push",
    successDto: "{ approved, redirectPath } to the receipt or the declined page",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${NUMBER_AUTHENTICITY}, with the provider session id bound to it`,
      replay: "settles again; after a share, the same session can complete the next one (gap 11)",
      rate: "none — no limit",
    },
    findings: [NUMBERED_SALE_FINDING, GAP11_REPLAY_FINDING, SPLIT_SHARE_FINDING],
  },

  "POST /api/transactions/:id/googlepay-complete": {
    branches: [
      {
        principal: "public",
        tenant: "number",
        tenantRule: `${NUMBER_TENANT_RULE}; the session id sent must be the one bound to the sale (403 otherwise)`,
      },
    ],
    input:
      "id: strictPositiveIntegerParam; body read without a schema: sessionId (required, compared with the bound session) and googlePayToken (an object passed to the provider)",
    capability: "isWindcaveConfigured() (503 while unconfigured)",
    entitlement: null,
    idempotency:
      "none: the wallet token is submitted to the provider's submit URL cached for the sale when there is one, otherwise the session is queried, and the result is settled again on every call (gap 11)",
    sideEffects:
      "submits the Google Pay token to the provider's cached submit URL (assertWindcaveUrl checks it) or queries the session; settles the sale or its next share, counts it, and sends a live update and a push",
    successDto: "{ approved, redirectPath } to the receipt or the declined page",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${NUMBER_AUTHENTICITY}, with the provider session id bound to it`,
      replay: "settles again; after a share, the same session can complete the next one (gap 11)",
      rate: "none — no limit",
    },
    findings: [NUMBERED_SALE_FINDING, GAP11_REPLAY_FINDING, SPLIT_SHARE_FINDING],
  },

  "GET /api/transactions/:id": {
    branches: [{ principal: "public", tenant: "number", tenantRule: NUMBER_TENANT_RULE }],
    input: "id: strictPositiveIntegerParam",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "publicTransactionDto: id, business id, board id, item, price, status, method, split counts and date, and the board's page address; with merchant: publicBusinessDto, the business's name, address, phone, GST number, NZBN, logo and theme (since 2026-09-26, when the by-number business read was retired; never the contact email or the holder's name)",
    errorDisclosure: ["fixed"],
    controls: { authenticity: NUMBER_AUTHENTICITY, replay: "read-only", rate: "none — no limit" },
    findings: [
      `${NUMBERED_SALE_FINDING} With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board, and, since the by-number business read was retired (2026-09-26), each selling business's receipt details, which moved here.`,
    ],
  },

  "POST /api/transactions/:id/receipt-pdf": {
    branches: [{ principal: "public", tenant: "number", tenantRule: NUMBER_TENANT_RULE }],
    input:
      "id: strictPositiveIntegerParam; splitId: present, it must pass strictPositiveIntegerQueryParam (400 otherwise), belong to the sale and be completed",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PDF receipt of a completed sale or share (generateReceiptPdf), as an attachment",
    errorDisclosure: ["fixed"],
    controls: { authenticity: NUMBER_AUTHENTICITY, replay: "read-only", rate: "none — no limit" },
    findings: [NUMBERED_SALE_FINDING],
  },

  "GET /api/transactions/:id/receipt-qr": {
    branches: [{ principal: "public", tenant: "number", tenantRule: NUMBER_TENANT_RULE }],
    input: "id: strictPositiveIntegerParam (checked twice); size: strictBoundedIntegerQueryParam (up to 800)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PNG QR code of the receipt page's address (/receipt/<number>), cached publicly for 7 days",
    errorDisclosure: ["fixed"],
    controls: { authenticity: NUMBER_AUTHENTICITY, replay: "read-only", rate: "none — no limit" },
    findings: [NUMBERED_SALE_FINDING],
  },

  "GET /api/windcave/callback": {
    branches: [
      {
        principal: "public",
        tenant: "number",
        tenantRule:
          "the sale's number (transactionId), or else the provider session id, selects the sale; a sale with its own link is sent home as a missing one is (302, since 2026-09-27: its 404 told a caller counting through the numbers which were link sales); a cancel is believed only with the bound session id",
      },
    ],
    input:
      "transactionId: read into a variable, then strictPositiveIntegerQueryParam (a malformed one finds nothing, since 2026-09-26); sessionId / sessionid: compared with the bound session before a cancel is believed; result: only 'cancelled' is acted on; any 'sim' key rejects the request (400)",
    capability: "isWindcaveConfigured(): unconfigured, nothing is settled and the customer sees pending",
    entitlement: null,
    idempotency:
      "an already approved or declined sale only redirects; otherwise pending → processing is a read then a write, like the notification's (R3 / C20)",
    sideEffects:
      "queries the provider for the bound session and settles the sale or its next share (count, live update, push); a matching cancel fails the sale (live update, push)",
    successDto: "302 to the receipt, or to the result page (declined, cancelled or pending), or home",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        `${NUMBER_AUTHENTICITY}; the outcome always comes from querying the provider, and a cancel needs the bound session id`,
      replay: "a settled sale only redirects; simultaneous calls can both settle (R3 / C20)",
      rate: "none — anyone can prompt a provider query for a pending numbered sale",
    },
    findings: [
      NUMBERED_SALE_FINDING,
      "Settles by a read then a write, not a claim, racing the notification (plan 22.7 / R3, C20).",
    ],
  },

  // ── Batch 3a (2026-09-26): invoice checkout and quote links ──
  "GET /api/checkout/resolve/:token": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: CHECKOUT_TENANT_RULE }],
    input: "token: read raw, then looked up (only a real token finds an invoice)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "for a payable invoice: vertical, invoice id, amount, due date, status, the business's id, name and logo, the payer's name, address and co-tenants, kind and charge type, rent frequency or the quote's total and deposit terms, the description, a token-scoped document link (gap 13) and the split state; for a paid one only { alreadyPaid, amountCents }",
    errorDisclosure: ["fixed"],
    controls: { authenticity: CHECKOUT_AUTHENTICITY, replay: "read-only", rate: CHECKOUT_RATE },
  },

  "GET /api/checkout/document/:token": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${CHECKOUT_TENANT_RULE}; the file must be the invoice's own attachment and belong to the invoice's business (getUploadedFileForMerchant)`,
      },
    ],
    input: "token: must match /^[A-Za-z0-9_-]{1,200}$/ (404 otherwise), then looked up",
    capability: null,
    entitlement: null,
    idempotency: "read-only (each read spends the link's read budget)",
    sideEffects: null,
    successDto: "the attached document's bytes, with its stored type, Cache-Control private, no-store and nosniff (sendPrivateDocument)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "read-only",
      rate:
        "storage.consumeInvoiceDocumentReadLimit: 10 a minute per real link, shared through the database; an unknown link is 404 before it, and a limiter outage is 503 (fails closed)",
    },
  },

  "POST /api/checkout/:token/split": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: CHECKOUT_TENANT_RULE }],
    input: "token: read raw, then looked up; body: count, a whole number from 2 to 12, strict (400 otherwise; parseInt until 2026-09-26)",
    capability: null,
    entitlement: null,
    idempotency: "sets the invoice's share count; refused once any session has been opened for it or a share is paid (409, since 2026-09-26) and when the business has not allowed splitting (400)",
    sideEffects: null,
    successDto: "{ splitCount, splitPaidCount: 0, shareCents }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "the same count again changes nothing; another count is taken only until someone starts paying",
      rate: CHECKOUT_RATE,
    },
    findings: [SPLIT_INVOICE_SHARE_FINDING],
  },

  "POST /api/checkout/:token/session": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: CHECKOUT_TENANT_RULE }],
    input: "token: read raw, then looked up; body read without a schema: payerEmail (checked as an email address; for a split invoice kept with that session only, never on a list)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE)",
    entitlement: null,
    idempotency: "none: every call opens another provider session (finding)",
    sideEffects:
      "creates a payment session with the provider (createWindcaveSession) and, for a split invoice, records it with its amount and payer's email (recordInvoiceSplitSession, 0030); when the provider reports it already complete, settles the invoice: events, and once paid the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)",
    successDto:
      "the provider session id, the amount and the hosted-fields submit URLs (also cached here against the token, invoiceAjaxUrlCache); or { alreadyComplete, approved }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "each call opens another provider session for the same invoice",
      rate: CHECKOUT_RATE,
    },
    findings: [RESESSION_FINDING, SPLIT_INVOICE_SHARE_FINDING],
  },

  "POST /api/checkout/:token/hosted-fields-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${CHECKOUT_TENANT_RULE}; a single payment must send the session pinned to it, a split share a session recorded for this invoice when it was opened (getInvoiceSplitSession; 403 otherwise, since 2026-09-26)`,
      },
    ],
    input: "token: read raw, then looked up; body read without a schema: sessionId (required; sent to the provider as one encoded path segment)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)",
    entitlement: null,
    idempotency:
      "finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per recorded session (atomicClaimSplitShare / atomicClaimJobSplitShare, then markInvoiceSplitSessionPaid), and an approved session that finds every share paid is recorded for a refund; a single payment settles by a read then a write",
    sideEffects:
      "queries the provider for the session (queryWindcaveSession); once paid, the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)",
    successDto: "{ approved, status, splitCount, splitPaidCount }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${CHECKOUT_AUTHENTICITY}, with the invoice's pinned session for a single payment or a session recorded for it for a split share`,
      replay: "a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)",
      rate: "none — every call asks the provider about the session sent, with the platform's credentials",
    },
  },

  "POST /api/checkout/:token/googlepay-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${CHECKOUT_TENANT_RULE}; a single payment must send the session pinned to it, a split share a session recorded for this invoice when it was opened (getInvoiceSplitSession; 403 otherwise, since 2026-09-26)`,
      },
    ],
    input:
      "token: read raw, then looked up; body read without a schema: sessionId (required), googlePayToken (any object, passed to the provider as it came)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)",
    entitlement: null,
    idempotency:
      "finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per session; a single payment settles by a read then a write",
    sideEffects:
      "submits the Google Pay token to the cached submit URL (submitGooglePayToken, checked by assertWindcaveUrl) or queries the provider (queryWindcaveSession); once paid, the GST invoice email (rent) or the payment invoice (trades)",
    successDto: "{ approved, status, splitCount, splitPaidCount }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${CHECKOUT_AUTHENTICITY}, with the invoice's pinned session for a single payment or a session recorded for it for a split share`,
      replay: "a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)",
      rate: "none — every call reaches the provider, with the platform's credentials",
    },
    findings: [
      "The submit URLs are cached per link, not per session: when two payers of one split invoice open sessions, the first one's Google Pay payment goes to the second one's session, and both sessions are then counted as shares.",
    ],
  },

  "GET /api/checkout/callback": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the invoice's checkout token (20 random bytes, base64url), in the query, selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown one is sent home (302), this being a browser's return (the shared rule's 404 does not apply here; corrected 2026-09-27 by R1-T3's matrix)",
      },
    ],
    input: "query read raw: token (looked up; unknown goes to /) and result (only \"cancelled\" is acted on: no query)",
    capability: "isWindcaveConfigured() (while unconfigured it only redirects)",
    entitlement: null,
    idempotency: "a settled invoice only redirects; otherwise the invoice's pinned session is queried and settled (a split invoice pins none, so nothing is)",
    sideEffects:
      "queries the provider for the pinned session (queryWindcaveSession); once paid, the GST invoice email (rent) or the payment invoice (trades)",
    successDto: "a 302 to the invoice's checkout page (/r/<token>), or to / for an unknown token",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${CHECKOUT_AUTHENTICITY}; the outcome always comes from querying the provider about the pinned session`,
      replay: "a settled invoice only redirects; two calls at once can both settle it (R3 / C20)",
      rate: "none — each call with a real link to an unpaid single-payment invoice asks the provider",
    },
    findings: ["Settles by a read then a write, not a claim, racing the notification (R3 / C20)."],
  },

  "GET /api/trades/quotes/token/:token": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: QUOTE_TENANT_RULE }],
    input: "token: read raw, then looked up",
    capability: null,
    entitlement: null,
    idempotency: "the first read marks a sent quote viewed (and records the event); a quote past its date is marked expired; otherwise read-only",
    sideEffects: null,
    successDto:
      "the quote (the whole row), the client's name and site address, the business's name, trading name and GST settings, previouslyViewed, and once accepted the live invoice's token, kind, amount and status",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: QUOTE_AUTHENTICITY,
      replay: "reading again changes nothing after the first view",
      rate: "none — no limit",
    },
    findings: [QUOTE_WHOLE_ROW_FINDING],
  },

  "GET /api/trades/quotes/token/:token/pdf": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: QUOTE_TENANT_RULE }],
    input: "token: read raw, then looked up",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "the quote as a PDF attachment (generateQuotePdf), named from the business and the token's first 8 characters",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: QUOTE_AUTHENTICITY,
      replay: "read-only",
      rate: "none — every call renders a PDF",
    },
  },

  "POST /api/trades/quotes/token/:token/respond": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: QUOTE_TENANT_RULE }],
    input: "token: read raw, then looked up; body: acceptQuoteSchema (400 with its first issue's message)",
    capability: null,
    entitlement:
      "billingCardIsReady on the quote's business: while its subscription lapses an acceptance is 402 QUOTE_ACCEPTANCE_UNAVAILABLE for the customer, and the business is emailed, at most once per quote per interval (quote-acceptance-notice.ts)",
    idempotency:
      "an accepted or declined quote is 409 and an expired one 410; the status check is a read then a write, so two acceptances at once can each issue an invoice (finding)",
    sideEffects:
      "on acceptance, issues the deposit or full invoice and sends it (resendTradeInvoice: email or SMS); when billing blocks acceptance, emails the business (tellBusinessQuoteAcceptanceBlocked)",
    successDto: "{ quote, depositInvoice, paymentUrl, delivered }: the quote (the whole row), the new invoice and its checkout link",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: QUOTE_AUTHENTICITY,
      replay: "a second response is 409",
      rate: "none — no limit",
    },
    findings: [
      "Two acceptances at once can both pass the status check, and each issues and sends an invoice (a read then a write; R3 / C20).",
      QUOTE_WHOLE_ROW_FINDING,
    ],
  },

  // ── Batch 3b (2026-09-26): sign-in entry points ──
  "GET /api/auth/google": {
    branches: [
      { principal: "public", tenant: "none", tenantRule: "no merchant data: starts a Google sign-in for whoever asks; Google then says who they are" },
    ],
    input:
      "nothing is read from the request; redirect_uri comes from getBaseUrl(req): the configured public origin, or in development the request's own Host",
    capability:
      "Google sign-in configured (config.oauth.googleClientId, server/config.ts): without it the browser goes back to /login with an error",
    entitlement: null,
    idempotency: "each call starts a new sign-in: a fresh state and PKCE verifier replace this browser's cookie; nothing is stored",
    sideEffects: null,
    successDto:
      "302 to Google's consent page with the client id, redirect_uri, state and the PKCE challenge (S256); sets the HttpOnly state cookie (SameSite=Lax, 10 minutes, __Host- on https); Cache-Control no-store",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "anyone: this only starts a sign-in, which Google authenticates and the callback checks",
      replay: "harmless: a new call replaces this browser's pending sign-in",
      rate: "none — it stores nothing and calls no one",
    },
  },

  "GET /api/auth/google/callback": {
    branches: [
      {
        principal: "public",
        tenant: "credentials",
        tenantRule:
          "the login Google's verified email names: the owner of an existing verified or active merchant (linked to one Google id, never re-linked), or a new verified merchant when the address has neither a merchant nor a login. Refused: an email Google has not verified, an address whose login belongs to another merchant or is not its owner (the existingLogin comparisons), a pending or suspended merchant, a merchant linked to another Google id",
      },
    ],
    input:
      "query read raw: code (sent to Google with this browser's PKCE verifier), state (must equal the state cookie's, compared in constant time by verifyGoogleSignInState; both halves must be 43 base64url characters) and error (only its presence is used)",
    capability:
      "Google sign-in configured (config.oauth.googleClientId and googleClientSecret, server/config.ts): without them the browser goes back to /login with an error",
    entitlement: null,
    idempotency:
      "the state cookie is cleared on every call; a new Google user gets one merchant (two first sign-ins at once: the second fails on the unique email and is asked to try again); an existing merchant is linked to the Google id once; each success stores a new one-time handoff code",
    sideEffects:
      "asks Google to exchange the code (oauth2.googleapis.com/token, with the client secret and the PKCE verifier) and for the profile (googleapis.com/oauth2/v2/userinfo); for a new Google user, creates a verified merchant (createMerchantWithPassword) and its owner login (createUser, server/auth.ts, which keeps an existing password)",
    successDto:
      "302 to /login?google=complete, with the one-time handoff code in a second HttpOnly cookie (SameSite=Strict, 60 seconds): never a token in an address. Every refusal is a 302 to /login?error=<a fixed message>",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "Google's authorization code, exchanged with the PKCE verifier from this browser's state cookie, and Google's word that the email is verified. The returned state must equal the cookie's, which stops login CSRF and makes a stolen code useless. The server keeps no record of the pair, so a script can present one of its own making; that gets it only Google's refusal of a made-up code",
      replay: "Google accepts a code once; a replayed cookie and state make the server ask Google again, which refuses the spent code",
      rate:
        "tooManyAttempts after takeAuthThrottleSlot per visitor address (20 free, then waits from 30 s), counted before Google is asked, only once TRUST_PROXY_HOPS is set (R1-T4 phase B, off by default): until then no limit. A success gives its count back",
    },
    findings: [
      "Until TRUST_PROXY_HOPS is set there is no limit: every request carrying a self-made cookie and state makes the server call Google's token endpoint, which refuses the made-up code. Phase B's live check switches the limit on.",
    ],
  },

  "POST /api/auth/google/session": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the one-time handoff code in this browser's cookie selects the one login the callback signed in: only its SHA-256 is looked up, and storage.consumeAuthHandoffCode spends it in one statement (unknown, spent, or older than 60 seconds: 401 GOOGLE_SIGN_IN_EXPIRED)",
      },
    ],
    input: "only the handoff cookie, refused unless it is 43 base64url characters (handoffCodeHash); the body is not read",
    capability: null,
    entitlement: null,
    idempotency: "one-time: the first redemption spends the code (of two at once, exactly one succeeds); the cookie is cleared on every call",
    sideEffects: null,
    successDto:
      "{ token, merchantId, newUser, csrfToken }: the account token in the body only (until phase E3), Cache-Control no-store; starts a session and sets its cookie (R1-T4 phase E). 403 ACCOUNT_UNAVAILABLE when the login is no longer active, its merchant neither verified nor active, or a member over the seat limit (issueTokenForUserId, server/auth.ts)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "the one-time code the callback set in this browser's cookie. SameSite=Strict, so another site cannot make the browser redeem it",
      replay: "refused: the code is spent on first use",
      rate: "none — a 32-byte code that lives 60 seconds cannot be guessed",
    },
  },

  "POST /api/auth/login": {
    branches: [
      {
        principal: "public",
        tenant: "credentials",
        tenantRule:
          "the login the email names, when its password matches (authenticateUser: the password is checked at full cost for every email, one with no login included; then the login must be active, its merchant verified or active, and a member within the seat limit). Every refusal is the same 401",
      },
    ],
    input: "body: loginSchema (400 with its issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "each success starts another session (R1-T4 phase E: a row in auth_sessions keeping only its secret's digest), issues another one-hour token (until phase E3) and records the login time; each failure counts against the email (or this device) and, once addresses are told apart, the visitor's address",
    sideEffects: "security audit log entries (logSecurityEvent: LOGIN_SUCCESS, FAILED_LOGIN, LOGIN_SLOWED, LOGIN_ERROR), with the email and address",
    successDto:
      "{ token, csrfToken, user: { id, email, merchantId, role } }, not cached; sets the session cookie (HttpOnly, Secure, SameSite=Lax, __Host-, 7 days) and the known-device cookie",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "the email and its password",
      replay: "a replayed success issues another token; a replayed failure counts again",
      rate: SIGN_IN_RATE,
    },
  },

  "POST /api/admin/auth/login": {
    branches: [
      {
        principal: "public",
        tenant: "credentials",
        tenantRule:
          "the platform admin: the configured admin email (compared without regard to case) and ADMIN_PASSWORD_HASH; any other email is refused after the same work (checkPasswordEvenly with the admin hash's budget)",
      },
    ],
    input: "body: loginSchema (400 with its issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "each success starts another admin session (R1-T4 phase E) and issues another one-hour admin token (until phase E3); each failure counts against the email (or this device) and the visitor's address",
    sideEffects: "security audit log entries (logSecurityEvent: ADMIN_LOGIN_SUCCESS, ADMIN_FAILED_LOGIN, ADMIN_LOGIN_SLOWED, ADMIN_LOGIN_ERROR)",
    successDto:
      "{ token, csrfToken, user: { id: 1, email, merchantId: 0, role: 'admin' } }, not cached: a one-hour token under the dedicated admin principal; sets the admin session cookie (its own name, 12 hours) and the admin known-device cookie",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "the admin email and its password",
      replay: "a replayed success issues another token; a replayed failure counts again",
      rate: `${SIGN_IN_RATE}; the admin's buckets are its own`,
    },
    findings: [
      "While ADMIN_PASSWORD_HASH is unset (today, everywhere), the admin's email is answered 500 'Admin login unavailable' at once and every other email 401 after a full password check: the answer and its timing show which address is the admin's, against the owner's 2026-09-23 rule for sign-in. It ends when the owner sets the hash (npm run admin:password).",
    ],
  },

  "POST /api/auth/forgot-password": {
    branches: [
      {
        principal: "public",
        tenant: "mailbox",
        tenantRule:
          "the login the email names, reached only by email to that address: only an active owner or member login is sent a link (requestPasswordReset, server/auth.ts); the answer is the same for every address",
      },
    ],
    input: "body: forgotPasswordSchema (400 with its issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "each request for a login replaces its live link (a new token, valid one hour); counted before any link is made, so a refused request leaves the link already sent working",
    sideEffects:
      "for an active login, stores the hash of a new reset token and emails the link (requestPasswordReset → sendPasswordResetEmail, server/auth.ts); security audit log (logSecurityEvent: PASSWORD_RESET_SLOWED)",
    successDto: EVEN_ANSWER,
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "none needed: the link goes only to the address's own mailbox",
      replay: "each replay replaces the live link and sends another email, within the limit",
      rate:
        "takeAuthThrottleSlot per email asked, whether or not it has a login (3 free, then waits from 5 minutes doubling to an hour), and per visitor address (10 free) once TRUST_PROXY_HOPS is set; in the database",
    },
    findings: [
      "A storage or email fault is answered as a success: requestPasswordReset returns false and the route ignores it, so the visitor is told a link was sent when none was. Partly deliberate: only a login's request writes and sends, so an error answered there would show which addresses have logins. A failed lookup, which fails alike for every address, could be answered 500 without that.",
    ],
  },

  "POST /api/auth/reset-password": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the reset token (32 random bytes, hex) selects the one login it was sent to: only its SHA-256 is looked up; it must be live (one hour), the login active and an owner or member (resetPassword, server/auth.ts); storage.resetUserPasswordByToken spends it in the statement that sets the password",
      },
    ],
    input: "body: resetPasswordSchema: the token and a new password meeting the one password rule, with its confirmation (400 with the first issue and the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "one-time: the token is spent with the new password in one statement, and a second use is 400. A storage fault is 500 and changes nothing, so the same link can be tried again (until 2026-09-26 a fault was answered 400 'Invalid or expired reset token')",
    sideEffects:
      "ends every session of the login (its session version, advanced in the same statement; each session also recorded as ended, password_reset, SESSION_REVOKED), closes its live streams (sseBroker.disconnectUser) and stops its devices' notifications; forgives its sign-in slow-downs",
    successDto: "{ message }; marks this browser as a known device for the login",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "holding the emailed reset link: its token is the credential for that one login's reset",
      replay: "refused: the token is spent in the statement that sets the password",
      rate: ONE_TIME_TOKEN_RATE,
    },
  },

  "GET /api/auth/validate-reset-token/:token": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the reset token selects the one login it was sent to: only its SHA-256 is looked up (validateResetToken, server/auth.ts); valid while live, for an active owner or member login",
      },
    ],
    input: "token: read raw, then only its SHA-256 is looked up",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ valid }. A storage fault is 500, not { valid: false } (until 2026-09-26 the helper answered a fault as an expired link, against this route's own comment)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "holding the emailed reset link",
      replay: "read-only",
      rate: "none — the token cannot be guessed, and each call is one read by its hash",
    },
    findings: [
      "The reset page (client/src/pages/reset-password.tsx) shows 'Expired Reset Link' for a failed check as well as for an expired link, and offers only a new link: now that the server answers a fault with 500, the page still has to tell the two apart. R1-T9's rule, but this public page was not on its screen list: put to the owner 2026-09-26.",
    ],
  },

  "POST /api/auth/confirm-email": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the confirmation token selects the one application it was sent for (storage.getMerchantByToken), and the password chosen at sign-up must match it (owner decision 2026-09-23); an application without a chosen password cannot be confirmed online",
      },
    ],
    input: "body read without a schema: token and password, each used only when it is a string (400 when the token is missing)",
    capability: null,
    entitlement: null,
    idempotency:
      "one-time: confirmMerchantEmail clears the token as it confirms the application and activates its pending subscription, in one transaction; a second use is 400",
    sideEffects:
      "for a complete application, emails it to the owner's inbox (sendEmail to oliver@taptpay.co.nz, the text escaped); refreshes the login store (syncVerifiedMerchants, server/auth.ts)",
    successDto: "{ message, merchantId }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "holding the emailed link and the password chosen at sign-up",
      replay: "refused once confirmed: the token is cleared",
      rate:
        "takeAuthThrottleSlot per link before the password is checked: 5 wrong passwords, then waits from 30 s doubling to 15 minutes, as sign-in; in the database",
    },
    findings: [CONFIRMATION_TOKEN_FINDING],
  },

  "POST /api/auth/resend-confirmation": {
    branches: [
      {
        principal: "public",
        tenant: "mailbox",
        tenantRule:
          "the application the email names, reached only by email to its own address: only one still waiting to be confirmed is sent its link again; the answer is the same for every address (owner decision 2026-09-23). Asking by account number was removed on 2026-09-26 (owner decision)",
      },
    ],
    input:
      "body read without a schema: email, checked with forgotPasswordSchema (400 otherwise; an account number alone is 400 too)",
    capability: null,
    entitlement: null,
    idempotency: "each request sends the same link again; the token is not replaced",
    sideEffects: "for a waiting application, emails its confirmation link again (sendMerchantVerificationEmail)",
    successDto: EVEN_ANSWER,
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none needed: the link goes only to the application's own address",
      replay: "each replay sends the link again, within the limit",
      rate:
        "takeAuthThrottleSlot per address asked, whether or not one is waiting: 3 free, then waits from 5 minutes doubling to an hour; in the database",
    },
  },

  "POST /api/merchants/signup": {
    branches: [
      {
        principal: "public",
        tenant: "mailbox",
        tenantRule:
          "a new pending application for the address named, usable only once its emailed link is used with the password chosen here; for an address that already has a merchant or a login, a note to that address instead. The answer is the same either way (owner decision 2026-09-23)",
      },
    ],
    input: "body: publicSignupSchema (400 with the first issue and the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "a new address creates one pending application; asking again for the same address (now in use) sends that address a note instead, three, then slowed down (signupNoticeBucket)",
    sideEffects:
      "creates a pending merchant with its application (createMerchantWithSignup); emails the confirmation link (sendMerchantVerificationEmail) or, for an address in use, a note (sendExistingAccountNoticeEmail); security audit log (logSecurityEvent: SIGNUP_RATE_LIMITED)",
    successDto:
      "one fixed message ('Check your email to continue.'), never sooner than SIGN_UP_REPLY_FLOOR_MS after the request began; no account number",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity:
        "none needed: nothing made here can be used until the link sent to the address is used with the password chosen here",
      replay: "for an address in use, a replay sends a note, within its limit; it creates nothing",
      rate: `${CHECK_RATE_LIMIT}; that count is shared with the board page's feed and the numbered pay route`,
    },
    findings: [
      "The only limit on new applications is checkRateLimit, 100 a minute per visitor address in this process only. Until TRUST_PROXY_HOPS is set, visitors may all count as the proxy's address, and the same count serves GET /api/merchants/:id/active-transaction (which each open board page asks every 3 seconds) and POST /api/transactions/:id/pay: five open board pages can use it up, refusing sign-ups and board payments, and a run of sign-ups can refuse board customers. Each new address costs a bcrypt hash, a merchant row and an email.",
    ],
  },

  "POST /api/team/accept-invite": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule:
          "the invite token (32 random bytes, hex) selects the one invited login it was sent for (storage.getUserByInviteToken, by its SHA-256): the login must still be invited and the invite unexpired; activateInvitedUser spends the token in the statement that activates the login",
      },
    ],
    input:
      "body: acceptInviteSchema: the token, an optional name of up to 100 characters, and a password meeting the one password rule with its confirmation (400 with the first issue and the issues)",
    capability: null,
    entitlement: null,
    idempotency: "one-time: the token is burned as the login is activated; a second use is 400",
    sideEffects: "security audit log (logSecurityEvent: TEAM_INVITE_ACCEPTED)",
    successDto: "{ message } only; no token: the new teammate signs in",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "holding the emailed invite link",
      replay: "refused: the token is burned",
      rate: ONE_TIME_TOKEN_RATE,
    },
  },

  // ── Batch 3c (2026-09-26): public pages, configuration and boards ──
  "GET /robots.txt": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "none: one fixed text for every caller" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "text/plain crawler rules: the signed-in screens, /nfc, /admin and /api/ disallowed, and the sitemap's address",
    errorDisclosure: ["fixed"],
    controls: FIXED_CONTENT_CONTROLS,
  },

  "GET /sitemap.xml": {
    branches: [
      {
        principal: "public",
        tenant: "none",
        tenantRule:
          "none: a fixed list of the five public pages (the old line-slice classifier called it admin, from its neighbour's text)",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "application/xml sitemap of /, /signup, /login, /terms and /privacy on taptpay.com, dated today",
    errorDisclosure: ["fixed"],
    controls: FIXED_CONTENT_CONTROLS,
  },

  "GET /.well-known/apple-developer-merchantid-domain-association": {
    branches: [
      { principal: "public", tenant: "none", tenantRule: "none: Apple Pay's domain verification file, the same for every caller" },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "the file client/public/.well-known/apple-developer-merchantid-domain-association, labelled application/json",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none needed: a verification file Apple fetches, the same for every caller",
      replay: "read-only",
      rate: "none — no limit; one file from disk",
    },
    findings: [
      "Were the file ever missing, sendFile's error would reach the global handler, which passes a 4xx error's own message on: a 404 naming the server's absolute path (shown with express's sendFile and the same pass-through, 2026-09-26). The file is in the repository, so only a broken deploy shows it; the pass-through itself belongs to the logs and redaction phase.",
    ],
  },

  "GET /nfc/:merchantId/stone/:stoneId": {
    branches: [
      {
        principal: "public",
        tenant: "none",
        tenantRule:
          "none: nothing is read; the page only points to the board's customer page for the two numbers given (generatePaymentUrl), whether or not that board exists, and that page holds the board to its business",
      },
    ],
    input: "merchantId, stoneId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "a small HTML page, not stored by caches, that opens the board's page /pay/<business>/stone/<board>: Android in-app browsers through an intent:// address into Chrome, every other browser directly; the address starts with the configured public origin (the request's Host only in development)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none needed: the page carries only the board page's address, built from the numbers in its own",
      replay: "read-only",
      rate: "none — no limit; nothing is read",
    },
  },

  "GET /nfc/:merchantId": {
    branches: [{ principal: "public", tenant: "none", tenantRule: RETIRED_NO_BOARD_RULE }],
    input: "merchantId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "none: 410 with the 'Ask for your payment link' page (noBoardAddressRetiredHtml), not stored by caches",
    errorDisclosure: ["fixed"],
    controls: RETIRED_NO_BOARD_CONTROLS,
  },

  "GET /api/merchants/:id/qr": {
    branches: [{ principal: "public", tenant: "none", tenantRule: RETIRED_NO_BOARD_RULE }],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "none: 410 NO_BOARD_ADDRESS_RETIRED; a board's QR is GET /api/merchants/:id/stone/:stoneId/qr, a sale's comes with its own link",
    errorDisclosure: ["fixed"],
    controls: RETIRED_NO_BOARD_CONTROLS,
  },

  "GET /api/merchants/:id/stone/:stoneId/qr": {
    branches: [
      {
        principal: "public",
        tenant: "board",
        tenantRule:
          "the board must exist and belong to the business in the path (getTaptStone; 404 otherwise, the same for both); a board's printed QR is public by design",
      },
    ],
    input:
      "id, stoneId: strictPositiveIntegerParam; size: strictBoundedIntegerQueryParam (400 pixels when absent, at most 1000; a malformed size is refused with 400); download: only the exact text 'true' asks for an attachment",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PNG QR code of the board's page address (/pay/<business>/stone/<board>), cached publicly for 30 days",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none: a board's printed QR is public by design; both numbers are sequential, so anyone can make any board's QR by counting",
      replay: "read-only",
      rate: "none — no limit",
    },
  },

  "GET /api/merchants/:id/stone/:stoneId/brand": {
    branches: [
      {
        principal: "public",
        tenant: "board",
        tenantRule:
          "the board must be one of the business's active boards (getTaptStone; 404 otherwise, the same for a missing one, a removed one and another business's); a board's page is public by design and shows the name and logo the printed board does",
      },
    ],
    input: "id, stoneId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "publicBoardBrandDto: the business's name and logo address only; it replaced the retired by-number business read for a board's page (owner decision 2026-09-26)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none: a board's printed name and logo are public by design; both numbers are sequential, so anyone can read any board's business name and logo by counting, but only for a real, active board",
      replay: "read-only",
      rate: "none — no limit",
    },
  },

  "GET /api/merchants/:id/active-transaction": {
    branches: [
      {
        principal: "merchant",
        when: "an Authorization header is sent",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; its newest open sale on any board, or on the board asked for, including a sale with its own link`,
      },
      {
        principal: "public",
        when: "no Authorization header, with a stoneId (without one: 410 NO_BOARD_ADDRESS_RETIRED)",
        tenant: "board",
        tenantRule: `${BOARD_PAGE_RULE}; a board that is not the business's, or does not exist, is 404, the same answer (since 2026-09-29, R1-T3; it was 403), and so is a board the business has removed (owner decision 2026-09-29: its page no longer shows the sale left open on it)`,
      },
    ],
    input: "id: strictPositiveIntegerParam; stoneId: strictPositiveIntegerQueryParam when present (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "the open sale or null, not cached: to the business, ownerTransactionDto; to the board's page, publicTransactionDto; each with the board's page and QR addresses for a board sale",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: BOARD_PAGE_AUTHENTICITY,
      replay: "read-only",
      rate: `the board's page: ${CHECK_RATE_LIMIT}, which each open board page spends every 3 seconds and sign-up and numbered pay share; the signed-in branch: none`,
    },
    findings: [
      "Each poll from a board's page logs the visitor's address: every 3 seconds for every open board page (the logs and redaction phase).",
    ],
  },

  "GET /api/merchants/:id/events": {
    branches: [
      {
        principal: "merchant",
        when: "an Authorization header is sent",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}, labelled admin on its stream; every live event of the business`,
      },
      {
        principal: "public",
        when: "no Authorization header, with a stoneId (without one: 410 NO_BOARD_ADDRESS_RETIRED)",
        tenant: "board",
        tenantRule: `${BOARD_PAGE_RULE}; the board must also be active, and anything else is 404 (sse-broker.ts sends a board's stream only its own board's events)`,
      },
    ],
    input:
      "id: strictPositiveIntegerParam; stoneId: strictPositiveIntegerQueryParam (400 otherwise); a token in the query is refused (400: credentials go in the Authorization header)",
    capability: null,
    entitlement: null,
    idempotency: "each request opens another stream; closing it unsubscribes",
    sideEffects:
      "subscribes the connection to the business's live updates (sseBroker.subscribe): the business's own view (its sales and refunds) or the board's (publicTransactionDto of that board's sales)",
    successDto: "text/event-stream, not cached: a 'connected' event, then the audience's events",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: BOARD_PAGE_AUTHENTICITY,
      replay: "each replay opens another stream",
      rate: "none — no limit on requests, nor on the streams one visitor holds open",
    },
    findings: [
      "Nothing limits how many streams anyone holds open: each keeps a connection and a subscriber in this process's memory, so one script can hold thousands on any board's public stream (R1-T4 phase B's address limits, once TRUST_PROXY_HOPS is set).",
    ],
  },

  "GET /api/nfc/capabilities": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "none: the platform's own settings" }],
    input: "nothing (the User-Agent is no longer read: R0-T5)",
    capability:
      "reports config.features.tapToPay (Tap to Pay's switch) and nothing else; the wallets always report false, their routes being retired",
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ nfcSupported, applePay, googlePay, samsungPay, contactlessCard, webNFC, recommendations }",
    errorDisclosure: ["fixed"],
    controls: CONFIGURATION_CONTROLS,
    findings: [
      "Only pages mounted nowhere ask for it (merchant-terminal.tsx, merchant-terminal-mobile.tsx; the stale bundles under client/public/app too). Retire it with them (dead code, R8).",
    ],
  },

  "GET /api/windcave/env": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "none: the platform's own payment settings" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ env, applePayMerchantId, googlePayMerchantId, googlePayEnv }: what the checkout page's card fields and wallet buttons need, all of which reaches the browser anyway",
    errorDisclosure: ["fixed"],
    controls: CONFIGURATION_CONTROLS,
  },

  "GET /api/push/capabilities": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "none: the platform's own settings" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ webPush: { available, reason }, nativePush: { available, reason, bundleId } }: whether each way of sending notifications is set up, and the iOS app's bundle id (public in the App Store)",
    errorDisclosure: ["fixed"],
    controls: CONFIGURATION_CONTROLS,
  },

  "GET /api/push/vapid-key": {
    branches: [{ principal: "public", tenant: "none", tenantRule: "none: the platform's own settings" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ publicKey }: the web-push public key a browser needs to subscribe, public by design; 503 while web push is not set up",
    errorDisclosure: ["fixed"],
    controls: CONFIGURATION_CONTROLS,
  },

  "GET /uploads/:folder/:name": {
    branches: [
      {
        principal: "public",
        tenant: "none",
        tenantRule:
          "none by design: only the logos folder is public (PUBLIC_UPLOAD_FOLDERS, server/upload-policy.ts), checked before the database or the disk; any other folder, invoice documents in particular, is 404 like a missing file (gap 13, Option C, owner 2026-09-14)",
      },
    ],
    input:
      "folder: must be in PUBLIC_UPLOAD_FOLDERS (404 otherwise); name: refused if it contains '..' (400), then looked up as <folder>/<name>; both are read raw, as an allowlist key and a lookup key",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: "a legacy logo the database lacks is read from the uploads folder on disk (fs.existsSync, then sendFile)",
    successDto: "the logo's bytes with its stored type and nosniff (a database copy is cached publicly for 5 minutes)",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: "none: logos are shown to customers on the payment pages, so anyone with a logo's address may fetch it",
      replay: "read-only",
      rate: "none — no limit",
    },
  },

  "POST /api/info-pack-leads": {
    branches: [
      {
        principal: "public",
        tenant: "none",
        tenantRule: "none: a new sales lead for the platform itself (a name and an address), tied to no business",
      },
    ],
    input: "body: createInfoPackLeadSchema (a name of 1 to 100 characters and an email address; 400 with the first issue and the issues)",
    capability: null,
    entitlement: null,
    idempotency: "none: every request stores another lead and notifies again",
    sideEffects: "emails the lead's name and address to the platform admin's address (sendEmail, not waited for)",
    successDto: "201 { id }: the new lead's sequential number",
    errorDisclosure: ["input-issues"],
    controls: {
      authenticity: "none needed: a lead is only what someone typed, and only the platform's own inbox is emailed",
      replay: "each replay stores another lead and emails the admin again, within the limit",
      rate:
        "checkResendRateLimit: 5 per 10 minutes per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor may share one address, so a sixth request in ten minutes from anyone refuses everyone (R1-T4 phase B)",
    },
    findings: [
      "Answers with the lead's sequential number, which the page never reads: it tells anyone how many leads there have been. A 201 with no number would do.",
    ],
  },

  "POST /api/board-builder/submit": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule:
          "the session's own business, from its record (owner decision 2026-09-26): the body names no business, and its board (stoneId) must be one of that business's active boards (404 otherwise, the same for a missing one); the platform admin, with no business, is refused (403)",
      },
    ],
    input:
      "body: boardPrintRequestSchema, strict (400 with the first issue and the issues): a base64 PDF of at most 2 MB that must start %PDF- (decodeBoardPrintPdf), the board's number, one of the two layouts, the sender's name and email. Parsed only after authenticateToken, up to 3 MB (BOARD_PRINT_JSON_LIMIT; 413 above it); the pipeline's 100 KB parser skips this route (server/app.ts)",
    capability: null,
    entitlement: null,
    idempotency: "none: every accepted request sends another email, within the limit",
    sideEffects:
      "emails the PDF as an attachment, with the business's and board's names from their records, to the fixed print inbox (sendBoardBuilderEmail, built by server/board-print.ts); a failed send gives its count back",
    successDto: "{ message: 'Board submitted successfully' }; 502 when the email could not be sent",
    errorDisclosure: ["input-issues"],
  },

  // ── Batch 4 (2026-09-26): the platform admin ──
  "GET /api/admin/request-origin": {
    branches: [{ principal: "platform-admin", tenant: "none", tenantRule: ADMIN_OWN }],
    input: "nothing but the request itself: its forwarded-for header and connection address, only shown back",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto:
      "not cached: TRUST_PROXY_HOPS and whether address limits are on, the address Express takes, the protocol and host, the forwarded-for chain, the connection address, and the address each hops value would take (for the owner's phase B check)",
    errorDisclosure: ["fixed"],
  },

  "GET /api/admin/auth/me": {
    branches: [{ principal: "platform-admin", tenant: "none", tenantRule: ADMIN_OWN }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto:
      "{ user: { id, email, merchantId: 0, role: 'admin' }, csrfToken }, not cached: the admin app's session check; with an admin session cookie, the page's CSRF token (R1-T4 phase E)",
    errorDisclosure: ["fixed"],
  },

  "POST /api/admin/auth/logout": {
    branches: [
      {
        principal: "platform-admin",
        tenant: "none",
        tenantRule:
          "the admin session that signed the request in, and no other: it is ended; a token sign-in (until phase E3) has no session here and nothing changes",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency:
      "ends this admin session (revokeAuthSession, recorded as logout); the same cookie again is refused 401 by the sign-in gate",
    sideEffects: `closes this session's live streams (sseBroker.disconnectSession); SESSION_REVOKED in the security log; ${ADMIN_AUDIT}`,
    successDto: "204, no body, not cached; the admin session cookie cleared",
    errorDisclosure: ["fixed"],
  },

  "GET /api/admin/merchants": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_EVERY_BUSINESS }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "every business, adminMerchantSummaryDto each: id, name, business name, email, director, NZBN, status and when made",
    errorDisclosure: ["fixed"],
  },

  "GET /api/admin/merchants/:id": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "adminMerchantDto: the business's account and settings, never its password hash, tokens or bank details",
    errorDisclosure: ["fixed"],
  },

  "GET /api/admin/merchants/:id/transactions": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input: "id: strictPositiveIntegerParam (400 otherwise); an unknown business gets an empty list",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "every sale of the business, adminTransactionDto each, all at once (no paging)",
    errorDisclosure: ["fixed"],
  },

  "POST /api/admin/merchants/:id/verify": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input: "id: strictPositiveIntegerParam (400 otherwise); no body",
    capability: null,
    entitlement: null,
    idempotency:
      "marks a waiting application verified (updateMerchantStatus) and makes any missing owner login (syncVerifiedMerchants); again is 409 (already verified; 400 until 2026-09-27, P2.2), any other state 409 (only what the business page offers, since 2026-09-26); an application with no password set is 400",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ message, merchant: { id, name, businessName, email, status } }",
    errorDisclosure: ["fixed"],
    findings: [
      "Unlike the emailed confirmation (confirmMerchantEmail), it leaves the email marked unconfirmed (emailVerified false) and the sign-up link usable. Minor; for the account-security work.",
    ],
  },

  "POST /api/admin/merchants/:id/set-active": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input: "id: strictPositiveIntegerParam (400 otherwise); no body",
    capability: null,
    entitlement: null,
    idempotency: "sets a verified business active; again is 409 (400 until 2026-09-27, P2.2), any other state 409 (only what the business page offers, since 2026-09-26)",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ message, merchant: { id, status } }",
    errorDisclosure: ["fixed"],
  },

  "PATCH /api/admin/merchants/:id/windcave-merchant-id": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input: "id: strictPositiveIntegerParam (400 otherwise); body read without a schema: windcaveMerchantId, stored as sent (any falsy value clears it)",
    capability: null,
    entitlement: null,
    idempotency: "sets the business's provider merchant id; the same value again changes nothing",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ message }",
    errorDisclosure: ["fixed"],
    findings: [
      "The provider merchant id is stored as sent, with no check of its type or form: a number, an object or a stray space is saved as it came, and only the provider notices. A strict schema (a trimmed string of the provider's form, or null) is plan §8.4's rule.",
    ],
  },

  "POST /api/admin/merchants/:id/activate": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_ANY_BUSINESS }],
    input:
      "id: strictPositiveIntegerParam (400 otherwise); body read without a schema: password, held to the one password rule (newPasswordSchema; 400 with its first issue)",
    capability: null,
    entitlement: null,
    idempotency:
      "one-time: sets the waiting application's password, marks it verified and clears its token (verifyMerchant, by that token); a business with no waiting application is 409 (since 2026-09-26), a verified one 409 (400 until 2026-09-27, P2.2)",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ message, merchant: { id, name, businessName, email, status } }",
    errorDisclosure: ["input-issues"],
    findings: [
      `${NO_ADMIN_SCREEN}. The admin chooses the business's password, so the admin knows it. It is today the only way in for an application made before sign-up took a password: the confirm page sends those to support (NO_PASSWORD_CHOSEN), and Verify refuses them, naming this route. Kept by the owner's decision (2026-09-26) as support's path until an emailed set-password link replaces it (the account-security work).`,
    ],
  },

  "GET /api/admin/analytics": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_EVERY_BUSINESS }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto:
      "platform totals (businesses, active ones, sales, revenue, monthly recurring revenue, paying subscriptions) and, per business, its id, name, business name, sales count and revenue, status and last sale",
    errorDisclosure: ["fixed"],
    findings: [
      ADMIN_EACH_BUSINESS_FINDING,
      "A business whose figures fail to load is listed with zero sales and zero revenue, as if it had none (R1-T9's rule, for the admin's screens too).",
    ],
  },

  "GET /api/admin/revenue-over-time": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_EVERY_BUSINESS }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "for each of the last 7 days (today and the 6 before, by UTC date): the platform's revenue and sales count, from completed sales",
    errorDisclosure: ["fixed"],
    findings: [ADMIN_EACH_BUSINESS_FINDING],
  },

  "GET /api/admin/payment-method-breakdown": {
    branches: [{ principal: "platform-admin", tenant: "any-merchant", tenantRule: ADMIN_EVERY_BUSINESS }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "per payment method of the platform's completed sales: its name, how many sales used it, and a chart colour; most used first",
    errorDisclosure: ["fixed"],
    findings: [ADMIN_EACH_BUSINESS_FINDING],
  },

  "GET /api/admin/ga4-detailed": {
    branches: [{ principal: "platform-admin", tenant: "none", tenantRule: "none: the website's own visitor figures from Google Analytics; no business's data" }],
    input: "range: read raw, then mapped to one of four start dates (14d, 30d, all; anything else is the last 7 days)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ configured: false } until Google Analytics is set up; otherwise daily users, sessions and page views, users by country, new and returning users",
    errorDisclosure: ["provider-text"],
    findings: [
      "Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.",
    ],
  },

  "GET /api/admin/ga4-metrics": {
    branches: [{ principal: "platform-admin", tenant: "none", tenantRule: "none: the website's own visitor figures from Google Analytics; no business's data" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "{ configured: false } until Google Analytics is set up; otherwise the last 7 days' sessions, users, page views, bounce rate and more",
    errorDisclosure: ["provider-text"],
    findings: [
      "Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.",
    ],
  },

  "POST /api/admin/resend-verification": {
    branches: [
      {
        principal: "platform-admin",
        tenant: "any-merchant",
        tenantRule: "the business the email names (getMerchantByEmail): only one still waiting to be confirmed, with its token, is sent its link again (404 for no business; 409 for one no longer waiting, 400 until 2026-09-27, P2.2; 400 for one waiting with no token, which P2.2 would also call a state conflict: R1-T3's admin family)",
      },
    ],
    input: "body read without a schema: email, trimmed and lower-cased by the look-up (getMerchantByEmail); anything but a string is a 500",
    capability: null,
    entitlement: null,
    idempotency: "each call sends the same link again; the token is not replaced",
    sideEffects: `${ADMIN_AUDIT}; emails the business its confirmation link again (sendMerchantVerificationEmail)`,
    successDto: "{ message, merchant: { id, name, businessName, email, status } }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/admin/email-status": {
    branches: [{ principal: "platform-admin", tenant: "none", tenantRule: "none: the platform's email set-up" }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: ADMIN_AUDIT,
    successDto: "which email providers are set up, the environment, the from address, whether admin notices are set up and whether mail will be delivered",
    errorDisclosure: ["fixed"],
    findings: [`${NO_ADMIN_SCREEN}; a diagnostic, useful by hand. Kept by the owner's decision (2026-09-26).`],
  },

  // ── Batch 5 (2026-09-26): the account ──
  "POST /api/auth/sign-out-everywhere": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule:
          "the session's own login: every session of it ends, this one included; the platform admin is refused (403 'Only a TaptPay login can do this.')",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency:
      "advances the login's session version (advanceUserSessionVersion), spending every token issued before it, this one included: the same token again is 401 SESSION_ENDED",
    sideEffects:
      "ends the login's live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin; a fault there is logged, never returned, as the sessions have already ended); records each session as ended (sign_out_everywhere; SESSION_REVOKED in the security log)",
    successDto: "204, no body, not cached; this device's session cookie cleared",
    errorDisclosure: ["fixed"],
  },

  "POST /api/auth/logout": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule:
          "the session that signed the request in, and no other: a session cookie's session is ended; a token sign-in (until phase E3) has no session here and nothing changes. The platform admin is refused (403 'Only a TaptPay login can do this.'): the admin area has its own Log Out",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency:
      "ends this session (revokeAuthSession, recorded as logout); the same cookie again is refused 401 by the sign-in gate, so the Log Out cannot repeat",
    sideEffects: "closes this session's live streams only (sseBroker.disconnectSession); SESSION_REVOKED in the security log",
    successDto: "204, no body, not cached; the session cookie cleared",
    errorDisclosure: ["fixed"],
  },

  "GET /api/auth/me": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule:
          "the session's own login and business; the platform admin (validated by authenticateToken: its own principal, the configured email, business 0) is answered too, with no business",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: "none enforced: whether the business has paid access (billingCardIsReady) is only reported, for the app's own gate",
    idempotency: `read-only, ${CREATES_SUBSCRIPTION}`,
    sideEffects: null,
    successDto:
      "{ user: signedInUserDto: { id, email, merchantId, role, onboardingCompleted, merchantStatus, gstRegistered, tradeGstMode, billingCardReady } }, not cached: the start-up check of a token sign-in (a session cookie's is GET /api/auth/session)",
    errorDisclosure: ["fixed"],
  },

  "GET /api/auth/session": {
    branches: [
      {
        principal: "public",
        tenant: "session",
        tenantRule:
          "the caller's own business session cookie, and nothing else: readBusinessSession finds its session by the cookie's id, checks its secret, that it has not ended, that its login is active with the session's version and that its business is verified or active; the admin's cookie and any Authorization header are not read. Anyone without such a session gets { signedIn: false }",
      },
    ],
    input: "only the session cookie, refused unless it is `<22 base64url>.<43 base64url>` (parseSessionCookie); nothing else is read",
    capability: null,
    entitlement: "none enforced: whether the business has paid access (billingCardIsReady) is only reported, for the app's own gate",
    idempotency: `read-only for the signed-out; for a session, recorded as a use (at most once a minute), and the daily swap offered or taken up, as on any signed-in request; ${CREATES_SUBSCRIPTION}`,
    sideEffects: null,
    successDto:
      "{ signedIn: false }, or { signedIn: true, user: signedInUserDto, csrfToken }, never cached: the app's start-up check on a session cookie (R1-T4 phase E). A cookie that is not a live session is cleared",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity:
        "none needed: it answers only about the caller's own cookie, which is HttpOnly, so no script can present another's; without a valid one it says only { signedIn: false }",
      replay: "harmless: the cookie's holder reads their own session again",
      rate: "none — it reveals nothing about anyone but the caller, and each read of a session is one indexed row",
    },
  },

  "GET /api/team": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: `read-only, ${CREATES_SUBSCRIPTION}`,
    sideEffects: null,
    successDto: "{ members: teamMemberDto each (id, email, name, role, status, last sign-in, when made), seatLimit, seatsInUse }",
    errorDisclosure: ["fixed"],
  },

  "POST /api/team/invite": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "body: inviteTeamMemberSchema (an email of at most 200 characters, an optional name of at most 100; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "none: each call invites another login, within the plan's seats (inviteTeamMember counts them under a lock: 409 when all are in use); an address that already has a login anywhere is 409",
    sideEffects:
      "emails the invite link (sendTeamInviteEmail: 32 random bytes, only their SHA-256 kept, live for 7 days); if it cannot be sent the invite is taken back (revokeTeamInvite) and the answer is 502",
    successDto: "201 { member: teamMemberDto }",
    errorDisclosure: ["input-issues"],
    findings: [
      "It tells a signed-in owner whether any address has a TaptPay login (409 'That email address already has a TaptPay login'), where the 2026-09-23 rule made the public doors answer alike. Recorded then as open for the owner (R1-T4-account-discovery-2026-09-23.md §5, item 2); no answer since. Each probe of an address without a login sends it a real invite.",
    ],
  },

  "POST /api/team/:userId/resend": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "resource",
        tenantRule: `the invited login read by id (getUserById) must be the session's business's, still invited, with a live token (404 otherwise, the same for another business's); ${adminRefused(ADMIN_403)}`,
      },
    ],
    input: "userId: strictPositiveIntegerParam (400 otherwise); no body",
    capability: null,
    entitlement: null,
    idempotency:
      "each call replaces the invite's token, only if it is unchanged since it was read (rotateTeamInvite: 409 otherwise), and sends the new link; the old link stops working. At most 5 per 10 minutes per business and login (checkResendRateLimit, in this server process only: 429)",
    sideEffects:
      "emails the new invite link (sendTeamInviteEmail); if it cannot be sent, the previous invite is put back, or failing that taken back (502)",
    successDto: "{ member: teamMemberDto }",
    errorDisclosure: ["fixed"],
  },

  "DELETE /api/team/:userId/invite": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "resource",
        tenantRule: `revokeTeamInvite deletes the login only if it is the session's business's, still invited and not the owner (404 otherwise, the same for another business's); ${adminRefused(ADMIN_403)}`,
      },
    ],
    input: "userId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "deletes the pending invite; again is 404",
    sideEffects: null,
    successDto: "{ message: 'Invite revoked' }",
    errorDisclosure: ["fixed"],
  },

  "PUT /api/team/:userId/status": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "resource",
        tenantRule: `setTeamMemberStatus changes the login only if it is the session's business's (404 otherwise, the same for another business's) and not the owner (403); ${adminRefused(ADMIN_403)}`,
      },
    ],
    input: "userId: strictPositiveIntegerParam; body read without a schema: status, which must be 'active' or 'disabled' (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency:
      "sets the login active or disabled; the same state again is 409; turning one back on counts the plan's seats under a lock (409 when all are in use). A disabled login's tokens are refused from its next request (authenticateToken reads the login)",
    sideEffects:
      "on disabling: records each of the login's sessions as ended (login_disabled, SESSION_REVOKED; the status check already refuses them), ends its live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin, owner decision 2026-09-22; a fault is logged, never returned)",
    successDto: "{ member: teamMemberDto }",
    errorDisclosure: ["fixed"],
  },

  "DELETE /api/team/:userId": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "resource",
        tenantRule: `the login read by id (getUserById) must be the session's business's and not its owner (404 otherwise, the same for another business's); a pending invite is 409 (revoke it instead); ${adminRefused(ADMIN_403)}`,
      },
    ],
    input: "userId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "deletes the login (removeTeamMember); again is 404",
    sideEffects:
      "records each of the login's sessions as ended (login_removed, SESSION_REVOKED) before the login goes, taking its sessions with it (0031's cascade); ends its live streams (sseBroker.disconnectUser) and, since 2026-09-26, stops the business's unattributed device subscriptions as disabling does (deactivatePushSubscriptionsForLogin; the ones recorded against the login go with it by 0029's cascade; a fault is logged, never returned)",
    successDto: "{ message: 'Login removed' }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/subscription": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; a teammate gets it without the card (isAccountOwner)`,
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: `read-only, ${CREATES_SUBSCRIPTION}`,
    sideEffects: null,
    successDto:
      "{ subscription: subscriptionDto (plan, price, seats, status, period, cancellation, pending plan, failed payments, the card's brand, last 4 and expiry or null, sale counts), plans: every plan }",
    errorDisclosure: ["fixed"],
  },

  "PUT /api/subscription/plan": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "body read without a schema but for planId: planIdSchema, one of the plans (400 'Unknown plan' otherwise); nothing else is read",
    capability: null,
    entitlement: null,
    idempotency:
      "the current plan again changes nothing; an upgrade applies at once after charging the stored card (no card 402, declined 422, unconfirmed 502); a downgrade waits for the period's end, and one that would strand logins is 409; each runs under the subscription's billing claim (409 while another billing step holds it)",
    sideEffects: "an upgrade charges the stored card, with an idempotency key (executeStoredCardCharge, then chargeStoredCard)",
    successDto: "{ subscription: subscriptionDto, applied: 'immediate' | 'period-end', message }",
    errorDisclosure: ["fixed"],
  },

  "POST /api/subscription/cancel": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "body read without a schema: reason, required, cut to 500 characters",
    capability: null,
    entitlement: null,
    idempotency:
      "cancels at the end of a running paid period (cancelAtPeriodEnd), at once otherwise; under the billing claim (409 while another billing step holds it)",
    sideEffects: null,
    successDto: "{ subscription: subscriptionDto, message }",
    errorDisclosure: ["fixed"],
    findings: [
      "reason is read raw: a number, an object or an array is a 500 (reason.trim is not a function) where P2.2 says 400 (§8.4).",
    ],
  },

  "POST /api/subscription/resume": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing is read",
    capability: null,
    entitlement: null,
    idempotency: "undoes a pending cancellation (resumeSubscription, only while one is pending); again, or with none pending, is 409",
    sideEffects: null,
    successDto: "{ subscription: subscriptionDto, message }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/subscription/billing-history": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "limit: strictBoundedIntegerQueryParam, 1 to 100, 50 when absent (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ history: billingHistoryDto each (type, amount, status, description, failure reason, period, when paid and made) }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/billing/card": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: `read-only, ${CREATES_SUBSCRIPTION}`,
    sideEffects: null,
    successDto: "{ ready: whether the stored card can pay the next renewal, card: { last4, brand, expiry } or null }",
    errorDisclosure: ["fixed"],
  },

  "POST /api/billing/card/session": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing is read",
    capability: "the provider must be configured (isWindcaveConfigured: 503 otherwise)",
    entitlement: null,
    idempotency:
      "each call opens another hosted card page at the provider and binds its session to the subscription (bindSubscriptionCardSession), replacing any earlier one",
    sideEffects: "opens a hosted card-storage session at the provider (createCardStorageSession), with the business's contact email",
    successDto: "{ sessionId, redirectUrl }: the provider's page; the session id reads back only this one result",
    errorDisclosure: ["fixed"],
  },

  "POST /api/billing/card/confirm": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; the card session must be the one bound to its subscription (subscriptionCardSessionState: 403 otherwise, the same for another business's)`,
      },
    ],
    input: "body read without a schema: sessionId, a trimmed string matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/ (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency:
      "a session already settled answers from the stored result with no provider call; otherwise the provider is asked (202 while pending); an approved card is stored and, when the subscription needs paying, charged under the billing claim with an idempotency key (completeSubscriptionCardSetup: 409 busy, 422 declined, 502 unconfirmed)",
    sideEffects:
      "reads the card session back from the provider (queryStoredCardSession) and may charge the stored card (executeStoredCardCharge, then chargeStoredCard)",
    successDto: "{ success, ready, charged, card: { last4, brand, expiry }, subscription: subscriptionDto }; 202 { pending: true }",
    errorDisclosure: ["fixed"],
  },

  "DELETE /api/billing/card": {
    branches: [{ principal: "merchant", roles: ["owner"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "clears the stored card (removeSubscriptionCard); again changes nothing; refused while a billing step holds the claim (409)",
    sideEffects: null,
    successDto: "{ success: true }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/tutorial/state": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: "the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')",
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ generation, autoEnabled, pageCount, progress: per page { status, lastStep, when started, completed, dismissed } }",
    errorDisclosure: ["fixed"],
  },

  "PATCH /api/tutorial/pages/:pageKey": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: "the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')",
      },
    ],
    input:
      "pageKey: one of the tutorial's pages (isTutorialPageKey, 400 otherwise); body: tutorialProgressSchema, strict (generation, status, lastStep from 0 to 100; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "upserts the page's progress in the current generation (a stale generation is 409); the same body again rewrites it, and a completed or dismissed page's time",
    sideEffects: null,
    successDto: "{ pageKey, status, lastStep }",
    errorDisclosure: ["input-issues"],
    findings: [TUTORIAL_SHARED],
  },

  "POST /api/tutorial/restart": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: "the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')",
      },
    ],
    input: "nothing is read",
    capability: null,
    entitlement: null,
    idempotency: "starts a new generation (restartMerchantTutorial): every page starts over and the tutorial turns itself on, for every login of the business",
    sideEffects: null,
    successDto: "{ generation, autoEnabled: true, pageCount, progress: {} }",
    errorDisclosure: ["fixed"],
    findings: [TUTORIAL_SHARED],
  },

  "POST /api/push/subscribe": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; the subscription is recorded against the business and this login, and a device already registered moves to them and takes this login's switches (createPushSubscription, by its endpoint; ${OWN_SWITCHES})`,
      },
    ],
    input:
      "body read without a schema: subscription, whose endpoint, keys.p256dh and keys.auth must be present (400 otherwise); the endpoint must be a browser push service's (isPushServiceEndpoint, server/push-endpoint.ts: https on port 443, no user or password, a host of Google's, Mozilla's, Apple's or Microsoft's push service; 400 otherwise, owner decision 2026-09-26); the keys are not checked for form",
    capability: "the server's push keys must be set (config.push in server/config.ts: 503 otherwise)",
    entitlement: null,
    idempotency: "registers the device, or re-registers it by its endpoint (active again, this login's); the same body again changes nothing",
    sideEffects: null,
    successDto: "{ success: true, preferences: pushNotificationPreferencesDto }",
    errorDisclosure: ["fixed"],
  },

  "POST /api/push/unsubscribe": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; the endpoint must be one of its active subscriptions (getPushSubscriptionsByMerchant: 403 otherwise), and any login of the business may stop any of its devices`,
      },
    ],
    input: "body read without a schema: endpoint, required, compared as sent",
    capability: null,
    entitlement: null,
    idempotency:
      "stops the device (deactivatePushSubscriptionByEndpoint; since 2026-09-26 a database fault is a 500, not a success); again is 403, as it is no longer active",
    sideEffects: null,
    successDto: "{ success: true }",
    errorDisclosure: ["fixed"],
    findings: [
      "A database fault while listing the business's devices reads as none (getPushSubscriptionsByMerchant answers [] on any error), so the answer is 403 'Not authorized to unsubscribe this endpoint', not 500 (R1-T9's rule).",
    ],
  },

  "POST /api/push/native-subscribe": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; the iPhone is recorded against the business and this login, and takes this login's switches (createPushSubscription, by its endpoint; ${OWN_SWITCHES})`,
      },
    ],
    input: "body read without a schema: deviceToken, a string of at least 8 characters once trimmed (400 otherwise), stored as the endpoint apns://<token>",
    capability: null,
    entitlement: null,
    idempotency: "registers the iPhone, or re-registers it by its endpoint; the same body again changes nothing",
    sideEffects: null,
    successDto: "{ success: true, preferences: pushNotificationPreferencesDto }",
    errorDisclosure: ["fixed"],
  },

  "POST /api/push/native-unsubscribe": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; with a deviceToken, that iPhone, which must be one of its active subscriptions (403 otherwise); without one, this login's iPhones and the business's unattributed ones (deactivateNativePushSubscriptionsForLogin)`,
      },
    ],
    input: "body read without a schema: deviceToken, optional; when present a string of at least 8 characters once trimmed (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency:
      "stops the iPhone or iPhones (since 2026-09-26 a database fault stopping one iPhone is a 500, not a success); again with the token is 403, without it changes nothing",
    sideEffects: null,
    successDto: "{ success: true }",
    errorDisclosure: ["fixed"],
  },

  "GET /api/push/status": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; this login's own devices and switches (getPushSubscriptionsForLogin; ${OWN_SWITCHES})`,
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ subscribed, deviceCount, webSubscribed, nativeSubscribed, preferences: pushNotificationPreferencesDto }: this login's active devices and its switches",
    errorDisclosure: ["fixed"],
    findings: [PUSH_SWITCHES_FAULT_AS_DEFAULTS],
  },

  "GET /api/push/preferences": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; this login's own switches (${OWN_SWITCHES})`,
      },
    ],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ preferences: pushNotificationPreferencesDto }: this login's three switches, read from its newest device (the defaults with none)",
    errorDisclosure: ["fixed"],
    findings: [PUSH_SWITCHES_FAULT_AS_DEFAULTS],
  },

  "PUT /api/push/preferences": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "session",
        tenantRule: `${sessionBusiness(ADMIN_403)}; this login's own switches, on its own devices only (${OWN_SWITCHES})`,
      },
    ],
    input: "body: pushNotificationPreferencesSchema, strict: the three switches (400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "sets the three switches on each of this login's devices and no other login's (updatePushNotificationPreferences); the same body again changes nothing. The switches live on the devices: a login with none stores nothing, and a device that moves to another login takes that login's",
    sideEffects: null,
    successDto: "{ preferences: pushNotificationPreferencesDto }",
    errorDisclosure: ["input-issues"],
  },

  // ── Batch 6a (2026-09-27): the business's settings, boards and stock ──
  "GET /api/merchants/:id/profile": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; the owner and the admin get the owner's view, a teammate the restricted one (isAccountOwner)`,
      },
    ],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "ownerMerchantDto to the owner and the platform admin; memberMerchantSettingsDto (the read-only business fields) to a teammate",
    errorDisclosure: ["fixed"],
  },

  "POST /api/merchants/:id/onboarding": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input:
      "id: strictPositiveIntegerParam; body: merchantOnboardingSchema, strict, sign-up's rules (a director of 1 to 100 characters; NZBN and GST at most 20; a description of at most 500; a website address or nothing; one of the turnover ranges or nothing); 400 with the first issue and the issues, before anything is read, kept or sent",
    capability: null,
    entitlement: null,
    idempotency:
      "stores the six details and marks onboarding complete (updateMerchant; all six since 2026-09-27, when three had only been emailed); again stores them again and emails the admin again",
    sideEffects: "emails the details to the platform's admin address (sendEmail; every value HTML-escaped, the subject's line breaks removed)",
    successDto: "{ message }",
    errorDisclosure: ["input-issues"],
    findings: ["Every submission emails the admin again, with no limit (minor)."],
  },

  "PUT /api/merchants/:id/details": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input: "id: strictPositiveIntegerParam; body: updateMerchantDetailsSchema (business name, contact email, phone and address; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "sets the four contact details (updateMerchantDetails); the same values again change nothing",
    sideEffects: null,
    successDto: "ownerMerchantDto of the business afterwards",
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/merchants/:id/change-password": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "path-merchant",
        tenantRule:
          "checkMerchantOwnership: the business in the path must be the session's, a precondition only: the caller's own login is what changes; the platform admin, which that check lets through, is then refused (403 'Only a TaptPay login can do this.', since 2026-09-27)",
      },
    ],
    input: "id: strictPositiveIntegerParam; body: changePasswordSchema (the current password, and a new one held to the one password rule; 400 with the first issue and the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "checks the current password, counted per login and slowed down like sign-in (429), then sets the new one and ends every session of the login (updateUserPassword; each session recorded as ended, password_change) and starts a new one for this device; again with the old password is 400",
    sideEffects:
      "ends the login's live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin; a fault is logged, never returned); logs a slowed attempt (logSecurityEvent: PASSWORD_CHANGE_SLOWED) and the ended sessions (SESSION_REVOKED)",
    successDto: "{ message, token, csrfToken }: a fresh token (until phase E3) and a new session cookie for this device, not cached",
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/merchants/:id/theme": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input: "id: strictPositiveIntegerParam; body: updateThemeSchema (one of the themes; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "sets the theme (updateMerchantTheme); the same again changes nothing",
    sideEffects: null,
    successDto: "ownerMerchantDto of the business afterwards",
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/merchants/:id/daily-goal": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input: "id: strictPositiveIntegerParam; body: updateDailyGoalSchema (400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "sets the daily goal (updateMerchant); the same again changes nothing",
    sideEffects: null,
    successDto: "ownerMerchantDto of the business afterwards",
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/merchants/:id": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input:
      "id: strictPositiveIntegerParam; body: a strict schema of nine optional fields (business name, director, address, NZBN, phone, GST number, contact email as an email, contact phone, business address); 400 with the issues, and when none is given",
    capability: null,
    entitlement: null,
    idempotency: "sets the fields given (updateMerchant); the same values again change nothing",
    sideEffects: null,
    successDto: "ownerMerchantDto of the business afterwards",
    errorDisclosure: ["input-issues"],
    findings: ["Its text fields have no length limit, and the NZBN and GST number are not checked for form (§8.4); only the settings screen bounds them."],
  },

  "POST /api/merchants/:id/logo": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${BUSINESS_OWNER_RULE}; checked before the upload is read (requireLogoOwnership), and again in the handler`,
      },
    ],
    input:
      "id: strictPositiveIntegerParam; the file 'logo': a PNG by its MIME type (400 with the filter's message otherwise) and its first 8 bytes (400), up to 20 MB (413 above it), read into memory. The type and size refusals were 500s until 2026-09-27 (receiveUpload, server/routes.ts), where this review said 400",
    capability: null,
    entitlement: null,
    idempotency:
      "replaces the business's logo: one fixed name per business (merchant-<id>.png), saved before the business points at it and removed again if the business is gone",
    sideEffects: null,
    successDto: "{ logoUrl, message }",
    errorDisclosure: ["fixed"],
    findings: ["The upload is read into memory up to 20 MB per request (logoUpload); a logo needs far less (minor)."],
  },

  "DELETE /api/merchants/:id/logo": {
    branches: [{ principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: BUSINESS_OWNER_RULE }],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency:
      "removes the business's stored logo (deleteUploadedFile, only if the business owns it) and a legacy copy on disk, then clears the logo address; again changes nothing",
    sideEffects: "removes a legacy logo file from the server's disk when one exists (fs.unlinkSync)",
    successDto: "{ message }",
    errorDisclosure: ["fixed"],
    findings: [
      "The legacy disk removal builds its path from the business's stored logo address. Only the upload route writes that address now (a fixed name), so it cannot point elsewhere, but the path is not checked to stay under uploads/ (minor).",
    ],
  },

  "GET /api/merchants/:id/tapt-stones": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's active boards, each ${BOARD_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/merchants/:id/tapt-stones": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input:
      "id: strictPositiveIntegerParam; body read without a schema: name, optional, a string of at most 60 characters once trimmed (400 otherwise; blank or absent makes 'Stone N')",
    capability: null,
    entitlement: null,
    idempotency: "none: each call makes the business's next board, up to 10 at a time (TaptStoneCapacityError, 400); a numbering clash is 409",
    sideEffects: null,
    successDto: `the new board, ${BOARD_ROW}`,
    errorDisclosure: ["domain-errors"],
    findings: [TEAM_BOARDS],
  },

  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; the board read by id (getTaptStone) must be the business's (404 otherwise, the same for another business's)`,
      },
    ],
    input:
      "merchantId and stoneId: strictPositiveIntegerParam; body read without a schema: name, a non-blank string of at most 60 characters once trimmed (400 otherwise; the cap since 2026-09-27)",
    capability: null,
    entitlement: null,
    idempotency: "renames the board; the same name again changes nothing. A deleted (inactive) board is still found and renamed",
    sideEffects: null,
    successDto: `the board, ${BOARD_ROW}`,
    errorDisclosure: ["fixed"],
    findings: [TEAM_BOARDS],
  },

  "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; the board read by id (getTaptStone) must be the business's (404 otherwise, the same for another business's)`,
      },
    ],
    input: "merchantId and stoneId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "marks the board inactive (deleteTaptStone), so its page and printed QR stop working; again answers 200 and changes nothing",
    sideEffects: null,
    successDto: "{ message }",
    errorDisclosure: ["fixed"],
    findings: [TEAM_BOARDS],
  },

  "GET /api/merchants/:merchantId/stock-items": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input: "merchantId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's stock items, each ${STOCK_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/merchants/:merchantId/stock-items": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input:
      "merchantId: strictPositiveIntegerParam; body: createStockItemSchema (a name of 1 to 100 characters, a description of at most 500, a cost like 1.50, an emoji, variations; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "none: each call adds another item",
    sideEffects: null,
    successDto: `201, the new item, ${STOCK_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/merchants/:merchantId/stock-items/:itemId": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; the item read by id (getStockItem) must be the business's (404 otherwise, the same for another business's)`,
      },
    ],
    input: "merchantId and itemId: strictPositiveIntegerParam; body: updateStockItemSchema (as for a new item; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "sets the item's fields (updateStockItem); the same again changes nothing",
    sideEffects: null,
    successDto: `the item, ${STOCK_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "DELETE /api/merchants/:merchantId/stock-items/:itemId": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `${SIGNED_IN_BUSINESS_RULE}; the item read by id (getStockItem) must be the business's (404 otherwise, the same for another business's)`,
      },
    ],
    input: "merchantId and itemId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "deletes the item (deleteStockItem); again is 404",
    sideEffects: null,
    successDto: "{ message }",
    errorDisclosure: ["fixed"],
  },

  // ── Batch 6b (2026-09-27): the business's sales, refunds and reports ──
  "POST /api/transactions": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `the business named in the body (merchantId), checked with ${SIGNED_IN_BUSINESS_RULE}; a board must be one of its active boards (400 otherwise)`,
      },
    ],
    input:
      "body: retailTransactionCreateRequestSchema, strict (the business, an item name of 1 to 200 characters, a price like 5.00, splitting, the board, the link type; 400 with the issues)",
    capability: "a sale without a board has its own link, which needs per-payment links on (config.features.newRetailPayments: 503 otherwise)",
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "none: each call makes another pending sale, with a new private link (only its hash kept; a token clash is 503) or its board's shared address",
    sideEffects: "a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone); a push notification to the business (sendPushToMerchant)",
    successDto: "ownerTransactionDto with the sale's page and QR addresses; the private link's token appears only in this answer",
    errorDisclosure: ["input-issues"],
    findings: [ADMIN_MONEY],
  },

  "POST /api/transactions/cash-sale": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `the business named in the body (merchantId), checked with ${SIGNED_IN_BUSINESS_RULE}; a board must be one of its active boards (getTaptStone: 400 otherwise, since 2026-09-27)`,
      },
    ],
    input:
      "body: cashSaleRequestSchema, strict: the business, item name and price by the rules creating a sale uses, and an optional board (400 with the issues; since 2026-09-27, when parseInt and parseFloat let '1abc' and 'Infinity' through)",
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency: "none: each call records another completed cash sale",
    sideEffects: "a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone); a push notification (sendPushToMerchant)",
    successDto: "{ transaction: ownerTransactionDto }",
    errorDisclosure: ["input-issues"],
    findings: [ADMIN_MONEY],
  },

  "POST /api/transactions/tap-to-pay": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "path-merchant",
        tenantRule: `the business named in the body (merchantId), checked with ${SIGNED_IN_BUSINESS_RULE}; a sale named by transactionId must be the business's (404 otherwise) and pending (409)`,
      },
    ],
    input:
      "body read without a schema: merchantId and transactionId with parseInt, amount with parseFloat (400 if not above zero), windcaveToken required once the provider is configured",
    capability: "Tap to Pay must be on (config.features.tapToPay: 503 TAP_TO_PAY_DISABLED otherwise), and the provider configured (isWindcaveConfigured: 503 otherwise)",
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "charges the named pending sale's stored price, or the business's newest pending sale, or, with none, a new sale for the amount sent; a sale no longer pending is 409. Nothing stops the same request finishing a different pending sale or making a new one when repeated",
    sideEffects:
      "opens an attended session at the provider and submits the phone's card token to it (createAttendedSession, submitTapToPayToken); a live update on approval (sseBroker, via broadcastToStone); a push notification either way (sendPushToMerchant)",
    successDto: "{ approved, transactionId }",
    errorDisclosure: ["provider-text"],
    findings: [
      "A provider failure answers with the provider's own error text (`Failed to create attended session: …`, `Payment processor error: …`, from sessionResult.error and paymentResult.error), to a signed-in login of the business (R2's provider boundary).",
      "merchantId, transactionId and amount are read with parseInt and parseFloat (§8.4). It stays off (TAP_TO_PAY_DISABLED) until the iPhone hardware work (R7).",
      "No idempotency: without a transactionId, a repeat finishes whatever is pending next, or charges a new sale for the amount sent (R3's payment attempts).",
      ADMIN_MONEY,
    ],
  },

  "POST /api/transactions/:id/cancel": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "resource",
        tenantRule: `the sale read by id (getTransaction) must be the session's business's, by ${SIGNED_IN_BUSINESS_RULE}; another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist)`,
      },
    ],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "cancels a pending or processing sale; any other state is 400 (so again is 400)",
    sideEffects: "a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone)",
    successDto: "ownerTransactionDto with the board's addresses for a board sale",
    errorDisclosure: ["fixed"],
    findings: [ADMIN_MONEY],
  },

  "POST /api/transactions/:transactionId/refunds": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "resource",
        tenantRule:
          "the sale read by id (getTransaction) must be the session's business's: another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist); the platform admin, with no business, is refused (403 'Merchant access required', since 2026-09-27; it was 401)",
      },
    ],
    input:
      "transactionId: strictPositiveIntegerParam; body: createRefundSchema (an amount like 5.00, a reason of 1 to 500 characters, a method; 400 with the issues; the amount's form since 2026-09-27)",
    capability: "refunds must be on (config.features.refundInitiation: 503 otherwise), and the provider configured with the sale's provider transaction (isWindcaveConfigured: 503 otherwise)",
    entitlement: null,
    idempotency:
      "reserves the amount against what is left to refund (reserveRefundAmount: 409 when it exceeds it or another refund is in progress), records the refund, asks the provider, and gives the amount back if the provider refuses",
    sideEffects: "refunds at the provider (createWindcaveRefund); a live update (sseBroker, via broadcastToStone); a push notification (sendPushToMerchant)",
    successDto: "{ success, message, refund: the whole refund row, transaction: the whole sale row }",
    errorDisclosure: ["input-issues", "provider-text"],
    findings: [
      "A provider refusal answers with the provider's own error text (refundResult.error), to the owner (R2's provider boundary).",
      "Not durable across a crash between the provider's refund and the record's update: the refund stays pending and its amount reserved (R4, durable refunds).",
    ],
  },

  "GET /api/transactions/:transactionId/refunds": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule:
          "the sale read by id (getTransaction) must be the session's business's: another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist); the platform admin, with no business, is refused (403 'Merchant access required', since 2026-09-27; it was 401)",
      },
    ],
    input: "transactionId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the sale's ${REFUND_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "GET /api/merchants/:merchantId/refunds": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        platformAdmin: true,
        tenant: "resource",
        tenantRule: "the business in the path must be the session's (compared directly), or the caller the platform admin",
      },
    ],
    input: "merchantId: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `every refund of the business, ${REFUND_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "GET /api/merchants/:id/transactions": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input: "id: strictPositiveIntegerParam (400 otherwise)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "every sale of the business, ownerTransactionDto each, all at once (no paging)",
    errorDisclosure: ["fixed"],
  },

  "GET /api/merchants/:id/export/pdf": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], platformAdmin: true, tenant: "path-merchant", tenantRule: SIGNED_IN_BUSINESS_RULE }],
    input: "id: strictPositiveIntegerParam; startDate and endDate read raw with new Date(), optional (the live page sends neither)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "a PDF business report (generateBusinessReportPdf): the business, its figures and its sales in the range",
    errorDisclosure: ["fixed"],
    findings: ["startDate and endDate are read raw: a malformed one reaches the storage query as an invalid date (a 500, not the 400 P2.2 asks for; §8.4). The live page sends neither."],
  },

  "GET /api/invoice-documents/:name": {
    branches: [
      {
        principal: "merchant",
        when: "a signed-in business",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule:
          "only the business's own upload (getUploadedFileForMerchant): another business's, one no business could be attributed to, a malformed name and a missing one all give the same 404",
      },
      {
        principal: "platform-admin",
        when: "the validated platform admin (isValidatedPlatformAdmin)",
        tenant: "any-merchant",
        tenantRule:
          "any invoice document by its generated name (owner decision S1, 2026-09-19), each read recorded before any bytes leave (recordInvoiceDocumentAdminRead: 503 when it cannot be)",
      },
    ],
    input: "name: must be a generated invoice-document name (isInvoiceDocumentName: 404 otherwise), so no other folder or path can be asked for",
    capability: null,
    entitlement: null,
    idempotency: "read-only, apart from the admin's audit record",
    sideEffects: "an audit log line for each admin read (logSecurityEvent: ADMIN_INVOICE_DOCUMENT_READ)",
    successDto: "the document's bytes as a private download (sendPrivateDocument)",
    errorDisclosure: ["fixed"],
    findings: [
      "No screen calls it yet: the property terminal shows an attached document by name only. It serves gap 13's option C (owner decision 2026-09-14): a business reading its own documents, and the admin's audited reading.",
    ],
  },

  // ── Batch 6c (2026-09-27): the property routes ──
  "GET /api/property/tenants": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "search: raw, a string only: trimmed and matched anywhere in the first name, last name or property address, ignoring case (% and _ act as wildcards, over the business's own tenants); includeArchived: raw, 'true' includes archived tenants, anything else leaves them out",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's tenants, ${TENANT_ROW} each, newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/property/tenants": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "body: createTenantProfileSchema (a first and last name of 1 to 80 characters, the property address of 1 to 200, an optional email of at most 200 and phone of at most 40, co-tenants of at most 1,000, the preferred channel: email, WhatsApp or SMS; other fields are dropped, so the business is the session's; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "none: each call adds another tenant (no check for the same person)",
    sideEffects: null,
    successDto: `201 with the tenant, ${TENANT_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "GET /api/property/tenants/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("tenant", "getTenantProfile")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the tenant, ${TENANT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "PUT /api/property/tenants/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("tenant", "getTenantProfile")}; ${PROPERTY_ADMIN}` },
    ],
    input: `${propertyId("id")}; body: updateTenantProfileSchema (the create rules, each field optional: one left out stays as it is, and an emptied email, phone or co-tenants is cleared, since 2026-09-27, when the edit screen's emptied field was dropped and the old value kept; other fields are dropped; 400 with the issues)`,
    capability: null,
    entitlement: null,
    idempotency: "sets the given fields and clears the emptied ones (updateTenantProfile), an archived tenant's too; the same again changes nothing but the time changed",
    sideEffects: null,
    successDto: `the tenant afterwards, ${TENANT_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "POST /api/property/tenants/:id/archive": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("tenant", "getTenantProfile")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "archives the tenant and cancels every automation of theirs not already cancelled (archiveTenantProfile); invoices already sent stay payable. Again archives again, with a new time, and logs again",
    sideEffects: null,
    successDto: `the tenant afterwards, ${TENANT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/property/tenants/:id/unarchive": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("tenant", "getTenantProfile")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "restores the tenant (unarchiveTenantProfile); automations cancelled by the archive stay cancelled. Again changes nothing but the time, and logs again",
    sideEffects: null,
    successDto: `the tenant afterwards, ${TENANT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "GET /api/property/tenants/:id/events": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("tenant", "getTenantProfile")}; ${PROPERTY_ADMIN}` },
    ],
    input: `${propertyId("id")}; limit: strictBoundedIntegerQueryParam (50 by default, at most 200; 400 otherwise)`,
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "the tenant's history, newest first: whole event rows (what happened, the invoice or automation, and what it carried: amounts, channels, a charge's type and description, an external payment reference, the tenant's names and address when added)",
    errorDisclosure: ["fixed"],
  },

  "GET /api/property/schedules": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `every automation of the business, cancelled ones included (the screens leave those out), ${AUTOMATION_ROW} each, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/property/tenants/:tenantId/schedules": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${propertyRecord("tenant", "getTenantProfile")}, and must not be archived (409, since 2026-09-27); ${PROPERTY_ADMIN}`,
      },
    ],
    input: `${propertyId("tenantId")}; body: createActiveScheduleSchema (an amount of 1 cent to $1,000,000, weekly, fortnightly or monthly, a channel, the start and an optional end as date-times; other fields are dropped; 400 with the issues)`,
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "each call adds an automation, first run on its start date, and cancels the tenant's other automations not already cancelled (owner decision 2026-09-27: the new one replaces the old; each recorded with the time and an event). Two made at the same moment could each cancel the other",
    sideEffects: null,
    successDto: `201 with the automation, ${AUTOMATION_ROW}`,
    errorDisclosure: ["input-issues"],
    findings: [
      "The end date is stored but the rent cron never reads it (runGeneratePass; trades honours its own), and an end before the start is taken. No screen sends one.",
      "A start date in the past bills every period since, one request per cron run. No screen sends one: they start one interval from now.",
    ],
  },

  "PUT /api/property/schedules/:id": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${propertyRecord("automation", "getActiveSchedule")}, and not cancelled (409, since 2026-09-27: a cancelled one stays cancelled); ${PROPERTY_ADMIN}`,
      },
    ],
    input: `${propertyId("id")}; body: updateActiveScheduleSchema (the amount, frequency, channel, and active or paused: 'terminated' is refused since 2026-09-27, DELETE cancels; other fields are dropped; 400 with the issues)`,
    capability: null,
    entitlement: null,
    idempotency:
      "sets the given fields (updateActiveSchedule). Resuming a paused automation moves its next date to the first date on its cycle after now (nextRunDateAfter; owner decision 2026-09-27), so nothing is sent for the paused time; it billed every period it missed. Pausing or resuming logs an event, again too",
    sideEffects: null,
    successDto: `the automation afterwards, ${AUTOMATION_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "DELETE /api/property/schedules/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("automation", "getActiveSchedule")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: null,
    idempotency: "cancels the automation and records when (terminateActiveSchedule); a cancelled one is cancelled again, with a new time, and logged again",
    sideEffects: null,
    successDto: `the automation afterwards, ${AUTOMATION_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "GET /api/property/invoices": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "tenantProfileId: strictUuidParam when given (400 'Invalid tenantProfileId' otherwise; since 2026-09-27, a 500 before); status: raw, a string only, compared as text with each invoice's status (one that no invoice has matches nothing)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's invoices (or one tenant's, or those of one status), ${RENT_INVOICE_ROW} each, with the tenant's name and property address and what is still owed (owingCents, sharesLeft), newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/property/invoices/document": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "the file 'document': a PDF, PNG, JPEG, WebP or HEIC by its MIME type (400 with the filter's message otherwise), whose first bytes must match that type for all but HEIC (400), up to 20 MB (413 above it), read into memory; the type and size refusals were 500s until 2026-09-27 (receiveUpload, server/routes.ts). Its own name is returned as sent",
    capability: null,
    entitlement: null,
    idempotency: "none: each upload stores another document under a new random name (invoice-<time>-<16 hex characters>), stamped with the business (saveUploadedFile)",
    sideEffects: null,
    successDto: "{ documentUrl: an opaque reference the invoice create checks against the business, documentName: the file's own name }",
    errorDisclosure: ["fixed"],
    findings: ["The upload is read into memory up to 20 MB per request (invoiceDocUpload), by any login of the business."],
  },

  "POST /api/property/invoices": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `the tenant named in the body (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); ${PROPERTY_ADMIN}`,
      },
    ],
    input:
      "body: createAdHocInvoiceSchema, run before anything is read (since 2026-09-27; the tenant was read from the raw body first): the tenant as a UUID, an amount of 1 cent to $1,000,000, a channel, the due date as a date-time, splitting, rent or a charge with its type and a description of at most 200 characters, an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the issues. An attached document must be the business's own upload (requireOwnedInvoiceDocument)",
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "Rent, when the tenant has a live rent invoice (getLiveInvoiceByTenant): that invoice takes the new amount and is sent again (200, resent: true). Otherwise, and for every charge, a new invoice with a fresh checkout token (201)",
    sideEffects: `${RENT_DELIVERY}, at once; one that fails to send stays pending and the cron retries it`,
    successDto: `${RENT_INVOICE_ROW}, with resent, delivered and deliveryReason (a fixed code: not_found, not_payable, billing_card_required, missing_data, send_failed or no_deliverable)`,
    errorDisclosure: ["input-issues"],
    findings: [
      "Sending rent to a tenant with a live rent invoice changes that invoice's amount, even with split shares paid or a payment session open: the shares paid were worked out on the old amount, and an open session charges the old one (R3: payment attempts).",
    ],
  },

  "POST /api/property/invoices/:id/resend": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("invoice", "getInvoiceRentRequest")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "none: each call sends the link again, and a pending or failed invoice becomes dispatched; a paid, externally paid or voided one is 409 'Invoice is not payable' (400 until 2026-09-27, P2.2), and a send that fails is 502 with its reason, a fixed code",
    sideEffects: RENT_DELIVERY,
    successDto: `the invoice afterwards, ${RENT_INVOICE_ROW}`,
    errorDisclosure: ["domain-errors"],
    findings: [
      "No limit on resending: each call is an email, SMS or WhatsApp message to the tenant, at the platform's cost (operations).",
    ],
  },

  "POST /api/property/invoices/:id/void": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${propertyRecord("invoice", "getInvoiceRentRequest")}; ${PROPERTY_ADMIN}` },
    ],
    input: propertyId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "voids an invoice that is not paid (a paid or externally paid one is 409 'Cannot void a paid invoice', 400 until 2026-09-27, P2.2); a voided one is voided again, with a new time, and logged again",
    sideEffects: null,
    successDto: `the invoice afterwards, ${RENT_INVOICE_ROW}`,
    errorDisclosure: ["fixed"],
    findings: [
      paidElsewhereFinding("Voiding"),
      "A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).",
      PROPERTY_TEAM,
    ],
  },

  "POST /api/property/invoices/:id/mark-paid-external": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${propertyRecord("invoice", "getInvoiceRentRequest")}, and not voided (409, since 2026-09-27: a voided one stays voided); ${PROPERTY_ADMIN}`,
      },
    ],
    input: `${propertyId("id")}; body: markInvoicePaidExternalSchema (an optional reference of at most 200 characters, null or empty for none: both screens send null when no reference is typed, which was refused until 2026-09-27, batch 6d; 400 with the issues)`,
    capability: null,
    entitlement: null,
    idempotency: "marks the invoice paid outside TaptPay with the reference and the time; a paid or externally paid one is 409 'Invoice is already paid' (400 until 2026-09-27, P2.2)",
    sideEffects: null,
    successDto: `the invoice afterwards, ${RENT_INVOICE_ROW}`,
    errorDisclosure: ["input-issues"],
    findings: [
      paidElsewhereFinding("Marking an invoice paid outside TaptPay"),
      PROPERTY_TEAM,
    ],
  },

  "GET /api/property/reminder-settings": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ rentReminderEnabled, rentReminderDelayDays, rentReminderIntervalDays, rentReminderMaxCount }: the business's, or the defaults (on, 3, 3, 3) where unset; 404 when the business is gone",
    errorDisclosure: ["fixed"],
  },

  "PUT /api/property/reminder-settings": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "body: updateRentReminderSettingsSchema (on or off, the first reminder 0 to 90 days after the due date, then every 1 to 90 days, at most 0 to 20 reminders with 0 for no limit, shown as ∞; each optional; other fields are dropped; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency: "sets the given settings on the business (updateMerchant); the same again changes nothing",
    sideEffects: null,
    successDto: "the four settings afterwards",
    errorDisclosure: ["input-issues"],
    findings: [PROPERTY_TEAM],
  },

  // ── Batch 6d (2026-09-27): the trades routes ──
  "GET /api/trades/reminder-settings": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: "{ tradeRemindersEnabled }: the business's, or on where unset; 404 when the business is gone",
    errorDisclosure: ["fixed"],
  },

  "PUT /api/trades/reminder-settings": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "body: updateTradeReminderSettingsSchema (tradeRemindersEnabled, true or false, required; other fields are dropped; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "sets the switch on the business (updateMerchant); the same again changes nothing. Off stops the trades payment reminders (runTradesReminderPass, which follows the rent reminder days and count); overdue invoices are still marked due",
    sideEffects: null,
    successDto: "{ tradeRemindersEnabled } afterwards",
    errorDisclosure: ["input-issues"],
    findings: [TRADES_TEAM],
  },

  "GET /api/trades/gst-settings": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "{ gstRegistered, tradeGstMode: inclusive or exclusive }: the business's, or not registered and inclusive where unset; 404 when the business is gone. The settings page reads it for every login",
    errorDisclosure: ["fixed"],
  },

  "PUT /api/trades/gst-settings": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner"],
        tenant: "session",
        tenantRule: `the session's own business, its owner only (isAccountOwner: a teammate is 403 since 2026-09-27, as the settings page shows these to a teammate greyed out with the business's other details); ${adminRefused(ADMIN_403)}`,
      },
    ],
    input:
      "body: updateTradeGstSettingsSchema (gstRegistered, true or false, and tradeGstMode, inclusive or exclusive, each optional; other fields are dropped; 400 with the issues)",
    capability: null,
    entitlement: null,
    idempotency:
      "sets the given settings on the business (updateMerchant); the same again changes nothing. Quotes made afterwards take them (a quote keeps the GST worked out when it was made); the payment receipts (sendTradePaymentInvoice), the quote PDF's GST number and the public quote page read them when shown",
    sideEffects: null,
    successDto: "{ gstRegistered, tradeGstMode } afterwards",
    errorDisclosure: ["input-issues"],
  },

  "GET /api/trades/clients": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing (the includeArchived the client directory sends is not read)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `every client of the business, archived ones and hidden quick-invoice prospects included (the screens leave both out of their lists), ${CLIENT_ROW} each, newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/clients": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "body: createClientProfileSchema (a first and last name of 1 to 80 characters, the site address of 1 to 200, an optional email of at most 200 and phone of at most 40, notes of at most 1,000, the preferred channel: email, WhatsApp or SMS; other fields are dropped, so the business is the session's and the client active; 400 with the first issue)",
    capability: null,
    entitlement: null,
    idempotency: "none: each call adds another client (no check for the same person)",
    sideEffects: null,
    successDto: `201 with the client, ${CLIENT_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "GET /api/trades/clients/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the client, ${CLIENT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "PUT /api/trades/clients/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: `${tradesId("id")}; body: updateClientProfileSchema (the create rules, each field optional: one left out stays as it is, and an emptied email, phone or notes is cleared, since 2026-09-27, when the edit screen's emptied field was dropped and the old value kept; other fields are dropped, so the status cannot be set here; 400 with the first issue)`,
    capability: null,
    entitlement: null,
    idempotency: "sets the given fields and clears the emptied ones (updateClientProfile), an archived client's or a prospect's too; the same again changes nothing but the time changed",
    sideEffects: null,
    successDto: `the client afterwards, ${CLIENT_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "POST /api/trades/clients/:id/archive": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "archives the client (archiveClientProfile), then cancels each of the client's recurring invoices not already cancelled, recording when (terminateJobSchedule) with a schedule_terminated event (owner decision 2026-09-27: they went on billing the archived client every period); invoices already sent stay payable. Again archives again, with a new time, and has nothing left to cancel",
    sideEffects: null,
    successDto: `the client afterwards, ${CLIENT_ROW}`,
    errorDisclosure: ["fixed"],
    findings: [
      "The archive and the cancellations are separate writes: a failure between them leaves the client archived with recurring invoices still running, until the archive is repeated.",
    ],
  },

  "POST /api/trades/clients/:id/unarchive": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "sets the client active, whatever it was (a hidden prospect too), with no archive time (unarchiveClientProfile); recurring invoices cancelled by the archive stay cancelled. Again changes nothing but the time",
    sideEffects: null,
    successDto: `the client afterwards, ${CLIENT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/clients/:id/promote": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency: "a hidden quick-invoice prospect becomes a listed client (status active); any other client is 409 'Client is already saved' (400 until 2026-09-27, P2.2)",
    sideEffects: null,
    successDto: `the client afterwards, ${CLIENT_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "GET /api/trades/clients/:id/events": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("client", "getClientProfile")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "the client's history, newest first, at most 50 (getJobEventsByClient): whole event rows (what happened, the quote, invoice or recurring invoice, and what it carried: amounts, channels, a failed send's reason, WhatsApp statuses, split shares, the provider's transaction ids)",
    errorDisclosure: ["fixed"],
  },

  "GET /api/trades/quotes": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "status: raw, a string only (since 2026-09-27; a repeated one reached the query as a list), compared as text with each quote's status (one that no quote has matches nothing)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's quotes, or those of one status, ${QUOTE_ROW} each, newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/quotes": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `a client named in the body (getClientProfile) must be the session's business's: another business's is 404 'Client not found', the same as a missing one; without one, a hidden prospect is made from the recipient's details, or with none for a link-only quote; ${TRADES_ADMIN}`,
      },
    ],
    input:
      "body: createQuoteSchema (exactly one of a client's UUID, a recipient (a name of 1 to 160 characters, an optional email and address) or skipClient; 1 or more lines, each a description of 1 to 200 characters, a whole quantity of 1 to 100,000 and a unit price of 0 to $1,000,000, the line total sent being ignored and worked out again; a channel; a deposit, a percentage of at most 100 or a fixed amount, its type and value required when enabled; valid until as a date-time; notes of at most 1,000 characters; an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the first issue). An attached document must be the business's own upload (requireOwnedInvoiceDocument)",
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "none: each call makes another quote, sent at once with a new public link, and another hidden prospect when no client is named; its GST is worked out from the business's settings at that moment and kept",
    sideEffects: `${tradesDelivery("the quote's link, with the quote as a PDF by email")}; a send that fails is recorded (quote_dispatch_failed) and the link still works`,
    successDto: `201 with the quote, ${QUOTE_ROW}, with delivered and deliveryReason (a fixed code: not_found, missing_data, billing_card_required, send_failed or no_deliverable)`,
    errorDisclosure: ["input-issues"],
    findings: [
      archivedStillFinding("quoted"),
      "Each quote to someone not saved as a client makes another hidden prospect, and nothing removes them.",
    ],
  },

  "GET /api/trades/quotes/:id/pdf": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("quote", "getQuote")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto:
      "the quote as a PDF download (quote-<business>-<reference>.pdf), made from the quote, its client and the business (generateQuotePdf); 404 'Quote details unavailable' when the client or the business is gone",
    errorDisclosure: ["fixed"],
  },

  "GET /api/trades/invoices": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input:
      "clientProfileId: strictUuidParam when given (400 'Invalid clientProfileId' otherwise; since 2026-09-27, a 500 before); status: raw, a string only (since 2026-09-27; a repeated one reached the query as a list), compared as text with each invoice's status (one that no invoice has matches nothing)",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `the business's invoices (or one client's, or those of one status), ${JOB_INVOICE_ROW} each, newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/invoices": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `a client named in the body (getClientProfile) must be the session's business's, and a quote named (getQuote) the business's and that client's (since 2026-09-27; it had only to be the business's): each otherwise 404, the same as a missing one; for a quick invoice, a hidden prospect is made from the recipient's details; ${TRADES_ADMIN}`,
      },
    ],
    input:
      "body: createJobInvoiceSchema (a client's UUID or, for a quick invoice, a recipient: a name of 1 to 120 characters, with the email or phone its channel, email or SMS, needs; an amount of 1 cent to $1,000,000; a channel; the due date and an optional send date as date-times; the kind, full or deposit, since 2026-09-27 (a balance is made by send-balance and a recurring invoice by the cron: both were taken here); a quote's UUID, required for a deposit and not allowed for a quick invoice, which must be full; job details of at most 500 characters; splitting; an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the first issue). An attached document must be the business's own upload (requireOwnedInvoiceDocument)",
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "none: each call makes another invoice with a fresh checkout token, and a hidden prospect for a quick invoice. Several deposits on one quote are taken; send-balance subtracts them all",
    sideEffects: `${tradesDelivery("the payment link")}, at once unless the send date is later (the cron sends it then); a send that fails stays pending and the cron retries it`,
    successDto: `201 with the invoice, ${JOB_INVOICE_ROW}, with delivered and deliveryReason (a fixed code: scheduled, not_found, not_payable, missing_data, send_failed or no_deliverable)`,
    errorDisclosure: ["input-issues"],
    findings: [
      archivedStillFinding("invoiced"),
      "A deposit's amount is the one typed, not checked against the deposit its quote worked out.",
    ],
  },

  "POST /api/trades/invoices/:id/send-balance": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${tradesRecord("deposit invoice", "getJobInvoice")}; its quote is the one the deposit names (getQuote); ${TRADES_ADMIN}`,
      },
    ],
    input: `${tradesId("id")}; body: sendJobBalanceSchema (splitEnabled, true or false, optional, and nothing else, since 2026-09-27: it was read from the raw body, so "yes" turned splitting on; 400 with the first issue)`,
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency:
      "one balance per quote: the invoice must be a deposit (400), paid (409) and on a quote (400); a balance already made and not voided is 409. The balance is the quote's total less every invoice of the client's on that quote not voided (400 when nothing is left), due in 7 days, by the deposit's channel",
    sideEffects: `${tradesDelivery("the balance's payment link")}, at once`,
    successDto: `201 with the balance invoice, ${JOB_INVOICE_ROW}, with delivered and ${INVOICE_DELIVERY_REASON}`,
    errorDisclosure: ["input-issues"],
    findings: [
      "Two sends at the same moment can each find no balance and each make one, billing the client twice: the one-balance check is a read, then a write (R3).",
    ],
  },

  "POST /api/trades/invoices/:id/mark-paid-external": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${tradesRecord("invoice", "getJobInvoice")}, and neither voided nor already paid (409 each, since 2026-09-27); ${TRADES_ADMIN}`,
      },
    ],
    input: `${tradesId("id")}; body: markJobPaidExternalSchema (an optional reference of at most 200 characters, null or empty for none: every screen sends null when no reference is typed, and the desktop always does, which was refused until 2026-09-27; 400 with the first issue)`,
    capability: null,
    entitlement: null,
    idempotency:
      "marks the invoice paid outside TaptPay with the reference and the time, and logs it; a voided or paid one is 409 (since 2026-09-27: each call marked it again and emailed the client another receipt)",
    sideEffects: "emails the client a receipt for the invoice, with the business's GST number (sendTradePaymentInvoice); nothing when the client has no email",
    successDto: `the invoice afterwards, ${JOB_INVOICE_ROW}`,
    errorDisclosure: ["input-issues"],
    findings: [tradesPaidElsewhereFinding("Marking an invoice paid outside TaptPay"), TRADES_TEAM],
  },

  "POST /api/trades/invoices/:id/complete": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("invoice", "getJobInvoice")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "records the job complete, with the time and a job_completed event, on a paid invoice that is not a deposit: a deposit is 409 (the balance comes first), an unpaid invoice 409. Again records a new time, and logs again",
    sideEffects: null,
    successDto: `the invoice afterwards, ${JOB_INVOICE_ROW}`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/invoices/:id/void": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${tradesRecord("invoice", "getJobInvoice")}, and not paid (409 since 2026-09-27: the screens offer cancelling only an unpaid one); ${TRADES_ADMIN}`,
      },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "voids the invoice with the time and logs it in the client's history (invoice_voided, since 2026-09-27); a voided one is voided again, with a new time, and logged again",
    sideEffects: null,
    successDto: `the invoice afterwards, ${JOB_INVOICE_ROW}`,
    errorDisclosure: ["fixed"],
    findings: [
      tradesPaidElsewhereFinding("Voiding"),
      "A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).",
      TRADES_TEAM,
    ],
  },

  "GET /api/trades/schedules": {
    branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: sessionBusiness(ADMIN_403) }],
    input: "nothing",
    capability: null,
    entitlement: null,
    idempotency: "read-only",
    sideEffects: null,
    successDto: `every recurring invoice of the business, cancelled ones included (the recurring-invoice page lists them with their status), ${RECURRING_ROW} each, newest first, all at once (no paging)`,
    errorDisclosure: ["fixed"],
  },

  "POST /api/trades/schedules": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `the client named in the body (getClientProfile) must be the session's business's: another business's is 404 'Client not found', the same as a missing one; and not archived (409 since 2026-09-27: archiving cancels a client's recurring invoices, owner decision); ${TRADES_ADMIN}`,
      },
    ],
    input:
      `body: createJobScheduleSchema (the client's UUID, an amount of 1 cent to $1,000,000, weekly, fortnightly or monthly, a channel, the start and an optional end as date-times; other fields are dropped; 400 with the first issue). An end before the start is 400, and a start more than a day before now is 400 "The start date can't be in the past" (owner decision 2026-09-27: it billed every period since, one overdue invoice per cron run; the day's grace is because the forms send today's UTC date at 09:00 UTC)`,
    capability: null,
    entitlement: "paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)",
    idempotency: "none: each call adds another recurring invoice, first run on its start date; a client may have several, one per job",
    sideEffects: null,
    successDto: `201 with the recurring invoice, ${RECURRING_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "PUT /api/trades/schedules/:id": {
    branches: [
      {
        principal: "merchant",
        roles: ["owner", "member"],
        tenant: "resource",
        tenantRule: `${tradesRecord("recurring invoice", "getJobSchedule")}, and not cancelled (409 since 2026-09-27: a cancelled one stays cancelled); ${TRADES_ADMIN}`,
      },
    ],
    input: `${tradesId("id")}; body: updateJobScheduleSchema (the amount, frequency, channel, and active or paused: 'terminated' is refused since 2026-09-27, DELETE cancels; other fields are dropped; 400 with the first issue)`,
    capability: null,
    entitlement: null,
    idempotency:
      "sets the given fields (updateJobSchedule). Resuming a paused one moves its next date to the first date on its cycle after now, a monthly one kept on its start date's day of the month (nextJobRunDateAfter; owner decision 2026-09-27), so nothing is sent for the paused time; it billed every period it missed. Every call logs an event (paused, resumed or updated, with the change), again too",
    sideEffects: null,
    successDto: `the recurring invoice afterwards, ${RECURRING_ROW}`,
    errorDisclosure: ["input-issues"],
  },

  "DELETE /api/trades/schedules/:id": {
    branches: [
      { principal: "merchant", roles: ["owner", "member"], tenant: "resource", tenantRule: `${tradesRecord("recurring invoice", "getJobSchedule")}; ${TRADES_ADMIN}` },
    ],
    input: tradesId("id"),
    capability: null,
    entitlement: null,
    idempotency:
      "cancels the recurring invoice, recording when (terminateJobSchedule), and logs it; a cancelled one is cancelled again, with a new time, and logged again. Invoices it already made stay payable",
    sideEffects: null,
    successDto: `the recurring invoice afterwards, ${RECURRING_ROW}`,
    errorDisclosure: ["fixed"],
  },
};

/**
 * Routes not reviewed yet. May only shrink: PENDING_CEILING is lowered by
 * every batch, so a route cannot be added here instead of being reviewed.
 */
export const PENDING_CEILING = 0;

export const REVIEW_PENDING: readonly string[] = [];
