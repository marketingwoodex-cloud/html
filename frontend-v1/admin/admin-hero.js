/* Woodex Admin — P38 Hero slides & page heroes (Website → Pages & builder → Hero slides).
   1) Home slider: add / remove / hide / reorder slides, image, kicker, title, text, 2 buttons, big word, 2 info lines, speed.
   2) Page heroes: every page's hero type, counts per type, edit any hero (keep its design) or switch it to a template.
   3) Templates: 6 hero designs (Full image, Split, Centered, Plain cream, Compact band, Slider).
   Saves through the page builder API (bapi load/save), so every save keeps a backup and can be restored. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, bapi = W.bapi, toast = W.toast, $ = W.$;
  var tab = "home", HOME = "index.html";
  var FAM = { "dx-hero": "Article header", "ct-hero": "City page", "as-hero": "Architecture service", "rv-hero": "Renovation service", "bd-hero": "Interior service", "fo-hero": "Fit-out service", "hm-hero": "Home slider", "hx-hero": "Hub header", "est-hero": "Tool / legal header" };
  var TPL = {
    image: ["Full image", "Photo fills the hero, text bottom-left. Strong first impression."],
    split: ["Split", "Text left, photo right, on cream. Calm and clear."],
    center: ["Centered", "Photo behind, centred title. Good for campaigns."],
    plain: ["Plain cream", "No photo. Title, text and buttons only. Fast to load."],
    compact: ["Compact band", "Short navy band with title. Best for legal and utility pages."],
    slider: ["Slider", "Several slides that rotate, each with its own photo and buttons."]
  };

  // ---------- helpers
  function parse(html) { return new DOMParser().parseFromString(html, "text/html"); }
  function heroOf(doc) { return doc.querySelector("main section[class*='hero']") || doc.querySelector("section[class*='hero']"); }
  function famOf(sec) {
    if (!sec) return ["none", "No hero"];
    var t = sec.getAttribute("data-wxh"); if (t) return ["tpl-" + t, "Template: " + (TPL[t] ? TPL[t][0] : t)];
    var cls = sec.className.split(/\s+/);
    for (var i = 0; i < cls.length; i++) if (FAM[cls[i]]) return [cls[i], FAM[cls[i]]];
    var h = cls.filter(function (c) { return /-hero$|^hero$/.test(c); })[0] || cls[0];
    return ["custom", "One-off design", h];
  }
  /** raw [start,end) of the first section whose opening tag equals `open` (balanced on nested sections) */
  function rawRange(html, sec) {
    var cls = sec.getAttribute("class"), re = /<section\b[^>]*>/gi, m;
    while ((m = re.exec(html))) {
      var mc = m[0].match(/class\s*=\s*"([^"]*)"/i); if (!mc || mc[1] !== cls) continue;
      var depth = 0, r2 = /<\/?section\b[^>]*>/gi; r2.lastIndex = m.index;
      var x; while ((x = r2.exec(html))) { if (x[0][1] === "/") depth--; else depth++; if (depth === 0) return [m.index, x.index + x[0].length]; }
    }
    return null;
  }
  function fields(sec) {
    var f = { kicker: "", title: "", lead: "", img: "", alt: "", b1t: "", b1h: "", b2t: "", b2h: "", crumbs: !!sec.querySelector("nav") };
    var h = sec.querySelector("h1") || sec.querySelector("h2"); if (h) f.title = h.textContent.trim();
    var ps = [].slice.call(sec.querySelectorAll("p")).filter(function (p) { return !p.closest("nav,figcaption,dl,.actions,[class*='btn']"); });
    var k = ps.filter(function (p) { return /kicker|label|eyebrow|-k\b|wxh-k/.test(p.className) && (!h || p.compareDocumentPosition(h) & 4); })[0];
    if (!k && h && h.previousElementSibling && h.previousElementSibling.tagName === "P") k = h.previousElementSibling;
    if (k) f.kicker = k.textContent.trim();
    var l = ps.filter(function (p) { return p !== k && (!h || h.compareDocumentPosition(p) & 4) && p.textContent.trim().length > 25; })[0];
    if (l) f.lead = l.textContent.trim();
    var im = sec.querySelector("img"); if (im) { f.img = im.getAttribute("src") || ""; f.alt = im.getAttribute("alt") || ""; }
    var bs = [].slice.call(sec.querySelectorAll("a")).filter(function (a) { return /btn/.test(a.className) && !a.closest("nav"); });
    if (bs[0]) { f.b1t = bs[0].textContent.trim(); f.b1h = bs[0].getAttribute("href") || ""; }
    if (bs[1]) { f.b2t = bs[1].textContent.trim(); f.b2h = bs[1].getAttribute("href") || ""; }
    f._k = k; f._h = h; f._l = l; f._im = im; f._bs = bs;
    var sl = [].slice.call(sec.querySelectorAll(".wxh-slide")); if (sl.length) f.slides = sl.map(function (s) { var g = fields(s); delete g.slides; return g; });
    return f;
  }
  function applyInPlace(sec, f, o) {
    if (o._h) o._h.textContent = f.title;
    if (o._k) o._k.textContent = f.kicker;
    if (o._l) o._l.textContent = f.lead;
    if (o._im) { if (f.img && f.img !== o.img) { o._im.setAttribute("src", f.img); o._im.removeAttribute("srcset"); o._im.removeAttribute("sizes"); } o._im.setAttribute("alt", f.alt); }
    [["b1t", "b1h"], ["b2t", "b2h"]].forEach(function (b, i) { var a = o._bs[i]; if (!a) return; a.textContent = f[b[0]]; if (f[b[1]]) a.setAttribute("href", f[b[1]]); });
    return sec.outerHTML;
  }
  function crumbs(title, path) {
    var parts = path.replace(/index\.html$/, "").split("/").filter(Boolean); if (!parts.length) return "";
    return '<nav class="wxh-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span>' + (parts.length > 1 ? '<a href="/' + esc(parts[0]) + '/">' + esc(parts[0].replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); })) + "</a><span>→</span>" : "") + "<span>" + esc(title) + "</span></nav>";
  }
  function inner(f, path, isH1) {
    var t = isH1 ? '<h1 id="wxh-title">' + esc(f.title) + "</h1>" : '<h2 class="wxh-t">' + esc(f.title) + "</h2>";
    var b = [[f.b1t, f.b1h, ""], [f.b2t, f.b2h, " wxh-btn--ghost"]].filter(function (x) { return x[0]; }).map(function (x) { return '<a class="wxh-btn' + x[2] + '" href="' + esc(x[1] || "/contact/") + '">' + esc(x[0]) + "</a>"; }).join("");
    return (f.crumbs && isH1 ? crumbs(f.title, path) : "") + (f.kicker ? '<p class="wxh-k">' + esc(f.kicker) + "</p>" : "") + t + (f.lead ? '<p class="wxh-lead">' + esc(f.lead) + "</p>" : "") + (b ? '<div class="wxh-btns">' + b + "</div>" : "");
  }
  function media(f, first) { return f.img ? '<figure class="wxh-media"><img src="' + esc(f.img) + '" alt="' + esc(f.alt) + '"' + (first ? ' fetchpriority="high"' : ' loading="lazy"') + "></figure>" : ""; }
  function build(t, f, path) {
    if (t === "slider") {
      var ss = (f.slides && f.slides.length ? f.slides : [f]).filter(function (s) { return !s.off; });
      return '<section class="wxh wxh--slider" data-wxh="slider" data-interval="' + (+f.interval || 6) + '" aria-roledescription="carousel" aria-labelledby="wxh-title">' +
        ss.map(function (s, i) { return '<div class="wxh-slide' + (i ? "" : " is-on") + '" aria-hidden="' + (i ? "true" : "false") + '">' + media(s, !i) + '<div class="wxh-in"><div class="wxh-copy">' + inner(Object.assign({}, s, { crumbs: f.crumbs }), path, !i) + "</div></div></div>"; }).join("") +
        (ss.length > 1 ? '<div class="wxh-dots" role="group" aria-label="Choose a slide">' + ss.map(function (s, i) { return '<button type="button" class="wxh-dot' + (i ? "" : " is-on") + '" aria-label="Slide ' + (i + 1) + '" aria-current="' + !i + '"></button>'; }).join("") + "</div>" : "") + "</section>";
    }
    var noImg = t === "plain" || t === "compact";
    return '<section class="wxh wxh--' + t + '" data-wxh="' + t + '" aria-labelledby="wxh-title">' + (noImg ? "" : media(f, true)) + '<div class="wxh-in">' + (t === "split" ? "" : "") + '<div class="wxh-copy">' + inner(f, path, true) + "</div>" + "</div></section>";
  }
  // split puts the photo inside the grid
  var build0 = build; build = function (t, f, path) { var h = build0(t, f, path); if (t === "split" && f.img) h = h.replace(media(f, true) + '<div class="wxh-in">', '<div class="wxh-in">' + media(f, true)); return h; };

  // ---------- view
  W.VIEWS.heroes = function (el) {
    if (!W.S.btoken) { el.innerHTML = '<div class="content"><div class="card soon-box"><h2>No builder access</h2><p>Your role cannot edit pages.</p></div></div>'; return; }
    el.innerHTML = W.head("Hero slides", "Website / Hero slides", '<a class="btn" href="/" target="_blank" rel="noopener">' + ic("external-link") + "View website</a>") +
      '<div class="content"><div class="hx-tabs seg" id="hx-tabs">' + [["home", "Home slider"], ["pages", "All page heroes"], ["tpl", "Templates"]].map(function (t) { return '<button data-t="' + t[0] + '"' + (tab === t[0] ? ' class="on"' : "") + ">" + t[1] + "</button>"; }).join("") + '</div><div id="hx-body" style="margin-top:16px"><div class="card" style="padding:24px">Loading…</div></div></div>';
    W.fillIcons && W.fillIcons(el);
    $("#hx-tabs").onclick = function (e) { var b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; W.VIEWS.heroes(el); } };
    ({ home: homeTab, pages: pagesTab, tpl: tplTab })[tab]($("#hx-body"));
  };

  // ---------- 1) home slider
  function homeTab(box) {
    bapi("load", { path: HOME }).then(function (r) {
      if (!r.ok) { box.innerHTML = '<div class="card" style="padding:20px">' + esc(r.error) + "</div>"; return; }
      var raw = r.html, doc = parse(raw), hero = doc.getElementById("hm-hero");
      if (!hero) { box.innerHTML = '<div class="card" style="padding:20px">The home page has no slider. Use “All page heroes” to give it a template.</div>'; return; }
      var S = [].slice.call(hero.querySelectorAll("[data-home-slide]")).map(function (a) {
        var q = function (s) { var x = a.querySelector(s); return x ? x.textContent.trim() : ""; }, im = a.querySelector("img"), bs = a.querySelectorAll(".actions a"), mt = a.querySelectorAll(".hm-hero-meta span");
        return { kicker: q(".hm-kicker"), title: q(".hm-hero-title"), lead: q(".hm-hero-aside p"), img: im ? im.getAttribute("src") : "", alt: im ? im.getAttribute("alt") : "", imgTag: im ? im.outerHTML : "",
          b1t: bs[0] ? bs[0].textContent.trim() : "", b1h: bs[0] ? bs[0].getAttribute("href") : "", b2t: bs[1] ? bs[1].textContent.trim() : "", b2h: bs[1] ? bs[1].getAttribute("href") : "",
          word: q(".hm-display"), m1: mt[0] ? mt[0].textContent.trim() : "", m2: mt[1] ? mt[1].textContent.trim() : "", off: a.hasAttribute("data-hm-off"), _img0: im ? im.getAttribute("src") : "" };
      });
      var speed = +hero.getAttribute("data-interval") || 5;
      function draw() {
        box.innerHTML = '<div class="card hx-card"><div class="hx-h"><div><h3>Home page slider</h3><p class="muted">' + S.filter(function (s) { return !s.off; }).length + " of " + S.length + ' slides showing · slide 1 is the main heading (H1) for Google</p></div><div class="hx-tools"><label>Change every <select id="hx-sp">' + [4, 5, 6, 7, 8, 10].map(function (n) { return "<option" + (n === speed ? " selected" : "") + ">" + n + "</option>"; }).join("") + '</select> s</label><button class="btn" id="hx-add">' + ic("plus") + 'Add slide</button><button class="btn pri" id="hx-save">' + ic("check") + "Save & publish</button></div></div>" +
          '<div class="hx-list">' + S.map(function (s, i) {
            return '<div class="hx-slide' + (s.off ? " off" : "") + '" data-i="' + i + '"><div class="hx-thumb" data-pick="' + i + '" style="background-image:url(\'' + esc(s.img) + '\')"><span>' + ic("image") + "Change photo</span><b>" + (i + 1) + "</b></div>" +
              '<div class="hx-f"><div class="g2"><label>Small heading<input data-k="kicker" value="' + esc(s.kicker) + '"></label><label>Big background word<input data-k="word" value="' + esc(s.word) + '" maxlength="14"></label></div>' +
              '<label>Title' + (i === 0 ? " <small class='muted'>(H1)</small>" : "") + '<input data-k="title" value="' + esc(s.title) + '"></label><label>Text<textarea data-k="lead" rows="2">' + esc(s.lead) + "</textarea></label>" +
              '<div class="g2"><label>Button 1<input data-k="b1t" value="' + esc(s.b1t) + '"></label><label>Link<input data-k="b1h" value="' + esc(s.b1h) + '"></label><label>Button 2<input data-k="b2t" value="' + esc(s.b2t) + '"></label><label>Link<input data-k="b2h" value="' + esc(s.b2h) + '"></label>' +
              '<label>Info line 1<input data-k="m1" value="' + esc(s.m1) + '"></label><label>Info line 2<input data-k="m2" value="' + esc(s.m2) + '"></label></div><label>Photo description (alt text)<input data-k="alt" value="' + esc(s.alt) + '"></label></div>' +
              '<div class="hx-act"><button class="btn sm" data-up="' + i + '" title="Move up"' + (i ? "" : " disabled") + ">↑</button><button class=\"btn sm\" data-dn=\"" + i + '" title="Move down"' + (i < S.length - 1 ? "" : " disabled") + '>↓</button><button class="btn sm" data-off="' + i + '">' + (s.off ? "Show" : "Hide") + '</button><button class="btn sm" data-del="' + i + '" style="color:#d92d20">Remove</button></div></div>';
          }).join("") + "</div></div>";
        W.fillIcons && W.fillIcons(box);
      }
      draw();
      box.oninput = function (e) { var k = e.target.dataset.k, c = e.target.closest("[data-i]"); if (k && c) S[+c.dataset.i][k] = e.target.value; if (e.target.id === "hx-sp") speed = +e.target.value; };
      box.onchange = box.oninput;
      box.onclick = function (e) {
        var t = e.target.closest("button,[data-pick]"); if (!t) return; var d = t.dataset;
        if (d.pick != null) { W.pickImage(function (u) { S[+d.pick].img = u; draw(); }); return; }
        if (t.id === "hx-add") { var b = S[0] || {}; S.push({ kicker: "New slide", title: "Your headline here", lead: "One or two sentences about this service.", img: b.img || "", alt: "", b1t: "Start your project", b1h: "/contact/", b2t: "", b2h: "", word: "WOODEX", m1: "", m2: "", off: false }); draw(); box.querySelector(".hx-slide:last-child").scrollIntoView({ behavior: "smooth" }); return; }
        if (d.up) { var u = +d.up; S.splice(u - 1, 0, S.splice(u, 1)[0]); draw(); }
        else if (d.dn) { var n = +d.dn; S.splice(n + 1, 0, S.splice(n, 1)[0]); draw(); }
        else if (d.off) { S[+d.off].off = !S[+d.off].off; if (!S.some(function (s) { return !s.off; })) { S[+d.off].off = false; toast("At least one slide must show", true); } draw(); }
        else if (d.del) { if (S.length < 2) return toast("Keep at least one slide", true); if (confirm("Remove slide " + (+d.del + 1) + "?")) { S.splice(+d.del, 1); draw(); } }
        else if (t.id === "hx-save") save(t);
      };
      function slideHtml(s, i, first) {
        var img = s.img === s._img0 && s.imgTag ? s.imgTag.replace(/\s(fetchpriority|loading)="[^"]*"/g, "").replace(/^<img/, "<img" + (first ? ' fetchpriority="high"' : ' loading="lazy"')).replace(/alt="[^"]*"/, 'alt="' + esc(s.alt) + '"')
          : '<img src="' + esc(s.img) + '" alt="' + esc(s.alt) + '"' + (first ? ' fetchpriority="high"' : ' loading="lazy"') + ">";
        var T = first ? '<h1 class="hm-hero-title" id="home-hero-title">' + esc(s.title) + "</h1>" : '<h2 class="hm-hero-title">' + esc(s.title) + "</h2>";
        var btn = [[s.b1t, s.b1h, "hm-btn-light"], [s.b2t, s.b2h, "hm-btn-ghost"]].filter(function (b) { return b[0]; }).map(function (b) { return '<a class="hm-btn ' + b[2] + '" href="' + esc(b[1] || "/contact/") + '">' + esc(b[0]) + "</a>"; }).join("");
        return '\n        <article class="hm-slide' + (first ? " is-active" : "") + '" data-home-slide="' + i + '" aria-hidden="' + !first + '"' + (s.off ? " data-hm-off hidden" : "") + '>\n          <figure class="hm-slide-image">' + img + '</figure>\n          <div class="hm-wrap hm-hero-content">\n            <div class="hm-hero-copy hm-slide-copy">\n              <div class="hm-slide-text"><p class="hm-kicker">' + esc(s.kicker) + "</p>" + T + '</div>\n              <div class="hm-hero-aside"><p>' + esc(s.lead) + '</p><div class="actions">' + btn + '</div></div>\n            </div>\n            <strong class="hm-display" aria-hidden="true">' + esc(s.word) + '</strong>\n            <div class="hm-hero-footer"><div class="hm-hero-meta"><span>' + esc(s.m1) + "</span><span>" + esc(s.m2) + "</span></div></div>\n          </div>\n        </article>";
      }
      function save(btn) {
        if (S.some(function (s) { return !s.off && (!s.title.trim() || !s.img); })) return toast("Every visible slide needs a title and a photo", true);
        var order = S.filter(function (s) { return !s.off; }).concat(S.filter(function (s) { return s.off; })); // visible first → slide 1 is the H1
        var a = raw.indexOf('<div class="hm-slides"'), b = raw.indexOf('<div class="hm-wrap hm-slider-controls"');
        if (a < 0 || b < 0) return toast("Could not find the slider in the home page", true);
        var vis = order.filter(function (s) { return !s.off; });
        var html = raw.slice(0, a) + '<div class="hm-slides" id="hm-slides" aria-live="off">' + order.map(function (s, i) { return slideHtml(s, i, i === 0); }).join("") + "\n      </div>\n      " + raw.slice(b);
        html = html.replace(/<div class="hm-slider-dots"[^>]*>[\s\S]*?<\/div>/, '<div class="hm-slider-dots" role="group" aria-label="Choose a slide">' + vis.map(function (s, i) { return '<button class="hm-slider-dot' + (i ? "" : " is-active") + '" type="button" data-home-dot="' + i + '" aria-label="Show slide ' + (i + 1) + ": " + esc(s.kicker || s.title) + '" aria-current="' + !i + '"></button>'; }).join("") + "</div>");
        html = html.replace(/<section class="hm-hero"([^>]*?)(\sdata-interval="\d+")?>/, function (m, x) { return '<section class="hm-hero"' + x.replace(/\sdata-interval="\d+"/, "") + ' data-interval="' + speed + '">'; });
        btn.disabled = true;
        bapi("save", { path: HOME, html: html, mtime: r.mtime }).then(function (x) { btn.disabled = false; if (!x.ok) return toast(x.error, true); toast("Home slider published ✓"); raw = html; r.mtime = x.mtime || r.mtime; S = order; S.forEach(function (s) { s._img0 = s.img; }); homeTab(box); });
      }
    });
  }

  // ---------- 2) all page heroes
  var scan = null;
  function pagesTab(box) {
    var go = function () {
      var fams = {}; scan.forEach(function (p) { fams[p.fam[1]] = (fams[p.fam[1]] || 0) + 1; });
      var none = scan.filter(function (p) { return p.fam[0] === "none"; }).length, q = (box.querySelector("#hx-q") || {}).value || "", ff = box.dataset.f || "";
      box.innerHTML = '<div class="card hx-card"><div class="hx-h"><div><h3>Hero on every page</h3><p class="muted">' + scan.length + " pages · " + Object.keys(fams).length + " hero designs (" + (Object.keys(fams).length - (fams["One-off design"] ? 1 : 0) - (none ? 1 : 0)) + " shared + " + (fams["One-off design"] || 0) + " one-off)" + (none ? " · <b style='color:#d92d20'>" + none + " without a hero</b>" : "") + '</p></div><input id="hx-q" type="search" placeholder="Search pages" value="' + esc(q) + '"></div>' +
        '<div class="hx-chips"><button data-f=""' + (ff ? "" : ' class="on"') + ">All</button>" + Object.keys(fams).sort(function (a, b) { return fams[b] - fams[a]; }).map(function (k) { return '<button data-f="' + esc(k) + '"' + (ff === k ? ' class="on"' : "") + ">" + esc(k) + " <b>" + fams[k] + "</b></button>"; }).join("") + "</div>" +
        '<table class="tbl hx-tbl"><thead><tr><th>Page</th><th>Hero type</th><th>Hero title</th><th></th></tr></thead><tbody>' +
        scan.filter(function (p) { return (!ff || p.fam[1] === ff) && (!q || (p.path + " " + p.h).toLowerCase().indexOf(q.toLowerCase()) > -1); }).map(function (p) {
          return "<tr><td><b>" + esc(p.title) + '</b><br><small class="muted">/' + esc(p.path.replace(/index\.html$/, "")) + '</small></td><td><span class="badge' + (p.fam[0] === "none" ? " bad" : p.fam[0].indexOf("tpl-") === 0 ? " ok" : "") + '">' + esc(p.fam[1]) + (p.fam[2] ? " · " + esc(p.fam[2]) : "") + "</span></td><td>" + esc(p.h || "—") + '</td><td style="text-align:right"><button class="btn sm' + (p.fam[0] === "none" ? " pri" : "") + '" data-ed="' + esc(p.path) + '">' + (p.fam[0] === "none" ? "Add hero" : "Edit hero") + "</button></td></tr>";
        }).join("") + "</tbody></table></div>";
      var s = box.querySelector("#hx-q"); s.oninput = function () { var p = s.selectionStart; go(); var n = box.querySelector("#hx-q"); n.focus(); n.setSelectionRange(p, p); };
    };
    box.onclick = function (e) { var f = e.target.closest("[data-f]"), ed = e.target.closest("[data-ed]"); if (f) { box.dataset.f = f.dataset.f; go(); } else if (ed) editor(ed.dataset.ed, function () { scan = null; pagesTab(box); }); };
    box.oninput = null; box.onchange = null;
    if (scan) return go();
    box.innerHTML = '<div class="card" style="padding:24px"><b>Checking every page…</b> <span id="hx-pr"></span></div>';
    bapi("pages").then(function (r) {
      var list = (r.pages || []).filter(function (p) { return !/^(404|500|503)\.html$/.test(p.path); }), out = [], i = 0;
      function next() {
        if (i >= list.length) { scan = out.sort(function (a, b) { return a.path === HOME ? -1 : b.path === HOME ? 1 : a.path.localeCompare(b.path); }); return go(); }
        var batch = list.slice(i, i + 8); i += 8; var pr = document.getElementById("hx-pr"); if (pr) pr.textContent = Math.min(i, list.length) + " / " + list.length;
        Promise.all(batch.map(function (p) { return bapi("load", { path: p.path }).then(function (x) { var d = x.ok ? parse(x.html) : null, s = d && heroOf(d), h = s && (s.querySelector("h1") || s.querySelector("h2")); out.push({ path: p.path, title: (p.title || p.path).replace(/\s*[|·–-]\s*Woodex.*$/i, ""), fam: famOf(s), h: h ? h.textContent.trim() : "" }); }); })).then(next);
      }
      next();
    });
  }

  // ---------- hero editor (modal)
  function editor(path, done) {
    bapi("load", { path: path }).then(function (r) {
      if (!r.ok) return toast(r.error, true);
      var raw = r.html, doc = parse(raw), sec = heroOf(doc), fam = famOf(sec), orig = sec ? fields(sec) : { kicker: "", title: (doc.querySelector("h1") || {}).textContent || doc.title.split("|")[0].trim(), lead: "", img: "", alt: "", b1t: "Start your project", b1h: "/contact/", b2t: "", b2h: "", crumbs: true };
      var cur = sec && sec.getAttribute("data-wxh");
      var f = Object.assign({}, orig, { tpl: cur || (sec ? "keep" : "split"), interval: sec ? +sec.getAttribute("data-interval") || 6 : 6 });
      if (!f.slides) f.slides = [Object.assign({}, orig)];
      ["_k", "_h", "_l", "_im", "_bs"].forEach(function (k) { delete f.slides[0][k]; });
      W.modal('<div class="hx-mod"><h2>Hero · ' + esc(path === HOME ? "Home" : "/" + path.replace(/index\.html$/, "")) + '</h2><p class="muted">Now: <b>' + esc(fam[1]) + '</b>. Edit the text and photo, or pick a template. A backup is kept on every save.</p><div class="hx-mgrid"><div id="hx-form"></div><div><div class="hx-pv-h"><b>Live preview</b><span class="seg" id="hx-dev"><button class="on" data-w="100%">Desktop</button><button data-w="390px">Mobile</button></span></div><div class="hx-pv"><iframe id="hx-if" title="Preview"></iframe></div></div></div>' +
        '<div class="hx-mact"><button class="btn" id="hx-hist">' + ic("refresh-cw") + 'Undo last save</button><span style="flex:1"></span><button class="btn" id="hx-x">Cancel</button><button class="btn pri" id="hx-ok">' + ic("check") + "Save & publish</button></div></div>");
      var mc = $("#modal-card"); if (mc) mc.style.maxWidth = "1180px";
      var form = $("#hx-form");
      function fieldset(s, i, slider) {
        return '<div class="hx-fs" data-si="' + i + '">' + (slider ? '<div class="hx-fs-h"><b>Slide ' + (i + 1) + '</b><span><button class="btn sm" data-sup="' + i + '"' + (i ? "" : " disabled") + '>↑</button><button class="btn sm" data-sdel="' + i + '" style="color:#d92d20">Remove</button></span></div>' : "") +
          '<div class="hx-img" data-pk="' + i + '" style="background-image:url(\'' + esc(s.img || "") + '\')">' + (s.img ? "" : ic("image")) + "<span>" + (s.img ? "Change photo" : "Choose photo") + "</span></div>" +
          '<label>Small heading<input data-k="kicker" value="' + esc(s.kicker) + '"></label><label>Title<input data-k="title" value="' + esc(s.title) + '"></label><label>Text<textarea data-k="lead" rows="3">' + esc(s.lead) + "</textarea></label>" +
          '<div class="g2"><label>Button 1<input data-k="b1t" value="' + esc(s.b1t) + '"></label><label>Link<input data-k="b1h" value="' + esc(s.b1h) + '"></label><label>Button 2<input data-k="b2t" value="' + esc(s.b2t) + '"></label><label>Link<input data-k="b2h" value="' + esc(s.b2h) + '"></label></div><label>Photo description (alt)<input data-k="alt" value="' + esc(s.alt) + '"></label></div>';
      }
      function drawForm() {
        var keep = f.tpl === "keep", sl = f.tpl === "slider", cust = sec && !cur;
        form.innerHTML = '<label>Design<select id="hx-tpl">' + (cust ? '<option value="keep"' + (keep ? " selected" : "") + ">Keep current design (" + esc(fam[1]) + ")</option>" : "") + Object.keys(TPL).map(function (k) { return '<option value="' + k + '"' + (f.tpl === k ? " selected" : "") + ">Template: " + TPL[k][0] + "</option>"; }).join("") + "</select></label>" +
          '<p class="muted hx-note">' + (keep ? "Only the words, photo and buttons change; the page keeps its own layout. Fields this design doesn't have are ignored." : esc(TPL[f.tpl][1])) + "</p>" +
          (!keep ? '<label class="hx-chk"><input type="checkbox" id="hx-cr"' + (f.crumbs ? " checked" : "") + "> Show breadcrumb (Home → …)</label>" : "") +
          (sl ? '<label>Change slide every <select id="hx-int">' + [4, 5, 6, 7, 8, 10].map(function (n) { return "<option" + (n === f.interval ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select> seconds</label>" + f.slides.map(function (s, i) { return fieldset(s, i, true); }).join("") + '<button class="btn" id="hx-sadd" style="width:100%">' + ic("plus") + "Add slide</button>" : fieldset(f, 0, false));
        W.fillIcons && W.fillIcons(form); preview();
      }
      function cur0() { return f.tpl === "slider" ? f.slides : [f]; }
      function newHtml() {
        if (f.tpl === "keep") { var d2 = parse(raw), s2 = heroOf(d2), o2 = fields(s2), rr = rawRange(raw, sec); return rr ? raw.slice(0, rr[0]) + applyInPlace(s2, f, o2) + raw.slice(rr[1]) : null; }
        if (f.tpl === "slider") f.slides[0].crumbs = f.crumbs;
        var h = build(f.tpl, f.tpl === "slider" ? Object.assign({}, f, { slides: f.slides }) : f, path);
        if (!sec) { var m = raw.match(/<main\b[^>]*>/i); return m ? raw.replace(m[0], m[0] + "\n" + h) : null; }
        var r2 = rawRange(raw, sec); if (!r2) return null;
        var out = raw.slice(0, r2[0]) + h + raw.slice(r2[1]);
        if (f.tpl !== "slider" || true) { // only one H1 per page: demote any other h1 outside the new hero
          var hd = parse(out), hs = [].slice.call(hd.querySelectorAll("h1")).filter(function (x) { return !x.closest(".wxh"); }); if (hs.length) out = out.replace(/<h1\b(?![^>]*wxh-title)([^>]*)>([\s\S]*?)<\/h1>/gi, '<h2$1>$2</h2>');
        }
        return out;
      }
      var pt;
      function preview() { clearTimeout(pt); pt = setTimeout(function () { var h = newHtml(); if (!h) return; var ifr = $("#hx-if"); if (!ifr) return; ifr.srcdoc = h.replace(/<head(\s[^>]*)?>/i, '<head$1><base href="/' + path.replace(/[^/]*$/, "") + '">').replace(/<script\b[^>]*src="\/assets\/site\.js[^"]*"[^>]*><\/script>/, '<script src="/assets/site.js"></script>'); }, 250); }
      drawForm();
      form.oninput = function (e) { var k = e.target.dataset.k, c = e.target.closest("[data-si]"); if (k && c) { var t = f.tpl === "slider" ? f.slides[+c.dataset.si] : f; t[k] = e.target.value; if (f.tpl === "slider" && +c.dataset.si === 0) f[k] = e.target.value; } if (e.target.id === "hx-int") f.interval = +e.target.value; if (e.target.id === "hx-cr") f.crumbs = e.target.checked; preview(); };
      form.onchange = function (e) { if (e.target.id === "hx-tpl") { f.tpl = e.target.value; if (f.tpl === "slider") f.slides[0] = Object.assign(f.slides[0], { kicker: f.kicker, title: f.title, lead: f.lead, img: f.img, alt: f.alt, b1t: f.b1t, b1h: f.b1h, b2t: f.b2t, b2h: f.b2h }); drawForm(); } else form.oninput(e); };
      form.onclick = function (e) {
        var t = e.target.closest("[data-pk],button"); if (!t) return; var d = t.dataset;
        if (d.pk != null) { W.pickImage(function (u) { var s = cur0()[+d.pk]; s.img = u; if (+d.pk === 0) f.img = u; drawForm(); }); }
        else if (t.id === "hx-sadd") { f.slides.push({ kicker: "", title: "New slide", lead: "", img: f.slides[0].img, alt: "", b1t: "Start your project", b1h: "/contact/", b2t: "", b2h: "" }); drawForm(); }
        else if (d.sup) { var u = +d.sup; f.slides.splice(u - 1, 0, f.slides.splice(u, 1)[0]); drawForm(); }
        else if (d.sdel) { if (f.slides.length < 2) return toast("Keep at least one slide", true); f.slides.splice(+d.sdel, 1); drawForm(); }
      };
      $("#hx-dev").onclick = function (e) { var b = e.target.closest("[data-w]"); if (!b) return; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); $("#hx-if").style.width = b.dataset.w; };
      $("#hx-x").onclick = function () { W.closeModal(); if (mc) mc.style.maxWidth = ""; };
      $("#hx-hist").onclick = function () {
        bapi("backups", { path: path }).then(function (b) { if (!b.ok || !b.backups.length) return toast("No earlier version saved yet", true); if (!confirm("Put back the version saved before the last change? (" + b.backups[0].file.replace(/\.html$/, "") + ")")) return;
          bapi("restore", { path: path, file: b.backups[0].file }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Previous version restored ✓"); W.closeModal(); if (mc) mc.style.maxWidth = ""; done && done(); }); });
      };
      $("#hx-ok").onclick = function () {
        var list = cur0(); if (list.some(function (s) { return !String(s.title || "").trim(); })) return toast("Title is required", true);
        if (f.tpl !== "keep" && f.tpl !== "plain" && f.tpl !== "compact" && list.some(function (s) { return !s.img; })) return toast("This template needs a photo", true);
        var h = newHtml(); if (!h) return toast("Could not find the hero in this page", true);
        var b = this; b.disabled = true;
        bapi("save", { path: path, html: h, mtime: r.mtime }).then(function (x) { b.disabled = false; if (!x.ok) return toast(x.error, true); toast("Hero saved & published ✓"); W.closeModal(); if (mc) mc.style.maxWidth = ""; done && done(); });
      };
    });
  }

  // ---------- 3) templates gallery
  function tplTab(box) {
    var demo = { kicker: "Interior design · Lahore", title: "Spaces shaped by purpose", lead: "Design, build and furniture with one accountable team, from the first sketch to handover.", img: "/assets/img/img-c349a92a4ae0-960.webp", alt: "", b1t: "Start your project", b1h: "#", b2t: "See our work", b2h: "#", crumbs: true };
    box.innerHTML = '<div class="card hx-card"><div class="hx-h"><div><h3>Hero templates</h3><p class="muted">6 designs in the Woodex style. Open <b>All page heroes</b> → Edit hero on any page to use one.</p></div></div><div class="hx-tg">' +
      Object.keys(TPL).map(function (k) { return '<div class="hx-tc"><div class="hx-tf"><iframe loading="lazy" title="' + TPL[k][0] + '" data-k="' + k + '"></iframe></div><b>' + TPL[k][0] + "</b><small class='muted'>" + TPL[k][1] + "</small></div>"; }).join("") + "</div></div>";
    [].forEach.call(box.querySelectorAll("iframe[data-k]"), function (fr) {
      var k = fr.dataset.k, d = k === "slider" ? Object.assign({}, demo, { slides: [demo, Object.assign({}, demo, { title: "Workplaces that work", img: "/assets/img/img-1d6ad6c77d0f-960.webp" })] }) : demo;
      fr.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/site-p21.css"><style>body{margin:0}</style></head><body>' + build(k, d, "services/demo/index.html") + "</body></html>";
    });
  }

  var st = document.createElement("style");
  st.textContent = ".hx-card{padding:20px}.hx-h{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px}.hx-h h3{margin:0 0 2px}.hx-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.hx-tools label{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:13px}.hx-tools select{padding:6px;width:auto}.hx-thumb{align-self:start;height:190px}" +
    ".hx-list{display:grid;gap:14px}.hx-slide{display:grid;grid-template-columns:220px 1fr auto;gap:16px;padding:14px;border:1px solid var(--line,#e4e7ec);border-radius:14px;background:#fff}.hx-slide.off{opacity:.55;background:#f9fafb}" +
    ".hx-thumb,.hx-img{position:relative;border-radius:12px;background:#e5e7eb center/cover;min-height:150px;cursor:pointer;overflow:hidden;display:grid;place-items:center}.hx-thumb span,.hx-img span{background:rgba(12,22,40,.72);color:#fff;font-size:12px;font-weight:600;padding:6px 10px;border-radius:99px;display:inline-flex;gap:6px;align-items:center;opacity:0;transition:.15s}.hx-thumb:hover span,.hx-img:hover span,.hx-img:not([style*='url(\\'/']) span{opacity:1}.hx-thumb b{position:absolute;top:8px;left:8px;background:#0c1628;color:#fff;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px}" +
    ".hx-f label,.hx-mod label{display:block;font-size:12px;font-weight:600;margin:0 0 8px;color:#344054}.hx-f input,.hx-f textarea,.hx-mod input,.hx-mod textarea,.hx-mod select{display:block;width:100%;box-sizing:border-box;margin-top:3px;padding:8px 10px;border:1px solid var(--line,#e4e7ec);border-radius:9px;font:inherit;font-weight:400}.hx-f .g2,.hx-mod .g2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.hx-act{display:flex;flex-direction:column;gap:6px}" +
    ".hx-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.hx-chips button{border:1px solid var(--line,#e4e7ec);background:#fff;border-radius:99px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer}.hx-chips button.on{background:#0c1628;color:#fff;border-color:#0c1628}.hx-chips b{opacity:.6;margin-left:3px}#hx-q{padding:8px 12px;border:1px solid var(--line,#e4e7ec);border-radius:10px;min-width:220px}.hx-tbl{width:100%}.hx-tbl td{vertical-align:middle}" +
    ".hx-mgrid{display:grid;grid-template-columns:380px 1fr;gap:18px;margin-top:10px}#hx-form{max-height:64vh;overflow:auto;padding-right:6px}.hx-fs{border:1px solid var(--line,#e4e7ec);border-radius:12px;padding:12px;margin-bottom:10px}.hx-fs-h{display:flex;justify-content:space-between;margin-bottom:8px}.hx-img{min-height:120px;margin-bottom:10px}.hx-note{font-size:12.5px;margin:-2px 0 10px}.hx-chk{display:flex!important;gap:8px;align-items:center}.hx-chk input{width:auto!important;margin:0!important}" +
    ".hx-pv-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.hx-pv{background:#f2f4f7;border-radius:12px;height:64vh;overflow:hidden;display:flex;justify-content:center}.hx-pv iframe{width:100%;height:100%;border:0;background:#fff;transition:width .2s}.hx-mact{display:flex;gap:8px;margin-top:14px}" +
    ".hx-tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}.hx-tc b{display:block;margin-top:8px}.hx-tf{height:220px;border-radius:12px;overflow:hidden;border:1px solid var(--line,#e4e7ec);position:relative}.hx-tf iframe{width:250%;height:550px;border:0;transform:scale(.4);transform-origin:0 0;pointer-events:none}" +
    "@media(max-width:900px){.hx-slide{grid-template-columns:1fr}.hx-act{flex-direction:row}.hx-mgrid{grid-template-columns:1fr}.hx-pv{height:50vh}}";
  document.head.appendChild(st);
})();
