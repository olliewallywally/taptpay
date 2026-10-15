/** Domain states remain distinct from provider outcomes. These graphs define
 * permitted actors/effects; route migration must use CAS, never apply a graph
 * decision through an unlocked generic status update. */
type Actor='processor'|'merchant'|'payer'|'system';
type Rule<State extends string>={from:readonly State[];to:State;actors:readonly Actor[];effects:readonly string[];replay?:'conflict'};
function graph<const States extends readonly string[],const Rules extends Record<string,Rule<States[number]>>>(states:States,rules:Rules) {
  return {states,rules};
}
const moneyEffects=['audit_event','durable_outbox'] as const;
export const retailTransactionGraph=graph(['pending','processing','completed','failed','cancelled','partially_refunded','refunded'],{
  start:{from:['pending'],to:'processing',actors:['system'],effects:['attempt_claim']},
  approve:{from:['pending','processing','failed','cancelled'],to:'completed',actors:['processor'],effects:['verified_existing_attempt','usage_once',...moneyEffects]},
  decline:{from:['pending','processing'],to:'failed',actors:['processor'],effects:moneyEffects},
  cancel:{from:['pending','processing','failed'],to:'cancelled',actors:['merchant','processor'],effects:['block_when_captured','retain_provider_attempts',...moneyEffects]},
  partialRefund:{from:['completed','partially_refunded'],to:'partially_refunded',actors:['processor'],effects:moneyEffects},
  fullRefund:{from:['completed','partially_refunded'],to:'refunded',actors:['processor'],effects:moneyEffects},
});
export type RetailTransactionState=typeof retailTransactionGraph.states[number];
export const retailShareGraph=graph(['pending','processing','completed','failed'],{
  start:{from:['pending'],to:'processing',actors:['system'],effects:['attempt_claim']},
  approve:{from:['pending','processing'],to:'completed',actors:['processor'],effects:['parent_share_count_once',...moneyEffects]},
  release:{from:['processing'],to:'pending',actors:['processor'],effects:['terminal_attempt',...moneyEffects]},
});
export const paymentAttemptGraph=graph(['claiming','ready','finalizing','approved','declined','cancelled','abandoned'],{
  attach:{from:['claiming'],to:'ready',actors:['system'],effects:['durable_session_binding']},
  claimFinalization:{from:['ready'],to:'finalizing',actors:['system'],effects:['lease_fence']},
  approve:{from:['finalizing'],to:'approved',actors:['processor'],effects:moneyEffects},
  decline:{from:['finalizing'],to:'declined',actors:['processor'],effects:moneyEffects},
  cancel:{from:['finalizing'],to:'cancelled',actors:['processor'],effects:moneyEffects},
  abandonUnsent:{from:['claiming'],to:'abandoned',actors:['system'],effects:['expired_unattached_lease_only']},
  // T-3 (migration 0050): a verified approval of the same session supersedes its recorded decline.
  supersedeDecline:{from:['declined'],to:'approved',actors:['processor'],effects:['verified_same_session','registry_supersession_claim',...moneyEffects]},
});
export const payableInvoiceStates=['pending_dispatch','dispatched','dispatch_failed','sent','viewed','overdue'] as const;
const invoiceRules={
  dispatch:{from:['pending_dispatch','dispatch_failed'],to:'dispatched',actors:['system'],effects:['dispatch_event']},
  dispatchFail:{from:['pending_dispatch'],to:'dispatch_failed',actors:['system'],effects:['dispatch_event']},
  approve:{from:[...payableInvoiceStates,'voided'],to:'paid',actors:['processor'],effects:['verified_existing_attempt','exact_share_count_once',...moneyEffects]},
  additionalCapture:{from:['paid_external'],to:'paid_external',actors:['processor'],effects:['verified_existing_attempt','preserve_manual_record',...moneyEffects]},
  manualPaid:{from:payableInvoiceStates,to:'paid_external',actors:['merchant'],effects:['block_when_captured','retain_provider_attempts','manual_payment_audit','durable_outbox']},
  void:{from:payableInvoiceStates,to:'voided',actors:['merchant'],effects:['block_when_captured','retain_provider_attempts',...moneyEffects]},
} as const;
export const propertyInvoiceGraph=graph([...payableInvoiceStates,'paid','paid_external','voided'],invoiceRules);
export const tradesInvoiceGraph=graph([...payableInvoiceStates,'paid','paid_external','voided'],{
  ...invoiceRules,dispatch:{...invoiceRules.dispatch,to:'sent'},
});
export const propertyShareGraph=graph(['pending','processing','paid'],{
  start:{from:['pending'],to:'processing',actors:['system'],effects:['attempt_claim']},
  approve:{from:['pending','processing'],to:'paid',actors:['processor'],effects:['invoice_count_once',...moneyEffects]},
  release:{from:['processing'],to:'pending',actors:['processor'],effects:['terminal_attempt']},
});
export const tradesShareGraph=graph(['pending','processing','paid'],propertyShareGraph.rules);
export const tradesQuoteGraph=graph(['draft','sent','viewed','accepted','declined','expired'],{
  send:{from:['draft'],to:'sent',actors:['merchant','system'],effects:['dispatch_event']},
  view:{from:['sent'],to:'viewed',actors:['payer'],effects:moneyEffects},
  accept:{from:['sent','viewed'],to:'accepted',actors:['payer'],effects:['quote_audit','deposit_creation_idempotency','durable_outbox']},
  decline:{from:['sent','viewed'],to:'declined',actors:['payer'],effects:['quote_audit','durable_outbox']},
  expire:{from:['sent','viewed'],to:'expired',actors:['system'],effects:['quote_audit','durable_outbox']},
});
export const refundGraph=graph(['pending','processing','completed','failed'],{
  start:{from:['pending'],to:'processing',actors:['system'],effects:['durable_refund_attempt']},
  approve:{from:['processing'],to:'completed',actors:['processor'],effects:['refunded_amount_once',...moneyEffects]},
  decline:{from:['processing'],to:'failed',actors:['processor'],effects:moneyEffects},
});
export const subscriptionCardAttemptGraph=graph(['claiming','ready','approved','declined','abandoned'],{
  attach:{from:['claiming'],to:'ready',actors:['system'],effects:['durable_session_binding']},
  approve:{from:['ready'],to:'approved',actors:['processor'],effects:['verified_zero_value_card','save_card_once',...moneyEffects]},
  decline:{from:['ready'],to:'declined',actors:['processor'],effects:moneyEffects},
  abandonUnsent:{from:['claiming'],to:'abandoned',actors:['system'],effects:['expired_unattached_unsent_only']},
});
export const subscriptionBillingAttemptGraph=graph(['claiming','unknown','approved','declined','abandoned'],{
  start:{from:['claiming'],to:'unknown',actors:['system'],effects:['durable_send_marker','lease_fence'],replay:'conflict'},
  approve:{from:['unknown'],to:'approved',actors:['processor'],effects:['paid_period_once','retain_parent_drift_for_resolution',...moneyEffects]},
  decline:{from:['unknown'],to:'declined',actors:['processor'],effects:['dunning_once',...moneyEffects]},
  missingMethod:{from:['claiming'],to:'declined',actors:['system'],effects:['no_provider_send','dunning_once',...moneyEffects]},
  abandonUnsent:{from:['claiming'],to:'abandoned',actors:['system'],effects:['unsent_only']},
});
export type TransitionDecision={kind:'claimed'|'terminal'}|{kind:'conflict'};
export function evaluateTransition<State extends string>(definition:{states:readonly State[];rules:Record<string,Rule<State>>},
  current:string,action:string,actor:Actor):TransitionDecision {
  const rule=Object.prototype.hasOwnProperty.call(definition.rules,action) ? definition.rules[action] : undefined;
  if(!rule || !rule.actors.includes(actor) || !definition.states.includes(current as State)) return {kind:'conflict'};
  if(current===rule.to && !rule.from.includes(current as State)) return rule.replay==='conflict'?{kind:'conflict'}:{kind:'terminal'};
  return rule.from.includes(current as State) ? {kind:'claimed'} : {kind:'conflict'};
}
