const CACHE_NAME = 'taptpay-v1';
const OFFLINE_URLS = [
  '/',
  '/terminal',
  '/dashboard',
  '/settings'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingTransactions() {
  const db = await openDatabase();
  const tx = db.transaction('pendingTransactions', 'readonly');
  const store = tx.objectStore('pendingTransactions');
  const request = store.getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = async () => {
      const pendingTransactions = request.result;
      
      for (const transaction of pendingTransactions) {
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
            await removeFromPending(transaction.offlineId);
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'TRANSACTION_SYNCED',
                  offlineId: transaction.offlineId,
                  success: true
                });
              });
            });
          }
        } catch (error) {
          console.error('Failed to sync transaction:', error);
        }
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TapTpayOffline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removeFromPending(offlineId) {
  const db = await openDatabase();
  const tx = db.transaction('pendingTransactions', 'readwrite');
  const store = tx.objectStore('pendingTransactions');
  store.delete(offlineId);
}
