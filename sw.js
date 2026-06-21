// sw.js — Service Worker for offline support
// Cheder-BHT Production. 2026-05-27 (v2 — network-first for api.js, skip dynamic data)

const CACHE_NAME = 'bht-cache-v17-20260618a';
const CORE_ASSETS = [
  '/cheder-bht/',
  '/cheder-bht/index.html',
  '/cheder-bht/app.js',
  '/cheder-bht/css/main.css',
  '/cheder-bht/css/theme.css',
  '/cheder-bht/js/schema.js',
  '/cheder-bht/js/dashboard_charts.js',
  '/cheder-bht/js/quick_search.js',
  '/cheder-bht/js/student_quickview.js',
  '/cheder-bht/js/supabase_client.js',
];

// Files that MUST always come from network (avoid stale data):
// - api.js (changes frequently, contains data sync logic)
// - dist/main.bundle.js (concatenated packs — rebuilt on each deploy)
// - Legacy behavior-pack-*.js (transitional; individual files still served if linked)
// - monitor.js, sync-engine-v2.js (sync logic)
const NETWORK_FIRST = [
  /\/cheder-bht\/?$/,
  /\/cheder-bht\/index\.html(\?|$)/,
  /\/api\.js(\?|$)/,
  /\/dist\/main\.bundle\.js(\?|$)/,
  /\/behavior-pack-\d+\.js(\?|$)/,
  /\/monitor\.js(\?|$)/,
  /\/sync-engine\.js(\?|$)/,
  /\/sync-engine-v2\.js(\?|$)/,
  /\/students\.js(\?|$)/,
  /\/settings\.js(\?|$)/,
  /\/behavior\.js(\?|$)/,
  /\/behavior-forms\.js(\?|$)/,
  /\/behavior-tasks\.js(\?|$)/,
  /\/behavior-card\.js(\?|$)/,
  /\/behavior-enhancements\.js(\?|$)/,
  /\/behavior-extras\.js(\?|$)/,
  /\/behavior-v2\.js(\?|$)/,
  /\/app\.js(\?|$)/,
  /\/studentSearch\.js(\?|$)/,
  /\/behavior-simple\.js(\?|$)/,
  /\/multi-simple\.js(\?|$)/,
  /\/unified-report\.js(\?|$)/,
  /\/reading\.js(\?|$)/,
  /\/writing\.js(\?|$)/,
  /\/lessonsKlein\.js(\?|$)/,
  /\/conversations\.js(\?|$)/,
  /\/meetings\.js(\?|$)/,
  /\/attendance\.js(\?|$)/,
  /\/reports\.js(\?|$)/,
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
    // Tell every open tab to refresh once so they pick up the new bundle.
    const all = await self.clients.matchAll({ type: 'window' });
    all.forEach(c => c.postMessage({ type: 'SW_NEW_VERSION', cache: CACHE_NAME }));
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Pass through external dynamic sources
  if (url.host.includes('script.google.com') ||
      url.host.includes('trycloudflare.com') ||
      url.host.includes('googleusercontent.com') ||
      url.host.includes('drive.google.com')) {
    return;
  }

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for sync-critical files
  if (NETWORK_FIRST.some(re => re.test(url.pathname + url.search))) {
    e.respondWith(
      fetch(e.request).then(net => {
        // Update cache for offline fallback only
        if (net.ok) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, net.clone())).catch(() => {});
        }
        return net;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static (images, css, libs)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Refresh in background
        fetch(e.request).then(net => {
          if (net.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, net.clone())).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(net => {
        if (net.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, net.clone())).catch(() => {});
        return net;
      }).catch(() => caches.match('/cheder-bht/index.html'));
    })
  );
});

// Listen for skipWaiting message from client
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
