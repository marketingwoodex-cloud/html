/* Woodex Admin — Phase 2: Theme, colours & fonts (presets + custom + live preview). Saves via builder "theme" action → /assets/theme.css */
(function () {
  "use strict";
  var W = window.WXA, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, toast = W.toast, head = W.head;
  var FONTS = [["jakarta", "Plus Jakarta Sans", "sans-serif"], ["inter", "Inter", "sans-serif"], ["manrope", "Manrope", "sans-serif"], ["poppins", "Poppins", "sans-serif"], ["playfair", "Playfair Display", "serif"], ["cormorant", "Cormorant Garamond", "serif"]];
  var FILE = { inter: "inter", manrope: "manrope", poppins: "poppins", playfair: "playfair-display", cormorant: "cormorant-garamond" };
  var PRESETS = [
    ["woodex", "Woodex classic", "Navy, wood and cream — the current look", { "--wx-navy": "#0c1628", "--wx-wood": "#b8956a", "--wx-cream": "#f4efe7", "--wx-paper": "#ffffff", "--wx-ink": "#12151c", "--wx-muted": "#6a6560", "--wx-font": "jakarta", "--wx-font-head": "jakarta" }],
    ["gallery", "Gallery serif", "Elegant serif headings, warm charcoal", { "--wx-navy": "#1b1a17", "--wx-wood": "#a8834f", "--wx-cream": "#f3ede3", "--wx-paper": "#fffdf9", "--wx-ink": "#1b1a17", "--wx-muted": "#6f675c", "--wx-font": "inter", "--wx-font-head": "playfair" }],
    ["modern", "Modern slate", "Cool grey surfaces, crisp sans", { "--wx-navy": "#101828", "--wx-wood": "#c08a4b", "--wx-cream": "#f2f4f7", "--wx-paper": "#ffffff", "--wx-ink": "#101828", "--wx-muted": "#667085", "--wx-font": "manrope", "--wx-font-head": "manrope" }],
    ["walnut", "Warm walnut", "Deep brown with copper touches", { "--wx-navy": "#2b2118", "--wx-wood": "#b9784a", "--wx-cream": "#f6ede2", "--wx-paper": "#fffaf4", "--wx-ink": "#2b2118", "--wx-muted": "#7a6a5a", "--wx-font": "poppins", "--wx-font-head": "cormorant" }]
  ];
  var COLORS = [["--wx-navy", "Main colour", "Header, footer, dark sections, buttons"], ["--wx-wood", "Accent (gold/wood)", "Small touches: lines, icons, hovers"], ["--wx-cream", "Cream sections", "Alternating light sections"], ["--wx-paper", "Page background", "White sections"], ["--wx-ink", "Text", "Headings and body text"], ["--wx-muted", "Soft text", "Captions and descriptions"]];
  var KEYS = COLORS.map(function (c) { return c[0]; }).concat(["--wx-font", "--wx-font-head", "--wx-btn-radius", "--wx-r-lg"]);
  function fam(k) { var f = FONTS.filter(function (x) { return x[0] === k; })[0] || FONTS[0]; return '"' + f[1] + '",system-ui,' + f[2]; }
  function faces(v) { var s = ""; [v["--wx-font"], v["--wx-font-head"]].forEach(function (k) { if (FILE[k] && s.indexOf(FILE[k]) < 0) [400, 500, 600, 700].forEach(function (w) { s += '@font-face{font-family:"' + FONTS.filter(function (x) { return x[0] === k; })[0][1] + '";src:url("/assets/fonts/' + FILE[k] + "-" + w + '.woff2") format("woff2");font-weight:' + w + ";font-display:swap}"; }); }); return s; }
  function css(v) {
    return faces(v) + ":root{--wx-navy:" + v["--wx-navy"] + ";--navy:" + v["--wx-navy"] + ";--navy-2:" + v["--wx-navy"] + ";--wood:" + v["--wx-wood"] + ";--wood-2:" + v["--wx-wood"] + ";--cream:" + v["--wx-cream"] + ";--surface:" + v["--wx-cream"] + ";--beige:" + v["--wx-cream"] + ";--wx-surface:" + v["--wx-cream"] + ";--wx-beige:" + v["--wx-cream"] +
      ";--wx-paper:" + v["--wx-paper"] + ";--wx-ink:" + v["--wx-ink"] + ";--ink:" + v["--wx-ink"] + ";--wx-muted:" + v["--wx-muted"] + ";--muted:" + v["--wx-muted"] + ";--wx-font:" + fam(v["--wx-font"]) + ";--wx-font-head:" + fam(v["--wx-font-head"]) + ";--wx-btn-radius:" + v["--wx-btn-radius"] + ";--wx-r-lg:" + v["--wx-r-lg"] + "}" +
      "body,button,input,select,textarea{font-family:var(--wx-font)!important}h1,h2,h3{font-family:var(--wx-font-head,var(--wx-font))}";
  }
  W.VIEWS.theme = function (el) {
    el.innerHTML = head("Theme, colours & fonts", "Settings", "") + '<p class="muted">Loading…</p>';
    bapi("theme_get").then(function (r) {
      var all = (r && r.vars) || {}, v = Object.assign({}, PRESETS[0][3], { "--wx-btn-radius": "999px", "--wx-r-lg": "16px" });
      KEYS.forEach(function (k) { if (all[k] && (k.indexOf("font") < 0 || FONTS.some(function (f) { return f[0] === all[k]; }))) v[k] = all[k]; });
      var preset = all["--wx-preset"] || "woodex";
      el.innerHTML = head("Theme, colours & fonts", "Settings", '<button class="btn" id="th-reset">' + ic("refresh-cw") + 'Reset</button><button class="btn pri" id="th-save">' + ic("check") + "Save & publish</button>") +
        '<div class="banner">' + ic("info") + "<span>Pick a ready style or fine-tune colours and fonts. The preview updates live; press <b>Save & publish</b> to apply to every page. Fonts are stored on your server (fast, no Google calls).</span></div>" +
        '<div class="th-wrap"><div class="th-side">' +
        '<div class="card card-b"><h4 class="side-h">Ready styles</h4><div class="th-presets">' + PRESETS.map(function (p) { var c = p[3]; return '<button type="button" class="th-pre" data-p="' + p[0] + '"><span class="th-sw"><i style="background:' + c["--wx-navy"] + '"></i><i style="background:' + c["--wx-wood"] + '"></i><i style="background:' + c["--wx-cream"] + '"></i></span><b style="font-family:' + esc(fam(c["--wx-font-head"])) + '">' + esc(p[1]) + "</b><small>" + esc(p[2]) + "</small></button>"; }).join("") + "</div></div>" +
        '<div class="card card-b"><h4 class="side-h">Colours</h4>' + COLORS.map(function (c) { return '<label class="th-c"><input type="color" data-k="' + c[0] + '"><span><b>' + c[1] + "</b><small>" + c[2] + '</small></span><code data-o="' + c[0] + '"></code></label>'; }).join("") + "</div>" +
        '<div class="card card-b"><h4 class="side-h">Fonts</h4>' + [["--wx-font-head", "Headings"], ["--wx-font", "Body text"]].map(function (f) { return "<label>" + f[1] + '<select data-k="' + f[0] + '">' + FONTS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + (x[0] === "jakarta" ? " (default)" : "") + "</option>"; }).join("") + "</select></label>"; }).join("") +
        '<h4 class="side-h" style="margin-top:14px">Shape</h4><label>Button corners <select data-k="--wx-btn-radius"><option value="999px">Pill</option><option value="10px">Soft</option><option value="2px">Square</option></select></label><label>Card corners <select data-k="--wx-r-lg"><option value="16px">Rounded</option><option value="8px">Soft</option><option value="0px">Square</option></select></label></div>' +
        '</div><div class="th-main card"><div class="th-bar"><span>Live preview</span><select id="th-page"><option value="/">Home</option><option value="/about/">About</option><option value="/contact/">Contact</option><option value="/insights/">Insights</option></select><span class="th-dev"><button class="on" data-w="100%">Desktop</button><button data-w="390px">Mobile</button></span></div><div class="th-frame"><iframe id="th-if" title="Preview" src="/"></iframe></div></div></div>';
      W.fillIcons(el);
      var ifr = $("#th-if");
      function fill() { el.querySelectorAll("[data-k]").forEach(function (i) { i.value = v[i.getAttribute("data-k")]; }); el.querySelectorAll("[data-o]").forEach(function (o) { o.textContent = v[o.getAttribute("data-o")]; }); el.querySelectorAll(".th-pre").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-p") === preset); }); live(); }
      function live() { try { var d = ifr.contentDocument; if (!d || !d.head) return; var s = d.getElementById("wx-th-live"); if (!s) { s = d.createElement("style"); s.id = "wx-th-live"; d.head.appendChild(s); } s.textContent = css(v); } catch (e) {} }
      ifr.addEventListener("load", live);
      el.addEventListener("input", function (e) { var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) return; v[k] = e.target.value; preset = "custom"; fill(); });
      el.addEventListener("change", function (e) { var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) return; v[k] = e.target.value; preset = "custom"; fill(); });
      el.querySelector(".th-presets").onclick = function (e) { var b = e.target.closest(".th-pre"); if (!b) return; preset = b.getAttribute("data-p"); Object.assign(v, PRESETS.filter(function (p) { return p[0] === preset; })[0][3]); fill(); };
      $("#th-page").onchange = function () { ifr.src = this.value; };
      el.querySelector(".th-dev").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); ifr.style.width = b.getAttribute("data-w"); };
      $("#th-reset").onclick = function () { preset = "woodex"; Object.assign(v, PRESETS[0][3], { "--wx-btn-radius": "999px", "--wx-r-lg": "16px" }); fill(); toast("Woodex defaults loaded — press Save & publish"); };
      $("#th-save").onclick = function () {
        var bt = this, out = Object.assign({}, all, v, { "--wx-preset": preset }); bt.disabled = true;
        bapi("theme", { vars: out }).then(function (sr) { bt.disabled = false; if (!sr.ok) return toast(sr.error, true); all = out; toast("Theme published to every page"); });
      };
      fill();
    });
  };
})();
