#!/usr/bin/env python3
"""P33 GEO/AIO: robots AI-bot policy, /llms.txt, answer-first 'In short' box after the hero
on service/pillar/city pages (+ matching speakable WebPage schema). Idempotent."""
import os, re, glob, html, json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend-v1"); DOM = "https://woodex.com.pk"
CITIES = "karachi islamabad rawalpindi faisalabad multan peshawar quetta sialkot gujranwala hyderabad bahawalpur lahore".split()
UTIL = ("about", "contact", "book-a-visit", "privacy", "estimator")

def pages():
    for f in sorted(glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        if not rel.startswith(("admin/", "api/", "builder/", "_", "assets/")): yield f, "/" + rel[:-10]
def meta(s, n): m = re.search(rf'<meta name="{n}" content="([^"]*)"', s); return html.unescape(m.group(1)) if m else ""
def title(s): return re.sub(r"\s*\|.*$", "", html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1))).strip()

ROBOTS = """User-agent: *
Allow: /
Disallow: /builder/
Disallow: /api/
Disallow: /admin/

# AI search and answer engines: welcome to read public pages
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Bingbot
Allow: /

Sitemap: https://woodex.com.pk/sitemap.xml
"""

def kind(u):
    s = u.strip("/")
    if u == "/": return "home"
    if s.startswith("insights"): return "insight"
    if s.startswith("projects"): return "project"
    if s in UTIL: return "util"
    if s in CITIES: return "city"
    return "svc"

def facts(u, k):
    city = u.strip("/").title() if k == "city" else "Lahore"
    where = "Based in Lahore (M-71, Zainab Tower, Model Town Link Road)" + (f", serving {city} with scheduled site visits" if k == "city" and city != "Lahore" else ", working across Pakistan")
    return [where, "In-house 3D studio: photoreal 4K views with 2 revision rounds before work starts",
            "200+ completed spaces since 2016, with quantities, phasing and handover dates agreed up front"]

def short_box(s, u, k):
    d = meta(s, "description"); t = title(s)
    li = "".join(f"<li>{html.escape(x)}</li>" for x in facts(u, k))
    return (f'<section class="wx-short" aria-label="In short"><div class="wx-short-in">'
            f'<p class="wx-short-k">In short</p><p class="wx-short-a">{html.escape(d)}</p><ul>{li}</ul></div></section>\n')

CSS = """
/* P33 answer-first summary (AI Overviews / GEO) */
.wx-short{background:#fff;padding:36px 0 8px}
.wx-short-in{width:min(1180px,calc(100% - 40px));margin:0 auto;display:grid;grid-template-columns:150px 1fr;gap:6px 28px;border:1px solid rgba(12,22,40,.08);border-left:3px solid #b8956a;border-radius:16px;padding:22px 26px;background:#fbf8f3}
.wx-short-k{grid-row:span 2;margin:0;font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#8a6a43;padding-top:3px}
.wx-short-a{margin:0;font-size:1.06rem;line-height:1.6;color:#0c1628;font-weight:500}
.wx-short ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 22px}
main .wx-short ul li{padding-left:16px;position:relative;font-size:.9rem;color:#5b6472;line-height:1.5}
main .wx-short ul li:before{content:"";position:absolute;left:0;top:.6em;width:6px;height:6px;border-radius:50%;background:#b8956a}
@media(max-width:760px){.wx-short-in{grid-template-columns:1fr;padding:18px}.wx-short-k{grid-row:auto}}
"""

def run():
    open(os.path.join(ROOT, "robots.txt"), "w").write(ROBOTS)
    css = os.path.join(ROOT, "assets", "v1.css"); c = open(css, encoding="utf-8").read()
    if "P33 answer-first" not in c: open(css, "a", encoding="utf-8").write(CSS)
    groups = {"Main services": [], "Services": [], "Locations": [], "Guides": [], "Design studies": [], "Company": []}
    n = 0
    for f, u in pages():
        s = o = open(f, encoding="utf-8").read(); k = kind(u)
        if "noindex" in s: continue
        g = {"home": "Company", "util": "Company", "city": "Locations", "insight": "Guides", "project": "Design studies"}.get(k)
        if k == "svc": g = "Main services" if u.strip("/") in ("interior-design", "fit-out", "renovation", "architecture", "3d-visualization", "turnkey-design-build") else "Services"
        if u in ("/insights/", "/projects/"): g = "Company"
        groups[g].append(f"- [{title(s)}]({DOM}{u}): {meta(s, 'description')}")
        if u == "/services/": g = "Company"
        if k in ("svc", "city") and "wx-short" not in s and "sv-short" not in s:
            m = re.search(r"<main[^>]*>[\s\S]*?</section>", s)
            if m: s = s.replace(m.group(0), m.group(0) + "\n" + short_box(s, u, k), 1)
            types = re.findall(r'"@type"\s*:\s*"([^"]+)"', s)
            if "WebPage" not in types:
                ld = {"@context": "https://schema.org", "@type": "WebPage", "url": DOM + u, "name": title(s), "description": meta(s, "description"),
                      "isPartOf": {"@id": DOM + "/#website"}, "about": {"@id": DOM + "/#org"},
                      "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".wx-short-a", "h1"]}}
                s = s.replace("</head>", '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(",", ":")) + "</script>\n</head>", 1)
        if s != o: open(f, "w", encoding="utf-8").write(s); n += 1
    L = ["# Woodex Interior", "",
         "> Woodex Interior is a Lahore design-and-build studio founded in 2016 by Imtiaz Ahmad. It provides interior design, fit-out, renovation, architecture, 3D visualization and custom furniture for homes, offices, retail, restaurants and healthcare across Pakistan, with 200+ completed spaces.", "",
         "Key facts:", "- Address: M-71, Zainab Tower, Model Town Link Road, Lahore, Punjab, Pakistan",
         "- Phone / WhatsApp: +92 322 4000768 · Email: info@woodex.com.pk", "- Hours: Monday–Saturday 9:30–18:30, Sunday closed",
         "- In-house 3D studio: photoreal 4K renders, 2 revision rounds", "- Pricing: quoted in writing after a site visit or brief", ""]
    for g, items in groups.items():
        if items: L += [f"## {g}", *items, ""]
    open(os.path.join(ROOT, "llms.txt"), "w", encoding="utf-8").write("\n".join(L))
    print("pages changed", n, "llms entries", sum(map(len, groups.values())))
if __name__ == "__main__": run()
