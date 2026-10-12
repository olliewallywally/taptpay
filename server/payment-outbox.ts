export interface OutboxClaim {
  id:string;eventId:string;channel:'merchant_payment_update'|'payer_receipt';owner:string;
  attemptCount:number;leaseExpiresAt:Date;
}
export interface PaymentOutboxRepository {
  claimOutbox(owner:string,now:Date):Promise<OutboxClaim|undefined>;
  finishOutbox(claim:OutboxClaim,status:'complete'|'retry'|'dead_letter',now:Date,nextAttemptAt?:Date):Promise<boolean>;
}
/** Receiver MUST atomically deduplicate deliveryKey. Retrying an ordinary email
 * send does not meet that contract and must not be wired here. */
export interface IdempotentPaymentEventReceiver {
  deliver(input:{deliveryKey:string;eventId:string;channel:OutboxClaim['channel']}):Promise<void>;
}
export class PaymentOutboxWorker {
  constructor(private readonly repository:PaymentOutboxRepository,private readonly receiver:IdempotentPaymentEventReceiver,
    private readonly clock=()=>new Date()) {}
  async runOne(owner:string):Promise<boolean> {
    const claim=await this.repository.claimOutbox(owner,this.clock());
    if(!claim) return false;
    try {
      await this.receiver.deliver({deliveryKey:claim.id,eventId:claim.eventId,channel:claim.channel});
      await this.repository.finishOutbox(claim,'complete',this.clock());
    } catch {
      const now=this.clock();
      await this.repository.finishOutbox(claim,claim.attemptCount>=20?'dead_letter':'retry',now,
        new Date(now.getTime()+Math.min(300000,1000*2**Math.min(claim.attemptCount-1,12)))).catch(()=>undefined);
    }
    return true;
  }
}
