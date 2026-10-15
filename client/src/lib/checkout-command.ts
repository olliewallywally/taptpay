import {getOrCreatePaymentIdempotencyKey,clearPaymentIdempotencyKey,bindPaymentIdempotencyKey,type CheckoutSource} from './payment-addressing';
import {apiErrorCode,apiErrorStatus} from './api-error';
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type CheckoutCommand={idempotencyKey:string;shareIndex:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slot=(source:CheckoutSource)=>`taptpay:checkout-command:v1:${source.kind}:${source.kind==='retail-legacy'?source.transactionId:source.token}`;
const confirmationSlot=(source:CheckoutSource)=>`${slot(source)}:confirmation`;
const invoiceIntentSlot=(source:CheckoutSource)=>`${slot(source)}:invoice-intent`;
export function releaseExpiredCheckoutCommand(source:CheckoutSource,command:CheckoutCommand,error:unknown,storage:StorageLike=window.sessionStorage):boolean {
  if(apiErrorStatus(error)!==409||apiErrorCode(error)!=='PAYMENT_ATTEMPT_EXPIRED')return false;
  const active=checkoutCommand(source,command.shareIndex,storage);
  if(active.idempotencyKey!==command.idempotencyKey||active.shareIndex!==command.shareIndex)return false;
  completeCheckoutCommand(source,command,storage);return true;
}
export function assignInvoiceShare(source:CheckoutSource,command:CheckoutCommand,shareIndex:number,storage:StorageLike=window.sessionStorage):CheckoutCommand {
  if(source.kind!=='invoice-token' || !Number.isInteger(shareIndex) || shareIndex<0 || shareIndex>12)throw new Error('Invalid invoice share assignment');
  const current=checkoutCommand(source,command.shareIndex,storage);
  if(current.idempotencyKey!==command.idempotencyKey)throw new Error('Invoice retry identity changed');
  if(current.shareIndex===shareIndex)return current;
  bindPaymentIdempotencyKey(source,current.shareIndex,shareIndex,current.idempotencyKey,storage);
  const assigned={...current,shareIndex};storage.setItem(slot(source),JSON.stringify(assigned));return assigned;
}
export function invoiceCheckoutEmail(source:CheckoutSource,command:CheckoutCommand,email:string,storage:StorageLike=window.sessionStorage):string|undefined {
  const saved=storage.getItem(invoiceIntentSlot(source));
  if(saved){const value=JSON.parse(saved);if(value.idempotencyKey!==command.idempotencyKey || (value.email!==null && typeof value.email!=='string'))throw new Error('Invoice retry state is invalid');return value.email??undefined;}
  const value=email.trim().toLowerCase()||null;storage.setItem(invoiceIntentSlot(source),JSON.stringify({idempotencyKey:command.idempotencyKey,email:value}));return value??undefined;
}
export function readInvoiceCheckoutIntent(source:CheckoutSource,storage:StorageLike=window.sessionStorage):(CheckoutCommand & {email:string|null})|undefined {
  const raw=storage.getItem(invoiceIntentSlot(source)),active=storage.getItem(slot(source));if(!raw || !active)return;
  try{const intent=JSON.parse(raw),command=JSON.parse(active);
    if(uuid.test(command.idempotencyKey) && Number.isInteger(command.shareIndex) && intent.idempotencyKey===command.idempotencyKey &&
      (intent.email===null || typeof intent.email==='string'))return {...command,email:intent.email};
  }catch{/* Keep the original attempt held. */}
  throw new Error('Invoice retry state is invalid. Reopen the original payment link.');
}
export type CheckoutConfirmation=CheckoutCommand & {returnState:string;sessionId?:string;submitted?:boolean};
export function rememberCheckoutConfirmation(source:CheckoutSource,command:CheckoutCommand,returnState:string,
  options:{sessionId?:string;submitted?:boolean}={},storage:StorageLike=window.sessionStorage):void {
  if(!/^[A-Za-z0-9_-]{43}$/.test(returnState))return;
  const saved=storage.getItem(slot(source));if(!saved)return;
  const active=JSON.parse(saved) as CheckoutCommand;
  if(active.idempotencyKey!==command.idempotencyKey || active.shareIndex!==command.shareIndex)return;
  if(options.sessionId!==undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(options.sessionId))throw new Error('Invalid payment session');
  storage.setItem(confirmationSlot(source),JSON.stringify({...command,returnState,...options}));
}
export function restoreCheckoutConfirmation(source:CheckoutSource,storage:StorageLike=window.sessionStorage):CheckoutConfirmation|undefined {
  const raw=storage.getItem(confirmationSlot(source)),active=storage.getItem(slot(source));if(!raw || !active)return;
  try {
    const value=JSON.parse(raw) as CheckoutConfirmation,command=JSON.parse(active) as CheckoutCommand;
    if(uuid.test(value.idempotencyKey) && Number.isInteger(value.shareIndex) && /^[A-Za-z0-9_-]{43}$/.test(value.returnState) &&
      value.idempotencyKey===command.idempotencyKey && value.shareIndex===command.shareIndex &&
      (value.sessionId===undefined || /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value.sessionId)) &&
      (value.submitted===undefined || typeof value.submitted==='boolean'))return value;
  }catch {/* The original command remains held and is never rotated. */}
  throw new Error('Payment confirmation state is invalid. Reopen the original payment link.');
}
/** Freeze the requested share as well as the key across resolve-count changes,
 * reloads and unknown outcomes. A confirmed terminal answer alone releases it. */
export function checkoutCommand(source:CheckoutSource,shareIndex:number,storage:StorageLike=window.sessionStorage):CheckoutCommand {
  const saved=storage.getItem(slot(source));
  if(saved!==null){
    let value:CheckoutCommand;
    try{value=JSON.parse(saved);if(!uuid.test(value.idempotencyKey)||!Number.isInteger(value.shareIndex)||value.shareIndex<0||value.shareIndex>12)throw new Error();}
    catch{throw new Error('Payment retry state is invalid. Reopen the original payment link.');}
    return value;
  }
  const value={idempotencyKey:getOrCreatePaymentIdempotencyKey(source,shareIndex,storage),shareIndex};
  if(!uuid.test(value.idempotencyKey))throw new Error('Payment retry identity is invalid');
  storage.setItem(slot(source),JSON.stringify(value));return value;
}
export function completeCheckoutCommand(source:CheckoutSource,command:CheckoutCommand,storage:StorageLike=window.sessionStorage):void {
  const saved=storage.getItem(slot(source));if(!saved)return;
  try{const value:CheckoutCommand=JSON.parse(saved);if(value.idempotencyKey!==command.idempotencyKey || value.shareIndex!==command.shareIndex)return;}
  catch{return;}
  clearPaymentIdempotencyKey(source,command.shareIndex,storage);storage.removeItem(slot(source));storage.removeItem(confirmationSlot(source));storage.removeItem(invoiceIntentSlot(source));
}
