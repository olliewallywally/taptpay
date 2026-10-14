import './support/test-env';
import { MemStorage } from '../storage';
import { LEGACY_BANK_COLUMNS, loadDataEncryption } from '../data-encryption';

const bank = {
  bankName: 'synthetic bank',
  bankBranch: '',
  accountHolderName: 'Synthetic Holder',
  bankAccountNumber: 'synthetic account',
};
const properties = [
  'bankName',
  'bankBranch',
  'accountHolderName',
  'bankAccountNumber',
] as const;
const source = (stage: string) => ({
  DATA_ENCRYPTION_STAGE: stage,
  DATA_ENCRYPTION_ACTIVE_KEY_ID: 'test',
  DATA_ENCRYPTION_KEYRING: JSON.stringify([
    { id: 'test', key: Buffer.alloc(32, 19).toString('base64url') },
  ]),
});
const merchant = {
  name: 'R5',
  businessName: 'R5 synthetic',
  email: 'r5@synthetic.test',
  ...bank,
};

describe('R5 encrypted memory writers', () => {
  test.each(['createMerchant', 'createMerchantWithPassword'] as const)(
    '%s seals every scoped field with the new ID',
    async method => {
      const encryption = loadDataEncryption(source('encrypted-write'));
      const store = new (MemStorage as any)(encryption) as MemStorage;
      const row =
        method === 'createMerchant'
          ? await store.createMerchant(merchant as any)
          : await store.createMerchantWithPassword(merchant, 'synthetic hash');
      for (let index = 0; index < properties.length; index++) {
        const property = properties[index];
        expect(row[property]).toMatch(/^enc:v1:/);
        expect(
          encryption.read(row[property], {
            schema: 'public',
            table: 'merchants',
            rowId: row.id,
            column: LEGACY_BANK_COLUMNS[index],
          })
        ).toBe(bank[property]);
        expect((await store.getMerchant(row.id))![property]).toBe(
          row[property]
        );
      }
    }
  );

  test.each(['updateMerchant', 'updateMerchantBankAccount'] as const)(
    '%s seals only supplied columns and does not accept stray credentials',
    async method => {
      const encryption = loadDataEncryption(source('encrypted-write'));
      const store = new (MemStorage as any)(encryption) as MemStorage;
      const row = await store.createMerchant(merchant as any);
      const before = { ...row };
      const changes: any = {
        bankName: 'changed bank',
        windcaveApiKey: 'rejected',
        businessName: 'stray',
      };
      const updated = await store[method](row.id, changes);
      expect(
        encryption.read(updated!.bankName, {
          schema: 'public',
          table: 'merchants',
          rowId: row.id,
          column: 'bank_name',
        })
      ).toBe('changed bank');
      expect(updated!.bankBranch).toBe(before.bankBranch);
      expect(updated!.bankAccountNumber).toBe(before.bankAccountNumber);
      expect(updated!.windcaveApiKey).toBeNull();
      if (method === 'updateMerchantBankAccount')
        expect(updated!.businessName).toBe(before.businessName);
    }
  );

  test('invalid/double-encrypted input has no row or owner side effects', async () => {
    const encryption = loadDataEncryption(source('encrypted-write'));
    const store = new (MemStorage as any)(encryption) as MemStorage;
    await expect(
      store.createMerchantWithPassword({ ...merchant, bankName: 42 }, 'hash')
    ).rejects.toThrow('ENCRYPTION_INVALID_VALUE');
    expect(await store.getAllMerchants()).toEqual([]);
    expect(await store.getUserByEmail(merchant.email)).toBeUndefined();
    const row = await store.createMerchant(merchant as any);
    const before = { ...row };
    await expect(
      store.updateMerchant(row.id, { bankName: row.bankName })
    ).rejects.toThrow('ENCRYPTION_ENVELOPE_AS_INPUT');
    expect(await store.getMerchant(row.id)).toEqual(before);
    await expect(
      store.updateMerchant(row.id, { id: row.id + 1 })
    ).rejects.toThrow('ENCRYPTION_INVALID_CONTEXT');
    expect(await store.getMerchant(row.id)).toEqual(before);
  });

  test('legacy/compatible stages preserve current writes and keep null distinct from empty', async () => {
    for (const encryption of [
      loadDataEncryption({}),
      loadDataEncryption(source('read-compatible')),
    ]) {
      const store = new (MemStorage as any)(encryption) as MemStorage;
      const row = await store.createMerchant(merchant as any);
      expect(row.bankName).toBe(bank.bankName);
      expect(row.bankBranch).toBe('');
      const updated = await store.updateMerchant(row.id, { bankName: null });
      expect(updated!.bankName).toBeNull();
      expect(updated!.bankBranch).toBe('');
    }
  });

  test('contract still writes ciphertext/null but refuses plaintext reads', async () => {
    const encryption = loadDataEncryption(source('contract'));
    const store = new (MemStorage as any)(encryption) as MemStorage;
    const row = await store.createMerchant(merchant as any);
    expect(
      encryption.read(row.bankName, {
        schema: 'public',
        table: 'merchants',
        rowId: row.id,
        column: 'bank_name',
      })
    ).toBe(bank.bankName);
    expect(() =>
      encryption.read(bank.bankName, {
        schema: 'public',
        table: 'merchants',
        rowId: row.id,
        column: 'bank_name',
      })
    ).toThrow('ENCRYPTION_PLAINTEXT_DISABLED');
    expect(
      encryption.classify(bank.bankName, {
        schema: 'public',
        table: 'merchants',
        rowId: row.id,
        column: 'bank_name',
      })
    ).toBe('plaintext');
  });
});
