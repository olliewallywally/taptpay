# R1-T5d — the Apple button on the login page, and its row in Settings

Exact branch `remediation/r1-continuation-20260907`, code `3e5db51d`, base `d86d6f11`
(T5c code `3520df77`; the commits above it are documentation).
[Plan and preflight](../../../PLAN-2026-10-04-r1-t5-sign-in-with-apple.md).
T5d is code-complete; independent review is owed. **R1-T5 is not complete**: the runbooks
(T5e) remain, and going live needs the owner's Apple setup and a real iPhone. Owner
decision 2026-09-29 (answer 2) governs.

## What was built

**One small server read.** `GET /api/auth/apple/available` answers `{ available }`: whether
Sign in with Apple can run on this server (all four Apple settings, and an https public
origin). Public, never cached, the same for every caller, nothing of the settings
themselves.

**The login page.** It asks that question once when it opens and shows "Continue with
Apple" only on a yes. Until the owner's Apple setup, and whenever the server cannot say,
the page is exactly as it was. The button sits directly under Google's, the same width,
height and shape, black with Apple's mark. Pressing it goes to the server's start
(`/api/auth/apple`). Apple's return lands on `/login?apple=complete`; the page redeems the
one-time code by a same-origin POST (`/api/auth/apple/session`), as Google's handoff does,
and stores nothing. Only the word `complete` redeems; Apple's word leaves the address
either way. Apple's refusals arrive as `?error=`, in the server's own words, as before.

**Settings.** The owner's "Sign in with Apple" row, in the Account section on the phone
(`client/src/pages/settings.tsx`) and on the tablet and desktop screen
(`client/src/desktop/DesktopSettingsPage.tsx`, under the password row), from one shared
piece (`client/src/hooks/use-apple-connection.ts`):

- it shows "Not connected", or "Connected" with the address Apple gave (and "Hide My
  Email" when that is a relay address);
- a field for the current password and one button, "Connect Apple" or "Disconnect
  Apple", which does nothing until a password is typed. The password is typed, used once
  and forgotten; it is never stored and never in an address;
- connecting leaves the page **only** for Apple's own sign-in page
  (`https://appleid.apple.com/auth/authorize`), whatever the answer says;
- Apple's return (`/settings?apple=<word>`) opens the Account section and says how it
  went by one of eight fixed words. **"Connected" is said only when the server's own
  answer agrees**: the word alone is anyone's to write into a link, so it claims
  nothing. Any other word says nothing. The word leaves the address at once;
- a refusal shows the server's own words, or one fixed sentence: never a raw body or the
  browser's own error text;
- "No password yet?" goes to `/forgot-password`, for an owner who has only ever signed in
  with Google;
- it is not drawn for a teammate (whose page asks the server nothing about Apple), nor
  where Apple is not set up and nothing is connected. Where Apple is no longer set up, a
  connection made earlier is still shown, so it can be removed.

No new colours. No change to Google's button, handoff or tests, the password row, or any
other Settings behaviour.

## Verification

- Red first, replayed on an archived copy of `d86d6f11` with the final test files. Server:
  **5 assertions fail** (the read in its three configurations; a request for a route that
  does not exist, twice), 55 older ones pass. Client: **the five new suites cannot load**
  (what they test does not exist), and the one changed test fails.
- Focused green. Server: the three Apple sign-in suites and the served sign-in suite,
  **60 pass**. Client: the five new suites, **117 pass** (the rules both screens share 33,
  the shared row 41, the login page 15, the phone screen 10, the tablet and desktop
  screen 18); Google's handoff, the password sign-in and the existing Settings tests
  still pass beside them.
- The read is registered and held by the existing machinery (its review, the public-path
  entry, a served case): route suites and their neighbours **32 suites / 1,881 tests
  pass**. Inventories: **194 registrations / 0 unclassified / 0 gaps; 266 storage
  contracts**.
- **A real browser, the real routes, a stand-in for Apple**
  (`scripts/verify-r1-t5-apple-browser.ts`): **83 of 83 checks pass**, on the built app,
  at phone (390×844, touch), tablet (1194×834, touch) and desktop (1440×900). The app is
  served over https on a loopback port with a certificate made for the run; a second
  local server is, to that browser only, `appleid.apple.com`, and posts the form back
  the way Apple does, so the post is a real cross-site form post. At each size:
  - the login page shows both buttons, Apple's directly under Google's, the same width
    and height (49.6 px on the phone, 57.6 px on tablet and desktop), black with a white
    mark;
  - someone new signs in with Apple and gets a new business; signing in again, with no
    email from Apple, opens the same business;
  - **the server received Apple's post back as `Origin: https://appleid.apple.com`,
    `Sec-Fetch-Site: cross-site`, with the starting cookie; on a connect, with the
    starting cookie and without the session cookie**; and the owner was still signed in
    afterwards;
  - a signed-in owner sees the row; a wrong password is refused in the server's words; a
    cancel at Apple comes back saying so and asks Apple's servers nothing; a connect
    comes back to the open Account section saying "Apple connected", with the address
    Apple gave; Sign in with Apple then opens that owner's business; a disconnect
    returns the row to "Not connected";
  - the row fits the screen, and on the phone its field and button are at least 44 px
    tall;
  - no code, token, state or nonce appeared in any address but the stand-in Apple page's
    own, none in the server's request log, and no page raised an error.
- Mutation check, on scratch copies only: **81 of 81 planted defects caught**, none
  surviving: 74 in the pages (the rules both screens share 13, the shared row 23, the
  login page 17, the phone screen 10, the tablet and desktop screen 11) and 7 on the
  server. Among them: the button shown before or whatever the server answers; Apple's
  code redeemed at Google's route, or for any word; a connect leaving for another site,
  for Apple over http, or for another page of Apple's; "connected" said on the address's
  word alone; a return announced to a teammate; a raw body or the browser's own error
  shown; the password kept after use; a teammate's page asking about Apple; the row
  drawn whatever the server says; the server saying Apple is offered without its
  settings or on http. Not planted, because they change nothing or cannot be seen by a
  page test: the row's "is the owner" condition where the question is already not asked
  for a teammate, and the two one-line navigations (jsdom cannot navigate; the browser
  check above goes through both).
- Typecheck, production build and whitespace pass.
- **Full client: 117 suites / 1,420 tests pass** (37.394 seconds) and **full server: 179 suites / 4,436 tests
  pass** (766.798 seconds), both exit 0, run on `3e5db51d` with a clean tree apart from
  untracked documentation.

## Phase handoff record

- Scope/files: `git show --stat 3e5db51d`.
- Migrations/target: none. No database of any kind was contacted (the browser check and
  every test use in-memory storage).
- Commands/logs: the base replays, focused and route runs, the browser check and its
  screenshots, both mutation scripts, typecheck/build, both generators, the full runs.
  Under `.local/claude-scratch/session-2026-10-06/` (git-ignored).
- Negative/effect proof: a refused connect or disconnect leaves the page where it was
  and the row unchanged; nothing is stored in the browser; the address is cleaned.
- Provider/UAT, devices, external actions, deploy: none. **No real Apple account, key,
  endpoint or device was used.** Chromium stood in for the browser: it proves the pages
  and this server's cookies together, not Safari's own rules. Safari on an iPhone, the
  TaptPay app, and Apple itself are the owner's check (the list is T5e's runbook).
- Security/privacy: reviewed what the page believes (only the server's answers; never an
  address's word for a success), where it may leave to, the password's life in the page,
  what the public read reveals, and what analytics is told (the provider's name and
  nothing else).
- One existing test moved, on purpose: `login-session.test.tsx` counted every request the
  login page made (one); the page now also asks whether Apple is offered, and the test
  names the two it expects.
- In-flight: none.
- Rollback/constraints: no rollback commit; fix forward. Nothing here changes a stored
  row's shape.
- Approvals/stops: the T5d preflight and separate reread approve exactly this scope on
  `9a531b3e`. No application, provider or production gate was crossed.
- Recorded for the owner, not decided here (the plan's list): where the button sits and
  how it looks (1); the Settings row (9); the login page's "Forgot password?" stub (10);
  Apple's mark on the button (11): the shape is Font Awesome's Apple icon, and Apple's
  guidance asks for the artwork from its own design resources. Also: analytics counts a
  refusal that came back as `?error=` as Apple's when its words name Apple, otherwise as
  Google's, as before.
- Deferred/next: T5e (runbooks and the owner's list).
