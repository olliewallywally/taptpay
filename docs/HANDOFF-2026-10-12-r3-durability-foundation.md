# R3 durability foundation handoff

Branch `fix/qwen-aligned-20261010`, base `e408f597`.
Claude owns all of R2; Codex owns R3. The foundation is implemented and tested.
**R3 remains open.** No R3 worker timer, notification registration, provider
adapter, live migration, provider request, email or deployment was activated.

## Implemented

- Concrete invoice attempts: merchant/invoice FKs, immutable exact share/cents,
  UUID/fingerprint, stable X-ID, finite lease, hashed return and durable send intent.
- Original retail engine retained: immutable expectations, conservative send
  intent, provider transaction identity and same-transaction fenced event/outbox.
- Inbox committed before ACK; receipt counts, `SKIP LOCKED`, one-minute owner
  leases, owner/generation/expiry fencing, bounded retry/jitter and dead-letter handling.
- Atomic invoice settlement, share count, audit/event/outbox; replay checks both
  outcome and provider transaction. Guarded manual-paid/void/split CAS.
- Inactive invoice initiation coordinator, default off. Unknown acceptance keeps
  the original attempt/X-ID live; retained reconciliation is independent of flags.
- Domain graphs; invoice/quote token hashes, compatible raw lookup and bounded
  backfill. Raw tokens remain during the expansion release.

## Contract for Claude's R2

`server/durable-payment-contract.ts`: `ProviderExpectation`, `ProviderQueryResult`,
`VerifiedOutcome`, `ReconciliationProvider.query`. Query must verify persisted
session, X-ID, exact cents, currency, reference, account and environment against
one final provider transaction. Return verified, pending/unknown/unavailable, or
mismatch. No boolean-only approval adapter exists. Check actual cancellation/card
verification protocol semantics before mapping them; card setup is a separate
domain, not a positive retail/invoice charge.

`server/durable-invoice-checkout.ts`: `DurableInvoiceSessionInitiator.create` and
`DurableInvoiceCheckout`. Creation must validate session identity and links.
Already-complete sessions still reconcile. R2 must expose lookup/recovery of the
same persisted X-ID after possible acceptance but before attachment; never fill
missing expected fields from returned provider money. Query retained sessions
even when initiation flags are off.

`PaymentReconciliationWorker.runOne` receives injected repository/provider ports.
`createRetailReconciliationFinalizer` calls the original `PaymentAttemptService`.
`DurablePaymentStorage.resolveSession` repairs a retail attach/registry crash from
independently persisted expectations. Invoice unknown-session recovery awaits
R2's actual lookup API.

`createDurablePaymentNotificationHandlers` supplies the bounded receipt pipeline.
R2 supplies documented field extraction. Register the exact reviewed endpoint
before global body parsers, then update the policy/review; no endpoint is mounted
by importing this module. Bodies are hints only and ACK follows committed receipt.

## Remaining R3 work

Follow [the flow inventory](evidence/remediation-v2-2/r3/FLOW-INVENTORY-2026-10-12.md)
to converge every retained caller. Legacy numeric/token/invoice callbacks and
FPRNs still contain their earlier completion logic. Client UUID/share persistence,
wallet/session convergence, truthful processing/polling, hashed callback state,
domain event display compatibility and route privacy/policy tests remain required.

Wire real receivers for merchant updates, payer/GST receipts, push and SSE with
stable delivery-key deduplication. `PaymentOutboxWorker` has an explicit receiver
port and synthetic tests; an unkeyed email sender cannot satisfy the crash contract.
Cash/cancel/create, quote/deposit/balance and refund/subscription interfaces remain
in the inventory. Card/billing attempt durability still needs R3 implementation
and actual R2 semantics; graphs alone do not establish it. R4 owns the full refund
engine, and R5 separately owns encryption.

0034 was applied only to owned synthetic databases. Production counts, historical
possibly accepted/unbound attempts, documented provider lifetime, a production-sized
restored lock rehearsal, maintenance window and owner migration approval remain
release gates. Coordinate numbering with R2 before a live application; never alter
an applied checksum. Do not close R3 or move to R4 on this foundation alone.

See [verification](evidence/remediation-v2-2/r3/VERIFICATION-2026-10-12.md),
[ADR](decisions/2026-10-12-r3-durable-payment-storage.md),
[review](evidence/remediation-v2-2/r3/IMPLEMENTATION-REVIEW-2026-10-12.md), and
[database guide](operations/r3-durability-verification.md).
Cloud setup draft saving is confirmed; publication/new-task restoration is not.
Owner app PID 4196 was preserved. Stop only the test clusters created for this work.
Private dumps/credentials/logs/bundles are excluded. Prior R1 manual/device/visual
gates and the owner's feed-under-dock decision remain unchanged.
