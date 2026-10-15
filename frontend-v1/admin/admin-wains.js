/* Woodex Admin — P40 C: Conversation & follow-up insights.
   Chats per channel per day, leads and sources, sales funnel, first reply time (AI vs team),
   follow-up automation results and recent campaigns. API: wah_insights (api/wahub-lib.php). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  var css = document.createElement("style");
  css.textContent = ".wi-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}.wi-k .card-b b{display:block;font-size:24px;line-height:1.15}.wi-k small{color:var(--mut);font-size:12px}" +
    ".wi-g{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;margin-bottom:14px}@media(max-width:1000px){.wi-g{grid-template-columns:1fr}}" +
    ".wi-ch{display:flex;align-items:flex-end;gap:4px;height:170px;padding:8px 0 0}.wi-ch .c{flex:1;display:flex;flex-direction:column-reverse;min-width:0;height:100%;position:relative}.wi-ch .c i{display:block;width:100%}.wi-ch .c:hover{outline:1px solid var(--line)}" +
    ".wi-ax{display:flex;gap:4px;font-size:10.5px;color:var(--mut);margin-top:4px}.wi-ax span{flex:1;text-align:center;min-width:0;overflow:hidden}" +
    ".wi-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;margin-top:10px}.wi-lg b{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}" +
    ".wi-f{display:grid;grid-template-columns:110px 1fr 44px;gap:10px;align-items:center;font-size:13px;margin:7px 0}.wi-f .bar{height:10px;border-radius:99px;background:var(--bg,#f2f4f7);overflow:hidden}.wi-f .bar i{display:block;height:100%;background:#0c1628;border-radius:99px}.wi-f.won .bar i{background:#16a34a}.wi-f.lost .bar i{background:#b8956a}";
  document.head.appendChild(css);
  var COL = { web: "#0c1628", wa: "#16a34a", tg: "#2aabee", leads: "#b8956a" };
  var SRC = { form: "Website form", contact: "Contact form", quote: "Quote form", chat: "Live chat", whatsapp: "WhatsApp", wa: "WhatsApp", telegram: "Telegram", booking: "Site visit booking", manual: "Added by team", other: "Other" };
  var days = 14;
  function dur(s) { if (s == null) return "—"; if (s < 60) return s + " sec"; if (s < 3600) return Math.round(s / 60) + " min"; if (s < 86400) return (s / 3600).toFixed(1).replace(".0", "") + " h"; return Math.round(s / 86400) + " days"; }
  function n(x) { return (+x || 0).toLocaleString("en-US"); }

  V.wainsights = function (el) {
    el.innerHTML = W.head("Insights", "Conversations / WhatsApp", '<select id="wi-d" style="width:auto;margin:0"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>') +
      '<div id="wi-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    $("#wi-d").value = String(days);
    $("#wi-d").onchange = function () { days = +this.value; load(); };
    W.fillIcons(el); load();
  };
  function load() {
    api("wah_insights", { days: days }).then(function (r) {
      var b = $("#wi-b"); if (!b) return;
      if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      draw(b, r); W.fillIcons(b);
    });
  }
  function draw(b, r) {
    var t = { web: 0, wa: 0, tg: 0, leads: 0, auto: 0 }; r.series.forEach(function (d) { for (var k in t) t[k] += d[k]; });
    var chats = t.web + t.wa + t.tg, max = 1; r.series.forEach(function (d) { max = Math.max(max, d.web + d.wa + d.tg, d.leads); });
    var every = Math.ceil(r.series.length / 14);
    var bars = r.series.map(function (d) {
      var tip = d.d + " · Website " + d.web + " · WhatsApp " + d.wa + " · Telegram " + d.tg + " · Leads " + d.leads;
      return '<div class="c" title="' + esc(tip) + '">' + ["web", "wa", "tg"].map(function (k) { return d[k] ? '<i style="height:' + (d[k] / max * 100) + "%;background:" + COL[k] + '"></i>' : ""; }).join("") +
        (d.leads ? '<span style="position:absolute;left:50%;bottom:' + (d.leads / max * 100) + '%;width:7px;height:7px;margin:0 0 -3px -3.5px;border-radius:50%;background:' + COL.leads + ';border:1.5px solid #fff"></span>' : "") + "</div>";
    }).join("");
    var axis = r.series.map(function (d, i) { var dt = new Date(d.d + "T00:00:00"); return "<span>" + (i % every === 0 ? dt.getDate() + " " + dt.toLocaleString("en", { month: "short" }) : "") + "</span>"; }).join("");
    var fmax = 1; Object.keys(r.funnel).forEach(function (k) { fmax = Math.max(fmax, r.funnel[k]); });
    var srcK = Object.keys(r.sources), smax = 1; srcK.forEach(function (k) { smax = Math.max(smax, r.sources[k]); });
    b.innerHTML =
      '<div class="wi-k">' +
      k(n(chats), "Conversations", "Website " + t.web + " · WhatsApp " + t.wa + " · Telegram " + t.tg) +
      k(n(t.leads), "New leads", chats && t.leads <= chats ? Math.round(t.leads * 100 / chats) + "% of conversations" : "from all sources") +
      k(dur(r.reply.ai), "AI first reply", r.reply.aiN ? "median of " + r.reply.aiN + " chats" : "no AI replies yet") +
      k(dur(r.reply.team), "Team first reply", r.reply.teamN ? "median of " + r.reply.teamN + " chats" : "no team replies yet") +
      k(r.winRate == null ? "—" : r.winRate + "%", "Win rate", "won ÷ (won + lost), last 90 days") +
      k(n(t.auto), "Automated messages", "follow-ups, rules and campaigns") + "</div>" +
      '<div class="wi-g"><div class="card"><div class="card-h"><h3>Conversations and leads per day</h3></div><div class="card-b"><div class="wi-ch">' + bars + '</div><div class="wi-ax">' + axis + "</div>" +
      '<div class="wi-lg"><span><b style="background:' + COL.web + '"></b>Website chat</span><span><b style="background:' + COL.wa + '"></b>WhatsApp</span><span><b style="background:' + COL.tg + '"></b>Telegram</span><span><b style="background:' + COL.leads + ';border-radius:50%"></b>New leads</span></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Sales funnel</h3><span class="muted" style="font-size:12px">leads from the last 90 days</span></div><div class="card-b">' +
      Object.keys(r.stages).map(function (s) { return '<div class="wi-f ' + s + '"><span>' + esc(r.stages[s]) + '</span><div class="bar"><i style="width:' + (r.funnel[s] / fmax * 100) + '%"></i></div><b style="text-align:right">' + r.funnel[s] + "</b></div>"; }).join("") +
      '<a href="#/leads" class="btn sm" style="margin-top:8px">Open leads</a></div></div></div>' +
      '<div class="wi-g"><div class="card"><div class="card-h"><h3>Follow-up automation</h3><a class="btn sm" href="#/wauto">Edit follow-ups</a></div><div class="card-b">' +
      (r.flows.length ? '<table class="tbl"><thead><tr><th>Follow-up</th><th>Status</th><th style="text-align:right">WhatsApp</th><th style="text-align:right">Email</th><th style="text-align:right">Failed</th></tr></thead><tbody>' +
        r.flows.map(function (f) { return "<tr><td>" + esc(f.name) + "</td><td>" + (f.on ? '<span class="badge ok">On</span>' : '<span class="badge">Off</span>') + '</td><td style="text-align:right">' + n(f.sent) + '</td><td style="text-align:right">' + n(f.mailed) + '</td><td style="text-align:right">' + (f.failed ? '<span style="color:#b42318">' + n(f.failed) + "</span>" : "0") + "</td></tr>"; }).join("") + "</tbody></table>"
        : '<p class="muted" style="margin:0">No follow-ups are on yet. Turn them on under <a href="#/wauto">Broadcasts &amp; automations → Auto flows</a>: new-lead follow-ups (day 1, 3, 7), quote follow-ups (day 1, 3, 7) and invoice reminders (before, on and after the due date).</p>') +
      "</div></div>" +
      '<div class="card"><div class="card-h"><h3>Where leads come from</h3></div><div class="card-b">' +
      (srcK.length ? srcK.map(function (s) { return '<div class="wi-f"><span>' + esc(SRC[s] || s) + '</span><div class="bar"><i style="width:' + (r.sources[s] / smax * 100) + '%;background:#b8956a"></i></div><b style="text-align:right">' + r.sources[s] + "</b></div>"; }).join("") : '<p class="muted" style="margin:0">No leads in this period.</p>') +
      "</div></div></div>" +
      '<div class="card"><div class="card-h"><h3>Recent campaigns</h3><span class="muted" style="font-size:12px">' + r.optout + " opted out (STOP)</span></div><div class=\"card-b\">" +
      (r.camps.length ? '<table class="tbl"><thead><tr><th>Campaign</th><th>Status</th><th style="text-align:right">Sent</th><th style="text-align:right">Delivered</th><th style="text-align:right">Read</th><th style="text-align:right">Replied</th></tr></thead><tbody>' +
        r.camps.map(function (c) { var p = function (x) { return c.sent ? " <small class=\"muted\">" + Math.round(x * 100 / c.sent) + "%</small>" : ""; }; return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.status) + '</td><td style="text-align:right">' + n(c.sent) + '</td><td style="text-align:right">' + n(c.delivered) + p(c.delivered) + '</td><td style="text-align:right">' + n(c.read) + p(c.read) + '</td><td style="text-align:right">' + n(c.replied) + p(c.replied) + "</td></tr>"; }).join("") + "</tbody></table>"
        : '<p class="muted" style="margin:0">No campaigns yet.</p>') + "</div></div>";
  }
  function k(v, l, h) { return '<div class="card"><div class="card-b"><b>' + v + '</b><div style="font-size:13px;font-weight:600;margin-top:2px">' + l + "</div><small>" + esc(h) + "</small></div></div>"; }
  if (location.hash.indexOf("#/wainsights") === 0 && W.route) W.route();
})();
