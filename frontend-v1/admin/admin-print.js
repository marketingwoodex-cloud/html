/* Woodex Admin v2 — Phase A5: A4 print / PDF layouts (quotation master file, invoice, payment receipt).
   Rendered into an iframe; "Save as PDF" uses the browser print dialog (exact A4, selectable text). */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return Math.round(n || 0).toLocaleString("en-US"); };
  var amt = function (n) { return n ? money(n) : "-"; };
  var qtyf = function (n) { return n ? (Math.round(n * 1000) / 1000).toLocaleString("en-US") : "-"; };
  var dlong = function (d) { if (!d) return ""; var x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
  var addDays = function (d, n) { var x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  var UNIT = { sft: "sft", rft: "rft", sqmt: "sq m", nos: "nos", each: "each", set: "set", point: "point", job: "job", lumpsum: "L/S" };

  /** Pakistani numbering words: crore / lakh / thousand */
  function words(n) {
    n = Math.round(n || 0); if (!n) return "Zero";
    var a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    var b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    var two = function (x) { return x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""); };
    var three = function (x) { return (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : "") + (x % 100 ? two(x % 100) : ""); };
    var out = [], cr = Math.floor(n / 1e7); n %= 1e7;
    if (cr) out.push((cr >= 1000 ? words(cr) : three(cr)) + " Crore");
    var lk = Math.floor(n / 1e5); n %= 1e5; if (lk) out.push(two(lk) + " Lakh");
    var th = Math.floor(n / 1e3); n %= 1e3; if (th) out.push(two(th) + " Thousand");
    if (n) out.push(three(n));
    return out.join(" ");
  }

  var CSS = function () { return '@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-400.woff2") format("woff2");font-weight:400}@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-500.woff2") format("woff2");font-weight:500}@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-600.woff2") format("woff2");font-weight:600}@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-700.woff2") format("woff2");font-weight:700}' +
    "@page{size:A4;margin:14mm 14mm 18mm}*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{margin:0;font-family:'DM Sans',Arial,sans-serif;color:#0a0f1e;font-size:10pt;line-height:1.45;background:#e9ebf0}" +
    ".sheet{background:#fff;width:210mm;min-height:297mm;margin:10mm auto;padding:14mm 14mm 20mm;box-shadow:0 6px 30px rgba(10,15,30,.15);position:relative}" +
    "@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.brk{break-before:page}.foot{position:fixed;bottom:-10mm;left:0;right:0}}" +
    ".lh{display:flex;justify-content:space-between;align-items:center;padding-bottom:5mm;border-bottom:2px solid #0a0f1e}" +
    ".brand{display:flex;align-items:center;gap:10px}.brand img{height:13mm}.brand .div{width:1px;height:11mm;background:#0a0f1e;opacity:.35}.brand b{display:block;font-size:15pt;letter-spacing:.18em;line-height:1}.brand small{display:block;font-size:6.8pt;letter-spacing:.42em;margin-top:3px;color:#475467}" +
    ".lh .ct{text-align:right;font-size:8pt;color:#475467;line-height:1.55}" +
    ".band{display:flex;justify-content:space-between;align-items:flex-end;margin:7mm 0 5mm}.band h1{margin:0;font-size:24pt;letter-spacing:.06em;font-weight:700}.band h1 span{color:#b8924c}" +
    ".meta{display:grid;grid-template-columns:auto auto;gap:1mm 6mm;font-size:9pt;text-align:right}.meta small{color:#667085;text-align:left}.meta b{font-weight:600}" +
    ".cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:6mm}.card{border:1px solid #e4e7ec;border-radius:3mm;padding:4mm 5mm}.card small{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#b8924c;font-weight:700;margin-bottom:1.5mm}.card b{font-size:11pt}.card div{color:#344054;font-size:9pt}" +
    ".intro{color:#344054;margin:0 0 5mm;font-size:9.5pt}" +
    "table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}" +
    "th{background:#0a0f1e;color:#fff;font-weight:600;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;padding:2.6mm 2.4mm;text-align:left}th.r,td.r{text-align:right}th.c,td.c{text-align:center}" +
    "td{padding:2.4mm;border-bottom:1px solid #e4e7ec;vertical-align:top;font-size:9.2pt}tbody tr:nth-child(even) td{background:#fafaf7}" +
    "td.sr{width:11mm;text-align:center;color:#667085}.sum td{font-size:10pt}.sum td.p{font-weight:600;text-transform:uppercase;letter-spacing:.03em}" +
    ".tot{margin-left:auto;width:78mm;margin-top:4mm}.tot div{display:flex;justify-content:space-between;padding:1.6mm 3mm;font-size:9.5pt}.tot .g{background:#0a0f1e;color:#fff;font-weight:700;font-size:12pt;padding:3mm;border-radius:2mm;margin-top:1mm}.tot .g span:last-child{color:#d4af6a}" +
    ".words{margin-top:3mm;font-size:9pt;color:#344054;text-align:right}.words b{color:#0a0f1e}" +
    ".sec-h{display:flex;justify-content:space-between;align-items:baseline;margin:6mm 0 3mm;padding-bottom:2mm;border-bottom:1px solid #d0d5dd}.sec-h h2{margin:0;font-size:15pt;text-transform:uppercase;letter-spacing:.04em}.sec-h h2 span{color:#b8924c;margin-right:3mm}.sec-h small{color:#667085}" +
    ".mini{display:flex;justify-content:space-between;align-items:center;font-size:8pt;color:#667085;padding-bottom:3mm;border-bottom:1px solid #e4e7ec}.mini img{height:7mm;vertical-align:middle;margin-right:6px}" +
    ".st td{border-top:2px solid #0a0f1e;font-weight:700;background:#f4efe6!important;font-size:10pt}" +
    ".note{margin-top:3mm;font-size:8.8pt;color:#475467;border-left:3px solid #d4af6a;padding:1mm 0 1mm 3mm}" +
    ".terms{margin:0;padding-left:5mm;color:#344054}.terms li{margin-bottom:1.6mm}h3{font-size:10pt;letter-spacing:.14em;text-transform:uppercase;color:#b8924c;margin:7mm 0 3mm}" +
    ".bank{display:grid;grid-template-columns:auto 1fr;gap:1mm 6mm;font-size:9.2pt}.bank small{color:#667085}" +
    ".sign{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;margin-top:16mm}.sign div{border-top:1px solid #0a0f1e;padding-top:2mm;font-size:8.5pt;font-weight:600}.sign small{display:block;font-weight:400;color:#667085}" +
    ".foot{margin-top:10mm;border-top:1px solid #e4e7ec;padding-top:2mm;font-size:7.5pt;color:#667085;display:flex;justify-content:space-between}" +
    ".stamp{display:inline-block;border:2px solid;border-radius:2mm;padding:1mm 3mm;font-weight:700;letter-spacing:.12em;font-size:9pt;text-transform:uppercase}" +
    ".paid{color:#1c7a3d}.due{color:#b42318}.part{color:#b8924c}" +
    ".rc{border:1.5px solid #0a0f1e;border-radius:3mm;padding:7mm;margin-top:6mm}.rc .big{font-size:20pt;font-weight:700}.rc dl{display:grid;grid-template-columns:40mm 1fr;gap:2mm 4mm;margin:5mm 0 0}.rc dt{color:#667085}.rc dd{margin:0;font-weight:500}"; };

  function letterhead(c) {
    return '<div class="lh"><div class="brand"><img src="/assets/img/img-f941b08b9510.png" alt=""><span class="div"></span><div><b>WOODEX</b><small>INTERIOR</small></div></div>' +
      '<div class="ct">' + esc(c.address) + "<br>" + esc(c.phones) + "<br>" + esc(c.email) + " · " + esc(c.web) + (c.ntn ? "<br>NTN " + esc(c.ntn) : "") + "</div></div>";
  }
  function foot(c, label) { return '<div class="foot"><span>' + esc(c.name) + " · " + esc(c.web) + " · " + esc(c.phones.split("·")[0]) + "</span><span>" + esc(label) + "</span></div>"; }
  function totalsBox(d, big) {
    return '<div class="tot">' + (d.discount || d.tax ? "<div><span>Subtotal</span><span>" + money(d.subtotal) + "</span></div>" : "") + (d.discount ? "<div><span>Discount</span><span>- " + money(d.discount) + "</span></div>" : "") + (d.tax ? "<div><span>Tax (" + d.taxPct + "%)</span><span>" + money(d.tax) + "</span></div>" : "") +
      '<div class="g"><span>' + (big || "TOTAL") + " (Rs)</span><span>" + money(d.total) + "</span></div></div>" + '<div class="words">Amount in words: <b>Rupees ' + words(d.total) + " Only</b></div>";
  }
  function bank(c) {
    if (!c.bankAccount && !c.bankIban) return "";
    return "<h3>Bank details</h3><div class='bank'>" + (c.bankTitle ? "<small>Account title</small><b>" + esc(c.bankTitle) + "</b>" : "") + (c.bankName ? "<small>Bank</small><span>" + esc(c.bankName) + "</span>" : "") + (c.bankAccount ? "<small>Account no.</small><span>" + esc(c.bankAccount) + "</span>" : "") + (c.bankIban ? "<small>IBAN</small><span>" + esc(c.bankIban) + "</span>" : "") + "</div>";
  }
  function terms(t) { var l = String(t || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); return l.length ? "<h3>Terms & conditions</h3><ol class='terms'>" + l.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" : ""; }
  function clientCards(cl, d, extra) {
    return '<div class="cards"><div class="card"><small>' + (extra || "Prepared for") + "</small><b>" + esc(cl.name) + "</b>" + (cl.company ? "<div>" + esc(cl.company) + "</div>" : "") + (cl.address ? "<div>" + esc(cl.address) + "</div>" : "") + "<div>" + esc([cl.phone, cl.email].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="card"><small>Project</small><b>' + esc(d.project || "—") + "</b>" + (d.site ? "<div>" + esc(d.site) + "</div>" : "") + "</div></div>";
  }
  function sectionTable(s, i) {
    return '<table><thead><tr><th class="c">Sr</th><th>Particulars</th><th class="r">Total area / qty</th><th class="c">Unit</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      s.items.map(function (it, k) { return '<tr><td class="sr">' + (k + 1) + "</td><td>" + esc(it.desc) + '</td><td class="r">' + qtyf(it.qty) + '</td><td class="c">' + (UNIT[it.unit] || esc(it.unit)) + '</td><td class="r">' + amt(it.rate) + '</td><td class="r">' + amt(it.amount) + "</td></tr>"; }).join("") +
      '<tr class="st"><td></td><td colspan="4">Total · ' + esc(s.name) + '</td><td class="r">' + amt(s.subtotal) + "</td></tr></tbody></table>" + (s.note ? '<div class="note">' + esc(s.note) + "</div>" : "");
  }
  function doc(title, body) { return "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(title) + "</title><style>" + CSS() + "</style></head><body>" + body + "</body></html>"; }

  var P = window.WXPrint = { words: words };
  // ---------------------------------------------------------------- Quotation v2 (Phase 9)
  // One flowing A4 document: the letterhead (thead) and footer repeat on every printed page, long tables flow onto
  // extra pages with their column headings repeated, and "Page X of Y" is printed in the page margin.
  // Three designs: classic (navy), minimal (white), premium (wood / cream).
  var THEMES = {
    classic: { label: "Classic", ink: "#0a0f1e", acc: "#b8924c", th: "#0a0f1e", thT: "#ffffff", zeb: "#fafaf7", soft: "#f4efe6", line: "#e4e7ec", hdr: "#ffffff" },
    minimal: { label: "Minimal", ink: "#111827", acc: "#111827", th: "#ffffff", thT: "#111827", zeb: "#ffffff", soft: "#f3f4f6", line: "#e5e7eb", hdr: "#ffffff" },
    premium: { label: "Premium", ink: "#2b2118", acc: "#b8956a", th: "#2b2118", thT: "#f4efe7", zeb: "#fbf8f3", soft: "#f4efe7", line: "#e8dfd1", hdr: "#f4efe7" }
  };
  P.THEMES = THEMES;
  var LOGO = "/assets/img/img-f941b08b9510.png";
  function qlabel(q) { return q.no + (q.version > 1 ? " · V" + q.version : "") + (q.option ? " · " + q.option : ""); }
  function css2(t, pdf) {
    return '@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-400.woff2") format("woff2");font-weight:400}@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-500.woff2") format("woff2");font-weight:500 700}' +
      ":root{--ink:" + t.ink + ";--acc:" + t.acc + ";--th:" + t.th + ";--thT:" + t.thT + ";--zeb:" + t.zeb + ";--soft:" + t.soft + ";--line:" + t.line + ";--hdr:" + t.hdr + "}" +
      '@page{size:A4;margin:10mm 12mm 14mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font:7.5pt "DM Sans",Arial,sans-serif;color:#667085}}' +
      "*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "body{margin:0;font-family:'DM Sans',Arial,sans-serif;color:var(--ink);font-size:9.6pt;line-height:1.45;background:" + (pdf ? "#fff" : "#e9ebf0") + "}" +
      ".doc{background:#fff;width:210mm;margin:" + (pdf ? "0" : "8mm auto") + ";padding:" + (pdf ? "0 12mm" : "10mm 12mm 16mm") + ";box-shadow:" + (pdf ? "none" : "0 6px 30px rgba(10,15,30,.15)") + "}" +
      "@media print{body{background:#fff}.doc{width:auto;margin:0;padding:0;box-shadow:none}.pf{position:fixed;left:0;right:0;bottom:0}.pf-sp{height:11mm}}" +
      "@media screen{.pf{margin-top:8mm}.pf-sp{display:none}}" +
      "table.pg{width:100%;border-collapse:collapse}table.pg>thead>tr>td,table.pg>tfoot>tr>td,table.pg>tbody>tr>td{padding:0;border:0;background:none!important}" +
      ".lh{display:flex;justify-content:space-between;align-items:center;padding:4mm " + (t.hdr !== "#ffffff" ? "4mm" : "0") + ";margin-bottom:5mm;background:var(--hdr);border-bottom:2px solid var(--ink)}" +
      ".brand{display:flex;align-items:center;gap:9px}.brand img{height:11mm}.brand .dv{width:1px;height:9mm;background:var(--ink);opacity:.35}.brand b{display:block;font-size:13pt;letter-spacing:.18em;line-height:1}.brand small{display:block;font-size:6.5pt;letter-spacing:.42em;margin-top:2px}" +
      ".lh .ct{text-align:right;font-size:7.5pt;color:#475467;line-height:1.5}.lh .ct b{color:var(--ink);font-size:8.5pt}" +
      ".pf{border-top:1px solid var(--line);padding-top:2mm;font-size:7.2pt;color:#667085;display:flex;justify-content:space-between;gap:6mm;background:#fff}" +
      ".band{display:flex;justify-content:space-between;align-items:flex-end;margin:2mm 0 5mm}.band h1{margin:0;font-size:24pt;letter-spacing:.06em;font-weight:700}.band h1 span{color:var(--acc)}" +
      ".meta{display:grid;grid-template-columns:auto auto;gap:1mm 6mm;font-size:9pt;text-align:right}.meta small{color:#667085;text-align:left}.meta b{font-weight:600}" +
      ".cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:6mm}.card{border:1px solid var(--line);border-radius:3mm;padding:4mm 5mm;background:" + (t.hdr !== "#ffffff" ? "var(--soft)" : "#fff") + "}.card small{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);font-weight:600;margin-bottom:1mm}.card b{font-size:11pt}" +
      ".intro{color:#344054;margin:0 0 5mm;font-size:9.4pt}" +
      "table.t{width:100%;border-collapse:collapse}table.t thead{display:table-header-group}table.t tr{break-inside:avoid;page-break-inside:avoid}" +
      "table.t th{background:var(--th);color:var(--thT);font-weight:600;font-size:7.8pt;letter-spacing:.06em;text-transform:uppercase;padding:2.4mm;text-align:left;" + (t.th === "#ffffff" ? "border-top:1.5px solid var(--ink);border-bottom:1.5px solid var(--ink)" : "") + "}" +
      "th.r,td.r{text-align:right}th.c,td.c{text-align:center}" +
      "table.t td{padding:2.2mm 2.4mm;border-bottom:1px solid var(--line);vertical-align:top;font-size:9pt}table.t tbody tr:nth-child(even) td{background:var(--zeb)}" +
      "td.sr{width:10mm;text-align:center;color:#667085}.sum td{font-size:9.8pt}.sum td.p{font-weight:600;text-transform:uppercase;letter-spacing:.03em}" +
      ".st td{border-top:2px solid var(--ink);font-weight:700;background:var(--soft)!important;font-size:9.8pt}" +
      ".tot{margin-left:auto;width:80mm;margin-top:4mm;break-inside:avoid}.tot div{display:flex;justify-content:space-between;padding:1.5mm 3mm;font-size:9.4pt}.tot .g{background:var(--th);color:var(--thT);font-weight:700;font-size:12pt;padding:3mm;border-radius:2mm;margin-top:1mm;" + (t.th === "#ffffff" ? "border:1.5px solid var(--ink)" : "") + "}.tot .g span:last-child{color:" + (t.th === "#ffffff" ? "var(--ink)" : "#d4af6a") + "}" +
      ".words{margin-top:3mm;font-size:8.8pt;color:#344054;text-align:right}.words b{color:var(--ink)}" +
      ".sec{margin-top:8mm}.sec-h{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 3mm;padding-bottom:2mm;border-bottom:1px solid var(--line);break-after:avoid;page-break-after:avoid}.sec-h h2{margin:0;font-size:13.5pt;text-transform:uppercase;letter-spacing:.04em}.sec-h h2 span{color:var(--acc);margin-right:3mm}.sec-h small{color:#667085}" +
      ".brk{break-before:page;page-break-before:always}" +
      ".note{margin-top:3mm;font-size:8.6pt;color:#475467;border-left:3px solid var(--acc);padding:1mm 0 1mm 3mm}" +
      ".terms{margin:0;padding-left:5mm;color:#344054}.terms li{margin-bottom:1.5mm;break-inside:avoid}h3{font-size:9.6pt;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);margin:7mm 0 3mm;break-after:avoid}" +
      ".bank{display:grid;grid-template-columns:auto 1fr;gap:1mm 6mm;font-size:9pt}.bank small{color:#667085}" +
      ".sign{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;margin-top:16mm;break-inside:avoid}.sign div{border-top:1px solid var(--ink);padding-top:2mm;font-size:8.4pt;font-weight:600}.sign small{display:block;font-weight:400;color:#667085}" +
      ".keep{break-inside:avoid}" + (pdf ? ".lh,.pf{display:none!important}" : "");
  }
  function lh2(c, q, label) {
    return '<div class="lh"><div class="brand"><img src="' + LOGO + '" alt=""><span class="dv"></span><div><b>WOODEX</b><small>INTERIOR</small></div></div>' +
      '<div class="ct"><b>Quotation ' + esc(label) + "</b> · " + esc(q.client.name) + "<br>" + esc(c.address) + "<br>" + esc(c.phones) + " · " + esc(c.email) + " · " + esc(c.web) + (c.ntn ? " · NTN " + esc(c.ntn) : "") + "</div></div>";
  }
  function sec2(s, i) {
    return '<div class="sec"><div class="sec-h"><h2><span>' + String(i + 1).padStart(2, "0") + "</span>" + esc(s.name) + "</h2><small>" + s.items.length + " item" + (s.items.length === 1 ? "" : "s") + "</small></div>" +
      '<table class="t"><thead><tr><th class="c">Sr</th><th>Particulars</th><th class="r">Qty / area</th><th class="c">Unit</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      s.items.map(function (it, k) { return '<tr><td class="sr">' + (k + 1) + "</td><td>" + esc(it.desc) + '</td><td class="r">' + qtyf(it.qty) + '</td><td class="c">' + (UNIT[it.unit] || esc(it.unit)) + '</td><td class="r">' + amt(it.rate) + '</td><td class="r">' + amt(it.amount) + "</td></tr>"; }).join("") +
      '<tr class="st"><td></td><td colspan="4">Total · ' + esc(s.name) + '</td><td class="r">' + amt(s.subtotal) + "</td></tr></tbody></table>" + (s.note ? '<div class="note">' + esc(s.note) + "</div>" : "") + "</div>";
  }
  function tot2(d) {
    return '<div class="tot">' + (d.discount || d.tax ? "<div><span>Subtotal</span><span>" + money(d.subtotal) + "</span></div>" : "") + (d.discount ? "<div><span>Discount</span><span>- " + money(d.discount) + "</span></div>" : "") + (d.tax ? "<div><span>Tax (" + d.taxPct + "%)</span><span>" + money(d.tax) + "</span></div>" : "") +
      '<div class="g"><span>TOTAL (Rs)</span><span>' + money(d.total) + '</span></div></div><div class="words">Amount in words: <b>Rupees ' + words(d.total) + " Only</b></div>";
  }
  /** opts: {pdf:true} renders without letterhead/footer (the PDF maker stamps them on every page). */
  P.quote = function (q, c, opts) {
    opts = opts || {}; var t = THEMES[q.design] || THEMES.classic, label = qlabel(q), valid = addDays(q.date, q.valid_days || c.validDays || 15);
    var secs = q.sections.filter(function (s) { return s.items.length; });
    var body = '<div class="band"><h1>QUOTATION<span>.</span></h1><div class="meta"><small>No.</small><b>' + esc(label) + "</b><small>Date</small><b>" + dlong(q.date) + "</b><small>Valid until</small><b>" + dlong(valid) + "</b></div></div>" +
      clientCardsV2(q) + (q.intro ? '<p class="intro">' + esc(q.intro) + "</p>" : "") +
      "<h3 style='margin-top:2mm'>Summary</h3>" +
      '<table class="t sum"><thead><tr><th class="c">Sr</th><th>Particulars</th><th class="r">Items</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      q.sections.map(function (s, i) { return '<tr><td class="sr">' + (i + 1) + '</td><td class="p">' + esc(s.name) + '</td><td class="r">' + (s.items.length || "-") + '</td><td class="r">' + amt(s.subtotal) + "</td></tr>"; }).join("") + "</tbody></table>" + tot2(q) +
      (secs.length ? '<div class="brk"></div><h3 style="margin-top:0">Detailed bill of quantities</h3>' + secs.map(function (s) { return sec2(s, q.sections.indexOf(s)); }).join("") : "") +
      '<div class="keep">' + terms(q.terms) + "</div>" + bank(c) +
      '<div class="keep"><h3>Acceptance</h3><p class="intro">I accept this quotation (' + esc(label) + ", Rs " + money(q.total) + ') and the terms above.</p><div class="sign"><div>Client signature<small>' + esc(q.client.name) + "</small></div><div>Date<small>&nbsp;</small></div><div>For " + esc(c.name) + "<small>" + esc(c.consultant || "") + "</small></div></div></div>";
    var foot = '<div class="pf"><span>' + esc(c.name) + " · " + esc(c.web) + " · " + esc(String(c.phones).split("·")[0]) + "</span><span>" + esc(label) + (c.bankIban ? " · IBAN " + esc(c.bankIban) : "") + "</span></div>";
    var html = '<div class="doc"><table class="pg"><thead><tr><td>' + lh2(c, q, label) + '</td></tr></thead><tfoot><tr><td><div class="pf-sp"></div></td></tr></tfoot><tbody><tr><td>' + body + "</td></tr></tbody></table>" + foot + "</div>";
    return "<!doctype html><html><head><meta charset='utf-8'><title>" + esc("Quotation " + label + " - " + q.client.name) + "</title><style>" + css2(t, !!opts.pdf) + "</style></head><body>" + html + "</body></html>";
  };
  function clientCardsV2(q) {
    var cl = q.client;
    return '<div class="cards"><div class="card"><small>Prepared for</small><b>' + esc(cl.name) + "</b>" + (cl.company ? "<div>" + esc(cl.company) + "</div>" : "") + (cl.address ? "<div>" + esc(cl.address) + "</div>" : "") + "<div>" + esc([cl.phone, cl.email].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="card"><small>Project</small><b>' + esc(q.project || "—") + "</b>" + (q.site ? "<div>" + esc(q.site) + "</div>" : "") + "</div></div>";
  }
  P.label = qlabel;

  /** Real PDF file (for email attachments / download). Renders in a hidden iframe with html2pdf, then stamps the
   *  letterhead and footer ("Page X of Y") on every page. Resolves {blob, base64, name}. */
  P.quotePdf = function (q, c) {
    var t = THEMES[q.design] || THEMES.classic, label = qlabel(q), name = ("Quotation " + label.replace(/ · /g, " ") + " " + q.client.name).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".pdf";
    return new Promise(function (resolve, reject) {
      var f = document.createElement("iframe"); f.setAttribute("aria-hidden", "true");
      f.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden";
      document.body.appendChild(f);
      var done = function (e, r) { setTimeout(function () { f.remove(); }, 50); e ? reject(e) : resolve(r); };
      f.onload = function () {
        var w = f.contentWindow, d = w.document, sc = d.createElement("script"); sc.src = "/admin/vendor/html2pdf.bundle.min.js";
        sc.onerror = function () { done(new Error("Could not load the PDF maker")); };
        sc.onload = function () {
          var logo = new Image(); logo.crossOrigin = "anonymous";
          var go = function () {
            var hex = function (h) { h = h.replace("#", ""); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
            w.html2pdf().set(w.JSON.parse(JSON.stringify({ margin: [30, 0, 16, 0], filename: name, image: { type: "jpeg", quality: 0.93 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".keep", ".tot", ".sec-h"] } }))) // options built in the iframe realm (html2pdf checks instanceof Array)
              .from(d.querySelector(".doc")).toPdf().get("pdf").then(function (pdf) {
                var n = pdf.internal.getNumberOfPages(), W = 210, ink = hex(t.ink), acc = hex(t.acc);
                for (var i = 1; i <= n; i++) {
                  pdf.setPage(i);
                  if (t.hdr !== "#ffffff") { pdf.setFillColor.apply(pdf, hex(t.hdr)); pdf.rect(0, 0, W, 25, "F"); }
                  if (logo.complete && logo.naturalWidth) try { pdf.addImage(logo, "PNG", 12, 8, 11 * logo.naturalWidth / logo.naturalHeight, 11); } catch (e) {}
                  pdf.setTextColor.apply(pdf, ink); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text("WOODEX", 30, 13.5, { charSpace: 1.2 });
                  pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.text("INTERIOR", 30, 17.5, { charSpace: 2 });
                  pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.text("Quotation " + label.replace(/·/g, "-") + "  |  " + q.client.name, W - 12, 10, { align: "right" });
                  pdf.setFont("helvetica", "normal"); pdf.setTextColor(71, 84, 103);
                  pdf.text(String(c.address || ""), W - 12, 14, { align: "right" }); pdf.text([c.phones, c.email, c.web].filter(Boolean).join("  |  ").replace(/·/g, "-"), W - 12, 18, { align: "right" });
                  pdf.setDrawColor.apply(pdf, ink); pdf.setLineWidth(0.6); pdf.line(12, 25, W - 12, 25);
                  pdf.setDrawColor(228, 231, 236); pdf.setLineWidth(0.3); pdf.line(12, 284, W - 12, 284);
                  pdf.setFontSize(7); pdf.setTextColor(102, 112, 133);
                  pdf.text((c.name + "  |  " + c.web + "  |  " + String(c.phones).split("·")[0].trim()), 12, 288.5);
                  pdf.setTextColor.apply(pdf, acc); pdf.text("Page " + i + " of " + n, W - 12, 288.5, { align: "right" });
                }
                var blob = pdf.output("blob"), fr = new FileReader();
                fr.onload = function () { done(null, { blob: blob, base64: String(fr.result).split(",")[1], name: name, pages: n }); };
                fr.readAsDataURL(blob);
              }).catch(done);
          };
          logo.onload = go; logo.onerror = go; logo.src = LOGO;
        };
        d.head.appendChild(sc);
      };
      f.srcdoc = P.quote(q, c, { pdf: true });
    });
  };
  P.download = function (blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  P.invoice = function (inv, c) {
    var st = inv.payStatus === "paid" ? '<span class="stamp paid">Paid</span>' : inv.payStatus === "partial" ? '<span class="stamp part">Part paid</span>' : '<span class="stamp due">Unpaid</span>';
    var body = '<div class="sheet">' + letterhead(c) +
      '<div class="band"><h1>INVOICE<span>.</span></h1><div class="meta"><small>No.</small><b>' + esc(inv.no) + "</b><small>Issue date</small><b>" + dlong(inv.issue_date) + "</b>" + (inv.due_date ? "<small>Due date</small><b>" + dlong(inv.due_date) + "</b>" : "") + "<small>Quotation</small><b>" + esc(inv.quote_label || inv.no) + "</b></div></div>" +
      clientCards(inv.client, inv, "Bill to") +
      '<table class="sum"><thead><tr><th class="c">Sr. No</th><th>Particulars</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      inv.sections.map(function (s, i) { return '<tr><td class="sr">' + (i + 1) + '</td><td class="p">' + esc(s.name) + '</td><td class="r">' + amt(s.subtotal) + "</td></tr>"; }).join("") + "</tbody></table>" + totalsBox(inv, "INVOICE TOTAL") +
      "<h3>Payments " + st + "</h3>" + (inv.payments.length ? '<table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' + inv.payments.map(function (p) { return "<tr><td>" + esc(p.rcpt) + "</td><td>" + dlong(p.date) + "</td><td style='text-transform:capitalize'>" + esc(p.method) + "</td><td>" + esc(p.ref || "-") + '</td><td class="r">' + money(p.amount) + "</td></tr>"; }).join("") + "</tbody></table>" : "<p class='intro'>No payments received yet.</p>") +
      '<div class="tot"><div><span>Received</span><span>' + money(inv.paid) + '</span></div><div class="g"><span>BALANCE DUE (Rs)</span><span>' + money(inv.balance) + "</span></div></div>" +
      (inv.schedule ? "<h3>Payment schedule</h3><p class='intro'>" + esc(inv.schedule) + "</p>" : "") + bank(c) + terms(inv.terms) + (inv.notes ? "<h3>Notes</h3><p class='intro'>" + esc(inv.notes) + "</p>" : "") +
      '<div class="sign"><div>Prepared by<small>' + esc(c.name) + '</small></div><div>&nbsp;<small></small></div><div>Received by<small>' + esc(inv.client.name) + "</small></div></div>" + foot(c, "Invoice " + inv.no) + "</div>";
    return doc("Invoice " + inv.no + " - " + inv.client.name, body);
  };
  P.receipt = function (inv, p, c) {
    var before = inv.payments.slice(0, inv.payments.indexOf(p) + 1).reduce(function (a, x) { return a + x.amount; }, 0);
    var body = '<div class="sheet">' + letterhead(c) + '<div class="band"><h1>RECEIPT<span>.</span></h1><div class="meta"><small>Receipt no.</small><b>' + esc(p.rcpt) + "</b><small>Date</small><b>" + dlong(p.date) + "</b></div></div>" +
      '<div class="rc"><small style="color:#667085">Amount received</small><div class="big">Rs ' + money(p.amount) + '</div><div class="words" style="text-align:left">Rupees ' + words(p.amount) + " Only</div><dl>" +
      "<dt>Received from</dt><dd>" + esc(inv.client.name) + "</dd><dt>Against invoice</dt><dd>" + esc(inv.no) + (inv.project ? " · " + esc(inv.project) : "") + "</dd><dt>Payment method</dt><dd style='text-transform:capitalize'>" + esc(p.method) + (p.ref ? " · " + esc(p.ref) : "") + "</dd>" +
      "<dt>Invoice total</dt><dd>Rs " + money(inv.total) + "</dd><dt>Total received</dt><dd>Rs " + money(before) + "</dd><dt>Balance</dt><dd><b>Rs " + money(Math.max(0, inv.total - before)) + "</b></dd>" + (p.note ? "<dt>Note</dt><dd>" + esc(p.note) + "</dd>" : "") + "</dl></div>" +
      '<div class="sign"><div>Received by<small>' + esc(c.name) + "</small></div><div>&nbsp;</div><div>Paid by<small>" + esc(inv.client.name) + "</small></div></div>" + foot(c, "Receipt " + p.rcpt) + "</div>";
    return doc("Receipt " + p.rcpt, body);
  };
  /** Full-screen preview with Print / Save as PDF */
  P.preview = function (html, title) {
    var ov = document.createElement("div"); ov.className = "pv";
    ov.innerHTML = '<div class="pv-bar"><b>' + esc(title) + '</b><span class="muted">Use “Save as PDF” in the print dialog. Paper: A4.</span><button class="btn" data-x>Close</button><button class="btn pri" data-p>Print / Save PDF</button></div><iframe title="Preview"></iframe>';
    document.body.appendChild(ov); var f = ov.querySelector("iframe"); f.srcdoc = html;
    ov.querySelector("[data-x]").onclick = function () { ov.remove(); };
    ov.querySelector("[data-p]").onclick = function () { f.contentWindow.focus(); f.contentWindow.print(); };
    var k = function (e) { if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", k); } }; document.addEventListener("keydown", k);
    return f;
  };
})();
