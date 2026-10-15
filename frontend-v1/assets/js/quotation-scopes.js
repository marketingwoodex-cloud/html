/* Woodex — Phase 6: scope-of-work quotation templates for every service + decoration item library.
   Adds to window.WX_QUOT_TEMPLATES (quotation-templates.js). Rates are left empty to fill per client. */
(function () {
  var L = function (desc, unit, qty) { return { desc: desc, qty: qty == null ? 1 : qty, unit: unit || "job", rate: "" }; };
  var S = function (name, items, note) { return { name: name, note: note || "", items: items }; };
  var EXEC = "50% advance payment with work order.\n40% on completion of civil and wood work.\n10% on handover.\nPayment will be charged on the actual dimension / size of area.\nRates are valid for 15 days as per market rates.";
  var DESIGN = "75% advance payment with work order.\n25% on approval of project.\nAbove quote is exclusive of all applicable taxes.\nAdvance is nonrefundable.";
  var T = window.WX_QUOT_TEMPLATES = window.WX_QUOT_TEMPLATES || [];
  T.push(
    { name: "3D Interior Design – Scope of Work", description: "Design-only scope: concept, 3D views and working drawings for the interior.", terms: DESIGN, sections: [
      S("Site & Brief", [L("Site visit, measurements and photographs", "job"), L("Client brief, requirements and budget discussion", "job"), L("Existing layout drawing (as-built)", "sft", "")]),
      S("Concept Design", [L("Space planning / furniture layout (2 options)", "sft", ""), L("Mood board: colours, materials and finishes", "job"), L("Concept presentation and one revision round", "job")]),
      S("3D Visualization", [L("Photoreal 3D renders per room (4 views each)", "nos", ""), L("360° panorama view (optional)", "nos", ""), L("Walkthrough animation (optional)", "job", "")], "Two revision rounds per room are included."),
      S("Working Drawings", [L("Furniture and joinery detail drawings", "set"), L("False ceiling and lighting layout", "set"), L("Electrical, switch and socket layout", "set"), L("Flooring and wall finish layout", "set"), L("Material and finish schedule / BOQ", "job")]),
    ] },
    { name: "Interior Design – Residential", description: "Full home interior: design, finishes, furniture and décor.", terms: EXEC, sections: [
      S("Design", [L("Interior design with 3D views and working drawings", "sft", "")]),
      S("False Ceiling", [L("Gypsum board false ceiling with cornice", "sft", ""), L("Cove lighting profile", "rft", "")]),
      S("Wall Finishes", [L("Paint work: putty, primer and 2 coats emulsion", "sft", ""), L("Wall panelling / fluted panels", "sft", ""), L("Wallpaper supply and installation", "sft", "")]),
      S("Flooring", [L("Porcelain / marble tile flooring with installation", "sft", ""), L("Wooden / laminate flooring", "sft", "")]),
      S("Wood Work", [L("Wardrobes with soft-close hardware", "sft", ""), L("TV console / media wall", "rft", ""), L("Kitchen cabinets (base + wall) with quartz top", "rft", ""), L("Main and room doors with frames", "nos", "")]),
      S("Loose Furniture & Décor", [L("Sofa set, bed, side tables and dining (as per design)", "lumpsum"), L("Curtains and blinds", "sft", ""), L("Lights, chandeliers and décor accessories", "lumpsum")]),
      S("Electrical", [L("Wiring, switches, sockets and DB work", "point", ""), L("LED spot / downlights", "nos", "")]),
    ] },
    { name: "Interior Design – Commercial", description: "Offices, retail, restaurants and clinics: design + build.", terms: EXEC, sections: [
      S("Design", [L("Space planning, branding integration, 3D views and working drawings", "sft", "")]),
      S("Partitions & Ceilings", [L("Glass partitions with aluminium frame", "sft", ""), L("Gypsum partitions with insulation", "sft", ""), L("Acoustic / grid ceiling", "sft", "")]),
      S("Flooring", [L("Carpet tiles / vinyl flooring", "sft", ""), L("Porcelain tiles in common areas", "sft", "")]),
      S("Joinery & Furniture", [L("Reception counter with branding", "job"), L("Workstations with cable management", "nos", ""), L("Meeting / conference table", "nos", ""), L("Storage and pantry cabinets", "rft", "")]),
      S("MEP", [L("Electrical, data and lighting points", "point", ""), L("HVAC ducting and diffusers (coordination)", "lumpsum"), L("Fire alarm / sprinkler adjustment", "lumpsum")]),
      S("Branding & Signage", [L("Logo wall / backlit signage", "job"), L("Glass frosting film with logo", "sft", "")]),
    ] },
    { name: "Renovation – Scope of Work", description: "Renovation scope: demolition to finishing, room by room.", terms: EXEC, sections: [
      S("Demolition", [L("Removal of existing tiles, fixtures and debris", "sft", ""), L("Debris lifting and disposal", "job")]),
      S("Civil Work", [L("Brick masonry / wall changes", "sft", ""), L("Plaster work", "sft", ""), L("Waterproofing (bathrooms / roof)", "sft", "")]),
      S("Plumbing & Electrical", [L("New plumbing lines (hot + cold)", "point", ""), L("Rewiring with new DB", "point", "")]),
      S("Finishing", [L("Tile / marble flooring", "sft", ""), L("Paint work", "sft", ""), L("False ceiling", "sft", "")]),
      S("Kitchen & Bathrooms", [L("Kitchen cabinets with countertop", "rft", ""), L("Bathroom fittings, fixtures and vanity", "set", "")]),
    ] },
    { name: "Turnkey Solution", description: "Design + build + furniture + handover under one contract.", terms: EXEC, sections: [
      S("Design Package", [L("Concept, 3D visualization and working drawings", "sft", "")]),
      S("Civil & MEP", [L("Civil works as per drawings", "lumpsum"), L("Electrical and plumbing works", "lumpsum"), L("HVAC coordination", "lumpsum")]),
      S("Finishes", [L("Flooring, ceiling and wall finishes as per BOQ", "sft", "")]),
      S("Wood Work & Furniture", [L("Built-in joinery (kitchen, wardrobes, doors)", "lumpsum"), L("Loose furniture made in the Woodex workshop", "lumpsum")]),
      S("Décor & Handover", [L("Curtains, lights and accessories", "lumpsum"), L("Deep cleaning, snag list and handover", "job")]),
      S("Project Management", [L("Site supervision, weekly reports and quality control", "job")]),
    ] },
    { name: "Fit-out Solution", description: "Shell-to-ready fit-out for offices, retail and hospitality.", terms: EXEC, sections: [
      S("Preliminaries", [L("Site mobilization, protection and approvals", "job")]),
      S("Partitions & Ceilings", [L("Drywall / glass partitions", "sft", ""), L("False ceiling with access panels", "sft", "")]),
      S("Floor & Wall Finishes", [L("Raised floor / carpet / vinyl", "sft", ""), L("Paint and feature walls", "sft", "")]),
      S("MEP", [L("Lighting, power and data", "point", ""), L("HVAC and fire-fighting modifications", "lumpsum")]),
      S("Joinery & FF&E", [L("Counters, pantry and storage", "lumpsum"), L("Furniture, fixtures and equipment", "lumpsum")]),
      S("Handover", [L("Testing, commissioning and as-built drawings", "job")]),
    ] },
    { name: "Architecture – Scope of Work", description: "Architectural design for residential and commercial buildings.", terms: DESIGN, sections: [
      S("Concept", [L("Site analysis and requirement brief", "job"), L("Concept plans (2 options)", "sft", ""), L("3D exterior elevation (front)", "nos", "")]),
      S("Design Development", [L("Final floor plans, sections and elevations", "sft", ""), L("Submission drawings for authority approval", "set")]),
      S("Working Drawings", [L("Architectural working drawings", "set"), L("Structural drawings (coordination)", "set"), L("Electrical and plumbing drawings", "set")]),
      S("Site Support", [L("Periodic site visits during construction", "nos", "")]),
    ] }
  );

  /* Decoration item library — type "paint", "wood", "glass"… in a quotation to add these lines. */
  window.WX_DECOR = {
    "Paint work": [["Putty, primer and 2 coats emulsion (walls)", "sft"], ["Weather-shield exterior paint", "sft"], ["Enamel paint on doors / grills", "sft"], ["Texture / rustic paint feature wall", "sft"], ["Polish on wood (matt / gloss lacquer)", "sft"]],
    "Wood work": [["Wardrobe with laminated MDF and soft-close hardware", "sft"], ["Kitchen base cabinets", "rft"], ["Kitchen wall cabinets", "rft"], ["Solid wood door with frame and hardware", "nos"], ["Wall panelling / fluted panels", "sft"], ["TV console / media wall", "rft"], ["Vanity cabinet", "rft"]],
    "Glass work": [["10 mm tempered glass partition", "sft"], ["Shower glass enclosure with fittings", "set"], ["Frosted / printed glass film", "sft"], ["Mirror with bevelled edge", "sft"], ["Glass railing with SS fittings", "rft"]],
    "Ceiling": [["Gypsum board false ceiling", "sft"], ["Cornice / cove profile", "rft"], ["Grid / acoustic ceiling tiles", "sft"], ["Wooden ceiling strips", "sft"]],
    "Flooring": [["Porcelain tile flooring (24×48)", "sft"], ["Marble flooring with polish", "sft"], ["Laminate / wooden flooring", "sft"], ["Vinyl / SPC flooring", "sft"], ["Skirting", "rft"]],
    "Tiles": [["Wall tiles (bathroom / kitchen)", "sft"], ["Tile grouting with epoxy", "sft"], ["Backsplash tiles", "sft"]],
    "Wallpaper": [["Imported wallpaper supply and fixing", "sft"], ["3D wall panels", "sft"]],
    "Curtains & blinds": [["Curtains with lining and track", "sft"], ["Roller / zebra blinds", "sft"], ["Motorized curtain track", "rft"]],
    "Electrical": [["Light point wiring", "point"], ["Power socket point", "point"], ["LED downlight", "nos"], ["Chandelier installation", "nos"], ["Distribution board with breakers", "nos"]],
    "Plumbing": [["Hot and cold water point", "point"], ["Drainage point", "point"], ["Water heater installation", "nos"]],
    "Bath fittings": [["WC (wall-hung / floor)", "nos"], ["Basin with mixer", "set"], ["Shower set (rain + hand)", "set"], ["Accessories set", "set"]],
    "Marble & stone": [["Kitchen countertop (quartz / granite)", "rft"], ["Stair marble with nosing", "rft"], ["Window sills", "rft"]],
    "Steel & metal": [["SS railing", "rft"], ["MS grill with paint", "sft"], ["Metal cladding / profile", "sft"]],
    "Lighting & décor": [["Hanging / pendant lights", "nos"], ["Profile / strip light", "rft"], ["Décor accessories and artwork", "lumpsum"], ["Indoor plants with pots", "nos"]]
  };
})();
