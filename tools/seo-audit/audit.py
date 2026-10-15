#!/usr/bin/env python3
"""Woodex full-site SEO audit (claude-seo methodology, local static crawl).
Runs 9 category checkers in parallel (sub-agent style) over frontend-v1 and
writes seo-audit/findings/*.md + audit-data.json."""
import os, re, json, html, collections
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1")
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "seo-audit")
SKIP = ("admin/", "api/", "builder/", "_private", "_database", "assets/")
DOMAIN = "https://woodex.com.pk"

def load():
    pages = {}
    for dp, _, fs in os.walk(ROOT):
        for f in fs:
            if f != "index.html": continue
            rel = os.path.relpath(os.path.join(dp, f), ROOT).replace("\\", "/")
            if rel.startswith(SKIP): continue
            url = "/" + rel[:-10]
            pages[url] = open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
    return pages

def g(rx, s, fl=re.I | re.S):
    m = re.search(rx, s, fl); return html.unescape(m.group(1).strip()) if m else None

def text(s):
    s = re.sub(r"<(script|style|nav|header|footer)[\s\S]*?</\1>", " ", s, flags=re.I)
    m = re.search(r"<main[\s\S]*?</main>", s); s = m.group(0) if m else s
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def links(s):
    return [h.split("#")[0].split("?")[0] for h in re.findall(r'<a[^>]+href="([^"]+)"', s)]

PAGES = load()
F = collections.defaultdict(list)  # category -> [(sev, issue, pages)]

def add(cat, sev, issue, pages=()):
    F[cat].append({"severity": sev, "issue": issue, "count": len(pages), "pages": sorted(pages)[:15]})

def on_page():
    c = "On-page"; titles = collections.defaultdict(list); descs = collections.defaultdict(list)
    bad = {k: [] for k in ["no_title", "long_title", "short_title", "no_desc", "long_desc", "short_desc", "h1", "no_h1"]}
    for u, s in PAGES.items():
        t = g(r"<title>(.*?)</title>", s); d = g(r'<meta name="description" content="([^"]*)"', s)
        h1 = re.findall(r"<h1[\s>]", s, re.I)
        if not t: bad["no_title"].append(u)
        else:
            titles[t].append(u)
            if len(t) > 60: bad["long_title"].append(u)
            if len(t) < 30: bad["short_title"].append(u)
        if not d: bad["no_desc"].append(u)
        else:
            descs[d].append(u)
            if len(d) > 160: bad["long_desc"].append(u)
            if len(d) < 110: bad["short_desc"].append(u)
        if len(h1) > 1: bad["h1"].append(u)
        if not h1: bad["no_h1"].append(u)
    msg = {"no_title": ("Critical", "Missing <title>"), "no_desc": ("High", "Missing meta description"),
           "long_title": ("Medium", "Title over 60 chars (truncated in SERP)"), "short_title": ("Low", "Title under 30 chars"),
           "long_desc": ("Low", "Meta description over 160 chars"), "short_desc": ("Medium", "Meta description under 110 chars"),
           "h1": ("High", "More than one H1"), "no_h1": ("High", "No H1")}
    for k, v in bad.items():
        if v: add(c, msg[k][0], msg[k][1], v)
    dt = [u for t, us in titles.items() if len(us) > 1 for u in us]
    dd = [u for t, us in descs.items() if len(us) > 1 for u in us]
    if dt: add(c, "High", "Duplicate titles", dt)
    if dd: add(c, "High", "Duplicate meta descriptions", dd)

def technical():
    c = "Technical"; nocan = []; badcan = []; noidx = []; novp = []; nolang = []; noog = []
    for u, s in PAGES.items():
        cn = g(r'<link rel="canonical" href="([^"]+)"', s)
        if not cn: nocan.append(u)
        elif cn.rstrip("/") != (DOMAIN + u).rstrip("/"): badcan.append(u + " -> " + cn)
        if re.search(r'name="robots" content="[^"]*noindex', s): noidx.append(u)
        if 'name="viewport"' not in s: novp.append(u)
        if not re.search(r"<html[^>]+lang=", s): nolang.append(u)
        if 'property="og:image"' not in s: noog.append(u)
    if nocan: add(c, "High", "Missing canonical", nocan)
    if badcan: add(c, "High", "Canonical points elsewhere", badcan)
    if noidx: add(c, "Info", "Pages set to noindex", noidx)
    if novp: add(c, "High", "Missing viewport", novp)
    if nolang: add(c, "Medium", "Missing <html lang>", nolang)
    if noog: add(c, "Medium", "Missing og:image (social/AI previews)", noog)
    ht = open(os.path.join(ROOT, ".htaccess"), encoding="utf-8").read()
    if "^www" not in ht: add(c, "High", "No www -> non-www 301 rule in .htaccess")
    if "HTTPS" not in ht.upper() or "on" not in ht: add(c, "Medium", "Check HTTP -> HTTPS 301 rule")
    for h in ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy"]:
        if h.lower() not in ht.lower(): add(c, "Low", "Security header missing: " + h)
    if "mod_deflate" not in ht and "brotli" not in ht.lower(): add(c, "Medium", "No compression (mod_deflate) in .htaccess")
    if "mod_expires" not in ht and "Cache-Control" not in ht: add(c, "Medium", "No browser caching rules")

def internal_links():
    c = "Internal links"; inbound = collections.Counter(); broken = collections.defaultdict(set)
    for u, s in PAGES.items():
        for h in set(links(s)):
            if h.startswith(DOMAIN): h = h[len(DOMAIN):] or "/"
            if not h.startswith("/") or h.startswith("//"): continue
            if re.search(r"\.(webp|jpg|png|pdf|xml|txt|php|svg|ico)$", h) or h.startswith(("/api", "/admin", "/assets")): continue
            hh = h if h.endswith("/") else h + "/"
            if hh in PAGES: inbound[hh] += (hh != u)
            else: broken[h].add(u)
    orphans = [u for u in PAGES if inbound[u] == 0 and u != "/"]
    weak = [u for u in PAGES if 0 < inbound[u] <= 2]
    if broken: add(c, "Critical", "Broken internal links", [f"{k} (on {len(v)} pages, e.g. {sorted(v)[0]})" for k, v in broken.items()])
    if orphans: add(c, "High", "Orphan pages (0 inbound internal links)", orphans)
    if weak: add(c, "Medium", "Weakly linked pages (1-2 inbound)", weak)
    ins = [u for u in PAGES if u.startswith("/insights/") and u != "/insights/"]
    svc_to_blog = [u for u in PAGES if u != "/privacy/" and not u.startswith("/insights") and not any(l.startswith("/insights/") and len(l) > 10 for l in links(PAGES[u]))]
    add(c, "Medium", "Service/location pages that link to no insights article (topic-cluster gap)", svc_to_blog)
    return inbound

def content():
    c = "Content & E-E-A-T"; thin = []; noauthor = []; nodate = []
    for u, s in PAGES.items():
        n = len(text(s).split())
        if n < 300: thin.append(f"{u} ({n} words)")
        if u.startswith("/insights/") and u != "/insights/":
            if not re.search(r'"author"', s): noauthor.append(u)
            if not re.search(r'"dateModified"|"datePublished"', s): nodate.append(u)
    if thin: add(c, "High", "Thin content (<300 words in <main>)", thin)
    if noauthor: add(c, "High", "Articles without author in schema (E-E-A-T)", noauthor)
    if nodate: add(c, "Medium", "Articles without dates", nodate)
    ins = [u for u in PAGES if u.startswith("/insights/") and u != "/insights/"]
    named = [u for u in ins if re.search(r'"author"\s*:\s*\{[^}]*"@type"\s*:\s*"Person"', PAGES[u])]
    if len(named) < len(ins): add(c, "High", "Articles credited to Organization, not a named designer (Person)", [u for u in ins if u not in named])
    cities = [u for u in PAGES if re.match(r"^/(karachi|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta|sialkot|gujranwala|hyderabad|bahawalpur)/$", u)]
    sim = []
    import difflib
    base = text(PAGES.get("/karachi/", "")) if "/karachi/" in PAGES else ""
    for u in cities:
        if u == "/karachi/": continue
        r = difflib.SequenceMatcher(None, base[:3000], text(PAGES[u])[:3000]).ratio()
        if r > 0.6: sim.append(f"{u} ({int(r*100)}% similar to /karachi/)")
    if sim: add(c, "High", "Near-duplicate city pages (doorway-page risk)", sim)
    if not os.path.exists(os.path.join(ROOT, "about", "index.html")): add(c, "High", "No About page")

def schema():
    c = "Schema"; none = []; types = collections.Counter(); bad = []
    for u, s in PAGES.items():
        blocks = re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', s)
        if not blocks: none.append(u); continue
        for b in blocks:
            try:
                j = json.loads(b)
                for t in re.findall(r'"@type"\s*:\s*"([^"]+)"', b): types[t] += 1
            except Exception: bad.append(u)
    if none: add(c, "High", "Pages with no JSON-LD", none)
    if bad: add(c, "Critical", "Invalid JSON-LD", bad)
    for need in ["LocalBusiness", "HomeAndConstructionBusiness", "InteriorDesigner"]:
        pass
    if not any(t in types for t in ["LocalBusiness", "HomeAndConstructionBusiness", "GeneralContractor", "ProfessionalService"]):
        add(c, "Critical", "No LocalBusiness-type schema anywhere (local pack signal)")
    if "Service" not in types: add(c, "High", "No Service schema on service pages")
    if "BreadcrumbList" not in types: add(c, "Medium", "No BreadcrumbList schema")
    add(c, "Info", "Schema types found: " + ", ".join(f"{k}×{v}" for k, v in types.most_common()))

def images():
    c = "Images"; noalt = collections.Counter(); nodim = collections.Counter(); notlazy = 0
    for u, s in PAGES.items():
        for im in re.findall(r"<img[^>]*>", s):
            if 'alt=' not in im: noalt[u] += 1
            if 'width=' not in im or 'height=' not in im: nodim[u] += 1
    if noalt: add(c, "High", "Images without alt", [f"{k} ({v})" for k, v in noalt.items()])
    if nodim: add(c, "Medium", "Images without width/height (CLS)", [f"{k} ({v})" for k, v in nodim.items()])
    big = []
    for f in os.listdir(os.path.join(ROOT, "assets", "img")):
        p = os.path.join(ROOT, "assets", "img", f)
        if f.endswith(".webp") and os.path.getsize(p) > 400_000: big.append(f"{f} ({os.path.getsize(p)//1024} KB)")
    if big: add(c, "Medium", "Large WebP files > 400 KB", big)

def sitemap():
    c = "Sitemap"; sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    locs = {l.replace(DOMAIN, "") for l in re.findall(r"<loc>([^<]+)</loc>", sm)}
    missing = [u for u in PAGES if u not in locs and "noindex" not in PAGES[u]]
    extra = [l for l in locs if l not in PAGES]
    if missing: add(c, "High", "Indexable pages missing from sitemap", missing)
    if extra: add(c, "High", "Sitemap URLs with no page", extra)
    if "<lastmod>" not in sm: add(c, "Medium", "No <lastmod> in sitemap (Google uses it for recrawl)")
    if "image:image" not in sm: add(c, "Low", "No image sitemap entries")

def geo():
    c = "AI search / GEO"
    rb = open(os.path.join(ROOT, "robots.txt")).read()
    if not os.path.exists(os.path.join(ROOT, "llms.txt")): add(c, "Medium", "No /llms.txt")
    for bot in ["GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended"]:
        if bot not in rb: add(c, "Info", f"robots.txt has no explicit policy for {bot} (allowed by default)")
    nofaq = [u for u, s in PAGES.items() if "FAQPage" not in s and u != "/privacy/" and not u.startswith("/insights/")]
    add(c, "Medium", "Service pages without FAQ block/FAQPage schema (answer-engine extractability)", nofaq)
    nosum = [u for u, s in PAGES.items() if u.startswith("/insights/") and u != "/insights/" and "dx-short" not in s and "Short version" not in s and "wx-short" not in s]
    if nosum: add(c, "Low", "Articles without a summary box near top", nosum)

def local():
    c = "Local SEO"; phones = collections.Counter(); emails = collections.Counter(); addr = collections.Counter()
    for u, s in PAGES.items():
        for p in re.findall(r'href="tel:([^"]+)"', s): phones[p] += 1
        for e in re.findall(r'href="mailto:([^"?]+)', s): emails[e] += 1
        for a in re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', s): addr[a] += 1
    if len(phones) > 1: add(c, "High", "NAP: multiple phone numbers used: " + ", ".join(f"{k}×{v}" for k, v in phones.items()))
    if len(emails) > 1: add(c, "Medium", "NAP: multiple emails used: " + ", ".join(f"{k}×{v}" for k, v in emails.items()))
    if not addr: add(c, "Critical", "No streetAddress in any schema (NAP for map pack)")
    elif len(addr) > 1: add(c, "High", "Inconsistent streetAddress: " + "; ".join(addr))
    if not any("maps.google" in s or "google.com/maps" in s for s in PAGES.values()): add(c, "Medium", "No Google Maps link/embed to GBP")
    if not any('"aggregateRating"' in s for s in PAGES.values()): add(c, "Info", "No review markup (only add with real, on-site reviews)")
    add(c, "Info", "Off-site (needs owner access): GBP categories/photos/posts, citations (Yelp PK, Brownbook, Bing Places, Apple Business Connect), review velocity, geo-grid rank tracking (needs DataForSEO/Local Falcon key)")

CHECKS = {"on_page": on_page, "technical": technical, "internal_links": internal_links, "content": content,
          "schema": schema, "images": images, "sitemap": sitemap, "geo": geo, "local": local}
W = {"Critical": 15, "High": 6, "Medium": 2, "Low": 1, "Info": 0}

if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=9) as ex: list(ex.map(lambda f: f(), CHECKS.values()))
    os.makedirs(os.path.join(OUT, "findings"), exist_ok=True)
    cats = []
    for cat, items in sorted(F.items()):
        pen = sum(W[i["severity"]] for i in items); score = max(0, 100 - pen)
        cats.append({"name": cat, "score": score, "findings": items})
        with open(os.path.join(OUT, "findings", re.sub(r"\W+", "-", cat.lower()).strip("-") + ".md"), "w") as fh:
            fh.write(f"# {cat} — score {score}/100\n\n")
            for i in sorted(items, key=lambda i: list(W).index(i["severity"])):
                fh.write(f"## [{i['severity']}] {i['issue']} ({i['count']})\n")
                for p in i["pages"]: fh.write(f"- {p}\n")
                fh.write("\n")
    health = round(sum(c["score"] for c in cats) / len(cats))
    json.dump({"summary": {"health_score": health, "pages": len(PAGES), "business_type": "Local service (interior design & build, Lahore HQ)"}, "categories": cats},
              open(os.path.join(OUT, "audit-data.json"), "w"), indent=1)
    print("pages", len(PAGES), "health", health)
    for c in cats:
        print(f"{c['score']:>4}  {c['name']}")
        for i in c["findings"]: print(f"       [{i['severity']}] {i['issue']} ({i['count']})")
