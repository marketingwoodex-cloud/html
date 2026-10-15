/* Woodex Admin — Phase 6: starter templates. Nothing is added until the owner clicks the button; existing
   names are skipped so it is safe to click twice. FAQ groups · Team · Invoice presets · Project checklists. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal;
  var can = W.can || function () { return true; };

  var FAQS = [
    ["Interior design", [["How much does interior design cost in Lahore?", "It depends on the size, scope and finishes. After a short site visit we share a clear range, then a detailed BOQ before any work starts."], ["Do I get 3D views before work starts?", "Yes. Every design includes photoreal 3D views, so you approve the look before anything is built."], ["How long does the design stage take?", "Usually 2–4 weeks for a home, depending on the number of rooms and revision rounds."], ["Can you work with my existing furniture?", "Yes. We measure and plan around pieces you want to keep."], ["Do you design outside Lahore?", "Yes — Islamabad, Karachi and other cities, with site visits and online meetings."]]],
    ["Renovation", [["Can I live in the house during renovation?", "Often yes. We plan the work in phases and protect the areas you are using."], ["How long does a renovation take?", "A kitchen or bathroom takes about 3–5 weeks; a full home 8–16 weeks."], ["Do you handle civil, plumbing and electrical work?", "Yes. Our own teams handle demolition, civil, plumbing, electrical and finishing."], ["Will the final price change?", "The BOQ is agreed before work starts. Payment follows actual measured areas, and any extra work is approved by you first."], ["Do you give a warranty?", "Yes. Workmanship is covered, and we return to fix any snag after handover."]]],
    ["Fit-out & commercial", [["Can you work to our opening date?", "Yes. We plan the programme backwards from your opening date and share weekly progress."], ["Do you work at night or weekends?", "For malls and running offices we schedule noisy work out of hours when needed."], ["Do you handle approvals?", "We prepare the drawings needed for building management and authority approvals."], ["Can you include branding?", "Yes — reception walls, signage, glass film and colours are part of the design."]]],
    ["Turnkey", [["What does turnkey include?", "Design, civil and MEP works, finishes, furniture made to the drawing, décor and handover — one contract, one team."], ["Who is my single point of contact?", "A dedicated project manager who reports to you every week."], ["How do payments work?", "Usually an advance with the work order, stage payments during the work, and a final payment on handover."]]],
    ["Architecture", [["Do you prepare approval drawings?", "Yes. We prepare submission drawings for LDA, DHA, Bahria and other authorities."], ["Do I get 3D elevations?", "Yes. Front elevation 3D views are part of the concept stage."], ["Can you also build the house?", "Yes. We can continue into construction and interiors as a turnkey project."]]],
    ["3D visualization", [["How many views do I get per room?", "Normally four views per room, with two rounds of revisions."], ["How fast are renders delivered?", "First views usually within 5–7 working days after the layout is approved."], ["Can you render my architect’s drawings?", "Yes. Send us plans (PDF / DWG) and material references."]]],
    ["Payments & quotations", [["How is the quotation calculated?", "Each line shows quantity, unit and rate. Execution work is charged on actual measured areas."], ["What is the payment schedule?", "Design: 75% advance, 25% on approval. Execution: 50% advance, then stage payments and a final payment on handover."], ["How long is a quotation valid?", "Rates are valid for 15 days, as material prices change with the market."], ["Which payment methods do you accept?", "Bank transfer and cheque. Bank details are printed on every quotation and invoice."]]],
  ];
  var TEAM = [["Design lead", "Leads concept design and client presentations."], ["Senior interior designer", "Space planning, materials and finishes."], ["3D visualizer", "Photoreal renders and walkthroughs."], ["Project manager", "Programme, site teams and weekly client updates."], ["Site engineer", "Civil, MEP and quality on site."], ["Workshop head", "Furniture and joinery made in the Woodex workshop."]];
  var INV = [
    ["Design (75 / 25)", "75% advance with work order, 25% on approval of design", "Design fee is nonrefundable once work has started."],
    ["Execution (50 / 40 / 10)", "50% advance with work order, 40% on completion of civil and wood work, 10% on handover", "Payment is charged on actual measured areas. Extra work is billed only after written approval."],
    ["Execution (50 / 50)", "50% advance with work order, balance on completion", "Payment is charged on actual measured areas."],
    ["Turnkey (40 / 30 / 20 / 10)", "40% advance, 30% after civil & MEP, 20% after finishes and furniture, 10% on handover", "Stage invoices are issued at each milestone."],
    ["Furniture (60 / 40)", "60% advance with order, 40% before delivery", "Delivery is scheduled after the balance is received."],
    ["Full payment", "100% payment on receipt of invoice", ""],
  ];
  var CHECK = {
    "Renovation": ["Site survey & measurements", "Demolition & debris removal", "Civil / masonry changes", "Plumbing & electrical rough-in", "Waterproofing", "Plaster & ceiling", "Tiles & flooring", "Wood work installation", "Paint", "Fixtures & fittings", "Deep cleaning", "Snag list & handover"],
    "Interior design (residential)": ["Brief & site visit", "Layout options", "Mood board approved", "3D views approved", "Working drawings issued", "Ceiling & electrical", "Flooring & wall finishes", "Joinery / wardrobes / kitchen", "Loose furniture delivered", "Curtains, lights & décor", "Snag list & handover"],
    "Commercial fit-out": ["Approvals from building management", "Site protection & mobilization", "Partitions", "Ceiling & MEP", "Flooring", "Joinery & counters", "Furniture & equipment", "Signage & branding", "Testing & commissioning", "As-built drawings & handover"],
    "Turnkey": ["Design package approved", "BOQ & programme approved", "Civil & MEP", "Finishes", "Built-in joinery", "Furniture", "Décor & styling", "Cleaning, snag list & handover", "Photos for portfolio"],
    "Architecture": ["Site analysis", "Concept plans", "3D elevation approved", "Final drawings", "Authority submission", "Approval received", "Working drawings issued", "Site visits"],
    "3D visualization": ["Plans & references received", "Layout confirmed", "First views sent", "Revision 1", "Revision 2", "Final renders delivered"],
  };
  W.STARTERS = { faqs: FAQS, team: TEAM, invoices: INV, checklists: CHECK };

  var btn = function (id, label) { var b = document.createElement("button"); b.className = "btn"; b.id = id; b.innerHTML = ic("sparkles") + label; return b; };
  var addToHead = function (b) { var ph = document.querySelector(".ph"); if (!ph) return; var bar = ph.querySelector(".toolbar"); if (!bar) { bar = document.createElement("div"); bar.className = "toolbar"; ph.appendChild(bar); } bar.insertBefore(b, bar.firstChild); };
  var wrap = function (name, after) { var base = W.VIEWS[name]; if (!base) return; W.VIEWS[name] = function (el, parts) { var r = base(el, parts); try { after(el, parts); } catch (e) { console.error(e); } return r; }; };

  // ---------- FAQ groups
  wrap("faqs", function (el) {
    if (!can("owner,admin,editor")) return;
    var b = btn("st-faq", "Add starter FAQ groups"); addToHead(b);
    b.onclick = function () {
      api("cms_list", { type: "faq" }).then(function (r) {
        var have = (r.items || []).map(function (x) { return String(x.title).toLowerCase(); }), todo = FAQS.filter(function (g) { return have.indexOf(g[0].toLowerCase()) < 0; });
        if (!todo.length) return toast("All starter FAQ groups are already added");
        if (!confirm("Add " + todo.length + " FAQ groups (" + todo.map(function (g) { return g[0]; }).join(", ") + ")? You can edit or delete them afterwards.")) return;
        todo.reduce(function (p, g) { return p.then(function () { return api("cms_save", { id: 0, type: "faq", title: g[0], data: { items: g[1].map(function (x) { return { q: x[0], a: x[1] }; }) }, status: "published" }); }); }, Promise.resolve())
          .then(function () { toast(todo.length + " FAQ groups added ✓"); W.VIEWS.faqs(el); });
      });
    };
  });

  // ---------- Team (added as drafts — not shown on the website until you add real names/photos and switch Live on)
  wrap("team", function (el) {
    if (!can("owner,admin,editor")) return;
    var b = btn("st-team", "Add starter team roles"); addToHead(b);
    b.onclick = function () {
      api("cms_list", { type: "member" }).then(function (r) {
        var have = (r.items || []).map(function (x) { return (x.data || {}).role; }), todo = TEAM.filter(function (t) { return have.indexOf(t[0]) < 0; }), n = (r.items || []).length;
        if (!todo.length) return toast("All starter roles are already added");
        if (!confirm("Add " + todo.length + " team roles as drafts? Replace “Team member” with real names and photos, then switch them Live.")) return;
        todo.reduce(function (p, t, i) { return p.then(function () { return api("cms_save", { id: 0, type: "member", title: "Team member", data: { role: t[0], bio: t[1], photo: "" }, order: n + i + 1, status: "draft" }); }); }, Promise.resolve())
          .then(function () { toast(todo.length + " roles added as drafts ✓"); W.VIEWS.team(el); });
      });
    };
  });

  // ---------- Invoice presets (payment schedule + notes) — a dropdown on the invoice screen and the convert dialog
  var presetSelect = function (onPick) {
    var s = document.createElement("select"); s.style.cssText = "margin:4px 0 8px";
    s.innerHTML = "<option value=''>Invoice template…</option>" + INV.map(function (p, i) { return "<option value='" + i + "'>" + esc(p[0]) + "</option>"; }).join("");
    s.onchange = function () { if (s.value !== "") onPick(INV[+s.value]); }; return s;
  };
  new MutationObserver(function () {
    var ti = $("#ti-s"); if (ti && !ti.dataset.st) { ti.dataset.st = 1; ti.parentNode.insertBefore(presetSelect(function (p) { ti.value = p[1]; }), ti); }
    var sc = $("#iv-sc"); if (sc && !sc.dataset.st) { sc.dataset.st = 1; sc.parentNode.insertBefore(presetSelect(function (p) { sc.value = p[1]; var nt = $("#iv-nt"); if (nt && p[2] && !nt.value.trim()) nt.value = p[2]; sc.dispatchEvent(new Event("input", { bubbles: true })); }), sc); }
    var pn = $("#pd-note"); if (pn && !pn.dataset.st && can("owner,admin,sales")) {
      pn.dataset.st = 1;
      var cb = document.createElement("button"); cb.type = "button"; cb.className = "btn"; cb.textContent = "Checklist"; cb.title = "Add a work checklist from a template";
      pn.parentNode.appendChild(cb);
      cb.onclick = function () {
        var k = prompt("Add a checklist to this project. Type a number:\n\n" + Object.keys(CHECK).map(function (c, i) { return (i + 1) + ". " + c; }).join("\n"), "1");
        var name = Object.keys(CHECK)[(+k || 0) - 1]; if (!name) return;
        pn.dataset.full = "Checklist — " + name + ":\n" + CHECK[name].map(function (x) { return "☐ " + x; }).join("\n");
        var add = $("#pd-add"); if (add) add.click();
      };
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
