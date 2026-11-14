#!/usr/bin/env node
/* Uji tata letak (Chromium headless) untuk index + admin.

   Yang diperiksa di 7 ukuran layar (HP, tablet, laptop):
     1. Halaman tidak melebar ke samping dan tidak ada elemen yang melewati tepi layar (tiap tab).
     2. Bar pencarian Riwayat / Galeri / Event sejajar: HP & tablet kiri = kanan dan sama di ketiga tab; laptop kiri sama.
     3. Menu "Aksi" selalu terlihat utuh (tidak tertutup tab bar, tidak terpotong, tidak perlu digulir) di tiga posisi scroll.
     4. Bagian "Bandingkan periode" tergambar.
     5. Tidak ada error JavaScript.

   Jalankan lokal:   npm i --no-save playwright && npx playwright install chromium && node scripts/layout_test.js
   Env opsional:     SITE_ROOT (folder situs), PW_PATH (lokasi modul playwright)
   Permintaan ke luar (Google Fonts dll.) sengaja diblokir supaya hasilnya stabil. Keluar dengan kode 1 jika ada yang gagal. */
const http = require('http'), fs = require('fs'), path = require('path');
const {chromium} = require(process.env.PW_PATH || 'playwright');

const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};
const VPS = [[360, 740, 1], [390, 844, 1], [430, 932, 1], [768, 1024, 1], [1024, 768, 1], [1280, 800, 0], [1920, 1080, 0]];
const log = [], fails = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) fails.push(msg); };

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(f).pipe(res);
});

async function openPage(browser, base, url, [w, h, touch]) {
  const ctx = await browser.newContext({viewport: {width: w, height: h}, hasTouch: !!touch, isMobile: !!touch});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => !document.getElementById('splash'), null, {timeout: 20000}).catch(() => {});
  await page.waitForTimeout(500);
  return {ctx, page, errs};
}
const tabKeys = page => page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map(t => t.dataset.tab || t.textContent.trim()));
const clickTab = async (page, k) => {
  await page.evaluate(k => { const b = [...document.querySelectorAll('.tabbar .tab')].find(x => (x.dataset.tab || x.textContent.trim()) === k); if (b) b.click(); }, k);
  await page.waitForTimeout(1000);
};

// 1. tidak melebar / tidak ada elemen keluar layar
const overflowOf = page => page.evaluate(() => {
  const vw = document.documentElement.clientWidth, out = [];
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 40 && r.height > 8 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && cs.position !== 'fixed' && !e.closest('[hidden]') && !e.closest('.overlay:not(.open)'); };
  const desc = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
  for (const v of document.querySelectorAll('[id^="view-"],.view')) {
    if (!v.offsetWidth) continue;
    for (const e of v.querySelectorAll(':scope > *, :scope > * > *')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) out.push(`${desc(e)} [${Math.round(r.left)}..${Math.round(r.right)}] di layar ${vw}px`);
    }
  }
  return {over: document.documentElement.scrollWidth - vw, out: out.slice(0, 3)};
});

// 3. menu Aksi: terlihat utuh, tanpa gulir di dalam menu
const menuState = page => page.evaluate(() => {
  const m = document.getElementById('act-menu'), r = m.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  const tb = document.querySelector('.tabbar'), tr = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect() : null;
  const overlapDock = !!tr && !(r.right <= tr.left || r.left >= tr.right || r.bottom <= tr.top || r.top >= tr.bottom);
  const pts = [[r.left + 8, r.top + 8], [r.right - 8, r.top + 8], [r.left + 8, r.bottom - 8], [r.right - 8, r.bottom - 8], ...[...m.children].map(c => { const q = c.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; })];
  const visible = pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && m.contains(e); });
  return {inside: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh, overlapDock, visible, noScroll: m.scrollHeight <= m.clientHeight + 1, top: Math.round(r.top), bottom: Math.round(r.bottom)};
});

async function testViewport(browser, base, vp) {
  const [w, h] = vp, tag = `${w}x${h}`;
  // ---- index ----
  let {ctx, page, errs} = await openPage(browser, base, 'index.html', vp);
  const tabs = await tabKeys(page), bars = {};
  for (const k of tabs) {
    await clickTab(page, k);
    const r = await overflowOf(page);
    check(r.over <= 1, `index ${tag} tab ${k}: halaman melebar ${r.over}px`);
    r.out.forEach(o => check(false, `index ${tag} tab ${k}: elemen keluar layar -> ${o}`));
    const barId = {tl: 'tl-bar', gal: 'gallery-bar', ev: 'ev-bar'}[k];
    if (barId) bars[k] = await page.evaluate(id => { const e = document.getElementById(id).getBoundingClientRect(); return [Math.round(e.left), Math.round(innerWidth - e.right)]; }, barId);
  }
  // 2. bar pencarian sejajar
  if (Object.keys(bars).length === 3) {
    const {tl, gal, ev} = bars;
    if (w <= 1024) {
      check(Math.abs(tl[0] - tl[1]) <= 1, `index ${tag}: bar Riwayat tidak simetris (kiri ${tl[0]}, kanan ${tl[1]})`);
      const same = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1; // toleransi 1px (pembulatan setengah piksel)
      check(same(tl, gal) && same(tl, ev), `index ${tag}: bar Riwayat/Galeri/Event tidak sejajar (kiri,kanan: ${tl} / ${gal} / ${ev})`);
    } else check(Math.abs(tl[0] - ev[0]) <= 1, `index ${tag}: tepi kiri bar Riwayat (${tl[0]}) beda dari Event (${ev[0]})`);
  }
  // 3. menu Aksi di tab pertama (peta), 3 posisi scroll
  await clickTab(page, tabs[0]);
  if (await page.evaluate(() => !!document.getElementById('act-btn'))) {
    for (const block of ['start', 'center', 'end']) {
      await page.evaluate(b => document.getElementById('act-btn').scrollIntoView({block: b}), block);
      await page.waitForTimeout(400);
      const y0 = await page.evaluate(() => scrollY);
      await page.evaluate(() => document.getElementById('act-btn').click());
      await page.waitForTimeout(600);
      const s = await menuState(page), y1 = await page.evaluate(() => scrollY);
      check(s.inside && !s.overlapDock && s.visible, `index ${tag} menu Aksi (${block}): tidak terlihat utuh (dalam layar=${s.inside}, menimpa dock=${s.overlapDock}, terlihat=${s.visible}, menu ${s.top}..${s.bottom})`);
      check(s.noScroll, `index ${tag} menu Aksi (${block}): perlu digulir di dalam menu`);
      check(y0 === y1, `index ${tag} menu Aksi (${block}): halaman bergeser saat menu dibuka`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
  } else check(false, `index ${tag}: tombol Aksi tidak ditemukan`);
  // 4. bandingkan periode tergambar
  check(await page.evaluate(() => { const o = document.getElementById('cmp-out'); return !!o && o.innerHTML.trim().length > 0; }), `index ${tag}: bagian Bandingkan periode kosong / tidak ada`);
  // 5. error JS
  errs.forEach(e => check(false, `index ${tag}: error JS -> ${e}`));
  await ctx.close();

  // ---- admin ----
  ({ctx, page, errs} = await openPage(browser, base, 'admin.html', vp));
  for (const k of await tabKeys(page)) {
    await clickTab(page, k);
    const r = await overflowOf(page);
    check(r.over <= 1, `admin ${tag} tab ${k}: halaman melebar ${r.over}px`);
    r.out.forEach(o => check(false, `admin ${tag} tab ${k}: elemen keluar layar -> ${o}`));
  }
  errs.forEach(e => check(false, `admin ${tag}: error JS -> ${e}`));
  await ctx.close();
  log.push(`  selesai ${tag}`);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const queue = [...VPS];
  await Promise.all(Array.from({length: 3}, async () => { // 3 layar sekaligus
    for (let vp; (vp = queue.shift());) {
      try { await testViewport(browser, base, vp); }
      catch (e) { check(false, `${vp[0]}x${vp[1]}: uji berhenti karena ${e.message.split('\n')[0]}`); }
    }
  }));
  await browser.close(); server.close();
  console.log(log.join('\n'));
  console.log(`\n${checks - fails.length}/${checks} pemeriksaan lolos`);
  [...new Set(fails)].sort().forEach(f => console.log('GAGAL  ' + f));
  process.exit(fails.length ? 1 : 0);
})();
