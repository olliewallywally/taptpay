import {creationFetch} from '../creation-command';
beforeEach(()=>sessionStorage.clear());
const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents:100,dueAt:'2026-10-13T00:00:00Z'})};
test('a lost response preserves the UUID and original automatically chosen due date across retry',async()=>{
  const calls:RequestInit[]=[],transport=jest.fn(async(_url:string,options:RequestInit)=>{calls.push(options);if(calls.length===1)throw Error('lost');return {ok:true,status:201,json:async()=>({id:'11111111-1111-4111-8111-111111111111'})} as Response;});
  await expect(creationFetch('/api/property/invoices',init,7,transport)).rejects.toThrow('lost');
  const retry=await creationFetch('/api/property/invoices',{...init,body:JSON.stringify({amountCents:100,dueAt:'2026-10-14T00:00:00Z'})},7,transport);
  expect(new Headers(calls[0].headers).get('Idempotency-Key')).toBe(new Headers(calls[1].headers).get('Idempotency-Key'));
  expect(calls[1].body).toBe(calls[0].body);expect((await retry.json()).id).toBeDefined();
  await creationFetch('/api/property/invoices',init,7,transport);
  expect(new Headers(calls[2].headers).get('Idempotency-Key')).not.toBe(new Headers(calls[0].headers).get('Idempotency-Key'));
});
test('a failed or malformed successful response cannot release an unknown creation command',async()=>{
  const calls:RequestInit[]=[],transport=jest.fn(async(_url:string,options:RequestInit)=>{calls.push(options);return {ok:true,status:200,json:async()=>({})} as Response;});
  await expect(creationFetch('/api/trades/invoices',init,7,transport)).rejects.toThrow();
  await expect(creationFetch('/api/trades/invoices',init,7,transport)).rejects.toThrow();
  expect(new Headers(calls[0].headers).get('Idempotency-Key')).toBe(new Headers(calls[1].headers).get('Idempotency-Key'));
});
test('commands are scoped to the signed-in merchant and storage holds no customer body',async()=>{
  const keys:string[]=[],transport=jest.fn(async(_url:string,options:RequestInit)=>{keys.push(new Headers(options.headers).get('Idempotency-Key')!);throw Error('lost');});
  await expect(creationFetch('/api/trades/invoices',{...init,body:JSON.stringify({amountCents:100,recipient:{email:'private@synthetic.test'}})},7,transport)).rejects.toThrow();
  await expect(creationFetch('/api/trades/invoices',init,8,transport)).rejects.toThrow();expect(keys[0]).not.toBe(keys[1]);
  const saved=Array.from({length:sessionStorage.length},(_,index)=>sessionStorage.getItem(sessionStorage.key(index)!));
  expect(saved).toHaveLength(2);for(const value of saved)expect(value).not.toContain('private@synthetic.test');
});
test('subscription commands retain unknown outcomes and release only identified success or verified decline',async()=>{
  const keys:string[]=[],transport=jest.fn(async(_url:string,options:RequestInit)=>{keys.push(new Headers(options.headers).get('Idempotency-Key')!);return {ok:false,status:502} as Response;});
  const plan={method:'PUT',body:JSON.stringify({planId:'team'})};await creationFetch('/api/subscription/plan',plan,7,transport);await creationFetch('/api/subscription/plan',plan,7,transport);expect(keys[0]).toBe(keys[1]);
  transport.mockImplementation(async(_url,options)=>{keys.push(new Headers(options.headers).get('Idempotency-Key')!);return {ok:false,status:422} as Response;});
  await creationFetch('/api/subscription/plan',plan,7,transport);
  transport.mockImplementation(async(_url,options)=>{keys.push(new Headers(options.headers).get('Idempotency-Key')!);return {ok:true,status:200,json:async()=>({subscription:{id:42}})} as Response;});
  await creationFetch('/api/subscription/plan',plan,7,transport);expect(keys[3]).not.toBe(keys[0]);
  const remove=jest.fn(async(_url:string,options:RequestInit)=>({ok:true,status:200,json:async()=>({success:true})} as Response));
  await creationFetch('/api/billing/card',{method:'DELETE'},7,remove);expect(new Headers(remove.mock.calls[0][1].headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
});
