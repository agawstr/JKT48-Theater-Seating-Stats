/* shared.js — dipakai bareng index.html & admin.html
   Butuh elemen: #chart, #total, #seating-wrapper, #stage-container,
   #seat-modal (+ #seat-close, #modal-seat, #modal-hist), #lightbox (+ #lb-img) */
const $ = id => document.getElementById(id);
const openEl = id => $(id).classList.add('open');
const closeEl = id => $(id).classList.remove('open');

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
  const counts = {};
  records.forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const seat = code => {
    const c = counts[code] || 0;
    return `<button type="button" class="seat${c ? ' visited' : ''}" data-seat="${code}" aria-label="Kursi ${code}${c ? `, ${c} kali` : ''}">
      <span>${code}</span>${c ? `<span class="seat-count">${c}</span>` : ''}</button>`;
  };
  $('chart').innerHTML = [0, 1, 2, 3].map(j =>
    `<div class="seat-block block-${j + 1}">` +
    LAYOUT.map(row => `<div class="seat-row">${row[j].map(seat).join('')}</div>`).join('') + '</div>').join('');
  $('total').textContent = records.length;
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
  if (e.key !== 'Escape') return;
  if ($('lightbox').classList.contains('open')) closeEl('lightbox');
  else if (!escHooks.some(h => h())) closeEl('seat-modal');
});
