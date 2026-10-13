# R3 durable payment storage

Proposed against `fix/qwen-aligned-20261010` at `e408f597`. Owner instruction:
Claude handles all of R2; Codex moves to R3. This decision approves an isolated
implementation and synthetic rehearsal, not deployment or live data changes.

## Concrete identities and tenant scope

Keep the retail `payment_attempts` engine and its parent → attempt → share lock
order. Add one `payment_attempt_expectations` row per existing retail attempt,
with concrete composite foreign keys to the attempt/transaction and owning
merchant/transaction. Existing attempts without independently reconstructed
expectations remain unresolved; provider responses cannot fill missing expected
amount, reference, currency or account.

Use `invoice_payment_attempts` with exactly one property invoice or trades invoice
foreign key. Composite invoice/merchant foreign keys prevent cross-tenant rows.
Share zero is an unsplit invoice; split shares are numbered 1..count. Allocate
exact cents as floor(total/count) plus one cent for the first remainder shares.
Lock the invoice before its attempts. A paid share cannot be claimed again; an
expired demonstrably unsent claim can be abandoned. Invoice `send_started_at`
is committed before sending; retail expectations act as conservative send intent.
Attached/possibly accepted attempts
stay live until reconciliation proves a final outcome; lease expiry never permits
a second charge.

Expected amount, share, merchant, aggregate, fingerprint, currency, reference,
environment and provider account are immutable. Each claim has a client UUID and
SHA-256 request fingerprint; same key/different fingerprint conflicts. The
provider X-ID is stable and generated before any provider send.

`payment_session_bindings` is the single global registry for Windcave sessions,
X-IDs and approved provider transaction IDs across retail and invoices. Each row
has exactly one concrete attempt FK. Binding is durable before a session reaches
the browser. Invoice callbacks resolve this row; they never select the next share.

## Receipt, reconciliation and communication

`payment_notification_inbox` has one provider/kind/session row, arrival counters,
bounded finite worker leases and bounded retry scheduling. A receipt handler
commits before acknowledging. Notifications provide session hints only.
Workers claim with `FOR UPDATE SKIP LOCKED`; all subsequent mutations require
the same lease owner and an unexpired lease. A stale worker cannot overwrite a
new worker's result. Completion follows the committed aggregate finalizer.

The R2 port accepts persisted expectations and returns pending/unknown, an
integrity mismatch, or a verified terminal outcome. It must verify exactly one
transaction and the session, X-ID/reference, account/environment, currency and
exact cents. It never adapts `success: true` into approval. No default provider
implementation, timer or route replacement is activated while R2 is unavailable.

Invoice finalization locks invoice → attempt → binding, compares session and
immutable expectations, and atomically changes the attempt, invoice/share count,
existing domain event, and uniquely keyed outbox event. Retail finalization keeps
the existing engine and requires a later adapter to append events in its same
transaction. A terminal replay must compare outcome *and provider transaction*.
Outbox delivery needs an idempotent receiver keyed by event ID; a send/ack crash
cannot provide exactly-once external delivery with an unkeyed email API.

## Public token compatibility

Add nullable hash columns and partial unique/hash-shape constraints for property
and trades invoice/quote tokens. New writes retain raw tokens for the expansion release
and write hashes too. Reads prefer hashes, then a temporary exact raw lookup.
Backfill in bounded batches from existing tokens using Node SHA-256; do not log
tokens or hashes. Raw-column nullability/retirement is a later reviewed release,
so emailed links and server-generated reminders remain compatible.

## Ordering and release limits

Record count-only duplicate/status/orphan/expectation preflight. Rehearse SQL on
both an empty chain and a populated synthetic dump restored into a second local
database before implementing the worker. Use the runner's finite advisory/lock/
statement budgets plus migration-local timeouts. No concurrent indexes inside
the transaction-wrapped runner; no `IF NOT EXISTS` masking wrong shape.

Synthetic rehearsal proves semantics and lock failure behavior, not production
table-size/lock budgets. Production-sized restore, maintenance window, owner
migration approval, R2 integration, all active route convergence, and message
receiver idempotency are phase-exit requirements. Do not mark R3 closed until
those requirements are satisfied. Roll back inactive service code independently;
retain durable receipts and outcomes after any activation.
