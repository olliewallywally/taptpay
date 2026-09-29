# Full app review — 2026-08-15

Scope: the whole merchant + customer app **excluding the landing page**, per the brief:
"every single function and feature is working as it should… ensure you have tested everything".

Branch `feat/tablet-desktop-app` @ `d325beb` (196 commits ahead of `main`).
Dev server on :5000, dev DB (helium). Production state was read from the backup
`db-backups/neon-20260815-054821.sql.gz` — **production was never connected to or modified**.

Session 1 (`cd93e30c`) crashed at 05:47. Findings marked [R] were recovered from its
transcript; [N] are new in session 2. Nothing was lost.

---

## Verdict

The app is in good shape structurally — tenancy isolation, the SSE broker, the Windcave
token-payment path and the subscription-charge machinery are genuinely well built, and once
the billing gate is open the full money path works end to end.

But **this branch must not deploy as it stands.** It ships a payment gate whose data
precondition no production merchant satisfies, and 8 of 8 live merchants would be unable to
take a single payment the moment it goes out. That is C2 below, and it is the finding that
matters most.

The second theme is that **none of this is visible to CI**: typecheck, 719 tests and a
production build are all green. Every finding below passes the existing gates.

---

## 0. Verification baseline — all green [R]

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run db:migrate:status` | all migrations applied (dev + prod level) |
| jest `server` | 26 suites / 351 tests pass |
| jest full suite | **719 tests pass** |
| `vite build` | succeeds |
| Browser sweep — 96 visits (32 routes × mobile/tablet/desktop) | 0 page errors, 0 5xx |

---

## Findings

### C1 — CRITICAL: production `JWT_SECRET`, admin password hash and VAPID private key are committed to git [R][N]

`.replit` is tracked (`git ls-files .replit` → tracked) and `.gitignore` does not exclude it.
Its `[userenv.shared]` block contains, in plaintext:

- `JWT_SECRET` (line 75)
- `ADMIN_PASSWORD_HASH` (line 77)
- `ADMIN_EMAIL`
- `VAPID_PRIVATE_KEY` (push-notification signing key)
- `WINDCAVE_USERNAME`, `WINDCAVE_ENDPOINT`, `WINDCAVE_GOOGLE_PAY_MERCHANT_ID`

**Proven impact** — a full admin token was forged from the committed value alone, with no
password, and accepted by the live server:

```
forged admin token from committed secret →
{"user":{"id":1,"email":"oliverleonard.professional@gmail.com","merchantId":0,"role":"admin"}}
→ GET /api/admin/merchants returned the full merchant list
```

Because `JWT_SECRET` signs every session, an owner token can be minted for **any** merchant
id. This defeats every authorization control verified later in this report — those controls
are correct, but they all trust a signature whose key is public to anyone with repo access.

**Fix:** rotate `JWT_SECRET`, the admin password and the VAPID keypair; `git rm --cached
.replit`; add it to `.gitignore`; move the values to Replit Secrets. Treat the current
secrets as burned — they remain in git history.

### C2 — CRITICAL, deploy-blocking: every production merchant loses the ability to take payments the moment this branch ships [N]

Migration `0014_reconcile_subscription_activation.sql` is **already applied to production**.
Its stated intent:

> "Email-verified merchants are entitled to an active Solo subscription; card capture and
> the first charge remain separate operations."

It sets `status='active'`, `current_period_start`, `current_period_end` and
`next_billing_date` — but deliberately **not** `last_billing_date`.

`subscriptionHasPaidAccess()` (`server/billing-card.ts:73`) hard-requires exactly that field:

```ts
if (!subscription.lastBillingDate || !subscription.currentPeriodEnd) return false;
```

`billingCardIsReady` is an alias for it, and it gates **15 payment routes plus 7 cron and
delivery passes**. So the entitlement 0014 grants is inert: the migration and the gate
disagree about what "entitled" means.

**Proven against the real production rows.** `.rev-gate.ts` imports the real
`server/billing-card.ts` and feeds it the real rows from the production backup:

```
merchant  status   lastBillingDate  currentPeriodEnd  CAN_TAKE_PAYMENTS
22        active   NULL             2026-09-10        false
28        active   NULL             2026-09-10        false
29        active   NULL             2026-09-10        false
32        active   NULL             2026-09-10        false
26        active   NULL             2026-09-10        false
31        active   NULL             2026-09-10        false
25        pending  NULL             NULL              false
27        pending  NULL             NULL              false

8 of 8 production merchants would be BLOCKED from taking payments once this branch deploys.
```

**Why it is invisible today:** `main` has no `server/billing-card.ts` and zero references to
`requireBillingCard`. The gate ships for the first time with this branch. Every existing
merchant would have to add a card and be charged $7.99 before taking another payment.

**Confirmed mechanism, both directions.** Setting `last_billing_date` + `current_period_end`
on dev merchant 22 flipped `/api/auth/me` from `billingCardReady:false` to `true` and the
entire money path started working (see "Money path" below). The row was then restored to its
exact prior values — verified byte-identical.

**Decide which is authoritative:** either `subscriptionHasPaidAccess` should treat a live
`current_period_end` as sufficient entitlement, or 0014 must backfill `last_billing_date`
for the merchants it reconciled. This is a product decision, so it is flagged rather than
fixed.

### C3 — HIGH: Rules-of-Hooks violation crashes 7 pages when the token is cleared [R]

67 `react-hooks/rules-of-hooks` errors, all the same shape: `const merchantId =
getCurrentMerchantId()` followed by an early `if (!merchantId) return null`, with hooks
called *after* it.

| Page | early return | hooks after it |
|---|---|---|
| `client/src/pages/settings.tsx` | ~200 | many |
| `client/src/pages/exports.tsx` | 26 | 68, 86, 126 |
| `client/src/pages/merchant-terminal.tsx` | 133 | 138 → 451 |
| `client/src/pages/merchant-terminal-mobile.tsx` | 147 | 152 → 286 |
| `client/src/pages/transactions.tsx` | 115 | — |
| `client/src/pages/stock-management.tsx` | 363 | — |
| `client/src/pages/payment-stack.tsx` | 37 | — |

When the token is cleared while such a page is mounted, the next render takes the early
return and React sees fewer hooks than the previous render.

**Proven twice.** Unit repro (`client/src/__tests__/zz-review-hooks-repro.test.tsx`) throws
`Rendered fewer hooks than expected`. And in a real browser, logging out from `/settings`:

```
Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
The above error occurred in the <Settings> component
Route failed Error: Rendered fewer hooks than expected
```

The user still lands on `/login`, so it is survivable — but it is a React tree crash on a
routine action, and the same pattern sits under six more pages including both terminals.

**Fix:** move the `if (!merchantId) return null` guard below every hook call, or lift it to
the route level.

### H1 — HIGH: 16 of 42 id-bearing GET routes return 500 on a malformed id [N]

`parseInt(req.params.id)` → `NaN` (or a non-UUID string) goes straight to the database, which
throws, producing a 500 instead of a 400/404. Every param-bearing GET route was probed live:

```
routes.ts:1049  /api/merchants/abc/qr              routes.ts:5699  /api/refunds/abc
routes.ts:1092  /api/merchants/abc/stone/abc/qr    routes.ts:7274  /api/property/tenants/abc
routes.ts:1137  /api/merchants/abc                 routes.ts:7327  /api/property/tenants/abc/events
routes.ts:2000  /api/merchants/abc/active-transaction  routes.ts:7350  /api/property/tenants/abc/schedules
routes.ts:3075  /api/transactions/abc              routes.ts:7515  /api/property/invoices/abc
routes.ts:3883  /api/tapt-stones/abc               routes.ts:8096  /api/trades/clients/abc
routes.ts:5650  /api/transactions/abc/refunds      routes.ts:8145  /api/trades/clients/abc/events
                                                   routes.ts:8218  /api/trades/quotes/abc
                                                   routes.ts:8245  /api/trades/quotes/abc/pdf
```

Distribution across the 42 probed routes: `{200:1, 400:4, 401:1, 403:12, 404:8, 500:16}`.

Statically there are **58** unguarded `parseInt(req.params.*)` sites in `routes.ts`; the
other 42 are saved incidentally because an authz check rejects `NaN` before it reaches
storage. Two of the 16 (`/api/tapt-stones/:id`, `/api/merchants/:id/qr`) are unauthenticated,
so they are reachable by anyone.

No data leaks and the error messages are generic — this is robustness and log hygiene, plus
a small unauthenticated error-load surface. Fix with a shared `parseId` helper returning 400.

### H2 — HIGH: recurring billing and every reminder depend on a scheduler that is not configured in code or documented [N]

`POST /api/internal/cron` drives **all** of: subscription billing renewals, property invoice
generation, dispatch, overdue and reminder passes, the trades equivalents, and daily payout
notifications. It is pull-only — an external scheduler must call it hourly with an
`x-cron-secret` header.

- `.replit` contains **no** scheduled deployment and **no** `CRON_SECRET`.
- `replit.md` contains **zero** mentions of cron (`grep -ni cron replit.md` → nothing).
- The original task spec (`.local/tasks/property-management-vertical.md:85`) required exactly
  this: *"the Replit Scheduled Deployment that calls it hourly must be configured manually in
  the Replit dashboard… Document the required URL and header in `replit.md` so it isn't
  missed at deploy time."* **The documentation step was itself missed.**

Live check returns `503 {"message":"Cron not configured"}` because `CRON_SECRET` is unset
(`authorizeCronRequest`, `server/routes.ts:92`).

If the Scheduled Deployment is not configured in the Replit dashboard, **no subscription ever
renews and no reminder or recurring invoice ever fires** — and nothing alerts, because
silence from a pull-only endpoint is indistinguishable from success. Only Oliver can confirm
the dashboard state; that check is the action item, plus a freshness alarm on `lastCronRun`
and documenting the URL + header in `replit.md`.

### M1 — MEDIUM: mobile and tablet terminals show a misleading error when the billing gate fires [N]

On 402 the API returns a precise message ("Open Billing in Settings"), and `queryClient.ts:5`
dispatches `BILLING_CARD_REQUIRED_EVENT`, which `notification-system.tsx:91` turns into a
persistent warning. The **desktop** terminal knows this and suppresses its own toast:

```ts
// client/src/desktop/pages/retail-terminal.tsx:258
/* 402 BILLING_CARD_REQUIRED surfaces its own persistent warning via apiRequest. */
```

But `merchant-terminal-mobile.tsx:258`, `merchant-terminal-mobile-v2.tsx:236` and
`merchant-terminal.tsx:221` all still fire a generic destructive toast. In the live browser
E2E the merchant saw exactly this and nothing more useful:

```
Error  Failed to create transaction
```

Given C2, this is the error message every production merchant would hit first.

### M2 — MEDIUM: an untracked, unwired checkout extraction is inflating the green test count [N]

`client/src/features/checkout/` (untracked) holds `CheckoutView.tsx` (156 lines) and
`SplitPaymentView.tsx` (402 lines) — an in-progress extraction from the still-live
`client/src/pages/checkout.tsx` (1,942 lines).

- `CheckoutView` is imported by **nothing at all**.
- `SplitPaymentView` is imported **only** by the untracked test
  `client/src/__tests__/split-payment-view-boundary.test.tsx`.

So the app renders the old page, while the suite reports passing boundary tests for a
component that is not in the product. Either finish wiring the extraction or remove both —
as it stands it is uncommitted dead code producing false confidence.

### L1 — LOW: admin diagnostic routes echo raw error objects [N]

`server/routes.ts:4397` and `:4474` return `error?.message`; `:4709` returns the whole
`error` object to the client. All three sit behind `authenticateAdmin`, so exposure is
admin-only — but they should return a generic message and log the detail server-side.

### L2 — INFO: `/api/tapt-stones/:id` is unauthenticated and enumerable [N]

Deliberately public (QR resolution for a scanned stone) and returns only what the public QR
already encodes. But it is unauthenticated with sequential integer ids, so merchant ids and
stone names can be walked. Not a tenancy break; recorded for completeness.

---

## What was verified as working — with evidence, not assumption

**Tenancy isolation is solid.** The definitive data-driven probe (`.rev-tenancy.mjs`) used a
merchant-22 owner token against **real** merchant-28/32 resource ids:

| Probe | Result |
|---|---|
| m32 trades client / client events / quote / quote PDF | 404 |
| m32 property tenant / tenant events / tenant schedules | 403 |
| `PUT /api/merchants/22/stock-items/8` (item 8 belongs to m28) | 404 |
| `PUT /api/merchants/22/tapt-stones/5` (stone 5 belongs to m28) | 404 |
| foreign team-user status / resend | 404 |
| own-resource controls (client, quote, tenant, transaction) | 200 |

Nested-parent confusion — the classic "my merchant id in the path, your child id" attack — is
correctly blocked. Foreign DB rows were verified **byte-identical** after the probe.

**Authorization sweep** [R]: 6/6 cross-tenant reads 403 · 8/8 admin routes with a merchant
token 403 · 6/6 protected routes unauthenticated 401.

**Session expiry** [R]: expired-at-load → redirect to `/login?returnTo=…` with the token
cleared. Expiry mid-session → API flips 200 → 403, the app clears the token and returns to
`/login`.

**The money path works end to end** [N] — verified in a real browser after opening the gate
on dev merchant 22:

```
tap FAB → digits 2,5,0 → amount shown $2.50 → commit → confirm details → send
  200 POST /api/transactions  → {"id":315,"price":"2.50","status":"pending"}
  appears in the active stack
customer checkout /checkout/315 renders:
  "taptpay  review-test-sale  $2.50  enter credit card  Cancel payment
   Secured by Windcave · PCI DSS Compliant"
  0 page errors, 0 4xx/5xx
```

Follow-on feature checks, all 200: receipt QR (PNG), receipt PDF, split-enabled on/off,
active transaction, cancel, analytics, transaction list, property invoices, trades quotes,
subscription state.

**SSE broker is correctly scoped** [N]. The raw transaction row broadcast at
`routes.ts:1281` is projected per audience — merchants get `merchantSseTransactionDto`,
everyone else `publicTransactionDto` — and `isTarget()` bars bearer-addressed rows
(`paymentTokenHash != null`) from anonymous streams entirely. The 2026-07-12 dual-payload
fix holds.

**Subscription charge machinery is high quality** [N]. `completeSubscriptionCardSetup`
(`storage.ts:6356`) uses `SELECT … FOR UPDATE`, a claim-token lease, deterministic
idempotency keys, prior-attempt reconciliation, and correct decline handling that never
manufactures a free period.

**No SQL injection surface**: zero `sql.raw(` or template-interpolated `execute()` calls
across `server/*.ts`.

**Suspected issues that turned out to be non-issues:**
- The 90 console 403s in the browser sweep were all `replit.com/…/replit-dev-banner.js` —
  an external dev banner, not app traffic.
- `/app-login` was reported BLANK by the sweep. It is not: it is a blue splash whose only
  text is the "Log in" button label — 6 characters, below the heuristic's threshold.
- `GET /api/auth/validate-reset-token/nope` returns 200 `{"valid":false}` — correct design.
- 8 "missing await" grep hits are all inside `await Promise.all([...])`.
- 2,889 of the 3,482 lint errors are `no-undef` firing on TypeScript files — an ESLint config
  artifact, not real defects.

---

## Coverage — what this review did and did not touch

**Exercised live:** 42 param-bearing GET routes probed with malformed ids · 41 read endpoints
· cross-tenant, admin, unauthenticated and malformed-input sweeps · 96 browser visits across
mobile/tablet/desktop · a full retail sale driven through the UI into customer checkout · 13
post-sale feature endpoints.

**Read line by line:** `server/auth.ts`, `server/billing-card.ts`, `server/sse-broker.ts`,
`server/index.ts`, `server/http-contracts.ts` (DTOs), `storage.ts` card-setup path
(6356–6690), `routes.ts` head + auth surface + token payments + billing gates + trades/property
id routes (~2,600 lines), `client/src/App.tsx`, `queryClient.ts`, `chunk-boundary.tsx`,
`page-transition.tsx`, `lib/auth.ts`, `settings.tsx` guard region, both terminals' mutation
paths.

**Swept by defect class across 100% of server + client source** (rather than read
line by line): unguarded param parsing, missing ownership checks, raw SQL, float money math,
missing `await`, error leakage, hook-order violations, and the full ESLint rule set.

**Deliberately not executed:** every endpoint that dispatches email or SMS — trades/property
`resend`, `send-balance` and the cron dispatch passes — because those are outward-facing and
would send real mail. Their code paths were read; they were not fired. Likewise no real card
was charged through Windcave UAT, so the hosted-fields → charge → receipt leg is verified by
code read and by the checkout page rendering, not by a completed payment.

So: this is not a literal every-line read of `routes.ts` (8,715 lines) and `storage.ts`. It
is full-line coverage of the high-risk modules plus exhaustive automated sweeps over
everything else. Say the word if you want the remaining bulk read line by line.

---

## Recommended order of work

1. **C1** — rotate and untrack the secrets. Everything else is downstream of this.
2. **C2** — decide whether 0014 backfills `last_billing_date` or the gate accepts a live
   period. Blocks the deploy.
3. **H2** — confirm the Replit Scheduled Deployment exists; document it in `replit.md`.
4. **C3** — move the seven `!merchantId` guards below their hooks.
5. **H1** — one shared `parseId` helper.
6. **M1**, **M2**, **L1** — cleanup.

---

## Review artifacts left in the tree

Untracked, safe to delete with `rm .rev-*`: `.rev-tenancy.mjs` (IDOR probe), `.rev-gate.ts`
(production entitlement proof), `.rev-nan.mjs` (malformed-id sweep), `.rev-features.mjs`,
`.rev-api-sweep.mjs`, `.rev-browser-sweep.mjs`, `.rev-e2e.mjs`, `.rev-probe2/3.mjs`,
`.rev-dbq*.mjs`, `.rev-ids.mjs`. The two JWT files (`.rev-token.txt`, `.rev-admin.txt`) were
deleted at the end of the review — the scripts mint their own from `JWT_SECRET`.

Dev-data note: dev merchant 22's subscription row was temporarily modified to open the
billing gate and then **restored to its exact prior values** (verified). One test transaction
(id 315, "review-test-sale", $2.50) was created and left in `cancelled` state.
