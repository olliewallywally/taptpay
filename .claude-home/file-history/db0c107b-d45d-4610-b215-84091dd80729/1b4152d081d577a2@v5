# Trades Vertical — Design Spec

**Date:** 2026-06-17
**Status:** Approved design, ready for implementation plan
**Author:** Claude + Oliver

## 1. Overview

Build a third vertical of TaptPay — **Trades** — for tradespeople (plumbers,
electricians, builders, etc.). It mirrors the **Property Management** vertical's
architecture and UX (NOT retail): its own dashboard, terminal, directory,
profile/job page, and analytics, sharing the same app foundation, checkout, SSE,
and payment-link machinery.

The defining trades workflow is **quote → accept → deposit → balance → complete**.
A quote becomes a *job* once accepted; deposit and balance are two payment links
hanging off that job, reusing the exact link/checkout/SSE flow property uses for
rent requests.

Trades fee rate is **0.3%** per transaction (per business facts), and the
post-payment document is labelled **"Invoice"** (never "Receipt").

## 2. Goals & non-goals

**Goals**
- Mirror property's structure so the terminal code ports cleanly.
- One core *Quote* builder (line items + deposit toggle + recurring toggle).
- One *quick Invoice* path (keypad → send), for callouts/agreed jobs with no quote.
- Auto-present the deposit payment link the moment a customer accepts a quote
  with a deposit enabled.
- Park accepted/deposit-paid jobs in a **stack** (the home list); send the
  remaining balance / mark complete from a tap-row action sheet.
- Reuse split-payment, external-paid, client profiles, keypad, ConfirmButton.
- A 3-way vertical switcher in Settings (Retail · Property · Trades).

**Non-goals (v1)**
- Stock/items page (removed for trades, as for the original plan).
- Cash-sale button.
- Bills/expenses screen (dropped — replaced by the quick Invoice path).
- Materials cost tracking, supplier management.
- SMS-only restriction (we keep email + WhatsApp like property).
- Progress milestones beyond the single deposit + balance split (deferred).

## 3. Vertical navigation (3-way switch)

`client/src/pages/settings.tsx` currently renders a 2-button mode switcher
(Retail → `/dashboard`, Property → `/property`) at ~line 1170. Extend to **three**
compact cards in a single row:

| Card | Route | Accent |
|---|---|---|
| Retail | `/dashboard` | teal `#00E5CC` |
| Property | `/property` | sky `#58ABFF` |
| **Trades** | `/trades` | amber (see §4) |

The three cards must remain readable on mobile — reduce per-card padding/font so
three fit a phone width without overflow (responsive standing rule).

New routes (mirror property in `client/src/App.tsx`):
- `/trades` → trades-dashboard
- `/trades/clients` → client-directory
- `/trades/clients/:id` → client/job page
- `/trades/analytics` → trades-analytics
- `/trades/terminal` → trades-terminal

## 4. Theme — swappable palette

Trades gets its own identity: **graphite/charcoal base + safety-amber accent**
(hi-vis/tools language), distinct from property's navy/blue and retail's
blue/teal.

**Requirement: colours must be trivially swappable.** All trades colours live in a
single token block at the top of the trades terminal (and a shared export), the
same way property uses `NAVY/BLUE/OFFW/GREEN/RED/AMBER` constants. Changing the
look is a one-place edit.

Proposed starting tokens (placeholders — easy to change):

```ts
// trades theme tokens — swap these to restyle the whole vertical
export const TRADES_THEME = {
  INK:    '#1A1D21', // charcoal base (was NAVY)
  ACCENT: '#FF7A1A', // safety amber (was BLUE)
  OFFW:   '#F4F4F4',
  GREEN:  '#1BBF85',
  RED:    '#FF3B4E',
  AMBER:  '#FFB02E',
};
```

The terminal references only these tokens, never hard-coded hex, so a future
restyle (or A/B of accent colours) is one edit.

## 5. Job lifecycle & states

```
QUOTE ──send──▶ sent ──viewed──▶ ACCEPTED ─┐  (DECLINED is terminal)
  │  (line items + deposit toggle)          │
  │                          deposit on? ───┤
  │                                 yes ────▶ deposit link auto-shown ──paid──▶ DEPOSIT_PAID
  │                                 no  ────▶ full balance link ──paid──▶ PAID ✓
  └ on accept the quote becomes a JOB and parks in the stack
       tap job row ▶ [ send balance · mark complete · paid externally · cancel ]
            send balance ──paid──▶ PAID ✓ (complete)
```

Quote statuses: `draft · sent · viewed · accepted · declined · expired`.
Job/invoice statuses (reuse property's vocabulary): `pending_dispatch ·
dispatched · viewed · deposit_paid · balance_due · paid · paid_external ·
voided · dispatch_failed`.

The home **stack** (= property's "rent requests" list) shows quotes + jobs +
quick invoices with a status dot. The **send balance / mark complete** actions
live in the tap-row action sheet (mirrors property's `InvoiceActionSheet`), not
in the action bar.

## 6. Action bar (4 slots — same count as property)

Property: `tenants · send · bill · external`. Trades:

| # | Trades slot | Icon | Opens |
|---|---|---|---|
| 1 | **clients** | person | Client picker/directory (reuses tenant directory). |
| 2 | **quote** | document/estimate | Quote builder: add line items (desc · qty · unit price via keypad), running total, **deposit toggle** (% or $), **recurring toggle** (maintenance retainer), optional attach doc, send. |
| 3 | **invoice** | send/receipt | Quick path: keypad → amount, pick client, optional job note, **recurring toggle**, send a one-tap payment request. No quote step. |
| 4 | **external** | external | Mark a job/invoice paid externally (cash/bank). Unchanged from property. |

**Toggles, not slots:** deposit lives inside *quote*; recurring lives inside
*quote* and *invoice*. Neither gets its own action-bar slot (matches the
"toggle button called recurring" steer, and how property nests frequency inside
the send flow).

## 7. Screens (mirror property components)

- **Home / stack** — headline = outstanding job value; list of quotes/jobs with
  status dots; tap a row → action sheet.
- **ChooseClient** — reuse `ChooseTenant`.
- **QuoteBuilder** — new. Line-item editor (add/remove rows; each row uses the
  keypad for unit price), subtotal, GST line (§9), deposit toggle (% or $ →
  computed deposit amount), recurring toggle, attach doc, `ConfirmButton` send.
- **QuickInvoice** — reuse `ChargeBill`/`SendRentLink` pattern: keypad amount,
  client, job note, recurring toggle, send.
- **Keypad** — reuse `RentAmount`.
- **MarkExternal** — reuse as-is (already fixed for spacing).
- **JobActionSheet** — reuse `InvoiceActionSheet`: send balance · resend ·
  mark received externally · mark complete · cancel.
- **Sent/success** — reuse `SentSuccess` (copy: "quote sent" / "invoice sent").
- **Recurring/automation** — reuse `AutomateScreen` for maintenance schedules,
  reached from the job/automation list (not an action-bar slot).
- **Client/Job page** (separate page) — reuse `tenant-profile`: client details +
  their quotes/jobs, deposit/balance status, event timeline.

## 8. Data model (mirror property tables, trades naming)

New tables in `shared/schema.ts`, mirroring the property block:

- **`client_profiles`** (≈ `tenant_profiles`): `firstName, lastName, email,
  phone, siteAddress, notes, preferredChannel, status, archivedAt`.
- **`quotes`** (new): `merchantId, clientProfileId, token, status,
  lineItems jsonb [{ description, qty, unitPriceCents, lineTotalCents }],
  subtotalCents, gstCents, totalCents, depositEnabled, depositType
  ('percent'|'fixed'), depositValue, depositCents, validUntil, notes,
  documentUrl, documentName, sentAt, viewedAt, acceptedAt, declinedAt`.
- **`job_invoices`** (≈ `invoices_rent_requests`): `merchantId, clientProfileId,
  quoteId (nullable for quick invoices), scheduleId (nullable), kind
  ('deposit'|'balance'|'full'|'recurring'), amountCents, token, deliveryChannel,
  status, dueAt, …timestamps…, externalPaymentReference, reminder fields, split
  fields, windcave fields`. Same shape as the property invoice table so the
  checkout/SSE/split code is reused verbatim.
- **`job_schedules`** (≈ `active_schedules`): recurring maintenance billing.
- **`job_events`** (≈ `transaction_events`): per-job timeline.

Zod schemas mirror the property ones (`createClientProfileSchema`,
`createQuoteSchema`, `acceptQuoteSchema`, `createJobInvoiceSchema`,
`markJobPaidExternalSchema`, `createJobScheduleSchema`).

**Reuse-vs-fork decision:** fork into trades-named tables rather than overloading
the rent tables — the property invoice table hard-requires `tenantProfileId` and
carries rent-specific columns; a parallel set keeps both verticals clean and
independently evolvable, at the cost of some duplicated CRUD. This matches how
property already sits parallel to retail rather than overloading it.

## 9. GST (NZ default, easily reversible)

NZ tradies are typically GST-registered. Default: **amounts are GST-inclusive**;
quotes/invoices show a "GST (15%) incl." summary line and a GST-inclusive total.
Gated by a merchant `gstRegistered` flag — if false, no GST line is shown and
totals are plain. The 15% rate is a single constant. This is documented as an
easily-changed v1 decision; if the user prefers tax-exclusive entry with GST
added on top, it's a localized change to the totals computation + display.

## 10. Fees & invoice labelling

- Trades transaction fee = **0.3%** of amount, shown in terminal, transaction
  breakdown, and settings (follows existing sector fee logic).
- Post-payment document labelled **"Invoice"** everywhere (in-app + emailed PDF):
  client name, site address, job details/line items, amount, date, merchant
  business name.

## 11. Reuse map (what ports unchanged)

Reused as-is: split-payment checkout, `sse-client`, `ConfirmButton`, keypad
(`RentAmount`), `MarkExternal`, `InvoiceActionSheet`, `SentSuccess`,
`AutomateScreen`, `ChooseTenant`, the subbar/FAB/conveyor terminal chrome,
reminder settings, the dashboard/analytics shells.

New code: trades theme tokens, `QuoteBuilder` screen + line-item editor, quote
accept → deposit-link flow, the trades data tables/Zod/storage/routes, trades
copy (Invoice/0.3%/GST), the 3-way settings switch, `/trades/*` routes.

## 12. Deferred / open

- Progress milestones beyond deposit+balance.
- Materials/supplier tracking.
- Quote PDF export/branding polish.
- Final accent colour (amber is a placeholder; tokens make it a one-edit swap).
