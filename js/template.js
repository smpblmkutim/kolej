/* ==========================================================================
   Kolej — Pembuat Template Lembar Jawaban (PDF via jsPDF)
   Format: A4 penuh (landscape, kotak lebih besar), A4 dibagi dua, F4 dibagi dua.
   Semua format = skala seragam dari LAYOUT dasar di omr.js → pembaca OMR sama.
   Bisa dijalankan di browser (window.LJK) maupun Node (membuat PDF cadangan).
   ========================================================================== */
(function (root) {
  'use strict';
  const OMR = root.OMR || (typeof require !== 'undefined' ? require('./omr.js') : null);
  const L = OMR.LAYOUT;

  const FORMATS = {
    'A4-1': { label: 'A4 penuh (1 lembar per halaman)', page: [297, 210], orientation: 'landscape', paper: 'A4', s: 1.2, slots: [[19.5, 6]], cut: [] },
    'A4-2': { label: 'A4 dibagi dua (2 lembar per halaman)', page: [210, 297], orientation: 'portrait', paper: 'A4', s: 0.88, slots: [[10.4, 1.65], [10.4, 150.15]], cut: [148.5] },
    'F4-2': { label: 'F4 dibagi dua (2 lembar per halaman)', page: [215, 330], orientation: 'portrait', paper: 'F4', s: 1, slots: [[0, 0], [0, 165]], cut: [165] }
  };
  const PT = 0.3528;                                   // 1 pt dalam mm

  function centers(q) { return OMR.boxCenter(q); }

  /** Gambar satu lembar jawaban pada slot (ox, oy) dengan skala s. */
  function drawSheet(doc, ox, oy, s, o, st) {
    const X = x => ox + x * s, Y = y => oy + y * s, F = pt => pt * s;
    const font = (style, pt) => { doc.setFont('helvetica', style); doc.setFontSize(F(pt)); };
    const fit = (txt, style, pt, maxW) => { let p = pt; font(style, p); while (doc.getTextWidth(txt) > maxW * s && p > 5) { p -= 0.25; font(style, p); } };
    doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
    // penanda sudut + batang orientasi
    L.markers.forEach(([mx, my]) => doc.rect(X(mx - L.msize / 2), Y(my - L.msize / 2), L.msize * s, L.msize * s, 'F'));
    doc.rect(X(L.orient[0] - 6), Y(L.orient[1] - 2), 12 * s, 4 * s, 'F');
    // judul
    const sek = String(o.sekolah || 'SMP Budi Luhur Mandiri').toUpperCase();
    fit(sek, 'bold', 11, 96); doc.text(sek, X(112), Y(13.2), { align: 'center' });
    const ttl = ('LEMBAR JAWABAN ' + String(o.ujian || 'PENILAIAN AKHIR SEMESTER')).toUpperCase();
    fit(ttl, 'bold', 8.5, 100); doc.text(ttl, X(112), Y(18), { align: 'center' });
    // identitas
    doc.setLineWidth(0.5 * PT * s);
    const field = (lbl, x1, x2, y, val) => {
      font('normal', 8.5); doc.text(lbl, X(x1), Y(y));
      doc.line(X(x1 + 12), Y(y + 0.8), X(x2), Y(y + 0.8));
      if (val) { fit(String(val), 'bold', 9.5, x2 - x1 - 13); doc.text(String(val), X(x1 + 13), Y(y - 0.2)); }
    };
    field('Nama', 14, 120, 28, st && st.nama);
    field('NISN', 14, 120, 35, st && st.nisn);
    field('Kelas', 14, 62, 42, (st && st.kelas) || o.kelas);
    field('Mapel', 66, 120, 42, (st && st.mapel) || o.mapel);
    // petunjuk singkat + contoh
    doc.setLineWidth(0.4 * PT * s);
    doc.roundedRect(X(124), Y(21.5), 79 * s, 27 * s, 1.5 * s, 1.5 * s, 'S');
    font('bold', 7); doc.text('PETUNJUK PENGISIAN', X(127), Y(25.4));
    font('normal', 6.1);
    doc.text('• Pakai pulpen hitam/biru tua. Beri tanda X besar di kotak.', X(127), Y(29));
    doc.text('• Ganti jawaban: coret X lama dengan 2 garis mendatar (=).', X(127), Y(32.2));
    doc.text('• Satu soal satu jawaban. Jangan dilipat/ditutup kotak hitam.', X(127), Y(35.4));
    const ex = (x, y, kind) => exampleBox(doc, X(x), Y(y), 3.8 * s, kind, s);
    font('normal', 5.6);
    ex(127, 38.2, 'x'); doc.text('Benar', X(127.2), Y(46.3));
    ex(136.5, 38.2, 'cancel'); ex(141.8, 38.2, 'x'); doc.text('Ganti jawaban', X(135.6), Y(46.3));
    doc.setTextColor(0); font('bold', 6); doc.text('SALAH:', X(155), Y(41.2));
    font('normal', 5.6);
    font('normal', 4.9);
    [['circle', 'lingkar'], ['check', 'centang'], ['fill', 'arsir'], ['dot', 'titik'], ['small', 'kecil']].forEach(([k, t], i) => {
      const bx = 162 + i * 7.6; ex(bx, 38.2, k); doc.text(t, X(bx + 1.9), Y(46.3), { align: 'center' });
    });
    // grid jawaban
    for (let b = 0; b < L.cols; b++) {
      const bx = L.x0 + b * (L.blockW + L.gap);
      font('bold', 8);
      'ABCD'.split('').forEach((ch, j) => doc.text(ch, X(bx + L.label + L.pitch / 2 + j * L.pitch), Y(L.y0 - 5.6), { align: 'center' }));
      for (let i = 0; i < L.rows; i++) {
        const q = b * 10 + i + 1, cy = L.y0 + i * L.rowPitch;
        font('bold', 8.5); doc.text(String(q), X(bx + L.label - 0.3), Y(cy + 1.1), { align: 'right' });
        doc.setLineWidth(0.9 * PT * s);
        centers(q).forEach(([cx]) => doc.rect(X(cx - L.box / 2), Y(cy - L.box / 2), L.box * s, L.box * s, 'S'));
      }
    }
    font('normal', 6);
    doc.text('Kolej · Template v1 · ' + o.formatLabel + ' · Jangan dilipat, jangan menutup kotak hitam di sudut', X(107.5), Y(154), { align: 'center' });
  }

  /** Contoh kotak isian (petunjuk). x,y = pojok kiri atas, sz = sisi (mm). */
  function exampleBox(doc, x, y, sz, kind, s) {
    s = s || 1;
    doc.setDrawColor(0); doc.setLineWidth(0.35 * s);
    doc.rect(x, y, sz, sz, 'S');
    const m = sz * 0.16, lw = Math.max(0.35, sz * 0.09);
    doc.setLineWidth(lw);
    const X = () => { doc.line(x + m, y + m, x + sz - m, y + sz - m); doc.line(x + sz - m, y + m, x + m, y + sz - m); };
    if (kind === 'x' || kind === 'cancel') X();
    if (kind === 'cancel') { doc.line(x - sz * 0.15, y + sz * 0.38, x + sz * 1.15, y + sz * 0.38); doc.line(x - sz * 0.15, y + sz * 0.62, x + sz * 1.15, y + sz * 0.62); }
    if (kind === 'circle') doc.circle(x + sz / 2, y + sz / 2, sz * 0.32, 'S');
    if (kind === 'check') { doc.line(x + sz * 0.18, y + sz * 0.55, x + sz * 0.42, y + sz * 0.8); doc.line(x + sz * 0.42, y + sz * 0.8, x + sz * 0.85, y + sz * 0.2); }
    if (kind === 'fill') { doc.setFillColor(0); doc.rect(x + sz * 0.12, y + sz * 0.12, sz * 0.76, sz * 0.76, 'F'); }
    if (kind === 'dot') { doc.setFillColor(0); doc.circle(x + sz / 2, y + sz / 2, sz * 0.1, 'F'); }
    if (kind === 'small') { const c = sz * 0.2; doc.setLineWidth(lw * 0.6); doc.line(x + sz - c * 2.2, y + c * 0.6, x + sz - c * 0.6, y + c * 2.2); doc.line(x + sz - c * 0.6, y + c * 0.6, x + sz - c * 2.2, y + c * 2.2); }
    if (kind === 'outside') { const ox = x + sz * 1.25; doc.line(ox, y, ox + sz * 0.7, y + sz * 0.7); doc.line(ox + sz * 0.7, y, ox, y + sz * 0.7); }
    if (kind === 'slant') { X(); doc.line(x - sz * 0.1, y + sz * 0.8, x + sz * 1.1, y + sz * 0.15); }
  }

  /** Halaman petunjuk lengkap (siswa + guru/pengawas). */
  function drawGuide(doc, W, H, o) {
    const mx = 16, cw = W - 2 * mx; let y = 18;
    const font = (st, pt, c) => { doc.setFont('helvetica', st); doc.setFontSize(pt); doc.setTextColor(...(c || [15, 23, 42])); };
    const para = (txt, pt, st, indent) => { font(st || 'normal', pt || 10.5); const lines = doc.splitTextToSize(txt, cw - (indent || 0)); doc.text(lines, mx + (indent || 0), y); y += lines.length * pt * 0.43 + 1.6; };
    doc.setFillColor(37, 99, 235); doc.rect(0, 0, W, 6, 'F');
    font('bold', 17); doc.text('PETUNJUK PENGISIAN LEMBAR JAWABAN', mx, y); y += 6.5;
    font('normal', 10, [71, 85, 105]); doc.text(String(o.sekolah || '') + (o.ujian ? ' · ' + o.ujian : '') + ' · dipindai dengan aplikasi Kolej', mx, y); y += 9;
    const head = (n, t, rgb) => { doc.setFillColor(...rgb); doc.roundedRect(mx, y - 5, 7, 7, 1.5, 1.5, 'F'); font('bold', 9.5, [255, 255, 255]); doc.text(String(n), mx + 3.5, y, { align: 'center' }); font('bold', 12.5); doc.text(t, mx + 10, y); y += 7; };
    // 1. Benar
    head(1, 'Cara mengisi yang BENAR', [22, 163, 74]);
    const card = (x, w, kinds, title, desc, good) => {
      doc.setDrawColor(...(good ? [22, 163, 74] : [220, 38, 38])); doc.setLineWidth(0.5); doc.roundedRect(x, y, w, 37, 2.5, 2.5, 'S');
      let bx = x + (w - kinds.length * 13 + 3) / 2;
      kinds.forEach(k => { exampleBox(doc, bx, y + 5, 10, k, 1.6); bx += 13; });
      font('bold', 10, good ? [21, 128, 61] : [185, 28, 28]); doc.text(title, x + w / 2, y + 23, { align: 'center' });
      font('normal', 8.3, [51, 65, 85]); doc.text(doc.splitTextToSize(desc, w - 6), x + w / 2, y + 27.5, { align: 'center' });
    };
    const g3 = (cw - 8) / 3;
    card(mx, g3, ['x'], 'Tanda X besar', 'Silang memenuhi kotak, garis tegas.', true);
    card(mx + g3 + 4, g3, ['cancel', 'x'], 'Mengganti jawaban', 'Coret X lama dengan 2 garis mendatar (=), lalu X di kotak baru.', true);
    card(mx + 2 * (g3 + 4), g3, ['empty'], 'Tidak menjawab', 'Biarkan keempat kotak kosong.', true);
    y += 44;
    // 2. Salah
    head(2, 'Cara mengisi yang SALAH (tidak terbaca / ditandai perlu dicek)', [220, 38, 38]);
    const bad = [['circle', 'Dilingkari'], ['check', 'Dicentang'], ['fill', 'Diarsir penuh'], ['dot', 'Titik'], ['small', 'X terlalu kecil'], ['slant', 'Coretan 1 garis/miring']];
    const g6 = (cw - 5 * 3) / 6;
    bad.forEach(([k, t], i) => {
      const x = mx + i * (g6 + 3);
      doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4); doc.roundedRect(x, y, g6, 27, 2, 2, 'S');
      exampleBox(doc, x + g6 / 2 - 5, y + 4, 10, k, 1.6);
      font('bold', 8, [185, 28, 28]); doc.text(doc.splitTextToSize(t, g6 - 3), x + g6 / 2, y + 20, { align: 'center' });
    });
    y += 31;
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.4); doc.roundedRect(mx, y, cw, 18, 2, 2, 'S');
    exampleBox(doc, mx + 5, y + 4, 10, 'x', 1.6); exampleBox(doc, mx + 18, y + 4, 10, 'x', 1.6);
    font('bold', 9.5, [185, 28, 28]); doc.text('Dua jawaban dalam satu soal', mx + 34, y + 8);
    font('normal', 8.5, [51, 65, 85]); doc.text('Bila ingin mengganti, coret dulu X lama dengan 2 garis mendatar.', mx + 34, y + 13);
    exampleBox(doc, mx + cw - 34, y + 4, 10, 'outside', 1.6);
    font('bold', 8, [185, 28, 28]); doc.text('Di luar kotak', mx + cw - 20, y + 16, { align: 'center' });
    y += 26;
    // 3. Wajib
    head(3, 'Wajib diperhatikan siswa', [37, 99, 235]);
    [
      'Gunakan pulpen hitam atau biru tua. Pensil tipis sulit terbaca (bila terpaksa pensil, pakai 2B dan tebalkan).',
      'Tulis Nama, NISN, Kelas, dan Mapel dengan jelas di bagian atas.',
      'Satu soal hanya SATU tanda X. Isi sesuai nomor soal (nomor 1–10 di kolom pertama, 11–20 di kolom kedua, dst.).',
      'JANGAN mencoret, menulis, atau menutup 4 kotak hitam di sudut dan batang hitam kecil di kiri atas.',
      'JANGAN melipat, meremas, atau membasahi lembar jawaban. Jangan menulis di area kotak selain tanda X.'
    ].forEach(t => { font('normal', 10); doc.setFillColor(37, 99, 235); doc.circle(mx + 2, y - 1.3, 0.9, 'F'); const ln = doc.splitTextToSize(t, cw - 7); doc.text(ln, mx + 6, y); y += ln.length * 4.4 + 1.8; });
    y += 3;
    // 4. Guru
    head(4, 'Untuk guru / pengawas', [100, 116, 139]);
    [
      'Cetak dengan skala 100% ("Ukuran sebenarnya / Actual size"), jangan "Fit to page". Kertas ' + o.paper + (o.orientation === 'landscape' ? ' posisi mendatar (landscape).' : '.'),
      o.cut ? 'Gunting tepat di garis putus-putus sehingga satu halaman menjadi 2 lembar jawaban.' : 'Satu halaman = satu lembar jawaban (kotak lebih besar, mudah diisi).',
      'Fotokopi dengan hasil hitam pekat dan tajam. Hindari fotokopi terlalu terang atau bergaris.',
      'Saat memindai: cahaya terang merata, kertas rata di meja, keempat kotak hitam masuk layar kamera, tahan diam ±1 detik sampai berbunyi beep.'
    ].forEach(t => { font('normal', 10); doc.setFillColor(100, 116, 139); doc.circle(mx + 2, y - 1.3, 0.9, 'F'); const ln = doc.splitTextToSize(t, cw - 7); doc.text(ln, mx + 6, y); y += ln.length * 4.4 + 1.8; });
    font('normal', 8, [100, 116, 139]); doc.text('Kolej · Koreksi Lembar Jawaban · template v1', W / 2, H - 8, { align: 'center' });
    doc.setTextColor(0); doc.setDrawColor(0); doc.setFillColor(0);
  }

  /**
   * Buat dokumen PDF.
   * o: { format, sekolah, ujian, mapel, kelas, petunjuk:bool, pages:n (cetakan kosong), students:[{nama,nisn,kelas,mapel}] }
   */
  function build(jsPDFCtor, o) {
    const f = FORMATS[o.format] || FORMATS['F4-2'];
    const oo = Object.assign({ formatLabel: f.label, paper: f.paper, orientation: f.orientation, cut: f.cut.length > 0 }, o);
    const sheetFmt = f.page.slice().sort((a, b) => a - b), guideH = f.paper === 'F4' ? 330 : 297;
    const doc = o.petunjuk ? new jsPDFCtor({ unit: 'mm', format: [210, guideH], orientation: 'portrait', compress: true })
      : new jsPDFCtor({ unit: 'mm', format: sheetFmt, orientation: f.orientation, compress: true });
    doc.setProperties({ title: 'Lembar Jawaban Kolej - ' + f.label, creator: 'Kolej' });
    const sheets = o.students && o.students.length ? o.students : Array.from({ length: Math.max(1, (o.pages || 1) * f.slots.length) }, () => null);
    let first = true;
    if (o.petunjuk) { drawGuide(doc, 210, guideH, oo); first = false; }
    for (let i = 0; i < sheets.length; i += f.slots.length) {
      if (!first) doc.addPage(sheetFmt, f.orientation);
      first = false;
      f.slots.forEach(([ox, oy], k) => { if (i + k < sheets.length || !o.students) drawSheet(doc, ox, oy, f.s, oo, sheets[i + k]); });
      f.cut.forEach(cy => {
        doc.setLineDashPattern([2.5, 2.5], 0); doc.setLineWidth(0.25); doc.setDrawColor(120);
        doc.line(0, cy, f.page[0], cy); doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(120); doc.text('✂ gunting di sini', 3, cy - 0.8); doc.setTextColor(0); doc.setDrawColor(0);
      });
    }
    return doc;
  }

  const LJK = { FORMATS, build, drawSheet, drawGuide, exampleBox };
  root.LJK = LJK;
  if (typeof module !== 'undefined') module.exports = LJK;
})(typeof window !== 'undefined' ? window : globalThis);
