// Service worker של ספר המנות בלבד (נפרד מהאפליקציות האחרות). דפים: קודם הרשת (עד 4 שניות), אחרת המכשיר.
// תמונות וגופנים: מהמכשיר ובמקביל מתעדכנים, כך שמלצר בלי קליטה בחדר האוכל עדיין רואה את הכול.
const VERSION = 'menu-v3';
const SHELL = ['./index.html', './menu-lib.js', './menu-view.js', './menu-data.json', './guide.html', './quiz.html', './quiz.js', './quiz-lib.js', './quiz-data.json', './menu.webmanifest', '../roberta-logo-white.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('menu-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, ms) {
  const net = fetch(req);
  net.then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); }).catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms))]);
  } catch (e) {
    return (await caches.match(req, { ignoreSearch: true })) || net.catch(() => Response.error());
  }
}
function staleWhileRevalidate(req) {
  return caches.match(req, { ignoreSearch: true }).then(cached => {
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone())); return res; }).catch(() => cached);
    return cached || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (!url.pathname.includes('/menu/') && !url.pathname.endsWith('.svg')) return;
    if (url.pathname.endsWith('.webp')) return e.respondWith(staleWhileRevalidate(req));
    return e.respondWith(networkFirst(req, 4000));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'www.gstatic.com') e.respondWith(staleWhileRevalidate(req));
});
