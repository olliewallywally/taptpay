import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {PaymentAttemptService} from '../payment-attempt-service';import {createPaymentCredential} from '../payment-credential';
import {syntheticRetailRuntime} from './support/retail-runtime';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage} from './support/http-harness';
beforeEach(()=>resetTestStorage());
async function openedAttempt(){
  const owner=await createOwnerPrincipal(),link=createPaymentCredential(),sale=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Verified return',price:'5.50',status:'pending',paymentMethod:'qr_code',splitEnabled:false,paymentTokenHash:link.hash} as any);
  const port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage)),{app}=await createTestApp({paymentRuntime:port.runtime});
  const opened=await request(app).post(`/api/pay/t/${link.rawToken}/session`).send({idempotencyKey:randomUUID(),shareIndex:0});expect(opened.status).toBe(200);
  return {app,sale,port,sessionId:opened.body.sessionId,returnState:opened.body.returnState};
}
const returned=(f:Awaited<ReturnType<typeof openedAttempt>>,result='approved')=>request(f.app).get(`/api/pay/return/${f.returnState}`).query({source:'hpp',result});
test('return queries the original session with independently recorded exact expectations',async()=>{
  const f=await openedAttempt();f.port.setObservation('approved');await returned(f);
  const attempt=await storage.getPaymentAttemptByProcessorSessionId(f.sessionId);
  expect(attempt).toMatchObject({expectedAmountCents:550,expectedCurrency:'NZD',expectedMerchantReference:expect.stringMatching(/^TAPT_/),providerEnvironment:'uat',state:'approved'});
  expect(f.port.client.querySession).toHaveBeenCalledWith(f.sessionId);expect((await storage.getTransaction(f.sale.id))?.status).toBe('completed');
});
test('browser cancellation never changes an independently verified decline',async()=>{
  const f=await openedAttempt();f.port.setObservation('declined');await returned(f,'cancelled');
  expect((await storage.getPaymentAttemptByProcessorSessionId(f.sessionId))?.state).toBe('declined');expect((await storage.getTransaction(f.sale.id))?.status).toBe('failed');
});
test('mismatched observed money settles nothing despite browser approval',async()=>{
  const f=await openedAttempt();f.port.setObservation('mismatch');await returned(f);
  expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');expect(f.port.counts().applications).toBe(0);
  expect((await storage.getPaymentAttemptByProcessorSessionId(f.sessionId))).toMatchObject({lastReconciliationCode:'integrity_mismatch',lastReconciledAt:expect.any(Date)});
});
test('verified approval preserves R2 reconciliation code and time',async()=>{
  const f=await openedAttempt();f.port.setObservation('approved');await returned(f);
  expect((await storage.getPaymentAttemptByProcessorSessionId(f.sessionId))).toMatchObject({lastReconciliationCode:'approved',lastReconciledAt:expect.any(Date)});
});
test('unknown transport records a fixed code and retains pending financial state',async()=>{
  const f=await openedAttempt();f.port.client.querySession.mockResolvedValueOnce({kind:'unknown'} as any);await returned(f);
  expect((await storage.getPaymentAttemptByProcessorSessionId(f.sessionId))).toMatchObject({state:'ready',lastReconciliationCode:'provider_unknown',lastReconciledAt:expect.any(Date)});
  expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');
});
test('throwing provider body cannot record a decline or leak provider text into diagnostics',async()=>{
  const f=await openedAttempt();f.port.client.querySession.mockRejectedValueOnce(new Error('Synthetic unreadable provider body'));await returned(f);
  expect((await storage.getPaymentAttemptByProcessorSessionId(f.sessionId))).toMatchObject({state:'ready',lastReconciliationCode:'internal_error'});
  expect((await storage.getTransaction(f.sale.id))?.status).toBe('pending');expect(f.port.counts().applications).toBe(0);
});
