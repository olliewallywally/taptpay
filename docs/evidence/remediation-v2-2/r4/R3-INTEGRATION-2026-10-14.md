# R3 integration under R4 — October 14

Codex's completed R3 (`3c98dfe9`, branch `fix/qwen-aligned-20261010`) is merged into
`ccr-e07e3100-0wm8kr` on top of R4-T3 part 1 (`8b7c300e`). Claude did the merge and the fixes
below. Nothing was applied to a shared database, nothing called Windcave, nothing was deployed.
Refunds stay off (`FEATURE_REFUND_INITIATION` defaults to false).

Codex's own record is [`HANDOFF-2026-10-14-r3-repository-complete.md`](../../../HANDOFF-2026-10-14-r3-repository-complete.md).
R3's official exit still waits for Windcave UAT and the production-sized restore sign-off.

## 1. How the merge was resolved

R3 converged the retail and invoice payment paths that our OI-1, OI-2, same-tab and cash work
had changed on this branch. Where both sides changed the same behaviour, **Codex's version was
taken whole** and ours was not grafted onto it. Each of our earlier fixes was then checked
against Codex's code (§3), and the ones it no longer covered were re-applied as small, tested
changes (§4).

- Taken from Codex whole: the retail terminal, checkout, payment-addressing, cash-command key,
  merchant mobile terminal and payment-stack client files; `cash-command.ts`,
  `durable-payment-contract.ts`, `durable-payment-storage.ts`, `payment-attempt-service.ts`,
  `payment-durability-preflight.ts`, `payment-outbox.ts`, `payment-reconciliation.ts`,
  `payment-transition-graphs.ts`, `retail-reconciliation-adapter.ts`,
  `windcave-reconciliation-provider.ts`; their tests; `verify-r3-durability-postgres.ts`.
- Re-applied from this branch: R4-T1 (`54919ad2`, the refund client and route; applied
  cleanly), R4-T2 (schema, renumbered, §2) and R4-T3 part 1 (`storage.ts` claim, send intent,
  settle and legacy fences; three conflicts kept both sides).
- Set aside, because they test our superseded API or behaviour that Codex replaced (their
  intent is checked in §3 instead): `cancel-refusal.test.ts` (restored in §4),
  `token-checkout-expired-attempt.test.tsx`, `oi1-invoice-change-after-attempt.test.ts`,
  `oi1-retail-cancel-after-attempt.test.ts`, `r2-r3-merge-unattached-expiry.test.ts`,
  `r3-activation-findings.test.ts` (its MemStorage part is restored in §4),
  `token-session-same-key-expired.test.ts`.
- `scripts/verify-tenant-transactions-postgres.ts` now follows Codex's transition tables
  (`R3-TRANSITION-TABLES-2026-10-14.md`): cancel is allowed from `failed`, and a repeated
  cancel answers `{kind:'cancelled', reused:true}`. Pure Codex failed the same three checks.

## 2. Migration renumbering: 0039 → 0048

Codex's R3 uses 0039–0047. R4-T2's refund schema, written as 0039 and applied nowhere, is now
`migrations/0048_refund_operations.sql`, unchanged apart from its header and its own abort
message. 0039–0047 are untouched. The baseline contract has 0048's 53 entries; `migrate.test`
lists it after 0047; the ADRs, R4-T2 evidence, verifier, schema comment and the owner runbook
(now `docs/operations/runbook-2026-10-14-apply-0048-refund-operations.md`, which requires
0034–0047 first) say 0048. Codex's rehearsal applies 0023–0048 to an empty database cleanly.

## 3. Coverage check of our earlier fixes against Codex's R3

Six read-only agents checked every fix and review finding from this branch against Codex's
code, with file and line evidence, and a critic looked for what they missed.

- **Covered by Codex** (no change needed): R-3a, PAYMENT_CAPTURED, provider never queried under
  a lock, approve-after-cancel and usage counted once, OI-1 invoice I-1 to I-5 and the late
  payment and captured cases, D2, D3, D5, same-tab retry after unsent expiry, attach abandoning
  only unattached claims, B-2, cash replay, outbox event source, R1-T7 S2a, R4-T3 lock order,
  the refund DTO, and 0048 against Codex's schema.
- **Not applicable** (the code path is gone): R-1 (no caller of the legacy split writer), R-3b,
  H-1 for new attempts, settled-route adoption, and the R4 legacy-refund and X-ID namespace
  items.
- **Regressions, fixed here**: §4.
- **Open, for Codex and the owner**: §5. Several were open on this branch too.

## 4. Fixes made in this integration

Every fix has a test that failed on the merged tree first. The PostgreSQL checks are in
`scripts/verify-r3-durability-postgres.ts` under "integration:"; the invoice B-1 check was also mutation-checked (it fails with the release switched off).

| # | Problem in the merged tree | Fix | Test |
|---|---|---|---|
| 1 | A wallet (Google Pay) charge could be sent for a cancelled sale or a voided, paid or externally paid invoice. | `claimWalletSubmission` reads the locked sale or invoice and refuses a closed one. | PG |
| 2 | A payer's claim made just before a cancel still prepared and sent a session. | `prepareRetailExpectation` refuses a parent that is no longer open; no send intent is written. | PG |
| 3 | A merchant command's "ask Windcave first" poll did nothing when the receipt was backed off. | `receive` brings a backed-off poll forward, never a finished receipt or an FPRN. | PG |
| 4 | A late trades payment on a voided invoice whose schedule had issued a replacement hit 23505. | Finalize records the money and keeps the invoice voided. | PG |
| 5 | **B-1 again.** R3 writes send intent before calling Windcave, so a request Windcave provably never took held the sale (or invoice) for good: every retry was "processing", the merchant could not split it. | `sessionRequestNotSent`: `invalid_request`, `disabled`, or a 4xx on the first try. A 4xx after a retried timeout is marked `afterRetry` and still holds. The attempt is abandoned (its send intent stays, write-once), the payer gets 409 PAYMENT_ATTEMPT_EXPIRED ("try again"), and the split guards ignore such an attempt. | PG ×6, unit |
| 6 | A sale cancelled (or invoice voided) while its session was being created was still served payment links, and a same-key reload served them again. | The session stays bound, so a payment that reaches it is recorded, but both checkout engines answer `closed` and the handlers 410 PAYMENT_LINK_CLOSED. | PG ×3 |
| 7 | MemStorage deleted a business with a recorded cash sale (PostgreSQL's FK refuses it); a failed cash write logged nothing. | Ported: the delete guard, and a class-only log (SQLSTATE, `cash_audit_missing` or `unclassified`, never a value). | unit ×4 |
| 8 | MemStorage attached under a different X-ID than the one recorded; PostgreSQL refuses. | Ported the one-line check. | unit |
| 9 | H-3: a provider mismatch lost its field. OI-2: a decline's stored transaction depended on reply order, so a second receipt could dead-letter as `settlement_conflict`. | Mismatches carry R2-T6's field; the worker raises one `PROVIDER_OUTCOME_MISMATCH {field}` and writes `integrity_mismatch:<field>` on the retail attempt (the inbox code stays `integrity_mismatch`). Declines choose the transaction by ID. | unit ×8, PG |
| 10 | The three cancel screens showed only "Failed to cancel" when the cancel was refused because money was taken or Windcave had just confirmed a payment. | A sale found paid at cancel answers 409 PAYMENT_COMPLETED; `cancel-refusal.ts` explains PAYMENT_ACTIVE, PAYMENT_CAPTURED and PAYMENT_COMPLETED and refreshes the screen. | unit ×2 |

## 5. Open items

None of these is fixed here. Items marked *owner* need a decision; the rest are Codex's R3.

- **T-3 (blocker, owner and UAT).** Any reconcile records a verified decline as the session's
  one settlement (`payment_settlement_events.session_id` is unique). If Windcave lets a payer
  try a second card in the same session after a decline, that approval dead-letters as
  `settlement_conflict` and never reaches the sale. Our OI-1 amendment left the attempt open
  for this; Codex's R3 closes it. The decision file now records both. Needs the Windcave UAT
  answer, then either settlements keyed per provider transaction or no decline settlement
  before the session ends.
- **R-3a / R1-T7 (owner).** Codex's pre-change reconcile records a verified payment through a
  by-ID finalizer reached from merchant routes. This is the open owner question in
  `../r3/OUTSTANDING-2026-10-14.md`.
- **Cutover: attempts written by the R2 route.** A live retail attempt recorded before cutover
  has no `expected_provider_account` or `request_fingerprint`, so R3 can neither bind nor
  recover it. Codex's preflight counts them (`liveRetailMissingExpectations`) but nothing
  requires the count to be 0. Make it a hard cutover gate, or restore this branch's
  configured-account fallback.
- **Cutover: delivery outbox.** The delivery loop starts whenever the database is connected
  (`server/index.ts`), unlike reconciliation, which has its own switch. Pending outbox rows
  left by earlier builds (cash sales, which those builds had already announced) would send
  their emails and pushes again on the first boot. Needs a runbook step, run with the app
  stopped, or a switch.
- **D1.** A dead-lettered inbox row is never reopened by a new arrival, so a payment confirmed
  after a long outage is not recorded until someone intervenes. Open on this branch too.
- **D4 (subscriptions).** The subscription card domain dead-letters without the sanitized
  signal; the outbox's dead-letters are also silent.
- **FPRN rate limit.** The five notification receivers have no rate limit; each forged session
  ID costs an inbox row and up to about 40 Windcave queries. Open on this branch too.
- **0037, database-level.** (a) The trigger lets an attached or finished R2-era attempt have
  its provider account and fingerprint written for the first time; the application never
  does. (b) `send_started_at` (timestamptz) is compared with timestamp-without-time-zone
  columns, so a database session not in UTC breaks or loosens the check. Both need a forward
  migration or a startup check; the UAT checklist records "TimeZone UTC".
- **R-1, latent.** `updateSplitPaymentStatus` has no callers but still reads the sale unlocked
  and could reopen a cancelled sale if it were wired back. Delete it.
- **R4 (Claude).** The legacy refund route still reserves against the whole sale; a split sale
  must not be refunded through it. R4-T3's claim refuses split sales; part 2 replaces the
  route. The flag stays off until then.

## 6. Verification

- `npx tsc --noEmit -p .`: clean.
- Full suites on the committed tree: server 222 suites / 5,139 tests, client 134 / 1,507, no skips.
  Two test fakes gained `aggregatePayable`, and one Codex test now expects 409 PAYMENT_COMPLETED.
- PostgreSQL 16, each on a freshly rehearsed or fresh database, synthetic data only:
  R3 durability 88/88 (Codex's 74 and 14 integration checks), commands 15/15, delivery 11/11,
  served HTTP 24/24, subscriptions 19/19; R4-T2 28/28; R4-T3 14/14; R1 S2a transactions 25/25;
  R2-T4 12/12; R2-T7 7/7.
- Route facts and the tenant storage inventory were regenerated.
