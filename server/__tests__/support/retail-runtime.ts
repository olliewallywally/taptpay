import {randomUUID} from 'node:crypto';
import {parseCentsExact} from '../../windcave-query';
import {PaymentRuntime,type ConfiguredPaymentRuntime} from '../../payment-runtime';
import {createWindcaveReconciliationProvider} from '../../windcave-reconciliation-provider';
import type {PaymentAttemptService} from '../../payment-attempt-service';
import type {IStorage} from '../../storage';

/** Served-contract test port only. Uses the actual R2 normalizer/verifier and
 * original retail service. PostgreSQL fencing/outbox durability is proved by
 * verify-r3-durability-postgres.ts, not by this in-memory HTTP fixture. */
export function syntheticRetailRuntime(storage:IStorage,attempts:PaymentAttemptService){
  const context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'},bindings=new Map<string,any>(),receipts=new Map<string,any>(),sessions=new Map<string,any>();
  let observation:'pending'|'approved'|'declined'|'mismatch'|'multiple'='pending',creates=0,applications=0,now=new Date();
  const walletClaims=new Set<string>();
  const client={createSession:jest.fn(async(input:any)=>{
    creates++;const sessionId=`synthetic-session-${randomUUID()}`;sessions.set(sessionId,{amount:input.amount,reference:input.merchantReference});
    return {kind:'created',sessionId,links:{hpp:`https://uat.windcave.com/pxmi3/${sessionId}`}};
  }),querySession:jest.fn(async(sessionId:string)=>{
    const session=sessions.get(sessionId);if(!session)return {kind:'unknown'};
    const transaction={id:`provider-${sessionId}`,type:'purchase',authorised:observation!=='declined',amount:observation==='mismatch'?'0.01':session.amount,
      currency:'NZD',merchantReference:session.reference};
    return {kind:'reply',status:200,body:{id:sessionId,state:observation==='pending'?'pending':'complete',
      transactions:observation==='pending'?[]:observation==='multiple'?[transaction,{...transaction,id:`second-${sessionId}`}]:[transaction],
      links:[{rel:'hpp',href:`https://uat.windcave.com/pxmi3/${sessionId}`},{rel:'ajaxSubmitGooglePay',href:`https://uat.windcave.com/mh/${sessionId}-googlepay`}]}};
  })};
  const repository={
    prepareRetailExpectation:async(input:any,now:Date)=>{
      const attempt=await attempts.getAttempt(input.paymentAttemptId);if(!attempt)return undefined;
      const sale=await storage.getTransaction(attempt.transactionId);if(!sale)return undefined;
      const split=attempt.shareIndex?(await storage.getSplitPaymentsByTransaction(sale.id)).find(x=>x.splitIndex===attempt.shareIndex):undefined;
      const money=parseCentsExact(split?.amount??sale.price);if(!money.ok)return undefined;
      const reference=`TAPT_${attempt.id}`;
      await attempts.recordExpectedValues({attemptId:attempt.id,amountCents:money.cents,currency:'NZD',merchantReference:reference,providerEnvironment:'uat'});
      const prepared=await attempts.getAttempt(attempt.id);if(prepared)prepared.sendStartedAt=now;
      return {processorXId:attempt.id.replace(/-/g,'').slice(0,16),amountCents:money.cents,currency:'NZD',reference,environment:'uat',providerAccount:context.accountUsername,merchantId:sale.merchantId};
    },
    bindRetailSession:async(binding:any)=>{if(bindings.has(binding.sessionId))return false;const attempt=await attempts.getAttempt(binding.paymentAttemptId);if(!attempt)return false;
      bindings.set(binding.sessionId,{...binding,shareIndex:attempt.shareIndex});return true;},
    resolveSession:async(sessionId:string)=>bindings.get(sessionId),
    receive:async(sessionId:string,kind:string,now=new Date())=>{const key=`${sessionId}/${kind}`;if(!receipts.has(key))receipts.set(key,{id:randomUUID(),sessionId,status:'pending',firstReceivedAt:now,attemptCount:0});return receipts.get(key).id;},
    claimInbox:async(owner:string,now:Date,sessionId?:string)=>{const row=[...receipts.values()].find(x=>(x.status==='pending'||x.status==='retry'&&x.nextAttemptAt<=now)&&(!sessionId||x.sessionId===sessionId));if(!row)return undefined;
      Object.assign(row,{status:'processing',owner,attemptCount:row.attemptCount+1,leaseExpiresAt:new Date(now.getTime()+60000)});return {...row};},
    finishInbox:async(claim:any,result:any)=>{const row=[...receipts.values()].find(x=>x.id===claim.id);Object.assign(row,result);
      const binding=bindings.get(claim.sessionId);if(binding){const attempt=await attempts.getAttempt(binding.paymentAttemptId);
        if(attempt)await attempts.recordReconciliation({attemptId:attempt.id,code:result.code??attempt.state});}return true;},
    // R3 integration: links are served only for a sale that is still open.
    aggregatePayable:async(input:any)=>['pending','processing','failed'].includes((await storage.getTransaction(input.transactionId))?.status??''),
    claimWalletSubmission:async(sessionId:string)=>{if(walletClaims.has(sessionId))return false;walletClaims.add(sessionId);return true;},
    finalize:async(binding:any,evidence:any)=>{
      // MemStorage's legacy unit finalizer requires its explicit state claim.
      // The real PG finalizer performs its durable inbox fence in the commit.
      await attempts.claimFinalization(binding.paymentAttemptId,binding.sessionId);
      const result=await attempts.finalize({attemptId:binding.paymentAttemptId,processorSessionId:binding.sessionId,processorTransactionId:evidence.transactionId,
        paymentMethod:'card',outcome:evidence.outcome,receiptShare:evidence.outcome==='approved'&&binding.shareIndex>0?binding.shareIndex:null});
      if(result.kind==='finalized')applications++;return {kind:result.kind};
    },
  };
  const runtime=Object.assign(new PaymentRuntime(repository as any,createWindcaveReconciliationProvider(client as any,context),()=>now),{client,context}) as unknown as ConfiguredPaymentRuntime;
  return {runtime,client,bindings,receipts,advanceClock:(ms=120000)=>{now=new Date(now.getTime()+ms);},setObservation:(value:typeof observation)=>{observation=value;},counts:()=>({creates,applications})};
}
