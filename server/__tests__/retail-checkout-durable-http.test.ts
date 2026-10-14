import './support/test-env';
process.env.APP_ENV='development';process.env.PAYMENT_MODE='uat';process.env.FEATURE_NEW_RETAIL_PAYMENTS='true';
process.env.WINDCAVE_ENDPOINT='https://uat.windcave.com/api/v1';process.env.WINDCAVE_USERNAME='synthetic-account';process.env.WINDCAVE_API_KEY='synthetic-key';
process.env.FEATURE_PROVIDER_RECONCILIATION='true';
process.env.ENV_VALIDATION_MODE='enforce';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../app';import {MemStorage} from '../storage';import {PaymentAttemptService} from '../payment-attempt-service';
import {createRetailCheckoutHandlers} from '../payment-checkout-handlers';import {createPaymentCredential} from '../payment-credential';
import {syntheticRetailRuntime} from './support/retail-runtime';

async function fixture(token:boolean,split=false){
  const storage=new MemStorage(),merchant=await storage.createMerchant({name:'Synthetic',businessName:'Synthetic',email:'synthetic@harness.test',businessType:'retail'} as any),credential=createPaymentCredential();
  const sale=await storage.createTransaction({merchantId:merchant.id,itemName:'Synthetic bill',price:'10.01',status:'pending',paymentMethod:'qr_code',splitEnabled:split,...(token?{paymentTokenHash:credential.hash}:{})} as any);
  if(split)await storage.createBillSplit(sale.id,3);
  const attempts=new PaymentAttemptService(storage),port=syntheticRetailRuntime(storage,attempts),app=createApp({writeRequestLog:()=>{}});
  const h=createRetailCheckoutHandlers({storage,attempts,runtime:port.runtime,baseUrl:()=> 'https://harness.test',checkRateLimit:()=>true});
  app.post('/api/transactions/:id/pay',h.session(false));app.post('/api/transactions/:id/hosted-fields-complete',h.complete(false));
  app.post('/api/pay/t/:token/session',h.session(true));app.post('/api/pay/t/:token/hosted-fields-complete',h.complete(true));app.get('/api/pay/return/:state',h.returnState);
  const root=token?`/api/pay/t/${credential.rawToken}`:`/api/transactions/${sale.id}`,intent={idempotencyKey:randomUUID(),shareIndex:split?1:0};
  return {storage,sale,attempts,port,app,root,intent,start:()=>request(app).post(`${root}/${token?'session':'pay'}`).send(intent)};
}
describe.each([false,true])('actual durable retail HTTP contract, token=%s',token=>{
  test('only its own expired unsent command releases the browser identity; possible acceptance is held',async()=>{
    const f=await fixture(token),claim=await f.attempts.claim({transactionId:f.sale.id,...f.intent});
    if(claim.kind!=='claimed')throw Error('fixture');claim.attempt.leaseExpiresAt=new Date(0);
    const expired=await f.start();expect(expired.status).toBe(409);expect(expired.body.code).toBe('PAYMENT_ATTEMPT_EXPIRED');expect(f.port.client.createSession).not.toHaveBeenCalled();
    const held=await fixture(token),started=await held.attempts.claim({transactionId:held.sale.id,...held.intent});
    if(started.kind!=='claimed')throw Error('fixture');
    await held.port.runtime.repository.prepareRetailExpectation({paymentAttemptId:started.attempt.id,merchantId:held.sale.merchantId!,currency:'NZD',environment:'uat',providerAccount:'synthetic-account'},new Date());
    started.attempt.leaseExpiresAt=new Date(0);expect((await held.start()).status).toBe(202);expect(held.port.client.createSession).not.toHaveBeenCalled();
  });
  test.each([false,true])('prepares and settles the exact original normal/split attempt once (split=%s)',async split=>{
    const f=await fixture(token,split),opened=await f.start();expect(opened.status).toBe(200);expect(opened.body.shareIndex).toBe(f.intent.shareIndex);
    f.port.setObservation('approved');
    const body={...f.intent,sessionId:opened.body.sessionId};
    const response=await request(f.app).post(`${f.root}/hosted-fields-complete`).send(body);
    expect(response.body).toMatchObject({approved:true,outcome:'approved',receiptShare:split?1:null});
    expect((await request(f.app).post(`${f.root}/hosted-fields-complete`).send(body)).status).toBe(200);expect(f.port.counts()).toEqual({creates:1,applications:1});
    const binding=f.port.bindings.get(opened.body.sessionId);expect(binding.amountCents).toBe(split?333:1001);
    const current=await f.storage.getTransaction(f.sale.id);expect(current?.status).toBe(split?'pending':'completed');if(split)expect(current?.completedSplits).toBe(1);
  });
  test('missing identity, wrong session or wrong UUID refuses before reconciliation',async()=>{
    const f=await fixture(token),opened=await f.start();expect(opened.status).toBe(200);
    for(const body of [{sessionId:opened.body.sessionId},{...f.intent,sessionId:'foreign-session'},{...f.intent,idempotencyKey:randomUUID(),sessionId:opened.body.sessionId}]){
      const result=await request(f.app).post(`${f.root}/hosted-fields-complete`).send(body);expect([400,404]).toContain(result.status);
    }expect(f.port.client.querySession).not.toHaveBeenCalled();expect(f.port.counts().applications).toBe(0);
  });
  test.each(['pending','mismatch','multiple'] as const)('%s provider evidence cannot change money',async observation=>{
    const f=await fixture(token),opened=await f.start();f.port.setObservation(observation);
    const result=await request(f.app).post(`${f.root}/hosted-fields-complete`).send({...f.intent,sessionId:opened.body.sessionId});expect(result.status).toBe(202);
    expect((await f.storage.getTransaction(f.sale.id))?.status).toBe('pending');expect(f.port.counts().applications).toBe(0);
  });
  test('browser approval text cannot turn a verified decline into approval',async()=>{
    const f=await fixture(token),opened=await f.start();f.port.setObservation('declined');
    await request(f.app).get(`/api/pay/return/${opened.body.returnState}`).query({source:'hpp',result:'approved'});
    expect((await f.storage.getTransaction(f.sale.id))?.status).toBe('failed');expect((await f.storage.getPaymentAttemptByTransactionShareKey(f.sale.id,0,f.intent.idempotencyKey))?.state).toBe('declined');
  });
});
