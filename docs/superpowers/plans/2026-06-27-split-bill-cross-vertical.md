# Split-bill Cross-Vertical Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring bill-splitting to the trades vertical (merchant enable toggle on quick-invoice and balance) and make the customer-facing split wording vertical-neutral across retail, property, and trades.

**Architecture:** Splitting is already plumbed end-to-end in the schema and backend for all three verticals; this is a near-frontend change. We expose the trades merchant `splitEnabled` toggle (quick invoice = frontend only; balance = one small additive route field + action-sheet toggle), neutralize "flatmate" copy in the shared checkout and property terminal, and delete the dead `bill-split.tsx` component. The split stays merchant-gated; the customer divides at pay time. Both existing customer UIs (retail standalone page, property/trades inline checkout) are kept structurally unchanged.

**Tech Stack:** React + TypeScript (Vite), wouter, TanStack Query, Express (`server/routes.ts`), Drizzle schema, Jest (jsdom) for tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-split-bill-cross-vertical-design.md`.
- Merchant-gated model — never add a customer-only path that bypasses the merchant `splitEnabled` flag.
- Customer-facing split label is exactly **"Split the bill"**; property merchant indicator is exactly **"split enabled — bill can be divided"**.
- No schema changes, no migrations, no changes to split *payment* mechanics.
- Out of scope: splitting trades quotes or deposits; merging the two customer UIs; any change to retail `/split-payment` beyond confirming it stays neutral.
- Use existing trades palette tokens (`NAVY`, `OFFW`, `BLUE`, `GREEN`, `RED` from `TRADES_THEME`) and the existing `rgba(88,171,255,...)` accent literals already used in `trades-terminal.tsx`. No new color literals.
- Git in this environment: prefix git commands with `GIT_CONFIG_NOSYSTEM=1`. Commit only the files each task names (avoid staging `.claude-home/` churn — use explicit paths, never `git add -A`).
- Type-check command: `npm run check` (runs `tsc`). Test command: `npx jest <path>`.
- Visual verification of every UI change must be done by the user in the Replit webview — a browser cannot be launched in this sandbox.

---

### Task 1: Neutralize "flatmate" wording (with regression guard test)

Replace property-specific copy with vertical-neutral copy in the shared checkout and the property terminal indicator, and lock it with a Jest test that fails if "flatmate" reappears in those files.

**Files:**
- Create: `client/src/__tests__/split-wording.test.ts`
- Modify: `client/src/pages/checkout.tsx` (the "Split with flatmates" button ~line 1165; the `// flatmate` comments ~line 181 and ~line 964)
- Modify: `client/src/pages/property/property-terminal.tsx:504` (the split indicator text)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks (independent copy + test change).

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/split-wording.test.ts`:

```ts
import fs from "fs";
import path from "path";

// These files are customer-facing or shared across verticals, so their split
// copy must never reintroduce property-specific "flatmate" language.
const files = [
  "client/src/pages/checkout.tsx",
  "client/src/pages/property/property-terminal.tsx",
];

describe("split wording is vertical-neutral", () => {
  test.each(files)("%s contains no 'flatmate' references", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/flatmate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest client/src/__tests__/split-wording.test.ts`
Expected: FAIL — both files still contain `/flatmate/i` matches.

- [ ] **Step 3: Edit `checkout.tsx`**

Change the split button label (the element currently reading `Split with flatmates`, ~line 1165):

```tsx
                      Split the bill
```

Update the two code comments so no "flatmate" text remains. At ~line 181:

```tsx
  // success screen and refresh split progress (each payer pays on their own link).
```

At ~line 964:

```tsx
  // Invoice split: payer picks how many people share the bill. Calls the
```

Leave "How many of you are splitting?" (already neutral) unchanged.

- [ ] **Step 4: Edit `property-terminal.tsx:504`**

Change the indicator text from `split bill enabled — flatmates can divide it` to:

```tsx
              split enabled — bill can be divided
```

- [ ] **Step 5: Run the guard test — verify it passes**

Run: `npx jest client/src/__tests__/split-wording.test.ts`
Expected: PASS (both files).

- [ ] **Step 6: Confirm no other customer-facing "flatmate" references remain**

Run: `grep -rni "flatmate" client/src --include=*.tsx --include=*.ts | grep -v __tests__`
Expected: no output.

- [ ] **Step 7: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
GIT_CONFIG_NOSYSTEM=1 git add client/src/__tests__/split-wording.test.ts client/src/pages/checkout.tsx client/src/pages/property/property-terminal.tsx
GIT_CONFIG_NOSYSTEM=1 git commit -m "feat(split): neutralize flatmate wording across customer split UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Trades quick-invoice split toggle (frontend only)

Add a `splitEnabled` merchant toggle to the trades QuickInvoice send screen, mirroring the existing deposit toggle pattern. The create-invoice route already persists `splitEnabled`.

**Files:**
- Modify: `client/src/pages/trades/trades-terminal.tsx` — parent state (~line 759), `invoiceMutation` (~lines 811–835), `QuickInvoice` component (signature ~line 319, UI ~after line 374), QuickInvoice render usage (~line 1001).

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks (Task 3 is independent; it edits the balance path).

- [ ] **Step 1: Add parent state**

Next to the existing `const [jobNote, setJobNote] = useState('');` (~line 759), add:

```tsx
  const [splitEnabled, setSplitEnabled] = useState(false);
```

- [ ] **Step 2: Thread `splitEnabled` through `invoiceMutation`**

In `invoiceMutation` (~line 811), update the `mutationFn` signature and request body:

```tsx
  const invoiceMutation = useMutation({
    mutationFn: async ({ clientId, amountCents, channel, jobDetails, splitEnabled }: any) => {
      const due = new Date(); due.setDate(due.getDate() + 7);
      const r = await fetch('/api/trades/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({
          clientProfileId: clientId, amountCents, deliveryChannel: channel,
          dueAt: due.toISOString(), kind: 'full',
          jobDetails: jobDetails || undefined,
          splitEnabled: !!splitEnabled,
        }),
      });
```

In the same mutation's `onSuccess`, reset the toggle so it doesn't stick across sends. Add this line inside the existing `onSuccess` body (after the `invalidateQueries` call):

```tsx
      setSplitEnabled(false);
```

- [ ] **Step 3: Add `splitEnabled`/`setSplitEnabled` to the `QuickInvoice` signature**

Update the component signature (~line 319):

```tsx
function QuickInvoice({ go, selectedClient, amount, onEditAmount, jobNote, setJobNote, splitEnabled, setSplitEnabled, onSend, sending }: any) {
```

- [ ] **Step 4: Add the toggle UI**

In `QuickInvoice`, insert the toggle in the lower navy section immediately after the channel-badge `<div>` block (the one rendering "sending via {channel}", closes ~line 374) and before `<div style={{ flex: 1 }} />` (~line 376):

```tsx
        {/* Split bill — merchant enables; customer divides at pay time */}
        <button onClick={() => setSplitEnabled((v: boolean) => !v)} aria-pressed={splitEnabled}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 16, marginTop: 14, border: `1px solid ${splitEnabled ? 'rgba(88,171,255,0.4)' : 'rgba(88,171,255,0.15)'}`, background: splitEnabled ? 'rgba(88,171,255,0.1)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: BLUE }}>split the bill</span>
            {splitEnabled && <span style={{ display: 'block', fontWeight: 400, fontSize: 11.5, color: 'rgba(88,171,255,0.7)', marginTop: 2 }}>customer can divide this into shares</span>}
          </span>
          <span style={{ width: 42, height: 25, borderRadius: 999, background: splitEnabled ? BLUE : 'rgba(88,171,255,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: splitEnabled ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </button>
```

- [ ] **Step 5: Pass props + `splitEnabled` in the render usage**

Update the `id === 'invoice'` render (~line 1001) to thread the new props and include `splitEnabled` in the mutate payload:

```tsx
    if (id === 'invoice')  return <QuickInvoice go={go} selectedClient={selectedClient} amount={amount} onEditAmount={() => go('amount')} jobNote={jobNote} setJobNote={setJobNote} splitEnabled={splitEnabled} setSplitEnabled={setSplitEnabled} onSend={() => { if (!selectedClient || amount <= 0) { toast('set an amount first'); return; } invoiceMutation.mutate({ clientId: selectedClient.id, amountCents: amount, channel: selectedClient.preferredChannel || 'email', jobDetails: jobNote, splitEnabled }); }} sending={invoiceMutation.isPending} />;
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Run the existing smoke/syntax tests (guards against broken JSX)**

Run: `npx jest client/src/pages/__tests__/jsx-syntax-smoke.test.tsx client/src/pages/__tests__/syntax-validation.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
GIT_CONFIG_NOSYSTEM=1 git add client/src/pages/trades/trades-terminal.tsx
GIT_CONFIG_NOSYSTEM=1 git commit -m "feat(trades): split-bill toggle on quick invoice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 9: Manual verification (user, in Replit webview)**

In the trades terminal → invoice screen, the "split the bill" toggle appears and persists `splitEnabled` on the created invoice; the customer checkout for that invoice offers "Split the bill".

---

### Task 3: Trades balance split toggle (route field + action-sheet toggle)

Let the merchant enable split when issuing the remaining balance. The balance is created by `POST /api/trades/invoices/:id/send-balance`, which currently omits `splitEnabled`, and is triggered from a one-tap action in `JobActionSheet`.

**Files:**
- Modify: `server/routes.ts` — `send-balance` route (~lines 6969–7002), `createJobInvoice` call (~line 6993).
- Modify: `client/src/pages/trades/trades-terminal.tsx` — `jobActionMutation` (~line 867), `JobActionSheet` (~lines 508–556), `onSendBalance` render usage (~line 1049).

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `onSendBalance` now takes a `splitEnabled: boolean` argument; `jobActionMutation` accepts an optional `splitEnabled?: boolean` for the `send-balance` action.

- [ ] **Step 1: Backend — accept `splitEnabled` in `send-balance`**

In `server/routes.ts`, inside the `send-balance` handler, read the flag after the auth check (just after `if (!merchantId) ...`):

```ts
      const { splitEnabled } = (req.body ?? {}) as { splitEnabled?: boolean };
```

Then add it to the balance `createJobInvoice` call (~line 6993):

```ts
      const bal = await storage.createJobInvoice({
        merchantId: dep.merchantId, clientProfileId: dep.clientProfileId, quoteId: dep.quoteId,
        kind: "balance", amountCents: balanceCents, token: generateInvoiceToken(),
        deliveryChannel: dep.deliveryChannel, status: "pending_dispatch", dueAt: due,
        splitEnabled: !!splitEnabled,
      });
```

- [ ] **Step 2: Frontend — thread `splitEnabled` through `jobActionMutation`**

Update `jobActionMutation` (~line 867) so `send-balance` sends a JSON body:

```tsx
  const jobActionMutation = useMutation({
    mutationFn: async ({ invoiceId, action, splitEnabled }: { invoiceId: string; action: 'send-balance' | 'complete'; splitEnabled?: boolean }) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: action === 'send-balance' ? JSON.stringify({ splitEnabled: !!splitEnabled }) : undefined,
      });
```

(Leave the rest of the mutation — `if (!r.ok)`, `onSuccess` — unchanged.)

- [ ] **Step 3: Frontend — add the balance split toggle to `JobActionSheet`**

In `JobActionSheet` (~line 508), add local state at the top of the component body (after `const settled = st === 'paid';`):

```tsx
  const [balanceSplit, setBalanceSplit] = useState(false);
```

Replace the single send-balance action line (~line 551):

```tsx
        {invoice.kind === 'deposit' && settled && !invoice.balanceSent && <Action label="send remaining balance" onClick={onSendBalance} primary />}
```

with a toggle + action:

```tsx
        {invoice.kind === 'deposit' && settled && !invoice.balanceSent && (
          <>
            <button onClick={() => setBalanceSplit(v => !v)} aria-pressed={balanceSplit}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, marginBottom: 10, border: `1px solid ${balanceSplit ? 'rgba(88,171,255,0.4)' : 'rgba(4,13,109,0.1)'}`, background: balanceSplit ? 'rgba(88,171,255,0.1)' : 'rgba(4,13,109,0.04)', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 13.5, color: NAVY }}>split the balance</span>
              <span style={{ width: 42, height: 25, borderRadius: 999, background: balanceSplit ? BLUE : 'rgba(4,13,109,0.15)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: balanceSplit ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </span>
            </button>
            <Action label="send remaining balance" onClick={() => onSendBalance(balanceSplit)} primary />
          </>
        )}
```

- [ ] **Step 4: Frontend — forward the flag from the render usage**

Update the `onSendBalance` prop in the `JobActionSheet` render (~line 1049):

```tsx
          onSendBalance={(splitEnabled: boolean) => jobActionMutation.mutate({ invoiceId: rowAction.id, action: 'send-balance', splitEnabled })}
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Run smoke/syntax tests**

Run: `npx jest client/src/pages/__tests__/jsx-syntax-smoke.test.tsx client/src/pages/__tests__/syntax-validation.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
GIT_CONFIG_NOSYSTEM=1 git add server/routes.ts client/src/pages/trades/trades-terminal.tsx
GIT_CONFIG_NOSYSTEM=1 git commit -m "feat(trades): split-bill toggle on remaining balance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Manual verification (user, in Replit webview)**

On a deposit-paid job, open the action sheet → "split the balance" toggle appears; enabling it then sending the balance produces a balance invoice whose customer checkout offers "Split the bill".

---

### Task 4: Delete dead `bill-split.tsx`

The green `BillSplit` component is imported nowhere. Remove it.

**Files:**
- Delete: `client/src/components/bill-split.tsx`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Confirm zero importers**

Run: `grep -rn "bill-split\|BillSplit" client/src --include=*.tsx --include=*.ts`
Expected: no output (other than possibly the file's own definition — if any other match appears, STOP and do not delete).

- [ ] **Step 2: Delete the file**

```bash
GIT_CONFIG_NOSYSTEM=1 git rm client/src/components/bill-split.tsx
```

- [ ] **Step 3: Type-check + build sanity**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
GIT_CONFIG_NOSYSTEM=1 git commit -m "chore(split): remove dead bill-split component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` clean.
- [ ] `npx jest client/src/__tests__/split-wording.test.ts client/src/__tests__/trades-gst.test.ts client/src/pages/__tests__/jsx-syntax-smoke.test.tsx client/src/pages/__tests__/syntax-validation.test.tsx` all PASS.
- [ ] `grep -rni "flatmate" client/src` returns nothing outside test files.
- [ ] User has visually verified, in the Replit webview: trades quick-invoice toggle, trades balance toggle, and "Split the bill" wording in the customer checkout for all three verticals.
