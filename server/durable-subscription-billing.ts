import {runWithOperationContext} from "./operation-context";
import {logOperation} from "./structured-log";
import {createHash,randomUUID} from 'node:crypto';
import {planFor,type PlanId} from '@shared/plans';
import {nextBillingPeriodStart,nextPeriodUpdates,failedPaymentUpdates,immediatePlanUpdates,MAX_PAYMENT_ATTEMPTS} from './subscription-billing';
import {addOneMonth} from './storage';
import {isSessionId,isUuid,requestFingerprint} from './durable-payment-contract';
import type {PaymentSqlPool,PaymentSqlClient} from './durable-payment-storage';
import type {PaymentCommandActor} from './payment-command';
import {renewalPaymentMethodIsReady} from './billing-card';
import {openActiveSecret} from './active-secret-vault';
import {loadDataEncryption,type DataEncryption} from './data-encryption';

export interface SubscriptionBillingIntent {
  subscriptionId:number;merchantId:number;kind:'activation'|'renewal'|'upgrade';
  cardId:string;amountCents:number;planId:PlanId;idempotencyKey:string;reference:string;
  cardAttemptId?:string;actor?:PaymentCommandActor;allowRestart?:boolean;
}
export interface SubscriptionBillingExpectation {
  attemptId:string;processorXId:string;amountCents:number;reference:string;
  environment:'uat'|'production';providerAccount:string;transactionId?:string;
}
export type StoredBillingReply={success:boolean;approved?:boolean;windcaveTransactionId?:string};
export interface SubscriptionBillingProvider {
  purchase(expected:SubscriptionBillingExpectation & {cardId:string},persistPendingId:(id:string)=>Promise<void>):Promise<StoredBillingReply>;
  query(expected:SubscriptionBillingExpectation & {transactionId:string}):Promise<StoredBillingReply>;
}
export type DurableBillingResult={kind:'approved'|'declined'|'processing'|'conflict'|'not-found'|'not-required';attemptId?:string;applied?:boolean;resolutionRequired?:boolean;reused?:boolean};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const camel=(row:any)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));

/** One durable billing application path for activation, upgrades and cron.
 * Possible acceptance always changes retries to GET; a send without a retained
 * transaction identity stays held for provider/operator reconciliation. */
export class DurableSubscriptionBilling {
  constructor(private readonly pool:PaymentSqlPool,private readonly provider:SubscriptionBillingProvider,
    private readonly context:{environment:'uat'|'production';providerAccount:string},private readonly clock=()=>new Date(),
    private readonly enabled=()=>false,private readonly encryption:DataEncryption=loadDataEncryption({})){}
  canInitiate():boolean{return this.enabled();}

  private async transaction<T>(work:(client:PaymentSqlClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL statement_timeout='5s'");const result=await work(client);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }
  private expectation(row:any):SubscriptionBillingExpectation {
    return {attemptId:row.id,processorXId:row.processor_x_id,amountCents:row.amount_cents,reference:row.reference,
      environment:row.environment,providerAccount:row.provider_account,transactionId:row.provider_transaction_id??undefined};
  }
  private terminal(row:any):DurableBillingResult|undefined {
    return row.applied_at && ['approved','declined'].includes(row.state)?{kind:row.state,attemptId:row.id,applied:true,reused:true}:undefined;
  }

  async charge(input:SubscriptionBillingIntent):Promise<DurableBillingResult>{
    if(typeof input.cardId==='string'&&input.cardId.startsWith('enc:'))input={...input,cardId:openActiveSecret('merchant_subscriptions',input.subscriptionId,input.cardId,this.encryption)!};
    if(!Number.isSafeInteger(input.subscriptionId)||input.subscriptionId<1||!Number.isSafeInteger(input.merchantId)||input.merchantId<1||
      !['activation','renewal','upgrade'].includes(input.kind)||!['solo','team','crew'].includes(input.planId)||
      !Number.isSafeInteger(input.amountCents)||input.amountCents<1||input.amountCents>2147483647||
      typeof input.cardId!=='string'||!input.cardId.length||input.cardId.length>1000||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(input.idempotencyKey)||typeof input.reference!=='string'||!input.reference.length||input.reference.length>200||
      (input.cardAttemptId!==undefined&&!isUuid(input.cardAttemptId)))throw new Error('invalid_subscription_billing_intent');
    const prepared=await this.transaction(async client=>{
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',[input.subscriptionId,input.merchantId])).rows[0];
      if(!parent)return {result:{kind:'not-found'} as DurableBillingResult};
      const rows=(await client.query(`SELECT * FROM subscription_billing_attempts WHERE subscription_id=$1
        AND (idempotency_key=$2 OR (applied_at IS NULL AND state<>'abandoned')) ORDER BY created_at FOR UPDATE`,[parent.id,input.idempotencyKey])).rows;
      const prior=rows.find(row=>row.idempotency_key===input.idempotencyKey)??rows[0];
      if(prior){
        if(prior.kind!==input.kind||prior.plan_id!==input.planId||prior.card_digest!==digest(input.cardId)||prior.merchant_id!==input.merchantId)return {result:{kind:'conflict'} as DurableBillingResult};
        if(prior.state==='abandoned')return {result:{kind:'conflict',attemptId:prior.id} as DurableBillingResult};
        // The server may recalculate proration on a later day. Use the immutable
        // prepared amount, period and reference instead of changing the purchase.
        return {id:prior.id,result:this.terminal(prior)};
      }
      if(input.kind==='activation'&&input.cardAttemptId&&(await client.query("SELECT 1 FROM subscription_payment_events WHERE card_attempt_id=$1 AND merchant_id=$2 AND event_type='activation_satisfied'",[input.cardAttemptId,parent.merchant_id])).rows.length)
        return {result:{kind:'not-required',applied:true,reused:true} as DurableBillingResult};
      if(!this.enabled())return {result:{kind:'processing'} as DurableBillingResult};
      if(input.kind==='renewal'&&(parent.cancel_at_period_end||parent.status==='cancelled'))return {result:{kind:'conflict'} as DurableBillingResult};
      if(input.kind==='activation'&&((parent.status==='cancelled'&&!input.allowRestart)||(parent.status!=='cancelled'&&parent.cancel_at_period_end)))return {result:{kind:'conflict'} as DurableBillingResult};
      if(openActiveSecret('merchant_subscriptions',parent.id,parent.windcave_card_id,this.encryption)!==input.cardId)return {result:{kind:'conflict'} as DurableBillingResult};
      if(input.cardAttemptId){const card=(await client.query(`SELECT a.id,a.created_at,e.payload->>'startedStatus' AS started_status FROM subscription_card_attempts a
        JOIN subscription_payment_events e ON e.card_attempt_id=a.id AND e.event_type='card_setup_started'
        WHERE a.id=$1 AND a.subscription_id=$2 AND a.merchant_id=$3 AND a.state='approved' AND a.card_digest=$4`,[input.cardAttemptId,parent.id,input.merchantId,digest(input.cardId)])).rows[0];
        if(!card||(parent.status==='cancelled'&&card.started_status!=='cancelled')||(parent.cancellation_requested_at&&parent.cancellation_requested_at>card.created_at))return {result:{kind:'conflict'} as DurableBillingResult};}
      if(input.kind==='activation'&&parent.status==='active'&&parent.last_billing_date&&parent.current_period_end>this.clock()){
        if(input.cardAttemptId){const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,card_attempt_id,event_type,payload,created_at)
          VALUES($1,$2,'activation_satisfied',$3::jsonb,$4) ON CONFLICT(card_attempt_id,event_type) DO NOTHING RETURNING id`,
          [parent.merchant_id,input.cardAttemptId,JSON.stringify({outcome:'activation_satisfied',reason:'already_paid',source:'billing_policy',actor:input.actor??{service:'internal'}}),this.clock()])).rows[0];
          if(event)await client.query("INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at) VALUES($1,'merchant_payment_update',$2)",[event.id,this.clock()]);}
        return {result:{kind:'not-required',applied:true} as DurableBillingResult};
      }
      const snapshot=camel(parent) as any,plan=planFor(input.planId),start=input.kind==='upgrade'?new Date(parent.current_period_start):nextBillingPeriodStart(snapshot,this.clock()),
        end=input.kind==='upgrade'?new Date(parent.current_period_end):addOneMonth(start);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return {result:{kind:'conflict'} as DurableBillingResult};
      const id=randomUUID(),fingerprint=requestFingerprint({subscriptionId:parent.id,merchantId:input.merchantId,kind:input.kind,
        amountCents:input.amountCents,currency:'NZD',reference:input.reference,planId:input.planId,periodStart:start.toISOString(),periodEnd:end.toISOString(),
        cardDigest:digest(input.cardId),...this.context,idempotencyKey:input.idempotencyKey});
      const attemptNumber=input.kind==='upgrade'?(await client.query("SELECT coalesce(max(attempt_number),0)::int+1 AS n FROM subscription_billing_attempts WHERE subscription_id=$1 AND kind='upgrade' AND period_start=$2 AND plan_id=$3",[parent.id,start,input.planId])).rows[0].n:(parent.failed_payment_count??0)+1;
      await client.query(`INSERT INTO subscription_billing_attempts(id,subscription_id,merchant_id,card_attempt_id,kind,idempotency_key,request_fingerprint,
        processor_x_id,amount_cents,reference,environment,provider_account,card_digest,plan_id,prior_plan_id,prior_status,price_cents,seat_limit,period_start,period_end,attempt_number,actor,created_at,updated_at,next_attempt_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$23,$23)`,
        [id,parent.id,input.merchantId,input.cardAttemptId??null,input.kind,input.idempotencyKey,fingerprint,id.replace(/-/g,'').slice(0,16),input.amountCents,
          input.reference,this.context.environment,this.context.providerAccount,digest(input.cardId),input.planId,parent.plan_id,parent.status,
          input.kind==='upgrade'?plan.priceCents:input.amountCents,input.kind==='upgrade'?plan.seats:(parent.pending_plan_id?plan.seats:parent.seat_limit),start,end,attemptNumber,JSON.stringify(input.actor??{service:'internal'}),this.clock()]);
      if(input.kind!=='upgrade')await client.query('UPDATE merchant_subscriptions SET next_billing_date=COALESCE(next_billing_date,$2),updated_at=$3 WHERE id=$1',[parent.id,start,this.clock()]);
      return {id};
    });
    if(prepared.result)return prepared.result;
    return prepared.id?this.run(prepared.id,input.cardId):{kind:'processing'};
  }

  /** The identity commit is allowed after a lease expires; it cannot apply an
   * outcome. It protects a bank-accepted transaction from losing its only handle. */
  private async rememberTransaction(id:string,transactionId:string):Promise<void>{
    if(!isSessionId(transactionId))throw new Error('invalid_billing_transaction_identity');
    await this.transaction(async client=>{
      const locator=(await client.query('SELECT subscription_id FROM subscription_billing_attempts WHERE id=$1',[id])).rows[0];if(!locator)throw new Error('billing_attempt_missing');
      await client.query('SELECT id FROM merchant_subscriptions WHERE id=$1 FOR UPDATE',[locator.subscription_id]);
      const row=(await client.query('SELECT * FROM subscription_billing_attempts WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(row.provider_transaction_id && row.provider_transaction_id!==transactionId)throw new Error('billing_transaction_identity_conflict');
      await client.query('UPDATE subscription_billing_attempts SET provider_transaction_id=COALESCE(provider_transaction_id,$2),updated_at=$3 WHERE id=$1',[id,transactionId,this.clock()]);
    });
  }
  private async run(id:string,cardId?:string):Promise<DurableBillingResult>{
    const owner=randomUUID(),now=this.clock();
    const claimed=await this.transaction(async client=>{
      const locator=(await client.query('SELECT subscription_id FROM subscription_billing_attempts WHERE id=$1',[id])).rows[0];if(!locator)return undefined;
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 FOR UPDATE',[locator.subscription_id])).rows[0];
      const row=(await client.query('SELECT * FROM subscription_billing_attempts WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(this.terminal(row))return {terminal:this.terminal(row)};
      if(row.state==='abandoned')return {terminal:{kind:'conflict',attemptId:id} as DurableBillingResult};
      if(row.environment!==this.context.environment||row.provider_account!==this.context.providerAccount)return undefined;
      if((row.lease_expires_at && row.lease_expires_at>now)||row.next_attempt_at>now||row.reconciliation_count>=20)return undefined;
      const send=!row.send_started_at;
      if(send){
        const withdrawn=(row.kind==='renewal'&&(parent.cancel_at_period_end||parent.status==='cancelled'))||
          (row.kind==='upgrade'&&(parent.status!=='active'||parent.cancel_at_period_end))||
          (row.kind==='activation'&&((parent.status==='cancelled'&&row.prior_status!=='cancelled')||
            (parent.cancellation_requested_at&&parent.cancellation_requested_at>row.created_at)));
        if(withdrawn){
          await client.query("UPDATE subscription_billing_attempts SET state='abandoned',last_error_code='cancelled_before_send',updated_at=$2 WHERE id=$1 AND send_started_at IS NULL",[id,now]);
          const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,billing_attempt_id,event_type,payload,created_at)
            VALUES($1,$2,'billing_abandoned',$3::jsonb,$4) RETURNING id`,[row.merchant_id,id,JSON.stringify({kind:row.kind,outcome:'activation_cancelled',actor:row.actor,source:'billing_policy',reason:'cancelled_before_send'}),now])).rows[0];
          await client.query("INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at) VALUES($1,'merchant_payment_update',$2)",[event.id,now]);
          return {terminal:{kind:'conflict',attemptId:id} as DurableBillingResult};
        }
        cardId??=openActiveSecret('merchant_subscriptions',parent.id,parent.windcave_card_id,this.encryption)??undefined;
        if(!this.enabled()||!cardId||digest(cardId)!==row.card_digest||
          (row.kind==='renewal'&&(parent.cancel_at_period_end||parent.status==='cancelled'))||
          (row.kind==='activation'&&((parent.status==='cancelled'&&row.prior_status!=='cancelled')||
            (parent.cancellation_requested_at&&parent.cancellation_requested_at>row.created_at))))return undefined;
      }else if(!row.provider_transaction_id)return undefined;
      const updated=(await client.query(`UPDATE subscription_billing_attempts SET lease_owner=$2,lease_expires_at=$3::timestamptz+interval '1 minute',
        lease_generation=lease_generation+1,reconciliation_count=reconciliation_count+1,send_started_at=COALESCE(send_started_at,$3),updated_at=$3 WHERE id=$1 RETURNING *`,[id,owner,now])).rows[0];
      return {row:updated,send};
    });
    if(claimed?.terminal)return claimed.terminal;
    if(!claimed?.row)return {kind:'processing',attemptId:id};
    const row=claimed.row;let reply:StoredBillingReply;
    try{
      const expected=this.expectation(row);
      reply=claimed.send?await this.provider.purchase({...expected,cardId:cardId!},transaction=>this.rememberTransaction(id,transaction)):
        await this.provider.query({...expected,transactionId:row.provider_transaction_id});
      if(reply.windcaveTransactionId)await this.rememberTransaction(id,reply.windcaveTransactionId);
      if(!reply.success||typeof reply.approved!=='boolean'||!isSessionId(reply.windcaveTransactionId))throw new Error('billing_outcome_unknown');
      return await this.finalize(row,owner,reply);
    }catch(error){
      const code=(error as {code?:unknown})?.code;
      if(typeof code==='string'&&['23514','23505','42P08','42804','42P18','23502','22007','42703','42P01'].includes(code))logOperation('error','BILLING_LOCAL_COMMIT_UNAVAILABLE',{code});
      await this.transaction(async client=>{await client.query(`UPDATE subscription_billing_attempts SET state='unknown',lease_owner=NULL,lease_expires_at=NULL,
        next_attempt_at=$4::timestamptz+interval '1 minute',last_error_code='outcome_unconfirmed',updated_at=$4
        WHERE id=$1 AND lease_owner=$2 AND lease_generation=$3`,[id,owner,row.lease_generation,this.clock()]);}).catch(()=>undefined);
      return {kind:'processing',attemptId:id};
    }
  }
  private async finalize(claim:any,owner:string,reply:StoredBillingReply):Promise<DurableBillingResult>{
    return this.transaction(async client=>{
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',[claim.subscription_id,claim.merchant_id])).rows[0];
      const row=(await client.query('SELECT * FROM subscription_billing_attempts WHERE id=$1 FOR UPDATE',[claim.id])).rows[0];
      const terminal=this.terminal(row);if(terminal)return terminal;
      const now=this.clock();
      if(!parent||row.lease_owner!==owner||row.lease_generation!==claim.lease_generation||row.lease_expires_at<=now||row.lease_expires_at<=new Date()||row.provider_transaction_id!==reply.windcaveTransactionId)return {kind:'processing',attemptId:row.id};
      const approved=reply.approved===true,outcome=approved?'approved':'declined';
      // A changed parent never erases captured money. Keep the attempt held if
      // entitlement application needs operator resolution; history/audit survive.
      const drift=parent.plan_id!==row.prior_plan_id||(parent.status==='cancelled'&&row.prior_status!=='cancelled')||
        (row.kind==='activation'&&parent.cancellation_requested_at&&parent.cancellation_requested_at>row.created_at)||
        (row.kind==='upgrade'&&new Date(parent.current_period_end).getTime()!==row.period_end.getTime());
      const resolutionRequired=approved&&drift;
      await client.query(`INSERT INTO subscription_billing_history(merchant_id,subscription_id,billing_type,amount,billing_period_start,billing_period_end,
        windcave_transaction_id,idempotency_key,attempt_number,status,description,failure_reason,paid_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [row.merchant_id,row.subscription_id,row.kind==='upgrade'?'plan_change':'monthly_subscription',(row.amount_cents/100).toFixed(2),row.period_start,row.period_end,
          reply.windcaveTransactionId,row.idempotency_key,row.attempt_number,approved?'succeeded':'failed',`${planFor(row.plan_id).name} subscription`,approved?null:'Card declined',approved?now:null]);
      const snapshot=camel(parent) as any;
      let patch:Record<string,unknown>={};
      if(!resolutionRequired){
        if(approved){
          patch=row.kind==='upgrade'?immediatePlanUpdates(row.plan_id,now):{
            ...nextPeriodUpdates({...snapshot,pendingPlanId:null,planId:row.plan_id,priceCents:row.price_cents,seatLimit:row.seat_limit},now,row.period_start),
            currentPeriodEnd:row.period_end,nextBillingDate:row.period_end};
          if(row.kind==='activation'&&row.prior_status==='cancelled'&&parent.status==='cancelled'){
            // This authenticated card activation explicitly restarts an ended
            // subscription. A cancellation made after another attempt stays set.
            patch.cancelAtPeriodEnd=false;patch.cancellationRequestedAt=null;
            patch.cancellationEffectiveDate=null;patch.cancellationReason=null;
          }
        }else if(row.kind!=='upgrade'&&parent.status!=='cancelled')patch=failedPaymentUpdates(snapshot,now,'Card declined',(parent.failed_payment_count??0)+1>=MAX_PAYMENT_ATTEMPTS);
        const entries=Object.entries(patch).filter(([key])=>key!=='updatedAt');
        const names=entries.map(([key])=>key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()));
        const values=entries.map(([,value])=>value);
        await client.query(`UPDATE merchant_subscriptions SET ${names.map((name,index)=>`${name}=$${index+2}`).concat(['billing_claim_token=NULL','billing_claimed_at=NULL',`updated_at=$${values.length+2}`]).join(',')} WHERE id=$1`,[parent.id,...values,now]);
      }
      const eventType=`billing_${outcome}`;
      const payload=JSON.stringify({kind:row.kind,planId:row.plan_id,amountCents:row.amount_cents,currency:row.currency,outcome,
        periodStart:row.period_start.toISOString(),periodEnd:row.period_end.toISOString(),resolutionRequired,previousStatus:parent.status,actor:row.actor});
      const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,billing_attempt_id,event_type,payload,created_at)
        VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (billing_attempt_id,event_type) DO NOTHING RETURNING id`,[row.merchant_id,row.id,eventType,payload,now])).rows[0]??
        (await client.query('SELECT id FROM subscription_payment_events WHERE billing_attempt_id=$1 AND event_type=$2',[row.id,eventType])).rows[0];
      for(const channel of ['merchant_payment_update','payer_receipt'])await client.query(`INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at)
        VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[event.id,channel,now]);
      await client.query(`UPDATE subscription_billing_attempts SET state=$2,applied_at=CASE WHEN $3 THEN NULL ELSE $4::timestamptz END,lease_owner=NULL,lease_expires_at=NULL,
        last_error_code=CASE WHEN $3 THEN 'parent_resolution_required' ELSE NULL END,updated_at=$4 WHERE id=$1`,[row.id,outcome,resolutionRequired,now]);
      return {kind:outcome,attemptId:row.id,applied:!resolutionRequired,resolutionRequired};
    });
  }
  async reconcileDue(limit=10,canContinue=()=>true):Promise<number>{
    return runWithOperationContext({jobId:randomUUID()},async()=>{
    const rows=await this.transaction(async client=>(await client.query(`SELECT id FROM subscription_billing_attempts WHERE applied_at IS NULL AND state<>'abandoned'
      AND next_attempt_at<=$1 AND (lease_expires_at IS NULL OR lease_expires_at<=$1) AND reconciliation_count<20
      AND (send_started_at IS NULL OR provider_transaction_id IS NOT NULL)
      AND last_error_code IS DISTINCT FROM 'parent_resolution_required' ORDER BY next_attempt_at,id LIMIT $2`,[this.clock(),Math.max(1,Math.min(20,limit))])).rows);
    let processed=0;for(const row of rows){if(!canContinue())break;await this.run(row.id);processed++;}return processed;

    });
  }
  /** A policy failure has no provider send/outcome. Audit it separately from a
   * card decline, while preserving the same period/key/dunning atomicity. */
  async recordMissingPaymentMethod(input:Omit<SubscriptionBillingIntent,'cardId'>):Promise<DurableBillingResult>{
    if(!this.enabled())return {kind:'processing'};
    return this.transaction(async client=>{
      const parent=(await client.query('SELECT * FROM merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',[input.subscriptionId,input.merchantId])).rows[0];
      if(!parent)return {kind:'not-found'};
      const prior=(await client.query('SELECT * FROM subscription_billing_attempts WHERE subscription_id=$1 AND idempotency_key=$2',[parent.id,input.idempotencyKey])).rows[0];
      if(prior)return this.terminal(prior)??{kind:'processing',attemptId:prior.id};
      if(renewalPaymentMethodIsReady(camel(parent),this.clock())||(parent.failed_payment_count??0)>=MAX_PAYMENT_ATTEMPTS||parent.cancel_at_period_end||parent.status==='cancelled'||(await client.query("SELECT 1 FROM subscription_billing_attempts WHERE subscription_id=$1 AND applied_at IS NULL AND state<>'abandoned'",[parent.id])).rows.length)return {kind:'conflict'};
      const now=this.clock(),snapshot=camel(parent) as any,start=nextBillingPeriodStart(snapshot,now),end=addOneMonth(start),plan=planFor(input.planId),id=randomUUID();
      const amount=parent.pending_plan_id?plan.priceCents:parent.price_cents,attemptNumber=(parent.failed_payment_count??0)+1;
      await client.query(`INSERT INTO subscription_billing_attempts(id,subscription_id,merchant_id,kind,idempotency_key,request_fingerprint,processor_x_id,
        amount_cents,reference,environment,provider_account,card_digest,plan_id,prior_plan_id,prior_status,price_cents,seat_limit,period_start,period_end,attempt_number,state,applied_at,created_at,updated_at,next_attempt_at,last_error_code)
        VALUES($1,$2,$3,'renewal',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$7,$15,$16,$17,$18,'declined',$19,$19,$19,$19,'payment_method_missing')`,
        [id,parent.id,input.merchantId,input.idempotencyKey,requestFingerprint({subscriptionId:parent.id,idempotencyKey:input.idempotencyKey,source:'billing_policy',amountCents:amount,periodStart:start.toISOString()}),
          id.replace(/-/g,'').slice(0,16),amount,input.reference,this.context.environment,this.context.providerAccount,digest(openActiveSecret('merchant_subscriptions',parent.id,parent.windcave_card_id,this.encryption)??''),input.planId,parent.plan_id,parent.status,parent.pending_plan_id?plan.seats:parent.seat_limit,start,end,attemptNumber,now]);
      await client.query(`UPDATE merchant_subscriptions SET status=$2,failed_payment_count=$3,last_payment_failure_at=$4,last_payment_failure_reason='No payment method on file',
        billing_claim_token=NULL,billing_claimed_at=NULL,updated_at=$4 WHERE id=$1`,[parent.id,attemptNumber>=MAX_PAYMENT_ATTEMPTS?'suspended':'past_due',attemptNumber,now]);
      await client.query(`INSERT INTO subscription_billing_history(merchant_id,subscription_id,billing_type,amount,billing_period_start,billing_period_end,idempotency_key,attempt_number,status,description,failure_reason)
        VALUES($1,$2,'monthly_subscription',$3,$4,$5,$6,$7,'failed','Subscription renewal unavailable','No payment method on file')`,[parent.merchant_id,parent.id,(amount/100).toFixed(2),start,end,input.idempotencyKey,attemptNumber]);
      const event=(await client.query(`INSERT INTO subscription_payment_events(merchant_id,billing_attempt_id,event_type,payload,created_at)
        VALUES($1,$2,'billing_method_missing',$3::jsonb,$4) RETURNING id`,[parent.merchant_id,id,JSON.stringify({source:'billing_policy',outcome:'not_charged',amountCents:amount,currency:'NZD',planId:input.planId}),now])).rows[0];
      for(const channel of ['merchant_payment_update','payer_receipt'])await client.query('INSERT INTO payment_delivery_outbox(subscription_event_id,channel,next_attempt_at) VALUES($1,$2,$3)',[event.id,channel,now]);
      return {kind:'declined',attemptId:id,applied:true};
    });
  }
}
