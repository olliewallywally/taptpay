import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionSchema, updateMerchantRatesSchema, updateMerchantDetailsSchema, updateBankAccountSchema } from "@shared/schema";
import { windcaveService } from "./windcave";
import { authenticateUser, generateToken, authenticateToken, type AuthenticatedRequest } from "./auth";
import { generateReceiptPdf } from "./pdf-generator";
import QRCode from "qrcode";
import { z } from "zod";

// Store SSE connections for real-time updates
const sseConnections = new Map<number, Set<any>>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      const user = await authenticateUser(email, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = generateToken(user);
      
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          merchantId: user.merchantId,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        merchantId: req.user!.merchantId,
        role: req.user!.role,
      },
    });
  });

  // Generate QR code for merchant
  app.get("/api/merchants/:id/qr", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get size parameter (default to 400, allow up to 1000 for downloads)
      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);
      const isDownload = req.query.download === 'true';

      // Set response headers for PNG image
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="tapt-payment-qr-merchant-${merchantId}.png"`);
      }
      
      // Generate QR code as PNG buffer with enhanced quality
      const qrBuffer = await QRCode.toBuffer(merchant.paymentUrl, {
        type: 'png',
        width: size,
        margin: 4, // Larger margin for better visibility
        color: {
          dark: '#16423C', // Forest green
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H', // High error correction for better scanning
      });
      
      res.send(qrBuffer);
    } catch (error) {
      console.error("QR code generation error:", error);
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

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

      // Create Windcave payment session
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const merchantReference = `TXN_${transactionId}_${Date.now()}`;
      
      const session = await windcaveService.createPaymentSession(
        transaction.price,
        merchantReference,
        baseUrl
      );

      if (session) {
        // For hosted payment page, you would redirect to session.links[0].href
        // For this demo, we'll simulate the payment process
        if (windcaveService.isConfigured()) {
          // Real Windcave integration - would redirect to payment page
          res.json({ 
            message: "Payment session created", 
            sessionId: session.id,
            paymentUrl: session.links.find(link => link.rel === "self")?.href
          });
        } else {
          // Simulation mode
          setTimeout(async () => {
            const result = await windcaveService.getSessionResult(session.id);
            const status = result?.status === "approved" ? "completed" : "failed";
            const windcaveTransactionId = result?.dpsTxnRef;
            
            const finalTransaction = await storage.updateTransactionStatus(transactionId, status, windcaveTransactionId);
            
            // Notify clients of final result
            const connections = sseConnections.get(transaction.merchantId);
            if (connections) {
              connections.forEach(conn => {
                conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction: finalTransaction })}\n\n`);
              });
            }
          }, 2000);

          res.json({ message: "Payment processing started (simulation mode)" });
        }
      } else {
        throw new Error("Failed to create payment session");
      }
    } catch (error) {
      console.error("Payment processing error:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Get single transaction details
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // Generate PDF receipt
  app.post("/api/transactions/:id/receipt-pdf", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      if (transaction.status !== "completed") {
        return res.status(400).json({ message: "Cannot generate receipt for incomplete transaction" });
      }

      // Get merchant details for receipt
      const merchant = await storage.getMerchant(transaction.merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Generate PDF receipt
      const pdf = await generateReceiptPdf(transaction, merchant);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=receipt-${transaction.id}-${new Date().toISOString().split('T')[0]}.pdf`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF receipt:", error);
      res.status(500).json({ message: "Failed to generate PDF receipt" });
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

  // Update merchant business details
  app.put("/api/merchants/:id/details", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = updateMerchantDetailsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid merchant details", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantDetails(merchantId, validation.data);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update merchant details" });
    }
  });

  // Update merchant bank account details
  app.put("/api/merchants/:id/bank-account", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = updateBankAccountSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid bank account details", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantBankAccount(merchantId, validation.data);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update bank account details" });
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

  // Windcave webhook notification handler
  app.post("/api/windcave/notification", async (req, res) => {
    try {
      // This would receive notifications from Windcave about payment status changes
      const { sessionId, status, merchantReference } = req.body;
      
      console.log("Windcave notification received:", { sessionId, status, merchantReference });
      
      // Extract transaction ID from merchant reference
      const transactionId = parseInt(merchantReference.split('_')[1]);
      
      if (transactionId) {
        const finalStatus = status === "approved" ? "completed" : "failed";
        const windcaveTransactionId = sessionId;
        
        const transaction = await storage.updateTransactionStatus(transactionId, finalStatus, windcaveTransactionId);
        
        if (transaction) {
          // Notify connected clients
          const connections = sseConnections.get(transaction.merchantId);
          if (connections) {
            connections.forEach(conn => {
              conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction })}\n\n`);
            });
          }
        }
      }
      
      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing Windcave notification:", error);
      res.status(500).json({ message: "Failed to process notification" });
    }
  });

  // Check API configuration status
  app.get("/api/windcave/status", (req, res) => {
    res.json({
      configured: windcaveService.isConfigured(),
      mode: windcaveService.isConfigured() ? "live" : "simulation",
      message: windcaveService.isConfigured() 
        ? "Windcave API is configured and ready"
        : "Running in simulation mode. Configure WINDCAVE_USERNAME and WINDCAVE_API_KEY to enable live payments."
    });
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
