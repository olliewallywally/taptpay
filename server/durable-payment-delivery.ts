import {createHash,randomUUID} from 'node:crypto';
import type {PaymentSqlPool,PaymentSqlClient} from './durable-payment-storage';
import type {IdempotentPaymentEventReceiver} from './payment-outbox';
import {GST_RATE} from '@shared/trades-gst';
import {parseCentsExact} from './windcave-query';
import {merchantSseTransactionDto} from './http-contracts';
import {normalizePushNotificationPreferences} from '@shared/schema';

type Domain='retail'|'property'|'trades'|'subscription';
type Communication={domain:Domain;eventId:string;reference:string;amountCents?:number;outcome:string;shareIndex?:number;
  businessName:string;customerName?:string;billingUrl?:string;gstRegistered?:boolean;gstNumber?:string|null;previousStatus?:string;resolutionRequired?:boolean;createdAt:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(cents:number)=>`NZD ${(cents/100).toFixed(2)}`;
export function renderPaymentCommunication(input:Communication){
  const label=input.domain==='subscription'&&input.outcome==='approved'?'Subscription payment confirmed':
    input.outcome==='activation_satisfied'?'Payment method verified; subscription already paid':
    input.outcome==='activation_cancelled'?'Subscription charge cancelled before send':
    input.outcome==='card_approved'?'Payment method verified':input.outcome==='card_declined'?'Payment method verification declined':
    input.outcome==='not_charged'?'Subscription payment method needs attention':
    input.outcome==='quote_accepted'?'Quote accepted':input.outcome==='quote_declined'?'Quote declined':input.outcome==='quote_blocked'?'Quote acceptance needs billing attention':
    input.outcome==='quote_expired'?'Quote expired':input.outcome==='created'?'Payment request created':input.outcome==='cash'?'Cash recorded':input.outcome==='external'?'External payment recorded':input.outcome==='approved'?'Payment received':
    input.outcome==='declined'?'Payment declined':input.outcome==='cancelled'?'Payment cancelled':'Payment update';
  const lines=[input.businessName,label,`Reference: ${input.reference}`,`Date: ${input.createdAt}`];
  if(input.amountCents!==undefined)lines.push(`Amount: ${money(input.amountCents)}`);
  if(input.shareIndex)lines.push(`Share ${input.shareIndex}`);
  if(input.outcome==='quote_blocked'){
    if(input.customerName)lines.push(`Customer: ${input.customerName}`);
    lines.push('A customer tried to accept this quote. Open Billing to restore online acceptance.');
    if(input.billingUrl)lines.push(`Billing: ${input.billingUrl}`);
  }
  if(input.outcome==='not_charged')lines.push('No subscription charge was sent. Update your payment method in Billing.');
  if(input.outcome==='activation_cancelled')lines.push('No new subscription charge was sent.');
  if(input.outcome==='activation_satisfied')lines.push('No additional subscription charge was sent.');
  if(input.resolutionRequired)lines.push('The provider payment is recorded. Subscription access requires review because its state changed during payment.');
  if(input.previousStatus&&['cancelled','voided','paid_external'].includes(input.previousStatus)&&input.outcome==='approved')
    lines.push(`Provider payment received for a record previously ${input.previousStatus}. Review this payment in TaptPay.`);
  if(input.amountCents!==undefined&&['approved','cash','external'].includes(input.outcome)&&['retail','trades'].includes(input.domain)&&input.gstRegistered){
    lines.push(`GST (15%) included: ${money(Math.round(input.amountCents-input.amountCents/(1+GST_RATE)))}`);
    if(input.gstNumber)lines.push(`GST number: ${input.gstNumber}`);
  }
  return {subject:`${label} — ${input.reference}`,text:lines.join('\n'),html:`<div>${lines.map(line=>`<p>${escape(line)}</p>`).join('')}</div>`};
}
export type DeliveryTarget={id:string;outbox_id:string;merchant_id:number;kind:'email'|'push'|'sse'|'skip';payload:any;
  push_subscription_id:number|null;state:string;first_send_at:Date|null;lease_owner:string|null;lease_generation:number;lease_expires_at:Date|null};
export interface PaymentDeliveryPorts {
  ready(target:DeliveryTarget):boolean;
  send(target:DeliveryTarget,key:string):Promise<void>;
}
export class PaymentDestinationChanged extends Error {}
const email=(value:unknown):value is string=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const camel=(row:any)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]));

/** Each concrete outbox owns immutable destinations. Network I/O happens after
 * target preparation and a fenced send marker, outside database row locks. */
export class DurablePaymentDelivery implements IdempotentPaymentEventReceiver {
  constructor(private readonly pool:PaymentSqlPool,private readonly ports:PaymentDeliveryPorts,private readonly from:string,
    private readonly clock=()=>new Date(),private readonly publicOrigin?:string){}
  private async transaction<T>(work:(client:PaymentSqlClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL statement_timeout='5s'");const value=await work(client);await client.query('COMMIT');return value;
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }
  private async snapshot(client:PaymentSqlClient,outbox:any){
    let event:any,parent:any,domain:Domain,shareIndex=0,payerEmail:string|undefined,reference:string;
    if(outbox.event_id){
      const row=(await client.query(`SELECT e.*,b.payment_attempt_id,b.invoice_attempt_id,
        to_jsonb(t) AS retail,to_jsonb(i) AS property,to_jsonb(j) AS trades,
        a.share_index AS retail_share,v.share_index AS invoice_share,v.payer_email
        FROM payment_settlement_events e JOIN payment_session_bindings b ON b.session_id=e.session_id
        LEFT JOIN payment_attempts a ON a.id=b.payment_attempt_id LEFT JOIN transactions t ON t.id=a.transaction_id AND t.merchant_id=e.merchant_id
        LEFT JOIN invoice_payment_attempts v ON v.id=b.invoice_attempt_id
        LEFT JOIN invoices_rent_requests i ON i.id=v.rent_invoice_id AND i.merchant_id=e.merchant_id
        LEFT JOIN job_invoices j ON j.id=v.job_invoice_id AND j.merchant_id=e.merchant_id WHERE e.id=$1`,[outbox.event_id])).rows[0];
      if(!row)throw Error('delivery_event_missing');event=row;parent=row.retail??row.property??row.trades;
      domain=row.retail?'retail':row.property?'property':'trades';shareIndex=row.retail_share??row.invoice_share??0;payerEmail=row.payer_email??undefined;
    }else if(outbox.subscription_event_id){
      const row=(await client.query(`SELECT e.*,coalesce(e.subscription_id,c.subscription_id,b.subscription_id) AS subscription_id
        FROM subscription_payment_events e LEFT JOIN subscription_card_attempts c ON c.id=e.card_attempt_id
        LEFT JOIN subscription_billing_attempts b ON b.id=e.billing_attempt_id WHERE e.id=$1`,[outbox.subscription_event_id])).rows[0];
      if(!row)throw Error('delivery_event_missing');event=row;parent={id:row.subscription_id};domain='subscription';
    }else if(outbox.transaction_event_id){
      event=(await client.query('SELECT * FROM transaction_events WHERE id=$1',[outbox.transaction_event_id])).rows[0];
      if(!event)throw Error('delivery_event_missing');domain=event.transaction_id?'retail':'property';
      parent=(await client.query(domain==='retail'?'SELECT * FROM transactions WHERE id=$1 AND merchant_id=$2':
        'SELECT * FROM invoices_rent_requests WHERE id=$1 AND merchant_id=$2',[event.transaction_id??event.invoice_id,event.merchant_id])).rows[0];
    }else{
      event=(await client.query('SELECT * FROM job_events WHERE id=$1',[outbox.job_event_id])).rows[0];
      if(!event)throw Error('delivery_event_missing');domain='trades';
      parent=(await client.query(event.quote_id&&event.event_type.startsWith('quote_')?'SELECT *,total_cents AS amount_cents FROM quotes WHERE id=$1 AND merchant_id=$2':
        'SELECT * FROM job_invoices WHERE id=$1 AND merchant_id=$2',[event.quote_id&&event.event_type.startsWith('quote_')?event.quote_id:event.job_invoice_id,event.merchant_id])).rows[0];
    }
    if(!parent)throw Error('delivery_parent_missing');
    const merchant=(await client.query('SELECT * FROM merchants WHERE id=$1',[event.merchant_id])).rows[0];if(!merchant)throw Error('delivery_owner_missing');
    const payload=event.payload??{},eventType=event.event_type??'',outcome=eventType==='card_approved'||eventType==='card_declined'?eventType:event.outcome??payload.outcome??
      (eventType==='quote_acceptance_blocked'?'quote_blocked':eventType.startsWith('quote_')?eventType:
      eventType==='Sale_Created'?'created':eventType==='Cash_Recorded'?'cash':payload.action==='manualPaid'?'external':payload.action==='cancel'||payload.action==='void'?'cancelled':'update');
    const price=domain==='retail'?parseCentsExact(parent.price):undefined;
    const amountCents=event.amount_cents??payload.amountCents??parent.amount_cents??(price?.ok?price.cents:undefined);
    reference=`${eventType.startsWith('quote_')?'QUOTE':domain==='retail'?'SALE':domain==='property'?'RENT':domain==='trades'?'JOB':'SUB'}-${String(parent.id).slice(0,8).toUpperCase()}`;
    const communication:Communication={domain,eventId:event.id,reference,amountCents,outcome,shareIndex,businessName:merchant.business_name||merchant.name,
      gstRegistered:merchant.gst_registered,gstNumber:merchant.gst_number,previousStatus:event.previous_aggregate_status,resolutionRequired:payload.resolutionRequired===true,createdAt:event.created_at.toISOString()};
    if(domain==='subscription')payerEmail=merchant.contact_email||merchant.email;
    if(outcome==='quote_blocked'){
      const party=(await client.query('SELECT first_name,last_name FROM client_profiles WHERE id=$1 AND merchant_id=$2',[parent.client_profile_id,event.merchant_id])).rows[0];
      if(!party)throw Error('delivery_customer_missing');
      communication.customerName=[party.first_name,party.last_name].filter(Boolean).join(' ');
      if(this.publicOrigin)communication.billingUrl=new URL('/settings?section=billing',this.publicOrigin).toString();
    }
    if(outcome==='external'&&domain!=='retail'){
      const table=domain==='property'?'tenant_profiles':'client_profiles',party=parent.tenant_profile_id??parent.client_profile_id;
      payerEmail=(await client.query(`SELECT email FROM ${table} WHERE id=$1 AND merchant_id=$2`,[party,event.merchant_id])).rows[0]?.email;
    }
    return {communication,parent,merchant,payerEmail,eventType};
  }
  private async prepare(input:Parameters<IdempotentPaymentEventReceiver['deliver']>[0]):Promise<DeliveryTarget[]>{
    return this.transaction(async client=>{
      const outbox=(await client.query('SELECT * FROM payment_delivery_outbox WHERE id=$1 FOR UPDATE',[input.deliveryKey])).rows[0];
      const eventId=outbox?.event_id??outbox?.transaction_event_id??outbox?.job_event_id??outbox?.subscription_event_id;
      const source=outbox?.event_id?'provider_settlement':outbox?.transaction_event_id?'transaction_event':outbox?.job_event_id?'job_event':'subscription_event';
      if(!outbox||eventId!==input.eventId||source!==input.eventSource||outbox.channel!==input.channel)throw Error('delivery_identity_mismatch');
      if(!outbox.targets_prepared_at){
        const {communication,parent,merchant,payerEmail,eventType}=await this.snapshot(client,outbox),rendered=renderPaymentCommunication(communication);
        const targets:{kind:DeliveryTarget['kind'];key:string;payload:any;pushId?:number}[]=[];
        if(input.channel==='payer_receipt'){
          if(email(payerEmail))targets.push({kind:'email',key:`payer:${hash(payerEmail.toLowerCase())}`,payload:{to:payerEmail,from:this.from,...rendered}});
          else if(payerEmail)throw Error('delivery_recipient_invalid');
          else targets.push({kind:'skip',key:'no_requested_receipt',payload:{reason:'no_requested_receipt'}});
        }else{
          // Merchant-only delivery for late captures: an old bill cannot replace
          // a newer bill on an anonymous payment board.
          const late=['cancelled','voided','paid_external'].includes(communication.previousStatus??'');
          const transaction=communication.domain==='retail'?merchantSseTransactionDto(camel(parent) as Parameters<typeof merchantSseTransactionDto>[0]):undefined;
          targets.push({kind:'sse',key:'realtime',payload:{merchantId:merchant.id,stoneId:late?null:parent.tapt_stone_id??null,
            message:{type:transaction?'transaction_updated':'payment_updated',eventId:input.eventId,merchantOnly:late||!transaction||!!parent.payment_token_hash,
              ...(transaction?{transaction}:{}),reference:communication.reference}}});
          if(communication.domain!=='subscription'&&!['Split_Configured','Sale_Created'].includes(eventType)&&
            (!eventType.startsWith('quote_')||eventType==='quote_acceptance_blocked')&&email(merchant.contact_email||merchant.email))targets.push({kind:'email',key:'merchant_email',payload:{to:merchant.contact_email||merchant.email,from:this.from,...rendered}});
          // No notification for mere card-session preparation.
          if(!['card_setup_started','Split_Configured'].includes(eventType)&&!eventType.startsWith('quote_')){
            const subscriptions=(await client.query('SELECT * FROM push_subscriptions WHERE merchant_id=$1 AND is_active=true ORDER BY id LIMIT 1001',[merchant.id])).rows;
            if(subscriptions.length>1000)throw Error('delivery_fanout_limit');
            for(const sub of subscriptions){const preferences=normalizePushNotificationPreferences(sub.preferences);
              if((communication.outcome==='approved'||communication.outcome==='cash'||communication.outcome==='external')&&!preferences.paymentReceived)continue;
              if(['declined','cancelled'].includes(communication.outcome)&&!preferences.failedPaymentAlerts)continue;
              targets.push({kind:'push',key:`push:${sub.id}`,pushId:sub.id,payload:{endpointDigest:hash(sub.endpoint),
                native:sub.endpoint.startsWith('apns://'),
                notification:{title:rendered.subject,body:communication.amountCents===undefined?communication.reference:money(communication.amountCents),
                  tag:`payment-event-${input.eventId}`,data:{eventId:input.eventId,url:'/transactions'}}}});
            }
          }
        }
        const now=this.clock(),records=targets.map(target=>({kind:target.kind,target_key:target.key,push_subscription_id:target.pushId??null,
          payload:target.payload,payload_hash:hash(JSON.stringify(target.payload)),state:target.kind==='skip'?'complete':'pending',completed_at:target.kind==='skip'?now.toISOString():null}));
        await client.query(`INSERT INTO payment_delivery_targets(outbox_id,merchant_id,kind,target_key,push_subscription_id,payload,payload_hash,
          state,completed_at,created_at,updated_at) SELECT $1,$2,r.kind,r.target_key,r.push_subscription_id,r.payload,r.payload_hash,r.state,r.completed_at,$3,$3
          FROM jsonb_to_recordset($4::jsonb) AS r(kind text,target_key text,push_subscription_id integer,payload jsonb,payload_hash text,state text,completed_at timestamptz)`,
          [outbox.id,merchant.id,now,JSON.stringify(records)]);
        await client.query('UPDATE payment_delivery_outbox SET targets_prepared_at=$2 WHERE id=$1',[outbox.id,now]);
      }
      return (await client.query('SELECT * FROM payment_delivery_targets WHERE outbox_id=$1 ORDER BY id',[outbox.id])).rows;
    });
  }
  private async claim(id:string):Promise<DeliveryTarget|undefined>{
    return this.transaction(async client=>{
      const row=(await client.query('SELECT * FROM payment_delivery_targets WHERE id=$1 FOR UPDATE',[id])).rows[0],now=this.clock();
      if(!row||['complete','held'].includes(row.state)||(row.state==='sending'&&row.lease_expires_at>now))return undefined;
      const expiredEmail=row.kind==='email'&&row.first_send_at&&now.getTime()-row.first_send_at.getTime()>=23*3600000;
      if((row.kind==='push'&&row.first_send_at)||expiredEmail){await client.query(`UPDATE payment_delivery_targets SET state='held',lease_owner=NULL,
        lease_expires_at=NULL,last_error_code=$2,updated_at=$3 WHERE id=$1`,[id,expiredEmail?'dedup_window_expired':'delivery_unknown',now]);return undefined;}
      if(!this.ports.ready(row)){await client.query("UPDATE payment_delivery_targets SET state='pending',lease_owner=NULL,lease_expires_at=NULL,last_error_code='credentials_unavailable',updated_at=$2 WHERE id=$1",[id,now]);return undefined;}
      return (await client.query(`UPDATE payment_delivery_targets SET state='sending',lease_owner=$2,lease_generation=lease_generation+1,
        lease_expires_at=$3::timestamptz+interval '1 minute',first_send_at=coalesce(first_send_at,$3),updated_at=$3 WHERE id=$1 RETURNING *`,[id,randomUUID(),now])).rows[0];
    });
  }
  async deliver(input:Parameters<IdempotentPaymentEventReceiver['deliver']>[0]):Promise<void>{
    const targets=await this.prepare(input);
    for(const target of targets){const claim=await this.claim(target.id);if(!claim)continue;
      let success=false,skipped=false;try{await this.ports.send(claim,`taptpay-r3/${claim.id}`);success=true;}catch(error){skipped=error instanceof PaymentDestinationChanged;success=skipped;}
      await this.transaction(async client=>{const now=this.clock();await client.query(`UPDATE payment_delivery_targets SET state=$4,lease_owner=NULL,
        lease_expires_at=NULL,completed_at=CASE WHEN $4='complete' THEN $5::timestamptz ELSE NULL END,
        last_error_code=CASE WHEN $6 THEN 'destination_changed' WHEN $4='complete' THEN NULL ELSE 'delivery_unknown' END,updated_at=$5
        WHERE id=$1 AND lease_owner=$2 AND lease_generation=$3 AND state='sending' AND lease_expires_at>GREATEST($5::timestamptz,clock_timestamp())`,
        [claim.id,claim.lease_owner,claim.lease_generation,success?'complete':claim.kind==='push'?'held':'pending',now,skipped]);});
    }
    const remaining=await this.transaction(async client=>(await client.query("SELECT 1 FROM payment_delivery_targets WHERE outbox_id=$1 AND state<>'complete' LIMIT 1",[input.deliveryKey])).rows.length);
    if(remaining)throw Error('delivery_incomplete');
  }
  /** Each app instance observes the committed realtime feed independently of
   * the worker's distributed claim. A sliding window also catches late commits. */
  async realtime(since:Date,seen:Set<string>,canContinue=()=>true):Promise<void>{
    let offset=0;
    for(let page=0;page<10&&canContinue();page++){
      const rows=await this.transaction(async client=>(await client.query("SELECT * FROM payment_delivery_targets WHERE kind='sse' AND created_at>=$1 ORDER BY created_at,id LIMIT 500 OFFSET $2",[since,offset])).rows);
      for(const row of rows){if(!canContinue())return;if(seen.has(row.id))continue;await this.ports.send(row,`taptpay-r3/${row.id}`);seen.add(row.id);}
      if(rows.length<500)break;offset+=rows.length;
    }
    if(seen.size>10000)for(const id of [...seen].slice(0,seen.size-10000))seen.delete(id);
  }
}
