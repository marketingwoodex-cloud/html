/* Woodex Admin — P17 S1+S2: sheet-style enquiries tracker, follow-ups, lead side drawer, sheet import, client master + Client 360.
   Wraps admin-crm.js (the classic list, pipeline board, alerts settings and CSV export stay available). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var S = W.S, api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, head = W.head, can = W.can;
  var OLD = { enquiries: W.VIEWS.enquiries, clients: W.VIEWS.clients, drawer: W.leadDrawer };
  var STAGE = { new: ["New", "info"], contacted: ["Contacted", "gold"], visit: ["Meeting / visit", "warn"], quote: ["Proposal / quotation", "gold"], hold: ["On hold", ""], won: ["Won", "ok"], lost: ["Closed / lost", "bad"] };
  var ORDER = ["new", "contacted", "visit", "quote", "hold", "won", "lost"];
  var KIND = { call: ["phone", "Call"], whatsapp: ["message-circle", "WhatsApp"], visit: ["map-pin", "Site visit"], meeting: ["users", "Meeting"], email: ["mail", "Email"], note: ["file-text", "Note"] };
  var M = null, C = { leads: [], team: [], sources: {} };
  var pkr = function (n) { return "Rs " + Math.round(+n || 0).toLocaleString("en-PK"); };
  var two = function (n) { return String(n).padStart(2, "0"); };
  var ymd = function (d) { return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); };
  var today = function () { return ymd(new Date()); };
  var nowS = function () { var d = new Date(); return ymd(d) + " " + two(d.getHours()) + ":" + two(d.getMinutes()) + ":00"; };
  var dd = function (d, time) { if (!d) return "—"; var x = new Date(String(d).replace(" ", "T")); if (isNaN(x)) return esc(d); return x.toLocaleDateString("en-GB", x.getFullYear() === new Date().getFullYear() ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" }) + (time && String(d).length > 10 ? " · " + x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""); };
  var ago = function (d) { if (!d) return "—"; var s = (Date.now() - new Date(String(d).replace(" ", "T"))) / 864e5; if (isNaN(s)) return "—"; return s < 1 ? "today" : s < 2 ? "yesterday" : Math.floor(s) + " days ago"; };
  var badge = function (st) { var s = STAGE[st] || [st, ""]; return '<span class="badge ' + s[1] + '">' + s[0] + "</span>"; };
  var waNum = function (p) { var d = String(p || "").replace(/\D/g, ""); if (/^0\d{9,10}$/.test(d)) d = "92" + d.slice(1); else if (/^3\d{9}$/.test(d)) d = "92" + d; return d; };
  var open = function (l) { return ["won", "lost"].indexOf(l.stage) < 0; };
  var overdue = function (l) { return open(l) && l.next_at && l.next_at < nowS(); };
  var dueToday = function (l) { return open(l) && l.next_at && l.next_at.slice(0, 10) === today() && !overdue(l); };
  var mlabel = function (m) { var d = new Date(m + "-01T00:00"); return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
  function meta() { return M ? Promise.resolve(M) : api("s17_meta").then(function (r) { if (r.ok) M = r; return M || { lines: {}, leadTypes: {}, quoteStatus: {}, nextTypes: {}, clientTypes: {}, projectTypes: [] }; }); }
  function loadLeads() { return api("leads_list").then(function (r) { if (!r.ok) { toast(r.error, true); return false; } C.leads = r.leads; C.team = r.team; C.sources = r.sources; C.ts = r.teamSources || []; return true; }); }
  var opts = function (o, cur, blank) { var h = blank != null ? "<option value=''>" + blank + "</option>" : ""; Object.keys(o).forEach(function (k) { if (k === "" && blank != null) return; h += "<option value='" + esc(k) + "'" + (String(cur || "") === k ? " selected" : "") + ">" + esc(o[k]) + "</option>"; }); return h; };
  var srcSel = function (id, cur) { var auto = cur && C.ts.indexOf(cur) < 0 && cur !== "import"; return "<label>Came from<select id='" + id + "'" + (auto ? " disabled title='Set automatically by the website'" : "") + ">" + (auto ? "<option>" + esc(C.sources[cur] || cur) + "</option>" : C.ts.map(function (k) { return "<option value='" + k + "'" + ((cur || "manual") === k ? " selected" : "") + ">" + esc(k === "manual" ? "— not set —" : C.sources[k] || k) + "</option>"; }).join("")) + "</select></label>"; };
  var lineTag = function (k) { return k ? "<span class='s17-line s17-l-" + esc(k) + "'>" + esc((M && M.lines[k]) || k) + "</span>" : ""; };

  // ================================================================ ENQUIRIES TRACKER
  W.VIEWS.enquiries = function (el, parts) {
    if (parts && parts[0] === "classic") return OLD.enquiries(el, []);
    var st = S.s17q || (S.s17q = { month: today().slice(0, 7), line: "", who: "", stage: "", q: "", tab: "all" });
    var admin = can("owner,admin");
    el.innerHTML = head("Leads", "Leads", '<a class="btn" href="#/enquiries/classic">' + ic("layers") + 'Classic list</a><a class="btn" href="#/pipeline">' + ic("kanban") + "Pipeline</a>" +
        (admin ? '<button class="btn" id="s17-imp">' + ic("upload") + "Import sheet</button>" : "") + '<button class="btn" id="s17-exp">' + ic("download") + 'Export</button><button class="btn pri" id="s17-add">' + ic("plus") + "Add lead</button>") +
      '<div class="s17-bar"><div class="s17-month"><button class="icon-btn" id="s17-prev" title="Previous month">‹</button><select id="s17-m"></select><button class="icon-btn" id="s17-next" title="Next month">›</button></div>' +
      '<div class="seg" id="s17-lines"></div></div>' +
      '<div class="s17-counters" id="s17-c"></div>' +
      '<div class="s17-wrap"><div class="card s17-main"><div class="s17-tabs" id="s17-tabs"></div><div class="s17-filters"><input type="search" id="s17-qs" placeholder="Search company, name, phone, location…">' +
      '<select id="s17-who"></select><select id="s17-stage"></select></div>' +
      '<div class="tbl-wrap"><table class="tbl s17-tbl"><thead><tr><th>Date</th><th>Company / name</th><th>Contact</th><th>Location</th><th>Line</th><th>Assigned</th><th>Quotation</th><th>Last contact</th><th>Stage</th><th>Next follow-up</th></tr></thead><tbody id="s17-rows"><tr><td colspan="10" class="empty">Loading…</td></tr></tbody></table></div></div>' +
      '<aside class="card s17-fu" id="s17-fu"></aside></div>';
    var stats = null;
    var mlist = function () { var s = {}; s[today().slice(0, 7)] = 1; if (st.month) s[st.month] = 1; C.leads.forEach(function (l) { s[String(l.created_at).slice(0, 7)] = 1; }); return Object.keys(s).sort().reverse(); };
    var inMonth = function (l) { return !st.month || String(l.created_at).slice(0, 7) === st.month; };
    var base = function () { return C.leads.filter(function (l) { return inMonth(l) && (!st.line || l.line === st.line); }); };
    function counters() {
      var L = base(), n = function (f) { return L.filter(f).length; };
      var cs = [["all", "Total", L.length, ""], ["newlead", "New lead", n(function (l) { return l.lead_type !== "returning" && !l.client_id; }), "info"], ["client", "Client", n(function (l) { return l.lead_type === "returning" || l.client_id; }), "navy"],
        ["meeting", "Meeting", n(function (l) { return l.stage === "visit"; }), "warn"], ["proposal", "Proposal", n(function (l) { return l.stage === "quote" || l.quote_status === "proposal"; }), "gold"],
        ["hold", "Hold", n(function (l) { return l.stage === "hold"; }), ""], ["done", "Quote done", n(function (l) { return l.quote_status === "done"; }), "teal"], ["won", "Won", n(function (l) { return l.stage === "won"; }), "ok"],
        ["overdue", "Overdue", C.leads.filter(overdue).length, "bad"]];
      $("#s17-c").innerHTML = cs.map(function (c) { return '<button class="s17-k s17-k-' + (c[3] || "plain") + (st.tab === c[0] ? " on" : "") + '" data-t="' + c[0] + '"><small>' + c[1] + "</small><b>" + c[2] + "</b></button>"; }).join("") +
        '<div class="s17-k s17-k-val"><small>Won value</small><b>' + pkr(L.filter(function (l) { return l.stage === "won"; }).reduce(function (a, l) { return a + (l.value || 0); }, 0)).replace("Rs ", "") + "</b></div>";
      $$("#s17-c [data-t]").forEach(function (b) { b.onclick = function () { st.tab = st.tab === b.dataset.t && b.dataset.t !== "all" ? "all" : b.dataset.t; counters(); rows(); }; });
    }
    var TABF = { all: function () { return true; }, newlead: function (l) { return l.lead_type !== "returning" && !l.client_id; }, client: function (l) { return l.lead_type === "returning" || l.client_id; },
      meeting: function (l) { return l.stage === "visit"; }, proposal: function (l) { return l.stage === "quote" || l.quote_status === "proposal"; }, hold: function (l) { return l.stage === "hold"; },
      done: function (l) { return l.quote_status === "done"; }, won: function (l) { return l.stage === "won"; }, overdue: overdue };
    function rows() {
      var q = st.q.toLowerCase(), L = (st.tab === "overdue" ? C.leads.filter(overdue) : base().filter(TABF[st.tab] || TABF.all)).filter(function (l) {
        return (!st.who || String(l.assigned_to || "none") === st.who) && (!st.stage || l.stage === st.stage) && (!q || [l.company, l.name, l.phone, l.email, l.location, l.designation, l.message, "#" + l.id].join(" ").toLowerCase().indexOf(q) >= 0); });
      $("#s17-tabs").innerHTML = "<b>" + (st.tab === "overdue" ? "Overdue follow-ups (all months)" : (st.month ? mlabel(st.month) : "All months")) + "</b><small class='muted'>" + L.length + " lead" + (L.length === 1 ? "" : "s") + (st.tab !== "all" ? " · filter: " + esc(st.tab) + " <a href='#' id='s17-clr'>clear</a>" : "") + "</small>";
      if ($("#s17-clr")) $("#s17-clr").onclick = function (e) { e.preventDefault(); st.tab = "all"; counters(); rows(); };
      var QS = (M && M.quoteStatus) || {};
      $("#s17-rows").innerHTML = L.length ? L.map(function (l) {
        var od = overdue(l), td = dueToday(l), title = l.company || l.name, sub = l.company ? l.name + (l.designation ? " · " + l.designation : "") : (l.designation || "");
        return '<tr data-id="' + l.id + '" class="' + (od ? "s17-od " : "") + (l.read ? "" : "unread") + '"><td class="nw">' + dd(l.created_at) + "</td>" +
          "<td><b>" + esc(title) + "</b>" + (sub ? "<small class='muted d'>" + esc(sub) + "</small>" : "") + (l.lead_type === "returning" || l.client_id ? " <span class='badge navy sm'>Client</span>" : "") + "</td>" +
          "<td class='nw'>" + (l.phone ? esc(l.phone) + ' <a class="s17-wa" data-stop title="WhatsApp" target="_blank" rel="noopener" href="https://wa.me/' + waNum(l.phone) + '">' + ic("message-circle") + "</a>" : "<span class='muted'>—</span>") + "</td>" +
          "<td>" + esc(l.location || "—") + "</td><td>" + (lineTag(l.line) || "<span class='muted'>—</span>") + "</td><td>" + esc(l.assigned_name || "—") + "</td>" +
          "<td>" + (l.quote_status ? "<span class='s17-q s17-q-" + esc(l.quote_status) + "'>" + esc(QS[l.quote_status] || l.quote_status) + "</span>" : "<span class='muted'>—</span>") + "</td>" +
          "<td class='nw'>" + (l.last_contact ? dd(l.last_contact) + "<small class='muted d'>" + ago(l.last_contact) + "</small>" : "<span class='muted'>never</span>") + "</td><td>" + badge(l.stage) + "</td>" +
          "<td class='nw" + (od ? " s17-red" : td ? " s17-amber" : "") + "'>" + (l.next_at && open(l) ? (od ? "⚠ " : "") + dd(l.next_at, true) + "<small class='d'>" + esc(((M && M.nextTypes[l.next_type]) || l.next_type || "")) + "</small>" : "<span class='muted'>—</span>") + "</td></tr>";
      }).join("") : '<tr><td colspan="10" class="empty">No leads here yet. Add one, or import your sheet.</td></tr>';
      W.fillIcons($("#s17-rows"));
      $$("#s17-rows tr[data-id]").forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest("[data-stop]")) return; drawer(+tr.dataset.id, refresh); }; });
    }
    function followups() {
      var L = C.leads.filter(function (l) { return open(l) && l.next_at; }).sort(function (a, b) { return a.next_at < b.next_at ? -1 : 1; });
      var od = L.filter(overdue), td = L.filter(dueToday), up = L.filter(function (l) { return !overdue(l) && !dueToday(l) && l.next_at.slice(0, 10) <= ymd(new Date(Date.now() + 7 * 864e5)); });
      var item = function (l, cls) { return '<a href="#" class="s17-fi ' + cls + '" data-id="' + l.id + '"><span class="s17-fic">' + ic((KIND[l.next_type] || KIND.call)[0]) + "</span><span><b>" + esc(l.company || l.name) + "</b><small>" + esc((M && M.nextTypes[l.next_type]) || "Follow-up") + " · " + dd(l.next_at, true) + (l.assigned_name ? " · " + esc(l.assigned_name) : "") + "</small></span></a>"; };
      var grp = function (t, a, cls) { return "<h4>" + t + " <span class='pill'>" + a.length + "</span></h4>" + (a.length ? a.slice(0, 8).map(function (l) { return item(l, cls); }).join("") + (a.length > 8 ? "<small class='muted'>+" + (a.length - 8) + " more</small>" : "") : "<p class='muted sm'>Nothing.</p>"); };
      $("#s17-fu").innerHTML = "<div class='card-h'><h3>" + ic("bell") + " Follow-ups</h3></div><div class='card-b'>" + grp("Overdue", od, "od") + grp("Today", td, "td") + grp("Next 7 days", up, "up") + "</div>";
      W.fillIcons($("#s17-fu")); $$("#s17-fu [data-id]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); drawer(+a.dataset.id, refresh); }; });
    }
    function filters() {
      var ms = mlist(); $("#s17-m").innerHTML = "<option value=''>All months</option>" + ms.map(function (m) { return "<option value='" + m + "'" + (m === st.month ? " selected" : "") + ">" + mlabel(m) + "</option>"; }).join("");
      $("#s17-lines").innerHTML = [["", "All lines"]].concat(Object.keys(M.lines).map(function (k) { return [k, M.lines[k]]; })).map(function (x) { return "<button data-l='" + x[0] + "' class='" + (st.line === x[0] ? "on" : "") + "'>" + x[1] + "</button>"; }).join("");
      $("#s17-who").innerHTML = "<option value=''>Everyone</option><option value='none'>Unassigned</option>" + C.team.map(function (u) { return "<option value='" + u.id + "'" + (String(u.id) === st.who ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("");
      $("#s17-stage").innerHTML = "<option value=''>All stages</option>" + ORDER.map(function (s) { return "<option value='" + s + "'" + (s === st.stage ? " selected" : "") + ">" + STAGE[s][0] + "</option>"; }).join("");
      $$("#s17-lines button").forEach(function (b) { b.onclick = function () { st.line = b.dataset.l; filters(); counters(); rows(); }; });
    }
    function draw() { filters(); counters(); rows(); followups(); }
    function refresh() { return loadLeads().then(function (ok) { if (ok && $("#s17-rows")) draw(); }); }
    var step = function (d) { var ms = mlist(), i = ms.indexOf(st.month); if (i < 0) { st.month = ms[0]; } else if (ms[i - d]) st.month = ms[i - d]; draw(); };
    $("#s17-m").onchange = function () { st.month = this.value; draw(); };
    $("#s17-prev").onclick = function () { step(-1); }; $("#s17-next").onclick = function () { step(1); };
    $("#s17-qs").value = st.q; $("#s17-qs").oninput = function () { st.q = this.value; rows(); };
    $("#s17-who").onchange = function () { st.who = this.value; rows(); }; $("#s17-stage").onchange = function () { st.stage = this.value; rows(); };
    $("#s17-add").onclick = function () { addLead(refresh); };
    $("#s17-exp").onclick = function () { exportCsv(C.leads.filter(inMonth)); };
    if ($("#s17-imp")) $("#s17-imp").onclick = function () { importSheet(refresh); };
    Promise.all([meta(), loadLeads()]).then(function (r) { if (r[1] && $("#s17-rows")) draw(); });
  };

  // ================================================================ LEAD SIDE DRAWER
  function closeDrawer() { var d = $("#s17-dr"); if (d) { d.classList.remove("on"); setTimeout(function () { d.remove(); }, 200); } document.removeEventListener("keydown", escKey); }
  function escKey(e) { if (e.key === "Escape") closeDrawer(); }
  function drawer(id, after) {
    var go = function () {
      var l = C.leads.find(function (x) { return x.id === id; }); if (!l) return toast("Enquiry not found", true);
      closeDrawer(); var d = document.createElement("div"); d.id = "s17-dr"; d.className = "s17-dr"; document.body.appendChild(d);
      var f = l.fields || {}, fx = Object.keys(f).map(function (k) { return "<div class='kv'><small>" + esc(k.replace(/[_-]/g, " ")) + "</small><span>" + esc(f[k]) + "</span></div>"; }).join("");
      var tl = l.notes.slice().reverse().map(function (n) { var k = KIND[n.kind] || (n.sys ? ["activity", "System"] : KIND.note); return "<li class='" + (n.sys ? "sys" : "k-" + esc(n.kind || "note")) + "'><span class='s17-tli'>" + ic(k[0]) + "</span><div><small>" + esc(k[1]) + " · " + esc(n.user || "") + " · " + dd(n.t, true) + "</small><p>" + esc(n.text) + "</p>" + (n.outcome && n.outcome !== n.text ? "<small class='s17-out'>Outcome: " + esc(n.outcome) + "</small>" : "") + "</div></li>"; }).join("");
      var inp = function (id2, lab, v, t) { return "<label>" + lab + "<input id='" + id2 + "' type='" + (t || "text") + "' value='" + esc(v || "") + "'></label>"; };
      var sel = function (id2, lab, h) { return "<label>" + lab + "<select id='" + id2 + "'>" + h + "</select></label>"; };
      var nx = l.next_at ? l.next_at.replace(" ", "T").slice(0, 16) : "";
      d.innerHTML = "<div class='s17-dr-bg'></div><section class='s17-dr-p' role='dialog' aria-label='Lead details'>" +
        "<header><div><small class='muted'>#" + l.id + " · " + esc(C.sources[l.source] || l.source) + " · " + dd(l.created_at, true) + "</small><h2>" + esc(l.company || l.name) + "</h2>" + (l.company ? "<p class='muted'>" + esc(l.name) + (l.designation ? " · " + esc(l.designation) : "") + "</p>" : "") +
        "<div class='s17-hb'>" + badge(l.stage) + lineTag(l.line) + (overdue(l) ? "<span class='badge bad'>Follow-up overdue</span>" : "") + "</div></div><button class='icon-btn' id='dr-x' title='Close (Esc)'>" + ic("x") + "</button></header>" +
        "<div class='s17-acts'>" + (l.phone ? "<a class='btn sm' href='tel:" + esc(l.phone.replace(/[^\d+]/g, "")) + "'>" + ic("phone") + esc(l.phone) + "</a><a class='btn sm wa' target='_blank' rel='noopener' href='https://wa.me/" + waNum(l.phone) + "'>" + ic("message-circle") + "WhatsApp</a>" : "") +
          (l.email ? "<a class='btn sm' href='mailto:" + esc(l.email) + "'>" + ic("mail") + "Email</a>" : "") + (l.client_id ? "<a class='btn sm' href='#/clients/" + l.client_id + "'>" + ic("contact") + "Client 360</a>" : "") + "<a class='btn sm' href='#/quote/new?lead=" + l.id + "'>" + ic("receipt") + "New quotation</a></div>" +
        "<div class='s17-next'><b>" + ic("clock") + " Next follow-up</b><span>" + (l.next_at && open(l) ? dd(l.next_at, true) + " · " + esc(M.nextTypes[l.next_type] || "Follow-up") : "Not set") + "</span><small class='muted'>Last contact: " + (l.last_contact ? dd(l.last_contact, true) + " (" + ago(l.last_contact) + ")" : "never") + "</small></div>" +
        "<div class='s17-tabsb'><button class='on' data-p='act'>Log activity</button><button data-p='det'>Details</button><button data-p='tl'>Timeline (" + l.notes.length + ")</button></div>" +
        "<div class='s17-pane' data-p='act'><div class='s17-kinds'>" + Object.keys(KIND).map(function (k, i) { return "<button data-k='" + k + "' class='" + (i === 0 ? "on" : "") + "'>" + ic(KIND[k][0]) + KIND[k][1] + "</button>"; }).join("") + "</div>" +
          "<label>What happened?<textarea id='dr-txt' rows='3' placeholder='e.g. Called, client wants 3D before quotation. Site visit agreed.'></textarea></label>" +
          "<div class='s17-g2'><label>Outcome<select id='dr-out'><option value=''>—</option><option>Interested</option><option>Visit booked</option><option>Meeting booked</option><option>Wants quotation</option><option>Negotiating</option><option>No answer</option><option>Call back later</option><option>Not interested</option></select></label>" +
          sel("dr-st2", "Move stage to", "<option value=''>Keep: " + STAGE[l.stage][0] + "</option>" + ORDER.map(function (s) { return s === l.stage ? "" : "<option value='" + s + "'>" + STAGE[s][0] + "</option>"; }).join("")) + "</div>" +
          "<div class='s17-g2'><label>Next follow-up<input id='dr-nx' type='datetime-local' value='" + esc(nx) + "'></label>" + sel("dr-nt", "Type", opts(M.nextTypes, l.next_type || "call")) + "</div>" +
          "<div class='s17-quick'><small class='muted'>Quick:</small>" + [["Tomorrow 11am", 1, 11], ["In 3 days", 3, 11], ["Next week", 7, 11]].map(function (q) { return "<button class='btn sm ghost' data-d='" + q[1] + "' data-h='" + q[2] + "'>" + q[0] + "</button>"; }).join("") + "<button class='btn sm ghost' data-d='x'>Clear</button></div>" +
          "<div class='modal-actions'><button class='btn pri' id='dr-log'>" + ic("check") + "Save activity</button></div></div>" +
        "<div class='s17-pane' data-p='det' hidden><div class='s17-g2'>" + inp("dr-co", "Company", l.company) + inp("dr-n", "Contact name", l.name) + inp("dr-ds", "Designation", l.designation) + inp("dr-p", "Phone", l.phone) + inp("dr-e", "Email", l.email, "email") + inp("dr-lo", "Location", l.location) +
          sel("dr-li", "Business line", opts(M.lines, l.line, "—")) + sel("dr-lt", "Lead source", opts(M.leadTypes, l.lead_type || "new")) + srcSel("dr-src", l.source) +
          "<label>Project type<input id='dr-pt' list='dr-ptl' value='" + esc(l.project_type || l.service || "") + "'><datalist id='dr-ptl'>" + M.projectTypes.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("") + "</datalist></label>" +
          inp("dr-ar", "Area (sq ft)", l.area) + inp("dr-bu", "Budget", l.budget) + inp("dr-v", "Deal value (Rs)", l.value || "", "number") +
          sel("dr-qs", "Quotation", opts(M.quoteStatus, l.quote_status, "—")) + sel("dr-pr", "Priority", opts({ low: "Low", normal: "Normal", high: "High" }, l.priority || "normal")) +
          sel("dr-as", "Assigned to", "<option value=''>Nobody</option>" + C.team.map(function (u) { return "<option value='" + u.id + "'" + (u.id === l.assigned_to ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("")) +
          sel("dr-st", "Stage", ORDER.map(function (s) { return "<option value='" + s + "'" + (s === l.stage ? " selected" : "") + ">" + STAGE[s][0] + "</option>"; }).join("")) + "</div>" +
          "<label id='dr-lrw'" + (l.stage === "lost" ? "" : " hidden") + ">Reason closed / lost<input id='dr-lr' value='" + esc(l.lost_reason || "") + "'></label>" +
          (l.message ? "<div class='kv'><small>Message</small><span style='white-space:pre-wrap'>" + esc(l.message) + "</span></div>" : "") + fx +
          "<div class='modal-actions' style='justify-content:space-between'><span>" + (!l.client_id ? "<button class='btn sm' id='dr-cv'>" + ic("user") + "Make client</button>" : "") + (can("owner,admin") ? " <button class='btn sm ghost' id='dr-del' style='color:var(--bad)'>Delete</button>" : "") + "</span><button class='btn pri' id='dr-sv'>Save details</button></div></div>" +
        "<div class='s17-pane' data-p='tl' hidden><ul class='s17-tl'>" + (tl || "<p class='muted'>No history yet.</p>") + "</ul></div>" +
        "<p class='err' id='dr-err'></p></section>";
      W.fillIcons(d); requestAnimationFrame(function () { d.classList.add("on"); }); document.addEventListener("keydown", escKey);
      var kind = "call", err = function (m) { $("#dr-err").textContent = m || ""; };
      var done = function (r, msg) { if (!r.ok) { err(r.error); return; } var i = C.leads.findIndex(function (x) { return x.id === id; }); if (r.lead && i >= 0) C.leads[i] = r.lead; toast(msg); closeDrawer(); if (after) after(); };
      $("#dr-x").onclick = closeDrawer; d.querySelector(".s17-dr-bg").onclick = closeDrawer;
      $$(".s17-tabsb button", d).forEach(function (b) { b.onclick = function () { $$(".s17-tabsb button", d).forEach(function (x) { x.classList.toggle("on", x === b); }); $$(".s17-pane", d).forEach(function (p) { p.hidden = p.dataset.p !== b.dataset.p; }); }; });
      $$(".s17-kinds button", d).forEach(function (b) { b.onclick = function () { kind = b.dataset.k; $$(".s17-kinds button", d).forEach(function (x) { x.classList.toggle("on", x === b); }); }; });
      $$(".s17-quick [data-d]", d).forEach(function (b) { b.onclick = function () { if (b.dataset.d === "x") { $("#dr-nx").value = ""; return; } var t = new Date(Date.now() + b.dataset.d * 864e5); t.setHours(+b.dataset.h, 0, 0, 0); $("#dr-nx").value = ymd(t) + "T" + two(t.getHours()) + ":00"; }; });
      $("#dr-st").onchange = function () { $("#dr-lrw").hidden = this.value !== "lost"; };
      $("#dr-log").onclick = function () { api("lead_activity", { id: id, kind: kind, text: $("#dr-txt").value, outcome: $("#dr-out").value, stage: $("#dr-st2").value, next_at: $("#dr-nx").value, next_type: $("#dr-nt").value }).then(function (r) { done(r, "Activity saved ✓"); }); };
      $("#dr-sv").onclick = function () {
        api("lead_save", { id: id, source: $("#dr-src").disabled ? undefined : $("#dr-src").value, company: $("#dr-co").value, name: $("#dr-n").value, designation: $("#dr-ds").value, phone: $("#dr-p").value, email: $("#dr-e").value, location: $("#dr-lo").value, line: $("#dr-li").value, lead_type: $("#dr-lt").value,
          project_type: $("#dr-pt").value, area: $("#dr-ar").value, budget: $("#dr-bu").value, value: $("#dr-v").value, quote_status: $("#dr-qs").value, priority: $("#dr-pr").value, assigned_to: $("#dr-as").value, stage: $("#dr-st").value, lost_reason: $("#dr-lr").value }).then(function (r) { done(r, "Saved ✓"); });
      };
      if ($("#dr-cv")) $("#dr-cv").onclick = function () { if (!confirm("Create a client record for " + (l.company || l.name) + " and mark this enquiry as won?")) return; api("lead_convert", { id: id }).then(function (r) { if (!r.ok) return err(r.error); closeDrawer(); location.hash = "#/clients/" + r.client_id; }); };
      if ($("#dr-del")) $("#dr-del").onclick = function () { if (!confirm("Delete enquiry #" + id + "? This cannot be undone.")) return; api("lead_delete", { id: id }).then(function (r) { if (!r.ok) return err(r.error); C.leads = C.leads.filter(function (x) { return x.id !== id; }); toast("Deleted"); closeDrawer(); if (after) after(); }); };
      if (!l.read) api("lead_save", { id: id, read: true });
    };
    Promise.all([meta(), C.leads.some(function (x) { return x.id === id; }) ? true : loadLeads()]).then(go);
  }
  W.leadDrawer = drawer;

  function addLead(after) {
    W.modal("<h2>Add lead</h2><div class='s17-g2'><label>Company<input id='al-co'></label><label>Contact name *<input id='al-n'></label><label>Phone<input id='al-p'></label><label>Location<input id='al-lo'></label>" +
      "<label>Business line<select id='al-li'>" + opts(M.lines, "", "—") + "</select></label><label>Lead source<select id='al-lt'>" + opts(M.leadTypes, "new") + "</select></label>" + srcSel("al-src", "manual") +
      "<label>Assigned to<select id='al-as'><option value=''>Nobody</option>" + C.team.map(function (u) { return "<option value='" + u.id + "'" + (S.user && u.id === S.user.id ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("") + "</select></label>" +
      "<label>First follow-up<input id='al-nx' type='datetime-local'></label></div><label>Note<textarea id='al-m' rows='2'></textarea></label><p class='err' id='al-err'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='al-go'>Add lead</button></div>");
    var dk = W.formDraft("lead", "#modal-card [id^='al-']");
    $("#al-go").onclick = function () {
      var name = $("#al-n").value.trim() || $("#al-co").value.trim();
      if (!name) { $("#al-err").textContent = "Enter a contact name or company."; $("#al-n").focus(); return; }
      api("lead_save", { name: name, source: $("#al-src").value, company: $("#al-n").value.trim() ? $("#al-co").value : "", phone: $("#al-p").value, location: $("#al-lo").value, line: $("#al-li").value, lead_type: $("#al-lt").value, assigned_to: $("#al-as").value, next_at: $("#al-nx").value, next_type: "call", message: $("#al-m").value })
        .then(function (r) { if (!r.ok) { $("#al-err").textContent = r.error; return; } dk.clear(); W.closeModal(); toast("Lead added ✓"); after(); }).catch(function () { $("#al-err").textContent = "Could not reach the server — your draft is kept, try again."; });
    };
  }

  // ---------------------------------------------------------------- export / sheet import (with column mapping + preview)
  var cell = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function exportCsv(list) {
    var cols = ["Date", "Company", "Name", "Contact", "Designation", "Location", "Lead source", "Line", "Assigned to", "Quotation", "Last contact", "Stage", "Next follow-up", "Value", "Note"];
    var rows = [cols.join(",")].concat(list.map(function (l) { return [String(l.created_at).slice(0, 10), l.company, l.name, l.phone, l.designation, l.location, (M.leadTypes[l.lead_type] || ""), (M.lines[l.line] || ""), l.assigned_name, (M.quoteStatus[l.quote_status] || ""), String(l.last_contact).slice(0, 10), STAGE[l.stage][0], String(l.next_at).slice(0, 16), l.value || "", l.message].map(cell).join(","); }));
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv" })); a.download = "woodex-leads-" + (S.s17q.month || "all") + ".csv"; a.click();
  }
  function parseCsv(t) {
    var rows = [], row = [], c = "", q = false; t = t.replace(/^\ufeff/, "");
    for (var i = 0; i < t.length; i++) { var ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === "," || ch === "\t") { row.push(c); c = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(c); rows.push(row); row = []; c = ""; } else c += ch; }
    row.push(c); rows.push(row); return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
  }
  var FIELDS = [["date", "Date"], ["company", "Company"], ["name", "Name"], ["phone", "Contact / phone"], ["designation", "Designation"], ["location", "Location"], ["source", "Lead source (Client / New lead)"], ["line", "Line (Furniture / Interior / Project)"],
    ["assigned", "Assigned to"], ["quotation", "Quotation (Pending / Proposal / Done)"], ["last_contact", "Last contact"], ["action", "Action (Visit / Meeting / Hold / Won / Close)"], ["meeting", "Meeting schedule"], ["note", "Note"]];
  var GUESS = { date: /^date/, company: /compan|business|firm/, name: /^(name|contact name|client)/, phone: /contact|phone|mobile|cell|whats/, designation: /desig|title|role/, location: /locat|city|area|address/, source: /lead ?source|source/, line: /status|line|category/,
    assigned: /assign|owner|sales ?person/, quotation: /quot/, last_contact: /last/, action: /action|stage/, meeting: /meet|schedul|visit date/, note: /note|remark|comment/ };
  function importSheet(after) {
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = ".csv,.tsv,.txt";
    fi.onchange = function () { var f = fi.files[0]; if (!f) return; f.text().then(function (t) {
      var rows = parseCsv(t); if (rows.length < 2) return toast("That file has no rows", true);
      var hi = 0; for (var i = 0; i < Math.min(rows.length, 8); i++) if (rows[i].filter(function (c) { return /name|compan|contact|date/i.test(c); }).length >= 2) { hi = i; break; }
      var hdr = rows[hi].map(function (h) { return h.trim(); }), data = rows.slice(hi + 1), map = {};
      FIELDS.forEach(function (fd) { var used = Object.keys(map).map(function (k) { return map[k]; }); var j = hdr.findIndex(function (h, x) { return used.indexOf(x) < 0 && GUESS[fd[0]].test(h.toLowerCase()); }); map[fd[0]] = j; });
      var build = function () { return data.map(function (r) { var o = {}; FIELDS.forEach(function (fd) { var j = map[fd[0]]; o[fd[0]] = j >= 0 ? String(r[j] || "").trim() : ""; }); return o; }).filter(function (o) { return o.name || o.company; }); };
      var pv = function () { var L = build(); $("#im-pv").innerHTML = "<p class='muted sm'>" + L.length + " rows will be imported (duplicates with the same name + phone are skipped). First 5:</p><div class='tbl-wrap'><table class='tbl sm'><thead><tr>" + FIELDS.slice(0, 12).map(function (fd) { return "<th>" + fd[1].split(" (")[0] + "</th>"; }).join("") + "</tr></thead><tbody>" + L.slice(0, 5).map(function (o) { return "<tr>" + FIELDS.slice(0, 12).map(function (fd) { return "<td>" + esc(o[fd[0]]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; };
      W.modal("<h2>Import lead sheet</h2><p class='muted'>Export each monthly tab from Google Sheets as <b>CSV</b>, then upload. Check that the columns match:</p><div class='s17-map'>" + FIELDS.map(function (fd) { return "<label>" + fd[1] + "<select data-f='" + fd[0] + "'><option value='-1'>— skip —</option>" + hdr.map(function (h, j) { return "<option value='" + j + "'" + (map[fd[0]] === j ? " selected" : "") + ">" + esc(h || "Column " + (j + 1)) + "</option>"; }).join("") + "</select></label>"; }).join("") + "</div><div id='im-pv'></div><label class='check' style='margin-top:10px'><input type='checkbox' id='im-cl' checked> Also add each person to the <b>Clients</b> database (matched by phone, so no duplicates)</label><p class='err' id='im-err'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='im-go'>Import</button></div>");
      $("#modal-card").classList.add("wide"); pv();
      $$(".s17-map select").forEach(function (s) { s.onchange = function () { map[s.dataset.f] = +s.value; pv(); }; });
      $("#im-go").onclick = function () { var L = build(); if (!L.length) return; this.disabled = true; api("leads_import2", { rows: L, clients: !$("#im-cl") || $("#im-cl").checked }).then(function (r) { if (!r.ok) { $("#im-err").textContent = r.error; $("#im-go").disabled = false; return; } $("#modal-card").classList.remove("wide"); W.closeModal(); toast(r.imported + " leads imported" + (r.clientsNew != null ? " · " + r.clientsNew + " new clients, " + r.clientsLinked + " linked" : "") + (r.skipped ? " · " + r.skipped + " skipped" : "") + " ✓"); S.s17q.month = ""; after(); }); };
    }); };
    fi.click();
  }

  // ================================================================ CLIENT MASTER + CLIENT 360
  var CST = { prospect: ["Prospect", "info"], active: ["Active", "ok"], returning: ["Returning", "gold"], past: ["Past", ""] };
  var cst = function (s) { var x = CST[s] || [s, ""]; return "<span class='badge " + x[1] + "'>" + x[0] + "</span>"; };
  W.VIEWS.clients = function (el, parts) {
    if (parts && /^\d+$/.test(parts[0] || "")) return c360(el, +parts[0]);
    var st = S.s17c || (S.s17c = { q: "", status: "", type: "" });
    el.innerHTML = head("Clients", "Clients", (can("owner,admin") ? '<button class="btn" id="cm-merge">' + ic("users-round") + "Merge duplicates</button>" : "") + '<button class="btn pri" id="cm-add">' + ic("plus") + "Add client</button>") +
      '<div class="grid kpis" id="cm-k"></div><div class="card"><div class="s17-filters"><input type="search" id="cm-q" placeholder="Search name, company, phone, city…"><select id="cm-st"><option value="">All statuses</option>' + Object.keys(CST).map(function (k) { return "<option value='" + k + "'>" + CST[k][0] + "</option>"; }).join("") + '</select><select id="cm-ty"></select></div>' +
      '<div class="tbl-wrap"><table class="tbl s17-tbl"><thead><tr><th>Client</th><th>Contact</th><th>Type</th><th>Status</th><th class="r">Quotes</th><th class="r">Lifetime value</th><th class="r">Balance</th><th>Projects</th><th>Last activity</th></tr></thead><tbody id="cm-rows"><tr><td colspan="9" class="empty">Loading…</td></tr></tbody></table></div></div>';
    var all = [];
    var draw = function () {
      var q = st.q.toLowerCase(), L = all.filter(function (c) { return (!st.status || c.status === st.status) && (!st.type || c.type === st.type) && (!q || [c.name, c.company, c.phone, c.email, c.city, c.tags.join(" ")].join(" ").toLowerCase().indexOf(q) >= 0); });
      var sum = function (k) { return all.reduce(function (a, c) { return a + c[k]; }, 0); }, kp = function (i, t, v, b) { return "<div class='card kpi'><div class='kpi-ic'>" + ic(i) + "</div><small>" + t + "</small><div class='kpi-row'><b>" + v + "</b>" + (b || "") + "</div></div>"; };
      $("#cm-k").innerHTML = kp("contact", "Clients", all.length, "<span class='badge ok'>" + all.filter(function (c) { return c.status === "active"; }).length + " active</span>") + kp("refresh-cw", "Returning", all.filter(function (c) { return c.status === "returning"; }).length) +
        kp("receipt", "Lifetime billed", pkr(sum("lifetime")).replace("Rs ", ""), "<span class='badge gold'>Rs</span>") + kp("triangle-alert", "Outstanding balance", pkr(sum("balance")).replace("Rs ", ""), sum("balance") ? "<span class='badge bad'>to collect</span>" : "");
      W.fillIcons($("#cm-k"));
      $("#cm-rows").innerHTML = L.length ? L.map(function (c) {
        return "<tr data-id='" + c.id + "'><td><b>" + esc(c.company || c.name) + "</b>" + (c.company ? "<small class='muted d'>" + esc(c.name) + "</small>" : "") + "</td><td class='nw'>" + esc(c.phone || "—") + "<small class='muted d'>" + esc(c.city || "") + "</small></td>" +
          "<td>" + esc((M.clientTypes[c.type]) || "—") + (c.line ? " " + lineTag(c.line) : "") + "</td><td>" + cst(c.status) + "</td><td class='r'>" + c.quotes + (c.openQuotes ? " <small class='muted'>(" + c.openQuotes + " open)</small>" : "") + "</td>" +
          "<td class='r nw'><b>" + pkr(c.lifetime) + "</b></td><td class='r nw" + (c.balance ? " s17-red" : "") + "'>" + (c.balance ? pkr(c.balance) : "<span class='muted'>—</span>") + "</td><td>" + (c.projects || "—") + "</td><td class='nw'>" + dd(c.last) + "<small class='muted d'>" + ago(c.last) + "</small></td></tr>";
      }).join("") : "<tr><td colspan='9' class='empty'>No clients yet. Use “Make client” on a won lead.</td></tr>";
      $$("#cm-rows tr[data-id]").forEach(function (tr) { tr.onclick = function () { location.hash = "#/clients/" + tr.dataset.id; }; });
    };
    var load = function () { return api("clients_master").then(function (r) { if (!r.ok) return toast(r.error, true); all = r.clients; if ($("#cm-rows")) draw(); }); };
    meta().then(function () { $("#cm-ty").innerHTML = "<option value=''>All types</option>" + opts(M.clientTypes, st.type); load(); });
    $("#cm-q").value = st.q; $("#cm-q").oninput = function () { st.q = this.value; draw(); };
    $("#cm-st").value = st.status; $("#cm-st").onchange = function () { st.status = this.value; draw(); }; $("#cm-ty").onchange = function () { st.type = this.value; draw(); };
    $("#cm-add").onclick = function () { clientForm({}, function (id) { location.hash = "#/clients/" + id; }); };
    if ($("#cm-merge")) $("#cm-merge").onclick = function () {
      var o = all.map(function (c) { return "<option value='" + c.id + "'>" + esc((c.company ? c.company + " — " : "") + c.name + (c.phone ? " · " + c.phone : "")) + "</option>"; }).join("");
      W.modal("<h2>Merge duplicate clients</h2><p class='muted'>Everything (enquiries, quotations, invoices, projects) moves from the duplicate onto the record you keep. The duplicate is then deleted.</p><label>Keep this client<select id='mg-k'>" + o + "</select></label><label>Merge &amp; delete this duplicate<select id='mg-d'>" + o + "</select></label><p class='err' id='mg-e'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='mg-go'>Merge</button></div>");
      if (all[1]) $("#mg-d").value = all[1].id;
      $("#mg-go").onclick = function () { if (!confirm("Merge? This cannot be undone.")) return; api("clients_merge", { keep: $("#mg-k").value, merge: $("#mg-d").value }).then(function (r) { if (!r.ok) { $("#mg-e").textContent = r.error; return; } W.closeModal(); toast("Merged ✓"); load(); }); };
    };
  };
  function clientForm(c, after) {
    var f = function (id, lab, v, t) { return "<label>" + lab + "<input id='" + id + "' type='" + (t || "text") + "' value='" + esc(v || "") + "'></label>"; };
    W.modal("<h2>" + (c.id ? "Edit client" : "Add client") + "</h2><div class='s17-g2'>" + f("cf-n", "Contact name *", c.name) + f("cf-co", "Company", c.company) + f("cf-ds", "Designation", c.designation) + f("cf-p", "Phone", c.phone) + f("cf-e", "Email", c.email, "email") + f("cf-c", "City", c.city || "Lahore") +
      "<label>Client type<select id='cf-t'>" + opts(M.clientTypes, c.type, "—") + "</select></label><label>Business line<select id='cf-l'>" + opts(M.lines, c.line, "—") + "</select></label>" + f("cf-s", "Came from (source)", c.source) + f("cf-tg", "Tags (comma separated)", (c.tags || []).join(", ")) + "</div>" +
      f("cf-a", "Address", c.address) + "<label>Notes<textarea id='cf-no' rows='3'>" + esc(c.notes || "") + "</textarea></label><p class='err' id='cf-err'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='cf-go'>Save</button></div>");
    $("#modal-card").classList.add("wide");
    $("#cf-go").onclick = function () {
      api("client_save", { id: c.id || 0, name: $("#cf-n").value, company: $("#cf-co").value, designation: $("#cf-ds").value, phone: $("#cf-p").value, email: $("#cf-e").value, city: $("#cf-c").value, type: $("#cf-t").value, line: $("#cf-l").value, source: $("#cf-s").value, tags: $("#cf-tg").value, address: $("#cf-a").value, notes: $("#cf-no").value })
        .then(function (r) { if (!r.ok) { $("#cf-err").textContent = r.error; return; } $("#modal-card").classList.remove("wide"); W.closeModal(); toast("Saved ✓"); after(+(r.client && r.client.id) || c.id); });
    };
  }
  function c360(el, id) {
    el.innerHTML = "<div class='empty'>Loading client…</div>";
    Promise.all([meta(), api("client_360", { id: id })]).then(function (res) {
      var r = res[1]; if (!r.ok) { el.innerHTML = "<div class='card card-b'><p class='err'>" + esc(r.error) + "</p><a class='btn' href='#/clients'>Back to clients</a></div>"; return; }
      var c = r.client, k = r.kpis, pct = k.lifetime ? Math.round(100 * k.paid / k.lifetime) : 0;
      var TLI = { lead: "inbox", note: "file-text", quote: "receipt", invoice: "file-text", payment: "receipt", project: "briefcase" };
      var link = function (t) { return t.k === "lead" || t.k === "note" ? "#lead-" + t.id : t.k === "quote" ? "#/quote/" + t.id : t.k === "invoice" || t.k === "payment" ? "#/invoice/" + t.id : "#/projects"; };
      el.innerHTML = "<div class='s17-crumb'><a href='#/clients'>Clients</a> / " + esc(c.company || c.name) + "</div>" +
        "<div class='card s17-ch'><div class='s17-av'>" + esc((c.company || c.name).trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase()) + "</div><div class='s17-chi'><h1>" + esc(c.company || c.name) + " " + cst(r.status) + "</h1>" +
          "<p class='muted'>" + (c.company ? esc(c.name) + (c.designation ? " · " + esc(c.designation) : "") + " · " : "") + esc(M.clientTypes[c.type] || "Client") + (c.line ? " · " + esc(M.lines[c.line]) : "") + " · since " + dd(c.created_at) + " " + String(c.created_at).slice(0, 4) + "</p>" +
          "<div class='s17-acts'>" + (c.phone ? "<a class='btn sm' href='tel:" + esc(c.phone.replace(/[^\d+]/g, "")) + "'>" + ic("phone") + esc(c.phone) + "</a><a class='btn sm wa' target='_blank' rel='noopener' href='https://wa.me/" + waNum(c.phone) + "'>" + ic("message-circle") + "WhatsApp</a>" : "") + (c.email ? "<a class='btn sm' href='mailto:" + esc(c.email) + "'>" + ic("mail") + esc(c.email) + "</a>" : "") + (c.city ? "<span class='btn sm ghost'>" + ic("map-pin") + esc(c.city) + "</span>" : "") + "</div></div>" +
          "<div class='s17-cha'><button class='btn' id='c3-ed'>" + ic("edit") + "Edit</button><a class='btn' href='#/quote/new?client=" + c.id + "'>" + ic("receipt") + "New quotation</a><button class='btn pri' id='c3-lead'>" + ic("plus") + "New enquiry</button></div></div>" +
        "<div class='grid kpis'>" + [["receipt", "Lifetime value", pkr(k.lifetime), r.invoices.length + " invoice" + (r.invoices.length === 1 ? "" : "s")], ["circle-check", "Paid", pkr(k.paid), pct + "% collected"], ["triangle-alert", "Balance due", pkr(k.balance), k.balance ? "to collect" : "all clear"], ["file-text", "Quoted", pkr(k.quoted), r.quotes.length + " quotation" + (r.quotes.length === 1 ? "" : "s")], ["briefcase", "Projects", k.projects, "last activity " + ago(k.last)]].map(function (x, i) {
          return "<div class='card kpi'><div class='kpi-ic'>" + ic(x[0]) + "</div><small>" + x[1] + "</small><div class='kpi-row'><b" + (i === 2 && k.balance ? " style='color:var(--bad)'" : "") + ">" + x[2] + "</b></div><small class='muted'>" + x[3] + "</small>" + (i === 1 && k.lifetime ? "<div class='s17-bar2'><i style='width:" + pct + "%'></i></div>" : "") + "</div>"; }).join("") + "</div>" +
        "<div class='s17-c3'><div><div class='card'><div class='tabs s17-c3t'><button class='on' data-p='q'>Quotations (" + r.quotes.length + ")</button><button data-p='i'>Invoices (" + r.invoices.length + ")</button><button data-p='p'>Projects (" + r.projects.length + ")</button><button data-p='l'>Enquiries (" + r.leads.length + ")</button></div>" +
          "<div class='tbl-wrap' data-p='q'><table class='tbl'><thead><tr><th>No.</th><th>Date</th><th>Title</th><th>Status</th><th class='r'>Total</th></tr></thead><tbody>" + (r.quotes.map(function (q) { return "<tr data-h='#/quote/" + q.id + "'><td><b>" + esc(q.label || q.no) + "</b></td><td>" + dd(q.date || q.created_at) + "</td><td>" + esc(q.title || q.project || "") + "</td><td><span class='badge st-" + esc(q.status) + "'>" + esc(q.status) + "</span></td><td class='r'>" + pkr(q.total) + "</td></tr>"; }).join("") || "<tr><td colspan='5' class='empty'>No quotations yet.</td></tr>") + "</tbody></table></div>" +
          "<div class='tbl-wrap' data-p='i' hidden><table class='tbl'><thead><tr><th>Invoice</th><th>Date</th><th class='r'>Total</th><th class='r'>Received</th><th class='r'>Balance</th><th>Status</th></tr></thead><tbody>" + (r.invoices.map(function (v) { return "<tr data-h='#/invoice/" + v.id + "'" + (v.overdue ? " class='s17-od'" : "") + "><td><b>" + esc(v.no) + "</b></td><td>" + dd(v.issue_date) + "</td><td class='r'>" + pkr(v.total) + "</td><td class='r'>" + pkr(v.paid) + "</td><td class='r" + (v.balance ? " s17-red" : "") + "'>" + pkr(v.balance) + "</td><td><span class='badge " + (v.payStatus === "paid" ? "ok" : v.payStatus === "partial" ? "warn" : "bad") + "'>" + esc(v.payStatus) + "</span></td></tr>"; }).join("") || "<tr><td colspan='6' class='empty'>No invoices yet.</td></tr>") + "</tbody></table></div>" +
          "<div class='tbl-wrap' data-p='p' hidden><table class='tbl'><thead><tr><th>Project</th><th>Site</th><th>Stage</th><th>Start</th><th class='r'>Value</th></tr></thead><tbody>" + (r.projects.map(function (p) { return "<tr data-h='#/projects'><td><b>" + esc(p.name) + "</b></td><td>" + esc(p.site || "") + "</td><td><span class='badge'>" + esc(p.stage) + "</span></td><td>" + dd(p.start) + "</td><td class='r'>" + pkr(p.value) + "</td></tr>"; }).join("") || "<tr><td colspan='5' class='empty'>No projects yet.</td></tr>") + "</tbody></table></div>" +
          "<div class='tbl-wrap' data-p='l' hidden><table class='tbl'><thead><tr><th>#</th><th>Date</th><th>Project type</th><th>Stage</th><th>Next follow-up</th></tr></thead><tbody>" + (r.leads.map(function (l) { return "<tr data-lead='" + l.id + "'><td>#" + l.id + "</td><td>" + dd(l.created_at) + "</td><td>" + esc(l.project_type || l.service || "—") + "</td><td>" + badge(l.stage) + "</td><td class='" + (overdue(l) ? "s17-red" : "") + "'>" + (l.next_at && open(l) ? dd(l.next_at, true) : "—") + "</td></tr>"; }).join("") || "<tr><td colspan='5' class='empty'>No enquiries linked.</td></tr>") + "</tbody></table></div></div>" +
          (c.notes ? "<div class='card card-b' style='margin-top:16px'><h3 class='ld-h'>Notes</h3><p style='white-space:pre-wrap'>" + esc(c.notes) + "</p></div>" : "") + "</div>" +
        "<aside><div class='card card-b s17-next'><b>" + ic("clock") + " Next follow-up</b>" + (r.next ? "<span>" + dd(r.next.at, true) + " · " + esc(M.nextTypes[r.next.type] || "Follow-up") + "</span><a href='#' data-lead='" + r.next.lead + "' class='btn sm'>Open enquiry #" + r.next.lead + "</a>" : "<span class='muted'>Nothing scheduled</span>") + "</div>" +
          "<div class='card'><div class='card-h'><h3>Timeline</h3></div><ul class='s17-tl card-b'>" + (r.timeline.map(function (t) { return "<li class='k-" + t.k + "'><span class='s17-tli'>" + ic(TLI[t.k] || "info") + "</span><div><small>" + dd(t.t, true) + " " + String(t.t).slice(0, 4) + "</small><p><a href='" + link(t) + "'" + (t.k === "lead" || t.k === "note" ? " data-lead='" + t.id + "'" : "") + ">" + esc(t.title) + "</a></p><small class='muted'>" + esc(t.sub || "") + "</small></div></li>"; }).join("") || "<p class='muted'>No activity yet.</p>") + "</ul></div>" +
          (c.tags.length || c.source || c.address ? "<div class='card card-b'>" + (c.address ? "<div class='kv'><small>Address</small><span>" + esc(c.address) + "</span></div>" : "") + (c.source ? "<div class='kv'><small>Came from</small><span>" + esc(c.source) + "</span></div>" : "") + (c.tags.length ? "<div class='kv'><small>Tags</small><span>" + c.tags.map(function (t) { return "<span class='badge'>" + esc(t) + "</span>"; }).join(" ") + "</span></div>" : "") + "</div>" : "") + "</aside></div>";
      W.fillIcons(el);
      if (W.p19cClient) W.p19cClient(el, c); /*P19 C*/
      $$(".s17-c3t button", el).forEach(function (b) { b.onclick = function () { $$(".s17-c3t button", el).forEach(function (x) { x.classList.toggle("on", x === b); }); $$(".s17-c3 .tbl-wrap[data-p]", el).forEach(function (p) { p.hidden = p.dataset.p !== b.dataset.p; }); }; });
      $$("[data-h]", el).forEach(function (tr) { tr.style.cursor = "pointer"; tr.onclick = function () { location.hash = tr.dataset.h; }; });
      var reload = function () { c360(el, id); };
      $$("[data-lead]", el).forEach(function (a) { a.style.cursor = "pointer"; a.onclick = function (e) { e.preventDefault(); C.leads = []; loadLeads().then(function () { drawer(+a.dataset.lead, reload); }); }; });
      $("#c3-ed").onclick = function () { clientForm(c, reload); };
      $("#c3-lead").onclick = function () { api("lead_save", { name: c.name, company: c.company, phone: c.phone, email: c.email, location: c.city, line: c.line, lead_type: "returning", client_id: c.id }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Enquiry #" + x.lead.id + " added ✓"); loadLeads().then(function () { drawer(x.lead.id, reload); }); }); };
    });
  }

  // ================================================================ S3 INVOICE TRACKER
  OLD.invoices = W.VIEWS.invoices;
  var TRK = { paid: ["Paid", "ok"], partial: ["Partial", "warn"], after_delivery: ["After delivery", "info"], unpaid: ["Unpaid", "bad"] };
  var trk = function (s) { var x = TRK[s] || [s, ""]; return "<span class='badge " + x[1] + "'>" + x[0] + "</span>"; };
  var num = function (n) { return Math.round(+n || 0).toLocaleString("en-PK"); };
  var lakh = function (n) { n = +n || 0; return n >= 1e7 ? (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr" : n >= 1e5 ? (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + " L" : num(n); };
  /** Generic CSV → mapped rows modal (used by invoice import). */
  function csvMapper(title, help, FL, GS, onRows) {
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = ".csv,.tsv,.txt";
    fi.onchange = function () { var f = fi.files[0]; if (!f) return; f.text().then(function (t) {
      var rows = parseCsv(t); if (rows.length < 2) return toast("That file has no rows", true);
      var hi = 0; for (var i = 0; i < Math.min(rows.length, 8); i++) if (rows[i].filter(function (c) { return FL.some(function (fd) { return GS[fd[0]].test(c.trim().toLowerCase()); }); }).length >= 3) { hi = i; break; }
      var hdr = rows[hi].map(function (h) { return h.trim(); }), data = rows.slice(hi + 1), map = {};
      FL.forEach(function (fd) { var used = Object.keys(map).map(function (k) { return map[k]; }); map[fd[0]] = hdr.findIndex(function (h, x) { return used.indexOf(x) < 0 && GS[fd[0]].test(h.toLowerCase()); }); });
      var build = function () { return data.map(function (r) { var o = {}; FL.forEach(function (fd) { var j = map[fd[0]]; o[fd[0]] = j >= 0 ? String(r[j] || "").trim() : ""; }); return o; }); };
      var pv = function () { var L = build(); $("#cm-pv").innerHTML = "<p class='muted sm'>" + L.length + " rows found. First 5:</p><div class='tbl-wrap'><table class='tbl sm'><thead><tr>" + FL.map(function (fd) { return "<th>" + fd[1].split(" (")[0] + "</th>"; }).join("") + "</tr></thead><tbody>" + L.slice(0, 5).map(function (o) { return "<tr>" + FL.map(function (fd) { return "<td>" + esc(o[fd[0]]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; };
      W.modal("<h2>" + title + "</h2><p class='muted'>" + help + "</p><div class='s17-map'>" + FL.map(function (fd) { return "<label>" + fd[1] + "<select data-f='" + fd[0] + "'><option value='-1'>— skip —</option>" + hdr.map(function (h, j) { return "<option value='" + j + "'" + (map[fd[0]] === j ? " selected" : "") + ">" + esc(h || "Column " + (j + 1)) + "</option>"; }).join("") + "</select></label>"; }).join("") + "</div><div id='cm-pv'></div><p class='err' id='cm-err'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='cm-go'>Import</button></div>");
      $("#modal-card").classList.add("wide"); pv();
      $$(".s17-map select").forEach(function (s) { s.onchange = function () { map[s.dataset.f] = +s.value; pv(); }; });
      $("#cm-go").onclick = function () { var b = this; b.disabled = true; onRows(build(), function (e) { if (e) { $("#cm-err").textContent = e; b.disabled = false; } else { $("#modal-card").classList.remove("wide"); W.closeModal(); } }); };
    }); };
    fi.click();
  }
  W.VIEWS.invoices = function (el, parts) {
    if (parts && parts[0] === "classic") return OLD.invoices(el, []);
    var st = S.s17i || (S.s17i = { year: today().slice(0, 4), month: today().slice(0, 7), track: "", line: "", q: "" }), D = null;
    var admin = can("owner,admin");
    el.innerHTML = head("Invoice tracking", "Invoices", '<a class="btn" href="#/invoices/classic">' + ic("layers") + "Classic list</a>" + (admin ? '<button class="btn" id="it-imp">' + ic("upload") + "Import sheet</button>" : "") + '<button class="btn" id="it-exp">' + ic("download") + 'Export</button><button class="btn pri" id="it-new">' + ic("plus") + "New invoice</button>") +
      '<div class="s17-bar"><div class="s17-month"><select id="it-y"></select></div><div class="seg" id="it-lines"></div></div>' +
      '<div class="it-months" id="it-m"></div><div class="it-tot" id="it-tot"></div>' +
      '<div class="card"><div class="s17-filters"><input type="search" id="it-q" placeholder="Search invoice, PO, company…"><div class="seg" id="it-st"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl s17-tbl"><thead><tr><th>Date</th><th>PO #</th><th>Invoice</th><th>Company</th><th class="r">Total</th><th class="r">Received</th><th class="r">Balance</th><th>Status</th><th>Delivery</th><th>Note</th><th></th></tr></thead><tbody id="it-rows"><tr><td colspan="11" class="empty">Loading…</td></tr></tbody></table></div></div>';
    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var base = function () { return D.rows.filter(function (i) { return (!st.month || i.issue_date.slice(0, 7) === st.month) && (!st.line || i.line === st.line); }); };
    function draw() {
      $("#it-y").innerHTML = D.years.map(function (y) { return "<option" + (y === st.year ? " selected" : "") + ">" + y + "</option>"; }).join("");
      $("#it-lines").innerHTML = [["", "All"], ["interior", "Interior (WI)"], ["furniture", "Furniture (WF)"]].map(function (x) { return "<button data-l='" + x[0] + "' class='" + (st.line === x[0] ? "on" : "") + "'>" + x[1] + "</button>"; }).join("");
      var ym = D.months, mx = Math.max.apply(null, Object.keys(ym).map(function (k) { return ym[k].total; }).concat([1]));
      var yt = Object.keys(ym).reduce(function (a, k) { a.c += ym[k].count; a.t += ym[k].total; a.r += ym[k].received; return a; }, { c: 0, t: 0, r: 0 });
      $("#it-m").innerHTML = "<button class='it-mo all" + (!st.month ? " on" : "") + "' data-m=''><small>Whole " + D.year + "</small><b>" + lakh(yt.t) + "</b><span>" + yt.c + " inv</span></button>" + Object.keys(ym).map(function (k, i) { var m = ym[k], fut = k > today().slice(0, 7);
        return "<button class='it-mo" + (st.month === k ? " on" : "") + (fut ? " fut" : "") + "' data-m='" + k + "'><small>" + MN[i] + "</small><b>" + (m.count ? lakh(m.total) : "—") + "</b><i class='it-bar'><em style='height:" + Math.round(100 * m.total / mx) + "%'><u style='height:" + (m.total ? Math.round(100 * m.received / m.total) : 0) + "%'></u></em></i><span>" + (m.count ? m.count + " inv" : "") + "</span></button>"; }).join("");
      var L = base(), s = function (k) { return L.reduce(function (a, i) { return a + i[k]; }, 0); }, tot = s("total"), rec = s("paid"), late = L.filter(function (i) { return i.late; }).length;
      $("#it-tot").innerHTML = "<div class='it-t'><small>" + (st.month ? mlabel(st.month) : "Year " + D.year) + "</small><b>" + L.length + " invoices</b></div><div class='it-t'><small>Total</small><b>" + num(tot) + "</b></div><div class='it-t ok'><small>Received</small><b>" + num(rec) + "</b><i class='s17-bar2'><i style='width:" + (tot ? Math.round(100 * rec / tot) : 0) + "%'></i></i></div><div class='it-t bad'><small>Balance</small><b>" + num(tot - rec) + "</b></div>" +
        "<div class='it-t" + (late ? " bad" : "") + "'><small>Late deliveries</small><b>" + late + "</b><span class='muted sm'>" + D.lateAll + " in all years</span></div>";
      var cnt = function (k) { return L.filter(function (i) { return k === "late" ? i.late : i.track === k; }).length; };
      $("#it-st").innerHTML = [["", "All", L.length], ["paid", "Paid", cnt("paid")], ["partial", "Partial", cnt("partial")], ["after_delivery", "After delivery", cnt("after_delivery")], ["unpaid", "Unpaid", cnt("unpaid")], ["late", "Late delivery", cnt("late")]].map(function (x) { return "<button data-t='" + x[0] + "' class='" + (st.track === x[0] ? "on" : "") + "'>" + x[1] + " <small>" + x[2] + "</small></button>"; }).join("");
      rows(L);
      $$("#it-m [data-m]").forEach(function (b) { b.onclick = function () { st.month = b.dataset.m; draw(); }; });
      $$("#it-lines button").forEach(function (b) { b.onclick = function () { st.line = b.dataset.l; draw(); }; });
      $$("#it-st button").forEach(function (b) { b.onclick = function () { st.track = b.dataset.t; draw(); }; });
    }
    function rows(L) {
      var q = st.q.toLowerCase(); L = L.filter(function (i) { return (!st.track || (st.track === "late" ? i.late : i.track === st.track)) && (!q || [i.no, i.po, i.company, i.client.name, i.track_note, i.project].join(" ").toLowerCase().indexOf(q) >= 0); });
      $("#it-rows").innerHTML = L.length ? L.map(function (i) { var pc = i.total ? Math.round(100 * i.paid / i.total) : 0;
        return "<tr data-id='" + i.id + "' class='" + (i.late ? "s17-od" : "") + "'><td class='nw'>" + dd(i.issue_date) + "</td><td>" + esc(i.po || "—") + "</td><td class='nw'><b>" + esc(i.no) + "</b>" + (i.quote_id ? "<small class='muted d'>from quotation</small>" : "") + "</td>" +
          "<td><b>" + esc(i.company) + "</b>" + (i.project ? "<small class='muted d'>" + esc(i.project) + "</small>" : "") + "</td><td class='r nw'>" + num(i.total) + "</td><td class='r nw'>" + num(i.paid) + "<i class='it-pc'><i style='width:" + pc + "%'></i></i></td>" +
          "<td class='r nw" + (i.balance ? " s17-red" : "") + "'>" + (i.balance ? num(i.balance) : "—") + "</td><td>" + trk(i.track) + "</td>" +
          "<td class='nw" + (i.late ? " s17-red" : "") + "'>" + (i.delivered ? "<span class='it-dl'>✓ " + dd(i.delivered) + "</span>" : i.delivery_date ? (i.late ? "⚠ " : "") + dd(i.delivery_date) : "<span class='muted'>—</span>") + "</td>" +
          "<td class='it-note'>" + esc(i.track_note || "") + "</td><td class='nw r' data-stop>" + (i.balance ? "<button class='btn sm' data-pay='" + i.id + "' title='Record payment'>+ Rs</button> " : "") + (!i.delivered ? "<button class='btn sm ghost' data-dl='" + i.id + "' title='Mark delivered'>✓</button> " : "") + "<button class='btn sm ghost' data-ed='" + i.id + "' title='Edit tracking'>" + ic("edit") + "</button></td></tr>"; }).join("")
        : "<tr><td colspan='11' class='empty'>No invoices here. Create one or import your sheet.</td></tr>";
      W.fillIcons($("#it-rows"));
      $$("#it-rows tr[data-id]").forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest("[data-stop]")) return; location.hash = "#/invoice/" + tr.dataset.id; }; });
      var find = function (id) { return D.rows.find(function (x) { return x.id === +id; }); };
      $$("#it-rows [data-pay]").forEach(function (b) { b.onclick = function () { payForm(find(b.dataset.pay), load); }; });
      $$("#it-rows [data-dl]").forEach(function (b) { b.onclick = function () { api("inv_track", { id: +b.dataset.dl, delivered: today() }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Marked delivered ✓"); load(); }); }; });
      $$("#it-rows [data-ed]").forEach(function (b) { b.onclick = function () { trackForm(find(b.dataset.ed), load); }; });
    }
    function load() { return api("invs_tracker", { year: st.year }).then(function (r) { if (!r.ok) return toast(r.error, true); D = r; if (st.month && st.month.slice(0, 4) !== r.year) st.month = ""; if ($("#it-rows")) draw(); }); }
    $("#it-y").onchange = function () { st.year = this.value; st.month = ""; load(); };
    $("#it-q").oninput = function () { st.q = this.value; rows(base()); };
    $("#it-new").onclick = function () { invForm(function (inv) { st.year = inv.issue_date.slice(0, 4); st.month = inv.issue_date.slice(0, 7); load(); }); };
    $("#it-exp").onclick = function () { var L = base(); var rws = [["Date", "PO#", "Invoice", "Company", "Total", "Received", "Balance", "Status", "Delivery date", "Delivered", "Note"].join(",")].concat(L.map(function (i) { return [i.issue_date, i.po, i.no, i.company, i.total, i.paid, i.balance, TRK[i.track][0], i.delivery_date, i.delivered, i.track_note].map(cell).join(","); }));
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + rws.join("\n")], { type: "text/csv" })); a.download = "woodex-invoices-" + (st.month || st.year) + ".csv"; a.click(); };
    if ($("#it-imp")) $("#it-imp").onclick = function () {
      csvMapper("Import invoice sheet", "Export your Invoice Tracking sheet as <b>CSV</b> (one month or the whole year), then check the columns. Existing invoice numbers are skipped; “Received” is saved as a payment.",
        [["date", "Date"], ["po", "PO #"], ["no", "Invoice #"], ["company", "Company"], ["total", "Total amount"], ["received", "Received"], ["status", "Status"], ["delivery", "Delivery date"], ["note", "Note"]],
        { date: /^date/, po: /^po|p\.o|order/, no: /invoice|inv\b|inv ?#|bill/, company: /compan|client|customer|name/, total: /total|amount/, received: /receiv|paid/, status: /status/, delivery: /deliver/, note: /note|remark/ },
        function (L, done) { api("invs_import", { rows: L }).then(function (r) { if (!r.ok) return done(r.error); done(); toast(r.imported + " invoices imported" + (r.skipped ? " · " + r.skipped + " skipped" : "") + " ✓"); st.month = ""; load(); }); });
    };
    meta().then(load);
  };
  function payForm(i, after) {
    W.modal("<h2>Record payment · " + esc(i.no) + "</h2><p class='muted'>" + esc(i.company) + " · balance <b>Rs " + num(i.balance) + "</b></p><div class='s17-g2'><label>Amount (Rs)<input id='py-a' type='number' value='" + i.balance + "'></label><label>Date<input id='py-d' type='date' value='" + today() + "'></label>" +
      "<label>Method<select id='py-m'><option value='bank'>Bank transfer</option><option value='cash'>Cash</option><option value='cheque'>Cheque</option><option value='online'>Online</option></select></label><label>Reference<input id='py-r' placeholder='Cheque / TID'></label></div><p class='err' id='py-e'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='py-go'>Save payment</button></div>");
    $("#py-go").onclick = function () { api("pay_add", { id: i.id, amount: $("#py-a").value, date: $("#py-d").value, method: $("#py-m").value, ref: $("#py-r").value }).then(function (r) { if (!r.ok) { $("#py-e").textContent = r.error; return; } W.closeModal(); toast("Payment saved · receipt " + r.payment.rcpt + " ✓"); after(); }); };
  }
  function trackForm(i, after) {
    W.modal("<h2>Tracking · " + esc(i.no) + "</h2><div class='s17-g2'><label>PO #<input id='tf-po' value='" + esc(i.po) + "'></label><label>Business line<select id='tf-l'>" + opts(M.lines, i.line, "—") + "</select></label><label>Delivery date<input id='tf-dd' type='date' value='" + esc(i.delivery_date) + "'></label><label>Delivered on<input id='tf-dl' type='date' value='" + esc(i.delivered) + "'></label>" +
      "<label>Payment terms<select id='tf-m'><option value=''>Standard</option><option value='after_delivery'" + (i.mode === "after_delivery" ? " selected" : "") + ">Payment after delivery</option></select></label></div><label>Note<textarea id='tf-n' rows='2'>" + esc(i.track_note) + "</textarea></label><p class='err' id='tf-e'></p><div class='modal-actions'><a class='btn' href='#/invoice/" + i.id + "' onclick='WXA.closeModal()'>Open invoice</a><button class='btn pri' id='tf-go'>Save</button></div>");
    $("#tf-go").onclick = function () { api("inv_track", { id: i.id, po: $("#tf-po").value, line: $("#tf-l").value, delivery_date: $("#tf-dd").value, delivered: $("#tf-dl").value, mode: $("#tf-m").value, track_note: $("#tf-n").value }).then(function (r) { if (!r.ok) { $("#tf-e").textContent = r.error; return; } W.closeModal(); toast("Saved ✓"); after(); }); };
  }
  function invForm(after) {
    api("clients_master").then(function (cr) {
      var cs = (cr.clients || []);
      W.modal("<h2>New invoice</h2><p class='muted'>For a direct sale or PO without a quotation. (Approved quotations still convert in one click from the quotation page.)</p>" +
        "<label>Client<input id='nf-c' list='nf-cl' placeholder='Type to search clients, or a new company name'><datalist id='nf-cl'>" + cs.map(function (c) { return "<option value='" + esc((c.company || c.name) + (c.phone ? " · " + c.phone : "")) + "'>"; }).join("") + "</datalist></label>" +
        "<div class='s17-g2' id='nf-newc' hidden><label>Contact name<input id='nf-cn'></label><label>Phone<input id='nf-cp'></label></div>" +
        "<div class='s17-g2'><label>Business line<select id='nf-l'><option value='interior'>Interior → WI- number</option><option value='furniture'>Furniture → WF- number</option><option value='project'>Project → WI- number</option></select></label><label>PO #<input id='nf-po'></label>" +
        "<label>Invoice date<input id='nf-d' type='date' value='" + today() + "'></label><label>Delivery date<input id='nf-dd' type='date'></label><label>Amount (Rs) *<input id='nf-a' type='number' min='0'></label>" +
        "<label>Payment terms<select id='nf-m'><option value=''>Standard</option><option value='after_delivery'>Payment after delivery</option></select></label></div>" +
        "<label>Description<input id='nf-ds' placeholder='e.g. 40 workstations as per PO'></label><label>Note (tracker)<input id='nf-n'></label><p class='err' id='nf-e'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='nf-go'>Create invoice</button></div>");
      $("#modal-card").classList.add("wide");
      var pick = function () { var v = $("#nf-c").value; return cs.find(function (c) { return (c.company || c.name) + (c.phone ? " · " + c.phone : "") === v; }); };
      $("#nf-c").oninput = function () { $("#nf-newc").hidden = !this.value.trim() || !!pick(); };
      $("#nf-go").onclick = function () { var c = pick(), v = $("#nf-c").value.trim();
        api("inv_new", { client_id: c ? c.id : 0, client: c ? {} : { company: v, name: $("#nf-cn").value || v, phone: $("#nf-cp").value }, line: $("#nf-l").value, po: $("#nf-po").value, issue_date: $("#nf-d").value, delivery_date: $("#nf-dd").value, total: $("#nf-a").value, mode: $("#nf-m").value, desc: $("#nf-ds").value, track_note: $("#nf-n").value })
          .then(function (r) { if (!r.ok) { $("#nf-e").textContent = r.error; return; } $("#modal-card").classList.remove("wide"); W.closeModal(); toast("Invoice " + r.invoice.no + " created ✓"); after(r.invoice); }); };
    });
  }

  // ================================================================ S5 PROJECTS TABLE (+ milestone billing). Board view stays at #/projects/board.
  OLD.projects = W.VIEWS.projects;
  var PST = { planning: "Planning", design: "Design", procurement: "Procurement", execution: "Execution", finishing: "Finishing", handover: "Handover", completed: "Completed" };
  var MSB = { unbilled: ["Not billed", ""], billed: ["Billed", "warn"], partial: ["Part paid", "gold"], paid: ["Paid", "ok"], missing: ["Invoice deleted", "bad"] };
  var MPRE = [["50/50", [["Advance", 50], ["On handover", 50]]], ["50/30/20", [["Advance with work order", 50], ["On completion of wood work", 30], ["On handover", 20]]], ["40/30/20/10", [["Advance", 40], ["Civil & ceiling done", 30], ["Wood work done", 20], ["Handover", 10]]]];
  W.VIEWS.projects = function (el, parts) {
    if (parts && parts[0] === "board") return OLD.projects(el, []);
    var st = S.s17p || (S.s17p = { f: "active", line: "", q: "" }), D = null, sales = can("owner,admin,sales");
    el.innerHTML = head("Projects", "Projects", '<a class="btn" href="#/projects/board">' + ic("layers") + "Board &amp; photos</a>" + (sales ? '<button class="btn pri" id="pt-new">' + ic("plus") + "New project</button>" : "")) +
      '<div class="it-tot pt-k" id="pt-k"></div><div class="card"><div class="s17-filters"><input type="search" id="pt-q" placeholder="Search project, client, site, number…"><div class="seg" id="pt-f"></div><div class="seg" id="pt-l"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl s17-tbl"><thead><tr><th>Project</th><th>Type</th><th>Stage</th><th>Handover</th><th class="r">Contract</th><th class="r">Invoiced</th><th class="r">Received</th><th class="r">Balance</th><th>Team</th></tr></thead><tbody id="pt-rows"><tr><td colspan="9" class="empty">Loading…</td></tr></tbody></table></div></div>';
    function draw() {
      var k = D.kpi, rc = k.invoiced ? Math.round(100 * k.received / k.invoiced) : 0;
      $("#pt-k").innerHTML = "<div class='it-t'><small>Active projects</small><b>" + k.active + "</b></div><div class='it-t'><small>Contract value (active)</small><b>" + lakh(k.value) + "</b></div><div class='it-t'><small>Invoiced</small><b>" + lakh(k.invoiced) + "</b></div>" +
        "<div class='it-t ok'><small>Received</small><b>" + lakh(k.received) + "</b><i class='s17-bar2'><i style='width:" + rc + "%'></i></i></div><div class='it-t" + (k.balance ? " bad" : "") + "'><small>Balance due</small><b>" + lakh(k.balance) + "</b></div><div class='it-t" + (k.late ? " bad" : "") + "'><small>Late handovers</small><b>" + k.late + "</b></div>";
      var P = D.projects, n = function (f) { return P.filter(F[f]).length; };
      $("#pt-f").innerHTML = [["active", "Active"], ["late", "Late"], ["due", "Balance due"], ["completed", "Completed"], ["all", "All"]].map(function (x) { return "<button data-f='" + x[0] + "' class='" + (st.f === x[0] ? "on" : "") + "'>" + x[1] + " <small>" + n(x[0]) + "</small></button>"; }).join("");
      $("#pt-l").innerHTML = [["", "All lines"]].concat(Object.keys(D.lines).map(function (k) { return [k, D.lines[k]]; })).map(function (x) { return "<button data-l='" + x[0] + "' class='" + (st.line === x[0] ? "on" : "") + "'>" + x[1] + "</button>"; }).join("");
      $$("#pt-f button").forEach(function (b) { b.onclick = function () { st.f = b.dataset.f; draw(); }; });
      $$("#pt-l button").forEach(function (b) { b.onclick = function () { st.line = b.dataset.l; draw(); }; });
      rows();
    }
    var F = { active: function (p) { return p.stage !== "completed"; }, late: function (p) { return p.late; }, due: function (p) { return p.balance > 0; }, completed: function (p) { return p.stage === "completed"; }, all: function () { return true; } };
    function rows() {
      var q = st.q.toLowerCase(), L = D.projects.filter(function (p) { return F[st.f](p) && (!st.line || p.line === st.line) && (!q || [p.name, p.client_name, p.site, p.no, p.ptype].join(" ").toLowerCase().indexOf(q) >= 0); });
      $("#pt-rows").innerHTML = L.length ? L.map(function (p) { var bp = p.value ? Math.min(100, Math.round(100 * p.invoiced / p.value)) : 0, rp = p.value ? Math.min(100, Math.round(100 * p.received / p.value)) : 0;
        return "<tr data-id='" + p.id + "' class='" + (p.late ? "s17-od" : "") + "'><td><b>" + esc(p.name) + "</b><small class='muted d'>" + esc(p.client_name || "—") + (p.no ? " · " + esc(p.no) : "") + (p.site ? " · " + esc(p.site) : "") + "</small></td>" +
          "<td>" + lineTag(p.line) + (p.ptype ? "<small class='muted d'>" + esc(p.ptype) + (p.area ? " · " + num(p.area) + " sft" : "") + "</small>" : "") + "</td>" +
          "<td class='nw'><span class='badge" + (p.stage === "completed" ? " ok" : p.stage === "handover" ? " gold" : "") + "'>" + PST[p.stage] + "</span><i class='pt-prog'><i style='width:" + p.progress + "%'></i></i></td>" +
          "<td class='nw" + (p.late ? " s17-red" : "") + "'>" + (p.target ? (p.late ? "⚠ " : "") + dd(p.target) : "<span class='muted'>—</span>") + "</td>" +
          "<td class='r nw'><b>" + num(p.value) + "</b></td><td class='r nw'>" + (p.invoiced ? num(p.invoiced) : "—") + "<i class='pt-money' title='" + bp + "% billed · " + rp + "% received'><i style='width:" + bp + "%'></i><u style='width:" + rp + "%'></u></i></td>" +
          "<td class='r nw'>" + (p.received ? num(p.received) : "—") + "</td><td class='r nw" + (p.balance ? " s17-red" : "") + "'>" + (p.balance ? num(p.balance) : "—") + "</td>" +
          "<td>" + (p.team_names.concat(p.manager_name && p.team_names.indexOf(p.manager_name) < 0 ? [p.manager_name] : []).map(function (t) { return "<span class='pt-av' title='" + esc(t) + "'>" + esc(t.charAt(0)) + "</span>"; }).join("") || "<span class='muted'>—</span>") + "</td></tr>"; }).join("")
        : "<tr><td colspan='9' class='empty'>No projects here. A project opens automatically when a quotation is approved, or click “New project”.</td></tr>";
      $$("#pt-rows tr[data-id]").forEach(function (tr) { tr.onclick = function () { detail(+tr.dataset.id); }; });
    }
    function load(then) { return api("projs_table").then(function (r) { if (!r.ok) return toast(r.error, true); D = r; if ($("#pt-rows")) draw(); if (then) then(); }); }
    function detail(id) {
      var p = D.projects.find(function (x) { return x.id === id; }); if (!p) return;
      var plan = p.milestones.map(function (m) { return { label: m.label, pct: m.pct, inv_id: m.inv_id }; });
      var tm = D.team.map(function (t) { return "<label class='pt-chk'><input type='checkbox' value='" + t.id + "'" + (p.team.indexOf(t.id) >= 0 ? " checked" : "") + (sales ? "" : " disabled") + "> " + esc(t.name) + "</label>"; }).join("");
      W.modal("<div class='pt-dh'><div><h2>" + esc(p.name) + "</h2><p class='muted'>" + esc(p.client_name || "No client") + (p.no ? " · " + esc(p.no) : "") + (p.site ? " · " + esc(p.site) : "") + "</p></div>" + (p.quote_id ? "<a class='btn sm' href='#/quote/" + p.quote_id + "'>" + ic("file-text") + "Quotation</a>" : "") + "</div>" +
        "<div class='pt-steps'>" + D.stages.map(function (s, i) { var cur = D.stages.indexOf(p.stage); return "<button data-st='" + s + "' class='" + (i < cur ? "done" : i === cur ? "on" : "") + "'" + (sales ? "" : " disabled") + "><i>" + (i < cur ? "✓" : i + 1) + "</i>" + PST[s] + "</button>"; }).join("") + "</div>" +
        "<div class='pt-money2'><div><small>Contract</small><b>Rs " + num(p.value) + "</b></div><div><small>Invoiced</small><b>Rs " + num(p.invoiced) + "</b></div><div class='ok'><small>Received</small><b>Rs " + num(p.received) + "</b></div><div class='" + (p.balance ? "bad" : "") + "'><small>Balance due</small><b>Rs " + num(p.balance) + "</b></div><div><small>Not billed yet</small><b>Rs " + num(p.unbilled) + "</b></div></div>" +
        "<div class='pt-cols'><div><h3 class='side-h'>Milestone billing</h3><p class='muted sm'>Bill the contract in parts. Each milestone becomes its own invoice (" + esc(p.no || "WI-…") + "-1, -2 …) that shows in Invoice tracking.</p>" +
        "<div class='pt-pre'>" + MPRE.map(function (x, i) { return "<button class='btn sm ghost' data-pre='" + i + "'>" + x[0] + "</button>"; }).join("") + "</div><div id='pt-ms'></div>" +
        "<div class='pt-msf'><button class='btn sm' id='pt-add'>+ Milestone</button><span id='pt-sum' class='muted sm'></span><span style='flex:1'></span><button class='btn sm pri' id='pt-msave'>Save plan</button></div>" +
        (p.invoices.length ? "<h3 class='side-h' style='margin-top:18px'>Invoices</h3><table class='tbl'><tbody>" + p.invoices.map(function (i) { return "<tr><td><a href='#/invoice/" + i.id + "'><b>" + esc(i.no) + "</b></a></td><td class='r'>" + num(i.total) + "</td><td class='r'>" + num(i.paid) + "</td><td class='r " + (i.balance ? "s17-red" : "") + "'>" + (i.balance ? num(i.balance) : "Paid ✓") + "</td><td class='r'>" + (i.balance && sales ? "<button class='btn sm' data-pay='" + i.id + "'>+ Rs</button>" : "") + "</td></tr>"; }).join("") + "</tbody></table>" : "") + "</div>" +
        "<div><h3 class='side-h'>Details</h3><div class='s17-g2'><label>Business line<select id='pd-line'>" + opts(D.lines, p.line, "—") + "</select></label><label>Project type<select id='pd-type'><option value=''>—</option>" + D.types.map(function (t) { return "<option" + (t === p.ptype ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select></label>" +
        "<label>Contract value (Rs)<input id='pd-val' type='number' value='" + p.value + "'></label><label>Covered area (sft)<input id='pd-area' type='number' value='" + (p.area || "") + "'></label><label>Start<input id='pd-s' type='date' value='" + esc(p.start) + "'></label><label>Handover target<input id='pd-t' type='date' value='" + esc(p.target) + "'></label>" +
        "<label class='full'>Project manager<select id='pd-m'><option value=''>—</option>" + D.team.map(function (t) { return "<option value='" + t.id + "'" + (+p.manager === t.id ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select></label></div><div class='pt-team'><small class='muted'>Team</small>" + tm + "</div>" +
        (p.last ? "<p class='pt-last'><small class='muted'>Last update · " + ago(p.last.t) + "</small>" + esc(p.last.text) + "</p>" : "") + "<a class='btn sm ghost' href='#/projects/board'>" + ic("image") + "Photos &amp; client updates (" + p.photos + ")</a></div></div>" +
        "<p class='err' id='pd-e'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Close</button>" + (sales ? "<button class='btn pri' id='pd-go'>Save details</button>" : "") + "</div>");
      $("#modal-card").classList.add("wide"); W.fillIcons($("#modal-card"));
      if (!sales) $$("#modal-card input,#modal-card select,#pt-add,#pt-msave,.pt-pre button").forEach(function (x) { x.disabled = true; });
      function ms() {
        var sum = 0; $("#pt-ms").innerHTML = plan.length ? plan.map(function (m, j) { var o = p.milestones[j], billed = !!m.inv_id; sum += +m.pct || 0; var s = o && o.inv_id === m.inv_id ? MSB[o.status] : MSB.unbilled;
          return "<div class='pt-m" + (billed ? " billed" : "") + "'><b>" + (j + 1) + "</b><input data-j='" + j + "' data-k='label' value='" + esc(m.label) + "'" + (billed ? " disabled" : "") + "><span class='pt-pct'><input data-j='" + j + "' data-k='pct' type='number' value='" + m.pct + "'" + (billed ? " disabled" : "") + ">%</span><span class='r nw'>Rs " + num(p.value * (+m.pct || 0) / 100) + "</span>" +
            (billed ? "<span class='badge " + s[1] + "'>" + (o && o.inv_no ? esc(o.inv_no) + " · " : "") + s[0] + "</span>" : "<span class='pt-ma'>" + (o && !o.inv_id && sales ? "<button class='btn sm' data-bill='" + j + "'>Raise invoice</button>" : "") + "<button class='icon-btn' data-del='" + j + "' title='Remove'>✕</button></span>") + "</div>"; }).join("") : "<p class='empty sm'>No milestones. Pick a plan above (e.g. 50/30/20) or add your own.</p>";
        $("#pt-sum").innerHTML = plan.length ? "Total <b class='" + (Math.abs(sum - 100) > .01 ? "s17-red" : "") + "'>" + sum + "%</b>" : "";
        $$("#pt-ms input").forEach(function (i) { i.oninput = function () { plan[+i.dataset.j][i.dataset.k] = i.dataset.k === "pct" ? +i.value : i.value; if (i.dataset.k === "pct") { var s = plan.reduce(function (a, m) { return a + (+m.pct || 0); }, 0); $("#pt-sum").innerHTML = "Total <b class='" + (Math.abs(s - 100) > .01 ? "s17-red" : "") + "'>" + s + "%</b> · unsaved"; i.closest(".pt-m").querySelector(".r").textContent = "Rs " + num(p.value * (+i.value || 0) / 100); $$("[data-bill]").forEach(function (b) { b.disabled = true; b.title = "Save the plan first"; }); } }; });
        $$("#pt-ms [data-del]").forEach(function (b) { b.onclick = function () { plan.splice(+b.dataset.del, 1); ms(); $$("[data-bill]").forEach(function (b) { b.disabled = true; }); }; });
        $$("#pt-ms [data-bill]").forEach(function (b) { b.onclick = function () { bill(+b.dataset.bill, false); }; });
      }
      function bill(j, replace) {
        api("proj_bill", { id: p.id, k: j, replace: replace }).then(function (r) {
          if (!r.ok && r.error === "REPLACE") { if (confirm("This project already has one full invoice (" + p.invoices.map(function (i) { return i.no; }).join(", ") + ") with no payments.\n\nReplace it with milestone invoices? The full invoice will be removed.")) bill(j, true); return; }
          if (!r.ok) return ($("#pd-e").textContent = r.error);
          toast("Invoice " + r.invoice.no + " raised · Rs " + num(r.invoice.total) + " ✓"); load(function () { detail(p.id); });
        });
      }
      ms();
      $$(".pt-pre [data-pre]").forEach(function (b) { b.onclick = function () { if (plan.some(function (m) { return m.inv_id; })) return toast("Some milestones are already billed", true); plan = MPRE[+b.dataset.pre][1].map(function (x) { return { label: x[0], pct: x[1], inv_id: null }; }); ms(); $$("[data-bill]").forEach(function (b) { b.disabled = true; b.title = "Save the plan first"; }); }; });
      $("#pt-add").onclick = function () { var used = plan.reduce(function (a, m) { return a + (+m.pct || 0); }, 0); plan.push({ label: "Milestone " + (plan.length + 1), pct: Math.max(0, 100 - used), inv_id: null }); ms(); };
      $("#pt-msave").onclick = function () { api("proj_milestones", { id: p.id, plan: plan }).then(function (r) { if (!r.ok) return ($("#pd-e").textContent = r.error); toast("Milestone plan saved ✓"); load(function () { detail(p.id); }); }); };
      $$(".pt-steps [data-st]").forEach(function (b) { b.onclick = function () { if (b.dataset.st === p.stage) return; api("proj_save", { id: p.id, stage: b.dataset.st }).then(function (r) { if (!r.ok) return ($("#pd-e").textContent = r.error); toast("Stage: " + PST[b.dataset.st] + " ✓"); load(function () { detail(p.id); }); }); }; });
      $$("#modal-card [data-pay]").forEach(function (b) { b.onclick = function () { var i = p.invoices.find(function (x) { return x.id === +b.dataset.pay; }); payForm({ id: i.id, no: i.no, balance: i.balance, company: p.client_name }, function () { load(); }); }; });
      if ($("#pd-go")) $("#pd-go").onclick = function () {
        var team = $$(".pt-team input:checked").map(function (x) { return +x.value; });
        api("proj_save", { id: p.id, value: $("#pd-val").value, start: $("#pd-s").value, target: $("#pd-t").value, manager: $("#pd-m").value }).then(function (r) { if (!r.ok) throw r.error;
          return api("proj_meta", { id: p.id, line: $("#pd-line").value, ptype: $("#pd-type").value, area: $("#pd-area").value, team: team }); })
          .then(function (r) { if (!r.ok) throw r.error; toast("Project saved ✓"); load(function () { detail(p.id); }); }).catch(function (e) { $("#pd-e").textContent = typeof e === "string" ? e : "Could not save"; });
      };
    }
    $("#pt-q").oninput = function () { st.q = this.value; if (D) rows(); };
    if ($("#pt-new")) $("#pt-new").onclick = function () {
      W.modal("<h2>New project</h2><p class='muted'>Usually a project opens by itself when a quotation is approved. Use this for work without a quotation.</p><div class='s17-g2'><label class='full'>Project name<input id='np-n' placeholder='e.g. Haier head office – 3rd floor'></label><label>Client / company<input id='np-c' list='np-cl'></label><label>Site<input id='np-s'></label>" +
        "<label>Business line<select id='np-l'>" + opts(D.lines, "project") + "</select></label><label>Project type<select id='np-t'><option value=''>—</option>" + D.types.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + "</select></label><label>Contract value (Rs)<input id='np-v' type='number'></label><label>Handover target<input id='np-d' type='date'></label></div><p class='err' id='np-e'></p><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='np-go'>Create project</button></div>");
      $("#np-go").onclick = function () { var id; api("proj_save", { name: $("#np-n").value, client_name: $("#np-c").value, site: $("#np-s").value, value: $("#np-v").value, target: $("#np-d").value }).then(function (r) { if (!r.ok) throw r.error; id = r.project.id;
        return api("proj_meta", { id: id, line: $("#np-l").value, ptype: $("#np-t").value }); }).then(function (r) { if (!r.ok) throw r.error; W.closeModal(); toast("Project created ✓"); st.f = "active"; load(function () { detail(id); }); }).catch(function (e) { $("#np-e").textContent = typeof e === "string" ? e : "Could not save"; }); };
    };
    meta().then(function () { load(); });
  };

  // ================================================================ S4 QUOTATION EDITOR: layout, type presets, live preview, template import/export
  var PRESET = {
    fitout: { layout: "project", secs: ["Civil work", "Flooring", "Ceiling", "Paint", "Wood work", "Glass work", "Electrical", "HVAC", "Plumbing"], scope: "" },
    renovation: { layout: "single", secs: ["Demolition & civil", "Flooring", "Ceiling", "Paint", "Wood work", "Electrical", "Plumbing & sanitary"], scope: "" },
    interior: { layout: "project", secs: ["Civil work", "Flooring", "Ceiling", "Paint", "Wood work", "Glass work", "Curtain & blinds", "Electrical", "Plumbing"], scope: "" },
    proposal: { layout: "single", secs: ["Design & 3D visualisation", "Execution"], scope: "Site survey and measurements\nSpace planning and 2D layout\n3D visualisation (up to 2 revisions)\nMaterial and finish selection\nDetailed BOQ and working drawings\nExecution and site supervision\nHandover with snag list" },
    furniture: { layout: "single", secs: ["Furniture supply"], scope: "" } };
  var QTL = { "": "— choose —", fitout: "Fit-out", renovation: "Renovation", interior: "Interior design", proposal: "Proposal (scope of work)", furniture: "Furniture supply" };
  W.onQuoteEditor = function (E) {
    var q = E.q, co = E.co, el = E.el, side = $(".qe-side", el); if (!side || !window.WXPrint) return;
    q.layout = q.layout || "classic";
    var card = document.createElement("div"); card.className = "card"; card.innerHTML = "<div class='card-b'><h3 class='side-h'>Layout &amp; type</h3>" +
      "<div class='ql-pick'>" + [["single", "Single page", "One table, grey section rows"], ["project", "Project", "Summary page + one page per trade"], ["classic", "Classic", "Summary + detailed BOQ"]].map(function (x) { return "<label class='ql" + (q.layout === x[0] ? " on" : "") + "'><input type='radio' name='ql' value='" + x[0] + "'" + (q.layout === x[0] ? " checked" : "") + "><b>" + x[1] + "</b><small>" + x[2] + "</small></label>"; }).join("") + "</div>" +
      "<label>Quotation type<select id='q17-t'>" + Object.keys(QTL).map(function (k) { return "<option value='" + k + "'" + ((q.qtype || "") === k ? " selected" : "") + ">" + QTL[k] + "</option>"; }).join("") + "</select></label>" +
      "<label>Scope of work <small class='muted'>(one point per line, printed as a list)</small><textarea id='q17-sc' rows='4'>" + esc(q.scope || "") + "</textarea></label>" +
      "<label>Signed by<select id='q17-sg'>" + (co.signers || []).map(function (x, i) { return "<option value='" + i + "'" + ((q.sign_name || (i === 0 ? x.name : "")) === x.name ? " selected" : "") + ">" + esc(x.name + (x.title ? " — " + x.title : "")) + "</option>"; }).join("") + "<option value='c'" + (q.sign_name && !(co.signers || []).some(function (x) { return x.name === q.sign_name; }) ? " selected" : "") + ">Someone else…</option></select></label>" +
      "<div class='g2' id='q17-sgc' style='gap:0 10px'><label>Name<input id='q17-sn' value='" + esc(q.sign_name || "") + "' placeholder='" + esc(co.signName || "Your name") + "'></label><label>Title<input id='q17-st' value='" + esc(q.sign_title || "") + "' placeholder='" + esc(co.signTitle || "For Woodex Interior") + "'></label></div>" +
      "<div class='q17-io'><button class='btn sm' id='q17-ex'>" + ic("download") + "Export template</button><button class='btn sm' id='q17-im'>" + ic("upload") + "Import template</button></div></div>";
    side.insertBefore(card, side.firstChild); W.fillIcons(card);
    if (E.ro) $$("input,select,textarea,button", card).forEach(function (x) { if (x.id !== "q17-ex") x.disabled = true; });
    $$("input[name=ql]", card).forEach(function (r) { r.onchange = function () { q.layout = r.value; $$(".ql", card).forEach(function (l) { l.classList.toggle("on", l.contains(r)); }); if (window.__wxBlk) window.__wxBlk.set(q.layout); E.dirty(); live(); }; });
    $("#q17-sc").oninput = function () { q.scope = this.value; E.dirty(); };
    var sgc = function () { $("#q17-sgc").hidden = $("#q17-sg").value !== "c" && (co.signers || []).length > 0; }; sgc();
    $("#q17-sg").onchange = function () { var x = (co.signers || [])[+this.value]; if (x) { q.sign_name = x.name; q.sign_title = x.title; } else { q.sign_name = $("#q17-sn").value; q.sign_title = $("#q17-st").value; } sgc(); E.dirty(); live(); };
    $("#q17-sn").oninput = function () { q.sign_name = this.value; E.dirty(); }; $("#q17-st").oninput = function () { q.sign_title = this.value; E.dirty(); };
    $("#q17-t").onchange = function () {
      var t = this.value, p = PRESET[t]; q.qtype = t; E.dirty(); if (!p) return;
      var empty = !q.sections.some(function (s) { return s.items.some(function (it) { return String(it.desc || "").trim(); }); });
      if (empty || confirm("Add the " + QTL[t] + " sections (" + p.secs.join(", ") + ")? Your current lines stay.")) {
        if (empty) q.sections.length = 0;
        p.secs.forEach(function (n) { if (!q.sections.some(function (s) { return String(s.name).toLowerCase() === n.toLowerCase(); })) q.sections.push({ name: n, note: "", area: 0, items: [{ desc: "", qty: 1, unit: n === "Execution" || n.indexOf("Design") === 0 ? "job" : "sft", rate: "" }] }); });
        E.redraw();
      }
      q.layout = p.layout; $$("input[name=ql]", card).forEach(function (r) { r.checked = r.value === p.layout; r.closest(".ql").classList.toggle("on", r.checked); });
      if (p.scope && !q.scope) { q.scope = p.scope; $("#q17-sc").value = p.scope; }
      E.dirty(); live();
    };
    $("#q17-ex").onclick = function () {
      var t = { woodexTemplate: 1, name: q.project || q.client.name || q.no, qtype: q.qtype || "", layout: q.layout, scope: q.scope || "", terms: q.terms || "", intro: q.intro || "",
        sections: q.sections.map(function (s) { return { name: s.name, note: s.note || "", area: +s.area || 0, items: s.items.filter(function (it) { return String(it.desc || "").trim(); }).map(function (it) { return { desc: it.desc, qty: +it.qty || 0, unit: it.unit, rate: +it.rate || 0, kind: it.kind || "", code: it.code || "" }; }) }; }) };
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2)], { type: "application/json" })); a.download = "woodex-template-" + String(t.name).replace(/\W+/g, "-").toLowerCase() + ".json"; a.click();
    };
    $("#q17-im").onclick = function () {
      var fi = document.createElement("input"); fi.type = "file"; fi.accept = ".json,application/json";
      fi.onchange = function () { var f = fi.files[0]; if (!f) return; f.text().then(function (txt) { var t; try { t = JSON.parse(txt); } catch (e) { return toast("That is not a template file", true); }
        if (!t || !Array.isArray(t.sections)) return toast("That is not a Woodex template", true);
        var replace = !q.sections.some(function (s) { return s.items.some(function (it) { return String(it.desc || "").trim(); }); }) || confirm("Replace the current sections with “" + (t.name || "template") + "”? (Cancel = add them at the end)");
        if (replace) q.sections.length = 0;
        t.sections.forEach(function (s) { q.sections.push({ name: String(s.name || "Section"), note: String(s.note || ""), area: +s.area || 0, items: (s.items || []).map(function (it) { return { desc: String(it.desc || ""), qty: +it.qty || 0, unit: it.unit || "job", rate: +it.rate || 0, kind: it.kind || "", code: it.code || "" }; }) }); });
        if (t.layout) q.layout = t.layout; if (t.qtype != null) q.qtype = t.qtype; if (t.scope && !q.scope) q.scope = t.scope; if (t.terms && !q.terms) q.terms = t.terms;
        E.redraw(); E.dirty(); toast("Template imported ✓ — check and save"); W.route();
      }); };
      fi.click();
    };
    // live preview panel
    var tb = $(".toolbar", el), pv = null, timer = null;
    var btn = document.createElement("button"); btn.className = "btn"; btn.id = "q17-live"; btn.innerHTML = ic("eye") + "Live preview"; tb.insertBefore(btn, tb.firstChild); W.fillIcons(btn);
    function docOf() {
      var sub = 0; q.sections.forEach(function (s) { s.subtotal = 0; s.items.forEach(function (it) { it.amount = it.kind ? 0 : Math.round((+it.qty || 0) * (+it.rate || 0) * 100) / 100; s.subtotal += it.amount; }); sub += s.subtotal; });
      var d = JSON.parse(JSON.stringify(q)); d.sections.forEach(function (s) { s.items = s.items.filter(function (it) { return String(it.desc || "").trim(); }).map(function (it) { it.qty = +it.qty || 0; it.rate = +it.rate || 0; return it; }); });
      d.subtotal = Math.round(sub); d.discount = Math.min(Math.round(+q.discount || 0), d.subtotal); d.taxPct = +q.taxPct || 0; d.rent = Math.max(0, Math.round(+q.rent || 0)); d.tax = Math.round((d.subtotal - d.discount + d.rent) * d.taxPct / 100); d.total = d.subtotal - d.discount + d.rent + d.tax; d.advance = Math.min(Math.max(0, Math.round(+q.advance || 0)), d.total); return d; /*P18*/
    }
    function live() { if (!pv) return; clearTimeout(timer); timer = setTimeout(function () { var f = $("iframe", pv), y = f.contentWindow ? f.contentWindow.scrollY : 0; f.onload = function () { try { f.contentWindow.scrollTo(0, y); } catch (e) {} }; f.srcdoc = fit(WXPrint.quote(docOf(), co)); }, 350); }
    function fit(h) { var w = pv ? pv.clientWidth : 800, z = Math.min(1, (w - 16) / 860); return h.replace('</head>', '<style>@media screen{html{zoom:' + z.toFixed(3) + '}}</style></head>'); }
    btn.onclick = function () {
      if (pv) { pv.remove(); pv = null; el.classList.remove("q17-split"); btn.classList.remove("pri"); return; }
      pv = document.createElement("aside"); pv.className = "q17-pv"; pv.innerHTML = "<div class='q17-pvh'><b>Live preview</b><small class='muted'>" + esc((WXPrint.layouts || {})[q.layout] || "") + "</small><span style='flex:1'></span><button class='icon-btn' title='Close'>✕</button></div><iframe title='Quotation preview'></iframe>";
      el.appendChild(pv); el.classList.add("q17-split"); btn.classList.add("pri"); pv.querySelector("button").onclick = btn.onclick; live(); timer && clearTimeout(timer); $("iframe", pv).srcdoc = fit(WXPrint.quote(docOf(), co));
    };
    ["input", "change"].forEach(function (ev) { el.addEventListener(ev, function (e) { if (pv && !pv.contains(e.target)) { live(); var s = $(".q17-pvh small", pv); if (s) s.textContent = (WXPrint.layouts || {})[q.layout] || ""; } }); });
    el.addEventListener("click", function (e) { if (pv && e.target.closest(".sec button, #se-add, #qe-blocks button")) setTimeout(live, 50); });
  };
})();
