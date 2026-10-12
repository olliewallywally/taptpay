import type { ProviderExpectation, ProviderQueryResult, ReconciliationProvider, ReconciliationRepository,
  ReconciliationError, InboxClaim } from "./durable-payment-contract";
import { isSessionId, isUuid } from "./durable-payment-contract";

export function evidenceMatchesExpectation(expected: ProviderExpectation, result: ProviderQueryResult): boolean {
  return result?.kind === "verified" && result.transactionCount === 1 && isSessionId(result.transactionId) &&
    Number.isSafeInteger(result.amountCents) && result.amountCents>0 && result.amountCents<=2147483647 &&
    (result.paymentMethod===undefined || (typeof result.paymentMethod==='string' && result.paymentMethod.length>0 && result.paymentMethod.length<=100)) &&
    ["approved", "declined", "cancelled"].includes(result.outcome) &&
    ["sessionId","processorXId","amountCents","currency","reference","environment","providerAccount"].every((key) =>
      expected[key as keyof ProviderExpectation] !== undefined && expected[key as keyof ProviderExpectation] === result[key as keyof ProviderExpectation]);
}

/** Explicitly invoked by the eventual R2-integrated runtime. No background timer
 * or default provider is created by importing this module. */
export class PaymentReconciliationWorker {
  constructor(private readonly repository: ReconciliationRepository, private readonly provider: ReconciliationProvider,
    private readonly clock = () => new Date(), private readonly random = Math.random) {}

  async runOne(owner: string): Promise<boolean> {
    if (!isUuid(owner)) throw new Error("invalid_worker_owner");
    const claim = await this.repository.claimInbox(owner, this.clock());
    if (!claim) return false;
    try {
      const expected = await this.repository.resolveSession(claim.sessionId);
      if (!expected) { await this.retry(claim, "unbound_session"); return true; }
      const result = await this.provider.query(Object.freeze({ ...expected }));
      if (this.clock() >= claim.leaseExpiresAt) return true;
      if (result.kind === "pending" || result.kind === "unknown" || result.kind === "unavailable") {
        await this.retry(claim, `provider_${result.kind}`); return true;
      }
      if (result.kind !== "verified" || !evidenceMatchesExpectation(expected, result)) {
        await this.repository.finishInbox(claim, { status: "dead_letter", code: "integrity_mismatch" }, this.clock());
        return true;
      }
      const settlement = await this.repository.finalize(expected, result, claim, this.clock());
      if (settlement.kind === "lease-lost") return true;
      if (settlement.kind === "adapter-unavailable") { await this.retry(claim, "provider_unavailable"); return true; }
      if (settlement.kind !== "finalized" && settlement.kind !== "reused") {
        await this.repository.finishInbox(claim, {status:"dead_letter",code:"settlement_conflict",transactionId:result.transactionId}, this.clock());
        return true;
      }
      await this.repository.finishInbox(claim, { status: "complete", transactionId: result.transactionId }, this.clock());
    } catch {
      // Fixed enum only. No provider/database error text or session identity.
      await this.retry(claim, "internal_error").catch(() => undefined);
    }
    return true;
  }

  private retry(claim: InboxClaim, code: ReconciliationError): Promise<boolean> {
    const now = this.clock();
    if (claim.attemptCount >= 20 || now.getTime() - claim.firstReceivedAt.getTime() >= 24 * 60 * 60 * 1000)
      return this.repository.finishInbox(claim, {status:"dead_letter",code:"retry_exhausted"}, now);
    const delay = Math.min(300000, 1000 * 2 ** Math.min(claim.attemptCount - 1, 12));
    const jitter = Math.max(0, Math.min(1, this.random())) * delay * 0.25;
    return this.repository.finishInbox(claim, {status:"retry",code,nextAttemptAt:new Date(now.getTime()+delay+jitter)},now);
  }
}
