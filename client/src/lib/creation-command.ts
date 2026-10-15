import {apiPath} from '@shared/api-path';
import {createOperationUuid} from './payment-addressing';
import {heldSession,sessionFetch} from './session';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isCreationRequest=(url:string,method?:string)=>method?.toUpperCase()==='POST'&&(url===apiPath('POST /api/transactions')||url===apiPath('POST /api/property/invoices')||url===apiPath('POST /api/trades/invoices'));
export const isSubscriptionCommandRequest=(url:string,method?:string)=>({
  [apiPath('PUT /api/subscription/plan')]:'PUT',[apiPath('POST /api/subscription/cancel')]:'POST',[apiPath('POST /api/subscription/resume')]:'POST',[apiPath('DELETE /api/billing/card')]:'DELETE',
} as Record<string,string>)[url]===method?.toUpperCase();
/** Persist before sending. Unknown responses and changed drafts retain the key;
 * the server's fingerprint decides whether a retry matches. Only an identified
 * created entity releases it. Store no customer body or payment credential. */
export async function creationFetch(url:string,init:RequestInit={},merchantId?:number,
  transport:(url:string,init:RequestInit)=>Promise<Response>=sessionFetch):Promise<Response>{
  const subscription=isSubscriptionCommandRequest(url,init.method);
  if(!isCreationRequest(url,init.method)&&!subscription)return transport(url,init);
  const body=typeof init.body==='string'?JSON.parse(init.body):subscription?{}:undefined;
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('A bill creation request is required');
  const owner=merchantId??heldSession('business')?.user.merchantId??body.merchantId??'session';
  const slot=`taptpay:creation-command:v1:${owner}:${url}`,headers=new Headers(init.headers),provided=headers.get('Idempotency-Key');
  let saved:{key:string;dueAt?:string};const value=sessionStorage.getItem(slot);
  if(value){try{saved=JSON.parse(value);if(!uuid.test(saved.key)||(provided&&provided.toLowerCase()!==saved.key.toLowerCase()))throw new Error();}
    catch{throw new Error('Your original bill request needs confirmation. Keep the original request.');}}
  else{const key=provided??createOperationUuid();if(!uuid.test(key))throw new Error('Secure bill request identity is unavailable');
    saved={key,...(url!==apiPath('POST /api/transactions')&&typeof body.dueAt==='string'?{dueAt:body.dueAt}:{})};sessionStorage.setItem(slot,JSON.stringify(saved));}
  // These retained invoice forms choose seven days automatically. A retry on a
  // later day retains that original date rather than changing its fingerprint.
  if(saved.dueAt)body.dueAt=saved.dueAt;
  headers.set('Idempotency-Key',saved.key);
  const response=await transport(url,{...init,headers,body:JSON.stringify(body)});
  if(subscription&&response.status===422){
    // A verified bank decline terminates this command; an unknown charge does not.
    const current=sessionStorage.getItem(slot);if(current&&JSON.parse(current).key===saved.key)sessionStorage.removeItem(slot);
    return response;
  }
  if(!response.ok)return response;
  const result=await response.json();
  const id=subscription?result?.subscription?.id:result?.id;
  if(!result||!((Number.isSafeInteger(id)&&id>0)||(typeof id==='string'&&id.length>0&&id.length<=200)||(subscription&&url===apiPath('DELETE /api/billing/card')&&result.success===true)))
    throw new Error('Your original bill request is still being confirmed. Retry with the same details.');
  // A concurrent response must not clear a newer command in this slot.
  const current=sessionStorage.getItem(slot);if(current){try{if(JSON.parse(current).key===saved.key)sessionStorage.removeItem(slot);}catch{/* Preserve corrupt/unknown state. */}}
  // Read once before releasing; callers can consume the same decoded create
  // response without losing recovery if its network body was incomplete.
  return new Proxy(response,{get(target,key){if(key==='json')return async()=>result;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
