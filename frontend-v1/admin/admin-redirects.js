/* Woodex Admin — P16 3.8b Redirects manager v2.
   301 / 302 / 410, exact or "starts with" rules, www + spam-cleanup switches, the verified redirect plan,
   a check for every rule (missing target, chains, hidden live pages), a 404 monitor with one-click "Redirect this", CSV import/export.
   The A2 view in admin-pages.js stays as the fallback when the server is older. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, api = W.api, toast = W.toast, $ = W.$, $$ = W.$$, base = W.VIEWS.redirects;
  var TYPE = { 301: "301 Moved", 302: "302 Temporary", 410: "410 Gone" };

  W.VIEWS.redirects = function (el) {
    var list = [], test = [], cfg = { www: true, spam: true }, rows404 = [], tab = "rules", filt = "all", q = "", dirty = false, planCount = 0;
    el.innerHTML = W.head("Redirects", "SEO / Redirects",
      '<button class="btn" id="rd-plan" title="Adds any missing rows from the verified redirect plan">' + ic("download") + 'Load plan</button>' +
      '<button class="btn" id="rd-csv">' + ic("download") + 'Export CSV</button>' +
      '<label class="btn" style="cursor:pointer">' + ic("upload") + 'Import CSV<input type="file" id="rd-imp" accept=".csv,text/csv" hidden></label>' +
      '<button class="btn" id="rd-add">' + ic("plus") + 'Add rule</button>' +
      '<button class="btn pri" id="rd-save">Save &amp; publish</button>') +
      '<div class="grid kpis rd-kpis" id="rd-k"></div>' +
      '<div class="card rd-sw"><div class="card-b">' +
        '<label class="rd-tog"><input type="checkbox" id="rd-www"><span><b>One official address (no www)</b><small>Sends every www.woodex.com.pk link to woodex.com.pk, so Google sees one copy of each page.</small></span></label>' +
        '<label class="rd-tog"><input type="checkbox" id="rd-spam"><span><b>Hacked-spam cleanup</b><small>Returns “410 Gone” for old casino / toy spam URLs and old WordPress links like ?p=123, so Google drops them.</small></span></label>' +
      '</div></div>' +
      '<div class="tabs us-tabs" id="rd-tabs"><a href="#" data-t="rules" class="on">' + ic("refresh-cw") + 'Rules</a><a href="#" data-t="404">' + ic("search") + '404 monitor <span class="badge" id="rd-n404">0</span></a></div>' +
      '<div class="card" id="rd-rules"><div class="us-bar"><input type="search" id="rd-q" placeholder="Search address or source…"><div class="seg" id="rd-f">' +
        [["all", "All"], ["301", "Redirects"], ["410", "Gone"], ["prob", "Problems"], ["off", "Off"]].map(function (x) { return '<button data-f="' + x[0] + '"' + (x[0] === "all" ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") +
      '</div></div><div class="tbl-wrap"><table class="tbl rd-tbl"><thead><tr><th style="width:44px">On</th><th>Old address</th><th style="width:118px">Match</th><th style="width:150px">Type</th><th>New address</th><th>Source</th><th style="width:170px">Check</th><th style="width:44px"></th></tr></thead><tbody id="rd-rows"></tbody></table></div></div>' +
      '<div class="card" id="rd-404" hidden><div class="card-b"><p class="muted" style="margin:0 0 10px">Addresses visitors tried that don’t exist. Fix the top ones with <b>Redirect this</b>. Counted by the 404 page, so bots that don’t run scripts are ignored.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Missed address</th><th style="width:80px">Hits</th><th style="width:130px">Last seen</th><th>Came from</th><th style="width:230px"></th></tr></thead><tbody id="rd-404rows"></tbody></table></div>' +
      '<div style="margin-top:10px;text-align:right"><button class="btn sm" id="rd-404clr">Clear list</button></div></div></div>' +
      '<datalist id="rd-list"></datalist>';
    W.fillIcons(el);

    function problem(t) { return t && (t.status === "bad" || t.status === "warn"); }
    function kpis() {
      var on = list.filter(function (r) { return r.on; }), gone = on.filter(function (r) { return +r.type === 410; }).length, prob = test.filter(problem).length;
      var k = function (icon, label, v, b) { return '<div class="card kpi"><div class="kpi-ic">' + ic(icon) + "</div><small>" + label + '</small><div class="kpi-row"><b>' + v + "</b>" + (b || "") + "</div></div>"; };
      $("#rd-k").innerHTML = k("refresh-cw", "Active rules", on.length, '<span class="badge">' + (list.length - on.length) + " off</span>") +
        k("chevron-right", "Redirects (301/302)", on.length - gone, '<span class="badge ok">to live pages</span>') +
        k("x", "Gone (410)", gone, '<span class="badge gold">spam & old WP</span>') +
        k("shield", "Problems", prob, prob ? '<span class="badge danger">fix</span>' : '<span class="badge ok">none</span>');
      W.fillIcons($("#rd-k")); $("#rd-n404").textContent = rows404.length;
    }
    function badge(t) {
      if (!t) return '<span class="badge">not checked</span>';
      var c = { ok: "ok", warn: "gold", bad: "danger", off: "" }[t.status] || "";
      return '<span class="badge ' + c + '" title="' + esc(t.msg) + '">' + esc(t.status === "ok" ? "✓ OK" : t.status === "off" ? "Off" : t.status === "bad" ? "✕ Broken" : "! Check") + '</span><small class="rd-msg">' + esc(t.msg) + "</small>";
    }
    function draw() {
      var shown = 0;
      $("#rd-rows").innerHTML = list.map(function (r, i) {
        var t = dirty ? null : test[i], ty = +r.type, hay = (r.from + " " + r.to + " " + r.src).toLowerCase();
        var vis = (!q || hay.indexOf(q) >= 0) && (filt === "all" || (filt === "301" && ty !== 410) || (filt === "410" && ty === 410) || (filt === "prob" && problem(t)) || (filt === "off" && !r.on));
        if (!vis) return ""; shown++;
        return "<tr" + (r.on ? "" : " class='rd-off'") + "><td><input type='checkbox' data-i='" + i + "' data-k='on'" + (r.on ? " checked" : "") + " aria-label='Rule on'></td>" +
          "<td><input data-i='" + i + "' data-k='from' value='" + esc(r.from) + "' placeholder='/old-page/'></td>" +
          "<td><select data-i='" + i + "' data-k='match'><option value='exact'" + (r.match !== "prefix" ? " selected" : "") + ">Exact</option><option value='prefix'" + (r.match === "prefix" ? " selected" : "") + ">Starts with</option></select></td>" +
          "<td><select data-i='" + i + "' data-k='type'>" + [301, 302, 410].map(function (x) { return "<option value='" + x + "'" + (ty === x ? " selected" : "") + ">" + TYPE[x] + "</option>"; }).join("") + "</select></td>" +
          "<td>" + (ty === 410 ? "<span class='muted'>— removed for good —</span>" : "<input data-i='" + i + "' data-k='to' list='rd-list' value='" + esc(r.to) + "' placeholder='/new-page/'>") + "</td>" +
          "<td><small class='muted'>" + esc(r.src || "Manual") + "</small></td><td>" + badge(t) + "</td>" +
          "<td><button class='btn sm danger' data-rm='" + i + "' aria-label='Delete rule'>" + ic("x") + "</button></td></tr>";
      }).join("") || "<tr><td colspan='8' class='empty'>" + (list.length ? "No rules match this filter." : "No redirects yet. Click “Load plan”.") + "</td></tr>";
      W.fillIcons($("#rd-rows")); kpis();
    }
    function draw404() {
      $("#rd-404rows").innerHTML = rows404.map(function (r) {
        var has = list.some(function (x) { return x.from.toLowerCase() === r.path.toLowerCase(); });
        return "<tr><td><code>" + esc(r.path) + "</code></td><td><b>" + r.n + "</b></td><td>" + esc(r.last ? W.ago(r.last) : "") + "</td><td><small class='muted'>" + esc(r.ref || "—") + "</small></td><td style='text-align:right;white-space:nowrap'>" +
          (has ? "<span class='badge ok'>rule exists</span> " : "<button class='btn sm pri' data-fix='" + esc(r.path) + "'>" + ic("refresh-cw") + "Redirect this</button> <button class='btn sm' data-gone='" + esc(r.path) + "'>410</button> ") +
          "<button class='btn sm' data-ign='" + esc(r.path) + "' aria-label='Remove from list'>" + ic("x") + "</button></td></tr>";
      }).join("") || "<tr><td colspan='5' class='empty'>No missed addresses yet. Good news, or the site has just gone live.</td></tr>";
      W.fillIcons($("#rd-404rows")); kpis();
    }
    function load(r) { list = r.redirects || []; test = r.test || []; dirty = false; draw(); draw404(); }

    // row edits
    $("#rd-rows").addEventListener("input", function (e) { var x = e.target; if (x.dataset.i == null) return; var r = list[+x.dataset.i]; r[x.dataset.k] = x.type === "checkbox" ? x.checked : x.value; if (x.dataset.k === "type") r.type = +x.value; if (!dirty) { dirty = true; } if (x.tagName === "SELECT" || x.type === "checkbox") draw(); });
    $("#rd-rows").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; list.splice(+b.dataset.rm, 1); dirty = true; draw(); });
    $("#rd-q").oninput = function () { q = this.value.toLowerCase(); draw(); };
    $("#rd-f").onclick = function (e) { var b = e.target.closest("[data-f]"); if (!b) return; filt = b.dataset.f; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); draw(); };
    $("#rd-tabs").onclick = function (e) { var a = e.target.closest("[data-t]"); if (!a) return; e.preventDefault(); tab = a.dataset.t; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === a); }); $("#rd-rules").hidden = tab !== "rules"; $("#rd-404").hidden = tab !== "404"; };
    ["www", "spam"].forEach(function (k) { $("#rd-" + k).onchange = function () { cfg[k] = this.checked; dirty = true; toast("Click “Save & publish” to apply"); }; });

    $("#rd-add").onclick = function () { list.unshift({ from: "", to: "", type: 301, match: "exact", src: "Manual", on: true }); dirty = true; filt = "all"; q = ""; $("#rd-q").value = ""; draw(); var i = $("#rd-rows input[data-k=from]"); if (i) i.focus(); };
    $("#rd-save").onclick = function () { var b = this; b.disabled = true; api("redirects_save", { redirects: list, cfg: cfg }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); load(r); var p = test.filter(problem).length; toast("Saved and published ✓" + (p ? " · " + p + " rule(s) need a look" : "")); }); };
    $("#rd-plan").onclick = function () { if (dirty && !confirm("Unsaved changes will be lost. Load the plan anyway?")) return; api("redirects_plan").then(function (r) { if (!r.ok) return toast(r.error, true); load(r); toast(r.added ? "Added " + r.added + " rule(s) from the plan ✓" : "All " + planCount + " plan rules are already in the list"); }); };

    // 404 monitor actions
    $("#rd-404rows").addEventListener("click", function (e) {
      var f = e.target.closest("[data-fix]"), g = e.target.closest("[data-gone]"), n = e.target.closest("[data-ign]");
      if (f || g) { var p = (f || g).dataset.fix || (f || g).dataset.gone; list.unshift({ from: p, to: "", type: g ? 410 : 301, match: "exact", src: "404 monitor", on: true }); dirty = true; filt = "all"; q = ""; $("#rd-q").value = "";
        $("#rd-tabs [data-t=rules]").click(); draw(); draw404(); var i = $("#rd-rows input[data-k=to]"); if (i && !g) i.focus(); toast(g ? "Added as 410 — click Save & publish" : "Pick the new address, then Save & publish"); }
      if (n) api("r404_clear", { path: n.dataset.ign }).then(function (r) { if (r.ok) { rows404 = r.rows; draw404(); } });
    });
    $("#rd-404clr").onclick = function () { if (confirm("Clear the whole 404 list?")) api("r404_clear", {}).then(function (r) { if (r.ok) { rows404 = r.rows; draw404(); } }); };

    // CSV
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    $("#rd-csv").onclick = function () {
      var csv = "from,to,type,match,source,on\n" + list.map(function (r) { return [r.from, r.to, r.type, r.match, r.src, r.on ? 1 : 0].map(cell).join(","); }).join("\n");
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "woodex-redirects.csv"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    $("#rd-imp").onchange = function () {
      var f = this.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        var lines = String(rd.result).split(/\r?\n/).filter(Boolean), n = 0, have = {}; list.forEach(function (r) { have[r.from.toLowerCase()] = 1; });
        lines.forEach(function (ln, i) {
          var c = [], cur = "", inq = false; for (var j = 0; j < ln.length; j++) { var ch = ln[j]; if (inq) { if (ch === '"' && ln[j + 1] === '"') { cur += '"'; j++; } else if (ch === '"') inq = false; else cur += ch; } else if (ch === '"') inq = true; else if (ch === ",") { c.push(cur); cur = ""; } else cur += ch; } c.push(cur);
          if (i === 0 && /^from$/i.test(c[0].trim())) return; var from = "/" + (c[0] || "").trim().replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "") + "/"; if (from === "//" || have[from.toLowerCase()]) return;
          list.push({ from: from, to: (c[1] || "").trim().replace(/^https?:\/\/(www\.)?woodex\.com\.pk/i, ""), type: +(c[2] || 301) || 301, match: /prefix|starts/i.test(c[3] || "") ? "prefix" : "exact", src: (c[4] || "CSV import").trim(), on: c[5] == null || !/^(0|no|false|off)$/i.test(c[5].trim()) }); have[from.toLowerCase()] = 1; n++;
        });
        dirty = true; draw(); toast("Imported " + n + " new rule(s). Check them, then Save & publish");
      };
      rd.readAsText(f); this.value = "";
    };

    api("redirects").then(function (r) {
      if (!r.ok) return toast(r.error, true);
      if (!r.cfg) return base && base(el); // older server: keep the A2 screen
      cfg = r.cfg; planCount = r.planCount || 0; $("#rd-www").checked = !!cfg.www; $("#rd-spam").checked = !!cfg.spam;
      load(r);
      api("r404_list").then(function (x) { if (x.ok) { rows404 = x.rows; draw404(); } });
    });
    (W.S.pages ? Promise.resolve({ ok: true, pages: W.S.pages }) : W.bapi("pages")).then(function (r) { if (r && r.ok) $("#rd-list").innerHTML = r.pages.map(function (p) { return "<option value='" + esc(p.url) + "'>" + esc(p.title) + "</option>"; }).join(""); }).catch(function () {});
  };
})();
