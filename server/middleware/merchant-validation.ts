import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * Middleware to validate that a merchant exists and is active
 * Usage: app.get('/api/merchants/:merchantId/..., validateMerchant, handler)
 */
export async function validateMerchant(req: Request, res: Response, next: NextFunction) {
  try {
    const merchantId = parseInt(req.params.merchantId);
    
    if (!merchantId || isNaN(merchantId)) {
      return res.status(400).json({ 
        message: "Invalid merchant ID. Must be a valid number." 
      });
    }

    const merchant = await storage.getMerchant(merchantId);
    
    if (!merchant) {
      return res.status(404).json({ 
        message: `Merchant #${merchantId} not found. Please check the merchant ID.` 
      });
    }

    if (merchant.status !== 'verified') {
      return res.status(403).json({ 
        message: `Merchant #${merchantId} is not verified and cannot process payments.` 
      });
    }

    // Add merchant to request for use in route handlers
    (req as any).merchant = merchant;
    next();
  } catch (error) {
    console.error('Merchant validation error:', error);
    res.status(500).json({ 
      message: "Failed to validate merchant. Please try again." 
    });
  }
}

/**
 * Middleware to validate that a transaction belongs to the specified merchant
 */
export async function validateMerchantTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const merchantId = parseInt(req.params.merchantId);
    const transactionId = parseInt(req.params.transactionId);
    
    if (!merchantId || !transactionId || isNaN(merchantId) || isNaN(transactionId)) {
      return res.status(400).json({ 
        message: "Invalid merchant ID or transaction ID." 
      });
    }

    const transaction = await storage.getTransaction(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ 
        message: `Transaction #${transactionId} not found.` 
      });
    }

    if (transaction.merchantId !== merchantId) {
      return res.status(403).json({ 
        message: `Transaction #${transactionId} does not belong to merchant #${merchantId}.` 
      });
    }

    // Add transaction to request for use in route handlers
    (req as any).transaction = transaction;
    next();
  } catch (error) {
    console.error('Transaction validation error:', error);
    res.status(500).json({ 
      message: "Failed to validate transaction. Please try again." 
    });
  }
}