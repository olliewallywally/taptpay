import type { PaymentAttemptService,PaymentAttemptRepository } from "./payment-attempt-service";
import type { SessionBinding, VerifiedOutcome, InboxClaim, SettlementResult } from "./durable-payment-contract";

/** Calls the original retail finalizer; it verifies/fences and appends the outbox
 * inside that finalizer's transaction. Supply a service clock matching the worker. */
export function createRetailReconciliationFinalizer(service: PaymentAttemptService) {
  return async (binding: SessionBinding, evidence: VerifiedOutcome, claim: InboxClaim): Promise<SettlementResult> => {
    if (!binding.paymentAttemptId) return {kind:"conflict"};
    const attempt=await service.getAttempt(binding.paymentAttemptId);
    if (!attempt) return {kind:"not-found"};
    const result=await service.finalize({attemptId:attempt.id,processorSessionId:binding.sessionId,
      processorTransactionId:evidence.transactionId,paymentMethod:evidence.paymentMethod,
      outcome:evidence.outcome,receiptShare:evidence.outcome==='approved' && attempt.shareIndex>0 ? attempt.shareIndex : null,
      reconciliation:{claim,evidence}});
    if (result.kind==='conflict') return {kind:result.reason==='lease-lost' ? 'lease-lost' : 'conflict'};
    return result.kind==='not-found' ? {kind:'not-found'} : {kind:result.kind,eventId:result.eventId};
  };
}

/** Preserve the pre-send hash and absolute lifetime through the original
 * attachment method; provider response fields never populate expectations. */
export function createRetailSessionRecoveryAttacher(repository:PaymentAttemptRepository){
  return async(candidate:SessionBinding,now:Date):Promise<boolean>=>{
    if(!candidate.paymentAttemptId)return false;
    const attempt=await repository.getPaymentAttempt(candidate.paymentAttemptId);
    if(!attempt || attempt.state!=='claiming' || !attempt.sendStartedAt || attempt.processorSessionId || attempt.processorXId!==candidate.processorXId)return false;
    const result=await repository.attachPaymentAttemptSessionRecord({attemptId:attempt.id,processorSessionId:candidate.sessionId,
      processorXId:candidate.processorXId,returnStateHash:attempt.returnStateHash,returnStateExpiresAt:attempt.returnStateExpiresAt,now});
    return result.kind==='attached' || result.kind==='reused';
  };
}
