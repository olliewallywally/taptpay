import { merchants, transactions, type Merchant, type Transaction, type InsertMerchant, type InsertTransaction, type CreateMerchant } from "@shared/schema";
import { getDb, isDatabaseConnected } from "./database";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  getMerchantByEmail(email: string): Promise<Merchant | undefined>;
  getMerchantByToken(token: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant>;
  createMerchantWithSignup(data: CreateMerchant & { verificationToken: string }): Promise<Merchant>;
  verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined>;
  updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined>;
  updateMerchantRates(id: number, currentProviderRate: string): Promise<Merchant | undefined>;
  updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined>;
  updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined>;
  getAllMerchants(): Promise<Merchant[]>;
  
  // Transaction operations
  getTransaction(id: number): Promise<Transaction | undefined>;
  getActiveTransactionByMerchant(merchantId: number): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined>;
  getTransactionsByMerchant(merchantId: number): Promise<Transaction[]>;
  
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
}

export class MemStorage implements IStorage {
  private merchants: Map<number, Merchant>;
  private transactions: Map<number, Transaction>;
  private currentMerchantId: number;
  private currentTransactionId: number;

  constructor() {
    this.merchants = new Map();
    this.transactions = new Map();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    
    // Create default merchant for demo with new schema
    const merchant: Merchant = {
      id: this.currentMerchantId++,
      name: "MERCHANT",
      businessName: "The Coffee Corner",
      businessType: "Cafe",
      email: "manager@coffeecorner.co.nz",
      phone: "+64 9 123 4567",
      address: "123 Queen Street, Auckland 1010, New Zealand",
      status: "verified",
      verificationToken: null,
      passwordHash: null,
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent("http://localhost:5000/pay/1"),
      paymentUrl: "http://localhost:5000/pay/1",
      currentProviderRate: "0.0290",
      ourRate: "0.0020",
      contactEmail: "manager@coffeecorner.co.nz",
      contactPhone: "+64 9 123 4567",
      businessAddress: "123 Queen Street, Auckland 1010, New Zealand",
      bankName: "ANZ Bank",
      bankAccountNumber: "12-3456-1234567-123",
      bankBranch: "Queen Street Branch",
      accountHolderName: "The Coffee Corner Ltd",
      gstNumber: "123-456-789",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(merchant.id, merchant);

    // Add sample transactions for demo
    this.createSampleData();
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
      qrCodeUrl: insertMerchant.qrCodeUrl || null,
      paymentUrl: insertMerchant.paymentUrl || null,
      currentProviderRate: insertMerchant.currentProviderRate || "0.0290",
      ourRate: insertMerchant.ourRate || "0.0020",
      contactEmail: insertMerchant.contactEmail || null,
      contactPhone: insertMerchant.contactPhone || null,
      businessAddress: insertMerchant.businessAddress || null,
      bankName: insertMerchant.bankName || null,
      bankAccountNumber: insertMerchant.bankAccountNumber || null,
      bankBranch: insertMerchant.bankBranch || null,
      accountHolderName: insertMerchant.accountHolderName || null,
      gstNumber: insertMerchant.gstNumber || null,
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

  async getActiveTransactionByMerchant(merchantId: number): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(
      (transaction) => transaction.merchantId === merchantId && transaction.status === "pending"
    );
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const transaction: Transaction = {
      ...insertTransaction,
      id,
      createdAt: new Date(),
      windcaveTransactionId: null,
    };
    this.transactions.set(id, transaction);
    return transaction;
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
    return updatedTransaction;
  }

  async getTransactionsByMerchant(merchantId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.merchantId === merchantId
    );
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

  async getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    currentProviderCost: number;
    ourCost: number;
    savings: number;
    currentProviderRate: number;
    ourRate: number;
  }> {
    const merchant = this.merchants.get(merchantId);
    const transactions = await this.getTransactionsByMerchant(merchantId);
    
    const completedTransactions = transactions.filter(t => t.status === "completed");
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
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
        merchantId: 1,
        itemName: transaction.itemName,
        price: transaction.price,
        status: transaction.status,
        windcaveTransactionId: `WC_${Date.now() + Math.random()}`,
        createdAt: createdDate,
      };
      this.transactions.set(id, newTransaction);
    }
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

  async getActiveTransactionByMerchant(merchantId: number): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, 'pending')))
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    return result[0];
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(transactions).values(insertTransaction).returning();
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
  }> {
    if (!this.db) throw new Error('Database not available');
    
    const merchantTransactions = await this.getTransactionsByMerchant(merchantId);
    const merchant = await this.getMerchant(merchantId);
    
    const totalTransactions = merchantTransactions.length;
    const completedTransactions = merchantTransactions.filter(t => t.status === 'completed').length;
    const totalRevenue = merchantTransactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + parseFloat(t.price), 0);
    
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
}

// Use database storage if available, fall back to memory storage
export const storage: IStorage = isDatabaseConnected() 
  ? new DatabaseStorage() 
  : new MemStorage();
