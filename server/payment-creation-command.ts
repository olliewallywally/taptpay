import {createHmac} from 'node:crypto';
import {sql,and,eq} from 'drizzle-orm';
import {paymentCreationCommands} from '@shared/schema';
import {isUuid,requestFingerprint} from './durable-payment-contract';
import {hashBearerCredential} from './payment-credential';
import {paymentCommand,type PaymentCommandActor} from './payment-command';
export type CreationCommandIntent={key:string;actor:PaymentCommandActor;source?:'merchant'|'api_v1'};
export class CreationCommandConflict extends Error {readonly code='IDEMPOTENCY_CONFLICT';}
export class CreationCredentialUnavailable extends Error {readonly code='CREATE_REPLAY_CREDENTIAL_UNAVAILABLE';}
export function deriveRetailCreationCredential(merchantId:number,key:string,secret:string){
  if(!Number.isSafeInteger(merchantId)||merchantId<1||!isUuid(key)||secret.length<32)throw new Error('creation_credential_unavailable');
  const rawToken=createHmac('sha256',secret).update(`taptpay/retail-create/v1/${merchantId}/${key.toLowerCase()}`).digest('base64url');
  return {rawToken,hash:hashBearerCredential(rawToken)};
}
export function bindCreationCommand(domain:'retail'|'property'|'trades',merchantId:number,input:Record<string,unknown>,intent:CreationCommandIntent){
  if(!isUuid(intent.key)||!Number.isSafeInteger(merchantId)||merchantId<1)throw new Error('invalid_creation_command');
  // Reuse the established bounded actor validation. Raw credentials and their
  // generated hash are not request fields and cannot change the intent.
  paymentCommand({domain:domain==='retail'?'retail':domain,merchantId,aggregateId:1,action:'split'},intent.actor);
  const {paymentTokenHash,...request}=input;
  const normalized=JSON.parse(JSON.stringify(request));
  return {merchantId,key:intent.key.toLowerCase(),actor:intent.actor,
    fingerprint:requestFingerprint({domain,merchantId,source:intent.source??'merchant',input:normalized,privateLink:!!paymentTokenHash})};
}
export type BoundCreationCommand=ReturnType<typeof bindCreationCommand>;
export async function readCreationCommand(tx:any,command:BoundCreationCommand){
  await tx.execute(sql`SET LOCAL lock_timeout='2s'`);await tx.execute(sql`SET LOCAL statement_timeout='5s'`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`taptpay/create/${command.merchantId}/${command.key}`},0))`);
  const [prior]=await tx.select().from(paymentCreationCommands).where(and(eq(paymentCreationCommands.merchantId,command.merchantId),eq(paymentCreationCommands.idempotencyKey,command.key))).limit(1);
  if(prior&&prior.requestFingerprint!==command.fingerprint)throw new CreationCommandConflict();
  return prior as typeof paymentCreationCommands.$inferSelect|undefined;
}
export async function recordCreationCommand(tx:any,command:BoundCreationCommand,source:{transactionId:number}|{rentInvoiceId:string}|{jobInvoiceId:string}){
  const [record]=await tx.insert(paymentCreationCommands).values({merchantId:command.merchantId,idempotencyKey:command.key,
    requestFingerprint:command.fingerprint,actor:command.actor,...source}).returning();
  return record as typeof paymentCreationCommands.$inferSelect;
}
