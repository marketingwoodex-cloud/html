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
  5. Hours and the founding year. Every "Mon–Sat 10:00–7:30" the chrome, a footer or an answer prints is
     rewritten to entity.json's hours, in the shape each one already used; every JSON-LD
     openingHoursSpecification is written from them, as is the legacy `openingHours` shorthand the older
     pages carry beside it, and foundingDate from foundingYear. A variant of the hours the rewriter does
     not know stops the run with exit 1 rather than leaving a page half-corrected.
  6. llms.txt. The address line, an Hours line, and an "Official profiles" section.

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
# Directories that are never a page of the generation being written. The first five are what the live admin
# itself skips (admin.php all_pages()); the rest exist only in the repository, and a run rooted at the repo
# root — the older v26 generation, plan §4 task 2.2 — must not rewrite the console, the release folder, the
# documentation or a test fixture while it is there.
RESERVED = re.compile(
    r"^(_private|builder|admin|api|assets|frontend-v1|admin-v25|woodex-master-P25|docs|tools|tests|ci|deploy|db|node_modules)/"
)
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
# Opening hours and the founding year. Both facts had drifted: the chrome printed "Mon–Sat 9:30–6:30" (and,
# on seven project pages, "10:00–7:30"), the JSON-LD said 09:30–18:30 on 102 pages, and the founding year was
# hand-written on 331 of them. These two rewriters are what makes entity.json the only place either fact is
# written down. The hours rewriter keeps each occurrence's *shape* — the day range, the separator, whether the
# times carry a meridiem, 12- or 24-hour — and changes only the times, so a page's prose stays its own and the
# diff shows exactly what moved.
HOURS_RX = re.compile(
    r"(?P<day>(?i:Mon|Monday)\s*(?:–|—|-|to|&ndash;|&mdash;)\s*(?i:Sat|Saturday))"
    r"(?P<mid>[^<>{}\"0-9]{0,16})"
    r"(?P<o>\d{1,2}:\d{2})(?P<oa>\s*(?i:am|pm|a\.m\.|p\.m\.)?)"
    r"(?P<c1>\s*(?:–|—|-|to|&ndash;|&mdash;)\s*)"
    r"(?P<c>\d{1,2}:\d{2})(?P<ca>\s*(?i:am|pm|a\.m\.|p\.m\.)?)",
)
# The same pattern, looking for the *old* times: anything this run did not manage to rewrite is a variant the
# rewriter does not know, and the run must say so rather than leave a page half-corrected.
LEFTOVER_RX = re.compile(
    r"(?is)(?i:Mon|Monday)[^<>{}\"]{0,14}?(?:–|—|-|to|&ndash;|&mdash;)\s?(?i:Sat|Saturday)"
    r"[^<>{}\"]{0,70}?(?:9:30|09:30)[^<>{}\"]{0,40}"
)
# The legacy schema.org shorthand — `"openingHours": "Mo-Sa 09:30-18:30"` — which the older generation carries
# *beside* openingHoursSpecification. A consumer may read either, so the two must not disagree; the times are
# rewritten from entity.json and the day expression is left as the page wrote it.
LEGACY_OH_RX = re.compile(r'("openingHours"\s*:\s*")([^"]*)(")')
LEGACY_OH_TIME_RX = re.compile(r"\d{1,2}:\d{2}\s*(?:–|—|-|to)\s*\d{1,2}:\d{2}")
# The old times, for the net below: `19:30` must not be read as `9:30`, hence the leading-digit guard.
LEGACY_OH_OLD_RX = re.compile(r"(?<!\d)0?9:30|(?<!\d)6:30|18:30")

# Every number a page links. Two are published (entity.json telephone + telephoneAlt); anything else is a
# number somebody typed by hand, and the run names the page instead of leaving a third number to be found by a
# visitor. This is the check that would have caught the sweep that dropped the second number from the old pages.
PHONE_RX = re.compile(r"(?:tel:|wa\.me/|api\.whatsapp\.com/send\?phone=)(\+?[\d][\d\s().-]{5,18})")


YEAR_RX = re.compile(r"(?P<pre>(?i:since|established|founded|est\.)\s+(?:in\s+)?)(?P<year>(?:19|20)\d{2})")


def t12(hhmm: str) -> str:
    """'19:30' → '7:30'. The chrome writes 12-hour times and never carried a meridiem; keep that."""
    h, m = hhmm.split(":")
    return f"{int(h) % 12 or 12}:{m}"


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
        self.n = {k: 0 for k in ("pages", "pages_changed", "full", "stub", "org", "links", "embed", "rows", "no_row", "score", "ticks", "hours", "years")}
        self.skipped: list[str] = []
        self.leftovers: list[str] = []
        self.unknown_phones: list[str] = []
        g = ent["google"]
        self.place_link = esc(g["placeLink"])
        self.embed_q = urllib.parse.quote(g["embedQuery"], safe="")

    # ---------------------------------------------------------------- schema
    def full_node(self, n: dict) -> dict:
        e = self.ent
        n = put(n, "@id", e["id"], after="@type")
        n = put(n, "url", e["url"], after="name")
        phones = self.published_phones()
        n = put(n, "telephone", phones[0] if len(phones) == 1 else phones, after="url")
        n = put(n, "email", e["email"], after="telephone")
        n = put(n, "address", {"@type": "PostalAddress", **e["address"]}, after="email")
        n = put(n, "geo", {"@type": "GeoCoordinates", **e["geo"]}, after="address")
        n = put(n, "openingHoursSpecification", self.hours_block(), after="geo")
        n = put(n, "hasMap", e["google"]["mapsUrl"], after="openingHoursSpecification")
        n = put(n, "sameAs", list(e["sameAs"]), after="hasMap")
        n = put(n, "foundingDate", str(e["foundingYear"]), after="sameAs")
        return n

    def hours_block(self) -> list[dict]:
        """The JSON-LD the site already carried (day list, opens, closes) — now written from entity.json."""
        h = self.ent["hours"]
        return [{"@type": "OpeningHoursSpecification", "dayOfWeek": list(h["days"]), "opens": h["opens"], "closes": h["closes"]}]

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

    # ---------------------------------------------------------------- the published numbers
    def published_phones(self) -> list[str]:
        """Both published numbers, canonical first. A list of one stays a string in JSON-LD."""
        e = self.ent
        out = [e["telephone"]]
        alt = e.get("telephoneAlt")
        if alt and alt not in out:
            out.append(alt)
        return out

    def phones(self, s: str, rel: str) -> str:
        allowed = {re.sub(r"\D", "", p) for p in self.published_phones()}
        for m in PHONE_RX.finditer(s):
            digits = re.sub(r"\D", "", m.group(1))
            if digits and digits not in allowed:
                self.unknown_phones.append(f"{rel}: {m.group(0)[:60]!r}")
        return s

    # ---------------------------------------------------------------- hours and the founding year
    def legacy_hours(self, s: str, rel: str) -> str:
        h = self.ent["hours"]
        want = f'{h["opens"]}-{h["closes"]}'

        def cb(m: re.Match) -> str:
            value = m.group(2)
            new = LEGACY_OH_TIME_RX.sub(want, value)
            if new != value:
                self.n["hours"] += 1
            elif LEGACY_OH_OLD_RX.search(value):
                # Not an HH:MM-HH:MM range the rewriter can move (a hand-written "9:30am-6:30pm", say), so say
                # so instead of leaving the node stating two different sets of hours.
                self.leftovers.append(f"{rel}: openingHours {value!r} is not an HH:MM-HH:MM range")
            return m.group(1) + new + m.group(3)

        return LEGACY_OH_RX.sub(cb, s)

    def hours(self, s: str, rel: str) -> str:
        h = self.ent["hours"]

        def rewrite(m: re.Match) -> str:
            o, c = m.group("o"), m.group("c")
            four = bool(re.match(r"0\d:", o)) or int(c.split(":")[0]) > 12
            new_o, new_c = (h["opens"], h["closes"]) if four else (t12(h["opens"]), t12(h["closes"]))
            out = m.group("day") + m.group("mid") + new_o + m.group("oa") + m.group("c1") + new_c + m.group("ca")
            if out != m.group(0):
                self.n["hours"] += 1
            return out

        s = self.legacy_hours(s, rel)
        s = HOURS_RX.sub(rewrite, s)
        for m in LEFTOVER_RX.finditer(s):
            self.leftovers.append(f"{rel}: {m.group(0).strip()[:80]!r}")
        return s

    def years(self, s: str) -> str:
        y = str(self.ent["foundingYear"])

        def cb(m: re.Match) -> str:
            out = m.group("pre") + y
            if out != m.group(0):
                self.n["years"] += 1
            return out

        return YEAR_RX.sub(cb, s)

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
        line = self.ent["hours"]["llms"]
        if re.search(r"(?m)^- Hours: ", s):
            s = re.sub(r"(?m)^- Hours: .*$", lambda m: line, s, count=1)
        else:
            # No line yet: put one under the address, where a reader looks for it.
            s = re.sub(r"(?m)^(- Address: .*)$", lambda m: m.group(1) + "\n" + line, s, count=1)
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
        new = run.phones(run.years(run.hours(run.reviews(run.footer(run.links(run.schema(old, rel)))), rel)), rel)
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
    print(f"  hours:  {n['hours']} time pair(s) and legacy openingHours value(s) set from entity.json")
    print(f"  year:   {n['years']} statement(s) of the founding year corrected")
    print(f"  phones: {len(run.published_phones())} published number(s), all page links checked")
    for s in run.skipped:
        print("  skipped " + s)
    if run.unknown_phones:
        print(f"  {len(run.unknown_phones)} link(s) to a number that is not in entity.json (telephone/telephoneAlt):")
        for line in run.unknown_phones[:20]:
            print("    " + line)
        return 1
    if run.leftovers:
        print(f"  {len(run.leftovers)} opening-hours variant(s) this rewrite does not know — the pattern needs extending:")
        for line in run.leftovers[:20]:
            print("    " + line)
        return 1
    if args.check and stale:
        for rel in stale[:20]:
            print("  out of date: " + rel)
        print("Run: python3 tools/apply-entity.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
