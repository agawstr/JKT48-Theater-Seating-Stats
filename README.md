# JKT48 Theater Seating Stats

Web untuk mencatat kursi teater JKT48 yang pernah kamu tempati. Peta kursi menandai kursi yang sudah pernah diduduki beserta jumlahnya. Arahkan kursor ke kursi untuk melihat ringkasan, klik untuk melihat riwayat lengkap dan foto.

Tanpa backend dan tanpa proses build, cukup file HTML statis yang bisa di-hosting di GitHub Pages.

## Fitur

- **Peta kursi interaktif** baris A–J dengan 4 blok, panggung, dan dermaga.
- **Popover hover** (di perangkat dengan mouse): 3 riwayat terbaru, jumlah kunjungan, dan label 2-Shot/Chekicha. Kursi yang belum pernah ditempati tidak memunculkan popover.
- **Modal riwayat** saat kursi diklik: setlist, tanggal, sesi, catatan, serta foto 2-Shot/Chekicha dengan lightbox.
- **Halaman admin** untuk tambah, edit, hapus, dan cari riwayat, dengan cek duplikat dan kompres foto otomatis.
- **Backup dan restore** data dalam format JSON.
- Responsif untuk HP dan desktop, bisa dioperasikan dengan keyboard.

## Struktur file

| File | Fungsi |
|---|---|
| `index.html` | Halaman publik (read-only). Membaca `data.json`. |
| `admin.html` | Halaman untuk mengelola data. Data disimpan di `localStorage` browser. |
| `data.json` | Data yang ditampilkan di halaman publik. Dihasilkan dari tombol **Unduh data.json** di admin. |
| `shared.js` | Kode bersama: layout kursi, validasi data, render peta, modal, popover. |
| `shared.css` | Gaya bersama untuk peta kursi, modal, dan popover. |

> Keempat file selain `data.json` harus berada di folder yang sama.

## Cara memperbarui data

1. Buka `admin.html`, tab **Tambah & Kelola Data**, lalu isi riwayat show baru.
2. Klik **⬇ Unduh paket (ZIP)**, lalu ekstrak. Isinya `data.json` dan folder `photos/` (foto disimpan sebagai file terpisah, bukan di dalam JSON).
3. Di GitHub, upload `data.json` dan folder `photos/` ke root repo (**Add file → Upload files**, drag keduanya, lalu commit). File bernama sama otomatis menimpa.
4. Tunggu sekitar 1 menit sampai GitHub Pages selesai deploy, lalu muat ulang `index.html`.

Data di admin tersimpan di browser yang dipakai untuk input. Kalau pindah perangkat atau browser, kosong dulu. Gunakan **⬇ Backup lengkap (JSON)** (foto ikut di dalamnya) untuk menyimpan cadangan, lalu **⬆ Restore (JSON)** untuk memuatnya kembali.

## Format data

`data.json` berupa array (atau objek `{ "records": [...] }`):

```json
[
  {
    "id": 1700000000000,
    "seat": "A-19",
    "setlist": "Pajama Drive",
    "date": "2025-03-12",
    "sesi": "Malam",
    "note": "STS / diwaro member",
    "twoshot": "Ya",
    "tsType": "roulette",
    "member": "Nama Member",
    "photo": "data:image/jpeg;base64,...",
    "chekicha": "Tidak",
    "ckType": "",
    "ckMember": "",
    "ckPhoto": ""
  }
]
```

- `seat`: kode kursi seperti `A-19`. Kursi yang tidak ada di peta dilewati di halaman publik.
- `sesi`: `Siang`, `Malam`, atau kosong.
- `tsType` / `ckType`: `birthday` atau `roulette`.
- `photo` / `ckPhoto`: path relatif seperti `photos/1700000000000-ts.jpg`, URL `http(s)`, atau data URL gambar. Opsional.

## Hosting di GitHub Pages

1. Buka **Settings → Pages**.
2. Pada **Source**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Simpan. Situs tersedia di `https://<username>.github.io/JKT48-Theater-Seating-Stats/`.

Menjalankan secara lokal: `index.html` memakai `fetch`, jadi tidak bisa dibuka langsung lewat `file://`. Jalankan server sederhana, misalnya `python -m http.server`, lalu buka `http://localhost:8000`.

## Kustomisasi

- **Layout kursi:** ubah objek `COUNTS` di `shared.js` (jumlah kursi per blok di tiap baris). Admin dan halaman publik otomatis mengikuti.
- **Jenis tambahan** selain 2-Shot dan Chekicha: tambah satu objek di array `KINDS` di `shared.js`.
- **Judul halaman:** ubah di `index.html` dan `admin.html`.

## Catatan privasi

Repo ini publik, jadi `data.json` (termasuk foto dan nama member) bisa dilihat siapa saja yang tahu URL-nya. Hapus data yang tidak ingin dipublikasikan sebelum meng-upload `data.json`.

## Catatan

Proyek penggemar, tidak berafiliasi dengan JKT48 maupun manajemennya.
