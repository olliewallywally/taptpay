import type {PaymentAttemptService} from './payment-attempt-service';
import type {DurablePaymentStorage} from './durable-payment-storage';
import type {WindcaveClient} from './windcave-client';
import type {WindcaveVerificationContext} from './windcave-verify';
import {createPaymentReturnState} from './payment-token';
import {isSessionId} from './durable-payment-contract';
import {selectSessionLinks,type SessionLinks} from './windcave-links';
import {normalizeSessionQuery} from './windcave-query';

export type RetailCheckoutResult=
  | {kind:'ready';sessionId:string;shareIndex:number;returnState:string;links:SessionLinks}
  | {kind:'processing';shareIndex:number;returnState?:string}
  | {kind:'terminal';shareIndex:number;outcome:'approved'|'declined'|'cancelled';receiptShare:number|null}
  | {kind:'not-found'|'conflict'|'unavailable'|'expired'};

/** One original retail attempt engine for both token and numbered callers.
 * Only the database claim winner sends. A reused/expired unknown command cannot
 * send again, rotate its X-ID, or allocate the next share. */
export class DurableRetailCheckout {
  constructor(private readonly attempts:PaymentAttemptService,private readonly repository:DurablePaymentStorage,
    private readonly client:WindcaveClient,private readonly context:WindcaveVerificationContext,
    private readonly returnSecret:string,private readonly clock=()=>new Date(),private readonly enabled=()=>false){}
  async open(input:{transactionId:number;merchantId:number;shareIndex:number;idempotencyKey:string;customerEmail:string;
    callbacks:(raw:string)=>{callbackBase:string;notificationUrl:string}}):Promise<RetailCheckoutResult> {
    if(!this.enabled() || !this.returnSecret)return {kind:'unavailable'};
    const claim=await this.attempts.claim(input);
    if(claim.kind==='transaction-not-found')return {kind:'not-found'};
    if(claim.kind==='conflict' || claim.kind==='target-conflict')return {kind:'conflict'};
    const attempt=claim.attempt;
    if(claim.kind==='expired'&&attempt.state==='abandoned'&&!attempt.processorSessionId&&!attempt.sendStartedAt)return {kind:'expired'};
    if(['approved','declined','cancelled'].includes(attempt.state))return {kind:'terminal',shareIndex:attempt.shareIndex,
      outcome:attempt.state as 'approved'|'declined'|'cancelled',receiptShare:attempt.receiptShare};
    const raw=createPaymentReturnState(attempt.id,this.returnSecret).rawToken;
    if(claim.kind!=='claimed') {
      if(!attempt.processorSessionId)return {kind:'processing',shareIndex:attempt.shareIndex,returnState:attempt.returnStateHash?raw:undefined};
      const binding=await this.repository.resolveSession(attempt.processorSessionId);
      if(!binding || binding.paymentAttemptId!==attempt.id)return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      await this.repository.receive(binding.sessionId,'poll',this.clock());
      // Validated query links are recoverable after process/cache loss.
      const reply=await this.client.querySession(binding.sessionId);
      const body=reply.kind==='reply' && reply.body && typeof reply.body==='object' ? reply.body as Record<string,unknown> : undefined;
      if(body?.id!==binding.sessionId || normalizeSessionQuery(body,binding.sessionId).kind!=='pending' || !Array.isArray(body.links))
        return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      const linkRows=body.links.filter((link:unknown):link is {rel:string;href:string;method?:string}=>
        !!link && typeof link==='object' && typeof (link as any).rel==='string' && typeof (link as any).href==='string');
      const links=selectSessionLinks(linkRows,this.context.providerEnvironment);
      if(!links.links.hpp && !links.links.ajaxSubmitCard)return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      return {kind:'ready',sessionId:binding.sessionId,shareIndex:attempt.shareIndex,returnState:raw,links:links.links};
    }
    const expected=await this.repository.prepareRetailExpectation({paymentAttemptId:attempt.id,merchantId:input.merchantId,
      currency:'NZD',environment:this.context.providerEnvironment,providerAccount:this.context.accountUsername,rawReturnState:raw},this.clock());
    if(!expected)return {kind:'processing',shareIndex:attempt.shareIndex};
    try {
      const result=await this.client.createSession({xId:expected.processorXId,amount:(expected.amountCents/100).toFixed(2),
        merchantReference:expected.reference,customerEmail:input.customerEmail,...input.callbacks(raw)});
      const candidate=result.kind==='created'?result.sessionId:result.kind==='duplicate' && result.body && typeof result.body==='object'
        ? (result.body as Record<string,unknown>).id : undefined;
      if(!isSessionId(candidate))return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      const attached=await this.attempts.attachSession({attemptId:attempt.id,processorSessionId:candidate,
        processorXId:expected.processorXId,rawReturnState:raw});
      if(attached.kind!=='attached' && attached.kind!=='reused')return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      if(!await this.repository.bindRetailSession({...expected,sessionId:candidate,paymentAttemptId:attempt.id},this.clock()))
        return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      await this.repository.receive(candidate,'poll',this.clock());
      if(result.kind!=='created')return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      if(!result.links.hpp && !result.links.ajaxSubmitCard)return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};
      return {kind:'ready',sessionId:candidate,shareIndex:attempt.shareIndex,returnState:raw,links:result.links};
    }catch {return {kind:'processing',shareIndex:attempt.shareIndex,returnState:raw};}
  }
}
