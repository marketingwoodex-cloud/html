# P36-B2 round 3: a closing "next steps" section tailored to each original post.
POSTS = []
P = lambda *ps: "".join("<p>%s</p>" % x for x in ps)
def N(topic, link, label, extra):
    return [("Next steps", P(
        "If you are planning %s, start by writing down what you want to change, what must stay and the date you need the space ready. Take photos of the space as it is today and collect a few images of interiors you like." % topic,
        extra,
        'When you are ready, see our <a href="%s">%s</a> page or <a href="/book-a-visit/">book a site visit or studio meeting</a>. A designer can review your space, talk through options and prepare a written, itemised quote.' % (link, label)))]

EXTRA = {
"apartment-small-space-planning-lahore": N("a small apartment", "/apartment-interior-design/", "apartment interior design", "Measure every room, including window positions and ceiling height, and note where sockets, drains and AC units are. These fixed points shape the plan."),
"architect-fee-lahore-2026": N("a new house or major addition", "/architecture/", "architecture", "Gather your plot documents, society rules and any survey of the site. Note how many bedrooms, living spaces and parking places you need, now and in ten years."),
"materials-that-survive-lahore-climate": N("new finishes", "/interior-design/", "interior design", "Note which rooms get strong afternoon sun, which walls show damp, and where dust collects. These observations help choose the right material for each space."),
"interior-designer-vs-contractor-lahore": N("a renovation or new interior", "/services/", "services", "Decide how involved you want to be. If you have little time for site visits and supplier meetings, one coordinated team is usually the calmer option."),
"lighting-design-layers-explained": N("new lighting", "/false-ceiling-design/", "false ceiling and lighting design", "Walk through each room in the evening and note where light is missing: at the mirror, over the counter, beside the sofa or along the stairs."),
"office-layout-mistakes-productivity": N("a new or improved office", "/office-interior-design/", "office interior design", "Ask your team what helps and hinders their work today. A short survey about noise, meeting rooms and storage gives the designer a strong brief."),
"interior-designer-cost-lahore-2026": N("an interior project", "/interior-design/", "interior design", "Set a realistic budget range and decide which rooms matter most. Clear priorities help a designer put the budget where it makes the biggest difference."),
"kitchen-layouts-that-work-lahore-homes": N("a new kitchen", "/kitchen-design/", "kitchen design", "List what you cook most often, how many people cook at once, and which appliances you own or plan to buy. These details decide the right layout."),
"house-renovation-timeline-lahore": N("a house renovation", "/residential-renovation/", "house renovation", "Decide whether you will live in the house during the work. This affects phasing, dust protection and which rooms are done first."),
"dha-vs-bahria-town-interior-cost-lahore": N("an interior in DHA or Bahria Town", "/lahore/", "Lahore", "Check your society's rules for contractors, deliveries and working hours before work starts, and share them with your design team."),
"wardrobe-design-cost-pakistan-2026": N("new wardrobes", "/wardrobe-design/", "wardrobe design", "Count your hanging clothes, folded items and shoes. A quick inventory makes sure the inside layout fits what you actually own."),
"false-ceiling-cost-lahore-2026": N("a false ceiling", "/false-ceiling-design/", "false ceiling design", "Check the slab height in each room and note any beams, ducts or AC units the ceiling must hide or work around."),
"1-kanal-house-interior-cost-lahore": N("a 1 kanal interior", "/1-kanal-house-design/", "1 kanal house design", "Decide which rooms must be ready first and which can follow later. A phased plan keeps the project manageable."),
"5-marla-house-renovation-cost-lahore": N("a 5 marla renovation", "/5-marla-house-design/", "5 marla house design", "Note the problems you live with today, such as a dark lounge, a cramped kitchen or poor storage. Fixing these gives the most value."),
"kitchen-renovation-cost-lahore": N("a kitchen renovation", "/kitchen-renovation/", "kitchen renovation", "Note what frustrates you in the current kitchen: storage, counter space, light or ventilation. These become the priorities for the new design."),
"restaurant-cafe-interior-cost-lahore": N("a restaurant or café", "/restaurant-interior-design/", "restaurant interior design", "Define your concept, menu and target guests first. The kitchen equipment list and seating count follow from these and shape the whole layout."),
"3d-interior-design-cost-pakistan": N("3D views for your project", "/3d-visualization/", "3D visualisation", "Share accurate measurements or drawings and a few reference images. The better the inputs, the closer the first 3D views will be to what you want."),
}
