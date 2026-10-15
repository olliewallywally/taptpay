import './support/test-env';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createOwnerPrincipal,createTestApp,resetTestStorage,signedIn,storage,storageSnapshot} from './support/http-harness';
import {observeRefusalEffects} from './support/refusal-effects';
beforeEach(()=>resetTestStorage());afterEach(()=>jest.restoreAllMocks());
async function setup() {
  const {app}=await createTestApp();const owner=await createOwnerPrincipal();
  jest.spyOn(storage,'getOrCreateSubscription').mockResolvedValue({status:'active',lastBillingDate:new Date(),currentPeriodEnd:new Date(Date.now()+86400000)} as any);
  const body={merchantId:owner.merchantId,itemName:'Synthetic cash',price:'10.01'};
  const send=(key?:string,patch:Record<string,unknown>={})=>{
    const req=request(app).post('/api/transactions/cash-sale').set(signedIn(owner));
    if(key)req.set('Idempotency-Key',key);return req.send({...body,...patch});
  };
  return {send,body};
}
test('a lost-response retry reuses the recorded cash sale and communicates nothing again',async()=>{
  const {send}=await setup();const key=randomUUID(),first=await send(key);expect(first.status).toBe(200);
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {const retry=await send(key);expect(retry.status).toBe(200);expect(retry.body.transaction).toEqual(first.body.transaction);expect(retry.body.replayed).toBe(true);expect(storageSnapshot()).toBe(before);effects.assertNone();}
  finally {effects.restore();}
});
test('same key with changed money conflicts without mutation or communication',async()=>{
  const {send}=await setup();const key=randomUUID();expect((await send(key)).status).toBe(200);
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {const changed=await send(key,{price:'10.02'});expect(changed.status).toBe(409);expect(changed.body.code).toBe('IDEMPOTENCY_CONFLICT');expect(changed.body.transaction).toMatchObject({price:'10.01',paymentMethod:'cash'});expect(changed.body.transaction).not.toHaveProperty('cashRequestFingerprint');expect(storageSnapshot()).toBe(before);effects.assertNone();}
  finally {effects.restore();}
});
test('concurrent copies of one command create one completed manual record',async()=>{
  const {send}=await setup();const key=randomUUID(),responses=await Promise.all([send(key),send(key),send(key)]);
  expect(responses.every(r=>r.status===200)).toBe(true);expect(new Set(responses.map(r=>r.body.transaction.id)).size).toBe(1);
  expect(responses[0].body.transaction).toMatchObject({paymentMethod:'cash',status:'completed',windcaveTransactionId:null});
  expect(responses[0].body.transaction).not.toHaveProperty('cashIdempotencyKey');expect(responses[0].body.transaction).not.toHaveProperty('cashRequestFingerprint');
});
test.each([undefined,'invalid'])('missing or malformed key refuses before recording: %p',async key=>{
  const {send}=await setup();const before=storageSnapshot(),effects=observeRefusalEffects();
  try {const result=await send(key);expect(result.status).toBe(400);expect(result.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');expect(storageSnapshot()).toBe(before);effects.assertNone();}
  finally {effects.restore();}
});
// R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md): carried from the
// R2/R3 merge. The recorder refuses an input naming another business before anything is written.
test('the cash recorder refuses an input naming another business, writing nothing',async()=>{
  const owner=await createOwnerPrincipal(),other=await createOwnerPrincipal();
  const input={merchantId:other.merchantId,itemName:'Synthetic cash',price:'10.01',idempotencyKey:randomUUID(),actor:{userId:1,role:'owner' as const}};
  const before=storageSnapshot();
  await expect(storage.recordCashSaleForMerchant(owner.merchantId,input)).rejects.toThrow();
  expect(storageSnapshot()).toBe(before);
});
// In memory as in PostgreSQL (whose event foreign key refuses it): a business with a cash sale is not deleted,
// and its audit and outbox entries are never orphaned.
test('a business with a recorded cash sale is not deleted',async()=>{
  const owner=await createOwnerPrincipal();
  await storage.recordCashSaleForMerchant(owner.merchantId,{merchantId:owner.merchantId,itemName:'Synthetic cash',price:'10.01',idempotencyKey:randomUUID(),actor:{userId:1,role:'owner'}});
  expect(await storage.deleteMerchant(owner.merchantId)).toBe(false);
  expect(await storage.getMerchant(owner.merchantId)).toBeDefined();
});
// A failed cash write logs its class (a SQLSTATE or a missing audit row) so an operator can tell a lock
// timeout from an integrity refusal, and never a value from the error.
test.each([
  [Object.assign(new Error('synthetic detail SECRET-VALUE'),{code:'55P03'}),'55P03'],
  [new Error('cash_audit_missing'),'cash_audit_missing'],
  [new Error('synthetic detail SECRET-VALUE'),'unclassified'],
])('a failed cash write logs only its class: %#',async(error,logged)=>{
  const {send}=await setup();
  jest.spyOn(storage,'recordCashSaleForMerchant').mockRejectedValue(error);
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  const result=await send(randomUUID());expect(result.status).toBe(500);
  expect(log).toHaveBeenCalledWith('[CASH_COMMAND_FAILED]',logged);
  expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET-VALUE');
});
