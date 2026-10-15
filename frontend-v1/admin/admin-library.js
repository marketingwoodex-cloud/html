/* Woodex Admin v2 — Phase A3: section library (categories, live previews, global sections, import/export, starter pack)
   + page sections outline (reorder / remove / save to library) */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, ago = W.ago, head = W.head;
  var CATS = ["Hero", "Services", "Features", "Projects", "Testimonials", "CTA", "FAQ", "Contact", "Content", "Footer", "Custom"];
  var STARTER = { cta: "CTA", split: "Content", "split-rev": "Content", cards: "Features", stats: "Features", process: "Services", gallery: "Projects", quotes: "Testimonials", faq: "FAQ", prose: "Content", logos: "Content", trust: "Features" };
  var CSSLINKS = '<link rel="stylesheet" href="/assets/site-p21.css"><link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css">';

  function previewDoc(html) {
    var p = window.WXCSS ? WXCSS.split(html) : { styles: {}, html: html };
    return "<!doctype html><html><head><meta charset='utf-8'><base href='/'>" + CSSLINKS + "<style>html,body{margin:0;background:#fff;overflow:hidden}body *{pointer-events:none}" + (window.WXCSS ? WXCSS.compile(p.styles) : "") + "</style></head><body><main id='main-content'>" + p.html + "</main></body></html>";
  }
  /** scaled live preview: iframe rendered at 1280px wide and scaled down to the card */
  function mountPreview(box, html) {
    var f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-same-origin"); f.setAttribute("loading", "lazy"); f.setAttribute("tabindex", "-1"); f.title = "Preview";
    f.style.cssText = "width:1280px;height:900px;border:0;transform-origin:0 0;position:absolute;left:0;top:0";
    var fit = function () { var s = box.clientWidth / 1280; f.style.transform = "scale(" + s + ")"; };
    f.srcdoc = previewDoc(html); box.appendChild(f); fit();
    f.onload = function () { try { var h = f.contentDocument.querySelector("main").scrollHeight; f.style.height = Math.max(300, Math.min(h, 1400)) + "px"; } catch (e) {} };
    new ResizeObserver(fit).observe(box);
  }
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !e.target.dataset.done) { e.target.dataset.done = 1; mountPreview(e.target, e.target._html); io.unobserve(e.target); } }); }, { rootMargin: "200px" });

  function download(name, text) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportBlocks(list, name) { download(name, JSON.stringify({ woodexLibrary: 1, exported: new Date().toISOString(), blocks: list.map(function (b) { return { name: b.name, kind: b.kind, cat: b.cat, tags: b.tags, global: b.global, html: b.html }; }) }, null, 1)); }

  // =========================================================== LIBRARY VIEW
  W.VIEWS.library = function (el) {
    var st = S.libState || (S.libState = { q: "", cat: "" });
    el.innerHTML = head("Section library", "Section library", '<button class="btn" id="lb-imp">' + ic("file-plus") + 'Import</button><button class="btn" id="lb-exp">Export all</button><button class="btn pri" id="lb-new">' + ic("plus") + "New section</button>") +
      '<div class="card" style="margin-bottom:20px"><div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><input type="search" id="lb-q" placeholder="Search name or tag…" value="' + esc(st.q) + '" style="margin:0;max-width:280px"><div class="toolbar" id="lb-cats"></div></div></div>' +
      '<div id="lb-grid" class="lib-grid"><div class="empty">Loading…</div></div><input type="file" id="lb-file" accept=".json" hidden>';
    var blocks = [], usage = {};
    var load = function () {
      return Promise.all([bapi("blocks_list"), bapi("blocks_usage")]).then(function (r) {
        if (!r[0].ok) { $("#lb-grid").innerHTML = '<div class="empty"><b style="color:#d92d20">' + esc(r[0].error || "Could not load the library") + '</b><p><button class="btn" id="lb-retry">Retry</button> <a class="btn" href="#/system">System check</a></p></div>'; $("#lb-retry").onclick = load; return; }
        blocks = r[0].blocks || []; usage = (r[1] && r[1].usage) || {}; draw();
      });
    };
    var draw = function () {
      var counts = {}; blocks.forEach(function (b) { counts[b.cat || "Custom"] = (counts[b.cat || "Custom"] || 0) + 1; });
      $("#lb-cats").innerHTML = ['<button class="btn sm' + (!st.cat ? " pri" : "") + '" data-c="">All <span class="pill" style="margin-left:4px">' + blocks.length + "</span></button>", '<button class="btn sm' + (st.cat === "__global" ? " pri" : "") + '" data-c="__global">🔗 Global</button>']
        .concat(CATS.filter(function (c) { return counts[c]; }).map(function (c) { return '<button class="btn sm' + (st.cat === c ? " pri" : "") + '" data-c="' + c + '">' + c + ' <span class="pill" style="margin-left:4px">' + counts[c] + "</span></button>"; })).join("");
      $$("#lb-cats [data-c]").forEach(function (b) { b.onclick = function () { st.cat = b.dataset.c; draw(); }; });
      var q = st.q.toLowerCase(), list = blocks.filter(function (b) { return (!st.cat || (st.cat === "__global" ? b.global : (b.cat || "Custom") === st.cat)) && (!q || (b.name + " " + (b.tags || []).join(" ")).toLowerCase().indexOf(q) >= 0); });
      var g = $("#lb-grid");
      if (!blocks.length) {
        g.innerHTML = '<div class="card soon-box" style="grid-column:1/-1"><div class="kpi-ic">' + ic("blocks") + '</div><h2>Your library is empty</h2><p>Save sections from the builder (💾 in the toolbar), import a library file, or start with the Woodex starter pack of ' + (window.WX_BLOCKS || []).length + ' ready-made sections.</p><button class="btn gold" id="lb-starter">' + ic("sparkles") + "Add Woodex starter pack</button></div>";
        $("#lb-starter").onclick = starter; return;
      }
      g.innerHTML = list.map(function (b) {
        var u = usage[b.id] || [];
        return '<div class="card lib-card"><div class="lib-prev" data-id="' + b.id + '"></div><div class="lib-meta"><div style="min-width:0"><b title="' + esc(b.name) + '">' + esc(b.name) + '</b><div class="lib-tags"><span class="badge gold">' + esc(b.cat || "Custom") + "</span>" + (b.global ? '<span class="badge info">🔗 global · ' + u.length + " page" + (u.length === 1 ? "" : "s") + "</span>" : "") + (b.kind === "element" ? '<span class="badge">element</span>' : "") + (b.tags || []).slice(0, 3).map(function (t) { return '<span class="badge">#' + esc(t) + "</span>"; }).join("") + "</div></div>" +
          '<div style="display:flex;gap:4px;flex:none"><button class="btn sm" data-ed="' + b.id + '">Edit</button><button class="btn sm" data-mo="' + b.id + '">⋯</button></div></div></div>';
      }).join("") || '<div class="empty" style="grid-column:1/-1">No sections match.</div>';
      $$(".lib-prev", g).forEach(function (p) { p._html = (blocks.find(function (b) { return b.id === p.dataset.id; }) || {}).html || ""; io.observe(p); p.onclick = function () { editor(blocks.find(function (b) { return b.id === p.dataset.id; })); }; });
      $$("[data-ed]", g).forEach(function (b) { b.onclick = function () { editor(blocks.find(function (x) { return x.id === b.dataset.ed; })); }; });
      $$("[data-mo]", g).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); more(b, blocks.find(function (x) { return x.id === b.dataset.mo; })); }; });
    };
    var more = function (btn, b) {
      var old = $("#lb-menu"); if (old) old.remove();
      var m = document.createElement("div"); m.className = "dd-menu"; m.id = "lb-menu"; m.style.cssText = "position:fixed;z-index:60";
      m.innerHTML = "<button data-a='dup'>" + ic("file-plus") + "Duplicate</button><button data-a='exp'>" + ic("external-link") + "Export</button>" + (b.global ? "<button data-a='sync'>" + ic("refresh-cw") + "Re-sync all pages</button>" : "") + "<button data-a='del' style='color:var(--bad)'>" + ic("x") + "Delete</button>";
      document.body.appendChild(m); var r = btn.getBoundingClientRect(); m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 10) + "px"; m.style.left = Math.max(10, r.right - 230) + "px";
      m.onclick = function (e) {
        var a = e.target.closest("[data-a]"); if (!a) return; m.remove();
        if (a.dataset.a === "dup") bapi("blocks_save", { name: (b.name + " copy").slice(0, 60), cat: b.cat, tags: b.tags, kind: b.kind, global: false, html: b.html }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Duplicated ✓"); load(); });
        if (a.dataset.a === "exp") exportBlocks([b], b.name.replace(/[^\w-]+/g, "-").toLowerCase() + ".json");
        if (a.dataset.a === "sync") sync(b, usage[b.id] || []);
        if (a.dataset.a === "del") {
          if (!confirm("Delete \"" + b.name + "\" from the library?")) return;
          bapi("blocks_delete", { id: b.id }).then(function (x) {
            if (!x.ok && x.used) { if (!confirm(x.error + ".\n\nDelete anyway? The copies on those pages stay as normal sections but stop syncing.")) return; return bapi("blocks_delete", { id: b.id, force: true }).then(function () { toast("Deleted"); load(); }); }
            if (!x.ok) return toast(x.error, true); toast("Deleted"); load();
          });
        }
      };
      setTimeout(function () { document.addEventListener("click", function h() { m.remove(); document.removeEventListener("click", h); }); });
    };
    var sync = function (b, used) {
      if (!confirm("Update \"" + b.name + "\" on " + used.length + " page(s)? Each page is backed up first.")) return;
      bapi("blocks_sync", { id: b.id }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Updated on " + x.changed + " page(s) ✓"); load(); });
    };
    var starter = function () {
      var list = (window.WX_BLOCKS || []).map(function (b) { return { name: b.name, kind: "section", cat: STARTER[b.id] || "Content", tags: ["starter"], html: b.html.trim() }; });
      bapi("blocks_import", { blocks: list }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(list.length + " starter sections added ✓"); load(); });
    };
    // ---------------- editor
    var editor = function (b) {
      var isNew = !b; b = b || { name: "", cat: "Custom", tags: [], global: false, kind: "section", html: '<section class="wx-section" style="padding:96px 0"><div class="container"><h2>New section</h2><p>Write your content here.</p></div></section>' };
      var used = (b.id && usage[b.id]) || [];
      modal("<h2>" + (isNew ? "New section" : "Edit section") + "</h2><div class='lib-ed'><div>" +
        "<label>Name<input id='le-n' value='" + esc(b.name) + "' maxlength='60'></label>" +
        "<div class='g2'><label>Category<select id='le-c'>" + CATS.map(function (c) { return "<option" + (c === (b.cat || "Custom") ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label><label>Tags<input id='le-t' value='" + esc((b.tags || []).join(", ")) + "' placeholder='dark, lahore'></label></div>" +
        "<label class='check'><input type='checkbox' id='le-g'" + (b.global ? " checked" : "") + "> Global section</label><p class='hint' style='margin:-8px 0 12px'>Global sections stay linked: edit once here, then update every page that uses it." + (b.global ? " Used on <b>" + used.length + "</b> page(s)" + (used.length ? ": " + used.slice(0, 6).map(function (p) { return "/" + esc(p.replace(/index\.html$/, "")); }).join(", ") + (used.length > 6 ? "…" : "") : "") + "." : "") + "</p>" +
        "<label>HTML <small>(advanced)</small><textarea id='le-h' spellcheck='false' style='font:12px/1.5 ui-monospace,Consolas,monospace;height:260px;white-space:pre'>" + esc(b.html) + "</textarea></label>" +
        "</div><div><small class='muted'>Live preview</small><div class='lib-prev lib-prev-lg' id='le-prev'></div></div></div>" +
        "<p class='err' id='le-err'></p><div class='modal-actions'><button class='btn' id='le-x'>Cancel</button>" + (b.global && used.length ? "<button class='btn' id='le-save'>Save only</button><button class='btn pri' id='le-sync'>Save & update " + used.length + " page" + (used.length === 1 ? "" : "s") + "</button>" : "<button class='btn pri' id='le-save'>Save</button>") + "</div>");
      $("#modal-card").style.maxWidth = "1100px";
      var prev = function () { var p = $("#le-prev"); p.innerHTML = ""; mountPreview(p, $("#le-h").value); };
      var t; $("#le-h").oninput = function () { clearTimeout(t); t = setTimeout(prev, 400); }; prev();
      var close = function () { closeModal(); $("#modal-card").style.maxWidth = ""; };
      $("#le-x").onclick = close;
      var save = function (then) {
        var g = $("#le-g").checked, html = $("#le-h").value.trim();
        if (g && window.WXCSS && (/^\s*<!--wx-styles:/.test(html) || !b.global)) html = WXCSS.globalize(html);
        bapi("blocks_save", { id: b.id, name: $("#le-n").value, cat: $("#le-c").value, tags: $("#le-t").value, global: g, kind: b.kind, html: html }).then(function (x) {
          if (!x.ok) return ($("#le-err").textContent = x.error);
          if (!then) { close(); toast("Saved ✓"); return load(); }
          bapi("blocks_sync", { id: b.id }).then(function (y) { close(); if (!y.ok) return toast(y.error, true); toast("Saved and updated on " + y.changed + " page(s) ✓"); load(); });
        });
      };
      $("#le-save").onclick = function () { save(false); };
      if ($("#le-sync")) $("#le-sync").onclick = function () { save(true); };
    };
    // ---------------- toolbar
    $("#lb-q").oninput = function () { st.q = this.value; draw(); };
    $("#lb-new").onclick = function () { editor(null); };
    $("#lb-exp").onclick = function () { if (!blocks.length) return toast("The library is empty", true); exportBlocks(blocks, "woodex-section-library.json"); };
    $("#lb-imp").onclick = function () { $("#lb-file").click(); };
    $("#lb-file").onchange = function () {
      var f = this.files[0]; this.value = ""; if (!f) return;
      f.text().then(function (txt) {
        var j; try { j = JSON.parse(txt); } catch (e) { return toast("That file is not a Woodex library file", true); }
        var list = Array.isArray(j) ? j : j.blocks; if (!Array.isArray(list) || !list.length) return toast("No sections found in the file", true);
        if (!confirm("Import " + list.length + " section(s) into the library?")) return;
        bapi("blocks_import", { blocks: list }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(list.length + " section(s) imported ✓"); load(); });
      });
    };
    load();
  };

  // =========================================================== PAGE SECTIONS OUTLINE (from Pages ⋯ menu)
  W.outline = function (p) {
    modal("<h2>Sections on this page</h2><p class='muted' style='margin:-10px 0 14px'>" + esc(p.title) + ": reorder, remove or save sections to the library.</p><div id='ol-list' class='empty'>Loading…</div><p class='err' id='ol-err'></p><div class='modal-actions'><a class='btn' href='#/builder/" + encodeURIComponent(p.path) + "' id='ol-open'>Open in builder</a><button class='btn' id='ol-x'>Cancel</button><button class='btn pri' id='ol-save' disabled>Save order</button></div>");
    $("#modal-card").style.maxWidth = "720px";
    var close = function () { closeModal(); $("#modal-card").style.maxWidth = ""; };
    $("#ol-x").onclick = close; $("#ol-open").onclick = close;
    bapi("load", { path: p.path }).then(function (r) {
      if (!r.ok) return ($("#ol-list").textContent = r.error);
      var src = r.html, mo = /<main\b[^>]*>/i.exec(src), mc = src.lastIndexOf("</main>");
      if (!mo || mc < 0) return ($("#ol-list").textContent = "This page has no main content area.");
      var t = document.createElement("template"); t.innerHTML = src.slice(mo.index + mo[0].length, mc);
      var items = Array.prototype.filter.call(t.content.children, function (n) { return n.tagName !== "SCRIPT" && n.tagName !== "STYLE"; });
      var others = Array.prototype.filter.call(t.content.children, function (n) { return items.indexOf(n) < 0; });
      var name = function (n) { var h = n.querySelector("h1,h2,h3"), l = n.getAttribute("data-wx-label"); return (l || (h ? h.textContent.trim().replace(/\s+/g, " ") : "") || n.className.split(" ")[0] || n.tagName.toLowerCase()).slice(0, 70); };
      var draw = function () {
        $("#ol-list").className = ""; $("#ol-list").innerHTML = "<div class='ol'>" + items.map(function (n, i) {
          return "<div class='ol-row'><span class='ol-n'>" + (i + 1) + "</span><div style='flex:1;min-width:0'><b>" + esc(name(n)) + "</b><small class='muted' style='display:block'>&lt;" + n.tagName.toLowerCase() + (n.className ? " ." + esc(String(n.className).split(" ").slice(0, 2).join(".")) : "") + "&gt;" + (n.hasAttribute("data-wx-global") ? " · 🔗 global" : "") + "</small></div>" +
            "<button class='btn sm' data-u='" + i + "'" + (i ? "" : " disabled") + ">↑</button><button class='btn sm' data-d='" + i + "'" + (i < items.length - 1 ? "" : " disabled") + ">↓</button><button class='btn sm' data-lib='" + i + "' title='Save to library'>" + ic("blocks") + "</button><button class='btn sm danger' data-rm='" + i + "' title='Remove'>✕</button></div>";
        }).join("") + "</div>";
        W.fillIcons($("#ol-list"));
        var mv = function (i, d) { items.splice(i + d, 0, items.splice(i, 1)[0]); $("#ol-save").disabled = false; draw(); };
        $$("[data-u]").forEach(function (b) { b.onclick = function () { mv(+b.dataset.u, -1); }; });
        $$("[data-d]").forEach(function (b) { b.onclick = function () { mv(+b.dataset.d, 1); }; });
        $$("[data-rm]").forEach(function (b) { b.onclick = function () { if (!confirm("Remove \"" + name(items[+b.dataset.rm]) + "\" from this page? (A backup is kept.)")) return; items.splice(+b.dataset.rm, 1); $("#ol-save").disabled = false; draw(); }; });
        $$("[data-lib]").forEach(function (b) { b.onclick = function () { var n = items[+b.dataset.lib], nm = prompt("Name for the library", name(n)); if (!nm) return; var c = n.cloneNode(true); c.removeAttribute("data-wx-global"); bapi("blocks_save", { name: nm, cat: "Content", kind: "section", html: c.outerHTML }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Saved to the library ✓"); }); }; });
      };
      draw();
      $("#ol-save").onclick = function () {
        var inner = "\n" + items.map(function (n) { return n.outerHTML; }).join("\n") + "\n" + others.map(function (n) { return n.outerHTML; }).join("\n");
        var html = src.slice(0, mo.index + mo[0].length) + inner + src.slice(mc);
        bapi("save", { path: p.path, html: html, mtime: r.mtime }).then(function (x) {
          if (!x.ok) return ($("#ol-err").textContent = x.error);
          close(); toast("Section order saved ✓ (backup kept)");
        });
      };
    });
  };

  // =========================================================== Phase 5: v26 templates + safe import with preview
  var CSSL = '<link rel="stylesheet" href="/assets/site-p21.css"><link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css"><style>html,body{margin:0;overflow:hidden;pointer-events:none}.t6-hero{min-height:720px}</style>';
  function thumb(html, h) { h = h || 170; var d = "<!doctype html><html><head><meta charset='utf-8'>" + CSSL + "</head><body><main>" + html + "</main></body></html>"; return "<div style='position:relative;height:" + h + "px;overflow:hidden;border-radius:10px;background:#f4efe7'><iframe loading='lazy' tabindex='-1' srcdoc=\"" + d.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + "\" style='position:absolute;inset:0 auto auto 0;width:1280px;height:" + h * 4 + "px;border:0;transform:scale(.25);transform-origin:0 0'></iframe></div>"; }
  function clean(html) { var t = document.createElement("template"), n = 0; t.innerHTML = html; t.content.querySelectorAll("script,object,embed,base,meta,link,iframe[srcdoc]").forEach(function (x) { x.remove(); n++; }); t.content.querySelectorAll("*").forEach(function (x) { Array.prototype.slice.call(x.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value))) { x.removeAttribute(a.name); n++; } }); }); return { html: t.innerHTML.trim(), n: n }; }
  function loadTemplates() { return window.WX_TEMPLATES ? Promise.resolve(window.WX_TEMPLATES) : new Promise(function (ok, no) { var sc = document.createElement("script"); sc.src = "/builder/templates-v26.js"; sc.onload = function () { ok(window.WX_TEMPLATES || []); }; sc.onerror = no; document.head.appendChild(sc); }); }
  function gallery(el) {
    loadTemplates().then(function (T) {
      var cats = ["All"].concat(T.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; })), cur = "All";
      modal("<div class='card-h'><h3>v26 templates (" + T.length + ")</h3></div><div style='padding:0 20px 20px'><div class='toolbar' style='flex-wrap:wrap;margin-bottom:12px'>" + cats.map(function (c) { return "<button class='btn sm' data-tc='" + esc(c) + "'>" + esc(c) + "</button>"; }).join("") + "</div><div id='tg-g' style='display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-height:66vh;overflow:auto'></div></div>");
      $("#modal-card").style.maxWidth = "1100px";
      var draw = function () {
        $$("[data-tc]").forEach(function (b) { b.classList.toggle("pri", b.dataset.tc === cur); });
        $("#tg-g").innerHTML = T.filter(function (t) { return cur === "All" || t.cat === cur; }).map(function (t) { return "<div style='border:1px solid var(--line);border-radius:12px;padding:8px'>" + thumb(t.html) + "<div style='display:flex;align-items:center;gap:6px;margin-top:8px'><b style='font-size:13px;flex:1'>" + esc(t.name) + "</b><button class='btn sm' data-ta='" + t.id + "'>Add to library</button></div></div>"; }).join("");
        $$("[data-ta]").forEach(function (b) { b.onclick = function () { var t = T.find(function (x) { return x.id === b.dataset.ta; }); b.disabled = true; bapi("blocks_save", { name: t.name, cat: t.cat, tags: "v26", kind: "section", html: t.html }).then(function (r) { if (!r.ok) { b.disabled = false; return toast(r.error, true); } b.textContent = "Added ✓"; }); }; });
      };
      $$("[data-tc]").forEach(function (b) { b.onclick = function () { cur = b.dataset.tc; draw(); }; });
      draw();
      var obs = new MutationObserver(function () { if ($("#modal").hidden) { obs.disconnect(); $("#modal-card").style.maxWidth = ""; W.VIEWS.library(el); } }); obs.observe($("#modal"), { attributes: true });
    }).catch(function () { toast("Could not load templates", true); });
  }
  function importPreview(el, txt) {
    var j; try { j = JSON.parse(txt); } catch (e) { return toast("That file is not a Woodex library file", true); }
    var n = 0, list = (Array.isArray(j) ? j : j.blocks || j.sections || []).filter(function (b) { return b && b.html; }).map(function (b) { var c = clean(String(b.html)); n += c.n; return { name: String(b.name || "Imported").slice(0, 60), kind: b.kind || "section", cat: b.cat || "Custom", tags: b.tags || [], global: !!b.global, html: c.html }; }).filter(function (b) { return b.html; });
    if (!list.length) return toast("No sections found in the file", true);
    modal("<div class='card-h'><h3>Import " + list.length + " section(s)</h3></div><div style='padding:0 20px 20px'><p class='muted'>" + (n ? "<b>" + n + " unsafe item(s) were removed.</b> " : "") + "Untick any you don’t want.</p><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-height:56vh;overflow:auto'>" +
      list.map(function (b, i) { return "<label style='border:1px solid var(--line);border-radius:12px;padding:8px;display:block'>" + thumb(b.html, 140) + "<span style='display:flex;gap:6px;margin-top:6px;font-size:13px'><input type='checkbox' data-ii='" + i + "' checked style='width:auto;margin:0'><b>" + esc(b.name) + "</b> <small class='muted'>" + esc(b.cat) + "</small></span></label>"; }).join("") +
      "</div><div class='toolbar' style='margin-top:14px'><button class='btn pri' id='ip-go'>Import selected</button></div></div>");
    $("#modal-card").style.maxWidth = "1000px";
    $("#ip-go").onclick = function () { var p = list.filter(function (b, i) { return $("[data-ii='" + i + "']").checked; }); if (!p.length) return; bapi("blocks_import", { blocks: p }).then(function (x) { if (!x.ok) return toast(x.error, true); closeModal(); $("#modal-card").style.maxWidth = ""; toast(p.length + " section(s) imported ✓"); W.VIEWS.library(el); }); };
  }
  var baseLib = W.VIEWS.library;
  W.VIEWS.library = function (el) {
    baseLib(el);
    var imp = $("#lb-imp"); if (!imp) return;
    var g = document.createElement("button"); g.className = "btn"; g.innerHTML = ic("blocks") + "v26 templates"; imp.parentNode.insertBefore(g, imp); g.onclick = function () { gallery(el); };
    $("#lb-file").accept = ".json"; $("#lb-file").onchange = function () { var f = this.files[0]; this.value = ""; if (f) f.text().then(function (t) { importPreview(el, t); }); };
  };
})();
