/* Woodex Admin — Phase 7: monthly clients report (chart + table + CSV) and client CSV import / export. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal;
  var pkr = function (n) { return "Rs " + Math.round(n || 0).toLocaleString("en-US"); };
  var mkey = function (d) { return String(d || "").slice(0, 7); };
  var mname = function (k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" }); };

  // ---------- CSV helpers (Excel-friendly: UTF-8 BOM, quoted fields)
  var csvCell = function (v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var toCsv = function (rows) { return "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n"); };
  var download = function (name, text) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  function parseCsv(t) {
    t = t.replace(/^\ufeff/, ""); var rows = [], row = [], cell = "", q = false, sep = (t.split("\n")[0].match(/;/g) || []).length > (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  var FIELDS = { name: /^(name|client|client name|full name)$/i, phone: /^(phone|mobile|whatsapp|contact|cell|number)$/i, email: /^(e-?mail)$/i, company: /^(company|business|organisation|organization)$/i, city: /^(city|town)$/i, address: /^(address|location|site)$/i, notes: /^(notes?|remarks?|comments?)$/i };
  var normPhone = function (p) { p = String(p || "").replace(/[^\d]/g, ""); return p.replace(/^0092|^92|^0/, ""); };

  // ---------- monthly report
  function report() {
    modal("<h2>Monthly report</h2><p class='muted'>Loading…</p>"); $("#modal-card").classList.add("wide");
    Promise.all([api("clients_list"), api("leads_list"), api("quotes_list"), api("invs_list")]).then(function (r) {
      var C = (r[0].clients || []), L = (r[1].leads || []), Q = (r[2].quotes || []), I = (r[3].invoices || []);
      var now = new Date(), keys = []; for (var k = 11; k >= 0; k--) { var d = new Date(now.getFullYear(), now.getMonth() - k, 1); keys.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
      var M = {}; keys.forEach(function (k) { M[k] = { enq: 0, won: 0, clients: 0, quotes: 0, qval: 0, approved: 0, aval: 0, invoiced: 0, received: 0 }; });
      var add = function (k, f, v) { if (M[k]) M[k][f] += v == null ? 1 : v; };
      L.forEach(function (l) { add(mkey(l.created_at), "enq"); if (l.stage === "won") add(mkey(l.updated_at || l.created_at), "won"); });
      C.forEach(function (c) { add(mkey(c.created_at), "clients"); });
      Q.forEach(function (q) { add(mkey(q.created_at), "quotes"); add(mkey(q.created_at), "qval", +q.total || 0); if (q.status === "approved" || q.status === "invoiced") { var ak = mkey(q.approved_at || q.updated_at || q.created_at); add(ak, "approved"); add(ak, "aval", +q.total || 0); } });
      I.forEach(function (i) { add(mkey(i.issue_date || i.created_at), "invoiced", +i.total || 0); (i.payments || []).forEach(function (p) { add(mkey(p.date), "received", +p.amount || 0); }); });
      var cols = [["enq", "Enquiries"], ["won", "Won"], ["clients", "New clients"], ["quotes", "Quotes"], ["approved", "Approved"], ["aval", "Approved value", 1], ["invoiced", "Invoiced", 1], ["received", "Received", 1]];
      var tot = {}; cols.forEach(function (c) { tot[c[0]] = keys.reduce(function (a, k) { return a + M[k][c[0]]; }, 0); });
      $("#modal-card").innerHTML = "<div style='display:flex;align-items:center;gap:10px;flex-wrap:wrap'><h2 style='margin:0;flex:1'>Monthly report <small class='muted'>last 12 months</small></h2><button class='btn' id='mr-csv'>" + ic("download") + "Export CSV</button><button class='btn' id='mr-x'>Close</button></div>" +
        "<div style='height:240px;margin:16px 0'><canvas id='mr-ch'></canvas></div>" +
        "<div class='tbl-wrap'><table class='tbl'><thead><tr><th>Month</th>" + cols.map(function (c) { return "<th class='r'>" + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
        keys.slice().reverse().map(function (k) { return "<tr><td><b>" + mname(k) + "</b></td>" + cols.map(function (c) { var v = M[k][c[0]]; return "<td class='r'>" + (c[2] ? (v ? pkr(v) : "—") : (v || "—")) + "</td>"; }).join("") + "</tr>"; }).join("") +
        "<tr style='font-weight:700;border-top:2px solid var(--line)'><td>Total</td>" + cols.map(function (c) { return "<td class='r'>" + (c[2] ? pkr(tot[c[0]]) : tot[c[0]]) + "</td>"; }).join("") + "</tr></tbody></table></div>" +
        "<p class='hint'>Conversion: " + (tot.enq ? Math.round(tot.won / tot.enq * 100) : 0) + "% of enquiries won · " + (tot.quotes ? Math.round(tot.approved / tot.quotes * 100) : 0) + "% of quotes approved.</p>";
      W.fillIcons($("#modal-card"));
      $("#mr-x").onclick = function () { $("#modal-card").classList.remove("wide"); closeModal(); };
      $("#mr-csv").onclick = function () { download("woodex-monthly-report-" + keys[11] + ".csv", toCsv([["Month"].concat(cols.map(function (c) { return c[1]; }))].concat(keys.map(function (k) { return [mname(k)].concat(cols.map(function (c) { return Math.round(M[k][c[0]]); })); })))); };
      if (window.Chart) new Chart($("#mr-ch"), { type: "bar", data: { labels: keys.map(mname), datasets: [
        { type: "bar", label: "Enquiries", data: keys.map(function (k) { return M[k].enq; }), backgroundColor: "#c9a97a", yAxisID: "y" },
        { type: "bar", label: "New clients", data: keys.map(function (k) { return M[k].clients; }), backgroundColor: "#0c1628", yAxisID: "y" },
        { type: "line", label: "Received (Rs)", data: keys.map(function (k) { return M[k].received; }), borderColor: "#16a34a", tension: .3, yAxisID: "y2" }
      ] }, options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, y2: { beginAtZero: true, position: "right", grid: { display: false } } } } });
    });
  }

  // ---------- client CSV export / import
  function exportClients() {
    api("clients_list").then(function (r) {
      var C = r.clients || []; if (!C.length) return toast("No clients to export", true);
      download("woodex-clients-" + new Date().toISOString().slice(0, 10) + ".csv", toCsv([["Name", "Phone", "Email", "Company", "City", "Address", "Notes", "Won value", "Since"]].concat(C.map(function (c) { return [c.name, c.phone, c.email, c.company, c.city, c.address, c.notes, c.value || 0, String(c.created_at || "").slice(0, 10)]; }))));
    });
  }
  function importClients(el) {
    var f = document.createElement("input"); f.type = "file"; f.accept = ".csv,text/csv";
    f.onchange = function () {
      if (!f.files[0]) return; f.files[0].text().then(function (t) {
        var rows = parseCsv(t); if (rows.length < 2) return toast("The file has no rows", true);
        var hdr = rows[0].map(function (h) { return String(h).trim(); }), map = {};
        Object.keys(FIELDS).forEach(function (k) { var i = hdr.findIndex(function (h) { return FIELDS[k].test(h); }); if (i >= 0) map[k] = i; });
        if (map.name == null) return toast("The first row must have a “Name” column (also: Phone, Email, Company, City, Address, Notes)", true);
        api("clients_list").then(function (r) {
          var have = {}; (r.clients || []).forEach(function (c) { if (c.phone) have[normPhone(c.phone)] = 1; });
          var list = rows.slice(1).map(function (r) { var o = {}; Object.keys(map).forEach(function (k) { o[k] = String(r[map[k]] || "").trim(); }); return o; }).filter(function (o) { return o.name; });
          var dup = [], fresh = []; list.forEach(function (o) { var k = o.phone ? normPhone(o.phone) : ""; if (k && have[k]) dup.push(o); else { if (k) have[k] = 1; fresh.push(o); } });
          modal("<h2>Import clients</h2><p>Found <b>" + list.length + "</b> clients in the file. <b>" + fresh.length + "</b> are new" + (dup.length ? " · " + dup.length + " have a phone number that already exists (or repeats in the file) and will be skipped" : "") + ".</p><p class='muted'>Columns found: " + Object.keys(map).join(", ") + "</p>" +
            "<div class='tbl-wrap' style='max-height:40vh;overflow:auto'><table class='tbl'><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Company</th></tr></thead><tbody>" + fresh.slice(0, 50).map(function (o) { return "<tr><td>" + esc(o.name) + "</td><td>" + esc(o.phone || "") + "</td><td>" + esc(o.city || "") + "</td><td>" + esc(o.company || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" + (fresh.length > 50 ? "<p class='hint'>…and " + (fresh.length - 50) + " more</p>" : "") +
            "<div class='modal-actions'><button class='btn' id='ci-x'>Cancel</button><button class='btn pri' id='ci-go'" + (fresh.length ? "" : " disabled") + ">Import " + fresh.length + " clients</button></div>");
          $("#ci-x").onclick = closeModal;
          $("#ci-go").onclick = function () {
            var b = this, n = 0, bad = 0; b.disabled = true;
            fresh.reduce(function (p, o) { return p.then(function () { return api("client_save", o).then(function (x) { if (x.ok) n++; else bad++; b.textContent = "Importing… " + (n + bad) + "/" + fresh.length; }); }); }, Promise.resolve())
              .then(function () { closeModal(); toast(n + " clients imported ✓" + (bad ? " · " + bad + " failed" : "")); W.VIEWS.clients(el); });
          };
        });
      });
    };
    f.click();
  }
  var base = W.VIEWS.clients;
  if (base) W.VIEWS.clients = function (el, parts) {
    base(el, parts);
    var bar = el.querySelector(".ph .toolbar"); if (!bar) return;
    bar.insertAdjacentHTML("afterbegin", "<button class='btn' id='cl-rep'>" + ic("bar-chart-3") + "Monthly report</button><button class='btn' id='cl-exp'>" + ic("download") + "Export CSV</button><button class='btn' id='cl-imp'>" + ic("upload") + "Import CSV</button>");
    W.fillIcons(bar);
    $("#cl-rep").onclick = report; $("#cl-exp").onclick = exportClients; $("#cl-imp").onclick = function () { importClients(el); };
  };
  W.monthlyReport = report;
})();
