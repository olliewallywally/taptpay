import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {PaymentAttemptService} from '../payment-attempt-service';import {syntheticRetailRuntime} from './support/retail-runtime';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage,storageSnapshot} from './support/http-harness';
beforeEach(()=>resetTestStorage());
async function fixture(price='100.00',split=true){
  const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Exact share',price,status:'pending',paymentMethod:'qr_code',splitEnabled:split} as any);
  const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),{app}=await createTestApp({paymentRuntime:port.runtime});
  if(split)expect((await request(app).post(`/api/transactions/${sale.id}/split`).send({totalSplits:3})).status).toBe(200);
  return {app,sale,port};
}
const amounts=(f:Awaited<ReturnType<typeof fixture>>)=>f.port.client.createSession.mock.calls.map(([input])=>input.amount);
test.each(['0.01','50.00','33.34'])('first share refuses %s before any provider session or storage effect',async amount=>{
  const f=await fixture(),before=storageSnapshot();
  const response=await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send({idempotencyKey:randomUUID(),shareIndex:1,amount});
  expect(response.status).toBe(400);expect(response.body.message).toBe('Payment amount does not match the share');expect(amounts(f)).toEqual([]);expect(storageSnapshot()).toBe(before);
});
test('same command uses exact share money and cannot create another purchase on retry',async()=>{
  const f=await fixture(),intent={idempotencyKey:randomUUID(),shareIndex:1};
  expect((await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send(intent)).status).toBe(200);
  expect((await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send({...intent,amount:'33.33'})).status).toBe(200);
  expect(amounts(f)).toEqual(['33.33']);
});
test('each explicitly selected share retains its amount; the last remainder is not underpaid',async()=>{
  const f=await fixture();
  for(const shareIndex of [1,2,3]){
    const intent={idempotencyKey:randomUUID(),shareIndex};
    if(shareIndex===3){const wrong=await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send({...intent,amount:'33.33'});expect(wrong.status).toBe(400);}
    f.port.setObservation('pending');const opened=await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send(intent);expect(opened.status).toBe(200);
    f.port.setObservation('approved');const done=await request(f.app).post(`/api/transactions/${f.sale.id}/hosted-fields-complete`).send({...intent,sessionId:opened.body.sessionId});expect(done.status).toBe(200);expect(done.body.receiptShare).toBe(shareIndex);
  }
  expect(amounts(f)).toEqual(['33.33','33.33','33.34']);expect((await storage.getTransaction(f.sale.id))).toMatchObject({completedSplits:3,totalSplits:3,status:'completed'});
});
test('full payment refuses another amount, then prepares only the exact price',async()=>{
  const f=await fixture('12.50',false),intent={idempotencyKey:randomUUID(),shareIndex:0};
  expect((await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send({...intent,amount:'1.00'})).status).toBe(400);expect(amounts(f)).toEqual([]);
  expect((await request(f.app).post(`/api/transactions/${f.sale.id}/pay`).send({...intent,amount:'12.50'})).status).toBe(200);expect(amounts(f)).toEqual(['12.50']);
});
