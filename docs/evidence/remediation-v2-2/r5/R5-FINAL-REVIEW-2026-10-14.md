## Verification of Prior Fixes

Reviewed the final R5 candidate on `remediation/r5-encryption-20261014`, based on
`5329bf778e6bd47b8cc4fe71e67b8e6a58ff978f`, with the exact source manifest and
verification receipt linked from the repository-complete handoff. T1 evidence is
historical; its old hashes are not reused for modified source. Original broad
server run exposed migration/parity gaps; the final full run passes 221 suites /
5,151 tests. Latest affected-source rerun passes 10 suites /221 tests; typechecks,
build, CLI/safety checks and two actual PostgreSQL proofs pass.

## Blocking Issues

No blocker remains for the repository/owned-synthetic scope. Earlier blockers have
concrete evidence: row-ID-first password/owner creation has no residue on failure;
waiting plaintext writers fail after activation; locked lower bank/active records
are reached by sweeps; failed audit insert rolls back physical data and checkpoint;
restart and verified rerun preserve ciphertext; both credential choices and scopes
rotate successfully; restored values/links/digests match in memory. The actual
logical-restore schema mismatch was repaired by forward 0048c with unchanged email
validation; baseline now checks the exact definition, not only its existing name.
Official live-target phase exit is a separately unapproved scope below.

## High-Risk Concerns

Applied SQL 0048a/b/c stays frozen. Global writer fingerprint changes authenticate
both installed scopes with the supplied keyring. SQL shape guards cannot establish
GCM authenticity; independent readers authenticate every counted envelope. Old
keys remain necessary for older retained backups even after live rows rotate.
Both restored new-key and old-key snapshots were exercised; missing keys fail.
No broad ORM proxy/type guessing is used: field codecs are explicitly named.

## Missing Steps

Outside repository scope: actual approved target inventory/backfill and restore,
D8 bank retention/deletion date and backup/key retention/access controls, owner
unused-credential delete/temporary-encrypt choice, and canonical R4 integration.
R3 provider UAT and production-sized migration rehearsal remain release gates.
These are not supplied by synthetic tests or silently approved by this review.

## Unsafe Assumptions

Opaque subscription presence checks must not turn an absent empty token into a
usable card: final review found that case; two failing-first writer tests plus a
scanner regression now refuse empty/oversized card values. Do not decrypt hidden
legacy bank fields during authentication, drop recoverable invoice capabilities,
hash ciphertext, or require card decryption for GET-only provider recovery. General
subscription reads remain opaque; purchase/upgrade/cron boundaries explicitly open
credentials. Entitlement remains independent of token decryption.

## Required Ordering Changes

Canonical migrations through 0047 → R5 0048a–c, with Claude's R4 integration reviewed
before shared release. Complete compatible readers precede encrypted writers and
bank/active policy activation. Explicit scoped backfills precede zero-plaintext and
rotation verification. Later contract requires approved windows/review references,
active scope first then bank; application plaintext reads turn off only afterward.
Rollback retains schema, guards and full R5 codecs/keyring; fix forward and pause
scoped writes if necessary. Bank-only T1 is insufficient for active-field rollback.

## Open Product / Provider / Legal Questions

Unused merchant credential disposition and approved D8 retention/date remain
unselected externally. Both choices are prepared/tested only on synthetic clones.
Real key-management/backup controls and Windcave UAT are owner/provider work. No
customer flow, financial amount rule, entitlement policy or R4 refund behavior is
changed by this encryption work.

## Compliance and Data-Handling Notes

Aggregate evidence contains no row secrets, ciphertext, key IDs/material or live
connection values. Audit is count/duration-only. Delete never projects unused
credential values. Keys are process-private; synthetic dumps remain outside Git
with mode 0600. Original synthetic sources, owner app PID 4196 and shared/live data
are preserved; fake providers only, no email/push/provider transmissions. Encryption
does not erase old plaintext snapshots or establish legal retention compliance.

## Test and Rollback Adequacy

42 actual PostgreSQL checks cover fresh/populated schemas, real dry-run refusal,
concurrent/stale-writer fencing, CAS-backed preservation of a concurrent edit,
locked-row sweep recovery, atomic data/audit/checkpoint failure, idempotent restart,
original lookup/delivery/creation replay, stored-card callback/GET recovery, stable
digests across rotation, wrong context/hash/key refusal, contract/downgrade guards,
strict logical restore and historical-key recovery. Fresh/populated/full restored
fingerprints match; actual fingerprint CLI output matches the recorded file byte
for byte. Latest source checks pass; no client source changed and no device/provider
UAT or remote CI run is claimed.

## Final Recommendation (Approve / Do not approve)

**Approve** the exact manifested repository R5 T2–T4/active-credential/restore repair
scope on the above branch/base. No deployment, live-target mutation, key retirement,
retention decision or official R5 exit is approved by this recommendation.

Separate final reread by the implementing agent: checked original §12/§21 wording,
all bank write paths, compact invoice replay branches and joined snapshots, card/
billing raw SQL boundaries and runtime injection, both workflow transactions and
SQL guards, active/bank contract order, applied checksums, baseline definition
proof, original red evidence and final result files. Reconfirmed the same precise
repository scope after the reread. No external/sub-agent review is claimed.
