import {logOperation} from "./structured-log";
import {randomUUID} from 'node:crypto';
import {runWithOperationContext} from "./operation-context";
import {config,PRODUCTION_WINDCAVE_ENDPOINT,UAT_WINDCAVE_ENDPOINT} from './config';
import {pool} from './db';
import {DurablePaymentStorage} from './durable-payment-storage';
import {DurableSubscriptionBilling} from './durable-subscription-billing';
import {DurableSubscriptionCard} from './durable-subscription-card';
import {chargeStoredCard,queryStoredCardCharge,createCardStorageSession,queryStoredCardSession,isWindcaveConfigured} from './windcave';
import {createWindcaveClient} from './windcave-client';
import {normalizeSessionQuery} from './windcave-query';
import {selectSessionLinks} from './windcave-links';
import {isSessionId} from './durable-payment-contract';
import {writeSecurityAuditEvent} from './security-audit-log';
import {sanitizeWindcaveAuditDetails} from './windcave';

export type SubscriptionPaymentRuntime={billing:DurableSubscriptionBilling;card:DurableSubscriptionCard;
  context:{environment:'uat'|'production';providerAccount:string}};
let runtime:SubscriptionPaymentRuntime|undefined;
/** Construction starts no loops and makes no external calls. Initiation is
 * gated separately from recovery of already-accepted provider identities. */
export function getSubscriptionPaymentRuntime(inbox?:DurablePaymentStorage):SubscriptionPaymentRuntime|undefined {
  if(runtime)return runtime;
  if(!pool)return undefined;
  const endpoint=config.windcave.endpoint,environment=endpoint===UAT_WINDCAVE_ENDPOINT?'uat':endpoint===PRODUCTION_WINDCAVE_ENDPOINT?'production':undefined;
  if(!environment||!config.windcave.username||!config.windcave.apiKey)return undefined;
  const context:SubscriptionPaymentRuntime['context']={environment,providerAccount:config.windcave.username};
  const matches=(expected:{environment:string;providerAccount:string})=>expected.environment===context.environment&&expected.providerAccount===context.providerAccount;
  const client=createWindcaveClient({config:{mode:environment,endpoint:endpoint!,username:config.windcave.username,apiKey:config.windcave.apiKey,publicOrigin:config.publicOrigin},
    transport:(url,init)=>fetch(url,init),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),clock:()=>new Date(),
    audit:(action,details)=>writeSecurityAuditEvent(action,sanitizeWindcaveAuditDetails(details)),retryLimit:0,timeoutMs:10000});
  const enabled=()=>config.features.subscriptionCharging&&isWindcaveConfigured();
  const billing=new DurableSubscriptionBilling(pool,{
    purchase:async(expected,persist)=>matches(expected)?chargeStoredCard(expected.processorXId,expected.cardId,(expected.amountCents/100).toFixed(2),expected.reference,{onPendingTransaction:persist}):{success:false},
    query:async expected=>matches(expected)?queryStoredCardCharge(expected.processorXId,expected.transactionId,(expected.amountCents/100).toFixed(2),expected.reference):{success:false},
  },context,()=>new Date(),enabled,config.dataEncryption);
  const card=new DurableSubscriptionCard(pool,inbox??new DurablePaymentStorage(pool),{
    create:async(expected,input)=>{
      if(!matches(expected))return undefined;
      const result=await createCardStorageSession(expected.processorXId,expected.reference,input.email,input.callbackUrl,input.notificationUrl);
      return result.success&&isSessionId(result.sessionId)?{sessionId:result.sessionId,redirectUrl:result.hppUrl}:undefined;
    },
    query:async expected=>{
      if(!matches(expected))return {kind:'mismatch'};
      const result=await queryStoredCardSession(expected.sessionId,{expected:{reference:expected.reference,providerAccount:expected.providerAccount}});
      if(!result.success)return {kind:result.error?.startsWith('integrity_mismatch')?'mismatch':'unknown'};
      if(!result.complete)return {kind:'pending'};
      if(!isSessionId(result.providerTransactionId))return {kind:'unknown'};
      return result.approved&&result.card?{kind:'approved',transactionId:result.providerTransactionId,card:result.card}:{kind:'declined',transactionId:result.providerTransactionId};
    },
    hostedPage:async sessionId=>{
      const query=await client.querySession(sessionId);
      if(query.kind!=='reply'||normalizeSessionQuery(query.body,sessionId).kind!=='pending'||!query.body||typeof query.body!=='object')return undefined;
      const rows=Array.isArray((query.body as any).links)?(query.body as any).links.filter((row:any)=>typeof row?.rel==='string'&&typeof row?.href==='string'):[];
      return selectSessionLinks(rows,environment).links.hpp;
    },
    discoverReference:async sessionId=>{
      const query=await client.querySession(sessionId);if(query.kind!=='reply'||!query.body||typeof query.body!=='object'||(query.body as any).id!==sessionId)return undefined;
      const transactions=(query.body as any).transactions;if(!Array.isArray(transactions)||!transactions.length)return undefined;
      const references=transactions.map((entry:any)=>entry?.merchantReference);
      return references.every((reference:any)=>typeof reference==='string'&&reference===references[0]&&/^SC_[0-9a-f-]{36}$/.test(reference))?references[0]:undefined;
    },
  },billing,context,config.paymentReturnStateSecret??'',()=>new Date(),enabled,config.dataEncryption);
  return runtime={billing,card,context};
}

export function startSubscriptionPaymentLoop(service:SubscriptionPaymentRuntime,intervalMs=1000):()=>void {
  let busy=false,stopped=false;
  const tick=async()=>runWithOperationContext({jobId:randomUUID()},async()=>{if(busy||stopped)return;busy=true;try{await service.card.recoverActivations();await service.billing.reconcileDue();}
    catch{logOperation("error","SUBSCRIPTION_RECONCILIATION_UNAVAILABLE");}finally{busy=false;}});
  const timer=setInterval(()=>void tick(),intervalMs);timer.unref();return()=>{stopped=true;clearInterval(timer);};
}
