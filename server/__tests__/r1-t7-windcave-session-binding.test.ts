import './support/durable-payments-env';
import request from 'supertest';import {randomUUID} from 'node:crypto';
import {PaymentAttemptService} from '../payment-attempt-service';
import {syntheticRetailRuntime} from './support/retail-runtime';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage} from './support/http-harness';
beforeEach(()=>resetTestStorage());
async function fixture(){
  const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Session binding',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false} as any);
  const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),{app}=await createTestApp({paymentRuntime:port.runtime});
  return {sale,port,app,intent:{idempotencyKey:randomUUID(),shareIndex:0}};
}
describe.each(['hosted-fields-complete','googlepay-complete'])('R1 session binding through R3 (%s)',method=>{
  test('a valid UUID cannot authorize a foreign session before an attempt is prepared',async()=>{
    const f=await fixture();const response=await request(f.app).post(`/api/transactions/${f.sale.id}/${method}`).send({...f.intent,sessionId:'foreign-session'});
    expect(response.status).toBe(404);expect(f.port.client.querySession).not.toHaveBeenCalled();expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');
  });
  test('a legacy row session without a concrete attempt cannot authorize completion',async()=>{
    const f=await fixture();await storage.updateTransactionWindcaveSession(f.sale.id,'legacy-session','pending','legacy-x-id');
    const response=await request(f.app).post(`/api/transactions/${f.sale.id}/${method}`).send({...f.intent,sessionId:'legacy-session'});
    expect(response.status).toBe(404);expect(f.port.client.querySession).not.toHaveBeenCalled();expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');
  });
  test('the actual prepared session settles once through the R2 verifier and original finalizer',async()=>{
    const f=await fixture(),opened=await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send(f.intent);expect(opened.status).toBe(200);f.port.setObservation('approved');
    const body={...f.intent,sessionId:opened.body.sessionId};
    expect((await request(f.app).post(`/api/transactions/${f.sale.id}/${method}`).send(body)).body.approved).toBe(true);
    expect((await request(f.app).post(`/api/transactions/${f.sale.id}/${method}`).send(body)).body.approved).toBe(true);
    expect((await storage.getTransaction(f.sale.id))?.status).toBe('completed');expect(f.port.counts()).toEqual({creates:1,applications:1});
  });
});
