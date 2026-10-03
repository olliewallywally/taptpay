# R1-T7 transaction/refund continuation — 2026-10-03

Read CLAUDE.md and the newest entry at the top of the execution ledger first.
Branch: `remediation/r1-continuation-20260907`. No surviving workflow is needed.
Re-derive Git status/diff after any reset.

## Completed checkpoint

Code commit: **`ea4759cfc41bf92ffcd6f5bba125d72d93641489`**, local.
Base: `31f64efc2d405d60e071f364a29d918cde66137b`.
S2a adds explicit-merchant transaction/refund reads and atomic cancellation to both
storage implementations. Four routes migrated; the admin-only global cancellation
lookup remains explicit. Refund reads require matching refund and parent ownership.
Cancellation takes the payment finalizer's parent row lock, rechecks current tenant/
state, and publishes only a successful persisted row. Roles, responses and public/
provider lanes preserved. No schema/client/default-feature change.

[Preflight](PLAN-2026-10-03-r1-t7-s2-transactions-refunds.md),
[evidence/review brief](evidence/remediation-v2-2/r1/R1-T7-S2a-transactions-refunds-2026-10-03.md)
and [whole-R1 exit assessment](evidence/remediation-v2-2/r1/R1-exit-assessment-2026-10-03.md).

Recovery repeated focused 44 tests, affected 372 tests, fresh actual PostgreSQL 14
checks, typecheck/build/whitespace and regenerated inventories (187 routes, 0 gaps,
227 methods). Earlier full-server 3,631 and S1 PostgreSQL 10 are prior-session
records; their logs disappeared and neither was rerun in recovery. No failing
recovery check remains. Existing build/ts-jest warnings are recorded in evidence.

The disposable PostgreSQL instance under `/tmp/taptpay-s2-recovery-pg` is stopped.
It contains synthetic fixtures only. No application database/provider, migration,
push or deployment was performed. Independent review remains owed.

## Next batch: S2b

The source reread found that the sole runtime caller of `reserveRefundAmount`,
`releaseRefundAmount`, `createRefund` and `updateRefundStatus` is the authenticated
refund-initiation registration in `server/routes.ts`. These remain globally keyed
after S2a. `updateTransactionAfterRefund` has no runtime caller (prove all test/
script consumers before removing it). Inventory classification does not certify
these writes. Refund initiation remains disabled by default.

Start with its own preflight and separate reread, then failing storage/HTTP tests.
Require tenant at the reservation/write itself; creation/status need both refund
and parent authority. Preserve the atomic remaining-balance predicate and prove
concurrent tenant/state changes on real isolated SQL. Keep R4's durable reservation,
idempotency/provider X-ID and unknown-outcome recovery separate and explicitly open;
scoping this legacy route does not make it safe to enable. Define refusal handling
before any provider call, and after provider execution avoid guessing that money
did not move or publishing a success when local persistence was refused.

S2 also includes authenticated transaction creation/board association and the
disabled native branch; enumerate their actual consumers before changing contracts.
Then S3 property, S4 trades, S5 settings/exports, S6 upload lifecycle. Whole R1-T7
and R1 remain open. S6 provider/scanner/retention choices require owner decisions;
R3 gap-11 C2–C5 stays at its schema gate. Apple provisioning/device evidence and
R1-T10 device/tutorial/accessibility remain open. Keychain stays A-T4; development
0030/0031 actions stay with the owner. Production remains closed.

Stage explicit paths only; exclude `.claude-home/**` and `.claude/settings.local.json`.
An implementer's separate reread is not the outstanding independent security review.
