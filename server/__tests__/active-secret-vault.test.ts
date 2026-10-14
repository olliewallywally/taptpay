import './support/test-env';
import { randomUUID } from 'node:crypto';
import { loadDataEncryption } from '../data-encryption';
import {
  openActiveSecret,
  openLinkRow,
  openSubscriptionRow,
  sealActiveSecret,
} from '../active-secret-vault';
import {
  mintPublicLinkToken,
  hashPublicLinkTokenData,
} from '../public-link-token-compatibility';
import { hashBearerCredential } from '../payment-credential';

const encryption = () =>
  loadDataEncryption({
    DATA_ENCRYPTION_STAGE: 'encrypted-write',
    DATA_ENCRYPTION_ACTIVE_KEY_ID: 'test',
    DATA_ENCRYPTION_KEYRING: JSON.stringify([
      { id: 'test', key: Buffer.alloc(32, 23).toString('base64url') },
    ]),
  });
describe('R5 active credentials retain their in-memory semantics', () => {
  test.each(['invoices_rent_requests', 'job_invoices', 'quotes'] as const)(
    '%s keeps the original capability and lookup hash',
    table => {
      const e = encryption(),
        minted = mintPublicLinkToken(table, e);
      expect(minted.token).toMatch(/^enc:v1:/);
      const opened = openLinkRow(table, minted, e);
      expect(opened.tokenHash).toBe(hashBearerCredential(opened.token));
      expect(() =>
        openActiveSecret(table, randomUUID(), minted.token, e)
      ).toThrow('ENCRYPTION_AUTHENTICATION_FAILED');
      const other = table === 'quotes' ? 'job_invoices' : 'quotes';
      expect(() =>
        openActiveSecret(other, minted.id!, minted.token, e)
      ).toThrow('ENCRYPTION_AUTHENTICATION_FAILED');
    }
  );
  test('card storage does not change the credential or digest delivered to billing', () => {
    const e = encryption(),
      raw = 'synthetic-provider-credential',
      stored = sealActiveSecret('merchant_subscriptions', 4, raw, e);
    const opened = openSubscriptionRow({ id: 4, windcaveCardId: stored }, e);
    expect(opened.windcaveCardId).toBe(raw);
    expect(hashBearerCredential(opened.windcaveCardId!)).toBe(
      hashBearerCredential(raw)
    );
    expect(() =>
      openActiveSecret('merchant_subscriptions', 5, stored, e)
    ).toThrow('ENCRYPTION_AUTHENTICATION_FAILED');
  });
  test('UUID casing uses the canonical PostgreSQL record identity', () => {
    const e = encryption(),
      id = randomUUID();
    const stored = hashPublicLinkTokenData(
      { id: id.toUpperCase(), token: 'synthetic-original-link' },
      'quotes',
      e
    );
    expect(openLinkRow('quotes', { ...stored, id }, e).token).toBe(
      'synthetic-original-link'
    );
  });
  test('legacy rows remain compatible; reserved malformed ciphertext never downgrades', () => {
    expect(
      openLinkRow('quotes', { id: 'narrow-legacy-fixture', token: 'old' }).token
    ).toBe('old');
    expect(() =>
      openLinkRow(
        'quotes',
        { id: randomUUID(), token: 'enc:v1:malformed' },
        encryption()
      )
    ).toThrow('ENCRYPTION_MALFORMED_ENVELOPE');
  });
  test('writers never double-encrypt a returned envelope', () => {
    const e = encryption(),
      stored = mintPublicLinkToken('quotes', e);
    expect(() => hashPublicLinkTokenData(stored, 'quotes', e)).toThrow(
      'ENCRYPTION_ENVELOPE_AS_INPUT'
    );
  });
});

test.each(['', 'x'.repeat(1001)])(
  'invalid stored-card value cannot become a usable encrypted credential',
  raw => {
    expect(() =>
      sealActiveSecret('merchant_subscriptions', 4, raw, encryption())
    ).toThrow('ENCRYPTION_INVALID_VALUE');
  }
);
