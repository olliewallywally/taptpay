import { randomUUID } from "node:crypto";
import { hashBearerCredential } from "./payment-credential";
import { invoiceShareCents, requestFingerprint, isSessionId, isUuid, isPostgresConstraintViolationOn, SUPERSESSION_CONSTRAINTS } from "./durable-payment-contract";
import type { AttemptState, ProviderExpectation, SessionBinding, VerifiedOutcome, InboxClaim,
  ReconciliationRepository, ReconciliationError, SettlementResult,SessionRecoveryCandidate } from "./durable-payment-contract";
import { evidenceMatchesExpectation } from "./payment-reconciliation";
import type { OutboxClaim, PaymentOutboxRepository } from "./payment-outbox";
import { payableInvoiceStates } from "./payment-transition-graphs";
import {paymentCommand,type PaymentCommandActor} from './payment-command';

export interface PaymentSqlClient {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(): void;
}
export interface PaymentSqlPool { connect(): Promise<PaymentSqlClient> }
export interface InvoiceAttempt extends Omit<ProviderExpectation, "sessionId"> {
  id: string;
  merchantId: number;
  rentInvoiceId: string | null;
  jobInvoiceId: string | null;
  shareIndex: number;
  idempotencyKey: string;
  requestFingerprint: string;
  state: AttemptState;
  leaseExpiresAt: Date;
  sendStartedAt: Date | null;
  returnStateHash: string | null;
  returnStateExpiresAt: Date | null;
  payerEmail?:string|null;
}
export type InvoiceAttemptClaim = { kind: "claimed" | "reused" | "terminal"; attempt: InvoiceAttempt } |
  { kind: "conflict" | "not-found" | "expired" };
const invoiceTable = (vertical: "property" | "trades") => vertical === "property" ? "invoices_rent_requests" : "job_invoices";
const invoiceColumn = (vertical: "property" | "trades") => vertical === "property" ? "rent_invoice_id" : "job_invoice_id";
const camelRow = <T>(row: any): T => Object.fromEntries(Object.entries(row).map(([key,value]) =>
  [key.replace(/_([a-z])/g, (_,char) => char.toUpperCase()),value])) as T;
const terminal = (state: string) => ["approved","declined","cancelled"].includes(state);

/** Uses standard PostgreSQL transactions, usable with both pg and Neon pools.
 * No ambient connection is imported and no service starts on construction. */
export class DurablePaymentStorage implements ReconciliationRepository, PaymentOutboxRepository {
  constructor(private readonly pool: PaymentSqlPool,
    private readonly retailFinalizer?: (binding: SessionBinding, outcome: VerifiedOutcome, claim: InboxClaim, now: Date) => Promise<SettlementResult>,
    private readonly retailAttacher?:(candidate:SessionRecoveryCandidate,now:Date)=>Promise<boolean>) {}

  private async transaction<T>(work: (client: PaymentSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async claimInvoice(input: { vertical: "property" | "trades"; invoiceId: string; merchantId: number;
    shareIndex: number; idempotencyKey: string; currency: string; environment: "uat" | "production";
    providerAccount: string;payerEmail?:string;reserveShare?:boolean }, now = new Date()): Promise<InvoiceAttemptClaim> {
    if (!["property","trades"].includes(input.vertical) || !isUuid(input.invoiceId) || !isUuid(input.idempotencyKey) ||
        !Number.isSafeInteger(input.merchantId) || input.merchantId < 1 || !Number.isSafeInteger(input.shareIndex) || input.shareIndex < 0 || input.shareIndex>12 ||
        (input.reserveShare!==undefined && typeof input.reserveShare!=='boolean') ||
        !/^[A-Z]{3}$/.test(input.currency) || !["uat","production"].includes(input.environment) ||
        typeof input.providerAccount !== "string" || !input.providerAccount.length || input.providerAccount.length > 200 ||
        (input.payerEmail!==undefined && (typeof input.payerEmail!=='string' || input.payerEmail.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.payerEmail))))
      throw new Error("invalid_invoice_claim");
    return this.transaction(async (client): Promise<InvoiceAttemptClaim> => {
      const table = invoiceTable(input.vertical), column = invoiceColumn(input.vertical);
      const invoice = (await client.query(`SELECT * FROM ${table} WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,
        [input.invoiceId,input.merchantId])).rows[0];
      if (!invoice) return {kind:"not-found"};
      const isSplit = invoice.split_enabled && invoice.split_count > 1;
      const attempts=(await client.query(`SELECT * FROM invoice_payment_attempts WHERE ${column}=$1 FOR UPDATE`,[input.invoiceId])).rows;
      const matching=attempts.filter(attempt=>attempt.idempotency_key===input.idempotencyKey);
      if(matching.length>1)return {kind:'conflict'};
      const same=matching[0];
      let shareIndex=input.shareIndex;
      if(input.reserveShare){
        if(same)shareIndex=same.share_index;
        else if(isSplit){
          const available=Array.from({length:invoice.split_count},(_,index)=>index+1).find(share=>!attempts.some(attempt=>
            attempt.share_index===share && (attempt.state==='approved' ||
              (['claiming','ready','finalizing'].includes(attempt.state) &&
                !(attempt.state==='claiming' && !attempt.send_started_at && attempt.lease_expires_at<=now)))));
          if(available===undefined)return {kind:'conflict'};shareIndex=available;
        }else shareIndex=0;
      }
      if((same && same.share_index!==shareIndex) || (!isSplit && shareIndex!==0) ||
        (isSplit && (shareIndex<1 || shareIndex>invoice.split_count)))return {kind:'conflict'};
      const amountCents = isSplit ? invoiceShareCents(invoice.amount_cents,invoice.split_count,shareIndex) : invoice.amount_cents;
      const attemptId=randomUUID();
      const reference=same?.reference??`IP_${attemptId}`;
      const fingerprint = requestFingerprint({ ...input,reserveShare:input.reserveShare?true:undefined,shareIndex, amountCents, reference });
      if (same) {
        if (same.request_fingerprint !== fingerprint) return {kind:"conflict"};
        if (same.state === "abandoned") return {kind:same.send_started_at && (await client.query(
          'SELECT 1 FROM payment_session_bindings WHERE invoice_attempt_id=$1',[same.id])).rows.length?'conflict':'expired'};
        if(same.state==='claiming' && !same.send_started_at && same.lease_expires_at<=now) {
          await client.query("UPDATE invoice_payment_attempts SET state='abandoned',updated_at=$2 WHERE id=$1",[same.id,now]);
          return {kind:'expired'};
        }
        return {kind:terminal(same.state) ? "terminal" : "reused",attempt:camelRow(same)};
      }
      if (!(payableInvoiceStates as readonly string[]).includes(invoice.status)) return {kind:"conflict"};
      // Historical paid shares cannot be safely assigned a new share identity.
      // Active route migration must first reconstruct those exact bindings.
      const approved = (await client.query(`SELECT share_index FROM invoice_payment_attempts WHERE ${column}=$1 AND state='approved'`,[input.invoiceId])).rows;
      if ((invoice.split_paid_count ?? 0) !== approved.length || approved.some((row) => row.share_index === shareIndex)) return {kind:"conflict"};
      if(invoice.windcave_session_id || (invoice.windcave_transaction_id && !approved.length) ||
        (await client.query(`SELECT 1 FROM invoice_split_sessions WHERE ${column}=$1 LIMIT 1`,[invoice.id])).rows.length)return {kind:'conflict'};
      const live = (await client.query(`SELECT * FROM invoice_payment_attempts WHERE ${column}=$1 AND share_index=$2 AND state IN ('claiming','ready','finalizing') FOR UPDATE`,
        [input.invoiceId,shareIndex])).rows[0];
      if (live) {
        if (live.state !== "claiming" || live.send_started_at || live.lease_expires_at > now) return {kind:"conflict"};
        await client.query("UPDATE invoice_payment_attempts SET state='abandoned',updated_at=$2 WHERE id=$1",[live.id,now]);
      }
      const row = (await client.query(`INSERT INTO invoice_payment_attempts(id,merchant_id,${column},share_index,amount_cents,
        idempotency_key,request_fingerprint,processor_x_id,currency,reference,environment,provider_account,lease_expires_at,created_at,updated_at,payer_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15) RETURNING *`,
        [attemptId,input.merchantId,input.invoiceId,shareIndex,amountCents,input.idempotencyKey,fingerprint,
          attemptId.replace(/-/g,'').slice(0,16),input.currency,reference,input.environment,input.providerAccount,new Date(now.getTime()+300000),now,input.payerEmail??null])).rows[0];
      return {kind:"claimed",attempt:camelRow(row)};
    });
  }

  async attachInvoiceSession(attemptId: string, sessionId: string, returnState: string, now = new Date()): Promise<{kind:"attached"|"reused"|"conflict"|"expired"|"not-found"}> {
    if (!isUuid(attemptId) || !isSessionId(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(returnState)) throw new Error("invalid_session_attachment");
    return this.transaction(async (client) => {
      const locator=(await client.query('SELECT rent_invoice_id,job_invoice_id,merchant_id FROM invoice_payment_attempts WHERE id=$1',[attemptId])).rows[0];
      if(!locator)return {kind:'not-found'};
      const table=locator.rent_invoice_id?'invoices_rent_requests':'job_invoices';
      const parent=(await client.query(`SELECT id FROM ${table} WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,[locator.rent_invoice_id??locator.job_invoice_id,locator.merchant_id])).rows[0];
      if(!parent)return {kind:'not-found'};
      const attempt = (await client.query("SELECT * FROM invoice_payment_attempts WHERE id=$1 FOR UPDATE",[attemptId])).rows[0];
      if (!attempt) return {kind:"not-found"};
      const binding = (await client.query("SELECT * FROM payment_session_bindings WHERE invoice_attempt_id=$1",[attemptId])).rows[0];
      const hash=hashBearerCredential(returnState);
      if (binding) return {kind:binding.session_id===sessionId && attempt.return_state_hash===hash ? "reused" : "conflict"};
      if (attempt.state !== "claiming") return {kind:"conflict"};
      if (attempt.lease_expires_at <= now && !attempt.send_started_at) return {kind:"expired"};
      const inserted = await client.query(`INSERT INTO payment_session_bindings(session_id,processor_x_id,invoice_attempt_id,created_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING session_id`,[sessionId,attempt.processor_x_id,attemptId,now]);
      if (!inserted.rows.length) return {kind:"conflict"};
      // Use creation time for the schema's absolute return-state lifetime.
      const expiry=new Date(attempt.created_at.getTime()+1800000);
      await client.query("UPDATE invoice_payment_attempts SET state='ready',return_state_hash=$2,return_state_expires_at=$3,updated_at=$4 WHERE id=$1",
        [attemptId,hash,expiry,now]);
      return {kind:"attached"};
    });
  }

  async resolveInvoiceReturnState(raw: string, now = new Date()): Promise<{kind:"valid";sessionId?:string;attempt:InvoiceAttempt}|{kind:"not-found"|"expired"}> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return {kind:"not-found"};
    return this.transaction(async(client)=>{
      const row=(await client.query(`SELECT a.*,b.session_id FROM invoice_payment_attempts a
        LEFT JOIN payment_session_bindings b ON b.invoice_attempt_id=a.id WHERE a.return_state_hash=$1`,[hashBearerCredential(raw)])).rows[0];
      if (!row) return {kind:"not-found"};
      if (row.return_state_expires_at <= now) return {kind:"expired"};
      return {kind:"valid",sessionId:row.session_id,attempt:camelRow(row)};
    });
  }

  async getInvoiceAttemptByKey(input:{vertical:'property'|'trades';invoiceId:string;merchantId:number;shareIndex:number;idempotencyKey:string}):Promise<InvoiceAttempt|undefined> {
    if(!['property','trades'].includes(input.vertical)||!isUuid(input.invoiceId)||!isUuid(input.idempotencyKey)||!Number.isSafeInteger(input.shareIndex)||input.shareIndex<0||!Number.isSafeInteger(input.merchantId))return undefined;
    return this.transaction(async client=>{
      const row=(await client.query(`SELECT * FROM invoice_payment_attempts WHERE ${invoiceColumn(input.vertical)}=$1 AND merchant_id=$2 AND share_index=$3 AND idempotency_key=$4`,
        [input.invoiceId,input.merchantId,input.shareIndex,input.idempotencyKey])).rows[0];
      return row?camelRow<InvoiceAttempt>(row):undefined;
    });
  }

  async getInvoiceSession(attemptId:string):Promise<SessionBinding|undefined> {
    if(!isUuid(attemptId)) return undefined;
    const session=await this.transaction(async(client)=>(await client.query('SELECT session_id FROM payment_session_bindings WHERE invoice_attempt_id=$1',[attemptId])).rows[0]?.session_id);
    return session ? this.resolveSession(session) : undefined;
  }

  async claimWalletSubmission(sessionId:string,now=new Date()):Promise<boolean> {
    if(!isSessionId(sessionId))throw new Error('invalid_wallet_session');
    return this.transaction(async client=>{
      const binding=(await client.query('SELECT * FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows[0];if(!binding)return false;
      let attempt:any;
      if(binding.payment_attempt_id){
        const locator=(await client.query('SELECT transaction_id FROM payment_attempts WHERE id=$1',[binding.payment_attempt_id])).rows[0];if(!locator)return false;
        // Integration fix: TaptPay never sends a wallet charge for a sale that is no longer open.
        // A payment already at Windcave is still found by the reconcile that follows.
        const sale=(await client.query('SELECT status FROM transactions WHERE id=$1 FOR UPDATE',[locator.transaction_id])).rows[0];
        if(!sale || !['pending','processing','failed'].includes(sale.status))return false;
        attempt=(await client.query('SELECT state FROM payment_attempts WHERE id=$1 FOR UPDATE',[binding.payment_attempt_id])).rows[0];
      }else{
        const locator=(await client.query('SELECT rent_invoice_id,job_invoice_id FROM invoice_payment_attempts WHERE id=$1',[binding.invoice_attempt_id])).rows[0];if(!locator)return false;
        // Integration fix: nor for a voided invoice or one already paid by card or another way.
        const invoice=(await client.query(`SELECT status FROM ${invoiceTable(locator.rent_invoice_id?'property':'trades')} WHERE id=$1 FOR UPDATE`,[locator.rent_invoice_id??locator.job_invoice_id])).rows[0];
        if(!invoice || ['paid','paid_external','voided'].includes(invoice.status))return false;
        attempt=(await client.query('SELECT state FROM invoice_payment_attempts WHERE id=$1 FOR UPDATE',[binding.invoice_attempt_id])).rows[0];
      }
      if(attempt?.state!=='ready')return false;
      return !!(await client.query(`INSERT INTO payment_wallet_submissions(session_id,payment_method,send_started_at)
        VALUES ($1,'google_pay',$2) ON CONFLICT DO NOTHING RETURNING session_id`,[sessionId,now])).rows.length;
    });
  }

  /** Read only persisted, tenant-owned sessions. Provider queries are performed
   * by the caller after this statement, never inside an aggregate transaction. */
  async pendingSessionsForMerchant(input:{domain:'retail'|'property'|'trades';aggregateId:number|string;merchantId:number}):Promise<string[]> {
    if(!['retail','property','trades'].includes(input.domain) || !Number.isSafeInteger(input.merchantId) || input.merchantId<1 ||
      (input.domain==='retail'? !Number.isSafeInteger(input.aggregateId) || Number(input.aggregateId)<1 : !isUuid(input.aggregateId)))throw new Error('invalid_payment_target');
    return this.transaction(async client=>{
      const retail=input.domain==='retail',table=retail?'transactions':invoiceTable(input.domain as 'property'|'trades');
      const attempts=retail?'payment_attempts':'invoice_payment_attempts',column=retail?'transaction_id':invoiceColumn(input.domain as 'property'|'trades');
      const session=retail?'a.processor_session_id':'b.session_id';
      const query=(states:string,extra='')=>client.query(`SELECT DISTINCT ${session} AS session_id FROM ${table} p JOIN ${attempts} a ON a.${column}=p.id
        ${retail?'':'JOIN payment_session_bindings b ON b.invoice_attempt_id=a.id'}
        WHERE p.id=$1 AND p.merchant_id=$2 AND a.state IN (${states}) AND ${session} IS NOT NULL ${extra}
        ORDER BY session_id LIMIT 13`,[input.aggregateId,input.merchantId]);
      // C7: every live session first; then sessions whose only settlement is a decline (T-3 rule 3),
      // in which a later card could still have been approved.
      const live=(await query(`'claiming','ready','finalizing'`)).rows.map(row=>row.session_id);
      const declined=(await query(`'declined'`,`AND NOT EXISTS(SELECT 1 FROM payment_settlement_events e WHERE e.session_id=${session} AND e.outcome<>'declined')`))
        .rows.map(row=>row.session_id).filter(id=>!live.includes(id));
      return [...live,...declined];
    });
  }

  async changeInvoice(input:{vertical:'property'|'trades';invoiceId:string;merchantId:number;
    action:'void'|'manualPaid'|'split';splitCount?:number;reference?:string;actor?:PaymentCommandActor},now=new Date()):Promise<{kind:'claimed'|'terminal'|'conflict'|'not-found'}> {
    if(!['property','trades'].includes(input.vertical) || !isUuid(input.invoiceId) || !Number.isSafeInteger(input.merchantId) || input.merchantId<1 ||
      !['void','manualPaid','split'].includes(input.action)) throw new Error('invalid_invoice_change');
    if(input.action==='split' && (!Number.isSafeInteger(input.splitCount) || input.splitCount!<2 || input.splitCount!>12)) throw new Error('invalid_split');
    if(input.reference!==undefined && (typeof input.reference!=='string' || input.reference.length>200)) throw new Error('invalid_reference');
    return this.transaction(async(client)=>{
      const table=invoiceTable(input.vertical),column=invoiceColumn(input.vertical);
      const invoice=(await client.query(`SELECT * FROM ${table} WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,[input.invoiceId,input.merchantId])).rows[0];
      if(!invoice) return {kind:'not-found'};
      const target=input.action==='void' ? 'voided' : input.action==='manualPaid' ? 'paid_external' : null;
      const command=input.action==='split'?undefined:paymentCommand({domain:input.vertical,merchantId:input.merchantId,
        aggregateId:invoice.id,action:input.action,reference:input.reference},input.actor);
      if(target && invoice.status===target) {
        const prior=(await client.query(`SELECT payload FROM ${input.vertical==='property'?'transaction_events':'job_events'} WHERE id=$1 AND merchant_id=$2`,[command!.id,input.merchantId])).rows[0];
        return {kind:prior?.payload?.requestFingerprint===command!.fingerprint?'terminal':'conflict'};
      }
      if(input.action==='split' && invoice.split_enabled && invoice.split_count===input.splitCount) return {kind:'terminal'};
      if(!(payableInvoiceStates as readonly string[]).includes(invoice.status)) return {kind:'conflict'};
      const attempts=(await client.query(`SELECT a.state,a.send_started_at,EXISTS(SELECT 1 FROM payment_session_bindings b WHERE b.invoice_attempt_id=a.id) AS attached
        FROM invoice_payment_attempts a WHERE ${column}=$1 FOR UPDATE OF a`,[invoice.id])).rows;
      if(attempts.some(a=>a.state==='approved') || invoice.split_paid_count>0 || (invoice.split_paid_sessions?.length??0)>0) return {kind:'conflict'};
      if(input.action==='split' && (attempts.some(a=>['claiming','ready','finalizing'].includes(a.state) || (a.send_started_at && a.state!=='abandoned') || a.attached) || invoice.windcave_session_id ||
        (await client.query(`SELECT 1 FROM invoice_split_sessions WHERE ${column}=$1 LIMIT 1`,[invoice.id])).rows.length)) return {kind:'conflict'};
      if(input.action==='split') {
        if(!invoice.split_enabled || invoice.amount_cents<input.splitCount!) return {kind:'conflict'};
        await client.query(`UPDATE ${table} SET split_count=$2,updated_at=$3 WHERE id=$1`,[invoice.id,input.splitCount,now]);
      } else await client.query(`UPDATE ${table} SET status=$2,updated_at=$3,paid_at=CASE WHEN $2='paid_external' THEN $3 ELSE paid_at END,
        voided_at=CASE WHEN $2='voided' THEN $3 ELSE voided_at END,external_payment_reference=CASE WHEN $2='paid_external' THEN $4 ELSE external_payment_reference END WHERE id=$1`,
        [invoice.id,target,now,input.reference??null]);
      const event=input.action==='manualPaid'?'manual_payment_recorded':input.action==='void'?'invoice_voided':'split_configured';
      const payload=JSON.stringify(command?.payload??{action:input.action,splitCount:input.splitCount,actor:input.actor??{service:'public_checkout'}});
      const eventId=command?.id??randomUUID();
      if(input.vertical==='property') await client.query(`INSERT INTO transaction_events(id,merchant_id,tenant_profile_id,invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,[eventId,input.merchantId,invoice.tenant_profile_id,invoice.id,event,payload,now]);
      else await client.query(`INSERT INTO job_events(id,merchant_id,client_profile_id,job_invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,[eventId,input.merchantId,invoice.client_profile_id,invoice.id,event,payload,now]);
      const source=input.vertical==='property'?'transaction_event_id':'job_event_id';
      await client.query(`INSERT INTO payment_delivery_outbox(${source},channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2)`,[eventId,now]);
      if(input.action==='manualPaid')await client.query(`INSERT INTO payment_delivery_outbox(${source},channel,next_attempt_at) VALUES ($1,'payer_receipt',$2)`,[eventId,now]);
      return {kind:'claimed'};
    });
  }

  async bindRetailSession(input: ProviderExpectation & { paymentAttemptId: string }, now = new Date()): Promise<boolean> {
    if (!isUuid(input.paymentAttemptId) || !isSessionId(input.sessionId)) throw new Error("invalid_retail_binding");
    return this.transaction(async(client)=>{
      const locator=(await client.query('SELECT transaction_id FROM payment_attempts WHERE id=$1',[input.paymentAttemptId])).rows[0];
      if(!locator)return false;
      await client.query('SELECT id FROM transactions WHERE id=$1 FOR UPDATE',[locator.transaction_id]);
      const row=(await client.query(`SELECT a.*,a.expected_amount_cents AS amount_cents,a.expected_currency AS currency,
        a.expected_merchant_reference AS reference,a.provider_environment AS environment,a.expected_provider_account AS provider_account
        FROM payment_attempts a
        WHERE a.id=$1 FOR UPDATE OF a`,[input.paymentAttemptId])).rows[0];
      if(row && row.amount_cents!==null) row.amount_cents=Number(row.amount_cents);
      if (!row || row.processor_session_id!==input.sessionId || row.processor_x_id!==input.processorXId ||
        !evidenceMatchesExpectation({...camelRow<ProviderExpectation>(row),sessionId:row.processor_session_id,processorXId:row.processor_x_id},
          {...input,kind:"verified",outcome:"approved",transactionId:"binding-check",transactionCount:1})) return false;
      await client.query(`INSERT INTO payment_session_bindings(session_id,processor_x_id,payment_attempt_id,created_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[input.sessionId,input.processorXId,input.paymentAttemptId,now]);
      const binding=(await client.query("SELECT * FROM payment_session_bindings WHERE session_id=$1",[input.sessionId])).rows[0];
      return binding?.payment_attempt_id===input.paymentAttemptId;
    });
  }

  /** Commit before R2 create-session. Possible acceptance keeps the attempt
   * live after expiry; recover the same X-ID rather than starting a new charge. */
  async markInvoiceSendStarted(attemptId:string,now=new Date(),rawReturnState?:string):Promise<boolean> {
    if(!isUuid(attemptId)) throw new Error('invalid_attempt');
    if(rawReturnState!==undefined && !/^[A-Za-z0-9_-]{43}$/.test(rawReturnState))throw new Error('invalid_return_state');
    return this.transaction(async(client)=>{
      const row=(await client.query(`UPDATE invoice_payment_attempts SET send_started_at=COALESCE(send_started_at,$2::timestamptz),updated_at=$2::timestamptz,
        return_state_hash=COALESCE(return_state_hash,$3),return_state_expires_at=CASE WHEN $3::text IS NULL THEN return_state_expires_at
          ELSE COALESCE(return_state_expires_at,created_at+interval '30 minutes') END
        WHERE id=$1 AND state='claiming' AND (send_started_at IS NOT NULL OR lease_expires_at>$2) RETURNING id`,
        [attemptId,now,rawReturnState===undefined?null:hashBearerCredential(rawReturnState)])).rows[0];
      return !!row;
    });
  }

  /** R3 integration: whether a session's links may still be served. A sale cancelled, or an invoice
   * closed, while its session was being created keeps that session bound (a payment that reaches it
   * is still recorded), but no payer is sent to it. */
  async aggregatePayable(input:{domain:'retail';transactionId:number}|{domain:'property'|'trades';invoiceId:string}):Promise<boolean> {
    if(input.domain==='retail'){
      if(!Number.isSafeInteger(input.transactionId))return false;
      const sale=await this.transaction(async client=>(await client.query('SELECT status FROM transactions WHERE id=$1',[input.transactionId])).rows[0]);
      return !!sale && ['pending','processing','failed'].includes(sale.status);
    }
    if(!isUuid(input.invoiceId))return false;
    const invoice=await this.transaction(async client=>(await client.query(`SELECT status FROM ${invoiceTable(input.domain)} WHERE id=$1`,[input.invoiceId])).rows[0]);
    return !!invoice && (payableInvoiceStates as readonly string[]).includes(invoice.status);
  }

  /** R3 integration B-1: releases an attempt whose session request the provider provably never
   * took. Its send intent stays (it is write-once); an abandoned attempt with no session is
   * the only shape this produces, and the claim and split guards read it as unsent. */
  async abandonUnsentRetailAttempt(attemptId:string,now=new Date()):Promise<boolean> {
    if(!isUuid(attemptId))return false;
    return this.transaction(async(client)=>(await client.query(`UPDATE payment_attempts SET state='abandoned',updated_at=$2
      WHERE id=$1 AND state='claiming' AND processor_session_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM payment_session_bindings b WHERE b.payment_attempt_id=$1) RETURNING id`,[attemptId,now])).rows.length===1);
  }

  async abandonUnsentInvoiceAttempt(attemptId:string,now=new Date()):Promise<boolean> {
    if(!isUuid(attemptId))return false;
    return this.transaction(async(client)=>(await client.query(`UPDATE invoice_payment_attempts SET state='abandoned',updated_at=$2
      WHERE id=$1 AND state='claiming'
        AND NOT EXISTS(SELECT 1 FROM payment_session_bindings b WHERE b.invoice_attempt_id=$1) RETURNING id`,[attemptId,now])).rows.length===1);
  }

  async prepareRetailExpectation(input: {paymentAttemptId:string;merchantId:number;currency:string;
    environment:"uat"|"production";providerAccount:string;rawReturnState?:string}, now=new Date()): Promise<Omit<ProviderExpectation,"sessionId">|undefined> {
    if(!isUuid(input.paymentAttemptId) || !Number.isSafeInteger(input.merchantId) || input.merchantId<1 ||
      !/^[A-Z]{3}$/.test(input.currency) || !['uat','production'].includes(input.environment) ||
      typeof input.providerAccount!=='string' || !input.providerAccount.length || input.providerAccount.length>200 ||
      (input.rawReturnState!==undefined && !/^[A-Za-z0-9_-]{43}$/.test(input.rawReturnState))) throw new Error('invalid_retail_expectation');
    return this.transaction(async(client)=>{
      const locator=(await client.query('SELECT transaction_id FROM payment_attempts WHERE id=$1',[input.paymentAttemptId])).rows[0];
      if(!locator) return undefined;
      const parent=(await client.query('SELECT * FROM transactions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
        [locator.transaction_id,input.merchantId])).rows[0];
      if(!parent) return undefined;
      // Integration fix: a claim made just before the merchant's cancel never becomes a session.
      if(!['pending','processing','failed'].includes(parent.status)) return undefined;
      const attempt=(await client.query('SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE',[input.paymentAttemptId])).rows[0];
      if(!attempt || attempt.transaction_id!==parent.id) return undefined;
      const share=attempt.share_index>0 ? (await client.query('SELECT * FROM split_payments WHERE transaction_id=$1 AND split_index=$2 FOR UPDATE',
        [parent.id,attempt.share_index])).rows[0] : undefined;
      if(attempt.share_index>0 ? !parent.is_split || !share : parent.is_split) return undefined;
      const decimal=String(share?.amount??parent.price);
      if(!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return undefined;
      const [whole,fraction='']=decimal.split('.');
      const amountCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
      if(!Number.isSafeInteger(amountCents) || amountCents<1 || amountCents>9999999999) return undefined;
      const expected={amountCents,currency:input.currency,reference:attempt.expected_merchant_reference??`TAPT_${attempt.id}`,
        environment:input.environment,providerAccount:input.providerAccount,processorXId:attempt.processor_x_id??attempt.id.replace(/-/g,'').slice(0,16)};
      const {rawReturnState:raw,...identityInput}=input;
      const fingerprint=requestFingerprint({...identityInput,...expected,transactionId:parent.id,shareIndex:attempt.share_index});
      if(attempt.request_fingerprint) return attempt.request_fingerprint===fingerprint ? expected : undefined;
      if(attempt.expected_amount_cents!==null && (Number(attempt.expected_amount_cents)!==amountCents ||
        attempt.expected_currency!==input.currency || attempt.expected_merchant_reference!==expected.reference || attempt.provider_environment!==input.environment)) return undefined;
      // Never infer historical expectations after session attachment.
      if(attempt.state!=='claiming' || attempt.processor_session_id || attempt.lease_expires_at<=now) return undefined;
      await client.query(`UPDATE payment_attempts SET expected_amount_cents=$2,expected_currency=$3,
        expected_merchant_reference=$4,provider_environment=$5,expected_provider_account=$6,
        request_fingerprint=$7,processor_x_id=$8,send_started_at=$9::timestamptz,updated_at=$9::timestamptz,
        return_state_hash=COALESCE(return_state_hash,$10),return_state_expires_at=COALESCE(return_state_expires_at,$11::timestamptz) WHERE id=$1`,
        [attempt.id,amountCents,input.currency,expected.reference,input.environment,input.providerAccount,fingerprint,expected.processorXId,now,
          raw===undefined?null:hashBearerCredential(raw),raw===undefined?null:new Date(attempt.created_at.getTime()+1800000)]);
      return expected;
    });
  }

  async receive(sessionId: string, kind: "fprn"|"browser"|"poll", now = new Date()): Promise<string> {
    const REOPENS=`((payment_notification_inbox.status='dead_letter' AND payment_notification_inbox.last_error_code IN
        ('retry_exhausted','unbound_session','provider_pending','provider_unknown','provider_unavailable','internal_error'))
      OR (payment_notification_inbox.status='complete' AND (payment_notification_inbox.completed_at<EXCLUDED.first_received_at-interval '1 minute'
        -- T-3 interim: a session whose only settlement is a decline is always looked at again.
        OR (EXISTS(SELECT 1 FROM payment_settlement_events e WHERE e.session_id=EXCLUDED.session_id)
          AND NOT EXISTS(SELECT 1 FROM payment_settlement_events e WHERE e.session_id=EXCLUDED.session_id AND e.outcome<>'declined')))))`;
    if (!isSessionId(sessionId) || !["fprn","browser","poll"].includes(kind)) throw new Error("invalid_notification");
    return this.transaction(async(client)=>{
      const row=(await client.query(`INSERT INTO payment_notification_inbox(provider,kind,session_id,first_received_at,last_received_at,next_attempt_at)
        VALUES ('windcave',$1,$2,$3,$3,$3) ON CONFLICT(provider,kind,session_id)
        DO UPDATE SET arrival_count=payment_notification_inbox.arrival_count+1,
          last_received_at=GREATEST(payment_notification_inbox.last_received_at,EXCLUDED.last_received_at),
          -- Integration fix: a poll (a merchant command or the payer's page asking now) brings a
          -- backed-off receipt forward, so "ask Windcave first" really asks. Finished rows stay finished.
          -- D1 (R3 integration): a new arrival reopens a receipt that gave up for a transient reason, or one
          -- finished over a minute ago (a later card in the same session). One held for review stays closed.
          status=CASE WHEN ${REOPENS} THEN 'pending' ELSE payment_notification_inbox.status END,
          attempt_count=CASE WHEN ${REOPENS} THEN 0 ELSE payment_notification_inbox.attempt_count END,
          first_received_at=CASE WHEN ${REOPENS} THEN EXCLUDED.first_received_at ELSE payment_notification_inbox.first_received_at END,
          completed_at=CASE WHEN ${REOPENS} THEN NULL ELSE payment_notification_inbox.completed_at END,
          next_attempt_at=CASE WHEN ${REOPENS} THEN EXCLUDED.next_attempt_at
            WHEN EXCLUDED.kind='poll' AND payment_notification_inbox.status IN ('pending','retry')
            THEN LEAST(payment_notification_inbox.next_attempt_at,EXCLUDED.next_attempt_at) ELSE payment_notification_inbox.next_attempt_at END
          RETURNING id`,[kind,sessionId,now])).rows[0];
      return row.id;
    });
  }

  async claimInbox(owner: string, now: Date, sessionId?:string): Promise<InboxClaim|undefined> {
    if (!isUuid(owner)) throw new Error("invalid_worker_owner");
    if(sessionId!==undefined && !isSessionId(sessionId)) throw new Error('invalid_worker_session');
    return this.transaction(async(client)=>{
      const row=(await client.query(`WITH due AS (SELECT id FROM payment_notification_inbox
        WHERE ($3::text IS NULL OR session_id=$3) AND
          ((status IN ('pending','retry') AND next_attempt_at<=$1) OR (status='processing' AND lease_expires_at<=$1))
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE payment_notification_inbox i SET status='processing',lease_owner=$2,lease_started_at=$1,
          lease_expires_at=$1::timestamptz+interval '1 minute',attempt_count=attempt_count+1
        FROM due WHERE i.id=due.id RETURNING i.*`,[now,owner,sessionId??null])).rows[0];
      return row ? {id:row.id,sessionId:row.session_id,owner,attemptCount:row.attempt_count,
        firstReceivedAt:row.first_received_at,leaseExpiresAt:row.lease_expires_at} : undefined;
    });
  }

  async resolveSession(sessionId: string): Promise<SessionBinding|undefined> {
    if (!isSessionId(sessionId)) return undefined;
    return this.transaction(async(client)=>{
      // Recover a crash between the original retail engine's durable attachment
      // and registry insertion. Only an independently persisted expectation and
      // that engine's exact session/X-ID can create the binding.
      const existing=(await client.query('SELECT session_id FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows[0];
      if(!existing) {
        const locator=(await client.query('SELECT id,transaction_id FROM payment_attempts WHERE processor_session_id=$1',[sessionId])).rows[0];
        if(locator){
          await client.query('SELECT id FROM transactions WHERE id=$1 FOR UPDATE',[locator.transaction_id]);
          await client.query('SELECT id FROM payment_attempts WHERE id=$1 FOR UPDATE',[locator.id]);
        }
        await client.query(`INSERT INTO payment_session_bindings(session_id,processor_x_id,payment_attempt_id)
        SELECT r.processor_session_id,r.processor_x_id,r.id FROM payment_attempts r
        WHERE r.processor_session_id=$1 AND r.expected_provider_account IS NOT NULL AND r.request_fingerprint IS NOT NULL
          AND r.processor_x_id IS NOT NULL ON CONFLICT DO NOTHING`,[sessionId]);
      }
      const row=(await client.query(`SELECT b.session_id,b.processor_x_id,b.invoice_attempt_id,b.payment_attempt_id,
        COALESCE(a.amount_cents,r.expected_amount_cents) AS amount_cents,COALESCE(a.currency,r.expected_currency) AS currency,
        COALESCE(a.reference,r.expected_merchant_reference) AS reference,COALESCE(a.environment,r.provider_environment) AS environment,
        COALESCE(a.provider_account,r.expected_provider_account) AS provider_account
        FROM payment_session_bindings b LEFT JOIN invoice_payment_attempts a ON a.id=b.invoice_attempt_id AND a.processor_x_id=b.processor_x_id
        LEFT JOIN payment_attempts r ON r.id=b.payment_attempt_id AND r.processor_session_id=b.session_id AND r.processor_x_id=b.processor_x_id
        WHERE b.session_id=$1`,[sessionId])).rows[0];
      if(row && row.amount_cents!==null) row.amount_cents=Number(row.amount_cents);
      if (!row || row.amount_cents===null) return undefined;
      if (row.invoice_attempt_id) delete row.payment_attempt_id; else delete row.invoice_attempt_id;
      return camelRow(row);
    });
  }

  async findUnboundSessionCandidate(sessionId:string,reference:string):Promise<SessionRecoveryCandidate|undefined> {
    if(!isSessionId(sessionId) || !/^(TAPT_|IP_)[0-9a-f-]{36}$/i.test(reference))return undefined;
    return this.transaction(async client=>{
      const retail=reference.startsWith('TAPT_');
      const rows=retail?(await client.query(`SELECT id AS payment_attempt_id,processor_x_id,expected_amount_cents AS amount_cents,
        expected_currency AS currency,expected_merchant_reference AS reference,provider_environment AS environment,expected_provider_account AS provider_account
        FROM payment_attempts WHERE expected_merchant_reference=$1 AND state='claiming' AND send_started_at IS NOT NULL
          AND request_fingerprint IS NOT NULL AND expected_provider_account IS NOT NULL AND processor_session_id IS NULL`,[reference])).rows:
        (await client.query(`SELECT a.id AS invoice_attempt_id,a.processor_x_id,a.amount_cents,a.currency,a.reference,a.environment,a.provider_account
        FROM invoice_payment_attempts a WHERE a.reference=$1 AND a.state='claiming' AND a.send_started_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM payment_session_bindings b WHERE b.invoice_attempt_id=a.id)`,[reference])).rows;
      if(rows.length!==1)return undefined;
      const row=rows[0];row.amount_cents=Number(row.amount_cents);row.session_id=sessionId;
      return camelRow<SessionRecoveryCandidate>(row);
    });
  }

  async attachRecoveredSession(candidate:SessionRecoveryCandidate,evidence:VerifiedOutcome,now=new Date()):Promise<boolean> {
    if(!evidenceMatchesExpectation(candidate,evidence))return false;
    if(candidate.paymentAttemptId){
      if(!this.retailAttacher || !await this.retailAttacher(candidate,now))return false;
      return this.bindRetailSession({...candidate,paymentAttemptId:candidate.paymentAttemptId},now);
    }
    return this.transaction(async client=>{
      const locator=(await client.query('SELECT rent_invoice_id,job_invoice_id FROM invoice_payment_attempts WHERE id=$1',[candidate.invoiceAttemptId])).rows[0];if(!locator)return false;
      const vertical=locator.rent_invoice_id?'property':'trades';await client.query(`SELECT id FROM ${invoiceTable(vertical)} WHERE id=$1 FOR UPDATE`,[locator.rent_invoice_id??locator.job_invoice_id]);
      const row=(await client.query('SELECT * FROM invoice_payment_attempts WHERE id=$1 FOR UPDATE',[candidate.invoiceAttemptId])).rows[0];
      if(!row || row.state!=='claiming' || !row.send_started_at || !evidenceMatchesExpectation({...camelRow<ProviderExpectation>(row),sessionId:candidate.sessionId},evidence))return false;
      const binding=(await client.query('SELECT session_id FROM payment_session_bindings WHERE invoice_attempt_id=$1',[row.id])).rows[0];
      if(binding)return binding.session_id===candidate.sessionId;
      const inserted=(await client.query(`INSERT INTO payment_session_bindings(session_id,processor_x_id,invoice_attempt_id,created_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING session_id`,[candidate.sessionId,row.processor_x_id,row.id,now])).rows;
      if(!inserted.length)return false;
      await client.query("UPDATE invoice_payment_attempts SET state='ready',updated_at=$2 WHERE id=$1",[row.id,now]);return true;
    });
  }

  private async fence(client: PaymentSqlClient, claim: InboxClaim, now: Date): Promise<boolean> {
    const row=(await client.query(`SELECT id FROM payment_notification_inbox WHERE id=$1 AND status='processing'
      AND lease_owner=$2 AND session_id=$3 AND attempt_count=$5 AND lease_expires_at=$6
      AND lease_expires_at>GREATEST($4::timestamptz,clock_timestamp()) FOR UPDATE`,
      [claim.id,claim.owner,claim.sessionId,now,claim.attemptCount,claim.leaseExpiresAt])).rows[0];
    return !!row;
  }

  async finalize(binding: SessionBinding, outcome: VerifiedOutcome, claim: InboxClaim, now: Date): Promise<SettlementResult> {
    if (!evidenceMatchesExpectation(binding,outcome) || binding.sessionId!==claim.sessionId) return {kind:"conflict"};
    // Retail must use the existing atomic finalizer with a same-transaction event
    // hook; absence of that adapter never falls back to a second retail engine.
    if (!binding.invoiceAttemptId) return this.retailFinalizer ? this.retailFinalizer(binding,outcome,claim,now) : {kind:"adapter-unavailable"};
    // T-3 (C8): a rule the database enforces on a supersession, or a share another attempt paid, is a
    // conflict, never an internal error, so the worker's alert fires.
    try { return await this.finalizeInvoice(binding,outcome,claim,now); }
    catch(error) {
      if(isPostgresConstraintViolationOn(error,[...SUPERSESSION_CONSTRAINTS,'invoice_attempt_rent_paid_uq','invoice_attempt_job_paid_uq']))return {kind:"conflict"};
      throw error;
    }
  }

  private finalizeInvoice(binding: SessionBinding, outcome: VerifiedOutcome, claim: InboxClaim, now: Date): Promise<SettlementResult> {
    return this.transaction(async(client):Promise<SettlementResult>=>{
      if (!await this.fence(client,claim,now)) return {kind:"lease-lost"};
      const locator=(await client.query("SELECT rent_invoice_id,job_invoice_id FROM invoice_payment_attempts WHERE id=$1",[binding.invoiceAttemptId])).rows[0];
      if (!locator) return {kind:"not-found"};
      const vertical=locator.rent_invoice_id ? "property" : "trades";
      const table=invoiceTable(vertical),column=invoiceColumn(vertical),id=locator[column];
      const invoice=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      const attempt=(await client.query("SELECT * FROM invoice_payment_attempts WHERE id=$1 FOR UPDATE",[binding.invoiceAttemptId])).rows[0];
      const storedBinding=(await client.query("SELECT * FROM payment_session_bindings WHERE session_id=$1 FOR UPDATE",[binding.sessionId])).rows[0];
      if (!invoice || !attempt || !storedBinding || storedBinding.invoice_attempt_id!==attempt.id || attempt.merchant_id!==invoice.merchant_id ||
        !evidenceMatchesExpectation({...camelRow<ProviderExpectation>(attempt),sessionId:storedBinding.session_id},outcome)) return {kind:"conflict"};
      // T-3 (docs/decisions/2026-10-15-t3-decline-supersession.md, revision 3).
      const sessionEvents=(await client.query("SELECT id,outcome,provider_transaction_id FROM payment_settlement_events WHERE session_id=$1",[binding.sessionId])).rows;
      const declinedEvent=sessionEvents.find((event:any)=>event.outcome==='declined'),finalEvent=sessionEvents.find((event:any)=>event.outcome!=='declined');
      // Rule 4: a verified decline for an attempt already declined or approved changes nothing.
      if (outcome.outcome==='declined' && ['declined','approved'].includes(attempt.state)) {
        const own=attempt.state==='approved'?finalEvent:declinedEvent;return own?{kind:"reused",eventId:own.id}:{kind:"conflict"};
      }
      let supersede:{declinedEventId:string}|undefined;
      if (attempt.state==='declined' && outcome.outcome==='approved' && declinedEvent && !finalEvent &&
        storedBinding.provider_transaction_id===declinedEvent.provider_transaction_id &&
        // D1: the declined card's own transaction reported as approved is a conflict, not a supersession.
        outcome.transactionId!==declinedEvent.provider_transaction_id) {
        // C1: the approval's transaction is held by no other session or billing attempt.
        const holder=(await client.query("SELECT binding_session_id FROM provider_transaction_claims WHERE provider_transaction_id=$1",[outcome.transactionId])).rows[0];
        if (holder && holder.binding_session_id!==binding.sessionId) return {kind:"conflict"};
        supersede={declinedEventId:declinedEvent.id};
      }
      if (terminal(attempt.state) && !supersede) {
        const own=sessionEvents.find((event:any)=>event.outcome===outcome.outcome);
        return attempt.state===outcome.outcome && storedBinding.provider_transaction_id===outcome.transactionId && own
          ? {kind:"reused",eventId:own.id} : {kind:"conflict"};
      }
      if (!supersede && !["ready","finalizing"].includes(attempt.state)) return {kind:"conflict"};
      const shareTaken=!!(await client.query(`SELECT 1 FROM invoice_payment_attempts WHERE ${column}=$1 AND share_index=$2 AND state='approved' AND id<>$3 LIMIT 1`,
        [id,attempt.share_index,attempt.id])).rows[0];
      // Rule 2 (C3): a second attempt's verified decline or cancellation, after its share or invoice was paid,
      // is recorded on that attempt alone: no invoice write and no outbox row.
      if (!supersede && outcome.outcome!=='approved' && (shareTaken || invoice.status==='paid')) {
        const quiet=(await client.query(`UPDATE invoice_payment_attempts SET state=$2,outcome=$2,reconciled_at=$3,updated_at=$3
          WHERE id=$1 AND state IN ('ready','finalizing') RETURNING id`,[attempt.id,outcome.outcome,now])).rows[0];
        if (!quiet) throw new Error("invoice_attempt_compare_and_set_failed");
        await client.query("UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1",[binding.sessionId,outcome.transactionId]);
        const event=(await client.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,previous_aggregate_status,provider_transaction_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[binding.sessionId,attempt.merchant_id,outcome.outcome,attempt.amount_cents,now,invoice.status,outcome.transactionId])).rows[0];
        return {kind:"finalized",eventId:event.id};
      }
      // An approval for a share or invoice another attempt already paid is a conflict before any write.
      if (outcome.outcome==='approved' && shareTaken) return {kind:"conflict"};
      if (!([...payableInvoiceStates,'voided','paid_external'] as readonly string[]).includes(invoice.status)) return {kind:"conflict"};
      const split=invoice.split_enabled && invoice.split_count>1;
      if (split ? attempt.share_index<1 || attempt.share_index>invoice.split_count ||
        attempt.amount_cents!==invoiceShareCents(invoice.amount_cents,invoice.split_count,attempt.share_index) :
        attempt.share_index!==0 || attempt.amount_cents!==invoice.amount_cents) return {kind:"conflict"};
      const collision=(await client.query("SELECT session_id FROM payment_session_bindings WHERE provider_transaction_id=$1 AND session_id<>$2",[outcome.transactionId,binding.sessionId])).rows[0];
      if (collision) return {kind:"conflict"};
      // C4: a supersession moves the attempt straight from declined, never through finalizing.
      if (!supersede) await client.query("UPDATE invoice_payment_attempts SET state='finalizing',updated_at=$2 WHERE id=$1",[attempt.id,now]);
      await client.query("UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1",[binding.sessionId,outcome.transactionId]);
      const finalized=(await client.query("UPDATE invoice_payment_attempts SET state=$2,outcome=$2,reconciled_at=$3,updated_at=$3 WHERE id=$1 AND state=$4 RETURNING id",
        [attempt.id,outcome.outcome,now,supersede?'declined':'finalizing'])).rows[0];
      if (!finalized) throw new Error("invoice_attempt_compare_and_set_failed");
      if (outcome.outcome==='approved') {
        const paid=(await client.query(`SELECT count(*)::int AS n FROM invoice_payment_attempts WHERE ${column}=$1 AND state='approved'`,[id])).rows[0].n;
        if (split && invoice.status!=='paid_external' && paid !== (invoice.split_paid_count??0)+1) throw new Error("inconsistent_paid_shares");
        const complete=!split || paid===invoice.split_count;
        // Integration fix: a schedule may have issued a replacement for a voided trades invoice
        // (job_invoices_schedule_due_uq ignores voided rows). The payment is recorded on the voided
        // invoice, which stays voided; the settlement event keeps previous status 'voided' for review.
        const replaced=vertical==='trades' && invoice.status==='voided' && invoice.schedule_id!==null && complete &&
          !!(await client.query(`SELECT 1 FROM job_invoices WHERE schedule_id=$1 AND due_at=$2 AND status<>'voided' AND id<>$3 LIMIT 1`,
            [invoice.schedule_id,invoice.due_at,id])).rows[0];
        if(invoice.status!=='paid_external')await client.query(`UPDATE ${table} SET status=CASE WHEN $2 THEN 'paid' ELSE status END,
          paid_at=CASE WHEN $2 THEN $3 ELSE paid_at END,split_paid_count=CASE WHEN $4 THEN $5 ELSE split_paid_count END,
          split_paid_sessions=CASE WHEN $4 THEN array_append(COALESCE(split_paid_sessions,'{}'::text[]),$6) ELSE split_paid_sessions END,
          windcave_session_id=$6,windcave_transaction_id=$7,updated_at=$3 WHERE id=$1`,[id,complete && !replaced,now,split,paid,binding.sessionId,outcome.transactionId]);
      }
      const event=(await client.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,previous_aggregate_status,provider_transaction_id,supersedes_event_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[binding.sessionId,attempt.merchant_id,outcome.outcome,attempt.amount_cents,now,invoice.status,outcome.transactionId,supersede?.declinedEventId??null])).rows[0];
      // C9: the superseded decline is not announced after the receipt unless its delivery has started.
      if (supersede) await client.query(`UPDATE payment_delivery_outbox SET status='complete',completed_at=$2
        WHERE event_id=$1 AND status IN ('pending','retry') AND targets_prepared_at IS NULL`,[supersede.declinedEventId,now]);
      const payload=JSON.stringify({attemptId:attempt.id,outcome:outcome.outcome,shareIndex:attempt.share_index,amountCents:attempt.amount_cents,eventId:event.id});
      if (vertical==='property') await client.query(`INSERT INTO transaction_events(merchant_id,tenant_profile_id,invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[invoice.merchant_id,invoice.tenant_profile_id,id,`payment_${outcome.outcome}`,payload,now]);
      else await client.query(`INSERT INTO job_events(merchant_id,client_profile_id,job_invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[invoice.merchant_id,invoice.client_profile_id,id,`payment_${outcome.outcome}`,payload,now]);
      await client.query(`INSERT INTO payment_delivery_outbox(event_id,channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2)`,[event.id,now]);
      if(outcome.outcome==='approved') await client.query(`INSERT INTO payment_delivery_outbox(event_id,channel,next_attempt_at) VALUES ($1,'payer_receipt',$2)`,[event.id,now]);
      return {kind:"finalized",eventId:event.id};
    });
  }

  async finishInbox(claim: InboxClaim, result: {status:"retry"|"complete"|"dead_letter";code?:ReconciliationError;transactionId?:string;nextAttemptAt?:Date;attemptCode?:string}, now: Date): Promise<boolean> {
    if(result.attemptCode!==undefined && !/^[a-z][a-z0-9_:]{0,63}$/.test(result.attemptCode))throw new Error('invalid_attempt_code');
    return this.transaction(async(client)=>{
      // Preserve R2's retail diagnostics. Its financial finalizer locks parent
      // and attempt before inbox; keep that order even for a failed query.
      const locator=(await client.query(`SELECT a.id,a.transaction_id FROM payment_session_bindings b
        JOIN payment_attempts a ON a.id=b.payment_attempt_id AND a.processor_session_id=b.session_id
        WHERE b.session_id=$1`,[claim.sessionId])).rows[0];
      let retail:any;
      if(locator){await client.query('SELECT id FROM transactions WHERE id=$1 FOR UPDATE',[locator.transaction_id]);
        retail=(await client.query('SELECT id,state FROM payment_attempts WHERE id=$1 AND processor_session_id=$2 FOR UPDATE',[locator.id,claim.sessionId])).rows[0];}
      if (!await this.fence(client,claim,now)) return false;
      const row=(await client.query(`UPDATE payment_notification_inbox SET status=$2,last_error_code=$3,observed_transaction_id=$4,
        next_attempt_at=COALESCE($5,next_attempt_at),completed_at=CASE WHEN $2='complete' THEN $6::timestamptz ELSE NULL END,
        lease_owner=NULL,lease_started_at=NULL,lease_expires_at=NULL WHERE id=$1 RETURNING id`,
        [claim.id,result.status,result.code??null,result.transactionId??null,result.nextAttemptAt??null,now])).rows[0];
      if(row&&retail)await client.query(`UPDATE payment_attempts SET last_reconciliation_code=$2,last_reconciled_at=$3,updated_at=$3 WHERE id=$1`,
        [retail.id,result.attemptCode??result.code??(terminal(retail.state)?retail.state:'complete'),now]);
      return !!row;
    });
  }

  async claimOutbox(owner:string,now:Date,eventId?:string):Promise<OutboxClaim|undefined> {
    if(eventId!==undefined&&!isUuid(eventId))throw new Error('invalid_outbox_event');
    if(!isUuid(owner)) throw new Error('invalid_worker_owner');
    return this.transaction(async(client)=>{
      const row=(await client.query(`WITH due AS (SELECT id FROM payment_delivery_outbox
        WHERE ($3::uuid IS NULL OR event_id=$3) AND ((status IN ('pending','retry') AND next_attempt_at<=$1) OR (status='processing' AND lease_expires_at<=$1))
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE payment_delivery_outbox o SET status='processing',lease_owner=$2,lease_started_at=$1,
          lease_expires_at=$1::timestamptz+interval '1 minute',attempt_count=attempt_count+1
        FROM due WHERE o.id=due.id RETURNING o.*`,[now,owner,eventId??null])).rows[0];
      return row ? {id:row.id,eventId:row.event_id??row.transaction_event_id??row.job_event_id??row.subscription_event_id,eventSource:row.event_id?'provider_settlement':row.transaction_event_id?'transaction_event':row.job_event_id?'job_event':'subscription_event',channel:row.channel,owner,
        attemptCount:row.attempt_count,leaseExpiresAt:row.lease_expires_at} : undefined;
    });
  }

  async finishOutbox(claim:OutboxClaim,status:'complete'|'retry'|'dead_letter',now:Date,nextAttemptAt?:Date):Promise<boolean> {
    return this.transaction(async(client)=>{
      const row=(await client.query(`UPDATE payment_delivery_outbox SET status=$3,lease_owner=NULL,lease_started_at=NULL,
        lease_expires_at=NULL,next_attempt_at=COALESCE($5,next_attempt_at),completed_at=CASE WHEN $3='complete' THEN $4 ELSE NULL END
        WHERE id=$1 AND lease_owner=$2 AND status='processing' AND attempt_count=$6 AND lease_expires_at=$7
          AND lease_expires_at>GREATEST($4::timestamptz,clock_timestamp()) RETURNING id`,
        [claim.id,claim.owner,status,now,nextAttemptAt??null,claim.attemptCount,claim.leaseExpiresAt])).rows[0];
      return !!row;
    });
  }

  async backfillInvoiceTokenHashes(limit=100):Promise<number> {
    if(!Number.isSafeInteger(limit) || limit<1 || limit>500) throw new Error('invalid_backfill_batch');
    return this.transaction(async(client)=>{
      let count=0;
      for(const table of ['invoices_rent_requests','job_invoices','quotes']) {
        const rows=(await client.query(`SELECT id,token FROM ${table} WHERE token_hash IS NULL ORDER BY id
          FOR UPDATE SKIP LOCKED LIMIT $1`,[limit])).rows;
        for(const row of rows) {
          await client.query(`UPDATE ${table} SET token_hash=$2 WHERE id=$1 AND token_hash IS NULL`,[row.id,hashBearerCredential(row.token)]);
          count++;
        }
      }
      return count;
    });
  }
}
