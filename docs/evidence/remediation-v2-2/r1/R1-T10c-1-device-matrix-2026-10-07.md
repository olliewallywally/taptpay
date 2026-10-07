# R1-T10c-1 — the device matrix as one gate

Exact branch `remediation/r1-continuation-20260907`, base `73901d86`.
[Plan and preflight](../../../PLAN-2026-10-06-r1-t10-acceptance-matrix.md) ("T10c
preflight"). Code-complete; independent review is owed. **R1-T10 is not complete, and
neither is T10c**: T10c-2 (the measurements) and T10c-3 (the old gates) are not started,
and what a customer opens and the admin area are not in the gate yet.

| Commit | What it is |
|---|---|
| `86d5785d` | The gate: every merchant screen at the four sizes |
| `8a4a13e2` | The fault it found, fixed, with a test of its own |
| `6c553579` | The gate extended to the pages outside the merchant frame |

**About `6c553579`.** It was made by the Replit agent, not by this session: the agent
commits the whole working tree on its own, and it did so during a pause, with a message
of its own. It holds exactly two files of this work: the gate's script as verified
below, and an unfinished draft of this file. Nothing else is in it. It is left as it is
(rewriting it is the owner's call); this file is now the finished one.

## What was built

`scripts/verify-r1-t10-device-matrix.ts`. In one process it stands up this tree's app
(the real routes over https on a loopback port, the built client, in-memory storage; no
database, no dev server, nothing sent to any other machine), **signs in through the
real login page**, and opens every screen at the four sizes the plan names:

| Size | Window | Pointer | Shell expected for a merchant screen |
|---|---|---|---|
| phone | 390×844 | touch | the phone's own screens; no desktop frame |
| tablet | 1194×834 | touch | the shared tablet and desktop screens, filling the window, square corners |
| desktop | 1440×900 | mouse | a centred, rounded frame 1000×746 holding the 1180×880 canvas |
| short desktop | 1440×650 | mouse | the same desktop frame, 819×611 (decision D10) |

**128 cells:**

- **88 for the merchant's screens**: the 20 routes `App.tsx` gives a tutorial page to,
  with Settings once for each of the three verticals, at each size;
- **40 for the pages outside the merchant frame**: the landing page, sign-in, sign-up,
  forgot password, reset password (with no token, which is a screen of its own), check
  your email, the info page, terms and privacy, opened with nobody signed in; and
  onboarding, opened as a business that has signed up and not finished it.

**A cell passes only when it shows all of:**

- the address it was sent to, still (not the login page);
- **a mark of its own screen.** For a merchant screen, a target of that screen's own
  tutorial for that device class. For a page outside the frame, a control or the words
  only that page has. The old gates asked only for "some text and no error", and pass on
  an error screen (the preflight);
- the shell: for a merchant screen, the one in the table, measured (the arithmetic is
  the containment gate's); for a page outside the frame, no merchant frame at any size;
- no page error, no console error, no failed request to this app. One answer is not a
  failure, and only that one: where nobody is signed in, `GET /api/auth/session` says
  401, which is how the page learns it;
- **every `/api` address it asked for is one the server registers** (finding 2);
- no error screen ("couldn't check your session", "Something went wrong", "Connection
  Lost"), and nothing still animating when it is read.

What a page asks of any other machine is answered with an empty reply and listed.

## What it found

1. **A console error on the phone's transactions page, on every draw** (fixed,
   `8a4a13e2`). `Error: <svg> attribute height: Expected length, "auto"`: the sales
   chart's svg had `height="auto"`, which is a CSS value and not an svg length. The
   browser ignored it, so the chart was already sized by its width and its viewBox. The
   word moved to CSS. **Nothing moves**: the chart's box measured in the browser before
   and after is the same (x 4, y 268.78, 382×111.69). A client test now reads every
   page's JSX for a width or height of an svg shape that is a CSS word.
2. **The server answers an API address it does not have with the app's own page and a
   200.** `server/vite.ts` `serveStatic` sends `index.html` for any address nothing else
   took, `/api/...` included. So a wrong address in a page is not a failed request in
   the browser: the page gets HTML where it asked for data. The gate's own self-test
   found this (a planted request to `/api/no-such-route` came back 200). The gate now
   holds every address a page asks for to the server's route policy. **Not changed
   here**: what the server should answer there is recorded for the owner below.
3. **The phone's trades home has none of its tutorial's own targets.** Its two phone
   steps point at marks (`trades-home-health`, `trades-home-actions`) that exist only on
   the desktop's trades home, so on a phone that tutorial can only land on its
   fallbacks: the first card, and the first thing that can be tapped. The gate knows
   that screen by its fallback and lists it apart. This is T10d's (the tutorial matrix)
   to settle; nothing is changed here.
4. **What every page asks of other sites**, from three lines of `client/index.html`,
   in the production build too: Google Fonts (a stylesheet), Google Tag Manager
   (`gtag.js`), and Replit's dev-banner script (`replit.com/public/js/replit-dev-banner.js`,
   a line of the Replit template). Listed; not changed.
5. **Once, the phone's login button could not be tapped.** In one sign-in on the phone
   out of about twenty-five in this session, the browser found first the logo and then the
   page itself at the button's centre, for the thirty seconds it kept trying. It has not
   happened again. The gate now says what is at the button's centre, with a picture, if
   it does. It is not explained; it belongs to T10c-2's tap measurements.

And, from the preflight: the old device gates cannot see a signed-in app since R1-T4
phase E; a copy of one passes 4 of 20 scenarios, on an error screen.

## Verification

- **Red first.** The gate was written against a tree whose phone transactions page had
  the fault: on the build of `86d5785d`, **87 of its 88 cells pass and one fails**,
  naming the console error. The client test added with the fix fails on that one line
  before it.
- **The gate is itself tried.** `--self-test` plants thirteen faults, one at a time.
  On a merchant screen: nobody signed in; the wrong screen up; a console error; a page
  error; a request this app refuses; a request to an address the server does not have; a
  phone judged as a tablet; a desktop judged as a tablet; a desktop frame pushed 40
  pixels off centre. On a page outside the frame: onboarding opened with nobody signed
  in; the wrong page up; a signed-out page asking for a business's data (so the
  session's own 401 excuses nothing else); and that page judged as a merchant screen.
  **All thirteen are caught, and the three unplanted controls pass.** The first run of
  it, with nine, caught eight: the request to an address the server does not have came
  back 200, which is finding 2 and why the route check exists.
- **On this tree: 128 of 128 cells pass.** 584 requests to this app's API, to 31 of the
  server's routes (all of them reads), none to an address it does not have. Each of the
  20 merchant screens is known by a different mark on the phone, and by a different
  mark on the tablet and desktop. One cell is known by a fallback only (finding 3).
  Run again from `6c553579` after the pause: the same.
- The fix: the client test red before it and green after; **6 of 6 planted mistakes
  caught** by that test (the chart's attribute put back three ways, and three other
  svg shapes given a CSS word); the chart's measured box unchanged.
- Full client **118 suites / 1,422 tests** on the tree (one new suite, two new tests);
  the server tests that read client source 5 / 117; typecheck, production build and
  whitespace pass. No route changed.
- **Full client: 118 suites / 1,422 tests pass** (45.323 seconds) and **full server:
  180 suites / 4,479 tests pass** (823.153 seconds), both exit 0, on an archived copy of
  `8a4a13e2`. `6c553579` changes only the gate's script and this file, neither of which
  a test suite reads.

## What it does not show

- **What a customer opens, and the admin area, are not in it yet**: the pay, split,
  checkout and receipt pages need a sale with its link; the admin needs its own sign-in.
  Nor are the pages reached only through a link in an email (confirm your email, accept
  an invite, reset a password with a real token).
- **Only each screen's first load.** Nothing is tapped, typed or saved, so the 31 routes
  asked are the ones a screen reads when it opens. The other routes T10b moved are not
  exercised by a browser here.
- **Property and trades run on rows put behind eleven storage reads.** The in-memory
  storage has none of its own for them. The routes, their checks and their replies are
  the real ones; the storage under them is not exercised for those two verticals.
- **Chromium on Linux**, not Safari on an iPhone or an iPad; portrait only. Real
  devices and which orientations to cover are the owner's (T10f, question 6).
- The measurements (nothing wider than the window, no clipped text, tap centres, rows in
  view) are T10c-2. The old gates are T10c-3.

## For the owner

Neither blocks the work; both are his to decide.

7. **What the server should say to an API address it does not have.** Today: the app's
   page, with a 200. A "not found" in the API's own form would let a page, a test and a
   log tell a wrong address from a right one. It changes what an integrator calling a
   wrong address gets back, so it is not changed without him.
8. **Replit's dev-banner script in the live page.** Every visitor's browser asks
   replit.com for a script on every page, the payment pages included. It is one line of
   `client/index.html`.

## Phase handoff record

- Scope/files: `git show --stat 86d5785d 8a4a13e2 6c553579`.
- Migrations/target: none. No database of any kind was contacted.
- Commands/logs: `npx vite build --outDir "$PWD/<dir>"`, then
  `node --import tsx scripts/verify-r1-t10-device-matrix.ts <evidence dir> "$PWD/<dir>"`
  (about four minutes), and the same with `--self-test`. Logs, results and
  the pictures: `.local/claude-scratch/session-2026-10-07/t10c/` (git-ignored):
  `matrix-old.log` (the 88 merchant cells on the build before the fix), `matrix-4.log`
  and `matrix-4/` (all 128), `selftest-outside.log`, the same two again from `6c553579`
  (`matrix-at-6c553579.log`, `selftest-at-6c553579.log`), `svg-*.log` (the chart before
  and after), `mutation.log`, `r0-containment-on-this-tree.log` (the old gate).
- Negative/effect proof: the self-test's thirteen plants; the client test's six.
- Provider/UAT, devices, external actions, deploy: none. A real browser (Chromium
  125) on this machine only.
- Security/privacy: every row is made up in the run and held in memory. Requests to
  other machines are answered here and never sent.
- Generated files: none changed.
- In-flight: none.
- Rollback/constraints: the gate is a script; the fix is one attribute moved to CSS.
- Approvals/stops: the T10c preflight approves T10c-1. One page was changed, for a real
  fault, as its own commit with its own test, as the preflight required. No application,
  provider or production gate was crossed.
- Deferred/next: what a customer opens and the admin area; then T10c-2 and T10c-3.
