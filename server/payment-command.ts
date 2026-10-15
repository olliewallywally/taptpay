import { createHash } from 'node:crypto';
import { requestFingerprint } from './durable-payment-contract';

export type PaymentCommandActor =
  | { userId: number; role: 'owner' | 'member' | 'admin'; requestId?: string }
  | {service:'api_key';keyId:number}
  | { service: 'internal' | 'public_checkout' };

/** Cancel/void/external-payment commands have one lifetime intent per concrete
 * aggregate. The event's primary key supplies uniqueness without a second,
 * unvalidated aggregate registry. Changing an external reference conflicts. */
export function paymentCommand(input: {
  domain: 'retail' | 'property' | 'trades'; merchantId: number; aggregateId: number | string;
  action: 'cancel' | 'void' | 'manualPaid' | 'split' | 'quoteResponse' | 'quoteBlocked' | 'quoteExpire' | 'quoteView' | 'balance'; reference?: string;
}, actor: PaymentCommandActor = { service: 'internal' }) {
  if ('userId' in actor) {
    if (!Number.isSafeInteger(actor.userId) || actor.userId < 1 ||
      !['owner', 'member', 'admin'].includes(actor.role) ||
      (actor.requestId !== undefined && !/^[A-Za-z0-9._:-]{1,100}$/.test(actor.requestId))) {
      throw new Error('invalid_payment_command_actor');
    }
  } else if (actor.service==='api_key') {
    if(!Number.isSafeInteger(actor.keyId)||actor.keyId<1)throw new Error('invalid_payment_command_actor');
  } else if (!['internal', 'public_checkout'].includes(actor.service)) {
    throw new Error('invalid_payment_command_actor');
  }
  if (input.reference !== undefined && (typeof input.reference !== 'string' || input.reference.length > 200)) {
    throw new Error('invalid_payment_command_reference');
  }
  const identity = { domain: input.domain, merchantId: input.merchantId,
    aggregateId: input.aggregateId, action: input.action };
  const digest = createHash('sha256').update(`taptpay/payment-command/v1/${JSON.stringify(identity)}`).digest('hex');
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const fingerprint = requestFingerprint({ ...identity, reference: input.reference ?? null });
  return { id, fingerprint, payload: { source: 'manual_command', action: input.action,
    requestFingerprint: fingerprint, actor, ...(input.reference !== undefined ? { externalPaymentReference: input.reference } : {}) } };
}
