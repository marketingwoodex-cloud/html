#!/usr/bin/env python3
"""P34: talk/CTA block v2, related guides v2 (with images), footer Location link,
contact map single card, reviews slider (2 per view). Idempotent."""
import os, re, glob, html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend-v1")
MAPS = "https://www.google.com/maps/search/?api=1&amp;query=Woodex+Interior+Zainab+Tower+Model+Town+Link+Road+Lahore"

def pages():
    for f in sorted(glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        if not rel.startswith(("admin/", "api/", "builder/", "_", "assets/")): yield f, "/" + rel[:-10]

# ---------- talk v2 ----------
CHIP = ('<div class="wx-talk-chips"><a href="tel:+923224000768">+92 322 4000768</a><a href="https://wa.me/923224000768">WhatsApp</a>'
        f'<a href="{MAPS}" target="_blank" rel="noopener">M-71, Zainab Tower, Lahore</a><span>Mon–Sat 9:30–6:30</span></div>')
POINTS = "<ul class=\"wx-talk-points\"><li>Photoreal 3D before you commit</li><li>Written, itemised quote after a site visit</li><li>One accountable team from design to handover</li></ul>"
def talk(s):
    m = re.search(r'<section class="wx-talk-section[\s\S]*?</section>', s)
    if not m or "wx-talk-v2" in m.group(0): return s
    b = m.group(0).replace('class="wrap wx-talk-grid"', 'class="wrap wx-talk-grid wx-talk-v2"', 1)
    b = re.sub(r'<ul class="wx-talk-points">[\s\S]*?</ul>', POINTS + CHIP, b, 1)
    b = re.sub(r"usually within one working day\.?", "during office hours.", b)
    return s.replace(m.group(0), b, 1)

# ---------- related guides v2 ----------
def art(slug):
    s = open(os.path.join(ROOT, "insights", slug, "index.html"), encoding="utf-8").read()
    t = html.unescape(re.search(r'<h1 id="dx-title">([\s\S]*?)</h1>', s).group(1)).strip()
    k = re.search(r'<p class="dx-kicker">([\s\S]*?)</p>', s); k = html.unescape(k.group(1)).strip() if k else "Guide"
    im = re.search(r'class="dx-hero-bg"[^>]*src="/assets/img/([a-z0-9-]+?)\.webp"', s) or re.search(r'<meta property="og:image" content="[^"]*/assets/img/([a-z0-9-]+?)(?:-960)?\.webp"', s)
    i = im.group(1) if im else "img-774a712057fc"
    i = re.sub(r"-(960|480)$", "", i)
    alts = [x for x in dict.fromkeys(re.findall(r'src="/assets/img/((?:img|ins)-[a-z0-9]+)(?:-960)?\.webp"', s)) if os.path.exists(os.path.join(ROOT, "assets", "img", x + "-960.webp"))]
    i = [i] + [x for x in alts if x != i]
    rt = re.search(r"(\d+) min read", s); rt = rt.group(0) if rt else "5 min read"
    return t, k, i, rt
FORCE = False
def guides(s):
    m = re.search(r'<section class="wx-guides[^"]*"[\s\S]*?</section>\n?', s)
    if not m or ("wx-guides-v2" in m.group(0) and not FORCE): return s
    slugs = re.findall(r'href="/insights/([a-z0-9-]+)/"', m.group(0))
    cards = ""; used = set()
    for n, sl in enumerate(slugs):
        t, k, ims, rt = art(sl)
        i = next((x for x in ims if x not in used), ims[0]); used.add(i)
        cards += (f'<li><a href="/insights/{sl}/"><figure><img src="/assets/img/{i}-960.webp" srcset="/assets/img/{i}-480.webp 480w, /assets/img/{i}-960.webp 960w" '
                  f'sizes="(max-width: 860px) 100vw, 33vw" alt="{html.escape(t, quote=True)}" loading="lazy" decoding="async" width="960" height="640">'
                  f'<span class="wx-g-tag">{html.escape(k)}</span></figure><div class="wx-g-body"><small>{rt}</small><strong>{html.escape(t)}</strong>'
                  f'<em>Read the guide <span aria-hidden="true">→</span></em></div></a></li>')
    new = ('<section class="wx-guides wx-guides-v2" aria-labelledby="wx-guides-h"><div class="wx-g-wrap">'
           '<div class="wx-g-head"><div><p class="wx-g-k">Related guides</p><h2 id="wx-guides-h">Read before you plan</h2></div>'
           '<a class="wx-g-all" href="/insights/">All guides <span aria-hidden="true">→</span></a></div>'
           f'<ul>{cards}</ul></div></section>\n')
    return s.replace(m.group(0), new, 1)

def footer(s):
    if 'aria-label="Practice links"' not in s or ">Location</a>" in s: return s
    return re.sub(r'(<nav class="footer-column" aria-label="Practice links">[\s\S]*?)(</nav>)',
                  lambda m: m.group(1) + f'<a href="{MAPS}" target="_blank" rel="noopener">Location</a>' + m.group(2), s, 1)

CSS = r"""
/* ===== P34 Start-your-project / talk block v2 ===== */
.wx-talk-section:has(.wx-talk-v2){background:#fff;padding:clamp(56px,7vw,96px) 0}
.wx-talk-v2.wx-talk-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch;background:#0c1628;border-radius:28px;overflow:hidden;box-shadow:0 40px 80px -40px rgba(12,22,40,.5)}
.wx-talk-v2 .wx-talk-copy{position:relative;isolation:isolate;padding:clamp(32px,4.5vw,56px);display:flex;flex-direction:column;justify-content:flex-end;min-height:560px;color:#fff}
.wx-talk-v2 .wx-talk-image{position:absolute;inset:0;margin:0;height:auto;border-radius:0;z-index:-2}
.wx-talk-v2 .wx-talk-image img{width:100%;height:100%;object-fit:cover}
.wx-talk-v2 .wx-talk-copy:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(12,22,40,.15) 0%,rgba(12,22,40,.55) 45%,rgba(12,22,40,.92) 100%)}
.wx-talk-v2 .wx-talk-label{color:#e6d3b8!important}
.wx-talk-v2 .wx-talk-copy h2{color:#fff!important;font-size:clamp(2rem,3.4vw,2.8rem)!important;margin:0 0 12px}
.wx-talk-v2 .wx-talk-copy .lead{color:rgba(255,255,255,.8)!important;margin:0 0 20px}
.wx-talk-v2 .wx-talk-points{gap:8px;margin-bottom:22px}
.wx-talk-v2 .wx-talk-points li{color:#fff;font-weight:500;padding-left:28px}
.wx-talk-v2 .wx-talk-points li:before{border-color:#d9b98c}
.wx-talk-chips{display:flex;flex-wrap:wrap;gap:8px}
.wx-talk-chips a,.wx-talk-chips span{display:inline-flex;align-items:center;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);backdrop-filter:blur(6px);color:#fff;font-size:.84rem;text-decoration:none;border:1px solid rgba(255,255,255,.18);transition:background .25s}
.wx-talk-chips a:hover{background:rgba(255,255,255,.24)}
.wx-talk-v2 .wx-talk-panel{background:#fff;color:#0c1628;border-radius:0;box-shadow:none;padding:clamp(32px,4.5vw,56px);display:flex;flex-direction:column;justify-content:center}
.wx-talk-v2 .wx-talk-panel h3{color:#0c1628;font-size:1.5rem;margin:0 0 6px}
.wx-talk-v2 .wx-talk-panel>p{color:#5b6472;margin:0 0 22px}
.wx-talk-v2 .wx-talk-form label span{color:#5b6472}
.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form input,.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form select,.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form textarea{background-color:#f6f2ec!important;color:#0c1628!important;border:1px solid rgba(12,22,40,.1)!important}
.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%230c1628' stroke-width='1.6'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 14px center!important}
.wx-talk-v2 .wx-talk-form input::placeholder,.wx-talk-v2 .wx-talk-form textarea::placeholder{color:#9a9fa8!important}
.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form input:focus,.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form select:focus,.wx-talk-v2.wx-talk-grid .wx-talk-panel .wx-talk-form textarea:focus{border-color:#b8956a!important;background-color:#fff!important}
.wx-talk-v2 .wx-talk-form .btn{background:#0c1628!important;color:#fff!important;border-color:#0c1628!important;justify-self:stretch;border-radius:999px;padding:15px 22px}
.wx-talk-v2 .wx-talk-alt{color:#5b6472}.wx-talk-v2 .wx-talk-alt a{color:#0c1628;font-weight:600}
@media(max-width:900px){.wx-talk-v2.wx-talk-grid{grid-template-columns:1fr}.wx-talk-v2 .wx-talk-copy{min-height:460px}}

/* ===== P34 Related guides v2 (image cards) ===== */
.wx-guides-v2 .wx-g-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:28px}
.wx-guides-v2 h2{margin:0}
.wx-g-all{color:#0c1628;font-weight:600;text-decoration:none;border-bottom:1px solid #b8956a;padding-bottom:3px;white-space:nowrap}
.wx-guides-v2 li a{padding:0;overflow:hidden;display:flex;flex-direction:column;border-radius:18px}
.wx-guides-v2 figure{position:relative;margin:0;aspect-ratio:16/10;overflow:hidden;background:#e9e1d4}
.wx-guides-v2 figure img{width:100%;height:100%;object-fit:cover;transition:transform 1s cubic-bezier(.22,1,.36,1)}
.wx-guides-v2 li a:hover figure img{transform:scale(1.06)}
.wx-g-tag{position:absolute;left:14px;top:14px;background:rgba(255,255,255,.92);color:#0c1628;font-size:.72rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px;border-radius:999px}
.wx-g-body{padding:18px 20px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.wx-g-body small{font-size:.78rem;color:#8a6a43;font-weight:600}
.wx-g-body strong{font-size:1.08rem;line-height:1.35;color:#0c1628;margin:0}
.wx-g-body em{margin-top:auto;padding-top:6px;font-style:normal;font-size:.88rem;font-weight:600;color:#0c1628}
.wx-g-body em span{display:inline-block;transition:transform .25s}
.wx-guides-v2 li a:hover .wx-g-body em span{transform:translateX(4px)}

/* ===== P34 reviews slider: 2 per view so it slides ===== */
#home-page .hm-rv-track{grid-auto-columns:calc((100% - 16px)/2)}
@media(max-width:760px){#home-page .hm-rv-track{grid-auto-columns:88%}}
"""

def run():
    p = os.path.join(ROOT, "assets", "v1.css"); c = open(p, encoding="utf-8").read()
    if "P34 Start-your-project" not in c: open(p, "a", encoding="utf-8").write(CSS)
    n = 0
    for f, u in pages():
        s = o = open(f, encoding="utf-8").read()
        s = talk(s); s = guides(s); s = footer(s)
        if u == "/contact/": s = re.sub(r'\s*<div class="ct-map-card">[\s\S]*?</div>', "", s, 1)
        if s != o: open(f, "w", encoding="utf-8").write(s); n += 1
    print("changed", n)
if __name__ == "__main__": run()
