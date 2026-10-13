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
  try {const retry=await send(key);expect(retry.status).toBe(200);expect(retry.body).toEqual(first.body);expect(storageSnapshot()).toBe(before);effects.assertNone();}
  finally {effects.restore();}
});
test('same key with changed money conflicts without mutation or communication',async()=>{
  const {send}=await setup();const key=randomUUID();expect((await send(key)).status).toBe(200);
  const before=storageSnapshot(),effects=observeRefusalEffects();
  try {const changed=await send(key,{price:'10.02'});expect(changed.status).toBe(409);expect(changed.body.code).toBe('IDEMPOTENCY_CONFLICT');expect(storageSnapshot()).toBe(before);effects.assertNone();}
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
// Merge of R2 and R3 (2026-10-13): the recorder names its business explicitly, and refuses an
// input that names another one before anything is written (R1-T7 S5's rule for *ForMerchant writes).
test('the cash recorder refuses an input naming another business, writing nothing',async()=>{
  const owner=await createOwnerPrincipal(),other=await createOwnerPrincipal();
  const input={merchantId:other.merchantId,itemName:'Synthetic cash',price:'10.01',idempotencyKey:randomUUID(),actor:{userId:1,role:'owner' as const}};
  const before=storageSnapshot();
  await expect(storage.recordCashSaleForMerchant(owner.merchantId,input)).rejects.toThrow();
  expect(storageSnapshot()).toBe(before);
});
