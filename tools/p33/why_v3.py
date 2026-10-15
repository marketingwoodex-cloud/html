#!/usr/bin/env python3
"""P33: Why Woodex v3 (3 points: 200+ spaces, in-house 3D, clear programme; image badge)
+ remove every 'own furniture workshop' claim. Idempotent."""
import os, re, glob
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend-v1")
IC = {
 "spaces": '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
 "3d": '<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
 "prog": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3M8 17h6"/>',
}
def ic(k): return f'<span class="wx-ti" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{IC[k]}</svg></span>'
LIST = ("<ul class=\"wx-trust-list\">"
 f"\n    <li>{ic('spaces')}<strong>200+ completed spaces</strong><span>Homes, offices, retail and hospitality delivered across Pakistan since 2016.</span></li>"
 f"\n    <li>{ic('3d')}<strong>In-house 3D studio</strong><span>Photoreal 4K views with 2 revision rounds, so you approve the space before work begins.</span></li>"
 f"\n    <li>{ic('prog')}<strong>Clear programme</strong><span>Quantities, phasing and handover dates agreed up front, with one team accountable.</span></li>"
 "\n  </ul>")
BADGE = '<div class="wx-trust-badge"><b>200+</b><span>completed spaces<br>since 2016</span></div>'
TXT = [
 ("Joinery from our workshop", "Joinery and furniture"), ("Counters, storage and furniture made to the drawing.", "Counters, storage and furniture detailed and made to the drawing."),
 ("Made in our workshop", "Detailed to the drawing"), ("Cabinetry built to the drawing and installed by our team.", "Cabinetry detailed, made and installed to the approved drawing."),
 ("Joinery and furniture made in our own workshop.", "Joinery and furniture designed to fit the room."),
 ("made in our own workshop and fitted", "made to the drawing and fitted"), ("from our own workshop", "made to the drawing"),
 ("Site trades and our furniture workshop deliver", "Site trades and joinery teams deliver"),
 ("Custom furniture</strong><span>Joinery and furniture made in our own workshop.", "Custom furniture</strong><span>Joinery and furniture designed to fit the room."),
]
CSS = r"""
/* ===== P33 Why Woodex v3 ===== */
.wx-trust{background:#f4efe7}
.wx-trust .wx-trust-v3 .wx-kicker{background:none!important;color:#8a6a43!important;padding:0!important;font-size:.76rem;letter-spacing:.16em;font-weight:600;display:flex;align-items:center;gap:10px}
.wx-trust .wx-trust-v3 .wx-kicker:before{content:"";width:28px;height:1px;background:#b8956a}
.wx-trust-v3 .wx-trust-tall{position:relative}
.wx-trust-badge{position:absolute;left:18px;bottom:18px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-radius:16px;padding:12px 16px;box-shadow:0 16px 36px -18px rgba(12,22,40,.45)}
.wx-trust-badge b{font-size:1.9rem;line-height:1;color:#0c1628;letter-spacing:-.03em}
.wx-trust-badge span{font-size:.78rem;line-height:1.35;color:#5b6472}
.wx-trust-v3 .wx-trust-list{display:flex;flex-direction:column;gap:12px}
.wx-trust-v3 .wx-trust-list li,.wx-trust-v3 .wx-trust-list li:first-child,.wx-trust-v3 .wx-trust-list li:first-child+li{background:#fff;border:1px solid rgba(12,22,40,.07);border-radius:18px;padding:22px 22px 20px;box-shadow:none;transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s,border-color .35s}
.wx-trust-v3 .wx-trust-list li:hover{transform:translateY(-4px)!important;box-shadow:0 22px 40px -26px rgba(12,22,40,.45);border-color:rgba(184,149,106,.5)}
.wx-trust-v3 .wx-ti{width:44px;height:44px;border-radius:12px;background:#f4efe7;color:#8a6a43;display:grid;place-items:center;margin-bottom:14px}
.wx-trust-v3 .wx-ti svg{width:22px;height:22px}
.wx-trust-v3 .wx-trust-list strong{font-size:1.12rem}
.wx-trust-v3 .wx-trust-list span{font-size:.93rem}
.wx-trust-v3 .wx-trust-tall{min-height:520px}
@media(max-width:1080px){.wx-trust-v3 .wx-trust-list{display:grid;grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.wx-trust-v3 .wx-trust-list{grid-template-columns:1fr}.wx-trust-v3 .wx-trust-tall{min-height:0}}
"""
def run():
    p = os.path.join(ROOT, "assets", "v1.css"); c = open(p, encoding="utf-8").read()
    if "P33 Why Woodex v3" not in c: open(p, "a", encoding="utf-8").write(CSS)
    nt = nx = 0
    for f in glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(("admin", "api", "builder", "_", "assets")): continue
        s = o = open(f, encoding="utf-8").read()
        m = re.search(r'<section class="wx-trust"[\s\S]*?</section>', s)
        if m and "wx-trust-v3" not in m.group(0):
            b = m.group(0).replace("wx-trust-v2\">", "wx-trust-v2 wx-trust-v3\">", 1)
            b = re.sub(r'<ul class="wx-trust-list">[\s\S]*?</ul>', LIST, b, 1)
            b = re.sub(r'(<figure class="wx-trust-tall">[\s\S]*?)(</figure>)', lambda k: k.group(1) + BADGE + k.group(2), b, 1)
            s = s.replace(m.group(0), b); nt += 1
        for a, z in TXT: s = s.replace(a, z)
        s = re.sub(r"own furniture workshop", "in-house design team", s, flags=re.I)
        if s != o: open(f, "w", encoding="utf-8").write(s); nx += 1
    print("why v3", nt, "files", nx)
if __name__ == "__main__": run()
