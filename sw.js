const CACHE_NAME = 'chef-breaks-v8';
const FILES_TO_CACHE = [
  './index.html',
  './bank.html',
  './history.html',
  './chef.html',
  './firebase-init.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('chef-breaks-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// מהמטמון מיד, ובמקביל מרענן מהרשת (העדכון מגיע בפתיחה הבאה). לא נוגע בקבצי ספר המתכונים ולא בבקשות חיצוניות.
self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.split('/').pop().startsWith('recipes')) return;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || net;
      })
    )
  );
});

// לחיצה על התראה - מביאה את האפליקציה הפתוחה לחזית, או פותחת אותה אם סגורה
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
