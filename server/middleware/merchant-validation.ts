import type { Request, Response, NextFunction } from 'express';
import type { Merchant, Transaction } from '@shared/schema';
import { storage } from '../storage';
import { strictPositiveIntegerParam } from '../http-params';

export interface MerchantRequest extends Request {
  merchant?: Merchant;
}

export interface MerchantTransactionRequest extends Request {
  transaction?: Transaction;
}

/**
 * Validate that a merchant exists and is verified. This does not authenticate
 * callers or authorize access; any future private route must do that separately.
 * Usage: app.get('/api/merchants/:merchantId/..., validateMerchant, handler)
 */
export async function validateMerchant(req: MerchantRequest, res: Response, next: NextFunction) {
  try {
    const merchantId = strictPositiveIntegerParam(req.params.merchantId);

    if (merchantId === null) {
      return res.status(400).json({ 
        message: "Invalid merchant ID. Must be a valid number." 
      });
    }

    const merchant = await storage.getMerchant(merchantId);
    
    if (!merchant || merchant.status !== 'verified') {
      return res.status(404).json({ message: "Not found" });
    }

    // Add merchant to request for use in route handlers
    req.merchant = merchant;
    next();
  } catch (error) {
    console.error('Merchant validation error:', error);
    res.status(500).json({ 
      message: "Failed to validate merchant. Please try again." 
    });
  }
}

/**
 * Validate a transaction's merchant association, without authenticating callers.
 */
export async function validateMerchantTransaction(req: MerchantTransactionRequest, res: Response, next: NextFunction) {
  try {
    const merchantId = strictPositiveIntegerParam(req.params.merchantId);
    const transactionId = strictPositiveIntegerParam(req.params.transactionId);

    if (merchantId === null || transactionId === null) {
      return res.status(400).json({ 
        message: "Invalid merchant ID or transaction ID." 
      });
    }

    const transaction = await storage.getTransaction(transactionId);
    
    if (!transaction || transaction.merchantId !== merchantId) {
      return res.status(404).json({ message: "Not found" });
    }

    // Add transaction to request for use in route handlers
    req.transaction = transaction;
    next();
  } catch (error) {
    console.error('Transaction validation error:', error);
    res.status(500).json({ 
      message: "Failed to validate transaction. Please try again." 
    });
  }
}
