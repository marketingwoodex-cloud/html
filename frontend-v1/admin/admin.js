/* Woodex Admin v2 — Phase A1 (shell, auth, dashboard, users, activity, profile, builder SSO) */
(function () {
  "use strict";
  var API = "/api/admin.php", BAPI = "/api/builder.php";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var S = { token: sessionStorage.getItem("wxaTok") || "", user: null, btoken: null, pages: null, charts: [] };

  // ---------------------------------------------------------------- helpers
  function ic(n) { var s = (window.WXA_ICONS || {})[n]; return '<i data-i="' + n + '">' + (s ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + s + "</svg>" : "") + "</i>"; }
  function fillIcons(root) { $$("i[data-i]", root).forEach(function (i) { if (!i.firstChild) { var s = (window.WXA_ICONS || {})[i.dataset.i]; if (s) i.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + s + "</svg>"; } }); }
  function toast(m, bad) { var t = $("#toast"); t.textContent = m; t.className = "toast on" + (bad ? " bad" : ""); clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = "toast"; }, bad ? 8000 : 3200); }
  // P16 3.9: a late reply to a read-only request for a screen the user already left is dropped, so it can't write into a
  // screen that no longer exists ("Cannot set properties of null"). Saves/sends/deletes and background polls always complete.
  var WRITE = /^(save|delete|del|remove|send|set|add|update|upload|publish|login|logout|clear|import|restore|create|approve|convert|pay|payment|reset|test|run|reply|take|close|assign|move|merge|mark|read|toggle|revoke|rotate|connect|disconnect|generate|ai|write|apply|fix|seed|plan|invite|verify|poll|count|badges?|status|notif|cron|2fa|sync|push|new|duplicate|copy|bulk|rename|archive|lock|unlock|sign|share|email|wa|meta)$/i;
  function isWrite(a) { var g = String(a).toLowerCase().split(/[_\-]/); if (/^(get|list|load|view|info|stats|data|all|one|search|history|preview|page|pages)$/.test(g[g.length - 1])) return false; return g.some(function (x) { return WRITE.test(x); }); }
  function scr() { return (location.hash.replace(/^#\/?/, "").split(/[\/?]/)[0]) || "dashboard"; }
  function fresh(action, p) { var h = scr(); if (isWrite(action)) return p; return p.then(function (j) { return scr() !== h ? new Promise(function () {}) : j; }); }
  /* P39: a Manager's change comes back {ok, pending}: tell them it is waiting for the Master (after the screen's own "Saved" toast). */
  function pendingNote(j) { if (j && j.pending) { setTimeout(function () { toast((j.message || "Sent to the Master for approval")); }, 80); setTimeout(navBadges, 300); } return j; }
  function api(action, data) { return fresh(action, api0(action, data)); }
  function api0(action, data) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "X-WX-ADM": S.token }, body: JSON.stringify(Object.assign({ action: action }, data || {})) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error (" + r.status + "). Open /wx-check.php to see why." }; }).then(function (j) { if (r.status === 401 && S.user) signedOut("Your session expired. Please sign in again."); return j; }); })
      .then(pendingNote).catch(function () { return { ok: false, error: "Network error — check your connection" }; });
  }
  function bapi(action, data) { return fresh(action, bapi0(action, data)); }
  function bapi0(action, data) {
    return fetch(BAPI, { method: "POST", headers: { "Content-Type": "application/json", "X-WX-CSRF": S.btoken || "", "X-WX-ADM": S.token || "" }, body: JSON.stringify(Object.assign({ action: action }, data || {})) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Page-builder API error (" + r.status + ")" }; }).then(function (j) {
        if (!j.ok && r.status === 401 && !bapi.warned) { bapi.warned = 1; toast((j.error || "Page builder: not signed in") + " — see Settings → System check", true); setTimeout(function () { bapi.warned = 0; }, 15000); }
        return j; }); })
      .then(pendingNote).catch(function () { return { ok: false, error: "Network error — check your connection" }; });
  }
  function modal(html, cls) { $("#modal-card").innerHTML = html; $("#modal-card").className = cls ? "modal-card " + cls : $("#modal-card").className.replace(/ wide/g, ""); fillIcons($("#modal-card")); $("#modal").hidden = false; var f = $("#modal-card input,#modal-card select"); if (f) f.focus(); }
  function closeModal() { $("#modal").hidden = true; }
  // P19 B4: auto-saved form drafts (kept in this browser until the form is submitted or cleared)
  function formDraft(key, sel) {
    var K = "wx_draft_" + key, f = [].slice.call(document.querySelectorAll(sel)).filter(function (x) { return x.id; }), d = {};
    try { d = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) {}
    var any = false; f.forEach(function (x) { if (d[x.id] != null && d[x.id] !== "") { x.value = d[x.id]; any = true; } });
    var bar = document.createElement("p"); bar.className = "muted"; bar.style.cssText = "margin:-6px 0 12px;font-size:12.5px";
    bar.innerHTML = "Draft restored · <a href='#' style='color:inherit;text-decoration:underline'>Clear</a>";
    var h = document.querySelector("#modal-card h2"); if (any && h) h.after(bar);
    function save() { var o = {}; f.forEach(function (x) { o[x.id] = x.value; }); try { localStorage.setItem(K, JSON.stringify(o)); } catch (e) {} }
    f.forEach(function (x) { x.addEventListener("input", save); x.addEventListener("change", save); });
    var api = { clear: function () { try { localStorage.removeItem(K); } catch (e) {} } };
    bar.querySelector("a").onclick = function (e) { e.preventDefault(); api.clear(); f.forEach(function (x) { if (x.tagName !== "SELECT") x.value = ""; }); bar.remove(); };
    return api;
  }
  $("#modal").addEventListener("mousedown", function (e) { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$("#app").hidden) { e.preventDefault(); $("#gsearch").focus(); } });
  function initials(n) { return String(n || "?").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function ago(ts) {
    var d = typeof ts === "number" ? ts * 1000 : Date.parse(String(ts).replace(" ", "T")); if (!d) return "—";
    var s = Math.round((Date.now() - d) / 1000); if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago"; if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
    return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function bytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }
  /* P39: roles. Stored codes: owner=Master, admin=Manager, editor=Developer, sales=Sales, support=Support.
     can("owner,admin") = role list · can("g:sales") = permission group (role groups + extra permissions set by the Master). */
  var PERM_LABEL = { sales: "Sales (leads, quotes, projects)", conversations: "Inbox", updates: "Client updates", broadcast: "WhatsApp broadcasts & automation", ai: "Train AI", website: "Website (pages, content, SEO)", settings: "Settings & integrations" };
  var ROLE_LABEL = { owner: "Master", admin: "Manager", editor: "Developer", sales: "Sales", support: "Support" };
  var ROLE_GROUPS = { owner: ["sales", "conversations", "updates", "broadcast", "ai", "website", "settings", "master"], admin: ["sales", "conversations", "updates", "broadcast", "ai", "website", "settings"], editor: ["website", "settings"], sales: ["sales", "conversations", "support_view"], support: ["conversations", "updates", "support_view"] };
  var groupsOf = function (u) { return (ROLE_GROUPS[u.role] || []).concat(u.perms || []); };
  var can = function (roles) {
    if (!S.user) return false; var g = groupsOf(S.user);
    return roles.split(",").some(function (r) { r = r.trim(); return r.indexOf("g:") === 0 ? g.indexOf(r.slice(2)) >= 0 : r === S.user.role; });
  };
  var ACT = {
    login: ["log-out", "signed in"], logout: ["log-out", "signed out"], setup: ["shield-check", "installed Woodex Admin"], "profile.update": ["user", "updated their profile"], "password.change": ["key-round", "changed their password"],
    "user.create": ["users", "added team member"], "user.update": ["users", "updated team member"], "builder.save": ["square-pen", "edited page"], "builder.page_new": ["file-plus", "created page"],
    "builder.restore": ["history", "restored a backup of"], "builder.upload": ["image", "uploaded"], "builder.import_url": ["image", "added a free photo"], "builder.media_delete": ["x", "deleted image"], "builder.theme": ["sparkles", "changed the site theme"], "builder.blocks": ["blocks", "updated saved sections"]
  };
  function actText(a) { var m = ACT[a.action] || ["activity", a.action]; return { icon: m[0], text: m[1] }; }

  // ---------------------------------------------------------------- navigation
  /* P16: TailAdmin-style grouped menu. ["Heading"] · [view, label, icon, roles] · { g: label, icon, id, items: [...] } (dropdown) */
  var NAV = [
    ["Home"],
    ["dashboard", "Home", "layout-dashboard"],
    ["approvals", "Approvals", "shield-check", "owner,admin,editor"],
    ["Sales"],
    ["enquiries", "Leads", "inbox", "g:sales"],
    ["pipeline", "Pipeline", "kanban", "g:sales"],
    ["bookings", "Bookings", "clock", "g:sales"],
    ["clients", "Clients", "contact", "g:sales"],
    { g: "Quotes & invoices", icon: "file-text", id: "money", items: [
      ["quotes", "Quotations", "file-text", "g:sales"],
      ["invoices", "Invoices", "receipt", "g:sales"],
      ["transactions", "Payments", "receipt", "g:sales"],
      ["templates", "Quote templates", "layers", "g:sales"]] },
    ["projects", "Projects", "briefcase", "g:sales,g:support_view"],
    ["Conversations"],
    ["chat", "Inbox", "message-circle", "g:conversations"],
    { g: "WhatsApp", icon: "send", id: "wa", items: [
      ["wahub", "Overview & rules", "send", "g:broadcast"],
      ["wainsights", "Insights", "layers", "g:broadcast"],
      ["wauto", "Broadcasts & automations", "zap", "g:broadcast"],
      ["offers", "Discount offers", "send", "g:broadcast"],
      ["settings/connections", "Connect WhatsApp", "zap", "g:settings"]] },
    ["telegram", "Telegram", "send", "owner,admin,editor"],
    ["social", "Social media", "image", "owner,admin"],
    ["updates", "Client updates", "send", "g:updates"],
    ["aicenter", "AI Assistant", "sparkles", "g:ai"],
    ["train", "Knowledge & Q&A", "book-open", "g:ai"],
    ["aireport", "AI report", "star", "g:ai"],
    ["Website"],
    { g: "Pages & builder", icon: "square-pen", id: "site", items: [
      ["pages", "All pages", "file-text", "g:website"],
      ["builder", "Page builder", "square-pen", "g:website"],
      ["library", "Section library", "blocks", "g:website"],
      ["global", "Header & footer", "panel-left", "g:website"],
      ["heroes", "Hero slides", "image", "g:website"],
      ["redirects", "Redirects", "refresh-cw", "g:website"]] },
    { g: "Content", icon: "book-open", id: "content", items: [
      ["blog", "Blog", "book-open", "g:website"],
      ["portfolio", "Portfolio", "image", "g:website"],
      ["services", "Service pages", "layers", "g:website"],
      ["cities", "City pages", "map-pin", "g:website"],
      ["pagetpl", "Page templates", "layers", "g:website"],
      ["forms", "Forms", "file-text", "g:website"],
      ["estimator", "Estimator", "gauge", "g:website"],
      ["faqs", "FAQs", "help-circle", "g:website"],
      ["testimonials", "Testimonials", "message-square", "g:website"],
      ["logos", "Client logos", "image", "g:website"],
      ["team", "Team", "users", "g:website"]] },
    ["media", "Media", "image", "g:website"],
    ["seo", "SEO", "search", "g:website"],
    ["seoagent", "SEO agent", "sparkles", "g:website"],
    ["speed", "Speed", "gauge", "g:website"],
    ["health", "Site health", "heart-pulse", "g:website"],
    ["theme", "Theme", "sparkles", "g:settings"],
    ["Admin"],
    ["business", "Business info", "building", "g:settings"],
    ["settings", "Integrations", "zap", "g:settings"],
    ["users", "Users & roles", "users", "owner,admin"],
    { g: "System", icon: "settings", id: "settings", items: [
      ["backups", "Backups", "hard-drive", "owner,admin"],
      ["database", "Database", "database", "owner,admin"],
      ["files", "File manager", "folder", "g:website"],
      ["maintenance", "Maintenance", "shield", "g:settings"],
      ["activity", "Activity log", "activity", "g:settings"],
      ["system", "System check", "activity", "g:settings"]] },
    ["Me"],
    ["profile", "My profile", "user"],
    ["security", "My security", "shield"]
  ];
  /* P39 Phase 3: collapsible sections + per-user pinned screens */
  var navSec = (function () { try { return JSON.parse(localStorage.getItem("wxNavSec") || "{}"); } catch (e) { return {}; } })();
  function pinKey() { return "wxPins" + (S.user ? S.user.id : ""); }
  function pins() { try { return JSON.parse(localStorage.getItem(pinKey()) || "[]"); } catch (e) { return []; } }
  var navOpen = (function () { try { return JSON.parse(localStorage.getItem("wxNavOpen") || "{}"); } catch (e) { return {}; } })();
  function navLink(n, sub) { return '<a class="nav-a' + (sub ? " sub" : "") + (n[4] ? " soon" : "") + '" href="#/' + n[0] + '" data-v="' + n[0] + '" title="' + n[1] + '">' + ic(n[2]) + "<span>" + n[1] + "</span>" + (n[4] ? '<span class="pill">' + n[4] + "</span>" : "") + (n[5] === "new" ? '<span class="nav-new">NEW</span>' : "") + '<span class="nav-bdg" data-bdg="' + n[0] + '" hidden></span><span class="nav-pin' + (pins().indexOf(n[0]) > -1 ? " on" : "") + '" data-pin="' + n[0] + '" title="Pin to top">★</span></a>'; }
  // P16: live count badges (new leads, chats needing a reply)
  function navBadges() {
    if (!S.user) return;
    var set = function (v, n) { var b = document.querySelector('[data-bdg="' + v + '"]'); if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; } };
    if (can("owner,admin,editor")) api("appr_count").then(function (r) { if (r && r.ok) set("approvals", r.pending); });
    if (can("g:sales,g:conversations")) {
      api("leads_count").then(function (r) { if (r && r.ok) set("enquiries", r.unread); });
      api("chat_list", { status: "open" }).then(function (r) { if (r && r.ok) set("chat", (r.chats || []).filter(function (c) { return c.unread || c.needs; }).length); });
    }
  }
  setInterval(function () { if (!document.hidden) navBadges(); }, 60000);
  function renderNav() {
    var ok = function (n) { return n[5] !== "hide" && (!n[3] || can(n[3])); }, out = [], pendingH = null; /*P19 D: hidden = reachable via hub tabs only*/
    var sec = null, flat = {}, secs = [];
    NAV.forEach(function (n) {
      if (Array.isArray(n) && n.length === 1) { sec = { name: n[0], html: [] }; secs.push(sec); return; }
      var html;
      if (n.g) { var its = n.items.filter(ok); if (!its.length) return; its.forEach(function (x) { flat[x[0]] = x; });
        html = '<div class="nav-g' + (navOpen[n.id] ? " open" : "") + '" data-g="' + n.id + '"><button type="button" class="nav-a nav-gb" title="' + n.g + '">' + ic(n.icon) + "<span>" + n.g + '</span><span class="nav-car">' + ic("chevron-down") + '</span></button><div class="nav-sub">' + its.map(function (x) { return navLink(x, 1); }).join("") + "</div></div>";
      } else { if (!ok(n)) return; flat[n[0]] = n; html = navLink(n); }
      sec.html.push(html);
    });
    var pn = pins().filter(function (v) { return flat[v]; });
    if (pn.length) out.push('<div class="nav-sec pinned"><div class="nav-h">★ Pinned</div>' + pn.map(function (v) { return navLink(flat[v]); }).join("") + "</div>");
    secs.forEach(function (x) { if (!x.html.length) return; var shut = navSec[x.name] && x.name !== "Home";
      out.push('<div class="nav-sec' + (shut ? " shut" : "") + '" data-s="' + x.name + '">' + (x.name === "Home" ? "" : '<button type="button" class="nav-h nav-hb">' + x.name + '<span class="nav-car">' + ic("chevron-down") + "</span></button>") + '<div class="nav-sb">' + x.html.join("") + "</div></div>"); });
    $("#nav").innerHTML = out.join("");
    $$(".nav-hb").forEach(function (h) { h.onclick = function () { var x = h.parentNode; x.classList.toggle("shut"); navSec[x.dataset.s] = x.classList.contains("shut"); localStorage.setItem("wxNavSec", JSON.stringify(navSec)); }; });
    $$(".nav-pin").forEach(function (p) { p.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var l = pins(), v = p.dataset.pin, i = l.indexOf(v); if (i > -1) l.splice(i, 1); else l.push(v); localStorage.setItem(pinKey(), JSON.stringify(l.slice(-8))); renderNav(); route0Mark(); }; });
    setTimeout(navBadges, 400);
    $$(".nav-gb").forEach(function (b) { b.onclick = function () { var g = b.parentNode; if ($("#app").classList.contains("mini")) { $("#app").classList.remove("mini"); g.classList.add("open"); } else g.classList.toggle("open"); navOpen[g.dataset.g] = g.classList.contains("open"); try { localStorage.setItem("wxNavOpen", JSON.stringify(navOpen)); } catch (e) {} }; });
    $$("[data-roles]").forEach(function (a) { a.hidden = !can(a.dataset.roles); });
  }

  // ---------------------------------------------------------------- auth flow
  function showAuth(mode, st) {
    $("#app").hidden = true; $("#auth").hidden = false;
    $("#login-form").hidden = mode !== "login"; $("#tfa-form").hidden = true; $("#setup-form").hidden = mode !== "setup"; if ($("#db-form")) $("#db-form").hidden = mode !== "db";
    if (mode === "setup") { $("#s-db").hidden = st.driver !== "mysql"; $("#s-bp").hidden = !st.builderLocked; $("#s-uname").focus(); }
    else $("#l-email").focus();
  }
  /* Opened from the page builder to sign in again? Hand the fresh session back to that builder window only
     (point-to-point postMessage to our opener, same origin, /builder/ path; tabs don't share sessionStorage). */
  function wxShare() {
    try {
      var o = window.opener; if (!o || o.closed || !S.token || !S.btoken) return;
      if (o.location.origin !== location.origin || o.location.pathname.indexOf("/builder/") !== 0) return;
      o.postMessage({ t: "wx-session", adm: S.token, bld: S.btoken }, location.origin);
      toast("Signed in — you can go back to the page builder tab and click Save.");
    } catch (e) { /* not our opener */ }
  }
  function signedIn(r) {
    S.token = r.token || S.token; S.user = r.user; S.btoken = r.builderToken || null;
    sessionStorage.setItem("wxaTok", S.token); if (S.btoken) sessionStorage.setItem("wxTok", S.btoken);
    wxShare();
    $("#auth").hidden = true; $("#app").hidden = false;
    $("#u-name").textContent = S.user.name; $("#u-role").textContent = ROLE_LABEL[S.user.role] || S.user.role; $("#u-av").textContent = initials(S.user.name);
    renderNav(); route();
    if (S.btoken) bapi("pages").then(function (p) { if (p.ok) { S.pages = p.pages; $("#gsearch-list").innerHTML = p.pages.map(function (x) { return '<option value="' + esc(x.url) + '">' + esc(x.title) + "</option>"; }).join(""); } });
  }
  function signedOut(msg) { S.user = null; S.token = ""; sessionStorage.removeItem("wxaTok"); sessionStorage.removeItem("wxTok"); showAuth("login"); if (msg) $("#l-err").textContent = msg; }

  /* P15: reconnect database form (shown when status.dbError) */
  if ($("#db-form")) $("#db-form").onsubmit = function (e) {
    e.preventDefault(); var b = $("#d-btn"); b.disabled = true; $("#d-err").textContent = "";
    api("db_reconnect", { dbHost: $("#d-host").value, dbName: $("#d-name").value, dbUser: $("#d-user").value, dbPass: $("#d-dpass").value, builderPassword: $("#d-bpass").value, name: $("#d-uname").value, email: $("#d-email").value, password: $("#d-pass").value }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { if (r.needsOwner) { $("#d-owner").hidden = false; $("#d-uname").focus(); } return ($("#d-err").textContent = r.error); }
      toast(r.fresh ? "Connected — new owner account created. Please sign in." : "Database reconnected. Please sign in.");
      showAuth("login");
    });
  };
  $("#login-form").onsubmit = function (e) {
    e.preventDefault(); var b = $("#l-btn"); b.disabled = true; b.classList.add("busy"); b.setAttribute("aria-busy", "true"); $("#l-err").textContent = "";
    api("login", { email: $("#l-email").value.trim(), password: $("#l-pass").value }).then(function (r) { b.disabled = false; b.classList.remove("busy"); b.removeAttribute("aria-busy"); if (!r.ok) return ($("#l-err").textContent = r.error); $("#l-pass").value = "";
      if (r.need2fa) { S.ticket = r.ticket; $("#login-form").hidden = true; $("#tfa-form").hidden = false; $("#t-code").value = ""; $("#t-err").textContent = ""; $("#t-code").focus(); return; }
      signedIn(r); });
  };
  $("#tfa-form").onsubmit = function (e) {
    e.preventDefault(); var b = $("#t-btn"); b.disabled = true; $("#t-err").textContent = "";
    api("login_2fa", { ticket: S.ticket, code: $("#t-code").value }).then(function (r) { b.disabled = false; if (!r.ok) { $("#t-err").textContent = r.error; if (/expired/.test(r.error)) setTimeout(function () { showAuth("login"); }, 1500); return; } S.ticket = null; signedIn(r); });
  };
  $("#t-back").onclick = function () { showAuth("login"); };
  $("#setup-form").onsubmit = function (e) {
    e.preventDefault(); var b = $("#s-btn"); b.disabled = true; $("#s-err").textContent = "";
    api("setup", { dbHost: $("#s-host").value, dbName: $("#s-name").value, dbUser: $("#s-user").value, dbPass: $("#s-dpass").value, name: $("#s-uname").value, email: $("#s-email").value, password: $("#s-pass").value, builderPassword: $("#s-bpass").value })
      .then(function (r) { b.disabled = false; if (!r.ok) return ($("#s-err").textContent = r.error); if (r.reconnected) { toast(r.message); showAuth("login"); return; } toast("Woodex Admin is ready ✓"); signedIn(r); });
  };
  $("#logout").onclick = function () { api("logout").then(function () { signedOut(); }); };

  // ---------------------------------------------------------------- chrome
  // P16: Ctrl+K / Cmd+K quick search across every menu item
  function navFlat() { var r = []; NAV.forEach(function (n) { if (n.g) n.items.forEach(function (x) { r.push([x, n.g]); }); else if (n.length > 1) r.push([n, ""]); }); return r.filter(function (x) { return !x[0][3] || can(x[0][3]); }); }
  function palette() {
    if (!S.user) return; var all = navFlat(), idx = 0;
    modal('<input id="pk-q" placeholder="Search screens… (e.g. invoice, speed, whatsapp)" autocomplete="off" style="font-size:16px"><div id="pk-l" class="pk-l"></div><p class="muted" style="font-size:12px;margin:8px 0 0">↑ ↓ to move · Enter to open · Esc to close</p>');
    function draw() { var q = $("#pk-q").value.toLowerCase(), m = all.filter(function (x) { return (x[0][1] + " " + x[1] + " " + x[0][0]).toLowerCase().indexOf(q) > -1; }).slice(0, 12); idx = Math.min(idx, Math.max(0, m.length - 1));
      $("#pk-l").innerHTML = m.map(function (x, i) { return '<a href="#/' + x[0][0] + '" class="pk-i' + (i === idx ? " on" : "") + '">' + ic(x[0][2]) + "<span>" + x[0][1] + "</span>" + (x[1] ? '<small class="muted">' + x[1] + "</small>" : "") + "</a>"; }).join("") || '<p class="muted" style="padding:10px">No match</p>';
      $$("#pk-l a").forEach(function (a) { a.onclick = closeModal; }); }
    $("#pk-q").oninput = function () { idx = 0; draw(); };
    $("#pk-q").onkeydown = function (e) { var n = $$("#pk-l a").length; if (e.key === "ArrowDown") { idx = (idx + 1) % n; draw(); e.preventDefault(); } else if (e.key === "ArrowUp") { idx = (idx - 1 + n) % n; draw(); e.preventDefault(); } else if (e.key === "Enter") { var a = $$("#pk-l a")[idx]; if (a) { location.hash = a.getAttribute("href"); closeModal(); } } };
    draw(); $("#pk-q").focus();
  }
  document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); palette(); } });
  window.WXA_palette = palette;
  if ($("#pk-btn")) $("#pk-btn").onclick = palette;
  $("#menu-btn").onclick = function () { innerWidth <= 1024 ? $("#app").classList.toggle("open") : $("#app").classList.toggle("mini"); };
  $("#side-x").onclick = $("#side-shade").onclick = function () { $("#app").classList.remove("open"); };
  $("#dark-btn").onclick = function () { var d = document.documentElement.classList.toggle("dark"); localStorage.setItem("wxaTheme", d ? "dark" : "light"); if (S.view === "dashboard") route(); };
  $("#user-btn").onclick = function (e) { e.stopPropagation(); $("#user-menu").hidden = !$("#user-menu").hidden; };
  document.addEventListener("click", function () { $("#user-menu").hidden = true; });
  $("#gsearch").addEventListener("change", function () {
    var v = this.value.trim(), p = (S.pages || []).find(function (x) { return x.url === v; }); if (!p) return;
    this.value = ""; location.hash = "#/builder/" + encodeURIComponent(p.path);
  });

  // ---------------------------------------------------------------- router
  window.addEventListener("hashchange", route);
  function route0Mark(v) {
    v = v || S.view;
    var nv = { quote: "quotes", template: "templates", invoice: "invoices", post: "blog", study: "portfolio", fields: "services", citydraft: "cities" }[v] || v; $$(".nav-a").forEach(function (a) { a.classList.toggle("on", a.dataset.v === nv); }); $$(".nav-g").forEach(function (g) { var has = !!g.querySelector('.nav-a[data-v="' + nv + '"]'); g.classList.toggle("has-on", has); if (has) g.classList.add("open"); }); $$(".nav-sec.shut").forEach(function (x) { if (x.querySelector(".nav-a.on")) x.classList.remove("shut"); });
  }
  function route() {
    if (!S.user) return;
    var parts = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/"), v = parts[0];
    var ALIAS = { leads: "enquiries", posts: "blog", lead: "enquiries" }; /*P19: old links*/ if (ALIAS[v]) { v = parts[0] = ALIAS[v]; history.replaceState(null, "", "#/" + parts.join("/")); }
    var SUB = { quote: "quotes", template: "templates", invoice: "invoices", post: "blog", study: "portfolio", fields: "services", citydraft: "cities" };
    var FLAT = []; NAV.forEach(function (n) { if (n.g) FLAT.push.apply(FLAT, n.items); else if (Array.isArray(n)) FLAT.push(n); });
    var find = function (k) { return FLAT.find(function (n) { return n[0] === k; }); };
    var def = find(SUB[v] || v);
    if (!def && v !== "profile") v = "dashboard", def = find("dashboard");
    if (def && def[3] && !can(def[3])) { v = "dashboard"; toast("You do not have access to that section", true); }
    S.view = v; S.charts.forEach(function (c) { c.destroy(); }); S.charts = [];
    route0Mark(v);
    $("#app").classList.remove("open");
    var old = $("#view"), view = old.cloneNode(false); old.parentNode.replaceChild(view, old); view.className = "content"; /* fresh element: listeners from the previous screen can never fire here */ $("#app").classList.toggle("mini", v === "builder" && innerWidth > 1024 ? true : $("#app").classList.contains("mini") && S.lastView !== "builder");
    S.lastView = v;
    (VIEWS[v] || VIEWS.soon)(view, parts.slice(1), def);
    hubBar(view, v);     fillIcons(view); window.scrollTo(0, 0);
    document.title = (def ? def[1] : "My profile") + " · Woodex Admin";
  }
  // P19 D: hubs — one sidebar item, related screens as tabs on top
  var HUBS = [
    { id: "ai-hub", items: [["aicenter", "Settings"], ["train", "Knowledge & Q&A"], ["aireport", "AI report"]] },
    { id: "wa-hub", items: [["wahub", "Overview & rules"], ["wainsights", "Insights"], ["wauto", "Broadcasts & automations"], ["offers", "Discount offers"]] }
  ];
  function hubOf(v) { for (var i = 0; i < HUBS.length; i++) for (var j = 0; j < HUBS[i].items.length; j++) if (HUBS[i].items[j][0] === v) return HUBS[i]; return null; }
  function hubBar(view, v) {
    var h = hubOf(v); if (!h) return;
    if (h.id === "settings" && v === "security" && !can("owner,admin")) return;
    var FL = []; NAV.forEach(function (n) { if (n.g) FL.push.apply(FL, n.items); else if (Array.isArray(n)) FL.push(n); });
    var allowed = h.items.filter(function (x) { var d = FL.find(function (n) { return n[0] === x[0]; }); return d && (!d[3] || can(d[3])); });
    var bar = document.createElement("nav"); bar.className = "hub-bar"; bar.setAttribute("aria-label", "Section");
    bar.innerHTML = allowed.map(function (x) { return '<a href="#/' + x[0] + '"' + (x[0] === v ? ' class="on" aria-current="page"' : "") + ">" + x[1] + "</a>"; }).join("");
    view.insertBefore(bar, view.firstChild);
    if (window.MutationObserver) { var mo = new MutationObserver(function () { if (!view.isConnected) return mo.disconnect(); if (!bar.isConnected) view.insertBefore(bar, view.firstChild); }); mo.observe(view, { childList: true }); }
    $$(".nav-a").forEach(function (a) { if (a.dataset.v === h.id) a.classList.add("on"); });
    var on = bar.querySelector(".on"); if (on) setTimeout(function () { on.scrollIntoView({ block: "nearest", inline: "center" }); }, 0);
  }
  function head(title, crumb, right) { return '<div class="ph"><div><h1>' + esc(title) + '</h1><div class="crumb"><a href="#/dashboard">Home</a> / ' + esc(crumb || title) + "</div></div>" + (right ? '<div class="toolbar">' + right + "</div>" : "") + "</div>"; }

  var VIEWS = {};

  // ---------------- dashboard
  VIEWS.dashboard = function (el) {
    var h = new Date().getHours(), hi = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    el.innerHTML = head(hi + ", " + S.user.name.split(" ")[0], "Dashboard", can("owner,admin,editor") ? '<a class="btn" href="/" target="_blank">' + ic("eye") + 'View site</a><a class="btn pri" href="#/builder">' + ic("square-pen") + "Open builder</a>" : "") + '<div class="empty">Loading…</div>';
    api("dashboard").then(function (r) {
      if (S.view !== "dashboard") return;
      if (!r.ok) return (el.querySelector(".empty").textContent = r.error);
      var s = r.stats, kpi = function (icon, label, val, badge) { return '<div class="card kpi"><div class="kpi-ic">' + ic(icon) + "</div><small>" + label + '</small><div class="kpi-row"><b>' + val + "</b>" + (badge || "") + "</div></div>"; };
      el.querySelector(".empty").outerHTML =
        '<div class="grid kpis">' +
          kpi("file-text", "Website pages", s.pages, '<span class="badge gold">' + Object.keys(s.folders).length + " folders</span>") +
          (s.leadsMonth != null ? kpi("inbox", "Enquiries this month", s.leadsMonth, '<span class="badge ' + (s.leadsUnread ? "warn" : "ok") + '">' + (s.leadsUnread ? s.leadsUnread + " unread" : "all read") + "</span>") : "") +
          kpi("square-pen", "Edits (last 7 days)", s.edits7, '<span class="badge ' + (s.edits7 ? "ok" : "") + '">' + (s.edits7 ? "active" : "quiet") + "</span>") +
          kpi("image", "Uploaded images", s.media, '<span class="badge">' + bytes(s.mediaBytes) + "</span>") +
          kpi("hard-drive", "Page backups", s.backups, '<span class="badge ' + (s.lastBackup ? "info" : "warn") + '">' + (s.lastBackup ? "last " + ago(s.lastBackup) : "none yet") + "</span>") +
        "</div>" +
        '<div class="grid g-7-5" style="margin-top:24px">' +
          '<div class="card"><div class="card-h"><h3>Website edits</h3><span class="badge">Last 14 days</span></div><div class="card-b"><div class="chart-box"><canvas id="ch-edits"></canvas></div></div></div>' +
          '<div class="card"><div class="card-h"><h3>Pages by section</h3></div><div class="card-b"><div class="chart-box"><canvas id="ch-folders"></canvas></div></div></div>' +
        "</div>" +
        '<div class="grid g-7-5" style="margin-top:24px">' +
          '<div class="card"><div class="card-h"><h3>Recent activity</h3>' + (can("owner,admin") ? '<a class="btn sm" href="#/activity">View all</a>' : "") + '</div><div class="card-b">' +
            (r.recent.length ? '<ul class="feed">' + r.recent.map(function (a) { var t = actText(a); return '<li><span class="dot">' + ic(t.icon) + "</span><div><b>" + esc(a.user_name || "System") + "</b> " + esc(t.text) + (a.target ? ' <span class="muted">' + esc(a.target) + "</span>" : "") + "<small>" + ago(a.created_at) + "</small></div></li>"; }).join("") + "</ul>" : '<div class="empty">No activity yet.</div>') +
          "</div></div>" +
          '<div class="card"><div class="card-h"><h3>Admin v2 roadmap</h3><span class="badge gold">Phase A2</span></div><div class="card-b"><div class="roadmap" style="grid-template-columns:1fr 1fr">' +
            [["A1", "Dashboard, login, roles", 1], ["A2", "Pages manager, header/footer", 1], ["A3", "Section library", 1], ["A4", "Enquiries & CRM, WhatsApp", 1], ["A5", "Quotes, invoices, projects", 1], ["A6", "Blog, portfolio, team, services, cities, business info", 1], ["A7", "Media, backups, site health", 1], ["A8", "Settings, integrations, security", 1]]
              .map(function (x) { return '<div class="rm"><span class="badge ' + (x[2] ? "ok" : "") + '">' + x[0] + (x[2] ? " · live" : "") + "</span><b>" + x[1] + "</b></div>"; }).join("") +
          "</div></div></div>" +
        "</div>";
      fillIcons(el); drawCharts(r, s);
    });
  };
  function drawCharts(r, s) {
    if (!window.Chart) return setTimeout(function () { drawCharts(r, s); }, 150);
    var dark = document.documentElement.classList.contains("dark"), grid = dark ? "#1f2533" : "#eef0f3", txt = dark ? "#94969c" : "#667085";
    Chart.defaults.font.family = '"DM Sans",system-ui,sans-serif'; Chart.defaults.color = txt;
    var days = [], vals = []; for (var i = 13; i >= 0; i--) { var d = new Date(Date.now() - i * 864e5), k = d.toISOString().slice(0, 10); days.push(d.toLocaleDateString(undefined, { day: "numeric", month: "short" })); vals.push(r.editsByDay[k] || 0); }
    var c1 = $("#ch-edits"); if (!c1) return;
    var g = c1.getContext("2d").createLinearGradient(0, 0, 0, 260); g.addColorStop(0, "rgba(212,175,106,.35)"); g.addColorStop(1, "rgba(212,175,106,0)");
    S.charts.push(new Chart(c1, { type: "line", data: { labels: days, datasets: [{ label: "Changes", data: vals, borderColor: "#d4af6a", backgroundColor: g, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: "#d4af6a", borderWidth: 2.5 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: grid }, border: { display: false } } } } }));
    var f = Object.keys(s.folders).map(function (k) { return [k, s.folders[k]]; }).sort(function (a, b) { return b[1] - a[1]; }), top = f.slice(0, 6), rest = f.slice(6).reduce(function (a, b) { return a + b[1]; }, 0);
    if (rest) top.push(["other", rest]);
    S.charts.push(new Chart($("#ch-folders"), { type: "doughnut", data: { labels: top.map(function (x) { return x[0]; }), datasets: [{ data: top.map(function (x) { return x[1]; }), backgroundColor: [dark ? "#f5f5f6" : "#0a0f1e", "#d4af6a", "#465fff", "#12b76a", "#f79009", "#98a2b3", "#e4e7ec"], borderColor: dark ? "#161b26" : "#fff", borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } } } }));
  }

  // ---------------- pages (quick list; full manager in A2)
  VIEWS.pages = function (el) {
    el.innerHTML = head("Pages", "Pages", '<input type="search" id="pg-q" placeholder="Search pages…"><a class="btn pri" href="#/builder">' + ic("square-pen") + "Open builder</a>") +
      '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th>Address</th><th>Last changed</th><th></th></tr></thead><tbody id="pg-rows"><tr><td colspan="4" class="empty">Loading…</td></tr></tbody></table></div>' +
      '<div class="pager"><span id="pg-count"></span><span class="badge gold">Full pages manager (status, SEO, templates, redirects) arrives in Phase A2</span></div></div>';
    var draw = function () {
      var q = ($("#pg-q").value || "").toLowerCase(), list = (S.pages || []).filter(function (p) { return !q || (p.url + p.title).toLowerCase().indexOf(q) >= 0; });
      $("#pg-rows").innerHTML = list.map(function (p) { return "<tr><td><b style='color:var(--txt)'>" + esc(p.title) + "</b></td><td><a href='" + esc(p.url) + "' target='_blank' class='muted'>" + esc(p.url) + "</a></td><td>" + ago(p.mtime) + "</td><td style='text-align:right'><a class='btn sm' href='#/builder/" + encodeURIComponent(p.path) + "'>" + ic("square-pen") + "Edit</a></td></tr>"; }).join("") || "<tr><td colspan='4' class='empty'>No pages match.</td></tr>";
      $("#pg-count").textContent = list.length + " of " + (S.pages || []).length + " pages";
    };
    $("#pg-q").oninput = draw;
    (S.pages ? Promise.resolve({ ok: true, pages: S.pages }) : bapi("pages")).then(function (r) { if (r.ok) { S.pages = r.pages; draw(); } });
  };

  // ---------------- builder (single sign-on)
  VIEWS.builder = function (el, args) {
    el.className = "content full";
    if (!S.btoken) { el.innerHTML = '<div class="content"><div class="card soon-box"><h2>No builder access</h2><p>Your role cannot edit pages.</p></div></div>'; return; }
    sessionStorage.setItem("wxTok", S.btoken);
    el.innerHTML = '<iframe class="builder-frame" title="Page builder" src="/builder/' + (args[0] ? "#" + args.join("/") : "") + '"></iframe>';
  };

  // ---------------- users
  VIEWS.users = function (el) {
    el.innerHTML = head("Team & roles", "Team", '<button class="btn pri" id="u-add">' + ic("plus") + "Add member</button>") +
      '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody id="u-rows"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody></table></div></div>' +
      '<div class="card" style="margin-top:24px"><div class="card-h"><h3>What each role can do</h3></div><div class="card-b"><div class="roadmap">' +
        [["Master", "Everything. Adds users, sets roles and extra permissions, backups, database. Approves Manager changes (Phase 2)."], ["Manager", "Sees and prepares everything: sales, conversations, website, settings. Cannot add users or restore backups."], ["Developer", "Website only: pages, builder, hero slides, content, media, SEO, theme, integrations. No sales data."], ["Sales", "Leads, pipeline, bookings, clients, quotes, invoices, projects and the Inbox."], ["Support", "Inbox (website chat + WhatsApp) and client updates; can view a client or project to answer."]]
          .map(function (r) { return '<div class="rm"><span class="badge gold">' + r[0] + "</span><small style='display:block;margin-top:6px'>" + r[1] + "</small></div>"; }).join("") + "</div></div></div>";
    var users = [];
    var load = function () { api("users").then(function (r) { if (!r.ok) return toast(r.error, true); users = r.users; draw(); }); };
    var draw = function () {
      $("#u-rows").innerHTML = users.map(function (u) {
        return "<tr><td><div class='who'><span class='av'>" + initials(u.name) + "</span><div><b>" + esc(u.name) + (u.id === S.user.id ? " <span class='badge'>you</span>" : "") + "</b><small>" + esc(u.email) + "</small></div></div></td><td><span class='badge gold' data-role='" + u.role + "'>" + (ROLE_LABEL[u.role] || u.role) + "</span>" + ((u.perms || []).length ? "<small class='muted' style='display:block;margin-top:4px'>+ " + u.perms.map(function (p) { return PERM_LABEL[p] || p; }).join(", ") + "</small>" : "") + "</td><td>" +
          (u.active ? "<span class='badge ok'>Active</span>" : "<span class='badge bad'>Disabled</span>") + "</td><td>" + (u.last_login ? ago(u.last_login) : "never") + "</td><td style='text-align:right'>" +
          (u.role === "owner" && S.user.role !== "owner" ? "" : "<button class='btn sm' data-edit='" + u.id + "'>Edit</button>") + "</td></tr>";
      }).join("");
      $$("[data-edit]").forEach(function (b) { b.onclick = function () { form(users.find(function (u) { return u.id === +b.dataset.edit; })); }; });
    };
    var form = function (u) {
      u = u || { id: 0, name: "", email: "", role: "editor", active: true };
      var roles = ["owner", "admin", "editor", "sales", "support"].filter(function (r) { return r !== "owner" || S.user.role === "owner"; }); u.perms = u.perms || [];
      modal("<h2>" + (u.id ? "Edit team member" : "Add team member") + "</h2><form id='uf'><div class='g2'><label>Name<input id='uf-n' value='" + esc(u.name) + "' required></label><label>Email<input type='email' id='uf-e' value='" + esc(u.email) + "' required></label></div>" +
        "<div class='g2'><label>Role<select id='uf-r'>" + roles.map(function (r) { return "<option value='" + r + "'" + (r === u.role ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>"; }).join("") + "</select></label>" +
        "<label>" + (u.id ? "New password <small>(leave empty to keep)</small>" : "Password <small>(8+ characters)</small>") + "<input type='text' id='uf-p' autocomplete='new-password'" + (u.id ? "" : " required minlength='8'") + "></label></div>" +
        "<label class='check'><input type='checkbox' id='uf-a'" + (u.active ? " checked" : "") + "> Active (can sign in)</label>" + (S.user.role === "owner" ? "<fieldset class='uf-perms'><legend>Extra permissions <small class='muted'>(on top of the role)</small></legend>" + Object.keys(PERM_LABEL).map(function (p) { return "<label class='check'><input type='checkbox' data-perm='" + p + "'" + (u.perms.indexOf(p) >= 0 ? " checked" : "") + "> " + PERM_LABEL[p] + "</label>"; }).join("") + "</fieldset>" : "") + "<p class='err' id='uf-err'></p>" +
        "<div class='modal-actions'><button type='button' class='btn' id='uf-c'>Cancel</button><button class='btn pri'>" + (u.id ? "Save changes" : "Add member") + "</button></div></form>");
      $("#uf-c").onclick = closeModal;
      $("#uf").onsubmit = function (e) {
        e.preventDefault();
        var pay = { id: u.id, name: $("#uf-n").value, email: $("#uf-e").value, role: $("#uf-r").value, password: $("#uf-p").value, active: $("#uf-a").checked }; if (S.user.role === "owner") pay.perms = $$("[data-perm]").filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.perm; });
        api("user_save", pay)
          .then(function (r) { if (!r.ok) return ($("#uf-err").textContent = r.error); closeModal(); toast(u.id ? "Saved ✓" : "Team member added ✓"); load(); });
      };
    };
    $("#u-add").onclick = function () { form(); };
    load();
  };

  // ---------------- activity
  VIEWS.activity = function (el) {
    el.innerHTML = head("Activity log", "Activity", '<input type="search" id="a-q" placeholder="Search user, action, page…">') +
      '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th><th>IP</th></tr></thead><tbody id="a-rows"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody></table></div><div class="pager"><span id="a-info"></span><span><button class="btn sm" id="a-prev">' + ic("chevron-left") + '</button> <button class="btn sm" id="a-next">' + ic("chevron-right") + "</button></span></div></div>";
    var page = 1, t;
    var load = function () {
      api("activity", { page: page, q: $("#a-q").value }).then(function (r) {
        if (!r.ok) return toast(r.error, true);
        $("#a-rows").innerHTML = r.rows.map(function (a) { var x = actText(a); return "<tr><td title='" + esc(a.created_at) + "'>" + ago(a.created_at) + "</td><td><b style='color:var(--txt)'>" + esc(a.user_name || "System") + "</b></td><td><span style='display:inline-flex;gap:8px;align-items:center'>" + ic(x.icon) + esc(x.text) + "</span></td><td class='muted'>" + esc(a.target || "") + "</td><td class='muted'>" + esc(a.ip || "") + "</td></tr>"; }).join("") || "<tr><td colspan='5' class='empty'>Nothing found.</td></tr>";
        fillIcons($("#a-rows"));
        var last = Math.max(1, Math.ceil(r.total / r.per)); $("#a-info").textContent = r.total + " entries · page " + page + " of " + last;
        $("#a-prev").disabled = page <= 1; $("#a-next").disabled = page >= last;
      });
    };
    $("#a-prev").onclick = function () { page--; load(); }; $("#a-next").onclick = function () { page++; load(); };
    $("#a-q").oninput = function () { clearTimeout(t); t = setTimeout(function () { page = 1; load(); }, 250); };
    load();
  };

  // ---------------- profile
  VIEWS.profile = function (el) {
    el.innerHTML = head("My profile", "Profile") + '<div class="grid g-7-5">' +
      '<div class="card"><div class="card-h"><h3>Details</h3></div><div class="card-b"><div class="who" style="margin-bottom:20px"><span class="av" style="width:56px;height:56px;font-size:18px">' + initials(S.user.name) + "</span><div><b>" + esc(S.user.name) + "</b><small>" + esc(S.user.email) + " · " + S.user.role + "</small></div></div>" +
        '<form id="pf"><label>Name<input id="pf-n" value="' + esc(S.user.name) + '" required></label><label>Email <small>(ask an admin to change)</small><input value="' + esc(S.user.email) + '" disabled></label><button class="btn pri">Save</button></form></div></div>' +
      '<div class="card"><div class="card-h"><h3>Change password</h3></div><div class="card-b"><form id="pw"><label>Current password<input type="password" id="pw-c" required autocomplete="current-password"></label><label>New password <small>(8+ characters)</small><input type="password" id="pw-n" minlength="8" required autocomplete="new-password"></label><p class="err" id="pw-err"></p><button class="btn pri">Update password</button></form></div></div></div>';
    $("#pf").onsubmit = function (e) { e.preventDefault(); api("profile", { name: $("#pf-n").value }).then(function (r) { if (!r.ok) return toast(r.error, true); S.user = r.user; $("#u-name").textContent = r.user.name; $("#u-av").textContent = initials(r.user.name); toast("Profile saved ✓"); }); };
    $("#pw").onsubmit = function (e) { e.preventDefault(); api("password", { current: $("#pw-c").value, next: $("#pw-n").value }).then(function (r) { if (!r.ok) return ($("#pw-err").textContent = r.error); S.token = r.token; sessionStorage.setItem("wxaTok", r.token); $("#pw").reset(); $("#pw-err").textContent = ""; toast("Password updated ✓"); }); };
  };

  // ---------------- coming soon
  var SOON = {
    library: ["blocks", "Save sections with categories and thumbnails, reuse them on any page, and edit “global” sections once to update every page."],
    enquiries: ["inbox", "Every website form lands here: enquiries → leads → pipeline → clients, with WhatsApp and email alerts."],
    quotes: ["receipt", "Build quotations from templates, send by WhatsApp or email, convert to invoices."],
    projects: ["briefcase", "Track projects by stage with photos and client updates."],
    media: ["image", "Folders, WebP conversion, unused-image finder and bulk alt text. (Uploading already works inside the builder.)"],
    backups: ["hard-drive", "Full-site backup ZIP and one-click restore. (Every page save already keeps 30 backups.)"],
    settings: ["settings", "Contact details in one place, Google Analytics, WhatsApp Cloud API, AI (Claude) keys with spending limits."]
  };
  VIEWS.soon = function (el, a, def) {
    var s = SOON[def[0]] || ["sparkles", ""];
    el.innerHTML = head(def[1]) + '<div class="card soon-box"><div class="kpi-ic">' + ic(s[0]) + "</div><h2>" + esc(def[1]) + ' <span class="badge gold">Phase ' + def[4] + "</span></h2><p>" + esc(s[1]) + '</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>';
  };

  /* Screens from separate files (defer scripts) may not exist yet when the first screen is drawn after a refresh:
     redraw once everything has loaded, if a placeholder was shown for a screen that now exists. */
  window.addEventListener("load", function () { setTimeout(function () { if (S.user && document.querySelector("#view .soon-box")) { var v = (location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard"); if (VIEWS[v] && VIEWS[v] !== VIEWS.soon) route(); } }, 0); });
  window.WXA = { formDraft: formDraft, S: S, signedIn: signedIn, showAuth: showAuth, api: api, bapi: bapi, modal: modal, closeModal: closeModal, toast: toast, esc: esc, ic: ic, fillIcons: fillIcons, ago: ago, head: head, navBadges: function () { navBadges(); }, can: can, ROLE_LABEL: ROLE_LABEL, PERM_LABEL: PERM_LABEL, VIEWS: VIEWS, $: $, $$: $$, route: function () { route(); } };
  Object.assign(ACT, { "page.meta": ["file-text", "updated SEO/settings of"], "page.delete": ["x", "deleted page"], "redirects.save": ["refresh-cw", "saved redirects"], "global.menu": ["panel-left", "updated the site menu on"], "global.replace": ["refresh-cw", "replaced in header/footer"], "global.chrome": ["panel-left", "published header & footer on"] });

  // ---------------------------------------------------------------- boot
  fillIcons(document);
  api("status").then(function (st) {
    if (!st.ok) { showAuth("login"); return ($("#l-err").textContent = st.error || "Admin API is not reachable"); }
    if (st.needsSetup || st.dbError) { location.replace("/wx-install.php"); return; }
    if (st.dbError) { showAuth("db", st); return $("#d-name").focus(); }
    if (st.user) return api("me").then(function (r) { r.ok ? signedIn(r) : signedOut(); });
    showAuth("login");
  });
})();
