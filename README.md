# Kolej — Koreksi Lembar Jawaban (frontend)

Aplikasi web (PWA) untuk mengoreksi lembar jawaban pilihan ganda PAS dengan kamera HP.
SMP Budi Luhur Mandiri.

- Frontend statis: `index.html`, `css/`, `js/`, `assets/`, `icons/` → GitHub Pages (HTTPS wajib untuk kamera)
- Backend: Google Apps Script (`Kode.gs`, tidak ada di repo ini) sebagai REST API
- Satu-satunya yang perlu diubah: `js/config.js` → `GAS_URL`

Bisa diinstal (PWA): `manifest.webmanifest`, `sw.js`, `pwa.js`, `offline.html`.
Sebelum setiap update jalankan `python tools/bump_version.py . 1.0.x` agar HP pengguna menerima versi baru.

Panduan lengkap: lihat `PANDUAN-INSTALASI.md`.
