// Service worker של ספר המתכונים בלבד (נפרד מזה של אפליקציית ההפסקות).
// הדף נטען קודם מהרשת (עד 4 שניות) כדי שעדכונים יגיעו, ואם אין קליטה נטען מהמכשיר.
const VERSION = 'book-v4';
const SHELL = ['./recipes.html', './recipes-lib.js', './recipes.webmanifest', './roberta-logo-white.svg', './roberta-logo.png', './roberta-icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('book-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, ms){
  const net = fetch(req);
  net.then(res => { if(res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); }).catch(() => {});
  try{
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms))]);
  }catch(e){
    return (await caches.match(req, { ignoreSearch: true })) || net.catch(() => Response.error());
  }
}
function staleWhileRevalidate(req){
  return caches.match(req, { ignoreSearch: true }).then(cached => {
    const net = fetch(req).then(res => { if(res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone())); return res; }).catch(() => cached);
    return cached || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET') return;
  if(url.origin === location.origin){
    const file = url.pathname.split('/').pop();
    if(file === 'recipes.html' || file === 'recipes-lib.js' || req.mode === 'navigate') return e.respondWith(networkFirst(req, 4000));
    if(SHELL.some(s => s.endsWith('/' + file))) return e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(req));
});
