/* Layar muat 2-bit, murni canvas. Dipakai index.html dan admin.html.
   Cara kerja: tampil minimal MIN ms (supaya tidak berkedip) dan baru menutup setelah SEMUA tahap di data-stages
   ditandai selesai lewat Splash.mark('nama'). Batas atas MAX ms: tutup paksa kalau ada yang macet. */
(() => {
  const el = document.getElementById('splash'), cv = document.getElementById('splash-cv');
  if (!el || !cv) return;
  const W = 80, H = 45, x = cv.getContext('2d');
  const P = ['#0d090d', '#881337', '#ff2a5f', '#ffd23f']; // latar, bordeaux, pink, emas
  const MIN = +el.dataset.min || 2400, MAX = +el.dataset.max || 6000;
  const need = (el.dataset.stages || 'ready').split(/\s+/).filter(Boolean);
  const got = new Set(), t0 = performance.now(), lab = document.getElementById('splash-t');
  let f = 0, closed = false;

  const fit = () => { cv.style.width = W * Math.max(2, Math.floor(Math.min(innerWidth - 48, 400) / W)) + 'px'; }; // skala bulat -> piksel rata
  fit(); addEventListener('resize', fit);

  const R = (c, px, py, w, h) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
  const spr = (rows, px, py, c) => rows.forEach((r, j) => [...r].forEach((v, i) => v === '1' && R(c, px + i, py + j, 1, 1)));
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  const FONT = {L: ['100', '100', '100', '100', '111'], O: ['111', '101', '101', '101', '111'], A: ['010', '101', '111', '101', '101'], D: ['110', '101', '101', '101', '110'], I: ['111', '010', '010', '010', '111'], N: ['101', '111', '111', '101', '101'], G: ['011', '100', '101', '101', '011']};
  const SPARK = [[6, 6], [72, 8], [12, 26], [68, 25], [5, 35], [74, 36]];

  const progress = () => Math.min(need.length ? got.size / need.length : 1, (performance.now() - t0) / MIN);

  function frame() {
    const p = progress();
    R(P[0], 0, 0, W, H);
    for (let i = 0; i < W; i += 2) R(P[1], i, 40, 1, 1), R(P[1], i + 1, 41, 1, 1); // lantai
    R(P[1], 0, 42, W, 3);
    SPARK.forEach(([sx, sy], i) => { // bintang / penlight berkedip
      const k = ((f >> 2) + i) % 6;
      if (k < 3) R(P[2], sx, sy, 1, 1);
      if (k === 0) { R(P[1], sx - 1, sy, 1, 1); R(P[1], sx + 1, sy, 1, 1); R(P[1], sx, sy - 1, 1, 1); R(P[1], sx, sy + 1, 1, 1); }
    });
    const by = 5 + ((f >> 2) & 1); // hati melayang
    spr(HEART, 37, by + 1, P[1]); spr(HEART, 36, by, P[2]); R(P[3], 38, by + 1, 2, 1);
    for (let i = 0; i < 10; i++) { // deretan kursi terisi seperti heatmap di peta
      const k = ((f >> 1) - i + 48) % 16, lvl = k < 4 ? k : (k < 9 ? 3 : 0), sx = 10 + i * 6, sy = 15;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 5; xx++) {
        const c = lvl === 0 ? P[1] : lvl === 1 ? (((xx + yy) & 1) ? P[2] : P[1]) : lvl === 2 ? P[2] : P[3];
        R(c, sx + xx, sy + yy, 1, 1);
      }
    }
    let tx = 24; // teks LOADING + titik
    for (const ch of 'LOADING') { spr(FONT[ch], tx, 23, P[3]); tx += 4; }
    for (let d = 0; d < (f >> 2) % 4; d++) R(P[3], tx + 1 + d * 2, 27, 1, 1);
    R(P[2], 11, 32, 58, 5); R(P[0], 12, 33, 56, 3); // progress bar = progres tahap sungguhan
    const n = Math.round(p * 14);
    for (let i = 0; i < n; i++) R(i % 2 ? P[2] : P[3], 12 + i * 4, 33, 3, 3);
    f++;
    if (p >= 1 && got.size >= need.length) finish();
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = setInterval(frame, reduce ? 250 : 83), maxT = setTimeout(finish, MAX);
  frame();

  function finish() {
    if (closed) return; closed = true; clearInterval(timer); clearTimeout(maxT);
    try { api.beforeClose && api.beforeClose(); } catch (e) {}
    setTimeout(() => { el.classList.add('done'); setTimeout(() => el.remove(), 700); }, 260); // jeda singkat: bar penuh terlihat dulu
  }
  const api = window.Splash = {
    beforeClose: null,
    mark(name, text) { got.add(name); if (text && lab && !closed) lab.textContent = text; },
    close: finish
  };
})();
