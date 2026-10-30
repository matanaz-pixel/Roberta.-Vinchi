// Service worker של אפליקציית המלאי בלבד (נפרד מזה של ספר המתכונים ושל אפליקציית ההפסקות).
// הדף והקבצים שלו נטענים קודם מהרשת (עד 4 שניות) כדי שעדכונים יגיעו, ואם אין קליטה נטענים מהמכשיר.
// נתוני הספירות וההגדרות לא נשמרים כאן: ההגדרות במכשיר (localStorage, 14 יום) והספירות ב-Firebase.
const VERSION = 'stock-v1';
const SHELL = ['./stock.html', './stock-lib.js', './recipes-lib.js', './firebase-init.js', './stock.webmanifest', './roberta-logo-white.svg', './roberta-logo.png', './roberta-icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('stock-') && k !== VERSION).map(k => caches.delete(k))))
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
    if(file === 'stock.html' || file === 'stock-lib.js' || file === 'recipes-lib.js' || file === 'firebase-init.js' || req.mode === 'navigate') return e.respondWith(networkFirst(req, 4000));
    if(SHELL.some(s => s.endsWith('/' + file))) return e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // סקריפטים של Firebase והפונט: כדי שהדף ייפתח גם בלי קליטה אחרי הביקור הראשון
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) e.respondWith(staleWhileRevalidate(req));
});
