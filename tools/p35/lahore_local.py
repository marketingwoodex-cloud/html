#!/usr/bin/env python3
"""P35-A: unique local section on /lahore/ (matches P32 city-local blocks). Idempotent."""
import os, re
F = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1", "lahore", "index.html"))
CARDS = [
 ("Areas we cover", "Our studio is at M-71, Zainab Tower, Lahore. We take on projects across DHA Phases 1–9, Bahria Town, Gulberg, Model Town, Johar Town, Cantt, Lake City, Wapda Town, Valencia, State Life and Askari, and in other parts of Lahore by arrangement."),
 ("Designing for Lahore's climate", "Long hot summers, winter smog, dust and a humid monsoon shape every specification. We plan for heat-reflective glazing and curtains, sealed joinery edges, washable paint, finishes that are easy to clean, and ventilation in kitchens and baths."),
 ("Houses we know well", "Most Lahore homes fall between 5 marla and 2 kanal. Each size has its own planning puzzle: storage and light in 5 and 10 marla houses, zoning guests and family in 1 kanal homes, and scale and services in 2 kanal and farmhouse projects."),
 ("Typical work in Lahore", "Complete house interiors and renovations, modular kitchens and wardrobes, corporate offices in Gulberg and on Main Boulevard, restaurants and cafes on MM Alam Road, clinics, salons, showrooms and new house architecture."),
]
FAQS = [
 ("Do you visit sites anywhere in Lahore?", "Yes. After a first call we arrange a site visit to measure, check services and understand the brief, then send a written, itemised quote."),
 ("Do society rules affect interior and renovation work in Lahore?", "They can. Housing societies and commercial buildings often set working hours, material delivery limits and approval steps for structural or facade changes. We plan around them from the start."),
 ("Can I see the design before work starts?", "Yes. Our in-house 3D studio prepares photoreal views so you can approve layouts, materials and lighting before anything is built."),
 ("Do you work on new houses and old houses?", "Both. We design interiors for new builds from grey structure, and plan renovations of older Lahore houses, including services upgrades."),
]
CSS = """<style id="lhr-local-css">.ct-local-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:34px}.ct-local-card{background:#fff;border:1px solid rgba(12,22,40,.08);border-left:3px solid #b8956a;border-radius:16px;padding:24px 26px}.ct-local-card h3{margin:0 0 10px;font-size:1.08rem}.ct-local-card p{margin:0;color:#555;line-height:1.65}.ct-local-faq{display:grid;grid-template-columns:repeat(2,1fr);gap:18px 34px;margin-top:34px}.ct-local-faq h3{font-size:1rem;margin:0 0 8px}.ct-local-faq p{margin:0;color:#555;line-height:1.6}@media(max-width:760px){.ct-local-grid,.ct-local-faq{grid-template-columns:1fr}}</style>"""
s = open(F, encoding="utf-8").read()
s = re.sub(r'<section class="ct-section" id="city-local">[\s\S]*?</section>\n?', "", s)
sec = ('<section class="ct-section" id="city-local"><div class="ct-wrap">\n<header class="ct-center" data-ct-reveal=""><p class="ct-label">Local knowledge</p><h2>Interior design in Lahore: what we plan for</h2>'
       '<p>Lahore is our home city. Most of our work happens here, so our planning reflects its houses, climate, societies and commercial districts.</p></header>\n'
       '<div class="ct-local-grid">' + "".join('<div class="ct-local-card"><h3>%s</h3><p>%s</p></div>' % c for c in CARDS) + '</div>\n'
       '<div class="ct-local-faq">' + "".join("<div><h3>%s</h3><p>%s</p></div>" % q for q in FAQS) + '</div>\n</div></section>\n')
i = s.index('<section class="ct-section" id="city-process">')
s = s[:i] + sec + s[i:]
if 'id="lhr-local-css"' not in s and ".ct-local-grid{" not in s: s = s.replace("</head>", CSS + "\n</head>", 1)
open(F, "w", encoding="utf-8").write(s); print("lahore local section ok")
