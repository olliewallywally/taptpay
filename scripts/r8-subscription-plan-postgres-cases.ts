/** Owned-pool synthetic command and paid-plan cases; caller validates target. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import type {PlanUpgradeChargeExecutor} from '../server/storage';

export async function runSubscriptionPlanPostgresCases(pools:pg.Pool[]):Promise<{checks:number;originalCommandChecks:number;paidPlanChecks:number}>{
  assert.equal(pools.length,2,'TWO_CALLER_OWNED_POOLS_REQUIRED');
  assert.notEqual(pools[0],pools[1],'INDEPENDENT_CALLER_POOLS_REQUIRED');
  const {DatabaseStorage}=await import('../server/storage');
  const {DurableSubscriptionBilling}=await import('../server/durable-subscription-billing');
  const schema=await import('../shared/schema');
  const pool=pools[0];
  // Preserve the existing command fixtures' intentionally dynamic storage seam.
  const stores:any[]=pools.map(p=>new DatabaseStorage(drizzle(p,{schema}) as any));
  let passed=0;const failures:string[]=[];
async function check(name:string,test:()=>Promise<void>){try{await test();passed++;console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name} (${(error as any)?.code??'assertion_failure'})`);}}
async function fixture(){
  const merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3 commands','R3 commands',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  const client=(await pool.query("INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address,email) VALUES ($1,'Synthetic','Client','Synthetic site',$2) RETURNING id",[merchant,`${randomUUID()}@synthetic.test`])).rows[0].id;
  const quote=(await pool.query("INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,deposit_enabled,deposit_cents,status,delivery_channel) VALUES ($1,$2,$3,'[]',10000,10000,true,2000,'sent','email') RETURNING id",[merchant,client,randomUUID()])).rows[0].id;
  const tenant=(await pool.query("INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address) VALUES ($1,'Synthetic','Tenant','Synthetic address') RETURNING id",[merchant])).rows[0].id;
  return {merchant,client,quote,tenant};
}
const counts=async(quote:string)=>(await pool.query(`SELECT (SELECT count(*)::int FROM job_invoices WHERE quote_id=$1) AS invoices,
  (SELECT count(*)::int FROM job_events WHERE quote_id=$1 AND event_type IN ('quote_accepted','quote_declined')) AS events,
  (SELECT count(*)::int FROM payment_delivery_outbox o JOIN job_events e ON e.id=o.job_event_id WHERE e.quote_id=$1) AS outbox`,[quote])).rows[0];
  await check('property charge and trades invoice creation reuse their UUID across two instances',async()=>{
    for(const domain of ['property','trades'] as const){const f=await fixture(),key=randomUUID(),intent={key,actor:{userId:7,role:'owner' as const}},data={kind:domain==='property'?'charge':'full',amountCents:1000,deliveryChannel:'email',dueAt:new Date(Date.now()+86400000),splitEnabled:false,description:'Synthetic charge'};
      const create=(store:any,body=data)=>domain==='property'?store.createOrReuseInvoiceRentRequestForMerchant(f.tenant,f.merchant,body,intent):store.createJobInvoiceForMerchant(f.merchant,{clientProfileId:f.client},body,intent);
      const results=await Promise.all(Array.from({length:12},(_,i)=>create(stores[i%2])));assert.ok(results.every(r=>r.kind==='ok'));
      assert.equal(new Set(results.map(r=>r.invoice.id)).size,1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_creation_commands WHERE merchant_id=$1 AND idempotency_key=$2',[f.merchant,key])).rows[0].n,1);
      await assert.rejects(create(stores[0],{...data,amountCents:1001}));
    }
  });
  await check('a concurrent retail creation command creates one bill, audit and outbox',async()=>{
    const f=await fixture(),key=randomUUID(),intent={key,actor:{userId:7,role:'owner' as const}},input={merchantId:f.merchant,itemName:'Synthetic new bill',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false};
    const responses=await Promise.all(Array.from({length:12},(_,i)=>(stores[i%2] as any).createTransactionForMerchant(f.merchant,input,intent)));
    assert.equal(new Set(responses.map(row=>row.id)).size,1);
    const result=(await pool.query(`SELECT (SELECT count(*)::int FROM payment_creation_commands WHERE merchant_id=$1 AND idempotency_key=$2) AS commands,
      (SELECT count(*)::int FROM transaction_events WHERE transaction_id=$3 AND event_type='Sale_Created') AS events,
      (SELECT count(*)::int FROM payment_delivery_outbox o JOIN transaction_events e ON e.id=o.transaction_event_id WHERE e.transaction_id=$3) AS outbox`,[f.merchant,key,responses[0].id])).rows[0];
    assert.deepEqual(result,{commands:1,events:1,outbox:1});
    await assert.rejects((stores[0] as any).createTransactionForMerchant(f.merchant,{...input,price:'10.01'},intent));
  });
  await check('two instances accept a quote once with one deposit, audit and merchant outbox',async()=>{
    const f=await fixture(),responses=await Promise.all(Array.from({length:12},(_,index)=>(stores[index%2] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:true})));
    assert.ok(responses.every(r=>r.kind==='ok'));assert.equal(new Set(responses.map(r=>r.invoice.id)).size,1);
    assert.equal(responses[0].invoice.amountCents,2000);assert.deepEqual(await counts(f.quote),{invoices:1,events:1,outbox:1});
    const changed=await (stores[0] as any).respondToQuoteForMerchant(f.quote,f.merchant,false,{allowAccept:true});assert.equal(changed.kind,'conflict');
    assert.deepEqual(await counts(f.quote),{invoices:1,events:1,outbox:1});
  });
  await check('competing accept and decline commit one authoritative quote response',async()=>{
    const f=await fixture(),responses=await Promise.all([true,false].map((accept,index)=>(stores[index] as any).respondToQuoteForMerchant(f.quote,f.merchant,accept,{allowAccept:true})));
    assert.equal(responses.filter(r=>r.kind==='ok').length,1);const result=await counts(f.quote);assert.equal(result.events,1);assert.equal(result.outbox,1);
    const quote=(await pool.query('SELECT status FROM quotes WHERE id=$1',[f.quote])).rows[0];assert.equal(result.invoices,quote.status==='accepted'?1:0);
  });
  await check('wrong merchant and expired quote cannot create a payment invoice',async()=>{
    const f=await fixture(),foreign=await fixture();assert.equal((await (stores[0] as any).respondToQuoteForMerchant(f.quote,foreign.merchant,true,{allowAccept:true})).kind,'not-found');
    await pool.query('UPDATE quotes SET valid_until=$2 WHERE id=$1',[f.quote,new Date(Date.now()-86400000)]);
    assert.equal((await (stores[0] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:true})).kind,'expired');assert.equal((await counts(f.quote)).invoices,0);
  });
  await check('an audit insert failure rolls back quote acceptance and its deposit invoice',async()=>{
    const f=await fixture();await pool.query("CREATE FUNCTION test_r3_quote_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='quote_accepted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER test_r3_quote_failure BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION test_r3_quote_failure()');
    try{await assert.rejects((stores[0] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:true}));assert.equal((await counts(f.quote)).invoices,0);assert.equal((await pool.query('SELECT status FROM quotes WHERE id=$1',[f.quote])).rows[0].status,'sent');}
    finally{await pool.query('DROP TRIGGER test_r3_quote_failure ON job_events');await pool.query('DROP FUNCTION test_r3_quote_failure()');}
  });
  await check('quote views race safely with acceptance and retain one view event',async()=>{
    const f=await fixture();await Promise.all(Array.from({length:12},(_,i)=>(stores[i%2] as any).recordQuoteViewForMerchant(f.quote,f.merchant)));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM job_events WHERE quote_id=$1 AND event_type='quote_viewed'",[f.quote])).rows[0].n,1);
    await Promise.all([(stores[0] as any).recordQuoteViewForMerchant(f.quote,f.merchant),(stores[1] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:true})]);
    assert.equal((await pool.query('SELECT status FROM quotes WHERE id=$1',[f.quote])).rows[0].status,'accepted');
    assert.equal((await (stores[0] as any).recordQuoteViewForMerchant(f.quote,f.merchant)).status,'accepted');
    assert.equal((await (stores[0] as any).recordQuoteViewForMerchant(f.quote,f.merchant+1)),undefined);
  });
  await check('blocked quote notices retain the rolling 24 hour limit across midnight',async()=>{
    const f=await fixture();await pool.query("INSERT INTO job_events(merchant_id,client_profile_id,quote_id,event_type,created_at) VALUES ($1,$2,$3,'quote_acceptance_blocked',$4)",[f.merchant,f.client,f.quote,new Date(Date.now()-3600000)]);
    await (stores[0] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:false});
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM job_events WHERE quote_id=$1 AND event_type='quote_acceptance_blocked'",[f.quote])).rows[0].n,1);
  });
  await check('balance retries create one exact remaining bill, actor, audit and outbox',async()=>{
    const f=await fixture(),accepted=await (stores[0] as any).respondToQuoteForMerchant(f.quote,f.merchant,true,{allowAccept:true});
    await pool.query("UPDATE job_invoices SET status='paid_external' WHERE id=$1",[accepted.invoice.id]);
    const actor={userId:7,role:'owner' as const};
    const results=await Promise.all(Array.from({length:12},(_,i)=>(stores[i%2] as any).createJobBalanceInvoiceForMerchant(accepted.invoice.id,f.merchant,true,actor)));
    assert.ok(results.every(r=>r.kind==='ok'));assert.equal(new Set(results.map(r=>r.invoice.id)).size,1);assert.equal(results[0].invoice.amountCents,8000);
    const event=(await pool.query("SELECT id,payload FROM job_events WHERE job_invoice_id=$1 AND event_type='balance_sent'",[results[0].invoice.id])).rows;assert.equal(event.length,1);assert.deepEqual(event[0].payload.actor,actor);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE job_event_id=$1',[event[0].id])).rows[0].n,1);
    assert.equal((await (stores[0] as any).createJobBalanceInvoiceForMerchant(accepted.invoice.id,f.merchant,false,actor)).kind,'conflict');
  });
  await check('subscription cancel/resume replay retains the original command across later changes',async()=>{
    const f=await fixture(),sub=(await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,last_billing_date,current_period_end) VALUES ($1,'solo','active',799,$2,$3) RETURNING id",[f.merchant,new Date().toISOString(),new Date(Date.now()+86400000)])).rows[0];
    const cancel={key:randomUUID(),actor:{userId:7,role:'owner' as const}},resume={key:randomUUID(),actor:{userId:8,role:'owner' as const}};
    await Promise.all(stores.map(s=>s.cancelSubscription(f.merchant,'Synthetic cancellation',cancel)));
    await stores[0].resumeSubscription(f.merchant,resume);await stores[1].resumeSubscription(f.merchant,resume);
    await stores[0].cancelSubscription(f.merchant,'Synthetic cancellation',cancel);
    assert.equal((await pool.query('SELECT cancel_at_period_end FROM merchant_subscriptions WHERE id=$1',[sub.id])).rows[0].cancel_at_period_end,false);
    await assert.rejects(stores[0].cancelSubscription(f.merchant,'Changed reason',cancel));
    const events=(await pool.query('SELECT id,payload FROM subscription_payment_events WHERE subscription_id=$1',[sub.id])).rows;assert.equal(events.length,2);assert.deepEqual(events[0].payload.actor,cancel.actor);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE subscription_event_id=ANY($1::uuid[])',[events.map(e=>e.id)])).rows[0].n,2);
  });
  await check('free plan and card removal replay cannot overwrite a later owner command',async()=>{
    const f=await fixture();await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,windcave_card_id) VALUES ($1,'solo','active',799,'synthetic-card')",[f.merchant]);
    const first={key:randomUUID(),actor:{userId:7,role:'owner' as const}},second={key:randomUUID(),actor:{userId:8,role:'owner' as const}},remove={key:randomUUID(),actor:first.actor};
    await stores[0].changeSubscriptionPlan(f.merchant,'team',undefined,first);await stores[0].changeSubscriptionPlan(f.merchant,'crew',undefined,second);
    await stores[1].changeSubscriptionPlan(f.merchant,'team',undefined,first);assert.equal((await stores[0].getSubscription(f.merchant))?.planId,'crew');
    await stores[0].removeSubscriptionCard(f.merchant,remove);await pool.query("UPDATE merchant_subscriptions SET windcave_card_id='replacement-card' WHERE merchant_id=$1",[f.merchant]);
    await stores[1].removeSubscriptionCard(f.merchant,remove);assert.equal((await stores[0].getSubscription(f.merchant))?.windcaveCardId,'replacement-card');
  });
  await check('subscription audit failure rolls back its manual mutation and outbox',async()=>{
    const f=await fixture();await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents) VALUES ($1,'solo','active',799)",[f.merchant]);
    await pool.query("CREATE FUNCTION test_r3_subscription_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.subscription_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER test_r3_subscription_failure BEFORE INSERT ON subscription_payment_events FOR EACH ROW EXECUTE FUNCTION test_r3_subscription_failure()');
    try{await assert.rejects(stores[0].cancelSubscription(f.merchant,'Synthetic cancellation',{key:randomUUID(),actor:{userId:7,role:'owner'}}));assert.equal((await stores[0].getSubscription(f.merchant))?.status,'active');}
    finally{await pool.query('DROP TRIGGER test_r3_subscription_failure ON subscription_payment_events');await pool.query('DROP FUNCTION test_r3_subscription_failure()');}
  });
  await check('automatic cancellation expiry commits one internal event and outbox on replay',async()=>{
    const f=await fixture(),parent=(await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,cancel_at_period_end,current_period_end) VALUES ($1,'solo','active',799,true,$2) RETURNING id",[f.merchant,new Date(Date.now()-86400000)])).rows[0];
    await Promise.all(stores.map(s=>s.expireCancelledSubscriptions(new Date())));await stores[0].expireCancelledSubscriptions(new Date());
    const events=(await pool.query('SELECT id,payload FROM subscription_payment_events WHERE subscription_id=$1',[parent.id])).rows;assert.equal(events.length,1);assert.deepEqual(events[0].payload.actor,{service:'internal'});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE subscription_event_id=$1',[events[0].id])).rows[0].n,1);
    assert.equal((await stores[0].getSubscription(f.merchant))?.status,'cancelled');
  });
  await check('paid upgrade replay after another plan change never purchases or reverts the later plan',async()=>{
    const {DurableSubscriptionBilling}=await import('../server/durable-subscription-billing'),f=await fixture();
    await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,windcave_card_id,last_billing_date,current_period_start,current_period_end) VALUES ($1,'solo','active',799,'synthetic-card',$2,$3,$4)",
      [f.merchant,new Date().toISOString(),new Date(Date.now()-10*86400000),new Date(Date.now()+20*86400000)]);
    let purchases=0;const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{purchases++;return {success:true,approved:true,windcaveTransactionId:`synthetic-${randomUUID()}`};},query:async()=>({success:false})},{environment:'uat',providerAccount:'synthetic-account'},()=>new Date(),()=>true);
    const charge=async(request:any)=>{const result=await billing.charge({...request,kind:'upgrade',planId:request.targetPlanId});return {success:['approved','declined'].includes(result.kind),approved:result.kind==='approved',durableApplied:result.applied};};
    const first={key:randomUUID(),actor:{userId:7,role:'owner' as const}},second={key:randomUUID(),actor:{userId:8,role:'owner' as const}};
    assert.equal((await stores[0].changeSubscriptionPlan(f.merchant,'team',charge,first)).ok,true);
    assert.equal((await stores[0].changeSubscriptionPlan(f.merchant,'crew',charge,second)).ok,true);
    const replay=await stores[1].changeSubscriptionPlan(f.merchant,'team',charge,first);assert.equal(replay.ok,true);assert.equal(purchases,2);
    assert.equal((await stores[0].getSubscription(f.merchant))?.planId,'crew');await assert.rejects(stores[0].changeSubscriptionPlan(f.merchant,'crew',charge,first));
  });
  await check('the same owner UUID at two merchants has separate billing history identity',async()=>{
    const {DurableSubscriptionBilling}=await import('../server/durable-subscription-billing'),key=randomUUID();
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>({success:true,approved:true,windcaveTransactionId:`synthetic-${randomUUID()}`}),query:async()=>({success:false})},{environment:'uat',providerAccount:'synthetic-account'},()=>new Date(),()=>true);
    const charge=async(request:any)=>{const result=await billing.charge({...request,kind:'upgrade',planId:request.targetPlanId});return {success:result.kind==='approved',approved:result.kind==='approved',durableApplied:result.applied};};
    for(let i=0;i<2;i++){const f=await fixture();await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,windcave_card_id,last_billing_date,current_period_start,current_period_end) VALUES ($1,'solo','active',799,'synthetic-card',$2,$3,$4)",
      [f.merchant,new Date().toISOString(),new Date(Date.now()-10*86400000),new Date(Date.now()+20*86400000)]);
      assert.equal((await stores[i].changeSubscriptionPlan(f.merchant,'team',charge,{key,actor:{userId:7,role:'owner'}})).ok,true);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM subscription_billing_history WHERE merchant_id=$1',[f.merchant])).rows[0].n,1);
    }
  });

  const originalCommandChecks=passed;
  assert.equal(originalCommandChecks,15,'ALL_ORIGINAL_COMMAND_CASES_REQUIRED');
  const context={environment:'uat' as const,providerAccount:'synthetic-account'};
  async function paidFixture(plan:'solo'|'team'='solo'){
    const f=await fixture(),now=new Date(),periodStart=new Date(now.getTime()-10*86400000),periodEnd=new Date(now.getTime()+20*86400000);
    const sub=(await pool.query(`INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,seat_limit,price_cents,windcave_card_id,
      current_period_start,current_period_end,next_billing_date,last_billing_date)
      VALUES ($1,$2,'active',$3,$4,'synthetic-plan-card',$5,$6,$6,$7) RETURNING *`,
      [f.merchant,plan,plan==='solo'?1:5,plan==='solo'?799:899,periodStart,periodEnd,periodStart.toISOString()])).rows[0];
    return {...f,sub,periodStart,periodEnd};
  }
  const planState=async(id:number)=>{
    const row=(await pool.query('SELECT * FROM merchant_subscriptions WHERE id=$1',[id])).rows[0];
    const history=(await pool.query("SELECT amount,windcave_transaction_id,idempotency_key,attempt_number,status,billing_period_start,billing_period_end FROM subscription_billing_history WHERE subscription_id=$1 AND billing_type='plan_change' ORDER BY id",[id])).rows;
    const effects=(await pool.query(`SELECT
      (SELECT count(*)::int FROM subscription_billing_attempts WHERE subscription_id=$1) AS attempts,
      (SELECT count(*)::int FROM subscription_payment_events e JOIN subscription_billing_attempts a ON a.id=e.billing_attempt_id WHERE a.subscription_id=$1) AS events,
      (SELECT count(*)::int FROM payment_delivery_outbox o JOIN subscription_payment_events e ON e.id=o.subscription_event_id JOIN subscription_billing_attempts a ON a.id=e.billing_attempt_id WHERE a.subscription_id=$1) AS outbox`,[id])).rows[0];
    return {row,history,effects};
  };
  await check('a durable paid upgrade preserves exact proration, seat/price snapshot, history and period',async()=>{
    const f=await paidFixture(),intent={key:randomUUID(),actor:{userId:7,role:'owner' as const}},transactionId=`synthetic-plan-${randomUUID()}`;
    const requests:any[]=[];
    const billing=new DurableSubscriptionBilling(pool,{purchase:async(expected)=>{requests.push(expected);return {success:true,approved:true,windcaveTransactionId:transactionId};},query:async()=>({success:false})},context,()=>new Date(),()=>true);
    let requestedKey='';
    const charge:PlanUpgradeChargeExecutor=async request=>{
      assert.equal(request.subscriptionId,f.sub.id);assert.equal(request.merchantId,f.merchant);
      assert.equal(request.targetPlanId,'team');assert.equal(request.cardId,'synthetic-plan-card');assert.equal(request.amountCents,67);
      assert.equal(request.idempotencyKey,`plan-command-${f.sub.id}-${intent.key}`);requestedKey=request.idempotencyKey;
      const result=await billing.charge({...request,kind:'upgrade',planId:request.targetPlanId,actor:intent.actor});
      return result.kind==='approved'||result.kind==='declined'?{success:true,approved:result.kind==='approved',durableApplied:result.applied}:{success:false,error:'synthetic processing'};
    };
    const response=await stores[0].changeSubscriptionPlan(f.merchant,'team',charge,intent);
    assert.equal(response.ok,true);assert.equal(response.applied,'immediate');assert.equal(requests.length,1);assert.equal(requests[0].amountCents,67);
    const state=await planState(f.sub.id);
    assert.deepEqual([state.row.plan_id,state.row.seat_limit,state.row.price_cents,state.row.pending_plan_id,state.row.pending_plan_effective_at],['team',5,899,null,null]);
    assert.equal(+state.row.current_period_start,+f.periodStart);assert.equal(+state.row.current_period_end,+f.periodEnd);assert.equal(+state.row.next_billing_date,+f.periodEnd);
    assert.equal(+new Date(state.row.last_billing_date),+new Date(f.sub.last_billing_date));
    assert.deepEqual(state.history,[{amount:'0.67',windcave_transaction_id:transactionId,idempotency_key:requestedKey,attempt_number:1,status:'succeeded',billing_period_start:f.periodStart,billing_period_end:f.periodEnd}]);
    assert.deepEqual(state.effects,{attempts:1,events:1,outbox:2});
    const replay=await stores[1].changeSubscriptionPlan(f.merchant,'team',charge,intent);
    assert.equal(replay.ok,true);assert.equal(replay.applied,'immediate');assert.equal(requests.length,1);assert.deepEqual(await planState(f.sub.id),state);
  });
  await check('eight simultaneous paid upgrade commands across two pools purchase and apply once',async()=>{
    const f=await paidFixture(),intent={key:randomUUID(),actor:{userId:7,role:'owner' as const}},transactionId=`synthetic-race-${randomUUID()}`;let purchases=0;
    const services=pools.map(p=>new DurableSubscriptionBilling(p,{purchase:async()=>{purchases++;await new Promise(resolve=>setTimeout(resolve,10));return {success:true,approved:true,windcaveTransactionId:transactionId};},query:async()=>({success:false})},context,()=>new Date(),()=>true));
    const charges:PlanUpgradeChargeExecutor[]=services.map(service=>async request=>{
      const result=await service.charge({...request,kind:'upgrade',planId:request.targetPlanId,actor:intent.actor});
      return result.kind==='approved'||result.kind==='declined'?{success:true,approved:result.kind==='approved',durableApplied:result.applied}:{success:false,error:'synthetic processing'};
    });
    const responses=await Promise.all(Array.from({length:8},(_,i)=>stores[i%2].changeSubscriptionPlan(f.merchant,'team',charges[i%2],intent)));
    assert.ok(responses.some(r=>r.ok===true));
    assert.ok(responses.every(r=>r.ok===true||r.reason==='billing-busy'||r.reason==='charge-failed'));
    assert.equal(purchases,1);
    const before=await planState(f.sub.id);assert.equal(before.row.plan_id,'team');assert.equal(before.row.seat_limit,5);assert.equal(before.row.price_cents,899);
    assert.equal(before.history.length,1);assert.equal(before.history[0].amount,'0.67');assert.equal(before.history[0].windcave_transaction_id,transactionId);
    assert.equal(before.history[0].idempotency_key,`plan-command-${f.sub.id}-${intent.key}`);assert.deepEqual(before.effects,{attempts:1,events:1,outbox:2});
    const replays=await Promise.all(Array.from({length:8},(_,i)=>stores[i%2].changeSubscriptionPlan(f.merchant,'team',charges[i%2],intent)));
    assert.ok(replays.every(r=>r.ok===true&&r.applied==='immediate'));assert.equal(purchases,1);assert.deepEqual(await planState(f.sub.id),before);
    await assert.rejects(stores[0].changeSubscriptionPlan(f.merchant,'crew',charges[0],intent));assert.equal(purchases,1);assert.deepEqual(await planState(f.sub.id),before);
  });
  await check('a paid downgrade queues once across two pools without charge, billing or period changes',async()=>{
    const f=await paidFixture('team'),intent={key:randomUUID(),actor:{userId:7,role:'owner' as const}};let purchases=0;
    const charge:PlanUpgradeChargeExecutor=async()=>{purchases++;throw Error('queued downgrade must never invoke a charge');};
    const before=await planState(f.sub.id);
    const responses=await Promise.all(Array.from({length:8},(_,i)=>stores[i%2].changeSubscriptionPlan(f.merchant,'solo',charge,intent)));
    assert.ok(responses.every(r=>r.ok===true&&r.applied==='queued'));assert.equal(purchases,0);
    const state=await planState(f.sub.id);
    assert.deepEqual([state.row.plan_id,state.row.seat_limit,state.row.price_cents,state.row.pending_plan_id],['team',5,899,'solo']);
    assert.equal(+state.row.pending_plan_effective_at,+f.periodEnd);assert.equal(+state.row.current_period_start,+f.periodStart);assert.equal(+state.row.current_period_end,+f.periodEnd);assert.equal(+state.row.next_billing_date,+f.periodEnd);
    assert.equal(+new Date(state.row.last_billing_date),+new Date(f.sub.last_billing_date));
    assert.deepEqual(state.history,before.history);assert.deepEqual(state.effects,before.effects);
    const commandEvents=(await pool.query("SELECT id FROM subscription_payment_events WHERE subscription_id=$1 AND event_type='plan_change_queued'",[f.sub.id])).rows;
    assert.equal(commandEvents.length,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE subscription_event_id=$1',[commandEvents[0].id])).rows[0].n,1);
    const replay=await stores[0].changeSubscriptionPlan(f.merchant,'solo',charge,intent);assert.equal(replay.ok,true);assert.equal(replay.applied,'queued');assert.equal(purchases,0);assert.deepEqual(await planState(f.sub.id),state);
  });
  assert.deepEqual(failures,[]);
  assert.equal(passed,18,'ALL_COMMAND_AND_PAID_PLAN_CASES_REQUIRED');
  console.log(`R8 subscription command/plan PostgreSQL: ${passed} checks passed; synthetic only`);
  return {checks:passed,originalCommandChecks,paidPlanChecks:passed-originalCommandChecks};
}
