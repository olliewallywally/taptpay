import { randomBytes, randomUUID } from 'node:crypto';
import { hashBearerCredential } from './payment-credential';
import type { DataEncryption } from './data-encryption';
import { sealActiveSecret, type LinkSecretTable } from './active-secret-vault';

/** Keep the original capability in memory and its stable hash for lookups;
 * encrypted writers store an ID-bound envelope in the recoverable column. */
export function mintPublicLinkToken(
  table?: LinkSecretTable,
  encryption?: DataEncryption
) {
  const token = randomBytes(20).toString('base64url');
  if (table && encryption?.writesEncrypted()) {
    const id = randomUUID();
    return {
      id,
      token: sealActiveSecret(table, id, token, encryption)!,
      tokenHash: hashBearerCredential(token),
    };
  }
  return { token, tokenHash: hashBearerCredential(token) };
}
export function hashPublicLinkTokenData<
  T extends { token?: unknown; id?: unknown },
>(data: T, table?: LinkSecretTable, encryption?: DataEncryption) {
  if (
    typeof data.token !== 'string' ||
    !data.token.length ||
    data.token.length > 512
  )
    throw new Error('invalid_invoice_token');
  const tokenHash = hashBearerCredential(data.token);
  if (table && encryption?.writesEncrypted()) {
    const id = typeof data.id === 'string' ? data.id : randomUUID();
    return {
      ...data,
      id,
      token: sealActiveSecret(table, id, data.token, encryption)!,
      tokenHash,
    };
  }
  return { ...data, tokenHash };
}

/** Omitted capabilities stay untouched. A supplied replacement must remain
 * bound to this row and gets a hash of the original value, never ciphertext. */
export function publicLinkTokenUpdates(
  id: string,
  updates: Record<string, any>,
  table: LinkSecretTable,
  encryption: DataEncryption
) {
  if (updates.id !== undefined && updates.id !== id)
    throw new Error('invalid_invoice_identity');
  if (updates.token === undefined) {
    if (updates.tokenHash !== undefined)
      throw new Error('invalid_invoice_token');
    const { id: _id, token: _token, ...rest } = updates;
    return rest;
  }
  const { id: _id, ...rest } = hashPublicLinkTokenData(
    { ...updates, id },
    table,
    encryption
  );
  return rest;
}
