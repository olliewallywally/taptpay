/**
 * R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md §5): the cutover gate.
 * Synthetic rows only, on a disposable database rehearsed by scripts/rehearse-r3-migration-postgres.ts.
 * TEST_DATABASE_URL=postgres://...@127.0.0.1:<port>/r3_integrated_scratch TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-r3-cutover-postgres.ts
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';

const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const target=new URL(testDatabaseUrl);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/r3_integrated_scratch');
await import('../server/__tests__/support/test-env');
const {DatabaseStorage}=await import('../server/storage');
const {PaymentAttemptService}=await import('../server/payment-attempt-service');
const {readCutoverGate,retireLegacyOutbox}=await import('../server/payment-cutover');
const schema=await import('../shared/schema');
const pool=new pg.Pool({connectionString:testDatabaseUrl,max:4});
const original=new DatabaseStorage(drizzle(pool,{schema}) as any);
const failures:string[]=[];let passed=0;
async function check(name:string,test:()=>Promise<void>){
  try{await test();passed++;console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name} (${(error as any)?.code??'assertion_failure'})`);}
}
try {
  const merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('Cutover','Cutover',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id;
  await check('an empty database passes the gate',async()=>{
    const gate=await readCutoverGate(pool);assert.equal(gate.ok,true);assert.deepEqual(gate.blocking,[]);
  });
  await check('a live attempt the old route recorded without its account blocks the gate, by count only',async()=>{
    const sale=await original.createTransaction({merchantId:merchant,itemName:'Cutover synthetic',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
    const service=new PaymentAttemptService(original);const claim=await service.claim({transactionId:sale.id,shareIndex:0,idempotencyKey:randomUUID()});
    assert.equal(claim.kind,'claimed');if(claim.kind!=='claimed')throw Error('fixture');
    await service.recordExpectedValues({attemptId:claim.attempt.id,amountCents:1001,currency:'NZD',merchantReference:`TAPT_${claim.attempt.id}`,providerEnvironment:'uat'});
    const gate=await readCutoverGate(pool);assert.equal(gate.ok,false);assert.deepEqual(gate.blocking,['liveRetailMissingExpectations']);
    assert.equal(gate.liveRetailMissingExpectations,1);assert.ok(!JSON.stringify(gate).includes(claim.attempt.id));
    await pool.query("UPDATE payment_attempts SET state='abandoned' WHERE id=$1",[claim.attempt.id]);
    assert.equal((await readCutoverGate(pool)).ok,true);
  });
  await check('rows an old build left undelivered block the gate; retiring them is a dry run until applied',async()=>{
    await original.recordCashSaleForMerchant(merchant,{merchantId:merchant,itemName:'Legacy cash',price:'5.00',idempotencyKey:randomUUID(),actor:{userId:1,role:'owner'}});
    const before=new Date(Date.now()+1000);
    const gate=await readCutoverGate(pool,before);assert.equal(gate.ok,false);assert.deepEqual(gate.blocking,['legacyUndeliveredOutbox']);
    assert.deepEqual(gate.legacyUndeliveredOutbox,{transaction_event:{merchant_payment_update:1}});
    assert.deepEqual(await retireLegacyOutbox(pool,{before,apply:false}),{retired:0,eligible:1});
    assert.equal((await readCutoverGate(pool,before)).ok,false);
    assert.deepEqual(await retireLegacyOutbox(pool,{before,apply:true}),{retired:1,eligible:1});
    assert.equal((await readCutoverGate(pool,before)).ok,true);
    const row=(await pool.query("SELECT status,completed_at FROM payment_delivery_outbox WHERE transaction_event_id IS NOT NULL")).rows[0];
    assert.equal(row.status,'complete');assert.ok(row.completed_at);
  });
  await check('a row written after the cutover time, or one a delivery loop already touched, is never retired',async()=>{
    const before=new Date(Date.now()-60000);
    await original.recordCashSaleForMerchant(merchant,{merchantId:merchant,itemName:'New cash',price:'6.00',idempotencyKey:randomUUID(),actor:{userId:1,role:'owner'}});
    assert.deepEqual(await retireLegacyOutbox(pool,{before,apply:true}),{retired:0,eligible:0});
    await pool.query("UPDATE payment_delivery_outbox SET status='retry',attempt_count=1 WHERE status='pending'");
    assert.deepEqual(await retireLegacyOutbox(pool,{before:new Date(Date.now()+1000),apply:true}),{retired:0,eligible:0});
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE status='retry'")).rows[0].n,1);
  });
  await check('the cutover time is required and must be a real date',async()=>{
    await assert.rejects(retireLegacyOutbox(pool,{before:new Date('invalid'),apply:true}),/invalid_cutover_time/);
  });
} finally {await pool.end();}
assert.deepEqual(failures,[],`${failures.length} cutover checks failed`);
console.log(`R3 cutover PostgreSQL: ${passed} checks passed; synthetic only`);
