/* sw.js — service worker untuk Idoling Diary (PWA).
   Strategi:
   - Shell (html/css/js/ikon): jaringan dulu, cadangan dari cache  -> kode baru langsung terpakai, tetap jalan offline
   - data.json: jaringan dulu (tanpa cache browser), cadangan dari cache -> data selalu segar, offline tetap tampil
   - photos/: cache dulu, diisi saat pertama dibuka (dibatasi jumlahnya)
   - Google Fonts: pakai cache dulu, diperbarui di belakang
   - admin.html & request non-GET: tidak disentuh
   Naikkan VERSION kalau daftar SHELL berubah. */
const VERSION = 'v6';
const SHELL_CACHE = 'shell-' + VERSION;
const PHOTO_CACHE = 'photos-' + VERSION;
const FONT_CACHE = 'fonts-' + VERSION;
const DATA_CACHE = 'data-' + VERSION;
const KEEP = [SHELL_CACHE, PHOTO_CACHE, FONT_CACHE, DATA_CACHE];
const MAX_PHOTOS = 400; // thumbnail + foto penuh; 150 hampir penuh (134 thumbnail saja) -> saling menggusur

const SHELL = [
  './', 'index.html',
  'assets/css/shared.css', 'assets/css/app.css', 'assets/css/liquid.css', 'assets/js/shared.js', 'assets/js/app.js', 'assets/js/liquid.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // satu file gagal tidak boleh menggagalkan seluruh instalasi
    await Promise.allSettled(SHELL.map(u => c.add(new Request(u, {cache: 'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => !KEEP.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, key) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req, {cache: 'no-store'});
    if (res && res.ok) c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req, {ignoreSearch: !key});
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) { c.put(req, res.clone()); if (max) trim(cacheName, max); }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin !== location.origin) return;

  const path = url.pathname;
  if (path.endsWith('/admin.html')) return; // halaman admin selalu langsung ke jaringan

  // data.json: kunci cache tetap walau URL membawa ?t=... (anti cache browser)
  if (path.endsWith('/data.json')) {
    const key = new URL('data.json', self.registration.scope).href;
    e.respondWith(networkFirst(req, DATA_CACHE, key));
    return;
  }

  // foto & thumbnail
  if (path.includes('/photos/')) {
    e.respondWith(cacheFirst(req, PHOTO_CACHE, MAX_PHOTOS));
    return;
  }

  // buka halaman: jaringan dulu, offline jatuh ke index.html tersimpan
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await networkFirst(req, SHELL_CACHE); }
      catch (err) {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // css / js / ikon / manifest
  e.respondWith(networkFirst(req, SHELL_CACHE));
});
