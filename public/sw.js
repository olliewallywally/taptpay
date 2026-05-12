const CACHE_NAME = 'taptpay-v2';
const STATIC_CACHE = 'taptpay-static-v2';

const STATIC_ASSETS = [
  '/icons/icon-192x192.png',
  '/og-image.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'TaptPay', body: event.data.text() };
  }

  const status = payload.data?.status || '';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const vibratePattern = isCompleted
    ? [80, 40, 80, 40, 200]
    : isFailed
    ? [300]
    : [100, 50, 100];

  const actions = isCompleted
    ? [{ action: 'view', title: '📊 View Transactions' }]
    : isFailed
    ? [{ action: 'view', title: '🔄 Check Status' }, { action: 'dismiss', title: 'Dismiss' }]
    : [{ action: 'view', title: '👁 Open Terminal' }, { action: 'dismiss', title: 'Dismiss' }];

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: payload.tag || `taptpay-${status || 'update'}`,
    data: { ...(payload.data || {}), url: isCompleted ? '/transactions' : '/terminal' },
    vibrate: vibratePattern,
    requireInteraction: isCompleted,
    silent: false,
    actions,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'TaptPay', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = new URL(
    event.notification.data?.url || '/terminal',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.focus();
            if ('navigate' in client) client.navigate(urlToOpen);
            return;
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
