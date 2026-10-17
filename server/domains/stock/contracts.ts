import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../auth';
import type { IStorage } from '../../storage';

/** Existing tenant-scoped commands, implemented by the app's storage instance. */
export type StockStorage = Pick<
  IStorage,
  | 'getStockItemsByMerchant'
  | 'createStockItemForMerchant'
  | 'getStockItemForMerchant'
  | 'updateStockItemForMerchant'
  | 'deleteStockItemForMerchant'
>;

export interface StockRouteDependencies {
  storage: StockStorage;
  authenticateToken: RequestHandler;
  checkMerchantOwnership: (
    req: AuthenticatedRequest,
    merchantId: number
  ) => boolean;
}
