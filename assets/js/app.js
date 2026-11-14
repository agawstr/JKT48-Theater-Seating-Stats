/* app.js — perilaku "seperti app" untuk index.html (dimuat setelah shared.js).
   Butuh dari halaman: window.refreshData() (opsional, dipakai tarik-untuk-muat-ulang). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mqMobile = matchMedia('(max-width:768px)');
  const mqDesk = matchMedia('(min-width:1280px)');
  const mqTouch = matchMedia('(hover:none) and (pointer:coarse)'); // iPad/tablet: lebarnya > 768px tapi tetap butuh mode ringan
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
    // awal zona muncul tidak boleh lebih tinggi dari posisi judul saat belum di-scroll (judul 1 baris jauh lebih pendek dari 2 baris)
    const start = Math.min(hBar + 28, x + scrollY - 2);
    const p = Math.max(0, Math.min(1, (start - x) / 28)); // 0 = judul besar terlihat, 1 = sudah lewat
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
    tb.insertAdjacentHTML('afterbegin', `<div class="sb-brand" aria-hidden="true"><img src="${ico}" alt=""><b>Idoling<br>Diary</b></div>`);
    tb.insertAdjacentHTML('beforeend', `<div class="sb-keys" aria-hidden="true"><div><kbd>←</kbd><kbd>→</kbd>ganti tab</div><div><kbd>/</kbd>cari riwayat</div><div><kbd>Esc</kbd>tutup</div></div>`);
    if (typeof moveInd === 'function') { moveInd(true); requestAnimationFrame(() => moveInd(true)); } // logo menggeser tab ke bawah: hitung ulang posisi pil
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
    // Menu dibuka sebagai lapisan 'fixed' langsung di <body> (bukan di dalam wadah peta), jadi tidak bisa terpotong oleh
    // overflow wadah dan posisinya dihitung terhadap layar. Menu SELALU muat utuh tanpa scroll: pilih sisi (bawah/atas tombol)
    // yang lega di luar tab bar melayang dan header kecil; kalau dua sisi sama-sama sempit, rapatkan item; kalau masih kurang,
    // geser menu supaya utuh di dalam area kosong (boleh menutupi tombol). Gulir di dalam menu hanya jalan terakhir.
    const place = () => {
      const vv = window.visualViewport, vh = vv ? vv.height + vv.offsetTop : innerHeight, vw = innerWidth, gap = 8;
      menu.classList.remove('up', 'tight'); menu.style.maxHeight = '';
      let lo = gap, hi = vh - gap;
      const tb = document.querySelector('.tabbar'), tr = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect() : null;
      if (tr && tr.width > 0 && tr.top > vh / 2) hi = Math.min(hi, tr.top - gap);                 // tab bar bawah
      const ab = $('appbar'), ar = ab && getComputedStyle(ab).position === 'fixed' ? ab.getBoundingClientRect() : null;
      if (ar && ar.bottom > 0 && ar.bottom < vh / 3) lo = Math.max(lo, ar.bottom + gap);          // header kecil yang sedang tampil
      const b = t.getBoundingClientRect();
      let mh = menu.offsetHeight, below = hi - b.bottom - gap, above = b.top - lo - gap;
      if (mh > Math.max(below, above)) { menu.classList.add('tight'); mh = menu.offsetHeight; } // item dirapatkan dulu
      const up = mh > below && above > below;
      menu.classList.toggle('up', up);
      let top = up ? b.top - gap - mh : b.bottom + gap;
      if (top < lo || top + mh > hi) top = Math.min(Math.max(top, lo), Math.max(lo, hi - mh));    // tetap utuh di area kosong
      if (mh > hi - lo) menu.style.maxHeight = Math.max(96, hi - lo) + 'px';                        // pengaman terakhir
      const mw = menu.offsetWidth;
      menu.style.top = Math.round(top) + 'px';
      menu.style.left = Math.round(Math.min(Math.max(b.right - mw, gap), Math.max(gap, vw - mw - gap))) + 'px';
      menu.style.transformOrigin = (up ? 'bottom' : 'top') + ' right';
    };
    let raf = 0;
    const onMove = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (box.classList.contains('open')) place(); }); };
    const set = on => {
      if (on === box.classList.contains('open')) return;
      box.classList.toggle('open', on); t.setAttribute('aria-expanded', on);
      if (on) {
        document.body.appendChild(menu); menu.classList.add('on'); place();
        addEventListener('scroll', onMove, {passive: true, capture: true}); addEventListener('resize', onMove);
        if (window.visualViewport) visualViewport.addEventListener('resize', onMove);
      } else {
        menu.classList.remove('on', 'up', 'tight'); box.appendChild(menu);
        removeEventListener('scroll', onMove, {capture: true}); removeEventListener('resize', onMove);
        if (window.visualViewport) visualViewport.removeEventListener('resize', onMove);
      }
    };
    t.addEventListener('click', e => { e.stopPropagation(); set(!box.classList.contains('open')); });
    menu.addEventListener('click', () => setTimeout(() => set(false), 0));
    document.addEventListener('click', e => { if (!box.contains(e.target) && !menu.contains(e.target)) set(false); });
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
  function syncLayout(noMeasure) { // noMeasure === true: dipanggil dari switchTab, jangan ukur ulang tab bar / peta di tengah animasi
    if (!view || !seatOv) return;
    if (mqDesk.matches) { toSplit(); dock(!view.hidden); } // panel hanya menempel saat tab Peta aktif; tab lain tetap pakai modal
    else { dock(false); toFlat(); }
    if (noMeasure === true) return;
    requestAnimationFrame(() => { if (typeof centerChart === 'function') centerChart(); if (typeof moveInd === 'function') moveInd(true); });
  }
  mqDesk.addEventListener('change', syncLayout);
  syncLayout();
  mqMobile.addEventListener('change', () => { updBar(); if (typeof moveInd === 'function') moveInd(true); });
  // HP landscape: tab bar berpindah ke rail kiri (CSS), jadi pil tab dan tata letak perlu diukur ulang saat layar diputar
  matchMedia('(orientation:landscape) and (max-height:520px)').addEventListener('change', () => { syncLayout(); if (typeof moveInd === 'function') { moveInd(true); requestAnimationFrame(() => moveInd(true)); } });

  // panel kursi: bawa ke layar kalau halaman sedang tergulung jauh
  if (typeof openSeat === 'function') {
    const prev = openSeat;
    openSeat = function (code) {
      prev(code);
      originFromTap();
      if (seatOv.classList.contains('docked')) seatOv.scrollIntoView({block: 'nearest', behavior: calm() ? 'auto' : 'smooth'});
    };
  }

  /* ---------- kilau kaca mengikuti jari / kursor (hanya tab bar & pil filter, hanya saat kaca aktif) ----------
     Yang berubah hanya dua variabel CSS per frame di elemen kecil; tidak ada layout, tidak ada blur yang dianimasikan. */
  (() => {
    [document.querySelector('.tabbar'), $('fbar')].filter(Boolean).forEach(el => {
      let rect = null, raf = 0, px = 0, py = 0;
      const paint = () => { raf = 0; el.style.setProperty('--gx', px + 'px'); el.style.setProperty('--gy', py + 'px'); };
      const move = e => { if (!rect) return; px = e.clientX - rect.left; py = e.clientY - rect.top; if (!raf) raf = requestAnimationFrame(paint); };
      const enter = e => { if (!perf.glassOn() || calm()) return; rect = el.getBoundingClientRect(); move(e); el.style.setProperty('--gl', 1); };
      const leave = () => { rect = null; el.style.setProperty('--gl', 0); };
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerdown', enter);
      el.addEventListener('pointermove', move, {passive: true});
      el.addEventListener('pointerleave', leave);
      el.addEventListener('pointercancel', leave);
      el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') leave(); });
    });
  })();

  /* ---------- modal kursi (tablet/laptop) tumbuh dari titik yang diketuk, bukan dari tengah layar ---------- */
  let tap = null;
  document.addEventListener('pointerdown', e => { tap = {x: e.clientX, y: e.clientY, t: performance.now()}; }, true);
  const sheetMq = matchMedia('(max-width:600px)'); // di bawah ini modal berupa lembar bawah: animasinya sendiri
  function originFromTap() {
    const m = seatOv && seatOv.querySelector('.modal');
    if (!m || seatOv.classList.contains('docked') || !perf.glassOn() || sheetMq.matches || !tap || performance.now() - tap.t > 1500) { m && m.style.removeProperty('--ox'); m && m.style.removeProperty('--oy'); return; }
    m.style.setProperty('--ox', (tap.x - m.offsetLeft) + 'px'); // offset* tidak ikut transform, jadi tetap benar di frame pertama animasi
    m.style.setProperty('--oy', (tap.y - m.offsetTop) + 'px');
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
  // kurva masuk item: melambat halus lalu BERHENTI tepat di posisi akhir (tanpa overshoot).
  // Dulu memakai pegas yang melewati posisi akhir ±2px lalu kembali, sehingga kartu terlihat naik/turun sendiri setelah animasi selesai.
  const POP = 'cubic-bezier(.32,.72,0,1)';
  const IN_MS = () => lite() ? 560 : 800, OUT_MS = () => lite() ? 300 : 440;
  const viewOf = k => $('view-' + k);
  let run = null; // transisi yang sedang berjalan: {anims, done}

  /* Mode hemat animasi item: tablet / layar sentuh / mode lite. Animasi item (cascade + animasi CSS per kartu) tiap satu jadi layer sendiri
     dan menghabiskan sekitar 2/3 biaya render saat pindah tab. Geser tab + pil pegas tetap utuh; yang dikurangi hanya animasi kartu satu-satu. */
  const cheap = () => perf.lite() || navigator.maxTouchPoints > 1;
  document.documentElement.toggleAttribute('data-cheap', cheap());
  const lite = () => perf.lite(); // tingkat performa dari shared.js (HP, tablet sentuh, hemat data, perangkat lemah): layer lebih sedikit supaya tetap 60fps
  // sidebar vertikal hanya untuk laptop/mouse (>=1280px). iPad/tablet sentuh memakai dock bawah, jadi geraknya horizontal seperti di HP
  const sideNav = () => mqDesk.matches && !mqTouch.matches;
  const travel = () => sideNav() ? 28 : lite() ? 34 : Math.round(Math.min(104, Math.max(48, innerWidth * 0.18)));
  const shift = d => sideNav() ? `translate3d(0,${d}px,0)` : `translate3d(${d}px,0,0)`;

  function settle() { // selesaikan seketika transisi sebelumnya (mis. tab diketuk beruntun)
    if (!run) return;
    const r = run; run = null;
    r.anims.forEach(a => { try { a.cancel(); } catch (e) {} });
    r.done();
  }

  /* Item yang terlihat masuk PER BARIS dari atas ke bawah; di dalam satu baris (kartu statistik, foto galeri) dari kiri ke kanan.
     Baris ditentukan dari posisi nyata di layar, jadi urutannya selalu mengikuti tampilan (HP satu kolom, laptop dua kolom).
     Hanya opacity + transform (jalan di compositor). */
  const CASCADE = {
    main: '#story, #last .last-c, #stats .stat, #cover, #filters, #seating-wrapper, #legend',
    tl: '#tl-bar, .tl-yh, .tl-mh, .tl-i',
    gal: '.gk-bar, #gallery-bar, #gallery .gi',
    ev: '#view-ev > h2, #lot .lot-cards .stat, #lot .sec2, #lot .lot-r, #lot .ls-r, #lot .lot-notes, #ev-up, #ev-cats, #ev-bar, #ev-rank, #ev-list .ev-g, #ev-list .ev-c'
  };
  function cascade(view, base = 80) {
    const sel = CASCADE[view.id.replace('view-', '')];
    if (!sel || calm()) return [];
    let items = [];
    for (const el of view.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
      items.push({el, top: r.top, left: r.left});
      if (items.length >= (lite() ? 28 : 40)) break;
    }
    const set = new Set(items.map(it => it.el)); // elemen di dalam elemen lain yang ikut dianimasikan tidak perlu dianimasikan lagi
    items = items.filter(it => { for (let p = it.el.parentElement; p && p !== view; p = p.parentElement) if (set.has(p)) return false; return true; });
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = [];
    items.forEach(it => {
      const last = rows[rows.length - 1];
      if (last && Math.abs(it.top - last.top) < 14) last.items.push(it); else rows.push({top: it.top, items: [it]});
    });
    const L = lite(), start = L ? 40 : base;
    const rowStep = Math.min(L ? 80 : 105, (L ? 600 : 840) / Math.max(1, rows.length)); // total waktu bertahap dibatasi
    const colStep = L ? 48 : 62;
    const base0 = new Map(items.map(it => { const t = getComputedStyle(it.el).transform; return [it.el, t && t !== 'none' ? ' ' + t : '']; })); // jaga kemiringan polaroid
    // garis timeline: ukur SEBELUM animasi item dibuat (supaya posisi belum bergeser oleh keyframe awal)
    const tl = view.id === 'view-tl' ? $('timeline') : null;
    let lnRest = 0;
    if (tl) {
      const tr = tl.getBoundingClientRect();
      const reach = items.reduce((m, it) => Math.max(m, it.top + it.el.offsetHeight - tr.top), 0); // ujung bawah kartu terbawah yang ikut beranimasi
      lnRest = Math.max(0, Math.round(tr.height - reach));
    }
    const dur = L ? 640 : 800, anims = [];
    let lastDelay = 0;
    rows.forEach((row, ri) => {
      // selisih antar kolom diperkecil bila baris lebar, supaya kolom terakhir baris ini tetap muncul SEBELUM kolom pertama baris di bawahnya
      const cs = row.items.length > 1 ? Math.min(colStep, rowStep * 0.8 / (row.items.length - 1)) : 0;
      row.items.sort((a, b) => a.left - b.left).forEach((it, ci) => {
        const delay = start + ri * rowStep + ci * cs, b = base0.get(it.el);
        lastDelay = Math.max(lastDelay, delay);
        anims.push(it.el.animate([{opacity: 0, transform: 'translate3d(0,22px,0) scale(.94)' + b}, {opacity: 1}],
          {duration: dur + 80, delay, easing: POP, fill: 'backwards'}));
      });
    });
    // garis timeline "digambar" dari atas SEJALAN dengan kartu (bukan sudah ada duluan).
    // Dulu: scaleY pada seluruh tinggi timeline (bisa ribuan px) dengan kurva ease-out -> dalam ~300ms garis sudah
    // melewati layar sementara kartu pertama baru muncul di ~550ms. Sekarang: clip-path dipotong sampai ujung kartu
    // terbawah yang ikut beranimasi, kecepatan linear, mulai bersamaan dengan kartu pertama.
    // Transisi CSS biasa (ln0 -> ln1), BUKAN el.animate({pseudoElement}): di Safari/iPad fill 'backwards' pada pseudo-elemen tidak andal.
    if (tl && anims.length) {
      clearTimeout(tl._lnT);
      const dly = start, dur2 = Math.max(200, Math.round(lastDelay - start + 160));
      tl.classList.remove('ln1'); tl.classList.add('ln0'); // garis disembunyikan SEKARANG (frame yang sama dengan item disembunyikan)
      tl.style.setProperty('--ln-delay', dly + 'ms');
      tl.style.setProperty('--ln-dur', dur2 + 'ms');
      tl.style.setProperty('--ln-rest', lnRest + 'px');
      void tl.offsetHeight;                                // commit keadaan tersembunyi tanpa transisi
      tl.classList.add('ln1');                             // lalu tumbuh lewat transisi
      const clean = () => { clearTimeout(tl._lnT); tl.classList.remove('ln0', 'ln1'); ['--ln-delay', '--ln-dur', '--ln-rest'].forEach(k => tl.style.removeProperty(k)); };
      tl._lnT = setTimeout(clean, dly + dur2 + 150);
      // tab diketuk beruntun -> settle() memanggil cancel(): garis langsung penuh lagi
      anims.push({cancel: clean, finished: new Promise(r => setTimeout(r, dly + dur2))});
    }
    return anims;
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

  /* Galeri: foto baru mulai dimuat SETELAH geseran tab selesai. Sebelumnya begitu tab dibuka, puluhan <img loading=lazy>
     langsung mengunduh + decode + memudar masuk tepat saat pil dan isi tab sedang bergerak -> patah-patah.
     Selama transisi, src ditahan di data-src; tempat foto tetap ada (aspect-ratio), jadi layout tidak bergeser. */
  let hold = false;
  const stashImgs = () => document.querySelectorAll('#gallery img[src]').forEach((im, i) => {
    if (i < 12 || im.naturalWidth) return; // 12 pertama (dimuat eager) & yang sudah termuat: aman
    im.dataset.src = im.getAttribute('src'); im.removeAttribute('src');
  });
  const releaseImgs = () => { // dilepas bertahap (6 foto per frame), bukan puluhan sekaligus
    hold = false;
    const q = [...document.querySelectorAll('#gallery img[data-src]')];
    const step = () => {
      q.splice(0, 6).forEach(im => { if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); } });
      if (q.length) requestAnimationFrame(step);
    };
    step();
  };
  /* Prefetch thumbnail di belakang (hemat kuota, tidak mengganggu scroll/animasi):
     - hanya thumbnail photos/t/, satu file per giliran idle, prioritas rendah
     - tidak jalan: Mode Hemat Data, sinyal bukan 4G, offline, tab tersembunyi (lanjut saat tab terlihat lagi)
     - data seluler / koneksi tak diketahui (mis. Safari): maksimal 20 foto terbaru; Wi-Fi/ethernet: semua
     - yang sudah ada di cache dilewati; sisanya tetap diunduh normal saat galeri dibuka */
  const CELL_MAX = 20;
  const warmed = new Set();
  let wq = [], wBusy = false, wDone = 0;
  const warmLimit = () => {
    const c = navigator.connection;
    if (!navigator.onLine) return 0;
    if (c) {
      if (c.saveData) return 0;
      if (c.effectiveType && c.effectiveType !== '4g') return 0;
      if (c.type === 'wifi' || c.type === 'ethernet') return Infinity;
    }
    return CELL_MAX; // seluler / tidak diketahui
  };
  const idle = fn => ('requestIdleCallback' in window) ? requestIdleCallback(fn, {timeout: 5000}) : setTimeout(fn, 600);
  async function warmStep() {
    if (document.hidden || !wq.length || wDone >= warmLimit()) { wBusy = false; return; }
    const u = wq.shift();
    try {
      if (!(await caches.match(u))) { // belum di cache: unduh (service worker yang menyimpannya)
        const res = await fetch(u, {priority: 'low'});
        if (res.ok) await res.blob();
      }
      wDone++;
    } catch (e) { /* gagal/offline: lewati, nanti dimuat normal */ }
    idle(warmStep);
  }
  function warm() {
    if (warmLimit() === 0) return;
    [...document.querySelectorAll('#gallery img')].forEach(im => { // urutan DOM = terbaru dulu
      const u = im.dataset.src || im.getAttribute('src');
      if (!u || !/^photos\/t\//.test(u) || warmed.has(u)) return;
      warmed.add(u); wq.push(u);
    });
    if (!wBusy && wq.length) { wBusy = true; idle(warmStep); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && wq.length && !wBusy) { wBusy = true; idle(warmStep); } });
  if (typeof renderGallery === 'function') {
    const baseGal = renderGallery;
    renderGallery = function () {
      baseGal();
      document.querySelectorAll('#gallery .gi img').forEach((im, i) => { // foto yang muncul pertama sudah siap SEBELUM tab dibuka
        if (i >= 12) return;
        im.loading = 'eager';
        if (im.decode) im.decode().catch(() => {});
      });
      if (hold) stashImgs();
      idle(warm);
    };
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
    hold = name === 'gal' && !still && !!$('gallery'); if (hold) stashImgs();
    VIEW_IDS.forEach(k => { viewOf(k).hidden = k !== name; });
    flushLazy('view-' + name); // kalau masih usang, gambar sekarang (sebelum animasi dimulai)

    // isi baru mulai dari titik yang sama di semua tab: tepat di bawah bar yang menempel di atas (header kecil di HP, status bar iPad, pil tab di jendela sedang).
    // Sidebar kiri (laptop lebar): tidak ada bar di atas, jadi tetap mulai dari bawah header.
    const side = getComputedStyle(document.querySelector('.tabbar')).flexDirection === 'column';
    let top;
    if (side) { const hd = document.querySelector('.head'); top = hd.getBoundingClientRect().bottom + scrollY - 8; }
    else {
      const pr = document.createElement('i'); pr.style.cssText = 'position:fixed;top:var(--stick);left:0;width:0;height:0;visibility:hidden';
      document.body.appendChild(pr); const stick = pr.getBoundingClientRect().top; pr.remove();
      top = next.getBoundingClientRect().top + scrollY - stick - 12;
    }
    if (scrollY > top) scrollTo({top: Math.max(0, top), behavior: 'instant'});
    syncLayout(true);
    if (name === 'main' && typeof centerChart === 'function') centerChart(); // ukur peta hanya saat tab peta dibuka
    syncFbar();
    if (ghost) ghost.el.scrollTop = ghost.off;

    const anims = [];
    const clean = () => {
      if (hold) releaseImgs(); // jaga-jaga: transisi dibatalkan / diselesaikan paksa
      if (ghost) { ghost.el.classList.remove('ghost'); ghost.el.style.cssText = ''; }
      anims.forEach(a => { try { a.cancel(); } catch (e) {} }); // fill:'forwards' tidak boleh tersisa di tab yang nanti dibuka lagi
    };
    const r = {anims, done: clean};
    run = r;
    if (still) { // "Kurangi Gerakan" aktif: tanpa geser/skala, tapi tetap pudar lembut (seperti iOS) supaya tidak muncul tiba-tiba
      anims.push(next.animate([{opacity: 0}, {opacity: 1}], {duration: 240, easing: 'ease-out', fill: 'backwards'}));
      playEnter(next);
      Promise.allSettled(anims.map(a => a.finished)).then(() => { if (run === r) { run = null; r.done(); } });
      return;
    }

    void next.offsetHeight; // paksa tata letak selesai sekarang, bukan di tengah animasi
    const off = dir * travel();
    anims.push(next.animate([{opacity: 0, transform: shift(off)}, {opacity: 1, offset: 0.35}, {opacity: 1, transform: 'none'}],
      {duration: IN_MS(), delay: lite() ? 30 : 60, easing: EASE, fill: 'backwards'}));
    if (hold) { // tunggu geseran isi DAN pil selesai: pil (720ms) lebih lama dari geseran isi di HP (460ms), jadi dulu foto mulai
      // diunduh/decode/memudar tepat di sisa gerak pil -> pil patah di ujung
      const ia = document.querySelector('.tabbar .tab-ind')?._anim;
      Promise.allSettled([anims[0].finished, ia ? ia.finished : null]).then(() => { if (run === r) requestAnimationFrame(releaseImgs); });
    }
    if (ghost) {
      const ga = ghost.el.animate([{opacity: dragO, transform: 'none'}, {opacity: 0, transform: shift(-off * 0.6)}],
        {duration: OUT_MS(), easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards'});
      ga.finished.then(() => { if (run === r) { ghost.el.classList.remove('ghost'); ghost.el.style.cssText = ''; ga.cancel(); } }, () => {});
      anims.push(ga);
    }
    playEnter(next); // .enter + reveal + item bertahap (masuk ke run.anims lewat override di atas)
    if (window.liquid) window.liquid.watch(IN_MS() + 220, say);
    Promise.allSettled(anims.map(a => a.finished)).then(() => { if (run === r) { run = null; r.done(); } });
  }
  window.switchTab = switchTab;
  document.querySelectorAll('.tabbar .tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

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

  /* tahan & geser pil tab: dipindah ke liquid.js (dipakai bersama dengan admin) */

  /* ---------- foto: kartu "terakhir nonton" memudar masuk + tampilan saat gagal dimuat ---------- */
  (() => {
    const box = im => im.closest('.last-ph,.gi-ph,.hi-ph');
    // load pada <img> tidak diteruskan ke window (aturan browser): pasang di document dengan capture
    document.addEventListener('load', e => {
      const im = e.target; if (!im || im.tagName !== 'IMG') return;
      const b = box(im); if (!b) return;
      b.classList.remove('bad');
      if (b.classList.contains('last-ph')) { im.classList.add('ld'); b.classList.add('ld'); } // galeri & modal sudah ditangani shared.js
    }, true);
    document.addEventListener('error', e => {
      const im = e.target; if (!im || im.tagName !== 'IMG') return;
      const b = box(im); if (!b) return;
      if (im.dataset.full && im.getAttribute('src') !== im.dataset.full) return; // thumbnail gagal: foto penuh masih dicoba
      b.classList.add('bad'); b.classList.remove('ld');
    }, true);
  })();

  /* getar halus: dipindah ke liquid.js */


  /* ---------- PWA: service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  addEventListener('offline', () => say('Offline: menampilkan data tersimpan'));
  addEventListener('online', () => say('Kembali online'));
})();
