/* Woodex Admin — P16 3.6 Inbox redesign (Flowbite-style). Enhances the existing live-chat view (admin-chat.js) without rewriting it:
   search + channel chips, initials avatars, contact side panel, quick replies. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, q = "", ch = "all";
  var QUICK = ["Could you share your phone number so our designer can call you?", "Would you like to book a free site visit this week?", "I will prepare a quotation and send it to you today.", "Thank you! Our team will call you shortly."];
  function ini(n) { n = String(n || "").trim(); if (!n || /^Visitor/.test(n) || !/\p{L}/u.test(n)) return "?"; var w = n.replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean); return w.length ? w.slice(0, 2).map(function (x) { return x[0]; }).join("").toUpperCase() : "?"; }
  function hue(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

  function list(lc) {
    var L = lc.querySelector("#lc-list"); if (!L) return;
    if (!lc.querySelector("#ib-tools")) {
      L.insertAdjacentHTML("beforebegin", '<div id="ib-tools"><div class="ib-search">' + ic("search") + '<input id="ib-q" type="search" placeholder="Search name or message…" autocomplete="off"></div><div class="ib-chips">' +
        [["all", "All"], ["web", "Website"], ["wa", "WhatsApp"], ["need", "Needs you"]].map(function (x) { return '<button type="button" data-c="' + x[0] + '"' + (ch === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div></div>");
      W.fillIcons(lc.querySelector("#ib-tools"));
      lc.querySelector("#ib-q").value = q;
      lc.querySelector("#ib-q").oninput = function () { q = this.value.toLowerCase(); filter(lc); };
      lc.querySelector(".ib-chips").onclick = function (e) { var b = e.target.closest("[data-c]"); if (!b) return; ch = b.dataset.c; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); filter(lc); };
    }
    [].forEach.call(L.querySelectorAll(".lc-it:not([data-ib])"), function (a) {
      a.dataset.ib = "1"; var nm = (a.querySelector(".r1 b") || a).textContent.replace(/^WA\s*/, "").replace(/(needs you|AI|Team)\s*$/i, "").trim();
      var wa = !!a.querySelector('.lc-tag[style*="25d366"]'); a.dataset.ch = wa ? "wa" : "web"; a.dataset.need = /needs you/i.test(a.textContent) ? "1" : "";
      a.insertAdjacentHTML("afterbegin", '<span class="ib-av" style="--h:' + hue(nm) + '">' + esc(ini(nm)) + (wa ? '<i class="ib-wa" title="WhatsApp"></i>' : "") + "</span>");
    });
    filter(lc);
  }
  function filter(lc) {
    var n = 0;
    [].forEach.call(lc.querySelectorAll(".lc-it"), function (a) {
      var ok = (!q || a.textContent.toLowerCase().indexOf(q) >= 0) && (ch === "all" || (ch === "need" ? a.dataset.need === "1" : a.dataset.ch === ch));
      a.style.display = ok ? "" : "none"; if (ok) n++;
    });
    var e = lc.querySelector("#ib-none"); if (!n && lc.querySelector(".lc-it")) { if (!e) lc.querySelector("#lc-list").insertAdjacentHTML("beforeend", '<div id="ib-none" class="lc-empty">No chats match.</div>'); } else if (e) e.remove();
  }
  function side(lc) {
    var r = lc.querySelector("#lc-r"), info = r && r.querySelector("#lc-info"), top = r && r.querySelector("#lc-top h3"); if (!info || !top) return;
    var nm = top.textContent.trim(), key = nm + "|" + info.textContent;
    var sd = r.querySelector("#ib-side"); if (sd && sd.dataset.k === key) return;
    if (!sd) { sd = document.createElement("aside"); sd.id = "ib-side"; r.appendChild(sd); }
    sd.dataset.k = key;
    var val = function (label) { var s = [].find.call(info.querySelectorAll("span"), function (x) { return x.textContent.indexOf(label) === 0; }); return s ? (s.querySelector("b") || s).textContent.trim() : "—"; };
    var ph = val("Phone"), em = val("Email"), pg = val("Page"), digits = ph.replace(/\D/g, "");
    sd.innerHTML = '<div class="ib-card"><span class="ib-av lg" style="--h:' + hue(nm) + '">' + esc(ini(nm)) + "</span><b>" + esc(nm) + "</b><small>" + esc((r.querySelector("#lc-top small") || {}).textContent || "") + "</small>" +
      '<div class="ib-acts">' + (digits ? '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + digits + '">' + ic("message-circle") + "WhatsApp</a><a class=\"btn sm\" href=\"tel:+" + digits + '">' + ic("phone") + "Call</a>" : "") + (em !== "—" ? '<a class="btn sm" href="mailto:' + esc(em) + '">' + ic("mail") + "Email</a>" : "") + "</div></div>" +
      '<dl class="ib-dl"><dt>Phone</dt><dd>' + esc(ph) + "</dd><dt>Email</dt><dd>" + esc(em) + "</dd><dt>Started on page</dt><dd>" + (pg !== "—" ? '<a href="' + esc(pg) + '" target="_blank">' + esc(pg) + "</a>" : "—") + "</dd></dl>" +
      '<p class="muted ib-tip">Tip: press <b>Take over</b> to stop the AI, then reply. <b>Save as lead</b> adds this chat to Enquiries.</p>';
    W.fillIcons(sd);
  }
  function quick(lc) {
    var f = lc.querySelector("#lc-in"); if (!f || f.previousElementSibling && f.previousElementSibling.id === "ib-quick") return;
    f.insertAdjacentHTML("beforebegin", '<div id="ib-quick">' + QUICK.map(function (t, i) { return '<button type="button" data-i="' + i + '">' + esc(t.length > 42 ? t.slice(0, 40) + "…" : t) + "</button>"; }).join("") + "</div>");
    lc.querySelector("#ib-quick").onclick = function (e) { var b = e.target.closest("[data-i]"); if (!b) return; var ta = f.querySelector("textarea"); ta.value = QUICK[+b.dataset.i]; ta.focus(); };
  }
  function run() {
    var lc = document.querySelector("#view .lc"); if (!lc) return;
    var h = document.querySelector("#view .ph h1"); if (h && h.textContent === "Live chat") { h.textContent = "Inbox"; var cr = document.querySelector("#view .ph .crumb"); if (cr) cr.lastChild.textContent = " / Inbox"; }
    lc.classList.add("ib"); var ta = lc.querySelector("#lc-in textarea"); if (ta) ta.placeholder = "Type a reply… (Enter to send)"; list(lc); side(lc); quick(lc);
  }
  var t; function soon() { clearTimeout(t); t = setTimeout(run, 50); }
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200); var v = v0.parentNode; /* stable parent: #view is replaced on every screen change */
    new MutationObserver(function (m) { if (m.some(function (x) { return !(x.target.id === "ib-side" || x.target.closest && x.target.closest("#ib-side,#ib-tools,#ib-quick")); })) soon(); }).observe(v, { childList: true, subtree: true });
    // shorter menu label
    var fix = function () { [].forEach.call(document.querySelectorAll('.nav-a[data-v="chat"] .nav-t, .nav-a[data-v="chat"] span:not(.nav-bdg):not([data-bdg])'), function (s) { if (/Inbox \(chat/.test(s.textContent)) s.textContent = "Inbox"; }); };
    fix(); setTimeout(fix, 800); }
  boot();
})();
