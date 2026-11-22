/* ============================================================================
   Service Worker Kolej (pola skill pwa-installable)
   • App shell cache-first → aplikasi terbuka instan & tetap bisa scan saat offline
   • API Google Apps Script & POST tidak pernah di-cache → data selalu ke server
   • Update berversi: naikkan VERSION dengan  python3 tools/bump_version.py . 1.0.2
   ========================================================================== */
const VERSION = 'kolej-v1.0.1';          // ← NAIKKAN setiap kali file frontend berubah
const SPA = true;                        // routing pakai #/halaman
const OFFLINE_PAGE = 'offline.html';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'offline.html',
  'pwa.js?v=1.0.1',
  'css/style.css?v=1.0.1',
  'js/config.js?v=1.0.1',
  'js/icons.js?v=1.0.1',
  'js/core.js?v=1.0.1',
  'js/omr.js?v=1.0.1',
  'js/scanner.js?v=1.0.1',
  'js/app.js?v=1.0.1',
  'js/admin.js?v=1.0.1',
  'js/scan-worker.js?v=1.0.1',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'assets/template-lembar-jawaban-F4.pdf'
];

const API_HOSTS = [
  /(^|\.)script\.google\.com$/,
  /(^|\.)script\.googleusercontent\.com$/,
  /(^|\.)googleapis\.com$/
];
const NETWORK_ONLY_PATHS = [/\/api\//];
// font Google & pustaka Excel (SheetJS) → disimpan, diperbarui di latar
const CDN_HOSTS = /fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$|cdn\.jsdelivr\.net$|unpkg\.com$/;
const RUNTIME = VERSION + '-rt';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch((err) => console.warn('[SW] gagal cache', u, err))));
  })());
  // Tidak langsung skipWaiting: pwa.js menampilkan banner "Versi baru tersedia" dulu.
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                                         // POST tidak pernah di-cache
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (API_HOSTS.some((re) => re.test(url.hostname))) return;                 // API GAS → langsung ke server
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && NETWORK_ONLY_PATHS.some((re) => re.test(url.pathname))) return;

  if (req.mode === 'navigate') { e.respondWith(handleNavigate(req, url)); return; }
  if (sameOrigin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
      return res;
    })));
    return;
  }
  if (CDN_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

async function handleNavigate(req, url) {
  const c = await caches.open(VERSION);
  let key = url.href.split(/[?#]/)[0].slice(self.registration.scope.length);
  if (key === '' || key.endsWith('/')) key += 'index.html';
  if (SPA && !/\.html?$/.test(key)) key = 'index.html';
  const hit = (await c.match(key)) || (await c.match(req, { ignoreSearch: true }));
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') c.put(key, res.clone());
    return res;
  }).catch(async () => hit || (await c.match(OFFLINE_PAGE)) || Response.error());
  return hit || net;
}
