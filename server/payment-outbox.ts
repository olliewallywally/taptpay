import {randomUUID} from "node:crypto";
import {runWithOperationContext} from "./operation-context";
export interface OutboxClaim {
  id:string;eventId:string;channel:'merchant_payment_update'|'payer_receipt';owner:string;
  attemptCount:number;leaseExpiresAt:Date;
  eventSource?:'provider_settlement'|'transaction_event'|'job_event'|'subscription_event';
}
export interface PaymentOutboxRepository {
  claimOutbox(owner:string,now:Date):Promise<OutboxClaim|undefined>;
  finishOutbox(claim:OutboxClaim,status:'complete'|'retry'|'dead_letter',now:Date,nextAttemptAt?:Date):Promise<boolean>;
}
/** Receiver MUST atomically deduplicate deliveryKey. Retrying an ordinary email
 * send does not meet that contract and must not be wired here. */
export interface IdempotentPaymentEventReceiver {
  deliver(input:{deliveryKey:string;eventId:string;eventSource:'provider_settlement'|'transaction_event'|'job_event'|'subscription_event';channel:OutboxClaim['channel']}):Promise<void>;
}
export class PaymentOutboxWorker {
  constructor(private readonly repository:PaymentOutboxRepository,private readonly receiver:IdempotentPaymentEventReceiver,
    private readonly clock=()=>new Date()) {}
  async runOne(owner:string):Promise<boolean> {
    return runWithOperationContext({jobId:randomUUID()},async()=>{
    const claim=await this.repository.claimOutbox(owner,this.clock());
    if(!claim) return false;
    // Repeated lost delivery leases cannot evade the finite retry budget.
    if(claim.attemptCount>20){await this.repository.finishOutbox(claim,'dead_letter',this.clock());return true;}
    try {
      await this.receiver.deliver({deliveryKey:claim.id,eventId:claim.eventId,eventSource:claim.eventSource??'provider_settlement',channel:claim.channel});
      await this.repository.finishOutbox(claim,'complete',this.clock());
    } catch {
      const now=this.clock();
      await this.repository.finishOutbox(claim,claim.attemptCount>=20?'dead_letter':'retry',now,
        new Date(now.getTime()+Math.min(300000,1000*2**Math.min(claim.attemptCount-1,12)))).catch(()=>undefined);
    }
    return true;

    });
  }
}
