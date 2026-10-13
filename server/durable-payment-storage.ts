import { randomUUID } from "node:crypto";
import { hashBearerCredential } from "./payment-credential";
import { invoiceShareCents, requestFingerprint, isSessionId, isUuid } from "./durable-payment-contract";
import type { AttemptState, ProviderExpectation, SessionBinding, VerifiedOutcome, InboxClaim,
  ReconciliationRepository, ReconciliationError, SettlementResult } from "./durable-payment-contract";
import { evidenceMatchesExpectation } from "./payment-reconciliation";
import type { OutboxClaim, PaymentOutboxRepository } from "./payment-outbox";
import { payableInvoiceStates } from "./payment-transition-graphs";

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
    private readonly retailFinalizer?: (binding: SessionBinding, outcome: VerifiedOutcome, claim: InboxClaim, now: Date) => Promise<SettlementResult>) {}

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
    providerAccount: string }, now = new Date()): Promise<InvoiceAttemptClaim> {
    if (!["property","trades"].includes(input.vertical) || !isUuid(input.invoiceId) || !isUuid(input.idempotencyKey) ||
        !Number.isSafeInteger(input.merchantId) || input.merchantId < 1 || !Number.isSafeInteger(input.shareIndex) || input.shareIndex < 0 ||
        !/^[A-Z]{3}$/.test(input.currency) || !["uat","production"].includes(input.environment) ||
        typeof input.providerAccount !== "string" || !input.providerAccount.length || input.providerAccount.length > 200)
      throw new Error("invalid_invoice_claim");
    return this.transaction(async (client): Promise<InvoiceAttemptClaim> => {
      const table = invoiceTable(input.vertical), column = invoiceColumn(input.vertical);
      const invoice = (await client.query(`SELECT * FROM ${table} WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,
        [input.invoiceId,input.merchantId])).rows[0];
      if (!invoice) return {kind:"not-found"};
      const isSplit = invoice.split_enabled && invoice.split_count > 1;
      if ((!isSplit && input.shareIndex !== 0) || (isSplit && (input.shareIndex < 1 || input.shareIndex > invoice.split_count))) return {kind:"conflict"};
      const amountCents = isSplit ? invoiceShareCents(invoice.amount_cents,invoice.split_count,input.shareIndex) : invoice.amount_cents;
      const reference = `${input.vertical === "property" ? "RENT" : "JOB"}-${input.invoiceId}-S${input.shareIndex}`;
      const fingerprint = requestFingerprint({ ...input, amountCents, reference });
      const same = (await client.query(`SELECT * FROM invoice_payment_attempts WHERE ${column}=$1 AND share_index=$2 AND idempotency_key=$3 FOR UPDATE`,
        [input.invoiceId,input.shareIndex,input.idempotencyKey])).rows[0];
      if (same) {
        if (same.request_fingerprint !== fingerprint) return {kind:"conflict"};
        if (same.state === "abandoned") return {kind:"expired"};
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
      if ((invoice.split_paid_count ?? 0) !== approved.length || approved.some((row) => row.share_index === input.shareIndex)) return {kind:"conflict"};
      const live = (await client.query(`SELECT * FROM invoice_payment_attempts WHERE ${column}=$1 AND share_index=$2 AND state IN ('claiming','ready','finalizing') FOR UPDATE`,
        [input.invoiceId,input.shareIndex])).rows[0];
      if (live) {
        if (live.state !== "claiming" || live.send_started_at || live.lease_expires_at > now) return {kind:"conflict"};
        await client.query("UPDATE invoice_payment_attempts SET state='abandoned',updated_at=$2 WHERE id=$1",[live.id,now]);
      }
      const row = (await client.query(`INSERT INTO invoice_payment_attempts(merchant_id,${column},share_index,amount_cents,
        idempotency_key,request_fingerprint,processor_x_id,currency,reference,environment,provider_account,lease_expires_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
        [input.merchantId,input.invoiceId,input.shareIndex,amountCents,input.idempotencyKey,fingerprint,
          `taptpay-${randomUUID()}`,input.currency,reference,input.environment,input.providerAccount,new Date(now.getTime()+300000),now])).rows[0];
      return {kind:"claimed",attempt:camelRow(row)};
    });
  }

  async attachInvoiceSession(attemptId: string, sessionId: string, returnState: string, now = new Date()): Promise<{kind:"attached"|"reused"|"conflict"|"expired"|"not-found"}> {
    if (!isUuid(attemptId) || !isSessionId(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(returnState)) throw new Error("invalid_session_attachment");
    return this.transaction(async (client) => {
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

  async resolveInvoiceReturnState(raw: string, now = new Date()): Promise<{kind:"valid";sessionId:string;attempt:InvoiceAttempt}|{kind:"not-found"|"expired"}> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return {kind:"not-found"};
    return this.transaction(async(client)=>{
      const row=(await client.query(`SELECT a.*,b.session_id FROM invoice_payment_attempts a
        JOIN payment_session_bindings b ON b.invoice_attempt_id=a.id WHERE a.return_state_hash=$1`,[hashBearerCredential(raw)])).rows[0];
      if (!row) return {kind:"not-found"};
      if (row.return_state_expires_at <= now) return {kind:"expired"};
      return {kind:"valid",sessionId:row.session_id,attempt:camelRow(row)};
    });
  }

  async getInvoiceSession(attemptId:string):Promise<SessionBinding|undefined> {
    if(!isUuid(attemptId)) return undefined;
    const session=await this.transaction(async(client)=>(await client.query('SELECT session_id FROM payment_session_bindings WHERE invoice_attempt_id=$1',[attemptId])).rows[0]?.session_id);
    return session ? this.resolveSession(session) : undefined;
  }

  async changeInvoice(input:{vertical:'property'|'trades';invoiceId:string;merchantId:number;
    action:'void'|'manualPaid'|'split';splitCount?:number;reference?:string},now=new Date()):Promise<{kind:'claimed'|'terminal'|'conflict'|'not-found'}> {
    if(!['property','trades'].includes(input.vertical) || !isUuid(input.invoiceId) || !Number.isSafeInteger(input.merchantId) || input.merchantId<1 ||
      !['void','manualPaid','split'].includes(input.action)) throw new Error('invalid_invoice_change');
    if(input.action==='split' && (!Number.isSafeInteger(input.splitCount) || input.splitCount!<2 || input.splitCount!>12)) throw new Error('invalid_split');
    if(input.reference!==undefined && (typeof input.reference!=='string' || input.reference.length>200)) throw new Error('invalid_reference');
    return this.transaction(async(client)=>{
      const table=invoiceTable(input.vertical),column=invoiceColumn(input.vertical);
      const invoice=(await client.query(`SELECT * FROM ${table} WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,[input.invoiceId,input.merchantId])).rows[0];
      if(!invoice) return {kind:'not-found'};
      const target=input.action==='void' ? 'voided' : input.action==='manualPaid' ? 'paid_external' : null;
      if(target && invoice.status===target) return {kind:'terminal'};
      if(input.action==='split' && invoice.split_enabled && invoice.split_count===input.splitCount) return {kind:'terminal'};
      if(!(payableInvoiceStates as readonly string[]).includes(invoice.status)) return {kind:'conflict'};
      const attempts=(await client.query(`SELECT state FROM invoice_payment_attempts WHERE ${column}=$1 FOR UPDATE`,[invoice.id])).rows;
      if(attempts.some(a=>['claiming','ready','finalizing','approved'].includes(a.state)) || invoice.split_paid_count>0 || invoice.windcave_session_id ||
        (await client.query(`SELECT 1 FROM invoice_split_sessions WHERE ${column}=$1 LIMIT 1`,[invoice.id])).rows.length) return {kind:'conflict'};
      if(input.action==='split') {
        if(!invoice.split_enabled || invoice.amount_cents<input.splitCount!) return {kind:'conflict'};
        await client.query(`UPDATE ${table} SET split_count=$2,updated_at=$3 WHERE id=$1`,[invoice.id,input.splitCount,now]);
      } else await client.query(`UPDATE ${table} SET status=$2,updated_at=$3,paid_at=CASE WHEN $2='paid_external' THEN $3 ELSE paid_at END,
        voided_at=CASE WHEN $2='voided' THEN $3 ELSE voided_at END,external_payment_reference=CASE WHEN $2='paid_external' THEN $4 ELSE external_payment_reference END WHERE id=$1`,
        [invoice.id,target,now,input.reference??null]);
      const event=input.action==='manualPaid'?'manual_payment_recorded':input.action==='void'?'invoice_voided':'split_configured';
      const payload=JSON.stringify({action:input.action,...(input.action==='split'?{splitCount:input.splitCount}:{})});
      if(input.vertical==='property') await client.query(`INSERT INTO transaction_events(merchant_id,tenant_profile_id,invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[input.merchantId,invoice.tenant_profile_id,invoice.id,event,payload,now]);
      else await client.query(`INSERT INTO job_events(merchant_id,client_profile_id,job_invoice_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[input.merchantId,invoice.client_profile_id,invoice.id,event,payload,now]);
      return {kind:'claimed'};
    });
  }

  async bindRetailSession(input: ProviderExpectation & { paymentAttemptId: string }, now = new Date()): Promise<boolean> {
    if (!isUuid(input.paymentAttemptId) || !isSessionId(input.sessionId)) throw new Error("invalid_retail_binding");
    return this.transaction(async(client)=>{
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
  async markInvoiceSendStarted(attemptId:string,now=new Date()):Promise<boolean> {
    if(!isUuid(attemptId)) throw new Error('invalid_attempt');
    return this.transaction(async(client)=>{
      const row=(await client.query(`UPDATE invoice_payment_attempts SET send_started_at=COALESCE(send_started_at,$2),updated_at=$2
        WHERE id=$1 AND state='claiming' AND (send_started_at IS NOT NULL OR lease_expires_at>$2) RETURNING id`,[attemptId,now])).rows[0];
      return !!row;
    });
  }

  async prepareRetailExpectation(input: {paymentAttemptId:string;merchantId:number;currency:string;
    environment:"uat"|"production";providerAccount:string}, now=new Date()): Promise<Omit<ProviderExpectation,"sessionId">|undefined> {
    if(!isUuid(input.paymentAttemptId) || !Number.isSafeInteger(input.merchantId) || input.merchantId<1 ||
      !/^[A-Z]{3}$/.test(input.currency) || !['uat','production'].includes(input.environment) ||
      typeof input.providerAccount!=='string' || !input.providerAccount.length || input.providerAccount.length>200) throw new Error('invalid_retail_expectation');
    return this.transaction(async(client)=>{
      const locator=(await client.query('SELECT transaction_id FROM payment_attempts WHERE id=$1',[input.paymentAttemptId])).rows[0];
      if(!locator) return undefined;
      const parent=(await client.query('SELECT * FROM transactions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
        [locator.transaction_id,input.merchantId])).rows[0];
      if(!parent) return undefined;
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
      const fingerprint=requestFingerprint({...input,...expected,transactionId:parent.id,shareIndex:attempt.share_index});
      if(attempt.request_fingerprint) return attempt.request_fingerprint===fingerprint ? expected : undefined;
      if(attempt.expected_amount_cents!==null && (Number(attempt.expected_amount_cents)!==amountCents ||
        attempt.expected_currency!==input.currency || attempt.expected_merchant_reference!==expected.reference || attempt.provider_environment!==input.environment)) return undefined;
      // Never infer historical expectations after session attachment.
      if(attempt.state!=='claiming' || attempt.processor_session_id || attempt.lease_expires_at<=now) return undefined;
      await client.query(`UPDATE payment_attempts SET expected_amount_cents=$2,expected_currency=$3,
        expected_merchant_reference=$4,provider_environment=$5,expected_provider_account=$6,
        request_fingerprint=$7,processor_x_id=$8,send_started_at=$9::timestamptz,updated_at=$9::timestamptz WHERE id=$1`,
        [attempt.id,amountCents,input.currency,expected.reference,input.environment,input.providerAccount,fingerprint,expected.processorXId,now]);
      return expected;
    });
  }

  async receive(sessionId: string, kind: "fprn"|"browser"|"poll", now = new Date()): Promise<string> {
    if (!isSessionId(sessionId) || !["fprn","browser","poll"].includes(kind)) throw new Error("invalid_notification");
    return this.transaction(async(client)=>{
      const row=(await client.query(`INSERT INTO payment_notification_inbox(provider,kind,session_id,first_received_at,last_received_at,next_attempt_at)
        VALUES ('windcave',$1,$2,$3,$3,$3) ON CONFLICT(provider,kind,session_id)
        DO UPDATE SET arrival_count=payment_notification_inbox.arrival_count+1,
          last_received_at=GREATEST(payment_notification_inbox.last_received_at,EXCLUDED.last_received_at) RETURNING id`,[kind,sessionId,now])).rows[0];
      return row.id;
    });
  }

  async claimInbox(owner: string, now: Date): Promise<InboxClaim|undefined> {
    if (!isUuid(owner)) throw new Error("invalid_worker_owner");
    return this.transaction(async(client)=>{
      const row=(await client.query(`WITH due AS (SELECT id FROM payment_notification_inbox
        WHERE (status IN ('pending','retry') AND next_attempt_at<=$1) OR (status='processing' AND lease_expires_at<=$1)
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE payment_notification_inbox i SET status='processing',lease_owner=$2,lease_started_at=$1,
          lease_expires_at=$1::timestamptz+interval '1 minute',attempt_count=attempt_count+1
        FROM due WHERE i.id=due.id RETURNING i.*`,[now,owner])).rows[0];
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
      await client.query(`INSERT INTO payment_session_bindings(session_id,processor_x_id,payment_attempt_id)
        SELECT r.processor_session_id,r.processor_x_id,r.id FROM payment_attempts r
        WHERE r.processor_session_id=$1 AND r.expected_provider_account IS NOT NULL AND r.request_fingerprint IS NOT NULL
          AND r.processor_x_id IS NOT NULL ON CONFLICT DO NOTHING`,[sessionId]);
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
      if (terminal(attempt.state)) {
        const event=(await client.query("SELECT id FROM payment_settlement_events WHERE session_id=$1",[binding.sessionId])).rows[0];
        return attempt.state===outcome.outcome && storedBinding.provider_transaction_id===outcome.transactionId && event
          ? {kind:"reused",eventId:event.id} : {kind:"conflict"};
      }
      if (!["ready","finalizing"].includes(attempt.state) || !(payableInvoiceStates as readonly string[]).includes(invoice.status)) return {kind:"conflict"};
      const split=invoice.split_enabled && invoice.split_count>1;
      if (split ? attempt.share_index<1 || attempt.share_index>invoice.split_count ||
        attempt.amount_cents!==invoiceShareCents(invoice.amount_cents,invoice.split_count,attempt.share_index) :
        attempt.share_index!==0 || attempt.amount_cents!==invoice.amount_cents) return {kind:"conflict"};
      const collision=(await client.query("SELECT session_id FROM payment_session_bindings WHERE provider_transaction_id=$1 AND session_id<>$2",[outcome.transactionId,binding.sessionId])).rows[0];
      if (collision) return {kind:"conflict"};
      await client.query("UPDATE invoice_payment_attempts SET state='finalizing',updated_at=$2 WHERE id=$1",[attempt.id,now]);
      await client.query("UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1",[binding.sessionId,outcome.transactionId]);
      await client.query("UPDATE invoice_payment_attempts SET state=$2,outcome=$2,reconciled_at=$3,updated_at=$3 WHERE id=$1",[attempt.id,outcome.outcome,now]);
      if (outcome.outcome==='approved') {
        const paid=(await client.query(`SELECT count(*)::int AS n FROM invoice_payment_attempts WHERE ${column}=$1 AND state='approved'`,[id])).rows[0].n;
        if (split && paid !== (invoice.split_paid_count??0)+1) throw new Error("inconsistent_paid_shares");
        const complete=!split || paid===invoice.split_count;
        await client.query(`UPDATE ${table} SET status=CASE WHEN $2 THEN 'paid' ELSE status END,
          paid_at=CASE WHEN $2 THEN $3 ELSE paid_at END,split_paid_count=CASE WHEN $4 THEN $5 ELSE split_paid_count END,
          split_paid_sessions=CASE WHEN $4 THEN array_append(COALESCE(split_paid_sessions,'{}'::text[]),$6) ELSE split_paid_sessions END,
          windcave_session_id=$6,windcave_transaction_id=$7,updated_at=$3 WHERE id=$1`,[id,complete,now,split,paid,binding.sessionId,outcome.transactionId]);
      }
      const event=(await client.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`,[binding.sessionId,attempt.merchant_id,outcome.outcome,attempt.amount_cents,now])).rows[0];
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

  async finishInbox(claim: InboxClaim, result: {status:"retry"|"complete"|"dead_letter";code?:ReconciliationError;transactionId?:string;nextAttemptAt?:Date}, now: Date): Promise<boolean> {
    return this.transaction(async(client)=>{
      if (!await this.fence(client,claim,now)) return false;
      const row=(await client.query(`UPDATE payment_notification_inbox SET status=$2,last_error_code=$3,observed_transaction_id=$4,
        next_attempt_at=COALESCE($5,next_attempt_at),completed_at=CASE WHEN $2='complete' THEN $6::timestamptz ELSE NULL END,
        lease_owner=NULL,lease_started_at=NULL,lease_expires_at=NULL WHERE id=$1 RETURNING id`,
        [claim.id,result.status,result.code??null,result.transactionId??null,result.nextAttemptAt??null,now])).rows[0];
      return !!row;
    });
  }

  async claimOutbox(owner:string,now:Date):Promise<OutboxClaim|undefined> {
    if(!isUuid(owner)) throw new Error('invalid_worker_owner');
    return this.transaction(async(client)=>{
      const row=(await client.query(`WITH due AS (SELECT id FROM payment_delivery_outbox
        WHERE (status IN ('pending','retry') AND next_attempt_at<=$1) OR (status='processing' AND lease_expires_at<=$1)
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE payment_delivery_outbox o SET status='processing',lease_owner=$2,lease_started_at=$1,
          lease_expires_at=$1::timestamptz+interval '1 minute',attempt_count=attempt_count+1
        FROM due WHERE o.id=due.id RETURNING o.*`,[now,owner])).rows[0];
      return row ? {id:row.id,eventId:row.event_id??row.transaction_event_id,eventSource:row.event_id?'provider_settlement':'transaction_event',channel:row.channel,owner,
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
