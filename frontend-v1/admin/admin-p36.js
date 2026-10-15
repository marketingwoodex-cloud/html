/* Woodex Admin — P36 C: live SEO to-do (SEO screen), Pending tasks card (dashboard),
   "Articles live on the website" panel (Blog & insights). Read-only helpers on top of existing APIs:
   pages_list, seo_list, crm_wa_status, gdata_status. No new server actions; nothing is overwritten. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, VIEWS = W.VIEWS;
  var SKIP = /^(404|500|503|coming-soon|thanks|thank-you)\.html$|^(admin|builder|api|_)/;
  var css = document.createElement("style");
  css.textContent =
    ".p36-card{padding:18px;margin-bottom:18px}.p36-card h3{margin:0 0 4px;font-size:16px}.p36-card>.muted{margin:0 0 12px}" +
    ".p36-list{list-style:none;margin:0;padding:0}.p36-list>li{border-top:1px solid var(--line,#e5e7eb);padding:11px 0}" +
    ".p36-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.p36-row b{flex:1;min-width:200px;font-weight:600}" +
    ".p36-row .btn{margin-left:auto}.p36-pages{margin:8px 0 0;padding:10px 12px;background:var(--bg,#f6f7f9);border-radius:10px;font-size:13px;max-height:220px;overflow:auto}" +
    ".p36-pages a{display:inline-block;margin:2px 10px 2px 0}.p36-st{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;font-size:12px;font-weight:700;flex:none}" +
    ".p36-st.ok{background:var(--ok-soft);color:var(--ok)}.p36-st.warn{background:var(--warn-soft);color:var(--warn)}.p36-st svg{width:13px;height:13px}.p36-st.you{background:#eef2ff;color:#465fff}.p36-key{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.p36-key .p36-st{width:18px;height:18px}.p36-key .p36-st svg{width:11px;height:11px}.p36-st.you{background:var(--info-soft);color:var(--info)}" +
    ".p36-sum{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}@media(max-width:640px){.p36-row b{min-width:0;flex-basis:calc(100% - 40px)}.p36-row .btn{margin-left:0}}";
  document.head.appendChild(css);

  function waitFor(el, sel, cb) { var n = 0, t = setInterval(function () { var x = el.querySelector(sel); if (x || ++n > 60) { clearInterval(t); if (x) cb(x); } }, 150); }
  function norm(i) { return String(i).replace(/\s*\(\d+ words?\)/, "").replace(/\s*\(\d+ chars?\)/, ""); }

  // ---------------------------------------------------------------- SEO to-do data (shared)
  var authorCache = null;
  function authorCheck(pages) {
    if (authorCache) return Promise.resolve(authorCache);
    var posts = pages.filter(function (p) { return /^insights\/[a-z0-9-]+\/index\.html$/.test(p.path); });
    return Promise.all(posts.map(function (p) {
      return fetch(p.url + "?p36=" + Date.now(), { credentials: "same-origin" }).then(function (r) { return r.text(); })
        .then(function (h) { return /"author"\s*:\s*\{\s*"@type"\s*:\s*"Person"/.test(h) ? null : p; }).catch(function () { return null; });
    })).then(function (r) { authorCache = { total: posts.length, missing: r.filter(Boolean) }; return authorCache; });
  }
  function seoTodo() {
    return Promise.all([api("pages_list"), api("seo_list")]).then(function (rs) {
      var P = rs[0], S = rs[1]; if (!P.ok) throw new Error(P.error || "Could not load pages");
      var pages = P.pages.filter(function (p) { return !SKIP.test(p.path) && p.status === "published"; }), seo = (S && S.pages) || {};
      var groups = {};
      pages.forEach(function (p) { (p.issues || []).forEach(function (i) { var k = norm(i); (groups[k] = groups[k] || []).push(p); }); });
      var items = Object.keys(groups).map(function (k) { return { sev: /thin|no meta|no title|noindex|canonical/i.test(k) ? "high" : "med", title: k, pages: groups[k] }; });
      var analysed = Object.keys(seo).length;
      var low = pages.filter(function (p) { var s = seo[p.path]; return s && s.seo != null && s.seo < 70; });
      if (low.length) items.push({ sev: "med", title: "SEO score under 70 (from the SEO analyser)", pages: low });
      var nokw = pages.filter(function (p) { return !(seo[p.path] && seo[p.path].kw); });
      if (nokw.length) items.push({ sev: "low", title: analysed ? "No focus keyphrase set" : "Pages not analysed yet: click “Analyse all”", pages: nokw });
      return authorCheck(pages).then(function (a) {
        if (a.missing.length) items.unshift({ sev: "high", title: "Articles credited to the studio, not a named designer (send names + credentials)", pages: a.missing });
        var rank = { high: 0, med: 1, low: 2 }; items.sort(function (x, y) { return rank[x.sev] - rank[y.sev]; });
        return { items: items, pages: pages, analysed: analysed };
      });
    });
  }
  function todoHtml(d, limit) {
    var badge = { high: "bad", med: "warn", low: "info" }, lab = { high: "High", med: "Medium", low: "Low" };
    var it = limit ? d.items.slice(0, limit) : d.items;
    return '<ul class="p36-list">' + (it.map(function (x, i) {
      return '<li><div class="p36-row"><span class="badge ' + badge[x.sev] + '">' + lab[x.sev] + "</span><b>" + esc(x.title) + '</b><span class="muted">' + x.pages.length + " page" + (x.pages.length === 1 ? "" : "s") + "</span>" +
        '<button class="btn sm" data-p36t="' + i + '">Show pages</button></div><div class="p36-pages" hidden>' +
        x.pages.map(function (p) { return '<a href="#/seo/' + encodeURIComponent(p.path) + '" title="Open in SEO editor">' + esc(p.url) + "</a>"; }).join("") + "</div></li>";
    }).join("") || '<li><div class="p36-row"><span class="p36-st ok">✓</span><b>No open SEO issues on published pages</b></div></li>') + "</ul>";
  }
  function bindTodo(root) { root.querySelectorAll("[data-p36t]").forEach(function (b) { b.onclick = function () { var box = b.closest("li").querySelector(".p36-pages"); box.hidden = !box.hidden; b.textContent = box.hidden ? "Show pages" : "Hide pages"; }; }); }

  // ---------------------------------------------------------------- C3: SEO screen
  var seoOrig = VIEWS.seo;
  if (seoOrig) VIEWS.seo = function (el, parts) {
    seoOrig(el, parts);
    if (parts && parts.length) return;
    waitFor(el, ".so-top", function (top) {
      var card = document.createElement("div"); card.className = "card p36-card"; card.id = "p36-seo";
      card.innerHTML = "<h3>SEO to-do list</h3><p class='muted'>Live checks on every published page. Click a page to fix it in the SEO editor. Error pages (404, 500, 503) are skipped on purpose.</p><div class='muted'>Checking pages…</div>";
      top.parentNode.insertBefore(card, top);
      seoTodo().then(function (d) {
        var h = d.items.filter(function (x) { return x.sev === "high"; }).length;
        card.lastChild.outerHTML = '<div class="p36-sum"><span class="badge ' + (h ? "bad" : "ok") + '">' + h + " high</span><span class='badge warn'>" + d.items.filter(function (x) { return x.sev === "med"; }).length + " medium</span><span class='badge info'>" + d.items.filter(function (x) { return x.sev === "low"; }).length + " low</span><span class='badge'>" + d.pages.length + " published pages checked</span></div>" + todoHtml(d);
        bindTodo(card);
      }).catch(function (e) { card.lastChild.textContent = e.message; });
    });
  };

  // ---------------------------------------------------------------- C4: dashboard Pending tasks
  function pendingCard(box) {
    var card = document.createElement("div"); card.className = "card p36-card"; card.id = "p36-tasks";
    card.innerHTML = "<h3>Pending tasks</h3><p class='muted'>Detected live from the website and your integrations. Done items tick themselves.</p><div class='muted'>Checking…</div>";
    card.style.marginTop = "18px"; box.appendChild(card); /* P21: moved from top to bottom of the dashboard */
    var fetchText = function (u) { return fetch(u + "?p36=" + Date.now(), { credentials: "same-origin" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }); };
    Promise.all([seoTodo().catch(function () { return null; }), api("crm_wa_status").catch(function () { return {}; }), api("gdata_status").catch(function () { return {}; }), fetchText("/book-a-visit/"), fetchText("/projects/")]).then(function (r) {
      var d = r[0], wa = r[1] || {}, g = r[2] || {}, book = r[3], proj = r[4];
      var authors = d ? d.items.filter(function (x) { return /named designer/.test(x.title); })[0] : null;
      var seoOpen = d ? d.items.filter(function (x) { return x.sev !== "low" && !/named designer/.test(x.title); }).reduce(function (a, x) { return a + x.pages.length; }, 0) : null;
      var claims = /free consultation|no charge for the first visit/i.test(book);
      var T = [
        [seoOpen === 0 ? "ok" : "warn", "SEO fixes on published pages", seoOpen == null ? "Could not check" : seoOpen ? seoOpen + " page issue(s) to fix" : "All clear", "#/seo", "Open SEO"],
        [authors ? "you" : "ok", "Named author on insights articles", authors ? authors.pages.length + " articles need a designer name + credentials" : "Done", "#/team", "Team"],
        [claims ? "you" : "ok", "Approve or remove unconfirmed claims (free visit, PKR prices, 4K, revisions)", claims ? "Waiting for the owner’s answers on the claims sheet" : "Done", "#/pages", "Pages"],
        [wa.connected ? "ok" : "you", "WhatsApp Cloud API", wa.connected ? "Connected" : "Not connected: needs Meta Business setup", "#/offers", "WhatsApp"],
        [g.connected ? "ok" : "you", "Google Analytics + Search Console", g.connected ? "Connected" + (g.email ? " (" + esc(g.email) + ")" : "") : "Not connected: needs a service-account JSON key", "#/settings", "Integrations"],
        [/design stud/i.test(proj) ? "you" : "ok", "Real project photos", /design stud/i.test(proj) ? "Projects still show design studies; send real photos" : "Done", "#/portfolio", "Portfolio"],
        ["you", "Real Google reviews", "Slider now links to Google; paste real reviews to replace the sample cards", "#/testimonials", "Testimonials"]
      ];
      var sym = { ok: ic("check"), warn: ic("info"), you: ic("edit") }, open = T.filter(function (t) { return t[0] !== "ok"; }).length;
      card.querySelector("h3").innerHTML = "Pending tasks <span class='badge " + (open ? "warn" : "ok") + "'>" + open + " open</span>";
      card.lastChild.outerHTML = '<ul class="p36-list">' + T.map(function (t) {
        return '<li><div class="p36-row"><span class="p36-st ' + t[0] + '">' + sym[t[0]] + "</span><b>" + t[1] + '</b><span class="muted">' + t[2] + '</span><a class="btn sm" href="' + t[3] + '">' + t[4] + "</a></div></li>";
      }).join("") + "</ul><p class='muted p36-key' style='margin:10px 0 0;font-size:12px'><span class='p36-st you'>" + sym.you + "</span> needs your input <span class='p36-st warn'>" + sym.warn + "</span> needs work <span class='p36-st ok'>" + sym.ok + "</span> done</p>";
    });
  }
  /* P21 revision: quick actions + connected apps status (placed above Pending tasks) */
  function p21Cards(box) {
    if (box.querySelector("#p21-quick")) return;
    var qa = [["#/quotes/new", "plus", "New quotation"], ["#/enquiries", "inbox", "Leads"], ["#/chat", "message-circle", "Inbox"], ["#/social", "image", "Social post"], ["#/blog", "book-open", "Write article"], ["#/seoagent", "sparkles", "SEO agent"]];
    var q = document.createElement("div"); q.className = "card p36-card p21-quick"; q.id = "p21-quick"; q.style.marginTop = "18px";
    q.innerHTML = "<h3>Quick actions</h3><div class='p21-qa'>" + qa.map(function (x) { return "<a class='p21-qa-i' href='" + x[0] + "'>" + ic(x[1]) + "<span>" + x[2] + "</span></a>"; }).join("") + "</div>";
    box.appendChild(q);
    var c = document.createElement("div"); c.className = "card p36-card"; c.id = "p21-apps"; c.style.marginTop = "18px";
    c.innerHTML = "<div style='display:flex;justify-content:space-between;align-items:center;gap:10px'><h3 style='margin:0'>Connected apps</h3><a class='btn sm' href='#/settings/integrations'>Add connector</a></div><div class='muted' style='margin-top:10px'>Checking…</div>";
    box.appendChild(c);
    Promise.all([api("conn_list").catch(function () { return {}; }), api("crm_wa_status").catch(function () { return {}; }), api("tg_get").catch(function () { return {}; })]).then(function (r) {
      var items = (r[0] && r[0].items) || [], wa = r[1] || {}, tg = (r[2] && r[2].cfg) || {};
      var has = function (k) { var m = items.filter(function (x) { return x.key === k; })[0]; return m ? (m.status === "connected" ? "ok" : m.status === "error" ? "bad" : "warn") : "off"; };
      var apps = [["Gmail", has("gmail")], ["Google Drive", has("gdrive")], ["GitHub", has("github")], ["WhatsApp", wa.connected || wa.ok && wa.ready ? "ok" : "off"], ["Telegram", tg.bot || tg.botName || tg.ready ? "ok" : "off"]];
      var lbl = { ok: "Connected", warn: "Needs setup", bad: "Error", off: "Not connected" };
      c.lastChild.outerHTML = "<div class='p21-apps'>" + apps.map(function (a) { return "<a class='p21-app' href='" + (a[0] === "Telegram" ? "#/telegram" : a[0] === "WhatsApp" ? "#/wahub" : "#/settings/integrations") + "'><b>" + a[0] + "</b><span class='badge " + (a[1] === "ok" ? "ok" : a[1] === "bad" ? "bad" : a[1] === "warn" ? "warn" : "") + "'>" + lbl[a[1]] + "</span></a>"; }).join("") + "</div>";
    });
  }
  if (!document.getElementById("p21-css")) { var st = document.createElement("style"); st.id = "p21-css";
    st.textContent = ".p21-qa{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:12px}.p21-qa-i{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 8px;border:1px solid var(--line,#e4e7ec);border-radius:12px;text-decoration:none;color:inherit;font-size:13px;font-weight:600;transition:border-color .2s,transform .2s}.p21-qa-i:hover{border-color:#b8956a;transform:translateY(-2px)}.p21-qa-i svg{width:20px;height:20px;color:#b8956a}.p21-apps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px}.p21-app{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--line,#e4e7ec);border-radius:12px;text-decoration:none;color:inherit}.p21-app .badge{align-self:flex-start}@media(max-width:900px){.p21-qa{grid-template-columns:repeat(3,1fr)}.p21-apps{grid-template-columns:repeat(2,1fr)}}";
    document.head.appendChild(st); }
  var dashOrig = VIEWS.dashboard;
  if (dashOrig) VIEWS.dashboard = function (el) {
    dashOrig(el);
    var u = W.S && W.S.user || {}; if (u.role && !/owner|admin/.test(u.role)) return;
    waitFor(el, ".ph", function () { setTimeout(function () {
      if (el.querySelector("#p36-tasks")) return;
      var dx = el.querySelector("#dx");
      if (dx && dx.querySelector(".dx-chips")) { p21Cards(dx); return pendingCard(dx); }
      var host = document.createElement("div"), ph = el.querySelector(".ph"); ph.parentNode.insertBefore(host, ph.nextSibling); pendingCard(host);
    }, 1500); });
  };

  // ---------------------------------------------------------------- C1: Blog & insights — live articles panel
  var blogOrig = VIEWS.blog;
  if (blogOrig) VIEWS.blog = function (el, parts) {
    blogOrig(el, parts);
    var card = document.createElement("div"); card.className = "card p36-card"; card.style.marginTop = "18px";
    card.innerHTML = "<h3>Articles live on the website</h3><p class='muted'>Every published insights article, with word count and SEO health. <b>Edit</b> opens the page builder (safest for these articles: keeps tables, In-short boxes and schema). <b>SEO</b> opens the SEO editor.</p><div class='muted'>Loading…</div>";
    el.appendChild(card);
    api("pages_list").then(function (r) {
      if (!r.ok) { card.lastChild.textContent = r.error; return; }
      var posts = r.pages.filter(function (p) { return /^insights\/[a-z0-9-]+\/index\.html$/.test(p.path); }).sort(function (a, b) { return (b.mtime || 0) - (a.mtime || 0); });
      var avg = posts.length ? Math.round(posts.reduce(function (a, p) { return a + (p.words || 0); }, 0) / posts.length) : 0;
      card.lastChild.outerHTML = '<div class="p36-sum"><span class="badge gold">' + posts.length + " articles</span><span class='badge'>avg " + avg + " words (page builder count)</span></div>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Article</th><th>Words</th><th>SEO</th><th></th></tr></thead><tbody>' + posts.map(function (p) {
          var s = p.score; return "<tr><td><b style='display:block;max-width:460px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc((p.title || "").replace(/\s*\|\s*Woodex.*$/, "")) + "</b><a class='muted' href='" + esc(p.url) + "' target='_blank'>" + esc(p.url) + "</a></td><td class='muted'>" + p.words + "</td>" +
            "<td><span class='badge " + (s >= 80 ? "ok" : s >= 55 ? "warn" : "bad") + "' title='" + esc((p.issues || []).join("\n") || "No issues") + "'>" + s + "</span></td>" +
            "<td style='text-align:right;white-space:nowrap'><a class='btn sm' href='#/builder/" + encodeURIComponent(p.path) + "'>Edit</a> <a class='btn sm' href='#/seo/" + encodeURIComponent(p.path) + "'>SEO</a></td></tr>";
        }).join("") + "</tbody></table></div>";
    });
  };
  // this file loads last: if one of the wrapped screens already rendered, render it again with the additions
  (function () {
    var n = 0, t = setInterval(function () {
      if (++n > 80) return clearInterval(t);
      if (!(W.S && W.S.user)) return;
      clearInterval(t);
      var v = location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard";
      var view = document.getElementById("view");
      if (/^(dashboard|seo|blog)$/.test(v) && view && !view.querySelector(".p36-card")) W.route();
    }, 150);
  })();
})();
