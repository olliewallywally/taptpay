import './support/durable-payments-env';
import request from 'supertest';import {randomUUID} from 'node:crypto';
import {PaymentAttemptService} from '../payment-attempt-service';import {syntheticRetailRuntime} from './support/retail-runtime';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage} from './support/http-harness';
beforeEach(()=>resetTestStorage());
async function fixture(){const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Callback',price:'5.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false} as any);
  const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),{app}=await createTestApp({paymentRuntime:port.runtime});
  const opened=await request(app).post(`/api/transactions/${sale.id}/pay`).send({idempotencyKey:randomUUID(),shareIndex:0});expect(opened.status).toBe(200);return {sale,port,app,state:opened.body.returnState};}
test('the exact number plus its owned hashed state reaches its verified receipt',async()=>{
  const f=await fixture();f.port.setObservation('approved');const response=await request(f.app).get('/api/windcave/callback').query({transactionId:String(f.sale.id),state:f.state});
  expect(response.status).toBe(303);expect(response.headers.location).toBe(`/receipt/${f.sale.id}`);expect((await storage.getTransaction(f.sale.id))?.status).toBe('completed');
});
test('a cached legacy approval without return state cannot redirect to a paid receipt',async()=>{
  const f=await fixture();await storage.updateTransactionSessionState(f.sale.id,'approved');
  const response=await request(f.app).get('/api/windcave/callback').query({transactionId:String(f.sale.id)});
  expect(response.status).toBe(409);expect(response.headers.location).toBeUndefined();expect(f.port.client.querySession).not.toHaveBeenCalled();expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');
});
test.each(['abc','.0','+','e0'])('malformed number (%s) cannot use another valid return state',async form=>{
  const f=await fixture(),id=form==='+'?`+${f.sale.id}`:`${f.sale.id}${form}`;
  const response=await request(f.app).get('/api/windcave/callback').query({transactionId:id,state:f.state});
  expect(response.status).toBe(404);expect(response.headers.location).toBeUndefined();expect(f.port.client.querySession).not.toHaveBeenCalled();expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');
});
