/* P17 — booking widget for /book-a-visit/ (talks to /api/forms.php book_cfg / book_slots / book_create) */
(function () {
  "use strict";
  var box = document.getElementById("bkw"); if (!box) return;
  var $ = function (s) { return box.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(box.querySelectorAll(s)); };
  var ICON = { visit: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', office: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', online: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3"/>' };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var call = function (body) { return fetch("/api/forms.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server error" }; }); }); };
  var C = null, sel = { type: null, date: null, time: null };
  var DW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var dt = function (s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var t12 = function (tm) { var h = +tm.slice(0, 2); return ((h % 12) || 12) + ":" + tm.slice(3) + (h < 12 ? " am" : " pm"); };
  var nice = function (d) { var x = dt(d); return DW[x.getDay()] + " " + x.getDate() + " " + MO[x.getMonth()]; };

  function step(n) {
    $$(".bkw-pane").forEach(function (p) { p.hidden = p.dataset.p !== String(n); });
    $$(".bkw-steps li").forEach(function (l) { var s = +l.dataset.s; l.className = s === n ? "on" : s < n || n === 4 ? "ok" : ""; });
    box.dataset.state = "s" + n;
    if (n > 1 && box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function types() {
    $("#bkw-types").innerHTML = C.types.map(function (t) {
      return '<button type="button" class="bkw-type" data-t="' + esc(t.k) + '" aria-pressed="false"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON[t.k] || ICON.office) + '</svg></i><b>' + esc(t.label) + '</b><small>' + esc(t.hint) + '</small><em>' + t.dur + ' minutes</em></button>';
    }).join("");
    $$(".bkw-type").forEach(function (b) { b.onclick = function () { sel.type = C.types.filter(function (t) { return t.k === b.dataset.t; })[0]; sel.time = null; $$(".bkw-type").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); dates(); step(2); }; });
  }
  function dates() {
    var keys = Object.keys(C.days), first = null;
    $("#bkw-dates").innerHTML = keys.map(function (k) { var d = dt(k), open = C.days[k]; if (open && !first) first = k;
      return '<button type="button" class="bkw-date" role="option" data-d="' + k + '" aria-selected="false"' + (open ? "" : " disabled") + '><small>' + DW[d.getDay()] + '</small><b>' + d.getDate() + '</b><span>' + MO[d.getMonth()] + '</span></button>'; }).join("");
    $$(".bkw-date").forEach(function (b) { b.onclick = function () { pick(b.dataset.d); }; });
    pick(sel.date && C.days[sel.date] ? sel.date : first);
  }
  function pick(d) {
    sel.date = d; sel.time = null; $("#bkw-n2").disabled = true;
    $$(".bkw-date").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.d === d); if (b.dataset.d === d) b.scrollIntoView({ block: "nearest", inline: "nearest" }); });
    var sl = $("#bkw-slots"); if (!d) { sl.innerHTML = '<p class="bkw-msg">No open days right now — please WhatsApp us.</p>'; return; }
    sl.innerHTML = '<p class="bkw-msg">Checking free times…</p>';
    call({ action: "book_slots", type: sel.type.k, date: d }).then(function (r) {
      if (sel.date !== d) return;
      if (!r.ok) { sl.innerHTML = '<p class="bkw-msg">' + esc(r.error || "Could not load times") + "</p>"; return; }
      sl.innerHTML = r.slots.length ? r.slots.map(function (t) { return '<button type="button" class="bkw-slot" role="option" data-tm="' + t + '" aria-selected="false">' + t12(t) + "</button>"; }).join("") : '<p class="bkw-msg">' + nice(d) + " is fully booked — please choose another day.</p>";
      $$(".bkw-slot").forEach(function (b) { b.onclick = function () { sel.time = b.dataset.tm; $$(".bkw-slot").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); $("#bkw-n2").disabled = false; }; });
    });
  }
  function details() {
    var visit = sel.type.k === "visit"; $(".bkw-addr").hidden = !visit; $(".bkw-addr input").required = visit;
    $("#bkw-sum").innerHTML = "<span><b>" + esc(sel.type.label) + "</b> · " + sel.type.dur + " min</span><span>📅 <b>" + nice(sel.date) + "</b> at <b>" + t12(sel.time) + "</b></span>";
    $("#bkw-err").hidden = true; step(3);
    var n = $("#bkw-form [name=name]"); if (n && !n.value) setTimeout(function () { n.focus(); }, 250);
  }
  $("#bkw-n2").onclick = details;
  $$("[data-go]").forEach(function (b) { b.onclick = function () { step(+b.dataset.go); }; });
  var strip = $("#bkw-dates"); $("#bkw-dl").onclick = function () { strip.scrollLeft -= 320; }; $("#bkw-dr").onclick = function () { strip.scrollLeft += 320; };
  $("#bkw-form").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target, err = $("#bkw-err"), go = $("#bkw-go");
    var v = function (n) { return (f.elements[n] && f.elements[n].value || "").trim(); };
    var bad = v("name").length < 2 ? "Please enter your name." : !/^[+\d][\d\s()-]{6,}$/.test(v("phone")) ? "Please enter a valid phone number." : sel.type.k === "visit" && v("address").length < 4 ? "Please enter the site address." : "";
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    err.hidden = true; go.disabled = true; var o = go.textContent; go.textContent = "Sending…";
    call({ action: "book_create", type: sel.type.k, date: sel.date, time: sel.time, name: v("name"), phone: v("phone"), email: v("email"), city: v("city"), address: sel.type.k === "visit" ? v("address") : "", service: v("service"), note: v("note"), _hp: v("_hp"), page: location.pathname })
      .then(function (r) {
        if (r.ok) { $("#bkw-dt").textContent = (r.type || sel.type.label) + " · " + (r.when || nice(sel.date) + ", " + t12(sel.time)); step(4); try { window.dataLayer && window.dataLayer.push({ event: "booking_request", booking_type: sel.type.k }); } catch (x) {} return; }
        err.textContent = (r.error || "Something went wrong.") + (/taken/.test(r.error || "") ? "" : " You can also WhatsApp us on +92 322 4000768."); err.hidden = false;
        if (/taken/.test(r.error || "")) { setTimeout(function () { step(2); pick(sel.date); }, 1400); }
      })
      .catch(function () { err.textContent = "Network problem — please try again or WhatsApp us on +92 322 4000768."; err.hidden = false; })
      .then(function () { go.disabled = false; go.textContent = o; });
  });
  call({ action: "book_cfg" }).then(function (r) {
    if (!r.ok || !r.on || !r.types.length) return step(0);
    C = r; $("#bkw-city").innerHTML = r.areas.map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("");
    types(); step(1);
    var q = new URLSearchParams(location.search).get("type"); if (q) { var b = box.querySelector('.bkw-type[data-t="' + q.replace(/[^a-z0-9]/g, "") + '"]'); if (b) b.click(); }
  }).catch(function () { step(0); });
})();
