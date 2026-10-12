# R4 preflight — durable refunds, 2026-10-12

Phase: R4 (plan v2.2 §11). Status: preflight and first review; **R4-T1 implemented
2026-10-12** ([evidence](R4-T1-2026-10-12.md)) after the owner's Option A decision; R4-T2
onward still wait for the merged R2+R3 tree.
Branch `ccr-e07e3100-0wm8kr` at the R2-T7 commit. Line numbers are at that commit.
Authority: the owner's direction of 2026-10-12 ("skip to next step beyond [R3] as long as
you are 100% done of what you can do"; recorded with R2-T7). Review:
[§21.1 pass 1](R4-review-pass-1-2026-10-12.md).

**Implementation is blocked** on the owner's decision in
[R2-R3-SCHEMA-CONFLICT-2026-10-12.md](../R2-R3-SCHEMA-CONFLICT-2026-10-12.md): R4 refunds
the captured provider transaction (stored differently by R2 and R3, C-3) and reconciles
through R3's worker and outbox (Codex's branch), so R4's schema and worker depend on which
representation survives. Nothing below needs a live call, a database or a deployment.

## 1. What exists today

- `POST /api/transactions/:transactionId/refunds` (`server/routes.ts:5965`): signed-in
  business owner; `FEATURE_REFUND_INITIATION` off returns 503 before anything else; the
  provider must be configured and the sale must carry `windcaveTransactionId`.
- `GET /api/transactions/:transactionId/refunds` (6110) and
  `GET /api/merchants/:merchantId/refunds` (6142): read-only, tenant-scoped since R1.
- `createWindcaveRefund` (`server/windcave.ts`), `reserveRefundAmountForMerchant` /
  `releaseRefundAmountForMerchant` / `createRefundForMerchant` /
  `updateRefundStatusForMerchant` (`server/storage.ts`).
- `refunds` table (`shared/schema.ts:381`): serial ID, decimal amount, free-text status,
  `windcave_refund_id`, fee columns, `initiated_by` text.

The flag is off, so none of the defects below can move money today.

## 2. Baseline defects (characterized, not fixed)

| ID | Plan | Finding |
|---|---|---|
| RD-1 | §11.4 | The provider X-ID is generated inside `createWindcaveRefund` on every call (random), and the reference is `REFUND-<sale>-<Date.now()>`. A retry is a new refund at the provider. |
| RD-2 | §11.4 | Any 2xx reply is success (`response.ok`), with no strict parse or verification of amount, currency, type or original transaction. |
| RD-3 | §11.4 | A timeout, reset or other ambiguous failure is treated as "money did not move": the reservation is released and the refund marked failed, so a retry can refund twice. |
| RD-4 | §11.3 | The reservation (`reserveRefundAmountForMerchant`) and the refund row (`createRefundForMerchant`) are separate statements; a crash between them strands a reservation with no operation. |
| RD-5 | §11.3 | The reservation writes `total_refunded`, `refundable_amount` and the sale's status (`refunded`/`partially_refunded`) **before** the provider is called; the sale shows refunded while the refund is still unknown. |
| RD-6 | §11.2 | No client idempotency key or request fingerprint: a double submit is two refunds (serialized by the balance check, but two operations). |
| RD-7 | §11.1 | Money is `parseFloat` and decimal strings, not integer cents; no one-cent minimum check in cents. |
| RD-8 | §11.1 | `refund_method` `bank_transfer` and `manual` still call Windcave; there is no separate manual operation or language. |
| RD-9 | §11.1 | Split sales: the refund targets the sale's `windcaveTransactionId`, not a specific captured share. |
| RD-10 | §11.2 | `refunds` lacks the operation UUID, idempotency key/fingerprint, stable unique X-ID, typed state graph, unique provider refund ID, lease, attempt count, next reconciliation time, sanitized error code, principal and reason limits. |
| RD-11 | §11.4 | No reconciliation of `submitted`/`unknown` refunds (no worker). |
| RD-12 | §11.5 | Create and both list routes return raw `refunds` rows (and the raw sale row on create), including provider IDs. |
| RD-13 | §11.1 | No audit event per refund operation. The admin-override path the route comment mentions does not exist (owner-only is enforced). |

## 3. Proposed R4 slices (for review; implementation after the R2/R3 decision)

Each slice: failing tests first, synthetic fixtures, no network, server suite and typecheck
green, flag off throughout.

- **R4-T1 — refund provider client and verifier.** `createWindcaveRefund` takes a
  persisted X-ID and reference; typed outcomes like R2-T1 (confirmed refunded, confirmed
  declined, pending, unknown, malformed); a strict refund reply/query parser in exact
  cents, checked against the original capture, amount, currency and reference; no
  provider text out (R2-T6's rule).
- **R4-T2 — additive refund schema (§11.2).** A forward migration on `refunds` (numbered
  after whatever R2/R3 settle on), keeping legacy columns. Rehearsed locally.
- **R4-T3 — atomic claim (§11.3).** One transaction: lock the sale (and share), check
  owner and refundable state, compute remaining cents from confirmed refunds plus live
  reservations, insert or reuse the operation with its stable X-ID, append an audit event.
  Sale totals and status change only on confirmed success.
- **R4-T4 — provider call and reconciliation (§11.4).** Stable X-ID every time; confirmed
  decline releases; anything ambiguous is `unknown` and keeps the reservation; a worker on
  R3's inbox/outbox pattern reconciles `submitted`/`unknown`; confirmed success updates
  refund, totals, status, event and one notification atomically.
- **R4-T5 — DTOs, manual refunds and the §11.5 matrix.** Allowlisted DTOs; manual/bank
  transfer as their own operation that never implies provider movement; the full §11.5
  test list; disabled flag has zero side effects.

## 4. Questions for the owner

1. **The R2/R3 schema decision** (blocking): see the conflict record.
2. **Split refunds:** stay disabled (plan default) until each refund maps to a captured
   share? Recommendation: yes.
3. **Admin path:** keep owner-only (plan default), or add the audited admin override?
   Recommendation: owner-only for R4.
4. **Manual and bank-transfer refunds:** keep them as record-only operations in R4, or
   remove them from the initiation route until R7's UI work? Recommendation: record-only,
   with distinct wording, in R4-T5.

## 5. Not in R4

Turning `FEATURE_REFUND_INITIATION` on (owner gate after UAT); live refunds; UI changes
beyond what R4-T5's DTOs require (R7).
