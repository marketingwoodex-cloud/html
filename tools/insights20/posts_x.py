# P35-D: extra sections that expand the 10 P34 posts (posts_e.py) towards 900+ words.
# Loaded last by build.py (file name sorts after posts_e/f); inserts sections before each post's final section.
POSTS = []

def T(head, rows):
    h = "".join("<th>%s</th>" % c for c in head)
    b = "".join("<tr>" + "".join("<td>%s</td>" % c for c in r) + "</tr>" for r in rows)
    return '<div class="wx-tbl"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (h, b)
UL = lambda items: "<ul>" + "".join("<li>%s</li>" % i for i in items) + "</ul>"

EXTRA = {
"bathroom-renovation-lahore": [
 ("Choosing materials for Lahore bathrooms",
  "<p>Hard water, summer heat and monsoon humidity are tough on bathrooms. Hard water leaves scale on glass and chrome, so choose fittings with a quality finish and plan for easy cleaning. Grout in wet zones should be a stain-resistant type; epoxy grout costs more but stays cleaner for longer.</p>"
  + T(["Surface", "Good choice", "Why"], [["Floor", "Matt porcelain", "Slip resistance, low maintenance"], ["Shower walls", "Large-format porcelain", "Fewer grout lines"], ["Vanity top", "Quartz or solid surface", "Resists stains and heat"], ["Vanity body", "Moisture-resistant board, sealed edges", "Does not swell"], ["Ceiling", "Moisture-resistant gypsum", "Handles steam"]])),
 ("Accessibility and future-proofing",
  "<p>A bathroom renovated today should still work in twenty years. Consider a level or low-threshold shower entry, a grab rail backing fixed inside the wall even if the rail is added later, a comfortable WC height and lever taps. These choices cost little during renovation and help elderly parents, guests and anyone recovering from an injury.</p>"
  "<p>Plan sockets carefully: a shaver point at the mirror, a protected circuit for the geyser, and nothing within reach of the shower.</p>"),
 ("Common mistakes to avoid",
  UL(["Tiling over old, cracked tiles without checking the base.", "Skipping the flood test to save a day.", "Choosing glossy floor tiles that become slippery.", "Placing the exhaust fan where it cannot vent outside.", "Ordering imported fittings after demolition starts.", "Forgetting a niche, so bottles end up on the floor."])
  + "<p>Each of these leads to rework that costs more than doing it right the first time.</p>"),
],
"10-marla-house-interior-lahore": [
 ("Typical 10 marla floor plan, room by room",
  T(["Floor", "Typical rooms", "Design focus"], [["Ground", "Drawing room, dining, kitchen, family lounge, guest bedroom", "Separate formal and family zones"], ["First", "Master suite, two or three bedrooms, small lounge", "Storage, privacy, quiet"], ["Roof", "Laundry, store, terrace or extra room", "Utility and outdoor use"]])
  + "<p>Most 10 marla houses in Lahore follow this pattern with variations. Understanding where guests, family and services meet is the first step in planning a calm interior.</p>"),
 ("Kitchen planning in a 10 marla home",
  "<p>The kitchen is often the hardest-working room. Many families prefer a clean kitchen for light cooking linked to the lounge, and a separate working kitchen for heavy desi cooking. If space allows only one, plan a strong ducted exhaust, tall storage and a durable counter. See <a href=\"/insights/kitchen-layouts-that-work-lahore-homes/\">kitchen layouts that work</a> for options.</p>"),
 ("Bedrooms and children's rooms",
  "<p>Give the master bedroom a built-in wardrobe or small dressing area, blackout curtains and bedside lighting on separate switches. Children's rooms need a study desk with good task light, flexible storage and finishes that can change as they grow. A shared bathroom between two children's rooms saves space if it is planned with two entrances or a vanity outside the WC.</p>"),
],
"office-interior-gulberg-lahore": [
 ("Planning meeting rooms and reception",
  "<p>Reception is a client's first impression: keep it calm, well-lit and close to a meeting room so visitors do not walk through work areas. Size meeting rooms for real use, not the maximum; most meetings involve two to six people, so several small rooms are often more useful than one large boardroom.</p>"
  + UL(["<strong>Reception:</strong> brand wall, seating, clear sightline to the entrance.", "<strong>Small meeting rooms:</strong> screens, acoustic panels, good chairs.", "<strong>Boardroom:</strong> only if used regularly.", "<strong>Pantry:</strong> a social space that keeps food away from desks."])),
 ("Services: power, data and air-conditioning",
  "<p>Plan floor boxes or desk power before carpet goes down, leave space for a small server or network cabinet with ventilation, and check whether the building's central air-conditioning can serve closed meeting rooms. Backup power matters in Lahore; agree which circuits run on UPS or generator.</p>"),
 ("Branding without clutter",
  "<p>Brand colours work best as accents: a reception wall, meeting room names, graphics on glass for privacy. Keep the main palette neutral so the office still feels right if the brand evolves. Plants, timber and good lighting do more for a workplace than large logos.</p>"),
],
"flooring-options-pakistan": [
 ("Installation quality matters as much as material",
  "<p>A good tile badly laid looks worse than an average tile laid well. Ask about base levelling, tile spacing, grout type, and whether large tiles will be back-buttered to avoid hollow spots. For marble, ask how and when it will be polished and sealed. For wood and vinyl, check the underlay and the acclimatisation period.</p>"),
 ("Maintenance by material",
  T(["Material", "Daily care", "Long-term care"], [["Porcelain", "Sweep and mop", "Clean grout occasionally"], ["Marble", "Neutral cleaner, wipe spills fast", "Periodic polishing and sealing"], ["Engineered wood", "Dry mop, avoid standing water", "Refinish surface when worn"], ["Vinyl", "Sweep and damp mop", "Replace damaged planks"]])
  + "<p>Choose a floor whose care you will actually keep up with.</p>"),
 ("Skirting, thresholds and transitions",
  "<p>Details make floors look finished. Plan matching or contrasting skirting, neat thresholds where materials change, and level transitions so there is no trip edge. In open-plan homes, avoid changing material in the middle of a room.</p>"),
],
"paint-colours-pakistani-homes": [
 ("Building a whole-house palette",
  "<p>Pick one main neutral for most walls and ceilings, one or two supporting colours for bedrooms or feature areas, and one accent for doors, joinery or a powder room. Using the same base colour through connected spaces makes a home feel larger and calmer.</p>"
  + T(["Role", "Example", "Where"], [["Main neutral", "Warm white or greige", "Lounges, corridors, ceilings"], ["Supporting", "Soft sage or clay", "Bedrooms, dining"], ["Accent", "Deep green or navy", "Feature wall, joinery, doors"]])),
 ("Exterior colours",
  "<p>Lahore sun fades strong colours outside. Off-whites, warm greys and sandstone tones age best on facades and show less dust. Use weather-resistant exterior paint, and pair it with timber, stone or metal accents rather than many colours.</p>"),
 ("Paint and lighting together",
  "<p>Warm white light flatters warm neutrals; cool light makes them look grey. Choose your lighting colour temperature before final paint, and check samples under the actual bulbs in the evening. Read our <a href=\"/insights/lighting-design-layers-explained/\">lighting guide</a> for more.</p>"),
],
"clinic-interior-design-lahore": [
 ("Waiting areas that reduce stress",
  "<p>Patients often wait anxious and unwell. Comfortable seating with arms, natural light, plants, a calm palette and clear signage lower stress. Separate seating for families or women is valued in many clinics. Keep the reception desk visible from all seats so patients feel noticed.</p>"),
 ("Dental and specialist clinics",
  T(["Clinic type", "Special requirements"], [["Dental", "Chair services, suction, compressor room, sterilisation area"], ["Dermatology and aesthetics", "Treatment rooms with privacy and good lighting"], ["Physiotherapy", "Open floor space, durable floors, changing area"], ["Diagnostic", "Equipment rooms, shielding where required, power supply"]])
  + "<p>Specialist equipment sets many design decisions, so suppliers should be involved early.</p>"),
 ("Branding and patient trust",
  "<p>A clinic's interior signals care and competence. Clean lines, good maintenance, quality lighting and a consistent palette build trust more than decoration. Display certificates and team photos in the waiting area, and keep clinical clutter out of sight.</p>"),
],
"salon-interior-design-lahore": [
 ("Separate areas for women's and men's services",
  "<p>Many salons in Lahore serve women in private areas. Plan clear separation, discreet entrances where needed and privacy screens, so clients feel comfortable. Unisex salons may need separate waiting and treatment zones.</p>"),
 ("Retail display and reception",
  "<p>Product sales add revenue. Place retail shelving near reception where clients pay and wait, with good lighting and space to browse. Keep the reception desk compact but able to handle bookings, payment and product storage.</p>"
  + UL(["Lit shelving at eye level.", "Lockable storage below.", "A small seating area with a view of the stations.", "A photo-friendly brand wall."])),
 ("Staff areas and storage",
  "<p>A salon runs on what clients never see: a colour bar for mixing, a laundry for towels, staff lockers, and storage for stock. Plan these early so they do not take space from stations later. Good ventilation in the colour area protects staff health.</p>"),
],
"grey-structure-finishing-lahore": [
 ("Electrical planning before plaster",
  "<p>Fix every switch, socket, light and AC point on a drawing before conduits are chased. Think about furniture positions, bedside switches, TV walls, kitchen appliances and outdoor lights. Adding points after plaster means cutting walls.</p>"
  + UL(["Dedicated circuits for AC, geysers and kitchen appliances.", "Backup power circuits agreed in advance.", "Data and CCTV cabling run with electrical work.", "Earthing tested before finishing."])),
 ("Plumbing and waterproofing",
  "<p>Pressure-test water lines before covering them, slope drains correctly, and waterproof bathrooms, kitchens, roofs and terraces. Roof waterproofing is especially important in Lahore's monsoon; leaks after finishing are expensive to trace and repair.</p>"),
 ("Choosing finishes in the right order",
  T(["Decide early", "Can wait"], [["Floor tiles and stone", "Paint colours"], ["Kitchen layout and appliances", "Curtains and blinds"], ["Bathroom fittings", "Loose furniture"], ["Ceiling design and lighting points", "Décor and art"]])
  + "<p>Early decisions affect services and levels; later ones can follow the finish.</p>"),
],
"home-office-design-ideas": [
 ("Ergonomics checklist",
  T(["Item", "Aim"], [["Screen", "Top at eye level, about arm's length away"], ["Chair", "Feet flat, knees about hip height, back supported"], ["Desk", "Elbows near 90 degrees when typing"], ["Laptop", "Use a stand with separate keyboard and mouse"], ["Breaks", "Stand and move regularly"]])
  + "<p>A few small adjustments prevent back and neck pain over long working days.</p>"),
 ("Power, internet and backup",
  "<p>Load-shedding and weak Wi-Fi make remote work hard. Place the desk near the router or run a cable, consider a mesh system for larger homes, and connect the router, modem and laptop to a UPS. Plan enough sockets at desk height so cables do not trail across the floor.</p>"),
 ("Home office for two",
  "<p>If two people work from home, give each a separate zone where calls will not clash. A long shared desk works for focused work, but calls need a door or distance. Acoustic panels and a rug between desks help.</p>"),
],
"interior-design-trends-pakistan-2027": [
 ("Kitchens and bathrooms in 2027",
  "<p>Kitchens are moving to handleless or slim-profile cabinets, two-tone finishes, quartz tops and integrated appliances. Separate working kitchens remain popular for desi cooking. Bathrooms favour large-format tiles, wall-hung fittings, warm wood vanities and backlit mirrors.</p>"),
 ("Sustainability and local craft",
  "<p>Homeowners increasingly want lower energy bills and longer-lasting interiors. That means solar-ready wiring, LED lighting, better insulation and durable materials that do not need replacing. Local crafts such as carved wood, terracotta and handloom textiles are being used in modern ways, which supports artisans and gives homes a sense of place.</p>"),
 ("Furniture and layout",
  T(["Trend", "What it looks like"], [["Curved furniture", "Rounded sofas, arched mirrors and doorways"], ["Built-ins", "Storage walls, window seats, integrated desks"], ["Flexible rooms", "Guest rooms that double as studies"], ["Outdoor living", "Terraces and lawns furnished as rooms"]])
  + "<p>The common thread is comfort and practicality over show.</p>"),
],
}
