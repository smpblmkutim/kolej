/* Worker pemindai — menjalankan OMR di luar thread tampilan agar kamera tetap mulus
   v1.2: memakai titik penanda dari deteksi langsung (lewati pencarian ulang) & hasil pelurusan abu-abu */
importScripts('omr.js?v=1.2.0');
self.onmessage = function (e) {
  const m = e.data;
  try {
    if (m.type === 'detect') {
      const img = { width: m.w, height: m.h, data: new Uint8ClampedArray(m.buf) };
      const g = OMR.toGray(img);
      const r = OMR.findMarkers(g);
      self.postMessage({ id: m.id, pts: r ? r.pts : null });
    } else if (m.type === 'analyze') {
      const img = { width: m.w, height: m.h, data: new Uint8ClampedArray(m.buf) };
      const r = OMR.analyze(img, { sens: m.sens, pts: m.pts || null });
      const out = { id: m.id, ok: r.ok, reason: r.reason, quality: r.quality };
      const transfer = [];
      if (r.warped) { out.warped = { w: r.warped.width, h: r.warped.height, buf: r.warped.gray.buffer }; transfer.push(r.warped.gray.buffer); }   // abu-abu: 4x lebih kecil
      if (r.ok) { out.jawaban = r.jawaban; out.detail = r.detail; out.boxes = r.boxes; out.half = r.half; }
      self.postMessage(out, transfer);
    }
  } catch (err) { self.postMessage({ id: m.id, ok: false, reason: 'error', message: String(err && err.message || err) }); }
};
