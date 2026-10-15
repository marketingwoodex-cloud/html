# P36-B1: second round of extra sections so the 20 P34/P35 posts pass ~900 words on the page.
# Loaded after posts_x (file name sort); build.py inserts these before each post's final section.
POSTS = []

def T(head, rows):
    h = "".join("<th>%s</th>" % c for c in head)
    b = "".join("<tr>" + "".join("<td>%s</td>" % c for c in r) + "</tr>" for r in rows)
    return '<div class="wx-tbl"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (h, b)
UL = lambda items: "<ul>" + "".join("<li>%s</li>" % i for i in items) + "</ul>"
OL = lambda items: "<ol>" + "".join("<li>%s</li>" % i for i in items) + "</ol>"
P = lambda *ps: "".join("<p>%s</p>" % x for x in ps)

EXTRA = {
"new-house-interior-checklist-lahore": [
 ("Stage 1: grey structure decisions",
  P("The cheapest time to get an interior right is before plaster. Once walls are finished, every change means chasing, patching and repainting.",
    "Walk the grey structure with your designer and mark furniture positions on the floor in chalk. Check that the bed wall has no window, that the TV wall is not opposite the main glazing, and that the kitchen has room for a fridge, oven and tall storage.")
  + UL(["Fix the electrical layout room by room: sockets, switches, data points and lighting circuits.", "Fix plumbing points for kitchens, bathrooms, laundry and any water filter.", "Mark AC indoor and outdoor positions and drain routes.", "Agree ceiling heights before ducting and false ceilings are framed.", "Plan conduit for CCTV, Wi-Fi access points and a solar or inverter connection."])),
 ("Stage 2: finishes and joinery",
  P("With services fixed, finishes can be chosen in a sensible order: floors first, then wall finishes, then joinery, then paint. Floors affect door heights and skirting, so they should be confirmed early.",
    "Joinery such as kitchens, wardrobes and TV units needs accurate site measurements taken after plaster and before final paint. Ask for shop drawings and approve them before anything is made.")
  + T(["Item", "Decide by", "Why it matters"], [["Floor tiles or stone", "Before plaster ends", "Sets levels, thresholds and door heights"], ["Bathroom sanitaryware", "Before plumbing first fix", "Concealed cisterns and mixers need exact points"], ["Kitchen layout", "Before electrical first fix", "Sockets and hob points follow the layout"], ["Wardrobe design", "After plaster", "Needs final wall measurements"], ["Paint colours", "After joinery is fitted", "Colours read differently next to wood"]])),
 ("Stage 3: before you move in",
  P("Plan a snagging walk-through with a written list. Check every switch, socket, tap, drain and door. Run the showers and check for leaks under basins. Open every cabinet and drawer.",
    "Keep a home file with manuals and purchase records from appliance and fitting suppliers, paint codes, tile batch numbers and spare tiles. These small records save real trouble later, when a tile cracks or a wall needs touching up.",
    'If you want one team to coordinate the whole sequence, see our <a href="/turnkey-design-build/">turnkey design and build</a> service or <a href="/book-a-visit/">book a site visit</a>.')),
],
"apartment-interior-ideas-lahore": [
 ("Plan around the fixed points",
  P("Apartments limit what you can move. Structural walls, shafts, kitchen stacks and bathroom drains are usually fixed by the building, and many towers have rules about what owners may change.",
    "Start by asking the building management for the approved plan and the fit-out rules. Then plan the interior around what is fixed, rather than fighting it.")
  + UL(["Keep wet areas where the drains already are.", "Use partitions and joinery, not new masonry, to change layouts.", "Check whether the facade, balcony glazing and AC positions are controlled by the building.", "Confirm working hours and lift booking for deliveries before work starts."])),
 ("Making a small apartment feel larger",
  P("Light, continuity and storage do most of the work. Use one floor finish throughout so the plan reads as one space. Keep the colour palette tight, with one or two accent materials.",
    "Built-in storage is worth more than freestanding furniture in an apartment. A full-height wardrobe wall, a storage bench under the window and a TV unit with closed cabinets keep surfaces clear.")
  + T(["Idea", "Effect"], [["Floor-to-ceiling curtains", "Makes ceilings feel higher"], ["Mirrors opposite windows", "Bounces daylight deeper into the room"], ["Wall-mounted lighting", "Frees floor and table space"], ["Sliding or pocket doors", "Saves the swing area of a hinged door"], ["Fold-down desk", "A home office that disappears after work"]])),
 ("Rented or owned: what changes",
  P("If you rent, focus on items you can take with you: lighting, rugs, curtains, loose furniture and freestanding storage. Agree any paint or fixture changes with the landlord in writing.",
    'If you own, built-in joinery, a better kitchen and upgraded bathrooms add lasting value. See our <a href="/apartment-interior-design/">apartment interior design</a> service for how we plan these projects.')),
],
"office-renovation-checklist": [
 ("Before design starts",
  UL(["Read the lease: what the landlord allows, and what must be restored when you leave.", "Get the building's fit-out guide, including working hours and fire rules.", "Count staff today and the number you expect in two to three years.", "List how teams actually work: focus, calls, meetings and collaboration.", "Audit IT: server or comms room, cabling, Wi-Fi coverage and power backup."])
  + P("These answers shape the brief. An office planned for today's headcount alone is often too small within a year.")),
 ("During the works",
  P("Office renovations usually happen around a running business, so phasing matters. Decide whether the team will move out, work from home or stay on site while areas are completed one by one.",
    "Keep a single point of contact on each side. Weekly site meetings with a short written update avoid most misunderstandings.")
  + T(["Risk", "How to manage it"], [["Noise during work hours", "Schedule demolition and drilling after hours"], ["IT downtime", "Plan the cabling switch-over for a weekend"], ["Late furniture", "Order long-lead items as soon as the design is approved"], ["Fire approvals", "Involve the building's safety team early"]])),
 ("Handover and moving in",
  P("Before staff move in, test every power point, data point and light, the AC in each zone, the access control and the fire alarm. Check acoustic performance in meeting rooms with a real call.",
    'Plan the move itself: label desks, set up IT the day before, and brief staff on the new layout. See our <a href="/office-renovation/">office renovation</a> service for how we run these projects.')),
],
"small-bathroom-design-ideas": [
 ("Layouts that work in small bathrooms",
  P("In a small bathroom, every centimetre counts. The best layouts keep the WC and basin on one wall and the shower at the far end, so the door can open without hitting anything.")
  + T(["Bathroom size", "Layout idea"], [["Very small (under 3.5 sq m)", "Wet room with a floor drain and a glass screen"], ["Narrow and long", "Basin and WC on one side, shower at the end"], ["Square", "Corner shower with a sliding or pivot glass door"], ["Shared family bath", "Separate the WC with a partition if space allows"]])
  + P("Wall-hung WCs and vanities clear the floor, make cleaning easier and make the room feel larger.")),
 ("Storage without clutter",
  P("Small bathrooms fill up quickly with bottles and towels. Plan storage at design stage, not after.")
  + UL(["A recessed niche in the shower wall for toiletries.", "A mirror cabinet over the basin instead of a flat mirror.", "A tall, slim cabinet beside the vanity for towels.", "Hooks behind the door instead of a towel rail.", "Drawers in the vanity rather than doors, so nothing gets lost at the back."])),
 ("Ventilation and moisture",
  P("Lahore summers are humid during the monsoon, and small bathrooms suffer most. Without good ventilation, paint peels, grout darkens and mould appears within months.",
    'Fit an exhaust fan that vents to the outside, not into the false ceiling. Use moisture-resistant paint on any painted surface, and keep timber finishes away from the shower zone. See our <a href="/bathroom-design/">bathroom design</a> service.')),
],
"kitchen-cabinet-materials-pakistan": [
 ("Carcass, shutter and hardware: three separate choices",
  P("A kitchen cabinet is three things: the carcass (the box), the shutter (the door or drawer front) and the hardware (hinges, runners and lift systems). Each can be chosen separately, and the carcass and hardware matter most for how long the kitchen lasts.")
  + T(["Part", "What to look for"], [["Carcass", "Moisture-resistant board, sealed edges, especially under the sink"], ["Shutter", "Finish that suits your cooking and cleaning habits"], ["Hinges", "Soft-close, adjustable, rated for frequent use"], ["Drawer runners", "Full-extension, soft-close, load-rated"], ["Counter", "Heat and stain resistance near the hob"]])),
 ("Matching materials to how you cook",
  P("Pakistani kitchens see heavy cooking: high heat, oil, steam and frequent cleaning. Matt finishes hide fingerprints but can hold grease; gloss finishes wipe clean but show scratches.",
    "Near the hob, choose surfaces that tolerate heat and frequent scrubbing. Under the sink, moisture resistance matters more than anything else. Many families choose a tougher finish for the working kitchen and a more decorative one for a clean kitchen linked to the lounge.")),
 ("Questions to ask before you order",
  OL(["Which board is used for the carcass, and is it moisture-resistant?", "Are all exposed edges sealed with edge banding?", "Which hinge and runner brands are included?", "Is the sink cabinet lined or protected?", "What maintenance does the shutter finish need?"])
  + P('Clear answers make quotes easier to compare. See our <a href="/kitchen-design/">kitchen design</a> service for how we plan and specify kitchens.')),
],
"how-to-choose-interior-designer-lahore": [
 ("Questions to ask in the first meeting",
  OL(["Can I see projects similar to mine in size and type?", "Who will design my project, and who will manage it on site?", "Will I see 3D views before work starts?", "How are quotes prepared: itemised, or one lump sum?", "How do you handle changes during the project?", "What does your design fee include?"])
  + P("Good designers answer clearly and in writing. Vague answers at the start usually become disputes later.")),
 ("Red flags to watch for",
  UL(["A price given before anyone has seen the site.", "No written scope or drawings, only verbal promises.", "Pressure to pay a large advance immediately.", "No clear contact person for site issues.", "A portfolio made only of stock images or renders with no real detail."])
  + P("None of these alone means a designer is bad, but two or three together should make you cautious.")),
 ("Design only, or design and build?",
  P("Some clients hire a designer for drawings and 3D views, then manage contractors themselves. Others want one team to design, coordinate and deliver.",
    'Design only gives you more control and can suit clients with time and site experience. Design and build gives you one point of responsibility. See our <a href="/services/">full list of services</a> to compare options.')),
],
"false-ceiling-ideas-living-room": [
 ("Choosing the right ceiling material",
  T(["Material", "Strengths", "Watch out for"], [["Gypsum board", "Smooth, seamless finish, easy to shape", "Needs dry conditions and good joint finishing"], ["Cement board", "Better for damp or semi-outdoor areas", "Heavier, joints show more easily"], ["Wood or veneer panels", "Warmth and texture", "Needs protection from moisture"], ["Stretch ceiling", "Fast, can hide uneven slabs", "Limited on cut-outs and heavy fixtures"]])
  + P("For most living rooms in Lahore, gypsum board is the practical choice, with wood used as an accent strip or panel.")),
 ("Lighting the ceiling properly",
  P("A false ceiling is mostly a way to hide and organise light. Plan three layers: ambient light from cove or recessed fittings, task light for reading, and accent light for art or a feature wall.",
    "Use warm white light (around 2700K to 3000K) in living rooms. Put each layer on its own switch or dimmer, so the room can feel bright for guests and soft in the evening.")),
 ("Height, drops and practical details",
  UL(["Keep the main ceiling as high as possible; drop only the edges where ducts or lights need space.", "Leave access panels for AC units, junctions and drainage lines.", "Coordinate with the AC installer before framing starts.", "Avoid heavy decorative tiers in rooms with low slabs."])
  + P('See our <a href="/false-ceiling-design/">false ceiling design</a> service for layouts and options.')),
],
"upgrade-builder-finished-house-lahore": [
 ("What to keep and what to change",
  P("Builder-finished houses often have good structure but generic finishes. Before replacing everything, check what is worth keeping.")
  + T(["Element", "Usually keep", "Often upgrade"], [["Structure and plumbing", "Yes, if tested", "Only where leaks or poor pressure show"], ["Floors", "If tiles are sound and level", "Living areas where the look matters most"], ["Kitchen", "Carcass if solid", "Shutters, counter, hardware, lighting"], ["Bathrooms", "Layout if it works", "Fittings, vanity, lighting, ventilation"], ["Lighting", "Rarely", "Most rooms benefit from a layered plan"]])),
 ("Inspecting before you design",
  UL(["Run every tap and shower and check under basins for leaks.", "Look for damp patches near bathrooms and on roof-level ceilings.", "Test every socket and switch, and check the distribution board labels.", "Check door and window alignment and hardware.", "Ask the builder for as-built drawings and appliance manuals."])
  + P("Fixing hidden problems first avoids damaging new finishes later.")),
 ("Where upgrades make the biggest difference",
  P("Lighting, joinery and soft furnishings change a builder-finished house more than anything else. A layered lighting plan, built-in wardrobes and a proper TV wall turn generic rooms into a home.",
    'See our guide to <a href="/insights/house-renovation-timeline-lahore/">renovation timelines</a> and our <a href="/complete-home-redesign/">complete home redesign</a> service.')),
],
"wardrobe-vs-dressing-room": [
 ("Space you need for each",
  T(["Option", "Minimum practical space", "Best for"], [["Built-in wardrobe", "About 60 cm depth plus door swing or sliding clearance", "Most bedrooms"], ["Walk-in wardrobe", "A strip at least 1.2 m wide with storage on one side", "Larger master bedrooms"], ["Full dressing room", "A separate room or alcove with storage on two or three sides", "Master suites in kanal houses"]])
  + P("If the space is tight, a well-planned built-in wardrobe almost always beats a cramped dressing room.")),
 ("Inside matters more than outside",
  P("Whichever you choose, the internal layout decides how useful it is. Plan hanging space for long and short clothes, drawers for folded items, shoe storage, and a high shelf for suitcases.")
  + UL(["Lighting inside the wardrobe, switched by the door.", "A full-length mirror on a door or wall.", "Pull-out trays for accessories and jewellery.", "Ventilation, especially in rooms against an external wall."])),
 ("Making the decision",
  P('Consider how you dress, how much you own and how the bedroom will be used in ten years. See our <a href="/wardrobe-design/">wardrobe design</a> and <a href="/dressing-room-design/">dressing room design</a> services.')),
],
"interior-design-trends-pakistan-2027": [
 ("Trends that last, and trends that date quickly",
  T(["Lasting", "Dates quickly"], [["Warm wood and natural stone", "Heavy gloss everywhere"], ["Layered, warm lighting", "Single bright ceiling panels"], ["Built-in storage", "Overly busy feature walls"], ["Soft, earthy colours", "Very strong trend colours on every wall"]])
  + P("A good rule: put trends into items that are easy to change, such as cushions, art and paint, and keep long-lasting materials for floors and joinery.")),
 ("Designing for Pakistan's climate",
  P("Heat, dust and monsoon humidity should guide material choices more than any trend. Matt porcelain, sealed stone, quality paint and moisture-resistant joinery stay looking good longer.",
    'Shading, cross-ventilation and insulated roofs make homes more comfortable and reduce cooling costs. See our guide to <a href="/insights/materials-that-survive-lahore-climate/">materials that survive Lahore\'s climate</a>.')),
],
"home-office-design-ideas": [
 ("Acoustics and video calls",
  P("Many people now spend hours on calls from home. Hard surfaces echo, so add a rug, curtains, upholstered seating and a bookcase to absorb sound.",
    "Face the desk towards a wall or window rather than away from a door. Place a soft light in front of you, not behind, so your face is clear on camera.")),
 ("Cables, power and connectivity",
  UL(["Plan sockets at desk height, not just at the skirting.", "Add a data point or place the Wi-Fi router nearby.", "Include a cable tray or grommet under the desk.", "Put the inverter or UPS connection on the desk circuit."])
  + P('See our <a href="/residential-home-office-design/">home office design</a> service.')),
],
"dha-lahore-house-interior-guide": [
 ("Common DHA house types",
  T(["Plot", "Typical interior focus"], [["5 and 10 marla", "Efficient planning, storage, a clean kitchen linked to the lounge"], ["1 kanal", "Formal and family zones, master suite, separate working kitchen"], ["2 kanal", "Entertaining spaces, dressing rooms, staff areas"]])
  + P('See our <a href="/lahore/dha/">DHA Lahore</a> page for how we work in the area.')),
 ("Society rules and practical points",
  UL(["Check society rules on working hours and material deliveries.", "Plan parking for contractor vehicles to avoid disputes with neighbours.", "Confirm any approval needed for elevation or boundary changes.", "Keep the site clean and secure; many DHA streets are quiet residential lanes."])),
],
"salon-interior-design-lahore": [
 ("Lighting that flatters and works",
  P("Lighting matters more in a salon than almost anywhere else. Stylists need even light without shadows at each station; clients want to see themselves in a flattering light.",
    "Use high colour rendering lamps at mirrors, and warmer, softer light in waiting and treatment areas.")),
 ("Plumbing, power and hygiene",
  UL(["Plan wash-basin positions early; drains are hard to move later.", "Give each station enough sockets for dryers and tools.", "Choose washable surfaces near basins and colour stations.", "Plan a separate area for laundry and storage."])
  + P('See our <a href="/beauty-salon-design/">beauty salon design</a> service.')),
],
"grey-structure-finishing-lahore": [
 ("Inspecting the grey structure",
  UL(["Check walls for plumb and corners for square.", "Look for honeycombing or cracks in columns and slabs.", "Confirm slab levels before floor screed.", "Check that door and window openings match the drawings."])
  + P("Problems found now are far cheaper to fix than after finishing.")),
 ("Order of finishing work",
  OL(["Electrical and plumbing first fix", "Plaster", "Floor screed and waterproofing in wet areas", "Flooring", "False ceilings", "Joinery and fittings", "Paint and final fix"])),
],
"clinic-interior-design-lahore": [
 ("Infection control by design",
  P("Clinics need surfaces that can be cleaned often with strong products. Choose seamless or easy-clean flooring, coved skirting where possible, and wipeable wall finishes in treatment rooms.",
    'Plan hand-wash basins in each treatment room. See our <a href="/healthcare-fit-out/">healthcare fit out</a> service.')),
],
"paint-colours-pakistani-homes": [
 ("How light changes colour",
  P("North-facing rooms get cooler, softer light; south and west rooms get strong, warm sun. The same paint can look very different in each. Always test a large sample on two walls and check it morning and evening.")),
],
"flooring-options-pakistan": [
 ("Questions to ask your supplier",
  OL(["Is the tile rated for floor use and the right slip resistance?", "Are all boxes from the same batch?", "What spare quantity should I keep?", "What adhesive and grout do you recommend?"])),
],
}
