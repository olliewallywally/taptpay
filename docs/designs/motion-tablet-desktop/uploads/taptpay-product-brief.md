# TaptPay — Deep Product Brief (for design)

## The one-line
TaptPay turns any phone or tablet into a full payment terminal **and** a
purpose-built billing system for the way three very different industries actually
get paid — with card-processing fees a fraction of what legacy terminals and
invoicing tools charge, and zero hardware.

## Why this matters before we get to features
Most competitors force a business to bolt two things together: a **card terminal**
(Verifone, Square reader, Zeller) *and* a separate **invoicing / billing tool**
(Xero, a rent platform, a job-management app like Tradify or ServiceM8). You pay
for both, they don't talk to each other in real time, and you still pay 2–3%+ in
card fees on top. TaptPay collapses that entire stack into one app: the quote/
invoice/rent request **is** the payment, it settles in real time, and there's no
terminal to buy. That's the thing to keep front of mind — every feature below is
another place where "two disconnected products" becomes "one."

**Fees are the headline weapon:**
- Retail: **3.4% all-in** (2.9% Windcave + 0.5% platform) vs 4–6% typical EFTPOS.
- **Property & Trades: 0.3% platform fee.** That is the number that ends
  arguments. Rent platforms and tradie billing apps charge subscriptions *plus*
  card fees; TaptPay collects rent or a job balance for a rounding error.

Payment rails under everything: **QR scan-to-pay** and **NFC tap-to-phone**
(Apple Pay, Google Pay, Samsung Pay, contactless cards), settled through
**Windcave** (PCI-DSS), with **real-time Server-Sent-Event** status on both the
merchant and customer screens. iOS, Android, web.

---

# 1. Property Management  ← most important
The rent-and-recurring-billing vertical for landlords and property managers. This
is where TaptPay replaces an entire category of subscription software.

### Recurring rent automation
- **What:** the manager sets a rent schedule; a background cron generates and
  sends each rent invoice automatically on its due cycle.
- **How:** scheduled sends off `active_schedules`; each cycle spins up a fresh
  payment-link invoice with its own due date.
- **The edge:** dedicated rent platforms charge a monthly per-property fee to do
  exactly this. TaptPay does it for 0.3% and the tenant pays by **tapping their
  phone**, not setting up a bank AP that silently fails.

### Overdue-reminder engine (auto-resend)
- **What:** unpaid rent chases itself. A per-merchant policy controls *when* the
  first reminder fires and *how often* it repeats, up to a cap.
- **How:** `rentReminderEnabled / delayDays / intervalDays / maxCount` drive a
  dedicated cron pass — first reminder once `now ≥ dueAt + delayDays`, then a
  re-email every `intervalDays` until `maxCount` (0 = unlimited), tracking
  `lastReminderSentAt` and `reminderCount` so it never double-sends.
- **The edge:** landlords normally chase rent by hand via text and awkward calls.
  Competitors either don't automate this or bury it behind an enterprise tier.
  Here it's a toggle with three numbers, and it's honest (no duplicate sends,
  real batch reporting).

### Hosted checkout links + automatic reconciliation
- **What:** every invoice is a link; when the tenant pays by card, the invoice
  marks itself paid — no manual matching.
- **How:** dedicated rent checkout/callback routes; `finalizeRentInvoice()`
  settles **idempotently** (sets paid / paidAt / Windcave txn id, logs
  `Payment_Received`), safe against double-callbacks.
- **The edge:** the classic pain of "did that rent land, which tenant was it" —
  reconciling a bank feed against a spreadsheet — just disappears.

### WhatsApp delivery (not just email)
- **What:** send the rent link, reminders, and GST invoices over **WhatsApp** as
  well as email, per tenant preference.
- **How:** `deliverInvoice()` is channel-aware; a tenant with
  `preferredChannel: "whatsapp"` + a phone gets messaged on WhatsApp via a
  self-hosted Evolution API gateway, with email fallback.
- **The edge:** tenants ignore email; WhatsApp gets opened. Almost no rent tool
  meets tenants on the channel they actually read.

### Split the bill (flatmates)
- **What:** merchant enables split; the tenant divides rent **2–10 ways** at pay
  time, each flatmate paying their share on their own card and getting their own
  receipt.
- **The edge:** flat-share rent is a real-world mess everywhere else. Here it's
  native and each payer is settled independently.

### Directory, job/tenant profiles, event timeline, analytics
- Tenant directory, per-tenant profile with their invoice history and a full
  **event timeline**, plus a property analytics dashboard.
- **The edge:** an audit trail and portfolio view without exporting anything.

---

# 2. Trades  ← equally central, the newest and most differentiated
For plumbers, electricians, builders — the whole **quote → accept → deposit →
balance → complete** lifecycle, where the quote and the money are one object.

### The lifecycle is the product
- **What:** a quote, once accepted by the customer, *becomes a job* that parks in
  a home **stack**. Deposit and balance are two payment links hanging off that
  same job.
- **How:** reuses property's proven link/checkout/SSE machinery, so the whole
  chain is real-time and self-reconciling.
- **The edge:** job-management apps (Tradify, ServiceM8) track the job but then
  hand payment off to a separate processor. In TaptPay the **quote is the
  checkout** — accepting it can take a deposit on the spot.

### Auto-presented deposit link on acceptance
- **What:** the moment a customer accepts a deposit-enabled quote, the deposit
  payment link is shown to them immediately.
- **How:** quote-accept flow fires the deposit link into the same checkout.
- **The edge:** tradies chronically start work without a deposit because
  collecting one is friction. Here acceptance *is* the deposit prompt — money in
  before a tool comes out of the van.

### Quote builder (line items + smart toggles)
- **What:** add line items (description · qty · unit price via keypad), see a
  running total, then two toggles: **deposit** (% or $ → computed amount) and
  **recurring** (maintenance/retainer). Optionally attach a document, then send.
- **The edge:** a real estimating tool and the payment request in one screen —
  not a Word doc emailed off, then a separate invoice, then a separate card link.

### Quick Invoice path
- **What:** for callouts and agreed jobs — keypad → amount → pick client →
  optional job note → send. No quote step.
- **The edge:** covers the "just bill them" case in one tap while the full quote
  builder covers the formal case. Competitors usually force one mode.

### GST modes (Incl GST / + GST), done properly
- **What:** a trades merchant declares GST-registered and picks how prices show:
  **Incl GST** (line prices include GST) or **+ GST** (net prices, GST on top).
- **How:** 15% rate; `computeQuoteTotals` handles both modes; the chosen
  `gstMode` is **snapshotted onto each quote** so a later settings change never
  rewrites an old quote's maths. Not-registered merchants show no GST at all.
- **The edge:** this is the detail that makes it trustworthy to an accountant —
  correct, locked-in tax presentation, not a toggle that retroactively corrupts
  history.

### Merchant-branded Quote PDF
- **What:** a professional, server-generated PDF of the quote — the merchant's
  business name, line items, the chosen GST presentation — attached to the quote
  email and downloadable by both the merchant **and** the client from the public
  quote page.
- **The edge:** the customer gets a real quote document *and* a live "accept & pay
  deposit" link in the same message. Paper-quote tools can't take the money;
  payment tools can't produce the quote.

### Split the balance, recurring maintenance, client timeline
- Split works on the job balance too (2–10 ways). Recurring schedules cover
  maintenance/retainer billing. Every job carries a client profile + event
  timeline. Post-payment document is labelled **"Invoice"**, fee **0.3%**.

---

# 3. Retail  ← least important, keep brief
The straightforward point-of-sale flow for cafés, shops, markets, food trucks:
keypad to charge, stock/product management, transaction history + analytics,
and split-the-bill (2–10 ways, per-person receipts). All-in **3.4%**, no monthly
fee, no terminal. It's the familiar "tap or scan to pay" story — solid, but the
real story is Property and Trades above.

---

# Cross-cutting capabilities (every vertical inherits these)
- **QR + NFC tap-to-phone** — Apple Pay, Google Pay, Samsung Pay, contactless
  cards, with device feature-detection and graceful fallback. No reader dongle.
- **Real-time everywhere** — SSE pushes status to merchant and customer instantly;
  no refresh, no "did it go through?"
- **Split the bill** — merchant-gated, customer divides at pay time, each payer
  settled and receipted independently.
- **Refunds** — first-class flow with real-time notifications.
- **Web push notifications** — created / completed / failed / refunded, straight
  to the merchant's phone.
- **Receipts / invoices** — full business + GST detail, PDF download and native
  share.
- **Multi-endpoint ("stone") isolation** — unlimited independent payment points
  per merchant, each cryptographically isolated (no cross-merchant/cross-stone
  tampering), rate-limited and audit-logged.
- **Security** — JWT auth, strict per-merchant ownership checks, PCI-DSS card
  handling via Windcave, rate limiting, audit logging.

---

# The competitive frame to lead with
| Everyone else | TaptPay |
|---|---|
| Buy/rent a terminal | Your phone is the terminal |
| Terminal **+** separate invoicing/rent/job app | One app; the invoice *is* the payment |
| 4–6% card fees, or subscription **+** card fees | 3.4% retail · **0.3%** property & trades |
| Reconcile payments by hand | Invoices settle + mark paid automatically |
| Email-only chasing | Auto-reminders **and** WhatsApp delivery |
| Quote, then separately get paid | Accept-a-quote *is* pay-the-deposit |
| Generic one-size terminal | Purpose-built flows per industry |

**Positioning tone:** professional but plain-spoken, results-first (money saved,
admin killed), technology-forward without jargon, trust-heavy on security and
correct tax handling.
