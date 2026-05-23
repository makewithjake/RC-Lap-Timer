const CACHE_NAME = 'rc-timer-v11';

const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  'styles/tokens.css',
  'styles/global.css',
  'styles/home.css',
  'styles/viewfinder.css',
  'js/app.js',
  'js/router.js',
  'js/home.js',
  'js/camera.js',
  'js/wakeLock.js',
  'js/audio.js',
  'js/viewfinder.js',
  'js/calibration.js',
  'js/detector.js',
  'styles/countdown.css',
  'styles/dashboard.css',
  'js/session.js',
  'js/countdown.js',
  'js/dashboard.js',
  'js/storage.js',
  'js/summary.js',
  'js/history.js',
  'js/settings.js',
  'styles/summary.css',
  'styles/history.css',
  'styles/settings.css',
];

// Install: pre-cache all shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Take control immediately on install so navigator.serviceWorker.controller
  // is non-null on the current page without requiring a reload.
  self.skipWaiting();
});

// Activate: delete any outdated cache versions, then claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
