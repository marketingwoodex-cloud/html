/* Woodex Admin — P38 Section library: the 50 v26 sections shown directly (tab "v26 library"), with skins
   (Original / White / Cream / Navy), big preview, "Save to My sections" and "Use on a page" (opens the page builder and adds it). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, bapi = W.bapi, toast = W.toast, $ = W.$;
  var base = W.VIEWS.library, tab = "v26", cat = "", q = "", skin = "";
  var SK = [["", "Original"], ["white", "White"], ["cream", "Cream"], ["navy", "Navy"]];
  var CSS = '<link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/site-p21.css"><style>html,body{margin:0;overflow:hidden;pointer-events:none;background:#fff}.t6-hero{min-height:720px}</style>';
  function load() { return window.WX_TEMPLATES ? Promise.resolve(window.WX_TEMPLATES) : new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "/builder/templates-v26.js"; s.onload = function () { ok(window.WX_TEMPLATES || []); }; s.onerror = no; document.head.appendChild(s); }); }
  function isHero(html) { return /class="[^"]*\b(t6-hero|hero)\b/.test(html.slice(0, 200)); }
  function applySkin(html, s) {
    if (!s || isHero(html)) return html;
    var t = document.createElement("template"); t.innerHTML = html.trim(); var r = t.content.firstElementChild; if (!r) return html;
    r.classList.remove("wx-skin-white", "wx-skin-cream", "wx-skin-navy");
    if (r.classList.contains("t6")) { r.classList.remove("cream", "navy"); if (s !== "white") r.classList.add(s); } else r.classList.add("wx-skin-" + s);
    return t.innerHTML;
  }
  function frame(html, h, scale) { scale = scale || 0.32; return '<div class="l6-th" style="height:' + h + 'px"><iframe loading="lazy" tabindex="-1" style="width:' + (100 / scale) + '%;height:' + (h / scale) + 'px;transform:scale(' + scale + ')" srcdoc="' + esc("<!doctype html><html><head><meta charset='utf-8'>" + CSS + "</head><body><main>" + html + "</main></body></html>") + '"></iframe></div>'; }
  function tabs(nMine) { return '<div class="seg l6-tabs"><button data-l6="v26"' + (tab === "v26" ? ' class="on"' : "") + ">v26 library <b>50</b></button><button data-l6=\"mine\"" + (tab === "mine" ? ' class="on"' : "") + ">My sections" + (nMine != null ? " <b>" + nMine + "</b>" : "") + "</button></div>"; }

  W.VIEWS.library = function (el) {
    if (tab === "mine") {
      base(el);
      var ph = el.querySelector(".ph"); if (ph) { var d = document.createElement("div"); d.innerHTML = tabs(); ph.after(d.firstChild); bind(el); }
      return;
    }
    el.innerHTML = W.head("Section library", "Section library", '<a class="btn" href="#/builder">' + ic("square-pen") + "Open page builder</a>") + '<div class="content">' + tabs() + '<div id="l6" style="margin-top:14px"><div class="card" style="padding:24px">Loading the v26 sections…</div></div></div>';
    W.fillIcons && W.fillIcons(el); bind(el);
    load().then(function (T) {
      var cats = T.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
      function draw() {
        var list = T.filter(function (t) { return (!cat || t.cat === cat) && (!q || (t.name + " " + t.cat).toLowerCase().indexOf(q) > -1); });
        $("#l6").innerHTML = '<div class="card l6-bar"><div class="l6-row"><input type="search" id="l6-q" placeholder="Search 50 sections…" value="' + esc(q) + '"><div class="l6-sk"><small>Skin</small>' + SK.map(function (k) { return '<button data-sk="' + k[0] + '"' + (k[0] === skin ? ' class="on"' : "") + '><i class="sk-' + (k[0] || "o") + '"></i>' + k[1] + "</button>"; }).join("") + "</div></div>" +
          '<div class="l6-chips"><button data-c=""' + (cat ? "" : ' class="on"') + ">All <b>" + T.length + "</b></button>" + cats.map(function (c) { return '<button data-c="' + esc(c) + '"' + (cat === c ? ' class="on"' : "") + ">" + esc(c) + " <b>" + T.filter(function (t) { return t.cat === c; }).length + "</b></button>"; }).join("") + "</div></div>" +
          '<div class="l6-grid">' + list.map(function (t) {
            return '<div class="card l6-card"><button class="l6-pv" data-pv="' + t.id + '" title="Preview">' + frame(applySkin(t.html, skin), 190) + '</button><div class="l6-m"><div><b>' + esc(t.name) + '</b><small>' + esc(t.cat) + " · " + t.id + (skin && isHero(t.html) ? " · photo hero (skin n/a)" : "") + '</small></div><div class="l6-a"><button class="btn sm" data-save="' + t.id + '" title="Save a copy to My sections">' + ic("plus") + 'Save</button><button class="btn sm pri" data-use="' + t.id + '">Use on page</button></div></div></div>';
          }).join("") + "</div>" + (list.length ? "" : '<div class="card" style="padding:24px">No section matches.</div>');
        W.fillIcons && W.fillIcons($("#l6"));
        var s = $("#l6-q"); s.oninput = function () { var p = s.selectionStart; q = s.value.trim().toLowerCase(); draw(); var n = $("#l6-q"); n.focus(); n.setSelectionRange(p, p); };
      }
      draw();
      var byId = function (id) { return T.filter(function (t) { return t.id === id; })[0]; };
      $("#l6").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
        if (d.sk != null) { skin = d.sk; draw(); }
        else if (d.c != null) { cat = d.c; draw(); }
        else if (d.save) { var t = byId(d.save); b.disabled = true; bapi("blocks_save", { name: t.name + (skin ? " (" + skin + ")" : ""), cat: t.cat, tags: "v26" + (skin ? "," + skin : ""), kind: "section", html: applySkin(t.html, skin) }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); toast("Saved to My sections ✓"); }); }
        else if (d.use) use(byId(d.use));
        else if (d.pv) preview(byId(d.pv));
      };
    }).catch(function () { $("#l6").innerHTML = '<div class="card" style="padding:24px">Could not load /builder/templates-v26.js</div>'; });
  };
  function bind(el) { var t = el.querySelector(".l6-tabs"); if (t) t.onclick = function (e) { var b = e.target.closest("[data-l6]"); if (b && b.dataset.l6 !== tab) { tab = b.dataset.l6; W.VIEWS.library(el); } }; }
  function preview(t) {
    var s0 = skin;
    function body() { return '<div class="l6-pvh"><div><h2 style="margin:0">' + esc(t.name) + '</h2><small class="muted">' + esc(t.cat) + '</small></div><div class="l6-sk">' + SK.map(function (k) { return '<button data-psk="' + k[0] + '"' + (k[0] === s0 ? ' class="on"' : "") + '><i class="sk-' + (k[0] || "o") + '"></i>' + k[1] + "</button>"; }).join("") + '</div></div><div class="l6-big">' + frame(applySkin(t.html, s0), 520, 0.62) + '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" id="l6-x">Close</button><button class="btn pri" id="l6-u">Use on a page</button></div>'; }
    W.modal('<div id="l6-pm">' + body() + "</div>"); var mc = $("#modal-card"); if (mc) mc.style.maxWidth = "1100px";
    var wire = function () { $("#l6-x").onclick = function () { W.closeModal(); if (mc) mc.style.maxWidth = ""; }; $("#l6-u").onclick = function () { skin = s0; if (mc) mc.style.maxWidth = ""; use(t); }; $("#l6-pm").onclick = function (e) { var b = e.target.closest("[data-psk]"); if (b) { s0 = b.dataset.psk; $("#l6-pm").innerHTML = body(); wire(); } }; };
    wire();
  }
  function use(t) {
    var pages = (W.S.pages || []).filter(function (p) { return !/^(404|500|503)\.html$/.test(p.path); });
    W.modal('<h2>Add “' + esc(t.name) + '” to a page</h2><p class="muted">The page builder opens with the section added at the end' + (skin ? " in the <b>" + skin + "</b> skin" : "") + '. Drag it into place, then Save.</p><label style="display:block;font-weight:600;font-size:13px">Page<input id="l6-pg" list="l6-pl" placeholder="Type to search, e.g. about" style="display:block;width:100%;margin-top:4px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;box-sizing:border-box"></label><datalist id="l6-pl">' +
      pages.map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.title || "") + "</option>"; }).join("") + '</datalist><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="l6-c">Cancel</button><button class="btn pri" id="l6-go">Open builder</button></div>');
    $("#l6-c").onclick = W.closeModal;
    $("#l6-go").onclick = function () {
      var v = $("#l6-pg").value.trim(), p = pages.filter(function (x) { return x.path === v || x.url === v || (x.title || "").toLowerCase() === v.toLowerCase(); })[0];
      if (!p) return toast("Pick a page from the list", true);
      sessionStorage.setItem("wxInsert", JSON.stringify({ path: p.path, html: t.html, skin: skin, name: t.name }));
      W.closeModal(); location.hash = "#/builder/" + encodeURIComponent(p.path);
    };
  }
  var st = document.createElement("style");
  st.textContent = ".l6-tabs{margin-top:4px}.l6-tabs b,.l6-chips b{opacity:.55;margin-left:3px;font-weight:600}.l6-bar{padding:14px 16px;margin-bottom:16px}.l6-row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}#l6-q{padding:8px 12px;border:1px solid var(--line,#e4e7ec);border-radius:10px;min-width:260px}" +
    ".l6-sk{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.l6-sk small{font-weight:600;color:#667085;margin-right:4px}.l6-sk button,.l6-chips button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#e4e7ec);background:#fff;border-radius:99px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer}.l6-sk button.on{box-shadow:0 0 0 1.5px #0c1628;border-color:#0c1628}.l6-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.l6-chips button.on{background:#0c1628;color:#fff;border-color:#0c1628}" +
    ".l6-sk i{width:12px;height:12px;border-radius:50%;border:1px solid #cbd5e1}.sk-o{background:linear-gradient(135deg,#fff 50%,#0c1628 50%)}.sk-white{background:#fff}.sk-cream{background:#f4efe7}.sk-navy{background:#0c1628}" +
    ".l6-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}.l6-card{padding:10px;overflow:hidden}.l6-pv{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in}.l6-th{position:relative;overflow:hidden;border-radius:10px;background:#f4efe7;border:1px solid var(--line,#e4e7ec)}.l6-th iframe{border:0;transform-origin:0 0;pointer-events:none}" +
    ".l6-m{display:flex;flex-direction:column;gap:8px;margin-top:10px}.l6-a .btn.pri{flex:1;justify-content:center}.l6-m b{display:block;font-size:13.5px}.l6-m small{color:#667085;font-size:11.5px}.l6-a{display:flex;gap:6px}.l6-pvh{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px}";
  document.head.appendChild(st);
})();
