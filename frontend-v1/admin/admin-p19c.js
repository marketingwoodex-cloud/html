/* Woodex Admin — P19 C: one central client record. Adds a "Messages" tab (live chat + WhatsApp) to the client page. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function when(t) { var d = new Date(String(t).replace(" ", "T")); return isNaN(d) ? esc(t) : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "2-digit", minute: "2-digit" }); }
  W.p19cClient = function (el, c) {
    var tabs = el.querySelector(".s17-c3t"); if (!tabs || tabs.querySelector("[data-p='m']")) return;
    var b = document.createElement("button"); b.dataset.p = "m"; b.textContent = "Messages"; tabs.appendChild(b);
    var pane = document.createElement("div"); pane.className = "tbl-wrap p19-msgs"; pane.dataset.p = "m"; pane.hidden = true; pane.innerHTML = "<p class='muted' style='padding:16px'>Loading…</p>";
    var last = el.querySelectorAll(".s17-c3 .tbl-wrap[data-p]"); last[last.length - 1].after(pane);
    var loaded = false;
    b.addEventListener("click", function () {
      if (loaded) return; loaded = true;
      W.api("client_comms", { id: c.id }).then(function (r) {
        if (!r.ok) { pane.innerHTML = "<p class='err' style='padding:16px'>" + esc(r.error) + "</p>"; return; }
        b.textContent = "Messages (" + r.chats.length + ")";
        pane.innerHTML = r.chats.length ? r.chats.map(function (ch) {
          var wa = ch.channel === "wa";
          return "<div class='p19-ch'><div class='p19-chh'><span class='badge " + (wa ? "p19-wa" : "p19-web") + "'>" + (wa ? "WhatsApp" : "Live chat") + "</span><b>" + when(ch.updated) + "</b><small class='muted'>" + ch.count + " message" + (ch.count === 1 ? "" : "s") + " · " + esc(ch.status) + (ch.mode === "ai" ? " · AI" : "") + "</small><a class='btn sm' href='#/chat/" + ch.id + "'>Open</a></div>" +
            "<div class='p19-chm'>" + ch.last.map(function (m) { var me = m.who !== "visitor" && m.who !== "user" && m.who !== "in"; return "<div class='" + (me ? "me" : "") + "'><small>" + esc(m.name || (me ? "Woodex" : c.name)) + " · " + when(m.t) + "</small><p>" + esc(m.text) + "</p></div>"; }).join("") + "</div></div>";
        }).join("") : "<p class='muted' style='padding:16px'>No live chats or WhatsApp messages from " + esc(c.phone || c.email || "this client") + " yet. Chats are matched by phone number or email.</p>";
      });
    });
  };
  var st = document.createElement("style");
  st.textContent = ".p19-msgs{padding:12px}.p19-ch{border:1px solid var(--line,#e4e7ec);border-radius:12px;margin-bottom:10px;overflow:hidden}.p19-chh{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fafbfc;border-bottom:1px solid var(--line,#e4e7ec)}.p19-chh small{flex:1}" +
    ".p19-wa{background:#e7f8ee;color:#067647}.p19-web{background:#eef2ff;color:#3538cd}.p19-chm{padding:10px 12px;display:grid;gap:8px}.p19-chm>div{max-width:78%;background:#f2f4f7;border-radius:10px;padding:7px 10px}.p19-chm>div.me{justify-self:end;background:#f4efe7}.p19-chm small{display:block;color:#667085;font-size:11px}.p19-chm p{margin:2px 0 0;font-size:13px;white-space:pre-wrap}";
  document.head.appendChild(st);
})();
