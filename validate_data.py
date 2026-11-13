#!/usr/bin/env python3
"""Validasi data.json + photos/ sebelum situs dipublish.

Aturannya mengikuti sanitize() di shared.js: data yang tidak lolos di situ
akan dibuang diam-diam oleh halaman publik, jadi di sini dilaporkan dulu.

  ERROR   -> workflow gagal (data jangan dipublish)
  WARNING -> hanya peringatan

Jalankan lokal:  python scripts/validate_data.py
"""
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"
errors, warnings = [], []


def err(msg):
    errors.append(msg)
    print(("::error file=data.json::" if IN_ACTIONS else "ERROR   ") + msg)


def warn(msg):
    warnings.append(msg)
    print(("::warning file=data.json::" if IN_ACTIONS else "WARNING ") + msg)


def valid_date(s):
    if not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return False
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def load_seats():
    """Baca COUNTS dari shared.js supaya selalu sinkron dengan peta."""
    src = (ROOT / "assets" / "js" / "shared.js").read_text(encoding="utf-8")
    m = re.search(r"const COUNTS\s*=\s*\{(.*?)\};", src, re.S)
    if not m:
        sys.exit("Tidak menemukan COUNTS di shared.js")
    seats = set()
    for row, arr in re.findall(r"([A-Z])\s*:\s*\[([\d,\s]+)\]", m.group(1)):
        total = sum(int(x) for x in arr.split(","))
        seats |= {f"{row}-{i}" for i in range(1, total + 1)}
    return seats


def check_photo(where, value, used):
    """Cek satu field foto. Aturan sama dengan okPhoto() di shared.js."""
    if not value:
        return
    if value.startswith("data:image/"):
        warn(f"{where}: foto masih berupa data URL (membengkakkan data.json). "
             "Pakai 'Unduh paket (ZIP)' dari admin supaya jadi file di photos/.")
    elif re.match(r"https?://", value, re.I):
        return
    elif re.fullmatch(r"photos/[\w.-]+", value):
        used.add(value)
        if not (ROOT / value).is_file():
            err(f"{where}: file foto tidak ada -> {value}")
    else:
        err(f"{where}: format foto tidak dikenali dan akan diabaikan -> {value[:60]}")


def main():
    path = ROOT / "data.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"data.json tidak bisa dibaca sebagai JSON: {e}")
        return

    records = data if isinstance(data, list) else data.get("records")
    if not isinstance(records, list):
        err("data.json harus berupa array, atau objek dengan field 'records'.")
        return
    top = data if isinstance(data, dict) else {}
    tickets = top.get("tickets") or []
    solo = top.get("solo") or []

    # --- Jangan sampai data pribadi dari backup lokal ikut terpublish ---
    leaked = sorted({"away", "misc", "prices"} & set(top.keys()))
    if leaked:
        err("data.json berisi bagian khusus backup lokal: " + ", ".join(leaked)
            + ". Ini sepertinya backup-lengkap.json, bukan paket publik.")
    # --- daftar setlist resmi (opsional): dipakai kartu Cakupan setlist ---
    sl = top.get("setlists")
    if sl is not None:
        if not isinstance(sl, list) or any(not isinstance(x, str) for x in sl):
            err("setlists harus berupa array teks (satu nama setlist per item).")
        else:
            low = [x.strip().lower() for x in sl if x.strip()]
            dupes = sorted({x for x in low if low.count(x) > 1})
            if dupes:
                warn(f"setlists punya nama ganda: {', '.join(dupes[:5])}")
            known = set(low)
            miss = sorted({r.get("setlist", "").strip() for r in records if isinstance(r, dict)
                           and r.get("setlist", "").strip() and r.get("setlist", "").strip().lower() not in known})
            if miss and known:
                warn(f"{len(miss)} setlist di riwayat tidak ada di daftar setlists (salah ketik atau belum ditambahkan): {', '.join(miss[:3])}")
    n_tx = sum(1 for t in tickets if isinstance(t, dict) and t.get("tx"))
    if n_tx:
        err(f"{n_tx} tiket berisi kode transaksi (tx). Kosongkan sebelum dipublish.")
    n_multi = sum(1 for t in tickets if isinstance(t, dict) and (t.get("bought") or 1) > 1)
    if n_multi:
        warn(f"{n_multi} tiket punya jumlah beli > 1; di paket publik biasanya bernilai 1.")

    seats = load_seats()
    used = set()
    today = dt.date.today() + dt.timedelta(days=1)  # toleransi zona waktu (WIB vs UTC)

    # --- records ---
    ids, slots = {}, {}
    name_rec = {}      # nama -> jumlah record tempat dia muncul (lineup / 2-Shot / Chekicha)
    spellings = {}     # huruf kecil -> {ejaan yang dipakai}
    any_lineup = any(isinstance(r, dict) and isinstance(r.get("lineup"), list) and r["lineup"] for r in records)
    for i, r in enumerate(records):
        tag = f"records[{i}]"
        if not isinstance(r, dict):
            err(f"{tag}: bukan objek")
            continue
        seat = r.get("seat")
        tag = f"records[{i}] ({seat} {r.get('date')})"
        if seat not in seats:
            err(f"{tag}: kursi tidak ada di peta -> {seat!r}")
        if not valid_date(r.get("date")):
            err(f"{tag}: tanggal tidak valid -> {r.get('date')!r}")
        elif dt.date.fromisoformat(r["date"]) > today:
            warn(f"{tag}: tanggal di masa depan")
        if r.get("sesi") not in ("", "Siang", "Malam", None):
            warn(f"{tag}: sesi tidak dikenali -> {r.get('sesi')!r}")
        if not r.get("setlist"):
            warn(f"{tag}: setlist kosong")
        rid = r.get("id")
        if not isinstance(rid, (int, float)) or rid <= 0:
            warn(f"{tag}: id tidak valid -> {rid!r}")
        elif rid in ids:
            err(f"{tag}: id ganda (juga di records[{ids[rid]}])")
        else:
            ids[rid] = i
        lu = r.get("lineup")
        if lu is not None and (not isinstance(lu, list) or not all(isinstance(m, str) and m.strip() for m in lu)):
            warn(f"{tag}: lineup harus berupa daftar nama member (teks)")
        elif isinstance(lu, list) and len(lu) != len(set(lu)):
            warn(f"{tag}: lineup berisi nama ganda")
        if isinstance(lu, list):
            # batas yang dipotong diam-diam oleh sanitize() di shared.js
            if len(lu) > 80:
                warn(f"{tag}: lineup {len(lu)} nama; halaman publik hanya membaca 80 pertama")
            for m in lu:
                if isinstance(m, str) and len(m.strip()) > 60:
                    warn(f"{tag}: nama di lineup lebih dari 60 karakter (akan dipotong) -> {m.strip()[:40]}...")
                if isinstance(m, str) and m != m.strip():
                    warn(f"{tag}: nama di lineup berspasi di ujung -> {m!r}")
        slot = (seat, r.get("date"), r.get("sesi"))
        if slot in slots:
            err(f"{tag}: kursi + tanggal + sesi sama dengan records[{slots[slot]}]")
        else:
            slots[slot] = i
        for flag, ftype, member, photo, label in (
            ("twoshot", "tsType", "member", "photo", "2-Shot"),
            ("chekicha", "ckType", "ckMember", "ckPhoto", "Chekicha"),
        ):
            if r.get(flag) == "Ya":
                if r.get(ftype) not in ("birthday", "roulette"):
                    warn(f"{tag}: {label} tipe tidak dikenali -> {r.get(ftype)!r}")
                if not r.get(member):
                    warn(f"{tag}: {label} 'Ya' tapi nama member kosong")
            elif r.get(member) or r.get(photo):
                warn(f"{tag}: {label} 'Tidak' tapi member/foto terisi (akan diabaikan)")
            check_photo(f"{tag} {label}", r.get(photo), used)

        # nama yang muncul di record ini (lineup + 2-Shot + Chekicha), tiap nama dihitung sekali per record
        names = set()
        for m in (lu if isinstance(lu, list) else []):
            if isinstance(m, str) and m.strip():
                names.add(m.strip())
        met = set()
        for flag, member in (("twoshot", "member"), ("chekicha", "ckMember")):
            if r.get(flag) == "Ya" and isinstance(r.get(member), str) and r[member].strip():
                met.add(r[member].strip())
        for n in names | met:
            name_rec[n] = name_rec.get(n, 0) + 1
            spellings.setdefault(n.lower(), set()).add(n)
        # lineup sudah diisi tapi member yang kamu temui tidak ada di dalamnya
        lu_set = {m.strip().lower() for m in (lu if isinstance(lu, list) else []) if isinstance(m, str)}
        if lu_set:
            for n in sorted(met):
                if n.lower() not in lu_set:
                    warn(f"{tag}: {n} (2-Shot/Chekicha) tidak ada di lineup show ini")

    # --- konsistensi nama lintas data ---
    mixed = sorted(v for v in spellings.values() if len(v) > 1)
    for v in mixed:
        warn("ejaan nama tidak seragam (dianggap orang berbeda di statistik): " + " / ".join(sorted(v)))
    if any_lineup:
        once = sorted(n for n, c in name_rec.items() if c == 1)
        if once:
            warn(f"{len(once)} nama hanya muncul di 1 record (member baru, atau salah ketik / nama panggilan?): "
                 + ", ".join(once[:10]) + (" ..." if len(once) > 10 else ""))

    # --- tickets ---
    seen_k = {}
    for i, t in enumerate(tickets):
        if not isinstance(t, dict):
            err(f"tickets[{i}]: bukan objek")
            continue
        tag = f"tickets[{i}] ({t.get('name', '')[:30]})"
        if not valid_date(t.get("date")):
            err(f"{tag}: tanggal tidak valid dan tiket akan dibuang -> {t.get('date')!r}")
        if t.get("type") not in ("SHOW", "EXCLUSIVE", "EVENT"):
            warn(f"{tag}: type tidak dikenali (dianggap EVENT) -> {t.get('type')!r}")
        k = t.get("k")
        if k:
            if k in seen_k:
                err(f"{tag}: kode k ganda (juga di tickets[{seen_k[k]}])")
            else:
                seen_k[k] = i
        check_photo(tag, t.get("photo"), used)

    # --- solo ---
    for i, s in enumerate(solo):
        if not isinstance(s, dict):
            err(f"solo[{i}]: bukan objek")
            continue
        tag = f"solo[{i}] ({s.get('member', '')})"
        if not valid_date(s.get("date")):
            err(f"{tag}: tanggal tidak valid dan akan dibuang -> {s.get('date')!r}")
        if s.get("kind") not in ("ts", "ck"):
            warn(f"{tag}: kind tidak dikenali (dianggap ck) -> {s.get('kind')!r}")
        check_photo(tag, s.get("photo"), used)

    # --- foto tidak terpakai (ada di photos/ tapi tidak dirujuk data mana pun) ---
    pdir = ROOT / "photos"
    if pdir.is_dir():
        unused = sorted(f"photos/{p.name}" for p in pdir.iterdir() if p.is_file())
        unused = [o for o in unused if o not in used]
        if unused:
            warn(f"{len(unused)} foto tidak dipakai data mana pun, mis. {', '.join(unused[:3])}")

    print(f"\nRingkasan: {len(records)} records, {len(tickets)} tiket, {len(solo)} solo "
          f"| {len(errors)} error, {len(warnings)} peringatan")


if __name__ == "__main__":
    main()
    sys.exit(1 if errors else 0)
