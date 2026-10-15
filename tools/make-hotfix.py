#!/usr/bin/env python3
"""make-hotfix.py — build a small overlay package for the live v2.0 site (frontend-v1/).

A hotfix is a handful of files uploaded over public_html, not a full release. The rules are the same as
tools/make-release.mjs (master plan §8.3):

  * the manifest records the commit, and the SHA-256 and size of every file;
  * it also records each file's hash in the base release (``--base``, default ``origin/main``), so the
    production inventory can show that the server still had the base file before it was overwritten;
  * it refuses to package a credential or anything that must never ship: _private/, .env, config.php,
    db.json, *.sql, the wx-*.php installers and diagnostics, downloads.html and blocks.html;
  * it never packages .htaccess. The live file holds a block the admin manages (redirects), so the change
    ships as a snippet to paste instead (``--htaccess-snippet``).

Usage:
  python3 tools/make-hotfix.py --name P22.2 --snippet FILE  PATH [PATH ...]
      PATH is relative to frontend-v1/ (a directory adds every file under it).
  Output: woodex-hotfix-<name>/ with the zip, MANIFEST.json and the snippet.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = ROOT / "frontend-v1"

NEVER_SHIP = re.compile(
    r"(^|/)(_private/|\.env($|\.)|config\.php$|db\.json$|[^/]*\.sql$|wx-[^/]*\.php$|downloads\.html$|blocks\.html$|\.htaccess$)",
    re.I,
)
SECRET_PATTERNS = {
    "telegram bot token": re.compile(rb"\b\d{8,10}:[A-Za-z0-9_-]{35}\b"),
    "Google API key": re.compile(rb"AIza[0-9A-Za-z_\-]{35}"),
    "AWS key": re.compile(rb"AKIA[0-9A-Z]{16}"),
    "GitHub token": re.compile(rb"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})"),
    "private key": re.compile(rb"-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "OpenAI key": re.compile(rb"\bsk-(proj-)?[A-Za-z0-9]{32,}"),
    "Anthropic key": re.compile(rb"\bsk-ant-[A-Za-z0-9_-]{20,}"),
    "Meta token": re.compile(rb"\bEAA[A-Za-z0-9]{100,}"),
}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def base_hash(base: str, rel: str) -> str | None:
    try:
        blob = subprocess.run(["git", "show", f"{base}:frontend-v1/{rel}"], cwd=ROOT, check=True, capture_output=True).stdout
    except subprocess.CalledProcessError:
        return None  # new in this hotfix
    return hashlib.sha256(blob).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True, help="hotfix name, e.g. P22.2")
    ap.add_argument("--base", default="origin/main", help="git ref of the release being patched")
    ap.add_argument("--snippet", help="text file with the .htaccess lines to paste (shipped beside the zip)")
    ap.add_argument("paths", nargs="+", help="paths relative to frontend-v1/")
    a = ap.parse_args()

    if git("status", "--porcelain", "--", "frontend-v1"):
        print("✗ frontend-v1/ has uncommitted changes; commit first so the manifest names a real commit", file=sys.stderr)
        return 1

    files: list[str] = []
    for p in a.paths:
        full = BASE_DIR / p
        if full.is_dir():
            files += sorted(str(f.relative_to(BASE_DIR)).replace(os.sep, "/") for f in full.rglob("*") if f.is_file())
        elif full.is_file():
            files.append(p)
        else:
            print(f"✗ not found: frontend-v1/{p}", file=sys.stderr)
            return 1

    refused = []
    for rel in files:
        if NEVER_SHIP.search(rel):
            refused.append(f"{rel}: never ships")
            continue
        data = (BASE_DIR / rel).read_bytes()
        for label, pat in SECRET_PATTERNS.items():
            if pat.search(data):
                refused.append(f"{rel}: looks like it holds a {label}")
    if refused:
        print("✗ refusing to build:\n  " + "\n  ".join(refused), file=sys.stderr)
        return 1

    out = ROOT / f"woodex-hotfix-{a.name}"
    out.mkdir(exist_ok=True)
    zpath = out / f"woodex-hotfix-{a.name}.zip"
    entries = []
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files:
            data = (BASE_DIR / rel).read_bytes()
            info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))  # fixed time: the same input gives the same zip
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
            entries.append({
                "path": rel,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "base_sha256": base_hash(a.base, rel),
            })

    if a.snippet:
        (out / "htaccess-snippet.txt").write_text(Path(a.snippet).read_text(encoding="utf-8"), encoding="utf-8")

    manifest = {
        "name": f"woodex-hotfix-{a.name}",
        "kind": "overlay for public_html (frontend-v1); upload over the existing files",
        "commit": git("rev-parse", "HEAD"),
        "base": {"ref": a.base, "commit": git("rev-parse", a.base)},
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "zip": {"file": zpath.name, "bytes": zpath.stat().st_size, "sha256": hashlib.sha256(zpath.read_bytes()).hexdigest()},
        "files": entries,
        "never_shipped": ["wx-install.php", "wx-check.php", "wx-demo.php", "downloads.html", "blocks.html", "_private/", ".htaccess (snippet instead)"],
        "htaccess_snippet": "htaccess-snippet.txt" if a.snippet else None,
    }
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"✓ {zpath.relative_to(ROOT)}  {len(files)} file(s), {zpath.stat().st_size // 1024} KB")
    print(f"✓ {(out / 'MANIFEST.json').relative_to(ROOT)}  commit {manifest['commit'][:8]}, base {a.base} {manifest['base']['commit'][:8]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
