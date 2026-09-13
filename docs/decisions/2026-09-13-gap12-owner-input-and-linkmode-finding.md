# Gap 12 — owner input, and the finding that reframes the fix

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`.
Supplements (does not supersede)
[gap12 addressing options](2026-09-13-gap12-anonymous-sse-addressing-options.md).

This record exists because the options memo was written without two things: the
owner's answers to its blocking questions, and the fact below about
`linkMode`, which was found afterwards while checking what
`FEATURE_NEW_RETAIL_PAYMENTS` actually gates. Together they shrink the
recommended fix from "design a new addressing scheme" to "make three screens
use the mechanism a fourth screen already uses."

## 1. Owner input recorded 2026-09-13

Asked because the options memo could not choose between retiring and migrating
the standing no-board address without them. Answers are Oliver's, recorded
verbatim in substance, not paraphrased into something stronger:

| Question | Answer |
|---|---|
| Are there printed no-board QR codes or programmed NFC tags in the field? | **No — demo only.** |
| Is the no-board `/pay/:merchantId` flow actually used in production? | **Yes** — it is the flow used when a sale is not run through a payment board. |
| Is `FEATURE_NEW_RETAIL_PAYMENTS` on in production? | Believed yes — "if that's the new payment feature page on the retail terminal." **Not independently verified; see §4.** |

The first answer is the decisive one. The options memo identified physical
artifacts in the field as the single blocker to retiring the standing
merchant-wide address, because a printed QR cannot be re-issued remotely. With
no such artifacts deployed, that blocker does not exist.

The second answer means the flow cannot simply be deleted. It must keep
working; only its addressing changes.

## 2. The finding: per-transaction addressing already exists and is already in use

`shared/schema.ts:558` defines `linkMode: z.enum(["legacy", "per_payment"])`,
defaulting to `"legacy"`.

`server/retail-transaction-service.ts:63-90` implements both:

- `"legacy"` creates the transaction with no credential — no `paymentTokenHash`.
- `"per_payment"` mints a hashed bearer credential, stores only the hash, and
  returns the raw token once. The customer link is `/pay/t/<rawToken>`, which
  addresses exactly one sale.

This matters directly to gap 12 because `server/sse-broker.ts`'s `isTarget()`
scopes the vulnerable `legacy-no-board` audience to transactions where
`taptStoneId == null` **and** `paymentTokenHash == null`. A `per_payment`
transaction carries a hash, so it is structurally excluded from that audience.
**Per-payment sales are already not exposed by gap 12.**

`client/src/desktop/pages/retail-terminal.tsx:237-238` already chooses
correctly:

```
? { linkMode: "per_payment" }                                   // no board
: { selectedStoneId: sale.destination.boardId, linkMode: "legacy" }  // board
```

So the desktop retail terminal already produces per-sale addressed links for
board-less sales, and is already safe.

## 3. The actual vulnerable population

Three older terminals never send `linkMode` at all, so every sale they create
silently defaults to `"legacy"`:

| Call site | Board handling | Exposure |
|---|---|---|
| `client/src/pages/merchant-terminal.tsx:198` | never sends `selectedStoneId` | **always** creates a stoneless legacy sale — always exposed |
| `client/src/pages/merchant-terminal-mobile.tsx:237` | sends optional `selectedStoneId` | exposed whenever no board is selected |
| `client/src/pages/merchant-terminal-mobile-v2.tsx:221` | sends optional `selectedStoneId` | exposed whenever no board is selected |

That is the whole population behind both gap-12 symptoms — the unauthenticated
metadata stream, and the more serious wrong-sale redirect recorded as finding
(a) in the tracker's gap 12 entry.

Consequence for the options memo: its Option A ("retire the standing address,
converge on `/pay/t/:token`") does not require building anything. It requires
these three call sites to pass `linkMode: "per_payment"` when no board is
selected, mirroring the desktop terminal exactly. Once no new legacy stoneless
sales are created, the `legacy-no-board` audience empties by attrition and the
standing address can be retired rather than defended.

This also answers the memo's open question about whether the three mobile
terminals should "gain per-payment links despite the feature freeze" with more
precision than the memo could: this is not a new capability entering the
branch. It is three screens adopting an existing, already-shipped,
already-flag-gated mechanism that a fourth screen already uses. That is better
characterised as a security fix than as new scope — but see §5, it is still
gated.

## 4. How to verify the flag without production access

No agent in this lineage can read production environment values. The
behavioural check is exact, because the server returns a specific refusal:
`POST /api/transactions` with `linkMode: "per_payment"` returns
**503 "Per-payment links are not enabled yet"** when
`config.features.newRetailPayments` is false (`server/routes.ts:2104`), and the
API-v1 sale path returns the same (`server/routes.ts:6036`).

So: if creating a board-less sale on the **desktop retail terminal** works in
production and yields a `/pay/t/...` link, the flag is on. If it fails with
that 503, it is off — and in that case the fix in §3 is blocked until it is
enabled, because those three terminals would start receiving 503s.

**This must be confirmed before the §3 change ships**, not assumed from the
owner's "should be."

## 5. What is still gated, and what was deliberately not done

- The §3 change edits three client terminal files. Plan R1-H1 explicitly gates
  client work on the owner accepting the exact visual baseline, which remains
  outstanding (see the tracker's R1-H1 row). **No terminal file was edited.**
- It is also a real workflow change for staff: today a board-less customer
  scans a standing merchant QR and waits for a sale to appear; with
  per-payment, each sale mints its own link the terminal must display. With no
  printed codes in the field this is deployable, but it is a product change on
  those three screens and needs the owner's acceptance, not an agent's.
- `client/src/pages/merchant-terminal.tsx` is also on plan §8.7's hook-order
  crash list (R1-T8). Whoever edits it should expect that interaction.
- Nothing in §3 was implemented. This record exists so the finding is not lost
  between sessions.

## 6. Recommended sequence for the next session

1. Confirm the flag's real production value by the §4 behavioural check.
2. Obtain R1-H1 acceptance, or an explicit owner exception scoped to these
   three call sites.
3. Land the fail-closed-on-ambiguity change from the options memo first — it
   is schema-free, needs no product decision, is red-testable today, and is not
   discarded by step 4. Note its natural home is
   `getActiveTransactionByMerchant` in `server/storage.ts`, which is **not**
   among the files currently carrying unrelated uncommitted work, so it can be
   committed cleanly; the route-level pieces in `server/routes.ts` cannot be
   until that other work is committed (git stages whole files).
4. Then make the three call sites send `linkMode: "per_payment"` for board-less
   sales, and only afterwards retire the standing address.
