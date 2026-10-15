/* Woodex Admin — P40 Part E: Social media planner (Facebook Page + Instagram).
   Planner (week calendar + list), composer with AI captions and Media library picker, Settings. API: soc_* (api/social-lib.php). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, toast = W.toast, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  var css = document.createElement("style");
  css.textContent = ".so-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}@media(max-width:900px){.so-wk{grid-template-columns:1fr}}" +
    ".so-day{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;min-height:150px}.so-day h5{margin:0 0 6px;font-size:12px;color:var(--mut);font-weight:600}.so-day.today{border-color:#b8956a;box-shadow:0 0 0 1px #b8956a inset}" +
    ".so-c{display:block;width:100%;text-align:left;border:1px solid var(--line);background:var(--bg,#f8f9fb);border-radius:9px;padding:6px;margin-bottom:6px;cursor:pointer;font:inherit;font-size:12px;color:inherit}.so-c img{width:100%;height:64px;object-fit:cover;border-radius:6px;margin-bottom:4px;display:block}.so-c b{font-size:11px}" +
    ".so-n{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 5px;margin-right:3px;color:#fff}.so-n.fb{background:#1877f2}.so-n.ig{background:#c13584}.so-n.li{background:#0a66c2}.so-n.gb{background:#34a853}" +
    ".so-st{font-size:11px;border-radius:99px;padding:2px 8px;background:#eef1f5}.so-st.scheduled{background:#fff4e0;color:#8a5a00}.so-st.published{background:#e7f6ec;color:#11692f}.so-st.failed,.so-st.partial{background:#fdecea;color:#b42318}" +
    ".so-m{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:18px}@media(max-width:900px){.so-m{grid-template-columns:1fr}}" +
    ".so-pv{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;color:#111;font-size:13.5px}.so-pv .h{display:flex;gap:8px;align-items:center;padding:10px}.so-pv .h i{width:30px;height:30px;border-radius:50%;background:#0c1628;color:#fff;display:grid;place-items:center;font-style:normal;font-weight:700}.so-pv img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#eee}.so-pv p{white-space:pre-wrap;margin:0;padding:10px;line-height:1.45}" +
    ".so-guide{margin:12px 0 0;padding-left:18px;font-size:12.5px;line-height:1.6;color:var(--mut)}" + ".so-opt{border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0;font-size:13px;white-space:pre-wrap;cursor:pointer}.so-opt:hover{border-color:#b8956a}" +
    ".so-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:52vh;overflow:auto}.so-g button{border:2px solid transparent;padding:0;border-radius:8px;overflow:hidden;cursor:pointer;background:#eee}.so-g button:hover{border-color:#b8956a}.so-g img{width:100%;height:90px;object-fit:cover;display:block}.so-g small{display:block;font-size:10px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}";
  css.textContent += ".so-ub{display:inline-block;min-width:18px;padding:0 5px;border-radius:99px;background:#d92d20;color:#fff;font-size:11px;line-height:18px;margin-left:4px}" +
    ".so-cm{padding:12px 16px;border-bottom:1px solid var(--line)}.so-cm:last-child{border-bottom:0}.so-cm.new{background:#fffaf0;box-shadow:3px 0 0 #b8956a inset}.so-cm-h{display:flex;gap:6px;align-items:center;font-size:13px;flex-wrap:wrap}.so-cm-t{margin:6px 0;font-size:14px;white-space:pre-wrap}" +
    ".so-cm-r{font-size:13px;color:var(--mut);background:var(--bg,#f8f9fb);border-radius:8px;padding:6px 10px}.so-cm-r svg{width:13px;height:13px;vertical-align:-2px}.so-cm-f textarea{width:100%;margin:4px 0 6px}.so-cm-f .toolbar{justify-content:flex-end}";
  document.head.appendChild(css);
  var D = null, wk = 0, tab = "plan";
  var NET = { fb: "Facebook", ig: "Instagram", li: "LinkedIn", gb: "Google Business" }, STL = { draft: "Draft", scheduled: "Scheduled", published: "Published", partial: "Partly published", failed: "Failed" };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function nice(s) { if (!s) return ""; var d = new Date(s.replace(" ", "T")), h = d.getHours(); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + ((h % 12) || 12) + ":" + pad(d.getMinutes()) + (h < 12 ? " am" : " pm"); }
  function nets(p) { return p.nets.map(function (n) { return '<span class="so-n ' + n + '">' + ({ fb: "FB", ig: "IG", li: "IN", gb: "G" }[n] || n) + "</span>"; }).join(""); }

  V.social = function (el) {
    el.innerHTML = W.head("Social media", "Marketing / Social media", '<button class="btn pri" id="so-new">' + ic("plus") + "New post</button>") +
      '<div class="tabs" id="so-tabs" style="margin-bottom:14px"><button data-t="plan">Planner</button><button data-t="list">All posts</button><button data-t="com">Comments <span class="so-ub" id="so-ub"></span></button><button data-t="set">Settings</button></div><div id="so-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    $("#so-new").onclick = function () { compose(); };
    $$("#so-tabs button").forEach(function (b) { b.onclick = function () { tab = b.dataset.t; draw(); }; });
    W.fillIcons(el); load();
  };
  function load() { api("soc_get").then(function (r) { var b = $("#so-b"); if (!b) return; if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; } D = r; draw(); }); }
  function draw() {
    var b = $("#so-b"); if (!b || !D) return; $$("#so-tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.t === tab); });
    var banner = D.connected ? "" : '<div class="banner" style="margin-bottom:14px">' + ic("info") + ' No social account is connected yet. You can plan and write posts now; they publish after you connect in <a href="#" id="so-goset">Settings</a>.</div>';
    var ub = $("#so-ub"); if (ub) { ub.textContent = D.unread || ""; ub.style.display = D.unread ? "" : "none"; }
    if (tab === "com") b.innerHTML = banner + comments(); else if (tab === "set") b.innerHTML = settings(); else if (tab === "list") b.innerHTML = banner + list(); else b.innerHTML = banner + plan();
    W.fillIcons(b); bind(b);
  }
  function plan() {
    var now = new Date(), s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + wk * 7), days = [];
    for (var i = 0; i < 7; i++) { var d = new Date(s); d.setDate(s.getDate() + i); days.push(d); }
    var by = {}; D.posts.forEach(function (p) { var k = (p.when || p.published_at || "").slice(0, 10); if (k) (by[k] = by[k] || []).push(p); });
    var drafts = D.posts.filter(function (p) { return p.status === "draft" && !p.when; });
    var sched = D.posts.filter(function (p) { return p.status === "scheduled"; }).length, pub = D.posts.filter(function (p) { return p.status === "published"; }).length;
    return '<div class="toolbar" style="margin-bottom:10px;align-items:center"><button class="btn sm" data-wk="-1">‹ Previous</button><button class="btn sm" data-wk="0">This week</button><button class="btn sm" data-wk="1">Next ›</button><span class="muted" style="margin-left:8px">' +
      days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " – " + days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + '</span><span class="muted" style="margin-left:auto;font-size:12.5px">' + sched + " scheduled · " + pub + " published · " + drafts.length + " drafts</span></div>" +
      '<div class="so-wk">' + days.map(function (d) { var k = ymd(d), L = (by[k] || []).sort(function (a, b) { return String(a.when).localeCompare(String(b.when)); });
        return '<div class="so-day' + (k === ymd(now) ? " today" : "") + '"><h5>' + d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }) + "</h5>" + L.map(card).join("") + '<button class="btn sm" data-add="' + k + '" style="width:100%;justify-content:center;opacity:.7">+</button></div>'; }).join("") + "</div>" +
      (drafts.length ? '<div class="card" style="margin-top:14px"><div class="card-h"><h3>Drafts (no date yet)</h3></div><div class="card-b" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">' + drafts.map(card).join("") + "</div></div>" : "");
  }
  function card(p) { var t = (p.when || p.published_at || "").slice(11, 16); return '<button class="so-c" data-ed="' + p.id + '">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : "") + nets(p) + ' <span class="so-st ' + p.status + '">' + STL[p.status] + "</span>" + (t ? " <b>" + t + "</b>" : "") + '<div style="margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + esc(p.title || p.text) + "</div></button>"; }
  function list() {
    if (!D.posts.length) return '<div class="card"><div class="empty">No posts yet. Click <b>New post</b> to write your first one; the AI can draft the caption.</div></div>';
    return '<div class="card"><table class="tbl"><thead><tr><th></th><th>Post</th><th>Where</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>' + D.posts.map(function (p) {
      return "<tr><td style='width:56px'>" + (p.image ? '<img src="' + esc(p.image) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px">' : "") + "</td><td style='max-width:420px'><b>" + esc(p.title || p.text.slice(0, 60)) + "</b><div class='muted' style='font-size:12px'>by " + esc(p.by || "") + "</div>" + (p.error ? "<div style='color:#b42318;font-size:12px'>" + esc(p.error) + "</div>" : "") + "</td><td>" + nets(p) + "</td><td>" + esc(nice(p.published_at || p.when) || "—") + "</td><td><span class='so-st " + p.status + "'>" + STL[p.status] + "</span></td><td style='white-space:nowrap'><button class='btn sm' data-ed='" + p.id + "'>Open</button> <button class='btn sm' data-dup='" + p.id + "'>Duplicate</button></td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function comments() {
    var L = D.comments || [];
    var head = '<div class="toolbar" style="margin-bottom:12px;align-items:center"><span class="muted" style="font-size:13px">' + (D.commentsAt ? "Last checked " + nice(D.commentsAt) + " · checks every 15 minutes" : "Comments on posts published from here (last 30 days)") + '</span><span style="flex:1"></span>' +
      (D.unread ? '<button class="btn" id="cm-all">' + ic("check") + "Mark all read</button>" : "") + '<button class="btn pri" id="cm-sync"' + (D.connected ? "" : " disabled") + ">" + ic("inbox") + "Check now</button></div>";
    if (!L.length) return head + '<div class="card"><div class="empty">No comments yet. When people comment on your Facebook or Instagram posts, they appear here and you can reply without leaving the admin.</div></div>';
    return head + '<div class="card">' + L.map(function (c) {
      return '<div class="so-cm' + (c.read ? "" : " new") + '" data-cm="' + esc(c.id) + '"><div class="so-cm-h">' + nets({ nets: [c.net] }) + "<b>" + esc(c.name) + '</b><span class="muted"> on ' + esc(c.postTitle) + '</span><span style="flex:1"></span><small class="muted">' + nice(c.t) + "</small></div>" +
        '<div class="so-cm-t">' + esc(c.text) + "</div>" +
        (c.reply ? '<div class="so-cm-r">' + ic("send") + " <b>" + esc(c.replyBy || "You") + ":</b> " + esc(c.reply) + "</div>" :
          '<div class="so-cm-f"><textarea rows="2" placeholder="Write a reply…"></textarea><div class="toolbar"><button class="btn" data-cai>' + ic("sparkles") + 'Suggest reply</button><button class="btn pri" data-csend>' + ic("send") + "Reply</button></div></div>") + "</div>";
    }).join("") + "</div>";
  }
  function settings() {
    var c = D.cfg;
    return '<div class="so-m"><div class="card"><div class="card-h"><h3>Connect Facebook &amp; Instagram</h3>' + (D.connected ? '<span class="badge ok">Connected</span>' : '<span class="badge warn">Not connected</span>') + '</div><div class="card-b">' +
      '<label>Facebook Page ID<input id="ss-p" value="' + esc(c.pageId) + '" placeholder="e.g. 102345678901234"></label><label>Instagram Business account ID <small class="muted">(optional)</small><input id="ss-i" value="' + esc(c.igId) + '" placeholder="e.g. 17841400000000000"></label>' +
      '<label>Page access token' + (c.tokenSet ? ' <small class="muted">(saved; leave empty to keep)</small>' : "") + '<input id="ss-t" type="password" autocomplete="off" placeholder="' + (c.tokenSet ? "••••••••••" : "Paste the long-lived Page token") + '"></label>' +
      '<label>Hashtags always added by the AI<input id="ss-h" value="' + esc(c.tags) + '"></label>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ss-ad"' + (c.autoDraft !== false ? " checked" : "") + ' style="width:auto"> New articles and project stories become draft posts automatically</label>' +
      '<div class="toolbar" style="justify-content:flex-end"><button class="btn" id="ss-clr"' + (c.tokenSet ? "" : " disabled") + '>Remove token</button><button class="btn pri" id="ss-sv">' + ic("check") + "Save</button></div></div></div>" +
      '<div class="card"><div class="card-h"><h3>How to connect (one time)</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.65"><ol style="margin:0;padding-left:18px">' +
      "<li>Your Instagram must be a <b>Business</b> account linked to the Woodex Facebook Page (Instagram app → Settings → Account type).</li>" +
      "<li>In the same Meta app used for WhatsApp (developers.facebook.com), add the permissions <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code>.</li>" +
      "<li>Open <b>Graph API Explorer</b>, choose your app and Page, generate a token, then exchange it for a <b>long-lived Page token</b> (Access Token Debugger → Extend).</li>" +
      "<li>Page ID: Facebook Page → About → Page transparency. Instagram ID: Graph API Explorer → <code>me/accounts?fields=instagram_business_account</code>.</li>" +
      "<li>Paste them here and save. Scheduled posts go out with the same cron job as WhatsApp (every 5 minutes).</li></ol>" +
      '<p class="muted" style="margin:10px 0 0">Instagram accepts <b>JPG</b> images only (not WebP). Use the original .jpg files in the Media library.</p></div></div></div>' +
      '<div class="so-m" style="margin-top:18px"><div class="card"><div class="card-h"><h3>LinkedIn company page</h3>' + (D.ready && D.ready.li ? '<span class="badge ok">Connected</span>' : '<span class="badge warn">Not connected</span>') + '</div><div class="card-b">' +
      '<label>Organization ID <small class="muted">(numbers only)</small><input id="sl-o" value="' + esc(c.liOrg || "") + '" placeholder="e.g. 98765432"></label>' +
      '<label>Access token' + (c.liTokenSet ? ' <small class="muted">(saved; leave empty to keep)</small>' : "") + '<input id="sl-t" type="password" autocomplete="off" placeholder="' + (c.liTokenSet ? "••••••••••" : "Paste the LinkedIn token") + '"></label>' +
      '<div class="toolbar" style="justify-content:flex-end"><button class="btn pri" id="sl-sv">' + ic("check") + "Save LinkedIn</button></div>" +
      '<ol class="so-guide"><li>Go to <b>linkedin.com/developers</b> → Create app → link it to the <b>Woodex Interior</b> company page (a page admin approves).</li><li>Products tab: add <b>Community Management API</b> (scope <code>w_organization_social</code>).</li><li>Auth tab → <b>OAuth 2.0 tools</b> → create a token with <code>w_organization_social</code>, paste it here.</li><li>Organization ID: the number in your page admin URL <code>linkedin.com/company/<b>98765432</b>/admin</code>.</li><li>Tokens last <b>60 days</b>. The post will show an error when it expires; paste a new one.</li></ol></div></div>' +
      '<div class="card"><div class="card-h"><h3>Google Business Profile</h3>' + (D.ready && D.ready.gb ? '<span class="badge ok">Connected</span>' : '<span class="badge warn">Not connected</span>') + '</div><div class="card-b">' +
      '<label>Account ID<input id="sg-a" value="' + esc(c.gAcc || "") + '" placeholder="e.g. 112233445566778899"></label><label>Location ID<input id="sg-l" value="' + esc(c.gLoc || "") + '" placeholder="e.g. 1234567890123456789"></label>' +
      '<label>OAuth client ID<input id="sg-c" value="' + esc(c.gClient || "") + '" placeholder="…apps.googleusercontent.com"></label>' +
      '<label>Client secret' + (c.gSecretSet ? ' <small class="muted">(saved)</small>' : "") + '<input id="sg-s" type="password" autocomplete="off" placeholder="' + (c.gSecretSet ? "••••••••" : "GOCSPX-…") + '"></label>' +
      '<label>Refresh token' + (c.gRefreshSet ? ' <small class="muted">(saved)</small>' : "") + '<input id="sg-r" type="password" autocomplete="off" placeholder="' + (c.gRefreshSet ? "••••••••" : "1//0…") + '"></label>' +
      '<div class="toolbar" style="justify-content:flex-end"><button class="btn pri" id="sg-sv">' + ic("check") + "Save Google</button></div>" +
      '<ol class="so-guide"><li>In <b>Google Cloud Console</b> (same project as Search Console), enable <b>Google My Business API</b>. Google must approve access: request it with the GBP API access form (usually a few days).</li><li>Credentials → <b>OAuth client ID</b> (Web app), add <code>https://developers.google.com/oauthplayground</code> as redirect URI.</li><li>In <b>OAuth Playground</b> (settings ⚙ → use your own client), authorise <code>https://www.googleapis.com/auth/business.manage</code>, exchange for tokens and copy the <b>refresh token</b>.</li><li>Account and Location IDs: Playground → <code>GET mybusinessaccountmanagement.googleapis.com/v1/accounts</code> then <code>…/v1/accounts/ID/locations</code>.</li><li>Posts show on your Google Maps listing as "Updates". Hashtags are removed automatically.</li></ol></div></div></div>';
  }
  function bind(b) {
    var g = $("#so-goset", b); if (g) g.onclick = function (e) { e.preventDefault(); tab = "set"; draw(); };
    $$("[data-wk]", b).forEach(function (x) { x.onclick = function () { var v = +x.dataset.wk; wk = v === 0 ? 0 : wk + v; draw(); }; });
    $$("[data-add]", b).forEach(function (x) { x.onclick = function () { compose(null, x.dataset.add + " 11:00"); }; });
    $$("[data-ed]", b).forEach(function (x) { x.onclick = function () { compose(D.posts.filter(function (p) { return p.id === x.dataset.ed; })[0]); }; });
    $$("[data-dup]", b).forEach(function (x) { x.onclick = function () { var p = D.posts.filter(function (q) { return q.id === x.dataset.dup; })[0]; compose({ nets: p.nets, text: p.text, image: p.image, link: p.link, title: p.title, status: "draft", when: "" }); }; });
    if ($("#cm-sync", b)) $("#cm-sync").onclick = function () { var x = this; x.disabled = true; x.textContent = "Checking…"; api("soc_comments_sync").then(function (r) { if (!r.ok) { toast(r.error, true); x.disabled = false; return; } if (r.errors && r.errors.length) toast(r.errors[0], true); load(); }); };
    if ($("#cm-all", b)) $("#cm-all").onclick = function () { api("soc_comment_read", { all: true }).then(load); };
    $$("[data-cm]", b).forEach(function (row) {
      var id = row.dataset.cm, c = D.comments.filter(function (q) { return q.id === id; })[0];
      if (c && !c.read) row.addEventListener("click", function () { if (c.read) return; c.read = true; row.classList.remove("new"); D.unread = Math.max(0, (D.unread || 1) - 1); var ub = $("#so-ub"); if (ub) { ub.textContent = D.unread || ""; ub.style.display = D.unread ? "" : "none"; } api("soc_comment_read", { ids: [id] }); });
      var ai = $("[data-cai]", row), sd = $("[data-csend]", row), ta = $("textarea", row);
      if (ai) ai.onclick = function () { ai.disabled = true; api("soc_ai_reply", { id: id }).then(function (r) { ai.disabled = false; if (!r.ok) return toast(r.error, true); ta.value = r.text; ta.focus(); }); };
      if (sd) sd.onclick = function () { if (!ta.value.trim()) return toast("Write a reply first", true); sd.disabled = true; api("soc_comment_reply", { id: id, text: ta.value }).then(function (r) { sd.disabled = false; if (!r.ok) return toast(r.error, true); toast("Reply posted ✓"); load(); }); };
    });
    if ($("#sl-sv", b)) $("#sl-sv").onclick = function () { api("soc_cfg_save", { cfg: { liOrg: $("#sl-o").value, liToken: $("#sl-t").value } }).then(function (r) { if (r.pending) return toast("Sent to Master for approval"); if (!r.ok) return toast(r.error, true); toast("LinkedIn saved ✓"); load(); }); };
    if ($("#sg-sv", b)) $("#sg-sv").onclick = function () { api("soc_cfg_save", { cfg: { gAcc: $("#sg-a").value, gLoc: $("#sg-l").value, gClient: $("#sg-c").value, gSecret: $("#sg-s").value, gRefresh: $("#sg-r").value } }).then(function (r) { if (r.pending) return toast("Sent to Master for approval"); if (!r.ok) return toast(r.error, true); toast("Google saved ✓"); load(); }); };
    if ($("#ss-sv", b)) {
      $("#ss-sv").onclick = function () { api("soc_cfg_save", { cfg: { pageId: $("#ss-p").value, igId: $("#ss-i").value, token: $("#ss-t").value, tags: $("#ss-h").value, autoDraft: $("#ss-ad").checked } }).then(function (r) { if (r.pending) return toast("Sent to Master for approval"); if (!r.ok) return toast(r.error, true); toast("Saved ✓"); load(); }); };
      $("#ss-clr").onclick = function () { if (confirm("Remove the saved token? Scheduled posts will stop publishing.")) api("soc_cfg_save", { cfg: { clearToken: true } }).then(function (r) { if (r.ok) { toast("Token removed"); load(); } else toast(r.error || "Sent for approval", !r.pending); }); };
    }
  }
  function compose(p, when) {
    p = p || { id: "", nets: ["fb", "ig"], text: "", image: "", link: "", title: "", status: "draft", when: when || "" };
    var locked = p.status === "published" || p.status === "partial";
    W.modal('<h3>' + (p.id ? (locked ? "Published post" : "Edit post") : "New post") + '</h3><div class="so-m"><div>' +
      '<div style="display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap">' + ["fb", "ig", "li", "gb"].map(function (n) { return '<label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" data-net="' + n + '"' + (p.nets.indexOf(n) >= 0 ? " checked" : "") + (locked ? " disabled" : "") + "> " + NET[n] + "</label>"; }).join("") + "</div>" +
      '<label>Internal title <small class="muted">(only you see it)</small><input id="sc-ti" maxlength="80" value="' + esc(p.title || "") + '" placeholder="e.g. DHA office reveal"></label>' +
      (locked ? "" : '<details style="margin:4px 0 8px"' + (p.text ? "" : " open") + '><summary style="cursor:pointer;font-weight:600;font-size:13px">' + ic("sparkles") + ' Write it with AI</summary><div style="margin-top:6px"><textarea id="sc-top" rows="2" placeholder="What is the post about? e.g. Gulberg apartment lounge, warm oak and linen, opened up the layout for more light"></textarea><div class="toolbar"><button class="btn sm" id="sc-ai">' + ic("sparkles") + 'Draft 3 captions</button></div><div id="sc-opts"></div></div></details>') +
      '<label>Post text<textarea id="sc-tx" rows="7" maxlength="2200"' + (locked ? " readonly" : "") + ">" + esc(p.text) + '</textarea></label><div class="muted" style="font-size:12px;margin:-6px 0 8px" id="sc-cnt"></div>' +
      '<label>Image</label><div class="toolbar" style="margin-top:-4px"><input id="sc-im" value="' + esc(p.image || "") + '" placeholder="/assets/images/…jpg" style="flex:1;margin:0"' + (locked ? " readonly" : "") + ">" + (locked ? "" : '<button class="btn" id="sc-pick">' + ic("image") + "Media library</button>") + "</div>" +
      '<label style="margin-top:8px">Link <small class="muted">(Facebook only, optional)</small><input id="sc-ln" value="' + esc(p.link || "") + '" placeholder="https://woodex.com.pk/projects/…"' + (locked ? " readonly" : "") + "></label>" +
      (locked ? "" : '<label>Publish on <small class="muted">(leave empty to keep as draft)</small><input id="sc-wh" type="datetime-local" value="' + esc((p.when || "").replace(" ", "T").slice(0, 16)) + '"></label>') +
      (p.error ? '<div class="banner" style="margin-top:8px;color:#b42318">' + esc(p.error) + "</div>" : "") +
      '</div><div><div class="muted" style="font-size:12px;margin-bottom:6px">Preview</div><div class="so-pv"><div class="h"><i>W</i><div><b>Woodex Interior</b><div style="font-size:11px;color:#666" id="sc-pw">' + esc(nice(p.when) || "Draft") + '</div></div></div><img id="sc-pi" alt="" style="' + (p.image ? "" : "display:none") + '"><p id="sc-pt"></p></div></div></div>' +
      '<div class="modal-actions">' + (p.id ? '<button class="btn danger" id="sc-del" style="margin-right:auto">Delete</button>' : "") + '<button class="btn" id="sc-x">Close</button>' + (locked ? "" : '<button class="btn" id="sc-dr">Save draft</button><button class="btn" id="sc-sc">' + ic("clock") + 'Schedule</button><button class="btn pri" id="sc-now">' + ic("send") + "Publish now</button>") + "</div>", "wide");
    var pv = function () { var t = $("#sc-tx").value, im = $("#sc-im").value.trim(); $("#sc-pt").textContent = t || "Your caption appears here."; $("#sc-pi").style.display = im ? "" : "none"; if (im) $("#sc-pi").src = im; $("#sc-cnt").textContent = t.length + " / 2200 characters · " + (t.match(/#\w+/g) || []).length + " hashtags" + (/\.(webp|gif|svg)$/i.test(im) && $('[data-net="ig"]').checked ? " · ⚠ Instagram needs a JPG image" : ""); if ($("#sc-wh")) $("#sc-pw").textContent = $("#sc-wh").value ? nice($("#sc-wh").value.replace("T", " ")) : "Draft"; };
    pv(); ["#sc-tx", "#sc-im", "#sc-wh"].forEach(function (s) { if ($(s)) $(s).addEventListener("input", pv); }); $$("[data-net]").forEach(function (x) { x.onchange = pv; });
    $("#sc-x").onclick = W.closeModal;
    var get = function (status) { return { id: p.id, nets: $$("[data-net]").filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.net; }), title: $("#sc-ti").value, text: $("#sc-tx").value, image: $("#sc-im").value.trim(), link: $("#sc-ln").value.trim(), when: $("#sc-wh") ? $("#sc-wh").value.replace("T", " ") : "", status: status }; };
    var save = function (status, then) { return api("soc_post_save", { post: get(status) }).then(function (r) { if (r.pending) { W.closeModal(); toast("Sent to Master for approval"); return; } if (!r.ok) return toast(r.error, true); p = r.post; if (then) return then(r.post); W.closeModal(); toast(status === "scheduled" ? "Scheduled for " + nice(r.post.when) + " ✓" : "Draft saved ✓"); load(); }); };
    if ($("#sc-dr")) $("#sc-dr").onclick = function () { save("draft"); };
    if ($("#sc-sc")) $("#sc-sc").onclick = function () { if (!$("#sc-wh").value) return toast("Pick the date and time first", true); save("scheduled"); };
    if ($("#sc-now")) $("#sc-now").onclick = function () { if (!confirm("Publish this post now?")) return; var b = this; b.disabled = true; save("draft", function (post) { api("soc_post_send", { id: post.id }).then(function (r) { b.disabled = false; if (r.pending) { W.closeModal(); return toast("Sent to Master for approval"); } if (!r.ok) { toast(r.error || "Could not publish", true); load(); return; } W.closeModal(); toast(r.post.status === "published" ? "Published ✓" : "Partly published: " + r.post.error, r.post.status !== "published"); load(); }); }); };
    if ($("#sc-del")) $("#sc-del").onclick = function () { if (!confirm("Delete this post from the planner?" + (locked ? " (It stays on Facebook/Instagram.)" : ""))) return; api("soc_post_delete", { id: p.id }).then(function (r) { if (r.pending) { W.closeModal(); return toast("Sent to Master for approval"); } W.closeModal(); toast("Deleted"); load(); }); };
    if ($("#sc-ai")) $("#sc-ai").onclick = function () { var b = this; b.disabled = true; b.textContent = "Writing…"; api("soc_ai_caption", { topic: $("#sc-top").value, nets: get("draft").nets }).then(function (r) { b.disabled = false; b.innerHTML = ic("sparkles") + "Draft 3 captions"; W.fillIcons(b); if (!r.ok) return toast(r.error, true);
      $("#sc-opts").innerHTML = '<div class="muted" style="font-size:12px">Click one to use it (you can edit it after):</div>' + r.options.map(function (o, i) { return '<div class="so-opt" data-o="' + i + '">' + esc(o) + "</div>"; }).join("");
      $$("[data-o]").forEach(function (x) { x.onclick = function () { $("#sc-tx").value = r.options[+x.dataset.o]; pv(); }; }); }); };
    if ($("#sc-pick")) $("#sc-pick").onclick = function () { picker(function (u) { $("#sc-im").value = u; pv(); }); };
  }
  function picker(done) {
    var box = document.createElement("div"); box.className = "modal-back"; box.style.cssText = "position:fixed;inset:0;background:rgba(12,22,40,.55);z-index:10050;display:grid;place-items:center;padding:20px";
    box.innerHTML = '<div class="card" style="width:min(860px,96vw);padding:16px"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><h3 style="margin:0">Choose an image</h3><input id="mp-q" placeholder="Search…" style="margin:0 0 0 auto;max-width:220px"><label style="display:flex;gap:6px;align-items:center;margin:0;font-size:13px"><input type="checkbox" id="mp-jpg"> JPG only (Instagram)</label><button class="btn sm" id="mp-x">Close</button></div><div class="so-g" id="mp-g"><div class="empty">Loading…</div></div></div>';
    document.body.appendChild(box); var files = [];
    var close = function () { box.remove(); }; $("#mp-x", box).onclick = close; box.onclick = function (e) { if (e.target === box) close(); };
    var drawG = function () { var q = $("#mp-q", box).value.toLowerCase(), jpg = $("#mp-jpg", box).checked; var L = files.filter(function (f) { var u = f.url || f.u || ""; return (!q || u.toLowerCase().indexOf(q) >= 0) && (!jpg || /\.jpe?g$/i.test(u)); }).slice(0, 300);
      $("#mp-g", box).innerHTML = L.length ? L.map(function (f) { var u = f.url || f.u; return '<button data-u="' + esc(u) + '" title="' + esc(u) + '"><img src="' + esc(u) + '" loading="lazy" alt=""><small>' + esc(u.split("/").pop()) + "</small></button>"; }).join("") : '<div class="empty">No images match.</div>';
      $$("[data-u]", box).forEach(function (x) { x.onclick = function () { done(x.dataset.u); close(); }; }); };
    $("#mp-q", box).oninput = drawG; $("#mp-jpg", box).onchange = drawG;
    api("media_list").then(function (r) { if (!r.ok) { $("#mp-g", box).innerHTML = '<div class="empty">' + esc(r.error) + "</div>"; return; } files = (r.files || []).filter(function (f) { return !/\.svg$/i.test(f.url || f.u || ""); }); drawG(); });
  }
  if (location.hash.indexOf("#/social") === 0 && W.route) W.route();
})();
