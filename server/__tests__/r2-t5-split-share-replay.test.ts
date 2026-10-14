import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {PaymentAttemptService} from '../payment-attempt-service';import {syntheticRetailRuntime} from './support/retail-runtime';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage} from './support/http-harness';
beforeEach(()=>resetTestStorage());
async function fixture(){const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Split replay',price:'30.00',status:'pending',paymentMethod:'qr_code',splitEnabled:true} as any);
  const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),{app}=await createTestApp({paymentRuntime:port.runtime});
  expect((await request(app).post(`/api/transactions/${sale.id}/split`).send({totalSplits:3})).status).toBe(200);
  const intent={idempotencyKey:randomUUID(),shareIndex:1},opened=await request(app).post(`/api/transactions/${sale.id}/pay`).send(intent);expect(opened.status).toBe(200);
  port.setObservation('approved');return {sale,port,app,intent,sessionId:opened.body.sessionId,state:opened.body.returnState};}
const complete=(f:Awaited<ReturnType<typeof fixture>>,patch={})=>request(f.app).post(`/api/transactions/${f.sale.id}/hosted-fields-complete`).send({...f.intent,sessionId:f.sessionId,...patch});
const states=async(id:number)=>(await storage.getSplitPaymentsByTransaction(id)).map(x=>x.status);
test('verified first completion counts its original share only',async()=>{const f=await fixture();expect((await complete(f)).status).toBe(200);expect(await states(f.sale.id)).toEqual(['completed','pending','pending']);expect((await storage.getTransaction(f.sale.id))?.completedSplits).toBe(1);});
test.each(['completion','notification','browser'] as const)('replayed %s never selects the next pending share',async source=>{
  const f=await fixture();expect((await complete(f)).status).toBe(200);
  if(source==='completion')expect((await complete(f)).status).toBe(200);
  if(source==='notification'){expect((await request(f.app).get('/api/windcave/notification').query({sessionid:f.sessionId})).status).toBe(200);await f.port.runtime.worker.runOne(randomUUID(),f.sessionId);}
  if(source==='browser')expect((await request(f.app).get('/api/windcave/callback').query({transactionId:String(f.sale.id),state:f.state})).status).toBe(303);
  expect(await states(f.sale.id)).toEqual(['completed','pending','pending']);expect((await storage.getTransaction(f.sale.id))?.completedSplits).toBe(1);expect(f.port.counts()).toEqual({creates:1,applications:1});
});
test('the same approved session cannot fund another equal-value share',async()=>{
  const f=await fixture();expect((await complete(f)).status).toBe(200);const before=f.port.client.querySession.mock.calls.length;
  expect((await complete(f,{shareIndex:2,idempotencyKey:randomUUID()})).status).toBe(404);expect(f.port.client.querySession.mock.calls.length).toBe(before);
  expect(await states(f.sale.id)).toEqual(['completed','pending','pending']);expect(f.port.counts().applications).toBe(1);
});
