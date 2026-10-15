import './support/test-env';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {MemStorage} from '../storage';
import {PaymentAttemptService} from '../payment-attempt-service';
import {createOwnerPrincipal,createTestApp,resetTestStorage,signedIn,storage,storageSnapshot} from './support/http-harness';
import {observeRefusalEffects} from './support/refusal-effects';

async function claimed(repo:MemStorage) {
  const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
  const engine=new PaymentAttemptService(repo);
  const claim=await engine.claim({transactionId:transaction.id,shareIndex:0,idempotencyKey:randomUUID()});
  if(claim.kind!=='claimed') throw new Error('fixture_claim');
  return {transaction,attempt:claim.attempt};
}
test('owner cancellation preserves a live or expired unattached attempt and records one command',async()=>{
  const repo=new MemStorage();const {transaction,attempt}=await claimed(repo);
  for(const expires of [Date.now()+1000,Date.now()-1000]) {
    (repo as any).paymentAttempts.get(attempt.id).leaseExpiresAt=new Date(expires);
    await expect(repo.cancelTransactionForMerchant(transaction.id,11,{userId:1,role:'owner'})).resolves.toMatchObject({kind:'cancelled'});
    expect((await repo.getTransaction(transaction.id))?.status).toBe('cancelled');
    expect((await repo.getPaymentAttempt(attempt.id))?.state).toBe('claiming');
  }
  expect((repo as any).cashAuditEvents.size).toBe(1);
  expect((repo as any).cashOutboxEntries.size).toBe(1);
});
test.each(['windcaveSessionId','windcaveTransactionId'] as const)('cancellation preserves recorded %s without assuming capture',async field=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'processing',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).transactions.get(transaction.id)[field]='synthetic-bound';
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'cancelled'});
  expect((await repo.getTransaction(transaction.id))?.[field]).toBe('synthetic-bound');
});
test('cancellation refuses a paid split row even when its aggregate counter is stale',async()=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).splitPayments.set(1,{id:1,transactionId:transaction.id,status:'completed',windcaveTransactionId:'synthetic-capture'});
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'conflict',reason:'payment-active'});
  expect((await repo.getTransaction(transaction.id))?.status).toBe('pending');
});
test('active cancellation conflict is truthful and has no state/provider/message effects',async()=>{
  resetTestStorage();const {app}=await createTestApp();const owner=await createOwnerPrincipal();
  const transaction=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
  const engine=new PaymentAttemptService(storage);const attempt=await engine.claim({transactionId:transaction.id,shareIndex:0,idempotencyKey:randomUUID()});
  if(attempt.kind!=='claimed')throw new Error('fixture_claim');
  (storage as any).paymentAttempts.get(attempt.attempt.id).state='approved';
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {
    const result=await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(owner));
    expect(result.status).toBe(409);expect(result.body).toEqual({message:'Payment is in progress or a share is already paid',code:'PAYMENT_ACTIVE'});
    expect(storageSnapshot()).toBe(before);effects.assertNone();
  } finally {effects.restore();}
});
// R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md): the pre-cancel check can
// record a payment Windcave has just confirmed; the cancel then says so, so the terminal can tell the merchant.
test('a sale just recorded as paid refuses the cancel with PAYMENT_COMPLETED and changes nothing',async()=>{
  resetTestStorage();const {app}=await createTestApp();const owner=await createOwnerPrincipal();
  const transaction=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Synthetic',price:'10.00',status:'completed',paymentMethod:'qr_code',splitEnabled:false});
  const before=storageSnapshot();
  const result=await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(owner));
  expect(result.status).toBe(409);expect(result.body).toEqual({code:'PAYMENT_COMPLETED',message:'This sale has just been paid. Refund it instead of cancelling.'});
  expect(storageSnapshot()).toBe(before);
});
