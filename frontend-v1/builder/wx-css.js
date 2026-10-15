/* Shared by the builder and Woodex Admin: compile builder style data into CSS, and turn a saved block into a
   self-contained global section (<style data-wx-gcss> inside the root element). */
(function () {
  var MEDIA = { t: "@media (max-width:1024px)", m: "@media (max-width:640px)" }, PSEUDO = { h: ":hover", f: ":focus-visible", a: ":active" };
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&"); }
  function selFor(k) { var s = k.indexOf("c:") === 0 ? "." + cssEsc(k.slice(2)) : '[data-wx-s="' + k + '"]'; return s + s + s; }
  function cssFor(k, decl, ps) {
    var body = "";
    Object.keys(decl).forEach(function (p) { if (p === "css") return; var v = String(decl[p]).replace(/[{}<>;]/g, ""); if (p === "font-family" && !/,/.test(v)) v = '"' + v.replace(/"/g, "") + '",' + (/serif|Garamond|Baskerville|Playfair|Lora|Merriweather|Georgia/.test(v) && !/Sans/.test(v) ? "serif" : "sans-serif"); body += p + ":" + v + " !important;"; });
    if (decl.css) body += String(decl.css).replace(/[{}<>]/g, "");
    return body ? selFor(k) + (ps ? PSEUDO[ps] || ":hover" : "") + "{" + body + "}" : "";
  }
  function compile(styles) {
    var out = { d: "", t: "", m: "" };
    Object.keys(styles || {}).forEach(function (k) { var s = styles[k]; ["d", "t", "m"].forEach(function (dv) { if (s[dv]) out[dv] += cssFor(k, s[dv]); ["h", "f", "a"].forEach(function (ps) { if (s[dv + ps]) out[dv] += cssFor(k, s[dv + ps], ps); }); }); });
    return out.d + (out.t ? MEDIA.t + "{" + out.t + "}" : "") + (out.m ? MEDIA.m + "{" + out.m + "}" : "");
  }
  function split(html) { var m = /^\s*<!--wx-styles:([\s\S]*?)-->/.exec(html || ""), st = {}; if (m) { try { st = JSON.parse(m[1]); } catch (e) {} html = html.slice(m[0].length); } return { styles: st, html: String(html).trim() }; }
  /** block html (optionally with <!--wx-styles--> comment) -> single root element with its CSS inside */
  function globalize(html) {
    var p = split(html), t = document.createElement("template"); t.innerHTML = p.html; var root = t.content.firstElementChild; if (!root) return p.html;
    var old = root.querySelector(":scope > style[data-wx-gcss]"), css = compile(p.styles);
    if (old) { if (css) old.textContent += css; } else if (css) { var s = document.createElement("style"); s.setAttribute("data-wx-gcss", ""); s.textContent = css; root.insertBefore(s, root.firstChild); }
    root.removeAttribute("data-wx-global");
    return root.outerHTML;
  }
  window.WXCSS = { compile: compile, split: split, globalize: globalize };
})();
