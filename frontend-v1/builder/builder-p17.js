/* Woodex Builder — P17 C1 + C2
   C1  Section import: file / paste (JSON, HTML) + "Pick from a page" (any page of this site or a public https link: click the sections to keep).
       Every found section gets a review card: preview, name, category, tags → insert into the page or save to My sections.
   C2  New-section designer: background, spacing, width, layout (1–4 columns / text + image), heading block, and parts from the elements library per column.
       Saved straight to My sections (shows immediately) with category + tags.
   Also: category filter + tag search for My sections. */
(function () {
  "use strict";
  var X = window.__wx5; if (!X || !X.api) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = X.esc, api = X.api, toast = X.toast;
  var CATS = X.cats || ["Custom"];
  var mb = function () { return $("#modal-body"); };

  // ------------------------------------------------------------------ shared review step
  function review(list, note) {
    X.modal("<h2>Review sections <small class='hint'>(" + list.length + " found)</small></h2>" + (note ? "<p class='hint'>" + note + "</p>" : "") +
      "<div class='p17-bulk'><label><input type='checkbox' id='rv-all' checked> Select all</label><span>Set category for selected<select id='rv-bc'><option value=''>—</option>" + CATS.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select></span><span>Add tag<input id='rv-bt' placeholder='e.g. imported, dark'></span></div>" +
      "<div class='p17-rv'>" + list.map(function (b, i) {
        return "<div class='p17-card'><label class='p17-chk'><input type='checkbox' data-ii='" + i + "' checked></label>" + X.thumb(b.html, 170) +
          "<div class='p17-meta'><input data-i='" + i + "' data-k='name' value='" + esc(b.name) + "' aria-label='Name'><select data-i='" + i + "' data-k='cat' aria-label='Category'>" + CATS.map(function (c) { return "<option" + (c === b.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" +
          "<input data-i='" + i + "' data-k='tags' value='" + esc((b.tags || []).join(", ")) + "' placeholder='tags, comma separated' aria-label='Tags'></div></div>";
      }).join("") + "</div>" +
      "<div class='row' style='margin-top:12px;gap:8px'><button class='btn btn-pri' id='rv-lib'>💾 Save to My sections</button><button class='btn' id='rv-ins'>Insert into page</button><span class='hint' id='rv-n'></span></div>");
    X.wide(mb(), "min(1040px,92vw)");
    var count = function () { var n = picked().length; $("#rv-n").textContent = n + " selected"; };
    var picked = function () { return list.filter(function (b, i) { var c = $("[data-ii='" + i + "']"); return c && c.checked; }); };
    $$(".p17-meta [data-k]").forEach(function (f) { f.oninput = f.onchange = function () { var b = list[+f.dataset.i]; b[f.dataset.k] = f.dataset.k === "tags" ? f.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : f.value; }; });
    $$("[data-ii]").forEach(function (c) { c.onchange = count; });
    $("#rv-all").onchange = function () { var on = this.checked; $$("[data-ii]").forEach(function (c) { c.checked = on; }); count(); };
    $("#rv-bc").onchange = function () { var v = this.value; if (!v) return; list.forEach(function (b, i) { if ($("[data-ii='" + i + "']").checked) { b.cat = v; $("select[data-i='" + i + "']").value = v; } }); this.value = ""; };
    $("#rv-bt").onchange = function () { var t = this.value.trim().toLowerCase(); if (!t) return; list.forEach(function (b, i) { if ($("[data-ii='" + i + "']").checked) { b.tags = (b.tags || []).concat(t.split(",").map(function (x) { return x.trim(); }).filter(Boolean)).filter(function (x, k, a) { return a.indexOf(x) === k; }); $("input[data-i='" + i + "'][data-k='tags']").value = b.tags.join(", "); } }); this.value = ""; };
    $("#rv-ins").onclick = function () { var p = picked(); if (!p.length) return toast("Tick at least one section", true); if (!X.S.doc) return toast("Open a page first", true); var after = X.S.sel; X.closeModal(); p.slice().reverse().forEach(function (b) { X.insertSection(b.html, after); }); toast(p.length + " section(s) inserted ✓ — save the page to keep them"); };
    $("#rv-lib").onclick = function () {
      var p = picked(); if (!p.length) return toast("Tick at least one section", true);
      api("blocks_import", { blocks: p.map(function (b) { return { name: String(b.name || "Imported section").slice(0, 60), cat: b.cat, tags: b.tags || [], kind: b.kind || "section", html: b.html }; }) }).then(function (r) {
        if (!r.ok) return toast(r.error, true); X.closeModal(); X.renderMine(); openMine(); toast(p.length + " saved to My sections ✓");
      });
    };
    count();
  }
  function tagsOf(b) { return Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean); }
  function openMine() { var l = $("#lib-mine"); if (l) l.scrollIntoView({ block: "nearest" }); }

  // ------------------------------------------------------------------ C1 import (file / paste) — replaces the old dialog, same parsing + per-section category and tags
  function parseText(txt) {
    var list = [], removed = 0;
    if (/^[\[{]/.test(txt)) {
      var j; try { j = JSON.parse(txt); } catch (e) { toast("That JSON file could not be read", true); return null; }
      (Array.isArray(j) ? j : j.blocks || j.sections || []).forEach(function (b) { if (b && b.html) { var c = X.sanitize(String(b.html)); removed += c.removed; if (c.html) list.push({ name: String(b.name || "Imported section").slice(0, 60), cat: CATS.indexOf(b.cat) >= 0 ? b.cat : X.guessCat(c.html), kind: b.kind === "element" ? "element" : "section", tags: tagsOf(b), html: c.html }); } });
    } else {
      var c = X.sanitize(txt), t = document.createElement("template"); removed = c.removed; t.innerHTML = c.html;
      var styles = $$("style", t.content).map(function (n) { return n.outerHTML; }).join("");
      var kids = Array.prototype.filter.call(t.content.children, function (n) { return n.tagName !== "STYLE"; });
      if (kids.length > 1 && kids.every(function (n) { return /^(SECTION|DIV|HEADER|ARTICLE|ASIDE|FOOTER)$/.test(n.tagName); })) kids.forEach(function (n, i) { list.push({ name: nameOf(n, i), cat: X.guessCat(n.outerHTML), kind: "section", tags: [], html: (i === 0 ? styles : "") + n.outerHTML }); });
      else if (c.html) list.push({ name: nameOf(t.content, 0), cat: X.guessCat(c.html), kind: "section", tags: [], html: c.html });
    }
    return { list: list, removed: removed };
  }
  function nameOf(n, i) { var h = n.querySelector && n.querySelector("h1,h2,h3"); var t = h ? h.textContent.replace(/\s+/g, " ").trim() : ""; return (t || "Imported section " + (i + 1)).slice(0, 60); }

  function importDialog(tab) {
    X.modal("<h2>Import sections</h2><div class='p17-tabs'><button data-t='file'>📄 File or paste</button><button data-t='page'>🎯 Pick from a page</button></div><div id='p17-tab'></div>");
    X.wide(mb(), "min(900px,92vw)");
    var show = function (t) { $$(".p17-tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === t); }); t === "page" ? pagePicker($("#p17-tab")) : fileTab($("#p17-tab")); };
    $$(".p17-tabs button").forEach(function (b) { b.onclick = function () { show(b.dataset.t); }; });
    show(tab || "file");
  }
  function fileTab(box) {
    box.innerHTML = "<p class='hint'>Choose a Woodex <b>.json</b> export (builder or Admin) or an <b>.html</b> file — or paste the code. Scripts and unsafe code are removed; you review every section before saving.</p>" +
      "<input type='file' id='imp-f' accept='.json,.html,.htm,.txt'><textarea id='imp-t' rows='9' style='width:100%;margin-top:8px;font:12px/1.5 ui-monospace,monospace' placeholder='<section>…</section>  or  {\"blocks\":[…]}'></textarea><div class='row' style='margin-top:10px'><button class='btn btn-pri' id='imp-chk'>Find sections →</button></div>";
    $("#imp-f").onchange = function () { var f = this.files[0]; if (f) f.text().then(function (t) { $("#imp-t").value = t; $("#imp-chk").click(); }); };
    $("#imp-chk").onclick = function () {
      var txt = $("#imp-t").value.trim(); if (!txt) return toast("Choose a file or paste code first", true);
      var r = parseText(txt); if (!r) return; if (!r.list.length) return toast("No sections found", true);
      review(r.list, r.removed ? "<b>" + r.removed + " unsafe item(s) removed</b> (scripts, event handlers)." : "");
    };
  }

  // ------------------------------------------------------------------ C1 pick from a page
  function pagePicker(box) {
    box.innerHTML = "<p class='hint'>Open any page of <b>this website</b>, or paste a public <b>https://</b> link to another site. Then click the sections you want to keep.</p>" +
      "<div class='p17-src'><select id='pk-page'><option value=''>— a page of this site —</option></select><span>or</span><input id='pk-url' type='url' placeholder='https://example.com/page'><button class='btn btn-pri' id='pk-go'>Open</button></div><div id='pk-stage'></div>";
    api("pages").then(function (r) { if (!r.ok) return; $("#pk-page").innerHTML += (r.pages || []).map(function (p) { return "<option value='" + esc(p.path) + "'>" + esc((p.title || p.path).slice(0, 70)) + " — /" + esc(String(p.path).replace(/index\.html$/, "")) + "</option>"; }).join(""); });
    $("#pk-page").onchange = function () { if (this.value) { $("#pk-url").value = ""; $("#pk-go").click(); } };
    $("#pk-go").onclick = function () {
      var path = $("#pk-page").value, url = $("#pk-url").value.trim();
      if (url) { if (!/^https:\/\//i.test(url)) return toast("Paste a full https:// link", true);
        $("#pk-stage").innerHTML = "<p class='hint'>Opening…</p>"; api("fetch_page", { url: url }).then(function (r) { if (!r.ok) { $("#pk-stage").innerHTML = ""; return toast(r.error, true); } stage(r.html, r.url, true); }); }
      else if (path) { $("#pk-stage").innerHTML = "<p class='hint'>Opening…</p>"; fetch("/" + path.replace(/^\/+/, ""), { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (h) { stage(h, location.origin + "/" + path, false); }).catch(function () { toast("Could not open that page", true); }); }
      else toast("Choose a page or paste a link", true);
    };
  }
  function absolutize(root, base) {
    $$("[src],[href],[srcset],[poster]", root).forEach(function (n) {
      ["src", "href", "poster"].forEach(function (a) { var v = n.getAttribute(a); if (v && !/^(#|mailto:|tel:|data:|https?:)/i.test(v)) { try { n.setAttribute(a, new URL(v, base).href); } catch (e) {} } });
      var ss = n.getAttribute("srcset"); if (ss) n.setAttribute("srcset", ss.split(",").map(function (p) { var x = p.trim().split(/\s+/); try { x[0] = new URL(x[0], base).href; } catch (e) {} return x.join(" "); }).join(", "));
    });
  }
  function stage(html, base, external) {
    var d = new DOMParser().parseFromString(html, "text/html");
    $$("script,noscript,iframe,object,embed,base", d).forEach(function (n) { n.remove(); });
    $$("*", d).forEach(function (n) { Array.prototype.slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || /^\s*(javascript|vbscript)/i.test(a.value)) n.removeAttribute(a.name); }); });
    if (external) absolutize(d, base);
    // candidates: children of <main>, else top-level blocks of <body> (and children of a single wrapper div)
    var root = d.querySelector("main") || d.body, cands = Array.prototype.filter.call(root.children, function (n) { return /^(SECTION|DIV|HEADER|ARTICLE|ASIDE|FOOTER|NAV)$/.test(n.tagName); });
    if (cands.length === 1 && cands[0].children.length > 1) cands = Array.prototype.filter.call(cands[0].children, function (n) { return /^(SECTION|DIV|ARTICLE|ASIDE)$/.test(n.tagName); });
    if (root === d.body && !external) cands = cands.filter(function (n) { return !/^(HEADER|FOOTER|NAV)$/.test(n.tagName); });
    if (!cands.length) { $("#pk-stage").innerHTML = "<p class='hint'>No sections found on that page.</p>"; return; }
    cands.forEach(function (n, i) { n.setAttribute("data-p17", i); });
    var css = $$("link[rel~=stylesheet],style", d).map(function (n) { return n.outerHTML; }).join("");
    var head = "<base href='" + esc(base) + "'>" + css + (external ? "" : "<style>.reveal,[data-reveal],.wx-reveal{opacity:1!important;transform:none!important}</style>") +
      "<style>[data-p17]{outline:2px dashed transparent;outline-offset:-3px;cursor:pointer;position:relative;transition:outline-color .15s}[data-p17]:hover{outline-color:#b8956a}[data-p17].p17-on{outline:3px solid #b8956a!important;box-shadow:inset 0 0 0 9999px rgba(184,149,106,.10)}[data-p17].p17-on::before{content:'✓ selected';position:absolute;top:8px;left:8px;z-index:99;background:#b8956a;color:#fff;font:700 12px system-ui;padding:4px 10px;border-radius:99px}a{pointer-events:none}</style>";
    $("#pk-stage").innerHTML = "<div class='p17-pkbar'><b id='pk-n'>0 selected</b><span class='hint'>Click sections in the page below. " + (external ? "Styles from the other site are <b>not</b> copied — the sections take on Woodex styling; check them in the review." : "") + "</span><span style='flex:1'></span><button class='btn btn-sm' id='pk-allx'>Select all</button><button class='btn btn-pri' id='pk-next' disabled>Review →</button></div><iframe id='pk-frame' title='Pick sections'></iframe>";
    var f = $("#pk-frame"); f.srcdoc = "<!doctype html><html><head><meta charset='utf-8'>" + head + "</head><body>" + (root === d.body ? root.innerHTML : "<main>" + root.innerHTML + "</main>") + "</body></html>";
    var sel = {};
    var upd = function () { var n = Object.keys(sel).length; $("#pk-n").textContent = n + " selected"; $("#pk-next").disabled = !n; };
    f.onload = function () {
      var fd = f.contentDocument;
      $$("[data-p17]", fd).forEach(function (n) { n.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var k = n.getAttribute("data-p17"); if (sel[k]) { delete sel[k]; n.classList.remove("p17-on"); } else { sel[k] = 1; n.classList.add("p17-on"); } upd(); }, true); });
      $("#pk-allx").onclick = function () { var all = $$("[data-p17]", fd); var on = Object.keys(sel).length < all.length; sel = {}; all.forEach(function (n) { n.classList.toggle("p17-on", on); if (on) sel[n.getAttribute("data-p17")] = 1; }); upd(); };
    };
    $("#pk-next").onclick = function () {
      var removed = 0, list = Object.keys(sel).sort(function (a, b) { return a - b; }).map(function (k) {
        var n = cands[+k].cloneNode(true); n.removeAttribute("data-p17"); $$("[data-p17]", n).forEach(function (x) { x.removeAttribute("data-p17"); });
        var c = X.sanitize(n.outerHTML); removed += c.removed;
        return { name: nameOf(n, +k), cat: X.guessCat(c.html), kind: "section", tags: external ? ["imported", hostOf(base)] : ["from-" + slugOf(base)], html: c.html };
      }).filter(function (b) { return b.html; });
      review(list, (external ? "From <b>" + esc(hostOf(base)) + "</b>. Images stay linked to that site — replace them with your own photos before publishing." : "Copied from this website.") + (removed ? " " + removed + " unsafe item(s) removed." : ""));
    };
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "web"; } }
  function slugOf(u) { try { return (new URL(u).pathname.replace(/index\.html$/, "").replace(/^\/|\/$/g, "") || "home").replace(/[^\w-]+/g, "-").slice(0, 20); } catch (e) { return "page"; } }

  // ------------------------------------------------------------------ C2 new-section designer
  var EL = (window.WX_ELEMENTS || []).filter(function (e) { return e.html; });
  var BG = [["wx-bg-white", "White"], ["wx-bg-light", "Cream"], ["wx-bg-beige", "Beige"], ["wx-bg-dark", "Navy (dark)"]];
  var SP = [["40px", "Compact"], ["72px", "Normal"], ["112px", "Spacious"]];
  var LAY = [["1", "1 column", [1]], ["2", "2 columns", [1, 1]], ["3", "3 columns", [1, 1, 1]], ["4", "4 columns", [1, 1, 1, 1]], ["64", "Wide + narrow", [3, 2]], ["46", "Narrow + wide", [2, 3]]];
  var START = { "1": [["p"], []], "2": [["h3", "p", "list"], ["img"]], "3": [["h3", "p"], ["h3", "p"], ["h3", "p"]], "4": [["h3", "p"], ["h3", "p"], ["h3", "p"], ["h3", "p"]], "64": [["h3", "p", "btn"], ["img"]], "46": [["img"], ["h3", "p", "btn"]] };
  function designer() {
    var D = { name: "", cat: "Content", tags: "", bg: "wx-bg-white", sp: "72px", narrow: false, center: false, head: true, kicker: "Small label", title: "Section heading", sub: "One or two sentences that introduce this section.", lay: "2", cols: [] };
    var setLay = function (k) { D.lay = k; var st = START[k] || []; D.cols = (LAY.find(function (l) { return l[0] === k; })[2]).map(function (w, i) { return (D.cols[i] && D.cols[i].length ? D.cols[i] : st[i] || []).slice(); }); };
    setLay("2");
    X.modal("<h2>Design a new section</h2><div class='p17-ds'><div class='p17-dsl'>" +
      "<label class='fld'>Name<input id='ds-n' placeholder='e.g. Kitchen benefits + photo'></label><div class='p17-g2'><label class='fld'>Category<select id='ds-c'>" + CATS.map(function (c) { return "<option" + (c === "Content" ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label><label class='fld'>Tags<input id='ds-t' placeholder='kitchen, lahore'></label></div>" +
      "<div class='p17-h'>Look</div><div class='p17-g2'><label class='fld'>Background<select id='ds-bg'>" + BG.map(function (b) { return "<option value='" + b[0] + "'>" + b[1] + "</option>"; }).join("") + "</select></label><label class='fld'>Spacing<select id='ds-sp'>" + SP.map(function (b) { return "<option value='" + b[0] + "'" + (b[0] === "72px" ? " selected" : "") + ">" + b[1] + "</option>"; }).join("") + "</select></label></div>" +
      "<div class='p17-ck'><label><input type='checkbox' id='ds-nw'> Narrow width</label><label><input type='checkbox' id='ds-ct'> Centre text</label><label><input type='checkbox' id='ds-hd' checked> Heading block</label></div>" +
      "<div id='ds-hb'><label class='fld'>Label<input id='ds-k' value='" + esc(D.kicker) + "'></label><label class='fld'>Heading<input id='ds-h' value='" + esc(D.title) + "'></label><label class='fld'>Intro<input id='ds-s' value='" + esc(D.sub) + "'></label></div>" +
      "<div class='p17-h'>Layout</div><div class='p17-lay'>" + LAY.map(function (l) { return "<button data-l='" + l[0] + "' title='" + l[1] + "'>" + l[2].map(function (w) { return "<i style='flex:" + w + "'></i>"; }).join("") + "<small>" + l[1] + "</small></button>"; }).join("") + "</div>" +
      "<div id='ds-cols'></div></div><div class='p17-dsr'><div class='p17-h'>Live preview</div><iframe id='ds-pv' title='Preview'></iframe>" +
      "<div class='row' style='margin-top:10px;gap:8px'><button class='btn btn-pri' id='ds-save'>💾 Save to My sections</button><button class='btn' id='ds-ins'>Insert into page</button><button class='btn' id='ds-code'>&lt;/&gt; HTML</button></div></div></div>");
    X.wide(mb(), "min(1100px,92vw)");
    var t = null;
    function htmlOf() {
      var lay = LAY.find(function (l) { return l[0] === D.lay; }), n = lay[2].length, same = lay[2].every(function (w) { return w === 1; });
      var grid = n === 1 ? "" : same && n <= 3 ? " class='wx-cols wx-cols-" + n + "'" : " class='wx-cols p17-grid' style='grid-template-columns:" + lay[2].map(function (w) { return w + "fr"; }).join(" ") + "'";
      var col = function (parts) { return parts.map(function (id) { var e = EL.find(function (x) { return x.id === id; }); return e ? e.html.trim() : ""; }).join("\n"); };
      var body = n === 1 ? col(D.cols[0]) : "<div" + grid + ">" + D.cols.map(function (c) { return "<div>" + col(c) + "</div>"; }).join("") + "</div>";
      var head = D.head ? "<div class='wx-sec-h" + (D.center ? " wx-center" : "") + "'" + (D.center ? " style='margin-left:auto;margin-right:auto'" : "") + ">" + (D.kicker ? "<p class='wx-kicker'>" + esc(D.kicker) + "</p>" : "") + "<h2>" + esc(D.title) + "</h2>" + (D.sub ? "<p>" + esc(D.sub) + "</p>" : "") + "</div>" : "";
      return "<section class='" + D.bg + "' style='padding:" + D.sp + " 0" + (D.center ? ";text-align:center" : "") + "' data-wx-label='" + esc(D.name || "Custom section") + "'><div class='wrap'" + (D.narrow ? " style='max-width:860px'" : "") + ">" + head + body + "</div></section>";
    }
    function cols() {
      var lay = LAY.find(function (l) { return l[0] === D.lay; });
      $("#ds-cols").innerHTML = D.cols.map(function (c, i) {
        return "<div class='p17-col'><b>Column " + (i + 1) + (lay[2].length > 1 ? " <small class='hint'>(" + lay[2][i] + "/" + lay[2].reduce(function (a, b) { return a + b; }, 0) + ")</small>" : "") + "</b>" +
          c.map(function (id, k) { var e = EL.find(function (x) { return x.id === id; }) || { name: id, icon: "?" }; return "<div class='p17-part'><span>" + e.icon + " " + esc(e.name) + "</span><button data-mv='" + i + "," + k + ",-1' title='Up'>↑</button><button data-mv='" + i + "," + k + ",1' title='Down'>↓</button><button data-rm='" + i + "," + k + "' title='Remove'>✕</button></div>"; }).join("") +
          "<select data-add='" + i + "'><option value=''>+ Add a part…</option>" + EL.map(function (e) { return "<option value='" + e.id + "'>" + e.icon + " " + esc(e.name) + "</option>"; }).join("") + "</select></div>";
      }).join("");
      $$("[data-add]").forEach(function (s) { s.onchange = function () { if (s.value) { D.cols[+s.dataset.add].push(s.value); cols(); pv(); } }; });
      $$("[data-rm]").forEach(function (b) { b.onclick = function () { var x = b.dataset.rm.split(","); D.cols[+x[0]].splice(+x[1], 1); cols(); pv(); }; });
      $$("[data-mv]").forEach(function (b) { b.onclick = function () { var x = b.dataset.mv.split(",").map(Number), c = D.cols[x[0]], j = x[1] + x[2]; if (j < 0 || j >= c.length) return; var v = c[x[1]]; c[x[1]] = c[j]; c[j] = v; cols(); pv(); }; });
      $$(".p17-lay button").forEach(function (b) { b.classList.toggle("on", b.dataset.l === D.lay); });
    }
    function pv() { clearTimeout(t); t = setTimeout(function () { $("#ds-pv").srcdoc = "<!doctype html><html><head><meta charset='utf-8'><link rel='stylesheet' href='/assets/site-p21.css'><link rel='stylesheet' href='/assets/v1-p21.css'><link rel='stylesheet' href='/assets/theme.css'><style>html{zoom:.62}body{margin:0}</style></head><body><main>" + htmlOf() + "</main></body></html>"; }, 150); }
    var bind = function (id, k, prop) { $(id).oninput = $(id).onchange = function () { D[k] = prop === "checked" ? this.checked : this.value; if (k === "head") $("#ds-hb").hidden = !D.head; pv(); }; };
    bind("#ds-n", "name"); bind("#ds-c", "cat"); bind("#ds-t", "tags"); bind("#ds-bg", "bg"); bind("#ds-sp", "sp"); bind("#ds-nw", "narrow", "checked"); bind("#ds-ct", "center", "checked"); bind("#ds-hd", "head", "checked"); bind("#ds-k", "kicker"); bind("#ds-h", "title"); bind("#ds-s", "sub");
    $$(".p17-lay button").forEach(function (b) { b.onclick = function () { setLay(b.dataset.l); cols(); pv(); }; });
    $("#ds-save").onclick = function () {
      var name = D.name.trim(); if (!name) { $("#ds-n").focus(); return toast("Give the section a name", true); }
      api("blocks_save", { name: name, cat: D.cat, tags: D.tags, kind: "section", global: false, html: htmlOf() }).then(function (r) { if (!r.ok) return toast(r.error, true); X.closeModal(); X.renderMine(); openMine(); toast("“" + name + "” saved to My sections ✓"); });
    };
    $("#ds-ins").onclick = function () { if (!X.S.doc) return toast("Open a page first", true); var h = htmlOf(); X.closeModal(); X.insertSection(h, X.S.sel); toast("Section inserted — click any text to edit"); };
    $("#ds-code").onclick = function () { X.download((D.name || "section").replace(/[^\w-]+/g, "-").toLowerCase() + ".html", htmlOf()); };
    cols(); pv();
  }

  // ------------------------------------------------------------------ My sections: category filter + tag search
  var F = { cat: "", q: "" };
  function filterMine() { $$("#lib-mine button[data-id]").forEach(function (b) { var ok = (!F.cat || b.dataset.cat === F.cat) && (!F.q || (b.textContent + " " + (b.dataset.tags || "") + " " + b.dataset.cat).toLowerCase().indexOf(F.q) >= 0); b.hidden = !ok; });
    $$("#lib-mine .lib-cat").forEach(function (h) { var n = h.nextElementSibling, any = false; while (n && !n.classList.contains("lib-cat")) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; }); }
  window.__wx17mine = function (blocks) {
    var bar = $("#p17-mf"); if (!bar) return;
    var cats = blocks.map(function (b) { return b.cat || "Custom"; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).sort();
    $("#p17-mc").innerHTML = "<option value=''>All categories (" + blocks.length + ")</option>" + cats.map(function (c) { return "<option" + (c === F.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");
    bar.hidden = blocks.length < 2; $$("#lib-mine button[data-id]").forEach(function (b) { var bl = blocks.find(function (x) { return x.id === b.dataset.id; }); if (bl && bl.tags && bl.tags.length) b.title = (b.title ? b.title + " · " : "") + "Tags: " + bl.tags.join(", "); });
    filterMine();
  };

  // ------------------------------------------------------------------ wire into the Sections panel
  var h = $("#import-sec"); if (!h) return;
  h.onclick = function () { importDialog("file"); };
  var grp = document.createElement("div"); grp.className = "p17-acts";
  grp.innerHTML = "<button class='btn btn-sm' id='p17-new'>➕ Design new</button><button class='btn btn-sm' id='p17-pick'>🎯 Pick from a page</button>";
  h.parentNode.after(grp);
  var mf = document.createElement("div"); mf.id = "p17-mf"; mf.className = "p17-mf"; mf.hidden = true;
  mf.innerHTML = "<select id='p17-mc' aria-label='Category'></select><input id='p17-mq' type='search' placeholder='Search name or tag…' aria-label='Search my sections'>";
  grp.after(mf);
  $("#p17-mc").onchange = function () { F.cat = this.value; filterMine(); };
  $("#p17-mq").oninput = function () { F.q = this.value.trim().toLowerCase(); filterMine(); };
  $("#p17-new").onclick = designer; $("#p17-pick").onclick = function () { importDialog("page"); };
  X.renderMine();
  window.__wx17 = { review: review, designer: designer, importDialog: importDialog, parseText: parseText };
})();
