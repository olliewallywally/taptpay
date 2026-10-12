# R2/R3 schema integration

Engineering decision for the owner's instruction to finish R3, at `f1e34585`.
R2 source: `14942392` on `ccr-e07e3100-0wm8kr`. This is a repository integration
decision under plan §10.1, not owner approval of a live migration or deployment.

Use R2's expected-value columns and `provider_transaction_id` on the original
retail `payment_attempts` as canonical. Preserve R3's concrete invoice attempts,
global session bindings, inbox, settlement events and outbox. The worker will
call the actual R2 normalizer/verifier through an injected transport adapter.
Never translate an unverified boolean into a verified outcome.

R2 owns 0034 and 0035. Move the original R3 SQL, byte-for-byte, to 0036; retain
its checksum `be9fb6cc129e2163e3a90a254546d8cf58d7dc7d6f32b6d30d61963630dc6bf2`.
Then add a forward integration migration to replace the incompatible retail
trigger with write-once expected/attached identity protection. Reconciliation
code/time remain mutable. Account, fingerprint and pre-send identity remain
durable; unknown acceptance may never release an attempt for another charge.

The old R3 retail snapshot table/column remain compatibility data during this
expansion. New runtime writes/reads use canonical R2 columns. Migrate existing
local pre-send snapshots only if every populated canonical field agrees; abort
on conflicts, with counts only. Do not infer any expectation from provider money.
Retire compatibility storage only in a separately reviewed contract release.

Both branches report no shared application of these migrations. Earlier R3
0034 evidence applies to disposable synthetic clusters, not the integrated
sequence. Rebuild new owned synthetic databases for the complete chain and
restore rehearsal; do not rewrite an existing ledger/checksum or silently adopt
a shared database with the old filename. Any such target must first receive an
explicit migration-ledger reconciliation review. No live database is touched.

This follows the recommended canonical-retail option in Claude's conflict
report and the plan's instruction to extend retail with R2's fields. Existing
R2 tests and R3 fault tests must pass together before this integration is approved.
