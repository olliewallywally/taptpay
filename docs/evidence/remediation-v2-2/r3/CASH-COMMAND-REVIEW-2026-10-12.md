# R3 cash command review

Base `3e1bf582`. Cash is a merchant's manual record, not provider authorization.

## Verification of Prior Fixes
Combined R2/R3 core and PostgreSQL evidence passed. Read both cash callers and
the active cash route: it currently creates a completed sale and communicates
again on every retry, with no durable request key or atomic audit.

## Blocking Issues
No blocker for cash command identity and atomic local effects. Final financial
delivery still needs the shared real receiver integration; no unkeyed sender
will be represented as a crash-safe receiver.

## High-Risk Concerns
A lost response can duplicate a cash record. A changed request under one key
must conflict. Board ownership must remain locked through insertion. A committed
cash record must retain its first request/actor and one audit/event identity.

## Missing Steps
Migration, failing retry tests, scoped storage method, both client key callers,
audit/outbox source typing and PostgreSQL rollback/concurrency/restore checks.

## Unsafe Assumptions
Cash has no provider X-ID or approval. Preserve current subscription usage policy
(cash does not increment gateway usage); reports count one transaction. An HTTP
timeout does not prove that the record failed. Never rotate its key automatically.

## Required Ordering Changes
Review → failing HTTP duplicate/change/missing-key cases → additive migration →
atomic cash/audit/outbox → client persistence → real PostgreSQL → reread.
Keep existing authorization and paid-access checks; a matching committed retry
may return its prior receipt without performing a new gated action.

## Open Product / Provider / Legal Questions
No product redesign or provider protocol is required. New cash requests require
a UUID key; update both callers in the same release. Unkeyed cached clients get
a fixed refresh/retry message, not an unsafe new record.

## Compliance and Data-Handling Notes
Audit actor class/user ID, exact cents, currency and request ID only. Public DTOs
must not expose keys/fingerprints. No card/provider credential or raw token in
cash commands or logging. Test data stays synthetic.

## Test and Rollback Adequacy
Require duplicate/concurrent/lost-response reuse, changed-key fingerprint refusal,
tenant isolation, raced board ownership, immutable cash identity, and rollback
when audit/outbox insert fails. Client retries keep the UUID across failure and
reload, and discard it only after confirmed success. Retain additive schema on
code rollback; review pending commands/outbox before any compatibility rollback.

## Final Recommendation (Approve / Do not approve)
**Approve** the bounded cash command implementation. **Do not approve** R3 exit
or deployment. A separately recorded Codex reread confirms scope and the need to
keep manual events distinct from processor settlement; no other-agent review is
claimed. Existing first-commit messaging is temporary compatibility behavior;
remove it when the shared keyed receiver is wired, before R3 exit.

## Implementation verification and separate reread

Five HTTP retry/missing-key/conflicting-detail regressions failed against the
previous route and passed after implementation. The cash server verification
passed seven suites / 220 tests; the two principal/served-business route matrices
passed two suites / 112 tests. Client checks passed three suites / 33 tests,
including a lost response followed by an actual component remount, unchanged
request UUID, and malformed/wrong-merchant success preserving the command.
The initial client failures identified the shared all-zero UUID test fixture;
scoped valid UUID fixtures now exercise the real production validator.

Real PostgreSQL verification passed 39 checks. Twelve competing commands across
two storage instances commit one cash sale/audit/manual outbox entry; changed
details conflict, identity is immutable, tenant scope holds and audit/outbox
insertion failures roll back every local effect. Migration 0038 was applied only
to the two owned integrated synthetic databases. Full scratch/restored schema
fingerprints match and the restored 1,000 property invoices, 1,000 trades
invoices and 1,000 quotes remain. A first fingerprint helper used the wrong
ledger table name; rerun with the actual `drizzle.applied_migrations` succeeded.
Typecheck, build and whitespace checks passed. Private logs/fingerprints remain
outside version control. No provider/payment/email/push/deployment activity.

Separately reread route/storage/client boundaries after verification: ownership
and paid gating remain, committed retries verify their audit, public DTOs omit
command identity, actors come from authenticated context, and the UUID is saved
before send and removed only after a valid matching receipt. Approve this
bounded command change; temporary first-record communication must still converge
on the keyed receiver before R3 exit. No full-phase or deployment approval.
