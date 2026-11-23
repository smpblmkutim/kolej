/* ==========================================================================
   Kolej — Inti aplikasi: API (fetch ke GAS), cache perangkat (SWR), antrean
   offline (IndexedDB), tema, router hash, toast/dialog, tombol loading.
   Pola: gas-instant-ux-pro (timeout, retry, reqId idempoten, Perf, SWR).
   ========================================================================== */
'use strict';
const GAS_URL = window.KOLEJ_CONFIG.GAS_URL;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fmt = {
  num: (v, d = 1) => (Math.round((Number(v) || 0) * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('id-ID', { maximumFractionDigits: d }),
  time: iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); },
  dt: iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); },
  initials: n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()
};

/* ---------------- Status global ---------------- */
const AppState = {
  token: '', exp: 0, me: null, boot: null, pub: null, ctx: null,
  maps: {}, online: navigator.onLine !== false
};

/* ---------------- Pengukur performa (Perf.table() di console) ---------------- */
const Perf = {
  rows: [],
  add(action, total, server, cached) { this.rows.push({ action, total, server: server ?? null, net: server != null ? total - server : null, cache: cached ? '✓' : '' }); if (this.rows.length > 200) this.rows.shift(); },
  table() { console.table(this.rows.slice(-30)); },
  summary() { const g = {}; this.rows.forEach(r => { (g[r.action] = g[r.action] || []).push(r.total); }); console.table(Object.keys(g).map(a => ({ action: a, n: g[a].length, rata: Math.round(g[a].reduce((s, x) => s + x, 0) / g[a].length) }))); }
};
window.Perf = Perf;

/* ---------------- Penyimpanan perangkat (localStorage, per user, berversi) ---------------- */
const LS_PREFIX = 'kolej:v1:';
const Store = {
  get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(LS_PREFIX + k, s); }
    catch (e) {
      Object.keys(localStorage).filter(x => x.indexOf(LS_PREFIX + 'u:') === 0 && x.indexOf(LS_PREFIX + userKey('')) !== 0).forEach(x => localStorage.removeItem(x));
      try { localStorage.setItem(LS_PREFIX + k, s); } catch (e2) { }
    }
  },
  del(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) { } }
};
function userKey(k) { return 'u:' + ((AppState.me && AppState.me.id) || 'anon') + ':' + k; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; }

/* ---------------- API ---------------- */
const READ_ACTIONS = /^(boot|batch|hasilList|logList|publicBoot|ping|exportPdf)$/;
async function apiOnce(action, data, timeout, reqId) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },          // tanpa CORS preflight
      body: JSON.stringify({ action, token: AppState.token || '', reqId, data: data || {} })
    });
    const text = await res.text();
    try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms, j.cached); return j; }
    catch (e) { return { success: false, network: true, retryable: res.status >= 500 || res.status === 429 || res.status === 200, message: 'Server membalas tidak terduga (HTTP ' + res.status + '). Periksa URL GAS di config.js.' }; }
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus. Periksa internet Anda.' };
  } finally { clearTimeout(timer); }
}
const _inflight = {}; let _writeEpoch = 0;
async function api(action, data, opt = {}) {
  const isRead = READ_ACTIONS.test(action);
  if (isRead) {                                          // permintaan baca identik menumpang
    const k = _writeEpoch + '|' + action + '|' + JSON.stringify(data || {});
    if (_inflight[k]) return _inflight[k];
    const p = apiRun(action, data, opt, true); _inflight[k] = p;
    p.finally(() => delete _inflight[k]);
    return p;
  }
  _writeEpoch++;
  return apiRun(action, data, opt, false);
}
async function apiRun(action, data, opt, isRead) {
  const reqId = isRead ? '' : (opt.reqId || uuid());
  const tries = opt.tries || (isRead ? 3 : 2);
  let res;
  for (let i = 0; i < tries; i++) {
    if (i) { await sleep(1000 * i); if (navigator.onLine === false) await waitOnline(12000); }
    res = await apiOnce(action, data, isRead ? (i ? 40000 : 25000) : (opt.timeout || 60000), reqId);
    if (res.success || !res.retryable) break;
  }
  if (!res.success && res.data && res.data.code === 'AUTH' && !opt.noAuthPrompt) onSessionExpired();
  return res;
}
function waitOnline(ms) { return new Promise(r => { if (navigator.onLine !== false) return r(); const t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); }); }
function warmUpServer(scope) {
  const k = 'warm_' + scope, last = Number(sessionStorage.getItem(k) || 0);
  if (Date.now() - last < 240000) return;
  sessionStorage.setItem(k, Date.now());
  fetch(GAS_URL + '?w=' + scope + '&t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => { });
}

/** SWR: tampilkan cache seketika, segarkan di latar. render(data, fromCache) hanya saat berubah. */
async function swr(key, action, payload, render, opt = {}) {
  const fresh = opt.fresh ?? 60000;
  const c = Store.get(userKey(key), null);
  if (c) render(c.data, true);
  if (c && !opt.force && Date.now() - c.t < fresh) return { success: true, data: c.data, cached: true };
  const res = await api(action, payload);
  if (res.success) {
    const h = hashStr(JSON.stringify(res.data));
    Store.set(userKey(key), { t: Date.now(), h, data: res.data });
    if (!c || c.h !== h) render(res.data, false);
  } else if (!c && opt.onError) opt.onError(res);
  return res;
}

/* ---------------- Antrean offline (IndexedDB) — hasil scan & foto ---------------- */
const Outbox = {
  db: null, busy: false, listeners: [],
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('kolej', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('outbox', { keyPath: 'id' });
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('outbox', mode), s = t.objectStore('outbox'); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); },
  async add(action, data, id) { await this.tx('readwrite', s => s.put({ id: id || uuid(), action, data, t: Date.now(), user: AppState.me && AppState.me.id, err: '' })); this.emit(); this.flush(); },
  async all() { const db = await this.open(); return new Promise(res => { const r = db.transaction('outbox').objectStore('outbox').getAll(); r.onsuccess = () => res((r.result || []).sort((a, b) => a.t - b.t)); r.onerror = () => res([]); }); },
  async del(id) { await this.tx('readwrite', s => s.delete(id)); this.emit(); },
  async put(item) { await this.tx('readwrite', s => s.put(item)); },
  on(fn) { this.listeners.push(fn); },
  async emit() { const items = await this.all(); this.listeners.forEach(f => f(items)); },
  async flush() {
    if (this.busy || !AppState.token || navigator.onLine === false) return;
    this.busy = true;
    try {
      let items = (await this.all()).filter(x => !x.err && (!x.user || !AppState.me || x.user === AppState.me.id));
      for (const it of items) {
        const res = await api(it.action, it.data, { reqId: it.id, tries: 2, timeout: 90000 });
        if (res.success) { await this.del(it.id); if (it.onDone) it.onDone(res); Outbox.done(it, res); continue; }
        if (res.network) break;                              // coba lagi nanti
        if (res.data && res.data.code === 'AUTH') break;      // tunggu login ulang
        it.err = res.message || 'Gagal'; await this.put(it); this.emit();
        toast('Gagal mengirim: ' + it.err, 'bad');
      }
    } finally { this.busy = false; this.emit(); }
  },
  done(it, res) { document.dispatchEvent(new CustomEvent('outbox:done', { detail: { item: it, res } })); }
};
addEventListener('online', () => { AppState.online = true; Outbox.flush(); renderNet(); });
addEventListener('offline', () => { AppState.online = false; renderNet(); });
setInterval(() => Outbox.flush(), 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Outbox.flush(); });

/* ---------------- Tema ---------------- */
function applyBrand(primary, accent) {
  const r = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(primary || '')) r.setProperty('--brand', primary);
  if (/^#[0-9a-f]{6}$/i.test(accent || '')) r.setProperty('--accent-brand', accent);
  const m = $('meta[name=theme-color]'); if (m && primary) m.content = primary;
}
function themeMode() { return Store.get('mode', null) || ({ Gelap: 'gelap', Sistem: 'sistem' }[(AppState.pub && AppState.pub.tema) || ''] || 'terang'); }
function applyMode(mode) {
  const dark = mode === 'gelap' || (mode === 'sistem' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyMode(themeMode()));
function setMode(mode) { Store.set('mode', mode); applyMode(mode); }
function contrast(hex1, hex2) {
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const a = lum(hex1), b = lum(hex2); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------------- Tombol BACK HP untuk lapisan (detail, hasil scan, kamera, dialog) ----------------
   Setiap lapisan yang dibuka menambah satu entri riwayat. Tombol back HP → menutup lapisan teratas.
   Bila lapisan ditutup lewat tombol di layar, entri riwayatnya ikut dibuang (history.back yang "diabaikan"). */
const Overlays = {
  stack: [], seq: 0, skip: 0, waiters: [],
  open(onBack) {
    const id = ++this.seq; this.stack.push({ id, onBack });
    this.idle().then(() => { if (this.stack.some(x => x.id === id)) history.pushState({ kolejOv: id }, ''); });
    return id;
  },
  close(id) {
    const i = this.stack.findIndex(x => x.id === id); if (i < 0) return;
    this.stack.splice(i, 1); this.skip++; history.back();
  },
  idle() { return this.skip ? new Promise(r => this.waiters.push(r)) : Promise.resolve(); }
};
addEventListener('popstate', () => {
  if (Overlays.skip) {
    Overlays.skip--;
    if (!Overlays.skip) { const w = Overlays.waiters; Overlays.waiters = []; w.forEach(f => f()); }
    return;
  }
  const top = Overlays.stack.pop();
  if (top) top.onBack();
});
/** Daftarkan lapisan; kembalikan fungsi "tutup dari layar" (membersihkan entri riwayat). */
function overlay(onBack) { const id = Overlays.open(onBack); return () => Overlays.close(id); }
/** Pindah halaman setelah semua lapisan selesai ditutup (hindari bentrok dengan history.back). */
function nav(hash) { Overlays.idle().then(() => { if (location.hash === hash) { if (typeof route === 'function') route(); } else location.hash = hash; }); }

/* ---------------- Toast, dialog, sheet ---------------- */
function toast(msg, type = 'ok', ms = 2800) {
  let host = $('.toast-host'); if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
  while (host.children.length >= 2) host.firstChild.remove();
  const el = document.createElement('div'); el.className = 'toast ' + type;
  el.innerHTML = ic(type === 'ok' ? 'circle-check' : type === 'warn' ? 'triangle-alert' : type === 'info' ? 'info' : 'circle-x') + '<div>' + esc(msg) + '</div>';
  host.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}
function openLayer(html, opt = {}) {
  const lay = document.createElement('div');
  lay.className = 'layer' + (opt.center ? ' center' : '');
  lay.innerHTML = '<div class="sheet ' + (opt.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.appendChild(lay);
  let ovId = 0;
  const close = (v, fromBack) => { if (!lay.isConnected) return; lay.remove(); if (ovId && !fromBack) Overlays.close(ovId); opt.onClose && opt.onClose(v); };
  if (!opt.sticky) { ovId = Overlays.open(() => close(undefined, true)); lay.addEventListener('click', e => { if (e.target === lay) close(); }); }
  $$('[data-close]', lay).forEach(b => b.addEventListener('click', () => close()));
  return { el: $('.sheet', lay), close, lay };
}
function confirmDlg(o) {
  return new Promise(res => {
    const L = openLayer(
      (o.icon !== false ? '<div class="dlg-icon" style="' + (o.danger ? 'background:var(--bad-soft);color:var(--bad-ink)' : o.tone === 'info' ? 'background:var(--primary-soft);color:var(--primary)' : '') + '">' + ic(o.icon || 'triangle-alert') + '</div>' : '') +
      '<h2 style="text-align:center;margin-bottom:8px">' + esc(o.title) + '</h2>' +
      '<div class="muted" style="text-align:center;font-size:15px;margin-bottom:18px">' + (o.html || esc(o.text || '')) + '</div>' +
      '<div class="stack"><button class="btn btn-block ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(o.ok || 'Ya') + (o.okIcon ? ' ' + ic(o.okIcon) : '') + '</button>' +
      (o.cancel === false ? '' : '<button class="btn btn-block btn-soft" data-no>' + esc(o.cancel || 'Batal') + '</button>') + '</div>' + (o.foot || ''),
      { center: true, onClose: v => res(v === true) });
    $('[data-ok]', L.el).onclick = () => L.close(true);
    const no = $('[data-no]', L.el); if (no) no.onclick = () => L.close(false);
  });
}
/** Tombol dengan animasi loading selama proses berjalan. */
async function withBtn(btn, fn) {
  if (!btn || btn.classList.contains('is-loading')) return;
  const w = btn.offsetWidth; btn.style.minWidth = w + 'px';
  btn.classList.add('is-loading'); btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove('is-loading'); btn.disabled = false; btn.style.minWidth = ''; }
}
function zoomImage(src) { const L = openLayer('<img class="zoom-img" src="' + src + '" alt="Lembar jawaban"><button class="btn btn-soft btn-block" style="margin-top:12px" data-close>Tutup</button>', { center: true }); return L; }

/* ---------------- Berkas: unduh ---------------- */
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function b64ToBlob(b64, type) { const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type }); }
let _xlsxP = null;
function loadXLSX() {                                    // SheetJS dimuat hanya saat dibutuhkan
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return _xlsxP || (_xlsxP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => { _xlsxP = null; rej(new Error('Gagal memuat pustaka Excel. Periksa internet.')); };
    document.head.appendChild(s);
  }));
}

let _pdfP = null;
function loadJsPDF() {                                   // jsPDF dimuat hanya saat membuat template
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return _pdfP || (_pdfP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { _pdfP = null; rej(new Error('Gagal memuat pembuat PDF. Periksa internet, atau pakai Unduhan Cepat di bawah.')); };
    document.head.appendChild(s);
  }));
}

/* ---------------- Indikator jaringan & antrean ---------------- */
let _pending = 0;
Outbox.on(items => { _pending = items.length; renderNet(); });
function renderNet() {
  let el = $('#netbar');
  if (!el) { el = document.createElement('div'); el.id = 'netbar'; el.className = 'netbar'; document.body.appendChild(el); }
  if (!AppState.token) { el.innerHTML = ''; return; }
  if (navigator.onLine === false) el.innerHTML = '<span class="chip warn">' + ic('wifi-off') + ' Offline' + (_pending ? ' · ' + _pending + ' menunggu' : '') + '</span>';
  else if (_pending) el.innerHTML = '<span class="chip p">' + ic('cloud-upload') + ' Mengirim ' + _pending + ' data…</span>';
  else el.innerHTML = '';
}
