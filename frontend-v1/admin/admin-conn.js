/* Woodex Admin — P36 "Add connector" gallery on Settings → Integrations.
   Tabs: Featured · Business · Social & Entertainment · Productivity · See all, plus "Add any app" (custom).
   Saves through conn_* actions; secrets are write-only (only the last 4 characters come back). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, api = W.api;
  var META_HELP = "In Meta Business Suite → Settings → Business assets, copy the Page ID. Create a Page access token at developers.facebook.com → your app → Tools → Graph API Explorer.";
  // id, name, tabs, short text, colour, account label, secret label, help
  var GDRIVE_SCRIPT = "const KEY = 'MY-KEY'; // same password as in Woodex Admin\n\nfunction doPost(e) {\n  const d = JSON.parse(e.postData.contents);\n  if (d.key !== KEY) return out({ ok: false, error: 'wrong script key' });\n  const blob = Utilities.newBlob(Utilities.base64Decode(d.data), 'application/zip', d.name);\n  const file = DriveApp.getFolderById(d.folder).createFile(blob);\n  return out({ ok: true, id: file.getId() });\n}\n\nfunction out(o) {\n  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);\n}";
  var CAT = [
    ["facebook", "Facebook Pages", "fs", "Post updates and read comments on your Facebook Page.", "#1877f2", "Page ID", "Page access token", META_HELP],
    ["messenger", "Messenger", "fs", "Reply to Facebook Messenger chats from the admin inbox.", "#0084ff", "Page ID", "Page access token", META_HELP],
    ["instagram", "Instagram Messages", "fs", "Answer Instagram DMs and story replies in one place.", "#e1306c", "Instagram business account ID", "Page access token", "Your Instagram must be a Business account linked to the Facebook Page. " + META_HELP],
    ["threads", "Threads", "fs", "Share new projects and articles to Threads.", "#000000", "Threads user ID", "Threads access token", "Create a Threads app at developers.facebook.com → Use cases → Access the Threads API, then generate a user token."],
    ["gbp", "Google Business Profile", "fb", "Keep hours, photos and posts on Google Maps up to date.", "#4285f4", "Business profile name or ID", "API key (optional)", "Open business.google.com and copy the profile name. API access needs an approved Google Cloud project."],
    ["gmail", "Gmail", "fp", "Send quotations and replies from woodexinterior.pk@gmail.com.", "#ea4335", "Gmail address", "App password (16 letters)", "Google Account → Security → 2-Step Verification (turn on) → App passwords. Create one called Woodex Admin, paste the 16 letters, then press Test."],
    ["slack", "Slack", "fp", "Post new enquiries to a team channel.", "#4a154b", "Channel name", "Incoming webhook URL", "api.slack.com/apps → Create app → Incoming Webhooks → Add to channel. Paste the webhook URL."],
    ["tiktok", "TikTok", "s", "Link your TikTok for project reels.", "#010101", "TikTok username", "Access token (optional)", "Add the username so it shows on the site. Posting needs a TikTok developer app."],
    ["youtube", "YouTube", "s", "Show project walkthrough videos.", "#ff0000", "Channel ID or @handle", "API key (optional)", "YouTube Studio → Settings → Channel → Advanced settings shows the channel ID."],
    ["linkedin", "LinkedIn Page", "sb", "Share company news on LinkedIn.", "#0a66c2", "Company page URL", "Access token (optional)", "Paste your company page address. Posting needs a LinkedIn developer app."],
    ["pinterest", "Pinterest", "s", "Pin project photos to mood boards.", "#e60023", "Pinterest username", "Access token (optional)", "developers.pinterest.com → My apps → generate a token."],
    ["x", "X (Twitter)", "s", "Share new articles on X.", "#000000", "@handle", "API bearer token (optional)", "developer.x.com → Projects & Apps → Keys and tokens."],
    ["hubspot", "HubSpot CRM", "b", "Copy new leads into HubSpot.", "#ff7a59", "Portal ID", "Private app token", "HubSpot → Settings → Integrations → Private apps → Create, then copy the token."],
    ["zoho", "Zoho CRM", "b", "Copy new leads into Zoho CRM.", "#e42527", "Organisation ID", "Client secret / token", "api-console.zoho.com → Self client → generate a code."],
    ["calendly", "Calendly", "bp", "Let clients book site visits.", "#006bff", "Booking page URL", "Personal access token (optional)", "Calendly → Integrations → API & webhooks."],
    ["gcal", "Google Calendar", "p", "Add site visits to the team calendar.", "#1a73e8", "Calendar ID", "API key (optional)", "Google Calendar → Settings → your calendar → Integrate calendar → Calendar ID."],
    ["gdrive", "Google Drive", "fp", "Daily off-site backup of the website + database into your Google Drive folder.", "#0f9d58", "Folder link (https://drive.google.com/drive/folders/…)", "Script key (any password you choose)", "1) Create a folder in Google Drive and copy its link. 2) Open script.google.com → New project → paste the code shown below → change MY-KEY to your own password → Save. 3) Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy → allow access → copy the Web app URL. 4) Paste the folder link, the same password and the Web app URL here → Connect → Back up now."],
    ["github", "GitHub", "fp", "Keep a copy of the website code in a private GitHub repository.", "#24292f", "Repository (owner/name)", "Personal access token", "Daily off-site backup goes to backups/ in this repository. github.com → Settings → Developer settings → Fine-grained tokens → Generate. Pick only this repository, Contents: Read and write. Paste the token and owner/repo, then press Test."],
    ["notion", "Notion", "p", "Track projects in a Notion database.", "#000000", "Database ID", "Integration secret", "notion.so/my-integrations → New integration, then share the database with it."],
    ["trello", "Trello", "p", "Turn won leads into Trello cards.", "#0079bf", "Board ID", "API key + token", "trello.com/power-ups/admin → New → API key."],
    ["teams", "Microsoft Teams", "p", "Post enquiry alerts to a Teams channel.", "#5059c9", "Channel name", "Workflow webhook URL", "Teams channel → … → Workflows → Post to a channel when a webhook request is received."],
    ["zapier", "Zapier", "bp", "Connect 6,000+ apps with a webhook.", "#ff4f00", "Zap name", "Webhook URL", "zapier.com → Create Zap → Webhooks by Zapier → Catch hook. Paste the URL."],
    ["make", "Make", "bp", "Automate workflows with a Make scenario.", "#6d00cc", "Scenario name", "Webhook URL", "make.com → Create scenario → Webhooks → Custom webhook."],
    ["custom", "Any app (custom)", "", "Connect any service with an API key or webhook.", "#465fff", "Account / user ID", "API key, token or webhook URL", "Paste the details the other app gives you. Add a test address (https://…) to check it answers."]
  ];
  var FEAT = ["gmail", "gdrive", "github", "facebook", "messenger", "instagram", "gbp", "slack", "zapier"];
  var TABS = [["f", "Featured"], ["b", "Business"], ["s", "Social & Entertainment"], ["p", "Productivity"], ["all", "See all"]];
  var tab = "f", q = "", mine = null;
  function cat(id) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === id) return CAT[i]; return CAT[CAT.length - 1]; }
  function mono(c, big) { var t = c[0] === "x" ? "X" : c[1].replace(/\(.*\)/, "").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2); if (t.length < 2 && c[0] !== "x") t = c[1].slice(0, 2); return '<span class="cg-ic' + (big ? " big" : "") + '" style="--c:' + c[4] + '">' + esc(t) + "</span>"; }
  function list() {
    var rows = CAT.filter(function (c) {
      if (q) return (c[1] + " " + c[3]).toLowerCase().indexOf(q) > -1;
      if (c[0] === "custom") return false;
      if (tab === "all") return true;
      if (tab === "f") return FEAT.indexOf(c[0]) > -1;
      return c[2].indexOf(tab) > -1;
    });
    return rows;
  }
  function conOf(id) { return (mine || []).filter(function (m) { return m.key === id; })[0]; }
  function draw() {
    var el = document.getElementById("cg"); if (!el) return;
    var my = (mine || []).map(function (m) { var c = cat(m.key), st = m.status === "connected" ? ["ok", "Connected"] : m.status === "error" ? ["bad", "Check failed"] : ["", "Needs details"];
      return '<div class="cg-my">' + mono(m.key === "custom" ? [0, m.name, 0, 0, c[4]] : c) + '<div><b>' + esc(m.name) + '</b><small>' + esc(m.account || m.cat) + (m.hasSecret ? " · key ••••" + esc(m.hint || "") : "") + "</small></div>" +
        '<span class="badge ' + st[0] + '">' + st[1] + '</span><button class="btn sm" data-ed="' + m.id + '">Manage</button></div>'; }).join("");
    var tiles = list().map(function (c) { var m = conOf(c[0]);
      return '<div class="cg-t">' + mono(c) + '<div class="cg-tx"><b>' + esc(c[1]) + "</b><small>" + esc(c[3]) + "</small></div>" +
        (m ? '<button class="btn sm" data-ed="' + m.id + '">' + (m.status === "connected" ? "✓ Connected" : "Finish setup") + "</button>" : '<button class="btn sm pri" data-add="' + c[0] + '">Connect</button>') + "</div>"; }).join("") || '<p class="muted">Nothing matches. Use “Add any app” below.</p>';
    el.innerHTML = '<div class="cg-head"><div><h3>Add connector</h3><p class="muted">Link social, business and productivity apps. Keys stay on your server.</p></div>' +
      '<div class="cg-tools"><input type="search" id="cg-q" placeholder="Search connectors" value="' + esc(q) + '"><button class="btn pri" data-add="custom">+ Add any app</button></div></div>' +
      (my ? '<div class="cg-mine"><h4>Your connectors</h4>' + my + "</div>" : "") +
      '<div class="cg-tabs" role="tablist">' + TABS.map(function (t) { return '<button role="tab" data-tab2="' + t[0] + '"' + (tab === t[0] && !q ? ' class="on"' : "") + ">" + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="cg-grid">' + tiles + "</div>";
    var s = document.getElementById("cg-q"); s.oninput = function () { q = s.value.trim().toLowerCase(); var p = s.selectionStart; draw(); var n = document.getElementById("cg-q"); n.focus(); n.setSelectionRange(p, p); };
  }
  function form(key, m) {
    var c = cat(key), cust = key === "custom" && !m;
    W.modal('<div class="cg-mod"><div class="cg-mh">' + mono(c, true) + "<div><h2>" + (m ? "Manage " : "Connect ") + esc(m ? m.name : c[1]) + '</h2><p class="muted">' + esc(c[3]) + "</p></div></div>" +
      '<div class="cg-help"><b>How to get the details</b><p>' + esc(c[7]) + "</p></div>" +
      (key === "custom" ? '<label>App name<input id="cf-n" maxlength="60" value="' + esc(m ? m.name : "") + '" placeholder="e.g. Daraz Seller Center"></label><label>Category<select id="cf-c">' + ["Business", "Social & Entertainment", "Productivity", "Custom"].map(function (x) { return "<option" + ((m ? m.cat : "Custom") === x ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" : "") +
      '<label>' + esc(c[5]) + '<input id="cf-a" maxlength="160" value="' + esc(m ? m.account || "" : "") + '"></label>' +
      (c[6] ? '<label>' + esc(c[6]) + '<input id="cf-s" type="password" autocomplete="new-password" placeholder="' + (m && m.hasSecret ? "Saved ••••" + esc(m.hint || "") + " — leave blank to keep" : "Paste here") + '"></label>' : "") +
      (key === "gdrive" ? '<details class="cg-code"><summary>Apps Script code (copy into script.google.com)</summary><pre>' + esc(GDRIVE_SCRIPT) + '</pre></details>' : "") +
      '<label>' + (key === "gdrive" ? "Apps Script Web app URL <small class=\"muted\">(https://script.google.com/macros/s/…/exec)</small>" : 'Test address <small class="muted">(optional, https://…)</small>') + '<input id="cf-u" maxlength="300" value="' + esc(m ? m.url || "" : "") + '"></label>' +
      (m && key === "gmail" ? '<div class="cg-x"><b>Gmail actions</b><div class="cg-xr"><input id="cf-to" type="email" placeholder="Send test to (default: this Gmail)"><button class="btn" id="cf-gs">Send test email</button><button class="btn" id="cf-gu">Use for all email alerts</button></div></div>' : "") +
      (m && (key === "github" || key === "gdrive") ? '<div class="cg-x"><b>Backups</b><p class="muted" style="margin:4px 0 8px">One automatic backup per day (cron), pages + database, no passwords or API keys.' + (m.lastPush ? " Last: " + new Date(m.lastPush * 1000).toLocaleString() + (m.pushOk ? " ✓" : " ✗") : "") + '</p><button class="btn" id="cf-bk">Back up now</button></div>' : "") +
      '<label>Notes<textarea id="cf-o" rows="2" maxlength="400">' + esc(m ? m.notes || "" : "") + "</textarea></label>" +
      (m && m.note ? '<p class="muted">Last check: ' + esc(m.note) + "</p>" : "") +
      '<div class="cg-act">' + (m ? '<button class="btn" id="cf-del" style="color:#d92d20">Remove</button><button class="btn" id="cf-t">Test</button>' : "") + '<span style="flex:1"></span><button class="btn" id="cf-x">Cancel</button><button class="btn pri" id="cf-ok">' + (m ? "Save" : "Connect") + "</button></div></div>");
    var g = function (i) { var e = document.getElementById(i); return e ? e.value : ""; };
    document.getElementById("cf-x").onclick = W.closeModal;
    document.getElementById("cf-ok").onclick = function () { var b = this; b.disabled = true;
      api("conn_save", { id: m ? m.id : "", key: key, name: key === "custom" ? g("cf-n") : c[1], cat: key === "custom" ? g("cf-c") : TABS.filter(function (t) { return c[2].indexOf(t[0]) > -1 && t[0] !== "f"; }).map(function (t) { return t[1]; })[0] || "Custom", account: g("cf-a"), secret: g("cf-s"), url: g("cf-u"), notes: g("cf-o") })
        .then(function (r) { b.disabled = false; if (!r.ok) return W.toast(r.error, true); mine = r.items; W.closeModal(); W.toast((r.item.name) + (r.item.status === "connected" ? " connected" : " saved")); draw(); }); };
    if (m) {
      document.getElementById("cf-t").onclick = function () { var b = this; b.disabled = true; b.textContent = "Testing…"; api("conn_test", { id: m.id }).then(function (r) { b.disabled = false; b.textContent = "Test"; if (!r.ok) return W.toast(r.error, true); mine = r.items; W.toast(r.message, !r.pass); draw(); }); };
      var act = function (id, action, extra, busy) { var b = document.getElementById(id); if (!b) return; b.onclick = function () { var t = b.textContent; b.disabled = true; b.textContent = busy; api(action, Object.assign({ id: m.id }, extra ? extra() : {})).then(function (r) { b.disabled = false; b.textContent = t; if (!r.ok) return W.toast(r.error, true); if (r.items) mine = r.items; W.toast(r.message, r.pass === false); }); }; };
      act("cf-gs", "conn_gmail_send", function () { return { to: g("cf-to") }; }, "Sending…");
      act("cf-gu", "conn_gmail_use", null, "Saving…");
      act("cf-bk", "conn_push", null, "Uploading…");
      document.getElementById("cf-del").onclick = function () { if (!confirm("Remove " + m.name + "? Its saved key is deleted.")) return; api("conn_delete", { id: m.id }).then(function (r) { if (!r.ok) return W.toast(r.error, true); mine = r.items; W.closeModal(); W.toast("Removed"); draw(); }); };
    }
    void cust;
  }
  function mount(ig) {
    if (document.getElementById("cg")) return;
    var el = document.createElement("div"); el.id = "cg"; el.className = "card cg"; ig.parentNode.insertBefore(el, ig);
    el.onclick = function (e) { var t = e.target.closest("[data-tab2]"), a = e.target.closest("[data-add]"), ed = e.target.closest("[data-ed]");
      if (t) { tab = t.dataset.tab2; q = ""; draw(); }
      else if (a) form(a.dataset.add, null);
      else if (ed) { var m = (mine || []).filter(function (x) { return x.id === ed.dataset.ed; })[0]; if (m) form(m.key, m); } };
    draw();
    api("conn_list").then(function (r) { if (r.ok) { mine = r.items; draw(); } });
  }
  var st = document.createElement("style");
  st.textContent = ".cg-code{margin:10px 0;border:1px solid var(--line,#e4e7ec);border-radius:10px;padding:8px 12px}.cg-code pre{white-space:pre-wrap;font-size:12px;background:#0c1628;color:#f4efe7;padding:12px;border-radius:8px;margin:8px 0 0;user-select:all;display:block;height:auto!important;min-height:120px;max-height:300px;overflow:auto;flex:none}.cg-x{margin:12px 0;padding:12px;border:1px solid var(--line,#e4e7ec);border-radius:10px}.cg-xr{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.cg-xr input{flex:1;min-width:180px}" + ".cg{padding:20px;margin-bottom:22px}.cg-head{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start}.cg-head h3{margin:0 0 2px;font-size:17px}.cg-tools{display:flex;gap:8px;flex-wrap:wrap}.cg-tools input{min-width:200px;padding:8px 12px;border:1px solid var(--line,#e4e7ec);border-radius:10px}" +
    ".cg-tabs{display:flex;gap:4px;margin:16px 0 14px;border-bottom:1px solid var(--line,#e4e7ec);overflow-x:auto}.cg-tabs button{background:none;border:0;padding:9px 14px;font:inherit;font-weight:600;color:#667085;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}.cg-tabs button.on{color:#0c1628;border-color:#0c1628}" +
    ".cg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.cg-t{display:flex;gap:12px;align-items:center;padding:14px;border:1px solid var(--line,#e4e7ec);border-radius:14px;background:#fff;transition:.15s}.cg-t:hover{border-color:#b8956a;box-shadow:0 4px 14px rgba(12,22,40,.06)}.cg-tx{flex:1;min-width:0}.cg-tx b{display:block;font-size:14px}.cg-tx small{color:#667085;font-size:12px;line-height:1.35;display:block}" +
    ".cg-ic{flex:none;width:40px;height:40px;border-radius:11px;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px}.cg-ic.big{width:52px;height:52px;font-size:18px}" +
    ".cg-mine{margin-top:14px;display:grid;gap:8px}.cg-mine h4{margin:0;font-size:13px;color:#667085;text-transform:uppercase;letter-spacing:.06em}.cg-my{display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--line,#e4e7ec);border-radius:12px}.cg-my>div{flex:1;min-width:0}.cg-my small{display:block;color:#667085}.badge.bad{background:#fee4e2;color:#b42318}" +
    ".cg-mod label{display:block;margin:10px 0;font-weight:600;font-size:13px}.cg-mod input,.cg-mod select,.cg-mod textarea{display:block;width:100%;margin-top:4px;padding:9px 11px;border:1px solid var(--line,#e4e7ec);border-radius:10px;font:inherit;box-sizing:border-box}.cg-mh{display:flex;gap:14px;align-items:center}.cg-mh h2{margin:0}.cg-help{background:#f4efe7;border-radius:12px;padding:10px 14px;margin:14px 0;font-size:13px}.cg-help p{margin:4px 0 0}.cg-act{display:flex;gap:8px;margin-top:14px}" +
    "@media(max-width:600px){.cg-tools,.cg-tools input{width:100%}.cg-grid{grid-template-columns:1fr}}";
  document.head.appendChild(st);
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200);
    new MutationObserver(function () { var ig = document.getElementById("ig"); if (ig && W.can && W.can("owner,admin")) mount(ig); }).observe(v0.parentNode, { childList: true, subtree: true }); }
  boot();
})();
