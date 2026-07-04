# Trades GST Mode + Quote PDF Export — Design Spec

Date: 2026-06-23
Branch context: `feat/trades-phase3c-cross-cutting`

## 1. Overview

Two related additions to the trades vertical, sequenced so the second consumes
the first:

1. **Trades GST settings** — let a trades merchant declare whether they're GST
   registered and choose how prices are presented on quotes: **Incl GST**
   (GST-inclusive line prices, today's behaviour) or **+ GST** (GST-exclusive
   line prices, GST added on top). Surfaces a real gap: `gstRegistered` is
   currently never writable, so all GST features are dormant.
2. **Quote PDF export** — a server-generated, merchant-branded PDF of a quote,
   attached to the quote email and downloadable by the merchant and the client.
   It renders the GST presentation chosen in (1).

## 2. Goals & non-goals

**Goals**
- A trades merchant can set GST-registered on/off and price-display mode in Settings.
- Quote totals + labels reflect the chosen mode, consistently in the app and the PDF.
- A professional, merchant-branded quote PDF is generated server-side from quote
  data, attached to the quote email, and downloadable from the merchant quote
  screen and the public client quote page.

**Non-goals (deferred)**
- Logo image embedding in the PDF (text business-name header for v1).
- Custom PDF templates / theming beyond merchant name + "Powered by TaptPay".
- Persisting/storing the generated PDF (generated on demand).
- Changing how quick invoices are entered (they're entered as the final charge;
  GST mode is a quote-presentation concern only).

## 3. Part 1 — Trades GST settings

### 3.1 Data model
- `merchants.tradeGstMode text default 'inclusive'` — `'inclusive' | 'exclusive'`.
- `merchants.gstRegistered` already exists (boolean) — this work adds the setter.
- `quotes.gstMode text` (nullable) — **snapshot** of the mode at quote creation so
  the PDF/labels stay correct even if the merchant later flips the setting. The
  numeric breakdown (`subtotalCents`/`gstCents`/`totalCents`) is already persisted.
- Migration `0009_trades_gst_mode.sql` — additive only (`ADD COLUMN IF NOT EXISTS`).

### 3.2 GST computation (15%, `GST_RATE = 0.15`)
`computeQuoteTotals` gains a `gstMode` argument. With `subtotal`/`gst`/`total` in cents:

- **Inclusive** (line prices include GST):
  `total = Σ(line totals)`; `gst = registered ? total − total/(1+rate) : 0`;
  `subtotal = total − gst`.
- **Exclusive** (line prices are net):
  `subtotal = Σ(line totals)`; `gst = registered ? round(subtotal × rate) : 0`;
  `total = subtotal + gst`.
- **Not registered**: `gst = 0`, `subtotal = total = Σ(line totals)` (mode irrelevant).
- **Deposit** (unchanged): percent → `round(total × pct/100)`; fixed → `min(value, total)`.

In both modes `total` is the GST-inclusive amount the client pays, so deposits,
job invoices, and the payment receipt are unchanged. The GST portion inside any
charge remains `total × 3/23`.

### 3.3 Settings UI (`client/src/pages/settings.tsx`, Trades area)
- **GST registered** toggle.
- When on: a segmented **Incl GST / + GST** control.
- Optimistic update mirroring the existing trades reminder-settings toggle pattern.

### 3.4 API
- `GET /api/trades/gst-settings` → `{ gstRegistered, tradeGstMode }`.
- `PUT /api/trades/gst-settings` (zod `updateTradeGstSettingsSchema`:
  `{ gstRegistered?: boolean; tradeGstMode?: 'inclusive' | 'exclusive' }`).
- `/api/auth/me` also returns `tradeGstMode` alongside the existing `gstRegistered`
  so the quote builder reads both.

### 3.5 Quote builder (`client/src/pages/trades/quote-builder.tsx`)
- Read `tradeGstMode` from auth; compute totals mirroring §3.2.
- Labels: **inclusive** → "Subtotal (excl GST)", "GST (15%) included", "Total";
  **exclusive** → "Subtotal", "GST (15%)", "Total (incl GST)".
- Quote creation snapshots `gstMode` onto the quote row server-side.

## 4. Part 2 — Quote PDF export

### 4.1 Generator — `server/trades-quote-pdf.ts`
`generateQuotePdf(quote, client, merchant): Buffer` using jsPDF, mirroring the
`addText/addLine` helper style in `server/pdf-generator.ts`. Paginates (adds a
page) when line items overflow the page.

### 4.2 Layout (merchant-branded)
- Header: business name (large), contact email/phone, GST number if registered.
- Title block: "QUOTE", reference (short token), created date + "valid until".
- Bill-to: client name + site address.
- Line-item table: description · qty · unit price · line total.
- Totals: per §3.2 mode, using the quote's snapshot `gstMode`; deposit due on
  acceptance if enabled.
- Notes if present.
- Footer: online accept link (`/trades/quote/<token>`) + small "Powered by TaptPay".

### 4.3 Endpoints
- `GET /api/trades/quotes/:id/pdf` — auth + merchant-scoped (merchant button).
- `GET /api/trades/quotes/token/:token/pdf` — public by token (client page button).
- Both stream `application/pdf` with `Content-Disposition: attachment;
  filename="quote-<business>-<ref>.pdf"`.

### 4.4 Email attachment
- Extend `EmailParams` (`server/email-service.ts`) with optional
  `attachments?: { filename: string; content: Buffer }[]`, passed through to
  `resend.emails.send` (the board-builder path already proves Resend attachments).
- `sendTradeQuote` generates the PDF and attaches it when the channel is email.

### 4.5 Client buttons
- `quote-builder.tsx` success screen → "Download PDF" (authed `fetch` → blob download).
- `quote-response.tsx` public page → "Download PDF" (direct tokened link).

## 5. Testing
- `generateQuotePdf` returns a `%PDF`-headed, non-empty Buffer across: inclusive
  vs exclusive, GST registered on/off, deposit percent/fixed, many line items
  (pagination), no notes.
- `computeQuoteTotals` unit tests for both modes incl. rounding and not-registered.
- Route tests: 200 + `application/pdf` for valid quote; 404 for missing/foreign
  quote (authed) and unknown token (public).
- GST-settings PUT validates the enum and persists.

## 6. Reuse map
- jsPDF + `addText/addLine` helper style from `server/pdf-generator.ts`.
- Resend attachment path from `sendBoardBuilderEmail`.
- `GST_RATE` from `shared/schema`.
- Settings-toggle + `GET/PUT` pattern from the trades reminder-settings endpoints.
- Public-by-token route pattern from the existing `/api/trades/quotes/token/:token`.

## 7. Build order
1. Migration `0009`, schema fields, `updateTradeGstSettingsSchema`.
2. `gst-settings` endpoints + `/api/auth/me` field + mode-aware `computeQuoteTotals`.
3. Settings UI + quote-builder labels/computation.
4. `trades-quote-pdf.ts` + the two PDF endpoints.
5. Email-attachment threading + `sendTradeQuote` attaches the PDF.
6. Client download buttons.

## 8. Operational note
Migration `0009` must be applied to the database (additive). Tracked alongside the
pending `0008` in the trades-phase3c "to finish" items.
