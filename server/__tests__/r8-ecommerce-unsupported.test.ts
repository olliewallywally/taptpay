import './support/test-env';
import {MemStorage, DatabaseStorage} from '../storage';
describe.each([['memory', () => new MemStorage()], ['postgres', () => new DatabaseStorage({} as any)]] as const)('%s unsupported ecommerce keys', (_name, create) => {
  it('cannot manufacture an active key or falsely acknowledge revocation', async () => {
    const storage = create();
    await expect(storage.createApiKey({merchantId: 1, environment: 'sandbox'})).rejects.toThrow('ECOMMERCE_API_UNSUPPORTED');
    await expect(storage.revokeApiKey(1)).rejects.toThrow('ECOMMERCE_API_UNSUPPORTED');
    expect(await storage.getApiKeyByKey('unrecognized')).toBeNull();
  });
});
