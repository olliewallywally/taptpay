# R1-T10c-3 — existing browser gates on the session protocol

Branch: `remediation/r1-continuation-20260907`. Fixture-only implementation,
local working tree, not pushed or deployed. Scope/review:
[preflight](R1-T10c-3-preflight-2026-10-08.md). No application, migration,
baseline allowance or golden-image change belongs to this batch.

## Change and evidence

The shared retail/trades fixtures and desktop P0 now install an opaque HttpOnly
cookie and answer the startup endpoint the app actually reads. Cookie names and
flags follow `server/auth-sessions.ts`: HTTP `taptpay-session`, HTTPS
`__Host-taptpay-session`, SameSite Lax, root path, Secure on HTTPS. No fake JWT
is installed in browser storage. An observer checks the actual request and
response, expected ID/email/merchant/role/onboarding and nonempty CSRF token.
Each full navigation starts a new observation; a late previous reply cannot
satisfy the next page's startup. Mobile/dock/P0 explicitly refuse invalid startup
before measuring; existing measurement and source-isolation assertions remain.

Public fixtures opt out of the cookie and answer `signedIn: false`. Dock's absent
case now requires the real Login page, its `/login` address and no dock; it no
longer skips an unexpected dock. The exact tutorial-state fixture now wins over
the broad tutorial catch-all. Trades uses the retail module's standardized base
URL and Chromium configuration.

Red first: the new protocol check failed with `ERR_MODULE_NOT_FOUND` before the
helper existed. A separate browser probe loaded the frozen retail fixture from
`92f34f87`; `/terminal` landed at `/login` and failed its required `.tp-viewport`
assertion, independently showing it cannot display the signed-in screen. That
probe is retained under `.local/claude-scratch/t10c3-20261008/`.

## Final guarded runs

The runner serves real built screens, or real Vite source modules for P0, on
loopback. **It does not load the application server:** the old gates continue
using intercepted synthetic API replies. T10c-2 separately verifies real routes
and real sign-in. All final runs capture off-origin HTTP scripts/styles with
empty replies and other off-origin HTTP requests with 204; local/data/blob
requests retain their existing handlers. Initial uncontained diagnostic runs
are excluded from the final outcomes.

| Command/gate | Result |
|---|---|
| `node scripts/verify-browser-session-fixture.mjs` | 33 checks pass: HTTP/HTTPS startup, HttpOnly/no storage bearer, signed-out/cookie removal, wrong identity fields, incomplete/malformed replies, delayed bad second navigation, public optout, factory/tutorial precedence; external fetch/script capture also asserted |
| `run-fixture-browser-gate.mjs <built> scripts/verify-mobile-responsive.mjs --verbose` | 21 cells pass against the existing baseline; zero edge/clipping/inflation/tap misses; 3 visible rows floor; one improvement (trades 390 rows 2 to 3); no baseline update |
| `run-fixture-browser-gate.mjs <built> scripts/verify-terminal-dock.mjs` | Full phases A–F pass, six phones/three verticals, 66 feature-screen checks plus dock/channel/gesture/morph contracts; public dock absent/unset |
| `run-fixture-browser-gate.mjs --dev scripts/verify-desktop-p0.mjs` | Desktop/tablet/phone assertions pass, including original `/src/` request isolation; phone requests zero desktop modules |
| `run-fixture-browser-gate.mjs <built> scripts/verify-r1-t10-fixture-surfaces.mjs` | Six retail/property/trades desktop/tablet screens plus public Login and protected-to-Login redirect: 8 pass, no browser errors |
| `run-fixture-browser-gate.mjs <built> scripts/desktop-shots/shot-retail-home.mjs` | Original range/chart/health/notification/search interactions pass at desktop/tablet, no browser errors |

`<built>` was `/tmp/taptpay-t10-build-final-20261008`. Final local logs:
`/tmp/taptpay-t10c3-mobilegate-20261008.log`,
`/tmp/taptpay-t10c3-dockgate-20261008.log`,
`/tmp/taptpay-t10c3-p0gate-20261008.log`. Representative screenshots:
`/tmp/taptpay-t10c3-fixture-surfaces/`; P0 screenshots:
`/tmp/taptpay-desktop-p0/`. `git diff --check` passes.

## Limits that remain

P0's browser assertions pass, but the dev process reports inherited Replit
cartographer `traverse is not a function` transform warnings and stale browser
data warnings. These are recorded, not repaired or claimed absent. Mobile/dock
still have their historical handling of unrelated collected browser errors;
this batch adds a strict session precondition rather than changing those gates'
other scoring. The baseline's existing allowances remain owner work (T10f).

Twelve standalone screenshot/probe scripts retain private legacy JWT fixtures
outside the approved shared-fixture scope: `shot-property-home`,
`shot-property-terminal`, `shot-property-clients`, `shot-property-settings`,
`shot-property-analytics`, `shot-retail-terminal`, `shot-retail-settings`,
`shot-retail-analytics`, `shot-sign-out-everywhere`, `probe-motion-filmstrip`,
`tmp-verify-mobile-lists` and `tmp-probe-feed-toggle` (all `.mjs` under
`scripts/desktop-shots/`). This batch does not make them usable acceptance gates.
Property representative evidence uses `newRetailPage` plus `installPropertyData`.

These fixture repairs do not close R1-T10, authenticate against a real server,
prove live API wiring, authorize production or replace real-device/manual review.

## Reverification — 2026-10-10

Recovered at `92f34f87`; the October 8 temporary build was gone. Fresh build
`/tmp/taptpay-resume-build`, typecheck and full client suite (118 suites / 1,427
tests) pass. Protocol 33/33, representative surfaces 8/8, mobile 21 cells against
the unchanged baseline and desktop P0 all pass with exit 0. P0 still reports
inherited cartographer transform warnings; phone loads zero desktop source modules.

The fresh full dock run failed one harness requirement: the intended velocity
test achieved 0.15px/ms instead of >0.4px/ms. Its full pass claimed above is the
October 8 record, not a fresh full pass. Other sections reported no findings.
The invalid flick is retained in `/tmp/resume-dock-final.log`; an isolated gesture
rerun and its outcome are recorded in the October 10 handover.

The real-route matrix separately passes 204/204 cells, 840 API requests to 45
registered routes. This does not convert these historical synthetic gates into
real-server authentication evidence. Final implementation review remains owed.
See [detailed handover](../../../HANDOFF-2026-10-10-r1-t10-commit-and-push.md).
