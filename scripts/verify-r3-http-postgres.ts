/** Real served R3 routes + owned PostgreSQL; synthetic provider, no external I/O. */
import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import pg from 'pg';import {drizzle} from 'drizzle-orm/node-postgres';import request from 'supertest';
import {assertSafePostgresVerifierEnvironment} from './postgres-verifier-safety.mjs';
const {testDatabaseUrl}=assertSafePostgresVerifierEnvironment({testDatabaseUrl:process.env.TEST_DATABASE_URL,configuredDatabaseUrl:process.env.DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
assertSafePostgresVerifierEnvironment({testDatabaseUrl,configuredDatabaseUrl:process.env.NEON_DATABASE_URL,marker:process.env.TAPTPAY_TEST_DATABASE});
const url=new URL(testDatabaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55440');assert.equal(url.pathname,'/r3_integrated_scratch');
await import('../server/__tests__/support/test-env');
Object.assign(process.env,{APP_ENV:'development',ENV_VALIDATION_MODE:'enforce',PAYMENT_MODE:'uat',WINDCAVE_ENDPOINT:'https://uat.windcave.com/api/v1',WINDCAVE_USERNAME:'synthetic-account',WINDCAVE_API_KEY:'synthetic-key',FEATURE_PROVIDER_RECONCILIATION:'true',FEATURE_NEW_RETAIL_PAYMENTS:'true',FEATURE_INVOICE_PAYMENTS:'true'});
// The provider port below never calls fetch. Refuse accidental external SDK I/O.
globalThis.fetch=async()=>{throw Error('synthetic_verifier_external_io_refused');};
const [{DatabaseStorage},{DurablePaymentStorage},{PaymentAttemptService},{createRetailReconciliationFinalizer,createRetailSessionRecoveryAttacher},{PaymentRuntime},{createWindcaveReconciliationProvider},{createApp},{registerRoutes},schema]=await Promise.all([
  import('../server/storage'),import('../server/durable-payment-storage'),import('../server/payment-attempt-service'),import('../server/retail-reconciliation-adapter'),import('../server/payment-runtime'),import('../server/windcave-reconciliation-provider'),import('../server/app'),import('../server/routes'),import('../shared/schema')]);
const pools=[new pg.Pool({connectionString:testDatabaseUrl,max:8}),new pg.Pool({connectionString:testDatabaseUrl,max:8})],pool=pools[0],stores=pools.map(p=>new DatabaseStorage(drizzle(p,{schema}) as any));
const sessions=new Map<string,{amount:string;reference:string;outcome:string}>(),context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'};let creates=0,passed=0;const failures:string[]=[];
const client={createSession:async(input:any)=>{creates++;const sessionId=`served-${randomUUID()}`;sessions.set(sessionId,{amount:input.amount,reference:input.merchantReference,outcome:'pending'});return {kind:'created',sessionId,links:{hpp:`https://uat.windcave.com/pxmi3/${sessionId}`}};},
 querySession:async(sessionId:string)=>{const row=sessions.get(sessionId);if(!row)return {kind:'unknown'};return {kind:'reply',status:200,body:{id:sessionId,state:row.outcome==='pending'?'pending':'complete',transactions:row.outcome==='pending'?[]:[{id:`provider-${sessionId}`,type:'purchase',authorised:row.outcome!=='declined',amount:row.outcome==='mismatch'?'0.01':row.amount,currency:'NZD',merchantReference:row.reference}],links:[{rel:'hpp',href:`https://uat.windcave.com/pxmi3/${sessionId}`}]}};}};
const runtimes=pools.map((p,i)=>{const attempts=new PaymentAttemptService(stores[i]),repository=new DurablePaymentStorage(p,createRetailReconciliationFinalizer(attempts),createRetailSessionRecoveryAttacher(stores[i]));return Object.assign(new PaymentRuntime(repository,createWindcaveReconciliationProvider(client as any,context)),{client,context}) as any;});
const apps=await Promise.all(stores.map(async(storage,i)=>{const app=createApp({writeRequestLog:()=>{}});await registerRoutes(app,{storage,paymentRuntime:runtimes[i]});return app;}));
async function check(name:string,test:()=>Promise<void>){try{await test();passed++;console.log('PASS '+name);}catch(error){failures.push(name);const e=error as any;console.error(`FAIL ${name} (${e?.code??'assertion_failure'})`,JSON.stringify({column:e?.column,table:e?.table,actual:typeof e?.actual==='number'?e.actual:undefined,expected:typeof e?.expected==='number'?e.expected:undefined,line:e?.stack?.split('\n').find((x:string)=>x.includes('verify-r3-http-postgres.ts:'))}));}}
async function fixture(domain:'numbered'|'token'|'property'|'trades',split=false){
 const merchant=(await pool.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3 served','R3 served',$1,'active') RETURNING id",[`${randomUUID()}@synthetic.test`])).rows[0].id,token=randomBytes(32).toString('base64url');
 let id:number|string,root:string;
 if(domain==='numbered'||domain==='token'){
  const row=await stores[0].createTransactionForMerchant(merchant,{merchantId:merchant,itemName:'Synthetic served bill',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:split,...(domain==='token'?{paymentTokenHash:(await import('../server/payment-credential')).hashBearerCredential(token)}:{})} as any);id=row.id;if(split)await stores[0].createBillSplit(row.id,3);root=domain==='token'?`/api/pay/t/${token}`:`/api/transactions/${id}`;
 }else{const partyTable=domain==='property'?'tenant_profiles':'client_profiles',address=domain==='property'?'property_address':'site_address';
  const party=(await pool.query(`INSERT INTO ${partyTable}(merchant_id,first_name,last_name,${address}) VALUES ($1,'Synthetic','Party','Synthetic site') RETURNING id`,[merchant])).rows[0].id;
  const table=domain==='property'?'invoices_rent_requests':'job_invoices',fk=domain==='property'?'tenant_profile_id':'client_profile_id';
  id=(await pool.query(`INSERT INTO ${table}(merchant_id,${fk},token,amount_cents,status,delivery_channel,split_enabled,split_count,due_at) VALUES ($1,$2,$3,1001,$4,'email',$5,$6,$7) RETURNING id`,[merchant,party,token,domain==='property'?'dispatched':'sent',split,split?3:null,new Date(Date.now()+7*86400000)])).rows[0].id;root=`/api/checkout/${token}`;
 }
 const intent={idempotencyKey:randomUUID(),shareIndex:split?1:0},path=`${root}/${domain==='numbered'?'pay':'session'}`;
 return {domain,id,merchant,token,root,intent,path};
}
const completePath=(f:any)=>`${f.root}/hosted-fields-complete`;
const countSettlements=async(sessionId:string)=>(await pool.query('SELECT count(*)::int AS n FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0].n;
try{
 for(const domain of ['numbered','token','property','trades'] as const){
  for(const split of [false,true])await check(`${domain}: actual HTTP preparation and completion settle one exact ${split?'split':'full'} amount`,async()=>{
   const f=await fixture(domain,split),before=creates,opened=await request(apps[0]).post(f.path).send(f.intent);assert.equal(opened.status,200);
   const reused=await request(apps[1]).post(f.path).send(f.intent);assert.equal(reused.status,200);assert.equal(reused.body.sessionId,opened.body.sessionId);assert.equal(creates-before,1);
   const sessionId=opened.body.sessionId;sessions.get(sessionId)!.outcome='approved';const body={...f.intent,sessionId};
   const first=await request(apps[0]).post(completePath(f)).send(body);assert.equal(first.status,200);assert.equal(first.body.approved,true);
   const replay=await request(apps[1]).post(completePath(f)).send(body);assert.equal(replay.status,200);assert.equal(replay.body.approved,true);assert.equal(await countSettlements(sessionId),1);
   const event=(await pool.query('SELECT amount_cents FROM payment_settlement_events WHERE session_id=$1',[sessionId])).rows[0];assert.equal(Number(event.amount_cents),split?(domain==='numbered'||domain==='token'?333:334):1001);
   if(domain==='numbered'||domain==='token'){const audit=(await pool.query('SELECT last_reconciliation_code,last_reconciled_at FROM payment_attempts WHERE processor_session_id=$1',[sessionId])).rows[0];assert.equal(audit.last_reconciliation_code,'approved');assert.ok(audit.last_reconciled_at);}
  });
  await check(`${domain}: a missing command or foreign session cannot change money`,async()=>{
   const f=await fixture(domain),opened=await request(apps[0]).post(f.path).send(f.intent);assert.equal(opened.status,200);
   assert.equal((await request(apps[0]).post(completePath(f)).send({sessionId:opened.body.sessionId})).status,400);
   const foreign=await request(apps[0]).post(completePath(f)).send({...f.intent,sessionId:'foreign-session'});assert.ok([403,404,409].includes(foreign.status));assert.equal(await countSettlements(opened.body.sessionId),0);
  });
  await check(`${domain}: mismatched provider money remains processing without settlement`,async()=>{
   const f=await fixture(domain),opened=await request(apps[0]).post(f.path).send(f.intent);assert.equal(opened.status,200);sessions.get(opened.body.sessionId)!.outcome='mismatch';
   const result=await request(apps[0]).post(completePath(f)).send({...f.intent,sessionId:opened.body.sessionId});assert.equal(result.status,202);assert.equal(await countSettlements(opened.body.sessionId),0);
  });
  await check(`${domain}: repeated actual FPRN acknowledgements and two workers retain one settlement`,async()=>{
   const f=await fixture(domain),opened=await request(apps[0]).post(f.path).send(f.intent);assert.equal(opened.status,200);const sessionId=opened.body.sessionId;sessions.get(sessionId)!.outcome='approved';
   const notification=domain==='property'?'/api/windcave/rent-notification':domain==='trades'?'/api/windcave/trades-notification':'/api/windcave/notification';
   for(let i=0;i<4;i++)assert.equal((await request(apps[i%2]).post(notification).send({sessionId,approved:false})).status,200);
   await Promise.all(runtimes.map(r=>r.worker.runOne(randomUUID(),sessionId)));for(let i=0;i<4;i++)await runtimes[i%2].worker.runOne(randomUUID(),sessionId);
   assert.equal(await countSettlements(sessionId),1);assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_notification_inbox WHERE session_id=$1 AND kind='fprn'",[sessionId])).rows[0].n,1);
  });
  await check(`${domain}: another prepared invoice or share cannot use an equal-value approved session`,async()=>{
   const first=await fixture(domain,true),second=await fixture(domain,true),a=await request(apps[0]).post(first.path).send(first.intent),b=await request(apps[1]).post(second.path).send(second.intent);
   assert.equal(a.status,200);assert.equal(b.status,200);sessions.get(a.body.sessionId)!.outcome='approved';
   const cross=await request(apps[1]).post(completePath(second)).send({...second.intent,sessionId:a.body.sessionId});assert.equal(cross.status,404);
   assert.equal(await countSettlements(a.body.sessionId),0);assert.equal(await countSettlements(b.body.sessionId),0);
   assert.equal((await request(apps[0]).post(completePath(first)).send({...first.intent,sessionId:a.body.sessionId})).body.approved,true);
   assert.equal(await countSettlements(a.body.sessionId),1);assert.equal(await countSettlements(b.body.sessionId),0);
  });
 }
}finally{await Promise.all(pools.map(p=>p.end()));}
assert.deepEqual(failures,[]);console.log(`R3 served PostgreSQL: ${passed} checks passed; synthetic provider only`);
