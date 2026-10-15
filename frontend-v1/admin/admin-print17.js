/* Woodex Admin — P17 S4: quotation & invoice print layouts (single file).
   Layouts: "single" (one-page style quotation) and "project" (summary page + one page per trade, Interior Arch style).
   New header (logo left · number & contacts right), Prepared-for / Project boxes, grey section rows, numbered items,
   heading + spec rows, lakh-style amount in words, terms, bank, signature block, footer "Phone | Address | Website · Thank you".
   Wraps WXPrint: q.layout "classic" (or empty) still uses the original A5 layout. Invoices use the new design. */
(function () {
  "use strict";
  var P = window.WXPrint; if (!P) return;
  var OLDQ = P.quote, OLDI = P.invoice; P.invoiceClassic = OLDI; P.quoteClassic = OLDQ;
  var LOGO = "/assets/img/img-f941b08b9510.png";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return Math.round(n || 0).toLocaleString("en-US"); };
  var amt = function (n) { return n ? money(n) : "–"; };
  var qtyf = function (n) { return n ? (Math.round(n * 1000) / 1000).toLocaleString("en-US") : "–"; };
  var dlong = function (d) { if (!d) return ""; var x = new Date(String(d).slice(0, 10) + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
  var addDays = function (d, n) { var x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  var UNIT = { sft: "sft", rft: "rft", sqmt: "sq m", nos: "nos", each: "each", set: "set", point: "point", job: "job", lumpsum: "L/S" };
  var QT = { fitout: "Fit-out", renovation: "Renovation", interior: "Interior design", proposal: "Proposal", furniture: "Furniture supply" };
  var two = function (n) { return String(n).padStart(2, "0"); };
  var lines = function (t) { return String(t || "").split("\n").map(function (x) { return x.replace(/^\s*(?:[-•*]|\d{1,2}[.)])\s+/, "").trim(); }).filter(Boolean); };

  /** Auto numbering: headings → 5.1, 5.2; items under a heading → 5.1.1; items before any heading → 5.1, 5.2 */
  function numbered(s, si) {
    var h = 0, k = 0, out = [];
    s.items.forEach(function (it) {
      var code = it.code;
      if (it.kind === "head") { h++; k = 0; code = code || (si + 1) + "." + h; }
      else if (it.kind === "spec") code = "";
      else { k++; code = code || (h ? (si + 1) + "." + h + "." + k : (si + 1) + "." + k); }
      out.push({ it: it, code: code });
    });
    return out;
  }
  /*P36 designs: Classic (navy + gold), Minimal (black on white), Premium (espresso + cream)*/
  var DZ = "classic";
  var DESIGNS = {
    classic: { ink: "#0c1628", gold: "#b8956a", g2: "#8a6a40", line: "#e3e1dc", soft: "#f4efe7", sec: "#eceae5", thbg: "#0c1628", tht: "#ffffff", thb: "#0c1628", totbg: "#0c1628", tott: "#ffffff", tota: "#e6cfa5", box: "#fcfbf9", hdr: "#ffffff", bar: [11, 15, 23], bar2: [43, 47, 55], acc: [184, 149, 106] },
    minimal: { ink: "#111111", gold: "#111111", g2: "#4b5563", line: "#e5e7eb", soft: "#f9fafb", sec: "#f3f4f6", thbg: "#ffffff", tht: "#111111", thb: "#111111", totbg: "#111111", tott: "#ffffff", tota: "#ffffff", box: "#ffffff", hdr: "#ffffff", bar: [17, 17, 17], bar2: [17, 17, 17], acc: [17, 17, 17] },
    premium: { ink: "#2b2118", gold: "#b8956a", g2: "#8a6a40", line: "#e8dfd1", soft: "#f4efe7", sec: "#efe6d8", thbg: "#2b2118", tht: "#f4efe7", thb: "#2b2118", totbg: "#2b2118", tott: "#f4efe7", tota: "#e6cfa5", box: "#fbf8f3", hdr: "#f7f1e8", bar: [43, 33, 24], bar2: [74, 58, 43], acc: [184, 149, 106] }
  };
  P.DESIGNS = DESIGNS;
  function dz() { return DESIGNS[DZ] || DESIGNS.classic; }
  function css(pdf) {
    var t = dz();
    return '@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-400.woff2") format("woff2");font-weight:400}@font-face{font-family:"DM Sans";src:url("/assets/fonts/dm-sans-500.woff2") format("woff2");font-weight:500 700}' +
      ":root{--ink:" + t.ink + ";--gold:" + t.gold + ";--g2:" + t.g2 + ";--line:" + t.line + ";--soft:" + t.soft + ";--sec:" + t.sec + ";--mut:#6b7280;--thbg:" + t.thbg + ";--tht:" + t.tht + ";--thb:" + t.thb + ";--totbg:" + t.totbg + ";--tott:" + t.tott + ";--tota:" + t.tota + ";--box:" + t.box + ";--hdr:" + t.hdr + "}" +
      '@page{size:A4;margin:0}' + /*P18page*/
      "*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "body{margin:0;font-family:'DM Sans',Arial,sans-serif;color:var(--ink);font-size:9.4pt;line-height:1.45;background:" + (pdf ? "#fff" : "#e7e5e0") + "}" +
      ".doc{background:#fff;width:210mm;margin:" + (pdf ? "0" : "8mm auto") + ";padding:" + (pdf ? "0 12mm" : "11mm 12mm 14mm") + ";box-shadow:" + (pdf ? "none" : "0 8px 34px rgba(12,22,40,.16)") + "}" +
      "@media print{body{background:#fff}.doc{width:auto;margin:0;padding:0 12mm;box-shadow:none}.xf{position:fixed;left:0;right:0;bottom:0}.xf-sp{height:21mm}.xh-sp{height:11mm}}@media screen{.xf{margin:10mm -12mm -14mm}.xf-sp,.xh-sp{display:none}}body.dl{background:#fff}.dl .doc{margin:0;box-shadow:none;padding:0 12mm}.dl .xf,.dl .xf-sp,.dl .xh-sp{display:none!important}" +
      "table.pg{width:100%;border-collapse:collapse}table.pg>thead>tr>td,table.pg>tfoot>tr>td,table.pg>tbody>tr>td{padding:0;border:0}" +
      ".xh{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-bottom:4mm;background:var(--hdr);margin-bottom:5mm;border-bottom:1.5px solid var(--ink);position:relative}.xh:after{content:'';position:absolute;left:0;bottom:-4px;width:34mm;height:2.5px;background:var(--gold)}" +
      ".xb{display:flex;align-items:center;gap:3.2mm}.xb img{height:13mm}.xb b{display:block;font-size:15pt;letter-spacing:.2em;line-height:1}.xb small{display:block;font-size:6.6pt;letter-spacing:.42em;color:var(--g2);margin-top:1.4mm}.xb em{display:block;font-style:normal;font-size:7pt;color:var(--mut);margin-top:1.2mm;letter-spacing:.02em}" +
      ".xr{text-align:right}.xr h1{margin:0;font-size:21pt;letter-spacing:.14em;font-weight:700;line-height:1}.xr h1 span{color:var(--gold)}" +
      ".xm{display:inline-grid;grid-template-columns:auto auto;gap:.6mm 4mm;margin-top:2.4mm;font-size:8.6pt;text-align:right}.xm small{color:var(--mut);text-align:left}.xm b{font-weight:600}" +
      ".xc{font-size:7.4pt;color:var(--mut);margin-top:2mm;line-height:1.5}" +
      ".chips{display:flex;gap:2mm;justify-content:flex-end;margin-top:2mm}.chip{font-size:7pt;font-weight:700;letter-spacing:.12em;border:1px solid var(--gold);color:var(--g2);border-radius:1.4mm;padding:.6mm 2.2mm;text-transform:uppercase}" +
      ".boxes{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:5mm}.box{border:1px solid var(--line);border-radius:2.4mm;padding:3.4mm 4mm;background:var(--box)}.box small{display:block;font-size:6.8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--g2);font-weight:700;margin-bottom:1.2mm}.box b{font-size:10.5pt}.box div{font-size:8.6pt;color:#374151}" +
      ".box dl{display:grid;grid-template-columns:auto 1fr;gap:.5mm 3mm;margin:0;font-size:8.6pt}.box dt{color:var(--mut)}.box dd{margin:0;font-weight:500}" +
      ".intro{color:#374151;margin:0 0 4mm;font-size:9pt}" +
      "table.t{width:100%;border-collapse:collapse}table.t thead{display:table-header-group}table.t tr{break-inside:avoid;page-break-inside:avoid}" +
      "table.t th{background:var(--thbg);color:var(--tht);border-bottom:1.5px solid var(--thb);font-weight:600;font-size:7.4pt;letter-spacing:.08em;text-transform:uppercase;padding:2.3mm 2.2mm;text-align:left}table.t th:first-child{border-radius:1.6mm 0 0 0}table.t th:last-child{border-radius:0 1.6mm 0 0}" +
      "th.r,td.r{text-align:right}th.c,td.c{text-align:center}table.t td{padding:2mm 2.2mm;border-bottom:1px solid var(--line);vertical-align:top;font-size:8.8pt}" +
      "td.sr{width:13mm;color:var(--mut);font-variant-numeric:tabular-nums}td.n{white-space:nowrap;font-variant-numeric:tabular-nums}" +
      "tr.sec td{background:var(--sec);font-weight:700;font-size:8.8pt;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #d6d3cc}tr.sec td.sr{color:var(--g2);font-weight:700}" +
      "tr.hd td{font-weight:700;background:#faf8f4}tr.sp td{color:#4b5563;font-size:8.2pt;font-style:italic;padding-top:.6mm;border-bottom-style:dashed}tr.sp td.d{white-space:pre-wrap}" +
      "tr.ss td{font-weight:700;background:#fff;border-bottom:1.5px solid var(--ink)}" +
      ".foot2{display:grid;grid-template-columns:1fr 78mm;gap:6mm;margin-top:4mm;break-inside:avoid}.words{border:1px dashed var(--gold);border-radius:2mm;padding:3mm 3.5mm;font-size:8.6pt;align-self:start;background:#fffdf9}.words small{display:block;font-size:6.8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--g2);font-weight:700}" +
      ".tot div{display:flex;justify-content:space-between;padding:1.3mm 3mm;font-size:9pt;border-bottom:1px solid var(--line)}.tot .g{background:var(--totbg);color:var(--tott);font-weight:700;font-size:11.5pt;padding:2.8mm 3mm;border-radius:1.6mm;border:0;margin-top:1.4mm}.tot .g span:last-child{color:var(--tota)}" +
      "h3{font-size:8.6pt;letter-spacing:.16em;text-transform:uppercase;color:var(--g2);margin:6mm 0 2.4mm;break-after:avoid}" +
      ".terms{margin:0;padding-left:4.5mm;color:#374151;font-size:8.6pt}.terms li{margin-bottom:1.1mm;break-inside:avoid}" +
      ".scope{columns:2;column-gap:8mm;margin:0;padding-left:4.5mm;font-size:8.8pt}.scope li{margin-bottom:1.2mm;break-inside:avoid}" +
      ".banks{display:grid;grid-template-columns:repeat(auto-fit,minmax(60mm,1fr));gap:3mm}.bank1{display:grid;grid-template-columns:auto 1fr;gap:.6mm 3mm;font-size:8.4pt;border:1px solid var(--line);border-radius:2mm;padding:3mm 4mm;align-content:start}.bank1 .bn{grid-column:1/-1;font-size:9pt;margin-bottom:.8mm}.bank1 small{color:var(--mut)}.bank1 span{font-weight:600;word-break:break-all}" + ".bank{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:.8mm 4mm;font-size:8.6pt;border:1px solid var(--line);border-radius:2mm;padding:3mm 4mm}.bank small{color:var(--mut)}" +
      ".sign{display:grid;grid-template-columns:1fr 1fr;gap:16mm;margin-top:14mm;break-inside:avoid}.sign div{border-top:1px solid var(--ink);padding-top:1.8mm;font-size:8.4pt;font-weight:700}.sign small{display:block;font-weight:400;color:var(--mut);font-size:7.6pt}" +
      ".sign.three{grid-template-columns:repeat(3,1fr);gap:10mm}" +
      ".xf{background:#fff}.xf-t{display:flex;justify-content:space-between;align-items:center;gap:6mm;padding:2.6mm 10mm 2.4mm;font-size:7.8pt;font-weight:700;letter-spacing:.02em;color:#000;border-top:1px solid var(--line)}.xf-t i{font-style:normal;color:#111;margin:0 1.1mm;font-weight:700}.xf-t .xf-i{font-style:normal;display:inline-flex;align-items:center;gap:.9mm;white-space:nowrap}.xf-t .xf-i svg{width:3mm;height:3mm;fill:#000;flex:none}.xf-t span{display:flex;flex-wrap:nowrap;align-items:center;font-size:6.1pt;letter-spacing:0;min-width:0;overflow:hidden}.xf-t>b{font-size:6.6pt;letter-spacing:.03em}.xf-t b{font-weight:700;letter-spacing:.06em;white-space:nowrap;flex:none}.xf-t span{min-width:0}.xf-bar{position:relative;height:6mm;background:var(--totbg)}.xf-bar:before{content:'';position:absolute;right:0;top:0;bottom:0;width:72mm;background:var(--ink);opacity:.85;clip-path:polygon(7mm 0,100% 0,100% 100%,0 100%)}.xf-bar:after{content:'';position:absolute;right:0;top:0;width:65mm;height:.7mm;background:var(--gold)}/*P18foot*/" +
      ".brk{break-before:page;page-break-before:always}.keep{break-inside:avoid}" +
      ".trade{display:flex;justify-content:space-between;align-items:flex-end;margin:0 0 3mm;padding-bottom:2mm;border-bottom:1px solid var(--line)}.trade h2{margin:0;font-size:14pt;text-transform:uppercase;letter-spacing:.04em}.trade h2 span{color:var(--gold);margin-right:2.5mm}.trade .kv{font-size:8pt;color:var(--mut);text-align:right}.trade .kv b{color:var(--ink)}" +
      ".note{margin-top:2.4mm;font-size:8.2pt;color:#4b5563;border-left:2.5px solid var(--gold);padding:.6mm 0 .6mm 3mm}" +
      ".stamp{display:inline-block;border:2px solid;border-radius:1.6mm;padding:.8mm 3mm;font-weight:700;letter-spacing:.14em;font-size:8.6pt;text-transform:uppercase;transform:rotate(-4deg)}.paid{color:#15803d}.due{color:#b42318}.part{color:#a16207}" +
      (pdf ? ".xh,.xf{display:none!important}.xh-pdf{display:flex!important}" : ".xh-pdf{display:none}");
  }
  function header(c, title, meta, chips) {
    return '<div class="xh"><div class="xb"><img src="' + LOGO + '" alt=""><div><b>WOODEX</b><small>INTERIOR</small><em>' + esc(c.tagline || "Design · Build · Furniture") + "</em></div></div>" +
      '<div class="xr"><h1>' + title + '<span>.</span></h1><div class="xm">' + meta.map(function (m) { return "<small>" + m[0] + "</small><b>" + esc(m[1]) + "</b>"; }).join("") + "</div>" +
      (chips && chips.length ? '<div class="chips">' + chips.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="xc">' + esc(c.address) + "<br>" + esc(c.phones) + " · " + esc(c.email) + (c.ntn ? " · NTN " + esc(c.ntn) : "") + "</div></div></div>";
  }
  // PDF mode: the PDF maker stamps a compact letterhead on every page, so the first page shows the title band only
  function pdfBand(title, meta) { return '<div class="xh-pdf" style="justify-content:space-between;align-items:flex-end;margin:0 0 5mm"><h1 style="margin:0;font-size:20pt;letter-spacing:.14em">' + title + '<span style="color:' + dz().gold + '">.</span></h1><div class="xm">' + meta.map(function (m) { return "<small>" + m[0] + "</small><b>" + esc(m[1]) + "</b>"; }).join("") + "</div></div>"; }
  function footer(c, label) { /*P36 footer: bold, black icons; contacts left, thank-you right*/
    var ph = String(c.phones || "").split("·")[0].trim();
    var IC = { p: "<svg viewBox=\"0 0 24 24\"><path d=\"M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z\"/></svg>", e: "<svg viewBox=\"0 0 24 24\"><path d=\"M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.4 7H19.6zM4 8.6V17h16V8.6l-8 5.4z\"/></svg>", l: "<svg viewBox=\"0 0 24 24\"><path d=\"M12 2a7 7 0 0 1 7 7c0 5.2-7 13-7 13S5 14.2 5 9a7 7 0 0 1 7-7zm0 4.5A2.5 2.5 0 1 0 12 11.5 2.5 2.5 0 0 0 12 6.5z\"/></svg>" };
    var bits = [["p", ph], ["e", c.email], ["l", c.address]].filter(function (x) { return x[1]; })
      .map(function (x) { return '<em class="xf-i" data-k="' + x[0] + '">' + IC[x[0]] + esc(x[1]) + "</em>"; }).join("<i>|</i>");
    return '<div class="xf"><div class="xf-t"><span>' + bits + "</span><b>Thank you for your business</b></div><div class='xf-bar'></div></div>";
  }
  function wrap(title, inner, c, label, pdf) {
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='wx-design' content='" + DZ + "'><title>" + esc(title) + "</title><style>" + css(pdf) + "</style></head><body><div class='doc'><table class='pg'><thead><tr><td><div class='xh-sp'></div></td></tr></thead><tbody><tr><td>" + inner + "</td></tr></tbody><tfoot><tr><td><div class='xf-sp'></div></td></tr></tfoot></table>" + footer(c, label) + "</div></body></html>";
  }
  function boxes(cl, rightTitle, rows) {
    return '<div class="boxes"><div class="box"><small>Prepared for</small><b>' + esc(cl.company || cl.name) + "</b>" + (cl.company && cl.name !== cl.company ? "<div>Attn: " + esc(cl.name) + "</div>" : "") + (cl.address ? "<div>" + esc(cl.address) + "</div>" : "") + "<div>" + esc([cl.phone, cl.email].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="box"><small>' + rightTitle + "</small><dl>" + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl></div></div>";
  }
  function totals(d, label) { /*P18tot*/
    var rows = function (k, v, neg) { return "<div><span>" + k + "</span><span>" + (neg ? "– " : "") + money(v) + "</span></div>"; };
    var any = d.discount || d.tax || d.rent, adv = +d.advance || 0;
    return '<div class="foot2"><div class="words"><small>Amount in words</small>Rupees ' + P.words(adv ? d.total - adv : d.total) + ' Only' + (adv ? "<small style='margin-top:1.4mm'>(balance payable after advance)</small>" : "") + '</div><div class="tot">' +
      (any ? rows("Subtotal", d.subtotal) : "") + (d.discount ? rows("Discount", d.discount, 1) : "") + (d.rent ? rows("Rent / transport", d.rent) : "") +
      (d.tax ? rows("Total tax (" + (+d.taxPct || 0) + "%)", d.tax) : "") + '<div class="g"><span>' + (label || (any || adv ? "GRAND TOTAL (Rs)" : "TOTAL (Rs)")) + "</span><span>" + money(d.total) + "</span></div>" +
      (adv ? rows("Advance", adv, 1) + '<div class="g" style="background:#fff;color:var(--ink);border:1.5px solid var(--ink)"><span>BALANCE PAYABLE (Rs)</span><span style="color:var(--ink)">' + money(d.total - adv) + "</span></div>" : "") + "</div></div>";
  }
  function totalsOld(d, label) {
    return '<div class="foot2"><div class="words"><small>Amount in words</small>Rupees ' + P.words(d.total) + ' Only</div><div class="tot">' +
      (d.discount || d.tax ? "<div><span>Subtotal</span><span>" + money(d.subtotal) + "</span></div>" : "") + (d.discount ? "<div><span>Discount</span><span>– " + money(d.discount) + "</span></div>" : "") +
      (d.tax ? "<div><span>Tax (" + (+d.taxPct || 0) + "%)</span><span>" + money(d.tax) + "</span></div>" : "") + '<div class="g"><span>' + (label || "TOTAL (Rs)") + "</span><span>" + money(d.total) + "</span></div></div></div>";
  }
  function termsBlock(t, c) { var l = lines(t || c.payTerms); return l.length ? '<div class="keep"><h3>Terms &amp; conditions</h3><ol class="terms">' + l.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></div>" : ""; }
  // banks for this document: "furniture" docs (WF- / furniture type) → banks marked furniture; others → interior; "all" banks always
  function banksFor(c, line) {
    var L = (c.banks || []).filter(function (b) { return b.use === "all" || b.use === line; });
    if (!L.length && (c.banks || []).length) L = c.banks.slice(0, 1);
    if (!L.length && (c.bankAccount || c.bankIban)) L = [{ bank: c.bankName, title: c.bankTitle, account: c.bankAccount, iban: c.bankIban }];
    return L;
  }
  P.banksFor = banksFor;
  P.docLine = function (d) { return d.line === "furniture" || d.qtype === "furniture" || /^WF/i.test(d.no || "") ? "furniture" : "interior"; };
  function bankBlock(c, line) {
    var L = banksFor(c, line || "interior"), W = (c.wallets || []).filter(function (w) { return w.number; });
    if (!L.length && !W.length) return "";
    return '<div class="keep"><h3>Payment details</h3><div class="banks">' + L.map(function (b) {
      return '<div class="bank1"><b class="bn">' + esc(b.bank || "Bank") + "</b>" + [["Account title", b.title], ["Account no.", b.account], ["IBAN", b.iban], ["Branch", b.branch ? b.branch + (b.code ? " (" + b.code + ")" : "") : ""]].filter(function (r) { return r[1]; }).map(function (r) { return "<small>" + r[0] + "</small><span>" + esc(r[1]) + "</span>"; }).join("") + "</div>"; }).join("") +
      (W.length ? '<div class="bank1 wal"><b class="bn">Mobile wallets</b>' + W.map(function (w) { return "<small>" + esc(w.name) + "</small><span>" + esc(w.number) + "</span>"; }).join("") + "</div>" : "") + "</div></div>";
  }
  function signBlock(left, right, mid) {
    var cell = function (x) { return "<div>" + esc(x[0]) + "<small>" + esc(x[1] || "") + "</small>" + (x[2] ? "<small>" + esc(x[2]) + "</small>" : "") + "</div>"; };
    return '<div class="sign' + (mid ? " three" : "") + '">' + cell(left) + (mid ? cell(mid) : "") + cell(right) + "</div>";
  }
  function itemRows(s, si, cols) { // cols: "single" (Sr Desc Qty Unit Rate Amount) or "trade" (Item# Desc Unit No's Rate Amount)
    return numbered(s, si).map(function (x) {
      var it = x.it;
      if (it.kind === "head") return '<tr class="hd"><td class="sr">' + esc(x.code) + '</td><td colspan="5">' + esc(it.desc) + "</td></tr>";
      if (it.kind === "spec") return '<tr class="sp"><td></td><td class="d" colspan="5">' + esc(it.desc) + "</td></tr>";
      return cols === "trade" ? '<tr><td class="sr">' + esc(x.code) + "</td><td>" + esc(it.desc) + '</td><td class="c">' + (UNIT[it.unit] || esc(it.unit)) + '</td><td class="r n">' + qtyf(it.qty) + '</td><td class="r n">' + amt(it.rate) + '</td><td class="r n">' + amt(it.amount) + "</td></tr>"
        : '<tr><td class="sr">' + esc(x.code) + "</td><td>" + esc(it.desc) + '</td><td class="r n">' + qtyf(it.qty) + '</td><td class="c">' + (UNIT[it.unit] || esc(it.unit)) + '</td><td class="r n">' + amt(it.rate) + '</td><td class="r n">' + amt(it.amount) + "</td></tr>";
    }).join("");
  }
  var signer = function (q, c) { var d = (c.signers || [])[0] || {}; return [q.sign_name || c.signName || d.name || "Prepared by", q.sign_title || c.signTitle || d.title || "For " + (c.name || "Woodex Interior")]; };

  // ------------------------------------------------------------- P18: blocks (order + on/off per document)
  var BLK = { summary: "Summary of cost", scope: "Scope of work", items: "Items / BOQ", totals: "Totals & amount in words", terms: "Terms & conditions", bank: "Payment details", sign: "Signatures" };
  P.BLOCKS = BLK;
  P.blockDefaults = function (layout, kind) {
    if (kind === "invoice") return ["items", "totals", "terms", "bank", "sign"];
    if (layout === "classic" || !layout) return ["scope", "summary", "totals", "items", "terms", "bank", "sign"]; /*P19 F2*/
    return layout === "project" ? ["scope", "summary", "totals", "items", "terms", "bank", "sign"] : ["scope", "-summary", "items", "totals", "terms", "bank", "sign"];
  };
  /** saved order (e.g. ["items","-bank"]) merged with defaults: unknown dropped, missing appended. "-" = hidden */
  P.blockOrder = function (saved, layout, kind) {
    var def = P.blockDefaults(layout, kind), out = [], seen = {};
    (saved || []).concat(def).forEach(function (k) { var n = String(k).replace(/^-+/, ""); if (seen[n] || def.map(function (d) { return d.replace(/^-+/, ""); }).indexOf(n) < 0) return; seen[n] = 1; out.push(k); });
    return out;
  };
  function assemble(order, map) { return order.filter(function (k) { return k.charAt(0) !== "-"; }).map(function (k) { return map[k] ? map[k]() : ""; }).join(""); }
  function summaryTable(q) {
    return "<div class='keep'><h3 style='margin-top:1mm'>Summary of cost</h3>" +
      '<table class="t"><thead><tr><th>Sr</th><th>Particulars</th><th class="r">Total area (sft)</th><th class="r">Per sft (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      q.sections.map(function (s, i) { var a = +s.area || 0; return '<tr><td class="sr">' + two(i + 1) + '</td><td style="font-weight:600;text-transform:uppercase;letter-spacing:.03em">' + esc(s.name) + '</td><td class="r n">' + (a ? money(a) : "–") + '</td><td class="r n">' + (a && s.subtotal ? money(s.subtotal / a) : "–") + '</td><td class="r n">' + amt(s.subtotal) + "</td></tr>"; }).join("") +
      '<tr class="ss"><td></td><td>TOTAL</td><td></td><td></td><td class="r n">' + money(q.subtotal) + "</td></tr></tbody></table></div>";
  }

  // ------------------------------------------------------------- SINGLE-PAGE QUOTATION
  function single(q, c, pdf, classic) { DZ = q.design || "classic"; /*P19 B5: classic BOQ shares the block system*/
    var label = P.label(q), valid = addDays(q.date, q.valid_days || c.validDays || 15), secs = q.sections.filter(function (s) { return s.items.length; });
    var meta = [["Quotation no.", label], ["Date", dlong(q.date)], ["Valid until", dlong(valid)]];
    var area = q.sections.reduce(function (a, s) { return a + (+s.area || 0); }, 0);
    var map = {
      scope: function () { return scopeBlock(q); },
      summary: function () { return summaryTable(q); },
      items: function () {
        if (classic) return secs.length ? '<div class="keep"><h3>Detailed bill of quantities</h3></div>' + secs.map(function (s) { var si = q.sections.indexOf(s); return '<div class="keep"><h3 style="margin-top:3mm">' + two(si + 1) + " · " + esc(s.name) + '</h3><table class="t"><thead><tr><th>Sr</th><th>Particulars</th><th class="r">Qty / area</th><th class="c">Unit</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' + itemRows(s, si, "single") + '<tr class="ss"><td></td><td colspan="4">Total · ' + esc(s.name) + '</td><td class="r n">' + amt(s.subtotal) + "</td></tr></tbody></table></div>"; }).join("") : "";
        return '<table class="t"><thead><tr><th>Sr</th><th>Description</th><th class="r">Qty</th><th class="c">Unit</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
          secs.map(function (s) { var si = q.sections.indexOf(s); return '<tr class="sec"><td class="sr">' + two(si + 1) + '</td><td colspan="4">' + esc(s.name) + '</td><td class="r n">' + amt(s.subtotal) + "</td></tr>" + itemRows(s, si, "single") + (s.note ? '<tr class="sp"><td></td><td class="d" colspan="5">Note: ' + esc(s.note) + "</td></tr>" : ""); }).join("") + "</tbody></table>";
      },
      totals: function () { return totals(q); },
      terms: function () { return termsBlock(q.terms, c); },
      bank: function () { return bankBlock(c, P.docLine(q)); },
      sign: function () { return signBlock([signer(q, c)[0], signer(q, c)[1]], ["Accepted by client", q.client.company || q.client.name, "Signature · date · stamp"]); }
    };
    var body = header(c, "QUOTATION", meta, q.qtype ? [QT[q.qtype]] : []) + pdfBand("QUOTATION", meta) +
      boxes(q.client, "Project details", [["Project", q.project || "—"], ["Site", q.site], ["Type", QT[q.qtype] || ""], ["Area", area ? money(area) + " sft" : ""]]) +
      (q.intro ? '<p class="intro">' + esc(q.intro) + "</p>" : "") + assemble(P.blockOrder(q.blocks, classic ? "classic" : "single"), map);
    return wrap("Quotation " + label + " - " + q.client.name, body, c, label, pdf);
  }
  function scopeBlock(q) { var l = lines(q.scope); return l.length ? '<div class="keep"><h3>Scope of work</h3><ul class="scope">' + l.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : ""; }

  // ------------------------------------------------------------- PROJECT QUOTATION (summary + trade pages)
  function project(q, c, pdf) { DZ = q.design || "classic";
    var label = P.label(q), valid = addDays(q.date, q.valid_days || c.validDays || 15);
    var chips = [q.option || "Option-1", "V-" + (q.version || 1)].concat(q.qtype ? [QT[q.qtype]] : []);
    var meta = [["Quotation no.", label], ["Date", dlong(q.date)], ["Valid until", dlong(valid)]];
    var area = Math.max.apply(null, q.sections.map(function (s) { return +s.area || 0; }).concat([0]));
    var map = {
      scope: function () { return scopeBlock(q); },
      summary: function () { return summaryTable(q); },
      totals: function () { return totals(q); },
      items: function () {
        return q.sections.filter(function (s) { return s.items.length; }).map(function (s) {
          var si = q.sections.indexOf(s), a = +s.area || 0;
          return '<div class="brk"></div><div class="trade"><h2><span>' + two(si + 1) + "</span>" + esc(s.name) + '</h2><div class="kv">' + (a ? "Area <b>" + money(a) + " sft</b> · Rs <b>" + money(s.subtotal / a) + "</b> / sft<br>" : "") + "Section total <b>Rs " + money(s.subtotal) + "</b></div></div>" +
            '<table class="t"><thead><tr><th>Item #</th><th>Description</th><th class="c">Unit</th><th class="r">No\'s / qty</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' + itemRows(s, si, "trade") +
            '<tr class="ss"><td></td><td colspan="4">Total · ' + esc(s.name) + '</td><td class="r n">' + money(s.subtotal) + "</td></tr></tbody></table>" + (s.note ? '<div class="note">' + esc(s.note) + "</div>" : "");
        }).join("") + '<div class="brk"></div>';
      },
      terms: function () { return termsBlock(q.terms, c); },
      bank: function () { return bankBlock(c, P.docLine(q)); },
      sign: function () { return signBlock([signer(q, c)[0], signer(q, c)[1]], ["Accepted by client", q.client.company || q.client.name, "Signature · date · stamp"], ["Approved by consultant", "Name & signature", ""]); }
    };
    var body = header(c, "QUOTATION", meta, chips) + pdfBand("QUOTATION", meta) +
      boxes(q.client, "Project details", [["Project", q.project || "—"], ["Site", q.site], ["Type", QT[q.qtype] || "Interior project"], ["Covered area", area ? money(area) + " sft" : ""], ["Rate", area ? "Rs " + money(q.total / area) + " / sft overall" : ""]]) +
      (q.intro ? '<p class="intro">' + esc(q.intro) + "</p>" : "") + assemble(P.blockOrder(q.blocks, "project"), map);
    return wrap("Quotation " + label + " - " + q.client.name, body.replace(/(<div class="brk"><\/div>)+$/, ""), c, label, pdf);
  }

  function legacy(c, d) { var b = banksFor(c, P.docLine(d))[0], s = (c.signers || [])[0] || {}; c = Object.assign({}, c); if (b) { c.bankName = b.bank; c.bankTitle = b.title; c.bankAccount = b.account; c.bankIban = b.iban; } c.signName = c.signName || s.name || ""; return c; }
  P.quote = function (q, c, opts) {
    opts = opts || {};
    if (q.layout === "single") return single(q, c, !!opts.pdf);
    if (q.layout === "project") return project(q, c, !!opts.pdf);
    if (opts.legacy) return OLDQ(q, legacy(c, q), opts);
    return single(q, c, !!opts.pdf, true);
  };

  // ------------------------------------------------------------- INVOICE (new design, all invoices)
  P.invoice = function (inv, c, opts) {
    opts = opts || {}; if (opts.classic) return OLDI(inv, legacy(c, inv)); DZ = inv.design || "classic";
    var st = inv.payStatus === "paid" ? '<span class="stamp paid">Paid</span>' : inv.payStatus === "partial" ? '<span class="stamp part">Part paid</span>' : '<span class="stamp due">' + (inv.mode === "after_delivery" ? "Due on delivery" : "Unpaid") + "</span>";
    var meta = [["Invoice no.", inv.no], ["Date", dlong(inv.issue_date)]].concat(inv.due_date ? [["Due date", dlong(inv.due_date)]] : []).concat(inv.po ? [["PO #", inv.po]] : []);
    var secs = (inv.sections || []).filter(function (s) { return s.items.length; });
    var M = {}; /*P18invblk*/
    var body = header(c, "INVOICE", meta, []) +
      boxes(inv.client, "Invoice details", [["Project", inv.project || ""], ["Site", inv.site], ["Quotation", inv.quote_label || ""], ["Delivery", inv.delivery_date ? dlong(inv.delivery_date) + (inv.delivered ? " (delivered " + dlong(inv.delivered) + ")" : "") : ""], ["Terms", inv.mode === "after_delivery" ? "Payment after delivery" : inv.schedule || ""]]) + "@@BLOCKS@@";
    M.items = function () { return '<table class="t"><thead><tr><th>Sr</th><th>Description</th><th class="r">Qty</th><th class="c">Unit</th><th class="r">Rate (Rs)</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' +
      secs.map(function (s) { var si = inv.sections.indexOf(s); return (secs.length > 1 || s.name !== "Supply & services" ? '<tr class="sec"><td class="sr">' + two(si + 1) + '</td><td colspan="4">' + esc(s.name) + '</td><td class="r n">' + amt(s.subtotal) + "</td></tr>" : "") + itemRows(s, si, "single"); }).join("") +
      "</tbody></table>"; };
    M.totals = function () { return totals(Object.assign({}, inv, { advance: 0 }), "INVOICE TOTAL (Rs)") +
      '<div class="keep"><h3>Payments received &nbsp;' + st + "</h3>" + (inv.payments.length ? '<table class="t"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th class="r">Amount (Rs)</th></tr></thead><tbody>' + inv.payments.map(function (p) { return "<tr><td>" + esc(p.rcpt) + "</td><td>" + dlong(p.date) + "</td><td>" + esc(p.method) + "</td><td>" + esc(p.ref || "") + '</td><td class="r n">' + money(p.amount) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="intro">No payments received yet.</p>') +
      '<div class="foot2" style="margin-top:2mm"><div></div><div class="tot"><div><span>Received</span><span>' + money(inv.paid) + '</span></div><div class="g"><span>BALANCE DUE (Rs)</span><span>' + money(inv.balance) + "</span></div></div></div></div>" + (inv.notes ? "<h3>Notes</h3><p class='intro'>" + esc(inv.notes) + "</p>" : ""); };
    M.terms = function () { return termsBlock(inv.terms, c); };
    M.bank = function () { return bankBlock(c, P.docLine(inv)); };
    M.sign = function () { return signBlock([inv.sign_name || c.signName || ((c.signers || [])[0] || {}).name || "Prepared by", inv.sign_title || c.signTitle || ((c.signers || [])[0] || {}).title || "For " + c.name], ["Received by", inv.client.company || inv.client.name, "Signature · date · stamp"]); };
    body = body.replace("@@BLOCKS@@", function () { return assemble(P.blockOrder(inv.blocks, "single", "invoice"), M); });
    return wrap("Invoice " + inv.no + " - " + inv.client.name, body, c, "Invoice " + inv.no, false);
  };
  // ------------------------------------------------------------- P18: direct PDF download named by serial number
  /** "Quotation WI-10101 · V2 - nabeel" → "WI-10101-V2-Quotation" */
  P.fileStem = function (title) {
    var t = String(title || "Document").split(" - ")[0], m = t.match(/^(Quotation|Invoice|Receipt)\s+(.+)$/i);
    var core = m ? m[2] + " " + m[1] : t;
    return core.replace(/·/g, " ").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "Document";
  };
  P.pdfFromHtml = function (html, stem, c) {
    c = c || {};
    return new Promise(function (resolve, reject) {
      var f = document.createElement("iframe"); f.setAttribute("aria-hidden", "true");
      f.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden";
      document.body.appendChild(f);
      var done = function (e, r) { setTimeout(function () { f.remove(); }, 50); e ? reject(e) : resolve(r); };
      var foot = /class="xf"/.test(html), m = html.match(/<div class="xf-t"><span>([\s\S]*?)<\/span>/);
      var dm = html.match(/name='wx-design' content='([a-z]+)'/), TH = DESIGNS[dm ? dm[1] : "classic"] || DESIGNS.classic;
      var items = []; if (m) m[1].replace(/<em class="xf-i" data-k="(\w)">[\s\S]*?<\/svg>([\s\S]*?)<\/em>/g, function (_, k, t) { items.push([k, t.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')]); });
      var txt = m ? m[1].replace(/<i>\|<\/i>/g, "  |  ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
      f.onload = function () {
        var w = f.contentWindow, d = w.document, sc = d.createElement("script"); sc.src = "/admin/vendor/html2pdf.bundle.min.js";
        sc.onerror = function () { done(new Error("Could not load the PDF maker")); };
        sc.onload = function () {
          (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(function () {
            w.html2pdf().set(w.JSON.parse(JSON.stringify({ margin: [10, 0, foot ? 19 : 12, 0], filename: stem + ".pdf", image: { type: "jpeg", quality: 0.94 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".keep", ".tot", ".foot2", ".sign", ".boxes"] } })))
              .from(d.querySelector(".doc") || d.body).toPdf().get("pdf").then(function (pdf) {
                var n = pdf.internal.getNumberOfPages(), W = 210, H = 297;
                if (foot) for (var i = 1; i <= n; i++) {
                  pdf.setPage(i);
                  pdf.setDrawColor(227, 225, 220); pdf.setLineWidth(0.25); pdf.line(12, H - 15.5, W - 12, H - 15.5);
                  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.4); pdf.setTextColor(0, 0, 0);
                  if (items.length) { /*P36: black vector icons + bold text*/
                    var x = 12, y = H - 10.6, ic = function (k, x0) { var cy = y - 1.05; pdf.setFillColor(0, 0, 0); pdf.setDrawColor(0, 0, 0);
                      if (k === "p") { pdf.setLineWidth(0.55); pdf.roundedRect(x0 + 0.35, cy - 1.25, 1.5, 2.5, 0.3, 0.3, "F"); pdf.setFillColor(255, 255, 255); pdf.rect(x0 + 0.6, cy - 0.9, 1, 1.5, "F"); }
                      else if (k === "e") { pdf.setLineWidth(0.3); pdf.rect(x0, cy - 0.95, 2.4, 1.9, "S"); pdf.line(x0, cy - 0.95, x0 + 1.2, cy + 0.1); pdf.line(x0 + 2.4, cy - 0.95, x0 + 1.2, cy + 0.1); }
                      else { pdf.circle(x0 + 1, cy - 0.4, 0.95, "F"); pdf.triangle(x0 + 0.15, cy - 0.1, x0 + 1.85, cy - 0.1, x0 + 1, cy + 1.3, "F"); pdf.setFillColor(255, 255, 255); pdf.circle(x0 + 1, cy - 0.4, 0.35, "F"); } };
                    items.forEach(function (it, n) { if (n) { pdf.text("|", x + 1.4, y); x += 4.4; } ic(it[0], x); x += 3.1; pdf.text(it[1], x, y); x += pdf.getTextWidth(it[1]); });
                  } else pdf.text(txt, 12, H - 10.6, { maxWidth: 140 });
                  pdf.text("Thank you for your business", W - 12, H - 10.6, { align: "right" });
                  pdf.setFillColor(TH.bar[0], TH.bar[1], TH.bar[2]); pdf.rect(0, H - 6, W, 6, "F");
                  pdf.setFillColor(TH.bar2[0], TH.bar2[1], TH.bar2[2]); pdf.triangle(W - 72, H, W - 65, H - 6, W - 65, H, "F"); pdf.rect(W - 65, H - 6, 65, 6, "F");
                  pdf.setFillColor(TH.acc[0], TH.acc[1], TH.acc[2]); pdf.rect(W - 65, H - 6, 65, 0.7, "F");
                }
                var blob = pdf.output("blob"), fr = new FileReader();
                fr.onload = function () { done(null, { blob: blob, base64: String(fr.result).split(",")[1], name: stem + ".pdf", pages: n }); };
                fr.readAsDataURL(blob);
              }).catch(done);
          });
        };
        d.head.appendChild(sc);
      };
      f.srcdoc = String(html).replace(/<body>/, "<body class='dl'>");
    });
  };
  // preview: add "Download PDF" + make the print dialog suggest the serial-number file name
  var OLDPV = P.preview;
  P.preview = function (html, title) {
    var f = OLDPV(html, title), ov = f.parentNode, tm = String(html).match(/<title>([^<]*)<\/title>/), stem = P.fileStem(tm ? tm[1].replace(/&amp;/g, "&") : title);
    f.addEventListener("load", function () { try { f.contentDocument.title = stem; } catch (e) {} });
    var bar = ov.querySelector(".pv-bar"), p = bar.querySelector("[data-p]"), hint = bar.querySelector(".muted");
    if (hint) hint.textContent = "File: " + stem + ".pdf · A4";
    p.textContent = "Print";
    var dl = document.createElement("button"); dl.className = "btn pri"; dl.setAttribute("data-dl", ""); dl.textContent = "Download PDF";
    p.classList.remove("pri"); bar.insertBefore(dl, p.nextSibling);
    dl.onclick = function () {
      dl.disabled = true; dl.textContent = "Making PDF…";
      P.pdfFromHtml(html, stem).then(function (r) { P.download(r.blob, r.name); dl.textContent = "Downloaded ✓"; setTimeout(function () { dl.disabled = false; dl.textContent = "Download PDF"; }, 2500); })
        .catch(function (e) { dl.disabled = false; dl.textContent = "Download PDF"; alert("PDF failed: " + (e && e.message || e)); });
    };
    return f;
  };
  var OLDQPDF = P.quotePdf; /*P18qpdf*/
  P.quotePdf = function (q, c) { if (q.layout !== "single" && q.layout !== "project") return OLDQPDF(q, c); var h = P.quote(q, c); var t = h.match(/<title>([^<]*)<\/title>/); return P.pdfFromHtml(h, P.fileStem(t ? t[1] : "Quotation " + q.no)); };
  /** P18: blocks panel — drag or ↑↓ to reorder, switch to show/hide. onChange(newOrderArray) */
  P.blocksUI = function (box, saved, layout, kind, onChange, ro) {
    var order = P.blockOrder(saved, layout, kind), drag = null;
    var draw = function () {
      box.innerHTML = "<ul class='blk-ui'>" + order.map(function (k, i) { var n = k.replace(/^-+/, ""), on = k.charAt(0) !== "-";
        return "<li draggable='" + (!ro) + "' data-i='" + i + "' class='" + (on ? "" : "off") + "'><span class='blk-h' title='Drag'>⋮⋮</span><span class='blk-n'>" + esc(BLK[n]) + "</span>" +
          (ro ? "" : "<button type='button' class='icon-btn' data-up title='Move up'" + (i ? "" : " disabled") + ">↑</button><button type='button' class='icon-btn' data-dn title='Move down'" + (i < order.length - 1 ? "" : " disabled") + ">↓</button>") +
          "<label class='blk-sw' title='Show / hide'><input type='checkbox'" + (on ? " checked" : "") + (ro ? " disabled" : "") + "><i></i></label></li>"; }).join("") + "</ul>";
      Array.prototype.forEach.call(box.querySelectorAll("li"), function (li) {
        var i = +li.dataset.i, mv = function (j) { var x = order.splice(i, 1)[0]; order.splice(j, 0, x); draw(); onChange(order.slice()); };
        var up = li.querySelector("[data-up]"), dn = li.querySelector("[data-dn]");
        if (up) up.onclick = function () { mv(i - 1); }; if (dn) dn.onclick = function () { mv(i + 1); };
        li.querySelector("input").onchange = function (e) { var n = order[i].replace(/^-+/, ""); order[i] = e.target.checked ? n : "-" + n; draw(); onChange(order.slice()); };
        li.ondragstart = function (e) { drag = i; li.classList.add("drag"); try { e.dataTransfer.setData("text/plain", String(i)); } catch (x) {} };
        li.ondragend = function () { li.classList.remove("drag"); };
        li.ondragover = function (e) { e.preventDefault(); li.classList.add("over"); };
        li.ondragleave = function () { li.classList.remove("over"); };
        li.ondrop = function (e) { e.preventDefault(); if (drag === null || drag === i) return; var x = order.splice(drag, 1)[0]; order.splice(i, 0, x); drag = null; draw(); onChange(order.slice()); };
      });
    };
    draw();
    return { set: function (lay) { layout = lay; order = P.blockOrder(order, layout, kind); draw(); }, reset: function () { order = P.blockDefaults(layout, kind); draw(); onChange(order.slice()); } };
  };
  P.layouts = { single: "Single page", project: "Project (summary + trades)", classic: "Classic BOQ" };
})();
