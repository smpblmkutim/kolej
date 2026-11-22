/* ==========================================================================
   Kolej — Halaman Admin: Data Guru, Mapel, Kelas, Siswa (+ impor Excel),
   Pengaturan & Tema, Log Aktivitas.
   ========================================================================== */
'use strict';

/** Ambil boot terbaru setelah admin mengubah data master. */
async function adminRefresh() {
  const res = await api('boot');
  if (res.success) { AppState.boot = res.data; saveBootLocal(); buildMaps(); }
  return res;
}
function statusChip(s) { return s === 'Aktif' ? `<span class="chip ok">${ic('check')} Aktif</span>` : `<span class="chip out">Nonaktif</span>`; }
function formLayer(title, fields, onSubmit, opt = {}) {
  const L = openLayer(`<div class="sh-h"><div class="grow"><h3>${esc(title)}</h3>${opt.sub ? `<p class="muted small">${esc(opt.sub)}</p>` : ''}</div><button class="btn-icon" data-close>${ic('x')}</button></div>
    <form id="fl" novalidate>${fields}<div class="err-text" id="fl-e" style="min-height:18px"></div>
    <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">${ic('save')} <span>${esc(opt.ok || 'Simpan')}</span></button></form>`);
  $('#fl', L.el).addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('button[type=submit]', L.el), fd = {};
    $$('[name]', L.el).forEach(i => fd[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim());
    withBtn(btn, async () => {
      const err = await onSubmit(fd, L);
      if (err) $('#fl-e', L.el).innerHTML = ic('circle-x', 'sm') + ' ' + esc(err);
    });
  });
  const first = $('input:not([type=hidden]),select', L.el); if (first && !opt.noFocus) setTimeout(() => first.focus(), 60);
  return L;
}
const fieldHtml = (label, inner) => `<div class="field"><label>${esc(label)}</label>${inner}</div>`;
const segField = (name, val, opts) => `<input type="hidden" name="${name}" value="${esc(val)}"><div class="seg" data-seg="${name}">${opts.map(o => `<button type="button" data-v="${esc(o)}" class="${o === val ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>`;
function bindSeg(root) { $$('[data-seg]', root).forEach(s => s.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; $$('button', s).forEach(x => x.classList.toggle('on', x === b)); $(`[name="${s.dataset.seg}"]`, root).value = b.dataset.v; s.dispatchEvent(new Event('segchange')); })); }

/* ---------------- Hub Data (navigasi HP) ---------------- */
registerPage('data', {
  title: 'Data Master', admin: true,
  render(el) {
    const b = AppState.boot;
    const items = [['guru', 'Data Guru', 'graduation-cap', (b.users || []).filter(u => u.status === 'Aktif').length + ' akun aktif'], ['mapel', 'Data Mapel', 'book-open', activeMapel().length + ' mapel'], ['kelas', 'Data Kelas', 'building-2', activeKelas().length + ' kelas'], ['siswa', 'Data Siswa', 'users', b.siswa.filter(s => s[3] === 'Aktif').length + ' siswa aktif'], ['pengaturan', 'Pengaturan & Tema', 'palette', 'Sekolah, ujian aktif, warna'], ['log', 'Log Aktivitas', 'history', 'Riwayat tindakan pengguna']];
    el.innerHTML = `<div class="page-h"><h1>Data & Sistem</h1></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">${items.map(([r, t, i, s]) => `<a class="card" href="#/${r}" style="text-decoration:none;color:inherit;margin:0"><span class="stat" style="padding:10px;display:inline-grid;border:0;background:var(--primary-soft);color:var(--primary)">${ic(i)}</span><h3 style="margin-top:10px">${t}</h3><p class="muted small">${esc(s)}</p></a>`).join('')}</div>`;
  }
});

/* ---------------- Data Guru / Pengguna ---------------- */
registerPage('guru', {
  title: 'Data Guru', admin: true,
  render(el) {
    let q = '', peran = '';
    const draw = () => {
      const users = (AppState.boot.users || []).filter(u => (!peran || u.peran === peran) && (!q || u.nama.toLowerCase().includes(q) || (u.username || '').includes(q))).sort((a, b) => a.peran.localeCompare(b.peran) || a.nama.localeCompare(b.nama));
      el.innerHTML = `<div class="page-h"><div class="grow"><h1>Data Guru & Pengguna</h1><p class="muted">Guru login dengan memilih nama + password. Admin login dengan username.</p></div><button class="btn btn-primary" id="u-add">${ic('user-plus')} <span class="hide-mob">Tambah</span></button></div>
        <div class="toolbar"><div class="input-wrap">${ic('search')}<input class="input" id="u-q" placeholder="Cari nama atau username…" value="${esc(q)}"></div></div>
        <div class="chips" style="margin-bottom:12px">${[['', 'Semua'], ['Guru', 'Guru'], ['Admin', 'Admin']].map(([v, t]) => `<button class="chip pick ${peran === v ? 'on' : ''}" data-p="${v}">${t}</button>`).join('')}</div>
        <div class="list">${users.map(u => `<div class="li" style="cursor:default"><span class="avatar sm" style="${u.status === 'Aktif' ? '' : 'background:var(--surface-3);color:var(--muted)'}">${esc(fmt.initials(u.nama))}</span>
          <div class="grow"><div class="nm ellip">${esc(u.nama)}</div><div class="sub">${esc(u.peran)}${u.username ? ' · @' + esc(u.username) : ''}${u.wajibGanti ? ' · <span style="color:var(--warn-ink)">belum ganti password</span>' : ''}</div></div>
          <span class="hide-mob">${statusChip(u.status)}</span>
          <button class="btn-icon" data-r="${esc(u.id)}" aria-label="Reset password" title="Reset password">${ic('key-round')}</button><button class="btn-icon" data-e="${esc(u.id)}" aria-label="Ubah">${ic('pencil')}</button></div>`).join('') || `<div class="empty">${ic('users')}<p>Tidak ada pengguna.</p></div>`}</div>`;
      $('#u-q', el).oninput = e => { q = e.target.value.toLowerCase(); const p = e.target.selectionStart; draw(); const i = $('#u-q', el); i.focus(); i.setSelectionRange(p, p); };
      $$('[data-p]', el).forEach(b => b.onclick = () => { peran = b.dataset.p; draw(); });
      $('#u-add', el).onclick = () => edit(null);
      $$('[data-e]', el).forEach(b => b.onclick = () => edit(AppState.boot.users.find(u => u.id === b.dataset.e)));
      $$('[data-r]', el).forEach(b => b.onclick = () => reset(AppState.boot.users.find(u => u.id === b.dataset.r)));
    };
    const edit = u => {
      const L = formLayer(u ? 'Ubah Pengguna' : 'Tambah Pengguna',
        fieldHtml('Nama lengkap', `<input class="input" name="nama" value="${esc(u ? u.nama : '')}" placeholder="mis. Siti Aminah, S.Pd.">`) +
        fieldHtml('Peran', segField('peran', u ? u.peran : 'Guru', ['Guru', 'Admin'])) +
        `<div id="un-wrap">${fieldHtml('Username (khusus Admin)', `<input class="input" name="username" autocapitalize="off" value="${esc(u ? u.username : '')}">`)}</div>` +
        (u ? fieldHtml('Status', segField('status', u.status, ['Aktif', 'Nonaktif'])) : fieldHtml('Password awal', `<input class="input" name="password" type="text" value="${esc(Math.random().toString(36).slice(2, 8))}">`) + '<p class="muted small" style="margin:-6px 0 12px">Catat & berikan ke guru. Wajib diganti saat login pertama.</p>'),
        async fd => {
          const res = await api('userSave', Object.assign({ id: u && u.id }, fd));
          if (!res.success) return res.message;
          await adminRefresh(); L.close(); toast(res.message); draw();
        });
      bindSeg(L.el);
      const sync = () => { $('#un-wrap', L.el).hidden = $('[name=peran]', L.el).value !== 'Admin'; };
      $('[data-seg=peran]', L.el).addEventListener('segchange', sync); sync();
    };
    const reset = u => {
      const L = formLayer('Reset Password', fieldHtml('Password baru untuk ' + u.nama, `<input class="input" name="password" type="text" value="${esc(Math.random().toString(36).slice(2, 8))}">`) + '<p class="muted small" style="margin:-6px 0 12px">Sesi lama pengguna ini otomatis keluar. Ia wajib mengganti password saat login berikutnya.</p>',
        async fd => { const res = await api('resetPassword', { id: u.id, password: fd.password }); if (!res.success) return res.message; await adminRefresh(); L.close(); toast(res.message); draw(); }, { ok: 'Reset Password' });
    };
    draw();
  }
});

/* ---------------- Mapel & Kelas (pola sama) ---------------- */
function masterPage(kind) {
  const cfg = kind === 'mapel'
    ? { title: 'Data Mapel', icon: 'book-open', list: () => [...AppState.maps.mapel.values()], action: 'mapelSave', label: 'Nama mata pelajaran', ph: 'mis. Matematika' }
    : { title: 'Data Kelas', icon: 'building-2', list: () => [...AppState.maps.kelas.values()], action: 'kelasSave', label: 'Nama kelas', ph: 'mis. 8A' };
  return {
    title: cfg.title, admin: true,
    render(el) {
      const draw = () => {
        const items = cfg.list().sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }));
        el.innerHTML = `<div class="page-h"><div class="grow"><h1>${cfg.title}</h1><p class="muted">Data dinonaktifkan, bukan dihapus, agar riwayat hasil tetap utuh.</p></div><button class="btn btn-primary" id="m-add">${ic('plus')} <span class="hide-mob">Tambah</span></button></div>
          <div class="list">${items.map(x => {
            const extra = kind === 'kelas' ? ` · Tingkat ${esc(x.tingkat || '-')} · ${(AppState.maps.siswaByKelas[x.id] || []).length} siswa aktif` : '';
            return `<div class="li" style="cursor:default"><span class="stat" style="padding:8px;margin:0;border:0;background:var(--primary-soft);color:var(--primary)">${ic(cfg.icon)}</span><div class="grow"><div class="nm">${kind === 'kelas' ? 'Kelas ' : ''}${esc(x.nama)}</div><div class="sub mono">${esc(x.id)}${extra}</div></div>${statusChip(x.status)}<button class="btn-icon" data-e="${esc(x.id)}" aria-label="Ubah">${ic('pencil')}</button></div>`;
          }).join('') || `<div class="empty">${ic(cfg.icon)}<p>Belum ada data.</p></div>`}</div>`;
        $('#m-add', el).onclick = () => edit(null);
        $$('[data-e]', el).forEach(b => b.onclick = () => edit(cfg.list().find(x => x.id === b.dataset.e)));
      };
      const edit = x => {
        const L = formLayer(x ? 'Ubah ' + cfg.title.replace('Data ', '') : 'Tambah ' + cfg.title.replace('Data ', ''),
          fieldHtml(cfg.label, `<input class="input" name="nama" value="${esc(x ? x.nama : '')}" placeholder="${cfg.ph}">`) +
          (kind === 'kelas' ? fieldHtml('Tingkat', `<select class="input" name="tingkat">${['7', '8', '9'].map(t => `<option ${x && x.tingkat === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`) : '') +
          (x ? fieldHtml('Status', segField('status', x.status, ['Aktif', 'Nonaktif'])) : ''),
          async fd => { const res = await api(cfg.action, Object.assign({ id: x && x.id }, fd)); if (!res.success) return res.message; await adminRefresh(); L.close(); toast(res.message); draw(); });
        bindSeg(L.el);
      };
      draw();
    }
  };
}
registerPage('mapel', masterPage('mapel'));
registerPage('kelas', masterPage('kelas'));

/* ---------------- Data Siswa + Impor Excel ---------------- */
registerPage('siswa', {
  title: 'Data Siswa', admin: true,
  render(el) {
    let kelas = Store.get('admKelas', ''), q = '', showOff = false;
    const draw = () => {
      const all = [...AppState.maps.siswa.values()];
      const list = all.filter(s => (!kelas || s.kelas === kelas) && (showOff || s.status === 'Aktif') && (!q || s.nama.toLowerCase().includes(q) || s.nisn.includes(q)))
        .sort((a, b) => kelasNama(a.kelas).localeCompare(kelasNama(b.kelas), 'id', { numeric: true }) || a.nama.localeCompare(b.nama));
      const shown = list.slice(0, 300);
      el.innerHTML = `<div class="page-h"><div class="grow"><h1>Data Siswa</h1><p class="muted">${all.filter(s => s.status === 'Aktif').length} siswa aktif · NISN disimpan sebagai teks (angka 0 di depan aman)</p></div></div>
        <div class="toolbar"><div class="input-wrap">${ic('search')}<input class="input" id="s-q" placeholder="Cari nama atau NISN…" value="${esc(q)}"></div>
          <button class="btn btn-outline" id="s-tpl">${ic('file-spreadsheet')} <span>Unduh Template</span></button>
          <button class="btn btn-soft" id="s-imp">${ic('upload')} <span>Impor Excel</span></button>
          <button class="btn btn-primary" id="s-add">${ic('user-plus')} <span class="hide-mob">Tambah</span></button></div>
        <div class="filters"><select class="input" id="s-k"><option value="">Semua Kelas</option>${activeKelas().map(k => `<option value="${esc(k.id)}" ${k.id === kelas ? 'selected' : ''}>Kelas ${esc(k.nama)} (${(AppState.maps.siswaByKelas[k.id] || []).length})</option>`).join('')}</select>
          <label class="check chip pick" style="height:40px"><input type="checkbox" id="s-off" ${showOff ? 'checked' : ''} style="width:16px;height:16px"> Tampilkan nonaktif</label></div>
        <div class="hide-desk list">${shown.map(s => `<button class="li" data-n="${esc(s.nisn)}"><span class="avatar sm" style="${s.status === 'Aktif' ? '' : 'background:var(--surface-3);color:var(--muted)'}">${esc(fmt.initials(s.nama))}</span><div class="grow"><div class="nm ellip">${esc(s.nama)}</div><div class="sub mono">${esc(s.nisn)} · Kelas ${esc(kelasNama(s.kelas))}</div></div>${s.status === 'Aktif' ? '' : statusChip(s.status)}${ic('chevron-right')}</button>`).join('') || `<div class="empty">${ic('users')}<h3>Belum ada siswa</h3><p>Gunakan Impor Excel untuk memasukkan banyak siswa sekaligus.</p></div>`}</div>
        <div class="hide-mob tbl-wrap"><table class="tbl"><thead><tr><th>NISN</th><th>Nama Siswa</th><th>Kelas</th><th>Status</th><th></th></tr></thead><tbody>${shown.map(s => `<tr><td class="mono">${esc(s.nisn)}</td><td><b>${esc(s.nama)}</b></td><td><span class="chip">${esc(kelasNama(s.kelas))}</span></td><td>${statusChip(s.status)}</td><td style="text-align:right"><button class="btn-icon" data-n="${esc(s.nisn)}" aria-label="Ubah">${ic('pencil')}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">Belum ada siswa.</td></tr>'}</tbody></table></div>
        ${list.length > 300 ? `<p class="muted small" style="margin-top:8px">Menampilkan 300 dari ${list.length}. Gunakan filter kelas atau pencarian.</p>` : ''}`;
      $('#s-q', el).oninput = e => { q = e.target.value.toLowerCase(); const p = e.target.selectionStart; draw(); const i = $('#s-q', el); i.focus(); i.setSelectionRange(p, p); };
      $('#s-k', el).onchange = e => { kelas = e.target.value; Store.set('admKelas', kelas); draw(); };
      $('#s-off', el).onchange = e => { showOff = e.target.checked; draw(); };
      $('#s-add', el).onclick = () => edit(null);
      $$('[data-n]', el).forEach(b => b.onclick = () => edit(AppState.maps.siswa.get(b.dataset.n)));
      $('#s-tpl', el).onclick = e => withBtn(e.currentTarget, downloadSiswaTemplate);
      $('#s-imp', el).onclick = () => importSiswa(draw);
    };
    const edit = s => {
      const L = formLayer(s ? 'Ubah Siswa' : 'Tambah Siswa',
        fieldHtml('NISN', `<input class="input mono" name="nisn" inputmode="numeric" value="${esc(s ? s.nisn : '')}" placeholder="10 digit">`) +
        fieldHtml('Nama lengkap', `<input class="input" name="nama" value="${esc(s ? s.nama : '')}">`) +
        fieldHtml('Kelas', `<select class="input" name="kelas">${activeKelas().map(k => `<option value="${esc(k.id)}" ${(s ? s.kelas : kelas) === k.id ? 'selected' : ''}>Kelas ${esc(k.nama)}</option>`).join('')}</select>`) +
        (s ? fieldHtml('Status', segField('status', s.status, ['Aktif', 'Nonaktif'])) : ''),
        async fd => {
          if (!/^\d+$/.test(fd.nisn)) return 'NISN hanya boleh angka.';
          if (fd.nisn.length !== 10 && !(await confirmDlg({ title: 'NISN bukan 10 digit', text: 'NISN "' + fd.nisn + '" berisi ' + fd.nisn.length + ' digit. Tetap simpan?', ok: 'Tetap simpan' }))) return;
          const res = await api('siswaSave', Object.assign({ oldNisn: s && s.nisn }, fd));
          if (!res.success) return res.message;
          await adminRefresh(); L.close(); toast(res.message); draw();
        });
      bindSeg(L.el);
    };
    draw();
  }
});
async function downloadSiswaTemplate() {
  try {
    const X = await loadXLSX(), wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([['NISN', 'Nama', 'Kelas'], ['0012345678', 'Contoh Nama Siswa', activeKelas()[0] ? activeKelas()[0].nama : '7A']]);
    for (let r = 1; r <= 1000; r++) { const a = X.utils.encode_cell({ r, c: 0 }); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].t = 's'; ws[a].z = '@'; }
    ws['!ref'] = 'A1:C1001'; ws['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 10 }];
    X.utils.book_append_sheet(wb, ws, 'Siswa');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Daftar Kelas yang valid (isi kolom Kelas persis seperti ini)'], []].concat(activeKelas().map(k => [k.nama]))), 'Daftar Kelas');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['PETUNJUK'], ['1. Isi mulai baris 2 di sheet "Siswa". Jangan ubah judul kolom.'], ['2. Kolom NISN berformat teks agar angka 0 di depan tidak hilang. NISN seharusnya 10 digit.'], ['3. Kolom Kelas harus sama dengan nama di sheet "Daftar Kelas".'], ['4. NISN yang sudah ada akan DIPERBARUI (tidak digandakan).']]), 'Petunjuk');
    X.writeFile(wb, 'Template Impor Siswa - Kolej.xlsx');
    toast('Template diunduh.');
  } catch (e) { toast(e.message, 'bad'); }
}
function importSiswa(onDone) {
  let rows = [];
  const L = openLayer(`<div class="sh-h"><span class="stat" style="padding:10px;margin:0;border:0;background:var(--primary-soft);color:var(--primary)">${ic('file-spreadsheet')}</span><div class="grow"><h2>Impor Data Siswa</h2><p class="muted small">Tinjau kecocokan data file Excel sebelum disimpan</p></div><button class="btn-icon" data-close>${ic('x')}</button></div>
    <div class="row" id="im-steps" style="gap:8px;margin-bottom:14px;flex-wrap:wrap"></div><div id="im-body"></div>`, { wide: true, sticky: true });
  const steps = n => { $('#im-steps', L.el).innerHTML = ['Unggah Berkas', 'Pratinjau & Validasi', 'Simpan'].map((t, i) => `<span class="chip ${i + 1 < n ? 'ok' : i + 1 === n ? 'p' : 'out'}">${i + 1 < n ? ic('check') : (i + 1) + '.'} ${t}</span>`).join(ic('chevron-right', 'sm')); };
  const step1 = () => {
    steps(1);
    $('#im-body', L.el).innerHTML = `<label class="card empty" style="display:block;cursor:pointer;border-style:dashed;border-width:2px">${ic('upload')}<h3>Pilih file Excel (.xlsx / .xls / .csv)</h3><p>Kolom wajib: NISN, Nama, Kelas</p><input type="file" id="im-f" accept=".xlsx,.xls,.csv" hidden></label>
      <button class="btn btn-ghost btn-block" id="im-tpl">${ic('download')} Belum punya? Unduh template</button>`;
    $('#im-tpl', L.el).onclick = e => withBtn(e.currentTarget, downloadSiswaTemplate);
    $('#im-f', L.el).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#im-body', L.el).innerHTML = '<div class="skel" style="height:200px"></div>';
      try {
        const X = await loadXLSX(), wb = X.read(await f.arrayBuffer(), { type: 'array', raw: false, cellText: true });
        const ws = wb.Sheets['Siswa'] || wb.Sheets[wb.SheetNames[0]];
        const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        const hi = aoa.findIndex(r => r.some(c => /nisn/i.test(c)));
        if (hi < 0) throw new Error('Kolom "NISN" tidak ditemukan. Gunakan template.');
        const H = aoa[hi].map(c => String(c).trim().toLowerCase());
        const ci = { nisn: H.findIndex(h => h.includes('nisn')), nama: H.findIndex(h => h.includes('nama')), kelas: H.findIndex(h => h.includes('kelas')) };
        if (ci.nama < 0 || ci.kelas < 0) throw new Error('Kolom "Nama" dan "Kelas" wajib ada.');
        rows = aoa.slice(hi + 1).map((r, i) => ({ line: hi + i + 2, nisn: String(r[ci.nisn] || '').replace(/\s/g, ''), nama: String(r[ci.nama] || '').trim(), kelas: String(r[ci.kelas] || '').trim() })).filter(r => r.nisn || r.nama);
        if (!rows.length) throw new Error('File tidak berisi data siswa.');
        step2(f.name);
      } catch (err) { $('#im-body', L.el).innerHTML = `<div class="info bad">${ic('circle-x')}<div>${esc(err.message)}</div></div>`; setTimeout(step1, 2600); }
    };
  };
  const step2 = fname => {
    steps(2);
    const kel = {}; [...AppState.maps.kelas.values()].forEach(k => kel[k.nama.toUpperCase()] = k);
    const seen = {};
    rows.forEach(r => {
      r.err = ''; r.warn = '';
      if (!/^\d+$/.test(r.nisn)) r.err = 'NISN kosong/bukan angka';
      else if (seen[r.nisn]) r.err = 'NISN ganda di file (baris ' + seen[r.nisn] + ')';
      else if (!r.nama) r.err = 'Nama kosong';
      else if (!kel[r.kelas.toUpperCase()] || kel[r.kelas.toUpperCase()].status !== 'Aktif') r.err = 'Kelas "' + r.kelas + '" tidak ditemukan (' + activeKelas().slice(0, 6).map(k => k.nama).join(', ') + (activeKelas().length > 6 ? ', …' : '') + ')';
      if (/^\d+$/.test(r.nisn) && !seen[r.nisn]) seen[r.nisn] = r.line;
      if (!r.err && r.nisn.length !== 10) r.warn = 'NISN ' + r.nisn.length + ' digit (seharusnya 10)';
      r.st = r.err ? 'Error' : AppState.maps.siswa.has(r.nisn) ? 'Diperbarui' : 'Baru';
    });
    const ok = rows.filter(r => !r.err), nb = ok.filter(r => r.st === 'Baru').length, nu = ok.length - nb, ne = rows.length - ok.length;
    const sorted = rows.slice().sort((a, b) => (b.err ? 2 : b.warn ? 1 : 0) - (a.err ? 2 : a.warn ? 1 : 0));
    $('#im-body', L.el).innerHTML = `<div class="row between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px"><span class="chip out" style="height:36px">${ic('file-text')} <b class="mono">${esc(fname)}</b> · ${rows.length} baris dibaca</span>
        <div class="row" style="gap:6px;flex-wrap:wrap"><span class="chip a">${ic('plus')} ${nb} Baru</span><span class="chip p">${ic('refresh-cw')} ${nu} Diperbarui</span><span class="chip bad">${ic('circle-x')} ${ne} Perlu Perbaikan</span></div></div>
      <div class="tbl-wrap" style="max-height:50vh"><table class="tbl"><thead><tr><th>Baris</th><th>NISN</th><th>Nama Siswa</th><th>Kelas</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>
        ${sorted.map(r => `<tr style="${r.err ? 'background:var(--bad-soft)' : ''}"><td class="muted tnum">${r.line}</td><td class="mono">${r.warn || (r.err && /NISN/.test(r.err)) ? `<b style="color:var(--bad-ink)">${esc(r.nisn || '—')}</b>` : esc(r.nisn)}</td><td><b>${esc(r.nama)}</b></td><td><span class="chip ${r.err && /Kelas/.test(r.err) ? 'bad' : ''}">${esc(r.kelas)}</span></td>
          <td>${r.err ? `<span class="chip bad">${ic('circle-x')} Error</span>` : r.st === 'Baru' ? '<span class="chip a">● Baru</span>' : '<span class="chip p">● Diperbarui</span>'}</td>
          <td class="small" style="color:${r.err ? 'var(--bad-ink)' : r.warn ? 'var(--warn-ink)' : 'var(--muted)'}">${esc(r.err || r.warn || (r.st === 'Baru' ? 'Siswa baru siap ditambahkan' : 'Data lama akan diperbarui'))}</td></tr>`).join('')}</tbody></table></div>
      <div class="row between" style="margin-top:14px;flex-wrap:wrap;gap:10px">${ne ? `<button class="btn btn-ghost" id="im-csv">${ic('download')} Unduh laporan kesalahan (${ne} baris .csv)</button>` : '<span></span>'}
        <div class="row" style="gap:8px"><button class="btn btn-outline" id="im-back">Batal</button><button class="btn btn-primary" id="im-save" ${ok.length ? '' : 'disabled'}>${ic('circle-check')} <span>Simpan ${ok.length} Data Valid</span></button></div></div>`;
    const csv = $('#im-csv', L.el); if (csv) csv.onclick = () => downloadBlob(new Blob(['﻿Baris;NISN;Nama;Kelas;Kesalahan\n' + rows.filter(r => r.err).map(r => [r.line, "'" + r.nisn, r.nama, r.kelas, r.err].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n')], { type: 'text/csv' }), 'laporan-kesalahan-impor.csv');
    $('#im-back', L.el).onclick = () => L.close();
    $('#im-save', L.el).onclick = e => withBtn(e.currentTarget, async () => {
      const send = ok.map(r => ({ line: r.line, nisn: r.nisn, nama: r.nama, kelas: kel[r.kelas.toUpperCase()].id }));
      const res = await api('siswaImport', { rows: send }, { timeout: 120000 });
      if (!res.success) return toast(res.message, 'bad', 5000);
      await adminRefresh();
      steps(3);
      $('#im-body', L.el).innerHTML = `<div class="empty">${ic('circle-check')}<h3>Impor selesai</h3><p><b>${res.data.baru}</b> siswa baru · <b>${res.data.diperbarui}</b> diperbarui${res.data.errors.length ? ' · ' + res.data.errors.length + ' ditolak server' : ''}</p></div>
        ${res.data.errors.length ? tableHtml(['Baris', 'Kesalahan'], res.data.errors.map(x => [x.line, x.msg])) : ''}<button class="btn btn-primary btn-block" data-close style="margin-top:12px">Selesai</button>`;
      $('[data-close]', L.el).onclick = () => { L.close(); onDone(); };
    });
  };
  step1();
}

/* ---------------- Pengaturan & Tema ---------------- */
const PRESET_P = [['Biru', '#2563EB'], ['Hijau', '#15803D'], ['Ungu', '#7C3AED'], ['Oranye', '#C2410C'], ['Marun', '#BE123C'], ['Tosca', '#0F766E']];
const PRESET_A = [['Tosca', '#14B8A6'], ['Cyan', '#06B6D4'], ['Emerald', '#10B981'], ['Amber', '#F59E0B'], ['Indigo', '#6366F1'], ['Rose', '#F43F5E']];
registerPage('pengaturan', {
  title: 'Pengaturan', admin: true,
  render(el) {
    const s = AppState.boot.settings, S = Object.assign({}, s);
    const draw = () => {
      el.innerHTML = `<div class="label-sm" style="margin-bottom:4px">Desain & Identitas · ${esc(s.nama_sekolah)}</div>
      <div class="page-h"><div class="grow"><h1>Pengaturan</h1><p class="muted">Perubahan berlaku untuk semua guru setelah disimpan.</p></div></div>
      <div class="grid-2c"><div>
      <div class="card"><h3 style="margin-bottom:12px">Sekolah & Ujian</h3>
        ${fieldHtml('Nama sekolah', `<input class="input" id="p-sek" value="${esc(S.nama_sekolah)}">`)}
        ${fieldHtml('Ujian aktif', `<input class="input" id="p-ujian" value="${esc(S.ujian_aktif)}" placeholder="mis. PAS Genap 2025/2026">`)}
        <p class="muted small" style="margin:-6px 0 12px">Mengganti ujian aktif = kunci & hasil baru terpisah. Hasil ujian lama tetap tersimpan sebagai arsip (bisa dipilih di filter Hasil).</p>
        <div class="grid2">${fieldHtml('KKM', `<input class="input tnum" id="p-kkm" inputmode="numeric" value="${esc(S.kkm)}">`)}${fieldHtml('Simpan foto bukti', `<div class="seg" id="p-foto"><button data-v="Ya" class="${S.simpan_foto === 'Ya' ? 'on' : ''}">Ya</button><button data-v="Tidak" class="${S.simpan_foto !== 'Ya' ? 'on' : ''}">Tidak</button></div>`)}</div>
        ${fieldHtml('Sensitivitas pembacaan tanda X', `<div class="seg" id="p-sens">${['rendah', 'sedang', 'tinggi'].map(v => `<button data-v="${v}" class="${S.sensitivitas === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`)}
        <p class="muted small">Tinggi = tanda tipis lebih mudah terbaca (risiko bekas hapusan terbaca). Rendah = hanya tanda tegas yang dihitung.</p></div>
      <div class="card"><div class="row" style="gap:12px;margin-bottom:14px"><span class="stat" style="padding:10px;margin:0;border:0;background:var(--primary-soft);color:var(--primary)">${ic('palette')}</span><div><h3>Palet Warna & Tampilan</h3><p class="muted small">Warna institusi sekolah dan mode tampilan bawaan guru</p></div></div>
        ${colorBlock('Warna Utama (Primary)', 'Tombol aksi, cincin skor, navigasi', 'p', S.warna_utama, PRESET_P)}
        <div id="p-ctr"></div><hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
        ${colorBlock('Warna Aksen', 'Status terdeteksi, progres, sorotan', 'a', S.warna_aksen, PRESET_A)}
        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
        <h3>Mode Tampilan Bawaan</h3><p class="muted small" style="margin-bottom:10px">Saat guru pertama kali membuka aplikasi. Guru tetap bisa mengganti sendiri.</p>
        <div class="seg" id="p-tema">${[['Terang', 'sun'], ['Gelap', 'moon'], ['Sistem', 'monitor']].map(([v, i]) => `<button data-v="${v}" class="${S.tema_bawaan === v ? 'on' : ''}">${ic(i, 'sm')} ${v === 'Sistem' ? 'Ikuti Sistem' : v}</button>`).join('')}</div></div>
      </div><div>
      <div class="card" style="background:var(--surface-2)"><div class="row between"><div class="row">${ic('eye')}<h3>Pratinjau Langsung</h3></div><span class="chip a">Live</span></div>
        <p class="muted small" style="margin:4px 0 14px">Layar hasil koreksi di HP guru</p><div class="preview-wrap" id="p-prev"></div></div>
      </div></div>
      <div class="sticky-act row" style="gap:10px"><button class="btn btn-soft" id="p-def">${ic('rotate-ccw')} <span>Kembalikan Bawaan</span></button><button class="btn btn-primary grow" id="p-save">${ic('save')} <span>Simpan Pengaturan</span></button></div>`;
      bind(); preview();
    };
    const colorBlock = (t, d, k, v, presets) => `<div class="row between"><div><b>${t}</b><div class="muted small">${d}</div></div><span class="chip p mono">HEX</span></div>
      <div class="colorrow" style="margin:10px 0"><input type="color" id="c-${k}" value="${esc(v)}" aria-label="${t}"><div class="input-wrap grow"><span style="position:absolute;left:14px;color:var(--muted)">#</span><input class="input mono" id="h-${k}" value="${esc(v.replace('#', '').toUpperCase())}" maxlength="6" style="padding-left:30px"></div></div>
      <div class="swatches">${presets.map(([n, c]) => `<button class="sw ${c.toLowerCase() === v.toLowerCase() ? 'on' : ''}" data-k="${k}" data-c="${c}"><i style="background:${c}">${c.toLowerCase() === v.toLowerCase() ? ic('check', 'sm') : ''}</i>${n}</button>`).join('')}</div>`;
    const setColor = (k, c) => {
      if (!/^#[0-9a-f]{6}$/i.test(c)) return;
      if (k === 'p') S.warna_utama = c.toUpperCase(); else S.warna_aksen = c.toUpperCase();
      $('#c-' + k, el).value = c; $('#h-' + k, el).value = c.replace('#', '').toUpperCase();
      $$(`.sw[data-k="${k}"]`, el).forEach(b => { const on = b.dataset.c.toLowerCase() === c.toLowerCase(); b.classList.toggle('on', on); $('i', b).innerHTML = on ? ic('check', 'sm') : ''; });
      applyBrand(S.warna_utama, S.warna_aksen); preview();
    };
    const bind = () => {
      ['p', 'a'].forEach(k => {
        $('#c-' + k, el).oninput = e => setColor(k, e.target.value);
        $('#h-' + k, el).oninput = e => { const v = '#' + e.target.value.replace(/[^0-9a-f]/gi, ''); if (v.length === 7) setColor(k, v); };
      });
      $$('.sw', el).forEach(b => b.onclick = () => setColor(b.dataset.k, b.dataset.c));
      const seg = (id, key) => $$('#' + id + ' button', el).forEach(b => b.onclick = () => { S[key] = b.dataset.v; $$('#' + id + ' button', el).forEach(x => x.classList.toggle('on', x === b)); preview(); });
      seg('p-foto', 'simpan_foto'); seg('p-sens', 'sensitivitas'); seg('p-tema', 'tema_bawaan');
      $('#p-def', el).onclick = () => { setColor('p', '#2563EB'); setColor('a', '#14B8A6'); };
      $('#p-save', el).onclick = e => withBtn(e.currentTarget, async () => {
        S.nama_sekolah = $('#p-sek', el).value.trim(); S.ujian_aktif = $('#p-ujian', el).value.trim(); S.kkm = $('#p-kkm', el).value.trim();
        if (!S.nama_sekolah || !S.ujian_aktif) return toast('Nama sekolah & ujian aktif wajib diisi.', 'warn');
        if (!(Number(S.kkm) >= 0 && Number(S.kkm) <= 100)) return toast('KKM harus 0–100.', 'warn');
        if (S.ujian_aktif !== s.ujian_aktif && !(await confirmDlg({ title: 'Ganti ujian aktif?', html: `Dari <b>${esc(s.ujian_aktif)}</b> ke <b>${esc(S.ujian_aktif)}</b>. Guru perlu mengisi kunci jawaban baru untuk ujian ini. Hasil lama tetap aman sebagai arsip.`, ok: 'Ya, ganti' }))) return;
        const res = await api('settingsSave', { nama_sekolah: S.nama_sekolah, ujian_aktif: S.ujian_aktif, kkm: S.kkm, simpan_foto: S.simpan_foto, sensitivitas: S.sensitivitas, warna_utama: S.warna_utama, warna_aksen: S.warna_aksen, tema_bawaan: S.tema_bawaan });
        if (!res.success) return toast(res.message, 'bad');
        Object.assign(AppState.boot.settings, res.data.settings); saveBootLocal();
        Store.del('pub'); toast(res.message); startApp();
      });
    };
    const preview = () => {
      const cr = contrast('#FFFFFF', S.warna_utama), crA = contrast('#0F172A', S.warna_aksen);
      const good = cr >= 4.5;
      $('#p-ctr', el).innerHTML = `<div class="info ${good ? 'ok' : 'warn'}">${ic(good ? 'circle-check' : 'triangle-alert')}<div><b>Rasio kontras teks putih ${cr.toFixed(1)}:1 (${cr >= 7 ? 'Lulus WCAG AAA' : good ? 'Lulus WCAG AA' : 'Kurang dari AA 4,5:1'})</b><br>${good ? 'Tombol & teks mudah dibaca di bawah cahaya kelas.' : 'Teks putih di atas warna ini sulit dibaca. Pilih warna lebih gelap.'}</div></div>`;
      const phone = dark => {
        const bg = dark ? '#0B1220' : '#F8FAFC', sf = dark ? '#111A2E' : '#FFFFFF', tx = dark ? '#E5E7EB' : '#0F172A', p = S.warna_utama, a = S.warna_aksen;
        const r = 46, C = 2 * Math.PI * r;
        return `<div><div class="muted small" style="text-align:center;margin-bottom:6px">${ic(dark ? 'moon' : 'sun', 'sm')} Mode ${dark ? 'Gelap' : 'Terang'}</div><div class="phone" style="--pv-bg:${bg};--pv-surface:${sf};--pv-text:${tx}">
          <div class="row" style="gap:6px;font-size:12px;font-weight:700"><span style="width:18px;height:18px;border-radius:5px;background:${p};color:#fff;display:grid;place-items:center;font-size:10px">K</span>Hasil Koreksi</div>
          <div class="pc"><div class="row between"><div><b style="font-size:12px">Ahmad Rizky</b><div style="font-size:10px;opacity:.6">Kelas 8A</div></div><span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px;background:${a};color:${contrast('#FFFFFF', a) >= 3 ? '#fff' : '#0F172A'}">Selesai</span></div></div>
          <div style="position:relative;width:110px;height:110px;margin:10px auto"><svg width="110" height="110" style="transform:rotate(-90deg)"><circle cx="55" cy="55" r="${r}" fill="none" stroke="${dark ? '#1E293B' : '#E2E8F0'}" stroke-width="9"/><circle cx="55" cy="55" r="${r}" fill="none" stroke="${p}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * .16}"/></svg><div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><b style="font-size:28px">84</b><div style="font-size:8px;opacity:.7">NILAI AKHIR</div></div></div></div>
          <div class="row" style="gap:5px">${[['42', 'Benar', a], ['6', 'Salah', '#DC2626'], ['2', 'Kosong', '#94A3B8']].map(([v, t, c]) => `<div class="pc" style="flex:1;text-align:center;margin:0;padding:6px"><b style="color:${c};font-size:13px">${v}</b><div style="font-size:9px;opacity:.6">${t}</div></div>`).join('')}</div>
          <div style="margin-top:8px;background:${p};color:#fff;border-radius:10px;text-align:center;font-size:11px;font-weight:700;padding:8px">Lanjut Scan</div></div></div>`;
      };
      $('#p-prev', el).innerHTML = phone(false) + phone(true);
    };
    draw();
  }
});

/* ---------------- Log Aktivitas ---------------- */
registerPage('log', {
  title: 'Log Aktivitas', admin: true,
  render(el) {
    let rows = null, q = '';
    const draw = () => {
      const nm = AppState.boot.guruNama || {};
      const list = (rows || []).filter(r => !q || (r.join(' ') + ' ' + (nm[r[1]] || '')).toLowerCase().includes(q));
      $('#lg-b', el).innerHTML = rows === null ? '<div class="skel" style="height:300px"></div>' : list.length ? `<div class="list">${list.slice(0, 400).map(r => `<div class="li" style="cursor:default;align-items:flex-start"><span class="avatar sm" style="background:var(--surface-3);color:var(--muted)">${esc(fmt.initials(nm[r[1]] || r[1]))}</span><div class="grow"><div class="row between"><b>${esc(r[2].replace(/_/g, ' '))}</b><span class="muted small">${fmt.dt(r[0])}</span></div><div class="sub">${esc(nm[r[1]] || r[1])}${r[3] ? ' · ' + esc(r[3]) : ''}</div></div></div>`).join('')}</div>` : `<div class="empty">${ic('history')}<p>Belum ada log.</p></div>`;
    };
    el.innerHTML = `<div class="page-h"><div class="grow"><h1>Log Aktivitas</h1><p class="muted">400 aktivitas terbaru (login, scan, koreksi, perubahan data)</p></div><button class="btn-icon solid" id="lg-r" aria-label="Segarkan">${ic('refresh-cw')}</button></div>
      <div class="toolbar"><div class="input-wrap">${ic('search')}<input class="input" id="lg-q" placeholder="Cari nama, aksi, detail…"></div></div><div id="lg-b"></div>`;
    $('#lg-q', el).oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    const load = force => swr('log', 'logList', {}, d => { rows = d.rows; draw(); }, { fresh: force ? 0 : 20000, force, onError: r => { $('#lg-b', el).innerHTML = `<div class="info bad">${ic('circle-x')}<div>${esc(r.message)}</div></div>`; } });
    $('#lg-r', el).onclick = e => withBtn(e.currentTarget, () => load(true));
    draw(); load();
  }
});
