# R1-T4 E3 preflight — 2026-10-02

Base: `f1ca29a8c38a13d793e7ee3a08db5cdc2120befa`, branch
`remediation/r1-continuation-20260907`. Scope: finish the interrupted E3 draft, as authorized in
[the owner's go](../../../decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md).
This is the implementer's preflight and separate reread, not the outstanding external security review.

## Verification of Prior Fixes

Re-read E1/E2, the external review fixes, their owner decisions, and the actual session resolver,
CSRF gate, stream checks and sign-in responses. Re-ran typecheck (pass) and client regression
(112 files / 1,303 tests pass). Server on the recovered draft: 114 suites pass, 17 fail;
278 failed / 3,254 passed. Failures include old tokens still accepted and old served tests expecting
logout to leave a bearer valid. The six new focused regressions fail before the fix. Logs are local
in `/tmp/taptpay-e3-{server,targeted,source}-before.log`; no real provider or database used.

## Blocking Issues

The unfinished switch is the work: old bearer tokens override cookies, bypass their CSRF check,
still grant admin access, and are returned by sign-in and password change. Remove these paths
before marking E3 complete. No blocker to the proposed E3 implementation.

## High-Risk Concerns

The cookie must win regardless of an Authorization header. Admin routes read only the admin
cookie. A named board stays a public board view even when a header or cookie comes with it.
Preserve the ecommerce API's distinct API-key header and all public payment credentials.

## Missing Steps

Finish the inherited test conversion without losing its refusal/tenant/effects assertions;
correct obsolete logout expectations; update the reviewed route contracts and regenerate policy;
add source guard and browser assertions for token-free responses; run full regression and build.

## Unsafe Assumptions

The handoff's background task IDs are historical. The ledger's generic "Next" predates E1/E2.
The tree, not those statements, establishes E3 as in flight. Do not apply 0030/0031 or assume the
development database has them; those are owner actions. No new migration is needed for E3.

## Required Ordering Changes

Preserve the failing runs, then delete token issuance/verification and bearer-based audience
selection, then check the cookie matrix and source guard, then the production-build browser probe.

## Open Product / Provider / Legal Questions

None for this authorized E3 scope. Keychain remains assigned to A-T4 by the owner. Wider R1 and
production gates remain open; this step cannot close them.

## Compliance and Data-Handling Notes

Synthetic fixtures only. No credentials in reports. Keep JWT_SECRET as existing HKDF input for
session, Google-state and throttle keys; removing account JWTs does not authorize key rotation or
dependency cleanup. No production action, payment enablement or external message.

## Test and Rollback Adequacy

Cookie success tests and correctly signed old-token refusals cover both principals. Additional
tests pin cookie/header precedence, CSRF bypass and cross-tenant admin escalation. Re-run session
rotation/revocation, stream, upload and route-policy tests. E3 has no schema changes; a correction
must preserve the retirement rather than restore the exposed account bearer path.

## Final Recommendation (Approve / Do not approve)

**Approve** the E3 scope above on `f1ca29a8` plus the recovered cookie-test draft, under the recorded
owner authorization. This is permission to implement and verify locally, not release approval.

## Separate reread before production edits

Re-read the request gate and the four issuance sites in `server/routes.ts`, and the mixed
board/business reads, independently of the proposed rewrite. Confirmed: Google redemption must
retain live-login/seat checks; password change must retain row validation and session-version
advance; SSE must retain shared-storage rechecks by session id; an unrelated header must not
turn a public board response into the business DTO. The API-key gate is a separate handler and
is outside the deletion. No additional blocker found. **Approve** the same E3 scope; final
external independent review remains owed.
