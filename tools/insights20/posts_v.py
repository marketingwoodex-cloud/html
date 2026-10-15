# P36-B2: extra sections for the 20 original generator posts (posts_a..d) to pass ~900 words.
# No prices, offers or promises here (Phase E claims are still pending owner approval).
POSTS = []
def T(head, rows):
    h = "".join("<th>%s</th>" % c for c in head)
    b = "".join("<tr>" + "".join("<td>%s</td>" % c for c in r) + "</tr>" for r in rows)
    return '<div class="wx-tbl"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (h, b)
UL = lambda items: "<ul>" + "".join("<li>%s</li>" % i for i in items) + "</ul>"
OL = lambda items: "<ol>" + "".join("<li>%s</li>" % i for i in items) + "</ol>"
P = lambda *ps: "".join("<p>%s</p>" % x for x in ps)

QUOTE = ("How to compare quotes fairly",
  P("Two quotes for the same project can look very different. Before comparing totals, make sure both cover the same scope, materials and finishes.")
  + UL(["Ask for an itemised quote, not one lump sum.", "Check brands and grades of boards, hardware, tiles and fittings.", "Confirm what is excluded: civil work, electrical, AC, furniture, taxes.", "Ask how changes during the project are priced and approved.", "Check the payment schedule against delivery milestones."])
  + P("A lower total that leaves out key items often ends up costing more."))
BUDGET = ("Where to spend and where to save",
  T(["Spend more on", "Save on"], [["Hidden work: wiring, plumbing, waterproofing", "Decorative accessories you can add later"], ["Hardware that moves every day: hinges, runners, locks", "Loose furniture in rooms used rarely"], ["Surfaces that take wear: kitchen counters, floors", "Feature finishes in low-traffic areas"], ["Good lighting design", "Trend items likely to date quickly"]])
  + P("Hidden work is the hardest and most expensive to fix later, so it deserves the budget first."))

EXTRA = {
"lighting-design-layers-explained": [
 ("Colour temperature and colour rendering",
  P("Colour temperature, measured in kelvin, describes how warm or cool light looks. Warm white (2700K to 3000K) suits living rooms and bedrooms. Neutral white (3500K to 4000K) suits kitchens, bathrooms and offices where you need to see clearly.",
    "Colour rendering (CRI) describes how true colours look under the light. Choose CRI 90 or higher wherever skin tones, food or fabrics matter, such as dressing areas, kitchens and dining rooms.")),
 ("Switching and control",
  P("Good lighting is as much about control as fittings. Put each layer on its own switch, so ambient, task and accent light can be used separately. Add dimmers in living and dining rooms.",
    "Two-way switches at both ends of corridors and stairs, and bedside switches for the main light, are small details that make a home much easier to live in.")),
 ("Room-by-room starting points",
  T(["Room", "Ambient", "Task", "Accent"], [["Living room", "Cove or recessed lights", "Reading lamp", "Art or feature wall light"], ["Kitchen", "Ceiling lights", "Under-cabinet strips", "Glass cabinet lights"], ["Bedroom", "Soft ceiling light", "Bedside lamps", "Headboard wash"], ["Bathroom", "Ceiling light rated for wet areas", "Mirror light", "Niche light"]])),
],
"apartment-small-space-planning-lahore": [
 ("Zoning one open space",
  P("In a small apartment, the lounge, dining and kitchen often share one room. Zoning makes each area feel intentional without walls.",
    "Use a rug to define the seating area, a pendant light over the dining table, and a change of floor or wall finish at the kitchen. An open shelving unit can screen the entrance while still letting light through.")),
 ("Furniture that works harder",
  UL(["A bed with lift-up storage underneath.", "An extendable dining table for guests.", "Nesting side tables that tuck away.", "A sofa bed for occasional overnight guests.", "Wall-mounted shelves instead of floor-standing cabinets."])
  + P("Choose fewer, better pieces sized to the room. Oversized furniture is the most common reason small apartments feel cramped.")),
 ("Common small-space mistakes",
  UL(["Dark colours on every wall.", "Too many small decorative items.", "Heavy curtains that block daylight.", "Furniture pushed against every wall, leaving a dead centre.", "One bright ceiling light instead of several softer sources."])),
],
"false-ceiling-cost-lahore-2026": [
 ("What affects the final figure",
  UL(["Room area and ceiling height.", "Design complexity: flat, single drop or multi-level.", "Board type: standard, moisture-resistant or fire-rated.", "Number of light cut-outs, cove lines and access panels.", "Finishing: jointing, primer and paint quality."])
  + P("Lighting fixtures and electrical work are often quoted separately, so check what each quote includes.")),
 ("Signs of good workmanship",
  UL(["Straight, level lines with no visible dips.", "Joints taped and finished so they do not crack later.", "Framing fixed securely to the slab at proper spacing.", "Access panels placed where AC units and junctions need servicing.", "Clean, sharp edges around lights and coves."])),
 QUOTE,
],
"materials-that-survive-lahore-climate": [
 ("Monsoon-proofing your interior",
  P("July and August bring heavy rain and high humidity. Damp rises through walls, timber swells and paint blisters where moisture is trapped.",
    "Check roof waterproofing and external wall sealing before interior work. Inside, choose moisture-resistant boards for kitchen and bathroom cabinets, leave a small gap behind wardrobes on external walls, and use breathable paints on walls prone to damp.")),
 ("Dust and daily cleaning",
  P("Lahore's dust is constant. Textured and open-grain surfaces trap it; smooth, sealed finishes wipe clean quickly.",
    "Choose matt porcelain over unsealed stone in busy areas, closed cabinets over open shelving, and fabrics that can be removed and washed. Good door and window seals do more to keep dust out than any finish.")),
 ("Heat and sunlight",
  UL(["Use UV-protective film or curtains on west-facing glass.", "Avoid dark flooring in sunny rooms; it heats up.", "Choose fabrics with good light-fastness to resist fading.", "Insulate the roof slab where possible; it cools the whole top floor."])),
],
"3d-interior-design-cost-pakistan": [
 ("What a good 3D package includes",
  UL(["Accurate room dimensions taken from site measurements.", "Realistic materials, colours and lighting.", "Several camera views per room.", "A set number of revision rounds.", "Material references so the 3D can be built."])
  + P("A beautiful render that cannot be built is not useful. The best 3D views are linked to real materials and drawings.")),
 ("How to give useful feedback on 3D views",
  OL(["Look at the overall layout first, then colours, then details.", "Collect all comments for one round in a single message.", "Use reference images to explain what you mean.", "Ask for a material board alongside the render.", "Approve each room in writing before work starts."])),
 QUOTE,
],
"wardrobe-design-cost-pakistan-2026": [
 ("Hinged, sliding or open?",
  T(["Type", "Best for", "Watch out for"], [["Hinged doors", "Most rooms, full access to the inside", "Needs clear space in front for the swing"], ["Sliding doors", "Tight rooms", "Only half the wardrobe is open at once"], ["Open wardrobe", "Dressing rooms", "Dust, and everything is on show"]])),
 ("Inside layout checklist",
  UL(["Long hanging for dresses and shalwar kameez.", "Double hanging for shirts and trousers.", "Drawers for folded clothes and accessories.", "Shoe racks or pull-outs.", "A locker or safe compartment.", "A top shelf for luggage and seasonal items."])),
 BUDGET,
],
"kitchen-renovation-cost-lahore": [
 ("Keep the layout or change it?",
  P("Keeping sinks, hobs and appliances where they are saves the most money and time, because plumbing, gas and electrical points stay in place.",
    "Changing the layout makes sense when the current kitchen genuinely does not work, for example when there is no space for a fridge or the working triangle is broken. In that case, plan all services before anything is ordered.")),
 ("Renovation sequence",
  OL(["Design and measurement", "Strip out the old kitchen", "Electrical, plumbing and gas changes", "Wall and floor repairs or new tiles", "Cabinet installation", "Counter template, then counter fitting", "Backsplash, appliances and final fix"])),
 QUOTE,
],
"5-marla-house-renovation-cost-lahore": [
 ("Making a 5 marla house feel bigger",
  P("Five marla houses are compact, so renovation should focus on light, flow and storage. Open the kitchen to the lounge where the structure allows, use one floor finish throughout the ground floor, and build storage into stairs and wall recesses.",
    "Light colours, large mirrors and fewer, well-sized furniture pieces make rooms feel more generous.")),
 ("Renovating in phases",
  P("Many families renovate a 5 marla house while living in it. Phasing lets you spread cost and disruption.")
  + OL(["Fix leaks, damp and electrical faults first.", "Renovate the kitchen and bathrooms.", "Upgrade floors and lighting room by room.", "Add joinery and finishes last."])),
 BUDGET,
],
"office-layout-mistakes-productivity": [
 ("Getting the mix of spaces right",
  T(["Space", "Purpose"], [["Open desks", "Day-to-day work and quick collaboration"], ["Focus rooms or booths", "Calls and concentrated work"], ["Meeting rooms", "Planned discussions and client meetings"], ["Breakout area", "Breaks, informal chats and lunch"], ["Storage", "Files, equipment and personal items"]])
  + P("Most productivity complaints come from a missing space type, usually quiet rooms for calls.")),
 ("Light, air and comfort",
  UL(["Place desks near daylight, at right angles to windows to avoid glare.", "Provide fresh air, not only recirculated AC.", "Keep temperature even across zones.", "Use acoustic panels and soft finishes to reduce noise."])),
 ("Planning for hybrid work",
  P("If staff work from home some days, not everyone needs a fixed desk. Shared desks, more meeting space and good video-call rooms often serve a hybrid team better than rows of empty workstations.")),
],
"restaurant-cafe-interior-cost-lahore": [
 ("Front of house and back of house",
  P("A restaurant has two parts: the dining space guests see, and the kitchen, storage and staff areas they do not. Both affect cost, and the back of house often needs more investment than owners expect.",
    "Kitchen exhaust, gas lines, drainage, grease traps and cold storage are essential. Plan them first, then design the dining room around the result.")),
 ("Design choices that affect running costs",
  UL(["Durable, easy-clean surfaces reduce maintenance.", "Efficient lighting reduces electricity bills.", "A layout with short service routes saves staff time.", "Good acoustics keep guests longer and more comfortable."])),
 QUOTE,
],
"dha-vs-bahria-town-interior-cost-lahore": [
 ("Practical differences on site",
  T(["Point", "What to check"], [["Working hours", "Each society sets its own rules for contractors"], ["Deliveries", "Gate passes and vehicle access for materials"], ["Approvals", "Any change to elevation or boundary walls"], ["Distance", "Travel time for site teams and suppliers"]])
  + P('See our area pages for <a href="/lahore/dha/">DHA</a> and <a href="/lahore/bahria-town/">Bahria Town</a>.')),
 BUDGET,
],
"architect-fee-lahore-2026": [
 ("What an architect delivers",
  OL(["Brief and site analysis", "Concept design and massing", "Design development and 3D views", "Drawings for society or authority approval", "Working drawings for construction", "Site visits during construction"])
  + P("Check which of these stages are included in a fee proposal.")),
 ("Questions to ask before appointing",
  UL(["Who will lead my project day to day?", "How many design options and revisions are included?", "Do you prepare approval drawings and handle submissions?", "How often will you visit the site?", "Do you coordinate structural and MEP engineers?"])),
],
"interior-designer-vs-contractor-lahore": [
 ("When a contractor alone is enough",
  P("For simple, like-for-like work such as repainting, replacing tiles or fixing a leak, a reliable contractor is often all you need. The decisions are small and the scope is clear.")),
 ("When you need a designer",
  P("When rooms need replanning, finishes need to work together, or several trades must be coordinated, a designer adds real value. Design mistakes are much cheaper to fix on paper than on site.")
  + UL(["New layouts or open-plan changes.", "Kitchens, wardrobes and built-in joinery.", "Lighting plans and false ceilings.", "Whole-house or commercial projects."])),
],
"kitchen-layouts-that-work-lahore-homes": [
 ("Clearances that make a kitchen comfortable",
  T(["Space", "Comfortable minimum"], [["Walkway between counters", "About 1 m for one cook, 1.2 m for two"], ["Counter beside the hob", "At least 40 cm on each side"], ["Counter beside the sink", "Space to put dishes down on both sides"], ["Fridge door", "Room to open fully without blocking the walkway"]])),
 ("Clean kitchen and working kitchen",
  P("Many Lahore homes have two kitchens: a clean kitchen for light cooking linked to the lounge, and a working kitchen for heavy desi cooking. Plan strong exhaust and durable surfaces in the working kitchen, and a more refined finish in the clean kitchen.")),
],
"house-renovation-timeline-lahore": [
 ("What causes delays",
  UL(["Late decisions on tiles, fittings and finishes.", "Hidden damage found after demolition.", "Long-lead imported items ordered late.", "Changes to the design once work has started.", "Weather, especially monsoon rain for external work."])
  + P("Decide early, order early and keep changes to a minimum.")),
 ("Living in the house during renovation",
  P("If you stay at home, plan which rooms will be out of use and when. Keep one bathroom and a basic kitchen working, and seal off work areas with dust sheets. Moving out for the noisiest phases, usually demolition and tiling, makes life much easier.")),
],
"1-kanal-house-interior-cost-lahore": [
 ("Room-by-room priorities",
  T(["Area", "Focus"], [["Drawing and dining", "Formal finishes, lighting, guest comfort"], ["Family lounge", "Comfort, media wall, durable fabrics"], ["Kitchens", "Clean and working kitchen, storage, exhaust"], ["Master suite", "Wardrobes or dressing room, bathroom, lighting"], ["Children's rooms", "Study space, flexible storage"]])),
 ("Planning in phases",
  P("A 1 kanal interior is a large project. Many families complete the main living areas and bedrooms first, then add feature finishes and furniture over time. A complete design upfront keeps later phases consistent.")),
],
"interior-designer-cost-lahore-2026": [
 ("What you should receive for a design fee",
  UL(["Measured layout plans.", "3D views of key rooms.", "A material and finish schedule.", "Lighting and electrical layouts.", "Joinery drawings for kitchens and wardrobes.", "Site visits during execution, if included."])),
],
"modular-kitchen-price-pakistan-2026": [
 ("Hardware worth paying for",
  UL(["Soft-close hinges on every door.", "Full-extension drawer runners.", "Corner pull-outs or carousels.", "Lift-up systems for wall cabinets.", "A tall pantry pull-out."])
  + P("Hardware is used thousands of times a year. It is the last place to cut cost.")),
],
"office-fit-out-cost-pakistan-2026": [
 ("Fit-out categories explained",
  T(["Category", "Includes"], [["Shell and core", "Basic building provided by the landlord"], ["Category A", "Ceilings, lighting, AC distribution, raised floors"], ["Category B", "Partitions, finishes, furniture, IT, branding"]])
  + P("Knowing what the landlord provides helps you plan the scope and compare quotes accurately.")),
],
}
