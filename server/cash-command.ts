import {cashSaleRequestSchema,type Transaction} from '@shared/schema';
import {isUuid,requestFingerprint} from './durable-payment-contract';
export interface CashCommandInput {
  merchantId:number;itemName:string;price:string;stoneId?:number|null;idempotencyKey:string;
  actor:{userId:number;role:'owner'|'member'|'admin';requestId?:string};
}
export type CashCommandResult={kind:'recorded'|'reused';transaction:Transaction;eventId:string}
  |{kind:'conflict'}|{kind:'not-found'};
export class CashCommandInputError extends Error {constructor(){super('invalid_cash_command');}}
export function canonicalCashCommand(input:CashCommandInput) {
  const parsed=cashSaleRequestSchema.safeParse({merchantId:input.merchantId,itemName:input.itemName,price:input.price,stoneId:input.stoneId});
  if(!parsed.success || !isUuid(input.idempotencyKey) || !Number.isSafeInteger(input.actor.userId) || input.actor.userId<1 ||
    !['owner','member','admin'].includes(input.actor.role) ||
    (input.actor.requestId!==undefined && !/^[A-Za-z0-9._:-]{1,100}$/.test(input.actor.requestId))) throw new CashCommandInputError();
  const {merchantId,itemName,stoneId}=parsed.data;
  if(merchantId>2147483647 || (stoneId!==null && stoneId!==undefined && stoneId>2147483647)) throw new CashCommandInputError();
  const [whole,fraction='']=parsed.data.price.split('.');
  const amountCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amountCents) || amountCents<1 || amountCents>9999999999) throw new CashCommandInputError();
  const price=`${Math.floor(amountCents/100)}.${String(amountCents%100).padStart(2,'0')}`;
  return {merchantId,itemName,stoneId:stoneId??null,price,amountCents,idempotencyKey:input.idempotencyKey.toLowerCase(),
    fingerprint:requestFingerprint({merchantId,itemName,stoneId:stoneId??null,amountCents,currency:'NZD'}),
    audit:{source:'manual_cash',amountCents,currency:'NZD',actor:{userId:input.actor.userId,role:input.actor.role,
      ...(input.actor.requestId!==undefined?{requestId:input.actor.requestId}:{})}}};
}
