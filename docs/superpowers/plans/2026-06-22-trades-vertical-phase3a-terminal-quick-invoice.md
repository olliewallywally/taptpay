# Trades Vertical — Phase 3a (Terminal + Quick Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Trades terminal functional for the *quick-invoice* path — pick/create a client, key an amount, send a one-tap payment request (`kind: 'full'`), see it land in the home stack, and mark it paid externally — by porting the property terminal's chrome and rewiring it to the already-shipped `/api/trades/*` endpoints and `TRADES_THEME`.

**Architecture:** Port `client/src/pages/property/property-terminal.tsx` (1753 lines) into the existing Phase-2 shell `client/src/pages/trades/trades-terminal.tsx` via an explicit copy-and-transform recipe, then **strip to 3a scope** (home stack · ChooseClient · keypad · QuickInvoice · MarkExternal · success · basic row action sheet). The quote builder, deposit/balance lifecycle, recurring schedules, GST, and the 0.3% fee are **Phase 3b/3c** — the `quote` action-bar slot is rendered but stubbed. A new `client/src/lib/trades-api.ts` mirrors `property-api.ts`.

**Tech Stack:** React + TypeScript, `wouter`, `@tanstack/react-query`, inline-style design tokens, the shared `tp-*` terminal CSS (defined in `SmartTransitions.jsx` + the file-local `TP_TERM_CSS`).

## Global Constraints

- **Branch:** Build on a branch off `feat/trades-phase2-nav` (PR #5). Name it `feat/trades-phase3a-terminal`. Phase 3a depends on Phase 2's `TRADES_THEME`, routes, and shells. Target the Phase-3a PR at `feat/trades-phase2-nav` so its diff is 3a-only (retarget to `main` once PRs #4 and #5 merge — same stacking discipline as Phase 2).
- **NEVER run `npm run db:push`** — Phase 3a touches zero schema. The DB and all `/api/trades/*` routes + storage already exist (Phase 1).
- **Verification gate per task:** `npm run check` (tsc) must add ZERO new errors. **Baseline is 42 pre-existing errors** in unrelated files. Confirm the count stays 42 and that no error references a trades file. There is no working unit-test runner (pre-existing jest JSX-transpile failure); "tests" for this UI phase = tsc clean + the route renders without console errors.
- **Theme tokens, one-place edit:** every trades colour comes from `TRADES_THEME` (`client/src/lib/trades-theme.ts`, Phase 2). No hard-coded property hex (`#040D6D`, `#58ABFF`, etc.) may survive the port.
- **Copy:** vertical = **Trades**; the post-payment doc is **"Invoice"** (never "Receipt"). Home headline = **"outstanding"** over job value. Empty state = "tap + to send an invoice".
- **Watch out:** a Replit Agent auto-checkpoint can commit `.claude-home/` churn onto your branch tip. Before pushing, `git log` the tip and `git reset --mixed` any non-yours checkpoint commit off the branch (this happened in Phase 2).

## Reference facts (verified against the codebase 2026-06-22)

**`POST /api/trades/invoices`** body (Zod `createJobInvoiceSchema`, `shared/schema.ts:1114`):
`{ clientProfileId: uuid, amountCents: int>0, deliveryChannel: 'email'|'whatsapp'|'sms', dueAt: ISO-string, kind?: 'deposit'|'balance'|'full'|'recurring' (default 'full'), quoteId?, jobDetails?: string≤500, splitEnabled?, documentUrl?, documentName? }` → 201 with the created job-invoice row.

**`POST /api/trades/clients`** body (Zod `createClientProfileSchema`, `shared/schema.ts:1087`):
`{ firstName, lastName, email?, phone?, siteAddress (required, 1–200), notes?≤1000, preferredChannel?: 'email'|'whatsapp'|'sms' (default 'email') }` → 201 with client row.

**`GET /api/trades/clients`** → `[client]`. **`GET /api/trades/invoices?status=&clientProfileId=`** → `[jobInvoice]`. **`POST /api/trades/invoices/:id/mark-paid-external`** body `{ externalPaymentReference?: string }` → updated row.

Job-invoice statuses (from spec §5): `pending_dispatch · dispatched · viewed · deposit_paid · balance_due · paid · paid_external · voided · dispatch_failed`. The `amountCents` field is canonical (no `owingCents`/`splitPaidCount` in 3a — those are split-flow fields, out of 3a scope).

**Property mutation pattern to mirror** (`property-terminal.tsx:1275` `markMutation`, `:1172` `sendMutation`): POST with `{ 'Content-Type': 'application/json', ...tradesHeaders() }`, `dueAt: due.toISOString()` where `due = now + 7 days`.

---

### Task 1: `trades-api.ts` fetch helpers

**Files:**
- Create: `client/src/lib/trades-api.ts`

**Interfaces:**
- Produces: `tradesHeaders(): HeadersInit` and `tradesFetch(url, init?): Promise<Response>` — byte-for-byte the property helper with trades naming. Consumed by `trades-terminal.tsx` (Task 2+).

- [ ] **Step 1: Create the file**

```ts
// Shared fetch helpers for the trades pages — mirrors property-api.ts.
// tradesHeaders() attaches the bearer token. tradesFetch() additionally catches
// a 401 (session expired mid-use) and bounces to /login with a returnTo.
export function tradesHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let redirecting = false;

export async function tradesFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...tradesHeaders() } });
  if (res.status === 401) {
    if (!redirecting) {
      redirecting = true;
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?returnTo=${returnTo}`;
    }
    throw new Error('unauthorized');
  }
  return res;
}
```

- [ ] **Step 2: Verify** — `npm run check 2>&1 | grep "trades-api" || echo "clean"` → `clean`
- [ ] **Step 3: Commit** — `git add client/src/lib/trades-api.ts && git commit -m "feat(trades): trades-api fetch helpers (tradesFetch/tradesHeaders)"`

---

### Task 2: Copy the property terminal into the Phase-2 shell

**Files:**
- Overwrite: `client/src/pages/trades/trades-terminal.tsx` (currently the Phase-2 stub)

The Phase-2 `trades-terminal.tsx` is a placeholder. Replace it wholesale with a copy of the property terminal, which Tasks 3–8 then transform. Copying first (rather than hand-porting) preserves the conveyor animation, `TP_TERM_CSS`, and `tp-*` chrome exactly.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp client/src/pages/property/property-terminal.tsx client/src/pages/trades/trades-terminal.tsx
```

- [ ] **Step 2: Rename the default export** — in `trades-terminal.tsx`, change `export default function PropertyTerminal()` → `export default function TradesTerminal()`.

- [ ] **Step 3: Verify it still compiles as a copy** (imports resolve from the new location since both use `@/` aliases). The file imports `propFetch from "@/lib/property-api"` — that still resolves; it's swapped in Task 4.

Run: `npm run check 2>&1 | grep -c "error TS"` → expect `42` (copy introduces no new errors; it's valid TS).

- [ ] **Step 4: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "chore(trades): seed trades-terminal from property terminal (pre-transform)"`

---

### Task 3: Swap theme tokens to `TRADES_THEME`

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

The copy declares local `const NAVY/BLUE/OFFW/GREEN/RED/AMBER` at the top (≈ lines 7–12). Replace that block with a `TRADES_THEME` mapping so every existing `NAVY`/`BLUE` reference in the file keeps working but now resolves to trades colours — a minimal, low-risk swap (no need to touch the hundreds of `NAVY`/`BLUE` usages individually).

- [ ] **Step 1: Add the import** at the top of the file (with the other imports):

```tsx
import { TRADES_THEME } from "@/lib/trades-theme";
```

- [ ] **Step 2: Replace the `/* ═══ TOKENS ═══ */` constant block** (the six `const NAVY = …` … `const AMBER = …` lines) with:

```tsx
/* ═══ TOKENS (trades palette via TRADES_THEME — see trades-theme.ts) ═══ */
const NAVY  = TRADES_THEME.INK;    // charcoal base (was property NAVY)
const BLUE  = TRADES_THEME.ACCENT; // safety amber (was property BLUE)
const OFFW  = TRADES_THEME.OFFW;
const GREEN = TRADES_THEME.GREEN;
const RED   = TRADES_THEME.RED;
const AMBER = TRADES_THEME.AMBER;
```

- [ ] **Step 3: Grep for stray property hex** that bypassed the constants:

Run: `grep -nE "#040D6D|#58ABFF" client/src/pages/trades/trades-terminal.tsx || echo "clean"`
Expected: `clean`. If any remain (e.g. inline `stroke="#040D6D"`), replace `#040D6D`→`TRADES_THEME.INK` and `#58ABFF`→`TRADES_THEME.ACCENT`. (Note: `rgba(4,13,109,…)` / `rgba(88,171,255,…)` literals inside `TP_TERM_CSS` and `SplitPill` are acceptable to leave for 3a — they're the chrome's subtle tints; a full token sweep of the CSS string is a 3c polish item. Record any left behind in the PR description.)

- [ ] **Step 4: Verify** — `npm run check 2>&1 | grep "trades-terminal" || echo "clean"` → `clean`
- [ ] **Step 5: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): terminal uses TRADES_THEME tokens"`

---

### Task 4: Rewire data layer to `/api/trades/*` (endpoints, fetch, field names)

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

Swap the property API for trades. The terminal has: a top-level `propHeaders()` (≈line 1106), four `useQuery` blocks (≈1147–1169), and several mutations using `propFetch`/`fetch('/api/property/…')`. 3a keeps only the **invoices** and **clients** data; **schedules** and **reminder-settings** queries are removed (3c).

- [ ] **Step 1: Imports** — change `import { propFetch } from "@/lib/property-api";` → `import { tradesFetch } from "@/lib/trades-api";`. Delete the file-local `function propHeaders()` (≈line 1106) and instead add to the imports: `import { tradesHeaders } from "@/lib/trades-api";`. (Consolidate to one import line: `import { tradesFetch, tradesHeaders } from "@/lib/trades-api";`.)

- [ ] **Step 2: Replace the data queries** — replace the `tenants`, `invoices`, `schedules`, and `reminderSettings` `useQuery` blocks with just these two:

```tsx
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/clients'],
    queryFn: () => tradesFetch('/api/trades/clients').then(r => r.ok ? r.json() : []),
    staleTime: 60000, retry: false,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/invoices'],
    queryFn: () => tradesFetch('/api/trades/invoices').then(r => r.ok ? r.json() : []),
    staleTime: 30000, retry: false,
  });
```

- [ ] **Step 3: Global rename within the file** — `tenants` → `clients`, `tenant`/`Tenant` → `client`/`Client` (variable names, helper names `tenantInitials`→`clientInitials`, `tenantName`→`clientName`, `selectedTenant`→`selectedClient`, `handleTenantSelect`→`handleClientSelect`), and `tenantProfileId` → `clientProfileId` in every request body. Use editor find-replace; then grep to confirm: `grep -nE "tenant|propFetch|propHeaders|/api/property" client/src/pages/trades/trades-terminal.tsx || echo "clean"` → must be `clean` (any leftover means an endpoint/field/name wasn't swapped). The home-stack row reads `inv.tenantName` — change to `inv.clientName`.

- [ ] **Step 4: Point mutations at trades endpoints** — for the mutations 3a keeps (`markMutation` only; others are removed in Task 6), change `/api/property/invoices/...` → `/api/trades/invoices/...` and `...propHeaders()` → `...tradesHeaders()`, `propFetch(` → `tradesFetch(`.

- [ ] **Step 5: Verify** — `npm run check 2>&1 | grep "trades-terminal"` (there WILL be errors here referencing removed screens/mutations — that's expected; Tasks 5–6 delete their call sites. Confirm errors are only "Cannot find name 'sendMutation'/'billMutation'/'schedules'/etc." and nothing about `/api/property`.)
- [ ] **Step 6: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): rewire terminal data layer to /api/trades (clients + invoices)"`

---

### Task 5: Reconfigure the action bar (clients · quote · invoice · external) + quote stub

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

Property's SUBBAR is `tenants · send · bill · external`. Trades 3a = `clients · quote · invoice · external`. `quote` is rendered but stubbed (a toast) until Phase 3b; `invoice` is the QuickInvoice path (Task 6).

- [ ] **Step 1: Replace `SUBBAR_ITEMS` and its maps**:

```tsx
const SUBBAR_ITEMS = [
  { id: 'clients',  label: 'clients',  Icon: Ic.Person   },
  { id: 'quote',    label: 'quote',    Icon: Ic.Receipt  },
  { id: 'invoice',  label: 'invoice',  Icon: Ic.Send     },
  { id: 'external', label: 'external', Icon: Ic.External },
];
const SCREEN_TO_SUBBAR: Record<string, number> = { clients: 0, quote: 1, invoice: 2, external: 3 };
const SUBBAR_ROUTE: Record<number, string> = { 0: 'clients', 1: 'quote', 2: 'invoice', 3: 'external' };
```

- [ ] **Step 2: Stub the quote slot** — in the subbar pick handler (`handleSubbarPick`, which maps an index → `go(SUBBAR_ROUTE[i])`), special-case `quote`:

```tsx
  const handleSubbarPick = (i: number) => {
    const dest = SUBBAR_ROUTE[i];
    if (dest === 'quote') { toast('quotes land in Phase 3b'); return; }
    if ((dest === 'invoice' || dest === 'external') && !selectedClient) {
      setPendingDest(dest as any);
      if (screen === 'home') triggerConveyor(screen, 'up');
      setContentKey(k => k + 1);
      setScreen('clients');
      return;
    }
    go(dest);
  };
```

(Adapt to the existing handler's exact shape — the property version routes `tenants/send/bill/external`; replace its body with the above. The `pendingDest` type union should be `'invoice' | 'external' | null`.)

- [ ] **Step 3: Verify** — `npm run check 2>&1 | grep "trades-terminal"` → still only the expected "removed screen" errors from Task 4 (resolved in Task 6).
- [ ] **Step 4: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): action bar clients·quote·invoice·external (quote stubbed)"`

---

### Task 6: QuickInvoice screen — replace send/bill/batch with one invoice path

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

Collapse property's three send paths (`SendRentLink`, `ChargeBill`, `BatchAndAutoScreen`) into a single **QuickInvoice** screen: the kept keypad (`RentAmount`, rename to `AmountKeypad`) → a lightweight confirm screen with optional job note + channel, sending `kind: 'full'`. Remove the charge-type/split/automation machinery (3b/3c).

- [ ] **Step 1: Delete out-of-scope screens & state** — remove the `SendRentLink`, `ChargeBill`, `BatchAndAutoScreen`, and `AutomateScreen` component functions and the charge/split/frequency state (`chargeType`, `chargeLabel`, `dueSel`, `chargeDocUrl`, `chargeDocName`, `uploadingDoc`, `frequency`, `splitMode`, `busyScheduleId`), the `CHARGE_TYPES`/`CHARGE_PRESETS`/`DUE_OPTIONS`/`FREQ_*` constants, the `billMutation`/`sendMutation`/`scheduleActionMutation`/`reminderMutation`/`batchMutation`/`voidMutation`/`resendOneMutation` mutations, the `uploadChargeDoc`/`clearChargeDoc`/`startBill`/`handleBatch`/`handlePauseResume`/`handleCancelSchedule` helpers, and the `SplitPill` usages/`tp-split-slot`. (Keep `RentAmount`, `MarkExternal`, `SentSuccess`, `RequestsHome`, `ChooseTenant→ChooseClient`, `InvoiceActionSheet`, `SubBar`, `FabBtn`, `SendBtn`, `TopBanner`, `SubHead`.)

- [ ] **Step 2: Rename the keypad** — `function RentAmount` → `function AmountKeypad` (and its `renderScreen` `'amount'` case). It already takes `{ go, selectedClient, onCommit, backTo }`.

- [ ] **Step 3: Add the `invoiceMutation`** (replaces send/bill):

```tsx
  const invoiceMutation = useMutation({
    mutationFn: async ({ clientId, amountCents, channel, jobDetails }: any) => {
      const due = new Date(); due.setDate(due.getDate() + 7);
      const r = await fetch('/api/trades/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({
          clientProfileId: clientId, amountCents, deliveryChannel: channel,
          dueAt: due.toISOString(), kind: 'full',
          jobDetails: jobDetails || undefined,
        }),
      });
      if (!r.ok) {
        const msg = await r.json().then((d: any) => d.message).catch(() => 'Failed to send invoice');
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setSuccessLabel(selectedClient?.email || selectedClient?.phone || '');
      setContentKey(k => k + 1);
      setScreen('success');
    },
    onError: (err: any) => { toast(err?.message || 'Failed to send invoice'); },
  });
```

- [ ] **Step 4: Add the `QuickInvoice` confirm screen** (a trimmed `SendRentLink`: shows client, amount with edit, an optional job-note input, a channel toggle inferred from the client, and a `ConfirmButton`/send). Full literal component:

```tsx
/* ═══ SCREEN: QuickInvoice ═══ */
function QuickInvoice({ go, selectedClient, amount, onEditAmount, jobNote, setJobNote, onSend, sending }: any) {
  if (!selectedClient) return <div className="tp-screen" style={{ padding: 40, color: NAVY }}>choose a client first</div>;
  const channel = selectedClient.preferredChannel || 'email';
  const dest = channel === 'email' ? selectedClient.email : selectedClient.phone;
  return (
    <div className="tp-screen" style={{ background: OFFW, minHeight: '100%', padding: '120px 24px 130px' }}>
      <SubHead onCancel={() => go('home')} onCommit={onSend} />
      <div style={{ color: NAVY, fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
        {selectedClient.firstName} {selectedClient.lastName}
      </div>
      <div style={{ color: 'rgba(26,29,33,0.55)', fontSize: 14, marginBottom: 20 }}>
        invoice via {channel}{dest ? ` · ${dest}` : ''}
      </div>
      <button onClick={onEditAmount} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <div className="tp-amount" style={{ fontSize: 64, color: BLUE }}>{fmt(amount)}</div>
      </button>
      <input
        value={jobNote} onChange={(e) => setJobNote(e.target.value)}
        placeholder="job note (optional)" maxLength={500}
        style={{ width: '100%', marginTop: 20, padding: '14px 16px', borderRadius: 12, border: `1.5px solid rgba(26,29,33,0.15)`, fontSize: 15, fontFamily: 'inherit', background: '#fff', color: NAVY }}
      />
      <button
        onClick={onSend} disabled={sending || amount <= 0}
        style={{ width: '100%', marginTop: 24, padding: '16px', borderRadius: 14, border: 'none', background: BLUE, color: '#fff', fontWeight: 800, fontSize: 16, cursor: sending ? 'default' : 'pointer', opacity: sending || amount <= 0 ? 0.6 : 1 }}
      >
        {sending ? 'sending…' : 'send invoice'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add `jobNote` state** near the other terminal state: `const [jobNote, setJobNote] = useState('');` and clear it in `go('home')`.

- [ ] **Step 6: Wire `renderScreen`** — replace the `send`/`bill`/`batch` cases with a single `invoice` case and the renamed keypad:

```tsx
    if (id === 'clients')  return <ChooseClient clients={clients} invoices={invoices} go={go} onSelect={handleClientSelect} />;
    if (id === 'amount')   return <AmountKeypad go={go} selectedClient={selectedClient} backTo={'invoice'} onCommit={(c: number) => { setAmount(c); go('invoice'); }} />;
    if (id === 'invoice')  return <QuickInvoice go={go} selectedClient={selectedClient} amount={amount} onEditAmount={() => go('amount')} jobNote={jobNote} setJobNote={setJobNote} onSend={() => invoiceMutation.mutate({ clientId: selectedClient.id, amountCents: amount, channel: selectedClient.preferredChannel || 'email', jobDetails: jobNote })} sending={invoiceMutation.isPending} />;
    if (id === 'external') return <MarkExternal go={go} selectedClient={selectedClient} amount={amount} invoices={invoices} onMark={handleMark} marking={markMutation.isPending} />;
    if (id === 'home')     return <RequestsHome invoices={invoices} clients={clients} outstanding={outstanding} go={go} onRowTap={handleRowTap} />;
    if (id === 'success')  return <SentSuccess amount={amount} label={successLabel} go={go} kind={'invoice'} />;
```

- [ ] **Step 7: Fix `handleClientSelect`** — it should always route to the keypad for an invoice (no charge branch): set `selectedClient`, then `setAmount(0); setScreen('amount')` (or honour `pendingDest === 'external'` → `setScreen('external')`).

- [ ] **Step 8: Simplify the chrome render** — remove the `tp-split-slot`/`SplitPill` div from the action-bar row (kept `tp-subbar-center` + `tp-send-slot`). The `SendBtn` (`handleSend`) should `go('clients')` if no client else `go('invoice')`.

- [ ] **Step 9: Verify — this is the gate that must come back clean**

Run: `npm run check 2>&1 | grep "trades-terminal" || echo "clean"`
Expected: `clean` (all removed-symbol errors from Tasks 4–5 are now resolved). Then `npm run check 2>&1 | grep -c "error TS"` → `42`.

- [ ] **Step 10: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): QuickInvoice path (keypad → send kind:full), drop rent/charge/batch screens"`

---

### Task 7: Home stack + ChooseClient copy & fields

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

Adjust the ported `RequestsHome` and `ChooseClient` copy/fields for trades. (Renames happened in Task 4; this is the human-facing polish.)

- [ ] **Step 1: `RequestsHome` copy** — headline label `outstanding rent` → `outstanding`; stack title `rent requests` → `jobs`; empty state `tap + to send a rent request` → `tap + to send an invoice`. The avatar initials read from `inv.clientName` (set in Task 4). Remove the split/charge badges block (the `isSplit`/`inv.kind === 'charge'` JSX) — 3a invoices are plain `kind: 'full'`.

- [ ] **Step 2: `outstanding` computation** — confirm it sums live statuses for trades vocabulary:

```tsx
  const outstanding = (invoices as any[])
    .filter((i: any) => ['pending_dispatch', 'dispatched', 'viewed', 'balance_due', 'deposit_paid'].includes(i.status))
    .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);
```

- [ ] **Step 3: `ChooseClient`** — rename `ChooseTenant`→`ChooseClient`; remove the `splitMode`/`onToggleSplit` props and the split pill. Show `siteAddress` under each client name (trades clients have a site). Each row `onSelect(client, 0)`.

- [ ] **Step 4: `invoiceStatusFor`** — map trades statuses: `paid`/`paid_external`→`paid`; `voided`→hidden (already filtered); `dispatch_failed`→`failed`; `dispatched`/`viewed`→`sent`; `deposit_paid`/`balance_due`→`awaiting`; default `awaiting`.

- [ ] **Step 5: Verify** — `npm run check 2>&1 | grep "trades-terminal" || echo "clean"` → `clean`; total still `42`.
- [ ] **Step 6: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): home stack + ChooseClient copy/fields for trades"`

---

### Task 8: Row action sheet — basic actions (mark received externally · cancel)

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx`

The ported `InvoiceActionSheet` references resend/edit-resend (property routes not yet wired for trades) and the removed `voidMutation`. For 3a, keep two working actions: **mark received externally** (wired) and **cancel** (POST `/api/trades/invoices/:id/void`). Rename to `JobActionSheet`. Send-balance / mark-complete are Phase 3b.

- [ ] **Step 1: Re-add a void mutation** (it was removed in Task 6; 3a needs cancel):

```tsx
  const voidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/void`, { method: 'POST', headers: tradesHeaders() });
      if (!r.ok) throw new Error('Failed to cancel');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] }); setBanner('Invoice cancelled'); setRowAction(null); },
    onError: (e: any) => { toast(e?.message || 'Could not cancel'); },
  });
```

- [ ] **Step 2: Trim `JobActionSheet`** — keep `onMarkReceived` and `onVoid`; remove `onResend`/`onEditResend` rows. Update the render site to drop those props:

```tsx
      {rowAction && (
        <JobActionSheet
          invoice={rowAction}
          busy={voidMutation.isPending || markMutation.isPending}
          onClose={() => setRowAction(null)}
          onMarkReceived={() => { markMutation.mutate({ invoiceId: rowAction.id, ref: '' }); setRowAction(null); }}
          onVoid={() => voidMutation.mutate(rowAction.id)}
        />
      )}
```

- [ ] **Step 3: Confirm `markMutation`** posts to `/api/trades/invoices/:id/mark-paid-external` with `tradesHeaders()` (done in Task 4 Step 4) and invalidates `['/api/trades/invoices']`.

- [ ] **Step 4: Verify** — `npm run check 2>&1 | grep "trades-terminal" || echo "clean"` → `clean`; total `42`.
- [ ] **Step 5: Commit** — `git add client/src/pages/trades/trades-terminal.tsx && git commit -m "feat(trades): job row action sheet — mark received / cancel"`

---

### Task 9: Whole-phase verification & manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full type check** — `npm run check 2>&1 | grep -c "error TS"` → `42`. If higher, the delta is ours — fix before proceeding.
- [ ] **Step 2: No trades regressions** — `npm run check 2>&1 | grep -iE "trades|trades-api|trades-terminal" || echo "clean"` → `clean`.
- [ ] **Step 3: No property leakage** — `grep -nE "tenant|/api/property|propFetch|propHeaders" client/src/pages/trades/trades-terminal.tsx || echo "clean"` → `clean`.
- [ ] **Step 4: Manual smoke (`run` skill / dev server, requires login — `/trades` is auth-gated):**
  1. `npm run dev`, log in, go to `/settings` → tap **Trades** → lands on `/trades`. (Note: the action-bar terminal lives at `/trades/terminal`; from `/trades` dashboard navigate there, or temporarily point the dashboard at it.)
  2. On the terminal: tap **+** (FAB) → ChooseClient. If no clients exist, you'll need one — create via `POST /api/trades/clients` (curl with your bearer token) or the client-directory page (Phase 3b wires the add-form). Document this gap in the PR.
  3. Pick a client → keypad → enter an amount → **invoice** confirm → **send invoice** → success screen → returns home → the invoice appears in the stack with an `awaiting` dot and the headline reflects it.
  4. Tap the row → **mark received externally** → dot turns `paid`, headline drops.
  5. Tap **quote** in the action bar → toast "quotes land in Phase 3b".
  6. Confirm no console errors throughout. Capture a screenshot of the populated stack.
- [ ] **Step 5: Final commit (if smoke needed tweaks)** — `git add -A && git commit -m "chore(trades): Phase 3a verification tweaks" --allow-empty`

---

## Self-Review

**Spec coverage (Phase 3a slice of §5–§11):**
- §6 action bar `clients · quote · invoice · external` → Task 5 (quote stubbed for 3b). ✓
- §7 QuickInvoice (keypad amount → client → job note → send), ChooseClient (reuse ChooseTenant), Keypad (reuse RentAmount), MarkExternal (reuse), SentSuccess (reuse) → Tasks 6–7. ✓
- §5 home stack with status dots + outstanding headline → Task 7; row action sheet (subset: mark received / cancel) → Task 8. ✓
- §10 "Invoice" labelling (copy) → Tasks 6–7. ✓
- §4 theme via TRADES_THEME only → Task 3. ✓
- §11 reuse map: tp-* chrome, conveyor, ConfirmButton-style send, keypad all ported. ✓

**Deferred to 3b/3c (correctly NOT here):** QuoteBuilder + line items + deposit/recurring toggles, quote accept→deposit→balance lifecycle, JobActionSheet send-balance/mark-complete, client-directory/profile pages, recurring schedules (AutomateScreen), GST 15% line, 0.3% fee surfacing, split-payment, document upload, batch resend, dashboard/analytics real data.

**Open decisions for the executor (flag, don't guess):**
1. **Client creation in 3a:** the QuickInvoice flow needs an existing client. This plan defers the add-client *form* to 3b (client-directory) and documents a curl/manual create for the 3a smoke. If the user wants 3a self-sufficient, add a minimal "+ new client" inline form to `ChooseClient` posting `createClientProfileSchema` fields (firstName, lastName, siteAddress required) — a ~40-line addition.
2. **Entry point:** routes put the dashboard at `/trades` and the terminal at `/trades/terminal`. Confirm whether the Trades settings card should land on the terminal directly (like a POS) or the dashboard-then-terminal. Currently `/trades` = dashboard shell.

**Placeholder scan:** every step has literal code or a literal command + expected output. The copy-and-transform steps give exact old→new strings / enumerated deletions rather than re-printing the 1753-line file (re-printing would risk drift; the `cp` + enumerated edits are unambiguous and reviewable). ✓
