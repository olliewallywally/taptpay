# R0-T5 — client containment, truthful capability, and the first device smoke

> Correction, 2026-09-12: the desktop full-bleed diagnosis below was a verifier
> selector error. It measured the backdrop rather than the actual rounded frame.
> The owner-question is withdrawn; the corrected matrix passes 20/20 with no
> application layout change. See [correction and evidence](R0-T5-frame-measurement-2026-09-12.md).
> The original results below are preserved as historical evidence.

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.

R0-T5's client-side clause had never been executed: "Client side: hide the
removed controls or show a truthful unavailable state in `client/src/App.tsx`,
`pages/nfc-payment.tsx`, the terminal pages, `components/native-payment-buttons.tsx`,
`components/digital-wallet-buttons.tsx` and the tutorial registry. Do not change
the surrounding phone, tablet or desktop layout while doing it." Its acceptance
check — "Device smoke at all three viewports — no layout shift from the hidden
controls" — had never been run either.

## Running the device gate without disturbing the running server

`scripts/verify-r0-device-containment.mjs` existed, unrun. It wants a server on
`127.0.0.1:5000`, but this workspace already had a long-running `npm run dev`
there, started before this session and serving pre-fix code. Restarting it was
rejected as unsafe: this shell **cannot reconstruct that process's
environment** — a config dry-run showed the shell is missing `PUBLIC_ORIGIN`
and carries a `WINDCAVE_API_KEY` the app process does not, which trips R0-T2's
partial-credential-pair rule. Killing the server could have left it down with no
way to restore it.

The script mocks every `/api/*` call through Playwright's request interception
and only needs the built client for anything else, so the gate was pointed at a
throwaway static server (scratchpad, not repo) serving `dist/public` on port
5173 via `R0_BROWSER_BASE_URL`. The running dev server was never touched.

## First run — 7/15 passed

| Failure | Real? |
|---|---|
| phone `/terminal`: an **enabled control labelled `paywave`** | yes |
| `/nfc` on phone, tablet, desktop: "NFC simulator must be retired" | yes |
| desktop ×4: frame not centred/inset at 1440×900 | out of scope — see below |

## Root cause found server-side first

`GET /api/nfc/capabilities` derived **every** field from the User-Agent string:
`nfcSupported: !isDesktop`, `applePay: isIOS`, `googlePay: isAndroid`,
`contactlessCard: true`, and recommendations like "Use Apple Pay for fastest
checkout". A phone was therefore told NFC, Apple Pay and contactless were
available while the routes behind them refuse — a fabricated capability, which
is precisely what R0-T5 removes.

It now reports Tap to Pay from its real gate (`config.features.tapToPay`) and
the wallets as `false`, because their routes are tombstoned and there is no
wallet gate to consult — inventing one would have been inventing a convention.
Covered by a new test that drives an iPhone User-Agent and asserts every field
is `false` and no Apple/Google Pay wording appears.

## Client changes

- **`pages/nfc-payment.tsx`** — the simulator is deleted, not flagged (plan rule
  5). It drove `/api/nfc-sessions/:id/complete`, which no longer exists in the
  production router, and posted a hardcoded `cardLast4: '4532'`. What remains is
  a truthful unavailable state at the same route, so a bookmarked page tells the
  merchant plainly instead of failing mid-flow.
- **`features/terminal/retail/RetailTerminalViewCore.jsx`** — `showPaywave` now
  defaults to `false`, and `pages/merchant-terminal-mobile-v2.tsx` stops passing
  `true`. The plan's own words: "Until real proof, capability is false." The
  delegation path stays wired for when the gate opens.
- **`features/tutorial/tutorial-registry.ts`** — the `retail-nfc` tutorial
  taught "have the customer tap their card or wallet to pay". Its **content** is
  now truthful. Its **page key stays registered**: `TUTORIAL_PAGE_KEYS` lives in
  `shared/tutorial.ts` and the server reports `pageCount: TUTORIAL_PAGE_KEYS.length`,
  so removing a key would change a contract and merchants' stored progress —
  and gap 8 lists tutorial contracts as protected. Content truthfulness is
  R0-T5's business; structural removal is the owner's.

Two superseded client assertions were corrected rather than weakened: the
paywave delegation test now passes `showPaywave` explicitly (keeping the wiring
covered) and a new sibling test asserts the control is absent by default.

## Second run — 10/15 passed

Every containment failure is closed: phone `/terminal` has no enabled paywave
control, and `/nfc` shows a truthful unavailable state on all three viewports.
The tablet shell still measures exactly as before — frame 1194 wide at x=0,
radius 0, canvas 1180×880 scaled 0.9477 — so nothing shifted.

## The 5 remaining failures are one question, and it is not R0-T5's

All five are the same assertion: at 1440×900 with a fine pointer, the desktop
shell renders **full-bleed** (frame width equal to the viewport, x=0) rather
than as a centred inset frame. `assert.ok(facts.frame.width < viewport.width && facts.frame.x > 0)`.

This is **not** reported as a defect here. It belongs to R1-T10 / D10, whose
acceptance row reads "At 1440×900, verify the centred ~1000×746 rendered frame
containing the scaled 1180×880 logical canvas", and it is gated behind R1-H1
owner acceptance of the visual baseline. `CLAUDE.md` also records that the
tablet/desktop work carries deliberate design deviations Oliver wants raised as
one list rather than silently "fixed" mid-stream. Either the shell or the
script's expectation is wrong; deciding which is an owner call, so it is raised,
not changed.

## Also found, deliberately not acted on

`client/src/pages/merchant-terminal-mobile.tsx` still contains `simulateNFCTap`,
which posts a fake contactless payment (`cardLast4: '4532'`) to the retired
route. **The file is imported by nothing** — `App.tsx` lazy-loads only
`merchant-terminal-mobile-v2` — so it is unreachable at runtime and is not a
live containment hole. Deleting a ~2,000-line unrouted page is §22.5 repo
hygiene, which requires reachability classification and owner sign-off, not an
R0 containment edit. Recorded as a landmine: re-route that file and a fake
payment path returns.

## Verification

- Device gate: 10/15, from 7/15. Remaining 5 are the single desktop-frame
  question above.
- `npm run check` passes. Server: 51 suites / 970 tests. Client: 52 suites /
  487 tests.

## R0-T5 status

Still **PARTIAL**, and now for a shorter list. Closed here: the client control
surface, the fabricated capability endpoint, and the device smoke itself
(executed for the first time). Still open: the desktop-frame question above is
owner-gated, and the production historical-credential count remains owner work
(see `R0-T5-credential-count-2026-09-11.md`).
