import type { ProviderExpectation, ProviderQueryResult, ReconciliationProvider, ReconciliationRepository,
  ReconciliationError, InboxClaim } from "./durable-payment-contract";
import { isSessionId, isUuid } from "./durable-payment-contract";
import type { MismatchField } from "./windcave-verify";
import { writeSecurityAuditEvent } from "./security-audit-log";

const EVIDENCE_FIELDS: ReadonlyArray<[keyof ProviderExpectation, MismatchField]> = [
  ["sessionId", "session"], ["processorXId", "session"], ["amountCents", "amount"], ["currency", "currency"],
  ["reference", "reference"], ["environment", "environment"], ["providerAccount", "account"],
];

export function evidenceMatchesExpectation(expected: ProviderExpectation, result: ProviderQueryResult): boolean {
  return result?.kind === "verified" && Number.isSafeInteger(result.transactionCount) && result.transactionCount >= 1 &&
    isSessionId(result.transactionId) &&
    Number.isSafeInteger(result.amountCents) && result.amountCents>0 && result.amountCents<=9999999999 &&
    (result.paymentMethod===undefined || (typeof result.paymentMethod==='string' && result.paymentMethod.length>0 && result.paymentMethod.length<=100)) &&
    ["approved", "declined", "cancelled"].includes(result.outcome) &&
    ["sessionId","processorXId","amountCents","currency","reference","environment","providerAccount"].every((key) =>
      expected[key as keyof ProviderExpectation] !== undefined && expected[key as keyof ProviderExpectation] === result[key as keyof ProviderExpectation]);
}

/** The sanitized field a provider mismatch is reported under (R2-T6): never a value. */
function mismatchField(expected: ProviderExpectation, result: ProviderQueryResult): MismatchField | "evidence" {
  if (result?.kind === "mismatch") return result.field;
  if (result?.kind === "verified") {
    for (const [key, field] of EVIDENCE_FIELDS) if (expected[key] !== result[key]) return field;
  }
  // Verified evidence the worker's own re-check refuses for no field (format or count): an adapter fault.
  return "evidence";
}

/** Explicitly invoked by the eventual R2-integrated runtime. No background timer
 * or default provider is created by importing this module. */
export class PaymentReconciliationWorker {
  constructor(private readonly repository: ReconciliationRepository, private readonly provider: ReconciliationProvider,
    private readonly clock = () => new Date(), private readonly random = Math.random,
    private readonly audit: (event: string, details: Record<string, unknown>) => void = writeSecurityAuditEvent) {}

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
        // H-3: R2-T6's signals on the worker path too: one sanitized event and, for a retail
        // attempt, its last reconciliation code. Best effort: neither can turn this into a retry.
        const field = mismatchField(expected, result);
        try { this.audit("PROVIDER_OUTCOME_MISMATCH", { field }); } catch { /* the dead-letter still records it */ }
        await this.repository.recordReconciliation?.(expected, `integrity_mismatch:${field}`, this.clock()).catch(() => undefined);
        await this.repository.finishInbox(claim, { status: "dead_letter", code: "integrity_mismatch" }, this.clock());
        return true;
      }
      const settlement = await this.repository.finalize(expected, result, claim, this.clock());
      if (settlement.kind === "lease-lost") return true;
      if (settlement.kind === "adapter-unavailable") { await this.retry(claim, "provider_unavailable"); return true; }
      if (settlement.kind !== "finalized" && settlement.kind !== "reused") {
        this.signalDeadLetter({ code: "settlement_conflict" });
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

  /** D4: a dead-letter is never silent. Fixed codes only: no session, transaction or provider text. */
  private signalDeadLetter(details: { code: ReconciliationError; cause?: ReconciliationError }) {
    try { this.audit("PAYMENT_RECONCILIATION_DEAD_LETTER", details); } catch { /* the inbox row still records it */ }
  }

  private retry(claim: InboxClaim, code: ReconciliationError): Promise<boolean> {
    const now = this.clock();
    if (claim.attemptCount >= 20 || now.getTime() - claim.firstReceivedAt.getTime() >= 24 * 60 * 60 * 1000) {
      // The row keeps only retry_exhausted; the signal keeps why (outage, ambiguity, unbound session).
      this.signalDeadLetter({ code: "retry_exhausted", cause: code });
      return this.repository.finishInbox(claim, {status:"dead_letter",code:"retry_exhausted"}, now);
    }
    const delay = Math.min(300000, 1000 * 2 ** Math.min(claim.attemptCount - 1, 12));
    const jitter = Math.max(0, Math.min(1, this.random())) * delay * 0.25;
    return this.repository.finishInbox(claim, {status:"retry",code,nextAttemptAt:new Date(now.getTime()+delay+jitter)},now);
  }
}
