/* Woodex builder — P38: section skins (White / Cream / Navy) + "Use on a page" hand-off from Admin → Section library. */
(function () {
  "use strict";
  var X = window.__wx5; if (!X || !X.api) return;
  var S = X.S, $ = function (s, r) { return (r || document).querySelector(s); };
  var SK = [["", "Original"], ["white", "White"], ["cream", "Cream"], ["navy", "Navy"]], cur = "";
  function setSkin(el, s) {
    if (!el || /\bt6-hero\b|\bwxh\b|hero/.test(el.className)) return false;
    el.classList.remove("wx-skin-white", "wx-skin-cream", "wx-skin-navy");
    if (el.classList.contains("t6")) { el.classList.remove("cream", "navy"); if (s === "cream" || s === "navy") el.classList.add(s); }
    else if (s) el.classList.add("wx-skin-" + s);
    return true;
  }
  window.WXSkin = { apply: function (html, s) { if (!s) return html; var t = document.createElement("template"); t.innerHTML = html.trim(); var r = t.content.firstElementChild; if (r) setSkin(r, s); return t.innerHTML; } };
  // inserted sections take the chosen skin
  var ins = X.insertSection; X.insertSection = function (html, after) { return ins(cur ? window.WXSkin.apply(html, cur) : html, after); };
  // skin bar on the Sections pane
  function bar() {
    var pane = document.querySelector('.fk-pane[data-pane="sec"]'); if (!pane || $("#sk-bar", pane)) return;
    var d = document.createElement("div"); d.id = "sk-bar"; d.className = "sk-bar";
    d.innerHTML = "<small>Skin for new sections</small><div>" + SK.map(function (k) { return '<button data-sk="' + k[0] + '"' + (k[0] === cur ? ' class="on"' : "") + '><i class="sk-' + (k[0] || "o") + '"></i>' + k[1] + "</button>"; }).join("") + "</div>";
    pane.insertBefore(d, pane.firstChild);
    d.onclick = function (e) { var b = e.target.closest("[data-sk]"); if (!b) return; cur = b.dataset.sk; [].forEach.call(d.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); }); };
  }
  // skin switch for the selected section (right panel)
  function secOf(el) { while (el && el.parentElement && el.parentElement.tagName !== "MAIN") el = el.parentElement; return el && el.parentElement ? el : null; }
  function rpSkin() {
    var rp = document.getElementById("rp"); if (!rp || rp.hidden || !S.sel) return;
    var sec = secOf(S.sel), box = document.getElementById("sk-rp");
    if (!sec || /hero/.test(sec.className)) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "sk-rp"; box.className = "sk-bar sk-rp"; rp.insertBefore(box, rp.firstChild); }
    var now = sec.classList.contains("navy") || sec.classList.contains("wx-skin-navy") ? "navy" : sec.classList.contains("cream") || sec.classList.contains("wx-skin-cream") ? "cream" : sec.classList.contains("wx-skin-white") ? "white" : "";
    box.innerHTML = "<small>Section skin</small><div>" + SK.map(function (k) { return '<button data-sk="' + k[0] + '"' + (k[0] === now ? ' class="on"' : "") + '><i class="sk-' + (k[0] || "o") + '"></i>' + k[1] + "</button>"; }).join("") + "</div>";
    box.onclick = function (e) { var b = e.target.closest("[data-sk]"); if (!b) return; if (setSkin(secOf(S.sel), b.dataset.sk)) { X.changed(); rpSkin(); X.toast("Skin: " + b.textContent + " — save the page to keep it"); } };
  }
  setInterval(function () { bar(); rpSkin(); }, 700);
  // hand-off: Admin → Section library → "Use on a page"
  setInterval(function () {
    var j; try { j = JSON.parse(sessionStorage.getItem("wxInsert") || "null"); } catch (e) {}
    if (!j || !S.doc || S.path !== j.path || !S.doc.querySelector("main")) return;
    sessionStorage.removeItem("wxInsert");
    ins(window.WXSkin.apply(j.html, j.skin || ""), null);
    X.toast("“" + (j.name || "Section") + "” added at the end of the page — drag it into place, then Save");
  }, 600);
  var st = document.createElement("style");
  st.textContent = ".sk-bar{margin:0 0 10px;padding:8px;border:1px solid #e4e7ec;border-radius:10px;background:#fafafa}.sk-bar small{display:block;font-size:11px;color:#667085;margin-bottom:6px;font-weight:600}.sk-bar div{display:flex;gap:4px;flex-wrap:wrap}.sk-bar button{display:inline-flex;align-items:center;gap:5px;border:1px solid #e4e7ec;background:#fff;border-radius:99px;padding:4px 9px;font:inherit;font-size:11.5px;cursor:pointer}.sk-bar button.on{border-color:#0c1628;box-shadow:0 0 0 1px #0c1628}.sk-bar i{width:11px;height:11px;border-radius:50%;border:1px solid #cbd5e1;display:inline-block}.sk-o{background:linear-gradient(135deg,#fff 50%,#0c1628 50%)}.sk-white{background:#fff}.sk-cream{background:#f4efe7}.sk-navy{background:#0c1628}.sk-rp{margin:10px}";
  document.head.appendChild(st);
})();
