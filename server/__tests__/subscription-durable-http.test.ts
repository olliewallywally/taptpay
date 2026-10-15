import './support/test-env';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app';
import {registerRoutes} from '../routes';
import {createGlobalErrorHandler} from '../http-error-handler';
import {createOwnerPrincipal,createMemberPrincipal,signedIn,resetTestStorage,storage,storageSnapshot} from './support/http-harness';
import {observeRefusalEffects} from './support/refusal-effects';

const card={canStart:jest.fn(()=>true),start:jest.fn(),confirm:jest.fn(),resolveReturnState:jest.fn()};
let app:ReturnType<typeof createApp>;
beforeAll(async()=>{app=createApp({writeRequestLog:()=>{}});await registerRoutes(app,{subscriptionPayments:{card,billing:{canInitiate:()=>true}} as any});app.use(createGlobalErrorHandler());});
beforeEach(()=>{resetTestStorage();jest.clearAllMocks();card.canStart.mockReturnValue(true);});
afterEach(()=>jest.restoreAllMocks());
test('a member cannot start or confirm a card and changes no storage or external state',async()=>{
  const owner=await createOwnerPrincipal(),member=await createMemberPrincipal(owner.merchantId),before=storageSnapshot(),effects=observeRefusalEffects();
  try{for(const route of ['/api/billing/card/session','/api/billing/card/confirm']){
    const result=await request(app).post(route).set(signedIn(member)).set('Idempotency-Key',randomUUID()).send({sessionId:'synthetic-session'});expect(result.status).toBe(403);
  }expect(card.start).not.toHaveBeenCalled();expect(card.confirm).not.toHaveBeenCalled();expect(storageSnapshot()).toBe(before);effects.assertNone();}finally{effects.restore();}
});
test('missing creation key refuses before subscription creation or provider I/O',async()=>{
  const owner=await createOwnerPrincipal(),before=storageSnapshot();
  const result=await request(app).post('/api/billing/card/session').set(signedIn(owner)).send({});
  expect(result.status).toBe(400);expect(card.start).not.toHaveBeenCalled();expect(storageSnapshot()).toBe(before);
});
test('creation carries the authenticated merchant, actor and exact UUID',async()=>{
  const owner=await createOwnerPrincipal(),key=randomUUID();card.start.mockResolvedValue({kind:'ready',sessionId:'synthetic-session',redirectUrl:'https://uat.windcave.com/synthetic'});
  const result=await request(app).post('/api/billing/card/session').set(signedIn(owner)).set('Idempotency-Key',key).send({});
  expect(result.status).toBe(200);expect(card.start).toHaveBeenCalledWith(expect.objectContaining({merchantId:owner.merchantId,idempotencyKey:key,actor:expect.objectContaining({userId:owner.user.id,role:'owner'})}));
  expect(result.body).not.toHaveProperty('returnState');
});
test('foreign confirmation stays scoped to the signed-in owner and cannot disclose another card',async()=>{
  const owner=await createOwnerPrincipal();card.confirm.mockResolvedValue(undefined);
  const result=await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'foreign-session'});
  expect(result.status).toBe(403);expect(card.confirm).toHaveBeenCalledWith(owner.merchantId,'foreign-session');expect(result.body).not.toHaveProperty('card');
});
test('pending activation returns processing; confirmed setup projects masked fields only',async()=>{
  const owner=await createOwnerPrincipal();const subscription=await storage.getOrCreateSubscription(owner.merchantId);
  card.confirm.mockResolvedValue({state:'approved',activation_state:'unknown',activation_applied_at:null});
  expect((await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'synthetic-session'})).status).toBe(202);
  jest.spyOn(storage,'getSubscription').mockResolvedValue({...subscription,status:'active',lastBillingDate:new Date().toISOString(),currentPeriodEnd:new Date(Date.now()+86400000),windcaveCardId:'private-card-token',cardLast4:'4242',cardBrand:'Visa',cardExpiry:'12/31'} as any);
  card.confirm.mockResolvedValue({state:'approved',activation_state:'approved',activation_applied_at:new Date()});
  const result=await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'synthetic-session'});
  expect(result.status).toBe(200);expect(result.body.card).toEqual({last4:'4242',brand:'Visa',expiry:'12/31'});
  expect(JSON.stringify(result.body)).not.toContain('private-card-token');
});
test('a forged browser outcome cannot confirm without valid stored return state',async()=>{
  card.resolveReturnState.mockResolvedValue(undefined);
  const result=await request(app).get('/api/billing/card/callback').query({state:'x'.repeat(43),result:'approved',sessionId:'foreign'});
  expect(result.status).toBe(404);expect(card.confirm).not.toHaveBeenCalled();expect(result.headers.location).toBeUndefined();
});
test('verified setup cancelled before activation returns a terminal scoped cancellation',async()=>{
  const owner=await createOwnerPrincipal();card.confirm.mockResolvedValue({state:'approved',activation_suppressed:true});
  const result=await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'cancelled-session'});
  expect(result.status).toBe(409);expect(result.body).toMatchObject({code:'CARD_SETUP_CANCELLED',terminal:true});
  expect(result.body).not.toHaveProperty('card');expect(result.body).not.toHaveProperty('success');
});
test('a removed or replaced method returns a terminal superseded setup without card disclosure',async()=>{
  const owner=await createOwnerPrincipal();card.confirm.mockResolvedValue({state:'approved',payment_method_superseded:true});
  const result=await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'old-session'});
  expect(result.status).toBe(409);expect(result.body).toMatchObject({code:'CARD_SETUP_SUPERSEDED',terminal:true});expect(result.body).not.toHaveProperty('card');
});
test.each([{activation_required:'false'},{activation_satisfied:true}])('verified setup with satisfied activation returns the masked method without inventing a charge: %j',async resolution=>{
  const owner=await createOwnerPrincipal();await storage.getOrCreateSubscription(owner.merchantId);
  card.confirm.mockResolvedValue({state:'approved',...resolution});
  const result=await request(app).post('/api/billing/card/confirm').set(signedIn(owner)).send({sessionId:'setup-session'});
  expect(result.status).toBe(200);expect(result.body.success).toBe(true);expect(result.body).not.toHaveProperty('windcaveCardId');
});
test('all manual subscription commands require the owner and a UUID before mutation',async()=>{
  const owner=await createOwnerPrincipal(),member=await createMemberPrincipal(owner.merchantId);
  for(const [method,path,body] of [['put','/api/subscription/plan',{planId:'team'}],['post','/api/subscription/cancel',{reason:'Synthetic reason'}],['post','/api/subscription/resume',{}],['delete','/api/billing/card',{}]] as const){
    const before=storageSnapshot();
    const foreign=await (request(app) as any)[method](path).set(signedIn(member)).set('Idempotency-Key',randomUUID()).send(body);expect(foreign.status).toBe(403);expect(storageSnapshot()).toBe(before);
    const missing=await (request(app) as any)[method](path).set(signedIn(owner)).send(body);expect(missing.status).toBe(400);expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');expect(storageSnapshot()).toBe(before);
  }
});
