#!/usr/bin/env python3
"""Smoke test index.html di browser headless (Playwright).

Cek: tidak ada error JS, 250 kursi tergambar, 4 tab bisa dibuka, galeri punya foto.
Jalankan lokal:  pip install playwright && playwright install chromium
                 python scripts/smoke_test.py
"""
import functools, http.server, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}/index.html"

fails = []
def check(ok, msg):
    print(("ok     " if ok else "ERROR  ") + msg)
    if not ok: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, touch in [("HP", {"width": 390, "height": 844}, True), ("laptop", {"width": 1440, "height": 900}, False)]:
        ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch, service_workers="block")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "fonts.g" not in m.text and "ERR_NAME_NOT_RESOLVED" not in m.text and "ERR_INTERNET" not in m.text else None)
        pg.goto(URL); pg.wait_for_timeout(2500)
        check(not errs, f"[{name}] tanpa error JS {errs[:2] if errs else ''}")
        check(pg.evaluate("document.querySelectorAll('.seat').length") == 250, f"[{name}] 250 kursi tergambar")
        for t in ["tl", "gal", "ev", "main"]:
            btn = pg.query_selector(f".tab[data-tab={t}]")
            if not btn or not btn.is_visible():
                continue  # tab Tiket bisa tersembunyi kalau data tanpa tiket
            btn.click(); pg.wait_for_timeout(900)
            shown = pg.evaluate("[...document.querySelectorAll('[id^=view-]')].filter(v=>!v.hidden).map(v=>v.id)")
            check(shown == [f"view-{t}"], f"[{name}] tab {t} terbuka (tampil: {shown})")
        pg.click(".tab[data-tab=gal]"); pg.wait_for_timeout(900)
        check(pg.evaluate("document.querySelectorAll('#gallery img').length") > 0, f"[{name}] galeri punya foto")
        ctx.close()
    b.close()
srv.shutdown()
sys.exit(1 if fails else 0)
