/* Woodex Admin — P38 SEO upgrade. Adds tabs to the SEO screen (existing "Pages" tab untouched):
   Site audit (health score per page + fix list sorted by impact), Bulk titles & descriptions (with Google preview),
   Internal links (inbound/outbound, orphan pages, link suggestions) and Keyphrases (coverage + pages competing for the same phrase). */
(function () {
  "use strict";
  var W = window.WXA; if (!W || !W.VIEWS.seo) return;
  var esc = W.esc, ic = W.ic, api = W.api, toast = W.toast, $ = W.$;
  var base = W.VIEWS.seo, tab = "pages", C = null; // crawl cache
  var SKIP = /^(404|500|503|coming-soon)\.html$/;
  var ISS = { // id: [label, weight, why, how to fix]
    notitle: ["Missing page title", 10, "Google shows the title as the blue link.", "Add a title in Bulk titles."],
    noh1: ["No main heading (H1)", 10, "The H1 tells Google and visitors what the page is about.", "Add one H1 at the top (Hero slides or Page builder)."],
    broken: ["Links to pages that don't exist", 10, "Broken links waste visits and crawl budget.", "Fix or remove the link in the Page builder."],
    duptitle: ["Same title as another page", 6, "Google may pick only one of the pages.", "Make each title unique."],
    nodesc: ["Missing meta description", 6, "Without it Google writes its own snippet.", "Add one in Bulk titles."],
    dupdesc: ["Same description as another page", 6, "Duplicate snippets lower click-through.", "Write a unique description."],
    multih1: ["More than one H1", 6, "Several H1s blur the page topic.", "Keep one H1; change the others to H2."],
    thin: ["Thin content (under 300 words)", 6, "Short pages rarely rank for competitive searches.", "Add useful detail, FAQs or project examples."],
    orphan: ["No other page links here (orphan)", 6, "Google finds and values pages through internal links.", "Add links from related pages (see Internal links)."],
    cannibal: ["Keyphrase also targeted by another page", 6, "Two pages compete with each other for one search.", "Give each page its own keyphrase."],
    titlelen: ["Title length outside 30–60", 3, "Long titles are cut off; short ones waste space.", "Aim for 50–60 characters."],
    desclen: ["Description length outside 120–160", 3, "Too long is cut; too short undersells the page.", "Aim for 140–160 characters."],
    noalt: ["Images without alt text", 3, "Alt text helps image search and screen readers.", "Describe each photo in the Media library or builder."],
    nocanon: ["No canonical link", 3, "Canonical prevents duplicate-URL confusion.", "Set it in the page settings (All pages → Edit)."],
    kwmiss: ["Keyphrase not in title or H1", 3, "Google weights the title and H1 most.", "Use the keyphrase near the start of the title."],
    noog: ["No social share image", 1, "Shares on WhatsApp/Facebook show a blank card.", "Pick an og:image in page settings."],
    noschema: ["No structured data", 1, "Schema can earn rich results in Google.", "Add schema in SEO → page → Schema."],
    fewlinks: ["Fewer than 3 links to other pages", 1, "Internal links pass value and keep visitors moving.", "Link to related services and articles."]
  };
  function norm(href, from) {
    try { var u = new URL(href, location.origin + "/" + from.replace(/[^/]*$/, "")); if (u.origin !== location.origin) return null; var p = u.pathname; if (/\.(webp|jpe?g|png|svg|pdf|xml|txt|css|js)$/i.test(p)) return null; if (!/\.html$/.test(p) && !/\/$/.test(p)) p += "/"; return p.replace(/index\.html$/, ""); } catch (e) { return null; }
  }
  function crawl(onProg) {
    return Promise.all([api("pages_list"), api("seo_list")]).then(function (rs) {
      var pages = (rs[0].pages || []).filter(function (p) { return !SKIP.test(p.path); }), seo = (rs[1] && rs[1].pages) || {}, out = [], todo = pages.slice(), done = 0;
      function one() {
        var p = todo.shift(); if (!p) return Promise.resolve();
        return fetch(p.url, { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (h) {
          var d = new DOMParser().parseFromString(h, "text/html"), m = d.querySelector("main") || d.body;
          [].forEach.call(m.querySelectorAll("script,style,noscript"), function (x) { x.remove(); });
          var txt = (m.textContent || "").replace(/\s+/g, " ").trim(), links = {};
          [].forEach.call(m.querySelectorAll("a[href]"), function (a) { var n = norm(a.getAttribute("href"), p.path); if (n) links[n] = 1; });
          out.push({ p: p, kw: (seo[p.path] || {}).kw || "", title: (d.title || "").trim(), desc: ((d.querySelector('meta[name="description"]') || {}).content || "").trim(),
            h1: [].map.call(m.querySelectorAll("h1"), function (x) { return x.textContent.trim(); }), noalt: [].filter.call(m.querySelectorAll("img"), function (i) { return !i.hasAttribute("alt"); }).length,
            words: (txt.match(/[A-Za-z\u0600-\u06FF][\w'-]*/g) || []).length, text: txt.toLowerCase(), canon: !!d.querySelector('link[rel="canonical"]'), og: !!d.querySelector('meta[property="og:image"]'),
            schema: d.querySelectorAll('script[type="application/ld+json"]').length > 0, noindex: /noindex/i.test(((d.querySelector('meta[name="robots"]') || {}).content || "")) || p.noindex, links: Object.keys(links) });
        }).catch(function () {}).then(function () { done++; onProg && onProg(done, pages.length); return one(); });
      }
      return Promise.all([one(), one(), one(), one(), one(), one()]).then(function () { return analyse(out); });
    });
  }
  function analyse(R) {
    var urls = {}, inb = {}, byT = {}, byD = {}, byK = {};
    R.forEach(function (r) { urls[r.p.url] = r; inb[r.p.url] = []; });
    R.forEach(function (r) {
      r.links.forEach(function (l) { if (inb[l] && l !== r.p.url) inb[l].push(r.p.url); });
      if (r.title) (byT[r.title.toLowerCase()] = byT[r.title.toLowerCase()] || []).push(r);
      if (r.desc) (byD[r.desc.toLowerCase()] = byD[r.desc.toLowerCase()] || []).push(r);
      if (r.kw) (byK[r.kw.toLowerCase()] = byK[r.kw.toLowerCase()] || []).push(r);
    });
    R.forEach(function (r) {
      var I = [], idx = !r.noindex;
      r.broken = r.links.filter(function (l) { return !urls[l] && !/^\/(assets|api|admin|builder)\//.test(l) && !/\.html$/.test(l); });
      if (!r.title) I.push("notitle"); else if (r.title.length < 30 || r.title.length > 60) I.push("titlelen");
      if (!r.h1.length) I.push("noh1"); else if (r.h1.length > 1) I.push("multih1");
      if (r.broken.length) I.push("broken");
      if (idx && r.title && byT[r.title.toLowerCase()].filter(function (x) { return !x.noindex; }).length > 1) I.push("duptitle");
      if (!r.desc) I.push("nodesc"); else { if (r.desc.length < 120 || r.desc.length > 160) I.push("desclen"); if (idx && byD[r.desc.toLowerCase()].length > 1) I.push("dupdesc"); }
      if (r.words < 300) I.push("thin");
      r.inb = inb[r.p.url]; if (idx && r.p.url !== "/" && !r.inb.length) I.push("orphan");
      if (r.kw && byK[r.kw.toLowerCase()].length > 1) I.push("cannibal");
      if (r.noalt) I.push("noalt"); if (!r.canon) I.push("nocanon");
      if (r.kw && (r.title + " " + r.h1.join(" ")).toLowerCase().indexOf(r.kw.toLowerCase()) < 0) I.push("kwmiss");
      if (!r.og) I.push("noog"); if (!r.schema) I.push("noschema");
      if (r.links.filter(function (l) { return urls[l] && l !== r.p.url; }).length < 3) I.push("fewlinks");
      r.iss = I; r.score = Math.max(0, 100 - I.reduce(function (a, k) { return a + ISS[k][1]; }, 0));
    });
    // link suggestions: page S mentions T's keyphrase (or short H1) but does not link to T
    R.forEach(function (t) {
      var term = (t.kw || (t.h1[0] && t.h1[0].length < 40 ? t.h1[0] : "")).toLowerCase().replace(/\s+in lahore$/, "").trim(); t.sug = [];
      if (term.length < 5 || t.noindex) return;
      R.forEach(function (s) { if (s !== t && !s.noindex && s.links.indexOf(t.p.url) < 0 && s.text.indexOf(term) > -1) t.sug.push(s); });
      t.sug.sort(function (a, b) { return b.words - a.words; }); t.term = term;
    });
    var avg = R.length ? Math.round(R.reduce(function (a, r) { return a + r.score; }, 0) / R.length) : 0;
    return { R: R.sort(function (a, b) { return a.score - b.score; }), avg: avg, at: new Date(), byK: byK };
  }
  function dot(n) { var c = n >= 80 ? "#12b76a" : n >= 60 ? "#f79009" : "#f04438"; return '<span class="s8-sc" style="--c:' + c + '">' + n + "</span>"; }
  function short(u) { return u === "/" ? "Home" : u.replace(/^\/|\/$/g, ""); }

  W.VIEWS.seo = function (el, parts) {
    if (parts && parts.length) return base(el, parts);
    if (tab === "pages") { base(el, parts); var put = function () { var ph = el.querySelector(".ph"); if (!ph) return false; if (!el.querySelector(".s8-tabs")) ph.insertAdjacentHTML("afterend", tabs()); bind(el); return true; }; if (!put()) setTimeout(put, 400); setTimeout(put, 1200); return; }
    el.innerHTML = W.head("SEO", "SEO", '<button class="btn" id="s8-re">' + ic("refresh-cw") + "Re-check all pages</button>") + tabs() + '<div id="s8"><div class="card" style="padding:24px"><b>Checking every page…</b> <span id="s8-p"></span><div class="s8-bar"><i id="s8-pb"></i></div></div></div>';
    W.fillIcons && W.fillIcons(el); bind(el);
    $("#s8-re").onclick = function () { C = null; W.VIEWS.seo(el, []); };
    (C ? Promise.resolve(C) : crawl(function (d, n) { var p = $("#s8-p"), b = $("#s8-pb"); if (p) p.textContent = d + " / " + n; if (b) b.style.width = (100 * d / n) + "%"; })).then(function (c) { C = c; if (!$("#s8")) return; ({ audit: audit, bulk: bulk, links: links, kw: kws })[tab]($("#s8"), el); });
  };
  function tabs() { return '<div class="seg s8-tabs">' + [["pages", "Pages & scores"], ["audit", "Site audit"], ["bulk", "Bulk titles & descriptions"], ["links", "Internal links"], ["kw", "Keyphrases"]].map(function (t) { return '<button data-s8="' + t[0] + '"' + (tab === t[0] ? ' class="on"' : "") + ">" + t[1] + "</button>"; }).join("") + "</div>"; }
  function bind(el) { var t = el.querySelector(".s8-tabs"); if (t) t.onclick = function (e) { var b = e.target.closest("[data-s8]"); if (b && b.dataset.s8 !== tab) { tab = b.dataset.s8; W.VIEWS.seo(el, []); } }; }

  // ---- Site audit
  function audit(box) {
    var R = C.R, cnt = {}; R.forEach(function (r) { r.iss.forEach(function (k) { (cnt[k] = cnt[k] || []).push(r); }); });
    var fixes = Object.keys(cnt).sort(function (a, b) { return ISS[b][1] * cnt[b].length - ISS[a][1] * cnt[a].length; });
    var crit = fixes.filter(function (k) { return ISS[k][1] >= 10; }).reduce(function (a, k) { return a + cnt[k].length; }, 0), good = R.filter(function (r) { return r.score >= 80; }).length;
    box.innerHTML = '<div class="s8-k"><div class="card"><small>Site health</small><b>' + dot(C.avg) + '</b><em>average of ' + R.length + ' pages</em></div><div class="card"><small>Healthy pages (80+)</small><b>' + good + " / " + R.length + '</b><em>' + Math.round(100 * good / Math.max(1, R.length)) + '%</em></div><div class="card"><small>Critical problems</small><b class="' + (crit ? "bad" : "") + '">' + crit + '</b><em>missing title / H1, broken links</em></div><div class="card"><small>Checked</small><b style="font-size:18px">' + C.at.toLocaleTimeString() + "</b><em>" + C.at.toLocaleDateString() + "</em></div></div>" +
      '<div class="card s8-c"><h3>Fix list <small class="muted">sorted by impact (weight × pages affected)</small></h3>' + (fixes.length ? fixes.map(function (k) {
        var I = ISS[k], L = cnt[k], lvl = I[1] >= 10 ? ["Critical", "c"] : I[1] >= 6 ? ["High", "h"] : I[1] >= 3 ? ["Medium", "m"] : ["Low", "l"];
        return '<details class="s8-fx"><summary><span class="s8-lv ' + lvl[1] + '">' + lvl[0] + "</span><b>" + esc(I[0]) + '</b><span class="s8-n">' + L.length + " page" + (L.length > 1 ? "s" : "") + '</span></summary><p class="muted"><b>Why:</b> ' + esc(I[2]) + " <b>Fix:</b> " + esc(I[3]) + "</p><ul>" +
          L.slice(0, 60).map(function (r) { return '<li><a href="#/seo/' + encodeURIComponent(r.p.path) + '">' + esc(short(r.p.url)) + "</a>" + (k === "broken" ? ' <small class="bad">→ ' + esc(r.broken.slice(0, 3).join(", ")) + "</small>" : k === "titlelen" ? " <small>(" + r.title.length + ")</small>" : k === "desclen" ? " <small>(" + r.desc.length + ")</small>" : k === "thin" ? " <small>(" + r.words + " words)</small>" : k === "noalt" ? " <small>(" + r.noalt + ")</small>" : k === "cannibal" ? " <small>“" + esc(r.kw) + "”</small>" : "") + ' <a class="s8-b" href="#/builder/' + encodeURIComponent(r.p.path) + '">builder</a></li>'; }).join("") + "</ul></details>";
      }).join("") : "<p>No problems found 🎉</p>") + "</div>" +
      '<div class="card s8-c"><h3>Health score per page <small class="muted">lowest first</small></h3><div class="s8-tw"><table class="tbl"><thead><tr><th>Page</th><th>Score</th><th>Problems</th><th>Words</th><th>Links in</th></tr></thead><tbody>' +
      R.map(function (r) { return '<tr><td><a href="#/seo/' + encodeURIComponent(r.p.path) + '"><b>' + esc(short(r.p.url)) + "</b></a><br><small class='muted'>" + esc(r.title) + "</small></td><td>" + dot(r.score) + "</td><td>" + r.iss.map(function (k) { return '<span class="s8-tag">' + esc(ISS[k][0]) + "</span>"; }).join("") + "</td><td>" + r.words + "</td><td>" + r.inb.length + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  }

  // ---- Bulk titles & descriptions
  function bulk(box, el) {
    var R = C.R.slice().sort(function (a, b) { return a.p.url.localeCompare(b.p.url); }), ch = {}, f = "all";
    function cls(n, lo, hi) { return n >= lo && n <= hi ? "ok" : "bad"; }
    function draw() {
      var L = R.filter(function (r) { return f === "all" || f === "bad" && (r.iss.indexOf("titlelen") > -1 || r.iss.indexOf("desclen") > -1 || r.iss.indexOf("nodesc") > -1 || r.iss.indexOf("duptitle") > -1 || r.iss.indexOf("dupdesc") > -1); });
      box.innerHTML = '<div class="card s8-c"><div class="s8-bh"><div><h3>Bulk titles & descriptions</h3><p class="muted">Edit many pages at once. Title 30–60 characters, description 120–160. Click a row to see the Google preview.</p></div><div style="display:flex;gap:8px;align-items:center"><span class="seg" id="s8-bf"><button data-f="all"' + (f === "all" ? ' class="on"' : "") + '>All pages</button><button data-f="bad"' + (f === "bad" ? ' class="on"' : "") + '>Needs work</button></span><button class="btn pri" id="s8-bs"' + (Object.keys(ch).length ? "" : " disabled") + ">" + ic("check") + "Save " + Object.keys(ch).length + " change" + (Object.keys(ch).length === 1 ? "" : "s") + "</button></div></div>" +
        '<div class="s8-tw"><table class="tbl s8-bt"><thead><tr><th style="width:18%">Page</th><th>Title</th><th>Description</th></tr></thead><tbody>' +
        L.map(function (r) { var c = ch[r.p.path] || {}, t = c.title != null ? c.title : r.title, d = c.desc != null ? c.desc : r.desc;
          return '<tr data-p="' + esc(r.p.path) + '"' + (ch[r.p.path] ? ' class="chg"' : "") + "><td><b>" + esc(short(r.p.url)) + '</b></td><td><textarea rows="2" data-k="title">' + esc(t) + '</textarea><small class="' + cls(t.length, 30, 60) + '">' + t.length + '/60</small></td><td><textarea rows="2" data-k="desc">' + esc(d) + '</textarea><small class="' + cls(d.length, 120, 160) + '">' + d.length + "/160</small></td></tr>" +
            '<tr class="s8-pvr" hidden><td></td><td colspan="2"><div class="s8-serp"><small>woodex.com.pk › ' + esc(short(r.p.url)) + "</small><b>" + esc(t.length > 60 ? t.slice(0, 58) + "…" : t) + "</b><p>" + esc(d.length > 160 ? d.slice(0, 157) + "…" : d) + "</p></div></td></tr>"; }).join("") + "</tbody></table></div></div>";
      W.fillIcons && W.fillIcons(box);
    }
    draw();
    box.oninput = function (e) { var k = e.target.dataset.k, tr = e.target.closest("tr[data-p]"); if (!k || !tr) return; var p = tr.dataset.p, r = R.filter(function (x) { return x.p.path === p; })[0]; ch[p] = ch[p] || {}; ch[p][k] = e.target.value;
      if ((ch[p].title == null || ch[p].title === r.title) && (ch[p].desc == null || ch[p].desc === r.desc)) delete ch[p];
      var n = e.target.value.length, s = e.target.nextElementSibling; s.textContent = n + (k === "title" ? "/60" : "/160"); s.className = k === "title" ? cls(n, 30, 60) : cls(n, 120, 160); tr.classList.toggle("chg", !!ch[p]);
      var pv = tr.nextElementSibling, t = tr.querySelector('[data-k="title"]').value, d = tr.querySelector('[data-k="desc"]').value; pv.hidden = false; pv.querySelector("b").textContent = t.length > 60 ? t.slice(0, 58) + "…" : t; pv.querySelector("p").textContent = d.length > 160 ? d.slice(0, 157) + "…" : d;
      var b = $("#s8-bs"), m = Object.keys(ch).length; b.disabled = !m; b.lastChild.textContent = "Save " + m + " change" + (m === 1 ? "" : "s"); };
    box.onfocusin = function (e) { var tr = e.target.closest("tr[data-p]"); [].forEach.call(box.querySelectorAll(".s8-pvr"), function (x) { x.hidden = !tr || x !== tr.nextElementSibling; }); };
    box.onclick = function (e) {
      var fb = e.target.closest("[data-f]"); if (fb) { f = fb.dataset.f; draw(); return; }
      if (!e.target.closest("#s8-bs")) return; var keys = Object.keys(ch), btn = $("#s8-bs"), ok = 0, bad = [];
      if (keys.some(function (k) { var r = R.filter(function (x) { return x.p.path === k; })[0]; return !String(ch[k].title != null ? ch[k].title : r.title).trim(); })) return toast("A title cannot be empty", true);
      btn.disabled = true;
      keys.reduce(function (pr, k) { return pr.then(function () { var r = R.filter(function (x) { return x.p.path === k; })[0], p = r.p;
        return api("page_meta_save", { path: p.path, title: (ch[k].title != null ? ch[k].title : r.title).trim(), description: (ch[k].desc != null ? ch[k].desc : r.desc).trim(), status: p.status || "published", canonical: p.canonical || "", ogImage: p.ogImage || "", noindex: !!p.noindex })
          .then(function (x) { if (x.ok) { ok++; if (ch[k].title != null) r.title = ch[k].title.trim(); if (ch[k].desc != null) r.desc = ch[k].desc.trim(); delete ch[k]; } else bad.push(short(p.url) + ": " + x.error); }); }); }, Promise.resolve())
        .then(function () { C = analyse(C.R); toast(ok + " page" + (ok === 1 ? "" : "s") + " saved ✓" + (bad.length ? " · " + bad.length + " failed: " + bad[0] : ""), !!bad.length); R = C.R.slice().sort(function (a, b) { return a.p.url.localeCompare(b.p.url); }); draw(); });
    };
  }

  // ---- Internal links
  function links(box) {
    var R = C.R.filter(function (r) { return !r.noindex; }).slice().sort(function (a, b) { return a.inb.length - b.inb.length; });
    var orph = R.filter(function (r) { return !r.inb.length && r.p.url !== "/"; }), sugN = R.reduce(function (a, r) { return a + Math.min(3, r.sug.length); }, 0);
    box.innerHTML = '<div class="s8-k"><div class="card"><small>Orphan pages</small><b class="' + (orph.length ? "bad" : "") + '">' + orph.length + '</b><em>no page links to them</em></div><div class="card"><small>Link suggestions</small><b>' + sugN + '</b><em>pages already mention the topic</em></div><div class="card"><small>Average links in</small><b>' + (R.reduce(function (a, r) { return a + r.inb.length; }, 0) / Math.max(1, R.length)).toFixed(1) + "</b><em>per page</em></div></div>" +
      '<div class="card s8-c"><h3>Links per page <small class="muted">fewest links in first · suggestions = pages that mention this page\'s topic but don\'t link to it yet</small></h3><div class="s8-tw"><table class="tbl"><thead><tr><th>Page</th><th>Links in</th><th>Links out</th><th>Add a link to it from…</th></tr></thead><tbody>' +
      R.map(function (r) { var out = r.links.filter(function (l) { return l !== r.p.url && C.R.some(function (x) { return x.p.url === l; }); }).length;
        return "<tr><td><b>" + esc(short(r.p.url)) + "</b>" + (r.term ? "<br><small class='muted'>topic: “" + esc(r.term) + "”</small>" : "") + "</td><td>" + (r.inb.length ? r.inb.length : '<span class="s8-lv c">0 · orphan</span>') + "</td><td>" + out + "</td><td>" +
          (r.sug.length ? r.sug.slice(0, 3).map(function (s) { return '<a class="s8-sg" href="#/builder/' + encodeURIComponent(s.p.path) + '" title="Open ' + esc(short(s.p.url)) + ' in the builder and link the words “' + esc(r.term) + '” to ' + esc(r.p.url) + '">' + esc(short(s.p.url)) + " →</a>"; }).join("") + (r.sug.length > 3 ? '<small class="muted"> +' + (r.sug.length - 3) + " more</small>" : "") : '<span class="muted">—</span>') + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  }

  // ---- Keyphrases
  function kws(box) {
    var R = C.R.filter(function (r) { return !r.noindex; }).slice().sort(function (a, b) { return (a.kw ? 1 : 0) - (b.kw ? 1 : 0) || a.p.url.localeCompare(b.p.url); });
    var has = function (r, s) { return r.kw && s.toLowerCase().indexOf(r.kw.toLowerCase()) > -1; }, withKw = R.filter(function (r) { return r.kw; }).length, comp = Object.keys(C.byK).filter(function (k) { return C.byK[k].length > 1; });
    box.innerHTML = '<div class="s8-k"><div class="card"><small>Pages with a keyphrase</small><b>' + withKw + " / " + R.length + '</b><em>set in SEO → page</em></div><div class="card"><small>Competing keyphrases</small><b class="' + (comp.length ? "bad" : "") + '">' + comp.length + '</b><em>' + (comp.length ? esc(comp.slice(0, 2).join(", ")) : "none") + '</em></div><div class="card"><small>Rankings</small><b style="font-size:15px">Search Console</b><em><a href="#/settings">Connect Google</a> to see real positions</em></div></div>' +
      '<div class="card s8-c"><h3>Keyphrase coverage <small class="muted">✓ = the phrase appears there</small></h3><div class="s8-tw"><table class="tbl s8-kt"><thead><tr><th>Page</th><th>Focus keyphrase</th><th>Title</th><th>H1</th><th>Description</th><th>URL</th><th>In text</th><th></th></tr></thead><tbody>' +
      R.map(function (r) { var y = function (b) { return b ? '<span class="okc">✓</span>' : '<span class="bad">✗</span>'; }, slug = r.kw ? r.p.url.indexOf(r.kw.toLowerCase().replace(/\s+/g, "-")) > -1 : false, n = r.kw ? r.text.split(r.kw.toLowerCase()).length - 1 : 0;
        return "<tr><td><b>" + esc(short(r.p.url)) + "</b></td><td>" + (r.kw ? esc(r.kw) + (C.byK[r.kw.toLowerCase()].length > 1 ? ' <span class="s8-lv h">shared</span>' : "") : '<span class="muted">Not set</span>') + "</td>" +
          (r.kw ? "<td>" + y(has(r, r.title)) + "</td><td>" + y(has(r, r.h1.join(" "))) + "</td><td>" + y(has(r, r.desc)) + "</td><td>" + y(slug) + "</td><td>" + n + "×</td>" : '<td colspan="5" class="muted">—</td>') + '<td><a class="btn sm" href="#/seo/' + encodeURIComponent(r.p.path) + '">' + (r.kw ? "Edit" : "Set") + "</a></td></tr>"; }).join("") + "</tbody></table></div></div>";
  }

  var st = document.createElement("style");
  st.textContent = ".s8-tabs{margin:0 0 16px;flex-wrap:wrap}.s8-bar{height:6px;background:#eef2f6;border-radius:6px;margin-top:12px;overflow:hidden}.s8-bar i{display:block;height:100%;width:0;background:#0c1628;transition:width .2s}" +
    ".s8-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px}.s8-k .card{padding:16px}.s8-k small{display:block;color:#667085;font-weight:600;font-size:12px}.s8-k b{display:block;font-size:26px;margin:6px 0 2px}.s8-k b.bad{color:#d92d20}.s8-k em{font-style:normal;font-size:12px;color:#667085}" +
    ".s8-sc{display:inline-grid;place-items:center;min-width:38px;height:26px;padding:0 6px;border-radius:99px;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c);font-weight:800;font-size:13px}.s8-k .s8-sc{font-size:22px;height:40px;min-width:60px}" +
    ".s8-c{padding:18px;margin-bottom:16px}.s8-c h3{margin:0 0 12px;font-size:15px}.s8-fx{border:1px solid var(--line,#e4e7ec);border-radius:10px;margin-bottom:8px}.s8-fx summary{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer}.s8-fx p,.s8-fx ul{margin:0 12px 10px;font-size:13px}.s8-fx ul{columns:3 220px;padding-left:18px}.s8-fx li{margin-bottom:4px}.s8-n{margin-left:auto;font-size:12px;color:#667085}.s8-b{font-size:11px;color:#98a2b3}" +
    ".s8-lv{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em}.s8-lv.c{background:#fee4e2;color:#b42318}.s8-lv.h{background:#ffead5;color:#b93815}.s8-lv.m{background:#fef7c3;color:#854a0e}.s8-lv.l{background:#f2f4f7;color:#475467}" +
    ".s8-tag{display:inline-block;font-size:11px;background:#f2f4f7;border-radius:6px;padding:2px 6px;margin:0 4px 4px 0}.s8-tw{overflow:auto;max-height:70vh}.s8-tw thead th{position:sticky;top:0;background:#fff;z-index:1}" +
    ".s8-bh{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}.s8-bh h3{margin:0}.s8-bt textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--line,#e4e7ec);border-radius:8px;font:inherit;font-size:13px;resize:vertical}.s8-bt small{font-size:11px;font-weight:700}.s8-bt small.ok,.okc{color:#067647}.s8-bt small.bad,.bad{color:#d92d20}.s8-bt tr.chg td{background:#fffbeb}" +
    ".s8-serp{max-width:600px;font-family:arial,sans-serif;padding:8px 0}.s8-serp small{color:#202124;font-size:12px}.s8-serp b{display:block;color:#1a0dab;font-size:18px;font-weight:400;margin:2px 0}.s8-serp p{margin:0;color:#4d5156;font-size:13.5px;line-height:1.5}" +
    ".s8-sg{display:inline-block;font-size:12px;border:1px solid var(--line,#e4e7ec);border-radius:99px;padding:3px 9px;margin:0 4px 4px 0;text-decoration:none}.s8-sg:hover{border-color:#b8956a}.s8-kt td{text-align:center}.s8-kt td:first-child,.s8-kt td:nth-child(2){text-align:left}";
  document.head.appendChild(st);
})();
