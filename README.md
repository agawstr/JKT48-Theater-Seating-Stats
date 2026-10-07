# JKT48 Theater Seating Stats

Web untuk mencatat kursi teater JKT48 yang pernah kamu tempati, lengkap dengan statistik, riwayat, dan galeri foto 2-Shot/Chekicha.

Tanpa backend dan tanpa proses build: cukup file statis yang bisa di-hosting di GitHub Pages.

## Fitur

**Peta kursi**
- Peta baris A–J (4 blok, panggung, dermaga) dengan **warna heatmap**: makin sering ditempati, makin terang. Ada legenda dan label baris.
- **Popover saat hover** (perangkat dengan mouse): 3 riwayat terbaru dan jumlah kunjungan. Kursi yang belum pernah ditempati tidak punya popover. Klik kursi untuk riwayat lengkap dan foto.
- **Sorot cahaya** yang mengikuti kursor di atas peta.
- **▶ Putar ulang**: peta terisi satu per satu sesuai urutan tanggal.
- **📷 Simpan peta (PNG)** dan **✨ Wrapped**: kartu tahunan siap bagikan (tahun mengikuti kalender).
- **📤 Bagikan kartu** per show di modal kursi, memakai foto 2-Shot/Chekicha jika ada.

**Statistik**
- Kartu ringkasan: total show, kursi favorit, baris favorit, 2-Shot, Chekicha, member terbanyak, serta total biaya dan rata-rata per show bila harga tiket diisi. Kursi dengan jumlah sama dipilih dari baris paling depan, lalu nomor paling kanan.
- **Cakupan kursi** dengan progress bar dan tombol **🎯 Sorot yang belum** untuk menandai kursi yang belum pernah ditempati.
- **Filter** setlist, member, dan rentang tanggal. Hasilnya tersimpan di URL (`?setlist=...&member=...&from=2026-01-01&to=2026-06-30`), jadi bisa dibagikan lewat link.
- Grafik total kunjungan per setlist (klik bar untuk memfilter), sebaran per baris, kalender kehadiran per hari, dan kunjungan per bulan.
- **Kartu terakhir nonton** di bagian atas.

**Tab lain**
- **Riwayat**: timeline bergaris waktu per tahun dan bulan dengan milestone (show ke-1, 10, dan kelipatan 25), plus kolom pencarian.
- **Galeri**: foto 2-Shot/Chekicha bergaya polaroid, bisa difilter per member dan dibuka di lightbox.

**Halaman admin**
- Tambah, edit, hapus, dan cari riwayat (tabel dengan halaman), dengan cek duplikat dan kompres foto otomatis.
- Field harga dan jenis tiket (opsional), serta saran otomatis untuk setlist dan member yang pernah diinput.
- Pengingat backup: jumlah perubahan yang belum diunduh dan kapan terakhir diunduh.

Responsif untuk HP dan desktop, kontras warna sudah dicek, dan animasi otomatis dimatikan jika perangkat memakai pengaturan "kurangi gerakan".

## Struktur file

| File | Fungsi |
|---|---|
| `index.html` | Halaman publik (read-only). Membaca `data.json`. |
| `admin.html` | Halaman untuk mengelola data. Data disimpan di `localStorage` browser. |
| `data.json` | Data yang ditampilkan di halaman publik, dibuat dari tombol **Unduh paket (ZIP)** di admin. |
| `photos/` | Foto 2-Shot/Chekicha sebagai file terpisah (ikut di dalam paket ZIP). |
| `shared.js` | Kode bersama: layout kursi, validasi data, peta, statistik, modal, popover, kartu PNG. |
| `shared.css` | Gaya bersama untuk kedua halaman. |

> `index.html`, `admin.html`, `shared.js`, dan `shared.css` harus berada di folder yang sama.

## Cara memperbarui data

1. Buka `admin.html`, lalu isi riwayat show baru di tab **Tambah & Kelola Data**.
2. Klik **⬇ Unduh paket (ZIP)**, lalu ekstrak. Isinya `data.json` dan folder `photos/`.
3. Di GitHub, upload `data.json` dan folder `photos/` ke root repo (**Add file → Upload files**, drag keduanya, lalu commit). File bernama sama otomatis menimpa.
4. Tunggu sekitar 1 menit sampai GitHub Pages selesai deploy, lalu muat ulang dengan Ctrl+Shift+R.

Data di admin tersimpan di browser yang dipakai untuk input. Kalau pindah perangkat atau browser, data kosong. Gunakan **⬇ Backup lengkap (JSON)** (foto ikut di dalamnya) untuk menyimpan cadangan, lalu **⬆ Restore (JSON)** untuk memuatnya kembali.

## Format data

`data.json` berupa array (atau objek `{ "records": [...] }`):

```json
[
  {
    "id": 1700000000000,
    "seat": "A-19",
    "setlist": "Pajama Drive",
    "date": "2026-03-12",
    "sesi": "Malam",
    "note": "Momen spesial",
    "harga": 150000,
    "tiket": "Reguler",
    "twoshot": "Ya",
    "tsType": "roulette",
    "member": "Nama Member",
    "photo": "photos/1700000000000-ts.jpg",
    "chekicha": "Tidak",
    "ckType": "",
    "ckMember": "",
    "ckPhoto": ""
  }
]
```

- `seat`: kode kursi seperti `A-19`. Kursi yang tidak ada di peta dilewati di halaman publik.
- `sesi`: `Siang`, `Malam`, atau kosong. `harga` dan `tiket` opsional.
- `tsType` / `ckType`: `birthday` atau `roulette`.
- `photo` / `ckPhoto`: path relatif seperti `photos/...`, URL `http(s)`, atau data URL gambar. Opsional.

## Hosting di GitHub Pages

1. Buka **Settings → Pages**.
2. Pada **Source**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Simpan. Situs tersedia di `https://<username>.github.io/<nama-repo>/`.

Untuk menjalankan secara lokal, `index.html` memakai `fetch` sehingga tidak bisa dibuka lewat `file://`. Jalankan `python -m http.server`, lalu buka `http://localhost:8000`.

## Kustomisasi

- **Layout kursi:** ubah objek `COUNTS` di `shared.js` (jumlah kursi per blok di tiap baris). Kedua halaman otomatis mengikuti.
- **Jenis tambahan** selain 2-Shot dan Chekicha: tambah satu objek di array `KINDS` di `shared.js`.
- **Warna heatmap:** ubah array `HEAT` di `shared.js`.
- **Judul halaman:** ubah di `index.html` dan `admin.html`.

## Catatan privasi

Repo publik berarti `data.json` dan folder `photos/` (termasuk foto dan nama member) bisa dilihat siapa saja yang tahu URL-nya. Hapus data yang tidak ingin dipublikasikan sebelum meng-upload.

## Catatan

Proyek penggemar, tidak berafiliasi dengan JKT48 maupun manajemennya.
