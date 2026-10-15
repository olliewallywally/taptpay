import type {WindcaveClient} from './windcave-client';
import {normalizeSessionQuery} from './windcave-query';
import {verifyWindcaveOutcome,type WindcaveVerificationContext} from './windcave-verify';
import {isSessionId,type ReconciliationProvider} from './durable-payment-contract';

/** The same transaction whatever order the reply lists them in. */
function firstById<T extends {id:string}>(transactions:readonly T[]):T|undefined {
  return [...transactions].sort((a,b)=>a.id<b.id?1:a.id>b.id?-1:0)[0];
}

/** The client is built from R2's pinned endpoint and validated credentials.
 * X-ID belongs to the locally persisted session binding: Windcave's session
 * query does not echo it. Environment/account come from that client's context;
 * an account named in the actual reply must also match the R2 verifier.
 * Money, reference, transaction ID/count and final state come from the reply. */
export function createWindcaveReconciliationProvider(
  client:Pick<WindcaveClient,'querySession'>,
  context:Readonly<WindcaveVerificationContext>,
):ReconciliationProvider {
  return {async discoverReference(sessionId){
    const reply=await client.querySession(sessionId);if(reply.kind!=='reply')return undefined;
    const observed=normalizeSessionQuery(reply.body,sessionId);
    if(observed.kind!=='approved' && observed.kind!=='declined')return undefined;
    const selected=observed.kind==='approved'?observed.transaction:firstById(observed.transactions);
    if(selected?.type!=='purchase')return undefined;
    return selected.merchantReference;
  },async query(expected) {
    if(expected.environment!==context.providerEnvironment) return {kind:'mismatch',field:'environment'};
    if(expected.providerAccount!==context.accountUsername) return {kind:'mismatch',field:'account'};
    const reply=await client.querySession(expected.sessionId);
    if(reply.kind==='pending') return {kind:'pending'};
    if(reply.kind==='disabled' || reply.kind==='rejected') return {kind:'unavailable'};
    if(reply.kind!=='reply') return {kind:'unknown'};
    const observed=normalizeSessionQuery(reply.body,expected.sessionId);
    const verified=verifyWindcaveOutcome({sessionId:expected.sessionId,amountCents:expected.amountCents,
      currency:expected.currency,merchantReference:expected.reference,providerEnvironment:expected.environment},observed,context);
    if(verified.kind==='pending') return {kind:'pending'};
    if(verified.kind==='mismatch') return {kind:'mismatch',field:verified.field};
    if(observed.kind==='approved' || observed.kind==='declined') {
      if(verified.kind!=='approved' && verified.kind!=='declined') return {kind:'unknown'};
      // A decline names no transaction in R2. R3 stores one, so choose it independently of reply order (OI-2).
      const transaction=observed.kind==='approved'?observed.transaction:firstById(observed.transactions);
      if(transaction?.type!=='purchase')return {kind:'mismatch'};
      if(!isSessionId(transaction.id)) return {kind:'mismatch'};
      return {kind:'verified',outcome:verified.kind,sessionId:observed.sessionId,
        processorXId:expected.processorXId,amountCents:transaction.amountCents,currency:transaction.currency,
        reference:transaction.merchantReference,environment:context.providerEnvironment,providerAccount:context.accountUsername,
        transactionId:transaction.id,transactionCount:observed.transactionCount};
    }
    return {kind:'unknown'};
  }};
}
