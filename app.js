/* app.js — perilaku "seperti app" untuk index.html (dimuat setelah shared.js).
   Butuh dari halaman: window.refreshData() (opsional, dipakai tarik-untuk-muat-ulang). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mqMobile = matchMedia('(max-width:768px)');
  const mqDesk = matchMedia('(min-width:1100px)');
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tabs = () => [...document.querySelectorAll('.tabbar .tab')].filter(b => !b.hidden);

  /* ---------- toast kecil ---------- */
  const toast = document.body.appendChild(Object.assign(document.createElement('div'), {id: 'toast', role: 'status'}));
  let toastT = 0;
  const say = msg => { toast.textContent = msg; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 2400); };

  /* ---------- header kecil (HP): muncul saat judul besar sudah lewat ---------- */
  const bar = document.body.appendChild(Object.assign(document.createElement('div'), {id: 'appbar'}));
  bar.innerHTML = `<b></b><span>Total <em id="ab-total">0</em> show</span>`;
  bar.querySelector('b').textContent = (document.querySelector('.head h1') || document.querySelector('h1'))?.textContent || document.title;
  const total = $('total');
  const syncTotal = () => { $('ab-total').textContent = total ? total.textContent : '0'; };
  if (total) { syncTotal(); new MutationObserver(syncTotal).observe(total, {childList: true, characterData: true, subtree: true}); }
  const h1 = document.querySelector('.head h1');
  let raf = 0;
  function updBar() {
    raf = 0;
    if (!mqMobile.matches || !h1) { document.documentElement.style.removeProperty('--p'); return; }
    const hBar = bar.offsetHeight || 56, x = h1.getBoundingClientRect().bottom;
    const p = Math.max(0, Math.min(1, (hBar + 28 - x) / 28)); // 0 = judul besar terlihat, 1 = sudah lewat
    bar.style.setProperty('--p', p.toFixed(3));
  }
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(updBar); }, {passive: true});
  addEventListener('resize', updBar);
  updBar();

  /* ---------- tab: label pendek (HP) + hint keyboard & merek (laptop) ---------- */
  const SHORT = {main: 'Peta', tl: 'Riwayat', gal: 'Galeri', ev: 'Tiket'};
  document.querySelectorAll('.tabbar .tab').forEach(t => { if (!t.dataset.short) t.dataset.short = SHORT[t.dataset.tab] || t.textContent.trim(); });
  const tb = document.querySelector('.tabbar');
  if (tb) {
    const ico = document.querySelector('link[rel=apple-touch-icon]')?.href || 'icons/icon-192.png';
    tb.insertAdjacentHTML('afterbegin', `<div class="sb-brand" aria-hidden="true"><img src="${ico}" alt=""><b>Theater<br>Stats</b></div>`);
    tb.insertAdjacentHTML('beforeend', `<div class="sb-keys" aria-hidden="true"><div><kbd>←</kbd><kbd>→</kbd>ganti tab</div><div><kbd>/</kbd>cari riwayat</div><div><kbd>Esc</kbd>tutup</div></div>`);
  }

  /* ---------- menu "Aksi" (Simpan PNG, Putar ulang, Wrapped) ---------- */
  (() => {
    const lg = $('legend'), items = ['png-btn', 'rp-btn', 'wrap-btn'].map($);
    if (!lg || items.some(x => !x)) return;
    const box = document.createElement('div');
    box.className = 'actions';
    box.innerHTML = '<button type="button" class="btn-s actions-t" id="act-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="act-menu">Aksi</button><div class="actions-m" id="act-menu" role="menu"></div>';
    const menu = box.querySelector('#act-menu');
    items.forEach(b => { b.setAttribute('role', 'menuitem'); menu.appendChild(b); }); // node dipindah, id & handler tetap
    lg.appendChild(box);
    const t = box.querySelector('#act-btn');
    const set = on => { box.classList.toggle('open', on); t.setAttribute('aria-expanded', on); };
    t.addEventListener('click', e => { e.stopPropagation(); set(!box.classList.contains('open')); });
    menu.addEventListener('click', () => setTimeout(() => set(false), 0));
    document.addEventListener('click', e => { if (!box.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) { set(false); t.focus(); } });
    window.closeActions = () => set(false);
  })();

  /* ---------- tarik ke bawah untuk memuat ulang (HP) ---------- */
  (() => {
    const el = document.body.appendChild(document.createElement('div'));
    el.id = 'ptr';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';
    const root = document.documentElement, LIM = 64;
    let y0 = 0, x0 = 0, pull = 0, armed = false, decided = false, busy = false;
    const blocked = t => !!t.closest('.overlay.open, select, input, textarea, .actions-m');
    const paint = d => {
      root.style.setProperty('--ptr', d + 'px');
      root.style.setProperty('--ptr-o', Math.min(1, d / 40).toFixed(2));
      root.style.setProperty('--ptr-r', (d / LIM * 270) + 'deg');
    };
    const reset = () => {
      el.classList.add('back'); pull = 0; paint(0);
      setTimeout(() => el.classList.remove('back', 'spin'), 320);
    };
    document.addEventListener('touchstart', e => {
      armed = mqMobile.matches && !busy && scrollY <= 0 && e.touches.length === 1 && !blocked(e.target);
      decided = false; pull = 0; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
      if (armed) el.classList.remove('back', 'spin');
    }, {passive: true});
    document.addEventListener('touchmove', e => {
      if (!armed) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!decided) {
        if (Math.abs(dx) > Math.abs(dy)) { armed = false; return; } // geser ke samping = ganti tab, bukan tarik
        if (dy < 8) return;
        decided = true;
      }
      if (dy <= 0 || scrollY > 0 || e.touches.length > 1) { armed = false; reset(); return; }
      pull = Math.min(dy * 0.5, LIM + 20);
      if (e.cancelable) e.preventDefault();
      paint(pull);
    }, {passive: false});
    const end = async () => {
      if (!armed) return;
      armed = false;
      if (pull < LIM) return reset();
      busy = true; el.classList.add('spin'); paint(LIM);
      const t0 = Date.now();
      try {
        if (typeof window.refreshData === 'function') await window.refreshData();
        say('Data diperbarui');
      } catch (err) { say(navigator.onLine === false ? 'Sedang offline, menampilkan salinan tersimpan' : 'Gagal memuat ulang data'); }
      const wait = 600 - (Date.now() - t0); // putaran terlihat minimal sebentar
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      busy = false; reset();
    };
    document.addEventListener('touchend', end, {passive: true});
    document.addEventListener('touchcancel', () => { if (armed) { armed = false; reset(); } }, {passive: true});
  })();

  /* ---------- transisi bersama: kartu Riwayat <-> detail kursi (HP) ---------- */
  (() => {
    if (!document.startViewTransition) return;
    const ov = $('seat-modal'), modal = ov?.querySelector('.modal');
    if (!modal || typeof openSeat !== 'function') return;
    let src = null;
    const usable = () => mqMobile.matches && !calm() && src && src.isConnected && !$('view-tl').hidden;
    document.addEventListener('click', e => { // fase capture: jalan sebelum handler kartu memanggil openSeat
      if (e.target.closest('#seat-modal')) return;
      const c = e.target.closest('#timeline .tl-i');
      if (c) src = c; else if (e.target.closest('[data-seat]')) src = null;
    }, true);
    // animasi masuk bawaan (sheet-in / hi-in) dimatikan selama modal terbuka lewat transisi bersama,
    // kalau tidak, begitu transisi selesai animasinya mulai lagi dan terlihat dobel
    new MutationObserver(() => { if (!ov.classList.contains('open')) ov.removeAttribute('data-vt'); }).observe(ov, {attributes: true, attributeFilter: ['class']});
    const run = (fn, done) => {
      document.documentElement.classList.add('vt-run');
      ov.setAttribute('data-vt', '');
      ov.classList.add('vt');
      const t = document.startViewTransition(fn);
      t.finished.finally(() => { document.documentElement.classList.remove('vt-run'); ov.classList.remove('vt'); done && done(); });
    };
    const baseOpen = openSeat;
    openSeat = function (code) {
      if (!usable() || ov.classList.contains('open')) return baseOpen(code);
      const card = src;
      card.style.viewTransitionName = 'seat-card';
      run(() => { card.style.viewTransitionName = ''; modal.style.viewTransitionName = 'seat-card'; baseOpen(code); },
        () => { modal.style.viewTransitionName = ''; });
    };
    window.seatVtClose = el => { // dipanggil dari closeEl di shared.js
      if (!usable() || modal.style.transform) return false; // sedang ditarik (gagang sheet): pakai animasi biasa
      const card = src;
      modal.style.viewTransitionName = 'seat-card';
      run(() => {
        modal.style.viewTransitionName = ''; card.style.viewTransitionName = 'seat-card';
        el.classList.remove('open', 'closing');
        lastFocus['seat-modal']?.focus?.({preventScroll: true});
      }, () => { card.style.viewTransitionName = ''; });
      return true;
    };
  })();

  /* ---------- laptop: dua kolom + panel kursi di kanan ---------- */
  const view = $('view-main'), seatOv = $('seat-modal');
  let split = null, left = null, side = null, saved = [];
  const MAP_IDS = new Set(['filters', 'zoomctl', 'seating-wrapper', 'legend']);
  function toSplit() {
    if (split || !view) return;
    saved = [...view.children];
    split = Object.assign(document.createElement('div'), {id: 'split'});
    left = Object.assign(document.createElement('div'), {className: 'col-map'});
    side = Object.assign(document.createElement('aside'), {className: 'col-side'});
    saved.forEach(k => (MAP_IDS.has(k.id) ? left : side).appendChild(k));
    split.append(left, side);
    view.prepend(split);
  }
  function toFlat() {
    if (!split) return;
    saved.forEach(k => view.appendChild(k));
    split.remove(); split = left = side = null;
  }
  function dock(on) {
    const m = seatOv.querySelector('.modal');
    if (on === seatOv.classList.contains('docked')) return;
    seatOv.classList.remove('open', 'closing');
    if (on) { side.prepend(seatOv); seatOv.classList.add('docked'); m.setAttribute('aria-modal', 'false'); m.setAttribute('role', 'region'); }
    else { document.body.appendChild(seatOv); seatOv.classList.remove('docked'); m.setAttribute('aria-modal', 'true'); m.setAttribute('role', 'dialog'); }
  }
  function syncLayout() {
    if (!view || !seatOv) return;
    if (mqDesk.matches) { toSplit(); dock(!view.hidden); } // panel hanya menempel saat tab Peta aktif; tab lain tetap pakai modal
    else { dock(false); toFlat(); }
    requestAnimationFrame(() => { if (typeof centerChart === 'function') centerChart(); if (typeof moveInd === 'function') moveInd(true); });
  }
  mqDesk.addEventListener('change', syncLayout);
  document.querySelector('.tabbar')?.addEventListener('click', () => setTimeout(syncLayout, 0));
  syncLayout();
  mqMobile.addEventListener('change', () => { updBar(); if (typeof moveInd === 'function') moveInd(true); });

  // panel kursi: bawa ke layar kalau halaman sedang tergulung jauh
  if (typeof openSeat === 'function') {
    const prev = openSeat;
    openSeat = function (code) {
      prev(code);
      if (seatOv.classList.contains('docked')) seatOv.scrollIntoView({block: 'nearest', behavior: calm() ? 'auto' : 'smooth'});
    };
  }

  /* ---------- keyboard: ← → ganti tab, / cari, Esc tutup ---------- */
  const typing = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const dialogOpen = () => !!document.querySelector('.overlay.open:not(.docked)');
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      const t = e.target;
      if (t && t.id === 'tl-q' && t.value) { t.value = ''; t.dispatchEvent(new Event('input', {bubbles: true})); }
      else if (typing(t)) t.blur();
      return; // modal / panel / lightbox ditutup oleh handler di shared.js
    }
    if (typing(e.target) || dialogOpen()) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (e.target === $('seating-wrapper')) return; // peta yang sedang fokus: panah dipakai untuk menggeser
      const list = tabs(), i = list.findIndex(b => b.classList.contains('on')), n = list[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (n) { e.preventDefault(); n.click(); n.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
    } else if (e.key === '/') {
      const q = $('tl-q'), tlTab = document.querySelector('.tab[data-tab="tl"]');
      if (!q || !tlTab) return;
      e.preventDefault();
      if (!tlTab.classList.contains('on')) tlTab.click();
      requestAnimationFrame(() => { q.focus(); q.select(); });
    }
  });

  /* ---------- ganti tab: arah geser isi + pil "cair" ---------- */
  document.addEventListener('click', e => { // capture: jalan sebelum handler tab di index.html mengganti tab
    const b = e.target.closest('.tabbar .tab');
    if (!b) return;
    const list = tabs(), from = list.findIndex(t => t.classList.contains('on')), to = list.indexOf(b);
    if (from < 0 || to === from) return;
    const dir = to > from ? 1 : -1;
    const root = document.documentElement.style, still = calm();
    // HP/tablet: isi meluncur ke samping. Laptop (tab di sidebar kiri, tersusun ke bawah): isi naik/turun mengikuti arah tab.
    root.setProperty('--tabx', mqDesk.matches || still ? '0px' : dir * 26 + 'px');
    root.setProperty('--taby', mqDesk.matches && !still ? dir * 20 + 'px' : '0px');
  }, true);
  document.addEventListener('click', e => { // tandai "sedang ganti tab" sampai handler tab selesai
    if (!e.target.closest('.tabbar .tab')) return;
    switching = true; setTimeout(() => { switching = false; }, 60);
  }, true);

  // Saat ganti tab cukup isinya yang meluncur. Animasi item bertingkat (.enter) hanya untuk pemuatan pertama,
  // kalau tidak, geseran + kaskade item jalan bersamaan dan terasa kasar.
  let switching = false;
  if (typeof playEnter === 'function') {
    const baseEnter = playEnter;
    playEnter = function (el) {
      if (switching && el && /^view-/.test(el.id)) { if (typeof watchReveal === 'function') watchReveal(el); return; }
      return baseEnter(el);
    };
  }

  // Pil tab "cair": tepi depan melaju duluan, tepi belakang menyusul (memanjang lalu memendek), tanpa memantul
  (() => {
    const lead = k => 1 - Math.pow(1 - k, 4);
    const trail = k => 1 - Math.pow(1 - Math.max(0, (k - 0.1) / 0.9), 3);
    const axis = (p0, s0, p1, s1, k) => {
      const fwd = p1 >= p0, ea = fwd ? trail(k) : lead(k), eb = fwd ? lead(k) : trail(k);
      const a = p0 + (p1 - p0) * ea, b = (p0 + s0) + ((p1 + s1) - (p0 + s0)) * eb;
      return [a, Math.max(b - a, 0)];
    };
    window.moveInd = function (instant) {
      if (typeof setStick === 'function') setStick();
      const bar = document.querySelector('.tabbar'), on = bar && bar.querySelector('.tab.on');
      if (!on) return;
      let ind = bar.querySelector('.tab-ind');
      if (!ind) { ind = document.createElement('i'); ind.className = 'tab-ind'; bar.prepend(ind); instant = true; }
      cancelAnimationFrame(ind._raf);
      const to = {x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight};
      const paint = r => { ind.style.width = r.w + 'px'; ind.style.height = r.h + 'px'; ind.style.transform = `translate3d(${r.x}px,${r.y}px,0)`; };
      const from = ind._cur || to;
      if (instant || calm() || (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h)) { ind._cur = to; paint(to); return; }
      const f = {...from}, t0 = performance.now(), D = 460;
      const step = now => {
        const k = Math.min(1, (now - t0) / D);
        const [x, w] = axis(f.x, f.w, to.x, to.w, k), [y, h] = axis(f.y, f.h, to.y, to.h, k);
        ind._cur = k < 1 ? {x, y, w, h} : to;
        paint(ind._cur);
        if (k < 1) ind._raf = requestAnimationFrame(step);
      };
      ind._raf = requestAnimationFrame(step);
    };
  })();

  /* ---------- "Sorot yang belum" / "Tampilkan semua": kursi berubah bergelombang, bukan tiba-tiba ---------- */
  (() => {
    if (typeof renderChart !== 'function' || !$('cover') || !$('chart')) return;
    const read = el => { const cs = getComputedStyle(el); return {o: cs.opacity, bg: cs.backgroundColor, c: cs.color, bd: cs.borderTopColor, sh: cs.boxShadow}; };
    let pending = null;
    document.addEventListener('click', e => { // capture: rekam tampilan lama sebelum peta digambar ulang
      if (calm() || !e.target.closest('#cov-btn')) return;
      pending = new Map();
      $('chart').querySelectorAll('.seat').forEach(el => pending.set(el.dataset.seat, read(el)));
    }, true);
    const baseRender = renderChart;
    renderChart = function () {
      const old = pending; pending = null;
      if (!old) return baseRender();
      const ch = $('chart');
      ch.classList.add('morph'); // matikan transisi CSS kursi supaya nilai akhir bisa dibaca
      baseRender();
      const els = [...ch.querySelectorAll('.seat')], anims = [];
      const now = els.map(read); // baca semua dulu, animasikan sesudahnya
      els.forEach((el, i) => {
        const o = old.get(el.dataset.seat), n = now[i];
        if (!o || (o.o === n.o && o.bg === n.bg && o.c === n.c && o.bd === n.bd && o.sh === n.sh)) return;
        const row = 'ABCDEFGHIJ'.indexOf(el.dataset.seat[0]), num = parseInt(el.dataset.seat.slice(1)) || 0;
        const from = {opacity: o.o, backgroundColor: o.bg, color: o.c, borderColor: o.bd, boxShadow: o.sh};
        const to = {opacity: n.o, backgroundColor: n.bg, color: n.c, borderColor: n.bd, boxShadow: n.sh};
        const glow = el.classList.contains('want'); // kursi yang disorot tumbuh pelan dari sedikit lebih kecil
        const kf = [{...from, transform: glow ? 'scale(.9)' : 'scale(1)'}, {...to, transform: 'scale(1)'}];
        anims.push(el.animate(kf, {duration: 560, delay: Math.min(480, row * 32 + (num % 9) * 5),
          easing: 'cubic-bezier(.32,.72,0,1)', fill: 'backwards'}));
      });
      const done = () => ch.classList.remove('morph');
      if (!anims.length) return done();
      Promise.allSettled(anims.map(a => a.finished)).then(done);
      setTimeout(done, 1600); // jaga-jaga kalau animasi dibatalkan
    };
  })();

  /* ---------- PWA: service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  addEventListener('offline', () => say('Offline: menampilkan data tersimpan'));
  addEventListener('online', () => say('Kembali online'));
})();
