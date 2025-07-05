import { merchants, transactions, type Merchant, type Transaction, type InsertMerchant, type InsertTransaction } from "@shared/schema";

export interface IStorage {
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  
  // Transaction operations
  getTransaction(id: number): Promise<Transaction | undefined>;
  getActiveTransactionByMerchant(merchantId: number): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined>;
  getTransactionsByMerchant(merchantId: number): Promise<Transaction[]>;
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
      paymentUrl: "http://localhost:5000/pay/1"
    });
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
    const merchant: Merchant = { ...insertMerchant, id };
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
}

export const storage = new MemStorage();
