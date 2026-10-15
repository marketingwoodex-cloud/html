/* Phase 12: Client updates (automatic WhatsApp + email at key steps) */
(function () {
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast;
  var HINT = { lead: "Sent when a customer submits a form on the website.", quote: "Sent when a quotation's status changes from Draft to Sent.", started: "Sent once when a project moves to Execution.", handover: "Sent once when a project moves to Handover or Completed." };
  var css = document.createElement("style");
  css.textContent = ".nt-ev{border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:14px 16px;margin-bottom:12px}.nt-ev h4{margin:0;display:flex;align-items:center;gap:10px;font-size:15px}.nt-ev h4 small{font-weight:400;color:#6b7280;font-size:12.5px}.nt-ev h4 .sw{margin-left:auto}" +
    ".nt-ev textarea{font-size:13.5px;line-height:1.5}.nt-ev .row{display:grid;grid-template-columns:1fr 220px;gap:10px}@media(max-width:800px){.nt-ev .row{grid-template-columns:1fr}}.nt-ph{font-size:12px;color:#6b7280;margin:6px 0 0}.nt-ph code{background:var(--soft,#f3f4f6);padding:1px 5px;border-radius:4px}" +
    ".nt-log{width:100%;border-collapse:collapse;font-size:13px}.nt-log td,.nt-log th{padding:7px 8px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left}.nt-ok{color:#15803d}.nt-bad{color:#b91c1c}";
  document.head.appendChild(css);

  W.VIEWS.updates = function (el) {
    el.innerHTML = W.head("Client updates", "Client updates", '<button class="btn pri" id="nt-save">' + ic("check") + "Save</button>") + '<div class="card" id="ld-card" style="padding:18px">Loading…</div>';
    W.fillIcons(el);
    api("notify_get").then(function (r) {
      if (!r.ok) { (el.querySelector("#ld-card") || el.querySelector(".card")).textContent = r.error; return; }
      var c = r.cfg;
      (el.querySelector("#ld-card") || el.querySelector(".card")).outerHTML =
        ((!r.waReady || !r.emailReady) ? '<div class="banner" style="margin-bottom:12px">' + (!r.waReady ? "WhatsApp is not connected. " : "") + (!r.emailReady ? "Email (SMTP) is not set up. " : "") + 'Add them in <a href="#/settings">Settings → Integrations</a>.</div>' : "") +
        '<div class="card" style="padding:18px;margin-bottom:16px"><p style="margin-top:0">Clients get a message automatically at these steps, in <b>English + Urdu</b>. Each step is sent once per project.</p>' +
        "<label class='check'><input type='checkbox' id='nt-wa'" + (c.wa ? " checked" : "") + "> Send by WhatsApp</label><label class='check'><input type='checkbox' id='nt-em'" + (c.email ? " checked" : "") + "> Send by email</label>" +
        '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:10px"><label style="margin:0">Test to phone<input id="nt-tp" placeholder="03xx xxxxxxx" style="width:170px"></label><label style="margin:0">or email<input id="nt-te" placeholder="you@example.com" style="width:220px"></label></div></div>' +
        Object.keys(r.events).map(function (k) {
          var e = c.ev[k];
          return '<div class="nt-ev" data-k="' + k + '"><h4>' + esc(r.events[k]) + "<small>" + esc(HINT[k]) + '</small><label class="check sw" style="margin:0"><input type="checkbox" class="on"' + (e.on ? " checked" : "") + "> On</label></h4>" +
            '<div class="row" style="margin-top:10px"><div><label>Message<textarea class="tx" rows="8" dir="auto">' + esc(e.text) + '</textarea></label><p class="nt-ph">Placeholders: <code>{name}</code> <code>{ref}</code> <code>{project}</code> <code>{link}</code> <code>{company}</code> <code>{phone}</code></p></div>' +
            '<div><label>Email subject<input class="sb" value="' + esc(e.subject) + '"></label><label>WhatsApp template <small class="muted">(optional)</small><input class="tp" placeholder="e.g. work_started" value="' + esc(e.tpl) + '"></label>' +
            '<button class="btn sm ts">' + ic("send") + "Send test</button></div></div></div>";
        }).join("") +
        '<div class="card" style="padding:18px;margin-top:16px"><h4 style="margin:0 0 6px">About WhatsApp templates</h4><p class="muted" style="font-size:13px;margin:0 0 6px">WhatsApp only delivers free-text messages if the client messaged you in the last 24 hours. To always reach them, create a <b>message template</b> in Meta (WhatsApp Manager → Message templates), wait for approval, and enter its name above. Use <code>{{1}}</code> for the client name and <code>{{2}}</code> for the quote number or project.</p>' +
        '<label style="max-width:200px">Template language code<input id="nt-lang" value="' + esc(c.waLang) + '"></label></div>' +
        '<div class="card" style="padding:18px;margin-top:16px"><h4 style="margin:0 0 8px">Recent updates sent</h4>' +
        (r.log.length ? '<table class="nt-log"><tr><th>When</th><th>Step</th><th>Client</th><th>To</th><th>Result</th></tr>' + r.log.map(function (l) {
          return "<tr><td>" + esc(W.ago(l.t)) + "</td><td>" + esc(r.events[l.event] || l.event) + "</td><td>" + esc(l.name || "") + " <small class='muted'>" + esc(l.ref || "") + "</small></td><td>" + (l.channel === "wa" ? "WhatsApp " : "Email ") + esc(l.dest) + '</td><td class="' + (l.result === "sent" ? "nt-ok" : "nt-bad") + '">' + esc(l.result) + "</td></tr>";
        }).join("") + "</table>" : '<p class="muted">Nothing sent yet.</p>') + "</div>";
      W.fillIcons(el);
      function collect() {
        var ev = {}; $$(".nt-ev", el).forEach(function (b) { ev[b.dataset.k] = { on: b.querySelector(".on").checked, text: b.querySelector(".tx").value, subject: b.querySelector(".sb").value, tpl: b.querySelector(".tp").value }; });
        return { wa: $("#nt-wa").checked, email: $("#nt-em").checked, waLang: $("#nt-lang").value, ev: ev };
      }
      function save() { return api("notify_save", { cfg: collect() }); }
      $("#nt-save").onclick = function () { save().then(function (x) { if (!x.ok) return toast(x.error, true); toast("Client updates saved ✓"); }); };
      $$(".ts", el).forEach(function (b) {
        b.onclick = function () {
          var k = b.closest(".nt-ev").dataset.k; b.disabled = true;
          save().then(function () { return api("notify_test", { event: k, phone: $("#nt-tp").value, email: $("#nt-te").value }); }).then(function (x) {
            b.disabled = false; if (!x.ok) return toast(x.error, true);
            var m = Object.keys(x.result).map(function (ch) { return ch + ": " + x.result[ch]; }).join(" · "); toast(m, !/sent/.test(m)); W.VIEWS.updates(el);
          });
        };
      });
    });
  };
})();
