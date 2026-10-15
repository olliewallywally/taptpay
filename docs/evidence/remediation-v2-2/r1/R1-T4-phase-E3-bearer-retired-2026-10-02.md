# R1-T4 phase E3 — account bearer retired (2026-10-02)

Branch: `remediation/r1-continuation-20260907`. Code:
`8d5bad380776f3eb6b5e08e885e6cedb20aa6919`, on base
`f1ca29a8c38a13d793e7ee3a08db5cdc2120befa`. Local, not pushed. **E3 code-complete;
independent review remains owed.** This completes the approved web session rebuild, not the full
integration program or its release gates.

Authority: the supplied integration plan's R1-T4 / R1.B; the
[phase E design](../../../PLAN-2026-09-29-r1-t4-phase-e-sessions.md), with
[owner answers](../../../decisions/2026-09-29-r1-t4-phase-e-owner-answers.md) and
[go](../../../decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md). The adjacent attached TXT governs
the PDF rendering. The [preflight and separate reread](R1-T4-phase-E3-preflight-2026-10-02.md)
were recorded before production edits.

## Recovered state

Claude had committed E1 (server), E2 (client), the external-review fixes and the admin totals fix.
The interrupted E3 draft contained 56 modified tracked files and two new fixture helpers, chiefly
the server tests' conversion to cookie sessions. Production still issued account JWTs and accepted
them ahead of cookies. Old logout expectations and three snapshot fixtures were also unfinished.
Historical background-workflow IDs were treated as intent; Git and the actual sources established
the in-flight state. The recovered patch and helpers were copied under `/tmp/taptpay-e3-recovered/`
before editing. Those temporary files are not durable handoff evidence.

## Result

- Account requests authenticate by the session cookie, regardless of an Authorization header.
  `/api/admin/*` reads only the admin cookie; other routes retain E1's business-then-admin ordering.
  A header alone grants no account access, even when it carries a correctly signed, unexpired old
  merchant or admin token. Missing sign-in remains 401 under the recorded R1-T3 status decision.
- Password login, admin login, Google handoff redemption and password change return no account
  token. They retain their session cookie and in-memory CSRF response. Account JWT factories and
  verification were removed from `server/auth.ts`.
- The terminal's current-sale read and live stream select the business view only from the cookie
  when no board is named. A named board remains a public board view. Live streams keep E1's
  shared-storage rechecks by session id; there is no bearer recheck path.
- The recovered harness now creates real session rows and sends cookie plus CSRF. The route
  matrix tests old merchant/admin tokens as refused callers and retains storage-snapshot and
  external-effect assertions. Existing owner/member/admin, tenant, upload, session revocation,
  reset, change-password, throttling and disabled-money-route tests run through cookies.
- Six focused regressions pin token-free login, cookie/header precedence, CSRF-bypass refusal
  and cross-tenant admin escalation refusal. Twelve source-guard tests scan production client
  source for credential storage, account JWT readers and Authorization headers; legacy-key
  removal and the credential-free pending-sign-out mark are explicit exceptions. The guard also
  rejects restoring the server's account JWT factories. It is a regression guard for the named
  source patterns, not a proof against every dynamically disguised credential path.
- Client changes in E3 are test-fixture cleanup only. Production client UI and device gating
  are unchanged. The real-browser probe now includes tablet sign-in/reload and audits auth
  response fields before immediate navigation discards a response body. It identifies the
  three deliberate bare refusal requests by request identity, with no allowance for unexplained
  missing-CSRF app requests.
- Reviewed route contracts and inventory were regenerated: **187 registrations, 0 unclassified,
  0 suspected gaps**. Generated metadata records the pre-commit base; the diff and this report
  identify the exact committed E3 scope.

Public checkout/invoice credentials, ecommerce API keys, Google provider tokens and APNs JWTs
remain their distinct protocols. `JWT_SECRET` remains the existing HKDF input; no key rotation or
package removal was performed. `jsonwebtoken` is still used by APNs and by negative test fixtures.

## Verification

All runs used synthetic fixtures. Server HTTP tests used the isolated in-memory harness; the
browser used a clean environment, disabled payments, simulated email and loopback HTTP. Off-machine
browser requests were aborted. No database, provider, production, migration or deployment action.

| Check | Observed result |
|---|---|
| Recovered draft, before production edits | Client 112 suites / 1,303 tests pass; typecheck pass. Server 114 suites pass / 17 fail; 3,254 tests pass / 278 fail. |
| Six new regressions, before production edits | All six fail for the targeted old-token behavior or exposed response token. |
| Focused regressions and source guard, after changes | 2 suites / 18 tests pass. The guard's initial bracket-access detector defect was corrected before relying on it. |
| Full server regression | 132 suites pass / 1 fail; 3,549 tests pass / 1 fail, 3,550 total; 639.802 s. The sole failure created its admin session after the supposedly unchanged baseline snapshot. |
| Corrected server fixture | Admin session created before the snapshot; the unchanged-state assertion is retained. Entire `c10-batch-6-business.test.ts` rerun: 44/44 pass, 14.815 s. No known server failure remains. This is a full run plus a focused correction/rerun, not a claimed second clean full run. |
| Full client regression after fixture cleanup | 112 suites / 1,303 tests pass, 111.006 s. |
| Final typecheck | `npm run check`, exit 0. |
| Production build | `npm run build`, exit 0; Vite 31.30 s, esbuild 50 ms. Existing chunk-size warnings remain. |
| Browser on the built client | **50 checks pass**, exit 0. Desktop 1440×900, phone 390×844, tablet 1194×834. |
| Generated inventory / whitespace | 187 / 0 / 0; `git diff --check` and staged check pass. |

The final browser run observed 928 requests, 92 aborted off-machine (23 analytics), 84 server
request-log lines and six session/CSRF secrets tracked only in memory. No Authorization header,
credential-bearing address, credential in browser storage, account credential response field or
secret in the request log. Eight changes carried CSRF; **zero unexplained omissions**. Three deliberate
refusal probes were identified separately. Merchant/admin cookie properties, desktop/tablet reload,
phone current sale and SSE, hostile fetch/form refusal, sign-out-everywhere, local logout, offline
pending logout and admin isolation/totals passed. This is targeted auth/device coverage, not R1-T10's
full tutorial/accessibility acceptance.

Ephemeral run logs: `/tmp/taptpay-e3-{server,targeted,source}-before.log`,
`/tmp/taptpay-e3-targeted-after.log`, `/tmp/taptpay-e3-server-after.log`,
`/tmp/taptpay-e3-batch6-final.log`, `/tmp/taptpay-e3-client-after.log`,
`/tmp/taptpay-e3-typecheck-final.log`, `/tmp/taptpay-e3-build.log`,
`/tmp/taptpay-e3-policy-final.log`, `/tmp/taptpay-e3-browser-final.log`.
Raw test failure snapshots are not committed: they contain synthetic password hashes and session
metadata. The sanitized results above are the durable record. PostgreSQL E1 verification is historical
and was not rerun in this E3 transport-only step; storage and schema are unchanged.

## Applicable source-control crosswalk

Each row identifies this phase's task, owner, test and handoff. It neither closes nor silently defers
controls assigned to another phase. Legacy numbers refer to v2.2 §22, restated by the supplied plan.

| Source control | E3 task / owner | Tests and artifact / disposition |
|---|---|---|
| R1-T4 web cookie and no JavaScript credential; §22.9 bearer transition/identity | E3 retire issuance and acceptance / engineering under the phase E owner go | `account-bearer-retired`, `account-session-source-guard`, served sign-in, Google and session-version tests; this report. The owner-approved cookie design supersedes the temporary JWT transport. |
| R1-T4 revocation/rotation and reset; §22.9 password-reset/session control | Preserve E1/D server-session gates / engineering | `auth-sessions`, `session-version`, `team-auth`, `auth-core-regressions`, live stream and push tests in the full run; this report. No storage rewrite. |
| R1-T3 and §22.9 route/principal matrix and two-merchant isolation | Convert the complete existing matrix to cookies and add old-token refusals / engineering | `route-matrix*`, role-default and uploaded-file tenancy tests; generated `R1-T2-route-inventory-table.md`, this report. |
| R1-T4 and §22.9 exact-origin CORS/CSRF and shared throttling | Preserve cookie CSRF and cross-site refusals; prove a header cannot bypass them / engineering | Focused zero-effect regressions, `cross-site-guard`, `auth-throttle`, trusted-proxy suites, browser; this report. No throttle-store change. |
| R1-T4 source/runtime no credential in storage, URLs, logs or analytics | Add source guard, strengthen response and request audit / engineering | Twelve source-guard cases; 50-check browser run and this report. Wider OAuth/reset tests retained. |
| §22.11 device/auth regression after affected batches | Cookie sign-in, reload, logout and phone terminal smoke / engineering | Browser viewports above; full client suite; this report. Full device/tutorial/a11y acceptance stays R1-T10. |
| R1-T4 native secure storage | Already assigned by owner to A-T4 / owner + Apple track | 2026-09-29 phase E owner answers; no Keychain completion claimed here. |
| §22.9 obsolete session packages | Runtime/import proof and package cleanup belongs to R8 / engineering | No packages removed in E3; APNs still uses JWTs. |
| §22.9 production seed denial and aggregate state machines | Existing safety gates retained / engineering | R0 runtime-safety and disabled-route suites in the full run; no seed or payment-state edits in E3. |

## Owner actions and remaining work

- Migration `0031` (session table) in development remains the owner's action. E1's recorded decision
  says dev sign-in fails when the new server runs without it. E3 neither inspected nor changed dev.
  `0030` is also still listed as an owner action in the ledger. Production is closed.
- Everyone must sign in once after the coordinated release: old bearer-only clients cannot authenticate.
  Release waits for the existing human gates; this local commit is not release approval.
- Independent review of E1/E2/E3 and the external-review/deadlock fixes remains owed. R1-T7's tenant
  storage/upload remainder is the next engineering scope; replay work C2–C5 needs the R3 schema decision.
  R1-T5 needs Apple provisioning/device evidence; R1-T10 remains gated. Full R1/integration completion
  is not claimed.

## Brief for independent review

Review `f1ca29a8..8d5bad38`, the preflight, phase E design/decisions and the E1/E2/review-fix evidence.
Follow the supplied plan's ten-section reviewer template and perform a separate recorded reread.
Concentrate on:

- Any remaining account bearer issuance/acceptance, including mixed board/current-sale/SSE routes.
- Valid old admin headers beside business cookies; missing/wrong CSRF; both-cookie precedence and
  admin-cookie isolation; refusal storage and external-effect assertions.
- Token-free password/admin/Google/password-change responses without lost live-login/seat checks.
- Inherited fixture conversion: preserve prior role, tenant, outage, reset/revocation, upload and
  disabled-money assertions rather than turning them into superficial cookie-success tests.
- Source-guard limits and browser negative-probe classification; the auth-response audit must survive
  immediate navigation. Public payment/API-key/APNs protocols must remain distinct.

Reproduce: `npm run check`, `npm run test:client -- --runInBand`, `npm run test:server`,
`npm run build`, then `node --import tsx scripts/verify-r1-t4-sessions-browser.ts <shots>
<absolute dist/public path>`. Use the script's isolated environment, no ambient credentials.

Rollback is corrective code with bearer retirement preserved. Do not restore the exposed account
JWT path, roll back secrets, enable payments, or apply migrations as part of this review.
