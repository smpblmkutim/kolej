# Panduan Instalasi Kolej — Koreksi Lembar Jawaban

SMP Budi Luhur Mandiri · versi 1.0.1 (bisa diinstal sebagai aplikasi / PWA)

Kolej terdiri dari **dua bagian** yang dipasang terpisah:

| Bagian | Isi | Dipasang di |
|---|---|---|
| **Backend** | `Kode.gs` + `appsscript.json` | Google Apps Script (akun Google sekolah) |
| **Frontend** | isi ZIP `kolej-frontend.zip` | GitHub Pages (HTTPS, wajib untuk kamera) |

Urutannya: **backend dulu** (untuk mendapat URL `/exec`), lalu isi URL itu ke frontend, lalu unggah frontend.

---

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
3. **Data Guru** → **Tambah** setiap guru + password awal. Berikan password itu ke guru; mereka wajib menggantinya saat login pertama. Nonaktifkan 2 guru contoh.
4. **Data Siswa** → **Unduh Template** → isi di Excel (kolom NISN sudah berformat teks) → **Impor Excel** → periksa pratinjau (baris merah = perlu diperbaiki) → **Simpan Data Valid**.

### C3. Cetak lembar jawaban
- Menu **Akun** → **Unduh Template PDF** (file `assets/template-lembar-jawaban-F4.pdf`).
- Cetak di kertas **F4**, skala **100%** (jangan "Fit to page"), lalu gunting di garis putus-putus → 2 lembar per F4.
- Fotokopi dengan hasil **hitam pekat**. Keempat **kotak hitam di sudut** dan **batang hitam kecil di kiri atas** jangan terpotong/tertutup.
- Petunjuk untuk siswa (sudah tercetak di lembar):
  - Beri tanda **X** di kotak jawaban.
  - Ganti jawaban: coret X lama dengan **dua garis mendatar (=)**, lalu beri X di kotak baru.

### C4. Alur Guru
1. Login: pilih nama → password → (login pertama: ganti password).
2. **Pilih Mapel & Kelas.**
3. **Kunci:** ketuk A–D tiap soal, atau ⋮ → **Tempel teks kunci** (mis. `ABCDABCD…`). Atur jumlah soal (1–50) dan mode skor (Bagi Rata / Atur Manual) → **Simpan Kunci**.
   Bisa juga **Salin Kelas Lain** untuk mapel yang sama.
4. **Scan:** ketuk **Mulai Scan** (izinkan kamera) → arahkan ke lembar, keempat kotak hitam masuk layar → tahan diam ±1 detik → **beep** → nilai & tanda hijau/merah muncul.
5. Ada soal kuning **Perlu Dicek** (X ganda / coretan tidak jelas)? Ketuk **Tinjau** → pilih jawaban yang dimaksud siswa.
6. Ketuk **Lanjut: (nama berikutnya)** → ganti kertas → aplikasi otomatis menunggu kertas baru sebelum memindai lagi.
7. **Hasil:** ringkasan, grafik rata-rata per kelas, 10 soal paling sering salah/benar, daftar nilai, koreksi manual, unduh Excel/PDF.

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
   ├── js/core.js, app.js, admin.js, scanner.js, scan-worker.js, omr.js, icons.js
   ├── assets/template-lembar-jawaban-F4.pdf
   ├── icons/ (192, 512, maskable, apple-touch, favicon)
   └── tools/bump_version.py   ← naikkan versi sebelum setiap update
```
