import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
import { syncService } from '@/lib/sync-service';
import { offlineStorage } from '@/lib/offline-storage';
import { getCurrentMerchantId } from '@/lib/auth';

interface OfflineStatusIndicatorProps {
  showPendingCount?: boolean;
  compact?: boolean;
}

export function OfflineStatusIndicator({ showPendingCount = true, compact = false }: OfflineStatusIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const updatePendingCount = async () => {
      if (merchantId) {
        const count = await offlineStorage.getPendingCount(merchantId);
        setPendingCount(count);
      }
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [merchantId]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((event) => {
      switch (event.type) {
        case 'sync_started':
          setIsSyncing(true);
          break;
        case 'sync_progress':
          if (event.progress) {
            setSyncProgress(event.progress);
          }
          break;
        case 'sync_completed':
          setIsSyncing(false);
          setSyncProgress(null);
          setShowSyncSuccess(true);
          setTimeout(() => setShowSyncSuccess(false), 3000);
          if (merchantId) {
            offlineStorage.getPendingCount(merchantId).then(setPendingCount);
          }
          break;
        case 'sync_failed':
          setIsSyncing(false);
          setSyncProgress(null);
          break;
        case 'transaction_synced':
          if (event.offlineId) {
            setLastSyncedId(event.offlineId);
            setTimeout(() => setLastSyncedId(null), 2000);
          }
          if (merchantId) {
            offlineStorage.getPendingCount(merchantId).then(setPendingCount);
          }
          break;
      }
    });

    return unsubscribe;
  }, [merchantId]);

  const handleManualSync = () => {
    if (isOnline && !isSyncing) {
      syncService.syncPendingTransactions();
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isOnline ? (
          <div className="flex items-center gap-1.5 text-green-500">
            <Wifi size={16} />
            {pendingCount > 0 && (
              <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded-full font-medium">
                {pendingCount}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-orange-500">
            <WifiOff size={16} />
            {pendingCount > 0 && (
              <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                {pendingCount}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-3" data-testid="offline-status">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isOnline ? (
            <>
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <Wifi className="text-green-400" size={20} />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Online</p>
                {pendingCount > 0 ? (
                  <p className="text-yellow-400 text-xs">
                    {pendingCount} payment{pendingCount > 1 ? 's' : ''} syncing...
                  </p>
                ) : showSyncSuccess ? (
                  <p className="text-green-400 text-xs flex items-center gap-1">
                    <CheckCircle size={12} /> All synced!
                  </p>
                ) : (
                  <p className="text-gray-400 text-xs">All payments synced</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center animate-pulse">
                <WifiOff className="text-orange-400" size={20} />
              </div>
              <div>
                <p className="text-orange-400 font-medium text-sm">Offline Mode</p>
                <p className="text-gray-400 text-xs">
                  {pendingCount > 0 
                    ? `${pendingCount} payment${pendingCount > 1 ? 's' : ''} pending sync`
                    : 'Payments will sync when online'
                  }
                </p>
              </div>
            </>
          )}
        </div>

        {isOnline && pendingCount > 0 && !isSyncing && (
          <button
            onClick={handleManualSync}
            className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors"
            title="Sync now"
          >
            <RefreshCw className="text-blue-400" size={18} />
          </button>
        )}

        {isSyncing && syncProgress && (
          <div className="flex items-center gap-2">
            <RefreshCw className="text-blue-400 animate-spin" size={18} />
            <span className="text-blue-400 text-xs font-medium">
              {syncProgress.current}/{syncProgress.total}
            </span>
          </div>
        )}
      </div>

      {!isOnline && (
        <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-orange-300 text-xs text-center">
            You can still take payments. They will process automatically when you're back online.
          </p>
        </div>
      )}
    </div>
  );
}

export function OfflineStatusBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const updatePendingCount = async () => {
      if (merchantId) {
        const count = await offlineStorage.getPendingCount(merchantId);
        setPendingCount(count);
      }
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [merchantId]);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div 
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg ${
        isOnline 
          ? 'bg-yellow-500 text-black' 
          : 'bg-orange-500 text-white'
      }`}
    >
      {isOnline ? (
        <>
          <RefreshCw className="animate-spin" size={16} />
          <span className="text-sm font-medium">Syncing {pendingCount}...</span>
        </>
      ) : (
        <>
          <WifiOff size={16} />
          <span className="text-sm font-medium">
            Offline {pendingCount > 0 ? `(${pendingCount} pending)` : ''}
          </span>
        </>
      )}
    </div>
  );
}

export function PendingTransactionsList() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    const loadTransactions = async () => {
      if (merchantId) {
        const pending = await offlineStorage.getPendingTransactions(merchantId);
        setTransactions(pending);
      }
    };

    loadTransactions();
    const interval = setInterval(loadTransactions, 3000);
    return () => clearInterval(interval);
  }, [merchantId]);

  if (transactions.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <Clock className="text-yellow-400" size={20} />
          <span className="text-white font-medium">
            {transactions.length} Pending Payment{transactions.length > 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-gray-400 text-sm">
          {isOpen ? 'Hide' : 'Show'}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-gray-700 divide-y divide-gray-700">
          {transactions.map((tx) => (
            <div key={tx.offlineId} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{tx.itemName}</p>
                <p className="text-gray-400 text-sm">${tx.price}</p>
              </div>
              <div className="flex items-center gap-2">
                {tx.status === 'pending_sync' && (
                  <span className="text-yellow-400 text-xs flex items-center gap-1">
                    <Clock size={12} /> Pending
                  </span>
                )}
                {tx.status === 'syncing' && (
                  <span className="text-blue-400 text-xs flex items-center gap-1">
                    <RefreshCw size={12} className="animate-spin" /> Syncing
                  </span>
                )}
                {tx.status === 'failed' && (
                  <span className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle size={12} /> Failed ({tx.syncAttempts}/3)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
