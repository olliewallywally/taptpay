import type { PaymentAttemptService } from "./payment-attempt-service";
import type { SessionBinding, VerifiedOutcome, InboxClaim, SettlementResult } from "./durable-payment-contract";

/** H-3: records R2-T6's sanitized code on the retail attempt through R2's service. */
export function createRetailReconciliationRecorder(service: PaymentAttemptService) {
  return async (binding: SessionBinding, code: string) =>
    binding.paymentAttemptId ? service.recordReconciliation({ attemptId: binding.paymentAttemptId, code }) : undefined;
}

/** Calls the original retail finalizer; it verifies/fences and appends the outbox
 * inside that finalizer's transaction. Supply a service clock matching the worker. */
export function createRetailReconciliationFinalizer(service: PaymentAttemptService) {
  return async (binding: SessionBinding, evidence: VerifiedOutcome, claim: InboxClaim): Promise<SettlementResult> => {
    if (!binding.paymentAttemptId) return {kind:"conflict"};
    const attempt=await service.getAttempt(binding.paymentAttemptId);
    if (!attempt) return {kind:"not-found"};
    // D2: R2's money columns carry a provider transaction only for an approval, as R2's route
    // stores them; the decline's transaction stays in the binding registry.
    const result=await service.finalize({attemptId:attempt.id,processorSessionId:binding.sessionId,
      processorTransactionId:evidence.outcome==='approved' ? evidence.transactionId : null,paymentMethod:evidence.paymentMethod,
      outcome:evidence.outcome,receiptShare:evidence.outcome==='approved' && attempt.shareIndex>0 ? attempt.shareIndex : null,
      reconciliation:{claim,evidence,expectedProviderAccount:binding.providerAccount}});
    if (result.kind==='conflict') return {kind:result.reason==='lease-lost' ? 'lease-lost' : 'conflict'};
    return result.kind==='not-found' ? {kind:'not-found'} : {kind:result.kind,eventId:result.eventId};
  };
}
