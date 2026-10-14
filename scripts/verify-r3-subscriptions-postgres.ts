/** Owned synthetic PostgreSQL only; injected provider, no real purchases. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';
const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const url=new URL(testDatabaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/r3_integrated_scratch');
await import('../server/__tests__/support/test-env');
const {DurableSubscriptionBilling}=await import('../server/durable-subscription-billing');
const {DurableSubscriptionCard}=await import('../server/durable-subscription-card');
const {DurablePaymentStorage}=await import('../server/durable-payment-storage');
const {PaymentRuntime}=await import('../server/payment-runtime');
const pools=[new pg.Pool({connectionString:testDatabaseUrl,max:8}),new pg.Pool({connectionString:testDatabaseUrl,max:8})],pool=pools[0];
let now=new Date(),passed=0;const clock=()=>new Date(now),context={environment:'uat' as const,providerAccount:'synthetic-account'};
const failures:string[]=[];
async function check(name:string,test:()=>Promise<void>){try{await test();passed++;console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name} (${(error as any)?.code??'assertion_failure'})`);}}
async function fixture(){
  const merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3 billing','R3 billing',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  const subscription=(await pool.query("INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,windcave_card_id,current_period_start,current_period_end,next_billing_date,last_billing_date) VALUES ($1,'solo','active',799,'synthetic-card',$2,$3,$3,$4) RETURNING *",[merchant,new Date(now.getTime()-31*86400000),now,new Date(now.getTime()-31*86400000).toISOString()])).rows[0];
  return {subscriptionId:subscription.id,merchantId:merchant,kind:'renewal' as const,cardId:'synthetic-card',amountCents:799,planId:'solo' as const,idempotencyKey:`synthetic-${randomUUID()}`,reference:`SYNTHETIC-${randomUUID()}`};
}
const counts=async(id:number)=>(await pool.query(`SELECT (SELECT count(*)::int FROM subscription_billing_history WHERE subscription_id=$1) AS history,
  (SELECT count(*)::int FROM subscription_payment_events e JOIN subscription_billing_attempts a ON a.id=e.billing_attempt_id WHERE a.subscription_id=$1) AS events,
  (SELECT count(*)::int FROM payment_delivery_outbox o JOIN subscription_payment_events e ON e.id=o.subscription_event_id JOIN subscription_billing_attempts a ON a.id=e.billing_attempt_id WHERE a.subscription_id=$1) AS outbox`,[id])).rows[0];
try {
  await check('possibly accepted billing POST never repeats across expiry, retry or another instance',async()=>{
    const input=await fixture();let sends=0;
    const provider={purchase:async()=>{sends++;throw new Error('synthetic lost response');},query:async()=>{throw new Error('no retained transaction id');}};
    const services=pools.map(p=>new DurableSubscriptionBilling(p,provider,context,clock,()=>true));
    assert.equal((await services[0].charge(input)).kind,'processing');now=new Date(now.getTime()+16*60000);
    assert.equal((await services[1].charge(input)).kind,'processing');assert.equal(sends,1);assert.deepEqual(await counts(input.subscriptionId),{history:0,events:0,outbox:0});
  });
  await check('persisted pending identity resumes with GET only and one atomic period/history/event/outbox',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;let sends=0,queries=0;
    const provider={purchase:async(_expected:any,persist:(id:string)=>Promise<void>)=>{sends++;await persist(transactionId);return {success:false,windcaveTransactionId:transactionId};},
      query:async()=>{queries++;return {success:true,approved:true,windcaveTransactionId:transactionId};}};
    const services=pools.map(p=>new DurableSubscriptionBilling(p,provider,context,clock,()=>true));
    assert.equal((await services[0].charge(input)).kind,'processing');now=new Date(now.getTime()+61000);
    const results=await Promise.all(services.map(service=>service.charge(input)));assert.ok(results.some(r=>r.kind==='approved'));
    assert.equal(sends,1);assert.ok(queries>=1);assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
    assert.equal((await services[0].charge(input)).kind,'approved');assert.equal(sends,1);
  });
  await check('approval followed by local commit failure recovers without another purchase',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;let sends=0;
    const provider={purchase:async(_expected:any,persist:(id:string)=>Promise<void>)=>{sends++;await persist(transactionId);return {success:true,approved:true,windcaveTransactionId:transactionId};},
      query:async()=>({success:true,approved:true,windcaveTransactionId:transactionId})};
    const service=new DurableSubscriptionBilling(pool,provider,context,clock,()=>true);
    await pool.query("CREATE FUNCTION test_r3_billing_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic local commit failure'; END $$");
    await pool.query('CREATE TRIGGER test_r3_billing_failure BEFORE INSERT ON subscription_billing_history FOR EACH ROW EXECUTE FUNCTION test_r3_billing_failure()');
    try{await service.charge(input);assert.deepEqual(await counts(input.subscriptionId),{history:0,events:0,outbox:0});}
    finally{await pool.query('DROP TRIGGER test_r3_billing_failure ON subscription_billing_history');await pool.query('DROP FUNCTION test_r3_billing_failure()');}
    now=new Date(now.getTime()+61000);assert.equal((await service.charge(input)).kind,'approved');assert.equal(sends,1);assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
  });
  await check('unknown upgrade keeps original cents and rejects another plan/card',async()=>{
    const input={...await fixture(),kind:'upgrade' as const,planId:'team' as const,amountCents:400};let sends=0;
    const service=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:false};},query:async()=>({success:false})},context,clock,()=>true);
    assert.equal((await service.charge(input)).kind,'processing');
    assert.equal((await service.charge({...input,amountCents:200})).kind,'processing');
    assert.equal((await service.charge({...input,planId:'crew'})).kind,'conflict');assert.equal((await service.charge({...input,cardId:'another-card'})).kind,'conflict');
    assert.equal((await pool.query('SELECT amount_cents FROM subscription_billing_attempts WHERE subscription_id=$1',[input.subscriptionId])).rows[0].amount_cents,400);assert.equal(sends,1);
  });
  await check('unknown card setup preserves its UUID/X-ID/send marker across expiry and another instance',async()=>{
    const input=await fixture(),key=randomUUID();let sends=0;
    const repository=new DurablePaymentStorage(pool),billing=new DurableSubscriptionBilling(pool,{purchase:async()=>({success:false}),query:async()=>({success:false})},context,clock,()=>true);
    const provider={create:async(expected:any)=>{sends++;const stored=(await pool.query('SELECT send_started_at,return_state_hash FROM subscription_card_attempts WHERE id=$1',[expected.attemptId])).rows[0];assert.ok(stored.send_started_at);assert.ok(stored.return_state_hash);throw new Error('synthetic lost setup response');},query:async()=>({kind:'pending' as const}),hostedPage:async()=>undefined};
    const services=pools.map(p=>new DurableSubscriptionCard(p,repository,provider,billing,context,'synthetic-return-secret',clock,()=>true));
    const start={subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:key,email:'owner@synthetic.test',baseUrl:'https://harness.test',actor:{userId:1,role:'owner' as const}};
    assert.equal((await services[0].start(start)).kind,'processing');now=new Date(now.getTime()+6*60000);
    assert.equal((await services[1].start(start)).kind,'processing');assert.equal(sends,1);
    assert.equal((await services[1].start({...start,idempotencyKey:randomUUID()})).kind,'conflict');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM subscription_payment_events WHERE merchant_id=$1 AND event_type='card_setup_started'",[input.merchantId])).rows[0].n,1);
  });
  await check('card FPRN saves zero-value verification and activates once through the shared inbox',async()=>{
    const input=await fixture(),sessionId=`card-${randomUUID()}`,cardTransaction=`verify-${randomUUID()}`,chargeTransaction=`charge-${randomUUID()}`;let sends=0;
    const repository=new DurablePaymentStorage(pool),billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:true,approved:true,windcaveTransactionId:chargeTransaction};},query:async()=>({success:true,approved:true,windcaveTransactionId:chargeTransaction})},context,clock,()=>true);
    const card=new DurableSubscriptionCard(pool,repository,{create:async()=>({sessionId,redirectUrl:'https://uat.windcave.com/synthetic'}),query:async()=>({kind:'approved',transactionId:cardTransaction,card:{cardId:'synthetic-stored-card',brand:'Visa',last4:'1234',expiry:'12/40'}}),hostedPage:async()=>undefined},billing,context,'synthetic-return-secret',clock,()=>true);
    assert.equal((await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://harness.test',actor:{userId:7,role:'owner'}})).kind,'ready');
    const runtime=new PaymentRuntime(repository,{query:async()=>{throw new Error('A card verification must never enter the positive-money finalizer');}},clock,claim=>card.processReceipt(claim));
    await runtime.reconcile(sessionId,'poll');await repository.receive(sessionId,'fprn',now);await runtime.worker.runOne(randomUUID(),sessionId);
    assert.equal(sends,1);assert.equal((await card.status(input.merchantId,sessionId))?.activation_state,'approved');
    assert.equal(await card.status(input.merchantId+999999,sessionId),undefined);
    assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
    const events=(await pool.query('SELECT event_type,payload FROM subscription_payment_events WHERE merchant_id=$1',[input.merchantId])).rows;
    assert.equal(events.length,3);assert.equal(events.find(event=>event.event_type==='card_approved')?.payload.actor.userId,7);
    assert.equal((await pool.query('SELECT card_attempt_id FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows[0].card_attempt_id,(await card.status(input.merchantId,sessionId))?.id);
  });
  await check('manual no-card policy failure advances dunning once without a provider identity or purchase',async()=>{
    const input=await fixture();await pool.query('UPDATE merchant_subscriptions SET windcave_card_id=NULL WHERE id=$1',[input.subscriptionId]);
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{throw new Error('No card must never send');},query:async()=>{throw new Error('No card must never query');}},context,clock,()=>true);
    assert.equal((await billing.recordMissingPaymentMethod(input)).kind,'declined');assert.equal((await billing.recordMissingPaymentMethod(input)).reused,true);
    const parent=(await pool.query('SELECT status,failed_payment_count FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0];assert.equal(parent.status,'past_due');assert.equal(parent.failed_payment_count,1);
    const attempt=(await pool.query('SELECT send_started_at,provider_transaction_id FROM subscription_billing_attempts WHERE subscription_id=$1',[input.subscriptionId])).rows[0];assert.equal(attempt.send_started_at,null);assert.equal(attempt.provider_transaction_id,null);
    assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
  });
  await check('foreign subscription identity is refused before a provider request',async()=>{
    const input=await fixture(),other=await fixture();let calls=0;
    const service=new DurableSubscriptionBilling(pool,{purchase:async()=>{calls++;return {success:false};},query:async()=>{calls++;return {success:false};}},context,clock,()=>true);
    assert.equal((await service.charge({...input,merchantId:other.merchantId})).kind,'not-found');assert.equal(calls,0);
    assert.deepEqual(await counts(input.subscriptionId),{history:0,events:0,outbox:0});
  });
  await check('cancelling after card setup starts prevents a later verification from starting a charge',async()=>{
    const input=await fixture(),sessionId=`card-${randomUUID()}`,repository=new DurablePaymentStorage(pool);let sends=0;
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:true,approved:true,windcaveTransactionId:`tx-${randomUUID()}`};},query:async()=>({success:false})},context,clock,()=>true);
    const card=new DurableSubscriptionCard(pool,repository,{create:async()=>({sessionId,redirectUrl:'https://synthetic.test/card'}),hostedPage:async()=>undefined,
      query:async()=>({kind:'approved',transactionId:`validation-${randomUUID()}`,card:{cardId:'verified-card',brand:'Visa',last4:'4242',expiry:'12/31'}})},billing,context,'synthetic-return-secret-000000000000000',clock,()=>true);
    await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://synthetic.test'});
    now=new Date(now.getTime()+1000);await pool.query("UPDATE merchant_subscriptions SET status='cancelled',cancellation_requested_at=$2 WHERE id=$1",[input.subscriptionId,now]);
    assert.equal((await card.confirm(input.merchantId,sessionId))?.activation_suppressed,true);assert.equal(sends,0);
    assert.equal((await pool.query('SELECT status FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0].status,'cancelled');
    assert.deepEqual(await counts(input.subscriptionId),{history:0,events:0,outbox:0});
  });
  await check('verified decline advances dunning and communications once on replay',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;let sends=0;
    const provider={purchase:async()=>{sends++;return {success:true,approved:false,windcaveTransactionId:transactionId};},query:async()=>({success:true,approved:false,windcaveTransactionId:transactionId})};
    const service=new DurableSubscriptionBilling(pool,provider,context,clock,()=>true);
    assert.equal((await service.charge(input)).kind,'declined');assert.equal((await service.charge(input)).kind,'declined');assert.equal(sends,1);
    assert.equal((await pool.query('SELECT failed_payment_count FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0].failed_payment_count,1);
    assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
  });
  await check('fresh card setup explicitly restarts an ended subscription once',async()=>{
    const input=await fixture(),sessionId=`card-${randomUUID()}`,validationId=`validation-${randomUUID()}`;let sends=0;
    await pool.query("UPDATE merchant_subscriptions SET status='cancelled',cancel_at_period_end=true,cancellation_requested_at=$2 WHERE id=$1",[input.subscriptionId,new Date(now.getTime()-1000)]);
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:true,approved:true,windcaveTransactionId:`tx-${randomUUID()}`};},query:async()=>({success:false})},context,clock,()=>true);
    const card=new DurableSubscriptionCard(pool,new DurablePaymentStorage(pool),{create:async()=>({sessionId}),hostedPage:async()=>undefined,
      query:async()=>({kind:'approved',transactionId:validationId,card:{cardId:'verified-card',brand:'Visa',last4:'4242',expiry:'12/31'}})},billing,context,'synthetic-return-secret-000000000000000',clock,()=>true);
    await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://synthetic.test'});
    await card.confirm(input.merchantId,sessionId);await card.confirm(input.merchantId,sessionId);assert.equal(sends,1);
    const parent=(await pool.query('SELECT status,cancel_at_period_end FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0];assert.equal(parent.status,'active');assert.equal(parent.cancel_at_period_end,false);
  });
  await check('a second cancellation during explicit restart retains captured money and cancellation',async()=>{
    const input=await fixture();await pool.query("UPDATE merchant_subscriptions SET status='cancelled',cancellation_requested_at=$2 WHERE id=$1",[input.subscriptionId,new Date(now.getTime()-1000)]);
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{now=new Date(now.getTime()+1000);await pool.query('UPDATE merchant_subscriptions SET cancellation_requested_at=$2 WHERE id=$1',[input.subscriptionId,now]);return {success:true,approved:true,windcaveTransactionId:`tx-${randomUUID()}`};},query:async()=>({success:false})},context,clock,()=>true);
    const result=await billing.charge({...input,kind:'activation',allowRestart:true});assert.equal(result.kind,'approved');assert.equal(result.resolutionRequired,true);
    assert.equal((await pool.query('SELECT status FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0].status,'cancelled');assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
  });
  await check('cancellation after preparation abandons only the unsent activation and permits a new explicit intent',async()=>{
    const input=await fixture();let sends=0,withdrew=false;
    const guardedPool={connect:async()=>{const connection=await pool.connect();let prepared=false;return {release:()=>connection.release(),query:async(sql:string,values?:any[])=>{
      const result=await connection.query(sql,values);if(sql.includes('INSERT INTO subscription_billing_attempts'))prepared=true;
      if(sql==='COMMIT'&&prepared&&!withdrew){withdrew=true;now=new Date(now.getTime()+1000);await pool.query("UPDATE merchant_subscriptions SET status='cancelled',cancellation_requested_at=$2 WHERE id=$1",[input.subscriptionId,now]);}return result;
    }};}};
    const provider={purchase:async()=>{sends++;return {success:true,approved:true,windcaveTransactionId:`tx-${randomUUID()}`};},query:async()=>({success:false})};
    const billing=new DurableSubscriptionBilling(guardedPool,provider,context,clock,()=>true);
    await billing.charge({...input,kind:'activation'});assert.equal(sends,0);
    const row=(await pool.query('SELECT state,send_started_at FROM subscription_billing_attempts WHERE subscription_id=$1',[input.subscriptionId])).rows[0];assert.equal(row.state,'abandoned');assert.equal(row.send_started_at,null);
    const restarted=await new DurableSubscriptionBilling(pool,provider,context,clock,()=>true).charge({...input,kind:'activation',allowRestart:true,idempotencyKey:`new-${randomUUID()}`});assert.equal(restarted.kind,'approved');assert.equal(sends,1);
  });
  await check('another paid period satisfies the original card activation without charging a future month',async()=>{
    const input=await fixture(),sessionId=`card-${randomUUID()}`,validationId=`validation-${randomUUID()}`;let enabled=false,sends=0;
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:true,approved:true,windcaveTransactionId:`tx-${randomUUID()}`};},query:async()=>({success:false})},context,clock,()=>enabled);
    const card=new DurableSubscriptionCard(pool,new DurablePaymentStorage(pool),{create:async()=>({sessionId}),hostedPage:async()=>undefined,
      query:async()=>({kind:'approved',transactionId:validationId,card:{cardId:'verified-card',brand:'Visa',last4:'4242',expiry:'12/31'}})},billing,context,'synthetic-return-secret-000000000000000',clock,()=>true);
    await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://synthetic.test'});await card.confirm(input.merchantId,sessionId);
    await pool.query("UPDATE merchant_subscriptions SET status='active',last_billing_date=$2,current_period_end=$3,next_billing_date=$3 WHERE id=$1",[input.subscriptionId,now.toISOString(),new Date(now.getTime()+30*86400000)]);
    enabled=true;await card.recoverActivations();assert.equal(sends,0);
    now=new Date(now.getTime()+31*86400000);await card.recoverActivations();assert.equal(sends,0);assert.equal((await card.confirm(input.merchantId,sessionId))?.activation_satisfied,true);
    assert.deepEqual(await counts(input.subscriptionId),{history:0,events:0,outbox:0});
  });
  await check('card removal refuses a pending setup before a later verification can replace it',async()=>{
    const {DatabaseStorage,SubscriptionBillingBusyError}=await import('../server/storage'),schema=await import('../shared/schema'),store=new DatabaseStorage(drizzle(pool,{schema}) as any),input=await fixture();
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>({success:false}),query:async()=>({success:false})},context,clock,()=>false);
    const card=new DurableSubscriptionCard(pool,new DurablePaymentStorage(pool),{create:async()=>({sessionId:`card-${randomUUID()}`}),hostedPage:async()=>undefined,query:async()=>({kind:'pending'})},billing,context,'synthetic-return-secret-000000000000000',clock,()=>true);
    await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://synthetic.test'});
    await assert.rejects(store.removeSubscriptionCard(input.merchantId,{key:randomUUID(),actor:{userId:7,role:'owner'}}),SubscriptionBillingBusyError);
    assert.equal((await store.getSubscription(input.merchantId))?.windcaveCardId,input.cardId);
  });
  await check('removal after verification supersedes the original setup without restoring or charging the card',async()=>{
    const {DatabaseStorage}=await import('../server/storage'),schema=await import('../shared/schema'),store=new DatabaseStorage(drizzle(pool,{schema}) as any),input=await fixture(),sessionId=`card-${randomUUID()}`;let enabled=false,sends=0;
    const billing=new DurableSubscriptionBilling(pool,{purchase:async()=>{sends++;return {success:false};},query:async()=>({success:false})},context,clock,()=>enabled);
    const card=new DurableSubscriptionCard(pool,new DurablePaymentStorage(pool),{create:async()=>({sessionId}),hostedPage:async()=>undefined,
      query:async()=>({kind:'approved',transactionId:`validation-${randomUUID()}`,card:{cardId:'verified-card',brand:'Visa',last4:'4242',expiry:'12/31'}})},billing,context,'synthetic-return-secret-000000000000000',clock,()=>true);
    await card.start({subscriptionId:input.subscriptionId,merchantId:input.merchantId,idempotencyKey:randomUUID(),email:'owner@synthetic.test',baseUrl:'https://synthetic.test'});await card.confirm(input.merchantId,sessionId);
    await store.removeSubscriptionCard(input.merchantId,{key:randomUUID(),actor:{userId:7,role:'owner'}});enabled=true;
    assert.equal((await card.confirm(input.merchantId,sessionId))?.payment_method_superseded,true);assert.equal(sends,0);assert.equal((await store.getSubscription(input.merchantId))?.windcaveCardId,null);
  });
  await check('a cancellation scheduled during a charge survives the successful period commit',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;
    const service=new DurableSubscriptionBilling(pool,{purchase:async()=>{await pool.query('UPDATE merchant_subscriptions SET cancel_at_period_end=true WHERE id=$1',[input.subscriptionId]);return {success:true,approved:true,windcaveTransactionId:transactionId};},query:async()=>({success:false})},context,clock,()=>true);
    assert.equal((await service.charge(input)).kind,'approved');assert.equal((await pool.query('SELECT cancel_at_period_end FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0].cancel_at_period_end,true);
  });
  await check('parent drift records approval and holds the attempt without overwriting a changed plan',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;
    const service=new DurableSubscriptionBilling(pool,{purchase:async()=>{await pool.query("UPDATE merchant_subscriptions SET plan_id='team' WHERE id=$1",[input.subscriptionId]);return {success:true,approved:true,windcaveTransactionId:transactionId};},query:async()=>({success:false})},context,clock,()=>true);
    const result=await service.charge(input);assert.equal(result.resolutionRequired,true);assert.equal(result.applied,false);
    assert.equal((await pool.query('SELECT plan_id FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0].plan_id,'team');
    assert.deepEqual(await counts(input.subscriptionId),{history:1,events:1,outbox:2});
  });
  await check('explicit activation restarts an ended cancellation with a fresh month',async()=>{
    const input=await fixture(),transactionId=`tx-${randomUUID()}`;
    await pool.query("UPDATE merchant_subscriptions SET status='cancelled',cancel_at_period_end=true,cancellation_reason='Synthetic cancellation',next_billing_date=$2 WHERE id=$1",[input.subscriptionId,new Date(now.getTime()-86400000)]);
    const service=new DurableSubscriptionBilling(pool,{purchase:async()=>({success:true,approved:true,windcaveTransactionId:transactionId}),query:async()=>({success:false})},context,clock,()=>true);
    assert.equal((await service.charge({...input,kind:'activation',allowRestart:true})).kind,'approved');
    const parent=(await pool.query('SELECT status,cancel_at_period_end,cancellation_reason,current_period_start FROM merchant_subscriptions WHERE id=$1',[input.subscriptionId])).rows[0];
    assert.equal(parent.status,'active');assert.equal(parent.cancel_at_period_end,false);assert.equal(parent.cancellation_reason,null);assert.equal(+parent.current_period_start,+now);
  });
  assert.deepEqual(failures,[]);console.log(`R3 subscriptions PostgreSQL: ${passed} checks passed; synthetic only`);
}finally{await Promise.all(pools.map(p=>p.end()));}
