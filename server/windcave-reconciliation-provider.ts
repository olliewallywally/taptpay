import type {WindcaveClient} from './windcave-client';
import {normalizeSessionQuery} from './windcave-query';
import {verifyWindcaveOutcome,type WindcaveVerificationContext} from './windcave-verify';
import {isSessionId,type ReconciliationProvider} from './durable-payment-contract';

/** The client is built from R2's pinned endpoint and validated credentials.
 * X-ID belongs to the locally persisted session binding: Windcave's session
 * query does not echo it. Environment/account come from that client's context;
 * an account named in the actual reply must also match the R2 verifier.
 * Money, reference, transaction ID/count and final state come from the reply. */
export function createWindcaveReconciliationProvider(
  client:Pick<WindcaveClient,'querySession'>,
  context:Readonly<WindcaveVerificationContext>,
):ReconciliationProvider {
  return {async query(expected) {
    if(expected.environment!==context.providerEnvironment || expected.providerAccount!==context.accountUsername) return {kind:'mismatch'};
    const reply=await client.querySession(expected.sessionId);
    if(reply.kind==='pending') return {kind:'pending'};
    if(reply.kind==='disabled' || reply.kind==='rejected') return {kind:'unavailable'};
    if(reply.kind!=='reply') return {kind:'unknown'};
    const observed=normalizeSessionQuery(reply.body,expected.sessionId);
    const verified=verifyWindcaveOutcome({sessionId:expected.sessionId,amountCents:expected.amountCents,
      currency:expected.currency,merchantReference:expected.reference,providerEnvironment:expected.environment},observed,context);
    if(verified.kind==='pending') return {kind:'pending'};
    if(verified.kind==='mismatch') return {kind:'mismatch'};
    if(observed.kind==='approved' || observed.kind==='declined') {
      if(observed.transactionCount!==1 || observed.transactions[0].type!=='purchase') return {kind:'mismatch'};
      if(verified.kind!=='approved' && verified.kind!=='declined') return {kind:'unknown'};
      const transaction=observed.transactions[0];
      if(!isSessionId(transaction.id)) return {kind:'mismatch'};
      return {kind:'verified',outcome:verified.kind,sessionId:observed.sessionId,
        processorXId:expected.processorXId,amountCents:transaction.amountCents,currency:transaction.currency,
        reference:transaction.merchantReference,environment:context.providerEnvironment,providerAccount:context.accountUsername,
        transactionId:transaction.id,transactionCount:1};
    }
    return {kind:'unknown'};
  }};
}
