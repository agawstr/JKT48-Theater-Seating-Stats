# JKT48 Theater Seating Stats

Web untuk mencatat kursi teater JKT48 yang pernah kamu tempati, lengkap dengan statistik, riwayat, dan galeri foto 2-Shot/Chekicha.

Tanpa backend dan tanpa proses build: cukup file statis yang bisa di-hosting di GitHub Pages. Satu-satunya sumber luar adalah Google Fonts (Inter dan Caveat); kalau gagal dimuat, tampilan otomatis memakai font sistem.

## Fitur

**Peta kursi**
- Peta baris A–J (4 blok, panggung, dermaga) dengan **warna heatmap**: makin sering ditempati, makin terang. Ada legenda dan label baris.
- **Popover saat hover** (perangkat dengan mouse): 3 riwayat terbaru dan jumlah kunjungan. Kursi yang belum pernah ditempati tidak punya popover. Klik kursi untuk riwayat lengkap dan foto.
- **Sorot cahaya** yang mengikuti kursor di atas peta.
- **Putar ulang**: peta terisi satu per satu sesuai urutan tanggal.
- **Simpan peta (PNG)** dan **Wrapped**: kartu tahunan siap bagikan (tahun mengikuti kalender).
- **Bagikan kartu** per show di modal kursi, memakai foto 2-Shot/Chekicha jika ada.

**Statistik**
- Kartu ringkasan: total show, kursi favorit, baris favorit, 2-Shot, Chekicha, member terbanyak, serta total biaya dan rata-rata per show bila harga tiket diisi. Kursi dengan jumlah sama dipilih dari baris paling depan, lalu nomor paling kanan.
- **Cakupan kursi** dengan progress bar dan tombol **Sorot yang belum** untuk menandai kursi yang belum pernah ditempati.
- **Filter** setlist, member, dan rentang tanggal. Hasilnya tersimpan di URL (`?setlist=...&member=...&from=2026-01-01&to=2026-06-30`), jadi bisa dibagikan lewat link.
- Grafik total kunjungan per setlist (klik bar untuk memfilter), sebaran per baris, kalender kehadiran per hari, dan kunjungan per bulan.
- **Kartu terakhir nonton** di bagian atas.

**Tab lain**
- **Riwayat**: timeline per tahun dan bulan. Header bulan menempel di bawah tab bar (lengkap dengan jumlah show), tiap kartu menampilkan tanggal, sesi, setlist, chip 2-Shot/Chekicha/lotre/harga, dan catatan. Milestone (show ke-1, 10, dan kelipatan 25) diberi bintang emas. **Seluruh kartu bisa diketuk** untuk membuka detail kursi. Ada kolom pencarian.
- **Galeri**: foto bergaya polaroid/instax. Nama member memakai tulisan tangan (Caveat) berukuran besar, jenis foto berupa label kecil, lalu setlist dan tanggal dengan ukuran lebih kecil. Warna bingkai dan selotip berbeda untuk 2-Shot (krem), Chekicha (merah muda), dan 2-Shot Event (ungu). Bisa difilter per jenis dan member, lalu dibuka di lightbox.
- **Tiket & Event**: statistik lotre, meet & greet, special show, dan event.

**Halaman admin**
- Tambah, edit, hapus, dan cari riwayat (tabel dengan halaman), dengan cek duplikat dan kompres foto otomatis.
- Field harga dan jenis tiket (opsional), serta saran otomatis untuk setlist dan member yang pernah diinput.
- Pengingat backup: jumlah perubahan yang belum diunduh dan kapan terakhir diunduh.

## Performa & animasi

Tampilan dirancang supaya tetap lancar di HP kelas menengah:

- **Blur kaca (`backdrop-filter`) hanya dipakai di elemen yang jumlahnya sedikit** (tab bar, modal, pil filter), dan dimatikan di layar sentuh. Kartu, daftar, dan kursi memakai warna semi-solid yang tampilannya mirip tetapi jauh lebih ringan.
- **Render malas**: tab Riwayat, Galeri, dan Tiket & Event yang tidak sedang dibuka digambar ulang saat browser menganggur (bukan saat kamu pindah tab), jadi mengubah filter di peta tidak membangun ulang ratusan elemen yang tidak terlihat.
- **Animasi hanya memakai `transform` dan `opacity`**. Pindah tab = satu gerakan geser-pudar singkat, lalu isinya muncul bertahap (maksimal beberapa item pertama), dan halaman otomatis kembali ke atas supaya isi baru tidak muncul di tengah.
- Daftar tiket memakai `content-visibility: auto`; foto galeri `loading="lazy"` + `decoding="async"` dan memudar masuk setelah dimuat.
- **Animasi ala iOS**: kurva pegas yang sama di semua gerakan. Di HP, detail kursi muncul sebagai **lembar bawah** (bottom sheet) yang bisa ditarik ke bawah untuk menutup. Foto di dalamnya punya tempat tetap + skeleton lalu memudar masuk (tidak muncul tiba-tiba), dan saat diketuk foto **membesar dari posisinya** ke layar penuh.
- Efek hover (naik, miring, sorot cahaya) dimatikan di perangkat tanpa mouse.
- Peta kursi di HP otomatis muat selebar layar (cubit dua jari atau tombol + untuk memperbesar, **Pas layar** untuk kembali); di laptop peta mengecil otomatis jika jendela sempit. Halaman tidak pernah bergeser ke samping.
- Filter tanggal punya label "Mulai tanggal" dan "Sampai tanggal" dengan tulisan "Pilih tanggal" saat kosong.
- Dropdown memakai latar solid dan panah khusus, jadi pilihannya terbaca jelas di semua browser (dark maupun light).
- Animasi otomatis dimatikan jika perangkat memakai pengaturan "kurangi gerakan" atau "kurangi transparansi".

Responsif untuk HP dan desktop, dan kontras warna sudah dicek.

## Struktur file

| File | Fungsi |
|---|---|
| `index.html` | Halaman publik (read-only). Membaca `data.json`. |
| `admin.html` | Halaman untuk mengelola data. Data disimpan di `localStorage` browser. |
| `data.json` | Data yang ditampilkan di halaman publik, dibuat dari tombol **Unduh paket (ZIP)** di admin. |
| `photos/` | Foto 2-Shot/Chekicha sebagai file terpisah (ikut di dalam paket ZIP). Versi kecil untuk galeri ada di `photos/t/` (dibuat dengan `scripts/make_thumbs.py`); kalau belum ada, galeri memakai foto penuh. |
| `shared.js` | Kode bersama: layout kursi, validasi data, peta, statistik, modal, popover, kartu PNG. |
| `shared.css` | Gaya bersama untuk kedua halaman. Bagian paling bawah (`v4`) berisi perbaikan performa, dropdown, riwayat, dan polaroid. |

> `index.html`, `admin.html`, `shared.js`, dan `shared.css` harus berada di folder yang sama.

## Cara memperbarui data

1. Buka `admin.html`, lalu isi riwayat show baru di tab **Tambah & Kelola Data**.
2. Klik **Unduh paket (ZIP)**, lalu ekstrak. Isinya `data.json` dan folder `photos/`.
3. Di GitHub, upload `data.json` dan folder `photos/` ke root repo (**Add file → Upload files**, drag keduanya, lalu commit). File bernama sama otomatis menimpa.
4. Tunggu sekitar 1 menit sampai GitHub Pages selesai deploy, lalu muat ulang dengan Ctrl+Shift+R.

Data di admin tersimpan di browser yang dipakai untuk input. Kalau pindah perangkat atau browser, data kosong. Gunakan ** Backup lengkap (JSON)** (foto ikut di dalamnya) untuk menyimpan cadangan, lalu ** Restore (JSON)** untuk memuatnya kembali.

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
