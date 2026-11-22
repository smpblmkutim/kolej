/* ==========================================================================
   Kolej — Kamera & pemindaian langsung
   - Deteksi 4 penanda tiap ±100 ms di Worker (frame kecil 480 px)
   - Setelah kertas diam ±1 detik → ambil 1 frame tajam resolusi penuh → baca
   - Beep (Web Audio) + getar; senter bila didukung
   ========================================================================== */
'use strict';
const Beep = {
  ctx: null,
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.01);
    } catch (e) { }
  },
  tone(freq, start, dur, type = 'sine', vol = 0.35) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(c.destination);
    const t = c.currentTime + start;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  },
  play(kind) {
    if (Store.get('sound', true) && this.ctx) {
      try {
        if (kind === 'ok') { this.tone(1318, 0, 0.11); this.tone(1760, 0.12, 0.16); }
        else if (kind === 'warn') { this.tone(880, 0, 0.14, 'triangle'); this.tone(660, 0.16, 0.22, 'triangle'); }
        else { this.tone(196, 0, 0.32, 'square', 0.18); }
      } catch (e) { }
    }
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : kind === 'warn' ? [60, 60, 60] : [200, 80, 200]);
  }
};

const Scanner = {
  stream: null, track: null, video: null, ov: null, worker: null, running: false, paused: false,
  small: document.createElement('canvas'), full: document.createElement('canvas'),
  hist: [], seq: 0, cbs: {}, waiting: {}, torchOn: false, lastErrAt: 0, needClear: false, clearN: 0, lumAvg: null, darkSince: 0, autoTorchTried: false,
  HOLD_MS: 500,                                       // kertas diam ±0,5 detik → ambil gambar

  initWorker() {
    if (this.worker !== null) return;
    try {
      this.worker = new Worker('js/scan-worker.js?v=' + window.KOLEJ_CONFIG.APP_VERSION);
      this.worker.onmessage = e => { const w = this.waiting[e.data.id]; if (w) { delete this.waiting[e.data.id]; w(e.data); } };
      this.worker.onerror = () => { this.worker = false; };
    } catch (e) { this.worker = false; }
  },
  call(msg, transfer) {
    const id = ++this.seq; msg.id = id;
    if (!this.worker) {                                     // cadangan: jalan di thread utama
      const img = { width: msg.w, height: msg.h, data: new Uint8ClampedArray(msg.buf) };
      if (msg.type === 'detect') { const g = OMR.toGray(img), r = OMR.findMarkers(g), st = r ? OMR.frameStats(g, r.pts) : { lum: 128, sharp: 0 }; return Promise.resolve({ pts: r ? r.pts : null, lum: st.lum, sharp: st.sharp }); }
      const r = OMR.analyze(img, { sens: msg.sens, pts: msg.pts || null });
      if (r.warped && !r.ok) r.warped.gray = r.warped.gray || new Uint8ClampedArray(1);
      return Promise.resolve(Object.assign({}, r, r.warped ? { warped: { w: r.warped.width, h: r.warped.height, buf: r.warped.gray.buffer } } : {}));
    }
    return new Promise(res => { this.waiting[id] = res; this.worker.postMessage(msg, transfer); });
  },

  async start(video, overlay, cbs) {
    this.video = video; this.ov = overlay; this.cbs = cbs; this.initWorker();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Browser ini tidak mendukung kamera. Gunakan Chrome (Android) atau Safari (iPhone) terbaru.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      if (e.name === 'NotAllowedError') throw new Error('Izin kamera ditolak. Buka pengaturan situs di browser lalu izinkan Kamera.');
      if (e.name === 'NotFoundError') throw new Error('Kamera tidak ditemukan di perangkat ini.');
      throw new Error('Kamera tidak dapat dibuka: ' + e.message);
    }
    this.track = this.stream.getVideoTracks()[0];
    try { const cap = this.track.getCapabilities ? this.track.getCapabilities() : {}; if (cap.focusMode && cap.focusMode.includes('continuous')) await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { }
    video.srcObject = this.stream; video.setAttribute('playsinline', ''); video.muted = true;
    await video.play().catch(() => { });
    await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
    this.running = true; this.paused = false; this.hist = [];
    this.loop();
  },
  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null; this.torchOn = false;
  },
  hasTorch() { try { return !!(this.track && this.track.getCapabilities && this.track.getCapabilities().torch); } catch (e) { return false; } },
  async torch(on) { if (!this.hasTorch()) return false; try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); this.torchOn = on; return true; } catch (e) { return false; } },
  pause(ms) { this.paused = true; this.hist = []; this.draw(null, 0); if (ms) setTimeout(() => this.resume(), ms); },
  /** swap=true: tunggu lembar lama keluar dari kamera dulu (cegah lembar sama terbaca untuk siswa berikutnya). */
  resume(swap) { this.paused = false; this.hist = []; this.needClear = !!swap; this.clearN = 0; },

  async loop() {
    while (this.running) {
      const t0 = performance.now();
      if (!this.paused && this.video.readyState >= 2) {
        const vw = this.video.videoWidth, vh = this.video.videoHeight, W = 480, H = Math.round(W * vh / vw);
        this.small.width = W; this.small.height = H;
        const cx = this.small.getContext('2d', { willReadFrequently: true });
        cx.drawImage(this.video, 0, 0, W, H);
        const img = cx.getImageData(0, 0, W, H);
        const r = await this.call({ type: 'detect', w: W, h: H, buf: img.data.buffer }, [img.data.buffer]);
        if (!this.running) break;
        if (this.paused) continue;
        const f = vw / W, pts = r.pts ? r.pts.map(p => ({ x: p.x * f, y: p.y * f, a: p.a * f * f })) : null;
        const now = performance.now();
        if (this.needClear) {                                 // menunggu kertas diganti
          if (!pts) { if (++this.clearN >= 2) this.needClear = false; } else this.clearN = 0;
          this.draw(pts, 0); this.cbs.onState && this.cbs.onState('swap', 0);
          const dt0 = performance.now() - t0; await sleep(Math.max(16, 90 - dt0)); continue;
        }
        this.hist.push({ t: now, pts, sharp: r.sharp || 0 }); this.hist = this.hist.filter(h => now - h.t < 2200);
        this.watchLight(r.lum, now);
        const prog = this.stability(vw);
        this.draw(pts, prog);
        this.cbs.onState && this.cbs.onState(pts ? (prog >= 1 ? 'capture' : 'hold') : 'search', prog);
        if (prog >= 1) await this.capture();
      }
      const dt = performance.now() - t0; await sleep(Math.max(12, 55 - dt));   // ±18 deteksi/detik
    }
  },
  stability(vw) {
    const h = this.hist; if (!h.length || !h[h.length - 1].pts) return 0;
    let i = h.length - 1; const last = h[i].pts, tol = vw * 0.018;
    while (i > 0 && h[i - 1].pts && h[i - 1].pts.every((p, k) => Math.hypot(p.x - last[k].x, p.y - last[k].y) < tol)) i--;
    const held = h[h.length - 1].t - h[i].t, prog = Math.min(1, held / this.HOLD_MS);
    if (prog < 1) return prog;
    // sudah stabil: tunggu frame yang setajam frame terbaik (fokus selesai), maksimal +0,7 dtk
    const maxSharp = Math.max.apply(null, h.slice(i).map(x => x.sharp || 0)), cur = h[h.length - 1].sharp || 0;
    return cur >= maxSharp * 0.9 || held > this.HOLD_MS + 700 ? 1 : 0.99;
  },
  /** Cahaya redup: beri tahu & nyalakan senter otomatis (sekali per sesi) bila tersedia. */
  watchLight(lum, now) {
    if (lum == null) return;
    this.lumAvg = this.lumAvg == null ? lum : this.lumAvg * 0.8 + lum * 0.2;
    if (this.lumAvg < 55) {
      if (!this.darkSince) this.darkSince = now;
      if (now - this.darkSince > 1200 && !this.torchOn && !this.autoTorchTried && this.hasTorch()) {
        this.autoTorchTried = true;
        this.torch(true).then(ok => { if (ok) { this.cbs.onTorch && this.cbs.onTorch(true); this.cbs.onInfo && this.cbs.onInfo('Cahaya redup — senter dinyalakan otomatis'); } });
      } else if (now - this.darkSince > 1200 && !this.torchOn) this.cbs.onDark && this.cbs.onDark(true);
    } else { this.darkSince = 0; this.cbs.onDark && this.cbs.onDark(false); }
  },
  draw(pts, prog) {
    const c = this.ov, dpr = window.devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== cw * dpr) { c.width = cw * dpr; c.height = ch * dpr; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!pts || !this.video) return;
    const vw = this.video.videoWidth, vh = this.video.videoHeight, s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    const P = pts.map(p => [p.x * s + ox, p.y * s + oy]);
    const col = getComputedStyle(document.documentElement).getPropertyValue('--accent-brand').trim() || '#14B8A6';
    g.lineWidth = 3; g.strokeStyle = col; g.fillStyle = col + '22'; g.shadowColor = col; g.shadowBlur = 14;
    g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke();
    g.shadowBlur = 0;
    P.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 11, 0, 7); g.fillStyle = 'rgba(11,18,32,.7)'; g.fill(); g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fillStyle = col; g.fill(); });
    if (prog > 0 && prog < 1) {
      const c0 = P.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      g.beginPath(); g.arc(c0[0], c0[1], 28, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    }
  },
  grab(pts0) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight, k = Math.min(1, 1600 / Math.max(vw, vh));
    const pts = pts0 ? pts0.map(p => ({ x: p.x * k, y: p.y * k, a: p.a * k * k })) : null;
    const W = Math.round(vw * k), H = Math.round(vh * k);
    this.full.width = W; this.full.height = H;
    const cx = this.full.getContext('2d', { willReadFrequently: true });
    cx.drawImage(this.video, 0, 0, W, H);
    const img = cx.getImageData(0, 0, W, H);
    return this.call({ type: 'analyze', w: W, h: H, buf: img.data.buffer, pts, sens: (AppState.boot && AppState.boot.settings.sensitivitas) || 'sedang' }, [img.data.buffer]);
  },
  async capture() {
    this.paused = true;
    this.cbs.onBusy && this.cbs.onBusy(true);
    const last = this.hist.length && this.hist[this.hist.length - 1].pts;
    const t0 = performance.now();
    let r = await this.grab(last);
    // ada jawaban ragu / gambar kurang mantap → baca 2 frame lagi & ambil suara terbanyak
    if (r.ok && (r.jawaban.indexOf('*') > -1 || r.quality < 0.88)) {
      this.cbs.onBusy && this.cbs.onBusy(true, 'Memastikan jawaban…');
      const more = [];
      for (let i = 0; i < 2 && this.running; i++) {
        await new Promise(res => requestAnimationFrame(() => setTimeout(res, 40)));
        const r2 = await this.grab(last);
        if (r2.ok) more.push(r2);
      }
      if (more.length) {
        const v = OMR.vote([r].concat(more));
        r.jawaban = v.jawaban; r.frames = 1 + more.length; r.fixed = v.fixed;
        r.detail = r.detail.map((d, i) => v.jawaban[i] === '*' ? d : Object.assign({}, d, { states: d.states }));
      }
    }
    r.ms = Math.round(performance.now() - t0);
    if (r.warped && r.warped.buf && r.warped.buf.byteLength > 1) { const rgba = OMR.grayToRGBA({ w: r.warped.w, h: r.warped.h, d: new Uint8ClampedArray(r.warped.buf) }); r.warpedImg = new ImageData(rgba.data, rgba.width, rgba.height); }
    this.cbs.onBusy && this.cbs.onBusy(false);
    if (!this.running) return;
    if (r.ok) { this.cbs.onResult(r); }
    else {
      const msg = r.reason === 'dark' ? (this.hasTorch() ? 'Terlalu gelap. Ketuk ikon senter atau pindah ke tempat lebih terang.' : 'Terlalu gelap. Pindah ke tempat lebih terang / dekat jendela.')
        : r.reason === 'blur' ? 'Gambar kurang tajam. Tahan HP lebih stabil & pastikan terang.'
          : r.reason === 'orientation' ? 'Penanda tidak lengkap. Pastikan 4 kotak hitam terlihat.'
            : r.reason === 'markers' ? 'Penanda sudut tidak terbaca. Dekatkan & luruskan kertas.' : 'Gagal membaca: ' + (r.message || r.reason);
      if (performance.now() - this.lastErrAt > 2500) Beep.play('err');
      this.lastErrAt = performance.now();
      this.cbs.onError && this.cbs.onError(msg);
      this.pause(700);
    }
  }
};

/* ---------- Gambar hasil: tanda hijau/merah di atas lembar yang diluruskan ---------- */
function drawMarkedSheet(canvas, warpedImg, res, kunci) {
  canvas.width = warpedImg.width; canvas.height = warpedImg.height;
  const g = canvas.getContext('2d'); g.putImageData(warpedImg, 0, 0);
  const n = kunci.length, half = res.half || 13.75, byQ = {};
  (res.boxes || []).forEach(b => { (byQ[b.q] = byQ[b.q] || [])[b.j] = b; });
  g.lineWidth = 4;
  for (let q = 1; q <= n; q++) {
    const a = res.jawaban[q - 1], k = 'ABCD'.indexOf(kunci[q - 1]), bx = byQ[q]; if (!bx) continue;
    const ring = (b, col, dash) => { g.setLineDash(dash ? [6, 5] : []); g.strokeStyle = col; g.beginPath(); g.arc(b.x, b.y, half + 5, 0, 7); g.stroke(); };
    if (a === '*') { g.setLineDash([]); g.strokeStyle = '#F59E0B'; g.strokeRect(bx[0].x - half - 7, bx[0].y - half - 7, bx[3].x - bx[0].x + 2 * half + 14, 2 * half + 14); }
    else if ('ABCD'.indexOf(a) === k) ring(bx[k], '#16A34A');
    else {
      if (a !== '-') ring(bx['ABCD'.indexOf(a)], '#DC2626');
      ring(bx[k], '#16A34A', true);
    }
  }
  g.setLineDash([]);
}
/** Potong satu baris soal (4 kotak) dari lembar lurus untuk layar tinjau. */
function cropQuestion(warpedImg, res, q) {
  const bx = (res.boxes || []).filter(b => b.q === q).sort((a, b) => a.j - b.j); if (bx.length < 4) return '';
  const half = res.half || 13.75, pad = 14, x0 = Math.max(0, bx[0].x - half - pad - 40), y0 = Math.max(0, bx[0].y - half - pad), w = bx[3].x - bx[0].x + 2 * half + 2 * pad + 40, h = 2 * half + 2 * pad;
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const tmp = document.createElement('canvas'); tmp.width = warpedImg.width; tmp.height = warpedImg.height; tmp.getContext('2d').putImageData(warpedImg, 0, 0);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(tmp, x0, y0, w, h, 0, 0, w * 2, h * 2);
  return c.toDataURL('image/jpeg', 0.85);
}
function compressSheet(warpedImg, maxW = 900, q = 0.62) {
  const tmp = document.createElement('canvas'); tmp.width = warpedImg.width; tmp.height = warpedImg.height; tmp.getContext('2d').putImageData(warpedImg, 0, 0);
  const k = Math.min(1, maxW / warpedImg.width), c = document.createElement('canvas'); c.width = Math.round(warpedImg.width * k); c.height = Math.round(warpedImg.height * k);
  const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(tmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
