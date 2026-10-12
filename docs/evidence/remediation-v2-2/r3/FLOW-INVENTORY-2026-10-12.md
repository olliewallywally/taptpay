# R3 flow and idempotency inventory

Read from base `e408f597` and the unchanged registrations in `server/routes.ts`.
This is a call-site inventory, not measured production traffic. No active route
has been retired or replaced in this foundation change. `server/route-policy.ts`
must be regenerated/reviewed when the actual R2-backed cutover is implemented.

| Retained flow / registrations | Caller evidence and disposition | Required convergence |
| --- | --- | --- |
| Retail token: `/api/pay/t/:token/session`, hosted-fields/googlepay completion, `/api/pay/return/:state`, `/api/pay/notification/:state` | `client/src/lib/payment-addressing.ts`, checkout and return pages. **Migrate**, retaining the original attempt engine. | Persist expectations/stable X-ID before provider send; exact session registry; replace route-local provider booleans with the worker and original finalizer's reconciliation hook. |
| Numeric retail: `/api/transactions/:id/pay`, hosted-fields/googlepay completion, `/api/windcave/callback`, `/api/windcave/notification` | Numeric addressing remains in `payment-addressing.ts`. **Migrate** active callers; make old session initiation reconciliation-only after cutover. | Resolve the same transaction-local token attempt, never the next pending share. Preserve legitimate old provider identities until their documented maximum lifetime and reconciliation complete. |
| Property/trades: `/api/checkout/:token/session`, split, hosted-fields/googlepay completion, `/api/checkout/callback`, rent/trades notification routes | Unified checkout actively names these routes. **Migrate** normal and split payments. | Client persists a UUID per selected share; use `DurableInvoiceCheckout`, exact cents and immutable request fingerprint, durable send intent, validated R2 session, and `DurablePaymentStorage.finalize`. Browser returns validate hashed state and enqueue rather than finalize. |
| Property/trades manual paid, void, split changes | Existing merchant management and checkout routes. **Migrate** to guarded CAS. | `changeInvoice` locks the parent and refuses live/paid attempts; manual payment records audit and never provider approval. Preserve authorization and existing event display semantics during caller migration. |
| Trades quote acceptance/deposit and send-balance | Public quote and merchant invoice pages; tenant-scoped R1 creation methods. **Migrate** payment legs to invoice attempts; preserve quote creation locks. | Quote transition graph and existing parent ownership; deposit/balance creation needs durable request identity before retries. Hash new quote/invoice tokens, dual lookup, bounded hash backfill. |
| Apple/Google Pay | Checkout payment-addressing shares the retained completion endpoints. **Migrate** only through the verified session/attempt path. | Bind a wallet session to the same exact target. Remove any standalone simulated-success processor only after checking every caller; no wallet retirement is claimed by this inventory. |
| Tap to Pay `/api/transactions/tap-to-pay` | False-only feature gate remains. **Retire** payment initiation while off. | Keep the gate and negative/no-side-effect evidence; do not enable for R3. |
| Retail create, cash-sale, split and cancel | Merchant terminals and transaction management. **Migrate** applicable domain mutations to audited CAS/idempotency. | Cash is an audited manual record; UUID/fingerprint and one-time usage/communication are distinct from provider approval. Do not send cash through provider reconciliation. |
| Refund `/api/transactions/:transactionId/refunds` | Merchant refund workflow. **Migrate** to the concrete refund attempt/finalizer in R4. | R3 graph and inventory are provided; R4 still owns amount reservations, refund verification and compensation. |
| Billing card session/confirm/callback, subscription plan/cancel/resume, billing cron | Onboarding and subscription management. **Migrate** concrete domain attempts with R2 transport before R3 exit. | Card setup/billing graphs remain separate; zero-value card verification is not a retail/invoice charge. Durable billing keys, leases, expected account/environment and period identity still need implementation/review; R5 separately owns encryption. |
| Removed `/api/checkout/pay` | Previously removed by the September 26 owner decision. **Retire**. | Preserve removal; do not restore as a parallel state machine. |

## Foundation idempotency rules

- Invoice key scope: concrete invoice FK + share + client UUID. Server fingerprint
  includes merchant, invoice, exact cents, share, currency, environment, reference
  and provider account. A changed request with the same key conflicts. Each live
  and approved share also has a database uniqueness guard.
- Lock order: invoice → attempt → binding; a reconciliation receipt additionally
  fences its own inbox lease. Retail retains transaction → attempt → split rows
  and adds its inbox fence/binding checks within the original transaction.
- Provider X-ID: persisted on the invoice attempt or retail expectation before
  sending. Invoice `send_started_at`, or a retail expectation as conservative send
  intent, prevents replacement after possible acceptance. No blind resend after
  timeout; R2 must supply lookup/recovery for that same identity.
- Before send: an expired demonstrably unsent invoice claim may be abandoned.
  After possible acceptance: retain the attempt and X-ID, even without a session
  attachment. After attachment: expiry cannot create a second charge.
- After receipt commit/crash: another worker can claim the expired one-minute
  lease. Stale owners cannot finish or settle. Unknown/pending responses retry
  with bounded backoff/jitter; exhausted work becomes dead-letter without changing
  payment state or freeing an uncertain live charge.
- After settlement commit/before inbox completion: replay compares outcome and
  provider transaction ID and reuses the existing event. Share counts and retail
  usage increment once. Event/channel uniqueness supplies stable outbox delivery
  keys; the actual receiver must atomically deduplicate those keys.

## Remaining exit gates

No production traffic measurement or provider maximum session lifetime was
available. Legacy callbacks still contain their old completion logic. Every
active caller above needs actual R2-backed convergence, authenticated/public
policy review and negative tests before R3 can close. The new contracts are
inactive; current routes do not silently adopt an unverified provider adapter.
