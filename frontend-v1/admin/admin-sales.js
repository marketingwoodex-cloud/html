/* Woodex Admin v2 — Phase A5: quotations (versions, options, approval), templates, invoices & payments, projects */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head, can = W.can;
  var QS = { draft: ["Draft", ""], sent: ["Sent", "info"], approved: ["Approved", "ok"], rejected: ["Rejected", "bad"], superseded: ["Superseded", ""], invoiced: ["Invoiced", "gold"] };
  var PAY = { unpaid: ["Unpaid", "bad"], partial: ["Part paid", "warn"], paid: ["Paid", "ok"] };
  var PST = { planning: "Planning", design: "Design", procurement: "Procurement", execution: "Execution", finishing: "Finishing", handover: "Handover", completed: "Completed" };
  var PORDER = Object.keys(PST);
  var KINDS = { renovation: "Renovation", fitout: "Fit-out", design: "Interior design", other: "Other" };
  var UNITS = ["sft", "rft", "sqmt", "nos", "each", "set", "point", "job", "lumpsum"];
  var UL = { sqmt: "sq m", lumpsum: "L/S" };
  var money = function (n) { return "Rs " + Math.round(n || 0).toLocaleString("en-US"); };
  var short = function (n) { n = n || 0; return n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " crore" : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1).replace(/\.0$/, "") + " lac" : money(n); };
  var bdg = function (m, k) { var s = m[k] || [k, ""]; return '<span class="badge ' + s[1] + '">' + s[0] + "</span>"; };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var dshort = function (d) { if (!d) return "—"; var x = new Date(String(d).replace(" ", "T")); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }); };
  var waNum = function (p) { var d = String(p || "").replace(/\D/g, ""); if (/^0\d{9,10}$/.test(d)) d = "92" + d.slice(1); else if (/^3\d{9}$/.test(d)) d = "92" + d; return d; };
  var kindOf = function (name) { name = String(name).toLowerCase(); return /renov|civil/.test(name) ? "renovation" : /fit/.test(name) ? "fitout" : /design|3d|architect|consult/.test(name) ? "design" : "other"; };
  var company = null; var getCompany = function () { return company ? Promise.resolve(company) : api("company_get").then(function (r) { if (r.ok) company = r.company; return company || {}; }); };

  // =========================================================== SECTION EDITOR (quotations + templates)
  // Phase 6 — decoration item library picker: type "paint", "wood", "glass"… and tick lines to add
  function decorPick(hint, done) {
    var D = window.WX_DECOR || {}, cats = Object.keys(D);
    modal("<h2>Decoration items</h2><p class='muted' style='margin:-8px 0 12px'>Type a work type, e.g. <b>paint</b>, <b>wood</b>, <b>glass</b>, <b>ceiling</b>, <b>flooring</b>. Tick the lines you want; enter quantities and rates on the quotation.</p><input id='dp-q' placeholder='paint, wood, glass…' autocomplete='off'><div id='dp-l' style='max-height:52vh;overflow:auto;margin-top:10px'></div><div class='modal-actions'><button class='btn' id='dp-x'>Cancel</button><button class='btn pri' id='dp-go'>Add selected</button></div>");
    var q = $("#dp-q"), draw = function () {
      var v = q.value.trim().toLowerCase(), hits = cats.filter(function (c) { return !v || c.toLowerCase().indexOf(v) >= 0 || D[c].some(function (i) { return i[0].toLowerCase().indexOf(v) >= 0; }); });
      $("#dp-l").innerHTML = hits.map(function (c) { var catHit = !v || c.toLowerCase().indexOf(v) >= 0; return "<div style='margin-bottom:12px'><label class='check' style='font-weight:700'><input type='checkbox' data-all='" + esc(c) + "'" + (v && catHit ? " checked" : "") + "> " + esc(c) + "</label>" + D[c].map(function (i, k) { var show = catHit || i[0].toLowerCase().indexOf(v) >= 0; return show ? "<label class='check' style='margin:4px 0 4px 24px;font-weight:400'><input type='checkbox' data-c='" + esc(c) + "' data-k='" + k + "'" + (v && catHit ? " checked" : "") + "> " + esc(i[0]) + " <small class='muted'>(" + esc(UL[i[1]] || i[1]) + ")</small></label>" : ""; }).join("") + "</div>"; }).join("") || "<p class='muted'>Nothing found. Try paint, wood, glass, tiles, electrical…</p>";
      $$("[data-all]").forEach(function (a) { a.onchange = function () { $$("[data-c]").forEach(function (x) { if (x.dataset.c === a.dataset.all) x.checked = a.checked; }); }; });
    };
    q.oninput = draw; q.value = (cats.find(function (c) { return hint && c.toLowerCase().split(/[ &]/)[0] && String(hint).toLowerCase().indexOf(c.toLowerCase().split(/[ &]/)[0]) >= 0; }) || "").split(/[ &]/)[0].toLowerCase(); draw(); q.focus();
    $("#dp-x").onclick = closeModal;
    $("#dp-go").onclick = function () {
      var picked = $$("[data-c]").filter(function (x) { return x.checked; }); if (!picked.length) return toast("Tick at least one line", true);
      var cat = picked[0].dataset.c; closeModal();
      done(cat, picked.map(function (x) { var i = D[x.dataset.c][+x.dataset.k]; return { desc: i[0], qty: "", unit: i[1], rate: "" }; }));
    };
  }
  function sectionEditor(box, sections, ro, onChange) {
    var calc = function () { sections.forEach(function (s) { s.subtotal = 0; s.items.forEach(function (it) { it.amount = it.kind ? 0 : Math.round((+it.qty || 0) * (+it.rate || 0) * 100) / 100; s.subtotal += it.amount; }); }); };
    var draw = function () {
      calc();
      box.innerHTML = sections.map(function (s, si) {
        return '<div class="card sec" data-si="' + si + '"><div class="sec-hd"><span class="sec-n">' + String(si + 1).padStart(2, "0") + '</span><input class="sec-name" data-f="name" value="' + esc(s.name) + '"' + (ro ? " disabled" : "") + ' placeholder="Section name, e.g. Wood Work"><label class="sec-area" title="Total area for the per-sft summary (project layout)"><small>Area sft</small><input type="number" min="0" step="any" data-f="area" value="' + (s.area || "") + '"' + (ro ? " disabled" : "") + '></label><b class="sec-st">' + money(s.subtotal) + "</b>" +
          (ro ? "" : '<div class="sec-tools"><button class="btn sm" data-a="up" title="Move up"' + (si ? "" : " disabled") + '>↑</button><button class="btn sm" data-a="down" title="Move down"' + (si < sections.length - 1 ? "" : " disabled") + '>↓</button><button class="btn sm" data-a="dup" title="Duplicate section">⧉</button><button class="btn sm danger" data-a="del" title="Remove section">✕</button></div>') + "</div>" +
          '<div class="tbl-wrap"><table class="tbl items"><thead><tr><th style="width:34px">#</th><th>Particulars</th><th style="width:96px" class="r">Qty / area</th><th style="width:92px">Unit</th><th style="width:110px" class="r">Rate</th><th style="width:120px" class="r">Amount</th>' + (ro ? "" : '<th style="width:34px"></th>') + "</tr></thead><tbody>" +
          s.items.map(function (it, ii) {
            return '<tr data-ii="' + ii + '" class="' + (it.kind ? "k-" + it.kind : "") + '"><td class="muted it-k"><input class="it-code" data-i="code" value="' + esc(it.code || "") + '" placeholder="' + (ii + 1) + '"' + (ro ? " disabled" : "") + '><select data-i="kind" title="Row type"' + (ro ? " disabled" : "") + '><option value="">Item</option><option value="head"' + (it.kind === "head" ? " selected" : "") + '>Heading</option><option value="spec"' + (it.kind === "spec" ? " selected" : "") + '>Spec text</option></select></td><td><textarea rows="1" data-i="desc"' + (ro ? " disabled" : "") + ' placeholder="' + (it.kind === "head" ? "Heading, e.g. 5.1 Media wall" : it.kind === "spec" ? "Specification paragraph (no amount)" : "Describe the work") + '">' + esc(it.desc) + '</textarea></td><td><input type="number" step="any" min="0" class="r" data-i="qty" value="' + (it.qty === "" ? "" : +it.qty) + '"' + (ro ? " disabled" : "") + '></td>' +
              '<td><select data-i="unit"' + (ro ? " disabled" : "") + ">" + UNITS.map(function (u) { return '<option value="' + u + '"' + (u === it.unit ? " selected" : "") + ">" + (UL[u] || u) + "</option>"; }).join("") + '</select></td><td><input type="number" step="any" min="0" class="r" data-i="rate" value="' + (it.rate === "" ? "" : +it.rate) + '"' + (ro ? " disabled" : "") + '></td><td class="r amt">' + (it.amount ? Math.round(it.amount).toLocaleString("en-US") : "-") + "</td>" + (ro ? "" : '<td><button class="btn sm ghost" data-rm title="Remove line">✕</button></td>') + "</tr>";
          }).join("") + "</tbody></table></div>" +
          (ro ? (s.note ? '<p class="hint" style="margin:10px 16px">' + esc(s.note) + "</p>" : "") : '<div class="sec-ft"><button class="btn sm" data-add>' + ic("plus") + 'Add line</button><button class="btn sm" data-addk="head">+ Heading</button><button class="btn sm" data-addk="spec">+ Spec text</button><button class="btn sm" data-decor title="Type paint, wood, glass…">' + ic("sparkles") + 'Decoration items</button><input data-f="note" value="' + esc(s.note || "") + '" placeholder="Section note shown under the table (optional)"></div>') + "</div>";
      }).join("") + (ro ? "" : '<div class="sec-add"><button class="btn" id="se-add">' + ic("plus") + 'Add section</button><button class="btn" id="se-lib">' + ic("layers") + "Add section from a template</button></div>");
      W.fillIcons(box); $$("textarea", box).forEach(grow);
    };
    var grow = function (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
    var sumOnly = function (sec, si) { calc(); var s = sections[si]; sec.querySelector(".sec-st").textContent = money(s.subtotal); $$("tr[data-ii]", sec).forEach(function (tr) { var it = s.items[+tr.dataset.ii]; tr.querySelector(".amt").textContent = it.amount ? Math.round(it.amount).toLocaleString("en-US") : "-"; }); onChange(); };
    box.oninput = function (e) {
      var sec = e.target.closest(".sec"); if (!sec) return; var si = +sec.dataset.si, s = sections[si];
      if (e.target.dataset.f) { s[e.target.dataset.f] = e.target.value; return onChange(); }
      var tr = e.target.closest("tr[data-ii]"); if (!tr) return; var it = s.items[+tr.dataset.ii], k = e.target.dataset.i;
      if (k === "kind") return; it[k] = k === "qty" || k === "rate" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value; if (k === "desc") grow(e.target);
      sumOnly(sec, si);
    };
    box.onchange = function (e) { if (e.target.dataset.i === "unit") box.oninput(e); if (e.target.dataset.i === "kind") { var sc = e.target.closest(".sec"); sections[+sc.dataset.si].items[+e.target.closest("tr").dataset.ii].kind = e.target.value; draw(); onChange(); } };
    box.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey && e.target.dataset.i === "desc") { e.preventDefault(); var sec = e.target.closest(".sec"), si = +sec.dataset.si, ii = +e.target.closest("tr").dataset.ii; sections[si].items.splice(ii + 1, 0, { desc: "", qty: 1, unit: sections[si].items[ii].unit, rate: "" }); draw(); onChange(); var t = $$('.sec[data-si="' + si + '"] textarea', box)[ii + 1]; if (t) t.focus(); } };
    box.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.id === "se-add") { sections.push({ name: "", note: "", items: [{ desc: "", qty: 1, unit: "sft", rate: "" }] }); draw(); onChange(); var n = $$(".sec-name", box); n[n.length - 1].focus(); return; }
      if (b.hasAttribute("data-decor")) { var dsi = +b.closest(".sec").dataset.si; return decorPick(sections[dsi].name, function (cat, items) { var sc = sections[dsi]; if (!String(sc.name || "").trim()) sc.name = cat; sc.items = sc.items.filter(function (it) { return String(it.desc || "").trim() || it.rate; }).concat(items); draw(); onChange(); }); }
      if (b.id === "se-lib") return pickSection(function (s) { sections.push(JSON.parse(JSON.stringify(s))); draw(); onChange(); });
      var sec = b.closest(".sec"); if (!sec) return; var si = +sec.dataset.si;
      if (b.hasAttribute("data-add")) { sections[si].items.push({ desc: "", qty: 1, unit: (sections[si].items.slice(-1)[0] || {}).unit || "sft", rate: "" }); draw(); onChange(); var ts = $$('.sec[data-si="' + si + '"] textarea', box); ts[ts.length - 1].focus(); return; }
      if (b.dataset.addk) { sections[si].items.push({ desc: "", qty: 0, unit: "job", rate: "", kind: b.dataset.addk, code: "" }); draw(); onChange(); var tk = $$('.sec[data-si="' + si + '"] textarea', box); tk[tk.length - 1].focus(); return; }
      if (b.hasAttribute("data-rm")) { sections[si].items.splice(+b.closest("tr").dataset.ii, 1); draw(); onChange(); return; }
      var a = b.dataset.a;
      if (a === "up" || a === "down") { var j = si + (a === "up" ? -1 : 1); sections.splice(j, 0, sections.splice(si, 1)[0]); }
      if (a === "dup") sections.splice(si + 1, 0, JSON.parse(JSON.stringify(sections[si])));
      if (a === "del") { if (sections[si].items.some(function (x) { return x.desc; }) && !confirm("Remove the section \"" + (sections[si].name || "Untitled") + "\" and its " + sections[si].items.length + " line(s)?")) return; sections.splice(si, 1); }
      if (a) { draw(); onChange(); }
    };
    draw(); return { redraw: draw };
  }
  function pickSection(cb) {
    api("tpl_list").then(function (r) {
      if (!r.ok) return toast(r.error, true); var all = []; r.templates.forEach(function (t) { t.sections.forEach(function (s) { all.push({ t: t.name, s: s }); }); });
      if (!all.length) return toast("No templates yet. Add them under Templates.", true);
      modal("<h2>Add a section from a template</h2><input type='search' id='ps-q' placeholder='Search sections…'><div id='ps-l' class='ps-l'></div><div class='modal-actions'><button class='btn' id='ps-x'>Cancel</button></div>");
      var draw = function () { var q = $("#ps-q").value.toLowerCase(); $("#ps-l").innerHTML = all.map(function (x, i) { return (!q || (x.t + " " + x.s.name).toLowerCase().indexOf(q) >= 0) ? "<button class='ol-row' data-i='" + i + "' style='width:100%;background:none;cursor:pointer;text-align:left'><b>" + esc(x.s.name) + "</b><small class='muted'>" + esc(x.t) + " · " + x.s.items.length + " lines</small><span style='margin-left:auto'>" + money(x.s.items.reduce(function (a, it) { return a + (it.qty || 0) * (it.rate || 0); }, 0)) + "</span></button>" : ""; }).join(""); $$("#ps-l [data-i]").forEach(function (b) { b.onclick = function () { closeModal(); cb(all[+b.dataset.i].s); }; }); };
      $("#ps-q").oninput = draw; $("#ps-x").onclick = closeModal; draw();
    });
  }
  var cleanForSave = function (sections) { return sections.map(function (s) { return { name: s.name, note: s.note || "", area: +s.area || 0, items: s.items.filter(function (it) { return String(it.desc).trim(); }).map(function (it) { return { desc: it.desc, qty: +it.qty || 0, unit: it.unit, rate: +it.rate || 0, kind: it.kind || "", code: it.code || "" }; }) }; }); };

  // =========================================================== QUOTATIONS LIST
  W.VIEWS.quotes = function (el) {
    var st = S.qState || (S.qState = { q: "", status: "" });
    el.innerHTML = head("Quotations", "Quotations", (can("owner,admin") ? '<button class="btn" id="qt-co">' + ic("settings") + "Company & numbering</button>" : "") + '<a class="btn" href="#/templates">' + ic("layers") + 'Templates</a><button class="btn pri" id="qt-new">' + ic("plus") + "New quotation</button>") +
      '<div class="grid kpis" id="qt-k"></div><div class="card"><div class="card-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)"><input type="search" id="qt-q" placeholder="Search number, client, project…" style="margin:0;max-width:300px"><div class="toolbar" id="qt-f"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Client</th><th>Project</th><th class="r">Total</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody id="qt-rows"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody></table></div></div>';
    var list = [];
    var draw = function () {
      var mon = today().slice(0, 7), sent = list.filter(function (q) { return q.status === "sent"; }), appr = list.filter(function (q) { return (q.status === "approved" || q.status === "invoiced") && String(q.approved_at || "").slice(0, 7) === mon; });
      var decided = list.filter(function (q) { return ["approved", "invoiced", "rejected"].indexOf(q.status) >= 0; });
      var kpi = function (i, l, v, b) { return '<div class="card kpi"><div class="kpi-ic">' + ic(i) + "</div><small>" + l + '</small><div class="kpi-row"><b>' + v + "</b>" + (b || "") + "</div></div>"; };
      $("#qt-k").innerHTML = kpi("file-text", "Drafts", list.filter(function (q) { return q.status === "draft"; }).length) + kpi("mail", "Sent, awaiting reply", sent.length, '<span class="badge info">' + short(sent.reduce(function (a, q) { return a + q.total; }, 0)) + "</span>") +
        kpi("circle-check", "Approved this month", appr.length, '<span class="badge ok">' + short(appr.reduce(function (a, q) { return a + q.total; }, 0)) + "</span>") + kpi("activity", "Approval rate", decided.length ? Math.round(100 * decided.filter(function (q) { return q.status !== "rejected"; }).length / decided.length) + "%" : "—");
      W.fillIcons($("#qt-k"));
      var c = {}; list.forEach(function (q) { c[q.status] = (c[q.status] || 0) + 1; });
      $("#qt-f").innerHTML = '<button class="btn sm' + (!st.status ? " pri" : "") + '" data-s="">All</button>' + Object.keys(QS).filter(function (k) { return c[k]; }).map(function (k) { return '<button class="btn sm' + (st.status === k ? " pri" : "") + '" data-s="' + k + '">' + QS[k][0] + ' <span class="pill" style="margin-left:4px">' + c[k] + "</span></button>"; }).join("");
      $$("#qt-f [data-s]").forEach(function (b) { b.onclick = function () { st.status = b.dataset.s; draw(); }; });
      var q = st.q.toLowerCase(), rows = list.filter(function (x) { return (!st.status || x.status === st.status) && (!q || [x.label, x.client.name, x.client.phone, x.project, x.site].join(" ").toLowerCase().indexOf(q) >= 0); });
      $("#qt-rows").innerHTML = rows.map(function (x) {
        return '<tr data-id="' + x.id + '"><td style="white-space:nowrap"><b>' + esc(x.no) + "</b>" + (x.version > 1 ? ' <span class="badge info">V' + x.version + "</span>" : "") + (x.option ? ' <span class="badge gold">' + esc(x.option) + "</span>" : "") + "</td><td>" + esc(x.client.name) + "<small class='muted' style='display:block'>" + esc(x.client.phone || "") + "</small></td><td>" + esc(x.project || "—") + "<small class='muted' style='display:block'>" + x.sectionCount + " sections</small></td>" +
          '<td class="r" style="white-space:nowrap"><b>' + money(x.total) + "</b></td><td>" + bdg(QS, x.status) + '</td><td style="white-space:nowrap">' + dshort(x.date) + '</td><td class="r"><button class="btn sm">Open</button></td></tr>';
      }).join("") || '<tr><td colspan="7" class="empty">' + (list.length ? "No quotations match." : "No quotations yet. Create one from a template or an enquiry.") + "</td></tr>";
      $$("#qt-rows tr[data-id]").forEach(function (tr) { tr.onclick = function () { location.hash = "#/quote/" + tr.dataset.id; }; });
    };
    $("#qt-q").oninput = function () { st.q = this.value; draw(); };
    $("#qt-new").onclick = function () { W.newQuote(); };
    if ($("#qt-co")) $("#qt-co").onclick = companyModal;
    api("quotes_list").then(function (r) { if (!r.ok) return toast(r.error, true); list = r.quotes; draw(); });
  };

  W.newQuote = function (leadId) {
    Promise.all([api("tpl_list"), api("leads_list"), api("clients_list")]).then(function (r) {
      var tpls = (r[0].templates || []), leads = (r[1].leads || []).filter(function (l) { return l.stage !== "lost"; }), clients = r[2].clients || [];
      modal("<h2>New quotation</h2><div class='nq'><div><small class='muted'>1. Start from</small><div class='nq-tpl' id='nq-tpl'><label class='nq-c'><input type='radio' name='tpl' value='' checked><b>Blank</b><small>Start with an empty section</small></label>" +
        tpls.map(function (t) { return "<label class='nq-c'><input type='radio' name='tpl' value='" + t.id + "'><b>" + esc(t.name) + "</b><small>" + esc(KINDS[t.kind] || "") + " · " + t.sections.length + " sections · " + short(t.total) + "</small></label>"; }).join("") + "</div>" + (tpls.length ? "" : "<p class='hint'>No templates yet. <a href='#/templates' id='nq-tl'>Add the Woodex starter templates</a>.</p>") + "</div>" +
        "<div><small class='muted'>2. For</small><label>Enquiry<select id='nq-lead'><option value=''>— none —</option>" + leads.map(function (l) { return "<option value='" + l.id + "'" + (l.id === leadId ? " selected" : "") + ">#" + l.id + " " + esc(l.name) + (l.service ? " · " + esc(l.service) : "") + "</option>"; }).join("") + "</select></label>" +
        "<label>or existing client<select id='nq-cl'><option value=''>— none —</option>" + clients.map(function (c) { return "<option value='" + c.id + "'>" + esc(c.name) + (c.company ? " · " + esc(c.company) : "") + "</option>"; }).join("") + "</select></label>" +
        "<label>Client name<input id='nq-n'></label><div class='g2'><label>Phone<input id='nq-p'></label><label>Email<input id='nq-e'></label></div><label>Project<input id='nq-pr' placeholder='Renovation of Shahzad Sb house'></label><label>Site / address<input id='nq-s' placeholder='112-A Ahmad Block, Lahore'></label></div></div>" +
        "<p class='err' id='nq-err'></p><div class='modal-actions'><button class='btn' id='nq-x'>Cancel</button><button class='btn pri' id='nq-go'>Create quotation</button></div>");
      $("#modal-card").classList.add("wide");
      var close = function () { $("#modal-card").classList.remove("wide"); closeModal(); };
      var fillFrom = function (o) { $("#nq-n").value = o.name || ""; $("#nq-p").value = o.phone || ""; $("#nq-e").value = o.email || ""; };
      $("#nq-lead").onchange = function () { var l = leads.find(function (x) { return x.id === +this.value; }, this); if (l) { fillFrom(l); if (!$("#nq-pr").value) $("#nq-pr").value = (l.service ? l.service + " for " : "Project for ") + l.name; if (!$("#nq-s").value) $("#nq-s").value = (l.fields && (l.fields.location || l.fields.site)) || ""; $("#nq-cl").value = ""; } };
      $("#nq-cl").onchange = function () { var c = clients.find(function (x) { return x.id === +this.value; }, this); if (c) { fillFrom(c); if (!$("#nq-s").value) $("#nq-s").value = c.address || ""; } };
      if (leadId) $("#nq-lead").onchange();
      if ($("#nq-tl")) $("#nq-tl").onclick = close;
      $("#nq-x").onclick = close;
      $("#nq-go").onclick = function () {
        var tid = +(($("input[name=tpl]:checked") || {}).value || 0), t = tpls.find(function (x) { return x.id === tid; }), c = clients.find(function (x) { return x.id === +$("#nq-cl").value; });
        getCompany().then(function (co) {
          api("quote_save", { lead_id: +$("#nq-lead").value || null, client_id: c ? c.id : null, client: { name: $("#nq-n").value, phone: $("#nq-p").value, email: $("#nq-e").value, address: c ? c.address : "", company: c ? c.company : "" }, project: $("#nq-pr").value, site: $("#nq-s").value, kind: t ? t.kind : "other",
            sections: t ? t.sections : [{ name: "Scope of work", items: [{ desc: "Describe the work", qty: 1, unit: "job", rate: 0 }] }], terms: t ? t.terms : "50% advance payment with work order.\nPayment will be charged on the actual dimension / size of area.\nRates are valid for " + (co.validDays || 15) + " days as per market rates.", date: today() })
            .then(function (x) { if (!x.ok) return ($("#nq-err").textContent = x.error); close(); toast(x.quote.no + " created ✓"); location.hash = "#/quote/" + x.quote.id; });
        });
      };
    });
  };

  // =========================================================== QUOTATION EDITOR
  W.VIEWS.quote = function (el, parts) {
    var id = +parts[0]; el.innerHTML = '<div class="empty">Loading quotation…</div>';
    api("quote_get", { id: id }).then(function (r) {
      if (!r.ok) { el.innerHTML = '<div class="empty">' + esc(r.error) + '</div>'; return; }
      var q = r.quote, co = r.company; company = co;
      var ro = ["approved", "invoiced", "superseded"].indexOf(q.status) >= 0, dirty = false;
      q.sections.forEach(function (s) { s.note = s.note || ""; });
      el.innerHTML = '<div class="ph"><div><h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' + esc(q.label) + " " + bdg(QS, q.status) + '</h1><div class="crumb"><a href="#/dashboard">Home</a> / <a href="#/quotes">Quotations</a> / ' + esc(q.no) + "</div></div>" +
        '<div class="toolbar">' + (r.family.length > 1 ? '<select id="qe-fam" style="margin:0;width:auto">' + r.family.map(function (f) { return '<option value="' + f.id + '"' + (f.id === q.id ? " selected" : "") + ">" + esc(f.label) + " · " + QS[f.status][0] + "</option>"; }).join("") + "</select>" : "") +
        '<button class="btn" id="qe-pdf">' + ic("file-text") + 'Preview / PDF</button><button class="btn wa" id="qe-send">' + ic("message-circle") + "Send</button>" + (ro ? "" : '<button class="btn pri" id="qe-save" disabled>Saved</button>') + '<button class="btn" id="qe-more">⋯</button></div></div>' +
        (ro ? '<div class="banner">' + (q.status === "superseded" ? "Another version of " + esc(q.no) + " was approved. This one is kept for reference." : q.status === "invoiced" ? "Approved and converted to invoice " + esc(q.no) + ". <a href='#/invoices'>Open invoices</a>" : "Approved on " + dshort(q.approved_at) + ". <b>Next: convert it to an invoice.</b> <button class='btn sm pri' id='qe-inv'>Convert to invoice</button>") + " To change the prices, create a new version.</div>" : "") +
        '<div class="qe"><div class="qe-main"><div class="card"><div class="card-b"><div class="g3">' +
          "<label>Client name<input data-c='name' value='" + esc(q.client.name) + "'></label><label>Phone<input data-c='phone' value='" + esc(q.client.phone) + "'></label><label>Email<input data-c='email' value='" + esc(q.client.email) + "'></label>" +
          "<label>Company<input data-c='company' value='" + esc(q.client.company || "") + "'></label><label style='grid-column:span 2'>Client address<input data-c='address' value='" + esc(q.client.address) + "'></label>" +
          "<label style='grid-column:span 2'>Project<input data-q='project' value='" + esc(q.project) + "'></label><label>Type<select data-q='kind'>" + Object.keys(KINDS).map(function (k) { return "<option value='" + k + "'" + (k === q.kind ? " selected" : "") + ">" + KINDS[k] + "</option>"; }).join("") + "</select></label>" +
          "<label style='grid-column:span 2'>Site<input data-q='site' value='" + esc(q.site) + "'></label><div class='g2' style='gap:0 10px'><label>Date<input type='date' data-q='date' value='" + esc(q.date) + "'></label><label>Valid (days)<input type='number' min='1' data-q='valid_days' value='" + (q.valid_days || co.validDays) + "'></label></div>" +
          "<label style='grid-column:1/-1;margin-bottom:0'>Intro line on the summary page <small>(optional)</small><textarea data-q='intro' rows='2' placeholder='Thank you for the opportunity. Please find below our quotation for the renovation work.'>" + esc(q.intro || "") + "</textarea></label>" +
        '</div></div></div><div id="qe-secs"></div></div>' +
        '<aside class="qe-side"><div class="card"><div class="card-b"><h3 class="side-h">Summary</h3><div id="qe-sum"></div>' +
          "<div class='g2' style='margin-top:12px'><label>Discount (Rs)<input type='number' min='0' data-q='discount' value='" + (q.discount || "") + "'></label><label>Tax %<input type='number' min='0' max='50' step='0.5' data-q='taxPct' value='" + (q.taxPct || "") + "'></label></div>" +
          "<div class='g2'><label>Rent / transport (Rs)<input type='number' min='0' data-q='rent' value='" + (q.rent || "") + "'></label><label>Advance (Rs)<input type='number' min='0' data-q='advance' value='" + (q.advance || "") + "'></label></div>" + /*P18qe*/
          '<div class="qe-total"><span>Grand total</span><b id="qe-tot"></b></div><div class="sum-r" id="qe-bal" hidden><span>Balance payable</span><b></b></div><small class="muted" id="qe-words"></small></div></div>' +
          "<div class='card'><div class='card-b'><h3 class='side-h'>PDF blocks <small class='muted'>drag to reorder · switch to show</small></h3><div id='qe-blocks'></div><small class='muted' id='qe-blk-note'></small><button type='button' class='btn sm' id='qe-blk-reset' style='margin-top:8px'>Reset order</button></div></div>" +
          "<div class='card'><div class='card-b'><h3 class='side-h'>PDF design</h3><div class='qd-pick'>" + [["classic", "Classic", "#0a0f1e", "#b8924c"], ["minimal", "Minimal", "#ffffff", "#111827"], ["premium", "Premium", "#2b2118", "#b8956a"]].map(function (d) { return "<label class='qd" + ((q.design || "classic") === d[0] ? " on" : "") + "'><input type='radio' name='qd' data-q='design' value='" + d[0] + "'" + ((q.design || "classic") === d[0] ? " checked" : "") + "><i style='background:" + d[2] + ";border-color:" + d[3] + "'><em style='background:" + d[3] + "'></em></i>" + d[1] + "</label>"; }).join("") + "</div><small class='muted'>Header and footer repeat on every page. Long tables flow onto extra pages.</small></div></div>" +
          "<div class='card'><div class='card-b'><h3 class='side-h'>Terms & conditions</h3><textarea data-q='terms' rows='6'>" + esc(q.terms || "") + "</textarea><h3 class='side-h' style='margin-top:12px'>Internal notes <small class='muted'>(not printed)</small></h3><textarea data-q='notes' rows='3'>" + esc(q.notes || "") + "</textarea></div></div>" +
          "<div class='card'><div class='card-b'><h3 class='side-h'>History</h3><div class='hist'>" + q.history.slice().reverse().map(function (h) { return "<div><small>" + esc(h.user) + " · " + dshort(h.t) + "</small>" + esc(h.text) + "</div>"; }).join("") + "</div></div></div></aside></div>";
      W.fillIcons(el);
      if (ro) $$(".qe input,.qe select,.qe textarea", el).forEach(function (x) { x.disabled = true; });
      var markDirty = function () { if (ro) return; dirty = true; var b = $("#qe-save"); b.disabled = false; b.textContent = "Save"; summary(); };
      var summary = function () {
        var sub = q.sections.reduce(function (a, s) { return a + (s.subtotal || 0); }, 0), disc = Math.min(+q.discount || 0, sub), rent = Math.max(0, +q.rent || 0), tax = Math.round((sub - disc + rent) * (+q.taxPct || 0) / 100), tot = Math.round(sub - disc + rent + tax), adv = Math.min(Math.max(0, +q.advance || 0), tot);
        $("#qe-sum").innerHTML = q.sections.map(function (s, i) { return "<div class='sum-r'><span>" + (i + 1) + ". " + esc(s.name || "Untitled") + "</span><b>" + (s.subtotal ? Math.round(s.subtotal).toLocaleString("en-US") : "-") + "</b></div>"; }).join("") + "<div class='sum-r sub'><span>Subtotal</span><b>" + money(sub) + "</b></div>";
        $("#qe-tot").textContent = money(tot); $("#qe-words").textContent = "Rupees " + WXPrint.words(adv ? tot - adv : tot) + " only"; var bl = $("#qe-bal"); if (bl) { bl.hidden = !adv; bl.querySelector("b").textContent = money(tot - adv); }
      };
      sectionEditor($("#qe-secs"), q.sections, ro, markDirty); summary();
      var blk = WXPrint.blocksUI ? WXPrint.blocksUI($("#qe-blocks"), q.blocks, q.layout || "classic", "quote", function (o) { q.blocks = o; markDirty(); }, ro) : null;
      var blkNote = function () { var n = $("#qe-blk-note"); if (n) n.textContent = ""; };
      var lastLay = q.layout; blkNote(); ["change", "click"].forEach(function (ev) { el.addEventListener(ev, function () { setTimeout(function () { if (q.layout !== lastLay) { lastLay = q.layout; blkNote(); } }, 40); }); });
      window.__wxBlk = blk; /*P19 F2: layout switch refreshes the block list*/
      if ($("#qe-blk-reset")) $("#qe-blk-reset").onclick = function () { if (blk && !ro) blk.reset(); };
      W.qeState = { q: q, co: co, ro: ro, dirty: markDirty, el: el, redraw: function () { sectionEditor($("#qe-secs"), q.sections, ro, markDirty); summary(); } }; if (W.onQuoteEditor) W.onQuoteEditor(W.qeState);
      $$("[data-c]", el).forEach(function (i) { i.oninput = function () { q.client[i.dataset.c] = i.value; markDirty(); }; });
      $$("[data-q]", el).forEach(function (i) { i.oninput = i.onchange = function () { if (i.type === "radio" && !i.checked) return; q[i.dataset.q] = i.value; markDirty(); if (i.name === "qd") $$(".qd", el).forEach(function (l) { l.classList.toggle("on", l.contains(i)); }); }; });
      var save = function () {
        return api("quote_save", { id: q.id, client: q.client, client_id: q.client_id, project: q.project, site: q.site, kind: q.kind, date: q.date, valid_days: q.valid_days, intro: q.intro, sections: cleanForSave(q.sections), discount: q.discount, taxPct: q.taxPct, rent: q.rent || 0, advance: q.advance || 0, blocks: q.blocks || [], terms: q.terms, notes: q.notes, design: q.design || "classic", layout: q.layout || "classic", qtype: q.qtype || "", scope: q.scope || "", sign_name: q.sign_name || "", sign_title: q.sign_title || "" })
          .then(function (x) { if (!x.ok) { toast(x.error, true); return false; } dirty = false; if ($("#qe-save")) { $("#qe-save").disabled = true; $("#qe-save").textContent = "Saved"; } toast("Saved ✓"); return true; });
      };
      var ensureSaved = function () { return dirty ? save() : Promise.resolve(true); };
      if ($("#qe-save")) $("#qe-save").onclick = save;
      var keys = function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "s" && document.body.contains(el) && location.hash.indexOf("#/quote/") === 0) { e.preventDefault(); if (dirty) save(); } };
      document.addEventListener("keydown", keys); window.addEventListener("hashchange", function h() { document.removeEventListener("keydown", keys); window.removeEventListener("hashchange", h); });
      window.onbeforeunload = function () { return dirty && location.hash.indexOf("#/quote/") === 0 ? "unsaved" : undefined; };
      var reopen = function (nid) { location.hash = "#/quote/" + nid; if (+nid === q.id) W.route(); };
      if ($("#qe-fam")) $("#qe-fam").onchange = function () { var v = this.value; ensureSaved().then(function () { reopen(v); }); };
      $("#qe-pdf").onclick = function () { ensureSaved().then(function (ok) { if (!ok) return; api("quote_get", { id: q.id }).then(function (x) { WXPrint.preview(WXPrint.quote(x.quote, x.company), x.quote.label + " · " + x.quote.client.name); }); }); };
      $("#qe-send").onclick = function () {
        ensureSaved().then(function (ok) {
          if (!ok) return;
          api("quote_link", { id: q.id }).then(function (lk) {
            if (!lk.ok) return toast(lk.error, true);
            var link = /^https?:/.test(lk.link) && lk.link.indexOf("://" + location.host) > 0 ? lk.link : location.origin + lk.link.replace(/^https?:\/\/[^/]+/, "");
            var first = String(q.client.name).split(" ")[0], tot = $("#qe-tot").textContent.replace(/^\s*Rs\.?\s*/i, ""), sig = "\n\nRegards,\n" + (S.user.name || "") + "\nWoodex Interior · " + (co.phones || "").split("·")[0].trim();
            var emMsg = "Dear " + first + ",\n\nThank you for choosing Woodex Interior. Please find attached our quotation " + q.label + (q.project ? " for " + q.project : "") + ".\n\nTotal: Rs " + tot + "\nValid for " + (q.valid_days || co.validDays) + " days.\n\nYou can also view it online: " + link + "\n\nPlease let us know if you would like any changes." + sig;
            var waMsg = "Assalam-o-Alaikum " + first + ",\n\nThank you for choosing Woodex Interior. Here is your quotation " + q.label + (q.project ? " for " + q.project : "") + " (Rs " + tot + ", valid " + (q.valid_days || co.validDays) + " days):\n" + link + "\n\nYou can view and download the PDF from the link. Let us know if you would like any changes." + sig;
            modal("<h2>Send " + esc(q.label) + "</h2><div class='tabs' id='sd-tabs'><button class='on' data-t='em'>" + ic("mail") + " Email</button><button data-t='wa'>" + ic("message-circle") + " WhatsApp</button></div>" +
              "<div id='sd-em-p'><div class='g2'><label>To<input id='sd-to' type='email' value='" + esc(q.client.email || "") + "' placeholder='client@email.com'></label><label>Subject<input id='sd-sub' value='" + esc("Quotation " + q.label + " · Woodex Interior") + "'></label></div><label>Message<textarea id='sd-em' rows='9'>" + esc(emMsg) + "</textarea></label><label class='check'><input type='checkbox' id='sd-att' checked> Attach the PDF (" + esc(((WXPrint.THEMES[q.design] || WXPrint.THEMES.classic).label)) + " design)</label></div>" +
              "<div id='sd-wa-p' hidden><label>Client WhatsApp number<input id='sd-ph' value='" + esc(q.client.phone || "") + "' placeholder='03xx xxxxxxx'></label><label>Message<textarea id='sd-wa' rows='9'>" + esc(waMsg) + "</textarea></label><p class='muted' style='font-size:12px'>WhatsApp opens with this message. The client taps the link to view and download the PDF (no sign-in needed).</p></div>" +
              "<p class='err' id='sd-err'></p><div class='modal-actions' style='flex-wrap:wrap'><button class='btn' id='sd-cp'>" + ic("copy") + "Copy link</button><button class='btn' id='sd-dl'>" + ic("download") + "Download PDF</button><span style='flex:1'></span><button class='btn' id='sd-x'>Close</button><button class='btn pri' id='sd-go'>" + ic("send") + "Send email</button></div>");
            var tab = "em";
            $("#sd-tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#sd-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); $("#sd-em-p").hidden = tab !== "em"; $("#sd-wa-p").hidden = tab !== "wa"; $("#sd-go").innerHTML = ic("send") + (tab === "em" ? "Send email" : "Open WhatsApp"); W.fillIcons($("#sd-go")); $("#sd-err").textContent = ""; };
            $("#sd-x").onclick = closeModal;
            $("#sd-cp").onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy the link:", link); }); };
            var pdfOf = function () { return api("quote_get", { id: q.id }).then(function (x) { return WXPrint.quotePdf(x.quote, x.company); }); };
            $("#sd-dl").onclick = function () { var b = this; b.disabled = true; pdfOf().then(function (r) { WXPrint.download(r.blob, r.name); b.disabled = false; }, function (e) { b.disabled = false; toast(e.message || "PDF failed", true); }); };
            var after = function (x, txt) { if (!x.ok) { $("#sd-err").textContent = x.error; return false; } closeModal(); toast(txt); W.route(); return true; };
            $("#sd-go").onclick = function () {
              var b = this; $("#sd-err").textContent = "";
              if (tab === "wa") {
                var ph = waNum($("#sd-ph").value); if (!ph) return ($("#sd-err").textContent = "Enter the client's WhatsApp number");
                window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent($("#sd-wa").value), "_blank", "noopener");
                api("quote_send", { id: q.id, channel: "whatsapp", to: $("#sd-ph").value }).then(function (x) { after(x, "Shared on WhatsApp ✓" + (q.status === "draft" ? " · marked as sent" : "")); });
                return;
              }
              var to = $("#sd-to").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return ($("#sd-err").textContent = "Enter a valid email address");
              b.disabled = true; b.textContent = $("#sd-att").checked ? "Making PDF…" : "Sending…";
              ($("#sd-att").checked ? pdfOf() : Promise.resolve(null)).then(function (pdf) {
                b.textContent = "Sending…";
                return api("quote_send", { id: q.id, channel: "email", to: to, subject: $("#sd-sub").value, message: $("#sd-em").value, pdf: pdf ? pdf.base64 : "", pdfName: pdf ? pdf.name : "" });
              }).then(function (x) { if (!after(x, "Email sent ✓" + (q.status === "draft" ? " · marked as sent" : ""))) { b.disabled = false; b.innerHTML = ic("send") + "Send email"; W.fillIcons(b); } }, function (e) { b.disabled = false; b.innerHTML = ic("send") + "Send email"; W.fillIcons(b); $("#sd-err").textContent = e.message || "Could not make the PDF"; });
            };
          });
        });
      };
      var toInvoice = function () {
        modal("<h2>Convert " + esc(q.label) + " to an invoice</h2><p class='muted'>Invoice number: <b>" + esc(q.no) + "</b> · Total " + money(q.total) + "</p><label>Payment schedule (printed on the invoice)<input id='ti-s' value='" + (/75%/.test(q.terms || "") ? "75% advance with work order, 25% on approval" : "50% advance with work order, balance on completion") + "'></label><label class='check'><input type='checkbox' id='ti-p' checked> Also open a project for this job</label><div class='modal-actions'><button class='btn' id='ti-x'>Cancel</button><button class='btn pri' id='ti-go'>Create invoice</button></div>");
        $("#ti-x").onclick = closeModal;
        $("#ti-go").onclick = function () { api("quote_invoice", { id: q.id, schedule: $("#ti-s").value, project: $("#ti-p").checked }).then(function (x) { if (!x.ok) return toast(x.error, true); closeModal(); toast("Invoice " + x.invoice.no + " created ✓"); location.hash = "#/invoice/" + x.invoice.id; }); };
      };
      if ($("#qe-inv")) $("#qe-inv").onclick = toInvoice;
      $("#qe-more").onclick = function (e) {
        e.stopPropagation(); var old = $("#qe-menu"); if (old) return old.remove();
        var m = document.createElement("div"); m.className = "dd-menu"; m.id = "qe-menu"; m.style.cssText = "position:fixed;z-index:60;width:250px";
        var it = function (a, i, t, bad) { return "<button data-a='" + a + "'" + (bad ? " style='color:var(--bad)'" : "") + ">" + ic(i) + t + "</button>"; };
        m.innerHTML = (q.status === "draft" ? it("sent", "mail", "Mark as sent") : "") + (["draft", "sent"].indexOf(q.status) >= 0 ? it("approved", "circle-check", "Client approved") + it("rejected", "x", "Client rejected") : "") + (q.status === "approved" ? it("invoice", "receipt", "Convert to invoice") : "") + (q.status === "rejected" ? it("draft", "refresh-cw", "Reopen as draft") : "") +
          (q.status !== "invoiced" ? it("version", "history", "New version (V" + (q.version + 1) + ")") + it("option", "layers", "Add another option") : "") + it("duplicate", "file-plus", "Duplicate as new quotation") + it("tpl", "blocks", "Save as template") +
          (can("owner,admin") && ["draft", "rejected", "superseded"].indexOf(q.status) >= 0 ? it("del", "x", "Delete", 1) : "");
        document.body.appendChild(m); W.fillIcons(m); var rc = e.target.getBoundingClientRect(); m.style.top = rc.bottom + 6 + "px"; m.style.left = Math.max(10, rc.right - 250) + "px";
        setTimeout(function () { document.addEventListener("click", function h() { m.remove(); document.removeEventListener("click", h); }); });
        m.onclick = function (ev) {
          var b = ev.target.closest("[data-a]"); if (!b) return; var a = b.dataset.a; m.remove();
          ensureSaved().then(function (ok) {
            if (!ok) return;
            if (["sent", "approved", "rejected", "draft"].indexOf(a) >= 0) { var note = a === "rejected" ? prompt("Reason (optional)", "") : ""; if (note === null) return; if (a === "approved" && !confirm("Mark " + q.label + " as approved by the client (" + money(q.total) + ")? It will be locked; other open versions become superseded.")) return; api("quote_status", { id: q.id, status: a, note: note }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Status: " + QS[a][0] + " ✓"); W.route(); }); }
            if (a === "invoice") toInvoice();
            if (["version", "option", "duplicate"].indexOf(a) >= 0) api("quote_copy", { id: q.id, mode: a }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(x.quote.label + " created ✓"); reopen(x.quote.id); });
            if (a === "tpl") { var n = prompt("Template name", q.project || q.client.name); if (!n) return; api("tpl_save", { name: n, kind: q.kind, description: q.project || "", sections: cleanForSave(q.sections), terms: q.terms }).then(function (x) { x.ok ? toast("Template saved ✓") : toast(x.error, true); }); }
            if (a === "del") { if (!confirm("Delete " + q.label + "?")) return; api("quote_delete", { id: q.id }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Deleted"); location.hash = "#/quotes"; }); }
          });
        };
      };
    });
  };

  // =========================================================== TEMPLATES
  W.VIEWS.templates = function (el) {
    var admin = can("owner,admin");
    el.innerHTML = head("Quotation templates", "Templates", (admin ? '<button class="btn" id="tp-st">' + ic("sparkles") + 'Import Woodex starter templates</button><button class="btn ghost" id="tp-file">' + ic("upload") + 'Import from file</button><input type="file" id="tp-fin" accept=".json,application/json" hidden><button class="btn pri" id="tp-new">' + ic("plus") + "New template</button>" : "")) +
      '<p class="muted" style="margin:-8px 0 18px">One template per type of work. A quotation made from a template can be changed freely for each client.</p><div class="tp-grid" id="tp-g"><div class="empty">Loading…</div></div>';
    var load = function () {
      api("tpl_list").then(function (r) {
        if (!r.ok) return toast(r.error, true); var T = r.templates;
        if ($("#tp-st")) $("#tp-st").hidden = (window.WX_QUOT_TEMPLATES || []).every(function (s) { return T.some(function (t) { return t.name === s.name; }); });
        $("#tp-g").innerHTML = T.map(function (t) {
          var n = t.sections.reduce(function (a, s) { return a + s.items.length; }, 0);
          return '<div class="card tp"><div class="card-b"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b style="font-size:16px">' + esc(t.name) + '</b><div class="muted" style="font-size:13px">' + t.sections.length + " sections · " + n + ' lines</div></div><span class="badge gold">' + esc(KINDS[t.kind] || "Other") + "</span></div>" +
            '<p style="margin:10px 0;color:var(--txt2);font-size:14px">' + esc(t.description || "") + '</p><div class="tp-secs">' + t.sections.slice(0, 10).map(function (s) { return "<span>" + esc(s.name) + "</span>"; }).join("") + "</div>" +
            '<p class="hint" style="margin:10px 0 0">' + esc(String(t.terms || "").split("\n")[0]) + '</p></div><div class="tp-ft"><b>' + (t.total ? short(t.total) : "Rates to fill") + '</b><div style="display:flex;gap:6px"><button class="btn sm" data-use="' + t.id + '">Use</button>' + (admin ? '<button class="btn sm" data-ed="' + t.id + '">Edit</button><button class="btn sm danger" data-del="' + t.id + '">Delete</button>' : "") + "</div></div></div>";
        }).join("") || '<div class="card soon-box" style="grid-column:1/-1"><div class="kpi-ic">' + ic("layers") + "</div><h2>No templates yet</h2><p>Import the Woodex starter set: Renovation (10 BOQ sections), Civil Work, Interior Designing, Interior, Fit-out, Architecture, 3D Visualization, Furniture and Design Consultancy.</p></div>";
        W.fillIcons($("#tp-g"));
        $$("[data-use]").forEach(function (b) { b.onclick = function () { W.newQuote(); setTimeout(function () { var r = $("input[name=tpl][value='" + b.dataset.use + "']"); if (r) r.checked = true; }, 400); }; });
        $$("[data-ed]").forEach(function (b) { b.onclick = function () { location.hash = "#/template/" + b.dataset.ed; }; });
        $$("[data-del]").forEach(function (b) { b.onclick = function () { var t = T.find(function (x) { return x.id === +b.dataset.del; }); if (!confirm("Delete the template \"" + t.name + "\"? Quotations made from it are not affected.")) return; api("tpl_delete", { id: t.id }).then(function (x) { x.ok ? load() : toast(x.error, true); }); }; });
      });
    };
    if ($("#tp-new")) $("#tp-new").onclick = function () { location.hash = "#/template/new"; };
    if ($("#tp-st")) $("#tp-st").onclick = function () {
      var list = (window.WX_QUOT_TEMPLATES || []).map(function (t) { return { name: t.name, kind: kindOf(t.name), description: t.description, sections: t.sections, terms: t.terms }; });
      api("tpl_import", { templates: list }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(x.imported + " templates imported ✓"); load(); });
    };
    if ($("#tp-file")) { $("#tp-file").onclick = function () { $("#tp-fin").click(); };
      $("#tp-fin").onchange = function () { var f = this.files[0]; if (!f) return; var rd = new FileReader();
        rd.onload = function () { var d; try { d = JSON.parse(rd.result); } catch (e) { return toast("That file is not a valid templates JSON", true); }
          var list = Array.isArray(d) ? d : (d.templates || []); if (!list.length) return toast("No templates found in the file", true);
          api("tpl_import", { templates: list }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(x.imported + " new templates imported (existing names skipped) ✓"); load(); }); };
        rd.readAsText(f); this.value = ""; }; }
    load();
  };
  W.VIEWS.template = function (el, parts) {
    var isNew = parts[0] === "new";
    (isNew ? Promise.resolve({ ok: true, templates: [] }) : api("tpl_list")).then(function (r) {
      var t = isNew ? { name: "", kind: "renovation", description: "", sections: [{ name: "", note: "", items: [{ desc: "", qty: 1, unit: "sft", rate: "" }] }], terms: "50% advance payment with work order.\nPayment will be charged on the actual dimension / size of area.\nRates are valid for 15 days as per market rates." } : (r.templates || []).find(function (x) { return x.id === +parts[0]; });
      if (!t) { el.innerHTML = '<div class="empty">Template not found.</div>'; return; }
      el.innerHTML = '<div class="ph"><div><h1>' + (isNew ? "New template" : esc(t.name)) + '</h1><div class="crumb"><a href="#/dashboard">Home</a> / <a href="#/templates">Templates</a> / ' + (isNew ? "New" : esc(t.name)) + '</div></div><div class="toolbar"><a class="btn" href="#/templates">Cancel</a><button class="btn pri" id="te-save">Save template</button></div></div>' +
        '<div class="qe"><div class="qe-main"><div class="card"><div class="card-b"><div class="g3"><label style="grid-column:span 2">Name<input id="te-n" value="' + esc(t.name) + '"></label><label>Type<select id="te-k">' + Object.keys(KINDS).map(function (k) { return "<option value='" + k + "'" + (k === t.kind ? " selected" : "") + ">" + KINDS[k] + "</option>"; }).join("") + '</select></label><label style="grid-column:1/-1;margin:0">Description<input id="te-d" value="' + esc(t.description || "") + '"></label></div></div></div><div id="te-secs"></div></div>' +
        '<aside class="qe-side"><div class="card"><div class="card-b"><h3 class="side-h">Default terms</h3><textarea id="te-t" rows="8">' + esc(t.terms || "") + '</textarea><p class="hint">Rates can stay empty. Fill them in on each quotation.</p></div></div></aside></div>';
      sectionEditor($("#te-secs"), t.sections, false, function () {});
      $("#te-save").onclick = function () { api("tpl_save", { id: t.id, name: $("#te-n").value, kind: $("#te-k").value, description: $("#te-d").value, sections: cleanForSave(t.sections), terms: $("#te-t").value }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Template saved ✓"); location.hash = "#/templates"; }); };
    });
  };

  // =========================================================== COMPANY & NUMBERING
  function companyModal() {
    api("company_get").then(function (r) {
      var c = r.company, f = function (k, l, ph, w) { return "<label" + (w ? " style='grid-column:1/-1'" : "") + ">" + l + "<input id='co-" + k + "' value='" + esc(c[k]) + "' placeholder='" + esc(ph || "") + "'></label>"; };
      modal("<h2>Company & numbering</h2><p class='muted' style='margin:-10px 0 14px'>Printed on every quotation, invoice and receipt.</p><div class='g2'>" + f("name", "Company name") + f("consultant", "Consultant (signature line)") + f("address", "Address", "", 1) + f("phones", "Phones") + f("email", "Email") + f("web", "Website") + f("ntn", "NTN (optional)") +
        "</div><h3 class='side-h'>Bank accounts <small class='muted'>(Interior / Project documents print the “Interior” bank; Furniture (WF-) documents print the “Furniture” bank)</small></h3><div id='co-banks' class='co-list'></div><button class='btn sm' type='button' data-add='banks'>+ Bank account</button>" +
        "<h3 class='side-h'>Mobile wallets</h3><div id='co-wallets' class='co-list'></div><button class='btn sm' type='button' data-add='wallets'>+ Wallet</button>" +
        "<h3 class='side-h'>Signatories <small class='muted'>(first one is the default on new quotations and invoices)</small></h3><div id='co-signers' class='co-list'></div><button class='btn sm' type='button' data-add='signers'>+ Signatory</button>" +
        "<label style='margin-top:12px'>Default payment terms <small class='muted'>(used when a quotation has no terms; one per line)</small><textarea id='co-payTerms' rows='4' placeholder='50% advance with work order&#10;40% on completion of wood work&#10;10% on handover'>" + esc(c.payTerms || "") + "</textarea></label><div>" +
        "</div><h3 class='side-h'>Numbering</h3><div class='g2'>" + f("prefix", "Prefix", "WI-") + "<label>Next number<input id='co-nextNo' type='number' value='" + c.nextNo + "'></label><label>Quotation valid for (days)<input id='co-validDays' type='number' value='" + c.validDays + "'></label><p class='hint' style='align-self:end'>Next quotation: <b id='co-prev'></b>. An approved quotation becomes an invoice with the same number.</p></div>" +
        "<p class='err' id='co-err'></p><div class='modal-actions'><button class='btn' id='co-x'>Cancel</button><button class='btn pri' id='co-go'>Save</button></div>");
      $("#modal-card").classList.add("wide");
      var pv = function () { $("#co-prev").textContent = $("#co-prefix").value + $("#co-nextNo").value; }; $("#co-prefix").oninput = $("#co-nextNo").oninput = pv; pv();
      var close = function () { $("#modal-card").classList.remove("wide"); closeModal(); };
      $("#co-x").onclick = close;
      var LF = { banks: [["bank", "Bank", "Bank Alfalah"], ["title", "Account title", "WOODEX INTERIOR"], ["account", "Account no."], ["iban", "IBAN"], ["branch", "Branch", "Link Rd Model Town, Lahore"], ["code", "Branch code"], ["use", "Print on"]], wallets: [["name", "Wallet", "JazzCash"], ["number", "Number", "+92 3xx xxxxxxx"]], signers: [["name", "Name", "Imtiaz Ahmad"], ["title", "Title", "Director"]] };
      var LS = { banks: (c.banks || []).slice(), wallets: (c.wallets || []).slice(), signers: (c.signers || []).slice() };
      var drawL = function (k) { $("#co-" + k).innerHTML = LS[k].map(function (r, n) { return "<div class='co-row co-" + k + "'>" + LF[k].map(function (f) { return f[0] === "use" ? "<label>" + f[1] + "<select data-k='" + k + "' data-n='" + n + "' data-f='use'>" + [["interior", "Interior & Project"], ["furniture", "Furniture (WF)"], ["all", "All documents"]].map(function (o) { return "<option value='" + o[0] + "'" + ((r.use || "all") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" : "<label>" + f[1] + "<input data-k='" + k + "' data-n='" + n + "' data-f='" + f[0] + "' value='" + esc(r[f[0]] || "") + "' placeholder='" + esc(f[2] || "") + "'></label>"; }).join("") + "<button type='button' class='icon-btn' data-rm='" + k + "' data-n='" + n + "' title='Remove'>✕</button></div>"; }).join("") || "<p class='muted sm'>None yet.</p>";
        $$("#co-" + k + " [data-f]").forEach(function (i) { i.oninput = i.onchange = function () { LS[k][+i.dataset.n][i.dataset.f] = i.value; }; });
        $$("#co-" + k + " [data-rm]").forEach(function (b) { b.onclick = function () { LS[k].splice(+b.dataset.n, 1); drawL(k); }; }); };
      ["banks", "wallets", "signers"].forEach(drawL);
      $$("[data-add]").forEach(function (b) { b.onclick = function () { var k = b.dataset.add; LS[k].push(k === "banks" ? { use: "interior" } : {}); drawL(k); }; });
      $("#co-go").onclick = function () { var o = {}; Object.keys(c).forEach(function (k) { var i = $("#co-" + k); if (i && !Array.isArray(c[k])) o[k] = i.value; }); o.banks = LS.banks; o.wallets = LS.wallets; o.signers = LS.signers; if (LS.signers[0]) { o.signName = LS.signers[0].name || ""; o.signTitle = LS.signers[0].title || ""; } api("company_save", { company: o }).then(function (x) { if (!x.ok) return ($("#co-err").textContent = x.error); company = x.company; close(); toast("Saved ✓"); }); };
    });
  }

  // =========================================================== INVOICES
  W.VIEWS.invoices = function (el) {
    var st = S.iState || (S.iState = { q: "", pay: "" });
    el.innerHTML = head("Invoices", "Invoices", "") + '<div class="grid kpis" id="iv-k"></div><div class="card"><div class="card-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)"><input type="search" id="iv-q" placeholder="Search number, client…" style="margin:0;max-width:300px"><div class="toolbar" id="iv-f"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Client / project</th><th class="r">Total</th><th class="r">Received</th><th class="r">Balance</th><th>Status</th><th>Due</th></tr></thead><tbody id="iv-rows"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody></table></div></div>';
    api("invs_list").then(function (r) {
      if (!r.ok) return toast(r.error, true); var L = r.invoices;
      var kpi = function (i, l, v, b) { return '<div class="card kpi"><div class="kpi-ic">' + ic(i) + "</div><small>" + l + '</small><div class="kpi-row"><b>' + v + "</b>" + (b || "") + "</div></div>"; };
      var sum = function (k) { return L.reduce(function (a, i) { return a + i[k]; }, 0); };
      $("#iv-k").innerHTML = kpi("receipt", "Invoiced", short(sum("total")), '<span class="badge">' + L.length + "</span>") + kpi("circle-check", "Received", short(sum("paid"))) + kpi("clock", "Outstanding", short(sum("balance"))) + kpi("triangle-alert", "Overdue", L.filter(function (i) { return i.overdue; }).length, L.some(function (i) { return i.overdue; }) ? '<span class="badge bad">follow up</span>' : "");
      W.fillIcons($("#iv-k"));
      var draw = function () {
        $("#iv-f").innerHTML = ['', 'unpaid', 'partial', 'paid'].map(function (k) { return '<button class="btn sm' + (st.pay === k ? " pri" : "") + '" data-p="' + k + '">' + (k ? PAY[k][0] : "All") + "</button>"; }).join("");
        $$("#iv-f [data-p]").forEach(function (b) { b.onclick = function () { st.pay = b.dataset.p; draw(); }; });
        var q = st.q.toLowerCase(), rows = L.filter(function (i) { return (!st.pay || i.payStatus === st.pay) && (!q || [i.no, i.client.name, i.project].join(" ").toLowerCase().indexOf(q) >= 0); });
        $("#iv-rows").innerHTML = rows.map(function (i) { return '<tr data-id="' + i.id + '"><td><b>' + esc(i.no) + "</b></td><td>" + esc(i.client.name) + "<small class='muted' style='display:block'>" + esc(i.project || "") + '</small></td><td class="r">' + money(i.total) + '</td><td class="r">' + money(i.paid) + '</td><td class="r"><b>' + money(i.balance) + "</b></td><td>" + bdg(PAY, i.payStatus) + (i.overdue ? ' <span class="badge bad">overdue</span>' : "") + "</td><td>" + dshort(i.due_date) + "</td></tr>"; }).join("") || '<tr><td colspan="7" class="empty">' + (L.length ? "No invoices match." : "No invoices yet. Approve a quotation and convert it to an invoice.") + "</td></tr>";
        $$("#iv-rows tr[data-id]").forEach(function (tr) { tr.onclick = function () { location.hash = "#/invoice/" + tr.dataset.id; }; });
      };
      $("#iv-q").oninput = function () { st.q = this.value; draw(); }; draw();
    });
  };
  W.VIEWS.invoice = function (el, parts) {
    api("inv_get", { id: +parts[0] }).then(function (r) {
      if (!r.ok) { el.innerHTML = '<div class="empty">' + esc(r.error) + "</div>"; return; }
      var i = r.invoice, co = r.company, pct = i.total ? Math.round(100 * i.paid / i.total) : 0;
      el.innerHTML = '<div class="ph"><div><h1 style="display:flex;gap:10px;align-items:center">Invoice ' + esc(i.no) + " " + bdg(PAY, i.payStatus) + (i.overdue ? ' <span class="badge bad">overdue</span>' : "") + '</h1><div class="crumb"><a href="#/dashboard">Home</a> / <a href="#/invoices">Invoices</a> / ' + esc(i.no) + '</div></div><div class="toolbar"><a class="btn" href="#/quote/' + i.quote_id + '">Quotation ' + esc(i.quote_label) + '</a><button class="btn" id="iv-pdf">' + ic("file-text") + "Invoice PDF</button>" + (i.client.phone && i.balance ? '<a class="btn wa" id="iv-rem" target="_blank" rel="noopener">' + ic("message-circle") + "Payment reminder</a>" : "") + (i.balance ? '<button class="btn pri" id="iv-pay">' + ic("plus") + "Record payment</button>" : "") + "</div></div>" +
        '<div class="qe"><div class="qe-main"><div class="card"><div class="card-b"><div class="iv-top"><div><small class="muted">Bill to</small><b style="display:block;font-size:17px">' + esc(i.client.name) + "</b><span class='muted'>" + esc([i.client.phone, i.client.email].filter(Boolean).join(" · ")) + "</span><div class='muted'>" + esc(i.project || "") + (i.site ? " · " + esc(i.site) : "") + "</div></div>" +
        '<div class="iv-prog"><div class="iv-bar"><span style="width:' + pct + '%"></span></div><div class="iv-nums"><div><small>Total</small><b>' + money(i.total) + "</b></div><div><small>Received</small><b style='color:var(--ok)'>" + money(i.paid) + "</b></div><div><small>Balance</small><b style='color:" + (i.balance ? "var(--bad)" : "var(--ok)") + "'>" + money(i.balance) + "</b></div></div></div></div></div></div>" +
        '<div class="card"><div class="card-h"><h3>Payments</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th class="r">Amount</th><th></th></tr></thead><tbody>' +
        (i.payments.map(function (p) { return '<tr><td><b>' + esc(p.rcpt) + "</b><small class='muted' style='display:block'>by " + esc(p.by) + "</small></td><td>" + dshort(p.date) + "</td><td style='text-transform:capitalize'>" + esc(p.method) + "</td><td>" + esc(p.ref || "—") + (p.note ? "<small class='muted' style='display:block'>" + esc(p.note) + "</small>" : "") + '</td><td class="r"><b>' + money(p.amount) + '</b></td><td class="r" style="white-space:nowrap"><button class="btn sm" data-rc="' + p.id + '">Receipt</button>' + (can("owner,admin") ? ' <button class="btn sm danger" data-pd="' + p.id + '">✕</button>' : "") + "</td></tr>"; }).join("") || '<tr><td colspan="6" class="empty">No payments yet.</td></tr>') + "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><h3>Invoice summary</h3></div><div class="tbl-wrap"><table class="tbl"><tbody>' + i.sections.map(function (s, k) { return "<tr><td class='muted' style='width:40px'>" + (k + 1) + "</td><td>" + esc(s.name) + "</td><td class='r'>" + (s.subtotal ? Math.round(s.subtotal).toLocaleString("en-US") : "-") + "</td></tr>"; }).join("") + "<tr><td></td><td><b>Total</b></td><td class='r'><b>" + money(i.total) + "</b></td></tr></tbody></table></div></div></div>" +
        '<aside class="qe-side"><div class="card"><div class="card-b"><label>Issue date<input type="date" id="iv-id" value="' + esc(i.issue_date) + '"></label><label>Due date<input type="date" id="iv-dd" value="' + esc(i.due_date || "") + '"></label><label>Payment schedule<textarea id="iv-sc" rows="2">' + esc(i.schedule || "") + '</textarea></label><label>Notes (printed)<textarea id="iv-nt" rows="3">' + esc(i.notes || "") + '</textarea></label><button class="btn" id="iv-save">Save details</button></div></div>' +
        "<div class='card'><div class='card-b'><h3 class='side-h'>PDF blocks <small class='muted'>drag · switch</small></h3><div id='iv-blocks'></div></div></div></aside></div>"; /*P18iv*/
      W.fillIcons(el);
      if (WXPrint.blocksUI && $("#iv-blocks")) WXPrint.blocksUI($("#iv-blocks"), i.blocks, "single", "invoice", function (o) { i.blocks = o; api("inv_save", { id: i.id, blocks: o }).then(function (x) { x.ok ? toast("PDF layout saved ✓") : toast(x.error, true); }); });
      $("#iv-pdf").onclick = function () { WXPrint.preview(WXPrint.invoice(i, co), "Invoice " + i.no + " · " + i.client.name); };
      if ($("#iv-rem")) $("#iv-rem").href = "https://wa.me/" + waNum(i.client.phone) + "?text=" + encodeURIComponent("Dear " + String(i.client.name).split(" ")[0] + ",\n\nA friendly reminder about invoice " + i.no + (i.project ? " (" + i.project + ")" : "") + ". Balance due: " + money(i.balance) + (i.due_date ? ", due " + dshort(i.due_date) : "") + ".\n\nThank you,\nWoodex Interior");
      $$("[data-rc]").forEach(function (b) { b.onclick = function () { var p = i.payments.find(function (x) { return x.id === +b.dataset.rc; }); WXPrint.preview(WXPrint.receipt(i, p, co), "Receipt " + p.rcpt); }; });
      $$("[data-pd]").forEach(function (b) { b.onclick = function () { if (!confirm("Delete this payment record?")) return; api("pay_delete", { id: i.id, pay_id: +b.dataset.pd }).then(function (x) { x.ok ? W.route() : toast(x.error, true); }); }; });
      $("#iv-save").onclick = function () { api("inv_save", { id: i.id, issue_date: $("#iv-id").value, due_date: $("#iv-dd").value, schedule: $("#iv-sc").value, notes: $("#iv-nt").value }).then(function (x) { x.ok ? toast("Saved ✓") : toast(x.error, true); }); };
      if ($("#iv-pay")) $("#iv-pay").onclick = function () {
        var half = /75%/.test(i.schedule || "") && !i.paid ? Math.round(i.total * 0.75) : /50%/.test(i.schedule || "") && !i.paid ? Math.round(i.total / 2) : i.balance;
        modal("<h2>Record payment · " + esc(i.no) + "</h2><p class='muted' style='margin:-10px 0 14px'>Balance " + money(i.balance) + "</p><div class='g2'><label>Amount (Rs)<input type='number' id='py-a' min='1' value='" + Math.min(half, i.balance) + "'></label><label>Date<input type='date' id='py-d' value='" + today() + "'></label><label>Method<select id='py-m'><option value='bank'>Bank transfer</option><option value='cash'>Cash</option><option value='cheque'>Cheque</option><option value='online'>Online / wallet</option></select></label><label>Reference<input id='py-r' placeholder='Cheque no. / transaction ID'></label></div><label>Note<input id='py-n' placeholder='e.g. 50% advance'></label><div class='toolbar' style='margin-bottom:6px'><button class='btn sm' data-f='0.5'>50%</button><button class='btn sm' data-f='0.75'>75%</button><button class='btn sm' data-f='1'>Full balance</button></div><p class='err' id='py-err'></p><div class='modal-actions'><button class='btn' id='py-x'>Cancel</button><button class='btn pri' id='py-go'>Save payment</button></div>");
        $$("[data-f]").forEach(function (b) { b.onclick = function () { $("#py-a").value = b.dataset.f === "1" ? i.balance : Math.min(i.balance, Math.round(i.total * +b.dataset.f)); }; });
        $("#py-x").onclick = closeModal;
        $("#py-go").onclick = function () { api("pay_add", { id: i.id, amount: $("#py-a").value, date: $("#py-d").value, method: $("#py-m").value, ref: $("#py-r").value, note: $("#py-n").value }).then(function (x) { if (!x.ok) return ($("#py-err").textContent = x.error); closeModal(); toast("Payment " + x.payment.rcpt + " saved ✓"); if (confirm("Open the receipt to print or send?")) WXPrint.preview(WXPrint.receipt(x.invoice, x.payment, co), "Receipt " + x.payment.rcpt); W.route(); }); };
      };
    });
  };

  // =========================================================== PROJECTS
  W.VIEWS.projects = function (el) {
    var st = S.pState || (S.pState = { stage: "active" });
    el.innerHTML = head("Projects", "Projects", can("owner,admin,sales") ? '<button class="btn pri" id="pj-new">' + ic("plus") + "New project</button>" : "") + '<div class="toolbar" id="pj-f" style="margin-bottom:16px"></div><div class="pj-grid" id="pj-g"><div class="empty">Loading…</div></div>';
    var data;
    var load = function () { api("projs_list").then(function (r) { if (!r.ok) return toast(r.error, true); data = r; draw(); }); };
    var draw = function () {
      var P = data.projects, c = { active: P.filter(function (p) { return p.stage !== "completed"; }).length, completed: P.filter(function (p) { return p.stage === "completed"; }).length, all: P.length };
      $("#pj-f").innerHTML = [["active", "Active"], ["completed", "Completed"], ["all", "All"]].map(function (x) { return '<button class="btn sm' + (st.stage === x[0] ? " pri" : "") + '" data-s="' + x[0] + '">' + x[1] + ' <span class="pill" style="margin-left:4px">' + c[x[0]] + "</span></button>"; }).join("");
      $$("#pj-f [data-s]").forEach(function (b) { b.onclick = function () { st.stage = b.dataset.s; draw(); }; });
      var rows = P.filter(function (p) { return st.stage === "all" || (st.stage === "completed" ? p.stage === "completed" : p.stage !== "completed"); });
      $("#pj-g").innerHTML = rows.map(function (p) {
        var k = PORDER.indexOf(p.stage), cover = p.photos.length ? p.photos[p.photos.length - 1].url : "";
        return '<div class="card pj" data-id="' + p.id + '"><div class="pj-img"' + (cover ? ' style="background-image:url(\'' + esc(cover) + '\')"' : "") + ">" + (cover ? "" : ic("image")) + '<span class="badge ' + (p.stage === "completed" ? "ok" : "gold") + '">' + PST[p.stage] + '</span></div><div class="card-b"><b style="font-size:16px">' + esc(p.name) + "</b><div class='muted' style='font-size:13px'>" + esc(p.client_name || "") + (p.no ? " · " + esc(p.no) : "") + "</div>" +
          '<div class="pj-steps">' + PORDER.map(function (s, i) { return '<span class="' + (i <= k ? "on" : "") + '" title="' + PST[s] + '"></span>'; }).join("") + "</div>" +
          '<div class="pj-meta"><span>' + (p.target ? ic("clock") + "Target " + dshort(p.target) : "No target date") + "</span><span>" + (p.value ? short(p.paid) + " / " + short(p.value) : "") + "</span></div></div></div>";
      }).join("") || '<div class="card soon-box" style="grid-column:1/-1"><div class="kpi-ic">' + ic("briefcase") + "</div><h2>No projects here</h2><p>Projects open automatically when an approved quotation becomes an invoice, or add one yourself.</p></div>";
      W.fillIcons($("#pj-g"));
      $$(".pj[data-id]").forEach(function (c) { c.onclick = function () { detail(+c.dataset.id); }; });
    };
    var detail = function (id) {
      var p = data.projects.find(function (x) { return x.id === id; }), edit = can("owner,admin,sales");
      modal('<div class="ld-head"><div><h2 style="margin:0">' + esc(p.name) + '</h2><small class="muted">' + esc(p.client_name || "") + (p.no ? " · " + esc(p.no) : "") + (p.site ? " · " + esc(p.site) : "") + "</small></div>" + (p.invoice_id ? '<a class="btn sm" href="#/invoice/' + p.invoice_id + '" id="pd-inv">Invoice ' + esc(p.no) + "</a>" : "") + (can("g:updates") ? '<button class="btn sm" id="pd-send" title="WhatsApp + email to the client">' + ic("send") + "Send update</button>" : "") + "</div>" +
        '<div class="pj-stepper">' + PORDER.map(function (s, i) { return '<button class="' + (s === p.stage ? "cur" : PORDER.indexOf(p.stage) > i ? "done" : "") + '" data-st="' + s + '"' + (edit ? "" : " disabled") + "><span>" + (i + 1) + "</span>" + PST[s] + "</button>"; }).join("") + "</div>" +
        '<div class="ld-grid"><div><h3 class="ld-h" style="margin-top:4px">Site photos <small class="muted">(' + p.photos.length + ')</small></h3><div class="pj-photos">' + p.photos.slice().reverse().map(function (ph) { return '<figure><a href="' + esc(ph.url) + '" target="_blank"><img src="' + esc(ph.url) + '" alt="" loading="lazy"></a><figcaption>' + esc(PST[ph.stage] || "") + " · " + dshort(ph.t) + (ph.caption ? "<br>" + esc(ph.caption) : "") + "</figcaption>" + (edit ? '<button class="btn sm danger" data-rp="' + esc(ph.url) + '">✕</button>' : "") + "</figure>"; }).join("") +
        '<label class="pj-up">' + ic("upload") + '<span>Add photos</span><input type="file" id="pd-up" accept="image/*" multiple hidden></label></div>' +
        '<h3 class="ld-h">Updates</h3><div style="display:flex;gap:8px"><input id="pd-note" placeholder="Site update: tiles fixed in bath 1, ceiling tomorrow…" style="margin:0"><button class="btn" id="pd-add">Add</button></div><div class="ld-notes" style="margin-top:8px">' + p.updates.slice().reverse().map(function (n) { return "<div class='note" + (n.sys ? " sys" : "") + "'><small>" + esc(n.user) + " · " + dshort(n.t) + "</small><div>" + esc(n.text) + "</div></div>"; }).join("") + "</div></div>" +
        '<div class="ld-side"><label>Project name<input id="pd-n" value="' + esc(p.name) + '"' + (edit ? "" : " disabled") + '></label><label>Client<input id="pd-c" value="' + esc(p.client_name || "") + '"' + (edit ? "" : " disabled") + '></label><label>Site<input id="pd-s" value="' + esc(p.site || "") + '"' + (edit ? "" : " disabled") + '></label><div class="g2" style="gap:0 10px"><label>Start<input type="date" id="pd-st" value="' + esc(p.start || "") + '"' + (edit ? "" : " disabled") + '></label><label>Target<input type="date" id="pd-tg" value="' + esc(p.target || "") + '"' + (edit ? "" : " disabled") + '></label></div>' +
        '<label>Project manager<select id="pd-m"' + (edit ? "" : " disabled") + '><option value="">—</option>' + data.team.map(function (u) { return "<option value='" + u.id + "'" + (u.id === p.manager ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("") + "</select></label>" + (p.value ? "<div class='kv'><small>Contract</small><span>" + money(p.value) + "</span></div><div class='kv'><small>Received</small><span>" + money(p.paid) + "</span></div>" : "") +
        (can("owner,admin") ? '<button class="btn sm danger" id="pd-del" style="margin-top:10px">Delete project</button>' : "") + "</div></div>" +
        '<p class="err" id="pd-err"></p><div class="modal-actions"><button class="btn" id="pd-x">Close</button>' + (edit ? '<button class="btn pri" id="pd-save">Save</button>' : "") + "</div>");
      $("#modal-card").classList.add("wide");
      var close = function () { $("#modal-card").classList.remove("wide"); closeModal(); };
      var refresh = function (x) { if (!x.ok) { toast(x.error, true); return; } var k = data.projects.findIndex(function (y) { return y.id === id; }); x.project.paid = data.projects[k].paid; data.projects[k] = Object.assign(data.projects[k], x.project); draw(); detail(id); };
      $("#pd-x").onclick = close; if ($("#pd-inv")) $("#pd-inv").onclick = close;
      $$("[data-st]").forEach(function (b) { b.onclick = function () { api("proj_save", { id: id, stage: b.dataset.st }).then(refresh); }; });
      // P39 Phase 6: send a progress update now (chosen site photos + optional message)
      if ($("#pd-send")) $("#pd-send").onclick = function () {
        if ($("#pd-sp")) { $("#pd-sp").remove(); return; }
        var box = document.createElement("div"); box.id = "pd-sp"; box.className = "card"; box.style.cssText = "margin:12px 0;padding:14px";
        box.innerHTML = "<b>Send a progress update to the client</b><p class='muted' style='margin:4px 0 8px;font-size:12.5px'>Goes by WhatsApp and email. Leave the message empty to use the standard “" + esc(PST[p.stage]) + " stage” text (Client updates settings).</p>" +
          '<textarea id="pd-sm" rows="3" maxlength="1000" placeholder="Optional message, e.g. Kitchen cabinets are installed; countertops arrive on Monday."></textarea>' +
          (p.photos.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">' + p.photos.slice().reverse().slice(0, 12).map(function (ph) { return '<label style="position:relative;cursor:pointer"><input type="checkbox" data-sp="' + esc(ph.url) + '"' + (ph.stage === p.stage ? " checked" : "") + ' style="position:absolute;top:5px;left:5px"><img src="' + esc(ph.url) + '" alt="" style="width:76px;height:58px;object-fit:cover;border-radius:6px;display:block"></label>'; }).join("") + '</div><small class="muted">Up to 3 photos are sent as links.</small>' : "<p class='muted' style='font-size:12.5px'>No site photos yet; add some below to include them.</p>") +
          '<div style="text-align:right;margin-top:8px"><button class="btn pri" id="pd-sgo">Send update</button></div>';
        $(".pj-stepper").after(box);
        $("#pd-sgo").onclick = function () {
          var b = this, ph = $$("[data-sp]").filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.sp; }).slice(0, 3);
          b.disabled = true; b.textContent = "Sending…";
          api("notify_proj_send", { id: id, note: $("#pd-sm").value, photos: ph }).then(function (x) { b.disabled = false; b.textContent = "Send update"; if (!x.ok) return toast(x.error, true);
            toast(x.pending ? "Sent for Master approval" : "Update sent: " + Object.keys(x.result).map(function (k) { return k + " " + x.result[k]; }).join(" · ")); box.remove(); });
        };
      };
      $("#pd-add").onclick = function () { var t = ($("#pd-note").dataset.full || $("#pd-note").value).trim(); $("#pd-note").dataset.full = ""; if (t) api("proj_update", { id: id, text: t }).then(refresh); };
      $("#pd-note").onkeydown = function (e) { if (e.key === "Enter") $("#pd-add").click(); };
      $$("[data-rp]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this photo?")) api("proj_photo_delete", { id: id, url: b.dataset.rp }).then(refresh); }; });
      $("#pd-up").onchange = function () {
        var files = Array.prototype.slice.call(this.files, 0, 12); if (!files.length) return; toast("Uploading " + files.length + " photo(s)…");
        var next = function (k) { if (k >= files.length) { toast("Photos added ✓"); return load(); }
          shrink(files[k], 1800).then(function (data64) { return api("proj_photo", { id: id, data: data64 }); }).then(function (x) { if (!x.ok) toast(x.error, true); else { var j = data.projects.findIndex(function (y) { return y.id === id; }); data.projects[j].photos = x.project.photos; } if (k === files.length - 1) { draw(); detail(id); } next(k + 1); }); };
        next(0);
      };
      if ($("#pd-save")) $("#pd-save").onclick = function () { api("proj_save", { id: id, name: $("#pd-n").value, client_name: $("#pd-c").value, site: $("#pd-s").value, start: $("#pd-st").value, target: $("#pd-tg").value, manager: $("#pd-m").value }).then(function (x) { if (!x.ok) return ($("#pd-err").textContent = x.error); refresh(x); toast("Saved ✓"); }); };
      if ($("#pd-del")) $("#pd-del").onclick = function () { if (!confirm("Delete the project \"" + p.name + "\"? The invoice is kept.")) return; api("proj_delete", { id: id }).then(function (x) { if (!x.ok) return toast(x.error, true); close(); load(); }); };
    };
    if ($("#pj-new")) $("#pj-new").onclick = function () { var n = prompt("Project name"); if (!n) return; api("proj_save", { name: n }).then(function (x) { if (!x.ok) return toast(x.error, true); data.projects.unshift(x.project); x.project.paid = 0; draw(); detail(x.project.id); }); };
    load();
  };
  /** Resize a photo in the browser (max side px) and return a JPEG data URL — keeps uploads small on mobile data */
  function shrink(file, max) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.82)); };
      img.onerror = function () { rej(new Error("Not an image")); }; img.src = url;
    });
  }

  // "Create quotation" from an enquiry drawer
  var ld = W.leadDrawer;
  if (ld) W.leadDrawer = function (id, after) { ld(id, after); var box = $(".ld-side"); if (box && !$("#ld-quote")) { var b = document.createElement("button"); b.className = "btn sm pri"; b.id = "ld-quote"; b.style.marginTop = "6px"; b.innerHTML = ic("receipt") + "Create quotation"; box.insertBefore(b, box.querySelector("#ld-conv,#ld-cl")); b.onclick = function () { $("#modal-card").classList.remove("wide"); closeModal(); W.newQuote(id); }; } };
})();
