import './support/test-env';
import { DatabaseStorage, PushSessionEndedError } from '../storage';

/** Driver-free boundary test: reads and activation use the SAME transaction,
 * and a generation change visible when the user lock is acquired refuses writes.
 * Real PostgreSQL scheduling is a separate deployment check, not claimed here.
 */
test.each([0, 1])('registration checks the locked users-row generation %s', async version => {
  const calls: string[] = [];
  let reads = 0;
  const tx = {
    select: () => ({from: () => ({where: () => {
      reads++;
      if (reads === 1) return {for: async (mode: string) => {
        calls.push(`lock:${mode}`);
        return [{id: 7, merchantId: 3, status: 'active', sessionVersion: version}];
      }};
      if (reads === 2) return {orderBy: () => ({limit: async () => []})};
      return Promise.resolve([]);
    }})}),
    insert: () => ({values: (data: unknown) => ({returning: async () => {
      calls.push('activate'); return [{id: 1, ...(data as object)}];
    }})}),
  };
  const store = new DatabaseStorage();
  (store as any).db = {transaction: async (run: (connection: typeof tx) => unknown) => run(tx)};
  const pending = store.createPushSubscription({merchantId: 3, userId: 7, sessionVersion: 0, endpoint: 'apns://test-device', p256dh: '', auth: ''});
  if (version === 0) {
    await expect(pending).resolves.toMatchObject({isActive: true});
    expect(calls).toEqual(['lock:update', 'activate']);
  } else {
    await expect(pending).rejects.toBeInstanceOf(PushSessionEndedError);
    expect(calls).toEqual(['lock:update']);
  }
});
