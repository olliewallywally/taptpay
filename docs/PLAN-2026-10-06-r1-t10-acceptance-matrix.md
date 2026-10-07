# R1-T10 — one spelling for every API address, then the device, tutorial and accessibility matrix

Branch `remediation/r1-continuation-20260907`. Authority: the supplied integration plan's
R1-T10 ("Device and tutorial acceptance matrix"; depends on T3, T5, T7, T9, R1-H1) and
R1.D; v2.2 §14.1, §14.4 and §22.11. The finish-R1 authorization of 2026-10-03 persists.

R1-T10 asks for two things:

1. **Typed shared route constants** for the API addresses the tested screens use, "so
   client code, route policy and HTTP tests cannot silently disagree about a path or ID
   shape", with a guard against new duplicated literals there. Not a router rewrite.
2. **The acceptance matrix**: phone (390×844, touch), tablet (1194×834, touch), desktop
   (1440×900, pointer) and the short desktop (1440×650); public, auth and onboarding
   pages outside the merchant frame; every tutorial completed and restarted at each size;
   keyboard, focus, names, alerts, 200% zoom, reduced motion, contrast, touch targets; an
   automated accessibility scan plus manual keyboard and screen-reader checks as release
   evidence. Its check is zero page errors, console errors, failed required requests,
   clipped text, missed taps, accessibility blockers and route-literal drift, with the
   existing baseline allowances reaching zero. **Golden image updates need product
   approval.**

Its prerequisites: T3, T7 and T9 are built and awaiting review; T5 is built and awaits
the owner's Apple setup; R1-H1 (the auth and onboarding baseline) was accepted on
2026-09-14. Nothing here weakens that baseline: an intentional R1 difference (the Apple
button, the Settings row) is reviewed as itself, not absorbed into a new baseline.

## What exists (read on `15507539`)

- **Addresses.** The server registers 194 routes; each is in the checked-in policy
  (`server/route-policy.ts`, generated from `server/routes.ts`), reviewed
  (`server/route-review.ts`) and served by a test. The client spells API addresses by
  hand: **606 literals in 78 files** (tests aside). Three partial helper modules exist
  (`client/src/lib/payment-addressing.ts`, `property-api.ts`, `trades-api.ts`); none is
  tied to the server's list. Nothing stops a page and the server disagreeing about a
  path; only a test that happens to drive that page would notice.
- **Device gates**, each a script against a running app: `npm run verify:mobile` (21
  phone contexts, with a recorded baseline of allowances per context),
  `verify:mobile-keyboard`, `verify:terminal-dock`, `scripts/verify-desktop-p0.mjs`,
  `scripts/verify-chunk-resilience.mjs`, `scripts/verify-r0-device-containment.mjs`,
  `npm run test:golden` (`tests/mobile-golden.spec.ts`, phone goldens), and the R1-H1
  capture (`scripts/capture-r1-h1-auth-baseline.mjs`). They need a dev server on :5000,
  which the sandbox cannot start or reach; the R1-T4/T5 browser checks show the other
  way (the real app in-process on a loopback port, in-memory storage).
- **Tutorials**: one provider and registry (`client/src/features/tutorial/`,
  `shared/tutorial.ts`), unit-tested; no matrix completes and restarts each tutorial at
  each size.
- **Accessibility**: `axe-core` is installed; no scan runs. Manual keyboard and
  screen-reader checks are not recorded anywhere.

## Decomposition

- **T10a — the route contract, and the first surface.** One generated, type-only list of
  every API route a browser calls, taken from the server's own registrations; one small
  builder; a contract test; a source guard; and the sign-in and account-entry pages moved
  onto it. (Preflight below.)
- **T10b — the remaining matrix surfaces onto the contract**, in reviewed batches: both
  Settings screens; the three verticals' terminals (phone and desktop); home and
  analytics; stock, transactions and exports; tutorials; the public pay, receipt and
  checkout pages. The guard's file list grows with each batch and only ever grows.
- **T10c — the device matrix as one gate.** The real app in-process on a loopback port
  (no dev server, no database), the four contexts, every matrix route: the expected
  shell, zero page errors, console errors and failed required requests, no clipped
  critical text, tap centres that hit, terminal layouts with rows. It reuses the
  existing scripts' measurements rather than replacing them.
- **T10d — the tutorial matrix** at the three sizes: complete and restart each tutorial;
  target or fallback visible; geometry across a resize and a route change; progress
  kept; no Tap or NFC step.
- **T10e — the accessibility matrix**: the automated scan on every matrix surface;
  keyboard-only operation, focus order and visible focus, dialog focus trap and return,
  names and states, alerts, 200% zoom and reflow, reduced motion, contrast, target
  sizes; and the manual checks written as a list for the release evidence.
- **T10f — what only the owner can close**: the existing phone baseline's allowances
  (characterisation only; the plan says they must reach zero, which means fixing or a
  product decision per item), any golden image update, the manual keyboard and
  screen-reader evidence, and approval against the R1-H1 baseline.

## The contract's design (recorded as the decision the plan asks for)

v2.2 §22.11 allows "`shared/routes.ts` (or an ADR-approved split for server/client)".
The split taken, and why:

- **The server's registrations stay the one source.** The list is *generated* from them
  by the existing generator (`scripts/generate-route-policy.ts`), as the policy already
  is, and a test fails when the checked-in list and the source differ. A hand-written
  constants file would be a second spelling that could itself drift.
- **A route's name is its registration**: `"PUT /api/merchants/:id/theme"`. The same
  words appear in `server/routes.ts`, the policy, the review, the inventory table and
  now the page, so one search finds every side of a route.
- **The list is types only** (`shared/api-routes.ts`): the client bundle grows by
  nothing, and the eager pages import no data. Each route carries the type of each path
  parameter, taken from the server's own parser for it (a strict positive integer is a
  `number`; anything else a `string`).
- **One small builder** (`shared/api-path.ts`): `apiPath(route, params)` fills the path
  and refuses a missing, extra, empty or non-integer parameter at run time, so an id of
  the wrong shape fails where it is built instead of becoming a wrong address.
- **Only routes a browser calls are listed**: those whose review serves a business
  login, the platform admin, anyone, or a link's holder. The provider's, the scheduler's
  and the ecommerce API's routes are not the client's to call and are left out.
- **The guard is a list of migrated files**, each of which may no longer contain a
  string that starts with `/api/`. Tests keep their literal addresses on purpose: a test
  that spelled its expectation with the same builder would agree with any mistake in it.

## Recorded for the owner (none blocks T10a or T10b)

1. **The phone gate's baseline allowances** must reach zero for R1-T10 to close. Each is
   either a fix to a phone screen he accepted, or his decision that it stays. They are
   listed for him in T10f; nothing is changed on the phone screens before that.
2. **Golden images** change only with his approval.
3. **The manual checks** (keyboard-only, a screen reader, a real iPhone and iPad) are his
   or a tester's to do; the engineering work produces the list and the automated part.

## T10a preflight — the route contract, and the sign-in pages

Base `15507539` (R1-T5's last code is `3e5db51d`; the commits above it are documentation).

### Verification of Prior Fixes

T5d was verified in this session: full client 117 suites / 1,420 tests and full server
179 suites / 4,436 tests on `3e5db51d`. Reread for this scope: the route generator and
what it already writes and tests (`route-policy-inventory.test.ts`,
`route-matrix-inventory.test.ts`); the recorded facts' parameter parsers; the review's
principals; how the client sends requests (`apiRequest`, `sessionFetch`, query keys that
are addresses); the three partial helper modules; the sign-in and account-entry pages
and their tests; the rule that eager pages import nothing heavy from `shared/`.

### Blocking Issues

None.

### High-Risk Concerns

- **No address may change.** Every migrated call must build exactly the string it had.
  The pages' existing tests assert those strings, and stay as they are.
- **A second source of truth.** Avoided by generating the list and testing the generated
  file against the source.
- **A guard that can be satisfied falsely** (by spelling an address in pieces, or by a
  cast). The guard forbids the literal; the contract test separately checks that every
  route name the client passes to the builder is in the list, by reading the source, so
  a cast past the types is still caught.
- **Bundle weight and the eager pages.** The list is types only; the builder is a few
  lines with no imports at run time.
- **Parameters.** An integer id built from `NaN`, zero, a fraction or a string must not
  become `/api/merchants/NaN/...`; a text parameter is percent-encoded once.

### Missing Steps

Tests red first (the generated list against the registrations and the review's
principals; each parameter's type against its parser; the builder for every listed
route and for every wrong parameter; the guard over the migrated files; every route
name in client source being a listed one); the generator's new output; the builder; the
client's small helper; the sign-in and account-entry pages and helpers moved onto it;
typecheck, build, affected and full runs for server and client, the mutation check,
evidence. No route, schema or behaviour change.

### Unsafe Assumptions

A parameter whose server parser is not the strict integer one is typed as text; that is
what the server accepts for it today, not a claim that it should. A route registered
for every method (`ALL`) is not listed: none is a browser's to call. The list follows
the review's principals, so a route reviewed wrongly would be listed or left out
wrongly; the review's own tests hold it to the handler.

### Required Ordering Changes

The generator and the contract test first; then the builder; then the pages; the guard
last, once the first surface is clean.

### Open Product / Provider / Legal Questions

None for T10a.

### Compliance and Data-Handling Notes

No data is touched. The list names addresses the built app already contains.

### Test and Rollback Adequacy

Every existing test of the migrated pages must pass unchanged; the contract and guard
tests are new. Fix forward; reverting a page to its literals is always possible.

### Final Recommendation (Approve / Do not approve)

**Approve T10a on `15507539`**, failing tests first. It does not close R1-T10.

### Separate reread

Retraced against the code. The generator already loads the review and the facts before
it writes, so it can write a third file in the same run, and the inventory test already
re-runs it in memory to compare; the same pattern covers the new file. Facts record a
parameter as `name: parser`, with `raw` or `checked` when no strict parser reads it;
`strictPositiveIntegerParam` is the one integer parser. The builder needs nothing but
the route's own name at run time: the method is the word before the space and the path
the rest. `shared/` is compiled into both projects, and the server project already
tests `shared/` code (`password-rule.test.ts`). The sign-in surface is small and I have
its tests fresh: 12 files, 29 literals. What must not move: every address; every
existing test; the eager pages' imports. **Approve the same T10a scope.**

## T10a completion

Code `9f9182e5` on base `8d6ba483`. Red on the base: the contract suite cannot load.
Then: the contract test 28; the generated list 178 of the 194 registrations (16 left
out, none a page's to call); the twelve sign-in and account-entry files moved, **29
spelled addresses becoming 26 uses of 22 route names**, two uses of the shared admin
prefix and one renamed cache key, shown from the commit itself to be the same addresses;
no client test file changed; the built client holding exactly the 22 names in use; 37 of
37 planted defects caught, none surviving; the route suites, the contract test and the
two source guards 28 / 1,811; full client 117 suites / 1,420 tests and full server 180 suites / 4,464 tests
on the commit. [Evidence](evidence/remediation-v2-2/r1/R1-T10a-route-contract-2026-10-06.md).

Settled while building: the generated file carries no date and no commit, so it changes
only when a route does; a refusal names the route and the parameter and never the
value; the builder must be handed a name written out where it is used, so the contract
test can read every name from the source; a method spelled beside the builder must be
the route's own.

## T10b preflight — the other screens onto the builder

Base `510ddceb` (T10a's code is `9f9182e5`; the commit above it is documentation).

### What was measured first (on `9f9182e5`, read from the syntax tree, tests aside)

- **581 API addresses are still spelled by hand, in 66 files.**
- **118 of them are in 14 files the app never loads**: 11 that nothing imports
  (`components/digital-wallet-buttons`, `components/native-payment-buttons`,
  `pages/admin-api`, `pages/admin-dashboard`, `pages/admin-merchant`,
  `pages/admin-merchant-broken`, `pages/admin-revenue`, `pages/admin/WebsiteAnalytics`,
  `pages/exports`, `pages/merchant-terminal-mobile`, `pages/settings-simple`) and three
  pages that `App.tsx` declares for lazy loading and never renders
  (`pages/merchant-terminal`, `pages/demo-terminal`, `pages/create-merchant`).
  **Every call to a route the server no longer has is in one of these 14.** They are
  out of T10b's scope and are listed for the owner below.
- **463 are in the 52 files the app renders. None calls a route the server does not
  have.** Of them: 252 are requests; 125 are cache keys that are the whole path of a GET
  route with no parameter; 79 are cache labels (`"/api/merchants"` 70 times,
  `"/api/transactions"` 6, and three used once); one is a cache key built from an id;
  and six, in the two admin dashboards, are not API addresses at all: the admin area has
  a page of its own at the address `/api`.

### Method

The move is mechanical, so it is done and checked mechanically, with the hand kept for
what a tool cannot place:

1. **A rewrite** (scratch, `t10b/codemod.ts`) matches each spelled address to exactly one
   listed route by its shape and by the method its call says, and writes the builder in
   its place. What it cannot place with certainty it leaves alone and lists. A dry run
   places 410 of the 463 and lists 53 (17 of them in `lib/payment-addressing.ts`).
2. **A proof written apart from the rewrite** (`t10b/proof.ts`) reads the file before and
   after: every address must pair one for one with a built one, with the same text
   pieces, the same values between them, the same query tail, and the same method
   wherever the old call said one; and with those expressions cut out of both, and the
   builder's import removed, **the rest of the file must be the same text**. A file the
   hand changed anywhere else fails and is read.
3. **The type check** then holds every name to the list and every parameter to its type;
   **the contract test** reads every name and every method from the source.
4. **Every existing test stays as it is** and must pass.

### What the builder gains (first batch, tests red first)

- **A value the page may not have yet.** 42 of the placed calls hand over an id typed
  `number | null` or `string | undefined` (the page asks only once it is signed in, which
  the type system cannot see). The builder already refuses a missing value when it runs;
  its type now says so, instead of forty-two `!`. A parameter left out, an extra one, a
  route the server does not have, or text for a whole number still does not typecheck.
- **`apiPathOrNull`**, for the two places an address with a parameter is worked out
  while the page is being drawn (a cache key, an image's address): the same address, or
  null while a value is not usable; it never throws. The contract test forbids the
  throwing builder with a parameter inside a query key.
- **`wholeNumber`**, for the six places a whole-number id reaches the page as text (the
  admin's business page, from its own address; one refund): the number when the text is
  written exactly as the server's own parser reads one, otherwise null. Tested against
  that parser.
- **Five cache labels** as named constants (`MERCHANTS_KEY` and four others). A label is
  the first word of a cached entry's name where that word is not itself an address.
  **Every cache key keeps its value**, so moved and unmoved files, and the tests that
  put data in the cache, go on sharing entries exactly as before. The contract test
  pins each label, ties it to the routes it is the start of, checks none is a GET
  route's whole path, and checks a label is only ever the first word of a key.

### Batches (each its own commit; the guard's list grows with each)

1. Settings: `pages/settings`, `desktop/DesktopSettingsPage`,
   `hooks/use-billing-card-return`, `lib/merchant` (76), with the builder's additions.
2. Retail: the phone and desktop terminals, home, analytics, stock, transactions, the
   payment stack, the board builder, the QR display, the retail reports (110).
3. Property: both terminals, the tenant pages, `lib/property-data`, the desktop
   directory profile (65).
4. Trades: both terminals, clients, schedules, dashboards, analytics, reports,
   `desktop/data/trades-data` (101).
5. The public pay, split, checkout and receipt pages and `lib/payment-addressing` (48).
6. The shell: `App`, the tutorial, onboarding, push, live updates (33).
7. The admin area (30), and then **the guard turned round**: no file under `client/src`
   may spell an API address, except the listed files the app never loads (held to their
   present counts, and checked by the test to be unreachable from the app's entry) and
   the admin area's page address `/api`.

### Verification of Prior Fixes

T10a was verified in this session: full client 117 suites / 1,420 tests and full server
180 suites / 4,464 tests on `9f9182e5`. Reread for this scope: the default query
function (it asks for the first word of a key, so a key with no function of its own *is*
an address: 11 such keys in rendered files, every one a real GET route); the request
wrappers (`tradesFetch`, `propFetch`, the three local `authFetch`: all `(address,
options)` like `fetch`); the server's strict whole-number parser; where each id comes
from; the 20 tutorial page keys.

### Blocking Issues

None.

### High-Risk Concerns

- **An address or a method changing.** The proof compares each one, from the commit.
- **A cache key changing**, which would silently stop one screen refreshing another.
  Keys keep their values; the proof compares them like any address.
- **A refusal by the builder where a request used to be sent**: an exception while the
  page is drawn would be a blank screen. Measured: all 118 placed calls that carry a
  parameter are inside an async function or the function react-query calls, where a
  refusal is a failed request like any other (`t10b/sync-sites.ts`). The hand-placed
  ones are checked the same way; the two worked out while drawing use `apiPathOrNull`.
- **Text ids.** 33 placed calls wrote a text id into the path as it was; the builder
  writes it into one path segment. Every value the server issues (UUIDs, hexadecimal and
  URL-safe tokens, the 20 tutorial page keys) is unchanged by that. A value holding `/`,
  `?` or `#` used to become another path; it now reaches the server as one id, which it
  refuses.
- **Double encoding** where the old code already encoded: the rewrite removes
  `encodeURIComponent()` and `opaquePart()` around a text value, and the proof fails if
  one is left around a value or removed from a whole number.

### Missing Steps

The builder's additions with their tests red first; then, per batch: the files added to
the guard's list (red), the rewrite, the hand-placed ones, the proof, the refusal
check, the type check, the contract test, the batch's own page tests and the full client
suite. At the end: the guard turned round, the mutation check of what is new, the
production build, the full server suite, evidence.

### Unsafe Assumptions

"Never loaded" is read from static imports and `import()`; the client has no
`import.meta.glob`. The last batch puts that reading into the test itself, so a file
that becomes loaded and still spells an address fails. A wrapper's method is read from
the options written at the call; where they are not written out there, the call is done
by hand. A text id is trusted to be what the server issued only in the sense above: it
is always written into one segment.

### Required Ordering Changes

The builder's additions first, since every later batch uses them. The admin area last,
with the guard turned round after it.

### Open Product / Provider / Legal Questions

None blocks T10b. Recorded for the owner:

4. **The 14 files the app never loads.** They cost nothing when the app runs. They are
   where every out-of-date call lives (the admin sign-up, edit and delete he removed on
   2026-09-26; `nfc-pay`; `split-enabled`; the old wallet-button routes; the admin
   API-key and revenue pages; the old exports), and they make a search for an address
   return answers that are not true of the app. Deleting them is his call; nothing is
   deleted here.
5. **The admin area's page at `/api`.** A page address, not an API address; it is left
   as it is and named as the one exception in the guard.

### Compliance and Data-Handling Notes

No data is touched and no request changes. A refusal by the builder names a route and a
parameter, never a value.

### Test and Rollback Adequacy

The existing tests assert literal addresses and stay unchanged; the proof covers every
moved expression, tested or not. Each batch is one commit and can be reverted alone:
keys keep their values, so a reverted batch still shares its cache with the others.

### Final Recommendation (Approve / Do not approve)

**Approve T10b on `510ddceb`**, the builder's additions red first, in the seven batches
above. It does not close R1-T10.

### Separate reread

Retraced with the tools rather than by eye. The rewrite's dry run over the 52 files: 410
placed, 53 listed. Applied to a scratch copy and type-checked: 48 errors, in six kinds,
all of them a value's type (36 `number | null`, 2 `number | undefined`, 3 `string |
undefined`, 1 `string | null`, 5 text for a whole number, 1 `string | number`), none a
wrong name or a wrong parameter. The proof over that copy: the 33 files with nothing
listed all pass (same addresses, same values, same rest); the 19 with something listed
fail only at what is still spelled. The refusal check: 118 of 118 inside an async
function or a query's own function. Read by hand: the one request whose last segment is
chosen when it runs (`send-balance` or `complete`; both are routes), the one templated
key, the image address in the QR display, the two places a method is not written at the
call. What must not move: any address, method or cache key; any existing test; the
never-loaded files. **Approve the same T10b scope.**

## T10b completion

[Evidence, with each batch's verification](evidence/remediation-v2-2/r1/R1-T10b-screens-on-the-builder-2026-10-07.md).
All seven batches are code-complete and await independent review.

| Batch | Code | Moved |
|---|---|---|
| 1. Settings, and the builder's additions | `997c28ad` | 4 files, 76 addresses |
| 2. Retail | `a07c5072` | 12 files, 110 |
| 3. Property | `cda1988b` | 7 files, 65 |
| 4. Trades | `2c796135` | 10 files, 101 |
| 5. What a customer opens | `ffa4a544` | 8 files, 48 |
| 6. The shell | `633eebb1` | 6 files, 33 |
| 7. The admin area, and the guard turned round | `7f62a6b0` | 4 files, 24 |

**No file the app loads spells an API address.** 457 addresses are moved: the 463 the
audit counted, less the six that are the admin area's own page address `/api`. 448 are
paired by the proof with the address that replaced them. The other 9 are in places
changed by hand (five in batch 4, three in batch 5, one in batch 6), each read and run
side by side with what it replaced. The contract test went from 28 tests to 43 and holds
every source file of the client, with two named exceptions: the 14 files the app never
loads, and the admin's page address.

### Settled while building (where this departs from the preflight above)

1. **One builder, and it never throws.** The preflight kept T10a's throwing builder and
   planned `apiPathOrNull` beside it. An address worked out while a page is drawn is
   ordinary, a throw there is a blank screen, and a page shows a failed request's own
   words. So `apiPath` writes into the path only what the server could read as that
   parameter and otherwise leaves the parameter's own name, which the server refuses as
   it refused `undefined`. `apiPathOrNull` was not built, and the preflight's refusal
   check (`sync-sites.ts`) is no longer needed: there is nothing to throw.
2. **Two checks the preflight did not plan**, each found by a real file:
   - *Nothing is added to a built address but a query or a fragment* (batch 3). The
     desktop profile panel kept a list's address in a variable and added
     `/<id>/events` to it: with the list's address built, the file spelled nothing and
     still made two addresses no check had read.
   - *The first word of a cache key is a GET route's* (batch 4). Nothing says a method
     beside a key, and a key named for the POST route of the same path is the same text.
3. **The proof fails where it cannot tell.** Where a call does not say a method and
   more than one route has that path, the proof needs the method read from the helper by
   hand, instead of passing either (batch 4, after it missed a planted mistake).
4. **A place changed by hand is named to the proof** by its exact text on both sides and
   cut out, so the rest of its file is held like any other; the place itself is read and
   run side by side with the old expression. Ten such places: two in batch 3 (requests
   built onto a variable, which were not spelled addresses), six in batch 4 (five
   addresses), one function in batch 5 (three addresses) and one in batch 6. The seven
   ids read through `wholeNumber()` (two in batch 2, five in batch 7) are judged by the
   proof itself.
5. **One existing test changed** (batch 5). `split-payment-view-boundary.test.tsx` reads
   the split page's source and expected two addresses as they were spelled; it expects
   them as they are named. "Every existing test stays as it is" holds for every other.
6. **The floors move with each batch.** The contract test's lower bounds (files on the
   builder, uses of it read from the source, methods checked, labels, keys, files read
   and files loaded) are raised to just under what the tree holds, so a reader that
   stopped reading would fail.
7. **The guard reads plain JavaScript too** (batch 7). It read only `.ts` and `.tsx`;
   the client has two `.jsx` files, one of them the retail terminal's own view. Neither
   spells an address.
8. **A fifteenth file the app never loads** (batch 7): `pages/admin-login.tsx`, moved
   with the sign-in pages in T10a, is a page nothing imports. The admin signs in through
   the login page. It joins question 4 for the owner.

### What T10b does not show

- **No browser was driven.** That a page still asks for the same address rests on the
  proof, on the side-by-side runs, and on the pages' existing tests where they have
  them. The device matrix is T10c.
- **A wrong name that is still a listed route, with the right method, in a page with no
  test of its own** is beyond the contract test. The proof held every such name once,
  when it was written; nothing holds it afterwards.
- **An address handed to a helper** (a list loader, the payment helpers' callers) has
  no method beside it for the test to read.
- **The 14 files the app never loads** still spell 118 addresses, some of routes the
  server no longer has. They are held, not fixed.
