import { createHash } from 'node:crypto';
import { loadDataEncryption } from '../data-encryption';
import { countActiveSecrets } from '../active-secret-workflow';
const target = { host: '127.0.0.1', port: 55440, database: 'owned' };
const reader = loadDataEncryption({
  DATA_ENCRYPTION_STAGE: 'encrypted-write',
  DATA_ENCRYPTION_ACTIVE_KEY_ID: 'test',
  DATA_ENCRYPTION_KEYRING: JSON.stringify([
    { id: 'test', key: Buffer.alloc(32, 3).toString('base64url') },
  ]),
});
function client(rows: any[]) {
  return {
    query: jest.fn(async (query: string) => ({
      rows: query.includes('current_database()')
        ? [{ database: 'owned' }]
        : query.includes('FROM public.job_invoices')
          ? rows
          : [],
    })),
  };
}
test('legacy links with missing hashes are migratable; encrypted links preserve original capability hash', async () => {
  const id = '5c4fe610-d09d-4b90-a6ed-d465dc1f5ebd',
    raw = 'synthetic-link';
  const c = client([
    { id, secret: raw, token_hash: null },
    {
      id: 'ac4fe610-d09d-4b90-a6ed-d465dc1f5ebd',
      secret: reader.encrypt(raw, {
        schema: 'public',
        table: 'job_invoices',
        column: 'token',
        rowId: 'ac4fe610-d09d-4b90-a6ed-d465dc1f5ebd',
      }),
      token_hash: createHash('sha256').update(raw).digest('hex'),
    },
  ]);
  const result = await countActiveSecrets(c, target, reader);
  expect(result.safeToBackfill).toBe(true);
  expect(result.fields.job_invoices.plaintext).toBe(1);
  expect(result.fields.job_invoices.encryptedActiveKey).toBe(1);
  expect(result.missingLookupHashes).toBe(1);
  expect(JSON.stringify(result)).not.toContain(raw);
  expect(c.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});
test('wrong lookup hashes and malformed envelopes are unsafe, without returning values', async () => {
  const c = client([
    {
      id: '5c4fe610-d09d-4b90-a6ed-d465dc1f5ebd',
      secret: 'synthetic-link',
      token_hash: '0'.repeat(64),
    },
    {
      id: 'ac4fe610-d09d-4b90-a6ed-d465dc1f5ebd',
      secret: 'enc:v9:invalid',
      token_hash: null,
    },
  ]);
  const result = await countActiveSecrets(c, target, reader);
  expect(result.safeToBackfill).toBe(false);
  expect(result.lookupHashMismatches).toBe(1);
  expect(result.fields.job_invoices.unsupportedVersion).toBe(1);
});
test('target mismatch rolls back before selecting secrets', async () => {
  const c = client([]);
  c.query.mockImplementation(async (q: string) => ({
    rows: q.includes('current_database()') ? [{ database: 'other' }] : [],
  }));
  await expect(countActiveSecrets(c, target, reader)).rejects.toThrow(
    'R5_ACTIVE_TARGET_MISMATCH'
  );
  expect(
    c.query.mock.calls.some(([q]) => q.includes('FROM public.job_invoices'))
  ).toBe(false);
});

test('empty plaintext or encrypted stored-card values stop backfill instead of becoming present cards', async () => {
  const c = {
    query: jest.fn(async (q: string) => ({
      rows: q.includes('current_database()')
        ? [{ database: 'owned' }]
        : q.includes('FROM public.merchant_subscriptions')
          ? [
              { id: 4, secret: '' },
              {
                id: 5,
                secret: reader.encrypt('', {
                  schema: 'public',
                  table: 'merchant_subscriptions',
                  column: 'windcave_card_id',
                  rowId: 5,
                }),
              },
            ]
          : [],
    })),
  };
  const report = await countActiveSecrets(c, target, reader);
  expect(report.safeToBackfill).toBe(false);
  expect(report.fields.merchant_subscriptions.invalidValue).toBe(2);
});
