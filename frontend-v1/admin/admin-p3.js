/* Woodex Admin — Phase 3b: ready page layouts (New page → "Ready layouts") + announcement bar card in Header & footer. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, toast = W.toast;
  W.LAYOUTS = [
    ["service", "Service page", "photo hero, text + image, features, process, gallery, FAQ, call to action", ["split", "cards", "process", "gallery", "faq", "cta"]],
    ["sector", "Sector page", "hero, image + text, stats, reviews, materials, call to action", ["split-rev", "stats", "quotes", "materials", "cta"]],
    ["landing", "Landing page (ads)", "hero, trust, features, comparison, reviews, contact strip", ["trust", "cards", "compare", "quotes", "contactstrip", "cta"]],
    ["about", "About / team", "hero, story, timeline, team, client logos", ["split", "timeline", "team", "logos", "cta"]],
    ["pricing", "Packages", "hero, packages, comparison, FAQ", ["pricing", "compare", "faq", "cta"]],
    ["case", "Case study", "hero, story text, gallery, results, review", ["prose", "gallery", "stats", "quotes", "posts", "cta"]]
  ];
  W.layoutHtml = function (id, title) {
    var L = W.LAYOUTS.filter(function (l) { return l[0] === id; })[0]; if (!L) return "";
    var B = {}; (window.WX_BLOCKS || []).forEach(function (b) { B[b.id] = b.html; });
    var hero = (B.banner || "").replace(/<h2>[\s\S]*?<\/h2>/, "<h1>" + title + "</h1>").replace('<p class="wx-kicker">Featured</p>', '<p class="wx-kicker">Woodex Interior</p>').replace('class="wb-banner"', 'class="wb-banner wb-hero"');
    return hero + L[3].map(function (k) { return B[k] || ""; }).join("\n");
  };
  // ---------- announcement bar card (Header & footer screen)
  function annCard(wrap) {
    var c = document.createElement("div"); c.className = "card"; c.id = "ann-card"; c.style.marginBottom = "18px";
    c.innerHTML = '<div class="card-h"><h3>Announcement bar</h3><span class="badge" id="ann-b">Off</span></div><div class="card-b"><p class="muted" style="margin-top:0">A thin bar above the header on every page — for offers, holidays or news. Visitors can close it.</p>' +
      '<label class="check"><input type="checkbox" id="ann-on"> Show the bar</label><label>Text<input id="ann-t" maxlength="160" placeholder="e.g. Free site visit in Lahore this month"></label>' +
      '<div class="g3"><label>Link <small>(optional)</small><input id="ann-l" placeholder="/contact/"></label><label>Link text<input id="ann-lt" maxlength="40" placeholder="Book now"></label><label>Colour<select id="ann-s"><option value="navy">Navy</option><option value="wood">Wood / gold</option><option value="cream">Cream</option></select></label></div>' +
      '<p class="err" id="ann-err"></p><button class="btn pri" id="ann-go">Save & publish</button></div>';
    wrap.parentNode.insertBefore(c, wrap);
    var $ = function (s) { return c.querySelector(s); };
    function show(a) { $("#ann-on").checked = !!a.on; $("#ann-t").value = a.text || ""; $("#ann-l").value = a.link || ""; $("#ann-lt").value = a.linkText || ""; $("#ann-s").value = a.style || "navy"; var b = $("#ann-b"); b.textContent = a.on ? "Live" : "Off"; b.className = "badge" + (a.on ? " ok" : ""); }
    api("cms_announce_get").then(function (r) { if (r.ok) show(r.ann); });
    $("#ann-go").onclick = function () { var bt = this; bt.disabled = true;
      api("cms_announce_save", { ann: { on: $("#ann-on").checked, text: $("#ann-t").value.trim(), link: $("#ann-l").value.trim(), linkText: $("#ann-lt").value.trim(), style: $("#ann-s").value } }).then(function (r) {
        bt.disabled = false; $("#ann-err").textContent = r.ok ? "" : r.error; if (!r.ok) return; show(r.ann); toast(r.ann.on ? "Announcement is live on every page" : "Announcement hidden");
        var f = document.getElementById("hf-frame"); if (f) f.src = f.src; });
    };
  }
  function boot() { var v0 = document.getElementById("view"); if (!v0 || !v0.parentNode) return setTimeout(boot, 200);
    new MutationObserver(function () { var w = document.getElementById("hf-wrap"); if (w && !document.getElementById("ann-card") && (!W.can || W.can("owner,admin"))) annCard(w); }).observe(v0.parentNode, { childList: true, subtree: true }); }
  boot();
})();
