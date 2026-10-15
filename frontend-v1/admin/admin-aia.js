/* Woodex Admin — P39 Phase 5: AI report (how the chat agent is doing) + Unanswered questions → "Add to training". */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, toast = W.toast, V = W.VIEWS;
  function $(s, r) { return (r || document).querySelector(s); }
  var CH = { web: "Website", wa: "WhatsApp", tg: "Telegram" };
  function dur(s) { if (s == null) return "—"; if (s < 60) return s + " sec"; if (s < 3600) return Math.round(s / 60) + " min"; return (s / 3600).toFixed(1) + " h"; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "—"; }
  function kpi(v, l, hint) { return '<div class="card"><div class="card-b"><div style="font-size:26px;font-weight:700;line-height:1.1">' + v + '</div><div style="font-size:13px;margin-top:4px"><b>' + l + "</b></div>" + (hint ? '<small class="muted">' + hint + "</small>" : "") + "</div></div>"; }
  var st = { tab: "report", days: 30, un: "open" };

  V.aireport = function (el) {
    el.innerHTML = W.head("AI report", "AI report") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><div class="seg" id="ar-tab"><button data-t="report">Report</button><button data-t="un">Unanswered questions <span id="ar-unc"></span></button></div><span style="flex:1"></span><a class="btn sm" href="#/train">Train the AI</a></div><div id="ar-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    $("#ar-tab").onclick = function (e) { var b = e.target.closest("[data-t]"); if (!b) return; st.tab = b.dataset.t; draw(); };
    draw();
  };
  function tabs() { [].forEach.call(document.querySelectorAll("#ar-tab button"), function (b) { b.classList.toggle("on", b.dataset.t === st.tab); }); }
  function draw() { tabs(); if (st.tab === "un") unans(); else report(); }

  function report() {
    var b = $("#ar-b"); if (!b) return;
    api("ai_report", { days: st.days }).then(function (r) {
      if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      $("#ar-unc").textContent = r.unanswered ? "(" + r.unanswered + ")" : "";
      var max = Math.max.apply(null, [1].concat(r.reasons.map(function (x) { return x.n; })));
      b.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><div class="seg" id="ar-d">' + [[7, "7 days"], [30, "30 days"], [90, "90 days"]].map(function (d) { return '<button data-d="' + d[0] + '"' + (st.days === d[0] ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:12px">' +
          kpi(r.chats, "Conversations", Object.keys(r.channels).map(function (k) { return (CH[k] || k) + " " + r.channels[k]; }).join(" · ") || "No chats yet") +
          kpi(pct(r.aiOnly, r.chats), "Handled by AI alone", r.aiOnly + " of " + r.chats + " without a team reply") +
          kpi(r.handoffs, "Handed to the team", "AI asked a person to take over") +
          kpi(r.leads, "Leads captured", pct(r.leads, r.chats) + " of conversations") +
          kpi(r.visits, "Site visits requested", "Waiting for the team to confirm in Bookings") +
          kpi(dur(r.firstReply), "Average first reply", "Team reply: " + dur(r.firstTeam)) +
        "</div>" +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">' +
          '<div class="card"><div class="card-h"><h3>Why the AI handed over</h3></div><div class="card-b">' + (r.reasons.length ? r.reasons.sort(function (a, b) { return b.n - a.n; }).map(function (x) { return '<div style="margin:0 0 10px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>' + esc(x.label) + "</span><b>" + x.n + '</b></div><div style="height:7px;background:var(--line);border-radius:5px;margin-top:4px"><div style="height:7px;border-radius:5px;background:#b8956a;width:' + Math.round((x.n / max) * 100) + '%"></div></div></div>'; }).join("") : '<p class="muted" style="margin:0">No hand-offs in this period.</p>') + "</div></div>" +
          '<div class="card"><div class="card-h"><h3>Improve the AI</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.6">' +
            (r.unanswered ? "<p style=\"margin:0 0 10px\"><b>" + r.unanswered + "</b> customer question" + (r.unanswered > 1 ? "s" : "") + " the AI could not answer well. Add an answer and the AI will use it next time.</p><button class=\"btn primary\" id=\"ar-go\">Review unanswered questions</button>" : '<p style="margin:0">No unanswered questions right now. 👍</p>') +
            '<p class="muted" style="margin:12px 0 0;font-size:12.5px">The AI hands a chat to the team when a customer asks for a person, asks about price, complains, is ready to finalise, when the AI is not sure, or after 3 messages without progress.</p></div></div>' +
        "</div>";
      $("#ar-d").onclick = function (e) { var x = e.target.closest("[data-d]"); if (!x) return; st.days = +x.dataset.d; report(); };
      if ($("#ar-go")) $("#ar-go").onclick = function () { st.tab = "un"; draw(); };
    });
  }

  function unans() {
    var b = $("#ar-b"); if (!b) return;
    api("ai_unans_list", { status: st.un }).then(function (r) {
      if (!r.ok) { b.innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; }
      if (st.un === "open") $("#ar-unc").textContent = r.items.length ? "(" + r.items.length + ")" : "";
      b.innerHTML = '<div class="card"><div class="card-h"><h3>Questions the AI could not answer</h3><div class="seg" id="ar-us">' + [["open", "To review"], ["added", "Added"], ["ignored", "Ignored"]].map(function (d) { return '<button data-s="' + d[0] + '"' + (st.un === d[0] ? ' class="on"' : "") + ">" + d[1] + "</button>"; }).join("") + "</div></div>" +
        (r.items.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer question</th><th>Asked</th><th>Last</th><th></th></tr></thead><tbody>' + r.items.map(function (x) {
          return "<tr><td style=\"max-width:520px\">" + esc(x.q) + (x.chat_id ? ' <a class="muted" style="font-size:12px" href="#/chat/' + x.chat_id + '">open chat</a>' : "") + "</td><td>" + x.n + "×</td><td><small>" + esc(W.ago(x.t)) + '</small></td><td style="white-space:nowrap;text-align:right">' +
            (st.un === "open" ? '<button class="btn sm primary" data-add="' + x.id + '">Add to training</button> <button class="btn sm ghost" data-ign="' + x.id + '">Ignore</button>' : st.un === "ignored" ? '<button class="btn sm ghost" data-undo="' + x.id + '">Restore</button>' : '<small class="muted">In training</small>') + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<div class="empty">' + (st.un === "open" ? "Nothing to review. The AI answered everything it was asked." : "Nothing here yet.") + "</div>") + "</div>";
      $("#ar-us").onclick = function (e) { var x = e.target.closest("[data-s]"); if (!x) return; st.un = x.dataset.s; unans(); };
      b.onclick = function (e) {
        var a = e.target.closest("[data-add]"), g = e.target.closest("[data-ign]"), u = e.target.closest("[data-undo]");
        if (a) { var it = r.items.filter(function (x) { return x.id === +a.dataset.add; })[0]; if (it) addModal(it); }
        if (g || u) api("ai_unans_ignore", { id: +(g || u).dataset[g ? "ign" : "undo"], undo: u ? 1 : 0 }).then(function (x) { if (!x.ok) return toast(x.error, true); toast(g ? "Ignored" : "Restored"); unans(); });
      };
    });
  }

  function addModal(it) {
    W.modal('<h3>Add to AI training</h3><label>Question</label><input id="au-q" maxlength="300" value="' + esc(it.q) + '">' +
      '<label style="margin-top:10px">Answer the AI should give</label><textarea id="au-a" rows="5" maxlength="1500" placeholder="Write a short, friendly answer. Do not include prices."></textarea>' +
      '<small class="muted">Saved to <b>AI agent → Questions &amp; answers</b>. The AI uses it on the website, WhatsApp and Telegram.</small>' +
      '<div class="modal-actions"><button class="btn ghost" id="au-x">Cancel</button><button class="btn primary" id="au-s">Save answer</button></div>');
    $("#au-x").onclick = W.closeModal;
    $("#au-s").onclick = function () {
      var q = $("#au-q").value.trim(), a = $("#au-a").value.trim(); if (!q || !a) return toast("Write the answer first", true);
      if (/\b(rs\.?|pkr)\s*\d/i.test(a)) return toast("Please do not put prices in AI answers", true);
      $("#au-s").disabled = true;
      api("ai_unans_add", { id: it.id, q: q, a: a }).then(function (r) { $("#au-s").disabled = false; if (!r.ok) return toast(r.error, true); W.closeModal(); toast(r.pending ? "Sent for Master approval" : "Added to training"); unans(); });
    };
  }
  W.route();
})();
