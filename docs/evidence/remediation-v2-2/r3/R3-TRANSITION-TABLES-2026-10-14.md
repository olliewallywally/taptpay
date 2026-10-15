# R3 typed transition tables — October 14 candidate

Generated from the current typed graph modules. Repository transitions use the
scoped CAS/row-lock services named in the caller inventory. This table does not
approve R4 refunds, provider activation, or R3 phase exit.

## paymentAttemptGraph

States: `claiming`, `ready`, `finalizing`, `approved`, `declined`, `cancelled`, `abandoned`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| attach | claiming | ready | system | durable_session_binding | same terminal result; has permitted later transitions |
| claimFinalization | ready | finalizing | system | lease_fence | same terminal result; has permitted later transitions |
| approve | finalizing | approved | processor | audit_event, durable_outbox | same terminal result; terminal outcome |
| decline | finalizing | declined | processor | audit_event, durable_outbox | same terminal result; terminal outcome |
| cancel | finalizing | cancelled | processor | audit_event, durable_outbox | same terminal result; terminal outcome |
| abandonUnsent | claiming | abandoned | system | expired_unattached_lease_only | same terminal result; terminal outcome |

## propertyInvoiceGraph

States: `pending_dispatch`, `dispatched`, `dispatch_failed`, `sent`, `viewed`, `overdue`, `paid`, `paid_external`, `voided`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| dispatch | pending_dispatch, dispatch_failed | dispatched | system | dispatch_event | same terminal result; has permitted later transitions |
| dispatchFail | pending_dispatch | dispatch_failed | system | dispatch_event | same terminal result; has permitted later transitions |
| approve | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue, voided | paid | processor | verified_existing_attempt, exact_share_count_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| additionalCapture | paid_external | paid_external | processor | verified_existing_attempt, preserve_manual_record, audit_event, durable_outbox | same terminal result; has permitted later transitions |
| manualPaid | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue | paid_external | merchant | block_when_captured, retain_provider_attempts, manual_payment_audit, durable_outbox | same terminal result; has permitted later transitions |
| void | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue | voided | merchant | block_when_captured, retain_provider_attempts, audit_event, durable_outbox | same terminal result; has permitted later transitions |

## propertyShareGraph

States: `pending`, `processing`, `paid`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | pending | processing | system | attempt_claim | same terminal result; has permitted later transitions |
| approve | pending, processing | paid | processor | invoice_count_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| release | processing | pending | processor | terminal_attempt | same terminal result; has permitted later transitions |

## refundGraph

States: `pending`, `processing`, `completed`, `failed`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | pending | processing | system | durable_refund_attempt | same terminal result; has permitted later transitions |
| approve | processing | completed | processor | refunded_amount_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| decline | processing | failed | processor | audit_event, durable_outbox | same terminal result; terminal outcome |

## retailShareGraph

States: `pending`, `processing`, `completed`, `failed`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | pending | processing | system | attempt_claim | same terminal result; has permitted later transitions |
| approve | pending, processing | completed | processor | parent_share_count_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| release | processing | pending | processor | terminal_attempt, audit_event, durable_outbox | same terminal result; has permitted later transitions |

## retailTransactionGraph

States: `pending`, `processing`, `completed`, `failed`, `cancelled`, `partially_refunded`, `refunded`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | pending | processing | system | attempt_claim | same terminal result; has permitted later transitions |
| approve | pending, processing, failed, cancelled | completed | processor | verified_existing_attempt, usage_once, audit_event, durable_outbox | same terminal result; has permitted later transitions |
| decline | pending, processing | failed | processor | audit_event, durable_outbox | same terminal result; has permitted later transitions |
| cancel | pending, processing, failed | cancelled | merchant, processor | block_when_captured, retain_provider_attempts, audit_event, durable_outbox | same terminal result; has permitted later transitions |
| partialRefund | completed, partially_refunded | partially_refunded | processor | audit_event, durable_outbox | same terminal result; has permitted later transitions |
| fullRefund | completed, partially_refunded | refunded | processor | audit_event, durable_outbox | same terminal result; terminal outcome |

## subscriptionBillingAttemptGraph

States: `claiming`, `unknown`, `approved`, `declined`, `abandoned`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | claiming | unknown | system | durable_send_marker, lease_fence | replay conflicts; has permitted later transitions |
| approve | unknown | approved | processor | paid_period_once, retain_parent_drift_for_resolution, audit_event, durable_outbox | same terminal result; terminal outcome |
| decline | unknown | declined | processor | dunning_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| missingMethod | claiming | declined | system | no_provider_send, dunning_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| abandonUnsent | claiming | abandoned | system | unsent_only | same terminal result; terminal outcome |

## subscriptionCardAttemptGraph

States: `claiming`, `ready`, `approved`, `declined`, `abandoned`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| attach | claiming | ready | system | durable_session_binding | same terminal result; has permitted later transitions |
| approve | ready | approved | processor | verified_zero_value_card, save_card_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| decline | ready | declined | processor | audit_event, durable_outbox | same terminal result; terminal outcome |
| abandonUnsent | claiming | abandoned | system | expired_unattached_unsent_only | same terminal result; terminal outcome |

## tradesInvoiceGraph

States: `pending_dispatch`, `dispatched`, `dispatch_failed`, `sent`, `viewed`, `overdue`, `paid`, `paid_external`, `voided`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| dispatch | pending_dispatch, dispatch_failed | sent | system | dispatch_event | same terminal result; has permitted later transitions |
| dispatchFail | pending_dispatch | dispatch_failed | system | dispatch_event | same terminal result; has permitted later transitions |
| approve | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue, voided | paid | processor | verified_existing_attempt, exact_share_count_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| additionalCapture | paid_external | paid_external | processor | verified_existing_attempt, preserve_manual_record, audit_event, durable_outbox | same terminal result; has permitted later transitions |
| manualPaid | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue | paid_external | merchant | block_when_captured, retain_provider_attempts, manual_payment_audit, durable_outbox | same terminal result; has permitted later transitions |
| void | pending_dispatch, dispatched, dispatch_failed, sent, viewed, overdue | voided | merchant | block_when_captured, retain_provider_attempts, audit_event, durable_outbox | same terminal result; has permitted later transitions |

## tradesQuoteGraph

States: `draft`, `sent`, `viewed`, `accepted`, `declined`, `expired`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| send | draft | sent | merchant, system | dispatch_event | same terminal result; has permitted later transitions |
| view | sent | viewed | payer | audit_event, durable_outbox | same terminal result; has permitted later transitions |
| accept | sent, viewed | accepted | payer | quote_audit, deposit_creation_idempotency, durable_outbox | same terminal result; terminal outcome |
| decline | sent, viewed | declined | payer | quote_audit, durable_outbox | same terminal result; terminal outcome |
| expire | sent, viewed | expired | system | quote_audit, durable_outbox | same terminal result; terminal outcome |

## tradesShareGraph

States: `pending`, `processing`, `paid`.

| Action | Allowed source | Target | Actor | Effects | Replay / terminality |
| --- | --- | --- | --- | --- | --- |
| start | pending | processing | system | attempt_claim | same terminal result; has permitted later transitions |
| approve | pending, processing | paid | processor | invoice_count_once, audit_event, durable_outbox | same terminal result; terminal outcome |
| release | processing | pending | processor | terminal_attempt | same terminal result; has permitted later transitions |
