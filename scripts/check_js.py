#!/usr/bin/env python3
"""Cek file JS sebelum publish: bukan HTML nyasar + syntax valid (butuh node).

Kasus yang ditangkap: assets/js/app.js pernah tertimpa isi admin.html,
sehingga index.html error dan tab tidak bisa pindah.
Jalankan lokal:  python scripts/check_js.py
"""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
bad = 0
files = sorted((ROOT / "assets" / "js").glob("*.js")) + [ROOT / "sw.js"]
for f in files:
    head = f.read_text(encoding="utf-8", errors="replace").lstrip()[:200].lower()
    if head.startswith("<!doctype") or head.startswith("<html") or head.startswith("<"):
        print(f"ERROR  {f.relative_to(ROOT)} isinya HTML, bukan JS (salah copy file?)")
        bad += 1
        continue
    r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
    if r.returncode:
        print(f"ERROR  {f.relative_to(ROOT)} syntax error:\n{r.stderr.strip()}")
        bad += 1
    else:
        print(f"ok     {f.relative_to(ROOT)}")
sys.exit(1 if bad else 0)
