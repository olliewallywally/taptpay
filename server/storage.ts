import { merchants, transactions, type Merchant, type Transaction, type InsertMerchant, type InsertTransaction } from "@shared/schema";
import { getDb, isDatabaseConnected } from "./database";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchantRates(id: number, currentProviderRate: string): Promise<Merchant | undefined>;
  updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined>;
  updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined>;
  
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
    
    // Create default merchant for demo
    this.createMerchant({
      name: "MERCHANT",
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent("http://localhost:5000/pay/1"),
      paymentUrl: "http://localhost:5000/pay/1",
      currentProviderRate: "0.0290",
      ourRate: "0.0020"
    });

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

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = { 
      ...insertMerchant, 
      id,
      currentProviderRate: insertMerchant.currentProviderRate || "0.0290",
      ourRate: insertMerchant.ourRate || "0.0020",
      businessName: null,
      contactEmail: null,
      contactPhone: null,
      businessAddress: null,
      bankName: null,
      bankAccountNumber: null,
      bankBranch: null,
      accountHolderName: null,
    };
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

  private createSampleData() {
    const sampleTransactions = [
      { itemName: "Cappuccino", price: "4.50", status: "completed" },
      { itemName: "Latte", price: "5.00", status: "completed" },
      { itemName: "Sandwich", price: "8.95", status: "completed" },
      { itemName: "Muffin", price: "3.75", status: "completed" },
      { itemName: "Americano", price: "3.50", status: "completed" },
      { itemName: "Croissant", price: "4.25", status: "completed" },
      { itemName: "Tea", price: "2.95", status: "completed" },
      { itemName: "Bagel", price: "6.50", status: "completed" },
      { itemName: "Smoothie", price: "7.95", status: "completed" },
      { itemName: "Hot Chocolate", price: "4.75", status: "completed" },
    ];

    for (const transaction of sampleTransactions) {
      const id = this.currentTransactionId++;
      const newTransaction: Transaction = {
        id,
        merchantId: 1,
        itemName: transaction.itemName,
        price: transaction.price,
        status: transaction.status,
        windcaveTransactionId: `WC_${Date.now() + Math.random()}`,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last week
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
}

// Use database storage if available, fall back to memory storage
export const storage: IStorage = isDatabaseConnected() 
  ? new DatabaseStorage() 
  : new MemStorage();
