# Plan — Per-payment links ("no payment board") for the retail terminal

Date: 2026-08-06
Branch: `feat/tablet-desktop-app`
Status: **§2b scoping fix SHIPPED; token work approved, not started**
Author context: this plan exists because Oliver approved deviation **b2** and
then approved the token-based approach specifically. Read §1 and §2 before
touching code — the naive implementation of b2 ships a money bug.

---

## 1. What Oliver asked for (verbatim, twice)

> "you need to be able to select and create another stone and use that to send
> payments individually to, also need an option to have no payment board so its
> a new payment link"

and, when asked whether "a new payment link" meant a fresh link per payment or
just the existing no-board link:

> "ok build the no board - a new payment link"

So the requirement is **a genuinely new link for each no-board payment**, not the
shared merchant-level `/pay/:merchantId` URL. This distinction is the whole plan.
Do not substitute the merchant-level link — it is the broken path (§2).

Four deliverables:

1. **Select** an existing payment board — *already built and working.*
2. **Create** a new payment board from the terminal.
3. **Send a payment to one board individually** — *already works and is correctly
   scoped;* the board direction has a guard.
4. **"No board" → a new payment link per payment** — the new work.

---

## 2. The bug that forces this design — proven, do not re-litigate

The obvious implementation of "no board" is to hand out `merchant.paymentUrl`
(`/pay/:merchantId`). **That is unsafe.** Full chain, every link verified:

1. **The query doesn't scope by "no board".** Both storage impls only add a stone
   filter when a stone is supplied — with no stone they filter by *merchant alone*:
   - `server/storage.ts:1982` (Postgres): `if (taptStoneId !== undefined) { activeConditions.push(...) }`
   - `server/storage.ts:534` (MemStorage): `taptStoneId === undefined || transaction.taptStoneId === taptStoneId`
2. **The route guards one direction only.** `server/routes.ts:1123` checks
   `stoneId !== undefined && transaction.taptStoneId !== stoneId`. There is no
   reciprocal `IS NULL` guard for the no-stone case.
3. **Empirically confirmed.** A pending $77.77 sale was inserted for merchant 22
   with `tapt_stone_id=3`; `GET /api/merchants/22/active-transaction` (no stoneId)
   returned that Board 3 sale, with `paymentUrl` pointing at `/pay/22/stone/3`.
   Test row deleted afterwards.
4. **The customer never clicks.** `client/src/pages/customer-payment.tsx:113-125`
   is a `useEffect` that auto-redirects to `/checkout/{id}` as soon as any pending
   transaction arrives.
5. **Checkout never re-validates.** `client/src/pages/checkout.tsx` has three
   stone/board mentions and none is a check; line 277 just forwards
   `transaction.taptStoneId` into the payment body.

**Net effect:** a customer on the merchant-level link is auto-redirected into the
checkout for a sale rung up on a different board and pays it.

**Why tokens fix it by design:** each no-board payment is addressed by its own
unguessable token, so there is no shared endpoint for two concurrent sales to
collide on. This removes the cause rather than patching the symptom.

### 2b. The bug is FIXED (2026-08-06) — strict scoping shipped

Oliver ruled: *"no i want it to fix the bug"*. Option (a), strict scoping, is
implemented. **Do not reintroduce the loose behaviour.**

`getActiveTransactionByMerchant(merchantId, taptStoneId?)` is now **tri-state**:

| value | meaning | used by |
|---|---|---|
| `undefined` | any board | authenticated merchant-side finalise (`routes.ts:1270`) |
| `null` | **no-board sales only** | the public `/pay/:merchantId` link |
| `number` | that board only | `/pay/:merchantId/stone/:id` |

The tri-state exists because one caller legitimately means "any": `routes.ts:1270`
is the authenticated merchant finalising whatever they have pending, and blanket
strict scoping there would break a board-attached sale. Collapsing `null` back
into `undefined` reintroduces the bug — the docstring on the interface says so.

**A second affected path was found while fixing this:** `handleHppRedirect`
(`routes.ts:5487`) 302s the customer straight to the Windcave hosted payment page,
so on the merchant-level link they never load the React app at all before paying.
Both paths are fixed by the storage-layer change.

Also fixed: the MemStorage cache key was `taptStoneId ? ... : ...` (truthy), which
gave "any board" and "no board only" the same entry. Now three distinct keys.

**Verified against the real `DatabaseStorage`/Neon**, with a live pending Board 3
sale present:

```
no-board link (null):               id=310 item=c3-test          stone=null
board 3 link (3):                   id=314 item=BOARD3-SCOPE-TEST stone=3
board 1 link (1):                   null
merchant-side finalise (undefined): id=314 item=BOARD3-SCOPE-TEST stone=3
```

Before the fix the first row returned the Board 3 sale. Test rows deleted.

Tokens (§4-§6) remain the right design for "a new payment link" — that is what
Oliver asked for, and it also means no-board payments stop depending on a single
shared endpoint at all.

---

## 3. Prior art to copy — do not invent

Three tables already do exactly this pattern. Follow them rather than designing
something new:

- `invoices_rent_requests.token` (`shared/schema.ts:776`)
- `quotes.token` (`shared/schema.ts:945`)
- `job_invoices.token` (`shared/schema.ts:1003`)

All are `text("token").notNull().unique()`. Generation is
`server/routes.ts:5537`:

```ts
function generateInvoiceToken(): string { return crypto.randomBytes(20).toString("base64url"); }
```

20 random bytes = 160 bits. Reuse this strength. Retail `transactions` currently
has **no token column** — that is the gap this plan closes.

---

## 4. Schema + migration

Add a nullable, unique token to `transactions`.

**Nullable, not `notNull`** — unlike the invoice tables this one is being added to
a populated table. Existing rows have no token and must not be backfilled with
fabricated ones (a token is a bearer credential; minting them for historical rows
creates live payment links for old sales). New transactions always get one.

`shared/schema.ts`, in the `transactions` table:

```ts
  // Per-payment link token. Unguessable, unique, and the only addressing mode for
  // a no-board payment — see docs/PLAN-2026-08-06-payment-links-no-board.md §2.
  token: text("token").unique(),
```

Migration `migrations/0011_transaction_payment_tokens.sql`:

```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS token text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_token_key ON transactions (token) WHERE token IS NOT NULL;
```

A **partial** unique index, so the many existing NULL rows don't fight over
uniqueness.

> **NEVER run `npm run db:push` on this branch.** Migrations here are hand-written
> numbered SQL (`0000`–`0010` exist). `db:push` from a branch based on main
> re-creates FK columns with rogue auto-increment defaults — see the
> `db-schema-drift-fk-sequences` memory. Write the SQL, apply it deliberately.

---

## 5. Server changes

### 5.1 Token generation
`generateInvoiceToken` at `routes.ts:5537` is scoped inside the trades section.
Promote a shared helper (suggested: `server/tokens.ts`) exporting
`generateToken()`, and have both call sites use it. Do not duplicate the crypto.

### 5.2 Generate on create
`storage.createTransaction` — both impls (`storage.ts:562` MemStorage,
`storage.ts:2013` Postgres) — must mint a token when none is supplied. Minting in
storage rather than the route guarantees every creation path gets one; there are
several (`POST /api/transactions`, API-key creation, split flows).

### 5.3 URL helpers
`server/url-utils.ts` — add alongside the existing pair:

```ts
export function generateTokenPaymentUrl(token: string, req?: any): string {
  return `${getBaseUrl(req)}/pay/t/${token}`;
}
export function generateTokenQrCodeUrl(token: string, req?: any): string {
  return `${getBaseUrl(req)}/api/pay/t/${token}/qr`;
}
```

Note the existing `generatePaymentUrl(merchantId, stoneId)` returns the
merchant-level URL when `stoneId` is falsy. **Leave that function alone** — other
callers depend on it. The token URL is a separate, additional mode.

### 5.4 Return the link at create time
`POST /api/transactions` (`routes.ts:1146`) already attaches `paymentUrl` and
`qrCodeUrl` at lines 1161-1162. Add `tokenPaymentUrl` / `tokenQrCodeUrl` so the
terminal can render the link immediately without a second round trip.

### 5.5 The public resolve endpoint
New: `GET /api/pay/t/:token` — public, no auth (the token *is* the credential).

Requirements, all mandatory:
- **Rate limit it.** Copy the `checkRateLimit(clientIp)` guard used by
  `active-transaction` (`routes.ts:1084`). A token endpoint without rate limiting
  is brute-forceable in principle.
- **Constant-ish failure.** Return the same `404 {message:"Not found"}` for an
  unknown token and a well-formed-but-wrong one. Do not distinguish.
- **Never leak merchant internals.** Return only what checkout needs: id, price,
  itemName, status, splitEnabled, isSplit, merchant display name/branding. Do not
  spread the whole row — it carries fee columns, Windcave session ids and
  `windcaveXId`.
- **No stone filtering needed** — the token identifies exactly one transaction.
  That is the entire point.
- Mirror the no-cache headers the `active-transaction` route sets
  (`routes.ts:1090-1095`).

### 5.6 QR endpoint
`GET /api/pay/t/:token/qr` — mirror the existing
`/api/merchants/:id/stone/:stoneId/qr` handler, encoding the token URL.

---

## 6. Client changes

### 6.1 Route
`client/src/App.tsx` — add beside the existing two (lines 482-483):

```tsx
<Route path="/pay/t/:token" component={CustomerPaymentByToken} />
```

### 6.2 The page
`customer-payment.tsx` resolves by `merchantId`/`stoneId` params and polls
`active-transaction`. The token page is simpler: resolve once by token, then
follow the **same** downstream flow — critically the split branch at
`customer-payment.tsx:119-125`:

```
if (splitEnabled && !isSplit) → /split/{id}
else                          → /checkout/{id}
```

Prefer refactoring `customer-payment.tsx` to accept either addressing mode over
forking the file. A fork will drift, and this is payment code.

### 6.3 Desktop terminal (4c)
`client/src/desktop/pages/retail-terminal.tsx`. The board picker exists; it gains:

- **"No board"** as the first option, and the **default**. Selecting it creates
  the transaction with no `selectedStoneId` and surfaces the returned
  `tokenPaymentUrl` + QR for the customer.
- **"+ New board"** action → `POST /api/merchants/:id/tapt-stones`, then refresh
  the picker and select the new board.
  - **Cap is 10** (`routes.ts:2774`) — surface the server's message rather than
    letting the request fail silently.
  - New boards are **auto-named `Stone N`**; there is **no rename endpoint**.
    Oliver was told this and accepted it. Do not invent one without asking.
- Existing board selection is unchanged.

---

## 7. Verification — all of it, before committing

```bash
npx tsc --noEmit                    # silent
npx vite build                      # desktop pages stay in their own chunks
node scripts/verify-desktop-p0.mjs  # gating, geometry, chunk isolation
npx jest client/src/pages/__tests__/smoke-tests.test.tsx client/src/__tests__/tutorial-registry.test.ts
node scripts/desktop-shots/shot-retail-terminal.mjs   # both device classes
```

**Plus new tests that must exist — this is payment code:**

1. **Token isolation.** Transaction A's token must never resolve transaction B.
2. **No cross-merchant leak.** A token from merchant X resolves nothing under
   merchant Y's context.
3. **Board scoping regression.** `/api/merchants/:id/active-transaction?stoneId=N`
   still returns only board N's sale (the guard at `routes.ts:1123`).
4. **The §2 reproduction.** Insert a pending board-bound sale, confirm the
   *token* path is unaffected by it. (This test will still show the
   merchant-level link misbehaving — that is expected and unfixed; see §8.)
5. **Response shape.** Assert the resolve endpoint does **not** return
   `windcaveXId`, `windcaveSessionId`, or fee columns.

**Manual, on the dev server (`:5000`, single instance only):** ring up a no-board
sale on the desktop terminal, open the returned link in a second browser, and pay
it while a *second* board-bound sale is pending. Both must complete against the
correct sale. This is the scenario the whole plan exists for.

---

## 8. Still-open decisions — do NOT resolve these silently

1. ~~The merchant-level link bug~~ — **RULED AND FIXED**, see §2b. Strict scoping.
2. **Behaviour change to announce.** Strict scoping means a merchant who hands out
   `merchant.paymentUrl` (surfaced in settings as "Customer Payment Page") while
   ringing up **board-attached** sales will now see that link show nothing. That
   was the unsafe behaviour and removing it is the point, but it is a live
   behaviour change: worth a note to affected merchants, and worth a production
   query for merchants who have both boards and a history of stoneless sales.
   Not blocking, but do not let it surprise anyone.
3. **Board renaming** — no endpoint exists; Oliver accepted `Stone N` names. Revisit
   only if he asks.
4. Whether historical transactions should ever get tokens — current answer is
   **no** (§4).

---

## 9. Suggested commit order

One commit per step, each independently verifiable:

1. `0011` migration + schema column + shared `generateToken()` helper.
2. Token minting in both `createTransaction` impls + URL helpers.
3. `GET /api/pay/t/:token` resolve + QR endpoints, with the security tests (§7.1-7.5).
4. `/pay/t/:token` client route + `customer-payment.tsx` dual addressing.
5. Desktop terminal: "no board" default + token link/QR surfacing.
6. Desktop terminal: "+ New board" creation.

Steps 1-4 are backend/shared and reviewable without the UI; 5-6 are the desktop
screen. If the branch ever needs splitting, that is the seam.

---

## 10. Repo hygiene

Per `CLAUDE.md`: never `git add -A`. Exclude `.claude-home/**` and
`.claude/settings.local.json`. State verification results in each commit message.
