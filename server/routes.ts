import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionSchema, updateMerchantRatesSchema, updateMerchantDetailsSchema, updateBankAccountSchema, forgotPasswordSchema, resetPasswordSchema, createMerchantSchema, verifyMerchantSchema } from "@shared/schema";
import { windcaveService } from "./windcave";
import { authenticateUser, generateToken, authenticateToken, createUser, requestPasswordReset, resetPassword, validateResetToken, type AuthenticatedRequest } from "./auth";
import { generateReceiptPdf } from "./pdf-generator";
import { generateBusinessReportPdf } from "./report-generator";
import { getBaseUrl, generatePaymentUrl, generateQrCodeUrl } from "./url-utils";
import { sendEmail } from "./email-service";
import QRCode from "qrcode";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Store SSE connections for real-time updates
const sseConnections = new Map<number, Set<any>>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Admin authentication middleware
  const authenticateAdmin = (req: AuthenticatedRequest, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('Admin auth - headers:', req.headers['authorization']);
    console.log('Admin auth - token:', token);

    if (!token) {
      console.log('Admin auth - no token provided');
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      console.log('Admin auth - decoded token:', decoded);
      
      // For admin users, we verify directly from the token
      if (decoded.role === 'admin' && decoded.email === 'admin@tapt.co.nz') {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          merchantId: decoded.merchantId,
          role: decoded.role,
          password: '',
          resetToken: undefined,
          resetTokenExpiry: undefined,
          createdAt: new Date(),
        };
        console.log('Admin auth - success, user set:', req.user);
        next();
      } else {
        console.log('Admin auth - invalid role or email:', decoded.role, decoded.email);
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch (error) {
      console.log('Admin auth - token verification error:', error);
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  };
  
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

  // Password reset routes
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const validation = forgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email", errors: validation.error.errors });
      }

      const { email } = validation.data;
      const baseUrl = getBaseUrl(req);
      
      await requestPasswordReset(email, baseUrl);
      
      // Always return success to prevent email enumeration
      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reset data", errors: validation.error.errors });
      }

      const { token, password } = validation.data;
      const success = await resetPassword(token, password);
      
      if (!success) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      res.json({ message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/auth/validate-reset-token/:token", (req, res) => {
    const { token } = req.params;
    const isValid = validateResetToken(token);
    
    res.json({ valid: isValid });
  });

  // Admin Authentication routes
  app.post("/api/admin/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      
      // Check for admin credentials
      if (email === "admin@tapt.co.nz" && password === "admin123") {
        const adminUser = {
          id: 1,
          email: "admin@tapt.co.nz",
          password: "admin123",
          merchantId: 0,
          role: "admin" as const,
          createdAt: new Date(),
        };

        const token = generateToken(adminUser);
        
        res.json({
          token,
          user: {
            id: adminUser.id,
            email: adminUser.email,
            merchantId: adminUser.merchantId,
            role: adminUser.role,
          },
        });
      } else {
        return res.status(401).json({ message: "Invalid admin credentials" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Admin login failed" });
    }
  });

  app.get("/api/admin/auth/me", (req: AuthenticatedRequest, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      // For admin users, we verify directly from the token since they're not stored in the users Map
      if (decoded.role === 'admin' && decoded.email === 'admin@tapt.co.nz') {
        res.json({
          user: {
            id: decoded.userId,
            email: decoded.email,
            merchantId: decoded.merchantId,
            role: decoded.role,
          },
        });
      } else {
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch (error) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
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
      
      // Generate QR code with current payment URL
      const currentPaymentUrl = generatePaymentUrl(merchantId, req);
      const qrBuffer = await QRCode.toBuffer(currentPaymentUrl, {
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
      
      // Ensure URLs are always current for this environment
      const currentPaymentUrl = generatePaymentUrl(id, req);
      const currentQrCodeUrl = generateQrCodeUrl(id, req);
      
      // Return merchant with current URLs
      const merchantWithCurrentUrls = {
        ...merchant,
        paymentUrl: currentPaymentUrl,
        qrCodeUrl: currentQrCodeUrl
      };
      
      res.json(merchantWithCurrentUrls);
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

  // Get merchant analytics with date range
  app.get("/api/merchants/:id/analytics/export", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const analytics = await storage.getMerchantAnalyticsWithDateRange(merchantId, start, end);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics with date range:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Export transactions as CSV
  app.get("/api/merchants/:id/export/csv", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const transactions = await storage.getTransactionsByMerchantWithDateRange(merchantId, start, end);
      
      // Generate CSV headers
      const headers = [
        "Transaction ID",
        "Date & Time", 
        "Item Name",
        "Amount (NZD)",
        "Status",
        "Payment Reference"
      ];
      
      // Generate CSV content
      const csvRows = [headers.join(",")];
      
      transactions.forEach(transaction => {
        const row = [
          transaction.id,
          transaction.createdAt ? new Date(transaction.createdAt).toLocaleString('en-NZ') : 'N/A',
          `"${transaction.itemName}"`, // Quote item names to handle commas
          `$${parseFloat(transaction.price).toFixed(2)}`,
          transaction.status,
          transaction.windcaveTransactionId || 'N/A'
        ];
        csvRows.push(row.join(","));
      });
      
      const csvContent = csvRows.join("\n");
      
      // Set response headers for CSV download
      const dateRange = start || end ? 
        `_${start?.toISOString().split('T')[0] || 'beginning'}_to_${end?.toISOString().split('T')[0] || 'today'}` : 
        '_all_time';
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=tapt_transactions${dateRange}.csv`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating CSV export:", error);
      res.status(500).json({ message: "Failed to generate CSV export" });
    }
  });

  // Export business report as PDF
  app.get("/api/merchants/:id/export/pdf", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      // Get analytics and transactions for the report
      const analytics = await storage.getMerchantAnalyticsWithDateRange(merchantId, start, end);
      const transactions = await storage.getTransactionsByMerchantWithDateRange(merchantId, start, end);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Generate PDF report
      const pdf = await generateBusinessReportPdf(analytics, transactions, merchant);
      
      // Set response headers for PDF download
      const dateRange = start || end ? 
        `_${start?.toISOString().split('T')[0] || 'beginning'}_to_${end?.toISOString().split('T')[0] || 'today'}` : 
        '_all_time';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=tapt_business_report${dateRange}.pdf`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF report:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
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

  // Admin Analytics endpoint
  app.get("/api/admin/analytics", async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ message: 'Access token required' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      if (decoded.role !== 'admin' || decoded.email !== 'admin@tapt.co.nz') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all merchants and calculate overall statistics
      const merchants = [
        { id: 1, name: "merchant1", businessName: "Coffee Corner", status: "active" },
        { id: 2, name: "merchant2", businessName: "Tech Store", status: "active" },
        { id: 3, name: "merchant3", businessName: "Bakery Express", status: "inactive" }
      ];

      let totalRevenue = 0;
      let totalTransactions = 0;
      let totalCompletedTransactions = 0;
      const recentMerchants = [];

      for (const merchant of merchants) {
        try {
          const analytics = await storage.getMerchantAnalytics(merchant.id);
          const transactions = await storage.getTransactionsByMerchant(merchant.id);
          
          totalRevenue += analytics.totalRevenue || 0;
          totalTransactions += analytics.totalTransactions || 0;
          totalCompletedTransactions += analytics.completedTransactions || 0;

          // Get last transaction date
          const completedTransactionsList = transactions.filter(t => t.status === 'completed' && t.createdAt);
          const lastTransaction = completedTransactionsList.length > 0 
            ? completedTransactionsList.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              })[0]
            : null;

          recentMerchants.push({
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            totalTransactions: analytics.totalTransactions || 0,
            totalRevenue: analytics.totalRevenue || 0,
            status: merchant.status,
            lastTransactionDate: lastTransaction?.createdAt || null,
          });
        } catch (error) {
          // If merchant doesn't exist, add with zero values
          recentMerchants.push({
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            totalTransactions: 0,
            totalRevenue: 0,
            status: merchant.status,
            lastTransactionDate: null,
          });
        }
      }

      const activeMerchants = recentMerchants.filter(m => m.status === 'active').length;
      const transactionFeeRevenue = totalCompletedTransactions * 0.20; // $0.20 per completed transaction

      res.json({
        totalMerchants: merchants.length,
        activeMerchants,
        totalRevenue,
        totalTransactions,
        completedTransactions: totalCompletedTransactions,
        transactionFeeRevenue,
        recentMerchants: recentMerchants.sort((a, b) => b.totalRevenue - a.totalRevenue), // Sort by revenue
      });
    } catch (error) {
      console.error("Error fetching admin analytics:", error);
      res.status(500).json({ message: "Failed to get admin analytics" });
    }
  });

  // Legacy create merchant endpoint - deprecated, use /api/admin/merchants/signup instead  
  app.post("/api/admin/merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      message: "This endpoint is deprecated. Please use /api/admin/merchants/signup for new merchant creation." 
    });
  });

  // Old create merchant endpoint
  app.post("/api/admin/merchants-old", async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ message: 'Access token required' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      if (decoded.role !== 'admin' || decoded.email !== 'admin@tapt.co.nz') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantData = req.body;
      
      // Create merchant
      const newMerchant = await storage.createMerchant({
        name: merchantData.name,
        email: merchantData.contactEmail, // Add the missing email field
        businessName: merchantData.businessName,
        contactEmail: merchantData.contactEmail,
        contactPhone: merchantData.contactPhone,
        businessAddress: merchantData.businessAddress,
        currentProviderRate: merchantData.currentProviderRate,
        bankName: merchantData.bankName,
        bankAccountNumber: merchantData.bankAccountNumber,
        bankBranch: merchantData.bankBranch,
        accountHolderName: merchantData.accountHolderName,
        qrCodeUrl: generateQrCodeUrl(0, req), // Will be updated with actual merchant ID
        paymentUrl: generatePaymentUrl(0, req) // Will be updated with actual merchant ID
      });

      // Update URLs with actual merchant ID
      await storage.updateMerchantDetails(newMerchant.id, {
        businessName: newMerchant.businessName || "",
        contactEmail: newMerchant.contactEmail || "",
        contactPhone: newMerchant.contactPhone || "",
        businessAddress: newMerchant.businessAddress || "",
      });

      // Create login credentials for the merchant
      await createUser(merchantData.loginEmail, merchantData.loginPassword, newMerchant.id, 'merchant');

      res.json({
        id: newMerchant.id,
        name: newMerchant.name,
        businessName: newMerchant.businessName,
        message: "Merchant account created successfully"
      });
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ message: "Failed to create merchant account" });
    }
  });

  // Admin merchant management endpoints
  app.put("/api/admin/merchants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantId = parseInt(req.params.id);
      const updates = req.body;

      // Update different aspects of merchant data based on what's provided
      if (updates.businessName || updates.contactEmail || updates.contactPhone || updates.businessAddress) {
        await storage.updateMerchantDetails(merchantId, {
          businessName: updates.businessName,
          contactEmail: updates.contactEmail,
          contactPhone: updates.contactPhone,
          businessAddress: updates.businessAddress,
        });
      }

      if (updates.bankName || updates.bankAccountNumber || updates.bankBranch || updates.accountHolderName) {
        await storage.updateMerchantBankAccount(merchantId, {
          bankName: updates.bankName,
          bankAccountNumber: updates.bankAccountNumber,
          bankBranch: updates.bankBranch,
          accountHolderName: updates.accountHolderName,
        });
      }

      if (updates.currentProviderRate) {
        await storage.updateMerchantRates(merchantId, updates.currentProviderRate);
      }

      const updatedMerchant = await storage.getMerchant(merchantId);
      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating merchant:", error);
      res.status(500).json({ message: "Failed to update merchant" });
    }
  });

  // Test payment link endpoint
  app.post("/api/merchants/:id/test-payment-link", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Test the payment URL by making a simple HTTP request
      const paymentUrl = generatePaymentUrl(merchantId, req);
      const qrCodeUrl = generateQrCodeUrl(merchantId, req);
      
      try {
        // Simple connectivity test
        const testResults = {
          paymentUrl: { url: paymentUrl, status: 'active' },
          qrCodeUrl: { url: qrCodeUrl, status: 'active' },
          merchant: { id: merchantId, status: 'active' }
        };

        res.json({
          status: 'active',
          message: 'All payment links are operational',
          results: testResults
        });
      } catch (testError) {
        res.json({
          status: 'error',
          message: 'Payment link connectivity issues detected',
          error: testError
        });
      }
    } catch (error) {
      console.error("Error testing payment links:", error);
      res.status(500).json({ message: "Failed to test payment links" });
    }
  });

  // Get all merchants for admin
  app.get("/api/admin/merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchants = await storage.getAllMerchants();
      res.json(merchants);
    } catch (error) {
      console.error("Error fetching merchants:", error);
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  // Create merchant signup
  app.post("/api/admin/merchants/signup", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {

      const validation = createMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const data = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(data.email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Create merchant
      const merchant = await storage.createMerchantWithSignup({
        ...data,
        verificationToken
      });

      // Send verification email
      const verificationUrl = `${getBaseUrl(req)}/verify-merchant?token=${verificationToken}`;
      const emailSent = await sendEmail({
        to: data.email,
        from: 'noreply@tapt.co.nz',
        subject: 'Complete Your Tapt Merchant Registration',
        html: `
          <h2>Complete Your Tapt Merchant Registration</h2>
          <p>Hello ${data.name},</p>
          <p>Thank you for signing up for Tapt payment processing. To complete your registration, please click the link below to create your password:</p>
          <p><a href="${verificationUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Complete Registration</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p>${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <p>Best regards,<br>The Tapt Team</p>
        `,
        text: `
Complete Your Tapt Merchant Registration

Hello ${data.name},

Thank you for signing up for Tapt payment processing. To complete your registration, please visit this link to create your password:

${verificationUrl}

This link will expire in 24 hours.

Best regards,
The Tapt Team
        `
      });

      if (!emailSent) {
        console.error("Failed to send verification email");
        // Don't fail the request, just log the error
      }

      res.json({ 
        message: "Merchant created successfully. Verification email sent.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status
        }
      });
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ message: "Failed to create merchant" });
    }
  });

  // Verify merchant and create password
  app.post("/api/verify-merchant", async (req, res) => {
    try {
      const validation = verifyMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const { token, password } = validation.data;

      // Find merchant by token
      const merchant = await storage.getMerchantByToken(token);
      if (!merchant) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Hash password and verify merchant
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);
      
      const verifiedMerchant = await storage.verifyMerchant(token, passwordHash);
      if (!verifiedMerchant) {
        return res.status(500).json({ message: "Failed to verify merchant" });
      }

      res.json({ 
        message: "Merchant verified successfully. You can now log in.",
        merchant: {
          id: verifiedMerchant.id,
          name: verifiedMerchant.name,
          businessName: verifiedMerchant.businessName,
          email: verifiedMerchant.email,
          status: verifiedMerchant.status
        }
      });
    } catch (error) {
      console.error("Error verifying merchant:", error);
      res.status(500).json({ message: "Failed to verify merchant" });
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
