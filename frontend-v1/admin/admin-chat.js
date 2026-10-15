/* Woodex Admin — Phase 10: Live chat inbox, notification bell (sound + browser notifications), chat settings, forgot / reset password. */
(function () {
  var HR = { person: "Asked for a person", price: "Price / quote", complaint: "Complaint", unsure: "AI not sure", deal: "Ready to finalise", stuck: "No progress" }; // P39 Phase 5 hand-off reasons
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, S = W.S;
  var can = function (r) { return S.user && r.split(",").indexOf(S.user.role) > -1; };
  var ago = W.ago || function (t) { return t; };

  var css = document.createElement("style");
  css.textContent =
    "#nt-btn{position:relative}.nt-n{position:absolute;top:2px;right:2px;min-width:17px;height:17px;border-radius:9px;background:#e11d48;color:#fff;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}" +
    ".nt-f{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line,#e5e7eb);overflow-x:auto}.nt-f button{border:1px solid var(--line,#e5e7eb);background:none;border-radius:999px;padding:4px 10px;font:600 12px/1.2 inherit;color:var(--mut);cursor:pointer;white-space:nowrap}.nt-f button.on{background:#0c1628;color:#fff;border-color:#0c1628}.nt-f i{font-style:normal;opacity:.7}" +
    ".nt-i.booking .ic{background:#e0f2fe;color:#0369a1}.nt-i.payment .ic{background:#dcfce7;color:#166534}.nt-i.overdue .ic{background:#fee2e2;color:#b91c1c}" +
    ".nt-menu{width:340px;right:0;left:auto;max-height:70vh;overflow:auto;padding:0!important}.nt-h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line,#e5e7eb)}.nt-h b{font-size:14px}" +
    ".nt-i{display:flex!important;gap:10px;padding:10px 14px!important;border-bottom:1px solid var(--line,#e5e7eb);text-decoration:none;color:inherit;align-items:flex-start;white-space:normal!important}.nt-i:hover{background:var(--bg)}.nt-i .ic{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;flex:none;background:#dcfce7;color:#166534}.nt-i.lead .ic{background:#fef3c7;color:#92400e}" +
    ".nt-i b{display:block;font-size:13px}.nt-i small{display:block;color:var(--mut);font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.nt-i em{font-style:normal;font-size:11px;color:var(--mut)}.nt-e{padding:22px 14px;text-align:center;color:var(--mut);font-size:13px}" +
    ".lc{display:grid;grid-template-columns:320px 1fr;gap:0;height:calc(100vh - 190px);min-height:460px;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;overflow:hidden}" +
    ".lc-l{border-right:1px solid var(--line,#e5e7eb);display:flex;flex-direction:column;min-height:0}.lc-tabs{display:flex;border-bottom:1px solid var(--line,#e5e7eb)}.lc-tabs button{flex:1;padding:11px;background:none;border:0;cursor:pointer;font-weight:600;color:var(--mut);border-bottom:2px solid transparent}.lc-tabs button.on{color:var(--txt,#111);border-bottom-color:var(--gold,#b8924c)}" +
    ".lc-list{overflow:auto;flex:1}.lc-it{display:block;padding:11px 14px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer;text-decoration:none;color:inherit}.lc-it:hover{background:var(--bg)}.lc-it.on{background:var(--bg);box-shadow:inset 3px 0 0 var(--gold,#b8924c)}" +
    ".lc-it .r1{display:flex;justify-content:space-between;gap:8px;align-items:center}.lc-it b{font-size:13.5px}.lc-it em{font-style:normal;font-size:11px;color:var(--mut)}.lc-it small{display:block;color:var(--mut);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}" +
    ".lc-it .u{background:#e11d48;color:#fff;border-radius:9px;font-size:10.5px;font-weight:700;padding:1px 6px}.lc-tag{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:4px}.lc-tag.ai{background:#ede9fe;color:#5b21b6}.lc-tag.hu{background:#dcfce7;color:#166534}.lc-tag.nd{background:#fee2e2;color:#991b1b}" +
    ".lc-r{display:flex;flex-direction:column;min-height:0;min-width:0}.lc-top{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap}.lc-top h3{margin:0;font-size:15px}.lc-top small{color:var(--mut)}.lc-top .sp{flex:1}" +
    ".lc-msgs{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:6px;background:var(--bg)}.lm{max-width:72%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".lm.v{align-self:flex-start;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb)}.lm.a,.lm.g{align-self:flex-end;background:#0a0f1e;color:#fff}.lm.a{background:#ede9fe;color:#2e1065}.lm.s{align-self:center;background:#fff7d6;color:#713f12;font-size:12.5px}.lm small{display:block;font-size:10.5px;opacity:.7;margin-bottom:2px}" +
    ".lc-in{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line,#e5e7eb)}.lc-in textarea{flex:1;margin:0;resize:none;min-height:44px;max-height:140px}.lc-empty{flex:1;display:grid;place-items:center;color:var(--mut);text-align:center;padding:20px}" +
    ".lc-info{font-size:12.5px;color:var(--mut);padding:8px 14px;border-bottom:1px solid var(--line,#e5e7eb);display:flex;gap:14px;flex-wrap:wrap}.lc-info b{color:var(--txt,#111);font-weight:600}" +
    "@media(max-width:860px){.lc{grid-template-columns:1fr;height:auto}.lc.has .lc-l{display:none}.lc:not(.has) .lc-r{display:none}.lc-msgs{height:55vh}}";
  css.textContent += ".lc-box{display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--line,#e5e7eb)}.lc-box button{flex:1;border:1px solid var(--line,#e5e7eb);background:none;border-radius:8px;padding:6px 4px;font:600 12px/1.2 inherit;color:var(--mut);cursor:pointer}.lc-box button.on{background:#0c1628;color:#fff;border-color:#0c1628}.lc-box i{font-style:normal;opacity:.7;margin-left:3px}" +
    ".lc-wait{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 6px;background:#fef3c7;color:#92400e;margin-left:4px}.lc-wait.late{background:#fee2e2;color:#b91c1c}.lc-as{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#f4efe7;color:#8a6a3f;font:700 10px/1 inherit;margin-left:4px}.lc-chip{display:inline-block;font-size:10.5px;border-radius:6px;padding:1px 6px;background:#f1f5f9;color:#334155;margin:3px 3px 0 0}" +
    ".lm.n{align-self:stretch;max-width:100%;background:#fffbea;border:1px dashed #e5c76b;color:#5b4a12;font-size:13px}.lm.n small{color:#8a6d1a}.lc-in.note textarea{background:#fffbea;border-color:#e5c76b}.lc-mode{display:flex;flex-direction:column;gap:4px}.lc-mode button{border:1px solid var(--line,#e5e7eb);background:none;border-radius:8px;padding:4px 8px;font:600 11.5px inherit;cursor:pointer;color:var(--mut)}.lc-mode button.on{background:#0c1628;color:#fff;border-color:#0c1628}.lc-mode button.on[data-m=note]{background:#e5c76b;color:#3b2f07;border-color:#e5c76b}" +
    ".lc-sv{position:absolute;bottom:100%;left:10px;right:10px;background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:10px;box-shadow:0 10px 30px rgba(12,22,40,.15);max-height:240px;overflow:auto;z-index:5}.lc-sv a{display:block;padding:8px 12px;font-size:13px;color:inherit;text-decoration:none;border-bottom:1px solid #f1f5f9}.lc-sv a.on,.lc-sv a:hover{background:#f4efe7}.lc-sv b{color:#8a6a3f;margin-right:6px}.lc-in{position:relative}" +
    ".lc-top select{max-width:150px;margin:0;padding:5px 8px;font-size:12.5px;height:auto}";
  document.head.appendChild(css);

  // ================================================================ notifications (bell + sound + browser notifications)
  var N = { stamp: null, timer: null, total: 0, baseTitle: document.title };
  function beep() {
    try { var A = window.AudioContext || window.webkitAudioContext; if (!A) return; var c = N.ac || (N.ac = new A()); if (c.state === "suspended") c.resume();
      [0, 0.18].forEach(function (d, i) { var o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = i ? 1175 : 880; g.gain.setValueAtTime(0.0001, c.currentTime + d); g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d + 0.25); o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.3); });
    } catch (e) {}
  }
  function pref(k, d) { var v = localStorage.getItem("wxNt_" + k); return v === null ? d : v === "1"; }
  function drawBell(r) {
    if (W.chatX) W.chatX.headerBtn(r);
    var n = $("#nt-n"); if (!n) return; N.total = r.total; n.hidden = !r.total; n.textContent = r.total > 99 ? "99+" : r.total;
    document.title = (r.total ? "(" + r.total + ") " : "") + N.baseTitle.replace(/^\(\d+\+?\)\s*/, "");
    var a = $('.nav-a[data-v="chat"]'); if (a) { var b = a.querySelector(".pill"); if (!r.chats) { if (b) b.remove(); } else { if (!b) { b = document.createElement("span"); b.className = "pill"; b.style.cssText = "background:#e11d48;color:#fff"; a.appendChild(b); } b.textContent = r.chats; } }
    var m = $("#nt-menu");
    var KI = { chat: "message-circle", lead: "inbox", booking: "clock", payment: "receipt", overdue: "triangle-alert" }, F = N.f || "all", grp = function (k) { return k === "payment" || k === "overdue" ? "money" : k; };
    var its = r.items.filter(function (x) { return F === "all" || grp(x.kind) === F; });
    m.innerHTML = '<div class="nt-h"><b>Notifications</b><span><button class="btn sm" id="nt-set" title="Alert settings">' + ic("settings") + "</button></span></div>" +
      '<div class="nt-f">' + [["all", "All"], ["chat", "Chats"], ["lead", "Leads"], ["booking", "Visits"], ["money", "Money"]].map(function (t) { var n = t[0] === "all" ? r.items.length : r.items.filter(function (x) { return grp(x.kind) === t[0]; }).length; return '<button type="button" data-f="' + t[0] + '" class="' + (F === t[0] ? "on" : "") + '">' + t[1] + (n ? " <i>" + n + "</i>" : "") + "</button>"; }).join("") + "</div>" +
      (its.length ? its.map(function (x) { return '<a class="nt-i ' + x.kind + '" href="' + esc(x.href) + '"><span class="ic">' + ic(KI[x.kind] || "bell") + "</span><span><b>" + esc(x.title) + "</b><small>" + esc(x.text) + "</small><em>" + esc(ago(x.t)) + "</em></span></a>"; }).join("") : '<div class="nt-e">' + ic("circle-check") + "<br>You are all caught up.</div>");
    W.fillIcons(m);
    m.querySelector(".nt-f").onclick = function (e) { var b = e.target.closest("[data-f]"); if (!b) return; e.stopPropagation(); N.f = b.dataset.f; drawBell(N.last); };
    N.last = r;
    $("#nt-set").onclick = function (e) { e.stopPropagation(); m.hidden = true; settingsModal(); };
  }
  function notify(r) {
    var k0 = (r.items[0] || {}).kind || "lead"; if (k0 === "overdue") k0 = "payment";
    if (pref("sound", true) && pref("snd_" + k0, true)) beep();
    if (pref("push", true) && "Notification" in window && Notification.permission === "granted" && document.hidden) {
      var it = r.items[0]; try { var n = new Notification(it ? it.title : "Woodex Admin", { body: it ? it.text : "You have " + r.total + " new notifications", icon: "/assets/img/img-f941b08b9510.png", tag: "wx-" + (it ? it.kind + it.id : "n") }); n.onclick = function () { window.focus(); if (it) location.hash = it.href; n.close(); }; } catch (e) {}
    }
  }
  function pollN() {
    if (!S.user || !S.token) return;
    api("notif_poll").then(function (r) {
      if (!r || !r.ok) return; drawBell(r);
      if (N.stamp !== null && r.stamp !== N.stamp && r.items.length) { notify(r); if (W.chatX) W.chatX.onNotify(r); if (location.hash.indexOf("#/chat") === 0 && W._chatRefresh) W._chatRefresh(); }
      N.stamp = r.stamp;
    });
  }
  function settingsModal() {
    var perm = "Notification" in window ? Notification.permission : "unsupported";
    W.modal("<h3>Alert settings</h3><p class='muted' style='font-size:13px'>Alerts for new live chats and new enquiries while Woodex Admin is open (also in a background tab). Email alerts for new chats use the email set in Settings → Integrations.</p>" +
      "<label class='check'><input type='checkbox' id='ns-sound'" + (pref("sound", true) ? " checked" : "") + "> Play a sound</label>" +
      "<p class='muted' style='margin:6px 0 2px'>Sound for:</p><div style='display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px'>" + [["chat", "Chats"], ["lead", "New leads"], ["booking", "Visit bookings"], ["payment", "Payments"]].map(function (t) { return "<label class='check' style='margin:0'><input type='checkbox' data-snd='" + t[0] + "'" + (pref("snd_" + t[0], true) ? " checked" : "") + "> " + t[1] + "</label>"; }).join("") + "</div>" +
      "<label class='check'><input type='checkbox' id='ns-pop'" + (pref("popup", true) ? " checked" : "") + "> Pop up the chat window when a client writes</label>" +
      "<label class='check'><input type='checkbox' id='ns-push'" + (pref("push", true) ? " checked" : "") + "> Browser / phone notifications when Admin is in the background</label>" +
      "<p style='font-size:13px'>Browser permission: <b>" + ({ granted: "allowed ✓", denied: "blocked (allow it in the browser's site settings)", default: "not asked yet", unsupported: "not supported in this browser" })[perm] + "</b></p>" +
      "<div class='modal-actions'><button class='btn' id='ns-test'>" + ic("bell") + "Test</button>" + (perm === "default" ? "<button class='btn' id='ns-ask'>Allow notifications</button>" : "") + "<button class='btn pri' id='ns-ok'>Done</button></div>");
    Array.prototype.forEach.call(document.querySelectorAll("[data-snd]"), function (x) { x.onchange = function () { localStorage.setItem("wxNt_snd_" + x.dataset.snd, x.checked ? "1" : "0"); }; });
    $("#ns-pop").onchange = function () { localStorage.setItem("wxNt_popup", this.checked ? "1" : "0"); };
    $("#ns-sound").onchange = function () { localStorage.setItem("wxNt_sound", this.checked ? "1" : "0"); };
    $("#ns-push").onchange = function () { localStorage.setItem("wxNt_push", this.checked ? "1" : "0"); if (this.checked && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); };
    if ($("#ns-ask")) $("#ns-ask").onclick = function () { Notification.requestPermission().then(function () { settingsModal(); }); };
    $("#ns-test").onclick = function () { beep(); if ("Notification" in window && Notification.permission === "granted") try { new Notification("Woodex Admin", { body: "Notifications are working ✓", icon: "/assets/img/img-f941b08b9510.png" }); } catch (e) {} };
    $("#ns-ok").onclick = function () { W.closeModal(); };
  }
  function bellInit() {
    var b = $("#nt-btn"); if (!b || b._wx) return; b._wx = 1;
    b.onclick = function (e) { e.stopPropagation(); var m = $("#nt-menu"); m.hidden = !m.hidden; if (!m.hidden && "Notification" in window && Notification.permission === "default" && pref("push", true)) Notification.requestPermission(); };
    document.addEventListener("click", function (e) { var m = $("#nt-menu"); if (m && !m.hidden && !e.target.closest("#nt-dd")) m.hidden = true; });
    $("#nt-menu").addEventListener("click", function (e) { if (e.target.closest(".nt-i")) $("#nt-menu").hidden = true; });
    document.addEventListener("click", function once() { try { var A = window.AudioContext || window.webkitAudioContext; if (A && !N.ac) N.ac = new A(); } catch (e) {} document.removeEventListener("click", once); });
  }
  var wasIn = false;
  setInterval(function () { var inNow = !!(S.user && S.token); if (inNow && !wasIn) { bellInit(); N.stamp = null; pollN(); clearInterval(N.timer); N.timer = setInterval(pollN, 12000); } if (!inNow && wasIn) clearInterval(N.timer); wasIn = inNow; }, 700);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) pollN(); });

  // ================================================================ Live chat inbox
  W.VIEWS.chat = function (el, parts) {
    var cur = +(parts[0] || 0), tab = "open", last = 0, chat = null, timer = null, admin = can("owner,admin"), box = localStorage.getItem("wxInboxBox") || "all", TEAM = [], SAVED = [], ME = 0, mode = "reply";
    el.innerHTML = W.head("Inbox", "Inbox", (admin ? '<button class="btn" id="lc-rp">' + ic("message-square") + "Replies & quick answers</button><button class=\"btn\" id=\"lc-set\">" + ic("settings") + "Chat settings</button>" : "")) +
      '<div class="lc' + (cur ? " has" : "") + '"><div class="lc-l"><div class="lc-box" id="lc-box">' + [["mine", "Mine"], ["unassigned", "Unassigned"], ["all", "All"]].map(function (b) { return '<button data-b="' + b[0] + '"' + (b[0] === box ? ' class="on"' : '') + '>' + b[1] + '<i data-n="' + b[0] + '"></i></button>'; }).join('') + '</div><div class="lc-tabs"><button class="on" data-t="open">Open</button><button data-t="closed">Closed</button></div><div class="lc-list" id="lc-list"><div class="lc-empty">Loading…</div></div></div>' +
      '<div class="lc-r" id="lc-r"><div class="lc-empty"><div>' + ic("message-circle") + "<p>Select a chat.<br><small>New chats from the website appear here. The AI assistant answers first; reply here to take over.</small></p></div></div></div></div>";
    W.fillIcons(el);
    if ($("#lc-set")) $("#lc-set").onclick = cfgModal;
    if ($("#lc-rp")) $("#lc-rp").onclick = repliesModal;
    $("#lc-box").onclick = function (e) { var b = e.target.closest("[data-b]"); if (!b) return; box = b.dataset.b; localStorage.setItem("wxInboxBox", box); $$("#lc-box button").forEach(function (x) { x.classList.toggle("on", x === b); }); list(); };
    function initials(id) { var t = TEAM.filter(function (x) { return x.id === id; })[0]; return t ? t.name.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase() : "?"; }
    function wait(c) { if (!c.waitFrom) return ""; var m = Math.max(0, Math.round((Date.now() - new Date(String(c.waitFrom).replace(" ", "T"))) / 60000)); if (!isFinite(m)) return ""; return '<span class="lc-wait' + (m >= 5 ? " late" : "") + '" title="Waiting for a reply">' + (m < 60 ? m + "m" : Math.round(m / 60) + "h") + "</span>"; }
    $(".lc-tabs", el).onclick = function (e) { var b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $$(".lc-tabs button", el).forEach(function (x) { x.classList.toggle("on", x === b); }); list(); };
    function list() {
      api("chat_list", { status: tab, box: box }).then(function (r) {
        var L = $("#lc-list"); if (!L) return; if (!r.ok) { L.innerHTML = '<div class="lc-empty">' + esc(r.error) + "</div>"; return; }
        if (r.cfg && !r.cfg.on && !$("#lc-off")) L.insertAdjacentHTML("beforebegin", '<div id="lc-off" class="banner" style="margin:8px;font-size:12.5px">Live chat is turned off on the website.' + (admin ? " Turn it on in Chat settings." : "") + "</div>");
        TEAM = r.team || []; SAVED = (r.cfg && r.cfg.saved) || []; ME = r.me || 0;
        if (r.counts) Object.keys(r.counts).forEach(function (k) { var n = document.querySelector('#lc-box [data-n="' + k + '"]'); if (n) n.textContent = r.counts[k]; });
        L.innerHTML = r.chats.length ? r.chats.map(function (c) {
          return '<a class="lc-it' + (c.id === cur ? " on" : "") + '" href="#/chat/' + c.id + '"><div class="r1"><b>' + (c.channel === "wa" ? '<span class="lc-tag" style="background:#25d366;color:#fff">WA</span> ' : c.channel === "tg" ? '<span class="lc-tag" style="background:#229ED9;color:#fff">TG</span> ' : "") + esc(c.name || "Visitor #" + c.id) + (c.needs || c.handoff ? '<span class="lc-tag nd" title="AI handed this chat to the team">' + (c.handoff ? "🙋 " + esc(HR[c.handoff] || c.handoff) : "needs you") + '</span>' : c.mode === "ai" ? '<span class="lc-tag ai">AI</span>' : '<span class="lc-tag hu">' + esc(c.agent || "Team") + "</span>") + wait(c) + (c.assigned ? '<span class="lc-as" title="Assigned">' + initials(c.assigned) + "</span>" : "") + "</b>" + (c.unread ? '<span class="u">' + c.unread + "</span>" : "<em>" + esc(ago(c.updated_at)) + "</em>") + "</div><small>" + esc(c.last || "") + "</small>" + ((c.tags || []).length ? "<div>" + c.tags.map(function (t) { return '<span class="lc-chip">' + esc(t) + "</span>"; }).join("") + "</div>" : "") + "</a>";
        }).join("") : '<div class="lc-empty">' + (tab === "open" ? "No open chats." : "No closed chats.") + "</div>";
      });
    }
    function open(id) {
      cur = id; last = 0; chat = null; $(".lc", el).classList.toggle("has", !!id); if (!id) return;
      $$(".lc-it", el).forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#/chat/" + id); });
      $("#lc-r").innerHTML = '<div class="lc-top" id="lc-top"></div><div class="lc-info" id="lc-info"></div><div class="lc-msgs" id="lc-msgs"></div><div class="cx-typing" id="lc-ty"></div><form class="lc-in" id="lc-in"><div class="lc-mode"><button type="button" data-m="reply" class="on">Reply</button><button type="button" data-m="note">Note</button></div><textarea placeholder="Type a reply… (Enter to send · / for saved replies)" rows="1"></textarea><button class="btn pri">' + ic("send") + "Send</button></form>";
      W.fillIcons($("#lc-r"));
      var ta = $("#lc-in textarea");
      mode = "reply";
      $(".lc-mode", el).onclick = function (e) { var b = e.target.closest("[data-m]"); if (!b) return; mode = b.dataset.m; $$(".lc-mode button", el).forEach(function (x) { x.classList.toggle("on", x === b); }); $("#lc-in").classList.toggle("note", mode === "note"); ta.placeholder = mode === "note" ? "Internal note: only your team sees this" : "Type a reply… (Enter to send · / for saved replies)"; ta.focus(); };
      var sv = { on: false, i: 0, m: [] };
      function svClose() { sv.on = false; var x = $(".lc-sv", el); if (x) x.remove(); }
      function svDraw() {
        var q = ta.value.slice(1).toLowerCase(); sv.m = SAVED.filter(function (x) { return !q || x.k.indexOf(q) === 0 || x.t.toLowerCase().indexOf(q) > -1; }).slice(0, 8);
        var x = $(".lc-sv", el); if (!sv.m.length) { if (x) x.remove(); sv.on = false; return; }
        if (!x) { x = document.createElement("div"); x.className = "lc-sv"; $("#lc-in").appendChild(x); }
        sv.on = true; sv.i = Math.min(sv.i, sv.m.length - 1);
        x.innerHTML = sv.m.map(function (r, i) { return '<a href="#" data-i="' + i + '"' + (i === sv.i ? ' class="on"' : "") + "><b>/" + esc(r.k) + "</b>" + esc(r.t.slice(0, 90)) + "</a>"; }).join("");
        x.onmousedown = function (e) { var a = e.target.closest("[data-i]"); if (!a) return; e.preventDefault(); svPick(+a.dataset.i); };
      }
      function svPick(i) { var r = sv.m[i]; if (!r) return; var f = (chat && chat.name || "").split(" ")[0]; ta.value = r.t.replace(/\{name\}/g, f || "there"); svClose(); ta.focus(); }
      ta.addEventListener("input", function () { if (ta.value[0] === "/" && ta.value.indexOf(" ") < 0 && ta.value.indexOf("\n") < 0) svDraw(); else svClose(); });
      ta.addEventListener("keydown", function (e) {
        if (sv.on) { if (e.key === "ArrowDown") { sv.i = (sv.i + 1) % sv.m.length; svDraw(); e.preventDefault(); return; } if (e.key === "ArrowUp") { sv.i = (sv.i - 1 + sv.m.length) % sv.m.length; svDraw(); e.preventDefault(); return; } if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); svPick(sv.i); return; } if (e.key === "Escape") { svClose(); return; } }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#lc-in").requestSubmit(); }
      });
      $("#lc-in").onsubmit = function (e) {
        e.preventDefault(); var t = ta.value.trim(); if (!t) return; ta.value = ""; ta.disabled = true; svClose();
        api(mode === "note" ? "chat_note" : "chat_reply", { id: cur, text: t }).then(function (r) { ta.disabled = false; ta.focus(); if (!r.ok) { ta.value = t; return toast(r.error, true); } load(); list(); });
      };
      if (W.chatX) W.chatX.composer($("#lc-in"), function () { return cur; }, function () { load(); list(); });
      load(true);
    }
    function top() {
      var c = chat; if (!c) return;
      $("#lc-top").innerHTML = '<button class="btn sm" id="lc-bk" title="Back" style="display:none">' + ic("chevron-left") + "</button><div><h3>" + esc(c.name || "Visitor #" + c.id) + "</h3><small>" + (c.mode === "ai" ? "AI assistant is answering" : "Handled by " + esc(c.agent || "team")) + " · started " + esc(ago(c.created_at)) + (c.handoff ? ' · <b style="color:#b45309">🙋 AI handed over: ' + esc(HR[c.handoff] || c.handoff) + "</b>" : "") + '</small></div><span class="sp"></span>' +
        (c.mode === "ai" ? '<button class="btn sm" id="lc-take">' + ic("user") + "Take over</button>" : '<button class="btn sm" id="lc-ai">' + ic("sparkles") + "Hand back to AI</button>") +
        (c.lead_id ? '<a class="btn sm" href="#/enquiries">' + ic("inbox") + "Lead #" + c.lead_id + "</a>" : '<button class="btn sm" id="lc-lead">' + ic("plus") + "Save as lead</button>") +
        '<select id="lc-as" title="Assign to">' + '<option value="0">Unassigned</option>' + TEAM.map(function (t) { return '<option value="' + t.id + '"' + (c.assigned === t.id ? " selected" : "") + ">" + esc(t.id === ME ? t.name + " (me)" : t.name) + "</option>"; }).join("") + "</select>" +
        '<button class="btn sm" id="lc-tg" title="Tags">' + ic("star") + ((c.tags || []).length ? esc(c.tags.join(", ")) : "Tags") + "</button>" +
        (c.status === "open" ? '<button class="btn sm" id="lc-close">' + ic("circle-check") + "Close</button>" : '<button class="btn sm" id="lc-reopen">Reopen</button>');
      $("#lc-info").innerHTML = "<span>Channel: <b>" + ({ wa: "WhatsApp", tg: "Telegram" }[c.channel] || "Website") + "</b></span><span>Phone: <b>" + esc(c.phone || "—") + "</b></span><span>Email: <b>" + esc(c.email || "—") + "</b></span><span>Page: <b>" + esc(c.page || "/") + "</b></span>" + (c.phone ? '<a href="https://wa.me/' + esc(String(c.phone).replace(/\D/g, "").replace(/^0/, "92")) + '" target="_blank" rel="noopener">WhatsApp them</a>' : "");
      W.fillIcons($("#lc-top"));
      if (window.innerWidth <= 860) { $("#lc-bk").style.display = ""; $("#lc-bk").onclick = function () { location.hash = "#/chat"; }; }
      var act = function (a, p, msg) { api(a, Object.assign({ id: c.id }, p || {})).then(function (r) { if (!r.ok) return toast(r.error, true); chat = r.chat; top(); list(); load(); if (msg) toast(msg); }); };
      $("#lc-as").onchange = function () { act("chat_assign", { user_id: +this.value }, +this.value ? "Assigned" : "Unassigned"); };
      $("#lc-tg").onclick = function () {
        var PRE = ["hot", "quote", "site visit", "complaint", "follow up", "won"], cur0 = (c.tags || []).slice();
        W.modal("<h3>Tags</h3><div id='tg-l' style='display:flex;flex-wrap:wrap;gap:8px;margin:8px 0'>" + PRE.concat(cur0.filter(function (t) { return PRE.indexOf(t) < 0; })).map(function (t) { return "<label class='check' style='margin:0'><input type='checkbox' value='" + esc(t) + "'" + (cur0.indexOf(t) > -1 ? " checked" : "") + "> " + esc(t) + "</label>"; }).join("") + "</div><label>Other tag<input id='tg-x' placeholder='e.g. kitchen'></label><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='tg-go'>Save</button></div>");
        $("#tg-go").onclick = function () { var t = $$("#tg-l input:checked").map(function (i) { return i.value; }); if ($("#tg-x").value.trim()) t.push($("#tg-x").value.trim()); W.closeModal(); act("chat_tags", { tags: t }, "Tags saved"); };
      };
      if ($("#lc-take")) $("#lc-take").onclick = function () { act("chat_mode", { mode: "human" }, "You took over. The AI will stay quiet."); };
      if ($("#lc-ai")) $("#lc-ai").onclick = function () { act("chat_mode", { mode: "ai" }, "The AI assistant is answering again"); };
      if ($("#lc-close")) $("#lc-close").onclick = function () { act("chat_close", {}, "Chat closed"); };
      if ($("#lc-reopen")) $("#lc-reopen").onclick = function () { act("chat_close", { reopen: 1 }, "Chat reopened"); };
      if ($("#lc-lead")) $("#lc-lead").onclick = function () {
        W.modal("<h3>Save chat as a lead</h3><label>Name<input id='cl-n' value='" + esc(c.name) + "'></label><label>Phone<input id='cl-p' value='" + esc(c.phone) + "'></label><label>Email<input id='cl-e' value='" + esc(c.email) + "'></label><div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='cl-go'>Save lead</button></div>");
        $("#cl-go").onclick = function () { api("chat_lead", { id: c.id, name: $("#cl-n").value, phone: $("#cl-p").value, email: $("#cl-e").value }).then(function (r) { if (!r.ok) return toast(r.error, true); W.closeModal(); chat = r.chat; top(); toast("Saved in Enquiries ✓"); }); };
      };
    }
    function load(first) {
      if (!cur) return; var id = cur;
      api("chat_get", { id: id, since: last }).then(function (r) {
        if (id !== cur || !$("#lc-msgs")) return; if (!r.ok) { $("#lc-r").innerHTML = '<div class="lc-empty">' + esc(r.error) + "</div>"; return; }
        var changed = !chat || chat.mode !== r.chat.mode || chat.status !== r.chat.status || chat.phone !== r.chat.phone || chat.lead_id !== r.chat.lead_id || chat.name !== r.chat.name || chat.assigned !== r.chat.assigned || String(chat.tags) !== String(r.chat.tags);
        chat = r.chat; if (changed) top();
        var M = $("#lc-msgs"), atEnd = M.scrollHeight - M.scrollTop - M.clientHeight < 60;
        r.messages.forEach(function (m) { if (m.id <= last) return; last = m.id; var d = document.createElement("div"); d.className = "lm " + ({ visitor: "v", ai: "a", agent: "g", sys: "s", note: "n" })[m.who]; d.innerHTML = (m.who !== "sys" ? "<small>" + (m.who === "note" ? "📝 Note · " : "") + esc(m.who === "visitor" ? (chat.name || "Visitor") : m.who === "ai" ? "AI assistant" : m.name) + " · " + esc(String(m.t).slice(11, 16)) + "</small>" : "") + (W.chatX ? W.chatX.body(m) : esc(m.text)); M.appendChild(d); });
        if (first || atEnd) M.scrollTop = M.scrollHeight;
        if ($("#lc-ty")) $("#lc-ty").textContent = r.typing ? (chat.name || "Visitor") + " is typing…" : "";
        if (first) { list(); setTimeout(pollN, 300); }
      });
    }
    W._chatRefresh = function () { list(); load(); };
    clearInterval(W._chatTimer); W._chatTimer = timer = setInterval(function () { if (!document.body.contains(el) || location.hash.indexOf("#/chat") !== 0) { clearInterval(timer); return; } load(); if (Date.now() % 3 < 1) list(); }, 3500);
    var lt = setInterval(function () { if (!document.body.contains(el) || location.hash.indexOf("#/chat") !== 0) return clearInterval(lt); list(); }, 10000);
    list(); if (cur) open(cur);
  };

  function repliesModal() {
    api("chat_cfg_get").then(function (r) {
      if (!r.ok) return toast(r.error, true); var c = r.cfg;
      W.modal("<h3>Replies & quick answers</h3>" +
        "<p class='muted' style='font-size:13px'><b>Saved replies</b> are for your team: type <b>/</b> in the Inbox to insert one. One per line: <code>key | text</code>. {name} becomes the customer's first name.</p>" +
        "<textarea id='rp-s' rows='8' style='font-size:13px'>" + esc((c.saved || []).map(function (x) { return x.k + " | " + x.t; }).join("\n")) + "</textarea>" +
        "<p class='muted' style='font-size:13px;margin-top:12px'><b>Quick answers</b> are buttons customers can tap in the website chat and on Telegram (max 6). One per line: <code>button | message sent</code>.</p>" +
        "<textarea id='rp-q' rows='6' style='font-size:13px'>" + esc((c.quick || []).map(function (x) { return x.label + " | " + x.text; }).join("\n")) + "</textarea>" +
        "<div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='rp-go'>Save</button></div>", "wide");
      var parse = function (v, a, b) { return v.split("\n").map(function (l) { var i = l.indexOf("|"); if (i < 0) return null; var o = {}; o[a] = l.slice(0, i).trim(); o[b] = l.slice(i + 1).trim(); return o[a] && o[b] ? o : null; }).filter(Boolean); };
      $("#rp-go").onclick = function () { api("chat_cfg_save", { cfg: { saved: parse($("#rp-s").value, "k", "t"), quick: parse($("#rp-q").value, "label", "text").slice(0, 6) } }).then(function (x) { if (!x.ok) return toast(x.error, true); W.closeModal(); toast("Saved ✓"); if (W._chatRefresh) W._chatRefresh(); }); };
    });
  }
  function cfgModal() {
    api("chat_cfg_get").then(function (r) {
      if (!r.ok) return toast(r.error, true); var c = r.cfg;
      W.modal("<h3>Live chat settings</h3>" +
        "<label class='check'><input type='checkbox' id='cc-on'" + (c.on ? " checked" : "") + "> Show live chat on the website</label>" +
        "<label class='check'><input type='checkbox' id='cc-ai'" + (c.ai ? " checked" : "") + "> AI assistant answers first" + (r.aiReady ? "" : " <span class='warnc'>(add an AI key in Blog & insights → AI settings)</span>") + "</label>" +
        "<label class='check'><input type='checkbox' id='cc-lead'" + (c.autoLead ? " checked" : "") + "> Save a lead automatically when a visitor shares a phone or email</label>" +
        "<label class='check'><input type='checkbox' id='cc-em'" + (c.emailAlert ? " checked" : "") + "> Email the team when a new chat starts (uses Settings → Integrations email)</label>" +
        "<label>Greeting<textarea id='cc-g' rows='2'>" + esc(c.greeting) + "</textarea></label><label>Office hours (shown to visitors)<input id='cc-h' value='" + esc(c.hours) + "'></label>" +
        "<label>What the AI should know <small class='muted'>(services, areas, price guidance, policies; published FAQs are added automatically)</small><textarea id='cc-k' rows='9'>" + esc(c.knowledge) + "</textarea></label>" +
        "<div class='modal-actions'><button class='btn' onclick='WXA.closeModal()'>Cancel</button><button class='btn pri' id='cc-go'>Save</button></div>", "wide");
      $("#cc-go").onclick = function () {
        api("chat_cfg_save", { cfg: { on: $("#cc-on").checked, ai: $("#cc-ai").checked, autoLead: $("#cc-lead").checked, emailAlert: $("#cc-em").checked, greeting: $("#cc-g").value, hours: $("#cc-h").value, knowledge: $("#cc-k").value } })
          .then(function (x) { if (!x.ok) return toast(x.error, true); W.closeModal(); toast("Chat settings saved ✓"); if (W._chatRefresh) W._chatRefresh(); });
      };
    });
  }

  // ================================================================ forgot / reset password
  function authShow(id) { ["login-form", "tfa-form", "setup-form", "fp-form", "rp-form"].forEach(function (k) { var f = document.getElementById(k); if (f) f.hidden = k !== id; }); }
  var lf = $("#l-forgot");
  if (lf) lf.onclick = function (e) { e.preventDefault(); authShow("fp-form"); $("#fp-email").value = $("#l-email").value; $("#fp-err").textContent = ""; $("#fp-ok").textContent = ""; $("#fp-email").focus(); };
  $$(".fp-back").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); if (location.hash.indexOf("#reset=") === 0) history.replaceState(null, "", location.pathname); authShow("login-form"); }; });
  if ($("#fp-form")) $("#fp-form").onsubmit = function (e) {
    e.preventDefault(); var b = $("#fp-btn"); b.disabled = true; $("#fp-err").textContent = ""; $("#fp-ok").textContent = "";
    api("pw_forgot", { email: $("#fp-email").value }).then(function (r) { b.disabled = false; if (!r.ok) return ($("#fp-err").textContent = r.error); $("#fp-ok").textContent = r.message + (r.hint ? " " + r.hint : ""); });
  };
  var resetTok;
  function checkReset() {
    resetTok = (location.hash.match(/^#reset=([\w.]+)$/) || [])[1];
    if (!resetTok) return;
    var tries = 0, iv = setInterval(function () { if (++tries > 40) return clearInterval(iv); var a = $("#auth"); if (a && !a.hidden) { clearInterval(iv); authShow("rp-form"); $("#rp-pass").focus(); } }, 150);
  }
  checkReset(); window.addEventListener("hashchange", checkReset);
  if ($("#rp-form")) $("#rp-form").onsubmit = function (e) {
    e.preventDefault(); $("#rp-err").textContent = "";
    if ($("#rp-pass").value !== $("#rp-pass2").value) return ($("#rp-err").textContent = "The two passwords are not the same");
    var b = $("#rp-btn"); b.disabled = true;
    api("pw_reset", { token: resetTok, password: $("#rp-pass").value }).then(function (r) {
      b.disabled = false; if (!r.ok) return ($("#rp-err").textContent = r.error);
      history.replaceState(null, "", location.pathname); authShow("login-form"); $("#l-err").textContent = ""; toast(r.message);
    });
  };
})();
/* P39 Phase 4: composer layout (Reply/Note toggle above the input) */
(function () { var s = document.createElement("style"); s.textContent = ".lc-in{flex-wrap:wrap}.lc-in .lc-mode{flex-direction:row;flex-basis:100%;order:-1}.lc-in textarea{flex:1 1 220px;min-width:180px}.lc-top select#lc-as{min-width:140px;width:auto}"; document.head.appendChild(s); })();
