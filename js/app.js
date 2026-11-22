/* ==========================================================================
   Kolej — Aplikasi (login, kerangka, router, halaman guru: Pilih, Kunci, Scan,
   Hasil/Dashboard, Akun). Halaman khusus admin ada di admin.js.
   ========================================================================== */
'use strict';
const app = document.getElementById('app');

/* ---------------- Data turunan dari boot ---------------- */
function ujianAktif() { return (AppState.boot && AppState.boot.settings.ujian_aktif) || (AppState.pub && AppState.pub.ujian) || ''; }
function isAdmin() { return AppState.me && AppState.me.peran === 'Admin'; }
function buildMaps() {
  const b = AppState.boot, m = { mapel: new Map(), kelas: new Map(), siswa: new Map(), siswaByKelas: {}, hasil: {} };
  if (!b) return;
  b.mapel.forEach(x => m.mapel.set(x[0], { id: x[0], nama: x[1], status: x[2] || 'Aktif', kkm: x[3] === undefined || x[3] === null ? '' : String(x[3]) }));
  b.kelas.forEach(x => m.kelas.set(x[0], { id: x[0], nama: x[1], tingkat: x[2], status: x[3] || 'Aktif' }));
  b.siswa.forEach(x => {
    const o = { nisn: x[0], nama: x[1], kelas: x[2], status: x[3] || 'Aktif' };
    m.siswa.set(o.nisn, o);
    if (o.status === 'Aktif') (m.siswaByKelas[o.kelas] = m.siswaByKelas[o.kelas] || []).push(o);
  });
  Object.values(m.siswaByKelas).forEach(a => a.sort((p, q) => p.nama.localeCompare(q.nama)));
  b.hasilIdx.forEach(([id, s, n, nilai, st]) => { (m.hasil[s] = m.hasil[s] || {})[n] = { id, nilai, status: st }; });
  m.ajar = new Set((b.ajar || []).map(a => a[0] + '|' + a[1]));            // penugasan guru (dari admin)
  m.pengajar = {}; (b.pengajar || []).forEach(([g, mp, k]) => { (m.pengajar[g] = m.pengajar[g] || []).push([mp, k]); });
  (AppState.pending || []).forEach(it => {                // hasil yang masih di antrean tetap tampil
    if (it.action !== 'hasilSave' || !it.data.local) return;
    (m.hasil[it.data.idSesi] = m.hasil[it.data.idSesi] || {})[it.data.nisn] = { id: it.data.idScan, nilai: it.data.local.nilai, status: it.data.status || it.data.local.status, pending: true };
  });
  AppState.maps = m;
}
const mapelNama = id => (AppState.maps.mapel.get(id) || {}).nama || id;
/** KKM mapel; bila belum diatur → KKM bawaan dari Pengaturan. */
function kkmDefault() { return Number(AppState.boot.settings.kkm) || 75; }
function kkmOf(mapel) { const m = AppState.maps.mapel.get(mapel); return m && m.kkm !== '' && !isNaN(Number(m.kkm)) ? Number(m.kkm) : kkmDefault(); }
const kelasNama = id => (AppState.maps.kelas.get(id) || {}).nama || id;
function activeMapel() { return [...AppState.maps.mapel.values()].filter(x => x.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama)); }
function activeKelas() { return [...AppState.maps.kelas.values()].filter(x => x.status === 'Aktif').sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true })); }
/** Mapel & kelas yang boleh dipakai: admin = semua; guru = sesuai penugasan admin. */
function canTeach(mapel, kelas) { return isAdmin() || AppState.maps.ajar.has(mapel + '|' + kelas); }
function myMapel() { return isAdmin() ? activeMapel() : activeMapel().filter(m => [...AppState.maps.ajar].some(k => k.split('|')[0] === m.id)); }
function myKelas(mapel) { return isAdmin() ? activeKelas() : activeKelas().filter(k => mapel ? canTeach(mapel, k.id) : [...AppState.maps.ajar].some(x => x.split('|')[1] === k.id)); }
const NO_AJAR = `<div class="card empty">${'<svg class="i" viewBox="0 0 24 24"></svg>'}<h3>Belum ada tugas mengajar</h3><p>Admin belum menetapkan mapel & kelas yang Anda ajar. Hubungi admin/kurikulum agar Anda ditugaskan.</p></div>`;
/** Kunci bersama per ujian+mapel+kelas (diisi admin atau guru) — ambil yang terakhir diubah. */
function sesiFor(mapel, kelas, ujian) {
  ujian = ujian || ujianAktif();
  const list = (AppState.boot.sesi || []).filter(s => s.ujian === ujian && s.mapel === mapel && s.kelas === kelas);
  return list.sort((a, b) => String(b.diubah || '').localeCompare(String(a.diubah || '')))[0] || null;
}
function curSesi() { const c = AppState.ctx; return c ? sesiFor(c.mapel, c.kelas) : null; }
function kunciLengkap(s) { return s && s.kunci && s.kunci.length === s.n && /^[ABCD]+$/.test(s.kunci); }
function progressOf(sesi, kelas) {
  const list = AppState.maps.siswaByKelas[kelas] || [], h = (sesi && AppState.maps.hasil[sesi.id]) || {};
  const done = list.filter(s => h[s.nisn]).length;
  return { done, total: list.length, belum: list.filter(s => !h[s.nisn]), pct: list.length ? Math.round(done / list.length * 100) : 0 };
}
function saveBootLocal() { Store.set(userKey('boot'), { t: Date.now(), h: '', data: AppState.boot }); }
Outbox.on(items => {
  AppState.pending = items;
  const before = JSON.stringify(Object.keys(AppState.maps.hasil || {}).length);
  if (AppState.boot) buildMaps();
});
document.addEventListener('outbox:done', e => {
  const { item, res } = e.detail;
  if (item.action === 'hasilSave' && res.data) {       // pindahkan ke indeks resmi
    const d = res.data, idx = AppState.boot.hasilIdx;
    const i = idx.findIndex(r => r[1] === d.idSesi && r[2] === d.nisn);
    const row = [d.idScan, d.idSesi, d.nisn, d.nilai, d.status];
    if (i > -1) idx[i] = row; else idx.push(row);
    saveBootLocal(); buildMaps();
    Store.del(userKey('hasil:' + ujianAktif()));        // daftar hasil diambil segar saat dibuka
  }
});

/* ---------------- Sesi login ---------------- */
function saveSession() { Store.set('session', { token: AppState.token, exp: AppState.exp, me: AppState.me }); }
function restoreSession() {
  const s = Store.get('session', null);
  if (!s || !s.token || s.exp < Date.now() + 60000) return false;
  AppState.token = s.token; AppState.exp = s.exp; AppState.me = s.me;
  const b = Store.get(userKey('boot'), null);
  if (!b) return false;
  AppState.boot = b.data; AppState.ctx = Store.get(userKey('ctx'), null);
  buildMaps(); return true;
}
function onLoginSuccess(data, pass) {
  AppState.token = data.token; AppState.exp = data.exp; AppState.boot = data.boot;
  AppState.me = data.boot.me; AppState.ctx = Store.get(userKey('ctx'), null);
  saveSession(); Store.set(userKey('boot'), { t: Date.now(), h: hashStr(JSON.stringify(data.boot)), data: data.boot });
  applyBrand(data.boot.settings.warna_utama, data.boot.settings.warna_aksen);
  buildMaps();
  if (AppState.me.wajibGanti) return forcePasswordChange(pass);
  startApp();
}
let _expiredShown = false;
function onSessionExpired() {
  if (_expiredShown || !AppState.me) return; _expiredShown = true;
  const admin = isAdmin();
  const L = openLayer(
    '<div class="dlg-icon" style="background:var(--primary-soft);color:var(--primary)">' + ic('lock') + '</div>' +
    '<h2 style="text-align:center">Sesi berakhir</h2><p class="muted" style="text-align:center;margin:6px 0 16px">Masuk kembali untuk melanjutkan. Hasil scan yang belum terkirim tetap aman di HP ini.</p>' +
    (admin ? '<div class="field"><label>Username</label><input class="input" id="rl-u" autocomplete="username"></div>' : '<p style="text-align:center;margin-bottom:10px"><b>' + esc(AppState.me.nama) + '</b></p>') +
    '<div class="field"><label>Password</label><input class="input" id="rl-p" type="password" autocomplete="current-password"></div><div class="err-text" id="rl-e"></div>' +
    '<button class="btn btn-primary btn-block" id="rl-b" style="margin-top:8px"><span>Masuk</span></button><button class="btn btn-ghost btn-block" id="rl-x">Keluar</button>',
    { center: true, sticky: true });
  $('#rl-b', L.el).onclick = e => withBtn(e.currentTarget, async () => {
    const res = await api('login', admin ? { mode: 'admin', username: $('#rl-u', L.el).value, password: $('#rl-p', L.el).value } : { mode: 'guru', id: AppState.me.id, password: $('#rl-p', L.el).value }, { noAuthPrompt: true });
    if (!res.success) { $('#rl-e', L.el).innerHTML = ic('circle-x', 'sm') + esc(res.message); return; }
    if (res.data.boot.me.id !== AppState.me.id) { $('#rl-e', L.el).textContent = 'Gunakan akun yang sama.'; return; }
    AppState.token = res.data.token; AppState.exp = res.data.exp; saveSession();
    _expiredShown = false; L.close(); toast('Berhasil masuk kembali.'); Outbox.flush();
  });
  $('#rl-x', L.el).onclick = () => { _expiredShown = false; L.close(); logout(true); };
}
async function logout(skipCheck) {
  if (!skipCheck) {
    if (!(await checkLeaveContext('keluar'))) return;
    const pend = (AppState.pending || []).length;
    if (pend && !(await confirmDlg({ title: 'Data belum terkirim', text: pend + ' data masih di antrean HP ini dan akan dikirim saat Anda masuk lagi dengan akun yang sama. Tetap keluar?', ok: 'Tetap keluar', cancel: 'Batal' }))) return;
  }
  Scanner.stop();
  Store.del('session'); AppState.token = ''; AppState.me = null; AppState.boot = null;
  location.hash = ''; renderLogin(); renderNet();
}
function forcePasswordChange(oldPass) {
  const L = openLayer(
    '<div class="dlg-icon" style="background:var(--primary-soft);color:var(--primary)">' + ic('key-round') + '</div>' +
    '<h2 style="text-align:center">Ganti password dulu</h2><p class="muted" style="text-align:center;margin:6px 0 16px">Demi keamanan, password awal dari admin wajib diganti saat login pertama.</p>' +
    '<div class="field"><label>Password baru</label><input class="input" id="fp1" type="password" autocomplete="new-password" placeholder="Minimal 6 karakter"></div>' +
    '<div class="field"><label>Ulangi password baru</label><input class="input" id="fp2" type="password" autocomplete="new-password"></div><div class="err-text" id="fpe"></div>' +
    '<button class="btn btn-primary btn-block" id="fpb" style="margin-top:8px"><span>Simpan Password</span></button>', { center: true, sticky: true });
  $('#fpb', L.el).onclick = e => withBtn(e.currentTarget, async () => {
    const a = $('#fp1', L.el).value, b = $('#fp2', L.el).value;
    if (a.length < 6) return $('#fpe', L.el).textContent = 'Password minimal 6 karakter.';
    if (a !== b) return $('#fpe', L.el).textContent = 'Ulangan password tidak sama.';
    if (a === oldPass) return $('#fpe', L.el).textContent = 'Gunakan password yang berbeda dari password awal.';
    const res = await api('changePassword', { old: oldPass || '', new: a, forced: true });
    if (!res.success) return $('#fpe', L.el).textContent = res.message;
    AppState.me.wajibGanti = false; AppState.boot.me.wajibGanti = false; saveSession(); saveBootLocal();
    L.close(); toast('Password berhasil diganti.'); startApp();
  });
}

/* ---------------- Kartu "Pasang aplikasi" (tampil otomatis hanya bila bisa diinstal) ---------------- */
function installCard(style) {
  const ios = window.PWA && PWA.isIOS;
  return `<div class="card" data-pwa-install hidden role="button" tabindex="0" style="cursor:pointer;display:flex;gap:12px;align-items:center;border-color:var(--primary-line);background:var(--primary-soft);${style}">
    <span class="brandmark" style="flex:none">${ic('smartphone')}</span>
    <div class="grow"><b style="font:700 15px var(--font-h)">Pasang Kolej di ${ios ? 'iPhone' : 'perangkat ini'}</b><p class="muted small">Buka dari ikon di layar utama, layar penuh tanpa bilah alamat, tetap bisa scan saat sinyal hilang.</p></div>
    <span class="btn btn-primary btn-sm" style="flex:none">${ic('download', 'sm')} <span>Pasang</span></span></div>`;
}
window.addEventListener('pwa:installed', () => toast('Kolej berhasil dipasang. Buka dari ikon di layar utama.'));

/**
 * Alur hapus: konfirmasi → kirim → bila punya data terkait (HAS_RESULTS) minta konfirmasi kedua → force.
 * IN_USE (masih dipakai) ditampilkan dengan saran "Nonaktifkan". Return respons sukses atau null.
 */
async function deleteFlow(o) {
  if (!(await confirmDlg({ title: o.title, text: o.text, ok: 'Hapus', danger: true, icon: 'trash-2' }))) return null;
  let res = await api(o.action, o.data);
  if (!res.success && res.data && res.data.code === 'HAS_RESULTS') {
    if (!(await confirmDlg({ title: 'Hapus juga ' + res.data.hasil + ' hasil scan?', text: res.message + ' Tindakan ini tidak bisa dibatalkan.', ok: 'Ya, hapus semuanya', danger: true, icon: 'triangle-alert' }))) return null;
    res = await api(o.action, Object.assign({}, o.data, { force: true }));
  }
  if (!res.success) {
    if (res.data && res.data.code === 'IN_USE' && o.onDeactivate) {
      if (await confirmDlg({ title: 'Tidak bisa dihapus', text: res.message, ok: 'Nonaktifkan saja', cancel: 'Batal', icon: 'info', tone: 'info' })) await o.onDeactivate();
    } else toast(res.message, 'bad', 5000);
    return null;
  }
  toast(res.message); return res;
}

/* ---------------- Halaman login ---------------- */
function renderLogin() {
  document.title = 'Masuk · Kolej';
  const pub = AppState.pub || Store.get('pub', null) || { sekolah: 'SMP Budi Luhur Mandiri', guru: [] };
  const last = Store.get('lastGuru', null);
  app.innerHTML = `
  <div class="login">
    <div class="top"><span class="label-sm row" style="gap:8px"><i class="status-dot"></i>Sistem Koreksi LJK</span>
      <button class="btn-icon solid" id="lg-theme" aria-label="Ganti tema">${ic(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun')}</button></div>
    <div class="box">
      <div class="logo">${ic('scan-line')}</div>
      <h1>Kolej</h1>
      <p class="muted" style="text-align:center;font-size:17px;margin-top:2px">Koreksi Lembar Jawaban</p>
      <div style="text-align:center;margin:10px 0 22px"><span class="chip p" style="height:32px;font-size:13.5px">${ic('graduation-cap')} <span id="lg-school">${esc(pub.sekolah)}</span></span></div>
      <div class="card" style="padding:22px">
        <div id="lg-guru">
          <div class="row between" style="margin-bottom:18px"><div><h2>Selamat Datang, Guru!</h2><p class="muted">Masuk untuk memulai pemindaian nilai siswa</p></div>
            <span class="stat" style="padding:10px;border:0;background:var(--primary-soft);color:var(--primary)">${ic('scan')}</span></div>
          <div class="field"><label>Nama Guru</label>
            <div class="combo"><div class="input-wrap">${ic('search')}<input class="input" id="lg-cari" placeholder="Pilih nama Anda" autocomplete="off" readonly><span class="trail btn-icon">${ic('chevron-down')}</span></div>
            <div class="combo-list" id="lg-list" hidden></div></div></div>
        </div>
        <div id="lg-admin" hidden>
          <div class="row" style="margin-bottom:18px;gap:12px"><span class="stat" style="padding:10px;border:0;background:var(--primary-soft);color:var(--primary)">${ic('shield-check')}</span><div><h2>Masuk sebagai Admin</h2><p class="muted">Operator ujian / kurikulum</p></div></div>
          <div class="field"><label>Username</label><div class="input-wrap">${ic('circle-user')}<input class="input" id="lg-user" autocomplete="username" autocapitalize="off"></div></div>
        </div>
        <div class="field" style="margin-bottom:6px"><div class="row between"><label for="lg-pass" style="font-weight:600;font-size:13px">Password</label><a href="#" id="lg-lupa" style="font-size:13px;font-weight:600;text-decoration:none">Lupa password?</a></div>
          <div class="input-wrap">${ic('lock')}<input class="input" id="lg-pass" type="password" autocomplete="current-password"><button class="trail btn-icon" id="lg-eye" type="button" aria-label="Lihat password">${ic('eye-off')}</button></div></div>
        <div class="err-text" id="lg-err" style="min-height:20px"></div>
        <label class="check"><input type="checkbox" id="lg-ingat" ${Store.get('remember', true) ? 'checked' : ''}> Ingat saya di perangkat ini</label>
        <button class="btn btn-primary btn-block" id="lg-btn" style="margin-top:10px;min-height:54px;font-size:17px"><span class="row" style="gap:8px">${ic('log-out')} Masuk</span></button>
      </div>
      <button class="btn btn-ghost btn-block" id="lg-switch" style="margin-top:14px">${ic('shield-check')} <span>Masuk sebagai Admin</span></button>
      ${installCard('margin-top:14px')}
      <div class="card" style="margin-top:14px;background:var(--surface-2);display:flex;gap:12px;align-items:center">
        <span class="stat" style="padding:10px;margin:0;background:var(--surface);color:var(--accent-ink)">${ic('zap')}</span>
        <div><b>Pemindai LJK langsung di HP</b><p class="muted small">50 soal pilihan ganda A–D · tanda X · bunyi beep saat berhasil</p></div></div>
      <p class="muted small" style="text-align:center;margin-top:18px">Versi ${esc(window.KOLEJ_CONFIG.APP_VERSION)} · Kolej ${esc(pub.sekolah)}</p>
    </div>
  </div>`;
  let mode = 'guru', chosen = (pub.guru || []).find(g => g.id === last) || null;
  const cari = $('#lg-cari'), list = $('#lg-list');
  if (chosen) cari.value = chosen.nama;
  const showList = () => {
    const q = cari.value.toLowerCase(), guru = (AppState.pub || pub).guru || [];
    const items = guru.filter(g => !q || g.nama.toLowerCase().includes(q) || (chosen && chosen.nama === cari.value));
    list.innerHTML = items.length ? items.map(g => `<button type="button" data-id="${esc(g.id)}"><span class="avatar sm">${esc(fmt.initials(g.nama))}</span>${esc(g.nama)}</button>`).join('')
      : `<div class="muted" style="padding:12px">${guru.length ? 'Nama tidak ditemukan.' : 'Memuat daftar guru…'}</div>`;
    list.hidden = false;
  };
  cari.addEventListener('focus', () => { cari.readOnly = false; if (chosen) cari.select(); showList(); });
  cari.addEventListener('input', () => { chosen = null; showList(); });
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return; chosen = ((AppState.pub || pub).guru || []).find(g => g.id === b.dataset.id); cari.value = chosen.nama; list.hidden = true; cari.blur(); $('#lg-pass').focus(); });
  cari.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
  $('#lg-eye').onclick = () => { const p = $('#lg-pass'); p.type = p.type === 'password' ? 'text' : 'password'; $('#lg-eye').innerHTML = ic(p.type === 'password' ? 'eye-off' : 'eye'); };
  $('#lg-theme').onclick = () => { const d = document.documentElement.dataset.theme === 'dark'; setMode(d ? 'terang' : 'gelap'); $('#lg-theme').innerHTML = ic(d ? 'sun' : 'moon'); };
  $('#lg-switch').onclick = () => {
    mode = mode === 'guru' ? 'admin' : 'guru';
    $('#lg-guru').hidden = mode !== 'guru'; $('#lg-admin').hidden = mode !== 'admin';
    $('#lg-switch').innerHTML = mode === 'guru' ? ic('shield-check') + ' <span>Masuk sebagai Admin</span>' : ic('arrow-left') + ' <span>Kembali ke login Guru</span>';
    $('#lg-err').textContent = ''; (mode === 'admin' ? $('#lg-user') : cari).focus();
  };
  $('#lg-lupa').onclick = e => { e.preventDefault(); confirmDlg({ title: 'Lupa password?', text: 'Hubungi Admin (operator ujian/kurikulum) untuk mereset password Anda. Setelah direset, Anda wajib menggantinya saat masuk.', ok: 'Mengerti', cancel: false, icon: 'circle-help', tone: 'info' }); };
  const submit = () => withBtn($('#lg-btn'), async () => {
    const pass = $('#lg-pass').value, err = $('#lg-err');
    err.innerHTML = '';
    if (mode === 'guru' && !chosen) { err.innerHTML = ic('circle-x', 'sm') + ' Pilih nama Anda terlebih dahulu.'; return; }
    if (!pass) { err.innerHTML = ic('circle-x', 'sm') + ' Password wajib diisi.'; return; }
    const res = await api('login', mode === 'guru' ? { mode, id: chosen.id, password: pass } : { mode, username: $('#lg-user').value, password: pass }, { noAuthPrompt: true });
    if (!res.success) { err.innerHTML = ic('circle-x', 'sm') + ' ' + esc(res.message); $('#lg-pass').select(); return; }
    Store.set('remember', $('#lg-ingat').checked);
    if (mode === 'guru' && $('#lg-ingat').checked) Store.set('lastGuru', chosen.id);
    onLoginSuccess(res.data, pass);
  });
  $('#lg-btn').onclick = submit;
  $('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  // daftar guru: tampil dari cache, segarkan di latar
  warmUpServer('pub');
  api('publicBoot').then(res => {
    if (!res.success) { if (!(pub.guru || []).length) $('#lg-err').innerHTML = ic('wifi-off', 'sm') + ' ' + esc(res.message); return; }
    AppState.pub = res.data; Store.set('pub', res.data); applyBrand(res.data.warna, res.data.aksen);
    const sc = $('#lg-school'); if (sc) sc.textContent = res.data.sekolah;
    if (!list.hidden) showList();
  });
}

/* ---------------- Kerangka & router ---------------- */
const NAV_GURU = [['scan', 'Scan', 'scan-line'], ['kunci', 'Kunci', 'key-round'], ['hasil', 'Hasil', 'chart-column'], ['akun', 'Akun', 'circle-user']];
const NAV_ADMIN_MOB = [['dashboard', 'Dashboard', 'layout-dashboard'], ['scan', 'Scan', 'scan-line'], ['hasil', 'Hasil', 'chart-column'], ['data', 'Data', 'list'], ['akun', 'Akun', 'circle-user']];
const SIDE_ADMIN = [
  ['Menu Utama', [['dashboard', 'Dashboard', 'layout-dashboard'], ['scan', 'Scan LJK', 'scan-line'], ['kunci', 'Kunci Jawaban', 'key-round'], ['hasil', 'Hasil', 'clipboard-check'], ['template', 'Template LJK', 'printer']]],
  ['Data Master', [['guru', 'Data Guru', 'graduation-cap'], ['mapel', 'Data Mapel', 'book-open'], ['kelas', 'Data Kelas', 'building-2'], ['siswa', 'Data Siswa', 'users']]],
  ['Sistem', [['pengaturan', 'Pengaturan', 'settings'], ['log', 'Log Aktivitas', 'history'], ['akun', 'Akun Saya', 'circle-user']]]
];
const SIDE_GURU = [['Menu', [['scan', 'Scan LJK', 'scan-line'], ['kunci', 'Kunci Jawaban', 'key-round'], ['hasil', 'Hasil & Statistik', 'chart-column'], ['pilih', 'Pilih Mapel & Kelas', 'list-checks'], ['template', 'Template LJK', 'printer'], ['akun', 'Akun', 'circle-user']]]];
const Pages = {};
function registerPage(name, def) { Pages[name] = Object.assign({ admin: false }, def); }

function startApp() {
  const s = AppState.boot.settings;
  applyBrand(s.warna_utama, s.warna_aksen);
  const side = isAdmin() ? SIDE_ADMIN : SIDE_GURU, nav = isAdmin() ? NAV_ADMIN_MOB : NAV_GURU;
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brandmark">K</span><div><div style="font:700 19px var(--font-h)">Kolej</div><div style="font-size:12.5px;opacity:.8">${esc(s.nama_sekolah)}</div></div></div>
      ${side.map(([g, items]) => `<div class="grp">${esc(g)}</div>` + items.map(([r, t, i]) => `<a href="#/${r}" data-r="${r}">${ic(i)}<span>${esc(t)}</span></a>`).join('')).join('')}
      <div class="foot"><a href="#" id="sb-out">${ic('log-out')}<span>Keluar</span></a></div></aside>
    <div class="main">
      <header class="topbar"><span class="brandmark hide-desk">K</span><div class="grow"><div class="t1 ellip" id="tb-title">Kolej</div><div class="t2 ellip">${esc(s.nama_sekolah)}</div></div>
        <span class="chip a hide-mob">${ic('circle-dot')} ${esc(s.ujian_aktif)}</span>
        <button class="btn-icon" id="tb-theme" aria-label="Mode tampilan">${ic(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun')}</button>
        <a href="#/akun" class="avatar sm" aria-label="Akun" style="text-decoration:none">${esc(fmt.initials(AppState.me.nama))}</a></header>
      <main class="content" id="view"></main>
    </div>
    <nav class="bottomnav">${nav.map(([r, t, i]) => `<a href="#/${r}" data-r="${r}">${ic(i, 'lg')}<span>${t}</span></a>`).join('')}</nav>
  </div>`;
  $('#sb-out').onclick = e => { e.preventDefault(); logout(); };
  $('#tb-theme').onclick = () => { const d = document.documentElement.dataset.theme === 'dark'; setMode(d ? 'terang' : 'gelap'); $('#tb-theme').innerHTML = ic(d ? 'sun' : 'moon'); };
  window.onhashchange = route;
  if (!location.hash || location.hash === '#/') location.hash = isAdmin() ? '#/dashboard' : (AppState.ctx ? '#/scan' : '#/pilih');
  else route();
  renderNet(); Outbox.emit(); Outbox.flush();
  // segarkan boot di latar (SWR); render ulang hanya bila data berubah
  swr('boot', 'boot', {}, (data, fromCache) => {
    if (fromCache) return;
    AppState.boot = data; AppState.me = Object.assign(AppState.me, { nama: data.me.nama }); buildMaps();
    applyBrand(data.settings.warna_utama, data.settings.warna_aksen);
    if (!$('.scanner') && !$('.fullpage') && !$('.layer')) route(true);
  }, { fresh: 60000 });
  (window.requestIdleCallback ? cb => requestIdleCallback(cb, { timeout: 2500 }) : cb => setTimeout(cb, 2500))(() => prefetchHasil());
}
/** Segarkan data (kunci dari admin/guru lain, penugasan) bila sudah > ms; render ulang hanya bila berubah. */
let _bootBusy = false;
function refreshBoot(ms) {
  const c = Store.get(userKey('boot'), null);
  if (_bootBusy || (c && Date.now() - c.t < ms)) return;
  _bootBusy = true;
  const before = JSON.stringify([AppState.boot.sesi, AppState.boot.ajar, AppState.boot.mapel]);
  api('boot').then(res => {
    _bootBusy = false;
    if (!res.success) return;
    AppState.boot = res.data; Store.set(userKey('boot'), { t: Date.now(), h: '', data: res.data }); buildMaps();
    if (JSON.stringify([res.data.sesi, res.data.ajar, res.data.mapel]) !== before && !$('.scanner') && !$('.fullpage') && !$('.layer')) route(true);
  });
}
function prefetchHasil() {
  const u = ujianAktif(), k = userKey('hasil:' + u), c = Store.get(k, null);
  if (c && Date.now() - c.t < 120000) return;
  api('hasilList', { ujian: u }).then(res => { if (res.success) Store.set(k, { t: Date.now(), h: hashStr(JSON.stringify(res.data)), data: res.data }); });
}
let _curRoute = '';
function route(soft) {
  if (!AppState.me) return;
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  let def = Pages[name];
  if (!def || (def.admin && !isAdmin())) { location.hash = isAdmin() ? '#/dashboard' : '#/scan'; return; }
  const view = $('#view'); if (!view) return;
  if (name !== 'pengaturan') applyBrand(AppState.boot.settings.warna_utama, AppState.boot.settings.warna_aksen);
  if (AppState.ctx && !canTeach(AppState.ctx.mapel, AppState.ctx.kelas)) { AppState.ctx = null; Store.del(userKey('ctx')); }
  if (def.needCtx && !AppState.ctx) { location.hash = '#/pilih'; return; }
  if (['kunci', 'scan', 'pilih', 'hasil', 'dashboard'].includes(name)) refreshBoot(15000);
  $$('.sidebar a[data-r], .bottomnav a[data-r]').forEach(a => {
    const r = a.dataset.r, on = r === name || (name === 'pilih' && r === 'scan') || (['guru', 'mapel', 'kelas', 'siswa', 'pengaturan', 'log'].includes(name) && r === 'data') || (name === 'template' && r === (isAdmin() ? 'data' : 'akun'));
    a.classList.toggle('on', on);
  });
  $('#tb-title').textContent = def.title || 'Kolej';
  document.title = (def.title || 'Kolej') + ' · Kolej';
  const keepScroll = soft && _curRoute === location.hash ? scrollY : 0;
  _curRoute = location.hash;
  view.innerHTML = '<div class="page" data-page="' + name + '"></div>';
  def.render(view.firstChild, param && decodeURIComponent(param));
  window.scrollTo(0, keepScroll);
}

/* ---------------- FR-07: siswa belum di-scan saat pindah/keluar ---------------- */
async function checkLeaveContext(target) {
  const c = AppState.ctx; if (!c) return true;
  const sesi = sesiFor(c.mapel, c.kelas); if (!sesi) return true;
  const p = progressOf(sesi, c.kelas);
  if (!p.done || !p.belum.length) return true;
  const kn = kelasNama(c.kelas), names = p.belum.map(s => s.nama);
  const title = target === 'keluar' ? 'Keluar dari aplikasi?' : 'Pindah ke ' + target + '?';
  return confirmDlg({
    title,
    html: `Masih ada <b>${p.belum.length} siswa</b> di Kelas ${esc(kn)} (${esc(mapelNama(c.mapel))}) yang belum dipindai lembar jawabannya.
      <div class="card" style="text-align:left;margin-top:14px;background:var(--surface-2);border:0">
        <div class="row between"><b style="color:var(--text)">Progres Kelas ${esc(kn)}</b><b style="color:var(--accent-ink)">${p.done} / ${p.total} Selesai (${p.pct}%)</b></div>
        <div class="progress" style="margin:10px 0"><i style="width:${p.pct}%"></i></div>
        <details><summary style="cursor:pointer;font-weight:600;color:var(--text)">Lihat ${names.length} nama yang tertinggal</summary>
        <div class="small" style="max-height:140px;overflow:auto;margin-top:6px;line-height:1.7">${names.map(esc).join('<br>')}</div></details></div>`,
    ok: target === 'keluar' ? 'Tetap keluar' : 'Ya, tetap pindah', okIcon: 'arrow-right',
    cancel: 'Kembali ke Kelas ' + kn,
    foot: '<p class="muted small row" style="justify-content:center;margin-top:12px">' + ic('save', 'sm') + ' Hasil ' + p.done + ' siswa sudah tersimpan</p>'
  });
}
async function setContext(mapel, kelas) {
  const c = AppState.ctx;
  if (c && (c.mapel !== mapel || c.kelas !== kelas)) {
    const label = c.mapel !== mapel ? mapelNama(mapel) + ' · Kelas ' + kelasNama(kelas) : 'Kelas ' + kelasNama(kelas);
    if (!(await checkLeaveContext(label))) return false;
  }
  AppState.ctx = { mapel, kelas }; Store.set(userKey('ctx'), AppState.ctx);
  return true;
}
function ctxHeader(extra) {
  const c = AppState.ctx, sesi = sesiFor(c.mapel, c.kelas), p = progressOf(sesi, c.kelas);
  return `<div class="ctx-card"><span class="ctx-ic">${ic('book-open')}</span>
    <div class="grow" style="min-width:0"><div class="label-sm" style="color:inherit;opacity:.75">Sedang dikoreksi</div>
      <div class="ctx-t">${esc(mapelNama(c.mapel))} <span style="opacity:.5">·</span> Kelas ${esc(kelasNama(c.kelas))}</div>
      <div class="small" style="opacity:.8">${p.total} siswa · KKM ${kkmOf(c.mapel)}${sesi ? ' · ' + sesi.n + ' soal' : ' · kunci belum dibuat'}</div></div>
    <button class="btn ctx-btn" data-ctx-switch>${ic('refresh-cw')} <span>Ganti</span></button></div>${extra || ''}`;
}
function bindCtx(el) { $$('[data-ctx-switch]', el).forEach(b => b.onclick = () => quickSwitch()); }
/** Ganti mapel/kelas cepat lewat lembar bawah (tanpa pindah halaman). */
function quickSwitch() {
  const c = AppState.ctx || {}, mp = myMapel();
  let mapel = c.mapel && mp.some(m => m.id === c.mapel) ? c.mapel : (mp[0] && mp[0].id);
  const L = openLayer(`<div class="sh-h"><div class="grow"><h2>Ganti Mapel & Kelas</h2><p class="muted small">${esc(ujianAktif())}</p></div><button class="btn-icon" data-close>${ic('x')}</button></div><div id="qs"></div>`);
  const draw = () => {
    $('#qs', L.el).innerHTML = `<div class="label-sm" style="margin-bottom:8px">Mata Pelajaran</div>
      <div class="chips" style="flex-wrap:wrap;margin-bottom:16px">${mp.map(m => `<button class="chip pick ${m.id === mapel ? 'on' : ''}" data-m="${esc(m.id)}">${esc(m.nama)}</button>`).join('')}</div>
      <div class="label-sm" style="margin-bottom:8px">Kelas</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">${myKelas(mapel).map(k => {
        const se = sesiFor(mapel, k.id), p = progressOf(se, k.id), on = c.mapel === mapel && c.kelas === k.id;
        return `<button class="card" data-k="${esc(k.id)}" style="margin:0;padding:12px;text-align:left;cursor:pointer;${on ? 'border-color:var(--primary);box-shadow:0 0 0 2px var(--primary)' : ''}"><div class="row between"><b style="font:700 16px var(--font-h)">${esc(k.nama)}</b>${on ? '<span class="chip p" style="height:22px">Aktif</span>' : ''}</div>
          <div class="small" style="margin:4px 0 6px;color:${kunciLengkap(se) ? 'var(--ok-ink)' : 'var(--warn-ink)'}">${kunciLengkap(se) ? 'kunci siap' : 'kunci belum'}</div><div class="progress ${p.pct === 100 ? 'ok' : ''}"><i style="width:${p.pct}%"></i></div><div class="small muted tnum" style="margin-top:4px">${p.done}/${p.total}</div></button>`;
      }).join('')}</div>`;
    $$('[data-m]', L.el).forEach(b => b.onclick = () => { mapel = b.dataset.m; draw(); });
    $$('[data-k]', L.el).forEach(b => b.onclick = async () => {
      if (!(await setContext(mapel, b.dataset.k))) return;
      L.close();
      const page = location.hash.indexOf('#/kunci') === 0 ? '#/kunci' : (kunciLengkap(sesiFor(mapel, b.dataset.k)) ? '#/scan' : '#/kunci');
      if (location.hash === page) route(); else location.hash = page;
      toast(mapelNama(mapel) + ' · Kelas ' + kelasNama(b.dataset.k), 'info', 1600);
    });
  };
  draw();
}

/* ======================================================================
   HALAMAN: Pilih Mapel & Kelas
   ====================================================================== */
registerPage('pilih', {
  title: 'Pilih Mapel & Kelas',
  render(el) {
    const c = AppState.ctx || {}, mp = myMapel();
    let mapel = c.mapel && mp.some(m => m.id === c.mapel) ? c.mapel : (mp[0] && mp[0].id);
    if (!mp.length) { el.innerHTML = `<div class="page-h"><h1>Pilih Mapel & Kelas</h1></div>` + NO_AJAR.replace('<svg class="i" viewBox="0 0 24 24"></svg>', ic('book-open')); return; }
    const draw = () => {
      const kel = myKelas(mapel), tingkat = [...new Set(kel.map(k => k.tingkat || '-'))];
      el.innerHTML = `<div class="page-h"><div><h1>Pilih Mapel & Kelas</h1><p class="muted">${esc(ujianAktif())} · ${isAdmin() ? 'pilih mata pelajaran lalu kelas' : 'mapel & kelas sesuai tugas mengajar dari admin'}</p></div></div>
      <div class="label-sm" style="margin:6px 0 8px">Mata Pelajaran</div>
      <div class="chips" style="flex-wrap:wrap">${mp.map(m => `<button class="chip pick ${m.id === mapel ? 'on' : ''}" data-m="${esc(m.id)}">${esc(m.nama)}</button>`).join('') || '<p class="muted">Belum ada mapel. Minta admin menambahkan data mapel.</p>'}</div>
      <div class="label-sm" style="margin:20px 0 8px">Kelas</div>
      ${tingkat.map(t => `<div class="muted small" style="margin:10px 0 6px">Kelas ${esc(t)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${kel.filter(k => (k.tingkat || '-') === t).map(k => {
        const s = sesiFor(mapel, k.id), p = progressOf(s, k.id), on = c.mapel === mapel && c.kelas === k.id;
        return `<button class="card" data-k="${esc(k.id)}" style="text-align:left;cursor:pointer;margin:0;${on ? 'border-color:var(--primary);box-shadow:0 0 0 2px var(--primary)' : ''}">
            <div class="row between"><h3>${esc(k.nama)}</h3>${on ? '<span class="chip p">Aktif</span>' : ''}</div>
            <div class="muted small" style="margin:2px 0 8px">${p.total} siswa · ${kunciLengkap(s) ? '<span style="color:var(--ok-ink)">kunci siap</span>' : '<span style="color:var(--warn-ink)">kunci belum</span>'}</div>
            <div class="progress ${p.pct === 100 ? 'ok' : ''}"><i style="width:${p.pct}%"></i></div><div class="small muted tnum" style="margin-top:6px">${p.done}/${p.total} di-scan</div></button>`;
      }).join('')}</div>`).join('') || '<p class="muted">Belum ada kelas.</p>'}`;
      $$('[data-m]', el).forEach(b => b.onclick = () => { mapel = b.dataset.m; draw(); });
      $$('[data-k]', el).forEach(b => b.onclick = async () => {
        if (!(await setContext(mapel, b.dataset.k))) return;
        location.hash = kunciLengkap(sesiFor(mapel, b.dataset.k)) ? '#/scan' : '#/kunci';
      });
    };
    draw();
  }
});

/* ======================================================================
   HALAMAN: Kunci Jawaban & Skor
   ====================================================================== */
registerPage('kunci', {
  title: 'Kunci Jawaban', needCtx: true,
  render(el) {
    const c = AppState.ctx, sesi = sesiFor(c.mapel, c.kelas);
    const dkey = userKey('draft:' + c.mapel + ':' + c.kelas);
    const base = sesi ? { n: sesi.n, kunci: sesi.kunci.split(''), mode: sesi.mode, bobot: sesi.bobot ? sesi.bobot.split(',') : [] } : { n: 50, kunci: [], mode: 'Rata', bobot: [] };
    // draf lokal dibuang bila kunci di server sudah diubah orang lain (admin/guru) sejak draf dibuat
    const stamp = sesi ? String(sesi.diubah || '') + '|' + sesi.kunci : '';
    let D = Store.get(dkey, null);
    if (D && sesi && D.base !== stamp) { D = null; Store.del(dkey); }
    if (!D) D = Object.assign(JSON.parse(JSON.stringify(base)), { base: stamp });
    const persist = () => Store.set(dkey, D);
    const filled = () => D.kunci.slice(0, D.n).filter(x => /^[ABCD]$/.test(x)).length;
    const ro = !canTeach(c.mapel, c.kelas);
    function rowHtml(i) {
      const k = D.kunci[i] || '', miss = !k;
      return `<div class="krow ${miss ? 'miss' : ''}" id="kq${i + 1}" data-i="${i}">
        <div class="no tnum">${String(i + 1).padStart(2, '0')}</div>
        ${miss ? '<span class="chip warn hide-mob" style="height:24px">Belum terisi</span>' : ''}
        ${D.mode === 'Manual' ? `<input class="input wbox tnum" inputmode="decimal" data-w="${i}" value="${esc(D.bobot[i] ?? '')}" placeholder="bobot" aria-label="Bobot soal ${i + 1}">` : ''}
        <div class="opts">${'ABCD'.split('').map(o => `<button class="opt ${k === o ? 'on' : ''}" data-o="${o}" aria-label="Soal ${i + 1} ${o}">${o}</button>`).join('')}</div></div>`;
    }
    function draw() {
      const f = filled(), ranges = [];
      for (let a = 1; a <= D.n; a += 10) ranges.push([a, Math.min(D.n, a + 9)]);
      const totalW = D.bobot.slice(0, D.n).reduce((s, x) => s + (Number(x) || 0), 0);
      el.innerHTML = `<div class="page-h"><button class="btn-icon" onclick="history.back()" aria-label="Kembali">${ic('arrow-left')}</button>
        <div class="grow"><h1>Kunci Jawaban</h1><p class="muted">${esc(ujianAktif())}${sesi ? ' · terakhir diubah ' + esc(sesi.guru === AppState.me.id ? 'Anda' : (AppState.boot.guruNama[sesi.guru] || sesi.guru)) + (sesi.diubah ? ', ' + esc(fmt.dt(sesi.diubah)) : '') : ' · belum ada kunci'}</p></div>
        <button class="btn-icon solid" id="k-more" aria-label="Menu lain">${ic('ellipsis-vertical')}</button></div>
      ${ctxHeader()}
      <div class="grid-2c"><div>
      <div class="card"><div class="card-h"><div class="row"><span class="stat" style="padding:8px;margin:0;border:0;background:var(--primary-soft);color:var(--primary)">${ic('sliders-horizontal')}</span><h3>Pengaturan Skor</h3></div><span class="chip ok">Skor Maks: 100</span></div>
        <div class="seg" id="k-mode"><button data-m="Rata" class="${D.mode === 'Rata' ? 'on' : ''}">Bagi Rata</button><button data-m="Manual" class="${D.mode === 'Manual' ? 'on' : ''}">Atur Manual</button></div>
        <div class="info" style="margin-top:12px">${ic('info')}<div>${D.mode === 'Rata'
          ? `<b>Bobot otomatis proporsional</b><br>Setiap soal bernilai <b class="tnum">${fmt.num(100 / D.n, 2)} poin</b> (100 dibagi ${D.n} soal). Salah & kosong = 0.`
          : `<b>Bobot manual per soal</b><br>Nilai = skor diperoleh ÷ total bobot × 100. Total bobot saat ini: <b class="tnum" id="k-tw">${fmt.num(totalW, 2)}</b>`}</div></div>
        ${D.mode === 'Manual' ? '<div class="row" style="margin-top:10px;gap:8px"><input class="input tnum" id="k-wall" inputmode="decimal" placeholder="Isi semua bobot dengan…" style="min-height:42px"><button class="btn btn-soft btn-sm" id="k-wset">Terapkan</button></div>' : ''}
        <div class="row between" style="margin-top:14px"><div><b>Jumlah Butir Soal</b><div class="muted small">Format 4 opsi (A–D), maksimal 50</div></div>
          <div class="stepper"><button id="k-dec" aria-label="Kurangi">${ic('minus')}</button><input id="k-n" class="tnum" inputmode="numeric" value="${D.n}" aria-label="Jumlah soal"><button id="k-inc" aria-label="Tambah">${ic('plus')}</button></div></div>
        <div class="row between" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"><div><b>KKM ${esc(mapelNama(c.mapel))}</b><div class="muted small">Berlaku untuk semua kelas mapel ini${(AppState.maps.mapel.get(c.mapel) || {}).kkm === '' ? ' · saat ini memakai KKM bawaan' : ''}</div></div>
          <div class="row" style="gap:6px"><input class="input tnum" id="k-kkm" inputmode="numeric" value="${kkmOf(c.mapel)}" style="width:72px;text-align:center;font-weight:700" aria-label="KKM"><button class="btn btn-soft btn-sm" id="k-kkm-save">${ic('save', 'sm')} <span>Atur</span></button></div></div></div>
      <div class="card"><div class="row between"><div class="row">${ic('clipboard-list')}<b>Progres Pengisian</b></div><b class="tnum" style="color:${f === D.n ? 'var(--ok-ink)' : 'var(--accent-ink)'}">${f} dari ${D.n} soal terisi</b></div>
        <div class="progress ${f === D.n ? 'ok' : ''}" style="margin:10px 0 12px"><i style="width:${f / D.n * 100}%"></i></div>
        <div class="chips">${ranges.map(([a, b]) => `<button class="chip pick" data-go="${a}" style="height:36px">${a}–${b}${D.kunci.slice(a - 1, b).filter(Boolean).length < b - a + 1 ? ' <span style="color:var(--warn)">●</span>' : ''}</button>`).join('')}</div></div>
      </div><div>
      <div id="k-rows" style="margin-top:12px">${Array.from({ length: D.n }, (_, i) => rowHtml(i)).join('')}</div>
      <div class="info" style="margin-top:14px">${ic('lightbulb')}<div><b>Tips</b><br>Ketuk huruf untuk mengisi kunci. Pastikan semua butir terisi sebelum memindai lembar siswa.</div></div>
      </div></div>
      <div class="sticky-act"><div class="row" style="gap:10px"><button class="btn btn-soft" id="k-copy" style="flex:1">${ic('copy')} <span>Salin Kelas Lain</span></button>
        <button class="btn btn-primary" id="k-save" style="flex:1.4" ${ro ? 'disabled' : ''}>${ic('save')} <span>Simpan Kunci</span></button></div></div>`;
      bind();
    }
    function refreshMeta() {                             // pembaruan ringan tanpa render ulang
      const f = filled(); const bar = $('.progress', el.querySelectorAll('.card')[1]);
      el.querySelectorAll('.card')[1].querySelector('b.tnum').textContent = f + ' dari ' + D.n + ' soal terisi';
      bar.firstElementChild.style.width = (f / D.n * 100) + '%'; bar.classList.toggle('ok', f === D.n);
      const tw = $('#k-tw', el); if (tw) tw.textContent = fmt.num(D.bobot.slice(0, D.n).reduce((s, x) => s + (Number(x) || 0), 0), 2);
    }
    function bind() {
      bindCtx(el);
      $('#k-rows', el).addEventListener('click', e => {
        const b = e.target.closest('.opt'); if (!b) return;
        const row = b.closest('.krow'), i = +row.dataset.i;
        D.kunci[i] = b.dataset.o; persist();
        $$('.opt', row).forEach(x => x.classList.toggle('on', x === b));
        row.classList.remove('miss'); const ch = $('.chip.warn', row); if (ch) ch.remove();
        refreshMeta();
        const next = $('#kq' + (i + 2), el);
        if (next && next.classList.contains('miss') && next.getBoundingClientRect().top > innerHeight - 220) next.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      $('#k-rows', el).addEventListener('input', e => { const w = e.target.closest('[data-w]'); if (!w) return; D.bobot[+w.dataset.w] = w.value.replace(',', '.'); persist(); refreshMeta(); });
      $$('#k-mode button', el).forEach(b => b.onclick = () => { D.mode = b.dataset.m; persist(); draw(); });
      const setN = n => { n = Math.max(1, Math.min(50, n | 0)); if (n === D.n) return; D.n = n; persist(); draw(); };
      $('#k-dec', el).onclick = () => setN(D.n - 1); $('#k-inc', el).onclick = () => setN(D.n + 1);
      $('#k-n', el).onchange = e => setN(+e.target.value);
      $$('[data-go]', el).forEach(b => b.onclick = () => $('#kq' + b.dataset.go, el).scrollIntoView({ behavior: 'smooth', block: 'start' }));
      const ws = $('#k-wset', el); if (ws) ws.onclick = () => { const v = $('#k-wall', el).value.replace(',', '.'); if (!(Number(v) >= 0)) return toast('Isi angka bobot.', 'warn'); for (let i = 0; i < D.n; i++) D.bobot[i] = v; persist(); draw(); };
      $('#k-more', el).onclick = moreMenu;
      $('#k-kkm-save', el).onclick = e => withBtn(e.currentTarget, async () => {
        const v = $('#k-kkm', el).value.trim();
        if (!(Number(v) >= 0 && Number(v) <= 100) || v === '') return toast('KKM harus angka 0–100.', 'warn');
        const res = await api('mapelKkm', { id: c.mapel, kkm: v });
        if (!res.success) return toast(res.message, 'bad');
        const row = AppState.boot.mapel.find(x => x[0] === c.mapel); if (row) row[3] = String(res.data.kkm);
        saveBootLocal(); buildMaps(); Store.del(userKey('hasil:' + ujianAktif())); toast(res.message); draw();
      });
      $('#k-copy', el).onclick = copyFrom;
      $('#k-save', el).onclick = e => save(e.currentTarget);
    }
    function moreMenu() {
      const L = openLayer(`<div class="sh-h"><h3 class="grow">Menu Kunci</h3><button class="btn-icon" data-close>${ic('x')}</button></div>
        <button class="li" id="m-paste">${ic('clipboard-paste')}<div class="grow"><div class="nm">Tempel teks kunci</div><div class="sub">Contoh: ABCDA… atau 1.A 2.B 3.C</div></div></button>
        <button class="li" id="m-clear">${ic('rotate-ccw')}<div class="grow"><div class="nm">Kosongkan semua kunci</div></div></button>
        ${sesi ? `<button class="li" id="m-reset">${ic('refresh-cw')}<div class="grow"><div class="nm">Kembalikan ke kunci tersimpan</div></div></button>
        <button class="li" id="m-del" style="color:var(--bad-ink)">${ic('trash-2')}<div class="grow"><div class="nm">Hapus kunci jawaban ini</div><div class="sub">Kunci ${esc(mapelNama(c.mapel))} Kelas ${esc(kelasNama(c.kelas))} dihapus dari server</div></div></button>` : ''}`);
      $('#m-paste', L.el).onclick = () => { L.close(); pasteDlg(); };
      $('#m-clear', L.el).onclick = () => { L.close(); D.kunci = []; persist(); draw(); };
      const r = $('#m-reset', L.el); if (r) r.onclick = () => { L.close(); D = JSON.parse(JSON.stringify(base)); Store.del(dkey); draw(); };
      const dl = $('#m-del', L.el); if (dl) dl.onclick = async () => {
        L.close();
        const res = await deleteFlow({ title: 'Hapus kunci jawaban?', text: 'Kunci ' + mapelNama(c.mapel) + ' Kelas ' + kelasNama(c.kelas) + ' akan dihapus permanen.', action: 'sesiDelete', data: { id: sesi.id } });
        if (!res) return;
        AppState.boot.sesi = AppState.boot.sesi.filter(x => x.id !== sesi.id);
        AppState.boot.hasilIdx = AppState.boot.hasilIdx.filter(x => x[1] !== sesi.id);
        Store.del(dkey); Store.del(userKey('hasil:' + ujianAktif())); saveBootLocal(); buildMaps(); route(true);
      };
    }
    function pasteDlg() {
      const L = openLayer(`<div class="sh-h"><h3 class="grow">Tempel Teks Kunci</h3><button class="btn-icon" data-close>${ic('x')}</button></div>
        <p class="muted" style="margin-bottom:10px">Huruf A–D dibaca berurutan; angka nomor soal diabaikan. Jumlah soal mengikuti jumlah huruf (maks. 50).</p>
        <textarea class="input mono" id="pt" placeholder="ABCDABCDAB…" style="min-height:140px"></textarea>
        <div class="muted small" id="pt-i" style="margin:6px 0 12px">0 huruf terbaca</div>
        <button class="btn btn-primary btn-block" id="pt-ok">Gunakan Kunci Ini</button>`);
      const parse = () => ($('#pt', L.el).value.toUpperCase().replace(/\d+\s*[.)]?/g, ' ').match(/[ABCD]/g) || []).slice(0, 50);
      $('#pt', L.el).oninput = () => $('#pt-i', L.el).textContent = parse().length + ' huruf terbaca';
      $('#pt-ok', L.el).onclick = () => { const a = parse(); if (!a.length) return toast('Tidak ada huruf A–D yang terbaca.', 'warn'); D.kunci = a; D.n = a.length; persist(); L.close(); draw(); toast(a.length + ' kunci ditempel.'); };
    }
    function copyFrom() {
      const seenK = {}, others = (AppState.boot.sesi || []).filter(s => s.ujian === ujianAktif() && s.mapel === c.mapel && s.kelas !== c.kelas && kunciLengkap(s))
        .sort((a, b) => String(b.diubah || '').localeCompare(String(a.diubah || ''))).filter(s => !seenK[s.kelas] && (seenK[s.kelas] = 1));
      const L = openLayer(`<div class="sh-h"><div class="grow"><h3>Salin dari Kelas Lain</h3><p class="muted small">${esc(mapelNama(c.mapel))} · ${esc(ujianAktif())}</p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
        ${others.length ? '<div class="list">' + others.map(s => `<button class="li" data-s="${esc(s.id)}"><span class="avatar sm">${esc(kelasNama(s.kelas))}</span><div class="grow"><div class="nm">Kelas ${esc(kelasNama(s.kelas))}</div><div class="sub mono">${s.n} soal · ${esc(s.kunci.slice(0, 20))}${s.n > 20 ? '…' : ''} · ${s.mode === 'Manual' ? 'bobot manual' : 'bagi rata'}</div></div>${ic('chevron-right')}</button>`).join('') + '</div>'
          : '<div class="empty">' + ic('copy') + '<h3>Belum ada kunci lain</h3><p>Kunci mapel ini di kelas lain belum dibuat.</p></div>'}`);
      $$('[data-s]', L.el).forEach(b => b.onclick = () => {
        const s = others.find(x => x.id === b.dataset.s);
        D = { n: s.n, kunci: s.kunci.split(''), mode: s.mode, bobot: s.bobot ? s.bobot.split(',') : [] }; persist(); L.close(); draw();
        toast('Kunci disalin dari Kelas ' + kelasNama(s.kelas) + '. Jangan lupa Simpan.', 'info');
      });
    }
    async function save(btn) {
      const f = filled();
      if (f < D.n) {
        const first = D.kunci.slice(0, D.n).findIndex((x, i) => !x) + 1 || D.kunci.length + 1;
        toast('Kunci belum lengkap: ' + f + ' dari ' + D.n + ' terisi.', 'warn');
        const r = $('#kq' + first, el); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (D.mode === 'Manual' && D.bobot.slice(0, D.n).some((x, i) => !(Number(x) >= 0) || x === '' || x == null)) return toast('Isi bobot untuk semua soal.', 'warn');
      const payload = { id: sesi && sesi.id, mapel: c.mapel, kelas: c.kelas, n: D.n, kunci: D.kunci.slice(0, D.n).join(''), mode: D.mode, bobot: D.mode === 'Manual' ? D.bobot.slice(0, D.n).join(',') : '' };
      const changed = sesi && (sesi.kunci !== payload.kunci || sesi.mode !== payload.mode || (sesi.bobot || '') !== payload.bobot || sesi.n !== payload.n);
      const nHasil = sesi ? Object.keys(AppState.maps.hasil[sesi.id] || {}).length : 0;
      if (changed && nHasil) {
        const pick = await new Promise(res => {
          const L = openLayer(`<div class="dlg-icon" style="background:var(--primary-soft);color:var(--primary)">${ic('refresh-cw')}</div>
            <h2 style="text-align:center">Kunci berubah</h2><p class="muted" style="text-align:center;margin:8px 0 18px">Sudah ada <b>${nHasil} hasil scan</b> untuk kelas ini. Hitung ulang semua nilai memakai kunci baru? (Memakai jawaban yang sudah tersimpan, tanpa scan ulang.)</p>
            <div class="stack"><button class="btn btn-primary btn-block" data-a="1">${ic('refresh-cw')} Simpan & Hitung Ulang Semua</button><button class="btn btn-soft btn-block" data-a="0">Simpan saja</button><button class="btn btn-ghost btn-block" data-a="x">Batal</button></div>`, { center: true, onClose: v => res(v === undefined ? 'x' : v) });
          $$('[data-a]', L.el).forEach(b => b.onclick = () => L.close(b.dataset.a));
        });
        if (pick === 'x') return;
        payload.recalc = pick === '1';
      }
      await withBtn(btn, async () => {
        const res = await api('sesiSave', payload);
        if (!res.success) return toast(res.message, 'bad', 4000);
        const s = res.data.sesi, list = AppState.boot.sesi, i = list.findIndex(x => x.id === s.id);
        if (i > -1) list[i] = s; else list.push(s);
        Store.del(dkey); saveBootLocal(); buildMaps();
        toast(res.message);
        if (res.data.recalced) { Store.del(userKey('hasil:' + ujianAktif())); swr('boot', 'boot', {}, d => { AppState.boot = d; buildMaps(); }, { force: true }); }
        location.hash = '#/scan';
      });
    }
    draw();
  }
});

/* ======================================================================
   HALAMAN: Scan (daftar siswa + kamera + hasil pemeriksaan)
   ====================================================================== */
registerPage('scan', {
  title: 'Scan Lembar Jawaban', needCtx: true,
  render(el) {
    const c = AppState.ctx, sesi = sesiFor(c.mapel, c.kelas);
    if (!kunciLengkap(sesi)) {
      el.innerHTML = ctxHeader() + `<div class="card empty">${ic('key-round')}<h3>Kunci jawaban belum lengkap</h3><p style="margin-bottom:16px">Isi kunci jawaban ${esc(mapelNama(c.mapel))} Kelas ${esc(kelasNama(c.kelas))} terlebih dahulu sebelum memindai.</p><a class="btn btn-primary" href="#/kunci">${ic('key-round')} Isi Kunci Jawaban</a></div>`;
      bindCtx(el); return;
    }
    let filter = Store.get('scanFilter', 'semua'), q = '';
    const draw = () => {
      const p = progressOf(sesi, c.kelas), H = AppState.maps.hasil[sesi.id] || {}, all = AppState.maps.siswaByKelas[c.kelas] || [];
      const nCek = all.filter(s => H[s.nisn] && H[s.nisn].status === 'Perlu dicek').length;
      const list = all.filter(s => {
        const h = H[s.nisn];
        if (filter === 'belum' && h) return false; if (filter === 'sudah' && !h) return false; if (filter === 'cek' && !(h && h.status === 'Perlu dicek')) return false;
        return !q || s.nama.toLowerCase().includes(q) || s.nisn.includes(q);
      });
      el.innerHTML = ctxHeader() + `
      <div class="card" style="background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 60%,var(--accent-brand)));color:#fff;border:0">
        <div class="row between"><div><div style="opacity:.85;font-size:13px">Progres Kelas ${esc(kelasNama(c.kelas))}</div><div style="font:700 30px var(--font-b)" class="tnum">${p.done}<span style="opacity:.7;font-size:18px"> / ${p.total} lembar</span></div></div>
          <div style="font:700 22px var(--font-b)" class="tnum">${p.pct}%</div></div>
        <div class="progress" style="background:rgba(255,255,255,.25);margin:10px 0 14px"><i style="width:${p.pct}%;background:#fff"></i></div>
        <button class="btn btn-block" id="sc-start" style="background:#fff;color:var(--brand);min-height:54px;font-size:16px">${ic('scan-line')} ${p.belum.length ? 'Mulai Scan' + (p.belum[0] ? ': ' + esc(p.belum[0].nama) : '') : 'Semua sudah di-scan'}</button>
        <div class="row" style="justify-content:center;gap:16px;margin-top:10px;font-size:12.5px;opacity:.9"><span>${sesi.n} soal</span><span>·</span><span>${sesi.mode === 'Manual' ? 'Bobot manual' : 'Bagi rata'}</span><span>·</span><a href="#/kunci" style="color:#fff">Lihat kunci</a><span>·</span><a href="#/template" style="color:#fff">Template LJK</a></div>
      </div>
      <div class="toolbar" style="margin-top:14px"><div class="input-wrap">${ic('search')}<input class="input" id="sc-q" placeholder="Cari nama siswa atau NISN…" value="${esc(q)}"></div><button class="btn btn-outline" id="sc-manual" title="Input jawaban tanpa kamera">${ic('keyboard')} <span>Input Manual</span></button></div>
      <div class="chips" style="margin-bottom:10px">${[['semua', 'Semua', all.length], ['belum', 'Belum', p.belum.length], ['sudah', 'Sudah', p.done], ['cek', 'Perlu dicek', nCek]].map(([k, t, n]) => `<button class="chip pick ${filter === k ? 'on' : ''}" data-f="${k}">${t} <span class="tnum" style="opacity:.75">${n}</span></button>`).join('')}</div>
      <div class="list" id="sc-list">${list.map(s => {
        const h = H[s.nisn];
        const st = !h ? '<span class="chip out">Belum</span>' : h.status === 'Perlu dicek' ? `<span class="chip warn">${ic('triangle-alert')} Cek</span>` : h.pending ? `<span class="chip p">${ic('cloud-upload')} Antre</span>` : `<span class="chip ok">${ic('check')}</span>`;
        return `<button class="li" data-n="${esc(s.nisn)}"><span class="avatar sm" style="${h ? '' : 'background:var(--surface-3);color:var(--muted)'}">${esc(fmt.initials(s.nama))}</span>
          <div class="grow"><div class="nm ellip">${esc(s.nama)}</div><div class="sub mono">${esc(s.nisn)}</div></div>${h ? `<span class="score-pill">${fmt.num(h.nilai)}</span>` : ''}${st}</button>`;
      }).join('') || `<div class="empty">${ic('users')}<h3>${all.length ? 'Tidak ada yang cocok' : 'Belum ada siswa'}</h3><p>${all.length ? 'Ubah filter atau kata kunci.' : 'Minta admin menambahkan data siswa kelas ini.'}</p></div>`}</div>`;
      bindCtx(el);
      $('#sc-manual', el).onclick = () => pickStudent(sesi, n => manualEntry(sesi, n));
      $('#sc-start', el).onclick = () => { const b = progressOf(sesi, c.kelas).belum; if (b.length) openScanner(sesi, b[0].nisn); else toast('Semua siswa sudah di-scan. Ketuk nama untuk scan ulang.', 'info'); };
      $('#sc-q', el).oninput = e => { q = e.target.value.toLowerCase(); const pos = e.target.selectionStart; draw(); const i = $('#sc-q', el); i.focus(); i.setSelectionRange(pos, pos); };
      $$('[data-f]', el).forEach(b => b.onclick = () => { filter = b.dataset.f; Store.set('scanFilter', filter); draw(); });
      $('#sc-list', el).onclick = async e => {
        const b = e.target.closest('[data-n]'); if (!b) return;
        const h = H[b.dataset.n];
        if (h) return openHasilDetail(h.id, { nisn: b.dataset.n, sesi, fromScan: true });
        openScanner(sesi, b.dataset.n);
      };
    };
    draw();
  }
});

async function confirmOverwrite(sesi, nisn) {
  const h = (AppState.maps.hasil[sesi.id] || {})[nisn]; if (!h) return true;
  const s = AppState.maps.siswa.get(nisn);
  return confirmDlg({ title: 'Timpa hasil lama?', html: `<b>${esc(s ? s.nama : nisn)}</b> sudah punya nilai <b class="tnum">${fmt.num(h.nilai)}</b>. Scan ulang akan <b>menimpa</b> hasil sebelumnya.`, ok: 'Ya, scan ulang', cancel: 'Batal', icon: 'refresh-cw' });
}

/* ---------------- Layar kamera ---------------- */
let SC = null;
async function openScanner(sesi, nisn, skipConfirm) {
  if (!skipConfirm && !(await confirmOverwrite(sesi, nisn))) return;
  Beep.unlock();
  const c = AppState.ctx;
  const wrap = document.createElement('div'); wrap.className = 'scanner';
  wrap.innerHTML = `<video playsinline muted></video><canvas class="ov"></canvas>
    <div class="sc-top"><button class="rbtn" id="sx" aria-label="Tutup">${ic('x')}</button><div class="t"><b>Pindai LJK</b><span>OMR AUTO-CAPTURE</span></div>
      <button class="rbtn" id="st" aria-label="Senter">${ic('flashlight')}</button><button class="rbtn" id="ss" aria-label="Suara">${ic(Store.get('sound', true) ? 'volume-2' : 'volume-x')}</button></div>
    <div class="guide" id="sg"><i></i><i></i><i></i><i></i></div>
    <div class="sc-toast" id="sm"><i class="dot"></i><span>Membuka kamera…</span></div>
    <div class="sc-busy" id="sb" hidden><div style="text-align:center"><div class="spin" style="margin:0 auto 12px"></div><b>Membaca jawaban…</b></div></div>
    <div class="sc-bottom" id="sbt"></div>`;
  document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
  SC = { sesi, nisn, wrap, kelas: c.kelas };
  const msg = (t, cls) => { const m = $('#sm', wrap); m.className = 'sc-toast ' + (cls || ''); m.innerHTML = '<i class="dot"></i><span>' + esc(t) + '</span>'; };
  const close = () => { Scanner.stop(); wrap.remove(); document.body.style.overflow = ''; SC = null; route(true); };
  $('#sx', wrap).onclick = close;
  $('#ss', wrap).onclick = () => { const v = !Store.get('sound', true); Store.set('sound', v); $('#ss', wrap).innerHTML = ic(v ? 'volume-2' : 'volume-x'); };
  $('#st', wrap).onclick = async () => { const ok = await Scanner.torch(!Scanner.torchOn); if (!ok) toast('Senter tidak didukung di perangkat/browser ini.', 'warn'); $('#st', wrap).classList.toggle('on', Scanner.torchOn); };
  SC.renderBottom = () => {
    const s = AppState.maps.siswa.get(SC.nisn) || { nama: SC.nisn, nisn: SC.nisn }, p = progressOf(sesi, c.kelas);
    const next = p.belum.find(x => x.nisn !== SC.nisn);
    $('#sbt', wrap).innerHTML = `<div class="grab"></div>
      <div class="row between"><span class="label-sm">Siswa Terpilih</span><span class="chip ok"><i class="status-dot"></i> Siap Koreksi</span></div>
      <div class="row between" style="margin:6px 0 10px"><h2 class="ellip" style="font-style:italic">${esc(s.nama)}</h2><span class="chip out mono">NISN ${esc(s.nisn)}</span></div>
      <div class="chips" style="margin-bottom:12px"><span class="chip p">${ic('book-open')} ${esc(mapelNama(c.mapel))}</span><span class="chip a">${ic('users')} Kelas ${esc(kelasNama(c.kelas))}</span></div>
      <div class="card" style="padding:12px;background:var(--surface-2);border:0"><div class="row between"><span class="row" style="gap:8px">${ic('circle-check')} <b class="tnum">${p.done} / ${p.total}</b> lembar di-scan</span><span class="chip a tnum">${p.pct}%</span></div><div class="progress" style="margin-top:8px"><i style="width:${p.pct}%"></i></div></div>
      <div class="grid2" style="margin-top:12px"><button class="btn btn-soft" id="sgs">${ic('users')} Ganti Siswa</button><button class="btn btn-outline" id="slw">${ic('skip-forward')} Lewati</button></div>
      <p class="muted small row" style="justify-content:center;margin-top:10px">${next ? ic('arrow-right', 'sm') + ' Berikutnya: <b style="color:var(--text)">' + esc(next.nama) + '</b>' : 'Ini siswa terakhir yang belum di-scan'}</p>`;
    $('#sgs', wrap).onclick = () => pickStudent(sesi, async n => { if (!(await confirmOverwrite(sesi, n))) return; SC.nisn = n; SC.renderBottom(); Scanner.resume(); });
    $('#slw', wrap).onclick = () => { if (next) { SC.nisn = next.nisn; SC.renderBottom(); Scanner.resume(true); } else toast('Tidak ada siswa lain yang belum di-scan.', 'info'); };
  };
  SC.renderBottom();
  try {
    await Scanner.start($('video', wrap), $('canvas.ov', wrap), {
      onState: (st, prog) => {
        $('#sg', wrap).style.opacity = st === 'search' || st === 'swap' ? 1 : 0.25;
        if (st === 'swap') msg('Ganti dengan lembar ' + ((AppState.maps.siswa.get(SC.nisn) || {}).nama || 'berikutnya') + '…', 'live');
        else if (st === 'search') msg('Arahkan kamera ke lembar jawaban — 4 kotak hitam terlihat');
        else if (st === 'hold') msg('Terdeteksi, tahan sebentar…', 'live');
        else msg('Mengambil gambar…', 'live');
      },
      onBusy: b => { $('#sb', wrap).hidden = !b; },
      onError: m => msg(m, 'err'),
      onResult: r => onScanResult(r)
    });
    if (!Scanner.hasTorch()) $('#st', wrap).style.opacity = .45;
  } catch (e) {
    msg(e.message, 'err');
    $('#sbt', wrap).insertAdjacentHTML('afterbegin', `<div class="info bad" style="margin-bottom:12px">${ic('camera')}<div>${esc(e.message)}</div></div>`);
  }
}
function pickStudent(sesi, cb) {
  const list = AppState.maps.siswaByKelas[AppState.ctx.kelas] || [], H = AppState.maps.hasil[sesi.id] || {};
  const L = openLayer(`<div class="sh-h"><h3 class="grow">Pilih Siswa</h3><button class="btn-icon" data-close>${ic('x')}</button></div>
    <div class="input-wrap" style="margin-bottom:10px">${ic('search')}<input class="input" id="ps-q" placeholder="Cari nama atau NISN…"></div><div class="list" id="ps-l"></div>`);
  const draw = q => { $('#ps-l', L.el).innerHTML = list.filter(s => !q || s.nama.toLowerCase().includes(q) || s.nisn.includes(q)).map(s => `<button class="li" data-n="${esc(s.nisn)}"><span class="avatar sm">${esc(fmt.initials(s.nama))}</span><div class="grow"><div class="nm">${esc(s.nama)}</div><div class="sub mono">${esc(s.nisn)}</div></div>${H[s.nisn] ? '<span class="chip ok tnum">' + fmt.num(H[s.nisn].nilai) + '</span>' : '<span class="chip out">Belum</span>'}</button>`).join(''); };
  draw(''); $('#ps-q', L.el).oninput = e => draw(e.target.value.toLowerCase());
  $('#ps-l', L.el).onclick = e => { const b = e.target.closest('[data-n]'); if (b) { L.close(); cb(b.dataset.n); } };
}

/* ---------------- Hasil pemeriksaan setelah scan ---------------- */
async function onScanResult(r) {
  if (!SC) return;
  if (SC.lastJawaban && SC.lastNisn !== SC.nisn && r.jawaban === SC.lastJawaban && /[ABCD]/.test(r.jawaban)) {
    Beep.play('warn');
    const prev = (AppState.maps.siswa.get(SC.lastNisn) || {}).nama || 'siswa sebelumnya', cur = (AppState.maps.siswa.get(SC.nisn) || {}).nama || SC.nisn;
    const go = await confirmDlg({ title: 'Lembar yang sama?', html: `Jawaban yang terbaca <b>persis sama</b> dengan lembar <b>${esc(prev)}</b>. Pastikan kertas sudah diganti dengan milik <b>${esc(cur)}</b>.`, ok: 'Tetap simpan untuk ' + cur, cancel: 'Scan ulang' });
    if (!go) { Scanner.resume(true); return; }
  }
  const sesi = SC.sesi, kunci = sesi.kunci, n = sesi.n;
  const R = { idScan: 'H' + uuid().replace(/-/g, '').slice(0, 12).toUpperCase(), jawaban: r.jawaban, res: r, warpedImg: r.warpedImg, status: '' };
  const sc = OMR.score(r.jawaban.slice(0, n), kunci, sesi.mode, sesi.bobot ? sesi.bobot.split(',') : null);
  Beep.play(sc.ragu ? 'warn' : 'ok');
  R.status = sc.ragu ? 'Perlu dicek' : 'OK';
  persistScan(R, true);
  showScanResult(R);
}
/** Simpan ke antrean (langsung terkirim bila online) + perbarui indeks lokal. */
function persistScan(R, withPhoto) { saveHasil(SC.sesi, SC.nisn, R, withPhoto); }
function saveHasil(sesi, nisn, R, withPhoto) {
  const n = sesi.n;
  const sc = OMR.score(R.jawaban.slice(0, n), sesi.kunci, sesi.mode, sesi.bobot ? sesi.bobot.split(',') : null);
  R.score = sc;
  const data = { idScan: R.idScan, idSesi: sesi.id, nisn, jawaban: R.jawaban, status: R.status === 'Dikoreksi manual' ? 'Dikoreksi manual' : '', waktu: new Date().toISOString(), local: { nilai: sc.nilai, status: R.status } };
  AppState.pending = (AppState.pending || []).filter(x => !(x.action === 'hasilSave' && x.data.idSesi === sesi.id && x.data.nisn === nisn));
  AppState.pending.push({ action: 'hasilSave', data });
  buildMaps();
  Outbox.add('hasilSave', data);
  if (withPhoto && AppState.boot.settings.simpan_foto === 'Ya' && R.warpedImg) {
    const foto = compressSheet(R.warpedImg);
    setTimeout(() => Outbox.add('fotoUpload', { idScan: R.idScan, data: foto }), 50);
  }
}
/** Input jawaban manual tanpa kamera (mis. lembar rusak / kamera bermasalah). */
async function manualEntry(sesi, nisn) {
  if (!(await confirmOverwrite(sesi, nisn))) return;
  const s = AppState.maps.siswa.get(nisn) || { nama: nisn, nisn }, n = sesi.n, arr = Array(50).fill('-');
  const fp = document.createElement('div'); fp.className = 'fullpage'; document.body.appendChild(fp);
  fp.innerHTML = `<header class="topbar"><button class="btn-icon" data-x aria-label="Tutup">${ic('x')}</button><div class="grow"><div class="t1 ellip">Input Manual · ${esc(s.nama)}</div><div class="t2">${esc(mapelNama(sesi.mapel))} · Kelas ${esc(kelasNama(sesi.kelas))} · ${n} soal</div></div></header>
    <div class="content" style="max-width:640px"><div class="info" style="margin-bottom:12px">${ic('keyboard')}<div>Ketuk jawaban siswa sesuai lembarnya. Biarkan <b>–</b> bila soal tidak dijawab. Nilai dihitung otomatis.</div></div>
    <div id="me-rows">${Array.from({ length: n }, (_, i) => `<div class="krow" data-i="${i}"><div class="no tnum">${String(i + 1).padStart(2, '0')}</div><div class="opts">${'ABCD'.split('').map(o => `<button class="opt" data-o="${o}">${o}</button>`).join('')}<button class="opt on" data-o="-" aria-label="Kosong">–</button></div></div>`).join('')}</div></div>
    <div class="fp-act"><div class="grow"><div class="small muted">Nilai sementara</div><b class="tnum" id="me-v" style="font:700 22px var(--font-b)">0</b></div><button class="btn btn-primary" id="me-save" style="flex:1.4">${ic('save')} <span>Simpan Nilai</span></button></div>`;
  const upd = () => { $('#me-v', fp).textContent = fmt.num(OMR.score(arr.join('').slice(0, n), sesi.kunci, sesi.mode, sesi.bobot ? sesi.bobot.split(',') : null).nilai); };
  $('#me-rows', fp).onclick = e => { const b = e.target.closest('.opt'); if (!b) return; const row = b.closest('.krow'); arr[+row.dataset.i] = b.dataset.o; $$('.opt', row).forEach(x => x.classList.toggle('on', x === b)); upd(); };
  $('[data-x]', fp).onclick = () => fp.remove();
  $('#me-save', fp).onclick = e => withBtn(e.currentTarget, async () => {
    const R = { idScan: 'H' + uuid().replace(/-/g, '').slice(0, 12).toUpperCase(), jawaban: arr.join(''), status: 'Dikoreksi manual' };
    saveHasil(sesi, nisn, R, false);
    fp.remove(); toast('Nilai ' + s.nama + ' tersimpan: ' + fmt.num(R.score.nilai)); route(true);
  });
}
function showScanResult(R) {
  const sesi = SC.sesi, n = sesi.n, s = AppState.maps.siswa.get(SC.nisn) || { nama: SC.nisn, nisn: SC.nisn };
  const fp = document.createElement('div'); fp.className = 'fullpage'; SC.wrap.appendChild(fp);
  const draw = () => {
    const sc = R.score, kkm = kkmOf(sesi.mapel), ragu = [];
    for (let i = 0; i < n; i++) if (R.jawaban[i] === '*') ragu.push(i + 1);
    const p = progressOf(sesi, AppState.ctx.kelas), next = p.belum.find(x => x.nisn !== SC.nisn);
    const canvas = document.createElement('canvas'); drawMarkedSheet(canvas, R.warpedImg, R.res, sesi.kunci);
    const img = canvas.toDataURL('image/jpeg', 0.8);
    fp.innerHTML = `<header class="topbar"><button class="btn-icon" id="rb-back" aria-label="Kembali">${ic('arrow-left')}</button><div class="grow"><div class="t1">Hasil Pemeriksaan</div><div class="t2">${esc(AppState.boot.settings.nama_sekolah)}</div></div></header>
    <div class="content" style="max-width:640px">
      <div class="info ${ragu.length ? 'warn' : 'ok'}" style="font-size:14px">${ic(ragu.length ? 'triangle-alert' : 'circle-check')}<div class="grow"><b style="font:700 16px var(--font-h)">${ragu.length ? 'Scan berhasil, ada yang perlu dicek' : 'Scan berhasil, hasil tersimpan'}</b><br><span class="muted">Dibaca otomatis dalam ${fmt.num((R.res.ms || 0) / 1000, 1)} detik</span></div><span class="chip ${R.status === 'Dikoreksi manual' ? 'p' : 'a'}">${R.status === 'Dikoreksi manual' ? 'Manual' : 'Otomatis'}</span></div>
      <div class="card" style="margin-top:12px"><div class="row" style="gap:14px"><span class="avatar" style="width:56px;height:56px;font-size:18px">${esc(fmt.initials(s.nama))}</span>
        <div class="grow"><h2 class="ellip">${esc(s.nama)}</h2><div class="muted small mono">NISN ${esc(s.nisn)} · ${esc(mapelNama(sesi.mapel))}</div>
        <div class="row" style="gap:6px;margin-top:6px"><span class="chip">Kelas ${esc(kelasNama(sesi.kelas))}</span><span class="chip out">${ic('history')} ${fmt.time(new Date())}</span></div></div></div></div>
      <div class="card"><div class="row between"><h3>Ringkasan Nilai</h3><span class="chip ${sc.nilai >= kkm ? 'a' : 'bad'}">${ic(sc.nilai >= kkm ? 'circle-check' : 'circle-x')} KKM ${kkm} (${sc.nilai >= kkm ? 'Lulus' : 'Belum'})</span></div>
        ${ringHtml(sc.nilai)}
        <div class="counts"><div style="background:var(--accent-soft);color:var(--accent-ink)">${ic('circle-check')}<div><b class="tnum">${sc.benar}</b>Benar</div></div>
          <div style="background:var(--bad-soft);color:var(--bad-ink)">${ic('circle-x')}<div><b class="tnum">${sc.salah}</b>Salah</div></div>
          <div style="background:var(--surface-3);color:var(--muted)">${ic('circle-minus')}<div><b class="tnum" style="color:var(--text)">${sc.kosong - sc.ragu}</b>Kosong</div></div></div></div>
      ${ragu.length ? `<div class="card" style="background:var(--warn-soft);border-color:transparent"><div class="row" style="gap:12px"><span class="stat" style="padding:10px;margin:0;background:rgba(0,0,0,.06);color:var(--warn-ink)">${ic('triangle-alert')}</span>
        <div class="grow"><b style="font:700 16px var(--font-h)">${ragu.length} Soal Perlu Dicek</b><div class="small">No. ${ragu.join(', ')} — tanda ganda/coretan tidak jelas</div></div><button class="btn" id="rb-rev" style="background:var(--warn-ink);color:#fff">${ic('eye')} Tinjau</button></div></div>` : ''}
      <div class="card"><div class="row between"><h3>Peta Jawaban</h3><span class="muted small">${n} soal · ketuk untuk koreksi</span></div><div style="margin-top:12px">${answerMap(R.jawaban, sesi.kunci)}</div></div>
      <div class="card"><div class="row between" style="margin-bottom:10px"><h3>Lembar Terbaca</h3><span class="muted small">hijau = benar, merah = salah</span></div><img class="sheet-img" id="rb-img" src="${img}" alt="Lembar jawaban dengan tanda koreksi"></div>
    </div>
    <div class="fp-act"><button class="btn btn-soft" id="rb-again">${ic('camera')} Scan Ulang</button><button class="btn btn-primary grow" id="rb-next">${next ? `<span class="ellip">Lanjut: ${esc(next.nama)}</span> ${ic('arrow-right')}` : ic('check') + ' Selesai'}</button></div>`;
    $('#rb-img', fp).onclick = () => zoomImage(img);
    $('#rb-back', fp).onclick = () => { fp.remove(); Scanner.resume(); };
    $('#rb-again', fp).onclick = () => { fp.remove(); Scanner.resume(); };
    $('#rb-next', fp).onclick = () => {
      fp.remove();
      if (next) { SC.lastJawaban = R.jawaban; SC.lastNisn = SC.nisn; SC.nisn = next.nisn; SC.renderBottom(); Scanner.resume(true); }
      else { $('#sx', SC.wrap).click(); toast('Semua siswa kelas ini sudah di-scan. 🎉'); }
    };
    const rv = $('#rb-rev', fp); if (rv) rv.onclick = () => reviewDlg(R, ragu, () => { R.status = 'Dikoreksi manual'; persistScan(R, false); draw(); toast('Koreksi tersimpan.'); });
    $('.amap', fp).onclick = e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      editAnswer(+b.dataset.q, R.jawaban, sesi.kunci, R, a => { R.jawaban = a; R.status = 'Dikoreksi manual'; persistScan(R, false); draw(); toast('Jawaban no. ' + b.dataset.q + ' dikoreksi.'); });
    };
  };
  draw();
}
function ringHtml(v) {
  const r = 78, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(100, v)) / 100);
  return `<div class="ring"><svg width="180" height="180" viewBox="0 0 180 180"><circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="14"/>
    <circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--primary)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .6s"/></svg>
    <div class="c"><div><b>${fmt.num(v)}</b><span class="muted small">Nilai Akhir</span><div class="small" style="color:var(--primary);font-weight:600">Skala 100</div></div></div></div>`;
}
function answerMap(jawaban, kunci) {
  const n = kunci.length; let cells = '', b = 0, s = 0, r = 0, k = 0;
  for (let i = 0; i < 50; i++) {
    const no = String(i + 1).padStart(2, '0');
    if (i >= n) { cells += `<button class="x" disabled>${no}</button>`; continue; }
    const a = jawaban[i] || '-';
    if (a === kunci[i]) { b++; cells += `<button class="b" data-q="${i + 1}">${no}${ic('check')}</button>`; }
    else if (a === '*') { r++; cells += `<button class="r" data-q="${i + 1}">${no}${ic('circle-help')}</button>`; }
    else if (a === '-') { k++; cells += `<button class="k" data-q="${i + 1}">${no}${ic('minus')}</button>`; }
    else { s++; cells += `<button class="s" data-q="${i + 1}">${no}${ic('x')}</button>`; }
  }
  return `<div class="amap">${cells}</div><div class="legend"><span><i style="background:var(--accent-soft)"></i>Benar (${b})</span><span><i style="background:var(--bad-soft)"></i>Salah (${s})</span><span><i style="background:var(--warn-soft)"></i>Perlu cek (${r})</span><span><i style="background:var(--surface-3)"></i>Kosong (${k})</span></div>`;
}
function editAnswer(q, jawaban, kunci, R, onSave) {
  const a = jawaban[q - 1] || '-', crop = R && R.warpedImg ? cropQuestion(R.warpedImg, R.res, q) : '';
  const L = openLayer(`<div class="sh-h"><div class="grow"><h3>Soal No. ${q}</h3><p class="muted small">Terbaca: <b>${a === '*' ? 'tidak pasti' : a === '-' ? 'kosong' : a}</b> · Kunci: <b style="color:var(--ok-ink)">${kunci[q - 1]}</b></p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
    ${crop ? `<img src="${crop}" style="width:100%;border-radius:12px;border:1px solid var(--border);margin-bottom:12px" alt="Potongan soal ${q}">` : ''}
    <p class="label-sm" style="margin-bottom:8px">Pilih jawaban siswa</p>
    <div class="row" style="gap:10px;justify-content:center">${'ABCD'.split('').map(o => `<button class="opt ${a === o ? 'on' : ''} ${kunci[q - 1] === o ? 'key' : ''}" data-o="${o}" style="width:56px;height:56px;font-size:18px">${o}</button>`).join('')}
      <button class="opt ${a === '-' ? 'on' : ''}" data-o="-" style="width:auto;padding:0 16px;height:56px;border-radius:28px">Kosong</button></div>`);
  $$('[data-o]', L.el).forEach(b => b.onclick = () => { const arr = jawaban.split(''); while (arr.length < 50) arr.push('-'); arr[q - 1] = b.dataset.o; L.close(); onSave(arr.join('')); });
}
function reviewDlg(R, list, onDone) {
  const sesi = SC.sesi, arr = R.jawaban.split(''), pick = {};
  const L = openLayer(`<div class="sh-h"><div class="grow"><h3>Tinjau ${list.length} Soal</h3><p class="muted small">Lihat potongan lembar, lalu pilih jawaban yang dimaksud siswa.</p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
    ${list.map(q => `<div class="card" style="padding:12px"><div class="row between" style="margin-bottom:8px"><b>No. ${q}</b><span class="muted small">Kunci: <b style="color:var(--ok-ink)">${sesi.kunci[q - 1]}</b></span></div>
      <img src="${cropQuestion(R.warpedImg, R.res, q)}" style="width:100%;border-radius:10px;border:1px solid var(--border)" alt="Soal ${q}">
      <div class="row" style="gap:8px;margin-top:10px;justify-content:center" data-q="${q}">${'ABCD'.split('').map(o => `<button class="opt" data-o="${o}">${o}</button>`).join('')}<button class="opt" data-o="-" style="width:auto;padding:0 14px;border-radius:22px">Kosong</button></div></div>`).join('')}
    <button class="btn btn-primary btn-block" id="rv-ok" style="margin-top:12px">${ic('save')} Simpan Hasil Tinjauan</button>`);
  L.el.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (!b) return; const row = b.parentElement, q = +row.dataset.q; pick[q] = b.dataset.o; $$('.opt', row).forEach(x => x.classList.toggle('on', x === b)); });
  $('#rv-ok', L.el).onclick = () => {
    const miss = list.filter(q => !pick[q]);
    if (miss.length) return toast('Pilih jawaban untuk no. ' + miss.join(', '), 'warn');
    list.forEach(q => arr[q - 1] = pick[q]); R.jawaban = arr.join(''); L.close(); onDone();
  };
}

/* ======================================================================
   HALAMAN: Hasil & Dashboard statistik
   ====================================================================== */
function ujianList() { const s = new Set([ujianAktif()]); (AppState.boot.sesi || []).forEach(x => s.add(x.ujian)); return [...s]; }
function hasilFilter() { const f = Store.get(userKey('hf'), null) || {}; if (!f.ujian) f.ujian = ujianAktif(); if (f.mapel === undefined) f.mapel = AppState.ctx ? AppState.ctx.mapel : ''; if (f.kelas === undefined) f.kelas = ''; return f; }
function sesiMapAll() { const m = {}; (AppState.boot.sesi || []).forEach(s => m[s.id] = s); return m; }
function filterRows(rows, f) { return rows.filter(r => (!f.mapel || r.mapel === f.mapel) && (!f.kelas || r.kelas === f.kelas)); }

function renderHasilPage(el, tab) {
  let f = hasilFilter(), data = null, status = 'semua', q = '';
  const filtersHtml = () => `<div class="filters">
    <select class="input" id="hf-u">${ujianList().map(u => `<option ${u === f.ujian ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
    <select class="input" id="hf-m"><option value="">Semua Mapel</option>${myMapel().map(m => `<option value="${esc(m.id)}" ${m.id === f.mapel ? 'selected' : ''}>${esc(m.nama)}</option>`).join('')}</select>
    <select class="input" id="hf-k"><option value="">Semua Kelas</option>${myKelas().map(k => `<option value="${esc(k.id)}" ${k.id === f.kelas ? 'selected' : ''}>Kelas ${esc(k.nama)}</option>`).join('')}</select></div>`;
  const shell = () => {
    el.innerHTML = `<div class="page-h"><div class="grow"><h1>${tab === 'daftar' ? 'Hasil Koreksi' : 'Dashboard'}</h1><p class="muted">${isAdmin() ? 'Semua data sekolah' : 'Data milik Anda'}</p></div>
      <button class="btn-icon solid" id="h-ref" aria-label="Segarkan">${ic('refresh-cw')}</button></div>
      <div class="seg" style="margin-bottom:12px;max-width:420px"><button data-t="ringkasan" class="${tab !== 'daftar' ? 'on' : ''}">${ic('chart-column', 'sm')} Ringkasan</button><button data-t="daftar" class="${tab === 'daftar' ? 'on' : ''}">${ic('list', 'sm')} Daftar Nilai</button></div>
      ${filtersHtml()}<div id="h-body"><div class="skel" style="height:110px"></div><div class="skel" style="height:220px;margin-top:12px"></div></div>`;
    $$('[data-t]', el).forEach(b => b.onclick = () => { location.hash = isAdmin() && b.dataset.t === 'ringkasan' ? '#/dashboard' : '#/hasil/' + b.dataset.t; });
    const onF = () => { f = { ujian: $('#hf-u', el).value, mapel: $('#hf-m', el).value, kelas: $('#hf-k', el).value }; Store.set(userKey('hf'), f); load(); };
    ['#hf-u', '#hf-m', '#hf-k'].forEach(s => $(s, el).onchange = onF);
    $('#h-ref', el).onclick = e => withBtn(e.currentTarget, () => load(true));
  };
  const body = () => {
    if (!data) return;
    const rows = filterRows(data.rows, f), B = $('#h-body', el); if (!B) return;
    if (tab === 'daftar') renderDaftar(B, rows, f, { status, q, set: (k, v) => { if (k === 'status') status = v; else q = v; body(); } });
    else renderRingkasan(B, rows, f);
  };
  const load = force => swr('hasil:' + f.ujian, 'hasilList', { ujian: f.ujian }, d => { data = d; body(); }, {
    fresh: force ? 0 : 30000, force: !!force,
    onError: res => { const B = $('#h-body', el); if (B) B.innerHTML = `<div class="card empty">${ic('wifi-off')}<h3>Gagal memuat data</h3><p style="margin-bottom:12px">${esc(res.message)}</p><button class="btn btn-primary" id="h-retry">Coba lagi</button></div>`; const r = $('#h-retry', el); if (r) r.onclick = () => load(true); }
  });
  shell(); load();
}
registerPage('hasil', { title: 'Hasil', render(el, p) { renderHasilPage(el, p === 'daftar' ? 'daftar' : (isAdmin() && !p ? 'daftar' : (p || 'ringkasan'))); } });
registerPage('dashboard', { title: 'Dashboard', admin: true, render(el) { renderHasilPage(el, 'ringkasan'); } });

/** Statistik butir: per nomor soal → benar/salah/kosong + sebaran A–D. */
function itemStats(rows) {
  const S = sesiMapAll(), out = [];
  rows.forEach(r => {
    const s = S[r.sesi]; if (!s) return;
    for (let i = 0; i < s.n; i++) {
      const o = out[i] = out[i] || { q: i + 1, total: 0, benar: 0, salah: 0, kosong: 0, dist: { A: 0, B: 0, C: 0, D: 0 }, kunci: {} };
      const a = (r.j || '')[i] || '-', k = s.kunci[i];
      o.total++; o.kunci[k] = (o.kunci[k] || 0) + 1;
      if (a === k) o.benar++; else if (a === '-' || a === '*') o.kosong++; else o.salah++;
      if (o.dist[a] !== undefined) o.dist[a]++;
    }
  });
  return out.filter(Boolean).map(o => Object.assign(o, { pb: o.total ? o.benar / o.total * 100 : 0, ps: o.total ? o.salah / o.total * 100 : 0, key: Object.keys(o.kunci).sort((a, b) => o.kunci[b] - o.kunci[a])[0] }));
}
function renderRingkasan(B, rows, f) {
  const kkm = f.mapel ? kkmOf(f.mapel) : kkmDefault(), n = rows.length, avg = n ? rows.reduce((s, r) => s + r.nilai, 0) / n : 0;
  const tuntas = rows.filter(r => r.nilai >= kkmOf(r.mapel)).length;
  const cek = rows.filter(r => r.status === 'Perlu dicek').length;
  const byK = {}; rows.forEach(r => { (byK[r.kelas] = byK[r.kelas] || []).push(r.nilai); });
  const kelasAvg = Object.keys(byK).map(k => ({ k, nama: kelasNama(k), avg: byK[k].reduce((s, x) => s + x, 0) / byK[k].length, n: byK[k].length })).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }));
  const items = f.mapel ? itemStats(rows) : [];
  const worst = items.filter(o => o.salah > 0).sort((a, b) => b.ps - a.ps).slice(0, 10), best = items.filter(o => o.benar > 0).sort((a, b) => b.pb - a.pb).slice(0, 10);
  const maxBar = 100;
  B.innerHTML = `<div class="stats">
      <div class="stat"><div class="ic">${ic('clipboard-check')}</div><div class="muted small">Lembar Terkoreksi</div><div class="v">${n}</div></div>
      <div class="stat"><div class="ic" style="background:var(--accent-soft);color:var(--accent-ink)">${ic('trending-up')}</div><div class="muted small">Rata-rata Nilai</div><div class="v">${fmt.num(avg)}</div><div class="small" style="color:${avg >= kkm ? 'var(--ok-ink)' : 'var(--bad-ink)'}">${f.mapel ? 'KKM ' + kkm : 'KKM per mapel'} · tuntas ${tuntas}/${n}${n ? ' (' + Math.round(tuntas / n * 100) + '%)' : ''}</div></div>
      <div class="stat"><div class="ic" style="background:var(--warn-soft);color:var(--warn-ink)">${ic('triangle-alert')}</div><div class="muted small">Perlu Dicek</div><div class="v">${cek}</div>${cek ? '<a class="small" href="#/hasil/daftar" id="go-cek">Lihat daftar →</a>' : '<div class="small muted">Semua jelas</div>'}</div></div>
    <div class="card" style="margin-top:12px"><div class="card-h"><div><h3>Rata-rata Nilai per Kelas</h3><p class="muted small">${f.mapel ? esc(mapelNama(f.mapel)) + ' · garis putus = KKM ' + kkm : 'Semua mapel · garis putus = KKM bawaan ' + kkm}</p></div><button class="btn-icon solid" data-tbl="t1" aria-label="Tampilkan tabel">${ic('table')}</button></div>
      ${kelasAvg.length ? `<div class="vbars">${kelasAvg.map(x => `<div class="vbar ${x.avg < kkm ? 'low' : ''}" title="Kelas ${esc(x.nama)}: ${fmt.num(x.avg)}"><b>${x.avg < kkm ? '! ' : ''}${fmt.num(x.avg)}</b><i style="height:${Math.max(4, x.avg / maxBar * 130)}px"></i><span>${esc(x.nama)}</span></div>`).join('')}
        <div class="kkm-line" style="bottom:${24 + kkm / maxBar * 130}px"><span>KKM ${kkm}</span></div></div>
        <div class="row between small" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><span class="row" style="gap:6px">${ic('circle-check', 'sm')} ${kelasAvg.filter(x => x.avg >= kkm).length} dari ${kelasAvg.length} kelas mencapai KKM</span></div>
        <div id="t1" hidden style="margin-top:10px">${tableHtml(['Kelas', 'Lembar', 'Rata-rata'], kelasAvg.map(x => [x.nama, x.n, fmt.num(x.avg)]))}</div>`
      : '<div class="empty">' + ic('chart-column') + '<p>Belum ada data untuk filter ini.</p></div>'}</div>
    ${f.mapel ? `
    <div class="card"><div class="card-h"><div><h3><span style="color:var(--bad)">●</span> Soal Paling Sering Salah</h3><p class="muted small">10 teratas · % siswa memilih jawaban lain</p></div><button class="btn-icon solid" data-tbl="t2" aria-label="Tabel">${ic('table')}</button></div>
      ${worst.length ? worst.map(o => hbar(o, 'bad')).join('') : '<p class="muted">Belum ada soal yang dijawab salah. 🎉</p>'}<div id="t2" hidden style="margin-top:10px">${itemTable(worst)}</div></div>
    <div class="card"><div class="card-h"><div><h3><span style="color:var(--accent)">●</span> Soal Paling Sering Benar</h3><p class="muted small">10 teratas · % siswa menjawab benar</p></div><button class="btn-icon solid" data-tbl="t3" aria-label="Tabel">${ic('table')}</button></div>
      ${best.length ? best.map(o => hbar(o, 'good')).join('') : '<p class="muted">Belum ada data.</p>'}<div id="t3" hidden style="margin-top:10px">${itemTable(best)}</div></div>`
      : `<div class="card info" style="margin-top:12px">${ic('info')}<div><b>Analisis butir soal</b><br>Pilih satu <b>mapel</b> pada filter di atas untuk melihat soal yang paling sering salah & benar.</div></div>`}
    <div class="card row" style="gap:12px"><span class="stat" style="padding:10px;margin:0">${ic('download')}</span><div class="grow"><h3>Ekspor Rekap</h3><p class="muted small">Excel (.xlsx) & PDF · nilai, belum di-scan, analisis butir</p></div><button class="btn btn-soft" id="r-exp">${ic('download')} Unduh</button></div>`;
  $$('[data-tbl]', B).forEach(b => b.onclick = () => { const t = $('#' + b.dataset.tbl, B); t.hidden = !t.hidden; });
  $$('.hbar', B).forEach(h => h.onclick = () => itemDetail(items.find(o => o.q === +h.dataset.q), rows));
  $('#r-exp', B).onclick = () => exportMenu(rows, f);
  const gc = $('#go-cek', B); if (gc) gc.onclick = () => Store.set('hStatus', 'cek');
}
const hbar = (o, cls) => `<div class="hbar ${cls}" data-q="${o.q}"><div class="top"><span class="q">No. ${String(o.q).padStart(2, '0')}</span><span class="muted">kunci ${o.key}</span><span class="pct">${fmt.num(cls === 'bad' ? o.ps : o.pb, 0)}% <span class="muted" style="font-weight:400">(${cls === 'bad' ? o.salah : o.benar} siswa)</span></span></div><div class="bar"><i style="width:${cls === 'bad' ? o.ps : o.pb}%"></i></div></div>`;
const tableHtml = (h, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => '<tr>' + r.map(v => `<td class="${typeof v === 'number' || /^[\d.,%]+$/.test(v) ? 'n' : ''}">${esc(v)}</td>`).join('') + '</tr>').join('')}</tbody></table></div>`;
const itemTable = list => tableHtml(['No', 'Kunci', '% Benar', '% Salah', 'Kosong', 'A', 'B', 'C', 'D'], list.map(o => [o.q, o.key, fmt.num(o.pb, 0) + '%', fmt.num(o.ps, 0) + '%', o.kosong, o.dist.A, o.dist.B, o.dist.C, o.dist.D]));
function itemDetail(o, rows) {
  if (!o) return;
  const max = Math.max(1, ...Object.values(o.dist), o.kosong);
  openLayer(`<div class="sh-h"><div class="grow"><h3>Detail Soal No. ${o.q}</h3><p class="muted small">${o.total} siswa ter-scan · kunci <b style="color:var(--ok-ink)">${o.key}</b></p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
    <div class="grid2" style="margin-bottom:12px"><div class="stat"><div class="muted small">% Benar</div><div class="v" style="color:var(--ok-ink)">${fmt.num(o.pb, 0)}%</div></div><div class="stat"><div class="muted small">% Salah</div><div class="v" style="color:var(--bad-ink)">${fmt.num(o.ps, 0)}%</div></div></div>
    <p class="label-sm" style="margin-bottom:6px">Sebaran pilihan</p>
    ${['A', 'B', 'C', 'D'].map(k => `<div class="hbar ${k === o.key ? 'good' : ''}" style="cursor:default"><div class="top"><span class="q" style="${k === o.key ? 'background:var(--ok);color:#fff' : ''}">${k}</span>${k === o.key ? '<span class="chip ok" style="height:22px">Kunci</span>' : ''}<span class="pct">${o.dist[k]} siswa</span></div><div class="bar"><i style="width:${o.dist[k] / max * 100}%;background:${k === o.key ? 'var(--ok)' : 'var(--primary)'}"></i></div></div>`).join('')}
    <div class="hbar" style="cursor:default"><div class="top"><span class="q">—</span><span class="muted">Tidak menjawab / tidak jelas</span><span class="pct">${o.kosong} siswa</span></div><div class="bar"><i style="width:${o.kosong / max * 100}%;background:var(--muted)"></i></div></div>`);
}

function renderDaftar(B, rows, f, st) {
  if (Store.get('hStatus', null)) { st.status = Store.get('hStatus'); Store.del('hStatus'); }
  const list = rows.filter(r => (st.status === 'semua' || (st.status === 'cek' ? r.status === 'Perlu dicek' : st.status === 'manual' ? r.status === 'Dikoreksi manual' : r.status === 'OK')) && (!st.q || r.nama.toLowerCase().includes(st.q) || r.nisn.includes(st.q)))
    .sort((a, b) => kelasNama(a.kelas).localeCompare(kelasNama(b.kelas), 'id', { numeric: true }) || a.nama.localeCompare(b.nama));
  const pend = (AppState.pending || []).filter(x => x.action === 'hasilSave').length;
  const chip = s => s === 'Perlu dicek' ? `<span class="chip warn">${ic('triangle-alert')} Perlu dicek</span>` : s === 'Dikoreksi manual' ? `<span class="chip p">${ic('pencil')} Manual</span>` : `<span class="chip ok">${ic('check')} OK</span>`;
  B.innerHTML = `${pend ? `<div class="info" style="margin-bottom:10px">${ic('cloud-upload')}<div>${pend} hasil scan sedang dikirim dari HP ini dan akan muncul setelah terkirim.</div></div>` : ''}
    <div class="toolbar"><div class="input-wrap">${ic('search')}<input class="input" id="d-q" placeholder="Cari nama atau NISN…" value="${esc(st.q)}"></div>
      <button class="btn btn-soft" id="d-exp">${ic('download')} <span>Unduh Excel/PDF</span></button></div>
    <div class="chips" style="margin-bottom:12px">${[['semua', 'Semua', rows.length], ['ok', 'OK', rows.filter(r => r.status === 'OK').length], ['cek', 'Perlu dicek', rows.filter(r => r.status === 'Perlu dicek').length], ['manual', 'Dikoreksi manual', rows.filter(r => r.status === 'Dikoreksi manual').length]].map(([k, t, n]) => `<button class="chip pick ${st.status === k ? 'on' : ''}" data-s="${k}">${t} <span class="tnum" style="opacity:.7">${n}</span></button>`).join('')}</div>
    <div class="hide-desk list">${list.map(r => `<button class="li" data-id="${esc(r.id)}"><span class="avatar sm">${esc(fmt.initials(r.nama))}</span><div class="grow"><div class="nm ellip">${esc(r.nama)}</div><div class="sub">${esc(kelasNama(r.kelas))} · ${esc(mapelNama(r.mapel))} · <span class="tnum">${r.b}B ${r.s}S ${r.k}K</span></div><div style="margin-top:4px">${chip(r.status)}</div></div><span class="score-pill" style="font-size:20px">${fmt.num(r.nilai)}</span></button>`).join('') || `<div class="empty">${ic('clipboard-check')}<h3>Belum ada hasil</h3><p>Hasil scan untuk filter ini akan muncul di sini.</p></div>`}</div>
    <div class="hide-mob tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>NISN</th><th>Kelas</th><th>Mapel</th><th class="n">Benar</th><th class="n">Salah</th><th class="n">Kosong</th><th class="n">Nilai</th><th>Status</th><th>Waktu</th></tr></thead>
      <tbody>${list.map(r => `<tr data-id="${esc(r.id)}" style="cursor:pointer"><td><b>${esc(r.nama)}</b></td><td class="mono">${esc(r.nisn)}</td><td>${esc(kelasNama(r.kelas))}</td><td>${esc(mapelNama(r.mapel))}</td><td class="n">${r.b}</td><td class="n">${r.s}</td><td class="n">${r.k}</td><td class="n"><b>${fmt.num(r.nilai)}</b></td><td>${chip(r.status)}</td><td class="muted small">${fmt.dt(r.waktu)}</td></tr>`).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">Belum ada hasil.</td></tr>'}</tbody></table></div>`;
  const qi = $('#d-q', B); qi.oninput = e => { const pos = e.target.selectionStart; st.set('q', e.target.value.toLowerCase()); const i = $('#d-q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
  $$('[data-s]', B).forEach(b => b.onclick = () => st.set('status', b.dataset.s));
  $$('[data-id]', B).forEach(b => b.onclick = () => openHasilDetail(b.dataset.id, { row: rows.find(r => r.id === b.dataset.id) }));
  $('#d-exp', B).onclick = () => exportMenu(rows, f);
}

/** Detail satu hasil: peta jawaban yang bisa dikoreksi manual, foto, hapus (admin). */
async function openHasilDetail(id, opt = {}) {
  let r = opt.row;
  if (!r) {                                              // cari di cache daftar; bila belum ada, ambil segar
    const c = Store.get(userKey('hasil:' + ujianAktif()), null);
    r = c && c.data.rows.find(x => x.id === id);
    if (!r) {
      const pend = (AppState.pending || []).find(x => x.action === 'hasilSave' && x.data.idScan === id);
      if (pend) return toast('Hasil ini masih dalam antrean kirim. Coba lagi sebentar.', 'info');
      toast('Memuat data…', 'info', 1200);
      const res = await api('hasilList', { ujian: ujianAktif() });
      if (!res.success) return toast(res.message, 'bad');
      Store.set(userKey('hasil:' + ujianAktif()), { t: Date.now(), h: '', data: res.data });
      r = res.data.rows.find(x => x.id === id);
      if (!r) return toast('Data hasil tidak ditemukan.', 'bad');
    }
  }
  const S = sesiMapAll()[r.sesi];
  if (!S) return toast('Kunci jawaban sesi ini tidak tersedia.', 'bad');
  const fp = document.createElement('div'); fp.className = 'fullpage'; document.body.appendChild(fp);
  const close = () => { fp.remove(); route(true); };
  const draw = () => {
    const kkm = kkmOf(r.mapel);
    fp.innerHTML = `<header class="topbar"><button class="btn-icon" id="hd-x" aria-label="Kembali">${ic('arrow-left')}</button><div class="grow"><div class="t1">Detail Hasil</div><div class="t2">${esc(mapelNama(r.mapel))} · Kelas ${esc(kelasNama(r.kelas))}</div></div>
      ${isAdmin() ? `<button class="btn-icon" id="hd-del" aria-label="Hapus" style="color:var(--bad)">${ic('trash-2')}</button>` : ''}</header>
      <div class="content" style="max-width:640px">
      <div class="card"><div class="row" style="gap:14px"><span class="avatar" style="width:56px;height:56px">${esc(fmt.initials(r.nama))}</span><div class="grow"><h2 class="ellip">${esc(r.nama)}</h2><div class="muted small mono">NISN ${esc(r.nisn)}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><span class="chip">${esc(r.status)}</span><span class="chip out">${ic('history')} ${fmt.dt(r.waktu)}</span>${r.oleh ? `<span class="chip out">${esc(r.oleh)}</span>` : ''}</div></div></div></div>
      <div class="card"><div class="row between"><h3>Nilai</h3><span class="chip ${r.nilai >= kkm ? 'a' : 'bad'}">KKM ${kkm} (${r.nilai >= kkm ? 'Lulus' : 'Belum'})</span></div>${ringHtml(r.nilai)}
        <div class="counts"><div style="background:var(--accent-soft);color:var(--accent-ink)"><div><b>${r.b}</b>Benar</div></div><div style="background:var(--bad-soft);color:var(--bad-ink)"><div><b>${r.s}</b>Salah</div></div><div style="background:var(--surface-3)"><div><b>${r.k}</b>Kosong</div></div></div></div>
      <div class="card"><div class="row between"><h3>Peta Jawaban</h3><span class="muted small">ketuk soal untuk koreksi manual</span></div><div style="margin-top:12px">${answerMap(r.j || '', S.kunci)}</div></div>
      ${r.foto ? `<a class="btn btn-soft btn-block" href="${esc(r.foto)}" target="_blank" rel="noopener">${ic('image')} Buka Foto Bukti (Google Drive)</a>` : ''}
      ${opt.fromScan ? `<button class="btn btn-outline btn-block" id="hd-rescan" style="margin-top:10px">${ic('camera')} Scan Ulang Siswa Ini</button>` : ''}
      </div>`;
    $('#hd-x', fp).onclick = close;
    $('.amap', fp).onclick = e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      editAnswer(+b.dataset.q, r.j || '', S.kunci, null, async j => {
        const t = toast('Menyimpan koreksi…', 'info', 1500);
        const res = await api('hasilUpdate', { idScan: r.id, jawaban: j });
        if (!res.success) return toast(res.message, 'bad');
        Object.assign(r, res.data); patchHasilCache(res.data); draw(); toast('Koreksi tersimpan. Nilai: ' + fmt.num(res.data.nilai));
      });
    };
    const rs = $('#hd-rescan', fp); if (rs) rs.onclick = () => { fp.remove(); openScanner(opt.sesi || S, r.nisn); };
    const del = $('#hd-del', fp); if (del) del.onclick = async () => {
      if (!(await confirmDlg({ title: 'Hapus hasil ini?', text: 'Hasil ' + r.nama + ' (' + mapelNama(r.mapel) + ') akan dihapus permanen beserta foto buktinya.', ok: 'Hapus', danger: true, icon: 'trash-2' }))) return;
      await withBtn(del, async () => {
        const res = await api('hasilDelete', { ids: [r.id] });
        if (!res.success) return toast(res.message, 'bad');
        const k = userKey('hasil:' + ujianAktif()), c = Store.get(k, null); if (c) { c.data.rows = c.data.rows.filter(x => x.id !== r.id); Store.set(k, c); }
        AppState.boot.hasilIdx = AppState.boot.hasilIdx.filter(x => x[0] !== r.id); saveBootLocal(); buildMaps();
        toast('Hasil dihapus.'); close();
      });
    };
  };
  draw();
}
function patchHasilCache(row) {
  Object.keys(localStorage).filter(k => k.indexOf(LS_PREFIX + userKey('hasil:')) === 0).forEach(k => {
    try { const c = JSON.parse(localStorage.getItem(k)); const i = c.data.rows.findIndex(x => x.id === row.id); if (i > -1) { c.data.rows[i] = row; c.h = ''; localStorage.setItem(k, JSON.stringify(c)); } } catch (e) { }
  });
  const idx = AppState.boot.hasilIdx.find(x => x[0] === row.id); if (idx) { idx[3] = row.nilai; idx[4] = row.status; saveBootLocal(); buildMaps(); }
}

/* ---------------- Ekspor Excel / PDF ---------------- */
function exportMenu(rows, f) {
  const label = [f.ujian, f.mapel ? mapelNama(f.mapel) : 'Semua Mapel', f.kelas ? 'Kelas ' + kelasNama(f.kelas) : 'Semua Kelas'].join(' · ');
  const L = openLayer(`<div class="sh-h"><div class="grow"><h3>Unduh Rekap</h3><p class="muted small">${esc(label)} · ${rows.length} hasil</p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
    <div class="list">
      <div class="li" style="cursor:default">${ic('clipboard-check')}<div class="grow"><div class="nm">Rekap nilai per kelas</div><div class="sub">Nama, NISN, kelas, mapel, benar/salah/kosong, nilai, status</div></div>
        <button class="btn btn-soft btn-sm" data-x="nilai">${ic('file-spreadsheet', 'sm')} <span>Excel</span></button><button class="btn btn-soft btn-sm" data-p="nilai">${ic('file-text', 'sm')} <span>PDF</span></button></div>
      <div class="li" style="cursor:default">${ic('users')}<div class="grow"><div class="nm">Siswa belum di-scan</div><div class="sub">Per kelas & mapel yang sudah punya kunci</div></div>
        <button class="btn btn-soft btn-sm" data-x="belum">${ic('file-spreadsheet', 'sm')} <span>Excel</span></button><button class="btn btn-soft btn-sm" data-p="belum">${ic('file-text', 'sm')} <span>PDF</span></button></div>
      <div class="li" style="cursor:default">${ic('chart-column')}<div class="grow"><div class="nm">Analisis butir soal</div><div class="sub">${f.mapel ? '% benar/salah & sebaran A–D tiap soal' : 'Pilih satu mapel di filter dulu'}</div></div>
        <button class="btn btn-soft btn-sm" data-x="butir" ${f.mapel ? '' : 'disabled'}>${ic('file-spreadsheet', 'sm')} <span>Excel</span></button><button class="btn btn-soft btn-sm" data-p="butir" ${f.mapel ? '' : 'disabled'}>${ic('file-text', 'sm')} <span>PDF</span></button></div>
    </div>`);
  const build = kind => {
    if (kind === 'nilai') return { title: 'Rekap Nilai', cols: ['No', 'NISN', 'Nama', 'Kelas', 'Mapel', 'Benar', 'Salah', 'Kosong', 'Nilai', 'KKM', 'Ketuntasan', 'Status'],
      rows: rows.slice().sort((a, b) => kelasNama(a.kelas).localeCompare(kelasNama(b.kelas), 'id', { numeric: true }) || mapelNama(a.mapel).localeCompare(mapelNama(b.mapel)) || a.nama.localeCompare(b.nama)).map((r, i) => [i + 1, r.nisn, r.nama, kelasNama(r.kelas), mapelNama(r.mapel), r.b, r.s, r.k, r.nilai, kkmOf(r.mapel), r.nilai >= kkmOf(r.mapel) ? 'Tuntas' : 'Belum tuntas', r.status]) };
    if (kind === 'belum') {
      const out = [], done = {}; rows.forEach(r => done[r.sesi + '|' + r.nisn] = 1);
      (AppState.boot.sesi || []).filter(s => s.ujian === f.ujian && (!f.mapel || s.mapel === f.mapel) && (!f.kelas || s.kelas === f.kelas)).forEach(s => {
        (AppState.maps.siswaByKelas[s.kelas] || []).forEach(st => { if (!done[s.id + '|' + st.nisn] && !((AppState.maps.hasil[s.id] || {})[st.nisn])) out.push([kelasNama(s.kelas), mapelNama(s.mapel), st.nisn, st.nama]); });
      });
      out.sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }) || a[1].localeCompare(b[1]) || a[3].localeCompare(b[3]));
      return { title: 'Daftar Siswa Belum Di-scan', cols: ['No', 'Kelas', 'Mapel', 'NISN', 'Nama'], rows: out.map((r, i) => [i + 1].concat(r)) };
    }
    const it = itemStats(rows);
    return { title: 'Analisis Butir Soal', cols: ['No Soal', 'Kunci', 'Jumlah Siswa', 'Benar', 'Salah', 'Kosong', '% Benar', '% Salah', 'A', 'B', 'C', 'D'],
      rows: it.map(o => [o.q, o.key, o.total, o.benar, o.salah, o.kosong, Math.round(o.pb * 10) / 10, Math.round(o.ps * 10) / 10, o.dist.A, o.dist.B, o.dist.C, o.dist.D]) };
  };
  const fname = t => (t + ' ' + label).replace(/[\\/:*?"<>|·]/g, '').replace(/\s+/g, ' ').trim();
  $$('[data-x]', L.el).forEach(b => b.onclick = () => withBtn(b, async () => {
    const d = build(b.dataset.x);
    if (!d.rows.length) return toast('Tidak ada data untuk diunduh.', 'warn');
    try {
      const X = await loadXLSX(), wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet([[d.title + ' — ' + AppState.boot.settings.nama_sekolah], [label], [], d.cols].concat(d.rows));
      ws['!cols'] = d.cols.map((c, i) => ({ wch: Math.max(6, c.length + 2, ...d.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 1)) }));
      X.utils.book_append_sheet(wb, ws, d.title.slice(0, 30));
      if (b.dataset.x === 'nilai') {                    // lembar tambahan: jawaban per soal
        const S = sesiMapAll(), maxN = Math.max(0, ...rows.map(r => (S[r.sesi] || {}).n || 0));
        const head = ['NISN', 'Nama', 'Kelas', 'Mapel', 'Nilai'].concat(Array.from({ length: maxN }, (_, i) => String(i + 1)));
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head].concat(rows.map(r => [r.nisn, r.nama, kelasNama(r.kelas), mapelNama(r.mapel), r.nilai].concat((r.j || '').slice(0, (S[r.sesi] || {}).n || 0).split(''))))), 'Jawaban per Soal');
      }
      X.writeFile(wb, fname(d.title) + '.xlsx');
      toast('File Excel diunduh.');
    } catch (e) { toast(e.message, 'bad'); }
  }));
  $$('[data-p]', L.el).forEach(b => b.onclick = () => withBtn(b, async () => {
    const d = build(b.dataset.p);
    if (!d.rows.length) return toast('Tidak ada data untuk dicetak.', 'warn');
    const res = await api('exportPdf', { title: d.title, subtitle: label, columns: d.cols, rows: d.rows, filename: fname(d.title) });
    if (!res.success) return toast(res.message, 'bad');
    downloadBlob(b64ToBlob(res.data.b64, 'application/pdf'), res.data.name); toast('File PDF diunduh.');
  }));
}

/* ======================================================================
   HALAMAN: Akun
   ====================================================================== */
registerPage('akun', {
  title: 'Akun',
  render(el) {
    const me = AppState.me, mode = themeMode();
    el.innerHTML = `<div class="page-h"><h1>Akun</h1></div>
    <div class="grid-2c"><div>
    <div class="card row" style="gap:14px"><span class="avatar" style="width:60px;height:60px;font-size:20px">${esc(fmt.initials(me.nama))}</span><div class="grow"><h2 class="ellip">${esc(me.nama)}</h2><span class="chip p">${ic(me.peran === 'Admin' ? 'shield-check' : 'graduation-cap')} ${esc(me.peran)}</span></div></div>
    <div class="card"><h3 style="margin-bottom:10px">Mode Tampilan</h3><div class="seg" id="ak-mode">${[['terang', 'Terang', 'sun'], ['gelap', 'Gelap', 'moon'], ['sistem', 'Ikuti Sistem', 'monitor']].map(([k, t, i]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${ic(i, 'sm')} ${t}</button>`).join('')}</div></div>
    <div class="card"><h3 style="margin-bottom:12px">Ganti Password</h3>
      <div class="field"><label>Password lama</label><input class="input" type="password" id="ak-o" autocomplete="current-password"></div>
      <div class="field"><label>Password baru</label><input class="input" type="password" id="ak-n" autocomplete="new-password" placeholder="Minimal 6 karakter"></div>
      <div class="field"><label>Ulangi password baru</label><input class="input" type="password" id="ak-n2" autocomplete="new-password"></div>
      <button class="btn btn-primary btn-block" id="ak-save">${ic('save')} <span>Simpan Password</span></button></div>
    </div><div>
    ${isAdmin() ? `<div class="card hide-desk"><h3 style="margin-bottom:8px">Menu Admin</h3><div class="list">${[['pengaturan', 'Pengaturan & Tema', 'settings'], ['log', 'Log Aktivitas', 'history'], ['kunci', 'Kunci Jawaban', 'key-round']].map(([r, t, i]) => `<a class="li" href="#/${r}" style="text-decoration:none">${ic(i)}<div class="grow nm">${t}</div>${ic('chevron-right')}</a>`).join('')}</div></div>` : ''}
    ${installCard('')}
    <a class="card row" href="#/template" style="gap:12px;text-decoration:none;color:inherit"><span class="stat" style="padding:10px;margin:0;border:0;background:var(--primary-soft);color:var(--primary)">${ic('printer')}</span><div class="grow"><h3>Template Lembar Jawaban</h3><p class="muted small">A4 penuh, A4 / F4 dibagi dua, petunjuk pengisian, bisa berisi nama siswa</p></div>${ic('chevron-right')}</a>
    <div class="card"><div class="row between"><h3>Antrean Kirim</h3><button class="btn btn-soft btn-sm" id="ak-flush">${ic('cloud-upload')} <span>Kirim sekarang</span></button></div><div id="ak-q" class="small" style="margin-top:8px"></div></div>
    <div class="card"><div class="row between"><div><h3>Tentang</h3><p class="muted small">Kolej v${esc(window.KOLEJ_CONFIG.APP_VERSION)} · ${esc(AppState.boot.settings.nama_sekolah)}</p></div><button class="btn btn-ghost btn-sm" id="ak-perf">${ic('zap', 'sm')} Kecepatan</button></div></div>
    <button class="btn btn-danger btn-block" id="ak-out" style="margin-top:12px">${ic('log-out')} Keluar</button>
    </div></div>`;
    $$('#ak-mode button', el).forEach(b => b.onclick = () => { setMode(b.dataset.m); $$('#ak-mode button', el).forEach(x => x.classList.toggle('on', x === b)); const t = $('#tb-theme'); if (t) t.innerHTML = ic(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun'); });
    $('#ak-save', el).onclick = e => withBtn(e.currentTarget, async () => {
      const o = $('#ak-o', el).value, n = $('#ak-n', el).value, n2 = $('#ak-n2', el).value;
      if (n.length < 6) return toast('Password baru minimal 6 karakter.', 'warn');
      if (n !== n2) return toast('Ulangan password tidak sama.', 'warn');
      const res = await api('changePassword', { old: o, new: n });
      if (!res.success) return toast(res.message, 'bad');
      ['#ak-o', '#ak-n', '#ak-n2'].forEach(s => $(s, el).value = ''); toast('Password berhasil diganti.');
    });
    $('#ak-out', el).onclick = () => logout();
    $('#ak-flush', el).onclick = e => withBtn(e.currentTarget, () => Outbox.flush());
    $('#ak-perf', el).onclick = () => {
      const g = {}; Perf.rows.forEach(r => { (g[r.action] = g[r.action] || []).push(r); });
      openLayer(`<div class="sh-h"><h3 class="grow">Kecepatan (sesi ini)</h3><button class="btn-icon" data-close>${ic('x')}</button></div>` + tableHtml(['Aksi', 'Jumlah', 'Rata total (ms)', 'Rata server (ms)'], Object.keys(g).map(a => [a, g[a].length, Math.round(g[a].reduce((s, r) => s + r.total, 0) / g[a].length), Math.round(g[a].reduce((s, r) => s + (r.server || 0), 0) / g[a].length)])) + '<p class="muted small" style="margin-top:8px">Total = waktu yang dirasakan; server = kerja Apps Script. Selisih besar = jaringan/cold start.</p>');
    };
    const drawQ = items => {
      const q = $('#ak-q', el); if (!q) return;
      if (!items.length) { q.innerHTML = `<span class="row" style="color:var(--ok-ink)">${ic('cloud-check', 'sm')} Semua data sudah terkirim.</span>`; return; }
      q.innerHTML = items.map(it => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span>${it.action === 'hasilSave' ? 'Hasil scan ' + esc((AppState.maps.siswa.get(it.data.nisn) || {}).nama || it.data.nisn) : it.action === 'fotoUpload' ? 'Foto bukti' : esc(it.action)}</span>
        ${it.err ? `<span class="row" style="gap:6px"><span class="chip bad" title="${esc(it.err)}">Gagal</span><button class="btn-icon" data-del="${esc(it.id)}" aria-label="Buang">${ic('trash-2', 'sm')}</button></span>` : '<span class="chip p">Menunggu</span>'}</div>`).join('');
      $$('[data-del]', q).forEach(b => b.onclick = async () => { if (await confirmDlg({ title: 'Buang item gagal?', text: 'Data ini tidak akan dikirim ke server.', ok: 'Buang', danger: true })) Outbox.del(b.dataset.del); });
    };
    Outbox.all().then(drawQ); Outbox.on(drawQ);
  }
});

/* ======================================================================
   HALAMAN: Template Lembar Jawaban (unduh & cetak)
   ====================================================================== */
const TPL_FILES = { 'A4-1': 'assets/lembar-jawaban-A4-penuh.pdf', 'A4-2': 'assets/lembar-jawaban-A4-dibagi-dua.pdf', 'F4-2': 'assets/lembar-jawaban-F4-dibagi-dua.pdf' };
const TPL_INFO = {
  'A4-1': { t: 'A4 penuh', d: '1 lembar per halaman A4 (mendatar). Kotak paling besar (6,6 mm) — paling mudah diisi.', box: '6,6 mm', halves: 1, ratio: '297/210' },
  'A4-2': { t: 'A4 dibagi dua', d: '2 lembar per halaman A4, digunting di tengah. Hemat kertas.', box: '4,8 mm', halves: 2, ratio: '210/297' },
  'F4-2': { t: 'F4 dibagi dua', d: '2 lembar per halaman F4/Folio, digunting di tengah.', box: '5,5 mm', halves: 2, ratio: '215/330' }
};
function exSvg(kind, ok) {
  const st = 'stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"';
  const X = `<path d="M9 9 L31 31 M31 9 L9 31" ${st}/>`;
  const m = { x: X, cancel: X + `<path d="M2 16 H38 M2 24 H38" ${st}/>`, circle: `<circle cx="20" cy="20" r="11" ${st}/>`, check: `<path d="M10 21 L17 29 L31 11" ${st}/>`,
    fill: '<rect x="7" y="7" width="26" height="26" fill="currentColor"/>', dot: '<circle cx="20" cy="20" r="3.5" fill="currentColor"/>', small: '<path d="M27 7 L34 14 M34 7 L27 14" stroke="currentColor" stroke-width="2.5"/>', empty: '' };
  return `<svg viewBox="0 0 40 40" width="44" height="44" style="color:${ok ? 'var(--text)' : 'var(--text)'}"><rect x="3" y="3" width="34" height="34" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>${m[kind]}</svg>`;
}
registerPage('template', {
  title: 'Template LJK',
  render(el) {
    const c = AppState.ctx || {};
    let o = Object.assign({ format: 'A4-1', isi: 'kosong', pages: 1, petunjuk: true, mapel: c.mapel || (myMapel()[0] || {}).id, kelas: c.kelas || (myKelas()[0] || {}).id }, Store.get(userKey('tplOpt'), {}));
    const save = () => Store.set(userKey('tplOpt'), o);
    const draw = () => {
      const studs = (AppState.maps.siswaByKelas[o.kelas] || []);
      const per = TPL_INFO[o.format].halves, pages = o.isi === 'nama' ? Math.ceil(studs.length / per) : o.pages;
      el.innerHTML = `<div class="page-h"><div class="grow"><h1>Template Lembar Jawaban</h1><p class="muted">Unduh, cetak, lalu fotokopi. Semua format terbaca pemindai Kolej.</p></div></div>
      <div class="grid-2c"><div>
      <div class="card"><h3 style="margin-bottom:12px">1. Pilih ukuran kertas</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${Object.keys(TPL_INFO).map(k => { const t = TPL_INFO[k]; return `
          <button class="card tplf ${o.format === k ? 'on' : ''}" data-f="${k}" style="margin:0;padding:10px;cursor:pointer;text-align:center">
            <div class="tpl-paper" style="aspect-ratio:${t.ratio}">${Array.from({ length: t.halves }, () => '<div class="tpl-half"><i></i><i></i><i></i><i></i><span></span></div>').join(t.halves > 1 ? '<div class="tpl-cut"></div>' : '')}</div>
            <b style="display:block;margin-top:8px;font:700 13.5px var(--font-h)">${t.t}</b><span class="muted small">kotak ${t.box}</span></button>`; }).join('')}</div>
        <p class="muted small" style="margin-top:10px">${esc(TPL_INFO[o.format].d)}</p></div>
      <div class="card"><h3 style="margin-bottom:12px">2. Isi lembar</h3>
        <div class="seg" id="tp-isi"><button data-v="kosong" class="${o.isi === 'kosong' ? 'on' : ''}">Kosong (untuk fotokopi)</button><button data-v="nama" class="${o.isi === 'nama' ? 'on' : ''}">Berisi nama siswa</button></div>
        ${o.isi === 'kosong' ? `<div class="row between" style="margin-top:14px"><div><b>Jumlah halaman</b><div class="muted small">${pages * per} lembar jawaban</div></div>
            <div class="stepper"><button id="tp-dec" aria-label="Kurangi">${ic('minus')}</button><input id="tp-n" class="tnum" inputmode="numeric" value="${o.pages}"><button id="tp-inc" aria-label="Tambah">${ic('plus')}</button></div></div>`
          : `<div class="grid2" style="margin-top:14px">${'<div class="field" style="margin:0"><label>Mapel</label><select class="input" id="tp-m">' + myMapel().map(m => `<option value="${esc(m.id)}" ${m.id === o.mapel ? 'selected' : ''}>${esc(m.nama)}</option>`).join('') + '</select></div>'}
            ${'<div class="field" style="margin:0"><label>Kelas</label><select class="input" id="tp-k">' + myKelas(o.isi === 'nama' ? o.mapel : null).map(k => `<option value="${esc(k.id)}" ${k.id === o.kelas ? 'selected' : ''}>Kelas ${esc(k.nama)}</option>`).join('') + '</select></div>'}</div>
            <p class="muted small" style="margin-top:8px">Nama, NISN, kelas & mapel tercetak otomatis · ${studs.length} siswa → ${pages} halaman</p>`}
        <label class="check" style="margin-top:10px"><input type="checkbox" id="tp-pet" ${o.petunjuk ? 'checked' : ''}><span>Sertakan halaman <b>petunjuk pengisian</b> (halaman 1)</span></label></div>
      <div class="card"><button class="btn btn-primary btn-block" id="tp-go" style="min-height:54px;font-size:16px">${ic('file-down')} <span>Unduh PDF ${esc(TPL_INFO[o.format].t)}</span></button>
        <div class="info" style="margin-top:12px">${ic('printer')}<div><b>Saat mencetak:</b> skala <b>100% / Ukuran sebenarnya</b> (jangan "Fit to page"), kertas <b>${o.format === 'F4-2' ? 'F4/Folio' : 'A4'}</b>${o.format === 'A4-1' ? ' posisi <b>mendatar</b>' : ''}. Fotokopi hitam pekat${per > 1 ? ', lalu gunting di garis putus-putus' : ''}.</div></div></div>
      </div><div>
      <div class="card"><h3 style="margin-bottom:4px">Petunjuk untuk siswa</h3><p class="muted small" style="margin-bottom:12px">Bacakan sebelum ujian agar lembar bisa dipindai</p>
        <div class="label-sm" style="color:var(--ok-ink);margin-bottom:6px">${ic('circle-check', 'sm')} Benar</div>
        <div class="row" style="gap:14px;flex-wrap:wrap;margin-bottom:12px">
          <div style="text-align:center">${exSvg('x', 1)}<div class="small">X besar</div></div>
          <div style="text-align:center"><span style="display:inline-flex;gap:4px">${exSvg('cancel', 1)}${exSvg('x', 1)}</span><div class="small">Ganti: coret =, lalu X baru</div></div>
          <div style="text-align:center">${exSvg('empty', 1)}<div class="small">Tidak menjawab</div></div></div>
        <div class="label-sm" style="color:var(--bad-ink);margin-bottom:6px">${ic('circle-x', 'sm')} Salah (tidak terbaca / perlu dicek)</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">${[['circle', 'Dilingkari'], ['check', 'Dicentang'], ['fill', 'Diarsir'], ['dot', 'Titik'], ['small', 'X kecil']].map(([k, t]) => `<div style="text-align:center">${exSvg(k)}<div class="small">${t}</div></div>`).join('')}</div>
        <ul class="small" style="margin:0;padding-left:18px;line-height:1.7"><li>Pulpen <b>hitam/biru tua</b>; pensil tipis sulit terbaca.</li><li>Satu soal <b>satu</b> tanda X.</li><li><b>Jangan</b> mencoret/menutup 4 kotak hitam di sudut & batang hitam di kiri atas.</li><li><b>Jangan</b> dilipat, diremas, atau basah.</li></ul></div>
      <div class="card"><h3 style="margin-bottom:4px">Unduhan cepat</h3><p class="muted small" style="margin-bottom:10px">PDF siap cetak (lembar kosong + petunjuk), tetap bisa diunduh tanpa internet</p>
        <div class="list">${Object.keys(TPL_FILES).map(k => `<a class="li" href="${TPL_FILES[k]}" download style="text-decoration:none">${ic('file-down')}<div class="grow"><div class="nm">${TPL_INFO[k].t}</div><div class="sub">${esc(TPL_INFO[k].d)}</div></div>${ic('chevron-right')}</a>`).join('')}</div></div>
      </div></div>`;
      $$('.tplf', el).forEach(b => b.onclick = () => { o.format = b.dataset.f; save(); draw(); });
      $$('#tp-isi button', el).forEach(b => b.onclick = () => { o.isi = b.dataset.v; save(); draw(); });
      const setN = n => { o.pages = Math.max(1, Math.min(60, n | 0)); save(); draw(); };
      if ($('#tp-dec', el)) { $('#tp-dec', el).onclick = () => setN(o.pages - 1); $('#tp-inc', el).onclick = () => setN(o.pages + 1); $('#tp-n', el).onchange = e => setN(+e.target.value); }
      if ($('#tp-m', el)) { $('#tp-m', el).onchange = e => { o.mapel = e.target.value; if (!canTeach(o.mapel, o.kelas)) o.kelas = (myKelas(o.mapel)[0] || {}).id; save(); draw(); }; $('#tp-k', el).onchange = e => { o.kelas = e.target.value; save(); draw(); }; }
      $('#tp-pet', el).onchange = e => { o.petunjuk = e.target.checked; save(); };
      $('#tp-go', el).onclick = e => withBtn(e.currentTarget, async () => {
        if (o.isi === 'nama' && !studs.length) return toast('Kelas ini belum punya siswa.', 'warn');
        try {
          const jsPDF = await loadJsPDF(), s = AppState.boot.settings;
          const students = o.isi === 'nama' ? studs.map(x => ({ nama: x.nama, nisn: x.nisn, kelas: kelasNama(x.kelas), mapel: mapelNama(o.mapel) })) : null;
          const doc = LJK.build(jsPDF, { format: o.format, sekolah: s.nama_sekolah, ujian: s.ujian_aktif, petunjuk: o.petunjuk, pages: o.pages, students });
          const name = ['Lembar Jawaban', TPL_INFO[o.format].t, o.isi === 'nama' ? mapelNama(o.mapel) + ' Kelas ' + kelasNama(o.kelas) : ''].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '');
          doc.save(name + '.pdf');
          toast('PDF diunduh (' + doc.getNumberOfPages() + ' halaman).');
        } catch (err) { toast(err.message, 'bad', 5000); }
      });
    };
    draw();
  }
});

/* ======================================================================
   MULAI
   ====================================================================== */
document.addEventListener('DOMContentLoaded', function boot() {
  AppState.pub = Store.get('pub', null);
  if (AppState.pub) applyBrand(AppState.pub.warna, AppState.pub.aksen);
  applyMode(themeMode());
  // service worker & tombol Instal diurus pwa.js
  if (/GANTI_DENGAN/.test(GAS_URL)) {
    app.innerHTML = `<div class="login"><div class="box"><div class="card" style="margin-top:60px"><div class="dlg-icon">${ic('settings')}</div><h2 style="text-align:center">URL server belum diisi</h2><p class="muted" style="text-align:center;margin-top:8px">Buka <b>js/config.js</b> lalu isi <b>GAS_URL</b> dengan URL Web App (/exec) dari Apps Script, kemudian unggah ulang.</p></div></div></div>`;
    return;
  }
  Outbox.all().then(items => { AppState.pending = items; if (restoreSession()) startApp(); else renderLogin(); }).catch(() => { if (restoreSession()) startApp(); else renderLogin(); });
});
