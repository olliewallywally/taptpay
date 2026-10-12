import {evaluateTransition,retailTransactionGraph,paymentAttemptGraph,propertyInvoiceGraph,tradesInvoiceGraph,refundGraph,
  subscriptionBillingAttemptGraph} from '../payment-transition-graphs';

describe('domain transition authority and terminality',()=>{
  test('property dispatch and trades send retain their existing public statuses',()=>{
    expect(propertyInvoiceGraph.rules.dispatch.to).toBe('dispatched');
    expect(tradesInvoiceGraph.rules.dispatch.to).toBe('sent');
  });
  test('merchant manual payment is audited separately from provider approval',()=>{
    expect(evaluateTransition(propertyInvoiceGraph,'dispatched','manualPaid','merchant')).toEqual({kind:'claimed'});
    expect(evaluateTransition(propertyInvoiceGraph,'dispatched','manualPaid','processor')).toEqual({kind:'conflict'});
    expect(evaluateTransition(tradesInvoiceGraph,'sent','approve','merchant')).toEqual({kind:'conflict'});
    expect(propertyInvoiceGraph.rules.manualPaid.effects).not.toContain('usage_once');
  });
  test('provider cannot move a voided invoice or cancelled retail sale to paid',()=>{
    expect(evaluateTransition(propertyInvoiceGraph,'voided','approve','processor')).toEqual({kind:'conflict'});
    expect(evaluateTransition(retailTransactionGraph,'cancelled','approve','processor')).toEqual({kind:'conflict'});
  });
  test('ready or finalizing attempt cannot be abandoned by lease expiry',()=>{
    for(const state of ['ready','finalizing']) expect(evaluateTransition(paymentAttemptGraph,state,'abandonUnsent','system')).toEqual({kind:'conflict'});
    expect(evaluateTransition(paymentAttemptGraph,'claiming','abandonUnsent','system')).toEqual({kind:'claimed'});
  });
  test('approved replay is terminal but another partial refund still requires its own durable claim',()=>{
    expect(evaluateTransition(retailTransactionGraph,'completed','approve','processor')).toEqual({kind:'terminal'});
    expect(evaluateTransition(retailTransactionGraph,'partially_refunded','partialRefund','processor')).toEqual({kind:'claimed'});
    expect(evaluateTransition(refundGraph,'completed','start','system')).toEqual({kind:'conflict'});
  });
  test('unknown subscription outcome permits reconciliation, never another send',()=>{
    expect(evaluateTransition(subscriptionBillingAttemptGraph,'unknown','start','system')).toEqual({kind:'conflict'});
    expect(evaluateTransition(subscriptionBillingAttemptGraph,'unknown','approve','processor')).toEqual({kind:'claimed'});
    expect(evaluateTransition(propertyInvoiceGraph,'invalid','approve','processor')).toEqual({kind:'conflict'});
    expect(evaluateTransition(propertyInvoiceGraph,'sent','__proto__','merchant')).toEqual({kind:'conflict'});
  });
});
