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
test('owner cancellation cannot erase a live or expired unattached attempt',async()=>{
  const repo=new MemStorage();const {transaction,attempt}=await claimed(repo);
  for(const expires of [Date.now()+1000,Date.now()-1000]) {
    (repo as any).paymentAttempts.get(attempt.id).leaseExpiresAt=new Date(expires);
    await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'conflict',reason:'payment-active'});
    expect((await repo.getTransaction(transaction.id))?.status).toBe('pending');
  }
});
test.each(['windcaveSessionId','windcaveTransactionId','completedSplits'] as const)('cancellation holds recorded %s',async field=>{
  const repo=new MemStorage();const transaction=await repo.createTransaction({merchantId:11,itemName:'Synthetic',price:'10.00',status:'processing',paymentMethod:'qr_code',splitEnabled:false});
  (repo as any).transactions.get(transaction.id)[field]=field==='completedSplits'?1:'synthetic-bound';
  await expect(repo.cancelTransactionForMerchant(transaction.id,11)).resolves.toMatchObject({kind:'conflict',reason:'payment-active'});
  expect((await repo.getTransaction(transaction.id))?.status).toBe('processing');
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
  const engine=new PaymentAttemptService(storage);await engine.claim({transactionId:transaction.id,shareIndex:0,idempotencyKey:randomUUID()});
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {
    const result=await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(owner));
    expect(result.status).toBe(409);expect(result.body).toEqual({message:'Payment is in progress or a share is already paid',code:'PAYMENT_ACTIVE'});
    expect(storageSnapshot()).toBe(before);effects.assertNone();
  } finally {effects.restore();}
});
