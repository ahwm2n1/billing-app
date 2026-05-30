const CACHE_NAME = 'mela-stall-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script2.js',
  'https://fonts.googleapis.com/css2?family=Baloo+Bhai+2:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => {
        // Offline fallback - return basic offline page for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline - content not available', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});