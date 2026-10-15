/* Woodex Admin — P39 Phase 2: Master approvals screen + a dashboard for every role.
   Manager (and Developer, if the Master turns it on) changes wait here until the Master approves. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, VIEWS = W.VIEWS, toast = W.toast;
  function $(s, r) { return (r || document).querySelector(s); }
  function role() { return (W.S && W.S.user && W.S.user.role) || ""; }
  function when(t) { if (!t) return ""; var d = new Date(String(t).replace(" ", "T")); var s = (Date.now() - d) / 1e3; return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + "m ago" : s < 86400 ? Math.round(s / 3600) + "h ago" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  var RL = { owner: "Master", admin: "Manager", editor: "Developer", sales: "Sales", support: "Support" };
  var ST = { pending: ["warn", "Waiting"], approved: ["ok", "Approved"], rejected: ["bad", "Rejected"], cancelled: ["", "Cancelled"], expired: ["", "Expired"], applying: ["warn", "Applying"] };
  function badge(s) { var b = ST[s] || ["", s]; return '<span class="badge ' + b[0] + '">' + b[1] + "</span>"; }
  function val(v) {
    if (v && v._long) return '<span class="muted">' + esc(v.preview || "") + "… (long)</span>";
    if (v && typeof v === "object") v = JSON.stringify(v);
    v = String(v == null ? "" : v); return esc(v.length > 160 ? v.slice(0, 160) + "…" : v);
  }

  /* ---------------------------------------------------------------- Approvals screen */
  var tab = "pending";
  VIEWS.approvals = function (el) {
    var r = role(), isM = r === "owner";
    if (["owner", "admin", "editor"].indexOf(r) < 0) { el.innerHTML = W.head("Approvals") + '<div class="card"><div class="empty">Not available for your role.</div></div>'; return; }
    el.innerHTML = W.head("Approvals", "Approvals", '<div class="seg" id="ap-tab"><button data-t="pending"' + (tab === "pending" ? ' class="on"' : "") + '>Waiting</button><button data-t="all"' + (tab === "all" ? ' class="on"' : "") + ">History</button></div>") +
      '<div class="card" style="margin-bottom:14px"><div class="card-b" style="display:flex;gap:12px;align-items:center">' + ic("shield-check") + "<div>" +
      (isM ? "Changes made by the <b>Manager</b> wait here. Approve to apply them exactly as sent, or reject with a note."
           : r === "editor" ? "If the Master turns on approval for website changes, your edits wait here first. You can cancel a change while it is still waiting." : "Your changes go to the <b>Master</b> first. You'll see the result here. You can cancel a change while it is still waiting.") +
      "</div></div></div>" + (isM ? '<div id="ap-cfg"></div>' : "") + '<div id="ap-list"><div class="card"><div class="empty">Loading…</div></div></div>';
    $("#ap-tab").onclick = function (e) { var b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; VIEWS.approvals(el); } };
    if (isM) cfgCard();
    load(el, isM);
  };
  function cfgCard() {
    api("appr_cfg_get").then(function (j) {
      if (!j.ok) return; var c = j.cfg || {}, box = $("#ap-cfg"); if (!box) return;
      var row = function (k, t, d) { return '<label style="display:flex;gap:10px;align-items:flex-start;margin:6px 0"><input type="checkbox" data-k="' + k + '"' + (c[k] ? " checked" : "") + "><span><b>" + t + '</b><br><small class="muted">' + d + "</small></span></label>"; };
      box.innerHTML = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Approval rules</h3></div><div class="card-b">' +
        row("manager", "Manager changes need my approval", "Leads, quotes, website, settings. Reading and replying to chats is never blocked.") +
        row("developer", "Developer website changes need my approval", "Page edits, menus, SEO and builder saves.") +
        row("notify", "Alert me when something is waiting", "Bell + email when a new change is sent.") + "</div></div>";
      box.onchange = function () { var o = {}; box.querySelectorAll("[data-k]").forEach(function (i) { o[i.dataset.k] = i.checked; }); api("appr_cfg_save", o).then(function (x) { toast(x.ok ? "Approval rules saved" : x.error, !x.ok); }); };
    });
  }
  function load(el, isM) {
    api("appr_list", { status: tab }).then(function (j) {
      var box = $("#ap-list"); if (!box) return;
      if (!j.ok) { box.innerHTML = '<div class="card"><div class="empty">' + esc(j.error || "Could not load") + "</div></div>"; return; }
      var items = (j.items || []).filter(function (a) { return tab === "pending" ? a.status === "pending" : a.status !== "pending"; });
      if (!items.length) { box.innerHTML = '<div class="card"><div class="empty">' + (tab === "pending" ? "Nothing waiting. All clear ✓" : "No history yet.") + "</div></div>"; return; }
      box.innerHTML = items.map(function (a) {
        var rows = Object.keys(a.in || {}).slice(0, 14).map(function (k) { return "<tr><th style=\"width:30%\">" + esc(k) + "</th><td>" + val(a.in[k]) + "</td></tr>"; }).join("");
        var acts = "";
        if (a.status === "pending" && isM) acts = (a.src === "builder" ? '<button class="btn sm" data-prev="' + a.id + '">' + ic("eye") + "Preview</button>" : "") +
          '<button class="btn sm" data-rej="' + a.id + '">Reject</button><button class="btn pri sm" data-ok="' + a.id + '" data-src="' + a.src + '">' + ic("circle-check") + "Approve</button>";
        else if (a.status === "pending") acts = '<button class="btn sm" data-cancel="' + a.id + '">Cancel</button>';
        return '<div class="card" style="margin-bottom:12px"><div class="card-h" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3 style="margin:0">' + esc(a.summary) + "</h3>" +
          '<small class="muted">' + esc((a.by && a.by.name) || "") + " · " + (RL[a.by && a.by.role] || "") + " · " + when(a.at) + " · " + (a.src === "builder" ? "Website builder" : "Admin") + "</small></div><div>" + badge(a.status) + "</div></div>" +
          '<div class="card-b">' + (rows ? '<div class="tbl-wrap"><table class="tbl">' + rows + "</table></div>" : "") +
          (a.note ? '<p style="margin:10px 0 0"><b>Master note:</b> ' + esc(a.note) + "</p>" : "") +
          (a.lastError ? '<p style="margin:10px 0 0;color:#b42318"><b>Last try failed:</b> ' + esc(a.lastError) + "</p>" : "") +
          (a.decidedBy && a.status !== "pending" ? '<p class="muted" style="margin:8px 0 0">' + esc(a.status) + " by " + esc(a.decidedBy) + " · " + when(a.decidedAt) + "</p>" : "") +
          (acts ? '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' + acts + "</div>" : "") + "</div></div>";
      }).join("");
      box.onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return;
        if (b.dataset.ok) { b.disabled = true; (b.dataset.src === "builder" ? bapi : api)("appr_apply", { id: b.dataset.ok }).then(done("Approved and applied ✓")); }
        else if (b.dataset.rej) { var n = prompt("Reason for rejecting (the Manager will see this):", ""); if (n === null) return; api("appr_reject", { id: b.dataset.rej, note: n }).then(done("Rejected")); }
        else if (b.dataset.cancel) { if (confirm("Cancel this change?")) api("appr_cancel", { id: b.dataset.cancel }).then(done("Cancelled")); }
        else if (b.dataset.prev) preview(b.dataset.prev);
      };
      function done(msg) { return function (x) { toast(x && x.ok ? msg : (x && x.error) || "Failed", !(x && x.ok)); W.navBadges(); load(el, isM); }; }
    });
  }
  function preview(id) {
    api("appr_get", { id: id }).then(function (j) {
      if (!j.ok) return toast(j.error, true);
      var a = j.item, h = a.in && (a.in.html || a.in.content), page = a.in && (a.in.path || a.in.page) || "";
      W.modal('<div class="card-h"><h3>' + esc(a.summary) + "</h3></div>" + (typeof h === "string" ? '<iframe style="width:100%;height:65vh;border:1px solid #e5e7eb;border-radius:8px" sandbox="" id="ap-ifr"></iframe>' : '<p class="muted">No page preview for this change.</p>') +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' + (page ? '<a class="btn sm" target="_blank" rel="noopener" href="/' + esc(String(page).replace(/^\//, "").replace(/index\.html$/, "")) + '">Open live page</a>' : "") + '<button class="btn sm" onclick="WXA.closeModal()">Close</button></div>', "wide");
      var f = $("#ap-ifr"); if (f) f.srcdoc = h;
    });
  }

  /* ---------------------------------------------------------------- Role dashboards */
  var full = VIEWS.dashboard;
  function hello(sub) { var u = W.S.user || {}, h = new Date().getHours(); return '<div class="ph"><div><h1>' + (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + ", " + esc((u.name || "").split(" ")[0]) + '</h1><div class="crumb">' + sub + "</div></div></div>"; }
  function kpi(icon, label, v, href, tone) { return '<a class="card kpi" href="' + href + '" style="text-decoration:none;color:inherit"><div class="kpi-ic">' + ic(icon) + "</div><small>" + label + '</small><div class="kpi-row"><b data-k="' + v + '">…</b>' + (tone ? '<span class="badge ' + tone + '" data-t="' + v + '" hidden></span>' : "") + "</div></a>"; }
  function setK(k, n, t) { var b = document.querySelector('[data-k="' + k + '"]'); if (b) b.textContent = n; if (t) { var s = document.querySelector('[data-t="' + k + '"]'); if (s) { s.textContent = t; s.hidden = false; } } }
  function list(title, href, rows, empty) { return '<div class="card"><div class="card-h" style="display:flex;justify-content:space-between"><h3>' + title + '</h3><a class="btn sm" href="' + href + '">Open</a></div><div class="card-b">' + (rows.length ? '<div class="tbl-wrap"><table class="tbl">' + rows.join("") + "</table></div>" : '<div class="empty">' + empty + "</div>") + "</div></div>"; }
  function chatRow(c) { return '<tr><td><a href="#/chat/' + c.id + '"><b>' + esc(c.name || c.phone || "Visitor #" + c.id) + "</b></a><br><small class=\"muted\">" + esc((c.last || "").slice(0, 70)) + '</small></td><td style="white-space:nowrap">' + (c.needs ? '<span class="badge warn">needs you</span> ' : "") + (c.channel === "wa" ? "WhatsApp" : "Web") + "<br><small class=\"muted\">" + when(c.updated_at) + "</small></td></tr>"; }
  function grid(a) { return '<div class="grid g2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:14px">' + a.join("") + "</div>"; }

  function sales(el) {
    el.innerHTML = hello("Your day in sales") + '<div class="grid kpis">' + kpi("clock", "Follow-ups overdue", "od", "#/enquiries", "bad") + kpi("bell", "Due today", "td", "#/enquiries") + kpi("inbox", "New leads", "nw", "#/enquiries") + kpi("message-circle", "Chats needing you", "cn", "#/chat") + '</div><div id="rd"></div>';
    Promise.all([api("leads_followups"), api("leads_list"), api("chat_list", { status: "open" })]).then(function (r) {
      var f = r[0].ok ? r[0] : { overdue: [], today: [], upcoming: [] }, L = r[1].leads || [], C = r[2].chats || [];
      var mine = W.S.user.id, nw = L.filter(function (l) { return l.stage === "new"; });
      setK("od", f.overdue.length, f.overdue.length ? "act now" : ""); setK("td", f.today.length); setK("nw", nw.length); setK("cn", C.filter(function (c) { return c.needs; }).length);
      var fu = f.overdue.concat(f.today, f.upcoming).slice(0, 8).map(function (l) { return '<tr><td><a href="#/enquiries/' + l.id + '"><b>' + esc(l.name) + "</b></a><br><small class=\"muted\">" + esc(l.next_type || "Follow-up") + " · " + esc(l.stage) + '</small></td><td style="white-space:nowrap">' + esc(String(l.next_at).slice(0, 16)) + "</td></tr>"; });
      var nl = nw.slice(0, 8).map(function (l) { return '<tr><td><a href="#/enquiries/' + l.id + '"><b>' + esc(l.name) + "</b></a>" + (l.assigned_to === mine ? ' <span class="badge gold">mine</span>' : "") + "<br><small class=\"muted\">" + esc(l.service || l.source || "") + '</small></td><td style="white-space:nowrap">' + when(l.created_at) + "</td></tr>"; });
      $("#rd").innerHTML = grid([list("Follow-ups", "#/enquiries", fu, "No follow-ups this week."), list("New leads", "#/enquiries", nl, "No new leads. 👍"), list("Open chats", "#/chat", C.slice(0, 6).map(chatRow), "No open chats.")]);
    });
  }
  function support(el) {
    el.innerHTML = hello("Customers waiting for a reply") + '<div class="grid kpis">' + kpi("message-circle", "Open chats", "oc", "#/chat") + kpi("bell", "Need you", "nd", "#/chat", "warn") + kpi("clock", "Longest wait", "lw", "#/chat") + kpi("file-text", "Active projects", "pj", "#/projects") + '</div><div id="rd"></div>';
    Promise.all([api("chat_list", { status: "open" }), api("projs_list")]).then(function (r) {
      var C = r[0].chats || [], P = (r[1].projects || []).filter(function (p) { return p.stage !== "completed"; }), nd = C.filter(function (c) { return c.needs || c.unread; });
      var old = nd.reduce(function (m, c) { return !m || c.updated_at < m ? c.updated_at : m; }, "");
      setK("oc", C.length); setK("nd", nd.length, nd.length ? "reply" : ""); setK("lw", old ? when(old).replace(" ago", "") : "—"); setK("pj", P.length);
      $("#rd").innerHTML = grid([list("Waiting for you", "#/chat", nd.slice(0, 10).map(chatRow), "Nobody is waiting. ✓"), list("Projects", "#/projects", P.slice(0, 8).map(function (p) { return "<tr><td><b>" + esc(p.name || p.title || "Project #" + p.id) + '</b><br><small class="muted">' + esc(p.client_name || "") + "</small></td><td>" + esc(p.stage || "") + "</td></tr>"; }), "No active projects.")]);
    });
  }
  function developer(el) {
    el.innerHTML = hello("Website health and recent work") + '<div class="grid kpis">' + kpi("file-text", "Pages", "pg", "#/pages") + kpi("globe", "Missing pages (404)", "nf", "#/redirects", "warn") + kpi("eye", "Speed score", "sp", "#/speed") + kpi("shield-check", "My changes waiting", "ap", "#/approvals") + '</div><div id="rd"></div>';
    Promise.all([api("pages_list"), api("r404_list"), api("health_get"), api("appr_count")]).then(function (r) {
      var P = r[0].pages || [], N = r[1].ok ? r[1].rows || [] : null, H = r[2].ok ? r[2] : {}, psi = H.psi || {};
      var sc = psi.mobile && (psi.mobile.score || psi.mobile.performance); setK("pg", P.length); setK("nf", N ? N.length : "—", N && N.length ? "fix" : ""); setK("sp", sc != null ? sc : "—"); setK("ap", r[3].ok ? r[3].pending : 0);
      var noMeta = P.filter(function (p) { return !p.description || !p.title; }).slice(0, 8).map(function (p) { return '<tr><td><b>' + esc(p.title || p.path) + '</b><br><small class="muted">' + esc(p.url || p.path) + "</small></td><td>" + (p.title ? "" : '<span class="badge bad">no title</span> ') + (p.description ? "" : '<span class="badge warn">no description</span>') + "</td></tr>"; });
      var rec = P.slice().sort(function (a, b) { return String(b.modified || b.mtime || "").localeCompare(String(a.modified || a.mtime || "")); }).slice(0, 8).map(function (p) { return '<tr><td><a href="/builder/#' + esc(p.path) + '" target="_blank" rel="noopener"><b>' + esc(p.title || p.path) + '</b></a><br><small class="muted">' + esc(p.url || "") + "</small></td></tr>"; });
      $("#rd").innerHTML = grid([N ? list("Top missing pages", "#/redirects", N.slice(0, 8).map(function (x) { return "<tr><td>" + esc(x.path) + '</td><td style="text-align:right">' + x.n + " hits</td></tr>"; }), "No 404s recorded. ✓") : "", list("Pages missing SEO details", "#/seo", noMeta, "Every page has a title and description. ✓"), list("Pages", "#/pages", rec, "No pages.")]);
    });
  }
  function apprCard(el) {
    api("appr_count").then(function (j) {
      if (!j.ok || !j.pending) return; var dx = $("#dx") || el; var d = document.createElement("a"); d.href = "#/approvals"; d.className = "card"; d.style.cssText = "display:flex;gap:12px;align-items:center;margin-bottom:14px;text-decoration:none;color:inherit;border-left:4px solid #b8956a;padding:14px 16px";
      d.innerHTML = ic("shield-check") + "<div><b>" + j.pending + (j.master ? " change" + (j.pending > 1 ? "s" : "") + " waiting for your approval" : " of your changes waiting for the Master") + '</b><br><small class="muted">' + (j.master ? "Review and approve or reject." : "You'll be notified when they are approved.") + "</small></div>";
      dx.parentNode.insertBefore(d, dx);
    });
  }
  VIEWS.dashboard = function (el) {
    var r = role();
    if (r === "sales") return sales(el);
    if (r === "support") return support(el);
    if (r === "editor") return developer(el);
    full(el); if (r === "owner" || r === "admin") apprCard(el);
  };
  W.route();
})();
