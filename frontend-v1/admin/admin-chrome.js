/* Woodex Admin — Phase 4: Header · Mega menu · Footer editor with live preview,
   Preview → Publish, and the last 10 published versions with one-click restore.
   Replaces the older "Main menu" view (Find & replace is kept). Owner/Admin only. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, head = W.head;
  var A = function (s) { return esc(s == null ? "" : String(s)); };
  var arr = function (l) { return Array.prototype.slice.call(l || []); };
  var linkOf = function (a) { return { label: a.textContent.trim(), href: a.getAttribute("href") || "", route: a.getAttribute("data-page-route") || "", id: a.id || "", ext: a.getAttribute("target") === "_blank" }; };
  var aTag = function (l, cls) {
    return "<a" + (cls ? ' class="' + cls + '"' : "") + (l.id ? ' id="' + A(l.id) + '"' : "") + ' href="' + A(l.href) + '"' + (l.route ? ' data-page-route="' + A(l.route) + '"' : "") + (l.ext ? ' target="_blank" rel="noopener"' : "") + ">" + A(l.label) + "</a>";
  };


  // ------------------------------------------------------------------ P17 C3: design (colours, layout presets, logo size, phone, behaviour)
  var DDEF = { hStyle: "pill", hBg: "#ffffff", hAlpha: 76, hText: "#0c1628", hAccent: "#0c1628", hAccentText: "#ffffff", ctaStyle: "solid", ctaShow: true,
    hHeight: 68, logo: 42, logoTone: "dark", word: true, behave: "hide", menuAlign: "center", phone: "", phoneShow: false,
    fBg: "#0c1628", fText: "#ffffff", fHead: "#ffffff", fLink: "#b8956a", fLine: false, fPad: "normal", fWord: true,
    mStyle: "auto", mBg: "#ffffff", mText: "#0c1628", mAccent: "#b8956a" }; /* P18 B: mega menu colours */
  var DPRESETS = {
    "Woodex glass (current)": {},
    "Navy bar": { hStyle: "bar", hBg: "#0c1628", hAlpha: 100, hText: "#ffffff", hAccent: "#b8956a", hAccentText: "#0c1628", logoTone: "light", behave: "sticky", hHeight: 72 },
    "Cream classic": { hStyle: "solid", hBg: "#f4efe7", hAlpha: 100, hText: "#0c1628", hAccent: "#b8956a", hAccentText: "#ffffff", fBg: "#f4efe7", fText: "#0c1628", fHead: "#0c1628", fLink: "#8a6a43", fLine: true },
    "Minimal white": { hStyle: "bar", hBg: "#ffffff", hAlpha: 100, ctaStyle: "outline", behave: "sticky", menuAlign: "right", fBg: "#ffffff", fText: "#0c1628", fHead: "#0c1628", fLink: "#b8956a", fLine: true, fPad: "compact", fWord: false },
    "Luxury dark + gold": { hStyle: "pill", hBg: "#0c1628", hAlpha: 88, hText: "#ffffff", hAccent: "#b8956a", hAccentText: "#0c1628", logoTone: "light", fBg: "#0a1120", fLink: "#d8b98a", fLine: true }
  };
  var dfix = function (G) { var o = {}; for (var k in DDEF) o[k] = G && G[k] != null && typeof G[k] === typeof DDEF[k] ? G[k] : DDEF[k]; o.hAlpha = Math.max(30, Math.min(100, +o.hAlpha || 76)); o.hHeight = Math.max(52, Math.min(96, +o.hHeight || 68)); o.logo = Math.max(24, Math.min(90, +o.logo || 42)); ["hBg", "hText", "hAccent", "hAccentText", "fBg", "fText", "fHead", "fLink", "mBg", "mText", "mAccent"].forEach(function (k) { if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DDEF[k]; }); o.phone = String(o.phone).replace(/[^\d+ ()-]/g, "").slice(0, 24); return o; };
  var rgba = function (hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + (a / 100) + ")"; };
  var lumOf = function (hex) { var n = parseInt(hex.slice(1), 16), f = function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(n >> 16) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
  var contrast = function (a, b) { var x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  var autoText = function (bg) { return contrast("#0c1628", bg) >= contrast("#ffffff", bg) ? "#0c1628" : "#ffffff"; };
  /** mega panel colours: auto = follow header background (if changed) with auto text; light/dark presets; custom = owner's choice */
  function megaColors(G) {
    var st = G.mStyle || "auto", bg, text, a = G.hAlpha;
    if (st === "light") { bg = "#ffffff"; text = "#0c1628"; a = 100; }
    else if (st === "dark") { bg = "#0c1628"; text = "#ffffff"; a = 100; }
    else if (st === "custom") { bg = G.mBg; text = G.mText; a = 100; }
    else { bg = G.hBg !== DDEF.hBg ? G.hBg : "#ffffff"; text = autoText(bg); a = Math.max(92, G.hAlpha); }
    var custom = st !== "auto" || G.hBg !== DDEF.hBg || G.hText !== DDEF.hText || G.mAccent !== DDEF.mAccent;
    return { bg: bg, text: text, accent: G.mAccent, bgCss: rgba(bg, a), custom: custom, ratio: contrast(text, bg) };
  }
  function designCss(G) {
    G = dfix(G); var d = function (k) { return G[k] !== DDEF[k]; }, H = "html body:not(#x) .site-header", c = [], dk = [];
    if (G.hStyle === "bar") c.push(H + "{top:0;width:100%;border-radius:0;border-width:0 0 1px;box-shadow:0 6px 24px rgba(12,22,40,.08)}" + H + ".mega-active{border-radius:0}");
    if (G.hStyle === "solid" || G.hAlpha >= 100) c.push(H + "{-webkit-backdrop-filter:none;backdrop-filter:none}");
    if (d("hBg") || d("hAlpha") || G.hStyle !== "pill") c.push(H + "," + H + ".mega-active{background:" + rgba(G.hBg, G.hStyle === "solid" ? 100 : G.hAlpha) + "}");
    // P18 B: mega menu + mobile panel get their own colours; text always readable on its background
    var MC = megaColors(G);
    if (MC.custom) c.push(H + " .mega-menu{background:" + MC.bgCss + ";color:" + MC.text + "}" + H + " .mega-column a," + H + " .mega-column .mega-title," + H + " .mega-column p{color:" + MC.text + "}" +
      H + " .mega-column a:hover," + H + " .mega-column .mega-title:hover{color:" + MC.accent + "}" + H + " .mega-number{color:" + MC.accent + "!important}" + H + " .mega-column{border-color:" + rgba(MC.text, 14) + "}" + H + " .mega-menu{border-color:" + rgba(MC.text, 14) + "}");
    if (d("hBg") || d("hText")) { var mb = d("hBg") ? G.hBg : "#ffffff", mt = contrast(G.hText, mb) >= 3 ? G.hText : autoText(mb);
      c.push("html body:not(#x) .mobile-panel{background:" + rgba(mb, Math.max(94, G.hAlpha)) + "}html body:not(#x) .mobile-panel a:not(.mobile-primary){color:" + mt + "}"); }
    if (d("hText")) c.push(H + " .desktop-nav>a," + H + " .nav-services-trigger," + H + " .brand-wordmark," + H + " .brand-wordmark small{color:" + G.hText + "}" + H + " .menu-toggle span,"+ H + " .menu-toggle span:before," + H + " .menu-toggle span:after{background:" + G.hText + "}" + H + " .brand-divider{background:" + rgba(G.hText, 30) + "}");
    if (G.ctaStyle === "outline") c.push(H + " .header-cta,html body:not(#x) #header-cta{background:transparent!important;color:" + G.hAccent + "!important;border:1.5px solid " + G.hAccent + "!important}");
    else if (d("hAccent") || d("hAccentText")) c.push(H + " .header-cta,html body:not(#x) #header-cta{background:" + G.hAccent + "!important;border-color:" + G.hAccent + "!important;color:" + G.hAccentText + "!important}");
    if (!G.ctaShow) c.push(H + " .header-cta{display:none}");
    if (G.logoTone === "light") c.push(H + " .brand-mark{filter:brightness(0) invert(1)}");
    if (!G.word) c.push(H + " .brand-divider," + H + " .brand-wordmark{display:none}");
    if (d("logo")) c.push(H + " .brand-mark{width:" + G.logo + "px;height:" + Math.round(G.logo * .72) + "px;flex-basis:" + G.logo + "px}");
    if (d("hHeight")) dk.push(H + "{height:" + G.hHeight + "px}");
    if (G.menuAlign !== "center") dk.push(H + " .desktop-nav{justify-content:" + (G.menuAlign === "right" ? "flex-end" : "flex-start") + "}");
    if (G.behave !== "hide") c.push(H + ".is-hidden{transform:translateX(-50%);opacity:1;pointer-events:auto}");
    if (G.behave === "static") c.push(H + "{position:absolute}");
    if (G.phoneShow && G.phone) { dk.push(H + "{grid-template-columns:auto 1fr auto auto}"); c.push(".wx-hphone{display:inline-flex;align-items:center;gap:6px;color:" + G.hText + ";text-decoration:none;font-weight:600;font-size:.9rem;white-space:nowrap}.wx-hphone svg{width:16px;height:16px}@media(max-width:1100px){.wx-hphone{display:none}}"); }
    var F = "html body:not(#x) .footer";
    if (d("fBg")) c.push(F + "{background:" + G.fBg + "}");
    if (d("fText")) c.push(F + "," + F + " a," + F + " p," + F + " address," + F + " .footer-bottom{color:" + G.fText + "}" + F + "{border-top-color:" + rgba(G.fText, 15) + "}" + F + " .footer-word{color:" + rgba(G.fText, 8) + "}");
    if (d("fHead")) c.push(F + " h2," + F + " h3{color:" + G.fHead + "}");
    if (d("fLink")) c.push(F + " a:hover{color:" + G.fLink + "}" + F + " .footer-cta{background:" + G.fLink + ";border-color:" + G.fLink + ";color:" + G.fBg + "}");
    if (G.fLine) c.push(F + "{border-top:3px solid " + G.fLink + "}");
    if (G.fPad !== "normal") c.push(F + "{padding-top:" + (G.fPad === "compact" ? 48 : 120) + "px}");
    if (!G.fWord) c.push(F + " .footer-word{display:none}");
    if (dk.length) c.push("@media(min-width:1001px){" + dk.join("") + "}");
    return c.join("");
  }
  var designTag = function (G) { var css = designCss(G); return css ? '<style id="wx-chrome-style" data-cfg="' + A(JSON.stringify(dfix(G))) + '">' + css + "</style>" : ""; };
  var phoneHtml = function (G) { G = dfix(G); return G.phoneShow && G.phone ? '<a class="wx-hphone" href="tel:' + A(G.phone.replace(/[^\d+]/g, "")) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>' + A(G.phone) + "</a>" : ""; };
  W.__wxChrome = { designCss: designCss, dfix: dfix, presets: DPRESETS, megaColors: megaColors, contrast: contrast };

  // ------------------------------------------------------------------ parse home page → editable data
  function parse(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var nav = doc.querySelector("nav.desktop-nav"), mob = doc.querySelector("nav.mobile-panel"), foot = doc.querySelector("footer.footer"), brand = doc.querySelector("header a.brand"), cta = doc.querySelector(".header-cta-label");
    if (!nav || !mob || !foot || !brand) return null;
    var D = { v: 1, menu: { items: [], mobile: [] }, mega: null, header: {}, footer: {} };
    arr(nav.children).forEach(function (n) {
      if (n.tagName === "A") D.menu.items.push({ type: "link", label: n.textContent.trim(), href: n.getAttribute("href"), route: n.getAttribute("data-page-route") || "", id: n.id || "" });
      else if (n.classList.contains("nav-services")) {
        var trig = n.querySelector(".nav-services-trigger"), st = n.querySelector(".mega-studio"), pj = n.querySelector(".mega-project"), im = pj && pj.querySelector("img"), sp = pj && pj.querySelector("span");
        D.menu.items.push({ type: "mega", label: trig ? trig.childNodes[0].textContent.trim() : "Services" });
        D.mega = {
          cols: arr(n.querySelectorAll(".mega-column")).map(function (c) {
            var t = c.querySelector(".mega-title");
            return { title: t.textContent.trim(), href: t.getAttribute("href"), route: t.getAttribute("data-page-route") || "", links: arr(c.querySelectorAll("a")).filter(function (a) { return a !== t; }).map(linkOf) };
          }),
          studio: st ? linkOf(st) : { label: "", href: "" },
          card: { href: pj ? pj.getAttribute("href") : "/projects/", img: im ? im.getAttribute("src") : "", alt: im ? im.getAttribute("alt") : "", text: sp ? sp.textContent.trim() : "", w: im ? im.getAttribute("width") : "", h: im ? im.getAttribute("height") : "", srcset: im ? im.getAttribute("srcset") || "" : "", sizes: im ? im.getAttribute("sizes") || "" : "" }
        };
      }
    });
    arr(mob.querySelectorAll("a")).forEach(function (a) { D.menu.mobile.push({ label: a.textContent.trim(), href: a.getAttribute("href"), primary: a.classList.contains("mobile-primary") }); });
    var bi = brand.querySelector("img"), wm = brand.querySelector(".brand-wordmark"), sm = wm && wm.querySelector("small");
    D.header = { logo: bi ? bi.getAttribute("src") : "", lw: bi ? bi.getAttribute("width") : "", lh: bi ? bi.getAttribute("height") : "", word: wm ? wm.childNodes[0].textContent.trim() : "", small: sm ? sm.textContent.trim() : "", aria: brand.getAttribute("aria-label") || "", cta: cta ? cta.textContent.trim() : "Get a quote" };
    var h2 = foot.querySelector("#footer-heading"), fp = foot.querySelector("#footer-copy"), fc = foot.querySelector("#footer-cta"), ct = foot.querySelector(".footer-contact");
    var tels = [], email = "", wa = { label: "", href: "" }; var vs = foot.querySelector(".footer-visit");
    var ntx = function (el) { var c = el.cloneNode(true); arr(c.querySelectorAll(".fl")).forEach(function (x) { x.remove(); }); return c.textContent.trim(); };
    arr(ct ? ct.querySelectorAll(":scope > a") : []).forEach(function (a) { var h = a.getAttribute("href") || ""; if (/^mailto:/.test(h)) email = h.slice(7); else if (/wa\.me/.test(h)) wa = { label: ntx(a), href: h }; else if (/^tel:/.test(h)) tels.push(ntx(a)); });
    if (!wa.href) { var swa = foot.querySelector('.footer-social a[href*="wa.me"]'); if (swa) wa = { label: tels[0] || "WhatsApp", href: swa.getAttribute("href") }; }
    var bot = foot.querySelector(".footer-bottom");
    D.footer = {
      heading: h2 ? h2.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "") : "", copy: fp ? fp.textContent.trim() : "", ctaLabel: fc ? fc.textContent.trim() : "", ctaHref: fc ? fc.getAttribute("href") : "/contact/",
      cols: arr(foot.querySelectorAll("nav.footer-column")).map(function (n) { var t = n.querySelector("h3"); return { title: t ? t.textContent.trim() : "", links: arr(n.querySelectorAll("a")).map(linkOf) }; }),
      contact: { title: ct && ct.querySelector("h3") ? ct.querySelector("h3").textContent.trim() : "Get in touch", email: email, waLabel: wa.label, waHref: wa.href, tels: tels.join("\n"),
        address: (vs || ct) && (vs || ct).querySelector("address") ? (vs || ct).querySelector("address").innerHTML.replace(/<span class="fl"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : "", hours: (vs || ct) && (vs || ct).querySelector("p") ? (vs || ct).querySelector("p").textContent.trim() : "", visitTitle: vs && vs.querySelector("h3") ? vs.querySelector("h3").textContent.trim() : "Visit us" },
      social: !!foot.querySelector(".footer-social") || !foot.querySelector(".footer-intro"),
      socX: arr(foot.querySelectorAll(".footer-social a[data-soc]")).map(function (x) { return x.outerHTML; }).join(""),
      word: (foot.querySelector(".footer-word") || {}).textContent || "",
      copyright: bot && bot.querySelector("span") ? bot.querySelector("span").textContent.trim() : "",
      bottom: arr(bot ? bot.querySelectorAll("div a") : []).map(linkOf),
      introAll: false
    };
    var st = doc.getElementById("wx-chrome-style"), cfg = null; try { cfg = st && JSON.parse(st.getAttribute("data-cfg") || "null"); } catch (e) {}
    D.design = dfix(cfg);
    return D;
  }

  // ------------------------------------------------------------------ build HTML from data
  function build(D) {
    var M = D.menu, G = D.mega, H = D.header, F = D.footer;
    var megaHtml = function (label) {
      return '      <div class="nav-services">\n        <a class="nav-services-trigger" href="/services/" aria-haspopup="true" aria-controls="services-menu">' + A(label) + ' <span aria-hidden="true">⌄</span></a>\n        <div class="mega-menu" id="services-menu"' + (G.cols.length !== 4 ? ' data-cols="' + G.cols.length + '"' : "") + ">\n" +
        G.cols.map(function (c, ci) { return '          <div class="mega-column"><span class="mega-number">' + String(ci + 1).padStart(2, "0") + '</span><a class="mega-title" href="' + A(c.href) + '"' + (c.route ? ' data-page-route="' + A(c.route) + '"' : "") + ">" + A(c.title) + "</a>" + c.links.map(function (l) { return aTag(l); }).join("") + "</div>\n"; }).join("") +
        '          <div class="mega-feature">' + (G.studio.label ? aTag(G.studio, "mega-studio") : "") + '<a class="mega-project" href="' + A(G.card.href) + '"><img' + (G.card.srcset && G.card.srcset.indexOf(G.card.img) >= 0 ? ' sizes="' + A(G.card.sizes || "50vw") + '" srcset="' + A(G.card.srcset) + '"' : "") + ' loading="lazy" decoding="async" src="' + A(G.card.img) + '" alt="' + A(G.card.alt) + '"' + (G.card.w ? ' width="' + A(G.card.w) + '" height="' + A(G.card.h) + '"' : "") + "><span>" + A(G.card.text) + "</span></a></div>\n        </div>\n      </div>";
    };
    var desktop = '<nav class="desktop-nav" aria-label="Page navigation">\n' + M.items.map(function (it) {
      return it.type === "mega" ? megaHtml(it.label) : "      " + aTag(it);
    }).join("\n") + "\n    </nav>";
    var mobile = '<nav class="mobile-panel" id="mobile-menu" aria-label="Mobile navigation">' + M.mobile.map(function (l) { return "<a" + (l.primary ? ' class="mobile-primary"' : "") + ' href="' + A(l.href) + '">' + A(l.label) + "</a>"; }).join("") + "</nav>";
    var brand = '<a class="brand" href="/" data-page-route="home" aria-label="' + A(H.aria || "Woodex Interior home") + '"><img class="brand-mark" src="' + A(H.logo) + '" alt=""' + (H.lw ? ' width="' + A(H.lw) + '" height="' + A(H.lh) + '"' : "") + '><span class="brand-divider" aria-hidden="true"></span><span class="brand-wordmark">' + A(H.word) + (H.small ? " <small>" + A(H.small) + "</small>" : "") + "</span></a>";
    var C = F.contact, nl = function (s) { return String(s || "").split("\n").map(function (x) { return A(x.trim()); }).filter(Boolean).join("<br>"); };
    var ico = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; };
    var firstTel = String(C.tels || "").split("\n").map(function (t) { return t.trim(); }).filter(Boolean)[0] || "";
    var social = F.social === false ? "" : '<div class="footer-social" aria-label="Contact Woodex">' +
      (C.waHref ? '<a href="' + A(C.waHref) + '" aria-label="WhatsApp">' + ico("M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2-1-1 .8a4.5 4.5 0 0 1-2.2-2.2l.8-1-1-2z") + "</a>" : "") +
      (firstTel ? '<a href="tel:' + A(firstTel.replace(/[^\d+]/g, "")) + '" aria-label="Call">' + ico("M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2") + "</a>" : "") +
      (C.email ? '<a href="mailto:' + A(C.email) + '" aria-label="Email">' + ico("M3 6h18v12H3z M3 7l9 6 9-6") + "</a>" : "") +
      (C.address ? '<a href="https://www.google.com/maps/search/?api=1&amp;query=' + A(encodeURIComponent(String(C.address).replace(/\n/g, ", "))) + '" target="_blank" rel="noopener" aria-label="Map">' + ico("M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5") + "</a>" : "") + "</div>";
    if (social && F.socX) social = social.replace(/<\/div>\s*$/, F.socX + "</div>");
    var fbrand = '<a class="footer-brand" href="/" aria-label="' + A(H.aria || "Woodex Interior home") + '"><img src="' + A(H.logo) + '" alt="" width="78" height="48"><span>' + A(H.word) + (H.small ? " <small>" + A(H.small) + "</small>" : "") + "</span></a>";
    var footer = '<footer class="footer"><div class="wrap">\n    <div class="footer-main">\n      <div class="footer-intro">' + fbrand + '<h2 id="footer-heading">' + nl(F.heading) + '</h2><p id="footer-copy">' + A(F.copy) + "</p>" + social + (String(F.ctaLabel || "").trim() ? '<a class="btn footer-cta" id="footer-cta" href="' + A(F.ctaHref) + '">' + A(F.ctaLabel) + "</a>" : "") + "</div>\n" +
      F.cols.map(function (c) { return '      <nav class="footer-column" aria-label="' + A(c.title) + ' links"><h3>' + A(c.title) + "</h3>" + c.links.map(function (l) { return aTag(l); }).join("") + "</nav>\n"; }).join("") +
      '      <div class="footer-column footer-contact"><h3>' + A(C.title) + "</h3>" + (C.email ? '<a href="mailto:' + A(C.email) + '"><span class="fl" aria-hidden="true">E</span>' + A(C.email) + "</a>" : "") +
      String(C.tels || "").split("\n").map(function (t) { t = t.trim(); return t ? '<a href="tel:' + A(t.replace(/[^\d+]/g, "")) + '"><span class="fl" aria-hidden="true">P</span>' + A(t) + "</a>" : ""; }).join("") +
      (C.address ? '<address><span class="fl" aria-hidden="true">L</span><a href="https://www.google.com/maps/search/?api=1&amp;query=' + A(encodeURIComponent(String(C.address).replace(/\n/g, ", "))) + '" target="_blank" rel="noopener">' + nl(C.address) + "</a></address>" : "") +
      (C.hours ? "<p><strong>" + A(C.hours) + "</strong></p>" : "") + "</div>\n" + "    </div>\n" +
      (F.word.trim() ? '    <div class="footer-word" aria-label="' + A(F.word.trim()) + '">' + A(F.word.trim()) + "</div>\n" : "") +
      '    <div class="footer-bottom"><span>' + A(F.copyright) + "</span><div>" + F.bottom.map(function (l) { return aTag(l); }).join("") + "</div></div>\n  </div></footer>";
    return { desktop: desktop, mobile: mobile, brand: brand, cta: H.cta, footer: footer, style: designTag(D.design), phone: phoneHtml(D.design) };
  }

  // ------------------------------------------------------------------ validation
  function problems(D) {
    var bad = [], chk = function (l, where) { if (!String(l.label || "").trim() || !String(l.href || "").trim()) bad.push(where); };
    D.menu.items.forEach(function (it, i) { if (it.type === "link") chk(it, "Header menu link " + (i + 1)); else if (!String(it.label).trim()) bad.push("Mega menu button name"); });
    D.menu.mobile.forEach(function (l, i) { chk(l, "Mobile menu link " + (i + 1)); });
    if (D.mega) {
      if (D.mega.cols.length < 2 || D.mega.cols.length > 5) bad.push("Mega menu needs 2–5 columns");
      D.mega.cols.forEach(function (c, ci) { chk({ label: c.title, href: c.href }, "Mega column " + (ci + 1) + " heading"); c.links.forEach(function (l, li) { chk(l, "Mega column " + (ci + 1) + " link " + (li + 1)); }); });
      if (!D.mega.card.img) bad.push("Mega feature card image");
    }
    if (!D.header.logo) bad.push("Logo image");
    if (!String(D.header.cta).trim()) bad.push("Header button text");
    D.footer.cols.forEach(function (c, ci) { c.links.forEach(function (l, li) { chk(l, "Footer column " + (ci + 1) + " link " + (li + 1)); }); });
    D.footer.bottom.forEach(function (l, i) { chk(l, "Footer bottom link " + (i + 1)); });
    return bad;
  }

  // ------------------------------------------------------------------ view
  W.VIEWS.global = function (el) {
    el.innerHTML = head("Header & footer", "Header & footer") +
      '<div class="toolbar" style="margin-bottom:18px;flex-wrap:wrap"><button class="btn pri" data-gt="header">Header</button><button class="btn" data-gt="mega">Mega menu</button><button class="btn" data-gt="footer">Footer</button><button class="btn" data-gt="design">' + ic("layers") + 'Design</button><button class="btn" data-gt="versions">' + ic("history") + 'Versions</button><button class="btn" data-gt="replace">Find & replace</button>' +
      '<span style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="hf-export" title="Download header & footer as a file">' + ic("download") + 'Export</button><button class="btn" id="hf-import" title="Load a header & footer file">' + ic("upload") + 'Import</button><span class="badge gold" id="hf-dirty" hidden>Unpublished changes</span><button class="btn" id="hf-undo" title="Undo (Ctrl+Z)" disabled>↶ Undo</button><button class="btn" id="hf-discard">Discard changes</button><button class="btn pri" id="hf-publish">' + ic("upload") + 'Publish to all pages</button></span></div>' +
      '<div id="hf-wrap" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:20px;align-items:start"><div id="hf-body" style="min-width:0"><div class="empty">Loading…</div></div>' +
      '<div class="card" id="hf-prev" style="position:sticky;top:12px"><div class="card-h"><h3>Live preview</h3><span class="toolbar"><button class="btn sm pri" data-dev="d">Desktop</button><button class="btn sm" data-dev="m">Mobile</button><button class="btn sm" id="hf-mega">Show mega menu</button><button class="btn sm" id="hf-foot">Jump to footer</button></span></div>' +
      '<div class="card-b" style="padding:10px;background:var(--bg)"><div id="hf-frame-box" style="overflow:hidden;border-radius:10px;height:640px;position:relative"><iframe id="hf-frame" src="/" title="Preview" style="border:0;background:#fff;transform-origin:0 0"></iframe></div><p class="muted" style="margin:8px 0 0;font-size:12px">Preview only — nothing is live until you press <b>Publish</b>.</p></div></div></div>';
    W.fillIcons && W.fillIcons(el);
    var body = $("#hf-body"), frame = $("#hf-frame"), box = $("#hf-frame-box"), tab = "header", dev = "d", D = null, orig = "", S = W.S || {};
    var pagesDl = function () { return "<datalist id='hf-pages'>" + ((W.S && W.S.pages) || []).map(function (p) { return "<option value='" + A(p.url) + "'>" + A(p.title) + "</option>"; }).join("") + "</datalist>"; };

    // ---- preview
    var size = function () {
      var w = box.clientWidth, vw = dev === "d" ? 1366 : 390, sc = Math.min(1, w / vw);
      frame.style.width = vw + "px"; frame.style.height = 640 / sc + "px"; frame.style.transform = "scale(" + sc + ")";
      if (dev === "m") { frame.style.marginLeft = Math.max(0, (w - vw) / 2) + "px"; } else frame.style.marginLeft = "0";
    };
    var fdoc = function () { try { return frame.contentDocument; } catch (e) { return null; } };
    var swap = function (d, sel, html) { var n = d.querySelector(sel); if (!n) return; var t = d.createElement("div"); t.innerHTML = html; if (t.firstElementChild) n.replaceWith(t.firstElementChild); };
    var timer = 0;
    var paint = function () { if (typeof mark === "function") setTimeout(mark, 0);
      clearTimeout(timer); timer = setTimeout(function () {
        var d = fdoc(); if (!d || !D || !d.querySelector("footer.footer")) return;
        var h = build(D), mOpen = !!d.querySelector(".mega-menu.open");
        swap(d, "nav.desktop-nav", h.desktop); swap(d, "nav.mobile-panel", h.mobile); swap(d, "header a.brand", h.brand); swap(d, "footer.footer", h.footer);
        var l = d.querySelector(".header-cta-label"); if (l) l.textContent = h.cta;
        var os = d.getElementById("wx-chrome-style"); if (os) os.remove(); if (h.style) { var t2 = d.createElement("div"); t2.innerHTML = h.style; d.head.appendChild(t2.firstChild); }
        var op = d.querySelector(".wx-hphone"); if (op) op.remove(); var hc = d.querySelector(".site-header .header-cta"); if (h.phone && hc) { var t3 = d.createElement("div"); t3.innerHTML = h.phone; hc.parentNode.insertBefore(t3.firstChild, hc); }
        if (mOpen || tab === "mega") { var mm = d.querySelector(".mega-menu"); if (mm) mm.classList.add("open"); }
        var cb = d.getElementById("menu-cb"); if (cb) cb.checked = dev === "m" && (tab === "header");
      }, 120);
    };
    frame.addEventListener("load", function () { size(); paint(); });
    window.addEventListener("resize", size);
    $$("[data-dev]").forEach(function (b) { b.onclick = function () { dev = b.dataset.dev; $$("[data-dev]").forEach(function (x) { x.classList.toggle("pri", x === b); }); size(); paint(); }; });
    $("#hf-mega").onclick = function () { var d = fdoc(), mm = d && d.querySelector(".mega-menu"); if (mm) { mm.classList.toggle("open"); d.defaultView.scrollTo(0, 0); } };
    $("#hf-foot").onclick = function () { var d = fdoc(), f = d && d.querySelector("footer.footer"); if (f) f.scrollIntoView(); };

    // ---- field helpers
    var inp = function (p, v, ph, extra) { return "<input data-p='" + p + "' value='" + A(v) + "' placeholder='" + A(ph || "") + "' " + (extra || "") + " style='margin:0'>"; };
    var area = function (p, v, rows) { return "<textarea data-p='" + p + "' rows='" + (rows || 3) + "' style='margin:0'>" + A(v) + "</textarea>"; };
    var fld = function (label, html) { return "<label style='display:block;margin-bottom:10px'><small class='muted'>" + label + "</small>" + html + "</label>"; };
    var grip = "<span class='hf-grip' title='Drag to reorder'>⋮⋮</span>";
    var ctl = function (p) { return "<span style='display:flex;gap:4px;align-items:center'>" + grip + "<button class='btn sm' data-mv='" + p + "|-1' title='Move up'>↑</button><button class='btn sm' data-mv='" + p + "|1' title='Move down'>↓</button><button class='btn sm danger' data-rm='" + p + "' title='Remove'>✕</button></span>"; };
    var row = function (p, o, extra) { return "<div style='display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px'>" + inp(p + ".label", o.label, "Label") + inp(p + ".href", o.href, "/page/", "list='hf-pages'") + "<span style='display:flex;gap:4px;align-items:center'>" + (extra || "") + ctl(p) + "</span></div>"; };
    var card = function (title, inner, btn) { return '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + title + "</h3>" + (btn || "") + '</div><div class="card-b">' + inner + "</div></div>"; };
    var addBtn = function (id, label) { return "<button class='btn sm' data-add='" + id + "'>" + ic("plus") + (label || "Link") + "</button>"; };
    var imgPick = function (p, v) { return "<div style='display:flex;gap:8px;align-items:center'>" + (v ? "<img src='" + A(v) + "' style='width:64px;height:44px;object-fit:cover;border-radius:6px;background:#eee'>" : "") + inp(p, v, "/assets/img/…") + "<button class='btn sm' data-pick='" + p + "'>" + ic("image") + "Choose</button></div>"; };

    var draw = function () {
      if (tab === "replace") { $("#hf-wrap").style.gridTemplateColumns = "1fr"; $("#hf-prev").style.display = "none"; return W.replaceTool ? W.replaceTool(body) : (body.innerHTML = '<div class="empty">Find & replace is unavailable.</div>'); }
      $("#hf-wrap").style.gridTemplateColumns = "minmax(0,1fr) minmax(0,1.2fr)"; $("#hf-prev").style.display = "";
      if (!D) return;
      var h = pagesDl();
      if (tab === "header") {
        h += card("Logo", fld("Logo image", imgPick("header.logo", D.header.logo)) + "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + fld("Name", inp("header.word", D.header.word)) + fld("Small text", inp("header.small", D.header.small)) + "</div>");
        h += card("Header button", fld("Button text (each page keeps its own button link)", inp("header.cta", D.header.cta, "Get a quote", "maxlength='40'")));
        h += card("Menu links", D.menu.items.map(function (it, i) {
          if (it.type === "mega") return "<div style='display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;margin-bottom:6px'><span class='badge gold'>Mega menu</span>" + inp("menu.items." + i + ".label", it.label, "Services") + "<span style='display:flex;gap:4px;align-items:center'>" + grip + "<button class='btn sm' data-mv='menu.items." + i + "|-1'>↑</button><button class='btn sm' data-mv='menu.items." + i + "|1'>↓</button><button class='btn sm' data-go='mega'>Edit</button></span></div>";
          return row("menu.items." + i, it);
        }).join(""), addBtn("menu.items"));
        h += card("Mobile menu", D.menu.mobile.map(function (l, i) { return row("menu.mobile." + i, l, "<label class='check' style='margin:0 4px 0 0;font-size:12px' title='Show as the gold button (keeps each page’s own link)'><input type='checkbox' data-pc='menu.mobile." + i + ".primary'" + (l.primary ? " checked" : "") + ">Button</label>"); }).join(""), addBtn("menu.mobile"));
      } else if (tab === "mega") {
        if (!D.mega) h += '<div class="empty">This site has no mega menu.</div>';
        else {
          h += '<p class="muted" style="margin:0 0 12px">' + D.mega.cols.length + " of 5 columns · minimum 2. The preview keeps the mega menu open while you edit.</p>";
          h += D.mega.cols.map(function (c, ci) {
            var b = "mega.cols." + ci;
            return card("Column " + (ci + 1), "<div style='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px'>" + inp(b + ".title", c.title, "Heading") + inp(b + ".href", c.href, "/page/", "list='hf-pages'") + "</div>" + c.links.map(function (l, li) { return row(b + ".links." + li, l); }).join("") + addBtn(b + ".links"),
              "<span style='display:flex;gap:4px;align-items:center'>" + grip + "<button class='btn sm' data-mv='mega.cols." + ci + "|-1'>←</button><button class='btn sm' data-mv='mega.cols." + ci + "|1'>→</button>" + (D.mega.cols.length > 2 ? "<button class='btn sm danger' data-rm='mega.cols." + ci + "'>Remove column</button>" : "") + "</span>");
          }).join("");
          if (D.mega.cols.length < 5) h += "<button class='btn' data-add='mega.cols' style='margin-bottom:16px'>" + ic("plus") + "Add column</button>";
          h += card("Feature card", "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + fld("Top link text", inp("mega.studio.label", D.mega.studio.label)) + fld("Top link address", inp("mega.studio.href", D.mega.studio.href, "", "list='hf-pages'")) + "</div>" +
            fld("Image", imgPick("mega.card.img", D.mega.card.img)) + fld("Image description (alt)", inp("mega.card.alt", D.mega.card.alt)) +
            "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + fld("Caption", inp("mega.card.text", D.mega.card.text)) + fld("Card link", inp("mega.card.href", D.mega.card.href, "", "list='hf-pages'")) + "</div>");
        }
      } else if (tab === "footer") {
        var F = D.footer;
        h += card("Intro", fld("Heading (new line = line break)", area("footer.heading", F.heading, 2)) + fld("Text", area("footer.copy", F.copy, 2)) + "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + fld("Button text (empty = no button)", inp("footer.ctaLabel", F.ctaLabel)) + fld("Button link", inp("footer.ctaHref", F.ctaHref, "", "list='hf-pages'")) + "</div>" +
          "<label class='check'><input type='checkbox' data-pc='footer.social'" + (F.social !== false ? " checked" : "") + "> Show contact icons (WhatsApp, call, email, map) under the text</label>" + "<label class='check'><input type='checkbox' data-pc='footer.introAll'" + (F.introAll ? " checked" : "") + "> Use this intro on <b>all</b> pages <span class='muted'>(off = service pages keep their own heading &amp; button)</span></label>");
        h += F.cols.map(function (c, ci) { var b = "footer.cols." + ci; return card("Column " + (ci + 1), fld("Title", inp(b + ".title", c.title)) + c.links.map(function (l, li) { return row(b + ".links." + li, l, l.id ? "<span class='badge' title='Points to a section on each page'>auto</span>" : ""); }).join("") + addBtn(b + ".links"),
          "<span style='display:flex;gap:4px;align-items:center'>" + grip + "<button class='btn sm' data-mv='" + b + "|-1' title='Move left'>←</button><button class='btn sm' data-mv='" + b + "|1' title='Move right'>→</button>" + (F.cols.length > 1 ? "<button class='btn sm danger' data-rm='" + b + "'>Remove column</button>" : "") + "</span>"); }).join("");
        if (F.cols.length < 4) h += "<button class='btn' data-add='footer.cols' style='margin-bottom:16px'>" + ic("plus") + "Add footer column</button>";
        var C = F.contact;
        h += card("Contact", fld("Title", inp("footer.contact.title", C.title)) + "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + fld("Email", inp("footer.contact.email", C.email)) + fld("WhatsApp link", inp("footer.contact.waHref", C.waHref, "https://wa.me/92…")) + "</div>" +
          fld("WhatsApp text (used by the round WhatsApp icon)", inp("footer.contact.waLabel", C.waLabel)) + fld("Phone numbers (one per line)", area("footer.contact.tels", C.tels, 2)) + fld("Address (one line each)", area("footer.contact.address", C.address, 3)) + fld("Hours", inp("footer.contact.hours", C.hours)));
        h += card("Bottom bar", fld("Big word", inp("footer.word", F.word, "INTERIORS")) + fld("Copyright", inp("footer.copyright", F.copyright)) + F.bottom.map(function (l, i) { return row("footer.bottom." + i, l, "<label class='check' style='margin:0 4px 0 0;font-size:12px'><input type='checkbox' data-pc='footer.bottom." + i + ".ext'" + (l.ext ? " checked" : "") + ">New tab</label>"); }).join("") + addBtn("footer.bottom"));
      } else if (tab === "design") {
        var G = D.design = dfix(D.design), sel = function (k, opts) { return "<select data-p='design." + k + "' style='margin:0'>" + opts.map(function (o) { return "<option value='" + o[0] + "'" + (String(G[k]) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; },
          col = function (k, label) { return "<label class='c3-col'><input type='color' data-p='design." + k + "' value='" + G[k] + "'><span>" + label + "</span></label>"; },
          rng = function (k, mn, mx, u) { return "<span style='display:flex;gap:8px;align-items:center'><input type='range' data-p='design." + k + "' min='" + mn + "' max='" + mx + "' value='" + G[k] + "' style='margin:0;flex:1'><b data-out='" + k + "' style='min-width:44px'>" + G[k] + u + "</b></span>"; },
          chk = function (k, label) { return "<label class='check'><input type='checkbox' data-pc='design." + k + "'" + (G[k] ? " checked" : "") + "> " + label + "</label>"; },
          g2 = function (a, b) { return "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>" + a + b + "</div>"; };
        h += card("Quick presets", "<div class='c3-presets'>" + Object.keys(DPRESETS).map(function (n) { var P = dfix(Object.assign({}, DDEF, DPRESETS[n])); return "<button class='c3-pre' data-preset='" + A(n) + "'><i style='background:" + P.hBg + ";border-color:" + P.hAccent + "'><em style='background:" + P.hAccent + "'></em></i><i style='background:" + P.fBg + "'></i><span>" + A(n) + "</span></button>"; }).join("") + "</div><p class='muted' style='margin:8px 0 0;font-size:12px'>A preset changes colours &amp; layout only — your menu, links and text stay the same.</p>");
        h += card("Header layout", g2(fld("Style", sel("hStyle", [["pill", "Floating glass pill"], ["solid", "Floating solid"], ["bar", "Full-width bar"]])), fld("On scroll", sel("behave", [["hide", "Hide on scroll down, show on up"], ["sticky", "Always visible (sticky)"], ["static", "Scrolls away with page"]]))) +
          g2(fld("Menu position", sel("menuAlign", [["center", "Centre"], ["left", "Next to logo"], ["right", "Next to button"]])), fld("Height (desktop)", rng("hHeight", 52, 96, "px"))) +
          g2(fld("Logo size", rng("logo", 24, 90, "px")), fld("Logo colour", sel("logoTone", [["dark", "Dark (for light header)"], ["light", "White (for dark header)"]]))) + chk("word", "Show “WOODEX INTERIOR” text next to logo"));
        h += card("Header colours", "<div class='c3-cols'>" + col("hBg", "Background") + col("hText", "Menu text") + col("hAccent", "Button") + col("hAccentText", "Button text") + "</div>" + (G.hStyle !== "solid" ? fld("Background opacity (glass)", rng("hAlpha", 30, 100, "%")) : ""));
        var MC0 = megaColors(G);
        h += card("Mega menu (Services drop-down)", g2(fld("Panel style", sel("mStyle", [["auto", "Auto — match header, readable text"], ["light", "Light panel"], ["dark", "Dark navy panel"], ["custom", "Custom colours"]])), "") +
          "<div class='c3-cols'>" + (G.mStyle === "custom" ? col("mBg", "Background") + col("mText", "Text") : "") + col("mAccent", "Numbers & hover") + "</div>" +
          "<div class='c3-mega' style='background:" + MC0.bg + ";color:" + MC0.text + "'><b style='color:" + MC0.accent + "'>01</b> Interior design <span>· Fit-out · Renovation</span></div>" +
          "<small class='" + (MC0.ratio < 4.5 ? "err" : "muted") + "' id='hf-mratio'>Text contrast " + MC0.ratio.toFixed(1) + ":1 " + (MC0.ratio < 4.5 ? "— hard to read, choose a darker text or lighter background" : "✓ readable") + "</small>");
        h += card("Button & phone", g2(fld("Button style", sel("ctaStyle", [["solid", "Solid"], ["outline", "Outline"]])), fld("Phone number", inp("design.phone", G.phone, "+92 322 4000768"))) + chk("ctaShow", "Show the header button") + "<br>" + chk("phoneShow", "Show phone number in header <span class='muted'>(desktop only)</span>"));
        h += card("Footer colours", "<div class='c3-cols'>" + col("fBg", "Background") + col("fText", "Text") + col("fHead", "Headings") + col("fLink", "Accent / hover") + "</div>" +
          g2(fld("Spacing", sel("fPad", [["compact", "Compact"], ["normal", "Normal"], ["spacious", "Spacious"]])), "<div style='padding-top:18px'>" + chk("fLine", "Accent line on top") + "<br>" + chk("fWord", "Show big word") + "</div>"));
        h += "<button class='btn' data-reset='1'>" + ic("refresh-cw") + "Reset design to default</button>";
      } else if (tab === "versions") {
        h += '<div class="card"><div class="card-h"><h3>Published versions</h3><small class="muted">last 10</small></div><div class="card-b" id="hf-vers"><div class="empty">Loading…</div></div></div>';
        body.innerHTML = h; loadVersions(); return;
      }
      body.innerHTML = h; W.fillIcons && W.fillIcons(body); paint(); dnd();
    };

    // ---- P18 B2: undo history, unpublished badge, drag to reorder
    var hist = [], snap = function () { if (!D) return; var s1 = JSON.stringify(D); if (hist[hist.length - 1] !== s1) { hist.push(s1); if (hist.length > 60) hist.shift(); } mark(); };
    var mark = function () { var u = $("#hf-undo"), b2 = $("#hf-dirty"); if (u) u.disabled = !hist.length; if (b2) b2.hidden = !D || JSON.stringify(D) === orig; };
    var undo = function () { if (!hist.length) return; D = JSON.parse(hist.pop()); var sy = window.scrollY; draw(); window.scrollTo(0, sy); mark(); toast("Undone"); };
    $("#hf-undo").onclick = undo;
    document.addEventListener("keydown", function (e) { if (!document.body.contains(body)) return; if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || "")) { e.preventDefault(); undo(); } });
    body.addEventListener("focusin", function (e) { if (e.target.dataset && (e.target.dataset.p || e.target.dataset.pc)) snap(); });
    var drag = null;
    var dnd = function () {
      $$("#hf-body .hf-grip").forEach(function (g) {
        var mv = g.parentNode.querySelector("[data-mv]"); if (!mv) return;
        var p = mv.dataset.mv.split("|")[0], it = g.closest(".card-h") ? g.closest(".card") : g.closest("div[style*='grid']"); if (!it) return;
        it.dataset.dp = p;
        g.addEventListener("mousedown", function () { it.draggable = true; });
        it.addEventListener("dragstart", function (e) { if (e.target !== it) return; drag = p; it.classList.add("hf-drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", p); } catch (x) {} });
        it.addEventListener("dragend", function () { it.draggable = false; it.classList.remove("hf-drag"); $$("#hf-body .hf-over").forEach(function (x) { x.classList.remove("hf-over"); }); drag = null; });
        var same = function () { return drag && drag !== p && drag.replace(/\.\d+$/, "") === p.replace(/\.\d+$/, ""); };
        it.addEventListener("dragover", function (e) { if (!same()) return; e.preventDefault(); e.stopPropagation(); it.classList.add("hf-over"); });
        it.addEventListener("dragleave", function () { it.classList.remove("hf-over"); });
        it.addEventListener("drop", function (e) { if (!same()) return; e.preventDefault(); e.stopPropagation(); var a1 = parent(drag), to = +p.split(".").pop(); snap(); a1.arr.splice(to, 0, a1.arr.splice(a1.k, 1)[0]); drag = null; var sy = window.scrollY; draw(); window.scrollTo(0, sy); });
      });
    };

    // ---- state editing
    var get = function (p) { return p.split(".").reduce(function (o, k) { return o[k]; }, D); };
    var parent = function (p) { var a = p.split("."), k = +a.pop(); return { arr: get(a.join(".")), k: k }; };
    body.addEventListener("input", function (e) { var p = e.target.dataset.p; if (p && D) { var a = p.split("."), k = a.pop(), v = e.target.value; if (a[0] === "design" && typeof DDEF[k] === "number") { v = +v; var o = body.querySelector("[data-out='" + k + "']"); if (o) o.textContent = v + (k === "hAlpha" ? "%" : "px"); } get(a.join("."))[k] = v; paint(); if ((k === "hStyle" || k === "mStyle") && e.target.tagName === "SELECT") draw(); } });
    body.addEventListener("change", function (e) { var p = e.target.dataset.pc; if (p && D) { var a = p.split("."), k = a.pop(); get(a.join("."))[k] = e.target.checked; paint(); } if (e.target.dataset.p && /\.(logo|img)$/.test(e.target.dataset.p)) draw(); if (e.target.dataset.p && /^design\.(mBg|mText|mAccent|hBg|hText)$/.test(e.target.dataset.p)) { var sy = window.scrollY; draw(); window.scrollTo(0, sy); } });
    body.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !D) return;
      if (b.dataset.reset || b.dataset.preset || b.dataset.mv || b.dataset.rm || b.dataset.add) snap();
      if (b.dataset.reset) { D.design = dfix({}); draw(); toast("Design reset to default — Publish to apply"); return; }
      if (b.dataset.preset) { D.design = dfix(Object.assign({}, DDEF, { phone: (D.design || {}).phone || "", phoneShow: !!(D.design || {}).phoneShow }, DPRESETS[b.dataset.preset] || {})); draw(); toast("Preset applied — check the preview, then Publish"); return; }
      if (b.dataset.mv) { var q = b.dataset.mv.split("|"), o = parent(q[0]), to = o.k + +q[1]; if (to < 0 || to >= o.arr.length) return; o.arr.splice(to, 0, o.arr.splice(o.k, 1)[0]); draw(); }
      else if (b.dataset.rm) { var o2 = parent(b.dataset.rm); if (o2.arr[o2.k] && o2.arr[o2.k].type === "mega") return; o2.arr.splice(o2.k, 1); draw(); }
      else if (b.dataset.go) { setTab(b.dataset.go); }
      else if (b.dataset.add) {
        var t = get(b.dataset.add);
        if (b.dataset.add === "mega.cols") { if (t.length < 5) t.push({ title: "New column", href: "/", route: "", links: [{ label: "New link", href: "/" }] }); }
        else if (b.dataset.add === "footer.cols") { if (t.length < 4) t.push({ title: "New column", links: [{ label: "New link", href: "/" }] }); }
        else if (b.dataset.add === "menu.items") t.push({ type: "link", label: "New link", href: "/" });
        else if (b.dataset.add === "menu.mobile") t.splice(Math.max(0, t.length - 1), 0, { label: "New link", href: "/" });
        else t.push({ label: "New link", href: "/" });
        draw();
      } else if (b.dataset.pick) {
        var p = b.dataset.pick, set = function (url) { var a = p.split("."), k = a.pop(); get(a.join("."))[k] = url; draw(); };
        if (W.pickImage) W.pickImage(set); else { var u = prompt("Image address (e.g. /assets/img/…)", get(p)); if (u) set(u.trim()); }
      }
    });

    // ---- tabs
    var setTab = function (t) { tab = t; $$("[data-gt]").forEach(function (x) { x.classList.toggle("pri", x.dataset.gt === t); }); var d = fdoc(), mm = d && d.querySelector(".mega-menu"); if (mm && t !== "mega") mm.classList.remove("open"); if (t === "footer") { var f = d && d.querySelector("footer.footer"); if (f) f.scrollIntoView(); } else if (d) d.defaultView.scrollTo(0, 0); draw(); };
    $$("[data-gt]").forEach(function (b) { b.onclick = function () { setTab(b.dataset.gt); }; });

    // ---- versions
    var loadVersions = function () {
      api("chrome_versions", {}).then(function (r) {
        var v = (r && r.versions) || [], el2 = $("#hf-vers"); if (!el2) return;
        el2.innerHTML = v.length ? v.map(function (x, i) { return "<div style='display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)'><div style='flex:1'><b>" + A(x.note || "Published") + "</b>" + (i === 0 ? " <span class='badge green'>live</span>" : "") + "<br><small class='muted'>" + new Date(x.t * 1000).toLocaleString() + (x.by ? " · " + A(x.by) : "") + "</small></div><button class='btn sm' data-restore='" + i + "'>Load into editor</button></div>"; }).join("") : '<div class="empty">No versions yet — the current header &amp; footer is saved as “Original” on your first publish.</div>';
        $$("[data-restore]", el2).forEach(function (b) { b.onclick = function () { D = JSON.parse(JSON.stringify(v[+b.dataset.restore].data)); toast("Version loaded — check the preview, then press Publish to restore it"); setTab("header"); }; });
      });
    };

    // ---- publish
    $("#hf-export").onclick = function () {
      if (!D) return; var blob = new Blob([JSON.stringify({ woodexChrome: 1, saved: new Date().toISOString(), data: D }, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "woodex-header-footer-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
    };
    $("#hf-import").onclick = function () {
      var f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
      f.onchange = function () {
        var file = f.files[0]; if (!file) return; if (file.size > 400000) return toast("File is too large", true);
        file.text().then(function (t) {
          var j; try { j = JSON.parse(t); } catch (e) { return toast("Not a valid file", true); }
          var x = j && j.woodexChrome ? j.data : j;
          var only = j && j.woodexDesign ? j.design : null;
          if (only) { D.design = dfix(only); draw(); return toast("Design imported — check the preview, then Publish"); }
          if (!x || !x.menu || !Array.isArray(x.menu.items) || !x.header || !x.footer || !Array.isArray(x.footer.cols)) return toast("This is not a Woodex header & footer file", true);
          if (!confirm("Replace the current header, menu, footer and design with this file?\nNothing goes live until you press Publish.")) return;
          x.design = dfix(x.design); D = x; draw(); toast("Imported — check the preview, then Publish");
        });
      };
      f.click();
    };
    $("#hf-discard").onclick = function () { if (D && JSON.stringify(D) !== orig && !confirm("Discard all unpublished changes?")) return; D = JSON.parse(orig); draw(); };
    $("#hf-publish").onclick = function () {
      if (!D) return; var bad = problems(D);
      if (bad.length) return toast("Please fix: " + bad.slice(0, 3).join(", ") + (bad.length > 3 ? "…" : ""), true);
      if (JSON.stringify(D) === orig) return toast("No changes to publish");
      var note = prompt("Publish header, mega menu and footer to all pages?\nEvery page is backed up first.\n\nShort note for this version (optional):", "");
      if (note === null) return;
      var btn = $("#hf-publish"); btn.disabled = true; btn.textContent = "Publishing…";
      var h = build(D), first = Promise.resolve();
      first = api("chrome_versions", {}).then(function (r) { if (r && r.ok && !(r.versions || []).length) return api("chrome_save", { data: JSON.parse(orig), note: "Original (before first publish)" }); });
      first.then(function () { return api("global_menu", { desktop: h.desktop, mobile: h.mobile }); })
        .then(function (x) { if (!x.ok) throw new Error(x.error); return api("global_chrome", { brand: h.brand, cta_label: h.cta, footer: h.footer, intro_all: !!D.footer.introAll, style: h.style, phone: h.phone, design: 1 }); })
        .then(function (x) { if (!x.ok) throw new Error(x.error); return api("chrome_save", { data: D, note: note || "Published" }).then(function () { return x; }); })
        .then(function (x) { orig = JSON.stringify(D); toast("Published to " + x.changed + " pages ✓"); })
        .catch(function (e) { toast(e.message || "Publish failed", true); })
        .then(function () { btn.disabled = false; btn.innerHTML = ic("upload") + "Publish to all pages"; W.fillIcons && W.fillIcons(btn.parentNode); });
    };

    bapi("load", { path: "index.html" }).then(function (r) {
      if (!r.ok) { body.innerHTML = '<div class="empty"><b style="color:#d92d20">' + A(r.error || "Could not load") + '</b><p><button class="btn" id="gl-retry">Retry</button> <a class="btn" href="#/system">Open System check</a></p></div>'; body.querySelector("#gl-retry").onclick = function () { W.VIEWS.global(el); }; return; }
      D = parse(r.html); if (!D) return (body.innerHTML = '<div class="empty">This site’s header/footer structure was not found.</div>');
      orig = JSON.stringify(D);
      var start = location.hash.split("/")[2]; if (/^(header|mega|footer|design|versions)$/.test(start || "")) return setTab(start);
      draw();
    });
    window.addEventListener("beforeunload", function (e) { if (D && orig && JSON.stringify(D) !== orig && document.body.contains(body)) { e.preventDefault(); e.returnValue = ""; } });
  };
})();
