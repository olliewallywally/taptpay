import {cashCommandKey,completeCashCommand} from '../cash-command-key';
const draft={merchantId:1,itemName:'Synthetic cash',price:'10.01'};
let sequence=0;
beforeEach(()=>{sequence=0;jest.spyOn(global.crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`);});
afterEach(()=>jest.restoreAllMocks());
function storage() {const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
test('failure and a new caller after reload reuse the same persisted UUID',()=>{
  const saved=storage(),key=cashCommandKey(draft,saved);expect(cashCommandKey({...draft},saved)).toBe(key);
  expect(key).toMatch(/^[0-9a-f-]{36}$/i);
});
test('editing after a failure retains the key for server fingerprint adjudication',()=>{
  const saved=storage(),key=cashCommandKey(draft,saved);expect(cashCommandKey({...draft,price:'10.02'},saved)).toBe(key);
});
test('confirmed success alone releases the key; the next identical sale is a new command',()=>{
  const saved=storage(),first=cashCommandKey(draft,saved);completeCashCommand(1,'wrong',saved);expect(cashCommandKey(draft,saved)).toBe(first);
  completeCashCommand(1,first,saved);expect(cashCommandKey(draft,saved)).not.toBe(first);
});
test('merchant namespaces cannot reuse another business command',()=>{
  const saved=storage();expect(cashCommandKey(draft,saved)).not.toBe(cashCommandKey({...draft,merchantId:2},saved));
});
test('storage failure occurs before a request could be sent',()=>{
  const saved=storage();saved.setItem=()=>{throw new Error('unavailable');};expect(()=>cashCommandKey(draft,saved)).toThrow('unavailable');
});
