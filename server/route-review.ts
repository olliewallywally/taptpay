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
const SPLIT_INVOICE_SESSION_FINDING =
  "A split invoice records none of the sessions opened for it, so its completion checks only that the provider approved the session the page sends: any approved session on the platform's provider account (another invoice's share, a $1 purchase anywhere) marks one share paid, one such session per share marks the invoice paid, and each is emailed a GST invoice once rent is paid. The single-payment branch was fixed 2026-09-26 (R1-T7's rule). Needs each opened session recorded (the payment attempts engine, R3, or an interim column): put to the owner 2026-09-26.";
const SPLIT_INVOICE_SHARE_FINDING =
  "What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment, and is never checked again: the count can change until a share is paid, so a share opened at 1/12 then counts as 1/2 and the invoice shows paid with less money; shares opened at once are all charged the equal share, so the remainder's cents go uncharged. Same root as the session finding (R3).";
const PAYER_EMAIL_FINDING =
  "payerEmail, checked only against /.+@.+\\..+/, is added to splitPayerEmails without limit (10 calls a minute per link), and every address gets the rent invoice's GST invoice once it is paid: a link holder can have the business email its tenant's name, address and rent to any number of addresses. Trades store the list but email only the client.";
const RESESSION_FINDING =
  "Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).";
const QUOTE_TENANT_RULE =
  "the quote's token (20 random bytes, base64url) selects its one quote (getQuoteByToken); an unknown token is 404";
const QUOTE_AUTHENTICITY = "holding the quote's link: its token is the credential for that one quote";
const QUOTE_WHOLE_ROW_FINDING =
  "Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).";

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
          "the provider's session id selects the one rent invoice created with it (storage.getInvoiceRentRequestByWindcaveSessionId); an unknown id does nothing",
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
          "the provider's session id selects the one job invoice created with it (storage.getJobInvoiceByWindcaveSessionId); an unknown id does nothing",
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
      "publicTransactionDto: id, business id, board id, item, price, status, method, split counts and date, and the board's page address",
    errorDisclosure: ["fixed"],
    controls: { authenticity: NUMBER_AUTHENTICITY, replay: "read-only", rate: "none — no limit" },
    findings: [
      `${NUMBERED_SALE_FINDING} With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board.`,
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
          "the sale's number (transactionId), or else the provider session id, selects the sale; a sale with its own link is 404; a cancel is believed only with the bound session id",
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
    idempotency: "sets the invoice's share count; refused once a share is paid (409) and when the business has not allowed splitting (400)",
    sideEffects: null,
    successDto: "{ splitCount, splitPaidCount: 0, shareCents }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "the same count again changes nothing; another count is taken until a share is paid (finding)",
      rate: CHECKOUT_RATE,
    },
    findings: [SPLIT_INVOICE_SHARE_FINDING],
  },

  "POST /api/checkout/pay": {
    branches: [
      { principal: "public-bearer", tenant: "token", tenantRule: `${CHECKOUT_TENANT_RULE}; here the token comes in the body` },
    ],
    input:
      "body read without a schema: token (required and looked up; its type is not checked) and payerEmail (checked only against /.+@.+\\..+/)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE)",
    entitlement: null,
    idempotency: "none: every call opens another provider session (finding)",
    sideEffects:
      "creates a payment session with the provider (createWindcaveSession); when the provider reports it already complete, settles the invoice: events, and once paid the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)",
    successDto: "{ hppUrl }: the provider's hosted page, or the invoice's own checkout page when already complete",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "each call opens another provider session for the same invoice",
      rate: CHECKOUT_RATE,
    },
    findings: [
      "No screen calls this route (the checkout page uses POST /api/checkout/:token/session): a public redirect flow kept alive. A split invoice's share paid through it can never be recorded: no session is pinned, the browser return settles only a pinned session, and the notification finds invoices by their pinned session.",
      RESESSION_FINDING,
      PAYER_EMAIL_FINDING,
      SPLIT_INVOICE_SHARE_FINDING,
    ],
  },

  "POST /api/checkout/:token/session": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: CHECKOUT_TENANT_RULE }],
    input: "token: read raw, then looked up; body read without a schema: payerEmail (checked only against /.+@.+\\..+/)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE)",
    entitlement: null,
    idempotency: "none: every call opens another provider session (finding)",
    sideEffects:
      "creates a payment session with the provider (createWindcaveSession); when the provider reports it already complete, settles the invoice: events, and once paid the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)",
    successDto:
      "the provider session id, the amount and the hosted-fields submit URLs (also cached here against the token, invoiceAjaxUrlCache); or { alreadyComplete, approved }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: CHECKOUT_AUTHENTICITY,
      replay: "each call opens another provider session for the same invoice",
      rate: CHECKOUT_RATE,
    },
    findings: [RESESSION_FINDING, PAYER_EMAIL_FINDING, SPLIT_INVOICE_SHARE_FINDING],
  },

  "POST /api/checkout/:token/hosted-fields-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${CHECKOUT_TENANT_RULE}; a single payment must send the session pinned to it (403 otherwise, and when none is pinned, since 2026-09-26); a split invoice's session is not checked (finding)`,
      },
    ],
    input: "token: read raw, then looked up; body read without a schema: sessionId (required; sent to the provider as one encoded path segment)",
    capability: "isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)",
    entitlement: null,
    idempotency:
      "finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per session (atomicClaimSplitShare / atomicClaimJobSplitShare); a single payment settles by a read then a write",
    sideEffects:
      "queries the provider for the session (queryWindcaveSession); once paid, the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)",
    successDto: "{ approved, status, splitCount, splitPaidCount }",
    errorDisclosure: ["fixed"],
    controls: {
      authenticity: `${CHECKOUT_AUTHENTICITY}, with the invoice's pinned session for a single payment`,
      replay: "a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)",
      rate: "none — every call asks the provider about the session sent, with the platform's credentials",
    },
    findings: [SPLIT_INVOICE_SESSION_FINDING],
  },

  "POST /api/checkout/:token/googlepay-complete": {
    branches: [
      {
        principal: "public-bearer",
        tenant: "token",
        tenantRule: `${CHECKOUT_TENANT_RULE}; a single payment must send the session pinned to it (403 otherwise, and when none is pinned, since 2026-09-26); a split invoice's session is not checked (finding)`,
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
      authenticity: `${CHECKOUT_AUTHENTICITY}, with the invoice's pinned session for a single payment`,
      replay: "a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)",
      rate: "none — every call reaches the provider, with the platform's credentials",
    },
    findings: [
      SPLIT_INVOICE_SESSION_FINDING,
      "The submit URLs are cached per link, not per session: when two payers of one split invoice open sessions, the first one's Google Pay payment goes to the second one's session, and both sessions are then counted as shares.",
    ],
  },

  "GET /api/checkout/callback": {
    branches: [{ principal: "public-bearer", tenant: "token", tenantRule: `${CHECKOUT_TENANT_RULE}; here the token comes in the query` }],
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
};

/**
 * Routes not reviewed yet. May only shrink: PENDING_CEILING is lowered by
 * every batch, so a route cannot be added here instead of being reviewed.
 */
export const PENDING_CEILING = 181;

export const REVIEW_PENDING: readonly string[] = [
  "GET /robots.txt",
  "GET /nfc/:merchantId/stone/:stoneId",
  "GET /nfc/:merchantId",
  "GET /.well-known/apple-developer-merchantid-domain-association",
  "GET /sitemap.xml",
  "GET /api/auth/google",
  "GET /api/auth/google/callback",
  "POST /api/auth/google/session",
  "POST /api/auth/sign-out-everywhere",
  "POST /api/auth/login",
  "POST /api/auth/forgot-password",
  "POST /api/auth/reset-password",
  "GET /api/auth/validate-reset-token/:token",
  "GET /api/admin/request-origin",
  "POST /api/admin/auth/login",
  "GET /api/auth/me",
  "GET /api/tutorial/state",
  "PATCH /api/tutorial/pages/:pageKey",
  "POST /api/tutorial/restart",
  "POST /api/merchants/:id/onboarding",
  "GET /api/admin/auth/me",
  "GET /api/merchants/:id/qr",
  "GET /api/merchants/:id/stone/:stoneId/qr",
  "GET /api/merchants/:id",
  "GET /api/merchants/:id/profile",
  "GET /api/merchants/:id/active-transaction",
  "POST /api/transactions",
  "POST /api/transactions/cash-sale",
  "POST /api/transactions/tap-to-pay",
  "PATCH /api/transactions/:id/split-enabled",
  "POST /api/transactions/:id/cancel",
  "POST /api/merchants/:merchantId/nfc-pay",
  "GET /api/nfc/capabilities",
  "GET /api/windcave/env",
  "GET /api/merchants/:id/analytics",
  "GET /api/merchants/:id/revenue-over-time",
  "GET /api/merchants/:id/analytics/export",
  "GET /api/merchants/:id/export/csv",
  "GET /api/merchants/:id/export/pdf",
  "POST /api/admin/merchants/:id/verify",
  "POST /api/admin/merchants/:id/set-active",
  "GET /api/admin/merchants/:id/transactions",
  "PATCH /api/admin/merchants/:id/windcave-merchant-id",
  "POST /api/admin/merchants/:id/activate",
  "PUT /api/merchants/:id/rates",
  "PUT /api/merchants/:id/details",
  "PUT /api/merchants/:id/change-password",
  "PUT /api/merchants/:id/bank-account",
  "PUT /api/merchants/:id/theme",
  "PUT /api/merchants/:id/daily-goal",
  "PUT /api/merchants/:id",
  "POST /api/merchants/:id/logo",
  "DELETE /api/merchants/:id/logo",
  "GET /api/merchants/:id/transactions",
  "GET /api/merchants/:id/tapt-stones",
  "POST /api/merchants/:id/tapt-stones",
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId",
  "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId",
  "GET /api/tapt-stones/:id",
  "GET /api/admin/subscription-revenue",
  "GET /api/windcave/status",
  "GET /api/admin/analytics",
  "GET /api/admin/revenue-over-time",
  "GET /api/admin/payment-method-breakdown",
  "GET /api/admin/ga4-detailed",
  "GET /api/admin/ga4-metrics",
  "POST /api/admin/merchants",
  "PUT /api/admin/merchants/:id",
  "POST /api/merchants/:id/test-payment-link",
  "GET /api/admin/merchants",
  "GET /api/admin/merchants/:id",
  "DELETE /api/admin/merchants/:id",
  "POST /api/admin/clear-merchants",
  "POST /api/admin/resend-verification",
  "POST /api/admin/test-email",
  "GET /api/admin/email-status",
  "POST /api/merchants/verify",
  "GET /api/merchants/:id/email-status",
  "POST /api/auth/confirm-email",
  "POST /api/auth/resend-confirmation",
  "POST /api/info-pack-leads",
  "POST /api/merchants/signup",
  "PUT /api/merchants/:id/business-details",
  "POST /api/admin/merchants/signup",
  "GET /api/merchants/:id/events",
  "GET /api/push/capabilities",
  "GET /api/push/vapid-key",
  "POST /api/push/subscribe",
  "POST /api/push/unsubscribe",
  "POST /api/push/native-subscribe",
  "POST /api/push/native-unsubscribe",
  "GET /api/push/status",
  "GET /api/push/preferences",
  "PUT /api/push/preferences",
  "POST /api/merchants/:id/clear-transactions",
  "POST /api/transactions/:transactionId/refunds",
  "GET /api/transactions/:transactionId/refunds",
  "GET /api/merchants/:merchantId/refunds",
  "GET /api/refunds/:refundId",
  "GET /api/admin/api-keys",
  "POST /api/admin/api-keys",
  "POST /api/admin/api-keys/:keyId/revoke",
  "GET /api/admin/api-metrics",
  "GET /api/admin/api-usage",
  "GET /api/merchants/:merchantId/stock-items",
  "POST /api/merchants/:merchantId/stock-items",
  "PUT /api/merchants/:merchantId/stock-items/:itemId",
  "DELETE /api/merchants/:merchantId/stock-items/:itemId",
  "POST /api/payments/apple-pay/validate",
  "POST /api/payments/apple-pay/process",
  "POST /api/payments/google-pay/process",
  "GET /api/payments/digital-wallet/config",
  "GET /api/subscription",
  "PUT /api/subscription/plan",
  "POST /api/subscription/cancel",
  "POST /api/subscription/resume",
  "GET /api/team",
  "POST /api/team/invite",
  "POST /api/team/:userId/resend",
  "DELETE /api/team/:userId/invite",
  "PUT /api/team/:userId/status",
  "DELETE /api/team/:userId",
  "POST /api/team/accept-invite",
  "GET /api/subscription/billing-history",
  "GET /api/billing/card",
  "POST /api/billing/card/session",
  "POST /api/billing/card/confirm",
  "DELETE /api/billing/card",
  "POST /api/board-builder/submit",
  "GET /uploads/:folder/:name",
  "GET /api/property/tenants",
  "POST /api/property/tenants",
  "GET /api/property/tenants/:id",
  "PUT /api/property/tenants/:id",
  "POST /api/property/tenants/:id/archive",
  "POST /api/property/tenants/:id/unarchive",
  "GET /api/property/tenants/:id/events",
  "GET /api/property/schedules",
  "GET /api/property/tenants/:tenantId/schedules",
  "POST /api/property/tenants/:tenantId/schedules",
  "PUT /api/property/schedules/:id",
  "DELETE /api/property/schedules/:id",
  "GET /api/property/invoices",
  "POST /api/property/invoices/document",
  "GET /api/invoice-documents/:name",
  "POST /api/property/invoices",
  "POST /api/property/invoices/:id/resend",
  "GET /api/property/invoices/:id",
  "POST /api/property/invoices/:id/void",
  "POST /api/property/invoices/:id/mark-paid-external",
  "PUT /api/merchants/:merchantId/sector",
  "GET /api/property/reminder-settings",
  "PUT /api/property/reminder-settings",
  "GET /api/trades/reminder-settings",
  "PUT /api/trades/reminder-settings",
  "GET /api/trades/gst-settings",
  "PUT /api/trades/gst-settings",
  "GET /api/trades/clients",
  "POST /api/trades/clients",
  "GET /api/trades/clients/:id",
  "PUT /api/trades/clients/:id",
  "POST /api/trades/clients/:id/archive",
  "POST /api/trades/clients/:id/unarchive",
  "POST /api/trades/clients/:id/promote",
  "GET /api/trades/clients/:id/events",
  "GET /api/trades/quotes",
  "POST /api/trades/quotes",
  "GET /api/trades/quotes/:id",
  "GET /api/trades/quotes/:id/pdf",
  "POST /api/trades/quotes/:id/resend",
  "GET /api/trades/invoices",
  "POST /api/trades/invoices",
  "POST /api/trades/invoices/:id/resend",
  "POST /api/trades/invoices/:id/send-balance",
  "POST /api/trades/invoices/:id/mark-paid-external",
  "POST /api/trades/invoices/:id/complete",
  "POST /api/trades/invoices/:id/void",
  "GET /api/trades/schedules",
  "POST /api/trades/schedules",
  "PUT /api/trades/schedules/:id",
  "DELETE /api/trades/schedules/:id",
];
