import {createHash,randomUUID} from 'node:crypto';
import {openActiveSecret,sealActiveSecret} from './active-secret-vault';
import {loadDataEncryption,type DataEncryption} from './data-encryption';
import {isSessionId,isUuid,requestFingerprint,type InboxClaim} from './durable-payment-contract';
import {createPaymentReturnState} from './payment-token';
import {hashBearerCredential} from './payment-credential';
import type {PaymentSqlPool,PaymentSqlClient,DurablePaymentStorage} from './durable-payment-storage';
import type {DurableSubscriptionBilling} from './durable-subscription-billing';
import type {PaymentCommandActor} from './payment-command';
import {renewalPlan} from './subscription-billing';

export type CardExpectation={attemptId:string;processorXId:string;reference:string;amountCents:0;currency:'NZD';providerType:'validate';environment:'uat'|'production';providerAccount:string;sessionId?:string};
export type CardObservation={kind:'pending'}|{kind:'unknown'}|{kind:'mismatch'}|
  {kind:'approved';transactionId:string;card:{cardId:string;brand:string|null;last4:string|null;expiry:string|null}}|
  {kind:'declined';transactionId:string};
export interface SubscriptionCardProvider {
  create(expected:CardExpectation,input:{email:string;callbackUrl:string;notificationUrl:string}):Promise<{sessionId:string;redirectUrl?:string}|undefined>;
  query(expected:CardExpectation & {sessionId:string}):Promise<CardObservation>;
  hostedPage(sessionId:string):Promise<string|undefined>;
  discoverReference?(sessionId:string):Promise<string|undefined>;
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const camel=(row:any)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,char)=>char.toUpperCase()),value]));
const activationCancelled=(row:any)=>
  (row.cancellation_requested_at&&row.cancellation_requested_at>row.card_started_at)||
  (row.status==='cancelled'&&row.started_status!=='cancelled')||
  (row.status!=='cancelled'&&row.cancel_at_period_end);

/** Card verification never passes through the positive-money retail finalizer.
 * The notification inbox/lease is shared; concrete subscription identity and a
 * zero-value provider query determine this separate domain's final state. */
export class DurableSubscriptionCard {
  constructor(private readonly pool:PaymentSqlPool,private readonly inbox:DurablePaymentStorage,
    private readonly provider:SubscriptionCardProvider,private readonly billing:DurableSubscriptionBilling,
    private readonly context:{environment:'uat'|'production';providerAccount:string},private readonly returnSecret:string,
    private readonly clock=()=>new Date(),private readonly enabled=()=>false,private readonly encryption:DataEncryption=loadDataEncryption({})){}
  canStart():boolean{return this.enabled()&&!!this.returnSecret;}
  private async transaction<T>(work:(client:PaymentSqlClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='5s'");
      const result=await work(client);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }
  private expectation(row:any):CardExpectation{return {attemptId:row.id,processorXId:row.processor_x_id,reference:row.reference,
    amountCents:row.amount_cents,currency:row.currency,providerType:row.provider_type,environment:row.environment,providerAccount:row.provider_account,sessionId:row.session_id??undefined};}
  async start(input:{subscriptionId:number;merchantId:number;idempotencyKey:string;email:string;baseUrl:string;actor?:PaymentCommandActor}){
    if(!isUuid(input.idempotencyKey)||!Number.isSafeInteger(input.subscriptionId)||input.subscriptionId<1||!Number.isSafeInteger(input.merchantId)||input.merchantId<1)throw new Error('invalid_card_setup_intent');
    if(!this.enabled()||!this.returnSecret)return {kind:'unavailable' as const};
    const prepared=await this.transaction(async client=>{
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',[input.subscriptionId,input.merchantId])).rows[0];
      if(!parent)return {kind:'not-found' as const};
      const prior=(await client.query('SELECT * FROM subscription_card_attempts WHERE subscription_id=$1 AND idempotency_key=$2 FOR UPDATE',[parent.id,input.idempotencyKey])).rows[0];
      const fingerprint=requestFingerprint({subscriptionId:parent.id,merchantId:input.merchantId,idempotencyKey:input.idempotencyKey.toLowerCase(),amountCents:0,currency:'NZD',providerType:'validate',...this.context});
      if(prior)return prior.request_fingerprint===fingerprint?{kind:'reused' as const,row:prior}:{kind:'conflict' as const};
      if((await client.query("SELECT 1 FROM subscription_billing_attempts WHERE subscription_id=$1 AND applied_at IS NULL AND state<>'abandoned' LIMIT 1",[parent.id])).rows.length)return {kind:'conflict' as const};
      const held=(await client.query("SELECT * FROM subscription_card_attempts WHERE subscription_id=$1 AND applied_at IS NULL AND state<>'abandoned' FOR UPDATE",[parent.id])).rows[0];
      const now=this.clock();
      if(held){if(held.state!=='claiming'||held.send_started_at||held.session_id||held.lease_expires_at>now)return {kind:'conflict' as const};
        await client.query("UPDATE subscription_card_attempts SET state='abandoned',updated_at=$2 WHERE id=$1",[held.id,now]);}
      const id=randomUUID(),raw=createPaymentReturnState(id,this.returnSecret).rawToken;
      const row=(await client.query(`INSERT INTO subscription_card_attempts(id,subscription_id,merchant_id,idempotency_key,request_fingerprint,processor_x_id,
        reference,environment,provider_account,lease_expires_at,return_state_hash,return_state_expires_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz+interval '5 minutes',$11,$10::timestamptz+interval '30 minutes',$10,$10) RETURNING *`,
        [id,parent.id,input.merchantId,input.idempotencyKey,fingerprint,id.replace(/-/g,'').slice(0,16),`SC_${id}`,this.context.environment,this.context.providerAccount,now,hashBearerCredential(raw)])).rows[0];
      await client.query('UPDATE subscription_card_attempts SET send_started_at=$2,updated_at=$2 WHERE id=$1',[id,now]);
      const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,card_attempt_id,event_type,payload,created_at)
        VALUES ($1,$2,'card_setup_started',$3::jsonb,$4) RETURNING id`,[input.merchantId,id,JSON.stringify({actor:input.actor??{service:'internal'},source:'card_setup',startedStatus:parent.status}),now])).rows[0];
      await client.query("INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2)",[event.id,now]);
      return {kind:'claimed' as const,row};
    });
    if(!('row' in prepared))return prepared;
    const row=prepared.row,returnState=createPaymentReturnState(row.id,this.returnSecret).rawToken;
    if(['approved','declined'].includes(row.state))return {kind:'terminal' as const,outcome:row.state,sessionId:row.session_id};
    if(prepared.kind==='reused'){
      const redirectUrl=row.session_id?await this.provider.hostedPage(row.session_id):undefined;
      return redirectUrl?{kind:'ready' as const,sessionId:row.session_id,returnState,redirectUrl}:{kind:'processing' as const,sessionId:row.session_id,returnState};
    }
    try{
      const reply=await this.provider.create(this.expectation(row),{email:input.email,
        callbackUrl:`${input.baseUrl}/api/billing/card/callback?state=${encodeURIComponent(returnState)}`,notificationUrl:`${input.baseUrl}/api/billing/card/notification`});
      if(!reply||!isSessionId(reply.sessionId))return {kind:'processing' as const,returnState};
      if(!await this.attach(row.id,reply.sessionId))return {kind:'processing' as const,returnState};
      await this.inbox.receive(reply.sessionId,'poll',this.clock());
      return reply.redirectUrl?{kind:'ready' as const,...reply,redirectUrl:reply.redirectUrl,returnState}:{kind:'processing' as const,sessionId:reply.sessionId,returnState};
    }catch{return {kind:'processing' as const,returnState};}
  }
  private async attach(id:string,sessionId:string):Promise<boolean>{
    return this.transaction(async client=>{
      const locator=(await client.query('SELECT subscription_id FROM subscription_card_attempts WHERE id=$1',[id])).rows[0];if(!locator)return false;
      await client.query('SELECT id FROM merchant_subscriptions WHERE id=$1 FOR UPDATE',[locator.subscription_id]);
      const row=(await client.query('SELECT * FROM subscription_card_attempts WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(row.session_id)return row.session_id===sessionId;
      if(row.state!=='claiming'||!row.send_started_at||(await client.query('SELECT 1 FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows.length)return false;
      await client.query('INSERT INTO payment_session_bindings(session_id,processor_x_id,card_attempt_id,created_at) VALUES ($1,$2,$3,$4)',[sessionId,row.processor_x_id,row.id,this.clock()]);
      await client.query("UPDATE subscription_card_attempts SET state='ready',session_id=$2,updated_at=$3 WHERE id=$1",[id,sessionId,this.clock()]);
      await client.query('UPDATE merchant_subscriptions SET windcave_billing_ref=$2,updated_at=$3 WHERE id=$1',[row.subscription_id,sessionId,this.clock()]);return true;
    });
  }
  async resolveReturnState(raw:string){
    if(!/^[A-Za-z0-9_-]{43}$/.test(raw))return undefined;
    return this.transaction(async client=>{const row=(await client.query('SELECT * FROM subscription_card_attempts WHERE return_state_hash=$1',[hashBearerCredential(raw)])).rows[0];
      return row && row.return_state_expires_at>this.clock()?row:undefined;});
  }
  async status(merchantId:number,sessionId:string){
    if(!isSessionId(sessionId))return undefined;
    return this.transaction(async client=>{const row=(await client.query(`SELECT a.*,a.created_at AS card_started_at,s.status,s.cancel_at_period_end,s.cancellation_requested_at,s.windcave_card_id AS current_card_id,
      EXISTS(SELECT 1 FROM subscription_payment_events resolved WHERE resolved.card_attempt_id=a.id AND resolved.event_type='activation_satisfied') AS activation_satisfied,
      e.payload->>'startedStatus' AS started_status,approved.payload->>'activationRequired' AS activation_required,
      b.state AS activation_state,b.applied_at AS activation_applied_at,b.last_error_code AS activation_error FROM subscription_card_attempts a
      JOIN merchant_subscriptions s ON s.id=a.subscription_id AND s.merchant_id=a.merchant_id
      LEFT JOIN subscription_payment_events e ON e.card_attempt_id=a.id AND e.event_type='card_setup_started'
      LEFT JOIN subscription_payment_events approved ON approved.card_attempt_id=a.id AND approved.event_type='card_approved'
      LEFT JOIN subscription_billing_attempts b ON b.card_attempt_id=a.id AND b.kind='activation' WHERE a.session_id=$1 AND a.merchant_id=$2`,[sessionId,merchantId])).rows[0];
      return row?{...row,payment_method_superseded:row.state==='approved'&&row.card_digest&&digest(openActiveSecret('merchant_subscriptions',row.subscription_id,row.current_card_id,this.encryption)??'')!==row.card_digest&&(!row.activation_state||!!row.activation_applied_at),
        activation_suppressed:row.state==='approved'&&row.activation_required==='true'&&
        ((!row.activation_state&&!!activationCancelled(row))||(row.activation_state==='abandoned'&&row.activation_error==='cancelled_before_send'))}:undefined;});
  }
  async confirm(merchantId:number,sessionId:string){
    const owned=await this.status(merchantId,sessionId);if(!owned)return undefined;
    if(!owned.applied_at){await this.inbox.receive(sessionId,'poll',this.clock());
      const claim=await this.inbox.claimInbox(randomUUID(),this.clock(),sessionId);if(claim)await this.processReceipt(claim);}
    const fresh=await this.status(merchantId,sessionId);
    if(fresh?.state==='approved')await this.activate(fresh.id);
    return this.status(merchantId,sessionId);
  }
  async processReceipt(claim:InboxClaim):Promise<boolean>{
    let row=await this.transaction(async client=>(await client.query('SELECT * FROM subscription_card_attempts WHERE session_id=$1',[claim.sessionId])).rows[0]);
    if(!row && (await this.transaction(async client=>(await client.query('SELECT 1 FROM payment_session_bindings WHERE session_id=$1',[claim.sessionId])).rows.length)))return false;
    if(!row && this.provider.discoverReference){
      const reference=await this.provider.discoverReference(claim.sessionId);
      if(reference?.startsWith('SC_'))row=await this.transaction(async client=>(await client.query("SELECT * FROM subscription_card_attempts WHERE reference=$1 AND session_id IS NULL AND send_started_at IS NOT NULL AND state='claiming'",[reference])).rows[0]);
    }
    if(!row)return false;
    if(row.environment!==this.context.environment||row.provider_account!==this.context.providerAccount){await this.inbox.finishInbox(claim,{status:'dead_letter',code:'integrity_mismatch'},this.clock());return true;}
    if(row.applied_at){await this.inbox.finishInbox(claim,{status:'complete',transactionId:row.provider_transaction_id??undefined},this.clock());return true;}
    const observation=await this.provider.query({...this.expectation(row),sessionId:claim.sessionId});
    if(observation.kind==='pending'||observation.kind==='unknown'){
      await this.inbox.finishInbox(claim,{status:claim.attemptCount>=20?'dead_letter':'retry',code:claim.attemptCount>=20?'retry_exhausted':'provider_pending',nextAttemptAt:new Date(this.clock().getTime()+Math.min(300000,1000*2**Math.min(claim.attemptCount,12)))},this.clock());return true;
    }
    if(observation.kind==='mismatch'||!isSessionId(observation.transactionId)){
      await this.inbox.finishInbox(claim,{status:'dead_letter',code:'integrity_mismatch'},this.clock());return true;
    }
    if(!row.session_id&&!await this.attach(row.id,claim.sessionId)){await this.inbox.finishInbox(claim,{status:'dead_letter',code:'settlement_conflict'},this.clock());return true;}
    const recorded=await this.transaction(async client=>{
      const fence=(await client.query(`SELECT id FROM payment_notification_inbox WHERE id=$1 AND status='processing' AND lease_owner=$2 AND attempt_count=$3
        AND lease_expires_at=$4 AND lease_expires_at>GREATEST($5::timestamptz,clock_timestamp()) FOR UPDATE`,[claim.id,claim.owner,claim.attemptCount,claim.leaseExpiresAt,this.clock()])).rows[0];
      if(!fence)return false;
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',[row.subscription_id,row.merchant_id])).rows[0];
      const attempt=(await client.query('SELECT * FROM subscription_card_attempts WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
      if(!parent||attempt.session_id!==claim.sessionId)return false;
      if(attempt.applied_at)return true;
      if((await client.query("SELECT 1 FROM subscription_billing_attempts WHERE subscription_id=$1 AND applied_at IS NULL AND state<>'abandoned' LIMIT 1",[parent.id])).rows.length)return false;
      const now=this.clock();
      const source=(await client.query("SELECT payload FROM subscription_payment_events WHERE card_attempt_id=$1 AND event_type='card_setup_started'",[attempt.id])).rows[0];
      const paidCurrent=parent.status==='active'&&parent.last_billing_date&&parent.current_period_end>now;
      if(observation.kind==='approved'){
        const card=observation.card;
        if(!card.cardId||card.cardId.length>1000||(card.last4!==null&&!/^\d{4}$/.test(card.last4))||(card.expiry!==null&&!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)))return false;
        await client.query(`UPDATE merchant_subscriptions SET windcave_card_id=$2,card_brand=$3,card_last4=$4,card_expiry=$5,windcave_billing_ref=$6,updated_at=$7 WHERE id=$1`,
          [parent.id,sealActiveSecret('merchant_subscriptions',parent.id,card.cardId,this.encryption),card.brand,card.last4,card.expiry,`stored:${digest(claim.sessionId)}`,now]);
        await client.query('UPDATE subscription_card_attempts SET card_digest=$2 WHERE id=$1',[attempt.id,digest(card.cardId)]);
      }
      await client.query('UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1 AND card_attempt_id=$3',[claim.sessionId,observation.transactionId,attempt.id]);
      await client.query('UPDATE subscription_card_attempts SET state=$2,provider_transaction_id=$3,applied_at=$4,updated_at=$4 WHERE id=$1',[attempt.id,observation.kind,observation.transactionId,now]);
      const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,card_attempt_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id`,[row.merchant_id,row.id,`card_${observation.kind}`,JSON.stringify({outcome:observation.kind,source:'stored_card_verification',
          activationRequired:observation.kind==='approved'&&!paidCurrent,actor:source?.payload?.actor??{service:'internal'}}),now])).rows[0];
      await client.query("INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2)",[event.id,now]);return true;
    });
    if(recorded){await this.inbox.finishInbox(claim,{status:'complete',transactionId:observation.transactionId},this.clock());
      if(observation.kind==='approved')await this.activate(row.id).catch(()=>undefined);
    }else await this.inbox.finishInbox(claim,{status:'retry',code:'settlement_conflict',nextAttemptAt:new Date(this.clock().getTime()+60000)},this.clock());
    return true;
  }
  async activate(cardAttemptId:string){
    const record=await this.transaction(async client=>(await client.query(`SELECT a.*,s.*,a.created_at AS card_started_at,a.id AS card_attempt_id,s.id AS subscription_id,
      started.payload->>'startedStatus' AS started_status,
      EXISTS(SELECT 1 FROM subscription_billing_attempts b WHERE b.card_attempt_id=a.id) AS billing_prepared FROM subscription_card_attempts a
      JOIN merchant_subscriptions s ON s.id=a.subscription_id AND s.merchant_id=a.merchant_id
      JOIN subscription_payment_events started ON started.card_attempt_id=a.id AND started.event_type='card_setup_started'
      WHERE a.id=$1 AND a.state='approved' AND a.applied_at IS NOT NULL`,[cardAttemptId])).rows[0]);
    if(!record)return {kind:'not-found' as const};
    const source=await this.transaction(async client=>(await client.query("SELECT payload FROM subscription_payment_events WHERE card_attempt_id=$1 AND event_type='card_approved'",[cardAttemptId])).rows[0]?.payload);
    if(!source?.activationRequired)return {kind:'approved' as const,applied:true};
    if((await this.transaction(async client=>(await client.query("SELECT 1 FROM subscription_payment_events WHERE card_attempt_id=$1 AND event_type='activation_satisfied'",[cardAttemptId])).rows)).length)return {kind:'not-required' as const,applied:true};
    const cardId=openActiveSecret('merchant_subscriptions',record.subscription_id,record.windcave_card_id,this.encryption);
    if(digest(cardId??'')!==record.card_digest)return {kind:'conflict' as const};
    if(!record.billing_prepared&&activationCancelled(record))return {kind:'conflict' as const};
    const subscription=camel(record) as any,plan=renewalPlan(subscription);
    return this.billing.charge({subscriptionId:record.subscription_id,merchantId:record.merchant_id,kind:'activation',cardAttemptId,
      cardId:cardId!,amountCents:record.pending_plan_id?plan.priceCents:record.price_cents,planId:plan.id,
      idempotencyKey:`activate-${cardAttemptId}`,reference:`ACTIVATE-${cardAttemptId}`,actor:source.actor,allowRestart:record.started_status==='cancelled'});
  }
  /** Recovers a crash after card commit and before preparing its initial bill. */
  async recoverActivations(limit=10):Promise<number>{
    const rows=await this.transaction(async client=>(await client.query(`SELECT a.id FROM subscription_card_attempts a JOIN merchant_subscriptions s ON s.id=a.subscription_id
      WHERE a.state='approved' AND a.applied_at IS NOT NULL
      AND (s.cancellation_requested_at IS NULL OR s.cancellation_requested_at<=a.created_at)
      AND ((s.status<>'cancelled' AND NOT s.cancel_at_period_end) OR (s.status='cancelled' AND EXISTS(
        SELECT 1 FROM subscription_payment_events started WHERE started.card_attempt_id=a.id AND started.event_type='card_setup_started' AND started.payload->>'startedStatus'='cancelled')))
      AND EXISTS(SELECT 1 FROM subscription_payment_events e WHERE e.card_attempt_id=a.id AND e.event_type='card_approved' AND e.payload->>'activationRequired'='true')
      AND NOT EXISTS(SELECT 1 FROM subscription_payment_events resolved WHERE resolved.card_attempt_id=a.id AND resolved.event_type='activation_satisfied')
      AND NOT EXISTS(SELECT 1 FROM subscription_card_attempts newer WHERE newer.subscription_id=a.subscription_id AND newer.state='approved' AND newer.created_at>a.created_at)
      AND NOT EXISTS(SELECT 1 FROM subscription_billing_attempts b WHERE b.card_attempt_id=a.id) ORDER BY a.created_at LIMIT $1`,[Math.max(1,Math.min(20,limit))])).rows);
    for(const row of rows)await this.activate(row.id);return rows.length;
  }
}
