#!/usr/bin/env python3
"""Per-page deep SEO audit (claude-seo seo-page method), one worker per page in parallel.
Output: seo-audit/pages/<slug>.md, seo-audit/PAGE-AUDIT-INDEX.md, seo-audit/pages.json"""
import os, re, json, html, collections, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.join(HERE, "..", "..")
ROOT = os.path.join(REPO, "frontend-v1"); OUT = os.path.join(REPO, "seo-audit")
SKIP = ("admin/", "api/", "builder/", "_private", "_database", "assets/")
CITIES = "karachi islamabad rawalpindi faisalabad multan peshawar quetta sialkot gujranwala hyderabad bahawalpur lahore".split()
HOURS_OK = "9:30"

def load():
    P = {}
    for dp, _, fs in os.walk(ROOT):
        if "index.html" in fs:
            rel = os.path.relpath(os.path.join(dp, "index.html"), ROOT).replace("\\", "/")
            if not rel.startswith(SKIP): P["/" + rel[:-10]] = open(os.path.join(dp, "index.html"), encoding="utf-8").read()
    return P
P = load()

def g(rx, s):
    m = re.search(rx, s, re.I | re.S); return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
def main_html(s):
    m = re.search(r"<main[\s\S]*?</main>", s); return m.group(0) if m else s
def txt(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[\s\S]*?</\1>", " ", s)))).strip()

INBOUND = collections.defaultdict(set)
for u, s in P.items():
    for h in set(re.findall(r'href="(/[^"#?]*)', main_html(s))):
        h = h if h.endswith("/") else h + "/"
        if h in P and h != u: INBOUND[h].add(u)

def ptype(u):
    if u == "/": return "home"
    if u.startswith("/insights/"): return "hub" if u == "/insights/" else "article"
    if u.startswith("/projects/"): return "projects-hub" if u == "/projects/" else "case-study"
    if u.strip("/") in CITIES: return "city"
    if u.strip("/") in ("about", "contact", "book-a-visit", "privacy", "estimator"): return "utility"
    if u.strip("/") in ("interior-design", "fit-out", "renovation", "architecture", "3d-visualization", "turnkey-design-build"): return "pillar"
    return "service"

def target_kw(u, title, t):
    slug = u.strip("/").split("/")[-1] or "interior design"
    base = re.sub(r"-(lahore|pakistan|20\d\d)", "", slug).replace("-", " ")
    if t == "city": return f"interior design {slug}", [f"interior designer {slug}", f"home renovation {slug}", f"office interior {slug}", f"house design {slug}"]
    if t == "home": return "interior design lahore", ["interior designer lahore", "renovation company lahore", "office fit out lahore", "architect lahore"]
    if t in ("article", "hub", "case-study", "projects-hub", "utility"): return None, []
    head = re.sub(r"\s*[|–—:-].*$", "", title).strip().lower().replace("&", "and")
    if "lahore" in head and len(head.split()) <= 6: k = head
    else: k = re.sub(r"^residential ", "", base).replace("buildings", "building") + " lahore"
    b = k.replace(" lahore", "")
    return k, [f"{b} pakistan", f"{b} cost", f"{b} company lahore", f"{b} ideas"]
MANUAL = {"/insights/": "interior design blog", "/projects/": "interior design projects lahore", "/about/": "woodex interior", "/contact/": "contact woodex interior",
  "/book-a-visit/": "book a site visit", "/estimator/": "interior design cost estimator", "/privacy/": "privacy policy",
  "/insights/small-space-ideas/": "small space interior ideas", "/insights/home-renovation-checklist/": "home renovation checklist",
  "/insights/office-interior-guide/": "office interior design", "/insights/interior-design-cost-pakistan/": "interior design cost in pakistan",
  "/insights/3d-visualization-guide/": "3d visualization", "/insights/restaurant-planning-guide/": "restaurant interior design",
  "/insights/retail-shop-interior-guide/": "shop interior design", "/insights/design-process-explained/": "interior design process",
  "/projects/cafe-corner/": "cafe interior design", "/projects/clinic-fit-out/": "clinic fit out", "/projects/courtyard-house/": "house renovation",
  "/projects/office-floor/": "office layout", "/projects/retail-corner/": "shop interior", "/projects/small-apartment/": "small apartment interior"}

CLAIMS = [
    (r"(?:rs\.?|pkr)\s?\d[\d,]*(?:\s?[km]\+?)?(?:\s?[–-]\s?\d[\d,]*\s?[km]?\+?)?|\d[\d,.]*\s?(?:lakh|lac|crore)\b", "Price / PKR figure"),
    (r"\bfree\b[^.]{0,40}", "'Free' offer"),
    (r"\b\d+\s?(?:to|–|-)\s?\d+\s?(?:working\s)?(?:days|weeks|months)\b|\bwithin (?:one|two|\d+) (?:working )?(?:day|days|hours|weeks)\b", "Timeline / response promise"),
    (r"\bwarrant\w*|\bguarantee\w*", "Warranty / guarantee"),
    (r"\bevery (?:design|project|package)[^.]{0,50}", "Absolute process claim"),
    (r"\b(?:iso|pcatp|award\w*|certified)\b[^.]{0,30}", "Certification / award"),
    (r"\b\d{2,4}\+?\s(?:projects|spaces|clients|homes|offices)\b", "Volume claim"),
    (r"\bsince (?:19|20)\d\d\b", "Founding year"),
    (r"\b(?:best|no\.? ?1|leading|top-rated)\b[^.]{0,30}", "Superlative"),
]
VERIFIED = re.compile(r"since 2016|200\+ (?:completed )?spaces", re.I)

def audit(u):
    s = P[u]; m = main_html(s); t = ptype(u); T = txt(m); words = len(T.split())
    title = g(r"<title>(.*?)</title>", s); desc = g(r'<meta name="description" content="([^"]*)"', s)
    h1s = [g(r"(.*)", x) for x in re.findall(r"<h1[^>]*>([\s\S]*?)</h1>", s)]
    h2s = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<h2[^>]*>([\s\S]*?)</h2>", m)]
    kw, rel = target_kw(u, title, t)
    if u in MANUAL: kw = MANUAL[u]
    if not kw:
        kwm = re.search(r'"keywords"\s*:\s*"([^"]+)"', s); kw = (kwm.group(1).split(",")[0] if kwm else title.split("|")[0].strip().lower())
    kwr = re.compile(r"\W+(?:\w+\W+){0,2}".join(map(re.escape, kw.lower().split())))
    out_links = sorted(set(h for h in re.findall(r'href="(/[^"#?]*)"', m) if not h.startswith(("/assets", "/api"))))
    types = sorted(set(re.findall(r'"@type"\s*:\s*"([^"]+)"', s)))
    issues = []; fixes = []
    def I(sev, msg, fix=None, auto=False): issues.append((sev, msg)); fixes.append((fix or msg, auto))
    # title / meta / h1
    if not kwr.search(title.lower()): I("High", f"Target keyword “{kw}” not in title", "Rewrite title to lead with the keyword")
    if len(title) > 60: I("Medium", f"Title {len(title)} chars (>60, truncates)", "Shorten title to ≤60")
    if not 120 <= len(desc) <= 160: I("Medium", f"Meta description {len(desc)} chars (target 120–160)", "Rewrite meta description")
    if not kwr.search(desc.lower()): I("Medium", "Keyword not in meta description", "Add keyword to meta")
    if len(h1s) != 1: I("High", f"{len(h1s)} H1 tags", "Exactly one H1")
    elif t not in ("home", "hub", "utility", "projects-hub") and not kwr.search(h1s[0].lower()) and not any(w in h1s[0].lower() for w in kw.split()[:1]):
        I("Medium", f"H1 “{h1s[0][:60]}” does not express the keyword", "Add keyword or close variant to H1 / kicker")
    if T and not kwr.search(" ".join(T.split()[:150]).lower()): I("Medium", "Keyword not in first 150 words", "Use keyword in intro paragraph")
    # content
    floor = {"article": 600, "service": 600, "pillar": 900, "city": 700, "home": 800, "case-study": 400}.get(t, 250)
    if words < floor: I("High" if words < floor * .6 else "Medium", f"{words} words in <main> (target {floor}+ for {t})", "Expand with unique, useful sections")
    ph = re.findall(r'alt="([^"]*placeholder[^"]*)"', s, re.I)
    if ph: I("High", f"{len(ph)} image alt(s) contain 'placeholder' (template residue)", "Rewrite alts descriptively", auto=True)
    empty = len(re.findall(r'<img(?![^>]*aria-hidden)[^>]*alt=""', m))
    if empty: I("Low", f"{empty} content image(s) with empty alt", "Add alts if informative")
    bad_hours = re.findall(r"10:00\s?(?:–|-|to|AM –)\s?7:30|10 am – 7:30 pm", s, re.I)
    if bad_hours: I("High", f"Wrong hours text ×{len(bad_hours)} (verified Mon–Sat 9:30–6:30)", "Replace with Mon–Sat 9:30–6:30", auto=True)
    cards = re.findall(r'<a[^>]+href="(/[^"#]+)"[^>]*class="[^"]*card', m) + re.findall(r'<a[^>]*class="[^"]*card[^"]*"[^>]*href="(/[^"#]+)"', m)
    dup = [k for k, v in collections.Counter(cards).items() if v > 1]
    if dup: I("Low", "Same card linked twice: " + ", ".join(dup[:4]), "Deduplicate cards")
    if re.search(r'href="/#[a-z-]*contact"', s): I("Medium", "CTA points to homepage anchor /#…contact", "Point to on-page contact anchor", auto=True)
    # links
    inn = len(INBOUND[u])
    if t != "home" and inn < 3: I("Medium", f"Only {inn} inbound contextual links", "Add links from related pillar/articles")
    ins_out = [l for l in out_links if l.startswith("/insights/") and len(l) > 10]
    if t in ("service", "pillar", "city") and not ins_out: I("Medium", "Links to no insights article", "Add 'Related guides' block (2–3 articles)")
    if t == "article" and not any(l for l in out_links if not l.startswith(("/insights", "/contact", "/book"))): I("Medium", "Article links to no service page", "Link to matching service")
    # schema
    need = {"home": ["LocalBusiness", "WebSite", "Organization"], "pillar": ["Service", "FAQPage", "BreadcrumbList"], "service": ["Service", "FAQPage", "BreadcrumbList"],
            "city": ["Service", "FAQPage", "BreadcrumbList"], "article": ["BlogPosting", "BreadcrumbList", "FAQPage"], "case-study": ["CreativeWork", "BreadcrumbList"],
            "hub": ["CollectionPage", "BreadcrumbList"], "projects-hub": ["CollectionPage", "BreadcrumbList"], "utility": ["BreadcrumbList"]}[t]
    if u == "/about/": need = need + ["AboutPage"]
    if u == "/contact/": need = need + ["ContactPage"]
    miss = [x for x in need if x not in types]
    if miss: I("Medium", "Schema to add: " + ", ".join(miss), "Add JSON-LD: " + ", ".join(miss), auto=True)
    if "Service" in types and '"provider"' in s and '"areaServed"' not in s: I("Low", "Service schema without areaServed")
    # E-E-A-T
    eeat = []
    if t == "article":
        eeat.append("Named author (Person) + reviewer missing" if '"Person"' not in s else "Author present")
        if '"dateModified"' not in s: eeat.append("No dateModified")
    if t in ("service", "pillar", "city", "home"):
        if not re.search(r"/projects/[a-z]", m): eeat.append("No link to a real project/case study (Experience)")
        if "testimonial" not in s.lower() and "review" not in T.lower(): eeat.append("No client testimonial/review (Trust)")
    if t == "case-study" and not re.search(r"\b(20\d\d|DHA|Gulberg|Model Town|Bahria|Johar)\b", T): eeat.append("Project has no date/location (unverifiable)")
    if t == "city" and "visit" not in T.lower(): eeat.append("No local proof (site visits, local projects, areas served)")
    # claims
    claims = []; spans = []
    for rx, lab in CLAIMS:
        for mm in re.finditer(rx, T, re.I):
            if any(a <= mm.start() < b for a, b in spans): continue
            spans.append((mm.start() - 40, mm.end() + 40))
            frag = T[max(0, mm.start() - 30): mm.end() + 25]
            if VERIFIED.search(frag) and lab in ("Volume claim", "Founding year"): continue
            claims.append((lab, "…" + frag.strip() + "…"))
    seen = set(); claims = [c for c in claims if not (c[1] in seen or seen.add(c[1]))][:12]
    return {"url": u, "type": t, "words": words, "title": title, "desc": desc, "h1": h1s, "h2": h2s, "kw": kw, "related": rel,
            "inbound": inn, "out": out_links, "schema": types, "issues": issues, "fixes": fixes, "eeat": eeat, "claims": claims}

def score(r): return max(0, 100 - sum({"High": 12, "Medium": 5, "Low": 2}[s] for s, _ in r["issues"]))

def write(r):
    slug = r["url"].strip("/").replace("/", "__") or "home"
    L = [f"# Page audit: {r['url']}", f"Type **{r['type']}** · score **{score(r)}/100** · {r['words']} words · {r['inbound']} inbound links", "",
         "## Target keywords", f"- **Primary:** {r['kw']}", *(f"- Related: {k}" for k in r["related"]), "",
         "## Title / meta / H1", f"- Title ({len(r['title'])}): {r['title']}", f"- Meta ({len(r['desc'])}): {r['desc']}", f"- H1: {' | '.join(r['h1'])}", "",
         "## Section blocks (H2 outline)", *(f"{i}. {h}" for i, h in enumerate(r["h2"], 1)), "",
         "## Internal links", f"- Outbound ({len(r['out'])}): " + ", ".join(r["out"][:30]), "",
         "## Schema", f"- Present: {', '.join(r['schema']) or 'none'}", "",
         "## Issues", *(f"- **[{s}]** {m}" for s, m in r["issues"]), "",
         "## Fix list", *(f"- [ ] {f}{' _(auto-fixable)_' if a else ''}" for f, a in r["fixes"]), "",
         "## E-E-A-T notes", *(f"- {e}" for e in r["eeat"] or ["OK"]), "",
         "## Claims needing the owner's word", *(f"- 🔴 **{l}:** {f}" for l, f in r["claims"] or [("None", "-")]), ""]
    open(os.path.join(OUT, "pages", slug + ".md"), "w").write("\n".join(L))

if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "pages"), exist_ok=True)
    with ThreadPoolExecutor(max_workers=16) as ex: R = list(ex.map(audit, sorted(P)))
    for r in R: write(r)
    json.dump(R, open(os.path.join(OUT, "pages.json"), "w"), indent=1, ensure_ascii=False)
    cnt = collections.Counter(m.split(":")[0].split(" ×")[0][:60] for r in R for s, m in r["issues"])
    claims = collections.Counter(l for r in R for l, _ in r["claims"])
    L = ["# Per-page SEO audit — index", f"{len(R)} pages · average score **{round(sum(map(score, R)) / len(R))}/100** · generated by `tools/seo-audit/page_audit.py`", "",
         "## Most common issues", "| Issue | Pages |", "|---|---|", *(f"| {k} | {v} |" for k, v in cnt.most_common(25)), "",
         "## Claims needing the owner's word (count of occurrences)", "| Claim type | Count |", "|---|---|", *(f"| {k} | {v} |" for k, v in claims.most_common()), "",
         "## All pages", "| Page | Type | Score | Words | Inbound | Issues | Claims |", "|---|---|---|---|---|---|---|"]
    for r in sorted(R, key=score):
        slug = r["url"].strip("/").replace("/", "__") or "home"
        L.append(f"| [{r['url']}](pages/{slug}.md) | {r['type']} | {score(r)} | {r['words']} | {r['inbound']} | {len(r['issues'])} | {len(r['claims'])} |")
    open(os.path.join(OUT, "PAGE-AUDIT-INDEX.md"), "w").write("\n".join(L) + "\n")
    print("avg", round(sum(map(score, R)) / len(R)))
    for k, v in cnt.most_common(25): print(v, k)
    print(claims)
