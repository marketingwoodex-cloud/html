/* Woodex Admin — P16 3.2 Smart dashboard (CRM + quotes + invoices + website). Role-based: editors keep the website dashboard. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, VIEWS = W.VIEWS, classic = VIEWS.dashboard;
  var days = +(localStorage.getItem("wxDashDays") || 28), tab = localStorage.getItem("wxDashTab") || "overview", charts = [];
  var STAGE = { new: "New", contacted: "Contacted", visit: "Site visit", quoted: "Quote sent", won: "Won", lost: "Lost" };
  function $(s, r) { return (r || document).querySelector(s); }
  function pkr(n) { n = +n || 0; return "PKR " + (n >= 1e7 ? (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr" : n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, "") + " Lac" : n.toLocaleString("en-PK")); }
  function delta(a) { var n = a[0], p = a[1]; if (!p) return n ? '<span class="dl up">new</span>' : '<span class="dl">—</span>'; var d = Math.round((n - p) / p * 100); return '<span class="dl ' + (d >= 0 ? "up" : "down") + '">' + (d >= 0 ? "▲ " : "▼ ") + Math.abs(d) + "%</span>"; }
  function ago(t) { var s = (Date.now() - new Date(String(t).replace(" ", "T")).getTime()) / 1e3; return s < 3600 ? Math.max(1, Math.round(s / 60)) + "m ago" : s < 86400 ? Math.round(s / 3600) + "h ago" : Math.round(s / 86400) + "d ago"; }
  function kill() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }

  VIEWS.dashboard = function (el) {
    var u = W.S && W.S.user || {};
    if (u.role === "editor" || u.role === "support") return classic(el);
    kill();
    var h = new Date().getHours(), hi = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    el.innerHTML = '<div class="ph"><div><h1>' + hi + ", " + esc((u.name || "").split(" ")[0]) + '</h1><div class="crumb">Here is how Woodex is doing</div></div><div class="toolbar">' +
      '<div class="seg" id="dx-days">' + [7, 28, 90].map(function (d) { return '<button data-d="' + d + '"' + (d === days ? ' class="on"' : "") + ">" + d + " days</button>"; }).join("") + "</div>" +
      '<a class="btn pri" href="#/quotes/new">' + ic("plus") + "New quotation</a></div></div>" +
      '<div id="dx"><div class="card"><div class="empty">Loading dashboard…</div></div></div>';
    $("#dx-days").onclick = function (e) { var b = e.target.closest("[data-d]"); if (!b) return; days = +b.dataset.d; localStorage.setItem("wxDashDays", days); VIEWS.dashboard(el); };
    Promise.all([api("dash_data", { days: days }), api("gdata_report", { days: days }).catch(function () { return {}; })]).then(function (res) {
      var r = res[0], g = res[1] || {};
      if (!r.ok) { $("#dx").innerHTML = '<div class="card"><div class="empty err">' + esc(r.error || "Could not load") + ' <button class="btn sm" onclick="location.reload()">Retry</button></div></div>'; return; }
      if (g.ok && g.connected && g.ga4 && g.ga4.daily) { var m = {}; g.ga4.daily.forEach(function (x) { m[x.date] = +x.users; }); r.visitors = r.axis.map(function (d) { return m[d] != null ? m[d] : null; }); }
      render(el, r, g);
    });
  };

  function render(el, r, g) {
    var c = r.crm, k = c.kpi, ch = c.chips;
    var chip = function (n, label, href, cls) { return '<a class="dx-chip ' + (n ? cls : "") + '" href="' + href + '"><b>' + n + "</b> " + label + "</a>"; };
    var kpi = function (icon, label, val, sub, href) { return '<a class="card dx-kpi" href="' + href + '"><span class="kpi-ic">' + ic(icon) + "</span><small>" + label + "</small><b>" + val + '</b><div class="dx-sub">' + sub + "</div></a>"; };
    var fmax = Math.max.apply(null, Object.keys(STAGE).map(function (s) { return c.funnel[s] || 0; }).concat([1]));
    var t = c.target, pct = t.target ? Math.min(100, Math.round(t.month / t.target * 100)) : 0;
    var gTot = g.ok && g.connected ? { u: g.ga4 && g.ga4.totals ? g.ga4.totals.users : null, c: g.gsc && g.gsc.totals ? g.gsc.totals.clicks : null } : null;
    $("#dx").innerHTML =
      '<div class="dx-chips">' + chip(ch.new, "new enquiries", "#/enquiries", "warn") + chip(ch.follow, "follow-ups due", "#/pipeline", "info") + chip(ch.overdue, "overdue invoices", "#/invoices", "bad") + "</div>" +
      '<div class="grid dx-kpis">' +
        kpi("inbox", "Enquiries", k.leads[0], delta(k.leads) + " vs previous " + r.days + " days", "#/enquiries") +
        kpi("activity", "Open pipeline", pkr(k.pipeline), k.openQuotes[0] + " open quotes · " + pkr(k.openQuotes[1]), "#/pipeline") +
        kpi("file-text", "Quotes sent", k.quotesSent[0], delta(k.quotesSent) + " · " + k.won + " approved", "#/quotes") +
        kpi("receipt", "Payments received", pkr(k.paid[0]), delta(k.paid) + " · unpaid " + pkr(k.unpaid), "#/invoices") +
      "</div>" +
      '<div class="grid dx-g84">' +
        '<div class="card"><div class="card-h"><div><h3>Statistics</h3><small class="muted">Last ' + r.days + ' days</small></div><div class="seg" id="dx-tab">' +
          [["overview", "Overview"], ["sales", "Sales"], ["revenue", "Revenue"]].map(function (x) { return '<button data-t="' + x[0] + '"' + (x[0] === tab ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") +
        '</div></div><div class="card-b"><div class="dx-legend" id="dx-leg"></div><div class="chart-box" style="height:280px"><canvas id="dx-ch"></canvas></div></div></div>' +
        '<div class="card"><div class="card-h"><div><h3>Monthly target</h3><small class="muted">' + esc(t.monthLabel) + "</small></div>" + (/owner|admin/.test(r.role) ? '<button class="btn sm" id="dx-tg">' + ic("square-pen") + "Set</button>" : "") + "</div>" +
          '<div class="card-b dx-target"><div class="dx-ring" style="--p:' + pct + '"><div><b>' + (t.target ? pct + "%" : "—") + "</b><small>" + (t.target ? "of target" : "no target set") + "</small></div></div>" +
          '<div class="dx-tgrow"><div><small>Target</small><b>' + (t.target ? pkr(t.target) : "—") + '</b></div><div><small>Received</small><b>' + pkr(t.month) + '</b></div><div><small>Unpaid</small><b>' + pkr(k.unpaid) + "</b></div></div></div></div>" +
      "</div>" +
      '<div class="grid dx-g3">' +
        '<div class="card"><div class="card-h"><h3>Sales pipeline</h3><a class="btn sm" href="#/pipeline">Open</a></div><div class="card-b dx-funnel">' +
          Object.keys(STAGE).map(function (s) { var n = c.funnel[s] || 0; return '<div class="dx-fr"><span>' + STAGE[s] + '</span><i><em class="st-' + s + '" style="width:' + Math.max(2, n / fmax * 100) + '%"></em></i><b>' + n + "</b></div>"; }).join("") + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>Follow-ups due</h3><span class="badge ' + (ch.follow ? "info" : "ok") + '">' + ch.follow + "</span></div><div class=\"card-b\">" +
          (c.followups.length ? '<ul class="dx-list">' + c.followups.map(function (f) { return '<li><a href="#/enquiries/' + f.id + '"><b>' + esc(f.name) + "</b><small>" + esc(f.service || STAGE[f.stage] || "") + '</small></a><span class="badge ' + (f.late ? "bad" : "warn") + '">' + (f.late ? "late · " : "today · ") + esc(f.followup) + "</span></li>"; }).join("") + "</ul>"
            : '<div class="dx-empty">' + ic("check") + "<b>All caught up</b><small>No follow-ups due today.</small></div>") + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>Overdue invoices</h3><span class="badge ' + (c.overdueN ? "bad" : "ok") + '">' + c.overdueN + "</span></div><div class=\"card-b\">" +
          (c.overdue.length ? '<ul class="dx-list">' + c.overdue.map(function (i) { return '<li><a href="#/invoices/' + i.id + '"><b>' + esc(i.no) + "</b><small>" + esc(i.client) + " · due " + esc(i.due) + "</small></a><b class=\"dx-amt\">" + pkr(i.balance) + "</b></li>"; }).join("") + "</ul>"
            : '<div class="dx-empty">' + ic("check") + "<b>Nothing overdue</b><small>Every invoice is on time.</small></div>") + "</div></div>" +
      "</div>" +
      '<div class="grid dx-g84">' +
        '<div class="card"><div class="card-h"><h3>Latest enquiries</h3><a class="btn sm" href="#/enquiries">View all</a></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Service</th><th>Stage</th><th>When</th></tr></thead><tbody>' +
          (c.recent.length ? c.recent.map(function (l) { return '<tr onclick="location.hash=\'#/enquiries/' + l.id + '\'" style="cursor:pointer"><td><b style="color:var(--txt)">' + (l.read ? "" : '<i class="dx-dot"></i>') + esc(l.name) + "</b></td><td>" + esc(l.service || "—") + '</td><td><span class="badge st-' + l.stage + '">' + (STAGE[l.stage] || l.stage) + "</span></td><td class=\"muted\">" + ago(l.created_at) + "</td></tr>"; }).join("")
            : '<tr><td colspan="4" class="empty">No enquiries yet — they appear here as soon as the website form is used.</td></tr>') + "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><h3>Website</h3>' + (gTot ? '<span class="badge ok">Google connected</span>' : '<a class="btn sm" href="#/settings">Connect Google</a>') + '</div><div class="card-b">' +
          '<div class="dx-tgrow"><div><small>Visitors</small><b>' + (gTot && gTot.u != null ? (+gTot.u).toLocaleString() : "—") + '</b></div><div><small>Google clicks</small><b>' + (gTot && gTot.c != null ? (+gTot.c).toLocaleString() : "—") + '</b></div><div><small>Enquiries</small><b>' + k.leads[0] + "</b></div></div>" +
          '<h4 class="dx-h4">Where enquiries come from</h4>' +
          (c.sources.length ? c.sources.slice(0, 5).map(function (s) { var tot = c.sources.reduce(function (a, b) { return a + b.n; }, 0); return '<div class="dx-fr"><span>' + esc(s.name) + '</span><i><em style="width:' + (s.n / tot * 100) + '%"></em></i><b>' + s.n + "</b></div>"; }).join("") : '<p class="muted">No enquiries in this period.</p>') +
          '<p style="margin-top:14px"><a href="#/speed" class="btn sm">' + ic("gauge") + 'Speed</a> <a href="#/system" class="btn sm">' + ic("activity") + "System check</a></p></div></div>" +
      "</div>";
    W.fillIcons ? W.fillIcons($("#dx")) : 0;
    $("#dx-tab").onclick = function (e) { var b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; localStorage.setItem("wxDashTab", tab); [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); chart(r); };
    if ($("#dx-tg")) $("#dx-tg").onclick = function () {
      var v = prompt("Monthly payments target (PKR). Example: 2500000", t.target || ""); if (v == null) return;
      api("dash_target_save", { target: +String(v).replace(/[^\d.]/g, "") || 0 }).then(function (x) { if (!x.ok) return W.toast(x.error, true); W.toast("Target saved ✓"); VIEWS.dashboard(el); });
    };
    chart(r);
  }

  function chart(r) {
    if (!window.Chart) return setTimeout(function () { chart(r); }, 150);
    kill(); var cv = $("#dx-ch"); if (!cv) return;
    var s = r.crm.series, lab = r.axis.map(function (d) { return new Date(d + "T00:00").toLocaleDateString("en", { day: "numeric", month: "short" }); });
    var dark = document.documentElement.classList.contains("dark"), grid = dark ? "#1f2533" : "#eef0f3";
    var gold = "#b8956a", navy = dark ? "#9fb3d9" : "#0c1628", grad = function (c) { var g = cv.getContext("2d").createLinearGradient(0, 0, 0, 280); g.addColorStop(0, c + "55"); g.addColorStop(1, c + "00"); return g; };
    var sets, type = "line", money = false;
    if (tab === "sales") { type = "bar"; sets = [{ label: "Quotes sent", data: s.sent, backgroundColor: navy, borderRadius: 4 }, { label: "Approved", data: s.won, backgroundColor: gold, borderRadius: 4 }]; }
    else if (tab === "revenue") { money = true; sets = [{ label: "Invoiced", data: s.invoiced, borderColor: navy, backgroundColor: "transparent", tension: .35, borderWidth: 2, pointRadius: 0 }, { label: "Received", data: s.paid, borderColor: gold, backgroundColor: grad("#b8956a"), fill: true, tension: .35, borderWidth: 2.5, pointRadius: 0 }]; }
    else { sets = [{ label: "Enquiries", data: s.leads, borderColor: gold, backgroundColor: grad("#b8956a"), fill: true, tension: .35, borderWidth: 2.5, pointRadius: 0, yAxisID: "y" }];
      if (r.visitors.some(function (v) { return v != null; })) sets.push({ label: "Visitors", data: r.visitors, borderColor: navy, backgroundColor: "transparent", tension: .35, borderWidth: 2, pointRadius: 0, yAxisID: "y1" }); }
    var sum = function (a) { return a.reduce(function (x, y) { return x + (+y || 0); }, 0); };
    $("#dx-leg").innerHTML = sets.map(function (d) { var v = sum(d.data); return '<span><i style="background:' + (d.borderColor && d.borderColor !== "transparent" ? d.borderColor : d.backgroundColor) + '"></i>' + d.label + " <b>" + (money ? pkr(v) : v.toLocaleString()) + "</b></span>"; }).join("");
    var scales = { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0, callback: money ? function (v) { return pkr(v).replace("PKR ", ""); } : undefined } } };
    if (sets.some(function (d) { return d.yAxisID === "y1"; })) scales.y1 = { beginAtZero: true, position: "right", grid: { display: false }, border: { display: false }, ticks: { precision: 0 } };
    charts.push(new Chart(cv, { type: type, data: { labels: lab, datasets: sets }, options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: money ? { label: function (x) { return x.dataset.label + ": " + pkr(x.raw); } } : {} } }, scales: scales } }));
  }
})();
