# R1-T7 S2 — transaction/refund storage, 2026-10-03

Base: `31f64efc2d405d60e071f364a29d918cde66137b`, branch
`remediation/r1-continuation-20260907`. Authority: the supplied full integration plan R1-T7,
P2/P8.5, and [the S0–S6 decomposition](PLAN-2026-10-02-r1-t7-tenant-storage.md).
The owner requested continuation of R1 and the start of S2. This batch does not close R1.

## Scope and execution inventory

**S2a (this batch):** explicit merchant transaction lookup, transaction-scoped refund reads,
and atomic merchant cancellation in IStorage, MemStorage and DatabaseStorage. Migrate the
cancellation, refund read, refund-initiation lookup and API-key transaction-read registrations.
Remove the unscoped refund-by-transaction reader after proving it has no other callers.
Existing transaction lists, date-range/export/analytics reads, active transaction reads and
merchant refund lists already require merchantId; preserve them. The new refund reader checks
both the refund's merchant and its parent transaction's merchant in the same SQL query.

Cancellation retains owner/member and validated-admin permissions, 200 on a pending/processing
sale, 400 for a noncancellable state (including a repeat), and identical 404 for missing/foreign
sales. A validated admin may resolve the target globally because its existing policy explicitly
allows platform-wide money operations, then passes the resolved merchant into the scoped write.
Merchant callers never use the global lookup. The mutation locks and rechecks tenant and state;
it publishes only the returned row after successful persistence. A concurrent ownership or
terminal-state change must not be overwritten or broadcast as a cancellation.

**S2b (remaining):** authenticated refund creation/reservation/release/status transitions,
transaction creation/board association, and the disabled native payment branch need their own
reviewed storage contracts. Preserve the refund balance claim while designing the R4 durable
refund operation; do not mistake S2a's scoped lookup for scoped writes. Refund initiation stays
disabled by default. No provider call or new capability is enabled by this batch.

**Separate public/provider operations:** numbered board checkout, split/receipt reads,
`/api/pay/t/:token`, hosted-fields/Google Pay completion, Windcave return/notification, and the
inherited payment-attempt repository retain their reviewed resource/provider authority. They
are not converted into merchant-session APIs. Gap 11 C2–C5 remains the R3 schema gate; do not
replace its payment model here. Global transaction reads/writes remain for these explicit lanes
and S2b; the generated inventory must show which callers remain.

## Verification of Prior Fixes

Re-derived clean tree and HEAD from Git; read the newest ledger, both October 2 handoffs,
S1 plan/evidence and the authoritative integration controls. S1 source reread confirms each of
its seven operations scopes the SQL predicate, projects changes and refuses invalid tenant ids.
Re-ran S1 storage, HTTP and inventory suites: **3 suites / 40 tests pass**. The first HTTP run
was prevented by the sandbox's socket restriction; the authorized local rerun passed. These
checks do not close the outstanding independent security reviews of S1, sessions or older R1 work.

## Blocking Issues

None for bounded S2a. Whole R1 remains open: S2b/S3–S6, external reviews, Apple provisioning/device
proof, and the dependent R1-T10 typed-route/device/tutorial/accessibility acceptance. Development
0030/0031 remain owner actions. No application database status, migration or deployment is run.

## High-Risk Concerns

Tenant and state must be rechecked at cancellation's write boundary. Keep the row lock shared
with PostgreSQL finalization; an earlier route read cannot authorize an unconditional update.
Refund rows with inconsistent merchant/parent ownership must not leak through the new reader.
Do not broaden platform-admin refund initiation, change validation ordering, or make public
checkout require a merchant session.

## Missing Steps

Failing direct memory/SQL and two-merchant HTTP regressions first; isolated PostgreSQL ownership
and completed-state races; update reviewed route facts and generated inventories; affected
matrix, parser, containment and payment-attempt regressions; typecheck, build and whitespace.
Record exact results, limits and a durable continuation handoff.

## Unsafe Assumptions

Current routes already refuse ordinary foreign rows; this is storage hardening, not evidence
of a remote ownership-transfer exploit. A refund's merchant alone does not prove the parent
still belongs to it. A session test's green count is not real Apple or native Keychain evidence.

## Required Ordering Changes

Preflight and separate reread → failing tests → scoped implementations/callers → SQL races and
route regression → generated inventory/evidence. No schema or live-system action enters this order.

## Open Product / Provider / Legal Questions

None for S2a. The already recorded R3/R4 and S6 provider/scanner/retention choices remain their
own gates. Native Keychain stays A-T4 under the recorded owner decision.

## Compliance and Data-Handling Notes

Only synthetic local fixtures and a new disposable loopback PostgreSQL database. Remove ambient
application/provider credentials before verification. No secrets, tokens, provider identities or
customer data in durable evidence. No UI or applied migration change.

## Test and Rollback Adequacy

Two-tenant storage/HTTP refusals compare unchanged state and prohibit provider, stream, push,
email, outbound fetch and file effects. Positive owner/member/admin tests preserve policy;
concurrent state and ownership changes prove a cancellation cannot undo a payment completion.
Fix forward; do not restore globally keyed merchant mutations to make a caller pass.

## Final Recommendation (Approve / Do not approve)

**Approve S2a on `31f64efc` only**, conditional on the tests-first sequence above. This is an
implementation preflight and does not claim external security or release approval.

## Separate reread before production edits

Reread the actual cancellation and three other registrations, both storage implementations,
served business recipes and refusal matrix separately from the proposed API names. Confirmed:
cancel allows a validated admin without a business id; both refund-by-sale routes explicitly
refuse that admin; refund body validation precedes its transaction lookup; missing/foreign sales
share 404; cancelling again is 400. PostgreSQL payment finalization holds the parent row lock.
Use that lock for cancellation and recheck ownership/state after acquiring it. Keep the outer
checks and final response/event shapes; remove the post-write global reread. No unresolved S2a
blocker. **Approve the same exact S2a scope.**

## Applicable source-control crosswalk

| Source v2.2 checkbox | Task / owner | Test / handoff artifact |
|---|---|---|
| §22.6 financial records have no hard-delete API | R1-T7 S2a / engineering | cancellation preserves row and financial fields; S2 evidence |
| §22.9 complete route/principal/tenant policy | R1-T7 S2a / engineering | route review/facts/inventory guard and existing matrix |
| §22.9 dynamic two-merchant denial | R1-T7 S2a / engineering | tenant-transaction-refund HTTP/storage regressions |
| §22.9 aggregate-specific state graph | R1-T7 S2a; R3/R4 retain remainder | cancellation pending/processing predicate and real concurrent completion refusal |
| §22.10 disabled money routes have zero effects | R1-T7 S2a; R0/R4 retained | existing disabled/refund gate suite; no feature enablement |
| §22.10 preserve atomic events/finalization | R1-T7 S2a; R3 event/outbox remainder | payment-attempt regression and cancellation after-write-only event assertions |

These rows map this batch's applicable changes. They do not claim the full source-control backlog
or the later event/outbox work complete.

## Implementation and final verification

S2a implemented with no change to the bounded scope. Red first: **2 suites / 37 failures, 3 passes**,
including both cancellation races and the refund-parent race. Final new regressions: **40 pass**;
affected policy/matrix/parser/financial/session regression: **14 suites / 416 pass**.
Real PostgreSQL: **S2 14 pass; S1 independently repeated 10 pass** on separate fresh test databases.
Both cancellation races actually waited for a row lock, then refused. The disposable instance was
stopped. Full server: **138 suites / 3,631 tests pass** (642.271s). Typecheck, build and whitespace
pass. Inventories: 187 registrations / 0 unclassified / 0 gaps; 119 session/admin-authenticated;
219 declared plus 8 inherited storage methods. No application database, provider, migration,
deployment or push action. No client source change. Independent review and S2b/S3–S6 remain open.
