#!/usr/bin/env python3
"""P35: build /services/ hub (every Woodex service, grouped), link it from header + footer. Idempotent.
Run: python3 tools/p35/services_hub.py"""
import os, re, html, json, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1"))
SITE = "https://woodex.com.pk"
E = lambda s: html.escape(str(s), quote=True)

GROUPS = [
 ("interior", "Interior design", "Homes and rooms designed around how you live, with photoreal 3D before work starts.",
  ["interior-design", "kitchen-design", "residential-living-room-design", "residential-bedroom-design", "residential-dining-room-design",
   "residential-kids-room-design", "residential-home-office-design", "residential-basement-design", "bathroom-design", "wardrobe-design",
   "dressing-room-design", "false-ceiling-design", "apartment-interior-design", "complete-home-redesign", "3d-visualization"]),
 ("commercial", "Commercial and workplace interiors", "Offices, retail and showrooms planned for people, brand and daily use.",
  ["commercial-interior", "office-interior-design", "coworking-space-design", "retail-design", "showroom-design", "shopping-mall-design"]),
 ("hospitality", "Hospitality, wellness and healthcare", "Restaurants, cafes, hotels, salons, gyms and clinics where flow and durability matter.",
  ["restaurant-interior-design", "cafe-interior-design", "hotel-interior-design", "beauty-salon-design", "spa-design", "gym-design", "healthcare-design"]),
 ("fitout", "Fit-out and turnkey", "One accountable team taking a space from shell to handover.",
  ["fit-out", "turnkey-design-build", "commercial-fit-out", "office-fit-out", "retail-fit-out", "restaurant-fit-out", "healthcare-fit-out", "pharmacy-fit-out"]),
 ("renovation", "Renovation", "Upgrades for homes and businesses, planned to limit disruption.",
  ["renovation", "residential-renovation", "kitchen-renovation", "interior-home-refurbishment", "commercial-renovation", "office-renovation",
   "retail-showroom-renovation", "restaurant-cafe-renovation", "healthcare-renovation", "specialized-renovation-services"]),
 ("architecture", "Architecture", "House plans, elevations and buildings designed with the interior in mind.",
  ["architecture", "5-marla-house-design", "10-marla-house-design", "1-kanal-house-design", "2-kanal-house-design", "farmhouse-design",
   "front-elevation-design", "master-planning", "office-buildings-design", "retail-buildings-design", "restaurant-cafe-building-design",
   "educational-buildings-design", "healthcare-facilities-design"]),
]
FAQS = [
 ("What services does Woodex Interior offer?", "Interior design, commercial and workplace interiors, hospitality and healthcare interiors, fit-out and turnkey projects, renovation, architecture and 3D visualization, from our studio in Lahore."),
 ("Can Woodex handle both design and build?", "Yes. We can design only, or take the project from design and 3D through to build and handover with one accountable team."),
 ("Do you work outside Lahore?", "Yes. Our studio is in Lahore and we take projects in other cities across Pakistan."),
 ("How do I start a project?", "Call or WhatsApp +92 322 4000768 or send the form below. We discuss the brief, then arrange a site visit and a written, itemised quote."),
]

def rd(p): return open(p, encoding="utf-8").read()

def info(slug):
    s = rd(os.path.join(ROOT, slug, "index.html"))
    t = html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1)).split("|")[0].strip()
    name = re.sub(r"\s+(in\s+)?Lahore$", "", t).replace("Company", "").strip()
    d = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
    d = re.split(r"(?<=[.!?])\s", d)[0]
    d = re.sub(r"^[^:]{0,60}:\s*", "", d) if len(d) > 125 else d
    if len(d) > 125: d = d[:122].rsplit(" ", 1)[0] + "…"
    main = s[s.find("<main"):]
    im = re.findall(r'src="/assets/img/((?:img|ins)-[a-z0-9]+)\.webp"', main)
    d = d[:1].upper() + d[1:]
    return {"slug": slug, "name": name, "desc": d, "imgs": im}

CSS = """<style id="sv-css">
#services-page{background:#fff;color:var(--navy,#0c1628)}
.sv-wrap{width:min(1240px,calc(100% - 40px));margin:0 auto}
.sv-hero{background:#f4efe7;padding:150px 0 70px}
.sv-crumbs{font-size:.8rem;color:#6b6b6b;margin-bottom:22px}.sv-crumbs a{color:inherit;text-decoration:none}
.sv-kicker{display:flex;align-items:center;gap:12px;font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;color:#8a6b45;margin:0 0 16px}
.sv-kicker:before{content:"";width:38px;height:1px;background:currentColor}
.sv-hero h1{font-size:clamp(2.2rem,5vw,4.2rem);line-height:1.04;letter-spacing:-.035em;font-weight:500;max-width:15ch;margin:0 0 20px}
.sv-dek{font-size:1.08rem;line-height:1.65;color:#4f4f4f;max-width:60ch;margin:0 0 30px}
.sv-jump{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
.sv-jump a{display:inline-flex;gap:8px;align-items:center;padding:10px 16px;border:1px solid rgba(12,22,40,.14);border-radius:999px;background:#fff;color:var(--navy,#0c1628);text-decoration:none;font-size:.88rem;transition:.2s}
.sv-jump a:hover{background:var(--navy,#0c1628);color:#fff}.sv-jump b{font-weight:500;color:#b8956a}
.sv-short{margin-top:34px;max-width:760px;background:#fff;border-left:3px solid #b8956a;border-radius:14px;padding:18px 22px;font-size:.95rem;line-height:1.6;color:#3d3d3d}
.sv-short strong{color:var(--navy,#0c1628)}
.sv-group{padding:84px 0;scroll-margin-top:90px}.sv-group:nth-of-type(even){background:#f4efe7}
.sv-ghead{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;margin-bottom:34px}
.sv-num{font-size:.78rem;letter-spacing:.16em;color:#8a6b45;text-transform:uppercase;margin:0 0 10px}
.sv-ghead h2{font-size:clamp(1.7rem,3.2vw,2.6rem);letter-spacing:-.03em;font-weight:500;margin:0 0 10px;line-height:1.1}
.sv-ghead p{margin:0;color:#555;max-width:58ch;line-height:1.6}
.sv-all{white-space:nowrap;color:var(--navy,#0c1628);text-decoration:none;border-bottom:1px solid #b8956a;padding-bottom:4px;font-size:.92rem}
.sv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.sv-card{display:flex;flex-direction:column;background:#fff;border:1px solid rgba(12,22,40,.08);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .25s,box-shadow .25s}
.sv-card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(12,22,40,.10)}
.sv-card figure{margin:0;aspect-ratio:4/3;overflow:hidden;background:#e9e2d6}
.sv-card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s}.sv-card:hover img{transform:scale(1.05)}
.sv-card div{padding:16px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.sv-card h3{font-size:1.02rem;font-weight:600;margin:0;letter-spacing:-.01em}
.sv-card p{font-size:.86rem;line-height:1.5;color:#5c5c5c;margin:0;flex:1}
.sv-card span{font-size:.82rem;color:#8a6b45}
.sv-card.sv-lead{grid-column:span 2;grid-row:span 1;background:var(--navy,#0c1628);color:#fff}
.sv-card.sv-lead p{color:rgba(255,255,255,.72)}.sv-card.sv-lead span{color:#d9bf98}
.sv-card.sv-lead figure{aspect-ratio:16/7.4}
.sv-steps{padding:84px 0;background:var(--navy,#0c1628);color:#fff}
.sv-steps h2{font-size:clamp(1.7rem,3.2vw,2.6rem);font-weight:500;letter-spacing:-.03em;margin:0 0 34px}
.sv-steps ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;counter-reset:s}
.sv-steps li{counter-increment:s;border-top:1px solid rgba(255,255,255,.18);padding-top:20px}
.sv-steps li:before{content:"0" counter(s);display:block;color:#d9bf98;font-size:.8rem;letter-spacing:.14em;margin-bottom:12px}
.sv-steps h3{margin:0 0 8px;font-size:1.05rem;font-weight:600}.sv-steps p{margin:0;color:rgba(255,255,255,.7);font-size:.92rem;line-height:1.55}
.sv-faq{padding:84px 0;background:#fff}.sv-faq h2{font-size:clamp(1.7rem,3.2vw,2.6rem);font-weight:500;letter-spacing:-.03em;margin:0 0 26px}
.sv-faq details{border-bottom:1px solid rgba(12,22,40,.1);padding:18px 0}.sv-faq summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:20px}
.sv-faq summary:after{content:"+";color:#b8956a;font-size:1.3rem;line-height:1}.sv-faq details[open] summary:after{content:"–"}
.sv-faq details p{margin:12px 0 0;color:#555;line-height:1.6;max-width:75ch}
@media(max-width:1024px){.sv-grid{grid-template-columns:repeat(2,1fr)}.sv-steps ol{grid-template-columns:repeat(2,1fr)}}
@media(max-width:620px){.sv-hero{padding:120px 0 50px}.sv-grid{grid-template-columns:1fr}.sv-card.sv-lead{grid-column:auto}.sv-card.sv-lead figure{aspect-ratio:4/3}
.sv-ghead{grid-template-columns:1fr}.sv-group,.sv-steps,.sv-faq{padding:60px 0}.sv-steps ol{grid-template-columns:1fr}}
</style>"""

def img(i, alt, eager=False):
    b = "/assets/img/" + i
    return ('<img sizes="(max-width: 620px) 100vw, (max-width: 1024px) 50vw, 25vw" srcset="%s-480.webp 480w, %s-960.webp 960w" src="%s-960.webp" alt="%s" width="960" height="540" loading="%s" decoding="async">'
            % (b, b, b, E(alt), "eager" if eager else "lazy"))

def main():
    used = set(); total = 0; groups_html = []; items = []
    jump = "".join('<li><a href="#sv-%s"><b>%02d</b>%s</a></li>' % (g[0], n + 1, E(g[1])) for n, g in enumerate(GROUPS))
    for n, (gid, gname, gdesc, slugs) in enumerate(GROUPS):
        cards = []
        for k, sl in enumerate(slugs):
            x = info(sl); total += 1
            i = next((m for m in x["imgs"] if m not in used and os.path.exists(os.path.join(ROOT, "assets", "img", m + "-480.webp"))), None) \
                or next(m for m in x["imgs"] if os.path.exists(os.path.join(ROOT, "assets", "img", m + "-480.webp")))
            used.add(i)
            items.append({"@type": "ListItem", "position": total, "name": x["name"], "url": "%s/%s/" % (SITE, sl)})
            cards.append('<a class="sv-card%s" href="/%s/"><figure>%s</figure><div><h3>%s</h3><p>%s</p><span>Explore →</span></div></a>'
                         % (" sv-lead" if k == 0 else "", sl, img(i, x["name"] + " by Woodex Interior, Lahore", eager=(n == 0 and k < 2)), E(x["name"]), E(x["desc"])))
        lead = info(slugs[0])
        groups_html.append('<section class="sv-group" id="sv-%s" aria-labelledby="sv-%s-h"><div class="sv-wrap"><header class="sv-ghead"><div><p class="sv-num">%02d · %d services</p><h2 id="sv-%s-h">%s</h2><p>%s</p></div><a class="sv-all" href="/%s/">%s overview →</a></header><div class="sv-grid">%s</div></div></section>'
                           % (gid, gid, n + 1, len(slugs), gid, E(gname), E(gdesc), slugs[0], E(lead["name"]), "".join(cards)))
    steps = [("Brief", "Tell us about the space, how you use it and what you want to change."),
             ("Design and 3D", "Layouts, materials and photoreal 3D views you approve before work starts."),
             ("Written quote", "A written, itemised quote after a site visit, so you know what is included."),
             ("Build and handover", "One accountable team coordinates the work through to handover.")]
    main_html = ('<main id="main-content">\n<div id="services-page">\n'
        '<section class="sv-hero" aria-labelledby="sv-title"><div class="sv-wrap">'
        '<nav class="sv-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span aria-current="page">Services</span></nav>'
        '<p class="sv-kicker">Woodex Interior services</p>'
        '<h1 id="sv-title">Interior design and build services in Lahore</h1>'
        '<p class="sv-dek">Every Woodex service in one place: interior design, commercial interiors, hospitality and healthcare, fit-out, renovation, architecture and 3D visualization. Choose a service to see the scope, process and related projects.</p>'
        '<ul class="sv-jump">%s</ul>'
        '<p class="sv-short"><strong>In short:</strong> Woodex Interior is a Lahore design and build studio offering %d services across six groups. We design homes, offices, shops, restaurants and clinics, show them in photoreal 3D, and can deliver the build with one accountable team.</p>'
        '</div></section>\n%s\n'
        '<section class="sv-steps" aria-labelledby="sv-steps-h"><div class="sv-wrap"><p class="sv-kicker" style="color:#d9bf98">How every service works</p><h2 id="sv-steps-h">Four clear steps, whichever service you choose.</h2><ol>%s</ol></div></section>\n'
        '<section class="sv-faq" aria-labelledby="sv-faq-h"><div class="sv-wrap"><p class="sv-kicker">Questions</p><h2 id="sv-faq-h">Asked often, answered plainly.</h2>%s</div></section>\n'
        '%%TALK%%\n</div>\n</main>') % (jump, total, "\n".join(groups_html),
        "".join("<li><h3>%s</h3><p>%s</p></li>" % s for s in steps),
        "".join("<details%s><summary>%s</summary><p>%s</p></details>" % (" open" if i == 0 else "", E(q), E(a)) for i, (q, a) in enumerate(FAQS)))

    tpl = rd(os.path.join(ROOT, "about", "index.html"))
    kd = rd(os.path.join(ROOT, "kitchen-design", "index.html"))
    talk = re.search(r'<section class="wx-talk-section[\s\S]*?</section>', kd)
    talk = talk.group(0) if talk else ""
    talk = re.sub(r"Plan your [^<.]* with us\.", "Plan your project with us.", talk)
    talk = re.sub(r"<option selected>[^<]*</option>", "<option selected>Not sure yet</option>", talk, count=1)
    talk = re.sub(r'id="kitchen-contact"', 'id="wx-talk"', talk)
    talk = talk.replace("Share your room dimensions, inspiration or budget.", "Tell us about your space and what you want to change.")
    s = re.sub(r"<main\b[\s\S]*?</main>", lambda m: main_html.replace("%TALK%", talk), tpl, count=1)
    title = "Services | Interior Design, Fit-Out & Renovation Lahore | Woodex"
    if len(title) > 65: title = "Woodex Services | Interior Design & Build Lahore"
    desc = "All Woodex Interior services in Lahore: interior design, office and commercial interiors, fit-out, renovation, architecture and 3D visualization."
    url = SITE + "/services/"
    for pat, val in [(r"<title>[\s\S]*?</title>", "<title>%s</title>" % E(title)),
                     (r'<meta name="description" content="[^"]*"\s*/?>', '<meta name="description" content="%s" />' % E(desc)),
                     (r'<link rel="canonical" href="[^"]*"\s*/?>', '<link rel="canonical" href="%s" />' % url),
                     (r'<meta property="og:title" content="[^"]*"\s*/?>', '<meta property="og:title" content="%s" />' % E(title)),
                     (r'<meta property="og:description" content="[^"]*"\s*/?>', '<meta property="og:description" content="%s" />' % E(desc)),
                     (r'<meta property="og:url" content="[^"]*"\s*/?>', '<meta property="og:url" content="%s" />' % url),
                     (r'<meta property="og:image:alt" content="[^"]*"\s*/?>', '<meta property="og:image:alt" content="Woodex Interior services, Lahore" />'),
                     (r'<meta name="twitter:title" content="[^"]*"\s*/?>', '<meta name="twitter:title" content="%s" />' % E(title)),
                     (r'<meta name="twitter:description" content="[^"]*"\s*/?>', '<meta name="twitter:description" content="%s" />' % E(desc))]:
        s, c = re.subn(pat, lambda m: val, s, count=1)
        if not c: raise SystemExit("tag missing " + pat)
    ld = [{"@context": "https://schema.org", "@type": "CollectionPage", "name": "Woodex Interior services", "url": url, "description": desc,
           "isPartOf": {"@type": "WebSite", "name": "Woodex Interior", "url": SITE},
           "mainEntity": {"@type": "ItemList", "numberOfItems": total, "itemListElement": items},
           "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".sv-hero h1", ".sv-short"]}},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"}, {"@type": "ListItem", "position": 2, "name": "Services", "item": url}]},
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQS]}]
    # keep LocalBusiness block (first), replace AboutPage block
    s, c = re.subn(r'<script type="application/ld\+json">\{"@context":"https://schema.org","@type":"AboutPage"[\s\S]*?</script>',
                   lambda m: '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>", s, count=1)
    if not c: raise SystemExit("AboutPage ld missing")
    s = s.replace("</head>", CSS + "\n</head>", 1) if 'id="sv-css"' not in s else s
    s = s.replace('href="#about-visit"', 'href="#wx-talk"') if 'id="wx-talk"' in s else s.replace('href="#about-visit"', 'href="/contact/"')
    s = re.sub(r'id="footer-services" href="[^"]*"', 'id="footer-services" href="/services/"', s)
    s = s.replace('data-page-route="about">About</a>', 'data-page-route="about">About</a>', 1)
    os.makedirs(os.path.join(ROOT, "services"), exist_ok=True)
    open(os.path.join(ROOT, "services", "index.html"), "w", encoding="utf-8").write(s)
    print("services hub:", total, "services in", len(GROUPS), "groups")

    # header trigger -> link, footer Services -> /services/ on all pages
    ch = 0
    for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        if "/admin/" in f or "/builder/" in f or "/_" in f: continue
        t = rd(f); o = t
        t = re.sub(r'<button class="nav-services-trigger" type="button" aria-expanded="false" aria-controls="services-menu">([\s\S]*?)</button>',
                   r'<a class="nav-services-trigger" href="/services/" aria-haspopup="true" aria-controls="services-menu">\1</a>', t)
        t = re.sub(r'id="footer-services" href="[^"]*"', 'id="footer-services" href="/services/"', t)
        if t != o: open(f, "w", encoding="utf-8").write(t); ch += 1
    print("pages updated:", ch)
    a = os.path.join(ROOT, "admin", "admin-chrome.js"); t = rd(a)
    t2 = t.replace('<button class="nav-services-trigger" type="button" aria-expanded="false" aria-controls="services-menu">\' + A(label) + \' <span aria-hidden="true">⌄</span></button>',
                   '<a class="nav-services-trigger" href="/services/" aria-haspopup="true" aria-controls="services-menu">\' + A(label) + \' <span aria-hidden="true">⌄</span></a>')
    if t2 != t: open(a, "w", encoding="utf-8").write(t2); print("admin-chrome header updated")
    sm = os.path.join(ROOT, "sitemap.xml"); t = rd(sm)
    if "/services/</loc>" not in t:
        t = t.replace("</urlset>", "  <url><loc>%s</loc><lastmod>2026-10-07</lastmod></url>\n</urlset>" % url); open(sm, "w", encoding="utf-8").write(t)

if __name__ == "__main__":
    main()
