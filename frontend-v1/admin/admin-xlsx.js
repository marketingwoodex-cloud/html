/* Woodex Admin — Phase 3: real Excel (.xlsx) downloads without libraries. W.xlsx(name, rows[, sheetName]); W.csvParse(text). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var T = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], cen = [], off = 0;
    var u16 = function (v) { return [v & 255, (v >> 8) & 255]; }, u32 = function (v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), c = crc(data);
      var loc = [].concat([0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(loc), name, data);
      cen.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += loc.length + name.length + data.length;
    });
    var cs = cen.reduce(function (a, b) { return a + b.length; }, 0);
    return new Blob(parts.concat(cen, [new Uint8Array([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(off), u16(0)))]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  var X = function (s) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  function col(i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
  function sheet(rows) {
    var w = [], x = rows.map(function (r, ri) { return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) { var s = v == null ? "" : String(v); w[ci] = Math.min(60, Math.max(w[ci] || 8, s.length + 2));
      var ref = col(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : "";
      return /^-?\d{1,15}(\.\d+)?$/.test(s) && !/^0\d/.test(s) ? '<c r="' + ref + '"' + st + "><v>" + s + "</v></c>" : '<c r="' + ref + '" t="inlineStr"' + st + "><is><t xml:space=\"preserve\">" + X(s) + "</t></is></c>"; }).join("") + "</row>"; }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (w.length ? "<cols>" + w.map(function (n, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + n + '" customWidth="1"/>'; }).join("") + "</cols>" : "") + "<sheetData>" + x + "</sheetData>" + (rows.length > 1 && rows[0].length ? '<autoFilter ref="A1:' + col(rows[0].length - 1) + rows.length + '"/>' : "") + "</worksheet>";
  }
  W.xlsx = function (name, rows, sheetName) {
    var sn = X(String(sheetName || "Sheet1").replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31));
    var b = zip([
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + sn + '" sheetId="1" r:id="rId1"/></sheets>' + (rows.length > 1 && rows[0].length ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + sn + "'!$A$1:$" + col(rows[0].length - 1) + "$" + rows.length + "</definedName></definedNames>" : "") + "</workbook>"],
      ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C1628"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ["xl/worksheets/sheet1.xml", sheet(rows)]
    ]);
    var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = /\.xlsx$/i.test(name) ? name : name + ".xlsx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  };
  W.csvParse = function (t) {
    t = String(t || "").replace(/^\ufeff/, ""); var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < t.length; i++) { var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += ch; }
    if (f !== "" || row.length) { row.push(f); rows.push(row); } return rows;
  };
})();
