/* Woodex Admin — P40 A: AI Assistant settings centre (one place for website chat, WhatsApp and Telegram).
   Layout follows the "Personalization" reference: a section menu on the left, cards with segmented buttons, slider and text areas.
   API: aic_get / aic_save / aic_health (api/ai-center-lib.php); test box uses chat_test. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, toast = W.toast, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  var css = document.createElement("style");
  css.textContent =
    ".ac{display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;align-items:start}@media(max-width:900px){.ac{grid-template-columns:1fr}.ac-nav{position:static!important;display:flex;overflow:auto}}" +
    ".ac-nav{position:sticky;top:84px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px}.ac-nav small{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:10px 10px 4px}" +
    ".ac-nav a{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;font-size:13.5px;color:var(--txt2);text-decoration:none;white-space:nowrap}.ac-nav a:hover{background:var(--bg)}.ac-nav a.on{background:#0c1628;color:#fff}.ac-nav a.on svg{color:#b8956a}.ac-nav a svg{width:17px;height:17px}" +
    ".ac-sec{display:none}.ac-sec.on{display:block}.ac h2.ac-t{font-size:22px;margin:0 0 4px}.ac .ac-sub{color:var(--mut);font-size:13.5px;margin:0 0 18px;padding-bottom:16px;border-bottom:1px solid var(--line)}" +
    ".ac-lab{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:20px 0 8px}" +
    ".ac-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}.ac-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px;border-top:1px solid var(--line)}.ac-row:first-child{border-top:0}" +
    ".ac-row b{font-size:14px;font-weight:600}.ac-row p{margin:2px 0 0;font-size:12.5px;color:var(--mut)}.ac-pad{padding:18px 20px}.ac-pad label{margin-top:0}" +
    ".ac-seg{display:inline-flex;background:var(--bg,#f2f4f7);border-radius:10px;padding:4px;gap:2px;flex:none}.ac-seg button{border:0;background:transparent;padding:7px 14px;border-radius:7px;font:inherit;font-size:13px;color:var(--txt2);cursor:pointer}.ac-seg button.on{background:var(--card);color:var(--txt,#101828);font-weight:600;box-shadow:0 1px 3px rgba(16,24,40,.12)}" +
    ".ac-rng{display:flex;align-items:center;gap:12px;flex:none}.ac-rng input{width:190px;accent-color:#0c1628}.ac-rng span{width:40px;text-align:right;font-size:13px;font-weight:600}" +
    ".ac-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:700px){.ac-2{grid-template-columns:1fr}}" +
    ".ac-ch{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:1000px){.ac-ch{grid-template-columns:1fr}}" +
    ".ac-h{display:flex;gap:12px;align-items:flex-start;padding:13px 20px;border-top:1px solid var(--line)}.ac-h:first-child{border-top:0}.ac-h i{flex:none;width:10px;height:10px;border-radius:50%;margin-top:5px}.ac-h div{flex:1}.ac-h p{margin:2px 0 0;font-size:12.5px;color:var(--mut)}" +
    ".ac-bar{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:10px;padding:14px 0;background:linear-gradient(transparent,var(--bg) 40%);margin-top:16px}" +
    ".ac-chat{border:1px solid var(--line);border-radius:12px;padding:12px;height:260px;overflow:auto;background:var(--bg);display:flex;flex-direction:column;gap:8px}.ac-chat div{max-width:85%;padding:8px 11px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap}.ac-chat .u{align-self:flex-end;background:#0c1628;color:#fff}.ac-chat .a{background:var(--card);border:1px solid var(--line)}";
  document.head.appendChild(css);

  var SECS = [["", "Assistant"], ["behaviour", "Behaviour", "sparkles"], ["persona", "Persona & instructions", "user"], ["channels", "Channels", "message-circle"], ["test", "Test the assistant", "send"], ["", "System"], ["health", "Health check", "heart-pulse"]];
  var D = null, cur = "behaviour", hist = [];

  V.aicenter = function (el, parts) {
    cur = (parts && parts[0]) || cur;
    el.innerHTML = W.head("AI Assistant", "Conversations / AI Assistant") + '<div id="ac-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    api("aic_get").then(function (r) {
      var b = $("#ac-b"); if (!b) return;
      if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      D = r; draw(b);
    });
  };
  function seg(id, opts, v) { return '<div class="ac-seg" data-seg="' + id + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '"' + (o[0] === v ? ' class="on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>"; }
  function sw(id, on) { return '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span></span></label>"; }
  function row(t, p, ctl) { return '<div class="ac-row"><div><b>' + t + "</b>" + (p ? "<p>" + p + "</p>" : "") + "</div>" + ctl + "</div>"; }
  function bad(h) { return h.filter(function (x) { return x.st === "bad" || x.st === "warn"; }).length; }

  function draw(b) {
    var a = D.aic, s = D.base, ST = [["concise", "Concise"], ["balanced", "Balanced"], ["expressive", "Expressive"]];
    var nh = bad(D.health);
    b.innerHTML = '<div class="ac"><nav class="ac-nav" aria-label="AI Assistant sections">' + SECS.map(function (x) {
        if (!x[0]) return "<small>" + x[1] + "</small>";
        return '<a href="#/aicenter/' + x[0] + '" data-s="' + x[0] + '"' + (x[0] === cur ? ' class="on"' : "") + ">" + ic(x[2]) + "<span>" + x[1] + "</span>" + (x[0] === "health" && nh ? '<span class="badge warn" style="margin-left:auto">' + nh + "</span>" : "") + "</a>";
      }).join("") + "<small>Also</small>" +
      '<a href="#/train">' + ic("book-open") + "<span>Knowledge & Q&A</span></a>" +
      '<a href="#/aireport">' + ic("star") + "<span>AI report</span></a>" +
      '<a href="#/wahub">' + ic("zap") + "<span>Follow-up rules</span></a></nav><div>" +

      // ---------------- Behaviour
      '<section class="ac-sec" data-sec="behaviour"><h2 class="ac-t">Behaviour</h2><p class="ac-sub">How the assistant answers customers on the website chat, WhatsApp and Telegram.</p>' +
        '<div class="ac-lab">Status</div><div class="ac-card">' +
          row("AI answers first", "When off, every message waits for the team.", sw("ac-ai", s.ai)) +
          row("Website chat bubble", "Show the chat button on the website.", sw("ac-on", s.on)) +
          row("Never quote prices", "The assistant explains that cost depends on the site and offers a visit.", sw("ac-np", s.noPrices)) + "</div>" +
        '<div class="ac-lab">AI behaviour</div><div class="ac-card">' +
          row("Response tone", "Default for all channels.", seg("style", ST, a.style)) +
          row("Creativity", "Higher values produce more varied wording. 30–50% is best for customer chat.", '<div class="ac-rng"><input type="range" id="ac-cr" min="0" max="100" step="5" value="' + a.creativity + '"><span id="ac-crv">' + a.creativity + "%</span></div>") +
          row("Reply length", "", seg("length", [["short", "Short"], ["medium", "Medium"], ["long", "Long"]], a.length)) +
          row("Voice", "Base personality.", '<select id="ac-tone" style="width:auto">' + s.tones.map(function (t) { return '<option value="' + t + '"' + (t === s.tone ? " selected" : "") + ">" + ({ designer: "Calm interior designer", friendly: "Warm & friendly", professional: "Professional", sales: "Sales-focused" }[t] || t) + "</option>"; }).join("") + "</select>") +
          row("Urdu replies", "When the customer writes in Urdu.", seg("urdu", [["match", "Match customer"], ["roman", "Roman Urdu"], ["script", "Urdu script"]], a.urdu)) + "</div>" +
      "</section>" +

      // ---------------- Persona
      '<section class="ac-sec" data-sec="persona"><h2 class="ac-t">Persona & instructions</h2><p class="ac-sub">Give the assistant a name and tell it exactly how you want it to work.</p>' +
        '<div class="ac-lab">Custom instructions</div><div class="ac-card"><div class="ac-pad"><label>Instructions<textarea id="ac-ins" rows="5" maxlength="2000" placeholder="e.g. Always ask which city and whether it is a home, office or shop. Suggest a site visit when the customer shares a floor plan. Never promise delivery dates.">' + esc(a.instructions) + "</textarea></label></div></div>" +
        '<div class="ac-lab">About the assistant</div><div class="ac-card"><div class="ac-pad"><div class="ac-2"><label>Name <small class="muted">(optional)</small><input id="ac-pn" maxlength="40" value="' + esc(a.persona.name) + '" placeholder="e.g. Sara"></label><label>Role<input id="ac-pr" maxlength="60" value="' + esc(a.persona.role) + '" placeholder="Interior design assistant"></label></div>' +
          '<label style="margin-top:12px">More about the team and how you work<textarea id="ac-pa" rows="3" maxlength="1000" placeholder="e.g. Our designers visit the site, take measurements and share a 3D design before any work starts.">' + esc(a.persona.about) + "</textarea></label>" +
          '<label class="check" style="margin-top:10px"><input type="checkbox" id="ac-so"' + (a.signoff ? " checked" : "") + "><span>Sign the first reply with the assistant's name</span></label></div></div>" +
        '<div class="ac-lab">Welcome messages</div><div class="ac-card"><div class="ac-pad"><label>Website chat greeting<textarea id="ac-g1" rows="3" maxlength="500">' + esc(s.greeting) + '</textarea></label><label style="margin-top:12px">WhatsApp greeting<textarea id="ac-g2" rows="2" maxlength="500">' + esc(s.waGreeting) + "</textarea></label></div></div>" +
      "</section>" +

      // ---------------- Channels
      '<section class="ac-sec" data-sec="channels"><h2 class="ac-t">Channels</h2><p class="ac-sub">One assistant, three channels. Turn AI on or off per channel and add channel-only notes. Messages still reach the Inbox when AI is off.</p><div class="ac-ch">' +
        Object.keys(D.channels).map(function (k) {
          var c = a.chan[k], icn = { web: "message-circle", wa: "send", tg: "send" }[k];
          return '<div class="ac-card" data-ch="' + k + '"><div class="ac-row"><div style="display:flex;gap:10px;align-items:center">' + ic(icn) + "<b>" + esc(D.channels[k]) + "</b></div>" + sw("ac-ch-" + k, c.on) + '</div><div class="ac-pad" style="border-top:1px solid var(--line)">' +
            '<label>Tone on this channel<select data-cs><option value="">Same as default</option>' + ST.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === c.style ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
            '<label style="margin-top:10px">Note for this channel<textarea data-cn rows="3" maxlength="600" placeholder="' + ({ web: "e.g. Ask for their WhatsApp number early.", wa: "e.g. Use *bold* for key words, one emoji at most.", tg: "e.g. Keep it short; Telegram users want quick answers." })[k] + '">' + esc(c.note) + "</textarea></label></div></div>";
        }).join("") +
        '</div><div class="ac-card" style="margin-top:14px">' + row("WhatsApp AI agent", "AI replies to WhatsApp messages (needs WhatsApp connected).", sw("ac-wa", s.waAgent)) + "</div>" +
      "</section>" +

      // ---------------- Test
      '<section class="ac-sec" data-sec="test"><h2 class="ac-t">Test the assistant</h2><p class="ac-sub">Try a customer message. Uses your saved settings (save first after changes).</p>' +
        '<div class="ac-card"><div class="ac-pad"><div class="ac-chat" id="ac-log"><div class="a">' + esc(s.greeting) + '</div></div><form id="ac-tf" style="display:flex;gap:8px;margin-top:10px"><input id="ac-tq" placeholder="e.g. Kitchen renovation in DHA, how much?" autocomplete="off"><button class="btn pri">Send</button></form>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + ["How much for a 10 marla house interior?", "Can someone call me? 03001234567", "Aap ka office kahan hai?", "I want to talk to a person"].map(function (q) { return '<button type="button" class="btn sm ghost" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div></div></div>" +
      "</section>" +

      // ---------------- Health
      '<section class="ac-sec" data-sec="health"><h2 class="ac-t">Health check</h2><p class="ac-sub">Everything the assistant and the automations depend on. Fix the orange and red items.</p><div class="ac-card" id="ac-hl"></div><div style="margin-top:10px"><button class="btn sm" id="ac-hr">Check again</button></div></section>' +

      '<div class="ac-bar" id="ac-sb"><button class="btn pri" id="ac-save">Save changes</button></div></div></div>';
    W.fillIcons(b); health(); show(cur);

    $$(".ac-nav [data-s]", b).forEach(function (x) { x.onclick = function (e) { e.preventDefault(); show(x.dataset.s); history.replaceState(null, "", "#/aicenter/" + x.dataset.s); }; });
    $$("[data-seg]", b).forEach(function (g) { g.onclick = function (e) { var t = e.target.closest("button"); if (!t) return; $$("button", g).forEach(function (y) { y.classList.toggle("on", y === t); }); }; });
    $("#ac-cr").oninput = function () { $("#ac-crv").textContent = this.value + "%"; };
    $("#ac-save").onclick = save;
    $("#ac-hr").onclick = function () { api("aic_health").then(function (r) { if (r.ok) { D.health = r.health; health(); toast("Checked"); } }); };
    var ask = function (q) {
      if (!q) return; var log = $("#ac-log"), u = document.createElement("div"); u.className = "u"; u.textContent = q; log.appendChild(u);
      var w = document.createElement("div"); w.className = "a"; w.textContent = "…"; log.appendChild(w); log.scrollTop = 1e6;
      api("chat_test", { turns: hist.concat([{ who: "user", text: q }]).slice(-12), channel: "web" }).then(function (r) { w.textContent = r.ok ? (r.reply || "(no answer)") + (r.human ? "\n\n🙋 would hand over to the team" : "") + (r.rules ? "\n— Q&A rule answer (no AI key yet)" : "") : r.error; if (r.ok) hist.push({ who: "user", text: q }, { who: "ai", text: r.reply || "" }); log.scrollTop = 1e6; });
    };
    $("#ac-tf").onsubmit = function (e) { e.preventDefault(); var q = $("#ac-tq").value.trim(); $("#ac-tq").value = ""; ask(q); };
    $$("[data-q]", b).forEach(function (x) { x.onclick = function () { ask(x.dataset.q); }; });
  }
  function show(k) {
    cur = k; $$(".ac-sec").forEach(function (s) { s.classList.toggle("on", s.dataset.sec === k); }); $$(".ac-nav [data-s]").forEach(function (a) { a.classList.toggle("on", a.dataset.s === k); });
    var sb = $("#ac-sb"); if (sb) sb.style.display = k === "test" || k === "health" ? "none" : "";
  }
  function health() {
    var C = { ok: "#12b76a", warn: "#f79009", bad: "#f04438", off: "#98a2b3" };
    $("#ac-hl").innerHTML = D.health.map(function (h) { return '<div class="ac-h"><i style="background:' + C[h.st] + '"></i><div><b style="font-size:14px">' + esc(h.label) + "</b><p>" + esc(h.msg) + "</p></div>" + (h.link && h.st !== "ok" ? '<a class="btn sm" href="' + h.link + '">Fix</a>' : "") + "</div>"; }).join("");
  }
  function val(id) { var g = $('[data-seg="' + id + '"] .on'); return g ? g.dataset.v : ""; }
  function save() {
    var chan = {}; $$("[data-ch]").forEach(function (c) { var k = c.dataset.ch; chan[k] = { on: $("#ac-ch-" + k).checked, style: $("[data-cs]", c).value, note: $("[data-cn]", c).value }; });
    var body = { aic: { style: val("style"), length: val("length"), urdu: val("urdu"), creativity: +$("#ac-cr").value, instructions: $("#ac-ins").value, signoff: $("#ac-so").checked, persona: { name: $("#ac-pn").value, role: $("#ac-pr").value, about: $("#ac-pa").value }, chan: chan },
      base: { ai: $("#ac-ai").checked, on: $("#ac-on").checked, noPrices: $("#ac-np").checked, waAgent: $("#ac-wa").checked, tone: $("#ac-tone").value, greeting: $("#ac-g1").value, waGreeting: $("#ac-g2").value } };
    var btn = $("#ac-save"); btn.disabled = true; btn.textContent = "Saving…";
    api("aic_save", body).then(function (r) { btn.disabled = false; btn.textContent = "Save changes"; if (!r.ok) return toast(r.error, true); if (r.aic) D.aic = r.aic; toast(r.pending ? "Sent for Master approval" : "Saved. The assistant uses these settings now."); });
  }
  W.route();
})();
