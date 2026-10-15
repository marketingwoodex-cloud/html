# P36-B1 round 3: one more practical section per post to clear 900 words on the page.
POSTS = []
UL = lambda items: "<ul>" + "".join("<li>%s</li>" % i for i in items) + "</ul>"
P = lambda *ps: "".join("<p>%s</p>" % x for x in ps)
BRIEF = ("How to prepare for your first design meeting",
  P("A clear brief saves time and leads to better design. Before you meet a designer, gather a few simple things.")
  + UL(["Plans or drawings of the space, or a rough sketch with measurements.", "Photos of the space as it is today.", "Five to ten images of interiors you like, and a few you dislike.", "A list of must-haves and nice-to-haves.", "A realistic budget range and the date you need the space ready."])
  + P('With this in hand, the first meeting moves straight to ideas instead of basic questions. You can <a href="/book-a-visit/">book a site visit or studio meeting</a> online.'))

def S(head, *body): return [(head, "".join(body))]

EXTRA = {}
_E = {
"how-to-choose-interior-designer-lahore": S("Understanding design fees",
  P("Designers in Lahore charge in different ways: a fee per square foot, a fixed design fee, a percentage of the project, or a combined design-and-build quote. None is right or wrong; what matters is knowing exactly what is included.",
    "Ask whether the fee includes 3D views, revisions, working drawings, material selection and site visits. Get it in writing. A lower fee that excludes site supervision can cost more in the end than a complete one.")),
"office-renovation-checklist": S("Planning for growth and flexibility",
  P("Teams change faster than offices. Choose furniture that can be reconfigured, plan spare power and data capacity, and avoid building fixed rooms you may not need in two years.",
    "Glass partitions, movable storage and bookable meeting rooms let one floor adapt as headcount and ways of working change, without another renovation.")),
"small-bathroom-design-ideas": S("Colour, tile size and light",
  P("Light colours and large-format tiles make small bathrooms feel bigger because there are fewer grout lines to break up the surface. Running the same tile from floor to wall makes the room read as one continuous space.",
    "Add a warm light over the mirror and a softer ceiling light. A frameless glass screen instead of a curtain keeps sightlines open and makes the room feel larger.")),
"clinic-interior-design-lahore": [BRIEF],
"apartment-interior-ideas-lahore": S("Lighting a compact home",
  P("Apartments often have daylight from one side only. Keep window areas clear, choose sheer curtains for the day and blackout layers for the night, and use pale, matt finishes that spread light.",
    "In the evening, layer lighting: a few ceiling points, wall lights, under-cabinet strips in the kitchen and a reading lamp. Several soft sources make a small home feel calm and larger than one bright ceiling light.")),
"false-ceiling-ideas-living-room": [BRIEF],
"kitchen-cabinet-materials-pakistan": S("Caring for your cabinets",
  P("Wipe spills quickly, especially near the sink and hob. Use a soft cloth and mild cleaner; strong solvents and scouring pads damage most finishes.",
    "Check hinges and runners once or twice a year and tighten or adjust them. Keep the exhaust running while cooking so grease does not settle on shutters. Small habits like these keep a kitchen looking new for years.")),
"paint-colours-pakistani-homes": [BRIEF],
"upgrade-builder-finished-house-lahore": [BRIEF],
"grey-structure-finishing-lahore": [BRIEF],
"interior-design-trends-pakistan-2027": [BRIEF],
"salon-interior-design-lahore": [BRIEF],
"dha-lahore-house-interior-guide": [BRIEF],
"home-office-design-ideas": [BRIEF],
"wardrobe-vs-dressing-room": [BRIEF],
"office-interior-gulberg-lahore": [BRIEF],
"new-house-interior-checklist-lahore": S("Keeping the project on track",
  P("Agree a written programme with milestones before work starts, and review it at a short weekly site meeting. Record decisions and changes in writing, with any effect on cost or time.",
    "Most delays come from late decisions, not slow work. Choosing tiles, fittings and joinery finishes early is the single best way to keep a new house on schedule.")),
"flooring-options-pakistan": [BRIEF],
"10-marla-house-interior-lahore": [BRIEF],
}

EXTRA.update(_E)
for _k in ["office-renovation-checklist","small-bathroom-design-ideas","how-to-choose-interior-designer-lahore","apartment-interior-ideas-lahore","kitchen-cabinet-materials-pakistan"]:
    if BRIEF not in EXTRA[_k]: EXTRA[_k] = EXTRA[_k] + [BRIEF]
