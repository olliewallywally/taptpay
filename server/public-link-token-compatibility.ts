import { randomBytes } from 'node:crypto';
import { hashBearerCredential } from './payment-credential';

/** Expansion release: keep raw invoice/quote links for reminders, add lookup hashes.
 * Raw token retirement requires a later compatibility/retention review. */
export function mintPublicLinkToken() {
  const token=randomBytes(20).toString('base64url');
  return {token,tokenHash:hashBearerCredential(token)};
}
export function hashPublicLinkTokenData<T extends {token?:unknown}>(data:T) {
  if(typeof data.token!=='string' || !data.token.length || data.token.length>512) throw new Error('invalid_invoice_token');
  return {...data,tokenHash:hashBearerCredential(data.token)};
}
