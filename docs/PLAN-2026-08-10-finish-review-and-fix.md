# Plan — finish the 2026-08-09 review-and-fix pass

**Branch:** `feat/tablet-desktop-app`  **HEAD when written:** `8af83fc`
**Written:** 2026-08-10, after recovering an interrupted review that left ~1 hour of
unreviewed, uncommitted work in the tree.

This plan does two things: it **inventories what the interrupted pass actually
landed** (§2), and it **plans the whole remaining path to done** (§4). Read §1
before running anything — the tree is currently in a broken state that looks fine.

---

## 0. Provenance — why this plan exists

A review-and-fix pass ran in Codex (`gpt-5.6-sol`, reasoning effort `max`) on
**2026-08-09 between 08:33:59 and 09:36:49 UTC**. It crashed three times. The
environment reset that accompanied the crashes recreated `~/.codex` from scratch
(fresh `installation_id` and OAuth login at 03:39 on 2026-08-10), so **its session
transcripts are unrecoverable**. The 2026-08-10 resume attempt died 1.1 seconds in
on an OpenAI usage limit that does not reset until **2026-08-16 08:01**.

It committed nothing, stashed nothing, and wrote no handoff. Everything it did is
uncommitted working-tree state, and §2 of this document is the only record of it.

Attribution is established by mtime against session boundaries:

| Window | Author | Content |
|---|---|---|
| 2026-08-08 11:09–11:38 | Claude (paused WIP) | 12 landing-phone scene/primitive files — the "phone realism" work paused on 2026-08-08 |
| 2026-08-09 → 07:58 | Claude, session `aca5eae5` | Committed `5022431`…`8af83fc`, then closed confirming "working tree clean apart from landing-phone WIP" |
| **2026-08-09 08:33:59 → 09:36:49** | **the interrupted review** | **everything else uncommitted — §2** |

The review was working from three written sources, none of which covers all of it:

1. `docs/PLAN-2026-08-07-subscription-pricing.md` — §5 dunning, §9 copy sweep, §11
   verification, §12 step 13 (`client/public/app` regen). Committed and authoritative.
2. The **P0–P3 plan** from the tail of session `aca5eae5`, which was never written to
   a file. Reproduced in §3 below so it stops being lost.
3. The eight "Still open" items in the `dev-db-unapplied-migrations` memory.

Everything in §2a, §2b and part of §2c was the review's **own** findings and is
covered by no prior document at all.

---

## 1. Where things actually stand (measured 2026-08-10)

```
npx tsc --noEmit                     silent
npx jest --selectProjects server     23 suites / 325 tests — all pass
npx jest --selectProjects client     33 suites / 338 tests — all pass
npm run db:migrate:status            15 applied, 3 pending, 0 drifted, 0 orphaned
node scripts/verify-landing-phone.mjs  FAILS — see §4 Step 3
```

### The tree is in the 2026-08-09 outage state

`shared/schema.ts` now declares `transactions.completedAt`, and the migration that
creates the column has never been applied. Drizzle's `select()` enumerates every
declared column, so:

```
db.select().from(transactions).limit(1)
  → error: column "completed_at" does not exist
```

This is the **exact failure class** that caused the 2026-08-09 "app loads forever"
incident — see the `dev-db-unapplied-migrations` memory. Two things currently mask it:

- the dev server on `:5000` (pid 184, booted 03:39 today) is serving, and printed the
  pending-migration banner exactly as the new gate is designed to. Nothing has hit a
  `transactions` query since boot, so no error has surfaced yet;
- the router-level async guard from `dc16ab9` means it now returns a fast 500 instead
  of hanging. It degrades better than last time. It is still broken.

**Nothing else in §4 may be attempted before Step 0.**

### Production

Prod is still running previously deployed code and is unaffected *today*. But
`server/index.ts` now hard-exits when migrations are pending, so **a deploy of this
tree onto an unmigrated prod database will refuse to boot**. Deploy order is fixed
by Step 9 and is not optional.

---

## 2. Inventory — what the interrupted pass landed (all uncommitted)

Verdicts: **KEEP** = verified, commit as-is. **RATIFY** = defensible but it decides
something that was Oliver's to decide (§3). **FINISH** = started, not complete.

### 2a. Startup and migration hardening — no prior plan covers this

| Change | Files | Verdict |
|---|---|---|
| All three ad-hoc `ADD COLUMN IF NOT EXISTS` / boot-DDL blocks deleted from startup; startup is now read-only w.r.t. schema | `server/index.ts` (−141) | **KEEP** — closes open item #2 |
| The DDL those blocks performed, moved into reviewed history | `migrations/0015_startup_schema_cleanup.sql` (new) | **KEEP** |
| Startup migration gate can fail closed: `reportPendingMigrations({ failOnIssues })`, fatal in production | `server/index.ts`, `server/migrate.ts` | **RATIFY** — §3.2 |
| `RUN_MIGRATIONS=true` retired with a fatal error; only `RUN_SCHEMA_PUSH` remains | `server/index.ts` | **RATIFY** — §3.2 |
| Orphaned and out-of-order migrations promoted from warning to thrown `MigrationHistoryError` | `server/migrate.ts` | **KEEP** |
| `pg_advisory_lock` around the whole plan/apply/baseline operation, so two deploys cannot race | `server/migrate.ts` | **KEEP** |
| Baseline now refuses to record migrations whose effects are absent from the database | `server/migration-baseline-contract.ts` (new, 178 lines), `server/migrate.ts` | **KEEP** |
| Global error handler extracted and hardened — 5xx bodies no longer echo internal messages; `headersSent` delegates to `next(error)` | `server/http-error-handler.ts` (new), `server/index.ts` | **KEEP** |
| New coverage | `server/__tests__/migration-runner-hardening.test.ts`, `server/__tests__/migration-baseline-contract.test.ts` | **KEEP** |

### 2b. Auth session semantics — decides an open question

| Change | Files | Verdict |
|---|---|---|
| `authenticateToken` returns `401 INVALID_SESSION` for a malformed/unknown principal and `403 ACCESS_REVOKED` for an absent/unverified/suspended merchant, replacing the previous blanket `404` | `server/auth.ts` | **RATIFY** — §3.1 |
| Tests updated to match | `server/__tests__/auth-core-regressions.test.ts`, `client/src/__tests__/auth-outage-resilience.test.tsx` | follows the ruling |

### 2c. Subscription entitlement and billing correctness

| Change | Files | Verdict |
|---|---|---|
| `billingCardIsReady` split into `renewalPaymentMethodIsReady` (is there a chargeable card) and `subscriptionHasPaidAccess` (is the merchant entitled). Removing a card no longer claws back a paid month | `server/billing-card.ts` | **RATIFY** — §3.3 |
| `past_due` gets a bounded 8-day dunning grace, refused outright when `lastBillingDate` is absent (a failed *first* charge must not manufacture a free trial) or `failedPaymentCount >= 4` | `server/billing-card.ts` | **RATIFY** — §3.3 |
| Billing pass computes `periodStart` once up front and threads it through. It was previously re-derived from `currentPeriodEnd` *after* the period had rolled | `server/subscription-cron.ts`, `server/subscription-billing.ts` | **KEEP** — real bug |
| The `record_failure` path now produces a proper idempotency key and attempt number instead of bypassing reconciliation metadata | `server/subscription-cron.ts` | **KEEP** |
| `amountCents === undefined` check replaces a falsy check that treated a legitimate `0` as missing metadata | `server/subscription-cron.ts` | **KEEP** |
| Migration reconciling email-verified merchants onto an active Solo subscription | `migrations/0014_reconcile_subscription_activation.sql` (new) | **KEEP** — currently a no-op on dev (0 matching rows); confirm against prod in Step 9 |
| New coverage | `server/__tests__/subscription-cron.test.ts`, `server/__tests__/subscription-storage-safety.test.ts`, updates to `subscription-billing`, `subscription-route-security`, `memstorage-subscription`, `billing-card` | **KEEP** |

`billingCardIsReady` is retained as a compatibility alias, so all **15**
`requireBillingCard` call sites in `server/routes.ts` (the helper itself is defined at
`routes.ts:111`) plus the four cron call sites in `server/property-cron.ts` and
`server/trades-cron.ts` silently changed meaning from "has a card" to "is entitled".
That is the substance of §3.3.

### 2d. Client chunk resilience — half of P0

| Change | Files | Verdict |
|---|---|---|
| `DesktopChunkErrorBoundary` + `DesktopLoadState` with an 8s `DESKTOP_CHUNK_TIMEOUT_MS`, a real timed-out message and a reload path; replaces the deliberately-invisible `DesktopPageFallback` | `client/src/App.tsx` | **KEEP** |
| The main router at `client/src/App.tsx:945` is **still** a bare `<Suspense fallback={<PageLoader />}>` with no error boundary | — | **FINISH** — Step 4 |

There is no `lazyWithRetry`/import-retry helper anywhere in `client/src`. Both failure
modes the prior session reproduced in a browser (chunk 404 → blank screen; chunk hang
→ permanent spinner) remain reachable on every non-desktop route.

### 2e. Settings, tutorial, trades terminal

| Change | Files | Verdict |
|---|---|---|
| `memberMerchantSettingsDto` — read-only teammate view that omits KYC/application data, tutorial controls, processor-card metadata and every credential | `server/http-contracts.ts`, `server/routes.ts` | **KEEP** |
| Tutorial registry gains `desktopTarget` / `desktopBody` per step, so the tutorial anchors to real desktop elements instead of mobile selectors | `client/src/features/tutorial/tutorial-registry.ts`, `client/src/__tests__/tutorial-registry.test.ts` | **KEEP** |
| Settings page wires `useTutorial()`, adds the Tutorial & Help section and a confirmed restart | `client/src/desktop/DesktopSettingsPage.tsx` (+96), `client/src/desktop/DesktopSettingsPage.test.tsx` | **KEEP** — needs the browser check in Step 8 |
| Trades terminal changes | `client/src/desktop/pages/trades-terminal.tsx` (+161/−15) | **KEEP** — needs a screenshot diff, Step 8 |

### 2f. Landing page — pricing reposition and Three.js removal

| Change | Files | Verdict |
|---|---|---|
| Retired per-transaction pricing rewritten to "$7.99/month, no TaptPay per-transaction fee" across three FAQ JSON-LD answers, in both the source and the generated app shell | `client/index.html`, `client/public/app/index.html` | **KEEP** — closes the `landing-pricing-repositioning` memory; commit as one unit per `CLAUDE.md` |
| Three.js/canvas runtime deleted (`camera`, `canvas`, `buildCoins`, bezier helpers…) | `client/src/pages/landingRuntime.ts` (+158/−386) | **KEEP** — closes P2 of `landing-phone-demo-status` |
| `DeferredLandingPhone` wrapper — static import in the page, lazy import of the mount, static shell + its own error boundary | `client/src/pages/DeferredLandingPhone.tsx` (new), `client/src/pages/landing-page.tsx` | **KEEP**, but it is what broke the budget gate — Step 3 |
| New harnesses: overlap/spacing audit, autoplay acceptance, filmstrip capture | `scripts/audit-landing-overlaps.mjs`, `scripts/verify-landing-phone-autoplay.mjs`, `scripts/filmstrip-landing-phone.mjs` | **KEEP** — none have been run since the change; Step 8 |
| Build-budget gate extracted into a module behind a thin wrapper | `scripts/landing-phone-build-graph.mjs`, `scripts/verify-landing-phone.mjs` | **FINISH** — Step 3, this is where the crash happened |

### 2g. Everything else touched

`shared/schema.ts` (adds `transactions.completedAt`; deletes the dead
`updateMerchantRatesSchema`, `insertPlatformFeeSchema`, `updateSubscriptionSchema` and
their exported types), `server/storage.ts` (+723/−512, 116 hunks — subscription safety
and `completedAt` plumbing), `server/payment-attempt-service.ts`,
`scripts/verify-server-postgres.mjs`, `scripts/desktop-shots/{probe-cascade,
probe-topbar,probe-transitions,retail-fixtures}.mjs`, `package.json`
(`pg ^8.16.3 → ^8.23.0`).

---

## 3. Decisions only Oliver can make

Steps 1, 7 and 10 depend on these. Per `docs/HANDOFF-2026-07-28-tablet-desktop-app.md`
§6, they get raised **as one list**, not absorbed silently.

**3.1 — Should a revoked/deleted account clear credentials?**
The prior session left this explicitly open. The review answered it: `404` became
`401 INVALID_SESSION` / `403 ACCESS_REVOKED`, and the client clears credentials on
401/403, so a genuinely deleted account now signs out instead of sitting on the
recovery screen. **Recommend: ratify.** It restores the pre-`15e97f6` behaviour for
real revocations while keeping the outage-vs-rejection distinction that `15e97f6`
existed to create. Reverting means going back to the recovery screen with *Sign out*
as the only escape.

**3.2 — Should production refuse to boot on pending migrations?**
Currently yes, and `RUN_MIGRATIONS=true` is now fatal. This is a genuine operational
policy change: a deploy that forgets Step 9 becomes an outage instead of a silent
column error. **Recommend: ratify**, because the silent version is precisely what
caused 2026-08-09. Note it makes Step 9's ordering mandatory forever.

**3.3 — Entitlement semantics and the dunning numbers.**
Access now survives card removal until the paid period ends, and `past_due` merchants
keep working for 8 days past `currentPeriodEnd` (`DUNNING_ACCESS_DAYS = 8`) or until
`failedPaymentCount >= 4` (`MAX_PAYMENT_ATTEMPTS = DUNNING_RETRY_DAYS.length + 1`,
with retries at 1/3/7 days). Both numbers were chosen by the review, not by you.
The 8-day window is a business decision about how long an unpaid merchant keeps
taking money. **Needs an explicit number from you**, even if it is 8.

**3.4 — Is ~13s worst case before the auth error panel acceptable?**
Unchanged from the prior session, still unanswered. 4s × 3 attempts + backoff against
a 14s deadline, asserted by test.

**3.5 — Prod accounts.** Merchants 25/26/28/29 have no `password_hash` so `0013`
created no owner for them; merchant 27 has a login but `status='pending'`. Provision
them, or leave them? This changes what `0014` does in prod (see Step 9).

**3.6 — P3 destructive drops (Step 10).** Explicit go/no-go required before anything
is dropped.

---

## 4. The work, in order

### Step 0 — Apply the three pending migrations to dev  ⟵ **do this first**

Nothing else is meaningful until the tree stops being broken.

```bash
npm run db:migrate:status     # expect: 15 applied, 3 pending, 0 drifted, 0 orphaned
npm run db:migrate
npm run db:migrate:status     # gate: 18 applied, 0 pending, 0 drifted, 0 orphaned
```

Then restart the dev server (one instance only, `:5000` — memory
`dev-server-single-instance`; the workflow does not auto-restart) and confirm the
pending-migration banner is gone.

**Gate:** `db.select().from(transactions)` succeeds. A logged-in session reaches the
dashboard.

> Trap: each `migrations/*.sql` carries its own `BEGIN;`/`COMMIT;`. Never run one
> inside an outer transaction — its `COMMIT` ends yours and a "rehearsal" goes live.

### Step 1 — Re-establish the green baseline, then commit what is already verified

```bash
npx tsc --noEmit
npx jest --selectProjects server --runInBand
npx jest --selectProjects client
npm run test:server:postgres
```

Then commit in the slices below. Commit the **RATIFY** items as their own commits so
any single ruling from §3 can be reverted without unpicking the rest. Per `CLAUDE.md`:
never `git add -A`; exclude `.claude-home/**` and `.claude/settings.local.json`;
`client/index.html` + `client/public/app/index.html` go together as one unit.

Slices, in dependency order — full sequence in §6.

**Gate:** working tree contains only the 2026-08-08 landing-phone WIP and whatever
Step 3 onward is actively editing.

### Step 2 — Raise the §3 decision list

Send §3 as one message. Step 7 is blocked on 3.3, Step 10 on 3.6, and Step 9 needs
3.5 before `0014` is applied to prod; everything else can proceed while you decide.

### Step 3 — Repair the landing-phone budget gate

`node scripts/verify-landing-phone.mjs` currently fails with:

```
expected one LandingPhoneMount dynamic entry, found 0
```

**The lazy boundary has not regressed.** A fresh `vite build --manifest` shows the
phone is still code-split, as two dynamic entries:

```
_LandingPhoneMount-D92ohsbl.js               isDynamicEntry: true
src/pages/landing-phone/LandingPhoneDemo.tsx isDynamicEntry: true
```

What changed is the **manifest key**. `scripts/landing-phone-build-graph.mjs:125`
matches keys ending `/pages/landing-phone/LandingPhoneMount.tsx`, i.e. it assumes the
phone root is keyed by source path. Introducing `DeferredLandingPhone` added a second
dynamic boundary, the mount became a shared chunk, and Vite now keys it by emitted
chunk name with a `_` prefix instead.

Fix the gate, not the app: resolve the phone root by `node.file`/`isDynamicEntry` as
well as source path, and keep the three assertions it exists for — reachable from the
entry, absent from the eager graph, no `/pages/landing-phone/` module in the eager
closure.

**Gate:** `node scripts/verify-landing-phone.mjs` exits 0 and reports within budget —
JS ≤35KB gz, CSS ≤8KB gz, images ≤40KB raw, whole feature ≤90KB.

> Check the exit code directly, not through a pipe. `node … | tail` reports `tail`'s
> status and will look green while the gate is red.

### Step 4 — Finish P0: chunk resilience for the rest of the app

The only remaining item where a user sees a dead app. Both modes were reproduced in a
browser on 2026-08-09: a 404'd chunk after a deploy gives a **completely blank
screen**, and a hung chunk gives a **permanent spinner** — indistinguishable from the
bug this whole branch of work started with.

1. A global `ErrorBoundary` above the router with a real recovery screen, wrapping
   `client/src/App.tsx:945`. Model it on `DesktopChunkErrorBoundary`, which already
   does this correctly for desktop chunks.
2. A `lazyWithRetry(import)` helper: bounded retry, a timeout matching
   `DESKTOP_CHUNK_TIMEOUT_MS`, falling back to a hard reload — which is what actually
   fixes the stale-hash-after-deploy case. Apply it to every `lazy()` in `App.tsx`.
3. Keep the existing local boundaries in `checkout.tsx` and the landing phone.

**Gate:** with the abort/hang harness, both scenarios end in something actionable —
no blank screen, no unbounded spinner. Add a client test for the boundary and the
retry helper.

### Step 5 — P1: the catch-up migration, and the rebuildability gate

`migrations/` still is not a complete schema history. `0015` closed part of it. A
static diff of every `pgTable` in `shared/schema.ts` against every `CREATE TABLE` /
`ADD COLUMN` in `migrations/*.sql` gives the exact remainder — **6 tables and 15
columns** (it was 8 and 19 before `0015`; the arithmetic reconciles against the
empirical scratch-DB measurement taken on 2026-08-09):

**Tables created by no migration:** `refunds` (14 cols), `merchant_settlements` (10),
`stock_items` (10), `api_keys` (14), `api_requests` (13), `webhook_deliveries` (15).

**Columns declared but never migrated:**
`merchants` — `google_id`, `director`, `nzbn`, `custom_logo_url`, `windcave_api_key`,
`windcave_merchant_id`, `theme_id`, `daily_goal`, `reset_token`, `reset_token_expiry`;
`invoices_rent_requests` — `kind`, `charge_type`, `description`, `document_url`,
`document_name`.

Write one `0017_schema_history_catchup.sql`, everything `IF NOT EXISTS` so it is a
no-op against dev and prod, which already have all of it.

**Gate:** build a scratch database from `migrations/` alone and diff it against
`shared/schema.ts` — drift must be **0 tables, 0 columns**. Drop the scratch DB.
Until this passes, provisioning a new environment yields a database the app cannot
run against.

> `windcave_api_key` / `windcave_merchant_id` are credential columns. Create them;
> do not seed them.

### Step 6 — P2: dependencies

`pg` is still in `devDependencies` (the review bumped it `^8.16.3 → ^8.23.0` but did
not move it), and so is `tsx`, which `npm run db:migrate` runs on. It works today by
accident: `pg` is imported lazily, migrations resolve via `process.cwd()`, and the
build needs vite/esbuild anyway so a deploy must install devDependencies.

Move `pg` to `dependencies`. Then decide whether `db:migrate` ships a compiled entry
point or is formally a dev/CI-only tool — pick one and write it down, because Step 9
now depends on it running successfully in the deploy pipeline.

**Gate:** `npm ci --omit=dev && node -e "require('pg')"` succeeds, or the decision is
recorded in `replit.md` that migrations run from a dev/CI context only.

### Step 7 — Windcave UAT billing proof

`docs/PLAN-2026-08-07-subscription-pricing.md` §11 requires this before production
credentials point at the rebill job, and the review rewrote the entitlement and
dunning logic without it. Blocked on §3.3.

Against `uat.windcave.com`, prove three things:

1. a stored card token survives a period roll;
2. the same `X-ID` submitted twice charges **once**;
3. a declined card lands in `past_due` and stops after `MAX_PAYMENT_ATTEMPTS`, rather
   than retrying forever.

Add (3) as a test if it can be expressed against the UAT sandbox.

**Gate:** all three demonstrated, with the evidence pasted into the commit message.

### Step 8 — Browser verification sweep

Nothing in §2d–2f has been looked at in a browser since it changed. Dev server up on
:5000, single instance. Chromium must be the nix one —
`/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`
(memory `playwright-nix-chromium`).

```bash
node scripts/verify-landing-phone-autoplay.mjs   # autoplay, loop, scene stability
node scripts/audit-landing-overlaps.mjs          # overlap/spacing, per viewport and act
node scripts/desktop-shots/shot-trades-terminal.mjs
node scripts/verify-desktop-p0.mjs               # device gating, frame geometry, chunk isolation
```

Plus, by hand: the Settings tutorial restart from §2e at both device classes, and the
tutorial `desktopTarget` anchors actually landing on the right elements.

**Gate:** each script exits non-zero on failure — several currently collect page errors
and still exit 0, so confirm the exit code means something before treating it as a
gate. Screenshot diff for the trades terminal against the design PNG.

### Step 9 — Production: migrate, then deploy

Order is mandatory and now enforced by the boot gate from §2a.

1. `pg_dump` prod first — `db-backups/` already does this on boot and daily.
2. `npm run db:migrate:status` against `NEON_DATABASE_URL`; expect the same 3 (or 4
   after Step 5) pending.
3. Rehearse in a **rolled-back transaction**, remembering the `BEGIN;`/`COMMIT;` trap.
4. Apply for real, then re-run `--status`: 0 pending, 0 drifted, 0 orphaned.
5. Confirm what `0014` did — on dev it matched 0 rows; on prod it depends on §3.5.
6. Only then deploy the code.

**Gate:** prod boots, `/api/auth/me` answers, a real login reaches the dashboard.

### Step 10 — P3: dead schema  ⟵ **destructive, gated on §3.6**

Separate migration, run deliberately, after a fresh backup, never bundled with
anything else.

- `crypto_transactions` and the six `merchants` crypto columns — zero code references;
- `invoices_rent_requests.scheduled_send_at` — an orphan; the `scheduledSendAt` in
  `shared/schema.ts` belongs to `job_invoices`;
- the two dead middlewares `validateMerchant` / `validateMerchantTransaction` —
  referenced nowhere. These are code, not schema, and can go with Step 1 if you'd
  rather not wait.

**Gate:** backup taken and verified restorable before the drop runs.

### Step 11 — Close the loop

- Update `replit.md` for the new startup contract: read-only w.r.t. schema, fail-closed
  in production, `RUN_MIGRATIONS` retired.
- Update `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` §6 with the §3 rulings.
- Rewrite the `dev-db-unapplied-migrations` memory's "Still open" list against what
  actually closed: #2 closed by `0015`; #6 closed by §3.1; #1 by Step 5; #4 by Step 6;
  #5 by Step 4; #3 by Step 10.
- Record in memory that `~/.codex` does not survive an environment reset, so a
  cross-agent handoff has to land in `docs/` or a commit, not a session log.

---

## 5. Verification reference

The full loop, in the order that fails fastest:

```bash
npx tsc --noEmit                             # must be silent
npx jest --selectProjects server --runInBand # 23 suites / 325 tests at time of writing
npx jest --selectProjects client             # 33 suites / 338 tests
npm run test:server:postgres                 # safety test, then the postgres verifier
npm run db:migrate:status                    # 0 pending, 0 drifted, 0 orphaned
npx vite build                               # each desktop page in its own chunk
node scripts/verify-landing-phone.mjs        # budget + lazy-boundary gate
node scripts/verify-desktop-p0.mjs           # device gating, frame geometry, tutorial spotlight
```

Contract tests worth knowing about: `phase0-contracts.test.ts` asserts exact DTO key
lists and will fail loudly if a DTO changes shape — that is what it is for.
`token-route-inventory.test.ts` and `subscription-route-security.test.ts` are the
guards on route auth.

---

## 6. Commit sequence

Each is independently revertible. RATIFY items are isolated on purpose.

| # | Commit | Contents |
|---|---|---|
| 1 | `feat(db): move the remaining startup DDL into migration history` | `0015`, the `server/index.ts` deletions |
| 2 | `fix(db): make the migration runner refuse ambiguous history` | `migrate.ts` orphan/out-of-order/advisory lock, `migration-baseline-contract.ts`, both new tests |
| 3 | `feat(db): fail closed on pending migrations in production` | the `failOnIssues` gate, `RUN_MIGRATIONS` retirement — **§3.2** |
| 4 | `fix(api): stop 5xx responses echoing internal error messages` | `http-error-handler.ts`, `server/index.ts` wiring |
| 5 | `fix(auth): sign out a revoked account instead of stranding it` | `server/auth.ts` 401/403 + tests — **§3.1** |
| 6 | `fix(subscription): bill the period that was actually charged` | `subscription-cron.ts`, `subscription-billing.ts`, tests |
| 7 | `feat(subscription): separate paid entitlement from card presence` | `billing-card.ts`, `0014`, tests — **§3.3** |
| 8 | `feat(db): record when a transaction completed` | `shared/schema.ts` `completedAt`, `0016`, `storage.ts`, `storage.test.ts` |
| 9 | `feat(api): give teammates a credential-free settings view` | `http-contracts.ts`, `routes.ts`, security tests |
| 10 | `feat(desktop): anchor the tutorial to desktop targets` | tutorial registry, `DesktopSettingsPage`, trades terminal, their tests |
| 11 | `feat(landing): sell the subscription, not a per-transaction fee` | both `index.html` files **as one unit** |
| 12 | `perf(landing): delete the Three.js runtime` | `landingRuntime.ts`, `landing-page.tsx` |
| 13 | `feat(landing): defer the phone behind a static shell` | `DeferredLandingPhone.tsx`, mount/demo changes, the repaired gate from Step 3, the new harnesses |
| 14+ | Steps 4–10 | one commit per step, verification results in the message |

The 2026-08-08 landing-phone WIP (12 scene/primitive files) is **not** part of this
sequence. It is separate paused work — see the `landing-phone-realism-wip` memory —
and stays uncommitted until it is finished on its own terms.

---

## 7. Traps

- **`BEGIN;`/`COMMIT;` inside every migration file.** Run one inside an outer
  transaction and its `COMMIT` ends yours; a rehearsal silently goes live.
- **Never `drizzle-kit push` from this branch.** FK columns carry rogue
  auto-increment defaults — memory `db-schema-drift-fk-sequences`.
- **One dev server, on :5000.** Two instances produce an HMR token clash overlay, and
  the workflow does not auto-restart — memory `dev-server-single-instance`.
- **Playwright must use the nix chromium.** The bundled browser is broken (`libnspr4`).
- **Tablet needs `hasTouch: true`.** Without it you get the desktop path and are not
  testing the tablet at all.
- **Pipes hide exit codes.** `node script.mjs | tail` reports `tail`'s status.
- **Never `git add -A`.** Exclude `.claude-home/**` and `.claude/settings.local.json`.
- **`pg_stat_activity.state` is `'disabled'` on these instances**, so it cannot prove
  "no query is running".
- **`~/.codex` does not survive an environment reset.** Anything an agent needs to hand
  over must be in `docs/` or a commit.
