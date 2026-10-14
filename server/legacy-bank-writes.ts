import {
  DataEncryption,
  DataEncryptionError,
  LEGACY_BANK_COLUMNS,
} from './data-encryption';

export const LEGACY_BANK_PROPERTIES = Object.freeze([
  'bankName',
  'bankBranch',
  'accountHolderName',
  'bankAccountNumber',
] as const);
export type LegacyBankChanges = Partial<
  Record<(typeof LEGACY_BANK_PROPERTIES)[number], string | null>
>;

/** Only trusted internal storage callers use this; the public bank route stays retired. */
export function sealLegacyBankChanges(
  encryption: DataEncryption,
  rowId: number,
  source: Record<string, unknown>
): LegacyBankChanges {
  const changes: LegacyBankChanges = {};
  for (let index = 0; index < LEGACY_BANK_PROPERTIES.length; index++) {
    const property = LEGACY_BANK_PROPERTIES[index];
    if (!Object.hasOwn(source, property) || source[property] === undefined)
      continue;
    const value = source[property];
    if (value !== null && typeof value !== 'string')
      throw new DataEncryptionError('ENCRYPTION_INVALID_VALUE');
    if (typeof value === 'string' && value.startsWith('enc:'))
      throw new DataEncryptionError('ENCRYPTION_ENVELOPE_AS_INPUT');
    const context = {
      schema: 'public',
      table: 'merchants',
      rowId,
      column: LEGACY_BANK_COLUMNS[index],
    } as const;
    changes[property] = encryption.writesEncrypted()
      ? encryption.encrypt(value, context)
      : encryption.read(value, context);
  }
  return changes;
}

export function withoutLegacyBankFields<T extends Record<string, any>>(
  source: T
): T {
  const copy = { ...source };
  for (const property of LEGACY_BANK_PROPERTIES) delete copy[property];
  return copy;
}
