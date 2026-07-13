# Trades Quick Invoice — no client required

**Branch:** `feat/property-dashboard-redesign` (continue on it; do NOT commit unless asked — there is other uncommitted work in the tree. Never run `git checkout -- .` or discard files you didn't edit.)

## Goal (user's words, translated)

1. The **quick invoice** tile on the trades dashboard must land the merchant *directly inside the quick-invoice flow* of the trades terminal (today it just opens the terminal home).
2. Quick invoice must **not require choosing/creating a client first**. Instead the merchant types the recipient's details (name + email or phone) inline.
3. After the invoice is sent, the success screen shows an **"add client"** button that saves those details as a real client in the directory.

## Architecture decision (already made — do not deviate)

`job_invoices.client_profile_id` is `NOT NULL` with an FK (shared/schema.ts:1045) and **schema changes are forbidden on this branch** (drizzle push from here is dangerous — see memory `db-schema-drift-fk-sequences`). Therefore:

- A quick invoice **silently creates a hidden client profile row with `status: 'prospect'`** server-side, in the same request that creates the invoice. No migration needed (`status` is free-text, default `'active'`).
- Prospects are **excluded from every client list in the UI** (directory, pickers, dashboard count) but everything that resolves a client by id — invoice dispatch (`server/trades-delivery.ts:153` reads the profile for email/phone), checkout, stack rows, action sheet — keeps working untouched.
- "add client" = new endpoint that flips `status: 'prospect'` → `'active'`. The profile then appears in the directory like any hand-created client.

---

## Stage 1 — Server: accept an inline recipient on invoice creation

### 1a. `shared/schema.ts` — extend `createJobInvoiceSchema` (line ~1144)

- Make `clientProfileId` optional: `clientProfileId: z.string().uuid().optional()`.
- Add:
  ```ts
  recipient: z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: optionalEmailSchema,        // reuse existing validator in this file
    phone: optionalPhoneSchema,        // reuse existing validator in this file
    channel: z.enum(["email", "sms"]).default("email"),
  }).optional(),
  ```
- Add refinements (keep the existing deposit/quoteId refine):
  - exactly one of `clientProfileId` / `recipient` must be present: `.refine(d => !!d.clientProfileId !== !!d.recipient, { message: "Provide a client or recipient details", path: ["clientProfileId"] })`
  - recipient contact must match channel: `.refine(d => !d.recipient || (d.recipient.channel === "email" ? !!d.recipient.email : !!d.recipient.phone), { message: "Recipient email or phone is required for the chosen channel", path: ["recipient"] })`
  - a recipient invoice must be `kind: 'full'` and have no `quoteId`: `.refine(d => !d.recipient || (d.kind === "full" && !d.quoteId), { message: "Quick invoices must be standalone full invoices", path: ["recipient"] })`
- NOTE: `.refine` on a ZodObject returns a ZodEffects — if anything else in the codebase calls `.partial()` or `.extend()` on `createJobInvoiceSchema`, restructure so refines come last on a shared base object. Run `grep -rn "createJobInvoiceSchema" server/ shared/ client/` to check (expected: only routes.ts parse + this file).

### 1b. `server/routes.ts` — POST `/api/trades/invoices` (line ~6867)

Current code does `storage.getClientProfile(parsed.data.clientProfileId)` and 404s. Change to:

```ts
let client: any;
if (parsed.data.recipient) {
  // Quick invoice: create a hidden prospect profile carrying the contact details.
  const nm = parsed.data.recipient.name.trim();
  const spaceIdx = nm.indexOf(" ");
  client = await storage.createClientProfile({
    merchantId,
    firstName: spaceIdx > 0 ? nm.slice(0, spaceIdx) : nm,
    lastName: spaceIdx > 0 ? nm.slice(spaceIdx + 1) : "",
    email: parsed.data.recipient.email ?? null,
    phone: parsed.data.recipient.phone ?? null,
    siteAddress: "",                       // NOT NULL column; empty string is fine
    preferredChannel: parsed.data.recipient.channel,
    status: "prospect",
  });
} else {
  client = await storage.getClientProfile(parsed.data.clientProfileId!);
  if (!client || client.merchantId !== merchantId) return res.status(404).json({ message: "Client not found" });
}
```
Then in the `storage.createJobInvoice({...})` call, replace `clientProfileId: parsed.data.clientProfileId` with `clientProfileId: client.id`, and set `deliveryChannel: parsed.data.deliveryChannel` as today (the client will send `deliveryChannel` = the recipient channel; see Stage 3). Everything downstream (`createJobEvent` already uses `client.id`, `resendTradeInvoice` reads the profile) works unchanged.

- Check `storage.createClientProfile` (server/storage.ts) accepts `status` in its insert payload; if it hardcodes/omits status, extend it to pass `status` through (default `'active'` preserved).

### 1c. `server/routes.ts` — new promote endpoint (place next to archive/unarchive, ~line 6614)

```ts
app.post("/api/trades/clients/:id/promote", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) return res.status(401).json({ message: "Authentication required" });
    const existing = await storage.getClientProfile(req.params.id);
    if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
    if (existing.status !== "prospect") return res.status(400).json({ message: "Client is already saved" });
    res.json(await storage.updateClientProfile(req.params.id, { status: "active" }));
  } catch (err) { console.error("[TRADES_CLIENTS_PROMOTE]", err); res.status(500).json({ message: "Failed to save client" }); }
});
```
- `updateClientProfileSchema` is NOT used here (that zod schema has no `status` field — that's fine, we call storage directly like archive/unarchive do). Check `storage.updateClientProfile` passes arbitrary fields incl. `status` (archive/unarchive presumably already set status this way — mirror whichever mechanism they use).

## Stage 2 — Hide prospects from every client list

`GET /api/trades/clients` returns ALL profiles and consumers filter client-side (`status !== 'archived'`). Keep it that way (the terminal needs prospects in the list so the jobs stack can show their names) and tighten UI filters. Every current occurrence of `status !== 'archived'` used for a *picker or directory or count* becomes "active only" (`c.status === 'active'` is NOT safe if legacy rows have other statuses — use `!['archived','prospect'].includes(c.status)`):

1. `client/src/pages/trades/trades-terminal.tsx:221` — `ChooseClient` active filter.
2. `client/src/pages/trades/trades-terminal.tsx:716` — `QuoteScreen` client `<select>` filter.
3. `client/src/pages/trades/client-directory.tsx:344` — `activeClients` list.
4. `client/src/pages/trades/recurring-schedules.tsx:41` — schedule client `<select>`.
5. `client/src/pages/trades/trades-dashboard.tsx:264` — `activeClients` count stat.
6. Sweep for stragglers: `grep -rn "archived" client/src/pages/trades/` and update any other list/count filter the same way (do NOT touch client-directory's archived-tab filter `status === 'archived'` at :304 — that one stays).

The dashboard `sites` dropdown (trades-dashboard.tsx:249) already `.filter(Boolean)`s empty site addresses, so prospects' `""` site is naturally excluded — no change.

## Stage 3 — Terminal: quick-invoice mode (client/src/pages/trades/trades-terminal.tsx)

### 3a. Entry via URL

- Dashboard tile (trades-dashboard.tsx:344): change `to: '/trades/terminal'` → `'/trades/terminal?quick=1'` for the quick-invoice tile only.
- In `TradesTerminal` (line ~775), on mount read the flag and enter quick mode. wouter's `useLocation` doesn't expose search; use `window.location.search`:
  ```ts
  const [quickMode, setQuickMode] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('quick') === '1') {
      setQuickMode(true);
      setScreen('amount');          // keypad first, same order as the existing flow
      window.history.replaceState(null, '', '/trades/terminal'); // don't re-trigger on refresh/back
    }
  }, []);
  ```
  (Run this effect once, before/independent of data loading — the keypad needs no data.)

### 3b. Quick-mode state

Add to `TradesTerminal` state: `const [recipient, setRecipient] = useState({ name: '', email: '', phone: '', channel: 'email' as 'email' | 'sms' });` and `const [sentInvoice, setSentInvoice] = useState<any>(null);`

Reset `quickMode`, `recipient`, and (on leaving success) `sentInvoice` inside `go('home')`'s reset block (line ~925).

### 3c. Screen flow in quick mode

- `AmountKeypad` (line ~282) already renders fine with `selectedClient == null`. Its cancel (`backTo`) should go `'home'` in quick mode when there's no client (pass `backTo={quickMode ? 'invoice' : 'invoice'}` — actually keep `'invoice'`: in quick mode the invoice screen is valid without a client now). On commit → `go('invoice')` as today.
- `QuickInvoice` (line ~319): currently early-returns a "choose a client" screen when `!selectedClient`. Change the guard to `if (!selectedClient && !quickMode)` (pass `quickMode` down as a prop). When `quickMode && !selectedClient`, render the normal layout but:
  - Top white panel: amount + edit (unchanged); where client name/siteAddress render (lines ~349-352), instead show the typed `recipient.name` or the placeholder text `new customer`.
  - Bottom panel, ABOVE the job-note field, add a "send to" block styled like the existing fields (`tp-field` inputs, same uppercase label style as "job note" at line ~360):
    - `name` input (placeholder `customer name`), value `recipient.name`.
    - channel toggle: two pill buttons `email` / `text` (reuse the split-toggle button styling at lines ~377-386 for visual language, or two `tp-cta-wire`-style small pills with the active one filled). Sets `recipient.channel`.
    - one contact input that switches with the channel: email keyboard (`type="email"`, placeholder `customer email`) or phone (`inputMode="tel"`, placeholder `mobile number`), writing to `recipient.email` / `recipient.phone`.
  - Replace the static "sending via {channel}" badge (lines ~366-374): in quick mode show `sending via {recipient.channel}` + the typed destination (or `enter details above` when empty).
  - Send button disabled condition gains quick-mode validation: `amount <= 0 || (quickMode && !selectedClient && (!recipient.name.trim() || (recipient.channel === 'email' ? !recipient.email.trim() : !recipient.phone.trim())))`. Keep it simple — server re-validates.
- `onSend` wiring in `renderScreen` for `'invoice'` (line ~1034): when quick mode & no client, mutate with `{ recipient: { name, email: email || undefined, phone: phone || undefined, channel }, amountCents: amount, channel: recipient.channel, jobDetails: jobNote, splitEnabled }`.

### 3d. Mutation + success screen

- `invoiceMutation` (line ~836): change `mutationFn` body construction — if `vars.recipient` is present send `{ recipient, amountCents, deliveryChannel: vars.recipient.channel, dueAt, kind: 'full', jobDetails, splitEnabled }` (NO `clientProfileId`); else exactly today's body. In `onSuccess(data)`: `setSentInvoice(data)`; success label: for quick mode use `vars.recipient?.email || vars.recipient?.phone || selectedClient?.email || …` (onSuccess receives `(data, vars)` — use vars, not state).
- `SentSuccess` (line ~497): add props `showAddClient: boolean` and `onAddClient` / `addClientState: 'idle' | 'saving' | 'saved'`. Below the existing label, when `showAddClient`, render a `tp-cta-wire` button: `add client` → `saving…` → `client saved ✓` (disabled once saved). Wire in `renderScreen('success')`: `showAddClient = quickMode && !!sentInvoice?.clientProfileId`.
- Add a `promoteMutation`: `POST /api/trades/clients/${sentInvoice.clientProfileId}/promote` with `tradesHeaders()`; on success invalidate `['/api/trades/clients']` and set saved state; on error `toast(message)`.
- The success screen's `done` / cancel handlers already `go('home', 'down')` which resets state — make sure the reset also clears `quickMode`, `recipient`, `sentInvoice` (3b).

### 3e. Terminal-native entry (small, do last)

In `ChooseClient` (line ~218), when the flow destination is the invoice (`pendingDest === 'invoice'` — pass down a prop `onQuickInvoice`), render one extra row pinned above the client list: a button styled like the client rows but with a `+` icon and label `quick invoice · no client`. Tapping it: `setQuickMode(true); setSelectedClient(null); setAmount(0); setJobNote(''); setSplitEnabled(false); setPendingDest(null); go('amount')` (mirror `handleClientSelect`, line ~948). Do NOT show it when picking for `external`.

## Stage 4 — Verify (must actually run, not just typecheck)

Environment rules (critical):
- ONE dev server only. The workflow owns :5000. Server file edits need a tsx restart: `pkill -f "tsx serve[r]/index.ts"` (note the `[r]` — a plain pattern also kills your own shell) and the workflow supervisor loop respawns it; verify `pgrep -f "tsx serve[r]/index.ts" | wc -l` → 1. Client edits hot-reload, no restart.
- `npm run check` must be green after each stage.

E2E (real mode, headless chromium at `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium` with playwright-core from workspace node_modules; mint a JWT with `JWT_SECRET` from `.replit` for merchant 22 — same technique as the checkout E2E):
1. API-level first: POST `/api/trades/invoices` with `recipient: { name: "Quick Test", email: "qt@example.com", channel: "email" }`, `amountCents: 12345`, `dueAt` +7d, `kind: "full"` → 201; response has `clientProfileId`; GET `/api/trades/clients` shows that profile with `status: "prospect"`; the profile does NOT appear in the directory page or ChooseClient.
2. POST `/api/trades/clients/:id/promote` → 200, status `active`, now appears in directory.
3. Promote again → 400 "already saved". Promote someone else's client id → 404.
4. POST invoice with NEITHER clientProfileId NOR recipient → 400. With recipient channel `sms` but no phone → 400. With both clientProfileId and recipient → 400.
5. Browser: `/trades/dashboard` → tap quick invoice tile → keypad appears directly; enter 50.00 → details screen; fill name+email → send → success screen shows `add client` → tap → `client saved ✓`; directory now lists them.
6. Regression: the normal client-based invoice flow (subbar → invoice → choose client → keypad → send) still works; quote creation client dropdown has no prospects; dashboard client count unchanged by an unsent-prospect quick invoice… (count excludes prospects); checkout page for the quick invoice's token loads and shows the recipient name.
7. Screenshot the new details screen + success screen for the user (they care about design fidelity — keep styling strictly within the existing `tp-*` design language; invent nothing new visually).

## Out of scope / do not touch
- No DB schema changes, no `drizzle-kit push`, no edits to `dueAt` semantics, payment endpoints, Windcave, split logic, or the checkout page.
- Leave unrelated uncommitted work in the tree exactly as-is.
- WhatsApp channel: excluded from the quick-recipient UI on purpose (email/sms only); client-profile-based flows keep all three.
