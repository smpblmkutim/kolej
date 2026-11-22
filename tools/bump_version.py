#!/usr/bin/env python3
"""
bump_version.py — naikkan versi aplikasi PWA sekaligus di semua tempat.

Pemakaian:
  python3 bump_version.py path/ke/folder-aplikasi 1.0.1
  python3 bump_version.py path/ke/folder-aplikasi            # otomatis +1 angka terakhir

Yang diubah:
  • sw.js:   const VERSION = 'nama-v1.0.0'  →  'nama-v1.0.1'
  • *.html, *.js, *.webmanifest:  ?v=1.0.0  →  ?v=1.0.1   (semua versi lama apa pun)
  • js/config.js (bila ada): APP_VERSION: '1.0.0' → '1.0.1'
Tanpa menaikkan VERSION, HP yang sudah menginstal tetap memakai file lama dari cache.
"""
import os, re, sys

SKIP_DIRS = {".git", "node_modules", "__pycache__"}


def files(base, exts):
    for root, dirs, fs in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in fs:
            if f.endswith(exts):
                yield os.path.join(root, f)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    base = os.path.abspath(sys.argv[1])
    sw = os.path.join(base, "sw.js")
    if not os.path.exists(sw):
        sys.exit("sw.js tidak ditemukan di " + base)
    src = open(sw, encoding="utf-8").read()
    m = re.search(r"(VERSION\s*=\s*['\"])([^'\"]*?)(\d+(?:\.\d+)*)(['\"])", src)
    if not m:
        sys.exit("Baris  const VERSION = '...-v1.0.0'  tidak ditemukan di sw.js")
    old = m.group(3)
    if len(sys.argv) > 2:
        new = sys.argv[2].lstrip("v")
    else:
        parts = old.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        new = ".".join(parts)
    if not re.fullmatch(r"\d+(\.\d+)*", new):
        sys.exit("Versi harus berupa angka, mis. 1.0.1")

    changed = []
    for path in files(base, (".html", ".htm", ".js", ".webmanifest")):
        txt = open(path, encoding="utf-8", errors="ignore").read()
        out = re.sub(r"\?v=[\w.\-]+", "?v=" + new, txt)
        if path == sw:
            out = re.sub(r"(VERSION\s*=\s*['\"])([^'\"]*?)(\d+(?:\.\d+)*)(['\"])", lambda mm: mm.group(1) + mm.group(2) + new + mm.group(4), out, count=1)
        if os.path.basename(path) == "config.js":
            out = re.sub(r"(APP_VERSION\s*:\s*['\"])[^'\"]*(['\"])", lambda mm: mm.group(1) + new + mm.group(2), out)
        if out != txt:
            open(path, "w", encoding="utf-8").write(out)
            changed.append(os.path.relpath(path, base))
    print("Versi %s → %s" % (old, new))
    for c in changed:
        print("  ✏️  " + c)
    print("Selesai. Deploy (git push) agar HP pengguna menerima banner 'Versi baru tersedia'.")


if __name__ == "__main__":
    main()
