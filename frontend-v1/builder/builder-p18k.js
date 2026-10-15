/* Woodex Builder — P18 K: UI polish.
   - Section cards get a small wireframe preview of their layout instead of an emoji (emoji fonts differ per computer).
   - Segmented tabs, nicer empty state in the right panel. Pure presentation: no editing logic changed. */
(function () {
  "use strict";
  var N = "#0c1628", C = "#efe6d8", W = "#b8956a", L = "#d9dde3", BG = "#f7f5f1";
  function r(x, y, w, h, f, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx == null ? 2 : rx) + '" fill="' + f + '"/>'; }
  function lines(x, y, w, n, f, gap) { var s = ""; for (var i = 0; i < n; i++) s += r(x, y + i * (gap || 6), i === n - 1 ? w * 0.6 : w, 3, f || L, 1.5); return s; }
  var K = {
    hero: function (n) {
      if (/split|image$|\+ image/.test(n)) return r(0, 0, 120, 64, BG, 0) + r(8, 16, 40, 5, N) + r(8, 25, 30, 5, N) + lines(8, 36, 44, 2) + r(8, 50, 22, 7, N, 3.5) + r(64, 6, 50, 52, W, 4);
      if (/minimal|white|centered/.test(n)) return r(0, 0, 120, 64, BG, 0) + r(30, 14, 60, 6, N) + r(38, 24, 44, 6, N) + lines(34, 36, 52, 2) + r(48, 49, 24, 7, N, 3.5);
      if (/grid/.test(n)) return r(0, 0, 120, 64, BG, 0) + r(8, 10, 44, 6, N) + lines(8, 22, 40, 3) + r(60, 6, 25, 25, W) + r(89, 6, 25, 25, C) + r(60, 34, 25, 24, C) + r(89, 34, 25, 24, W);
      return r(0, 0, 120, 64, "#1d2a40", 0) + r(0, 0, 120, 64, "url(#g)", 0) + r(8, 30, 56, 6, "#fff") + r(8, 39, 40, 6, "#fff") + r(8, 50, 22, 7, "#fff", 3.5) + r(33, 50, 22, 7, "rgba(255,255,255,.35)", 3.5);
    },
    cards: function (n) { var s = r(0, 0, 120, 64, "#fff", 0) + r(36, 6, 48, 5, N); for (var i = 0; i < 3; i++) s += r(6 + i * 37, 18, 34, 40, BG, 4) + r(11 + i * 37, 23, 8, 8, W, 4) + lines(11 + i * 37, 36, 24, 3); return s; },
    stats: function () { var s = r(0, 0, 120, 64, N, 0); for (var i = 0; i < 4; i++) s += r(8 + i * 28, 20, 18, 9, W) + r(8 + i * 28, 34, 22, 3, "rgba(255,255,255,.4)", 1.5); return s; },
    process: function () { var s = r(0, 0, 120, 64, "#fff", 0) + r(36, 6, 48, 5, N) + r(16, 28, 88, 2, L, 1); for (var i = 0; i < 4; i++) s += '<circle cx="' + (16 + i * 29) + '" cy="29" r="6" fill="' + (i ? C : W) + '"/>' + r(8 + i * 29, 42, 18, 3, L, 1.5) + r(10 + i * 29, 48, 14, 3, L, 1.5); return s; },
    gallery: function () { return r(0, 0, 120, 64, "#fff", 0) + r(6, 6, 52, 52, W, 3) + r(62, 6, 24, 24, C, 3) + r(90, 6, 24, 24, "#cdbfa8", 3) + r(62, 34, 52, 24, C, 3); },
    testimonials: function () { var s = r(0, 0, 120, 64, BG, 0); for (var i = 0; i < 2; i++) s += r(6 + i * 56, 10, 52, 44, "#fff", 4) + '<text x="' + (11 + i * 56) + '" y="24" font-size="14" font-family="Georgia" fill="' + W + '">“</text>' + lines(12 + i * 56, 28, 40, 3) + '<circle cx="' + (16 + i * 56) + '" cy="48" r="3.5" fill="' + C + '"/>'; return s; },
    faq: function () { var s = r(0, 0, 120, 64, "#fff", 0) + r(6, 8, 30, 5, N) + lines(6, 18, 28, 3); for (var i = 0; i < 4; i++) s += r(44, 6 + i * 14, 70, 11, BG, 3) + r(48, 10.5 + i * 14, 40, 2.5, "#9aa1ab", 1) + r(106, 9.5 + i * 14, 4, 4, W, 1); return s; },
    cta: function () { return r(0, 0, 120, 64, "#fff", 0) + r(6, 12, 108, 40, N, 6) + r(16, 24, 50, 5, "#fff") + r(16, 33, 34, 3, "rgba(255,255,255,.45)", 1.5) + r(80, 26, 26, 10, W, 5); },
    contact: function () { return r(0, 0, 120, 64, BG, 0) + r(6, 8, 36, 5, N) + lines(6, 18, 34, 3) + r(6, 40, 30, 4, W, 2) + r(54, 6, 60, 52, "#fff", 4) + r(60, 12, 48, 7, BG, 2) + r(60, 23, 48, 7, BG, 2) + r(60, 34, 48, 12, BG, 2) + r(60, 49, 22, 6, N, 3); },
    pricing: function () { var s = r(0, 0, 120, 64, "#fff", 0); for (var i = 0; i < 3; i++) s += r(6 + i * 37, i === 1 ? 4 : 10, 34, i === 1 ? 56 : 48, i === 1 ? N : BG, 4) + r(11 + i * 37, (i === 1 ? 10 : 16), 14, 6, i === 1 ? W : N) + lines(11 + i * 37, (i === 1 ? 22 : 28), 24, 3, i === 1 ? "rgba(255,255,255,.35)" : L) + r(11 + i * 37, i === 1 ? 48 : 48, 24, 6, i === 1 ? W : N, 3); return s; },
    team: function () { var s = r(0, 0, 120, 64, "#fff", 0) + r(36, 6, 48, 5, N); for (var i = 0; i < 4; i++) s += '<circle cx="' + (18 + i * 28) + '" cy="31" r="10" fill="' + (i % 2 ? C : W) + '"/>' + r(8 + i * 28, 46, 20, 3, N, 1.5) + r(11 + i * 28, 52, 14, 3, L, 1.5); return s; },
    logos: function () { var s = r(0, 0, 120, 64, BG, 0) + r(40, 14, 40, 4, "#9aa1ab", 2); for (var i = 0; i < 5; i++) s += r(6 + i * 22.5, 30, 18, 10, "#d4cbbd", 3); return s; },
    split: function (n) { var img = r(/image \+|^image/.test(n) ? 6 : 64, 6, 50, 52, W, 4), x = /image \+|^image/.test(n) ? 64 : 6; return r(0, 0, 120, 64, "#fff", 0) + img + r(x, 14, 42, 5, N) + lines(x, 24, 46, 4) + r(x, 50, 20, 6, N, 3); },
    content: function () { return r(0, 0, 120, 64, "#fff", 0) + r(20, 8, 60, 6, N) + lines(20, 20, 80, 6, L, 6.5); },
    nav: function () { return r(0, 0, 120, 64, BG, 0) + r(6, 8, 108, 12, "#fff", 6) + r(11, 12, 16, 4, N) + r(60, 12.5, 30, 3, L, 1.5) + r(96, 11, 14, 6, N, 3) + r(6, 26, 108, 32, "#fff", 4); },
    footer: function () { var s = r(0, 0, 120, 64, N, 0); for (var i = 0; i < 4; i++) s += r(8 + i * 28, 12, 16, 4, W) + lines(8 + i * 28, 21, 20, 3, "rgba(255,255,255,.25)"); return s + r(8, 52, 104, 1, "rgba(255,255,255,.2)", 0); },
    basic: function () { return r(0, 0, 120, 64, BG, 0) + r(10, 10, 100, 44, "#fff", 4) + lines(18, 20, 70, 4); }
  };
  function kind(name, cat) {
    var s = (cat + " " + name).toLowerCase();
    if (/hero/.test(s)) return "hero"; if (/faq|question/.test(s)) return "faq"; if (/pric|package|plan/.test(s)) return "pricing";
    if (/testimon|review|quote/.test(s)) return "testimonials"; if (/stat|number|counter/.test(s)) return "stats"; if (/process|step|timeline/.test(s)) return "process";
    if (/gallery|project|portfolio/.test(s)) return "gallery"; if (/team|people|member/.test(s)) return "team"; if (/logo|client/.test(s)) return "logos";
    if (/contact|form|map/.test(s)) return "contact"; if (/cta|call-to-action|call to action|banner|band/.test(s)) return "cta";
    if (/text \+ image|image \+ text|split|feature row/.test(s)) return "split"; if (/card|service|feature|why/.test(s)) return "cards";
    if (/nav|header|menu/.test(s)) return "nav"; if (/footer/.test(s)) return "footer"; if (/text|content|article|basic/.test(s)) return "content";
    return "basic";
  }
  function svg(name, cat) {
    var k = kind(name, cat), n = String(name).toLowerCase();
    return '<svg viewBox="0 0 120 64" class="k-th" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4c66"/><stop offset="1" stop-color="#0c1628"/></linearGradient></defs>' + K[k](n) + "</svg>";
  }
  var IDX = null;
  function index() {
    if (IDX) return IDX; IDX = {};
    (window.WX_TEMPLATES || []).forEach(function (t) { IDX[t.id] = { n: t.name, c: t.cat || "" }; });
    (window.WX_BLOCKS || []).forEach(function (t) { if (!IDX[t.id]) IDX[t.id] = { n: t.name, c: "Basic" }; });
    return IDX;
  }
  function paint(root) {
    var I = index();
    [].forEach.call((root || document).querySelectorAll(".lib button[data-id]:not([data-k])"), function (b) {
      var m = I[b.dataset.id]; if (!m) return; b.dataset.k = "1"; b.classList.add("k-card");
      var sp = b.querySelector("span"); if (sp) { sp.className = "k-thw"; sp.innerHTML = svg(m.n, m.c); }
    });
  }
  var css = document.createElement("style");
  css.textContent =
    ".lib button.k-card{padding:6px 6px 9px;gap:7px;min-height:0;font-weight:600;color:#1f2937;line-height:1.3;transition:border-color .15s,box-shadow .15s,transform .15s}" +
    ".lib button.k-card:hover{border-color:#b8956a;box-shadow:0 6px 16px -6px rgba(12,22,40,.25);transform:translateY(-1px)}" +
    ".lib button.k-card .k-thw{display:block;width:100%;font-size:0;border-radius:6px;overflow:hidden;border:1px solid #eceef1}.k-th{display:block;width:100%;height:auto}" +
    ".lib button.k-card{padding-left:6px}.lib button.k-card>.k-thw+*{margin:0 3px}" +
    ".fk-tabs{display:grid!important;grid-template-columns:auto auto auto auto!important;margin:0 0 12px;gap:2px;padding:3px;background:#f1f2f4;border-radius:10px}.fk-tabs button{flex:1 1 auto;min-width:0;height:30px;border:0;border-radius:8px;background:transparent;color:#5b6270;font-size:11px!important;font-weight:600;letter-spacing:-.01em;cursor:pointer;white-space:nowrap;padding:0 3px;overflow:hidden;text-overflow:ellipsis}.fk-tabs button:hover{color:#0c1628}.fk-tabs button.on{background:#fff;color:#0c1628;box-shadow:0 1px 3px rgba(16,24,40,.12)}" +
    ".fk-chips button.on{background:#0c1628!important;border-color:#0c1628!important;color:#fff!important}" +
    "#rp-empty{margin:18px;padding:22px 18px;border:1px dashed #d7dbe1;border-radius:14px;background:#fafbfc;color:#5b6270;font-size:13px;line-height:1.7}#rp-empty:before{content:\"\";display:block;width:40px;height:40px;margin:0 0 12px;border-radius:10px;background:#f4efe7 url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b8956a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 9l5 12 1.8-5.2L21 14Z'/%3E%3Cpath d='M7.2 2.2 8 5.1'/%3E%3Cpath d='m5.1 8-2.9-.8'/%3E%3Cpath d='M14 4.1 12 6'/%3E%3Cpath d='m6 12-1.9 2'/%3E%3C/svg%3E\") center/22px no-repeat}#rp-empty b{color:#0c1628}";
  document.head.appendChild(css);
  paint();
  new MutationObserver(function () { paint(); }).observe(document.body, { childList: true, subtree: true });
  window.__wx18k = { kind: kind };
})();
