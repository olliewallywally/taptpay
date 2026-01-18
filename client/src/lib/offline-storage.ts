const DB_NAME = 'TapTpayOffline';
const DB_VERSION = 1;

export interface PendingTransaction {
  offlineId: string;
  merchantId: number;
  itemName: string;
  price: string;
  status: 'pending_sync' | 'syncing' | 'synced' | 'failed';
  createdAt: string;
  authToken: string;
  syncAttempts: number;
  lastSyncAttempt?: string;
  errorMessage?: string;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open offline database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('pendingTransactions')) {
          const store = db.createObjectStore('pendingTransactions', { keyPath: 'offlineId' });
          store.createIndex('merchantId', 'merchantId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('syncedTransactions')) {
          const syncedStore = db.createObjectStore('syncedTransactions', { keyPath: 'offlineId' });
          syncedStore.createIndex('merchantId', 'merchantId', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  generateOfflineId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async savePendingTransaction(transaction: Omit<PendingTransaction, 'offlineId' | 'status' | 'createdAt' | 'syncAttempts'>): Promise<PendingTransaction> {
    const db = await this.init();
    
    const pendingTransaction: PendingTransaction = {
      ...transaction,
      offlineId: this.generateOfflineId(),
      status: 'pending_sync',
      createdAt: new Date().toISOString(),
      syncAttempts: 0
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readwrite');
      const store = tx.objectStore('pendingTransactions');
      const request = store.add(pendingTransaction);

      request.onsuccess = () => resolve(pendingTransaction);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingTransactions(merchantId?: number): Promise<PendingTransaction[]> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readonly');
      const store = tx.objectStore('pendingTransactions');
      
      let request: IDBRequest;
      if (merchantId) {
        const index = store.index('merchantId');
        request = index.getAll(merchantId);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingCount(merchantId: number): Promise<number> {
    const pending = await this.getPendingTransactions(merchantId);
    return pending.filter(t => t.status === 'pending_sync' || t.status === 'syncing').length;
  }

  async updateTransactionStatus(offlineId: string, status: PendingTransaction['status'], errorMessage?: string): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readwrite');
      const store = tx.objectStore('pendingTransactions');
      const getRequest = store.get(offlineId);

      getRequest.onsuccess = () => {
        const transaction = getRequest.result;
        if (transaction) {
          transaction.status = status;
          transaction.syncAttempts += 1;
          transaction.lastSyncAttempt = new Date().toISOString();
          if (errorMessage) {
            transaction.errorMessage = errorMessage;
          }
          
          const updateRequest = store.put(transaction);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async removeTransaction(offlineId: string): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readwrite');
      const store = tx.objectStore('pendingTransactions');
      const request = store.delete(offlineId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async moveToSynced(offlineId: string, serverTransactionId: number): Promise<void> {
    const db = await this.init();
    const transaction = await this.getTransaction(offlineId);
    
    if (!transaction) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['pendingTransactions', 'syncedTransactions'], 'readwrite');
      
      const syncedStore = tx.objectStore('syncedTransactions');
      syncedStore.add({
        ...transaction,
        status: 'synced',
        serverTransactionId,
        syncedAt: new Date().toISOString()
      });

      const pendingStore = tx.objectStore('pendingTransactions');
      pendingStore.delete(offlineId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTransaction(offlineId: string): Promise<PendingTransaction | null> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readonly');
      const store = tx.objectStore('pendingTransactions');
      const request = store.get(offlineId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllPending(): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingTransactions', 'readwrite');
      const store = tx.objectStore('pendingTransactions');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineStorage = new OfflineStorage();
