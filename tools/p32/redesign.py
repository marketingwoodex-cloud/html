#!/usr/bin/env python3
"""P32: (1) Why Woodex block v2 (Screenshot_11 layout) with page-matched images,
(2) replace PKR pricing sections with a bento 'What's included' features block (image-1 style).
Idempotent: skips pages already converted."""
import os, re, glob, html
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
ROOT = os.path.join(REPO, "frontend-v1"); IMG = os.path.join(ROOT, "assets", "img")

def imgs(s):
    m = re.search(r"<main[\s\S]*?</main>", s); m = m.group(0) if m else s
    out = []
    for i in re.findall(r'src="/assets/img/((?:img|ins)-[a-z0-9]+)\.webp"', m):
        if i not in out and os.path.exists(os.path.join(IMG, i + "-960.webp")): out.append(i)
    return out
def pic(i, alt, cls, sizes):
    return (f'<figure class="{cls}"><img src="/assets/img/{i}-960.webp" srcset="/assets/img/{i}-480.webp 480w, /assets/img/{i}-960.webp 960w" '
            f'sizes="{sizes}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async" width="960" height="1200"></figure>')
def alt_of(s, i):
    m = re.search(rf'src="/assets/img/{i}[^"]*"[^>]*alt="([^"]*)"', s) or re.search(rf'alt="([^"]*)"[^>]*src="/assets/img/{i}', s)
    return html.unescape(m.group(1)) if m and m.group(1) else "Woodex Interior project"

ICON = {
 "spaces": '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
 "3d": '<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
 "workshop": '<path d="M4 20h16M6 20V10h12v10M9 10V6h6v4"/><path d="M10 14h4"/>',
 "programme": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3"/>',
}
def ic(k): return f'<span class="wx-ti" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ICON[k]}</svg></span>'
ARROW = '<span class="wx-arr" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg></span>'

TRUST_RX = re.compile(r'<section class="wx-trust"[\s\S]*?</section>')
def trust_v2(s):
    old = TRUST_RX.search(s).group(0)
    if "wx-trust-v2" in old: return None
    g = lambda rx, d: (re.search(rx, old).group(1) if re.search(rx, old) else d)
    h2 = g(r"<h2[^>]*>([\s\S]*?)</h2>", "One accountable team from brief to handover")
    p = g(r"</h2>\s*<p>([\s\S]*?)</p>", "Architecture, interiors, fit-out, renovation, 3D and custom furniture, all from one Lahore studio since 2016.")
    items = re.findall(r"<li><strong>([\s\S]*?)</strong><span>([\s\S]*?)</span></li>", old)
    keys = ["spaces", "3d", "workshop", "programme"]
    im = imgs(s)
    a, b = (im[1], im[2]) if len(im) >= 3 else ((im + ["img-774a712057fc", "img-81b231a6c390"])[:2])
    li = "".join(f"\n    <li>{ic(keys[n % 4])}<strong>{t}</strong><span>{d}</span></li>" for n, (t, d) in enumerate(items))
    new = (f'<section class="wx-trust" aria-labelledby="wx-trust-title"><div class="wrap wx-trust-grid wx-trust-v2">\n'
           f'  <div class="wx-trust-copy"><p class="wx-kicker">Why Woodex</p><h2 id="wx-trust-title">{h2}</h2><p>{p}</p>\n'
           f'    <div class="wx-actions"><a class="btn wx-btn-dark" href="/contact/">Start your project</a></div>\n'
           f'    {pic(b, alt_of(s, b), "wx-trust-sm", "(max-width: 900px) 100vw, 22vw")}</div>\n'
           f'  {pic(a, alt_of(s, a), "wx-trust-tall", "(max-width: 900px) 100vw, 36vw")}\n'
           f'  <ul class="wx-trust-list">{li}\n  </ul>\n</div></section>')
    return s.replace(old, new, 1)

# ---------- features bento ----------
FEAT = {
 "arch": ("Architecture", [("Concept and massing", "Site, sun, setbacks and the brief turned into a clear first scheme."), ("Planning drawings", "Plans, sections and elevations ready for review and approvals."),
          ("3D exterior views", "See the facade and spaces in photoreal detail before you build."), ("Structure and services", "Structural and MEP coordination built into the drawings."), ("Construction set", "Working drawings and specifications the site can follow.")]),
 "fit": ("Fit-out", [("Survey and measured drawings", "We start from the real site, not assumptions."), ("Design and 3D", "Layouts, finishes and views approved before work starts."),
         ("MEP coordination", "Electrical, HVAC, plumbing and data planned with the layout."), ("Joinery and furniture", "Counters, storage and furniture detailed and made to the drawing."), ("Phased handover", "Clear programme, snag list and a clean handover.")]),
 "reno": ("Renovation", [("Condition survey", "What stays, what goes and what is hidden behind the walls."), ("Scope and phasing", "A frozen scope and a sequence that suits how you live or trade."),
          ("Design and 3D", "See the finished space before demolition begins."), ("Services upgrade", "Wiring, plumbing and drainage brought up to date."), ("Clean handover", "Snag list closed and the space ready to use.")]),
 "room": ("Interior design", [("Space planning", "Layouts that fit how you actually use the room."), ("3D visualization", "Photoreal views with revision rounds before you commit."),
          ("Materials and finishes", "A coordinated board of colours, surfaces and fabrics."), ("Lighting plan", "Ambient, task and accent light planned with the furniture."), ("Custom furniture", "Joinery and furniture designed to fit the room.")]),
 "kitchen": ("Kitchen design", [("Layout and workflow", "Sink, hob and storage placed for how you cook."), ("Cabinets and hardware", "Board, shutters, hinges and runners specified clearly."),
             ("Counters and finishes", "Surfaces chosen for heat, stains and daily cleaning."), ("3D views", "See the kitchen from every angle before it is made."), ("Detailed to the drawing", "Cabinetry detailed, made and installed to the approved drawing.")]),
 "3d": ("3D visualization", [("Photoreal stills", "4K renders of interiors and exteriors."), ("Walkthroughs", "Move through the space before it exists."),
        ("360 views", "Look around every room on phone or desktop."), ("2 revision rounds", "Refine materials, light and layout with us."), ("Material studies", "Compare finishes side by side before you choose.")]),
}
POOL = {
 "kitchen": ["img-27ed3ac85189", "ins-kitchenlayout", "img-f655d51401e8", "ins-materials", "ins-lighting"],
 "3d": ["img-a824b3688cd4", "img-27c481fa9a3d", "img-774a712057fc", "img-81b231a6c390", "ins-lighting"],
 "arch": ["ins-architect", "img-dce06249b137", "img-af83a84f72d2", "img-1d6ad6c77d0f", "ins-materials"],
 "reno": ["ins-renovation", "img-1f4b4ef86cb5", "ins-materials", "img-c349a92a4ae0", "ins-ceiling"],
 "fit": ["img-5048d9095862", "img-42bae79b5c89", "ins-ceiling", "img-f655d51401e8", "ins-lighting"],
 "room": ["img-774a712057fc", "img-81b231a6c390", "ins-lighting", "ins-materials", "ins-wardrobe", "img-27c481fa9a3d", "img-c349a92a4ae0"],
}
def cat(slug):
    if "kitchen" in slug: return "kitchen"
    if slug.startswith("3d"): return "3d"
    if re.search(r"marla|kanal|farmhouse|elevation|architecture|master-planning|buildings|building-design", slug): return "arch"
    if re.search(r"renovation|refurb", slug): return "reno"
    if re.search(r"fit-out|turnkey", slug): return "fit"
    return "room"
PRICE_RX = re.compile(r'<section\b[^>]*\bid="([a-z0-9-]*(?:pricing|-fees|fitout-cost)[a-z0-9-]*)"[^>]*>[\s\S]*?</section>')

def feat_block(s, sid, slug):
    name, items = FEAT[cat(slug)]
    title = re.sub(r"\s*\|.*$", "", html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1))).strip()
    svc = re.sub(r"\s+(?:in\s+)?(?:Lahore|Pakistan)\b.*$", "", title).strip() or name
    im = []
    for i in imgs(s) + POOL[cat(slug)] + POOL["room"]:
        if i not in im and os.path.exists(os.path.join(IMG, i + "-960.webp")): im.append(i)
    im = im[:5]
    cards = ""
    for n, ((t, d), i) in enumerate(zip(items, im)):
        big = " wx-feat-big" if n == 0 else ""
        cards += (f'\n    <li class="wx-feat-card{big}"><img src="/assets/img/{i}-960.webp" srcset="/assets/img/{i}-480.webp 480w, /assets/img/{i}-960.webp 960w" '
                  f'sizes="(max-width: 760px) 100vw, {"40vw" if big else "24vw"}" alt="{html.escape(t + " – " + svc, quote=True)}" loading="lazy" decoding="async" width="960" height="720">'
                  f'<div class="wx-feat-txt"><small>{n+1:02d}</small><strong>{t}</strong><span>{d}</span></div></li>')
    return (f'<section class="wx-feat" id="{sid}" aria-labelledby="{sid}-h"><div class="wrap">\n'
            f'  <div class="wx-feat-head"><div><p class="wx-kicker">What\'s included</p><h2 id="{sid}-h">What you get with {html.escape(svc)}</h2></div>'
            f'<p>Every project is scoped after a site visit or brief, then quoted in writing so you know exactly what is included. <a href="/book-a-visit/">Book a visit</a></p></div>\n'
            f'  <ul class="wx-feat-grid">{cards}\n  </ul>\n</div></section>')

CSS = r"""
/* ===== P32 Why Woodex v2 (split: copy+small image · tall image · icon list) ===== */
.wx-trust-v2.wx-trust-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr);gap:clamp(24px,3vw,44px);align-items:start}
.wx-trust-v2 .wx-trust-copy{display:flex;flex-direction:column;height:100%}
.wx-trust-v2 .wx-trust-copy h2{font-size:clamp(1.7rem,2.4vw,2.2rem)!important;line-height:1.12!important;letter-spacing:-.025em;margin:10px 0 14px}
.wx-trust-v2 .wx-trust-copy>p{margin:0 0 24px;max-width:38ch}
.wx-trust-v2 .wx-btn-arr{display:inline-flex;align-items:center;gap:12px;padding-right:8px;border-radius:999px}
.wx-trust-v2 .wx-arr{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;color:#0c1628;transition:transform .3s}
.wx-trust-v2 .wx-arr svg{width:14px;height:14px}
.wx-trust-v2 .wx-btn-arr:hover .wx-arr{transform:rotate(45deg)}
.wx-trust-v2 figure{margin:0;overflow:hidden;border-radius:22px;background:#e9e1d4}
.wx-trust-v2 figure img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 1.2s cubic-bezier(.22,1,.36,1)}
.wx-trust-v2 figure:hover img{transform:scale(1.04)}
.wx-trust-v2 .wx-trust-sm{margin-top:auto;aspect-ratio:4/3.2;width:82%;align-self:flex-end;margin-left:auto}
.wx-trust-v2 .wx-trust-copy .wx-actions{margin-bottom:40px}
.wx-trust-v2 .wx-trust-tall{align-self:stretch;min-height:460px;width:100%}
.wx-trust-v2 .wx-trust-list{grid-template-columns:1fr;gap:0;counter-reset:none}
.wx-trust-v2 .wx-trust-list li{counter-increment:none;background:transparent;border:0;border-top:1px solid rgba(12,22,40,.12);border-radius:0;padding:24px 22px;gap:6px;transform:none!important;box-shadow:none;animation:none}
.wx-trust-v2 .wx-trust-list li:first-child{background:#fff;border:0;border-radius:20px;box-shadow:0 18px 40px -28px rgba(12,22,40,.35)}
.wx-trust-v2 .wx-trust-list li:first-child+li{border-top:0}
.wx-trust-v2 .wx-trust-list li:before,.wx-trust-v2 .wx-trust-list li:after{display:none}
.wx-trust-v2 .wx-trust-list li:hover{background:#fff;border-radius:20px;border-top-color:transparent;transform:none}
.wx-trust-v2 .wx-trust-list li:hover strong{color:#0c1628}.wx-trust-v2 .wx-trust-list li:hover span{color:#5b6472}
.wx-trust-v2 .wx-ti{display:block;width:30px;height:30px;color:#0c1628;margin-bottom:12px}
.wx-trust-v2 .wx-ti svg{width:100%;height:100%}
.wx-trust-v2 .wx-trust-list strong{font-size:1.2rem;letter-spacing:-.01em}
@media(max-width:1080px){.wx-trust-v2.wx-trust-grid{grid-template-columns:1fr 1fr}.wx-trust-v2 .wx-trust-list{grid-column:1/-1;grid-template-columns:1fr 1fr}.wx-trust-v2 .wx-trust-list li{border-top:0}}
@media(max-width:700px){.wx-trust-v2.wx-trust-grid{grid-template-columns:1fr}.wx-trust-v2 .wx-trust-sm{display:none}.wx-trust-v2 .wx-trust-tall{min-height:0;aspect-ratio:4/3}.wx-trust-v2 .wx-trust-list{grid-template-columns:1fr}.wx-trust-v2 .wx-trust-copy .wx-actions{margin-bottom:0}}

/* ===== P32 What's included (bento: 1 large + 4) ===== */
.wx-feat{background:#f4efe7;padding:clamp(64px,8vw,104px) 0}
.wx-feat .wrap{width:min(1180px,calc(100% - 40px));margin:0 auto}
.wx-feat-head{display:grid;grid-template-columns:1.1fr 1fr;gap:32px;align-items:end;margin-bottom:32px}
.wx-feat-head .wx-kicker{color:#8a6a43;margin:0 0 10px}
.wx-feat-head h2{margin:0;font-size:clamp(1.9rem,3.4vw,2.8rem);line-height:1.08;letter-spacing:-.03em;color:#0c1628}
.wx-feat-head p{margin:0;color:#5b6472;line-height:1.7}
.wx-feat-head p a{color:#0c1628;font-weight:600;text-underline-offset:3px}
.wx-feat-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1.4fr 1fr 1fr;grid-template-rows:repeat(2,minmax(220px,1fr));gap:14px}
.wx-feat-card{position:relative;overflow:hidden;border-radius:18px;background:#0c1628;min-height:220px;isolation:isolate}
.wx-feat-big{grid-row:span 2}
.wx-feat-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform 1.2s cubic-bezier(.22,1,.36,1)}
.wx-feat-card:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(12,22,40,.05) 30%,rgba(12,22,40,.78) 100%)}
.wx-feat-card:hover img{transform:scale(1.05)}
.wx-feat-txt{position:absolute;left:0;right:0;bottom:0;padding:18px 18px 16px;color:#fff}
.wx-feat-txt small{display:block;font-size:.7rem;letter-spacing:.14em;opacity:.8;margin-bottom:4px}
.wx-feat-txt strong{display:block;font-size:1.12rem;line-height:1.25}
.wx-feat-txt span{display:block;font-size:.88rem;line-height:1.5;color:rgba(255,255,255,.82);max-height:0;opacity:0;overflow:hidden;transition:max-height .45s,opacity .45s,margin .45s}
.wx-feat-card:hover .wx-feat-txt span,.wx-feat-card:focus-within .wx-feat-txt span,.wx-feat-big .wx-feat-txt span{max-height:80px;opacity:1;margin-top:6px}
.wx-feat-big .wx-feat-txt{padding:26px}.wx-feat-big .wx-feat-txt strong{font-size:1.4rem}
@media(hover:none){.wx-feat-txt span{max-height:80px;opacity:1;margin-top:6px}}
@media(max-width:860px){.wx-feat-head{grid-template-columns:1fr}.wx-feat-grid{grid-template-columns:1fr 1fr;grid-template-rows:none}.wx-feat-big{grid-column:1/-1;grid-row:auto;min-height:300px}}
@media(max-width:520px){.wx-feat-grid{grid-template-columns:1fr}}
main .wx-feat-grid li,main .wx-guides li{padding-left:0}
main .wx-feat-grid li:before,main .wx-guides li:before{display:none}
"""

def run():
    css_p = os.path.join(ROOT, "assets", "v1.css"); c = open(css_p, encoding="utf-8").read()
    if "P32 Why Woodex v2" not in c: open(css_p, "a", encoding="utf-8").write(CSS)
    nt = nf = 0; anchors = []
    for f in sorted(glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace("\\", "/")
        if rel.startswith(("admin/", "api/", "builder/", "_", "assets/", "insights/")): continue
        s = o = open(f, encoding="utf-8").read(); slug = rel[:-11] if rel != "index.html" else ""
        if TRUST_RX.search(s):
            r = trust_v2(s)
            if r: s = r; nt += 1
        for m in list(PRICE_RX.finditer(s)):
            sid = m.group(1)
            if 'class="wx-feat"' in m.group(0): continue
            s = s.replace(m.group(0), feat_block(s, sid, slug), 1); nf += 1; anchors.append(sid)
            s = re.sub(rf'(<a[^>]*href="#{sid}"[^>]*>)\s*(?:Pricing|Fees|Cost|Prices)\s*(</a>)', r"\1What's included\2", s)
        if s != o: open(f, "w", encoding="utf-8").write(s)
    print("trust", nt, "features", nf)

if __name__ == "__main__": run()
