/* Woodex Admin — P39 Phase 4: Telegram setup (bot, team group, alerts, website fallback) + "Link my Telegram" on My profile. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, toast = W.toast, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  function step(n, title, body, done) { return '<div class="card" style="margin-bottom:12px"><div class="card-b" style="display:flex;gap:14px;align-items:flex-start"><span style="flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:' + (done ? "#dcfce7;color:#166534" : "#f4efe7;color:#8a6a3f") + '">' + (done ? "✓" : n) + '</span><div style="flex:1;min-width:0"><h3 style="margin:2px 0 6px;font-size:15px">' + title + "</h3>" + body + "</div></div></div>"; }
  function sw(id, on, label, hint) { return '<label class="check" style="align-items:flex-start;margin:8px 0"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span><b>" + label + "</b>" + (hint ? '<br><small class="muted">' + hint + "</small>" : "") + "</span></label>"; }

  V.telegram = function (el) {
    el.innerHTML = W.head("Telegram", "Telegram") + '<div id="tg-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    api("tg_get").then(function (r) {
      if (!r.ok) { $("#tg-b").innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      var c = r.cfg, on = !!c.bot;
      var site = '<div class="card" style="margin-bottom:12px"><div class="card-h"><h3>Website contact button</h3><small class="muted">The website shows only one button</small></div><div class="card-b">' +
        '<div class="seg" id="tg-site">' + [["chat", "Live chat"], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"]].map(function (x) { return '<button data-v="' + x[0] + '"' + ((c.site || "chat") === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" +
        '<p class="muted" style="font-size:12.5px;margin:8px 0 10px">Live chat: AI answers first and your team can take over (you get it on Telegram). WhatsApp: opens WhatsApp +92 322 4000768. Telegram: opens ' + (on ? "your bot @" + esc(c.bot) + " (chats come to the Inbox)" : "your Telegram account below") + ". If WhatsApp is down, the site switches to Telegram by itself.</p>" +
        '<label>Your Telegram username <small class="muted">(used for the Telegram button when no bot is connected)</small><div style="display:flex;gap:8px"><input id="tg-user" value="' + esc(c.tgUser || "") + '" placeholder="WOODEXINTERIOR" style="margin:0;flex:1"><button class="btn" id="tg-user-sv">Save</button></div></label>' +
        '<label style="margin-top:10px">Live chat alert phone <small class="muted">(gets a WhatsApp alert for each new chat and when a customer asks for a person)</small><div style="display:flex;gap:8px"><input id="tg-ap" value="' + esc(c.alertPhone ? "+" + c.alertPhone.replace(/^(\d{2})(\d{3})(\d{7})$/, "$1 $2 $3") : "") + '" placeholder="+92 322 4200768" style="margin:0;flex:1"><button class="btn" id="tg-ap-sv">Save</button></div></label>' +
        '<p class="muted" style="font-size:12.5px;margin:6px 0 0">For <b>Telegram</b> alerts on that phone: open Telegram on it and scan the QR in step 2 (or from My profile). WhatsApp alerts need WhatsApp connected (Settings → WhatsApp).</p></div></div>';
      $("#tg-b").innerHTML = site +
        '<div class="card" style="margin-bottom:12px"><div class="card-b" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' + ic("send") +
        '<div style="flex:1;min-width:220px"><b>' + (on ? "Connected: @" + esc(c.bot) : "Not connected") + "</b><br><small class=\"muted\">" +
        (on ? (c.group ? "Team group: " + esc(c.groupTitle) : "No team group yet") + " · " + c.linked + " staff linked · WhatsApp is " + (c.waDown ? '<b style="color:#b42318">not working</b> (Telegram button is ' + (c.buttonLive ? "showing" : "hidden") + " on the website)" : "working") : "Customers can chat with your Telegram bot, staff reply from a Telegram group, and the website offers Telegram when WhatsApp is down.") +
        "</small></div>" + (on ? '<a class="btn sm" target="_blank" rel="noopener" href="https://t.me/' + esc(c.bot) + '">Open bot</a>' : "") + "</div></div>" +
        step(1, "Create your bot (2 minutes)", '<ol style="margin:0 0 10px 18px;padding:0;font-size:13.5px;line-height:1.7"><li>In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> and send <code>/newbot</code>.</li><li>Name: <b>Woodex Interior</b> · username e.g. <b>WoodexInteriorBot</b>.</li><li>Copy the token it gives you and paste it here.</li></ol>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="tg-tok" type="password" autocomplete="off" placeholder="' + (c.tokenSet ? "Token saved (paste a new one to change)" : "123456789:AA…") + '" style="flex:1;min-width:240px;margin:0"><button class="btn pri" id="tg-con">' + (on ? "Reconnect" : "Connect") + "</button>" + (on ? '<button class="btn" id="tg-off">Disconnect</button>' : "") + "</div>" +
          '<small class="muted">The webhook is set for you: ' + esc(c.webhook) + "</small>", on) +
        step(2, "Connect my Telegram (scan QR)", '<p style="margin:0 0 8px;font-size:13.5px">Scan the QR code with your phone camera or Telegram and tap <b>Start</b>. New clients, leads and chats then arrive in your Telegram, and you <b>reply to a message there</b> to answer the customer. Each staff member can do this from <b>My profile</b>.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn' + (r.me ? "" : " pri") + '" id="tg-me"' + (on ? "" : " disabled") + ">" + ic("send") + (r.me ? "✓ Connected · scan again" : "Scan QR to connect") + "</button>" +
          (r.me ? '<button class="btn" id="tg-tme">Send test text to my Telegram</button><label class="check" style="margin:0"><input type="checkbox" id="tg-dm"' + (r.meDm ? " checked" : "") + "><span>Send new clients &amp; chats to my Telegram</span></label>" : "") + "</div>", r.me) +
        step(3, "Connect your team group", '<ol style="margin:0 0 8px 18px;padding:0;font-size:13.5px;line-height:1.7"><li>Create a Telegram group (e.g. <b>Woodex Team</b>) and add your staff.</li><li>Add <b>@' + esc(c.bot || "yourbot") + "</b> to the group and make it an <b>admin</b> (so it can read replies).</li><li>In the group, the Master or a Manager sends <code>/connect</code>.</li></ol>" +
          '<p class="muted" style="margin:0 0 8px;font-size:13px">Then every customer message appears in the group. Staff <b>reply to that message</b> to answer the customer on their channel (website, WhatsApp or Telegram). <code>/ai</code> hands back to the assistant, <code>/close</code> closes the chat.</p>' +
          (c.group ? '<button class="btn" id="tg-test">Send a test message</button>' : ""), !!c.group) +
        '<div class="card"><div class="card-h"><h3>Settings</h3></div><div class="card-b">' +
          sw("tg-cus", c.customers, "Customers can chat with the bot", "Same AI agent and Inbox as the website chat and WhatsApp.") +
          '<label style="margin:10px 0 4px;display:block"><b>"Continue on Telegram" option inside the live chat</b></label><div class="seg" id="tg-btn">' + [["auto", "Only when WhatsApp is down"], ["always", "Always"], ["off", "Never"]].map(function (x) { return '<button data-v="' + x[0] + '"' + (c.button === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" +
          '<h4 style="margin:16px 0 4px">Team group alerts</h4>' + sw("tg-ac", c.alertChats, "Customer messages", "Post every customer message so staff can reply from Telegram.") + sw("tg-al", c.alertLeads, "New leads") + sw("tg-aa", c.alertAppr, "Changes waiting for Master approval") +
        "</div></div>";
      W.fillIcons($("#tg-b"));
      $("#tg-con").onclick = function () { var b = this; b.disabled = true; api("tg_connect", { token: $("#tg-tok").value.trim() }).then(function (x) { b.disabled = false; if (!x.ok) return toast(x.error, true); toast("Connected to @" + x.cfg.bot + " ✓"); V.telegram(el); }); };
      if ($("#tg-off")) $("#tg-off").onclick = function () { if (confirm("Disconnect Telegram? Customers will no longer reach you there.")) api("tg_disconnect").then(function () { V.telegram(el); }); };
      if ($("#tg-test")) $("#tg-test").onclick = function () { api("tg_test").then(function (x) { toast(x.ok ? "Test sent to the team group ✓" : x.error, !x.ok); }); };
      $("#tg-me").onclick = function () { linkMe(function () { V.telegram(el); }); };
      if ($("#tg-tme")) $("#tg-tme").onclick = testMe;
      if ($("#tg-dm")) $("#tg-dm").onchange = function () { var x = this; api("tg_dm_set", { on: x.checked }).then(function (y) { if (!y.ok) { x.checked = !x.checked; return toast(y.error, true); } toast(x.checked ? "Alerts will come to your Telegram ✓" : "Personal alerts off"); }); };
      $("#tg-site").onclick = function (e) { var b = e.target.closest("[data-v]"); if (!b) return; if (b.dataset.v === "telegram" && !on && !$("#tg-user").value.trim()) return toast("Connect the bot or enter your Telegram username first", true); [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); save({ site: b.dataset.v }); };
      $("#tg-ap-sv").onclick = function () { save({ alertPhone: $("#tg-ap").value }); };
      $("#tg-user-sv").onclick = function () { save({ tgUser: $("#tg-user").value }); };
      var save = function (o) { api("tg_save", o).then(function (x) { toast(x.ok ? "Saved" : x.error, !x.ok); }); };
      $("#tg-cus").onchange = function () { save({ customers: this.checked }); };
      $("#tg-ac").onchange = function () { save({ alertChats: this.checked }); };
      $("#tg-al").onchange = function () { save({ alertLeads: this.checked }); };
      $("#tg-aa").onchange = function () { save({ alertAppr: this.checked }); };
      $("#tg-btn").onclick = function (e) { var b = e.target.closest("[data-v]"); if (!b) return; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); save({ button: b.dataset.v }); };
    });
  };
  function testMe() { api("tg_test_me").then(function (x) { toast(x.ok ? "Test text sent. Check your Telegram ✓" : x.error, !x.ok); }); }
  function linkMe(after) {
    api("tg_link_code").then(function (r) {
      if (!r.ok) return toast(r.error, true);
      var qr = ""; try { var q = window.qrcode(0, "M"); q.addData(r.link); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { qr = ""; }
      W.modal("<h3>Connect my Telegram</h3><div style='display:flex;gap:18px;flex-wrap:wrap;align-items:center'><div id='tg-qr' style='width:210px;height:210px;flex:none;border:1px solid var(--line);border-radius:14px;padding:8px;background:#fff'>" + qr + "</div>" +
        "<div style='flex:1;min-width:200px;font-size:13.5px;line-height:1.7'><ol style='margin:0 0 8px 18px;padding:0'><li>Open the camera or Telegram on your phone.</li><li>Scan this code.</li><li>Tap <b>Start</b> in the bot chat.</li></ol><div id='tg-qs' class='muted'>⏳ Waiting for you to tap Start… (code works for 15 minutes)</div>" +
        "<p style='margin:8px 0 0;font-size:12.5px'>On this phone? <a target='_blank' rel='noopener' href='" + esc(r.link) + "'>Open Telegram</a> · or send <code>/start L" + esc(r.code) + "</code></p></div></div>" +
        "<div class='modal-actions'><button class='btn' id='tg-qt' disabled>Send test text</button><button class='btn pri' id='tg-qd'>Done</button></div>");
      var svg = document.querySelector("#tg-qr svg"); if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; }
      var t0 = Date.now(), was = !!r.linked, done = false;
      var stop = function () { clearInterval(tm); }, tm = setInterval(function () {
        if (!document.getElementById("tg-qs") || Date.now() - t0 > 900000) return stop();
        api("tg_get").then(function (g) { if (!g.ok || done) return; var me = g.me; if (me && !was) { done = true; stop(); ok(); } });
      }, 3000);
      var ok = function () { var s = document.getElementById("tg-qs"); if (s) s.innerHTML = "<b style='color:#11692f'>✓ Connected! New clients and chats will come to your Telegram.</b>"; var t = document.getElementById("tg-qt"); if (t) { t.disabled = false; t.classList.add("pri"); } };
      if (was) { var s0 = document.getElementById("tg-qs"); s0.innerHTML = "Already connected ✓ · scan again to switch to another Telegram account."; document.getElementById("tg-qt").disabled = false; }
      document.getElementById("tg-qt").onclick = testMe;
      document.getElementById("tg-qd").onclick = function () { stop(); W.closeModal(); if (typeof after === "function") after(); };
    });
  }
  // My profile → Telegram card (everyone; only shows when Telegram is connected)
  var baseP = V.profile;
  if (baseP) V.profile = function (el, parts) {
    var r = baseP(el, parts);
    setTimeout(function () {
      api("tg_link_code").then(function (x) {
        if (!x.ok || !document.body.contains(el) || $("#tg-pc", el)) return;
        var d = document.createElement("div"); d.className = "card"; d.id = "tg-pc"; d.style.marginTop = "14px";
        d.innerHTML = '<div class="card-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' + ic("send") + '<div style="flex:1"><b>Telegram</b><br><small class="muted">' + (x.linked ? "Connected ✓ New clients and chats come to your Telegram; reply there to answer." : "Scan a QR code to get new clients and chats on your Telegram and reply from there.") + '</small></div>' + (x.linked ? '<button class="btn sm" id="tg-pt">Send test text</button>' : "") + '<button class="btn sm' + (x.linked ? "" : " pri") + '" id="tg-pl">' + (x.linked ? "Scan again" : "Scan QR to connect") + "</button></div>";
        el.appendChild(d); W.fillIcons(d); $("#tg-pl").onclick = function () { linkMe(function () { var o = $("#tg-pc", el); if (o) o.remove(); V.profile(el, parts); }); }; if ($("#tg-pt")) $("#tg-pt").onclick = testMe;
      });
    }, 300);
    return r;
  };
  W.route();
})();
