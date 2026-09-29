# R1-T2 — gap 12: migrate three legacy terminals to per-payment links

Date: 2026-09-15. Branch: `remediation/r1-continuation-20260907`. HEAD at
start and end: `ab15647a` (git-tracked). This task's source changes
(`client/src/pages/merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
`merchant-terminal-mobile-v2.tsx`, and the three new colocated test files
`merchant-terminal.test.tsx`, `merchant-terminal-mobile.test.tsx`,
`merchant-terminal-mobile-v2.test.tsx`) remain **uncommitted** in the working
tree, as instructed — no commit was made by this pass and none was asked for.

This is a redo. A prior pass through this exact task was blocked by a
2-reviewer panel (1 approve / 1 reject) — see
`docs/HANDOFF-2026-09-14-workflows-in-flight.md` and the task brief's own
account. The rejecting reviewer's finding, reproduced and neutralized here, is
recorded in full below under "The mandatory fix".

## Docs read first

- `docs/decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md` — the
  finding that reframes gap 12's fix: per-transaction addressing
  (`linkMode: "per_payment"`) already exists, already ships, and the desktop
  retail terminal already uses it for board-less sales. The vulnerable
  population is exactly three older terminals that never send `linkMode` and
  silently default to `"legacy"`.
- `docs/decisions/2026-09-14-gap12-terminal-linkmode-migration-approval.md` —
  Oliver's approval ("Yes, proceed now"), scoped to these three files plus the
  missing share-link UI, explicitly **not** covering retiring the standing
  `/pay/:merchantId` address or the disjoint SSE-ambiguity fail-closed fix.
- `docs/decisions/2026-09-14-r1-h1-visual-baseline-acceptance.md` — the
  client-work gate (R1-H1) Oliver lifted, unblocking edits to these terminal
  files.

## Scope, stated up front

**In scope**, exactly the three call sites named in the brief:

1. `client/src/pages/merchant-terminal.tsx` — always-stoneless create; add
   `linkMode: "per_payment"` unconditionally and always show the share-link
   overlay after a successful create.
2. `client/src/pages/merchant-terminal-mobile.tsx` — conditional
   `selectedStoneId`; add the matching `linkMode` ternary and gate the
   share-link overlay on the same no-stone-selected condition, in both its
   `isMobile` and "Desktop/Non-mobile version" render branches.
3. `client/src/pages/merchant-terminal-mobile-v2.tsx` — conditional
   `selectedStoneId` (no NaN risk); same ternary and gating, rendered as an
   independent sibling overlay (RetailTerminalView/RetailTerminalViewCore
   untouched).

**Explicitly out of scope, and not touched**: any server file (confirmed via
`git diff --stat` below — no `server/*` file appears); retiring the standing
`/pay/:merchantId` address; the gap-12 SSE/poll ambiguity fail-closed fix
(`server/storage.ts`, `server/routes.ts`, `server/sse-broker.ts`,
`client/src/pages/customer-payment.tsx` — a separate, disjoint task); fixing
R1-T8's hook-order issue itself; `client/src/desktop/pages/retail-terminal.tsx`
and `RetailTerminalView.tsx`/`RetailTerminalViewCore.jsx`.

**A concurrent, unrelated task was actively modifying this same shared
working tree during this pass** — `git status` throughout showed
`server/routes.ts`, `server/storage.ts`, `server/sse-broker.ts`, and
`client/src/pages/customer-payment.tsx` as modified, plus untracked
`client/src/pages/__tests__/customer-payment-flow.test.tsx`,
`server/__tests__/r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts`, and
(by the end) its own evidence doc
`R1-T2-gap12-option-c-fail-closed-2026-09-15.md`. This matches the gap-12
SSE/poll fail-closed task this brief explicitly named as running in parallel.
None of those files were read for modification or modified by this pass —
confirmed by the final `git diff --stat` below, which lists only this task's
six files. Because the full client suite (`npx jest --selectProjects client`)
necessarily also picks up that other task's new test file, the "after" totals
reported below include one suite/five tests that are **not** this task's
work; each step's own delta is called out separately so the two are never
conflated.

---

## The mandatory fix — what the prior pass's plan got wrong, and how this pass avoids it

Confirmed by reading `server/routes.ts`'s `POST /api/transactions` handler
directly (current lines 2182–2251, re-verified fresh in this pass — see
"Further independent re-verification" below) and `server/url-utils.ts`'s
`generatePaymentUrl`/`generateQrCodeUrl`: `paymentUrl` and `qrCodeUrl` are
populated **unconditionally** on every successful create —

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

— regardless of `linkMode`. `server/http-contracts.ts`'s
`transactionAddressFields` includes `paymentUrl`/`qrCodeUrl` whenever they are
strings (always true here), and `taptStoneId` is always included via
`publicTransactionDto`, null for stoneless/`per_payment` sales and a number
for board/`legacy` sales.

**Gating the new share-link UI on response `paymentUrl`/`qrCodeUrl`
presence** — the prior pass's plan — would therefore show the new "private
per-sale link" UI even for a board's standing shared address, mislabeling a
shared address as private. This pass gates instead on **what the client
itself decided when building the create request**: whether a board/stone was
selected for that specific call — the same condition already used to choose
`linkMode: "per_payment"` vs `"legacy"`, mirroring
`client/src/desktop/pages/retail-terminal.tsx`'s destination-kind spread
(confirmed at its current lines 228–241) exactly:

```js
...(sale.destination.kind === "no-board"
  ? { linkMode: "per_payment" }
  : { selectedStoneId: sale.destination.boardId, linkMode: "legacy" }),
```

Concretely, per file:

- **File 1** always omits `selectedStoneId` (confirmed — see the
  out-of-scope finding below), so it is unconditionally `per_payment` and the
  overlay unconditionally shows after a successful create.
- **Files 2 and 3** gate on the mutation's own decision — file 2 via
  `onSuccess`'s `variables.selectedStoneId` (react-query's mutation
  `onSuccess(data, variables)` signature), file 3 via the `boardId` local
  variable computed once and used for both the request body and the gate.

**Every legacy/board-selected test case in files 2 and 3 mocks a POST
response that still includes `paymentUrl` and `qrCodeUrl`** — the exact
realistic-mock requirement that would catch the original bug — and asserts
the share UI still does **not** appear. This is the single most important
check in this task; see the "stone selected" / "board selected" tests below
in each file's transcript.

---

## Per-file changes

### 1. `client/src/pages/merchant-terminal.tsx`

- Added `linkMode: "per_payment"` unconditionally to the create request body
  (this call site never sends `selectedStoneId`, confirmed unchanged — see
  the out-of-scope finding below).
- `onSuccess(created)` now sets a new `shareLink` state
  (`{item, amount, paymentUrl, qrCodeUrl}`) from the response, unconditionally
  (there is no legacy case here to distinguish).
- `onError(error)` now uses `apiErrorMessage(error, "Failed to create
  transaction")` from `@/lib/api-error` instead of the generic fallback
  string, surfacing the real server message (including the 503
  "Per-payment links are not enabled yet" case).
- New full-screen overlay (fixed inset-0, X close button, `QRCodeDisplay`,
  copyable link text, a "Copy Link" button) rendered as a sibling of the
  existing "Payment success overlay", shown whenever `shareLink` is non-null.
- `shareLink` is cleared (`setShareLink(null)`) in the existing
  active-transaction-status-flip-to-`completed` effect, alongside the
  existing `setCurrentTransaction(null)`.
- New state (`shareLink`, `copiedShareLink`, `copiedShareLinkTimerRef`) added
  in the file's **first** hook group (immediately after
  `copiedPaymentLinkTimerRef`, line 61 pre-edit), strictly before the
  `if (!merchantId) return ...` early return (now line 142) — confirmed by
  `grep` after editing; hook call order/count is unchanged for every render
  path. `copiedShareLinkTimerRef` is also added to the existing
  unmount-cleanup effect.
- Kept `copiedShareLink` as a state variable **separate** from the
  pre-existing `copiedPaymentLink` (used by the older standing-address
  "Share Payment Link" panel elsewhere in the same file), so the two "copied"
  indicators never cross-wire.

### 2. `client/src/pages/merchant-terminal-mobile.tsx`

- Create request body: `...(data.selectedStoneId ? { selectedStoneId:
  data.selectedStoneId, linkMode: "legacy" as const } : { linkMode:
  "per_payment" as const })`, replacing the old unconditional
  `selectedStoneId: data.selectedStoneId`. `data.selectedStoneId`'s type is
  `number | undefined` per its zod schema; the falsy check also correctly
  absorbs the pre-existing NaN sentinel bug (see below) into the
  `per_payment` branch.
- `onSuccess(created, variables)` gates the overlay on
  `!variables.selectedStoneId` (never on response field presence).
- `onError(error)` uses `apiErrorMessage`, same as file 1.
- The overlay JSX is computed **once** as a `shareLinkOverlay` variable
  (rather than duplicated as two literal JSX blocks) and inserted via
  `{shareLinkOverlay}` in both the `isMobile` branch (after its "NFC Payment
  Overlay for Mobile" block) and the "Desktop/Non-mobile version" branch
  (after its "NFC Payment Overlay for Desktop" block) — this guarantees the
  two branches can never silently diverge, since they render the identical
  React element reference.
- `shareLink` cleared in the same completion-detection effect as file 1.
- New state added in the file's first hook group (immediately after
  `showSuccessOverlay`, before `prevTransactionStatusRef`), strictly before
  the `if (!merchantId) return ...` early return (now line 157) — confirmed
  by `grep`.
- Added `Check` to the existing `lucide-react` import (only `Copy` was
  previously imported) for the post-copy checkmark, matching file 1's idiom.

### 3. `client/src/pages/merchant-terminal-mobile-v2.tsx`

- Create request body: identical ternary to file 2, added to the existing
  `selectedStoneId: data.selectedStoneId` line.
- `handleLiveSend` computes `const boardId = selectedStoneId ?? undefined;`
  once and uses it for **both** the request body's `selectedStoneId` and the
  overlay gate (`if (!boardId) { setShareLink(...) }`) — the same variable,
  not response-field presence.
- `onError(error)` uses `apiErrorMessage`, same as files 1/2.
- New sibling `<AnimatePresence>` block (fixed inset-0, framer-motion,
  X close button, `QRCodeDisplay`) added directly after the existing
  Tap-to-Pay `<AnimatePresence>` block, before the outer `<div>` closes.
  `RetailTerminalView`/`RetailTerminalViewCore` were not opened for editing.
- `shareLink` cleared in the existing completion-detection effect, alongside
  `setSuccessNotif(...)`.
- No hook-order hazard in this file (its `if (!merchantId) return ...` sits
  **after** all hooks, confirmed unchanged) — new state placement is
  unconstrained; added alongside `successNotif`/`prevTransactionStatusRef`.
- **Named, not fixed** (per the reviewed plan's own finding): file 3's
  `RetailTerminalViewCore.jsx` can call `create?.(localDraft, { paywave:
  paywaveOn, existing: false })` for a brand-new sale, combining create and
  an immediate Tap-to-Pay start with no "close the share overlay first"
  step. Had this been reachable, the new share overlay (z-[998], chosen
  deliberately below the Tap-to-Pay overlay's z-[999] as a defensive
  ordering) and the Tap-to-Pay overlay could both become visible for the
  same sale. It is **not reachable today**: this screen renders
  `<RetailTerminalView showPaywave={false} .../>` (confirmed unchanged at
  this file's `return`), and `RetailTerminalViewCore` only renders the
  paywave toggle button — the only way `paywaveOn` can become true — when
  `showPaywave` is truthy. This must be re-examined if `showPaywave` is ever
  turned on for this screen.

---

## Error handling

All three `onError` handlers now import `apiErrorMessage` from
`@/lib/api-error` (confirmed present and already tested via
`client/src/lib/api-error.test.ts`; not previously imported by any of the
three files) and use it as the toast description, replacing each file's
generic `"Failed to create transaction"` fallback string. A real 503
`{"message":"Per-payment links are not enabled yet"}` (the response when
`FEATURE_NEW_RETAIL_PAYMENTS`/`config.features.newRetailPayments` is off) now
surfaces verbatim in the toast in all three files — covered by a dedicated
test per file, all genuinely red before this change (none of the three files
parsed the error body at all beforehand) and green after.

**Production flag caveat, carried forward, not resolved by this pass**: this
task has no production access. `FEATURE_NEW_RETAIL_PAYMENTS`'s real
production value remains only owner-attested ("believed yes"), per
`docs/decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md` §4. If
it is actually off in production, all three terminals will receive 503s on
every board-less sale from the moment this change ships; the 503-toast this
pass adds is the documented, owner-accepted fallback UX for that case (see
the 2026-09-14 approval doc), not a fix for the underlying risk.

---

## Out-of-scope findings, named per the house rules, not fixed

1. **`client/src/pages/merchant-terminal.tsx` — board selection is
   completely disconnected from transaction creation.** `selectedStoneId`
   state (used by the `ItemForm` stone-picker UI, `stone-selector` testid) is
   never read by `createTransactionMutation`'s `mutationFn`. This means the
   merchant can pick a specific Tapt Stone in the UI and the created sale is
   still always stoneless. Confirmed by reading the mutation body directly;
   left exactly as-is — wiring `selectedStoneId` into this call is new scope,
   not this task's.
2. **`client/src/pages/merchant-terminal-mobile.tsx` — the "No specific
   stone" sentinel value produces `NaN`, not `undefined`/`null`.** Both
   occurrences of the pattern
   `onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}`
   (the `isMobile` branch's copy and the desktop/non-mobile branch's copy —
   confirmed at both, current line numbers 843 and 1778 after this task's
   edits) feed a `SelectItem value="none"` sentinel; `"none"` is truthy, so
   `parseInt("none")` is `NaN`, not the intended "no stone" value. This is a
   real, pre-existing bug, not introduced or fixed by this task. It happens
   to be harmless for this task's own security-relevant behavior: `NaN` is
   falsy in JS, so the new `data.selectedStoneId ? ... : ...` linkMode gate
   still correctly resolves to the `per_payment` branch when a merchant
   explicitly picks "No specific stone" — the NaN bug's own cosmetic effect
   (whatever value ultimately reaches the wire) is unrelated to and
   unaffected by that gating logic.
3. **`client/src/pages/merchant-terminal.tsx` and
   `merchant-terminal-mobile.tsx` — clicking a button opened via
   `@testing-library/user-event`'s `click()` can silently drop the click.**
   Both files declare their subcomponents (`ActionsToolbar`, `ItemForm`,
   `StockTagging`, `PaymentStatus` in file 1; the inline edit-panel JSX in
   file 2) as function declarations **nested inside** the main component's
   own render body, giving each one a brand-new function identity every
   render. React therefore fully unmounts and remounts these subcomponents
   on every state update to the parent, including ones caused by the page's
   own concurrent effects (the NFC-capabilities fetch). This is otherwise
   invisible, but it interacts badly with `@testing-library/user-event`,
   which dispatches a click as several separate ticks
   (pointerover/pointerdown/focus/pointerup/click); if an unrelated update
   remounts the button in the gap between those ticks, the final "click"
   event lands on a now-detached, stale DOM node and never reaches the live
   React tree — confirmed via an isolated minimal reproduction (a nested,
   per-render-fresh subcomponent plus a concurrent unrelated `useEffect`
   fetch) outside this suite, not committed. This is a pre-existing
   architectural pattern, not part of this task's named scope, and not
   fixed. It does, however, directly affect how these two files' tests had
   to be written: all three new test files use `fireEvent` instead of
   `userEvent` for this reason (file 3's `RetailTerminalView` is mocked with
   a stable top-level component and is unaffected).

---

## Test file placement

Colocated beside their pages, matching
`client/src/desktop/retail-terminal.test.tsx`'s convention:
`client/src/pages/merchant-terminal.test.tsx`,
`client/src/pages/merchant-terminal-mobile.test.tsx`,
`client/src/pages/merchant-terminal-mobile-v2.test.tsx`.

---

## Verification — baseline, before any edit

```
npx jest --selectProjects client
```

**53 suites / 492 tests, all passing** — confirms the brief's stated figure
exactly, live-verified rather than trusted.

## Verification — per-file red/green, as executed

### File 1 — `merchant-terminal.test.tsx`

Written first, run against the unmodified `merchant-terminal.tsx`:

```
Test Suites: 1 failed, 53 passed, 54 total
Tests:       4 failed, 492 passed, 496 total
```

All 4 new tests failed for the intended reasons:
`sends linkMode per_payment...` — `saleBodies[0]` was missing `linkMode`
entirely (deep-equality diff showed only that one line different) and the
overlay never appeared; `copy link button...` and
`clears the share-link overlay...` both failed because
`share-link-overlay` never existed to find; `surfaces the real 503
message...` received the generic `"Failed to create transaction"` instead of
the real server message. No unrelated failures.

After the fix:

```
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

Full suite after this file's fix: **54 suites / 496 tests, all passing**
(+1 suite, +4 tests over baseline, exactly this file's own new suite).

### File 2 — `merchant-terminal-mobile.test.tsx`

Run against the unmodified `merchant-terminal-mobile.tsx`:

```
Test Suites: 1 failed, 1 total
Tests:       5 failed, 5 total
```

All 5 failed for the intended reasons. In particular, **the mandatory
bug-prevention test** (`stone selected: sends selectedStoneId+linkMode
legacy and does NOT show the share-link overlay even though the response
carries paymentUrl/qrCodeUrl`) failed because `saleBodies[0]` was missing
`linkMode: "legacy"` — the pre-fix code already sent `selectedStoneId: 42`
correctly (that part of the test's own interaction — including driving a
mocked `@/components/ui/select` stand-in for the Radix `Select`, since jsdom
lacks the pointer-capture machinery Radix's real popup needs — is proven
correct because it reached the assertion at all rather than erroring
earlier). `surfaces the real 503 message...` again received the generic
fallback. `copy link...` and `clears the share-link overlay...` failed on
`share-link-overlay` never existing.

After the fix:

```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

Full suite after this file's fix: **56 suites / 506 tests, all passing**
(+2 suites, +10 tests over the post-file-1 figure — **+1 suite/+5 tests is
this file's own addition; the other +1 suite/+5 tests is the concurrent,
unrelated `customer-payment-flow.test.tsx` that appeared in the shared tree
during this pass, confirmed via `git status` at the time, not this task's
work**).

Per the brief's explicit allowance: only the "Desktop/Non-mobile version"
branch (the one jsdom's default `window.innerWidth` of 1024 reaches, since
this file's `isMobile` state starts `false` and its resize-check effect
computes `window.innerWidth < 768`) got direct, interaction-driven test
coverage. The `isMobile` branch renders the exact same `shareLinkOverlay`
element reference (see the per-file summary above), so its correctness is
covered by that shared-reference guarantee rather than a second direct
interaction pass; this is stated explicitly rather than silently assumed.

### File 3 — `merchant-terminal-mobile-v2.test.tsx`

Run against the unmodified `merchant-terminal-mobile-v2.tsx`, with
`RetailTerminalView` mocked by a minimal stub exposing `onBoardSelect`/
`onCreateSale` test buttons (decoupled from `RetailTerminalViewCore`'s
internals, out of scope and shared with the tablet/desktop app initiative):

```
Test Suites: 1 failed, 1 total
Tests:       5 failed, 5 total
```

All 5 failed for the intended reasons; the bug-prevention test
(`board selected: sends selectedStoneId+linkMode legacy and does NOT show
the share overlay even though the response carries paymentUrl/qrCodeUrl`)
correctly sent `selectedStoneId: 42` (confirming the stub's board-selection
interaction is real, not a test artifact) but was missing `linkMode:
"legacy"`.

After the fix:

```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

## Verification — final, all three files' fixes applied

- **`npm run check`**: clean, zero output, exit 0.
- **`npx jest --selectProjects client`**: **57 suites / 511 tests, all
  passing.** Arithmetic: 53 (baseline) + 3 (this task's own three new
  suites: 4 + 5 + 5 = 14 tests) + 1 suite / 5 tests (the concurrent,
  unrelated `customer-payment-flow.test.tsx`) = 57 suites / 511 tests —
  reconciles exactly.
- **The three all-three-files-together run**
  (`--testPathPatterns="pages/merchant-terminal(-mobile(-v2)?)?\.test"`):
  3 suites / 14 tests, all passing, run standalone from the rest of the
  suite as a sanity check.
- **The three named pre-existing smoke/syntax test files**
  (`client/src/pages/__tests__/{smoke-tests,jsx-syntax-smoke,syntax-validation}.test.tsx`),
  re-run explicitly per the brief: **72 tests, all passing, no regression.**
  Only `merchant-terminal.tsx` and `merchant-terminal-mobile.tsx` are
  actually mounted/imported by these three files (confirmed by reading each
  file's import list); `merchant-terminal-mobile-v2.tsx` is not, so this
  check is scoped correctly to the two files it can actually regress.
- **`git diff --numstat`** on the three source files: `merchant-terminal.tsx`
  +104/-3, `merchant-terminal-mobile.tsx` +120/-5,
  `merchant-terminal-mobile-v2.tsx` +113/-5 (337 insertions / 13 deletions
  total) — no other file touched, confirmed by `git status --porcelain`
  showing only
  this task's three source files plus three new test files as this task's
  changes (the other modified/untracked entries — `server/routes.ts`,
  `server/storage.ts`, `server/sse-broker.ts`,
  `client/src/pages/customer-payment.tsx`,
  `client/src/pages/__tests__/customer-payment-flow.test.tsx`,
  `server/__tests__/r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts`, and
  that task's own evidence doc — belong to the concurrent gap-12 SSE/poll
  fail-closed task and were not read for modification, opened, or written to
  by this pass).

---

## Further independent re-verification performed in this pass

Rather than rely on notes taken mid-implementation, the following was
re-checked fresh, directly, right before writing this record:

1. **`server/routes.ts`'s unconditional `paymentUrl`/`qrCodeUrl`** — re-read
   the live file (current lines 2182–2251, shifted from the git-blame
   baseline of ~2107–2181 solely because the concurrent, unrelated task is
   also editing this file elsewhere): the `paymentUrl`/`qrCodeUrl`
   construction and the `res.json(ownerTransactionDto(transactionWithUrls))`
   call are byte-for-byte the same logic described in this brief and in the
   2026-09-13 finding doc. The mandatory fix's premise still holds against
   the current tree, not a stale reading.
2. **Hook order, files 1 and 2** — `grep -n "^  if (!merchantId)"` against
   both files after all edits: file 1's early return is at line 142, file
   2's at line 157; the new `shareLink`/`copiedShareLink` (and, for file 1,
   `copiedShareLinkTimerRef`) state declarations sit above both lines,
   confirmed by their own line numbers in the diff (file 1: ~64–69; file 2:
   ~54–59) — well inside the first hook group, unconditionally called on
   every render exactly as before.
3. **RetailTerminalView/RetailTerminalViewCore untouched** — `git status
   --porcelain` and `git diff --stat` both list only this task's three page
   files and three new test files; neither
   `client/src/features/terminal/retail/RetailTerminalView.tsx` nor
   `RetailTerminalViewCore.jsx` appears in either.
4. **The three smoke/syntax test files' own import lists** — re-read
   directly: `smoke-tests.test.tsx` and `jsx-syntax-smoke.test.tsx` and
   `syntax-validation.test.tsx` each import `../merchant-terminal` and
   `../merchant-terminal-mobile` (not `-mobile-v2`), confirming the "no
   regression in already-mounted pages" check above is scoped to exactly the
   two files it can affect.
5. **Full suite and tsc, re-run one final time** immediately before writing
   this record (not relayed from an earlier run): `npm run check` clean;
   `npx jest --selectProjects client` → 57 suites / 511 tests, all passing,
   identical to the figure reported above.
6. **Scope compliance** — `git status --porcelain` at this exact moment
   shows exactly: `M client/src/pages/merchant-terminal.tsx`,
   `M client/src/pages/merchant-terminal-mobile.tsx`,
   `M client/src/pages/merchant-terminal-mobile-v2.tsx`, and three untracked
   new test files at the matching paths — plus the concurrent task's own
   six entries, named and not touched.

No discrepancy was found between what is described above and what the live
working tree and test suite show right now.

---

## What this closes, and what it does not

**Closes**: the three named call sites now mint per-payment links for
board-less sales (mirroring the desktop retail terminal exactly), each now
has a "share this link" UI it previously lacked, and all three surface the
real server error message (including the 503 feature-flag-off case) instead
of a generic fallback. The specific bug that blocked the prior pass — gating
the share UI on response field presence — is avoided by construction and
covered by a dedicated realistic-mock test in files 2 and 3.

**Does not close**:

- Retiring the standing `/pay/:merchantId` address — needs a production
  traffic-drain window, separately scheduled per the approval doc.
- The gap-12 SSE/poll ambiguity fail-closed fix — a disjoint task, being
  worked concurrently in this same tree by a different process during this
  pass (see above); not read, not touched.
- `FEATURE_NEW_RETAIL_PAYMENTS`'s real production value — still only
  owner-attested, not independently verifiable without production access.
- File 1's board-selection/creation disconnect, file 2's `NaN`-sentinel bug,
  and both files' `userEvent`-vs-nested-per-render-component interaction
  quirk — all named above as out-of-scope findings, none fixed.
- R1-T8's hook-order issue itself — not worsened (placement discipline
  followed and independently re-verified above), not fixed.

## Remaining risk / open items

- File 3's latent paywave/share-overlay interaction (named above) is
  unreachable today only because `showPaywave={false}` is hard-coded at this
  screen's `<RetailTerminalView>` call site; re-examine if that ever
  changes.
- The production flag-verification gap (above) remains open; this pass has
  no way to close it.
- The three out-of-scope findings above (board-selection disconnect, NaN
  sentinel, userEvent/nested-component interaction) are real and
  independently worth triage, but are deliberately left untouched per this
  task's own scope boundary.
