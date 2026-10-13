# R3 foundation verification

Base: `e408f597`, branch `fix/qwen-aligned-20261010`. Synthetic-only database and
provider fixtures. This evidence approves the bounded foundation, **not R3 exit
or deployment**. Publication commits are recorded in the continuation ledger.

## Results

| Check | Result |
| --- | --- |
| Original retail/invoice baseline | 2 suites / 21 tests passed |
| Full frozen server run | 189 suites / 4,604 tests passed, zero failed/skipped |
| Final graph-status and lease-generation corrections; relevant reconciliation/receipt/retail checks | 4 suites / 40 tests passed |
| Application type check | Passed after final source correction |
| Additional verifier-script type check | Passed using a temporary config including both scripts |
| Application build | Passed; existing >500 kB client chunk warning remains |
| Actual PostgreSQL fault/concurrency verifier | 29 checks passed on each of two isolated PostgreSQL 17.11 clusters |
| Empty migration chain and restored populated snapshot | Applied real 0034 through runner; 1,000 property invoices, 1,000 trades invoices and 1,000 quotes preserved |
| Scratch/restored full schema fingerprint | Byte-identical, including constraints, indexes, trigger definitions and routine hashes |
| Actual blocked-table migration | SQLSTATE `55P03` after 5,030 ms; all expansion changes and ledger entry rolled back |
| Migration after releasing lock | 62 ms; zero missing baseline effects |
| Reusable PostgreSQL setup/start | Signed Debian packages; setup repeated, start repeated, owned data-directory and `SELECT 1` checks passed |
| Tracked whitespace/diff checks | Passed |

The full server run used `jest --selectProjects server --maxWorkers=2 --silent
--json`. The final scoped run covered the later graph-status and lease-generation corrections;
it is not misreported as a second full suite. The first broad run failed because
three inventory assertions needed updating, a helper was renamed mid-run, and
one test timed out. Inventory/source corrections were made; the frozen repeat
passed without timeout changes or disabled assertions. The new regression for a
terminal replay with a different provider transaction first failed against the
old engine, then passed after the provider identity was persisted/compared.
The same-owner stale-lease regression also failed against the earlier fence.
Finalization and inbox/outbox completion now compare owner, claim generation and
the exact claimed expiry, preventing an expired task from using a new lease
issued to the same worker ID. Both PostgreSQL verifiers passed after that fix.

## Database evidence and exact migration

Migration: `0034_durable_payment_reconciliation.sql`.
SHA-256: `be9fb6cc129e2163e3a90a254546d8cf58d7dc7d6f32b6d30d61963630dc6bf2`.
Scratch/restored fingerprint SHA-256:
`96a117c0d7ad6595c76ae88453d80911150f8a4d12b0dd5db9a5b867394be8e8`.

All recorded count-only restored preflights returned zero for duplicate retail
sessions/X-IDs/split provider transactions, concurrent retail live shares,
orphan retail attempts, invalid domain/attempt statuses, cross-aggregate session
reuse, and live retail attempts missing expectations. Retail attempt/transaction
fixtures were empty at migration preflight, so these retail zero counts are
vacuous for production readiness. Populated invoice/quote compatibility is real
synthetic evidence, not production-sized lock/data evidence.

The fault checks exercise two app/storage instances and competing connections:
duplicate receipt upserts; competing/stale workers, including reused owner IDs;
arrivals after lease expiry;
pending→approved/declined; lost/expired browser return; exact remainder cents;
split A unable to pay B; provider transaction reuse; immutable tenant/amount/send
identities; expired unsent versus possibly accepted/attached claims; concurrent
session initiation; no resend after uncertain acceptance; guarded manual/void/
split operations; rollback mid-finalization; replay after commit before receipt
completion; outbox send/ACK crash with stable receiver dedupe key; raw invoice and
quote links before/after hash backfill; original retail finalizer with one usage
increment/event; initiation off while a retained session reconciles. Unit checks
separately reject every integrity field mismatch, multiple transactions and
boolean-only provider approval, and enforce bounded receipt parsing/ACK ordering.

Private evidence resides under `/tmp/taptpay-r3-postgres`; dumps, private test
credentials, logs and complete runner JSON are excluded from Git. The retained
service is under `/workspace/.onboarding/r3-postgres`, with a generated private
environment file. Both services were started only for this work. The owner app
PID 4196 was preserved. Cloud draft `install_script`/`start_skill` saves are
confirmed and preserve previous settings; publication/new-task restoration is
not verified.

## Release limits and rollback

Claude's verified R2 adapter is not present in this checkout. Legacy callbacks
and FPRNs retain old completion logic; concrete card/billing attempt durability,
actual route/caller convergence, provider
format/lifetime/recovery validation, receiver integration and all phase-exit
negative tests remain open. No live provider, payment, email, push, DB migration,
merge or deployment was performed.

Before activation, code rollback is to `e408f597`; retain the additive schema
and do not discard durable records. After any activation, rollback requires an
in-flight attempt/inbox/outbox review: older code must not abandon possibly
accepted attempts or replay their settlement. Do not drop tables or erase
outcomes to make a rollback appear clean. Production-sized restore, count-only
cleanup review, maintenance window, owner migration approval and actual R2-backed
phase review are required before deployment.
