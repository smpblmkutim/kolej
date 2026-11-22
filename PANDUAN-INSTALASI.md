# Panduan Instalasi Kolej — Koreksi Lembar Jawaban

SMP Budi Luhur Mandiri · versi 1.2.0

Kolej terdiri dari **dua bagian** yang dipasang terpisah:

| Bagian | Isi | Dipasang di |
|---|---|---|
| **Backend** | `Kode.gs` + `appsscript.json` | Google Apps Script (akun Google sekolah) |
| **Frontend** | isi ZIP `kolej-frontend.zip` | GitHub Pages (HTTPS, wajib untuk kamera) |

Urutannya: **backend dulu** (untuk mendapat URL `/exec`), lalu isi URL itu ke frontend, lalu unggah frontend.

---

## Yang baru di versi 1.2.0

| Fitur | Keterangan |
|---|---|
| **Tugas mengajar ditentukan admin** | Data Guru → tombol **Mengajar** → pilih kelas untuk tiap mapel. Guru hanya bisa memilih, mengisi kunci, memindai, dan melihat hasil untuk mapel × kelas tugasnya. |
| **Kunci jawaban bersama admin & guru** | Satu kunci untuk tiap *ujian + mapel + kelas*. Kunci yang diisi admin langsung muncul di akun guru (dan sebaliknya). Halaman kunci menampilkan "terakhir diubah oleh …". |
| **Deteksi 2–3 coretan sekaligus** | Pembaca coretan baru (pencarian garis lurus): coretan "=" yang miring, berdekatan, atau menumpuk dengan X tetap dikenali di 2–3 kotak dalam satu soal. Uji dengan tulisan tangan dari foto lapangan: **34,8% → 100%** soal terbaca benar. |
| **Scan lebih cepat** | Gambar diambil setelah kertas diam **0,5 detik** (sebelumnya 0,9), titik penanda dari kamera langsung dipakai ulang, pelurusan gambar abu-abu. Pembacaan **±4× lebih cepat**; uji browser: kamera siap → hasil tampil **1,3 → 0,8 detik**. |

**Memperbarui dari 1.1.x:** tempel `Kode.gs` baru → Simpan → jalankan **`setupKolej`** (membuat sheet **Pengajar**, data lain tidak diubah) → *Terapkan → Kelola deployment → ✏️ Edit → Versi baru*. Lalu ganti isi repo GitHub dengan ZIP baru (isi ulang `GAS_URL`) dan `git push`.

⚠️ **Wajib setelah update:** Admin buka **Data Guru → Mengajar** dan tetapkan mapel & kelas setiap guru. Guru yang belum ditugaskan akan melihat pesan *"Belum ada tugas mengajar"*. Bila dari versi lama ada beberapa kunci untuk mapel & kelas yang sama, yang dipakai adalah kunci yang **terakhir diubah**.

## Yang baru di versi 1.1.0

| Fitur | Di mana |
|---|---|
| **CRUD lengkap** — tambah, lihat, ubah, **hapus** untuk Guru, Mapel, Kelas, Siswa (bisa pilih banyak), Kunci Jawaban, dan Hasil (scan, **input manual**, koreksi, hapus) | Menu Data, Kunci (⋮ → Hapus), Scan (Input Manual), Hasil |
| **KKM per mata pelajaran** — diatur admin di Data Mapel, atau oleh guru langsung di halaman Kunci Jawaban | Data Mapel · Kunci Jawaban |
| **Tombol Ganti mapel/kelas lebih menonjol** — kartu biru di atas halaman Kunci & Scan, ganti cepat tanpa pindah halaman | Kunci · Scan |
| **Template lembar jawaban** — A4 penuh (kotak besar), A4 dibagi dua, F4 dibagi dua, halaman petunjuk pengisian, bisa tercetak nama siswa | Menu **Template LJK** |

**Memperbarui dari versi 1.0.x:** tempel `Kode.gs` baru → Simpan → jalankan **`setupKolej`** sekali lagi (aman, hanya menambah kolom **KKM** di sheet Mapel) → *Terapkan → Kelola deployment → ✏️ Edit → Versi baru*. Lalu ganti semua file frontend di repo GitHub dengan isi ZIP baru (isi ulang `GAS_URL`) dan `git push`.

## Bagian A — Backend (Google Apps Script)

### A1. Buat proyek
1. Buka **https://script.google.com** → **Proyek baru**.
2. Ganti nama proyek (kiri atas) menjadi **Kolej API**.
3. Hapus isi `Code.gs`, lalu tempel **seluruh isi `Kode.gs`**. Tekan **Ctrl+S**.
4. Tampilkan file manifest: ⚙️ **Setelan proyek** → centang **Tampilkan file manifes "appsscript.json" di editor**.
5. Buka `appsscript.json` di editor, ganti isinya dengan **isi `appsscript.json`** dari paket ini. Simpan.

### A2. Jalankan setup (sekali)
1. Di dropdown fungsi (sebelah tombol ▶ Jalankan) pilih **`setupKolej`** → klik **▶ Jalankan**.
2. Muncul permintaan izin → **Tinjau izin** → pilih akun → **Lanjutan** → **Buka Kolej API (tidak aman)** → **Izinkan**.
   *(Peringatan "tidak aman" muncul karena skrip buatan sendiri, bukan dari Google. Aman.)*
3. Buka **Log eksekusi**, pastikan muncul:
   ```
   ✅ Database baru dibuat: https://docs.google.com/spreadsheets/d/...
   👤 Akun awal → Admin: username "admin" / password "admin123". Guru contoh: password "guru123".
   ✅ Setup selesai.
   ```
4. Di Google Drive Anda sekarang ada folder **Kolej** berisi spreadsheet **Kolej — Database**, folder **Foto Lembar Jawaban**, dan **Template**.

> `setupKolej` **aman dijalankan ulang** — tidak menggandakan data, hanya melengkapi yang kurang. Spreadsheet database **jangan dibagikan** ke siapa pun.

### A3. Deploy sebagai Web App
1. Klik **Terapkan (Deploy)** → **Deployment baru**.
2. Ikon ⚙️ jenis → **Aplikasi web**.
3. Isi:
   - **Jalankan sebagai:** *Saya (email Anda)*
   - **Yang memiliki akses:** *Siapa saja*
4. Klik **Terapkan** → **salin URL** yang berakhiran **`/exec`**.
5. Uji: buka URL itu di browser. Harus tampil teks seperti `{"success":true,"data":{"app":"Kolej API",...}}`.

---

## Bagian B — Frontend (GitHub Pages)

### B1. Ekstrak & isi URL
1. Ekstrak `kolej-frontend.zip`. Hasilnya folder **`kolej-frontend`** yang langsung berisi `index.html`, `css`, `js`, `assets`, `icons`.
   **Folder inilah yang nanti di-`git init`** — jangan masuk lebih dalam, jangan naik satu level.
2. Buka **`js/config.js`** dengan Notepad, ganti `GANTI_DENGAN_ID_DEPLOYMENT_ANDA` sehingga menjadi URL `/exec` dari langkah A3:
   ```js
   GAS_URL: 'https://script.google.com/macros/s/AKfycb..../exec',
   ```
   Simpan.

### B2. Buat repository di GitHub
1. Login **github.com** → tombol **+** → **New repository**.
2. Nama: `kolej` · pilih **Public** · **jangan** centang README / .gitignore / license → **Create repository**.

### B3. Unggah lewat terminal (bukan lewat tombol "Upload files")
Upload lewat web GitHub merusak struktur folder `css/` dan `js/` sehingga tampilan rusak. Pakai terminal:

1. Buka folder `kolej-frontend` di File Explorer → klik address bar → ketik `powershell` → Enter.
2. Pastikan Anda di folder yang benar:
   ```powershell
   dir
   ```
   Baris yang terlihat **harus** memuat `index.html`, `css`, `js`. Kalau yang terlihat justru folder `kolej-frontend`, ketik `cd kolej-frontend` dulu.
3. Jalankan **satu per satu**:
   ```powershell
   git init
   git add .
   git commit -m "Upload pertama Kolej"
   git branch -M main
   git remote add origin https://github.com/USERNAME/kolej.git
   git push -u origin main
   ```
   - Ganti `USERNAME` dengan username GitHub Anda.
   - Saat diminta **Password**, tempel **Personal Access Token** (bukan password akun). Layar memang tidak menampilkan apa pun saat ditempel — itu normal, tekan Enter.
   - Belum punya token: buka https://github.com/settings/tokens → **Generate new token (classic)** → centang **repo** → **Generate** → salin `ghp_...`.
   - Belum pernah pakai Git di komputer itu: jalankan sekali `git config --global user.name "Nama Anda"` dan `git config --global user.email "email@anda.com"`.

### B4. Aktifkan GitHub Pages
1. Di repo GitHub: **Settings** → **Pages**.
2. **Source:** Deploy from a branch · **Branch:** `main` / `(root)` → **Save**.
3. Centang **Enforce HTTPS** (wajib — tanpa HTTPS kamera diblokir browser).
4. Tunggu 1–2 menit. Alamat aplikasi: **`https://USERNAME.github.io/kolej/`**

### B5. Pasang di HP & laptop sebagai aplikasi (PWA)
Kolej bisa dipasang seperti aplikasi biasa — ikon di layar utama, layar penuh tanpa bilah alamat, terbuka instan, dan **tetap bisa scan saat sinyal hilang** (hasil diantre lalu terkirim otomatis).

- **Android / laptop (Chrome, Edge):** buka alamat aplikasi → kartu biru **Pasang Kolej** muncul otomatis di halaman login (dan di menu **Akun**) → ketuk **Pasang**. Bisa juga lewat menu ⋮ → **Instal aplikasi**, atau ikon instal di ujung kanan bilah alamat (laptop).
- **iPhone / iPad (Safari):** ketuk kartu **Pasang Kolej** untuk melihat petunjuk, atau langsung: **Bagikan ⬆︎ → Tambahkan ke Layar Utama → Tambah**.
- Tekan lama ikon Kolej (Android) untuk pintasan cepat: **Scan**, **Kunci**, **Hasil**.

⚠️ **iPhone:** aplikasi yang dipasang punya penyimpanan terpisah dari Safari. Pasang dulu, **lalu login dan scan dari ikon aplikasi** — jangan scan di Safari lalu pindah ke ikon saat masih ada data "menunggu dikirim".

Panduan singkat untuk dibagikan ke guru (WhatsApp/PDF): **`PANDUAN-PASANG-APLIKASI.md`**.

---

## Bagian C — Mulai Memakai

### C1. Login pertama Admin
1. Buka aplikasi → **Masuk sebagai Admin** → username `admin`, password `admin123`.
2. Aplikasi langsung meminta **ganti password**. Simpan password baru di tempat aman.

### C2. Siapkan data (Admin)
1. **Pengaturan** → isi nama sekolah, **ujian aktif** (mis. *PAS Genap 2025/2026*), KKM, warna tema → **Simpan**.
2. **Data Mapel** dan **Data Kelas** → sesuaikan (data contoh boleh dinonaktifkan).
3. **Data Mapel** → atur **KKM** tiap mapel (kosong = KKM bawaan dari Pengaturan).
4. **Data Guru** → **Tambah** (setelah disimpan, langsung muncul lembar **Tugas Mengajar**: ketuk kelas untuk tiap mapel yang diajar guru itu) setiap guru + password awal. Berikan password itu ke guru; mereka wajib menggantinya saat login pertama. Nonaktifkan 2 guru contoh.
5. **Data Siswa** → **Unduh Template** → isi di Excel (kolom NISN sudah berformat teks) → **Impor Excel** → periksa pratinjau (baris merah = perlu diperbaiki) → **Simpan Data Valid**.

### C3. Cetak lembar jawaban
Buka menu **Template LJK** (sidebar laptop, menu Data untuk admin di HP, atau Akun → Template Lembar Jawaban).

| Format | Isi per halaman | Ukuran kotak | Cocok untuk |
|---|---|---|---|
| **A4 penuh** | 1 lembar (A4 mendatar) | 6,6 mm | Paling mudah diisi siswa |
| **A4 dibagi dua** | 2 lembar, digunting | 4,8 mm | Hemat kertas A4 |
| **F4 dibagi dua** | 2 lembar, digunting | 5,5 mm | Kertas F4/Folio |

- **Kosong (untuk fotokopi)** atau **Berisi nama siswa** — nama, NISN, kelas, dan mapel tercetak otomatis per siswa.
- Centang **halaman petunjuk pengisian** (halaman 1): contoh cara mengisi yang benar & salah, untuk dibacakan/ditempel sebelum ujian.
- **Unduhan cepat**: PDF siap cetak ketiga format tetap bisa diunduh tanpa internet.
- Cetak skala **100% / Ukuran sebenarnya** (jangan *Fit to page*). Fotokopi hitam pekat. Keempat **kotak hitam di sudut** dan **batang hitam kecil di kiri atas** jangan terpotong/tertutup.
- Semua format dibaca pemindai yang sama (uji: 12 foto sintetis tiga format — terang, miring, redup, fotokopi — 100% terbaca).

**Cara mengisi yang benar (bacakan ke siswa):** pulpen hitam/biru tua, tanda **X besar** di dalam kotak, satu soal satu X. Ganti jawaban: coret X lama dengan **dua garis mendatar (=)**, lalu X di kotak baru. Jangan dilingkari, dicentang, diarsir, atau diberi titik.

### C4. Alur Guru
1. Login: pilih nama → password → (login pertama: ganti password).
2. **Pilih Mapel & Kelas** — hanya yang ditugaskan admin.
3. **Kunci:** bila admin sudah mengisi, kunci langsung siap (bisa langsung scan). Bila belum, atur **KKM** mapel bila perlu, lalu ketuk A–D tiap soal, atau ⋮ → **Tempel teks kunci** (mis. `ABCDABCD…`). Atur jumlah soal (1–50) dan mode skor (Bagi Rata / Atur Manual) → **Simpan Kunci**.
   Bisa juga **Salin Kelas Lain** untuk mapel yang sama.
4. Ganti mapel/kelas kapan saja lewat tombol biru **Ganti** di kartu atas.
5. **Scan:** ketuk **Mulai Scan** (izinkan kamera) → arahkan ke lembar, keempat kotak hitam masuk layar → tahan diam ±1 detik → **beep** → nilai & tanda hijau/merah muncul.
6. Ada soal kuning **Perlu Dicek** (X ganda / coretan tidak jelas)? Ketuk **Tinjau** → pilih jawaban yang dimaksud siswa.
7. Ketuk **Lanjut: (nama berikutnya)** → ganti kertas → aplikasi otomatis menunggu kertas baru sebelum memindai lagi.
8. **Input Manual** (tanpa kamera): tombol **Input Manual** di halaman Scan → pilih siswa → ketuk jawabannya.
9. **Hasil:** ringkasan, grafik rata-rata per kelas, 10 soal paling sering salah/benar, daftar nilai, koreksi manual, unduh Excel/PDF.

**Tips scan:** cahaya terang merata (pakai tombol senter bila redup), kertas rata di meja, HP sejajar kertas, volume media HP menyala untuk mendengar beep.

---

## Bagian D — Memperbarui Aplikasi

**Backend (setelah `Kode.gs` diubah):**
Tempel kode baru → Simpan → **Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan.**
⚠️ Jangan pilih *Deployment baru* — URL `/exec` akan berubah dan aplikasi berhenti bekerja.

**Frontend (setelah file di folder `kolej-frontend` diubah):**

1. **Naikkan versi dulu** (wajib — tanpa ini HP yang sudah memasang Kolej tetap memakai versi lama dari cache):
   ```powershell
   python tools/bump_version.py . 1.0.2
   ```
   Skrip ini otomatis mengganti `VERSION` di `sw.js`, semua `?v=` di `index.html`/`js`, dan `APP_VERSION` di `js/config.js`. (Butuh Python: https://python.org → centang *Add to PATH* saat instal.)
2. Kirim ke GitHub:
   ```powershell
   git add .
   git commit -m "Update Kolej 1.0.2"
   git push
   ```
3. Tunggu 1–2 menit. Guru yang membuka aplikasi akan melihat bilah **"Versi baru Kolej tersedia → Muat ulang"**. Satu ketukan, selesai. Hasil scan yang masih di antrean HP tetap aman saat muat ulang.

---

## Bagian E — Kecepatan & Keandalan (yang sudah dibangun)

| Momen | Cara kerja | Hasil uji (simulator lokal) |
|---|---|---|
| Login | 1 panggilan server sudah membawa semua data awal (mapel, kelas, siswa, kunci, status scan) | 1 panggilan |
| Buka ulang aplikasi | Data tersimpan di HP, tampil langsung, disegarkan di latar | 0 panggilan, ±0,4 dtk |
| Pindah menu | Data dari HP, tanpa menunggu server | 0 panggilan, <0,1 dtk |
| Scan | Gambar dibaca di HP (±0,2–0,8 dtk), hanya string jawaban + foto kecil yang dikirim | Hasil tampil tanpa menunggu internet |
| Aplikasi terpasang (PWA) | Tampilan disimpan service worker; terbuka instan & tetap terbuka tanpa sinyal | Uji Chrome: syarat instal lolos, muat ulang offline tetap tampil, banner versi baru muncul |
| Sinyal putus | Hasil masuk **antrean HP** dan terkirim otomatis saat online; aman di-retry tanpa data ganda | — |
| Simpan / unduh | Tombol menampilkan animasi loading selama proses | — |
| Server | Cache berversi (data besar dipecah), log ditulis berkelompok tiap 5 menit, token sesi tanpa penyimpanan | Baca ulang data 1.500 siswa: 0 kali baca Sheets |

Cek kecepatan nyata di HP: menu **Akun → Kecepatan**.
Di editor Apps Script, jalankan **`cekPerforma`** untuk melihat ukuran penyimpanan, pemicu, dan antrean log.

**Akurasi pembacaan (uji 16 foto sintetis):** terang, redup, bayangan keras, miring 15°, perspektif kuat, terbalik 180°, diputar 90°, fotokopi + X tipis, agak buram, jauh → **100% soal terbaca benar**; foto sangat buram **ditolak** (diminta scan ulang); X ganda, coretan satu garis, dan coretan miring **selalu ditandai "Perlu dicek"**, tidak ditebak. Uji di kertas sungguhan tetap wajib (≥ 30 lembar, sesuai PRD) sebelum dipakai massal.

---

## Bagian F — Kendala Umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| Layar "URL server belum diisi" | `js/config.js` belum diisi | Isi `GAS_URL`, push ulang |
| "Server membalas tidak terduga" | URL salah / bukan `/exec` / akses bukan *Siapa saja* | Cek ulang langkah A3 |
| Situs 404 di GitHub Pages | Yang di-push folder induk, bukan isi `kolej-frontend` | Di repo GitHub, `index.html` harus terlihat di halaman depan |
| Tampilan tanpa warna/berantakan | Upload lewat web GitHub, folder `css/` `js/` hilang | Ulangi lewat terminal (B3) |
| Kamera tidak terbuka | Izin ditolak / bukan HTTPS | Izinkan kamera di pengaturan situs; pastikan alamat `https://` |
| "Penanda sudut tidak terbaca" | Kotak hitam terpotong/kabur, cahaya kurang | Masukkan 4 kotak hitam ke layar, nyalakan senter |
| "Gambar kurang tajam" | HP bergerak / fokus belum pas | Tahan lebih stabil, jarak ±25–35 cm |
| Banyak soal "Perlu dicek" | Tanda X terlalu tipis / bekas hapusan | Admin → Pengaturan → Sensitivitas (Tinggi untuk X tipis, Rendah bila bekas hapusan ikut terbaca) |
| Tidak ada bunyi beep | Volume media HP mati / mode senyap | Naikkan volume media; ikon 🔊 di layar scan |
| Kartu **Pasang Kolej** tidak muncul | Sudah terpasang, dibuka dari dalam WhatsApp/Instagram, atau bukan HTTPS | Buka di Chrome (Android/laptop) atau Safari (iPhone) lewat `https://` |
| Setelah update tampilan masih lama | Versi belum dinaikkan | Jalankan `tools/bump_version.py`, push ulang; di HP tutup-buka aplikasi |
| "Sesi berakhir" | Token 6 jam habis | Masukkan password lagi; hasil di antrean HP tidak hilang |
| "Tidak bisa dihapus" | Data masih dipakai (mis. mapel sudah punya kunci, kelas masih berisi siswa) | Pilih **Nonaktifkan saja** agar riwayat nilai tetap utuh, atau hapus data terkaitnya dulu |
| Guru melihat "Belum ada tugas mengajar" | Admin belum menetapkan mapel & kelasnya | Admin → Data Guru → **Mengajar** |
| Guru tidak bisa mengisi kunci mapel tertentu | Mapel × kelas itu bukan tugasnya | Admin menambah tugas mengajar, atau admin mengisi kuncinya |
| Banyak "Perlu dicek" pada soal yang dicoret | Coretan hanya 1 garis, sangat miring, atau terlalu pendek | Minta siswa mencoret dengan **2 garis mendatar (=) melintasi kotak**; cek di layar Tinjau |
| Guru lupa password | — | Admin → Data Guru → ikon 🔑 Reset password |
| Akun dikunci 15 menit | 5 kali salah password | Tunggu 15 menit atau Admin reset password |

---

## Berkas dalam paket

```
Kode.gs                     → tempel ke Apps Script
appsscript.json             → manifest Apps Script
PANDUAN-INSTALASI.md        → dokumen ini
PANDUAN-PASANG-APLIKASI.md  → panduan singkat untuk guru (cara memasang Kolej di HP)
kolej-frontend.zip          → frontend; isi ZIP = isi repository GitHub
   ├── index.html, manifest.webmanifest, sw.js, pwa.js, offline.html, README.md
   ├── css/style.css
   ├── js/config.js  ← isi GAS_URL di sini
   ├── js/core.js, app.js, admin.js, scanner.js, scan-worker.js, omr.js, template.js, icons.js
   ├── assets/lembar-jawaban-A4-penuh.pdf, -A4-dibagi-dua.pdf, -F4-dibagi-dua.pdf
   ├── icons/ (192, 512, maskable, apple-touch, favicon)
   └── tools/bump_version.py   ← naikkan versi sebelum setiap update
```
