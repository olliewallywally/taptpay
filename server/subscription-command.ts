import {randomUUID,createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {subscriptionPaymentEvents,paymentDeliveryOutbox} from '@shared/schema';
import {isUuid,requestFingerprint} from './durable-payment-contract';
import {paymentCommand,type PaymentCommandActor} from './payment-command';
export type SubscriptionCommandIntent={key:string;actor:PaymentCommandActor};
export class SubscriptionCommandConflict extends Error {readonly code='IDEMPOTENCY_CONFLICT';}
export function bindSubscriptionCommand(subscriptionId:number,merchantId:number,action:string,details:Record<string,unknown>,intent?:SubscriptionCommandIntent){
  const command=intent??{key:randomUUID(),actor:{service:'internal'} as PaymentCommandActor};
  if(!isUuid(command.key)||!Number.isSafeInteger(subscriptionId)||subscriptionId<1||!Number.isSafeInteger(merchantId)||merchantId<1)throw new Error('invalid_subscription_command');
  // Validate the existing bounded actor contract; no retail command is recorded.
  paymentCommand({domain:'retail',merchantId,aggregateId:subscriptionId,action:'cancel'},command.actor);
  return {subscriptionId,merchantId,key:command.key.toLowerCase(),actor:command.actor,action,
    fingerprint:requestFingerprint({domain:'subscription',subscriptionId,merchantId,action,details})};
}
export type BoundSubscriptionCommand=ReturnType<typeof bindSubscriptionCommand>;
/** The caller holds the concrete subscription lock throughout read/write. */
export async function readSubscriptionCommand(tx:any,command:BoundSubscriptionCommand){
  const [prior]=await tx.select().from(subscriptionPaymentEvents).where(and(eq(subscriptionPaymentEvents.subscriptionId,command.subscriptionId),
    eq(subscriptionPaymentEvents.merchantId,command.merchantId),eq(subscriptionPaymentEvents.idempotencyKey,command.key))).limit(1);
  if(prior&&prior.requestFingerprint!==command.fingerprint)throw new SubscriptionCommandConflict();return prior;
}
export async function recordSubscriptionCommand(tx:any,command:BoundSubscriptionCommand,eventType:string,payload:Record<string,unknown>,now:Date){
  const [event]=await tx.insert(subscriptionPaymentEvents).values({subscriptionId:command.subscriptionId,merchantId:command.merchantId,
    idempotencyKey:command.key,requestFingerprint:command.fingerprint,eventType,payload:{...payload,source:'subscription_command',action:command.action,actor:command.actor},createdAt:now}).returning();
  await tx.insert(paymentDeliveryOutbox).values({subscriptionEventId:event.id,channel:'merchant_payment_update',nextAttemptAt:now});
}
export function subscriptionExpiryKey(id:number,end:Date){
  const hex=createHash('sha256').update(`taptpay/subscription-expiry/v1/${id}/${end.toISOString()}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
