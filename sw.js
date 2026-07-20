// sw.js — Service Worker בסיסי (PWA + offline). cache-first לנכסים סטטיים.
const CACHE = 'cv3-v2';
const ASSETS = ['./', 'index.html', 'css/main.css', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png',
  'js/config.js', 'js/supabase.js', 'js/api.js', 'js/ui.js', 'js/auth.js',
  'js/students.js', 'js/behavior.js', 'js/tracking.js', 'js/dashboard.js', 'js/admin.js', 'js/app.js'];
// מנקה cache ישן בעדכון גרסה
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); });
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;   // לא לשמור בקשות ל-Supabase/CDN
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('index.html'))));
});
