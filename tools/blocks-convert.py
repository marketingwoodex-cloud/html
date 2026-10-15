#!/usr/bin/env python3
"""blocks-convert.py — split live pages into (blocks.json + meta.json) drafts.

P2-1 scope:
  * seed content/pages/index.json registry for every public page
  * pilot-convert named pages to blocks/meta (raw block slices of <main>)
  * roundtrip check: render(meta, blocks, donor) must byte-match the live page

Block model (Phase 2):
  blocks.json = ordered array of {id, type, hidden?, html}  (P2-1: type=raw)
  meta.json   = {title, description, canonical}
  publish = splice new <main> inner + head meta into the CURRENT live page.
"""
import re, json, os, sys, glob, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
TAG_RE = re.compile(r"<!--.*?-->|<(?P<close>/?)(?P<tag>[a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(/?)>", re.S)

def slug_of(path):
    d = os.path.dirname(path)
    return "/" if d in ("", ".") else f"/{d}/"

def path_of(slug):
    return "index.html" if slug == "/" else f"{slug.strip('/')}/index.html"

def split_main(html):
    """Return (main_open_end, main_close_start, [child_html...], pre, post).

    Slices partition <main>'s inner content exactly (prefix whitespace goes
    into the following slice), so "".join(children) == inner byte-for-byte.
    """
    m = re.search(r"<main\b[^>]*>", html, re.I)
    if not m:
        raise ValueError("no <main>")
    start = m.end()
    end = html.index("</main>", start)
    inner = html[start:end]
    children, depth = [], 0
    cur_start = None
    next_start = 0
    for t in TAG_RE.finditer(inner):
        if t.group(0).startswith("<!--"):
            continue
        tag = t.group("tag").lower()
        is_close = bool(t.group("close"))
        self_close = t.group(0).endswith("/>")
        if is_close:
            depth -= 1
            if depth == 0 and cur_start is not None:
                children.append(inner[cur_start:t.end()])
                next_start = t.end()
                cur_start = None
        else:
            if tag in VOID or self_close:
                if depth == 0:
                    children.append(inner[next_start:t.end()])
                    next_start = t.end()
                continue
            if depth == 0 and cur_start is None:
                cur_start = next_start
            depth += 1
    tail = inner[next_start:]
    if cur_start is not None:
        children.append(inner[cur_start:])  # unbalanced: keep as-is
    elif tail:
        if children:
            children[-1] += tail  # trailing whitespace belongs to last block
        else:
            children.append(tail)
    return start, end, children, html[:start], html[end:]

def head_meta(html, path):
    def grab(rx, default=""):
        m = re.search(rx, html, re.S)
        return m.group(1).strip() if m else default
    return {
        "title": grab(r"<title>(.*?)</title>"),
        "description": grab(r'<meta name="description" content="([^"]*)"'),
        "canonical": grab(r'<link rel="canonical" href="([^"]*)"'),
    }

def new_id(html):
    return hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]

def content_dir(slug):
    return os.path.join("content/pages", slug.strip("/") if slug != "/" else "home")

def convert_page(path):
    slug = slug_of(path)
    html = open(path, encoding="utf-8").read()
    _s, _e, children, _pre, _post = split_main(html)
    blocks = [{"id": new_id(c), "type": "raw", "html": c} for c in children]
    meta = head_meta(html, path)
    outdir = content_dir(slug)
    os.makedirs(outdir, exist_ok=True)
    json.dump(blocks, open(f"{outdir}/blocks.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump(meta, open(f"{outdir}/meta.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return slug, meta, len(blocks)

def render_page(live_html, meta, blocks):
    """Same algorithm as _page-render.mjs — keep in sync!"""
    inner = "".join(b["html"] for b in blocks if not b.get("hidden"))
    out = re.sub(r"(<main\b[^>]*>).*?(</main>)",
                 lambda m: m.group(1) + inner + m.group(2),
                 live_html, count=1, flags=re.S | re.I)
    if meta.get("title"):
        out = re.sub(r"<title>.*?</title>", lambda m: "<title>" + meta["title"] + "</title>",
                     out, count=1, flags=re.S)
        out = re.sub(r'(<meta property="og:title" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["title"] + m.group(2), out, count=1)
        out = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["title"] + m.group(2), out, count=1)
    if meta.get("description"):
        out = re.sub(r'(<meta name="description" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["description"] + m.group(2), out, count=1)
        out = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["description"] + m.group(2), out, count=1)
        out = re.sub(r'(<meta name="twitter:description" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["description"] + m.group(2), out, count=1)
    if meta.get("canonical"):
        if re.search(r'<link rel="canonical" href="', out):
            out = re.sub(r'(<link rel="canonical" href=")[^"]*(")',
                         lambda m: m.group(1) + meta["canonical"] + m.group(2), out, count=1)
        else:
            out = out.replace("</head>", f'<link rel="canonical" href="{meta["canonical"]}" />\n</head>', 1)
        out = re.sub(r'(<meta property="og:url" content=")[^"]*(")',
                     lambda m: m.group(1) + meta["canonical"] + m.group(2), out, count=1)
    return out

def main():
    files = sorted(f for f in glob.glob("**/index.html", recursive=True)
                   if not f.startswith(("admin/", "netlify/", "content/")) and ".git" not in f)
    pages = []
    for f in files:
        html = open(f, encoding="utf-8").read()
        if "<main" not in html:
            continue
        m = re.search(r"<title>(.*?)</title>", html, re.S)
        pages.append({"slug": slug_of(f), "title": m.group(1).strip() if m else "",
                      "path": f})
    os.makedirs("content/pages", exist_ok=True)
    json.dump({"generated": "phase2", "pages": pages},
              open("content/pages/index.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"registry: {len(pages)} pages")

    pilots = sys.argv[1:] or ["kitchen-design/index.html"]
    ok = True
    for p in pilots:
        slug, meta, n = convert_page(p)
        live = open(p, encoding="utf-8").read()
        blocks = json.load(open(os.path.join(content_dir(slug), "blocks.json"), encoding="utf-8"))
        rendered = render_page(live, meta, blocks)
        if rendered == live:
            print(f"  roundtrip OK  {slug}  ({n} blocks)")
        else:
            ok = False
            print(f"  roundtrip FAIL {slug}")
            for i, (a, b) in enumerate(zip(live, rendered)):
                if a != b:
                    print("   first diff @", i, repr(live[i-40:i+60]), "VS", repr(rendered[i-40:i+60]))
                    break
            print("   lengths:", len(live), len(rendered))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
