# R3 current status — October 13

Historical checkpoint. The completed repository status and remaining external
sign-off are in [`HANDOFF-2026-10-14-r3-repository-complete.md`](HANDOFF-2026-10-14-r3-repository-complete.md).

Historical checkpoint. The current in-flight state is
[`HANDOFF-2026-10-14-r3-inflight-regression.md`](HANDOFF-2026-10-14-r3-inflight-regression.md).

Owner instruction: finish R3 before R5. Claude owns R4. R5 was inspected only;
no R5 implementation was made. R3 is **open**, with substantial implementation
and regression work remaining. This is a status handoff, not an exit approval.

Branch: `fix/qwen-aligned-20261010`. Last committed/pushed checkpoint:
`27d235b8d5dc53e364875bf056e2ff76af786b3a` (cash command identity). The active
convergence, invoice UX, provider port and cancellation follow-up are uncommitted.
Keep the earlier foundation/integration evidence as historical evidence of its
own scope; its outstanding-work paragraphs do not describe the newest tree.

## Verified current work

- Durable invoice/retail attempts, notification inbox, fenced reconciliation and
  transactional settlement event/outbox are implemented. Active numeric, token
  and property/trades completion handlers use the actual R2 verifier and shared
  finalizers. The full route compatibility regression is still open.
- Cash command identity is committed and pushed. Legacy first-record cash
  communication remains temporary until actual delivery receivers are wired.
- Approved invoice UX: choose full bill or split before preparing payment;
  optional receipt email is frozen with the attempt; all payment methods share
  one session. Concurrent reservations assign separate exact shares; retry keeps
  its UUID/share and uses the server's authoritative cents.
- The owner's multi-transaction decision is implemented: one matching approval
  after declines can settle; two approvals or a mismatched transaction cannot.
- The cancellation follow-up retains pending attempts, blocks captured money,
  queries retained tenant-owned sessions through the shared verifier outside
  financial row locks, and atomically records manual audit/outbox. Identical void
  and external-payment retries reuse the audited command; a changed external
  reference conflicts. An external-payment record remains intact when a later
  gateway capture is independently recorded.
- Late full approvals settle cancelled/voided parents. Partial late approvals
  retain the cancelled/voided state and exact captured shares. Settlement events
  record the previous aggregate status for truthful merchant communication.

Latest targeted evidence (owned synthetic databases only):

- 71 PostgreSQL checks: `manual-query-locks-green.log` in the private verifier
  directory. Includes late full/partial/external captures, replay, tenant scope,
  manual audit/outbox rollback, verifier queries without financial locks, and
  concurrent invoice reservations. Earlier 52/65-check logs retain their scope.
- 11 guard/transition tests: `manual-command-unit.log`.
- 11 invoice UX/command tests: `invoice-authoritative-amount-green.log`.
- 33 provider-history/reconciliation tests:
  `multiple-attempt-owner-decision-green.log`.
- Typecheck: `manual-command-typecheck-3.log`; `git diff --check` passes.

Private logs are under `/tmp/taptpay-r3-postgres`; do not commit them, credentials
or dumps. These targeted results do **not** establish a passing full regression.

## Remaining implementation

1. Finish manual/create command coverage across retail, property and trades,
   quote acceptance/deposit/balance creation, split configuration and their
   retained clients. Existing property invoice reuse still needs an amount-change
   guard once an attempt exists. Finish actor/idempotency inventory and replace
   remaining direct communications with real keyed delivery.
2. Finish checkout recovery for invoice browser-return state, expired state,
   immutable receipt-email restoration and confirmation persistence before SDK
   submission. A reused already-complete provider session must not expose another
   payment widget. Finish attachment lock ordering, review Claude's unsent-claim
   merge fixes and repair remaining route/client regression cases.
3. Implement concrete subscription card-setup and billing attempts and integrate
   activation, upgrades and cron. The stored-card pending-ID hook and GET-only
   recovery port are implemented; the current billing callers do not yet persist
   and use a concrete durable attempt. Unknown acceptance must never resend.
4. Wire actual payer/GST receipts, merchant email/push/SSE receivers and their
   crash/retry duplicate protection. Current outbox worker tests use an injected
   receiver; real receiver wiring is not complete. Ordinary unkeyed sends do not
   satisfy this contract.
5. Complete full server/client regression, final schema fingerprint/CI baseline,
   restored migration/count/lock rehearsal, flow inventory/graphs, review and
   handoff, then commit/push the reviewed implementation.

## External release evidence

Owner can arrange Windcave UAT. Run the sanitized cases in
`operations/r3-uat-checklist.md` against an approved candidate build after code
verification. Official provider evidence and a production-sized restored clone
remain required for phase/release signoff. The existing synthetic restored
database is not a production-sized rehearsal. No deployment, shared/live
migration, real provider/payment request or outbound communication was made.

Owned PostgreSQL on port 55440 has migrations through 0042 applied to
`r3_integrated_scratch` and `r3_integrated_restore`. CI's checked-in fingerprint
still describes 0040 and must be updated to the final schema. Preserve every
applied migration checksum. Coordinate any subsequent numbering with Claude.
The owner app process 4196 remains running.

## R4 interface note

Cancellation does not mean a provider attempt was cancelled or money was
refunded. Preserve the attempt, session and exact capture identity. A cancelled
split bill may have only some shares captured; refund eligibility and caps must
use those verified captures. A paid-external invoice can additionally have a
verified gateway capture without changing its external-payment record. R3 stores
that capture once and queues merchant communication; it does not automatically
charge or refund again. R4's full refund engine remains Claude's work.
