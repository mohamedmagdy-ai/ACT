// Service worker للوحة متابعة المحل — بيخزن هيكل الصفحة بس عشان تفتح بسرعة
// وتشتغل حتى لو النت بطيء لحظة الفتح. البيانات نفسها (فايرستور) مبتتخزنش
// هنا خالص وبتيجي لايف على طول عشان تفضل دايمًا صح ومحدّثة.

const CACHE_NAME = 'act-mobile-dashboard-v1.3.18';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // أي حاجة برا نفس الأصل (فايرستور، جوجل، الخطوط...) — سيبها تروح للنت
  // على طول، من غير أي تدخل من الـ service worker.
  if (url.origin !== self.location.origin) return;

  // هيكل الصفحة نفسه: جرّب الكاش الأول عشان فتح سريع، وحدّثه في الخلفية
  // (stale-while-revalidate) عشان أي تحديث للصفحة يوصل من غير ما ننتظره.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
