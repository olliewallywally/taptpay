import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionSchema, updateMerchantRatesSchema } from "@shared/schema";
import { z } from "zod";

// Store SSE connections for real-time updates
const sseConnections = new Map<number, Set<any>>();

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get merchant info
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const merchant = await storage.getMerchant(id);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      res.json(merchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to get merchant" });
    }
  });

  // Get active transaction for merchant
  app.get("/api/merchants/:id/active-transaction", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const transaction = await storage.getActiveTransactionByMerchant(merchantId);
      res.json(transaction || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to get active transaction" });
    }
  });

  // Create new transaction
  app.post("/api/transactions", async (req, res) => {
    try {
      const validation = insertTransactionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid transaction data", errors: validation.error.errors });
      }

      const transaction = await storage.createTransaction(validation.data);
      
      // Notify all connected clients for this merchant
      const connections = sseConnections.get(transaction.merchantId);
      if (connections) {
        connections.forEach(conn => {
          conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction })}\n\n`);
        });
      }

      res.json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // Process payment with Windcave
  app.post("/api/transactions/:id/pay", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Update status to processing
      await storage.updateTransactionStatus(transactionId, "processing");
      
      // Notify clients
      const connections = sseConnections.get(transaction.merchantId);
      if (connections) {
        const updatedTransaction = await storage.getTransaction(transactionId);
        connections.forEach(conn => {
          conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction: updatedTransaction })}\n\n`);
        });
      }

      // Simulate Windcave payment processing
      // In production, integrate with actual Windcave API
      setTimeout(async () => {
        const success = Math.random() > 0.1; // 90% success rate for demo
        const status = success ? "completed" : "failed";
        const windcaveTransactionId = success ? `WC_${Date.now()}` : undefined;
        
        const finalTransaction = await storage.updateTransactionStatus(transactionId, status, windcaveTransactionId);
        
        // Notify clients of final result
        const connections = sseConnections.get(transaction.merchantId);
        if (connections) {
          connections.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction: finalTransaction })}\n\n`);
          });
        }
      }, 2000);

      res.json({ message: "Payment processing started" });
    } catch (error) {
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Get merchant analytics
  app.get("/api/merchants/:id/analytics", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const analytics = await storage.getMerchantAnalytics(merchantId);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Update merchant rates
  app.put("/api/merchants/:id/rates", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = updateMerchantRatesSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid rate data", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantRates(merchantId, validation.data.currentProviderRate);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update rates" });
    }
  });

  // Get all transactions for merchant (for dashboard)
  app.get("/api/merchants/:id/transactions", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const transactions = await storage.getTransactionsByMerchant(merchantId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  // Server-Sent Events for real-time updates
  app.get("/api/merchants/:id/events", (req, res) => {
    const merchantId = parseInt(req.params.id);
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add connection to merchant's set
    if (!sseConnections.has(merchantId)) {
      sseConnections.set(merchantId, new Set());
    }
    sseConnections.get(merchantId)!.add(res);

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      const connections = sseConnections.get(merchantId);
      if (connections) {
        connections.delete(res);
        if (connections.size === 0) {
          sseConnections.delete(merchantId);
        }
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
