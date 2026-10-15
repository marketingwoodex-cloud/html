/* Woodex runtime theme — applies the dashboard-managed theme config.
 * Brand guardrails are enforced by the dashboard: the navy (#0a0f1e),
 * button styles and logo can never be changed from here. This file only
 * applies the adjustable tokens: type scale, section spacing, radius. */
(function () {
  try {
    var t = window.WX_THEME || {};
    var css = "";
    if (t.typeScale && t.typeScale !== 100) {
      css += "html{font-size:" + (16 * t.typeScale / 100).toFixed(2) + "px;}";
    }
    if (t.sectionSpacing && t.sectionSpacing !== 100) {
      var pad = (4 * t.sectionSpacing / 100).toFixed(2);
      css += ".ct-section{padding-top:" + pad + "rem !important;padding-bottom:" + pad + "rem !important;}";
    }
    if (typeof t.cardRadius === "number") {
      css += ".ct-card,.card{border-radius:" + t.cardRadius + "px !important;}";
    }
    if (typeof t.buttonRadius === "number") {
      css += ".btn{border-radius:" + t.buttonRadius + "px !important;}";
    }
    if (typeof t.containerWidth === "number" && t.containerWidth > 0) {
      css += ".ct-wrap,.wrap,.container-fluid{max-width:" + t.containerWidth + "px !important;}";
    }
    if (css) {
      var st = document.createElement("style");
      st.id = "wx-theme-runtime";
      st.textContent = css;
      document.head.appendChild(st);
    }
  } catch (e) { /* theme is decorative; never break the page */ }
})();
