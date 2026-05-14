const CACHE_NAME = 'rc-timer-v3';

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
  'js/viewfinder.js',   // ← Phase 3 additions
  'js/calibration.js',  // ← Phase 3 additions
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
