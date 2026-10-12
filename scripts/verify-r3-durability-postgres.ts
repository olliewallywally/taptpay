/** Actual PostgreSQL faults/concurrency. Synthetic loopback databases only.
 * Bootstrap with rehearse-r3-migration-postgres.ts first. No ambient DB is used. */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';
import {DurablePaymentStorage,type PaymentSqlPool} from '../server/durable-payment-storage';
import {PaymentReconciliationWorker} from '../server/payment-reconciliation';
import {PaymentOutboxWorker} from '../server/payment-outbox';
import {DurableInvoiceCheckout} from '../server/durable-invoice-checkout';
import {createRetailReconciliationFinalizer} from '../server/retail-reconciliation-adapter';
import type {SessionBinding,VerifiedOutcome} from '../server/durable-payment-contract';

const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const target=new URL(testDatabaseUrl);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/r3_scratch');
await import('../server/__tests__/support/test-env');
const {DatabaseStorage}=await import('../server/storage');
const {PaymentAttemptService}=await import('../server/payment-attempt-service');
const schema=await import('../shared/schema');
const pools=[new pg.Pool({connectionString:testDatabaseUrl,max:12}),new pg.Pool({connectionString:testDatabaseUrl,max:12})];
const [pool]=pools;
let now=new Date(Date.now()+600000);
const clock=()=>new Date(now);
const original=new DatabaseStorage(drizzle(pool,{schema}) as any);
const retail=new PaymentAttemptService(original,clock);
const stores=pools.map(p=>new DurablePaymentStorage(p,createRetailReconciliationFinalizer(retail)));
const [one,two]=stores;
let merchant:number,otherMerchant:number,tenant:string,clientProfile:string;
const failures:string[]=[];let passed=0;
async function check(name:string,test:()=>Promise<void>) {
  await pool.query('DELETE FROM payment_notification_inbox');
  now=new Date(now.getTime()+120000);
  try {await test();passed++;console.log(`PASS ${name}`);}
  catch(error) {failures.push(name);const code=(error as any)?.code;
    console.error(`FAIL ${name} (${typeof code==='string' && /^[A-Z0-9_]+$/.test(code)?code:'assertion_failure'})`);}
}
async function invoice(vertical:'property'|'trades',total=1001,count=1) {
  const table=vertical==='property'?'invoices_rent_requests':'job_invoices';
  const party=vertical==='property'?'tenant_profile_id':'client_profile_id';
  return (await pool.query(`INSERT INTO ${table}(merchant_id,${party},amount_cents,token,delivery_channel,due_at,status,split_enabled,split_count)
    VALUES ($1,$2,$3,$4,'email',$5,$6,$7,$8) RETURNING id`,[merchant,vertical==='property'?tenant:clientProfile,
      total,randomUUID(),now,vertical==='property'?'dispatched':'sent',count>1,count>1?count:null])).rows[0].id as string;
}
const claimInput=(vertical:'property'|'trades',invoiceId:string,shareIndex=0)=>({vertical,invoiceId,merchantId:merchant,shareIndex,
  idempotencyKey:randomUUID(),currency:'NZD',environment:'uat' as const,providerAccount:'synthetic-account'});
async function opened(vertical:'property'|'trades',id?:string,shareIndex=0) {
  const input=claimInput(vertical,id??await invoice(vertical),shareIndex);
  const claim=await one.claimInvoice(input,now);assert.equal(claim.kind,'claimed');
  if(claim.kind!=='claimed') throw new Error('claim');
  const sessionId=`s-${randomUUID()}`,raw=randomBytes(32).toString('base64url');
  assert.equal((await one.attachInvoiceSession(claim.attempt.id,sessionId,raw,now)).kind,'attached');
  const binding=await two.resolveSession(sessionId);assert.ok(binding);
  return {input,attempt:claim.attempt,binding,raw,sessionId};
}
const evidence=(binding:SessionBinding,outcome:'approved'|'declined'|'cancelled'='approved'):VerifiedOutcome=>({...binding,
  kind:'verified',outcome,transactionId:`tx-${randomUUID()}`,transactionCount:1});
const worker=(store=one,result?:VerifiedOutcome)=>new PaymentReconciliationWorker(store,{query:async expected=>
  result??({...expected,kind:'verified',outcome:'approved',transactionId:`tx-${randomUUID()}`,transactionCount:1})},clock,()=>0);
async function row(vertical:'property'|'trades',id:string) {
  return (await pool.query(`SELECT * FROM ${vertical==='property'?'invoices_rent_requests':'job_invoices'} WHERE id=$1`,[id])).rows[0];
}
try {
  const runner=await import('../server/migrate');
  const applied=await runner.readMigrationLedger(pool);
  assert.ok(applied.some(row=>row.filename==='0034_durable_payment_reconciliation.sql'),'final expansion must be applied first');
  merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3','R3',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  otherMerchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('Other','Other',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  tenant=(await pool.query("INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address) VALUES ($1,'Test','Tenant','Synthetic') RETURNING id",[merchant])).rows[0].id;
  clientProfile=(await pool.query("INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address) VALUES ($1,'Test','Client','Synthetic') RETURNING id",[merchant])).rows[0].id;

  await check('two instances persist 32 duplicate receipts as one logical row',async()=>{
    const session=`s-${randomUUID()}`;
    const ids=await Promise.all(Array.from({length:32},(_,i)=>stores[i%2].receive(session,'fprn',now)));
    assert.equal(new Set(ids).size,1);
    const receipt=(await pool.query('SELECT * FROM payment_notification_inbox WHERE id=$1',[ids[0]])).rows[0];
    assert.equal(receipt.arrival_count,32);assert.equal(receipt.status,'pending');
  });
  await check('two competing workers claim a receipt only once',async()=>{
    await one.receive(`s-${randomUUID()}`,'fprn',now);
    const claims=await Promise.all(stores.map(s=>s.claimInbox(randomUUID(),now)));
    assert.equal(claims.filter(Boolean).length,1);
  });
  await check('expired worker cannot finish or settle after a new owner takes its lease',async()=>{
    const pay=await opened('property');await one.receive(pay.sessionId,'fprn',now);
    const stale=await one.claimInbox(randomUUID(),now);assert.ok(stale);
    now=new Date(now.getTime()+60001);await one.receive(pay.sessionId,'fprn',now);
    const fresh=await two.claimInbox(randomUUID(),now);assert.ok(fresh);
    assert.equal(await one.finishInbox(stale,{status:'complete'},now),false);
    assert.equal((await one.finalize(pay.binding,evidence(pay.binding),stale,now)).kind,'lease-lost');
    assert.equal((await row('property',pay.input.invoiceId)).status,'dispatched');
    assert.equal(await two.finishInbox(fresh,{status:'retry',nextAttemptAt:now},now),true);
  });
  await check('reused worker ID cannot finish or settle a newer claim generation',async()=>{
    const pay=await opened('property');await one.receive(pay.sessionId,'fprn',now);const owner=randomUUID();
    const stale=await one.claimInbox(owner,now);assert.ok(stale);now=new Date(now.getTime()+60001);
    const fresh=await two.claimInbox(owner,now);assert.ok(fresh);assert.equal(fresh.attemptCount,stale.attemptCount+1);
    assert.equal(await one.finishInbox(stale,{status:'complete'},now),false);
    assert.equal((await one.finalize(pay.binding,evidence(pay.binding),stale,now)).kind,'lease-lost');
    assert.equal(await two.finishInbox(fresh,{status:'retry',nextAttemptAt:now},now),true);
  });
  for(const vertical of ['property','trades'] as const) {
    await check(`${vertical}: same key reuses; another key and tenant cannot claim same share`,async()=>{
      const id=await invoice(vertical);const input=claimInput(vertical,id);
      const results=await Promise.all(stores.map(s=>s.claimInvoice(input,now)));
      assert.deepEqual(results.map(r=>r.kind).sort(),['claimed','reused']);
      assert.equal((await two.claimInvoice({...input,idempotencyKey:randomUUID()},now)).kind,'conflict');
      assert.equal((await two.claimInvoice({...input,providerAccount:'other'},now)).kind,'conflict');
      assert.equal((await two.claimInvoice({...input,merchantId:otherMerchant},now)).kind,'not-found');
    });
    await check(`${vertical}: unknown then approved settles despite lost or expired browser return`,async()=>{
      const pay=await opened(vertical);await one.receive(pay.sessionId,'fprn',now);
      await new PaymentReconciliationWorker(one,{query:async()=>({kind:'pending'})},clock,()=>0).runOne(randomUUID());
      assert.equal((await row(vertical,pay.input.invoiceId)).paid_at,null);
      now=new Date(now.getTime()+1800001);
      assert.equal((await two.resolveInvoiceReturnState(pay.raw,now)).kind,'expired');
      const result=evidence(pay.binding);await worker(two,result).runOne(randomUUID());
      assert.equal((await row(vertical,pay.input.invoiceId)).status,'paid');
      await Promise.all([one.receive(pay.sessionId,'fprn',now),two.receive(pay.sessionId,'browser',now)]);
      await worker(one,result).runOne(randomUUID());
      const count=(await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n;
      assert.equal(count,1);
      const outbox=(await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox o JOIN payment_settlement_events e ON e.id=o.event_id WHERE e.session_id=$1',[pay.sessionId])).rows[0].n;
      assert.equal(outbox,2);
    });
    await check(`${vertical}: pending then declined releases only the bound attempt`,async()=>{
      const pay=await opened(vertical);await one.receive(pay.sessionId,'fprn',now);
      await new PaymentReconciliationWorker(one,{query:async()=>({kind:'unknown'})},clock,()=>0).runOne(randomUUID());
      now=new Date(now.getTime()+2000);await worker(two,evidence(pay.binding,'declined')).runOne(randomUUID());
      const invoiceRow=await row(vertical,pay.input.invoiceId);assert.equal(invoiceRow.paid_at,null);
      assert.equal((await one.claimInvoice({...pay.input,idempotencyKey:randomUUID()},now)).kind,'claimed');
    });
    await check(`${vertical}: split A cannot pay B; remainder cents settle exactly once`,async()=>{
      const id=await invoice(vertical,1001,3);
      const payments=await Promise.all([1,2,3].map(share=>opened(vertical,id,share)));
      assert.deepEqual(payments.map(p=>p.attempt.amountCents),[334,334,333]);
      const first=evidence(payments[0].binding);
      await one.receive(payments[0].sessionId,'fprn',now);await worker(one,first).runOne(randomUUID());
      await two.receive(payments[1].sessionId,'fprn',now);await worker(two,first).runOne(randomUUID());
      assert.equal((await row(vertical,id)).split_paid_count,1);
      await pool.query('DELETE FROM payment_notification_inbox');
      for(const pay of payments.slice(1)) {await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());}
      const final=await row(vertical,id);assert.equal(final.split_paid_count,3);assert.equal(final.status,'paid');
      assert.equal(final.split_paid_sessions.length,3);
      assert.equal((await one.claimInvoice({...payments[0].input,idempotencyKey:randomUUID()},now)).kind,'conflict');
    });
  }
  await check('provider transaction cannot be reused on another invoice',async()=>{
    const first=await opened('property'),second=await opened('trades');const result=evidence(first.binding);
    await one.receive(first.sessionId,'fprn',now);await worker(one,result).runOne(randomUUID());
    await one.receive(second.sessionId,'fprn',now);await worker(two,{...evidence(second.binding),transactionId:result.transactionId}).runOne(randomUUID());
    assert.equal((await row('trades',second.input.invoiceId)).paid_at,null);
  });
  await check('browser and FPRN workers settle the same share concurrently only once',async()=>{
    const pay=await opened('property');const result=evidence(pay.binding);
    await one.receive(pay.sessionId,'fprn',now);await two.receive(pay.sessionId,'browser',now);
    await Promise.all(stores.map(s=>worker(s,result).runOne(randomUUID())));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_notification_inbox WHERE session_id=$1 AND status='complete'",[pay.sessionId])).rows[0].n,2);
  });
  await check('bounded retries stop unknown outcomes without money mutation',async()=>{
    const pay=await opened('trades');await one.receive(pay.sessionId,'fprn',now);
    await pool.query('UPDATE payment_notification_inbox SET attempt_count=19 WHERE session_id=$1',[pay.sessionId]);
    await new PaymentReconciliationWorker(one,{query:async()=>({kind:'unknown'})},clock,()=>0).runOne(randomUUID());
    const inbox=(await pool.query('SELECT status,last_error_code FROM payment_notification_inbox WHERE session_id=$1',[pay.sessionId])).rows[0];
    assert.deepEqual(inbox,{status:'dead_letter',last_error_code:'retry_exhausted'});
    assert.equal((await row('trades',pay.input.invoiceId)).paid_at,null);
  });
  await check('database rejects tenant drift, amount drift, duplicate sessions and transaction drift',async()=>{
    const pay=await opened('property');
    await assert.rejects(pool.query('UPDATE invoice_payment_attempts SET merchant_id=$2 WHERE id=$1',[pay.attempt.id,otherMerchant]));
    await assert.rejects(pool.query('UPDATE invoice_payment_attempts SET amount_cents=999 WHERE id=$1',[pay.attempt.id]));
    const other=await opened('trades');
    assert.equal((await two.attachInvoiceSession(other.attempt.id,pay.sessionId,randomBytes(32).toString('base64url'),now)).kind,'conflict');
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    await assert.rejects(pool.query('UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1',[pay.sessionId,'different-transaction']));
  });
  await check('expired unattached claim may be replaced; expired attached claim may not',async()=>{
    const id=await invoice('property'),input=claimInput('property',id);const claim=await one.claimInvoice(input,now);assert.equal(claim.kind,'claimed');
    now=new Date(now.getTime()+300001);
    assert.equal((await two.claimInvoice(input,now)).kind,'expired');
    assert.equal((await two.claimInvoice({...input,idempotencyKey:randomUUID()},now)).kind,'claimed');
    const pay=await opened('trades');now=new Date(now.getTime()+300001);
    assert.equal((await two.claimInvoice({...pay.input,idempotencyKey:randomUUID()},now)).kind,'conflict');
  });
  await check('crash during finalization rolls back invoice, attempt, audit and outbox',async()=>{
    const pay=await opened('property');await one.receive(pay.sessionId,'fprn',now);
    const faultPool:PaymentSqlPool={connect:async()=>{const c=await pools[1].connect();return {
      release:()=>c.release(),query:async(sql,values)=>{if(sql.includes('INSERT INTO payment_settlement_events')) throw new Error('synthetic crash');return c.query(sql,values);}};}};
    const faulty=new DurablePaymentStorage(faultPool);
    await worker(faulty,evidence(pay.binding)).runOne(randomUUID());
    assert.equal((await row('property',pay.input.invoiceId)).paid_at,null);
    assert.equal((await pool.query('SELECT state FROM invoice_payment_attempts WHERE id=$1',[pay.attempt.id])).rows[0].state,'ready');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n,0);
    now=new Date(now.getTime()+2000);await worker(two,evidence(pay.binding)).runOne(randomUUID());
    assert.equal((await row('property',pay.input.invoiceId)).status,'paid');
  });
  await check('possible provider acceptance blocks replacement after lease expiry',async()=>{
    const id=await invoice('property'),input=claimInput('property',id);const claim=await one.claimInvoice(input,now);
    assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed') throw new Error('claim');
    assert.equal(await one.markInvoiceSendStarted(claim.attempt.id,now),true);
    now=new Date(now.getTime()+300001);
    assert.equal((await two.claimInvoice({...input,idempotencyKey:randomUUID()},now)).kind,'conflict');
    assert.equal((await one.claimInvoice(input,now)).kind,'reused');
    assert.equal((await two.attachInvoiceSession(claim.attempt.id,`s-${randomUUID()}`,randomBytes(32).toString('base64url'),now)).kind,'attached');
    await assert.rejects(pool.query('UPDATE invoice_payment_attempts SET send_started_at=NULL WHERE id=$1',[claim.attempt.id]));
  });
  await check('concurrent invoice session creation sends one stable X-ID and persists before return',async()=>{
    const id=await invoice('trades'),input=claimInput('trades',id);let sends=0;
    const provider={create:async()=>{sends++;return {kind:'ready' as const,sessionId:`s-${randomUUID()}`};}};
    const services=stores.map(s=>new DurableInvoiceCheckout(s,provider,clock,()=>true));
    const results=await Promise.all(services.map(s=>s.open(input)));
    assert.equal(sends,1);assert.ok(results.some(r=>r.kind==='ready'));
    assert.equal((await services[1].open(input)).kind,'ready');assert.equal(sends,1);
    assert.equal((await row('trades',id)).paid_at,null);
  });
  await check('initiation disabled creates nothing while a retained legitimate session reconciles',async()=>{
    const pay=await opened('property');let sends=0;
    const disabled=new DurableInvoiceCheckout(one,{create:async()=>{sends++;return {kind:'unknown'};}},clock);
    assert.equal((await disabled.open({...pay.input,idempotencyKey:randomUUID()})).kind,'unavailable');assert.equal(sends,0);
    await one.receive(pay.sessionId,'fprn',now);await worker(two,evidence(pay.binding)).runOne(randomUUID());
    assert.equal((await row('property',pay.input.invoiceId)).status,'paid');
  });
  await check('timeout after possible invoice acceptance never blindly resends',async()=>{
    const id=await invoice('property'),input=claimInput('property',id);let sends=0;
    const service=new DurableInvoiceCheckout(one,{create:async()=>{sends++;throw new Error('synthetic timeout');}},clock,()=>true);
    assert.equal((await service.open(input)).kind,'processing');now=new Date(now.getTime()+300001);
    assert.equal((await service.open(input)).kind,'processing');
    assert.equal((await service.open({...input,idempotencyKey:randomUUID()})).kind,'conflict');assert.equal(sends,1);
  });
  await check('invoice manual-paid, void and split mutations are blocked by a live attempt',async()=>{
    const pay=await opened('property');
    for(const action of ['manualPaid','void','split'] as const) assert.equal((await one.changeInvoice({...pay.input,action,splitCount:3},now)).kind,'conflict');
    const id=await invoice('trades');
    assert.equal((await two.changeInvoice({vertical:'trades',invoiceId:id,merchantId:merchant,action:'manualPaid'},now)).kind,'claimed');
    assert.equal((await one.changeInvoice({vertical:'trades',invoiceId:id,merchantId:merchant,action:'manualPaid'},now)).kind,'terminal');
    const count=(await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events e JOIN payment_session_bindings b ON b.session_id=e.session_id JOIN invoice_payment_attempts a ON a.id=b.invoice_attempt_id WHERE a.job_invoice_id=$1',[id])).rows[0].n;
    assert.equal(count,0,'manual payment never claims provider approval');
  });
  await check('database rejects cross-tenant creation and missing concrete invoice foreign key',async()=>{
    const pay=await opened('property'),newId=await invoice('property');
    const insert=(rentId:string|null,owner:number)=>pool.query(`INSERT INTO invoice_payment_attempts(merchant_id,rent_invoice_id,
      share_index,amount_cents,idempotency_key,request_fingerprint,processor_x_id,currency,reference,environment,provider_account,lease_expires_at,created_at,updated_at)
      SELECT $2,$3,0,amount_cents,$4,request_fingerprint,$5,currency,reference,environment,provider_account,lease_expires_at,created_at,updated_at
      FROM invoice_payment_attempts WHERE id=$1`,[pay.attempt.id,owner,rentId,randomUUID(),randomUUID()]);
    await assert.rejects(insert(newId,otherMerchant),(error:any)=>error.code==='23503');
    await assert.rejects(insert(null,merchant),(error:any)=>error.code==='23514');
  });
  await check('crash after financial commit before receipt completion replays without duplicate events',async()=>{
    const pay=await opened('trades');await one.receive(pay.sessionId,'fprn',now);const result=evidence(pay.binding);
    let fail=true;
    const repository={claimInbox:one.claimInbox.bind(one),resolveSession:one.resolveSession.bind(one),finalize:one.finalize.bind(one),
      finishInbox:async(...args:Parameters<typeof one.finishInbox>)=>{if(fail){fail=false;throw new Error('synthetic crash');}return one.finishInbox(...args);}};
    await new PaymentReconciliationWorker(repository,{query:async()=>result},clock,()=>0).runOne(randomUUID());
    now=new Date(now.getTime()+2000);await worker(two,result).runOne(randomUUID());
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n,1);
    assert.equal((await pool.query('SELECT status FROM payment_notification_inbox WHERE session_id=$1',[pay.sessionId])).rows[0].status,'complete');
  });
  await check('outbox send/ack crash repeats the same delivery key for receiver deduplication',async()=>{
    await pool.query('DELETE FROM payment_delivery_outbox');const pay=await opened('property');
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    const seen=new Set<string>();let deliveries=0,fail=true;
    const receiver={deliver:async({deliveryKey}:{deliveryKey:string})=>{if(!seen.has(deliveryKey)){seen.add(deliveryKey);deliveries++;}}};
    const repository={claimOutbox:one.claimOutbox.bind(one),finishOutbox:async(...args:Parameters<typeof one.finishOutbox>)=>{
      if(fail){fail=false;throw new Error('synthetic ack crash');}return one.finishOutbox(...args);}};
    await new PaymentOutboxWorker(repository,receiver,clock).runOne(randomUUID());
    now=new Date(now.getTime()+2000);
    const consumers=stores.map(s=>new PaymentOutboxWorker(s,receiver,clock));
    await Promise.all(consumers.map(w=>w.runOne(randomUUID())));
    assert.equal(deliveries,2,'one merchant update plus one payer receipt');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE status='complete'")).rows[0].n,2);
  });
  await check('existing raw invoice links survive bounded token hash backfill',async()=>{
    const ids=[await invoice('property'),await invoice('trades')];
    const raws=await Promise.all(ids.map((id,i)=>row(i?'trades':'property',id).then(r=>r.token)));
    const quote=(await pool.query(`INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents)
      VALUES ($1,$2,$3,'[]'::jsonb,1001,1001) RETURNING id,token`,[merchant,clientProfile,randomUUID()])).rows[0];
    assert.equal((await original.getQuoteByToken(quote.token))?.id,quote.id);
    assert.equal((await original.getInvoiceRentRequestByToken(raws[0]))?.id,ids[0]);
    assert.equal((await original.getJobInvoiceByToken(raws[1]))?.id,ids[1]);
    let count=0,batch=0;do {batch=await one.backfillInvoiceTokenHashes(50);count+=batch;} while(batch>0);
    assert.ok(count>=2);
    for(let i=0;i<ids.length;i++){const invoiceRow=await row(i?'trades':'property',ids[i]);assert.equal(invoiceRow.token,raws[i]);assert.match(invoiceRow.token_hash,/^[0-9a-f]{64}$/);}
    assert.equal(await two.backfillInvoiceTokenHashes(50),0);
    assert.equal((await original.getQuoteByToken(quote.token))?.id,quote.id);
    assert.equal((await original.getInvoiceRentRequestByToken(raws[0]))?.id,ids[0]);
    assert.equal((await original.getJobInvoiceByToken(raws[1]))?.id,ids[1]);
  });
  await check('outbox reused worker ID rejects an old claim generation',async()=>{
    await pool.query('DELETE FROM payment_delivery_outbox');const pay=await opened('property');
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    const owner=randomUUID(),stale=await one.claimOutbox(owner,now);assert.ok(stale);
    now=new Date(now.getTime()+60001);const fresh=await two.claimOutbox(owner,now);assert.ok(fresh);
    // The other channel may sort first; claim again to locate the expired item.
    const renewed=fresh.id===stale.id ? fresh : await two.claimOutbox(owner,now);assert.ok(renewed);assert.equal(renewed.id,stale.id);
    assert.equal(await one.finishOutbox(stale,'complete',now),false);
    assert.equal(await two.finishOutbox(renewed,'complete',now),true);
  });
  await check('retail reuses original engine with exact expectations, inbox fence and atomic outbox',async()=>{
    const transaction=await original.createTransaction({merchantId:merchant,itemName:'Synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false} as any);
    const idempotencyKey=randomUUID();
    const claim=await retail.claim({transactionId:transaction.id,shareIndex:0,idempotencyKey});assert.equal(claim.kind,'claimed');
    if(claim.kind!=='claimed') throw new Error('claim');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    now=new Date(now.getTime()+300001);
    assert.equal((await retail.claim({transactionId:transaction.id,shareIndex:0,idempotencyKey:randomUUID()})).kind,'expired');
    assert.equal((await retail.getAttempt(claim.attempt.id))?.state,'claiming');
    const sessionId=`s-${randomUUID()}`;
    const rawReturnState=randomBytes(32).toString('base64url');
    assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected.processorXId,rawReturnState})).kind,'attached');
    assert.equal((await retail.resolveReturnState(rawReturnState)).kind,'resolved');
    // Deliberately omit registry insertion: resolveSession repairs that crash.
    const binding=await two.resolveSession(sessionId);assert.ok(binding);const result=evidence(binding);
    await one.receive(sessionId,'fprn',now);const owner=randomUUID(),stale=await one.claimInbox(owner,now);assert.ok(stale);
    now=new Date(now.getTime()+60001);const fresh=await two.claimInbox(owner,now);assert.ok(fresh);
    assert.equal((await one.finalize(binding,result,stale,now)).kind,'lease-lost');
    assert.equal((await original.getTransaction(transaction.id))?.status,'pending');
    assert.equal((await two.finalize(binding,result,fresh,now)).kind,'finalized');
    assert.equal(await two.finishInbox(fresh,{status:'complete',transactionId:result.transactionId},now),true);
    assert.equal((await original.getTransaction(transaction.id))?.status,'completed');
    const before=(await pool.query('SELECT total_lifetime_transactions FROM merchant_subscriptions WHERE merchant_id=$1',[merchant])).rows[0].total_lifetime_transactions;
    await one.receive(sessionId,'browser',now);await worker(one,result).runOne(randomUUID());
    assert.equal((await pool.query('SELECT total_lifetime_transactions FROM merchant_subscriptions WHERE merchant_id=$1',[merchant])).rows[0].total_lifetime_transactions,before);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0].n,1);
    await assert.rejects(pool.query('UPDATE payment_attempts SET share_index=1 WHERE id=$1',[claim.attempt.id]));
  });
  assert.deepEqual(failures,[],`${failures.length} R3 verification checks failed`);
  console.log(`R3 PostgreSQL: ${passed} checks passed; synthetic only, no provider or production activity`);
} finally {await Promise.all(pools.map(p=>p.end()));}
