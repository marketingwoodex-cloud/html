/* Woodex Admin — P18 D: chat extras + pop-up dock.
 * - Attachments in chat messages (photo, PDF, voice note) — shared renderer W.chatX.att()
 * - Composer extras: emoji, attach photo/PDF, record a voice note, typing status — W.chatX.composer()
 * - Pop-up dock on every admin page: opens when a client writes (hide / minimise), header chat button with badge
 */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, toast = W.toast, S = W.S;
  var EMO = ["👋", "🙂", "😊", "🙏", "👍", "👌", "✅", "📍", "📞", "📅", "🏠", "🛋️", "🪑", "🛏️", "🍽️", "🏢", "📐", "🎨", "🔨", "📷", "📄", "⏰", "⭐", "❤️"];
  var kb = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; };
  var pref = function (k, d) { var v = localStorage.getItem("wxNt_" + k); return v === null ? d : v === "1"; };
  var canChat = function () { return S.user && ["owner", "admin", "sales"].indexOf(S.user.role) > -1; };

  var css = document.createElement("style");
  css.textContent =
    ".cx-att{display:block;margin-top:4px}.cx-att img{display:block;max-width:220px;max-height:200px;border-radius:10px;cursor:zoom-in;background:#eee}" +
    ".cx-att audio{display:block;width:230px;max-width:100%;height:36px}.cx-file{display:inline-flex;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(127,127,127,.12);color:inherit;text-decoration:none;font-size:13px}.cx-file b{font-weight:600}.cx-file small{opacity:.7;display:inline}" +
    ".cx-tools{display:flex;gap:2px;align-items:flex-end;position:relative}.cx-tools .btn{min-height:40px;padding:0 10px}.cx-tools .btn.rec{background:#e11d48;color:#fff;border-color:#e11d48}" +
    ".cx-emo{position:absolute;bottom:46px;left:0;z-index:30;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:12px;box-shadow:0 12px 32px rgba(12,22,40,.16);padding:8px;display:grid;grid-template-columns:repeat(8,32px);gap:2px}" +
    ".cx-emo button{border:0;background:none;font-size:19px;width:32px;height:32px;border-radius:8px;cursor:pointer}.cx-emo button:hover{background:var(--bg,#f4f4f5)}" +
    ".cx-typing{font-size:12px;color:var(--mut,#6b7280);padding:2px 16px 6px;min-height:20px;font-style:italic}" +
    "#cx-btn{position:relative}#cx-btn .nt-n{background:#16a34a}" +
    "#cx-dock{position:fixed;right:20px;bottom:20px;width:370px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 90px);z-index:900;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:16px;box-shadow:0 24px 60px rgba(12,22,40,.25);display:flex;flex-direction:column;overflow:hidden;animation:cxIn .18s ease-out}" +
    "@keyframes cxIn{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}" +
    "#cx-dock[hidden]{display:none}.cx-h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0c1628;color:#fff}.cx-h b{font-size:14px;display:block}.cx-h small{font-size:11.5px;opacity:.75}.cx-h .sp{flex:1;min-width:0}" +
    ".cx-h button,.cx-h a{background:rgba(255,255,255,.1);border:0;color:#fff;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;cursor:pointer;text-decoration:none;font-size:16px;line-height:1}.cx-h button:hover,.cx-h a:hover{background:rgba(255,255,255,.2)}.cx-h svg{width:16px;height:16px}" +
    ".cx-av{width:32px;height:32px;border-radius:50%;background:#b8956a;color:#0c1628;display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}" +
    "#cx-dock .lc-msgs{padding:12px}#cx-dock .lm{max-width:84%;font-size:13.5px}#cx-dock .lc-in{padding:8px;gap:6px}#cx-dock .lc-in textarea{min-height:40px}#cx-dock .lc-in .btn.pri{padding:0 12px}" +
    ".cx-list{flex:1;overflow:auto}.cx-li{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer}.cx-li:hover{background:var(--bg,#f6f6f7)}.cx-li .t{flex:1;min-width:0}.cx-li b{font-size:13.5px;display:block}.cx-li small{display:block;color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-li .u{background:#e11d48;color:#fff;border-radius:9px;font-size:10.5px;font-weight:700;padding:1px 6px}" +
    "#cx-bub{position:fixed;right:20px;bottom:20px;z-index:899;border:0;border-radius:28px;background:#0c1628;color:#fff;padding:12px 18px 12px 14px;display:flex;gap:8px;align-items:center;box-shadow:0 12px 30px rgba(12,22,40,.3);cursor:pointer;font:600 13.5px/1 inherit}#cx-bub svg{width:18px;height:18px}#cx-bub .nt-n{position:static;margin-left:2px}#cx-bub[hidden]{display:none}" +
    "@media(max-width:600px){#cx-dock{right:12px;bottom:12px;height:70vh}}";
  document.head.appendChild(css);

  // ------------------------------------------------------------------ attachment renderer
  function att(a) {
    if (!a || !a.u || !/^\/assets\/uploads\/chat\//.test(a.u)) return "";
    var u = esc(a.u);
    if (a.k === "img") return '<a class="cx-att" href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="Photo" loading="lazy"></a>';
    if (a.k === "voice") return '<span class="cx-att"><audio controls preload="metadata" src="' + u + '"></audio></span>';
    return '<a class="cx-att cx-file" href="' + u + '" target="_blank" rel="noopener" download="' + esc(a.n || "file") + '">📄 <span><b>' + esc(a.n || "File") + "</b> <small>" + kb(a.s || 0) + "</small></span></a>";
  }
  var AUTO = /^(🎤 Voice note|📷 Photo|📎 .*)$/;
  /** message body: text (unless it is only the automatic label) + attachment */
  function body(m) { return (m.att && AUTO.test(m.text) ? "" : esc(m.text)) + att(m.att); }

  // ------------------------------------------------------------------ composer extras (emoji · attach · voice · typing)
  function b64(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(blob); }); }
  function shrink(file) { // photos: max 1600px JPEG/WebP so chats stay light
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); if (s === 1 && file.size < 900 * 1024) return file;
      var c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b && b.size < file.size ? b : file); }, "image/jpeg", 0.85); });
    }).catch(function () { return file; });
  }
  /** form: the .lc-in form (textarea + send button). getId(): current chat id. after(): reload messages. */
  function composer(form, getId, after) {
    var ta = form.querySelector("textarea"); if (!ta || form.querySelector(".cx-tools")) return;
    var t = document.createElement("div"); t.className = "cx-tools";
    t.innerHTML = '<button type="button" class="btn ghost" data-cx="emo" title="Emoji">🙂</button><button type="button" class="btn ghost" data-cx="file" title="Send a photo or PDF">' + ic("paperclip") + '</button><button type="button" class="btn ghost" data-cx="rec" title="Record a voice note">' + ic("mic") + "</button>";
    form.insertBefore(t, ta); W.fillIcons && W.fillIcons(t);
    // P39 Phase 5: AI-drafted reply for staff to edit before sending
    var sg = document.createElement("button"); sg.type = "button"; sg.className = "btn ghost"; sg.title = "Suggest a reply (AI draft — you can edit before sending)"; sg.textContent = "✨ Suggest"; sg.style.whiteSpace = "nowrap"; t.appendChild(sg);
    sg.onclick = function () { var id = getId(); if (!id) return; sg.disabled = true; sg.textContent = "✨ Writing…";
      api("chat_suggest", { id: id }).then(function (r) { sg.disabled = false; sg.textContent = "✨ Suggest"; if (!r.ok) return toast(r.error || "Could not suggest a reply", true); ta.value = r.text || ""; ta.focus(); ta.dispatchEvent(new Event("input")); }); };
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/jpeg,image/png,image/webp,image/gif,application/pdf"; fi.hidden = true; form.appendChild(fi);
    var send = function (blob, name, voice) {
      var id = getId(); if (!id) return;
      if (blob.size > 8 * 1024 * 1024) return toast("Files must be 8 MB or smaller", true);
      var cap = voice ? "" : ta.value.trim(); toast(voice ? "Sending voice note…" : "Sending…");
      return b64(blob).then(function (d) { return api("chat_file", { id: id, data: d, name: name, voice: voice ? 1 : 0, text: cap }); })
        .then(function (r) { if (!r.ok) return toast(r.error, true); if (cap) ta.value = ""; after && after(r); });
    };
    fi.onchange = function () { var f = fi.files[0]; fi.value = ""; if (!f) return; shrink(f).then(function (b) { send(b, f.name, false); }); };
    var rec = null;
    t.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cx]"); if (!b) return; var k = b.dataset.cx;
      if (k === "emo") { var p = t.querySelector(".cx-emo"); if (p) return p.remove(); p = document.createElement("div"); p.className = "cx-emo"; p.innerHTML = EMO.map(function (x) { return '<button type="button">' + x + "</button>"; }).join(""); t.appendChild(p);
        p.onclick = function (ev) { var x = ev.target.closest("button"); if (!x) return; var s0 = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s0) + x.textContent + ta.value.slice(ta.selectionEnd || s0); ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + x.textContent.length; p.remove(); }; return; }
      if (k === "file") return fi.click();
      if (k === "rec") {
        if (rec) { rec.stop(); return; }
        if (!navigator.mediaDevices || !window.MediaRecorder) return toast("This browser cannot record audio", true);
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          var type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].filter(function (x) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0] || "";
          var mr = new MediaRecorder(stream, type ? { mimeType: type } : {}), parts = [], t0 = Date.now(), tick; rec = mr;
          b.classList.add("rec"); var lab = function () { var s = Math.round((Date.now() - t0) / 1000); b.innerHTML = "● " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " Stop"; if (s >= 120) mr.stop(); };
          lab(); tick = setInterval(lab, 500);
          mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) parts.push(ev.data); };
          mr.onstop = function () { clearInterval(tick); rec = null; stream.getTracks().forEach(function (x) { x.stop(); }); b.classList.remove("rec"); b.innerHTML = ic("mic"); W.fillIcons && W.fillIcons(b);
            var blob = new Blob(parts, { type: (mr.mimeType || "audio/webm").split(";")[0] }); if (Date.now() - t0 < 700 || !blob.size) return toast("Voice note too short", true); send(blob, "Voice note", true); };
          mr.start(250);
        }).catch(function () { toast("Microphone permission was blocked", true); });
      }
    });
    document.addEventListener("click", function (e) { var p = t.querySelector(".cx-emo"); if (p && !e.target.closest(".cx-tools")) p.remove(); });
    var lastPing = 0; ta.addEventListener("input", function () { var id = getId(); if (id && Date.now() - lastPing > 3000) { lastPing = Date.now(); api("chat_typing", { id: id }); } });
  }

  // ------------------------------------------------------------------ pop-up dock
  var D = { id: 0, last: 0, timer: null, chat: null, hiddenFor: {} };
  function dockEl() {
    var d = $("#cx-dock"); if (d) return d;
    d = document.createElement("div"); d.id = "cx-dock"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Live chat");
    document.body.appendChild(d);
    var bub = document.createElement("button"); bub.id = "cx-bub"; bub.hidden = true; bub.innerHTML = ic("message-circle") + '<span>Live chat</span><span class="nt-n" id="cx-bn" hidden></span>'; document.body.appendChild(bub); W.fillIcons && W.fillIcons(bub);
    bub.onclick = function () { bub.hidden = true; d.hidden = false; if (D.id) openChat(D.id); else openList(); };
    return d;
  }
  function stop() { clearInterval(D.timer); D.timer = null; }
  function hide() { var d = dockEl(); d.hidden = true; $("#cx-bub").hidden = true; stop(); if (D.id) D.hiddenFor[D.id] = D.lastSeen || 0; }
  function minimise() { var d = dockEl(); d.hidden = true; stop(); if (D.id) D.hiddenFor[D.id] = D.lastSeen || 0; } // P19 B2: minimise = hide; reopen from the top-bar chat icon
  function head(title, sub, av, extra) {
    return '<div class="cx-h"><span class="cx-av">' + esc(av) + '</span><span class="sp"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></span>" + (extra || "") +
      '<button type="button" data-d="min" title="Minimise">–</button><button type="button" data-d="x" title="Hide (opens again on the next message)">×</button></div>';
  }
  function wire(d) { d.querySelector("[data-d=min]").onclick = minimise; d.querySelector("[data-d=x]").onclick = hide; }
  function openList() {
    var d = dockEl(); d.hidden = false; $("#cx-bub").hidden = true; stop(); D.id = 0;
    d.innerHTML = head("Live chat", "Open conversations", "W", '<a href="#/chat" title="Open the full inbox">' + ic("maximize-2") + "</a>") + '<div class="cx-list" id="cx-list"><div class="lc-empty">Loading…</div></div>';
    W.fillIcons && W.fillIcons(d); wire(d);
    api("chat_list", { status: "open" }).then(function (r) {
      var L = $("#cx-list"); if (!L) return; if (!r.ok) { L.innerHTML = '<div class="lc-empty">' + esc(r.error) + "</div>"; return; }
      L.innerHTML = r.chats.length ? r.chats.slice(0, 30).map(function (c) { var n = c.name || "Visitor #" + c.id; return '<div class="cx-li" data-id="' + c.id + '"><span class="cx-av">' + esc(n.charAt(0).toUpperCase()) + '</span><span class="t"><b>' + esc(n) + "</b><small>" + esc(c.last || "") + "</small></span>" + (c.unread ? '<span class="u">' + c.unread + "</span>" : c.needs ? '<span class="u">!</span>' : "") + "</div>"; }).join("") : '<div class="lc-empty">No open chats.</div>';
      L.onclick = function (e) { var x = e.target.closest(".cx-li"); if (x) openChat(+x.dataset.id); };
    });
  }
  function openChat(id) {
    var d = dockEl(); d.hidden = false; $("#cx-bub").hidden = true; stop(); D.id = id; D.last = 0; D.chat = null;
    d.innerHTML = '<div id="cx-head"></div><div class="lc-msgs" id="cx-msgs"></div><div class="cx-typing" id="cx-ty"></div><form class="lc-in" id="cx-in"><textarea rows="1" placeholder="Reply… (Enter to send)"></textarea><button class="btn pri" title="Send">' + ic("send") + "</button></form>";
    W.fillIcons && W.fillIcons(d);
    var ta = d.querySelector("textarea"), f = $("#cx-in");
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = function (e) { e.preventDefault(); var t = ta.value.trim(); if (!t) return; ta.value = ""; api("chat_reply", { id: id, text: t }).then(function (r) { if (!r.ok) { ta.value = t; return toast(r.error, true); } load(); }); };
    composer(f, function () { return D.id; }, function () { load(); });
    load(true); D.timer = setInterval(function () { if (d.hidden || D.id !== id) return stop(); load(); }, 3000);
    setTimeout(function () { ta.focus(); }, 60);
  }
  function load(first) {
    var id = D.id; if (!id) return;
    api("chat_get", { id: id, since: D.last }).then(function (r) {
      if (id !== D.id || !$("#cx-msgs")) return; if (!r.ok) return toast(r.error, true);
      var c = r.chat, n = c.name || "Visitor #" + c.id;
      if (first || !D.chat || D.chat.mode !== c.mode || D.chat.name !== c.name) {
        $("#cx-head").innerHTML = head(n, (c.mode === "ai" ? "AI is answering" : "Handled by " + (c.agent || "team")) + (c.phone ? " · " + c.phone : ""), n.charAt(0).toUpperCase(), '<button type="button" data-d="list" title="All chats">' + ic("menu") + '</button><a href="#/chat/' + c.id + '" title="Open in the full inbox">' + ic("maximize-2") + "</a>");
        W.fillIcons && W.fillIcons($("#cx-head")); wire($("#cx-dock")); $("[data-d=list]").onclick = openList;
        $("#cx-head a").addEventListener("click", function () { setTimeout(hide, 50); });
      }
      D.chat = c;
      var M = $("#cx-msgs"), atEnd = M.scrollHeight - M.scrollTop - M.clientHeight < 60;
      r.messages.forEach(function (m) { if (m.id <= D.last) return; D.last = D.lastSeen = m.id; var x = document.createElement("div"); x.className = "lm " + ({ visitor: "v", ai: "a", agent: "g", sys: "s" })[m.who]; x.innerHTML = (m.who !== "sys" ? "<small>" + esc(m.who === "visitor" ? n : m.who === "ai" ? "AI assistant" : m.name) + " · " + esc(String(m.t).slice(11, 16)) + "</small>" : "") + body(m); M.appendChild(x); });
      if (first || atEnd) M.scrollTop = M.scrollHeight;
      $("#cx-ty").textContent = r.typing ? n + " is typing…" : "";
    });
  }
  /** called by the notification poller (admin-chat.js) when something new arrived */
  function onNotify(r) {
    if (!canChat() || !pref("popup", true)) return;
    var it = (r.items || []).filter(function (x) { return x.kind === "chat"; })[0]; if (!it) return;
    if (location.hash.indexOf("#/chat") === 0) return; // the inbox is already open
    var d = dockEl();
    if (!d.hidden && D.id === it.id) return load();
    if (!d.hidden && D.id && D.id !== it.id) { var bn = $("#cx-bn"); return; } // busy in another chat: keep it, the bell shows the new one
    if (!$("#cx-bub").hidden && D.id === it.id) { $("#cx-bn").hidden = false; $("#cx-bn").textContent = "new"; return; }
    openChat(it.id);
  }
  function headerBtn(r) {
    var bell = $("#nt-btn"); if (!bell || !canChat()) return;
    var b = $("#cx-btn");
    if (!b) { b = document.createElement("button"); b.id = "cx-btn"; b.className = bell.className; b.type = "button"; b.title = "Live chat"; b.innerHTML = ic("message-circle") + '<span class="nt-n" id="cx-n" hidden></span>'; (bell.closest("#nt-dd") || bell).insertAdjacentElement("beforebegin", b); W.fillIcons && W.fillIcons(b);
      b.onclick = function () { var d = dockEl(); if (!d.hidden) return minimise(); openList(); }; }
    var n = $("#cx-n"); if (n && r) { n.hidden = !r.chats; n.textContent = r.chats > 99 ? "99+" : r.chats; }
  }
  window.addEventListener("hashchange", function () { if (location.hash.indexOf("#/chat") === 0 && $("#cx-dock") && !$("#cx-dock").hidden) minimise(); });

  W.chatX = { att: att, body: body, composer: composer, onNotify: onNotify, headerBtn: headerBtn, open: openChat, list: openList };
})();
