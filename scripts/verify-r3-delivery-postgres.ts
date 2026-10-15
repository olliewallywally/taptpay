/** Owned synthetic PostgreSQL and injected senders; no real email or push. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';
const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const url=new URL(testDatabaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/r3_integrated_scratch');
await import('../server/__tests__/support/test-env');
const {DurablePaymentDelivery}=await import('../server/durable-payment-delivery');
const pools=[new pg.Pool({connectionString:testDatabaseUrl,max:8}),new pg.Pool({connectionString:testDatabaseUrl,max:8})],pool=pools[0];
let now=new Date(),passed=0;const failures:string[]=[],clock=()=>new Date(now);
async function check(name:string,test:()=>Promise<void>){try{await test();passed++;console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name} (${(error as any)?.code??'assertion_failure'})`);}}
async function fixture(push=false){
  const merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('Synthetic delivery','Synthetic delivery',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  const transaction=(await pool.query("INSERT INTO transactions(merchant_id,item_name,price,status,payment_method) VALUES ($1,'Synthetic cash','1.00','completed','cash') RETURNING id",[merchant])).rows[0].id;
  const event=(await pool.query("INSERT INTO transaction_events(merchant_id,transaction_id,event_type,payload) VALUES ($1,$2,'Cash_Recorded','{}') RETURNING id",[merchant,transaction])).rows[0].id;
  const outbox=(await pool.query("INSERT INTO payment_delivery_outbox(transaction_event_id,channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2) RETURNING id",[event,now])).rows[0].id;
  if(push)await pool.query("INSERT INTO push_subscriptions(merchant_id,endpoint,p256dh,auth,preferences) VALUES ($1,$2,'synthetic','synthetic',$3::jsonb)",[merchant,`https://fcm.googleapis.com/synthetic-${randomUUID()}`,JSON.stringify({paymentReceived:true,failedPaymentAlerts:true,dailyPayoutSummary:true})]);
  return {merchant,input:{deliveryKey:outbox,eventId:event,eventSource:'transaction_event' as const,channel:'merchant_payment_update' as const}};
}
const targets=async(key:string)=>(await pool.query('SELECT * FROM payment_delivery_targets WHERE outbox_id=$1 ORDER BY kind',[key])).rows;
try{
  await check('blocked quote notice freezes owned customer, amount and Billing action across lost email response',async()=>{
    const f=await fixture(),client=(await pool.query("INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address) VALUES ($1,'<b>Jamie</b>','Smith','Synthetic') RETURNING id",[f.merchant])).rows[0].id;
    const quote=(await pool.query("INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,deposit_enabled,status,delivery_channel) VALUES ($1,$2,$3,'[]',115000,115000,false,'sent','email') RETURNING id",[f.merchant,client,randomUUID()])).rows[0].id;
    const event=(await pool.query("INSERT INTO job_events(merchant_id,client_profile_id,quote_id,event_type) VALUES ($1,$2,$3,'quote_acceptance_blocked') RETURNING id",[f.merchant,client,quote])).rows[0].id;
    const outbox=(await pool.query("INSERT INTO payment_delivery_outbox(job_event_id,channel,next_attempt_at) VALUES ($1,'merchant_payment_update',$2) RETURNING id",[event,now])).rows[0].id;
    const sent:any[]=[];let first=true;const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async(target:any,key:string)=>{if(target.kind!=='email')return;sent.push({key,payload:target.payload});if(first){first=false;throw Error('synthetic lost response');}}},'synthetic@synthetic.test',clock,'https://harness.test');
    const input={deliveryKey:outbox,eventId:event,eventSource:'job_event' as const,channel:'merchant_payment_update' as const};await assert.rejects(service.deliver(input));
    assert.ok(sent[0].payload.text.includes('<b>Jamie</b> Smith'));assert.ok(sent[0].payload.html.includes('&lt;b&gt;Jamie&lt;/b&gt; Smith'));assert.ok(!sent[0].payload.html.includes('<b>Jamie</b>'));assert.ok(sent[0].payload.text.includes('NZD 1150.00'));assert.ok(sent[0].payload.text.includes('https://harness.test/settings?section=billing'));
    await pool.query("UPDATE client_profiles SET first_name='Changed' WHERE id=$1",[client]);now=new Date(now.getTime()+61000);await service.deliver(input);assert.deepEqual(sent[0],sent[1]);assert.equal((await pool.query('SELECT status FROM quotes WHERE id=$1',[quote])).rows[0].status,'sent');
  });
  await check('missing credentials retain pending delivery without a send marker or simulated success',async()=>{
    const f=await fixture(),send=async()=>{throw Error('unexpected send');};
    const service=new DurablePaymentDelivery(pool,{ready:()=>false,send},'synthetic@synthetic.test',clock);
    await assert.rejects(service.deliver(f.input));const rows=await targets(f.input.deliveryKey);
    assert.equal(rows.length,2);assert.ok(rows.every(row=>row.first_send_at===null&&row.state==='pending'));
  });
  await check('lost email response retries the identical frozen recipient, body and key with one provider acceptance',async()=>{
    const f=await fixture(),sent:any[]=[],accepted=new Set<string>();let lose=true;
    const ports={ready:()=>true,send:async(target:any,key:string)=>{if(target.kind!=='email')return;sent.push({key,payload:target.payload});accepted.add(key);if(lose){lose=false;throw Error('synthetic lost response');}}};
    const services=pools.map(p=>new DurablePaymentDelivery(p,ports,'synthetic@synthetic.test',clock));
    await assert.rejects(services[0].deliver(f.input));await pool.query("UPDATE merchants SET email=$2,business_name='Changed' WHERE id=$1",[f.merchant,`${randomUUID()}@synthetic.test`]);
    now=new Date(now.getTime()+61000);await services[1].deliver(f.input);
    assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.equal(accepted.size,1);
    assert.ok((await targets(f.input.deliveryKey)).every(row=>row.state==='complete'));
  });
  await check('two worker instances share target claims and do not repeat successful destinations',async()=>{
    const f=await fixture(),sent=new Map<string,number>(),ports={ready:()=>true,send:async(_target:any,key:string)=>{sent.set(key,(sent.get(key)??0)+1);}};
    const services=pools.map(p=>new DurablePaymentDelivery(p,ports,'synthetic@synthetic.test',clock));
    await Promise.allSettled(services.map(s=>s.deliver(f.input)));await services[0].deliver(f.input);
    assert.equal(sent.size,2);assert.ok([...sent.values()].every(n=>n===1));
  });
  await check('uncertain unkeyed push remains held while successful email and SSE do not repeat',async()=>{
    const f=await fixture(true),sent={email:0,sse:0,push:0},ports={ready:()=>true,send:async(target:any)=>{sent[target.kind as keyof typeof sent]++;if(target.kind==='push')throw Error('synthetic unknown push');}};
    const services=pools.map(p=>new DurablePaymentDelivery(p,ports,'synthetic@synthetic.test',clock));
    await assert.rejects(services[0].deliver(f.input));now=new Date(now.getTime()+61000);await assert.rejects(services[1].deliver(f.input));
    assert.deepEqual(sent,{email:1,sse:1,push:1});assert.equal((await targets(f.input.deliveryKey)).find(t=>t.kind==='push').state,'held');
  });
  await check('an uncertain email beyond the deduplication window is held without another send',async()=>{
    const f=await fixture();let sends=0;const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async(target:any)=>{if(target.kind==='email'){sends++;throw Error('lost');}}},'synthetic@synthetic.test',clock);
    await assert.rejects(service.deliver(f.input));now=new Date(now.getTime()+23*3600000);await assert.rejects(service.deliver(f.input));
    assert.equal(sends,1);const row=(await targets(f.input.deliveryKey)).find(t=>t.kind==='email');assert.equal(row.state,'held');assert.equal(row.last_error_code,'dedup_window_expired');
  });
  await check('crash after email acceptance before target commit recovers with the original provider key',async()=>{
    const f=await fixture(),accepted=new Set<string>();let sends=0;
    const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async(target:any,key:string)=>{if(target.kind==='email'){sends++;accepted.add(key);}}},'synthetic@synthetic.test',clock);
    await pool.query("CREATE FUNCTION test_r3_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='email' AND NEW.state='complete' THEN RAISE EXCEPTION 'synthetic commit failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER test_r3_delivery_failure BEFORE UPDATE ON payment_delivery_targets FOR EACH ROW EXECUTE FUNCTION test_r3_delivery_failure()');
    try{await assert.rejects(service.deliver(f.input));}finally{await pool.query('DROP TRIGGER test_r3_delivery_failure ON payment_delivery_targets');await pool.query('DROP FUNCTION test_r3_delivery_failure()');}
    now=new Date(now.getTime()+61000);await service.deliver(f.input);assert.equal(sends,2);assert.equal(accepted.size,1);
  });
  await check('expired target lease cannot acknowledge delivery and preserves its first-send identity',async()=>{
    const f=await fixture();let advance=true;const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async(target:any)=>{if(target.kind==='email'&&advance){advance=false;now=new Date(now.getTime()+61000);}}},'synthetic@synthetic.test',clock);
    await assert.rejects(service.deliver(f.input));const before=(await targets(f.input.deliveryKey)).find(t=>t.kind==='email');assert.equal(before.state,'sending');
    await service.deliver(f.input);const after=(await targets(f.input.deliveryKey)).find(t=>t.kind==='email');assert.equal(after.state,'complete');assert.equal(+before.first_send_at,+after.first_send_at);
  });
  await check('forged event/channel identities do not prepare targets or send',async()=>{
    const f=await fixture();let sends=0;const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async()=>{sends++;}},'synthetic@synthetic.test',clock);
    await assert.rejects(service.deliver({...f.input,eventId:randomUUID()}));await assert.rejects(service.deliver({...f.input,channel:'payer_receipt'}));
    assert.equal(sends,0);assert.equal((await targets(f.input.deliveryKey)).length,0);
  });
  await check('target owner, payload and first-send timestamp are immutable',async()=>{
    const f=await fixture(),other=await fixture();const service=new DurablePaymentDelivery(pool,{ready:()=>true,send:async()=>{}},'synthetic@synthetic.test',clock);await service.deliver(f.input);
    const row=(await targets(f.input.deliveryKey))[0];
    for(const [sql,value] of [['merchant_id',other.merchant],['payload',JSON.stringify({to:'foreign@synthetic.test'})],['first_send_at',new Date(now.getTime()+1000)]]){
      await assert.rejects(pool.query(`UPDATE payment_delivery_targets SET ${sql}=$2 WHERE id=$1`,[row.id,value]),(error:any)=>error.code==='23514');
    }
  });
  await check('each app observes the same committed realtime event independently with local replay suppression',async()=>{
    const f=await fixture(),calls=[0,0];const services=pools.map((p,index)=>new DurablePaymentDelivery(p,{ready:()=>true,send:async(target:any)=>{if(target.kind==='sse'&&target.outbox_id===f.input.deliveryKey)calls[index]++;}},'synthetic@synthetic.test',clock));
    await assert.rejects(new DurablePaymentDelivery(pool,{ready:()=>false,send:async()=>{}},'synthetic@synthetic.test',clock).deliver(f.input));
    for(let index=0;index<2;index++){const seen=new Set<string>();await services[index].realtime(new Date(now.getTime()-60000),seen);await services[index].realtime(new Date(now.getTime()-60000),seen);}
    assert.deepEqual(calls,[1,1]);
  });
}finally{await Promise.all(pools.map(p=>p.end()));}
if(failures.length)throw Error(`R3 delivery: ${failures.length} failed`);
console.log(`R3 delivery PostgreSQL: ${passed} checks passed; synthetic only`);
