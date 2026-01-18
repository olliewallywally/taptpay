import { offlineStorage, PendingTransaction } from './offline-storage';

type SyncListener = (event: SyncEvent) => void;

interface SyncEvent {
  type: 'sync_started' | 'sync_progress' | 'sync_completed' | 'sync_failed' | 'transaction_synced' | 'transaction_failed';
  offlineId?: string;
  progress?: { current: number; total: number };
  error?: string;
  serverTransactionId?: number;
}

class SyncService {
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private listeners: Set<SyncListener> = new Set();
  private syncInterval: number | null = null;

  constructor() {
    this.setupEventListeners();
    this.setupServiceWorkerListener();
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.emit({ type: 'sync_started' });
      this.syncPendingTransactions();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private setupServiceWorkerListener() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'TRANSACTION_SYNCED') {
          this.emit({
            type: 'transaction_synced',
            offlineId: event.data.offlineId,
            serverTransactionId: event.data.serverTransactionId
          });
        }
      });
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SyncEvent) {
    this.listeners.forEach(listener => listener(event));
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  getSyncingStatus(): boolean {
    return this.isSyncing;
  }

  async createOfflineTransaction(merchantId: number, itemName: string, price: string): Promise<PendingTransaction> {
    const authToken = localStorage.getItem('authToken') || '';
    
    const transaction = await offlineStorage.savePendingTransaction({
      merchantId,
      itemName,
      price,
      authToken
    });

    if (this.isOnline) {
      this.syncPendingTransactions();
    } else {
      this.requestBackgroundSync();
    }

    return transaction;
  }

  private requestBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in (window as any).ServiceWorkerRegistration?.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        (registration as any).sync.register('sync-transactions').catch((err: Error) => {
          console.log('Background sync registration failed:', err);
        });
      });
    }
  }

  async syncPendingTransactions(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    this.isSyncing = true;
    this.emit({ type: 'sync_started' });

    try {
      const pendingTransactions = await offlineStorage.getPendingTransactions();
      const toSync = pendingTransactions.filter(t => 
        t.status === 'pending_sync' || (t.status === 'failed' && t.syncAttempts < 3)
      );

      if (toSync.length === 0) {
        this.isSyncing = false;
        this.emit({ type: 'sync_completed' });
        return;
      }

      let synced = 0;
      const total = toSync.length;

      for (const transaction of toSync) {
        await offlineStorage.updateTransactionStatus(transaction.offlineId, 'syncing');
        
        try {
          const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${transaction.authToken}`
            },
            body: JSON.stringify({
              merchantId: transaction.merchantId,
              itemName: transaction.itemName,
              price: transaction.price,
              status: 'pending',
              offlineId: transaction.offlineId,
              createdOfflineAt: transaction.createdAt
            })
          });

          if (response.ok) {
            const result = await response.json();
            await offlineStorage.moveToSynced(transaction.offlineId, result.id);
            synced++;
            
            this.emit({
              type: 'transaction_synced',
              offlineId: transaction.offlineId,
              serverTransactionId: result.id
            });

            this.emit({
              type: 'sync_progress',
              progress: { current: synced, total }
            });
          } else {
            const errorText = await response.text();
            await offlineStorage.updateTransactionStatus(
              transaction.offlineId, 
              'failed', 
              `Server error: ${response.status} - ${errorText}`
            );
            
            this.emit({
              type: 'transaction_failed',
              offlineId: transaction.offlineId,
              error: `Server error: ${response.status}`
            });
          }
        } catch (error) {
          await offlineStorage.updateTransactionStatus(
            transaction.offlineId, 
            'failed', 
            error instanceof Error ? error.message : 'Network error'
          );
          
          this.emit({
            type: 'transaction_failed',
            offlineId: transaction.offlineId,
            error: error instanceof Error ? error.message : 'Network error'
          });
        }
      }

      this.emit({ type: 'sync_completed' });
    } catch (error) {
      console.error('Sync failed:', error);
      this.emit({ 
        type: 'sync_failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      this.isSyncing = false;
    }
  }

  startPeriodicSync(intervalMs: number = 30000) {
    if (this.syncInterval) return;
    
    this.syncInterval = window.setInterval(() => {
      if (this.isOnline) {
        this.syncPendingTransactions();
      }
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const syncService = new SyncService();
