/* Phase 13: SEO manager (Yoast-style) — list with scores, per-page editor, AI suggestions, schema, sitemap, robots.txt */
(function () {
  var W = window.WXA; if (!W || !window.WXSEO) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, X = window.WXSEO;
  var css = document.createElement("style");
  css.textContent = ".so-top{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}@media(max-width:900px){.so-top{grid-template-columns:repeat(2,1fr)}}.so-k{padding:14px 16px}.so-k b{font-size:22px;display:block}.so-k small{color:#6b7280}" +
    ".so-t{width:100%;border-collapse:collapse;font-size:13.5px}.so-t th,.so-t td{padding:9px 10px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left;vertical-align:middle}.so-t tr:hover td{background:var(--soft,#f9fafb)}.so-t td.u a{font-weight:600}.so-t small{color:#6b7280}" +
    ".so-f{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.so-f button{border:1px solid var(--line,#e5e7eb);background:var(--card,#fff);color:inherit;border-radius:999px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer}.so-f button.on{background:#0c1628;color:#fff}" +
    ".so-e{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:18px;align-items:start}@media(max-width:1150px){.so-e{grid-template-columns:1fr}}.so-e label{display:block;margin-bottom:12px}.so-bar{height:5px;border-radius:3px;background:#e5e7eb;margin-top:4px;overflow:hidden}.so-bar i{display:block;height:100%}" +
    ".so-rel{display:grid;grid-template-columns:1fr 1fr;gap:8px}.so-sc{display:flex;flex-wrap:wrap;gap:8px}.so-sc label{display:flex;gap:6px;align-items:center;margin:0;border:1px solid var(--line,#e5e7eb);border-radius:8px;padding:6px 10px;font-size:13px}.so-sc em{font-style:normal;font-size:11px;color:#15803d}" +
    ".so-side{position:sticky;top:84px}";
  document.head.appendChild(css);
  var fetchHtml = function (url) { return fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + "seo=" + Date.now(), { credentials: "same-origin" }).then(function (r) { return r.text(); }); };
  var dot = function (s) { return s == null ? '<span class="muted">–</span>' : '<span class="sx-dot sx-' + X.color(s) + '"></span> ' + s; };

  // ------------------------------------------------------------------ list
  W.VIEWS.seo = function (el, parts) {
    if (parts && parts.length) return editor(el, decodeURIComponent(parts.join("/")));
    el.innerHTML = W.head("SEO", "SEO", '<input type="search" id="so-q" placeholder="Search pages…"><button class="btn" id="so-all">' + ic("refresh-cw") + "Analyse all</button>") + '<div class="card" style="padding:18px">Loading…</div>';
    W.fillIcons(el);
    Promise.all([api("pages_list"), api("seo_list")]).then(function (rs) {
      var P = rs[0], S = rs[1]; if (!P.ok || !S.ok) { el.querySelector(".card").textContent = (P.error || S.error); return; }
      var pages = P.pages.filter(function (p) { return p.path !== "404.html"; }), seo = S.pages || {}, filt = "all";
      var withKw = pages.filter(function (p) { return seo[p.path] && seo[p.path].kw; }).length;
      var sc = pages.map(function (p) { return (seo[p.path] || {}).seo; }).filter(function (x) { return x != null; });
      var avg = sc.length ? Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / sc.length) : null;
      el.querySelector(".card").outerHTML =
        '<div class="so-top"><div class="card so-k"><small>Average SEO score</small><b>' + (avg == null ? "–" : dot(avg)) + '</b></div><div class="card so-k"><small>Pages with a focus keyphrase</small><b>' + withKw + " / " + pages.length + "</b></div>" +
        '<div class="card so-k"><small>Pages in sitemap.xml</small><b>' + S.sitemap + '</b><button class="btn sm" id="so-sm" style="margin-top:6px">' + ic("refresh-cw") + 'Rebuild</button> <a class="btn sm" href="/sitemap.xml" target="_blank" style="margin-top:6px">View</a></div>' +
        '<div class="card so-k"><small>Broken links (last health scan)</small><b class="' + (S.broken ? "bad" : "") + '">' + (S.scanAt ? S.broken : "–") + '</b><a class="btn sm" href="#/health" style="margin-top:6px">' + ic("link") + (S.scanAt ? "View" : "Run scan") + "</a></div></div>" +
        '<div class="card" style="padding:16px"><div class="so-f">' + [["all", "All"], ["bad", "Needs work"], ["nokw", "No keyphrase"], ["good", "Good"]].map(function (f, i) { return '<button data-f="' + f[0] + '"' + (i ? "" : ' class="on"') + ">" + f[1] + "</button>"; }).join("") + "</div>" +
        '<div style="overflow:auto"><table class="so-t"><thead><tr><th>Page</th><th>Focus keyphrase</th><th>SEO</th><th>Readability</th><th>Title / description</th><th></th></tr></thead><tbody id="so-b"></tbody></table></div></div>' +
        '<div class="card" style="padding:16px;margin-top:16px"><h3 style="margin:0 0 8px;font-size:15px">robots.txt</h3><textarea id="so-rb" rows="7" style="font-family:monospace;font-size:13px">' + esc(S.robots) + '</textarea><button class="btn sm" id="so-rbs" style="margin-top:8px">Save robots.txt</button> <small class="muted">Redirects are managed in <a href="#/redirects">Pages → Redirects</a>.</small></div>';
      W.fillIcons(el);
      function draw() {
        var q = ($("#so-q").value || "").toLowerCase();
        $("#so-b").innerHTML = pages.filter(function (p) {
          var s = seo[p.path] || {}; if (q && (p.url + " " + p.title + " " + (s.kw || "")).toLowerCase().indexOf(q) < 0) return false;
          if (filt === "nokw") return !s.kw; if (filt === "bad") return s.seo == null || s.seo < 70; if (filt === "good") return s.seo >= 70; return true;
        }).map(function (p) {
          var s = seo[p.path] || {}, tl = (p.title || "").length, dl = (p.description || "").length;
          return '<tr><td class="u"><a href="#/seo/' + encodeURIComponent(p.path) + '">' + esc(p.url) + "</a><br><small>" + esc(p.title || "(no title)") + "</small></td><td>" + (s.kw ? esc(s.kw) : '<span class="muted">Not set</span>') + (s.related && s.related.length ? '<br><small>+' + s.related.length + " related</small>" : "") + "</td><td>" + dot(s.seo) + "</td><td>" + dot(s.read) + "</td>" +
            '<td><small class="' + (tl >= 30 && tl <= 60 ? "okc" : "bad") + '">Title ' + tl + '</small> · <small class="' + (dl >= 120 && dl <= 160 ? "okc" : "bad") + '">Desc ' + dl + "</small>" + (p.noindex ? ' · <small class="bad">noindex</small>' : "") + '</td><td><a class="btn sm" href="#/seo/' + encodeURIComponent(p.path) + '">Edit</a></td></tr>';
        }).join("") || '<tr><td colspan="6" class="muted">No pages match.</td></tr>';
      }
      draw(); $("#so-q").oninput = draw;
      $$(".so-f button", el).forEach(function (b) { b.onclick = function () { filt = b.dataset.f; $$(".so-f button", el).forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); }; });
      $("#so-sm").onclick = function () { api("seo_sitemap").then(function (r) { if (!r.ok) return toast(r.error, true); toast("Sitemap rebuilt: " + r.count + " pages ✓"); W.VIEWS.seo(el, []); }); };
      $("#so-rbs").onclick = function () { api("seo_robots_save", { text: $("#so-rb").value }).then(function (r) { toast(r.ok ? "robots.txt saved ✓" : r.error, !r.ok); }); };
      $("#so-all").onclick = function () {
        var b = this, todo = pages.slice(), out = {}, n = 0; b.disabled = true;
        function next() {
          var p = todo.shift(); if (!p) return;
          return fetchHtml(p.url).then(function (h) { var s = seo[p.path] || {}, r = X.analyze(h, { kw: s.kw, related: s.related, url: p.url }); out[p.path] = { seo: r.seo.score, read: r.read.score }; seo[p.path] = Object.assign(s, out[p.path]); }).catch(function () {}).then(function () { n++; b.textContent = "Analysing " + n + "/" + pages.length; return next(); });
        }
        Promise.all([next(), next(), next(), next(), next(), next()]).then(function () { return api("seo_scores", { scores: out }); }).then(function () { toast("Analysed " + n + " pages ✓"); W.VIEWS.seo(el, []); });
      };
    });
  };

  // ------------------------------------------------------------------ editor
  function editor(el, rel) {
    el.innerHTML = W.head("SEO", "SEO", '<a class="btn" href="#/seo">' + ic("chevron-left") + 'All pages</a><button class="btn pri" id="se-save">' + ic("check") + "Save</button>") + '<div class="card" style="padding:18px">Loading…</div>';
    W.fillIcons(el);
    Promise.all([api("pages_list"), api("seo_page", { path: rel }), api("seo_list")]).then(function (rs) {
      var p = (rs[0].pages || []).filter(function (x) { return x.path === rel; })[0], sp = rs[1], L = rs[2]; if (!p || !sp.ok) { el.querySelector(".card").textContent = sp.error || "Page not found"; return; }
      var s = sp.seo || {}, rel4 = (s.related || []).concat(["", "", "", ""]).slice(0, 4), html = "";
      var sch = s.schema || sp.managed || [];
      el.querySelector(".card").outerHTML = '<div class="so-e"><div class="card" style="padding:18px"><h3 style="margin:0 0 4px">' + esc(p.url) + '</h3><p class="muted" style="margin:0 0 14px"><a href="' + esc(p.url) + '" target="_blank">Open page</a> · <a href="#/builder">Edit content in builder</a></p>' +
        '<label>Focus keyphrase<input id="se-kw" value="' + esc(s.kw || "") + '" placeholder="e.g. office renovation in Lahore"></label>' +
        '<label style="margin-bottom:4px">Related keyphrases <small class="muted">(up to 4)</small></label><div class="so-rel" style="margin-bottom:12px">' + rel4.map(function (r, i) { return '<input class="se-r" value="' + esc(r) + '" placeholder="Related ' + (i + 1) + '">'; }).join("") + "</div>" +
        '<button class="btn sm" id="se-ai" style="margin-bottom:14px"' + (L.aiReady ? "" : ' title="Add an AI key in Blog & insights → AI settings"') + ">" + ic("sparkles") + "Suggest with AI</button>" +
        '<label>SEO title<input id="se-t" value="' + esc(p.title) + '"><div class="so-bar"><i id="se-tb"></i></div></label>' +
        '<label>Meta description<textarea id="se-d" rows="3">' + esc(p.description) + '</textarea><div class="so-bar"><i id="se-db"></i></div></label>' +
        '<label>Social share image (og:image)<input id="se-og" value="' + esc(p.ogImage || "") + '" placeholder="/assets/images/…jpg"></label>' +
        '<label>Canonical URL <small class="muted">(leave empty unless this page copies another)</small><input id="se-c" value="' + esc(p.canonical || "") + '"></label>' +
        '<label class="check"><input type="checkbox" id="se-ni"' + (p.noindex ? " checked" : "") + "> Hide from Google (noindex)</label>" +
        '<h4 style="margin:16px 0 6px">Schema (structured data)</h4><p class="muted" style="font-size:12.5px;margin:0 0 8px">Already on this page: ' + (sp.existing.length ? esc(sp.existing.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ")) : "none") + ". Tick extra types to add; ones already present are skipped.</p>" +
        '<div class="so-sc">' + L.schemas.map(function (t) { var on = sch.indexOf(t) > -1, ex = sp.existing.indexOf(t) > -1; return '<label><input type="checkbox" class="se-s" value="' + t + '"' + (on ? " checked" : "") + (ex ? " disabled" : "") + ">" + t + (ex ? " <em>on page</em>" : t === "FAQPage" && !sp.faq ? " <em style='color:#b45309'>no FAQ found</em>" : "") + "</label>"; }).join("") + "</div></div>" +
        '<div class="so-side"><div class="card" style="padding:16px" id="se-an">Analysing…</div></div></div>';
      W.fillIcons(el);
      function bar(id, n, lo, hi) { var b = $(id), pc = Math.min(100, n / hi * 100); b.style.width = pc + "%"; b.style.background = n >= lo && n <= hi ? "#16a34a" : n && n <= hi + 10 ? "#f59e0b" : "#dc2626"; }
      function vals() { return { kw: $("#se-kw").value.trim(), related: $$(".se-r", el).map(function (i) { return i.value.trim(); }).filter(Boolean) }; }
      var last = null;
      function run() { if (!html) return; bar("#se-tb", $("#se-t").value.length, 30, 60); bar("#se-db", $("#se-d").value.length, 120, 160); var v = vals(); last = X.analyze(html, { kw: v.kw, related: v.related, url: p.url, title: $("#se-t").value, desc: $("#se-d").value }); X.render($("#se-an"), last, { url: p.url }); }
      fetchHtml(p.url).then(function (h) { html = h; run(); });
      $$("#se-kw,.se-r,#se-t,#se-d", el).forEach(function (i) { i.addEventListener("input", run); });
      $("#se-ai").onclick = function () {
        var b = this; b.disabled = true; b.lastChild.textContent = "Thinking…";
        api("seo_ai", { path: rel, kw: $("#se-kw").value }).then(function (r) {
          b.disabled = false; b.lastChild.textContent = "Suggest with AI"; if (!r.ok) return toast(r.error, true);
          $("#se-kw").value = r.kw || $("#se-kw").value; $("#se-t").value = r.title; $("#se-d").value = r.desc; $$(".se-r", el).forEach(function (i, k) { i.value = r.related[k] || i.value; }); run(); toast("AI suggestion added. Review it, then Save.");
        });
      };
      $("#se-save").onclick = function () {
        var b = this, v = vals(); b.disabled = true;
        api("page_meta_save", { path: rel, status: p.status || "published", title: $("#se-t").value, description: $("#se-d").value, ogImage: $("#se-og").value, canonical: $("#se-c").value, noindex: $("#se-ni").checked })
          .then(function (r) { if (!r.ok) throw new Error(r.error); return fetchHtml(p.url); })
          .then(function (h) { html = h; run(); return api("seo_save", { path: rel, kw: v.kw, related: v.related, seo: last ? last.seo.score : null, read: last ? last.read.score : null, schema: $$(".se-s:checked", el).map(function (i) { return i.value; }) }); })
          .then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); toast("SEO saved ✓" + (r.schema && r.schema.added.length ? " · schema: " + r.schema.added.join(", ") : "")); return fetchHtml(p.url).then(function (h) { html = h; run(); }); })
          .catch(function (e) { b.disabled = false; toast(e.message, true); });
      };
    });
  }
  W.seoEditor = editor;
})();
