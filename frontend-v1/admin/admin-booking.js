/* Woodex Admin — P17 Booking calendar: month / week / list, approval queue, new / edit booking, settings.
   API: bk_list, bk_slots, bk_save, bk_status, bk_cfg_save (api/booking-lib.php). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, head = W.head, can = W.can;
  var A = function (s) { return esc(s == null ? "" : String(s)); };
  var two = function (n) { return String(n).padStart(2, "0"); };
  var ymd = function (d) { return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); };
  var parse = function (s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var add = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var ST = { pending: ["Waiting", "warn"], confirmed: ["Confirmed", "ok"], done: ["Done", "info"], cancelled: ["Cancelled", "bad"], noshow: ["No-show", "bad"] };
  var TICON = { visit: "map-pin", office: "briefcase", online: "phone" };
  var t12 = function (tm) { var h = +tm.slice(0, 2); return ((h % 12) || 12) + ":" + tm.slice(3) + (h < 12 ? " am" : " pm"); };
  var wa = function (p) { var d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "0") d = "92" + d.slice(1); return "https://wa.me/" + d; };

  W.VIEWS.bookings = function (el) {
    var S = W.S.bk || (W.S.bk = { view: "month", cur: ymd(new Date()) }), D = null;
    el.innerHTML = head("Bookings", "Bookings", (can("owner,admin") ? '<button class="btn" id="bk-set">' + ic("settings") + "Settings</button>" : "") + '<button class="btn pri" id="bk-new">' + ic("plus") + "New booking</button>") +
      '<div class="it-tot" id="bk-k"></div><div class="bk-wrap"><div class="card bk-main"><div class="bk-bar"><div class="seg" id="bk-v"></div><span class="bk-nav"><button class="btn sm" id="bk-prev" aria-label="Previous">‹</button><button class="btn sm" id="bk-today">Today</button><button class="btn sm" id="bk-next" aria-label="Next">›</button></span><b id="bk-title"></b><span class="bk-leg"><i class="warn"></i>Waiting <i class="ok"></i>Confirmed <i class="info"></i>Done</span></div><div id="bk-cal"><div class="empty">Loading…</div></div></div>' +
      '<div class="card bk-side"><div class="card-h"><h3>Waiting for approval</h3><span class="badge warn" id="bk-pn">0</span></div><div class="card-b" id="bk-pend"></div></div></div>';
    W.fillIcons && W.fillIcons(el);

    function range() {
      var c = parse(S.cur);
      if (S.view === "week") { var s = add(c, -((c.getDay() + 6) % 7)); return [s, add(s, 6)]; }
      if (S.view === "list") return [add(c, -7), add(c, 60)];
      var f = new Date(c.getFullYear(), c.getMonth(), 1), st = add(f, -((f.getDay() + 6) % 7)); return [st, add(st, 41)];
    }
    function load() {
      var r = range();
      api("bk_list", { from: ymd(r[0]), to: ymd(r[1]) }).then(function (x) { if (!x.ok) return toast(x.error || "Could not load", true); D = x; draw(); });
    }
    function chip(b) { return "<button class='bk-chip " + (ST[b.status] || [])[1] + "' data-b='" + b.id + "' title='" + A(b.type_label + " · " + b.name) + "'>" + ic(TICON[b.type] || "clock") + "<b>" + t12(b.tm) + "</b> " + A(b.name) + "</button>"; }
    function draw() {
      var today = D.today, items = D.items.filter(function (b) { return b.status !== "cancelled"; });
      var wk = add(parse(today), 6), weekN = items.filter(function (b) { return b.d >= today && b.d <= ymd(wk); }).length;
      $("#bk-k").innerHTML = "<div class='it-t'><small>Today</small><b>" + items.filter(function (b) { return b.d === today; }).length + "</b></div><div class='it-t'><small>Next 7 days</small><b>" + weekN + "</b></div>" +
        "<div class='it-t" + (D.pending.length ? " bad" : "") + "'><small>Waiting for approval</small><b>" + D.pending.length + "</b></div><div class='it-t ok'><small>Confirmed (shown)</small><b>" + items.filter(function (b) { return b.status === "confirmed"; }).length + "</b></div>";
      $("#bk-v").innerHTML = [["month", "Month"], ["week", "Week"], ["list", "List"]].map(function (v) { return "<button data-v='" + v[0] + "' class='" + (S.view === v[0] ? "on" : "") + "'>" + v[1] + "</button>"; }).join("");
      var c = parse(S.cur), r = range(), cfg = D.cfg, closed = function (d) { var n = (parse(d).getDay() + 6) % 7 + 1; return cfg.days.indexOf(n) < 0 || cfg.blocked.indexOf(d) >= 0; };
      var by = {}; items.forEach(function (b) { (by[b.d] = by[b.d] || []).push(b); });
      var h = "";
      if (S.view === "month") {
        $("#bk-title").textContent = MON[c.getMonth()] + " " + c.getFullYear();
        h = "<div class='bk-month'>" + DOW.map(function (d) { return "<div class='bk-dh'>" + d + "</div>"; }).join("");
        for (var i = 0; i < 42; i++) {
          var d = add(r[0], i), k = ymd(d), L = by[k] || [];
          h += "<div class='bk-day" + (d.getMonth() !== c.getMonth() ? " out" : "") + (k === today ? " today" : "") + (closed(k) ? " closed" : "") + "' data-day='" + k + "'><span class='bk-dn'>" + d.getDate() + "</span>" +
            L.slice(0, 3).map(chip).join("") + (L.length > 3 ? "<button class='bk-more' data-day2='" + k + "'>+" + (L.length - 3) + " more</button>" : "") + "</div>";
        }
        h += "</div>";
      } else if (S.view === "week") {
        $("#bk-title").textContent = r[0].getDate() + " " + MON[r[0].getMonth()].slice(0, 3) + " – " + r[1].getDate() + " " + MON[r[1].getMonth()].slice(0, 3) + " " + r[1].getFullYear();
        var o = +cfg.open.slice(0, 2), e = Math.max(o + 1, +cfg.last.slice(0, 2) + 1);
        h = "<div class='bk-week' style='grid-template-columns:56px repeat(7,minmax(0,1fr))'><div></div>";
        for (var j = 0; j < 7; j++) { var dd = add(r[0], j), kk = ymd(dd); h += "<div class='bk-dh" + (kk === today ? " today" : "") + "'>" + DOW[j] + " <b>" + dd.getDate() + "</b></div>"; }
        for (var hr = o; hr < e; hr++) {
          h += "<div class='bk-hr'>" + t12(two(hr) + ":00").replace(":00", "") + "</div>";
          for (var j2 = 0; j2 < 7; j2++) { var k2 = ymd(add(r[0], j2)); h += "<div class='bk-cell" + (closed(k2) ? " closed" : "") + "' data-day='" + k2 + "' data-hr='" + two(hr) + ":00'>" + (by[k2] || []).filter(function (b) { return +b.tm.slice(0, 2) === hr; }).map(chip).join("") + "</div>"; }
        }
        h += "</div>";
      } else {
        $("#bk-title").textContent = "Upcoming & recent";
        var keys = Object.keys(by).sort();
        h = keys.length ? keys.map(function (k) { return "<div class='bk-lday'><h4>" + parse(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + (k === today ? " <span class='badge gold'>Today</span>" : "") + "</h4>" + by[k].map(row).join("") + "</div>"; }).join("") : "<div class='empty'>No bookings in this period.</div>";
      }
      $("#bk-cal").innerHTML = h;
      $("#bk-pn").textContent = D.pending.length;
      $("#bk-pend").innerHTML = D.pending.length ? D.pending.map(function (b) {
        return "<div class='bk-p'><div><b>" + A(b.name) + "</b><small>" + ic(TICON[b.type] || "clock") + A(b.type_label) + " · " + A(b.when) + "</small><small class='muted'>" + A(b.address || b.city || b.phone) + "</small></div>" +
          "<span><button class='btn sm pri' data-ok='" + b.id + "'>" + ic("check") + "Confirm</button><button class='btn sm' data-b='" + b.id + "'>Open</button></span></div>";
      }).join("") : "<div class='empty' style='padding:18px'>" + ic("circle-check") + "<p>All bookings approved.</p></div>";
      W.fillIcons && W.fillIcons(el);
    }
    function row(b) {
      return "<div class='bk-row' data-b='" + b.id + "'><b class='bk-t'>" + t12(b.tm) + "</b><span class='bk-ti'>" + ic(TICON[b.type] || "clock") + "</span><div><b>" + A(b.name) + "</b> <small class='muted'>" + A(b.type_label) + " · " + b.dur + " min</small><small>" + A(b.address || b.city || "") + "</small></div>" +
        (b.staff ? "<span class='badge'>" + A(b.staff) + "</span>" : "") + "<span class='badge " + (ST[b.status] || [])[1] + "'>" + (ST[b.status] || [b.status])[0] + "</span></div>";
    }
    var find = function (id) { id = +id; return D.items.concat(D.pending).filter(function (b) { return b.id === id; })[0]; };

    function view(b) {
      W.modal("<h2>" + A(b.type_label) + " — " + A(b.name) + "</h2><div class='bk-det'>" +
        "<p>" + ic("clock") + "<b>" + A(b.when) + "</b> · " + b.dur + " min</p>" + (b.address || b.city ? "<p>" + ic("map-pin") + A([b.address, b.city].filter(Boolean).join(", ")) + "</p>" : "") +
        "<p>" + ic("phone") + "<a href='tel:" + A(b.phone) + "'>" + A(b.phone) + "</a> · <a href='" + wa(b.phone) + "' target='_blank' rel='noopener'>WhatsApp</a>" + (b.email ? " · <a href='mailto:" + A(b.email) + "'>" + A(b.email) + "</a>" : "") + "</p>" +
        (b.staff ? "<p>" + ic("user") + "With " + A(b.staff) + "</p>" : "") + (b.note ? "<p class='bk-note'>" + A(b.note) + "</p>" : "") +
        "<p><span class='badge " + (ST[b.status] || [])[1] + "'>" + (ST[b.status] || [b.status])[0] + "</span> <small class='muted'>" + (b.src === "web" ? "Booked on the website" : "Added by the team") + "</small></p></div>" +
        "<div class='bk-acts'>" + (b.status === "pending" ? "<button class='btn pri' data-s='confirmed'>" + ic("check") + "Confirm &amp; notify</button>" : "") +
        (b.status === "confirmed" ? "<button class='btn pri' data-s='done'>" + ic("circle-check") + "Mark done</button><button class='btn' data-s='noshow'>No-show</button>" : "") +
        (b.status !== "cancelled" && b.status !== "done" ? "<button class='btn' data-s='cancelled'>Cancel</button>" : "<button class='btn' data-s='confirmed'>Re-open</button>") +
        "<button class='btn' id='bk-edit'>" + ic("square-pen") + "Edit / reschedule</button>" + (b.lead_id ? "<a class='btn' href='#/enquiries/" + b.lead_id + "'>Open lead</a>" : "") + "<button class='btn' data-close>Close</button></div>");
      $$("#modal-card [data-s]").forEach(function (x) { x.onclick = function () {
        var s = x.dataset.s; if (s === "cancelled" && !confirm("Cancel this booking?")) return;
        api("bk_status", { id: b.id, status: s }).then(function (r) { if (!r.ok) return toast(r.error, true); W.closeModal ? W.closeModal() : ($("#modal").hidden = true); toast(s === "confirmed" ? "Confirmed" + (r.sent && (r.sent.whatsapp || r.sent.email) ? " — customer notified" : "") : "Updated"); load(); });
      }; });
      $("#bk-edit").onclick = function () { form(b); };
      var cl = $("#modal-card [data-close]"); if (cl) cl.onclick = function () { $("#modal").hidden = true; };
    }

    function form(b, pre) {
      b = b || {}; pre = pre || {}; var cfg = D.cfg, isNew = !b.id;
      var d0 = b.d || pre.d || D.today, t0 = b.tm || pre.tm || "", ty = b.type || "visit";
      W.modal("<h2>" + (isNew ? "New booking" : "Edit booking") + "</h2><div class='s17-g2'>" +
        "<label>Name *<input id='bf-n' value='" + A(b.name) + "'></label><label>Phone *<input id='bf-p' value='" + A(b.phone) + "' placeholder='03xx xxxxxxx'></label>" +
        "<label>Type<select id='bf-t'>" + cfg.types.map(function (t) { return "<option value='" + A(t.k) + "' data-dur='" + t.dur + "'" + (t.k === ty ? " selected" : "") + ">" + A(t.label) + "</option>"; }).join("") + "</select></label>" +
        "<label>Email<input id='bf-e' type='email' value='" + A(b.email) + "'></label>" +
        "<label>Date<input id='bf-d' type='date' value='" + d0 + "'></label><label>Time <small class='muted' id='bf-free'></small><input id='bf-tm' type='time' step='900' value='" + t0 + "' list='bf-sl'><datalist id='bf-sl'></datalist></label>" +
        "<label>Length (minutes)<input id='bf-du' type='number' min='15' max='480' step='15' value='" + (b.dur || "") + "'></label>" +
        "<label>With (team member)<select id='bf-s'><option value=''>—</option>" + D.team.map(function (u) { return "<option value='" + u.id + "'" + (u.id === b.staff_id ? " selected" : "") + ">" + A(u.name) + "</option>"; }).join("") + "</select></label>" +
        "<label>City / area<input id='bf-c' value='" + A(b.city || cfg.areas[0] || "") + "' list='bf-ar'><datalist id='bf-ar'>" + cfg.areas.map(function (a) { return "<option value='" + A(a) + "'>"; }).join("") + "</datalist></label>" +
        "<label>Site address<input id='bf-a' value='" + A(b.address) + "'></label></div>" +
        "<label>Note<textarea id='bf-no' rows='2'>" + A(b.note) + "</textarea></label>" +
        "<label class='check'><input type='checkbox' id='bf-nt'" + (isNew ? " checked" : "") + "> Send confirmation to the customer (WhatsApp + email)</label>" +
        "<div class='bk-acts'><button class='btn pri' id='bf-save'>" + ic("check") + "Save booking</button><button class='btn' data-close>Cancel</button></div>", "wide");
      var slots = function () {
        api("bk_slots", { date: $("#bf-d").value, type: $("#bf-t").value, id: b.id || 0 }).then(function (r) {
          if (!r.ok) return; $("#bf-sl").innerHTML = r.slots.map(function (s) { return "<option value='" + s + "'>"; }).join("");
          $("#bf-free").textContent = r.closed ? "(" + r.closed.toLowerCase() + " day)" : r.slots.length ? "· free: " + r.slots.slice(0, 6).map(t12).join(", ") + (r.slots.length > 6 ? "…" : "") : "· fully booked";
          if (!$("#bf-tm").value && r.slots[0]) $("#bf-tm").value = r.slots[0];
        });
      };
      $("#bf-d").onchange = slots; $("#bf-t").onchange = function () { if (!b.dur) $("#bf-du").value = ""; slots(); }; slots();
      $("#modal-card [data-close]").onclick = function () { $("#modal").hidden = true; };
      var save = function (force) {
        var opt = $("#bf-t").selectedOptions[0];
        var p = { id: b.id || 0, lead_id: b.lead_id || pre.lead_id || 0, name: $("#bf-n").value, phone: $("#bf-p").value, email: $("#bf-e").value, type: $("#bf-t").value, d: $("#bf-d").value, tm: $("#bf-tm").value,
          dur: +$("#bf-du").value || +opt.dataset.dur, staff_id: $("#bf-s").value, city: $("#bf-c").value, address: $("#bf-a").value, note: $("#bf-no").value, notify: $("#bf-nt").checked, force: !!force };
        api("bk_save", p).then(function (r) {
          if (r.clash) { if (confirm(r.error + ".\nBook it anyway?")) save(true); return; }
          if (!r.ok) return toast(r.error || "Could not save", true);
          $("#modal").hidden = true; toast("Booking saved" + (r.sent && (r.sent.whatsapp || r.sent.email) ? " — customer notified" : "")); S.cur = p.d; load();
        });
      };
      $("#bf-save").onclick = function () { save(false); };
    }
    W.bookingForm = function (pre) { if (D) form(null, pre); };

    function settings() {
      var c = JSON.parse(JSON.stringify(D.cfg));
      W.modal("<h2>Booking settings</h2><label class='check'><input type='checkbox' id='bs-on'" + (c.on ? " checked" : "") + "> Online booking is <b>open</b> on the website</label>" +
        "<h4 class='bk-h4'>What customers can book</h4><div id='bs-ty'>" + c.types.map(function (t, i) {
          return "<div class='bk-ty'><label class='check' style='margin:0'><input type='checkbox' data-ton='" + i + "'" + (t.on ? " checked" : "") + "></label><input data-tl='" + i + "' value='" + A(t.label) + "'><input data-td='" + i + "' type='number' min='15' step='15' value='" + t.dur + "' title='Minutes'><small>min</small><input data-th='" + i + "' value='" + A(t.hint || "") + "' placeholder='Short description'></div>";
        }).join("") + "</div>" +
        "<h4 class='bk-h4'>Working days &amp; hours</h4><div class='bk-days'>" + DOW.map(function (d, i) { return "<label class='check'><input type='checkbox' data-dw='" + (i + 1) + "'" + (c.days.indexOf(i + 1) >= 0 ? " checked" : "") + "> " + d + "</label>"; }).join("") + "</div>" +
        "<div class='s17-g2'><label>First slot<input id='bs-o' type='time' value='" + c.open + "'></label><label>Last slot<input id='bs-l' type='time' value='" + c.last + "'></label>" +
        "<label>Slot every (minutes)<input id='bs-st' type='number' min='15' step='15' value='" + c.step + "'></label><label>Max bookings per day<input id='bs-m' type='number' min='1' value='" + c.maxDay + "'></label>" +
        "<label>Minimum notice (hours)<input id='bs-mh' type='number' min='0' value='" + c.minHours + "'></label><label>Book up to (days ahead)<input id='bs-ah' type='number' min='1' value='" + c.ahead + "'></label></div>" +
        "<div class='s17-g2'><label>Areas you visit (one per line)<textarea id='bs-ar' rows='4'>" + A(c.areas.join("\n")) + "</textarea></label><label>Closed dates — holidays (one per line, YYYY-MM-DD)<textarea id='bs-bl' rows='4'>" + A(c.blocked.join("\n")) + "</textarea></label></div>" +
        "<div class='bk-acts'><button class='btn pri' id='bs-save'>" + ic("check") + "Save settings</button><button class='btn' data-close>Cancel</button></div>", "wide");
      $("#modal-card [data-close]").onclick = function () { $("#modal").hidden = true; };
      $("#bs-save").onclick = function () {
        var g = function (s) { return $("#modal-card " + s); };
        c.on = g("#bs-on").checked; c.open = g("#bs-o").value; c.last = g("#bs-l").value; c.step = +g("#bs-st").value; c.maxDay = +g("#bs-m").value; c.minHours = +g("#bs-mh").value; c.ahead = +g("#bs-ah").value;
        c.days = $$("#modal-card [data-dw]").filter(function (x) { return x.checked; }).map(function (x) { return +x.dataset.dw; });
        c.types.forEach(function (t, i) { t.on = g("[data-ton='" + i + "']").checked; t.label = g("[data-tl='" + i + "']").value; t.dur = +g("[data-td='" + i + "']").value; t.hint = g("[data-th='" + i + "']").value; });
        c.areas = g("#bs-ar").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
        c.blocked = g("#bs-bl").value.split(/[\s,]+/).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); });
        api("bk_cfg_save", { cfg: c }).then(function (r) { if (!r.ok) return toast(r.error, true); $("#modal").hidden = true; toast("Booking settings saved"); load(); });
      };
    }

    el.addEventListener("click", function (e) {
      var t = e.target.closest("button,[data-day],[data-b]"); if (!t || !D) return;
      if (t.dataset.v) { S.view = t.dataset.v; load(); return; }
      if (t.dataset.ok) { api("bk_status", { id: +t.dataset.ok, status: "confirmed" }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Confirmed" + (r.sent && (r.sent.whatsapp || r.sent.email) ? " — customer notified" : "")); load(); }); return; }
      if (t.dataset.b) { var b = find(t.dataset.b); if (b) view(b); return; }
      if (t.dataset.day2) { S.view = "list"; S.cur = t.dataset.day2; load(); return; }
      if (t.dataset.day && e.target === t || (t.dataset.day && e.target.classList.contains("bk-dn"))) { if (can("owner,admin,sales")) form(null, { d: t.dataset.day, tm: t.dataset.hr || "" }); }
    });
    $("#bk-new").onclick = function () { if (D) form(); };
    if ($("#bk-set")) $("#bk-set").onclick = function () { if (D) settings(); };
    var step = function (n) { var c = parse(S.cur); if (S.view === "month") c = new Date(c.getFullYear(), c.getMonth() + n, 1); else c = add(c, n * 7); S.cur = ymd(c); load(); };
    $("#bk-prev").onclick = function () { step(-1); }; $("#bk-next").onclick = function () { step(1); };
    $("#bk-today").onclick = function () { S.cur = ymd(new Date()); load(); };
    load();
  };
})();
