const CACHE_VERSION = 'v2';
const CACHE_NAME = `sottile-${CACHE_VERSION}`;
const STATIC_ASSETS = ['/css/style.css'];

// Instalar: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar cachés viejas — #8
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para API, cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) return; // API siempre desde red
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sottile-Competicion', {
      body: data.body || '',
      icon: '/css/icon.png',
      badge: '/css/icon.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
