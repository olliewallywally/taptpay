# R3 bounded delivery receiver review

Base `27d235b8`, current R3 working tree. Scope is actual receiver wiring and
synthetic fault checks, with no external sends or deployment.

## Verification of Prior Fixes
Owned scratch and restored ledgers contain unchanged migrations through 0045.
Seven PostgreSQL subscription cases pass. The five caller/contract suites pass
98 tests, including owner gates, expired cards and conflicting provider IDs.

## Blocking Issues
No blocker to the bounded implementation below. Actual provider and mail/push
acceptance evidence remains an external release gate; do not claim phase exit.

## High-Risk Concerns
Freeze each event's recipient and content before sending. Resend retries must
reuse a stable per-destination key within a conservative 23-hour window. Never
repeat an uncertain unkeyed push. Persist send intent before network I/O.

## Missing Steps
Add concrete outbox-owned delivery targets, finite fenced leases, immutable
payloads and first-send timestamps. Wire the explicit bootstrap worker and
remove temporary cash/cancel publication. Preserve truthful held states.

## Unsafe Assumptions
APNs collapse IDs do not provide exactly-once visible delivery. A local SSE
broadcast does not reach another app instance or an offline browser. Every app
must poll the committed realtime feed; reconnecting pages still re-read state.
Missing credentials cannot become simulated delivery success.

## Required Ordering Changes
Record targets atomically before sending. Check credentials before the send
marker. Fence the marker and completion. On replay use the frozen payload.
Do not complete an outbox entry while any destination is held or unavailable.

## Open Product / Provider / Legal Questions
Provider UAT remains open. Receipt tax follows existing merchant registration
and domain rules: do not invent GST for residential rent or platform billing.
Do not send bearer payment URLs in these new receipt snapshots.

## Compliance and Data-Handling Notes
Tenant identity comes from concrete event foreign keys. Store only required
receipt/contact data. Push keys stay in their existing authoritative table;
freeze the destination digest and refuse a changed subscription. Logs use fixed
codes. New SSE projections carry only reviewed DTO fields and event identity.

## Test and Rollback Adequacy
Test two workers, lost mail responses, crash after accept before local commit,
held push, expired leases, frozen recipients, partial fanout, no credentials,
and browser duplicate suppression. Synthetic adapters only. Retain schema and
event/send history on rollback; never restore unkeyed financial sends.

## Final Recommendation (Approve / Do not approve)
Approve this bounded R3 receiver implementation and owned synthetic rehearsal.
No live sends, flag activation, phase exit or release is approved by this review.

Separately recorded design reread: receipt delivery and merchant updates have
different recipients. A failed push must not repeat successful mail or SSE.
Use per-target progress, retain uncertainty, and ensure every app instance can
observe committed realtime targets independently of the outbox claim owner.

October 14 bootstrap reread (same bounded delivery scope): the committed cash,
manual and subscription-command outbox does not depend on Windcave being enabled.
The delivery loop must start whenever the authoritative database is connected.
Keep provider query and subscription charging loops behind their existing
reconciliation switch and credentials. The receiver still holds unavailable
email/push destinations; this change grants no simulated delivery or initiation.
Approve removing only that provider switch from delivery bootstrap and verify
the two independent gates in the regression suite.

Final notice-content reread: preserve the owner's existing blocked-quote notice
information through the durable receiver: scoped customer name, quote reference,
amount and configured Billing action. Escape all displayed name/content, freeze
it with the first target snapshot, and retry the same payload/key after an
unknown email response. No direct route email is restored and the atomic rolling
24-hour notice throttle remains. The new real-PG receiver case proves name/URL,
escaping and immutable retry while leaving the quote unaccepted. Approve this
bounded content restoration with the final receiver/adapter tests.
