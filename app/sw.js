const CACHE_NAME = 'rc-timer-v7';

const PRECACHE_URLS = [
  '/app/index.html',
  '/app/manifest.json',
  '/app/styles/tokens.css',
  '/app/styles/global.css',
  '/app/styles/home.css',
  '/app/styles/viewfinder.css',
  '/app/js/app.js',
  '/app/js/router.js',
  '/app/js/home.js',
  '/app/js/camera.js',
  '/app/js/wakeLock.js',
  '/app/js/audio.js',
  '/app/js/viewfinder.js',
  '/app/js/calibration.js',
  '/app/js/detector.js',   // ← Phase 4 addition
  '/app/styles/countdown.css',
  '/app/styles/dashboard.css',
  '/app/js/session.js',
  '/app/js/countdown.js',
  '/app/js/dashboard.js',
];

// Install: pre-cache all shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: delete any outdated cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
});

// Fetch: cache-first, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
