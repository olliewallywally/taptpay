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
};

/**
 * Routes not reviewed yet. May only shrink: PENDING_CEILING is lowered by
 * every batch, so a route cannot be added here instead of being reviewed.
 */
export const PENDING_CEILING = 211;

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
  "GET /api/pay/t/:token",
  "GET /api/pay/t/:token/qr",
  "POST /api/pay/t/:token/split",
  "GET /api/pay/t/:token/receipt",
  "POST /api/pay/t/:token/receipt-pdf",
  "GET /api/pay/t/:token/receipt-qr",
  "POST /api/pay/t/:token/session",
  "POST /api/pay/t/:token/hosted-fields-complete",
  "POST /api/pay/t/:token/googlepay-complete",
  "GET /api/pay/return/:state",
  "GET /api/merchants/:id/active-transaction",
  "POST /api/transactions",
  "POST /api/transactions/cash-sale",
  "POST /api/transactions/tap-to-pay",
  "POST /api/transactions/:id/split",
  "PATCH /api/transactions/:id/split-enabled",
  "GET /api/split-payments/:id",
  "POST /api/transactions/:id/cancel",
  "POST /api/merchants/:merchantId/nfc-pay",
  "GET /api/nfc/capabilities",
  "POST /api/transactions/:id/pay",
  "GET /api/windcave/env",
  "POST /api/transactions/:id/hosted-fields-complete",
  "POST /api/transactions/:id/googlepay-complete",
  "GET /api/transactions/:id",
  "POST /api/transactions/:id/receipt-pdf",
  "GET /api/transactions/:id/receipt-qr",
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
  "GET /api/windcave/callback",
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
  "GET /api/checkout/resolve/:token",
  "GET /api/checkout/document/:token",
  "POST /api/checkout/:token/split",
  "POST /api/checkout/pay",
  "POST /api/checkout/:token/session",
  "POST /api/checkout/:token/hosted-fields-complete",
  "POST /api/checkout/:token/googlepay-complete",
  "GET /api/checkout/callback",
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
  "GET /api/trades/quotes/token/:token/pdf",
  "POST /api/trades/quotes/:id/resend",
  "GET /api/trades/quotes/token/:token",
  "POST /api/trades/quotes/token/:token/respond",
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
