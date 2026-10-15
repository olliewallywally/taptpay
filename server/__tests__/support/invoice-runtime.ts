import {randomUUID} from 'node:crypto';
import {invoiceShareCents,requestFingerprint} from '../../durable-payment-contract';
import {hashBearerCredential} from '../../payment-credential';
import {PaymentRuntime,type ConfiguredPaymentRuntime} from '../../payment-runtime';
import {createWindcaveReconciliationProvider} from '../../windcave-reconciliation-provider';
import {payableInvoiceStates} from '../../payment-transition-graphs';

/** Controller port fixture, not SQL durability evidence. The real registered
 * routes and financial/storage effects are tested by verify-r3-http-postgres.ts. */
export function syntheticInvoiceRuntime(getInvoice:(input:any)=>Promise<any>,apply:(binding:any,evidence:any)=>Promise<void>=async()=>{}){
  const context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'},attempts=new Map<string,any>(),bindings=new Map<string,any>(),sessions=new Map<string,any>(),receipts=new Map<string,any>();
  let observation:'pending'|'approved'|'declined'|'mismatch'='pending',applications=0,now=new Date();
  const walletClaims=new Set<string>();
  const key=(input:any)=>`${input.vertical}/${input.invoiceId}/${input.merchantId}/${input.shareIndex}/${input.idempotencyKey}`;
  const client={createSession:jest.fn(async(input:any)=>{const sessionId=`invoice-${randomUUID()}`;sessions.set(sessionId,{amount:input.amount,reference:input.merchantReference});return {kind:'created',sessionId,links:{hpp:`https://uat.windcave.com/pxmi3/${sessionId}`}};}),
    querySession:jest.fn(async(sessionId:string)=>{const row=sessions.get(sessionId);if(!row)return {kind:'unknown'};return {kind:'reply',body:{id:sessionId,state:observation==='pending'?'pending':'complete',
      transactions:observation==='pending'?[]:[{id:`provider-${sessionId}`,type:'purchase',authorised:observation!=='declined',amount:observation==='mismatch'?'0.01':row.amount,currency:'NZD',merchantReference:row.reference}],
      links:[{rel:'hpp',href:`https://uat.windcave.com/pxmi3/${sessionId}`},{rel:'ajaxSubmitGooglePay',href:`https://uat.windcave.com/mh/${sessionId}-googlepay`}]}};})};
  const repository={
    claimInvoice:jest.fn(async(input:any,now:Date)=>{const parent=await getInvoice(input);if(!parent||parent.id!==input.invoiceId||parent.merchantId!==input.merchantId)return {kind:'not-found'};
      const fingerprint=requestFingerprint(input),prior=attempts.get(key(input));if(prior)return prior.requestFingerprint!==fingerprint?{kind:'conflict'}:{kind:['approved','declined','cancelled'].includes(prior.state)?'terminal':'reused',attempt:prior};
      if(!['sent','dispatched','overdue'].includes(parent.status))return {kind:'conflict'};
      if(input.reserveShare){input={...input,shareIndex:Array.from({length:parent.splitCount},(_,i)=>i+1).find(i=>![...attempts.values()].some(a=>(a.rentInvoiceId??a.jobInvoiceId)===parent.id&&a.shareIndex===i&&a.state!=='declined'))};}
      if(parent.splitCount ? !Number.isInteger(input.shareIndex)||input.shareIndex<1||input.shareIndex>parent.splitCount : input.shareIndex!==0)return {kind:'conflict'};
      if([...attempts.values()].some(a=>(a.rentInvoiceId??a.jobInvoiceId)===parent.id&&a.shareIndex===input.shareIndex&&!['declined','cancelled','abandoned'].includes(a.state)))return {kind:'conflict'};
      const id=randomUUID(),attempt={id,merchantId:input.merchantId,rentInvoiceId:input.vertical==='property'?parent.id:null,jobInvoiceId:input.vertical==='trades'?parent.id:null,
        shareIndex:input.shareIndex,idempotencyKey:input.idempotencyKey,payerEmail:input.payerEmail??null,requestFingerprint:fingerprint,state:'claiming',
        amountCents:parent.splitCount?invoiceShareCents(parent.amountCents,parent.splitCount,input.shareIndex):parent.amountCents,currency:'NZD',reference:`INV_${id}`,processorXId:id.replace(/-/g,'').slice(0,16),environment:'uat',providerAccount:context.accountUsername,createdAt:now};
      attempts.set(key(input),attempt);return {kind:'claimed',attempt};}),
    markInvoiceSendStarted:async(id:string,now:Date,raw:string)=>{const a=[...attempts.values()].find(x=>x.id===id);a.sendStartedAt=now;a.returnStateHash=hashBearerCredential(raw);return true;},
    attachInvoiceSession:async(id:string,sessionId:string)=>{const a=[...attempts.values()].find(x=>x.id===id);if(bindings.has(sessionId))return {kind:'conflict'};a.state='ready';bindings.set(sessionId,{...a,sessionId,invoiceAttemptId:a.id});return {kind:'attached'};},
    getInvoiceSession:async(id:string)=>[...bindings.values()].find(x=>x.invoiceAttemptId===id),getInvoiceAttemptByKey:async(input:any)=>attempts.get(key(input)),resolveSession:async(id:string)=>bindings.get(id),
    resolveInvoiceReturnState:async(raw:string)=>{const a=[...attempts.values()].find(x=>x.returnStateHash===hashBearerCredential(raw));return a?{kind:'valid',attempt:a,sessionId:[...bindings.values()].find(x=>x.invoiceAttemptId===a.id)?.sessionId}:{kind:'not-found'};},
    receive:async(sessionId:string,kind:string,now=new Date())=>{const id=`${sessionId}/${kind}`;if(!receipts.has(id))receipts.set(id,{id:randomUUID(),sessionId,firstReceivedAt:now,status:'pending',attemptCount:0});return receipts.get(id).id;},
    claimInbox:async(owner:string,now:Date,sessionId?:string)=>{const row=[...receipts.values()].find(x=>(x.status==='pending'||x.status==='retry'&&x.nextAttemptAt<=now)&&(!sessionId||x.sessionId===sessionId));if(!row)return undefined;Object.assign(row,{owner,status:'processing',attemptCount:row.attemptCount+1,leaseExpiresAt:new Date(now.getTime()+60000)});return {...row};},
    // R3 integration: links are served only for an invoice that is still payable.
    aggregatePayable:async(input:any)=>{const a=[...attempts.values()].find(x=>(x.rentInvoiceId??x.jobInvoiceId)===input.invoiceId);
      const parent=a?await getInvoice({vertical:input.domain,invoiceId:input.invoiceId,merchantId:a.merchantId}):undefined;
      return !!parent && (payableInvoiceStates as readonly string[]).includes(parent.status);},
    claimWalletSubmission:async(sessionId:string)=>{if(walletClaims.has(sessionId))return false;walletClaims.add(sessionId);return true;},
    changeInvoice:async(input:any)=>{const parent=await getInvoice(input);if(!parent)return {kind:'not-found'};if([...attempts.values()].some(a=>(a.rentInvoiceId??a.jobInvoiceId)===parent.id))return {kind:'conflict'};Object.assign(parent,{splitCount:input.splitCount,splitEnabled:true,splitPaidCount:0});return {kind:'changed'};},
    finishInbox:async(claim:any,result:any)=>{Object.assign([...receipts.values()].find(x=>x.id===claim.id),result);return true;},
    finalize:async(binding:any,evidence:any)=>{const a=[...attempts.values()].find(x=>x.id===binding.invoiceAttemptId);if(['approved','declined'].includes(a.state))return {kind:'reused'};
      await apply(binding,evidence);a.state=evidence.outcome;applications++;return {kind:'finalized'};},
  };
  const runtime=Object.assign(new PaymentRuntime(repository as any,createWindcaveReconciliationProvider(client as any,context),()=>now),{client,context}) as unknown as ConfiguredPaymentRuntime;
  return {runtime,client,repository,attempts,bindings,receipts,advanceClock:(ms=120000)=>{now=new Date(now.getTime()+ms);},setObservation:(value:typeof observation)=>{observation=value;},counts:()=>({applications,creates:client.createSession.mock.calls.length})};
}
