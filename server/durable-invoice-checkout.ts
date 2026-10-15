import {randomBytes} from 'node:crypto';
import type {DurablePaymentStorage} from './durable-payment-storage';
import type {ProviderExpectation} from './durable-payment-contract';
import {isSessionId} from './durable-payment-contract';

export interface DurableInvoiceSessionInitiator {
  /** R2 validates transport, session identity and links; approved booleans are
   * not a settlement result. It builds callbacks using this raw state. `not-sent`: the
   * provider provably never took the request, so the attempt is released (B-1). */
  create(expected:Readonly<Omit<ProviderExpectation,'sessionId'>>,rawReturnState:string):Promise<
    {kind:'ready';sessionId:string}|{kind:'unknown'|'unavailable'}|{kind:'not-sent'}>;
}
export type DurableInvoiceCheckoutResult=
  | {kind:'ready';attemptId:string;shareIndex:number;sessionId:string;rawReturnState?:string}
  | {kind:'processing'|'terminal';attemptId:string;shareIndex:number;rawReturnState?:string}
  | {kind:'conflict'|'not-found'|'expired'|'unavailable'|'closed'};

/** Inactive until an actual R2 adapter and public caller migration are reviewed.
 * Unknown acceptance keeps the exact attempt/X-ID live; never resends blindly. */
export class DurableInvoiceCheckout {
  constructor(private readonly repository:DurablePaymentStorage,private readonly provider:DurableInvoiceSessionInitiator,
    private readonly clock=()=>new Date(),private readonly initiationEnabled=()=>false,
    private readonly returnStateForAttempt:((id:string)=>string)|undefined=undefined) {}
  async open(input:Parameters<DurablePaymentStorage['claimInvoice']>[0]):Promise<DurableInvoiceCheckoutResult> {
    if(!this.initiationEnabled()) return {kind:'unavailable'};
    const claim=await this.repository.claimInvoice(input,this.clock());
    if(!('attempt' in claim)) return claim;
    const attempt=claim.attempt;
    const identity={attemptId:attempt.id,shareIndex:attempt.shareIndex};
    if(claim.kind==='terminal') return {kind:'terminal',...identity};
    if(claim.kind==='reused') {
      const binding=await this.repository.getInvoiceSession(attempt.id);
      if(!binding) return {kind:'processing',...identity,rawReturnState:attempt.returnStateHash?this.returnStateForAttempt?.(attempt.id):undefined};
      await this.repository.receive(binding.sessionId,'poll',this.clock());
      if(!await this.repository.aggregatePayable({domain:input.vertical,invoiceId:input.invoiceId}))return {kind:'closed'};
      return {kind:'ready',...identity,sessionId:binding.sessionId,rawReturnState:this.returnStateForAttempt?.(attempt.id)};
    }
    const raw=this.returnStateForAttempt?.(attempt.id)??randomBytes(32).toString('base64url');
    if(!await this.repository.markInvoiceSendStarted(attempt.id,this.clock(),raw)) return {kind:'processing',...identity};
    try {
      const expected={amountCents:attempt.amountCents,currency:attempt.currency,reference:attempt.reference,
        environment:attempt.environment,providerAccount:attempt.providerAccount,processorXId:attempt.processorXId};
      const result=await this.provider.create(Object.freeze(expected),raw);
      if(result.kind==='not-sent')
        return await this.repository.abandonUnsentInvoiceAttempt(attempt.id,this.clock())?{kind:'expired'}:{kind:'processing',...identity,rawReturnState:raw};
      if(result.kind!=='ready' || !isSessionId(result.sessionId)) return {kind:'processing',...identity,rawReturnState:raw};
      const attached=await this.repository.attachInvoiceSession(attempt.id,result.sessionId,raw,this.clock());
      if(attached.kind!=='attached' && attached.kind!=='reused') return {kind:'processing',...identity,rawReturnState:raw};
      await this.repository.receive(result.sessionId,'poll',this.clock());
      if(!await this.repository.aggregatePayable({domain:input.vertical,invoiceId:input.invoiceId}))return {kind:'closed'};
      return {kind:'ready',...identity,sessionId:result.sessionId,rawReturnState:raw};
    } catch {return {kind:'processing',...identity,rawReturnState:raw};}
  }
}
