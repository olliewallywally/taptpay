# R2 preflight — provider boundary and exact Windcave verification, 2026-10-11

Phase: R2 (plan v2.2 §9). Status: **preflight and first review only; no R2 code.**
Branch `ccr-e07e3100-0wm8kr` at `0cf210be`. Line numbers below are at that commit.
Authority: [owner decision](../../../decisions/2026-10-11-r2-start-while-codex-finishes-r1.md).
Review: [§21.1 pass 1](R2-review-pass-1-2026-10-11.md).

No live Windcave call, database, migration or deployment was used. Everything below
comes from reading the source and existing tests.

## 1. What exists today

`server/windcave.ts` (957 lines) is the only provider client. `server/config.ts`
already implements plan §5.2: `PAYMENT_MODE`, exact UAT/production endpoints,
`FEATURE_LIVE_WINDCAVE`, complete credential pairs, and
`FEATURE_PROVIDER_RECONCILIATION` required in UAT. `isWindcaveConfigured()` is true
only in `uat`/`production` mode with all three values.

### Provider call sites (all in `server/routes.ts` unless noted)

| Flow | Session creation | Completion / query | Gate today |
|---|---|---|---|
| Retail token link (durable `payment_attempts`) | `POST /api/pay/t/:token/session` (2297) | hosted-fields-complete (2481), googlepay-complete (2541 submit; 2550, 2555, 2610 query), receipt-qr (2139) | `isWindcaveConfigured()` + return-state secret |
| Legacy numbered sale | `POST /api/transactions/:id/pay` (3362) | hosted-fields-complete (3533), googlepay-complete (3586 submit; 3590, 3600), `/api/windcave/notification` (4511), `/api/windcave/callback` (4697) | `isWindcaveConfigured()` |
| Property/trades invoice checkout | `POST /api/checkout/:token/session` (8040) | hosted-fields-complete (8108), googlepay-complete (8150 submit; 8152, 8160), `/api/checkout/callback` (8196), rent-notification (8221), trades-notification (8243) | `isWindcaveConfigured()` |
| Tap to Pay | `createAttendedSession` (3005) | `submitTapToPayToken` (3011) | `FEATURE_TAP_TO_PAY` (off, R7) |
| Refunds | — | `createWindcaveRefund` (5970) | `FEATURE_REFUND_INITIATION` (off, R4) |
| Subscription card on file | `createCardStorageSession` (6993) | `queryStoredCardSession` (7057), `chargeStoredCard` (routes 158, `subscription-billing.ts` 158) | provider configured; injectable transport already exists |

So in UAT every retail, numbered and invoice completion path is live. R2's exit
("all enabled completion paths call the shared verifier") covers all three flows.

## 2. Baseline defects found (characterized, not fixed)

| ID | Plan | Finding | Evidence |
|---|---|---|---|
| RF-1 | §9.1, §9.5 | All three Google Pay completions settle money from the wallet-submit reply: `approved` if a returned link's `href` contains `result=approved`, otherwise declined; fallback `authorised \|\| approved \|\| responseCode === "00"`. No session query, no amount/reference check. | `windcave.ts:719-737`; `routes.ts:2541-2549`, `3586-3597`, `8150-8158` |
| RF-2 | §9.1, §9.3 | `queryWindcaveSession` reads only `transactions?.[0].authorised`. A 200 with no transaction or a non-final one returns `success: true, approved: false`; callers store that as a final **declined** (retail `routes.ts:2488-2493`). Multiple transactions: only the first is read. No session-ID equality, amount, currency, reference or type check. Whether Windcave returns 200 without a final transaction must be confirmed from official fixtures (not certain). | `windcave.ts:226-242` (first transaction at 233) |
| RF-3 | §9.5 | Duplicate X-ID on session creation (HTTP 200) treats `transactions[0].authorised` as approval with no verification. | `windcave.ts:134-147` (first transaction at 137) |
| RF-4 | §9.2 | Provider links (`hpp`, `ajaxSubmitCard/ApplePay/GooglePay`, or any `REDIRECT`) are returned to the browser unvalidated. `assertWindcaveUrl` (a prefix regex accepting both UAT and production hosts) runs only before Google Pay submits. | `windcave.ts:150-176`; `routes.ts:229-232` |
| RF-5 | §9.2 | `getWindcaveEnv()` uses `endpoint.includes("sec.windcave.com")`. Config pins the exact endpoint, so it is safe today, but it is substring matching. | `windcave.ts:12-15` |
| RF-6 | §9.6 exit | Raw session IDs and provider error text (which embeds the provider's response body for 4xx) reach `console.error`: notification/callback/rent/trades handlers. Tap to Pay returns provider text to the browser (feature off). | `routes.ts:4523`, `4709`, `8222`, `8244`, `3007`, `3016`; `windcave.ts:184`, `254` |
| RF-7 | §5.2 rule 8, §9.1 | Endpoint and session URLs are module constants captured at import; auth header, `fetch` and timers are global, so tests stub `global.fetch`. | `windcave.ts:6-10`, `33-47` |
| RF-8 | §9.4 | `payment_attempts` has no expected amount/currency/reference/environment, provider transaction ID or reconciliation code. The `processor_session_id` partial unique index exists (migration 0022). | `shared/schema.ts:273-313` |
| RF-9 | §9.4, §9.5 | References: retail `TAPT_<attempt uuid>` (good); invoices `RENT-/JOB-` + 8 characters of the invoice ID, the same for every share and attempt; Tap to Pay and refunds fall back to `Date.now()`. | `routes.ts:2283`, `8035`, `2994`, `5969` |

## 3. Proposed R2 slices (for review)

Each slice: failing tests first, sanitized official-shape fixtures, no network or
environment variables in tests, server suite and typecheck green.

- **R2-T1 — injectable client and typed results (§9.1).** `createWindcaveClient({ config, transport, clock, ids, wait })` built from validated config. Its typed results use exactly the §9.1 categories: timeout, malformed, missing or ambiguous transaction, and pending never map to approved or declined. The existing exports become thin wrappers that keep today's return shape, so route behaviour does not change until T5 moves the routes onto typed results and the verifier. No schema change.
- **R2-T2 — URL and link validation (§9.2).** `URL`-based validators: configured origin per mode, and each returned link relation (query, HPP, Hosted Fields AJAX, Apple/Google Pay AJAX, 3-D Secure if ever used, callback to exact `PUBLIC_ORIGIN`). Validate before returning a link to a browser or posting to it. Replace `assertWindcaveUrl` and `getWindcaveEnv`. No schema change.
- **R2-T3 — strict query parsing and exact cents (§9.3).** Shared decimal-to-cents parser (two fraction digits max, no exponent or sign, overflow rejected, NZD only for current flows) and a normalized query result: queried/returned session ID, final/pending state, transaction count, type, cents, currency, reference, authorization, provider transaction ID, environment. No schema change.
- **R2-T4 — persist expected values (§9.4).** Forward migration on `payment_attempts`: expected cents, currency, reference, provider environment, provider transaction ID (partial unique index after a duplicate preflight), last reconciliation code and time. Immutable once the session is attached. Rehearse on a local PostgreSQL 16 scratch database; the restored-snapshot rehearsal and any apply are owner actions.
- **R2-T5 — shared verifier, wired in (§9.5).** Pure `verifyWindcaveOutcome(expected, observed)`; every enabled completion path calls it; a mismatch never finalizes money, keeps the operation reconcilable, records a sanitized security event, and shows the browser a processing/support state. Google Pay completions confirm through a session query (RF-1).
- **R2-T6 — test matrix, logging and exit evidence (§9.6).** The §9.6 cases, a no-raw-provider-data log guard (RF-6), and the exit record.

## 4. Questions for the owner (needed before T4/T5, not before T1–T3)

1. **Legacy numbered and invoice flows in R2.** They have no durable attempt with stored expected values; R3 decides retire/migrate/reconciliation-only (§10.3). For R2, either (a) verify them against values the server already holds (sale price or invoice share, NZD, session equality, single final transaction, environment) and add per-attempt references in R3, or (b) stop new sessions on those flows in UAT until R3 migrates them. (a) keeps them usable in UAT; (b) is simpler and safer. Recommendation: (a), since the retail and invoice pages are what the beta exercises.
2. **The R2-T4 migration** needs the owner's approval to apply to development, plus a restored-snapshot rehearsal (plan §1.3 item 4, §10.6).
3. **Invoice references** change to include an attempt/share identifier (RF-9), which changes what appears in Windcave reports.

## 5. Not in R2

Durable notification inbox and legacy-flow retirement (R3); refunds (R4); Tap to Pay
(R7); live UAT calls (owner/provider gate D6/D12).
