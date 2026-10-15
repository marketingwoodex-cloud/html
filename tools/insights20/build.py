#!/usr/bin/env python3
"""Build the 20 ranking articles (MASTER-REVIEW-20-articles.md) as static Woodex insight pages.
Template = an existing insight page (header/footer/styles are reused untouched); only <head> SEO tags and <main> are generated.
Run:  python3 tools/insights20/build.py      (from the repo root)
"""
import html, json, os, re, sys, glob, importlib.util

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1")
ROOT = os.path.abspath(ROOT)
TPL = os.path.join(ROOT, "insights", "small-space-ideas", "index.html")
SITE = "https://woodex.com.pk"
DATE = "2026-10-07"

POSTS = []
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "posts_*.py"))):
    spec = importlib.util.spec_from_file_location(os.path.basename(f)[:-3], f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    POSTS.extend(m.POSTS)
    for slug, extra in getattr(m, "EXTRA", {}).items():
        for p in POSTS:
            if p["slug"] == slug and m.__name__ not in p.setdefault("_xs", []):
                p["sections"] = p["sections"][:-1] + extra + p["sections"][-1:]; p["_xs"].append(m.__name__)
BY = {p["slug"]: p for p in POSTS}
E = lambda s: html.escape(str(s), quote=True)

def slugify(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]

def img_tag(src_id, alt, sizes="(max-width: 768px) 100vw, 50vw", eager=False, cls=None, w=1920, h=1080):
    base = "/assets/img/" + src_id
    for v in ("", "-960", "-480"):
        if not os.path.exists(os.path.join(ROOT, "assets", "img", src_id + v + ".webp")): sys.exit("missing image " + src_id + v)
    a = ' class="%s"' % cls if cls else ""
    return ('<img%s sizes="%s" srcset="%s-480.webp 480w, %s-960.webp 960w, %s.webp 1920w" src="%s.webp" alt="%s" width="%d" height="%d" loading="%s" decoding="async"%s>'
            % (a, sizes, base, base, base, base, E(alt), w, h, "eager" if eager else "lazy", ' fetchpriority="high"' if eager else ""))

def words(p):
    t = " ".join([p["dek"]] + [s[1] for s in p["sections"]] + [b for b in p["short"]] + [q + " " + a for q, a in p["faqs"]])
    return len(re.sub(r"<[^>]+>", " ", t).split())

def check_links(p):
    for href in re.findall(r'href="(/[^"#]*)"', " ".join(s[1] for s in p["sections"])):
        path = href.split("?")[0]
        if path.startswith("/insights/") and path.strip("/").split("/")[-1] in BY: continue
        if not os.path.exists(os.path.join(ROOT, path.strip("/"), "index.html")) and path != "/": sys.exit("%s: broken internal link %s" % (p["slug"], href))

def build(p, tpl):
    url = "%s/insights/%s/" % (SITE, p["slug"])
    secs = [(h, body, "s-%d-%s" % (i + 1, slugify(h))) for i, (h, body) in enumerate(p["sections"])]
    n = len(secs)
    short_id = "s-%d-the-short-version" % (n + 1); faq_id = "s-%d-asked-often-answered-plainly" % (n + 2)
    toc = "".join('<li><a href="#%s">%s</a></li>' % (sid, E(h)) for h, _, sid in secs) + '<li><a href="#%s">The short version.</a></li><li><a href="#%s">Asked often, answered plainly.</a></li>' % (short_id, faq_id)
    body = []
    for i, (h, b, sid) in enumerate(secs):
        body.append('<div data-in-reveal=""><h2 id="%s">%s</h2>%s</div>' % (sid, E(h), b))
        for im in p.get("images", []):
            if im[3] == i + 1:
                body.append('<figure class="in-image" data-in-reveal="">%s<figcaption>%s</figcaption></figure>' % (img_tag(im[0], im[1]), E(im[2])))
    cta = p.get("cta", ("Planning a project like this?", "Share your floor plan and brief and the Woodex team will come back with the right next step.", "/contact/", "Talk to the studio →"))
    body.append('<aside class="wx-cta"><h3>%s</h3><p>%s</p><a href="%s">%s</a></aside>' % (E(cta[0]), E(cta[1]), cta[2], E(cta[3])))
    short = "".join("<li>%s</li>" % b for b in p["short"])
    faqs = "".join('<div class="in-faq-item"><button class="in-faq-q" type="button" aria-expanded="%s"><span>%s</span><span class="plus">+</span></button><div class="in-faq-a"><div><p>%s</p></div></div></div>'
                   % ("true" if i == 0 else "false", E(q), E(a)) for i, (q, a) in enumerate(p["faqs"]))
    rel = []
    for s in p["related"]:
        r = BY.get(s) or EXISTING.get(s)
        if not r: sys.exit("unknown related " + s)
        rel.append('<a class="dx-card" href="/insights/%s/" data-in-reveal>\n          <figure>%s<figcaption class="dx-tag">%s</figcaption></figure>\n          <h3>%s</h3>\n          <p>%s</p>\n          <span class="dx-more">Read the article</span>\n        </a>'
                   % (s, img_tag(r["cover"], r["cover_alt"]), E(r["kicker"]), E(r["title"]), E(r["card"])))
    main = ('<main id="main-content">\n\n    <section class="dx-hero dx-hero--image" aria-labelledby="dx-title">\n      %s\n      <div class="dx-wrap dx-hero-inner">\n        <p class="dx-kicker">%s</p>\n        <h1 id="dx-title">%s</h1>\n        <p class="dx-dek">%s</p>\n'
            '        <dl class="dx-meta">\n          <div class="dx-meta-item"><dt>Category</dt><dd>%s</dd></div>\n          <div class="dx-meta-item"><dt>Read time</dt><dd>%d min read</dd></div>\n          <div class="dx-meta-item"><dt>Updated</dt><dd><time datetime="%s">October 2026</time></dd></div>\n          <div class="dx-meta-item"><dt>By</dt><dd>Woodex Studio</dd></div>\n        </dl>\n      </div>\n    </section>\n\n'
            '    <section class="dx-body">\n      <div class="dx-wrap dx-body-grid">\n        <div class="dx-main">\n          <nav class="dx-toc" aria-label="On this page" data-in-reveal><p>On this page</p><ol>%s</ol></nav>\n\n%s\n'
            '          <div data-in-reveal>\n            <h2 id="%s">The short version.</h2>\n            <ul>%s</ul>\n          </div>\n          <div data-in-reveal>\n<header data-in-reveal=""><p class="in-label">Questions</p><h2 id="%s">Asked often, answered plainly.</h2></header>\n      <div class="in-faq-list">%s</div>\n          </div>\n        </div>\n      </div>\n    </section>\n\n'
            '    <section class="dx-quote"><div class="dx-wrap"><blockquote data-in-reveal>%s</blockquote></div></section>\n\n    <section class="dx-related">\n      <div class="dx-wrap">\n        <header data-in-reveal><p class="dx-kicker">Keep looking</p><h2>Related reading.</h2></header>\n        <div class="dx-cards">\n        %s\n        </div>\n      </div>\n    </section>\n\n</main>'
            ) % (img_tag(p["cover"], "", sizes="100vw", eager=True, cls="dx-hero-bg").replace('alt=""', 'alt="" aria-hidden="true"'), E(p["kicker"]), E(p["title"]), E(p["dek"]), E(p["kicker"]), max(3, round(words(p) / 220)), DATE,
                 toc, "\n".join(body), short_id, short, faq_id, faqs, E(p["quote"]), "\n        ".join(rel))
    s = tpl
    s = re.sub(r"<main\b[\s\S]*?</main>", lambda m: main, s, count=1)
    title = p["seo_title"]
    rep = {
        r"<title>[\s\S]*?</title>": "<title>%s</title>" % E(title),
        r'<meta name="description" content="[^"]*"\s*/?>': '<meta name="description" content="%s" />' % E(p["desc"]),
        r'<link rel="canonical" href="[^"]*"\s*/?>': '<link rel="canonical" href="%s" />' % url,
        r'<meta property="og:title" content="[^"]*"\s*/?>': '<meta property="og:title" content="%s" />' % E(title),
        r'<meta property="og:description" content="[^"]*"\s*/?>': '<meta property="og:description" content="%s" />' % E(p["desc"]),
        r'<meta property="og:url" content="[^"]*"\s*/?>': '<meta property="og:url" content="%s" />' % url,
        r'<meta property="og:image" content="[^"]*"\s*/?>': '<meta property="og:image" content="%s/assets/img/%s.webp" />' % (SITE, p["cover"]),
        r'<meta property="og:image:alt" content="[^"]*"\s*/?>': '<meta property="og:image:alt" content="%s" />' % E(p["cover_alt"]),
        r'<meta name="twitter:title" content="[^"]*"\s*/?>': '<meta name="twitter:title" content="%s" />' % E(title),
        r'<meta name="twitter:description" content="[^"]*"\s*/?>': '<meta name="twitter:description" content="%s" />' % E(p["desc"]),
        r'<meta name="twitter:image" content="[^"]*"\s*/?>': '<meta name="twitter:image" content="%s/assets/img/%s.webp" />' % (SITE, p["cover"]),
    }
    for k, v in rep.items():
        s, c = re.subn(k, lambda m: v, s, count=1)
        if not c: sys.exit("template tag not found: " + k)
    s = re.sub(r'<meta name="keywords"[^>]*>\s*', "", s)
    s = s.replace("<title>", '<meta name="keywords" content="%s" />\n<meta property="article:published_time" content="%s" />\n<meta property="article:modified_time" content="%s" />\n<title>' % (E(", ".join([p["kw"]] + p["related_kw"])), DATE, DATE), 1)
    ld = [
        {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"], "description": p["desc"], "image": "%s/assets/img/%s.webp" % (SITE, p["cover"]), "datePublished": DATE, "dateModified": DATE,
         "author": {"@type": "Organization", "name": "Woodex Studio", "url": SITE + "/about/"}, "publisher": {"@type": "Organization", "name": "Woodex Interior", "logo": {"@type": "ImageObject", "url": SITE + "/assets/img/woodex-logo.png", "width": 600, "height": 600}},
         "mainEntityOfPage": url, "keywords": ", ".join([p["kw"]] + p["related_kw"]), "articleSection": p["kicker"], "inLanguage": "en-PK", "wordCount": words(p)},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"}, {"@type": "ListItem", "position": 2, "name": "Insights", "item": SITE + "/insights/"}, {"@type": "ListItem", "position": 3, "name": p["title"], "item": url}]},
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faqs"]]},
    ]
    s, c = re.subn(r'<script type="application/ld\+json">[\s\S]*?</script>', lambda m: '<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False) + "\n</script>", s, count=1)
    if not c: sys.exit("ld+json not found")
    return s

EXISTING = {}
def existing_cards():
    ix = open(os.path.join(ROOT, "insights", "index.html"), encoding="utf-8").read()
    for slug in ["small-space-ideas", "home-renovation-checklist", "office-interior-guide", "interior-design-cost-pakistan", "3d-visualization-guide", "restaurant-planning-guide", "retail-shop-interior-guide", "design-process-explained"]:
        f = open(os.path.join(ROOT, "insights", slug, "index.html"), encoding="utf-8").read()
        t = re.search(r'<h1 id="dx-title">([\s\S]*?)</h1>', f); k = re.search(r'<p class="dx-kicker">([\s\S]*?)</p>', f); d = re.search(r'<meta name="description" content="([^"]*)"', f)
        og = re.search(r'class="dx-hero-bg" src="/assets/img/([a-z0-9-]+)\.webp"', f) or re.search(r'src="/assets/img/(img-[0-9a-f]{12})\.webp"', f)
        EXISTING[slug] = {"title": html.unescape(t.group(1)), "kicker": html.unescape(k.group(1)), "card": html.unescape(d.group(1))[:110], "cover": og.group(1), "cover_alt": html.unescape(t.group(1))}

def main():
    existing_cards()
    tpl = open(TPL, encoding="utf-8").read()
    errs = []
    for p in POSTS:
        check_links(p)
        if len(p["seo_title"]) > 60: errs.append("%s seo_title %d" % (p["slug"], len(p["seo_title"])))
        if not 120 <= len(p["desc"]) <= 160: errs.append("%s desc %d" % (p["slug"], len(p["desc"])))
        body = re.sub(r"<[^>]+>", "", " ".join(s[1] for s in p["sections"])).lower().replace("'s", "")
        if not re.search(r"\W+(?:\w+\W+){0,2}".join(map(re.escape, p["kw"].lower().split())), (p["title"] + " " + p["dek"] + " " + body).lower()): errs.append(p["slug"] + " focus keyword missing in text")
        if p["kw"].split()[0].lower() not in p["seo_title"].lower(): errs.append(p["slug"] + " keyword not in seo title")
        for bad in ["free ", "warranty", "guarantee", "turnkey one contract", "in today's", "delve", "comprehensive", "leverage", "in conclusion", "pcatp", "drap", "pfa"]:
            if bad in (body + " " + p["desc"].lower() + " " + " ".join(a for q, a in p["faqs"]).lower()): errs.append("%s banned phrase '%s'" % (p["slug"], bad.strip()))
        if re.search(r"(rs\.?|pkr)\s?[0-9]", body): errs.append(p["slug"] + " invented price")
    if errs: print("\n".join(errs)); sys.exit(1)
    only = os.environ.get("ONLY")
    for p in POSTS:
        if only and not p["slug"] in [x.strip() for x in open(only).read().split()]: continue
        d = os.path.join(ROOT, "insights", p["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(build(p, tpl))
        print("%-48s %4d words  %d sections  %d faqs" % (p["slug"], words(p), len(p["sections"]), len(p["faqs"])))
    print(len(POSTS), "posts built")

if __name__ == "__main__":
    main()
