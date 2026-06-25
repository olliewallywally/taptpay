# Trades GST Mode + Quote PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trades merchants set GST-registered + an incl/+GST price-display mode, and generate a merchant-branded quote PDF (email attachment + downloads) that reflects it.

**Architecture:** A framework-free `shared/trades-gst.ts` owns the GST/total math, shared by the server quote route and the client quote builder. A server `trades-quote-pdf.ts` (jsPDF, mirroring `server/pdf-generator.ts`) renders the PDF on demand, served by two routes (authed + public-by-token) and attached to the quote email via the existing Resend attachment path.

**Tech Stack:** TypeScript, Express, Drizzle/Neon, jsPDF, Resend, React (wouter, react-query), jest (client roots only — pure shared logic tested via `@shared`, server PDF verified with a `tsx` smoke).

---

## File Structure

- Create `shared/trades-gst.ts` — pure GST/total computation (`computeQuoteTotals`, `GST_RATE`, `GstMode`).
- Create `client/src/__tests__/trades-gst.test.ts` — jest unit tests for the above.
- Create `server/trades-quote-pdf.ts` — `generateQuotePdf(quote, client, merchant, baseUrl): Buffer`.
- Create `scripts/smoke-quote-pdf.ts` — tsx smoke check for the PDF generator.
- Create `migrations/0009_trades_gst_mode.sql` — additive columns.
- Modify `shared/schema.ts` — `merchants.tradeGstMode`, `quotes.gstMode`, `updateTradeGstSettingsSchema`, re-export `GST_RATE` from `trades-gst`.
- Modify `server/routes.ts` — gst-settings endpoints, `/api/auth/me` field, swap `computeQuoteTotals` to shared + snapshot `gstMode`, two PDF endpoints, attach PDF in quote send.
- Modify `server/email-service.ts` — optional `attachments` on `sendEmail`.
- Modify `server/trades-delivery.ts` — generate + attach PDF when a quote is emailed.
- Modify `client/src/pages/settings.tsx` — Trades GST card (registered toggle + mode).
- Modify `client/src/pages/trades/quote-builder.tsx` — mode-aware totals/labels + download button.
- Modify `client/src/pages/trades/quote-response.tsx` — download button.
- Modify `client/src/App.tsx` — add `tradeGstMode` to the auth user type.

---

## Task 1: Shared GST computation module

**Files:**
- Create: `shared/trades-gst.ts`
- Test: `client/src/__tests__/trades-gst.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// client/src/__tests__/trades-gst.test.ts
import { computeQuoteTotals } from '@shared/trades-gst';

const lines = [{ qty: 2, unitPriceCents: 5000 }, { qty: 1, unitPriceCents: 1500 }]; // sum = 11500

describe('computeQuoteTotals', () => {
  test('not registered: no GST, total = line sum', () => {
    expect(computeQuoteTotals(lines, { gstRegistered: false, gstMode: 'inclusive' }))
      .toEqual({ subtotalCents: 11500, gstCents: 0, totalCents: 11500, depositCents: null });
  });

  test('inclusive: GST is the portion within the line sum', () => {
    const t = computeQuoteTotals(lines, { gstRegistered: true, gstMode: 'inclusive' });
    expect(t.totalCents).toBe(11500);
    expect(t.gstCents).toBe(1500); // round(11500 - 11500/1.15)
    expect(t.subtotalCents).toBe(10000);
  });

  test('exclusive: GST added on top of the line sum', () => {
    const t = computeQuoteTotals(lines, { gstRegistered: true, gstMode: 'exclusive' });
    expect(t.subtotalCents).toBe(11500);
    expect(t.gstCents).toBe(1725); // round(11500 * 0.15)
    expect(t.totalCents).toBe(13225);
  });

  test('percent deposit is a fraction of the (mode-specific) total', () => {
    const t = computeQuoteTotals(lines, { gstRegistered: true, gstMode: 'exclusive', depositEnabled: true, depositType: 'percent', depositValue: 20 });
    expect(t.depositCents).toBe(2645); // round(13225 * 0.20)
  });

  test('fixed deposit is clamped to total', () => {
    const t = computeQuoteTotals(lines, { gstRegistered: false, gstMode: 'inclusive', depositEnabled: true, depositType: 'fixed', depositValue: 99999999 });
    expect(t.depositCents).toBe(11500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest client/src/__tests__/trades-gst.test.ts`
Expected: FAIL — cannot find module `@shared/trades-gst`.

- [ ] **Step 3: Write the implementation**

```ts
// shared/trades-gst.ts
export const GST_RATE = 0.15; // NZ GST

export type GstMode = 'inclusive' | 'exclusive';

export interface QuoteLine { qty: number; unitPriceCents: number; }

export interface QuoteTotalsInput {
  gstRegistered: boolean;
  gstMode: GstMode;
  depositEnabled?: boolean;
  depositType?: string;            // 'percent' | 'fixed'
  depositValue?: number | null;
}

export interface QuoteTotals {
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  depositCents: number | null;
}

export function computeQuoteTotals(lines: QuoteLine[], opts: QuoteTotalsInput): QuoteTotals {
  const lineSum = lines.reduce((s, li) => s + Math.round(li.qty * li.unitPriceCents), 0);

  let subtotalCents: number;
  let gstCents: number;
  let totalCents: number;

  if (!opts.gstRegistered) {
    subtotalCents = lineSum;
    gstCents = 0;
    totalCents = lineSum;
  } else if (opts.gstMode === 'exclusive') {
    subtotalCents = lineSum;
    gstCents = Math.round(lineSum * GST_RATE);
    totalCents = subtotalCents + gstCents;
  } else {
    totalCents = lineSum;
    gstCents = Math.round(totalCents - totalCents / (1 + GST_RATE));
    subtotalCents = totalCents - gstCents;
  }

  let depositCents: number | null = null;
  if (opts.depositEnabled && opts.depositType && opts.depositValue != null) {
    depositCents = opts.depositType === 'percent'
      ? Math.round(totalCents * (Math.min(100, Math.max(0, opts.depositValue)) / 100))
      : Math.min(opts.depositValue, totalCents);
  }

  return { subtotalCents, gstCents, totalCents, depositCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest client/src/__tests__/trades-gst.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/trades-gst.ts client/src/__tests__/trades-gst.test.ts
git commit -m "feat(trades): shared GST/total computation with inclusive+exclusive modes"
```

---

## Task 2: Schema fields, settings schema, migration

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0009_trades_gst_mode.sql`

- [ ] **Step 1: Add the merchant column** — in `shared/schema.ts`, in the `merchants` table right after `gstRegistered`:

```ts
  gstRegistered: boolean("gst_registered").notNull().default(false),
  // Trades quote price presentation: 'inclusive' (prices include GST) or
  // 'exclusive' (prices are net, GST added on top). Only meaningful when registered.
  tradeGstMode: text("trade_gst_mode").notNull().default("inclusive"),
```

- [ ] **Step 2: Add the quote snapshot column** — in the `quotes` table after `gstCents`:

```ts
  gstCents: integer("gst_cents").notNull().default(0),
  gstMode: text("gst_mode"), // snapshot of the merchant's mode at quote creation
```

- [ ] **Step 3: Re-export GST_RATE from the shared module** — replace the existing `export const GST_RATE = 0.15;` line in `shared/schema.ts` with:

```ts
export { GST_RATE } from "./trades-gst";
```

- [ ] **Step 4: Add the settings zod schema** — after `updateRentReminderSettingsSchema` / near `updateTradeReminderSettingsSchema`:

```ts
export const updateTradeGstSettingsSchema = z.object({
  gstRegistered: z.boolean().optional(),
  tradeGstMode: z.enum(["inclusive", "exclusive"]).optional(),
});
```

- [ ] **Step 5: Write the migration**

```sql
-- migrations/0009_trades_gst_mode.sql
-- Additive only: ADD COLUMN IF NOT EXISTS. No DROP / no ALTER TYPE.
BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS trade_gst_mode text NOT NULL DEFAULT 'inclusive';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS gst_mode text;

COMMIT;
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (GST_RATE still resolves for all importers via the re-export).

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/0009_trades_gst_mode.sql
git commit -m "feat(trades): GST mode columns + settings schema + migration 0009"
```

---

## Task 3: GST-settings endpoints + auth/me field

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import the new schema** — add `updateTradeGstSettingsSchema` to the existing `@shared/schema` import list in `server/routes.ts`.

- [ ] **Step 2: Expose tradeGstMode on `/api/auth/me`** — in the `/api/auth/me` handler, alongside `gstRegistered`:

```ts
    let gstRegistered = false;
    let tradeGstMode = "inclusive";
    if (merchantId) {
      const merchant = await storage.getMerchant(merchantId);
      onboardingCompleted = merchant?.onboardingCompleted ?? false;
      merchantStatus = merchant?.status ?? null;
      gstRegistered = merchant?.gstRegistered ?? false;
      tradeGstMode = merchant?.tradeGstMode ?? "inclusive";
    }
```

and add `tradeGstMode,` to the `user` object in the `res.json({ user: { ... } })`.

- [ ] **Step 3: Add the endpoints** — next to the trades reminder-settings routes:

```ts
  app.get("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({ gstRegistered: merchant.gstRegistered ?? false, tradeGstMode: merchant.tradeGstMode ?? "inclusive" });
    } catch (err) { console.error("[TRADES_GST_GET]", err); res.status(500).json({ message: "Failed to fetch GST settings" }); }
  });

  app.put("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const data = updateTradeGstSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchant(merchantId, data as any);
      res.json({ gstRegistered: merchant?.gstRegistered ?? false, tradeGstMode: merchant?.tradeGstMode ?? "inclusive" });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[TRADES_GST_PUT]", err); res.status(500).json({ message: "Failed to update GST settings" });
    }
  });
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(trades): GST settings GET/PUT + tradeGstMode on /api/auth/me"
```

---

## Task 4: Use shared computeQuoteTotals on the server + snapshot gstMode

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import the shared function** — add to the top imports of `server/routes.ts`:

```ts
import { computeQuoteTotals } from "@shared/trades-gst";
```

- [ ] **Step 2: Delete the local closure** — remove the local `function computeQuoteTotals(...) { ... }` definition (the ~17-line block that returns `{ subtotalCents, gstCents, totalCents, depositCents }`).

- [ ] **Step 3: Update the call site** — in the `POST /api/trades/quotes` handler, replace the existing call:

```ts
      const totals = computeQuoteTotals(lineItems, {
        gstRegistered: !!merchant?.gstRegistered,
        gstMode: (merchant?.tradeGstMode as 'inclusive' | 'exclusive') || 'inclusive',
        depositEnabled: parsed.data.depositEnabled,
        depositType: parsed.data.depositType,
        depositValue: parsed.data.depositValue,
      });
```

- [ ] **Step 4: Snapshot the mode onto the quote** — in the same handler's `storage.createQuote({ ... })` call, add:

```ts
        gstCents: totals.gstCents, totalCents: totals.totalCents,
        gstMode: merchant?.gstRegistered ? (merchant?.tradeGstMode || 'inclusive') : null,
```

(insert the `gstMode` line adjacent to the existing `gstCents`/`totalCents` fields).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "feat(trades): quote totals use shared GST module + snapshot gstMode"
```

---

## Task 5: Settings UI — Trades GST card

**Files:**
- Modify: `client/src/pages/settings.tsx`

- [ ] **Step 1: Add state + load** — inside the `Settings` component body, near the other `useState`/`useQuery` hooks:

```ts
  const [gstRegistered, setGstRegistered] = useState(false);
  const [tradeGstMode, setTradeGstMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  useEffect(() => {
    apiRequest('GET', '/api/trades/gst-settings')
      .then(r => r.json())
      .then(d => { setGstRegistered(!!d.gstRegistered); setTradeGstMode(d.tradeGstMode === 'exclusive' ? 'exclusive' : 'inclusive'); })
      .catch(() => {});
  }, []);
  const saveGst = (patch: { gstRegistered?: boolean; tradeGstMode?: 'inclusive' | 'exclusive' }) => {
    if (patch.gstRegistered !== undefined) setGstRegistered(patch.gstRegistered);
    if (patch.tradeGstMode) setTradeGstMode(patch.tradeGstMode);
    apiRequest('PUT', '/api/trades/gst-settings', patch).catch(() => toast({ title: 'Could not save GST setting', variant: 'destructive' }));
  };
```

- [ ] **Step 2: Add the card** — immediately after the closing `</div>` of the GST Number field block (the `<div>` containing `htmlFor="gstNumber"`):

```tsx
            <div className="mt-2 rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="!text-[#040D6D] font-semibold text-base block">GST registered (Trades)</Label>
                  <p className="text-sm text-gray-500 mt-1">Show GST on trades quotes and invoices.</p>
                </div>
                <Switch checked={gstRegistered} onCheckedChange={(v) => saveGst({ gstRegistered: v })} data-testid="switch-gst-registered" />
              </div>
              {gstRegistered && (
                <div className="mt-4">
                  <Label className="!text-[#040D6D] font-semibold text-sm block mb-2">Quote prices shown as</Label>
                  <div className="flex gap-2">
                    {(['inclusive', 'exclusive'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => saveGst({ tradeGstMode: m })}
                        className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tradeGstMode === m ? 'bg-[#040D6D] text-white' : 'bg-gray-100 text-gray-600'}`}
                        data-testid={`button-gst-mode-${m}`}
                      >
                        {m === 'inclusive' ? 'Incl GST' : '+ GST'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/settings.tsx
git commit -m "feat(trades): GST registered + incl/+GST mode toggle in settings"
```

---

## Task 6: Quote builder — mode-aware totals + labels

**Files:**
- Modify: `client/src/pages/trades/quote-builder.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add tradeGstMode to the auth type** — in `client/src/App.tsx`, in the auth user type that already has `gstRegistered?: boolean;`, add:

```ts
  gstRegistered?: boolean;
  tradeGstMode?: 'inclusive' | 'exclusive';
```

and where the context value is built (`gstRegistered: data?.user?.gstRegistered ?? false,`) add:

```ts
            tradeGstMode: data?.user?.tradeGstMode ?? 'inclusive',
```

- [ ] **Step 2: Use the shared computation** — in `quote-builder.tsx`, replace the `totals` `useMemo` body with the shared function:

```tsx
import { computeQuoteTotals } from "@shared/trades-gst";
// ...
  const gstMode = auth?.user?.tradeGstMode === 'exclusive' ? 'exclusive' : 'inclusive';
  const totals = useMemo(() => {
    const linesInput = lines.map(line => ({
      qty: Math.max(0, Number(line.qty) || 0),
      unitPriceCents: Math.max(0, Math.round((Number(line.unitPrice) || 0) * 100)),
    }));
    const t = computeQuoteTotals(linesInput, {
      gstRegistered: !!auth?.user?.gstRegistered,
      gstMode,
      depositEnabled,
      depositType: depositEnabled ? depositType : undefined,
      depositValue: depositEnabled ? (Number(depositValue) || 0) : undefined,
    });
    return { total: t.totalCents, gst: t.gstCents, net: t.subtotalCents, deposit: t.depositCents ?? 0 };
  }, [lines, auth?.user?.gstRegistered, gstMode, depositEnabled, depositType, depositValue]);
```

- [ ] **Step 3: Mode-aware labels** — replace the two GST summary rows in the totals card:

```tsx
          {!!auth?.user?.gstRegistered && <div style={totalRow}><span>{gstMode === 'exclusive' ? 'Subtotal' : 'Subtotal (excl. GST)'}</span><strong>{money(totals.net)}</strong></div>}
          {!!auth?.user?.gstRegistered && <div style={totalRow}><span>{gstMode === 'exclusive' ? 'GST (15%)' : 'GST (15%) included'}</span><span>{money(totals.gst)}</span></div>}
```

and change the Total row label:

```tsx
          <div style={{ ...totalRow, borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 14, marginTop: 8, fontSize: 19 }}><span>{gstMode === 'exclusive' && auth?.user?.gstRegistered ? 'Total (incl GST)' : 'Total'}</span><strong>{money(totals.total)}</strong></div>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/trades/quote-builder.tsx client/src/App.tsx
git commit -m "feat(trades): quote builder reflects incl/+GST mode"
```

---

## Task 7: PDF generator module

**Files:**
- Create: `server/trades-quote-pdf.ts`
- Create: `scripts/smoke-quote-pdf.ts`

- [ ] **Step 1: Write the generator**

```ts
// server/trades-quote-pdf.ts
import { jsPDF } from 'jspdf';

const money = (cents: number) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format((cents || 0) / 100);
const fmtDate = (v: Date | string | null | undefined) => v ? new Date(v).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export function generateQuotePdf(quote: any, client: any, merchant: any, baseUrl: string): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  const ensure = (need: number) => { if (y + need > pageH - margin) { doc.addPage(); y = margin; } };
  const text = (s: string, size: number, opts: { x?: number; align?: 'left' | 'right'; bold?: boolean; color?: number } = {}) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setTextColor(opts.color ?? 30);
    const x = opts.x ?? margin;
    doc.text(s, opts.align === 'right' ? pageW - margin : x, y, { align: opts.align ?? 'left' });
  };

  // Header — merchant brand
  text(merchant.businessName || merchant.name || 'Quote', 20, { bold: true });
  y += 7;
  const contact = [merchant.contactEmail || merchant.email, merchant.contactPhone || merchant.phone].filter(Boolean).join('  ·  ');
  if (contact) { text(contact, 10, { color: 110 }); y += 5; }
  if (merchant.gstRegistered && merchant.gstNumber) { text(`GST ${merchant.gstNumber}`, 10, { color: 110 }); y += 5; }

  // Title block
  y += 6;
  text('QUOTE', 16, { bold: true });
  text(`Ref ${String(quote.token || '').slice(0, 8).toUpperCase()}`, 10, { align: 'right', color: 110 });
  y += 6;
  text(`Date: ${fmtDate(quote.createdAt || new Date())}`, 10, { color: 110 });
  if (quote.validUntil) { text(`Valid until: ${fmtDate(quote.validUntil)}`, 10, { align: 'right', color: 110 }); }
  y += 8;

  // Bill-to
  text('Quote for', 9, { bold: true, color: 110 }); y += 5;
  text(`${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(), 11); y += 5;
  if (client.siteAddress) { text(client.siteAddress, 10, { color: 110 }); y += 6; }
  y += 2;

  // Line items
  doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 6;
  text('Description', 9, { bold: true, color: 110 });
  text('Amount', 9, { bold: true, color: 110, align: 'right' });
  y += 6;
  for (const li of (quote.lineItems || [])) {
    ensure(8);
    text(`${li.description ?? ''}`, 10);
    text(money(li.lineTotalCents ?? 0), 10, { align: 'right' });
    y += 5;
    text(`${li.qty} × ${money(li.unitPriceCents ?? 0)}`, 8, { color: 150 });
    y += 6;
  }

  // Totals
  ensure(34);
  doc.line(margin, y, pageW - margin, y); y += 7;
  const exclusive = quote.gstMode === 'exclusive';
  if (quote.gstCents) {
    text(exclusive ? 'Subtotal' : 'Subtotal (excl. GST)', 10, { color: 110 });
    text(money(quote.subtotalCents), 10, { align: 'right' }); y += 6;
    text(exclusive ? 'GST (15%)' : 'GST (15%) included', 10, { color: 110 });
    text(money(quote.gstCents), 10, { align: 'right' }); y += 6;
  }
  text(exclusive && quote.gstCents ? 'Total (incl GST)' : 'Total', 12, { bold: true });
  text(money(quote.totalCents), 12, { bold: true, align: 'right' }); y += 8;
  if (quote.depositEnabled && quote.depositCents) {
    text('Deposit due on acceptance', 10, { color: 110 });
    text(money(quote.depositCents), 10, { align: 'right' }); y += 7;
  }

  // Notes
  if (quote.notes) {
    ensure(16); y += 4;
    text('Notes', 9, { bold: true, color: 110 }); y += 5;
    for (const line of doc.splitTextToSize(String(quote.notes), pageW - margin * 2)) { ensure(6); text(line, 10, { color: 80 }); y += 5; }
  }

  // Footer
  const acceptUrl = `${baseUrl}/trades/quote/${quote.token}`;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Accept online: ${acceptUrl}`, margin, pageH - 14);
  doc.text('Powered by TaptPay', pageW - margin, pageH - 14, { align: 'right' });

  return Buffer.from(doc.output('arraybuffer'));
}
```

- [ ] **Step 2: Write the smoke script**

```ts
// scripts/smoke-quote-pdf.ts
import { generateQuotePdf } from '../server/trades-quote-pdf';

const quote = {
  token: 'abcdef1234567890', createdAt: new Date(), validUntil: new Date(),
  lineItems: [{ description: 'Labour', qty: 8, unitPriceCents: 9000, lineTotalCents: 72000 },
              { description: 'Materials', qty: 1, unitPriceCents: 25000, lineTotalCents: 25000 }],
  subtotalCents: 84348, gstCents: 12652, totalCents: 97000, gstMode: 'inclusive',
  depositEnabled: true, depositCents: 19400, notes: 'Thanks for the opportunity.',
};
const client = { firstName: 'Jane', lastName: 'Doe', siteAddress: '12 Queen St, Auckland' };
const merchant = { businessName: 'Ace Plumbing', email: 'ace@x.co.nz', phone: '021 555 0000', gstRegistered: true, gstNumber: '123-456-789' };

const buf = generateQuotePdf(quote as any, client as any, merchant as any, 'https://taptpay.co.nz');
const ok = buf.subarray(0, 4).toString() === '%PDF' && buf.length > 800;
console.log(ok ? `PDF OK (${buf.length} bytes)` : 'PDF FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 3: Run the smoke check**

Run: `npx tsx scripts/smoke-quote-pdf.ts`
Expected: prints `PDF OK (<n> bytes)` and exits 0.

- [ ] **Step 4: Commit**

```bash
git add server/trades-quote-pdf.ts scripts/smoke-quote-pdf.ts
git commit -m "feat(trades): server-side quote PDF generator (jsPDF)"
```

---

## Task 8: PDF endpoints (authed + public-by-token)

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import the generator + base-url helper** — at the top of `server/routes.ts`:

```ts
import { generateQuotePdf } from "./trades-quote-pdf";
```
(`getBaseUrl` is already imported/used in the trades routes.)

- [ ] **Step 2: Add a shared helper + both routes** — near the other `/api/trades/quotes` routes:

```ts
  async function streamQuotePdf(quote: any, req: any, res: any) {
    const [client, merchant] = await Promise.all([
      storage.getClientProfile(quote.clientProfileId),
      storage.getMerchant(quote.merchantId),
    ]);
    if (!client || !merchant) return res.status(404).json({ message: "Quote data unavailable" });
    const pdf = generateQuotePdf(quote, client, merchant, getBaseUrl(req));
    const ref = String(quote.token || "").slice(0, 8).toUpperCase();
    const safeName = (merchant.businessName || "quote").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="quote-${safeName}-${ref}.pdf"`);
    res.send(pdf);
  }

  app.get("/api/trades/quotes/:id/pdf", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const quote = await storage.getQuote(req.params.id);
      if (!quote || quote.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      await streamQuotePdf(quote, req, res);
    } catch (err) { console.error("[TRADES_QUOTE_PDF]", err); res.status(500).json({ message: "Failed to generate PDF" }); }
  });

  app.get("/api/trades/quotes/token/:token/pdf", async (req, res) => {
    try {
      const quote = await storage.getQuoteByToken(req.params.token);
      if (!quote) return res.status(404).json({ message: "Not found" });
      await streamQuotePdf(quote, req, res);
    } catch (err) { console.error("[TRADES_QUOTE_PDF_TOKEN]", err); res.status(500).json({ message: "Failed to generate PDF" }); }
  });
```

- [ ] **Step 3: Confirm `getQuoteByToken` exists** — Run: `grep -n "getQuoteByToken" server/storage.ts`. Expected: a method exists (used by the existing public quote route). If it does not, use the same lookup the existing `GET /api/trades/quotes/token/:token` route uses.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(trades): quote PDF endpoints (merchant + public token)"
```

---

## Task 9: Email attachment support + attach PDF to quote email

**Files:**
- Modify: `server/email-service.ts`
- Modify: `server/trades-delivery.ts`

- [ ] **Step 1: Add attachments to the email type + Resend call** — in `server/email-service.ts`:

```ts
interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
}
```

and in the Resend send call add the field:

```ts
    const { error } = await resend.emails.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
      ...(params.attachments ? { attachments: params.attachments } : {}),
    } as Parameters<typeof resend.emails.send>[0]);
```

- [ ] **Step 2: Generate + attach the PDF when emailing a quote** — in `server/trades-delivery.ts`, in `sendTradeQuote`, after loading `quote/client/merchant` and before `deliver(...)`, build an attachment for the email channel and pass it through. Import the generator at the top:

```ts
import { generateQuotePdf } from './trades-quote-pdf';
```

Then thread an optional attachment into the email path. The simplest seam: extend the local `quoteCopy(...)`/`deliver(...)` email branch to accept attachments. Concretely, in `sendTradeQuote` compute:

```ts
  const ref = String(quote.token || '').slice(0, 8).toUpperCase();
  const pdf = generateQuotePdf(quote, client, merchant, baseUrl);
  const attachments = [{ filename: `quote-${ref}.pdf`, content: pdf }];
```

and pass `attachments` into the email send used by the email channel (add an optional `attachments` parameter to the internal `deliver` email branch / `sendEmail` call so non-email channels ignore it).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 4: Manual smoke (optional, dev)**

Run the dev server, send a quote over the email channel, and confirm the log shows the email send with an attachment (or, with Resend configured, that the email arrives with the PDF attached).

- [ ] **Step 5: Commit**

```bash
git add server/email-service.ts server/trades-delivery.ts
git commit -m "feat(trades): attach the generated PDF to quote emails"
```

---

## Task 10: Client download buttons

**Files:**
- Modify: `client/src/pages/trades/quote-builder.tsx`
- Modify: `client/src/pages/trades/quote-response.tsx`

- [ ] **Step 1: Merchant download (authed blob)** — in `quote-builder.tsx`, on the `created` success screen, add a button beside "Copy link":

```tsx
        <button onClick={async () => {
          const r = await fetch(`/api/trades/quotes/${created.id}/pdf`, { headers: { ...tradesHeaders() } });
          if (!r.ok) return;
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `quote-${String(created.token).slice(0,8)}.pdf`; a.click();
          URL.revokeObjectURL(url);
        }} style={{ ...buttonStyle, marginTop: 12, background: '#fff', color: T.INK, border: `1px solid rgba(26,29,33,.16)` }}>Download PDF</button>
```

- [ ] **Step 2: Client download (public link)** — in `quote-response.tsx`, in the open-quote view (before the accept/decline buttons), add:

```tsx
    <a href={`/api/trades/quotes/token/${token}/pdf`} style={{ ...actionStyle, display: "block", textAlign: "center", textDecoration: "none", background: "transparent", color: T.ACCENT, border: `1px solid ${T.ACCENT}`, marginTop: 12 }}>Download PDF</a>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/trades/quote-builder.tsx client/src/pages/trades/quote-response.tsx
git commit -m "feat(trades): download-PDF buttons on quote builder + public quote page"
```

---

## Final verification

- [ ] `npx jest client/src/__tests__/trades-gst.test.ts` — PASS
- [ ] `npx tsx scripts/smoke-quote-pdf.ts` — `PDF OK`
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run build` — succeeds
- [ ] Manual: in Settings toggle GST registered + `+ GST`; build a quote and confirm the totals show "Subtotal / GST (15%) / Total (incl GST)"; download the PDF from both the merchant screen and the public quote page; confirm the emailed quote carries the attachment (Resend configured).

## Operational note
Apply `migrations/0009_trades_gst_mode.sql` to the database (additive). Joins `0008` on the trades "to finish / apply to DB" list.
