// Pêche Maroc — service worker : fonctionne hors ligne avec les dernières données
const SHELL = 'pm-shell-v1', DATA = 'pm-data', TILES = 'pm-tiles';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA, TILES].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.hostname.endsWith('open-meteo.com')) e.respondWith(dataFirst(e.request));
  else if (u.hostname.endsWith('tile.openstreetmap.org')) e.respondWith(tileCache(e.request));
  else if (u.origin === location.origin || u.hostname === 'cdnjs.cloudflare.com') e.respondWith(netFirst(e.request));
});
async function netFirst(req) {
  const c = await caches.open(SHELL);
  try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }
  catch (e) { const m = await c.match(req) || await c.match('./index.html'); if (m) return m; throw e; }
}
async function notify(date) { (await self.clients.matchAll()).forEach(cl => cl.postMessage({offline: true, date})); }
async function dataFirst(req) {
  const c = await caches.open(DATA);
  try {
    const r = await fetch(req);
    if (r.ok) { const body = await r.clone().blob(); c.put(req, new Response(body, {headers: {'Content-Type': 'application/json', 'X-Cache-Date': new Date().toISOString()}})); }
    return r;
  } catch (e) {
    const m = await c.match(req);
    if (m) { notify(m.headers.get('X-Cache-Date')); return new Response(await m.blob(), {headers: {'Content-Type': 'application/json'}}); }
    throw e;
  }
}
async function tileCache(req) {
  const c = await caches.open(TILES), m = await c.match(req);
  if (m) return m;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); const ks = await c.keys(); if (ks.length > 1500) ks.slice(0, 200).forEach(k => c.delete(k)); }
    return r;
  } catch (e) { return new Response('', {status: 504}); }
}
