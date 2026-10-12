import {createWindcaveReconciliationProvider} from '../windcave-reconciliation-provider';
const expected={sessionId:'session-A',processorXId:'persisted-xid',amountCents:1001,currency:'NZD',reference:'invoice-share-A',environment:'uat' as const,providerAccount:'synthetic-account'};
const context={providerEnvironment:'uat' as const,accountUsername:'synthetic-account'};
const transaction={id:'transaction-A',authorised:true,type:'purchase',amount:'10.01',currency:'NZD',merchantReference:'invoice-share-A',sessionId:'session-A',username:'synthetic-account'};
const body=(changes:Record<string,unknown>={})=>({id:'session-A',state:'complete',transactions:[transaction],...changes});
function setup(value:unknown) {
  const querySession=jest.fn(async()=>({kind:'reply' as const,body:value}));
  return {querySession,provider:createWindcaveReconciliationProvider({querySession},context)};
}
test.each([true,false])('R2-normalized and verified purchase (authorised=%s) produces one exact outcome',async(authorised)=>{
  const {provider}=setup(body({transactions:[{...transaction,authorised}]}));
  expect(await provider.query(expected)).toEqual({...expected,kind:'verified',outcome:authorised?'approved':'declined',transactionId:'transaction-A',transactionCount:1});
});
test.each([
  ['amount',{amount:'10.00'}],['currency',{currency:'AUD'}],['reference',{merchantReference:'other'}],
  ['account',{username:'other'}],['session',{sessionId:'other'}],['type',{type:'refund'}],
] as const)('%s mismatch never produces money evidence',async(_name,patch)=>{
  const {provider}=setup(body({transactions:[{...transaction,...patch}]}));
  expect((await provider.query(expected)).kind).not.toBe('verified');
});
test('a complete session with one approval plus another decline stays ambiguous for R3',async()=>{
  const {provider}=setup(body({transactions:[transaction,{...transaction,id:'transaction-B',authorised:false}]}));
  expect(await provider.query(expected)).toEqual({kind:'mismatch'});
});
test.each([{transactions:[]},{state:'init'},{transactions:[{authorised:true}]},{id:'other'}])('incomplete, missing or malformed replies do not settle: %p',async patch=>{
  const {provider}=setup(body(patch));expect((await provider.query(expected)).kind).not.toBe('verified');
});
test.each([{environment:'production' as const},{providerAccount:'other'}])('persisted environment/account mismatch refuses before querying: %p',async patch=>{
  const {provider,querySession}=setup(body());expect(await provider.query({...expected,...patch})).toEqual({kind:'mismatch'});expect(querySession).not.toHaveBeenCalled();
});
test('boolean-only approval cannot bypass R2 parsing',async()=>{
  const {provider}=setup({success:true,approved:true});expect(await provider.query(expected)).toEqual({kind:'unknown'});
});
