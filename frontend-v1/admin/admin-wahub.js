/* Woodex Admin — P39 Phase 6: WhatsApp hub.
   One place for WhatsApp: a shared tab strip (admin.js HUBS) on top of the existing screens,
   plus the new Overview page with if/then rules and "no reply" reminders. API: wah_* (api/wahub-lib.php). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, toast = W.toast, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  var css = document.createElement("style");
  css.textContent = ".wh-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px;padding:5px;background:var(--card);border:1px solid var(--line);border-radius:12px;width:max-content;max-width:100%}" +
    ".wh-tabs a{padding:7px 13px;border-radius:8px;font-size:13px;color:var(--txt2);text-decoration:none;white-space:nowrap}.wh-tabs a.on{background:#0c1628;color:#fff}.wh-tabs a:hover:not(.on){background:var(--bg)}" +
    ".wh-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:14px}.wh-k .card-b b{display:block;font-size:24px;line-height:1.15}.wh-k small{color:var(--mut);font-size:12px}" +
    ".wh-rule{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}.wh-rule:first-child{border-top:0}.wh-rule p{margin:2px 0 0;font-size:13px;color:var(--txt2)}" +
    ".wh-st{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.wh-dot{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:5px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line)}.wh-dot i{width:8px;height:8px;border-radius:50%;display:inline-block}";
  document.head.appendChild(css);

  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "—"; }
  var D = null;
  V.wahub = function (el) {
    el.innerHTML = W.head("WhatsApp hub", "Conversations / WhatsApp", '<a class="btn pri" href="#/wauto">' + ic("plus") + "New campaign</a>") + '<div id="wh-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    W.fillIcons(el); load();
  };
  function load() {
    api("wah_overview").then(function (r) {
      var b = $("#wh-b"); if (!b) return;
      if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      D = r; draw();
    });
  }
  function draw() {
    var r = D, b = $("#wh-b"), c = r.camp, edit = W.can("owner,admin");
    var tick = r.lastTick ? "Automation last ran " + esc(W.ago(r.lastTick)) : "Automation has not run yet (set up the cron job: Broadcasts & automations → Settings)";
    b.innerHTML =
      '<div class="wh-st"><span class="wh-dot"><i style="background:' + (r.connected ? "#12b76a" : "#f79009") + '"></i>' + (r.connected ? "WhatsApp connected" : 'WhatsApp not connected · <a href="#/settings/connections">Connect</a>') + "</span>" +
        '<span class="wh-dot"><i style="background:' + (r.lastTick ? "#12b76a" : "#98a2b3") + '"></i>' + tick + "</span>" +
        '<span class="wh-dot">Sent today <b style="margin-left:4px">' + r.today + " / " + r.cap + "</b></span>" +
        (r.wa.waiting ? '<a class="wh-dot" href="#/chat" style="text-decoration:none;color:#b42318"><i style="background:#f04438"></i>' + r.wa.waiting + " WhatsApp chat" + (r.wa.waiting > 1 ? "s" : "") + " waiting for you</a>" : "") + "</div>" +
      '<div class="wh-k">' +
        k(r.week, "Sent in 7 days", r.camps + " campaign" + (r.camps === 1 ? "" : "s") + (r.running ? " · " + r.running + " running" : "")) +
        k(pct(c.delivered, c.sent), "Delivered", c.delivered + " of " + c.sent + " campaign messages") +
        k(pct(c.read, c.sent), "Read", c.read + " read") +
        k(pct(c.replied, c.sent), "Replied", c.replied + " replies went to the Inbox") +
        k(r.autoSent, "Automatic messages", r.flowsOn + " flow" + (r.flowsOn === 1 ? "" : "s") + " / rule" + (r.flowsOn === 1 ? "" : "s") + " on") +
        k(r.approved + " / " + r.tpls, "Approved templates", '<a href="#/wauto" data-tpl>Check status with Meta</a>') +
        k(r.optout, "Opted out (STOP)", "Never messaged again") +
      "</div>" +
      '<div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:14px;align-items:start" class="wh-grid">' +
        '<div class="card"><div class="card-h"><h3>If / then rules</h3>' + (edit ? '<button class="btn sm pri" id="wh-new">' + ic("plus") + "New rule</button>" : "") + '</div><div class="card-b">' +
          '<p class="muted" style="margin:0 0 6px;font-size:13px">Example: <i>When a lead is in “Quote sent” with no contact for 5 days → send the follow-up template, tag “follow-up” and alert the team.</i> Each lead gets a rule once per stage.</p>' +
          (r.rules.length ? r.rules.map(rule).join("") : '<div class="empty" style="padding:22px 0">No rules yet.' + (edit ? " Click <b>New rule</b>." : "") + "</div>") + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>No-reply reminders</h3></div><div class="card-b">' +
          '<p class="muted" style="margin:0 0 10px;font-size:13px">If a customer waits too long, the team gets a reminder (bell, Telegram, note in the chat / lead).</p>' +
          '<label>Remind after (hours, 0 = off)<input type="number" id="wh-h" min="0" max="168" value="' + r.hub.remindHours + '"' + (edit ? "" : " disabled") + "></label>" +
          '<label class="check" style="margin:8px 0"><input type="checkbox" id="wh-rc"' + (r.hub.remindChats ? " checked" : "") + (edit ? "" : " disabled") + "><span>Chats waiting for a team reply (website, WhatsApp, Telegram)</span></label>" +
          '<label class="check" style="margin:8px 0"><input type="checkbox" id="wh-rl"' + (r.hub.remindLeads ? " checked" : "") + (edit ? "" : " disabled") + "><span>New leads nobody has contacted</span></label>" +
          (edit ? '<label style="margin-top:12px">WhatsApp Business Account ID <small class="muted">(for template status)</small><input id="wh-waba" inputmode="numeric" value="' + esc(r.hub.waba || "") + '" placeholder="e.g. 102938475610293"></label><small class="muted">Meta → WhatsApp Manager → Account tools → Phone numbers (top of the page).</small>' +
            '<div style="margin-top:12px;text-align:right"><button class="btn pri" id="wh-save">Save</button></div>' : "") +
        "</div></div>" +
      "</div>";
    W.fillIcons(b);
    if ($("#wh-new")) $("#wh-new").onclick = function () { ruleModal(); };
    if ($("#wh-save")) $("#wh-save").onclick = function () {
      api("wah_cfg_save", { hub: { remindHours: +$("#wh-h").value || 0, remindChats: $("#wh-rc").checked, remindLeads: $("#wh-rl").checked, waba: $("#wh-waba").value } }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(x.pending ? "Sent for Master approval" : "Saved"); if (x.hub) D.hub = x.hub; });
    };
    var tl = b.querySelector("[data-tpl]"); if (tl) tl.onclick = function () { (W.S.wag || (W.S.wag = {})).tab = "tpl"; };
    $$("[data-re]", b).forEach(function (x) { x.onclick = function () { ruleModal(D.rules.filter(function (y) { return y.id === x.dataset.re; })[0]); }; });
    $$("[data-rd]", b).forEach(function (x) { x.onclick = function () { if (!confirm("Delete this rule?")) return; api("wah_rule_delete", { id: x.dataset.rd }).then(function (y) { if (!y.ok) return toast(y.error, true); toast(y.pending ? "Sent for Master approval" : "Deleted"); load(); }); }; });
    $$("[data-ro]", b).forEach(function (x) { x.onchange = function () { var rr = D.rules.filter(function (y) { return y.id === x.dataset.ro; })[0]; if (!rr) return; var o = JSON.parse(JSON.stringify(rr)); o.on = x.checked; api("wah_rule_save", { rule: o }).then(function (y) { if (!y.ok) { x.checked = !x.checked; return toast(y.error, true); } toast(y.pending ? "Sent for Master approval" : x.checked ? "Rule on" : "Rule off"); load(); }); }; });
  }
  function k(v, l, h) { return '<div class="card"><div class="card-b"><b>' + v + '</b><div style="font-size:13px;font-weight:600;margin-top:2px">' + l + "</div><small>" + h + "</small></div></div>"; }
  function tplName(id) { var t = D.tplList.filter(function (x) { return x.id === id; })[0]; return t ? t.label : ""; }
  function userName(id) { var u = D.users.filter(function (x) { return x.id === +id; })[0]; return u ? u.name : ""; }
  function rule(r) {
    var acts = [];
    if (r.tpl) acts.push("send “" + esc(tplName(r.tpl) || "template") + "”");
    if (r.tag) acts.push("tag “" + esc(r.tag) + "”");
    if (r.assign) acts.push("assign to " + esc(userName(r.assign) || "user"));
    if (r.alert) acts.push("alert the team");
    var edit = W.can("owner,admin");
    return '<div class="wh-rule"><label class="switch" title="On / off"><input type="checkbox" data-ro="' + r.id + '"' + (r.on ? " checked" : "") + (edit ? "" : " disabled") + "><span></span></label>" +
      '<div style="flex:1;min-width:0"><b>' + esc(r.name) + "</b><p>When a lead is in <b>" + esc(D.stages[r.stage]) + "</b> " + (r.when === "created" ? r.days + " day" + (r.days === 1 ? "" : "s") + " after it came in" : "with no contact for " + r.days + " day" + (r.days === 1 ? "" : "s")) + " → " + acts.join(", ") + '.</p><small class="muted">Ran ' + (r.runs || 0) + " time" + (r.runs === 1 ? "" : "s") + " · WhatsApp sent " + (r.sent || 0) + (r.lastError ? ' · <span style="color:#b42318">last error: ' + esc(r.lastError) + "</span>" : "") + "</small></div>" +
      (edit ? '<div style="white-space:nowrap"><button class="btn sm" data-re="' + r.id + '">Edit</button> <button class="btn sm danger" data-rd="' + r.id + '" title="Delete">✕</button></div>' : "") + "</div>";
  }
  function ruleModal(r) {
    r = r || { id: "", name: "", on: true, stage: "quote", when: "quiet", days: 3, tpl: "", params: [], tag: "", assign: null, alert: false };
    var opt = function (o, v) { return Object.keys(o).map(function (x) { return '<option value="' + x + '"' + (x === v ? " selected" : "") + ">" + esc(o[x]) + "</option>"; }).join(""); };
    W.modal("<h3>" + (r.id ? "Edit rule" : "New rule") + "</h3>" +
      '<label>Name<input id="rm-n" maxlength="80" value="' + esc(r.name) + '" placeholder="e.g. Quote follow-up after 5 days"></label>' +
      '<h4 style="margin:14px 0 6px">If</h4><div style="display:grid;grid-template-columns:1.2fr .7fr 1.3fr;gap:8px"><label>Lead is in<select id="rm-s">' + opt(D.stages, r.stage) + '</select></label><label>for (days)<input id="rm-d" type="number" min="0" max="90" value="' + r.days + '"></label><label>counting from<select id="rm-w"><option value="quiet">last contact</option><option value="created"' + (r.when === "created" ? " selected" : "") + ">when it came in</option></select></label></div>" +
      '<h4 style="margin:14px 0 6px">Then</h4>' +
      '<label>Send WhatsApp template <small class="muted">(optional)</small><select id="rm-t"><option value="">— no message —</option>' + D.tplList.map(function (t) { return '<option value="' + t.id + '"' + (t.id === r.tpl ? " selected" : "") + ">" + esc(t.label) + (t.status && t.status !== "APPROVED" ? " (" + esc(t.status.toLowerCase()) + ")" : "") + "</option>"; }).join("") + "</select></label><div id=\"rm-p\"></div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Add tag <small class="muted">(optional)</small><input id="rm-g" maxlength="40" value="' + esc(r.tag || "") + '" placeholder="follow-up"></label><label>Assign to <small class="muted">(if nobody)</small><select id="rm-a"><option value="">— nobody —</option>' + D.users.map(function (u) { return '<option value="' + u.id + '"' + (+r.assign === u.id ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="check" style="margin:10px 0"><input type="checkbox" id="rm-al"' + (r.alert ? " checked" : "") + "><span>Alert the team on Telegram</span></label>" +
      '<label class="check" style="margin:4px 0 0"><input type="checkbox" id="rm-on"' + (r.on ? " checked" : "") + "><span>Rule is on</span></label>" +
      '<div class="modal-actions"><button class="btn ghost" onclick="WXA.closeModal()">Cancel</button><button class="btn pri" id="rm-sv">Save rule</button></div>');
    function params() {
      var t = D.tplList.filter(function (x) { return x.id === $("#rm-t").value; })[0], box = $("#rm-p");
      if (!t || !t.params.length) { box.innerHTML = ""; return; }
      var cur = $("#rm-t").value === r.tpl && r.params.length ? r.params : t.params;
      box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(' + Math.min(3, t.params.length) + ',1fr);gap:8px">' + t.params.map(function (p, i) { return '<label>{{' + (i + 1) + '}}<input data-pp value="' + esc(cur[i] || p) + '"></label>'; }).join("") + '</div><small class="muted">Use ' + Object.keys(D.vars).slice(0, 4).join(" ") + "</small>";
    }
    $("#rm-t").onchange = params; params();
    $("#rm-sv").onclick = function () {
      var o = { id: r.id, name: $("#rm-n").value, stage: $("#rm-s").value, days: +$("#rm-d").value || 0, when: $("#rm-w").value, tpl: $("#rm-t").value, params: $$("[data-pp]").map(function (x) { return x.value; }), tag: $("#rm-g").value, assign: +$("#rm-a").value || null, alert: $("#rm-al").checked, on: $("#rm-on").checked };
      this.disabled = true; var btn = this;
      api("wah_rule_save", { rule: o }).then(function (x) { btn.disabled = false; if (!x.ok) return toast(x.error, true); W.closeModal(); toast(x.pending ? "Sent for Master approval" : "Rule saved"); load(); });
    };
  }
  W.route();
})();
