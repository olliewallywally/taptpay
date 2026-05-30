# Property Management — Remediation Plan

Tracks the outstanding items from the integration review.

**Done:** C2 recurring-rent automation UI (`ffbf049`), C1 payment completion +
L1 dead-code removal (`b1f44fa`). The items below remain.

Ordered by priority. Each item lists the problem, the fix, files touched, and
how to verify.

---

## C1 — ✅ DONE (commit `b1f44fa`) — Card payments never marked an invoice paid

Implemented: `createWindcaveSession` now takes an optional `callbacks` override;
rent checkout uses dedicated `/api/checkout/callback` (browser) and
`/api/windcave/rent-notification` (server) routes; `finalizeRentInvoice()`
settles invoices idempotently (sets `paid`/`paidAt`/`windcaveTransactionId`,
logs `Payment_Received`); `simulateRentSession` handles sim mode. The original
analysis is kept below for reference.

**Problem.** `/api/checkout/pay` creates a Windcave session but passes
`null as any` as the `transactionId` (`server/routes.ts:5957`), so the
generated callback URLs are `/api/windcave/callback?transactionId=null`. The
existing callback handler resolves a retail `transaction`, finds none, and
redirects to `/`. Nothing maps a Windcave session back to a rent invoice.
`storage.getInvoiceRentRequestByWindcaveSessionId()` exists but is never called.
Result: card payments are never recorded `paid`; `paidAt` /
`windcaveTransactionId` stay null; the payer lands on a broken page.

**Fix.**
1. Give rent checkout its own callback + notification routes rather than
   overloading the retail ones:
   - `GET /api/checkout/callback?token=<token>&result=approved|declined|cancelled`
     — browser return URL; queries the Windcave session, updates the invoice,
     then redirects to `/r/:token` (which will now render the paid/declined
     state).
   - `POST /api/windcave/rent-notification` — server-to-server notification;
     looks up the invoice by `windcaveSessionId`, queries the session, and
     updates status idempotently.
2. Thread a real callback base into `createWindcaveSession`. Either:
   - overload `createWindcaveSession` to accept a `callbackBase`/`notifyUrl`
     override, or
   - add a `createRentWindcaveSession(...)` variant that builds
     `/api/checkout/callback?token=...` URLs.
3. On an approved session: `updateInvoiceRentRequest(id, { status: 'paid',
   paidAt: now, windcaveTransactionId, sentAt ?? unchanged })` **only if** the
   invoice is not already `paid`/`paid_external`/`voided` (idempotency — the
   browser callback and the notification can both fire). Log a
   `Payment_Received` transaction event.
4. Store `windcaveSessionId` already happens (`routes.ts:5962`); also persist
   `windcaveTransactionId` from the query result.
5. `RentCheckout` (`client/src/pages/property/rent-checkout.tsx`) already polls
   `resolve` on mount — once status flips to `paid`, the existing `alreadyPaid`
   branch renders the success state. Optionally add a short re-poll on return
   so a redirect straight back to `/r/:token` shows "paid" without a manual
   refresh.

**Files.** `server/routes.ts`, `server/windcave.ts`,
`client/src/pages/property/rent-checkout.tsx`.

**Verify.** With Windcave in UAT (or the simulate path), pay an invoice end to
end and confirm: invoice → `paid`, `paidAt`/`windcaveTransactionId` set, a
`Payment_Received` event logged, the dashboard collection ring moves, and the
checkout page shows "paid". Re-hit the callback to confirm no double-processing.

**Risk.** Medium — touches the shared Windcave layer. Keep rent routes fully
separate from retail `transactions` to avoid regressing the retail flow.

---

## H1 — 🟠 Cron passes run concurrently (generate ↛ dispatch same run)

**Problem.** `routes.ts:5991` runs `Promise.all([generate, dispatch,
overdue])`. Dispatch reads `pending_dispatch` invoices that generate creates,
so freshly generated invoices aren't emailed until the next cron tick (and the
first run emails nothing).

**Fix.** Run sequentially: `const gen = await runGeneratePass(now); const disp
= await runDispatchPass(baseUrl); const overdue = await runOverduePass(now);`
Overdue can stay after dispatch. Keep the combined JSON response shape.

**Files.** `server/routes.ts` (the `/api/internal/cron` handler).

**Verify.** Create a schedule with `nextRunDate <= now`, hit the cron endpoint
once, confirm the invoice is both generated **and** dispatched in the same call.

**Risk.** Low.

---

## H2 — 🟠 Every "send" creates a new invoice (duplicates)

**Problem.** Tapping an existing pending invoice row routes to the send screen,
but `handleSend` always POSTs a brand-new ad-hoc invoice. Tapping an existing
invoice and sending duplicates it; batch send re-invoices already-invoiced
tenants.

**Fix.** Decide the intended semantics, then:
- If the send screen was opened from an existing invoice row, call a
  **re-dispatch** endpoint (`POST /api/property/invoices/:id/resend`) that
  re-emails the existing invoice instead of creating a new one. Track the
  source invoice id in terminal state (`handleRowTap` already has it).
- For batch, skip tenants who already have a live (`pending_dispatch` /
  `dispatched` / `overdue`) invoice, or resend theirs rather than creating a
  second.
- Add a server guard: optionally reject creating a second *active* ad-hoc
  invoice for a tenant who already has one, unless explicitly forced.

**Files.** `server/routes.ts`, `server/storage.ts` (resend helper),
`client/src/pages/property/property-terminal.tsx`.

**Verify.** Tap an existing invoice → send → confirm no new row appears and the
tenant is re-emailed. Batch a mix of invoiced/uninvoiced tenants → confirm no
duplicates.

**Risk.** Medium — needs a clear product decision on resend vs new.

---

## H3 — 🟠 SMS delivery is selectable but unimplemented

**Problem.** `preferredChannel` / `deliveryChannel` accept `"sms"` and the
terminal renders "sending via sms", but `runDispatchPass` only calls
`sendEmail` and bails on `!tenant.email`. SMS-preference tenants are never
contacted; their invoices sit in `pending_dispatch` forever.

**Fix.** Two options:
- **Implement SMS** (preferred if a provider exists — the repo references an
  SMS fix in history). Add `sendSms(...)` and branch on
  `invoice.deliveryChannel` in `runDispatchPass`; build a short text with the
  `/r/:token` link.
- **Or gate it off**: remove `"sms"` from the channel enums
  (`shared/schema.ts`) and the terminal channel UI until SMS ships, so it can't
  be selected.

Either way, in dispatch, when the chosen channel can't be delivered (no email
for email-channel, no phone for sms-channel), mark the invoice as failed /
needs-attention instead of leaving it pending forever (see L4).

**Files.** `server/property-cron.ts`, `shared/schema.ts`, possibly a new
`server/sms-service.ts`, terminal channel UI.

**Verify.** Tenant set to SMS → run cron → confirm SMS sent (or that the option
is no longer selectable if gated off).

**Risk.** Low–Medium depending on whether a provider is wired.

---

## M1 — 🟡 Batch send reports false success

**Problem.** `batchMutation` fires N fetches via `Promise.all`, never checks
`r.ok`, and reports "Sent to N tenants." Tenants with no existing invoice get
`amountCents: 0`, which fails server validation, but the UI still claims
success.

**Fix.** Check each response; count successes/failures; surface a partial
result ("Sent to 3, 1 failed"). Skip tenants with no resolvable amount up front
(don't POST `amountCents: 0`). Pairs naturally with the H2 batch rework.

**Files.** `client/src/pages/property/property-terminal.tsx`.

**Verify.** Batch a tenant with no invoice → confirm it's skipped or reported
failed, not counted as sent.

**Risk.** Low.

---

## M2 — 🟡 Two competing "pause" models (partly resolved)

**Status.** The shipped automate UI standardizes on `status` (`active` ↔
`paused`) and the dashboard stat now counts `status === 'paused'`. The
`pauseNextCycle` boolean (skip-one-cycle) still exists in schema + cron and is
no longer surfaced anywhere.

**Fix (cleanup).** Either:
- keep `pauseNextCycle` strictly as a "skip the next run once" feature and give
  it its own explicit UI/affordance, or
- remove `pauseNextCycle` from the schema, cron (`runGeneratePass`), and update
  schema if skip-one-cycle isn't a real requirement.

Document which field means what so they don't drift again.

**Files.** `shared/schema.ts`, `server/property-cron.ts`, migration if a column
is dropped.

**Verify.** Pause from the automate screen → cron skips the schedule → resume →
cron resumes. Confirm no path sets both fields inconsistently.

**Risk.** Low.

---

## M3 — 🟡 Migration diverges from the Drizzle schema

**Problem.** Migration `0003` defines the invoices uniqueness index with a
partial `WHERE schedule_id IS NOT NULL AND billing_period_start IS NOT NULL`
(correct — ad-hoc invoices have null `schedule_id`), but `shared/schema.ts:815`
declares a plain `uniqueIndex()` with no filter. A future `drizzle-kit`
generate/push will see drift and try to "fix" it. (Postgres treats NULLs as
distinct, so the plain index wouldn't actually constrain ad-hoc rows.)

**Fix.** Add the matching partial predicate to the Drizzle index definition so
schema and migration agree:
```ts
scheduleBillingPeriodUnique: uniqueIndex("invoices_schedule_billing_period_unique")
  .on(t.scheduleId, t.billingPeriodStart)
  .where(sql`${t.scheduleId} IS NOT NULL AND ${t.billingPeriodStart} IS NOT NULL`),
```
Then run a no-op `drizzle-kit generate` to confirm zero drift.

**Files.** `shared/schema.ts`.

**Verify.** `drizzle-kit generate` produces no new migration.

**Risk.** Low.

---

## Low / polish

- **L1.** ✅ DONE (`b1f44fa`) — removed the dead `callbackUrl` in
  `/api/checkout/pay`.
- **L2.** Compare the cron secret with `crypto.timingSafeEqual` instead of
  `!==` (`routes.ts:5987`).
- **L3.** `computeNextRunDate` uses server-local `setMonth/setDate` and can
  drift an hour across DST; document the intent or normalize to a fixed TZ /
  UTC midday. (`server/property-cron.ts`)
- **L4.** Give dispatch a failure ceiling: after N failed attempts (or an
  undeliverable channel), move the invoice out of `pending_dispatch` to a
  `dispatch_failed` / needs-attention state instead of retrying forever.
  (`server/property-cron.ts`, status enum)

---

## Suggested sequencing

1. ~~**C1**~~ ✅ done — the payment rail now records card payments.
2. **H1** — one-line fix, immediate correctness win for automation.
3. **H3 / L4** — decide SMS in-or-out and stop infinite dispatch retries.
4. **H2 / M1** — resolve duplicate-invoice semantics (batch + resend together).
5. **M2 / M3 / L2–L3** — cleanups; fold into the above PRs where they overlap.
