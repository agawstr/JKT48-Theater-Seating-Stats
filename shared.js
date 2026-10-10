/* shared.js — dipakai bareng index.html & admin.html
   Butuh elemen: #chart, #total, #seating-wrapper, #stage-container,
   #seat-modal (+ #seat-close, #modal-seat, #modal-hist), #lightbox (+ #lb-img) */
const $ = id => document.getElementById(id);
const lastFocus = {}, timers = {};
const openEl = id => {
  const el = $(id);
  clearTimeout(timers[id]);
  el.classList.remove('closing');
  lastFocus[id] = document.activeElement; // untuk dikembalikan saat ditutup
  el.classList.add('open');
};
const closeEl = id => {
  const el = $(id);
  if (!el.classList.contains('open') || el.classList.contains('closing')) return;
  el.classList.add('closing'); // animasi tutup dulu, baru disembunyikan
  timers[id] = setTimeout(() => { el.classList.remove('open', 'closing'); lastFocus[id]?.focus?.(); }, 160);
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
const KINDS = [
  {k:'ts', q:'2-Shot?', name:'2-Shot', icon:'📸', f:'twoshot', t:'tsType', m:'member', p:'photo',
   types:[['birthday','Birthday 2-Shot'],['roulette','2-Shot Roulette']], short:{birthday:'Birthday 2-Shot', roulette:'2-Shot'}},
  {k:'ck', q:'Chekicha?', name:'Chekicha', icon:'🎴', f:'chekicha', t:'ckType', m:'ckMember', p:'ckPhoto',
   types:[['birthday','Birthday Chekicha'],['roulette','Roulette Chekicha']], short:{birthday:'Birthday Chekicha', roulette:'Chekicha'}}
];
// daftar 2-Shot / Chekicha yang aktif di satu record (roulette ditampilkan singkat)
const extras = r => KINDS.filter(K => r[K.f] === 'Ya')
  .map(K => ({label: K.short[r[K.t]] || K.short.roulette, icon: K.icon, member: r[K.m], photo: r[K.p]}));
const SO = {Malam: 2, Siang: 1};
const MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MON_ID[+m[2] - 1]} ${m[1]}` : (d || ''); }; // 2026-09-25 -> 25 Sep 2026
const cmp = (a, b) => b.date.localeCompare(a.date) || ((SO[b.sesi] || 0) - (SO[a.sesi] || 0));

function sanitize(r, i) {
  r = r || {};
  const o = {
    id: Number(r.id) || Date.now() + i,
    seat: normSeat(r.seat) || String(r.seat || '').toUpperCase(),
    setlist: String(r.setlist || ''), date: String(r.date || ''),
    sesi: ['Siang', 'Malam'].includes(r.sesi) ? r.sesi : '',
    note: String(r.note || ''),
    harga: Math.max(0, Number(r.harga) || 0), // biaya tiket (Rp)
    tiket: String(r.tiket || '').slice(0, 40)
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

// ---------- Render peta ----------
function renderChart() {
  hidePop();
  const counts = {}, all = {}, on = isFiltered();
  records.forEach(r => all[r.seat] = 1);
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
  $('total').textContent = records.length;
  const first = !introDone && records.length > 0; // animasi masuk hanya sekali
  introDone = introDone || first; intro = first;
  $('chart').classList.toggle('intro', first);
  if (first) playEnter($('view-main'));
  renderFilters(); renderStats(); if (first) countUp($('stats'));
  renderSetlists(); renderRows(); renderCal(); renderGallery(); renderTimeline(); renderCover(); renderLast(); renderTickets(); syncUrl();
  requestAnimationFrame(centerChart);
}

function fitChart() {
  const w = $('seating-wrapper'), c = $('stage-container');
  c.style.zoom = '';
  if (!w.clientWidth) return; // tab tersembunyi
  if (window.innerWidth > 768 && c.scrollWidth > w.clientWidth) c.style.zoom = (w.clientWidth / c.scrollWidth).toFixed(3);
}
function centerChart() {
  fitChart();
  const w = $('seating-wrapper'), c = $('stage-container');
  w.scrollLeft = (c.scrollWidth - w.clientWidth) / 2;
}
window.addEventListener('resize', centerChart);

// ---------- Modal riwayat kursi ----------
function openSeat(code) {
  hidePop();
  $('modal-seat').textContent = code;
  const list = records.filter(r => r.seat === code).sort(cmp);
  $('modal-hist').innerHTML = list.length ? list.map(r => `
    <div class="hi">
      <b>${esc(r.setlist)}</b>
      <div class="hd">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''}</div>
      ${r.note ? `<div class="hn">"${esc(r.note)}"</div>` : ''}
      ${extras(r).map(x => `<div class="ht">${x.icon} ${esc(x.label)} dengan ${esc(x.member)}</div>${x.photo ? `<img src="${esc(x.photo)}" data-photo alt="Foto" loading="lazy">` : ''}`).join('')}
      ${r.harga ? `<div class="hn">🎟️ ${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</div>` : ''}
      <button type="button" class="btn-s share" data-share="${r.id}">📤 Bagikan kartu</button>
    </div>`).join('') : `<div class="empty">Belum ada riwayat di kursi ${esc(code)}</div>`;
  openEl('seat-modal');
  $('seat-close').focus();
}

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
          ${extras(r).map(x => `<div class="ht">${x.icon} ${esc(x.label)} dengan ${esc(x.member)}</div>`).join('')}
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
$('seat-modal').addEventListener('click', e => { if (e.target.id === 'seat-modal') closeEl('seat-modal'); });
document.addEventListener('click', e => {
  const im = e.target.closest('img[data-photo]');
  if (im) { $('lb-img').src = im.src; openEl('lightbox'); }
});
$('lightbox').addEventListener('click', () => closeEl('lightbox'));

// Escape: lightbox dulu, lalu hook halaman (mis. dialog konfirmasi admin), terakhir modal kursi
const escHooks = [];
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') return trapTab(e);
  if (e.key !== 'Escape') return;
  if ($('lightbox').classList.contains('open')) closeEl('lightbox');
  else if (!escHooks.some(h => h())) closeEl('seat-modal');
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
const matchF = (r, skip = []) => (skip.includes('setlist') || !filter.setlist || r.setlist === filter.setlist)
  && (!filter.member || extras(r).some(x => x.member === filter.member))
  && (skip.includes('date') || ((!filter.from || r.date >= filter.from) && (!filter.to || r.date <= filter.to)))
  && (skip.includes('row') || !filter.row || r.seat[0] === filter.row);
const viewEx = skip => { // saat putar ulang: hanya N show pertama menurut tanggal
  const l = records.filter(r => matchF(r, skip));
  return replayN === null ? l : l.sort((a, b) => cmp(b, a)).slice(0, replayN);
};
const view = () => viewEx([]); // record yang lolos semua filter (dipakai peta)

// warna heatmap: makin sering makin terang
const HEAT = [
  {min:1, bg:'#5c2e0c', fg:'#ffd9b0', bd:'#8a4b1a'},
  {min:2, bg:'#8f4a0a', fg:'#fff0dd', bd:'#b8620a'},
  {min:3, bg:'#c96a00', fg:'#fff',    bd:'#e07a00'},
  {min:5, bg:'#ff8c00', fg:'#000',    bd:'#ffaa00'},
  {min:8, bg:'#ffd23f', fg:'#000',    bd:'#fff3b0'}];
const heat = c => HEAT.filter(h => c >= h.min).pop();
const heatLabel = (h, i) => HEAT[i + 1] ? (HEAT[i + 1].min - 1 > h.min ? `${h.min}–${HEAT[i + 1].min - 1}×` : `${h.min}×`) : `${h.min}+×`;

// kontainer disisipkan lewat JS supaya index & admin otomatis sama
const wrapEl = $('seating-wrapper');
wrapEl.insertAdjacentHTML('beforebegin', `<div id="last"></div><div id="stats"></div><div id="cover"></div>
  <div id="filters">
    <select id="flt-setlist" aria-label="Filter setlist"></select>
    <select id="flt-member" aria-label="Filter member"></select>
    <input type="date" id="flt-from" aria-label="Dari tanggal"><input type="date" id="flt-to" aria-label="Sampai tanggal">
    <button type="button" class="btn-s" id="flt-reset">Reset</button><span id="flt-info"></span>
  </div>`);
wrapEl.insertAdjacentHTML('afterend', `<div id="legend"></div>
  <h2 class="sec">Total kunjungan per setlist <small class="hint">· klik untuk memfilter peta</small></h2><div id="sl-chart"></div>
  <h2 class="sec">Sebaran per baris <small class="hint">· klik untuk memfilter peta</small></h2><div id="rchart"></div><div id="rsum"></div>
  <h2 class="sec">Kalender kehadiran <small class="hint">· klik untuk memfilter peta</small></h2><div id="cal-nav"></div><div id="cal"></div>
  <h2 class="sec" id="mc-h">Kunjungan per bulan</h2><div id="mchart"></div>`);
$('flt-from').value = filter.from;
$('flt-to').value = filter.to;
$('legend').innerHTML = 'Jumlah kunjungan: ' + HEAT.map((h, i) =>
  `<span class="lg"><i style="background:${h.bg};border-color:${h.bd}"></i>${heatLabel(h, i)}</span>`).join('') +
  '<button type="button" class="btn-s" id="png-btn">📷 Simpan peta (PNG)</button><button type="button" class="btn-s" id="rp-btn">▶ Putar ulang</button><button type="button" class="btn-s" id="wrap-btn">✨ Wrapped</button>';

function renderFilters() {
  const opts = (id, vals, ph) => {
    const cur = filter[id.slice(4)];
    $(id).innerHTML = `<option value="">${ph}</option>` + (cur && !vals.includes(cur) ? [...vals, cur] : vals).map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  opts('flt-setlist', [...new Set(records.map(r => r.setlist).filter(Boolean))].sort(), 'Semua setlist');
  opts('flt-member', [...new Set(records.flatMap(r => extras(r).map(x => x.member)).filter(Boolean))].sort(), 'Semua member');
  $('flt-info').textContent = isFiltered() ? `${filter.row ? 'Baris ' + filter.row + ' · ' : ''}${view().length} dari ${records.length} show cocok` : '';
}
$('filters').addEventListener('change', e => {
  const k = {'flt-setlist': 'setlist', 'flt-member': 'member', 'flt-from': 'from', 'flt-to': 'to'}[e.target.id];
  if (k) { filter[k] = e.target.value; renderChart(); }
});
$('flt-reset').addEventListener('click', () => {
  Object.keys(filter).forEach(k => filter[k] = '');
  $('flt-from').value = $('flt-to').value = '';
  renderChart();
});

// seri: pilih baris paling depan (A = dekat panggung), lalu nomor paling kanan
const seatTie = (a, b) => a[0].localeCompare(b[0]) || parseInt(b.slice(2)) - parseInt(a.slice(2));
function renderStats() {
  const by = (fn, tie) => tally(view(), fn, tie);
  const card = (l, v, s) => `<div class="stat"><div class="sv${String(v).length > 9 ? ' sm' : ''}"${typeof v === 'number' ? ` data-n="${v}"` : ''}>${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${esc(s)}</div>` : ''}</div>`;
  const st = top => top ? [top[0], top[1] + '×'] : ['-', ''];
  const paid = view().filter(r => r.harga > 0), tot = paid.reduce((a, r) => a + r.harga, 0);
  $('stats').innerHTML = [
    card('Total show', view().length),
    card('Kursi favorit', ...st(by(r => r.seat, seatTie))),
    card('Baris favorit', ...st(by(r => r.seat[0], (a, b) => a.localeCompare(b)))),
    card('2-Shot', view().filter(r => r.twoshot === 'Ya').length),
    card('Chekicha', view().filter(r => r.chekicha === 'Ya').length),
    card('Member terbanyak', ...st(by(r => extras(r).map(x => x.member)))),
    ...(tot ? [card('Total biaya', rupiah(tot)), card('Rata-rata / show', rupiah(tot / paid.length), `dari ${paid.length} show berbayar`)] : [])
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
  const ov = [...document.querySelectorAll('.overlay.open')].pop();
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

// angka naik dari 0 (hanya saat pertama kali tampil)
function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-n]').forEach(el => {
    const n = +el.dataset.n, t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 800);
      el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
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
  $('wrap-btn').textContent = `✨ Wrapped ${calYear}`;
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
  $('mc-h').innerHTML = `Kunjungan per bulan (${calYear}) <small class="hint">· klik untuk memfilter peta</small>`;
  $('mchart').innerHTML = mc.map((n, i) => `<div class="mc${filter.from === mkey(i) + '-01' && filter.to.startsWith(mkey(i)) ? ' on' : ''}"${n ? ` data-mo="${mkey(i)}" role="button" tabindex="0"` : ''} style="--i:${i}" title="${mon[i]}: ${n} show${ms[i] ? ' · ' + rupiah(ms[i]) : ''}"><span class="mc-n">${n || ''}</span><div class="mc-b"><i style="height:${n / mx * 100}%"></i></div><span class="mc-l">${mon[i]}</span></div>`).join('');
}
$('cal-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-cy]');
  if (!b) return;
  calYear = +calYears[calYears.indexOf(String(calYear)) + Number(b.dataset.cy)];
  renderCal();
});

// galeri foto 2-Shot / Chekicha (hanya jika halaman punya #gallery)
function renderGallery() {
  const g = $('gallery');
  if (!g) return;
  const items = records.flatMap(r => extras(r).filter(x => x.photo).map(x => ({...x, r}))).sort((a, b) => cmp(a.r, b.r));
  const sel = $('g-member'), cur = sel.value;
  const mem = [...new Set(items.map(x => x.member).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua member</option>' + mem.map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
  const list = cur ? items.filter(x => x.member === cur) : items;
  $('g-info').textContent = `${list.length} foto`;
  if ($('g-tab') && dataLoaded) $('g-tab').textContent = `Galeri (${items.length})`;
  g.innerHTML = list.length ? list.map((x, i) => `<figure class="gi" style="--i:${Math.min(i, 14)}"><img src="${esc(x.photo)}" data-photo alt="${esc(x.label)} dengan ${esc(x.member)}" loading="lazy">
    <figcaption><b>${esc(x.member) || '-'}</b><span>${x.icon} ${esc(x.label)}</span><span>${esc(x.r.setlist)} · ${esc(fmtDate(x.r.date))}</span></figcaption></figure>`).join('')
    : '<div class="empty">Belum ada foto</div>';
}
$('g-member')?.addEventListener('change', renderGallery);

// peta mini di canvas: counts = kode->jumlah (warna heatmap), hl = kursi yang disorot (opsional)
function drawMiniMap(c, cx, y0, cw, g, counts, hl) {
  const gap = 18, ch = cw * 1.1;
  const bw = [0, 1, 2, 3].map(j => Math.max(...LAYOUT.map(r => r[j].length)) * (cw + g) - g);
  let x0 = cx - (bw.reduce((a, b) => a + b) + gap * 3) / 2;
  for (let j = 0; j < 4; j++) {
    LAYOUT.forEach((row, i) => {
      const w = row[j].length * (cw + g) - g, y = y0 + i * (ch + g);
      row[j].forEach((code, k) => {
        const x = (j % 2 ? x0 : x0 + bw[j] - w) + k * (cw + g), n = counts[code], h = n ? heat(n) : null;
        c.beginPath(); c.roundRect(x, y, cw, ch, 5);
        if (code === hl) { c.shadowColor = '#ff8c00'; c.shadowBlur = 36; }
        c.fillStyle = code === hl ? '#ffd23f' : h ? h.bg : '#2a0f18';
        c.fill(); c.shadowBlur = 0;
      });
    });
    x0 += bw[j] + gap;
  }
}

// kartu "Wrapped" untuk tahun yang dipilih di kalender, disimpan sebagai PNG
function wrapped() {
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
  const counts = {};
  rs.forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2a0612'); bg.addColorStop(1, '#0d090d');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const gl = c.createRadialGradient(W / 2, 120, 0, W / 2, 120, 650);
  gl.addColorStop(0, 'rgba(255,42,95,.38)'); gl.addColorStop(1, 'rgba(255,42,95,0)');
  c.fillStyle = gl; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.roundRect(W / 2 - 240, 50, 480, 56, 28); c.fill();
  c.fillStyle = '#e4e4e7'; c.font = '700 24px sans-serif'; c.fillText('T H E A T E R   W R A P P E D', W / 2, 86);
  const gt = c.createLinearGradient(W / 2 - 320, 0, W / 2 + 320, 0);
  gt.addColorStop(0, '#ff2a5f'); gt.addColorStop(1, '#ffb347');
  c.fillStyle = gt; c.shadowColor = 'rgba(255,42,95,.6)'; c.shadowBlur = 40;
  c.font = '900 210px sans-serif'; c.fillText(y, W / 2, 290);
  c.shadowBlur = 0;
  c.fillStyle = '#fff'; c.font = '800 44px sans-serif';
  c.fillText(`${rs.length} show · ${Object.keys(counts).length} kursi berbeda`, W / 2, 358);
  c.fillStyle = '#ff2a5f'; c.font = '800 20px sans-serif'; c.fillText('S T A G E', W / 2, 410);
  drawMiniMap(c, W / 2, 428, 26, 3, counts, null);
  rows.forEach(([label, val, n], i) => {
    const x = 90 + (i % 2) * 460, yy = 780 + Math.floor(i / 2) * 200;
    c.fillStyle = 'rgba(255,255,255,.06)'; c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x, yy, 440, 180, 24); c.fill(); c.stroke();
    c.textAlign = 'left';
    c.fillStyle = '#a1a1aa'; c.font = '700 22px sans-serif'; c.fillText(label, x + 30, yy + 48);
    c.fillStyle = '#fff'; fitFont(c, String(val), 380, 46, 800); c.fillText(val, x + 30, yy + 108);
    c.fillStyle = '#ff8c00'; c.font = '900 34px sans-serif'; c.fillText(n ? n + '×' : '', x + 30, yy + 155);
  });
  const paid = rs.reduce((a, r) => a + (r.harga || 0), 0);
  c.textAlign = 'center'; c.fillStyle = '#e4e4e7'; c.font = '700 32px sans-serif';
  c.fillText(`📸 ${rs.filter(r => r.twoshot === 'Ya').length} 2-Shot  ·  🎴 ${rs.filter(r => r.chekicha === 'Ya').length} Chekicha${paid ? '  ·  🎟️ ' + rupiah(paid) : ''}`, W / 2, 1230);
  c.fillStyle = '#9a9aa4'; c.font = '600 26px sans-serif'; c.fillText(document.querySelector('h1').textContent, W / 2, 1300);
  const a = document.createElement('a');
  a.download = `wrapped-${y}.png`; a.href = cv.toDataURL('image/png'); a.click();
}
$('wrap-btn').addEventListener('click', wrapped);

// ================= Riwayat (timeline) & cakupan kursi =================
let showUnv = false;
function renderCover() {
  const got = new Set(view().map(r => r.seat).filter(s => SEATS.has(s))).size, tot = SEATS.size, pct = Math.round(got / tot * 100);
  $('cover').innerHTML = `<div class="cov-t"><b>Kursi terisi ${got} dari ${tot}</b><span>${pct}%</span></div>
    <div class="cov-bar"><i style="width:${pct}%"></i></div>
    <div class="cov-s"><span>${tot - got} kursi belum pernah ditempati</span>
    <button type="button" class="btn-s" id="cov-btn" aria-pressed="${showUnv}">${showUnv ? 'Tampilkan semua' : '🎯 Sorot yang belum'}</button></div>`;
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
  const hay = r => [r.setlist, r.seat, r.date, r.sesi, r.note, ...extras(r).flatMap(x => [x.member, x.label])].join(' ').toLowerCase();
  const list = q ? all.filter(r => q.split(/\s+/).every(w => hay(r).includes(w))) : all; // semua kata harus cocok
  if ($('tl-info')) $('tl-info').textContent = q ? `${list.length} dari ${all.length} show` : '';
  const mon = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const numOf = new Map(all.slice().reverse().map((r, i) => [r.id, i + 1])); // nomor urut show sepanjang masa
  let cur = '', curY = '', html = '', cnt = 0;
  for (const r of list) {
    const ym = r.date.slice(0, 7), n = numOf.get(r.id), ms = n === 1 || n === 10 || n % 25 === 0; // milestone
    if (r.date.slice(0, 4) !== curY) { curY = r.date.slice(0, 4); html += `<div class="tl-yh">${esc(curY) || '–'}</div>`; }
    if (ym !== cur) {
      cur = ym;
      html += `<h3 class="tl-mh">${/^\d{4}-\d{2}$/.test(ym) ? mon[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4) : 'Tanpa tanggal'}</h3>`;
    }
    html += `<div class="tl-i${ms ? ' ms' : ''}" style="--i:${Math.min(cnt++, 14)}"><div class="tl-d"><b>${esc(r.date.slice(8)) || '–'}</b><span>${esc(r.sesi)}</span></div>
      <div class="tl-b"><b>${esc(r.setlist) || '(tanpa setlist)'}</b>${ms ? `<div class="tl-star">⭐ Show ke-${n}</div>` : ''}${r.harga ? `<div class="hn">🎟️ ${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</div>` : ''}
        ${extras(r).map(x => `<div class="ht">${x.icon} ${esc(x.label)} dengan ${esc(x.member)}</div>`).join('')}
        ${r.note ? `<div class="hn">"${esc(r.note)}"</div>` : ''}</div>
      <button type="button" class="seat-badge tl-s" data-seat="${esc(r.seat)}" aria-label="Lihat kursi ${esc(r.seat)}">${esc(r.seat)}</button></div>`;
  }
  el.innerHTML = html || `<div class="empty">${q ? 'Tidak ada show yang cocok' : 'Belum ada riwayat'}</div>`;
}
$('timeline')?.addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});

let tlT; // jeda singkat supaya tidak render ulang di setiap ketikan
$('tl-q')?.addEventListener('input', () => { clearTimeout(tlT); tlT = setTimeout(renderTimeline, 150); });

// ================= Putar ulang, sebaran baris, biaya, kartu per show =================
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
let replayN = null, replayT = 0;
function stopReplay() {
  clearInterval(replayT); replayN = null;
  $('rp-btn').textContent = '▶ Putar ulang';
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
    $('rp-btn').textContent = `⏹ ${replayN}/${list.length} · ${fmtDate(list[replayN - 1].date)}`;
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
  do { c.font = `${wt} ${size}px sans-serif`; size -= 2; } while (c.measureText(txt).width > max && size > 20);
}
// kartu bagikan untuk satu show (pakai foto 2-Shot/Chekicha jika ada)
function shareCard(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const pic = extras(r).find(x => x.photo), W = 1080, H = 1350;
  const draw = img => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2a0612'); bg.addColorStop(1, '#0d090d');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#a1a1aa'; c.font = '700 28px sans-serif'; c.fillText('T H E A T E R   S T A T S', W / 2, 90);
    const x = 90, y = 130, w = W - 180, h = 640;
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 28); c.clip();
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      c.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
    } else { // tanpa foto: peta mini dengan kursi ini menyala
      c.fillStyle = '#180a10'; c.fillRect(x, y, w, h);
      c.fillStyle = '#ff2a5f'; c.font = '800 22px sans-serif'; c.fillText('S T A G E', W / 2, y + 50);
      drawMiniMap(c, W / 2, y + 72, 26, 3, {}, r.seat);
      c.fillStyle = '#ffd23f'; c.font = '900 150px sans-serif'; c.fillText(r.seat, W / 2, y + h - 56);
    }
    c.restore();
    c.fillStyle = '#fff'; fitFont(c, r.setlist, w, 64, 900); c.fillText(r.setlist, W / 2, 870);
    const tgl = new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'});
    c.fillStyle = '#ff2a5f'; c.font = '700 38px sans-serif'; c.fillText(tgl + (r.sesi ? ' · ' + r.sesi : ''), W / 2, 935);
    c.fillStyle = '#ff8c00'; c.font = '900 56px sans-serif'; c.fillText('Kursi ' + r.seat, W / 2, 1020);
    let yy = 1085;
    c.fillStyle = '#34d399'; c.font = '700 34px sans-serif';
    extras(r).forEach(e => { c.fillText(`${e.icon} ${e.label} dengan ${e.member}`, W / 2, yy); yy += 50; });
    if (r.note && yy < 1200) { c.fillStyle = '#a1a1aa'; fitFont(c, `"${r.note}"`, w, 30, 'italic 400'); c.fillText(`"${r.note}"`, W / 2, yy + 5); }
    c.fillStyle = '#9a9aa4'; c.font = '600 26px sans-serif'; c.fillText(document.querySelector('h1').textContent, W / 2, 1310);
    try {
      const a = document.createElement('a');
      a.download = `show-${r.date}-${r.seat}.png`; a.href = cv.toDataURL('image/png'); a.click();
    } catch (e) { alert('Foto dari situs lain tidak bisa dipakai di kartu. Pakai foto lokal (folder photos/).'); }
  };
  if (!pic) return draw(null);
  const im = new Image();
  if (/^https?:/i.test(pic.photo)) im.crossOrigin = 'anonymous';
  im.onload = () => draw(im);
  im.onerror = () => { alert('Foto show ini gagal dimuat, jadi kartu dibuat tanpa foto. Cek apakah folder photos/ sudah di-upload ke repo.'); draw(null); };
  im.src = pic.photo;
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
    ${ph ? `<img src="${esc(ph.photo)}" alt="Foto show terakhir" data-photo>` : `<div class="last-s">${esc(r.seat)}</div>`}
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
    member: up(t.member), lane: up(t.lane), session: up(t.session), bought: Math.max(1, Number(t.bought) || 1), cat: fixCat(up(t.cat)), status: up(t.status)
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

let evCat = '', evLimit = 12, rkAll = false;
const EV_PAGE = 12; // jumlah seri per tampilan
let dataLoaded = false; // false selama data masih dimuat
function renderTickets() {
  const box = $('lot');
  if (!box) return;
  $('ev-tab').hidden = dataLoaded && !tickets.length; // tetap tampil selama data dimuat; disembunyikan hanya jika data.json memang tanpa tiket
  const ls = lotteryStats(tickets), done = ls.win + ls.lose;
  const refs = tickets.filter(t => t.status === 'refund'); // menang undian tapi show dibatalkan & di-refund
  const names = {SHOW: 'Show teater', EXCLUSIVE: 'Exclusive / M&G', EVENT: 'Event'};
  const card = (l, v, s, c = '') => `<div class="stat${c}"><div class="sv">${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${esc(s)}</div>` : ''}</div>`;
  const sh = ls.by['Show teater'], shDone = sh ? sh.win + sh.lose : 0;
  const shCard = shDone ? card('Persentase menang (show teater)', (sh.win / shDone * 100).toFixed(1).replace(/\.0$/, '') + '%', `${sh.win} dari ${shDone} yang sudah diundi`, ' main') : '';
  box.innerHTML = !ls.total ? '<div class="empty">Belum ada data lotre</div>' :
    `<div class="lot-cards">${card('Entri lotre', ls.total)}${card(ls.inferred ? 'Menang (perkiraan)' : 'Menang', ls.win, refs.length ? `${refs.length} dibatalkan & di-refund` : '')}${card('Kalah', ls.lose)}${shCard}${card('Persentase menang (semua jenis)', done ? ls.pct.toFixed(1) + '%' : '-', done ? `${ls.win} dari ${done} yang sudah diundi` : '')}</div>` +
    Object.entries(ls.by).map(([ty, b]) => {
      const d = b.win + b.lose, p = d ? b.win / d * 100 : 0;
      return `<div class="lot-r"><span>${names[ty] || esc(ty)}</span><span class="sl-bar"><i style="width:${p}%"></i></span><span>${b.win ? b.win + ' menang' : '0 menang terdeteksi'} · ${b.lose} kalah${d && b.win ? ` (${p.toFixed(0)}%)` : ''}</span></div>`;
    }).join('') +
    (ls.inferred ? '<p class="lot-n">Menang dihitung dari tiket tanpa status kalah pada show/event yang punya lotre, karena jkt48.com tidak memberi status menang. Tiket yang dibeli langsung tanpa lotre ikut terhitung.</p>' : '') +
    (refs.length ? `<p class="lot-n">Menang undian tapi dibatalkan dan di-refund: ${refs.map(t => esc(fmtDate(t.date) + ' ' + t.name)).join(', ')}.</p>` : '') +
    (ls.other ? `<p class="lot-n">Status lain (belum diundi / tidak dikenali): ${Object.entries(ls.raw).map(([k, n]) => `${esc(k)} ×${n}`).join(', ')}</p>` : '');

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
    .map(([k, l, n, z]) => `<button type="button" class="ev-c${k === evCat ? ' on' : ''}" data-cat="${esc(k)}" aria-pressed="${k === evCat}"><b>${n}</b><span>${esc(l)}</span><small>${z} seri</small></button>`).join('');

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
    const n = g.items.length, usd = g.items.filter(t => t.used > 0).length, up = g.items.filter(t => t.date > td).length, mem = {};
    g.items.forEach(t => { if (t.member) mem[t.member] = (mem[t.member] || 0) + 1; });
    const ms = Object.entries(mem).sort((a, b) => b[1] - a[1]), first = g.items[n - 1].date;
    const range = first === g.last ? fmtDate(g.last) : `${fmtDate(first)} – ${fmtDate(g.last)}`;
    const chip = up ? `<span class="chip soon">Mendatang${up < n ? ` ${up}/${n}` : ''}</span>` : usd ? `<span class="chip ok">Hadir${usd < n ? ` ${usd}/${n}` : ''}</span>`
      : g.items.every(t => raffleOf(t.raffle) === 'lose') ? '<span class="chip lose">Kalah lotre</span>' : g.cat === 'Video Call' ? '' : '<span class="chip no">Tidak terpakai</span>';
    return `<details class="ev-g" style="--i:${Math.min(i, 14)}"><summary>
      <div class="tl-d"><b>${esc(g.last.slice(8))}</b><span>${MON_ID[+g.last.slice(5, 7) - 1]} ${esc(g.last.slice(2, 4))}</span></div>
      <div class="tl-b"><b>${esc(g.name)}</b><div class="hn">${esc(g.cat)} · ${n} sesi · ${esc(range)}</div>
        ${ms.length ? `<div class="mchips">${ms.slice(0, 5).map(([m, c]) => `<span class="mchip">${esc(m)}${c > 1 ? ' ×' + c : ''}</span>`).join('')}${ms.length > 5 ? `<span class="mchip">+${ms.length - 5}</span>` : ''}</div>` : ''}</div>
      ${chip}</summary>
      <div class="ev-d">${g.items.map(t => `<div class="ev-t"><span>${esc(fmtDate(t.date))}${t.start ? ' · ' + esc(t.start.slice(0, 5)) : ''}</span><span>${esc([t.member, t.lane, t.session].filter(Boolean).join(' · ')) || '–'}${t.bought > 1 ? ' · ' + t.bought + ' tiket' : ''}</span>${chipOf(t)}</div>`).join('')}</div></details>`;
  };

  const upc = grouper(ev.filter(t => t.date > td)); // tiket mendatang selalu di paling atas
  $('ev-up').innerHTML = upc.length ? '<h3 class="sec2">Mendatang</h3>' + upc.map(groupHtml).join('') : '';

  const scope = ev.filter(t => t.date <= td && (!evCat || tcat(t) === evCat));
  const mc = {}, mt = {};
  scope.forEach(t => { if (t.member) { mc[t.member] = (mc[t.member] || 0) + 1; mt[t.member] = (mt[t.member] || 0) + t.bought; } });
  const rankAll = Object.entries(mc).sort((a, b) => b[1] - a[1]), rank = rkAll ? rankAll : rankAll.slice(0, 5), mx = rankAll.length ? rankAll[0][1] : 1;
  $('ev-rank').innerHTML = rank.length ? `<h3 class="sec2">Peringkat member${evCat ? ' · ' + esc(evCat) : ''}</h3>` + rank.map(([m, c], i) =>
    `<button type="button" style="--i:${i}" class="rk${m === cur ? ' on' : ''}" data-m="${esc(m)}" title="${mt[m]} tiket"><span class="rn">${i + 1}</span><span class="rm">${esc(m)}</span><span class="sl-bar"><i style="width:${c / mx * 100}%"></i></span><span class="rc">${c} sesi</span></button>`).join('') + (rankAll.length > 5 ? `<button type="button" class="btn-s" id="ev-rkmore">${rkAll ? 'Tampilkan 5 teratas' : `Lihat semua (${rankAll.length})`}</button>` : '') : '';

  const list = scope.filter(t => (!cur || t.member === cur) && (!st || t.used > 0));
  const groups = grouper(list);
  $('ev-info').textContent = `${groups.length} seri · ${list.length} tiket`;
  $('ev-list').innerHTML = groups.length ? groups.slice(0, evLimit).map(groupHtml).join('') : '<div class="empty">Tidak ada tiket yang cocok</div>';
  $('ev-more').hidden = groups.length <= evLimit;
  $('ev-more').textContent = `Tampilkan ${Math.max(0, Math.min(EV_PAGE, groups.length - evLimit))} lagi (sisa ${Math.max(0, groups.length - evLimit)})`;
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
    $('flt-from').value = filter.from; $('flt-to').value = filter.to;
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
