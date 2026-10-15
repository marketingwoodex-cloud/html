/* Woodex Admin v2 — P15 Speed dashboard.
   Runs Google PageSpeed (mobile + desktop) for any page, shows scores, Core Web Vitals,
   top 5 suggestions and history. Uses health_psi / health_speed / health_settings (media-lib.php). */
(function () {
  "use strict";
  var W = window.WXA, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, toast = W.toast, head = W.head;

  var KEY_PAGES = [
    ["index.html", "Home"], ["renovation/index.html", "Renovation"], ["interior-design/index.html", "Interior design"],
    ["fit-out/index.html", "Fit-out"], ["3d-visualization/index.html", "3D visualization"], ["projects/index.html", "Projects"],
    ["insights/index.html", "Insights"], ["about/index.html", "About"], ["contact/index.html", "Contact"],
    ["lahore/index.html", "Lahore"], ["estimator/index.html", "Estimator"]
  ];
  var HINTS = {
    "render-blocking-insight": "CSS/JS delays the first paint. Keep the fast-load setup (critical CSS) after big design edits.",
    "render-blocking-resources": "CSS/JS delays the first paint. Keep the fast-load setup (critical CSS) after big design edits.",
    "image-delivery-insight": "Images are larger than needed. Upload WebP, max 1920px wide, via Media library.",
    "uses-responsive-images": "Images are larger than needed. Upload WebP, max 1920px wide, via Media library.",
    "modern-image-formats": "Use WebP instead of JPG/PNG.",
    "unused-css-rules": "Normal for this site: the full stylesheet loads in the background. Only a problem if Speed drops under 90.",
    "unused-javascript": "Some scripts are not used on this page (often chat, maps or tracking codes).",
    "lcp-discovery-insight": "The main image is found late. The first hero image should not be lazy-loaded.",
    "cls-culprits-insight": "Things move while the page loads. Give images a width and height.",
    "font-display-insight": "Fonts delay text. Fonts should use font-display: swap.",
    "third-parties-insight": "Outside scripts (Google Tag Manager, maps, chat) slow the page. Remove unused codes in Settings → Integrations.",
    "document-latency-insight": "Server is slow to answer. Check Hostinger caching / LiteSpeed Cache is on.",
    "server-response-time": "Server is slow to answer. Check Hostinger caching / LiteSpeed Cache is on.",
    "uses-long-cache-ttl": "Files are not cached long. The .htaccess cache rules must be uploaded.",
    "cache-insight": "Files are not cached long. The .htaccess cache rules must be uploaded.",
    "legacy-javascript-insight": "Old-style JavaScript from a plugin or tracking code."
  };

  var CSS = ".sp-top{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;margin-bottom:20px}.sp-top label{margin:0}" +
    ".sp-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}@media(max-width:900px){.sp-2{grid-template-columns:1fr}.sp-top{grid-template-columns:1fr}}" +
    ".sp-rings{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 16px}.sp-ring{text-align:center;font-size:12px;color:var(--mut)}.sp-ring svg{display:block;margin:0 auto 4px}" +
    ".sp-m{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}.sp-m div{background:var(--bg);border-radius:10px;padding:8px 10px}.sp-m small{display:block;color:var(--mut);font-size:11px}.sp-m b{font-size:15px}@media(max-width:600px){.sp-m{grid-template-columns:repeat(3,1fr)}}.card h3 i[data-i] svg{width:18px;height:18px;vertical-align:-3px}" +
    ".sp-tip{border-top:1px solid var(--line);padding:9px 0}.sp-tip b{font-size:13px}.sp-tip p{margin:2px 0 0;font-size:12.5px;color:var(--mut)}.sp-tip em{font-style:normal;font-size:12px;color:var(--warn,#b7791f);margin-left:6px}" +
    ".sp-okc{color:#0a8f4d}.sp-warn{color:#c27c0e}.sp-bad{color:#d63b3b}.sp-hist{display:flex;gap:3px;align-items:flex-end;height:26px}.sp-hist i{display:block;width:7px;border-radius:2px;background:var(--line)}" +
    ".sp-hist i.g{background:#23b26d}.sp-hist i.o{background:#e6a23c}.sp-hist i.r{background:#e05656}.sp-prog{font-size:13px;margin-left:10px}.sp-empty{padding:30px 0;text-align:center;color:var(--mut)}";

  function cls(v) { return v == null ? "" : v >= 90 ? "sp-okc" : v >= 50 ? "sp-warn" : "sp-bad"; }
  function col(v) { return v == null ? "#ccc" : v >= 90 ? "#23b26d" : v >= 50 ? "#e6a23c" : "#e05656"; }
  function ring(v, label) {
    var r = 26, c = 2 * Math.PI * r, p = v == null ? 0 : v / 100;
    return '<div class="sp-ring"><svg width="66" height="66" viewBox="0 0 66 66"><circle cx="33" cy="33" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="6"/>' +
      '<circle cx="33" cy="33" r="' + r + '" fill="none" stroke="' + col(v) + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 33 33)"/>' +
      '<text x="33" y="38" text-anchor="middle" font-size="16" font-weight="700" fill="' + col(v) + '">' + (v == null ? "–" : v) + "</text></svg>" + esc(label) + "</div>";
  }
  function hist(list) {
    return '<div class="sp-hist" title="Last ' + list.length + ' tests (oldest → newest)">' + list.slice(0, 10).reverse().map(function (x) {
      var v = x.perf; return '<i class="' + (v == null ? "" : v >= 90 ? "g" : v >= 50 ? "o" : "r") + '" style="height:' + Math.max(4, (v || 0) / 100 * 26) + 'px" title="' + (v == null ? "–" : v) + " · " + esc((x.at || "").slice(0, 16)) + '"></i>';
    }).join("") + "</div>";
  }
  function url(rel) { return "/" + rel.replace(/index\.html$/, ""); }

  W.VIEWS.speed = function (el) {
    if (!document.getElementById("sp-css")) { var st = document.createElement("style"); st.id = "sp-css"; st.textContent = CSS; document.head.appendChild(st); }
    var D = { psi: {} }, pages = KEY_PAGES.map(function (k) { return k[0]; }), sel = "index.html", busy = false, stop = false;
    el.innerHTML = head("Speed", "Speed", '<span class="sp-prog muted" id="sp-prog"></span><button class="btn" id="sp-stop" hidden>Stop</button><button class="btn pri" id="sp-all">' + ic("zap") + "Test key pages</button>") + '<div id="sp-b"><p class="muted">Loading…</p></div>';
    W.fillIcons(el);

    Promise.all([api("health_speed"), bapi("pages").catch(function () { return {}; })]).then(function (rs) {
      if (!rs[0].ok) return toast(rs[0].error, true);
      D = rs[0];
      if (rs[1] && rs[1].ok && rs[1].pages) {
        rs[1].pages.forEach(function (p) { var r = p.path || p; if (/\.html$/.test(r) && !/^(admin|builder)\//.test(r) && pages.indexOf(r) < 0) pages.push(r); });
      }
      draw();
    });

    function last(rel, s) { var l = D.psi[rel + "|" + s]; return l && l[0]; }

    function card(rel, s) {
      var list = D.psi[rel + "|" + s] || [], r = list[0], t = s === "mobile" ? ic("smartphone") + " Mobile" : ic("monitor") + " Desktop";
      if (!r) return '<div class="card card-b"><h3>' + t + '</h3><div class="sp-empty">Not tested yet.<br>Press <b>Test this page</b>.</div></div>';
      var tips = (r.tips || []);
      return '<div class="card card-b"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">' + t + '</h3><small class="muted">' + esc((r.at || "").slice(0, 16)) + "</small></div>" +
        '<div class="sp-rings">' + ring(r.perf, "Speed") + ring(r.a11y, "Accessibility") + ring(r.bp, "Best practices") + ring(r.seo, "SEO") + "</div>" +
        '<div class="sp-m"><div><small>First paint</small><b>' + esc(r.fcp || "–") + "</b></div><div><small>Main content (LCP)</small><b>" + esc(r.lcp || "–") + "</b></div><div><small>Blocking</small><b>" + esc(r.tbt || "–") + "</b></div><div><small>Layout shift</small><b>" + esc(r.cls || "–") + "</b></div><div><small>Speed index</small><b>" + esc(r.si || "–") + "</b></div></div>" +
        (list.length > 1 ? '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><small class="muted">History</small>' + hist(list) + "</div>" : "") +
        "<b style='font-size:13px'>Top suggestions</b>" + (tips.length ? tips.map(function (x) {
          return '<div class="sp-tip"><b>' + esc(x.title) + "</b>" + (x.value ? "<em>" + esc(x.value) + "</em>" : "") + (HINTS[x.id] ? "<p>" + esc(HINTS[x.id]) + "</p>" : "") + "</div>";
        }).join("") : '<p class="muted" style="margin:6px 0 0">No suggestions — great. 🎉</p>') + "</div>";
    }

    function draw() {
      var noKey = !D.psiKeySet ? '<div class="card card-b" style="margin-bottom:20px;border-color:#e6a23c"><b>Tip:</b> Google limits tests without an API key (you may see “quota exceeded”). Add a free key in <a href="#/settings">Settings &amp; APIs → Google PageSpeed</a>.</div>' : "";
      var rows = KEY_PAGES.map(function (k) {
        var m = last(k[0], "mobile"), d = last(k[0], "desktop");
        return "<tr><td><b>" + esc(k[1]) + '</b> <small class="muted">' + esc(url(k[0])) + '</small></td><td class="' + cls(m && m.perf) + '"><b>' + (m ? m.perf : "–") + "</b></td><td>" + hist(D.psi[k[0] + "|mobile"] || []) + '</td><td class="' + cls(d && d.perf) + '"><b>' + (d ? d.perf : "–") + '</b></td><td class="' + cls(m && m.a11y) + '">' + (m ? m.a11y : "–") + '</td><td class="' + cls(m && m.seo) + '">' + (m ? m.seo : "–") + '</td><td class="muted nowrap">' + esc(m ? m.at.slice(0, 10) : "") + '</td><td class="r"><button class="btn sm" data-open="' + esc(k[0]) + '">View</button></td></tr>';
      }).join("");
      $("#sp-b").innerHTML = noKey +
        '<div class="sp-top"><label>Page<select id="sp-page">' + pages.map(function (p) { return '<option value="' + esc(p) + '"' + (p === sel ? " selected" : "") + ">" + esc(url(p)) + "</option>"; }).join("") + '</select></label><div style="display:flex;gap:8px"><a class="btn" id="sp-view" target="_blank" href="' + esc((D.site || "") + url(sel)) + '">Open page</a><button class="btn pri" id="sp-one">' + ic("zap") + "Test this page</button></div></div>" +
        '<div class="sp-2">' + card(sel, "mobile") + card(sel, "desktop") + "</div>" +
        '<div class="card"><div class="card-h"><h3>Key pages</h3><small class="muted">Goal: Speed 90+ on mobile · tests run on ' + esc(D.site || "") + '</small></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th>Mobile</th><th>Trend</th><th>Desktop</th><th>A11y</th><th>SEO</th><th>Tested</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
      W.fillIcons($("#sp-b"));
      $("#sp-page").onchange = function () { sel = this.value; draw(); };
      $("#sp-one").onclick = function () { run([sel]); };
      Array.prototype.forEach.call($("#sp-b").querySelectorAll("[data-open]"), function (b) { b.onclick = function () { sel = b.getAttribute("data-open"); draw(); window.scrollTo(0, 0); }; });
    }

    function prog(t) { $("#sp-prog").textContent = t; }
    function run(list) {
      if (busy) return; busy = true; stop = false;
      var jobs = []; list.forEach(function (p) { jobs.push([p, "mobile"], [p, "desktop"]); });
      var i = 0, fails = 0;
      $("#sp-all").disabled = true; if ($("#sp-one")) $("#sp-one").disabled = true; $("#sp-stop").hidden = list.length < 2;
      (function next() {
        if (stop || i >= jobs.length) {
          busy = false; $("#sp-all").disabled = false; $("#sp-stop").hidden = true; prog(""); draw();
          if (!stop) toast("Done" + (fails ? " — " + fails + " test(s) failed" : ""), !!fails);
          return;
        }
        var j = jobs[i++]; prog("Testing " + url(j[0]) + " (" + j[1] + ") · " + i + "/" + jobs.length + " — about 30 s each");
        api("health_psi", { rel: j[0], strategy: j[1] }).then(function (r) {
          if (!r.ok) { fails++; toast(r.error || "Test failed", true); if (/quota|key/i.test(r.error || "")) stop = true; }
          else { var k = j[0] + "|" + j[1]; D.psi[k] = [r.result].concat(D.psi[k] || []).slice(0, 10); if (j[0] === sel) draw(); }
          next();
        }, function () { fails++; next(); });
      })();
    }
    $("#sp-all").onclick = function () { run(KEY_PAGES.map(function (k) { return k[0]; })); };
    $("#sp-stop").onclick = function () { stop = true; prog("Stopping after this test…"); };
  };
})();
