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
