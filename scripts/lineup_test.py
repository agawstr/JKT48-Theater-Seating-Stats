#!/usr/bin/env python3
"""Tes fitur lineup (statistik Per member, filter member, dan form admin) di browser headless.

Memakai data contoh sendiri (bukan data.json asli), jadi hasilnya tidak berubah walau datamu bertambah.
Jalankan lokal:  pip install playwright && playwright install chromium
                 python scripts/lineup_test.py
"""
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"

fails = []
def check(ok, msg):
    print(("ok     " if ok else "ERROR  ") + msg)
    if not ok: fails.append(msg)

def rec(i, seat, date, setlist, lineup=(), ts=None, ck=None, sesi="Malam"):
    r = dict(id=i, seat=seat, date=date, sesi=sesi, setlist=setlist, note="", harga=0, tiket="",
             twoshot="Tidak", tsType="", member="", photo="",
             chekicha="Tidak", ckType="", ckMember="", ckPhoto="", lineup=list(lineup))
    if ts: r.update(twoshot="Ya", tsType="birthday", member=ts)
    if ck: r.update(chekicha="Ya", ckType="roulette", ckMember=ck)
    return r

# Ayu: ada di lineup DAN 2-Shot di show yang sama (harus dihitung sekali per record)
# Dewi: hanya Chekicha (tidak ada di lineup); Eka: 2-Shot di show tanpa lineup
FIXTURE = {"records": [
    rec(1, "A-1", "2026-01-01", "X", ["Ayu", "Bela", "Citra"], ts="Ayu"),
    rec(2, "A-2", "2026-01-01", "X", ["Ayu", "Bela", "Citra"]),
    rec(3, "B-1", "2026-01-02", "Y", ["Bela"], ck="Dewi"),
    rec(4, "C-1", "2026-01-03", "Z", [], ts="Eka"),
], "tickets": [], "solo": []}

def set_select(pg, sel, value):
    pg.evaluate("([s,v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', {bubbles: true})); }", [sel, value])

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- index.html: statistik Per member + filter member ----------
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.route("**/data.json*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(FIXTURE)))
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/index.html"); pg.wait_for_timeout(2500)
    check(not errs, f"[index] tanpa error JS {errs[:2] if errs else ''}")

    chips = pg.evaluate("""[...document.querySelectorAll('#mem-list .mem-chip')].map(c =>
        [c.dataset.mem, Number(c.querySelector('b').textContent), c.classList.contains('met')])""")
    got = {n: (c, m) for n, c, m in chips}
    want = {"Ayu": (2, True), "Bela": (3, False), "Citra": (2, False), "Dewi": (1, True), "Eka": (1, True)}
    check(got == want, f"[index] chip Per member sesuai (lineup + 2-Shot/Chekicha dihitung sekali) -> {got}")
    check("ditonton tampil" in (pg.evaluate("document.getElementById('mem-key').textContent") or ""),
          "[index] keterangan memakai mode 'ditonton tampil'")

    opts = pg.evaluate("[...document.querySelectorAll('#flt-member option')].map(o => o.value).filter(Boolean)")
    check(set(opts) == set(want), f"[index] dropdown filter memuat member dari lineup juga -> {opts}")
    for name, n in [("Citra", 2), ("Bela", 3), ("Dewi", 1), ("Eka", 1)]:
        set_select(pg, "#flt-member", name); pg.wait_for_timeout(400)
        info = pg.evaluate("document.getElementById('flt-info').textContent")
        check(info.startswith(f"{n} dari 4"), f"[index] filter {name} -> {n} dari 4 show (tampil: {info!r})")
    ctx.close()

    # ---------- index.html: tanpa lineup sama sekali -> hitungan lama (hanya 2-Shot/Chekicha) ----------
    plain = {"records": [dict(r, lineup=[]) for r in FIXTURE["records"]], "tickets": [], "solo": []}
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.route("**/data.json*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(plain)))
    pg = ctx.new_page(); pg.goto(BASE + "/index.html"); pg.wait_for_timeout(2500)
    chips = pg.evaluate("""[...document.querySelectorAll('#mem-list .mem-chip')].map(c => [c.dataset.mem, Number(c.querySelector('b').textContent)])""")
    check(dict(chips) == {"Ayu": 1, "Dewi": 1, "Eka": 1}, f"[index] tanpa lineup: hanya member 2-Shot/Chekicha -> {dict(chips)}")
    ctx.close()

    # ---------- admin.html: member 2-Shot masuk lineup, dan lineup disamakan ke kursi lain ----------
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/admin.html"); pg.wait_for_timeout(2000)

    def fill(seat, setlist, date, lineup, ts=None, fid=0):
        pg.evaluate("""([seat, setlist, date, lu, ts, fid]) => {
            const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); };
            set('f-id', fid || ''); set('f-seat', seat); set('f-setlist', setlist); set('f-date', date); set('f-sesi', 'Malam');
            lineup = lu.slice(); renderLineup();
            set('f-ts', ts ? 'Ya' : 'Tidak');
            if (ts) { set('t-ts', 'birthday'); set('m-ts', ts); }
        }""", [seat, setlist, date, list(lineup), ts, fid])

    def submit_and_get(answer=None):
        pg.evaluate("document.getElementById('form').requestSubmit()")
        pg.wait_for_timeout(500)
        if answer is not None:
            modal_open = pg.evaluate("(() => { const m = document.getElementById('ask-modal'); return !!m && getComputedStyle(m).display !== 'none' && !m.hidden && m.classList.contains('open') || (m && m.offsetParent !== null); })()")
            if modal_open:
                pg.click("#ask-ok" if answer else "#ask-no"); pg.wait_for_timeout(400)
            else:
                check(False, "[admin] dialog 'Samakan lineup' tidak muncul")
        return pg.evaluate("records.map(r => ({seat: r.seat, lineup: r.lineup}))")

    def seed(items):
        pg.evaluate("(items) => { records = items; renderAll(); }", items)

    # a) lineup sudah terisi + member 2-Shot belum ada di dalamnya -> ditambahkan otomatis
    seed([])
    fill("A-5", "X", "2026-02-01", ["Ayu", "Bela"], ts="Dewi")
    out = submit_and_get()
    check(len(out) == 1 and out[0]["lineup"] == ["Ayu", "Bela", "Dewi"], f"[admin] member 2-Shot otomatis masuk lineup -> {out}")

    # b) lineup kosong tidak diisi otomatis
    seed([])
    fill("A-6", "X", "2026-02-02", [], ts="Dewi")
    out = submit_and_get()
    check(len(out) == 1 and out[0]["lineup"] == [], f"[admin] lineup kosong tetap kosong -> {out}")

    base = [rec(11, "A-1", "2026-03-01", "X", ["Ayu", "Bela"]), rec(12, "A-2", "2026-03-01", "X", ["Ayu", "Bela"]),
            rec(13, "A-3", "2026-03-02", "X", ["Ayu"])]   # show lain (tanggal beda): tidak boleh ikut berubah

    # c) ubah lineup satu kursi -> setuju disamakan -> kursi lain di show yang sama ikut, show lain tidak
    seed(json.loads(json.dumps(base)))
    fill("A-1", "X", "2026-03-01", ["Ayu", "Bela", "Citra"], fid=11)
    out = {o["seat"]: o["lineup"] for o in submit_and_get(answer=True)}
    check(out.get("A-2") == ["Ayu", "Bela", "Citra"], f"[admin] disamakan: kursi lain di show yang sama ikut -> {out.get('A-2')}")
    check(out.get("A-3") == ["Ayu"], f"[admin] show lain (tanggal beda) tidak berubah -> {out.get('A-3')}")

    # d) batal -> hanya kursi ini yang berubah
    seed(json.loads(json.dumps(base)))
    fill("A-1", "X", "2026-03-01", ["Ayu", "Bela", "Citra"], fid=11)
    out = {o["seat"]: o["lineup"] for o in submit_and_get(answer=False)}
    check(out.get("A-1") == ["Ayu", "Bela", "Citra"] and out.get("A-2") == ["Ayu", "Bela"],
          f"[admin] batal: hanya kursi ini yang disimpan -> {out}")

    # e) lineup kosong tidak menimpa kursi lain dan tidak memunculkan dialog
    seed(json.loads(json.dumps(base)))
    fill("A-1", "X", "2026-03-01", [], fid=11)
    out = {o["seat"]: o["lineup"] for o in submit_and_get()}
    check(out.get("A-2") == ["Ayu", "Bela"], f"[admin] lineup kosong tidak menimpa kursi lain -> {out.get('A-2')}")
    check(not errs, f"[admin] tanpa error JS {errs[:2] if errs else ''}")
    ctx.close()
    b.close()

srv.shutdown()
sys.exit(1 if fails else 0)
