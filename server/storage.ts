import { merchants, transactions, merchantSettlements, platformFees, refunds, splitPayments, taptStones, stockItems, cryptoTransactions, merchantSubscriptions, subscriptionBillingHistory, type Merchant, type Transaction, type InsertMerchant, type InsertTransaction, type CreateMerchant, type PlatformFee, type InsertPlatformFee, type Refund, type InsertRefund, type TaptStone, type InsertTaptStone, type StockItem, type InsertStockItem, type CryptoTransaction, type InsertCryptoTransaction, type MerchantSubscription, type SubscriptionBillingHistory } from "@shared/schema";
import { getDb, isDatabaseConnected } from "./database";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  getMerchantByEmail(email: string): Promise<Merchant | undefined>;
  getMerchantByToken(token: string): Promise<Merchant | undefined>;
  getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant>;
  createMerchantWithSignup(data: CreateMerchant & { verificationToken: string }): Promise<Merchant>;
  verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined>;
  updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined>;
  updateMerchantRates(id: number, currentProviderRate: string): Promise<Merchant | undefined>;
  updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined>;
  updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined>;
  updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined>;
  updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined>;
  updateMerchantCryptoSettings(id: number, settings: any): Promise<Merchant | undefined>;
  updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined>;
  getAllMerchants(): Promise<Merchant[]>;
  deleteMerchant(id: number): Promise<boolean>;
  
  // Transaction operations
  getTransaction(id: number): Promise<Transaction | undefined>;
  getActiveTransactionByMerchant(merchantId: number, taptStoneId?: number): Promise<Transaction | undefined>;
  getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined>;
  updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined>;
  getTransactionsByMerchant(merchantId: number): Promise<Transaction[]>;
  
  // Bill splitting operations
  createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined>;
  createSplitPayment(data: any): Promise<any>;
  getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>;
  updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>;
  getNextPendingSplit(transactionId: number): Promise<any | undefined>;
  
  // Platform revenue operations (Marketplace Model)
  createPlatformFee(data: InsertPlatformFee): Promise<PlatformFee>;
  getPlatformFee(id: number): Promise<PlatformFee | undefined>;
  getPlatformFeesByMerchant(merchantId: number): Promise<PlatformFee[]>;
  updatePlatformFeeStatus(id: number, status: string): Promise<PlatformFee | undefined>;
  getTotalPlatformRevenue(): Promise<{ totalFees: number; totalTransactions: number }>;
  
  // Refund operations
  createRefund(data: InsertRefund): Promise<Refund>;
  getRefund(id: number): Promise<Refund | undefined>;
  getRefundsByTransaction(transactionId: number): Promise<Refund[]>;
  getRefundsByMerchant(merchantId: number): Promise<Refund[]>;
  updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined>;
  
  // Tapt Stone operations
  createTaptStone(data: InsertTaptStone): Promise<TaptStone>;
  getTaptStone(id: number): Promise<TaptStone | undefined>;
  getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]>;
  updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined>;
  updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined>;
  deleteTaptStone(id: number): Promise<boolean>;
  associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void>;
  
  // Stock Item operations
  createStockItem(data: InsertStockItem): Promise<StockItem>;
  getStockItem(id: number): Promise<StockItem | undefined>;
  getStockItemsByMerchant(merchantId: number): Promise<StockItem[]>;
  updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined>;
  deleteStockItem(id: number): Promise<boolean>;
  
  // Crypto Transaction operations
  createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction>;
  getCryptoTransaction(id: number): Promise<CryptoTransaction | undefined>;
  getCryptoTransactionByTransactionId(transactionId: number): Promise<CryptoTransaction | undefined>;
  getCryptoTransactionByChargeCode(chargeCode: string): Promise<CryptoTransaction | undefined>;
  updateCryptoTransactionStatus(id: number, status: string, confirmations?: number): Promise<CryptoTransaction | undefined>;
  
  // Analytics operations
  getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }>;
  
  // Export operations
  getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]>;
  getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }>;
  
  // Clear operations
  clearTransactions(merchantId: number): Promise<boolean>;

  // API Key operations
  createApiKey(data: any): Promise<any>;
  getApiKey(id: number): Promise<any>;
  getApiKeyByKey(apiKey: string): Promise<any>;
  getApiKeysByMerchant(merchantId: number): Promise<any[]>;
  updateApiKeyStatus(id: number, status: string): Promise<any>;
  revokeApiKey(id: number): Promise<boolean>;
  updateApiKeyLastUsed(id: number): Promise<any>;
  
  // API Request tracking
  logApiRequest(data: any): Promise<any>;
  getApiMetrics(merchantId?: number): Promise<any>;
  getApiUsageData(merchantId?: number): Promise<any[]>;
  
  // Subscription operations
  getOrCreateSubscription(merchantId: number): Promise<any>;
  getSubscription(merchantId: number): Promise<any | undefined>;
  updateSubscriptionTier(merchantId: number, tier: string): Promise<any>;
  updateSubscriptionBillingFrequency(merchantId: number, frequency: string): Promise<any>;
  updateSubscriptionPaymentMethod(merchantId: number, stripeCustomerId: string, stripePaymentMethodId: string): Promise<any>;
  incrementTransactionCount(merchantId: number): Promise<void>;
  cancelSubscription(merchantId: number, reason: string): Promise<any>;
  getBillingHistory(merchantId: number, limit?: number): Promise<any[]>;
  createBillingHistory(data: any): Promise<any>;
  resetMonthlyTransactionCount(merchantId: number): Promise<void>;
  getUnbilledTransactions(merchantId: number): Promise<{ count: number; amount: number }>;
  resetUnbilledTransactions(merchantId: number): Promise<void>;
  getAllActiveSubscriptions(billingFrequency?: string): Promise<any[]>;
  
  // Webhook delivery tracking
  createWebhookDelivery(data: any): Promise<any>;
  updateWebhookDelivery(id: number, data: any): Promise<any>;
  getWebhookDeliveries(apiKeyId: number): Promise<any[]>;
  
  // Revenue analytics
  getRevenueOverTime(merchantId: number, days?: number): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>>;

  // Bill splitting operations
  createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined>;
  createSplitPayment(data: any): Promise<any>;
  getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>;
  updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>;
  getNextPendingSplit(transactionId: number): Promise<any | undefined>;
}

export class MemStorage implements IStorage {
  private merchants: Map<number, Merchant>;
  private transactions: Map<number, Transaction>;
  private platformFees: Map<number, PlatformFee>;
  private refunds: Map<number, Refund>;
  private splitPayments: Map<number, any>;
  private taptStones: Map<number, TaptStone>;
  private stockItems: Map<number, StockItem>;
  private cryptoTransactions: Map<number, CryptoTransaction>;
  private currentMerchantId: number;
  private currentTransactionId: number;
  private currentPlatformFeeId: number;
  private currentCryptoTransactionId: number;
  private currentRefundId: number;
  private currentSplitPaymentId: number;
  private currentTaptStoneId: number;
  private currentStockItemId: number;
  private activeTransactionCache: Map<string, Transaction | null>; // Cache for active transactions by merchant

  constructor() {
    this.merchants = new Map();
    this.transactions = new Map();
    this.platformFees = new Map();
    this.refunds = new Map();
    this.splitPayments = new Map();
    this.taptStones = new Map();
    this.stockItems = new Map();
    this.cryptoTransactions = new Map();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    this.currentPlatformFeeId = 1;
    this.currentRefundId = 1;
    this.currentSplitPaymentId = 1;
    this.currentTaptStoneId = 1;
    this.currentStockItemId = 1;
    this.currentCryptoTransactionId = 1;
    this.activeTransactionCache = new Map();
  }

  async getMerchant(id: number): Promise<Merchant | undefined> {
    return this.merchants.get(id);
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.name === name,
    );
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.email === email,
    );
  }

  async getMerchantByToken(token: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.verificationToken === token,
    );
  }

  async getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.resetToken === resetToken,
    );
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return Array.from(this.merchants.values());
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = { 
      id,
      name: insertMerchant.name,
      businessName: insertMerchant.businessName,
      businessType: insertMerchant.businessType || null,
      email: insertMerchant.email,
      phone: insertMerchant.phone || null,
      address: insertMerchant.address || null,
      status: "pending",
      verificationToken: null,
      passwordHash: null,
      qrCodeUrl: (insertMerchant as any).qrCodeUrl || null,
      paymentUrl: (insertMerchant as any).paymentUrl || null,
      themeId: (insertMerchant as any).themeId || "classic",
      currentProviderRate: (insertMerchant as any).currentProviderRate || "0.0290",
      ourRate: (insertMerchant as any).ourRate || "0.0020",
      contactEmail: (insertMerchant as any).contactEmail || null,
      contactPhone: (insertMerchant as any).contactPhone || null,
      businessAddress: (insertMerchant as any).businessAddress || null,
      bankName: (insertMerchant as any).bankName || null,
      bankAccountNumber: (insertMerchant as any).bankAccountNumber || null,
      bankBranch: (insertMerchant as any).bankBranch || null,
      accountHolderName: (insertMerchant as any).accountHolderName || null,
      gstNumber: (insertMerchant as any).gstNumber || null,
      director: null,
      nzbn: null,
      customLogoUrl: null,
      windcaveApiKey: null,
      coinbaseCommerceApiKey: null,
      coinbaseWebhookSecret: null,
      cryptoEnabled: false,
      enabledCryptocurrencies: null,
      autoConvertToFiat: false,
      minConfirmations: 1,
      dailyGoal: "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(id, merchant);
    return merchant;
  }

  async createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = { 
      id,
      name: merchantData.name,
      businessName: merchantData.businessName,
      businessType: merchantData.businessType || null,
      email: merchantData.email,
      phone: merchantData.phone || null,
      address: merchantData.address || null,
      status: "verified",
      verificationToken: null,
      passwordHash: passwordHash,
      qrCodeUrl: merchantData.qrCodeUrl || null,
      paymentUrl: merchantData.paymentUrl || null,
      themeId: merchantData.themeId || "classic",
      currentProviderRate: merchantData.currentProviderRate || "0.0290",
      ourRate: merchantData.ourRate || "0.0020",
      contactEmail: merchantData.contactEmail || null,
      contactPhone: merchantData.contactPhone || null,
      businessAddress: merchantData.businessAddress || null,
      bankName: merchantData.bankName || null,
      bankAccountNumber: merchantData.bankAccountNumber || null,
      bankBranch: merchantData.bankBranch || null,
      accountHolderName: merchantData.accountHolderName || null,
      gstNumber: merchantData.gstNumber || null,
      director: merchantData.director || null,
      nzbn: merchantData.nzbn || null,
      customLogoUrl: merchantData.customLogoUrl || null,
      windcaveApiKey: merchantData.windcaveApiKey || null,
      coinbaseCommerceApiKey: merchantData.coinbaseCommerceApiKey || null,
      coinbaseWebhookSecret: merchantData.coinbaseWebhookSecret || null,
      cryptoEnabled: merchantData.cryptoEnabled || false,
      enabledCryptocurrencies: merchantData.enabledCryptocurrencies || null,
      autoConvertToFiat: merchantData.autoConvertToFiat || false,
      minConfirmations: merchantData.minConfirmations || 1,
      dailyGoal: merchantData.dailyGoal || "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(id, merchant);
    return merchant;
  }

  async createMerchantWithSignup(data: CreateMerchant & { verificationToken: string }): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = { 
      id,
      name: data.name,
      businessName: data.businessName,
      businessType: data.businessType,
      email: data.email,
      phone: data.phone,
      address: data.address,
      status: "pending",
      verificationToken: data.verificationToken,
      passwordHash: null,
      qrCodeUrl: null,
      paymentUrl: null,
      themeId: "classic",
      currentProviderRate: "0.0290",
      ourRate: "0.0020",
      contactEmail: data.email,
      contactPhone: data.phone,
      businessAddress: data.address,
      bankName: null,
      bankAccountNumber: null,
      bankBranch: null,
      accountHolderName: null,
      gstNumber: null,
      director: null,
      nzbn: null,
      customLogoUrl: null,
      windcaveApiKey: null,
      coinbaseCommerceApiKey: null,
      coinbaseWebhookSecret: null,
      cryptoEnabled: false,
      enabledCryptocurrencies: null,
      autoConvertToFiat: false,
      minConfirmations: 1,
      dailyGoal: "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(id, merchant);
    return merchant;
  }

  async verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined> {
    const merchant = await this.getMerchantByToken(token);
    if (!merchant) return undefined;
    
    merchant.passwordHash = passwordHash;
    merchant.status = "verified";
    merchant.verificationToken = null;
    merchant.updatedAt = new Date();
    
    this.merchants.set(merchant.id, merchant);
    return merchant;
  }

  async updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    merchant.status = status;
    merchant.updatedAt = new Date();
    this.merchants.set(id, merchant);
    return merchant;
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  async getActiveTransactionByMerchant(merchantId: number, taptStoneId?: number): Promise<Transaction | undefined> {
    // Create cache key including stone ID if provided
    const cacheKey = taptStoneId ? `${merchantId}-${taptStoneId}` : `${merchantId}`;
    
    // Check cache first for instant response
    if (this.activeTransactionCache.has(cacheKey)) {
      return this.activeTransactionCache.get(cacheKey) || undefined;
    }
    
    // Optimized search - convert to array first for faster iteration
    let activeTransaction: Transaction | undefined;
    const transactionArray = Array.from(this.transactions.values());
    for (let i = 0; i < transactionArray.length; i++) {
      const transaction = transactionArray[i];
      const matchesMerchant = transaction.merchantId === merchantId;
      const matchesStone = taptStoneId === undefined || transaction.taptStoneId === taptStoneId;
      const isPending = transaction.status === "pending";
      
      if (matchesMerchant && matchesStone && isPending) {
        activeTransaction = transaction;
        break; // Exit immediately when found
      }
    }
    
    // Cache for immediate future lookups
    this.activeTransactionCache.set(cacheKey, activeTransaction || null);
    return activeTransaction;
  }

  async getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values())
      .find(t => t.nfcSessionId === nfcSessionId);
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const transactionAmount = parseFloat(insertTransaction.price);
    
    // Fixed fee structure: $0.05 platform + $0.20 Windcave = $0.25 total per transaction
    const windcaveFeeAmount = 0.20; // Fixed $0.20 Windcave fee
    const platformFeeAmount = 0.05; // Fixed $0.05 platform fee
    const merchantNet = Math.round((transactionAmount - windcaveFeeAmount - platformFeeAmount) * 100) / 100;

    const transaction: Transaction = {
      ...insertTransaction,
      merchantId: insertTransaction.merchantId ?? null,
      taptStoneId: (insertTransaction as any).taptStoneId ?? insertTransaction.selectedStoneId ?? null,
      isSplit: insertTransaction.isSplit ?? false,
      totalSplits: insertTransaction.totalSplits ?? 1,
      completedSplits: insertTransaction.completedSplits ?? 0,
      splitAmount: insertTransaction.splitAmount ?? null,
      id,
      createdAt: new Date(),
      windcaveTransactionId: null,
      windcaveFeeRate: "0.0000",
      windcaveFeeAmount: windcaveFeeAmount.toString(),
      platformFeeRate: "0.0000",
      platformFeeAmount: platformFeeAmount.toString(),
      merchantNet: merchantNet.toString(),
      totalRefunded: "0.00",
      refundableAmount: transactionAmount.toString(),
      paymentMethod: insertTransaction.paymentMethod || "qr_code",
      nfcSessionId: insertTransaction.nfcSessionId || null,
      deviceId: insertTransaction.deviceId || null,
    };
    this.transactions.set(id, transaction);
    
    // Update cache if this is a pending transaction
    if (transaction.status === "pending") {
      this.activeTransactionCache.set(String(transaction.merchantId), transaction);
    }
    
    return transaction;
  }

  async createPlatformFee(insertPlatformFee: InsertPlatformFee): Promise<PlatformFee> {
    const id = this.currentPlatformFeeId++;
    const platformFee: PlatformFee = {
      ...insertPlatformFee,
      merchantId: insertPlatformFee.merchantId ?? null,
      transactionId: insertPlatformFee.transactionId ?? null,
      status: insertPlatformFee.status ?? "pending",
      id,
      createdAt: new Date(),
      collectedAt: null,
    };
    this.platformFees.set(id, platformFee);
    return platformFee;
  }

  async getPlatformFeesByMerchant(merchantId: number): Promise<PlatformFee[]> {
    return Array.from(this.platformFees.values()).filter(
      (fee) => fee.merchantId === merchantId
    );
  }

  async updatePlatformFeeStatus(id: number, status: string): Promise<PlatformFee | undefined> {
    const fee = this.platformFees.get(id);
    if (!fee) return undefined;
    
    const updatedFee = {
      ...fee,
      status,
      collectedAt: status === "collected" ? new Date() : fee.collectedAt,
    };
    this.platformFees.set(id, updatedFee);
    return updatedFee;
  }

  async getPlatformFee(id: number): Promise<PlatformFee | undefined> {
    return this.platformFees.get(id);
  }

  async getTotalPlatformRevenue(): Promise<{ totalFees: number; totalTransactions: number }> {
    const completedTransactions = Array.from(this.transactions.values())
      .filter(transaction => transaction.status === "completed");
    
    const totalFees = completedTransactions
      .reduce((sum, transaction) => sum + parseFloat(transaction.platformFeeAmount || "0"), 0);
    
    const totalTransactions = completedTransactions.length;
    
    return { totalFees, totalTransactions };
  }

  // Refund methods
  async createRefund(insertRefund: InsertRefund): Promise<Refund> {
    const id = this.currentRefundId++;
    const refund: Refund = {
      ...insertRefund,
      transactionId: insertRefund.transactionId ?? null,
      merchantId: insertRefund.merchantId ?? null,
      refundReason: insertRefund.refundReason ?? null,
      refundMethod: insertRefund.refundMethod ?? "original_payment_method",
      status: insertRefund.status ?? "pending",
      windcaveRefundId: insertRefund.windcaveRefundId ?? null,
      windcaveFeeRefunded: insertRefund.windcaveFeeRefunded ?? "0.00",
      platformFeeRefunded: insertRefund.platformFeeRefunded ?? "0.00",
      initiatedBy: insertRefund.initiatedBy ?? null,
      customerNotified: insertRefund.customerNotified ?? false,
      id,
      createdAt: new Date(),
      completedAt: null,
    };
    this.refunds.set(id, refund);
    return refund;
  }

  async getRefund(id: number): Promise<Refund | undefined> {
    return this.refunds.get(id);
  }

  async getRefundsByTransaction(transactionId: number): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.transactionId === transactionId
    );
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.merchantId === merchantId
    );
  }

  async updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined> {
    const refund = this.refunds.get(id);
    if (!refund) return undefined;
    
    const updatedRefund = {
      ...refund,
      status,
      windcaveRefundId: windcaveRefundId || refund.windcaveRefundId,
      completedAt: status === "completed" ? new Date() : refund.completedAt,
    };
    this.refunds.set(id, updatedRefund);
    return updatedRefund;
  }

  async updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    
    const updatedTransaction = {
      ...transaction,
      status,
      windcaveTransactionId: windcaveTransactionId || transaction.windcaveTransactionId,
    };
    this.transactions.set(id, updatedTransaction);
    
    // Update cache based on new status
    if (status === "pending") {
      this.activeTransactionCache.set(String(transaction.merchantId), updatedTransaction);
    } else {
      // Transaction is no longer pending, remove from cache
      this.activeTransactionCache.delete(String(transaction.merchantId));
    }
    
    return updatedTransaction;
  }

  async updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    
    const updatedTransaction = {
      ...transaction,
      nfcSessionId,
    };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async getTransactionsByMerchant(merchantId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.merchantId === merchantId
    );
  }

  // Bill splitting operations
  async createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return undefined;

    const splitAmount = parseFloat(transaction.price) / totalSplits;
    
    const updatedTransaction = {
      ...transaction,
      isSplit: true,
      totalSplits: totalSplits,
      completedSplits: 0,
      splitAmount: splitAmount.toFixed(2),
    };
    
    this.transactions.set(transactionId, updatedTransaction);

    // Create split payment records
    for (let i = 1; i <= totalSplits; i++) {
      const splitPayment = {
        id: this.currentSplitPaymentId++,
        transactionId: transactionId,
        merchantId: transaction.merchantId,
        splitIndex: i,
        amount: splitAmount.toFixed(2),
        status: "pending",
        windcaveTransactionId: null,
        paymentMethod: "qr_code",
        windcaveFeeAmount: (0.20 / totalSplits).toFixed(2), // Distribute fees across splits
        platformFeeAmount: (0.05 / totalSplits).toFixed(2),
        merchantNet: ((splitAmount - (0.20 / totalSplits) - (0.05 / totalSplits))).toFixed(2),
        paidAt: null,
        createdAt: new Date(),
      };
      this.splitPayments.set(splitPayment.id, splitPayment);
    }

    // Update active transaction cache
    this.activeTransactionCache.set(String(transaction.merchantId), updatedTransaction);

    return updatedTransaction;
  }

  async createSplitPayment(data: any): Promise<any> {
    const id = this.currentSplitPaymentId++;
    const splitPayment = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.splitPayments.set(id, splitPayment);
    return splitPayment;
  }

  async getSplitPaymentsByTransaction(transactionId: number): Promise<any[]> {
    return Array.from(this.splitPayments.values()).filter(
      (split) => split.transactionId === transactionId
    );
  }

  async updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any> {
    const splitPayment = this.splitPayments.get(id);
    if (!splitPayment) return undefined;

    const updatedSplit = {
      ...splitPayment,
      status,
      windcaveTransactionId: windcaveTransactionId || splitPayment.windcaveTransactionId,
      paidAt: status === "completed" ? new Date() : splitPayment.paidAt,
    };
    
    this.splitPayments.set(id, updatedSplit);

    // If this split is completed, update the main transaction
    if (status === "completed") {
      const transaction = this.transactions.get(splitPayment.transactionId);
      if (transaction) {
        const allSplits = await this.getSplitPaymentsByTransaction(splitPayment.transactionId);
        const completedSplits = allSplits.filter(s => s.status === "completed").length;
        
        const updatedTransaction = {
          ...transaction,
          completedSplits: completedSplits,
          status: completedSplits >= (transaction.totalSplits ?? 1) ? "completed" : "pending"
        };
        
        this.transactions.set(splitPayment.transactionId, updatedTransaction);
        
        // Update cache
        if (updatedTransaction.status === "completed") {
          this.activeTransactionCache.delete(String(transaction.merchantId));
        } else {
          this.activeTransactionCache.set(String(transaction.merchantId), updatedTransaction);
        }
      }
    }

    return updatedSplit;
  }

  async getNextPendingSplit(transactionId: number): Promise<any | undefined> {
    const splits = await this.getSplitPaymentsByTransaction(transactionId);
    return splits.find(split => split.status === "pending");
  }

  async updateMerchantRates(id: number, currentProviderRate: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      currentProviderRate,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      ...updates,
      updatedAt: new Date(),
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      customLogoUrl: logoUrl,
      updatedAt: new Date(),
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      businessName: details.businessName,
      contactEmail: details.contactEmail,
      contactPhone: details.contactPhone,
      businessAddress: details.businessAddress,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      bankName: bankDetails.bankName,
      bankAccountNumber: bankDetails.bankAccountNumber,
      bankBranch: bankDetails.bankBranch,
      accountHolderName: bankDetails.accountHolderName,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      themeId,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantCryptoSettings(id: number, settings: any): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      ...settings,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }> {
    const merchant = this.merchants.get(merchantId);
    const transactions = await this.getTransactionsByMerchant(merchantId);
    
    const completedTransactions = transactions.filter(t => t.status === "completed");
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    const averageTransaction = completedTransactions.length > 0 
      ? totalRevenue / completedTransactions.length 
      : 0;
    
    // Calculate weekly metrics (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const weeklyTransactionsList = transactions.filter(t => {
      const transactionDate = t.createdAt ? new Date(t.createdAt) : null;
      return transactionDate && transactionDate >= weekAgo;
    });
    
    const weeklyCompletedTransactions = weeklyTransactionsList.filter(t => t.status === "completed");
    const weeklyRevenue = weeklyCompletedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    const currentProviderRate = parseFloat(merchant?.currentProviderRate || "0.029");
    const ourRate = parseFloat(merchant?.ourRate || "0.002");
    
    const currentProviderCost = totalRevenue * currentProviderRate;
    const ourCost = totalRevenue * ourRate;
    const savings = currentProviderCost - ourCost;

    return {
      totalTransactions: transactions.length,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      currentProviderCost,
      ourCost,
      savings,
      currentProviderRate: currentProviderRate * 100, // Convert to percentage
      ourRate: ourRate * 100, // Convert to percentage
      weeklyTransactions: weeklyTransactionsList.length,
      weeklyRevenue,
      averageTransaction,
    };
  }

  async getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]> {
    const allTransactions = await this.getTransactionsByMerchant(merchantId);
    
    if (!startDate && !endDate) {
      return allTransactions;
    }
    
    return allTransactions.filter(transaction => {
      if (!transaction.createdAt) return false;
      const transactionDate = new Date(transaction.createdAt);
      
      if (startDate && transactionDate < startDate) {
        return false;
      }
      
      if (endDate && transactionDate > endDate) {
        return false;
      }
      
      return true;
    });
  }

  async getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }> {
    const merchant = this.merchants.get(merchantId);
    const transactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    
    const completedTransactions = transactions.filter(t => t.status === "completed");
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    const currentProviderRate = parseFloat(merchant?.currentProviderRate || "0.029");
    const ourRate = parseFloat(merchant?.ourRate || "0.002");
    
    const currentProviderCost = totalRevenue * currentProviderRate;
    const ourCost = totalRevenue * ourRate;
    const savings = currentProviderCost - ourCost;

    // Calculate transaction breakdown by status
    const transactionsByStatus: { [key: string]: number } = {};
    transactions.forEach(t => {
      transactionsByStatus[t.status] = (transactionsByStatus[t.status] || 0) + 1;
    });

    return {
      totalTransactions: transactions.length,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      currentProviderCost,
      ourCost,
      savings,
      currentProviderRate: currentProviderRate * 100,
      ourRate: ourRate * 100,
      dateRange: { 
        start: startDate || null, 
        end: endDate || null 
      },
      averageTransactionValue: completedTransactions.length > 0 ? totalRevenue / completedTransactions.length : 0,
      transactionsByStatus,
    };
  }

  async deleteMerchant(id: number): Promise<boolean> {
    // Check if merchant exists
    if (!this.merchants.has(id)) {
      return false;
    }

    // Delete all transactions associated with this merchant
    const transactionsToDelete: number[] = [];
    for (const transactionId of Array.from(this.transactions.keys())) {
      const transaction = this.transactions.get(transactionId);
      if (transaction && transaction.merchantId === id) {
        transactionsToDelete.push(transactionId);
      }
    }
    
    // Remove transactions
    transactionsToDelete.forEach(transactionId => {
      this.transactions.delete(transactionId);
    });

    // Remove merchant
    this.merchants.delete(id);
    return true;
  }

  async clearTransactions(merchantId: number): Promise<boolean> {
    // Clear all transactions for a specific merchant
    const transactionsToDelete = Array.from(this.transactions.values()).filter(
      t => t.merchantId === merchantId
    );
    
    transactionsToDelete.forEach(transaction => {
      this.transactions.delete(transaction.id);
    });
    
    // Clear the active transaction cache for this merchant
    this.activeTransactionCache.delete(String(merchantId));
    
    console.log(`Cleared ${transactionsToDelete.length} transactions for merchant ${merchantId}`);
    return true;
  }

  async getRevenueOverTime(merchantId: number, days: number = 30): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const transactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    const completedTransactions = transactions.filter(t => t.status === "completed");

    // Group transactions by date
    const revenueByDate = new Map<string, { revenue: number; transactions: number }>();
    
    // Initialize all dates with 0 values
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      revenueByDate.set(dateKey, { revenue: 0, transactions: 0 });
    }

    // Aggregate completed transactions by date
    completedTransactions.forEach(transaction => {
      if (transaction.createdAt) {
        const date = new Date(transaction.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        const existing = revenueByDate.get(dateKey) || { revenue: 0, transactions: 0 };
        revenueByDate.set(dateKey, {
          revenue: existing.revenue + parseFloat(transaction.price),
          transactions: existing.transactions + 1
        });
      }
    });

    // Convert to array and sort by date
    return Array.from(revenueByDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.transactions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  clearAllMerchants() {
    this.merchants.clear();
    this.transactions.clear();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    this.activeTransactionCache.clear();
    console.log("All merchants and transactions cleared from memory");
  }

  private createSampleData() {
    const sampleTransactions = [
      // Recent transactions (last 3 days)
      { itemName: "Flat White", price: "5.20", status: "completed", daysAgo: 0 },
      { itemName: "Chicken Wrap", price: "12.50", status: "completed", daysAgo: 0 },
      { itemName: "Cappuccino", price: "4.50", status: "completed", daysAgo: 0 },
      { itemName: "Caesar Salad", price: "14.90", status: "completed", daysAgo: 0 },
      { itemName: "Iced Coffee", price: "4.80", status: "failed", daysAgo: 1 },
      { itemName: "Burger & Fries", price: "18.90", status: "completed", daysAgo: 1 },
      { itemName: "Latte", price: "5.00", status: "completed", daysAgo: 1 },
      { itemName: "Fish & Chips", price: "22.50", status: "completed", daysAgo: 1 },
      { itemName: "Green Smoothie", price: "8.50", status: "completed", daysAgo: 2 },
      { itemName: "Eggs Benedict", price: "16.90", status: "completed", daysAgo: 2 },
      
      // Last week transactions
      { itemName: "Pizza Margherita", price: "24.90", status: "completed", daysAgo: 5 },
      { itemName: "Americano", price: "3.50", status: "completed", daysAgo: 5 },
      { itemName: "Pasta Carbonara", price: "19.50", status: "completed", daysAgo: 6 },
      { itemName: "Orange Juice", price: "4.20", status: "completed", daysAgo: 6 },
      { itemName: "Steak Sandwich", price: "21.90", status: "completed", daysAgo: 7 },
      { itemName: "Hot Chocolate", price: "4.75", status: "processing", daysAgo: 7 },
      
      // Older transactions (2-4 weeks ago)
      { itemName: "Thai Curry", price: "17.90", status: "completed", daysAgo: 14 },
      { itemName: "Croissant", price: "4.25", status: "completed", daysAgo: 15 },
      { itemName: "Club Sandwich", price: "15.50", status: "completed", daysAgo: 16 },
      { itemName: "Tea", price: "2.95", status: "completed", daysAgo: 18 },
      { itemName: "Seafood Pasta", price: "26.90", status: "completed", daysAgo: 20 },
      { itemName: "Bagel & Cream Cheese", price: "6.50", status: "completed", daysAgo: 21 },
      { itemName: "Mediterranean Bowl", price: "16.50", status: "completed", daysAgo: 22 },
      { itemName: "Banana Smoothie", price: "7.95", status: "completed", daysAgo: 25 },
      { itemName: "Grilled Chicken", price: "19.90", status: "completed", daysAgo: 28 },
      { itemName: "Muffin", price: "3.75", status: "completed", daysAgo: 30 },
    ];

    for (const transaction of sampleTransactions) {
      const id = this.currentTransactionId++;
      const createdDate = new Date(Date.now() - transaction.daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000); // Add some time variation within the day
      const newTransaction: Transaction = {
        id,
        merchantId: this.currentMerchantId,
        taptStoneId: null,
        itemName: transaction.itemName,
        price: transaction.price,
        status: transaction.status,
        windcaveTransactionId: `WC_${Date.now() + Math.random()}`,
        paymentMethod: "qr_code",
        nfcSessionId: null,
        deviceId: null,
        isSplit: false,
        totalSplits: 1,
        completedSplits: 0,
        splitAmount: null,
        windcaveFeeRate: "0.0000",
        windcaveFeeAmount: "0.20",
        platformFeeRate: "0.0000",
        platformFeeAmount: "0.05",
        merchantNet: (parseFloat(transaction.price) - 0.25).toFixed(2),
        totalRefunded: "0.00",
        refundableAmount: transaction.price,
        createdAt: createdDate,
      };
      this.transactions.set(id, newTransaction);
    }
  }

  // API Key operations - Memory implementations
  async createApiKey(data: any): Promise<any> {
    const id = Date.now();
    const apiKey = {
      ...data,
      id,
      keyPrefix: `tapt_${data.environment}_`,
      apiKey: `tapt_${data.environment}_${Math.random().toString(36).substring(2, 15)}`,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    // Store in memory (would normally go to database)
    return apiKey;
  }

  async getApiKey(id: number): Promise<any> {
    return null; // Not implemented in memory storage
  }

  async getApiKeyByKey(apiKey: string): Promise<any> {
    return null;
  }

  async getApiKeysByMerchant(merchantId: number): Promise<any[]> {
    return [];
  }

  async updateApiKeyStatus(id: number, status: string): Promise<any> {
    return null;
  }

  async revokeApiKey(id: number): Promise<boolean> {
    return true;
  }

  async updateApiKeyLastUsed(id: number): Promise<any> {
    return null;
  }

  async logApiRequest(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async getApiMetrics(merchantId?: number): Promise<any> {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsToday: 0,
      webhookDeliveryRate: 0
    };
  }

  async getApiUsageData(merchantId?: number): Promise<any[]> {
    return [];
  }

  async createWebhookDelivery(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async updateWebhookDelivery(id: number, data: any): Promise<any> {
    return null;
  }

  async getWebhookDeliveries(apiKeyId: number): Promise<any[]> {
    return [];
  }

  // Tapt Stone operations
  async createTaptStone(data: InsertTaptStone): Promise<TaptStone> {
    const id = this.currentTaptStoneId++;
    const taptStone: TaptStone = {
      ...data,
      merchantId: data.merchantId ?? null,
      id,
      qrCodeUrl: null,
      paymentUrl: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.taptStones.set(id, taptStone);
    return taptStone;
  }

  async getTaptStone(id: number): Promise<TaptStone | undefined> {
    return this.taptStones.get(id);
  }

  async getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]> {
    return Array.from(this.taptStones.values()).filter(
      (stone) => stone.merchantId === merchantId && stone.isActive
    );
  }

  async updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    const stone = this.taptStones.get(id);
    if (stone) {
      if (data.name !== undefined) {
        stone.name = data.name;
      }
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    const stone = this.taptStones.get(id);
    if (stone) {
      stone.qrCodeUrl = qrCodeUrl;
      stone.paymentUrl = paymentUrl;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async deleteTaptStone(id: number): Promise<boolean> {
    const stone = this.taptStones.get(id);
    if (stone) {
      stone.isActive = false;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return true;
    }
    return false;
  }

  async associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void> {
    // For MemStorage, we could add a field to track stone associations
    // but for simplicity, we'll just log this association
    console.log(`Transaction ${transactionId} associated with stone ${stoneId}`);
  }

  // Stock Item operations
  async createStockItem(data: InsertStockItem): Promise<StockItem> {
    const id = this.currentStockItemId++;
    const stockItem: StockItem = {
      ...data,
      merchantId: data.merchantId ?? null,
      description: data.description ?? null,
      id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.stockItems.set(id, stockItem);
    return stockItem;
  }

  async getStockItem(id: number): Promise<StockItem | undefined> {
    return this.stockItems.get(id);
  }

  async getStockItemsByMerchant(merchantId: number): Promise<StockItem[]> {
    return Array.from(this.stockItems.values()).filter(
      (item) => item.merchantId === merchantId && item.isActive
    );
  }

  async updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined> {
    const item = this.stockItems.get(id);
    if (item) {
      const updatedItem = {
        ...item,
        ...data,
        updatedAt: new Date(),
      };
      this.stockItems.set(id, updatedItem);
      return updatedItem;
    }
    return undefined;
  }

  async deleteStockItem(id: number): Promise<boolean> {
    const item = this.stockItems.get(id);
    if (item) {
      item.isActive = false;
      item.updatedAt = new Date();
      this.stockItems.set(id, item);
      return true;
    }
    return false;
  }

  async createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction> {
    const id = this.currentCryptoTransactionId++;
    const cryptoTransaction: CryptoTransaction = {
      ...data,
      merchantId: data.merchantId ?? null,
      transactionId: data.transactionId ?? null,
      status: data.status ?? "pending",
      expiresAt: data.expiresAt ?? null,
      coinbaseChargeId: data.coinbaseChargeId ?? null,
      coinbaseChargeCode: data.coinbaseChargeCode ?? null,
      hostedUrl: data.hostedUrl ?? null,
      requiredConfirmations: data.requiredConfirmations ?? 1,
      id,
      confirmations: 0,
      createdAt: new Date(),
      completedAt: null,
      blockchainTxHash: null,
      networkFeeAmount: null,
      networkFeeFiat: null,
    };
    this.cryptoTransactions.set(id, cryptoTransaction);
    return cryptoTransaction;
  }

  async getCryptoTransaction(id: number): Promise<CryptoTransaction | undefined> {
    return this.cryptoTransactions.get(id);
  }

  async getCryptoTransactionByTransactionId(transactionId: number): Promise<CryptoTransaction | undefined> {
    return Array.from(this.cryptoTransactions.values()).find(
      (ct) => ct.transactionId === transactionId
    );
  }

  async getCryptoTransactionByChargeCode(chargeCode: string): Promise<CryptoTransaction | undefined> {
    return Array.from(this.cryptoTransactions.values()).find(
      (ct) => ct.coinbaseChargeCode === chargeCode
    );
  }

  async updateCryptoTransactionStatus(id: number, status: string, confirmations?: number): Promise<CryptoTransaction | undefined> {
    const cryptoTx = this.cryptoTransactions.get(id);
    if (cryptoTx) {
      const updated = {
        ...cryptoTx,
        status,
        confirmations: confirmations ?? cryptoTx.confirmations,
        completedAt: status === 'confirmed' || status === 'completed' ? new Date() : cryptoTx.completedAt,
      };
      this.cryptoTransactions.set(id, updated);
      return updated;
    }
    return undefined;
  }

  // Subscription stub methods (not used in production)
  async getOrCreateSubscription(merchantId: number): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async getSubscription(merchantId: number): Promise<any | undefined> {
    return undefined;
  }

  async updateSubscriptionTier(merchantId: number, tier: string): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async updateSubscriptionBillingFrequency(merchantId: number, frequency: string): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async updateSubscriptionPaymentMethod(merchantId: number, stripeCustomerId: string, stripePaymentMethodId: string): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async incrementTransactionCount(merchantId: number): Promise<void> {
    // No-op in memory storage
  }

  async cancelSubscription(merchantId: number, reason: string): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async getBillingHistory(merchantId: number, limit?: number): Promise<any[]> {
    return [];
  }

  async createBillingHistory(data: any): Promise<any> {
    throw new Error('Subscriptions not supported in memory storage');
  }

  async resetMonthlyTransactionCount(merchantId: number): Promise<void> {
    // No-op in memory storage
  }

  async getUnbilledTransactions(merchantId: number): Promise<{ count: number; amount: number }> {
    return { count: 0, amount: 0 };
  }

  async resetUnbilledTransactions(merchantId: number): Promise<void> {
    // No-op in memory storage
  }

  async getAllActiveSubscriptions(billingFrequency?: string): Promise<any[]> {
    return [];
  }
}

// Database Storage Implementation
export class DatabaseStorage implements IStorage {
  private db = getDb();

  async getMerchant(id: number): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
    return result[0];
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.name, name)).limit(1);
    return result[0];
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(merchants).values(insertMerchant).returning();
    return result[0];
  }

  async createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    const insertData = {
      ...merchantData,
      passwordHash,
      status: 'verified',
      verificationToken: null
    };
    const result = await this.db.insert(merchants).values(insertData).returning();
    return result[0];
  }

  async updateMerchantRates(id: number, currentProviderRate: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ currentProviderRate })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ customLogoUrl: logoUrl, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set(details)
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set(bankDetails)
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ themeId })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantCryptoSettings(id: number, settings: any): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set(settings)
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.email, email)).limit(1);
    return result[0];
  }

  async getMerchantByToken(token: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.verificationToken, token)).limit(1);
    return result[0];
  }

  async getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.resetToken, resetToken)).limit(1);
    return result[0];
  }

  async getAllMerchants(): Promise<Merchant[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(merchants);
  }

  async createMerchantWithSignup(data: CreateMerchant & { verificationToken: string }): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    
    // First insert without URLs to get the ID
    const result = await this.db.insert(merchants).values({
      name: data.name,
      businessName: data.businessName,
      businessType: data.businessType,
      email: data.email,
      phone: data.phone,
      address: data.address,
      status: "pending",
      verificationToken: data.verificationToken,
      currentProviderRate: "0.0290",
      ourRate: "0.0020",
      qrCodeUrl: "", // Temporary empty string
      paymentUrl: "", // Temporary empty string
    }).returning();
    
    const merchant = result[0];
    
    // Now update with proper URLs using the merchant ID
    const updatedResult = await this.db
      .update(merchants)
      .set({
        qrCodeUrl: `/api/merchants/${merchant.id}/qr`,
        paymentUrl: `/pay/${merchant.id}`,
      })
      .where(eq(merchants.id, merchant.id))
      .returning();
    
    return updatedResult[0];
  }

  async verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ 
        passwordHash, 
        status: "verified", 
        verificationToken: null,
        updatedAt: new Date()
      })
      .where(eq(merchants.verificationToken, token))
      .returning();
    return result[0];
  }

  async updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ status, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    return result[0];
  }

  async getActiveTransactionByMerchant(merchantId: number, taptStoneId?: number): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    
    const conditions = [
      eq(transactions.merchantId, merchantId),
      eq(transactions.status, 'pending')
    ];
    
    // Add stone filter if provided
    if (taptStoneId !== undefined) {
      conditions.push(eq(transactions.taptStoneId, taptStoneId));
    }
    
    const result = await this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    return result[0];
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    if (!this.db) throw new Error('Database not available');
    const transactionAmount = parseFloat(insertTransaction.price);
    
    // Fixed fee structure: $0.05 platform + $0.20 Windcave = $0.25 total per transaction
    const windcaveFeeAmount = 0.20; // Fixed $0.20 Windcave fee
    const platformFeeAmount = 0.05; // Fixed $0.05 platform fee
    const merchantNet = Math.round((transactionAmount - windcaveFeeAmount - platformFeeAmount) * 100) / 100;

    const transactionWithFees = {
      ...insertTransaction,
      windcaveFeeRate: "0.0000", // Not percentage-based
      windcaveFeeAmount: windcaveFeeAmount.toString(),
      platformFeeRate: "0.0000", // Not percentage-based
      platformFeeAmount: platformFeeAmount.toString(),
      merchantNet: merchantNet.toString(),
      totalRefunded: "0.00",
      refundableAmount: merchantNet.toString(), // Amount merchant receives after fees
    };

    const result = await this.db.insert(transactions).values(transactionWithFees).returning();
    return result[0];
  }

  async updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = { status };
    if (windcaveTransactionId) {
      updateData.windcaveTransactionId = windcaveTransactionId;
    }
    
    const result = await this.db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.nfcSessionId, nfcSessionId))
      .limit(1);
    return result[0];
  }

  async updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ nfcSessionId })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async getTransactionsByMerchant(merchantId: number): Promise<Transaction[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));
  }

  async getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }> {
    if (!this.db) throw new Error('Database not available');
    
    const merchantTransactions = await this.getTransactionsByMerchant(merchantId);
    const merchant = await this.getMerchant(merchantId);
    
    const totalTransactions = merchantTransactions.length;
    const completedTxs = merchantTransactions.filter(t => t.status === 'completed');
    const completedTransactions = completedTxs.length;
    const totalRevenue = completedTxs.reduce((sum, t) => sum + parseFloat(t.price), 0);
    const averageTransaction = completedTransactions > 0 
      ? totalRevenue / completedTransactions 
      : 0;
    
    // Calculate weekly metrics (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const weeklyTransactionsList = merchantTransactions.filter(t => {
      const transactionDate = t.createdAt ? new Date(t.createdAt) : null;
      return transactionDate && transactionDate >= weekAgo;
    });
    
    const weeklyCompletedTransactions = weeklyTransactionsList.filter(t => t.status === 'completed');
    const weeklyRevenue = weeklyCompletedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    const currentProviderRate = merchant && merchant.currentProviderRate 
      ? parseFloat(merchant.currentProviderRate) 
      : 2.9;
    const ourRate = 0.2;
    
    const currentProviderCost = totalRevenue * (currentProviderRate / 100);
    const ourCost = totalRevenue * (ourRate / 100);
    const savings = currentProviderCost - ourCost;
    
    return {
      totalTransactions,
      completedTransactions,
      totalRevenue,
      currentProviderCost,
      ourCost,
      savings,
      currentProviderRate,
      ourRate,
      weeklyTransactions: weeklyTransactionsList.length,
      weeklyRevenue,
      averageTransaction,
    };
  }

  async getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]> {
    if (!this.db) throw new Error('Database not available');
    
    let query = this.db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));

    if (startDate || endDate) {
      // For database implementation, we would add date filtering here
      // For now, fall back to memory filtering
      const allTransactions = await query;
      return allTransactions.filter(transaction => {
        if (!transaction.createdAt) return false;
        const transactionDate = new Date(transaction.createdAt as Date);
        
        if (startDate && transactionDate < startDate) {
          return false;
        }
        
        if (endDate && transactionDate > endDate) {
          return false;
        }
        
        return true;
      });
    }

    return query;
  }

  async getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }> {
    if (!this.db) throw new Error('Database not available');
    
    const merchantTransactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    const merchant = await this.getMerchant(merchantId);
    
    const totalTransactions = merchantTransactions.length;
    const completedTransactions = merchantTransactions.filter(t => t.status === 'completed');
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    const currentProviderRate = merchant && merchant.currentProviderRate 
      ? parseFloat(merchant.currentProviderRate) 
      : 2.9;
    const ourRate = 0.2;
    
    const currentProviderCost = totalRevenue * (currentProviderRate / 100);
    const ourCost = totalRevenue * (ourRate / 100);
    const savings = currentProviderCost - ourCost;

    // Calculate transaction breakdown by status
    const transactionsByStatus: { [key: string]: number } = {};
    merchantTransactions.forEach(t => {
      transactionsByStatus[t.status] = (transactionsByStatus[t.status] || 0) + 1;
    });
    
    return {
      totalTransactions,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      currentProviderCost,
      ourCost,
      savings,
      currentProviderRate,
      ourRate,
      dateRange: { 
        start: startDate || null, 
        end: endDate || null 
      },
      averageTransactionValue: completedTransactions.length > 0 ? totalRevenue / completedTransactions.length : 0,
      transactionsByStatus,
    };
  }

  async clearTransactions(merchantId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      // Delete all transactions for the merchant
      await this.db.delete(transactions).where(eq(transactions.merchantId, merchantId));
      console.log(`Cleared transactions for merchant ${merchantId} from database`);
      return true;
    } catch (error) {
      console.error('Error clearing transactions:', error);
      return false;
    }
  }

  async getRevenueOverTime(merchantId: number, days: number = 30): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>> {
    if (!this.db) throw new Error('Database not available');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const allTransactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    const completedTransactions = allTransactions.filter(t => t.status === "completed");

    // Group transactions by date
    const revenueByDate = new Map<string, { revenue: number; transactions: number }>();
    
    // Initialize all dates with 0 values
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      revenueByDate.set(dateKey, { revenue: 0, transactions: 0 });
    }

    // Aggregate completed transactions by date
    completedTransactions.forEach(transaction => {
      if (transaction.createdAt) {
        const date = new Date(transaction.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        const existing = revenueByDate.get(dateKey) || { revenue: 0, transactions: 0 };
        revenueByDate.set(dateKey, {
          revenue: existing.revenue + parseFloat(transaction.price),
          transactions: existing.transactions + 1
        });
      }
    });

    // Convert to array and sort by date
    return Array.from(revenueByDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.transactions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async deleteMerchant(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      // First delete all transactions associated with the merchant
      await this.db.delete(transactions).where(eq(transactions.merchantId, id));
      
      // Then delete the merchant
      const result = await this.db.delete(merchants).where(eq(merchants.id, id));
      
      return true;
    } catch (error) {
      console.error('Error deleting merchant:', error);
      return false;
    }
  }

  async createPlatformFee(insertPlatformFee: InsertPlatformFee): Promise<PlatformFee> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(platformFees).values(insertPlatformFee).returning();
    return result[0];
  }

  async getPlatformFeesByMerchant(merchantId: number): Promise<PlatformFee[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(platformFees).where(eq(platformFees.merchantId, merchantId));
  }

  async updatePlatformFeeStatus(id: number, status: string): Promise<PlatformFee | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = { status };
    if (status === "collected") {
      updateData.collectedAt = new Date();
    }
    
    const result = await this.db
      .update(platformFees)
      .set(updateData)
      .where(eq(platformFees.id, id))
      .returning();
    return result[0];
  }

  async getPlatformFee(id: number): Promise<PlatformFee | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(platformFees).where(eq(platformFees.id, id)).limit(1);
    return result[0];
  }

  async getTotalPlatformRevenue(): Promise<{ totalFees: number; totalTransactions: number }> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(transactions);
    const completedTransactions = result.filter(t => t.status === "completed");
    
    const totalFees = completedTransactions
      .reduce((sum, transaction) => sum + parseFloat(transaction.platformFeeAmount || "0"), 0);
    
    const totalTransactions = completedTransactions.length;
    
    return { totalFees, totalTransactions };
  }

  // Refund methods for DatabaseStorage
  async createRefund(insertRefund: InsertRefund): Promise<Refund> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(refunds).values(insertRefund).returning();
    return result[0];
  }

  async getRefund(id: number): Promise<Refund | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    return result[0];
  }

  async getRefundsByTransaction(transactionId: number): Promise<Refund[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(refunds).where(eq(refunds.transactionId, transactionId));
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(refunds).where(eq(refunds.merchantId, merchantId));
  }

  async updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = { status };
    if (windcaveRefundId) {
      updateData.windcaveRefundId = windcaveRefundId;
    }
    if (status === "completed") {
      updateData.completedAt = new Date();
    }
    
    const result = await this.db
      .update(refunds)
      .set(updateData)
      .where(eq(refunds.id, id))
      .returning();
    return result[0];
  }

  // API Key operations - placeholder implementations
  async createApiKey(data: any): Promise<any> {
    // TODO: Implement when API tables are available
    return { ...data, id: Date.now(), keyPrefix: 'tapt_sandbox_', status: 'active', createdAt: new Date() };
  }

  async getApiKey(id: number): Promise<any> {
    return null;
  }

  async getApiKeyByKey(apiKey: string): Promise<any> {
    return null;
  }

  async getApiKeysByMerchant(merchantId: number): Promise<any[]> {
    return [];
  }

  async updateApiKeyStatus(id: number, status: string): Promise<any> {
    return null;
  }

  async revokeApiKey(id: number): Promise<boolean> {
    return true;
  }

  async updateApiKeyLastUsed(id: number): Promise<any> {
    return null;
  }

  async logApiRequest(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async getApiMetrics(merchantId?: number): Promise<any> {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsToday: 0,
      webhookDeliveryRate: 0
    };
  }

  async getApiUsageData(merchantId?: number): Promise<any[]> {
    return [];
  }

  async createWebhookDelivery(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async updateWebhookDelivery(id: number, data: any): Promise<any> {
    return null;
  }

  async getWebhookDeliveries(apiKeyId: number): Promise<any[]> {
    return [];
  }

  // Bill splitting operations
  async createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined> {
    try {
      // Get the transaction first
      const [transaction] = await this.db!
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      
      if (!transaction) return undefined;

      const splitAmount = parseFloat(transaction.price) / totalSplits;
      
      // Update the transaction with split information
      const [updatedTransaction] = await this.db!
        .update(transactions)
        .set({
          isSplit: true,
          totalSplits: totalSplits,
          completedSplits: 0,
          splitAmount: splitAmount.toFixed(2),
        })
        .where(eq(transactions.id, transactionId))
        .returning();

      // Create split payment records
      for (let i = 1; i <= totalSplits; i++) {
        await this.db!
          .insert(splitPayments)
          .values({
            transactionId: transactionId,
            merchantId: transaction.merchantId,
            splitIndex: i,
            amount: splitAmount.toFixed(2),
            status: "pending",
            windcaveTransactionId: null,
            paymentMethod: "qr_code",
            windcaveFeeAmount: (0.20 / totalSplits).toFixed(2),
            platformFeeAmount: (0.05 / totalSplits).toFixed(2),
            merchantNet: ((splitAmount - (0.20 / totalSplits) - (0.05 / totalSplits))).toFixed(2),
            paidAt: null,
          });
      }

      return updatedTransaction;
    } catch (error) {
      console.error("Database error in createBillSplit:", error);
      return undefined;
    }
  }

  async createSplitPayment(data: any): Promise<any> {
    try {
      const [splitPayment] = await this.db!
        .insert(splitPayments)
        .values(data)
        .returning();
      return splitPayment;
    } catch (error) {
      console.error("Database error in createSplitPayment:", error);
      return undefined;
    }
  }

  async getSplitPaymentsByTransaction(transactionId: number): Promise<any[]> {
    try {
      return await this.db!
        .select()
        .from(splitPayments)
        .where(eq(splitPayments.transactionId, transactionId))
        .orderBy(splitPayments.splitIndex);
    } catch (error) {
      console.error("Database error in getSplitPaymentsByTransaction:", error);
      return [];
    }
  }

  async updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any> {
    try {
      // Update the split payment
      const [updatedSplit] = await this.db!
        .update(splitPayments)
        .set({
          status,
          windcaveTransactionId: windcaveTransactionId || undefined,
          paidAt: status === "completed" ? new Date() : undefined,
        })
        .where(eq(splitPayments.id, id))
        .returning();

      if (status === "completed" && updatedSplit) {
        // Get all splits for this transaction to check if all are completed
        const allSplits = await this.getSplitPaymentsByTransaction(updatedSplit.transactionId!);
        const completedSplits = allSplits.filter(s => s.status === "completed").length;
        
        // Get the transaction to check total splits
        const [transaction] = await this.db!
          .select()
          .from(transactions)
          .where(eq(transactions.id, updatedSplit.transactionId!));
        
        if (transaction) {
          const finalStatus = completedSplits >= (transaction.totalSplits ?? 1) ? "completed" : "pending";
          
          // Update the main transaction
          await this.db!
            .update(transactions)
            .set({
              completedSplits: completedSplits,
              status: finalStatus
            })
            .where(eq(transactions.id, updatedSplit.transactionId!));
        }
      }

      return updatedSplit;
    } catch (error) {
      console.error("Database error in updateSplitPaymentStatus:", error);
      return undefined;
    }
  }

  async getNextPendingSplit(transactionId: number): Promise<any | undefined> {
    try {
      const [split] = await this.db!
        .select()
        .from(splitPayments)
        .where(
          and(
            eq(splitPayments.transactionId, transactionId),
            eq(splitPayments.status, "pending")
          )
        )
        .orderBy(splitPayments.splitIndex)
        .limit(1);
      
      return split;
    } catch (error) {
      console.error("Database error in getNextPendingSplit:", error);
      return undefined;
    }
  }

  // Tapt Stone operations
  async createTaptStone(data: InsertTaptStone): Promise<TaptStone> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(taptStones).values(data).returning();
    return result[0];
  }

  async getTaptStone(id: number): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(taptStones).where(eq(taptStones.id, id)).limit(1);
    return result[0];
  }

  async getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(taptStones)
      .where(and(eq(taptStones.merchantId, merchantId), eq(taptStones.isActive, true)))
      .orderBy(taptStones.stoneNumber);
  }

  async updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        ...data,
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result[0];
  }

  async updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        qrCodeUrl, 
        paymentUrl, 
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result[0];
  }

  async deleteTaptStone(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result.length > 0;
  }

  async associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void> {
    // For now, we'll just log the association. 
    // In a full implementation, you might add a junction table or field to track this
    console.log(`Transaction ${transactionId} associated with stone ${stoneId}`);
  }

  // Stock Item methods for DatabaseStorage
  async createStockItem(data: InsertStockItem): Promise<StockItem> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(stockItems).values(data).returning();
    return result[0];
  }

  async getStockItem(id: number): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(stockItems).where(eq(stockItems.id, id)).limit(1);
    return result[0];
  }

  async getStockItemsByMerchant(merchantId: number): Promise<StockItem[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.merchantId, merchantId), eq(stockItems.isActive, true)))
      .orderBy(stockItems.name);
  }

  async updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(stockItems)
      .set({ 
        ...data,
        updatedAt: new Date() 
      })
      .where(eq(stockItems.id, id))
      .returning();
    return result[0];
  }

  async deleteStockItem(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(stockItems)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(eq(stockItems.id, id))
      .returning();
    return result.length > 0;
  }

  // Crypto Transaction methods for DatabaseStorage
  async createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(cryptoTransactions).values(data).returning();
    return result[0];
  }

  async getCryptoTransaction(id: number): Promise<CryptoTransaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(cryptoTransactions).where(eq(cryptoTransactions.id, id)).limit(1);
    return result[0];
  }

  async getCryptoTransactionByTransactionId(transactionId: number): Promise<CryptoTransaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(cryptoTransactions).where(eq(cryptoTransactions.transactionId, transactionId)).limit(1);
    return result[0];
  }

  async getCryptoTransactionByChargeCode(chargeCode: string): Promise<CryptoTransaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(cryptoTransactions).where(eq(cryptoTransactions.coinbaseChargeCode, chargeCode)).limit(1);
    return result[0];
  }

  async updateCryptoTransactionStatus(id: number, status: string, confirmations?: number): Promise<CryptoTransaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = { status };
    if (confirmations !== undefined) {
      updateData.confirmations = confirmations;
    }
    if (status === 'confirmed' || status === 'completed') {
      updateData.completedAt = new Date();
    }
    const result = await this.db
      .update(cryptoTransactions)
      .set(updateData)
      .where(eq(cryptoTransactions.id, id))
      .returning();
    return result[0];
  }

  // Subscription methods for DatabaseStorage
  async getOrCreateSubscription(merchantId: number): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    
    // Try to get existing subscription
    const existing = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .limit(1);
    
    if (existing[0]) {
      return existing[0];
    }
    
    // Create new subscription with free tier
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const result = await this.db
      .insert(merchantSubscriptions)
      .values({
        merchantId,
        tier: 'free',
        status: 'active',
        currentMonthTransactions: 0,
        totalLifetimeTransactions: 0,
        monthStartDate: new Date(),
        billingFrequency: 'monthly',
        nextBillingDate: nextMonth,
        unbilledTransactionCount: 0,
        unbilledAmount: '0.00',
      })
      .returning();
    
    return result[0];
  }

  async getSubscription(merchantId: number): Promise<MerchantSubscription | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .limit(1);
    return result[0];
  }

  async updateSubscriptionTier(merchantId: number, tier: string): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchantSubscriptions)
      .set({ tier, updatedAt: new Date() })
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .returning();
    return result[0];
  }

  async updateSubscriptionBillingFrequency(merchantId: number, frequency: string): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    
    // Calculate next billing date based on frequency
    const now = new Date();
    let nextBillingDate = new Date(now);
    
    switch (frequency) {
      case 'weekly':
        nextBillingDate.setDate(now.getDate() + 7);
        break;
      case 'bi_weekly':
        nextBillingDate.setDate(now.getDate() + 14);
        break;
      case 'monthly':
      default:
        nextBillingDate.setMonth(now.getMonth() + 1);
        break;
    }
    
    const result = await this.db
      .update(merchantSubscriptions)
      .set({ 
        billingFrequency: frequency,
        nextBillingDate,
        updatedAt: new Date() 
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .returning();
    return result[0];
  }

  async updateSubscriptionPaymentMethod(merchantId: number, stripeCustomerId: string, stripePaymentMethodId: string): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    
    const result = await this.db
      .update(merchantSubscriptions)
      .set({ 
        stripeCustomerId,
        stripePaymentMethodId,
        updatedAt: new Date() 
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .returning();
    return result[0];
  }

  async incrementTransactionCount(merchantId: number): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    
    // Get or create subscription
    const subscription = await this.getOrCreateSubscription(merchantId);
    
    // Check if we need to reset monthly counter (new month started)
    const now = new Date();
    const monthStart = new Date(subscription.monthStartDate || now);
    const monthsElapsed = (now.getFullYear() - monthStart.getFullYear()) * 12 + 
                         (now.getMonth() - monthStart.getMonth());
    
    // Reset monthly counter if new month started
    if (monthsElapsed >= 1) {
      await this.db
        .update(merchantSubscriptions)
        .set({
          currentMonthTransactions: 0,
          monthStartDate: now,
          updatedAt: now
        })
        .where(eq(merchantSubscriptions.merchantId, merchantId));
      
      // Refresh subscription after reset
      const refreshed = await this.getSubscription(merchantId);
      if (!refreshed) throw new Error('Failed to refresh subscription');
      subscription.currentMonthTransactions = 0;
    }
    
    const currentCount = subscription.currentMonthTransactions || 0;
    const isFreeTier = subscription.tier === 'free';
    
    // For free tier: only charge beyond 1000 transactions
    // For paid tier: charge every transaction
    const shouldCharge = !isFreeTier || currentCount >= 1000;
    
    // Increment counters
    const updates: any = {
      currentMonthTransactions: currentCount + 1,
      totalLifetimeTransactions: (subscription.totalLifetimeTransactions || 0) + 1,
      updatedAt: now
    };
    
    // Add billing charges only if appropriate
    if (shouldCharge) {
      updates.unbilledTransactionCount = (subscription.unbilledTransactionCount || 0) + 1;
      updates.unbilledAmount = String(parseFloat(subscription.unbilledAmount || '0') + 0.10);
    }
    
    await this.db
      .update(merchantSubscriptions)
      .set(updates)
      .where(eq(merchantSubscriptions.merchantId, merchantId));
  }

  async cancelSubscription(merchantId: number, reason: string): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    
    const now = new Date();
    const effectiveDate = new Date(now);
    effectiveDate.setDate(now.getDate() + 30); // 30 days notice
    
    const result = await this.db
      .update(merchantSubscriptions)
      .set({
        status: 'cancelled',
        cancellationRequestedAt: now,
        cancellationEffectiveDate: effectiveDate,
        cancellationReason: reason,
        updatedAt: now
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .returning();
    return result[0];
  }

  async getBillingHistory(merchantId: number, limit: number = 50): Promise<SubscriptionBillingHistory[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(subscriptionBillingHistory)
      .where(eq(subscriptionBillingHistory.merchantId, merchantId))
      .orderBy(desc(subscriptionBillingHistory.createdAt))
      .limit(limit);
  }

  async createBillingHistory(data: any): Promise<SubscriptionBillingHistory> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .insert(subscriptionBillingHistory)
      .values(data)
      .returning();
    return result[0];
  }

  async resetMonthlyTransactionCount(merchantId: number): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    await this.db
      .update(merchantSubscriptions)
      .set({
        currentMonthTransactions: 0,
        monthStartDate: new Date(),
        updatedAt: new Date()
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId));
  }

  async getUnbilledTransactions(merchantId: number): Promise<{ count: number; amount: number }> {
    if (!this.db) throw new Error('Database not available');
    const subscription = await this.getSubscription(merchantId);
    
    if (!subscription) {
      return { count: 0, amount: 0 };
    }
    
    return {
      count: subscription.unbilledTransactionCount || 0,
      amount: parseFloat(subscription.unbilledAmount || '0')
    };
  }

  async resetUnbilledTransactions(merchantId: number): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    await this.db
      .update(merchantSubscriptions)
      .set({
        unbilledTransactionCount: 0,
        unbilledAmount: '0.00',
        lastBillingDate: new Date().toISOString(),
        updatedAt: new Date()
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId));
  }

  async getAllActiveSubscriptions(billingFrequency?: string): Promise<MerchantSubscription[]> {
    if (!this.db) throw new Error('Database not available');
    
    const conditions = [eq(merchantSubscriptions.status, 'active')];
    
    // Filter by billing frequency if provided
    if (billingFrequency) {
      conditions.push(eq(merchantSubscriptions.billingFrequency, billingFrequency));
    }
    
    return await this.db
      .select()
      .from(merchantSubscriptions)
      .where(and(...conditions));
  }
}

// Use database storage if available, fall back to memory storage
export const storage: IStorage & { clearAllMerchants?: () => void } = isDatabaseConnected() 
  ? new DatabaseStorage() 
  : new MemStorage();
