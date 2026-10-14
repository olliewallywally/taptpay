## Verification of Prior Fixes

R3's actual handoff/reviews assign credential encryption and invoice/quote raw-token
contract work to R5. Source confirms `merchant_subscriptions.windcave_card_id`
and invoice/quote `token` columns remain plaintext; reminders and creation replay
need recoverable original link tokens, while billing attempts retain token digests.
Current R5 bank writers/scanner/operator checks pass 118 focused tests; full server
run and bank migration rehearsal are in progress and not yet claimed complete.

## Blocking Issues

Resolved design: encrypt rather than delete required active tokens, preserving
their original plaintext semantics through explicit compatible readers. Invoice
lookup hashes stay stable. Every billing digest/provider call receives the decoded
original credential. No duplicate token is added to attempt/audit/outbox storage.

## High-Risk Concerns

Audit all read/write boundaries including raw SQL billing/card finalizers and
joined reminder/delivery reads. Ciphertext must never become a payer URL or provider
CardToken. Wrong keys/AAD must fail closed. Existing immutable invoice guards need
a reviewed narrow encrypted-at-rest compatibility update if they reject the
operator's physical transformation; never relax money/tenant/attempt identity.

## Missing Steps

Implement named field codecs, row-ID-first writes, explicit returned-row decoders,
active-secret backfill/rotation and real lookup/delivery/billing/restore regression.
Counts must cover copies used for delivery; any remaining recoverable raw-token
payload must be identified and protected before claiming full secret coverage.

## Unsafe Assumptions

Bank-only encryption does not protect R3's active credentials. Dropping raw tokens
would break reminders/replay. Hashing a ciphertext instead of a decoded card token
would invalidate a pending billing attempt. Do not guess record types from property
shape or hide codecs inside a generic ORM proxy.

## Required Ordering Changes

Deploy full compatible readers first; then encrypted writers and policy activation;
then backfill/rotation and later contract. Candidate forward 0048b follows frozen
0048a; no applied SQL is edited. Combined R4 migration numbering still needs review.

## Open Product / Provider / Legal Questions

No new product flow/provider request is introduced. Existing provider UAT and real
backup/retention approval stay external. Unused merchant credential disposition is
still unselected; both owner choices remain explicit, never inferred.

## Compliance and Data-Handling Notes

AES-GCM AAD binds exact schema/table/record ID/column. Strict table/column allowlist
supports numeric subscription IDs and UUID invoice/quote IDs. Keys stay private;
test keys/dumps remain outside tracked files. Keep existing response authorization
and masked DTOs; authorized payer links retain their original capability.

## Test and Rollback Adequacy

Require encrypted/full/split invoice and quote lookup using existing raw links,
unchanged reminders/creation replay, billing digest/provider token stability, wrong
context/key refusal, concurrent/sweep/CAS/rollback and encrypted restore proof.
Preserve schema and compatible readers/keyring on rollback; no plaintext writes.

## Final Recommendation (Approve / Do not approve)

**Approve** the exact active-secret repository/owned-synthetic extension described
above on `5329bf77` plus the reviewed R5 working tree. No deployment, live provider,
real data mutation, retention decision or official exit is authorized.

Separately recorded pre-implementation reread: checked concrete R3 review wording,
actual card/billing raw SQL, token-hash helper and invoice/reminder callers. The
extension addresses recorded R5 debt; preserving plaintext *in-memory semantics*
and stable lookup hashes is essential. Approve the same scope after this reread;
no external/sub-agent review is claimed.
