#!/usr/bin/env python3
"""
tools/apply-entity.py: put Woodex Interior's identity (tools/entity.json) on every page of frontend-v1.

Run it after changing tools/entity.json. It is idempotent: a second run changes nothing.

  1. Schema. Every full LocalBusiness node (one with an address or a telephone, named like the studio)
     gets the shared @id, the canonical url, the email, a complete PostalAddress (city and postal code),
     the Google listing's pin as geo, the Google listing as hasMap, and sameAs. Every bare reference
     ({"@type": "LocalBusiness", "name": ...}) gets the shared @id. The full Organization node that already
     carries the shared @id (the home page's) gets sameAs. Other nodes are not touched.
  2. Map links. The Google Maps search links the pages use for the studio open the Google listing
     itself (reviews, photos, directions). The contact page's embedded map asks for the studio by name,
     so it pins the listing rather than the building.
  3. Footer. The social row ends with the footer profiles, in exactly the markup the admin's
     Business info screen writes (data-soc anchors, its SVG paths, its order). A later "Update website"
     from that screen with the same links therefore changes nothing.
  4. Reviews. The home page's score panel shows the Google listing's real rating and count
     (google.rating in entity.json), and no review card claims to be "Verified": Google itself says
     its reviews are not verified.
  5. llms.txt. The address line, and an "Official profiles" section.

Pages are what the live admin treats as pages (admin.php all_pages(): every .html file outside
_private/, builder/, admin/, api/ and assets/). Schema blocks are re-serialised compactly with UTF-8,
which reproduces every block on the site byte for byte, so only a changed block shows in a diff.

Usage:
  python3 tools/apply-entity.py              write the changes
  python3 tools/apply-entity.py --check      change nothing; exit 1 if a file is out of date (CI)
  python3 tools/apply-entity.py --root DIR   another copy of the site (default: frontend-v1)
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import tempfile
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ENTITY_FILE = REPO / "tools" / "entity.json"
RESERVED = re.compile(r"^(_private|builder|admin|api|assets)/")
LD_RX = re.compile(r'(<script[^>]*type=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)', re.S | re.I)
ROW_RX = re.compile(r'(<div class="footer-social"[^>]*>)(.*?)(</div>)', re.S)
SOC_ANCHOR_RX = re.compile(r'<a data-soc="[^"]*"[\s\S]*?</a>')

# The Google Maps links the site has used for the studio. Each is replaced by the listing link.
LEGACY_MAP_LINKS = [
    "https://www.google.com/maps/search/?api=1&amp;query=M-71%2C%20Zainab%20Tower%2C%20Model%20Town%20Link%20Road%2C%20Lahore",
    "https://www.google.com/maps/search/?api=1&amp;query=Woodex+Interior+Zainab+Tower+Model+Town+Link+Road+Lahore",
    "https://www.google.com/maps/search/Woodex+Interior+Lahore",
]
# A listing link written by an earlier run (any place ID), so a new place ID replaces the old one.
PLACE_LINK_RX = re.compile(
    r"https://www\.google\.com/maps/search/\?api=1&amp;query=Woodex%20Interior%20Lahore&amp;query_place_id=[A-Za-z0-9_-]+"
)
# The home page's review score: stars, their label and the count.
SCORE_RX = re.compile(r'(<div class="st big" aria-label=")[^"]*(">).*?(</div><p>)Based on <b>[^<]*</b>(</p>)', re.S)
VERIFIED_TICK = '<i title="Verified" aria-hidden="true">✓</i>'
# The contact page's embedded map, before and after this tool.
EMBED_RX = re.compile(r'(src=")https://maps\.google\.com/maps\?q=[^"&]*(&amp;t=m&amp;z=16&amp;ie=UTF8&amp;iwloc=&amp;output=embed")')


def esc(s: str) -> str:
    """The admin's esc(): & < > " ' as &amp; &lt; &gt; &quot; &#39;."""
    return re.sub(r"[&<>\"']", lambda m: {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[m.group(0)], s)


def load_soc(root: Path) -> list[list[str]]:
    """The admin's SOC table ([key, label, svg path] per network), read from its own source."""
    for src in (root / "admin" / "admin-fields.js", REPO / "frontend-v1" / "admin" / "admin-fields.js"):
        if src.is_file():
            m = re.search(r"var SOC = (\[\[.*?\]\]);", src.read_text(encoding="utf-8"), re.S)
            if m:
                return json.loads(m.group(1))
    sys.exit("apply-entity: cannot read the SOC table from admin/admin-fields.js")


def types_of(node: dict) -> list:
    t = node.get("@type")
    return t if isinstance(t, list) else [t]


def put(d: dict, key: str, value, after: str | None = None) -> dict:
    """Set d[key] = value. A new key goes right after `after` (or at the end), so the order stays readable."""
    if key in d or after is None or after not in d:
        out = dict(d)
        out[key] = value
        return out
    out = {}
    for k, v in d.items():
        out[k] = v
        if k == after:
            out[key] = value
    return out


class Run:
    def __init__(self, root: Path, ent: dict, soc: list[list[str]]):
        self.root, self.ent, self.soc = root, ent, soc
        self.n = {k: 0 for k in ("pages", "pages_changed", "full", "stub", "org", "links", "embed", "rows", "no_row", "score", "ticks")}
        self.skipped: list[str] = []
        g = ent["google"]
        self.place_link = esc(g["placeLink"])
        self.embed_q = urllib.parse.quote(g["embedQuery"], safe="")

    # ---------------------------------------------------------------- schema
    def full_node(self, n: dict) -> dict:
        e = self.ent
        n = put(n, "@id", e["id"], after="@type")
        n = put(n, "url", e["url"], after="name")
        n = put(n, "telephone", e["telephone"], after="url")
        n = put(n, "email", e["email"], after="telephone")
        n = put(n, "address", {"@type": "PostalAddress", **e["address"]}, after="email")
        n = put(n, "geo", {"@type": "GeoCoordinates", **e["geo"]}, after="address")
        n = put(n, "hasMap", e["google"]["mapsUrl"], after="geo")
        n = put(n, "sameAs", list(e["sameAs"]), after="hasMap")
        return n

    def changed(self, kind: str, old: dict, new: dict) -> dict:
        """Count a node only when it actually changes, so a second run reports nothing."""
        if json.dumps(new, ensure_ascii=False) != json.dumps(old, ensure_ascii=False):
            self.n[kind] += 1
        return new

    def walk(self, x, where: str):
        if isinstance(x, list):
            return [self.walk(v, where) for v in x]
        if not isinstance(x, dict):
            return x
        x = {k: self.walk(v, where) for k, v in x.items()}
        t = types_of(x)
        if "LocalBusiness" in t:
            if x.get("name") != self.ent["name"]:
                self.skipped.append(f"{where}: LocalBusiness named {x.get('name')!r}")
                return x
            if "address" in x or "telephone" in x:
                return self.changed("full", x, self.full_node(x))
            if set(x) <= {"@type", "name", "@id"}:
                return self.changed("stub", x, put(x, "@id", self.ent["id"], after="@type"))
            self.skipped.append(f"{where}: partial LocalBusiness with keys {sorted(x)}")
            return x
        if "Organization" in t and x.get("@id") == self.ent["id"] and set(x) - {"@id", "@type", "name", "@context"}:
            return self.changed("org", x, put(x, "sameAs", list(self.ent["sameAs"]), after="url"))
        return x

    def schema(self, s: str, rel: str) -> str:
        out, last = [], 0
        for m in LD_RX.finditer(s):
            raw = m.group(2)
            data = json.loads(raw)
            new = self.walk(data, rel)
            if new != data:
                raw = json.dumps(new, separators=(",", ":"), ensure_ascii=False)
            out.append(s[last:m.start(2)] + raw)
            last = m.end(2)
        out.append(s[last:])
        return "".join(out)

    # ---------------------------------------------------------------- links, embed, footer
    def links(self, s: str) -> str:
        for old in LEGACY_MAP_LINKS:
            for q in ('"', "'"):
                c = s.count(old + q)
                if c:
                    self.n["links"] += c
                    s = s.replace(old + q, self.place_link + q)

        def place(m):
            if m.group(0) != self.place_link:
                self.n["links"] += 1
            return self.place_link

        def emb(m):
            new = m.group(1) + "https://maps.google.com/maps?q=" + self.embed_q + m.group(2)
            if new != m.group(0):
                self.n["embed"] += 1
            return new

        return EMBED_RX.sub(emb, PLACE_LINK_RX.sub(place, s))

    def soc_html(self) -> str:
        fs = self.ent["footerSocial"]
        return "".join(
            f'<a data-soc="{k}" href="{esc(fs[k])}" target="_blank" rel="noopener" aria-label="{label}">'
            f'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="{path}"/></svg></a>'
            for k, label, path in self.soc
            if fs.get(k)
        )

    def footer(self, s: str) -> str:
        m = ROW_RX.search(s)
        if not m:
            self.n["no_row"] += 1
            return s
        inner = SOC_ANCHOR_RX.sub("", m.group(2)) + self.soc_html()
        if inner == m.group(2):
            return s
        self.n["rows"] += 1
        return s[: m.start(2)] + inner + s[m.end(2):]

    # ---------------------------------------------------------------- reviews
    def reviews(self, s: str) -> str:
        if 'class="hm-rv-' not in s:
            return s
        r = self.ent["google"]["rating"]
        full, half = divmod(round(float(r["value"]) * 2), 2)
        stars = "★" * full + ("<span>★</span>" if half else "")

        def score(m):
            new = f'{m.group(1)}{r["value"]} out of 5 stars{m.group(2)}{stars}{m.group(3)}Based on <b>{r["count"]} Google reviews</b>{m.group(4)}'
            if new != m.group(0):
                self.n["score"] += 1
            return new

        s = SCORE_RX.sub(score, s, count=1)
        c = s.count(VERIFIED_TICK)
        if c:
            self.n["ticks"] += c
            s = s.replace(VERIFIED_TICK, "")
        return s

    # ---------------------------------------------------------------- llms.txt
    def llms(self, s: str) -> str:
        e, a = self.ent, self.ent["address"]
        addr = f"- Address: {a['streetAddress']}, {a['addressLocality']} {a['postalCode']}, {a['addressRegion']}, Pakistan"
        s = re.sub(r"(?m)^- Address: .*$", lambda m: addr, s, count=1)
        label = {"maps.google.com": "Google Business Profile (Google Maps)", "www.facebook.com": "Facebook",
                 "www.linkedin.com": "LinkedIn", "x.com": "X", "www.instagram.com": "Instagram",
                 "www.youtube.com": "YouTube", "www.pinterest.com": "Pinterest", "www.tiktok.com": "TikTok"}
        lines = ["## Official profiles"]
        for u in e["sameAs"]:
            lines.append(f"- {label.get(urllib.parse.urlparse(u).netloc, urllib.parse.urlparse(u).netloc)}: {u}")
        sb = e.get("sisterBrand")
        if sb:
            lines.append(f"- Sister brand for furniture: {sb['name']}, {sb['url']} (a separate business with its own Google listing)")
        block = "\n".join(lines) + "\n"
        if re.search(r"(?m)^## Official profiles$", s):
            return re.sub(r"(?ms)^## Official profiles\n.*?(?=^## |\Z)", lambda m: block + "\n", s, count=1)
        return re.sub(r"(?m)^## ", lambda m: block + "\n## ", s, count=1)

    # ---------------------------------------------------------------- files
    def pages(self):
        for p in sorted(self.root.rglob("*.html")):
            rel = p.relative_to(self.root).as_posix()
            if not RESERVED.match(rel):
                yield p, rel


def read(p: Path) -> str:
    """Read without translating line endings, so a CRLF file is written back as CRLF."""
    with open(p, encoding="utf-8", newline="") as f:
        return f.read()


def write_atomic(p: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".apply-entity-")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.chmod(tmp, p.stat().st_mode & 0o777)
    os.replace(tmp, p)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=str(REPO / "frontend-v1"))
    ap.add_argument("--check", action="store_true", help="change nothing; exit 1 if a file is out of date")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    ent = json.loads(ENTITY_FILE.read_text(encoding="utf-8"))
    run = Run(root, ent, load_soc(root))

    stale: list[str] = []
    for p, rel in run.pages():
        run.n["pages"] += 1
        old = read(p)
        new = run.reviews(run.footer(run.links(run.schema(old, rel))))
        if new != old:
            run.n["pages_changed"] += 1
            stale.append(rel)
            if not args.check:
                write_atomic(p, new)
    llms = root / "llms.txt"
    if llms.is_file():
        old = read(llms)
        new = run.llms(old)
        if new != old:
            stale.append("llms.txt")
            if not args.check:
                write_atomic(llms, new)

    n = run.n
    print(f"apply-entity: {n['pages']} pages, {n['pages_changed']} {'out of date' if args.check else 'changed'}"
          f"{' + llms.txt' if 'llms.txt' in stale else ''}")
    print(f"  schema: {n['full']} full LocalBusiness nodes, {n['stub']} references, {n['org']} Organization nodes")
    print(f"  links:  {n['links']} map links, {n['embed']} embedded map(s)")
    print(f"  footer: {n['rows']} social rows updated, {n['no_row']} pages without a social row")
    print(f"  reviews: {n['score']} score panel(s) set from the Google listing, {n['ticks']} 'Verified' tick(s) removed")
    for s in run.skipped:
        print("  skipped " + s)
    if args.check and stale:
        for rel in stale[:20]:
            print("  out of date: " + rel)
        print("Run: python3 tools/apply-entity.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
