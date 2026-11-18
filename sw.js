/* أُنس أحمد V18 — Service Worker
   · الملفات المحلية (HTML/CSS/JS): الشبكة أولاً ثم الكاش ⇒ لا تبقى نسخة قديمة بعد النشر، وتعمل دون اتصال
   · الصور والأيقونات: الكاش أولاً
   · طلبات القرآن والصوت (نطاقات خارجية) لا يعترضها هذا الملف؛ نص السور يُحفظ في IndexedDB من الكود نفسه */
'use strict';
var CACHE = 'uns-ahmad-shell-v18-3';
var SHELL = [
 "./",
 "./index.html",
 "./manifest.json",
 "./css/style.css",
 "./css/advanced.css",
 "./css/premium-mobile.css",
 "./css/polish-v2.css",
 "./css/phase-completion.css",
 "./css/ans-elegant-redesign.css",
 "./css/luxury-refresh.css",
 "./css/nawawi.css",
 "./css/phase1-ux-refresh.css",
 "./css/phase2-backup.css",
 "./css/user-requested-fixes.css",
 "./css/v18-fixes.css",
 "./css/quran-refined.css",
 "./css/cinema.css",
 "./css/design-system.css",
 "./js/loader.js",
 "./js/main.js",
 "./js/storage.js",
 "./js/backup.js",
 "./js/azkar-data.js",
 "./js/config.js",
 "./js/quran-core.js",
 "./js/quran-audio.js",
 "./js/quran.js",
 "./js/adhkar.js",
 "./js/ai.js",
 "./js/advanced.js",
 "./js/quran-upgrades.js",
 "./js/site-polish.js",
 "./js/pwa.js",
 "./js/phase-completion.js",
 "./js/nabr-recitation.js",
 "./js/guided-recitation.js",
 "./js/taj-adhikr.js",
 "./js/nawawi.js",
 "./js/nawawi-plan.js",
 "./js/quran-ui.js",
 "./js/home.js",
 "./js/cinema.js",
 "./assets/logo.png",
 "./assets/icon-192.png",
 "./assets/icon-512.png",
 "./assets/ahmad-fayez.jpg"
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // نضيف كل ملف على حدة: غياب ملف واحد لا يُفشل التثبيت كله
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* تجاهل */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('uns-ahmad-shell-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, fallbackKey) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(fallbackKey || req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(fallbackKey || req).then(function (r) { return r || caches.match('./index.html'); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // لا نتدخل في الخطوط/الصوت/واجهات القرآن
  if (url.pathname.indexOf('/.netlify/') === 0 || url.pathname.indexOf('/api/') === 0) return;

  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, './index.html')); return; }
  if (/\.(?:js|css|html|json)$/.test(url.pathname)) { event.respondWith(networkFirst(req)); return; }

  event.respondWith(caches.match(req).then(function (cached) {
    return cached || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
