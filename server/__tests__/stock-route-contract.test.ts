import './support/test-env';

import request from 'supertest';
import { MemStorage } from '../storage';
import {
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  signedIn,
  storage as defaultStorage,
} from './support/http-harness';

const STOCK_METHODS = [
  'getStockItemsByMerchant',
  'createStockItemForMerchant',
  'getStockItemForMerchant',
  'updateStockItemForMerchant',
  'deleteStockItemForMerchant',
] as const;

async function fixture() {
  const owner = await createOwnerPrincipal();
  const storage = new MemStorage();
  const item = await storage.createStockItemForMerchant(owner.merchantId, {
    name: 'Original',
    cost: '2.50',
  });
  const { app } = await createTestApp({ storage });
  const collection = `/api/merchants/${owner.merchantId}/stock-items`;
  return { app, owner, storage, item, collection };
}

beforeEach(resetTestStorage);

describe('stock HTTP contract across the domain boundary', () => {
  test('all four routes use the injected storage instance, including its method receiver', async () => {
    const { app, owner, storage, item, collection } = await fixture();
    const defaultCalls = STOCK_METHODS.map(method =>
      jest.spyOn(defaultStorage, method)
    );

    const created = await request(app)
      .post(collection)
      .set(signedIn(owner))
      .send({ name: 'Coffee', cost: '4.50', description: 'Keep this' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Coffee',
      cost: '4.50',
      merchantId: owner.merchantId,
    });
    expect(
      await storage.getStockItemForMerchant(created.body.id, owner.merchantId)
    ).toMatchObject({ description: 'Keep this' });

    const listed = await request(app).get(collection).set(signedIn(owner));
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { id: number }) => row.id)).toEqual([
      item.id,
      created.body.id,
    ]);

    const updated = await request(app)
      .put(`${collection}/${created.body.id}`)
      .set(signedIn(owner))
      .send({ name: 'Flat white', cost: '5.00' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: 'Flat white',
      cost: '5.00',
      description: 'Keep this',
    });

    const deleted = await request(app)
      .delete(`${collection}/${created.body.id}`)
      .set(signedIn(owner));
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({
      message: 'Stock item deleted successfully',
    });
    expect(
      await storage.getStockItemForMerchant(created.body.id, owner.merchantId)
    ).toMatchObject({ isActive: false });
    for (const call of defaultCalls) expect(call).not.toHaveBeenCalled();
  });

  test.each([
    ['get', 'getStockItemsByMerchant', 'Failed to fetch stock items'],
    ['post', 'createStockItemForMerchant', 'Failed to create stock item'],
    ['put', 'updateStockItemForMerchant', 'Failed to update stock item'],
    ['delete', 'deleteStockItemForMerchant', 'Failed to delete stock item'],
  ] as const)(
    '%s keeps the safe 500 response when storage rejects',
    async (method, operation, message) => {
      const { app, owner, storage, item, collection } = await fixture();
      jest
        .spyOn(storage, operation)
        .mockRejectedValue(new Error('synthetic private upstream detail'));
      const path =
        method === 'put' || method === 'delete'
          ? `${collection}/${item.id}`
          : collection;
      const response = await request(app)
        [method](path)
        .set(signedIn(owner))
        .send({ name: 'Changed', cost: '3.00' });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message });
    }
  );

  test.each(['put', 'delete'] as const)(
    '%s keeps the second-write 404 when the scoped write loses its record',
    async method => {
      const { app, owner, storage, item, collection } = await fixture();
      if (method === 'put')
        jest
          .spyOn(storage, 'updateStockItemForMerchant')
          .mockResolvedValue(undefined);
      else
        jest
          .spyOn(storage, 'deleteStockItemForMerchant')
          .mockResolvedValue(false);
      const response = await request(app)
        [method](`${collection}/${item.id}`)
        .set(signedIn(owner))
        .send({ name: 'Changed', cost: '3.00' });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Stock item not found' });
      expect(
        await storage.getStockItemForMerchant(item.id, owner.merchantId)
      ).toEqual(item);
    }
  );

  test.each(['post', 'put'] as const)(
    '%s keeps validation errors and makes no write',
    async method => {
      const { app, owner, storage, item, collection } = await fixture();
      const create = jest.spyOn(storage, 'createStockItemForMerchant');
      const update = jest.spyOn(storage, 'updateStockItemForMerchant');
      const path = method === 'put' ? `${collection}/${item.id}` : collection;
      const response = await request(app)
        [method](path)
        .set(signedIn(owner))
        .send({ name: '', cost: 'free' });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['name'], code: 'too_small' }),
          expect.objectContaining({ path: ['cost'], code: 'invalid_string' }),
        ])
      );
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(
        await storage.getStockItemForMerchant(item.id, owner.merchantId)
      ).toEqual(item);
    }
  );

  test.each([
    ['get', 'merchant'],
    ['post', 'merchant'],
    ['put', 'merchant'],
    ['delete', 'merchant'],
    ['put', 'item'],
    ['delete', 'item'],
  ] as const)(
    '%s rejects an invalid %s id before any stock access',
    async (method, invalid) => {
      const { app, owner, storage, item } = await fixture();
      const calls = STOCK_METHODS.map(operation =>
        jest.spyOn(storage, operation)
      );
      const merchantId =
        invalid === 'merchant' ? '1e3' : String(owner.merchantId);
      const itemId = invalid === 'item' ? '1abc' : String(item.id);
      const collection = `/api/merchants/${merchantId}/stock-items`;
      const path =
        method === 'put' || method === 'delete'
          ? `${collection}/${itemId}`
          : collection;
      const response = await request(app)
        [method](path)
        .set(signedIn(owner))
        .send({ name: 'Changed', cost: '3.00' });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Invalid id' });
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    }
  );
});
