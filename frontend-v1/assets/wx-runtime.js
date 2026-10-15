/* Woodex builder runtime: scroll animations, counters, countdowns. ~1.5 KB, no dependencies. */
(function () {
  "use strict";
  var d = document, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  d.documentElement.classList.add("wx-js");
  function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }
  function counter(el) {
    var to = parseFloat(el.getAttribute("data-wx-count")) || 0, dur = +el.getAttribute("data-wx-duration") || 1600, dec = (String(to).split(".")[1] || "").length, t0 = null;
    if (reduce) { el.textContent = to.toLocaleString(undefined, { minimumFractionDigits: dec }); return; }
    function step(t) { t0 = t0 || t; var p = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - p, 3)); el.textContent = v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (!e.isIntersecting) return; var el = e.target; io.unobserve(el); if (el.hasAttribute("data-wx-count")) counter(el); else el.classList.add("wx-in"); });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }) : null;
  each("[data-wx-anim]", function (el) {
    var dl = el.getAttribute("data-wx-delay"), du = el.getAttribute("data-wx-dur");
    if (dl) el.style.transitionDelay = dl + "ms"; if (du) el.style.transitionDuration = du + "ms";
    io && !reduce ? io.observe(el) : el.classList.add("wx-in");
  });
  each("[data-wx-count]", function (el) { io ? io.observe(el) : counter(el); });
  each("[data-wx-countdown]", function (el) {
    var end = Date.parse(el.getAttribute("data-wx-countdown")), parts = el.querySelectorAll("[data-u]");
    function tick() {
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000)), v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      Array.prototype.forEach.call(parts, function (p) { p.textContent = String(v[p.getAttribute("data-u")]).padStart(2, "0"); });
      if (s > 0) setTimeout(tick, 1000);
    }
    if (!isNaN(end)) tick();
  });
})();
