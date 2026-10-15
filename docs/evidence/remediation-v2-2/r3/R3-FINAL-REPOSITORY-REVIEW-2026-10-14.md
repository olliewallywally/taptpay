# R3 final repository review

Candidate: branch `fix/qwen-aligned-20261010`, base `27d235b8`; exact frozen
source hashes and verification scope are in
[R3-final-verification-2026-10-14.json](R3-final-verification-2026-10-14.json).
This is Codex's final implementation review and separately recorded reread;
no independent-agent review or provider UAT is claimed.

## Verification of Prior Fixes
Complete coverage: 214 server suites / 5020 tests, using the complete run and
explicit replacement of every failed/affected suite (28 suites / 1591 tests).
Full client: 133 suites / 1504 tests. No skips. Typecheck and production build
pass. Real owned PostgreSQL: 74 durability, 19 subscription, 15 command,
24 registered HTTP, 11 delivery checks. Safety/fingerprint contracts pass 8/28.
The exact method preserves the original red full-run record; it is not relabelled
as a single green full invocation. Both schemas/checksums match through 0047.

## Blocking Issues
No unresolved latest repository verification failures. Provider UAT, historical
identity/status preflight and production-sized migration timing remain release
blockers; synthetic evidence does not close those gates.

## High-Risk Concerns
Preserve pre-send identity and possible acceptance; do not rotate/resend unknown
commands. Bind exact tenant/session/share/account/money before settlement.
Decline identity remains in the attempt/binding/event, while captured-money fields
stay empty. Cash and confirmed unsent-expiry release only their matching browser
commands. A final declined session later approving remains a provider-lifecycle
question and a held contradiction, never an automatic new charge.

## Missing Steps
Repository implementation, inventories, typed transition tables, tests and
handoff are complete. Complete owner/provider UAT and production-sized restored
preflight/timing before a separately approved release. Claude's R4 integration
must preserve canonical migrations 0034–0047 and concrete event identity.

## Unsafe Assumptions
A MemStorage/mock controller test does not prove SQL durability. Registered HTTP,
concurrency, rollback, retained attempts, command/audit/outbox and actual receiver
checks run separately on owned PostgreSQL. Missing historical expected account
cannot be reconstructed from current credentials. Lease expiry cannot authorize
another send. Browser outcome, wallet submit reply and notification body cannot
settle money. SSE reconnect re-reads state; APNs display exactly-once is not claimed.

## Required Ordering Changes
Changes followed bounded reviews and failing-first checks. Actual receipt
commit precedes ACK; pre-send markers precede I/O; money/audit/outbox commit
atomically; diagnostics follow a fenced dead-letter commit. Financial locks
exclude network calls. Source was frozen for the final affected-suite, client,
typecheck and build checks. Commit/push only the explicit reviewed file list.

## Open Product / Provider / Legal Questions
Existing owner decisions remain: amount-first invoice UX, exact split allocation,
retained attempts after cancellation and property feed-under-dock. No new owner
tradeoff is outstanding for the repository patch. UAT must verify actual FPRN
method/shape, stored-card/charge evidence, final-decline lifecycle and uncertain
session/X-ID recovery. Production migration approval remains separate.

## Compliance and Data-Handling Notes
No shared migrations, live provider/payment/email/push, production flag change or
deployment. Contacts/credentials are synthetic in injected tests. Credentials
and bearer links are excluded from new receipt/log projections. The quote notice
uses its owned customer and merchant recipient, escapes markup, and freezes the
configured Billing action. Only counts/hashes/schema definitions enter evidence.
Private logs, dumps and Claude settings stay outside the commit.

## Test and Rollback Adequacy
All 18 failed full-run files were repaired with retained security/ownership/CAS
coverage; affected policy and receiver files reran as well. No skip or dropped
case was used to clear a failure. Unpaid failed/cancelled cancellation cases
remain explicitly covered. Actual PostgreSQL proves duplicate/two-worker/crash,
late capture, uncertain acceptance, rollback and frozen target retry behavior.
Restore keeps all 3000 seeded records with validated constraints and matching
complete fingerprints. Keep schema and accepted-operation history on code
rollback; never restore blind sends or independent callback finalizers.

## Final Recommendation (Approve / Do not approve)
Approve the completed R3 repository work for the already-authorized commit and
push. Do not approve official phase exit, shared migration or production release
without the external evidence and approved release step.

Separately recorded final reread: reviewed the final staged scope, runtime
bootstrap, attempt/finalizer boundaries, concrete creation/manual/subscription
commands, recipient/projection limits, browser recovery and generated metadata.
The final source manifest agrees with the tested files. Remote Claude `021d3f05`
was read and relevant R3 findings assessed; no wholesale R4/legacy merge occurred.
This recommendation closes repository work only and preserves the two external
sign-off requirements in the final handoff.
