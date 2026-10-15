import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {createTestApp,createOwnerPrincipal,resetTestStorage,storage} from './support/http-harness';
import {PaymentAttemptService} from '../payment-attempt-service';import {syntheticRetailRuntime} from './support/retail-runtime';
import {invoiceHttpFixture} from './support/invoice-http';import * as windcave from '../windcave';
beforeEach(()=>resetTestStorage());afterEach(()=>jest.restoreAllMocks());
async function retail(split=false){
  const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Verification fixture',price:'12.34',status:'pending',paymentMethod:'qr_code',splitEnabled:split} as any);
  if(split)await storage.createBillSplit(sale.id,3);
  const service=new PaymentAttemptService(storage),port=syntheticRetailRuntime(storage,service),{app}=await createTestApp({paymentRuntime:port.runtime});
  const intent={idempotencyKey:randomUUID(),shareIndex:split?3:0},opened=await request(app).post(`/api/transactions/${sale.id}/pay`).send(intent);expect(opened.status).toBe(200);
  return {sale,service,port,app,intent,sessionId:opened.body.sessionId,returnState:opened.body.returnState,body:{...intent,sessionId:opened.body.sessionId}};
}
describe('numbered sale shared R2 verification',()=>{
  test.each(['hosted-fields-complete','googlepay-complete'])('%s uses persisted expected money/reference, then settles once',async route=>{
    const f=await retail();f.port.setObservation('approved');
    expect((await request(f.app).post(`/api/transactions/${f.sale.id}/${route}`).send(f.body)).body.approved).toBe(true);
    const attempt=await f.service.getAttemptByTransactionShareKey({transactionId:f.sale.id,...f.intent});
    expect(attempt).toMatchObject({expectedAmountCents:1234,expectedCurrency:'NZD',providerEnvironment:'uat',state:'approved'});
    expect(f.port.client.createSession.mock.calls[0][0]).toMatchObject({amount:'12.34',merchantReference:`TAPT_${attempt!.id}`});expect(f.port.counts().applications).toBe(1);
  });
  test('the last share uses its exact remainder, never the next pending share',async()=>{
    const f=await retail(true);expect(f.port.client.createSession.mock.calls[0][0].amount).toBe('4.12');
    f.port.setObservation('approved');await request(f.app).post(`/api/transactions/${f.sale.id}/hosted-fields-complete`).send(f.body);
    expect((await storage.getSplitPaymentsByTransaction(f.sale.id)).map(s=>s.status)).toEqual(['pending','pending','completed']);
  });
  test.each(['hosted-fields-complete','googlepay-complete'])('%s cannot decline/approve mismatched provider money',async route=>{
    const f=await retail();f.port.setObservation('mismatch');
    expect((await request(f.app).post(`/api/transactions/${f.sale.id}/${route}`).send(f.body)).status).toBe(202);
    expect(f.port.counts().applications).toBe(0);expect((await storage.getTransaction(f.sale.id))!.status).toBe('pending');
  });
  test('a wallet submit approval cannot settle; only the later verified query can',async()=>{
    const f=await retail();const submit=jest.spyOn(windcave,'submitGooglePayToken').mockImplementation(async()=>{f.port.client.querySession.mockResolvedValueOnce({kind:'unknown'} as any);return {approved:true,windcaveTransactionId:'untrusted-submit'} as any;});
    const bad=await request(f.app).post(`/api/transactions/${f.sale.id}/googlepay-complete`).send({...f.body,googlePayToken:{signature:'synthetic'}});
    expect(bad.status).toBe(202);expect(submit).toHaveBeenCalledTimes(1);expect(f.port.counts().applications).toBe(0);
    f.port.advanceClock();f.port.setObservation('approved');const good=await request(f.app).post(`/api/transactions/${f.sale.id}/googlepay-complete`).send(f.body);
    expect(good.body.approved).toBe(true);expect((await storage.getTransaction(f.sale.id))!.windcaveTransactionId).toBe(`provider-${f.sessionId}`);expect(submit).toHaveBeenCalledTimes(1);
  });
  test.each(['approved','cancelled'])('browser result %s is never financial authority',async result=>{
    const f=await retail();const res=await request(f.app).get('/api/windcave/callback').query({transactionId:f.sale.id,state:f.returnState,result});
    expect(res.status).toBe(303);expect(res.headers.location).toContain('/payment/result/');expect(f.port.counts().applications).toBe(0);
  });
  test('a mismatched notification commits its receipt but cannot settle',async()=>{
    const f=await retail();f.port.setObservation('mismatch');expect((await request(f.app).get('/api/windcave/notification').query({sessionid:f.sessionId})).status).toBe(200);
    await f.port.runtime.worker.runOne(randomUUID(),f.sessionId);expect(f.port.counts().applications).toBe(0);expect([...f.port.receipts.values()].some(x=>x.lastErrorCode==='integrity_mismatch'||x.code==='integrity_mismatch')).toBe(true);
  });
  test('duplicate create reply binds identity but its approved fields cannot settle',async()=>{
    const owner=await createOwnerPrincipal(),sale=await storage.createTransaction({merchantId:owner.merchantId,price:'12.34',status:'pending',paymentMethod:'qr_code',splitEnabled:false} as any);
    const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),create=port.client.createSession.getMockImplementation()!;
    port.client.createSession.mockImplementation(async input=>{const reply=await create(input);return {kind:'duplicate',body:{id:reply.sessionId,approved:true}} as any;});
    const {app}=await createTestApp({paymentRuntime:port.runtime});expect((await request(app).post(`/api/transactions/${sale.id}/pay`).send({idempotencyKey:randomUUID(),shareIndex:0})).status).toBe(202);
    expect(port.bindings.size).toBe(1);expect(port.counts().applications).toBe(0);
  });
});
describe.each(['property','trades'] as const)('%s invoice shared R2 verification',vertical=>{
  test.each(['hosted-fields-complete','googlepay-complete'])('%s verifies exact frozen invoice fields',async route=>{
    const f=await invoiceHttpFixture(vertical),command=await f.open();f.port.setObservation('approved');expect((await f.complete(command,route)).body.approved).toBe(true);
    expect(f.apply.mock.calls[0][1]).toMatchObject({amountCents:100001,currency:'NZD',environment:'uat',providerAccount:'synthetic-account',transactionId:`provider-${command.sessionId}`});
  });
  test.each(['hosted-fields-complete','googlepay-complete'])('%s cannot settle a mismatch',async route=>{
    const f=await invoiceHttpFixture(vertical),command=await f.open();f.port.setObservation('mismatch');expect((await f.complete(command,route)).status).toBe(202);expect(f.apply).not.toHaveBeenCalled();
  });
  test('split allocation is frozen and verifies its precise share',async()=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3}),command=await f.open(f.intent(1));f.port.setObservation('approved');await f.complete(command);expect(f.apply.mock.calls[0][1].amountCents).toBe(33334);
  });
  test('callback uses its stored return state, disregarding browser approval',async()=>{
    const f=await invoiceHttpFixture(vertical),command=await f.open();f.port.setObservation('mismatch');const res=await request(f.app).get('/api/checkout/callback').query({token:f.invoice.token,state:command.returnState,result:'approved'});
    expect(res.status).toBe(303);expect(f.apply).not.toHaveBeenCalled();
  });
  test('notification leaves an unverifiable capture reconcilable',async()=>{
    const f=await invoiceHttpFixture(vertical),command=await f.open();f.port.setObservation('mismatch');const path=vertical==='property'?'rent':'trades';
    expect((await request(f.app).get(`/api/windcave/${path}-notification`).query({sessionid:command.sessionId})).status).toBe(200);
    await f.port.runtime.worker.runOne(randomUUID(),command.sessionId);expect(f.apply).not.toHaveBeenCalled();
  });
  test('duplicate creation is only a session locator, never approval evidence',async()=>{
    const f=await invoiceHttpFixture(vertical),create=f.port.client.createSession.getMockImplementation()!;
    f.port.client.createSession.mockImplementation(async input=>{const result=await create(input);return {kind:'duplicate',body:{id:result.sessionId,approved:true}} as any;});
    await f.open();expect(f.apply).not.toHaveBeenCalled();expect(f.port.bindings.size).toBe(1);
  });
});
