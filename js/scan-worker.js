/* Worker pemindai — menjalankan OMR di luar thread tampilan agar kamera tetap mulus */
importScripts('omr.js?v=1.0.1');
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
      const r = OMR.analyze(img, { sens: m.sens });
      const out = { id: m.id, ok: r.ok, reason: r.reason, quality: r.quality };
      const transfer = [];
      if (r.warped) { out.warped = { w: r.warped.width, h: r.warped.height, buf: r.warped.data.buffer }; transfer.push(r.warped.data.buffer); }
      if (r.ok) { out.jawaban = r.jawaban; out.detail = r.detail; out.boxes = r.boxes; out.half = r.half; }
      self.postMessage(out, transfer);
    }
  } catch (err) { self.postMessage({ id: m.id, ok: false, reason: 'error', message: String(err && err.message || err) }); }
};
