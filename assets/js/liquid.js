/* liquid.js — perilaku "liquid" yang dipakai BERSAMA oleh index.html dan admin.html (dimuat setelah shared.js).
   Isi:
   1. kilau kaca yang mengikuti kursor (mouse saja)  -> hanya mengisi --mx/--my, tampilannya di liquid.css
   2. tahan lalu geser pil tab bar (HP / tablet sentuh), lepas untuk pindah tab
   3. pengaman frame drop: liquid.watch(ms, say) mematikan efek kaca kalau pindah tab terus-menerus patah-patah
   4. getar halus saat ketuk kursi / pindah tab (Android)
   Butuh dari halaman: window.switchTab(name), plus moveInd() / indFollow() dari shared.js. */
(() => {
  'use strict';
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = matchMedia('(max-width:768px)');
  const mqTouch = matchMedia('(hover:none) and (pointer:coarse)');
  const tabs = () => [...document.querySelectorAll('.tabbar .tab')].filter(b => !b.hidden);

  /* ---------- 1. kilau kursor ---------- */
  if (matchMedia('(hover:hover) and (pointer:fine)').matches && !calm()) {
    const SEL = '.stat,.last-c,.tl-i,.ev-g,.ev-c,.btn-s,.badge,.gk,.tabbar,.modal,.card';
    let raf = 0, ev = null;
    addEventListener('pointermove', e => {
      ev = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ev.target.closest && ev.target.closest(SEL);
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
        el.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      });
    }, {passive: true});
  }

  /* ---------- 2. tahan & geser pil ---------- */
  (() => {
    const bar = document.querySelector('.tabbar');
    if (!bar) return;
    let d = null, raf = 0, swallow = false;
    const nearest = (cs, x) => cs.reduce((b, c, i) => Math.abs(c - x) < Math.abs(cs[b] - x) ? i : b, 0);
    const buzz = () => { if (typeof navigator.vibrate === 'function' && !calm()) { try { navigator.vibrate(6); } catch (e) {} } };
    const centers = () => d.list.map(b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; });

    const follow = () => { // pil mengikuti jari di antara dua tab terdekat
      raf = 0;
      if (!d || !d.drag || d.list.length < 2) return;
      const cs = d.cs || (d.cs = centers()), n = cs.length, x = d.x;
      let i = 0, p = 0;
      if (x >= cs[n - 1]) { i = n - 2; p = 1; }
      else if (x > cs[0]) { i = cs.findIndex((c, k) => k < n - 1 && x >= c && x < cs[k + 1]); p = (x - cs[i]) / (cs[i + 1] - cs[i]); }
      indFollow(d.list[i], d.list[i + 1], p);
      const hot = nearest(cs, x);
      if (hot !== d.hot) { d.hot = hot; d.list.forEach((b, k) => b.classList.toggle('hot', k === hot)); buzz(); }
    };
    const finish = commit => {
      if (!d) return;
      const s = d; d = null;
      cancelAnimationFrame(raf); raf = 0;
      bar.classList.remove('dragging');
      s.list.forEach(b => b.classList.remove('hot'));
      if (!s.drag) return;
      swallow = true; setTimeout(() => { swallow = false; }, 80); // klik susulan setelah geser tidak boleh ikut memicu tab
      const cur = s.list.findIndex(b => b.classList.contains('on'));
      if (commit && s.hot >= 0 && s.hot !== cur && typeof window.switchTab === 'function') window.switchTab(s.list[s.hot].dataset.tab);
      else moveInd(); // tidak pindah: pil kembali pelan ke tab aktif
    };

    bar.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !e.isPrimary || !(mqMobile.matches || mqTouch.matches) || !e.target.closest('.tab')) return;
      d = {id: e.pointerId, x0: e.clientX, x: e.clientX, drag: false, list: tabs(), hot: -1};
    });
    bar.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      d.x = e.clientX;
      if (!d.drag) {
        if (Math.abs(d.x - d.x0) < 8) return; // di bawah ambang = masih ketukan
        d.drag = true;
        try { bar.setPointerCapture(d.id); } catch (err) {}
        bar.classList.add('dragging');
        buzz();
      }
      if (!raf) raf = requestAnimationFrame(follow);
    });
    bar.addEventListener('pointerup', e => { if (d && e.pointerId === d.id) finish(true); });
    bar.addEventListener('pointercancel', e => { if (d && e.pointerId === d.id) finish(false); });
    bar.addEventListener('click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  })();

  /* ---------- 3. pengaman frame drop ----------
     Kalau pindah tab berkali-kali terasa patah (banyak frame > 40ms), efek kaca dimatikan untuk sesi ini
     (?glass=on untuk menyalakan lagi). Satu frame lambat tidak dihitung: harus >50% frame dan 6 kali. */
  let strikes = 0;
  function watch(ms, say) {
    if (typeof perf === 'undefined' || !perf.glassOn() || document.hidden) return;
    const end = performance.now() + ms;
    let last = 0, n = 0, bad = 0;
    const tick = t => {
      if (last) { n++; if (t - last > 40) bad++; }
      last = t;
      if (t < end) { requestAnimationFrame(tick); return; }
      if (n > 8 && bad / n > 0.5 && ++strikes >= 6 && perf.degrade() && typeof say === 'function') say('Efek kaca dimatikan agar lebih lancar');
    };
    requestAnimationFrame(tick);
  }
  /* ---------- 3b. swap: isi baru masuk bertahap (pegas) saat sub-tab / filter di dalam satu tab diganti ----------
     Dipakai untuk: Tiket (Gabungan/jenis/tahun), Biaya (Ringkasan/Away/lainnya + tahun), Galeri (Semua/2-Shot/...), Tiket index.
     Hanya opacity + transform, hanya item yang terlihat di layar. Dipanggil SETELAH render selesai. */
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const POP = EASE; // tanpa overshoot: item berhenti tepat di posisi akhir (tidak naik/turun sendiri setelah selesai)
  function swap(root, sel) {
    if (!root || root.hidden || calm()) return [];
    const L = typeof perf !== 'undefined' && perf.lite();
    let els = sel ? [...root.querySelectorAll(sel)] : [...root.children].filter(e => !e.hidden && !e.matches('.tt-years,.ex-sub,.gk-bar,script,style'));
    if (!sel) els = els.flatMap(e => { // blok berisi kartu berjajar (grid / baris): animasikan kartunya, bukan blok pembungkusnya
      const cs = getComputedStyle(e), k = [...e.children];
      return k.length > 1 && (cs.display === 'grid' || (cs.display === 'flex' && cs.flexDirection === 'row' && cs.flexWrap !== 'nowrap')) ? k : [e];
    });
    const items = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
      items.push({el, top: r.top, left: r.left});
      if (items.length >= (L ? 16 : 28)) break;
    }
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = [];
    items.forEach(it => { const l = rows[rows.length - 1]; if (l && Math.abs(it.top - l.top) < 14) l.items.push(it); else rows.push({top: it.top, items: [it]}); });
    const rowStep = Math.min(L ? 60 : 75, (L ? 360 : 520) / Math.max(1, rows.length)), colStep = L ? 32 : 42, out = [];
    rows.forEach((row, ri) => row.items.forEach((it, ci) => {
      const t = getComputedStyle(it.el).transform, b = t && t !== 'none' ? ' ' + t : ''; // jaga kemiringan polaroid
      out.push(it.el.animate([{opacity: 0, transform: 'translate3d(0,16px,0) scale(.95)' + b}, {opacity: 1}],
        {duration: L ? 520 : 640, delay: 10 + ri * rowStep + ci * colStep, easing: POP, fill: 'backwards'}));
    }));
    return out;
  }
  // pemicu: klik sub-tab / filter. Dibaca di fase capture (DOM lama masih utuh), animasi dimulai setelah render selesai
  const HOOKS = [['#tt [data-y],#tt [data-k]', 'tt'], ['#ex [data-ey]', 'ex'], ['#away [data-ey]', 'away'], ['#misc [data-ey]', 'misc'],
    ['#g-kinds [data-gk]', 'gallery'], ['#ev-cats [data-cat]', 'ev-list']];
  const later = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    if (t.closest('.ex-t')) { later(() => swap(['ex', 'away', 'misc'].map(id => document.getElementById(id)).find(x => x && !x.hidden))); return; }
    for (const [q, id] of HOOKS) if (t.closest(q)) { later(() => swap(document.getElementById(id))); return; }
  }, true);
  document.addEventListener('change', e => { if (e.target && e.target.id === 'g-member') later(() => swap(document.getElementById('gallery'))); }, true);
  window.liquid = {watch, swap};

  /* ---------- 4. getar halus (Android; iOS Safari tidak mendukung, jadi diabaikan) ---------- */
  if (typeof navigator.vibrate === 'function') {
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
  }
})();
