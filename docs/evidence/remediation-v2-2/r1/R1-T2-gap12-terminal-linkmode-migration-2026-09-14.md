# R1-T2 — gap 12: migrate three legacy terminals to per-payment links (independent re-verification)

Date: 2026-09-15. Branch: `remediation/r1-continuation-20260907`. HEAD at
start and end of this pass: `ab15647a` (git-tracked; unchanged — no commit was
made). This record is an **independent re-verification** of an implementer's
report on this task, not a first-time implementation — see "Provenance"
below. The three source files
(`client/src/pages/merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
`merchant-terminal-mobile-v2.tsx`) and three new colocated test files
(`merchant-terminal.test.tsx`, `merchant-terminal-mobile.test.tsx`,
`merchant-terminal-mobile-v2.test.tsx`) remain **uncommitted**, exactly as
handed in. No `git add` or `git commit` was run by this pass.

## Provenance

This is a redo of a task whose prior pass was blocked by a 2-reviewer panel
(1 approve / 1 reject), for the reason recorded verbatim in the task brief and
reproduced under "The mandatory fix" below. An implementer then reported this
redo as done, with its own evidence doc at
`docs/evidence/remediation-v2-2/r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-15.md`.
The house rule for this task is not to trust that report — every falsifiable
claim in it is re-derived here, independently, against the live working tree,
not relayed. Where this record's own findings match the implementer's
evidence doc, that is stated explicitly as agreement, not silently assumed.

## Docs read first

- `docs/decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md` — the
  finding that reframes gap 12's fix: per-transaction addressing
  (`linkMode: "per_payment"`) already exists, already ships, and the desktop
  retail terminal already uses it for board-less sales. The vulnerable
  population is exactly three older terminals that never send `linkMode` and
  silently default to `"legacy"`.
- `docs/decisions/2026-09-14-gap12-terminal-linkmode-migration-approval.md` —
  Oliver's approval ("Yes, proceed now"), scoped to these three files plus the
  missing share-link UI; explicitly **not** covering retiring the standing
  `/pay/:merchantId` address or the disjoint SSE-ambiguity fail-closed fix.
- `docs/decisions/2026-09-14-r1-h1-visual-baseline-acceptance.md` — the
  client-work gate (R1-H1) Oliver lifted, unblocking edits to these terminal
  files.
- `docs/evidence/remediation-v2-2/r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md`
  — read as the format/rigor model for this file only; its content (gap 11
  indexes) is unrelated to gap 12.
- The implementer's own evidence doc (`...-2026-09-15.md`), read in full and
  treated as a claim set to check, not as ground truth.

## Scope, confirmed against the live tree

**In scope**, exactly the three call sites named in the brief — confirmed by
`grep`/`Read` against the current tree, current line numbers:

1. `client/src/pages/merchant-terminal.tsx` — `createTransactionMutation`'s
   `mutationFn` never sent `selectedStoneId` (confirmed: no reference to
   `selectedStoneId` anywhere inside the mutation body; the component's own
   `selectedStoneId` state, declared line 42, is only threaded into the
   `ItemForm` stone-picker subcomponent, lines 991–1016 and its call site at
   1512 — never read by the mutation).
2. `client/src/pages/merchant-terminal-mobile.tsx` — conditional
   `selectedStoneId`.
3. `client/src/pages/merchant-terminal-mobile-v2.tsx` — conditional
   `selectedStoneId` via a `boardId` local.

**Explicitly out of scope, confirmed not touched**: `git diff --stat`
(reproduced below) lists no `server/*` file among this task's changes, no
`client/src/desktop/pages/retail-terminal.tsx`, and no
`RetailTerminalView.tsx`/`RetailTerminalViewCore.jsx`. `server/routes.ts`,
`server/storage.ts`, `server/sse-broker.ts`, and
`client/src/pages/customer-payment.tsx` are modified in the working tree, and
`client/src/pages/__tests__/customer-payment-flow.test.tsx` and
`server/__tests__/r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts` are
untracked and new — but this is the **separate, concurrently-run** gap-12
SSE/poll ambiguity fail-closed task (Option C), confirmed by its own evidence
doc `R1-T2-gap12-option-c-fail-closed-2026-09-15.md` present in the same
directory. None of those files were opened for modification by this pass;
only read as `git status`/`git diff --stat` context to confirm they were
correctly left alone.

---

## The mandatory fix — independently re-derived, not relayed

Re-read `server/routes.ts`'s `POST /api/transactions` handler directly in the
current tree (the concurrent Option C task also edits this file, so line
numbers move around; located by searching for `transactionWithUrls`) and
`server/url-utils.ts`. Confirmed: `paymentUrl` and `qrCodeUrl` are populated
**unconditionally** on every successful create —

```js
const paymentUrl = rawToken
  ? `${getBaseUrl(req)}/pay/t/${rawToken}`
  : generatePaymentUrl(transaction.merchantId!, transaction.taptStoneId, req);
const qrCodeUrl = rawToken
  ? `${getBaseUrl(req)}/api/pay/t/${rawToken}/qr`
  : generateQrCodeUrl(transaction.merchantId!, transaction.taptStoneId, req);
const transactionWithUrls = { ...transaction, paymentUrl, qrCodeUrl };
...
res.json(ownerTransactionDto(transactionWithUrls));
```

— regardless of `linkMode`. So gating the new share-link UI on response
`paymentUrl`/`qrCodeUrl` presence (the prior, blocked pass's plan) would show
the "private per-sale link" UI even for a board's standing shared address —
exactly the bug the reviewing panel correctly caught.

**What this pass's diff actually does, verified by reading the diff itself,
not the implementer's description of it:**

- **File 1** (`merchant-terminal.tsx`): never sends `selectedStoneId` at all
  (confirmed above), so `linkMode: "per_payment"` is added unconditionally to
  the request body, and the overlay is shown unconditionally in `onSuccess`.
  There is no legacy branch to mis-gate here because none is ever sent.
- **File 2** (`merchant-terminal-mobile.tsx`): the request body is
  `...(data.selectedStoneId ? { selectedStoneId: data.selectedStoneId,
  linkMode: "legacy" as const } : { linkMode: "per_payment" as const })`, and
  `onSuccess(created, variables)` gates the overlay on
  `!variables.selectedStoneId` — react-query's mutation `variables` (the
  input to `mutationFn`), never the response. Read directly at the diff's
  location; confirmed.
- **File 3** (`merchant-terminal-mobile-v2.tsx`): `handleLiveSend` computes
  `const boardId = selectedStoneId ?? undefined;` once, uses it for **both**
  the request body's `selectedStoneId` and the overlay gate
  (`if (!boardId) { setShareLink(...) }`). Confirmed by reading the diff.

**The critical test check, done by reading the test files myself, not by
trusting the report's description of them:** in both file 2's and file 3's
test files, the "stone selected"/"board selected" test case's mocked POST
response **does** include `paymentUrl`/`qrCodeUrl` (e.g. file 2's mock:
`{ id: 2, itemName: "Coffee", price: "5.00", taptStoneId: 42, paymentUrl:
"https://merchant.example/pay/1/stone/42", qrCodeUrl:
"https://merchant.example/pay/1/stone/42/qr" }`) and the test asserts
`screen.queryByTestId("share-link-overlay")` is **not** in the document. This
is exactly the realistic-mock shape the brief demanded and the shape a naive
response-presence gate would wrongly pass. Both tests were independently
re-run **red** (against the unmodified source, see below) for this specific
reason before being made to pass.

**Conclusion: the mandatory fix is implemented correctly, verified by
independent reading of both the source diff and the test assertions, not by
trusting the report's prose.**

---

## Per-file changes — confirmed by direct diff read (not relayed)

### 1. `client/src/pages/merchant-terminal.tsx`

- `linkMode: "per_payment"` added unconditionally to the create body.
- `onSuccess(created)` sets a new `shareLink` state
  (`{item, amount, paymentUrl, qrCodeUrl}`) unconditionally.
- `onError(error)` now uses `apiErrorMessage(error, "Failed to create
  transaction")`.
- New overlay JSX (fixed inset-0, X close button, `QRCodeDisplay`, copyable
  link text, "Copy Link" button) inserted as a sibling of the existing
  "Payment success overlay" inside the component's main return, shown
  whenever `shareLink` is non-null. **Correction of an initial misreading in
  this pass**: `git diff`'s function-context heading placed this hunk under
  `function PaymentStatus(...)` (a separate, later-declared function in the
  same file), which briefly looked like a scope bug (`shareLink` used outside
  the component that declares it). Reading the actual file at that location
  resolved this: `StonesSection`, `ActionsToolbar`, `ItemForm`,
  `StockTagging`, and `PaymentStatus` are all function declarations **nested
  inside** `MerchantTerminal`'s own render body (confirmed: no closing brace
  for `MerchantTerminal` appears between its `export default function
  MerchantTerminal() {` at line 37 and its actual `return (` at line 1353;
  `PaymentStatus`'s own body closes at line 1344, well before that `return`).
  The new overlay sits in the outer component's JSX, in scope of the
  `shareLink`/`setShareLink` hooks declared at lines 64–67. No scope bug.
  (This nested-declaration pattern is itself the subject of an existing,
  correctly-named out-of-scope finding below — it is a real design smell, just
  not the bug it briefly looked like.)
- `shareLink` cleared in the existing completion-detection effect
  (`status === 'completed' && prev && prev !== 'completed'` branch),
  alongside the pre-existing `setCurrentTransaction(null)`.
- New state (`shareLink`, `copiedShareLink`, `copiedShareLinkTimerRef`) sits
  at lines 64–67, immediately after the pre-existing
  `copiedPaymentLinkTimerRef` — **before** the `if (!merchantId) return`
  early return, confirmed at its current line 142 by `grep -n "if
  (!merchantId)"`. Hook order preserved.
- `copiedShareLink` kept separate from the pre-existing `copiedPaymentLink`
  (used by the older standing-address panel elsewhere in the file).

### 2. `client/src/pages/merchant-terminal-mobile.tsx`

- Request body ternary as above; `onSuccess(created, variables)` gates on
  `!variables.selectedStoneId`.
- `onError(error)` uses `apiErrorMessage`.
- The overlay JSX is computed once as a `shareLinkOverlay` const and rendered
  via `{shareLinkOverlay}` in **both** the `isMobile` branch (near line 1622)
  and the "Desktop/Non-mobile version" branch (near line 2296) — confirmed by
  reading both insertion points in the diff; since both reference the same
  JSX expression, the two branches structurally cannot diverge.
- New state (`shareLink`, `copiedShareLink`) sits immediately after
  `showSuccessOverlay`, before `prevTransactionStatusRef` — confirmed
  **before** the `if (!merchantId) { ... }` early return at line 157.
- `shareLink` cleared in the same completion-detection-effect pattern as
  file 1.

### 3. `client/src/pages/merchant-terminal-mobile-v2.tsx`

- Request-body ternary added to the existing `selectedStoneId:
  data.selectedStoneId` line; `handleLiveSend`'s `boardId` local reused for
  the gate, as described above.
- `onError(error)` uses `apiErrorMessage`.
- New sibling `<AnimatePresence>` block (framer-motion, fixed inset-0, X close
  button, `QRCodeDisplay`) added directly after the existing Tap-to-Pay
  `<AnimatePresence>` block. `RetailTerminalView`/`RetailTerminalViewCore`
  confirmed **not** in the diff (`git diff --stat`, reproduced below, lists
  only this task's six files).
- `shareLink` cleared in the existing completion-detection effect, alongside
  `setSuccessNotif(...)`.
- This file's `if (!merchantId) return` sits after all hooks (confirmed
  unchanged), so no hook-order hazard applies here.
- `showPaywave={false}` confirmed still hard-coded at this file's
  `<RetailTerminalView ...>` call site (line 512) — the stated reason the
  named share-overlay/Tap-to-Pay-overlay latent interaction is unreachable
  today.

---

## Error handling — confirmed

`apiErrorMessage`/`apiErrorStatus` (`client/src/lib/api-error.ts`) are used by
all three `onError` handlers, confirmed by reading each import list and each
handler body. Traced the actual mechanics rather than trusting the
description: `apiRequest` (`client/src/lib/queryClient.ts`) throws `` `${res.status}: ${text}` `` on a non-OK response
(`throwIfResNotOk`); `apiErrorMessage` finds the first `{` in that message,
`JSON.parse`s from there, and returns `payload.message` if it is a non-empty
string. For a 503 body `{"message":"Per-payment links are not enabled
yet"}`, this reduces exactly to `"Per-payment links are not enabled yet"` —
independently traced end-to-end, not assumed from the function's name.

**Production flag caveat, unresolved, carried forward as-is**:
`FEATURE_NEW_RETAIL_PAYMENTS`'s real production value remains only
owner-attested. This pass has no production access and did not attempt to
verify it. If it is off in production, all three terminals will 503 on every
board-less sale the moment this ships; the new 503 toast is the documented,
owner-accepted fallback UX for that case, not a fix for the underlying risk.

---

## Out-of-scope findings — independently confirmed, not fixed

1. **`merchant-terminal.tsx` — board selection disconnected from
   creation.** Confirmed: `selectedStoneId` state (line 42) is threaded only
   into `ItemForm`'s stone-picker UI; `createTransactionMutation`'s
   `mutationFn` never references it. A merchant can pick a specific Tapt
   Stone and the created sale is still always stoneless. Left as-is, per the
   brief's explicit instruction.
2. **`merchant-terminal-mobile.tsx` — the "No specific stone" sentinel
   produces `NaN`.** Confirmed at **both** occurrences
   (`onValueChange={(value) => field.onChange(value ? parseInt(value) :
   undefined)}`, current lines 955 and 1891, each paired with a `SelectItem
   value="none"` at lines 962/1898). `"none"` is truthy, so
   `parseInt("none")` is `NaN`, not `undefined`. Confirmed real,
   pre-existing, not introduced or fixed by this task. Confirmed harmless to
   this task's own gating: `NaN` is falsy, so
   `data.selectedStoneId ? ... : ...` still resolves to the `per_payment`
   branch when "No specific stone" is explicitly chosen.
3. **Nested per-render subcomponent identity in files 1 and 2 (and, as noted
   above, this includes `PaymentStatus` in file 1).** Confirmed: these
   subcomponents are function declarations nested inside the page
   component's own render body, so each gets a fresh function identity every
   render, forcing React to remount them on unrelated state changes (e.g. the
   NFC-capabilities fetch). This pass did not independently reproduce the
   claimed `userEvent`-click-drop interaction via an isolated repro (the
   report says the implementer did, "outside the committed test suite," so
   it is not itself checkable from the tree); it is architecturally
   plausible given the remount-on-every-render behavior, and the choice to
   use `fireEvent` instead of `userEvent` throughout the new tests is a
   reasonable, low-risk way to sidestep the risk either way. Treated here as
   **plausible, not independently reproduced** — flagged explicitly rather
   than either endorsed or dismissed.
4. **File 3's latent share-overlay / Tap-to-Pay-overlay interaction.**
   Confirmed unreachable today because `showPaywave={false}` is hard-coded at
   this file's `<RetailTerminalView>` call site (see above). This finding
   originates with the prior review panel, per the brief, and is carried
   forward unfixed, correctly.

None of the four are fixed, correctly, per the brief's explicit scope
boundary; all four are named rather than silently absorbed.

---

## Test file placement — confirmed

Colocated beside their pages, matching
`client/src/desktop/retail-terminal.test.tsx`'s convention:
`client/src/pages/merchant-terminal.test.tsx`,
`client/src/pages/merchant-terminal-mobile.test.tsx`,
`client/src/pages/merchant-terminal-mobile-v2.test.tsx` — confirmed present
at exactly these paths.

---

## Independent verification performed in this pass

All of the following was run fresh, in this pass, against the live working
tree — none of it is relayed from the implementer's report.

### 1. Scope compliance

```
git status --short
```
shows exactly the three target source files, three new test files, and this
evidence doc as this task's footprint; `customer-payment.tsx`,
`server/routes.ts`, `server/sse-broker.ts`, `server/storage.ts`, and the two
Option-C artifacts belong to the separate concurrent task and were not
opened for modification.

```
git diff --numstat -- client/src/pages/merchant-terminal.tsx client/src/pages/merchant-terminal-mobile.tsx client/src/pages/merchant-terminal-mobile-v2.tsx
```
→ `104  3  merchant-terminal.tsx`, `120  5  merchant-terminal-mobile.tsx`,
`113  5  merchant-terminal-mobile-v2.tsx` — matches the implementer's report
exactly.

### 2. `npm run check` (tsc)

Run with all edits in place: **clean, zero output, exit 0.**

### 3. True pre-task baseline, re-derived from the live tree (not trusted from the report)

The report's claimed baseline is "53 suites / 492 tests." Rather than take
this on faith, this pass reconstructed the exact pre-task state by hand:
`git checkout --` the three target source files back to HEAD, and moved this
task's three new test files **and** the concurrent task's own new test file
(`customer-payment-flow.test.tsx`) out of the working tree temporarily (kept
in the scratch directory, not deleted), leaving the concurrent task's
*source* modifications (`server/routes.ts`, `server/storage.ts`,
`server/sse-broker.ts`, `customer-payment.tsx`) in place exactly as they
already were before this pass began (per this session's opening `git
status`). Ran:

```
npx jest --selectProjects client
```
→ **`Test Suites: 53 passed, 53 total. Tests: 492 passed, 492 total.`** —
reproduces the reported baseline **exactly**. All files were then restored
(`git apply` of a saved diff of the three source files, then moving the four
held-out test files back) and a byte-for-byte `diff` of the source diff
before/after this round-trip confirmed **identical** — nothing was lost or
altered by this exercise.

### 4. Red-before-fix, re-run directly (not trusted from the report)

With the three target source files reverted to HEAD again (this task's three
new test files left in place this time), ran:

```
npx jest --selectProjects client --testPathPatterns="merchant-terminal.test.tsx|merchant-terminal-mobile.test.tsx|merchant-terminal-mobile-v2.test.tsx"
```
→ **`Test Suites: 3 failed, 3 total. Tests: 14 failed, 14 total.`** — all 14
new tests (4 + 5 + 5) genuinely fail against the unmodified source, including
both files 2 and 3's bug-prevention tests (confirmed by reading the failure
output: file 2's and file 3's "stone/board selected" tests failed on the
missing `linkMode: "legacy"` key in the observed request body, not on some
unrelated error — the request itself, including driving the mocked `Select`
and the `RetailTerminalView` stub, reached the assertion correctly).

### 5. Green-after-fix, re-run directly

Re-applied the three source files' diff (`git apply`, confirmed byte-identical
to the pre-revert diff by direct `diff`), and re-ran the same command:

→ **`Test Suites: 3 passed, 3 total. Tests: 14 passed, 14 total.`**

### 6. Final full suite and tsc, re-run fresh

```
npm run check
```
→ clean, exit 0.

```
npx jest --selectProjects client
```
→ **`Test Suites: 57 passed, 57 total. Tests: 511 passed, 511 total.`**
Arithmetic, independently reconciled: 53 (baseline, §3) + 14 (this task's own
three new suites' tests, §4/§5) + 1 suite / 5 tests
(`customer-payment-flow.test.tsx`, the concurrent Option-C task's own new
file, confirmed by name and by its residence in
`client/src/pages/__tests__/`, not this task's work) = 57 suites / 511
tests. Matches exactly.

### 7. Pre-existing smoke/syntax suites — no regression

```
npx jest --selectProjects client --testPathPatterns="smoke-tests|jsx-syntax-smoke|syntax-validation"
```
→ **`Test Suites: 3 passed, 3 total. Tests: 72 passed, 72 total.`** Confirmed
by reading each file's own import list that `merchant-terminal-mobile-v2` is
never imported by any of the three (`syntax-validation.test.tsx`:
`require('../merchant-terminal-mobile')` and `require('../merchant-terminal')`
only; `jsx-syntax-smoke.test.tsx`: dynamic `import('../merchant-terminal')`
and `import('../merchant-terminal-mobile')` only; `smoke-tests.test.tsx`:
static imports of the same two) — so this check is correctly scoped to the
two files it can actually regress, and both pass with no change in count.

### 8. Discriminator correctness, read directly

Confirmed by reading the diffs themselves (not the report's prose): file 2
gates on `variables.selectedStoneId` (the mutation's own input, from
react-query's `onSuccess(data, variables)` signature); file 3 gates on a
`boardId` local computed once and shared between the request body and the
gate; file 1 has no branch to mis-gate since it never sends
`selectedStoneId`. All three avoid response-field presence as the
discriminator. Confirmed independently that `server/routes.ts` still
populates `paymentUrl`/`qrCodeUrl` unconditionally on every successful create
(see "The mandatory fix" above) — so this discriminator choice is not merely
stylistically preferred, it is the only one that is actually correct against
the live server behavior.

### 9. QRCodeDisplay reuse

Confirmed `QRCodeDisplay` (`@/components/qr-code-display`, already imported
in all three files before this task per the brief) is the component used in
all three new overlays — no new QR renderer was built. Confirmed its `alt="Payment QR Code"` matches what all three test files assert via
`screen.getByAltText("Payment QR Code")`.

---

## What this closes, and what it does not

**Closes**: the three named call sites now mint per-payment links for
board-less sales (mirroring the desktop retail terminal), each now has a
"share this link" UI it previously lacked, and all three surface the real
server error message (including the 503 feature-flag-off case). The specific
bug that blocked the prior pass — gating the share UI on response field
presence — is independently confirmed avoided, in both the implementation and
the tests that would have caught its absence.

**Does not close**:

- Retiring the standing `/pay/:merchantId` address — needs a
  separately-scheduled production traffic-drain window.
- The gap-12 SSE/poll ambiguity fail-closed fix (Option C) — a disjoint task,
  worked concurrently in this same tree by a different process; not read, not
  touched by this pass.
- `FEATURE_NEW_RETAIL_PAYMENTS`'s real production value — still only
  owner-attested, not independently verifiable without production access.
- The four out-of-scope findings above (board-selection/creation disconnect;
  the `NaN`-sentinel bug; the nested-per-render-subcomponent pattern in files
  1/2; file 3's latent paywave/share-overlay interaction) — all real or
  plausible, all named, none fixed, per this task's explicit scope boundary.
- R1-T8's hook-order issue itself — not worsened (hook order independently
  re-confirmed for files 1 and 2 above), not fixed.

## Remaining risk / open items

- The production flag-verification gap remains open; this pass has no way to
  close it.
- File 3's latent paywave/share-overlay interaction is unreachable today only
  because `showPaywave={false}` is hard-coded at this screen's call site;
  re-examine if that is ever changed.
- The nested-per-render-subcomponent `userEvent`-click-drop claim (out-of-scope
  finding 3 above) was not independently reproduced by this verification
  pass; it is architecturally plausible but stated here as unconfirmed rather
  than endorsed.
- File 2's `isMobile` branch shares its overlay JSX by reference with the
  directly-tested "Desktop/Non-mobile version" branch (confirmed via the
  diff), so it has not received a second, independent interaction-driven test
  pass — this is the same reference-sharing guarantee the implementer's
  report names, independently confirmed structurally correct here rather than
  re-asserted from the report's own claim.

No discrepancy was found, in this pass, between what the implementer's report
claimed and what the live working tree, test suite, and tsc output actually
show — every falsifiable claim checked above reproduced exactly.
