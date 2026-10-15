/* Woodex Admin — P18 G: WhatsApp automation. Tabs: Campaigns | Audiences | Auto flows | Templates | Settings.
   API: wag_* (api/p18g-lib.php). Sending runs in the background (cron + this screen ticks every 30 s while a campaign is sending). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, wmodal = function (h) { W.modal(h, "wide wg-m"); }, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var STG = { new: "New", contacted: "Contacted", visit: "Site visit", quote: "Quote sent", won: "Won", lost: "Lost" };
  var ST = { draft: ["Draft", ""], scheduled: ["Scheduled", "info"], sending: ["Sending", "warn"], paused: ["Paused", "warn"], done: ["Completed", "ok"], cancelled: ["Cancelled", "bad"], failed: ["Failed", "bad"] };
  var css = document.createElement("style");
  css.textContent = ".modal-card.wg-m{width:min(1080px,94vw);max-width:none;max-height:92vh;overflow:auto}" + ".wg-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}@media(max-width:900px){.wg-kpis{grid-template-columns:1fr 1fr}}.wg-kpis .card{padding:16px 18px}.wg-kpis b{font-size:24px;display:block;margin-top:4px}.wg-kpis small{color:var(--mut);font-size:12.5px}" +
    ".wg-fun{display:flex;gap:2px;height:8px;border-radius:99px;overflow:hidden;background:var(--bg,#f2f4f7);min-width:140px}.wg-fun i{display:block;height:100%}.wg-nums{font-size:12px;color:var(--mut);white-space:nowrap}.wg-nums b{color:var(--txt,#101828)}" +
    ".wg-f{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 12px}.wg-f label{margin:0}.wg-f .full{grid-column:1/-1}.wg-stg{display:flex;flex-wrap:wrap;gap:6px}.wg-stg label{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:99px;padding:4px 10px;font-size:13px;cursor:pointer}.wg-stg input{margin:0;width:auto;min-height:0}" +
    ".wg-cnt{display:flex;align-items:center;gap:10px;background:var(--bg,#f7f7f8);border-radius:10px;padding:10px 14px;margin-top:12px;font-size:13.5px}.wg-cnt b{font-size:20px}" +
    ".wg-bub{background:#e7ffdb;border-radius:4px 12px 12px 12px;padding:10px 12px;font-size:13.5px;white-space:pre-wrap;line-height:1.5;box-shadow:0 1px 1px rgba(0,0,0,.08);max-width:420px}.wg-chat{background:#efeae2;border-radius:12px;padding:14px}" +
    ".wg-step{font:700 11px system-ui;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:18px 0 8px}.wg-step:first-child{margin-top:0}.wg-pm{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;font-size:13px}.wg-pm input{margin:0}" +
    ".wg-flow{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start;padding:16px 18px;border-bottom:1px solid var(--line)}.wg-flow:last-child{border:0}.wg-flow h4{margin:0 0 2px;font-size:14.5px}.wg-flow .switch{margin-top:2px}" +
    ".wg-two{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,1fr);gap:18px;align-items:start}@media(max-width:1000px){.wg-two{grid-template-columns:1fr}}";
  document.head.appendChild(css);

  var D = null;
  var fmtN = function (n) { return Number(n || 0).toLocaleString("en-PK"); };
  var tplById = function (id) { return (D.tpls || []).filter(function (t) { return t.id === id; })[0]; };
  function preview(t, params) {
    if (!t) return '<p class="muted">Choose a template to see the message.</p>';
    var s = { "{name}": "Ahmed", "{fullname}": "Ahmed Khan", "{company}": "Khan Traders", "{city}": "Lahore", "{ref}": "WI-10100", "{amount}": "250,000", "{date}": "12 Oct 2026", "{time}": "11:00 am", "{link}": "woodex.com.pk" };
    var txt = t.body.replace(/\{\{(\d+)\}\}/g, function (m, n) { var p = (params || t.params)[+n - 1] || ""; return p.replace(/\{[a-z]+\}/g, function (k) { return s[k] || k; }) || m; });
    return '<div class="wg-chat"><div class="wg-bub">' + esc(txt) + "</div></div>";
  }
  function paramUI(t, params, id) {
    if (!t || !t.params.length) return '<p class="muted" style="font-size:12.5px;margin:6px 0 0">This template has no variables.</p>';
    var opts = Object.keys(D.vars).map(function (k) { return '<option value="' + k + '">' + esc(D.vars[k]) + "</option>"; }).join("");
    return '<datalist id="' + id + '-dl">' + opts + '</datalist><div class="wg-pm">' + t.params.map(function (p, i) { return "<span>{{" + (i + 1) + '}}</span><input data-pm="' + i + '" list="' + id + '-dl" value="' + esc((params || t.params)[i] || "") + '" placeholder="{name} or any text">'; }).join("") + "</div>";
  }
  // ---- audience filter builder (used by Audiences tab + campaign dialog)
  function filterUI(f, id) {
    f = f || {}; var o = D.opts, dl = function (n, L) { return '<datalist id="' + id + n + '">' + L.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>"; };
    return '<div class="wg-f" data-filter="' + id + '">' + dl("-c", o.cities) + dl("-t", o.tags) +
      '<label>Who<select data-k="who"><option value="all">Leads + clients</option><option value="leads"' + (f.who === "leads" ? " selected" : "") + '>Leads only</option><option value="clients"' + (f.who === "clients" ? " selected" : "") + ">Clients only</option></select></label>" +
      '<label>Business line<select data-k="line"><option value="">Any</option>' + o.lines.map(function (l) { return "<option" + (f.line === l ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
      '<label>City<input data-k="city" list="' + id + '-c" value="' + esc(f.city || "") + '" placeholder="Any"></label>' +
      '<div class="full"><span style="font-size:13px;font-weight:500">Stage <small class="muted">(none ticked = any)</small></span><div class="wg-stg" style="margin-top:6px">' + Object.keys(STG).map(function (k) { return '<label><input type="checkbox" data-st="' + k + '"' + ((f.stages || []).indexOf(k) >= 0 ? " checked" : "") + "> " + STG[k] + "</label>"; }).join("") + "</div></div>" +
      '<label>Tag<input data-k="tag" list="' + id + '-t" value="' + esc(f.tag || "") + '" placeholder="Any"></label>' +
      '<label>No contact for (days)<input data-k="quiet" type="number" min="0" value="' + (f.quiet || "") + '" placeholder="Any"></label>' +
      '<label>Enquired in the last (days)<input data-k="recent" type="number" min="0" value="' + (f.recent || "") + '" placeholder="Any"></label></div>' +
      '<div class="wg-cnt" id="' + id + '-cnt"><b>…</b><span>people match</span></div>';
  }
  function readFilter(root) {
    var f = { stages: [] }; $$("[data-k]", root).forEach(function (x) { f[x.dataset.k] = x.value; }); $$("[data-st]:checked", root).forEach(function (x) { f.stages.push(x.dataset.st); }); return f;
  }
  function liveCount(root, id, onSample) {
    var t = null, run = function () { clearTimeout(t); t = setTimeout(function () { api("wag_audience", { filter: readFilter(root) }).then(function (r) { var c = $("#" + id + "-cnt"); if (!c || !r.ok) return; c.innerHTML = "<b>" + fmtN(r.count) + "</b><span>people match" + (r.optedOut ? " · " + r.optedOut + " opted out (excluded)" : "") + "</span>"; c.dataset.n = r.count; onSample && onSample(r); }); }, 250); };
    root.addEventListener("input", run); root.addEventListener("change", run); run();
  }

  W.VIEWS.wauto = function (el) {
    var S = W.S.wag || (W.S.wag = { tab: "camps" }), timer = null;
    el.innerHTML = head("WhatsApp automation", "Sales / WhatsApp", '<a class="btn" href="#/offers">' + ic("send") + 'Offers</a><button class="btn pri" id="wg-new">' + ic("plus") + "New campaign</button>") +
      '<div id="wg-banner"></div><div class="wg-kpis" id="wg-k"></div><div class="tabs" id="wg-tabs">' + [["camps", "Campaigns"], ["aud", "Audiences"], ["flows", "Auto flows"], ["tpl", "Templates"], ["set", "Settings"]].map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + "</button>"; }).join("") + '</div><div id="wg-body"><div class="empty">Loading…</div></div>';
    W.fillIcons(el);
    function load() {
      return api("wag_get").then(function (r) {
        if (!r.ok) { $("#wg-body").innerHTML = '<div class="empty">' + esc(r.error) + "</div>"; return; } D = r;
        $("#wg-banner").innerHTML = !r.connected ? '<div class="banner" style="margin-bottom:14px">' + ic("info") + ' WhatsApp Cloud API is not connected. Build your templates and audiences now; campaigns and auto flows start after you <a href="#/settings">connect WhatsApp</a>.</div>' : r.preview ? '<div class="banner" style="margin-bottom:14px">' + ic("info") + " Preview server: messages are <b>simulated</b> here. On the live site they are sent through your WhatsApp Cloud API number.</div>" : "";
        var sent = 0, rd = 0, rp = 0; r.camps.forEach(function (c) { sent += c.stats.sent; rd += c.stats.read; rp += c.stats.replied; });
        $("#wg-k").innerHTML = [["Sent today", fmtN(r.today), fmtN(r.left) + " left of the daily cap"], ["Campaign messages", fmtN(sent), r.camps.length + " campaigns"], ["Read rate", sent ? Math.round(rd / sent * 100) + "%" : "—", fmtN(rd) + " read"], ["Replies", fmtN(rp), (sent ? Math.round(rp / sent * 100) + "% reply rate · " : "") + r.optout + " opted out"]].map(function (k) { return '<div class="card"><small>' + k[0] + "</small><b>" + k[1] + "</b><small>" + k[2] + "</small></div>"; }).join("");
        tab(S.tab);
        clearInterval(timer); if (r.camps.some(function (c) { return c.status === "sending" || c.status === "scheduled"; }) || Object.keys(r.flows).some(function (k) { return r.flows[k].on; })) timer = setInterval(function () { if (!document.body.contains(el) || !$("#wg-tabs")) return clearInterval(timer); api("wag_tick").then(function (t) { if (t.ok && (t.camp || t.flows)) load(); }); }, 30000);
      });
    }
    function tab(t) { S.tab = t; $$("#wg-tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === t); }); var b = $("#wg-body"); ({ camps: camps, aud: aud, flows: flows, tpl: tpls, set: settings })[t](b); W.fillIcons(b); }
    $$("#wg-tabs button").forEach(function (b) { b.onclick = function () { tab(b.dataset.t); }; });
    $("#wg-new").onclick = function () { if (!D) return; if (!D.tpls.length) { toast("Add a Meta-approved template first", true); return tab("tpl"); } campaign(); };

    // ---------------- Campaigns
    function funnel(s) { var t = s.total || 1, seg = function (n, c) { return '<i style="width:' + (n / t * 100) + "%;background:" + c + '"></i>'; }; return '<div class="wg-fun">' + seg(s.replied, "#12b76a") + seg(s.read - s.replied, "#53b1fd") + seg(s.delivered - s.read, "#b2ddff") + seg(s.sent - s.delivered, "#d0d5dd") + seg(s.failed, "#f04438") + "</div>"; }
    function camps(b) {
      if (!D.camps.length) { b.innerHTML = '<div class="card card-b empty">' + ic("send") + "<p>No campaigns yet. A campaign sends one Meta-approved template to an audience — now or at a set time.</p><button class=\"btn pri\" id=\"wg-n2\">New campaign</button></div>"; $("#wg-n2").onclick = $("#wg-new").onclick; return; }
      b.innerHTML = '<div class="card"><table class="tbl"><thead><tr><th>Campaign</th><th>Status</th><th>Progress</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Failed</th><th></th></tr></thead><tbody>' + D.camps.map(function (c) {
        var s = c.stats, st = ST[c.status] || [c.status, ""], pct = function (n) { return s.sent ? Math.round(n / s.sent * 100) + "%" : "—"; };
        return '<tr data-c="' + c.id + '" style="cursor:pointer"><td><b>' + esc(c.name) + '</b><div class="muted" style="font-size:12px">' + esc(c.tplName) + " · " + (c.status === "scheduled" ? "starts " + esc(c.when.slice(0, 16)) : "created " + esc(W.ago(c.created_at))) + "</div></td>" +
          '<td><span class="badge ' + st[1] + '">' + st[0] + "</span></td><td>" + funnel(s) + '<div class="wg-nums" style="margin-top:4px"><b>' + fmtN(s.sent) + "</b> / " + fmtN(s.total) + " sent</div></td><td>" + pct(s.delivered) + "</td><td>" + pct(s.read) + "</td><td><b>" + fmtN(s.replied) + "</b></td><td>" + (s.failed ? '<span style="color:#d92d20">' + s.failed + "</span>" : "0") + '</td><td><button class="btn sm">Open</button></td></tr>';
      }).join("") + "</tbody></table></div>";
      $$("[data-c]", b).forEach(function (r) { r.onclick = function () { detail(r.dataset.c); }; });
    }
    function detail(id) {
      api("wag_camp_get", { id: id }).then(function (r) {
        if (!r.ok) return toast(r.error, true); var c = r.camp, s = c.stats, st = ST[c.status] || [c.status, ""];
        var acts = { draft: ["start", "cancel", "delete"], scheduled: ["pause", "cancel"], sending: ["pause", "cancel"], paused: ["resume", "cancel"], done: s.failed ? ["retry", "delete"] : ["delete"], cancelled: ["delete"], failed: ["delete"] }[c.status] || [];
        var AL = { start: "Start sending", pause: "Pause", resume: "Resume", cancel: "Cancel campaign", retry: "Retry " + s.failed + " failed", delete: "Delete" };
        var SB = { queued: "", sent: "", delivered: "info", read: "info", replied: "ok", failed: "bad", skipped: "" };
        wmodal("<h2>" + esc(c.name) + ' <span class="badge ' + st[1] + '">' + st[0] + "</span></h2>" + (c.error ? '<div class="banner" style="margin:8px 0;background:#fef3f2;border-color:#fecdca">' + esc(c.error) + "</div>" : "") +
          '<div class="wg-kpis" style="grid-template-columns:repeat(5,1fr);margin:12px 0">' + [["Audience", s.total], ["Sent", s.sent], ["Delivered", s.delivered], ["Read", s.read], ["Replied", s.replied]].map(function (k) { return '<div class="card"><small>' + k[0] + "</small><b>" + fmtN(k[1]) + "</b><small>" + (k[0] !== "Audience" && k[0] !== "Sent" && s.sent ? Math.round(k[1] / s.sent * 100) + "%" : k[0] === "Sent" && s.queued ? s.queued + " waiting" : "&nbsp;") + "</small></div>"; }).join("") + "</div>" +
          '<div class="wg-two"><div><div style="max-height:320px;overflow:auto"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Time</th></tr></thead><tbody>' + c.rcp.map(function (x) { return "<tr><td>" + esc(x.n) + "</td><td>+" + esc(x.p) + '</td><td><span class="badge ' + (SB[x.s] || "") + '"' + (x.e ? ' title="' + esc(x.e) + '"' : "") + ">" + esc(x.s) + "</span></td><td class=\"muted\">" + esc((x.t || "").slice(5, 16)) + "</td></tr>"; }).join("") + "</tbody></table></div>" + (s.total > c.rcp.length ? '<p class="muted" style="font-size:12px">Showing the first ' + c.rcp.length + "</p>" : "") + "</div>" +
          '<div><div class="wg-step">Message</div>' + preview(tplById(c.tpl) || { body: "(template deleted)", params: [] }, c.params) + '<p class="muted" style="font-size:12.5px">Template <b>' + esc(c.tplName) + "</b> · created by " + esc(c.created_by) + " · " + esc(c.created_at.slice(0, 16)) + (c.done_at ? " · finished " + esc(c.done_at.slice(0, 16)) : "") + "</p></div></div>" +
          '<div class="toolbar" style="margin-top:16px;justify-content:flex-end">' + acts.map(function (a) { return '<button class="btn' + (a === "start" || a === "resume" || a === "retry" ? " pri" : a === "delete" || a === "cancel" ? " danger" : "") + '" data-a="' + a + '">' + AL[a] + "</button>"; }).join("") + '<button class="btn" id="wg-x">Close</button></div>');
        $("#wg-x").onclick = closeModal;
        $$("[data-a]").forEach(function (bt) { bt.onclick = function () { var a = bt.dataset.a; if ((a === "cancel" || a === "delete") && !confirm(AL[a] + "?")) return; bt.disabled = true; api("wag_camp_action", { id: c.id, do: a }).then(function (x) { if (!x.ok) { bt.disabled = false; return toast(x.error, true); } closeModal(); toast("Done"); load(); }); }; });
      });
    }
    function campaign() {
      var t0 = D.tpls[0];
      wmodal('<h2>New campaign</h2><div class="wg-two"><div>' +
        '<div class="wg-step">1 · Message</div><label>Campaign name<input id="cg-n" placeholder="e.g. Eid offer — DHA leads"></label><label>Template <small class="muted">(approved in Meta)</small><select id="cg-t">' + D.tpls.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label) + " · " + esc(t.lang) + "</option>"; }).join("") + '</select></label><div id="cg-pm"></div>' +
        '<div class="wg-step">2 · Audience</div><label>Saved segment<select id="cg-s"><option value="">Custom filter below</option>' + D.segs.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("") + '</select></label><div id="cg-f">' + filterUI({}, "cgf") + "</div>" +
        '<div class="wg-step">3 · When</div><div class="seg blk" id="cg-w"><button class="on" data-w="now">Send now</button><button data-w="later">Schedule</button><button data-w="draft">Save as draft</button></div><input type="datetime-local" id="cg-at" hidden>' +
        '<p class="muted" style="font-size:12.5px">Sends at most <b>' + D.cfg.perTick + "</b> every few minutes and <b>" + fmtN(D.cfg.dailyCap) + "</b> per day" + (D.cfg.quietFrom ? ", never between " + D.cfg.quietFrom + " and " + D.cfg.quietTo : "") + '. People who replied STOP are skipped.</p></div>' +
        '<div><div class="wg-step">Preview</div><div id="cg-pv"></div><div class="wg-step">Who gets it (first 25)</div><div id="cg-sm" style="max-height:260px;overflow:auto;font-size:13px"></div></div></div>' +
        '<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="cg-c">Cancel</button><button class="btn pri" id="cg-go">' + ic("send") + "Send campaign</button></div>");
      var when = "now";
      var drawT = function () { var t = tplById($("#cg-t").value); $("#cg-pm").innerHTML = paramUI(t, null, "cgp"); $("#cg-pv").innerHTML = preview(t); };
      var params = function () { return $$("#cg-pm [data-pm]").map(function (i) { return i.value; }); };
      $("#cg-t").onchange = drawT; drawT();
      $("#cg-pm").addEventListener("input", function () { $("#cg-pv").innerHTML = preview(tplById($("#cg-t").value), params()); });
      var root = $('[data-filter="cgf"]');
      liveCount(root, "cgf", function (r) { $("#cg-sm").innerHTML = r.sample.length ? '<table class="tbl"><tbody>' + r.sample.map(function (x) { return "<tr><td>" + esc(x.name) + '</td><td class="muted">' + esc(x.city || "") + '</td><td><span class="badge">' + esc(x.kind === "client" ? "client" : STG[x.stage] || x.stage) + "</span></td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">No one matches.</p>'; });
      $("#cg-s").onchange = function () { var s = D.segs.filter(function (x) { return x.id === $("#cg-s").value; })[0]; $("#cg-f").innerHTML = filterUI(s ? s.filter : {}, "cgf"); root = $('[data-filter="cgf"]'); liveCount(root, "cgf", function (r) { $("#cg-sm").innerHTML = '<table class="tbl"><tbody>' + r.sample.map(function (x) { return "<tr><td>" + esc(x.name) + '</td><td class="muted">' + esc(x.city || "") + "</td></tr>"; }).join("") + "</tbody></table>"; }); };
      $$("#cg-w button").forEach(function (b) { b.onclick = function () { when = b.dataset.w; $$("#cg-w button").forEach(function (x) { x.classList.toggle("on", x === b); }); $("#cg-at").hidden = when !== "later"; $("#cg-go").lastChild.textContent = when === "later" ? "Schedule campaign" : when === "draft" ? "Save draft" : "Send campaign"; }; });
      $("#cg-c").onclick = closeModal;
      $("#cg-go").onclick = function () {
        var n = +($("#cgf-cnt").dataset.n || 0), b = this; if (!n) return toast("No one matches this audience", true);
        if (when === "later" && !$("#cg-at").value) return toast("Pick the date and time", true);
        if (when === "now" && !confirm("Send this WhatsApp message to " + fmtN(n) + " people now?")) return;
        b.disabled = true; api("wag_camp_save", { name: $("#cg-n").value, tpl: $("#cg-t").value, params: params(), seg: $("#cg-s").value, filter: readFilter(root), when: when === "later" ? $("#cg-at").value : "", draft: when === "draft" }).then(function (r) {
          b.disabled = false; if (!r.ok) return toast(r.error, true); closeModal(); toast(when === "now" ? "Campaign started — " + fmtN(r.camp.stats.sent) + " sent so far" : when === "later" ? "Campaign scheduled" : "Draft saved"); S.tab = "camps"; load();
        });
      };
    }

    // ---------------- Audiences
    function aud(b) {
      b.innerHTML = '<div class="wg-two"><div class="card"><div class="card-h"><h3>Build an audience</h3><span class="muted" style="font-size:12.5px">' + fmtN(D.contacts) + ' contacts with a phone number</span></div><div class="card-b"><input type="hidden" id="sg-id">' + filterUI({}, "sgf") +
        '<div class="toolbar" style="margin-top:12px"><input id="sg-n" placeholder="Segment name, e.g. DHA leads — no contact 30 days" style="flex:1;margin:0"><button class="btn pri" id="sg-save">' + ic("save") + "Save segment</button></div></div></div>" +
        '<div class="card"><div class="card-h"><h3>Saved segments</h3></div><div class="card-b" id="sg-l"></div></div></div>';
      var root = $('[data-filter="sgf"]'); liveCount(root, "sgf");
      var list = function () {
        $("#sg-l").innerHTML = D.segs.length ? D.segs.map(function (s) { var f = s.filter, bits = [f.who !== "all" ? f.who : "", f.line, f.city, f.stages.map(function (k) { return STG[k]; }).join("/"), f.tag ? "#" + f.tag : "", f.quiet ? "quiet " + f.quiet + "d" : "", f.recent ? "last " + f.recent + "d" : ""].filter(Boolean).join(" · ") || "everyone";
          return '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><div style="flex:1"><b>' + esc(s.name) + '</b><div class="muted" style="font-size:12px">' + esc(bits) + '</div></div><button class="btn sm" data-ld="' + s.id + '">Edit</button><button class="btn sm" data-us="' + s.id + '">Use</button><button class="btn sm danger" data-dl="' + s.id + '">✕</button></div>'; }).join("") : '<p class="muted">No segments yet. Set a filter on the left and save it.</p>';
        $$("[data-ld]").forEach(function (x) { x.onclick = function () { var s = D.segs.filter(function (y) { return y.id === x.dataset.ld; })[0]; root.outerHTML = filterUI(s.filter, "sgf").replace(/<div class="wg-cnt"[\s\S]*$/, ""); root = $('[data-filter="sgf"]'); liveCount(root, "sgf"); $("#sg-n").value = s.name; $("#sg-id").value = s.id; }; });
        $$("[data-us]").forEach(function (x) { x.onclick = function () { if (!D.tpls.length) return toast("Add a template first", true); campaign(); $("#cg-s").value = x.dataset.us; $("#cg-s").onchange(); }; });
        $$("[data-dl]").forEach(function (x) { x.onclick = function () { if (confirm("Delete this segment?")) api("wag_seg_delete", { id: x.dataset.dl }).then(function () { load(); }); }; });
      };
      list();
      $("#sg-save").onclick = function () { api("wag_seg_save", { id: $("#sg-id").value, name: $("#sg-n").value, filter: readFilter(root) }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Segment saved ✓"); load(); }); };
    }

    // ---------------- Auto flows
    function flows(b) {
      var HELP = { welcome: "Sent a few minutes after a new enquiry arrives (website form, chat or WhatsApp).", quote: "Sent when a quotation is still “sent” (no answer) after the number of days below. Follow-ups stop as soon as the customer replies or the quote is accepted.", quote2: "Second reminder (default day 3) if there is still no answer.", quote3: "Last, gentle reminder (default day 7).", invoice: "Sent the set number of days before an invoice's due date, while a balance is open.", invoice0: "Sent on the due date if the invoice still has a balance.", invoice_late: "Sent the set number of days after the due date while a balance is still open.", lead1: "New lead (stage New or Contacted) who has not written back. Stops as soon as they reply or the stage moves on.", lead2: "Second follow-up (default day 3) if the lead is still quiet.", lead3: "Last, gentle follow-up (default day 7), then the lead is left for the team.", booking: "Sent the day before a confirmed site visit, with the date and time." };
      var VARS = { welcome: "{name} {company} {city}", quote: "{name} {ref} {amount}", quote2: "{name} {ref}", quote3: "{name} {ref}", invoice: "{name} {ref} {amount} {date}", invoice0: "{name} {ref} {amount} {date}", invoice_late: "{name} {ref} {amount} {date}", lead1: "{name} {company} {city}", lead2: "{name}", lead3: "{name}", booking: "{name} {date} {time}" };
      b.innerHTML = '<div class="card">' + Object.keys(D.flowNames).map(function (k) {
        var f = D.flows[k], t = tplById(f.tpl);
        return '<div class="wg-flow" data-fl="' + k + '"><label class="switch"><input type="checkbox" data-on' + (f.on ? " checked" : "") + '><span></span></label><div><h4>' + esc(D.flowNames[k]) + '</h4><p class="muted" style="margin:0 0 10px;font-size:13px">' + HELP[k] + ' Useful variables: <code>' + VARS[k] + "</code></p>" +
          '<div class="wg-two" style="grid-template-columns:minmax(0,1fr) minmax(240px,.9fr)"><div><label>Template<select data-tp><option value="">— choose —</option>' + D.tpls.map(function (x) { return '<option value="' + x.id + '"' + (x.id === f.tpl ? " selected" : "") + ">" + esc(x.label) + "</option>"; }).join("") + "</select></label>" +
          (/^(quote|lead)/.test(k) || k === "invoice" || k === "invoice_late" ? '<label>' + (/^quote/.test(k) ? "Days after the quote was sent" : /^lead/.test(k) ? "Days after the enquiry" : k === "invoice" ? "Days before due date" : "Days after due date") + '<input type="number" min="0" max="30" data-days value="' + f.days + '"></label>' : "") + '<div data-pmw>' + paramUI(t, f.params, "fl" + k) + "</div></div><div data-pv>" + (t ? preview(t, f.params) : "") + "</div></div>" +
          '<details style="margin-top:8px"' + (f.mail ? " open" : "") + '><summary style="cursor:pointer;font-size:13px;font-weight:600">Email backup' + (f.mail ? " · on" : "") + '</summary><p class="muted" style="font-size:12.5px;margin:6px 0">Sent by email when WhatsApp is not possible (no number, not connected, or the message failed). Same variables work here.</p><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-ml' + (f.mail ? " checked" : "") + '> Send email when WhatsApp fails</label><label>Subject<input data-ms maxlength="120" value="' + esc(f.subject || "") + '" placeholder="Following up on your enquiry"></label><label>Message<textarea data-mb rows="4" maxlength="2000" placeholder="Hello {name}, …">' + esc(f.body || "") + "</textarea></label></details>" +
          '<p class="muted" style="font-size:12px;margin:8px 0 0">Sent <b>' + fmtN(f.sent) + "</b>" + (f.mailed ? " · emailed <b>" + fmtN(f.mailed) + "</b>" : "") + (f.failed ? " · failed " + f.failed + (f.lastError ? " (" + esc(f.lastError) + ")" : "") : "") + "</p></div></div>";
      }).join("") + '</div><div class="toolbar" style="margin-top:14px;justify-content:flex-end"><button class="btn pri" id="fl-save">' + ic("save") + "Save auto flows</button></div>" +
        (D.cronUrl ? '<p class="muted" style="font-size:12.5px">Auto flows run from the cron job (Settings tab) — and every 30 seconds while this screen is open.</p>' : "");
      $$("[data-fl]", b).forEach(function (r) {
        var pv = function () { var t = tplById($("[data-tp]", r).value); $("[data-pv]", r).innerHTML = t ? preview(t, $$("[data-pm]", r).map(function (i) { return i.value; })) : ""; };
        $("[data-tp]", r).onchange = function () { var t = tplById(this.value); $("[data-pmw]", r).innerHTML = paramUI(t, null, "fl" + r.dataset.fl); pv(); };
        r.addEventListener("input", function (e) { if (e.target.dataset.pm != null) pv(); });
      });
      $("#fl-save").onclick = function () {
        var fl = {}; $$("[data-fl]").forEach(function (r) { fl[r.dataset.fl] = { on: $("[data-on]", r).checked, tpl: $("[data-tp]", r).value, days: $("[data-days]", r) ? $("[data-days]", r).value : undefined, params: $$("[data-pm]", r).map(function (i) { return i.value; }), mail: $("[data-ml]", r).checked, subject: $("[data-ms]", r).value, body: $("[data-mb]", r).value }; });
        api("wag_flows_save", { flows: fl }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Auto flows saved ✓"); load(); });
      };
    }

    // ---------------- Templates
    function tstat(t) { var m = { APPROVED: ["Approved", "ok"], PENDING: ["Waiting for Meta", "warn"], IN_APPEAL: ["In appeal", "warn"], REJECTED: ["Rejected", "bad"], PAUSED: ["Paused", "bad"], DISABLED: ["Disabled", "bad"], NOT_FOUND: ["Not found in Meta", "bad"] }[t.status || ""]; return m ? '<span class="badge ' + m[1] + '" title="Checked ' + esc(t.checked || "") + '">' + m[0] + "</span>" : '<span class="muted" style="font-size:12px">Not checked</span>'; }
    function tpls(b) {
      b.innerHTML = '<div class="wg-two"><div class="card"><div class="card-h"><h3>Templates</h3><button class="btn sm" id="tp-sync" title="Ask Meta which templates are approved">Check status with Meta</button><button class="btn sm pri" id="tp-new">' + ic("plus") + "Add template</button></div><div class=\"card-b\">" +
        (D.tpls.length ? '<table class="tbl"><thead><tr><th>Template</th><th>Meta name</th><th>Language</th><th>Type</th><th>Meta status</th><th></th></tr></thead><tbody>' + D.tpls.map(function (t) { return "<tr><td><b>" + esc(t.label) + '</b></td><td><code>' + esc(t.name) + "</code></td><td>" + esc(({ en: "English", en_US: "English (US)", en_GB: "English (UK)", ur: "Urdu" })[t.lang] || t.lang) + "</td><td>" + esc(t.cat) + "</td><td>" + tstat(t) + '</td><td style="white-space:nowrap"><button class="btn sm" data-te="' + t.id + '">Edit</button> ' + (t.status === "APPROVED" || t.status === "PENDING" ? "" : '<button class="btn sm" data-tsub="' + t.id + '" title="Send this template to Meta for approval">Submit to Meta</button> ') + ' <button class="btn sm danger" data-td="' + t.id + '">✕</button></td></tr>'; }).join("") + "</tbody></table>" : '<p class="muted">No templates yet.</p>') + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>How templates work</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.65"><ol style="margin:0;padding-left:18px"><li>Meta only allows <b>approved templates</b> for messages to people who have not written to you in the last 24 hours.</li><li>Create the template in <b>Meta Business Manager → WhatsApp Manager → Message templates</b>. Use <code>{{1}}</code>, <code>{{2}}</code> … for the parts that change.</li><li>When Meta approves it, click <b>Add template</b> here: copy the <b>exact name</b>, language code and text.</li><li>Map each <code>{{n}}</code> to a value such as the customer\'s first name.</li></ol><p class="muted" style="margin:10px 0 0">Use <b>Marketing</b> for offers and <b>Utility</b> for reminders (cheaper, and allowed for auto flows).</p></div></div></div>';
      $("#tp-new").onclick = function () { tplEdit(); };
      $("#tp-sync").onclick = function () { var x = this; x.disabled = true; x.textContent = "Checking…"; api("wah_tpl_sync").then(function (r) { x.disabled = false; x.textContent = "Check status with Meta"; if (!r.ok) return toast(r.error, true); toast("Checked " + r.checked + " template" + (r.checked === 1 ? "" : "s")); load(); }); };
      $$("[data-te]", b).forEach(function (x) { x.onclick = function () { tplEdit(tplById(x.dataset.te)); }; });
      $$("[data-tsub]", b).forEach(function (x) { x.onclick = function () { if (!confirm("Send this template to Meta for approval? Meta usually answers within minutes to 24 hours.")) return; x.disabled = true; x.textContent = "Sending…"; api("wah_tpl_submit", { id: x.dataset.tsub }).then(function (r) { if (!r.ok) { x.disabled = false; x.textContent = "Submit to Meta"; return toast(r.error, true); } toast("Sent to Meta ✓ Status: " + r.status); load(); }); }; });
      $$("[data-td]", b).forEach(function (x) { x.onclick = function () { if (confirm("Delete this template from the list? (It stays in Meta.)")) api("wag_tpl_delete", { id: x.dataset.td }).then(function (r) { if (!r.ok) return toast(r.error, true); load(); }); }; });
    }
    function tplEdit(t) {
      t = t || { id: "", label: "", name: "", lang: "en", cat: "marketing", body: "Assalam o Alaikum {{1}}, ", params: ["{name}"] };
      wmodal("<h2>" + (t.id ? "Edit" : "Add") + ' template</h2><div class="wg-two"><div><label>Display name<input id="te-l" value="' + esc(t.label) + '" placeholder="e.g. Eid offer"></label><div class="grid2" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px"><label>Name in Meta<input id="te-n" value="' + esc(t.name) + '" placeholder="eid_offer_2026"></label><label>Language<input id="te-g" list="te-gl" value="' + esc(t.lang) + '" placeholder="en"><datalist id="te-gl"><option value="en">English</option><option value="en_US">English (US)</option><option value="ur">Urdu</option></datalist></label><label>Type<select id="te-c"><option value="marketing">Marketing</option><option value="utility"' + (t.cat === "utility" ? " selected" : "") + ">Utility</option></select></label></div>" +
        '<label>Template text (copy from Meta)<textarea id="te-b" rows="6">' + esc(t.body) + '</textarea></label><div class="wg-step">Variables</div><div id="te-pm"></div></div><div><div class="wg-step">Preview</div><div id="te-pv"></div>' +
        '<div class="wg-step">Send a test</div><div class="toolbar"><input id="te-ph" placeholder="Your WhatsApp number" style="flex:1;margin:0"><button class="btn" id="te-test"' + (t.id ? "" : " disabled title=\"Save first\"") + '>Test</button></div></div></div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="te-x">Cancel</button><button class="btn pri" id="te-s">Save</button></div>');
      var cur = function () { var body = $("#te-b").value, n = 0; body.replace(/\{\{(\d+)\}\}/g, function (m, k) { n = Math.max(n, +k); }); var ps = $$("#te-pm [data-pm]").map(function (i) { return i.value; }); while (ps.length < n) ps.push(t.params[ps.length] || "{name}"); return { body: body, params: ps.slice(0, n) }; };
      var draw = function (re) { var c = cur(); if (re) $("#te-pm").innerHTML = paramUI({ params: c.params }, c.params, "tep"); $("#te-pv").innerHTML = preview(c, c.params); };
      draw(true);
      $("#te-b").oninput = function () { draw(true); }; $("#te-pm").oninput = function () { draw(false); };
      $("#te-x").onclick = closeModal;
      $("#te-s").onclick = function () { var c = cur(); api("wag_tpl_save", { id: t.id, label: $("#te-l").value, name: $("#te-n").value, lang: $("#te-g").value, cat: $("#te-c").value, body: c.body, params: c.params }).then(function (r) { if (!r.ok) return toast(r.error, true); closeModal(); toast("Template saved ✓"); load(); }); };
      $("#te-test").onclick = function () { api("wag_test", { tpl: t.id, phone: $("#te-ph").value, params: cur().params }).then(function (r) { toast(r.ok ? (r.preview ? "Preview: test simulated ✓" : "Test sent — check your WhatsApp ✓") : r.error, !r.ok); }); };
    }

    // ---------------- Settings
    function settings(b) {
      var c = D.cfg;
      b.innerHTML = '<div class="wg-two"><div class="card"><div class="card-h"><h3>Sending limits</h3></div><div class="card-b"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px">' +
        '<label>Daily cap (messages per day)<input id="st-cap" type="number" min="1" value="' + c.dailyCap + '"></label><label>Per run (every ~5 min)<input id="st-pt" type="number" min="1" max="200" value="' + c.perTick + '"></label>' +
        '<label>Quiet hours from<input id="st-qf" type="time" value="' + esc(c.quietFrom) + '"></label><label>to<input id="st-qt" type="time" value="' + esc(c.quietTo) + '"></label></div>' +
        '<p class="muted" style="font-size:12.5px">Your Meta tier limits how many <b>new</b> people you can message per day (250 at first, then 1,000+). Keep the cap at or below it. Nothing is sent during quiet hours.</p><button class="btn pri" id="st-save">' + ic("save") + "Save</button></div></div>" +
        '<div class="card"><div class="card-h"><h3>Cron job (background sending)</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.6">' + (D.cronUrl ? "<ol style=\"margin:0 0 10px;padding-left:18px\"><li>Hostinger hPanel → <b>Advanced → Cron jobs</b>.</li><li>Type: <b>Custom</b>. Command:</li></ol><code style=\"display:block;word-break:break-all;background:var(--bg);padding:8px 10px;border-radius:8px\">wget -q -O /dev/null \"" + esc(/^http/.test(D.cronUrl) ? D.cronUrl : location.origin + D.cronUrl) + "\"</code><ol start=\"3\" style=\"margin:10px 0 0;padding-left:18px\"><li>Every <b>5 minutes</b> (*/5 * * * *). Save.</li></ol>" : "Ask the owner to set up the cron job.") +
        '<p class="muted" style="margin:10px 0 0">Last run: ' + (D.lastTick ? esc(W.ago(D.lastTick)) : "never") + "</p></div></div></div>" +
        '<div class="card" style="margin-top:18px"><div class="card-h"><h3>Opted out (STOP)</h3><span class="muted" style="font-size:12.5px">People who reply STOP are never sent campaigns or auto flows. START subscribes them again.</span></div><div class="card-b"><div class="toolbar"><input id="oo-p" placeholder="Add a number manually, e.g. 0300 1234567" style="flex:1;margin:0"><button class="btn" id="oo-add">Add</button></div><div id="oo-l" style="margin-top:10px"></div></div></div>';
      $("#st-save").onclick = function () { api("wag_flows_save", { flows: {}, cfg: { dailyCap: $("#st-cap").value, perTick: $("#st-pt").value, quietFrom: $("#st-qf").value, quietTo: $("#st-qt").value } }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Saved ✓"); load(); }); };
      var oo = function () { api("wag_optout_list").then(function (r) { $("#oo-l").innerHTML = r.list && r.list.length ? '<table class="tbl"><tbody>' + r.list.map(function (x) { return "<tr><td>" + esc(x.phone) + '</td><td class="muted">' + esc(x.t) + '</td><td style="text-align:right"><button class="btn sm" data-ur="' + esc(x.phone) + '">Remove</button></td></tr>'; }).join("") + "</tbody></table>" : '<p class="muted">Nobody has opted out.</p>'; $$("[data-ur]").forEach(function (x) { x.onclick = function () { api("wag_optout", { phone: x.dataset.ur, remove: true }).then(oo); }; }); }); };
      oo(); $("#oo-add").onclick = function () { api("wag_optout", { phone: $("#oo-p").value }).then(function (r) { if (!r.ok) return toast(r.error, true); $("#oo-p").value = ""; oo(); }); };
    }
    load();
  };
})();
