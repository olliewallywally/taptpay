> Review correction (2026-09-29): the introducing commit in the cleaned GitHub history
> is `53f5a8b9ca689b8b92dc951d6a69e86dd13dd51e`. The `387d189d` references below
> belong to the historical review record and are not resolvable in that history.

# R1-T8 — the hook-order crash (2026-09-21)

Date: 2026-09-21 UTC. Branch: `remediation/r1-continuation-20260907`. Base: `c6667985`.
Commit: `387d189d` (code and tests; this record is separate). Plan: R1-T8 / C15
(`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`, R1.C; v2.2 §8.7).
Unblocked by [R0 exit](../r0/R0-exit-established-2026-09-21.md) and R1-H1 (accepted 2026-09-14).
No owner decision was needed. **Not independently reviewed yet** — see the end.

## The defect

All seven pages the plan names did the same thing: read the merchant id from the stored token,
then `if (!merchantId) { redirect to /login; return }` — before most of their hooks. React requires
the same hooks in the same order on every render, so if the token disappears while a page is
mounted, the next render runs fewer hooks and React throws *"Rendered fewer hooks than expected"*
(production build: error #300).

The trigger in the app is ordinary: **Sign out on /settings.** `handleLogout` removes the token and
navigates to `/login`; on phones the page transition (`PageTransition`, framer-motion) keeps the
outgoing page mounted and re-renders it — without a token. The browser check below reproduces the
crash this way on the pre-fix build. A 401 that clears the stored credential does the same.

`react-hooks/rules-of-hooks` reported **66 violations in the seven pages** (settings 18,
merchant-terminal 13, merchant-terminal-mobile 12, transactions 11, stock-management 6, exports 3,
payment-stack 3) and 1 in a test stub — 67 in the client. The rule was configured all along, but
lint is not a gate here (plan §15.2), so nothing stopped them.

Three of the seven pages are **routed nowhere**: `exports.tsx` is imported by nothing but tests,
`merchant-terminal.tsx` is lazily imported by `App.tsx` and never rendered, and
`merchant-terminal-mobile.tsx` was replaced by `merchant-terminal-mobile-v2.tsx`. They are fixed
because the plan names them; they are candidates for R8's proven-dead removal, not deleted here.

## The fix

`client/src/components/merchant-gate.tsx` — `MerchantGate` resolves the merchant **above** the page:

- The page is never rendered without a merchant, so its hooks always run in the same order. Each
  page's default export is now the gate; the old body is an inner component taking `merchantId`.
- **Keyed by merchant id**: a change of account remounts the page, so one merchant's state is never
  shown under another's id.
- The redirect runs **once, in an effect** (not during render), and **not when already on
  `/login`** — Sign out navigates there itself, so a second push would duplicate the history entry
  (or reload the login page, for a full-page redirect).
- **Behaviour kept per page**: settings, transactions and stock leave by in-app navigation and show
  nothing meanwhile; exports and both old terminals leave by a full page load and show
  "Redirecting to login..."; payment-stack leaves by a full page load and shows nothing.

A property of the design, stated plainly: the gate reads the token when **it** renders, not on every
render inside the page. A page therefore keeps its (unchanged) merchant id until something above it
re-renders — navigation, the page transition, the auth context. That is not a tenant exposure:
every request reads the token itself, so a request after sign-out goes without one and is refused
by the server, and a page is never handed a different merchant's id without being remounted.

## Tests first

| Test | New or converted | Red before the fix, and why |
|---|---|---|
| `client/src/__tests__/hooks-order-guard.test.ts` | new | 1 / 1 — runs `rules-of-hooks` over every client file through ESLint's `Linter` with an inline config; **inline comments are ignored** (`noInlineConfig`), so no file can silence the rule for itself. 67 findings. ~5 s. |
| `client/src/pages/__tests__/merchant-pages-session.test.tsx` | new | 10 / 28 — all seven pages throw "Rendered fewer hooks" when the session ends mid-view; Settings sends 2 requests with no session (`usePushNotifications` ran before the guard); Transactions and Stock push `/login` three times (partly an artefact of a harness with no route switch). The other 18 pin behaviour that was already right. |
| `client/src/components/merchant-gate.test.tsx` | new | 7 / 7 — 6 because the module did not exist; the "already on /login" test was then red against the gate's first version (1 extra navigation). |
| `client/src/__tests__/zz-review-hooks-repro.test.tsx` | converted, as the plan requires ("expects crash" → "does not throw") | 2 / 6 — the two session-ending tests throw on the old Settings. It now also covers loading → authenticated, error → retry, a change of merchant and unmount, with the real auth module. |

**React problems now fail client tests.** `jest.setup.js` records anything React reports through
`console.error` — act() warnings, other `Warning:`s, hook-order errors, errors thrown in render — and
fails the test. Red run: exactly the three files that printed the 18 act() warnings (8 tests). Fixed:
the two smoke files test only the first render, so they now unmount straight after it; the terminal
test lets its start-up requests land inside `act()`. A test that provokes a React error on purpose
must spy on `console.error` itself.

Found on the way, **not fixed (out of scope)**: letting the smoke tests' requests land showed that
their generic mocked responses make six pages throw — `TransactionsPage`, `StockManagementPage`,
`ExportsPage`, `RetailDashboardView`, `AdminDashboard`, `AdminMerchantDetail` (an object where a
list is expected, a missing number) — and the JSX smoke test's `wouter` mock lacks components some
pages render. A page that throws on a malformed response is input for **R1-T9** (truthful failure
states).

## Verified

- `tsc` clean; client **60 suites / 552 tests**, **0** act() warnings, **0** React warnings, **0**
  hook errors (was 57 / 511 with 18 act() warnings and the repro's asserted crash);
  `git diff --check` clean. No server file changed.
- **Mutations, 5 of 5 caught** (scratch worktree, restored byte-identical): Settings restored to its
  early return → 5 tests fail; gate no longer keyed by merchant → 1; gate redirecting during render →
  9; a smoke test no longer unmounting → the React-problem guard fails 2; a page silencing the rule
  with `// eslint-disable-next-line react-hooks/rules-of-hooks` → the lint guard still fails.
- **Browser** — `scripts/verify-r1-t8-browser.mjs` (synthetic, loopback; every `/api` request
  answered from fixtures): builds of `c6667985` (before) and of the fix, served by `vite preview`.
  The four phone routes served by these pages — `/settings`, `/stack`, `/transactions`, `/stock` —
  render with no page or hook error and are **pixel-identical** to the pre-fix build. **Sign out on
  /settings reproduces React error #300 on the pre-fix build**, and on the fixed build lands on
  `/login` with no error and the token removed.
- R0 device smoke on the fixed build: **20 / 20** (phone, tablet, desktop, D10 short desktop × 5).

## Not done / open

- **Independent review** of `c6667985..387d189d` before this merges (plan §21.1).
- R1-T9 (truthful failure states) is next in C16; the six pages above are its first inputs.

## Independent review — brief

**Range:** `c6667985..387d189d` (one code commit), local only.

Paste-ready prompt:

> You are the independent correctness reviewer for TaptPay, a payment-terminal SaaS. Review commit
> `387d189d` on branch `remediation/r1-continuation-20260907` (range `c6667985..387d189d`). It fixes
> plan task R1-T8: seven merchant pages returned early ("no merchant: go to login") before most of
> their hooks, so ending the session while one was open crashed React ("Rendered fewer hooks than
> expected"). Start from `docs/evidence/remediation-v2-2/r1/R1-T8-hook-order-crash-2026-09-21.md`;
> treat it as claims and re-derive everything from the code. Attack especially: whether any page can
> still render without a merchant or run hooks conditionally (`client/src/components/merchant-gate.tsx`
> and the seven pages); whether each page leaves for /login exactly as before, exactly once, and never
> loops or reloads the login page; whether a change of merchant can show one merchant's state or data
> under another's id; what the gate's "reads the token only when it renders" property allows after
> sign-out or a 401; whether the new client gates (`client/src/__tests__/hooks-order-guard.test.ts`,
> the React-problem guard in `jest.setup.js`) can be bypassed or can pass vacuously; whether the
> edits to older tests weakened what they checked; whether any layout changed. Label anything you
> cannot verify UNVERIFIED; cite `file:line`; give a failing test for every Blocking issue. Return
> exactly the ten headings of plan §21.1 (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end
> with Approve / Do not approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects client`; `npm run build`, then serve it with
`npx vite preview --host 127.0.0.1 --port 5199 --strictPort` and run
`R1T8_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r1-t8-browser.mjs` (add
`R1T8_BEFORE_URL=` pointing at a preview of a `c6667985` build for the pixel and crash-reproduction
checks) and `R0_BROWSER_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r0-device-containment.mjs`.
