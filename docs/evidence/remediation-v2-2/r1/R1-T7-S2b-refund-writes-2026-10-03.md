# R1-T7 S2b1 — scoped refund writes

Code commit: `42792fd8`; base: `8d535426`; branch
`remediation/r1-continuation-20260907`. Code complete, independent review remains.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s2b-refund-writes.md).

Four authenticated refund writes now require merchant scope. Reservation and release
put transaction id AND merchant id in the actual UPDATE. Creation locks/rechecks the
parent and projects identity/status from explicit scope. Status updates require the
refund's tenant, lock/recheck the parent tenant, and constrain refund id, merchant and
parent in the UPDATE. Unused globally keyed reservation/release/status/after-refund
mutators are removed. Global refund constructor/read remain for fixtures and no
authenticated route uses them. No schema, client or capability-default change.

After a raced creation/completion/compensation refusal the HTTP route returns fixed
503 `REFUND_RECONCILIATION_REQUIRED`; it does not publish success, use a stale row,
or compensate another tenant. Ordinary owner success and response stay unchanged.
This preserves the legacy balance algorithm; it does not close R4's durability,
idempotency, unknown provider-outcome or exact-money gates. Initiation stays disabled.

Tests first: storage/SQL **15 fail**; HTTP **3 fail / 1 pass**, proving actual
pre-change foreign balance release and false success after provider-side fixture
ownership changes. Final new tests **19 pass**. Affected regression **9 suites pass**;
the tenth inventory suite initially found its stale generated file (one failure),
then final regeneration/policy/inventory **3 suites / 31 pass**. No runtime failure
remains. Typecheck, build and whitespace pass.

Actual PostgreSQL expanded S2 verifier **21 pass / 0 fail**, on a fresh empty
disposable loopback database with ambient credentials removed. Includes simultaneous
refund reservations (only one 6.00 claim against 10.00) and all four refund writes
actually waiting on a concurrent ownership update, then refusing without a row
mutation/insertion. PostgreSQL stopped after verification. No application database,
provider, migration, push or deployment. Synthetic test logs: `/tmp/taptpay-s2b-*`.

Review focus: parent-lock ordering, id/tenant predicates at each actual write, projected
creation fields, same-tenant compensation and post-provider persistence refusal.
No external security/production approval is implied. S2b2, S3–S6 and other R1 gates
remain separate work.
