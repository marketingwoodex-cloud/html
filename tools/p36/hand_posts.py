#!/usr/bin/env python3
"""P36-B2: expand the 7 hand-made insights posts (not in the generator). Idempotent.
Inserts sections (and TOC entries) just before each post's "The short version." section."""
import os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend-v1", "insights")
UL = lambda items: "<ul>" + "".join("<li>%s</li>" % i for i in items) + "</ul>"
OL = lambda items: "<ol>" + "".join("<li>%s</li>" % i for i in items) + "</ol>"
P = lambda *ps: "".join("<p>%s</p>" % x for x in ps)
def T(head, rows):
    return ('<div class="wx-tbl"><table><thead><tr>' + "".join("<th>%s</th>" % c for c in head) + "</tr></thead><tbody>"
            + "".join("<tr>" + "".join("<td>%s</td>" % c for c in r) + "</tr>" for r in rows) + "</tbody></table></div>")

ADD = {
"retail-shop-interior-guide": [
 ("Visual merchandising basics", P("Merchandising turns a well-planned shop into one that sells. Group products by how customers shop, not by how stock arrives. Place best sellers and new arrivals where customers look first, usually to the right of the entrance and at eye level.",
   "Leave breathing space around key displays. A crowded wall looks cheaper than a well-edited one, and customers find what they want faster.")
   + UL(["Eye level is buy level: keep hero products between 1.2 m and 1.6 m.", "Change window and front displays regularly to give regulars a reason to return.", "Use lighting to lead the eye to feature displays."])),
 ("Planning for operations", P("A beautiful shop still has to run every day. Plan stock rooms close to the shop floor, with a clear route that does not cross the customer path.")
   + UL(["Enough sockets and data points at the counter for POS, printers and card machines.", "Secure storage for cash and high-value items.", "Durable floor finishes at the entrance and checkout, where wear is heaviest.", "A staff area, even a small one, for breaks and personal items."])),
],
"office-interior-guide": [
 ("Furniture and ergonomics", P("Staff spend most of the working day at their desk, so chairs and desks matter more than almost any other purchase. Choose adjustable chairs with lumbar support, desks at a comfortable height, and monitor arms where screens are used all day.",
   "Leave enough space between desks for people to move and for privacy on calls. Cramped rows look efficient on paper but reduce comfort and concentration.")),
 ("Technology and services", UL(["Plan power and data at every desk, meeting table and screen position.", "Give meeting rooms a simple, reliable video-call setup.", "Provide good Wi-Fi coverage, tested across the whole floor.", "Keep the comms room ventilated and secure.", "Plan power backup for IT and essential lighting."])
   + P("Services are hard to add after ceilings and floors are finished, so decide them early in the design.")),
],
"small-space-ideas": [
 ("Room-by-room quick wins", T(["Room", "Quick win"], [["Entrance", "Shallow shoe cabinet with a mirror above"], ["Lounge", "Wall-mounted TV and a closed media unit"], ["Kitchen", "Units to the ceiling and a rail for utensils"], ["Bedroom", "Storage bed and full-height wardrobe"], ["Bathroom", "Mirror cabinet and wall-hung vanity"], ["Balcony", "Folding table and chairs"]])),
 ("Colour and materials for small rooms", P("Light, warm neutrals make walls recede and reflect daylight. Use one main colour across connected rooms and add contrast through wood, fabrics and art rather than strong paint on every wall.",
   "Matt and satin finishes avoid glare. Repeating the same wood tone in joinery and furniture makes a small home feel calm and planned, rather than filled.")),
],
"home-renovation-checklist": [
 ("Documents to keep", UL(["The agreed scope, drawings and itemised quote.", "Written records of every change and its cost.", "Receipts and manuals for fittings and appliances.", "Photos of hidden services before walls are closed.", "Paint codes, tile names and batch numbers."])
   + P("Photos of pipes and cables before plastering are especially valuable. They show exactly where it is safe to drill later.")),
 ("Snagging before final payment", P("Before the last payment, walk through every room with a written list. Check finishes in daylight, test every switch and tap, open every door and drawer, and look for leaks under sinks.",
   "Agree a date for the snags to be fixed and check them again. A calm, thorough handover is the best way to finish a renovation well.")),
],
"3d-visualization-guide": [
 ("What to send before 3D work starts", UL(["Floor plans or accurate measurements of each room.", "Photos of the existing space, if it is a renovation.", "Reference images of interiors you like.", "Any furniture or items you plan to keep.", "Preferred colours, materials and finishes."])
   + P("Good inputs mean fewer revisions and a first round that is already close to what you want.")),
 ("Using 3D views to make decisions", P("Look at 3D views with practical questions in mind: is there enough space to walk, sit and open doors? Does the lighting work at night as well as during the day? Do the materials suit how you live and clean?",
   "Share views with everyone who will use the space. It is far easier to change a render than a finished room.")),
],
"restaurant-planning-guide": [
 ("Lighting and atmosphere", P("Lighting sets the mood of a restaurant more than any other element. Use warm, dimmable light in dining areas, focused light on tables, and brighter, even light at the bar, pass and kitchen.",
   "Plan lighting scenes for different times of day: brighter for lunch service, softer and warmer for dinner.")),
 ("Acoustics and comfort", P("A lively room is good; a loud one sends guests home early. Hard floors, glass and bare walls reflect noise. Balance them with upholstered seating, acoustic ceiling panels, curtains and soft wall finishes.")
   + UL(["Keep kitchen noise contained with doors or screens.", "Avoid placing tables in the main service route.", "Check AC airflow does not blow directly onto seats."])),
],
"design-process-explained": [
 ("How to prepare for each stage", UL(["Before the first call: photos, rough measurements and a budget range.", "Before the site visit: plans, a list of must-haves and any items you are keeping.", "Before 3D review: clear priorities so feedback stays focused.", "Before execution: final approval of drawings, materials and quote in writing."])
   + P("A little preparation at each step keeps the project moving and decisions clear.")),
],
}

def NEXT(topic, link, label, extra):
    return ("Next steps", P("If you are planning %s, write down what must change, what must stay and the date you need the space ready. Take photos of the space today and collect a few images you like." % topic, extra,
        'When you are ready, see our <a href="%s">%s</a> page or <a href="/book-a-visit/">book a site visit or studio meeting</a>. A designer can review your space and prepare a written, itemised quote.' % (link, label)))
ADD["small-space-ideas"].append(NEXT("a compact home", "/apartment-interior-design/", "apartment interior design", "Measure each room and mark windows, doors, sockets and AC positions on a simple sketch."))
ADD["office-interior-guide"].append(NEXT("a new office", "/office-interior-design/", "office interior design", "Count your team today and the number you expect in two years, and list the meeting and focus spaces you need."))
ADD["home-renovation-checklist"].append(NEXT("a home renovation", "/residential-renovation/", "house renovation", "List the problems you live with today, such as damp, poor storage or dark rooms, in order of priority."))
ADD["restaurant-planning-guide"].append(NEXT("a restaurant or café", "/restaurant-interior-design/", "restaurant interior design", "Define your concept, menu and seating target first. The kitchen and layout follow from these."))
ADD["retail-shop-interior-guide"].append(NEXT("a shop", "/retail-design/", "retail design", "Note your product range, stock levels and how customers move through similar shops you admire."))
ADD["3d-visualization-guide"].append(NEXT("3D views for your space", "/3d-visualization/", "3D visualisation", "Gather plans or measurements and a handful of reference images before the first meeting."))

def slug(t): return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
n = 0
for post, secs in ADD.items():
    f = os.path.join(ROOT, post, "index.html"); s = open(f, encoding="utf-8").read(); o = s
    m = re.search(r'<div data-in-reveal(?:="")?>\s*<h2 id="(s-\d+-the-short-version)">', s)
    if not m: print("no short-version anchor:", post); continue
    blocks, toc = "", ""
    for h, body in secs:
        sid = "p36-" + slug(h)
        if f'id="{sid}"' in s: continue
        blocks += f'<div data-in-reveal=""><h2 id="{sid}">{h}</h2>{body}</div>\n'
        toc += f'<li><a href="#{sid}">{h}</a></li>'
    if not blocks: continue
    s = s[:m.start()] + blocks + s[m.start():]
    s = s.replace(f'<li><a href="#{m.group(1)}">', toc + f'<li><a href="#{m.group(1)}">', 1)
    open(f, "w", encoding="utf-8").write(s); n += 1
print("posts expanded", n)
