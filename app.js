/* app.js — perilaku "seperti app" untuk index.html (dimuat setelah shared.js).
   Butuh dari halaman: window.refreshData() (opsional, dipakai tarik-untuk-muat-ulang). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mqMobile = matchMedia('(max-width:768px)');
  const mqDesk = matchMedia('(min-width:1280px)');
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
      setTimeout(() => el.classList.remove('back', 'spin'), 540);
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

  /* ---------- ganti tab: geser + pudar ala iOS, pil cair, dan geser mengikuti jari ----------
     Urutannya sengaja begini supaya mulus (dan tidak "kadang ada kadang tidak"):
       1. tab lama dijadikan "hantu" (fixed, di posisi persis seperti tadi) supaya bisa memudar keluar,
       2. tab baru dibuka + digambar + diukur SEKARANG (kerja berat selesai dulu),
       3. baru setelah itu semua animasi dimulai pada frame yang sama (hanya transform & opacity). */
  const VIEW_IDS = ['main', 'gal', 'tl', 'ev'];
  const EASE = 'cubic-bezier(.32,.72,0,1)';
  const IN_MS = 820, OUT_MS = 460;
  const viewOf = k => $('view-' + k);
  let run = null; // transisi yang sedang berjalan: {anims, done}

  const lite = () => mqMobile.matches; // HP: layer lebih sedikit supaya tetap 60fps
  const travel = () => mqDesk.matches ? 28 : lite() ? 34 : Math.round(Math.min(104, Math.max(48, innerWidth * 0.18)));
  const shift = d => mqDesk.matches ? `translate3d(0,${d}px,0)` : `translate3d(${d}px,0,0)`;

  function settle() { // selesaikan seketika transisi sebelumnya (mis. tab diketuk beruntun)
    if (!run) return;
    const r = run; run = null;
    r.anims.forEach(a => { try { a.cancel(); } catch (e) {} });
    r.done();
  }

  // item yang sedang terlihat di layar masuk bertahap (naik pelan), bukan muncul tiba-tiba
  const CASCADE = {
    main: '#story, #last .last-c, #stats .stat, #cover',
    tl: '#tl-bar, .tl-yh, .tl-mh, .tl-i',
    gal: '.gk-bar, #gallery-bar, #gallery .gi',
    ev: '#view-ev > h2, #lot .lot-cards .stat, #lot .sec2, #lot .lot-r, #ev-up, #ev-cats, #ev-bar'
  };
  function cascade(view, base = 120) {
    const sel = CASCADE[view.id.replace('view-', '')];
    if (!sel || calm()) return [];
    const els = [];
    for (const el of view.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
      els.push(el);
      if (els.length >= (lite() ? 5 : 9)) break;
    }
    const base0 = els.map(el => { const t = getComputedStyle(el).transform; return t && t !== 'none' ? ' ' + t : ''; }); // jaga kemiringan polaroid
    return els.map((el, i) => el.animate([{opacity: 0, transform: 'translate3d(0,22px,0)' + base0[i]}, {opacity: 1, transform: base0[i] ? base0[i].trim() : 'none'}],
      {duration: lite() ? 760 : 900, delay: base + i * (lite() ? 60 : 75), easing: EASE, fill: 'backwards'}));
  }

  // playEnter (dipakai shared.js saat data pertama tampil) memakai sistem yang sama
  if (typeof playEnter === 'function') {
    const baseEnter = playEnter;
    playEnter = function (el) {
      baseEnter(el);
      const anims = el && /^view-/.test(el.id) ? cascade(el) : [];
      if (run) run.anims.push(...anims);
      return anims;
    };
  }

  function makeGhost(prev) { // tab lama tetap terlihat persis di tempatnya, lepas dari alur halaman
    const r = prev.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const top = Math.max(0, r.top);
    prev.classList.add('ghost');
    prev.style.cssText = `top:${top}px;left:${r.left}px;width:${r.width}px;height:${Math.max(0, innerHeight - top)}px`;
    return {el: prev, off: Math.max(0, -r.top)};
  }

  function switchTab(name, drag) {
    const list = tabs(), from = list.findIndex(t => t.classList.contains('on')), to = list.findIndex(t => t.dataset.tab === name);
    if (to < 0 || to === from) return;
    settle();
    const dir = to > from ? 1 : -1, still = calm();
    const prev = viewOf(list[from].dataset.tab), next = viewOf(name);
    const dragO = drag && drag.opacity != null ? drag.opacity : 1;

    list.forEach((t, i) => { t.classList.toggle('on', i === to); t.setAttribute('aria-selected', i === to); });
    moveInd(); // pil meluncur (mulai dari posisi sekarang, jadi tetap mulus walau ketukan beruntun)

    const ghost = !still && !lite() && prev && !prev.hidden ? makeGhost(prev) : null;
    if (!ghost && prev) { prev.style.transform = ''; prev.style.opacity = ''; }
    VIEW_IDS.forEach(k => { viewOf(k).hidden = k !== name; });
    flushLazy('view-' + name); // kalau masih usang, gambar sekarang (sebelum animasi dimulai)

    const hd = document.querySelector('.head'), top = hd.getBoundingClientRect().bottom + scrollY - 8; // isi baru mulai dari bawah header
    if (scrollY > top) scrollTo({top, behavior: 'instant'});
    syncLayout();
    if (name === 'main' && typeof centerChart === 'function') centerChart(); // ukur peta hanya saat tab peta dibuka
    syncFbar();
    if (ghost) ghost.el.scrollTop = ghost.off;

    const anims = [];
    const clean = () => {
      if (ghost) { ghost.el.classList.remove('ghost'); ghost.el.style.cssText = ''; }
      anims.forEach(a => { try { a.cancel(); } catch (e) {} }); // fill:'forwards' tidak boleh tersisa di tab yang nanti dibuka lagi
    };
    const r = {anims, done: clean};
    run = r;
    if (still) { playEnter(next); settle(); return; }

    void next.offsetHeight; // paksa tata letak selesai sekarang, bukan di tengah animasi
    const off = dir * travel();
    anims.push(next.animate([{opacity: 0, transform: shift(off)}, {opacity: 1, transform: 'none'}],
      {duration: IN_MS, delay: 80, easing: EASE, fill: 'backwards'}));
    if (ghost) {
      const ga = ghost.el.animate([{opacity: dragO, transform: 'none'}, {opacity: 0, transform: shift(-off * 0.6)}],
        {duration: OUT_MS, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards'});
      ga.finished.then(() => { if (run === r) { ghost.el.classList.remove('ghost'); ghost.el.style.cssText = ''; ga.cancel(); } }, () => {});
      anims.push(ga);
    }
    playEnter(next); // .enter + reveal + item bertahap (masuk ke run.anims lewat override di atas)
    Promise.allSettled(anims.map(a => a.finished)).then(() => { if (run === r) { run = null; r.done(); } });
  }
  window.switchTab = switchTab;
  document.querySelectorAll('.tabbar .tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  /* geser kiri/kanan (layar sentuh): isi mengikuti jari dengan sedikit tahanan, pil ikut meluncur.
     Dilepas melewati ambang (jarak atau kecepatan) -> pindah tab, kalau tidak -> kembali pelan. */
  (() => {
    let st = null;
    const skip = el => el.closest('#seating-wrapper, #cal, #zoomctl, select, input, textarea, .overlay, #fbar, .ev-d, .actions-m, .tabbar, #appbar');
    const reset = (v, fromPx, fromO) => {
      v.style.transform = ''; v.style.opacity = '';
      if (calm() || (!fromPx && fromO === 1)) return;
      v.animate([{transform: `translate3d(${fromPx}px,0,0)`, opacity: fromO}, {transform: 'none', opacity: 1}], {duration: 620, easing: EASE});
    };
    document.addEventListener('touchstart', e => {
      st = null;
      if (mqDesk.matches || e.touches.length !== 1 || skip(e.target) || document.querySelector('.overlay.open')) return;
      const t = e.touches[0];
      st = {x0: t.clientX, y0: t.clientY, lock: '', px: t.clientX, pt: performance.now(), v: 0, dx: 0};
    }, {passive: true});
    document.addEventListener('touchmove', e => {
      if (!st) return;
      if (e.touches.length !== 1) { if (st.lock) { reset(st.view, st.shown, st.opa); moveInd(); } st = null; return; }
      const t = e.touches[0], dx = t.clientX - st.x0, dy = t.clientY - st.y0;
      if (!st.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.6 && e.cancelable) { // jelas horizontal: kunci
          settle();
          const list = tabs(), i = list.findIndex(b => b.classList.contains('on'));
          if (i < 0) { st = null; return; }
          Object.assign(st, {lock: 'x', list, i, view: viewOf(list[i].dataset.tab), shown: 0, opa: 1});
        } else { st = null; return; } // vertikal / ragu: biarkan halaman menggulir
      }
      e.preventDefault();
      const now = performance.now();
      st.v = (t.clientX - st.px) / Math.max(1, now - st.pt); st.px = t.clientX; st.pt = now;
      st.dx = dx;
      const j = st.i + (dx < 0 ? 1 : -1), has = j >= 0 && j < st.list.length;
      const px = dx * (has ? 0.5 : 0.2);
      st.shown = px; st.opa = 1 - Math.min(0.55, Math.abs(px) / innerWidth * 1.2);
      st.view.style.transform = `translate3d(${px}px,0,0)`;
      st.view.style.opacity = st.opa.toFixed(3);
      if (has) indFollow(st.list[st.i], st.list[j], Math.abs(dx) / (innerWidth * 0.42));
    }, {passive: false});
    const end = () => {
      const s = st; st = null;
      if (!s || s.lock !== 'x') return;
      const j = s.i + (s.dx < 0 ? 1 : -1), has = j >= 0 && j < s.list.length;
      const go = has && (Math.abs(s.dx) > innerWidth * 0.22 || (Math.abs(s.v) > 0.5 && Math.abs(s.dx) > 30 && Math.sign(s.v) === Math.sign(s.dx)));
      if (go) switchTab(s.list[j].dataset.tab, {px: s.shown, opacity: s.opa}); // transform inline sengaja dibiarkan: dipakai untuk mengukur posisi awal tab lama
      else { reset(s.view, s.shown, s.opa); moveInd(); }
    };
    document.addEventListener('touchend', end, {passive: true});
    document.addEventListener('touchcancel', end, {passive: true});
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

  /* ---------- foto: kartu "terakhir nonton" memudar masuk + tampilan saat gagal dimuat ---------- */
  (() => {
    const box = im => im.closest('.last-ph,.gi-ph,.hi-ph');
    addEventListener('load', e => {
      const im = e.target; if (!im || im.tagName !== 'IMG') return;
      const b = box(im); if (!b) return;
      b.classList.remove('bad');
      if (b.classList.contains('last-ph')) { im.classList.add('ld'); b.classList.add('ld'); } // galeri & modal sudah ditangani shared.js
    }, true);
    addEventListener('error', e => {
      const im = e.target; if (!im || im.tagName !== 'IMG') return;
      const b = box(im); if (!b) return;
      if (im.dataset.full && im.getAttribute('src') !== im.dataset.full) return; // thumbnail gagal: foto penuh masih dicoba
      b.classList.add('bad'); b.classList.remove('ld');
    }, true);
  })();

  /* ---------- getar halus saat ketuk kursi / pindah tab (Android; iOS Safari tidak mendukung API ini, jadi diabaikan) ---------- */
  (() => {
    if (typeof navigator.vibrate !== 'function') return;
    let last = 0;
    const buzz = ms => {
      const t = performance.now();
      if (calm() || t - last < 60) return;
      last = t;
      try { navigator.vibrate(ms); } catch (e) { /* diabaikan */ }
    };
    document.addEventListener('click', e => {
      if (e.target.closest('.seat')) buzz(10);
      else if (e.target.closest('.tabbar .tab')) buzz(8);
    }, true);
  })();

  /* ---------- PWA: service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  addEventListener('offline', () => say('Offline: menampilkan data tersimpan'));
  addEventListener('online', () => say('Kembali online'));
})();
