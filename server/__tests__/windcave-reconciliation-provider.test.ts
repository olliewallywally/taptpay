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
  ['account',{username:'other'}],['session',{sessionId:'other'}],
] as const)('%s mismatch never produces money evidence and names its field',async(field,patch)=>{
  const {provider}=setup(body({transactions:[{...transaction,...patch}]}));
  expect(await provider.query(expected)).toEqual({kind:'mismatch',field});
});
test('an authorised non-purchase is R2-ambiguous: retried, never settled',async()=>{
  const {provider}=setup(body({transactions:[{...transaction,type:'refund'}]}));
  expect(await provider.query(expected)).toEqual({kind:'unknown'});
});
// Owner decision OI-2 (2026-10-13): more than one card attempt in a session is not an error.
test.each([
  ['declined then approved',[{...transaction,id:'transaction-B',authorised:false},transaction]],
  ['approved then declined',[transaction,{...transaction,id:'transaction-B',authorised:false}]],
] as const)('a session with %s settles as approved on the authorised transaction',async(_name,transactions)=>{
  const {provider}=setup(body({transactions}));
  expect(await provider.query(expected)).toEqual({...expected,kind:'verified',outcome:'approved',transactionId:'transaction-A',transactionCount:2});
});
test('several declines settle as declined on a transaction chosen independently of reply order',async()=>{
  const declines=[{...transaction,id:'transaction-1',authorised:false},{...transaction,id:'transaction-2',authorised:false}];
  for(const transactions of [declines,[...declines].reverse()]) {
    const {provider}=setup(body({transactions}));
    expect(await provider.query(expected)).toEqual({...expected,kind:'verified',outcome:'declined',transactionId:'transaction-2',transactionCount:2});
  }
});
test('two approvals in one session stay ambiguous: retried, never settled',async()=>{
  const {provider}=setup(body({transactions:[transaction,{...transaction,id:'transaction-B'}]}));
  expect(await provider.query(expected)).toEqual({kind:'unknown'});
});
test('every transaction must match: an extra decline for another amount is an amount mismatch',async()=>{
  const {provider}=setup(body({transactions:[transaction,{...transaction,id:'transaction-B',authorised:false,amount:'10.00'}]}));
  expect(await provider.query(expected)).toEqual({kind:'mismatch',field:'amount'});
});
test('a transaction ID unsafe to store is retried as unverifiable, not settled',async()=>{
  const {provider}=setup(body({transactions:[{...transaction,id:'tx/1'}]}));
  expect(await provider.query(expected)).toEqual({kind:'unknown'});
});
test.each([{transactions:[]},{state:'init'},{transactions:[{authorised:true}]},{id:'other'}])('incomplete, missing or malformed replies do not settle: %p',async patch=>{
  const {provider}=setup(body(patch));expect((await provider.query(expected)).kind).not.toBe('verified');
});
test.each([[{environment:'production' as const},'environment'],[{providerAccount:'other'},'account']] as const)('persisted environment/account mismatch refuses before querying: %p',async(patch,field)=>{
  const {provider,querySession}=setup(body());expect(await provider.query({...expected,...patch})).toEqual({kind:'mismatch',field});expect(querySession).not.toHaveBeenCalled();
});
test('boolean-only approval cannot bypass R2 parsing',async()=>{
  const {provider}=setup({success:true,approved:true});expect(await provider.query(expected)).toEqual({kind:'unknown'});
});
