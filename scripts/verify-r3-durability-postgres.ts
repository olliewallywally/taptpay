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
import {DurableRetailCheckout} from '../server/durable-retail-checkout';
import {PaymentRuntime} from '../server/payment-runtime';
import {createRetailReconciliationFinalizer,createRetailSessionRecoveryAttacher} from '../server/retail-reconciliation-adapter';
import {createWindcaveReconciliationProvider} from '../server/windcave-reconciliation-provider';
import type {SessionBinding,VerifiedOutcome} from '../server/durable-payment-contract';

const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const target=new URL(testDatabaseUrl);assert.equal(target.hostname,'127.0.0.1');assert.ok(['/r3_scratch','/r3_integrated_scratch'].includes(target.pathname));
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
const stores=pools.map(p=>new DurablePaymentStorage(p,createRetailReconciliationFinalizer(retail),createRetailSessionRecoveryAttacher(original)));
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
  assert.ok(applied.some(row=>row.filename==='0037_retail_payment_canonical_integration.sql'),'integrated expansion must be applied first');
  merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3','R3',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  otherMerchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('Other','Other',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  tenant=(await pool.query("INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address) VALUES ($1,'Test','Tenant','Synthetic') RETURNING id",[merchant])).rows[0].id;
  clientProfile=(await pool.query("INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address) VALUES ($1,'Test','Client','Synthetic') RETURNING id",[merchant])).rows[0].id;

  for(const split of [false,true])await check(`retail: ${split?'split':'full'} decline retains evidence without captured money or blocking cancellation`,async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Declined synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:split});
    if(split)await original.createBillSplit(sale.id,2);
    const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:split?1:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const sessionId=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected,paymentAttemptId:claim.attempt.id,sessionId},now),true);const binding=await one.resolveSession(sessionId);assert.ok(binding);
    const proof=evidence(binding,'declined');await one.receive(sessionId,'fprn',now);await worker(one,proof).runOne(randomUUID());
    assert.equal((await original.getTransaction(sale.id))!.windcaveTransactionId,null);
    if(split)assert.equal((await original.getSplitPaymentsByTransaction(sale.id))[0].windcaveTransactionId,null);
    assert.equal((await retail.getAttempt(claim.attempt.id))!.providerTransactionId,proof.transactionId);
    assert.equal((await pool.query('SELECT provider_transaction_id FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows[0].provider_transaction_id,proof.transactionId);
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
  });
  await check('two instances persist 32 duplicate receipts as one logical row',async()=>{
    const session=`s-${randomUUID()}`;
    const ids=await Promise.all(Array.from({length:32},(_,i)=>stores[i%2].receive(session,'fprn',now)));
    assert.equal(new Set(ids).size,1);
    const receipt=(await pool.query('SELECT * FROM payment_notification_inbox WHERE id=$1',[ids[0]])).rows[0];
    assert.equal(receipt.arrival_count,32);assert.equal(receipt.status,'pending');
  });
  await check('retail: cancelling a pending provider attempt preserves a later verified payment',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Late captured synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');
    if(claim.kind!=='claimed')throw new Error('fixture_claim');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const sessionId=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected,paymentAttemptId:claim.attempt.id,sessionId},now),true);
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
    const binding=await one.resolveSession(sessionId);assert.ok(binding);const proof=evidence(binding);
    await one.receive(sessionId,'fprn',now);await worker(one,proof).runOne(randomUUID());
    assert.equal((await original.getTransaction(sale.id))?.status,'completed');
    assert.equal((await pool.query('SELECT previous_aggregate_status FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0].previous_aggregate_status,'cancelled');
    await two.receive(sessionId,'browser',now);await worker(two,proof).runOne(randomUUID());
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0].n,1);
  });
  for(const vertical of ['property','trades'] as const)await check(`${vertical}: void then late approval records real money once`,async()=>{
    const pay=await opened(vertical);assert.equal((await one.changeInvoice({vertical,invoiceId:pay.input.invoiceId,merchantId:merchant,action:'void'},now)).kind,'claimed');
    const proof=evidence(pay.binding);await one.receive(pay.sessionId,'fprn',now);await worker(one,proof).runOne(randomUUID());
    assert.equal((await row(vertical,pay.input.invoiceId)).status,'paid');
    assert.equal((await pool.query('SELECT previous_aggregate_status FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].previous_aggregate_status,'voided');
  });
  for(const vertical of ['property','trades'] as const) {
    await check(`${vertical}: external record and late capture both survive without duplicate audit or money`,async()=>{
      const pay=await opened(vertical);const method=vertical==='property'?'markInvoiceRentRequestPaidExternalForMerchant':'markJobInvoicePaidExternalForMerchant';
      assert.equal((await original[method](pay.input.invoiceId,merchant,'synthetic bank transfer',{userId:1,role:'owner'})).kind,'ok');
      const before=await row(vertical,pay.input.invoiceId),proof=evidence(pay.binding);
      await one.receive(pay.sessionId,'fprn',now);await worker(one,proof).runOne(randomUUID());
      const after=await row(vertical,pay.input.invoiceId);assert.equal(after.status,'paid_external');
      assert.equal(after.external_payment_reference,'synthetic bank transfer');assert.equal(after.paid_at.toISOString(),before.paid_at.toISOString());
      assert.equal(after.split_paid_count,before.split_paid_count);
      await two.receive(pay.sessionId,'browser',now);await worker(two,proof).runOne(randomUUID());
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n,1);
      assert.equal((await pool.query('SELECT previous_aggregate_status FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].previous_aggregate_status,'paid_external');
      assert.equal((await original[method](pay.input.invoiceId,merchant,'synthetic bank transfer')).kind,'ok');
    });
    await check(`${vertical}: partial late capture keeps the invoice voided and exact paid share count`,async()=>{
      const pay=await opened(vertical,await invoice(vertical,1001,2),1);
      assert.equal((await one.changeInvoice({vertical,invoiceId:pay.input.invoiceId,merchantId:merchant,action:'void'},now)).kind,'claimed');
      const before=await row(vertical,pay.input.invoiceId),proof=evidence(pay.binding);
      await one.receive(pay.sessionId,'fprn',now);await worker(one,proof).runOne(randomUUID());
      const after=await row(vertical,pay.input.invoiceId);assert.equal(after.status,'voided');assert.equal(after.split_paid_count,1);
      assert.equal(after.voided_at.toISOString(),before.voided_at.toISOString());
      assert.equal(Number((await pool.query('SELECT amount_cents FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].amount_cents),501);
      await two.receive(pay.sessionId,'browser',now);await worker(two,proof).runOne(randomUUID());
      assert.equal((await row(vertical,pay.input.invoiceId)).split_paid_count,1);
      assert.equal((await one.claimInvoice(claimInput(vertical,pay.input.invoiceId,2),now)).kind,'conflict');
    });
  }
  for(const domain of ['retail','property','trades'] as const)for(const failure of ['audit','outbox'] as const) {
    await check(`${domain}: manual command ${failure} failure rolls back state and audit/outbox`,async()=>{
      const id=domain==='retail'?(await original.createTransaction({merchantId:merchant,itemName:'Synthetic rollback',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false})).id:await invoice(domain);
      const eventTable=domain==='trades'?'job_events':'transaction_events',table=failure==='audit'?eventTable:'payment_delivery_outbox';
      const condition=failure==='audit'?(domain==='retail'?"NEW.event_type='Transaction_Cancelled'":domain==='property'?"NEW.event_type='Invoice_Voided'":"NEW.event_type='invoice_voided'"):(domain==='trades'?'NEW.job_event_id IS NOT NULL':'NEW.transaction_event_id IS NOT NULL');
      const run=()=>domain==='retail'?original.cancelTransactionForMerchant(Number(id),merchant):domain==='property'?original.voidInvoiceRentRequestForMerchant(String(id),merchant):original.voidJobInvoiceForMerchant(String(id),merchant);
      await pool.query(`CREATE FUNCTION test_r3_manual_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic manual rollback'; END IF; RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER test_r3_manual_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test_r3_manual_failure()`);
      try {
        await assert.rejects(run());
        const status=domain==='retail'?(await original.getTransaction(Number(id)))?.status:(await row(domain,String(id))).status;
        assert.equal(status,domain==='retail'?'pending':domain==='property'?'dispatched':'sent');
        const column=domain==='retail'?'transaction_id':domain==='property'?'invoice_id':'job_invoice_id';
        assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${eventTable} WHERE ${column}=$1`,[id])).rows[0].n,0);
      }finally{await pool.query(`DROP TRIGGER test_r3_manual_failure ON ${table}`);await pool.query('DROP FUNCTION test_r3_manual_failure()');}
      assert.ok(['cancelled','ok'].includes((await run()).kind));
    });
  }
  for(const vertical of ['property','trades'] as const)for(const result of ['approved','pending','unavailable'] as const) {
    await check(`${vertical}: manual action queries the shared verifier outside locks (${result})`,async()=>{
      const {reconcileRetainedPaymentsBeforeManualCommand}=await import('../server/payment-manual-reconciliation');
      const pay=await opened(vertical),table=vertical==='property'?'invoices_rent_requests':'job_invoices';let queries=0;
      const provider={query:async()=>{
        queries++;const probe=await pools[1].connect();
        try{await probe.query('BEGIN');await probe.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE NOWAIT`,[pay.input.invoiceId]);
          await probe.query('SELECT id FROM invoice_payment_attempts WHERE id=$1 FOR UPDATE NOWAIT',[pay.attempt.id]);await probe.query('ROLLBACK');}
        finally{await probe.query('ROLLBACK');probe.release();}
        return result==='approved'?evidence(pay.binding):{kind:result as 'pending'|'unavailable'};
      }};
      const runtime=Object.assign(new PaymentRuntime(one,provider,clock),{repository:one,client:{} as any,context:{providerEnvironment:'uat' as const,accountUsername:'synthetic-account'}});
      await reconcileRetainedPaymentsBeforeManualCommand(runtime,{domain:vertical,aggregateId:pay.input.invoiceId,merchantId:otherMerchant});assert.equal(queries,0);
      await reconcileRetainedPaymentsBeforeManualCommand(runtime,{domain:vertical,aggregateId:pay.input.invoiceId,merchantId:merchant});assert.equal(queries,1);
      const method=vertical==='property'?'voidInvoiceRentRequestForMerchant':'voidJobInvoiceForMerchant';
      const command=await original[method](pay.input.invoiceId,merchant);
      assert.equal(command.kind,result==='approved'?'conflict':'ok');
      assert.equal((await row(vertical,pay.input.invoiceId)).status,result==='approved'?'paid':'voided');
      assert.equal((await one.resolveSession(pay.sessionId))?.invoiceAttemptId,pay.attempt.id);
    });
  }
  await check('two competing workers claim a receipt only once',async()=>{
    await one.receive(`s-${randomUUID()}`,'fprn',now);
    const claims=await Promise.all(stores.map(s=>s.claimInbox(randomUUID(),now)));
    assert.equal(claims.filter(Boolean).length,1);
  });
  await check('property reuse cannot change an amount frozen by a provider attempt',async()=>{
    const ownTenant=(await pool.query("INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address) VALUES ($1,'Amount','Guard','Synthetic') RETURNING id",[merchant])).rows[0].id;
    const id=(await pool.query("INSERT INTO invoices_rent_requests(merchant_id,tenant_profile_id,amount_cents,token,delivery_channel,due_at,status,kind) VALUES ($1,$2,1001,$3,'email',$4,'dispatched','rent') RETURNING id",[merchant,ownTenant,randomUUID(),now])).rows[0].id;
    const pay=await opened('property',id);
    const attempt=await one.getInvoiceAttemptByKey(pay.input);assert.ok(attempt);
    const result=await original.createOrReuseInvoiceRentRequestForMerchant(ownTenant,merchant,{kind:'rent',amountCents:2002,deliveryChannel:'email',dueAt:now,splitEnabled:false});
    assert.equal(result.kind,'payment-active');assert.equal((await row('property',id)).amount_cents,1001);
    assert.equal((await one.getInvoiceAttemptByKey(pay.input))?.requestFingerprint,attempt.requestFingerprint);
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
    await check(`${vertical}: concurrent reservations allocate distinct exact shares and retries keep their assignment`,async()=>{
      const id=await invoice(vertical,1001,3),inputs=Array.from({length:3},()=>({...claimInput(vertical,id,1),reserveShare:true}));
      const claims=await Promise.all(inputs.map((input,index)=>stores[index%2].claimInvoice(input,now)));
      assert.equal(claims.filter(claim=>claim.kind==='claimed').length,3);
      const attempts=claims.map(claim=>{assert.ok('attempt' in claim);return claim.attempt;});
      assert.equal(new Set(attempts.map(attempt=>attempt.shareIndex)).size,3);
      assert.equal(attempts.reduce((total,attempt)=>total+attempt.amountCents,0),1001);
      const replay=await two.claimInvoice({...inputs[0],shareIndex:3},now);assert.equal(replay.kind,'reused');
      assert.ok('attempt' in replay);assert.equal(replay.attempt.id,attempts[0].id);assert.equal(replay.attempt.shareIndex,attempts[0].shareIndex);
      assert.equal((await one.claimInvoice({...claimInput(vertical,id,1),reserveShare:true},now)).kind,'conflict');
    });
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
  await check('invoice split stays frozen after a provider attempt; manual commands retain an unknown attempt',async()=>{
    const pay=await opened('property');
    assert.equal((await one.changeInvoice({...pay.input,action:'split',splitCount:3},now)).kind,'conflict');
    assert.equal((await one.changeInvoice({...pay.input,action:'void'},now)).kind,'claimed');
    assert.equal((await one.resolveSession(pay.sessionId))?.invoiceAttemptId,pay.attempt.id);
    const id=await invoice('trades');
    assert.equal((await two.changeInvoice({vertical:'trades',invoiceId:id,merchantId:merchant,action:'manualPaid',reference:'external synthetic'},now)).kind,'claimed');
    assert.equal((await one.changeInvoice({vertical:'trades',invoiceId:id,merchantId:merchant,action:'manualPaid',reference:'external synthetic'},now)).kind,'terminal');
    assert.equal((await one.changeInvoice({vertical:'trades',invoiceId:id,merchantId:merchant,action:'manualPaid',reference:'different'},now)).kind,'conflict');
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
    const pay=await opened('property');
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    const eventId=(await pool.query('SELECT id FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].id;
    const seen=new Set<string>();let deliveries=0,fail=true;
    const receiver={deliver:async({deliveryKey}:{deliveryKey:string})=>{if(!seen.has(deliveryKey)){seen.add(deliveryKey);deliveries++;}}};
    const repository={claimOutbox:(owner:string,date:Date)=>one.claimOutbox(owner,date,eventId),finishOutbox:async(...args:Parameters<typeof one.finishOutbox>)=>{
      if(fail){fail=false;throw new Error('synthetic ack crash');}return one.finishOutbox(...args);}};
    await new PaymentOutboxWorker(repository,receiver,clock).runOne(randomUUID());
    now=new Date(now.getTime()+2000);
    const consumers=stores.map(s=>new PaymentOutboxWorker({claimOutbox:(owner,date)=>s.claimOutbox(owner,date,eventId),finishOutbox:s.finishOutbox.bind(s)},receiver,clock));
    await Promise.all(consumers.map(w=>w.runOne(randomUUID())));
    assert.equal(deliveries,2,'one merchant update plus one payer receipt');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE event_id=$1 AND status='complete'",[eventId])).rows[0].n,2);
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
    const pay=await opened('property');
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    const eventId=(await pool.query('SELECT id FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].id;
    const owner=randomUUID(),stale=await one.claimOutbox(owner,now,eventId);assert.ok(stale);
    now=new Date(now.getTime()+60001);const fresh=await two.claimOutbox(owner,now,eventId);assert.ok(fresh);
    // The other channel may sort first; claim again to locate the expired item.
    const renewed=fresh.id===stale.id ? fresh : await two.claimOutbox(owner,now,eventId);assert.ok(renewed);assert.equal(renewed.id,stale.id);
    assert.equal(await one.finishOutbox(stale,'complete',now),false);
    assert.equal(await two.finishOutbox(renewed,'complete',now),true);
  });
  await check('actual R2 transport/parser/verifier reconciles invoice and original retail engine',async()=>{
    const {createWindcaveClient}=await import('../server/windcave-client');
    const {UAT_WINDCAVE_ENDPOINT}=await import('../server/config');
    for(const vertical of ['property','trades','retail'] as const) {
      let binding:SessionBinding;
      if(vertical==='retail') {
        const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic R2 worker',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
        const claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');
        if(claim.kind!=='claimed') throw new Error('fixture_claim');
        const prepared=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(prepared);
        const session=`s-${randomUUID()}`;
        assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:session,processorXId:prepared.processorXId})).kind,'attached');
        binding=(await one.resolveSession(session))!;
      } else binding=(await opened(vertical)).binding;
      assert.ok(binding);const transactionId=`tx-${randomUUID()}`;
      const client=createWindcaveClient({config:{mode:'uat',endpoint:UAT_WINDCAVE_ENDPOINT,username:'synthetic-account',apiKey:'synthetic-test-only',publicOrigin:'https://harness.test'},
        transport:async(url,init)=>{
          assert.equal(url,`${UAT_WINDCAVE_ENDPOINT}/sessions/${binding.sessionId}`);assert.equal(init.method,'GET');
          const cents=binding.amountCents;
          return new Response(JSON.stringify({id:binding.sessionId,state:'complete',transactions:[{id:transactionId,authorised:true,type:'purchase',
            amount:`${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`,currency:binding.currency,
            merchantReference:binding.reference,sessionId:binding.sessionId,username:'synthetic-account'}]}),{status:200});
        },wait:async()=>{},clock,audit:()=>undefined});
      await one.receive(binding.sessionId,'fprn',now);
      await new PaymentReconciliationWorker(one,createWindcaveReconciliationProvider(client,{providerEnvironment:'uat',accountUsername:'synthetic-account'}),clock).runOne(randomUUID());
      assert.equal((await pool.query('SELECT outcome FROM payment_settlement_events WHERE session_id=$1',[binding.sessionId])).rows[0]?.outcome,'approved');
      assert.equal((await pool.query('SELECT status FROM payment_notification_inbox WHERE session_id=$1',[binding.sessionId])).rows[0].status,'complete');
    }
  });
  await check('R2 expected/reconciliation writes coexist with R3 canonical write-once identity',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic R2 integration',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');
    if(claim.kind!=='claimed') throw new Error('fixture_claim');
    const expected={attemptId:claim.attempt.id,amountCents:1001,currency:'NZD',merchantReference:`TAPT_${claim.attempt.id}`,providerEnvironment:'uat' as const};
    assert.equal((await retail.recordExpectedValues(expected)).kind,'recorded');
    assert.equal((await retail.recordExpectedValues(expected)).kind,'reused');
    assert.equal((await retail.recordReconciliation({attemptId:claim.attempt.id,code:'pending'})).kind,'recorded');
    const prepared=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);
    assert.ok(prepared);assert.equal(prepared.reference,expected.merchantReference);
    assert.equal((await retail.recordReconciliation({attemptId:claim.attempt.id,code:'integrity_mismatch:amount'})).kind,'recorded');
    for(const patch of ["expected_amount_cents=1002","expected_currency='AUD'","expected_merchant_reference='other'","provider_environment='production'","expected_provider_account='other'","processor_x_id='other'"])
      await assert.rejects(pool.query(`UPDATE payment_attempts SET ${patch} WHERE id=$1`,[claim.attempt.id]),{code:'23514'});
    const persisted=(await pool.query('SELECT * FROM payment_attempts WHERE id=$1',[claim.attempt.id])).rows[0];
    assert.equal(persisted.expected_amount_cents,'1001');assert.equal(persisted.last_reconciliation_code,'integrity_mismatch:amount');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_attempt_expectations WHERE payment_attempt_id=$1',[claim.attempt.id])).rows[0].n,0);
    assert.ok(persisted.send_started_at);assert.equal(persisted.processor_transaction_id,null);
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
  await check('retail cancellation retains unknown attempts and rejects captured shares',async()=>{
    const create=()=>original.createTransaction({merchantId:merchant,itemName:'Synthetic guard',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const clean=await create();assert.equal((await original.cancelTransactionForMerchant(clean.id,otherMerchant)).kind,'not-found');
    assert.equal((await original.cancelTransactionForMerchant(clean.id,merchant)).kind,'cancelled');
    const sale=await create(),claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});
    assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed') throw new Error('fixture_claim');
    await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);
    now=new Date(now.getTime()+300001);
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
    assert.equal((await original.getPaymentAttempt(claim.attempt.id))?.state,'claiming');
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
    const captured=await create();await pool.query('UPDATE transactions SET completed_splits=1 WHERE id=$1',[captured.id]);
    assert.equal((await original.cancelTransactionForMerchant(captured.id,merchant)).kind,'conflict');
    const split=await create();await pool.query(`INSERT INTO split_payments(transaction_id,merchant_id,split_index,amount,status,windcave_transaction_id)
      VALUES ($1,$2,1,'5.01','completed',$3)`,[split.id,merchant,`synthetic-${randomUUID()}`]);
    assert.equal((await original.cancelTransactionForMerchant(split.id,merchant)).kind,'conflict');
    assert.equal((await original.getTransaction(split.id))?.status,'pending');
  });
  await check('cancellation rechecks newly captured money after waiting for the parent lock',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic race',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const holder=await pool.connect();let cancellation:ReturnType<typeof original.cancelTransactionForMerchant>|undefined;
    try {
      await holder.query('BEGIN');await holder.query('SELECT id FROM transactions WHERE id=$1 FOR UPDATE',[sale.id]);
      cancellation=original.cancelTransactionForMerchant(sale.id,merchant);
      const deadline=Date.now()+1500;let waiting=false;
      while(Date.now()<deadline) {
        waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%transactions%') AS waiting")).rows[0].waiting;
        if(waiting) break;await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.ok(waiting,'cancellation must really wait on a competing transaction');
      await holder.query(`INSERT INTO split_payments(transaction_id,merchant_id,split_index,amount,status,windcave_transaction_id)
        VALUES ($1,$2,1,'5.01','completed',$3)`,[sale.id,merchant,`synthetic-${randomUUID()}`]);
      await holder.query('COMMIT');assert.equal((await cancellation).kind,'conflict');
      assert.equal((await original.getTransaction(sale.id))?.status,'pending');
    } finally {await holder.query('ROLLBACK');holder.release();if(cancellation) await cancellation.catch(()=>undefined);}
  });
  for(const vertical of ['property','trades'] as const) await check(`${vertical}: manual commands keep attempts, commit one audited outbox and reject paid shares`,async()=>{
    const methods=vertical==='property' ? ['voidInvoiceRentRequestForMerchant','markInvoiceRentRequestPaidExternalForMerchant'] as const
      : ['voidJobInvoiceForMerchant','markJobInvoicePaidExternalForMerchant'] as const;
    const table=vertical==='property'?'invoices_rent_requests':'job_invoices',events=vertical==='property'?'transaction_events':'job_events';
    const column=vertical==='property'?'invoice_id':'job_invoice_id',source=vertical==='property'?'transaction_event_id':'job_event_id';
    for(const method of methods) {
      const held=await invoice(vertical),claim=await one.claimInvoice(claimInput(vertical,held),now);assert.equal(claim.kind,'claimed');
      if(claim.kind!=='claimed') throw new Error('fixture_claim');
      assert.equal((await (original[method] as any)(held,otherMerchant)).kind,'not-found');
      const args=method.startsWith('mark')?[held,merchant,'synthetic external',{userId:1,role:'owner'}]:[held,merchant,{userId:1,role:'owner'}];
      const result=await (original[method] as any)(...args);assert.equal(result.kind,'ok');
      assert.equal((await (original[method] as any)(...args)).kind,'ok');
      if(method.startsWith('mark'))assert.equal((await (original[method] as any)(held,merchant,'changed reference')).kind,'conflict');
      const attempt=(await pool.query('SELECT state FROM invoice_payment_attempts WHERE id=$1',[claim.attempt.id])).rows[0];assert.equal(attempt.state,'claiming');
      const recorded=(await pool.query(`SELECT * FROM ${events} WHERE ${column}=$1`,[held])).rows;assert.equal(recorded.length,1);
      assert.equal(recorded[0].payload.actor.userId,1);assert.equal(recorded[0].payload.actor.role,'owner');
      const outbox=(await pool.query(`SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE ${source}=$1`,[recorded[0].id])).rows[0].n;
      assert.equal(outbox,method.startsWith('mark')?2:1);
      const captured=await invoice(vertical);await pool.query(`UPDATE ${table} SET split_paid_count=1 WHERE id=$1`,[captured]);
      assert.equal((await (original[method] as any)(captured,merchant)).kind,'conflict');
    }
  });
  await check('two instances record one concurrent cash command, audit and manual outbox event',async()=>{
    const other=new DatabaseStorage(drizzle(pools[1],{schema}) as any),key=randomUUID();
    const input={merchantId:merchant,itemName:'Synthetic cash concurrency',price:'10.01',idempotencyKey:key,actor:{userId:1,role:'owner' as const}};
    const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?other:original).recordCashSaleForMerchant(input.merchantId,input)));
    assert.equal(results.filter(r=>r.kind==='recorded').length,1);
    assert.equal(new Set(results.filter(r=>r.kind==='recorded'||r.kind==='reused').map(r=>r.transaction.id)).size,1);
    const sale=await original.getCashSaleByKeyForMerchant(merchant,key);assert.ok(sale);assert.equal(sale.paymentMethod,'cash');assert.equal(sale.windcaveTransactionId,null);
    const events=(await pool.query('SELECT * FROM transaction_events WHERE transaction_id=$1',[sale.id])).rows;
    assert.equal(events.length,1);assert.equal(events[0].event_type,'Cash_Recorded');assert.equal(events[0].payload.source,'manual_cash');
    const outbox=(await pool.query('SELECT * FROM payment_delivery_outbox WHERE transaction_event_id=$1',[events[0].id])).rows;
    assert.equal(outbox.length,1);assert.equal(outbox[0].event_id,null);assert.equal(outbox[0].channel,'merchant_payment_update');
    assert.equal((await original.recordCashSaleForMerchant(input.merchantId,{...input,price:'10.02'})).kind,'conflict');
    assert.equal((await original.recordCashSaleForMerchant(input.merchantId,{...input,itemName:'different'})).kind,'conflict');
    assert.equal((await original.recordCashSaleForMerchant(input.merchantId,input)).kind,'reused');
    await assert.rejects(pool.query("UPDATE transactions SET price='10.02' WHERE id=$1",[sale.id]),{code:'23514'});
    await assert.rejects(pool.query('UPDATE transactions SET merchant_id=$2 WHERE id=$1',[sale.id,otherMerchant]),{code:'23514'});
  });
  await check('cash key scope, unchanged request and audited read-only replay cannot bypass new-record gating',async()=>{
    const key=randomUUID(),input={merchantId:merchant,itemName:'Synthetic cash scope',price:'0010.01',idempotencyKey:key,actor:{userId:1,role:'owner' as const}};
    assert.equal((await original.recordCashSaleForMerchant(input.merchantId,input,{allowCreate:false})).kind,'not-found');
    assert.equal((await original.recordCashSaleForMerchant(input.merchantId,input)).kind,'recorded');
    const replay=await original.recordCashSaleForMerchant(input.merchantId,{...input,price:'10.01',idempotencyKey:key.toUpperCase()},{allowCreate:false});assert.equal(replay.kind,'reused');
    assert.equal(await original.getCashSaleByKeyForMerchant(otherMerchant,key),undefined);
    assert.equal((await original.recordCashSaleForMerchant(otherMerchant,{...input,merchantId:otherMerchant})).kind,'recorded');
    assert.notEqual((await original.getCashSaleByKeyForMerchant(merchant,key))?.id,(await original.getCashSaleByKeyForMerchant(otherMerchant,key))?.id);
  });
  for(const failure of ['audit','outbox'] as const) await check(`cash ${failure} failure rolls back record and all local effects`,async()=>{
    const key=randomUUID(),input={merchantId:merchant,itemName:'Synthetic cash rollback',price:'10.01',idempotencyKey:key,actor:{userId:1,role:'owner' as const}};
    const table=failure==='audit'?'transaction_events':'payment_delivery_outbox';
    const condition=failure==='audit'?"NEW.event_type='Cash_Recorded'":'NEW.transaction_event_id IS NOT NULL';
    await pool.query(`CREATE FUNCTION test_r3_cash_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic cash rollback'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER test_r3_cash_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test_r3_cash_failure()`);
    try {await assert.rejects(original.recordCashSaleForMerchant(input.merchantId,input));assert.equal(await original.getCashSaleByKeyForMerchant(merchant,key),undefined);}
    finally {await pool.query(`DROP TRIGGER test_r3_cash_failure ON ${table}`);await pool.query('DROP FUNCTION test_r3_cash_failure()');}
    const result=await original.recordCashSaleForMerchant(input.merchantId,input);assert.equal(result.kind,'recorded');
    if(result.kind==='recorded')assert.equal((await pool.query('SELECT count(*)::int AS n FROM transaction_events WHERE transaction_id=$1',[result.transaction.id])).rows[0].n,1);
  });
  await check('retail initiation persists identity and return state before transport across competing instances',async()=>{
    const {createWindcaveClient}=await import('../server/windcave-client');
    const {UAT_WINDCAVE_ENDPOINT}=await import('../server/config');
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic durable retail',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const key=randomUUID(),sessionId=`s-${randomUUID()}`,context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'};
    let sends=0;
    const client=createWindcaveClient({config:{mode:'uat',endpoint:UAT_WINDCAVE_ENDPOINT,username:context.accountUsername,apiKey:'synthetic-test-only',publicOrigin:'https://harness.test'},
      transport:async(_url,init)=>{
        if(init.method==='POST') {
          sends++;const attempt=(await pool.query('SELECT * FROM payment_attempts WHERE transaction_id=$1',[sale.id])).rows[0];
          assert.equal(Number(attempt.expected_amount_cents),1001);assert.equal(attempt.expected_provider_account,context.accountUsername);
          assert.ok(attempt.return_state_hash);assert.ok(attempt.send_started_at);assert.equal(attempt.processor_x_id,new Headers(init.headers).get('X-ID'));
          return new Response(JSON.stringify({id:sessionId,links:[{rel:'hpp',href:`https://uat.windcave.com/pxmi3/${sessionId}`}]}),{status:202});
        }
        return new Response(JSON.stringify({id:sessionId,state:'processing',links:[]}),{status:200});
      },wait:async()=>{},clock,audit:()=>undefined,retryLimit:0});
    const coordinators=stores.map(store=>new DurableRetailCheckout(retail,store,client,context,'synthetic-return-state-secret',clock,()=>true));
    const input={transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:key,customerEmail:'test@synthetic.test',
      callbacks:(raw:string)=>({callbackBase:`https://harness.test/api/pay/return/${raw}?source=hpp`,notificationUrl:`https://harness.test/api/pay/notification/${raw}`})};
    const results=await Promise.all(Array.from({length:12},(_,i)=>coordinators[i%2].open(input)));
    assert.equal(sends,1);assert.equal(results.filter(result=>result.kind==='ready').length,1);
    const ready=results.find(result=>result.kind==='ready');assert.ok(ready && ready.kind==='ready');
    assert.equal((await retail.resolveReturnState(ready.returnState)).kind,'resolved');
    assert.equal((await one.resolveSession(sessionId))?.paymentAttemptId,(await retail.getAttemptByTransactionShareKey(input))?.id);
    await coordinators[0].open(input);assert.equal(sends,1);
  });
  await check('retail unknown acceptance holds its send identity after expiry and never blindly resends',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic unknown retail',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    let sends=0;const client={createSession:async()=>{sends++;return {kind:'unknown' as const,reason:'timeout' as const};},querySession:async()=>({kind:'pending' as const})};
    const coordinator=new DurableRetailCheckout(retail,one,client,{providerEnvironment:'uat',accountUsername:'synthetic-account'},'synthetic-return-state-secret',clock,()=>true);
    const input={transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID(),customerEmail:'test@synthetic.test',callbacks:()=>({callbackBase:'https://harness.test/callback?source=hpp',notificationUrl:'https://harness.test/notification'})};
    const result=await coordinator.open(input);assert.equal(result.kind,'processing');
    if(result.kind!=='processing' || !result.returnState)throw new Error('fixture_processing');
    assert.equal((await retail.resolveReturnState(result.returnState)).kind,'resolved');
    now=new Date(now.getTime()+300001);await coordinator.open(input);await coordinator.open({...input,idempotencyKey:randomUUID()});
    assert.equal(sends,1);assert.equal((await original.getTransaction(sale.id))?.status,'pending');
  });
  await check('browser reconciliation selects its exact receipt instead of unrelated earlier work',async()=>{
    const unrelated=await opened('property'),target=await opened('trades');await one.receive(unrelated.sessionId,'fprn',now);
    const provider={query:async(expected:any)=>({...expected,kind:'verified' as const,outcome:'approved' as const,transactionId:`tx-${randomUUID()}`,transactionCount:1 as const})};
    const runtime=new PaymentRuntime(one,provider,clock);await runtime.reconcile(target.sessionId,'browser');
    assert.equal((await row('trades',target.input.invoiceId)).status,'paid');assert.notEqual((await row('property',unrelated.input.invoiceId)).status,'paid');
  });
  await check('served retail completion, notification and browser return converge across two apps',async()=>{
    const {createApp}=await import('../server/app');const {registerRoutes}=await import('../server/routes');const {default:request}=await import('supertest');
    const {createWindcaveClient}=await import('../server/windcave-client');const {UAT_WINDCAVE_ENDPOINT}=await import('../server/config');
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic served retail',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const key=randomUUID(),sessionId=`s-${randomUUID()}`,raw=randomBytes(32).toString('base64url');
    const claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:key});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw new Error('fixture_claim');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account',rawReturnState:raw},now);assert.ok(expected);
    assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected.processorXId,rawReturnState:raw})).kind,'attached');
    await one.resolveSession(sessionId);const providerTransaction=`tx-${randomUUID()}`;
    const client=createWindcaveClient({config:{mode:'uat',endpoint:UAT_WINDCAVE_ENDPOINT,username:'synthetic-account',apiKey:'synthetic-test-only',publicOrigin:'https://harness.test'},
      transport:async()=>new Response(JSON.stringify({id:sessionId,state:'complete',transactions:[{id:providerTransaction,authorised:true,type:'purchase',amount:'10.01',currency:'NZD',merchantReference:expected.reference,sessionId,username:'synthetic-account'}]}),{status:200}),wait:async()=>{},clock,audit:()=>undefined,retryLimit:0});
    const context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'},provider=createWindcaveReconciliationProvider(client,context);
    const apps=[];for(const repository of stores){const app=createApp({writeRequestLog:()=>{}});const runtime=Object.assign(new PaymentRuntime(repository,provider,clock),{repository,client,context});await registerRoutes(app,{storage:original,paymentRuntime:runtime});apps.push(app);}
    const before=Number((await pool.query('SELECT total_lifetime_transactions FROM merchant_subscriptions WHERE merchant_id=$1',[merchant])).rows[0].total_lifetime_transactions);
    const responses=await Promise.all([request(apps[0]).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({sessionId,idempotencyKey:key,shareIndex:0,paymentMethod:'card'}),
      request(apps[1]).get('/api/windcave/notification').query({sessionid:sessionId}),
      request(apps[1]).get('/api/windcave/callback').query({transactionId:sale.id,state:raw,result:'declined'}),
      request(apps[0]).get(`/api/pay/return/${raw}`)]);
    assert.equal(responses[1].status,200);assert.ok([200,202].includes(responses[0].status));assert.equal(responses[2].status,303);
    await new PaymentRuntime(one,provider,clock).reconcile(sessionId,'poll');
    const replay=await request(apps[1]).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({sessionId,idempotencyKey:key,shareIndex:0});
    assert.equal(replay.status,200);assert.equal(replay.body.outcome,'approved');assert.equal((await original.getTransaction(sale.id))?.status,'completed');
    assert.equal(Number((await pool.query('SELECT total_lifetime_transactions FROM merchant_subscriptions WHERE merchant_id=$1',[merchant])).rows[0].total_lifetime_transactions),before+1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE event_id=(SELECT id FROM payment_settlement_events WHERE session_id=$1)',[sessionId])).rows[0].n,2);
  });
  for(const vertical of ['property','trades'] as const)await check(`${vertical}: served completion cannot apply split A session to B`,async()=>{
    const {createApp}=await import('../server/app');const {registerRoutes}=await import('../server/routes');const {default:request}=await import('supertest');
    const pay=await opened(vertical,await invoice(vertical,1001,2),1),record=await row(vertical,pay.input.invoiceId),proof=evidence(pay.binding);
    const provider={query:async()=>proof},context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'};
    const client={createSession:async()=>({kind:'disabled' as const}),querySession:async()=>({kind:'pending' as const})};
    const runtime=Object.assign(new PaymentRuntime(one,provider,clock),{repository:one,client,context});
    const app=createApp({writeRequestLog:()=>{}});await registerRoutes(app,{storage:original,paymentRuntime:runtime});
    const path=`/api/checkout/${record.token}/hosted-fields-complete`;
    const wrong=await request(app).post(path).send({sessionId:pay.sessionId,idempotencyKey:pay.input.idempotencyKey,shareIndex:2});assert.equal(wrong.status,404);
    assert.equal((await row(vertical,pay.input.invoiceId)).split_paid_count,0);
    const correct=await request(app).post(path).send({sessionId:pay.sessionId,idempotencyKey:pay.input.idempotencyKey,shareIndex:1});assert.equal(correct.status,200);assert.equal(correct.body.outcome,'approved');
    const replay=await request(app).post(path).send({sessionId:pay.sessionId,idempotencyKey:pay.input.idempotencyKey,shareIndex:1});assert.equal(replay.status,200);
    assert.equal((await row(vertical,pay.input.invoiceId)).split_paid_count,1);
  });
  await check('wallet command is unique and immutable across competing instances without storing tokens',async()=>{
    const pay=await opened('property');const results=await Promise.all(Array.from({length:16},(_,i)=>stores[i%2].claimWalletSubmission(pay.sessionId,now)));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_wallet_submissions WHERE session_id=$1',[pay.sessionId])).rows[0].n,1);
    await assert.rejects(pool.query("UPDATE payment_wallet_submissions SET payment_method='card' WHERE session_id=$1",[pay.sessionId]),{code:'23514'});
  });
  // Integration fixes (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md), failing first on 3c98dfe9.
  const retailSession=async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Integration synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const sessionId=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected!.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected!,paymentAttemptId:claim.attempt.id,sessionId},now),true);
    return {sale,sessionId};
  };
  await check('integration: no wallet charge is sent for a cancelled sale or a closed invoice',async()=>{
    const open=await retailSession();assert.equal(await one.claimWalletSubmission(open.sessionId,now),true);
    const cancelled=await retailSession();await pool.query("UPDATE transactions SET status='cancelled' WHERE id=$1",[cancelled.sale.id]);
    assert.equal(await one.claimWalletSubmission(cancelled.sessionId,now),false);
    for(const [vertical,status] of [['property','voided'],['property','paid_external'],['trades','voided'],['trades','paid']] as const){
      const pay=await opened(vertical);await pool.query(`UPDATE ${vertical==='property'?'invoices_rent_requests':'job_invoices'} SET status=$2 WHERE id=$1`,[pay.input.invoiceId,status]);
      assert.equal(await one.claimWalletSubmission(pay.sessionId,now),false,`${vertical} ${status}`);
    }
  });
  await check('integration: a claim made before a cancel prepares no session for the cancelled sale',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Integration race',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
    assert.equal(await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now),undefined);
    assert.equal((await pool.query('SELECT send_started_at FROM payment_attempts WHERE id=$1',[claim.attempt.id])).rows[0].send_started_at,null);
  });
  await check('integration: a merchant command\'s poll brings a backed-off poll receipt forward, never a finished one',async()=>{
    const sessionId=`s-${randomUUID()}`,later=new Date(now.getTime()+3600000);
    const id=await one.receive(sessionId,'poll',now);
    await pool.query("UPDATE payment_notification_inbox SET status='retry',next_attempt_at=$2 WHERE id=$1",[id,later]);
    await one.receive(sessionId,'poll',now);
    assert.ok(new Date((await pool.query('SELECT next_attempt_at FROM payment_notification_inbox WHERE id=$1',[id])).rows[0].next_attempt_at).getTime()<=now.getTime());
    const fprn=await one.receive(sessionId,'fprn',now);
    await pool.query("UPDATE payment_notification_inbox SET status='retry',next_attempt_at=$2 WHERE id=$1",[fprn,later]);
    await one.receive(sessionId,'fprn',now);
    assert.equal(new Date((await pool.query('SELECT next_attempt_at FROM payment_notification_inbox WHERE id=$1',[fprn])).rows[0].next_attempt_at).getTime(),later.getTime());
    await pool.query("UPDATE payment_notification_inbox SET status='complete',completed_at=$3,next_attempt_at=$2 WHERE id=$1",[id,later,now]);
    await one.receive(sessionId,'poll',now);
    assert.equal((await pool.query('SELECT status FROM payment_notification_inbox WHERE id=$1',[id])).rows[0].status,'complete');
  });
  await check('integration: trades late payment after a void whose schedule issued a replacement keeps it voided and records the money',async()=>{
    const schedule=(await pool.query(`INSERT INTO job_schedules(merchant_id,client_profile_id,amount_cents,frequency,start_date,next_run_date)
      VALUES ($1,$2,1001,'monthly',$3,$3) RETURNING id`,[merchant,clientProfile,now])).rows[0].id;
    const pay=await opened('trades');
    await pool.query('UPDATE job_invoices SET schedule_id=$2 WHERE id=$1',[pay.input.invoiceId,schedule]);
    assert.equal((await one.changeInvoice({vertical:'trades',invoiceId:pay.input.invoiceId,merchantId:merchant,action:'void'},now)).kind,'claimed');
    const dueAt=(await pool.query('SELECT due_at FROM job_invoices WHERE id=$1',[pay.input.invoiceId])).rows[0].due_at;
    await pool.query(`INSERT INTO job_invoices(merchant_id,client_profile_id,amount_cents,token,delivery_channel,due_at,status,schedule_id)
      VALUES ($1,$2,1001,$3,'email',$4,'sent',$5)`,[merchant,clientProfile,randomUUID(),dueAt,schedule]);
    await one.receive(pay.sessionId,'fprn',now);await worker(one,evidence(pay.binding)).runOne(randomUUID());
    const after=await row('trades',pay.input.invoiceId);
    assert.equal(after.status,'voided');assert.ok(after.windcave_transaction_id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].n,1);
    assert.equal((await pool.query('SELECT previous_aggregate_status FROM payment_settlement_events WHERE session_id=$1',[pay.sessionId])).rows[0].previous_aggregate_status,'voided');
  });
  for(const vertical of ['retail','property','trades'] as const)await check(`${vertical}: FPRN recovers possible acceptance before session attachment from pre-send identity`,async()=>{
    const {createWindcaveClient}=await import('../server/windcave-client');const {UAT_WINDCAVE_ENDPOINT}=await import('../server/config');
    const sessionId=`s-${randomUUID()}`,transactionId=`tx-${randomUUID()}`,raw=randomBytes(32).toString('base64url');let reference:string,attemptId:string,parentId:number|string;
    if(vertical==='retail'){
      const sale=await original.createTransaction({merchantId:merchant,itemName:'Synthetic recovery',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});parentId=sale.id;
      const claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw new Error('fixture_claim');attemptId=claim.attempt.id;
      const expected=await one.prepareRetailExpectation({paymentAttemptId:attemptId,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account',rawReturnState:raw},now);assert.ok(expected);reference=expected.reference;
    }else{
      parentId=await invoice(vertical);const claim=await one.claimInvoice(claimInput(vertical,parentId as string),now);assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw new Error('fixture_claim');attemptId=claim.attempt.id;reference=claim.attempt.reference;
      assert.equal(await one.markInvoiceSendStarted(attemptId,now,raw),true);
    }
    now=new Date(now.getTime()+300001);
    const client=createWindcaveClient({config:{mode:'uat',endpoint:UAT_WINDCAVE_ENDPOINT,username:'synthetic-account',apiKey:'synthetic-test-only',publicOrigin:'https://harness.test'},
      transport:async(_url,init)=>{assert.equal(init.method,'GET');return new Response(JSON.stringify({id:sessionId,state:'complete',transactions:[{id:transactionId,authorised:true,type:'purchase',amount:'10.01',currency:'NZD',merchantReference:reference,sessionId,username:'synthetic-account'}]}),{status:200});},wait:async()=>{},clock,audit:()=>undefined,retryLimit:0});
    const provider=createWindcaveReconciliationProvider(client,{providerEnvironment:'uat',accountUsername:'synthetic-account'});
    await one.receive(sessionId,'fprn',now);await new PaymentReconciliationWorker(one,provider,clock).runOne(randomUUID());
    const binding=await one.resolveSession(sessionId);assert.ok(binding);assert.equal(binding.paymentAttemptId??binding.invoiceAttemptId,attemptId);
    assert.equal((await pool.query('SELECT outcome FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0]?.outcome,'approved');
    assert.equal(vertical==='retail'?(await original.getTransaction(parentId as number))?.status:(await row(vertical,parentId as string)).status,vertical==='retail'?'completed':'paid');
  });
  // Integration B-1: R3 records send intent before transport, so a request Windcave provably never
  // took must free the sale. Only a 4xx on the first try, or a request never sent, proves that.
  const notSent=[{kind:'rejected' as const,status:400},{kind:'invalid_request' as const},{kind:'disabled' as const}];
  for(const refused of notSent)await check(`integration: retail ${refused.kind} session creation frees the sale for the next try`,async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Integration not sent',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    let sends=0,reply:any=refused;const sessionId=`s-${randomUUID()}`;
    const client={createSession:async()=>{sends++;return reply;},querySession:async()=>({kind:'pending' as const})};
    const coordinator=new DurableRetailCheckout(retail,one,client as any,{providerEnvironment:'uat',accountUsername:'synthetic-account'},'synthetic-return-state-secret',clock,()=>true);
    const input={transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID(),customerEmail:'test@synthetic.test',callbacks:()=>({callbackBase:'https://harness.test/callback?source=hpp',notificationUrl:'https://harness.test/notification'})};
    assert.equal((await coordinator.open(input)).kind,'expired');
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE transaction_id=$1',[sale.id])).rows[0].state,'abandoned');
    assert.equal((await coordinator.open(input)).kind,'expired');assert.equal(sends,1);
    assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
    const next=await original.createTransaction({merchantId:merchant,itemName:'Integration not sent retry',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    reply=refused;await coordinator.open({...input,transactionId:next.id});
    assert.ok(await original.createBillSplit(next.id,2),'an unsent attempt does not block a split');
    reply={kind:'created',sessionId,links:{hpp:`https://uat.windcave.com/pxmi3/${sessionId}`},rejectedLinks:0};
    assert.equal((await coordinator.open({...input,transactionId:next.id,shareIndex:1,idempotencyKey:randomUUID()})).kind,'ready');
  });
  await check('integration: retail 4xx after a retried request keeps the attempt held',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Integration ambiguous',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const client={createSession:async()=>({kind:'rejected' as const,status:429,afterRetry:true}),querySession:async()=>({kind:'pending' as const})};
    const coordinator=new DurableRetailCheckout(retail,one,client as any,{providerEnvironment:'uat',accountUsername:'synthetic-account'},'synthetic-return-state-secret',clock,()=>true);
    const input={transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID(),customerEmail:'test@synthetic.test',callbacks:()=>({callbackBase:'https://harness.test/callback?source=hpp',notificationUrl:'https://harness.test/notification'})};
    assert.equal((await coordinator.open(input)).kind,'processing');
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE transaction_id=$1',[sale.id])).rows[0].state,'claiming');
  });
  for(const vertical of ['property','trades'] as const)await check(`integration: ${vertical} refused session creation frees the invoice for the next try`,async()=>{
    const id=await invoice(vertical,1001,2);let reply:any={kind:'not-sent'};const sessionId=`s-${randomUUID()}`;let sends=0;
    const checkout=new DurableInvoiceCheckout(one,{create:async()=>{sends++;return reply;}},clock,()=>true);
    const input=claimInput(vertical,id,1);
    assert.equal((await checkout.open(input)).kind,'expired');
    assert.equal((await pool.query('SELECT state FROM invoice_payment_attempts WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0].state,'abandoned');
    assert.equal((await checkout.open(input)).kind,'expired');assert.equal(sends,1);
    assert.equal((await one.changeInvoice({vertical,invoiceId:id,merchantId:merchant,action:'split',splitCount:3},now)).kind,'claimed');
    reply={kind:'ready',sessionId};
    assert.equal((await checkout.open(claimInput(vertical,id,1))).kind,'ready');
  });
  // Integration: a sale cancelled (or an invoice voided) while its session is being created is never
  // served payment links, and a same-key reload is not either. The session stays bound, so a payment
  // that reaches it anyway is still recorded.
  await check('integration: a retail session created across a cancel is bound but its links are never served',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Integration closed',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const sessionId=`s-${randomUUID()}`,links=[{rel:'hpp',href:`https://uat.windcave.com/pxmi3/${sessionId}`,method:'REDIRECT'}];
    const client={createSession:async()=>{assert.equal((await original.cancelTransactionForMerchant(sale.id,merchant)).kind,'cancelled');
        return {kind:'created' as const,sessionId,links:{hpp:links[0].href},rejectedLinks:0};},
      querySession:async()=>({kind:'reply' as const,body:{id:sessionId,state:'pending',links}})};
    const coordinator=new DurableRetailCheckout(retail,one,client as any,{providerEnvironment:'uat',accountUsername:'synthetic-account'},'synthetic-return-state-secret',clock,()=>true);
    const input={transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID(),customerEmail:'test@synthetic.test',callbacks:()=>({callbackBase:'https://harness.test/callback?source=hpp',notificationUrl:'https://harness.test/notification'})};
    assert.equal((await coordinator.open(input)).kind,'closed');
    assert.ok((await one.resolveSession(sessionId))?.paymentAttemptId,'the session stays bound for a late payment');
    assert.equal((await coordinator.open(input)).kind,'closed');
  });
  for(const vertical of ['property','trades'] as const)await check(`integration: ${vertical} session created across a void is bound but its links are never served`,async()=>{
    const id=await invoice(vertical),sessionId=`s-${randomUUID()}`;
    const checkout=new DurableInvoiceCheckout(one,{create:async()=>{
      assert.equal((await one.changeInvoice({vertical,invoiceId:id,merchantId:merchant,action:'void'},now)).kind,'claimed');return {kind:'ready',sessionId};}},clock,()=>true);
    const input=claimInput(vertical,id);
    assert.equal((await checkout.open(input)).kind,'closed');
    assert.ok(await one.resolveSession(sessionId),'the session stays bound for a late payment');
    assert.equal((await checkout.open(input)).kind,'closed');
  });
  await check('integration: a mismatch records its field on the retail attempt, never in the inbox code (H-3)',async()=>{
    const {sale,sessionId}=await retailSession();await one.receive(sessionId,'fprn',now);
    const claim=await one.claimInbox(randomUUID(),now,sessionId);assert.ok(claim);
    assert.equal(await one.finishInbox(claim!,{status:'dead_letter',code:'integrity_mismatch',attemptCode:'integrity_mismatch:amount'},now),true);
    assert.equal((await pool.query('SELECT last_reconciliation_code FROM payment_attempts WHERE transaction_id=$1',[sale.id])).rows[0].last_reconciliation_code,'integrity_mismatch:amount');
    assert.equal((await pool.query('SELECT last_error_code FROM payment_notification_inbox WHERE id=$1',[claim!.id])).rows[0].last_error_code,'integrity_mismatch');
  });
  await check('integration D1: a new arrival reopens a receipt that gave up for a transient reason, never one held for review',async()=>{
    const status=async(id:string)=>(await pool.query('SELECT status,attempt_count,completed_at FROM payment_notification_inbox WHERE id=$1',[id])).rows[0];
    const exhausted=`s-${randomUUID()}`,held=`s-${randomUUID()}`,done=`s-${randomUUID()}`;
    const a=await one.receive(exhausted,'fprn',now),b=await one.receive(held,'fprn',now),c=await one.receive(done,'fprn',now);
    await pool.query("UPDATE payment_notification_inbox SET status='dead_letter',last_error_code='retry_exhausted',attempt_count=20 WHERE id=$1",[a]);
    await pool.query("UPDATE payment_notification_inbox SET status='dead_letter',last_error_code='integrity_mismatch',attempt_count=1 WHERE id=$1",[b]);
    await pool.query("UPDATE payment_notification_inbox SET status='complete',completed_at=$2 WHERE id=$1",[c,now]);
    await one.receive(exhausted,'fprn',now);await one.receive(held,'fprn',now);await one.receive(done,'fprn',now);
    assert.deepEqual({...await status(a),completed_at:null},{status:'pending',attempt_count:0,completed_at:null});
    assert.equal((await status(b)).status,'dead_letter');
    assert.equal((await status(c)).status,'complete','finished within the last minute');
    await one.receive(done,'fprn',new Date(now.getTime()+60001));
    assert.equal((await status(c)).status,'pending');assert.equal((await status(c)).completed_at,null);
  });
  await check('integration 0049: an attached R2-era attempt cannot be given an account or fingerprint afterwards',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'0049 synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const claim=await retail.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    await retail.recordExpectedValues({attemptId:claim.attempt.id,amountCents:1001,currency:'NZD',merchantReference:`TAPT_${claim.attempt.id}`,providerEnvironment:'uat'});
    assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:`s-${randomUUID()}`,processorXId:claim.attempt.id.replace(/-/g,'').slice(0,16)})).kind,'attached');
    await assert.rejects(pool.query("UPDATE payment_attempts SET expected_provider_account='synthetic-account',request_fingerprint=repeat('a',64) WHERE id=$1",[claim.attempt.id]),{code:'23514'});
  });
  await check('integration 0049: send intent is checked in UTC whatever the database session time zone',async()=>{
    const zoned=new pg.Pool({connectionString:testDatabaseUrl,max:2,options:'-c TimeZone=Pacific/Auckland'});
    try {
      const store=new DurablePaymentStorage(zoned);
      const sale=await original.createTransaction({merchantId:merchant,itemName:'0049 zone',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
      const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
      assert.ok(await store.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now));
      await assert.rejects(zoned.query("UPDATE payment_attempts SET send_started_at=lease_expires_at AT TIME ZONE 'UTC'+interval '1 second' WHERE id=$1",[claim.attempt.id]),{code:'23514'});
    } finally {await zoned.end();}
  });
  await check('T-3 interim: a second card\'s notification within a minute of a recorded decline is still processed and recorded',async()=>{
    const {sale,sessionId}=await retailSession();const binding=(await one.resolveSession(sessionId))!;
    await one.receive(sessionId,'fprn',now);await worker(one,evidence(binding,'declined')).runOne(randomUUID());
    assert.equal((await original.getTransaction(sale.id))?.status,'failed');
    const approval={...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`};
    await one.receive(sessionId,'fprn',now);await worker(one,approval).runOne(randomUUID());
    // Since T-3's supersession (migration 0050) the approval is recorded, not only alerted.
    const inbox=(await pool.query("SELECT status,last_error_code,observed_transaction_id FROM payment_notification_inbox WHERE session_id=$1 AND kind='fprn'",[sessionId])).rows[0];
    assert.deepEqual(inbox,{status:'complete',last_error_code:null,observed_transaction_id:approval.transactionId});
    assert.equal((await original.getTransaction(sale.id))?.status,'completed');
  });
  // T-3 (docs/decisions/2026-10-15-t3-decline-supersession.md): a later verified approval in the same
  // session supersedes the recorded decline; nothing else is superseded.
  const retailBound=async(split=false)=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'T-3 synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    if(split)assert.ok(await original.createBillSplit(sale.id,2));
    const claim=await retail.claim({transactionId:sale.id,merchantId:merchant,shareIndex:split?1:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const sessionId=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected!.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected!,paymentAttemptId:claim.attempt.id,sessionId},now),true);
    const binding=await one.resolveSession(sessionId);assert.ok(binding);
    return {sale,sessionId,binding:binding!,attemptId:claim.attempt.id};
  };
  const settle=async(sessionId:string,kind:'fprn'|'browser'|'poll',proof:VerifiedOutcome)=>{await one.receive(sessionId,kind,now);await worker(one,proof).runOne(randomUUID());
    return (await pool.query('SELECT status,last_error_code FROM payment_notification_inbox WHERE session_id=$1 AND kind=$2',[sessionId,kind])).rows[0];};
  const events=async(sessionId:string)=>(await pool.query(`SELECT e.outcome,(SELECT count(*)::int FROM payment_delivery_outbox o WHERE o.event_id=e.id) AS outbox
    FROM payment_settlement_events e WHERE e.session_id=$1 ORDER BY e.created_at,e.outcome DESC`,[sessionId])).rows;
  for(const split of [false,true])await check(`T-3: retail ${split?'split share':'sale'}: a later approval in the session supersedes its decline, once`,async()=>{
    const {sale,sessionId,binding,attemptId}=await retailBound(split);
    const usage=async()=>Number((await pool.query('SELECT total_lifetime_transactions FROM merchant_subscriptions WHERE merchant_id=$1',[merchant])).rows[0]?.total_lifetime_transactions??0);
    assert.equal((await settle(sessionId,'fprn',evidence(binding,'declined'))).status,'complete');
    const before=await usage();
    const approval={...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`};
    assert.deepEqual(await settle(sessionId,'browser',approval),{status:'complete',last_error_code:null});
    const attempt=(await pool.query('SELECT state,provider_transaction_id FROM payment_attempts WHERE id=$1',[attemptId])).rows[0];
    assert.deepEqual(attempt,{state:'approved',provider_transaction_id:approval.transactionId});
    assert.equal((await pool.query('SELECT provider_transaction_id FROM payment_session_bindings WHERE session_id=$1',[sessionId])).rows[0].provider_transaction_id,approval.transactionId);
    if(split){const share=(await pool.query('SELECT status,windcave_transaction_id FROM split_payments WHERE transaction_id=$1 AND split_index=1',[sale.id])).rows[0];
      assert.deepEqual(share,{status:'completed',windcave_transaction_id:approval.transactionId});
      assert.equal((await original.getTransaction(sale.id))?.completedSplits,1);}
    else assert.equal((await original.getTransaction(sale.id))?.status,'completed');
    assert.deepEqual(await events(sessionId),[{outcome:'declined',outbox:1},{outcome:'approved',outbox:2}]);
    assert.equal(await usage(),before+1);
    await one.receive(sessionId,'poll',now);await worker(one,approval).runOne(randomUUID());
    assert.deepEqual(await events(sessionId),[{outcome:'declined',outbox:1},{outcome:'approved',outbox:2}],'a replayed approval is reused');
    assert.equal(await usage(),before+1);
  });
  await check('T-3: a second decline in the session is reused, whichever declined card it names',async()=>{
    const {sessionId,binding}=await retailBound();
    await settle(sessionId,'fprn',evidence(binding,'declined'));
    assert.deepEqual(await settle(sessionId,'browser',{...evidence(binding,'declined'),transactionId:`tx-${randomUUID()}`}),{status:'complete',last_error_code:null});
    assert.deepEqual(await events(sessionId),[{outcome:'declined',outbox:1}]);
  });
  await check('T-3: an approval after another attempt paid the sale stays a reviewed conflict',async()=>{
    const first=await retailBound();
    await settle(first.sessionId,'fprn',evidence(first.binding,'declined'));
    const claim=await retail.claim({transactionId:first.sale.id,merchantId:merchant,shareIndex:0,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const second=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:second,processorXId:expected!.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected!,paymentAttemptId:claim.attempt.id,sessionId:second},now),true);
    await settle(second,'fprn',evidence((await one.resolveSession(second))!,'approved'));
    assert.equal((await original.getTransaction(first.sale.id))?.status,'completed');
    assert.deepEqual(await settle(first.sessionId,'browser',{...evidence(first.binding,'approved'),transactionId:`tx-${randomUUID()}`}),{status:'dead_letter',last_error_code:'settlement_conflict'});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[first.attemptId])).rows[0].state,'declined');
  });
  for(const vertical of ['property','trades'] as const)await check(`T-3: ${vertical}: a later approval in the session supersedes its decline, once`,async()=>{
    const pay=await opened(vertical);
    assert.equal((await settle(pay.sessionId,'fprn',evidence(pay.binding,'declined'))).status,'complete');
    assert.notEqual((await row(vertical,pay.input.invoiceId)).status,'paid');
    const approval={...evidence(pay.binding,'approved'),transactionId:`tx-${randomUUID()}`};
    assert.deepEqual(await settle(pay.sessionId,'browser',approval),{status:'complete',last_error_code:null});
    assert.equal((await row(vertical,pay.input.invoiceId)).status,'paid');
    assert.equal((await pool.query('SELECT state,outcome FROM invoice_payment_attempts WHERE id=$1',[pay.attempt.id])).rows[0].state,'approved');
    assert.deepEqual(await events(pay.sessionId),[{outcome:'declined',outbox:1},{outcome:'approved',outbox:2}]);
    await one.receive(pay.sessionId,'poll',now);await worker(one,approval).runOne(randomUUID());
    assert.deepEqual(await events(pay.sessionId),[{outcome:'declined',outbox:1},{outcome:'approved',outbox:2}]);
  });
  await check('T-3: the database refuses every other supersession directly',async()=>{
    const {sessionId,binding,attemptId}=await retailBound();
    await settle(sessionId,'fprn',evidence(binding,'declined'));
    await settle(sessionId,'browser',{...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`});
    const ev=(await pool.query("SELECT merchant_id,amount_cents FROM payment_settlement_events WHERE session_id=$1 AND outcome='approved'",[sessionId])).rows[0];
    // The ordering trigger refuses these before the unique indexes would.
    await assert.rejects(pool.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,provider_transaction_id) VALUES ($1,$2,'approved',$3,now(),$4)`,[sessionId,ev.merchant_id,ev.amount_cents,`tx-${randomUUID()}`]),{code:'23514'});
    await assert.rejects(pool.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,provider_transaction_id) VALUES ($1,$2,'cancelled',$3,now(),$4)`,[sessionId,ev.merchant_id,ev.amount_cents,`tx-${randomUUID()}`]),{code:'23514'});
    // Refused by the registry (its one supersession claim is taken) or, failing that, at commit.
    await assert.rejects(pool.query('UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1',[sessionId,`tx-${randomUUID()}`]),(error:any)=>['23505','23514'].includes(error.code));
    await assert.rejects(pool.query('UPDATE payment_attempts SET provider_transaction_id=$2 WHERE id=$1',[attemptId,`tx-${randomUUID()}`]),{code:'23514'});
    const lone=await retailBound();await settle(lone.sessionId,'fprn',evidence(lone.binding,'declined'));
    await assert.rejects(pool.query('UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1',[lone.sessionId,`tx-${randomUUID()}`]),
      (error:any)=>error.code==='23514' && error.constraint==='payment_binding_supersession_check','a binding change with no supersession is refused at commit');
    const other=await retailBound();await settle(other.sessionId,'fprn',evidence(other.binding,'approved'));
    const ev2=(await pool.query("SELECT merchant_id,amount_cents FROM payment_settlement_events WHERE session_id=$1",[other.sessionId])).rows[0];
    await assert.rejects(pool.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,provider_transaction_id) VALUES ($1,$2,'declined',$3,now(),$4)`,[other.sessionId,ev2.merchant_id,ev2.amount_cents,`tx-${randomUUID()}`]),{code:'23514'});
    await assert.rejects(pool.query("UPDATE payment_attempts SET state='declined',outcome='declined' WHERE id=$1",[(await one.resolveSession(other.sessionId))!.paymentAttemptId]),{code:'23514'});
  });
  const bindNew=async(saleId:number,shareIndex=0)=>{
    const claim=await retail.claim({transactionId:saleId,merchantId:merchant,shareIndex,idempotencyKey:randomUUID()});assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    const expected=await one.prepareRetailExpectation({paymentAttemptId:claim.attempt.id,merchantId:merchant,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},now);assert.ok(expected);
    const sessionId=`s-${randomUUID()}`;assert.equal((await retail.attachSession({attemptId:claim.attempt.id,processorSessionId:sessionId,processorXId:expected!.processorXId,rawReturnState:randomBytes(32).toString('base64url')})).kind,'attached');
    assert.equal(await one.bindRetailSession({...expected!,paymentAttemptId:claim.attempt.id,sessionId},now),true);
    return {sessionId,binding:(await one.resolveSession(sessionId))!,attemptId:claim.attempt.id};
  };
  await check('T-3: the registry keeps both cards, each event keeps its card, and the decline is never announced after the receipt',async()=>{
    const {sessionId,binding}=await retailBound();
    const decline={...evidence(binding,'declined'),transactionId:`tx-${randomUUID()}`},approval={...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`};
    await settle(sessionId,'fprn',decline);await settle(sessionId,'browser',approval);
    const claims=(await pool.query('SELECT provider_transaction_id FROM provider_transaction_claims WHERE binding_session_id=$1 ORDER BY provider_transaction_id',[sessionId])).rows.map(r=>r.provider_transaction_id);
    assert.deepEqual(claims,[decline.transactionId,approval.transactionId].sort());
    assert.deepEqual((await pool.query('SELECT outcome,provider_transaction_id FROM payment_settlement_events WHERE session_id=$1 ORDER BY outcome DESC',[sessionId])).rows,
      [{outcome:'declined',provider_transaction_id:decline.transactionId},{outcome:'approved',provider_transaction_id:approval.transactionId}]);
    assert.equal((await pool.query("SELECT o.status FROM payment_delivery_outbox o JOIN payment_settlement_events e ON e.id=o.event_id WHERE e.session_id=$1 AND e.outcome='declined'",[sessionId])).rows[0].status,'complete');
  });
  await check('T-3: a stale decline after a supersession is reused',async()=>{
    const {sessionId,binding,attemptId}=await retailBound();
    await settle(sessionId,'fprn',evidence(binding,'declined'));await settle(sessionId,'browser',{...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`});
    assert.deepEqual(await settle(sessionId,'poll',{...evidence(binding,'declined'),transactionId:`tx-${randomUUID()}`}),{status:'complete',last_error_code:null});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[attemptId])).rows[0].state,'approved');
  });
  await check('T-3: with a second attempt live, A supersedes; B\'s later decline is recorded on B alone, quietly',async()=>{
    const a=await retailBound();await settle(a.sessionId,'fprn',evidence(a.binding,'declined'));
    const b=await bindNew(a.sale.id);
    assert.deepEqual(await settle(a.sessionId,'browser',{...evidence(a.binding,'approved'),transactionId:`tx-${randomUUID()}`}),{status:'complete',last_error_code:null});
    assert.equal((await original.getTransaction(a.sale.id))?.status,'completed');
    assert.deepEqual(await settle(b.sessionId,'fprn',evidence(b.binding,'declined')),{status:'complete',last_error_code:null});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[b.attemptId])).rows[0].state,'declined');
    assert.equal((await original.getTransaction(a.sale.id))?.status,'completed');
    assert.deepEqual(await events(b.sessionId),[{outcome:'declined',outbox:0}]);
  });
  for(const vertical of ['property','trades'] as const)await check(`T-3: ${vertical} split share: an approval after another attempt paid the share is a mapped conflict, never a throw`,async()=>{
    const id=await invoice(vertical,1001,2);const a=await opened(vertical,id,1);
    await settle(a.sessionId,'fprn',evidence(a.binding,'declined'));
    const b=await opened(vertical,id,1);await settle(b.sessionId,'fprn',evidence(b.binding,'approved'));
    assert.deepEqual(await settle(a.sessionId,'browser',{...evidence(a.binding,'approved'),transactionId:`tx-${randomUUID()}`}),{status:'dead_letter',last_error_code:'settlement_conflict'});
    assert.equal((await row(vertical,id)).split_paid_count,1);
  });
  await check('T-3: a merchant\'s pre-change reconcile asks about a decline-only session',async()=>{
    const {sale,sessionId,binding}=await retailBound();await settle(sessionId,'fprn',evidence(binding,'declined'));
    assert.deepEqual(await one.pendingSessionsForMerchant({domain:'retail',aggregateId:sale.id,merchantId:merchant}),[sessionId]);
    const pay=await opened('trades');await settle(pay.sessionId,'fprn',evidence(pay.binding,'declined'));
    assert.deepEqual(await one.pendingSessionsForMerchant({domain:'trades',aggregateId:pay.input.invoiceId,merchantId:merchant}),[pay.sessionId]);
  });
  await check('T-3 C1: an approval whose transaction another session already holds is a mapped conflict',async()=>{
    const a=await retailBound();await settle(a.sessionId,'fprn',evidence(a.binding,'declined'));
    const other=await retailBound(),held=`tx-${randomUUID()}`;
    await pool.query('INSERT INTO provider_transaction_claims(provider_transaction_id,binding_session_id) VALUES ($1,$2)',[held,other.sessionId]);
    assert.deepEqual(await settle(a.sessionId,'browser',{...evidence(a.binding,'approved'),transactionId:held}),{status:'dead_letter',last_error_code:'settlement_conflict'});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[a.attemptId])).rows[0].state,'declined');
  });
  await check('T-3 C3: on a split sale, B\'s decline after A\'s supersession leaves the paid share and the sale alone',async()=>{
    const a=await retailBound(true);await settle(a.sessionId,'fprn',evidence(a.binding,'declined'));
    const b=await bindNew(a.sale.id,1);
    await settle(a.sessionId,'browser',{...evidence(a.binding,'approved'),transactionId:`tx-${randomUUID()}`});
    const sale=await original.getTransaction(a.sale.id);
    assert.deepEqual(await settle(b.sessionId,'fprn',evidence(b.binding,'declined')),{status:'complete',last_error_code:null});
    assert.equal((await pool.query('SELECT status FROM split_payments WHERE transaction_id=$1 AND split_index=1',[a.sale.id])).rows[0].status,'completed');
    const after=await original.getTransaction(a.sale.id);
    assert.deepEqual({status:after?.status,completedSplits:after?.completedSplits,windcaveSessionId:after?.windcaveSessionId,windcaveXId:after?.windcaveXId},
      {status:sale?.status,completedSplits:1,windcaveSessionId:sale?.windcaveSessionId,windcaveXId:sale?.windcaveXId});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[b.attemptId])).rows[0].state,'declined');
  });
  await check('T-3 C5/C6: terminal attempts and settlement events cannot be rewritten',async()=>{
    const {sessionId,binding,attemptId}=await retailBound();await settle(sessionId,'fprn',evidence(binding,'approved'));
    await assert.rejects(pool.query("UPDATE payment_attempts SET state='declined',outcome='declined' WHERE id=$1",[attemptId]),{code:'23514'});
    await pool.query("UPDATE payment_attempts SET last_reconciliation_code='complete' WHERE id=$1",[attemptId]);
    const declined=await retailBound();await settle(declined.sessionId,'fprn',evidence(declined.binding,'declined'));
    await assert.rejects(pool.query("UPDATE payment_attempts SET state='ready',outcome=NULL WHERE id=$1",[declined.attemptId]),{code:'23514'});
    const pay=await opened('property');await settle(pay.sessionId,'fprn',evidence(pay.binding,'approved'));
    await assert.rejects(pool.query("UPDATE invoice_payment_attempts SET state='declined',outcome='declined' WHERE id=$1",[pay.attempt.id]),{code:'23514'});
    await assert.rejects(pool.query("UPDATE payment_settlement_events SET outcome='declined' WHERE session_id=$1",[sessionId]),{code:'23514'});
    await assert.rejects(pool.query('DELETE FROM payment_settlement_events WHERE session_id=$1',[declined.sessionId]),{code:'23514'});
  });
  await check('T-3 C7: the pre-change reconcile always includes every live session',async()=>{
    const first=await retailBound();await settle(first.sessionId,'fprn',evidence(first.binding,'declined'));
    for(let i=0;i<13;i++){const next=await bindNew(first.sale.id);await settle(next.sessionId,'fprn',evidence(next.binding,'declined'));}
    const live=await bindNew(first.sale.id);
    const sessions=await one.pendingSessionsForMerchant({domain:'retail',aggregateId:first.sale.id,merchantId:merchant});
    assert.ok(sessions.includes(live.sessionId));
  });
  // T-3 implementation review (pass 3), conditions D1-D4.
  await check('T-3 D1: an approval naming the declined card\'s own transaction is a conflict, never a supersession',async()=>{
    const {sessionId,binding,attemptId}=await retailBound();const decline={...evidence(binding,'declined'),transactionId:`tx-${randomUUID()}`};
    await settle(sessionId,'fprn',decline);
    assert.deepEqual(await settle(sessionId,'browser',{...evidence(binding,'approved'),transactionId:decline.transactionId}),{status:'dead_letter',last_error_code:'settlement_conflict'});
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[attemptId])).rows[0].state,'declined');
    const pay=await opened('trades');const invoiceDecline={...evidence(pay.binding,'declined'),transactionId:`tx-${randomUUID()}`};
    await settle(pay.sessionId,'fprn',invoiceDecline);
    assert.deepEqual(await settle(pay.sessionId,'browser',{...evidence(pay.binding,'approved'),transactionId:invoiceDecline.transactionId}),{status:'dead_letter',last_error_code:'settlement_conflict'});
  });
  await check('T-3 D2: a superseded decline whose delivery was claimed but not prepared is never announced',async()=>{
    const {DurablePaymentDelivery}=await import('../server/durable-payment-delivery');
    const {sessionId,binding}=await retailBound();await settle(sessionId,'fprn',evidence(binding,'declined'));
    const declined=(await pool.query("SELECT o.id AS outbox,e.id AS event FROM payment_delivery_outbox o JOIN payment_settlement_events e ON e.id=o.event_id WHERE e.session_id=$1",[sessionId])).rows[0];
    await pool.query("UPDATE payment_delivery_outbox SET status='processing',lease_owner=gen_random_uuid(),lease_started_at=now(),lease_expires_at=now()+interval '30 seconds' WHERE id=$1",[declined.outbox]);
    await settle(sessionId,'browser',{...evidence(binding,'approved'),transactionId:`tx-${randomUUID()}`});
    const sent:any[]=[];const delivery=new DurablePaymentDelivery(pool,{ready:()=>true,send:async(target:any)=>{sent.push(target.kind);}},'synthetic@synthetic.test',clock);
    await delivery.deliver({deliveryKey:declined.outbox,eventId:declined.event,eventSource:'provider_settlement',channel:'merchant_payment_update'});
    assert.deepEqual(sent,[]);
    assert.deepEqual((await pool.query('SELECT kind,target_key FROM payment_delivery_targets WHERE outbox_id=$1',[declined.outbox])).rows,[{kind:'skip',target_key:'superseded'}]);
  });
  await check('T-3 D3: an approval whose transaction another binding holds is a conflict with its alert, not a retry loop',async()=>{
    const pay=await opened('property');const held=`tx-${randomUUID()}`;await settle(pay.sessionId,'fprn',{...evidence(pay.binding,'approved'),transactionId:held});
    const {sessionId,binding}=await retailBound();
    assert.deepEqual(await settle(sessionId,'fprn',{...evidence(binding,'approved'),transactionId:held}),{status:'dead_letter',last_error_code:'settlement_conflict'});
  });
  await check('T-3 D4: an invoice\'s second attempt declined after its share was paid is recorded on that attempt alone',async()=>{
    const id=await invoice('property',1001,2);const a=await opened('property',id,1);await settle(a.sessionId,'fprn',evidence(a.binding,'declined'));
    const b=await opened('property',id,1);
    await settle(a.sessionId,'browser',{...evidence(a.binding,'approved'),transactionId:`tx-${randomUUID()}`});
    const before=await row('property',id);
    assert.deepEqual(await settle(b.sessionId,'fprn',evidence(b.binding,'declined')),{status:'complete',last_error_code:null});
    const after=await row('property',id);
    assert.deepEqual({status:after.status,paid:after.split_paid_count,sessions:after.split_paid_sessions},{status:before.status,paid:1,sessions:before.split_paid_sessions});
    assert.equal((await pool.query('SELECT state FROM invoice_payment_attempts WHERE id=$1',[b.attempt.id])).rows[0].state,'declined');
    assert.deepEqual(await events(b.sessionId),[{outcome:'declined',outbox:0}]);
  });
  await check('T-3 D4: a cancelled attempt is frozen',async()=>{
    const {sessionId,binding,attemptId}=await retailBound();await settle(sessionId,'fprn',evidence(binding,'cancelled'));
    assert.equal((await pool.query('SELECT state FROM payment_attempts WHERE id=$1',[attemptId])).rows[0].state,'cancelled');
    await assert.rejects(pool.query("UPDATE payment_attempts SET state='approved',outcome='approved' WHERE id=$1",[attemptId]),{code:'23514'});
  });
  await check('unbound provider reference cannot attach or settle when independently expected money differs',async()=>{
    const id=await invoice('property'),claim=await one.claimInvoice(claimInput('property',id),now);assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw new Error('fixture_claim');
    await one.markInvoiceSendStarted(claim.attempt.id,now,randomBytes(32).toString('base64url'));
    const sessionId=`s-${randomUUID()}`,provider={discoverReference:async()=>claim.attempt.reference,query:async()=>({kind:'mismatch' as const})};
    await one.receive(sessionId,'fprn',now);await new PaymentReconciliationWorker(one,provider,clock).runOne(randomUUID());
    assert.equal(await one.resolveSession(sessionId),undefined);assert.equal((await row('property',id)).status,'dispatched');
    assert.equal((await pool.query('SELECT status,last_error_code FROM payment_notification_inbox WHERE session_id=$1',[sessionId])).rows[0].status,'dead_letter');
  });
  assert.deepEqual(failures,[],`${failures.length} R3 verification checks failed`);
  console.log(`R3 PostgreSQL: ${passed} checks passed; synthetic only, no provider or production activity`);
} finally {await Promise.all(pools.map(p=>p.end()));}
