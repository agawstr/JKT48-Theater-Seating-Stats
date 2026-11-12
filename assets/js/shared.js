/* shared.js — dipakai bareng index.html & admin.html
   Butuh elemen: #chart, #total, #seating-wrapper, #stage-container,
   #seat-modal (+ #seat-close, #modal-seat, #modal-hist), #lightbox (+ #lb-img) */
const $ = id => document.getElementById(id);
// Harga/biaya HANYA tampil di admin (body.adm). Di halaman publik harga dianggap 0, jadi kartu Total biaya, chip harga, tooltip bulan,
// kartu Wrapped, dan riwayat kursi otomatis tidak menampilkan harga sama sekali.
const PRICES_VISIBLE = document.body.classList.contains('adm');
const lastFocus = {}, timers = {};

// ---------- Tingkat performa: SATU penentu untuk CSS (html[data-perf], html[data-glass]) dan JS (perf.*) ----------
// data-perf  = "lite" (HP, tablet sentuh, hemat data, perangkat lemah) / "full": berapa berat animasi & lapisan
// data-glass = "on" / "off": efek kaca (backdrop-filter). Mati otomatis di perangkat lemah, hemat data, reduced-transparency,
//              atau kalau perf.degrade() dipanggil (pengaman: pindah tab berkali-kali patah). Disimpan di perangkat ini.
// Uji manual: ?perf=lite|full  dan  ?glass=on|off  (glass=on juga menghapus status "dimatikan otomatis")
const perf = (() => {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search), force = q.get('perf'), forceGlass = q.get('glass');
  const mqs = [matchMedia('(max-width:768px)'), matchMedia('(hover:none) and (pointer:coarse)'), matchMedia('(prefers-reduced-transparency: reduce)')];
  // ?glass=off (uji manual) tersimpan di perangkat; pengaman otomatis HANYA berlaku selama sesi ini (sessionStorage)
  const lsGet = () => { try { return localStorage.getItem('jkt48_glass_m'); } catch (e) { return null; } };
  const lsSet = v => { try { if (v) localStorage.setItem('jkt48_glass_m', v); else localStorage.removeItem('jkt48_glass_m'); } catch (e) {} };
  const autoGet = () => { try { return sessionStorage.getItem('jkt48_glass_auto'); } catch (e) { return null; } };
  const autoSet = v => { try { if (v) sessionStorage.setItem('jkt48_glass_auto', v); else sessionStorage.removeItem('jkt48_glass_auto'); } catch (e) {} };
  try { localStorage.removeItem('jkt48_glass'); } catch (e) {} // status "mati otomatis" lama (permanen) dibersihkan
  if (forceGlass === 'on') { lsSet(null); autoSet(null); } else if (forceGlass === 'off') lsSet('off');
  const weak = () => {
    const c = navigator.connection || {};
    return !!c.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  };
  const tier = () => (force === 'lite' || force === 'full') ? force : (weak() || mqs[0].matches || mqs[1].matches ? 'lite' : 'full');
  const glass = () => {
    if (forceGlass === 'on') return 'on';
    if (!(CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))) return 'off';
    return weak() || mqs[2].matches || lsGet() === 'off' || autoGet() === 'off' ? 'off' : 'on';
  };
  const apply = () => {
    const t = tier(), g = glass();
    if (root.dataset.perf !== t) root.dataset.perf = t;
    if (root.dataset.glass !== g) root.dataset.glass = g;
  };
  apply();
  mqs.forEach(m => m.addEventListener('change', apply));
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', apply);
  return {
    lite: () => root.dataset.perf === 'lite',
    glassOn: () => root.dataset.glass === 'on',
    degrade() { if (root.dataset.glass !== 'on') return false; autoSet('off'); apply(); return true; }
  };
})();
// ---------- Kecepatan animasi: satu pengali untuk SEMUA animasi JS (tab, kartu, pil, foto, modal) di index & admin ----------
// 1 = kecepatan lama, 1.35 = lebih pelan. Uji cepat: ?speed=1.6 (tersimpan di perangkat ini; ?speed=1 untuk mengembalikan).
// Durasi < 250ms (umpan balik sentuhan / gestur) tidak diubah supaya tetap responsif.
const ANIM_SLOW = (() => {
  let v = 1.35;
  try {
    const q = parseFloat(new URLSearchParams(location.search).get('speed'));
    if (q > 0 && q <= 4) localStorage.setItem('jkt48_speed', String(q));
    const st = parseFloat(localStorage.getItem('jkt48_speed'));
    if (st > 0 && st <= 4) v = st;
  } catch (e) {}
  return v;
})();
if (ANIM_SLOW !== 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const baseAnimate = Element.prototype.animate;
  Element.prototype.animate = function (kf, o) {
    if (o && typeof o === 'object') {
      const d = typeof o.duration === 'number' ? o.duration : null;
      if (d !== null && d >= 250) { o = {...o, duration: d * ANIM_SLOW}; if (typeof o.delay === 'number') o.delay *= ANIM_SLOW; }
    } else if (typeof o === 'number' && o >= 250) o *= ANIM_SLOW;
    return baseAnimate.call(this, kf, o);
  };
}
// lapisan terbuka (kartu / modal / lightbox) mengunci halaman di belakangnya, dan tombol Back menutup lapisan paling atas
// (bukan keluar dari halaman). Satu entri riwayat "penjaga" dipasang selama ada lapisan terbuka.
const OV_SEL = '.overlay.open:not(.docked),.overlay.open.over'; // panel kursi yang menempel (laptop) dihitung sebagai lapisan hanya saat .over (dibuka dari kartu member)
const topOverlay = () => document.querySelector('#share-sheet.open:not(.closing)') || document.querySelector('.overlay.open.over:not(.closing)') || [...document.querySelectorAll(OV_SEL)].pop(); // yang paling atas (riwayat kursi dari kartu member = di atas kartu)
const ovOpen = () => [...document.querySelectorAll(OV_SEL)].filter(o => !o.classList.contains('closing'));
const ovLock = () => document.documentElement.classList.toggle('ov-lock', !!document.querySelector(OV_SEL));
let histArmed = false, histIgnore = 0;
const histSync = () => setTimeout(() => { // ditunda sedikit: tutup-lalu-buka (mis. kartu member -> kursi) tidak boleh memicu back
  const n = ovOpen().length;
  if (n && !histArmed) { try { history.pushState({ov: 1}, ''); histArmed = true; } catch (e) {} }
  else if (!n && histArmed) { histArmed = false; histIgnore++; try { history.back(); } catch (e) { histIgnore--; } }
}, 0);
addEventListener('popstate', () => {
  if (histIgnore) { histIgnore--; return; }
  if (!histArmed) return;
  histArmed = false; // entri penjaga sudah terpakai oleh Back
  escClose();        // tutup hanya lapisan paling atas: foto -> kartu -> halaman
  histSync();        // masih ada lapisan di bawahnya? pasang penjaga lagi
});
const openEl = id => {
  const el = $(id);
  clearTimeout(timers[id]);
  el.classList.remove('closing');
  lastFocus[id] = document.activeElement; // untuk dikembalikan saat ditutup
  el.classList.add('open');
  ovLock(); histSync();
};
const closeEl = id => {
  const el = $(id);
  if (!el.classList.contains('open') || el.classList.contains('closing')) return;
  el.classList.add('closing'); // animasi tutup dulu, baru disembunyikan
  timers[id] = setTimeout(() => { el.classList.remove('open', 'closing'); if (id === 'seat-modal') el.classList.remove('over'); ovLock(); try { lastFocus[id]?.focus?.({preventScroll: true}); } catch (e) {} }, 520);
  histSync();
};

// ---------- Layout kursi: jumlah kursi per blok (b1..b4) di tiap baris ----------
const COUNTS = {
  A:[4,6,6,5], B:[5,6,6,6], C:[6,6,6,7], D:[7,6,6,7], E:[7,6,6,7],
  F:[7,6,6,7], G:[8,6,6,7], H:[8,6,6,7], I:[8,6,6,6], J:[7,6,6,4]
};
const SEATS = new Set();
const LAYOUT = Object.entries(COUNTS).map(([row, counts]) => {
  let n = 1;
  return counts.map(c => Array.from({length: c}, () => { const code = row + '-' + n++; SEATS.add(code); return code; }));
});

// ---------- Helper & data ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normSeat = s => {
  const m = String(s || '').trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{1,2})$/);
  return m ? m[1] + '-' + Number(m[2]) : '';
};
const okPhoto = p => typeof p === 'string' && (p.startsWith('data:image/') || /^https?:\/\//i.test(p) || /^photos\/[\w.-]+$/.test(p)); // data URL, URL, atau file di folder photos/
// foto penuh: photos/X.jpg, versi kecil (untuk galeri/modal): photos/t/X.jpg; kalau thumbnail belum ada, otomatis memakai foto penuh
const thumbOf = p => /^photos\/[\w.-]+$/.test(p) ? p.replace('photos/', 'photos/t/') : p;
const KINDS = [
  {k:'ts', q:'2-Shot?', name:'2-Shot', icon:'', f:'twoshot', t:'tsType', m:'member', p:'photo',
   types:[['birthday','Birthday 2-Shot'],['roulette','2-Shot Roulette']], short:{birthday:'Birthday 2-Shot', roulette:'2-Shot'}},
  {k:'ck', q:'Chekicha?', name:'Chekicha', icon:'', f:'chekicha', t:'ckType', m:'ckMember', p:'ckPhoto',
   types:[['birthday','Birthday Chekicha'],['roulette','Roulette Chekicha']], short:{birthday:'Birthday Chekicha', roulette:'Chekicha'}}
];
// daftar 2-Shot / Chekicha yang aktif di satu record (roulette ditampilkan singkat)
const extras = r => KINDS.filter(K => r[K.f] === 'Ya')
  .map(K => ({label: K.short[r[K.t]] || K.short.roulette, icon: K.icon, member: r[K.m], photo: r[K.p], k: K.k}));
const SO = {Malam: 2, Siang: 1};
const MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MON_ID[+m[2] - 1]} ${m[1]}` : (d || ''); }; // 2026-09-25 -> 25 Sep 2026
const cmp = (a, b) => b.date.localeCompare(a.date) || ((SO[b.sesi] || 0) - (SO[a.sesi] || 0));

// sesi lepas: Chekicha / 2-Shot yang dilakukan di luar menonton theater (punya tanggal, member, dan foto sendiri)
let solo = [];
const sanitizeSolo = (s, i) => ({
  id: Number(s.id) || Date.now() + i,
  date: String(s.date || ''),
  kind: s.kind === 'ts' ? 'ts' : 'ck',
  type: s.type === 'birthday' ? 'birthday' : 'roulette',
  member: String(s.member || ''),
  photo: okPhoto(s.photo) ? s.photo : '',
  setlist: String(s.setlist || '').slice(0, 80), // setlist pada hari itu (opsional), tetap dicantumkan di keterangan
  note: String(s.note || '').slice(0, 200)
});
function sanitize(r, i) {
  r = r || {};
  const o = {
    id: Number(r.id) || Date.now() + i,
    seat: normSeat(r.seat) || String(r.seat || '').toUpperCase(),
    setlist: String(r.setlist || ''), date: String(r.date || ''),
    sesi: ['Siang', 'Malam'].includes(r.sesi) ? r.sesi : '',
    note: String(r.note || ''),
    harga: PRICES_VISIBLE ? Math.max(0, Number(r.harga) || 0) : 0, // biaya tiket (Rp); disembunyikan di halaman publik
    tiket: String(r.tiket || '').slice(0, 40),
    // lineup: semua member yang tampil di show ini (diisi dari admin), tanpa duplikat
    lineup: Array.isArray(r.lineup) ? [...new Set(r.lineup.map(x => String(x || '').trim().slice(0, 60)).filter(Boolean))].slice(0, 80) : []
  };
  for (const K of KINDS) {
    const on = r[K.f] === 'Ya' || r[K.f] === true;
    o[K.f] = on ? 'Ya' : 'Tidak';
    o[K.t] = on ? (r[K.t] === 'birthday' ? 'birthday' : 'roulette') : '';
    o[K.m] = on ? String(r[K.m] || '') : '';
    o[K.p] = on && okPhoto(r[K.p]) ? r[K.p] : '';
  }
  return o;
}

let records = []; // diisi oleh halaman (index: dari data.json, admin: dari localStorage)

// ---------- Render malas: tab yang sedang tersembunyi baru digambar saat dibuka ----------
// (render pertama tetap jalan supaya angka di label tab terisi; setelah itu hanya ditandai usang)
const lazyDone = {}, lazyStale = {};
function lazyView(viewId, fn) {
  const v = $(viewId);
  if (v && v.hidden && lazyDone[viewId]) { lazyStale[viewId] = fn; scheduleFlush(); return; }
  lazyDone[viewId] = dataLoaded; delete lazyStale[viewId]; // baru dianggap "sudah digambar" kalau data sungguhan sudah ada
  fn();
}
let flushT = 0;
function scheduleFlush() { // gambar ulang tab yang usang saat browser sedang menganggur
  if (flushT) return;
  const run = () => { flushT = 0; Object.keys(lazyStale).forEach(flushLazy); };
  flushT = 'requestIdleCallback' in window ? requestIdleCallback(run, {timeout: 500}) : setTimeout(run, 300); // cepat: kalau tab langsung dibuka, tidak perlu menggambar di jalur klik
}
function flushLazy(viewId) { const fn = lazyStale[viewId]; if (fn) { delete lazyStale[viewId]; fn(); } }

// ---------- Render peta ----------
function renderChartRaw() {
  hidePop();
  const counts = {}, all = {}, on = isFiltered();
  records.forEach(r => all[r.seat] = 1);
  const allTime = {}; // skala warna memakai semua riwayat (bukan hasil filter) supaya warna tidak bergeser saat memfilter
  records.forEach(r => allTime[r.seat] = (allTime[r.seat] || 0) + 1);
  setHeatScale(Math.max(0, ...Object.values(allTime)));
  const lgs = $('lg-scale'); if (lgs) lgs.innerHTML = heatLegend();
  view().forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const seat = code => {
    const c = counts[code] || 0, h = c ? heat(c) : null;
    const st = h ? ` style="background:${h.bg};color:${h.fg};border-color:${h.bd}"` : '';
    return `<button type="button" class="seat${c ? ' visited' : ''}${on && all[code] && !c ? ' dim' : ''}${showUnv ? (c ? ' seen' : ' want') : ''}" data-seat="${code}"${st} aria-label="Kursi ${code}${c ? `, ${c} kali` : ''}">
      <span>${code}</span>${c ? `<span class="seat-count">${c}</span>` : ''}</button>`;
  };
  $('chart').innerHTML = rowLabels() + [0, 1, 2, 3].map(j =>
    `<div class="seat-block block-${j + 1}">` +
    LAYOUT.map((row, i) => `<div class="seat-row" style="--r:${i}">${row[j].map(seat).join('')}</div>`).join('') + '</div>').join('') + rowLabels();
  fitKey = ''; // isi peta baru digambar: ukurannya harus diukur ulang
  $('total').textContent = records.length; $('total').dataset.cu = records.length;
  const first = !introDone && records.length > 0; // animasi masuk hanya sekali
  introDone = introDone || first; intro = first;
  $('chart').classList.toggle('intro', first);
  // .intro harus dilepas setelah animasi masuk selesai. Kalau dibiarkan, setiap tab Peta dibuka lagi (display:none -> tampil)
  // 60 baris kursi memutar ulang animasi 'rise' (delay bertingkat sampai ~4 detik) = berat + peta lama muncul
  if (first) { clearTimeout(renderChartRaw._introT); renderChartRaw._introT = setTimeout(() => $('chart').classList.remove('intro'), 4600); }
  const sig = JSON.stringify(filter);
  if (lastSig !== null && sig !== lastSig && !first && replayN === null) playRefresh();
  lastSig = sig;
  syncFbar();
  if (first) playEnter($('view-main'));
  renderFilters(); renderStats(); if (first) { countUp($('stats')); countUp($('total').parentElement); }
  tweenNums('st', $('stats'));
  renderSetlists(); renderRows(); renderCal(); lazyView('view-gal', renderGallery); lazyView('view-tl', renderTimeline); renderCover(); if (first) countUp($('cover')); renderLast(); renderMemory(); renderMembers(); renderStory(); lazyView('view-ev', renderTickets); syncUrl();
  requestAnimationFrame(centerChart);
}

let mapScale = 1, mapAuto = true; // zoom peta di HP (cubit dua jari / tombol); mapAuto = otomatis pas lebar layar
var fitKey = ''; // ukuran saat terakhir diukur: kalau sama, peta tidak perlu diukur ulang (hemat 250 kursi x 2 tata letak)
function fitChart(force) {
  const w = $('seating-wrapper'), c = $('stage-container');
  const key = w.clientWidth + ':' + innerWidth + ':' + (mapAuto ? 'a' : mapScale);
  if (!force && key === fitKey && w.clientWidth) return;
  fitKey = key;
  c.style.zoom = ''; c.style.transform = ''; c.style.marginLeft = c.style.marginBottom = ''; w.style.overflowX = '';
  if (!w.clientWidth) return; // tab tersembunyi
  const fit = Math.min(1, w.clientWidth / c.scrollWidth);
  if (window.innerWidth > 768) {
    mapScale = 1;
    if (fit < 1) { // transform: kotak DAN teks mengecil bersama di semua browser; margin menyesuaikan ruang yang dipakai
      const nw = c.offsetWidth, nh = c.offsetHeight;
      c.style.transformOrigin = '0 0';
      c.style.transform = `scale(${fit.toFixed(4)})`;
      c.style.marginLeft = Math.max(0, (w.clientWidth - nw * fit) / 2) + 'px';
      c.style.marginBottom = -(nh * (1 - fit)) + 'px';
      w.style.overflowX = 'hidden'; // sudah pasti muat; lebar tata letak aslinya tidak boleh menjadi area gulir
    }
    return;
  }
  if (mapAuto) mapScale = fit; // HP: peta langsung muat selebar layar; cubit / tombol + untuk memperbesar
  else mapScale = Math.max(fit, mapScale);
  if (mapScale !== 1) c.style.zoom = mapScale.toFixed(3);
}
function centerChart() {
  fitChart();
  const w = $('seating-wrapper'), c = $('stage-container');
  if (window.innerWidth <= 768 && !mapAuto) return; // sedang di-zoom manual: jangan pindahkan posisi geser
  if (c.style.transform) { w.scrollLeft = 0; return; } // peta diskalakan agar muat: tidak ada yang perlu digulir
  w.scrollLeft = (c.scrollWidth - w.clientWidth) / 2;
}
window.addEventListener('resize', centerChart);

// ---------- Modal riwayat kursi ----------
function openSeat(code) {
  hidePop();
  $('modal-seat').textContent = code;
  const list = records.filter(r => r.seat === code).sort(cmp);
  $('modal-hist').innerHTML = list.length ? list.map((r, ri) => `
    <div class="hi" style="--i:${Math.min(ri, 5)}">
      <b>${esc(r.setlist)}</b>
      <div class="hd">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''}</div>
      ${r.note ? `<div class="hn">"${esc(r.note)}"</div>` : ''}
      ${extras(r).map(x => `<div class="ht">${esc(x.label)} dengan ${x.member ? `<button type="button" class="mem-link" data-mem="${esc(x.member)}">${esc(x.member)}</button>` : ''}</div>${x.photo ? `<div class="hi-ph"><img src="${esc(thumbOf(x.photo))}" data-full="${esc(x.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto ${esc(x.label)}" data-cap="${esc(x.label)} dengan ${esc(x.member)}" data-sub="${esc([r.setlist, fmtDate(r.date), r.sesi, 'Kursi ' + r.seat].filter(Boolean).join(' · '))}" decoding="async"></div>` : ''}`).join('')}
      ${r.harga ? `<div class="hn">${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</div>` : ''}
      ${lotHtml(r)}
      <button type="button" class="btn-s share" data-share="${r.id}">Bagikan kartu</button>
    </div>`).join('') : `<div class="empty">Belum ada riwayat di kursi ${esc(code)}</div>`;
  $('modal-hist').scrollTop = 0;
  openEl('seat-modal');
  $('seat-close').focus({preventScroll: true});
}
$('modal-hist').addEventListener('load', e => { // foto memudar masuk setelah selesai dimuat (tempatnya sudah dipesan, jadi tidak ada lompatan)
  if (e.target.tagName !== 'IMG') return;
  e.target.classList.add('ld'); e.target.parentElement.classList.add('ld');
}, true);

// ---------- Popover hover (satu elemen dipakai bergantian) ----------
const pop = document.createElement('div');
pop.id = 'pop';
pop.setAttribute('role', 'tooltip');
document.body.appendChild(pop);
let popSeat = null;
const hidePop = () => { popSeat = null; pop.classList.remove('on'); };

function showPop(btn) {
  const code = btn.dataset.seat;
  const list = records.filter(r => r.seat === code).sort(cmp);
  if (!list.length) return hidePop(); // kursi belum pernah ditempati: tanpa popover
  if (popSeat !== code) {
    popSeat = code;
    pop.innerHTML = `<div class="pop-h"><span class="seat-badge">${esc(code)}</span><span>${list.length}× duduk</span></div>` +
      list.slice(0, 3).map(r => `
        <div class="pop-i"><b>${esc(r.setlist)}</b>
          <div class="hd">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''}</div>
          ${extras(r).map(x => `<div class="ht">${esc(x.label)} dengan ${esc(x.member)}</div>`).join('')}
        </div>`).join('') +
      `<div class="pop-m">${list.length > 3 ? `+${list.length - 3} lainnya · ` : ''}klik untuk detail & foto</div>`;
  }
  pop.classList.add('on');
  // position:fixed + rect kursi, jadi tidak terpengaruh zoom chart
  const b = btn.getBoundingClientRect(), p = pop.getBoundingClientRect();
  const above = b.top - p.height - 8;
  pop.style.top = (above >= 8 ? above : b.bottom + 8) + 'px';
  pop.style.left = Math.max(8, Math.min(innerWidth - p.width - 8, b.left + b.width / 2 - p.width / 2)) + 'px';
}

const canHover = matchMedia('(hover: hover)');
$('chart').addEventListener('mouseover', e => {
  if (!canHover.matches) return;
  const b = e.target.closest('[data-seat]');
  b ? showPop(b) : hidePop();
});
$('chart').addEventListener('mouseleave', hidePop);
$('chart').addEventListener('focusin', e => { // navigasi keyboard
  const b = e.target.closest('[data-seat]');
  if (b && b.matches(':focus-visible')) showPop(b);
});
$('chart').addEventListener('focusout', hidePop);
addEventListener('scroll', hidePop, true);

// ---------- Event modal & lightbox ----------
$('chart').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});
$('seat-close').addEventListener('click', () => closeEl('seat-modal'));
(() => { // lembar bawah ala iOS: tarik gagang / judul ke bawah untuk menutup
  const m = document.querySelector('#seat-modal .modal');
  m.insertAdjacentHTML('afterbegin', '<div class="sheet-grip" aria-hidden="true"></div>');
  let y0 = 0, dy = 0, on = false;
  m.addEventListener('touchstart', e => { on = innerWidth <= 600 && !!e.target.closest('.sheet-grip,#modal-title') && e.touches.length === 1; y0 = e.touches[0].clientY; dy = 0; if (on) m.style.transition = 'none'; }, {passive: true});
  m.addEventListener('touchmove', e => { if (!on) return; dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = `translate3d(0,${dy}px,0)`; }, {passive: true});
  m.addEventListener('touchend', () => {
    if (!on) return; on = false;
    m.style.transition = '';
    if (dy > 90) { closeEl('seat-modal'); setTimeout(() => { m.style.transform = ''; }, 320); } // lanjut meluncur turun (kelas .closing)
    else m.style.transform = '';
  });
})();
$('seat-modal').addEventListener('click', e => { if (e.target.id === 'seat-modal') closeEl('seat-modal'); });
document.addEventListener('click', e => {
  const im = e.target.closest('img[data-photo]');
  if (im) openLightbox(im);
});
let lbTok = 0, lbSrc = null, lbDrag = {dy: 0, sc: 1}, lbMoved = false, lbList = [], lbIdx = 0;
const lbRoot = $('lightbox'), lbEase = 'cubic-bezier(.32,.72,0,1)';
lbRoot.insertAdjacentHTML('beforeend', `<button type="button" class="lb-x" id="lb-x" aria-label="Tutup foto">&times;</button>
  <button type="button" class="lb-nav lb-prev" id="lb-prev" aria-label="Foto sebelumnya"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
  <button type="button" class="lb-nav lb-next" id="lb-next" aria-label="Foto berikutnya"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
  <div class="lb-cap" id="lb-cap" aria-live="polite"><b></b><span></span><small></small></div>`);
const lbShowSrc = () => { if (lbSrc) lbSrc.style.visibility = ''; };
// foto yang dibuka digabung dengan foto-foto lain di wadah yang sama (galeri, kartu member, riwayat kursi, kilas balik) supaya bisa digeser
const LB_GROUP = '#gallery,.mem-ph,#modal-hist,#memory';
function lbGather(im) {
  const box = im.closest(LB_GROUP), els = box ? [...box.querySelectorAll('img[data-photo]')] : [im];
  return els.includes(im) ? els : [im];
}
function lbCaption() { // keterangan di bawah foto: judul + sub (data-cap / data-sub), cadangan: alt
  const im = lbList[lbIdx], cap = $('lb-cap'), [t, s, n] = cap.children;
  t.textContent = (im.dataset.cap || im.alt || '').trim();
  s.textContent = im.dataset.sub || '';
  n.textContent = lbList.length > 1 ? `${lbIdx + 1} / ${lbList.length}` : '';
  cap.hidden = !t.textContent && !s.textContent && !n.textContent;
  $('lb-prev').hidden = $('lb-next').hidden = lbList.length < 2;
  $('lb-prev').disabled = lbIdx <= 0; $('lb-next').disabled = lbIdx >= lbList.length - 1;
  if (!calm() && !cap.hidden) cap.animate([{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: lbEase});
}
function lbLoad(im, tok) { // pasang foto kecil dulu (langsung tampil), lalu foto penuh ditukar tanpa kedip
  const lb = $('lb-img'), full = im.dataset.full || im.src;
  const ar = im.complete && im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 0;
  // ukuran tampil dikunci dari rasio thumbnail (rasio foto penuh sama), jadi saat ditukar foto tidak melompat
  const setAr = a => { if (a) lb.style.setProperty('--ar', a.toFixed(4)); else lb.style.removeProperty('--ar'); lb.classList.toggle('fit', !!a); };
  setAr(ar);
  if (ar) lb.src = im.currentSrc || im.src;
  if (!ar || full !== lb.src) {
    const pre = new Image(); pre.src = full;
    (pre.decode ? pre.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (tok !== lbTok || !lbRoot.classList.contains('open')) return;
      if (!ar && pre.naturalWidth) setAr(pre.naturalWidth / pre.naturalHeight);
      lb.src = full;
    });
  }
  [-2, -1, 1, 2].forEach(o => { const x = lbList[lbIdx + o]; if (x) { x.loading = 'eager'; const p = new Image(); p.src = x.dataset.full || x.src; } }); // tetangga disiapkan lebih dulu
}
function openLightbox(im) { // foto kecil langsung tampil & membesar dari posisinya
  const lb = $('lb-img'), from = im.getBoundingClientRect(), tok = ++lbTok;
  lb.getAnimations().forEach(a => a.cancel()); // bersihkan sisa animasi tutup sebelumnya
  lb.style.animation = ''; lb.style.transform = ''; lbRoot.style.opacity = ''; lbDrag = {dy: 0, sc: 1};
  lbShowSrc(); lbSrc = im;
  lbList = lbGather(im); lbIdx = lbList.indexOf(im);
  lbCaption();
  lbLoad(im, tok);
  openEl('lightbox');
  try { $('lb-x').focus({preventScroll: true}); } catch (e) {}
  if (!calm() && from.width) {
    const to = lb.getBoundingClientRect(); // layout dipaksa sekarang juga (overlay sudah tampil), jadi tidak ada frame "loncat"
    if (to.width) {
      const s = from.width / to.width, dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
      lb.style.animation = 'none'; // gerak ini diatur di sini; jangan tumpang tindih dengan animasi CSS bawaan
      lb.animate([{transform: `translate3d(${dx}px,${dy}px,0) scale(${s})`, opacity: .6}, {transform: 'none', opacity: 1}], {duration: 560, easing: lbEase});
    }
  }
}
function lbGo(d) { // ganti ke foto sebelumnya (-1) / berikutnya (+1) di grup yang sama
  const ni = lbIdx + d;
  if (!lbRoot.classList.contains('open') || lbRoot.classList.contains('closing') || ni < 0 || ni >= lbList.length) return false;
  const lb = $('lb-img'), tok = ++lbTok, im = lbList[ni];
  lbIdx = ni; lbSrc = im;
  lb.getAnimations().forEach(a => a.cancel()); lb.style.animation = 'none'; lb.style.transform = ''; lbDrag = {dy: 0, sc: 1};
  try { im.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'}); } catch (e) {} // thumbnail asal ikut terlihat di belakang, jadi foto bisa "terbang pulang" saat ditutup
  lbCaption();
  lbLoad(im, tok);
  if (!calm()) lb.animate([{transform: `translate3d(${d * 64}px,0,0) scale(.96)`, opacity: 0}, {transform: 'none', opacity: 1}], {duration: 460, easing: lbEase});
  return true;
}
function closeLightbox() { // foto "terbang" kembali ke thumbnail asalnya; kalau thumbnail tak terlihat: mengecil + memudar
  if (!lbRoot.classList.contains('open') || lbRoot.classList.contains('closing')) return;
  const lb = $('lb-img'), src = lbSrc, tok = ++lbTok;
  const r = src && src.isConnected ? src.getBoundingClientRect() : null;
  const vis = r && r.width > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const cur = lb.getBoundingClientRect(); // posisi sekarang, termasuk geseran jari
  const under = ovOpen().filter(o => o !== lbRoot).pop(); // fokus kembali ke kartu di bawahnya (mis. kartu member), bukan ke halaman
  lastFocus.lightbox = under && under.querySelector('.x') || lastFocus.lightbox;
  closeEl('lightbox'); // latar memudar lewat kelas .closing
  if (calm() || !cur.width) { lbShowSrc(); return; }
  const fromT = `translate3d(0,${lbDrag.dy}px,0) scale(${lbDrag.sc})`;
  lb.getAnimations().forEach(a => a.cancel());
  lb.style.animation = 'none'; lb.style.transform = '';
  let anim;
  if (vis) {
    const bw = cur.width / lbDrag.sc, bcx = cur.left + cur.width / 2, bcy = cur.top + cur.height / 2 - lbDrag.dy;
    const dx = r.left + r.width / 2 - bcx, dy = r.top + r.height / 2 - bcy, s = r.width / bw;
    anim = lb.animate([{transform: fromT, opacity: 1}, {transform: `translate3d(${dx}px,${dy}px,0) scale(${s})`, opacity: 1}], {duration: 380, easing: lbEase, fill: 'forwards'});
    anim.onfinish = () => { if (tok === lbTok) lbShowSrc(); };
  } else {
    anim = lb.animate([{transform: fromT, opacity: 1}, {transform: `translate3d(0,${lbDrag.dy + 28}px,0) scale(${lbDrag.sc * .92})`, opacity: 0}], {duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'});
    lbShowSrc();
  }
}
lbRoot.addEventListener('click', e => {
  if (e.target.closest('.lb-nav,.lb-cap')) return; // tombol panah & keterangan tidak menutup foto
  if (lbMoved) { lbMoved = false; return; }
  closeLightbox();
});
$('lb-prev').addEventListener('click', () => lbGo(-1));
$('lb-next').addEventListener('click', () => lbGo(1));
(() => { // geser foto: ke atas/bawah = tutup (foto + latar mengikuti jari), ke kiri/kanan = foto lain (HP)
  const lb = $('lb-img');
  let id = null, x0 = 0, y0 = 0, lastX = 0, lastY = 0, lastT = 0, vx = 0, vy = 0, axis = '';
  lbRoot.addEventListener('pointerdown', e => {
    lbMoved = false;
    if (e.pointerType === 'mouse' || !e.isPrimary || lbRoot.classList.contains('closing') || e.target.closest('.lb-nav,.lb-x')) return;
    id = e.pointerId; x0 = lastX = e.clientX; y0 = lastY = e.clientY; lastT = e.timeStamp; vx = vy = 0; axis = '';
  });
  lbRoot.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dy = e.clientY - y0, dx = e.clientX - x0;
    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? (lbList.length > 1 ? 'h' : 'n') : 'v';
      if (axis === 'n') return;
      lbMoved = true;
      try { lbRoot.setPointerCapture(id); } catch (err) {}
      lb.getAnimations().forEach(a => a.cancel()); lb.style.animation = 'none';
    }
    if (axis === 'n') return;
    const dt = e.timeStamp - lastT;
    if (dt > 0) { vx = (e.clientX - lastX) / dt; vy = (e.clientY - lastY) / dt; }
    lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
    if (axis === 'h') { // di ujung grup, geseran terasa berat (tidak ada foto lagi)
      const has = lbList[lbIdx + (dx < 0 ? 1 : -1)], x = has ? dx : dx * .3;
      lbDrag = {dy: 0, sc: 1, dx: x};
      lb.style.transform = `translate3d(${x}px,0,0)`;
      return;
    }
    const p = Math.min(Math.abs(dy) / 320, 1), sc = 1 - .16 * p;
    lbDrag = {dy, sc};
    lb.style.transform = `translate3d(0,${dy}px,0) scale(${sc})`;
    lbRoot.style.opacity = String(1 - .75 * p);
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    if (!axis || axis === 'n') return;
    const ax = axis; axis = '';
    if (ax === 'h') {
      const dx = lbDrag.dx || 0, dir = dx < 0 ? 1 : -1;
      if ((Math.abs(dx) > 60 || Math.abs(vx) > .45) && lbGo(dir)) return;
      const t = lb.style.transform; lb.style.transform = ''; lbDrag = {dy: 0, sc: 1};
      lb.animate([{transform: t}, {transform: 'none'}], {duration: 420, easing: lbEase});
      return;
    }
    if (Math.abs(lbDrag.dy) > 110 || Math.abs(vy) > .6) { closeLightbox(); return; }
    const t = lb.style.transform, o = lbRoot.style.opacity || '1';
    lb.style.transform = ''; lbRoot.style.opacity = ''; lbDrag = {dy: 0, sc: 1};
    lb.animate([{transform: t}, {transform: 'none'}], {duration: 420, easing: lbEase});
    lbRoot.animate([{opacity: o}, {opacity: 1}], {duration: 420, easing: lbEase});
  };
  lbRoot.addEventListener('pointerup', end);
  lbRoot.addEventListener('pointercancel', end);
})();

// ---- halaman di belakang kartu tidak ikut tergulir: roda / jari di mana pun menggulir isi kartu ----
(() => {
  const SC = '.mem-body,.hist', OVS = ['mem-modal', 'seat-modal'];
  const topOv = topOverlay;
  document.addEventListener('wheel', e => {
    const ov = topOv();
    if (!ov || !e.target.closest) return;
    if (ov.id === 'lightbox') { e.preventDefault(); return; }
    if (!OVS.includes(ov.id) || e.ctrlKey) return;
    const own = e.target.closest(SC), box = own || ov.querySelector(SC);
    if (own) { // sedang di area gulir: biarkan gulir bawaan, tapi jangan bocor ke halaman saat sudah di ujung
      const up = e.deltaY < 0;
      if ((up && own.scrollTop <= 0) || (!up && own.scrollTop + own.clientHeight >= own.scrollHeight - 1)) e.preventDefault();
      return;
    }
    e.preventDefault(); // di latar / judul kartu: dipakai untuk menggulir kartu
    if (box) box.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  }, {passive: false});
  let ty = 0;
  document.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, {passive: true});
  document.addEventListener('touchmove', e => {
    const ov = topOv();
    if (!ov || !OVS.includes(ov.id) || !e.target.closest) return;
    const y = e.touches[0].clientY, dy = y - ty; ty = y;
    if (e.target.closest('.sheet-grip,#modal-title')) return; // tarik gagang lembar bawah: urusan gestur lembar
    const own = e.target.closest(SC);
    if (own) { if ((dy > 0 && own.scrollTop <= 0) || (dy < 0 && own.scrollTop + own.clientHeight >= own.scrollHeight - 1)) e.preventDefault(); return; }
    const box = ov.querySelector(SC);
    if (box) box.scrollTop -= dy;
    e.preventDefault();
  }, {passive: false});
})();

// Escape: lightbox dulu, lalu hook halaman (mis. dialog konfirmasi admin), terakhir modal kursi
const escHooks = [];
function escClose() { // tutup lapisan paling atas (dipakai Esc dan tombol Back)
  if ($('share-sheet')?.classList.contains('open') && !$('share-sheet').classList.contains('closing')) closeEl('share-sheet'); // lembar bagikan selalu di paling atas
  else if (lbRoot.classList.contains('open') && !lbRoot.classList.contains('closing')) closeLightbox();
  else if ($('seat-modal').classList.contains('over') && $('seat-modal').classList.contains('open') && !$('seat-modal').classList.contains('closing')) closeEl('seat-modal'); // kursi dari kartu member: tutup kursi dulu, kartu tetap
  else if (!escHooks.some(h => h())) closeEl('seat-modal');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') return trapTab(e);
  if (lbRoot.classList.contains('open') && !lbRoot.classList.contains('closing') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); lbGo(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (e.key !== 'Escape') return;
  escClose();
});

// ================= Statistik, filter, legenda, setlist, PNG =================
const filter = {setlist: '', member: '', from: '', to: '', row: ''};
// filter dibaca dari URL (?setlist=..&member=..&from=YYYY-MM-DD&to=..) supaya hasilnya bisa dibagikan
new URLSearchParams(location.search).forEach((v, k) => {
  if (!Object.keys(filter).includes(k)) return;
  filter[k] = (k === 'from' || k === 'to') && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : v;
});
if (!/^[A-J]$/.test(filter.row)) filter.row = ''; // validasi ?row=
function syncUrl() {
  const q = new URLSearchParams();
  for (const k in filter) if (filter[k]) q.set(k, filter[k]);
  try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) {} // file:// bisa menolak
}
const isFiltered = () => Object.values(filter).some(Boolean);
// skip: dimensi filter yang diabaikan (supaya grafik tetap menampilkan pilihan lain yang bisa diklik)
// member "ada" di sebuah show kalau tampil di lineup ATAU bertemu 2-Shot/Chekicha (sama dengan statistik Per member)
const hasMember = (r, name) => (r.lineup || []).includes(name) || extras(r).some(x => x.member === name);
const matchF = (r, skip = []) => (skip.includes('setlist') || !filter.setlist || r.setlist === filter.setlist)
  && (!filter.member || hasMember(r, filter.member))
  && (skip.includes('date') || ((!filter.from || r.date >= filter.from) && (!filter.to || r.date <= filter.to)))
  && (skip.includes('row') || !filter.row || r.seat[0] === filter.row);
const viewEx = skip => { // saat putar ulang: hanya N show pertama menurut tanggal
  const l = records.filter(r => matchF(r, skip));
  return replayN === null ? l : l.sort((a, b) => cmp(b, a)).slice(0, replayN);
};
const view = () => viewEx([]);
// jumlah sesi lepas yang lolos filter aktif (filter setlist/baris tidak berlaku untuk sesi lepas, jadi ikut disembunyikan)
const soloView = kind => solo.filter(s => (!kind || s.kind === kind) && !filter.setlist && !filter.row && (!filter.member || s.member === filter.member) && (!filter.from || s.date >= filter.from) && (!filter.to || s.date <= filter.to));
const soloIn = kind => soloView(kind).length; // record yang lolos semua filter (dipakai peta)

// warna heatmap: makin sering makin terang.
// Ambang menyesuaikan data (setHeatScale): kalau kunjungan terbanyak <= 5, tiap jumlah dapat warna sendiri
// yang jaraknya jelas; kalau lebih, dipakai ambang tetap 1 / 2 / 3 / 5 / 8.
const HEAT_COLORS = [
  {bg:'#5c2e0c', fg:'#ffd9b0', bd:'#8a4b1a'},
  {bg:'#8f4a0a', fg:'#fff0dd', bd:'#b8620a'},
  {bg:'#c96a00', fg:'#fff',    bd:'#e07a00'},
  {bg:'#ff8c00', fg:'#000',    bd:'#ffaa00'},
  {bg:'#ffd23f', fg:'#000',    bd:'#fff3b0'}];
const HEAT_STATIC_MIN = [1, 2, 3, 5, 8];
const HEAT_PICK = {1: [2], 2: [1, 4], 3: [1, 3, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 3, 4]}; // kunjungan terbanyak -> indeks warna
let HEAT = HEAT_COLORS.map((c, i) => ({...c, min: HEAT_STATIC_MIN[i]})), heatExact = false;
function setHeatScale(max) {
  const pick = HEAT_PICK[max];
  heatExact = !!pick;
  HEAT = pick ? pick.map((ci, k) => ({...HEAT_COLORS[ci], min: k + 1})) : HEAT_COLORS.map((c, i) => ({...c, min: HEAT_STATIC_MIN[i]}));
}
const heat = c => HEAT.filter(h => c >= h.min).pop();
const heatLabel = (h, i) => heatExact ? `${h.min}×` : HEAT[i + 1] ? (HEAT[i + 1].min - 1 > h.min ? `${h.min}–${HEAT[i + 1].min - 1}×` : `${h.min}×`) : `${h.min}+×`;

// kontainer disisipkan lewat JS supaya index & admin otomatis sama
const wrapEl = $('seating-wrapper');
wrapEl.insertAdjacentHTML('beforebegin', `<div id="last"></div><div id="stats"></div><div id="cover"></div>
  <div id="filters">
    <select id="flt-setlist" aria-label="Filter setlist"></select>
    <input type="search" id="flt-member" list="dl-flt-member" placeholder="Semua member" aria-label="Filter member (ketik untuk mencari)" autocomplete="off"><datalist id="dl-flt-member"></datalist>
    <label class="fld" id="fld-from"><span class="fl">Mulai tanggal</span><span class="fv" aria-hidden="true">Pilih tanggal</span><input type="date" id="flt-from"></label>
    <label class="fld" id="fld-to"><span class="fl">Sampai tanggal</span><span class="fv" aria-hidden="true">Pilih tanggal</span><input type="date" id="flt-to"></label>
    <button type="button" class="btn-s" id="flt-reset">Reset</button><span id="flt-info"></span>
  </div>`);
wrapEl.insertAdjacentHTML('afterend', `<div id="legend"></div>
  <h2 class="sec">Total kunjungan per setlist <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik batang untuk memfilter peta</small></h2><div id="sl-chart"></div>
  <h2 class="sec">Sebaran per baris <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik batang untuk memfilter peta</small></h2><div id="rchart"></div><div id="rsum"></div>
  <h2 class="sec">Kalender kehadiran <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik tanggal yang berwarna untuk memfilter peta</small></h2><div id="cal-nav"></div><div id="cal"></div>
  <h2 class="sec" id="mc-h">Kunjungan per bulan</h2><div id="mchart"></div>`);
function syncDates() { // tandai kolom tanggal yang kosong supaya tampil tulisan "Pilih tanggal"
  [['from', 'fld-from'], ['to', 'fld-to']].forEach(([k, id]) => { $('flt-' + k).value = filter[k]; $(id).classList.toggle('empty', !filter[k]); });
}
syncDates();
const heatLegend = () => HEAT.map((h, i) =>
  `<span class="lg"><i style="background:${h.bg};border-color:${h.bd}"></i>${heatLabel(h, i)}</span>`).join('');
$('legend').innerHTML = 'Jumlah kunjungan: <span id="lg-scale">' + heatLegend() + '</span>' +
  '<button type="button" class="btn-s" id="png-btn">Simpan peta (PNG)</button><button type="button" class="btn-s" id="rp-btn">Putar ulang</button><button type="button" class="btn-s" id="wrap-btn">Wrapped</button>';

// semua member yang bisa difilter: tampil di lineup ATAU bertemu 2-Shot/Chekicha
const filterMembers = () => [...new Set(records.flatMap(r => [...extras(r).map(x => x.member), ...(r.lineup || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
function renderFilters() {
  const opts = (id, vals, ph) => {
    const cur = filter[id.slice(4)];
    $(id).innerHTML = `<option value="">${ph}</option>` + (cur && !vals.includes(cur) ? [...vals, cur] : vals).map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  opts('flt-setlist', [...new Set(records.map(r => r.setlist).filter(Boolean))].sort(), 'Semua setlist');
  $('dl-flt-member').innerHTML = filterMembers().map(n => `<option value="${esc(n)}">`).join('');
  if (document.activeElement !== $('flt-member')) $('flt-member').value = filter.member; // jangan menimpa ketikan yang sedang berjalan
  $('flt-info').textContent = isFiltered() ? `${filter.row ? 'Baris ' + filter.row + ' · ' : ''}${view().length} dari ${records.length} show cocok` : '';
}
$('filters').addEventListener('change', e => {
  const k = {'flt-setlist': 'setlist', 'flt-member': 'member', 'flt-from': 'from', 'flt-to': 'to'}[e.target.id];
  if (!k) return;
  if (k === 'member') { // nama persis, atau potongan nama yang hanya cocok dengan satu member ("Cit" -> Citra); selain itu dipakai apa adanya (hasilnya 0)
    const raw = e.target.value.trim(), v = raw.toLowerCase(), fm = filterMembers(), part = fm.filter(n => n.toLowerCase().includes(v));
    filter.member = !v ? '' : fm.find(n => n.toLowerCase() === v) || (part.length === 1 ? part[0] : raw);
    e.target.value = filter.member;
  } else filter[k] = e.target.value;
  syncDates(); renderChart();
});
$('filters').addEventListener('input', e => { // tombol × pada kolom cari mengosongkan filter tanpa menunggu 'change'
  if (e.target.id === 'flt-member' && !e.target.value && filter.member) { filter.member = ''; renderChart(); }
});
$('flt-reset').addEventListener('click', () => {
  Object.keys(filter).forEach(k => filter[k] = '');
  $('flt-from').value = $('flt-to').value = ''; $('fld-from').classList.add('empty'); $('fld-to').classList.add('empty');
  renderChart();
});

// seri: pilih baris paling depan (A = dekat panggung), lalu nomor paling kanan
const seatTie = (a, b) => a[0].localeCompare(b[0]) || parseInt(b.slice(2)) - parseInt(a.slice(2));
function renderStats() {
  const by = (fn, tie) => tally(view(), fn, tie);
  // x = atribut tambahan kartu; n/fmt = angka mentah + format (mis. 'rp') supaya kartu berisi teks (Rp ...) ikut berhitung
  const card = (l, v, s, x = '', n = null, fmt = '') => `<div class="stat"${x}><div class="sv${String(v).length > 9 ? ' sm' : ''}"${typeof v === 'number' ? ` data-n="${v}"` : n !== null ? ` data-n="${n}" data-fmt="${fmt}"` : ''}>${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${/^\d+×$/.test(s) ? `<span data-cu="${parseInt(s)}" data-suf="×">${esc(s)}</span>` : esc(s)}</div>` : ''}</div>`;
  const st = top => top ? [top[0], top[1] + '×'] : ['-', ''];
  const paid = view().filter(r => r.harga > 0), tot = paid.reduce((a, r) => a + r.harga, 0);
  $('stats').innerHTML = [
    card('Total show', view().length),
    card('Kursi favorit', ...st(by(r => r.seat, seatTie))),
    card('Baris favorit', ...st(by(r => r.seat[0], (a, b) => a.localeCompare(b)))),
    card('2-Shot', view().filter(r => r.twoshot === 'Ya').length + soloIn('ts'), soloIn('ts') ? 'termasuk ' + soloIn('ts') + ' di luar show' : ''),
    card('Chekicha', view().filter(r => r.chekicha === 'Ya').length + soloIn('ck'), soloIn('ck') ? 'termasuk ' + soloIn('ck') + ' di luar show' : ''),
    (t => card('Member terbanyak', ...st(t), t ? ` data-member="${esc(t[0])}" role="button" tabindex="0" title="Ketuk untuk statistik ${esc(t[0])}"` : ''))(tally([...view().flatMap(r => extras(r).map(x => x.member)), ...soloView().map(w => w.member)], m => m)), // pertemuan di show + sesi lepas, sama dengan kartu 2-Shot/Chekicha
    ...(tot ? [card('Total biaya', rupiah(tot), '', '', tot, 'rp'), card('Rata-rata / show', rupiah(tot / paid.length), `dari ${paid.length} show berbayar`, '', Math.round(tot / paid.length), 'rp')] : [])
  ].join('');
}

// bar horizontal: total kunjungan per setlist (klik = filter peta)
function renderSetlists() {
  const o = {};
  // ikut filter member & tanggal; filter setlist sendiri diabaikan supaya setlist lain tetap terlihat
  records.filter(r => matchF(r, ['setlist'])).forEach(r => { const k = r.setlist || '(tanpa setlist)'; o[k] = (o[k] || 0) + 1; });
  const rows = Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = rows.length ? rows[0][1] : 1;
  $('sl-chart').innerHTML = rows.length ? rows.map(([k, n], i) => `
    <button type="button" style="--i:${Math.min(i, 14)}" class="sl-row${filter.setlist === k ? ' on' : ''}" data-setlist="${esc(k)}" title="Klik untuk filter peta">
      <span class="sl-n">${esc(k)}</span><span class="sl-bar"><i style="width:${n / max * 100}%"></i></span><span class="sl-c">${n}×</span>
    </button>`).join('') : '<div class="empty">Belum ada data</div>';
}
$('sl-chart').addEventListener('click', e => {
  const b = e.target.closest('[data-setlist]');
  if (!b) return;
  filter.setlist = filter.setlist === b.dataset.setlist ? '' : b.dataset.setlist;
  renderChart();
});

// simpan peta sebagai PNG (digambar langsung di canvas, tanpa library)
function savePng() {
  const S = 2, cw = 38, ch = 46, g = 5, rp = 52, bg = 20, pad = 28, top = 88;
  const bw = [0, 1, 2, 3].map(j => Math.max(...LAYOUT.map(r => r[j].length)) * (cw + g) - g);
  const W = bw.reduce((a, b) => a + b) + bg * 3 + pad * 2, H = top + LAYOUT.length * rp + pad;
  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  c.fillStyle = '#0d090d'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ff2a5f'; c.font = '900 20px sans-serif'; c.fillText(document.querySelector('h1').textContent, W / 2, 26);
  c.fillStyle = '#a1a1aa'; c.font = '600 13px sans-serif'; c.fillText(`Total riwayat show: ${view().length}`, W / 2, 48);
  c.fillStyle = '#380816'; c.fillRect(pad, 62, W - pad * 2, 18);
  c.fillStyle = '#ff2a5f'; c.font = '900 11px sans-serif'; c.fillText('S T A G E', W / 2, 71);
  const counts = {};
  view().forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  let x0 = pad;
  for (let j = 0; j < 4; j++) {
    LAYOUT.forEach((row, i) => {
      const w = row[j].length * (cw + g) - g, y = top + i * rp;
      row[j].forEach((code, k) => {
        const x = (j % 2 ? x0 : x0 + bw[j] - w) + k * (cw + g), n = counts[code], h = n ? heat(n) : null;
        c.beginPath(); c.roundRect(x, y, cw, ch, 6);
        c.fillStyle = h ? h.bg : '#1e050c'; c.fill();
        c.strokeStyle = h ? h.bd : '#3d0815'; c.stroke();
        c.fillStyle = h ? h.fg : '#f43f5e'; c.font = '700 11px sans-serif';
        c.fillText(code, x + cw / 2, y + (n ? 15 : ch / 2));
        if (n) { c.font = '900 14px sans-serif'; c.fillText(n + '×', x + cw / 2, y + 32); }
      });
    });
    x0 += bw[j] + bg;
  }
  const a = document.createElement('a');
  a.download = 'peta-kursi.png'; a.href = cv.toDataURL('image/png'); a.click();
}
$('png-btn').addEventListener('click', savePng);

// focus trap: Tab tidak keluar dari modal yang sedang terbuka
function trapTab(e) {
  const ov = topOverlay();
  if (!ov) return;
  const f = [...ov.querySelectorAll('button,[href],input,select,textarea')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return e.preventDefault();
  const first = f[0], last = f[f.length - 1], cur = document.activeElement;
  if (!ov.contains(cur) || (e.shiftKey && cur === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
}

// ================= Animasi, kalender, galeri, Wrapped =================
let introDone = false, intro = false;
const rowLabels = () => `<div class="row-labels" aria-hidden="true">${Object.keys(COUNTS).map((l, i) => `<div class="seat-row" style="--r:${i}">${l}</div>`).join('')}</div>`;

function tally(list, fn, tie) {
  const o = {};
  list.forEach(r => [].concat(fn(r)).forEach(k => k && (o[k] = (o[k] || 0) + 1)));
  return Object.entries(o).sort((a, b) => b[1] - a[1] || (tie ? tie(a[0], b[0]) : 0))[0];
}

// format angka untuk animasi hitung: '' = bilangan bulat, 'rp' = Rp 1.234.567, 'pct1' = 58.3%
const fmtNum = (n, f) => f === 'rp' ? rupiah(Math.round(n)) : f === 'pct1' ? n.toFixed(1) + '%' : String(Math.round(n));
// angka naik dari 0. Penanda: data-n (kartu statistik, ikut dianimasikan lagi saat filter berubah) atau data-cu (hanya hitung naik);
// data-fmt = format, data-suf = akhiran (mis. ×). Teks akhir dikembalikan persis seperti aslinya di frame terakhir.
function countUp(root, zero) {
  if (calm()) return;
  root.querySelectorAll('[data-n],[data-cu]').forEach(el => {
    const n = parseFloat(el.dataset.n ?? el.dataset.cu), f = el.dataset.fmt || '', suf = el.dataset.suf || '', fin = el.textContent;
    if (isNaN(n)) return;
    if (document.hidden) { el.textContent = fin; return; } // rAF berhenti di tab latar: jangan tinggalkan angka di 0
    const t0 = performance.now(), d = n > 99999 ? 1400 : 1100;
    const step = t => {
      const p = Math.min(1, (t - t0) / d);
      el.textContent = p >= 1 ? fin : fmtNum(n * (1 - Math.pow(1 - p, 3)), f) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    if (zero) el.textContent = fmtNum(0, f) + suf;
    requestAnimationFrame(step);
  });
}

// placeholder berkilau selagi data dimuat
function skeleton() {
  $('stats').innerHTML = '<div class="stat sk"></div>'.repeat(6);
  $('sl-chart').innerHTML = '<div class="sk" style="height:30px;margin:6px 0"></div>'.repeat(5);
  if ($('lot')) $('lot').innerHTML = '<div class="lot-cards">' + '<div class="stat sk"></div>'.repeat(4) + '</div>'; // tab Tiket & Event
  if ($('ev-list')) $('ev-list').innerHTML = '<div class="sk" style="height:64px;margin:8px 0"></div>'.repeat(4);
  if ($('ev-cats')) $('ev-cats').innerHTML = '<div class="sk" style="height:84px"></div>'.repeat(4);
}

// kalender kehadiran per hari (ikut filter)
let calYear = 0, calYears = [];
function renderCal() {
  calYears = [...new Set(records.map(r => r.date.slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort();
  if (!calYears.length) { $('cal-nav').innerHTML = ''; $('mchart').innerHTML = ''; $('cal').innerHTML = '<div class="empty">Belum ada data</div>'; return; }
  if (!calYears.includes(String(calYear))) calYear = +calYears[calYears.length - 1];
  const i = calYears.indexOf(String(calYear));
  $('wrap-btn').textContent = `Wrapped ${calYear}`;
  $('cal-nav').innerHTML = `<button type="button" class="btn-s" data-cy="-1" ${i <= 0 ? 'disabled' : ''}>‹</button><b>${calYear}</b><button type="button" class="btn-s" data-cy="1" ${i >= calYears.length - 1 ? 'disabled' : ''}>›</button>`;
  const cnt = {};
  viewEx(['date']).forEach(r => cnt[r.date] = (cnt[r.date] || 0) + 1);
  const d = new Date(calYear, 0, 1), pad = d.getDay(); // kolom dimulai hari Minggu
  const weeks = Math.ceil((pad + Math.round((new Date(calYear + 1, 0, 1) - d) / 864e5)) / 7);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  let cells = '<i class="cd e"></i>'.repeat(pad), labels = '';
  for (let idx = pad; d.getFullYear() === calYear; d.setDate(d.getDate() + 1), idx++) {
    if (d.getDate() === 1) labels += `<span style="left:${Math.floor(idx / 7) / weeks * 100}%">${mon[d.getMonth()]}</span>`; // label tepat di minggu pertama bulan
    const k = `${calYear}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, n = cnt[k] || 0;
    cells += `<i class="cd${n ? ' on' + Math.min(n, 3) : ''}${filter.from && filter.to && k >= filter.from && k <= filter.to ? ' sel' : ''}"${n ? ` data-d="${k}" role="button" tabindex="0" aria-label="${fmtDate(k)}" style="--d:${Math.floor(idx / 7)}"` : ''} title="${fmtDate(k)}${n ? ': ' + n + ' show' : ''}"></i>`;
  }
  $('cal').innerHTML = `<div class="cal-m">${labels}</div><div class="cal-g" style="--w:${weeks}">${cells}</div>`;
  // kunjungan per bulan di tahun yang sama (ikut filter)
  const mc = Array(12).fill(0), ms = Array(12).fill(0);
  viewEx(['date']).forEach(r => { if (r.date.startsWith(calYear + '-')) { mc[+r.date.slice(5, 7) - 1]++; ms[+r.date.slice(5, 7) - 1] += r.harga; } });
  const mx = Math.max(...mc, 1), mkey = i => calYear + '-' + String(i + 1).padStart(2, '0');
  const hOpen = !!$('mc-h').querySelector('.hint:not([hidden])'); // pertahankan keadaan buka/tutup saat digambar ulang
  $('mc-h').innerHTML = `Kunjungan per bulan (${calYear}) <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="${hOpen}">ⓘ</button><small class="hint"${hOpen ? '' : ' hidden'}>· klik batang bulan untuk memfilter peta</small>`;
  $('mchart').innerHTML = mc.map((n, i) => `<div class="mc${filter.from === mkey(i) + '-01' && filter.to.startsWith(mkey(i)) ? ' on' : ''}"${n ? ` data-mo="${mkey(i)}" role="button" tabindex="0"` : ''} style="--i:${i}" title="${mon[i]}: ${n} show${ms[i] ? ' · ' + rupiah(ms[i]) : ''}"><span class="mc-n">${n || ''}</span><div class="mc-b"><i style="height:${n / mx * 100}%"></i></div><span class="mc-l">${mon[i]}</span></div>`).join('');
}
$('cal-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-cy]');
  if (!b) return;
  calYear = +calYears[calYears.indexOf(String(calYear)) + Number(b.dataset.cy)];
  withAnim(renderCal); // bar bulan ikut naik/turun
  slideCal(Number(b.dataset.cy));
});

// galeri foto 2-Shot / Chekicha (hanya jika halaman punya #gallery)
function renderGallery() {
  const g = $('gallery');
  if (!g) return;
  const soloItems = solo.filter(w => w.photo).map(w => { const K = KINDS.find(k => k.k === w.kind); return {label: K.short[w.type], icon: K.icon, member: w.member, photo: w.photo, k: w.kind, solo: true, r: {id: w.id, date: w.date, sesi: '', setlist: w.setlist || 'Di luar show'}}; });
  // foto 2-Shot event: tanggal, member, dan nama event diambil dari data tiket yang sudah ada
  const evItems = tickets.filter(t => t.photo).map((t, i) => ({label: '2-Shot Event', icon: '', member: t.member, photo: t.photo, k: 'ev', ev: true, r: {id: i, date: t.date, sesi: '', setlist: tname(t)}}));
  const items = [...records.flatMap(r => extras(r).filter(x => x.photo).map(x => ({...x, r}))), ...soloItems, ...evItems].sort((a, b) => cmp(a.r, b.r));
  const sel = $('g-member'), cur = sel.value;
  const inK = x => !galKind || x.k === galKind; // sub-tab Galeri: Semua / 2-Shot / 2-Shot Event / Chekicha
  const mem = [...new Set(items.filter(inK).map(x => x.member).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua member</option>' + mem.map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
  const list = items.filter(x => inK(x) && (!cur || !mem.includes(cur) || x.member === cur));
  if ($('g-kinds')) $('g-kinds').innerHTML = [['', 'Semua'], ['ts', '2-Shot'], ['ev', '2-Shot Event'], ['ck', 'Chekicha']].map(([k, l]) => `<button type="button" class="gk${k === galKind ? ' on' : ''}" data-gk="${k}">${l} <b>${items.filter(x => !k || x.k === k).length}</b></button>`).join('');
  $('g-info').textContent = `${list.length} foto`;
  if ($('g-tab') && dataLoaded) $('g-tab').textContent = `Galeri (${items.length})`;
  // isi galeri tidak bergantung pada filter peta: kalau daftarnya sama persis, jangan bangun ulang.
  // (membangun ulang = <img> baru = foto memudar ulang + diunduh/decode ulang tepat saat tab dibuka)
  const sig = galKind + '|' + cur + '|' + list.map(x => [x.photo, x.k, x.member, x.label, x.r.setlist, x.r.date, x.r.id].join('~')).join('|');
  if (sig === renderGallery.sig && g.firstElementChild) return;
  renderGallery.sig = sig;
  g.innerHTML = list.length ? list.map((x, i) => `<figure class="gi${i < 8 ? ' a' : ''}" data-k="${esc(x.k)}" style="--i:${Math.min(i, 9)};--t:${(i * 37 % 9) - 4}deg"><div class="gi-ph"><img src="${esc(thumbOf(x.photo))}" data-full="${esc(x.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="${esc(x.label)} dengan ${esc(x.member)}" data-cap="${esc(x.label)} dengan ${esc(x.member) || '-'}" data-sub="${esc([x.r.setlist, fmtDate(x.r.date), x.r.sesi, x.solo ? 'di luar show' : ''].filter(Boolean).join(' · '))}" loading="lazy" decoding="async"></div>
    <figcaption><b class="gi-n">${esc(x.member) || '-'}</b><span class="gi-tag">${esc(x.label)}</span><span class="gi-m">${esc(x.r.setlist)}</span><time class="gi-d">${esc(fmtDate(x.r.date))}</time>${x.solo ? '<span class="gi-x">di luar show</span>' : ''}</figcaption></figure>`).join('')
    : '<div class="empty">Belum ada foto</div>';
}
$('g-member')?.addEventListener('change', renderGallery);
$('gallery')?.addEventListener('load', e => { if (e.target.tagName !== 'IMG') return; e.target.classList.add('ld'); e.target.closest('.gi-ph')?.classList.add('ok'); }, true); // foto memudar masuk setelah selesai dimuat; .ok mematikan placeholder

// peta mini di canvas: counts = kode->jumlah (warna heatmap), hl = kursi yang disorot (opsional)
function drawMiniMap(c, cx, y0, cw, g, counts, hl, rad = 5) {
  const gap = 18, ch = cw * 1.1;
  const bw = [0, 1, 2, 3].map(j => Math.max(...LAYOUT.map(r => r[j].length)) * (cw + g) - g);
  let x0 = cx - (bw.reduce((a, b) => a + b) + gap * 3) / 2, spot = null;
  for (let j = 0; j < 4; j++) {
    LAYOUT.forEach((row, i) => {
      const w = row[j].length * (cw + g) - g, y = y0 + i * (ch + g);
      row[j].forEach((code, k) => {
        const x = (j % 2 ? x0 : x0 + bw[j] - w) + k * (cw + g), n = counts[code], h = n ? heat(n) : null;
        if (code === hl) { spot = {x, y}; return; } // kursi yang disorot digambar terakhir, di atas yang lain
        c.beginPath(); c.roundRect(x, y, cw, ch, rad);
        c.globalAlpha = hl ? .5 : 1; c.fillStyle = h ? h.bg : '#2a0f18'; c.fill(); c.globalAlpha = 1;
      });
    });
    x0 += bw[j] + gap;
  }
  if (spot) {
    const e = Math.max(2, cw * .18);
    c.save(); c.beginPath(); c.roundRect(spot.x - e, spot.y - e, cw + e * 2, ch + e * 2, rad + e);
    c.shadowColor = '#ff8c00'; c.shadowBlur = 36; c.fillStyle = '#ffd23f'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = Math.max(2, cw * .12); c.strokeStyle = '#fff'; c.stroke(); c.restore();
  }
}
// kartu "Wrapped" untuk tahun yang dipilih di kalender, disimpan sebagai PNG
async function wrapped() {
  if (!calYear) return alert('Belum ada data untuk dibuat Wrapped.');
  const y = String(calYear), rs = records.filter(r => r.date.startsWith(y));
  if (!rs.length) return alert('Tidak ada show di tahun ' + y + '.');
  const t = (fn, tie) => tally(rs, fn, tie) || ['-', 0];
  const rows = [
    ['KURSI FAVORIT', ...t(r => r.seat, seatTie)],
    ['SETLIST TERBANYAK', ...t(r => r.setlist)],
    ['MEMBER TERATAS', ...t(r => extras(r).map(x => x.member))],
    ['BARIS FAVORIT', ...t(r => r.seat[0], (a, b) => a.localeCompare(b))]
  ];
  await cardFonts();
  const counts = {};
  rs.forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  cardBg(c, W, H, +y);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.roundRect(W / 2 - 240, 50, 480, 56, 28); c.fill();
  c.fillStyle = '#e4e4e7'; c.font = `700 24px ${CARD_F}`; c.fillText('T H E A T E R   W R A P P E D', W / 2, 86);
  const gt = c.createLinearGradient(W / 2 - 320, 0, W / 2 + 320, 0);
  gt.addColorStop(0, '#ff2a5f'); gt.addColorStop(1, '#ffb347');
  c.fillStyle = gt; c.shadowColor = 'rgba(255,42,95,.6)'; c.shadowBlur = 40;
  c.font = `900 210px ${CARD_F}`; c.fillText(y, W / 2, 290);
  c.shadowBlur = 0;
  c.fillStyle = '#fff'; c.font = `800 44px ${CARD_F}`;
  c.fillText(`${rs.length} show · ${Object.keys(counts).length} kursi berbeda`, W / 2, 358);
  c.fillStyle = '#ff2a5f'; c.font = `800 20px ${CARD_F}`; c.fillText('S T A G E', W / 2, 410);
  drawMiniMap(c, W / 2, 428, 26, 3, counts, null);
  rows.forEach(([label, val, n], i) => {
    const x = 90 + (i % 2) * 460, yy = 780 + Math.floor(i / 2) * 200;
    glass(c, x, yy, 440, 180, 28);
    c.textAlign = 'left';
    c.fillStyle = '#a1a1aa'; c.font = `700 22px ${CARD_F}`; c.fillText(label, x + 30, yy + 48);
    c.fillStyle = '#fff'; fitFont(c, String(val), 380, 46, 800); c.fillText(val, x + 30, yy + 108);
    c.fillStyle = '#ff8c00'; c.font = `900 34px ${CARD_F}`; c.fillText(n ? n + '×' : '', x + 30, yy + 155);
  });
  const paid = rs.reduce((a, r) => a + (r.harga || 0), 0);
  c.textAlign = 'center'; c.fillStyle = '#e4e4e7'; c.font = `700 32px ${CARD_F}`;
  c.fillText(`${rs.filter(r => r.twoshot === 'Ya').length} 2-Shot  ·  ${rs.filter(r => r.chekicha === 'Ya').length} Chekicha${paid ? '  ·  ' + rupiah(paid) : ''}`, W / 2, 1230);
  c.fillStyle = '#9a9aa4'; c.font = `600 26px ${CARD_F}`; c.fillText(document.querySelector('h1').textContent, W / 2, 1300);
  openShare({title: `Bagikan Wrapped ${y}`, formats: false, file: `wrapped-${y}.png`,
    text: `Theater Wrapped ${y}: ${rs.length} show · ${Object.keys(counts).length} kursi berbeda\n${document.querySelector('h1').textContent}${/^https?:/i.test(location.protocol) ? '\n' + location.origin + location.pathname : ''}`,
    render: async () => cv});
}
$('wrap-btn').addEventListener('click', wrapped);

// ================= Riwayat (timeline) & cakupan kursi =================
let showUnv = false;
function renderCover() {
  const got = new Set(view().map(r => r.seat).filter(s => SEATS.has(s))).size, tot = SEATS.size, pct = Math.round(got / tot * 100);
  $('cover').innerHTML = `<div class="cov-t"><b>Kursi terisi <span data-cu="${got}">${got}</span> dari ${tot}</b><span data-cu="${pct}" data-suf="%">${pct}%</span></div>
    <div class="cov-bar"><i style="width:${pct}%"></i></div>
    <div class="cov-s"><span>${tot - got} kursi belum pernah ditempati</span>
    <button type="button" class="btn-s" id="cov-btn" aria-pressed="${showUnv}">${showUnv ? 'Tampilkan semua' : 'Sorot yang belum'}</button></div>`;
}
$('cover').addEventListener('click', e => {
  if (e.target.closest('#cov-btn')) { showUnv = !showUnv; renderChart(); }
});

function renderTimeline() {
  const el = $('timeline');
  if (!el) return;
  const all = [...records].sort(cmp);
  if ($('t-tab') && dataLoaded) $('t-tab').textContent = `Riwayat (${all.length})`;
  const q = ($('tl-q')?.value || '').trim().toLowerCase();
  const hay = r => [r.setlist, r.seat, r.date, r.sesi, r.note, ...extras(r).flatMap(x => [x.member, x.label]), ...(r.lineup || [])].join(' ').toLowerCase();
  const list = q ? all.filter(r => q.split(/\s+/).every(w => hay(r).includes(w))) : all; // semua kata harus cocok
  if ($('tl-info')) $('tl-info').textContent = q ? `${list.length} dari ${all.length} show` : '';
  const mon = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const numOf = new Map(all.slice().reverse().map((r, i) => [r.id, i + 1])); // nomor urut show sepanjang masa
  const perMon = {}; list.forEach(r => { const k = r.date.slice(0, 7); perMon[k] = (perMon[k] || 0) + 1; });
  let cur = '', curY = '', html = '', cnt = 0, grp = false; // tiap bulan dibungkus .tl-g: header bulan menempel hanya selama bulannya terlihat, lalu didorong keluar oleh bulan berikutnya (tidak bertumpuk)
  for (const r of list) {
    const ym = r.date.slice(0, 7), n = numOf.get(r.id), ms = n === 1 || n === 10 || n % 25 === 0; // milestone
    if (r.date.slice(0, 4) !== curY) { curY = r.date.slice(0, 4); if (grp) { html += '</div>'; grp = false; } html += `<div class="tl-yh">${esc(curY) || '–'}</div>`; }
    if (ym !== cur) {
      cur = ym;
      if (grp) html += '</div>';
      html += '<div class="tl-g">'; grp = true;
      html += `<h3 class="tl-mh"><span>${/^\d{4}-\d{2}$/.test(ym) ? mon[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4) : 'Tanpa tanggal'}</span><small>${perMon[ym]} show</small></h3>`;
    }
    const ex = extras(r), lt = lotInfo(r), ci = cnt++;
    html += `<div class="tl-i${ms ? ' ms' : ''}${ci < 8 ? ' a' : ''}" data-id="${r.id}" data-seat="${esc(r.seat)}" style="--i:${Math.min(ci, 8)}">
      <div class="tl-d"><b>${esc(r.date.slice(8)) || '–'}</b><span>${esc(r.sesi)}</span></div>
      <div class="tl-b"><div class="tl-t">${esc(r.setlist) || '(tanpa setlist)'}</div>
        ${ms || ex.length || lt || r.harga ? `<div class="tl-chips">${ms ? `<span class="tc star">Show ke-${n}</span>` : ''}${ex.map(x => `<span class="tc ${x.k}">${esc(x.label)}${x.member ? ' · ' + esc(x.member) : ''}</span>`).join('')}${lt ? `<span class="tc lot">${esc(lt)}</span>` : ''}${r.harga ? `<span class="tc">${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</span>` : ''}</div>` : ''}
        ${r.note ? `<div class="tl-n">“${esc(r.note)}”</div>` : ''}</div>
      <button type="button" class="seat-badge tl-s" data-seat="${esc(r.seat)}" aria-label="Lihat kursi ${esc(r.seat)}">${esc(r.seat)}</button></div>`;
  }
  if (grp) html += '</div>';
  flipRender(el, '.tl-i', it => it.dataset.id, () => { el.innerHTML = html || (q ? `<div class="empty">Tidak ada show yang cocok dengan “${esc($('tl-q').value.trim())}”<br><button type="button" class="btn-s" data-tlclear>Hapus pencarian</button></div>` : '<div class="empty">Belum ada riwayat</div>'); });
}
$('timeline')?.addEventListener('click', e => {
  const b = e.target.closest('[data-seat]'); // seluruh kartu bisa diketuk
  if (b) openSeat(b.dataset.seat);
});

let tlT; // jeda singkat supaya tidak render ulang di setiap ketikan
$('tl-q')?.addEventListener('input', () => { clearTimeout(tlT); tlT = setTimeout(renderTimeline, 150); });
$('timeline')?.addEventListener('click', e => { if (e.target.closest('[data-tlclear]')) { const i = $('tl-q'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true})); } });

// ================= Putar ulang, sebaran baris, biaya, kartu per show =================
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
let replayN = null, replayT = 0;
function stopReplay() {
  clearInterval(replayT); replayN = null;
  $('rp-btn').textContent = 'Putar ulang';
  renderChart();
}
function replay() { // peta terisi satu per satu sesuai urutan tanggal
  if (replayN !== null) return stopReplay();
  const list = records.filter(r => matchF(r)).sort((a, b) => cmp(b, a));
  if (!list.length) return;
  replayN = 0;
  replayT = setInterval(() => {
    if (++replayN > list.length) return stopReplay();
    renderChart();
    $('rp-btn').textContent = `Stop ${replayN}/${list.length} · ${fmtDate(list[replayN - 1].date)}`;
    if (replayN === 10 || replayN % 25 === 0) { $('rp-btn').textContent = '' + $('rp-btn').textContent; burst($('chart').querySelector(`[data-seat="${list[replayN - 1].seat}"]`)); }
  }, Math.min(400, Math.max(60, 4000 / list.length)));
}
$('rp-btn').addEventListener('click', replay);

function renderRows() {
  const c = {}, keys = Object.keys(COUNTS);
  viewEx(['row']).forEach(r => { const k = r.seat[0]; c[k] = (c[k] || 0) + 1; });
  const mx = Math.max(...keys.map(k => c[k] || 0), 1), sum = ks => ks.reduce((a, k) => a + (c[k] || 0), 0);
  $('rchart').innerHTML = keys.map((k, i) => `<div class="mc${filter.row === k ? ' on' : ''}"${c[k] ? ` data-row="${k}" role="button" tabindex="0"` : ''} style="--i:${i}" title="Baris ${k}: ${c[k] || 0} kali"><span class="mc-n">${c[k] || ''}</span><div class="mc-b"><i style="height:${(c[k] || 0) / mx * 100}%"></i></div><span class="mc-l">${k}</span></div>`).join('');
  $('rsum').textContent = `Depan (A–E): ${sum(keys.slice(0, 5))}× · Belakang (F–J): ${sum(keys.slice(5))}×`;
}

function fitFont(c, txt, max, size, wt) {
  do { c.font = `${wt} ${size}px ${CARD_F}`; size -= 2; } while (c.measureText(txt).width > max && size > 20);
}
// ================= Kartu bagikan: gambar kartu + lembar bagikan =================
// Gaya kartu mengikuti web: latar gelap + cahaya merah muda/oranye, kaca, hati piksel (seperti layar muat), foto ala polaroid galeri.
const CARD_F = "Inter,-apple-system,'Segoe UI',Roboto,sans-serif", CARD_H = "Caveat,'Segoe Print','Bradley Hand',cursive";
const PAPER = { // kertas polaroid sama dengan galeri: 2-Shot krem, Chekicha merah muda
  ts: {paper: '#f6f0e6', paper2: '#eadfca', accent: '#b4235a', tape: 'rgba(255,210,63,.85)'},
  ck: {paper: '#f9eef1', paper2: '#efdde2', accent: '#c2185b', tape: 'rgba(255,128,168,.85)'}
};
const HEART_PX = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000'];
const pxHeart = (c, x, y, s, col) => { c.fillStyle = col; HEART_PX.forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === '1') c.fillRect(x + i * s, y + j * s, s, s); }); };
const cardFonts = () => Promise.race([Promise.all(['900 64px Inter', '800 30px Inter', '600 30px Inter', '700 40px Caveat'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {}); // jangan menunggu lama kalau font gagal dimuat
const loadImg = src => new Promise(res => { const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
function fitTxt(c, txt, max, size, wt, fam = CARD_F, min = 22) { do { c.font = `${wt} ${size}px ${fam}`; size -= 2; } while (c.measureText(txt).width > max && size > min); }
function ellip(c, txt, max) { if (c.measureText(txt).width <= max) return txt; while (txt.length > 1 && c.measureText(txt + '…').width > max) txt = txt.slice(0, -1); return txt.trimEnd() + '…'; }
function lab(c, txt, x, y, font, col, align = 'left', ls = 4) { // teks kapital dengan jarak antarhuruf
  c.save(); c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = ls + 'px';
  c.fillText(txt, align === 'center' && 'letterSpacing' in c ? x + ls / 2 : x, y); c.restore();
}
function cardBg(c, W, H, seed) { // latar: gradasi gelap, cahaya, titik halus, dan hati piksel acak (tetap sama untuk show yang sama)
  const bg = c.createLinearGradient(0, 0, W * .6, H); bg.addColorStop(0, '#2a0612'); bg.addColorStop(.55, '#150810'); bg.addColorStop(1, '#0d090d');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  [[.15, .05, .8, 'rgba(255,42,95,.42)'], [.98, .38, .6, 'rgba(255,140,0,.2)'], [.7, 1, .85, 'rgba(136,19,55,.55)'], [0, .82, .55, 'rgba(120,70,255,.2)']].forEach(([gx, gy, gr, col]) => {
    const g = c.createRadialGradient(W * gx, H * gy, 0, W * gx, H * gy, W * gr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
  c.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) c.fillRect(x, y, 3, 3);
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rnd = () => (s = s * 48271 % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) pxHeart(c, rnd() * (W - 60), rnd() * (H - 60), 3 + Math.floor(rnd() * 3), i % 3 ? 'rgba(255,42,95,.16)' : 'rgba(255,210,63,.15)');
}
function glass(c, x, y, w, h, r = 30) { // permukaan kaca seperti kartu di web
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,.17)'); g.addColorStop(1, 'rgba(255,255,255,.05)');
  c.save(); rrect(c, x, y, w, h, r); c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.2)'; c.stroke();
  const hl = c.createLinearGradient(x, y, x, y + 40); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  c.beginPath(); c.roundRect(x + 2, y + 2, w - 4, 40, [r, r, 0, 0]); c.fillStyle = hl; c.fill(); c.restore();
}
function coverDraw(c, im, x, y, w, h, fy = .2) {
  const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
  c.drawImage(im, x + (w - dw) / 2, y + (h - dh) * fy, dw, dh);
}
function polaroid(c, o) { // o: {cx, cy, p (sisi foto), rot (derajat), k ('ts'|'ck'), img, name, tag}
  const p = o.p, pad = Math.round(p * .055), cap = Math.round(p * .26), W = p + pad * 2, H = pad + p + cap, K = PAPER[o.k] || PAPER.ts;
  c.save(); c.translate(o.cx, o.cy); c.rotate(o.rot * Math.PI / 180);
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 60; c.shadowOffsetY = 28;
  const g = c.createLinearGradient(0, -H / 2, 0, H / 2); g.addColorStop(0, K.paper); g.addColorStop(1, K.paper2);
  rrect(c, -W / 2, -H / 2, W, H, 10); c.fillStyle = g; c.fill();
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  const px = -W / 2 + pad, py = -H / 2 + pad;
  c.save(); rrect(c, px, py, p, p, 4); c.clip();
  if (o.img) coverDraw(c, o.img, px, py, p, p, .2);
  else { c.fillStyle = '#2a0f18'; c.fillRect(px, py, p, p); pxHeart(c, -p * .12, py + p * .4, Math.round(p / 36), '#ff2a5f'); }
  const v = c.createLinearGradient(0, py + p * .7, 0, py + p); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.2)');
  c.fillStyle = v; c.fillRect(px, py, p, p); c.restore();
  const y0 = py + p; // keterangan tulisan tangan
  c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#2a1a1f';
  fitTxt(c, o.name || '', p - 20, Math.round(p * .115), 700, CARD_H, 24);
  c.fillText(o.name || '', 0, y0 + cap * .52);
  c.font = `800 ${Math.round(p * .04)}px ${CARD_F}`;
  const tw = c.measureText(o.tag).width + 40, th = Math.round(p * .075), ty = y0 + cap * .64;
  rrect(c, -tw / 2, ty, tw, th, th / 2); c.fillStyle = K.accent; c.fill();
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(o.tag, 0, ty + th / 2 + 1); c.textBaseline = 'alphabetic';
  c.save(); c.translate(0, -H / 2 + 4); c.rotate(-2.5 * Math.PI / 180); c.fillStyle = K.tape; c.fillRect(-p * .17, -22, p * .34, 44); c.restore(); // selotip
  c.restore();
}
// fmt: 'feed' (1080x1350, 4:5) atau 'story' (1080x1920, 9:16; isi tetap di zona aman Story Instagram)
async function drawShowCard(r, fmt) {
  await cardFonts();
  const story = fmt === 'story', W = 1080, H = story ? 1920 : 1350, dy = story ? 190 : 0;
  const pics = extras(r).filter(x => x.photo).slice(0, 2), imgs = await Promise.all(pics.map(x => loadImg(x.photo)));
  const p1 = story ? 560 : 470, gy = Math.round((p1 - 470) * 1.37), Y = v => v + dy + gy; // Y: posisi di bawah polaroid
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  cardBg(c, W, H, r.id);
  const all = [...records].sort(cmp).reverse(), n = all.findIndex(x => x.id === r.id) + 1, ms = n === 1 || n === 10 || n % 25 === 0;
  const mine = records.filter(x => x.seat === r.seat).sort((a, b) => a.date.localeCompare(b.date) || (SO[a.sesi] || 0) - (SO[b.sesi] || 0));
  const ord = mine.findIndex(x => x.id === r.id) + 1, tot = mine.length;
  const counts = {}; records.forEach(x => counts[x.seat] = (counts[x.seat] || 0) + 1);
  // header: hati piksel + nama web, lencana nomor show
  pxHeart(c, 70, 52 + dy, 5, '#ff2a5f');
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = `800 30px ${CARD_F}`; c.fillText(ellip(c, document.querySelector('h1').textContent, 560), 126, 70 + dy);
  const bt = (ms ? '★ ' : '') + 'SHOW KE-' + n;
  c.save(); if ('letterSpacing' in c) c.letterSpacing = '3px'; c.font = `800 24px ${CARD_F}`;
  const bw = c.measureText(bt).width + 56; rrect(c, W - 70 - bw, 40 + dy, bw, 60, 30);
  c.fillStyle = ms ? '#ffd23f' : 'rgba(255,255,255,.1)'; c.fill(); c.lineWidth = 2; c.strokeStyle = ms ? '#fff3b0' : 'rgba(255,255,255,.22)'; c.stroke();
  c.fillStyle = ms ? '#1a0f00' : '#fff'; c.textAlign = 'center'; c.fillText(bt, W - 70 - bw / 2, 71 + dy); c.restore();
  c.textBaseline = 'alphabetic';
  // inti kartu: polaroid (1 atau 2 foto) atau denah besar jika tidak ada foto
  const midY = 500 + dy + gy / 2;
  if (pics.length === 1) polaroid(c, {cx: W / 2, cy: midY, p: p1, rot: -2.5, k: pics[0].k, img: imgs[0], name: pics[0].member, tag: pics[0].label});
  else if (pics.length === 2) {
    const p2 = story ? 440 : 380;
    pics.forEach((x, i) => polaroid(c, {cx: W / 2 + (i ? 1 : -1) * p2 * .5, cy: midY + (i ? 14 : -10), p: p2, rot: i ? 4.5 : -5, k: x.k, img: imgs[i], name: x.member, tag: x.label}));
  } else {
    const hy = 160 + dy, hh = 650 + gy;
    glass(c, 70, hy, 940, hh, 40);
    lab(c, 'S T A G E', W / 2, hy + 62, `800 22px ${CARD_F}`, '#ff2a5f', 'center', 2);
    drawMiniMap(c, W / 2, hy + 90, 26, 3.5, counts, r.seat, 6);
    const sg = c.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0); sg.addColorStop(0, '#ffd23f'); sg.addColorStop(1, '#ff8c00');
    c.textAlign = 'center'; c.fillStyle = sg; c.font = `900 150px ${CARD_F}`; c.fillText(r.seat, W / 2, hy + 420 + (hh - 420) / 2 + 48);
  }
  // judul, tanggal, keterangan
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const title = r.setlist || '(tanpa setlist)'; fitTxt(c, title, W - 140, 76, 900);
  const tw = c.measureText(title).width, tg = c.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0); tg.addColorStop(0, '#ff5c87'); tg.addColorStop(1, '#ffb347');
  c.shadowColor = 'rgba(255,42,95,.45)'; c.shadowBlur = 30; c.fillStyle = tg; c.fillText(title, W / 2, Y(915)); c.shadowBlur = 0;
  const d = new Date(r.date + 'T00:00:00'), tgl = isNaN(d) ? r.date : d.toLocaleDateString('id-ID', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  c.fillStyle = '#e4e4e7'; c.font = `600 34px ${CARD_F}`; c.fillText(tgl + (r.sesi ? '  ·  ' + r.sesi : ''), W / 2, Y(975));
  let ly = 1030;
  extras(r).filter(x => !x.photo).forEach(x => { if (ly > 1050) return; c.fillStyle = '#34d399'; c.font = `700 32px ${CARD_F}`; c.fillText(ellip(c, `${x.label} dengan ${x.member}`, W - 160), W / 2, Y(ly)); ly += 46; });
  if (r.note && ly <= 1050) { c.fillStyle = '#ffb0c4'; fitTxt(c, `“${r.note}”`, W - 180, 46, 700, CARD_H, 28); c.fillText(ellip(c, `“${r.note}”`, W - 180), W / 2, Y(ly + 4)); }
  // panel bawah
  const py = Y(1090);
  glass(c, 70, py, 940, 190, 36);
  if (pics.length) {
    lab(c, 'KURSI', 112, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    const gs = c.createLinearGradient(112, 0, 340, 0); gs.addColorStop(0, '#ffd23f'); gs.addColorStop(1, '#ff8c00');
    c.textAlign = 'left'; c.fillStyle = gs; c.font = `900 100px ${CARD_F}`; c.fillText(r.seat, 108, py + 138);
    c.fillStyle = '#c9c9d1'; c.font = `600 24px ${CARD_F}`; c.fillText(`kunjungan ke-${ord} dari ${tot}`, 112, py + 174);
    drawMiniMap(c, 790, py + 27, 11, 1.5, counts, r.seat, 3);
  } else {
    lab(c, 'SESI', 112, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `900 70px ${CARD_F}`; c.fillText(r.sesi || '-', 110, py + 140);
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(540, py + 36, 2, 118);
    lab(c, 'DI KURSI INI', 586, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    c.fillStyle = '#ffd23f'; c.font = `900 70px ${CARD_F}`; c.fillText('ke-' + ord, 584, py + 140);
    const kw = c.measureText('ke-' + ord).width; c.fillStyle = '#c9c9d1'; c.font = `600 28px ${CARD_F}`; c.fillText(`dari ${tot}×`, 584 + kw + 14, py + 140);
  }
  if (!story && /^https?:/i.test(location.protocol)) { // alamat web di kaki kartu (hanya feed; Story punya zona bawah yang tertutup UI)
    c.textAlign = 'center'; c.fillStyle = '#9a9aa4'; c.font = `600 24px ${CARD_F}`; c.fillText(location.host, W / 2, 1322);
    const hw = c.measureText(location.host).width / 2;
    pxHeart(c, W / 2 - hw - 46, 1304, 3, '#ff2a5f'); pxHeart(c, W / 2 + hw + 22, 1304, 3, '#ff2a5f');
  }
  return cv;
}

// ---------- lembar bagikan: simpan, WhatsApp, X, Instagram, LINE ----------
const SH = {o: null, fmt: 'feed', blob: null, file: null, url: '', tok: 0};
const SH_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const shTouch = () => matchMedia('(pointer:coarse)').matches;
const shNative = () => !!(SH.file && navigator.share && navigator.canShare && navigator.canShare({files: [SH.file]}));
const shHint = t => { const h = $('sh-hint'); if (h) h.textContent = t || ''; };
const SH_ENC = encodeURIComponent;
const SH_APPS = { // url = tujuan di desktop / peramban tanpa dukungan kirim berkas (browser tidak bisa melampirkan gambar ke aplikasi lain)
  wa: {name: 'WhatsApp', url: t => 'https://wa.me/?text=' + SH_ENC(t)},
  'x-post': {name: 'X', url: t => 'https://x.com/intent/post?text=' + SH_ENC(t)},
  'x-dm': {name: 'DM di X', url: () => 'https://x.com/messages/compose'},
  'ig-story': {name: 'Story Instagram', url: () => 'https://www.instagram.com/'},
  'ig-dm': {name: 'DM Instagram', url: () => 'https://www.instagram.com/direct/inbox/'},
  line: {name: 'LINE', url: t => 'https://line.me/R/msg/text/?' + SH_ENC(t)}
};
const SH_SVG = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L8 8m4-4l4 4M6 12v6.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8l-1.2 4.2 4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8.5c.3 3.3 2.3 5.3 6.2 6.3l1-1.3-2-1-.9.8c-1-.4-1.9-1.3-2.3-2.3l.8-.9-1-2z" fill="#fff"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-linecap="round"><path d="M5 4.5l14 15" stroke-width="2.4"/><path d="M19 4.5L5 19.5" stroke-width="1.6"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9"><rect x="4.5" y="4.5" width="15" height="15" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.7" cy="7.3" r="1.1" fill="#fff" stroke="none"/></svg>',
  line: '<svg viewBox="0 0 24 24"><path d="M12 4C7.6 4 4 6.9 4 10.5c0 3.2 2.8 5.8 6.6 6.4.3.1.6.2.7.5l-.1 1.5c0 .4.3.6.7.4 1.7-.9 5.4-3.4 7-5.6.9-1 1.1-1.8 1.1-2.7C20 6.9 16.4 4 12 4z" fill="#fff"/></svg>'
};
function shEnsure() {
  if ($('share-sheet')) return;
  const row = (ic, bg, name, sub, acts) => acts.length === 1 && !acts[0][2]
    ? `<button type="button" class="sh-row" data-a="${acts[0][0]}"><span class="sh-ic" style="background:${bg}">${SH_SVG[ic]}</span><span class="sh-tx"><b>${name}</b><span>${sub}</span></span></button>`
    : `<div class="sh-row"><span class="sh-ic" style="background:${bg}">${SH_SVG[ic]}</span><span class="sh-tx"><b>${name}</b><span>${sub}</span></span><span class="sh-chips">${acts.map(a => `<button type="button" class="sh-chip" data-a="${a[0]}">${a[1]}</button>`).join('')}</span></div>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="overlay" id="share-sheet"><div class="modal sh-modal" role="dialog" aria-modal="true" aria-labelledby="sh-title">
    <div class="sheet-grip" aria-hidden="true"></div><button type="button" class="x" id="sh-close" aria-label="Tutup">&times;</button>
    <h3 id="sh-title" class="sh-title">Bagikan kartu</h3>
    <div class="sh-body">
      <div class="sh-left"><div class="sh-seg" id="sh-seg"><button type="button" data-f="feed" class="on">Feed 4:5</button><button type="button" data-f="story">Story 9:16</button></div>
        <div class="sh-prev" id="sh-prev"><img id="sh-img" alt="Pratinjau kartu"></div></div>
      <div class="sh-right"><div class="sh-list" id="sh-list" aria-busy="true">
        ${row('save', 'linear-gradient(135deg,#ff2a5f,#ff8c00)', 'Simpan', 'Ke galeri / perangkat', [['save', '', 0]])}
        ${row('share', 'linear-gradient(135deg,#7c5cff,#ff2a5f)', 'Bagikan', 'WhatsApp, Instagram, X, LINE, dll.', [['more', '', 0]]).replace('class="sh-row"', 'class="sh-row sh-only"')}
        ${row('wa', '#25d366', 'WhatsApp', 'Kirim ke chat', [['wa', '', 0]])}
        ${row('x', '#000', 'X', 'Post atau pesan', [['x-post', 'Post'], ['x-dm', 'DM']])}
        ${row('ig', 'linear-gradient(45deg,#feda75,#fa7e1e 30%,#d62976 60%,#4f5bd5)', 'Instagram', 'Story atau pesan', [['ig-story', 'Story'], ['ig-dm', 'DM']])}
        ${row('line', '#06c755', 'LINE', 'Kirim ke chat', [['line', '', 0]])}
      </div>
      <div class="sh-more"><button type="button" class="btn-s" data-a="copy">Salin gambar</button><button type="button" class="btn-s" data-a="more" hidden>Lainnya…</button></div>
      <p class="sh-hint" id="sh-hint" role="status" aria-live="polite"></p></div>
    </div></div></div>`);
  const sh = $('share-sheet'), m = sh.querySelector('.modal');
  sh.querySelectorAll('.sh-list > .sh-row:not(.sh-only):not(:first-child)').forEach(e => e.classList.add('sh-app')); // di HP/tablet hanya Simpan + Bagikan
  $('sh-close').addEventListener('click', () => closeEl('share-sheet'));
  sh.addEventListener('click', e => { if (e.target === sh) closeEl('share-sheet'); });
  $('sh-seg').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b || b.dataset.f === SH.fmt) return; SH.fmt = b.dataset.f; shRender(); });
  sh.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) shAct(b.dataset.a); });
  let y0 = 0, dy = 0, on = false; // tarik gagang ke bawah untuk menutup (HP)
  m.addEventListener('touchstart', e => { on = innerWidth <= 600 && !!e.target.closest('.sheet-grip,.sh-title') && e.touches.length === 1; y0 = e.touches[0].clientY; dy = 0; if (on) m.style.transition = 'none'; }, {passive: true});
  m.addEventListener('touchmove', e => { if (!on) return; dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = `translate3d(0,${dy}px,0)`; }, {passive: true});
  m.addEventListener('touchend', () => { if (!on) return; on = false; m.style.transition = ''; if (dy > 90) { closeEl('share-sheet'); setTimeout(() => { m.style.transform = ''; }, 320); } else m.style.transform = ''; });
}
async function shRender() {
  const t = ++SH.tok, img = $('sh-img'), prev = $('sh-prev');
  $('sh-list').setAttribute('aria-busy', 'true'); img.classList.remove('ok'); prev.classList.remove('ld');
  [...$('sh-seg').children].forEach(b => b.classList.toggle('on', b.dataset.f === SH.fmt));
  prev.style.setProperty('--ar', SH.fmt === 'story' ? '9 / 16' : '4 / 5');
  shHint('Membuat kartu…');
  try {
    const cv = await SH.o.render(SH.fmt); if (t !== SH.tok) return;
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png')); if (t !== SH.tok) return;
    if (SH.url) URL.revokeObjectURL(SH.url);
    SH.blob = blob; SH.url = URL.createObjectURL(blob);
    const name = typeof SH.o.file === 'function' ? SH.o.file(SH.fmt) : SH.o.file;
    try { SH.file = new File([blob], name, {type: 'image/png'}); } catch (e) { SH.file = null; }
    SH.name = name; img.src = SH.url; img.classList.add('ok'); prev.classList.add('ld');
    $('sh-list').removeAttribute('aria-busy');
    const nat = shTouch() && shNative();
    $('sh-list').classList.toggle('sh-simple', nat); $('share-sheet').querySelector('.sh-more').hidden = nat; $('share-sheet').querySelector('.sh-more [data-a=more]').hidden = !shNative();
    shHint(nat ? 'Pilih aplikasinya di daftar bagikan yang muncul.' : shTouch() ? 'Browser ini belum bisa mengirim gambar langsung ke aplikasi: gambar akan disalin, lalu tinggal ditempel.' : 'Di komputer, gambar disalin otomatis lalu aplikasinya dibuka. Tinggal tempel (Ctrl+V).');
  } catch (e) { if (t === SH.tok) shHint('Kartu gagal dibuat. Coba lagi.'); }
}
// o: {title, formats (tampilkan pilihan Feed/Story), file (nama / fungsi(fmt)), text, render(fmt) -> canvas}
function openShare(o) {
  shEnsure(); SH.o = o; SH.fmt = 'feed'; SH.blob = SH.file = null;
  $('sh-title').textContent = o.title || 'Bagikan kartu';
  $('sh-seg').hidden = !o.formats;
  openEl('share-sheet'); if (!shTouch()) $('sh-close').focus({preventScroll: true});
  shRender();
}
function shDownload() {
  const a = document.createElement('a'); a.download = SH.name; a.href = SH.url; document.body.appendChild(a); a.click(); a.remove();
}
async function shCopy(show) {
  try { await navigator.clipboard.write([new ClipboardItem({'image/png': SH.blob})]); if (show) shHint('Gambar disalin. Tempel di aplikasi tujuan.'); return true; }
  catch (e) { if (show) shHint('Browser ini belum bisa menyalin gambar. Pakai Simpan.'); return false; }
}
async function shAct(a) {
  if (!SH.blob || $('sh-list').getAttribute('aria-busy') === 'true') return;
  const text = typeof SH.o.text === 'function' ? SH.o.text(SH.fmt) : SH.o.text;
  if (a === 'copy') return shCopy(true);
  if (a === 'more') { try { await navigator.share({files: [SH.file], text}); } catch (e) {} return; }
  if (a === 'save') {
    if (SH_IOS && shTouch() && shNative()) { shHint('Pilih “Simpan Gambar” untuk menyimpannya ke Foto.'); try { await navigator.share({files: [SH.file]}); } catch (e) {} return; }
    shDownload(); shHint(shTouch() ? 'Tersimpan. Cek galeri atau folder Unduhan.' : 'Tersimpan di folder Unduhan.'); return;
  }
  const app = SH_APPS[a]; if (!app) return;
  if (shTouch() && shNative()) { shHint(`Pilih ${app.name} di daftar bagikan.`); try { await navigator.share({files: [SH.file], text}); } catch (e) {} return; }
  const copied = shCopy(false); // dimulai sekarang juga (masih dalam ketukan), lalu tab tujuan dibuka
  window.open(app.url(text), '_blank', 'noopener');
  if (await copied) shHint(`Gambar disalin. Tempel (Ctrl+V atau tahan lalu Tempel) di ${app.name}.`);
  else { shDownload(); shHint(`Gambar disimpan karena tidak bisa disalin. Lampirkan manual di ${app.name}.`); }
}
function shareCard(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const site = /^https?:/i.test(location.protocol) ? '\n' + location.origin + location.pathname : '';
  openShare({
    title: 'Bagikan kartu show', formats: true,
    file: f => `show-${r.date}-${r.seat}${f === 'story' ? '-story' : ''}.png`,
    text: `${r.setlist || 'Show'} · ${fmtDate(r.date)} · Kursi ${r.seat}\n${document.querySelector('h1').textContent}${site}`,
    render: f => drawShowCard(r, f)
  });
}
$('modal-hist').addEventListener('click', e => {
  const b = e.target.closest('[data-share]');
  if (b) shareCard(+b.dataset.share);
});

// ================= Sorot cahaya peta & kartu "terakhir nonton" =================
const stg = $('stage-container');
stg.addEventListener('mousemove', e => { // posisi dalam persen supaya aman dari efek zoom
  if (!canHover.matches) return;
  const b = stg.getBoundingClientRect();
  stg.style.setProperty('--mx', (e.clientX - b.left) / b.width * 100 + '%');
  stg.style.setProperty('--my', (e.clientY - b.top) / b.height * 100 + '%');
  stg.style.setProperty('--sp', 1);
});
stg.addEventListener('mouseleave', () => stg.style.setProperty('--sp', 0));

function renderLast() {
  const r = [...records].sort(cmp)[0], el = $('last');
  if (!r) { el.innerHTML = ''; return; }
  const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(r.date + 'T00:00:00')) / 864e5);
  const ago = isNaN(d) ? '' : d < 0 ? `${-d} hari lagi` : d === 0 ? 'Hari ini' : `${d} hari yang lalu`;
  const ph = extras(r).find(x => x.photo);
  el.innerHTML = `<div class="last-c">
    ${ph ? `<div class="last-ph"><img src="${esc(thumbOf(ph.photo))}" data-full="${esc(ph.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto show terakhir" data-cap="${esc(ph.label)} dengan ${esc(ph.member)}" data-sub="${esc([r.setlist, fmtDate(r.date), r.sesi, 'Kursi ' + r.seat].filter(Boolean).join(' · '))}"></div>` : `<div class="last-s">${esc(r.seat)}</div>`}
    <div class="last-b"><span class="last-l">Terakhir nonton</span><b>${esc(r.setlist) || '(tanpa setlist)'}</b>
      <span>${esc(fmtDate(r.date))}${r.sesi ? ' · ' + esc(r.sesi) : ''} · Kursi <button type="button" class="seat-badge tl-s" data-seat="${esc(r.seat)}">${esc(r.seat)}</button></span></div>
    <div class="last-a">${esc(ago)}</div></div>`;
}
$('last').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});

// ================= Tiket, lotre, & event (EXCLUSIVE / EVENT) =================
let tickets = []; // diisi halaman: index dari data.json, admin dari localStorage
// nama kategori lama -> baru, supaya pilihan manual yang sudah tersimpan tidak rusak ('' = kembali otomatis)
const CAT_OLD = {'Meet & Greet (Event)': '2S & MnG Event', '2-Shot (Event)': '2S & MnG Event', 'Meet & Greet Theater Sementara': '2S & MnG Theater Sementara', '2-Shot Theater Sementara': '2S & MnG Theater Sementara', 'Event OFC / School': ''};
const fixCat = c => Object.hasOwn(CAT_OLD, c) ? CAT_OLD[c] : c;
const sanitizeTicket = t => {
  t = t || {};
  const up = s => String(s ?? '').trim();
  return {
    k: up(t.k), type: ['SHOW', 'EXCLUSIVE', 'EVENT'].includes(t.type) ? t.type : 'EVENT',
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '', name: up(t.name), start: up(t.start).slice(0, 5),
    used: Math.max(0, Number(t.used) || 0), raffle: up(t.raffle).toUpperCase(),
    member: up(t.member), lane: up(t.lane), session: up(t.session), bought: Math.max(1, Number(t.bought) || 1), cat: fixCat(up(t.cat)), status: up(t.status), tx: up(t.tx).slice(0, 12),
    photo: okPhoto(t.photo) ? t.photo : '' // foto 2-Shot event (opsional), diunggah dari admin tanpa input tanggal lagi
  };
};
const raffleOf = s => !s ? '' : /WIN|WON|MENANG/.test(s) ? 'win' : /LOSE|LOST|KALAH/.test(s) ? 'lose' : 'other';
function lotteryStats(list) { // persentase menang = menang / (menang + kalah); status lain tidak dihitung
  const s = {win: 0, lose: 0, other: 0, raw: {}, by: {}};
  // kelompok lotre: show teater (termasuk Theater Event seperti JKT48 School) dan kategori event lain
  const grp = t => (t.type === 'SHOW' || tcat(t) === 'Theater Event') ? 'Show teater' : tcat(t);
  list.forEach(t => {
    const c = raffleOf(t.raffle);
    if (!c) return;
    s[c]++;
    (s.by[grp(t)] = s.by[grp(t)] || {win: 0, lose: 0, other: 0})[c]++;
    if (c === 'other') s.raw[t.raffle] = (s.raw[t.raffle] || 0) + 1;
  });
  // jkt48.com hanya memberi status kalah (LOSE). Di jenis yang punya lotre, tiket tanpa status dihitung menang (perkiraan).
  // hanya kelompok yang punya entri kalah yang diperkirakan; tiket Exclusive (video call, M&G) tidak dihitung sebagai lotre
  const lt = new Set(list.filter(t => raffleOf(t.raffle)).map(grp));
  s.inferred = 0;
  list.forEach(t => {
    if (raffleOf(t.raffle) || t.type === 'EXCLUSIVE' || !lt.has(grp(t))) return;
    s.win++; s.inferred++;
    (s.by[grp(t)] = s.by[grp(t)] || {win: 0, lose: 0, other: 0}).win++;
  });
  s.total = s.win + s.lose + s.other;
  s.pct = s.win + s.lose ? s.win / (s.win + s.lose) * 100 : 0;
  return s;
}

// kategori tiket: ditebak dari nama (data jkt48.com tidak punya kolom kategori); bisa diatur manual lewat t.cat
// kategori yang jumlah tiketnya disembunyikan di halaman publik (hanya terlihat di admin)
const BLUR_CATS = ['Video Call', '2S & MnG Event', '2S & MnG Theater Sementara'];
const TK_CATS = ['Video Call', '2S & MnG Event', '2S & MnG Theater Sementara', 'OFC Event', 'Theater Event', 'Belum dikategorikan'];
const VC_NAMES = /cheerful little wishes|think donut|heart & harmony|code journal|cake a wish|the first snow|youthful days|we are love/i;
function autoCat(t) {
  const n = (t.name || '').toLowerCase();
  if (/video call|digital photobook|theater sementara/.test(n) || VC_NAMES.test(n)) return 'Video Call'; // tiket bernama "Theater Sementara" ternyata video call
  if (/ofc event/.test(n)) return 'OFC Event';
  if (t.type === 'EVENT') return 'Theater Event'; // sisa tiket berjenis EVENT (mis. JKT48 School)
  if (/team passion/.test(n)) return '2S & MnG Theater Sementara'; // M&G dan 2-Shot Team Passion (Yogyakarta)
  if (/2[- ]?shot|meet\s*(and|&)\s*greet/.test(n)) return '2S & MnG Event';
  if (/ - \d{1,2}(st|nd|rd|th) [a-z]{3}/.test(n)) return 'Video Call'; // pola nama seri video call (tebakan)
  return 'Belum dikategorikan';
}
const tcat = t => t.cat || (t.type === 'SHOW' ? 'Show Teater' : autoCat(t));
const tname = t => t.name.replace(/\s*[-,]\s*\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}(\s+\d{4})?\s*$/, '').trim() || t.name; // nama tanpa tanggal

// hubungkan riwayat show dengan tiket lotre di tanggal & sesi yang sama
function lotInfo(r) {
  const ts = tickets.filter(t => (t.type === 'SHOW' || tcat(t) === 'Theater Event') && t.date === r.date && (!r.sesi || (parseInt(t.start) < 17 ? 'Siang' : 'Malam') === r.sesi));
  if (!ts.length) return '';
  const lose = ts.filter(t => raffleOf(t.raffle) === 'lose').length, win = ts.length - lose;
  if (!ts.some(t => t.type === 'SHOW')) return `Lotre: ${win} menang${lose ? ` · ${lose} kalah` : ''}`; // event teater (mis. JKT48 School)
  // aturan: menang OFC = tidak boleh daftar General; kalah OFC lalu daftar General = ada 2 entri; hanya 1 entri kalah = cuma daftar OFC
  return '' + (win && !lose ? 'Menang di OFC' : win ? 'Kalah di OFC → menang di General' : lose >= 2 ? 'Kalah di OFC & General' : 'Kalah di OFC (tidak daftar General)');
}

// statistik alur lotre show teater per slot (tanggal + jam + setlist): OFC dulu, lalu General bagi yang kalah
function lotFlowStats() {
  const m = new Map();
  tickets.filter(t => t.type === 'SHOW').forEach(t => {
    const k = t.date + '|' + t.start + '|' + t.name, o = m.get(k) || {win: 0, lose: 0};
    raffleOf(t.raffle) === 'lose' ? o.lose++ : o.win++;
    m.set(k, o);
  });
  const s = {n: m.size, ofcWin: 0, genWin: 0, genLose: 0, ofcOnly: 0};
  m.forEach(o => { if (o.win && !o.lose) s.ofcWin++; else if (o.win) s.genWin++; else if (o.lose >= 2) s.genLose++; else s.ofcOnly++; });
  s.genTry = s.genWin + s.genLose; s.ofcLose = s.n - s.ofcWin; s.got = s.ofcWin + s.genWin;
  return s;
}
const lotHtml = r => { const t = lotInfo(r); return t ? `<div class="lt">${esc(t)}</div>` : ''; };
let evCat = '', evLimit = 12, rkAll = false;
const EV_PAGE = 12; // jumlah seri per tampilan
let dataLoaded = false; // false selama data masih dimuat
function renderTicketsRaw() {
  const box = $('lot');
  if (!box) return;
  $('ev-tab').hidden = dataLoaded && !tickets.length; // tetap tampil selama data dimuat; disembunyikan hanya jika data.json memang tanpa tiket
  const ls = lotteryStats(tickets), done = ls.win + ls.lose;
  // tiket event teater (JKT48 School dll.) ikut kelompok "Show teater" di kartu atas; beri tahu supaya selisih 48 vs 45 jelas
  const te = tickets.filter(t => t.type !== 'SHOW' && tcat(t) === 'Theater Event'), tw = te.length ? lotteryStats(te) : null;
  const teNote = tw && tw.win + tw.lose ? `<p class="lot-n">Angka "Show teater" memasukkan ${tw.win} menang dan ${tw.lose} kalah dari tiket event teater (${[...new Set(te.map(tname))].map(esc).join(', ')}). Alur OFC → General dan rincian per setlist hanya menghitung tiket show.</p>` : '';
  const refs = tickets.filter(t => t.status === 'refund'); // menang undian tapi show dibatalkan & di-refund
  const names = {SHOW: 'Show teater', EXCLUSIVE: 'Exclusive / M&G', EVENT: 'Event'};
  const card = (l, v, s, c = '', n = null, fmt = '') => `<div class="stat${c}"><div class="sv"${typeof v === 'number' ? ` data-cu="${v}"` : n !== null ? ` data-cu="${n}" data-fmt="${fmt}"` : ''}>${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${esc(s)}</div>` : ''}</div>`;
  const sh = ls.by['Show teater'], shDone = sh ? sh.win + sh.lose : 0;
  const bs = {}; // lotre per setlist (tiket show)
  tickets.filter(t => t.type === 'SHOW').forEach(t => { const o = bs[t.name] || (bs[t.name] = {win: 0, lose: 0}); raffleOf(t.raffle) === 'lose' ? o.lose++ : o.win++; });
  const bsList = Object.entries(bs).map(([n, o]) => [n, o, o.win + o.lose])
    .sort((a, b) => b[1].win - a[1].win || b[1].win / b[2] - a[1].win / a[2] || b[2] - a[2] || a[0].localeCompare(b[0])); // menang terbanyak dulu; seri: persentase, lalu jumlah percobaan
  const maxWin = Math.max(1, ...bsList.map(x => x[1].win)); // bar = jumlah menang dibanding yang tertinggi, jadi sejalan dengan urutan
  const bsHtml = bsList.length ? '<h3 class="sec2">Lotre per setlist</h3>' + bsList.map(([n, o, d]) => {
    const p = o.win / d * 100;
    return `<div class="ls-r"><span class="ls-n">${esc(n)}</span><span class="ls-b"><i style="width:${o.win / maxWin * 100}%"></i></span><span class="ls-c">${o.win} menang · ${o.lose} kalah (${Math.round(p)}%)</span></div>`;
  }).join('') : '';
  const fl = lotFlowStats(), pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const flowHtml = fl.n ? '<h3 class="sec2">Alur lotre show teater: OFC → General</h3>' + [
    ['Tahap OFC', pc(fl.ofcWin, fl.n), `${fl.ofcWin} menang dari ${fl.n} show (${pc(fl.ofcWin, fl.n)}%)`],
    ['Tahap General', pc(fl.genWin, fl.genTry), `${fl.genWin} menang dari ${fl.genTry} yang didaftar (${pc(fl.genWin, fl.genTry)}%)`],
    ['Dapat tiket', pc(fl.got, fl.n), `${fl.got} dari ${fl.n} show (${pc(fl.got, fl.n)}%)`]
  ].map(([l, p, t0], i, _a, t = String(t0).replace(/\d+/g, n => `<b data-n="${n}">${n}</b>`)) => `<div class="lot-r fl" style="--i:${i}"><span>${l}</span><span class="sl-bar"><i style="width:${p}%"></i></span><span>${t}</span></div>`).join('') +
    `<p class="lot-n">${fl.ofcLose} show kalah di OFC: ${fl.genTry} lanjut daftar General (${fl.genWin} menang, ${fl.genLose} kalah) dan ${fl.ofcOnly} hanya mendaftar sekali di OFC.</p>` : '';
  const shPct = shDone ? sh.win / shDone * 100 : 0;
  const shCard = shDone ? `<div class="stat main"><div class="ring" style="--p:${shPct.toFixed(1)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rb" cx="18" cy="18" r="15.9"/><circle class="rf" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span data-cu="${shPct.toFixed(1)}" data-fmt="pct1">${shPct.toFixed(1).replace(/\.0$/, '')}%</span></div><div class="sl">Persentase menang (show teater)</div><div class="ss">${sh.win} dari ${shDone} yang sudah diundi${tw && tw.win + tw.lose ? ' · termasuk ' + (tw.win + tw.lose) + ' tiket event teater' : ''}</div></div>` : '';
  box.innerHTML = !ls.total ? '<div class="empty">Belum ada data lotre</div>' :
    `<div class="lot-cards">${shCard}${card('Entri lotre', ls.total)}${card(ls.inferred ? 'Menang (perkiraan)' : 'Menang', ls.win, refs.length ? `${refs.length} dibatalkan & di-refund` : '')}${card('Kalah', ls.lose)}${card('Persentase menang (semua jenis)', done ? ls.pct.toFixed(1) + '%' : '-', done ? `${ls.win} dari ${done} yang sudah diundi` : '', '', done ? ls.pct : null, 'pct1')}</div>` +
    Object.entries(ls.by).map(([ty, b]) => {
      const d = b.win + b.lose, p = d ? b.win / d * 100 : 0;
      return `<div class="lot-r"><span>${names[ty] || esc(ty)}</span><span class="sl-bar"><i style="width:${p}%"></i></span><span>${b.win ? b.win + ' menang' : '0 menang terdeteksi'} · ${b.lose} kalah${d && b.win ? ` (${p.toFixed(0)}%)` : ''}</span></div>`;
    }).join('') + flowHtml + bsHtml +
    teNote +
    (ls.inferred ? '<p class="lot-n">Menang dihitung dari tiket tanpa status kalah pada show/event yang punya lotre, karena jkt48.com tidak memberi status menang. Tiket yang dibeli langsung tanpa lotre ikut terhitung.</p>' : '') +
    (refs.length ? `<p class="lot-n">Menang undian tapi dibatalkan dan di-refund: ${refs.map(t => esc(fmtDate(t.date) + ' ' + t.name)).join(', ')}.</p>` : '') +
    (ls.other ? `<p class="lot-n">Status lain (belum diundi / tidak dikenali): ${Object.entries(ls.raw).map(([k, n]) => `${esc(k)} ×${n}`).join(', ')}</p>` : '');
  // kumpulkan semua catatan kecil ke satu bagian yang bisa dibuka (hemat tempat)
  const notes = [...box.querySelectorAll('.lot-n')];
  if (notes.length) {
    const d = document.createElement('details');
    d.className = 'lot-notes';
    d.innerHTML = `<summary>ⓘ Catatan perhitungan (${notes.length})</summary>`;
    notes.forEach(n => d.appendChild(n));
    box.appendChild(d);
  }

  const ev = tickets.filter(t => t.type !== 'SHOW');
  if (dataLoaded) $('ev-tab').textContent = `Tiket & Event (${ev.length})`;
  const td = new Date().toISOString().slice(0, 10);
  const sel = $('ev-member'), cur = sel.value, st = $('ev-status').value;
  sel.innerHTML = '<option value="">Semua member</option>' + [...new Set(ev.map(t => t.member).filter(Boolean))].sort().map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');

  // kartu kategori = ringkasan sekaligus filter
  const stat = {};
  ev.forEach(t => { const c = tcat(t), o = stat[c] || (stat[c] = {n: 0, s: new Set()}); o.n++; o.s.add(tname(t)); });
  const cards = [['', 'Semua', ev.length, new Set(ev.map(tname)).size], ...TK_CATS.filter(c => stat[c]).map(c => [c, c, stat[c].n, stat[c].s.size])], cn = cards.length;
  $('ev-cats').style.setProperty('--cols', cn <= 4 ? cn : cn === 5 ? 5 : cn % 3 === 0 ? 3 : 4); // mis. 6 kartu = 3 x 2, 7 kartu = 4 + 3
  $('ev-cats').innerHTML = cards
    .map(([k, l, n, z]) => `<button type="button" class="ev-c${k === evCat ? ' on' : ''}" data-cat="${esc(k)}" aria-pressed="${k === evCat}"><b data-cu="${n}">${n}</b><span>${esc(l)}</span><small>${z} seri</small></button>`).join('');

  // kelompokkan tiket per seri (kategori + nama tanpa tanggal)
  const grouper = arr => {
    const m = new Map();
    arr.forEach(t => { const k = tcat(t) + '|' + tname(t); if (!m.has(k)) m.set(k, {name: tname(t), cat: tcat(t), items: []}); m.get(k).items.push(t); });
    return [...m.values()].map(g => { g.items.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start)); g.last = g.items[0].date; return g; })
      .sort((a, b) => b.last.localeCompare(a.last));
  };
  // status per tiket; "tidak terpakai" tidak ditampilkan untuk Video Call (statusnya tidak diperbarui jkt48)
  const chipOf = t => {
    const c = raffleOf(t.raffle);
    return t.date > td ? '<span class="chip soon">Mendatang</span>' : t.used > 0 ? '<span class="chip ok">Hadir</span>' : c === 'lose' ? '<span class="chip lose">Kalah lotre</span>'
      : c === 'win' ? '<span class="chip win">Menang lotre</span>' : tcat(t) === 'Video Call' ? '' : '<span class="chip no">Tidak terpakai</span>';
  };
  const groupHtml = (g, i = 0) => {
    const nx = g.items.filter(t => t.date > td).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
    const cdl = nx ? ` · <span class="cd-live" data-t="${nx.date}T${nx.start || '00:00:00'}"></span>` : '';
    const n = g.items.length, usd = g.items.filter(t => t.used > 0).length, up = g.items.filter(t => t.date > td).length, mem = {};
    g.items.forEach(t => { if (t.member) mem[t.member] = (mem[t.member] || 0) + 1; });
    const ms = Object.entries(mem).sort((a, b) => b[1] - a[1]), first = g.items[n - 1].date;
    const range = first === g.last ? fmtDate(g.last) : `${fmtDate(first)} – ${fmtDate(g.last)}`;
    const chip = up ? `<span class="chip soon">Mendatang${up < n ? ` ${up}/${n}` : ''}</span>` : usd ? `<span class="chip ok">Hadir${usd < n ? ` ${usd}/${n}` : ''}</span>`
      : g.items.every(t => raffleOf(t.raffle) === 'lose') ? '<span class="chip lose">Kalah lotre</span>' : g.cat === 'Video Call' ? '' : '<span class="chip no">Tidak terpakai</span>';
    return `<details class="ev-g" data-k="${esc(g.cat + '|' + g.name)}" style="--i:${Math.min(i, 14)}"><summary>
      <div class="tl-d"><b>${esc(g.last.slice(8))}</b><span>${MON_ID[+g.last.slice(5, 7) - 1]} ${esc(g.last.slice(2, 4))}</span></div>
      <div class="tl-b"><b>${esc(g.name)}</b><div class="hn">${esc(g.cat)} · ${n} sesi · ${esc(range)}${cdl}</div>
        ${ms.length ? `<div class="mchips">${ms.slice(0, 5).map(([m, c]) => `<span class="mchip">${esc(m)}${c > 1 ? ' ×' + c : ''}</span>`).join('')}${ms.length > 5 ? `<span class="mchip">+${ms.length - 5}</span>` : ''}</div>` : ''}</div>
      ${chip}</summary>
      <div class="ev-d">${g.items.map(t => `<div class="ev-t"><span>${esc(fmtDate(t.date))}${t.start ? ' · ' + esc(t.start.slice(0, 5)) : ''}</span><span>${esc([t.member, t.lane, t.session].filter(Boolean).join(' · ')) || '–'}${BLUR_CATS.includes(tcat(t)) ? ' · <span class="blur-n" aria-hidden="true">88</span> tiket' : (t.bought > 1 ? ' · ' + t.bought + ' tiket' : '')}</span>${chipOf(t)}</div>`).join('')}</div></details>`;
  };

  const upc = grouper(ev.filter(t => t.date > td)); // tiket mendatang selalu di paling atas
  $('ev-up').innerHTML = upc.length ? '<h3 class="sec2">Mendatang</h3>' + upc.map(groupHtml).join('') : '';

  const scope = ev.filter(t => t.date <= td && (!evCat || tcat(t) === evCat));
  const mc = {}, mt = {};
  scope.forEach(t => { if (t.member) { mc[t.member] = (mc[t.member] || 0) + 1; mt[t.member] = (mt[t.member] || 0) + t.bought; } });
  const rankAll = Object.entries(mc).sort((a, b) => b[1] - a[1]), rank = rkAll ? rankAll : rankAll.slice(0, 5), mx = rankAll.length ? rankAll[0][1] : 1;
  $('ev-rank').innerHTML = rank.length ? `<h3 class="sec2">Peringkat member${evCat ? ' · ' + esc(evCat) : ''}</h3>` + rank.map(([m, c], i) =>
    `<button type="button" style="--i:${i}" class="rk${m === cur ? ' on' : ''}" data-m="${esc(m)}"><span class="rn">${i + 1}</span><span class="rm">${esc(m)}</span><span class="sl-bar"><i style="width:${c / mx * 100}%"></i></span><span class="rc">${c} sesi</span></button>`).join('') + (rankAll.length > 5 ? `<button type="button" class="btn-s" id="ev-rkmore">${rkAll ? 'Tampilkan 5 teratas' : `Lihat semua (${rankAll.length})`}</button>` : '') : '';

  const list = scope.filter(t => (!cur || t.member === cur) && (!st || t.used > 0));
  const groups = grouper(list);
  $('ev-info').textContent = `${groups.length} seri · ${list.length} sesi`;
  flipRender($('ev-list'), '.ev-g', it => it.dataset.k, () => { $('ev-list').innerHTML = groups.length ? groups.slice(0, evLimit).map(groupHtml).join('') : '<div class="empty">Tidak ada tiket yang cocok</div>'; });
  $('ev-more').hidden = groups.length <= evLimit;
  $('ev-more').textContent = `Tampilkan ${Math.max(0, Math.min(EV_PAGE, groups.length - evLimit))} lagi (sisa ${Math.max(0, groups.length - evLimit)})`;
  tickCountdown();
}

const resetEv = () => { evLimit = EV_PAGE; renderTickets(); };
['ev-member', 'ev-status'].forEach(id => $(id)?.addEventListener('change', resetEv));
$('ev-cats')?.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { evCat = b.dataset.cat; resetEv(); } });
$('ev-rank')?.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { const m = $('ev-member'); m.value = m.value === b.dataset.m ? '' : b.dataset.m; resetEv(); } });
$('ev-more')?.addEventListener('click', () => { evLimit += EV_PAGE; renderTickets(); });
$('ev-rank')?.addEventListener('click', e => { if (e.target.closest('#ev-rkmore')) { rkAll = !rkAll; renderTickets(); } });

// ================= Animasi isi tab =================
// kelas .enter dipasang saat tab dibuka (dan saat data pertama tampil), lalu dilepas supaya render ulang (filter, pencarian) tidak mengulang animasi
function playEnter(el) {
  if (!el) return;
  el.classList.remove('enter');
  void el.offsetWidth; // paksa animasi mulai dari awal
  el.classList.add('enter');
  clearTimeout(el._enT);
  el._enT = setTimeout(() => el.classList.remove('enter'), 2600);
  watchReveal(el);
}

// ================= Klik grafik / kalender -> filter peta =================
function applyChartFilter(kind, val) {
  if (kind === 'row') filter.row = filter.row === val ? '' : val;
  else {
    let from = val, to = val; // 'd' = satu hari
    if (kind === 'mo') { // bulan: YYYY-MM
      const [y, m] = val.split('-').map(Number);
      from = val + '-01'; to = val + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    }
    const same = filter.from === from && filter.to === to; // klik lagi = lepas filter
    filter.from = same ? '' : from; filter.to = same ? '' : to;
    syncDates();
  }
  renderChart();
  $('filters').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}
[['rchart', 'row', 'data-row'], ['cal', 'd', 'data-d'], ['mchart', 'mo', 'data-mo']].forEach(([id, kind, attr]) => {
  $(id).addEventListener('click', e => { const t = e.target.closest('[' + attr + ']'); if (t) applyChartFilter(kind, t.getAttribute(attr)); });
  $(id).addEventListener('keydown', e => { // keyboard: Enter / spasi
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); }
  });
});

// ================= Animasi perubahan grafik & peta =================
// Elemen grafik dibuat ulang setiap render, jadi nilai lama dicatat dulu lalu bar/angka/kursi digerakkan dari nilai lama ke nilai baru.
const BAR_SETS = [ // [kontainer, bar, properti, angka, fungsi kunci]
  ['sl-chart', '.sl-bar i', 'width', '.sl-c', x => x.closest('[data-setlist]')?.dataset.setlist],
  ['ev-rank', '.sl-bar i', 'width', '.rc', x => x.closest('[data-m]')?.dataset.m],
  ['rchart', '.mc-b i', 'height', '.mc-n', (x, i) => i],
  ['mchart', '.mc-b i', 'height', '.mc-n', (x, i) => i]
];
const numOf = s => { const m = /\d+/.exec(s || ''); return m ? +m[0] : 0; };

function snapAnim() {
  const bars = BAR_SETS.map(([id, bs, prop, ns, keyOf]) => {
    const el = $(id), b = new Map(), n = new Map();
    if (el) {
      el.querySelectorAll(bs).forEach((x, i) => { const k = keyOf(x, i); if (k !== undefined) b.set(k, x.style[prop]); });
      el.querySelectorAll(ns).forEach((x, i) => { const k = keyOf(x, i); if (k !== undefined) n.set(k, numOf(x.textContent)); });
    }
    return {b, n};
  });
  const seats = new Map();
  $('chart').querySelectorAll('.seat').forEach(x => { const cs = getComputedStyle(x); if (cs.opacity) seats.set(x.dataset.seat, [cs.opacity, cs.backgroundColor]); });
  return {bars, seats};
}

function tweenNum(el, from, to) {
  const m = /^(\D*)(\d+)(.*)$/.exec(el.textContent);
  if (!m) return;
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / 850);
    el.textContent = m[1] + Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) + m[3];
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function playAnim(snap) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const todo = [], tw = [], seatCh = [];
  BAR_SETS.forEach(([id, bs, prop, ns, keyOf], n) => {
    const el = $(id), old = snap.bars[n];
    if (!el || !old.b.size) return; // render pertama: biarkan animasi masuk (.enter)
    el.querySelectorAll(bs).forEach((x, i) => {
      const k = keyOf(x, i), target = x.style[prop];
      if (k === undefined) return;
      const from = old.b.has(k) ? old.b.get(k) : '0%'; // bar baru tumbuh dari 0
      if (from !== target) { x.style.transition = 'none'; x.style[prop] = from; todo.push([x, prop, target]); }
    });
    el.querySelectorAll(ns).forEach((x, i) => {
      const k = keyOf(x, i), to = numOf(x.textContent), from = old.n.has(k) ? old.n.get(k) : 0;
      if (k !== undefined && x.textContent && from !== to) tw.push([x, from, to]);
    });
  });
  $('chart').querySelectorAll('.seat').forEach(x => { // baca dulu semua, tulis belakangan (hindari reflow berulang)
    const o = snap.seats.get(x.dataset.seat), cs = getComputedStyle(x);
    if (o && cs.opacity && (o[0] !== cs.opacity || o[1] !== cs.backgroundColor)) seatCh.push([x, o, x.style.backgroundColor]);
  });
  seatCh.forEach(([x, o]) => { x.style.transition = 'none'; x.style.opacity = o[0]; x.style.backgroundColor = o[1]; });
  if (!todo.length && !tw.length && !seatCh.length) return;
  void document.body.offsetWidth; // paksa nilai lama sempat dilukis
  todo.forEach(([x, p, t]) => { x.style.transition = ''; x.style[p] = t; });
  seatCh.forEach(([x, , bg]) => { x.style.transition = ''; x.style.opacity = ''; x.style.backgroundColor = bg; });
  tw.forEach(([x, f, t]) => tweenNum(x, f, t));
}

let animDepth = 0;
function withAnim(fn) {
  if (animDepth++) { try { fn(); } finally { animDepth--; } return; } // panggilan bersarang cukup dijalankan
  let snap;
  try { snap = snapAnim(); fn(); } finally { animDepth--; }
  playAnim(snap);
}
function renderChart() { withAnim(renderChartRaw); }
function renderTickets() { withAnim(renderTicketsRaw); }

// ================= Animasi perubahan data: bar naik/turun, angka berhitung, peta bereaksi =================
const barMem = {}, numMem = {};
let lastSig = null; // tanda filter terakhir, untuk mendeteksi perubahan filter
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;


// angka kartu statistik berhitung dari nilai lama ke nilai baru saat filter berubah
function tweenNums(id, box) {
  const prev = numMem[id] || {}, next = {}, skip = calm() || intro || replayN !== null;
  box.querySelectorAll('[data-n]').forEach(el => {
    const key = el.nextElementSibling ? el.nextElementSibling.textContent : '', to = +el.dataset.n, from = prev[key];
    next[key] = to;
    if (skip || from === undefined || from === to) return;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 900);
      el.textContent = fmtNum(from + (to - from) * (1 - Math.pow(1 - p, 3)), el.dataset.fmt || '');
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = fmtNum(from, el.dataset.fmt || '');
    requestAnimationFrame(step);
  });
  numMem[id] = next;
}

// kursi yang cocok "membesar" bergantian setelah filter berubah
function playRefresh() {
  const c = $('chart');
  c.classList.remove('refresh');
  void c.offsetWidth;
  c.classList.add('refresh');
  clearTimeout(c._rf);
  c._rf = setTimeout(() => c.classList.remove('refresh'), 1700);
}

// ================= Animasi lanjutan: tampil saat terlihat, daftar bergeser, tab meluncur, pil filter, hitung mundur, kembang api =================
const REVEAL = ['sl-chart', 'rchart', 'cal', 'mchart', 'ev-rank', 'lot'];
function showReveal(el) { // nyalakan animasi bar / kalender / cincin pada bagian ini
  el.classList.add('shown');
  if (el.id === 'lot') { flowCount(el); countUp($('lot').querySelector('.lot-cards') || el, true); if ($('ev-cats')) countUp($('ev-cats'), true); }
  clearTimeout(el._sh);
  el._sh = setTimeout(() => el.classList.remove('shown'), 3600);
}
const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  revealIO.unobserve(e.target);
  showReveal(e.target);
}), {threshold: 0.15}) : null;
function watchReveal(root) { // animasi bar/kalender/cincin jalan saat bagiannya terlihat
  REVEAL.forEach(id => {
    const el = $(id);
    if (!el || (root && !root.contains(el))) return;
    el.classList.remove('shown');
    if (revealIO) revealIO.unobserve(el);
    const r = el.getBoundingClientRect();
    if (r.width && r.top < innerHeight * 0.9 && r.bottom > 0) showReveal(el); // sudah di layar: nyalakan sekarang juga, jadi tidak ada frame "penuh lalu kosong"
    else if (revealIO) revealIO.observe(el);
    else showReveal(el);
  });
}

// daftar bergeser ke posisi baru (FLIP), item baru memudar masuk
function flipRender(box, itemSel, keyOf, doRender) {
  if (calm() || !box.offsetParent || box.closest('.enter') || box.querySelectorAll(itemSel).length > 40) { doRender(); return; }
  const first = new Map();
  box.querySelectorAll(itemSel).forEach(el => first.set(keyOf(el), el.getBoundingClientRect()));
  doRender();
  if (!first.size) return;
  box.querySelectorAll(itemSel).forEach(el => {
    const a = first.get(keyOf(el)), b = el.getBoundingClientRect();
    if (!a) el.animate([{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 520, easing: 'cubic-bezier(.32,.72,0,1)'});
    else if (a.left !== b.left || a.top !== b.top) el.animate([{transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`}, {transform: 'none'}], {duration: 620, easing: 'cubic-bezier(.32,.72,0,1)'});
  });
}

// penanda tab aktif yang meluncur ("pil cair")
function setStick() { // tinggi tab bar -> posisi header bulan yang menempel
  const bar = document.querySelector('.tabbar');
  if (bar) document.documentElement.style.setProperty('--stick', Math.round(bar.getBoundingClientRect().height + 16) + 'px');
}
/* Satu-satunya tempat yang menggerakkan pil. Aturan:
   - moveInd()      -> meluncur ke tab aktif (tepi depan melaju duluan, tepi belakang menyusul, tanpa memantul)
   - moveInd(true)  -> ukur ulang saja (ukuran layar / label berubah). Kalau pil sedang meluncur, hanya target yang diperbarui,
                       jadi gerakannya tidak pernah dipotong atau dilempar ke posisi akhir.
   - indFollow()    -> mengikuti jari saat menggeser tab */
const IND_MS_FULL = 560, IND_MS_LITE = 460; // sebelumnya 720: lebih lama dari isi tab, jadi pil terasa tertinggal
const indLead = k => 1 - Math.pow(1 - k, 3);
const indTrail = k => { k = Math.min(1, Math.max(0, (k - 0.14) / 0.86)); return 1 - Math.pow(1 - k, 2.4); };
const indRectOf = el => ({x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight});
function indSize(ind, b) { if (ind._bw !== b.w || ind._bh !== b.h) { ind.style.width = b.w + 'px'; ind.style.height = b.h + 'px'; ind._bw = b.w; ind._bh = b.h; } }
function indPaint(ind, r, base) { // base = ukuran dasar elemen; peregangan "cair" hanya lewat scale (tanpa memicu layout)
  const b = base || r;
  ind._cur = r;
  indSize(ind, b);
  ind.style.transform = `translate3d(${r.x}px,${r.y}px,0) scale(${(r.w / b.w).toFixed(4)},${(r.h / b.h).toFixed(4)})`;
}
function indAxis(p0, s0, p1, s1, ea, eb) { // ea: easing tepi awal, eb: easing tepi akhir
  const a = p0 + (p1 - p0) * ea, b = (p0 + s0) + ((p1 + s1) - (p0 + s0)) * eb;
  return [a, Math.max(b - a, 0)];
}
function indBlend(f, t, kLead, kTrail) { // f -> t; arah gerak menentukan tepi mana yang memimpin
  const fx = t.x >= f.x, fy = t.y >= f.y;
  const [x, w] = indAxis(f.x, f.w, t.x, t.w, fx ? kTrail : kLead, fx ? kLead : kTrail);
  const [y, h] = indAxis(f.y, f.h, t.y, t.h, fy ? kTrail : kLead, fy ? kLead : kTrail);
  return {x, y, w, h};
}
/* Meluncur lewat WAAPI (keyframe transform): berjalan di compositor, jadi tetap mulus walau main thread sedang
   sibuk menggambar isi tab baru. Sebelumnya digerakkan requestAnimationFrame di main thread -> patah-patah. */
const indSame = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.01);
function indStop(ind) { const a = ind._anim; ind._anim = null; if (a) { try { a.cancel(); } catch (e) {} } }
function indProg(ind) { // 0..1 seberapa jauh animasi berjalan
  const a = ind._anim; if (!a) return 1;
  return Math.min(1, Math.max(0, Number(a.currentTime || 0) / ind._aDur));
}
function indNow(ind) { // posisi pil saat ini, juga ketika sedang meluncur
  if (ind._anim && ind._aFrom && ind._aTo) { const k = indProg(ind); return indBlend(ind._aFrom, ind._aTo, indLead(k), indTrail(k)); }
  return ind._cur;
}
function indGlide(ind, from, to, ms) {
  indStop(ind);
  if (!ind.animate) { indPaint(ind, to); return; }
  indSize(ind, to);
  const N = 24, kf = [];
  for (let n = 0; n <= N; n++) {
    const k = n / N, r = indBlend(from, to, indLead(k), indTrail(k));
    kf.push({offset: k, transform: `translate3d(${r.x}px,${r.y}px,0) scale(${(r.w / to.w).toFixed(4)},${(r.h / to.h).toFixed(4)})`});
  }
  ind._aFrom = from; ind._aTo = to; ind._aDur = ms;
  const a = ind.animate(kf, {duration: ms, easing: 'linear', fill: 'forwards'});
  ind._anim = a;
  a.onfinish = () => { if (ind._anim !== a) return; ind._anim = null; indPaint(ind, to); try { a.cancel(); } catch (e) {} };
}
function indEl(create) {
  const bar = document.querySelector('.tabbar');
  if (!bar) return null;
  let ind = bar.querySelector('.tab-ind');
  if (!ind && create) { ind = document.createElement('i'); ind.className = 'tab-ind'; bar.prepend(ind); }
  return ind;
}
function moveInd(remeasure) {
  if (remeasure === true || !moveInd._s) { moveInd._s = 1; setStick(); } // tinggi bar tidak berubah saat pindah tab: jangan paksa layout tiap kali
  const bar = document.querySelector('.tabbar'), on = bar && bar.querySelector('.tab.on');
  if (!on) return;
  let ind = indEl(false), fresh = false;
  if (!ind) { ind = indEl(true); fresh = true; }
  const to = indRectOf(on);
  ind._to = to;
  const cur = indNow(ind);
  if (fresh || calm() || !cur || (remeasure === true && !ind._anim)) { indStop(ind); indPaint(ind, to); return; }
  if (remeasure === true) { // sedang meluncur: lanjut dari posisi sekarang ke target terbaru, tidak dipotong / dilempar
    indGlide(ind, cur, to, Math.max(240, ind._aDur * (1 - indProg(ind))));
    return;
  }
  if (ind._anim && indSame(ind._aTo, to)) return; // sudah meluncur ke tab ini
  if (!ind._anim && indSame(cur, to)) return;
  indGlide(ind, cur, to, perf.lite() ? IND_MS_LITE : IND_MS_FULL);
}
function indFollow(fromTab, toTab, p) { // p 0..1: pil mengikuti jari di antara dua tab
  const ind = indEl(true);
  if (!ind || !fromTab || !toTab) return;
  indStop(ind);
  p = Math.max(0, Math.min(1, p));
  const f0 = indRectOf(fromTab);
  indPaint(ind, indBlend(f0, indRectOf(toTab), Math.pow(p, 0.85), Math.pow(p, 1.3)), f0);
}
if (document.querySelector('.tabbar')) {
  const ro = new ResizeObserver(() => moveInd(true)); // lebar tab berubah saat angka jumlah muncul
  document.querySelectorAll('.tab').forEach(t => ro.observe(t));
  window.addEventListener('resize', () => moveInd(true));
  moveInd(true);
}

// pil pemberitahuan filter aktif (hanya di halaman publik)
const fbar = document.querySelector('.tabbar') && $('view-main') ? document.body.appendChild(Object.assign(document.createElement('div'), {id: 'fbar'})) : null;
fbar?.setAttribute('role', 'status');
fbar?.addEventListener('click', e => { if (e.target.closest('button')) $('flt-reset').click(); });
function syncFbar() {
  if (!fbar) return;
  const parts = [];
  if (filter.row) parts.push('Baris ' + filter.row);
  if (filter.setlist) parts.push(filter.setlist);
  if (filter.member) parts.push(filter.member);
  if (filter.from || filter.to) parts.push(filter.from === filter.to ? fmtDate(filter.from) : `${filter.from ? fmtDate(filter.from) : '…'} – ${filter.to ? fmtDate(filter.to) : '…'}`);
  const show = isFiltered() && !$('view-main').hidden;
  if (show) fbar.innerHTML = `<span>${esc(parts.join(' · '))} · <b>${view().length}</b> show</span><button type="button">Reset</button>`;
  fbar.classList.toggle('on', show);
  centerFbar();
}
// bar filter di bawah: tengahnya = tengah PETA (bukan tengah layar), supaya tidak geser saat ada panel kanan / sidebar
function centerFbar() {
  if (!fbar) return;
  const w = $('seating-wrapper'), r = w && w.getBoundingClientRect();
  if (!r || !r.width) return;
  const l = Math.max(r.left, 0), rt = Math.min(r.right, innerWidth);
  if (rt > l) fbar.style.left = Math.round((l + rt) / 2) + 'px';
}
addEventListener('resize', () => centerFbar());

// hitung mundur tiket mendatang
function tickCountdown() {
  document.querySelectorAll('.cd-live').forEach(el => {
    const ms = new Date(el.dataset.t) - Date.now();
    if (isNaN(ms)) return;
    if (ms <= 0) { el.textContent = 'sedang berlangsung'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.textContent = d ? `${d} hari ${h} jam lagi` : `${h} jam ${m} menit lagi`;
  });
}
setInterval(tickCountdown, 30000);

// percikan kecil di kursi saat putar ulang mencapai show ke-10, 25, 50, ...
function burst(el) {
  if (!el || calm()) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('i');
    p.className = 'sparkle';
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${['#ffd23f', '#ff8c00', '#ff2a5f'][i % 3]}`;
    document.body.appendChild(p);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    p.animate([{transform: 'translate(0,0) scale(1)', opacity: 1}, {transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0)`, opacity: 0}],
      {duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.2,1)'}).onfinish = () => p.remove();
  }
}

// animasi ganti tahun di kalender: kalender & judul tahun meluncur sesuai arah, kotak berisi menyala bergantian
function slideCal(dir) {
  if (calm()) return;
  const ease = {duration: 560, easing: 'cubic-bezier(.22,1,.36,1)'};
  ['.cal-g', '.cal-m'].forEach(sel => $('cal').querySelector(sel)?.animate([{opacity: 0, transform: `translateX(${dir * 28}px)`}, {opacity: 1, transform: 'none'}], ease));
  $('cal-nav').querySelector('b')?.animate([{opacity: 0, transform: `translateY(${dir * -10}px)`}, {opacity: 1, transform: 'none'}], ease);
  const c = $('cal');
  c.classList.remove('shown'); void c.offsetWidth; c.classList.add('shown');
  clearTimeout(c._sh); c._sh = setTimeout(() => c.classList.remove('shown'), 2000);
}

// alur OFC -> General: bar terisi berurutan, angka tiap tahap berhitung bergantian
function flowCount(box) {
  if (calm()) return;
  box.querySelectorAll('.lot-r.fl').forEach((row, i) => {
    row.querySelectorAll('[data-n]').forEach(el => { el.textContent = '0'; });
    setTimeout(() => countUp(row), i * 260 + 200);
  });
}

// ================= Zoom peta di HP =================
$('seating-wrapper').insertAdjacentHTML('beforebegin', '<div id="zoomctl"><button type="button" class="btn-s" data-z="out" aria-label="Perkecil peta">−</button><button type="button" class="btn-s" data-z="in" aria-label="Perbesar peta">+</button><button type="button" class="btn-s" data-z="fit">⤢ Pas layar</button></div>');
function setMapScale(s, px) { // px = titik (relatif ke wadah peta) yang dipertahankan saat zoom
  if (window.innerWidth > 768) return;
  const w = $('seating-wrapper'), c = $('stage-container');
  if (px === undefined) px = w.clientWidth / 2;
  const anchor = (w.scrollLeft + px) / mapScale;
  c.style.zoom = '';
  const natural = c.scrollWidth, min = Math.min(1, w.clientWidth / natural);
  mapScale = Math.max(min, Math.min(2.4, s));
  mapAuto = mapScale <= min + .001; // kembali ke ukuran pas = mode otomatis lagi
  c.style.zoom = mapScale === 1 ? '' : mapScale;
  w.scrollLeft = anchor * mapScale - px;
}
$('zoomctl').addEventListener('click', e => {
  const b = e.target.closest('[data-z]');
  if (!b) return;
  setMapScale(b.dataset.z === 'fit' ? 0 : mapScale * (b.dataset.z === 'in' ? 1.3 : 1 / 1.3));
});
(() => { // cubit dua jari
  const w = $('seating-wrapper'), dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let d0 = 0, s0 = 1;
  w.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e.touches); s0 = mapScale; } }, {passive: true});
  w.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    const px = (e.touches[0].clientX + e.touches[1].clientX) / 2 - w.getBoundingClientRect().left;
    setMapScale(s0 * dist(e.touches) / d0, px);
  }, {passive: false});
  w.addEventListener('touchend', e => { if (e.touches.length < 2) d0 = 0; });
})();

// ================= Cerita otomatis di bagian atas =================
$('last').insertAdjacentHTML('beforebegin', '<p id="story"></p>');
function renderStory() {
  const el = $('story');
  if (!el) return;
  if (!records.length) { el.innerHTML = ''; return; }
  const who = ((document.querySelector('h1') || {textContent: ''}).textContent.match(/^(.+?)['’]s\b/) || [])[1] || 'Pemilik halaman ini';
  const ok = records.filter(r => SEATS.has(r.seat)), ds = records.map(r => r.date).filter(Boolean).sort();
  const seat = tally(ok, r => r.seat, seatTie), row = tally(ok, r => r.seat[0], (a, b) => a.localeCompare(b)), sl = tally(records, r => r.setlist);
  const b = t => `<b>${esc(t)}</b>`; // hanya angka utama yang ditebalkan
  const line = (t, cls = '') => `<span class="st${cls ? ' ' + cls : ''}">${t}</span>`;
  const out = [];
  out.push(line((ds.length ? `Sejak ${esc(MON_ID[+ds[0].slice(5, 7) - 1] + ' ' + ds[0].slice(0, 4))}, ${esc(who)} sudah menonton ` : `${esc(who)} sudah menonton `)
    + `${b(records.length)} show di ${b(new Set(ok.map(r => r.seat)).size)} kursi berbeda.`));
  if (seat && row) out.push(line(`Kursi favoritnya ${esc(seat[0])} (${seat[1]}×), paling sering di baris ${esc(row[0])} (${row[1]}×).` + (sl ? ` Setlist yang paling sering ditonton: ${esc(sl[0])} (${sl[1]}×).` : '')));
  try {
    const fl = lotFlowStats();
    if (fl && fl.n) {
      const refunds = tickets.filter(t => t.status === 'refund').length, watched = fl.got - refunds, rest = records.length - watched, gen = fl.got - fl.ofcWin;
      out.push(line(`Dari ${fl.n} show teater yang diincar lewat undian, ${fl.got} berhasil didapat (${b(Math.round(fl.got / fl.n * 100) + '%')}): ${fl.ofcWin} langsung menang di OFC${gen ? ' dan ' + gen + ' lewat General' : ''}.`
        + ` ${refunds ? refunds + ' show dibatalkan dan di-refund, jadi ' : ''}${watched} ditonton${rest > 0 ? ', ditambah ' + rest + ' show lain di luar undian show teater (mis. JKT48 School)' : ''}.`, 'mute'));
    }
  } catch (e) { /* data tiket belum dimuat */ }
  const h = out.join('');
  el.innerHTML = h;
}

// ================= Selalu pakai shared.js/css terbaru =================
// Ambil ulang dengan revalidasi ringan (ETag). Kalau isinya beda dari salinan di cache, cache sudah terperbarui, lalu muat ulang satu kali.
(async () => {
  if (location.protocol === 'file:' || sessionStorage.getItem('freshChecked')) return;
  try {
    for (const u of ['assets/js/shared.js', 'assets/css/shared.css']) {
      const [a, b] = await Promise.all([fetch(u).then(r => r.text()), fetch(u, {cache: 'no-cache'}).then(r => r.text())]);
      if (a !== b) { sessionStorage.setItem('freshChecked', '1'); location.reload(); return; }
    }
    sessionStorage.setItem('freshChecked', '1');
  } catch (e) { /* offline: abaikan */ }
})();

// tombol ⓘ: buka/tutup keterangan di sebelahnya
document.addEventListener('click', e => {
  const b = e.target.closest('.info-btn');
  const t = b && b.nextElementSibling;
  if (!t) return;
  t.hidden = !t.hidden;
  b.setAttribute('aria-expanded', String(!t.hidden));
});

// bayangan di bar tab saat halaman digulir
(() => {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  let t = 0;
  addEventListener('scroll', () => { if (t) return; t = requestAnimationFrame(() => { t = 0; bar.classList.toggle('stuck', scrollY > 30); }); }, {passive: true});
})();

// sub-tab Galeri: Semua / 2-Shot / 2-Shot Event / Chekicha
let galKind = '';
if ($('gallery-bar')) {
  $('gallery-bar').insertAdjacentHTML('beforebegin', '<div id="g-kinds" class="gk-bar"></div>');
  $('g-kinds').addEventListener('click', e => { const b = e.target.closest('[data-gk]'); if (b) { galKind = b.dataset.gk; renderGallery(); } });
}


// ================= Rekap "tahun lalu hari ini" =================
// Tanggal hari ini bisa diuji lewat ?today=YYYY-MM-DD. Memakai semua data (tidak terpengaruh filter peta).
function todayStr() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
$('last').insertAdjacentHTML('afterend', '<div id="memory"></div>');
function memoryItems(today) {
  const md = today.slice(5), ty = +today.slice(0, 4), out = [];
  const yrs = d => ty - +d.slice(0, 4);
  const ok = d => d && d.slice(5) === md && yrs(d) > 0;
  records.filter(r => ok(r.date)).forEach(r => out.push({y: yrs(r.date), t: r.setlist || '(tanpa setlist)', sub: [r.sesi, ...extras(r).map(x => `${x.label} dengan ${x.member}`)].filter(Boolean).join(' · '), seat: r.seat, ph: (extras(r).find(x => x.photo) || {}).photo}));
  solo.filter(w => ok(w.date)).forEach(w => out.push({y: yrs(w.date), t: (w.kind === 'ts' ? '2-Shot' : 'Chekicha') + ' dengan ' + w.member, sub: w.setlist || '', ph: w.photo}));
  tickets.filter(t => t.type !== 'SHOW' && t.used > 0 && ok(t.date)).forEach(t => out.push({y: yrs(t.date), t: t.name, sub: ['Event', t.member].filter(Boolean).join(' · ')}));
  return out.sort((a, b) => a.y - b.y);
}
function renderMemory() {
  const el = $('memory');
  if (!el) return;
  const today = todayStr(), items = dataLoaded ? memoryItems(today) : [];
  if (!items.length) { el.innerHTML = ''; return; }
  const when = y => y === 1 ? 'Setahun lalu hari ini' : `${y} tahun lalu hari ini`;
  const shown = items.slice(0, 4);
  el.innerHTML = `<div class="mem-c"><span class="last-l">Kilas balik · ${esc(fmtDate(today).replace(/ \d{4}$/, ''))}</span>` + shown.map(i => `
    <div class="mem-i">${i.ph ? `<img src="${esc(thumbOf(i.ph))}" data-full="${esc(i.ph)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto kilas balik" data-cap="${esc(i.t)}" data-sub="${esc(when(i.y) + (i.sub ? ' · ' + i.sub : ''))}" decoding="async">` : ''}
      <div class="mem-b"><b>${esc(i.t)}</b><span>${when(i.y)}${i.sub ? ' · ' + esc(i.sub) : ''}${i.seat ? ` · Kursi <button type="button" class="seat-badge tl-s" data-seat="${esc(i.seat)}">${esc(i.seat)}</button>` : ''}</span></div></div>`).join('')
    + (items.length > shown.length ? `<span class="mem-more">+${items.length - shown.length} lainnya di tanggal ini</span>` : '') + '</div>';
}
$('memory').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});

// ================= Statistik per member =================
// Semua pertemuan (2-Shot + Chekicha, termasuk sesi lepas) dengan satu member, dari seluruh data (tidak terpengaruh filter).
function memberStats(name) {
  const m = {name, ts: 0, ck: 0, shows: [], solo: 0, ev: 0, dates: [], photos: []};
  records.forEach(r => {
    const x = extras(r).filter(e => e.member === name);
    if (!x.length) return;
    m.shows.push(r);
    x.forEach(e => { m[e.k]++; m.dates.push(r.date); if (e.photo) m.photos.push({src: e.photo, date: r.date, label: e.label, setlist: r.setlist, seat: r.seat, sesi: r.sesi}); });
  });
  solo.filter(w => w.member === name).forEach(w => {
    m[w.kind]++; m.solo++; m.dates.push(w.date);
    if (w.photo) m.photos.push({src: w.photo, date: w.date, label: w.kind === 'ts' ? '2-Shot' : 'Chekicha', setlist: w.setlist || 'Di luar show'});
    if (w.setlist) m.shows.push({setlist: w.setlist, seat: '', date: w.date, solo: 1});
  });
  m.ev = tickets.filter(t => t.type !== 'SHOW' && t.used > 0 && t.member === name).length;
  // kemunculan: show tempat dia tampil (lineup) ATAU bertemu 2-Shot/Chekicha; hanya show asli (bukan sesi lepas)
  m.appear = records.filter(r => (r.lineup || []).includes(name) || extras(r).some(x => x.member === name));
  m.lineupN = records.filter(r => (r.lineup || []).includes(name)).length;
  m.hasLineup = records.some(r => (r.lineup || []).length);
  m.appSeats = Object.entries(m.appear.reduce((o, r) => (r.seat && (o[r.seat] = (o[r.seat] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || seatTie(a[0], b[0]));
  m.appSetlists = Object.entries(m.appear.reduce((o, r) => (r.setlist && (o[r.setlist] = (o[r.setlist] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  m.span = [...m.dates, ...m.appear.map(r => r.date)].filter(Boolean).sort();
  m.dates.sort(); m.photos.sort((a, b) => b.date.localeCompare(a.date));
  m.setlists = Object.entries(m.shows.reduce((o, r) => (r.setlist && (o[r.setlist] = (o[r.setlist] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  m.seats = Object.entries(m.shows.reduce((o, r) => (r.seat && (o[r.seat] = (o[r.seat] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || seatTie(a[0], b[0]));
  return m;
}
// semua member yang pernah muncul (lineup, 2-Shot, Chekicha, sesi lepas): [nama, jumlah ditampilkan, pernah ketemu?]
// jumlah = berapa kali ditonton tampil (lineup atau bertemu); kalau belum ada lineup sama sekali, jumlah pertemuan 2-Shot/Chekicha
function memberNames() {
  const app = {}, met = {}, hasLineup = records.some(r => (r.lineup || []).length);
  records.forEach(r => {
    const names = new Set(extras(r).map(x => x.member).filter(Boolean));
    names.forEach(n => met[n] = (met[n] || 0) + 1);
    [...names, ...(r.lineup || [])].forEach(n => app[n] = (app[n] || 0) + 1);
    new Set([...(r.lineup || [])].filter(n => names.has(n))).forEach(n => app[n]--); // yang ada di lineup DAN bertemu dihitung sekali
  });
  solo.forEach(w => { if (w.member) met[w.member] = (met[w.member] || 0) + 1; });
  const all = new Set([...Object.keys(app), ...Object.keys(met)]);
  return [...all].map(n => [n, hasLineup ? (app[n] || met[n] || 0) : (met[n] || 0), met[n] || 0]); // [nama, angka utama, berapa kali ketemu (2-Shot/Chekicha/sesi lepas)]
}
// foto terbaru tiap member (2-Shot / Chekicha, termasuk sesi lepas) untuk avatar di chip
function memberAvatars() {
  const av = {};
  const put = (n, src, date) => { if (n && src && (!av[n] || date > av[n].date)) av[n] = {src, date: date || ''}; };
  records.forEach(r => extras(r).forEach(e => put(e.member, e.photo, r.date)));
  solo.forEach(w => put(w.member, w.photo, w.date));
  return av;
}
const memInit = n => (String(n).trim().match(/[A-Za-z0-9\u00C0-\uFFFF]/) || ['?'])[0].toUpperCase();
let memQ = '', memSort = 'top', memMode = 'all'; // memMode: 'all' (semua yang tampil) | 'met' (pernah ketemu)
$('mchart').insertAdjacentHTML('afterend', `<section id="mem-sec"><h2 class="sec" id="mem-h">Per member <small class="hint" style="display:inline">· ketuk nama untuk statistiknya</small></h2>
  <div id="mem-bar"><input type="search" id="mem-q" placeholder="Cari member…" aria-label="Cari member" autocomplete="off"><button type="button" class="btn-s" id="mem-sort" aria-label="Ubah urutan"></button></div>
  <div id="mem-mode" class="mem-mode" role="group" aria-label="Member yang ditampilkan" hidden><i class="seg-ind" aria-hidden="true"></i><button type="button" data-mode="all" aria-pressed="true">Semua member</button><button type="button" data-mode="met" aria-pressed="false">Pernah 2-Shot/Chekicha</button></div>
  <p id="mem-n" class="mem-n" aria-live="polite"></p><p id="mem-key" class="mem-key"></p><div id="mem-list"></div></section>`);
function renderMembers(anim) {
  const box = $('mem-list');
  if (!box) return;
  // rekam posisi chip lama (untuk animasi geser/masuk/keluar saat mengetik di pencarian atau ganti urutan)
  const fx = anim && !calm();
  const oldPos = new Map(), ghosts = [];
  if (fx) {
    const br = box.getBoundingClientRect();
    box.querySelectorAll('.mem-chip').forEach(el => {
      const r = el.getBoundingClientRect();
      oldPos.set(el.dataset.mem, r);
      if (r.bottom > 0 && r.top < innerHeight) ghosts.push({n: el.dataset.mem, node: el.cloneNode(true), l: r.left - br.left + box.scrollLeft, t: r.top - br.top + box.scrollTop, w: r.width, h: r.height});
    });
  }
  const all = memberNames(), hasLineup = records.some(r => (r.lineup || []).length);
  const mode = hasLineup ? memMode : 'all'; // saklar hanya berarti kalau lineup sudah ada
  const q = memQ.trim().toLowerCase(), avs = memberAvatars();
  const list = all.filter(([n, , m]) => (mode === 'all' || m > 0) && (!q || n.toLowerCase().includes(q)))
    .sort((a, b) => memSort === 'az' ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0]));
  $('mem-h').hidden = $('mem-bar').hidden = $('mem-key').hidden = !all.length;
  $('mem-mode').hidden = !all.length || !hasLineup;
  $('mem-mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const sb = $('mem-sort'), stxt = memSort === 'az' ? 'A–Z' : 'Terbanyak';
  if (!sb.firstElementChild) sb.innerHTML = '<span class="ms-l"></span>';
  if (sb.firstElementChild.textContent !== stxt) sb.firstElementChild.textContent = stxt;
  $('mem-key').innerHTML = hasLineup
    ? '<span class="lg-i"><b class="lg-a">8</b> kali ditonton (tampil di show)</span><span class="lg-i"><b class="lg-m">3</b> di antaranya 2-Shot / Chekicha</span><span class="lg-i lg-n">Kotak berwarna = pernah 2-Shot/Chekicha · yang redup belum</span>'
    : 'Angka = jumlah 2-Shot + Chekicha. Isi lineup di admin untuk menghitung semua member yang tampil.';
  box.classList.toggle('lu', hasLineup);
  const pool = all.filter(([, , m]) => mode === 'all' || m > 0).length; // jumlah sebelum pencarian
  $('mem-n').hidden = !all.length;
  $('mem-n').textContent = !all.length ? '' : q && list.length !== pool ? `${list.length} dari ${pool} member` : `${pool} member`;
  box.innerHTML = list.length ? list.map(([n, c, m]) => {
    const pct = c ? Math.min(100, Math.round(m / c * 100)) : 0;
    const ttl = hasLineup ? ` title="${esc(`Ditonton ${c}× · 2-Shot/Chekicha ${m}×` + (m ? ` (${pct}%)` : ''))}"` : '';
    const a = avs[n];
    const ava = a ? `<img class="mem-avs" src="${esc(thumbOf(a.src))}" data-full="${esc(a.src)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="" width="28" height="28" loading="lazy" decoding="async">` : `<span class="mem-avs ph" aria-hidden="true">${esc(memInit(n))}</span>`;
    return `<button type="button" class="mem-chip av${m && hasLineup ? ' met' : ''}" data-mem="${esc(n)}"${ttl}>${ava}<span class="mem-cn">${esc(n)}</span><span class="mem-nums"><b>${c}</b>${hasLineup && m ? `<b class="mm">${m}</b>` : ''}</span>${hasLineup && m ? `<span class="mem-rt" style="width:${pct}%"></span>` : ''}</button>`;
  }).join('')
    : `<div class="empty">${all.length ? 'Tidak ada member yang cocok' : 'Belum ada data member'}</div>`;
  if (!fx || !oldPos.size) return;
  // chip yang masih ada: meluncur dari posisi lama; chip baru: muncul membesar; chip yang hilang: memudar (hantu)
  let ei = 0;
  const now = new Set();
  box.querySelectorAll('.mem-chip').forEach(el => {
    now.add(el.dataset.mem);
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const o = oldPos.get(el.dataset.mem);
    if (o) {
      const dx = o.left - r.left, dy = o.top - r.top;
      if (dx || dy) el.animate([{transform: `translate3d(${dx}px,${dy}px,0)`}, {transform: 'none'}], {duration: 520, easing: lbEase});
    } else {
      el.animate([{opacity: 0, transform: 'scale(.88)'}, {opacity: 1, transform: 'none'}], {duration: 420, delay: Math.min(ei++, 10) * 20, easing: lbEase, fill: 'backwards'});
    }
  });
  ghosts.filter(g => !now.has(g.n)).slice(0, 24).forEach(g => {
    const n = g.node;
    n.style.cssText = `position:absolute;left:${g.l}px;top:${g.t}px;width:${g.w}px;height:${g.h}px;margin:0;pointer-events:none;z-index:0`;
    n.setAttribute('aria-hidden', 'true'); n.tabIndex = -1; n.removeAttribute('data-mem');
    box.appendChild(n);
    n.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.9)'}], {duration: 240, easing: 'ease-out', fill: 'forwards'}).onfinish = () => n.remove();
  });
  const em = box.querySelector('.empty');
  if (em) em.animate([{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 360, easing: lbEase});
}
// pil geser di saklar "Semua member / Pernah 2-Shot/Chekicha": melar ke tujuan lalu mengecil (efek cair), seperti pil di tab bar
function segMove(anim) {
  const box = $('mem-mode'), ind = box.querySelector('.seg-ind'), on = box.querySelector('[aria-pressed=true]');
  if (!ind || !on || !on.offsetWidth) return;
  const x = on.offsetLeft, w = on.offsetWidth, prev = segMove.p, T = v => `translate3d(${v}px,0,0)`;
  ind.style.top = on.offsetTop + 'px'; ind.style.height = on.offsetHeight + 'px';
  segMove.p = {x, w};
  ind.getAnimations().forEach(a => a.cancel());
  ind.style.transform = T(x); ind.style.width = w + 'px';
  if (!anim || !prev || calm() || (prev.x === x && prev.w === w)) return;
  const lo = Math.min(prev.x, x), hi = Math.max(prev.x + prev.w, x + w);
  ind.animate([{transform: T(prev.x), width: prev.w + 'px'}, {transform: T(lo), width: (hi - lo) + 'px', offset: .45}, {transform: T(x), width: w + 'px'}], {duration: 1100, easing: lbEase});
}
if (window.ResizeObserver) new ResizeObserver(() => segMove(false)).observe($('mem-mode')); // muncul / ukuran berubah: pasang tanpa animasi
const memSwap = () => { if (window.liquid && window.liquid.swap) (window.liquid.swap($('mem-list'), '.mem-chip') || []).forEach(a => { a.playbackRate = .55; }); }; // chip masuk bertahap dengan pegas (liquid.js)
$('mem-q').addEventListener('input', e => { memQ = e.target.value; renderMembers(true); });
$('mem-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && b.dataset.mode !== memMode) { memMode = b.dataset.mode; renderMembers(); segMove(true); memSwap(); } });
$('mem-sort').addEventListener('click', () => {
  // tombol melar/menyusut mulus ke lebar label baru (search bar ikut karena flex:1), label baru memudar masuk, chip meluncur ke urutan baru
  const btn = $('mem-sort'), w0 = btn.offsetWidth;
  memSort = memSort === 'az' ? 'top' : 'az';
  renderMembers(true);
  if (calm()) return;
  const w1 = btn.offsetWidth;
  if (w0 !== w1) btn.animate([{width: w0 + 'px'}, {width: w1 + 'px'}], {duration: 460, easing: lbEase});
  btn.firstElementChild.animate([{opacity: 0, transform: 'translateY(7px) scale(.92)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: lbEase});
});
$('lightbox').insertAdjacentHTML('beforebegin', `<div class="overlay" id="mem-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mem-title">
  <button class="x" id="mem-close" aria-label="Tutup">&times;</button><h3 id="mem-title" style="margin:0"></h3><div class="mem-body" id="mem-body"></div></div></div>`);
const seatBlock = (title, list) => list.length ? `<h4 class="mem-h">${title}</h4><div class="mem-seats">${list.map(([n, c], i) => `<button type="button" class="seat-badge tl-s" data-seat="${esc(n)}"${i >= 10 ? ' data-x hidden' : ''}>${esc(n)}${c > 1 ? ` ×${c}` : ''}</button>`).join('')}${list.length > 10 ? `<button type="button" class="mem-more" data-more aria-expanded="false">+${list.length - 10} lainnya</button>` : ''}</div>` : '';
function openMember(name) {
  const m = memberStats(name);
  if (!m.ts && !m.ck && !m.ev && !m.appear.length) return;
  const met = m.ts + m.ck, sd = m.span, span = sd.length ? (sd[0] === sd[sd.length - 1] ? fmtDate(sd[0]) : `${fmtDate(sd[0])} – ${fmtDate(sd[sd.length - 1])}`) : '';
  const cell = (l, v, sub) => `<div class="stat"><div class="sv" data-cu="${v}">${v}</div><div class="sl">${l}</div>${sub ? `<div class="ss">${esc(sub)}</div>` : ''}</div>`;
  const cells = [...(m.hasLineup ? [cell('Ditonton', m.appear.length, m.appear.length && met ? `${met} dengan 2-Shot/Chekicha` : '')] : []), cell('2-Shot', m.ts), cell('Chekicha', m.ck), ...(m.hasLineup ? [] : [cell('Total pertemuan', met)]), ...(m.ev ? [cell('Hadir di event', m.ev)] : [])];
  const av = m.photos[0];
  $('mem-title').innerHTML = (av ? `<img class="mem-av" src="${esc(thumbOf(av.src))}" data-full="${esc(av.src)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="" data-cap="${esc(name)}" data-sub="${esc([av.label, av.setlist, fmtDate(av.date)].filter(Boolean).join(' · '))}" decoding="async">` : '')
    + `<span class="mem-nm"><span>${esc(name)}</span>${span ? `<small title="Dari show pertama sampai terakhir yang tercatat bersama dia (tampil atau ketemu)">${esc(span)}</small>` : ''}</span>`;
  $('mem-body').innerHTML = `<div class="mem-grid c${cells.length}">${cells.join('')}</div>`
    + ((sl => sl.length ? `<h4 class="mem-h">Setlist yang paling sering bareng</h4>` + sl.slice(0, 3).map(([n, c]) => `<div class="mem-r"><span class="mem-rn">${esc(n)}</span><i class="mem-rb"><u style="width:${c / sl[0][1] * 100}%"></u></i><b>${c}×</b></div>`).join('') : '')(m.hasLineup ? m.appSetlists : m.setlists))
    + seatBlock('Kursi saat 2-Shot / Chekicha', m.seats)
    + (m.hasLineup ? seatBlock('Kursi saat dia tampil', m.appSeats) : '')
    + (m.photos.length ? `<h4 class="mem-h">Foto · ${m.photos.length}</h4><div class="mem-ph">${m.photos.map(p => `<img src="${esc(thumbOf(p.src))}" data-full="${esc(p.src)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="${esc(p.label)} dengan ${esc(name)}, ${esc(fmtDate(p.date))}" data-cap="${esc(p.label)} dengan ${esc(name)}" data-sub="${esc([p.setlist, fmtDate(p.date), p.sesi, p.seat ? 'Kursi ' + p.seat : ''].filter(Boolean).join(' · '))}" decoding="async" loading="lazy">`).join('')}</div>` : '');
  $('mem-body').scrollTop = 0;
  openEl('mem-modal');
  countUp($('mem-body'), true);
  $('mem-close').focus({preventScroll: true});
}
$('mem-close').addEventListener('click', () => closeEl('mem-modal'));
$('mem-modal').addEventListener('click', e => {
  if (e.target.id === 'mem-modal') return closeEl('mem-modal');
  const mo = e.target.closest('button[data-more]'); // "+8 lainnya": tampilkan semua kursi
  if (mo) {
    const xs = [...mo.parentElement.querySelectorAll('[data-x]')];
    mo.remove();
    xs.forEach((x, i) => { x.hidden = false; if (!calm()) x.animate([{opacity: 0, transform: 'scale(.6)'}, {opacity: 1, transform: 'none'}], {duration: 520, delay: Math.min(i, 14) * 30, easing: lbEase, fill: 'backwards'}); });
    return;
  }
  const b = e.target.closest('[data-seat]'); // ketuk kursi: tutup statistik member lalu buka riwayat kursi
  if (!b) return;
  const sm = $('seat-modal');
  sm.classList.add('over'); openSeat(b.dataset.seat); // riwayat kursi dibuka DI ATAS kartu member; ditutup = kembali ke kartu
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mem],[data-member]');
  if (b) openMember(b.dataset.mem || b.dataset.member);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.stat[data-member]')) { e.preventDefault(); openMember(e.target.dataset.member); }
});
escHooks.push(() => { if ($('mem-modal').classList.contains('open') && !$('mem-modal').classList.contains('closing')) { closeEl('mem-modal'); return true; } return false; });


// ================= Chip lompat antar bagian (HP / tablet; di laptop dua kolom disembunyikan lewat CSS) =================
(() => {
  const view = $('view-main'), first = document.querySelector('#legend + h2.sec');
  if (!view) return;
  if (first) first.id = 'ch-h';
  const J = [['Ringkasan', () => ($('last') && $('last').children.length ? $('last') : $('stats'))], ['Peta', () => $('filters')], ['Grafik', () => $('ch-h')], ['Member', () => $('mem-h')]];
  const nav = document.createElement('nav');
  nav.id = 'jump'; nav.className = 'jump'; nav.setAttribute('aria-label', 'Lompat ke bagian');
  nav.innerHTML = J.map(([t], i) => `<button type="button" class="btn-s" data-j="${i}">${t}</button>`).join('');
  view.prepend(nav);
  const btns = [...nav.children];
  const off = () => (parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight + 10;
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-j]'), el = b && J[b.dataset.j][1]();
    if (!el || el.hidden) return;
    const y = el.getBoundingClientRect().top + scrollY - off();
    glideTo(Math.max(0, y));
  });
  // gulir beranimasi buatan sendiri (rAF): tidak bergantung pada scroll-behavior bawaan browser,
  // yang mati kalau HP memakai "kurangi animasi". Ini aksi yang sengaja diketuk, jadi tetap dianimasikan.
  let glide = 0;
  const glideTo = y => {
    cancelAnimationFrame(glide);
    const y0 = scrollY, d = y - y0;
    if (Math.abs(d) < 2) return;
    const dur = Math.min(750, 320 + Math.abs(d) * 0.16), t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const stop = () => cancelAnimationFrame(glide);
    addEventListener('wheel', stop, {once: true, passive: true}); addEventListener('touchstart', stop, {once: true, passive: true});
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, y0 + d * ease(t));
      if (t < 1) glide = requestAnimationFrame(step); else document.documentElement.style.scrollBehavior = '';
    };
    glide = requestAnimationFrame(step);
  };
  let raf = 0;
  const mb = $('mem-bar');
  const scroller = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') return e; } return null; };
  const stuckOf = el => { // menempel = tepinya sudah sampai batas atas wadah gulir (halaman, atau kolom kanan di laptop)
    if (!el || !el.offsetHeight) return false;
    const sc = scroller(el), base = sc ? sc.getBoundingClientRect().top : 0;
    return el.getBoundingClientRect().top <= base + (parseFloat(getComputedStyle(el).top) || 0) + 1;
  };
  const mark = () => {
    raf = 0;
    if (mb) mb.classList.toggle('stuck', stuckOf(mb)); // latar baru muncul saat bar benar-benar menempel
    nav.classList.toggle('stuck', stuckOf(nav));
    if (view.hidden || !nav.offsetHeight) return;
    const o = off() + 6;
    let cur = 0;
    J.forEach(([, f], i) => { const el = f(); if (el && !el.hidden && el.getBoundingClientRect().top <= o) cur = i; });
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) cur = J.length - 1; // mentok bawah: bagian terakhir
    btns.forEach((b, i) => { b.classList.toggle('on', i === cur); i === cur ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'); });
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(mark); }, {passive: true, capture: true}); // capture: kolom kanan laptop menggulung sendiri
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(mark); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(mark); }).observe(view); // layout berpindah (satu kolom <-> dua kolom)
  mark(); setTimeout(mark, 800); setTimeout(mark, 3000);
})();

// HP: chip lompat + bar cari member menyingkir saat menggulung ke bawah, muncul lagi saat ke atas (CSS: html.bars-hide)
(() => {
  const root = document.documentElement, mq = matchMedia('(max-width:768px)');
  let y = scrollY, acc = 0, hid = false;
  const set = v => { if (v !== hid) { hid = v; root.classList.toggle('bars-hide', v); } };
  addEventListener('scroll', () => {
    const n = scrollY, d = n - y; y = n;
    if (!mq.matches || n < 160) { acc = 0; return set(false); }
    acc = (d > 0) === (acc > 0) ? acc + d : d; // arah berubah: hitung ulang
    if (acc > 24) set(true); else if (acc < -12) set(false);
  }, {passive: true});
  mq.addEventListener('change', () => set(false));
})();
