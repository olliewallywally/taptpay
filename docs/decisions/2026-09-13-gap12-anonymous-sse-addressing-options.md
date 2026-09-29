# Gap 12 — how the anonymous no-board customer flow should address "my sale": options for decision

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. HEAD at time of
writing: `d8dd8c95`.

**Status: OPEN — awaiting an owner decision. Nothing in this memo has been
implemented. No source file was changed by the pass that wrote it.**

Decision owner: Oliver. This memo exists to make the decision possible, not to
make it.

## 1. Why this memo exists

Gap 12 has now been deferred twice, by two different engineering sessions, for
the same correct reason: the right fix is an *addressing-scheme* change, and an
agent must not unilaterally redesign how a paying customer reaches their own
sale.

- 2026-09-12/13 — found and verified, deliberately not patched
  ([`r1/R1-T2-classifier-extension-2026-09-12.md`](../evidence/remediation-v2-2/r1/R1-T2-classifier-extension-2026-09-12.md)).
- 2026-09-13 — partially mitigated in commit `c1e42db1`: the unauthenticated
  branch now calls the same shared `checkRateLimit(clientIp)` its REST sibling
  already used. The writeup is explicit that this "closes the abuse surface",
  **not** the gap
  ([`CONTINUATION-2026-09-07.md`](../evidence/remediation-v2-2/CONTINUATION-2026-09-07.md)
  item 12).

The consequence of two correct deferrals is an indefinitely open
confidentiality/tenant-isolation gap. This memo lays out the actual options,
with what each costs and what each leaves unfixed, so it can be closed by a
decision rather than by another deferral.

**One finding in this pass is new and materially changes the stakes.** Gap 12
has been described as a confidentiality leak. Reading the live selection logic
shows the concurrency case is also a **payment-correctness** defect: two
concurrent stoneless sales do not merely leak across customers, they can route
the wrong customer to the wrong sale's checkout. See §3.3. That is not a reason
to rush — it is a reason not to defer a third time.

## 2. What the customer sees today

This is the product behaviour at stake, not the code defect.

A merchant using the **no-board** flow displays or prints a single standing
address that identifies only the business:

- a QR image from `GET /api/merchants/:id/qr`, which encodes
  `https://…/pay/:merchantId` (`server/url-utils.ts:32`). The merchant app
  offers this at 800px with `?download=true` and a
  `Content-Disposition: attachment` filename, and tells them "High-quality PNG
  saved to your downloads folder" (`client/src/components/qr-code-display.tsx`)
  — i.e. the product actively encourages printing it;
- or a physical NFC tag programmed with `https://…/nfc/:merchantId`, which the
  merchant app writes by rewriting `/pay/` to `/nfc/`
  (`client/src/pages/merchant-terminal-mobile.tsx:992`,
  `client/src/pages/payment-stack.tsx:84`). That route serves an
  Android-intent/Safari redirect into the same `/pay/:merchantId` page
  (`server/routes.ts:384`).

The customer scans it and lands on `client/src/pages/customer-payment.tsx`:

1. **Before any sale exists** they see a spinner: *"Waiting for Payment — The
   merchant will send payment details shortly"* (lines 163–182). **This waiting
   state is already shipped today.** Any option that adds a wait is extending an
   existing state, not inventing one.
2. The page opens an SSE stream to `GET /api/merchants/:id/events` (via
   `sseClient.connectCustomer`, `client/src/lib/sse-client.ts`) **and**
   independently polls `GET /api/merchants/:id/active-transaction` every 3s
   (`refetchInterval: 3000`, line 74). Either path can populate the page.
3. When staff ring up a stoneless sale, the page receives it and auto-redirects
   to `/checkout/:transactionId` — or `/split/:transactionId` when splitting is
   enabled (lines 115–129).
4. On completion it shows *"Payment Successful!"* then `/receipt/:transactionId`.

The essential property: **the address the customer scans is standing and
merchant-wide, so they arrive before the sale they intend to pay exists.** That
is exactly why the server is asked for "the merchant's current sale", and
exactly why it cannot scope the answer any more narrowly than the merchant.

By contrast, the **board/stone** flow (`/pay/:merchantId/stone/:stoneId`) is
scoped to a board, and the **token** flow (`/pay/t/:token`) is minted per sale
*after* the sale exists, so neither has this problem.

## 3. What is actually exposed (verified against the live code)

### 3.1 The unauthenticated branch

`server/routes.ts:5289-5369`. The handler branches three ways:

| Credential presented | Audience | Scoping |
|---|---|---|
| `Authorization` header | `{ kind: "merchant" }` after `authenticateToken` + `checkMerchantOwnership` | correct |
| `?stoneId=` | `{ kind: "board", stoneId }` after loading the stone and checking `stone.merchantId === merchantId` | correct |
| **neither** | `{ kind: "legacy-no-board" }` | **rate-limited only; no authentication of any kind** |

`server/sse-broker.ts`'s `isTarget()` (line 62) scopes a `legacy-no-board`
subscriber to events whose transaction has `taptStoneId == null` **and**
`paymentTokenHash == null` — board sales and token sales are correctly excluded.
`projectEvent()` then sends `publicTransactionDto`, which is
`id, merchantId, taptStoneId, itemName, price, status, paymentMethod, isSplit,
totalSplits, completedSplits, splitAmount, splitEnabled, createdAt` plus
`paymentUrl`/`qrCodeUrl` when present (`server/http-contracts.ts:230`).

So an anonymous caller who knows or guesses a numeric merchant ID receives a
persistent push feed of every future stoneless sale that merchant rings up:
item names, prices, statuses, split state — for as long as the socket stays
open.

### 3.2 The mitigation is narrower than it reads

`checkRateLimit` (`server/routes.ts:246`) is **100 requests per IP per 60s**
against a process-local `rateLimitMap` (lines 203–204). Two honest caveats:

- It bounds *new requests*, not *open connections*. An SSE subscription is one
  request that then lives indefinitely. One IP can still open ~100 new streams
  per minute and keep every one of them. "Unbounded concurrent connections" is
  reduced, not eliminated.
- It is keyed on `req.ip`, and **no `trust proxy` setting exists anywhere in
  this repository** (grepped; `server/index.ts:21` is a bare `express()`).
  Behind Replit's proxy that likely makes `req.ip` the proxy's address, which
  would make the 100/min budget effectively *shared* rather than per-client —
  weaker against an attacker and capable of denying legitimate customers. The
  plan already names this as open work (§8.6 item 2: "configure the exact
  trusted proxy depth/network for Replit"). **I could not verify the deployed
  topology from inside this repository; treat this as a flagged uncertainty,
  not an assertion.**

The budget is also shared with `active-transaction`, and each waiting customer
polls it at 20 req/min (3s interval). Several customers behind one café NAT
plus one unconfigured proxy is a plausible false-denial path. That is an
argument for reducing polling, not against the rate limit.

### 3.3 The concurrency case is a correctness defect, not only a leak

Both the SSE feed and the REST sibling resolve "the merchant's current sale"
the same way. `getActiveTransactionByMerchant` orders
`createdAt desc nulls last, id desc` and takes `limit(1)`
(`server/storage.ts:4698` for Postgres; `server/storage.ts:1630` for the
in-memory backend, via `compareTransactionsNewest` at line 453). It returns the
**newest** pending/processing stoneless sale, falling back to the most recent
*completed* one within the last 3 minutes.

Therefore, if a merchant ever has two concurrent stoneless sales (two staff
terminals, a duplicate scan, a re-rung sale):

- every waiting no-board customer page — including one that had already been
  shown sale #1 — converges on sale #2, because the poll returns the newest and
  the SSE stream delivers every stoneless event to every subscriber;
- `customer-payment.tsx` then redirects on `status === "pending"`
  (lines 115–129) to that transaction's numeric checkout.

So the failure mode is not only "customer A sees customer B's basket". It is
"customer A can be routed to customer B's checkout and pay customer B's
amount." The only thing standing between that and a mis-paid sale today is the
`hasRedirected` ref, which is per-page-load and resets whenever a different
transaction id arrives (line 110).

The 3-minute completed-sale fallback adds a smaller disclosure: a customer (or
anyone) hitting the standing address just after a sale completes sees that
sale's item and price.

### 3.4 The SSE route cannot be fixed on its own

This is the most important scoping point in the memo.

`GET /api/merchants/:id/active-transaction` (`server/routes.ts:2008`) has the
**identical** unauthenticated no-stoneId access mode and returns the **same**
`publicTransactionDto` — as a rate-limited snapshot rather than a push feed.
It is an already-accepted deliberate design, and the route classifier tags it
`public` (`server/route-policy.ts:106`).

An attacker who is denied the stream can poll that endpoint up to 100×/minute
and reconstruct most of the same feed. **Any option that changes one of these
two routes and not the other is cosmetic.** Every option below therefore states
its effect on both. This is a change to how `active-transaction` has been
treated so far, and is itself part of what is being decided.

Adjacent, and *probably* out of scope but worth naming: `GET
/api/transactions/:id` (`server/routes.ts:3023`) returns `publicTransactionDto`
for any non-token transaction to any anonymous caller, with no rate limit at
all. It exists because the numeric checkout and receipt pages need it. As long
as legacy numeric sales are created, that route is a second, independent
enumeration surface over the same fields. Options A and B drain it over time;
options C, D and E do not touch it.

## 4. The mechanism that already exists

Before inventing anything, note that this codebase already contains a complete,
reviewed "a link that addresses exactly one sale" mechanism:

- `transactions.payment_token_hash` — nullable, uniquely indexed, shape-checked
  to 64 hex chars (migration `0011_payment_links_and_board_numbers.sql`;
  `shared/schema.ts:193-211`).
- `createRetailTransaction(..., linkMode)` mints a 43-char base64url bearer
  credential, stores only its SHA-256 hash, and returns the raw token exactly
  once, in the authenticated create response
  (`server/retail-transaction-service.ts:54`; `server/routes.ts:2120-2137`).
- A full customer surface addressed only by that token:
  `/api/pay/t/:token`, `…/qr`, `…/split`, `…/session`,
  `…/hosted-fields-complete`, `…/googlepay-complete`, `…/receipt`,
  `…/receipt-pdf`, `…/receipt-qr`, plus `/api/pay/return/:state` and
  `/api/pay/notification/:state` (`server/routes.ts:1203-2005`), the
  `payment_attempts` durable attempt engine, and client routes `/pay/t/:token`,
  `/split/t/:token`, `/checkout/t/:token`, `/receipt/t/:token`
  (`client/src/App.tsx:966-969`).
- `tokenPaymentDto` deliberately carries **no** transaction, merchant or board
  identifier: "possession of the token is the complete public address"
  (`server/http-contracts.ts:249-253`).
- The SSE broker already refuses to put token-addressed sales into any
  anonymous stream (`server/sse-broker.ts:70`).

Two facts about it that constrain the options:

- It is gated by `FEATURE_NEW_RETAIL_PAYMENTS` (`server/routes.ts:2104` returns
  503 when off), which `server/config.ts:345` couples to a mandatory
  `PAYMENT_RETURN_STATE_SECRET` of ≥32 chars, independent of `JWT_SECRET`.
  **I cannot see the production value of that flag or that secret from here.**
- Only the **desktop** retail terminal ever requests it today
  (`client/src/desktop/pages/retail-terminal.tsx:237`). The three phone/tablet
  merchant terminals (`merchant-terminal.tsx:198`,
  `merchant-terminal-mobile.tsx:237`, `merchant-terminal-mobile-v2.tsx:221`)
  send no `linkMode` at all and therefore always create legacy sales — and
  `merchant-terminal.tsx` sends no `selectedStoneId` either, so it is the
  primary producer of exactly the stoneless sales this gap is about.

The token flow also has **no** real-time stream, by design: the link is minted
after the sale exists, so there is never anything to wait for. That is why it
sidesteps this entire problem.

Finally, the plan already has a position on this family of routes. §10.3: *"Legacy
numeric retail pay must converge on the token attempt service or be retired.
Never preserve a second callback state machine."*

## 5. Options

Five real options. Each states: what changes, what the customer experiences,
whether printed artifacts survive, migration path, cost, what it does **not**
fix, and its security end state. They are not all mutually exclusive; §6 says
how I would combine them.

---

### Option A — Retire the standing no-board address; converge on per-sale token links

**What changes.**
*Server:* delete the `legacy-no-board` branch from
`GET /api/merchants/:id/events` (so a request with neither credential is a 400/404)
and from `GET /api/merchants/:id/active-transaction`; retire `GET
/api/merchants/:id/qr` and `GET /nfc/:merchantId` in their no-board form, or turn
them into §5.4 `410` compatibility tombstones with an explanatory page. Remove
`{ kind: "legacy-no-board" }` from `SseAudience` and `ActiveTransactionScope`
once no caller remains.
*Client:* `customer-payment.tsx` keeps only its board branch; `/pay/:merchantId`
becomes an explanatory page ("ask the merchant for a payment link").
*Link generation:* the three phone/tablet terminals must gain the `linkMode:
"per_payment"` path the desktop terminal already has, and must display the
returned `/pay/t/<token>` QR on screen for the customer to scan.
*Physical artifacts:* printed merchant QRs and programmed NFC tags for the
no-board form **stop working**.

**Customer experience.** Instead of scanning a sticker and waiting, the customer
scans the QR the staff member shows them *for their sale*. No waiting state, no
ambiguity, no possibility of landing on someone else's basket. This is how the
desktop terminal already works.

**Printed QRs keep working?** No, for no-board. Board/stone QRs and tags are
unaffected — they are a different, correctly-scoped address.

**Migration.** Turn `FEATURE_NEW_RETAIL_PAYMENTS` on (requires
`PAYMENT_RETURN_STATE_SECRET`); ship per-payment link support in the mobile
terminals; leave both no-board endpoints serving in-flight legacy sales for a
bounded window; then tombstone. Existing legacy sales continue through the
already-shared finalisation path.

**Cost.** The largest of the five. Three merchant terminal screens change; a
customer-facing page is retired; a `410` tombstone and messaging are needed for
scanned-artifact traffic; merchants who printed something must be told. But
almost no *new* mechanism is built — the destination already exists and is
already reviewed.

**Does not fix.** Legacy numeric sales already in the database remain readable
via `GET /api/transactions/:id` until they age out; that surface drains rather
than closes. Nothing here changes gap 11 (split-session replay).

**Security end state.** The strongest. No anonymous merchant-wide stream exists
at all; every customer address is a 43-char unguessable bearer bound to one
sale; `isTarget`'s token exclusion means such sales were never in the anonymous
stream anyway. Fail-closed by construction, and it is the disposition plan
§10.3 already names.

---

### Option B — Keep the standing address, but use it to hand out a per-sale credential

**What changes.**
*Server:* `/pay/:merchantId` stops being a subscription address and becomes a
**claim** address. A new endpoint (say `POST /api/merchants/:id/claim-current-sale`)
returns, for the merchant's single unambiguous active stoneless sale, a
short-lived credential bound to that one transaction — either the existing
payment token (if the sale was minted with one) or a new short-TTL subscribe
credential hashed with the same `hashBearerCredential` primitive. The SSE route
gains a branch that accepts that credential and produces a **per-transaction**
audience; `isTarget` gains the matching case. The `legacy-no-board` audience is
deleted.
*Client:* `customer-payment.tsx` polls the claim endpoint while waiting, then
redirects into the token surface (`/checkout/t/:token` or the equivalent) and
never subscribes merchant-wide.
*Link generation / physical artifacts:* **unchanged.** Every printed QR and
programmed NFC tag keeps working.

**Customer experience.** Identical to today — scan the sticker, see "Waiting for
Payment", get pulled into your sale when staff ring it up — except the page is
now bound to one transaction and cannot be moved onto another.

**Printed QRs keep working?** Yes. This is the whole point of the option.

**Migration.** Additive: new endpoint, new audience kind, client change. No
schema change if the existing `payment_token_hash` column carries the
credential; a small additive table/column if a separate short-TTL subscribe
credential is preferred (my recommendation is the former — one credential
concept, per "boring over clever").

**Cost.** Moderate. One new endpoint with careful semantics, one new SSE
audience, one client page rewritten. The genuinely hard part is not code, it is
the **claim policy**, which is a product decision in its own right: when two
people scan the same sticker for the same sale (a couple splitting a bill; a
mis-scan), do they get the same credential or must the second be refused? I
would propose: the same credential while the sale is unambiguous, so splitting
still works — but that must be decided, not assumed.

**Does not fix.** An anonymous caller polling the claim endpoint at the right
moment can still obtain the current sale's credential — this narrows the window
from "forever" to "while a sale is open and unclaimed", and narrows the payload
from "every future sale" to "this one sale", but it does not eliminate it. The
standing address remains enumerable by merchant id. Combine with Option E to
close that.

**Security end state.** Good, not perfect. Cross-customer bleed and the
unbounded feed both go away; a residual timing/claim race remains, bounded and
loggable. Converges on the same end state as Option A, so it is a bridge, not a
detour.

---

### Option C — Keep merchant-wide, but fail closed on ambiguity and narrow the payload

**What changes.**
*Server:* both the SSE `legacy-no-board` branch and
`active-transaction`'s no-stoneId branch refuse to serve when the merchant has
more than one pending/processing stoneless sale — no data, a distinguishable
"ambiguous" response, nothing partial. `getActiveTransactionByMerchant`'s
`limit(1)` becomes "fetch 2, fail if 2" for the `legacy-no-board` scope. The
anonymous projection drops to the minimum the pay page needs (arguably
`id`, `price`, `status`, `splitEnabled` — `itemName` is the most
commercially-sensitive field and the page barely uses it). Optionally cap
anonymous stream lifetime and drop the 3-minute completed-sale fallback for
anonymous callers.
*Client:* a new "can't tell which sale is yours — please ask the merchant"
state, which is a variant of the waiting state that already exists.
*Link generation / physical artifacts:* unchanged.

**Customer experience.** Unchanged in the overwhelmingly common single-sale
case. In the concurrent case, instead of being silently routed to the wrong
sale, the customer is told to ask staff.

**Printed QRs keep working?** Yes.

**Migration.** None. No schema, no link change, no client route change. Pure
server narrowing plus one client string.

**Cost.** The smallest of the five. Realistically a day, failing-test-first,
with a two-concurrent-sale regression test that is red today.

**Does not fix.** *The core gap.* Anyone who knows or guesses a numeric merchant
id still receives that merchant's live sale feed. It fixes the cross-customer
bleed and the wrong-checkout routing of §3.3; it does not make the stream
authenticated.

**Security end state.** Materially better than today on correctness and on
"customer sees another customer's sale", unchanged on "stranger watches a
merchant's trading". Honest framing: this is containment plus a real correctness
fix, not closure.

---

### Option D — Keep merchant-wide, but require the merchant to opt in

**What changes.**
*Server:* a new merchant setting (`standingNoBoardLinkEnabled`, default
**false** — fail closed) gates both no-board branches. Merchants who have not
opted in get the same response as a merchant who never had the flow. Additive
migration, plus a settings toggle in the merchant app that explains what it
turns on.
*Physical artifacts:* unchanged for merchants who opt in; merchants who do not
opt in and *have* printed a sticker break at opt-in time unless they are
migrated on.

**Customer experience.** Unchanged at opted-in merchants. At everyone else the
standing address simply is not a payment surface.

**Printed QRs keep working?** Only for merchants who opt in — which is why
**whether printed artifacts exist in the field is a prerequisite question, not
a detail** (§7, Q2). If any exist, the honest default for those merchants is
"on", which weakens the option to a documentation exercise.

**Migration.** Additive column + backfill decision: default everyone off
(safest, breaks anyone relying on it) or backfill "on" for merchants with recent
stoneless sales (preserves behaviour, requires a query against production).

**Cost.** Low-to-moderate: one migration, one settings screen, two route gates.

**Does not fix.** Anything, for a merchant who opts in — it reduces the exposed
*population*, not the exposure. It also does not address §3.3's concurrency
defect at all.

**Security end state.** Weakest of the five as a standalone. It is genuinely
useful as a *combinator*: pair it with C and the residual exposure is "a small,
named, consenting set of merchants, and never across two concurrent sales".

---

### Option E — Keep the standing address, but make it unguessable

**What changes.**
*Server:* the standing address gains a per-merchant random secret
(`/pay/:merchantId/s/<secret>`, or a query parameter) that both no-board
branches require. The secret is rotatable from merchant settings; rotation
invalidates old artifacts.
*Link generation:* `generatePaymentUrl`/`generateQrCodeUrl`/`generateNfcTagUrl`
include it (`server/url-utils.ts`), so every newly rendered QR and NFC write
carries it.
*Physical artifacts:* every already-printed sticker and already-programmed tag
**breaks** the moment the secret is required — they encode the old form.

**Note on the SSE route specifically:** it currently rejects any `?token=`
outright ("SSE credentials must use the Authorization header",
`server/routes.ts:5295`) because the browser's native `EventSource` cannot set
headers. A secret in the query string would need a differently-named parameter
and would land in browser history and referrers. The cleaner path is the one
the merchant stream already uses — fetch-based streaming with an `Authorization`
header (`sseClient.connectMerchant`) — which is proven in this codebase but
would mean the customer page giving up native `EventSource` reconnection.

**Customer experience.** Unchanged.

**Printed QRs keep working?** No — same physical re-print cost as Option A, for
a much weaker end state.

**Cost.** Low-to-moderate in code; the cost is entirely in the field.

**Does not fix.** Cross-customer bleed and the §3.3 wrong-checkout routing are
untouched — the secret is still merchant-wide and shared by every scanner. A
secret embedded in a QR on a café counter is a public secret.

**Security end state.** Closes *enumeration* (guessing merchant id 1, 2, 3…),
which is real: it turns a trivially scriptable sweep into an attack that needs
physical or photographic access. It does not close disclosure or bleed. Listed
because it is the only option that closes enumeration without changing the flow
— but it pays Option A's migration price for less than Option A's benefit, so I
do not recommend it standalone.

---

## 6. What happens if we do nothing

The honest residual risk after `c1e42db1`, stated plainly:

1. **Anyone can watch any merchant trade, live, indefinitely.** Merchant IDs are
   small sequential integers appearing in ordinary public URLs
   (`/pay/123`, `/api/merchants/123/qr`). A script sweeping id 1…N holds one
   stream per merchant and records item names, prices, statuses, split state and
   timing for every stoneless sale, indefinitely. This is a competitor-grade
   revenue-and-catalogue feed, and it is tenant isolation failing in the
   direction the plan cares about most.
2. **The rate limit bounds abuse less than it appears.** 100 requests/IP/minute
   caps *new* subscriptions, not held ones; and with no `trust proxy` configured
   the keying may not be per-client at all (§3.2). Distributed or proxied access
   is not meaningfully constrained.
3. **Concurrent stoneless sales can mis-route a payment** (§3.3) — a customer
   can be redirected onto another customer's checkout and pay their amount.
   There is no committed regression test for this; nothing in the suite would
   catch it.
4. **It is not currently a live-funds risk in *this* environment.** No Windcave
   credentials are configured here and the leak is metadata, not card data —
   the same qualification both prior writeups made, and it remains true. It says
   nothing about production, whose configuration I cannot see.
5. **It stays open.** This is the third pass to touch gap 12. The gap-list entry
   is accurate and the mitigation is real, but "documented, rate-limited, still
   unauthenticated" is not a resting state — it is a decision that has not been
   taken. Unfixed, it also blocks a clean R1-T3 tenant matrix, since the
   route/tenant matrix cannot honestly record this route as scoped.

Doing nothing is a legitimate choice if — and only if — the answers to §7 are
"the no-board flow is unused in production." In that case the correct action is
not "do nothing", it is Option A's retirement, which is then nearly free.

## 7. Recommendation

**Recommended: land Option C now as containment, and commit to Option A as the
end state — with Option B as the pre-agreed fallback if, and only if, printed
or programmed no-board artifacts turn out to exist in the field.**

Reasoning:

- **C first, because it is the only part that needs no product decision at all**
  and it fixes a payment-correctness defect (§3.3) that is strictly worse than
  the confidentiality issue it was filed under. It is additive, schema-free,
  provable failing-test-first (a two-concurrent-stoneless-sale test is red
  today), and — importantly — it is *not thrown away* by A or B. Every one of
  those options wants "never serve an ambiguous answer" to remain true.
- **A as the end state, because the plan already chose it.** §10.3: *"Legacy
  numeric retail pay must converge on the token attempt service or be retired."*
  A builds almost nothing new; it routes an existing flow through an existing,
  reviewed, per-sale bearer mechanism and deletes an unauthenticated branch.
  It is the only option whose end state satisfies "fail closed", "never trust
  the client", and "boring over clever" simultaneously, and the only one that
  also drains the adjacent `GET /api/transactions/:id` surface.
- **B only if physical artifacts force it.** B is more code and a weaker end
  state than A, and it keeps a merchant-wide claim endpoint alive. Its single
  virtue is decisive if it applies: every printed sticker and programmed tag
  keeps working. If the answer to Q2 is "yes, merchants have printed these",
  B is right and A is not.
- **D and E are not recommended standalone.** D reduces the exposed population
  without reducing exposure and does nothing for §3.3. E pays A's field
  migration cost for a strictly weaker result. D is worth keeping in reserve as
  a combinator with C if a decision on A/B is going to take weeks.

**Sequencing that does not waste work:** C (days, no decision needed) → answer
Q1–Q3 → A or B (weeks) → tombstone the no-board endpoints. Each step is
independently shippable and each leaves the system strictly safer.

**This is a recommendation, not a decision.** A and B change what a paying
customer physically does at a counter, and B in particular encodes a product
rule about concurrent scanners. Those are Oliver's calls. If the decision is
"do nothing for now", that is also legitimate — but it should be recorded as a
dated, accepted risk in this file rather than left as a third deferral.

## 8. Questions only Oliver can answer

1. **Is the no-board `/pay/:merchantId` flow actually used in production, and by
   whom?** A count of stoneless, non-token transactions in the last 90 days, and
   how many distinct merchants produced them, decides between "retire it, nearly
   free" and "this is the main retail flow". Nothing in this repository can tell
   me this.
2. **Are there printed no-board QR codes or programmed NFC tags in the field?**
   Stickers on counters, table talkers, window decals, tags written from the
   merchant app. **If yes, Options A and E require physical re-issue and B
   becomes the recommendation instead.** The product actively encourages this
   (an 800px download button, an NFC-write button), so "no" cannot be assumed.
3. **Is "waiting for the merchant to start a sale" acceptable as a customer
   state?** It is already shipped, but Option C adds a second, rarer state —
   "two sales are open, please ask the merchant" — where the customer cannot
   proceed unaided. Acceptable, or must the flow always resolve?
4. **When two people scan the same standing code for the same sale, is that a
   supported case?** (Two diners splitting one bill.) If yes, Option B's
   credential must be shareable for the life of that sale, and Option C's
   ambiguity rule must count *sales*, not *scanners*. If no, both get simpler
   and stricter.
5. **Is `FEATURE_NEW_RETAIL_PAYMENTS` on in production, and is
   `PAYMENT_RETURN_STATE_SECRET` set?** Option A's timeline depends entirely on
   this. I cannot see production configuration.
6. **Should `GET /api/merchants/:id/active-transaction` remain public?** It is
   currently an accepted design, but §3.4 shows the SSE fix is cosmetic without
   it. This is a reversal of a prior acceptance and needs an explicit owner call,
   not an engineering assumption.
7. **How much does merchant-trading-metadata confidentiality matter
   commercially?** Item names, prices and timing for every stoneless sale is a
   competitor-usable feed. If merchants would consider this a breach of their
   expectations, the urgency of A/B rises sharply; if it is regarded as roughly
   public shop-window information, C alone may be an acceptable resting point.
8. **Do you want the three phone/tablet merchant terminals to gain per-payment
   links regardless?** They are the only producers of stoneless legacy sales
   today. That single change shrinks the gap's blast radius under every option
   — but it is feature work on a frozen branch (§1.4), so it needs your explicit
   scope approval.

## 9. Where I am uncertain about the live code

Flagged rather than asserted:

- **`trust proxy` / `req.ip` behaviour in production** (§3.2). I verified no
  `trust proxy` is set anywhere in the repo; I could not verify what `req.ip`
  resolves to behind Replit's proxy. The strength of the `c1e42db1` mitigation
  depends on it.
- **Production values of `FEATURE_NEW_RETAIL_PAYMENTS`,
  `PAYMENT_RETURN_STATE_SECRET`, `PAYMENT_MODE`.** Not visible from here.
- **Real traffic on the no-board flow.** No production data was queried — this
  pass was read-only on source and ran no database command.
- **Whether §3.3's mis-routing is reachable end-to-end in production**, as
  opposed to reachable by reading the selection logic and the client's redirect
  effect. I did not run the suite or build a runtime probe (both excluded from
  this pass, since another workflow is concurrently running tests in this tree).
  The code path is unambiguous, but it has not been demonstrated at runtime, and
  it should be proven with a red test before any fix lands.
- **Whether `merchant-terminal.tsx` (no `selectedStoneId`, no `linkMode`) is the
  terminal real merchants use.** I confirmed which client files create which
  kind of sale; I cannot see which screens are actually in front of merchants.
- **The exact `publicTransactionDto` fields the customer pay page truly
  requires.** Option C's payload narrowing needs that confirmed field by field
  against `checkout.tsx`/`split-payment.tsx`, which this pass did not do
  exhaustively.

## 10. Files read for this memo

`server/routes.ts` (2008–2089, 5289–5369, 246–278, 372–392, 1054–1090,
1203–1260, 2092–2165, 3023–3041), `server/sse-broker.ts`,
`server/http-contracts.ts` (223–339), `server/storage.ts` (1630–1659,
4698–4749, 453–456), `server/url-utils.ts`, `server/payment-attempt-service.ts`,
`server/payment-token.ts`, `server/retail-transaction-service.ts`,
`server/config.ts` (335–360, 485–495), `server/route-policy.ts`,
`server/route-inventory.ts` (159–210, 300–315),
`migrations/0011_payment_links_and_board_numbers.sql`, `shared/schema.ts`
(193–211, 558), `client/src/pages/customer-payment.tsx`,
`client/src/pages/token-payment.tsx`, `client/src/lib/sse-client.ts`,
`client/src/lib/payment-addressing.ts`,
`client/src/components/qr-code-display.tsx`, `client/src/App.tsx` (960–977),
the four merchant terminal create-sale call sites,
`server/__tests__/r1-t2-gap12-events-ratelimit.test.ts`,
`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md` (§1.4, §5.4, §8.5, §8.6,
§10.3), and both prior gap-12 records.

Note for future readers: at the time of writing this tree also held unrelated
uncommitted work (a trades "mobile quote flow" redesign) touching
`server/routes.ts` around line 8067 — far from every line cited above. Nothing
in this memo describes that work, and this pass modified no file except this
one.
