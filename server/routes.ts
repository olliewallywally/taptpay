import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionSchema, updateMerchantRatesSchema, updateMerchantDetailsSchema, updateBankAccountSchema, updateThemeSchema, forgotPasswordSchema, resetPasswordSchema, createMerchantSchema, verifyMerchantSchema, changePasswordSchema, createRefundSchema, insertRefundSchema, createTaptStoneSchema, createStockItemSchema, updateStockItemSchema } from "@shared/schema";
import { windcaveService } from "./windcave";
import { authenticateUser, generateToken, authenticateToken, createUser, requestPasswordReset, resetPassword, validateResetToken, type AuthenticatedRequest } from "./auth";
import { generateReceiptPdf } from "./pdf-generator";
import { generateBusinessReportPdf } from "./report-generator";
import { getBaseUrl, generatePaymentUrl, generateQrCodeUrl, generateStonePaymentUrl } from "./url-utils";
import { sendEmail } from "./email-service";
import QRCode from "qrcode";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";

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

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      // For admin users, we verify directly from the token
      if (decoded.role === 'admin' && decoded.email === 'oliverleonard.professional@gmail.com') {
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
        next();
      } else {
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch (error) {
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
      if (email === "oliverleonard.professional@gmail.com" && password === "TAPTpay") {
        const adminUser = {
          id: 1,
          email: "oliverleonard.professional@gmail.com",
          password: "TAPTpay",
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

  // Regular user authentication check
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

  app.get("/api/admin/auth/me", (req: AuthenticatedRequest, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      // For admin users, we verify directly from the token since they're not stored in the users Map
      if (decoded.role === 'admin' && decoded.email === 'oliverleonard.professional@gmail.com') {
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

      // Set response headers for PNG image - STATIC QR per merchant
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days - QR never changes per merchant
      res.setHeader('ETag', `"merchant-qr-${merchantId}"`); // Static ETag per merchant
      
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="tapt-payment-qr-merchant-${merchantId}.png"`);
      }
      
      // Generate QR code with current payment URL
      const currentPaymentUrl = generatePaymentUrl(merchantId, undefined, req);
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

  // Generate QR code for specific tapt stone
  app.get("/api/merchants/:id/stone/:stoneId/qr", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const stoneId = parseInt(req.params.stoneId);
      
      // Verify stone exists and belongs to merchant
      const stone = await storage.getTaptStone(stoneId);
      if (!stone || stone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      // Get size parameter (default to 400, allow up to 1000 for downloads)
      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);
      const isDownload = req.query.download === 'true';

      // Set response headers for PNG image - STATIC QR per stone
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days - QR never changes per stone
      res.setHeader('ETag', `"stone-qr-${stoneId}"`); // Static ETag per stone
      
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="tapt-payment-qr-merchant-${merchantId}-stone-${stoneId}.png"`);
      }
      
      // Generate QR code with current payment URL for this stone
      const currentPaymentUrl = generateStonePaymentUrl(merchantId, stoneId, req);
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
      console.error("Stone QR code generation error:", error);
      res.status(500).json({ message: "Failed to generate QR code for stone" });
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
      const currentPaymentUrl = generatePaymentUrl(id, undefined, req);
      const currentQrCodeUrl = generateQrCodeUrl(id, undefined, req);
      
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

  // Get active transaction for merchant - ultra-fast optimized
  app.get("/api/merchants/:id/active-transaction", async (req, res) => {
    const merchantId = parseInt(req.params.id);
    
    // Ultra-fast headers for immediate response
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json'
    });
    
    try {
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

      // Create transaction data without selectedStoneId for database
      const { selectedStoneId, ...transactionData } = validation.data;
      const transaction = await storage.createTransaction(transactionData);
      
      // If a specific stone was selected, associate the transaction with it
      if (selectedStoneId) {
        try {
          await storage.associateTransactionWithStone(transaction.id, selectedStoneId);
        } catch (error) {
          console.error("Failed to associate transaction with stone:", error);
          // Continue anyway, transaction is still valid
        }
      }
      
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

  // Create bill split
  app.post("/api/transactions/:id/split", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { totalSplits } = req.body;

      if (!totalSplits || totalSplits < 2 || totalSplits > 10) {
        return res.status(400).json({ message: "Total splits must be between 2 and 10" });
      }

      const updatedTransaction = await storage.createBillSplit(transactionId, totalSplits);
      
      if (!updatedTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Notify connected clients about the split
      const connections = sseConnections.get(updatedTransaction.merchantId);
      if (connections) {
        connections.forEach(conn => {
          conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction: updatedTransaction })}\n\n`);
        });
      }

      res.json(updatedTransaction);
    } catch (error) {
      console.error("Error creating bill split:", error);
      res.status(500).json({ message: "Failed to create bill split" });
    }
  });

  // NFC Tap to Phone Payment API
  app.post("/api/merchants/:merchantId/nfc-pay", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const { amount, itemName, deviceId, nfcCapabilities } = req.body;
      
      // Validate required fields
      if (!amount || !itemName) {
        return res.status(400).json({ message: "Amount and item name are required" });
      }
      
      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Create transaction with NFC payment method
      const transaction = await storage.createTransaction({
        merchantId,
        itemName,
        price: amount.toString(),
        paymentMethod: "nfc_tap",
        deviceId: deviceId || "unknown",
        status: "pending"
      });
      
      // Generate NFC session for contactless payment
      const nfcSessionId = `NFC_${transaction.id}_${Date.now()}`;
      
      // Update transaction with NFC session ID
      await storage.updateTransactionNfcSession(transaction.id, nfcSessionId);
      
      // Create Windcave payment session for NFC/contactless
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const merchantReference = `NFC_${transaction.id}_${Date.now()}`;
      
      const session = await windcaveService.createPaymentSession(
        amount.toString(),
        merchantReference,
        baseUrl
      );
      
      // Notify connected clients about new NFC transaction
      const connections = sseConnections.get(merchantId);
      if (connections) {
        connections.forEach(conn => {
          conn.write(`data: ${JSON.stringify({ 
            type: 'nfc_transaction_created', 
            transaction: { ...transaction, nfcSessionId },
            nfcSession: {
              sessionId: nfcSessionId,
              amount: amount,
              merchantName: merchant.businessName || merchant.name,
              paymentMethods: ['apple_pay', 'google_pay', 'contactless_card']
            }
          })}\n\n`);
        });
      }
      
      res.json({
        success: true,
        transaction: { ...transaction, nfcSessionId },
        nfcSession: {
          sessionId: nfcSessionId,
          amount: amount,
          merchantName: merchant.businessName || merchant.name,
          windcaveSessionId: session?.id,
          paymentUrl: session?.links?.find(link => link.rel === "self")?.href,
          supportedMethods: [
            'apple_pay',
            'google_pay', 
            'samsung_pay',
            'contactless_card',
            'nfc_enabled_cards'
          ]
        }
      });
    } catch (error) {
      console.error("NFC payment creation error:", error);
      res.status(500).json({ message: "Failed to create NFC payment session" });
    }
  });

  // Process NFC payment completion
  app.post("/api/nfc-sessions/:sessionId/complete", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { paymentMethod, paymentData, deviceFingerprint } = req.body;
      
      // Find transaction by NFC session ID
      const transaction = await storage.getTransactionByNfcSession(sessionId);
      if (!transaction) {
        return res.status(404).json({ message: "NFC session not found" });
      }
      
      // Update transaction status to processing
      await storage.updateTransactionStatus(transaction.id, "processing");
      
      // Simulate contactless payment processing
      // In production, this would integrate with actual NFC payment processors
      const isSimulation = !windcaveService.isConfigured();
      
      if (isSimulation) {
        // In a real NFC system, this endpoint would only be called when hardware detects a physical tap
        // Process payment immediately since this represents a completed NFC tap
        const finalStatus = "completed";
        const windcaveTransactionId = `NFC_${Date.now()}`;
        
        const updatedTransaction = await storage.updateTransactionStatus(
          transaction.id, 
          finalStatus, 
          windcaveTransactionId
        );
        
        // Collect platform fee for successful payment
        await storage.createPlatformFee({
          transactionId: transaction.id,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.05",
          transactionAmount: transaction.price,
          status: 'collected',
        });
        
        // Notify clients of completion
        const connections = sseConnections.get(transaction.merchantId);
        if (connections) {
          connections.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'nfc_payment_completed', 
              transaction: updatedTransaction,
              paymentMethod: paymentMethod || 'contactless_card'
            })}\n\n`);
          });
        }
        
        res.json({ 
          message: "NFC payment completed successfully", 
          status: "completed",
          transaction: updatedTransaction
        });
      } else {
        // Real Windcave NFC processing would go here
        res.json({ 
          message: "NFC payment session created", 
          status: "processing",
          windcaveSession: "Real NFC processing not implemented yet" 
        });
      }
    } catch (error) {
      console.error("NFC payment completion error:", error);
      res.status(500).json({ message: "Failed to complete NFC payment" });
    }
  });

  // Get NFC payment capabilities for a device
  app.get("/api/nfc/capabilities", (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isIOS = /iPhone|iPad|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isDesktop = !isIOS && !isAndroid;
    
    const capabilities = {
      nfcSupported: !isDesktop,
      applePay: isIOS,
      googlePay: isAndroid,
      samsungPay: isAndroid && /Samsung/.test(userAgent),
      contactlessCard: true,
      webNFC: 'NDEFReader' in global, // Web NFC API support
      recommendations: []
    };
    
    if (isIOS) {
      (capabilities.recommendations as string[]).push("Use Apple Pay for fastest checkout");
    } else if (isAndroid) {
      (capabilities.recommendations as string[]).push("Use Google Pay or tap your card");
    } else {
      (capabilities.recommendations as string[]).push("Use QR code for payment on desktop");
    }
    
    res.json(capabilities);
  });

  // Process payment with Windcave
  app.post("/api/transactions/:id/pay", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      let paymentAmount = transaction.price;
      let currentSplit = null;

      // Check if this is a split transaction
      if (transaction.isSplit) {
        // Get the next pending split to pay
        currentSplit = await storage.getNextPendingSplit(transactionId);
        
        if (!currentSplit) {
          return res.status(400).json({ message: "All splits have been paid" });
        }
        
        paymentAmount = currentSplit.amount;
        
        // Update the split status to processing
        await storage.updateSplitPaymentStatus(currentSplit.id, "processing");
      } else {
        // Update status to processing for regular transaction
        await storage.updateTransactionStatus(transactionId, "processing");
      }
      
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
      const merchantReference = transaction.isSplit 
        ? `SPLIT_${currentSplit.id}_${Date.now()}`
        : `TXN_${transactionId}_${Date.now()}`;
      
      const session = await windcaveService.createPaymentSession(
        paymentAmount,
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
            
            let finalTransaction;
            
            if (transaction.isSplit && currentSplit) {
              // Update the specific split payment
              await storage.updateSplitPaymentStatus(currentSplit.id, status, windcaveTransactionId);
              
              // Get updated transaction (status might change if all splits are completed)
              finalTransaction = await storage.getTransaction(transactionId);
              
              // Create platform fee for this split if successful
              if (status === "completed") {
                await storage.createPlatformFee({
                  transactionId: transactionId,
                  merchantId: transaction.merchantId,
                  feeAmount: currentSplit.platformFeeAmount,
                  transactionAmount: currentSplit.amount,
                  status: 'collected',
                });
              }
            } else {
              // Regular transaction processing
              finalTransaction = await storage.updateTransactionStatus(transactionId, status, windcaveTransactionId);
              
              // Create platform fee if successful
              if (status === "completed") {
                await storage.createPlatformFee({
                  transactionId: transactionId,
                  merchantId: transaction.merchantId,
                  feeAmount: transaction.platformFeeAmount || "0.05",
                  transactionAmount: transaction.price,
                  status: 'collected',
                });
              }
            }
            
            // Notify clients of final result
            const connections = sseConnections.get(transaction.merchantId);
            if (connections) {
              connections.forEach(conn => {
                conn.write(`data: ${JSON.stringify({ type: 'transaction_updated', transaction: finalTransaction })}\n\n`);
              });
            }
          }, 2000);

          res.json({ 
            message: transaction.isSplit 
              ? `Payment processing started for split ${currentSplit.splitIndex} of ${transaction.totalSplits} (simulation mode)`
              : "Payment processing started (simulation mode)"
          });
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

  // Get revenue over time data
  app.get("/api/merchants/:id/revenue-over-time", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const days = parseInt(req.query.days as string) || 30;
      const revenueData = await storage.getRevenueOverTime(merchantId, days);
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue over time:", error);
      res.status(500).json({ message: "Failed to get revenue data" });
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

  // Admin manual merchant activation (bypass email verification)
  app.post("/api/admin/merchants/:id/activate", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required for activation" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status === 'verified') {
        return res.status(400).json({ message: "Merchant already verified" });
      }

      // Hash the password and activate merchant
      const passwordHash = await bcrypt.hash(password, 10);
      const updatedMerchant = await storage.verifyMerchant(merchant.verificationToken || '', passwordHash);

      if (!updatedMerchant) {
        return res.status(500).json({ message: "Failed to activate merchant" });
      }

      res.json({
        message: "Merchant activated successfully",
        merchant: {
          id: updatedMerchant.id,
          name: updatedMerchant.name,
          businessName: updatedMerchant.businessName,
          email: updatedMerchant.email,
          status: updatedMerchant.status
        }
      });

    } catch (error) {
      console.error("Admin activation error:", error);
      res.status(500).json({ message: "Failed to activate merchant" });
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
  app.put("/api/merchants/:id/details", authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  // Change merchant password
  app.put("/api/merchants/:id/change-password", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = changePasswordSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validation.error.errors 
        });
      }

      const { currentPassword, newPassword } = validation.data;

      // Get merchant to verify current password
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant || !merchant.passwordHash) {
        return res.status(404).json({ message: "Merchant not found or password not set" });
      }

      // Verify current password
      const currentPasswordValid = await bcrypt.compare(currentPassword, merchant.passwordHash);
      if (!currentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      const updatedMerchant = await storage.verifyMerchant(merchant.verificationToken || '', newPasswordHash);

      if (!updatedMerchant) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ message: "Password updated successfully" });

    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.put("/api/merchants/:id/bank-account", authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.put("/api/merchants/:id/theme", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = updateThemeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid theme selection", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantTheme(merchantId, validation.data.themeId);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating theme:", error);
      res.status(500).json({ message: "Failed to update theme" });
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

  // Tapt Stone API routes
  
  // Get all tapt stones for a merchant
  app.get("/api/merchants/:id/tapt-stones", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const stones = await storage.getTaptStonesByMerchant(merchantId);
      res.json(stones);
    } catch (error) {
      console.error("Error fetching tapt stones:", error);
      res.status(500).json({ message: "Failed to get tapt stones" });
    }
  });

  // Create a new tapt stone
  app.post("/api/merchants/:id/tapt-stones", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get existing stones count to determine next stone number
      const existingStones = await storage.getTaptStonesByMerchant(merchantId);
      const nextStoneNumber = existingStones.length + 1;

      // Check if merchant already has 10 stones (max limit)
      if (existingStones.length >= 10) {
        return res.status(400).json({ message: "Maximum 10 tapt stones allowed per merchant" });
      }

      const validation = createTaptStoneSchema.safeParse({
        merchantId,
        name: `Stone ${nextStoneNumber}`,
        stoneNumber: nextStoneNumber,
      });

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid tapt stone data", 
          errors: validation.error.errors 
        });
      }

      const newStone = await storage.createTaptStone(validation.data);
      
      // Generate QR code and payment URL for the new stone
      const baseUrl = getBaseUrl(req);
      const stoneId = Number(newStone.id); // Ensure it's a number
      const qrCodeUrl = generateQrCodeUrl(merchantId, stoneId);
      const paymentUrl = generatePaymentUrl(merchantId, stoneId);
      
      // Update the stone with the URLs
      const updatedStone = await storage.updateTaptStoneUrls(newStone.id, qrCodeUrl, paymentUrl);
      
      res.json(updatedStone);
    } catch (error) {
      console.error("Error creating tapt stone:", error);
      res.status(500).json({ message: "Failed to create tapt stone" });
    }
  });

  // Delete a tapt stone
  app.delete("/api/tapt-stones/:id", async (req, res) => {
    try {
      const stoneId = parseInt(req.params.id);
      const success = await storage.deleteTaptStone(stoneId);
      
      if (!success) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }
      
      res.json({ message: "Tapt stone deleted successfully" });
    } catch (error) {
      console.error("Error deleting tapt stone:", error);
      res.status(500).json({ message: "Failed to delete tapt stone" });
    }
  });

  // Get specific tapt stone details
  app.get("/api/tapt-stones/:id", async (req, res) => {
    try {
      const stoneId = parseInt(req.params.id);
      const stone = await storage.getTaptStone(stoneId);
      
      if (!stone || !stone.isActive) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }
      
      res.json(stone);
    } catch (error) {
      console.error("Error fetching tapt stone:", error);
      res.status(500).json({ message: "Failed to get tapt stone" });
    }
  });

  // Platform fee analytics (admin only)
  app.get("/api/admin/platform-fees", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const totalFees = await storage.getTotalPlatformRevenue();
      res.json(totalFees);
    } catch (error) {
      console.error("Error fetching platform fees:", error);
      res.status(500).json({ message: "Failed to fetch platform fees" });
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
  app.get("/api/admin/analytics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Get all merchants from storage
      const merchants = await storage.getAllMerchants();

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
      const newMerchant = await storage.createMerchantWithPassword({
        name: merchantData.name,
        email: merchantData.contactEmail,
        businessName: merchantData.businessName,
        contactEmail: merchantData.contactEmail,
        contactPhone: merchantData.contactPhone,
        businessAddress: merchantData.businessAddress,
        currentProviderRate: merchantData.currentProviderRate,
        bankName: merchantData.bankName,
        bankAccountNumber: merchantData.bankAccountNumber,
        bankBranch: merchantData.bankBranch,
        accountHolderName: merchantData.accountHolderName,
        qrCodeUrl: generateQrCodeUrl(0, undefined, req), // Will be updated with actual merchant ID
        paymentUrl: generatePaymentUrl(0, undefined, req) // Will be updated with actual merchant ID
      }, "tempPassword");

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
      const paymentUrl = generatePaymentUrl(merchantId, undefined, req);
      const qrCodeUrl = generateQrCodeUrl(merchantId, undefined, req);
      
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

  // Delete merchant (admin only)
  app.delete("/api/admin/merchants/:id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const deleted = await storage.deleteMerchant(merchantId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete merchant" });
      }

      res.json({ message: "Merchant deleted successfully" });
    } catch (error) {
      console.error("Error deleting merchant:", error);
      res.status(500).json({ message: "Failed to delete merchant" });
    }
  });

  // Clear problematic merchants endpoint
  app.post("/api/admin/clear-merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const problemEmails = [
        'oliverleonard.professional@gmail.com',
        'dmizedzn@gmail.com', 
        'oliverharryleonard@gmail.com'
      ];
      
      let clearedCount = 0;
      for (const email of problemEmails) {
        const merchant = await storage.getMerchantByEmail(email);
        if (merchant) {
          // For MemStorage, we need to manually remove from the map
          if ('merchants' in storage) {
            (storage as any).merchants.delete(merchant.id);
            clearedCount++;
          }
        }
      }
      
      res.json({ 
        message: `Cleared ${clearedCount} problematic merchants`,
        clearedEmails: problemEmails
      });
    } catch (error) {
      console.error("Clear merchants error:", error);
      res.status(500).json({ message: "Failed to clear merchants" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/admin/resend-verification", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find merchant by email
      const merchant = await storage.getMerchantByEmail(email);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status !== "pending") {
        return res.status(400).json({ message: "Merchant is already verified" });
      }

      if (!merchant.verificationToken) {
        return res.status(400).json({ message: "No verification token found for this merchant" });
      }

      // Send verification email using the new email service
      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      
      const emailSent = await sendMerchantVerificationEmail(
        merchant.email,
        merchant.verificationToken,
        merchant.businessName || merchant.name,
        baseUrl
      );

      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      res.json({
        message: "Verification email sent successfully",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status
        }
      });

    } catch (error) {
      console.error("Error resending verification email:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // Test email endpoint
  // Clear all merchants  
  app.post("/api/admin/clear-merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantsBefore = await storage.getAllMerchants();
      
      // Clear all merchants  
      for (const merchant of merchantsBefore) {
        await storage.deleteMerchant(merchant.id);
      }

      res.json({ 
        message: `Cleared ${merchantsBefore.length} merchants successfully`,
        deletedMerchants: merchantsBefore.length
      });
    } catch (error) {
      console.error("Error clearing merchants:", error);
      res.status(500).json({ message: "Failed to clear merchants" });
    }
  });

  app.post("/api/admin/test-email", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const testEmail = await sendEmail({
        to: req.user?.email || 'test@example.com',
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@tapt.co.nz',
        subject: 'Tapt SendGrid Test Email',
        text: 'This is a test email to verify SendGrid configuration.',
        html: '<h2>SendGrid Test</h2><p>This is a test email to verify SendGrid configuration.</p>'
      });

      if (testEmail) {
        res.json({ success: true, message: 'Test email sent successfully' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to send test email' });
      }
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({ success: false, message: 'Failed to send test email', error: error });
    }
  });

  // Debug route to sync verified merchants
  app.post("/api/debug/sync-merchants", async (req, res) => {
    try {
      const { syncVerifiedMerchants } = await import('./auth');
      await syncVerifiedMerchants();
      res.json({ success: true, message: "Verified merchants synced successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to check auth users
  app.get("/api/debug/auth-users", async (req, res) => {
    try {
      const { getUserByEmail } = await import('./auth');
      const user = getUserByEmail('oliverharryleonard@gmail.com');
      if (user) {
        res.json({ 
          found: true, 
          user: { 
            id: user.id, 
            email: user.email, 
            merchantId: user.merchantId, 
            role: user.role,
            hasPassword: !!user.password 
          } 
        });
      } else {
        res.json({ found: false });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to test password
  app.post("/api/debug/test-password", async (req, res) => {
    try {
      const bcrypt = await import('bcrypt');
      const { hash, password } = req.body;
      const isValid = await bcrypt.compare(password, hash);
      res.json({ isValid, hash: hash.substring(0, 20) + "...", password });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to fix missing auth user
  app.post("/api/debug/fix-auth-user", async (req, res) => {
    try {
      // Get the verified merchant
      const merchant = await storage.getMerchant(22);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Create auth user with default password
      try {
        const user = await createUser(merchant.email, "123456", merchant.id, 'merchant');
        res.json({ 
          success: true, 
          message: `Auth user created for ${merchant.email}`,
          user: { id: user.id, email: user.email, merchantId: user.merchantId }
        });
      } catch (error: any) {
        if (error.message.includes("already exists")) {
          res.json({ success: true, message: "Auth user already exists" });
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public merchant verification endpoint
  app.post("/api/merchants/verify", async (req, res) => {
    try {
      // Simple validation without confirmPassword requirement
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ 
          message: "Token and password are required"
        });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 10);

      // Verify the merchant
      const merchant = await storage.verifyMerchant(token, passwordHash);
      if (!merchant) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Create user account for the verified merchant
      try {
        await createUser(merchant.email, password, merchant.id, 'merchant');
        console.log("User account created successfully for merchant:", merchant.email);
      } catch (error) {
        console.error("Error creating user account:", error);
        // Don't fail verification if user creation fails, but log it
      }

      res.json({
        message: "Merchant account verified successfully. You can now log in.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status,
        }
      });
    } catch (error) {
      console.error("Error verifying merchant:", error);
      res.status(500).json({ message: "Failed to verify merchant account" });
    }
  });

  // Public merchant signup (no admin required)
  app.post("/api/merchants/signup", async (req, res) => {
    try {
      const validation = createMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const { password, confirmPassword, ...merchantData } = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(merchantData.email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password for storage
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Create merchant with pending status and password
      const merchant = await storage.createMerchantWithSignup({
        ...merchantData,
        password,
        confirmPassword,
        verificationToken,
      });

      // Send verification email using the new email service
      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      
      const emailSent = await sendMerchantVerificationEmail(
        merchantData.email,
        verificationToken,
        merchantData.businessName || merchantData.name,
        baseUrl
      );

      if (!emailSent) {
        console.warn('Failed to send verification email, but merchant account was created');
      }

      res.json({
        message: "Merchant account created successfully. Please check your email to verify your account.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status
        }
      });

    } catch (error) {
      console.error("Public merchant signup error:", error);
      res.status(500).json({ message: "Failed to create merchant account" });
    }
  });

  // Create merchant signup (admin version)
  app.post("/api/admin/merchants/signup", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {

      const validation = createMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const { password, confirmPassword, ...merchantData } = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(merchantData.email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate URLs for the merchant
      const tempMerchantId = Date.now(); // Temporary ID for URL generation
      const paymentUrl = generatePaymentUrl(tempMerchantId);
      const qrCodeUrl = generateQrCodeUrl(tempMerchantId);

      // Generate proper URLs with actual merchant ID after creation
      const merchant = await storage.createMerchantWithPassword({
        ...merchantData,
        qrCodeUrl: `temp`, // Will be updated after creation
        paymentUrl: `temp` // Will be updated after creation
      }, passwordHash);

      // Update with proper URLs now that we have the merchant ID
      const actualPaymentUrl = generatePaymentUrl(merchant.id);
      const actualQrCodeUrl = generateQrCodeUrl(merchant.id);
      
      await storage.updateMerchantDetails(merchant.id, {
        businessName: merchant.businessName,
        contactEmail: merchant.email,
        contactPhone: merchant.phone || '',
        businessAddress: merchant.address || ''
      });

      res.json({ 
        message: "Merchant created successfully and is ready to use.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: 'verified'
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
      const passwordHash = await bcrypt.hash(password, 10);
      
      const verifiedMerchant = await storage.verifyMerchant(token, passwordHash);
      if (!verifiedMerchant) {
        return res.status(500).json({ message: "Failed to verify merchant" });
      }

      // Create user account for the verified merchant
      try {
        await createUser(verifiedMerchant.email, password, verifiedMerchant.id, 'merchant');
        console.log("User account created successfully for merchant:", verifiedMerchant.email);
      } catch (error) {
        console.error("Error creating user account:", error);
        // Don't fail verification if user creation fails, but log it
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

  // Clear transactions for a merchant
  app.post("/api/merchants/:id/clear-transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const success = await storage.clearTransactions(merchantId);
      
      if (success) {
        res.json({ message: "Transactions cleared successfully" });
      } else {
        res.status(500).json({ message: "Failed to clear transactions" });
      }
    } catch (error) {
      console.error("Error clearing transactions:", error);
      res.status(500).json({ message: "Failed to clear transactions" });
    }
  });

  // ===== REFUND MANAGEMENT ROUTES =====
  
  // Create a refund for a transaction
  app.post("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      // Validate refund data
      const validation = createRefundSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid refund data", errors: validation.error.errors });
      }

      const { refundAmount, refundReason, refundMethod } = validation.data;

      // Get the original transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Verify merchant owns this transaction
      if (transaction.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if transaction can be refunded
      if (transaction.status !== "completed") {
        return res.status(400).json({ message: "Only completed transactions can be refunded" });
      }

      // Check refund amount is valid
      const requestedAmount = parseFloat(refundAmount);
      const transactionAmount = parseFloat(transaction.price);
      const alreadyRefunded = parseFloat(transaction.totalRefunded || "0");
      const refundableAmount = parseFloat(transaction.refundableAmount || transaction.price);

      if (requestedAmount > refundableAmount) {
        return res.status(400).json({ 
          message: `Refund amount cannot exceed refundable amount of $${refundableAmount.toFixed(2)}` 
        });
      }

      if (requestedAmount <= 0) {
        return res.status(400).json({ message: "Refund amount must be greater than zero" });
      }

      // Create refund record
      const refund = await storage.createRefund({
        transactionId,
        merchantId,
        refundAmount,
        refundReason,
        refundMethod,
        status: "pending",
        windcaveRefundId: null,
        completedAt: null,
      });

      // In a real system, this would integrate with Windcave refund API
      // For now, we'll simulate the refund process
      const isSimulation = !windcaveService.isConfigured();
      
      if (isSimulation) {
        // Simulate successful refund
        const windcaveRefundId = `REFUND_${Date.now()}`;
        await storage.updateRefundStatus(refund.id, "completed", windcaveRefundId);
        
        // Notify connected clients about the refund
        const connections = sseConnections.get(merchantId);
        if (connections) {
          connections.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'refund_completed', 
              refund: { ...refund, status: "completed", windcaveRefundId },
              transactionId
            })}\n\n`);
          });
        }

        res.json({ 
          success: true,
          message: "Refund processed successfully",
          refund: { ...refund, status: "completed", windcaveRefundId }
        });
      } else {
        // Real Windcave integration would go here
        res.json({ 
          success: true,
          message: "Refund request created and being processed",
          refund
        });
      }

    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  // Get refunds for a specific transaction
  app.get("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      // Get the transaction to verify ownership
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      if (transaction.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const refunds = await storage.getRefundsByTransaction(transactionId);
      res.json(refunds);

    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Get all refunds for a merchant
  app.get("/api/merchants/:merchantId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const userMerchantId = req.user?.merchantId;
      
      // Verify access
      if (userMerchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const refunds = await storage.getRefundsByMerchant(merchantId);
      res.json(refunds);

    } catch (error) {
      console.error("Error fetching merchant refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Get specific refund details
  app.get("/api/refunds/:refundId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const refundId = parseInt(req.params.refundId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      const refund = await storage.getRefund(refundId);
      if (!refund) {
        return res.status(404).json({ message: "Refund not found" });
      }

      // Verify access
      if (refund.merchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(refund);

    } catch (error) {
      console.error("Error fetching refund:", error);
      res.status(500).json({ message: "Failed to fetch refund" });
    }
  });

  // =============================================================================
  // ADMIN API MANAGEMENT ROUTES
  // =============================================================================

  // Get all API keys for admin
  app.get("/api/admin/api-keys", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // For now, return mock data since we don't have API tables yet
      const mockApiKeys = [
        {
          id: 1,
          keyName: "Shopify Store API",
          keyPrefix: "tapt_live_12ab",
          environment: "live",
          status: "active",
          permissions: ["create_transactions", "read_transactions", "webhook_events"],
          webhookUrl: "https://mystore.shopify.com/webhooks/tapt",
          rateLimitPerHour: 1000,
          lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        },
        {
          id: 2,
          keyName: "WooCommerce Integration",
          keyPrefix: "tapt_sandbox_34cd",
          environment: "sandbox",
          status: "active",
          permissions: ["create_transactions", "read_transactions"],
          webhookUrl: "",
          rateLimitPerHour: 500,
          lastUsedAt: null,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        }
      ];
      
      res.json(mockApiKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  // Create new API key
  app.post("/api/admin/api-keys", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { keyName, environment, permissions, webhookUrl, rateLimitPerHour } = req.body;
      
      // Generate API key
      const apiKey = await storage.createApiKey({
        keyName,
        environment,
        permissions,
        webhookUrl,
        rateLimitPerHour,
        merchantId: 1 // Admin creates for platform-wide use
      });

      res.json(apiKey);
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // Revoke API key
  app.post("/api/admin/api-keys/:keyId/revoke", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const keyId = parseInt(req.params.keyId);
      await storage.revokeApiKey(keyId);
      res.json({ success: true, message: "API key revoked successfully" });
    } catch (error) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // Get API metrics for admin dashboard
  app.get("/api/admin/api-metrics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await storage.getApiMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching API metrics:", error);
      res.status(500).json({ message: "Failed to fetch API metrics" });
    }
  });

  // Get API usage data
  app.get("/api/admin/api-usage", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const usageData = await storage.getApiUsageData();
      res.json(usageData);
    } catch (error) {
      console.error("Error fetching API usage:", error);  
      res.status(500).json({ message: "Failed to fetch API usage" });
    }
  });

  // =============================================================================
  // STOCK MANAGEMENT ENDPOINTS
  // =============================================================================
  
  // Get all stock items for a merchant
  app.get("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const stockItems = await storage.getStockItemsByMerchant(merchantId);
      res.json(stockItems);
    } catch (error) {
      console.error("Error fetching stock items:", error);
      res.status(500).json({ message: "Failed to fetch stock items" });
    }
  });

  // Create a new stock item
  app.post("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = createStockItemSchema.parse(req.body);
      
      const stockItem = await storage.createStockItem({
        merchantId,
        ...validatedData,
      });
      
      res.status(201).json(stockItem);
    } catch (error) {
      console.error("Error creating stock item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stock item" });
    }
  });

  // Update a stock item
  app.put("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const itemId = parseInt(req.params.itemId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = updateStockItemSchema.parse(req.body);
      
      const stockItem = await storage.updateStockItem(itemId, validatedData);
      
      if (!stockItem) {
        return res.status(404).json({ message: "Stock item not found" });
      }
      
      res.json(stockItem);
    } catch (error) {
      console.error("Error updating stock item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update stock item" });
    }
  });

  // Delete a stock item
  app.delete("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const itemId = parseInt(req.params.itemId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const success = await storage.deleteStockItem(itemId);
      
      if (!success) {
        return res.status(404).json({ message: "Stock item not found" });
      }
      
      res.json({ message: "Stock item deleted successfully" });
    } catch (error) {
      console.error("Error deleting stock item:", error);
      res.status(500).json({ message: "Failed to delete stock item" });
    }
  });

  // =============================================================================
  // PUBLIC API ROUTES FOR ECOMMERCE INTEGRATION
  // =============================================================================

  // Middleware to authenticate API keys
  const authenticateApiKey = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'API key required' });
      }

      const apiKey = authHeader.substring(7);
      const keyData = await storage.getApiKeyByKey(apiKey);
      
      if (!keyData || keyData.status !== 'active') {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      // Update last used timestamp
      await storage.updateApiKeyLastUsed(keyData.id);
      
      req.apiKey = keyData;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  };

  // Create transaction via API
  app.post("/api/v1/transactions", authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();
    
    try {
      const { amount, currency = 'NZD', item_name, customer_email, return_url, webhook_url } = req.body;
      
      // Validate required fields
      if (!amount || !item_name) {
        await storage.logApiRequest({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          endpoint: '/api/v1/transactions',
          method: 'POST',
          statusCode: 400,
          responseTime: Date.now() - startTime,
          errorMessage: 'Missing required fields'
        });
        return res.status(400).json({ error: 'amount and item_name are required' });
      }

      // Check permissions
      if (!req.apiKey.permissions.includes('create_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Create transaction
      const transaction = await storage.createTransaction({
        merchantId: req.apiKey.merchantId,
        itemName: item_name,
        price: amount,
        status: 'pending',
        paymentMethod: 'api'
      });

      // Log successful API request
      await storage.logApiRequest({
        apiKeyId: req.apiKey.id,
        merchantId: req.apiKey.merchantId,
        endpoint: '/api/v1/transactions',
        method: 'POST',
        statusCode: 200,
        responseTime: Date.now() - startTime
      });

      // Send webhook if configured
      if (webhook_url || req.apiKey.webhookUrl) {
        await storage.createWebhookDelivery({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          transactionId: transaction.id,
          eventType: 'transaction.created',
          webhookUrl: webhook_url || req.apiKey.webhookUrl,
          payload: JSON.stringify({
            event: 'transaction.created',
            data: transaction
          })
        });
      }

      res.json({
        id: transaction.id,
        amount: transaction.price,
        currency,
        item_name: transaction.itemName,
        status: transaction.status,
        payment_url: `${req.protocol}://${req.get('host')}/pay/${req.apiKey.merchantId}?transaction=${transaction.id}`,
        created_at: transaction.createdAt
      });

    } catch (error) {
      console.error("API transaction creation error:", error);
      await storage.logApiRequest({
        apiKeyId: req.apiKey?.id,
        merchantId: req.apiKey?.merchantId,
        endpoint: '/api/v1/transactions',
        method: 'POST',
        statusCode: 500,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get transaction status via API
  app.get("/api/v1/transactions/:id", authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();
    
    try {
      const transactionId = parseInt(req.params.id);
      
      // Check permissions
      if (!req.apiKey.permissions.includes('read_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        await storage.logApiRequest({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          endpoint: `/api/v1/transactions/${transactionId}`,
          method: 'GET',
          statusCode: 404,
          responseTime: Date.now() - startTime
        });
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Verify access to this merchant's transactions
      if (transaction.merchantId !== req.apiKey.merchantId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await storage.logApiRequest({
        apiKeyId: req.apiKey.id,
        merchantId: req.apiKey.merchantId,
        endpoint: `/api/v1/transactions/${transactionId}`,
        method: 'GET',
        statusCode: 200,
        responseTime: Date.now() - startTime
      });

      res.json({
        id: transaction.id,
        amount: transaction.price,
        currency: 'NZD',
        item_name: transaction.itemName,
        status: transaction.status,
        created_at: transaction.createdAt,
        windcave_transaction_id: transaction.windcaveTransactionId
      });

    } catch (error) {
      console.error("API transaction fetch error:", error);
      await storage.logApiRequest({
        apiKeyId: req.apiKey?.id,
        merchantId: req.apiKey?.merchantId,
        endpoint: `/api/v1/transactions/${req.params.id}`,
        method: 'GET',
        statusCode: 500,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Digital Wallet Payment Processing Endpoints

  // Apple Pay merchant validation endpoint
  app.post("/api/payments/apple-pay/validate", async (req, res) => {
    try {
      const { validationURL, displayName } = req.body;

      if (!validationURL) {
        return res.status(400).json({ error: "Validation URL is required" });
      }

      // In production, this would validate with Apple's servers using merchant certificates
      // For now, we'll simulate the validation response
      const isSimulation = !windcaveService.isConfigured();
      
      if (isSimulation) {
        // Simulated Apple Pay merchant session
        const merchantSession = {
          epochTimestamp: Date.now(),
          expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
          merchantSessionIdentifier: `merchant_session_${Date.now()}`,
          nonce: crypto.randomBytes(16).toString('hex'),
          merchantIdentifier: "merchant.com.tapt.payment",
          domainName: req.headers.host || "localhost:5000",
          displayName: displayName || "Tapt Payment"
        };

        res.json(merchantSession);
      } else {
        // In production, implement actual Apple Pay merchant validation
        // This requires Apple Pay merchant certificates and proper setup
        return res.status(501).json({ 
          error: "Apple Pay merchant validation not configured for production" 
        });
      }
    } catch (error) {
      console.error("Apple Pay validation error:", error);
      res.status(500).json({ error: "Failed to validate Apple Pay merchant" });
    }
  });

  // Apple Pay payment processing endpoint
  app.post("/api/payments/apple-pay/process", async (req, res) => {
    try {
      const { payment, transactionId, amount, currency = "NZD" } = req.body;

      if (!payment || !transactionId || !amount) {
        return res.status(400).json({ error: "Payment data, transaction ID, and amount are required" });
      }

      // Get the transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction status to processing
      await storage.updateTransactionStatus(transactionId, "processing");

      const isSimulation = !windcaveService.isConfigured();

      if (isSimulation) {
        // Simulate Apple Pay payment processing
        const paymentResult = {
          success: true,
          transactionId: `applepay_${Date.now()}`,
          paymentMethod: "apple_pay",
          amount: amount,
          currency: currency,
          status: "completed"
        };

        // Update transaction to completed
        const updatedTransaction = await storage.updateTransactionStatus(
          transactionId, 
          "completed", 
          paymentResult.transactionId
        );

        // Collect platform fee
        await storage.createPlatformFee({
          transactionId: transactionId,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.05",
          transactionAmount: transaction.price,
          status: 'collected',
        });

        // Notify connected clients
        const connections = sseConnections.get(transaction.merchantId);
        if (connections) {
          connections.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'transaction_updated', 
              transaction: updatedTransaction 
            })}\n\n`);
          });
        }

        res.json(paymentResult);
      } else {
        // In production, process actual Apple Pay payment token with Windcave
        // This would decrypt the payment token and submit to payment processor
        return res.status(501).json({ 
          error: "Apple Pay payment processing not configured for production" 
        });
      }
    } catch (error) {
      console.error("Apple Pay processing error:", error);
      res.status(500).json({ error: "Failed to process Apple Pay payment" });
    }
  });

  // Google Pay payment processing endpoint
  app.post("/api/payments/google-pay/process", async (req, res) => {
    try {
      const { paymentMethodData, transactionId, amount, currency = "NZD" } = req.body;

      if (!paymentMethodData || !transactionId || !amount) {
        return res.status(400).json({ error: "Payment method data, transaction ID, and amount are required" });
      }

      // Get the transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction status to processing
      await storage.updateTransactionStatus(transactionId, "processing");

      const isSimulation = !windcaveService.isConfigured();

      if (isSimulation) {
        // Simulate Google Pay payment processing
        const paymentResult = {
          success: true,
          transactionId: `googlepay_${Date.now()}`,
          paymentMethod: "google_pay",
          amount: amount,
          currency: currency,
          status: "completed"
        };

        // Update transaction to completed
        const updatedTransaction = await storage.updateTransactionStatus(
          transactionId, 
          "completed", 
          paymentResult.transactionId
        );

        // Collect platform fee
        await storage.createPlatformFee({
          transactionId: transactionId,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.05",
          transactionAmount: transaction.price,
          status: 'collected',
        });

        // Notify connected clients
        const connections = sseConnections.get(transaction.merchantId);
        if (connections) {
          connections.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'transaction_updated', 
              transaction: updatedTransaction 
            })}\n\n`);
          });
        }

        res.json(paymentResult);
      } else {
        // In production, process actual Google Pay payment token with Windcave
        // This would validate and process the payment token
        return res.status(501).json({ 
          error: "Google Pay payment processing not configured for production" 
        });
      }
    } catch (error) {
      console.error("Google Pay processing error:", error);
      res.status(500).json({ error: "Failed to process Google Pay payment" });
    }
  });

  // Digital wallet configuration endpoint
  app.get("/api/payments/digital-wallet/config", async (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || '';
      const isIOS = /iPhone|iPad|iPod/.test(userAgent);
      const isAndroid = /Android/.test(userAgent);
      const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(req.headers['user-agent'] || '');

      const config = {
        applePaySupported: isIOS,
        googlePaySupported: isAndroid && isChrome,
        paymentRequestSupported: !!globalThis.PaymentRequest,
        environment: windcaveService.isConfigured() ? "production" : "test",
        merchantId: process.env.APPLE_PAY_MERCHANT_ID || "merchant.com.tapt.payment",
        merchantName: "Tapt Payment",
        supportedNetworks: ["visa", "mastercard", "amex", "eftpos"],
        countryCode: "NZ",
        currencyCode: "NZD",
        googlePayGateway: {
          gateway: "windcave",
          gatewayMerchantId: process.env.WINDCAVE_MERCHANT_ID || "test-merchant"
        }
      };

      res.json(config);
    } catch (error) {
      console.error("Digital wallet config error:", error);
      res.status(500).json({ error: "Failed to get digital wallet configuration" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
