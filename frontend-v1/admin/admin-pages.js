/* Woodex Admin v2 — Phase A2: pages manager, SEO, templates, history, redirects, header & footer */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, ago = W.ago, head = W.head, can = W.can;
  var CITIES = "lahore karachi islamabad rawalpindi faisalabad multan peshawar quetta sialkot gujranwala hyderabad bahawalpur".split(" ");
  var STATUS = { published: ["ok", "Published"], hidden: ["info", "Hidden"], draft: ["warn", "Draft"] };
  function typeOf(p) { var top = p.path.split("/")[0]; if (p.path === "index.html") return "Home"; if (CITIES.indexOf(top) >= 0) return "Locations"; if (top === "insights") return "Insights / blog"; if (top === "projects") return "Projects"; if (/^(about|contact|privacy|estimator|404)/.test(top)) return "Company"; return "Services"; }
  function scoreBadge(n) { return '<span class="badge ' + (n >= 80 ? "ok" : n >= 55 ? "warn" : "bad") + '">' + n + "</span>"; }
  function counter(inp, out, lo, hi) { var f = function () { var n = inp.value.length; out.textContent = n + " / " + hi; out.style.color = n > hi || (lo && n && n < lo) ? "var(--bad)" : "var(--mut)"; }; inp.addEventListener("input", f); f(); }
  function loadPages() { return api("pages_list").then(function (r) { if (r.ok) S.plist = r.pages; return r; }); }
  function refreshBuilderPages() { bapi("pages").then(function (p) { if (p.ok) S.pages = p.pages; }); }

  // =========================================================== PAGES
  W.VIEWS.pages = function (el) {
    var st = S.pgState || (S.pgState = { q: "", type: "", status: "" });
    el.innerHTML = head("Pages", "Pages", '<button class="btn pri" id="pg-new">' + ic("file-plus") + "New page</button>") +
      '<div class="grid kpis" id="pg-kpis" style="margin-bottom:24px"></div>' +
      '<div class="card"><div class="card-h" style="padding-bottom:16px;flex-wrap:wrap"><div class="toolbar"><input type="search" id="pg-q" placeholder="Search title or address…" value="' + esc(st.q) + '">' +
      '<select id="pg-type" style="margin:0;height:40px;width:auto"><option value="">All types</option>' + ["Home", "Services", "Locations", "Projects", "Insights / blog", "Company"].map(function (t) { return "<option" + (st.type === t ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select>" +
      '<select id="pg-status" style="margin:0;height:40px;width:auto"><option value="">Any status</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="draft">Draft</option><option value="issues">Needs SEO work</option></select></div><span class="muted" id="pg-count"></span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th>Type</th><th>Status</th><th title="SEO score">SEO</th><th>Words</th><th>Last changed</th><th></th></tr></thead><tbody id="pg-rows"><tr><td colspan="7" class="empty">Loading pages…</td></tr></tbody></table></div></div>';
    $("#pg-status").value = st.status;
    var draw = function () {
      var all = S.plist || [], q = st.q.toLowerCase();
      var list = all.filter(function (p) { return (!q || (p.title + " " + p.url).toLowerCase().indexOf(q) >= 0) && (!st.type || typeOf(p) === st.type) && (!st.status || (st.status === "issues" ? p.score < 80 : p.status === st.status)); });
      var n = function (s) { return all.filter(function (p) { return p.status === s; }).length; }, avg = all.length ? Math.round(all.reduce(function (a, p) { return a + p.score; }, 0) / all.length) : 0;
      $("#pg-kpis").innerHTML = [["file-text", "All pages", all.length, '<span class="badge ok">' + n("published") + " live</span>"], ["eye", "Hidden (not in Google)", n("hidden"), ""], ["square-pen", "Drafts (not public)", n("draft"), ""], ["search", "Average SEO score", avg, '<span class="badge ' + (avg >= 80 ? "ok" : "warn") + '">' + all.filter(function (p) { return p.score < 80; }).length + " need work</span>"]]
        .map(function (k) { return '<div class="card kpi"><div class="kpi-ic">' + ic(k[0]) + "</div><small>" + k[1] + '</small><div class="kpi-row"><b>' + k[2] + "</b>" + k[3] + "</div></div>"; }).join("");
      $("#pg-rows").innerHTML = list.map(function (p) {
        var s = STATUS[p.status];
        return "<tr><td><b style='color:var(--txt);display:block;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(p.title || "(no title)") + "</b><a class='muted' href='" + esc(p.url) + "' target='_blank'>" + esc(p.url) + "</a></td>" +
          "<td class='muted'>" + typeOf(p) + "</td><td><span class='badge " + s[0] + "'>" + s[1] + "</span>" + (p.noindex && p.status === "published" ? " <span class='badge'>noindex</span>" : "") + "</td>" +
          "<td title='" + esc(p.issues.join("\n") || "No issues") + "'>" + scoreBadge(p.score) + "</td><td class='muted'>" + p.words + "</td><td>" + ago(p.mtime) + (p.editedBy ? "<small class='muted' style='display:block'>by " + esc(p.editedBy) + "</small>" : "") + "</td>" +
          "<td style='text-align:right;white-space:nowrap'><a class='btn sm' href='#/builder/" + encodeURIComponent(p.path) + "'>" + ic("square-pen") + "Edit</a> <button class='btn sm' data-seo='" + esc(p.path) + "' title='SEO & settings'>" + ic("settings") + "</button> <button class='btn sm' data-more='" + esc(p.path) + "' title='More'>⋯</button></td></tr>";
      }).join("") || "<tr><td colspan='7' class='empty'>No pages match.</td></tr>";
      W.fillIcons($("#pg-rows"));
      $("#pg-count").textContent = list.length + " of " + all.length + " pages";
      $$("[data-seo]").forEach(function (b) { b.onclick = function () { seoModal(find(b.dataset.seo), draw); }; });
      $$("[data-more]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); moreMenu(b, find(b.dataset.more), draw); }; });
    };
    var find = function (path) { return S.plist.find(function (p) { return p.path === path; }); };
    $("#pg-q").oninput = function () { st.q = this.value; draw(); };
    $("#pg-type").onchange = function () { st.type = this.value; draw(); };
    $("#pg-status").onchange = function () { st.status = this.value; draw(); };
    $("#pg-new").onclick = function () { newPage(null); };
    loadPages().then(function (r) { if (W.S.view !== "pages") return; if (!r.ok) return toast(r.error, true); draw(); });
  };

  function moreMenu(btn, p, redraw) {
    var old = $("#pg-menu"); if (old) old.remove();
    var m = document.createElement("div"); m.className = "dd-menu"; m.id = "pg-menu"; m.style.cssText = "position:fixed;z-index:60";
    m.innerHTML = '<a href="' + esc(p.url) + '" target="_blank">' + ic("eye") + "View live page</a><button data-a='hist'>" + ic("history") + "Version history</button><button data-a='sec'>" + ic("blocks") + "Sections outline</button><button data-a='dup'>" + ic("file-plus") + "Duplicate</button>" +
      (can("owner,admin") && p.path !== "index.html" && p.path !== "404.html" ? "<button data-a='del' style='color:var(--bad)'>" + ic("x") + "Delete…</button>" : "");
    document.body.appendChild(m); var r = btn.getBoundingClientRect(); m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 10) + "px"; m.style.left = r.right - 230 + "px";
    m.onclick = function (e) { var a = e.target.closest("[data-a]"); if (!a) return; m.remove(); ({ hist: history, sec: function () { W.outline(p); }, dup: function () { newPage(p); }, del: function () { delModal(p, redraw); } })[a.dataset.a](p); };
    setTimeout(function () { document.addEventListener("click", function h() { m.remove(); document.removeEventListener("click", h); }); });
  }

  // ---------------- SEO & settings
  function seoModal(p, redraw) {
    modal("<h2>SEO & page settings</h2><p class='muted' style='margin:-10px 0 16px'>" + esc(p.url) + "</p><form id='seo'>" +
      "<label>Status<select id='sf-st'><option value='published'>Published: public and in Google</option><option value='hidden'>Hidden: public link, not in Google or sitemap</option><option value='draft'" + (p.path === "index.html" ? " disabled" : "") + ">Draft: not public (404 for visitors)</option></select></label>" +
      "<label>Page title <small id='sf-tc'></small><input id='sf-t' value='" + esc(p.title) + "' required></label>" +
      "<label>Meta description <small id='sf-dc'></small><textarea id='sf-d' rows='3'>" + esc(p.description) + "</textarea></label>" +
      "<div style='border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 14px'><small class='muted'>Google preview</small><div id='sf-prev'></div></div>" +
      "<label>Social share image <small>(1200×630 recommended)</small><div style='display:flex;gap:8px'><input id='sf-og' value='" + esc(p.ogImage) + "' placeholder='/assets/uploads/…'><button type='button' class='btn' id='sf-pick' style='margin-top:6px'>Choose</button></div></label>" +
      "<label>Canonical address <small>(leave empty unless this page copies another)</small><input id='sf-c' value='" + esc(p.canonical) + "' placeholder='https://woodex.com.pk" + esc(p.url) + "'></label>" +
      "<label class='check'><input type='checkbox' id='sf-ni'" + (p.noindex ? " checked" : "") + "> Hide from search engines (noindex)</label>" +
      (p.issues.length ? "<div class='card' style='padding:12px 14px;margin:6px 0 14px;background:var(--warn-soft);border-color:transparent'><b style='font-size:13px'>SEO check (" + p.score + "/100)</b><ul style='margin:6px 0 0;padding-left:18px;color:var(--txt2)'>" + p.issues.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>" : "<p class='badge ok' style='margin:0 0 14px'>✓ No SEO issues</p>") +
      "<p class='err' id='sf-err'></p><div class='modal-actions'><button type='button' class='btn' id='sf-x'>Cancel</button><button class='btn pri'>Save settings</button></div></form>");
    $("#modal-card").style.maxWidth = "640px";
    $("#sf-st").value = p.status;
    counter($("#sf-t"), $("#sf-tc"), 0, 60); counter($("#sf-d"), $("#sf-dc"), 70, 160);
    var prev = function () { $("#sf-prev").innerHTML = "<div style='color:#1a0dab;font-size:18px;line-height:1.3;margin-top:4px'>" + esc($("#sf-t").value.slice(0, 62) || "(no title)") + "</div><div style='color:#006621;font-size:13px'>woodex.com.pk" + esc(p.url) + "</div><div style='color:var(--txt2);font-size:13px'>" + esc($("#sf-d").value.slice(0, 160) || "Google will pick text from the page.") + "</div>"; };
    $("#sf-t").addEventListener("input", prev); $("#sf-d").addEventListener("input", prev); prev();
    $("#sf-x").onclick = function () { closeModal(); $("#modal-card").style.maxWidth = ""; };
    $("#sf-pick").onclick = function () {
      bapi("media").then(function (r) {
        if (!r.ok) return; var box = document.createElement("div"); box.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;max-height:220px;overflow:auto;margin:-6px 0 14px";
        box.innerHTML = r.media.slice(0, 120).map(function (u) { return "<button type='button' data-u='" + esc(u) + "' style='border:1px solid var(--line);border-radius:8px;padding:0;background:none;cursor:pointer;aspect-ratio:1;overflow:hidden'><img src='" + esc(u) + "' loading='lazy' style='width:100%;height:100%;object-fit:cover'></button>"; }).join("");
        $("#sf-pick").closest("label").after(box);
        box.onclick = function (e) { var b = e.target.closest("[data-u]"); if (b) { $("#sf-og").value = b.dataset.u; box.remove(); } };
      });
    };
    $("#seo").onsubmit = function (e) {
      e.preventDefault();
      api("page_meta_save", { path: p.path, status: $("#sf-st").value, title: $("#sf-t").value, description: $("#sf-d").value, ogImage: $("#sf-og").value, canonical: $("#sf-c").value, noindex: $("#sf-ni").checked })
        .then(function (r) { if (!r.ok) return ($("#sf-err").textContent = r.error); Object.assign(p, r.page); closeModal(); $("#modal-card").style.maxWidth = ""; toast("Page settings saved ✓"); redraw(); });
    };
  }

  // ---------------- new / duplicate
  function newPage(from) {
    var pages = (S.plist || []).filter(function (p) { return p.path !== "404.html"; }), groups = {};
    pages.forEach(function (p) { (groups[typeOf(p)] = groups[typeOf(p)] || []).push(p); });
    var slugBase = from ? from.path.replace(/\/?index\.html$/, "").split("/").pop() + "-copy" : "";
    var folderBase = from && from.path.split("/").length > 2 ? from.path.split("/")[0] : "";
    modal("<h2>" + (from ? "Duplicate page" : "New page") + "</h2><form id='np'>" +
      "<label>Start from<select id='np-tpl'><option value='__blank'>Blank page (site header & footer, empty content)</option>" +
        (W.LAYOUTS ? "<optgroup label='Ready layouts (new sections)'>" + W.LAYOUTS.map(function (l) { return "<option value='__L:" + l[0] + "'>" + esc(l[1]) + " — " + esc(l[2]) + "</option>"; }).join("") + "</optgroup>" : "") +
        Object.keys(groups).map(function (g) { return "<optgroup label='" + esc(g) + " (copy layout)'>" + groups[g].map(function (p) { return "<option value='" + esc(p.path) + "'" + (from && from.path === p.path ? " selected" : "") + ">" + esc(p.title.slice(0, 70)) + "</option>"; }).join("") + "</optgroup>"; }).join("") + "</select></label>" +
      "<label>Page title<input id='np-t' required value='" + esc(from ? from.title + " (copy)" : "") + "' placeholder='e.g. Office Interior Design in Lahore'></label>" +
      "<div class='g2'><label>Folder <small>(optional)</small><input id='np-f' value='" + esc(folderBase) + "' placeholder='e.g. insights'></label><label>Page address<input id='np-s' required value='" + esc(slugBase) + "' placeholder='office-design-lahore'></label></div>" +
      "<p class='hint' style='margin:-8px 0 12px'>Address: <b id='np-url'></b></p>" +
      "<label class='check'><input type='checkbox' id='np-draft' checked> Start as draft (not public until you publish)</label>" +
      "<p class='err' id='np-err'></p><div class='modal-actions'><button type='button' class='btn' id='np-x'>Cancel</button><button class='btn pri' id='np-go'>Create & open in builder</button></div></form>");
    var slugify = function (s) { return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); };
    var touched = !!from;
    var url = function () { $("#np-url").textContent = "/" + ($("#np-f").value.trim() ? slugify($("#np-f").value) + "/" : "") + ($("#np-s").value || "…") + "/"; };
    $("#np-t").oninput = function () { if (!touched) $("#np-s").value = slugify(this.value); url(); };
    $("#np-s").oninput = function () { touched = true; this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); url(); };
    $("#np-f").oninput = url; url();
    $("#np-x").onclick = closeModal;
    $("#np").onsubmit = function (e) {
      e.preventDefault(); var go = $("#np-go"); go.disabled = true; $("#np-err").textContent = "";
      var tpl = $("#np-tpl").value, title = $("#np-t").value.trim(), folder = slugify($("#np-f").value), slug = $("#np-s").value.replace(/^-+|-+$/g, "");
      bapi("load", { path: tpl === "__blank" || tpl.indexOf("__L:") === 0 ? "index.html" : tpl }).then(function (r) {
        if (!r.ok) throw new Error(r.error || "Could not load the template");
        var html = r.html, e2 = function (s) { return esc(s); };
        html = html.replace(/<title>[\s\S]*?<\/title>/i, function () { return "<title>" + e2(title) + "</title>"; });
        html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/i, "");
        if (tpl.indexOf("__L:") === 0 && W.layoutHtml) html = html.replace(/<main\b[\s\S]*<\/main>/i, function () { return '<main id="main">' + W.layoutHtml(tpl.slice(4), e2(title)) + "</main>"; });
        else if (tpl === "__blank") html = html.replace(/<main\b[\s\S]*<\/main>/i, function () { return '<main id="main"><section class="wx-section" style="padding:160px 0 96px"><div class="container"><h1>' + e2(title) + "</h1><p>Start building this page: add sections from the left panel.</p></div></section></main>"; });
        else { var once = false; html = html.replace(/(<main\b[\s\S]*?<h1\b[^>]*>)([\s\S]*?)(<\/h1>)/i, function (m, a, b, c) { if (once) return m; once = true; return a + e2(title) + c; }); }
        return bapi("page_new", { folder: folder, slug: slug, html: html });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        var go2 = function () { closeModal(); toast("Page created ✓"); refreshBuilderPages(); location.hash = "#/builder/" + encodeURIComponent(r.path); };
        if (!$("#np-draft").checked) return go2();
        return api("page_meta_save", { path: r.path, status: "draft", title: title, description: "" }).then(go2);
      }).catch(function (err) { go.disabled = false; $("#np-err").textContent = err.message; });
    };
  }

  // ---------------- delete
  function delModal(p, redraw) {
    modal("<h2>Delete page</h2><p>Delete <b>" + esc(p.title) + "</b> (" + esc(p.url) + ")?</p><p class='muted'>The file is moved to the server trash, and visitors plus Google are sent to the page you choose (301 redirect), so no links break.</p>" +
      "<label>Send visitors to<input id='dl-to' list='dl-list' required placeholder='/contact/'><datalist id='dl-list'>" + (S.plist || []).filter(function (x) { return x.path !== p.path; }).map(function (x) { return "<option value='" + esc(x.url) + "'>" + esc(x.title) + "</option>"; }).join("") + "</datalist></label>" +
      "<p class='err' id='dl-err'></p><div class='modal-actions'><button class='btn' id='dl-x'>Cancel</button><button class='btn danger' id='dl-go'>" + ic("x") + "Delete & redirect</button></div>");
    $("#dl-x").onclick = closeModal;
    $("#dl-go").onclick = function () {
      api("page_delete", { path: p.path, redirectTo: $("#dl-to").value.trim() }).then(function (r) {
        if (!r.ok) return ($("#dl-err").textContent = r.error);
        S.plist = S.plist.filter(function (x) { return x.path !== p.path; }); closeModal(); toast("Page deleted and redirected ✓"); refreshBuilderPages(); redraw();
      });
    };
  }

  // ---------------- version history + compare
  function stampText(f) { var m = /^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/.exec(f); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; }
  function history(p) {
    modal("<h2>Version history</h2><p class='muted' style='margin:-10px 0 14px'>" + esc(p.title) + " · last 30 versions are kept</p><div id='hi-list' class='empty'>Loading…</div><div class='modal-actions'><button class='btn' id='hi-x'>Close</button></div>");
    $("#modal-card").style.maxWidth = "760px";
    $("#hi-x").onclick = function () { closeModal(); $("#modal-card").style.maxWidth = ""; };
    bapi("backups", { path: p.path }).then(function (r) {
      if (!r.ok) return ($("#hi-list").textContent = r.error || "Could not load history");
      if (!r.backups.length) return ($("#hi-list").textContent = "No earlier versions yet. A version is saved every time this page changes.");
      $("#hi-list").className = ""; $("#hi-list").innerHTML = "<table class='tbl'><tbody>" + r.backups.map(function (b) { var d = stampText(b.file); return "<tr><td><b style='color:var(--txt)'>" + (d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : esc(b.file)) + "</b><small class='muted' style='display:block'>" + (d ? ago(d.getTime() / 1000) : "") + " · " + Math.round(b.size / 1024) + " KB</small></td><td style='text-align:right;white-space:nowrap'><button class='btn sm' data-cmp='" + esc(b.file) + "'>Compare with now</button> <button class='btn sm' data-rs='" + esc(b.file) + "'>" + ic("history") + "Restore</button></td></tr>"; }).join("") + "</tbody></table><div id='hi-diff'></div>";
      W.fillIcons($("#hi-list"));
      $$("[data-rs]").forEach(function (b) { b.onclick = function () { if (!confirm("Restore this version? The current version is kept in history, so you can undo this.")) return; bapi("restore", { path: p.path, file: b.dataset.rs }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Version restored ✓"); history(p); }); }; });
      $$("[data-cmp]").forEach(function (b) { b.onclick = function () { $("#hi-diff").innerHTML = "<p class='muted'>Comparing…</p>"; Promise.all([api("backup_get", { path: p.path, file: b.dataset.cmp }), bapi("load", { path: p.path })]).then(function (x) { if (!x[0].ok || !x[1].ok) return; $("#hi-diff").innerHTML = diffView(x[0].html, x[1].html); $("#hi-diff").scrollIntoView({ block: "nearest" }); }); }; });
    });
  }
  function toLines(h) {
    // readable lines: visible text blocks + important attributes (links/images)
    return h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<(title|h[1-6]|p|li|a|button|figcaption|td|th|label|span|small|strong)\b/gi, "\n<$1").replace(/<img\b[^>]*>/gi, function (t) { var s = /src="([^"]*)"/.exec(t); return "\n[image " + (s ? s[1] : "") + "]\n"; })
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>/gi, "[link $1] ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").split("\n").map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
  }
  function diffView(a, b) {
    var A = toLines(a), B = toLines(b), s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
    var ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
    var x = A.slice(s, ea), y = B.slice(s, eb);
    if (!x.length && !y.length) return "<p class='badge ok' style='margin-top:14px'>No visible text or link changes (only code/styling differs).</p>";
    if (x.length * y.length > 2500000) return "<p class='muted'>Too many changes to show line by line (" + x.length + " → " + y.length + " lines).</p>";
    var n = x.length, m = y.length, L = []; for (var i = 0; i <= n; i++) L.push(new Uint16Array(m + 1));
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = []; i = 0; j = 0;
    while (i < n || j < m) { if (i < n && j < m && x[i] === y[j]) { out.push([" ", x[i]]); i++; j++; } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { out.push(["+", y[j]]); j++; } else { out.push(["-", x[i]]); i++; } }
    var rows = out.filter(function (r, k) { if (r[0] !== " ") return true; for (var d = -2; d <= 2; d++) if (out[k + d] && out[k + d][0] !== " ") return true; return false; });
    var add = out.filter(function (r) { return r[0] === "+"; }).length, del = out.filter(function (r) { return r[0] === "-"; }).length;
    return "<div style='margin-top:16px'><b>Changes</b> <span class='badge bad'>− " + del + " old</span> <span class='badge ok'>+ " + add + " now</span><div style='margin-top:10px;border:1px solid var(--line);border-radius:10px;max-height:320px;overflow:auto;font-size:13px'>" +
      rows.slice(0, 400).map(function (r) { return "<div style='padding:4px 10px;border-bottom:1px solid var(--line);" + (r[0] === "+" ? "background:var(--ok-soft)" : r[0] === "-" ? "background:var(--bad-soft);text-decoration:line-through;opacity:.8" : "color:var(--mut)") + "'>" + (r[0] === " " ? "" : "<b>" + r[0] + "</b> ") + esc(r[1].slice(0, 300)) + "</div>"; }).join("") + "</div></div>";
  }

  // =========================================================== REDIRECTS
  W.VIEWS.redirects = function (el) {
    el.innerHTML = head("Redirects", "Redirects", '<button class="btn" id="rd-add">' + ic("plus") + 'Add redirect</button><button class="btn pri" id="rd-save">Save redirects</button>') +
      '<div class="card"><div class="card-b"><p class="muted" style="margin-top:0">Send visitors and Google from an old address to a new one (301 permanent). Deleting a page adds one automatically.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Old address</th><th></th><th>New address</th><th></th></tr></thead><tbody id="rd-rows"></tbody></table></div></div></div>' +
      '<datalist id="rd-list"></datalist>';
    var list = [];
    var draw = function () {
      $("#rd-rows").innerHTML = list.map(function (r, i) { return "<tr><td><input data-i='" + i + "' data-k='from' value='" + esc(r.from) + "' placeholder='/old-page/' style='margin:0'></td><td style='width:30px;color:var(--mut)'>→</td><td><input data-i='" + i + "' data-k='to' list='rd-list' value='" + esc(r.to) + "' placeholder='/new-page/' style='margin:0'></td><td style='width:60px'><button class='btn sm danger' data-rm='" + i + "'>" + ic("x") + "</button></td></tr>"; }).join("") || "<tr><td colspan='4' class='empty'>No redirects yet.</td></tr>";
      W.fillIcons($("#rd-rows"));
      $$("#rd-rows input").forEach(function (inp) { inp.oninput = function () { list[+inp.dataset.i][inp.dataset.k] = inp.value; }; });
      $$("[data-rm]").forEach(function (b) { b.onclick = function () { list.splice(+b.dataset.rm, 1); draw(); }; });
    };
    $("#rd-add").onclick = function () { list.push({ from: "", to: "" }); draw(); var i = $$("#rd-rows input[data-k=from]").pop(); if (i) i.focus(); };
    $("#rd-save").onclick = function () { api("redirects_save", { redirects: list }).then(function (r) { if (!r.ok) return toast(r.error, true); list = r.redirects; draw(); toast("Redirects saved ✓"); }); };
    api("redirects").then(function (r) { if (!r.ok) return toast(r.error, true); list = r.redirects; draw(); });
    (S.pages ? Promise.resolve({ ok: true, pages: S.pages }) : bapi("pages")).then(function (r) { if (r.ok) $("#rd-list").innerHTML = r.pages.map(function (p) { return "<option value='" + esc(p.url) + "'>" + esc(p.title) + "</option>"; }).join(""); });
  };

  // =========================================================== HEADER & FOOTER
  W.VIEWS.global = function (el) {
    el.innerHTML = head("Header & footer", "Header & footer") +
      '<div class="toolbar" style="margin-bottom:18px"><button class="btn pri" data-gt="menu">Main menu</button><button class="btn" data-gt="replace">Find & replace</button></div><div id="gl-body"></div>';
    $$("[data-gt]").forEach(function (b) { b.onclick = function () { $$("[data-gt]").forEach(function (x) { x.classList.toggle("pri", x === b); }); (b.dataset.gt === "menu" ? menuEditor : replaceTool)($("#gl-body")); }; });
    menuEditor($("#gl-body"));
  };

  // ---------------- menu editor (structured: rebuilds desktop nav + mobile menu on every page)
  function menuEditor(box) {
    box.innerHTML = '<div class="empty">Loading the menu from the home page…</div>';
    bapi("load", { path: "index.html" }).then(function (r) {
      if (!r.ok) return (box.innerHTML = '<div class="empty">' + esc(r.error || "Could not load") + "</div>");
      var doc = new DOMParser().parseFromString(r.html, "text/html"), nav = doc.querySelector("nav.desktop-nav"), mob = doc.querySelector("nav.mobile-panel");
      if (!nav || !mob) return (box.innerHTML = '<div class="empty">This site’s menu structure was not found.</div>');
      var M = { items: [], mobile: [], feature: "" };
      Array.prototype.forEach.call(nav.children, function (n) {
        if (n.tagName === "A") M.items.push({ type: "link", label: n.textContent.trim(), href: n.getAttribute("href"), route: n.getAttribute("data-page-route") || "", id: n.id || "" });
        else if (n.classList.contains("nav-services")) {
          var trig = n.querySelector(".nav-services-trigger"), f = n.querySelector(".mega-feature");
          M.feature = f ? f.outerHTML.replace(/<img(?![^>]*loading=)/g, '<img loading="lazy" decoding="async"') : "";
          M.items.push({ type: "mega", label: trig ? trig.childNodes[0].textContent.trim() : "Services", cols: Array.prototype.map.call(n.querySelectorAll(".mega-column"), function (c) {
            var t = c.querySelector(".mega-title"); return { title: t.textContent.trim(), href: t.getAttribute("href"), route: t.getAttribute("data-page-route") || "", links: Array.prototype.filter.call(c.querySelectorAll("a"), function (a) { return a !== t; }).map(function (a) { return { label: a.textContent.trim(), href: a.getAttribute("href"), route: a.getAttribute("data-page-route") || "" }; }) };
          }) });
        }
      });
      Array.prototype.forEach.call(mob.querySelectorAll("a"), function (a) { M.mobile.push({ label: a.textContent.trim(), href: a.getAttribute("href"), primary: a.classList.contains("mobile-primary") }); });
      var pagesDl = "<datalist id='mn-pages'>" + (S.pages || []).map(function (p) { return "<option value='" + esc(p.url) + "'>" + esc(p.title) + "</option>"; }).join("") + "</datalist>";
      var draw = function () {
        var row = function (path, o, extra) { return "<div class='mn-row' style='display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px'><input data-p='" + path + ".label' value='" + esc(o.label) + "' placeholder='Label' style='margin:0'><input data-p='" + path + ".href' list='mn-pages' value='" + esc(o.href) + "' placeholder='/page/' style='margin:0'><span style='display:flex;gap:4px'>" + (extra || "") + "<button class='btn sm' data-mv='" + path + "|-1' title='Move up'>↑</button><button class='btn sm' data-mv='" + path + "|1' title='Move down'>↓</button><button class='btn sm danger' data-rm='" + path + "' title='Remove'>✕</button></span></div>"; };
        box.innerHTML = pagesDl + '<div class="grid"><div class="card"><div class="card-h"><h3>Desktop menu</h3><span class="toolbar"><button class="btn sm" id="mn-add">' + ic("plus") + 'Link</button></span></div><div class="card-b">' +
          M.items.map(function (it, i) {
            if (it.type === "link") return row("items." + i, it);
            return "<div style='border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px'><div style='display:flex;gap:8px;align-items:center;margin-bottom:10px'><span class='badge gold'>Dropdown</span><input data-p='items." + i + ".label' value='" + esc(it.label) + "' style='margin:0;max-width:220px'><span style='margin-left:auto;display:flex;gap:4px'><button class='btn sm' data-mv='items." + i + "|-1'>↑</button><button class='btn sm' data-mv='items." + i + "|1'>↓</button></span></div>" +
              "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px'>" + it.cols.map(function (c, ci) {
                var base = "items." + i + ".cols." + ci;
                return "<div style='background:var(--bg);border-radius:10px;padding:10px'><small class='muted'>Column " + (ci + 1) + " heading</small><div style='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0 8px'><input data-p='" + base + ".title' value='" + esc(c.title) + "' style='margin:0;font-weight:600'><input data-p='" + base + ".href' list='mn-pages' value='" + esc(c.href) + "' style='margin:0'></div>" +
                  c.links.map(function (l, li) { return row(base + ".links." + li, l); }).join("") + "<button class='btn sm' data-addl='" + base + "'>" + ic("plus") + "Link</button></div>";
              }).join("") + "</div></div>";
          }).join("") + '</div></div>' +
          '<div class="card"><div class="card-h"><h3>Mobile menu</h3><span class="toolbar"><button class="btn sm" id="mn-madd">' + ic("plus") + "Link</button></span></div><div class='card-b'>" +
          M.mobile.map(function (it, i) { return row("mobile." + i, it, "<label class='check' style='margin:0 6px 0 0;font-size:12px' title='Show as the gold button'><input type='checkbox' data-pc='mobile." + i + ".primary'" + (it.primary ? " checked" : "") + ">Button</label>"); }).join("") +
          "</div></div></div>" +
          '<div class="card" style="margin-top:24px"><div class="card-b" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:260px"><b>Apply to all pages</b><p class="muted" style="margin:2px 0 0">Updates the desktop menu and mobile menu on every page. Each page is backed up first. Page-specific buttons (e.g. “Get a quote” targets) are not touched.</p></div><button class="btn" id="mn-reset">Discard changes</button><button class="btn pri" id="mn-apply">Apply to all pages</button></div></div>';
        W.fillIcons(box);
      };
      var get = function (p) { return p.split(".").reduce(function (o, k) { return o[k]; }, M); };
      var parentOf = function (p) { var a = p.split("."), k = +a.pop(); return { arr: get(a.join(".")), k: k }; };
      box.addEventListener("input", function (e) { var p = e.target.dataset.p; if (p) { var a = p.split("."), k = a.pop(); get(a.join("."))[k] = e.target.value; } });
      box.addEventListener("change", function (e) { var p = e.target.dataset.pc; if (p) { var a = p.split("."), k = a.pop(); get(a.join("."))[k] = e.target.checked; } });
      box.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        if (b.dataset.mv) { var q = b.dataset.mv.split("|"), o = parentOf(q[0]), to = o.k + +q[1]; if (to < 0 || to >= o.arr.length) return; o.arr.splice(to, 0, o.arr.splice(o.k, 1)[0]); draw(); }
        else if (b.dataset.rm) { var o2 = parentOf(b.dataset.rm); o2.arr.splice(o2.k, 1); draw(); }
        else if (b.dataset.addl) { get(b.dataset.addl).links.push({ label: "New link", href: "/", route: "" }); draw(); }
        else if (b.id === "mn-add") { M.items.push({ type: "link", label: "New link", href: "/", route: "" }); draw(); }
        else if (b.id === "mn-madd") { M.mobile.splice(Math.max(0, M.mobile.length - 1), 0, { label: "New link", href: "/" }); draw(); }
        else if (b.id === "mn-reset") menuEditor(box);
        else if (b.id === "mn-apply") apply();
      });
      var A = function (s) { return esc(s || ""); };
      var build = function () {
        var d = '<nav class="desktop-nav" aria-label="Page navigation">\n' + M.items.map(function (it) {
          if (it.type === "link") return '      <a' + (it.id ? ' id="' + A(it.id) + '"' : "") + ' href="' + A(it.href) + '"' + (it.route ? ' data-page-route="' + A(it.route) + '"' : "") + ">" + A(it.label) + "</a>";
          return '      <div class="nav-services">\n        <button class="nav-services-trigger" type="button" aria-expanded="false" aria-controls="services-menu">' + A(it.label) + ' <span aria-hidden="true">⌄</span></button>\n        <div class="mega-menu" id="services-menu">\n' +
            it.cols.map(function (c, ci) { return '          <div class="mega-column"><span class="mega-number">' + String(ci + 1).padStart(2, "0") + '</span><a class="mega-title" href="' + A(c.href) + '"' + (c.route ? ' data-page-route="' + A(c.route) + '"' : "") + ">" + A(c.title) + "</a>" + c.links.map(function (l) { return '<a href="' + A(l.href) + '"' + (l.route ? ' data-page-route="' + A(l.route) + '"' : "") + ">" + A(l.label) + "</a>"; }).join("") + "</div>\n"; }).join("") +
            (M.feature ? "          " + M.feature + "\n" : "") + "        </div>\n      </div>";
        }).join("\n") + "\n    </nav>";
        var m = '<nav class="mobile-panel" id="mobile-menu" aria-label="Mobile navigation">' + M.mobile.map(function (l) { return "<a" + (l.primary ? ' class="mobile-primary"' : "") + ' href="' + A(l.href) + '">' + A(l.label) + "</a>"; }).join("") + "</nav>";
        return { desktop: d, mobile: m };
      };
      var apply = function () {
        var links = []; M.items.forEach(function (it) { if (it.type === "link") links.push(it); else { if (!String(it.label).trim()) links.push({ label: "" }); it.cols.forEach(function (c) { links.push({ label: c.title, href: c.href }); links = links.concat(c.links); }); } });
        var bad = links.concat(M.mobile).filter(function (x) { return !String(x.label || "").trim() || !String(x.href || "").trim(); });
        if (bad.length) return toast("Every link needs a label and an address", true);
        if (!confirm("Update the menu on all " + (S.pages ? S.pages.length : "") + " pages? Every page is backed up first.")) return;
        var h = build(); api("global_menu", h).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Menu updated on " + x.changed + " pages ✓"); });
      };
      draw();
    });
  }

  // ---------------- find & replace (header / mobile menu / footer only)
  W.replaceTool = replaceTool; W.newPage = newPage; /*P19 F6*/
  function replaceTool(box) {
    box.innerHTML = '<div class="card"><div class="card-b"><p class="muted" style="margin-top:0">Change text, a phone number, an email, a link or the logo file in the header, mobile menu and footer of <b>every page</b>, without touching page content. Preview first, then apply. Each changed page is backed up.</p>' +
      '<div class="g2"><label>Find<input id="fr-f" placeholder="e.g. 0322 4000768 or /assets/img/old-logo.png"></label><label>Replace with<input id="fr-r" placeholder="new text"></label></div>' +
      '<div class="toolbar" style="margin-bottom:14px"><label class="check" style="margin:0"><input type="checkbox" value="header" checked> Header</label><label class="check" style="margin:0"><input type="checkbox" value="mobile" checked> Mobile menu</label><label class="check" style="margin:0"><input type="checkbox" value="footer" checked> Footer</label></div>' +
      '<div class="toolbar"><button class="btn" id="fr-prev">' + ic("search") + 'Preview matches</button><button class="btn pri" id="fr-go" disabled>Replace everywhere</button></div><div id="fr-out" style="margin-top:16px"></div></div></div>';
    W.fillIcons(box);
    var args = function (dry) { return { find: $("#fr-f").value, replace: $("#fr-r").value, dry: dry, scope: $$("#gl-body input[type=checkbox]:checked").map(function (c) { return c.value; }) }; };
    var last = "";
    $("#fr-f").oninput = $("#fr-r").oninput = function () { $("#fr-go").disabled = true; };
    $("#fr-prev").onclick = function () {
      api("global_replace", args(true)).then(function (r) {
        if (!r.ok) return toast(r.error, true);
        last = JSON.stringify(args(false)); $("#fr-go").disabled = !r.total;
        $("#fr-out").innerHTML = r.total ? "<p><b>" + r.total + " matches</b> on <b>" + r.pages.length + " pages</b>.</p><div style='max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px'><table class='tbl'><tbody>" + r.pages.map(function (p) { return "<tr><td>/" + esc(p.path.replace(/index\.html$/, "")) + "</td><td style='text-align:right'><span class='badge'>" + p.count + "</span></td></tr>"; }).join("") + "</tbody></table></div>" : "<p class='muted'>No matches in the chosen areas.</p>";
      });
    };
    $("#fr-go").onclick = function () {
      if (JSON.stringify(args(false)) !== last) return toast("Preview again: the search changed", true);
      if (!confirm("Replace on all listed pages?")) return;
      api("global_replace", args(false)).then(function (r) { if (!r.ok) return toast(r.error, true); $("#fr-go").disabled = true; $("#fr-out").innerHTML = "<p class='badge ok'>✓ Replaced " + r.total + " matches on " + r.pages.length + " pages</p>"; });
    };
  }
})();
