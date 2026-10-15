/* Woodex Admin — Phase 3: Google Sheets sync + Excel downloads (Integrations cards) + Excel button in Database. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, ic = W.ic, api = W.api, toast = W.toast;
  var SVG_SH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/></svg>';
  var SVG_XL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 12l6 6M15 12l-6 6"/></svg>';
  var SCRIPT = "function doPost(e) {\n  var d = JSON.parse(e.postData.contents), ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sh = ss.getSheetByName('Woodex leads') || ss.insertSheet('Woodex leads');\n  if (sh.getLastRow() === 0) sh.appendRow(['ID', 'Date', 'Source', 'Name', 'Phone', 'Email', 'Service', 'Message', 'Page', 'Stage', 'Details']);\n  var ids = {};\n  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { ids[r[0]] = 1; });\n  var n = 0;\n  (d.rows || []).forEach(function (r) {\n    if (r.id && ids[r.id]) return;\n    sh.appendRow([r.id, r.date, r.source, r.name, r.phone ? \"'\" + r.phone : '', r.email, r.service, r.message, r.page, r.stage, r.details]); n++;\n  });\n  return ContentService.createTextOutput(JSON.stringify({ ok: true, added: n })).setMimeType(ContentService.MimeType.JSON);\n}";
  var TABLES = [["wx_leads", "Enquiries & leads"], ["wx_clients", "Clients"], ["wx_quotes", "Quotations"], ["wx_invoices", "Invoices"], ["wx_projects", "Projects"], ["wx_bookings", "Bookings"]];
  function excelFromTable(t, label, b) {
    if (!W.xlsx) return; b.disabled = true;
    api("dbx_export", { table: t, fmt: "csv" }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true);
      var rows = W.csvParse(r.content).filter(function (x) { return x.length > 1 || x[0] !== ""; }); if (rows.length < 2) return toast("Nothing to export yet in " + label);
      W.xlsx("woodex-" + t.replace("wx_", "") + "-" + new Date().toISOString().slice(0, 10), rows, label); toast("Excel file downloaded (" + (rows.length - 1) + " rows)"); });
  }
  function sheetsCard() {
    var c = document.createElement("div"); c.className = "card"; c.id = "in-sheets";
    c.innerHTML = '<div class="card-h"><h3>' + SVG_SH + ' Google Sheets</h3><span class="badge" id="sh-badge">Not connected</span></div><div class="card-b"><p class="muted">Every new website enquiry is added as a row in your own Google Sheet, for free. No Google API key needed.</p>' +
      '<label class="tog" style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="sh-on"> Send new enquiries to the sheet</label>' +
      '<label>Apps Script web app URL<input id="sh-url" placeholder="https://script.google.com/macros/s/…/exec"></label><p class="err" id="sh-err"></p>' +
      '<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn pri" id="sh-save">Save</button><button class="btn" id="sh-test">Send test row</button><button class="btn" id="sh-sync">Send all existing leads</button></div><p class="muted" id="sh-last" style="font-size:12px"></p>' +
      '<details style="margin-top:12px"><summary><b>Setup steps (5 minutes)</b></summary><ol style="padding-left:18px;line-height:1.7"><li>Open <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> and name the sheet (e.g. Woodex leads).</li><li>Menu <b>Extensions → Apps Script</b>. Delete the sample code and paste the code below. Press Save.</li><li>Press <b>Deploy → New deployment</b> → type <b>Web app</b>. Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Press Deploy and allow access.</li><li>Copy the <b>Web app URL</b> (ends with /exec), paste it above, tick the box and press <b>Save</b>.</li><li>Press <b>Send test row</b>, then <b>Send all existing leads</b> once. Duplicates are skipped automatically.</li></ol>' +
      '<textarea readonly rows="9" id="sh-code" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px">' + esc(SCRIPT) + '</textarea><button class="btn sm" id="sh-cp">Copy code</button></details></div>';
    return c;
  }
  function excelCard() {
    var c = document.createElement("div"); c.className = "card"; c.id = "in-excel";
    c.innerHTML = '<div class="card-h"><h3>' + SVG_XL + ' Excel downloads</h3><span class="badge ok">Ready</span></div><div class="card-b"><p class="muted">Download your data as real Excel files (.xlsx) with a bold header row, filters and frozen top row. Secrets are never included.</p><div class="xl-grid">' +
      TABLES.map(function (t) { return '<button class="btn" data-xl="' + t[0] + '" data-l="' + esc(t[1]) + '">' + SVG_XL + " " + esc(t[1]) + "</button>"; }).join("") + "</div></div>";
    c.onclick = function (e) { var b = e.target.closest("[data-xl]"); if (b) excelFromTable(b.getAttribute("data-xl"), b.getAttribute("data-l"), b); };
    return c;
  }
  function wire(c) {
    var $ = function (s) { return c.querySelector(s); };
    function show(cfg) { $("#sh-url").value = cfg.url || ""; $("#sh-on").checked = !!cfg.on; var b = $("#sh-badge"); b.textContent = cfg.on ? "Connected" : cfg.url ? "Paused" : "Not connected"; b.className = "badge" + (cfg.on ? " ok" : "");
      $("#sh-last").textContent = cfg.lastErr ? "Last send failed: " + cfg.lastErr : cfg.last ? "Last enquiry sent: " + cfg.last : ""; }
    api("sheets_get").then(function (r) { if (r.ok) show(r.cfg); });
    $("#sh-save").onclick = function () { var b = this; b.disabled = true; api("sheets_save", { url: $("#sh-url").value.trim(), on: $("#sh-on").checked }).then(function (r) { b.disabled = false; $("#sh-err").textContent = r.ok ? "" : r.error; if (r.ok) { show(r.cfg); toast("Google Sheets saved"); } }); };
    $("#sh-test").onclick = function () { var b = this; b.disabled = true; api("sheets_test").then(function (r) { b.disabled = false; $("#sh-err").textContent = r.ok ? "" : r.error; if (r.ok) toast("Test row added to your sheet"); }); };
    $("#sh-sync").onclick = function () { var b = this; if (!confirm("Send all existing leads to the sheet? Rows already there are skipped.")) return; b.disabled = true; api("sheets_sync").then(function (r) { b.disabled = false; $("#sh-err").textContent = r.ok ? "" : r.error; if (r.ok) toast(r.sent + " leads sent · " + r.added + " new rows"); }); };
    $("#sh-cp").onclick = function () { var t = $("#sh-code"); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand("copy"); } toast("Code copied"); };
  }
  function inject() {
    var g = document.querySelector("#view .st-grid"); if (!g || !document.getElementById("in-mail")) return;
    if (!document.getElementById("in-sheets")) { var s = sheetsCard(); g.appendChild(s); wire(s); }
    if (!document.getElementById("in-excel")) g.appendChild(excelCard());
  }
  function dbBtn() { var csv = document.getElementById("db-csv"); if (!csv || document.getElementById("db-xlsx")) return;
    var b = document.createElement("button"); b.className = csv.className; b.id = "db-xlsx"; b.type = "button"; b.innerHTML = SVG_XL + " Excel"; csv.parentNode.insertBefore(b, csv.nextSibling);
    b.onclick = function () { var h = document.getElementById("db-h"), t = h && h.getAttribute("data-t") || (h ? h.textContent.trim() : ""); if (!/^wx_/.test(t)) return toast("Pick a table first", true); excelFromTable(t, t.replace("wx_", ""), b); }; }
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200);
    var t; new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { inject(); dbBtn(); }, 60); }).observe(v0.parentNode, { childList: true, subtree: true }); }
  boot();
})();
