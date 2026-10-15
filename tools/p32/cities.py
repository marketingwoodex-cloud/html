#!/usr/bin/env python3
"""P32 C3: unique local content for each city page (areas, conditions, typical work, how it runs).
Facts only: real neighbourhoods/climate; no invented projects, counts, prices or durations."""
import os, re, html
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend-v1")
C = {
 "karachi": dict(areas="DHA Phases 1–8, Clifton, Bahria Town Karachi, Gulshan-e-Iqbal, PECHS, Shahrah-e-Faisal and I.I. Chundrigar Road offices",
   climate="Sea air, humidity and salt are hard on metal, timber and paint. We specify moisture-resistant boards, sealed edges, stainless or powder-coated hardware, and finishes that handle a humid coastal climate.",
   work="Retail and showroom fit-outs, corporate office floors, restaurants and cafes, and apartment and bungalow interiors in DHA and Clifton.",
   faq=[("Do you handle high-rise apartment interiors in Karachi?", "Yes. We plan around building rules, lift access, working hours and material delivery limits set by the building management."),
        ("How do you deal with humidity in Karachi interiors?", "Through material choice and detailing: moisture-resistant boards, sealed joinery edges, corrosion-resistant hardware and good ventilation in kitchens and baths.")]),
 "islamabad": dict(areas="F-6 to F-11, E-7, G-sectors, DHA Islamabad, Bahria Town, Gulberg Greens, B-17 and the Blue Area office district",
   climate="Cold winters, hot summers and a heavy monsoon. Rooms need insulation, warm lighting and heating-ready layouts as well as cooling, plus good waterproofing on roofs and basements.",
   work="Grey structure to turnkey homes, embassy and NGO offices, corporate floors in Blue Area, and hospitality interiors.",
   faq=[("Do you work in both sectors and private societies in Islamabad?", "Yes. We work in CDA sectors and in private societies such as DHA and Bahria Town, following each authority's approval and construction rules."),
        ("Can you finish a grey structure house in Islamabad?", "Yes. We plan finishes, services, joinery and furniture together so the house is completed as one coordinated scope.")]),
 "rawalpindi": dict(areas="Bahria Town Phases 1–8, DHA Phase 1 and 2, Saddar, Satellite Town, Chaklala Scheme III, Gulraiz and Askari housing",
   climate="Hot summers, cold winters and monsoon rain. We plan ventilation, insulation and waterproofing, and choose durable floors for busy family homes.",
   work="Family homes and renovations in Bahria Town and DHA, plus shops, clinics and offices along the main commercial roads.",
   faq=[("Do you combine Rawalpindi and Islamabad site visits?", "Yes. Visits are planned together for the twin cities so each project gets regular, scheduled site time."),
        ("Do you renovate older Rawalpindi houses?", "Yes. We start with a condition survey of wiring, plumbing, damp and structure before design, so the scope reflects the real house.")]),
 "faisalabad": dict(areas="Madina Town, Peoples Colony, Susan Road, Canal Road, Gulberg, Kohinoor City, Eden Valley and Citi Housing",
   climate="Very hot, dusty summers and cool winters. We favour finishes that clean easily, shading and heat-aware glazing, and durable floors such as porcelain and stone.",
   work="Offices and showrooms for textile and trading businesses, retail fit-outs, and owner homes along Canal Road and in the newer societies.",
   faq=[("Do you design showrooms and offices for textile businesses?", "Yes. We plan display, sampling and meeting areas around how buyers visit and how stock is shown."),
        ("Which finishes suit Faisalabad's heat and dust?", "Porcelain or stone floors, washable paints, sealed joinery and good door and window seals keep upkeep low.")]),
 "multan": dict(areas="DHA Multan, Bosan Road, Gulgasht Colony, Wapda Town, Shah Rukn-e-Alam Colony, Buch Villas and Cantt",
   climate="Among the hottest summers in Pakistan. Cooling, shading and insulation lead the design, with light colours, heat-resistant finishes and kitchens that handle high temperatures.",
   work="Family homes in DHA and Bosan Road, offices and banks, clinics, and retail outlets.",
   faq=[("How do you design for Multan's summer heat?", "With shading, insulation, light colours, efficient cooling layouts and finishes that stay stable in high temperatures."),
        ("Do you take on homes in DHA Multan?", "Yes, from interiors for completed houses to coordinated finishing of new builds.")]),
 "peshawar": dict(areas="Hayatabad Phases 1–7, University Town, Saddar, Cantt, DHA Peshawar, Regi Model Town and Warsak Road",
   climate="Hot summers and cold winters with dust. Homes need both heating and cooling plans, durable floors and sturdy joinery for large family use.",
   work="Large family homes in Hayatabad and DHA, shops, offices and clinics built for heavy daily use.",
   faq=[("Do you design for large family homes in Peshawar?", "Yes. We plan family and guest zones, privacy, generous storage and durable finishes for heavy daily use."),
        ("Can you work on shops and clinics in Peshawar?", "Yes. We plan layouts, finishes and services, and coordinate works around opening hours.")]),
 "quetta": dict(areas="Jinnah Town, Samungli Road, Chaman Housing, Shahbaz Town, Cantt, Zarghoon Road and Satellite Town",
   climate="Cold, dry winters with snow at times, and mild summers. Insulation, heating-ready layouts, warm materials and well-sealed windows matter more than in most Pakistani cities.",
   work="Homes and select commercial interiors, planned in clear phases with design and joinery prepared in Lahore.",
   faq=[("How do you design for Quetta's cold winters?", "With insulation, sealed windows, heating-ready layouts and warm materials such as timber and textured fabrics."),
        ("How are Quetta projects managed from Lahore?", "Design, 3D and joinery are prepared in Lahore, and site visits are scheduled around key stages of the work.")]),
 "sialkot": dict(areas="Cantt, Paris Road, Kashmir Road, Defence Road, Citi Housing, DHA Sialkot and the Small Industries Estate",
   climate="Hot, humid summers and a strong monsoon. We use moisture-resistant boards and sealed joinery and plan good ventilation.",
   work="Corporate offices and buyer showrooms for exporters, factory admin blocks, and owner homes.",
   faq=[("Do you design offices and showrooms for Sialkot exporters?", "Yes. We plan reception, sampling, meeting and display areas for international buyers visiting the office."),
        ("Can you do the admin block of a factory?", "Yes. We design offices, meeting rooms and staff areas within or beside industrial buildings.")]),
 "gujranwala": dict(areas="Model Town, Satellite Town, DC Road, Citi Housing, Wapda Town, Peoples Colony and the GT Road commercial belt",
   climate="Hot summers, monsoon humidity and cool winters. We favour durable floors, sealed joinery and kitchens built for heavy family cooking.",
   work="New shops and showrooms on GT Road, family homes in Model Town and Citi Housing, and offices for manufacturing businesses.",
   faq=[("Do you design showrooms on GT Road?", "Yes. We plan frontage, display, lighting and customer flow so the showroom works for walk-in trade."),
        ("Is Gujranwala close enough for regular visits?", "Yes. Gujranwala is near Lahore, so site visits can be planned regularly during the project.")]),
 "hyderabad": dict(areas="Latifabad, Qasimabad, Citizen Colony, Saddar, Defence and the Auto Bhan Road area",
   climate="Very hot summers with humidity and dust. Cooling, shading and easy-clean, moisture-resistant finishes lead the specification.",
   work="Shops, offices and family homes, run in clear phases with design prepared in Lahore.",
   faq=[("How do you manage Hyderabad projects?", "Design, drawings and joinery are prepared in Lahore, and site visits are scheduled for key stages."),
        ("Which materials suit Hyderabad's climate?", "Porcelain or stone floors, moisture-resistant boards, sealed joinery and washable paints.")]),
 "bahawalpur": dict(areas="Model Town A, B and C, Satellite Town, Cantt, Shahdrah, DHA Bahawalpur and the University area",
   climate="Very hot, dry summers and dust from the surrounding desert. Shading, insulation, light colours and sealed, easy-clean finishes come first.",
   work="Homes and select commercial work, planned in phases with design, 3D and joinery prepared in Lahore.",
   faq=[("How do you design homes for Bahawalpur's heat?", "With shading, insulation, light colours, efficient cooling and dust-resistant, easy-clean finishes."),
        ("Do you take on commercial projects in Bahawalpur?", "Yes, selectively, and planned in clear phases with scheduled site visits.")]),
}
CSS = """
/* P32 city local section */
.ct-local-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:36px}
.ct-local-card{background:#fff;border:1px solid rgba(12,22,40,.08);border-radius:18px;padding:26px}
.ct-local-card h3{margin:0 0 10px;font-size:1.12rem;color:#0c1628}
.ct-local-card p{margin:0;color:#5b6472;line-height:1.65;font-size:.96rem}
.ct-local-faq{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.ct-local-faq div{border-top:1px solid rgba(12,22,40,.14);padding-top:18px}
.ct-local-faq h3{margin:0 0 8px;font-size:1.02rem;color:#0c1628}
.ct-local-faq p{margin:0;color:#5b6472;line-height:1.65;font-size:.95rem}
@media(max-width:860px){.ct-local-grid,.ct-local-faq{grid-template-columns:1fr}}
.ct-local-card h3{font-size:1.15rem!important;line-height:1.3!important;letter-spacing:-.01em!important}
.ct-local-faq h3{font-size:1.05rem!important;line-height:1.35!important;letter-spacing:0!important}
"""
def block(city, d):
    n = city.title(); e = html.escape
    cards = [("Areas we cover", f"We take on projects across {d['areas']}, and in other parts of {n} by arrangement."),
             (f"Designing for {n}", d["climate"]), (f"Typical work in {n}", d["work"])]
    c = "".join(f'<div class="ct-local-card"><h3>{e(t)}</h3><p>{e(p)}</p></div>' for t, p in cards)
    q = "".join(f"<div><h3>{e(a)}</h3><p>{e(b)}</p></div>" for a, b in d["faq"])
    return (f'<section class="ct-section" id="city-local"><div class="ct-wrap">\n<header class="ct-center" data-ct-reveal=""><p class="ct-label">Local knowledge</p>'
            f'<h2>Interior design in {n}: what we plan for</h2></header>\n<div class="ct-local-grid">{c}</div>\n<div class="ct-local-faq">{q}</div>\n</div></section>\n')
def run():
    p = os.path.join(ROOT, "assets", "v1.css"); s = open(p, encoding="utf-8").read()
    if ".ct-local-grid" not in s: open(p, "a", encoding="utf-8").write(CSS)
    n = 0
    for city, d in C.items():
        f = os.path.join(ROOT, city, "index.html"); s = open(f, encoding="utf-8").read()
        if 'id="city-local"' in s: continue
        k = '<section class="ct-section" id="city-process">'
        assert k in s, city
        s = s.replace(k, block(city, d) + k, 1)
        # FAQ schema: append the 2 local questions to the existing FAQPage
        add = ",".join('{"@type":"Question","name":%s,"acceptedAnswer":{"@type":"Answer","text":%s}}' % (__import__("json").dumps(a, ensure_ascii=False), __import__("json").dumps(b, ensure_ascii=False)) for a, b in d["faq"])
        s = re.sub(r'("@type":"FAQPage","mainEntity":\[)', r"\1" + add.replace("\\", "\\\\") + ",", s, 1)
        open(f, "w", encoding="utf-8").write(s); n += 1
    print("cities", n)
if __name__ == "__main__": run()
