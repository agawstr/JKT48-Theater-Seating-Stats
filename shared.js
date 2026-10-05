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
const okPhoto = p => typeof p === 'string' && (p.startsWith('data:image/') || /^https?:\/\//i.test(p));
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
const cmp = (a, b) => b.date.localeCompare(a.date) || ((SO[b.sesi] || 0) - (SO[a.sesi] || 0));

function sanitize(r, i) {
  r = r || {};
  const o = {
    id: Number(r.id) || Date.now() + i,
    seat: normSeat(r.seat) || String(r.seat || '').toUpperCase(),
    setlist: String(r.setlist || ''), date: String(r.date || ''),
    sesi: ['Siang', 'Malam'].includes(r.sesi) ? r.sesi : '',
    note: String(r.note || '')
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
    return `<button type="button" class="seat${c ? ' visited' : ''}${on && all[code] && !c ? ' dim' : ''}" data-seat="${code}"${st} aria-label="Kursi ${code}${c ? `, ${c} kali` : ''}">
      <span>${code}</span>${c ? `<span class="seat-count">${c}</span>` : ''}</button>`;
  };
  $('chart').innerHTML = [0, 1, 2, 3].map(j =>
    `<div class="seat-block block-${j + 1}">` +
    LAYOUT.map(row => `<div class="seat-row">${row[j].map(seat).join('')}</div>`).join('') + '</div>').join('');
  $('total').textContent = records.length;
  renderFilters(); renderStats(); renderSetlists();
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
      <div class="hd">${esc(r.date)}${r.sesi ? ' · ' + r.sesi : ''}</div>
      ${r.note ? `<div class="hn">"${esc(r.note)}"</div>` : ''}
      ${extras(r).map(x => `<div class="ht">${x.icon} ${esc(x.label)} dengan ${esc(x.member)}</div>${x.photo ? `<img src="${esc(x.photo)}" data-photo alt="Foto" loading="lazy">` : ''}`).join('')}
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
          <div class="hd">${esc(r.date)}${r.sesi ? ' · ' + r.sesi : ''}</div>
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
const filter = {setlist: '', member: '', from: '', to: ''};
const isFiltered = () => Object.values(filter).some(Boolean);
const matchF = r => (!filter.setlist || r.setlist === filter.setlist)
  && (!filter.member || extras(r).some(x => x.member === filter.member))
  && (!filter.from || r.date >= filter.from) && (!filter.to || r.date <= filter.to);
const view = () => records.filter(matchF); // record yang lolos filter (dipakai peta)

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
wrapEl.insertAdjacentHTML('beforebegin', `<div id="stats"></div>
  <div id="filters">
    <select id="f-setlist" aria-label="Filter setlist"></select>
    <select id="f-member" aria-label="Filter member"></select>
    <input type="date" id="f-from" aria-label="Dari tanggal"><input type="date" id="f-to" aria-label="Sampai tanggal">
    <button type="button" class="btn-s" id="f-reset">Reset</button><span id="f-info"></span>
  </div>`);
wrapEl.insertAdjacentHTML('afterend', `<div id="legend"></div>
  <h2 class="sec">Total kunjungan per setlist</h2><div id="sl-chart"></div>`);
$('legend').innerHTML = 'Jumlah kunjungan: ' + HEAT.map((h, i) =>
  `<span class="lg"><i style="background:${h.bg};border-color:${h.bd}"></i>${heatLabel(h, i)}</span>`).join('') +
  '<button type="button" class="btn-s" id="png-btn">📷 Simpan peta (PNG)</button>';

function renderFilters() {
  const opts = (id, vals, ph) => {
    const cur = filter[id.slice(2)];
    $(id).innerHTML = `<option value="">${ph}</option>` + vals.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  opts('f-setlist', [...new Set(records.map(r => r.setlist).filter(Boolean))].sort(), 'Semua setlist');
  opts('f-member', [...new Set(records.flatMap(r => extras(r).map(x => x.member)).filter(Boolean))].sort(), 'Semua member');
  $('f-info').textContent = isFiltered() ? `${view().length} dari ${records.length} show cocok` : '';
}
$('filters').addEventListener('change', e => {
  const k = {'f-setlist': 'setlist', 'f-member': 'member', 'f-from': 'from', 'f-to': 'to'}[e.target.id];
  if (k) { filter[k] = e.target.value; renderChart(); }
});
$('f-reset').addEventListener('click', () => {
  Object.keys(filter).forEach(k => filter[k] = '');
  $('f-from').value = $('f-to').value = '';
  renderChart();
});

function renderStats() {
  const by = fn => {
    const o = {};
    records.forEach(r => [].concat(fn(r)).forEach(k => k && (o[k] = (o[k] || 0) + 1)));
    return Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  };
  const card = (l, v, s) => `<div class="stat"><div class="sv">${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${esc(s)}</div>` : ''}</div>`;
  const st = top => top ? [top[0], top[1] + '×'] : ['-', ''];
  $('stats').innerHTML = [
    card('Total show', records.length),
    card('Kursi favorit', ...st(by(r => r.seat))),
    card('Baris favorit', ...st(by(r => r.seat[0]))),
    card('2-Shot', records.filter(r => r.twoshot === 'Ya').length),
    card('Chekicha', records.filter(r => r.chekicha === 'Ya').length),
    card('Member terbanyak', ...st(by(r => extras(r).map(x => x.member))))
  ].join('');
}

// bar horizontal: total kunjungan per setlist (klik = filter peta)
function renderSetlists() {
  const o = {};
  records.forEach(r => { const k = r.setlist || '(tanpa setlist)'; o[k] = (o[k] || 0) + 1; });
  const rows = Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = rows.length ? rows[0][1] : 1;
  $('sl-chart').innerHTML = rows.length ? rows.map(([k, n]) => `
    <button type="button" class="sl-row${filter.setlist === k ? ' on' : ''}" data-setlist="${esc(k)}" title="Klik untuk filter peta">
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
