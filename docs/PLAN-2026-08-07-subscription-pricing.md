# Plan — subscription-only pricing (remove all transaction fees)

Date: 2026-08-07
Branch: `feat/tablet-desktop-app`
Status: **planned, not started**

Replaces the per-transaction fee model with a pure monthly subscription:

| Plan id | Name | Price | Logins (seats) |
|---|---|---|---|
| `solo` | Solo | $7.99/mo | 1 |
| `team` | Team | $8.99/mo | 5 |
| `crew` | Crew | $12.99/mo | 10 |

Enterprise (10+ logins) stays a **contact-sales** tier: it keeps its landing-page
card and `#tp-contact` link, is not selectable in signup, and is not in the plan
enum. Anything self-serve for it is out of scope.

---

## 0. Decisions taken (Oliver, 2026-08-07)

1. **Seats: build real team logins.** Asked for "whichever is more robust, better
   at scale and more secure". That is the multi-user build, not a stored number.
   Selling "5 logins" while the app has one login per merchant means five people
   share one password — no per-person revocation, no audit trail, and a leaver
   keeps access until someone rotates the shared credential. Storing a seat count
   we don't enforce is the *less* secure option and needs the same auth surgery
   later anyway. See §6 — it is the largest phase, and it touches auth, which is
   the highest-risk code in the repo.
2. **Processor: Windcave, directly.** Subscriptions are charged through Windcave
   card-on-file, not Stripe. Stripe is installed but imported nowhere
   (`server/`, `client/src` both clean) — the four packages get removed and the
   `stripe_*` columns are marked dead. See §5.
3. **No existing accounts to migrate.** Oliver confirmed his own is the only live
   account. There is no rollout banner, no grace period, and no dunning amnesty to
   design: the migration can set every subscription to Solo and move on. This
   removes a whole phase — see §10 for the little that remains.

> If that stops being true before this ships — a pilot merchant, a demo account
> someone starts charging — decision 3 is the one to revisit first. Everything
> else in this plan is indifferent to how many accounts exist; the migration and
> the first billing run are not.

---

## 1. What exists today

### 1a. Fee accrual — server

| Location | What it does |
|---|---|
| `server/storage.ts:1233-1252` | `TAPTPAY_FEE = 0.10`, written to `platformFeeAmount` (MemStorage) |
| `server/storage.ts:1539`, `2025`, `4207` | hardcoded `"0.10"` fee amounts |
| `server/storage.ts:3385-3398` | Postgres `createTransaction` — `platformFeeAmount = 0.10` |
| `server/storage.ts:1160`, `3219` | `?? "0.10"` fee fallback on split collection |
| `server/storage.ts:4575-4628` | `incrementTransactionCount` — free-tier 100 quota, `unbilledAmount += 0.10` (line 4621) |
| `server/storage.ts:2409` | MemStorage twin of the above |
| `server/routes.ts:2077-2089` | "TaptPay flat fee: $0.10 per transaction" + write |
| `server/routes.ts:2536, 2810, 2842, 3907, 3938, 4073, 4110, 6173, 6245` | 9 × `createPlatformFee(...)` |
| `server/routes.ts:4218` | `transactionFeeRevenue = completedTransactions * 0.10` |

`merchantNet` is **already** the full transaction price — `server/storage.ts:3386`
says "Windcave handles their own fees. merchantNet = full transaction price."
Removing the platform fee therefore changes no settlement maths; the fee was
accrued for separate collection, never deducted.

### 1b. Fee schema

`shared/schema.ts` — `transactions` fee columns (143-147), `splitPayments`
(190-192), `refunds` (299-300), `merchantSettlements` (312-323), `platformFees`
table (326-335), `merchants.currentProviderRate` / `.ourRate` (31-32),
`updateMerchantRatesSchema` (447-449), `merchantSubscriptions` (616-646),
`subscriptionBillingHistory` (649-672, `billingType` includes `transaction_fees`).

### 1c. Cost-comparison / savings surfaces

`server/storage.ts:1754-1796` and `1833-1866` compute "savings" from
`currentProviderRate` vs `ourRate`; surfaced by `server/report-generator.ts:10-12,
93, 128, 256` and `client/src/pages/exports.tsx:272-273, 340`.

### 1d. Customer-facing fee copy

- `client/src/pages/landing-page.tsx:155` nav "pricing: 10¢ retail · 0.3% everything else"
- `landing-page.tsx:404-405` stat "0.3% platform fee"; `487-493` the 10¢ card; `503-516` the 0.3% card
- `landing-page.tsx:524-586` the **subscription tier cards already exist and are already correct** ($7.99 solo / $8.99 team / $12.99 crew / enterprise)
- `client/src/pages/landingRuntime.ts:192, 199, 206, 315, 659` panel stats + bullets
- `client/src/components/PricingSection.tsx` — whole file, and it is **dead code**: nothing imports it
- `client/src/pages/info.tsx:84` "$0.10 per transaction, no lock-in contracts"
- `client/src/pages/legal.tsx:37-40` Terms §4 Fees
- `client/src/pages/settings.tsx:788-830` usage meter out of 100 + "Transaction Fee Billing Frequency"
- `client/src/pages/trades/trades-terminal.tsx:374, 818` "TaptPay fee (0.3%)"
- `client/src/desktop/pages/trades-terminal.tsx:818` same
- `client/src/desktop/pages/retail-terminal.tsx:724` "TaptPay fee: 10¢ per transaction" (+ `.rt-fee` style at 998)
- `client/src/lib/trades-money.ts:1, 25-27` `TRADES_FEE_RATE = 0.003`, `tradesFeeCents`
- `client/src/pages/admin-revenue.tsx` — whole page is fee revenue (2.9% / 0.5% marketplace copy at 104-117)
- `client/src/pages/admin-dashboard.tsx:54, 407-411` "Transaction fees" tile
- `client/src/pages/admin/Analytics.tsx:82, 518` "Fee Revenue … × $0.20"
- `server/pdf-generator.ts:116` receipt line `['Processing Fee:', '$0.20']`
- `woocommerce-plugin/**` `checkout.js:29,36`, `tapt-payment-gateway.php:5,122,376` — "$0.25 fee"

Three different fee numbers ($0.10, $0.20, $0.25, 0.3%, 0.5%, 2.9%) are live in
the UI simultaneously. All of them go.

### 1e. Auth — the constraint that shapes §5

`server/auth.ts:240-252` — `authenticateUser` reads the **merchants** table and
`merchantToUser` (210-224) sets `id: merchant.id`, i.e. **the JWT's `userId` *is*
the merchantId**. `authenticateToken` (275-316) ignores `userId` entirely and
re-resolves from `merchantId`. The `users` table exists in the schema
(`shared/schema.ts:6-15`) but nothing writes to it. `syncVerifiedMerchants` is a
documented no-op (229-231).

### 1f. Billing today

No charging engine exists. The billing card stores only brand/last4/expiry
(`server/billing-card.ts`), which the 2026-07-20 handoff explicitly calls "an
eligibility gate, not live card tokenisation", with a TODO to tokenise via
Windcave. `unbilledAmount` accrues and nothing ever collects it. `nextBillingDate`
is written and only ever displayed (`DesktopSettingsPage.tsx:585`).

---

## 2. Phase 1 — the plan catalogue (do this first)

New `shared/plans.ts`, the single source of truth for both client and server:

```ts
export const PLANS = {
  solo: { id: "solo", name: "Solo", priceCents: 799,  seats: 1,  blurb: "1 login · the full stack" },
  team: { id: "team", name: "Team", priceCents: 899,  seats: 5,  blurb: "5 logins · one dollar more" },
  crew: { id: "crew", name: "Crew", priceCents: 1299, seats: 10, blurb: "10 logins · whole crew covered" },
} as const;

export const PLAN_IDS = ["solo", "team", "crew"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const planIdSchema = z.enum(PLAN_IDS);
export function planFor(id: string) { ... }   // throws on unknown
```

Prices live here as integer cents only. No component hardcodes `$7.99`; the
landing page's tier cards get rewired to read from this too, so the marketing
price and the billed price can never drift apart.

## 3. Phase 2 — schema + migration `0013`

Hand-written additive SQL, `migrations/0013_subscription_plans.sql`, following the
`0012` style (BEGIN/COMMIT, `IF NOT EXISTS`, guarded `DO $$` for constraints).
**Do not `db:push`** — `.agents/memory` records rogue auto-increment defaults on FK
columns and a divergent dev database.

On `merchant_subscriptions`, add:

- `plan_id text NOT NULL DEFAULT 'solo'` + CHECK in (`solo`,`team`,`crew`)
- `seat_limit integer NOT NULL DEFAULT 1` + CHECK `>= 1`
- `price_cents integer NOT NULL DEFAULT 799` + CHECK `>= 0`
- `current_period_start timestamp`, `current_period_end timestamp`
- `pending_plan_id text`, `pending_plan_effective_at timestamp` (downgrade at period end)
- `cancel_at_period_end boolean NOT NULL DEFAULT false`
- `windcave_card_id text` (stored-card token), `windcave_billing_ref text`
- `card_brand text`, `card_last4 text`, `card_expiry text` (mirrors what Windcave returns)

Keep but stop writing: `tier`, `unbilled_transaction_count`, `unbilled_amount`,
`billing_frequency` (subscriptions are monthly, full stop), all `stripe_*` columns.
Keep and *keep writing*: `current_month_transactions` / `total_lifetime_transactions`
— they become a harmless usage statistic, no longer a quota.

Keep `platform_fees`, `merchant_settlements` and the transaction fee columns as
**historical record**. Dropping them is destructive, and the old rows are real
accounting history. New writes stop; new rows get `platformFeeRate/Amount = 0`.

On `users`, add: `status text NOT NULL DEFAULT 'active'` (`active`/`invited`/`disabled`),
`name text`, `invite_token_hash text`, `invite_expires_at timestamp`,
`last_login_at timestamp`. `users.email` is already globally unique — keep it that
way, it is what makes a login identity unambiguous.

Backfill (idempotent, in the same migration): one `users` row per merchant that has
a `password_hash`, `role = 'owner'`, `status = 'active'`, copying email and hash.
Both `merchants.email` and `users.email` are unique, so the 1:1 backfill is safe.
And: set every existing subscription to `plan_id='solo', seat_limit=1,
price_cents=799`, period starting at migration time.

Per decision 3 the backfill is small — 9 merchant rows at time of writing, of which
one is Oliver's real account and the rest are test/pending. It still has to be
written idempotently and correctly (it is what production will run against a fuller
table later), but it needs no staged rollout, and there is no argument for a data
migration that tries to be clever about historical `unbilled_amount`. Leave those
values where they are; nothing reads them after §4.

## 4. Phase 3 — stop charging fees

1. Delete the 9 `createPlatformFee` call sites and the `TAPTPAY_FEE` constant.
   Write `platformFeeRate: "0.0000"`, `platformFeeAmount: "0.00"` on new
   transactions and splits. `merchantNet` is unchanged (already full price).
2. `incrementTransactionCount` keeps counting, drops the 100-transaction quota
   branch and the `unbilledAmount` accrual entirely.
3. `server/routes.ts:4218` — replace `transactionFeeRevenue` with subscription MRR
   summed from active subscriptions' `price_cents`. Rename the field; update
   `admin-dashboard.tsx:54,407-411` and `admin/Analytics.tsx:82,518` to match.
4. Rewrite `client/src/pages/admin-revenue.tsx` as *Subscription revenue*: MRR,
   active subscriptions by plan, past-due count. Delete the marketplace-model
   copy (104-117).
5. Delete the savings/cost-comparison maths (`storage.ts:1754-1796`, `1833-1866`),
   the report-generator's Savings card and Cost Comparison section
   (`report-generator.ts:93, 128, 256`), and `exports.tsx:272-273, 340`. Remove
   `currentProviderRate`/`ourRate` from `ownerMerchantDto`/`adminMerchantDto`
   (`http-contracts.ts:47, 101`) and retire `updateMerchantRatesSchema` +
   `updateMerchantRates` + `routes.ts:3422, 4481-4482`.
6. Trim the fee fields from `ownerTransactionDto` (`http-contracts.ts:216-220`).
   **Trap:** `server/__tests__/phase0-contracts.test.ts:190, 213` asserts exact
   DTO key lists — update them in the same commit or the suite fails.
7. `server/pdf-generator.ts:116` — drop the `Processing Fee: $0.20` receipt line.
   The receipt then reads Subtotal / GST / Total, which is what a NZ GST receipt
   should say anyway.
8. `client/src/lib/trades-money.ts` — delete `TRADES_FEE_RATE` and `tradesFeeCents`;
   remove the three call sites (`trades-terminal.tsx:374, 818`,
   `desktop/pages/trades-terminal.tsx:818`).

## 5. Phase 4 — Windcave subscription billing

TaptPay is the merchant of record for the subscription, so this uses the
**platform** credentials (`WINDCAVE_USERNAME` / `WINDCAVE_API_KEY`), not the
merchant's own `windcaveApiKey`. The merchant is the cardholder.

New `server/subscription-billing.ts`, built on the existing `server/windcave.ts`
client:

1. **Card capture** — replace the hand-rolled card form with a Windcave-hosted
   session that stores the card (validate, or a small auth+void, per Windcave's
   card-on-file guidance). Persist only `windcave_card_id` + brand/last4/expiry.
   The PAN never touches our server, which retires the PCI concern flagged in the
   2026-07-20 handoff. `server/billing-card.ts`'s Luhn/expiry helpers stay useful
   for client-side hinting but stop being the gate.
2. **Rebill** — monthly job posts `type: "purchase"` to `TRANSACTION_URL` with the
   stored card id and a recurring / credential-on-file indicator, `X-ID` set to a
   stable `sub-<subscriptionId>-<periodStartISO>` so a retried request cannot
   double-charge (same idempotency discipline as `submitTapToPayToken`).
3. **Outcomes** — approved: `subscription_billing_history` row with
   `billingType: 'monthly_subscription'`, advance the period. Declined:
   `status = 'past_due'`, retry on days 1/3/7, email each time, then `suspended`.
4. **Job runner** — a daily tick registered where the other crons live
   (`server/property-cron.ts` / `trades-cron.ts` are the pattern). Must take a row
   lock so two instances cannot bill the same period twice.

> **Do not invent the Windcave request shape.** The exact field names for card
> storage and the stored-credential indicator must be confirmed against Windcave's
> REST v1 docs or their integration team before Phase 4 is written. Everything up
> to and including Phase 3 is independent of that answer, so this is not a blocker
> for starting.

**Open product decisions for this phase** (needed before it ships, not before it
starts): what a `suspended` merchant can still do — my recommendation is read-only
access (dashboard, history, exports) with sending blocked, reusing the existing
`BILLING_CARD_REQUIRED` 402 pattern rather than a hard lockout; and whether there
is a free trial.

Also: remove `@stripe/react-stripe-js`, `@stripe/stripe-js`, `stripe`,
`stripe-replit-sync` from `package.json` — verified unused in both `server/` and
`client/src`.

## 6. Phase 5 — team logins (the seats the plans sell)

This is the phase that makes "5 logins" real, and the riskiest one. Own commits,
own verification pass.

**Auth changes** (`server/auth.ts`):

- `authenticateUser` resolves against `users` (by lowercased email), checks
  `users.status === 'active'` *and* the parent merchant is `verified`/`active`.
- JWT gains `principal: "user"` and `uid: users.id`, keeping `merchantId` + `role`
  (`owner` | `member` | `admin`).
- `authenticateToken` resolves the **user** row per request, not just the merchant,
  so a disabled teammate loses access within the 1h token TTL. If instant
  revocation is wanted, add `users.token_version` and compare it — decide once,
  cheaply, in this phase.

> **Collision trap.** Today `userId === merchantId` and `authenticateToken` never
> reads `userId`. Once real `users.id` values exist, an old token's `userId` would
> silently address a different row. Tokens without a `principal` claim must be
> **rejected**, forcing one re-login. With a 1h TTL the blast radius is one hour;
> mapping legacy tokens to the owner instead would leave an ambiguous claim in
> circulation, which is exactly what we are trying to remove.

**Seat management** — new `/api/team` endpoints (owner-only): list, invite,
resend, revoke invite, disable/re-enable, remove. Invite is an emailed single-use
token, stored hashed with an expiry, mirroring the existing password-reset flow.

**Enforcement, twice** — at invite time inside a transaction that takes
`SELECT ... FOR UPDATE` on the subscription row (otherwise two concurrent invites
both pass the check and create seat N+1); and at login, so a post-downgrade
over-limit account cannot slip through. The owner always retains access.

**Downgrade with too many users** — block it with a clear message ("Crew → Solo
needs 1 login; you have 4 active. Remove 3 first."). Never auto-disable someone's
account to fit a plan change.

**Deliberately out of scope:** per-user permissions beyond owner/member, and
stamping `createdByUserId` on transactions. Both are reasonable follow-ups; adding
them here would sprawl an already-large phase.

## 7. Phase 6 — signup plan picker

`client/src/pages/merchant-signup.tsx` is a 4-step `Stepper`. Add a **step 4 of 5,
"Plan"**, before Review:

- Three cards from `shared/plans.ts`, Team marked "most popular" to match the
  landing page, keyboard-selectable, `planId` in `SignupForm` defaulting to `solo`.
- An enterprise footnote linking to contact — not a selectable card.
- Step 5 Review gains a Plan row showing name, price and seat count.

Wiring: `STEP_FIELDS` gets `4: ["planId"]`; `getErrors` requires a selection;
`publicSignupSchema` (`shared/schema.ts:376-398`) gains `planId: planIdSchema`;
the eyebrows change from "Step n of 4" to "of 5"; `stepLabels` becomes
`["Contact", "Business", "KYC & security", "Plan", "Verify"]`.

Server: `/api/merchants/signup` creates the subscription with the chosen plan at
`status: 'pending'`, activating on email confirmation. Card capture happens in
Settings after first login — not during signup — so the KYC flow keeps its current
shape and a merchant is never asked for a card before they have seen the product.
`client/src/__tests__/signup-schema.test.ts` covers the new field.

## 8. Phase 7 — settings plan management

Both settings screens. `client/src/pages/settings.tsx:752-1018` (mobile/web) and
`client/src/desktop/DesktopSettingsPage.tsx:550-642` (tablet/desktop) — same API,
two presentations, matching their existing house styles.

Rework "Subscription & Billing" into:

- **Current plan** — name, price, seats used/total, renewal date. Replaces the
  "Free Tier / Paid ($19.99/month)" block at `settings.tsx:776-786`, which shows a
  price that appears nowhere else in the product.
- **Change plan** — the three cards again. Upgrade takes effect immediately with a
  prorated charge; downgrade is queued via `pending_plan_id` to the period end
  (and blocked if active logins exceed the target seat count).
- **Payment method** — Windcave card-on-file; add/replace/remove.
- **Team** — the seat list, invite/disable, owner-only. Hidden on `solo`.
- **Billing history** — from `/api/subscription/billing-history`, which already
  exists and is currently unused by the UI.
- **Cancel** — switch from the current 30-day-notice model
  (`storage.ts:4630-4649`) to `cancel_at_period_end`: keep access until the period
  ends, no renewal, reactivate any time before then. Standard for a $7.99 monthly
  product, and it removes the awkward "30 days notice" copy at
  `settings.tsx:969-975`.

**Delete outright:** the monthly transaction usage meter and its /100 quota
(`settings.tsx:788-809`), the "Transaction Fee Billing Frequency" selector
(`settings.tsx:811-829`), the unbilled-transactions block (`settings.tsx:832-841`),
and the desktop "Unbilled" + "Billing frequency" rows
(`DesktopSettingsPage.tsx:558-582`). **Trap:**
`DesktopSettingsPage.test.tsx:76` mocks `{ subscription: { billingFrequency } }`
and will need updating.

`isNativeApp()` branch (`settings.tsx:753-770`) stays as-is — it already sends iOS
users to the website rather than showing billing UI, which keeps Apple's IAP rules
out of scope. Worth a second look before shipping: a subscription sold in an iOS
app is exactly what App Store review cares about, in a way a per-transaction fee
was not.

## 9. Phase 8 — copy sweep

Every item in §1d. Notable calls:

- **Landing page** — delete the 10¢ and 0.3% cards (`487-516`), promote the
  existing subscription tiers to *the* pricing section, rewire their prices to
  `shared/plans.ts`. Nav line `155` → "pricing: from $7.99/month". Stat at
  `404-405` needs a replacement that is true — suggest the seat count or "no
  per-transaction fees", not an invented number.
- **`landingRuntime.ts:192, 199, 206, 315, 659`** — this file has two near-identical
  copies of the panel data (the `312-315` block and the `656-659` block). Change
  both; changing one is a silent half-fix.
- **`PricingSection.tsx`** — dead code with the *oldest* pricing model ($19.99
  Enterprise, 1000-transaction bands). Delete the file.
- **`legal.tsx:37-40`** Terms §4 Fees → subscription terms: monthly fee per plan,
  billed in advance, cancel at period end, price changes with notice. **This is a
  legal document — Oliver should approve the final wording, and it is the one item
  here I would not ship on my own judgement.**
- **`info.tsx:84`** → "From $7.99/month, no lock-in contracts".
- **Terminals** — remove the fee lines from retail and trades, mobile and desktop.
- **WooCommerce plugin** — "$0.25 fee" in three places. Separate distributable;
  its own commit.

**Generated bundles** (`client/public/app/assets/*`, `ios/App/App/public/assets/*`)
contain the old copy and must be **rebuilt, never hand-edited**. Per `CLAUDE.md`,
stage the hash rollover as one unit with `git add -A client/public/app`.
`docs/designs/motion-tablet-desktop/**` is Oliver's prototype — leave it alone.

## 10. Phase 9 — cutover (cut down by decision 3)

Originally a rollout phase: banner, grace period, dunning amnesty. With no live
accounts but Oliver's, all of that is deleted. What remains:

- The migration sets every subscription to `solo`. Done in §3; nothing further.
- Oliver's own account needs a card on file before the first billing run, or it
  lands in `past_due` on day one. Do this deliberately as part of the §5
  verification rather than discovering it from a dunning email.
- The existing 402 `BILLING_CARD_REQUIRED` flow (persistent warning + "Open
  Settings" action) still needs its copy updated from per-transaction wording to
  subscription wording. That is copy, not plumbing, and it rides along with §9.

No banner. No grace window. No staged rollout.

## 11. Verification

Per phase, matching the repo's existing loop: `npm run check`, `npm test`, then
the real app. Specifically:

- **Contract tests** — `phase0-contracts.test.ts:88-89, 116, 190, 213` asserts fee
  fields and exact DTO key lists. Expect it to fail loudly on Phase 3; that is the
  point of it.
- **Fixtures to update** — `retail-transaction-service.test.ts:29-30`,
  `payment-attempt-service.test.ts:220-222, 238, 283, 357`,
  `DesktopSettingsPage.test.tsx:76`.
- **New tests worth writing** — plan catalogue integrity (price/seat pairs), seat
  enforcement including the concurrent-invite race, legacy-token rejection,
  billing idempotency (same `X-ID` twice = one charge), downgrade blocked when
  over seats.
- **Postgres verifier** — `npm run test:server:postgres` after the migration.
- **Browser** — signup through the new step, plan change both directions, invite
  and revoke a teammate, cancel and reactivate. Playwright notes are in
  `.agents/memory` (nix chromium path + minted JWT for merchant 22).
- **Billing, end to end, before it can charge anything** — with no other live
  accounts there is no safety in numbers, so the first real Windcave rebill must
  be proven against UAT (`WINDCAVE_ENDPOINT` defaults to `uat.windcave.com`)
  before production credentials are pointed at it. Prove three things: a stored
  card token survives a period roll, the same `X-ID` submitted twice charges once,
  and a declined card lands in `past_due` rather than silently retrying forever.
- **`grep -rniE "10¢|0\.3%|per transaction|transaction fee|\$0\.(10|20|25)"`** over
  `client/src`, `server`, `shared`, `woocommerce-plugin` returning nothing but
  false positives is the completion check for §9.

## 12. Suggested commit order

1. `shared/plans.ts` + migration `0013` (schema only, nothing reads it yet)
2. Stop fee accrual, server-side (§4.1-4.2)
3. Fee removal from DTOs, admin, reports, receipts (§4.3-4.8) + test fixtures
4. Copy sweep (§9), excluding legal — one commit per area
5. Settings plan management, read-only first (§8 without change-plan)
6. Signup plan picker (§7)
7. Windcave card capture (§5.1)
8. Windcave rebill job + dunning (§5.2-5.4)
9. Change/cancel plan (§8 remainder)
10. Team logins — auth (§6), then endpoints, then UI
11. Legal copy, once approved
12. WooCommerce plugin
13. Regenerate `client/public/app` bundle as one unit

Phases 1-4 (commits 1-4) are self-contained: they land the whole "no more
transaction fees" change and can ship before the Windcave contract questions in §5
are answered.

---

## 13. Interaction with in-flight work

`docs/HANDOFF-2026-07-28-tablet-desktop-app.md` §9 has a live accepted-change queue
whose items 1-2 are payment/addressing safety gates. This plan does not touch
board selection, SSE audiences or payment tokens, so the two can proceed in
parallel — but both edit `DesktopSettingsPage.tsx` (§9 item 5, ReportModal; item 6,
mobile push onto the shared hook) and `settings.tsx`. Sequence those or expect
conflicts.

§9 item 3 removes the retail *Fees report* — already done; `retail-reports.ts:124`
is now "Revenue by Board". Nothing further needed there.
