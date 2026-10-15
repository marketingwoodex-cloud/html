#!/usr/bin/env python3
"""P35-B: 6 new service pages built on the bedroom-design template (bd- styles, shared header/footer,
talk + trust blocks). Content rules: no prices, no 'free', no fixed timelines. Idempotent.
Run: python3 tools/p35/new_services.py"""
import os, re, html, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend-v1"))
TPL = os.path.join(ROOT, "residential-bedroom-design", "index.html")
SITE = "https://woodex.com.pk"
E = lambda s: html.escape(str(s), quote=False)
A = lambda s: html.escape(str(s), quote=True)

PAGES = [
{
 "slug": "bathroom-design", "name": "Bathroom Design", "parent": ("Interior Design", "/interior-design/"),
 "title": "Bathroom Design in Lahore | Woodex Interior",
 "desc": "Bathroom design in Lahore: layouts, waterproofing, tiles, vanities, fittings and lighting planned in 3D by Woodex Interior, with one team to build it.",
 "kw": ["bathroom design lahore", "washroom design pakistan", "modern bathroom design", "bathroom interior lahore"],
 "label": "Wet rooms done right", "hero": "Bathroom design that looks calm and keeps water where it belongs: layout, waterproofing, tiles, vanity, fittings and light planned together.",
 "alt": "Luxury master bathroom with freestanding tub and oak vanity, illustrative render",
 "short": "Bathroom design in Lahore for master, family and guest bathrooms: layout, waterproofing, tiles, vanities, fittings and lighting, shown in 3D before work starts.",
 "intro_h": "What Is Bathroom Design?", "intro_l": "Small room, most detail",
 "intro": ["A bathroom packs plumbing, drainage, waterproofing, ventilation, electrics and finishes into a few square metres. Good design decides where every fitting goes before a single tile is laid.",
           "Woodex designs master bathrooms, family and kids' bathrooms, guest washrooms and powder rooms. For upgrades to an existing bathroom, read our <a class=\"bd-inline-link\" href=\"/insights/bathroom-renovation-lahore/\">bathroom renovation guide</a>."],
 "deliver": [("Layout &amp; Zoning", "Wet and dry zones, WC position and door swing resolved first."),
             ("Waterproofing Detail", "Membrane, slopes and drain positions drawn for the contractor."),
             ("Tiles &amp; Stone", "Slip-resistant floors and wall finishes chosen as one palette."),
             ("Vanity &amp; Storage", "Moisture-resistant vanities, niches and mirror cabinets."),
             ("Sanitary Fittings", "Concealed cisterns, mixers and showers specified early."),
             ("Lighting &amp; Mirrors", "Soft ceiling light, face lighting at the mirror and a night light."),
             ("Ventilation", "Exhaust sized for the room to control damp and odour."),
             ("Powder Rooms", "Compact guest washrooms with a stronger design statement.")],
 "faq": [("What makes a good bathroom layout?", "Separate wet and dry zones, a WC away from the door line, enough space in front of each fitting, and a floor that slopes to the drain."),
         ("Which tiles are best for bathroom floors in Pakistan?", "Matt or textured porcelain with a good slip rating. Keep glossy tiles for walls."),
         ("Do you design small bathrooms and powder rooms?", "Yes. Wall-hung fittings, shower niches, mirrors and a tight palette make compact bathrooms feel larger."),
         ("Can Woodex build the bathroom as well?", "Yes. We can design only, or coordinate plumbing, waterproofing, tiling and fittings through to handover."),
         ("How do I get a quote?", "Share the bathroom size and photos by WhatsApp, then we arrange a site visit and send a written, itemised quote.")],
 "related": [("Kitchen Design", "/kitchen-design/"), ("Residential Renovation", "/residential-renovation/"), ("Bedroom Design", "/residential-bedroom-design/"), ("Complete Home Redesign", "/complete-home-redesign/"), ("Woodex 3D Studio", "/3d-visualization/")],
 "guides": [("bathroom-renovation-lahore", "ins-bathroom", "Renovation", "Bathroom Renovation in Lahore: A Practical Planning Guide"), ("materials-that-survive-lahore-climate", "ins-materials", "Materials", "Materials That Survive Lahore's Climate"), ("flooring-options-pakistan", "ins-flooring", "Materials", "Flooring Options in Pakistan")],
 "talk": "Tell us the bathroom size, what needs to change and the look you want.",
},
{
 "slug": "wardrobe-design", "name": "Wardrobe Design", "parent": ("Interior Design", "/interior-design/"),
 "title": "Wardrobe Design in Lahore | Built-in Wardrobes | Woodex",
 "desc": "Wardrobe design in Lahore: built-in and sliding wardrobes with planned interiors, durable boards, quality hardware and finishes, designed in 3D by Woodex.",
 "kw": ["wardrobe design lahore", "built in wardrobe pakistan", "sliding wardrobe design", "cupboard design lahore"],
 "label": "Storage that disappears", "hero": "Built-in wardrobes planned around what you own: the right doors, interiors, boards and hardware, drawn to fit your wall exactly.",
 "alt": "Floor-to-ceiling walnut and cream built-in wardrobe, illustrative render",
 "short": "Wardrobe design in Lahore: built-in, sliding and hinged wardrobes with planned interiors, moisture-resistant boards and quality hardware, shown in 3D before making.",
 "intro_h": "What Is Wardrobe Design?", "intro_l": "Measured, not guessed",
 "intro": ["A good wardrobe starts with an inventory: long and short hanging, folded clothes, shoes, bags, bedding and suitcases. The doors and finish come after the interior works.",
           "We design wardrobes for master bedrooms, children's rooms and guest rooms. For a full room, see <a class=\"bd-inline-link\" href=\"/residential-bedroom-design/\">bedroom design</a>, and read the <a class=\"bd-inline-link\" href=\"/insights/wardrobe-design-cost-pakistan-2026/\">wardrobe cost guide</a>."],
 "deliver": [("Storage Inventory", "We size hanging, shelves and drawers to what you actually own."),
             ("Door Type", "Sliding, hinged or handleless chosen for the room and the budget."),
             ("Internal Layout", "Rails, drawers, shoe racks, pull-outs and lofts planned to the centimetre."),
             ("Boards &amp; Edges", "Moisture-resistant boards with sealed edges for Lahore's monsoon."),
             ("Hardware", "Soft-close hinges, runners and sliding tracks specified by grade."),
             ("Finishes", "Laminate, lacquer, veneer, glass or fabric panels, sampled first."),
             ("Lighting", "LED strips and sensor lights inside long or deep bays."),
             ("Ceiling-height Units", "Lofts and full-height panels that use every centimetre of wall.")],
 "faq": [("Sliding or hinged wardrobe doors: which is better?", "Sliding doors save space in tight rooms. Hinged doors give full access to the interior and suit wider rooms."),
         ("Which board is best for wardrobes in Pakistan?", "Moisture-resistant MDF or plywood with sealed edges handles humidity better than standard particle board."),
         ("Can you fit a wardrobe to an awkward wall?", "Yes. Built-ins are drawn to the measured wall, including columns, beams and sloping ceilings."),
         ("Do you make the wardrobes yourselves?", "We design the wardrobe and coordinate trusted joinery partners, so one team stays accountable from drawing to installation."),
         ("How do I start?", "Send the wall width, height and a photo by WhatsApp. We arrange a measurement visit and a written, itemised quote.")],
 "related": [("Dressing Room Design", "/dressing-room-design/"), ("Bedroom Design", "/residential-bedroom-design/"), ("Kids Room Design", "/residential-kids-room-design/"), ("Interior Design", "/interior-design/"), ("Woodex 3D Studio", "/3d-visualization/")],
 "guides": [("wardrobe-design-cost-pakistan-2026", "ins-wardrobe", "Joinery", "Wardrobe Design Cost in Pakistan 2026"), ("small-space-ideas", "img-c349a92a4ae0", "Small spaces", "Small rooms that live large"), ("materials-that-survive-lahore-climate", "ins-materials", "Materials", "Materials That Survive Lahore's Climate")],
 "talk": "Tell us the wall size, what you need to store and the finish you like.",
},
{
 "slug": "false-ceiling-design", "name": "False Ceiling Design", "parent": ("Interior Design", "/interior-design/"),
 "title": "False Ceiling Design in Lahore | Gypsum Ceilings | Woodex",
 "desc": "False ceiling design in Lahore: gypsum, timber and acoustic ceilings with cove and profile lighting, planned with AC and services by Woodex Interior.",
 "kw": ["false ceiling design lahore", "gypsum ceiling design", "ceiling design pakistan", "pop ceiling lahore"],
 "label": "The fifth wall", "hero": "Ceilings that hide services, shape the room and carry the lighting, designed with your AC, wiring and furniture in mind.",
 "alt": "Layered gypsum false ceiling with cove lighting and timber inlay, illustrative render",
 "short": "False ceiling design in Lahore: gypsum, timber slat and acoustic ceilings with cove, profile and downlights, coordinated with AC ducts and wiring.",
 "intro_h": "What Is False Ceiling Design?", "intro_l": "Light, services and proportion",
 "intro": ["A false ceiling is a second ceiling hung below the slab. It hides wiring and AC ducts, improves acoustics and gives the lighting a place to live.",
           "We design ceilings for lounges, bedrooms, kitchens, offices, restaurants and showrooms. For costs and options, read the <a class=\"bd-inline-link\" href=\"/insights/false-ceiling-cost-lahore-2026/\">false ceiling guide</a> and <a class=\"bd-inline-link\" href=\"/insights/lighting-design-layers-explained/\">lighting layers explained</a>."],
 "deliver": [("Ceiling Concept", "Levels, bulkheads and features matched to the furniture layout."),
             ("Gypsum &amp; Moisture Boards", "Standard boards in dry rooms, moisture-resistant boards in kitchens and baths."),
             ("Cove &amp; Profile Lighting", "Hidden LED coves and linear profiles drawn with the electrician."),
             ("AC &amp; Duct Coordination", "Grilles, access panels and duct routes planned before framing."),
             ("Timber &amp; Slat Features", "Warm accents over seating, dining or reception areas."),
             ("Acoustic Ceilings", "Tiles and panels that cut echo in offices and restaurants."),
             ("Height Planning", "Drops kept minimal so rooms never feel low."),
             ("Reflected Ceiling Plan", "One drawing with lights, sensors, speakers and grilles.")],
 "faq": [("How much ceiling height do I lose with a false ceiling?", "It depends on what has to fit above it, such as ducts and lights. Keeping drops local, around the room edge, protects the height."),
         ("Is gypsum ceiling suitable for kitchens and bathrooms?", "Use moisture-resistant gypsum board or other humidity-tolerant panels in wet areas."),
         ("Can a false ceiling hide AC ducts?", "Yes. Duct routes, grilles and access panels are planned with the ceiling so they stay serviceable."),
         ("Which lighting works best with a false ceiling?", "A layered scheme: cove light for ambience, profile or downlights for tasks, and accent lights for features."),
         ("Do you install ceilings too?", "Yes. We can design only or coordinate installation, electrics and finishing.")],
 "related": [("Living Room Design", "/residential-living-room-design/"), ("Bedroom Design", "/residential-bedroom-design/"), ("Office Interior Design", "/office-interior-design/"), ("Interior Design", "/interior-design/"), ("Woodex 3D Studio", "/3d-visualization/")],
 "guides": [("false-ceiling-cost-lahore-2026", "ins-ceiling", "Ceilings", "False Ceiling Cost in Lahore 2026"), ("lighting-design-layers-explained", "ins-lighting", "Lighting", "Lighting Design Layers, Explained"), ("interior-design-trends-pakistan-2027", "img-e3ba33b612d6", "Trends", "Interior Design Trends in Pakistan for 2027")],
 "talk": "Tell us the room, ceiling height and the look you want.",
},
{
 "slug": "apartment-interior-design", "name": "Apartment Interior Design", "parent": ("Interior Design", "/interior-design/"),
 "title": "Apartment Interior Design in Lahore | Woodex Interior",
 "desc": "Apartment interior design in Lahore: space planning, storage, kitchens, lighting and finishes for flats and high-rise apartments, planned in 3D by Woodex.",
 "kw": ["apartment interior design lahore", "flat interior design pakistan", "small apartment design", "high rise apartment interior"],
 "label": "More home per square foot", "hero": "Apartment interiors that make every square foot work: open planning, built-in storage, compact kitchens and light that carries through the home.",
 "alt": "Modern Lahore apartment with city view and compact oak kitchen, illustrative render",
 "short": "Apartment interior design in Lahore for flats and high-rise apartments: space planning, storage, kitchens, lighting and finishes, coordinated with building rules.",
 "intro_h": "What Is Apartment Interior Design?", "intro_l": "Planned around the building",
 "intro": ["Apartments have fixed walls, shared services and building rules. Good design works within them: storage built into every wall, multipurpose rooms and a calm palette that makes the home feel bigger.",
           "We design apartments in Lahore's towers and societies, from studios to large family flats. See our <a class=\"bd-inline-link\" href=\"/insights/apartment-small-space-planning-lahore/\">small-space planning guide</a> and <a class=\"bd-inline-link\" href=\"/insights/small-space-ideas/\">small room ideas</a>."],
 "deliver": [("Space Planning", "Layouts that open living, dining and kitchen where the structure allows."),
             ("Built-in Storage", "Full-height wardrobes, TV walls and entrance units."),
             ("Compact Kitchens", "Straight or L layouts with tall units and integrated appliances."),
             ("Multipurpose Rooms", "Study-guest rooms, fold-down desks and storage beds."),
             ("Lighting Plan", "Layered light to replace the single ceiling point."),
             ("Finishes &amp; Palette", "A consistent palette that flows from room to room."),
             ("Balconies", "Seating, planting and screening for small outdoor spaces."),
             ("Building Coordination", "Work planned around lift access, hours and management rules.")],
 "faq": [("Can walls be removed in an apartment?", "Only non-structural walls, and only with building management approval. We check the structure and rules before planning."),
         ("How do you make a small apartment feel larger?", "Built-in storage, fewer and lighter pieces of furniture, a consistent palette, mirrors and layered lighting."),
         ("Do building rules affect the work?", "Yes. Most towers set working hours, lift booking and delivery limits. We plan the programme around them."),
         ("Do you design rented apartments?", "Yes. We focus on furniture, lighting, soft furnishings and removable storage where fixed changes are not allowed."),
         ("How do I start?", "Send your floor plan or photos by WhatsApp. We arrange a visit and send a written, itemised quote.")],
 "related": [("Kitchen Design", "/kitchen-design/"), ("Wardrobe Design", "/wardrobe-design/"), ("Living Room Design", "/residential-living-room-design/"), ("Home Office Design", "/residential-home-office-design/"), ("Interior Design", "/interior-design/")],
 "guides": [("apartment-small-space-planning-lahore", "ins-apartment", "Small spaces", "Apartment and Small-House Space Planning in Lahore"), ("small-space-ideas", "img-c349a92a4ae0", "Small spaces", "Small rooms that live large"), ("home-office-design-ideas", "ins-homeoffice", "Homes", "Home Office Design Ideas for Pakistani Homes")],
 "talk": "Tell us the apartment size, building and what you want to change.",
},
{
 "slug": "dressing-room-design", "name": "Dressing Room Design", "parent": ("Interior Design", "/interior-design/"),
 "title": "Dressing Room Design in Lahore | Walk-in Closets | Woodex",
 "desc": "Dressing room design in Lahore: walk-in closets with wardrobes, islands, mirrors, vanity lighting and storage for clothes, shoes and jewellery, by Woodex.",
 "kw": ["dressing room design lahore", "walk in closet design pakistan", "dressing area design", "walk in wardrobe lahore"],
 "label": "Your own walk-in", "hero": "Dressing rooms planned like a boutique: every outfit visible, shoes and jewellery in place, and lighting that shows true colour.",
 "alt": "Walk-in dressing room with glass wardrobes, island and vanity, illustrative render",
 "short": "Dressing room design in Lahore: walk-in closets and dressing areas with wardrobes, islands, mirrors, vanity lighting and organised storage for clothes, shoes and jewellery.",
 "intro_h": "What Is Dressing Room Design?", "intro_l": "Between bedroom and bath",
 "intro": ["A dressing room links the bedroom and bathroom and keeps clothes out of the sleeping space. It needs the right depth for hanging, room to move, and light that shows true colours.",
           "We design walk-in closets, dressing areas within master suites and bridal dressing rooms. For storage inside the bedroom, see <a class=\"bd-inline-link\" href=\"/wardrobe-design/\">wardrobe design</a>."],
 "deliver": [("Walk-in Layout", "Straight, L, U or island layouts sized to the room."),
             ("Hanging Zones", "Long and short hanging for formal and daily wear."),
             ("Shoes &amp; Bags", "Angled shelves, display bays and closed cabinets that keep dust out."),
             ("Jewellery &amp; Watches", "Lined drawers, lockable trays and an island top."),
             ("Dressing Table", "Vanity with mirror lighting at face height."),
             ("Full-length Mirrors", "Placed for natural light and easy viewing."),
             ("Lighting", "Colour-accurate light, LED strips and sensor switches."),
             ("Glass &amp; Finishes", "Tinted glass fronts, leather or fabric inserts and timber.")],
 "faq": [("How big should a walk-in dressing room be?", "It depends on the layout. A straight run needs space for wardrobe depth plus a clear walkway; an island needs more. We size it from your inventory."),
         ("Can a small room become a dressing room?", "Often yes. A spare room or part of a large bedroom can work with a compact L or straight layout."),
         ("What lighting is best for a dressing room?", "Colour-accurate, even light from above and at the mirror, with LED strips inside wardrobes."),
         ("Do you design bridal dressing rooms?", "Yes, with space for formal outfits, jewellery storage and a well-lit dressing table."),
         ("How do I start?", "Send the room size and photos by WhatsApp. We arrange a visit and send a written, itemised quote.")],
 "related": [("Wardrobe Design", "/wardrobe-design/"), ("Bedroom Design", "/residential-bedroom-design/"), ("Bathroom Design", "/bathroom-design/"), ("Complete Home Redesign", "/complete-home-redesign/"), ("Woodex 3D Studio", "/3d-visualization/")],
 "guides": [("wardrobe-design-cost-pakistan-2026", "ins-wardrobe", "Joinery", "Wardrobe Design Cost in Pakistan 2026"), ("lighting-design-layers-explained", "ins-lighting", "Lighting", "Lighting Design Layers, Explained"), ("1-kanal-house-interior-cost-lahore", "img-e3ba33b612d6", "Homes", "1 Kanal House Interior Cost in Lahore")],
 "talk": "Tell us the room size, what you need to store and the style you like.",
},
{
 "slug": "kitchen-renovation", "name": "Kitchen Renovation", "parent": ("Renovation", "/renovation/"),
 "title": "Kitchen Renovation in Lahore | Woodex Interior",
 "desc": "Kitchen renovation in Lahore: new layouts, cabinets, counters, plumbing, electrics, exhaust and finishes, designed in 3D and delivered by one Woodex team.",
 "kw": ["kitchen renovation lahore", "kitchen remodel pakistan", "kitchen makeover lahore", "old kitchen renovation"],
 "label": "From tired to working", "hero": "Kitchen renovation that fixes the layout, services and storage, not just the cabinet doors, delivered by one accountable team.",
 "alt": "Renovated kitchen with sage and oak cabinets and quartz counter, illustrative render",
 "short": "Kitchen renovation in Lahore: refits and full renovations with new layouts, cabinets, counters, plumbing, electrics and exhaust, shown in 3D and delivered by one team.",
 "intro_h": "What Is Kitchen Renovation?", "intro_l": "Refit or full renovation",
 "intro": ["A refit replaces cabinets, counters and appliances on the same layout. A full renovation strips the room and also renews plumbing, wiring, exhaust, tiles and the layout itself. Old Lahore kitchens often need the second.",
           "For new kitchens see <a class=\"bd-inline-link\" href=\"/kitchen-design/\">kitchen design</a>. For costs, read the <a class=\"bd-inline-link\" href=\"/insights/kitchen-renovation-cost-lahore/\">kitchen renovation cost guide</a> and <a class=\"bd-inline-link\" href=\"/insights/kitchen-layouts-that-work-lahore-homes/\">kitchen layouts that work</a>."],
 "deliver": [("Site Survey", "Services, walls, levels and damp checked before design."),
             ("New Layout", "Work triangle, landing space and storage re-planned."),
             ("Cabinets &amp; Counters", "Moisture-resistant carcasses, quality hardware and durable tops."),
             ("Plumbing &amp; Gas", "New lines and points placed for the new layout."),
             ("Electrical Load", "Dedicated circuits for ovens, hobs and appliances."),
             ("Exhaust &amp; Ventilation", "Hoods ducted outside for desi cooking."),
             ("Tiles &amp; Backsplash", "Easy-clean surfaces behind hob and sink."),
             ("Phased Work", "Sequencing planned to keep the house running.")],
 "faq": [("Do I need a refit or a full kitchen renovation?", "If plumbing, wiring and the layout work, a refit may be enough. Leaks, old pipes, weak electrics or a poor layout call for a full renovation."),
         ("Can I keep using my house during the renovation?", "Yes, in most cases. We plan a temporary kitchen point and sequence the noisy work."),
         ("Which countertop is best for Pakistani kitchens?", "Quartz and granite resist heat, stains and scratches better than most alternatives."),
         ("How long does a kitchen renovation take?", "It depends on scope and on ordering appliances and materials early. A programme is agreed before work starts."),
         ("How do I get a quote?", "Send photos and the kitchen size by WhatsApp. We arrange a site visit and send a written, itemised quote.")],
 "related": [("Kitchen Design", "/kitchen-design/"), ("Residential Renovation", "/residential-renovation/"), ("Renovation", "/renovation/"), ("Bathroom Design", "/bathroom-design/"), ("Woodex 3D Studio", "/3d-visualization/")],
 "guides": [("kitchen-renovation-cost-lahore", "img-27ed3ac85189", "Kitchens", "Kitchen Renovation Cost in Lahore 2026"), ("kitchen-layouts-that-work-lahore-homes", "ins-kitchenlayout", "Kitchens", "Kitchen Layouts That Work in Lahore Homes"), ("house-renovation-timeline-lahore", "img-1f4b4ef86cb5", "Renovation", "House Renovation Timeline in Lahore")],
 "talk": "Tell us the kitchen size, what is not working and what you want to change.",
},
]
STEPS = [("Consultation &amp; Brief", "We learn how you use the space and what has to change."),
         ("Site Measurement", "We record walls, openings, levels and existing services."),
         ("Layout &amp; Concept", "Plans and options resolved before materials are chosen."),
         ("Materials &amp; Specification", "Finishes, fittings and hardware selected and sampled."),
         ("3D Views &amp; Drawings", "Photoreal 3D, working drawings and a written, itemised quote.")]
FEAT = [("Space planning", "Layouts that fit how you actually use the room."), ("3D visualization", "Photoreal views with revision rounds before you commit."),
        ("Materials and finishes", "A coordinated board of colours, surfaces and fittings."), ("Lighting plan", "Ambient, task and accent light planned with the layout."),
        ("Coordinated build", "One accountable team from drawings to handover.")]

def img_full(i, alt, eager=False, cls=""):
    b = "/assets/img/" + i
    return ('<img sizes="(max-width: 768px) 100vw, 50vw" srcset="%s-480.webp 480w, %s-960.webp 960w, %s.webp 1600w" src="%s.webp" width="1600" height="900" alt="%s" loading="%s" decoding="async"%s>'
            % (b, b, b, b, A(alt), "eager" if eager else "lazy", ' fetchpriority="high"' if eager else ""))

def main_html(p):
    s, n = p["slug"], p["name"]; hero = "svc-" + s
    pool = [hero, "ins-materials", "ins-lighting", "img-c349a92a4ae0", "img-a824b3688cd4"]
    intro_img = {"bathroom-design": "ins-bathroom", "wardrobe-design": "ins-wardrobe", "false-ceiling-design": "ins-ceiling", "apartment-interior-design": "ins-apartment",
                 "dressing-room-design": "img-27c481fa9a3d", "kitchen-renovation": "ins-kitchenlayout"}[s]
    feat_imgs = [hero, "img-a824b3688cd4", "ins-materials", "ins-lighting", intro_img]
    return ('<main id="main-content">\n\n'
     '    <section class="bd-hero" aria-labelledby="svc-hero-title"><div class="bd-wrap bd-hero-grid">\n'
     '      <div class="bd-hero-copy bd-reveal">\n'
     '        <nav class="bd-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span><a href="/services/">Services</a><span>→</span><a href="%s">%s</a><span>→</span><span>%s</span></nav>\n'
     '        <p class="bd-label">%s</p><h1 id="svc-hero-title">%s in Lahore</h1>\n'
     '        <p class="bd-copy">%s</p>\n'
     '        <div><a class="bd-btn bd-btn-light" href="#svc-contact">Discuss your project</a></div>\n'
     '      </div>\n'
     '      <figure class="bd-hero-media bd-reveal">%s<figcaption>%s concept, illustrative</figcaption></figure>\n'
     '    </div></section>\n'
     '<section class="wx-short" aria-label="In short"><div class="wx-short-in"><p class="wx-short-k">In short</p><p class="wx-short-a">%s</p><ul><li>Based in Lahore (M-71, Zainab Tower, Model Town Link Road), working across Pakistan</li><li>In-house 3D studio: photoreal views before work starts</li><li>Written, itemised quote after a site visit</li></ul></div></section>\n\n'
     '    <section class="bd-section bd-intro" id="svc-intro"><div class="bd-wrap bd-intro-grid">\n'
     '      <div class="bd-intro-copy bd-reveal"><p class="bd-label">%s</p><h2>%s</h2>%s</div>\n'
     '      <figure class="bd-intro-media bd-reveal">%s</figure>\n'
     '    </div></section>\n\n'
     '    <section class="bd-section bd-deliver" id="svc-deliver"><div class="bd-wrap">\n'
     '      <header class="bd-head bd-reveal"><h2>What We Deliver</h2><p class="bd-copy">Everything the %s needs, planned together so nothing is added as an afterthought.</p></header>\n'
     '      <div class="bd-scope-grid bd-reveal">\n%s\n      </div>\n'
     '      <div class="bd-coordination bd-reveal"><p>Construction, joinery and installation can be coordinated by Woodex fit-out teams.</p><a class="bd-btn" href="#svc-contact">Discuss the %s</a></div>\n'
     '    </div></section>\n\n'
     '    <section class="bd-section bd-process" id="svc-process"><div class="bd-wrap">\n'
     '      <header class="bd-head bd-reveal"><h2>Our Design Process</h2><p class="bd-copy">Five clear stages from the first conversation to a buildable design.</p></header>\n'
     '      <div class="bd-steps bd-reveal">\n%s\n      </div>\n'
     '    </div></section>\n\n'
     '    <section class="wx-feat" id="svc-included" aria-labelledby="svc-included-h"><div class="wrap">\n'
     '  <div class="wx-feat-head"><div><p class="wx-kicker">What\'s included</p><h2 id="svc-included-h">What you get with %s</h2></div><p>Every project is scoped after a site visit or brief, then quoted in writing so you know exactly what is included. <a href="/book-a-visit/">Book a visit</a></p></div>\n'
     '  <ul class="wx-feat-grid">\n%s\n  </ul>\n</div></section>\n\n'
     '    <section class="bd-section bd-faq" id="svc-faq"><div class="bd-wrap bd-faq-grid">\n'
     '      <div class="bd-faq-intro bd-reveal"><h2>%s FAQs</h2><p class="bd-copy">Short answers to the questions clients ask before starting.</p></div>\n'
     '      <div class="bd-faq-list bd-reveal">\n%s\n      </div>\n'
     '    </div></section>\n\n'
     '    <section class="bd-section bd-related" id="svc-related"><div class="bd-wrap">\n'
     '      <header class="bd-head bd-reveal"><h2>Related Services</h2><p class="bd-copy">Continue with another space or bring the whole project into one coordinated design. <a class="bd-inline-link" href="/services/">All services</a></p></header>\n'
     '      <div class="bd-related-grid bd-reveal">%s</div>\n'
     '    </div></section>\n\n'
     '%%GUIDES%%\n\n%%TALK%%\n\n%%TRUST%%\n\n</main>') % (
        p["parent"][1], p["parent"][0], n, p["label"], n, p["hero"], img_full(hero, p["alt"], eager=True), n, E(p["short"]),
        p["intro_l"], p["intro_h"], "".join('<p class="bd-copy">%s</p>' % x for x in p["intro"]), img_full(intro_img, n + " detail, illustrative"),
        n.lower(), "\n".join('        <article class="bd-scope-card"><h3>%s</h3><p>%s</p></article>' % d for d in p["deliver"]), n.lower(),
        "\n".join('        <article class="bd-step"><strong>%02d</strong><h3>%s</h3><p>%s</p></article>' % (i + 1, a, b) for i, (a, b) in enumerate(STEPS)),
        n, "\n".join('    <li class="wx-feat-card%s"><img src="/assets/img/%s-960.webp" alt="%s – %s" loading="lazy" decoding="async" width="960" height="540"><div class="wx-feat-txt"><small>%02d</small><strong>%s</strong><span>%s</span></div></li>'
                     % (" wx-feat-big" if i == 0 else "", feat_imgs[i], a, n, i + 1, a, b) for i, (a, b) in enumerate(FEAT)),
        n, "\n".join('        <div class="bd-faq-item"><button class="bd-faq-q" type="button" aria-expanded="%s"><span>%s</span><span class="plus" aria-hidden="true">+</span></button><div class="bd-faq-a"><div><p>%s</p></div></div></div>'
                     % ("true" if i == 0 else "false", E(q), E(a)) for i, (q, a) in enumerate(p["faq"])),
        "".join('<a class="bd-related-link" href="%s"><small>%02d</small><strong>%s</strong><span aria-hidden="true">↗</span></a>' % (h, i + 1, t) for i, (t, h) in enumerate(p["related"])))

def guides(p):
    li = "".join('<li><a href="/insights/%s/"><figure><img src="/assets/img/%s-960.webp" sizes="(max-width: 860px) 100vw, 33vw" alt="%s" loading="lazy" decoding="async" width="960" height="640"><span class="wx-g-tag">%s</span></figure><div class="wx-g-body"><small>3 min read</small><strong>%s</strong><em>Read the guide <span aria-hidden="true">→</span></em></div></a></li>'
                 % (sl, im, A(t), tag, E(t)) for sl, im, tag, t in p["guides"])
    return ('<section class="wx-guides wx-guides-v2" aria-labelledby="wx-guides-h"><div class="wx-g-wrap"><div class="wx-g-head"><div><p class="wx-g-k">Related guides</p><h2 id="wx-guides-h">Read before you plan</h2></div>'
            '<a class="wx-g-all" href="/insights/">All guides <span aria-hidden="true">→</span></a></div><ul>%s</ul></div></section>' % li)

def build(p, tpl):
    s, n = p["slug"], p["name"]; url = "%s/%s/" % (SITE, s)
    talk = re.search(r'<section class="wx-talk-section[\s\S]*?</section>', tpl).group(0)
    trust = re.search(r'<section class="wx-trust"[\s\S]*?</section>', tpl).group(0)
    talk = talk.replace('id="bedroom-contact"', 'id="svc-contact"').replace('data-wx-form="residential-bedroom-design"', 'data-wx-form="%s"' % s)
    talk = talk.replace('data-wx-service="Bedroom Design in Lahore"', 'data-wx-service="%s in Lahore"' % n)
    talk = re.sub(r'<p class="lead">[^<]*</p>', '<p class="lead">%s</p>' % E(p["talk"]), talk, count=1)
    talk = re.sub(r"<option selected>[^<]*</option>", "<option selected>%s in Lahore</option>" % n, talk, count=1)
    m = main_html(p).replace("%GUIDES%", guides(p)).replace("%TALK%", talk).replace("%TRUST%", trust)
    out = re.sub(r"<main\b[\s\S]*?</main>", lambda _: m, tpl, count=1)
    for pat, val in [(r"<title>[\s\S]*?</title>", "<title>%s</title>" % A(p["title"])),
                     (r'<meta name="description" content="[^"]*"', '<meta name="description" content="%s"' % A(p["desc"])),
                     (r'<meta name="keywords" content="[^"]*"', '<meta name="keywords" content="%s"' % A(", ".join(p["kw"]))),
                     (r'<link rel="canonical" href="[^"]*"', '<link rel="canonical" href="%s"' % url),
                     (r'<meta property="og:title" content="[^"]*"', '<meta property="og:title" content="%s"' % A(p["title"])),
                     (r'<meta property="og:description" content="[^"]*"', '<meta property="og:description" content="%s"' % A(p["desc"])),
                     (r'<meta property="og:url" content="[^"]*"', '<meta property="og:url" content="%s"' % url),
                     (r'<meta property="og:image" content="[^"]*"', '<meta property="og:image" content="%s/assets/img/svc-%s.webp"' % (SITE, s)),
                     (r'<meta property="og:image:alt" content="[^"]*"', '<meta property="og:image:alt" content="%s"' % A(p["alt"])),
                     (r'<meta name="twitter:title" content="[^"]*"', '<meta name="twitter:title" content="%s"' % A(p["title"])),
                     (r'<meta name="twitter:description" content="[^"]*"', '<meta name="twitter:description" content="%s"' % A(p["desc"])),
                     (r'<meta name="twitter:image" content="[^"]*"', '<meta name="twitter:image" content="%s/assets/img/svc-%s.webp"' % (SITE, s))]:
        out, c = re.subn(pat, lambda _: val, out, count=1)
        if not c and "keywords" not in pat: raise SystemExit("%s: tag missing %s" % (s, pat))
    out = re.sub(r'(<meta property="og:image:width" content=")\d+', r"\g<1>1600", out, count=1)
    out = re.sub(r'(<meta property="og:image:height" content=")\d+', r"\g<1>900", out, count=1)
    ld = [{"@context": "https://schema.org", "@type": "Service", "name": n + " in Lahore", "serviceType": n, "description": p["desc"], "url": url,
           "image": "%s/assets/img/svc-%s.webp" % (SITE, s), "provider": {"@id": SITE + "/#org"}, "areaServed": [{"@type": "City", "name": "Lahore"}, {"@type": "Country", "name": "Pakistan"}]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"}, {"@type": "ListItem", "position": 2, "name": "Services", "item": SITE + "/services/"},
              {"@type": "ListItem", "position": 3, "name": p["parent"][0], "item": SITE + p["parent"][1]}, {"@type": "ListItem", "position": 4, "name": n, "item": url}]},
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]},
          {"@context": "https://schema.org", "@type": "WebPage", "url": url, "name": n + " in Lahore", "description": p["desc"], "isPartOf": {"@id": SITE + "/#website"},
           "about": {"@id": SITE + "/#org"}, "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".wx-short-a", "h1"]}}]
    scripts = list(re.finditer(r'<script type="application/ld\+json">[\s\S]*?</script>', out))
    first = scripts[0].group(0)
    if '"LocalBusiness"' not in first: raise SystemExit("unexpected first ld")
    for sc in reversed(scripts[1:]): out = out[:sc.start()] + out[sc.end():]
    out = out.replace(first, first + '\n<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>", 1)
    out = out.replace('href="#bedroom-contact"', 'href="#svc-contact"')
    return out

def check(p, out):
    body = re.sub(r"<[^>]+>", " ", out[out.find("<main"):out.find('<section class="wx-talk')]).lower()
    for bad in ["free", "pkr", "rs.", "guarantee", "warranty", "weeks", "fixed price"]:
        if re.search(r"\b%s\b" % re.escape(bad), body): raise SystemExit("%s: banned '%s'" % (p["slug"], bad))
    for h in re.findall(r'href="(/[^"#]*)"', out[out.find("<main"):out.find("</main>")]):
        if not os.path.exists(os.path.join(ROOT, h.strip("/"), "index.html")) and h != "/" and not any(h == "/%s/" % q["slug"] for q in PAGES):
            raise SystemExit("%s: broken link %s" % (p["slug"], h))
    if not os.path.exists(os.path.join(ROOT, "assets", "img", "svc-%s-960.webp" % p["slug"])): raise SystemExit("missing hero image svc-" + p["slug"])

def main():
    tpl = open(TPL, encoding="utf-8").read()
    for p in PAGES:
        out = build(p, tpl); check(p, out)
        d = os.path.join(ROOT, p["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(out)
        w = len(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[\s\S]*?</\1>", "", out[out.find("<main"):out.find("</main>")])).split())
        print("%-28s %4d words" % (p["slug"], w))

if __name__ == "__main__":
    main()
