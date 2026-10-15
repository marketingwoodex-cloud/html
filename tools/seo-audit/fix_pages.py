#!/usr/bin/env python3
"""P31: apply safe, owner-independent SEO fixes from the per-page audit.
Never changes prices, offers, timelines or other claims (those go to OWNER-CLAIMS.md)."""
import os, re, json, html, glob
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
ROOT = os.path.join(REPO, "frontend-v1"); DOM = "https://woodex.com.pk"
LOG = []

def rd(u): return open(os.path.join(ROOT, u.strip("/"), "index.html") if u != "/" else os.path.join(ROOT, "index.html"), encoding="utf-8").read()
def wr(u, s): open(os.path.join(ROOT, u.strip("/"), "index.html") if u != "/" else os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(s)
def pages():
    for f in glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True):
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        if not rel.startswith(("admin/", "api/", "builder/", "_", "assets/")): yield "/" + rel[:-10]

def set_title(s, t):
    e = html.escape(t, quote=True)
    s = re.sub(r"<title>.*?</title>", f"<title>{e}</title>", s, 1, re.S)
    for p in ("og:title", "twitter:title"):
        s = re.sub(rf'(<meta (?:property|name)="{p}" content=")[^"]*"', rf'\g<1>{e}"', s)
    return s
def set_desc(s, d):
    assert len(d) <= 160, d
    e = html.escape(d, quote=True)
    for p in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
        s = re.sub(rf'(<meta {p} content=")[^"]*"', rf'\g<1>{e}"', s)
    return s

# ---------- 1. hours (owner-verified: Mon–Sat 9:30–6:30, Sunday closed) ----------
HOURS = [(r"Mon–Sat 10:00–7:30", "Mon–Sat 9:30–6:30"), (r"Mon-Sat 10:00-7:30", "Mon–Sat 9:30–6:30"),
         (r"Mon–Sat 10:00 AM – 7:30 PM", "Mon–Sat 9:30 AM – 6:30 PM"), (r"Mon–Sat, 10 am – 7:30 pm", "Mon–Sat, 9:30 am – 6:30 pm"),
         (r"Mon to Sat 10:00 to 7:30", "Mon to Sat 9:30 to 6:30"), (r"10:00 am – 7:30 pm", "9:30 am – 6:30 pm"), (r"10:00–7:30", "9:30–6:30")]

# ---------- 2. placeholder alts ----------
def clean_alt(a, topic):
    o = a
    a = re.sub(r"\s+used as (?:a |Woodex )?(?:project |studio )?(?:photography )?placeholder(?: for| beside| accompanying)?\s*", ", ", a, flags=re.I)
    a = re.sub(r"\s+(?:project )?image placeholder(?: for| accompanying)?\s*", " project, ", a, flags=re.I)
    a = re.sub(r"\s+(?:project )?placeholder(?: accompanying| for)?\s*", " project, ", a, flags=re.I)
    a = re.sub(r"\bplaceholder\b", "", a, flags=re.I)
    a = re.sub(r"(?:,\s*)+$", "", a.strip()).replace(" ,", ",").strip(" ,")
    a = re.sub(r",\s*(a |the )?Woodex\b", ", Woodex", a)
    if a.lower().endswith(" project") or len(a.split()) < 4: a = f"{a}, {topic}"
    return a[:1].upper() + a[1:]

# ---------- 3. titles / metas for pages where the keyword was missing ----------
CITY = "karachi islamabad rawalpindi faisalabad multan peshawar quetta sialkot gujranwala hyderabad bahawalpur".split()
TITLES = {
 "/": "Interior Design Lahore | Fit-Out & Architecture | Woodex",
 "/3d-visualization/": "3D Visualization Lahore | 3D Interior Rendering | Woodex",
 "/estimator/": "Interior Design Cost Estimator | Woodex Interior",
 "/insights/": "Interior Design Blog: Cost & Planning Guides | Woodex",
 "/insights/small-space-ideas/": "Small Space Interior Ideas for Compact Homes | Woodex",
 "/insights/home-renovation-checklist/": "Home Renovation Checklist for Pakistan | Woodex",
 "/insights/office-interior-guide/": "Office Interior Design Guide: Zones & Acoustics | Woodex",
 "/insights/interior-design-cost-pakistan/": "Interior Design Cost in Pakistan | Woodex Guide",
 "/insights/3d-visualization-guide/": "3D Visualization for Interiors, Explained | Woodex",
 "/insights/restaurant-planning-guide/": "Restaurant Interior Design: Planning Guide | Woodex",
 "/insights/retail-shop-interior-guide/": "Shop Interior Design That Sells | Woodex Guide",
 "/insights/design-process-explained/": "Interior Design Process, Step by Step | Woodex",
 "/projects/": "Interior Design Projects Lahore | Design Studies | Woodex",
}
for c in CITY: TITLES[f"/{c}/"] = f"Interior Design {c.title()} | Homes & Offices | Woodex"
DESCS = {
 "/": "Interior design in Lahore by Woodex Interior: homes, offices, fit-out, renovation, architecture, 3D visualization and custom furniture from one studio.",
 "/3d-visualization/": "3D visualization in Lahore: photoreal interior and exterior renders, walkthroughs and virtual tours from the in-house Woodex 3D studio.",
 "/fit-out/": "Fit out in Lahore for offices, restaurants, retail, healthcare and commercial spaces: design, MEP coordination, joinery and handover by Woodex.",
 "/estimator/": "Interior design cost estimator: pick a service, size and finish level to get a starting range for your Lahore project, then book a visit for a quote.",
 "/insights/": "Woodex interior design blog: practical guides from our Lahore studio on cost, renovation, kitchens, offices, lighting, materials and 3D visualization.",
 "/insights/small-space-ideas/": "Small space interior ideas for compact homes: storage walls, clear sightlines, light and multipurpose zones that make small rooms live large.",
 "/insights/office-interior-guide/": "Office interior design guide: focus, meeting and social zones, acoustics, daylight and brand cues for offices that work as hard as your team.",
 "/insights/interior-design-cost-pakistan/": "Interior design cost in Pakistan: how design fees, room refreshes and full home or office projects are priced, and what moves the number.",
 "/insights/3d-visualization-guide/": "3D visualization for interiors: stills, walkthroughs and 360 views at 4K, with 2 revision rounds, so you see the room before it exists.",
 "/insights/restaurant-planning-guide/": "Restaurant interior design planning: service flow, seating mix, mood versus durability and kitchen adjacency for restaurants that work.",
 "/insights/retail-shop-interior-guide/": "Shop interior design that sells: entrance, customer path, display, trial and checkout, plus lighting and materials that last in daily trade.",
 "/insights/design-process-explained/": "The interior design process at Woodex, step by step: first call, site survey, concept, 3D views, quantities, build and handover.",
 "/projects/": "Interior design projects from Woodex, Lahore: illustrative design studies for homes, clinics, cafes, offices and retail, with plans and 3D views.",
 "/insights/1-kanal-house-interior-cost-lahore/": "1 kanal house interior cost in Lahore, room by room: where the budget goes, which rooms deserve more, and how to phase the work sensibly.",
 "/insights/interior-designer-cost-lahore-2026/": "Interior designer cost in Lahore 2026: how designers charge per sq ft, percentage, fixed fee or design-and-build, and what each includes.",
 "/insights/dha-vs-bahria-town-interior-cost-lahore/": "Interior design cost in DHA Lahore vs Bahria Town: how house types, finish expectations and society rules change the interior budget.",
}
CITY_DESC = re.compile(r"^Woodex Interior serves (\w+)(?: alongside Islamabad)? from (?:its )?Lahore(?: studio)?(?:\s?:|\s+with)?\s*", re.I)

# ---------- 4. related guides ----------
TOPIC = [  # (url regex, [article slugs])
 (r"kitchen", ["kitchen-renovation-cost-lahore", "modular-kitchen-price-pakistan-2026", "kitchen-layouts-that-work-lahore-homes"]),
 (r"bedroom|wardrobe", ["wardrobe-design-cost-pakistan-2026", "small-space-ideas", "lighting-design-layers-explained"]),
 (r"kids|living-room|dining|basement|home-office|complete-home|interior-home", ["apartment-small-space-planning-lahore", "lighting-design-layers-explained", "materials-that-survive-lahore-climate"]),
 (r"office|coworking|commercial", ["office-fit-out-cost-pakistan-2026", "office-layout-mistakes-productivity", "office-interior-guide"]),
 (r"restaurant|cafe|hotel", ["restaurant-cafe-interior-cost-lahore", "restaurant-planning-guide", "lighting-design-layers-explained"]),
 (r"retail|shop|showroom|mall|pharmacy|salon|spa|gym", ["retail-shop-interior-guide", "lighting-design-layers-explained", "materials-that-survive-lahore-climate"]),
 (r"health|clinic", ["office-layout-mistakes-productivity", "materials-that-survive-lahore-climate", "design-process-explained"]),
 (r"marla|kanal|farmhouse|elevation|architecture|master-planning|buildings|educational", ["architect-fee-lahore-2026", "5-marla-house-renovation-cost-lahore", "1-kanal-house-interior-cost-lahore"]),
 (r"renovation|refurb|specialized", ["house-renovation-cost-lahore-2026", "house-renovation-timeline-lahore", "home-renovation-checklist"]),
 (r"3d", ["3d-interior-design-cost-pakistan", "3d-visualization-guide", "design-process-explained"]),
 (r"fit-out|turnkey", ["office-fit-out-cost-pakistan-2026", "interior-designer-vs-contractor-lahore", "house-renovation-timeline-lahore"]),
 (r"lahore", ["dha-vs-bahria-town-interior-cost-lahore", "interior-designer-cost-lahore-2026", "house-renovation-cost-lahore-2026"]),
 (r"interior-design", ["interior-designer-cost-lahore-2026", "interior-designer-vs-contractor-lahore", "lighting-design-layers-explained"]),
 (r".*", ["interior-design-cost-pakistan", "design-process-explained", "interior-designer-vs-contractor-lahore"]),
]
def art_info(slug):
    s = rd(f"/insights/{slug}/")
    t = html.unescape(re.search(r'<h1 id="dx-title">([\s\S]*?)</h1>', s).group(1)).strip()
    d = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
    d = re.split(r"(?<=[.])\s", d)[0].rstrip(".")
    return t, (d[:120].rsplit(" ", 1)[0] + "…") if len(d) > 125 else d
GUIDES_CSS = """
/* P31 related guides on service/location pages */
.wx-guides{background:#f4efe7;padding:72px 0}
.wx-guides .wx-g-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}
.wx-guides .wx-g-k{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#8a6a43;margin:0 0 10px;font-weight:600}
.wx-guides h2{margin:0 0 28px;font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.15;letter-spacing:-.02em;color:#0c1628;font-weight:600}
.wx-guides ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.wx-guides li a{display:block;height:100%;background:#fff;border:1px solid rgba(12,22,40,.08);border-radius:14px;padding:22px 22px 20px;color:#0c1628;text-decoration:none;transition:transform .2s,box-shadow .2s}
.wx-guides li a:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(12,22,40,.08)}
.wx-guides li strong{display:block;font-size:1.05rem;line-height:1.3;margin-bottom:8px}
.wx-guides li span{display:block;font-size:.92rem;line-height:1.55;color:#4a4f5a}
.wx-guides li em{display:inline-block;margin-top:12px;font-style:normal;font-size:.85rem;font-weight:600;color:#8a6a43}
@media (max-width:860px){.wx-guides ul{grid-template-columns:1fr}.wx-guides{padding:56px 0}}
"""
def guides_html(u):
    slug = u.strip("/")
    arts = next(a for rx, a in TOPIC if re.search(rx, slug))
    li = "".join(f'<li><a href="/insights/{a}/"><strong>{html.escape(t)}</strong><span>{html.escape(d)}</span><em>Read the guide</em></a></li>' for a in arts for t, d in [art_info(a)])
    return f'<section class="wx-guides" aria-labelledby="wx-guides-h"><div class="wx-g-wrap"><p class="wx-g-k">Related guides</p><h2 id="wx-guides-h">Read before you plan</h2><ul>{li}</ul></div></section>\n'

# ---------- 5. schema ----------
ORG = {"@context": "https://schema.org", "@type": "Organization", "@id": DOM + "/#org", "name": "Woodex Interior", "url": DOM + "/",
       "logo": DOM + "/assets/img/favicon.svg", "foundingDate": "2016", "founder": {"@type": "Person", "name": "Imtiaz Ahmad"},
       "email": "info@woodex.com.pk", "telephone": "+923224000768",
       "knowsAbout": ["Interior design", "Fit-out", "Renovation", "Architecture", "3D visualization", "Custom furniture"]}
SITE = {"@context": "https://schema.org", "@type": "WebSite", "@id": DOM + "/#website", "name": "Woodex Interior", "url": DOM + "/", "publisher": {"@id": DOM + "/#org"}}
def add_ld(s, obj):
    tag = '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "</script>"
    return s.replace("</head>", tag + "\n</head>", 1)

def blogposting(u, s):
    t = html.unescape(re.search(r"<h1[^>]*>([\s\S]*?)</h1>", s).group(1)).strip()
    d = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
    im = re.search(r'<meta property="og:image" content="([^"]+)"', s)
    return {"@context": "https://schema.org", "@type": "BlogPosting", "headline": t, "description": d, "url": DOM + u,
            "image": im.group(1) if im else None, "datePublished": "2026-09-01", "dateModified": "2026-10-07",
            "author": {"@type": "Organization", "name": "Woodex Studio", "url": DOM + "/about/"},
            "publisher": {"@id": DOM + "/#org", "@type": "Organization", "name": "Woodex Interior"}, "mainEntityOfPage": DOM + u, "inLanguage": "en-PK"}

def run():
    css_p = os.path.join(ROOT, "assets", "v1.css"); css = open(css_p, encoding="utf-8").read()
    if ".wx-guides{" not in css: open(css_p, "a", encoding="utf-8").write(GUIDES_CSS); LOG.append("css: wx-guides")
    art_with_date = rd("/insights/kitchen-renovation-cost-lahore/")
    for u in sorted(pages()):
        s = o = rd(u); slug = u.strip("/")
        for a, b in HOURS: s = s.replace(a, b)
        topic = re.sub(r"\s*\|.*$", "", html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1))).strip()
        s = re.sub(r'alt="([^"]*placeholder[^"]*)"', lambda m: 'alt="' + html.escape(clean_alt(html.unescape(m.group(1)), topic), quote=True) + '"', s, flags=re.I)
        s = s.replace('href="/#interior-contact"', 'href="#interior-contact"')
        if u in TITLES: s = set_title(s, TITLES[u])
        if u in DESCS: s = set_desc(s, DESCS[u])
        if slug in CITY:
            d = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
            if CITY_DESC.match(d):
                nd = CITY_DESC.sub(lambda m: f"Interior design in {m.group(1)} by Woodex Interior, Lahore: ", d, 1)
                if len(nd) > 160: nd = nd[:157].rsplit(" ", 1)[0].rstrip(",;") + "."
                s = set_desc(s, nd)
        # schema
        types = set(re.findall(r'"@type"\s*:\s*"([^"]+)"', s))
        if u == "/":
            if "Organization" not in types: s = add_ld(s, ORG)
            if "WebSite" not in types: s = add_ld(s, SITE)
        if u == "/about/" and "AboutPage" not in types: s = add_ld(s, {"@context": "https://schema.org", "@type": "AboutPage", "url": DOM + u, "name": "About Woodex Interior", "about": {"@id": DOM + "/#org"}})
        if u == "/contact/" and "ContactPage" not in types: s = add_ld(s, {"@context": "https://schema.org", "@type": "ContactPage", "url": DOM + u, "name": "Contact Woodex Interior", "about": {"@id": DOM + "/#org"}})
        if u in ("/insights/", "/projects/") and "CollectionPage" not in types:
            items = sorted(set(re.findall(rf'href="({u}[a-z0-9-]+/)"', s)))
            s = add_ld(s, {"@context": "https://schema.org", "@type": "CollectionPage", "url": DOM + u, "name": topic,
                           "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": i, "url": DOM + x} for i, x in enumerate(items, 1)]}})
        if u.startswith("/insights/") and u != "/insights/" and "BlogPosting" not in types: s = add_ld(s, blogposting(u, s))
        if u.startswith("/projects/") and u != "/projects/" and "CreativeWork" not in types:
            t = html.unescape(re.search(r"<h1[^>]*>([\s\S]*?)</h1>", s).group(1)).strip()
            s = add_ld(s, {"@context": "https://schema.org", "@type": "CreativeWork", "name": re.sub("<[^>]+>", "", t), "url": DOM + u,
                           "description": html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1)),
                           "creator": {"@id": DOM + "/#org", "@type": "Organization", "name": "Woodex Interior"}, "genre": "Illustrative design study"})
        # related guides on service / pillar / city / home
        typ = "skip" if slug.startswith(("insights", "projects")) or slug in ("about", "contact", "book-a-visit", "privacy", "estimator") else "svc"
        if typ == "svc" and "wx-guides" not in s:
            m = re.search(r"<main[\s\S]*?</main>", s); main = m.group(0)
            have = set(re.findall(r'href="/insights/([a-z0-9-]+)/"', main))
            if len(have) < 2:
                blk = guides_html(u if u != "/" else "/interior-design/")
                if '<section class="wx-talk-section' in s: s = s.replace('<section class="wx-talk-section', blk + '<section class="wx-talk-section', 1)
                else: s = s.replace("</main>", blk + "</main>", 1)
        if s != o: wr(u, s); LOG.append(u)
    print(len(LOG), "files changed")

if __name__ == "__main__": run()

# ---------- round 2 ----------
R2_TITLES = {
 "/projects/cafe-corner/": "Cafe Interior Design Study: A Corner Cafe | Woodex",
 "/projects/clinic-fit-out/": "Clinic Fit Out Study: A Calm Compact Clinic | Woodex",
 "/projects/courtyard-house/": "House Renovation Study: Courtyard Home Lahore | Woodex",
 "/projects/office-floor/": "Office Layout Study: One Floor, Three Modes | Woodex",
 "/projects/retail-corner/": "Shop Interior Study: A Corner Shop That Sells | Woodex",
 "/projects/small-apartment/": "Small Apartment Interior Study: 60 sq m | Woodex",
}
R2_DESCS = {
 "/projects/cafe-corner/": "Cafe interior design study by Woodex: a corner cafe with counter flow, a seating mix and lighting that holds a crowd. Illustrative design study.",
 "/projects/clinic-fit-out/": "Clinic fit out study by Woodex: a compact clinic with calm waiting, consult and procedure flow, and easy-clean finishes. Illustrative study.",
 "/projects/courtyard-house/": "House renovation study by Woodex: a Lahore house re-planned around a small courtyard for light, air and better family rooms. Illustrative study.",
 "/projects/office-floor/": "Office layout study by Woodex: one floor with focus rows, meeting rooms and a social zone, planned for how teams work. Illustrative study.",
 "/projects/retail-corner/": "Shop interior study by Woodex: a small corner shop with a display wall, clear customer path and checkout triangle. Illustrative design study.",
 "/projects/small-apartment/": "Small apartment interior study by Woodex: a 60 sq m home with a storage wall and clear sightlines that feels larger. Illustrative design study.",
 "/lahore/": "Interior design in Lahore by Woodex Interior: a local design and build studio for homes, offices, fit-out, renovation, architecture and 3D views.",
 "/renovation/": "Renovation company in Lahore for homes, offices, retail, healthcare and restaurants: survey, design, phased works and handover by Woodex Interior.",
 "/contact/": "Contact Woodex Interior in Lahore for interior design, fit-out, renovation, architecture and 3D. Call, WhatsApp, email or visit our studio.",
 "/rawalpindi/": "Interior design in Rawalpindi by Woodex Interior, Lahore: residential and commercial interiors run in planned phases with scheduled site visits.",
}
SVC = {"/insights/3d-visualization-guide/": ("/3d-visualization/", "3D visualization studio"),
       "/insights/design-process-explained/": ("/interior-design/", "interior design services"),
       "/insights/interior-design-cost-pakistan/": ("/interior-design/", "interior design services"),
       "/insights/small-space-ideas/": ("/complete-home-redesign/", "complete home redesign service")}
OLD8 = ["small-space-ideas", "home-renovation-checklist", "office-interior-guide", "interior-design-cost-pakistan", "3d-visualization-guide", "restaurant-planning-guide", "retail-shop-interior-guide", "design-process-explained"]
def run2():
    n = 0
    for u in set(R2_TITLES) | set(R2_DESCS) | set(SVC) | {f"/insights/{x}/" for x in OLD8}:
        s = o = rd(u)
        if u in R2_TITLES: s = set_title(s, R2_TITLES[u])
        if u in R2_DESCS: s = set_desc(s, R2_DESCS[u])
        if u.strip("/").split("/")[-1] in OLD8:
            d = re.search(r'<meta name="description" content="([^"]*)"', s).group(1)
            s = re.sub(r'(<p class="dx-dek">)[\s\S]*?(</p>)', lambda m: m.group(1) + d + m.group(2), s, 1)
        if u in SVC and "dx-svc" not in s:
            href, lab = SVC[u]
            s = re.sub(r'(<p class="dx-dek">[\s\S]*?</p>)', lambda m: m.group(1) + f'\n<p class="dx-dek dx-svc">Planning a project? See our <a href="{href}">{lab}</a>.</p>', s, 1)
        if s != o: wr(u, s); n += 1
    print("round2", n)
if __name__ == "__main__": run2()
