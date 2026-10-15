/* Woodex Admin — Phase 8: Google sign-in (existing users only), Settings → Connections (Google, AI Agent / MCP, WhatsApp stats). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, S = W.S;

  var css = document.createElement("style");
  css.textContent = ".g-or{display:flex;align-items:center;gap:10px;margin:14px 0 12px;color:var(--mut);font-size:12px}.g-or:before,.g-or:after{content:'';flex:1;height:1px;background:var(--line,#e5e7eb)}" +
    "#g-btn{display:flex;justify-content:center;min-height:44px}.p8-code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--bg);border:1px solid var(--line,#e5e7eb);border-radius:8px;padding:10px 12px;word-break:break-all;display:block;white-space:pre-wrap}" +
    ".p8-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.p8-kpis div{background:var(--bg);border-radius:10px;padding:12px}.p8-kpis b{display:block;font-size:22px}.p8-kpis small{color:var(--mut)}" +
    ".p8-bars{display:flex;align-items:flex-end;gap:3px;height:70px;margin:6px 0 12px}.p8-bars i{flex:1;background:#25d366;border-radius:3px 3px 0 0;min-height:2px}.p8-steps li{margin:0 0 6px}@media(max-width:700px){.p8-kpis{grid-template-columns:repeat(2,1fr)}}";
  document.head.appendChild(css);

  // ---------------------------------------------------------------- Google Identity Services loader
  var gisP = null;
  function gis() {
    if (gisP) return gisP;
    gisP = new Promise(function (res, rej) { if (window.google && google.accounts) return res(); var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = function () { res(); }; s.onerror = function () { gisP = null; rej(new Error("Could not load Google sign-in")); }; document.head.appendChild(s); });
    return gisP;
  }
  function gButton(box, clientId, cb, text) {
    return gis().then(function () {
      google.accounts.id.initialize({ client_id: clientId, callback: function (r) { cb(r.credential); }, auto_select: false, cancel_on_tap_outside: true, context: "signin" });
      google.accounts.id.renderButton(box, { theme: "outline", size: "large", text: text || "signin_with", shape: "pill", width: Math.min(320, box.clientWidth || 320) });
    });
  }

  // ---------------------------------------------------------------- login screen button
  api("google_cfg").then(function (r) {
    if (!r || !r.ok || !r.clientId || !$("#g-login")) return;
    $("#g-login").hidden = false;
    gButton($("#g-btn"), r.clientId, function (cred) {
      $("#l-err").textContent = "";
      api("google_login", { credential: cred }).then(function (x) {
        if (!x.ok) return ($("#l-err").textContent = x.error);
        if (x.need2fa) { S.ticket = x.ticket; $("#login-form").hidden = true; $("#tfa-form").hidden = false; $("#t-code").value = ""; $("#t-err").textContent = ""; $("#t-code").focus(); return; }
        W.signedIn(x);
      });
    }).catch(function () { $("#g-login").hidden = true; });
  });

  function wrap(name, after) { var base = W.VIEWS[name]; if (!base) return; W.VIEWS[name] = function (el, parts) { var r = base(el, parts); try { after(el, parts || []); } catch (e) { console.error(e); } return r; }; }

  // ---------------------------------------------------------------- My security → Sign in with Google
  wrap("security", function (el) {
    var box = document.createElement("div"); box.className = "card"; box.style.marginTop = "16px"; el.appendChild(box);
    function draw() {
      api("google_me").then(function (r) {
        if (!r.ok) return;
        if (!r.clientId) { box.innerHTML = '<div class="card-h"><h3>' + ic("user") + ' Sign in with Google</h3><span class="badge">Not set up</span></div><div class="card-b"><p class="muted" style="margin:0">' + (S.user.role === "owner" ? 'Turn it on in <a href="#/settings/connections">Settings → Connections</a>.' : "The owner has not turned on Google sign-in yet.") + "</p></div>"; W.fillIcons(box); return; }
        box.innerHTML = '<div class="card-h"><h3>' + ic("user") + ' Sign in with Google</h3>' + (r.linked ? '<span class="badge ok">Linked</span>' : '<span class="badge warn">Not linked</span>') + '</div><div class="card-b">' +
          (r.linked ? '<p>You can sign in with <b>' + esc(r.email) + '</b>. Two-step sign-in still applies if it is on.</p><button class="btn" id="g-unl">' + ic("x") + "Unlink Google</button>"
            : '<p>Link your Google account to sign in with one click. Accounts whose Gmail matches your Admin email (<b>' + esc(S.user.email) + '</b>) also work without linking.</p><div id="g-lnk"></div>') + "</div>";
        W.fillIcons(box);
        if ($("#g-unl")) $("#g-unl").onclick = function () { if (!confirm("Unlink your Google account?")) return; api("google_unlink").then(function (x) { if (!x.ok) return toast(x.error, true); toast("Google unlinked"); draw(); }); };
        if ($("#g-lnk")) gButton($("#g-lnk"), r.clientId, function (cred) { api("google_link", { credential: cred }).then(function (x) { if (!x.ok) return toast(x.error, true); toast("Google linked: " + x.email); draw(); }); }, "continue_with").catch(function (e) { $("#g-lnk").textContent = e.message; });
      });
    }
    draw();
  });

  // ---------------------------------------------------------------- Settings → Connections tab
  wrap("settings", function (el, parts) {
    var tabs = $("#st-tabs"); if (!tabs) return;
    var b = document.createElement("button"); b.textContent = "Connections"; b.setAttribute("data-p8", "1"); tabs.appendChild(b);
    tabs.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t === b) { e.stopImmediatePropagation(); $$("#st-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); history.replaceState(null, "", "#/settings/connections"); connections($("#st-b")); }
    }, true);
    if (parts[0] === "connections") {
      $$("#st-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      var box = $("#st-b"); connections(box);
      // the base view loads its data async and then draws its own tab: redraw ours once when that happens
      var mo = new MutationObserver(function () { if (!box.querySelector("#p8-g")) { mo.disconnect(); $$("#st-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); }); connections(box); } });
      mo.observe(box, { childList: true }); setTimeout(function () { mo.disconnect(); }, 8000);
    }
  });

  function connections(B) {
    var owner = S.user.role === "owner", oa = owner || S.user.role === "admin", mcpUrl = location.origin + "/api/mcp.php";
    B.innerHTML = '<div class="qe"><div class="qe-main">' +
      '<div class="card" id="p8-wa"><div class="card-h"><h3>' + ic("message-circle") + ' WhatsApp button</h3></div><div class="card-b"><p class="muted">Loading…</p></div></div>' +
      (oa ? '<div class="card" id="p8-mcp"><div class="card-h"><h3>' + ic("cpu") + ' AI Agent (MCP connector)</h3><button class="btn sm pri" id="mcp-new">' + ic("plus") + 'New token</button></div><div class="card-b">' +
        '<p>Let an AI app (Claude, ChatGPT, Cursor, n8n or any MCP client) read leads, quotations, clients, pages and reports, and prepare <b>drafts</b> (quotation, blog post, lead note). It can never delete, send or publish anything. Each token works with the permissions of the person who created it.</p>' +
        '<label style="margin:0 0 4px">Server URL</label><code class="p8-code" id="mcp-url">' + esc(mcpUrl) + '</code><div id="mcp-list" style="margin-top:14px"><p class="muted">Loading…</p></div>' +
        '<details style="margin-top:12px"><summary><b>How to connect</b></summary><ol class="p8-steps" style="margin-top:8px"><li>Click <b>New token</b>, give it a name (e.g. “Claude – Ahmad”) and copy the token. It is shown only once.</li>' +
        '<li>In your AI app add a <b>custom connector / remote MCP server</b> with the URL above, transport <b>Streamable HTTP</b>, and header <code>Authorization: Bearer &lt;token&gt;</code>.</li>' +
        '<li>Apps that only accept a URL: use <code>' + esc(mcpUrl) + '?key=&lt;token&gt;</code> (less safe, since the token sits in the URL).</li>' +
        '<li>Ask things like “Show new leads this week”, “Monthly report for September”, “Draft a quotation for 40 rft kitchen cabinets for Ali”.</li></ol>' +
        '<p class="muted" style="font-size:12px">Config file example (Claude Desktop, Cursor):</p><code class="p8-code">{\n  "mcpServers": {\n    "woodex": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "' + esc(mcpUrl) + '", "--header", "Authorization: Bearer YOUR_TOKEN"]\n    }\n  }\n}</code></details>' +
        '<details style="margin-top:8px"><summary><b>Recent AI activity</b></summary><div id="mcp-log" style="margin-top:8px"></div></details></div></div>' : "") +
      '</div><div class="qe-side">' +
      '<div class="card" id="p8-g"><div class="card-h"><h3>' + ic("user") + ' Google sign-in</h3></div><div class="card-b"><p class="muted">Loading…</p></div></div>' +
      "</div></div>";
    W.fillIcons(B);

    // Google
    api("google_me").then(function (r) {
      var G = $("#p8-g .card-b"); if (!r.ok) return (G.textContent = r.error);
      G.innerHTML = '<p style="margin-top:0">Team members sign in with their Gmail. Only people already added in <a href="#/users">Users</a> can get in, and nobody can sign up.</p>' +
        (owner ? '<label>Google OAuth client ID<input id="g-cid" value="' + esc(r.clientId) + '" placeholder="1234-abc.apps.googleusercontent.com"></label><div class="modal-actions" style="justify-content:flex-start"><button class="btn pri" id="g-save">' + ic("check") + "Save</button>" + (r.clientId ? '<button class="btn" id="g-off">Turn off</button>' : "") + "</div>" +
          '<details style="margin-top:10px"><summary><b>Get a client ID (free, 5 minutes)</b></summary><ol class="p8-steps" style="margin-top:8px;font-size:13px"><li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → Credentials</a> and create a project (e.g. “Woodex Admin”).</li><li><b>OAuth consent screen</b>: External, app name “Woodex Admin”, your email. Save.</li><li><b>Create credentials → OAuth client ID</b> → Web application.</li><li><b>Authorized JavaScript origins</b>: <code>' + esc(location.origin) + "</code>" + (location.hostname !== "woodex.com.pk" ? " and <code>https://woodex.com.pk</code>" : "") + '</li><li>Copy the <b>Client ID</b> here and click Save. No secret is needed.</li></ol></details>'
          : '<p class="badge ' + (r.clientId ? "ok" : "") + '">' + (r.clientId ? "On" : "Off") + '</p><p class="muted" style="font-size:13px">Only the owner can change this. Link your own Google account in <a href="#/security">My security</a>.</p>');
      W.fillIcons(G);
      function saveG(v) { api("google_save", { clientId: v }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(v ? "Google sign-in is on" : "Google sign-in is off"); connections(B); }); }
      if ($("#g-save")) $("#g-save").onclick = function () { saveG($("#g-cid").value.trim()); };
      if ($("#g-off")) $("#g-off").onclick = function () { if (confirm("Turn off Google sign-in? Passwords keep working.")) saveG(""); };
    });

    // WhatsApp stats
    api("wa_stats").then(function (r) {
      var X = $("#p8-wa .card-b"); if (!r.ok) return (X.textContent = r.error);
      var days = [], mx = 1; for (var i = 29; i >= 0; i--) { var d = new Date(Date.now() - i * 864e5 + 5 * 36e5).toISOString().slice(0, 10); var n = r.days[d] || 0; days.push([d, n]); mx = Math.max(mx, n); }
      function top(o, label) { var k = Object.keys(o || {}); return k.length ? '<table class="tbl"><thead><tr><th>' + label + '</th><th style="text-align:right">Clicks</th></tr></thead><tbody>' + k.map(function (x) { return "<tr><td>" + esc(x) + '</td><td style="text-align:right">' + o[x] + "</td></tr>"; }).join("") + "</tbody></table>" : ""; }
      X.innerHTML = '<div class="p8-kpis"><div><b>' + r.today + '</b><small>Clicks today</small></div><div><b>' + r.d7 + '</b><small>Last 7 days</small></div><div><b>' + r.d30 + '</b><small>Last 30 days</small></div><div><b>' + r.leads30 + '</b><small>Leads saved (30 d)</small></div></div>' +
        '<div class="p8-bars" title="Clicks per day, last 30 days">' + days.map(function (x) { return '<i style="height:' + Math.round(100 * x[1] / mx) + '%" title="' + x[0] + ": " + x[1] + '"></i>'; }).join("") + "</div>" +
        (r.d30 ? '<div class="g2">' + top(r.pages, "Page") + top(r.services, "Service") + "</div>" : '<p class="muted">No clicks yet. They appear here as visitors use the WhatsApp button.</p>') +
        '<p class="muted" style="font-size:12px;margin-bottom:0">Visitors who add their name and phone in the WhatsApp box are saved in <a href="#/leads">Enquiries</a> with the source “WhatsApp widget”. Counts are anonymous. The number comes from <a href="#/business">Business info</a>.</p>';
    });

    if (!oa) return;
    function list(tokens) {
      $("#mcp-list").innerHTML = tokens.length ? '<table class="tbl"><thead><tr><th>Name</th><th>Created by</th><th>Last used</th><th>Calls</th><th></th></tr></thead><tbody>' + tokens.map(function (t) {
        return "<tr><td><b>" + esc(t.name) + '</b><br><small class="muted">…' + esc(t.hint) + "</small></td><td>" + esc(t.user) + "<br><small class=\"muted\">" + esc(t.created_at) + "</small></td><td>" + (t.last_used ? esc(W.ago ? W.ago(t.last_used) : t.last_used) : '<span class="muted">never</span>') + "</td><td>" + t.uses + '</td><td style="text-align:right"><button class="btn sm" data-rv="' + esc(t.id) + '">Revoke</button></td></tr>';
      }).join("") + "</tbody></table>" : '<p class="muted">No tokens yet. Create one to connect an AI app.</p>';
    }
    function loadLog() { api("mcp_log").then(function (r) { if (!r.ok) return; $("#mcp-log").innerHTML = r.log.length ? '<table class="tbl"><tbody>' + r.log.slice(0, 40).map(function (x) { return "<tr><td><small>" + esc(x.t) + "</small></td><td>" + esc(x.token) + "</td><td><code>" + esc(x.tool) + "</code></td><td>" + (x.ok ? '<span class="badge ok">ok</span>' : '<span class="badge warn" title="' + esc(x.note) + '">failed</span>') + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Nothing yet.</p>'; }); }
    api("mcp_tokens").then(function (r) { if (r.ok) list(r.tokens); }); loadLog();
    $("#mcp-list").onclick = function (e) { var x = e.target.closest("[data-rv]"); if (!x || !confirm("Revoke this token? The AI app using it stops working immediately.")) return; api("mcp_token_revoke", { id: x.dataset.rv }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Token revoked"); list(r.tokens); }); };
    $("#mcp-new").onclick = function () {
      var name = prompt("Name for this token (who / which app uses it):", "Claude – " + S.user.name.split(" ")[0]); if (name === null) return;
      api("mcp_token_new", { name: name }).then(function (r) {
        if (!r.ok) return toast(r.error, true); list(r.tokens);
        W.modal('<h3>Copy your token</h3><p>This token is shown <b>only once</b>. Paste it into your AI app now.</p><code class="p8-code" id="mcp-tok">' + esc(r.token) + '</code><p class="muted" style="font-size:12px">Header: <code>Authorization: Bearer ' + esc(r.token) + '</code></p><div class="modal-actions"><button class="btn pri" id="mcp-cp">' + ic("copy") + 'Copy token</button><button class="btn" onclick="WXA.closeModal()">Done</button></div>');
        var cp = document.getElementById("mcp-cp"); if (cp) cp.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(r.token) : Promise.reject()).then(function () { toast("Copied"); }, function () { toast("Select the token and copy it", true); }); };
      });
    };
  }
})();
