/* ==========================================================================
   Kolej — Mesin Pembaca Lembar Jawaban (OMR) ringan, tanpa OpenCV
   - Mendeteksi 4 penanda hitam di sudut, meluruskan (homografi), membaca kotak.
   - Berjalan penuh di HP; fungsi murni sehingga bisa diuji di Node.
   Geometri LAYOUT harus sama dengan tools/make_template.py (template v1).
   ========================================================================== */
(function (root) {
  'use strict';

  const LAYOUT = {
    version: 1,
    w: 215, h: 165,                                   // ukuran setengah F4 (mm)
    markers: [[12, 12], [203, 12], [203, 153], [12, 153]], // TL, TR, BR, BL (pusat, mm)
    msize: 7,
    orient: [30, 12],                                 // batang orientasi (pusat)
    paperRef: [52, 12],                               // titik kertas kosong pembanding
    box: 5.5, x0: 11, blockW: 35, gap: 4.5, label: 7, pitch: 7,
    y0: 61, rowPitch: 9, rows: 10, cols: 5, questions: 50
  };
  const S = 5;                                        // piksel per mm hasil pelurusan
  const OUT_W = LAYOUT.w * S, OUT_H = LAYOUT.h * S;

  const SENS = {                                      // ambang per tingkat sensitivitas
    rendah: { empty: 0.06, mark: 0.11, filled: 0.62, line: 0.72 },
    sedang: { empty: 0.05, mark: 0.09, filled: 0.60, line: 0.68 },
    tinggi: { empty: 0.04, mark: 0.07, filled: 0.58, line: 0.64 }
  };

  function boxCenter(q) {                              // q: 1..50 → pusat kotak (mm)
    const b = Math.floor((q - 1) / 10), i = (q - 1) % 10;
    const bx = LAYOUT.x0 + b * (LAYOUT.blockW + LAYOUT.gap);
    const cy = LAYOUT.y0 + i * LAYOUT.rowPitch;
    const out = [];
    for (let j = 0; j < 4; j++) out.push([bx + LAYOUT.label + LAYOUT.pitch / 2 + j * LAYOUT.pitch, cy]);
    return out;
  }

  /* ---------------- Gambar dasar ---------------- */
  function toGray(img) {                               // ImageData-like → {w,h,d}
    const n = img.width * img.height, d = new Uint8Array(n), s = img.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) d[i] = (s[j] * 77 + s[j + 1] * 150 + s[j + 2] * 29) >> 8;
    return { w: img.width, h: img.height, d };
  }
  function downscale(g, maxDim) {
    const f = Math.max(g.w, g.h) / maxDim;
    if (f <= 1) return { g, f: 1 };
    const w = Math.round(g.w / f), h = Math.round(g.h / f), d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {                        // rata-rata blok (bukan cuplik 1 piksel) → noise teredam
      const y0 = Math.floor(y * f), y1 = Math.min(g.h, Math.max(y0 + 1, Math.floor((y + 1) * f)));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * f), x1 = Math.min(g.w, Math.max(x0 + 1, Math.floor((x + 1) * f)));
        let sum = 0, n = 0;
        for (let yy = y0; yy < y1; yy += (y1 - y0 > 2 ? 2 : 1)) for (let xx = x0; xx < x1; xx += (x1 - x0 > 2 ? 2 : 1)) { sum += g.d[yy * g.w + xx]; n++; }
        d[y * w + x] = sum / n;
      }
    }
    return { g: { w, h, d }, f };
  }
  function integral(g) {
    const W = g.w + 1, I = new Float64Array(W * (g.h + 1));
    for (let y = 0; y < g.h; y++) {
      let row = 0;
      for (let x = 0; x < g.w; x++) { row += g.d[y * g.w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; }
    }
    return I;
  }
  function boxMean(I, W1, w, h, x, y, r) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    return (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
  }
  function blur3(g) {                                  // box blur 3x3 terpisah (2 lintasan)
    const W = g.w, H = g.h, t = new Uint16Array(W * H), out = new Uint8Array(W * H), d = g.d;
    for (let y = 0; y < H; y++) { const o = y * W; t[o] = d[o] * 2 + d[o + 1]; for (let x = 1; x < W - 1; x++) t[o + x] = d[o + x - 1] + d[o + x] + d[o + x + 1]; t[o + W - 1] = d[o + W - 2] + d[o + W - 1] * 2; }
    for (let x = 0; x < W; x++) {
      out[x] = (t[x] * 2 + t[W + x]) / 9;
      for (let y = 1; y < H - 1; y++) out[y * W + x] = (t[(y - 1) * W + x] + t[y * W + x] + t[(y + 1) * W + x]) / 9;
      out[(H - 1) * W + x] = (t[(H - 2) * W + x] + t[(H - 1) * W + x] * 2) / 9;
    }
    return { w: W, h: H, d: out };
  }
  /** Tingkat kertas (P), tinta (I) & noise relatif — dasar kalibrasi otomatis untuk cahaya redup. */
  function levels(g) {
    const hist = new Uint32Array(256), d = g.d, n = d.length, step = 3;
    let dsum = [], cnt = 0;
    for (let i = 0; i < n; i += step) hist[d[i]]++;
    const pct = p => { let t = 0, lim = (n / step) * p; for (let v = 0; v < 256; v++) { t += hist[v]; if (t >= lim) return v; } return 255; };
    const P = pct(0.6), I = pct(0.015);
    const diffs = new Uint32Array(256);                  // noise: median |g[x+1]-g[x]| (tepi hanya minoritas)
    for (let y = 2; y < g.h - 2; y += 4) for (let x = 2; x < g.w - 3; x += 2) { diffs[Math.min(255, Math.abs(d[y * g.w + x + 1] - d[y * g.w + x]))]++; cnt++; }
    let t = 0, med = 0; for (let v = 0; v < 256; v++) { t += diffs[v]; if (t >= cnt / 2) { med = v; break; } }
    const C = Math.max(12, P - I);
    return { P, I, C, noise: (med * 1.48 / 1.41) / C };
  }
  function binarize(g, r, k, minDiff) {                // gelap relatif terhadap sekitar
    const I = integral(g), W1 = g.w + 1, b = new Uint8Array(g.w * g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const m = boxMean(I, W1, g.w, g.h, x, y, r), v = g.d[y * g.w + x];
      if (v < m * k && m - v > minDiff) b[y * g.w + x] = 1;
    }
    return b;
  }

  /* ---------------- Deteksi penanda ---------------- */
  function components(b, w, h, maxArea) {
    const lab = new Int32Array(w * h), out = [], stack = new Int32Array(w * h);
    let id = 0;
    for (let p = 0; p < w * h; p++) {
      if (!b[p] || lab[p]) continue;
      id++; let sp = 0; stack[sp++] = p; lab[p] = id;
      let area = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, big = false;
      while (sp) {
        const q = stack[--sp], x = q % w, y = (q - x) / w;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (area > maxArea) big = true;
        if (x > 0 && b[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack[sp++] = q - 1; }
        if (x < w - 1 && b[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack[sp++] = q + 1; }
        if (y > 0 && b[q - w] && !lab[q - w]) { lab[q - w] = id; stack[sp++] = q - w; }
        if (y < h - 1 && b[q + w] && !lab[q + w]) { lab[q + w] = id; stack[sp++] = q + w; }
      }
      if (!big) out.push({ area, cx: sx / area, cy: sy / area, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
    }
    return out;
  }
  function orderCW(pts) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
    return pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }
  function quadArea(p) {
    let a = 0; for (let i = 0; i < 4; i++) { const q = p[(i + 1) % 4]; a += p[i].x * q.y - q.x * p[i].y; }
    return Math.abs(a) / 2;
  }
  function isConvex(p) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cr === 0) return false; const s = cr > 0 ? 1 : -1;
      if (!sign) sign = s; else if (s !== sign) return false;
    }
    return true;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const EXP_RATIO = (LAYOUT.markers[1][0] - LAYOUT.markers[0][0]) / (LAYOUT.markers[3][1] - LAYOUT.markers[0][1]);
  const EXP_MREL = LAYOUT.msize / (LAYOUT.markers[1][0] - LAYOUT.markers[0][0]);

  /** Cari 4 penanda pada citra abu-abu. Return {pts:[4 titik CW], score} atau null. */
  function findMarkers(g) {
    const r = Math.max(8, Math.round(Math.max(g.w, g.h) / 14));
    const lv = levels(g), b = binarize(g, r, lv.C < 60 ? 0.8 : 0.72, Math.max(9, Math.min(25, 0.35 * lv.C)));   // ambang ikut kontras (redup)
    const maxSide = Math.max(g.w, g.h) * 0.09;
    const comps = components(b, g.w, g.h, maxSide * maxSide * 1.3);
    let c = comps.filter(o => {
      const side = Math.max(o.bw, o.bh), asp = o.bw / o.bh, fill = o.area / (o.bw * o.bh);
      return side >= 5 && side <= maxSide && asp > 0.5 && asp < 2 && fill > 0.58;
    }).sort((a, b) => b.area - a.area).slice(0, 14);
    if (c.length < 4) return null;
    let best = null; const cand = [];
    const n = c.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
      const set = [c[i], c[j], c[k], c[l]];
      const amax = Math.max(...set.map(s => s.area)), amin = Math.min(...set.map(s => s.area));
      if (amax / amin > 3.2) continue;
      const p = orderCW(set.map(s => ({ x: s.cx, y: s.cy, a: s.area })));
      if (!isConvex(p)) continue;
      const s0 = dist(p[0], p[1]), s1 = dist(p[1], p[2]), s2 = dist(p[2], p[3]), s3 = dist(p[3], p[0]);
      if (Math.min(s0, s2) / Math.max(s0, s2) < 0.55 || Math.min(s1, s3) / Math.max(s1, s3) < 0.55) continue;
      const A = (s0 + s2) / 2, B = (s1 + s3) / 2, ratio = Math.max(A, B) / Math.min(A, B);
      if (ratio < 1.05 || ratio > 1.9) continue;
      const mside = Math.sqrt(set.reduce((s, o) => s + o.area, 0) / 4);
      const mrel = mside / Math.max(A, B);
      if (mrel < EXP_MREL * 0.45 || mrel > EXP_MREL * 2.2) continue;
      const area = quadArea(p);
      if (area < g.w * g.h * 0.08) continue;
      const score = area * Math.exp(-Math.pow((ratio - EXP_RATIO) / 0.13, 2)) * (1 - Math.min(0.6, Math.abs(Math.log(mrel / EXP_MREL)) / 2));
      cand.push({ pts: p, score });
      if (!best || score > best.score) best = { pts: p, score };
    }
    if (best) best.alts = cand.sort((a, b) => b.score - a.score).slice(1, 4);   // cadangan bila orientasi gagal
    return best;
  }

  /* ---------------- Homografi ---------------- */
  function solve(A, b) {                               // eliminasi Gauss 8x8
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }
  function homography(src, dst) {                      // src[i]=[x,y] → dst[i]=[x,y]
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b); if (!h) return null; h.push(1); return h;
  }
  function apply(H, x, y) { const z = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z]; }

  function sampleGray(g, x, y) {
    if (x < 0 || y < 0 || x >= g.w - 1 || y >= g.h - 1) return 255;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * g.w + x0, d = g.d;
    return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + g.w] * (1 - fx) + d[i + g.w + 1] * fx) * fy;
  }
  function meanAround(g, H, mx, my, rmm) {
    let s = 0, n = 0;
    for (let dy = -rmm; dy <= rmm; dy += rmm / 3) for (let dx = -rmm; dx <= rmm; dx += rmm / 3) {
      const [x, y] = apply(H, mx + dx, my + dy); s += sampleGray(g, x, y); n++;
    }
    return s / n;
  }
  /** Perbaiki pusat penanda di resolusi penuh: pusat massa piksel gelap di jendela. */
  function refineMarker(g, p, half) {
    const x0 = Math.max(0, Math.round(p.x - half)), x1 = Math.min(g.w - 1, Math.round(p.x + half));
    const y0 = Math.max(0, Math.round(p.y - half)), y1 = Math.min(g.h - 1, Math.round(p.y + half));
    let mn = 255, mx = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = g.d[y * g.w + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const t = (mn + mx) / 2; let sx = 0, sy = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g.d[y * g.w + x] < t) { sx += x; sy += y; n++; }
    return n ? { x: sx / n, y: sy / n } : p;
  }

  /** Pilih rotasi (0..3) yang batang orientasinya paling gelap. */
  function solveOrientation(g, pts) {
    let best = null;
    for (let r = 0; r < 4; r++) {
      const dst = [0, 1, 2, 3].map(i => [pts[(i + r) % 4].x, pts[(i + r) % 4].y]);
      const H = homography(LAYOUT.markers, dst); if (!H) continue;
      const bar = meanAround(g, H, LAYOUT.orient[0], LAYOUT.orient[1], 1.3);
      const paper = meanAround(g, H, LAYOUT.paperRef[0], LAYOUT.paperRef[1], 1.5);
      const s0 = dist(pts[r % 4], pts[(r + 1) % 4]), s1 = dist(pts[(r + 1) % 4], pts[(r + 2) % 4]);
      const contrast = (paper - bar) * (s0 > s1 ? 1 : 0.3);  // sisi atas harus sisi panjang
      if (!best || contrast > best.contrast) best = { H, r, contrast };
    }
    return best;
  }

  /** Luruskan ke citra warna OUT_W x OUT_H (ImageData-like). */
  function warp(img, H) {
    const out = new Uint8ClampedArray(OUT_W * OUT_H * 4), s = img.data, W = img.width, Hh = img.height;
    for (let v = 0; v < OUT_H; v++) {
      const my = (v + 0.5) / S;
      for (let u = 0; u < OUT_W; u++) {
        const mx = (u + 0.5) / S;
        const z = H[6] * mx + H[7] * my + H[8];
        const x = (H[0] * mx + H[1] * my + H[2]) / z, y = (H[3] * mx + H[4] * my + H[5]) / z;
        const o = (v * OUT_W + u) * 4;
        if (x < 0 || y < 0 || x >= W - 1 || y >= Hh - 1) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; continue; }
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * W + x0) * 4, j = i + W * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        out[o] = s[i] * w00 + s[i + 4] * w10 + s[j] * w01 + s[j + 4] * w11;
        out[o + 1] = s[i + 1] * w00 + s[i + 5] * w10 + s[j + 1] * w01 + s[j + 5] * w11;
        out[o + 2] = s[i + 2] * w00 + s[i + 6] * w10 + s[j + 2] * w01 + s[j + 6] * w11;
        out[o + 3] = 255;
      }
    }
    return { width: OUT_W, height: OUT_H, data: out };
  }

  /** Luruskan ke citra ABU-ABU (1 kanal) — 3x lebih ringan dari warna; dipakai untuk membaca & tampilan. */
  function warpGray(g, H) {
    const out = new Uint8ClampedArray(OUT_W * OUT_H), d = g.d, W = g.w, Hh = g.h;
    for (let v = 0; v < OUT_H; v++) {
      const my = (v + 0.5) / S;
      // homografi linear sepanjang baris: hitung pembilang & penyebut secara inkremental
      let nx = H[0] * (0.5 / S) + H[1] * my + H[2], ny = H[3] * (0.5 / S) + H[4] * my + H[5], nz = H[6] * (0.5 / S) + H[7] * my + H[8];
      const dx = H[0] / S, dy = H[3] / S, dz = H[6] / S;
      let o = v * OUT_W;
      for (let u = 0; u < OUT_W; u++, o++, nx += dx, ny += dy, nz += dz) {
        const x = nx / nz, y = ny / nz;
        if (x < 0 || y < 0 || x >= W - 1 || y >= Hh - 1) { out[o] = 255; continue; }
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
        const a = d[i] + (d[i + 1] - d[i]) * fx, b = d[i + W] + (d[i + W + 1] - d[i + W]) * fx;
        out[o] = a + (b - a) * fy;
      }
    }
    return { w: OUT_W, h: OUT_H, d: out };
  }
  /** Ubah citra abu-abu menjadi RGBA (untuk kanvas tampilan). */
  function grayToRGBA(g) {
    const n = g.w * g.h, out = new Uint8ClampedArray(n * 4);
    for (let i = 0, j = 0; i < n; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = g.d[i]; out[j + 3] = 255; }
    return { width: g.w, height: g.h, data: out };
  }

  /* ---------------- Pembacaan kotak ---------------- */
  /**
   * Deteksi garis coretan mendatar dalam satu kotak dengan pencarian garis LURUS (mini-Hough):
   * kemiringan −0,25…0,25 (±14°), posisi di seluruh tinggi dalam kotak. Garis dianggap ada bila
   * ≥ 85% piksel sepanjang lebar kotak gelap (toleransi ±1 px). Lengan X (45°) & interior X yang putih
   * tidak pernah memenuhi syarat ini, sehingga X tebal/buram tidak terbaca sebagai coretan.
   * Return {bands:[{m,t}], th} — kelompok garis (pita) di posisi tengah kotak & tebalnya (px).
   */
  function horizLines(B, W, bx, by, hs, tol) {
    const x0 = Math.round(bx - 0.78 * hs), x1 = Math.round(bx + 0.78 * hs), n = x1 - x0 + 1;
    const yA = Math.round(by - hs + 3), yB = Math.round(by + hs - 3);
    const ok = new Uint8Array(yB - yA + 1);
    const dk = (x, y) => B[y * W + x] | B[(y - 1) * W + x] | B[(y + 1) * W + x];
    for (let k = -5; k <= 5; k++) {
      const slope = k * 0.05;
      for (let yc = yA; yc <= yB; yc++) {                // yc = posisi garis di kolom tengah
        if (ok[yc - yA]) continue;
        if (Math.abs(yc - by) + Math.abs(slope) * 0.78 * hs + 1 > hs - 3.5) continue;   // jangan menyentuh tepi kotak
        let hit = 0, miss = 0, lim = Math.floor(n * (tol || 0.15));
        for (let x = x0; x <= x1; x++) {
          const y = Math.round(yc + (x - bx) * slope);
          if (y < 1 || y >= (B.length / W) - 1) { miss++; } else if (dk(x, y)) hit++; else miss++;
          if (miss > lim) break;
        }
        if (miss <= lim) ok[yc - yA] = 1;
      }
    }
    const bands = []; let r0 = -1;
    for (let r = 0; r <= ok.length; r++) {
      if (r < ok.length && ok[r]) { if (r0 < 0) r0 = r; }
      else if (r0 >= 0) { bands.push({ m: yA + (r0 + r - 1) / 2 - by, t: r - r0 }); r0 = -1; }
    }
    return { bands, th: bands.reduce((m, b) => Math.max(m, b.t), 0) };
  }

  function readWarped(gw, sensName) {
    const T = SENS[sensName] || SENS.sedang;
    if (gw.data) gw = toGray(gw);                        // terima RGBA (kompatibel) atau abu-abu
    // kalibrasi otomatis: makin gelap/berbintik → makin dihaluskan & ambang mengikuti kontras kertas–tinta
    const lv = levels(gw);
    if (lv.noise > 0.1 || lv.C < 30) return { dark: true, light: { P: lv.P, C: lv.C, noise: Math.round(lv.noise * 1000) / 1000 }, quality: 0, jawaban: '', detail: [], boxes: [] };
    let gs = gw;
    if (lv.noise > 0.035) gs = blur3(gs);
    if (lv.noise > 0.09) gs = blur3(gs);
    const B = binarize(gs, Math.round(4 * S), 0.86, Math.max(5, Math.min(14, 0.16 * lv.C)));
    const W = gw.w, half = LAYOUT.box * S / 2, hs = Math.round(half);
    const dark = (x, y) => (x >= 0 && y >= 0 && x < W && y < gw.h) ? B[y * W + x] : 0;
    const per = [];
    for (let t = -hs; t <= hs; t += 1) { per.push([t, -hs], [t, hs], [-hs, t], [hs, t]); }
    function borderScore(cx, cy) {
      let hit = 0;
      for (let i = 0; i < per.length; i++) {
        const dx = per[i][0], dy = per[i][1], x = cx + dx, y = cy + dy;
        if (dark(x, y) || dark(x + (dx === hs ? 1 : dx === -hs ? -1 : 0), y + (dy === hs ? 1 : dy === -hs ? -1 : 0))) hit++;
      }
      return hit / per.length;
    }
    const inset = Math.round(0.75 * S), ih = hs - inset;
    const cells = [], runs = [];
    let qSum = 0, qN = 0;
    // 1) pelurusan halus per kotak (bertahap: kotak A dicari ±5 px, B–D mulai dari geseran tetangga ±2 px)
    for (let q = 1; q <= LAYOUT.questions; q++) {
      const centers = boxCenter(q); let odx = 0, ody = 0;
      for (let j = 0; j < 4; j++) {
        const ex = Math.round(centers[j][0] * S), ey = Math.round(centers[j][1] * S), R = j === 0 ? 5 : 2;
        let best = { s: -1, x: ex + odx, y: ey + ody };
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const x = ex + odx + dx, y = ey + ody + dy;
          const sc = borderScore(x, y) - (Math.abs(x - ex) + Math.abs(y - ey)) * 0.004;
          if (sc > best.s) best = { s: sc, x, y };
        }
        if (j === 0 && best.s < 0.6) {                    // ragu → cari lebih luas
          for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
            const sc = borderScore(ex + dx, ey + dy) - (Math.abs(dx) + Math.abs(dy)) * 0.004;
            if (sc > best.s) best = { s: sc, x: ex + dx, y: ey + dy };
          }
        }
        odx = best.x - ex; ody = best.y - ey;
        qSum += best.s; qN++;
        let ink = 0, tot = 0;
        for (let y = best.y - ih; y <= best.y + ih; y++) {
          let run = 0;
          for (let x = best.x - ih; x <= best.x + ih; x++) {
            const d = dark(x, y); ink += d; tot++;
            if (d) run++; else { if (run >= 2 && run < 0.7 * ih) runs.push(run); run = 0; }
          }
        }
        cells.push({ q, j, x: best.x, y: best.y, ratio: ink / tot });
      }
    }
    // 2) tebal pena (median penampang lengan X ≈ t·√2) → ambang "dua garis menyatu"
    runs.sort((a, b) => a - b);
    const tPen = runs.length ? Math.max(2, runs[runs.length >> 1] / 1.41) : 3;
    const TU = (root.OMR && root.OMR.TUNE) || {};
    const thrDouble = (TU.a || 1.3) * tPen + (TU.b ?? 3);   // +2: toleransi ±1 px pada pencarian garis
    // 3) klasifikasi kotak & soal
    const answers = [], detail = [], boxes = [];
    for (let q = 1; q <= LAYOUT.questions; q++) {
      const states = [], ratios = [], faint = [];
      for (let j = 0; j < 4; j++) {
        const c = cells[(q - 1) * 4 + j], ratio = c.ratio;
        faint[j] = false;
        let st;
        if (ratio < T.empty) st = 'e';
        else {
          const h = horizLines(B, W, c.x, c.y, half, 0.15);
          const bands = h.bands.filter(b => b.t >= 2);            // pita setebal 1 px = kebetulan derau
          const th = bands.reduce((m, b) => Math.max(m, b.t), 0);
          const nLines = bands.length >= 2 ? 2 : bands.length === 1 ? (th >= thrDouble ? 2 : 1) : 0;
          if (nLines >= 2) st = 'c';                    // dicoret (2 garis, termasuk yang menyatu)
          else if (nLines === 1) st = 'u';              // satu garis → tidak jelas
          else if (ratio > T.filled) st = 'u';          // dihitamkan penuh
          else if (ratio >= T.mark) st = 'm';
          else { st = 'u'; faint[j] = true; }           // tipis/ragu
        }
        states.push(st); ratios.push(Math.round(ratio * 100) / 100);
        boxes.push({ q, j, x: c.x, y: c.y });
      }
      // tanda samar (bukan garis/arsir) di samping SATU tanda tegas yang ≥ 2,5× lebih pekat → anggap kosong
      const strong = states.map((st, j) => st === 'm' ? ratios[j] : 0), top = Math.max.apply(null, strong);
      if (top > 0 && states.filter(st => st === 'm').length === 1) {
        states.forEach((st, j) => { if (st === 'u' && faint[j] && ratios[j] * 2.5 <= top) states[j] = 'e'; });
      }
      const marks = []; states.forEach((s, j) => { if (s === 'm') marks.push(j); });
      let a;
      if (states.includes('u')) a = '*';
      else if (marks.length === 1) a = 'ABCD'[marks[0]];
      else if (marks.length === 0) a = '-';
      else a = '*';
      answers.push(a);
      detail.push({ q, states: states.join(''), ratios });
    }
    return { jawaban: answers.join(''), detail, boxes, quality: qSum / qN, half, pen: Math.round(tPen * 10) / 10, light: { P: lv.P, C: lv.C, noise: Math.round(lv.noise * 1000) / 1000 } };
  }

  /**
   * Proses satu frame penuh. img = ImageData-like (RGBA).
   * opts.pts: titik penanda dari deteksi langsung (koordinat img, dgn luas a) → lewati pencarian ulang.
   */
  function analyze(img, opts) {
    opts = opts || {};
    const gFull = toGray(img);
    const ds = downscale(gFull, 900), lvS = levels(ds.g);
    const minContrast = Math.max(10, Math.min(25, 0.3 * lvS.C));     // redup: kontras kertas–hitam lebih kecil
    const sets = [];
    if (opts.pts) sets.push(opts.pts);
    const tryFind = () => {
      const found = findMarkers(ds.g); if (!found) return;
      [found].concat(found.alts || []).forEach(q => sets.push(q.pts.map(p => ({ x: p.x * ds.f, y: p.y * ds.f, a: p.a * ds.f * ds.f }))));
    };
    if (!opts.pts) tryFind();
    if (!sets.length) return { ok: false, reason: 'markers' };
    let pts = null, ori = null;
    for (let i = 0; i < sets.length && !ori; i++) {
      const pts0 = sets[i], msPx = Math.max(6, Math.sqrt(pts0.reduce((s, p) => s + (p.a || 64), 0) / 4));
      const pp = pts0.map(p => refineMarker(gFull, p, msPx * 1.1));
      const o = solveOrientation(gFull, pp);
      if (o && o.contrast >= minContrast) { ori = o; pts = pp; }
      else if (i === sets.length - 1 && opts.pts && sets.length === 1) tryFind();   // titik live meleset → cari ulang
    }
    if (!ori) return { ok: false, reason: 'orientation' };
    const gw = warpGray(gFull, ori.H);
    const res = readWarped(gw, opts.sens);
    const warped = { width: gw.w, height: gw.h, gray: gw.d };
    if (res.dark) return { ok: false, reason: 'dark', light: res.light, warped };
    if (res.quality < 0.75) return { ok: false, reason: 'blur', quality: res.quality, warped };
    return Object.assign({ ok: true, warped, corners: pts }, res);
  }

  /** Kecerahan & ketajaman area kertas pada frame kecil (untuk memilih frame paling tajam & deteksi redup). */
  function frameStats(g, pts) {
    let x0 = g.w, y0 = g.h, x1 = 0, y1 = 0;
    pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    x0 = Math.max(1, x0 | 0); y0 = Math.max(1, y0 | 0); x1 = Math.min(g.w - 2, x1 | 0); y1 = Math.min(g.h - 2, y1 | 0);
    let sum = 0, grad = 0, n = 0; const d = g.d, W = g.w;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = y * W + x; sum += d[i]; grad += Math.abs(d[i + 1] - d[i - 1]) + Math.abs(d[i + W] - d[i - W]); n++;
    }
    return { lum: n ? sum / n : 0, sharp: n ? grad / n : 0 };
  }
  /**
   * Gabungkan hasil beberapa frame (frame 1 = utama). Per soal:
   * - frame 1 yakin & tidak dibantah frame lain → tetap;
   * - frame 1 ragu ('*') → pakai jawaban yang disepakati ≥ 2 frame;
   * - ada jawaban yakin yang saling bertentangan → '*' (perlu dicek).
   */
  function vote(results) {
    const main = results[0], n = main.jawaban.length, out = [];
    let fixed = 0;
    for (let i = 0; i < n; i++) {
      const a0 = main.jawaban[i], others = results.slice(1).map(r => r.jawaban[i]);
      const sure = [a0].concat(others).filter(a => a !== '*');
      if (a0 !== '*') { out.push(others.some(a => a !== '*' && a !== a0) ? '*' : a0); continue; }
      const cnt = {}; sure.forEach(a => cnt[a] = (cnt[a] || 0) + 1);
      const best = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0];
      if (best && cnt[best] >= 2 && Object.keys(cnt).length === 1) { out.push(best); fixed++; } else out.push('*');
    }
    return { jawaban: out.join(''), fixed };
  }

  /* ---------------- Penilaian (sama dengan server) ---------------- */
  function score(jawaban, kunci, mode, bobot) {
    const n = kunci.length; let benar = 0, salah = 0, kosong = 0, ragu = 0, skor = 0, total = 0;
    const w = (mode === 'Manual' && bobot && bobot.length) ? bobot.map(Number) : null;
    for (let i = 0; i < n; i++) {
      const a = jawaban.charAt(i) || '-', k = kunci.charAt(i), bw = w ? (w[i] || 0) : 100 / n;
      total += bw;
      if (a === k) { benar++; skor += bw; }
      else if (a === '-') kosong++;
      else if (a === '*') { ragu++; kosong++; }
      else salah++;
    }
    const nilai = total ? Math.round(skor / total * 10000) / 100 : 0;
    return { benar, salah, kosong, ragu, skor: Math.round(skor * 100) / 100, nilai };
  }

  root.OMR = { frameStats, vote, _dbg: g => { const lv = levels(g); let gs = g; if (lv.noise > 0.035) gs = blur3(gs); if (lv.noise > 0.09) gs = blur3(gs); return { lv, B: binarize(gs, Math.round(4 * S), 0.86, Math.max(5, Math.min(14, 0.16 * lv.C))) }; }, LAYOUT, S, OUT_W, OUT_H, SENS, boxCenter, toGray, downscale, findMarkers, homography, apply, warp, warpGray, grayToRGBA, readWarped, horizLines, analyze, score, refineMarker, solveOrientation };
  if (typeof module !== 'undefined') module.exports = root.OMR;
})(typeof window !== 'undefined' ? window : globalThis);
