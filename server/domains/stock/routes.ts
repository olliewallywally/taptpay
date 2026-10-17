import type { Express } from 'express';
import type { AuthenticatedRequest } from '../../auth';
import { strictPositiveIntegerParam } from '../../http-params';
import { logOperation } from '../../structured-log';
import { createStockItemSchema, updateStockItemSchema } from '@shared/schema';
import { z } from 'zod';
import type { StockRouteDependencies } from './contracts';

/** Register on the existing guarded app, using its shared storage and gates. */
export function registerStockRoutes(
  app: Express,
  { storage, authenticateToken, checkMerchantOwnership }: StockRouteDependencies,
): void {
  // Get all stock items for a merchant
  app.get("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // The business's logins, and the platform admin (C10 batch 6: the shared check, not a copy).
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const stockItems = await storage.getStockItemsByMerchant(merchantId);
      res.json(stockItems);
    } catch (error) {
      logOperation("error","ERROR_FETCHING_STOCK_ITEMS",{payload:["Error fetching stock items:",error]});
      res.status(500).json({ message: "Failed to fetch stock items" });
    }
  });

  // Create a new stock item
  app.post("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // The business's logins, and the platform admin (C10 batch 6: the shared check, not a copy).
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = createStockItemSchema.parse(req.body);

      const stockItem = await storage.createStockItemForMerchant(merchantId, validatedData);

      res.status(201).json(stockItem);
    } catch (error) {
      logOperation("error","ERROR_CREATING_STOCK_ITEM",{payload:["Error creating stock item:",error]});
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stock item" });
    }
  });

  // Update a stock item
  app.put("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const itemId = strictPositiveIntegerParam(req.params.itemId);
      if (itemId === null) return res.status(400).json({ message: "Invalid id" });

      // The business's logins, and the platform admin (C10 batch 6: the shared check, not a copy).
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Scope both the read and the later write to the authorized business.
      const existingItem = await storage.getStockItemForMerchant(itemId, merchantId);
      if (!existingItem) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      const validatedData = updateStockItemSchema.parse(req.body);

      const stockItem = await storage.updateStockItemForMerchant(itemId, merchantId, validatedData);

      if (!stockItem) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      res.json(stockItem);
    } catch (error) {
      logOperation("error","ERROR_UPDATING_STOCK_ITEM",{payload:["Error updating stock item:",error]});
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update stock item" });
    }
  });

  // Delete a stock item
  app.delete("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const itemId = strictPositiveIntegerParam(req.params.itemId);
      if (itemId === null) return res.status(400).json({ message: "Invalid id" });

      // The business's logins, and the platform admin (C10 batch 6: the shared check, not a copy).
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Scope both the read and the later write to the authorized business.
      const existingItem = await storage.getStockItemForMerchant(itemId, merchantId);
      if (!existingItem) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      const success = await storage.deleteStockItemForMerchant(itemId, merchantId);

      if (!success) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      res.json({ message: "Stock item deleted successfully" });
    } catch (error) {
      logOperation("error","ERROR_DELETING_STOCK_ITEM",{payload:["Error deleting stock item:",error]});
      res.status(500).json({ message: "Failed to delete stock item" });
    }
  });
}
