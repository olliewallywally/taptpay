# R2 integration preflight

Base `f1e34585`, R2 `14942392`; schema ADR dated October 12.

## Verification of Prior Fixes
The pushed R3 core and guards have recorded PostgreSQL and scoped evidence.
Independently inspected R2's expected-value methods, query normalizer, verifier,
migrations and exit report. R2's claimed repository completion is not UAT proof.

## Blocking Issues
The schemas cannot run together as written: R3's trigger rejects R2 expected,
transaction-ID and reconciliation updates. Correct the integration before route
cutover. Shared deployment remains gated on restore/count review and owner apply.

## High-Risk Concerns
Duplicated expectations/transaction IDs, unsafe unknown acceptance recovery,
unverified historical attempts and released send intent could create double
charges. Preserve canonical identity, scoped locking and uncertainty holds.

## Missing Steps
Negative combined-trigger test; reconcile merge conflicts; forward trigger and
canonical storage migration; R2 adapter; combined unit/PostgreSQL/restore checks.
Cash, active route convergence, card/billing and receiver integration follow.

## Unsafe Assumptions
R2 synthetic replies are not official UAT. Multiple transactions are not one
unambiguous charge. An absent query field cannot be manufactured as observed
evidence; the adapter must preserve actual transport/verifier limits.

## Required Ordering Changes
Preflight → failing combined-schema proof → merge on the working branch →
canonical forward alignment → combined verification → route convergence.
Never merge into main, apply a shared migration or deploy as part of this work.

## Open Product / Provider / Legal Questions
No product choice is required for canonical retail storage: plan §10.1 already
specifies R2's fields. Actual abandoned-session, card and stored-charge replies
remain provider/UAT gates, with R2 owner directions preserved.

## Compliance and Data-Handling Notes
Inject provider transport; use synthetic loopback databases. No raw identifiers,
tokens, credentials, provider replies or production copies in logs/evidence.

## Test and Rollback Adequacy
Keep original R2 and R3 regressions. Test expected fields, mutable reconciliation,
once-set identity, leased finalization, send-intent expiry, terminal transaction
replay, global session scope and fresh/restored schema identity. Rollback cannot
erase possibly accepted operations or durable events.

## Final Recommendation (Approve / Do not approve)
**Approve** this bounded repository integration under the ADR. **Do not approve**
deployment or R3 exit. Separately recorded Codex reread agrees: use canonical R2
retail fields, preserve invoice FKs and fenced workers, and explicitly re-run the
whole merged migration chain. This is not independent Claude/human approval.

## Implementation verification and second reread

The failing clone proof reproduced SQLSTATE `23514` for each of the three R2
update classes. The integrated sequence applies R2 0034/0035, byte-identical R3
0036 and forward canonical alignment 0037. Retail runtime no longer reads or
writes the compatibility expectation table or processor-transaction column.
It preserves R2 expected values, stored account/fingerprint/X-ID/send intent,
write-once identity and mutable sanitized reconciliation metadata.

`createWindcaveReconciliationProvider` calls the actual R2 normalizer and shared
verifier. It additionally requires one purchase transaction for R3 settlement.
Gateway money/reference/transaction fields come from that response; X-ID comes
from the local binding and environment/account from the pinned client context.
An account named in the response must match. This preserves R2's recorded
optional-account protocol limit without claiming an absent field was observed.

Results: 10 core/policy suites / 184 tests; 15 provider/route suites / 330 tests;
35 R3 PostgreSQL checks; 12 R2-T4 and seven R2-T7 PostgreSQL checks all passed.
The R3 database suite includes the actual injected R2 client/parser/verifier
feeding atomic retail, property and trades settlement. Application type check
and build passed. Initial integrated checks caught a mixed timestamp parameter cast and
an outdated constraint inventory, both corrected without weakening assertions.

The populated restored clone preserves 1,000 property invoices, 1,000 trades
invoices and 1,000 quotes through 0034–0037. Its full schema fingerprint is
byte-identical to fresh scratch:
`cdeb373a9f05e0850b61326e6616d237cebc9ba539398c31ae70c20ce9bb6df2`.
This is synthetic evidence, not production-sized/UAT/release approval.

A separately recorded Codex implementation reread confirms canonical fields,
once-set protection, uncertainty holds, global bindings and lease generations
remain intact. **Approve** this tested integration checkpoint for commit.
**Do not approve** R3 exit: cash/commands, active route convergence,
card/billing and real delivery remain outstanding. Nothing is deployed.
