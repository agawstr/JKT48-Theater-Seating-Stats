#!/usr/bin/env python3
"""Buat thumbnail galeri: photos/X.jpg -> photos/t/X.jpg

Nama file thumbnail harus sama dengan aslinya karena shared.js memakai
thumbOf(): 'photos/X' -> 'photos/t/X'.

- Thumbnail yang sudah ada tidak ditimpa (pakai --force untuk membuat ulang).
- Thumbnail yang foto aslinya sudah dihapus ikut dihapus.

Butuh Pillow:  pip install pillow
Jalankan lokal: python scripts/make_thumbs.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "photos"
OUT = SRC / "t"
WIDTH = 360      # kartu galeri ~190px; foto penuh tetap dibuka saat diklik
QUALITY = 72
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def make(src: Path, dst: Path):
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)  # hormati rotasi dari kamera/HP
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        ext = src.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            im.convert("RGB").save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        elif ext == ".png":
            im.save(dst, "PNG", optimize=True)
        else:
            im.save(dst, "WEBP", quality=QUALITY)


def main():
    force = "--force" in sys.argv
    if not SRC.is_dir():
        print("Folder photos/ tidak ada, tidak ada yang dikerjakan.")
        return 0
    OUT.mkdir(exist_ok=True)

    sources = {p.name: p for p in SRC.iterdir() if p.is_file() and p.suffix.lower() in EXTS}
    made = skipped = failed = 0
    for name, src in sorted(sources.items()):
        dst = OUT / name
        if dst.exists() and not force:
            skipped += 1
            continue
        try:
            make(src, dst)
            made += 1
            print(f"dibuat   {dst.relative_to(ROOT)}  ({src.stat().st_size // 1024} KB -> {dst.stat().st_size // 1024} KB)")
        except Exception as e:  # noqa: BLE001  satu foto rusak jangan menghentikan semuanya
            failed += 1
            print(f"GAGAL    {src.name}: {e}")

    pruned = 0
    for p in OUT.iterdir():
        if p.is_file() and p.name not in sources:
            p.unlink()
            pruned += 1
            print(f"dihapus  {p.relative_to(ROOT)} (foto asli sudah tidak ada)")

    print(f"\nThumbnail: {made} dibuat, {skipped} sudah ada, {pruned} dihapus, {failed} gagal")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
