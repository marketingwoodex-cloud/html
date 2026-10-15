#!/usr/bin/env python3
"""P35-C: 8 Lahore area pages at /lahore/<area>/ built on the /lahore/ city template (ct- styles).
Rules: no prices, no 'free', no fixed timelines, no own-workshop claims. Idempotent.
Run: python3 tools/p35/areas.py"""
import os, re, html, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1"))
TPL = os.path.join(ROOT, "lahore", "index.html")
SITE = "https://woodex.com.pk"
E = lambda s: html.escape(str(s), quote=False)
A = lambda s: html.escape(str(s), quote=True)
SV = {"interior": ("Interior design", "/interior-design/"), "kitchen": ("Kitchen design", "/kitchen-design/"), "wardrobe": ("Wardrobe design", "/wardrobe-design/"),
      "reno": ("House renovation", "/residential-renovation/"), "arch": ("Architecture", "/architecture/"), "elev": ("Front elevation", "/front-elevation-design/"),
      "office": ("Office interior design", "/office-interior-design/"), "fit": ("Office fit-out", "/office-fit-out/"), "retail": ("Retail design", "/retail-design/"),
      "rest": ("Restaurant interior design", "/restaurant-interior-design/"), "turnkey": ("Turnkey design and build", "/turnkey-design-build/"),
      "apt": ("Apartment interior design", "/apartment-interior-design/"), "3d": ("3D visualization", "/3d-visualization/"), "ceiling": ("False ceiling design", "/false-ceiling-design/"),
      "bath": ("Bathroom design", "/bathroom-design/"), "kreno": ("Kitchen renovation", "/kitchen-renovation/"), "farm": ("Farmhouse design", "/farmhouse-design/"),
      "complete": ("Complete home redesign", "/complete-home-redesign/"), "dress": ("Dressing room design", "/dressing-room-design/")}
SVD = {"interior": "Room-by-room design with layouts, materials and lighting.", "kitchen": "Modular kitchens planned around desi cooking and storage.",
       "wardrobe": "Built-in wardrobes drawn to the exact wall.", "reno": "Older houses upgraded, including services.", "arch": "New house plans designed with the interior in mind.",
       "elev": "Facades that suit the plot, the street and the climate.", "office": "Workplaces planned for teams, clients and growth.", "fit": "Office floors taken from shell to handover.",
       "retail": "Stores and showrooms planned for flow and brand.", "rest": "Restaurants and cafes designed for service and atmosphere.",
       "turnkey": "One team from design to a finished, furnished home.", "apt": "Space planning and storage for flats and towers.", "3d": "Photoreal views before anything is built.",
       "ceiling": "Ceilings that carry the lighting and hide the services.", "bath": "Layouts, waterproofing and fittings planned together.",
       "kreno": "Old kitchens re-planned with new services.", "farm": "Farmhouses and weekend homes designed for space and entertaining.",
       "complete": "Whole-house redesign with phased planning.", "dress": "Walk-in closets and dressing areas."}
ALL = [("dha", "DHA"), ("bahria-town", "Bahria Town"), ("gulberg", "Gulberg"), ("johar-town", "Johar Town"), ("model-town", "Model Town"), ("cantt", "Cantt"), ("lake-city", "Lake City"), ("wapda-town", "Wapda Town")]

AREAS = [
{"slug": "dha", "name": "DHA", "full": "DHA Lahore",
 "title": "Interior Design in DHA Lahore | Woodex Interior", "desc": "Interior design in DHA Lahore for kanal houses, new builds and renovations across all phases: layouts, kitchens, wardrobes and 3D views by Woodex.",
 "kw": ["interior design dha lahore", "interior designer dha", "house interior dha lahore", "dha lahore home design"],
 "note": "DHA is where many of our residential projects happen, from new kanal houses in the newer phases to renovations of older homes in Phases 1 to 5. We plan the interior early, so wiring, ceilings and joinery fit the design.",
 "short": "Interior design in DHA Lahore by Woodex Interior: design and build for kanal and marla houses, new builds and renovations across DHA phases, with photoreal 3D before work starts.",
 "services": ["interior", "turnkey", "kitchen", "arch", "reno"],
 "local": [("Homes in DHA", "Most DHA homes are 10 marla, 1 kanal or 2 kanal houses, many of them double-storey with a basement. Larger plots mean more rooms to coordinate, so one design for the whole house keeps materials and lighting consistent."),
           ("New builds and grey structure", "Many DHA clients come to us while the house is still in grey structure. That is the best time to fix lighting points, sockets, plumbing and joinery positions before plaster."),
           ("Society rules", "DHA sets rules for construction, working hours and changes to the structure or facade. We plan work around the society's requirements and the approvals your project needs."),
           ("What we plan for", "Formal drawing and dining rooms, family lounges, modular kitchens with a separate dirty kitchen, master suites with dressing rooms, basements and home offices.")],
 "faq": [("Do you work in all DHA Lahore phases?", "Yes. We take on projects across DHA Lahore, from the older phases to the newest ones."),
         ("Can you design the interior while the house is under construction?", "Yes, and it is the best time. We fix electrical, plumbing and joinery positions before plaster and ceilings."),
         ("Do you handle complete houses?", "Yes. We can design one room or the full house, and coordinate the build through to handover."),
         ("How do I start?", "Call or WhatsApp +92 322 4000768 with your plan or photos. We arrange a site visit and send a written, itemised quote.")]},
{"slug": "bahria-town", "name": "Bahria Town", "full": "Bahria Town Lahore",
 "title": "Interior Design in Bahria Town Lahore | Woodex", "desc": "Interior design in Bahria Town Lahore for houses and villas: layouts, kitchens, wardrobes, ceilings, renovations and 3D views, by the Woodex Lahore studio.",
 "kw": ["interior design bahria town lahore", "bahria town house interior", "interior designer bahria town", "villa interior lahore"],
 "note": "Bahria Town has a wide mix of homes, from 5 marla houses to large villas. Many are newer builds that owners want to personalise, so our work often starts with a builder-finished house and turns it into a home that fits the family.",
 "short": "Interior design in Bahria Town Lahore by Woodex Interior: houses and villas personalised with new layouts, kitchens, wardrobes, ceilings and lighting, shown in 3D before work starts.",
 "services": ["interior", "kitchen", "wardrobe", "ceiling", "complete"],
 "local": [("Homes in Bahria Town", "Houses range from compact 5 and 8 marla homes to 1 kanal houses and villas. Compact homes need storage and light; larger ones need zoning between guests and family."),
           ("Upgrading builder finishes", "Many Bahria Town homes come with standard finishes. We plan upgrades that add the most: kitchens, wardrobes, ceilings with layered lighting, and feature walls."),
           ("Society rules", "Bahria Town has its own rules for working hours, material delivery and exterior changes. We plan the work around them."),
           ("What we plan for", "Open lounges, modular kitchens, master bedrooms with built-in wardrobes, children's rooms that grow with them, and home offices.")],
 "faq": [("Do you work in all Bahria Town sectors?", "Yes. We take on projects across Bahria Town Lahore and nearby communities."),
         ("Can you improve a builder-finished house without major demolition?", "Often yes. Kitchens, wardrobes, ceilings, lighting and finishes can be upgraded with limited disruption."),
         ("Do you design villas?", "Yes, including formal areas, family spaces, kitchens and outdoor seating."),
         ("How do I start?", "Send your plan or photos by WhatsApp to +92 322 4000768. We arrange a visit and send a written, itemised quote.")]},
{"slug": "gulberg", "name": "Gulberg", "full": "Gulberg Lahore",
 "title": "Interior Design in Gulberg Lahore | Offices & Homes | Woodex", "desc": "Interior design in Gulberg Lahore for offices, restaurants, retail and homes: workplace planning, fit-out, commercial interiors and 3D views by Woodex.",
 "kw": ["interior design gulberg lahore", "office interior gulberg", "commercial interior gulberg", "restaurant interior mm alam road"],
 "note": "Gulberg is Lahore's main business and dining district. Most of our work here is commercial: office floors in plazas and towers, restaurants and cafes along MM Alam Road, and retail on Main Boulevard, alongside renovations of older Gulberg houses.",
 "short": "Interior design in Gulberg Lahore by Woodex Interior: offices, restaurants, cafes, retail and homes, planned around building rules and delivered by one accountable team.",
 "services": ["office", "fit", "rest", "retail", "reno"],
 "local": [("Offices in plazas and towers", "Office floors in Gulberg share lifts, services and rules. We read the building handbook first and plan layouts, acoustics and services around it."),
           ("Restaurants and cafes", "MM Alam Road and its surroundings are among Lahore's busiest dining streets. Kitchen exhaust, services and seating flow matter as much as the look."),
           ("Retail and showrooms", "Main Boulevard and nearby streets carry retail and showrooms where facade, lighting and customer flow drive results."),
           ("Older Gulberg houses", "Gulberg's established houses often need services upgrades along with new interiors. We plan both together.")],
 "faq": [("Do you handle office fit-outs in Gulberg towers?", "Yes. We plan around building management rules, working hours and shared services."),
         ("Can work be done after office hours?", "Yes, where the building requires it. We plan the programme around the rules."),
         ("Do you design restaurants on MM Alam Road?", "Yes. We design restaurants and cafes across Gulberg, including kitchen and service planning."),
         ("How do I start?", "Call or WhatsApp +92 322 4000768. We review the space, then send a written, itemised quote.")]},
{"slug": "johar-town", "name": "Johar Town", "full": "Johar Town Lahore",
 "title": "Interior Design in Johar Town Lahore | Woodex Interior", "desc": "Interior design in Johar Town Lahore for 5 marla to 1 kanal houses, apartments and offices: layouts, kitchens, storage, renovations and 3D by Woodex.",
 "kw": ["interior design johar town", "johar town house interior", "interior designer johar town lahore", "10 marla interior johar town"],
 "note": "Johar Town is one of Lahore's largest residential areas, with family houses, apartments and a growing commercial strip. Our work here is mostly 5 to 10 marla and 1 kanal homes, kitchens, renovations and small offices.",
 "short": "Interior design in Johar Town Lahore by Woodex Interior: family houses, apartments and offices with practical layouts, kitchens, storage and lighting, shown in 3D before work starts.",
 "services": ["interior", "kitchen", "reno", "apt", "office"],
 "local": [("Homes in Johar Town", "Most homes are 5, 10 marla or 1 kanal family houses. Storage, light and flexible rooms make the biggest difference."),
           ("Renovations", "Many Johar Town houses are now ten to twenty years old and ready for new kitchens, bathrooms, wiring and finishes. We plan these upgrades so families can stay in the house."),
           ("Apartments and offices", "Newer apartment buildings and offices along the main roads need compact planning and work around building rules."),
           ("What we plan for", "Family lounges, modular kitchens, bedrooms with built-in wardrobes, study rooms and small home offices.")],
 "faq": [("Do you design 5 marla houses in Johar Town?", "Yes. Compact houses benefit most from planned storage and layered lighting."),
         ("Can you renovate while we live in the house?", "Usually yes. We phase the work room by room."),
         ("Do you design offices in Johar Town?", "Yes, including small offices, clinics and showrooms."),
         ("How do I start?", "Send your plan or photos by WhatsApp to +92 322 4000768. We arrange a visit and send a written, itemised quote.")]},
{"slug": "model-town", "name": "Model Town", "full": "Model Town Lahore",
 "title": "Interior Design in Model Town Lahore | Woodex Interior", "desc": "Interior design in Model Town Lahore: renovation and redesign of established homes, new builds, kitchens and offices, from our studio on Model Town Link Road.",
 "kw": ["interior design model town lahore", "model town house renovation", "interior designer model town", "home renovation model town lahore"],
 "note": "Our studio is on Model Town Link Road, so Model Town is our neighbourhood. Its large, established plots and older houses lead to a lot of renovation and redesign work, as well as new houses replacing old ones.",
 "short": "Interior design in Model Town Lahore by Woodex Interior, based on Model Town Link Road: renovations of established homes, new builds, kitchens and offices.",
 "services": ["reno", "complete", "interior", "arch", "kreno"],
 "local": [("Our neighbourhood", "Woodex Interior is at M-71, Zainab Tower, Model Town Link Road. Model Town clients can visit the studio easily and site visits are quick to arrange."),
           ("Established homes", "Model Town is one of Lahore's oldest planned areas, with large plots and mature trees. Older houses often need new wiring, plumbing and waterproofing along with the interior."),
           ("Rebuilds and new houses", "Where an old house is replaced, we design the new house and its interior together."),
           ("What we plan for", "Whole-house renovations, new kitchens and bathrooms, formal rooms updated for modern living, and garden-facing family spaces.")],
 "faq": [("Where is your studio?", "M-71, Zainab Tower, Model Town Link Road, Lahore. Open Monday to Saturday, 9:30 to 6:30."),
         ("Do you renovate old houses in Model Town?", "Yes. We plan services upgrades together with the new interior."),
         ("Can you design a new house on an old plot?", "Yes. Our architecture and interior teams design the house and interior together."),
         ("How do I start?", "Call or WhatsApp +92 322 4000768, or visit the studio. We arrange a site visit and send a written, itemised quote.")]},
{"slug": "cantt", "name": "Cantt", "full": "Lahore Cantt",
 "title": "Interior Design in Lahore Cantt | Woodex Interior", "desc": "Interior design in Lahore Cantt and nearby Askari areas: home redesign, renovations, kitchens, wardrobes and 3D views by the Woodex Lahore studio.",
 "kw": ["interior design lahore cantt", "interior designer cantt lahore", "askari house interior lahore", "cantt house renovation"],
 "note": "Lahore Cantt and its nearby housing areas mix established houses with newer homes and apartments. Our work here is mostly home redesign, renovation, kitchens and wardrobes.",
 "short": "Interior design in Lahore Cantt by Woodex Interior: home redesign, renovations, kitchens and wardrobes for established houses, newer homes and apartments.",
 "services": ["complete", "reno", "kitchen", "wardrobe", "interior"],
 "local": [("Homes in Cantt", "The area includes older houses with high ceilings and generous rooms, alongside newer homes and apartment blocks."),
           ("Updating classic houses", "Classic houses often have good proportions but tired services and finishes. We keep what works and update kitchens, bathrooms, lighting and storage."),
           ("Access and rules", "Some parts of Cantt have access procedures and building rules. We plan site visits and deliveries accordingly."),
           ("What we plan for", "Drawing rooms, family lounges, modular kitchens, wardrobes and bathroom upgrades.")],
 "faq": [("Do you work in Askari housing areas?", "Yes, across Lahore Cantt and nearby housing areas."),
         ("Can you keep the character of an older house?", "Yes. We keep strong original features and update services, storage and finishes around them."),
         ("Do you design apartments in Cantt?", "Yes, with space planning and built-in storage."),
         ("How do I start?", "Call or WhatsApp +92 322 4000768. We arrange a visit and send a written, itemised quote.")]},
{"slug": "lake-city", "name": "Lake City", "full": "Lake City Lahore",
 "title": "Interior Design in Lake City Lahore | Woodex Interior", "desc": "Interior design in Lake City Lahore for new houses and villas: layouts, kitchens, wardrobes, lighting and complete interiors, shown in 3D by Woodex.",
 "kw": ["interior design lake city lahore", "lake city house interior", "interior designer lake city", "new house interior lahore"],
 "note": "Lake City on Raiwind Road is a newer gated community, so most of our work here is new houses: designing complete interiors from grey structure and turning modern plots into finished homes.",
 "short": "Interior design in Lake City Lahore by Woodex Interior: complete interiors for new houses and villas, planned from grey structure and shown in 3D before work starts.",
 "services": ["turnkey", "interior", "arch", "elev", "kitchen"],
 "local": [("New houses", "Most Lake City homes are recent builds. Planning the interior from grey structure means lighting, sockets, plumbing and joinery are placed right the first time."),
           ("Modern layouts", "Larger plots and modern plans suit open living, double-height spaces and garden-facing lounges."),
           ("Community rules", "Gated communities set rules for working hours, deliveries and exterior changes. We plan around them."),
           ("What we plan for", "Complete interiors, modular kitchens, master suites, home cinemas, terraces and outdoor seating.")],
 "faq": [("Can you design a complete interior for a new Lake City house?", "Yes. We design and coordinate the full interior, from services to furniture."),
         ("Do you design facades?", "Yes. Our architecture team designs front elevations and exteriors."),
         ("Is Lake City too far from your studio?", "No. We regularly travel across Lahore for site visits."),
         ("How do I start?", "Send your plan by WhatsApp to +92 322 4000768. We arrange a visit and send a written, itemised quote.")]},
{"slug": "wapda-town", "name": "Wapda Town", "full": "Wapda Town Lahore",
 "title": "Interior Design in Wapda Town Lahore | Woodex Interior", "desc": "Interior design in Wapda Town Lahore for family homes: renovations, kitchens, wardrobes, bathrooms, ceilings and 3D views by the Woodex Lahore studio.",
 "kw": ["interior design wapda town lahore", "wapda town house interior", "interior designer wapda town", "house renovation wapda town"],
 "note": "Wapda Town is a settled family neighbourhood with mostly 10 marla and 1 kanal houses. Our work here is practical: kitchens, wardrobes, bathrooms, ceilings and renovations that make family homes work better.",
 "short": "Interior design in Wapda Town Lahore by Woodex Interior: practical upgrades for family homes, including kitchens, wardrobes, bathrooms, ceilings and full renovations.",
 "services": ["reno", "kitchen", "wardrobe", "bath", "ceiling"],
 "local": [("Homes in Wapda Town", "Most homes are 10 marla and 1 kanal family houses, many owner-built and lived in for years."),
           ("Practical upgrades", "The biggest gains usually come from a new kitchen, built-in wardrobes, renovated bathrooms and better lighting."),
           ("Living in during work", "We phase work so families can keep living in the house, with the noisiest work planned in blocks."),
           ("What we plan for", "Family lounges, kitchens, bedrooms, bathrooms, ceilings and complete renovations.")],
 "faq": [("Do you take on single-room projects in Wapda Town?", "Yes. A kitchen, wardrobe or bathroom on its own is a common starting point."),
         ("Can you renovate while we live in the house?", "Usually yes, with work phased room by room."),
         ("Do you design ceilings and lighting?", "Yes. False ceilings and layered lighting are planned together."),
         ("How do I start?", "Call or WhatsApp +92 322 4000768. We arrange a visit and send a written, itemised quote.")]},
]

def img(i, alt, sizes="(max-width: 768px) 100vw, 50vw", eager=False):
    b = "/assets/img/" + i
    return ('<img sizes="%s" srcset="%s-480.webp 480w, %s-960.webp 960w, %s.webp 1600w" src="%s.webp" alt="%s" width="1600" height="900" loading="%s" decoding="async"%s>'
            % (sizes, b, b, b, b, A(alt), "eager" if eager else "lazy", ' fetchpriority="high"' if eager else ""))

def build(a, tpl):
    sl, n, full = a["slug"], a["name"], a["full"]; url = "%s/lahore/%s/" % (SITE, sl); hero = "area-" + sl
    cta = re.search(r'<section class="ct-section" id="cta">[\s\S]*?</section>', tpl).group(0)
    cta = cta.replace("Start your Lahore project", "Start your %s project" % n).replace("Interior Design in Lahore", "Interior Design in " + full)
    trust = re.search(r'<section class="wx-trust"[\s\S]*?</section>', tpl)
    guides = re.search(r'<section class="wx-guides[\s\S]*?</section>', tpl)
    nearby = "".join('<a class="btn btn-light" href="/lahore/%s/">Interior design in %s</a>' % (s2, n2) for s2, n2 in ALL if s2 != sl)
    main = ('<main id="main-content">\n\n'
     '    <section class="ct-hero" aria-labelledby="city-hero-title">\n      <figure class="ct-hero-media" aria-hidden="true">%s</figure>\n'
     '      <div class="ct-wrap ct-hero-grid">\n        <div class="ct-hero-copy" data-ct-reveal="">\n'
     '          <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span><a href="/lahore/">Lahore</a><span>→</span><span>%s</span></nav>\n'
     '          <p class="ct-label">Where we work in Lahore</p>\n          <h1 id="city-hero-title">Interior design in %s</h1>\n        </div>\n'
     '        <div class="ct-hero-note" data-ct-reveal="">\n          <p>%s</p>\n'
     '          <div class="actions"><a class="btn" href="#cta">Start a %s project</a><a class="btn btn-light" href="/services/">All services</a></div>\n        </div>\n      </div>\n    </section>\n'
     '<section class="wx-short" aria-label="In short"><div class="wx-short-in"><p class="wx-short-k">In short</p><p class="wx-short-a">%s</p><ul><li>Studio at M-71, Zainab Tower, Model Town Link Road, Lahore</li><li>In-house 3D studio: photoreal views before work starts</li><li>Written, itemised quote after a site visit</li></ul></div></section>\n\n'
     '    <section class="ct-section ct-soft" id="city-services"><div class="ct-wrap">\n      <header class="ct-center" data-ct-reveal=""><p class="ct-label">Services</p><h2>What we take on in %s</h2></header>\n      <div class="ct-cards">\n%s\n      </div>\n    </div></section>\n\n'
     '    <section class="ct-section" id="city-local"><div class="ct-wrap">\n<header class="ct-center" data-ct-reveal=""><p class="ct-label">Local knowledge</p><h2>Designing homes and spaces in %s</h2></header>\n'
     '<div class="ct-local-grid">%s</div>\n</div></section>\n\n'
     '    <section class="ct-section ct-dark" id="city-note"><div class="ct-wrap ct-note-grid">\n      <div class="ct-note-copy" data-ct-reveal=""><p class="ct-label">How it works</p><h2>One accountable team, from visit to handover</h2>'
     '<p>We start with a call or WhatsApp, then visit the site to measure and understand the brief. You see the design in photoreal 3D, approve a written, itemised quote, and one Woodex team coordinates the work through to handover.</p></div>\n'
     '      <figure class="ct-image" data-ct-reveal="">%s</figure>\n    </div></section>\n\n'
     '    <section class="ct-section ct-soft" id="city-faq"><div class="ct-wrap">\n      <header class="ct-center" data-ct-reveal=""><p class="ct-label">FAQ</p><h2>Questions about working in %s</h2></header>\n      <div class="ct-faq-list">\n%s\n      </div>\n    </div></section>\n\n'
     '    <section class="ct-section" id="city-nearby"><div class="ct-wrap" data-ct-reveal="">\n      <p class="ct-label">Nearby</p>\n      <h2>Other Lahore areas we work in</h2>\n      <div class="actions">\n        <a class="btn" href="/lahore/">Interior design in Lahore</a>%s\n      </div>\n    </div></section>\n\n'
     '    %s\n\n%s\n%s\n</main>') % (
        img(hero, "", sizes="100vw", eager=True).replace('alt=""', 'alt="" aria-hidden="true"'), n, full, E(a["note"]), n, E(a["short"]), full,
        "\n".join('        <article class="ct-card" data-ct-reveal=""><h3>%s</h3><p>%s</p><a href="%s">Learn more<span class="wx-sr"> about %s</span></a></article>' % (SV[k][0], SVD[k], SV[k][1], SV[k][0]) for k in a["services"]),
        full, "".join('<div class="ct-local-card"><h3>%s</h3><p>%s</p></div>' % (E(h), E(t)) for h, t in a["local"]),
        img(hero, "Interior concept for a %s project, illustrative" % full), full,
        "\n".join('      <div class="ct-faq-item" data-ct-reveal="">\n        <button class="ct-faq-q" type="button" aria-expanded="%s"><span>%s</span><span class="plus">+</span></button>\n        <div class="ct-faq-a"><div><p>%s</p></div></div>\n      </div>'
                  % ("true" if i == 0 else "false", E(q), E(ans)) for i, (q, ans) in enumerate(a["faq"])),
        nearby, cta, guides.group(0) if guides else "", trust.group(0) if trust else "")
    out = re.sub(r"<main\b[\s\S]*?</main>", lambda _: main, tpl, count=1)
    for pat, val in [(r"<title>[\s\S]*?</title>", "<title>%s</title>" % A(a["title"])),
                     (r'<meta name="description" content="[^"]*"', '<meta name="description" content="%s"' % A(a["desc"])),
                     (r'<meta name="keywords" content="[^"]*"', '<meta name="keywords" content="%s"' % A(", ".join(a["kw"]))),
                     (r'<link rel="canonical" href="[^"]*"', '<link rel="canonical" href="%s"' % url),
                     (r'<meta property="og:title" content="[^"]*"', '<meta property="og:title" content="%s"' % A(a["title"])),
                     (r'<meta property="og:description" content="[^"]*"', '<meta property="og:description" content="%s"' % A(a["desc"])),
                     (r'<meta property="og:url" content="[^"]*"', '<meta property="og:url" content="%s"' % url),
                     (r'<meta property="og:image" content="[^"]*"', '<meta property="og:image" content="%s/assets/img/%s.webp"' % (SITE, hero)),
                     (r'<meta property="og:image:alt" content="[^"]*"', '<meta property="og:image:alt" content="Interior design in %s, Woodex Interior"' % A(full)),
                     (r'<meta name="twitter:title" content="[^"]*"', '<meta name="twitter:title" content="%s"' % A(a["title"])),
                     (r'<meta name="twitter:description" content="[^"]*"', '<meta name="twitter:description" content="%s"' % A(a["desc"])),
                     (r'<meta name="twitter:image" content="[^"]*"', '<meta name="twitter:image" content="%s/assets/img/%s.webp"' % (SITE, hero))]:
        out, c = re.subn(pat, lambda _: val, out, count=1)
        if not c and "keywords" not in pat: raise SystemExit("%s: tag missing %s" % (sl, pat))
    out = re.sub(r'(<meta property="og:image:width" content=")\d+', r"\g<1>1600", out, count=1)
    out = re.sub(r'(<meta property="og:image:height" content=")\d+', r"\g<1>900", out, count=1)
    ld = [{"@context": "https://schema.org", "@type": "Service", "name": "Interior design in " + full, "serviceType": "Interior design", "url": url, "description": a["desc"],
           "provider": {"@id": SITE + "/#org"}, "areaServed": {"@type": "Place", "name": full, "containedInPlace": {"@type": "City", "name": "Lahore"}}},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"}, {"@type": "ListItem", "position": 2, "name": "Lahore", "item": SITE + "/lahore/"},
              {"@type": "ListItem", "position": 3, "name": n, "item": url}]},
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in a["faq"]]},
          {"@context": "https://schema.org", "@type": "WebPage", "url": url, "name": "Interior design in " + full, "description": a["desc"], "isPartOf": {"@id": SITE + "/#website"},
           "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".wx-short-a", "h1"]}}]
    scripts = list(re.finditer(r'<script type="application/ld\+json">[\s\S]*?</script>', out))
    keep = next((sc for sc in scripts if '"PostalAddress"' in sc.group(0)), None)
    if not keep: raise SystemExit("no LocalBusiness ld in template")
    for sc in reversed(scripts):
        if sc is not keep: out = out[:sc.start()] + out[sc.end():]
    out = out.replace(keep.group(0), keep.group(0) + '\n<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>", 1)
    return out

def check(a, out):
    m = out[out.find("<main"):out.find("</main>")]
    body = re.sub(r"<[^>]+>", " ", m).lower()
    for bad in ["free", "pkr", "rs.", "guarantee", "warranty", "weeks", "own joinery", "our own", "showroom and material"]:
        if re.search(r"\b%s\b" % re.escape(bad), body): raise SystemExit("%s: banned '%s'" % (a["slug"], bad))
    for h in re.findall(r'href="(/[^"#]*)"', m):
        if h.startswith("/lahore/") and h.strip("/").split("/")[-1] in [x for x, _ in ALL]: continue
        if h != "/" and not os.path.exists(os.path.join(ROOT, h.strip("/"), "index.html")): raise SystemExit("%s: broken link %s" % (a["slug"], h))

def main():
    tpl = open(TPL, encoding="utf-8").read()
    for a in AREAS:
        out = build(a, tpl); check(a, out)
        d = os.path.join(ROOT, "lahore", a["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(out)
        w = len(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[\s\S]*?</\1>", "", out[out.find("<main"):out.find("</main>")])).split())
        print("%-12s %4d words" % (a["slug"], w))
    # link the areas from /lahore/ (idempotent) + sitemap
    lp = os.path.join(ROOT, "lahore", "index.html"); s = open(lp, encoding="utf-8").read()
    s = re.sub(r'<section class="ct-section ct-soft" id="city-areas">[\s\S]*?</section>\s*', "", s)
    areas = ('\n<section class="ct-section ct-soft" id="city-areas"><div class="ct-wrap" data-ct-reveal="">\n      <p class="ct-label">Lahore areas</p>\n      <h2>Interior design across Lahore</h2>\n      <div class="actions">%s</div>\n    </div></section>'
             % "".join('<a class="btn btn-light" href="/lahore/%s/">%s</a>' % (s2, n2) for s2, n2 in ALL))
    i = s.index('<section class="ct-section" id="city-process">'); s = s[:i] + areas.lstrip("\n") + "\n\n    " + s[i:]
    open(lp, "w", encoding="utf-8").write(s)
    sm = os.path.join(ROOT, "sitemap.xml"); t = open(sm, encoding="utf-8").read()
    for s2, _ in ALL:
        u = "%s/lahore/%s/" % (SITE, s2)
        if u + "<" not in t: t = t.replace("</urlset>", "  <url><loc>%s</loc><lastmod>2026-10-07</lastmod></url>\n</urlset>" % u)
    open(sm, "w", encoding="utf-8").write(t)

if __name__ == "__main__":
    main()
