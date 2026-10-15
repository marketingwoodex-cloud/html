/* Woodex Admin — P16 System check: finds live-server problems (PHP, DB, SSL, sign-in). */
(function () {
  "use strict";
  var W = window.WXA, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, head = W.head;
  function row(c) {
    return '<tr><td style="width:34px">' + (c.ok ? '<span style="color:#16a34a;font-weight:700">✓</span>' : '<span style="color:#dc2626;font-weight:700">✗</span>') +
      "</td><td><b>" + esc(c.name) + '</b><div class="muted" style="font-size:12px">' + esc(c.detail || "") + "</div></td><td>" +
      (c.ok ? '<span class="muted">OK</span>' : '<span style="color:#b45309;font-size:13px">' + esc(c.fix || "") + "</span>") + "</td></tr>";
  }
  W.VIEWS.system = function (el) {
    el.innerHTML = head("System check", "Settings / System check", '<button class="btn" id="sc-run">' + ic("refresh-cw") + " Run again</button>") +
      '<div class="card" id="sc-sum" style="margin-bottom:16px">Checking the server…</div><div id="sc-out"></div>';
    function run() {
      $("#sc-out").innerHTML = ""; $("#sc-sum").textContent = "Checking the server… (about 10 seconds)";
      Promise.all([api("sys_check"), bapi("status")]).then(function (r) {
        var s = r[0], b = r[1];
        if (!s.ok) { $("#sc-sum").innerHTML = '<b style="color:#dc2626">System check failed:</b> ' + esc(s.error || "no answer") + ' <button class="btn" id="sc-retry">Retry</button>'; $("#sc-retry").onclick = run; return; }
        var checks = s.checks.concat([{ group: "Sign-in", name: "Page-builder sign-in", ok: !!b.loggedIn, detail: b.loggedIn ? "signed in" : (b.why || b.error || "not signed in"), fix: "Sign out and sign in again. If it still fails, send this screen to support." }]);
        var bad = checks.filter(function (c) { return !c.ok; }).length, groups = {};
        checks.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
        $("#sc-sum").innerHTML = bad ? '<b style="color:#dc2626">' + bad + " problem" + (bad > 1 ? "s" : "") + " found.</b> Fix the red items (instructions on the right)." : '<b style="color:#16a34a">All good.</b> The server is ready.';
        $("#sc-sum").innerHTML += '<div class="muted" style="font-size:12px;margin-top:6px">Version ' + esc(s.version) + " · " + esc(s.server) + " · " + esc(s.time) + "</div>";
        $("#sc-out").innerHTML = Object.keys(groups).map(function (g) {
          return '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 8px">' + esc(g) + '</h3><table class="tbl" style="width:100%">' + groups[g].map(row).join("") + "</table></div>";
        }).join("");
      });
    }
    $("#sc-run").onclick = run; run();
  };
})();
