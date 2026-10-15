#!/usr/bin/env python3
"""P36-A technical SEO fixes. Idempotent.
A1 FAQ block + FAQPage schema on about/contact/book-a-visit/projects + 6 studies
A2/A3 Related guides on those pages (weakly linked posts), Bahawalpur links
A4 /services/ title; A5 image sitemap; A7 mega menu (dedupe links, all services)"""
import os, re, json, html, importlib.util, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "frontend-v1")
spec = importlib.util.spec_from_file_location("polish", os.path.join(HERE, "..", "p34", "polish.py"))
polish = importlib.util.module_from_spec(spec); spec.loader.exec_module(polish)
E = lambda x: html.escape(x, quote=True)
PH = "+92 322 4000768"
CONTACT = f'Call or WhatsApp <a href="tel:+923224000768">{PH}</a>, email <a href="mailto:info@woodex.com.pk">info@woodex.com.pk</a>, or <a href="/book-a-visit/">book a visit online</a>.'

FAQ = {
 "/about/": [
  ("Who is Woodex Interior?", "Woodex Interior is an interior design and fit-out studio based at M-71, Zainab Tower, Model Town Link Road, Lahore. The team plans homes, offices, clinics, shops and restaurants from the first layout to handover."),
  ("What services does Woodex offer?", 'Interior design, fit out, renovation and architecture for homes and businesses. See the <a href="/services/">complete list of services</a>.'),
  ("Does Woodex work outside Lahore?", 'Yes. Projects are run from the Lahore studio for clients in cities such as <a href="/islamabad/">Islamabad</a>, <a href="/faisalabad/">Faisalabad</a>, <a href="/multan/">Multan</a> and <a href="/karachi/">Karachi</a>.'),
  ("How do I start a project with Woodex?", "Share your location, the size of the space and what you want to change. " + CONTACT + " The studio is open Monday to Saturday, 9:30 am to 6:30 pm."),
 ],
 "/contact/": [
  ("Where is the Woodex studio?", "M-71, Zainab Tower, Model Town Link Road, Lahore. Open Monday to Saturday, 9:30 am to 6:30 pm. Closed on Sunday."),
  ("What is the quickest way to reach Woodex?", CONTACT),
  ("What should I include in my first message?", "Your area or city, the type and size of the space, what you want to change, and a few photos or plans if you have them. This helps the designer prepare before the first call."),
  ("Can a designer visit my site?", 'Yes. Choose a time on the <a href="/book-a-visit/">booking page</a> and the visit is confirmed with you on WhatsApp during working hours.'),
 ],
 "/book-a-visit/": [
  ("What happens during a site visit?", "A Woodex designer walks the space with you, takes measurements and photos, and talks through your brief, priorities and budget. You leave with clear next steps."),
  ("What should I prepare before the visit?", "Plans or drawings if you have them, photos of interiors you like, a rough budget range and the date you would like to move in or reopen."),
  ("Can we meet at the studio or online instead?", "Yes. You can book a meeting at the Lahore studio in Zainab Tower or an online call if a site visit is not practical."),
  ("How is my booking confirmed?", f"The team confirms every booking on WhatsApp during working hours, Monday to Saturday 9:30 am to 6:30 pm. For changes, message {PH}."),
 ],
 "/projects/": [
  ("Are these real client projects?", "No. These are illustrative design studies, not built work or client projects. They show how Woodex thinks through a space, from the brief to a buildable plan."),
  ("Why does Woodex publish design studies?", "Studies show the planning behind a good interior: flow, storage, light and materials. They help you judge the approach before you commit to a brief."),
  ("Can I see work similar to my project?", "Yes. In your consultation the designer can walk you through layouts, 3D views and material ideas relevant to your space. " + CONTACT),
  ("Can a study be adapted to my space?", "A study can be a useful starting point for your brief, but every design is planned around your site, measurements and needs."),
 ],
}
STUDY_SVC = {"cafe-corner": ("/cafe-interior-design/", "café"), "clinic-fit-out": ("/healthcare-fit-out/", "clinic"),
             "courtyard-house": ("/interior-design/", "home"), "office-floor": ("/office-interior-design/", "office"),
             "retail-corner": ("/retail-design/", "shop"), "small-apartment": ("/apartment-interior-design/", "apartment")}
GUIDES = {
 "/about/": ["how-to-choose-interior-designer-lahore", "interior-design-trends-pakistan-2027", "new-house-interior-checklist-lahore"],
 "/book-a-visit/": ["how-to-choose-interior-designer-lahore", "new-house-interior-checklist-lahore", "dha-lahore-house-interior-guide"],
 "/contact/": ["office-renovation-checklist", "apartment-interior-ideas-lahore", "10-marla-house-interior-lahore"],
 "/projects/": ["interior-design-trends-pakistan-2027", "false-ceiling-ideas-living-room", "flooring-options-pakistan"],
 "/projects/cafe-corner/": ["salon-interior-design-lahore", "clinic-interior-design-lahore", "office-renovation-checklist"],
 "/projects/clinic-fit-out/": ["clinic-interior-design-lahore", "salon-interior-design-lahore", "office-renovation-checklist"],
 "/projects/courtyard-house/": ["10-marla-house-interior-lahore", "dha-lahore-house-interior-guide", "flooring-options-pakistan"],
 "/projects/office-floor/": ["office-interior-gulberg-lahore", "office-renovation-checklist", "false-ceiling-ideas-living-room"],
 "/projects/retail-corner/": ["salon-interior-design-lahore", "office-interior-gulberg-lahore", "interior-design-trends-pakistan-2027"],
 "/projects/small-apartment/": ["apartment-interior-ideas-lahore", "small-bathroom-design-ideas", "kitchen-cabinet-materials-pakistan"],
 "/estimator/": ["kitchen-cabinet-materials-pakistan", "small-bathroom-design-ideas", "new-house-interior-checklist-lahore"],
 "/services/": ["false-ceiling-ideas-living-room", "kitchen-cabinet-materials-pakistan", "small-bathroom-design-ideas"],
}
CSS = """
/* P36 FAQ block */
.wx-faq-sec{padding:clamp(56px,8vw,96px) 0;background:#f4efe7}
.wx-faq-sec .wx-faq-in{width:min(860px,calc(100% - 40px));margin:0 auto}
.wx-faq-sec .wx-faq-k{margin:0 0 8px;color:#b8956a;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.wx-faq-sec h2{margin:0 0 24px;color:#0c1628;font-size:clamp(1.6rem,3.2vw,2.3rem);line-height:1.15}
.wx-faq-sec details p a{color:#0c1628;text-decoration:underline;text-underline-offset:3px}
"""

def study_faq(slug, s):
    href, kind = STUDY_SVC[slug]
    km = re.search(r"<strong>Key move</strong>\s*([^<]+)", s)
    h1 = re.search(r'<h1 id="dx-title">([\s\S]*?)</h1>', s); t = html.unescape(re.sub("<[^>]+>", "", h1.group(1))).strip() if h1 else "this study"
    q = [("Is this a built project?", "No. It is an illustrative design study, not built work or a client project. It shows the planning approach Woodex brings to a " + kind + "."),
         ("What was the key idea in this study?", f"{E(t)}: {E(km.group(1).strip()) if km else 'a clear layout planned around how the space is used'}. Every real project starts from your own site and brief."),
         (f"Can Woodex design a {kind} like this for me?", f'Yes. See the <a href="{href}">related service</a> for scope and process, then share your location and size with the team.'),
         ("How do I start?", CONTACT)]
    return q

def faq_block(u, qa):
    items = "".join(f"<details><summary>{E(q)}</summary><p>{a}</p></details>" for q, a in qa)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "@id": f"https://woodex.com.pk{u}#faq",
          "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a)}} for q, a in qa]}
    sec = ('<section class="wx-faq-sec" id="faq" aria-labelledby="wx-faq-h"><div class="wx-faq-in">'
           '<p class="wx-faq-k">FAQ</p><h2 id="wx-faq-h">Common questions</h2>'
           f'<div class="wx-faq-list">{items}</div></div></section>\n')
    return sec, '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>\n"

def insert(s, block):
    for anchor in ('<section class="wx-trust"', '<section class="wx-talk-section', "</main>"):
        i = s.find(anchor)
        if i >= 0: return s[:i] + block + s[i:]
    return s

def run():
    n = 0
    for u, guides in GUIDES.items():
        f = os.path.join(ROOT, u.strip("/"), "index.html"); s = o = open(f, encoding="utf-8").read()
        qa = FAQ.get(u) or (study_faq(u.split("/")[2], s) if u.startswith("/projects/") and u != "/projects/" else None)
        if qa and 'class="wx-faq-sec"' not in s:
            sec, ld = faq_block(u, qa); s = insert(s, sec); s = s.replace("</head>", ld + "</head>", 1)
        if "wx-guides" not in s:
            stub = '<section class="wx-guides">' + "".join(f'<a href="/insights/{g}/"></a>' for g in guides) + "</section>\n"
            s = polish.guides(insert(s, stub))
        if u == "/services/":
            s = re.sub(r"<title>[^<]*</title>", "<title>Interior Design &amp; Fit-Out Services in Lahore | Woodex</title>", s, 1)
        if s != o: open(f, "w", encoding="utf-8").write(s); n += 1
    # Bahawalpur: nearby links from Lahore + Faisalabad
    for c in ("lahore", "faisalabad"):
        f = os.path.join(ROOT, c, "index.html"); s = open(f, encoding="utf-8").read()
        if 'href="/bahawalpur/"' not in s and 'id="city-nearby"' in s:
            s = re.sub(r'(id="city-nearby"[\s\S]*?)(\s*</div>\s*</div></section>)',
                       lambda m: m.group(1) + '\n        <a class="btn btn-light" href="/bahawalpur/">Interior design in Bahawalpur</a>' + m.group(2), s, 1)
            open(f, "w", encoding="utf-8").write(s); n += 1
    # CSS
    v = os.path.join(ROOT, "assets", "v1.css"); c = open(v, encoding="utf-8").read()
    if "P36 FAQ block" not in c: open(v, "a", encoding="utf-8").write(CSS)
    # A7 mega menu: replace duplicate links with real pages, on every page
    REP = [('<a href="/interior-design/">Residential interiors</a>', '<a href="/apartment-interior-design/">Apartment interiors</a>'),
           ('<a href="/kitchen-design/">Kitchen design</a></div>', '<a href="/kitchen-design/">Kitchen design</a><a href="/wardrobe-design/">Wardrobes</a></div>'),
           ('<a href="/residential-renovation/">House renovation</a></div>', '<a href="/residential-renovation/">House renovation</a><a href="/interior-home-refurbishment/">Home refurbishment</a></div>'),
           ('<a href="/fit-out/">Project management</a>', '<a href="/healthcare-fit-out/">Clinic fit out</a>'),
           ('<a href="/architecture/">Residential architecture</a>', '<a href="/1-kanal-house-design/">1 kanal house design</a>'),
           ('<a href="/architecture/">Commercial architecture</a>', '<a href="/10-marla-house-design/">10 marla house design</a>'),
           ('<a class="mega-studio" href="/3d-visualization/" data-page-route="studio">3D Studio', '<a class="mega-studio" href="/services/">All services')]
    m = 0
    for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        if "/admin/" in f or "/builder/" in f: continue
        s = o = open(f, encoding="utf-8").read()
        for a, b in REP:
            if b not in s: s = s.replace(a, b)
        if s != o: open(f, "w", encoding="utf-8").write(s); m += 1
    # A5 image sitemap
    sm = os.path.join(ROOT, "sitemap.xml"); t = open(sm, encoding="utf-8").read()
    if "xmlns:image" not in t:
        t = t.replace('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"', 1)
        def img(mt):
            loc = mt.group(1); p = os.path.join(ROOT, loc.replace("https://woodex.com.pk/", ""), "index.html")
            if not os.path.exists(p): return mt.group(0)
            g = re.search(r'<meta property="og:image" content="([^"]+)"', open(p, encoding="utf-8").read())
            return mt.group(0) if not g else mt.group(0).replace("</loc>", f"</loc><image:image><image:loc>{g.group(1)}</image:loc></image:image>", 1)
        t = re.sub(r"<loc>([^<]+)</loc>", img, t)
        open(sm, "w", encoding="utf-8").write(t)
    # A3 weak links: swap one related-guide card on relevant pages
    SWAP = {"wardrobe-design": ("small-space-ideas", "wardrobe-vs-dressing-room"),
            "dressing-room-design": ("1-kanal-house-interior-cost-lahore", "wardrobe-vs-dressing-room"),
            "lahore/bahria-town": ("house-renovation-cost-lahore-2026", "upgrade-builder-finished-house-lahore"),
            "complete-home-redesign": ("apartment-small-space-planning-lahore", "upgrade-builder-finished-house-lahore")}
    polish.FORCE = True
    for p, (a, b) in SWAP.items():
        f = os.path.join(ROOT, p, "index.html"); s = o = open(f, encoding="utf-8").read()
        mt = re.search(r'<section class="wx-guides[\s\S]*?</section>', s)
        if mt and f"/insights/{b}/" not in mt.group(0) and f"/insights/{a}/" in mt.group(0):
            s = polish.guides(s.replace(mt.group(0), mt.group(0).replace(f"/insights/{a}/", f"/insights/{b}/")))
        if s != o: open(f, "w", encoding="utf-8").write(s)
    polish.FORCE = False
    # GEO: "In short" box at the top of every article (from its own short-version section)
    k = 0
    for f in glob.glob(os.path.join(ROOT, "insights", "*", "index.html")):
        s = open(f, encoding="utf-8").read()
        if "wx-short-post" in s or '<nav class="dx-toc"' not in s: continue
        mt = re.search(r'<h2 id="[^"]*short-version[^"]*">[^<]*</h2>\s*([\s\S]*?)\s*</div>', s)
        body = mt.group(1) if mt else ""
        if not body:
            d = re.search(r'<p class="dx-dek">([\s\S]*?)</p>', s); body = f'<p class="wx-short-a">{d.group(1)}</p>' if d else ""
        if not body: continue
        box = f'<aside class="wx-short wx-short-post" aria-label="In short"><div class="wx-short-in"><p class="wx-short-k">In short</p>{body}</div></aside>\n'
        s = s.replace('<nav class="dx-toc"', box + '<nav class="dx-toc"', 1)
        open(f, "w", encoding="utf-8").write(s); k += 1
    c = open(v, encoding="utf-8").read()
    if "wx-short-post" not in c:
        open(v, "a", encoding="utf-8").write(".wx-short-post{margin:0 0 28px;padding:0;background:none}.wx-short-post .wx-short-in{width:auto;margin:0;padding:22px 24px;border-left:3px solid #b8956a;border-radius:14px;background:#f4efe7}.wx-short-post ul{margin:8px 0 0;padding-left:18px}.wx-short-post li{margin:4px 0}\n")
    print("pages", n, "menu files", m, "sitemap images", t.count("<image:image>"), "in-short boxes", k)
if __name__ == "__main__": run()
