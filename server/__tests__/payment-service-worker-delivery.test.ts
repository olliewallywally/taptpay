import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('client/public/sw.js','utf8');
function device(){
  const records=new Map<string,any>(),show=jest.fn(async()=>undefined);
  const indexedDB={open:()=>{const request:any={};queueMicrotask(()=>{
    request.result={createObjectStore:()=>{},close:()=>{},transaction:()=>{
      const tx:any={objectStore:()=>({add:(row:any)=>queueMicrotask(()=>{if(records.has(row.id))tx.onabort?.();else{records.set(row.id,row);tx.oncomplete?.();}}),
        openCursor:()=>{const cursor:any={};queueMicrotask(()=>{cursor.result=null;cursor.onsuccess?.();});return cursor;}})};return tx;}};
    request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
  const worker=()=>{const handlers=new Map<string,(event:any)=>void>();vm.runInNewContext(source,{self:{addEventListener:(name:string,handler:any)=>handlers.set(name,handler),registration:{showNotification:show}},indexedDB,Date,Promise});
    return async(id:string)=>{let result:Promise<void>|undefined;handlers.get('push')!({data:{json:()=>({title:'Synthetic payment',data:{eventId:id}})},waitUntil:(promise:Promise<void>)=>{result=promise;}});await result;};};
  return {worker,show};
}
test('concurrent push copies and a restarted worker display one financial event',async()=>{
  const d=device(),first=d.worker(),id='11111111-1111-4111-8111-111111111111';
  await Promise.all([first(id),first(id)]);await d.worker()(id);expect(d.show).toHaveBeenCalledTimes(1);
  await first('22222222-2222-4222-8222-222222222222');expect(d.show).toHaveBeenCalledTimes(2);
});
test('an uncertain display is retained without replaying a success notification',async()=>{
  const d=device(),push=d.worker(),id='33333333-3333-4333-8333-333333333333';d.show.mockRejectedValueOnce(new Error('Synthetic display uncertainty'));
  await expect(push(id)).rejects.toThrow('Synthetic');await d.worker()(id);expect(d.show).toHaveBeenCalledTimes(1);
});
