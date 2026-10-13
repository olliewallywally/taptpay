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
// Owner decision OI-1 (2026-10-13): an attempt to pay never refuses the owner's cancel.
// An unsent claim is closed with the sale; an attempt that may have reached Windcave
// (a session or R3 send intent) is left able to settle, so a late payment is recorded.
test('owner cancellation closes an unsent claim and leaves an attempt that may have reached the provider able to settle',async()=>{
  for(const expires of [Date.now()+1000,Date.now()-1000]) {
    const repo=new MemStorage();const {transaction,attempt}=await claimed(repo);
    (repo as any).paymentAttempts.get(attempt.id).leaseExpiresAt=new Date(expires);
    await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'cancelled'});
    expect((await repo.getPaymentAttempt(attempt.id))?.state).toBe('abandoned');
  }
  for(const reached of [{sendStartedAt:new Date()},{processorSessionId:'synthetic-session'}]) {
    const repo=new MemStorage();const {transaction,attempt}=await claimed(repo);
    Object.assign((repo as any).paymentAttempts.get(attempt.id),reached,{leaseExpiresAt:new Date(Date.now()-1000)});
    await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'cancelled'});
    expect((await repo.getPaymentAttempt(attempt.id))?.state).toBe('claiming');
  }
});
test('a recorded session is an attempt, not money taken: it no longer holds the sale',async()=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'processing',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).transactions.get(transaction.id).windcaveSessionId='synthetic-bound';
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'cancelled'});
});
test.each(['windcaveTransactionId','completedSplits'] as const)('cancellation holds money taken: recorded %s',async field=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'processing',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).transactions.get(transaction.id)[field]=field==='completedSplits'?1:'synthetic-bound';
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'conflict',reason:'payment-captured'});
  expect((await repo.getTransaction(transaction.id))?.status).toBe('processing');
});
test('cancellation refuses a paid split row even when its aggregate counter is stale',async()=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).splitPayments.set(1,{id:1,transactionId:transaction.id,status:'completed',windcaveTransactionId:'synthetic-capture'});
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'conflict',reason:'payment-captured'});
  expect((await repo.getTransaction(transaction.id))?.status).toBe('pending');
});
test('a captured-money refusal is truthful and has no state/provider/message effects',async()=>{
  resetTestStorage();const {app}=await createTestApp();const owner=await createOwnerPrincipal();
  const transaction=await storage.createTransaction({merchantId:owner.merchantId,itemName:'Synthetic',price:'10.00',status:'pending',paymentMethod:'qr_code',splitEnabled:false});
  (storage as any).transactions.get(transaction.id).completedSplits=1;
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {
    const result=await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(owner));
    expect(result.status).toBe(409);
    expect(result.body).toEqual({message:'A payment has already been taken on this sale. Refund it instead of cancelling.',code:'PAYMENT_CAPTURED'});
    expect(storageSnapshot()).toBe(before);effects.assertNone();
  } finally {effects.restore();}
});
