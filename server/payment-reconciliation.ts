import type { ProviderExpectation, ProviderQueryResult, ReconciliationProvider, ReconciliationRepository,
  ReconciliationError, InboxClaim } from "./durable-payment-contract";
import { isSessionId, isUuid } from "./durable-payment-contract";
import {writeSecurityAuditEvent} from './security-audit-log';
import type {MismatchField} from './windcave-verify';

const EVIDENCE_FIELDS:ReadonlyArray<[keyof ProviderExpectation,MismatchField]>=[
  ['sessionId','session'],['processorXId','session'],['amountCents','amount'],['currency','currency'],
  ['reference','reference'],['environment','environment'],['providerAccount','account'],
];

/** H-3: the sanitized field a mismatch is reported under (R2-T6), never a value. */
function mismatchField(expected:ProviderExpectation,result:ProviderQueryResult):MismatchField|'evidence' {
  if(result?.kind==='mismatch')return result.field??'evidence';
  if(result?.kind==='verified')for(const [key,field] of EVIDENCE_FIELDS)if(expected[key]!==result[key])return field;
  // Verified evidence refused for no field (format or count): an adapter fault.
  return 'evidence';
}

export function evidenceMatchesExpectation(expected: ProviderExpectation, result: ProviderQueryResult): boolean {
  return result?.kind === "verified" && Number.isSafeInteger(result.transactionCount) && result.transactionCount>0 && isSessionId(result.transactionId) &&
    Number.isSafeInteger(result.amountCents) && result.amountCents>0 && result.amountCents<=9999999999 &&
    (result.paymentMethod===undefined || (typeof result.paymentMethod==='string' && result.paymentMethod.length>0 && result.paymentMethod.length<=100)) &&
    ["approved", "declined", "cancelled"].includes(result.outcome) &&
    ["sessionId","processorXId","amountCents","currency","reference","environment","providerAccount"].every((key) =>
      expected[key as keyof ProviderExpectation] !== undefined && expected[key as keyof ProviderExpectation] === result[key as keyof ProviderExpectation]);
}

/** Explicitly invoked by the eventual R2-integrated runtime. No background timer
 * or default provider is created by importing this module. */
export class PaymentReconciliationWorker {
  constructor(private readonly repository: ReconciliationRepository, private readonly provider: ReconciliationProvider,
    private readonly clock = () => new Date(), private readonly random = Math.random,
    private readonly separateDomain?:(claim:InboxClaim)=>Promise<boolean>,
    private readonly audit:(action:string,details:Record<string,unknown>)=>unknown=writeSecurityAuditEvent) {}

  async runOne(owner: string, sessionId?:string): Promise<boolean> {
    if (!isUuid(owner)) throw new Error("invalid_worker_owner");
    if(sessionId!==undefined && !isSessionId(sessionId))throw new Error('invalid_worker_session');
    const claim = await this.repository.claimInbox(owner, this.clock(),sessionId);
    if (!claim) return false;
    try {
      // A worker repeatedly losing its query lease must still reach the cap.
      if(claim.attemptCount>20){await this.deadLetter(claim,'retry_exhausted');return true;}
      if(this.separateDomain&&await this.separateDomain(claim))return true;
      let expected = await this.repository.resolveSession(claim.sessionId);
      if(!expected && this.provider.discoverReference && this.repository.findUnboundSessionCandidate && this.repository.attachRecoveredSession){
        const reference=await this.provider.discoverReference(claim.sessionId);
        const candidate=reference?await this.repository.findUnboundSessionCandidate(claim.sessionId,reference):undefined;
        if(candidate){
          const proof=await this.provider.query(Object.freeze({...candidate}));
          if(proof.kind==='verified' && evidenceMatchesExpectation(candidate,proof) &&
            await this.repository.attachRecoveredSession(candidate,proof,this.clock()))expected=await this.repository.resolveSession(claim.sessionId);
          else if(proof.kind==='mismatch' || (proof.kind==='verified' && !evidenceMatchesExpectation(candidate,proof))){
            await this.mismatch(claim,mismatchField(candidate,proof));return true;
          }
        }
      }
      if (!expected) { await this.retry(claim, "unbound_session"); return true; }
      const result = await this.provider.query(Object.freeze({ ...expected }));
      if (this.clock() >= claim.leaseExpiresAt) return true;
      if (result.kind === "pending" || result.kind === "unknown" || result.kind === "unavailable") {
        await this.retry(claim, `provider_${result.kind}`); return true;
      }
      if (result.kind !== "verified" || !evidenceMatchesExpectation(expected, result)) {
        await this.mismatch(claim,mismatchField(expected,result));
        return true;
      }
      const settlement = await this.repository.finalize(expected, result, claim, this.clock());
      if (settlement.kind === "lease-lost") return true;
      if (settlement.kind === "adapter-unavailable") { await this.retry(claim, "provider_unavailable"); return true; }
      if (settlement.kind !== "finalized" && settlement.kind !== "reused") {
        await this.deadLetter(claim,'settlement_conflict',result.transactionId);
        return true;
      }
      await this.repository.finishInbox(claim, { status: "complete", transactionId: result.transactionId }, this.clock());
    } catch {
      // Fixed enum only. No provider/database error text or session identity.
      await this.retry(claim, "internal_error").catch(() => undefined);
    }
    return true;
  }

  /** H-3: R2-T6's signals on the worker path: one sanitized event, and the field on a retail attempt. */
  private async mismatch(claim:InboxClaim,field:MismatchField|'evidence'):Promise<void>{
    try{this.audit('PROVIDER_OUTCOME_MISMATCH',{field});}catch{/* the dead-letter still records it */}
    await this.deadLetter(claim,'integrity_mismatch',undefined,undefined,`integrity_mismatch:${field}`);
  }
  private async deadLetter(claim:InboxClaim,code:ReconciliationError,transactionId?:string,cause?:ReconciliationError,attemptCode?:string):Promise<boolean>{
    const committed=await this.repository.finishInbox(claim,{status:'dead_letter',code,...(transactionId?{transactionId}:{}),...(attemptCode?{attemptCode}:{})},this.clock());
    if(committed)try{this.audit('PAYMENT_RECONCILIATION_DEAD_LETTER',{code,...(cause?{cause}:{})});}catch{/* durable diagnostic remains in the inbox */}
    return committed;
  }
  private retry(claim: InboxClaim, code: ReconciliationError): Promise<boolean> {
    const now = this.clock();
    if (claim.attemptCount >= 20 || now.getTime() - claim.firstReceivedAt.getTime() >= 24 * 60 * 60 * 1000)
      return this.deadLetter(claim,'retry_exhausted',undefined,code);
    const delay = Math.min(300000, 1000 * 2 ** Math.min(claim.attemptCount - 1, 12));
    const jitter = Math.max(0, Math.min(1, this.random())) * delay * 0.25;
    return this.repository.finishInbox(claim, {status:"retry",code,nextAttemptAt:new Date(now.getTime()+delay+jitter)},now);
  }
}
