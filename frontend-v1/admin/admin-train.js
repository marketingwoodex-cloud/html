/* Phase 11: Train AI (shared brain for website live chat + WhatsApp agent) */
(function () {
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast;
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var TONES = { designer: "Professional designer (recommended)", friendly: "Friendly", professional: "Professional", sales: "Sales-focused", simple: "Very simple" };
  var css = document.createElement("style");
  css.textContent = ".tr{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:18px;align-items:start}@media(max-width:1100px){.tr{grid-template-columns:1fr}}" +
    ".tr-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}.tr-tabs button{border:1px solid var(--line,#e5e7eb);background:var(--card,#fff);color:inherit;border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}.tr-tabs button.on{background:#0c1628;color:#fff;border-color:#0c1628}" +
    ".tr-p{display:none}.tr-p.on{display:block}.tr-p label{display:block;margin-bottom:12px}.tr-qa{border:1px solid var(--line,#e5e7eb);border-radius:10px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:6px}.tr-qa input,.tr-qa textarea{width:100%}.tr-qa .x{align-self:start}" +
    ".tr-days{display:flex;gap:6px;flex-wrap:wrap}.tr-days label{display:flex;gap:4px;align-items:center;margin:0;border:1px solid var(--line,#e5e7eb);border-radius:8px;padding:5px 9px;font-size:13px}" +
    ".tr-t{position:sticky;top:84px;border:1px solid var(--line,#e5e7eb);border-radius:14px;background:var(--card,#fff);display:flex;flex-direction:column;height:560px;overflow:hidden}.tr-t h4{margin:0;padding:12px 14px;border-bottom:1px solid var(--line,#e5e7eb);display:flex;gap:8px;align-items:center;font-size:14px}.tr-t h4 select{margin-left:auto;width:auto;font-size:12px;padding:4px 6px}" +
    ".tr-m{flex:1;overflow:auto;padding:14px;background:#efeae2;display:flex;flex-direction:column;gap:8px}.tr-b{max-width:85%;padding:9px 12px;border-radius:12px;font:400 14.5px/1.55 Inter,system-ui,sans-serif;white-space:pre-wrap;word-break:break-word;color:#111b21;box-shadow:0 1px 1px rgba(0,0,0,.08);position:relative}.tr-b.u{align-self:flex-end;background:#d9fdd3;border-bottom-right-radius:4px}.tr-b.a{align-self:flex-start;background:#fff;border-bottom-left-radius:4px}.tr-b.s{align-self:center;background:#fff3c4;color:#5b4a00;font-size:12.5px;box-shadow:none}.tr-b.err{align-self:center;background:#fee4e2;color:#912018;font-size:13px}.tr-b .cp{display:block;margin-top:6px;font-size:11.5px;color:#667085;background:none;border:0;padding:0;cursor:pointer}.tr-b .cp:hover{color:#111b21}html.dark .tr-m{background:#0b141a}html.dark .tr-b{color:#e9edef}html.dark .tr-b.u{background:#005c4b}html.dark .tr-b.a{background:#202c33}html.dark .tr-b.s{background:#3a3212;color:#f5e6a8}html.dark .tr-b.err{background:#55160c;color:#fecdca}html.dark .tr-b .cp{color:#8696a0}" +
    ".tr-in{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line,#e5e7eb)}.tr-in input{flex:1}.tr-code{font-family:monospace;background:var(--soft,#f3f4f6);padding:8px 10px;border-radius:8px;word-break:break-all;display:flex;gap:8px;align-items:center;justify-content:space-between;font-size:12.5px}.tr-steps li{margin-bottom:6px}";
  document.head.appendChild(css);

  W.VIEWS.train = function (el) {
    el.innerHTML = W.head("AI agent", "AI agent · training", '<button class="btn pri" id="tr-save">' + ic("check") + "Save training</button>") + '<div class="card" id="ld-card" style="padding:18px">Loading…</div>';
    W.fillIcons(el);
    api("chat_cfg_get").then(function (r) {
      if (!r.ok) { (el.querySelector("#ld-card") || el.querySelector(".card")).textContent = r.error; return; }
      var c = r.cfg, qa = (c.qa || []).slice(), hook = location.origin + "/api/whatsapp.php";
      (el.querySelector("#ld-card") || el.querySelector(".card")).outerHTML = (r.aiReady ? "" : '<div class="banner" style="margin-bottom:12px">Add an AI key first in <a href="#/posts">Blog &amp; insights → AI settings</a>. Without it the assistant cannot answer.</div>') +
        '<div class="tr"><div class="card" style="padding:18px"><div class="tr-tabs">' +
        ["Knowledge & tone", "Q&A pairs", "Prices", "Do not answer", "Hours", "WhatsApp"].map(function (t, i) { return '<button data-i="' + i + '"' + (i ? "" : ' class="on"') + ">" + t + "</button>"; }).join("") + "</div>" +
        // 0 knowledge
        '<div class="tr-p on"><label>Tone<select id="t-tone">' + Object.keys(TONES).map(function (k) { return '<option value="' + k + '"' + (c.tone === k ? " selected" : "") + ">" + TONES[k] + "</option>"; }).join("") + "</select></label>" +
        '<label>Extra style note <small class="muted">(optional, e.g. "Call the customer Sir/Madam")</small><input id="t-tn" value="' + esc(c.toneNote || "") + '"></label>' +
        '<label>What the AI should know <small class="muted">(services, areas, process, policies)</small><textarea id="t-k" rows="12">' + esc(c.knowledge) + "</textarea></label>" +
        '<p class="muted" style="font-size:12.5px">It replies in the customer\'s language (English, Urdu or Roman Urdu). Published FAQs are added automatically.</p></div>' +
        // 1 qa
        '<div class="tr-p"><p class="muted" style="margin-top:0">Add common questions with your exact answer. The AI uses these first.</p><div id="t-qa"></div><button class="btn sm" id="t-qa-add">' + ic("plus") + "Add Q&amp;A</button></div>" +
        // 2 prices
        '<label class="check" style="margin-bottom:10px"><input type="checkbox" id="t-np"' + (c.noPrices !== false ? " checked" : "") + '> <b>Never quote prices</b> — the AI offers a site visit or a detailed quotation instead (rates below are ignored while this is on)</label>' +
        '<div class="tr-p"><label>Starting rates the AI may share <small class="muted">(one per line; it always adds "final quote after site visit")</small><textarea id="t-pr" rows="10" placeholder="Interior design (home): from Rs 150 per sq ft&#10;Office fit-out: from Rs 2,500 per sq ft&#10;3D views: from Rs 25,000 per room">' + esc(c.prices || "") + '</textarea></label><p class="muted" style="font-size:12.5px">Leave empty and the AI will never quote numbers.</p></div>' +
        // 3 avoid
        '<div class="tr-p"><label>Topics the AI must not answer <small class="muted">(one per line; it hands these to the team)</small><textarea id="t-av" rows="8">' + esc(c.avoid || "") + "</textarea></label></div>" +
        // 4 hours
        '<div class="tr-p"><label>Working days</label><div class="tr-days" style="margin:-6px 0 12px">' + DAYS.map(function (d, i) { return '<label><input type="checkbox" class="t-d" value="' + i + '"' + ((c.days || []).indexOf(i) > -1 ? " checked" : "") + ">" + d + "</label>"; }).join("") + "</div>" +
        '<div style="display:flex;gap:12px"><label style="flex:1">Opens<input type="time" id="t-of" value="' + esc(c.openFrom) + '"></label><label style="flex:1">Closes<input type="time" id="t-ot" value="' + esc(c.openTo) + '"></label></div>' +
        '<label>Hours text shown to customers<input id="t-h" value="' + esc(c.hours) + '"></label>' +
        '<label>After-hours reply <small class="muted">(used when no AI answer is available)</small><textarea id="t-ah" rows="3">' + esc(c.afterHours) + "</textarea></label></div>" +
        // 5 whatsapp
        '<div class="tr-p"><label class="check"><input type="checkbox" id="t-wa"' + (c.waAgent ? " checked" : "") + "> Turn on the WhatsApp AI agent</label>" +
        '<label>First reply when AI is not available<textarea id="t-wg" rows="2">' + esc(c.waGreeting) + "</textarea></label>" +
        "<h4 style='margin:14px 0 6px'>Connect in Meta (one time)</h4><ol class='tr-steps' style='padding-left:18px;font-size:13.5px'>" +
        "<li>Open <b>developers.facebook.com</b> → your app → <b>WhatsApp → API Setup</b>. Copy the <b>Phone number ID</b> and a <b>permanent access token</b> into Admin → Settings → Integrations → WhatsApp.</li>" +
        "<li>Go to <b>WhatsApp → Configuration → Webhook → Edit</b> and paste:<div class='tr-code' style='margin:6px 0'><span>" + esc(hook) + "</span><button class='btn sm' data-cp='" + esc(hook) + "'>Copy</button></div>Verify token:<div class='tr-code' style='margin:6px 0'><span>" + esc(c.waVerify || "(save once to create)") + "</span>" + (c.waVerify ? "<button class='btn sm' data-cp='" + esc(c.waVerify) + "'>Copy</button>" : "") + "</div></li>" +
        "<li>Click <b>Verify and save</b>, then under Webhook fields <b>Subscribe</b> to <b>messages</b>.</li>" +
        "<li>Copy the <b>App secret</b> (App settings → Basic) here for security:</li></ol>" +
        '<label>App secret<input id="t-ws" type="password" autocomplete="off" value="' + esc(c.waSecret || "") + '" placeholder="Required — webhook refused without it"></label>' +
        '<p class="muted" style="font-size:12.5px">WhatsApp chats appear in Live chat with a green WA tag. Reply there to take over. WhatsApp only allows free replies within 24 hours of the customer\'s last message.</p></div>' +
        "</div>" +
        // test box
        '<div class="tr-t"><h4>' + ic("sparkles") + 'Test the AI<select id="t-ch"><option value="web">Website chat</option><option value="wa">WhatsApp</option></select></h4><div class="tr-m" id="t-m"><div class="tr-b s">Ask what a customer would ask. <b>Save first</b>: the test uses your saved training. Nothing here is stored.</div></div>' +
        '<form class="tr-in" id="t-f"><input placeholder="e.g. 10 marla ghar ka interior kitne ka?" id="t-i"><button class="btn pri sm">' + ic("send") + '</button></form><div style="padding:0 10px 10px"><button class="btn sm" id="t-clr">Clear</button></div></div></div>';
      W.fillIcons(el);
      var tabs = $$(".tr-tabs button", el), panes = $$(".tr-p", el);
      tabs.forEach(function (b) { b.onclick = function () { tabs.forEach(function (x, i) { x.classList.toggle("on", x === b); panes[i].classList.toggle("on", x === b); }); }; });
      $$("[data-cp]", el).forEach(function (b) { b.onclick = function () { navigator.clipboard.writeText(b.dataset.cp).then(function () { toast("Copied ✓"); }); }; });
      function drawQa() {
        $("#t-qa").innerHTML = qa.length ? qa.map(function (x, i) { return '<div class="tr-qa" data-i="' + i + '"><div><input class="q" placeholder="Question" value="' + esc(x.q) + '"><textarea class="a" rows="2" placeholder="Answer" style="margin-top:6px">' + esc(x.a) + '</textarea></div><button class="btn sm x" title="Remove">' + ic("x") + "</button></div>"; }).join("") : '<p class="muted">No Q&amp;A yet.</p>';
        W.fillIcons($("#t-qa"));
        $$(".tr-qa", el).forEach(function (row) { var i = +row.dataset.i; row.querySelector(".q").oninput = function () { qa[i].q = this.value; }; row.querySelector(".a").oninput = function () { qa[i].a = this.value; }; row.querySelector(".x").onclick = function () { qa.splice(i, 1); drawQa(); }; });
      }
      drawQa();
      $("#t-qa-add").onclick = function () { qa.push({ q: "", a: "" }); drawQa(); var r = $$(".tr-qa .q", el); r[r.length - 1].focus(); };
      $("#tr-save").onclick = function () {
        var b = this; b.disabled = true;
        api("chat_cfg_save", { cfg: { noPrices: $("#t-np").checked, tone: $("#t-tone").value, toneNote: $("#t-tn").value, knowledge: $("#t-k").value, qa: qa, prices: $("#t-pr").value, avoid: $("#t-av").value,
          days: $$(".t-d:checked", el).map(function (x) { return +x.value; }), openFrom: $("#t-of").value, openTo: $("#t-ot").value, hours: $("#t-h").value, afterHours: $("#t-ah").value,
          waAgent: $("#t-wa").checked, waGreeting: $("#t-wg").value, waSecret: $("#t-ws").value } })
          .then(function (x) { b.disabled = false; if (!x.ok) return toast(x.error, true); toast("Training saved ✓"); if (!c.waVerify && x.cfg.waVerify) W.VIEWS.train(el); c = x.cfg; });
      };
      var turns = [];
      function bub(cls, t) { var d = document.createElement("div"); d.className = "tr-b " + cls; d.textContent = t; $("#t-m").appendChild(d); $("#t-m").scrollTop = 1e6; return d; }
      $("#t-clr").onclick = function () { turns = []; $("#t-m").innerHTML = ""; };
      $("#t-f").onsubmit = function (e) {
        e.preventDefault(); var t = $("#t-i").value.trim(); if (!t) return; $("#t-i").value = ""; bub("u", t); turns.push({ who: "user", text: t });
        var w = bub("s", "typing…");
        api("chat_test", { turns: turns, channel: $("#t-ch").value }).then(function (x) {
          w.remove(); if (!x.ok) return bub("err", "⚠ " + (x.error || "AI did not answer") + " — check Settings → System check");
          var d = bub("a", x.reply); if (x.lead || x.human) { var lc = document.createElement("div"); lc.className = "tr-lead"; lc.textContent = (x.lead ? "Saved to CRM → " + Object.keys(x.lead).filter(function (k) { return x.lead[k]; }).map(function (k) { return ({ name: "Name", area: "Area", type: "Project", budget: "Budget" })[k] + ": " + x.lead[k]; }).join(" · ") : "") + (x.human ? (x.lead ? "   " : "") + "⚑ Hands over to the team" : ""); $("#t-m").appendChild(lc); }
          var cp = document.createElement("button"); cp.className = "cp"; cp.type = "button"; cp.textContent = "Copy reply"; cp.onclick = function () { navigator.clipboard.writeText(x.reply).then(function () { toast("Copied ✓"); }); }; d.appendChild(cp); turns.push({ who: "ai", text: x.reply }); if (x.human) bub("s", "→ This chat would be flagged “needs you” for the team");
        });
      };
    });
  };
  var st = document.createElement("style"); st.textContent = ".tr-lead{align-self:flex-start;font-size:11.5px;background:#ecfdf3;color:#05603a;border:1px dashed #6ce9a6;border-radius:8px;padding:4px 9px;margin:-2px 0 6px;max-width:85%}"; document.head.appendChild(st);
})();
