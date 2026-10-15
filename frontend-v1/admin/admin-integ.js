/* Woodex Admin — P16 3.5 Integrations grid + API keys table (Flowbite-style).
   Wraps the existing Settings → Integrations cards (no logic rewritten): tiles with status + filters, click a tile to open its card, API keys overview. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, api = W.api;
  var META = {
    "in-wa": ["WhatsApp Cloud API", "Messaging", "Live chat, auto-replies and offers on WhatsApp.", "#25d366"],
    "in-mail": ["Email (SMTP)", "Messaging", "Enquiry alerts, login alerts and quotation emails.", "#465fff"],
    "in-gdata": ["Analytics & Search Console", "Google", "Visitors, searches and clicks on your dashboard.", "#f9ab00"],
    "in-trk": ["Tracking codes", "Google", "GA4, Tag Manager, Meta Pixel and Search Console tag.", "#ea4335"],
    "in-psi": ["Google PageSpeed", "Google", "Speed and SEO scores for every page.", "#34a853"],
    "in-ai": ["AI writing", "AI", "Blog drafts, SEO text, chat replies (Claude, OpenAI, OpenRouter, local).", "#7a5af8"],
    "in-sheets": ["Google Sheets", "Data", "New enquiries added as rows in your own sheet.", "#0f9d58"],
    "in-excel": ["Excel downloads", "Data", "Leads, clients, quotes and invoices as .xlsx files.", "#217346"],
    "in-ts": ["Cloudflare Turnstile", "Security", "Invisible spam protection for website forms.", "#f38020"]
  };
  var ORDER = ["in-wa", "in-mail", "in-gdata", "in-trk", "in-psi", "in-ai", "in-ts", "in-sheets", "in-excel"];
  var KEYS = [["in-ai", "AI provider key", "Blog, SEO, chat AI"], ["in-wa", "WhatsApp access token", "WhatsApp inbox & offers"], ["in-mail", "SMTP password", "All outgoing email"],
    ["in-gdata", "Google service-account key", "Analytics & Search Console"], ["in-psi", "PageSpeed API key", "Speed & Site health"], ["in-ts", "Turnstile secret key", "Form spam check"]];
  var filt = "all", open = null;

  function isOn(card) {
    var t = card.textContent;
    if (/Not connected|No key|\bOff\b/.test(card.querySelector(".card-h") ? card.querySelector(".card-h").textContent : "") && !card.querySelector(".card-b .badge.ok")) return false;
    if (/Not connected/.test(t)) return false;
    return !!card.querySelector(".badge.ok");
  }
  function enhance(grid) {
    if (grid.dataset.ig) return; grid.dataset.ig = "1";
    var box = document.createElement("div"); box.id = "ig"; grid.parentNode.insertBefore(box, grid);
    var keys = document.createElement("div"); keys.id = "ig-keys"; grid.parentNode.insertBefore(keys, grid.nextSibling);
    grid.classList.add("ig-cards");
    draw(grid);
    // late cards (Google, WhatsApp) are added by other modules → redraw when the grid changes
    var t; new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { draw(grid); }, 120); }).observe(grid, { childList: true, subtree: true, characterData: true });
  }
  function cards(grid) { return ORDER.map(function (id) { return document.getElementById(id); }).filter(Boolean); }
  function draw(grid) {
    var box = document.getElementById("ig"); if (!box) return;
    var cs = cards(grid), on = cs.filter(isOn).length;
    var tile = function (c) {
      var m = META[c.id], ok = isOn(c), svg = c.querySelector(".card-h h3 svg");
      if (filt === "on" && !ok || filt === "off" && ok) return "";
      return '<button type="button" class="ig-tile' + (open === c.id ? " sel" : "") + '" data-o="' + c.id + '"><span class="ig-ic" style="--c:' + m[3] + '">' + (svg ? svg.outerHTML : "") + '</span><span class="ig-cat">' + m[1] + "</span><b>" + m[0] + "</b><small>" + m[2] + '</small><span class="ig-st ' + (ok ? "on" : "") + '"><i></i>' + (ok ? "Connected" : "Not set up") + '</span><span class="ig-go">' + (ok ? "Manage" : "Connect") + " →</span></button>";
    };
    box.innerHTML = '<div class="ig-head"><div><h3>Integrations</h3><p class="muted">' + on + " of " + cs.length + ' connected · all free except AI usage</p></div><div class="seg" id="ig-f">' +
      [["all", "All"], ["on", "Connected"], ["off", "Needs setup"]].map(function (x) { return '<button data-f="' + x[0] + '"' + (filt === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="ig-grid">' + cs.map(tile).join("") +
      '<button type="button" class="ig-tile" data-tab="connections"><span class="ig-ic" style="--c:#0c1628">' + ic("key") + '</span><span class="ig-cat">Sign-in & agents</span><b>Google sign-in · AI agents (MCP)</b><small>Sign in with Google and connect Claude/ChatGPT to your admin.</small><span class="ig-st"><i></i>See Connections</span><span class="ig-go">Open →</span></button></div>' +
      (open ? '<div class="ig-back"><button type="button" class="btn sm" id="ig-all">← All integrations</button><b>' + esc(META[open][0]) + "</b></div>" : "");
    grid.classList.toggle("ig-one", !!open);
    cs.forEach(function (c) { c.classList.toggle("ig-show", c.id === open); });
    grid.hidden = !open;
    W.fillIcons && W.fillIcons(box);
    box.onclick = function (e) {
      var f = e.target.closest("[data-f]"), o = e.target.closest("[data-o]"), tb = e.target.closest("[data-tab]");
      if (f) { filt = f.dataset.f; draw(grid); }
      else if (o) { open = o.dataset.o; draw(grid); grid.scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (tb) { var b = document.querySelector('#st-tabs [data-t="' + tb.dataset.tab + '"]'); if (b) b.click(); }
      else if (e.target.id === "ig-all") { open = null; draw(grid); box.scrollIntoView({ block: "start" }); }
    };
    keysTable(cs);
  }
  var mcp = null;
  function keysTable(cs) {
    var el = document.getElementById("ig-keys"); if (!el || open) { if (el) el.hidden = !!open; return; } el.hidden = false;
    var byId = {}; cs.forEach(function (c) { byId[c.id] = c; });
    var rows = KEYS.filter(function (k) { return byId[k[0]]; }).map(function (k) { var ok = isOn(byId[k[0]]);
      return "<tr><td><b>" + k[1] + "</b></td><td>" + k[2] + '</td><td><span class="badge ' + (ok ? "ok" : "") + '">' + (ok ? "Saved" : "Not set") + '</span></td><td class="muted">Server only · never shown again</td><td style="text-align:right"><button class="btn sm" data-o="' + k[0] + '">' + (ok ? "Replace" : "Add") + "</button></td></tr>"; });
    (mcp || []).forEach(function (t) { rows.push('<tr class="' + (t.off ? "ig-off" : "") + '"><td><b>' + esc(t.name) + '</b><br><code class="ig-hint">wxmcp_••••••' + esc(t.hint) + '</code></td><td>AI agent (MCP) access<br><small class="muted">by ' + esc(t.user || "") + " · " + esc(String(t.created_at || "").slice(0, 10)) + '</small></td><td><label class="switch" title="' + (t.off ? "Switched off: calls are refused" : "On") + '"><input type="checkbox" data-tog="' + esc(t.id) + '"' + (t.off ? "" : " checked") + '><span></span></label></td><td class="muted">' + (t.last_used ? "Last used " + esc(String(t.last_used).slice(0, 16)) : "Never used") + " · " + (+t.uses || 0) + ' calls</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-cpu title="Copy the connector address">' + ic("copy") + 'Copy URL</button> <button class="btn sm" data-regen="' + esc(t.id) + '" title="Make a new secret; the old one stops working">' + ic("refresh-cw") + 'Regenerate</button> <button class="btn sm danger" data-rev="' + esc(t.id) + '" title="Delete this token">Revoke</button></td></tr>'); });
    el.innerHTML = '<div class="card" style="margin-top:22px"><div class="card-h"><div><h3>' + ic("key") + ' API keys & tokens</h3><small class="muted">Every secret the admin stores. Values are kept on the server and never sent back to the browser.</small></div><button class="btn sm pri" id="ig-newtok">' + ic("plus") + 'New access token</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Key</th><th>Used for</th><th>Status</th><th>Storage</th><th></th></tr></thead><tbody>' + rows.join("") + "</tbody></table></div></div>";
    W.fillIcons && W.fillIcons(el);
    el.onchange = function (e) { var x = e.target.closest("[data-tog]"); if (!x) return; x.disabled = true; api("mcp_token_toggle", { id: x.dataset.tog, on: x.checked }).then(function (r) { if (!r.ok) { W.toast(r.error, true); x.checked = !x.checked; x.disabled = false; return; } mcp = r.tokens; W.toast(x.checked ? "Token switched on" : "Token switched off: AI agents using it are refused"); keysTable(cards()); }); };
    function showOnce(tok, title) {
      W.modal("<h2>" + esc(title) + '</h2><p class="muted">Copy it now. For your safety it is <b>shown only once</b>; only the last 4 characters are kept.</p><div class="ig-once"><code id="ig-tok">' + esc(tok) + '</code><button class="btn pri" id="ig-cp">' + ic("copy") + 'Copy</button></div><p class="muted" style="font-size:13px;margin-top:14px">Connector address: <code>' + esc(location.origin) + '/api/mcp.php</code><br>Send it as <code>Authorization: Bearer &lt;token&gt;</code>.</p><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="ig-done">I saved it</button></div>');
      W.fillIcons && W.fillIcons(document.getElementById("modal-card") || document.body);
      document.getElementById("ig-cp").onclick = function () { var b = this; copyTxt(tok).then(function () { b.lastChild.textContent = "Copied ✓"; }); };
      document.getElementById("ig-done").onclick = W.closeModal;
    }
    function copyTxt(t) { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t); var a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (x) {} a.remove(); return Promise.resolve(); }
    el.onclick = function (e) { var o = e.target.closest("[data-o]"), tb = e.target.closest("[data-tab]"), box = document.getElementById("ig");
      var rg = e.target.closest("[data-regen]"), rv = e.target.closest("[data-rev]");
      if (e.target.closest("[data-cpu]")) { copyTxt(location.origin + "/api/mcp.php").then(function () { W.toast("Connector address copied"); }); return; }
      if (e.target.closest("#ig-newtok")) { var nm = prompt("Name for this token (e.g. Claude desktop, ChatGPT)", "AI agent"); if (!nm) return; api("mcp_token_new", { name: nm }).then(function (r) { if (!r.ok) return W.toast(r.error, true); mcp = r.tokens; keysTable(cards()); showOnce(r.token, "New access token"); }); return; }
      if (rg) { if (!confirm("Regenerate this token? The old secret stops working straight away, so update it in your AI app.")) return; api("mcp_token_regen", { id: rg.dataset.regen }).then(function (r) { if (!r.ok) return W.toast(r.error, true); mcp = r.tokens; keysTable(cards()); showOnce(r.token, "New secret for this token"); }); return; }
      if (rv) { if (!confirm("Revoke (delete) this token? Apps using it lose access.")) return; api("mcp_token_revoke", { id: rv.dataset.rev }).then(function (r) { if (!r.ok) return W.toast(r.error, true); mcp = r.tokens; W.toast("Token revoked"); keysTable(cards()); }); return; }
      if (o) { open = o.dataset.o; draw(document.querySelector(".ig-cards")); box.scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (tb) { var b = document.querySelector('#st-tabs [data-t="' + tb.dataset.tab + '"]'); if (b) b.click(); } };
    if (mcp === null && W.can && W.can("owner,admin")) { mcp = []; api("mcp_tokens").then(function (r) { if (r.ok) { mcp = r.tokens; keysTable(cards()); } }); }
  }
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200); var v = v0.parentNode; /* stable parent: #view is replaced on every screen change */
    new MutationObserver(function () { var g = document.querySelector("#view .st-grid:not([data-ig])"); if (g && document.getElementById("in-mail")) { open = null; mcp = null; enhance(g); } }).observe(v, { childList: true, subtree: true }); }
  boot();
})();
