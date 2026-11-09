/* Service worker: bikin situs bisa dibuka offline.
   - File aplikasi (HTML/CSS/JS/ikon/foto): tampilkan salinan tersimpan dulu, perbarui di belakang.
   - data.json: coba jaringan dulu (data terbaru), kalau offline pakai salinan terakhir.
   Naikkan VERSION kalau mau memaksa semua perangkat membuang cache lama. */
const VERSION = 'v1';
const CACHE = 'jkt48-' + VERSION;
const SHELL = ['./', './index.html', './shared.css', './shared.js', './app.css', './app.js',
  './manifest.webmanifest', './data.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('jkt48-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isData = url => url.pathname.endsWith('/data.json');
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  if (url.pathname.endsWith('/admin.html')) return; // halaman admin tidak ikut di-cache

  if (sameOrigin && isData(url)) { // jaringan dulu; kunci cache tanpa ?t=
    const key = new Request(url.origin + url.pathname);
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(r => r || Response.error())));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, {ignoreSearch: sameOrigin});
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
