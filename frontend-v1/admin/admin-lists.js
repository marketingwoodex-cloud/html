/* Woodex Admin — P16 3.4 list-page pattern. Upgrades every existing list table without touching its module:
   paging for long lists (25/page), row count, mobile card rows (data-label), sticky header. Re-applies when a list redraws. */
(function () {
  "use strict";
  var PER = 25, busy = false; /*P18sort*/
  var SORT = {}, key = function () { return (location.hash || "#/").split("?")[0]; };
  var perOf = function () { return +(localStorage.getItem("wx-per:" + key()) || PER) || PER; };
  var val = function (td) { var t = (td ? td.getAttribute("data-sort") || td.textContent : "").trim(), n = t.replace(/[,\s]|Rs|PKR/gi, "");
    if (/^-?\d+(\.\d+)?%?$/.test(n)) return [0, parseFloat(n)];
    var d = Date.parse(t); if (!isNaN(d) && /\d{4}|\d{1,2} [A-Z][a-z]{2}/.test(t)) return [1, d];
    return [2, t.toLowerCase()]; };
  function sortable(tbl) {
    var ths = tbl.querySelectorAll("thead th"), tb = tbl.tBodies[0]; if (!tb || !ths.length) return;
    var plain = [].every.call(tb.rows, function (r) { return r.querySelector(".empty") || (r.cells.length === ths.length && !r.querySelector("[colspan]")); });
    if (!plain || tb.rows.length < 3 || tb.querySelector("input,select,textarea")) return; /* editable tables are never sorted */
    [].forEach.call(ths, function (th, i) {
      if (th.dataset.srt || !th.textContent.trim() || th.querySelector("input")) return; th.dataset.srt = "1"; th.classList.add("srt"); th.title = "Sort";
      th.addEventListener("click", function () { var k = key() + "|" + i, cur = SORT[key()]; SORT[key()] = { i: i, d: cur && cur.i === i && cur.d === 1 ? -1 : 1 }; apply(tbl); tbl.dataset.pg = 1; run(); });
    });
    apply(tbl);
  }
  function apply(tbl) {
    var st = SORT[key()], tb = tbl.tBodies[0]; [].forEach.call(tbl.querySelectorAll("thead th"), function (th, i) { th.classList.toggle("asc", !!st && st.i === i && st.d === 1); th.classList.toggle("desc", !!st && st.i === i && st.d === -1); });
    if (!st || !tb) return; var rows = [].slice.call(tb.rows).filter(function (r) { return !r.querySelector(".empty"); });
    rows.sort(function (a, b) { var x = val(a.cells[st.i]), y = val(b.cells[st.i]); return (x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)) * st.d; });
    var sig = rows.map(function (r) { return r.rowIndex; }).join(","); if (tbl.dataset.sig === sig) return;
    rows.forEach(function (r) { tb.appendChild(r); }); tbl.dataset.sig = rows.map(function (r) { return r.rowIndex; }).join(",");
  }
  function label(tbl) {
    var hs = [].map.call(tbl.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
    [].forEach.call(tbl.querySelectorAll("tbody tr"), function (tr) {
      [].forEach.call(tr.children, function (td, i) { if (!td.hasAttribute("data-label") && hs[i]) td.setAttribute("data-label", hs[i]); });
    });
  }
  function page(tbl) {
    var tb = tbl.tBodies[0]; if (!tb) return;
    var rows = [].filter.call(tb.rows, function (r) { return !r.querySelector(".empty") && r.style.display !== "none" || r.hasAttribute("data-pg"); });
    var wrap = tbl.closest(".tbl-wrap") || tbl.parentNode, bar = wrap.nextElementSibling && wrap.nextElementSibling.classList.contains("lp-bar") ? wrap.nextElementSibling : null;
    var PER = perOf(); if (rows.length <= Math.min(PER, 10) && rows.length <= PER) { rows.forEach(function (r) { if (r.hasAttribute("data-pg")) { r.removeAttribute("data-pg"); r.style.display = ""; } }); if (bar) bar.remove(); return; }
    var n = Math.ceil(rows.length / PER), p = Math.min(+(tbl.dataset.pg || 1), n); tbl.dataset.pg = p;
    rows.forEach(function (r, i) { r.setAttribute("data-pg", ""); r.style.display = i >= (p - 1) * PER && i < p * PER ? "" : "none"; });
    if (!bar) { bar = document.createElement("div"); bar.className = "lp-bar"; wrap.parentNode.insertBefore(bar, wrap.nextSibling); }
    var btn = function (k, t, dis, on) { return '<button type="button" data-p="' + k + '"' + (dis ? " disabled" : "") + (on ? ' class="on"' : "") + ">" + t + "</button>"; }, nums = "";
    for (var k = 1; k <= n; k++) if (k === 1 || k === n || Math.abs(k - p) <= 1) nums += btn(k, k, false, k === p); else if (Math.abs(k - p) === 2) nums += "<span>…</span>";
    bar.innerHTML = "<label class='lp-per'>Show <select data-per>" + [10, 25, 50, 100].map(function (n) { return "<option" + (n === PER ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select> entries</label><small>Showing " + ((p - 1) * PER + 1) + "–" + Math.min(p * PER, rows.length) + " of " + rows.length + "</small><div>" + btn(p - 1, "‹", p === 1) + nums + btn(p + 1, "›", p === n) + "</div>";
    bar.onchange = function (e) { if (e.target.matches("[data-per]")) { localStorage.setItem("wx-per:" + key(), e.target.value); tbl.dataset.pg = 1; run(); } };
    bar.onclick = function (e) { var b = e.target.closest("[data-p]"); if (!b || b.disabled) return; tbl.dataset.pg = b.dataset.p; run(); (tbl.closest(".card") || tbl).scrollIntoView({ block: "start", behavior: "smooth" }); };
  }
  function run() {
    if (busy) return; busy = true;
    try { [].forEach.call(document.querySelectorAll("#view table.tbl"), function (t) { t.classList.add("lp"); label(t); sortable(t); page(t); }); } finally { setTimeout(function () { busy = false; }, 0); }
  }
  var tmr; function soon() { clearTimeout(tmr); tmr = setTimeout(run, 60); }
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200); var v = v0.parentNode; /* stable parent: #view is replaced on every screen change */
    new MutationObserver(function (m) { if (!busy && m.some(function (x) { return x.type === "childList"; })) soon(); }).observe(v, { childList: true, subtree: true });
    // a new search/filter resets to page 1
    v.addEventListener("input", function (e) { if (e.target.matches("input[type=search], input[placeholder^='Search'], select")) [].forEach.call(document.querySelectorAll("#view table.tbl"), function (t) { t.dataset.pg = 1; }); }, true);
    v.addEventListener("change", function (e) { if (e.target.matches("select")) [].forEach.call(document.querySelectorAll("#view table.tbl"), function (t) { t.dataset.pg = 1; }); }, true);
    run(); }
  boot();
})();
