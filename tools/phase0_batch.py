#!/usr/bin/env python3
"""Phase 0 batch: favicon, OG/Twitter, privacy link, estimator links,
/services/ fix, FAQ JSON-LD, img dimensions+lazy, sitemap, privacy page."""
import re, json, glob, os, html as H

ROOT = "/home/user/-marketingwoodex"
os.chdir(ROOT)

files = sorted(f for f in glob.glob("**/*.html", recursive=True)
               if not f.startswith(("admin/", "netlify/")) and ".git" not in f)
OG_IMG = "https://woodex.com.pk/assets/img/img-c7d3a3ebd62b.jpg"
SITE = "https://woodex.com.pk"
stats = {k: 0 for k in ["favicon", "og", "privacy_link", "est_link", "faq_fix", "img_meta", "lazy", "services_fix"]}

# ---------- image dimensions cache ----------
from PIL import Image
dim_cache = {}
def dims(rel):
    p = "." + rel.split("?")[0]
    if p not in dim_cache and os.path.isfile(p):
        try:
            dim_cache[p] = Image.open(p).size
        except Exception:
            pass
    return dim_cache.get(p)

# ---------- FAQ extraction ----------
def extract_hm_faqs(h):
    out = []
    for m in re.finditer(r'class="hm-faq-item">(.*?)</button><div class="hm-faq-a">(.*?)</div></div>', h, re.S):
        q = re.search(r'<span>(.*?)</span>', m.group(1), re.S)
        a = re.search(r'<p>(.*?)</p>', m.group(2), re.S)
        if q and a:
            out.append((H.unescape(q.group(1)).strip(), H.unescape(re.sub(r"<[^>]+>", "", a.group(1))).strip()))
    return out

def extract_details_faqs(h):
    return [(H.unescape(m.group(1)).strip(),
             H.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip())
            for m in re.finditer(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", h, re.S)]

def fix_faq_jsonld(path, h):
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)
    if not m:
        return h, False
    try:
        data = json.loads(m.group(1))
    except Exception:
        return h, False
    items = data if isinstance(data, list) else [data]
    changed = False
    for it in items:
        if it.get("@type") == "FAQPage" and not it.get("mainEntity"):
            faqs = extract_hm_faqs(h) or extract_details_faqs(h)
            if faqs:
                it["mainEntity"] = [{"@type": "Question", "name": q,
                                     "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]
            else:
                items.remove(it)
            changed = True
    if changed:
        new = json.dumps(items if isinstance(data, list) else items[0], ensure_ascii=True, separators=(",", ":"))
        h = h[:m.start(1)] + new + h[m.end(1):]
    return h, changed

# ---------- head insert block ----------
def make_head(h, path):
    title = re.search(r"<title>(.*?)</title>", h, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', h)
    canon = re.search(r'<link rel="canonical" href="([^"]*)"', h)
    is_404 = path == "404.html"
    parts = ['<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />']
    stats["favicon"] += 1
    if not is_404 and title and desc and canon:
        t, d, c = title.group(1), desc.group(1), canon.group(1)
        ogtype = "article" if path.startswith("insights/") and path != "insights/index.html" else "website"
        parts.append(f'''<meta property="og:type" content="{ogtype}" />
<meta property="og:site_name" content="Woodex Interior" />
<meta property="og:title" content="{t}" />
<meta property="og:description" content="{d}" />
<meta property="og:url" content="{c}" />
<meta property="og:image" content="{OG_IMG}" />
<meta property="og:image:width" content="1920" />
<meta property="og:image:height" content="1080" />
<meta property="og:image:alt" content="Woodex Interior - design, fit-out and architecture, Lahore" />
<meta property="og:locale" content="en_PK" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{t}" />
<meta name="twitter:description" content="{d}" />
<meta name="twitter:image" content="{OG_IMG}" />''')
        stats["og"] += 1
    return "\n".join(parts) + "\n"

ANCHOR = '<link rel="stylesheet" href="/assets/site.css" />'

# ---------- main loop ----------
per_file_img_idx = 0
for f in files:
    h = open(f, encoding="utf-8").read()
    orig = h
    per_file_img_idx = 0

    # 1. favicon + OG before stylesheet
    if 'rel="icon"' not in h and ANCHOR in h:
        block = make_head(h, f)
        h = h.replace(ANCHOR, block + ANCHOR, 1)

    # 2. privacy footer link
    if '<span>Privacy</span>' in h:
        h = h.replace('<span>Privacy</span>', '<a href="/privacy/">Privacy</a>')
        stats["privacy_link"] += 1

    # 3. estimator link in Explore footer
    i = h.find('aria-label="Explore links"')
    if i >= 0 and '/estimator/' not in h[i:i+800]:
        j = h.find("</nav>", i)
        if j >= 0:
            h = h[:j] + '<a href="/estimator/">Cost estimator</a>' + h[j:]
            stats["est_link"] += 1

    # 4. /services/ broken link (homepage)
    if f == "index.html" and 'href="/services/"' in h:
        h = h.replace('href="/services/"', 'href="#home-services"')
        stats["services_fix"] += 1

    # 5. FAQ JSON-LD
    h2, ch = fix_faq_jsonld(f, h)
    if ch:
        stats["faq_fix"] += 1
        h = h2

    # 6. img width/height + lazy
    def img_sub(m):
        tag = m.group(0)
        nonlocal_stats = stats
        if "<!--" in tag:
            return tag
        src = re.search(r'src="(/assets/[^"?]+)', tag)
        if not src:
            return tag
        w_h = ""
        if "width=" not in tag:
            d = dims(src.group(1))
            if d:
                w_h = f' width="{d[0]}" height="{d[1]}"'
                nonlocal_stats["img_meta"] += 1
        lazy = ""
        if "loading=" not in tag and "fetchpriority" not in tag:
            global per_file_img_idx
            keep_eager = per_file_img_idx < (3 if f == "index.html" else 1)
            if not keep_eager:
                lazy = ' loading="lazy" decoding="async"'
                nonlocal_stats["lazy"] += 1
        per_file_img_idx += 1
        if not w_h and not lazy:
            return tag
        return tag[:-1].rstrip() + w_h + lazy + ">"

    h = re.sub(r"<img[^>]*>", img_sub, h)

    if h != orig:
        open(f, "w", encoding="utf-8").write(h)

# ---------- sitemap ----------
sm = open("sitemap.xml").read()
add = []
if "/estimator/" not in sm:
    add.append("  <url><loc>https://woodex.com.pk/estimator/</loc></url>")
if "/privacy/" not in sm:
    add.append("  <url><loc>https://woodex.com.pk/privacy/</loc></url>")
if add:
    sm = sm.replace("</urlset>", "\n".join(add) + "\n</urlset>")
    open("sitemap.xml", "w").write(sm)

# ---------- CSS comment strip ----------
css = open("assets/site.css").read()
css2 = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
css2 = re.sub(r"\n{3,}", "\n\n", css2)
if len(css2) < len(css):
    open("assets/site.css", "w").write(css2)

print("batch stats:", stats)
print("css:", len(css), "->", len(css2))
