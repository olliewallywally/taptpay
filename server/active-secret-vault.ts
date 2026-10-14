import {
  DataEncryption,
  DataEncryptionError,
  loadDataEncryption,
} from './data-encryption';
const legacyReader = loadDataEncryption({});

export type LinkSecretTable =
  | 'invoices_rent_requests'
  | 'job_invoices'
  | 'quotes';
export type ActiveSecretTable = LinkSecretTable | 'merchant_subscriptions';
export const ACTIVE_SECRET_FIELDS = Object.freeze([
  {
    table: 'merchant_subscriptions',
    column: 'windcave_card_id',
    property: 'windcaveCardId',
    numericId: true,
  },
  {
    table: 'invoices_rent_requests',
    column: 'token',
    property: 'token',
    numericId: false,
  },
  {
    table: 'job_invoices',
    column: 'token',
    property: 'token',
    numericId: false,
  },
  { table: 'quotes', column: 'token', property: 'token', numericId: false },
] as const);

export function sealActiveSecret(
  table: ActiveSecretTable,
  id: number | string,
  value: string | null,
  encryption: DataEncryption = legacyReader
): string | null {
  if (typeof value === 'string' && value.startsWith('enc:'))
    throw new DataEncryptionError('ENCRYPTION_ENVELOPE_AS_INPUT');
  if (
    table === 'merchant_subscriptions' &&
    value !== null &&
    (typeof value !== 'string' || value.length < 1 || value.length > 1000)
  )
    throw new DataEncryptionError('ENCRYPTION_INVALID_VALUE');
  if (!encryption.writesEncrypted()) return value;
  return encryption.encrypt(value, {
    schema: 'public',
    table,
    rowId: id,
    column: table === 'merchant_subscriptions' ? 'windcave_card_id' : 'token',
  });
}

export function openActiveSecret(
  table: ActiveSecretTable,
  id: number | string,
  value: string | null,
  encryption: DataEncryption = legacyReader
): string | null {
  // Preserve the pre-expansion plain-row contract (including narrow test rows),
  // but every reserved enc: input must go through exact-context authentication.
  if (
    value === null ||
    (typeof value === 'string' &&
      !value.startsWith('enc:') &&
      encryption.describe().stage !== 'contract')
  )
    return value;
  return encryption.read(value, {
    schema: 'public',
    table,
    rowId: id,
    column: table === 'merchant_subscriptions' ? 'windcave_card_id' : 'token',
  });
}

export function openLinkRow<T>(
  table: LinkSecretTable,
  row: T,
  encryption: DataEncryption = legacyReader
): T {
  if (!row || typeof row !== 'object') return row;
  const source = row as Record<string, any>;
  if (
    source.token === undefined ||
    source.token === null ||
    (typeof source.token === 'string' &&
      !source.token.startsWith('enc:') &&
      encryption.describe().stage !== 'contract')
  )
    return row;
  return {
    ...source,
    token: openActiveSecret(table, source.id, source.token, encryption),
  } as T;
}

export function openSubscriptionRow<
  T extends { id?: any; windcaveCardId?: any } | undefined,
>(row: T, encryption: DataEncryption = legacyReader): T {
  if (!row || row.windcaveCardId === undefined) return row;
  if (
    row.windcaveCardId === null ||
    (typeof row.windcaveCardId === 'string' &&
      !row.windcaveCardId.startsWith('enc:') &&
      encryption.describe().stage !== 'contract')
  )
    return row;
  return {
    ...row,
    windcaveCardId: openActiveSecret(
      'merchant_subscriptions',
      row.id,
      row.windcaveCardId,
      encryption
    ),
  } as T;
}

export function openSqlSubscription<
  T extends { id?: any; windcave_card_id?: any } | undefined,
>(row: T, encryption: DataEncryption = legacyReader): T {
  if (!row || row.windcave_card_id === undefined) return row;
  if (
    row.windcave_card_id === null ||
    (typeof row.windcave_card_id === 'string' &&
      !row.windcave_card_id.startsWith('enc:') &&
      encryption.describe().stage !== 'contract')
  )
    return row;
  return {
    ...row,
    windcave_card_id: openActiveSecret(
      'merchant_subscriptions',
      row.id,
      row.windcave_card_id,
      encryption
    ),
  } as T;
}
