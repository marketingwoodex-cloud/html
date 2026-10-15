/* Woodex Page Builder v2 — VvvebJs-style 3-panel visual editor for frontend-v1.
 * Canvas: the page's own HTML in an iframe (page scripts paused while editing).
 * Per-device styles are stored as JSON in <script id="wx-style-data"> and compiled
 * into <style id="wx-custom-css"> (desktop base, tablet ≤1024px, mobile ≤640px).  */
(function () {
  "use strict";
  var API = "/api/builder.php";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var S = { csrf: sessionStorage.getItem("wxTok"), pages: [], path: null, mtime: 0, doc: null, sel: null, hover: null, editing: null, editStart: "",
            hist: [], hi: -1, savedSnap: "", seoSaved: "", theme: {}, styles: {}, dev: "d", preview: false, drag: null, open: new WeakSet() };

  // =================================================================== API / AUTH
  function api(action, data, file) {
    var o = { method: "POST", headers: { "X-WX-CSRF": S.csrf || "", "X-WX-ADM": sessionStorage.getItem("wxaTok") || "" } };
    if (file) { var fd = new FormData(); fd.append("action", action); fd.append("file", file); o.body = fd; }
    else { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(Object.assign({ action: action }, data || {})); }
    return fetch(API, o).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Server error (" + r.status + ")" }; }).then(function (j) {
        j.status = r.status;
        if (j.pending) setTimeout(function () { toast((j.message || "Sent to the Master for approval")); }, 80);
        if (r.status === 401 && action !== "login" && action !== "status") {
          sessionStorage.removeItem("wxTok"); S.csrf = null;
          if (S.adminOnly) adminRenew().then(function (ok) { if (ok) toast("Session renewed — please try that again."); else showLogin(false); }); else showLogin(false);
        }
        return j;
      });
    }).catch(function () { return { ok: false, error: "Cannot reach the server — refresh the page" }; });
  }
  function toast(m, err) { var t = $("#toast"); t.textContent = m; t.className = "toast show" + (err ? " err" : ""); clearTimeout(t._h); t._h = setTimeout(function () { t.className = "toast"; }, err ? 5000 : 2200); }
  /* Woodex Admin installed → the builder password is retired. Sign-in happens in /admin/, which hands over a
     session-bound builder token (sessionStorage "wxTok"). An expired token is renewed silently from the admin session. */
  function adminRenew() {
    var at = sessionStorage.getItem("wxaTok"); if (!at) return Promise.resolve(false);
    return fetch("/api/admin.php", { method: "POST", headers: { "Content-Type": "application/json", "X-WX-ADM": at }, body: JSON.stringify({ action: "me" }) })
      .then(function (r) { return r.json(); }).then(function (r) {
        if (r.ok && r.builderToken) { S.csrf = r.builderToken; sessionStorage.setItem("wxTok", r.builderToken); return true; }
        return false;
      }).catch(function () { return false; });
  }
  // Re-sign-in window (opened by us) sends the new session back: accept it only from that exact window.
  var adminWin = null;
  window.addEventListener("message", function (e) {
    var d = e.data || {}; if (e.origin !== location.origin || !adminWin || e.source !== adminWin || d.t !== "wx-session" || !S.adminOnly) return;
    if (!/^\d{10}\.\d+\.[a-f0-9]{16}\.[a-f0-9]{64}$/.test(String(d.bld || ""))) return;
    sessionStorage.setItem("wxaTok", d.adm); sessionStorage.setItem("wxTok", d.bld); S.csrf = d.bld;
    if (S.doc) { $("#login").hidden = true; toast("Signed in again, your edits are safe. Click Save."); } else boot();
  });
  function showAdminLogin(msg) {
    $("#app").hidden = !S.doc; $("#login").hidden = false; $("#login-form").dataset.admin = "1";
    $("#login-title").textContent = "Page Builder";
    $("#login-sub").textContent = msg || "Sign in through Woodex Admin to edit the website.";
    $$("#login-form label, #login-pass, #login-confirm-wrap").forEach(function (x) { x.hidden = true; });
    $("#login-pass").required = false; $("#login-btn").textContent = "Sign in with Woodex Admin";
  }
  function showLogin(setup) {
    if (S.adminOnly) return showAdminLogin(S.doc ? "Your session ended. Sign in again in Woodex Admin, then come back and click Save — your edits are kept in this tab." : "");
    $("#app").hidden = !S.doc; $("#login").hidden = false;
    $("#login-title").textContent = setup ? "Create builder password" : "Page Builder";
    $("#login-sub").textContent = setup ? "First run: choose the admin password (min 8 characters)." : "Sign in to edit the website.";
    $("#login-confirm-wrap").hidden = !setup; $("#login-btn").textContent = setup ? "Create & sign in" : "Sign in";
    $("#login-form").dataset.setup = setup ? "1" : ""; setTimeout(function () { $("#login-pass").focus(); }, 50);
  }
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (this.dataset.admin === "1") {
      if (S.doc) { adminRenew().then(function (ok) { if (ok) { $("#login").hidden = true; toast("Signed in again, your edits are safe. Click Save."); } else adminWin = window.open("/admin/#builder", "wx-admin-signin"); }); return; }
      location.href = "/admin/#builder"; return;
    }
    var setup = this.dataset.setup === "1", pw = $("#login-pass").value;
    if (setup && pw !== $("#login-pass2").value) { $("#login-err").textContent = "Passwords do not match"; return; }
    $("#login-btn").disabled = true;
    api(setup ? "setup" : "login", { password: pw }).then(function (r) {
      $("#login-btn").disabled = false;
      if (!r.ok) { $("#login-err").textContent = r.error; return; }
      S.csrf = r.csrf; sessionStorage.setItem("wxTok", r.csrf); $("#login-pass").value = ""; $("#login-err").textContent = "";
      if (S.doc) { $("#login").hidden = true; toast("Signed in again, your edits are safe. Click Save."); } else boot();
    });
  });
  function boot() {
    $("#login").hidden = true; $("#app").hidden = false;
    api("pages").then(function (r) {
      if (!r.ok) return toast(r.error, true);
      S.pages = r.pages;
      $("#page-select").innerHTML = r.pages.map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.url + "  ·  " + p.title) + "</option>"; }).join("");
      S.pageLinks = r.pages.map(function (p) { return '<option value="' + esc(p.url) + '">' + esc(p.title) + "</option>"; }).join("");
      var want = decodeURIComponent(location.hash.slice(1)) || "index.html";
      if (!r.pages.some(function (p) { return p.path === want; })) want = "index.html";
      $("#page-select").value = want; loadPage(want);
    });
    api("theme_get").then(function (r) { if (r.ok) { S.theme = r.vars || {}; fillTheme(); } });
  }
  api("status").then(function (r) {
    S.adminOnly = !!r.adminOnly; document.body.classList.toggle("wx-admin-only", S.adminOnly);
    if (r.loggedIn) return boot();
    sessionStorage.removeItem("wxTok"); S.csrf = null;
    (S.adminOnly ? adminRenew() : Promise.resolve(false)).then(function (ok) { if (ok) boot(); else showLogin(r.needsSetup); });
  });

  // =================================================================== SANITIZE (A3/A4)
  function sanitize(root) {
    var n = 0;
    [root].concat($$("*", root)).forEach(function (el) {
      if (!el.attributes) return;
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var bad = /^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value));
        if (bad) { el.removeAttribute(a.name); n++; }
      });
    });
    return n;
  }
  var SAFE_IFRAME = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|google\.com\/maps|maps\.google\.com)/i;

  // =================================================================== LOAD PAGE
  var EDIT_CSS = [
    '[data-home-reveal],[data-svc-reveal],[class*="reveal"],[data-reveal]{opacity:1!important;transform:none!important;visibility:visible!important;clip-path:none!important}',
    "[contenteditable=true]{outline:2px solid #2563eb!important;outline-offset:2px;cursor:text!important}",
    "main>[hidden]{display:block!important;opacity:.3!important}",
    ".wx-skip{display:none!important}a,button,label,summary{cursor:default}",
    "iframe{pointer-events:none}"
  ].join("\n");

  function loadPage(path) {
    $("#loading").hidden = false; deselect();
    api("load", { path: path }).then(function (r) {
      if (!r.ok) { $("#loading").hidden = true; return toast(r.error, true); }
      S.path = path; S.mtime = r.mtime; history.replaceState(null, "", "#" + encodeURIComponent(path));
      var page = S.pages.find(function (p) { return p.path === path; }); $("#view-live").href = page ? page.url : "/";
      mountHTML(r.html);
    });
  }
  function mountHTML(html) {
    $("#loading").hidden = false; deselect(); var path = S.path;
      var doc = new DOMParser().parseFromString(html, "text/html");
      $$("script", doc).forEach(function (s) { s.setAttribute("data-wx-t", s.hasAttribute("type") ? s.getAttribute("type") : "__none"); s.setAttribute("type", "text/wx-off"); });
      sanitize(doc.body);
      var base = doc.createElement("base"); base.href = location.origin + "/" + path.replace(/[^/]*$/, ""); base.setAttribute("data-wx-ed", ""); doc.head.insertBefore(base, doc.head.firstChild);
      var st = doc.createElement("style"); st.setAttribute("data-wx-ed", ""); st.textContent = EDIT_CSS; doc.head.appendChild(st);
      var th = doc.createElement("style"); th.setAttribute("data-wx-ed", ""); th.id = "wx-theme-live"; doc.head.appendChild(th);
      var f = $("#frame");
      f.onload = function () { ready(f.contentDocument); };
      f.srcdoc = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }
  function ready(doc) {
    S.doc = doc; $("#loading").hidden = true;
    var data = doc.getElementById("wx-style-data");
    try { S.styles = data ? JSON.parse(data.textContent || "{}") : {}; } catch (e) { S.styles = {}; }
    doc.addEventListener("mousemove", onMove, true);
    doc.addEventListener("mouseleave", function () { S.hover = null; }, true);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("submit", function (e) { e.preventDefault(); }, true);
    doc.addEventListener("keydown", onKey, true);
    frameMouse();
    doc.addEventListener("paste", onPaste, true);
    doc.addEventListener("input", function () { if (S.editing) syncTextField(); }, true);
    doc.addEventListener("dragover", onDragOver, true);
    doc.addEventListener("drop", onDrop, true);
    doc.addEventListener("dragleave", function (e) { if (!e.relatedTarget) hideDrop(); }, true);
    S.hist = []; S.hi = -1; pushHist(true); S.savedSnap = snap(); S.seoSaved = seoSnap();
    fillSeo(); applyTheme(); renderCSS(); renderLayers(); updateDirty();
    S.regOrig = regionSnap(doc);
    $("#wx-links").innerHTML = (S.pageLinks || "") + $$("main [id]", doc).slice(0, 60).map(function (n) { return '<option value="#' + esc(n.id) + '">On this page</option>'; }).join("") + '<option value="tel:+92"></option><option value="mailto:"></option><option value="https://wa.me/92"></option>';
    checkDraft(); if (S.afterReady) { var f = S.afterReady; S.afterReady = null; f(); }
    if (!S.mineLoaded) { S.mineLoaded = 1; renderMine(); }
  }

  // =================================================================== AUTOSAVE DRAFT (E2)
  function draftKey() { return "wxDraft:" + S.path; }
  var dT;
  function saveDraft() {
    clearTimeout(dT); dT = setTimeout(function () {
      try {
        var cur = S.hist[S.hi];
        if (cur === S.savedSnap && seoSnap() === S.seoSaved) localStorage.removeItem(draftKey());
        else localStorage.setItem(draftKey(), JSON.stringify({ mtime: S.mtime, t: Date.now(), snap: cur, seo: seoSnap() }));
      } catch (e) { /* storage full: ignore */ }
    }, 1200);
  }
  function checkDraft() {
    var d; try { d = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { d = null; }
    if (!d) return;
    if (d.mtime !== S.mtime) { localStorage.removeItem(draftKey()); return; }
    if (d.snap === S.savedSnap && d.seo === S.seoSaved) { localStorage.removeItem(draftKey()); return; }
    if (!confirm("You have unsaved changes on this page from " + new Date(d.t).toLocaleString() + ".\n\nRecover them?")) { localStorage.removeItem(draftKey()); return; }
    var parts = d.snap.split("\u0002"); S.doc.body.innerHTML = parts[0]; S.styles = JSON.parse(parts[1] || "{}");
    var seo = (d.seo || "").split("\u0001"); if (seo.length === 2) { S.doc.title = seo[0]; metaDesc().setAttribute("content", seo[1]); fillSeo(); }
    renderCSS(); pushHist(); renderLayers(); toast("Draft recovered. Click Save to publish.");
  }

  // =================================================================== GLOBAL HEADER / FOOTER (A1)
  var REG = { header: "header.site-header", panel: "nav.mobile-panel", footer: "footer.footer" };
  function regionOf(el) { for (var k in REG) { var r = el.closest(REG[k]); if (r) return k; } return null; }
  function regionSnap(doc) {
    var o = {}; Object.keys(REG).forEach(function (k) { var n = doc.querySelector(REG[k]); if (n) { var c = n.cloneNode(true); cleanNode(c); o[k] = c; } }); return o;
  }
  function normHTML(h) { return h.replace(/\s*aria-current="[^"]*"/g, "").replace(/\s*data-wx-s="[^"]*"/g, ""); }
  function sameShape(a, b) {
    if (a.tagName !== b.tagName || a.attributes.length !== b.attributes.length || a.childNodes.length !== b.childNodes.length) return false;
    for (var i = 0; i < a.attributes.length; i++) if (b.getAttribute(a.attributes[i].name) !== a.attributes[i].value) return false;
    for (var j = 0; j < a.childNodes.length; j++) {
      var x = a.childNodes[j], y = b.childNodes[j];
      if (x.nodeType !== y.nodeType) return false;
      if (x.nodeType === 3 && x.data !== y.data) return false;
      if (x.nodeType === 1 && x.tagName !== y.tagName) return false;
    }
    return true;
  }
  function diffNodes(a, b, path, out) {
    if (a.outerHTML === b.outerHTML) return;
    if (!sameShape(a, b)) { out.push({ path: path, old: a.outerHTML, now: b.outerHTML }); return; }
    for (var i = 0; i < a.children.length; i++) diffNodes(a.children[i], b.children[i], path.concat(i), out);
  }
  function regionChanges() {
    var now = regionSnap(S.doc), out = [];
    Object.keys(REG).forEach(function (k) { if (S.regOrig && S.regOrig[k] && now[k]) { var ch = []; diffNodes(S.regOrig[k], now[k], [], ch); ch.forEach(function (c) { c.reg = k; out.push(c); }); } });
    return out;
  }
  function applyChanges(doc, changes) {
    var n = 0;
    changes.forEach(function (c) {
      var t = doc.querySelector(REG[c.reg]); if (!t) return;
      for (var i = 0; i < c.path.length && t; i++) t = t.children[c.path[i]];
      if (!t || normHTML(t.outerHTML) !== normHTML(c.old)) return;
      var cur = [t].concat($$("[aria-current]", t)).filter(function (x) { return x.hasAttribute("aria-current"); }).map(function (x) { return [x.getAttribute("href"), x.getAttribute("aria-current")]; });
      var tpl = doc.createElement("template"); tpl.innerHTML = c.now; var nn = tpl.content.firstElementChild; if (!nn) return;
      [nn].concat($$("[aria-current]", nn)).forEach(function (x) { x.removeAttribute("aria-current"); });
      cur.forEach(function (pair) { [nn].concat($$("[href]", nn)).forEach(function (x) { if (x.getAttribute("href") === pair[0]) x.setAttribute("aria-current", pair[1]); }); });
      t.replaceWith(nn); n++;
    });
    return n;
  }
  function propagateGlobal(changes) {
    var others = S.pages.filter(function (p) { return p.path !== S.path; }), i = 0, upd = 0, skip = [], fail = [];
    $("#save").disabled = true; S.propagating = true;
    function next() {
      if (i >= others.length) {
        S.propagating = false; S.regOrig = regionSnap(S.doc); updateDirty();
        modal("<h2>Header / footer updated</h2><p>✅ <b>" + upd + "</b> other pages updated (a backup was made for each).</p>" +
          (skip.length ? "<p>⏭ <b>" + skip.length + "</b> pages were left as they are because that part is different on those pages:</p><p class='hint'>" + skip.map(esc).join(", ") + "</p>" : "") +
          (fail.length ? "<p style='color:#dc2626'>⚠ Failed: " + fail.map(esc).join(", ") + "</p>" : ""));
        return;
      }
      var pg = others[i++]; toast("Updating header/footer on all pages… " + i + "/" + others.length);
      api("load", { path: pg.path }).then(function (r) {
        if (!r.ok) { fail.push(pg.url); return next(); }
        var d = new DOMParser().parseFromString(r.html, "text/html");
        if (!applyChanges(d, changes)) { skip.push(pg.url); return next(); }
        var dt = /^<!doctype[^>]*>/i.exec(r.html.trim()); 
        api("save", { path: pg.path, html: (dt ? dt[0] : "<!DOCTYPE html>") + "\n" + d.documentElement.outerHTML + "\n", mtime: r.mtime }).then(function (s2) { if (s2.ok) upd++; else fail.push(pg.url); next(); });
      });
    }
    next();
  }

  // =================================================================== SERIALISE / HISTORY
  function cleanNode(root) {
    $$("[data-wx-ed]", root).forEach(function (n) { n.remove(); });
    $$("[contenteditable],[spellcheck]", root).forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck"); });
    // P15: keep async-CSS links as preload (browser flips rel to stylesheet at runtime)
    $$('link[onload][rel="stylesheet"]', root).forEach(function (n) { n.setAttribute("rel", "preload"); });
  }
  function serialise() {
    finishEdit(); renderCSS();
    var c = S.doc.documentElement.cloneNode(true); cleanNode(c);
    $$("script[data-wx-t]", c).forEach(function (s) { var t = s.getAttribute("data-wx-t"); s.removeAttribute("data-wx-t"); if (t === "__none") s.removeAttribute("type"); else s.setAttribute("type", t); });
    return "<!DOCTYPE html>\n" + c.outerHTML + "\n";
  }
  function snap() { var b = S.doc.body.cloneNode(true); cleanNode(b); return b.innerHTML + "\u0002" + JSON.stringify(S.styles); }
  function pushHist(initial) {
    var s = snap(); if (!initial && S.hist[S.hi] === s) return;
    S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s); if (S.hist.length > 100) S.hist.shift(); S.hi = S.hist.length - 1; updateDirty(); if (!initial) saveDraft();
  }
  function restoreHist(i) {
    if (i < 0 || i >= S.hist.length) return;
    deselect(); S.hi = i; var parts = S.hist[i].split("\u0002");
    S.doc.body.innerHTML = parts[0]; S.styles = JSON.parse(parts[1] || "{}"); renderCSS(); renderLayers(); updateDirty();
  }
  function changed() { pushHist(); renderLayers(); if (S.sel && S.sel.isConnected) { renderCrumbs(); } else if (S.sel) deselect(); }
  function updateDirty() {
    var d = S.doc && (snap() !== S.savedSnap || seoSnap() !== S.seoSaved);
    $("#save").disabled = !d; $("#save").classList.toggle("dirty", !!d);
    $("#undo").disabled = S.hi <= 0; $("#redo").disabled = S.hi >= S.hist.length - 1;
  }
  $("#undo").onclick = function () { restoreHist(S.hi - 1); };
  $("#redo").onclick = function () { restoreHist(S.hi + 1); };

  // =================================================================== PICKING / SELECTION
  var TEXT_TAGS = /^(H1|H2|H3|H4|H5|H6|P|LI|SMALL|STRONG|SPAN|EM|B|I|FIGCAPTION|BLOCKQUOTE|SUMMARY|LABEL|TD|TH|DT|DD|BUTTON|A|CITE|Q|TIME)$/;
  var INLINE = /^(B|I|EM|STRONG|BR|SPAN|A|SMALL|SUP|SUB|U|MARK|CITE|TIME|WBR)$/;
  function isTextLeaf(el) {
    if (!el || el.nodeType !== 1 || !TEXT_TAGS.test(el.tagName) || !el.textContent.trim()) return false;
    for (var i = 0; i < el.children.length; i++) if (!INLINE.test(el.children[i].tagName) || el.children[i].children.length) return false;
    return true;
  }
  function pick(t) {
    if (!t || t.nodeType !== 1) return null;
    if (t.closest("svg")) t = t.closest("svg").parentElement;
    if (t === S.doc.body || t === S.doc.documentElement || t.tagName === "MAIN") return null;
    if (t.tagName === "IMG" || t.tagName === "IFRAME") return t;
    var el = t;
    while (el && el !== S.doc.body) { if (isTextLeaf(el)) return el; el = el.parentElement; }
    return t;
  }
  function onMove(e) { if (S.preview || S.drag) return; S.hover = pick(e.target); }
  function onClick(e) {
    var t = e.target;
    if (S.editing && S.editing.contains(t)) { if (t.closest("a")) e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation();
    if (S.preview) return;
    var el = pick(t);
    // Click-through: clicking an already-selected box again selects what lies underneath it
    // (e.g. a hero image covered by a text overlay).
    if (el && el === S.sel && !isTextLeaf(el) && S.doc.elementsFromPoint) {
      var stack = S.doc.elementsFromPoint(e.clientX, e.clientY), under = null;
      for (var i = 0; i < stack.length; i++) {
        var c = pick(stack[i]); if (!c || c === el || el.contains(c) || c.contains(el)) continue;
        under = c; break;
      }
      // step into an image inside the container underneath (images often ignore the mouse via CSS)
      if (under && under.tagName !== "IMG") {
        var ims = under.querySelectorAll("img");
        for (var j = 0; j < ims.length; j++) { var r = ims[j].getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { under = ims[j]; break; } }
      }
      if (under) { select(under); toast("Selected the layer underneath — click again to go deeper"); return; }
    }
    if (el) select(el);
  }
  function select(el) {
    finishEdit(); S.sel = el;
    $("#rp-empty").hidden = true; $("#rp").hidden = false;
    renderPanels(); renderCrumbs(); renderLayers(true);
    if (el.tagName !== "IMG" && isTextLeaf(el)) startEdit(el);
    if ($("#code").hidden === false) openCode();
  }
  function deselect() { finishEdit(); S.sel = null; $("#rp-empty").hidden = false; $("#rp").hidden = true; renderCrumbs(); renderLayers(); }
  function startEdit(el) { S.editing = el; S.editStart = el.innerHTML; el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "true"); el.focus({ preventScroll: true }); }
  function finishEdit() {
    var el = S.editing; if (!el) return; S.editing = null;
    el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck");
    if (el.innerHTML !== S.editStart) changed();
  }
  function onKey(e) {
    var k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === "s") { e.preventDefault(); save(); return; }
    if (S.editing && onKey3(e)) return;
    if (S.editing) {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); finishEdit(); return; }
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); S.doc.execCommand("insertLineBreak"); }
      return;
    }
    if (onKey3(e)) return;
    if (mod && k === "z") { e.preventDefault(); restoreHist(e.shiftKey ? S.hi + 1 : S.hi - 1); }
    else if (mod && k === "y") { e.preventDefault(); restoreHist(S.hi + 1); }
    else if (e.key === "Escape") deselect();
    else if (e.key === "Delete" && S.sel) { e.preventDefault(); tool("del"); }
  }
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } return; }
    if (S.doc) onKey(e);
  });
  function onPaste(e) { if (!S.editing) return; e.preventDefault(); S.doc.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s*\n\s*/g, " ")); }

  // =================================================================== OVERLAY (hover/selection boxes, toolbar)
  function label(el) {
    var t = el.tagName.toLowerCase(), c = el.classList[0];
    var nice = { h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", p: "Text", a: "Link", img: "Image", section: "Section", li: "List item", ul: "List", figure: "Figure", button: "Button", header: "Header", footer: "Footer", nav: "Menu", iframe: "Embed", blockquote: "Quote", small: "Small text", span: "Text" }[t];
    if (t === "a" && /btn/.test(el.className)) nice = "Button";
    return (nice || t) + (c ? " ." + c : "");
  }
  function place(box, el) {
    if (!el || !el.isConnected) { box.style.display = "none"; return null; }
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) { box.style.display = "none"; return null; }
    box.style.display = "block"; box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px";
    return r;
  }
  function tick() {
    if (S.doc && !S.preview) {
      var hv = S.hover && S.hover !== S.sel && !S.drag ? S.hover : null;
      if (place($("#ov-hover"), hv)) $("#ov-hover-lbl").textContent = label(hv);
      var r = place($("#ov-sel"), S.sel);
      if (r) {
        var bar = $("#ov-bar"); $("#ov-name").textContent = label(S.sel);
        bar.className = "ov-bar" + (r.top < 32 ? (r.height > 80 ? " inside" : " below") : "");
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function isSection(el) { return el && el.parentElement && el.parentElement.tagName === "MAIN"; }
  function sectionOf(el) { return el && el.closest ? el.closest("main > *") : null; }

  $$("#ov-bar button").forEach(function (b) { b.onmousedown = function (e) { e.preventDefault(); }; b.onclick = function () { tool(b.dataset.t); }; });

  function newId() { return "s" + Math.random().toString(36).slice(2, 8); }
  function remapIds(root) {
    [root].concat($$("[data-wx-s]", root)).forEach(function (n) {
      var old = n.getAttribute && n.getAttribute("data-wx-s"); if (!old) return;
      var id = newId(); n.setAttribute("data-wx-s", id); if (S.styles[old]) S.styles[id] = JSON.parse(JSON.stringify(S.styles[old]));
    });
  }
  function tool(t) {
    var el = S.sel; if (!el) return; finishEdit();
    if (t === "parent") { var p = el.parentElement; if (p && p !== S.doc.body && p.tagName !== "MAIN") select(p); return; }
    if (t === "up" && el.previousElementSibling) el.previousElementSibling.before(el);
    else if (t === "down" && el.nextElementSibling) el.nextElementSibling.after(el);
    else if (t === "dup") { var c = el.cloneNode(true); if (c.id) c.id += "-2"; $$("[id]", c).forEach(function (n) { n.id += "-2"; }); remapIds(c); el.after(c); renderCSS(); changed(); select(c); return; }
    else if (t === "code") { openCode(); return; }
    else if (t === "move") return;
    else if (t === "wand") { wandModal(); return; }
    else if (t === "saveblock") { saveBlock(); return; }
    else if (t === "del") { var par = el.parentElement; el.remove(); S.sel = null; changed(); if (par && par !== S.doc.body && par.tagName !== "MAIN") select(par); else deselect(); return; }
    else return;
    changed();
  }

  // =================================================================== INSERT (click + drag & drop)
  function build(html) {
    var m = /^\s*<!--wx-styles:([\s\S]*?)-->/.exec(html), n;
    if (m) { try { var st = JSON.parse(m[1]); Object.keys(st).forEach(function (k) { if (!S.styles[k]) S.styles[k] = st[k]; }); } catch (e) {} html = html.slice(m[0].length); }
    var t = S.doc.createElement("template"); t.innerHTML = html.trim(); sanitize(t.content); n = t.content.firstElementChild;
    if (n && !n.hasAttribute("data-wx-global")) remapIds(n); return n;
  }
  function containerOf(sec) { return sec.querySelector(".wrap,[class$='-wrap'],[class*='-wrap ']") || sec; }
  function sectionAtViewportCenter() {
    var main = S.doc.querySelector("main"); if (!main) return null;
    var mid = S.doc.defaultView.innerHeight / 2, best = null;
    Array.prototype.forEach.call(main.children, function (c) { var r = c.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) best = c; });
    return best || main.lastElementChild;
  }
  function afterInsert(node, kind) {
    renderCSS(); changed(); select(node);
    node.scrollIntoView({ block: "center" });
    toast((kind === "section" ? "Section" : "Element") + " added ✓");
  }
  function insertSection(html, after) {
    var main = S.doc.querySelector("main"); if (!main) return toast("This page has no main content area", true);
    var node = build(html);
    var ref = after && after.isConnected ? sectionOf(after) || after : (S.sel ? sectionOf(S.sel) : null);
    if (ref && ref.parentElement === main) ref.after(node);
    else { var trust = main.querySelector(":scope > .wx-trust"); trust ? trust.before(node) : main.appendChild(node); }
    afterInsert(node, "section");
  }
  function insertElement(html) {
    var node = build(html), sel = S.sel;
    if (sel && !isSection(sel) && sel.parentElement && sel.parentElement.tagName !== "MAIN") sel.after(node);
    else { var sec = sel && isSection(sel) ? sel : sectionAtViewportCenter(); if (!sec) return toast("Select a section first", true); containerOf(sec).appendChild(node); }
    afterInsert(node, "element");
  }
  function libButtons(list, box, kind) {
    box.innerHTML = list.map(function (b) { return '<button draggable="true" data-id="' + b.id + '"><span>' + b.icon + "</span>" + esc(b.name) + "</button>"; }).join("");
    $$("button", box).forEach(function (btn) {
      var b = list.find(function (x) { return x.id === btn.dataset.id; });
      btn.onclick = function () { if (!S.doc) return; kind === "section" ? insertSection(b.html) : insertElement(b.html); };
      btn.ondragstart = function (e) { S.drag = { kind: kind, html: b.html }; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", "wx-block"); };
      btn.ondragend = function () { S.drag = null; hideDrop(); };
    });
  }
  libButtons(window.WX_BLOCKS || [], $("#lib-sections"), "section");
  libButtons(window.WX_ELEMENTS || [], $("#lib-elements"), "element");
  // P16: all 50 v26 templates listed directly in the Sections tab (click or drag), filter by category
  (function () {
    var T = window.WX_TEMPLATES || [], box = $("#lib-v26"), sel = $("#v26-cat"); if (!box || !T.length) return;
    $("#v26-n").textContent = "(" + T.length + ")";
    T.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).forEach(function (c) { sel.insertAdjacentHTML("beforeend", "<option>" + esc(c) + "</option>"); });
    function draw() { var c = sel.value; libButtons(T.filter(function (t) { return !c || t.cat === c; }).map(function (t) { return { id: t.id, icon: t.icon || "▦", name: t.name, html: t.html }; }), box, "section"); }
    sel.onchange = draw; draw();
  })();

  var dropAt = null;
  function hideDrop() { $("#ov-drop").style.display = "none"; dropAt = null; }
  function showDropLine(r, before) {
    var d = $("#ov-drop"); d.style.display = "block"; d.style.left = r.left + "px"; d.style.width = r.width + "px"; d.style.top = (before ? r.top : r.bottom) - 2 + "px";
  }
  function onDragOver(e) {
    if (!S.drag) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    var main = S.doc.querySelector("main"); if (!main) return;
    if (S.drag.kind === "section") {
      var kids = Array.prototype.slice.call(main.children), y = e.clientY, target = kids[kids.length - 1], before = false;
      for (var i = 0; i < kids.length; i++) { var r = kids[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { target = kids[i]; before = true; break; } }
      if (!target) return; dropAt = { ref: target, before: before }; showDropLine(target.getBoundingClientRect(), before);
    } else {
      var el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      if (el.closest("svg")) el = el.closest("svg").parentElement;
      while (el && el !== S.doc.body && S.doc.defaultView.getComputedStyle(el).display.indexOf("inline") === 0) el = el.parentElement;
      if (!el || el === S.doc.body || el === main || !main.contains(el)) return;
      if (isSection(el)) { var c = containerOf(el), lc = c.lastElementChild || c; dropAt = { ref: lc === c ? c : lc, before: false, into: lc === c }; showDropLine(lc.getBoundingClientRect(), false); return; }
      var rr = el.getBoundingClientRect(), bf = e.clientY < rr.top + rr.height / 2;
      dropAt = { ref: el, before: bf }; showDropLine(rr, bf);
    }
  }
  function onDrop(e) {
    if (!S.drag || !dropAt) return; e.preventDefault();
    var node = build(S.drag.html), kind = S.drag.kind;
    if (dropAt.into) dropAt.ref.appendChild(node); else if (dropAt.before) dropAt.ref.before(node); else dropAt.ref.after(node);
    S.drag = null; hideDrop(); afterInsert(node, kind);
  }
  function pickSectionModal(after) {
    modal("<h2>Add a section below</h2><div class='lib' style='grid-template-columns:repeat(3,1fr)'>" + (window.WX_BLOCKS || []).map(function (b) { return "<button data-id='" + b.id + "'><span>" + b.icon + "</span>" + esc(b.name) + "</button>"; }).join("") + "</div>");
    $$("#modal-body .lib button").forEach(function (btn) { btn.onclick = function () { var b = WX_BLOCKS.find(function (x) { return x.id === btn.dataset.id; }); closeModal(); insertSection(b.html, after); }; });
  }

  // =================================================================== LAYERS
  var SKIP = /^(SCRIPT|STYLE|SVG|BR|TEMPLATE|NOSCRIPT|LINK|META|PATH|SOURCE)$/i;
  function kidsOf(n) { return Array.prototype.filter.call(n.children, function (c) { return !SKIP.test(c.tagName) && !c.hasAttribute("data-wx-ed"); }); }
  function renderLayers(expandToSel) {
    if (!S.doc || !$('[data-lp="layers"]').classList.contains("is-on")) return;
    if (expandToSel && S.sel) { var p = S.sel.parentElement; while (p && p !== S.doc.body) { S.open.add(p); p = p.parentElement; } }
    var roots = kidsOf(S.doc.body).filter(function (n) { return /^(HEADER|MAIN|FOOTER|NAV)$/.test(n.tagName); });
    var box = $("#layers"); box.innerHTML = ""; roots.forEach(function (r) { if (r.tagName === "MAIN" && !S.openInit) { S.open.add(r); S.openInit = 1; } box.appendChild(layerNode(r, 0)); });
    var cur = $(".ly.is-sel", box); if (cur && expandToSel) cur.scrollIntoView({ block: "nearest" });
  }
  function layerNode(n, depth) {
    var wrap = document.createElement("div"), kids = kidsOf(n), open = S.open.has(n);
    var row = document.createElement("div"); row.className = "ly" + (n === S.sel ? " is-sel" : "") + (n.hidden ? " is-hidden" : "");
    var txt = n.getAttribute && n.getAttribute("data-wx-label") ? "🏷 " + n.getAttribute("data-wx-label") : isTextLeaf(n) ? n.textContent.trim().slice(0, 40) : (n.querySelector && (n.querySelector("h1,h2") || {}).textContent || "").trim().slice(0, 32);
    row.innerHTML = '<span class="tw">' + (kids.length ? (open ? "▾" : "▸") : "") + '</span><span class="tg">' + esc(n.tagName.toLowerCase() + (n.classList[0] ? "." + n.classList[0] : "")) + '</span><span class="tx">' + esc(txt) + "</span>";
    row.onclick = function (e) {
      if (e.target.classList.contains("tw") && kids.length) { open ? S.open.delete(n) : S.open.add(n); renderLayers(); return; }
      if (n.tagName === "MAIN") { open ? S.open.delete(n) : S.open.add(n); renderLayers(); return; }
      select(n); n.scrollIntoView({ block: "center" });
    };
    row.onmouseenter = function () { S.hover = n; };
    if (isSection(n)) {
      row.draggable = true;
      row.ondragstart = function (e) { S.layerDrag = n; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "layer"); };
      row.ondragover = function (e) { if (S.layerDrag && S.layerDrag !== n) { e.preventDefault(); row.classList.add("drag-over"); } };
      row.ondragleave = function () { row.classList.remove("drag-over"); };
      row.ondrop = function (e) { e.preventDefault(); row.classList.remove("drag-over"); if (S.layerDrag && S.layerDrag !== n) { n.before(S.layerDrag); S.layerDrag = null; changed(); } };
    }
    wrap.appendChild(row);
    if (open && kids.length) { var k = document.createElement("div"); k.className = "ly-kids"; kids.forEach(function (c) { k.appendChild(layerNode(c, depth + 1)); }); wrap.appendChild(k); }
    return wrap;
  }

  // =================================================================== BREADCRUMBS
  function renderCrumbs() {
    var box = $("#crumbs"); box.innerHTML = ""; if (!S.sel) { box.innerHTML = "<i>Nothing selected</i>"; return; }
    var chain = [], n = S.sel; while (n && n !== S.doc.documentElement) { chain.unshift(n); n = n.parentElement; }
    chain.slice(-7).forEach(function (el, i, a) {
      var b = document.createElement("button"); b.textContent = el.tagName.toLowerCase() + (el.classList[0] ? " ." + el.classList[0] : "");
      b.onclick = function () { if (el !== S.doc.body && el.tagName !== "MAIN") select(el); };
      box.appendChild(b); if (i < a.length - 1) { var s = document.createElement("i"); s.textContent = "›"; box.appendChild(s); }
    });
  }

  // =================================================================== STYLE STORE → CSS
  var GFONTS = { "Inter": "400;500;600;700", "Poppins": "400;500;600;700", "Montserrat": "400;500;600;700", "Roboto": "400;500;700", "Open Sans": "400;500;600;700", "Lato": "400;700",
    "Raleway": "400;500;600;700", "Playfair Display": "400;500;600;700", "Merriweather": "400;700", "Lora": "400;500;600;700", "Nunito": "400;600;700", "Work Sans": "400;500;600;700",
    "Manrope": "400;500;600;700", "Outfit": "400;500;600;700", "Plus Jakarta Sans": "400;500;600;700", "Space Grotesk": "400;500;600;700", "Cormorant Garamond": "400;500;600;700",
    "DM Serif Display": "", "Libre Baskerville": "400;700", "Oswald": "400;500;600;700", "Bebas Neue": "", "Josefin Sans": "400;600;700", "Archivo": "400;500;600;700", "Sora": "400;600;700", "Urbanist": "400;600;700", "Jost": "400;500;600;700" };
  var MEDIA = { t: "@media (max-width:1024px)", m: "@media (max-width:640px)" };
  // key = element id ("sxxxx") or class scope ("c:classname"); buckets d,t,m (+ "h" suffix = hover)
  S.scope = "el"; S.scopeCls = ""; S.state = "";
  function sid(el, create) { var id = el.getAttribute("data-wx-s"); if (!id && create) { id = newId(); el.setAttribute("data-wx-s", id); } return id; }
  function keyFor(el, create) { return S.scope === "cls" && S.scopeCls ? "c:" + S.scopeCls : sid(el, create); }
  function bucket(dev) { return (dev || S.dev) + S.state; }
  function getStyle(el, prop, dev) { var k = keyFor(el), b = S.styles[k] && S.styles[k][bucket(dev)]; return b ? b[prop] || "" : ""; }
  function setStyle(el, prop, val) {
    var k = keyFor(el, true); S.styles[k] = S.styles[k] || {}; var bk = bucket(), d = S.styles[k][bk] = S.styles[k][bk] || {};
    val = String(val == null ? "" : val).replace(/[;{}<>]/g, "").trim();
    if (val) d[prop] = val; else delete d[prop];
    renderCSS(); debounceHist();
  }
  var hT; function debounceHist() { clearTimeout(hT); hT = setTimeout(function () { pushHist(); }, 350); }
  function keyExists(k) { if (k.indexOf("c:") === 0) { try { return !!S.doc.querySelector("." + CSS.escape(k.slice(2))); } catch (e) { return false; } } return !!S.doc.querySelector('[data-wx-s="' + k + '"]'); }
  function selFor(k) { var s = k.indexOf("c:") === 0 ? "." + CSS.escape(k.slice(2)) : '[data-wx-s="' + k + '"]'; return s + s + s; }
  var PSEUDO = { h: ":hover", f: ":focus-visible", a: ":active" };
  function cssFor(k, decl, hover) {
    var body = "";
    Object.keys(decl).forEach(function (p) { if (p === "css") return; var v = decl[p]; if (p === "font-family" && !/,/.test(v)) v = '"' + v.replace(/"/g, "") + '",' + (/serif|Garamond|Baskerville|Playfair|Lora|Merriweather|Georgia/.test(v) && !/Sans/.test(v) ? "serif" : "sans-serif"); body += p + ":" + v + " !important;"; });
    if (decl.css) body += decl.css.replace(/[{}<>]/g, "");
    return body ? selFor(k) + (hover ? PSEUDO[hover] || ":hover" : "") + "{" + body + "}" : "";
  }
  function renderCSS() {
    if (!S.doc) return; var head = S.doc.head, out = { d: "", t: "", m: "" }, fonts = {}, used = {};
    var keys = Object.keys(S.styles).filter(keyExists).sort(function (a, b) { return (b.indexOf("c:") === 0) - (a.indexOf("c:") === 0); });
    keys.forEach(function (k) {
      var s = S.styles[k]; used[k] = s;
      Object.keys(s).forEach(function (bk) { var f = s[bk] && s[bk]["font-family"]; if (f && GFONTS.hasOwnProperty(f)) fonts[f] = 1; });
      ["d", "t", "m"].forEach(function (dv) { if (s[dv]) out[dv] += cssFor(k, s[dv]); ["h", "f", "a"].forEach(function (ps) { if (s[dv + ps]) out[dv] += cssFor(k, s[dv + ps], ps); }); });
    });
    var css = out.d + (out.t ? MEDIA.t + "{" + out.t + "}" : "") + (out.m ? MEDIA.m + "{" + out.m + "}" : "");
    var st = S.doc.getElementById("wx-custom-css"), data = S.doc.getElementById("wx-style-data"), gl = S.doc.getElementById("wx-gfonts");
    if (!css) { [st, data, gl].forEach(function (n) { if (n) n.remove(); }); return; }
    if (!st) { st = S.doc.createElement("style"); st.id = "wx-custom-css"; head.appendChild(st); }
    st.textContent = css;
    if (!data) { data = S.doc.createElement("script"); data.id = "wx-style-data"; data.setAttribute("type", "text/wx-off"); data.setAttribute("data-wx-t", "application/json"); head.appendChild(data); }
    data.textContent = JSON.stringify(used);
    var fam = Object.keys(fonts);
    if (fam.length) {
      var href = "https://fonts.googleapis.com/css2?" + fam.map(function (f) { return "family=" + f.replace(/ /g, "+") + (GFONTS[f] ? ":wght@" + GFONTS[f] : ""); }).join("&") + "&display=swap";
      if (!gl) { gl = S.doc.createElement("link"); gl.id = "wx-gfonts"; gl.rel = "stylesheet"; head.insertBefore(gl, st); }
      if (gl.getAttribute("href") !== href) gl.setAttribute("href", href);
    } else if (gl) gl.remove();
  }

  // =================================================================== RIGHT PANEL
  $$(".rt").forEach(function (t) { t.onclick = function () { $$(".rt").forEach(function (x) { x.classList.toggle("is-on", x === t); }); $$(".rp-pane").forEach(function (p) { p.classList.toggle("is-on", p.dataset.rp === t.dataset.rt); }); }; });
  var DEVNAME = { d: "Desktop", t: "Tablet", m: "Mobile" };
  function group(title, html, open) { return '<details class="sec"' + (open === false ? "" : " open") + "><summary>" + title + '</summary><div class="sec-body">' + html + "</div></details>"; }
  function field(lbl, inner, full) { return '<div class="f' + (full ? " full" : "") + '"><span>' + lbl + "</span>" + inner + "</div>"; }
  function renderPanels() { renderContent(); renderStyle(); renderAdvanced(); }

  // ---------- CONTENT
  var SEPS = {
    wave: "M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z",
    slant: "M1200 120L0 16.48 0 0 1200 0 1200 120z",
    curve: "M0,0V7.23C0,65.52,268.63,112.77,600,112.77S1200,65.52,1200,7.23V0Z",
    triangle: "M1200 0L0 0 598.97 114.72 1200 0z",
    zigzag: "M0,0 L0,40 L50,80 L100,40 L150,80 L200,40 L250,80 L300,40 L350,80 L400,40 L450,80 L500,40 L550,80 L600,40 L650,80 L700,40 L750,80 L800,40 L850,80 L900,40 L950,80 L1000,40 L1050,80 L1100,40 L1150,80 L1200,40 L1200,0 Z"
  };
  function withBase(fn) { var a = [S.dev, S.state, S.scope]; S.dev = "d"; S.state = ""; S.scope = "el"; try { return fn(); } finally { S.dev = a[0]; S.state = a[1]; S.scope = a[2]; } }
  function baseStyle(el, p) { return withBase(function () { return getStyle(el, p); }); }
  function setBase(el, p, v) { withBase(function () { setStyle(el, p, v); }); }
  function renderContent() {
    if (!S.sel || !S.sel.isConnected) return;
    var el = S.sel, h = "", link = el.closest("a"), sec = isSection(el);
    if (isTextLeaf(el) && el.tagName !== "IMG") {
      var tagSel = /^(H[1-6]|P)$/.test(el.tagName) ? field("Tag", '<select id="c-tag">' + ["H1", "H2", "H3", "H4", "H5", "H6", "P"].map(function (t) { return "<option" + (t === el.tagName ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select>") : "";
      h += group("Text", '<div class="fmt"><button data-cmd="bold"><b>B</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="underline"><u>U</u></button><button data-cmd="createLink">🔗</button><button data-cmd="unlink">⛓</button><button data-cmd="removeFormat">⌫</button></div>' +
        (el.children.length ? '<p class="hint" style="margin:0">This text has formatting or links. Edit it directly on the page so they are kept.</p>' : field("Text", '<textarea id="c-text" rows="3">' + esc(el.textContent) + "</textarea>", true)) + tagSel);
    }
    if (el.tagName === "IMG") {
      h += group("Image", '<img class="img-prev" id="c-img-prev" src="' + esc(el.getAttribute("src")) + '" alt="">' +
        '<div class="row"><button class="btn" id="c-img-lib">🖼 Set image</button><button class="btn" id="c-img-up">⬆ Upload</button></div>' +
        field("URL", '<input type="text" id="c-src" value="' + esc(el.getAttribute("src")) + '">') +
        field("Alt text", '<input type="text" id="c-alt" value="' + esc(el.getAttribute("alt") || "") + '" placeholder="Describe the image (SEO)">') +
        field("Width", '<input type="text" id="c-w" value="' + esc(el.getAttribute("width") || "") + '">') +
        field("Height", '<input type="text" id="c-h" value="' + esc(el.getAttribute("height") || "") + '">') +
        field("Fit", '<select id="c-fit"><option value="">Default</option><option>cover</option><option>contain</option><option>fill</option></select>'));
    }
    var vid = el.closest("[data-wx-video]") || (el.tagName === "IFRAME" && /youtube|vimeo/.test(el.src) ? el.parentElement : null);
    if (vid) h += group("Video", field("YouTube / Vimeo link", '<input type="text" id="c-video" value="' + esc((vid.querySelector("iframe") || {}).src || "") + '" placeholder="https://youtube.com/watch?v=…">', true));
    var map = el.closest("[data-wx-map]");
    if (map) h += group("Map", field("Address", '<input type="text" id="c-map" value="' + esc(decodeURIComponent(((map.querySelector("iframe") || {}).src || "").replace(/^.*[?&]q=([^&]*).*$/, "$1")).replace(/\+/g, " ")) + '">', true));
    if (link) {
      var isBtn = /btn/.test(link.className);
      h += group("Link", field("URL", '<input type="text" id="c-href" list="wx-links" value="' + esc(link.getAttribute("href") || "") + '" placeholder="/contact/ or https://…">') +
        field("New tab", '<label><input type="checkbox" id="c-blank"' + (link.target === "_blank" ? " checked" : "") + "> Open in new tab</label>") +
        (isBtn ? field("Button style", '<select id="c-btn"><option value="">Keep original</option><option value="wx-btn-dark">Navy solid</option><option value="wx-btn-outline">Outline</option><option value="wx-btn-light">White</option></select>') : "") +
        '<button class="btn btn-sm" id="c-unlink">Remove link</button>');
    } else if (el.tagName === "IMG" || (!isTextLeaf(el) && /^(DIV|FIGURE|ARTICLE|LI)$/.test(el.tagName))) {
      h += group("Link", field("Enable link", '<label><input type="checkbox" id="c-mklink"> Make this clickable</label>'), false);
    }
    if (sec) {
      var bgs = ["", "wx-bg-white", "wx-bg-light", "wx-bg-beige", "wx-bg-dark"], pads = ["", "wx-pad-s", "wx-pad-l", "wx-pad-0"];
      var cb = bgs.find(function (c) { return c && el.classList.contains(c); }) || "", cp = pads.find(function (c) { return c && el.classList.contains(c); }) || "";
      var bgv = el.querySelector(":scope>.wx-bgv"), mode = bgv ? (bgv.querySelector("iframe") ? "yt" : "video") : (baseStyle(el, "background-image") ? "img" : "none");
      var ovl = el.querySelector(":scope>.wx-ovl"), sT = el.querySelector(":scope>.wx-sep-top"), sB = el.querySelector(":scope>.wx-sep-bottom");
      var seg2 = function (id, opts, cur) { return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '"' + (o[0] === cur ? ' class="is-on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>"; };
      var ovC = ovl ? parseColor(ovl.style.backgroundColor || "#000") : { hex: "#000000", a: 1 };
      var sepCtl = function (pos, n) {
        var shape = n ? n.getAttribute("data-shape") : "wave", col = n ? toHex(n.style.color || "#ffffff") : "#ffffff", ht = n ? parseInt(n.style.height) || 60 : 60;
        return '<label class="tgl">Show <input type="checkbox" id="c-sep-' + pos + '"' + (n ? " checked" : "") + "></label>" + (n ? '<div class="g2">' +
          f2("Shape", '<select id="c-sep-' + pos + '-shape">' + Object.keys(SEPS).map(function (k) { return "<option" + (k === shape ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select>") +
          f2("Height (px)", '<input type="text" id="c-sep-' + pos + '-h" value="' + ht + '">') +
          f2("Colour", '<div class="clr2"><input type="text" id="c-sep-' + pos + '-ct" value="' + col + '"><span class="sw" style="--c:' + col + '"><input type="color" id="c-sep-' + pos + '-c" value="' + col + '"></span></div>', 1) + "</div>" : "");
      };
      h += group("Section",
        f2("Label <small>(shown in Layers)</small>", '<input type="text" id="c-label" value="' + esc(el.getAttribute("data-wx-label") || "") + '" placeholder="e.g. Services intro">', 1) +
        '<div class="g2">' + f2("Container width", seg2("c-width", [["", "▭ Boxed"], ["wx-full", "↔ Full"]], el.classList.contains("wx-full") ? "wx-full" : "")) +
        f2("Container height", seg2("c-height", [["", "Auto"], ["wx-hfull", "↕ Full"]], el.classList.contains("wx-hfull") ? "wx-hfull" : "")) + "</div>");
      h += group("Background",
        '<div class="seg big" id="c-bgmode">' + [["none", "∅", "None"], ["img", "🖼", "Image"], ["video", "🎞", "Video"], ["yt", "▶", "YouTube"]].map(function (o) { return '<button type="button" data-v="' + o[0] + '"' + (o[0] === mode ? ' class="is-on"' : "") + "><span>" + o[1] + "</span>" + o[2] + "</button>"; }).join("") + "</div>" +
        (mode === "img" ? '<img class="img-prev" src="' + esc((baseStyle(el, "background-image").match(/url\("?([^")]+)/) || [])[1] || "") + '" alt=""><button class="btn btn-sm" id="c-bgimg">🖼 Change image</button>' : "") +
        (mode === "video" ? f2("MP4 video URL", '<input type="text" id="c-bgvid" value="' + esc((bgv.querySelector("video") || {}).getAttribute ? bgv.querySelector("video").getAttribute("src") : "") + '" placeholder="/assets/uploads/clip.mp4">', 1) : "") +
        (mode === "yt" ? f2("YouTube link", '<input type="text" id="c-bgyt" value="' + esc(bgv.getAttribute("data-yt") || "") + '" placeholder="https://youtube.com/watch?v=…">', 1) : "") +
        '<label class="tgl">Parallax (image stays fixed while scrolling) <input type="checkbox" id="c-parallax"' + (el.classList.contains("wx-parallax") ? " checked" : "") + "></label>" +
        '<div class="g2">' + f2("Colour preset", '<select id="c-bg">' + [["", "Default"], ["wx-bg-white", "White"], ["wx-bg-light", "Light grey"], ["wx-bg-beige", "Beige"], ["wx-bg-dark", "Navy (dark)"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cb ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>") +
        f2("Spacing preset", '<select id="c-pad">' + [["", "Normal"], ["wx-pad-s", "Compact"], ["wx-pad-l", "Spacious"], ["wx-pad-0", "None"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cp ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>") + "</div>");
      h += group("Overlay", '<label class="tgl">Colour overlay on top of the background <input type="checkbox" id="c-ovl"' + (ovl ? " checked" : "") + "></label>" + (ovl ? '<div class="g2">' +
        f2("Colour", '<div class="clr2"><input type="text" id="c-ovl-ct" value="' + ovC.hex + '"><span class="sw" style="--c:' + ovC.hex + '"><input type="color" id="c-ovl-c" value="' + ovC.hex + '"></span></div>') +
        f2("Opacity", '<div class="rng"><input type="range" id="c-ovl-o" min="0" max="1" step="0.05" value="' + esc(ovl.style.opacity || "0.5") + '"><input type="text" id="c-ovl-ot" value="' + esc(ovl.style.opacity || "0.5") + '"></div>', 1) + "</div>" : ""));
      h += group("Top separator", sepCtl("top", sT)) + group("Bottom separator", sepCtl("bottom", sB));
      h += group("Layout", '<label class="tgl">Centre content <input type="checkbox" id="c-center"' + (el.classList.contains("wx-center") ? " checked" : "") + "></label>" +
        '<label class="tgl">Swap image side <input type="checkbox" id="c-rev"' + (el.classList.contains("wx-reverse") ? " checked" : "") + "></label>" +
        '<label class="tgl">Hide this section <input type="checkbox" id="c-hidden"' + (el.hidden ? " checked" : "") + "></label>" +
        '<button class="btn btn-sm" id="c-addsec">＋ Add section below</button>', false);
    }
    h += group("General", '<div class="g2">' + f2("Id", '<input type="text" id="g-id" value="' + esc(el.id) + '">') + f2("Title", '<input type="text" id="g-title" value="' + esc(el.getAttribute("title") || "") + '">') + "</div>" +
      f2("Class", '<div class="chips" id="g-chips">' + Array.prototype.map.call(el.classList, function (c) { return '<span class="chip">' + esc(c) + '<button data-c="' + esc(c) + '">×</button></span>'; }).join("") + '<input type="text" id="g-addc" placeholder="add + Enter"></div>', 1), !!sec);
    h += group("Actions", '<div class="row"><button class="btn btn-sm" data-t="parent">⤴ Parent</button><button class="btn btn-sm" data-t="dup">⧉ Duplicate</button><button class="btn btn-sm btn-danger" data-t="del">🗑 Delete</button></div>', false);
    var rg = regionOf(el);
    if (rg) h = '<div style="margin:12px 14px;padding:10px 12px;background:#fff8e6;border:1px solid #f5d98b;border-radius:8px;font-size:12px;color:#7a5a00"><b>🌐 Global ' + (rg === "footer" ? "footer" : rg === "panel" ? "mobile menu" : "header") + "</b><br>Changes here are copied to <b>all pages</b> when you save. Pages where this part is different are skipped.</div>" + h;
    var pane = $("#pane-content"); pane.innerHTML = h;
    bindContent(pane, el, link, vid, map);
  }
  function bindContent(pane, el, link, vid, map) {
    var on = function (id, ev, fn) { var n = $("#" + id, pane); if (n) n.addEventListener(ev, fn); };
    $$(".fmt button", pane).forEach(function (b) {
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () {
        if (!S.editing) startEdit(el);
        var sel = S.doc.getSelection(); if (sel && sel.isCollapsed) { var r = S.doc.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); }
        var v = null; if (b.dataset.cmd === "createLink") { v = prompt("Link address", "/contact/"); if (!v) return; }
        S.doc.execCommand(b.dataset.cmd, false, v);
      };
    });
    on("c-text", "input", function () { el.textContent = this.value; debounceHist(); });
    on("c-tag", "change", function () { var n = S.doc.createElement(this.value); Array.prototype.forEach.call(el.attributes, function (a) { n.setAttribute(a.name, a.value); }); n.innerHTML = el.innerHTML; finishEdit(); el.replaceWith(n); changed(); select(n); });
    on("c-src", "change", function () { setImg(el, this.value.trim()); });
    on("c-alt", "change", function () { el.setAttribute("alt", this.value); changed(); });
    on("c-w", "change", function () { this.value ? el.setAttribute("width", this.value) : el.removeAttribute("width"); changed(); });
    on("c-h", "change", function () { this.value ? el.setAttribute("height", this.value) : el.removeAttribute("height"); changed(); });
    var fit = $("#c-fit", pane); if (fit) { fit.value = getStyle(el, "object-fit", "d"); fit.onchange = function () { var d = S.dev; S.dev = "d"; setStyle(el, "object-fit", this.value); S.dev = d; }; }
    on("c-img-lib", "click", function () { mediaPicker(function (u, w, h) { setImg(el, u, w, h); }); });
    on("c-img-up", "click", function () { upload(function (u, w, h) { setImg(el, u, w, h); }); });
    on("c-video", "change", function () {
      var u = this.value.trim(), m = /(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(u), vm = /vimeo\.com\/(\d+)/.exec(u);
      var src = m ? "https://www.youtube.com/embed/" + m[1] : vm ? "https://player.vimeo.com/video/" + vm[1] : "";
      if (!src) return toast("Paste a YouTube or Vimeo link", true);
      vid.querySelector("iframe").setAttribute("src", src); changed(); toast("Video updated");
    });
    on("c-map", "change", function () { map.querySelector("iframe").setAttribute("src", "https://www.google.com/maps?q=" + encodeURIComponent(this.value) + "&output=embed"); changed(); });
    on("c-href", "change", function () { link.setAttribute("href", this.value.trim() || "#"); changed(); });
    on("c-blank", "change", function () { if (this.checked) { link.target = "_blank"; link.rel = "noopener"; } else { link.removeAttribute("target"); link.removeAttribute("rel"); } changed(); });
    var cbtn = $("#c-btn", pane); if (cbtn) { cbtn.value = ["wx-btn-dark", "wx-btn-outline", "wx-btn-light"].find(function (c) { return link.classList.contains(c); }) || ""; cbtn.onchange = function () { link.classList.remove("wx-btn-dark", "wx-btn-outline", "wx-btn-light"); if (this.value) link.classList.add(this.value); changed(); }; }
    on("c-unlink", "click", function () { if (link === el) { var sp = S.doc.createElement("span"); sp.className = link.className; sp.innerHTML = link.innerHTML; link.replaceWith(sp); changed(); select(sp); } else { while (link.firstChild) link.before(link.firstChild); link.remove(); changed(); select(el); } });
    on("c-mklink", "change", function () {
      if (el.closest("a") || el.querySelector("a,button") || /^(LI|TD|TH|TR|DT|DD)$/.test(el.tagName)) { this.checked = false; return toast("Can't link this element (it contains links or is a list/table item). Select the image or text inside instead.", true); }
      var a = S.doc.createElement("a"); a.href = "/contact/"; el.before(a); a.appendChild(el); changed(); select(el); toast("Link added — set the URL"); });
    var secOpt = function (list, val) { list.forEach(function (c) { el.classList.remove(c); }); if (val) el.classList.add(val); changed(); };
    on("c-bg", "change", function () { secOpt(["wx-bg-white", "wx-bg-light", "wx-bg-beige", "wx-bg-dark"], this.value); });
    on("c-pad", "change", function () { secOpt(["wx-pad-s", "wx-pad-l", "wx-pad-0"], this.value); });
    on("c-center", "change", function () { el.classList.toggle("wx-center", this.checked); changed(); });
    on("c-rev", "change", function () { el.classList.toggle("wx-reverse", this.checked); changed(); });
    on("c-hidden", "change", function () { el.hidden = this.checked; changed(); });
    on("c-addsec", "click", function () { pickSectionModal(el); });
    // --- section options (C1–C6)
    var segOn = function (id, fn) { var g = $("#" + id, pane); if (g) $$("button", g).forEach(function (b) { b.onclick = function () { fn(b.dataset.v); }; }); };
    on("c-label", "change", function () { this.value.trim() ? el.setAttribute("data-wx-label", this.value.trim()) : el.removeAttribute("data-wx-label"); changed(); });
    segOn("c-width", function (v) { el.classList.toggle("wx-full", v === "wx-full"); changed(); renderContent(); });
    segOn("c-height", function (v) { el.classList.toggle("wx-hfull", v === "wx-hfull"); changed(); renderContent(); });
    var fxClass = function () { el.classList.toggle("wx-fx", !!el.querySelector(":scope>.wx-bgv,:scope>.wx-ovl,:scope>.wx-sep")); };
    var clearBgv = function () { var b = el.querySelector(":scope>.wx-bgv"); if (b) b.remove(); };
    var addBgv = function (inner, yt) { clearBgv(); var d = S.doc.createElement("div"); d.className = "wx-bgv"; d.setAttribute("aria-hidden", "true"); if (yt) d.setAttribute("data-yt", yt); d.innerHTML = inner; el.insertBefore(d, el.firstChild); fxClass(); };
    segOn("c-bgmode", function (v) {
      if (v === "none") { clearBgv(); setBase(el, "background-image", ""); fxClass(); changed(); renderContent(); }
      if (v === "img") mediaPicker(function (u) { clearBgv(); setBase(el, "background-image", 'url("' + u + '")'); setBase(el, "background-size", "cover"); setBase(el, "background-position", "center"); fxClass(); changed(); renderContent(); });
      if (v === "video") { var u = prompt("MP4 video URL (upload the video to /assets/uploads/ or paste a link)", "/assets/uploads/video.mp4"); if (!u) return; addBgv('<video src="' + esc(u) + '" autoplay muted loop playsinline preload="metadata"></video>'); changed(); renderContent(); }
      if (v === "yt") { var y = prompt("YouTube link", "https://www.youtube.com/watch?v="); var m = /(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(y || ""); if (!m) return y && toast("That is not a YouTube link", true); addBgv('<iframe src="https://www.youtube-nocookie.com/embed/' + m[1] + "?autoplay=1&mute=1&loop=1&playlist=" + m[1] + '&controls=0&showinfo=0&modestbranding=1&playsinline=1" title="Background video" allow="autoplay" loading="lazy" tabindex="-1"></iframe>', y); changed(); renderContent(); }
    });
    on("c-bgimg", "click", function () { mediaPicker(function (u) { setBase(el, "background-image", 'url("' + u + '")'); changed(); renderContent(); }); });
    on("c-bgvid", "change", function () { var v = el.querySelector(":scope>.wx-bgv video"); if (v) { v.setAttribute("src", this.value.trim()); changed(); } });
    on("c-bgyt", "change", function () { var m = /(?:youtu\.be\/|v=|embed\/)([\w-]{11})/.exec(this.value); if (!m) return toast("That is not a YouTube link", true); var f = el.querySelector(":scope>.wx-bgv iframe"); f.src = "https://www.youtube-nocookie.com/embed/" + m[1] + "?autoplay=1&mute=1&loop=1&playlist=" + m[1] + "&controls=0&modestbranding=1&playsinline=1"; f.parentElement.setAttribute("data-yt", this.value); changed(); });
    on("c-parallax", "change", function () { el.classList.toggle("wx-parallax", this.checked); changed(); });
    on("c-ovl", "change", function () {
      var o = el.querySelector(":scope>.wx-ovl");
      if (this.checked && !o) { o = S.doc.createElement("div"); o.className = "wx-ovl"; o.setAttribute("aria-hidden", "true"); o.style.backgroundColor = "#0a0f1e"; o.style.opacity = "0.5"; var bv = el.querySelector(":scope>.wx-bgv"); bv ? bv.after(o) : el.insertBefore(o, el.firstChild); }
      if (!this.checked && o) o.remove(); fxClass(); changed(); renderContent();
    });
    var ovSet = function (prop, v) { var o = el.querySelector(":scope>.wx-ovl"); if (o) { o.style[prop] = v; debounceHist(); } };
    on("c-ovl-c", "input", function () { $("#c-ovl-ct", pane).value = this.value; this.parentElement.style.setProperty("--c", this.value); ovSet("backgroundColor", this.value); });
    on("c-ovl-ct", "change", function () { ovSet("backgroundColor", this.value.replace(/[;{}<>]/g, "")); });
    on("c-ovl-o", "input", function () { $("#c-ovl-ot", pane).value = this.value; ovSet("opacity", this.value); });
    on("c-ovl-ot", "change", function () { ovSet("opacity", Math.max(0, Math.min(1, parseFloat(this.value) || 0))); });
    ["top", "bottom"].forEach(function (pos) {
      var get = function () { return el.querySelector(":scope>.wx-sep-" + pos); };
      var draw = function (n, shape) { n.setAttribute("data-shape", shape); n.innerHTML = '<svg viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="' + SEPS[shape] + '" fill="currentColor"/></svg>'; };
      on("c-sep-" + pos, "change", function () {
        var n = get();
        if (this.checked && !n) { n = S.doc.createElement("div"); n.className = "wx-sep wx-sep-" + pos; n.setAttribute("aria-hidden", "true"); n.style.color = "#ffffff"; n.style.height = "60px"; draw(n, "wave"); el.appendChild(n); }
        if (!this.checked && n) n.remove(); fxClass(); changed(); renderContent();
      });
      on("c-sep-" + pos + "-shape", "change", function () { draw(get(), this.value); changed(); });
      on("c-sep-" + pos + "-h", "change", function () { get().style.height = (parseInt(this.value) || 60) + "px"; changed(); });
      on("c-sep-" + pos + "-c", "input", function () { $("#c-sep-" + pos + "-ct", pane).value = this.value; this.parentElement.style.setProperty("--c", this.value); get().style.color = this.value; debounceHist(); });
      on("c-sep-" + pos + "-ct", "change", function () { get().style.color = this.value.replace(/[;{}<>]/g, ""); changed(); });
    });
    // General (C6)
    on("g-id", "change", function () { this.value ? el.id = this.value.trim().replace(/\s+/g, "-") : el.removeAttribute("id"); changed(); });
    on("g-title", "change", function () { this.value ? el.setAttribute("title", this.value) : el.removeAttribute("title"); changed(); });
    $$("#g-chips .chip button", pane).forEach(function (b) { b.onclick = function () { el.classList.remove(b.dataset.c); changed(); renderContent(); }; });
    on("g-addc", "keydown", function (e) { if (e.key === "Enter" && this.value.trim()) { this.value.trim().split(/\s+/).forEach(function (c) { if (/^[\w-]+$/.test(c)) el.classList.add(c); }); changed(); renderContent(); } });
    $$("[data-t]", pane).forEach(function (b) { b.onclick = function () { tool(b.dataset.t); }; });
  }
  function syncTextField() { var t = $("#c-text"); if (t && S.editing === S.sel && document.activeElement !== t) t.value = S.sel.textContent; }
  function setImg(img, url, w, h) {
    if (!url) return; img.setAttribute("src", url); img.removeAttribute("srcset"); img.removeAttribute("sizes");
    var pic = img.closest("picture"); if (pic) $$("source", pic).forEach(function (s) { s.remove(); });
    if (w && h) { img.setAttribute("width", w); img.setAttribute("height", h); }
    changed(); if (S.sel === img) renderContent(); toast("Image updated");
  }

  // ---------- STYLE (per device, normal/hover, element/class scope)
  var U = ["px", "rem", "em", "%", "vw", "vh", "auto"], UR = ["px", "%", "rem"], UD = ["deg"];
  var ST = {
    display: [["display", "Display", "sel", [["", "Default"], ["block", "Block"], ["inline", "Inline"], ["inline-block", "Inline block"], ["flex", "Flex"], ["inline-flex", "Inline flex"], ["grid", "Grid"], ["none", "Hidden"]]],
      ["position", "Position", "sel", [["", "Default"], ["static", "Static"], ["relative", "Relative"], ["absolute", "Absolute"], ["fixed", "Fixed"], ["sticky", "Sticky"]]],
      ["top", "Top", "unit"], ["left", "Left", "unit"], ["bottom", "Bottom", "unit"], ["right", "Right", "unit"],
      ["float", "Float", "seg", [["", "×"], ["left", "⇤"], ["right", "⇥"]], 1], ["z-index", "Z-index", "num"],
      ["opacity", "Opacity", "range", [0, 1, 0.05], 1], ["background-color", "Background", "color", null, 1], ["color", "Text colour", "color", null, 1]],
    typo: [["font-size", "Font size", "unit"], ["font-weight", "Font weight", "sel", [["", "Default"], ["300", "Light"], ["400", "Normal"], ["500", "Medium"], ["600", "Semi-bold"], ["700", "Bold"], ["800", "Extra-bold"]]],
      ["font-family", "Font family", "font", null, 1], ["text-align", "Text align", "seg", [["", "×"], ["left", "⇤"], ["center", "↔"], ["right", "⇥"], ["justify", "☰"]], 1],
      ["line-height", "Line height", "unit", ["", "px", "em", "%"]], ["letter-spacing", "Letter spacing", "unit", ["px", "em"]],
      ["text-transform", "Transform", "seg", [["", "×"], ["uppercase", "AA"], ["capitalize", "Aa"], ["lowercase", "aa"]]], ["font-style", "Style", "seg", [["", "×"], ["italic", "I"], ["normal", "N"]]],
      ["text-decoration-line", "Text decoration", "seg", [["", "×"], ["underline", "U̲"], ["overline", "O̅"], ["line-through", "S̶"], ["none", "∅"]], 1],
      ["text-decoration-color", "Decoration colour", "color", null, 1], ["text-decoration-style", "Decoration style", "sel", [["", "Default"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["double", "Double"], ["wavy", "Wavy"]], 1]],
    size: [["width", "Width", "unit"], ["height", "Height", "unit"], ["min-width", "Min width", "unit"], ["min-height", "Min height", "unit"], ["max-width", "Max width", "unit"], ["max-height", "Max height", "unit"]],
    border: [["border-width", "Width", "unit", ["px"]], ["border-style", "Style", "sel", [["", "Default"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["none", "None"]]], ["border-color", "Colour", "color", null, 1]],
    bgimg: [["background-image", "Image", "bgimg", null, 1], ["background-size", "Size", "sel", [["", "Default"], ["cover", "Cover"], ["contain", "Contain"], ["auto", "Auto"]]], ["background-position", "Position", "sel", [["", "Default"], ["center", "Center"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]]],
      ["background-repeat", "Repeat", "sel", [["", "Default"], ["no-repeat", "No repeat"], ["repeat", "Repeat"], ["repeat-x", "Horizontal"], ["repeat-y", "Vertical"]]], ["background-attachment", "Attachment", "sel", [["", "Default"], ["scroll", "Scroll"], ["fixed", "Fixed (parallax)"]]]],
    fx: [["box-shadow", "Shadow", "sel", [["", "Default"], ["none", "None"], ["0 2px 8px rgba(0,0,0,.08)", "Small"], ["0 10px 30px rgba(0,0,0,.12)", "Medium"], ["0 24px 60px rgba(0,0,0,.18)", "Large"], ["inset 0 0 0 1px rgba(0,0,0,.1)", "Inner line"]], 1],
      ["rotate", "Rotate", "unit", UD], ["scale", "Scale", "num"], ["translate", "Move (x y)", "text", null, 1],
      ["transition", "Animation speed", "sel", [["", "Default"], ["none", "None"], ["all .2s ease", "Fast (0.2s)"], ["all .4s ease", "Normal (0.4s)"], ["all .8s ease", "Slow (0.8s)"]], 1], ["cursor", "Cursor", "sel", [["", "Default"], ["pointer", "Pointer"], ["default", "Arrow"]]]]
  };
  function toHex(c) {
    if (!c) return "#000000"; if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(function (x) { return x + x; }).join("");
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? "#" + [m[1], m[2], m[3]].map(function (x) { return (+x).toString(16).padStart(2, "0"); }).join("") : "#000000";
  }
  function f2(lbl, inner, full) { return '<div class="f2' + (full ? " full" : "") + '"><span>' + lbl + "</span>" + inner + "</div>"; }
  function splitUnit(v, units) { var m = /^(-?[\d.]+)([a-z%]*)$/i.exec(v || ""); if (v === "auto") return ["", "auto"]; return m ? [m[1], m[2]] : [v || "", units[0]]; }
  function parseColor(c) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || ""); if (m) return { hex: "#" + [m[1], m[2], m[3]].map(function (x) { return (+x).toString(16).padStart(2, "0"); }).join(""), a: m[4] == null ? 1 : +m[4] };
    return { hex: toHex(c), a: 1 };
  }
  function mkColor(hex, a) { if (a >= 1) return hex; var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + (+a).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + ")"; }
  function ctl(el, def) {
    var p = def[0], v = getStyle(el, p), cs = S.doc.defaultView.getComputedStyle(el), comp = cs.getPropertyValue(p) || "", ph = esc(comp).slice(0, 40), t = def[2];
    if (t === "font") return '<select data-p="' + p + '"><option value="">Default (' + esc(cs.fontFamily.split(",")[0].replace(/"/g, "")) + ")</option>" + ["DM Sans"].concat(Object.keys(GFONTS)).concat(["Georgia", "system-ui"]).map(function (f) { return '<option style="font-family:\'' + f + '\'"' + (f === v ? " selected" : "") + ">" + f + "</option>"; }).join("") + "</select>";
    if (t === "sel") return '<select data-p="' + p + '">' + def[3].map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
    if (t === "seg") return '<div class="seg" data-p="' + p + '">' + def[3].map(function (o) { return '<button type="button" data-v="' + o[0] + '"' + (o[0] === v ? ' class="is-on"' : "") + ' title="' + (o[0] || "Default") + '">' + o[1] + "</button>"; }).join("") + "</div>";
    if (t === "color") { var pc = parseColor(v || comp); return '<div class="clr2"><input type="text" data-p="' + p + '" value="' + esc(v) + '" placeholder="' + ph + '"><span class="sw" style="--c:' + esc(v || comp || "transparent") + '"><input type="color" data-pc="' + p + '" value="' + pc.hex + '"></span><input type="range" class="alpha" data-pa="' + p + '" min="0" max="1" step="0.05" value="' + pc.a + '" title="Transparency"></div>'; }
    if (t === "range") { var r = def[3]; return '<div class="rng"><input type="range" data-pr="' + p + '" min="' + r[0] + '" max="' + r[1] + '" step="' + r[2] + '" value="' + esc(v || parseFloat(comp) || r[1]) + '"><input type="text" data-p="' + p + '" value="' + esc(v) + '" placeholder="' + ph + '"></div>'; }
    if (t === "bgimg") return '<div class="cw"><input type="text" data-p="' + p + '" value="' + esc(v) + '" placeholder="none"><button class="btn btn-sm" data-bgpick="1">🖼 Choose</button><button class="btn btn-sm" data-bgclear="1">×</button></div>';
    if (t === "unit") {
      var units = def[3] || U, su = splitUnit(v, units), num = su[0], un = su[1];
      if (units.indexOf(un) < 0) { num = v; un = units[0]; }
      return '<div class="unit" data-pu="' + p + '"><input type="text" value="' + esc(num) + '" placeholder="' + esc(parseFloat(comp) || (comp === "auto" ? "auto" : "")) + '"><select>' + units.map(function (u) { return "<option" + (u === un ? " selected" : "") + ' value="' + u + '">' + (u || "–") + "</option>"; }).join("") + "</select></div>";
    }
    return '<input type="text" data-p="' + p + '" data-t="' + t + '" value="' + esc(v) + '" placeholder="' + ph + '">';
  }
  function box4(el, props, labels) {
    var cs = S.doc.defaultView.getComputedStyle(el);
    return '<div class="box4">' + props.map(function (p, i) { return '<label><input type="text" data-p="' + p + '" data-t="len" value="' + esc(getStyle(el, p)) + '" placeholder="' + esc(parseInt(cs.getPropertyValue(p)) || 0) + '"><small>' + labels[i] + "</small></label>"; }).join("") +
      '</div><label class="lnk"><input type="checkbox" data-link4="1"> Same value on all sides</label>';
  }
  var SIDES = ["top", "right", "bottom", "left"];
  function renderStyle() {
    var el = S.sel, rows = function (list) { return '<div class="g2">' + list.map(function (d) { return f2(d[1], ctl(el, d), d[4]); }).join("") + "</div>"; };
    // linked styles (B7)
    var shared = Array.prototype.filter.call(el.classList, function (c) { return !/^wx-(hide|pad|bg)/.test(c); }).map(function (c) { var n = 0; try { n = S.doc.querySelectorAll("." + CSS.escape(c)).length; } catch (e) {} return [c, n]; }).filter(function (x) { return x[1] > 1; });
    if (S.scope === "cls" && !el.classList.contains(S.scopeCls)) S.scope = "el";
    var link = shared.length ? '<div class="linked"><b>🔗 Linked styles</b><br>This element shares its class with other elements. Apply styles to:' +
      '<label><input type="radio" name="scope" value="el"' + (S.scope === "el" ? " checked" : "") + '> <b>This element only</b></label>' +
      shared.map(function (x) { return '<label><input type="radio" name="scope" value="' + esc(x[0]) + '"' + (S.scope === "cls" && S.scopeCls === x[0] ? " checked" : "") + "> All <code>." + esc(x[0]) + "</code> on this page (" + x[1] + ")</label>"; }).join("") + "</div>" : "";
    var head = '<div class="st-head"><div>Editing <span class="dev-badge">' + DEVNAME[S.dev] + '</span></div><select id="s-state" title="State">' + [["", "- State: Normal -"], ["h", "Hover"], ["f", "Focus"], ["a", "Active (pressed)"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.state ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '</select><button class="reset-l" id="s-reset">Reset</button></div>';
    var h = head + link + group("Display", rows(ST.display), false) + group("Typography", rows(ST.typo), false) +
      group("Size", rows(ST.size), false) +
      group("Margin", box4(el, SIDES.map(function (s) { return "margin-" + s; }), ["Top", "Right", "Bottom", "Left"]), false) +
      group("Padding", box4(el, SIDES.map(function (s) { return "padding-" + s; }), ["Top", "Right", "Bottom", "Left"]), false) +
      group("Border", rows(ST.border), false) +
      group("Border radius", box4(el, ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"], ["↖", "↗", "↘", "↙"]), false) +
      group("Background image", rows(ST.bgimg), false) + group("Effects & transform", rows(ST.fx), false);
    var pane = $("#pane-style"), openState = {}; $$(".sec", pane).forEach(function (d) { openState[d.querySelector("summary").textContent] = d.open; });
    pane.innerHTML = h; $$(".sec", pane).forEach(function (d) { var k = d.querySelector("summary").textContent; if (k in openState) d.open = openState[k]; });
    bindStyle(pane, el);
  }
  function bindStyle(pane, el) {
    var sync = function () { renderStyle(); };
    $$("[name=scope]", pane).forEach(function (r) { r.onchange = function () { if (r.value === "el") S.scope = "el"; else { S.scope = "cls"; S.scopeCls = r.value; } sync(); }; });
    $("#s-state", pane).onchange = function () { S.state = this.value; sync(); };
    $$("[data-p]", pane).forEach(function (n) {
      var p = n.dataset.p;
      if (n.classList.contains("seg")) { $$("button", n).forEach(function (b) { b.onclick = function () { setStyle(el, p, b.dataset.v); $$("button", n).forEach(function (x) { x.classList.toggle("is-on", x === b); }); }; }); return; }
      var apply = function () {
        var v = n.value.trim();
        if (n.dataset.t === "len" && /^-?\d+(\.\d+)?$/.test(v)) v += "px";
        if (p === "background-image" && v && !/^url\(|gradient\(|^none$/.test(v)) v = 'url("' + v.replace(/["()]/g, "") + '")';
        setStyle(el, p, v);
        var pc = $('[data-pc="' + p + '"]', pane); if (pc && v) { var c = parseColor(v); pc.value = c.hex; $('[data-pa="' + p + '"]', pane).value = c.a; pc.parentElement.style.setProperty("--c", v); }
        var pr = $('[data-pr="' + p + '"]', pane); if (pr && v) pr.value = v;
        var l4 = n.closest(".sec") && $("[data-link4]", n.closest(".sec"));
        if (l4 && l4.checked) $$(".box4 [data-p]", n.closest(".sec")).forEach(function (o) { if (o !== n) { o.value = n.value; setStyle(el, o.dataset.p, v); } });
      };
      n.addEventListener("change", apply);
      if (n.tagName === "INPUT") n.addEventListener("keydown", function (e) { if (e.key === "Enter") apply(); });
    });
    $$("[data-pu]", pane).forEach(function (w) {
      var p = w.dataset.pu, inp = $("input", w), sel = $("select", w);
      var apply = function () { var num = inp.value.trim(), u = sel.value; if (u === "auto") { inp.value = ""; setStyle(el, p, "auto"); return; } setStyle(el, p, num === "" ? "" : /^-?[\d.]+$/.test(num) ? num + u : num); };
      inp.addEventListener("change", apply); sel.addEventListener("change", apply);
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") apply();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); var n = parseFloat(inp.value || inp.placeholder) || 0, step = e.shiftKey ? 10 : (sel.value === "em" || sel.value === "rem" || sel.value === "" ? 0.1 : 1); inp.value = +(n + (e.key === "ArrowUp" ? step : -step)).toFixed(2); apply(); }
      });
    });
    $$("[data-pc]", pane).forEach(function (n) {
      var p = n.dataset.pc, a = $('[data-pa="' + p + '"]', pane), t = $('[data-p="' + p + '"]', pane);
      var upd = function (e) { if (e && e.target === n && !t.value && +a.value === 0) a.value = 1; var v = mkColor(n.value, +a.value); t.value = v; n.parentElement.style.setProperty("--c", v); setStyle(el, p, v); };
      n.addEventListener("input", upd); a.addEventListener("input", upd);
    });
    $$("[data-pr]", pane).forEach(function (r) { r.addEventListener("input", function () { $('[data-p="' + r.dataset.pr + '"]', pane).value = r.value; setStyle(el, r.dataset.pr, r.value); }); });
    var bp = $("[data-bgpick]", pane); if (bp) bp.onclick = function () { mediaPicker(function (u) { setStyle(el, "background-image", 'url("' + u + '")'); if (!getStyle(el, "background-size")) setStyle(el, "background-size", "cover"); if (!getStyle(el, "background-position")) setStyle(el, "background-position", "center"); renderStyle(); }); };
    var bc = $("[data-bgclear]", pane); if (bc) bc.onclick = function () { setStyle(el, "background-image", ""); renderStyle(); };
    $("#s-reset", pane).onclick = function () { var k = keyFor(el); if (k && S.styles[k]) { delete S.styles[k][bucket()]; renderCSS(); pushHist(); renderStyle(); toast(DEVNAME[S.dev] + (S.state ? " hover" : "") + " styles cleared"); } };
  }

  // ---------- ADVANCED
  function renderAdvanced() {
    var el = S.sel, id = sid(el), custom = id && S.styles[id] && S.styles[id].d ? S.styles[id].d.css || "" : "";
    var classes = Array.prototype.filter.call(el.classList, function (c) { return c; });
    var h = group("General", field("Tag", "<code>&lt;" + el.tagName.toLowerCase() + "&gt;</code>") +
        field("ID", '<input type="text" id="a-id" value="' + esc(el.id) + '">') +
        field("Title", '<input type="text" id="a-title" value="' + esc(el.getAttribute("title") || "") + '">') +
        field("Aria label", '<input type="text" id="a-aria" value="' + esc(el.getAttribute("aria-label") || "") + '">') +
        field("Classes", '<div class="chips" id="a-chips">' + classes.map(function (c) { return '<span class="chip">' + esc(c) + '<button data-c="' + esc(c) + '">×</button></span>'; }).join("") + '<input type="text" id="a-addc" placeholder="add class + Enter"></div>', true)) +
      group("Responsive visibility", field("Hide on", '<label><input type="checkbox" data-hide="wx-hide-d"' + (el.classList.contains("wx-hide-d") ? " checked" : "") + "> Desktop</label>") +
        field("", '<label><input type="checkbox" data-hide="wx-hide-t"' + (el.classList.contains("wx-hide-t") ? " checked" : "") + "> Tablet</label>") +
        field("", '<label><input type="checkbox" data-hide="wx-hide-m"' + (el.classList.contains("wx-hide-m") ? " checked" : "") + "> Mobile</label>")) +
      group("Custom CSS", field("Declarations for this element (desktop)", '<textarea id="a-css" rows="5" placeholder="e.g. transform: rotate(-2deg);">' + esc(custom) + "</textarea>", true) + '<button class="btn btn-sm" id="a-css-apply">Apply CSS</button>') +
      group("HTML", '<button class="btn btn-sm" id="a-code">&lt;/&gt; Edit HTML of this element</button>', false);
    var pane = $("#pane-advanced"); pane.innerHTML = h;
    var attr = function (sel, name) { $(sel, pane).onchange = function () { this.value ? el.setAttribute(name, this.value) : el.removeAttribute(name); changed(); }; };
    attr("#a-id", "id"); attr("#a-title", "title"); attr("#a-aria", "aria-label");
    $$("#a-chips .chip button", pane).forEach(function (b) { b.onclick = function () { el.classList.remove(b.dataset.c); changed(); renderAdvanced(); }; });
    $("#a-addc", pane).onkeydown = function (e) { if (e.key === "Enter" && this.value.trim()) { this.value.trim().split(/\s+/).forEach(function (c) { if (/^[\w-]+$/.test(c)) el.classList.add(c); }); changed(); renderAdvanced(); } };
    $$("[data-hide]", pane).forEach(function (c) { c.onchange = function () { el.classList.toggle(c.dataset.hide, c.checked); changed(); }; });
    $("#a-css-apply", pane).onclick = function () { var i = sid(el, true); S.styles[i] = S.styles[i] || {}; S.styles[i].d = S.styles[i].d || {}; var v = $("#a-css", pane).value.replace(/[{}<>]/g, "").trim(); if (v) S.styles[i].d.css = v; else delete S.styles[i].d.css; renderCSS(); pushHist(); toast("CSS applied"); };
    $("#a-code", pane).onclick = openCode;
  }

  // =================================================================== CODE EDITOR
  function openCode() {
    if (!S.sel) return toast("Select an element first");
    var c = S.sel.cloneNode(true); cleanNode(c); $("#code-ta").value = c.outerHTML; $("#code").hidden = false;
  }
  $("#code-btn").onclick = $("#code-btn2").onclick = function () { $("#code").hidden ? openCode() : ($("#code").hidden = true); };
  $("#code-cancel").onclick = function () { $("#code").hidden = true; };
  $("#code-apply").onclick = function () {
    if (!S.sel) return; var t = S.doc.createElement("template"); t.innerHTML = $("#code-ta").value.trim();
    var n = t.content.firstElementChild; if (!n) return toast("Invalid HTML", true);
    if (t.content.querySelector("script,object,embed,base,meta,link[rel=import]")) return toast("Scripts and embeds (<script>, <object>, <embed>) are not allowed here", true);
    var badFr = Array.prototype.filter.call(t.content.querySelectorAll("iframe"), function (f) { return !SAFE_IFRAME.test(f.getAttribute("src") || ""); });
    if (badFr.length && !confirm("This HTML contains an iframe from an unknown website. It will appear on the live site. Continue?")) return;
    var removed = sanitize(t.content); if (removed) toast(removed + " unsafe attribute(s) removed (onclick/javascript:)");
    finishEdit(); S.sel.replaceWith(t.content); renderCSS(); changed(); select(n); toast("HTML applied");
  };

  // =================================================================== MEDIA
  function mediaPicker(cb) {
    api("media").then(function (r) {
      if (!r.ok) return toast(r.error, true);
      modal("<h2>Image library</h2><div class='row' style='margin-bottom:12px'><button class='btn' id='mp-up'>⬆ Upload new image</button></div><div class='media-grid'>" + r.media.map(function (u) { return "<button data-u='" + esc(u) + "'><img src='" + esc(u) + "' loading='lazy' alt=''></button>"; }).join("") + "</div>");
      $("#mp-up").onclick = function () { closeModal(); upload(cb); };
      $$(".media-grid button").forEach(function (b) { b.onclick = function () { var im = b.querySelector("img"); cb(b.dataset.u, im.naturalWidth, im.naturalHeight); closeModal(); }; });
    });
  }
  function upload(cb) {
    var f = $("#img-file"); f.value = "";
    f.onchange = function () { var file = f.files[0]; if (!file) return; toast("Uploading…"); api("upload", null, file).then(function (r) { if (!r.ok) return toast(r.error, true); cb(r.url, r.width, r.height); }); };
    f.click();
  }

  // =================================================================== LEFT PANEL / DEVICES / PREVIEW
  $$(".rl").forEach(function (b) { b.onclick = function () { $$(".rl").forEach(function (x) { x.classList.toggle("is-on", x === b); }); $$(".lp").forEach(function (p) { p.classList.toggle("is-on", p.dataset.lp === b.dataset.left); }); if (b.dataset.left === "layers") renderLayers(true); }; });
  var WIDTH = { d: "100%", t: "820px", m: "390px" };
  $$(".dev").forEach(function (b) {
    b.onclick = function () {
      S.dev = b.dataset.dev; $$(".dev").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      var w = $("#frame-wrap"); w.style.width = WIDTH[S.dev]; w.classList.toggle("is-dev", S.dev !== "d");
      $("#dev-note").textContent = "Editing: " + DEVNAME[S.dev]; if (S.sel) setTimeout(renderStyle, 300);
    };
  });
  $("#preview-btn").onclick = function () { finishEdit(); S.preview = !S.preview; this.classList.toggle("is-on", S.preview); $("#app").classList.toggle("preview-mode", S.preview); toast(S.preview ? "Preview mode — click 👁 again to edit" : "Edit mode"); };

  // =================================================================== SEO
  function metaDesc() { var m = S.doc.querySelector('meta[name="description"]'); if (!m) { m = S.doc.createElement("meta"); m.name = "description"; S.doc.head.appendChild(m); } return m; }
  function seoSnap() { return S.doc ? S.doc.title + "\u0001" + (metaDesc().getAttribute("content") || "") : ""; }
  function fillSeo() { $("#seo-title").value = S.doc.title; $("#seo-desc").value = metaDesc().getAttribute("content") || ""; seoPreview(); }
  function seoPreview() {
    var t = $("#seo-title").value, d = $("#seo-desc").value, p = S.pages.find(function (x) { return x.path === S.path; });
    $("#seo-title-n").textContent = "(" + t.length + "/60)"; $("#seo-desc-n").textContent = "(" + d.length + "/160)";
    $("#seo-title-n").style.color = t.length > 60 ? "#dc2626" : ""; $("#seo-desc-n").style.color = d.length > 160 || d.length < 70 ? "#dc2626" : "";
    $("#serp-url").textContent = "woodex.com.pk" + (p ? p.url : "/"); $("#serp-t").textContent = t; $("#serp-d").textContent = d;
  }
  $("#seo-title").oninput = function () { S.doc.title = this.value; var og = S.doc.querySelector('meta[property="og:title"]'); if (og) og.setAttribute("content", this.value); seoPreview(); updateDirty(); };
  $("#seo-desc").oninput = function () { metaDesc().setAttribute("content", this.value); var og = S.doc.querySelector('meta[property="og:description"]'); if (og) og.setAttribute("content", this.value); seoPreview(); updateDirty(); };

  // =================================================================== THEME
  var FONTS = { dm: '"DM Sans",system-ui,sans-serif', system: 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', serif: 'Georgia,"Times New Roman",serif' };
  var TDEF = { "--wx-navy": "#0a0f1e", "--wx-ink": "#000000", "--wx-muted": "#525252", "--wx-paper": "#ffffff", "--wx-surface": "#f7f7f7", "--wx-beige": "#fcf2e8", "--wx-font": "dm", "--wx-font-head": "dm", "--wx-base-size": "16px", "--wx-section": "112px", "--wx-container": "1240px", "--wx-btn-radius": "999px", "--wx-r-lg": "16px" };
  function tIn() { return $$("[data-var]", $('[data-lp="theme"]')); }
  function showOut(i) { var o = i.parentElement.querySelector("output"); if (o) o.textContent = i.value + (i.dataset.unit || ""); }
  function fillTheme() { tIn().forEach(function (i) { var v = S.theme[i.dataset.var] != null ? S.theme[i.dataset.var] : TDEF[i.dataset.var]; i.value = i.dataset.unit ? parseFloat(v) : v; showOut(i); }); applyTheme(); }
  function readTheme() { var v = {}; tIn().forEach(function (i) { v[i.dataset.var] = i.value + (i.dataset.unit || ""); }); return v; }
  function applyTheme() {
    if (!S.doc) return; var el = S.doc.getElementById("wx-theme-live"); if (!el) return; var v = readTheme(), css = ":root{";
    Object.keys(v).forEach(function (k) { css += k + ":" + (/font/.test(k) ? FONTS[v[k]] : v[k]) + ";"; });
    el.textContent = css + "--navy:var(--wx-navy);--navy-2:var(--wx-navy);--ink:var(--wx-ink);--muted:var(--wx-muted)}html{font-size:var(--wx-base-size)}body,button,input,select,textarea{font-family:var(--wx-font)!important}main h1,main h2,main h3{font-family:var(--wx-font-head)}";
  }
  tIn().forEach(function (i) { i.addEventListener("input", function () { showOut(i); applyTheme(); }); });
  $("#theme-reset").onclick = function () { S.theme = {}; fillTheme(); toast("Defaults loaded — click Save theme"); };
  $("#theme-save").onclick = function () { var v = readTheme(); api("theme", { vars: v }).then(function (r) { if (!r.ok) return toast(r.error, true); S.theme = v; toast("Theme saved for the whole website ✓"); }); };

  // =================================================================== SAVE / PAGES
  function save(force) {
    if (!S.doc || ($("#save").disabled && !force)) return;
    var html = serialise(), gch = regionChanges(); $("#save").disabled = true; $("#save").textContent = "Saving…";
    api("save", { path: S.path, html: html, mtime: S.mtime, force: !!force }).then(function (r) {
      $("#save").textContent = "Save";
      if (r.status === 409) { if (confirm(r.error)) return save(true); updateDirty(); return; }
      if (!r.ok) { updateDirty(); return toast(r.error, true); }
      S.mtime = r.mtime; S.savedSnap = snap(); S.seoSaved = seoSnap(); updateDirty(); try { localStorage.removeItem(draftKey()); } catch (e) {}
      if (gch.length) propagateGlobal(gch); else toast("Saved & live ✓ (backup kept)");
    });
  }
  $("#save").onclick = function () { save(); };
  window.addEventListener("beforeunload", function (e) { if (!$("#save").disabled || S.propagating) { e.preventDefault(); e.returnValue = ""; } });
  $("#page-select").onchange = function () { if (S.propagating) { this.value = S.path; return toast("Please wait — still updating the header/footer on all pages", true); } if (!$("#save").disabled && !confirm("You have unsaved changes. Leave without saving?")) { this.value = S.path; return; } loadPage(this.value); };

  // =================================================================== MENU / MODAL
  function modal(h) { $("#modal-body").innerHTML = h; $("#modal").hidden = false; }
  function closeModal() { $("#modal").hidden = true; $("#modal-body").innerHTML = ""; }
  $("#modal-x").onclick = closeModal; $("#modal").onclick = function (e) { if (e.target === this) closeModal(); };
  $("#menu-btn").onclick = function (e) { e.stopPropagation(); $("#menu").hidden = !$("#menu").hidden; };
  document.addEventListener("click", function () { $("#menu").hidden = true; });
  $$("#menu button").forEach(function (b) {
    b.onclick = function () {
      var a = b.dataset.act;
      if (window.__wx3 && /^(newpage|duppage|export|zip|pagecode|keys)$/.test(a)) window.__wx3.menu(a);
      if (a === "logout") {
        var at = sessionStorage.getItem("wxaTok"); sessionStorage.removeItem("wxTok");
        if (!S.adminOnly || !at) return location.reload();
        fetch("/api/admin.php", { method: "POST", headers: { "Content-Type": "application/json", "X-WX-ADM": at }, body: JSON.stringify({ action: "logout" }) })
          .catch(function () {}).then(function () { sessionStorage.removeItem("wxaTok"); location.href = "/admin/"; });
      }
      if (a === "backups") api("backups", { path: S.path }).then(function (r) {
        if (!r.ok) return toast(r.error, true);
        var rows = r.backups.map(function (x) { var f = x.file; return "<div><span>" + f.slice(0, 4) + "-" + f.slice(4, 6) + "-" + f.slice(6, 8) + " " + f.slice(9, 11) + ":" + f.slice(11, 13) + ":" + f.slice(13, 15) + " · " + Math.round(x.size / 1024) + " KB</span><button class='btn btn-sm' data-f='" + f + "'>Restore</button></div>"; }).join("");
        modal("<h2>Page history</h2><p class='hint'>A backup is made before every save (last 30 kept).</p><div class='bk-list'>" + (rows || "<p class='hint'>No backups yet.</p>") + "</div>");
        $$(".bk-list button").forEach(function (btn) { btn.onclick = function () { if (!confirm("Restore this version? The current one is backed up first.")) return; api("restore", { path: S.path, file: btn.dataset.f }).then(function (r2) { if (!r2.ok) return toast(r2.error, true); closeModal(); toast("Restored ✓"); loadPage(S.path); }); }; });
      });
      if (a === "password" && S.adminOnly) { location.href = "/admin/#profile"; return; }
      if (a === "password") {
        modal("<h2>Change password</h2><form id='pw-form'><label>Current password<input type='password' id='pw-c' required></label><label>New password (min 8)<input type='password' id='pw-n' minlength='8' required></label><button class='btn btn-pri'>Update</button></form>");
        $("#pw-form").onsubmit = function (e) { e.preventDefault(); api("password", { current: $("#pw-c").value, next: $("#pw-n").value }).then(function (r) { if (!r.ok) return toast(r.error, true); S.csrf = r.csrf; sessionStorage.setItem("wxTok", r.csrf); closeModal(); toast("Password updated ✓"); }); };
      }
    };
  });

  // =================================================================== PHASE 3 — move, resize, text bar, context menu, clipboard, blocks, pages, export
  var frameRect = function () { return $("#frame").getBoundingClientRect(); };
  var isMedia = function (el) { return el && (/^(IMG|VIDEO|IFRAME)$/.test(el.tagName) || (el.classList && (el.classList.contains("wx-el-video") || el.classList.contains("wx-el-map")))); };

  // ---- drag-move (F1/F3)
  var MV = null;
  function blockAt(x, y, moving) {
    var el = S.doc.elementFromPoint(x, y), main = S.doc.querySelector("main"); if (!el || !main) return null;
    if (isSection(moving)) { var s = el.closest && el.closest("main > *"); return s && s !== moving ? s : null; }
    if (el.closest("svg")) el = el.closest("svg").parentElement;
    while (el && el !== S.doc.body && (S.doc.defaultView.getComputedStyle(el).display.indexOf("inline") === 0 || moving.contains(el))) el = el.parentElement;
    if (!el || el === S.doc.body || el === main || el.contains(moving) && el !== moving.parentElement) return el && el !== S.doc.body && el !== main && !moving.contains(el) ? el : null;
    return el;
  }
  function startMove(el) { if (!el || el === S.doc.body) return; finishEdit(); MV = { el: el, at: null }; $("#ov-cap").style.display = "block"; var g = document.createElement("div"); g.className = "ov-ghost"; g.id = "ov-ghost"; g.textContent = "Moving: " + label(el); document.body.appendChild(g); }
  function moveTo(x, y, px, py) {
    if (!MV) return; var g = $("#ov-ghost"); if (g) { g.style.left = px + 14 + "px"; g.style.top = py + 10 + "px"; }
    var vh = S.doc.defaultView.innerHeight; if (y < 50) S.doc.defaultView.scrollBy(0, -18); else if (y > vh - 50) S.doc.defaultView.scrollBy(0, 18);
    var t = blockAt(x, y, MV.el); if (!t || t === MV.el) { hideDrop(); MV.at = null; return; }
    if (isSection(t) && !isSection(MV.el)) { var c = containerOf(t), lc = c.lastElementChild; if (lc && lc !== MV.el && !MV.el.contains(lc)) { MV.at = { ref: lc, before: false }; showDropLine(lc.getBoundingClientRect(), false); } return; }
    var r = t.getBoundingClientRect(), before = y < r.top + r.height / 2; MV.at = { ref: t, before: before }; showDropLine(r, before);
  }
  function endMove() {
    if (!MV) return; var at = MV.at, el = MV.el; MV = null; hideDrop(); $("#ov-cap").style.display = "none"; var g = $("#ov-ghost"); if (g) g.remove();
    if (!at || at.ref === el || el.contains(at.ref)) return;
    at.before ? at.ref.before(el) : at.ref.after(el); changed(); select(el); toast("Moved ✓");
  }
  var capPt = function (e) { var fr = frameRect(); return [e.clientX - fr.left, e.clientY - fr.top]; };
  $(".ov-move").onmousedown = function (e) { e.preventDefault(); e.stopPropagation(); startMove(S.sel); };
  $("#ov-cap").addEventListener("mousemove", function (e) { var p = capPt(e); if (MV) moveTo(p[0], p[1], e.clientX, e.clientY); else if (RS) resizeTo(e); });
  document.addEventListener("mouseup", function () { if (MV) endMove(); if (RS) endResize(); });
  function frameMouse() {
    var down = null;
    S.doc.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || S.preview) return;
      var t = pick(e.target);
      if (t && t === S.sel && isMedia(t)) { e.preventDefault(); down = { el: t, x: e.clientX, y: e.clientY }; }
    }, true);
    S.doc.addEventListener("mousemove", function (e) {
      if (down && !MV && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) { startMove(down.el); $("#ov-cap").style.display = "none"; }
      if (MV && down) { var fr = frameRect(); moveTo(e.clientX, e.clientY, e.clientX + fr.left, e.clientY + fr.top); }
    }, true);
    S.doc.addEventListener("mouseup", function () { if (MV && down) endMove(); down = null; }, true);
    S.doc.addEventListener("dragstart", function (e) { if (!S.drag) e.preventDefault(); }, true);
    S.doc.addEventListener("contextmenu", function (e) {
      e.preventDefault(); if (S.preview) return; var t = pick(e.target); if (t) select(t);
      var fr = frameRect(); openCtx(e.clientX + fr.left, e.clientY + fr.top);
    }, true);
  }

  // ---- resize handles (F4 / D12)
  var RS = null;
  $$("#ov-h i").forEach(function (h) {
    h.onmousedown = function (e) {
      e.preventDefault(); e.stopPropagation(); var el = S.sel, r = el.getBoundingClientRect();
      RS = { el: el, h: h.dataset.h, x: e.clientX, y: e.clientY, w: r.width, ht: r.height, ratio: r.width / (r.height || 1) };
      $("#ov-cap").style.display = "block"; $("#ov-cap").style.cursor = getComputedStyle(h).cursor; $("#ov-h").classList.add("drag");
    };
  });
  function resizeTo(e) {
    var dx = e.clientX - RS.x, dy = e.clientY - RS.y, h = RS.h, w = RS.w, ht = RS.ht;
    if (/e/.test(h)) w = RS.w + dx; if (/w/.test(h)) w = RS.w - dx; if (/s/.test(h)) ht = RS.ht + dy; if (/n/.test(h)) ht = RS.ht - dy;
    w = Math.max(20, Math.round(w)); ht = Math.max(20, Math.round(ht));
    var corner = h.length === 2, img = RS.el.tagName === "IMG";
    if (corner && !e.shiftKey) ht = Math.round(w / RS.ratio);
    if (h !== "n" && h !== "s") setStyleQuiet(RS.el, "width", w + "px");
    if (h === "n" || h === "s" || !img || e.shiftKey) { setStyleQuiet(RS.el, "height", ht + "px"); if (img) setStyleQuiet(RS.el, "object-fit", "cover"); }
    else if (img) setStyleQuiet(RS.el, "height", "auto");
    setStyleQuiet(RS.el, "max-width", "100%");
    $("#ov-size").textContent = w + " × " + ht + (corner ? (e.shiftKey ? " (free)" : " (ratio locked; hold Shift for free)") : "");
  }
  function setStyleQuiet(el, p, v) { var k = keyFor(el, true); S.styles[k] = S.styles[k] || {}; var b = S.styles[k][bucket()] = S.styles[k][bucket()] || {}; b[p] = v; renderCSS(); }
  function endResize() { RS = null; $("#ov-cap").style.display = "none"; $("#ov-cap").style.cursor = ""; $("#ov-h").classList.remove("drag"); pushHist(); if (S.sel) renderStyle(); toast("Size set for " + DEVNAME[S.dev]); }

  // ---- overlay extras driven each frame
  function tick3() {
    if (S.doc && !S.preview && S.sel && S.sel.isConnected) {
      $("#ov-plus").style.display = "block";
      $("#ov-h").classList.toggle("on", isMedia(S.sel) && !S.editing);
      var tb = $("#ov-text");
      if (S.editing) {
        var r = S.editing.getBoundingClientRect(); tb.style.display = "flex";
        var top = r.top - 76; if (top < 4) top = r.bottom + 10;
        tb.style.top = top + "px"; tb.style.left = Math.max(4, Math.min(r.left, $("#frame-wrap").clientWidth - tb.offsetWidth - 4)) + "px";
      } else tb.style.display = "none";
    } else { $("#ov-text").style.display = "none"; $("#ov-h").classList.remove("on"); }
    requestAnimationFrame(tick3);
  }
  requestAnimationFrame(tick3);

  // ---- floating text toolbar (D16)
  $$("#ov-text button").forEach(function (b) {
    b.onmousedown = function (e) { e.preventDefault(); };
    b.onclick = function () {
      if (!S.editing) return; var v = null;
      if (b.dataset.cmd === "createLink") { v = prompt("Link address (page, #section, tel:, mailto: or https://)", "/contact/"); if (!v) return; if (/^\s*javascript:/i.test(v)) return toast("Not allowed", true); }
      S.doc.execCommand(b.dataset.cmd, false, v); S.editing.focus();
    };
  });
  $("#ov-tcolor").onmousedown = function (e) { S.savedRange = S.doc.getSelection().rangeCount ? S.doc.getSelection().getRangeAt(0).cloneRange() : null; };
  $("#ov-tcolor").oninput = function () {
    if (!S.editing) return; var sel = S.doc.getSelection(); if (S.savedRange) { sel.removeAllRanges(); sel.addRange(S.savedRange); }
    S.doc.execCommand("styleWithCSS", false, true); S.doc.execCommand("foreColor", false, this.value);
  };

  // ---- ➕ under every element (F2)
  $("#ov-plus").onclick = function () { if (isSection(S.sel)) pickSectionModal(S.sel); else pickElementModal(S.sel); };
  function pickElementModal(after) {
    modal("<h2>Add an element below</h2><input type='search' class='lib-q' id='pe-q' placeholder='Search…'><div class='lib lib-sm' style='grid-template-columns:repeat(4,1fr)'>" + (window.WX_ELEMENTS || []).map(function (b) { return "<button data-id='" + b.id + "'><span>" + b.icon + "</span>" + esc(b.name) + "</button>"; }).join("") + "</div>");
    $("#pe-q").oninput = function () { var q = this.value.toLowerCase(); $$("#modal-body .lib button").forEach(function (x) { x.hidden = x.textContent.toLowerCase().indexOf(q) < 0; }); };
    $$("#modal-body .lib button").forEach(function (btn) { btn.onclick = function () { var b = WX_ELEMENTS.find(function (x) { return x.id === btn.dataset.id; }); closeModal(); var n = build(b.html); after.after(n); afterInsert(n, "element"); }; });
  }

  // ---- clipboard + shortcuts (E7)
  function packStyles(el) {
    var st = {}; [el].concat($$("[data-wx-s]", el)).forEach(function (n) { var id = n.getAttribute && n.getAttribute("data-wx-s"); if (id && S.styles[id]) st[id] = S.styles[id]; });
    return Object.keys(st).length ? "<!--wx-styles:" + JSON.stringify(st).replace(/--/g, "\\u002d\\u002d") + "-->" : "";
  }
  function cleanOuter(el) { var c = el.cloneNode(true); cleanNode(c); return c.outerHTML; }
  function copyEl() { if (!S.sel) return; S.clip = { html: packStyles(S.sel) + cleanOuter(S.sel), section: isSection(S.sel) }; try { localStorage.setItem("wxClip", JSON.stringify(S.clip)); } catch (e) {} toast("Copied: " + label(S.sel)); }
  function pasteEl() {
    var c = S.clip; if (!c) { try { c = JSON.parse(localStorage.getItem("wxClip") || "null"); } catch (e) {} } if (!c) return toast("Nothing copied yet");
    if (c.section) return insertSection(c.html, S.sel);
    if (!S.sel) return insertElement(c.html);
    var n = build(c.html); isSection(S.sel) ? containerOf(S.sel).appendChild(n) : S.sel.after(n); afterInsert(n, "element");
  }
  function onKey3(e) {
    var k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (S.editing) {
      var collapsed = S.doc.getSelection().isCollapsed;
      if (mod && k === "d") { e.preventDefault(); tool("dup"); return true; }
      if (mod && k === "c" && collapsed) { e.preventDefault(); copyEl(); return true; }
      return false;
    }
    if (mod && k === "c" && S.sel) { e.preventDefault(); copyEl(); return true; }
    if (mod && k === "v") { e.preventDefault(); pasteEl(); return true; }
    if (mod && k === "d" && S.sel) { e.preventDefault(); tool("dup"); return true; }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && S.sel) { e.preventDefault(); tool(e.key === "ArrowUp" ? "up" : "down"); return true; }
    if (e.key === "Backspace" && S.sel && !mod) { e.preventDefault(); tool("del"); return true; }
    if (e.key === "?" ) { showKeys(); return true; }
    return false;
  }
  function showKeys() {
    modal("<h2>Keyboard shortcuts</h2><div class='keys'>" + [["Ctrl+S", "Save"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+C / Ctrl+V", "Copy / paste element"], ["Ctrl+D", "Duplicate"], ["Del / Backspace", "Delete element"], ["Alt+↑ / Alt+↓", "Move up / down"], ["Esc", "Deselect / finish typing"], ["Enter / Shift+Enter", "Finish text / new line"], ["Right-click", "Element menu"], ["Drag ✥ or an image", "Move it"], ["Drag corner handle", "Resize (Shift = free)"], ["?", "This help"]].map(function (x) { return "<kbd>" + x[0] + "</kbd><span>" + x[1] + "</span>"; }).join("") + "</div>");
  }

  // ---- context menu (E8)
  function openCtx(x, y) { var m = $("#ctx"); m.hidden = false; m.style.left = Math.min(x, innerWidth - 240) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + "px"; }
  document.addEventListener("click", function (e) { if (!e.target.closest("#ctx")) $("#ctx").hidden = true; });
  $$("#ctx button").forEach(function (b) {
    b.onclick = function () {
      $("#ctx").hidden = true; var c = b.dataset.c;
      if (c === "copy") copyEl(); else if (c === "paste") pasteEl(); else if (c === "export") exportEl(); else if (c === "exportjson") exportJson(); else tool(c);
    };
  });

  // ---- quick styles (F1 wand)
  var WAND = [
    ["Card", "White box, padding, soft shadow", { "background-color": "#ffffff", "padding-top": "32px", "padding-right": "32px", "padding-bottom": "32px", "padding-left": "32px", "border-radius": "16px", "box-shadow": "0 10px 30px rgba(0,0,0,.12)" }],
    ["Rounded", "Rounded corners", { "border-radius": "16px", "overflow": "hidden" }],
    ["Pill", "Fully round (buttons, tags)", { "border-radius": "999px" }],
    ["Navy block", "Dark background, white text", { "background-color": "#0a0f1e", "color": "#ffffff" }],
    ["Beige block", "Warm light background", { "background-color": "#fcf2e8" }],
    ["Centred", "Centre text and block", { "text-align": "center", "margin-left": "auto", "margin-right": "auto" }],
    ["Small label", "Uppercase, spaced, small", { "text-transform": "uppercase", "letter-spacing": "0.14em", "font-size": "12px", "font-weight": "600" }],
    ["Big heading", "Large, tight headline", { "font-size": "clamp(40px,6vw,80px)", "line-height": "1.02", "letter-spacing": "-0.03em" }],
    ["Soft shadow", "Subtle elevation", { "box-shadow": "0 2px 8px rgba(0,0,0,.08)" }],
    ["Outline", "Thin border", { "border-width": "1px", "border-style": "solid", "border-color": "#e5e5e5" }],
    ["Lift on hover", "Moves up on hover", "hover"],
    ["Clear styles", "Remove builder styles here", "clear"]
  ];
  function wandModal() {
    if (!S.sel) return;
    modal("<h2>Quick styles <small style='color:#6b7385;font-weight:400'>for " + esc(label(S.sel)) + " · " + DEVNAME[S.dev] + "</small></h2><div class='wand-grid'>" + WAND.map(function (w, i) { return "<button data-i='" + i + "'><b>" + w[0] + "</b><small>" + w[1] + "</small></button>"; }).join("") + "</div>");
    $$(".wand-grid button").forEach(function (b) {
      b.onclick = function () {
        var w = WAND[+b.dataset.i], el = S.sel, k = keyFor(el, true); closeModal();
        if (w[2] === "clear") { delete S.styles[k]; renderCSS(); pushHist(); renderStyle(); return toast("Styles cleared"); }
        if (w[2] === "hover") { setStyleQuiet(el, "transition", "all .3s ease"); var st = S.state; S.state = "h"; setStyleQuiet(el, "translate", "0 -6px"); setStyleQuiet(el, "box-shadow", "0 18px 40px rgba(0,0,0,.15)"); S.state = st; pushHist(); renderStyle(); return toast("Hover lift applied"); }
        Object.keys(w[2]).forEach(function (p) { setStyleQuiet(el, p, w[2][p]); }); pushHist(); renderStyle(); toast(w[0] + " applied");
      };
    });
  }

  // ---- my blocks: save / import / export (D20)
  function renderMine() {
    api("blocks_list").then(function (r) {
      if (!r.ok) return; var box = $("#lib-mine");
      if (!r.blocks.length) { box.innerHTML = "<p class='hint'>Save any section or element with 💾 in the toolbar.</p>"; return; }
      var cats = {}; r.blocks.forEach(function (b) { (cats[b.cat || "Custom"] = cats[b.cat || "Custom"] || []).push(b); });
      box.innerHTML = Object.keys(cats).sort().map(function (c) { return '<div class="lib-cat">' + esc(c) + "</div>" + cats[c].map(function (b) { return '<button draggable="true" data-cat="' + esc(b.cat || "Custom") + '" data-tags="' + esc((b.tags || []).join(" ")) + '" data-id="' + b.id + '"' + (b.global ? ' title="Global section: stays in sync on every page"' : "") + "><span>" + (b.global ? "🔗" : b.kind === "section" ? "▤" : "✚") + "</span>" + esc(b.name) + (b.global ? ' <small style="color:#b8924c">global</small>' : "") + '<i class="del" data-del="' + b.id + '" title="Delete">✕ delete</i></button>'; }).join(""); }).join("");
      $$("button", box).forEach(function (btn) {
        var b = r.blocks.find(function (x) { return x.id === btn.dataset.id; });
        btn.onclick = function (e) {
          if (e.target.dataset.del) { e.stopPropagation(); if (confirm("Delete block \"" + b.name + "\"?")) api("blocks_delete", { id: b.id }).then(function (x) { if (!x.ok && x.used) { if (confirm(x.error + ". Delete anyway? The copies on those pages stay, but stop syncing.")) return api("blocks_delete", { id: b.id, force: true }).then(renderMine); return; } renderMine(); }); return; }
          var h = blockHtml(b); b.kind === "section" ? insertSection(h) : insertElement(h);
        };
        btn.ondragstart = function (e) { S.drag = { kind: b.kind, html: blockHtml(b) }; e.dataTransfer.setData("text/plain", "wx-block"); };
        btn.ondragend = function () { S.drag = null; hideDrop(); };
      });
      if (window.__wx17mine) window.__wx17mine(r.blocks);
    });
  }
  function blockHtml(b) { return b.global ? b.html.trim().replace(/^<([a-z][a-z0-9-]*)/i, '<$1 data-wx-global="' + b.id + '"') : b.html; }
  var BLOCK_CATS = ["Hero", "Services", "Features", "Projects", "Testimonials", "CTA", "FAQ", "Contact", "Content", "Process", "Stats", "Pricing", "Team", "Gallery", "Footer", "Custom"];
  function saveBlock() {
    if (!S.sel) return; var el = S.sel, sec = isSection(el);
    modal("<h2>Save to section library</h2><label class='fld'>Name<input id='sb-n' value='" + esc((el.getAttribute("data-wx-label") || label(el)).slice(0, 60)) + "'></label>" +
      "<label class='fld'>Category<select id='sb-c'>" + BLOCK_CATS.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></label>" +
      "<label class='fld'>Tags <small>(comma separated, optional)</small><input id='sb-t' placeholder='dark, lahore, cta'></label>" +
      "<label style='display:flex;gap:8px;align-items:flex-start;margin:10px 0'><input type='checkbox' id='sb-g' style='margin-top:3px'><span><b>Global section</b><br><small class='hint'>Place it on many pages and update them all at once from the library. This section becomes the first linked copy.</small></span></label>" +
      "<div class='row' style='margin-top:12px'><button class='btn btn-pri' id='sb-go'>Save to library</button></div>");
    $("#sb-c").value = sec ? "Content" : "Custom";
    $("#sb-go").onclick = function () {
      var name = $("#sb-n").value.trim(); if (!name) return; var g = $("#sb-g").checked, raw = packStyles(el) + cleanOuter(el);
      api("blocks_save", { name: name, cat: $("#sb-c").value, tags: $("#sb-t").value, global: g, kind: sec ? "section" : "element", html: g ? WXCSS.globalize(raw) : raw }).then(function (r) {
        if (!r.ok) return toast(r.error, true); closeModal();
        if (g) { var b = r.blocks[r.blocks.length - 1]; el.setAttribute("data-wx-global", b.id); changed(); if (S.sel === el) renderContent(); }
        renderMine(); toast(g ? "Saved as a global section ✓ (save the page to link it)" : "Saved to the library ✓");
      });
    };
  }
  function download(name, text, type) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/html" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportEl() { if (!S.sel) return; download((S.sel.getAttribute("data-wx-label") || S.sel.classList[0] || "section").replace(/[^\w-]+/g, "-") + ".html", packStyles(S.sel) + cleanOuter(S.sel)); }
  // ---- Phase 5: v26 templates gallery, JSON export, safer multi-section import with preview
  var CSS_LINKS = '<link rel="stylesheet" href="/assets/site-p21.css"><link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css"><style>html,body{margin:0;overflow:hidden;pointer-events:none}.t6-hero{min-height:720px}</style>';
  function thumb(html, h) {
    var doc = "<!doctype html><html><head><meta charset='utf-8'>" + CSS_LINKS + "</head><body><main>" + html + "</main></body></html>";
    return "<div style='position:relative;width:100%;height:" + (h || 190) + "px;overflow:hidden;border-radius:8px;background:#f4efe7'><iframe loading='lazy' tabindex='-1' aria-hidden='true' srcdoc=\"" + doc.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + "\" style='position:absolute;top:0;left:0;width:1280px;height:" + Math.round((h || 190) * 4) + "px;border:0;transform:scale(.25);transform-origin:0 0'></iframe></div>";
  }
  function sanitize(html) {
    var t = document.createElement("template"); t.innerHTML = html; var removed = 0;
    t.content.querySelectorAll("script,object,embed,base,meta,link,iframe[srcdoc],style[data-danger]").forEach(function (n) { n.remove(); removed++; });
    t.content.querySelectorAll("*").forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value))) { n.removeAttribute(a.name); removed++; }
      });
    });
    var main = t.content.querySelector("main"); return { html: (main ? main.innerHTML : t.innerHTML).trim(), removed: removed };
  }
  function guessCat(html) { return /<h1[\s>]/i.test(html) || /hero/i.test(html.slice(0, 300)) ? "Hero" : /<details/i.test(html) ? "FAQ" : /<form/i.test(html) ? "Contact" : "Custom"; }
  function exportJson() {
    if (!S.sel) return; var el = S.sel, html = packStyles(el) + cleanOuter(el), name = (el.getAttribute("data-wx-label") || label(el) || "section").slice(0, 60);
    download(name.replace(/[^\w-]+/g, "-").toLowerCase() + ".json", JSON.stringify({ woodexLibrary: 1, exported: new Date().toISOString(), blocks: [{ name: name, kind: isSection(el) ? "section" : "element", cat: guessCat(html), tags: [], html: html }] }, null, 1), "application/json");
    toast("Exported as JSON ✓ — import it in the builder or Admin → Section library");
  }
  window.__wx5 = { exportJson: exportJson };
  function wide(mb, w) { [mb, mb.parentElement].forEach(function (n) { if (n && n.id !== "modal") { n.style.width = w; n.style.maxWidth = w ? "none" : ""; n.style.boxSizing = w ? "border-box" : ""; } }); }
  new MutationObserver(function () { if ($("#modal").hidden) wide($("#modal-body"), ""); }).observe($("#modal"), { attributes: true, attributeFilter: ["hidden"] });
  function templatesGallery() {
    var T = window.WX_TEMPLATES || [], cats = ["All"].concat(T.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; })), cur = "All", q = "";
    modal("<h2 style='margin-bottom:6px'>Templates · v26 + UI kit <small class='hint'>(" + T.length + ")</small></h2><div style='display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px'><input type='search' id='tg-q' placeholder='Search…' style='max-width:200px'>" +
      cats.map(function (c) { return "<button class='btn btn-sm' data-tc='" + esc(c) + "'>" + esc(c) + "</button>"; }).join("") + "</div><div id='tg-grid' style='display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;max-height:68vh;overflow:auto;padding-right:6px'></div>");
    var mb = $("#modal-body"); wide(mb, "min(1100px,94vw)");
    var draw = function () {
      $$("[data-tc]").forEach(function (b) { b.classList.toggle("btn-pri", b.dataset.tc === cur); });
      $("#tg-grid").innerHTML = T.filter(function (t) { return (cur === "All" || t.cat === cur) && (!q || (t.name + " " + t.cat).toLowerCase().indexOf(q) >= 0); }).map(function (t) {
        return "<button data-tid='" + t.id + "' style='text-align:left;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:8px;cursor:pointer'>" + thumb(t.html) + "<div style='display:flex;justify-content:space-between;gap:6px;margin-top:8px;font:600 13px system-ui'><span>" + esc(t.name) + "</span><small class='hint'>" + esc(t.cat) + "</small></div></button>";
      }).join("") || "<p class='hint'>No templates match.</p>";
      $$("[data-tid]").forEach(function (b) { b.onclick = function () { var t = T.find(function (x) { return x.id === b.dataset.tid; }); closeModal(); wide(mb, ""); insertSection(t.html, S.sel); toast("“" + t.name + "” added — click any text to edit"); }; });
    };
    $$("[data-tc]").forEach(function (b) { b.onclick = function () { cur = b.dataset.tc; draw(); }; });
    $("#tg-q").oninput = function () { q = this.value.trim().toLowerCase(); draw(); };
    draw();
  }
  window.__wx5.templates = templatesGallery;
  // P17 C1/C2 hooks for builder-p17.js
  Object.assign(window.__wx5, { S: S, api: api, modal: modal, closeModal: closeModal, toast: toast, esc: esc, thumb: thumb, sanitize: sanitize, guessCat: guessCat, wide: wide, insertSection: insertSection, insertElement: insertElement, renderMine: renderMine, cats: BLOCK_CATS, download: download, setImg: setImg, packStyles: packStyles, cleanOuter: cleanOuter, changed: changed, afterInsert: afterInsert, build: build, media: function (cb) { mediaPicker(cb); } });
  var tgBtn = document.createElement("button"); tgBtn.className = "btn btn-pri"; tgBtn.style.cssText = "width:100%;margin:0 0 10px"; tgBtn.textContent = "✨ Browse " + ((window.WX_TEMPLATES || []).length || 50) + " templates (v26 + UI kit)";
  tgBtn.onclick = function () { if (S.doc) templatesGallery(); }; var ls = $("#lib-sections"); if (ls) ls.parentNode.insertBefore(tgBtn, ls.previousElementSibling || ls);

  $("#import-sec").onclick = function () {
    modal("<h2>Import sections</h2><p class='hint'>Choose a Woodex <b>.json</b> export (from the builder or Admin → Section library) or an <b>.html</b> file — or paste below. Scripts and unsafe code are removed automatically, and you’ll see a preview first.</p><input type='file' id='imp-f' accept='.json,.html,.htm,.txt'><textarea id='imp-t' rows='7' placeholder='Paste JSON or HTML…' style='width:100%;margin-top:10px;font:12px ui-monospace,monospace;border:1px solid #d0d5dd;border-radius:8px;padding:8px'></textarea><div class='row' style='margin-top:10px'><button class='btn btn-pri' id='imp-chk'>Check &amp; preview</button></div><div id='imp-prev'></div>");
    var mb = $("#modal-body"); wide(mb, "min(900px,94vw)");
    $("#imp-f").onchange = function () { var f = this.files[0]; if (f) f.text().then(function (t) { $("#imp-t").value = t; $("#imp-chk").click(); }); };
    $("#imp-chk").onclick = function () {
      var txt = $("#imp-t").value.trim(), list = [], removed = 0; if (!txt) return;
      if (/^[\[{]/.test(txt)) {
        var j; try { j = JSON.parse(txt); } catch (e) { return toast("That JSON file could not be read", true); }
        (Array.isArray(j) ? j : j.blocks || j.sections || []).forEach(function (b) { if (b && b.html) { var c = sanitize(String(b.html)); removed += c.removed; if (c.html) list.push({ name: String(b.name || "Imported section").slice(0, 60), cat: b.cat || guessCat(c.html), kind: b.kind || "section", tags: b.tags || [], html: c.html }); } });
      } else {
        var c = sanitize(txt), t = document.createElement("template"); removed = c.removed; t.innerHTML = c.html;
        var kids = Array.prototype.filter.call(t.content.children, function (n) { return !/^(STYLE)$/.test(n.tagName); }), styles = Array.prototype.filter.call(t.content.children, function (n) { return n.tagName === "STYLE"; }).map(function (n) { return n.outerHTML; }).join("");
        if (kids.length > 1 && kids.every(function (n) { return /^(SECTION|DIV|HEADER|ARTICLE|ASIDE|FOOTER)$/.test(n.tagName); })) kids.forEach(function (n, i) { list.push({ name: "Imported section " + (i + 1), cat: guessCat(n.outerHTML), kind: "section", html: (i === 0 ? styles : "") + n.outerHTML }); });
        else if (c.html) list.push({ name: "Imported section", cat: guessCat(c.html), kind: "section", html: c.html });
      }
      if (!list.length) return toast("No sections found", true);
      $("#imp-prev").innerHTML = "<p class='hint' style='margin-top:14px'>" + list.length + " section(s) found" + (removed ? " · <b>" + removed + " unsafe item(s) removed</b>" : "") + ". Untick any you don’t want.</p><div style='display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-height:46vh;overflow:auto'>" +
        list.map(function (b, i) { return "<label style='display:block;border:1px solid #e4e7ec;border-radius:10px;padding:8px;cursor:pointer'>" + thumb(b.html, 150) + "<span style='display:flex;gap:6px;align-items:center;margin-top:6px;font:600 13px system-ui'><input type='checkbox' data-ii='" + i + "' checked>" + esc(b.name) + " <small class='hint'>" + esc(b.cat) + "</small></span></label>"; }).join("") +
        "</div><div class='row' style='margin-top:12px;gap:8px'><button class='btn btn-pri' id='imp-go'>Insert into page</button><button class='btn' id='imp-lib'>Save to My sections</button></div>";
      var picked = function () { return list.filter(function (b, i) { var c = $("[data-ii='" + i + "']"); return c && c.checked; }); };
      $("#imp-go").onclick = function () { var p = picked(), after = S.sel; if (!p.length) return; closeModal(); wide(mb, ""); p.forEach(function (b) { insertSection(b.html, after); }); toast(p.length + " section(s) inserted ✓"); };
      $("#imp-lib").onclick = function () { var p = picked(); if (!p.length) return; api("blocks_import", { blocks: p }).then(function (r) { if (!r.ok) return toast(r.error, true); closeModal(); wide(mb, ""); renderMine(); toast(p.length + " saved to My sections ✓"); }); };
    };
  };

  // ---- search in lists (D9)
  $$(".lib-q[data-q]").forEach(function (q) { q.oninput = function () { var v = q.value.toLowerCase(); $$("#" + q.dataset.q + " button" + (q.dataset.q === "lib-sections" ? ", #lib-v26 button" : "")).forEach(function (b) { b.hidden = b.textContent.toLowerCase().indexOf(v) < 0; }); }; });
  $("#layers-q").oninput = function () {
    var q = this.value.trim().toLowerCase(); if (!q) return renderLayers(true);
    var box = $("#layers"); box.innerHTML = "";
    $$("header *, main *, footer *", S.doc).filter(function (n) { return !SKIP.test(n.tagName) && ((isTextLeaf(n) && n.textContent.toLowerCase().indexOf(q) >= 0) || (typeof n.className === "string" && n.className.toLowerCase().indexOf(q) >= 0) || (n.id && n.id.toLowerCase().indexOf(q) >= 0)); }).slice(0, 120).forEach(function (n) {
      var row = document.createElement("div"); row.className = "ly" + (n === S.sel ? " is-sel" : "");
      var txt = isTextLeaf(n) ? n.textContent.trim().slice(0, 50) : "";
      row.innerHTML = '<span class="tw"></span><span class="tg">' + esc(n.tagName.toLowerCase() + (n.classList[0] ? "." + n.classList[0] : "")) + '</span><span class="tx">' + esc(txt) + "</span>";
      row.onclick = function () { select(n); n.scrollIntoView({ block: "center" }); }; row.onmouseenter = function () { S.hover = n; };
      box.appendChild(row);
    });
    if (!box.children.length) box.innerHTML = "<p class='hint'>No matches.</p>";
  };

  // ---- code editor with syntax highlighting (D6) + whole-page mode
  S.codeMode = "el";
  function cm() {
    if (!S.cm && window.CodeMirror) {
      var ta = $("#code-ta");
      S.cm = CodeMirror.fromTextArea(ta, { mode: "htmlmixed", theme: "material-darker", lineNumbers: true, lineWrapping: true, autoCloseTags: true, matchTags: { bothTags: true }, tabSize: 2 });
    }
    return S.cm;
  }
  function setCode(v) { var c = cm(); if (c) { c.setValue(v); setTimeout(function () { c.refresh(); c.focus(); }, 30); } else $("#code-ta").value = v; }
  function getCode() { return S.cm ? S.cm.getValue() : $("#code-ta").value; }
  function prettify(h) { return h.replace(/>\s*</g, ">\n<").split("\n").reduce(function (a, line) { var d = a.d; if (/^<\//.test(line)) d--; a.out.push("  ".repeat(Math.max(0, d)) + line); if (/^<[a-z][^>]*[^/]>$/i.test(line) && !/^<(br|img|hr|input|meta|link|source|wbr)\b/i.test(line) && !/<\/[a-z]+>$/i.test(line)) d++; a.d = d; return a; }, { d: 0, out: [] }).out.join("\n"); }
  openCode = function () {
    if (!S.sel) return toast("Select an element first");
    S.codeMode = "el"; $("#code-title").textContent = "HTML of " + label(S.sel); $("#code").hidden = false; setCode(prettify(cleanOuter(S.sel)));
  };
  function openPageCode() { S.codeMode = "page"; $("#code-title").textContent = "Whole page HTML: " + S.path + " (scripts allowed here)"; $("#code").hidden = false; setCode(serialise()); }
  $("#code-apply").onclick = function () {
    var v = getCode();
    if (S.codeMode === "page") {
      if (!/<html/i.test(v) || !/<\/html>/i.test(v)) return toast("The page must contain <html>…</html>", true);
      var keep = S.savedSnap, keepSeo = S.seoSaved; S.afterReady = function () { S.savedSnap = keep; S.seoSaved = keepSeo; updateDirty(); toast("Page code applied. Click Save to publish."); };
      $("#code").hidden = true; mountHTML(v); return;
    }
    if (!S.sel) return; var t = S.doc.createElement("template"); t.innerHTML = v.trim();
    var n = t.content.firstElementChild; if (!n) return toast("Invalid HTML", true);
    if (t.content.querySelector("script,object,embed,base,meta,link[rel=import]")) return toast("Scripts and embeds (<script>, <object>, <embed>) are not allowed here", true);
    var badFr = Array.prototype.filter.call(t.content.querySelectorAll("iframe"), function (f) { return !SAFE_IFRAME.test(f.getAttribute("src") || ""); });
    if (badFr.length && !confirm("This HTML contains an iframe from an unknown website. It will appear on the live site. Continue?")) return;
    var removed = sanitize(t.content); if (removed) toast(removed + " unsafe attribute(s) removed (onclick/javascript:)");
    finishEdit(); S.sel.replaceWith(t.content); renderCSS(); changed(); select(n); toast("HTML applied");
  };

  // ---- ZIP export (D8) — tiny store-only zip writer
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/zip" });
  }
  function zipPage() {
    var html = serialise(), d = new DOMParser().parseFromString(html, "text/html"), urls = {};
    var addU = function (u) { if (!u) return; u = u.trim().replace(/^url\(["']?|["']?\)$/g, "").split(/[?#]/)[0]; if (/^\/(?!\/)/.test(u) && !/^\/api\//.test(u)) urls[u] = 1; };
    $$("link[href]", d).forEach(function (n) { if (/stylesheet|icon|preload|manifest/.test(n.rel)) addU(n.getAttribute("href")); });
    $$("script[src],img[src],video[src],source[src],video[poster]", d).forEach(function (n) { addU(n.getAttribute("src") || n.getAttribute("poster")); });
    $$("[srcset]", d).forEach(function (n) { n.getAttribute("srcset").split(",").forEach(function (s) { addU(s.trim().split(/\s+/)[0]); }); });
    (html.match(/url\((["']?)\/[^)"']+\1\)/g) || []).forEach(addU);
    toast("Building ZIP…");
    var files = [{ name: S.path, data: new TextEncoder().encode(html) }], list = Object.keys(urls), done = {};
    function grab(i) {
      if (i >= list.length) { var nm = (S.path.replace(/\/?index\.html$/, "").replace(/\//g, "-") || "home") + "-woodex.zip", a = document.createElement("a"); a.href = URL.createObjectURL(makeZip(files)); a.download = nm; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); toast("ZIP ready: " + files.length + " files"); return; }
      var u = list[i]; if (done[u]) return grab(i + 1); done[u] = 1;
      fetch(u).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (buf) {
        if (buf) { var data = new Uint8Array(buf); files.push({ name: u.slice(1), data: data });
          if (/\.css$/.test(u)) { var css = new TextDecoder().decode(data); (css.match(/url\((["']?)[^)"']+\1\)/g) || []).forEach(function (m) { var p = m.replace(/^url\(["']?|["']?\)$/g, "").split(/[?#]/)[0]; if (/^(data:|https?:)/.test(p)) return; var abs = new URL(p, location.origin + u).pathname; if (!urls[abs]) { urls[abs] = 1; list.push(abs); } }); }
        }
        grab(i + 1);
      }).catch(function () { grab(i + 1); });
    }
    grab(0);
  }

  // ---- new page / duplicate page (D5)
  function slugify(t) { return t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60); }
  function newPageModal(dup) {
    var folders = {}; S.pages.forEach(function (p) { var parts = p.path.split("/"); if (parts.length > 2) folders[parts.slice(0, -2).join("/")] = 1; });
    var cur = S.pages.find(function (p) { return p.path === S.path; });
    modal("<h2>" + (dup ? "Duplicate this page" : "New page") + "</h2>" +
      "<label>Page title<input type='text' id='np-title' value='" + esc(dup && cur ? "Copy of " + cur.title.split("|")[0].trim() : "") + "' placeholder='e.g. Office Fit-Out Karachi'></label>" +
      "<label>Address (URL)<div style='display:flex;gap:6px;align-items:center;margin-top:4px'><select id='np-folder' style='height:36px;border:1px solid #d0d5dd;border-radius:7px'><option value=''>/ (top level)</option>" + Object.keys(folders).sort().map(function (f) { return "<option value='" + esc(f) + "'>/" + esc(f) + "/</option>"; }).join("") + "</select><input type='text' id='np-slug' style='margin:0' placeholder='office-fit-out-karachi'><span>/</span></div></label>" +
      "<label>Start from<select id='np-tpl' style='display:block;width:100%;height:36px;margin-top:4px;border:1px solid #d0d5dd;border-radius:7px'><option value='blank'>Blank page (site header + footer)</option>" + S.pages.map(function (p) { return "<option value='" + esc(p.path) + "'" + (dup && p.path === S.path ? " selected" : "") + ">Copy of " + esc(p.url + " · " + p.title.slice(0, 50)) + "</option>"; }).join("") + "</select></label>" +
      "<p class='hint'>The new page is created with its own backups. Remember to link to it from the menu or another page. Pages can't be deleted from the builder (safer for SEO).</p><button class='btn btn-pri' id='np-go'>Create page</button>");
    var auto = true; $("#np-title").oninput = function () { if (auto) $("#np-slug").value = slugify(this.value); }; $("#np-slug").oninput = function () { auto = false; };
    if (dup) $("#np-slug").value = slugify($("#np-title").value);
    $("#np-go").onclick = function () {
      var title = $("#np-title").value.trim(), slug = slugify($("#np-slug").value || title), folder = $("#np-folder").value, tpl = $("#np-tpl").value;
      if (!title || !slug) return toast("Enter a title", true);
      var url = "/" + (folder ? folder + "/" : "") + slug + "/";
      if (!confirm("Unsaved changes on the current page will be kept as a draft. Create " + url + " ?")) return;
      api("load", { path: tpl === "blank" ? "index.html" : tpl }).then(function (r) {
        if (!r.ok) return toast(r.error, true);
        var d = new DOMParser().parseFromString(r.html, "text/html");
        d.title = title; var set = function (sel, attr, v) { var n = d.querySelector(sel); if (n) n.setAttribute(attr, v); };
        set('meta[property="og:title"]', "content", title); set('link[rel="canonical"]', "href", "https://woodex.com.pk" + url); set('meta[property="og:url"]', "content", "https://woodex.com.pk" + url);
        if (tpl === "blank") {
          set('meta[name="description"]', "content", "");
          $$('script[type="application/ld+json"]', d).forEach(function (s) { s.remove(); });
          var main = d.querySelector("main"); main.innerHTML = '<section class="wx-block wx-bg-white" data-wx-label="Intro"><div class="wrap"><p class="wx-kicker">New page</p><h1>' + esc(title) + '</h1><p class="wx-lead">Start editing: click this text, or add sections from the left panel.</p></div></section>';
          var ds = d.getElementById("wx-custom-css"), dd = d.getElementById("wx-style-data"); if (ds) ds.remove(); if (dd) dd.remove();
        }
        var dt = /^<!doctype[^>]*>/i.exec(r.html.trim());
        api("page_new", { folder: folder, slug: slug, html: (dt ? dt[0] : "<!DOCTYPE html>") + "\n" + d.documentElement.outerHTML + "\n" }).then(function (r2) {
          if (!r2.ok) return toast(r2.error, true);
          closeModal(); toast("Page created: " + url);
          api("pages").then(function (r3) { if (!r3.ok) return; S.pages = r3.pages; $("#page-select").innerHTML = r3.pages.map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.url + "  ·  " + p.title) + "</option>"; }).join(""); $("#page-select").value = r2.path; loadPage(r2.path); });
        });
      });
    };
  }
  window.__wx3 = { menu: function (a) {
    if (a === "newpage") newPageModal(false); if (a === "duppage") newPageModal(true);
    if (a === "export") download(S.path.replace(/\//g, "-"), serialise());
    if (a === "zip") zipPage(); if (a === "pagecode") openPageCode(); if (a === "keys") showKeys();
  } };


  // =================================================================== PHASE 4 — icons, components, media, fonts, theme, animation, SEO check, pages
  // ---- builder UI icons (E5)
  function uiIcon(n) { var s = (window.WX_UI_ICONS || {})[n]; return s ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + s + "</svg>" : ""; }
  function fillUi(root) { $$("[data-ic]", root || document).forEach(function (i) { if (!i.firstChild) i.innerHTML = uiIcon(i.dataset.ic); }); }
  fillUi();

  // ---- left panel toggle (D3)
  $("#panel-btn").onclick = function () { $("#app").classList.toggle("no-left"); this.classList.toggle("is-on", $("#app").classList.contains("no-left")); };
  $$(".rl").forEach(function (b) { b.addEventListener("click", function () { $("#app").classList.remove("no-left"); $("#panel-btn").classList.remove("is-on"); if (b.dataset.left === "pages") renderPages(); if (b.dataset.left === "seo") { runAudit(); seoAnalyse(); } }); });
  function seoAnalyse() {
    if (!S.doc || !window.WXSEO) return; var k = "wxSeoKw:" + S.path, kw = $("#seo-kw");
    if (kw.dataset.p !== S.path) { kw.dataset.p = S.path; kw.value = localStorage.getItem(k) || ""; }
    var p = S.pages.find(function (x) { return x.path === S.path; }) || {}, r = WXSEO.analyze(serialise(), { kw: kw.value, url: p.url || "/" });
    WXSEO.render($("#seo-an"), r, { url: p.url || "/", noPreview: true }); $("#seo-mgr").href = "/admin/#/seo/" + encodeURIComponent(S.path);
  }
  $("#seo-kw").addEventListener("input", function () { try { localStorage.setItem("wxSeoKw:" + S.path, this.value); } catch (e) {} seoAnalyse(); });
  $("#seo-an-run").onclick = seoAnalyse;
  (function () { var t; ["#seo-title", "#seo-desc"].forEach(function (s) { $(s).addEventListener("input", function () { clearTimeout(t); t = setTimeout(seoAnalyse, 400); }); }); })();
  // });

  // ---- pages tree (D4)
  function renderPages() {
    var q = ($("#pages-q").value || "").toLowerCase(), tree = {}, box = $("#pages-tree");
    S.pages.filter(function (p) { return !q || (p.url + " " + p.title).toLowerCase().indexOf(q) >= 0; }).forEach(function (p) { var f = p.path.split("/").length > 2 ? p.path.split("/")[0] : "(top level)"; (tree[f] = tree[f] || []).push(p); });
    box.innerHTML = Object.keys(tree).sort(function (a, b) { return a === "(top level)" ? -1 : b === "(top level)" ? 1 : a.localeCompare(b); }).map(function (f) {
      return '<details' + (q || f === "(top level)" || tree[f].some(function (p) { return p.path === S.path; }) ? " open" : "") + '><summary class="ly"><span class="tw"><i data-ic="folder"></i></span><span class="tg">' + esc(f) + '</span><span class="tx">' + tree[f].length + "</span></summary><div class='ly-kids'>" +
        tree[f].map(function (p) { return '<div class="ly' + (p.path === S.path ? " is-sel" : "") + '" data-path="' + esc(p.path) + '" title="' + esc(p.title) + '"><span class="tw"><i data-ic="file-text"></i></span><span class="tx" style="color:inherit">' + esc(p.url) + "</span></div>"; }).join("") + "</div></details>";
    }).join("") || "<p class='hint'>No pages match.</p>";
    fillUi(box);
    $$("[data-path]", box).forEach(function (r) { r.onclick = function () { if (r.dataset.path === S.path) return; $("#page-select").value = r.dataset.path; $("#page-select").onchange.call($("#page-select")); setTimeout(renderPages, 50); }; });
  }
  $("#pages-q").oninput = renderPages;
  $("#pages-new").onclick = function () { window.__wx3.menu("newpage"); };
  $$("[data-ic]", $("#pages-tree")).forEach(function () {});

  // ---- element library with categories (D10/D15)
  (function () {
    var box = $("#lib-elements"); libButtons(window.WX_ELEMENTS || [], box, "element");
    var seen = {};
    $$("button", box).forEach(function (btn) {
      var b = WX_ELEMENTS.find(function (x) { return x.id === btn.dataset.id; }), cat = b.cat || "Basic";
      if (!seen[cat]) { seen[cat] = 1; var h = document.createElement("div"); h.className = "lib-cat"; h.textContent = cat; box.insertBefore(h, btn); }
    });
  })();

  // ---- SVG icons in pages (D17)
  S.icons = null;
  function loadIcons() { if (S.iconsP) return S.iconsP; S.iconsP = fetch("vendor/icons.json").then(function (r) { return r.json(); }).then(function (j) { S.icons = j; return j; }); return S.iconsP; }
  function iconSvg(n) { var i = S.icons && S.icons.icons[n]; return i ? '<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + i + "</svg>" : ""; }
  function fillIcons(root) {
    var els = [root].concat($$("[data-wx-icon]", root)).filter(function (n) { return n.hasAttribute && n.hasAttribute("data-wx-icon") && !n.querySelector(":scope > svg.wx-icon"); });
    if (!els.length) return;
    var go = function () { els.forEach(function (n) { n.insertAdjacentHTML("afterbegin", iconSvg(n.getAttribute("data-wx-icon"))); }); };
    S.icons ? go() : loadIcons().then(function () { go(); pushHist(); });
  }
  function iconPicker(cb) {
    loadIcons().then(function (j) {
      modal("<h2>Choose an icon <small style='font-weight:400;color:#6b7385'>(" + Object.keys(j.icons).length + " free Lucide icons)</small></h2><input type='search' class='lib-q' id='ic-q' placeholder='Search, e.g. home, phone, ruler, sofa…' autofocus><div class='ic-grid' id='ic-grid'></div>");
      var names = Object.keys(j.icons).sort();
      var draw = function () {
        var q = $("#ic-q").value.trim().toLowerCase();
        var list = names.filter(function (n) { return !q || n.indexOf(q) >= 0 || (j.tags[n] || []).some(function (t) { return t.indexOf(q) >= 0; }); }).slice(0, 240);
        $("#ic-grid").innerHTML = list.map(function (n) { return "<button data-n='" + n + "' title='" + n + "'><svg viewBox='0 0 24 24'>" + j.icons[n] + "</svg>" + n + "</button>"; }).join("") || "<p class='hint'>No icons found.</p>";
        $$("#ic-grid button").forEach(function (b) { b.onclick = function () { closeModal(); cb(b.dataset.n); }; });
      };
      $("#ic-q").oninput = draw; draw();
    });
  }
  function setIcon(host, n) { host.setAttribute("data-wx-icon", n); var old = host.querySelector(":scope > svg.wx-icon"); if (old) old.remove(); host.insertAdjacentHTML("afterbegin", iconSvg(n)); changed(); if (S.sel) renderContent(); }

  // ---- build hook: icons + unique tab names
  var build0 = build;
  build = function (html) {
    var n = build0(html); if (!n) return n;
    $$(".wx-tabs", n).concat(n.classList && n.classList.contains("wx-tabs") ? [n] : []).forEach(function (t) {
      var uid = "t" + Math.random().toString(36).slice(2, 7);
      $$("input[type=radio]", t).forEach(function (r, i) { r.name = uid; r.id = uid + "-" + (i + 1); var l = t.querySelectorAll("label")[i]; if (l) l.htmlFor = r.id; });
    });
    fillIcons(n); return n;
  };

  // ---- content tab extras: icon / counter / countdown / bars
  var renderContent0 = renderContent;
  renderContent = function () {
    renderContent0(); var el = S.sel, pane = $("#pane-content"), extra = "";
    var ih = el.closest("[data-wx-icon]");
    if (ih) extra += group("Icon", '<div style="display:flex;gap:10px;align-items:center"><span style="width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px">' + (ih.querySelector("svg") ? ih.querySelector("svg").outerHTML.replace('class="wx-icon"', 'class="uic"') : "") + '</span><code>' + esc(ih.getAttribute("data-wx-icon")) + '</code><button class="btn btn-sm" id="c-icon">Change icon</button></div>');
    var cnt = el.closest("[data-wx-count]");
    if (cnt) extra += group("Counter", f2("Count up to", '<input type="text" id="c-count" value="' + esc(cnt.getAttribute("data-wx-count")) + '">') + f2("Duration (ms)", '<input type="text" id="c-countd" value="' + esc(cnt.getAttribute("data-wx-duration") || "1600") + '">'));
    var cd = el.closest("[data-wx-countdown]");
    if (cd) extra += group("Countdown", f2("Ends at", '<input type="datetime-local" id="c-cd" value="' + esc((cd.getAttribute("data-wx-countdown") || "").slice(0, 16)) + '" style="width:100%;height:32px;border:1px solid var(--line2);border-radius:6px;padding:0 8px">', 1));
    var bar = el.closest(".wx-bars > div");
    if (bar) extra += group("Bar", f2("Height (%)", '<input type="text" id="c-bar" value="' + esc(parseInt(bar.querySelector("b").style.getPropertyValue("--v")) || 50) + '">'));
    var pr = el.closest(".wx-progress > div");
    if (pr) extra += group("Progress", f2("Percent", '<input type="text" id="c-prog" value="' + esc(parseInt(pr.querySelector("b").style.width) || 50) + '">'));
    if (!extra) return;
    pane.insertAdjacentHTML("afterbegin", extra);
    var on = function (id, ev, fn) { var n = $("#" + id, pane); if (n) n.addEventListener(ev, fn); };
    on("c-icon", "click", function () { iconPicker(function (n) { setIcon(ih, n); }); });
    on("c-count", "change", function () { var v = this.value.replace(/[^\d.]/g, ""); cnt.setAttribute("data-wx-count", v); cnt.textContent = v; changed(); });
    on("c-countd", "change", function () { cnt.setAttribute("data-wx-duration", parseInt(this.value) || 1600); changed(); });
    on("c-cd", "change", function () { cd.setAttribute("data-wx-countdown", this.value + ":00"); changed(); });
    on("c-bar", "change", function () { bar.querySelector("b").style.setProperty("--v", Math.max(0, Math.min(100, parseInt(this.value) || 0)) + "%"); changed(); });
    on("c-prog", "change", function () { var v = Math.max(0, Math.min(100, parseInt(this.value) || 0)); pr.querySelector("b").style.width = v + "%"; var em = pr.querySelector("em"); if (em) em.textContent = v + "%"; changed(); });
  };

  // ---- animation on scroll (D18) in Advanced tab
  var renderAdvanced0 = renderAdvanced;
  renderAdvanced = function () {
    renderAdvanced0(); var el = S.sel, pane = $("#pane-advanced"), a = el.getAttribute("data-wx-anim") || "";
    var opts = [["", "None"], ["fade-up", "Fade up"], ["fade-down", "Fade down"], ["fade", "Fade in"], ["slide-left", "Slide from right"], ["slide-right", "Slide from left"], ["zoom-in", "Zoom in"], ["zoom-out", "Zoom out"]];
    pane.insertAdjacentHTML("afterbegin", group("Animation on scroll", '<div class="g2">' + f2("Effect", '<select id="a-anim">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === a ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>", 1) +
      f2("Delay (ms)", '<input type="text" id="a-delay" value="' + esc(el.getAttribute("data-wx-delay") || "") + '" placeholder="0">') + f2("Duration (ms)", '<input type="text" id="a-dur" value="' + esc(el.getAttribute("data-wx-dur") || "") + '" placeholder="700">') + "</div>" +
      '<button class="btn btn-sm" id="a-anim-prev"' + (a ? "" : " disabled") + '>▶ Preview</button><p class="hint" style="margin:0">Plays once when the element scrolls into view. Turned off automatically for visitors who prefer reduced motion.</p>'));
    var setA = function (n, v) { v ? el.setAttribute(n, v) : el.removeAttribute(n); changed(); };
    $("#a-anim", pane).onchange = function () { setA("data-wx-anim", this.value); renderAdvanced(); if (this.value) previewAnim(el); };
    $("#a-delay", pane).onchange = function () { setA("data-wx-delay", String(parseInt(this.value) || "").replace("NaN", "")); };
    $("#a-dur", pane).onchange = function () { setA("data-wx-dur", String(parseInt(this.value) || "").replace("NaN", "")); };
    $("#a-anim-prev", pane).onclick = function () { previewAnim(el); };
  };
  function previewAnim(el) {
    var root = S.doc.documentElement; $$("[data-wx-anim]", S.doc).forEach(function (n) { if (n !== el) n.classList.add("wx-in"); });
    el.classList.remove("wx-in"); root.classList.add("wx-js"); el.style.transitionDelay = (el.getAttribute("data-wx-delay") || 0) + "ms"; el.style.transitionDuration = (el.getAttribute("data-wx-dur") || 700) + "ms";
    void el.offsetWidth; setTimeout(function () { el.classList.add("wx-in"); }, 30);
    setTimeout(function () { root.classList.remove("wx-js"); $$(".wx-in", S.doc).forEach(function (n) { n.classList.remove("wx-in"); }); el.style.transitionDelay = ""; el.style.transitionDuration = ""; if (!el.getAttribute("style")) el.removeAttribute("style"); }, 1400 + (+el.getAttribute("data-wx-delay") || 0) + (+el.getAttribute("data-wx-dur") || 700));
  }
  // runtime script added only when needed
  var serialise0 = serialise;
  serialise = function () {
    if (S.doc) {
      var need = !!S.doc.querySelector("[data-wx-anim],[data-wx-count],[data-wx-countdown]"), rt = S.doc.getElementById("wx-runtime");
      if (need && !rt) { rt = S.doc.createElement("script"); rt.id = "wx-runtime"; rt.setAttribute("src", "/assets/wx-runtime.js"); rt.defer = true; rt.setAttribute("type", "text/wx-off"); rt.setAttribute("data-wx-t", "__none"); S.doc.head.appendChild(rt); }
      if (!need && rt) rt.remove();
      $$(".wx-in", S.doc).forEach(function (n) { n.classList.remove("wx-in"); }); S.doc.documentElement.classList.remove("wx-js");
    }
    return serialise0();
  };

  // ---- full Google Fonts list (D14)
  (function () {
    (window.WX_GFONTS || []).forEach(function (f) { if (!GFONTS.hasOwnProperty(f[0])) GFONTS[f[0]] = f[2].length > 1 ? f[2].join(";") : ""; });
    $("#wx-fontlist").innerHTML = ["DM Sans", "Georgia", "system-ui"].concat((window.WX_GFONTS || []).map(function (f) { return f[0]; })).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
  })();
  var ctl0 = ctl;
  ctl = function (el, def) {
    if (def[2] !== "font") return ctl0(el, def);
    var v = getStyle(el, "font-family"), cs = S.doc.defaultView.getComputedStyle(el);
    return '<input type="text" data-p="font-family" list="wx-fontlist" value="' + esc(v) + '" placeholder="Default (' + esc(cs.fontFamily.split(",")[0].replace(/"/g, "")) + ') · type to search 1,900 fonts">';
  };

  // ---- theme: google fonts, heading sizes, palette (D19)
  TDEF["--wx-c1"] = "#d4af6a"; TDEF["--wx-c2"] = "#1f3a5f"; TDEF["--wx-c3"] = "#6b7a5a"; TDEF["--wx-c4"] = "#b85c38";
  TDEF["--wx-h1"] = "72px"; TDEF["--wx-h2"] = "48px"; TDEF["--wx-h3"] = "22px";
  function fontToTheme(name) {
    name = (name || "").trim(); if (!name || /^dm sans/i.test(name)) return "dm"; if (/^georgia|^serif/i.test(name)) return "serif"; if (/^system/i.test(name)) return "system";
    var f = (window.WX_GFONTS || []).find(function (x) { return x[0].toLowerCase() === name.toLowerCase(); }); return f ? "g:" + f[0] + ":" + (f[2].length > 1 ? f[2].join(";") : "") : null;
  }
  function themeToFont(v) { if (!v || v === "dm") return ""; if (v === "serif") return "Georgia"; if (v === "system") return "system-ui"; var m = /^g:([^:]+)/.exec(v); return m ? m[1] : ""; }
  function fontCss(v) { var m = /^g:([^:]+)/.exec(v || ""); return m ? '"' + m[1] + '",system-ui,sans-serif' : FONTS[v] || FONTS.dm; }
  fillTheme = function () {
    tIn().forEach(function (i) { var v = S.theme[i.dataset.var] != null ? S.theme[i.dataset.var] : TDEF[i.dataset.var];
      if (i.classList.contains("font-pick")) i.value = themeToFont(v); else i.value = i.dataset.unit ? parseFloat(v) : v; showOut(i); });
    $("#th-hs").checked = !!S.theme["--wx-h1"]; paletteList(); applyTheme();
  };
  readTheme = function () {
    var v = {}, useHs = $("#th-hs").checked;
    tIn().forEach(function (i) {
      if (i.dataset.opt && !useHs) return;
      if (i.classList.contains("font-pick")) { var f = fontToTheme(i.value); v[i.dataset.var] = f || "dm"; i.style.borderColor = f ? "" : "#dc2626"; return; }
      v[i.dataset.var] = i.value + (i.dataset.unit || "");
    });
    return v;
  };
  applyTheme = function () {
    if (!S.doc) return; var el = S.doc.getElementById("wx-theme-live"); if (!el) return; var v = readTheme(), css = "", imp = [];
    ["--wx-font", "--wx-font-head"].forEach(function (k) { var m = /^g:([^:]+):(.*)$/.exec(v[k] || ""); if (m) imp.push("family=" + m[1].replace(/ /g, "+") + (m[2] ? ":wght@" + m[2] : "")); });
    if (imp.length) css += '@import url("https://fonts.googleapis.com/css2?' + imp.join("&") + '&display=swap");';
    css += ":root{"; Object.keys(v).forEach(function (k) { css += k + ":" + (/font/.test(k) ? fontCss(v[k]) : v[k]) + ";"; });
    css += "--navy:var(--wx-navy);--navy-2:var(--wx-navy);--ink:var(--wx-ink);--muted:var(--wx-muted)}html{font-size:var(--wx-base-size)}body,button,input,select,textarea{font-family:var(--wx-font)!important}main h1,main h2,main h3{font-family:var(--wx-font-head)}";
    ["h1", "h2", "h3"].forEach(function (h) { if (v["--wx-" + h]) css += "main " + h + "{font-size:var(--wx-" + h + ")!important}"; });
    el.textContent = css; paletteList();
  };
  $("#th-hs").onchange = function () { applyTheme(); };
  $$(".font-pick").forEach(function (i) { i.addEventListener("change", applyTheme); });
  function paletteList() {
    var cols = ["--wx-navy", "--wx-ink", "--wx-muted", "--wx-paper", "--wx-surface", "--wx-beige", "--wx-c1", "--wx-c2", "--wx-c3", "--wx-c4"].map(function (k) { var i = $('[data-var="' + k + '"]'); return i ? i.value : null; }).filter(Boolean);
    $("#wx-palette").innerHTML = cols.map(function (c) { return '<option value="' + c + '">'; }).join("");
  }
  new MutationObserver(function () { $$('input[type=color]:not([list])').forEach(function (i) { i.setAttribute("list", "wx-palette"); }); }).observe(document.body, { childList: true, subtree: true });
  $$('input[type=color]').forEach(function (i) { i.setAttribute("list", "wx-palette"); });

  // ---- media library: search, delete, usage, free photos (D11/E6)
  mediaPicker = function (cb) {
    api("media").then(function (r) {
      if (!r.ok) return toast(r.error, true);
      modal("<h2>Media</h2><div class='mtabs'><button class='is-on' data-mt='lib'>Library (" + r.media.length + ")</button><button data-mt='free'>Free photos</button></div>" +
        "<div data-mp='lib'><div class='row' style='margin-bottom:10px'><input type='search' class='lib-q' id='mp-q' placeholder='Search by file name…' style='margin:0;flex:3'><button class='btn' id='mp-up' style='flex:1'>⬆ Upload</button></div><div class='media-grid' id='mp-grid'></div></div>" +
        "<div data-mp='free' hidden><div class='row' style='margin-bottom:10px'><input type='search' class='lib-q' id='fp-q' placeholder='e.g. modern office interior, living room, kitchen' style='margin:0;flex:3'><button class='btn btn-pri' id='fp-go' style='flex:1'>Search</button></div><p class='hint'>Free-to-use photos (CC0 / commercial licences) from Openverse. The chosen photo is copied to your server.</p><div class='media-grid' id='fp-grid'></div></div>");
      $$(".mtabs button").forEach(function (b) { b.onclick = function () { $$(".mtabs button").forEach(function (x) { x.classList.toggle("is-on", x === b); }); $$("[data-mp]").forEach(function (p) { p.hidden = p.dataset.mp !== b.dataset.mt; }); if (b.dataset.mt === "free") $("#fp-q").focus(); }; });
      var drawLib = function () {
        var q = ($("#mp-q").value || "").toLowerCase();
        $("#mp-grid").innerHTML = r.media.filter(function (u) { return !q || u.toLowerCase().indexOf(q) >= 0; }).map(function (u) {
          var up = /^\/assets\/uploads\//.test(u); return "<div class='mi'><button data-u='" + esc(u) + "'><img src='" + esc(u) + "' loading='lazy' alt=''><span class='cap'>" + esc(u.split("/").pop()) + "</span></button>" + (up ? "<button class='x' data-del='" + esc(u) + "' title='Delete'>✕</button>" : "") + "</div>";
        }).join("") || "<p class='hint'>No images match.</p>";
        $$("#mp-grid button[data-u]").forEach(function (b) { b.onclick = function () { var im = b.querySelector("img"); closeModal(); cb(b.dataset.u, im.naturalWidth, im.naturalHeight); }; });
        $$("#mp-grid [data-del]").forEach(function (b) {
          b.onclick = function (e) {
            e.stopPropagation(); var u = b.dataset.del; if (!confirm("Delete " + u.split("/").pop() + " from the server?")) return;
            api("media_delete", { url: u }).then(function (x) {
              if (!x.ok && x.used) { if (!confirm("This image is still used on: " + x.used.join(", ") + "\n\nDelete anyway? Those pages will show a broken image.")) return; return api("media_delete", { url: u, force: true }).then(fin); }
              fin(x);
            });
            function fin(x) { if (!x.ok) return toast(x.error, true); r.media = r.media.filter(function (m) { return m !== u; }); drawLib(); toast("Image deleted"); }
          };
        });
      };
      $("#mp-q").oninput = drawLib; drawLib();
      $("#mp-up").onclick = function () { closeModal(); upload(cb); };
      var search = function () {
        var q = $("#fp-q").value.trim(); if (!q) return; $("#fp-grid").innerHTML = "<p class='hint'>Searching…</p>";
        fetch("https://api.openverse.org/v1/images/?q=" + encodeURIComponent(q) + "&page_size=30&license_type=commercial&mature=false").then(function (x) { return x.json(); }).then(function (j) {
          var res = (j.results || []).filter(function (p) { return /^https:/.test(p.url || ""); });
          $("#fp-grid").innerHTML = res.map(function (p, i) { return "<div class='mi'><button data-i='" + i + "' title='" + esc((p.title || "") + " — " + (p.creator || "unknown") + " (" + p.license + ")") + "'><img src='" + esc(p.thumbnail || p.url) + "' loading='lazy' alt=''><span class='cap'>" + esc((p.creator || "") + " · " + (p.license || "").toUpperCase()) + "</span></button></div>"; }).join("") || "<p class='hint'>No photos found. Try other words.</p>";
          $$("#fp-grid button").forEach(function (b) {
            b.onclick = function () {
              var p = res[+b.dataset.i]; toast("Copying photo to your server…");
              api("import_url", { url: p.url, name: q }).then(function (x) {
                if (!x.ok) return toast(x.error, true); closeModal(); cb(x.url, x.width, x.height);
                if (S.sel && S.sel.tagName === "IMG" && !S.sel.getAttribute("alt")) S.sel.setAttribute("alt", p.title || q);
                toast("Photo added. Credit: " + (p.creator || "unknown") + " (" + (p.license || "").toUpperCase() + ")");
              });
            };
          });
        }).catch(function () { $("#fp-grid").innerHTML = "<p class='hint'>Could not reach Openverse. Check the internet connection.</p>"; });
      };
      $("#fp-go").onclick = search; $("#fp-q").onkeydown = function (e) { if (e.key === "Enter") search(); };
    });
  };

  // ---- SEO & accessibility check (E3)
  function runAudit() {
    if (!S.doc) return; var out = [], d = S.doc, add = function (sev, msg, el) { out.push({ sev: sev, msg: msg, el: el }); };
    var t = d.title || "", desc = (d.querySelector('meta[name="description"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "";
    if (!t) add("bad", "Page has no title"); else if (t.length > 60) add("warn", "Title is " + t.length + " characters (best under 60)");
    if (!desc) add("bad", "No meta description"); else if (desc.length < 70 || desc.length > 160) add("warn", "Meta description is " + desc.length + " characters (best 70–160)");
    var h1 = $$("main h1", d); if (!h1.length) add("bad", "No H1 heading on the page"); if (h1.length > 1) h1.slice(1).forEach(function (h) { add("warn", "Extra H1: \"" + h.textContent.trim().slice(0, 40) + "\" (use one H1 per page)", h); });
    var last = 0; $$("main h1, main h2, main h3, main h4, main h5, main h6", d).forEach(function (h) { var l = +h.tagName[1]; if (last && l > last + 1) add("warn", "Heading jumps from H" + last + " to H" + l + ": \"" + h.textContent.trim().slice(0, 36) + "\"", h); last = l; });
    $$("main img, header img, footer img", d).forEach(function (im) {
      if (!im.hasAttribute("alt")) add("bad", "Image without alt text: " + (im.getAttribute("src") || "").split("/").pop(), im);
      if (!im.getAttribute("width") || !im.getAttribute("height")) add("warn", "Image without width/height (causes layout shift): " + (im.getAttribute("src") || "").split("/").pop(), im);
    });
    $$("a", d).forEach(function (a) {
      var name = (a.textContent || "").trim() || a.getAttribute("aria-label") || (a.querySelector("img[alt]") || {}).alt;
      if (!name) add("bad", "Link with no text or label → " + (a.getAttribute("href") || "(no href)"), a);
      else if (/^(click here|read more|here|more)$/i.test(name)) add("warn", "Vague link text \"" + name + "\"", a);
      if (!a.getAttribute("href") || a.getAttribute("href") === "#") add("warn", "Link goes nowhere (href \"" + (a.getAttribute("href") || "") + "\"): \"" + name.slice(0, 30) + "\"", a);
    });
    $$("button", d).forEach(function (b) { if (!(b.textContent || "").trim() && !b.getAttribute("aria-label")) add("bad", "Button with no text or aria-label", b); });
    var ids = {}; $$("[id]", d).forEach(function (n) { if (ids[n.id]) add("warn", "Duplicate id \"" + n.id + "\"", n); ids[n.id] = 1; });
    $$("input, textarea, select", d).forEach(function (i) { if (i.type === "hidden" || i.type === "radio" && i.closest(".wx-tabs")) return; if (!i.labels || !i.labels.length) { if (!i.getAttribute("aria-label")) add("bad", "Form field without a label: " + (i.name || i.id || i.type), i); } });
    var bad = out.filter(function (x) { return x.sev === "bad"; }).length, warn = out.length - bad, score = Math.max(0, 100 - bad * 10 - warn * 3);
    $("#audit").innerHTML = "<div class='score'>Score " + score + "/100 · " + bad + " problems · " + warn + " suggestions</div>" + (out.length ? out.map(function (x, i) { return "<div class='it " + x.sev + "' data-i='" + i + "'><b>" + (x.sev === "bad" ? "✕" : "!") + "</b><span>" + esc(x.msg) + "</span></div>"; }).join("") : "<div class='it good'><b>✓</b><span>No issues found.</span></div>");
    $$("#audit .it[data-i]").forEach(function (r) { r.onclick = function () { var x = out[+r.dataset.i]; if (x.el && x.el.isConnected) { if (x.el.tagName === "INPUT" || x.el.tagName === "META") return; select(x.el); x.el.scrollIntoView({ block: "center" }); } }; });
  }
  $("#audit-run").onclick = runAudit;

  // preload icons after sign-in so icon blocks insert instantly
  setTimeout(function () { if (S.csrf) loadIcons(); }, 1500);


  // =================================================================== PHASE A3 — global section instance tools
  var renderContentA3 = renderContent;
  renderContent = function () {
    renderContentA3(); var g = S.sel && S.sel.closest("[data-wx-global]"); if (!g) return;
    var id = g.getAttribute("data-wx-global"), dirty = !$("#save").disabled;
    $("#pane-content").insertAdjacentHTML("afterbegin", "<div class='gnote' style='margin:12px;padding:12px;border-radius:10px;background:#fcf2e8;border:1px solid #ecd9b8;font-size:12.5px;line-height:1.5'><b>🔗 Global section</b><br>Changes here affect only this page until you push them to every page that uses it." +
      "<div style='display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'><button class='btn btn-sm btn-pri' id='g-push'" + (dirty ? " disabled title='Save the page first'" : "") + ">Push to all pages</button><button class='btn btn-sm' id='g-detach'>Detach from library</button></div>" + (dirty ? "<small class='hint'>Save this page first, then push.</small>" : "") + "</div>");
    $("#g-detach").onclick = function () { if (!confirm("Detach? This copy stops syncing and becomes a normal section on this page.")) return; g.removeAttribute("data-wx-global"); changed(); renderContent(); toast("Detached. Save the page to keep it."); };
    $("#g-push").onclick = function () {
      api("blocks_list").then(function (r) {
        var b = (r.blocks || []).find(function (x) { return x.id === id; }); if (!b) return toast("This section is no longer in the library. Detach it.", true);
        if (!confirm("Replace \"" + b.name + "\" on every page that uses it with this version?")) return;
        api("blocks_save", { id: id, html: WXCSS.globalize(packStyles(g) + cleanOuter(g)) }).then(function (x) {
          if (!x.ok) return toast(x.error, true);
          api("blocks_sync", { id: id }).then(function (y) { if (!y.ok) return toast(y.error, true); toast("Updated on " + y.changed + " page(s) ✓"); loadPage(S.path); });
        });
      });
    };
  };

})();

/* Phase 4 — open the Admin "Header & footer" editor (header, mega menu, footer; all pages) in a panel */
(function () {
  var b = document.getElementById("hf-btn"); if (!b) return;
  b.addEventListener("click", function () {
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(12,22,40,.55);display:flex;flex-direction:column;padding:18px";
    ov.innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:#0c1628;color:#fff;padding:10px 14px;border-radius:12px 12px 0 0;font:600 14px system-ui">Header, mega menu &amp; footer — changes apply to every page after Publish<span style="flex:1"></span><a href="/admin/#/global" target="_blank" style="color:#c9a97a">Open in new tab ↗</a><button type="button" style="background:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:600">Close</button></div><iframe src="/admin/#/global" style="flex:1;border:0;background:#fff;border-radius:0 0 12px 12px"></iframe>';
    ov.querySelector("button").onclick = function () {
      ov.remove();
      if (confirm("Reload this page in the builder to see the latest header & footer?\n(Save your page first if you have unsaved changes.)")) location.reload();
    };
    document.body.appendChild(ov);
  });
})();
