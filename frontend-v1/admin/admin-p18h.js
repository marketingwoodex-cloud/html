/* Woodex Admin — P18 H: System (safe mode). Views: #/maintenance, #/files, #/database.
   API: mt_*, fm_*, dbx_* (api/p18h-lib.php) + existing backup_* (Media → Backups). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var css = document.createElement("style");
  css.textContent = ".mt-hero{display:flex;gap:18px;align-items:center;padding:22px 24px}.mt-dot{width:14px;height:14px;border-radius:50%;background:#12b76a;box-shadow:0 0 0 6px rgba(18,183,106,.15);flex:none}.mt-dot.on{background:#f79009;box-shadow:0 0 0 6px rgba(247,144,9,.18)}.mt-hero h3{margin:0;font-size:17px}.mt-hero p{margin:2px 0 0;color:var(--mut);font-size:13.5px}.mt-hero .sp{flex:1}" +
    ".mt-pages{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:1000px){.mt-pages{grid-template-columns:1fr 1fr}}.mt-pg{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}.mt-pg .fr{height:170px;overflow:hidden;position:relative;background:#f4efe7}.mt-pg iframe{width:1280px;height:680px;border:0;transform:scale(.25);transform-origin:0 0;pointer-events:none}.mt-pg .b{padding:10px 12px;display:flex;gap:6px;align-items:center}.mt-pg .b b{flex:1;font-size:13.5px}" +
    ".fm-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.fm-crumb{display:flex;gap:4px;align-items:center;font-size:14px;flex:1;flex-wrap:wrap}.fm-crumb a{color:inherit;text-decoration:none;padding:4px 8px;border-radius:6px}.fm-crumb a:hover{background:var(--bg)}.fm-crumb span{color:var(--mut)}" +
    ".fm-tbl td{vertical-align:middle}.fm-ic{width:36px;height:36px;border-radius:8px;background:var(--bg);display:grid;place-items:center;overflow:hidden;flex:none}.fm-ic img{width:100%;height:100%;object-fit:cover}.fm-n{display:flex;gap:10px;align-items:center;cursor:pointer}.fm-drop{border:2px dashed var(--line);border-radius:12px;padding:14px;text-align:center;color:var(--mut);font-size:13px;margin-bottom:12px}.fm-drop.over{border-color:#b8956a;background:#fbf6ef}" +
    ".db-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:18px;align-items:start}@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}.db-t{display:flex;justify-content:space-between;width:100%;border:0;background:none;padding:9px 12px;border-radius:8px;cursor:pointer;font:inherit;font-size:13.5px;text-align:left}.db-t:hover{background:var(--bg)}.db-t.on{background:#0c1628;color:#fff}.db-t small{opacity:.65}" +
    ".db-wrap{overflow:auto;max-height:62vh}.db-wrap table{font-size:12.5px}.db-wrap td{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.db-wrap tr{cursor:pointer}";
  document.head.appendChild(css);
  var kb = function (n) { return n == null ? "" : n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : n > 1024 ? Math.round(n / 1024) + " KB" : n + " B"; };
  var dl = function (name, content, mime) { var a = document.createElement("a"); a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); };

  // ---- staff bypass cookie: signed-in staff keep seeing the site while maintenance is on
  var ck = false;
  function staffCookie(tok) { document.cookie = "wx_mt=" + tok + "; path=/; max-age=" + 60 * 60 * 24 * 30 + "; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : ""); }
  function ensureCookie() { if (ck || !W.S.user) return; ck = true; api("mt_get").then(function (r) { if (r.ok) { staffCookie(r.token); maintBadge(r.on); } else ck = false; }); }
  function maintBadge(on) { var b = $("#mt-badge"); if (!on) { if (b) b.remove(); return; } if (b) return; b = document.createElement("a"); b.id = "mt-badge"; b.href = "#/maintenance"; b.textContent = "Maintenance mode is ON"; b.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:60;background:#f79009;color:#fff;font:600 13px system-ui;padding:9px 14px;border-radius:99px;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.18)"; document.body.appendChild(b); }
  setInterval(ensureCookie, 2000); window.addEventListener("hashchange", ensureCookie);

  // ================================================================ Maintenance & error pages
  W.VIEWS.maintenance = function (el) {
    el.innerHTML = head("Maintenance & error pages", "Settings / System") + '<div id="mt"><div class="empty">Loading…</div></div>';
    function load() {
      api("mt_get").then(function (r) {
        if (!r.ok) return ($("#mt").innerHTML = '<div class="empty">' + esc(r.error) + "</div>");
        staffCookie(r.token); maintBadge(r.on);
        var NM = { "404.html": ["Page not found (404)", "When a link is wrong or a page was removed."], "500.html": ["Server error (500)", "If the server has a problem."], "503.html": ["Maintenance (503)", "Shown to visitors in maintenance mode."], "coming-soon.html": ["Coming soon", "Shown in coming-soon mode (before a launch)."] };
        $("#mt").innerHTML = '<div class="card mt-hero"><span class="mt-dot' + (r.on ? " on" : "") + '"></span><div><h3>' + (r.on ? (r.mode === "soon" ? "Coming-soon mode is ON" : "Maintenance mode is ON") : "Website is live") + "</h3><p>" +
          (r.on ? "Visitors see the " + (r.mode === "soon" ? "Coming soon" : "maintenance") + " page (HTTP 503, so Google waits and keeps your rankings). You and your team still see the normal site in this browser. On since " + esc(r.since || "") + " by " + esc(r.by || "") + "." : "Everyone can see the website.") +
          '</p></div><span class="sp"></span><label class="switch" style="transform:scale(1.25)"><input type="checkbox" id="mt-on"' + (r.on ? " checked" : "") + "><span></span></label></div>" +
          '<div class="card" style="margin-top:16px"><div class="card-b" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><b style="font-size:14px">Visitors see:</b><div class="seg" id="mt-mode"><button data-m="maintenance"' + (r.mode !== "soon" ? ' class="on"' : "") + '>Maintenance page</button><button data-m="soon"' + (r.mode === "soon" ? ' class="on"' : "") + '>Coming soon page</button></div>' +
          '<span class="muted" style="font-size:12.5px;flex:1">Admin, the builder, images and the API keep working. Staff need to sign in once in each browser to keep seeing the site.</span><button class="btn sm" id="mt-tok" title="Signs out the preview access of every other browser">Reset staff access</button></div></div>' +
          '<div class="card" style="margin-top:16px"><div class="card-b"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><b style="font-size:14px">Visitor page</b><span class="muted" style="font-size:12.5px">Countdown, headline and message on the page visitors see. Leave the date empty for no countdown.</span><span class="sp" style="flex:1"></span><a class="btn sm" href="/?asvisitor=1" target="_blank" rel="noopener">' + ic("eye") + 'View as visitor</a></div>' +
          '<div style="display:grid;grid-template-columns:220px 1fr;gap:12px"><label class="fl">Launch date &amp; time<input type="datetime-local" id="mt-until" value="' + esc((r.until || "").replace(" ", "T")) + '"></label><label class="fl">Headline<input id="mt-title" maxlength="120" placeholder="' + (r.mode === "soon" ? "Our new website is almost ready" : "We are improving our website") + '" value="' + esc(r.title || "") + '"></label></div>' +
          '<label class="fl" style="margin-top:10px;display:block">Message<textarea id="mt-text" rows="2" maxlength="400" placeholder="We are putting the final touches on a better Woodex Interior experience. Our design team is still available for projects, site visits and quotations.">' + esc(r.text || "") + '</textarea></label>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center"><button class="btn pri sm" id="mt-save">' + ic("save") + 'Save page</button><span class="muted" style="font-size:12px">Tip: this browser still shows the normal site because you are signed in. Use <b>View as visitor</b> (or a private window) to check.</span></div></div></div>' +
          '<h3 style="margin:24px 0 10px;font-size:15px">Error pages <small class="muted" style="font-weight:400">— normal pages: edit them in the builder; header and footer update with the rest of the site</small></h3><div class="mt-pages">' +
          r.pages.map(function (p) { var n = NM[p.path] || [p.path, ""]; return '<div class="mt-pg"><div class="fr"><iframe loading="lazy" tabindex="-1" src="' + p.url + '"></iframe></div><div class="b"><b>' + esc(n[0]) + '<br><small class="muted" style="font-weight:400">' + esc(n[1]) + '</small></b><a class="btn sm" href="' + p.url + '" target="_blank" rel="noopener">View</a><a class="btn sm pri" href="#/builder/' + encodeURIComponent(p.path) + '" data-ed="' + esc(p.path) + '">Edit</a></div></div>'; }).join("") + "</div>";
        W.fillIcons($("#mt"));
        var mode = r.mode;
        var set = function (on, extra) { api("mt_set", Object.assign({ on: on, mode: mode }, extra || {})).then(function (x) { if (!x.ok) { toast(x.error, true); return load(); } staffCookie(x.token); maintBadge(x.on); toast(x.on ? "Maintenance mode is ON — visitors see the " + (x.mode === "soon" ? "Coming soon" : "maintenance") + " page" : "Website is live again ✓"); load(); }); };
        $("#mt-on").onchange = function () { if (this.checked && !confirm("Turn on " + (mode === "soon" ? "coming-soon" : "maintenance") + " mode? Visitors will not see the website until you turn it off.")) { this.checked = false; return; } set(this.checked); };
        $$("#mt-mode button").forEach(function (b) { b.onclick = function () { mode = b.dataset.m; $$("#mt-mode button").forEach(function (x) { x.classList.toggle("on", x === b); }); set(r.on); }; });
        $("#mt-save").onclick = function () { set(r.on, { until: $("#mt-until").value, title: $("#mt-title").value, text: $("#mt-text").value }); };
        $("#mt-tok").onclick = function () { if (confirm("Reset staff access? Other browsers will need to open Admin again to see the site during maintenance.")) set(r.on, { newToken: true }); };
        $$("[data-ed]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); location.href = "/builder/#" + encodeURIComponent(a.dataset.ed); }; });
      });
    }
    load();
  };

  // ================================================================ File manager
  W.VIEWS.files = function (el) {
    var S = W.S.fm || (W.S.fm = { dir: "assets/uploads" }), cur = null;
    el.innerHTML = head("File manager", "Settings / System", '<button class="btn" id="fm-trash">' + ic("trash") + 'Trash</button><button class="btn" id="fm-zip">' + ic("download") + 'Download folder (.zip)</button><button class="btn" id="fm-mk">' + ic("folder") + 'New folder</button><button class="btn pri" id="fm-up">' + ic("upload") + "Upload</button>") +
      '<div class="fm-bar"><div class="fm-crumb" id="fm-cr"></div><input type="search" id="fm-q" placeholder="Filter this folder…" style="margin:0;max-width:240px"></div><div class="fm-drop" id="fm-drop">Drop files here to upload into this folder</div><div class="card" id="fm-l"><div class="empty">Loading…</div></div><input type="file" id="fm-f" multiple hidden>';
    W.fillIcons(el);
    var isImg = function (n) { return /\.(jpe?g|png|webp|gif|svg|avif|ico)$/i.test(n); };
    function load(dir) {
      api("fm_list", { dir: dir || S.dir }).then(function (r) {
        if (!r.ok) { if (dir !== "assets") return load("assets"); return ($("#fm-l").innerHTML = '<div class="empty">' + esc(r.error) + "</div>"); }
        cur = r; S.dir = r.dir; var parts = r.dir.split("/"), acc = "";
        $("#fm-cr").innerHTML = parts.map(function (p, i) { acc += (i ? "/" : "") + p; return (i ? "<span>/</span>" : "") + '<a href="#" data-go="' + esc(acc) + '">' + esc(p) + "</a>"; }).join("") + (r.ro ? ' <span class="badge" style="margin-left:6px">' + ic("lock") + " read-only</span>" : "");
        ["fm-up", "fm-mk"].forEach(function (id) { $("#" + id).disabled = r.ro; }); $("#fm-drop").style.display = r.ro ? "none" : "";
        $("#fm-trash").lastChild.textContent = "Trash" + (r.trash ? " (" + r.trash + ")" : "");
        draw(); W.fillIcons(el);
      });
    }
    function draw() {
      var q = ($("#fm-q").value || "").toLowerCase(), L = cur.items.filter(function (x) { return !q || x.name.toLowerCase().indexOf(q) >= 0; });
      $("#fm-l").innerHTML = (cur.dir !== "assets" ? '<div style="padding:10px 14px;border-bottom:1px solid var(--line)"><a href="#" data-go="' + esc(cur.dir.replace(/\/[^/]+$/, "")) + '">↑ Up one folder</a></div>' : "") +
        (L.length ? '<table class="tbl fm-tbl"><thead><tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>' + L.map(function (x) {
          var url = "/" + x.path;
          return '<tr><td><div class="fm-n" ' + (x.dir ? 'data-go="' + esc(x.path) + '"' : 'data-open="' + esc(url) + '"') + '><span class="fm-ic">' + (x.dir ? ic("folder") : isImg(x.name) ? '<img src="' + esc(url) + '" loading="lazy" alt="">' : "📄") + "</span><span><b>" + esc(x.name) + "</b>" + (x.dir ? '<br><small class="muted">' + x.count + " items</small>" : "") + (x.ro ? ' <small class="muted">· read-only</small>' : "") + "</span></div></td>" +
            "<td>" + kb(x.size) + '</td><td class="muted">' + esc(x.mtime) + '</td><td style="white-space:nowrap;text-align:right">' + (x.dir ? "" : '<button class="btn sm" data-cp="' + esc(url) + '" title="Copy link">Copy link</button> ') + (x.ro ? "" : '<button class="btn sm" data-rn="' + esc(x.path) + '">Rename</button> <button class="btn sm danger" data-rm="' + esc(x.path) + '">Delete</button>') + "</td></tr>";
        }).join("") + "</tbody></table>" : '<div class="empty">This folder is empty.</div>');
    }
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-go],[data-open],[data-cp],[data-rn],[data-rm]"); if (!t || !el.contains(t)) return; e.preventDefault();
      if (t.dataset.go) return load(t.dataset.go);
      if (t.dataset.open) return window.open(t.dataset.open, "_blank");
      if (t.dataset.cp) { navigator.clipboard && navigator.clipboard.writeText(location.origin + t.dataset.cp); return toast("Link copied"); }
      if (t.dataset.rn) { var old = t.dataset.rn.split("/").pop(), n = prompt("New name", old); if (!n || n === old) return; var go = function (force) { api("fm_rename", { path: t.dataset.rn, name: n, force: force }).then(function (r) { if (!r.ok && r.used) { if (confirm(r.error + "\n\n" + r.used.join("\n") + "\n\nRename anyway?")) go(true); return; } if (!r.ok) return toast(r.error, true); toast("Renamed ✓"); load(); }); }; go(false); }
      if (t.dataset.rm) { if (!confirm("Move " + t.dataset.rm.split("/").pop() + " to the trash? You can restore it for 30 days.")) return; var gd = function (force) { api("fm_delete", { path: t.dataset.rm, force: force }).then(function (r) { if (!r.ok && r.used) { if (confirm(r.error + "\n\n" + r.used.join("\n") + "\n\nThose pages will show a broken file. Delete anyway?")) gd(true); return; } if (!r.ok) return toast(r.error, true); toast("Moved to trash"); load(); }); }; gd(false); }
    });
    $("#fm-q").oninput = function () { cur && draw(); };
    function upload(files) {
      files = [].slice.call(files || []); if (!files.length) return; var done = 0, bad = 0;
      toast("Uploading " + files.length + " file(s)…");
      files.reduce(function (p, f) { return p.then(function () { return new Promise(function (res) { if (f.size > 25 * 1048576) { bad++; toast(f.name + ": files up to 25 MB", true); return res(); } var rd = new FileReader(); rd.onload = function () { api("fm_upload", { dir: S.dir, name: f.name, data: rd.result }).then(function (r) { r.ok ? done++ : (bad++, toast(f.name + ": " + r.error, true)); res(); }); }; rd.readAsDataURL(f); }); }); }, Promise.resolve()).then(function () { if (done) toast(done + " file(s) uploaded ✓"); load(); });
    }
    $("#fm-up").onclick = function () { $("#fm-f").click(); }; $("#fm-f").onchange = function () { upload(this.files); this.value = ""; };
    var dz = $("#fm-drop"); dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); }; dz.ondragleave = function () { dz.classList.remove("over"); }; dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); upload(e.dataTransfer.files); };
    $("#fm-mk").onclick = function () { var n = prompt("Folder name (letters, numbers and -)"); if (n) api("fm_mkdir", { dir: S.dir, name: n }).then(function (r) { if (!r.ok) return toast(r.error, true); load(); }); };
    $("#fm-zip").onclick = function () {
      var b = this; b.disabled = true; fetch("/api/admin.php", { method: "POST", headers: { "Content-Type": "application/json", "X-WX-ADM": W.S.token }, body: JSON.stringify({ action: "fm_zip", dir: S.dir }) }).then(function (x) {
        var ct = x.headers.get("Content-Type") || ""; if (/zip/.test(ct)) return x.blob().then(function (bl) { dl(S.dir.split("/").pop() + ".zip", bl); });
        return x.json().then(function (j) { if (!j.ok) throw new Error(j.error); var bin = atob(j.zip64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dl(j.name, new Blob([u8], { type: "application/zip" })); });
      }).catch(function (e) { toast(e.message || "Download failed", true); }).then(function () { b.disabled = false; });
    };
    $("#fm-trash").onclick = function () {
      api("fm_trash").then(function (r) {
        modal("<h2>Trash</h2><p class=\"muted\">Deleted files are kept for 30 days.</p>" + (r.items && r.items.length ? '<table class="tbl"><tbody>' + r.items.map(function (x) { return "<tr><td><b>" + esc(x.path.split("/").pop()) + '</b><br><small class="muted">' + esc(x.path) + "</small></td><td>" + kb(x.size) + '</td><td class="muted">' + esc(x.t) + " · " + esc(x.by) + '</td><td><button class="btn sm" data-rs="' + esc(x.id) + '">Restore</button></td></tr>'; }).join("") + "</tbody></table>" : '<div class="empty">The trash is empty.</div>') + '<div class="toolbar" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="tr-x">Close</button></div>');
        $("#tr-x").onclick = closeModal;
        $$("[data-rs]").forEach(function (b) { b.onclick = function () { api("fm_restore", { id: b.dataset.rs }).then(function (x) { if (!x.ok) return toast(x.error, true); closeModal(); toast("Restored to " + x.path); load(); }); }; });
      });
    };
    load();
  };

  // ================================================================ Database
  W.VIEWS.database = function (el) {
    var S = W.S.dbx || (W.S.dbx = { t: "", q: "", page: 1 }), T = [];
    el.innerHTML = head("Database", "Settings / System", '<button class="btn" id="db-sql">' + ic("download") + 'Export all (.sql)</button><button class="btn pri" id="db-bk">' + ic("hard-drive") + "Back up now</button>") +
      '<div class="banner" style="margin-bottom:14px">' + ic("shield") + " Safe mode: you can browse, search and export. Nothing can be edited or deleted here, and passwords and keys are hidden.</div>" +
      '<div class="db-grid"><div><div class="card"><div class="card-h"><h3>Tables</h3></div><div class="card-b" id="db-tl" style="padding:6px"></div></div><div class="card" style="margin-top:16px"><div class="card-h"><h3>Backups</h3><a class="btn sm" href="#/backups">All backups</a></div><div class="card-b" id="db-bl" style="font-size:13px"></div></div></div>' +
      '<div class="card"><div class="card-h"><h3 id="db-h">Choose a table</h3><div class="toolbar"><input type="search" id="db-q" placeholder="Search this table…" style="margin:0;width:220px" value="' + esc(S.q) + '"><button class="btn sm" id="db-csv">' + ic("download") + "CSV</button></div></div><div class=\"db-wrap\" id=\"db-rows\"><div class=\"empty\">Pick a table on the left.</div></div><div class=\"card-b\" id=\"db-pg\" style=\"display:flex;gap:8px;align-items:center;justify-content:flex-end\"></div></div></div>";
    W.fillIcons(el);
    var NICE = { wx_users: "Team users", wx_activity: "Activity log", wx_leads: "Enquiries", wx_lead_notes: "Enquiry notes", wx_clients: "Clients", wx_quotes: "Quotations", wx_invoices: "Invoices", wx_projects: "Projects", wx_templates: "Quote templates", wx_bookings: "Bookings", wx_chats: "Chats", wx_chat_msgs: "Chat messages", wx_settings: "Settings", wx_notify_log: "Client updates log", wx_throttle: "Spam limiter", wx_wa_seen: "WhatsApp seen ids" };
    function tables() {
      api("dbx_tables").then(function (r) {
        if (!r.ok) return ($("#db-tl").innerHTML = '<div class="empty">' + esc(r.error) + "</div>"); T = r.tables;
        $("#db-tl").innerHTML = T.map(function (t) { return '<button class="db-t' + (t.name === S.t ? " on" : "") + '" data-t="' + esc(t.name) + '"><span>' + esc(NICE[t.name] || t.name.replace(/^wx_/, "").replace(/_/g, " ")) + "<br><small>" + esc(t.name) + "</small></span><small>" + Number(t.rows).toLocaleString() + "</small></button>"; }).join("");
        $$("[data-t]", $("#db-tl")).forEach(function (b) { b.onclick = function () { S.t = b.dataset.t; S.page = 1; S.q = ""; $("#db-q").value = ""; $$(".db-t").forEach(function (x) { x.classList.toggle("on", x === b); }); rows(); }; });
        if (!S.t && T.length) S.t = (T.filter(function (t) { return t.name === "wx_leads"; })[0] || T[0]).name, tables(); else if (S.t) rows();
      });
    }
    function rows() {
      $("#db-h").textContent = NICE[S.t] || S.t; $("#db-h").setAttribute("data-t", S.t);
      api("dbx_browse", { table: S.t, q: S.q, page: S.page }).then(function (r) {
        if (!r.ok) return ($("#db-rows").innerHTML = '<div class="empty">' + esc(r.error) + "</div>");
        var cols = r.cols.map(function (c) { return c.name; });
        $("#db-rows").innerHTML = r.rows.length ? '<table class="tbl"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + r.rows.map(function (x) { return '<tr data-id="' + esc(x.id == null ? "" : x.id) + '">' + cols.map(function (c) { var v = x[c]; return '<td title="' + esc(v == null ? "" : String(v)) + '">' + (v == null ? '<span class="muted">—</span>' : esc(String(v))) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>" : '<div class="empty">' + (S.q ? "No rows match “" + esc(S.q) + "”." : "This table is empty.") + "</div>";
        $("#db-pg").innerHTML = '<span class="muted" style="font-size:13px">' + Number(r.total).toLocaleString() + " rows · page " + r.page + " of " + r.pages + '</span><button class="btn sm" id="pg-p"' + (r.page <= 1 ? " disabled" : "") + '>‹ Prev</button><button class="btn sm" id="pg-n"' + (r.page >= r.pages ? " disabled" : "") + ">Next ›</button>";
        $("#pg-p").onclick = function () { S.page--; rows(); }; $("#pg-n").onclick = function () { S.page++; rows(); };
        $$("#db-rows tr[data-id]").forEach(function (tr) { tr.onclick = function () { if (!tr.dataset.id) return; api("dbx_row", { table: S.t, id: tr.dataset.id }).then(function (x) { if (!x.ok) return toast(x.error, true); modal("<h2>" + esc(NICE[S.t] || S.t) + " #" + esc(tr.dataset.id) + '</h2><table class="tbl"><tbody>' + Object.keys(x.row).map(function (k) { var v = x.row[k]; return '<tr><td style="width:160px"><b>' + esc(k) + '</b></td><td style="white-space:pre-wrap;word-break:break-word;font-size:13px">' + (v == null ? '<span class="muted">—</span>' : esc(String(v))) + "</td></tr>"; }).join("") + '</tbody></table><div class="toolbar" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="rw-x">Close</button></div>', "wide"); $("#rw-x").onclick = closeModal; }); }; });
      });
    }
    var tq = null; $("#db-q").oninput = function () { clearTimeout(tq); var v = this.value; tq = setTimeout(function () { S.q = v.trim(); S.page = 1; rows(); }, 300); };
    var exp = function (table, fmt, b) { b.disabled = true; api("dbx_export", { table: table, fmt: fmt }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); dl(r.name, r.content, r.mime); toast("Downloaded " + r.name + " — " + r.note); }); };
    $("#db-csv").onclick = function () { if (!S.t) return toast("Pick a table first", true); exp(S.t, "csv", this); };
    $("#db-sql").onclick = function () { exp("*", "sql", this); };
    function backups() {
      api("backup_list").then(function (r) {
        if (!r.ok) return ($("#db-bl").innerHTML = '<span class="muted">' + esc(r.error) + "</span>");
        var L = (r.backups || []).slice(0, 5);
        $("#db-bl").innerHTML = (L.length ? L.map(function (b) { return '<div style="display:flex;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1"><b>' + esc(b.kind || "") + '</b> <span class="muted">' + esc(W.ago ? W.ago(b.at || "") : "") + "</span><br><small class=\"muted\">" + esc(b.name) + " · " + kb(b.size) + '</small></span><button class="btn sm" data-rsb="' + esc(b.name) + '">Restore</button></div>'; }).join("") : '<p class="muted">No backups yet.</p>') + '<p class="muted" style="font-size:12px;margin:8px 0 0">Restore puts back the whole website and database from that moment. A safety copy is made first.</p>';
        $$("[data-rsb]").forEach(function (b) { b.onclick = function () { if (!confirm("Restore the backup " + b.dataset.rsb + "?\n\nPages and data go back to that moment. A safety copy of today is made first.")) return; b.disabled = true; api("backup_restore", { name: b.dataset.rsb }).then(function (x) { b.disabled = false; if (!x.ok) return toast(x.error, true); toast("Restored ✓"); tables(); backups(); }); }; });
      });
    }
    $("#db-bk").onclick = function () { var b = this; b.disabled = true; api("backup_run", { kind: "full" }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); toast("Backup made: " + r.backup.name + " ✓"); backups(); }); };
    tables(); backups();
  };
  // re-render if the shell routed to one of these screens before this file loaded
  var h = (location.hash.split("/")[1] || "").split("?")[0];
  if (/^(maintenance|files|database)$/.test(h) && W.route) setTimeout(function () { if (document.querySelector("#view .soon-box")) W.route(); }, 0);
})();
