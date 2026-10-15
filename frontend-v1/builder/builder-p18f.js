/* Woodex Builder — P18 F: left panel tabs  Sections | UI kit | Templates | Images.
 *  Sections  : 50 complete v26 sections by category chips + 12 basic blocks, one search box.
 *  UI kit    : 40 UI-kit blocks by category.
 *  Templates : starter page layouts (one click = full page), page template export / import (.json), my saved sections.
 *  Images    : media library grid — click replaces the selected image, or adds a new image block; free photos via the media dialog. */
(function () {
  "use strict";
  var X = window.__wx5; if (!X || !X.api) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }, esc = X.esc, S = X.S;
  var lp = $('.lp[data-lp="sections"]'); if (!lp) return;
  var T = window.WX_TEMPLATES || [], V26 = T.filter(function (t) { return !/^UI kit/.test(t.cat); }), UK = T.filter(function (t) { return /^UI kit/.test(t.cat); });

  var css = document.createElement("style");
  css.textContent = ".fk-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:#eef0f3;border-radius:9px;padding:3px;margin:0 0 12px}.fk-tabs button{border:0;background:none;border-radius:7px;padding:7px 2px;font:600 11.5px system-ui;color:#555;cursor:pointer}.fk-tabs button.on{background:#fff;color:#0c1628;box-shadow:0 1px 3px rgba(0,0,0,.12)}" +
    ".fk-pane{display:none}.fk-pane.on{display:block}.fk-chips{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 10px}.fk-chips button{border:1px solid #e3e5ea;background:#fff;border-radius:99px;padding:4px 9px;font:500 11.5px system-ui;cursor:pointer}.fk-chips button.on{background:#0c1628;border-color:#0c1628;color:#fff}" +
    ".fk-cat{font:700 10.5px system-ui;text-transform:uppercase;letter-spacing:.07em;color:#8a8f98;margin:12px 0 6px}.fk-lay{display:block;width:100%;text-align:left;border:1px solid #e3e5ea;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer}.fk-lay:hover{border-color:#b8956a}.fk-lay b{display:block;font-size:13px}.fk-lay small{color:#8a8f98;font-size:11.5px}" +
    ".fk-img{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fk-img button{border:1px solid #e3e5ea;border-radius:8px;padding:0;overflow:hidden;background:#f4efe7;cursor:pointer;aspect-ratio:4/3}.fk-img button:hover{outline:2px solid #b8956a}.fk-img img{width:100%;height:100%;object-fit:cover;display:block}.fk-row{display:flex;gap:6px;margin-bottom:10px}.fk-row .btn{flex:1}";
  document.head.appendChild(css);

  // ---- build the four panes from the existing panel content (nothing is removed — elements are moved)
  var h2 = lp.querySelector("h2"), hint = lp.querySelector("p.hint");
  var tabs = document.createElement("div"); tabs.className = "fk-tabs"; tabs.innerHTML = '<button data-fk="sec" class="on">Sections</button><button data-fk="uk">UI kit</button><button data-fk="tpl">Templates</button><button data-fk="img">Images</button>';
  (hint || h2).after(tabs);
  var P = {}; ["sec", "uk", "tpl", "img"].forEach(function (k) { var d = document.createElement("div"); d.className = "fk-pane" + (k === "sec" ? " on" : ""); d.dataset.pane = k; lp.appendChild(d); P[k] = d; });
  var oldQ = lp.querySelector('input[data-q="lib-sections"]'), libS = $("#lib-sections"), v26h = $("#v26-n") && $("#v26-n").parentElement, v26sel = $("#v26-cat"), v26box = $("#lib-v26"), mineH = $("#lib-mine") && $("#lib-mine").previousElementSibling, mine = $("#lib-mine");
  [v26h, v26sel, v26box].forEach(function (n) { if (n) n.hidden = true; });
  if (oldQ) oldQ.remove();

  function buttons(list, box) { // same click / drag behaviour as the core library
    box.innerHTML = list.map(function (b) { return '<button draggable="true" data-id="' + esc(b.id) + '" title="' + esc(b.name) + '"><span>' + (b.icon || "▦") + "</span>" + esc(b.name) + "</button>"; }).join("") || '<p class="hint">Nothing matches.</p>';
    $$("button", box).forEach(function (btn) {
      var b = list.filter(function (x) { return x.id === btn.dataset.id; })[0];
      btn.onclick = function () { if (S.doc) X.insertSection(b.html); };
      btn.ondragstart = function (e) { S.drag = { kind: "section", html: b.html }; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", "wx-block"); };
      btn.ondragend = function () { S.drag = null; var d = $("#ov-drop"); if (d) d.style.display = "none"; };
    });
  }
  function catPane(pane, list, extra, label) {
    var cats = list.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; }), cur = "", q = "";
    pane.innerHTML = '<input type="search" class="lib-q" placeholder="Search ' + label + '…"><div class="fk-chips"><button class="on" data-c="">All ' + (list.length + (extra ? extra.length : 0)) + "</button>" + cats.map(function (c) { return '<button data-c="' + esc(c) + '">' + esc(c.replace(/^UI kit · /, "")) + "</button>"; }).join("") + (extra ? '<button data-c="__basic">Basic</button>' : "") + '</div><div class="fk-list"></div>';
    var box = $(".fk-list", pane);
    function draw() {
      var m = function (t) { return !q || (t.name + " " + t.cat).toLowerCase().indexOf(q) >= 0; }, html = "";
      box.innerHTML = ""; var groups = (cur === "__basic" ? [] : cats.filter(function (c) { return !cur || c === cur; }));
      groups.forEach(function (c) { var L = list.filter(function (t) { return t.cat === c && m(t); }); if (!L.length) return; var h = document.createElement("div"); h.className = "fk-cat"; h.textContent = c.replace(/^UI kit · /, "") + " · " + L.length; var g = document.createElement("div"); g.className = "lib"; box.appendChild(h); box.appendChild(g); buttons(L, g); });
      if (extra && (!cur || cur === "__basic")) { var L = extra.filter(m); if (L.length) { var h = document.createElement("div"); h.className = "fk-cat"; h.textContent = "Basic blocks · " + L.length; box.appendChild(h); box.appendChild(libS); buttons(L, libS); } }
      if (!box.children.length) box.innerHTML = '<p class="hint">Nothing matches “' + esc(q) + "”.</p>";
    }
    $(".lib-q", pane).oninput = function () { q = this.value.trim().toLowerCase(); draw(); };
    $$(".fk-chips button", pane).forEach(function (b) { b.onclick = function () { cur = b.dataset.c; $$(".fk-chips button", pane).forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); }; });
    draw();
  }
  catPane(P.sec, V26, window.WX_BLOCKS || [], "sections");
  catPane(P.uk, UK, null, "UI kit");

  // ---- Templates: starter layouts + page export / import + my sections
  var byId = function (id) { return T.filter(function (t) { return t.id === id; })[0]; };
  var LAYOUTS = [
    { n: "Service page", d: "Hero · services · process · projects · FAQ · CTA", ids: ["v26-05", "v26-14", "v26-21", "v26-15", "v26-26", "v26-36"] },
    { n: "City / area page", d: "City hero · services · stats · testimonials · FAQ · contact", ids: ["v26-08", "v26-09", "v26-41", "v26-31", "v26-28", "v26-39"] },
    { n: "Landing page (ads)", d: "Hero + form · features · pricing · reviews · WhatsApp CTA", ids: ["uk-hero-form", "uk-feat-grid", "v26-47", "uk-testi-grid", "uk-cta-wa"] },
    { n: "About page", d: "Hero · story · values · team · stats · CTA", ids: ["v26-06", "v26-43", "v26-44", "v26-48", "v26-42", "v26-38"] },
    { n: "Project case study", d: "Hero · case study · gallery · quote · CTA", ids: ["v26-03", "v26-20", "v26-18", "v26-32", "v26-37"] },
    { n: "Pricing page", d: "Page header · plans · comparison · FAQ · CTA", ids: ["uk-page-head", "v26-45", "uk-price-table", "v26-30", "v26-36"] }
  ];
  function mainEl() { return S.doc && S.doc.querySelector("main"); }
  function applyHtmlList(list, mode) {
    var m = mainEl(); if (!m) return X.toast("Open a page first", true);
    if (mode === "replace") $$(":scope > *", m).forEach(function (n) { if (!n.classList.contains("wx-trust")) n.remove(); });
    var last = null; list.forEach(function (h) { var node = X.build(h); var trust = m.querySelector(":scope > .wx-trust"); trust ? trust.before(node) : m.appendChild(node); last = node; X.afterInsert(node, "section"); });
    X.changed(); if (last && last.scrollIntoView) last.scrollIntoView({ block: "center" });
    X.toast((mode === "replace" ? "Page replaced with " : "Added ") + list.length + " sections — review, then Save");
  }
  function askMode(n, cb) {
    var has = mainEl() && mainEl().children.length > 0;
    if (!has) return cb("append");
    X.modal("<h2>Use this layout?</h2><p class='hint'>" + n + " sections will be added. Your page already has content.</p><div class='fk-row' style='margin-top:14px'><button class='btn' id='fk-ap'>Add to the end</button><button class='btn btn-pri' id='fk-rp'>Replace page content</button></div><p class='hint'>Replace keeps the header and footer. Undo (Ctrl+Z) or close without saving to go back.</p>");
    $("#fk-ap").onclick = function () { X.closeModal(); cb("append"); }; $("#fk-rp").onclick = function () { X.closeModal(); cb("replace"); };
  }
  function exportPage() {
    var m = mainEl(); if (!m) return X.toast("Open a page first", true);
    var secs = $$(":scope > *", m).filter(function (n) { return n.nodeType === 1 && n.tagName !== "SCRIPT"; }).map(function (n) { return { name: (n.getAttribute("data-wx-label") || (n.querySelector("h1,h2,h3") || {}).textContent || n.className || "Section").trim().slice(0, 60), kind: "section", cat: X.guessCat(n.outerHTML), tags: [], html: X.packStyles(n) + X.cleanOuter(n) }; });
    var title = (S.doc.title || "page").split("|")[0].trim(), path = S.path || (S.doc.location && S.doc.location.pathname) || "";
    X.download("woodex-template-" + title.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40) + ".json", JSON.stringify({ woodexPageTemplate: 1, woodexLibrary: 1, name: title, from: path, exported: new Date().toISOString(), blocks: secs }, null, 1), "application/json");
    X.toast("Page exported as a template (" + secs.length + " sections) ✓");
  }
  function importPage() {
    var f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
    f.onchange = function () {
      var file = f.files[0]; if (!file) return; file.text().then(function (txt) {
        var j; try { j = JSON.parse(txt); } catch (e) { return X.toast("That file is not a valid template (.json)", true); }
        var L = (j.blocks || []).filter(function (b) { return b && b.html && b.kind !== "element"; }).map(function (b) { return X.sanitize(b.html).html; }).filter(Boolean);
        if (!L.length) return X.toast("No sections found in this file", true);
        askMode(L.length, function (mode) { applyHtmlList(L, mode); });
      });
    };
    f.click();
  }
  P.tpl.innerHTML = '<div class="fk-cat" style="margin-top:0">Page template file</div><div class="fk-row"><button class="btn" id="fk-exp" title="Download this page as a reusable template">⬇ Export page</button><button class="btn" id="fk-imp" title="Load a template file into this page">⬆ Import page</button></div><p class="hint" style="margin-top:-4px">Export saves every section of this page (with its styles) into one .json file. Import it into any page — or another Woodex site.</p>' +
    '<div class="fk-cat">Starter page layouts</div>' + LAYOUTS.map(function (l, i) { return '<button class="fk-lay" data-l="' + i + '"><b>' + esc(l.n) + "</b><small>" + esc(l.d) + "</small></button>"; }).join("") + '<div class="fk-mine"></div>';
  if (mineH) { $(".fk-mine", P.tpl).appendChild(mineH); $(".fk-mine", P.tpl).appendChild(mine); }
  // anything else still loose in the panel (Browse-all button, My sections tools) goes to the Templates tab, in order
  var fm = $(".fk-mine", P.tpl), keep = [h2, hint, tabs].concat(Object.keys(P).map(function (k) { return P[k]; }));
  Array.prototype.slice.call(lp.children).forEach(function (n) { if (keep.indexOf(n) < 0 && !n.hidden) fm.appendChild(n); });
  if (mine) fm.appendChild(mine);
  $("#fk-exp").onclick = exportPage; $("#fk-imp").onclick = importPage;
  $$(".fk-lay", P.tpl).forEach(function (b) { b.onclick = function () { var l = LAYOUTS[+b.dataset.l], L = l.ids.map(byId).filter(Boolean).map(function (t) { return t.html; }); askMode(L.length, function (mode) { applyHtmlList(L, mode); }); }; });

  // ---- Images
  var IMGS = null;
  P.img.innerHTML = '<p class="hint" style="margin-top:0">Click a photo: it <b>replaces the selected image</b>, or is added as a new image if no image is selected.</p><div class="fk-row"><button class="btn" id="fk-more">⬆ Upload / free photos</button></div><input type="search" class="lib-q" id="fk-iq" placeholder="Search images…"><div class="fk-img" id="fk-ig"><p class="hint">Loading…</p></div>';
  function useImg(u, w, h) {
    if (!S.doc) return X.toast("Open a page first", true);
    var el = S.sel;
    if (el && el.tagName === "IMG") { X.setImg(el, u, w, h); X.changed(); return X.toast("Image replaced ✓"); }
    var img = '<figure class="wx-figure"><img src="' + esc(u) + '" alt="Describe this image" loading="lazy"' + (w ? ' width="' + w + '" height="' + h + '"' : "") + "></figure>";
    X.insertElement(img); X.toast("Image added — write its alt text in Content");
  }
  function drawImgs() {
    var q = ($("#fk-iq").value || "").toLowerCase(), g = $("#fk-ig");
    var L = (IMGS || []).filter(function (u) { return !/\.w\d+\.webp$|-(480|960)\.webp$/.test(u) && (!q || u.toLowerCase().indexOf(q) >= 0); });
    g.innerHTML = L.slice(0, 120).map(function (u) { return '<button data-u="' + esc(u) + '" title="' + esc(u.split("/").pop()) + '"><img src="' + esc(u) + '" loading="lazy" alt=""></button>'; }).join("") || '<p class="hint">No images match.</p>';
    $$("button", g).forEach(function (b) { b.onclick = function () { var im = b.querySelector("img"); useImg(b.dataset.u, im.naturalWidth, im.naturalHeight); }; });
  }
  function loadImgs() { X.api("media").then(function (r) { if (!r.ok) { $("#fk-ig").innerHTML = '<p class="hint">' + esc(r.error || "Sign in to see images") + "</p>"; return; } IMGS = r.media || []; drawImgs(); }); }
  $("#fk-iq").oninput = drawImgs;
  $("#fk-more").onclick = function () { X.media(function (u, w, h) { useImg(u, w, h); IMGS = null; loadImgs(); }); };

  $$(".fk-tabs button").forEach(function (b) {
    b.onclick = function () { $$(".fk-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); $$(".fk-pane", lp).forEach(function (p) { p.classList.toggle("on", p.dataset.pane === b.dataset.fk); }); if (b.dataset.fk === "img" && !IMGS) loadImgs(); };
  });
  h2.textContent = "Add content";
  if (hint) hint.textContent = "Drag onto the page, or click to add after the selected section.";
  window.__wx18f = { layouts: LAYOUTS, exportPage: exportPage };
})();
