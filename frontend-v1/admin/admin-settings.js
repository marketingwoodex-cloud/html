/* Woodex Admin v2 — A8
 * Settings & APIs: General (site name, logo, favicon, default share image, applied to every page), Integrations (email/SMTP,
 * Turnstile, AI, PageSpeed, tracking codes GA4 / Tag Manager / Meta Pixel / Search Console) each with a test, System status.
 * My security: two-step sign-in (authenticator app + recovery codes), login alerts, active sessions, team overview.
 */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var SITE = "https://woodex.com.pk";

  /** Run a transform over every page through the builder API (same checks + automatic page backups as the builder). */
  function sitewide(transform, prog, write) {
    return bapi("pages").then(function (pr) {
      var pages = pr.pages || [], i = 0, changed = [], fails = [];
      return pages.reduce(function (p, pg) {
        return p.then(function () {
          return bapi("load", { path: pg.path }).then(function (lr) {
            if (prog) prog(++i, pages.length); if (!lr.ok) return;
            var h = transform(lr.html, pg); if (h === lr.html) return; changed.push(pg.url);
            if (write) return bapi("save", { path: pg.path, html: h, mtime: lr.mtime }).then(function (s) { if (!s.ok) fails.push(pg.url); });
          });
        });
      }, Promise.resolve()).then(function () { return { changed: changed, fails: fails, total: pages.length }; });
    });
  }
  W.sitewide = sitewide;

  // ------------------------------------------------------------------ tracking snippet
  function trackingHtml(t) {
    var out = [];
    if (t.gsc) out.push('<meta name="google-site-verification" content="' + esc(t.gsc) + '">');
    if (t.gtm) out.push("<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" + t.gtm + "');</script>");
    if (t.ga4) out.push('<script async src="https://www.googletagmanager.com/gtag/js?id=' + t.ga4 + '"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + t.ga4 + '");</script>');
    if (t.pixel) out.push("<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','" + t.pixel + "');fbq('track','PageView');</script>");
    return out.length ? "<!-- wx:tracking (managed in Admin → Settings) -->\n" + out.join("\n") + "\n<!-- /wx:tracking -->" : "";
  }
  var TRK_RE = /\n?<!-- wx:tracking[\s\S]*?<!-- \/wx:tracking -->/;
  function applyTracking(html, t) {
    var block = trackingHtml(t), h = html.replace(TRK_RE, "");
    return block ? h.replace(/<\/head>/i, block + "\n</head>") : h;
  }
  // ------------------------------------------------------------------ general settings transform
  function mime(u) { return /\.svg$/i.test(u) ? "image/svg+xml" : /\.png$/i.test(u) ? "image/png" : /\.ico$/i.test(u) ? "image/x-icon" : /\.webp$/i.test(u) ? "image/webp" : "image/jpeg"; }
  function applyGeneral(html, o, n, logoSize) {
    var h = html;
    if (n.logo !== o.logo) h = h.replace(/<img([^>]*?)class="brand-mark"([^>]*?)>/g, function (tag) { var t = tag.replace(/\ssrc="[^"]*"/, ' src="' + n.logo + '"'); if (logoSize) t = t.replace(/\swidth="\d+"/, ' width="' + logoSize[0] + '"').replace(/\sheight="\d+"/, ' height="' + logoSize[1] + '"'); return t; });
    if (n.favicon !== o.favicon) h = h.replace(/<link rel="icon"[^>]*>/i, '<link rel="icon" href="' + n.favicon + '" type="' + mime(n.favicon) + '">');
    if (n.siteName !== o.siteName) h = h.replace(/(<meta property="og:site_name" content=")[^"]*"/, "$1" + esc(n.siteName) + '"');
    if (n.share !== o.share) ["og:image", "twitter:image"].forEach(function (k) { h = h.split('"' + k + '" content="' + SITE + o.share + '"').join('"' + k + '" content="' + SITE + n.share + '"'); });
    return h;
  }

  // ------------------------------------------------------------------ settings view
  W.VIEWS.settings = function (el, parts) {
    var tab = parts[0] || "integrations", D, solo = tab === "general";
    el.innerHTML = head(solo ? "Brand & logo" : "Integrations & APIs", "Settings", "") + '<div class="tabs" id="st-tabs"' + (solo ? " hidden" : "") + '>' + [["integrations", "Integrations"], ["system", "System status"]].map(function (t) { return '<button data-t="' + t[0] + '" class="' + (tab === t[0] ? "on" : "") + '">' + t[1] + "</button>"; }).join("") + '</div><div id="st-b"><p class="muted">Loading…</p></div>';
    $("#st-tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$("#st-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); };
    function load() { return api("set_get").then(function (r) { if (!r.ok) { $("#st-b").innerHTML = '<div class="card card-b">' + esc(r.error) + "</div>"; return; } D = r; draw(); }); }
    function draw() { if (!D) return; var B = $("#st-b"); if (tab === "general") general(B); else if (tab === "integrations") integrations(B); else system(B); W.fillIcons(B); }
    function imgField(id, label, val, hint) { return '<div class="imf st-img" id="' + id + '"><div class="imf-p" style="background-image:url(\'' + esc(val) + '\')"></div><div><b>' + label + '</b><p class="muted" style="margin:2px 0 6px;font-size:12px">' + hint + '</p><button type="button" class="btn sm" data-pick>Change</button></div><input type="hidden" value="' + esc(val) + '"></div>'; }
    function general(B) {
      var g = D.general;
      B.innerHTML = '<div class="qe"><div class="qe-main"><div class="card card-b"><form id="gn-f"><label>Site name<input id="gn-name" value="' + esc(g.siteName) + '"><small class="muted">Shown when pages are shared (og:site_name).</small></label><div class="g2">' +
        imgField("gn-logo", "Logo", g.logo, "Header logo on every page. PNG/SVG with a transparent background.") + imgField("gn-fav", "Favicon", g.favicon, "Browser tab icon. Square SVG or PNG (at least 64px).") + "</div>" + imgField("gn-share", "Default share image", g.share, "Shown on WhatsApp/Facebook for pages without their own image. 1200×630 is ideal.") +
        '<p class="err" id="gn-err"></p><div class="modal-actions" style="justify-content:flex-start"><button type="button" class="btn" id="gn-chk">' + ic("search") + 'Check changes</button><button class="btn pri" id="gn-go">' + ic("send") + 'Update website</button></div></form></div><div class="card" id="gn-res" hidden></div></div>' +
        '<div class="qe-side"><div class="card card-b"><h4 class="side-h">Preview</h4><div class="st-prev"><div class="st-tab"><img id="pv-fav" src="' + esc(g.favicon) + '" alt=""><span id="pv-name">' + esc(g.siteName) + '</span></div><div class="st-hdr"><img id="pv-logo" src="' + esc(g.logo) + '" alt=""></div><div class="st-share"><div id="pv-share" style="background-image:url(\'' + esc(g.share) + '\')"></div><small>WOODEX.COM.PK</small><b id="pv-name2">' + esc(g.siteName) + "</b></div></div></div>" +
        '<div class="card card-b"' + (solo ? " hidden" : "") + '><p class="muted" style="margin:0;font-size:13px">Contact details (phones, email, address, hours) are managed in <a href="#/business">Business info</a>.</p></div></div></div>';
      function cur() { return { siteName: $("#gn-name").value.trim(), logo: $("#gn-logo input").value, favicon: $("#gn-fav input").value, share: $("#gn-share input").value }; }
      function pv() { if (!$("#gn-name")) return; var c = cur(); $("#pv-fav").src = c.favicon; $("#pv-logo").src = c.logo; $("#pv-share").style.backgroundImage = "url('" + c.share + "')"; $("#pv-name").textContent = $("#pv-name2").textContent = c.siteName; }
      $("#gn-name").oninput = pv;
      $$(".st-img", B).forEach(function (box) { $("[data-pick]", box).onclick = function () { W.pickImage(function (u) { $("input", box).value = u; $(".imf-p", box).style.backgroundImage = "url('" + u + "')"; pv(); }); }; });
      function logoSize(u) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i.naturalHeight ? [Math.round(72 * i.naturalWidth / i.naturalHeight), 72] : null); }; i.onerror = function () { res(null); }; i.src = u; }); }
      function run(write) {
        if (!$("#gn-name")) return Promise.resolve(); var n = cur(), o = D.generalApplied, R = $("#gn-res"); $("#gn-err").textContent = "";
        return api("set_general_save", { general: n }).then(function (sv) {
          if (!sv.ok) { $("#gn-err").textContent = sv.error; return; }
          R.hidden = false; R.innerHTML = '<div class="card-b"><b>' + (write ? "Updating" : "Checking") + ' pages…</b> <span id="gn-pn"></span></div>';
          return logoSize(n.logo).then(function (ls) {
            return sitewide(function (h) { return applyGeneral(h, o, n, n.logo !== o.logo ? ls : null); }, function (i, t) { $("#gn-pn").textContent = i + " / " + t; }, write).then(function (res) {
              R.innerHTML = '<div class="card-h"><h3>' + (write ? "Website updated" : "Changes found") + '</h3><span class="badge ' + (write ? "ok" : "warn") + '">' + res.changed.length + " of " + res.total + " pages</span></div>" + (res.fails.length ? '<div class="card-b err">Failed: ' + res.fails.map(esc).join(", ") + "</div>" : "");
              if (write) return api("set_general_save", { general: n, applied: !res.fails.length }).then(function (x) { if (x.ok) D = Object.assign(D, x); toast("Website updated"); });
            });
          });
        });
      }
      $("#gn-chk").onclick = function () { var b = this; b.disabled = true; run(false).then(function () { b.disabled = false; }); };
      $("#gn-f").onsubmit = function (e) { e.preventDefault(); if (!confirm("Update every page with these settings?")) return; var b = $("#gn-go"); b.disabled = true; run(true).then(function () { b.disabled = false; }); };
    }
    function card(id, icon, title, status, body) { return '<div class="card st-card" id="' + id + '"><div class="card-h"><h3>' + ic(icon) + " " + title + "</h3>" + status + '</div><div class="card-b">' + body + "</div></div>"; }
    function badge(ok, yes, no) { return '<span class="badge ' + (ok ? "ok" : "") + '">' + (ok ? yes : no) + "</span>"; }
    function integrations(B) {
      var m = D.mail, t = D.turnstile, k = D.tracking, applied = D.trackingApplied;
      var sameApplied = applied && ["ga4", "gtm", "pixel", "gsc"].every(function (x) { return (applied[x] || "") === (k[x] || ""); });
      B.innerHTML = '<div class="st-grid">' +
        card("in-mail", "mail", "Email (SMTP)", badge(m.emailOn && m.smtpHost, "On", "Off"),
          '<p class="muted st-p">Sends enquiry alerts, login alerts and quotation emails. Hostinger: hPanel → Emails → your mailbox → Connect apps & devices (host <code>smtp.hostinger.com</code>, port 465).</p><label class="check"><input type="checkbox" id="m-on"' + (m.emailOn ? " checked" : "") + '> Send email alerts for new enquiries</label><label>Alert recipients<input id="m-to" value="' + esc(m.emailTo) + '" placeholder="you@woodex.com.pk, sales@…"></label><div class="g2"><label>SMTP host<input id="m-host" value="' + esc(m.smtpHost) + '" placeholder="smtp.hostinger.com"></label><label>Port<input id="m-port" type="number" value="' + esc(m.smtpPort) + '"></label><label>Username<input id="m-user" value="' + esc(m.smtpUser) + '"></label><label>Password<input id="m-pass" type="password" placeholder="' + (m.smtpPassSet ? "Saved (type to replace)" : "") + '"></label></div><label>From address<input id="m-from" value="' + esc(m.smtpFrom) + '" placeholder="Woodex <woodexinterior.pk@gmail.com>"></label>' +
          '<p class="st-res" id="m-res"></p><div class="st-act"><button class="btn" id="m-test">' + ic("send") + 'Send test</button><button class="btn pri" id="m-save">Save</button></div>') +
        card("in-ts", "shield", "Spam protection (Cloudflare Turnstile)", badge(t.tsSite && t.tsSecretSet, "On", "Off"),
          '<p class="muted st-p">Free. Cloudflare dashboard → Turnstile → Add site (<code>woodex.com.pk</code>, Managed) and copy both keys. Forms keep the honeypot and rate limit either way.</p><label>Site key<input id="ts-site" value="' + esc(t.tsSite) + '" placeholder="0x4AAAA…"></label><label>Secret key<input id="ts-sec" type="password" placeholder="' + (t.tsSecretSet ? "Saved (type to replace)" : "0x4AAAA…") + '"></label><p class="st-res" id="ts-res"></p><div class="st-act"><button class="btn" id="ts-test">' + ic("check") + 'Test</button><button class="btn pri" id="ts-save">Save</button></div>') +
        card("in-trk", "activity", "Tracking codes", badge(applied && (applied.ga4 || applied.gtm || applied.pixel || applied.gsc), "Live on site", "None"),
          '<p class="muted st-p">Added to the &lt;head&gt; of every page in one managed block. Leave a field empty to remove that code.</p><div class="g2"><label>Google Analytics 4<input id="k-ga4" value="' + esc(k.ga4) + '" placeholder="G-XXXXXXXXXX"></label><label>Google Tag Manager<input id="k-gtm" value="' + esc(k.gtm) + '" placeholder="GTM-XXXXXXX"></label><label>Meta (Facebook) Pixel<input id="k-px" value="' + esc(k.pixel) + '" placeholder="123456789012345"></label><label>Search Console verification<input id="k-gsc" value="' + esc(k.gsc) + '" placeholder="Paste the meta tag or its content"></label></div>' +
          '<p class="muted" style="font-size:12px">Tip: use either GA4 directly or Tag Manager (with GA4 inside it), not both, to avoid counting visits twice.</p><p class="st-res" id="k-res">' + (applied ? "Last applied " + esc(String(applied.at || "").slice(0, 16)) + (sameApplied ? "" : ' · <span class="warnc">saved values differ from the website</span>') : "") + '</p><div class="st-act"><button class="btn" id="k-chk">' + ic("search") + 'Check pages</button><button class="btn pri" id="k-go">' + ic("send") + "Save & apply to all pages</button></div>") +
        card("in-ai", "sparkles", "AI writing (Claude / OpenAI / OpenRouter)", badge(D.ai.ready, "Connected · " + D.ai.provider, "No key"), '<p class="muted st-p">Used for blog drafts, SEO text, alt text and city pages. Keys are stored on the server only.</p><div class="st-act"><button class="btn pri" id="ai-open">' + ic("settings") + "AI settings & test</button></div>") +
        card("in-psi", "zap", "Google PageSpeed", badge(D.psi, "Key saved", "No key (limited)"), '<p class="muted st-p">Speed and SEO scores for mobile and desktop in Site health. Without a key Google often answers “quota exceeded”, so add a free key:</p><ol class="muted st-p" style="padding-left:18px;margin-top:0"><li>Open <a href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey" target="_blank" rel="noopener">Google PageSpeed → Get a Key</a> and sign in with Gmail.</li><li>Choose or create a project (e.g. “Woodex”) and press <b>Next</b>.</li><li>Copy the key (starts with <code>AIza</code>) and paste it below.</li></ol><label>API key<input id="psi-k" type="password" placeholder="' + (D.psi ? "Saved — paste a new key to replace" : "AIza…") + '" autocomplete="off"></label><p class="st-res" id="psi-res"></p><div class="st-act">' + (D.psi ? '<button class="btn ghost danger" id="psi-clr">Remove key</button>' : "") + '<button class="btn" id="psi-test">' + ic("zap") + 'Test (home page, mobile)</button><button class="btn pri" id="psi-save">Save</button><a class="btn" href="#/health">Site health</a></div>') +
        card("in-wa", "message-square", "WhatsApp", '<span class="badge ok">Links</span>', '<p class="muted st-p">Visitors reach you through wa.me links (free). The number comes from <a href="#/business">Business info</a>. The WhatsApp Cloud API is not used.</p>') +
        "</div>";
      var crmSave = function (extra) { return api("crm_settings", {}).then(function (cur) { var s = Object.assign({}, cur.settings || {}, extra); ["smtpPass", "waToken", "tsSecret"].forEach(function (x) { if (!(x in extra)) s[x] = ""; }); return api("crm_settings_save", { settings: s }); }); };
      var res = function (id, ok, msg) { var e = $(id); e.className = "st-res " + (ok ? "okc" : "bad"); e.textContent = msg; };
      function mailVals() { var o = { emailOn: $("#m-on").checked, emailTo: $("#m-to").value, smtpHost: $("#m-host").value, smtpPort: +$("#m-port").value || 465, smtpUser: $("#m-user").value, smtpFrom: $("#m-from").value }; if ($("#m-pass").value) o.smtpPass = $("#m-pass").value; return o; }
      $("#m-save").onclick = function () { crmSave(mailVals()).then(function (r) { if (!r.ok) return res("#m-res", false, r.error); res("#m-res", true, "Saved"); load(); }); };
      $("#m-test").onclick = function () { var b = this; b.disabled = true; res("#m-res", true, "Sending…"); crmSave(mailVals()).then(function (r) { if (!r.ok) throw new Error(r.error); return api("crm_test", { channel: "email" }); }).then(function (r) { b.disabled = false; if (!r.ok) return res("#m-res", false, r.error); res("#m-res", true, "Test: " + r.result); }).catch(function (e) { b.disabled = false; res("#m-res", false, e.message); }); };
      function tsVals() { var o = { tsSite: $("#ts-site").value.trim() }; if ($("#ts-sec").value) o.tsSecret = $("#ts-sec").value.trim(); return o; }
      $("#ts-save").onclick = function () { crmSave(tsVals()).then(function (r) { if (!r.ok) return res("#ts-res", false, r.error); res("#ts-res", true, "Saved"); load(); }); };
      $("#ts-test").onclick = function () { var b = this; b.disabled = true; crmSave(tsVals()).then(function () { return api("set_ts_test"); }).then(function (r) { b.disabled = false; res("#ts-res", r.ok, r.ok ? r.result : r.error); }); };
      $("#ai-open").onclick = function () { if (W.aiSettings) W.aiSettings(); else location.hash = "#/blog"; };
      var psiSave = function () { var k = $("#psi-k").value.trim(); if (k && !/^AIza[\w-]{20,}$/.test(k)) { res("#psi-res", false, "That doesn’t look like a Google API key (it starts with AIza)"); return Promise.resolve({ ok: false }); } return k ? api("health_settings", { psiKey: k }) : Promise.resolve({ ok: true, same: true }); };
      $("#psi-save").onclick = function () { psiSave().then(function (r) { if (!r.ok) return; if (r.same) return res("#psi-res", false, "Paste a key first"); res("#psi-res", true, "Key saved ✓"); load(); }); };
      $("#psi-test").onclick = function () { var b = this; b.disabled = true; res("#psi-res", true, "Testing… this takes 20–60 seconds"); psiSave().then(function (r) { if (!r.ok) throw new Error(r.error || ""); return api("health_psi", { rel: "index.html", strategy: "mobile" }); }).then(function (r) { b.disabled = false; if (!r.ok) return res("#psi-res", false, r.error + (/quota|429/i.test(r.error) ? " — add or check your API key." : "")); var x = r.result; res("#psi-res", true, "Works ✓ Mobile: performance " + x.perf + " · accessibility " + x.a11y + " · best practices " + x.bp + " · SEO " + x.seo); }).catch(function (e) { b.disabled = false; if (e.message) res("#psi-res", false, e.message); }); };
      if ($("#psi-clr")) $("#psi-clr").onclick = function () { if (confirm("Remove the PageSpeed API key?")) api("health_settings", { clearKey: true }).then(function () { load(); }); };
      function trk() { return { ga4: $("#k-ga4").value.trim(), gtm: $("#k-gtm").value.trim(), pixel: $("#k-px").value.trim(), gsc: $("#k-gsc").value.trim() }; }
      function runTrk(write) {
        return api("set_tracking_save", { tracking: trk() }).then(function (sv) {
          if (!sv.ok) { res("#k-res", false, sv.error); return; }
          var t = sv.tracking; ["ga4", "gtm", "pixel", "gsc"].forEach(function (x) { $({ ga4: "#k-ga4", gtm: "#k-gtm", pixel: "#k-px", gsc: "#k-gsc" }[x]).value = t[x]; });
          return sitewide(function (h) { return applyTracking(h, t); }, function (i, n) { res("#k-res", true, (write ? "Updating " : "Checking ") + i + " / " + n + "…"); }, write).then(function (r) {
            if (!write) return res("#k-res", true, r.changed.length ? r.changed.length + " of " + r.total + " pages would change" : "All pages are up to date");
            return api("set_tracking_save", { tracking: t, applied: !r.fails.length }).then(function (x) { if (x.ok) D = Object.assign(D, x); res("#k-res", !r.fails.length, (r.fails.length ? "Failed on " + r.fails.length + " page(s). " : "") + "Updated " + r.changed.length + " of " + r.total + " pages"); toast("Tracking codes applied"); });
          });
        });
      }
      $("#k-chk").onclick = function () { var b = this; b.disabled = true; runTrk(false).then(function () { b.disabled = false; }); };
      $("#k-go").onclick = function () { if (!confirm("Update the tracking codes on every page?")) return; var b = this; b.disabled = true; runTrk(true).then(function () { b.disabled = false; }); };
    }
    function system(B) {
      var s = D.system, cronOk = s.cron && (Date.now() - new Date(s.cron.replace(" ", "T") + "Z").getTime()) < 2 * 864e5;
      var row = function (ok, name, val, fix) { return "<tr><td>" + (ok ? '<span class="okc">' + ic("check") + "</span>" : '<span class="warnc">!</span>') + "</td><td><b>" + name + "</b></td><td>" + val + '</td><td class="muted">' + (ok ? "" : fix || "") + "</td></tr>"; };
      B.innerHTML = '<div class="card"><div class="card-h"><h3>' + ic("server") + ' System status</h3></div><div class="tbl-wrap"><table class="tbl"><tbody>' +
        row(true, "Server", esc(s.server)) + row(s.zip, "Backup archives", s.zip ? "Available" : "Missing", "Enable the PHP zip extension (hPanel → Advanced → PHP Configuration)") + row(s.curl, "Outgoing connections (cURL)", s.curl ? "Available" : "Missing", "Enable the PHP curl extension") + row(s.openssl, "Encryption (OpenSSL)", s.openssl ? "Available" : "Missing", "Enable the PHP openssl extension") +
        row(cronOk, "Cron job", s.cron ? "Last run " + esc(s.cron.slice(0, 16)) + " UTC" : "Never ran", 'Add the cron job shown in <a href="#/backups">Backups</a>') + row(D.mail.emailOn && D.mail.smtpHost, "Email alerts", D.mail.smtpHost ? esc(D.mail.smtpHost) : "Not set", "Integrations → Email") + row(D.turnstile.tsSite && D.turnstile.tsSecretSet, "Spam protection", D.turnstile.tsSite ? "Turnstile on" : "Honeypot + rate limit only", "Integrations → Turnstile") +
        (s.disk ? row(true, "Disk used by site", esc(s.disk)) : "") + "</tbody></table></div></div>";
    }
    load();
  };

  // ------------------------------------------------------------------ my security
  function device(ua) { ua = ua || ""; var b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser", o = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : ""; return [b + (o ? " on " + o : ""), /Android|iPhone|iPad|Mobile/.test(ua)]; }
  function codesBox(codes) {
    return '<div class="rc"><p><b>Save these recovery codes now.</b> Each works once if you lose your phone. They will not be shown again.</p><div class="rc-grid">' + codes.map(function (c) { return "<code>" + esc(c) + "</code>"; }).join("") + '</div><div class="st-act"><button class="btn sm" id="rc-copy">' + ic("copy") + 'Copy</button><button class="btn sm" id="rc-dl">Download .txt</button></div></div>';
  }
  function bindCodes(codes) {
    var txt = "Woodex Admin recovery codes (" + S.user.email + ")\n\n" + codes.join("\n") + "\n\nEach code works once.";
    $("#rc-copy").onclick = function () { navigator.clipboard && navigator.clipboard.writeText(txt); toast("Copied"); };
    $("#rc-dl").onclick = function () { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = "woodex-admin-recovery-codes.txt"; a.click(); };
  }
  W.VIEWS.security = function (el) {
    el.innerHTML = head("My security", "Security", "") + '<div id="sc-b"><p class="muted">Loading…</p></div>';
    function load() { api("sec_get").then(function (r) { if (!r.ok) return toast(r.error, true); draw(r); }); }
    function draw(r) {
      var B = $("#sc-b");
      B.innerHTML = '<div class="qe"><div class="qe-main">' +
        '<div class="card"><div class="card-h"><h3>' + ic("smartphone") + ' Two-step sign-in</h3>' + (r.totp ? '<span class="badge ok">On</span>' : '<span class="badge warn">Off</span>') + '</div><div class="card-b">' +
        (r.totp ? '<p>After your password, you enter a 6-digit code from your authenticator app. Recovery codes left: <b>' + r.recoveryLeft + "</b>" + (r.recoveryLeft < 3 ? ' <span class="warnc">(make new ones)</span>' : "") + '</p><div class="st-act"><button class="btn" id="tf-rc">' + ic("key") + 'New recovery codes</button><button class="btn ghost danger" id="tf-off">Turn off</button></div>'
          : '<p>Protect your account even if your password leaks. You need a free authenticator app: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> or <b>Authy</b>.</p>' + (["owner", "admin"].indexOf(S.user.role) > -1 ? '<p class="warnc" style="font-size:13px">Strongly recommended for owner and admin accounts.</p>' : "") + '<div class="st-act"><button class="btn pri" id="tf-on">' + ic("shield") + "Turn on two-step sign-in</button></div>") +
        '</div></div>' +
        '<div class="card"><div class="card-h"><h3>' + ic("monitor") + ' Signed-in devices</h3>' + (r.sessions.length > 1 ? '<button class="btn sm" id="ss-others">' + ic("log-out") + "Sign out all other devices</button>" : "") + '</div><div class="tbl-wrap"><table class="tbl"><tbody>' +
        r.sessions.map(function (x) { var d = device(x.ua); return "<tr><td>" + ic(d[1] ? "smartphone" : "monitor") + "</td><td><b>" + esc(d[0]) + "</b>" + (x.current ? ' <span class="badge ok">This device</span>' : "") + '<br><small class="muted">' + esc(x.ip) + " · signed in " + esc(x.created.slice(0, 16)) + " · last active " + esc(x.seen.slice(0, 16)) + ' UTC</small></td><td class="r">' + (x.current ? "" : '<button class="btn sm" data-rv="' + x.sid + '">Sign out</button>') + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><h3>Recent sign-ins</h3></div><div class="tbl-wrap"><table class="tbl"><tbody>' + (r.logins.length ? r.logins.map(function (l) { return "<tr><td>" + esc({ login: "Signed in", "2fa.enable": "Two-step turned on", "2fa.disable": "Two-step turned off", "2fa.recovery_used": "Recovery code used", "2fa.recovery_new": "New recovery codes", "2fa.reset": "Two-step reset" }[l.action] || l.action) + '</td><td class="muted">' + esc(l.ip) + '</td><td class="muted r">' + esc(l.created_at.slice(0, 16)) + " UTC</td></tr>"; }).join("") : '<tr><td class="muted">None yet.</td></tr>') + "</tbody></table></div></div>" +
        (r.team ? '<div class="card"><div class="card-h"><h3>' + ic("users") + ' Team security</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Two-step</th><th>Devices</th><th></th></tr></thead><tbody>' + r.team.map(function (u) { var me = u.id === S.user.id; return "<tr><td><b>" + esc(u.name) + "</b></td><td>" + esc(u.role) + "</td><td>" + (u.totp ? '<span class="badge ok">On</span>' : '<span class="badge">Off</span>') + "</td><td>" + u.sessions + '</td><td class="r nowrap">' + (me ? "" : '<button class="btn sm" data-all="' + u.id + '">Sign out everywhere</button>' + (u.totp ? ' <button class="btn sm ghost danger" data-reset="' + u.id + '">Reset two-step</button>' : "")) + "</td></tr>"; }).join("") + '</tbody></table></div><div class="card-b muted" style="font-size:13px">Reset two-step if a team member lost their phone and recovery codes. They can sign in with just their password and set it up again.</div></div>' : "") +
        '</div><div class="qe-side"><div class="card card-b"><h4 class="side-h">' + ic("bell") + ' Login alerts</h4><label class="check"><input type="checkbox" id="al-on"' + (r.alerts ? " checked" : "") + '> Email me when my account signs in from a new device</label><p class="muted" style="font-size:12px;margin:6px 0 0">Sent to ' + esc(S.user.email) + '. Needs email set up in Settings → Integrations.</p></div>' +
        '<div class="card card-b"><h4 class="side-h">Password</h4><p class="muted" style="font-size:13px;margin:0 0 8px">Changing your password signs out all your other devices.</p><button class="btn" id="pw-ch">' + ic("key") + "Change password</button></div></div></div>";
      W.fillIcons(B);
      if ($("#tf-on")) $("#tf-on").onclick = enable;
      if ($("#tf-off")) $("#tf-off").onclick = function () { var pw = prompt("Enter your password to turn off two-step sign-in"); if (pw) api("sec_2fa_disable", { password: pw }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Two-step sign-in turned off"); load(); }); };
      if ($("#tf-rc")) $("#tf-rc").onclick = function () { var pw = prompt("Enter your password to make new recovery codes (old ones stop working)"); if (pw) api("sec_recovery_new", { password: pw }).then(function (x) { if (!x.ok) return toast(x.error, true); modal("<h3>New recovery codes</h3>" + codesBox(x.codes) + '<div class="modal-actions"><button class="btn pri" data-x>Done</button></div>'); bindCodes(x.codes); $("[data-x]").onclick = function () { closeModal(); load(); }; }); };
      if ($("#ss-others")) $("#ss-others").onclick = function () { api("sec_revoke", { others: true }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Other devices signed out"); load(); }); };
      B.onclick = function (e) {
        var b = e.target.closest("[data-rv],[data-all],[data-reset]"); if (!b) return;
        if (b.dataset.rv) api("sec_revoke", { sid: b.dataset.rv }).then(function (x) { if (!x.ok) return toast(x.error, true); load(); });
        if (b.dataset.all && confirm("Sign this person out on all devices?")) api("sec_revoke", { user_id: +b.dataset.all }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Signed out everywhere"); load(); });
        if (b.dataset.reset && confirm("Reset two-step sign-in for this person? They will also be signed out.")) api("sec_2fa_reset", { user_id: +b.dataset.reset }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Two-step reset"); load(); });
      };
      $("#al-on").onchange = function () { api("sec_alerts", { on: this.checked }).then(function (x) { if (x.ok) toast(x.alerts ? "Login alerts on" : "Login alerts off"); }); };
      $("#pw-ch").onclick = function () { var a = $('#u-menu [data-act="password"], [data-act="password"]'); if (a) a.click(); else location.hash = "#/profile"; };
    }
    function enable() {
      api("sec_2fa_begin").then(function (r) {
        if (!r.ok) return toast(r.error, true);
        var qr = ""; try { var q = window.qrcode(0, "M"); q.addData(r.uri); q.make(); qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { qr = ""; }
        modal('<h3>Turn on two-step sign-in</h3><ol class="tf-steps"><li>Open your authenticator app and tap <b>+</b> (add account), then <b>Scan a QR code</b>.</li></ol><div class="tf-qr">' + qr + '</div><p class="muted" style="text-align:center;font-size:12px">Can\'t scan? Enter this key manually:<br><code class="tf-key">' + esc(r.secret.replace(/(.{4})/g, "$1 ").trim()) + '</code></p><ol class="tf-steps" start="2"><li>Enter the 6-digit code the app shows:</li></ol><input id="tf-code" inputmode="numeric" maxlength="6" placeholder="123456" class="tf-in"><p class="err" id="tf-err"></p><div class="modal-actions"><button class="btn" data-x>Cancel</button><button class="btn pri" id="tf-go">Verify & turn on</button></div>');
        $("[data-x]").onclick = closeModal; $("#tf-code").focus();
        $("#tf-go").onclick = function () {
          api("sec_2fa_enable", { code: $("#tf-code").value }).then(function (x) {
            if (!x.ok) { $("#tf-err").textContent = x.error; return; }
            modal('<h3>' + ic("check") + " Two-step sign-in is on</h3>" + codesBox(x.codes) + '<div class="modal-actions"><button class="btn pri" data-x>I saved my codes</button></div>'); bindCodes(x.codes);
            $("[data-x]").onclick = function () { closeModal(); load(); };
          });
        };
      });
    }
    load();
  };
  W.settingsLib = { trackingHtml: trackingHtml, applyTracking: applyTracking, applyGeneral: applyGeneral };
})();
