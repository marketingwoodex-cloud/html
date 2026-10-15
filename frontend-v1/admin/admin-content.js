/* Woodex Admin v2 — A6a Content collections
 * Blog/insights + Portfolio (pages rendered from forms into the existing page design),
 * Testimonials + Team (sections placed on chosen pages), FAQ groups, AI writing help.
 * Pages are written with the builder API (load/save/page_new = same backups + checks as the builder).
 */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var SITE = "https://woodex.com.pk";
  var T = {
    post: { list: "blog", ed: "post", folder: "insights", one: "article", many: "articles", title: "Blog & insights", shell: "insights/home-renovation-checklist/index.html", rv: "data-in-reveal", more: "Read the article", listRv: "data-ih-reveal" },
    study: { list: "portfolio", ed: "study", folder: "projects", one: "project", many: "projects", title: "Portfolio", shell: "projects/courtyard-house/index.html", rv: "data-st-reveal", more: "View the study", listRv: "data-ph-reveal" }
  };
  var ST = { draft: ["Draft", ""], scheduled: ["Scheduled", "warn"], published: ["Live", "ok"] };
  var aiReady = false;

  // ------------------------------------------------------------------ helpers
  function slugify(s) { return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  /** Safe inline markdown: **bold**, *italic*, [text](url). Everything else is escaped. */
  function inl(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:|#)[^)\s]*)\)/g, function (m, t, u) { return '<a href="' + u + '">' + t + "</a>"; });
  }
  function toMd(node) {
    var out = "";
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.textContent; return; } if (n.nodeType !== 1) return;
      var t = n.tagName, inner = toMd(n);
      if (t === "STRONG" || t === "B") out += "**" + inner + "**"; else if (t === "EM" || t === "I") out += "*" + inner + "*";
      else if (t === "A") out += "[" + inner + "](" + (n.getAttribute("href") || "") + ")"; else out += inner;
    });
    return out.replace(/\s+/g, " ").trim();
  }
  function plain(md) { return String(md || "").replace(/\*\*|\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); }
  function utcToLocal(u) { if (!u) return ""; var d = new Date(u.replace(" ", "T") + "Z"); return isNaN(d) ? "" : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
  function localToUtc(v) { var d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 16).replace("T", " "); }
  function fmtLocal(u) { var d = new Date(String(u).replace(" ", "T") + "Z"); return isNaN(d) ? u : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function badge(it) { var s = ST[it.status] || ST.draft; return '<span class="badge ' + s[1] + '">' + s[0] + (it.status === "scheduled" && it.publishAt ? " · " + esc(fmtLocal(it.publishAt)) : "") + "</span>"; }
  function aiBtn(id, label) { return '<button type="button" class="btn sm ai" id="' + id + '" title="Write with AI">' + ic("sparkles") + (label || "AI") + "</button>"; }
  function ai(task, input) {
    return api("ai_run", { task: task, input: input }).then(function (r) { if (!r.ok) { toast(r.error || "AI failed", true); throw 0; } return r.text; });
  }
  function aiJson(t) { var m = String(t).match(/[\[{][\s\S]*[\]}]/); if (!m) throw new Error("no json"); return JSON.parse(m[0]); }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle("loading", on); }
  function uploadFile(file) {
    var fd = new FormData(); fd.append("action", "upload"); fd.append("file", file);
    return fetch("/api/builder.php", { method: "POST", headers: { "X-WX-CSRF": S.btoken || "", "X-WX-ADM": S.token || "" }, body: fd }).then(function (r) { return r.json(); });
  }
  /** Image picker: media library grid + upload. cb(url) */
  function pickImage(cb) {
    var box = document.createElement("div"); box.className = "ip"; box.innerHTML = '<div class="ip-card"><div class="ip-h"><b>Choose an image</b><label class="btn pri sm">' + ic("upload") + 'Upload<input type="file" accept="image/*" hidden></label><input class="ip-q" placeholder="Filter…"><button class="btn sm" data-x>Close</button></div><div class="ip-grid"><p class="muted">Loading…</p></div></div>';
    document.body.appendChild(box); W.fillIcons(box);
    var all = [], grid = box.querySelector(".ip-grid"), close = function () { box.remove(); };
    function draw() { var q = box.querySelector(".ip-q").value.toLowerCase(); grid.innerHTML = all.filter(function (u) { return !q || u.toLowerCase().indexOf(q) > -1; }).slice(0, 240).map(function (u) { return '<button data-u="' + esc(u) + '"><img src="' + esc(u) + '" loading="lazy" alt=""></button>'; }).join("") || '<p class="muted">No images</p>'; }
    bapi("media").then(function (r) { all = r.ok ? r.media : []; draw(); });
    box.querySelector(".ip-q").oninput = draw;
    box.querySelector("[data-x]").onclick = close; box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
    grid.onclick = function (e) { var b = e.target.closest("[data-u]"); if (b) { close(); cb(b.dataset.u); } };
    box.querySelector("input[type=file]").onchange = function () { var f = this.files[0]; if (!f) return; grid.innerHTML = '<p class="muted">Uploading…</p>'; uploadFile(f).then(function (r) { if (!r.ok) { toast(r.error || "Upload failed", true); draw(); return; } close(); cb(r.url); }); };
  }
  function imgField(id, src, label) {
    return '<div class="imf" id="' + id + '"><div class="imf-p" style="background-image:url(\'' + esc(src || "") + '\')">' + (src ? "" : ic("image")) + '</div><div><b>' + esc(label) + '</b><div class="imf-b"><button type="button" class="btn sm" data-pick>' + (src ? "Change" : "Choose") + '</button>' + (src ? '<button type="button" class="btn sm ghost" data-clear>Remove</button>' : "") + '</div></div><input type="hidden" value="' + esc(src || "") + '"></div>';
  }
  function bindImg(id, onChange) {
    var el = $("#" + id); if (!el) return;
    el.onclick = function (e) {
      if (e.target.closest("[data-pick]")) pickImage(function (u) { el.outerHTML = imgField(id, u, el.querySelector("b").textContent); W.fillIcons($("#" + id).parentNode); bindImg(id, onChange); onChange && onChange(u); });
      if (e.target.closest("[data-clear]")) { el.outerHTML = imgField(id, "", el.querySelector("b").textContent); W.fillIcons($("#" + id).parentNode); bindImg(id, onChange); onChange && onChange(""); }
    };
  }
  var imgVal = function (id) { var i = $("#" + id + " input"); return i ? i.value : ""; };

  // ------------------------------------------------------------------ page renderer (form -> page HTML in the existing design)
  function metaRe(attr, key) { return new RegExp('(<meta\\s+' + attr + '="' + key.replace(/[:.]/g, "\\$&") + '"\\s+content=")[^"]*(")', "i"); }
  function setMeta(h, attr, key, val) { return metaRe(attr, key).test(h) ? h.replace(metaRe(attr, key), function (m, a, b) { return a + esc(val) + b; }) : h; }
  function absUrl(u) { return !u ? "" : /^https?:/.test(u) ? u : SITE + u; }
  /** FAQ block text: pairs separated by a blank line; first line = question ("Q:" optional), rest = answer. */
  function parseFaq(t) { return String(t || "").split(/\n\s*\n/).map(function (c) { var l = c.trim().split("\n"); return { q: (l.shift() || "").replace(/^Q[:.]\s*/i, "").trim(), a: l.join(" ").replace(/^A[:.]\s*/i, "").trim() }; }).filter(function (f) { return f.q && f.a; }); }
  function groupBlocks(blocks, rv, listCls) {
    var out = "", open = false;
    function close() { if (open) { out += "</div>"; open = false; } }
    function ensure() { if (!open) { out += "<div " + rv + '="">'; open = true; } }
    (blocks || []).forEach(function (b) {
      if (b.t === "h") { close(); ensure(); out += "<h2>" + esc(b.text) + "</h2>"; }
      else if (b.t === "p") { if (!String(b.text || "").trim()) return; ensure(); out += "<p>" + inl(b.text) + "</p>"; }
      else if (b.t === "list") { var it = (b.items || []).filter(function (x) { return String(x).trim(); }); if (!it.length) return; ensure(); var lt = b.ol ? "ol" : "ul"; out += "<" + lt + (listCls && !b.ol ? ' class="' + listCls + '"' : "") + ">" + it.map(function (x) { return "<li>" + inl(x) + "</li>"; }).join("") + "</" + lt + ">"; }
      else if (b.t === "quote") { if (!b.text) return; ensure(); out += "<blockquote>" + inl(b.text) + "</blockquote>"; }
      else if (b.t === "ba") { if (!b.before || !b.after) return; close(); out += '<figure class="wx-ba" ' + rv + '=""><div class="wx-ba-w"><img src="' + esc(b.after) + '" alt="' + esc((b.caption || "Project") + " after") + '" width="1920" height="1280" loading="lazy" decoding="async"><img class="wx-ba-b" src="' + esc(b.before) + '" alt="' + esc((b.caption || "Project") + " before") + '" width="1920" height="1280" loading="lazy" decoding="async"><span class="wx-ba-l b">Before</span><span class="wx-ba-l a">After</span><input class="wx-ba-r" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after"></div>' + (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure>"; }
      else if (b.t === "gallery") { var gi = (b.imgs || []).filter(function (x) { return x.src; }); if (!gi.length) return; close(); out += '<div ' + rv + '=""><div class="wx-gal">' + gi.map(function (x, k) { return '<img src="' + esc(x.src) + '" alt="' + esc(x.alt || (b.caption || "Project photo") + " " + (k + 1)) + '" width="1200" height="900" loading="lazy" decoding="async">'; }).join("") + "</div>" + (b.caption ? '<p class="wx-gal-c">' + esc(b.caption) + "</p>" : "") + "</div>"; }
      else if (b.t === "table") { var rows = String(b.text || "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[|\s:-]+$/.test(l); }).map(function (l) { return l.replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); }); if (rows.length < 2) return; ensure(); out += '<div class="wx-tbl"><table><thead><tr>' + rows[0].map(function (c) { return "<th>" + inl(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.slice(1).map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inl(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }
      else if (b.t === "faq") { var qa = parseFaq(b.text); if (!qa.length) return; ensure(); out += '<div class="wx-faq">' + qa.map(function (f) { return "<details><summary>" + esc(f.q) + "</summary><p>" + inl(f.a) + "</p></details>"; }).join("") + "</div>"; }
      else if (b.t === "cta") { if (!b.title && !b.text) return; ensure(); out += '<aside class="wx-cta"><h3>' + esc(b.title || "") + "</h3>" + (b.text ? "<p>" + inl(b.text) + "</p>" : "") + '<a href="' + esc(b.href || "/contact/") + '">' + esc(b.label || "Book a free consultation") + " →</a></aside>"; }
      else if (b.t === "img") { if (!b.src) return; close(); out += '<figure class="in-image" ' + rv + '=""><img src="' + esc(b.src) + '" alt="' + esc(b.alt || "") + '" width="1920" height="1280" loading="lazy" decoding="async">' + (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure>"; }
    });
    close(); return out;
  }
  function relatedCards(type, d, others) {
    var t = T[type], picks = (d.related || []).map(function (s) { return others.find(function (o) { return o.slug === s; }); }).filter(Boolean).slice(0, 3);
    if (!picks.length) return "";
    return '    <section class="dx-related">\n      <div class="dx-wrap">\n        <header ' + t.rv + '><p class="dx-kicker">Keep looking</p><h2>' + esc(d.relatedTitle || (type === "post" ? "Related reading." : "Related studies.")) + "</h2></header>\n        <div class=\"dx-cards\">\n" +
      picks.map(function (o) {
        var od = o.data || {}, c = od.card || {}, tag = type === "post" ? metaVal(od, "Category") || od.kicker : od.kicker;
        return '        <a class="dx-card" href="/' + t.folder + "/" + esc(o.slug) + '/" ' + t.rv + '>\n          <figure><img src="' + esc(c.src || (od.hero || {}).src || "") + '" alt="' + esc(c.alt || o.title) + '" width="1920" height="1280" loading="lazy" decoding="async"><figcaption class="dx-tag">' + esc(tag || "") + "</figcaption></figure>\n          <h3>" + esc(o.title) + "</h3>\n          <p>" + esc(c.text || od.dek || "") + '</p>\n          <span class="dx-more">' + t.more + "</span>\n        </a>\n";
      }).join("") + "        </div>\n      </div>\n    </section>\n";
  }
  function metaVal(d, k) { var m = (d.meta || []).find(function (x) { return String(x.k).toLowerCase() === k.toLowerCase(); }); return m ? m.v : ""; }
  function faqHtml(faqs, rv) {
    faqs = (faqs || []).filter(function (f) { return f.q && f.a; }); if (!faqs.length) return "";
    return "<div " + rv + '>\n<header ' + rv + '=""><p class="in-label">Questions</p><h2>Asked often, answered plainly.</h2></header>\n      <div class="in-faq-list">' +
      faqs.map(function (f, i) { return '<div class="in-faq-item"><button class="in-faq-q" type="button" aria-expanded="' + (i ? "false" : "true") + '"><span>' + esc(f.q) + '</span><span class="plus">+</span></button><div class="in-faq-a"><div><p>' + inl(f.a) + "</p></div></div></div>"; }).join("") + "</div>\n          </div>\n";
  }
  /* P17 templates: section order / on-off / hero style come from the item's template (W.tplFor); no template = original layout */
  var TPL_DEF = { hero: "image", toc: false, meta: true, facts: true, sections: [{ k: "body", on: true }, { k: "summary", on: true }, { k: "faqs", on: true }, { k: "quote", on: true }, { k: "related", on: true }] };
  function tplOf(type, it) { var x = W.tplFor && W.tplFor(type, it); return x && x.sections ? x : type === "post" ? Object.assign({}, TPL_DEF, { toc: true }) : TPL_DEF; }
  function tocIds(html, rv) {
    var toc = [], n = 0;
    html = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, function (m, a, t) { if (/\bid=/.test(a)) return m; var id = "s-" + (++n) + "-" + plain(t.replace(/<[^>]+>/g, "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); toc.push([id, plain(t.replace(/<[^>]+>/g, ""))]); return "<h2" + a + ' id="' + id + '">' + t + "</h2>"; });
    return { html: html, toc: toc.length > 2 ? '          <nav class="dx-toc" aria-label="On this page" ' + rv + '><p>On this page</p><ol>' + toc.map(function (x) { return '<li><a href="#' + x[0] + '">' + esc(x[1]) + "</a></li>"; }).join("") + "</ol></nav>\n" : "" };
  }
  function mainHtml(type, it, others) {
    var t = T[type], d = it.data || {}, rv = t.rv, hero = d.hero || {}, h = "", tp = tplOf(type, it), on = {}, ord = [];
    (tp.sections || []).forEach(function (x) { on[x.k] = x.on !== false; if (x.on !== false) ord.push(x.k); });
    var hs = tp.hero === "navy" || tp.hero === "media" ? tp.hero : "image";
    h += '\n    <section class="dx-hero' + (hs === "image" ? " dx-hero--image" : " dx-hero--" + hs) + '" aria-labelledby="dx-title">\n' + (hero.src && hs === "image" ? '      <img class="dx-hero-bg" src="' + esc(hero.src) + '" alt="" aria-hidden="true" width="1920" height="1280" decoding="async">\n' : "") +
      '      <div class="dx-wrap dx-hero-inner"' + (type === "study" ? " " + rv : "") + ">\n" + (d.kicker ? '        <p class="dx-kicker">' + esc(d.kicker) + "</p>\n" : "") +
      '        <h1 id="dx-title">' + esc(it.title) + "</h1>\n" + (d.dek ? '        <p class="dx-dek">' + esc(d.dek) + "</p>\n" : "");
    var meta = tp.meta === false ? [] : (d.meta || []).filter(function (m) { return m.k && m.v; });
    if (meta.length) h += '        <dl class="dx-meta">\n' + meta.map(function (m) { return '          <div class="dx-meta-item"><dt>' + esc(m.k) + "</dt><dd>" + esc(m.v) + "</dd></div>\n"; }).join("") + "        </dl>\n";
    h += "      </div>\n    </section>\n\n";
    if (hs === "media" && hero.src) h += '    <div class="dx-wrap"><figure class="dx-hero-media"><img src="' + esc(hero.src) + '" alt="' + esc(hero.alt || it.title) + '" width="1920" height="1080" decoding="async" fetchpriority="high"></figure></div>\n\n';
    h += "    <section class=\"dx-body\">\n      <div class=\"dx-wrap dx-body-grid\">\n";
    var facts = (d.facts || []).filter(function (f) { return f.k || f.v; });
    if (type === "study" && tp.facts !== false && (facts.length || d.factsNote)) h += '        <aside class="dx-side">\n          <div class="dx-facts" ' + rv + ">\n            <h2>" + esc(d.factsTitle || "Study facts") + '</h2>\n            <ul class="dx-arrow-list">\n' + facts.map(function (f) { return "              <li><strong>" + esc(f.k) + "</strong> " + esc(f.v) + "</li>\n"; }).join("") + "            </ul>\n" + (d.factsNote ? '            <p class="dx-note">' + esc(d.factsNote) + "</p>\n" : "") + "          </div>\n        </aside>\n";
    var sum = (d.summary || []).filter(function (x) { return String(x).trim(); });
    var P = {
      body: function () { return groupBlocks(d.blocks, rv, type === "study" ? "dx-arrow-list" : ""); },
      summary: function () { return sum.length ? "\n          <div " + rv + ">\n            <h2>" + esc(d.summaryTitle || "The short version.") + "</h2>\n            <ul>\n" + sum.map(function (x) { return "            <li>" + inl(x) + "</li>\n"; }).join("") + "            </ul>\n          </div>\n" : ""; },
      faqs: function () { return faqHtml(d.faqs, rv); },
      quote: function () { return d.quote ? (type === "study" ? '    <section class="dx-quote" ' + rv + '><div class="dx-wrap"><blockquote>' + esc(d.quote) + "</blockquote></div></section>\n" : '    <section class="dx-quote"><div class="dx-wrap"><blockquote ' + rv + ">" + esc(d.quote) + "</blockquote></div></section>\n\n") : ""; },
      related: function () { return relatedCards(type, d, others); }
    };
    var inner = ord.filter(function (k) { return k === "body" || k === "summary" || k === "faqs"; }).map(function (k) { return P[k](); }).join("");
    if (tp.toc) { var tc = tocIds(inner, rv); inner = tc.toc + tc.html; }
    h += '        <div class="dx-main">\n' + inner;
    h += "        </div>\n      </div>\n    </section>\n\n";
    h += ord.filter(function (k) { return k === "quote" || k === "related"; }).map(function (k) { return P[k](); }).join("");
    return h;
  }
  W.contentMainHtml = mainHtml; W.contentRender = function (type, it, shell, others) { return renderPage(type, it, shell, others); }; W.contentT = T;
  function ldJson(shellHtml, type, it, url, desc) {
    var biz = null, m = shellHtml.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/);
    try { var arr = JSON.parse(m[1]); arr = Array.isArray(arr) ? arr : [arr]; biz = arr.find(function (x) { return x["@type"] === "LocalBusiness"; }); } catch (e) {}
    var d = it.data || {}, t = T[type], out = [];
    if (biz) out.push(biz);
    out.push({ "@context": "https://schema.org", "@type": type === "post" ? "Article" : "CreativeWork", headline: it.title, description: desc, url: url, image: absUrl((d.hero || {}).src || (it.seo || {}).og), author: { "@type": "Organization", name: "Woodex Interior" }, publisher: { "@type": "Organization", name: "Woodex Interior", url: SITE }, articleSection: d.category || undefined, keywords: (d.tags || []).join(", ") || undefined, datePublished: String(it.published_at || new Date().toISOString()).slice(0, 10), dateModified: new Date().toISOString().slice(0, 10) });
    out.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: type === "post" ? "Insights" : "Projects", item: SITE + "/" + t.folder + "/" }, { "@type": "ListItem", position: 3, name: it.title, item: url }] });
    var fq = (d.faqs || []).filter(function (f) { return f.q && f.a; });
    if (fq.length) out.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: fq.map(function (f) { return { "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: plain(f.a) } }; }) });
    return JSON.stringify(out).replace(/<\//g, "<\\/");
  }
  /** Build the full page from a shell page (keeps its head assets, header, CTA, trust strip and footer). */
  function renderPage(type, it, shell, others) {
    if (it.data && it.data.faqGroup && W.faqItems) { var fgi = W.faqItems(it.data.faqGroup); if (fgi) it = Object.assign({}, it, { data: Object.assign({}, it.data, { faqs: fgi }) }); }
    var i = shell.indexOf('<main id="main-content">'), j = shell.search(/<section class="[a-z]+-section" id="cta"/);
    if (i < 0 || j < i) throw new Error("The template page has an unexpected layout");
    var d = it.data || {}, seo = it.seo || {}, url = SITE + "/" + T[type].folder + "/" + it.slug + "/";
    var title = seo.title || it.title + " | Woodex Interior", desc = seo.desc || d.dek || "", og = absUrl(seo.og || (d.hero || {}).src || "");
    var cta = shell.slice(j);
    if (type === "post") cta = cta.replace(/\n?<section class="wx-trust"[\s\S]*?<\/section>\n?/, "\n");
    if (d.ctaTitle) cta = cta.replace(/(<section class="[a-z]+-section" id="cta"[\s\S]*?<h2[^>]*>)[\s\S]*?(<\/h2>)/, function (m, a, b) { return a + esc(d.ctaTitle) + b; });
    var h = shell.slice(0, i + 24) + "\n" + mainHtml(type, it, others) + "\n    " + cta;
    h = h.replace(/<title>[\s\S]*?<\/title>/, "<title>" + esc(title) + "</title>");
    h = setMeta(h, "name", "description", desc); h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, "$1" + url + "$2");
    h = setMeta(h, "property", "og:title", title); h = setMeta(h, "property", "og:description", desc); h = setMeta(h, "property", "og:url", url);
    if (og) { h = setMeta(h, "property", "og:image", og); h = setMeta(h, "name", "twitter:image", og); }
    h = setMeta(h, "property", "og:image:alt", it.title); h = setMeta(h, "name", "twitter:title", title); h = setMeta(h, "name", "twitter:description", desc);
    h = h.replace(/(<script type="application\/ld\+json">\s*)[\s\S]*?(\s*<\/script>)/, function (m, a, b) { return a + ldJson(shell, type, it, url, desc) + b; });
    h = h.replace(/\n?[ \t]*<meta name="robots"[^>]*>/i, ""); if (d.visibility === "unlisted") h = h.replace(/<\/title>/i, '</title>\n  <meta name="robots" content="noindex, follow">');
    return h;
  }
  function listCard(type, it) {
    var t = T[type], d = it.data || {}, c = d.card || {};
    return '          <a class="hx-card" href="/' + t.folder + "/" + esc(it.slug) + '/" ' + t.listRv + '="">\n            <figure><img src="' + esc(c.src || (d.hero || {}).src || "") + '" alt="' + esc(c.alt || it.title) + '" width="1920" height="1280" loading="lazy" decoding="async"><span class="hx-date">' + esc(c.tag || d.category || (type === "post" ? metaVal(d, "Read time") : "Study")) + "</span></figure>\n            <h3>" + esc(it.title) + "</h3><p>" + esc(c.text || d.dek || "") + '</p><span class="hx-more">' + t.more + "</span>\n          </a>";
  }
  function updateListing(type, it) {
    var rel = T[type].folder + "/index.html";
    return bapi("load", { path: rel }).then(function (r) {
      if (!r.ok) return;
      var h = r.html, href = 'href="/' + T[type].folder + "/" + it.slug + '/"', card = listCard(type, it);
      var re = new RegExp('[ \\t]*<a class="hx-card" ' + href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "[\\s\\S]*?<\\/a>");
      if ((it.data || {}).visibility === "unlisted") { if (!re.test(h)) return; h = h.replace(re, "").replace(/\n\s*\n(\s*<a class="hx-card")/, "\n$1"); }
      else if (re.test(h)) h = h.replace(re, card); else if (h.indexOf('<div class="hx-cards">') > -1) h = h.replace('<div class="hx-cards">', '<div class="hx-cards">\n' + card); else return;
      if (h !== r.html) return bapi("save", { path: rel, html: h, mtime: r.mtime });
    });
  }

  // ------------------------------------------------------------------ importer (existing pages -> content items)
  function parsePage(type, html, listHtml, slug) {
    var d = new DOMParser().parseFromString(html, "text/html"), q = function (s, r) { return (r || d).querySelector(s); }, tx = function (s, r) { var e = q(s, r); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
    var data = { kicker: tx(".dx-hero .dx-kicker"), dek: tx(".dx-hero .dx-dek"), hero: { src: (q(".dx-hero-bg") || { getAttribute: function () { return ""; } }).getAttribute("src") || "" }, meta: [], blocks: [], summary: [], faqs: [], related: [] };
    $$(".dx-meta-item", d).forEach(function (m) { data.meta.push({ k: tx("dt", m), v: tx("dd", m) }); });
    if (type === "study") { data.factsTitle = tx(".dx-facts h2"); data.facts = $$(".dx-facts li", d).map(function (li) { var s = q("strong", li), k = s ? s.textContent.trim() : ""; return { k: k, v: li.textContent.replace(k, "").replace(/\s+/g, " ").trim() }; }); data.factsNote = tx(".dx-facts .dx-note"); }
    function walk(el) {
      Array.prototype.forEach.call(el.children, function (c) {
        var tg = c.tagName;
        if (c.querySelector && c.matches("figure")) { var im = q("img", c); if (im) data.blocks.push({ t: "img", src: im.getAttribute("src"), alt: im.getAttribute("alt") || "", caption: tx("figcaption", c) }); return; }
        if (c.querySelector(".in-faq-list") || c.matches(".in-faq-list")) { $$(".in-faq-item", c).forEach(function (f) { data.faqs.push({ q: tx(".in-faq-q span", f), a: toMd(q(".in-faq-a", f)) }); }); return; }
        var h2 = c.matches("div") && q(":scope > h2", c);
        if (h2 && /short version/i.test(h2.textContent)) { data.summaryTitle = h2.textContent.trim(); $$("li", c).forEach(function (li) { data.summary.push(toMd(li)); }); return; }
        if (tg === "H2" || tg === "H3") data.blocks.push({ t: "h", text: c.textContent.trim() });
        else if (tg === "P") data.blocks.push({ t: "p", text: toMd(c) });
        else if (tg === "UL" || tg === "OL") data.blocks.push(tg === "OL" ? { t: "list", ol: true, items: $$("li", c).map(toMd) } : { t: "list", items: $$("li", c).map(toMd) });
        else if (tg === "TABLE" || (tg === "DIV" && c.matches(".wx-tbl"))) { data.blocks.push({ t: "table", text: $$("tr", c).map(function (tr) { return "| " + $$("th,td", tr).map(function (x) { return x.textContent.replace(/\|/g, "/").trim(); }).join(" | ") + " |"; }).join("\n") }); }
        else if (tg === "ASIDE" && c.matches(".wx-cta")) { var ca = q("a", c); data.blocks.push({ t: "cta", title: tx("h3", c), text: tx("p", c), href: ca ? ca.getAttribute("href") : "/contact/", label: ca ? ca.textContent.replace(/\s*→\s*$/, "").trim() : "" }); }
        else if (tg === "BLOCKQUOTE") data.blocks.push({ t: "quote", text: toMd(c) });
        else if (tg === "DIV" || tg === "SECTION" || tg === "ARTICLE") walk(c);
      });
    }
    var main = q(".dx-main"); if (main) walk(main);
    data.quote = tx(".dx-quote blockquote"); data.relatedTitle = tx(".dx-related h2");
    data.related = $$(".dx-related a.dx-card", d).map(function (a) { return (a.getAttribute("href") || "").split("/").filter(Boolean).pop(); }).filter(Boolean);
    data.ctaTitle = tx("section#cta h2");
    var L = new DOMParser().parseFromString(listHtml || "", "text/html"), card = L.querySelector('a.hx-card[href="/' + T[type].folder + "/" + slug + '/"]');
    data.card = card ? { src: (q("img", card) || { getAttribute: function () { return ""; } }).getAttribute("src"), alt: (q("img", card) || { getAttribute: function () { return ""; } }).getAttribute("alt"), text: tx("p", card), tag: tx(".hx-date", card) } : {};
    var ogm = q('meta[property="og:image"]');
    return { title: tx("#dx-title") || tx("title").replace(/\s*\|.*$/, ""), data: data, seo: { title: tx("title"), desc: (q('meta[name="description"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "", og: ogm ? (ogm.getAttribute("content") || "").replace(SITE, "") : "" } };
  }
  function importPages(type, items, done) {
    var t = T[type];
    bapi("pages").then(function (r) {
      if (!r.ok) return toast(r.error || "Could not list pages", true);
      var have = items.map(function (x) { return x.slug; }), re = new RegExp("^" + t.folder + "/([a-z0-9-]+)/index\\.html$");
      var todo = r.pages.map(function (p) { var m = (p.path || p).match(re); return m && have.indexOf(m[1]) < 0 ? m[1] : null; }).filter(Boolean);
      modal('<h3>Import existing ' + t.many + '</h3><p class="muted">' + (todo.length ? todo.length + " page(s) found that are not managed yet. Their text, images, FAQs and SEO become editable forms. <b>The live pages are not changed</b> until you edit and publish an item." : "All existing " + t.many + " are already imported.") + "</p>" +
        (todo.length ? '<ul class="imp-l">' + todo.map(function (s) { return "<li>/" + t.folder + "/" + esc(s) + "/</li>"; }).join("") + "</ul>" : "") +
        '<div class="modal-actions"><button class="btn" id="im-x">Close</button>' + (todo.length ? '<button class="btn pri" id="im-go">Import ' + todo.length + "</button>" : "") + "</div>");
      $("#im-x").onclick = closeModal;
      if (!todo.length) return;
      $("#im-go").onclick = function () {
        busy(this, true); var n = 0;
        bapi("load", { path: t.folder + "/index.html" }).then(function (lr) {
          var list = lr.ok ? lr.html : "";
          return todo.reduce(function (p, slug) {
            return p.then(function () {
              var rel = t.folder + "/" + slug + "/index.html";
              return bapi("load", { path: rel }).then(function (pr) {
                if (!pr.ok) return; var x = parsePage(type, pr.html, list, slug);
                return api("cms_save", { type: type, title: x.title, slug: slug, data: x.data, seo: x.seo, claim: rel }).then(function (sr) { if (sr.ok) n++; else toast(slug + ": " + sr.error, true); });
              });
            });
          }, Promise.resolve());
        }).then(function () { closeModal(); toast(n + " " + t.many + " imported"); done(); });
      };
    });
  }

  // ------------------------------------------------------------------ list views (blog / portfolio)
  function listView(type) {
    return function (el) {
      var t = T[type];
      el.innerHTML = head(t.title, t.title, '<button class="btn" id="cm-ai">' + ic("sparkles") + 'AI settings</button><button class="btn" id="cm-imp">' + ic("download") + 'Import existing</button><button class="btn pri" id="cm-new">' + ic("plus") + "New " + t.one + "</button>") +
        '<div class="card"><div class="card-h"><h3>All ' + t.many + '</h3><input id="cm-q" class="sm-in" placeholder="Search…"></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Title</th><th>Status</th><th>Address</th><th>Updated</th><th></th></tr></thead><tbody id="cm-rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody></table></div></div>';
      W.fillIcons(el);
      var items = [];
      function draw() {
        var q = $("#cm-q").value.toLowerCase(), rows = items.filter(function (x) { return !q || (x.title + " " + x.slug).toLowerCase().indexOf(q) > -1; });
        $("#cm-rows").innerHTML = rows.map(function (x) {
          var img = ((x.data || {}).card || {}).src || ((x.data || {}).hero || {}).src || "";
          return '<tr data-id="' + x.id + '" class="click"><td><div class="cm-t"><span class="cm-th" style="background-image:url(\'' + esc(img) + "')\"></span><div><b>" + esc(x.title) + "</b><small>" + esc((x.data || {}).kicker || "") + "</small></div></div></td><td>" + badge(x) + "</td><td>" + (x.rel ? '<a href="/' + t.folder + "/" + esc(x.slug) + '/" target="_blank" onclick="event.stopPropagation()">/' + t.folder + "/" + esc(x.slug) + "/</a>" : '<span class="muted">/' + t.folder + "/" + esc(x.slug) + "/</span>") + "</td><td class=\"muted\">" + esc(W.ago ? W.ago(x.updated_at) : x.updated_at) + "<br><small>" + esc(x.updated_by || "") + '</small></td><td class="r">' + ic("chevron-right") + "</td></tr>";
        }).join("") || '<tr><td colspan="5"><div class="empty">' + ic("file-text") + "<p>No " + t.many + ' yet.</p><p class="muted">Use <b>Import existing</b> to bring in the ' + t.many + " already on the site, or start a new one.</p></div></td></tr>";
        W.fillIcons($("#cm-rows"));
      }
      function load() { api("cms_list", { type: type }).then(function (r) { if (!r.ok) return toast(r.error, true); items = r.items; aiReady = r.aiReady; draw(); }); }
      load();
      $("#cm-q").oninput = draw;
      $("#cm-rows").onclick = function (e) { var tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/" + t.ed + "/" + tr.dataset.id; };
      $("#cm-new").onclick = function () { location.hash = "#/" + t.ed + "/new"; };
      $("#cm-imp").onclick = function () { importPages(type, items, load); };
      $("#cm-ai").onclick = aiSettings;
    };
  }

  // ------------------------------------------------------------------ page editor (post / study)

  // ------------------------------------------------------------------ Phase 14: article templates + AI SEO writer
  var H = function (t) { return { t: "h", text: t }; }, P = function (hint) { return { t: "p", text: "", hint: hint }; }, L = function () { return { t: "list", items: [] }; };
  var TPL = {
    cost: { name: "Cost guide", icon: "💰", cat: "Cost guide", kicker: "Cost guide", desc: "Prices, what affects them, a cost table and FAQs.", title: "How much does [X] cost in Pakistan? (2026 guide)",
      blocks: function () { return [H("The quick answer"), P("Give the price range in PKR in 2–3 sentences."), { t: "table", text: "Scope | Budget | Mid-range | Premium\n | | | " }, H("What affects the cost"), L(), H("Cost by size"), { t: "table", text: "Size | Approx. cost\n | " }, H("How to save without cutting quality"), L(), H("An example budget"), P("Walk through one real-looking example."), { t: "cta", title: "Get an exact quote for your space", text: "Book a free site visit in Lahore and get a detailed quotation.", label: "Book a site visit", href: "/contact/" }, H("Frequently asked questions"), { t: "faq", text: "" }]; } },
    howto: { name: "How-to guide", icon: "🪜", cat: "Guide", kicker: "Step-by-step guide", desc: "Numbered steps, what you need, common mistakes.", title: "How to [do X]: a step-by-step guide",
      blocks: function () { return [P("Intro: who this is for and what they will get."), H("Before you start"), L(), H("Step 1: "), P(""), H("Step 2: "), P(""), H("Step 3: "), P(""), H("Step 4: "), P(""), H("Common mistakes to avoid"), L(), { t: "cta", title: "Want experts to handle it?", text: "Our team designs and builds it for you, start to finish.", label: "Talk to our team", href: "/contact/" }, H("Frequently asked questions"), { t: "faq", text: "" }]; } },
    story: { name: "Project story", icon: "🖼️", cat: "Project story", kicker: "Project story", desc: "Brief, before/after slider, design moves, gallery, result.", title: "[Project name]: from [before] to [after]",
      blocks: function () { return [H("The brief"), P("Who the client is, the space, what they wanted."), { t: "ba", before: "", after: "", caption: "" }, H("The challenges"), P(""), H("Our design moves"), L(), { t: "gallery", imgs: [], caption: "" }, H("Materials and finishes"), { t: "table", text: "Area | Material | Finish\n | | " }, { t: "quote", text: "" }, H("The result"), P(""), { t: "cta", title: "Planning something similar?", text: "See what we can do for your home or office.", label: "Start your project", href: "/contact/" }]; } },
    ideas: { name: "Ideas & trends list", icon: "💡", cat: "Ideas", kicker: "Design ideas", desc: "Numbered ideas with photos and tips.", title: "[N] [topic] ideas for Pakistani homes in 2026",
      blocks: function () { return [P("Intro: why these ideas matter now."), H("1. "), P(""), H("2. "), P(""), H("3. "), P(""), H("4. "), P(""), H("5. "), P(""), { t: "gallery", imgs: [], caption: "" }, H("How to choose the right idea for your space"), P(""), { t: "cta", title: "Need help choosing?", text: "Get a 3D view of your space before you build.", label: "Book a consultation", href: "/contact/" }, H("Frequently asked questions"), { t: "faq", text: "" }]; } },
    compare: { name: "Comparison (A vs B)", icon: "⚖️", cat: "Comparison", kicker: "Comparison", desc: "Quick verdict, side-by-side table, pros and cons.", title: "[A] vs [B]: which is better for your home?",
      blocks: function () { return [H("The quick verdict"), P("Answer the question in 2–3 sentences."), { t: "table", text: "Feature | A | B\nCost | | \nDurability | | \nLooks | | \nMaintenance | | " }, H("A: pros and cons"), L(), H("B: pros and cons"), L(), H("Cost comparison in Pakistan"), { t: "table", text: "Item | A | B\n | | " }, H("Which one is right for you?"), P(""), { t: "cta", title: "Still not sure?", text: "Our designers will recommend the best option for your budget.", label: "Ask a designer", href: "/contact/" }, H("Frequently asked questions"), { t: "faq", text: "" }]; } }
  };
  function tplStructure(k) { return TPL[k].blocks().map(function (b) { return b.t === "h" ? "H2: " + (b.text || "(heading)") : b.t === "p" ? "paragraph" + (b.hint ? " (" + b.hint + ")" : "") : b.t === "table" ? "table (header: " + b.text.split("\n")[0] + ")" : b.t; }).join("\n"); }
  function applyAi(d, it, j) {
    if (j.title) it.title = j.title; if (j.dek) d.dek = j.dek; if (j.kicker) d.kicker = j.kicker;
    if (Array.isArray(j.blocks)) d.blocks = j.blocks.map(function (b) {
      var t = b.t || b.type;
      if (t === "list") return b.ol ? { t: "list", ol: true, items: (b.items || []).map(String) } : { t: "list", items: (b.items || []).map(String) };
      if (t === "table") return { t: "table", text: Array.isArray(b.rows) ? b.rows.map(function (r) { return [].concat(r).join(" | "); }).join("\n") : String(b.text || "") };
      if (t === "faq") return { t: "faq", text: Array.isArray(b.items) ? b.items.map(function (f) { return f.q + "\n" + f.a; }).join("\n\n") : String(b.text || "") };
      if (t === "cta") return { t: "cta", title: b.title || "", text: b.text || "", label: b.label || "Book a free consultation", href: b.href || "/contact/" };
      if (t === "ba") return { t: "ba", before: "", after: "", caption: b.caption || b.text || "" };
      if (t === "gallery") return { t: "gallery", imgs: [], caption: b.caption || b.text || "" };
      if (t === "img") return { t: "img", src: "", alt: b.alt || "", caption: b.caption || "" };
      return { t: t === "h" || t === "quote" ? t : "p", text: String(b.text || "") };
    });
    if (Array.isArray(j.summary)) d.summary = j.summary.map(String);
    if (Array.isArray(j.faqs)) d.faqs = j.faqs.filter(function (f) { return f && f.q; });
    if (j.category) { var m = (d.meta || []).find(function (x) { return x.k === "Category"; }); if (m) m.v = j.category; }
    if (j.readMin) { var r = (d.meta || []).find(function (x) { return x.k === "Read time"; }); if (r) r.v = j.readMin + " min read"; }
    it.seo = Object.assign({}, it.seo, { title: j.seoTitle || it.seo.title || "", desc: j.seoDesc || it.seo.desc || "", kw: j.kw || it.seo.kw || "" });
  }
  function newData(type) {
    return type === "post"
      ? { kicker: "", dek: "", hero: {}, meta: [{ k: "Category", v: "" }, { k: "Read time", v: "5 min read" }, { k: "Studio", v: "Woodex Studio" }], blocks: [{ t: "h", text: "" }, { t: "p", text: "" }], summary: [], faqs: [], quote: "", related: [], card: {} }
      : { kicker: "Illustrative design study", dek: "", hero: {}, meta: [{ k: "Project type", v: "" }, { k: "Setting", v: "" }, { k: "Year", v: String(new Date().getFullYear()) }, { k: "Size", v: "" }], facts: [{ k: "Scope", v: "" }, { k: "Key move", v: "" }, { k: "Materials", v: "" }], factsNote: "", blocks: [{ t: "h", text: "The brief" }, { t: "p", text: "" }, { t: "h", text: "The moves" }, { t: "list", items: [""] }, { t: "h", text: "Takeaways" }, { t: "p", text: "" }], quote: "", related: [], card: {} };
  }
  function editorView(type) {
    return function (el, parts) {
      var t = T[type], id = parts[0] === "new" ? 0 : +parts[0], it, others = [], faqGroups = [];
      el.innerHTML = '<p class="muted">Loading…</p>';
      Promise.all([id ? api("cms_get", { id: id }) : Promise.resolve({ ok: true, item: { type: type, title: "", slug: "", status: "draft", data: newData(type), seo: {} } }), api("cms_list", { type: type }), api("cms_list", { type: "faq" })]).then(function (rs) {
        if (!rs[0].ok) { el.innerHTML = '<div class="card card-b">' + esc(rs[0].error) + "</div>"; return; }
        it = rs[0].item; others = (rs[1].items || []).filter(function (x) { return x.id !== it.id; }); aiReady = rs[1].aiReady; faqGroups = rs[2].items || [];
        it.data = Object.assign(newData(type), it.data || {}); it.seo = it.seo || {};
        draw();
      });
      var d, dirty = false;
      function mark() { dirty = true; var b = $("#ce-dirty"); if (b) b.hidden = false; }
      function kv(list, cls, k1, k2) { return (list || []).map(function (m, i) { return '<div class="kvr ' + cls + '" data-i="' + i + '"><input data-k="k" value="' + esc(m.k) + '" placeholder="' + k1 + '"><input data-k="v" value="' + esc(m.v) + '" placeholder="' + k2 + '"><button type="button" class="btn sm ghost" data-del>' + ic("x") + "</button></div>"; }).join(""); }
      function blk(b, i) {
        var tools = '<div class="bk-tools"><span class="bk-type">' + ({ h: "Heading", p: "Paragraph", list: "List", img: "Image", quote: "Quote", table: "Table", faq: "FAQ", cta: "Call to action", ba: "Before / after", gallery: "Gallery" }[b.t]) + '</span><button type="button" class="btn sm ghost" data-up title="Move up">' + ic("arrow-up") + '</button><button type="button" class="btn sm ghost" data-dn title="Move down">' + ic("arrow-down") + '</button><button type="button" class="btn sm ghost" data-rm title="Remove">' + ic("x") + "</button></div>";
        var body;
        if (b.t === "h") body = '<input class="bk-h" data-f="text" value="' + esc(b.text) + '" placeholder="Section heading">';
        else if (b.t === "p") body = '<textarea data-f="text" rows="3" placeholder="' + esc(b.hint || "Paragraph. Use **bold**, *italic*, [link](/contact/)") + '">' + esc(b.text) + "</textarea>" + (aiReady ? '<button type="button" class="btn sm ai bk-ai" data-improve>' + ic("sparkles") + "Improve</button>" : "");
        else if (b.t === "list") body = '<textarea data-f="items" rows="4" placeholder="One point per line. **Label:** text">' + esc((b.items || []).join("\n")) + "</textarea>" + '<label class="check" style="margin-top:6px"><input type="checkbox" data-f="ol"' + (b.ol ? " checked" : "") + '> Numbered list (1, 2, 3)</label>';
        else if (b.t === "quote") body = '<textarea data-f="text" rows="2" placeholder="Quote">' + esc(b.text) + "</textarea>";
        else if (b.t === "table") body = '<textarea data-f="text" rows="5" style="font-family:monospace;font-size:13px" placeholder="Item | Budget | Premium&#10;Kitchen | Rs 8 lakh | Rs 20 lakh&#10;(first line = header, use | between columns)">' + esc(b.text) + "</textarea>";
        else if (b.t === "faq") body = '<textarea data-f="text" rows="6" placeholder="Question one?&#10;Answer in 1–3 sentences.&#10;&#10;Question two?&#10;Answer…">' + esc(b.text) + "</textarea>";
        else if (b.t === "cta") body = '<input data-f="title" value="' + esc(b.title) + '" placeholder="Heading, e.g. Planning a renovation?"><textarea data-f="text" rows="2" placeholder="One line of text" style="margin-top:6px">' + esc(b.text) + '</textarea><div class="g2" style="margin-top:6px"><input data-f="label" value="' + esc(b.label) + '" placeholder="Button text (Book a free consultation)"><input data-f="href" value="' + esc(b.href) + '" placeholder="/contact/"></div>';
        else if (b.t === "ba") body = '<div class="g2">' + ["before", "after"].map(function (k) { return '<div><small class="muted">' + (k === "before" ? "Before" : "After") + '</small><div class="imf-p" style="height:110px;background-image:url(\'' + esc(b[k] || "") + '\')" data-pickb="' + k + '">' + (b[k] ? "" : ic("image")) + "</div></div>"; }).join("") + '</div><input data-f="caption" value="' + esc(b.caption) + '" placeholder="Caption (also used as alt text)" style="margin-top:6px">';
        else if (b.t === "gallery") body = '<div class="bk-gal" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px">' + (b.imgs || []).map(function (x, k) { return '<div style="position:relative"><div class="imf-p" style="height:70px;background-image:url(\'' + esc(x.src) + '\')"></div><button type="button" class="btn sm ghost" data-gx="' + k + '" style="position:absolute;top:2px;right:2px;padding:2px 5px" title="Remove">×</button></div>'; }).join("") + '<button type="button" class="btn sm" data-pickb="gal" style="height:70px">' + ic("plus") + 'Photo</button></div><input data-f="caption" value="' + esc(b.caption) + '" placeholder="Caption (also used as alt text)" style="margin-top:6px">';
        else body = '<div class="bk-img"><div class="imf-p" style="background-image:url(\'' + esc(b.src || "") + '\')" data-pickb>' + (b.src ? "" : ic("image")) + '</div><div class="bk-img-f"><input data-f="alt" value="' + esc(b.alt) + '" placeholder="Alt text (describe the photo)">' + (aiReady ? '<button type="button" class="btn sm ai" data-alt>' + ic("sparkles") + "Alt</button>" : "") + '<input data-f="caption" value="' + esc(b.caption) + '" placeholder="Caption (optional)"><button type="button" class="btn sm" data-pickb>' + (b.src ? "Change image" : "Choose image") + "</button></div></div>";
        return '<div class="bk bk-' + b.t + '" data-i="' + i + '">' + tools + body + "</div>";
      }
      // ---- P18 I: editor toolbar + Status / Visibility / Category / Tags side cards
      var CATS = ["Cost guides", "Design ideas", "Renovation", "Office fit-out", "Kitchens & wardrobes", "Materials", "Project stories"], lastF = null, lastMin = 0;
      function edToolbar() {
        var f = [["b", "<b>B</b>", "Bold (Ctrl+B)"], ["i", "<i>I</i>", "Italic (Ctrl+I)"], ["link", ic("link") , "Link (Ctrl+K)"]];
        var n = [["h", "H2", "Insert heading"], ["p", "¶", "Insert paragraph"], ["list", "• List", "Insert list"], ["quote", "❝ Quote", "Insert quote"], ["img", ic("image") + "Image", "Insert image"], ["table", "▦ Table", "Insert table"]];
        return '<div class="ce-tb" id="ce-tb">' + f.map(function (x) { return '<button type="button" data-fmt="' + x[0] + '" title="' + x[2] + '">' + x[1] + "</button>"; }).join("") + '<span class="ce-tb-sep"></span>' +
          n.map(function (x) { return '<button type="button" data-ins="' + x[0] + '" title="' + x[2] + ' after the current block">' + x[1] + "</button>"; }).join("") + '<span class="ce-tb-wc" id="ce-tb-wc"></span></div>';
      }
      function sideCards() {
        var cats = CATS.slice(); others.concat([it]).forEach(function (o) { var c = ((o.data || {}).category || "").trim(); if (c && cats.indexOf(c) < 0) cats.push(c); });
        if (d.category == null) d.category = metaVal(d, "Category") || "";
        var cats2 = d.category && cats.indexOf(d.category) < 0 ? cats.push(d.category) : 0;
        var vis = d.visibility === "unlisted" ? "unlisted" : "public";
        return '<div class="card card-b"><h4 class="side-h">Status &amp; visibility</h4><dl class="ce-dl"><dt>Status</dt><dd>' + badge(it) + '</dd><dt>Words</dt><dd id="ce-wc">0</dd><dt>Reading time</dt><dd id="ce-rt">–</dd>' + (it.updated_at ? "<dt>Last saved</dt><dd>" + esc(String(it.updated_at).slice(0, 16)) + "</dd>" : "") + "</dl>" +
          '<div class="ce-vis">' + [["public", "Public", "On the Insights page and in Google"], ["unlisted", "Unlisted", "Only people with the link. Hidden from Insights, the sitemap and Google"]].map(function (v) { return '<label class="ce-vo' + (vis === v[0] ? " on" : "") + '"><input type="radio" name="ce-vis" value="' + v[0] + '"' + (vis === v[0] ? " checked" : "") + "><span><b>" + v[1] + "</b><small>" + v[2] + "</small></span></label>"; }).join("") + "</div></div>" +
          '<div class="card card-b"><h4 class="side-h">Category</h4><select id="ce-cat"><option value="">No category</option>' + cats.map(function (c) { return '<option' + (d.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + '<option value="__new">+ New category…</option></select><small class="muted">Shown on the blog card (unless you set a card label below).</small></div>' +
          '<div class="card card-b"><h4 class="side-h">Tags</h4><div class="ce-tags" id="ce-tags"></div><small class="muted">Up to 8. Press Enter or comma to add.</small></div>';
      }
      function drawTags() { var b = $("#ce-tags"); if (!b) return; b.innerHTML = (d.tags || []).map(function (t, i) { return '<span class="ce-chip">' + esc(t) + '<button type="button" data-tx="' + i + '" aria-label="Remove">×</button></span>'; }).join("") + ((d.tags || []).length < 8 ? '<input id="ce-tag-in" placeholder="' + ((d.tags || []).length ? "Add…" : "e.g. modern, Lahore, small spaces") + '">' : ""); }
      function wordCount() {
        var txt = [$("#ce-dek") && $("#ce-dek").value].concat($$("#ce-blocks textarea, #ce-blocks input[data-f]").map(function (x) { return x.value; })).concat([$("#ce-sum") && $("#ce-sum").value]).join(" ");
        var n = (txt.replace(/[*_#>\[\]()|]/g, " ").match(/[\w\u0600-\u06FF'’-]+/g) || []).length, m = Math.max(1, Math.round(n / 200));
        if ($("#ce-wc")) { $("#ce-wc").textContent = n.toLocaleString(); $("#ce-rt").textContent = m + " min"; }
        lastMin = m;
        if ($("#ce-tb-wc")) $("#ce-tb-wc").textContent = n.toLocaleString() + " words · " + m + " min read";
      }
      function wrapSel(el, a, b, ph) {
        var s0 = el.selectionStart, s1 = el.selectionEnd, v = el.value, sel = v.slice(s0, s1) || ph;
        el.value = v.slice(0, s0) + a + sel + b + v.slice(s1); el.focus(); el.setSelectionRange(s0 + a.length, s0 + a.length + sel.length); el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      function fmt(k) {
        var el = lastF && document.body.contains(lastF) ? lastF : null; if (!el) return toast("Click inside a paragraph first", true);
        if (k === "b") wrapSel(el, "**", "**", "bold text"); else if (k === "i") wrapSel(el, "*", "*", "italic text");
        else { var u = prompt("Link address (e.g. /contact/ or https://…)", "/contact/"); if (u) wrapSel(el, "[", "](" + u.trim() + ")", "link text"); }
      }
      function insBlock(k) {
        collect(); var cur = lastF && lastF.closest && lastF.closest("#ce-blocks .bk"), at = cur ? +cur.dataset.i + 1 : d.blocks.length;
        var nb = k === "list" ? { t: k, items: [] } : k === "img" ? { t: k, src: "", alt: "", caption: "" } : { t: k, text: "" };
        d.blocks.splice(at, 0, nb); redrawBlocks(); mark(); wordCount();
        var nel = $('#ce-blocks .bk[data-i="' + at + '"]'); if (nel) { nel.scrollIntoView({ block: "center", behavior: "smooth" }); var f = $("textarea,input", nel); if (f) f.focus(); nel.classList.add("bk-new"); setTimeout(function () { nel.classList.remove("bk-new"); }, 1200); }
      }
      function bindP18i(R) {
        R.addEventListener("focusin", function (e) { if (e.target.matches("#ce-blocks textarea, #ce-blocks input[data-f], #ce-sum, #ce-dek, #ce-faqs textarea")) lastF = e.target; });
        R.addEventListener("keydown", function (e) { if (!(e.ctrlKey || e.metaKey) || !e.target.matches("textarea, #ce-blocks input[data-f]")) return; var k = { b: "b", i: "i", k: "link" }[e.key.toLowerCase()]; if (!k) return; e.preventDefault(); lastF = e.target; fmt(k); });
        $("#ce-tb").addEventListener("mousedown", function (e) { if (e.target.closest("button")) e.preventDefault(); }); // keep the text selection
        $("#ce-tb").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; if (b.dataset.fmt) fmt(b.dataset.fmt); else if (b.dataset.ins) insBlock(b.dataset.ins); };
        R.addEventListener("input", wordCount); wordCount();
        if (type !== "post") return;
        drawTags();
        R.addEventListener("change", function (e) { if (e.target.name !== "ce-vis") return; $$(".ce-vo", R).forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); }); mark(); });
        $("#ce-cat").onchange = function () { if (this.value !== "__new") return mark(); var n = (prompt("New category name") || "").trim().slice(0, 40); if (!n) { this.value = d.category || ""; return; } var o = document.createElement("option"); o.textContent = n; this.insertBefore(o, this.lastElementChild); this.value = n; mark(); };
        var tb = $("#ce-tags");
        tb.onclick = function (e) { var x = e.target.closest("[data-tx]"); if (x) { d.tags.splice(+x.dataset.tx, 1); drawTags(); mark(); var i = $("#ce-tag-in"); if (i) i.focus(); } else if ($("#ce-tag-in")) $("#ce-tag-in").focus(); };
        tb.addEventListener("keydown", function (e) {
          var i = e.target; if (i.id !== "ce-tag-in") return;
          if ((e.key === "Enter" || e.key === ",") && i.value.trim()) { e.preventDefault(); var v = i.value.replace(/,/g, "").trim().toLowerCase().slice(0, 30); d.tags = d.tags || []; if (v && d.tags.indexOf(v) < 0 && d.tags.length < 8) d.tags.push(v); drawTags(); mark(); var n = $("#ce-tag-in"); if (n) n.focus(); }
          else if (e.key === "Backspace" && !i.value && (d.tags || []).length) { d.tags.pop(); drawTags(); mark(); var m = $("#ce-tag-in"); if (m) m.focus(); }
          else if (e.key === "Enter") e.preventDefault();
        });
      }
      function draw() {
        d = it.data;
        var live = !!it.rel, seo = it.seo;
        el.innerHTML = '<div id="ce">' + head(it.title || "New " + t.one, t.title + " / " + (it.title || "New"), '<span class="badge" id="ce-dirty" hidden>Unsaved</span>' + badge(it) + '<button class="btn" id="ce-prev">' + ic("eye") + "Preview</button>" + (live ? '<a class="btn" target="_blank" href="/' + t.folder + "/" + esc(it.slug) + '/">' + ic("external-link") + "View live</a>" : "")) +
          (it.imported && !it.republished ? '<div class="banner">' + ic("info") + " Imported from the live page. Check <b>Preview</b> before you publish: the page is rebuilt from these fields.</div>" : "") +
          '<div class="qe"><div class="qe-main">' +
          '<div class="card card-b"><label>Title<input id="ce-title" value="' + esc(it.title) + '" placeholder="' + (type === "post" ? "What interior design costs in Pakistan" : "A house around a courtyard") + '"></label>' +
          '<div class="g2"><label>Kicker <small>(small line above the title)</small><input id="ce-kicker" value="' + esc(d.kicker) + '"></label><label>Page address<div class="pre-in"><span>/' + t.folder + '/</span><input id="ce-slug" value="' + esc(it.slug) + '"' + (live ? " disabled" : "") + "></div></label></div>" +
          '<label>Standfirst <small>(one sentence under the title)</small><textarea id="ce-dek" rows="2">' + esc(d.dek) + "</textarea></label>" +
          '<label>Template <small>(layout &amp; sections — manage in Content → Templates)</small><select id="ce-tpl" data-cur="' + esc(d.tpl || "") + '">' + (W.tplOptions ? W.tplOptions(type, d.tpl) : '<option value="">Default layout</option>') + "</select></label>" +
          imgField("ce-hero", (d.hero || {}).src, "Hero image") +
          '<h4 class="sub-h">Details strip</h4><div id="ce-meta">' + kv(d.meta, "meta", "Label", "Value") + '</div><button type="button" class="btn sm" id="ce-meta-add">' + ic("plus") + "Add detail</button></div>" +
          (type === "study" ? '<div class="card card-b"><h4 class="sub-h" style="margin-top:0">Facts box <small>(sidebar)</small></h4><label>Box title<input id="ce-ft" value="' + esc(d.factsTitle || "Study facts") + '"></label><div id="ce-facts">' + kv(d.facts, "fact", "Label", "Text") + '</div><button type="button" class="btn sm" id="ce-fact-add">' + ic("plus") + 'Add fact</button><label style="margin-top:12px">Note under the facts<input id="ce-fn" value="' + esc(d.factsNote) + '" placeholder="Illustrative design study. Not built work, not a client project."></label></div>' : "") +
          '<div class="card"><div class="card-h"><h3>Content</h3>' + (type === "post" ? '<div class="toolbar"><button type="button" class="btn sm" id="ce-tpl">' + ic("blocks") + "Templates</button>" + (aiReady ? aiBtn("ce-ai-writer", "AI SEO writer") + aiBtn("ce-ai-draft", "Quick draft") : '<button type="button" class="btn sm" id="ce-ai-writer" title="Add an AI key in AI settings">' + ic("sparkles") + "AI SEO writer</button>") + "</div>" : "") + '</div><div class="card-b">' + edToolbar() + '<div id="ce-blocks" class="bks">' + d.blocks.map(blk).join("") + '</div><div class="bk-add"><span class="muted">Add:</span>' + [["h", "Heading"], ["p", "Paragraph"], ["list", "List"], ["img", "Image"], ["quote", "Quote"], ["table", "Table"], ["faq", "FAQ"], ["cta", "Call to action"], ["ba", "Before / after"], ["gallery", "Gallery"]].map(function (x) { return '<button type="button" class="btn sm" data-add="' + x[0] + '">' + ic("plus") + x[1] + "</button>"; }).join("") + "</div></div></div>" +
          (type === "post" ? '<div class="card card-b"><h4 class="sub-h" style="margin-top:0">The short version <small>(takeaway bullets, optional)</small></h4><textarea id="ce-sum" rows="3" placeholder="One point per line. **Label:** text">' + esc((d.summary || []).join("\n")) + "</textarea></div>" +
            '<div class="card"><div class="card-h"><h3>FAQs</h3><div class="toolbar">' + (faqGroups.length ? '<select id="ce-fg" class="sm-in"><option value="">Use FAQ group…</option><optgroup label="Link (stays in sync)">' + faqGroups.map(function (g) { return '<option value="L' + g.id + '">' + esc(g.title) + " (" + ((g.data || {}).items || []).length + ")</option>"; }).join("") + '</optgroup><optgroup label="Copy questions (edit here)">' + faqGroups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.title) + "</option>"; }).join("") + "</optgroup></select>" : "") + (aiReady ? aiBtn("ce-ai-faq", "Suggest FAQs") : "") + '</div></div><div class="card-b"><div id="ce-fg-link"></div><div id="ce-faqs">' + faqRows(d.faqs) + '</div><button type="button" class="btn sm" id="ce-faq-add">' + ic("plus") + "Add question</button></div></div>" : "") +
          '<div class="card card-b"><label>Pull quote <small>(big quote band, optional)</small><input id="ce-quote" value="' + esc(d.quote) + '"></label><label>Call-to-action heading <small>(leave empty to keep the default)</small><input id="ce-cta" value="' + esc(d.ctaTitle || "") + '"></label>' +
          '<label>Related ' + t.many + ' <small>(up to 3)</small></label><div class="rel-l">' + (others.length ? others.map(function (o) { return '<label class="check"><input type="checkbox" value="' + esc(o.slug) + '"' + ((d.related || []).indexOf(o.slug) > -1 ? " checked" : "") + "> " + esc(o.title) + "</label>"; }).join("") : '<span class="muted">Import or create more ' + t.many + " to link them.</span>") + "</div></div>" +
          '</div><div class="qe-side">' +
          '<div class="card card-b"><h4 class="side-h">Publish</h4>' + (it.status === "scheduled" ? '<p class="muted" style="margin:0 0 10px">Goes live ' + esc(fmtLocal(it.publishAt)) + "</p>" : "") +
          '<button class="btn pri blk" id="ce-pub">' + ic("send") + (live ? "Publish changes" : "Publish now") + "</button>" +
          (live ? "" : '<div class="sched"><input type="datetime-local" id="ce-at" value="' + esc(utcToLocal(it.publishAt)) + '"><button class="btn" id="ce-sch">' + ic("clock") + "Schedule</button></div>") +
          '<button class="btn blk" id="ce-save">' + ic("save") + (live ? "Save without publishing" : "Save draft") + "</button>" + (it.status === "scheduled" ? '<button class="btn blk ghost" id="ce-unsch">Cancel schedule</button>' : "") +
          (it.id && !live ? '<button class="btn blk ghost danger" id="ce-del">Delete draft</button>' : "") + "</div>" +
          (type === "post" ? sideCards() : "") +
          '<div class="card card-b"><div class="side-hr"><h4 class="side-h">Search & sharing</h4>' + (aiReady ? aiBtn("ce-ai-seo", "Write") : "") + '</div><label>SEO title <small id="ce-stc"></small><input id="ce-st" value="' + esc(seo.title) + '" placeholder="Title | Woodex Interior"></label><label>Meta description <small id="ce-sdc"></small><textarea id="ce-sd" rows="3">' + esc(seo.desc) + "</textarea></label>" + imgField("ce-og", seo.og, "Share image (defaults to hero)") +
            '<label>Focus keyphrase<input id="ce-kw" value="' + esc(seo.kw || "") + '" placeholder="e.g. interior design cost Pakistan"></label><button type="button" class="btn sm" id="ce-seo-an">' + ic("search") + 'SEO check</button><div id="ce-seo-r" style="margin-top:10px"></div>' +
          '<div class="serp"><span id="sp-u"></span><b id="sp-t"></b><p id="sp-d"></p></div></div>' +
          '<div class="card card-b"><div class="side-hr"><h4 class="side-h">Listing card</h4>' + (aiReady ? aiBtn("ce-ai-card", "Write") : "") + "</div>" + imgField("ce-card", (d.card || {}).src, "Card image (defaults to hero)") + '<label>Card text<textarea id="ce-ct" rows="2">' + esc((d.card || {}).text) + '</textarea></label><label>Card label <small>(e.g. "5 min read", "Study · 2026")</small><input id="ce-cl" value="' + esc((d.card || {}).tag) + '"></label></div>' +
          "</div></div></div>";
        W.fillIcons(el); bind();
      }
      function faqRows(f) { return (f || []).map(function (x, i) { return '<div class="fq" data-i="' + i + '"><input data-k="q" value="' + esc(x.q) + '" placeholder="Question"><textarea data-k="a" rows="2" placeholder="Answer">' + esc(x.a) + '</textarea><button type="button" class="btn sm ghost" data-del>' + ic("x") + "</button></div>"; }).join(""); }
      function collect() {
        it.title = $("#ce-title").value.trim(); if (!it.rel) it.slug = $("#ce-slug").value.trim();
        if ($("#ce-tpl")) { var tv = +$("#ce-tpl").value || 0; if (tv) d.tpl = tv; else delete d.tpl; }
        d.kicker = $("#ce-kicker").value.trim(); d.dek = $("#ce-dek").value.trim(); d.hero = { src: imgVal("ce-hero") };
        d.meta = $$("#ce-meta .kvr").map(function (r) { return { k: $("[data-k=k]", r).value.trim(), v: $("[data-k=v]", r).value.trim() }; });
        if (type === "study") { d.factsTitle = $("#ce-ft").value.trim(); d.factsNote = $("#ce-fn").value.trim(); d.facts = $$("#ce-facts .kvr").map(function (r) { return { k: $("[data-k=k]", r).value.trim(), v: $("[data-k=v]", r).value.trim() }; }); }
        d.blocks = $$("#ce-blocks .bk").map(function (b) {
          var o = d.blocks[+b.dataset.i] || {}, x = { t: o.t };
          if (o.t === "list") x.items = $("[data-f=items]", b).value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); if (o.t === "list" && $("[data-f=ol]", b) && $("[data-f=ol]", b).checked) x.ol = true;
          else if (o.t === "img") { x.src = o.src || ""; x.alt = $("[data-f=alt]", b).value.trim(); x.caption = $("[data-f=caption]", b).value.trim(); }
          else if (o.t === "ba") { x.before = o.before || ""; x.after = o.after || ""; x.caption = $("[data-f=caption]", b).value.trim(); }
          else if (o.t === "gallery") { x.imgs = (o.imgs || []).slice(); x.caption = $("[data-f=caption]", b).value.trim(); }
          else if (o.t === "cta") { ["title", "text", "label", "href"].forEach(function (k) { x[k] = $("[data-f=" + k + "]", b).value.trim(); }); }
          else x.text = $("[data-f=text]", b).value.trim();
          if (o.hint) x.hint = o.hint;
          return x;
        });
        if (type === "post") { d.summary = $("#ce-sum").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); d.faqs = $$("#ce-faqs .fq").map(function (r) { return { q: $("[data-k=q]", r).value.trim(), a: $("[data-k=a]", r).value.trim() }; }).filter(function (f) { return f.q || f.a; }); }
        d.quote = $("#ce-quote").value.trim(); d.ctaTitle = $("#ce-cta").value.trim();
        d.related = $$(".rel-l input:checked").map(function (c) { return c.value; }).slice(0, 3);
        d.card = { src: imgVal("ce-card"), text: $("#ce-ct").value.trim(), tag: $("#ce-cl").value.trim(), alt: (d.card || {}).alt || "" };
        if (type === "post" && $("#ce-cat")) { d.visibility = ($("[name=ce-vis]:checked") || {}).value === "unlisted" ? "unlisted" : "public"; var cv = $("#ce-cat").value; d.category = cv === "__new" ? "" : cv; var ti = $("#ce-tag-in"); if (ti && ti.value.trim()) { var tv = ti.value.trim().toLowerCase().slice(0, 30); d.tags = d.tags || []; if (d.tags.indexOf(tv) < 0 && d.tags.length < 8) d.tags.push(tv); ti.value = ""; } d.tags = (d.tags || []).slice(0, 8); 
          (d.meta || []).forEach(function (m) { var k = String(m.k).toLowerCase(); if (k === "category" && d.category) m.v = d.category; if (k === "read time" && lastMin) m.v = lastMin + " min read"; }); }
        it.seo = { title: $("#ce-st").value.trim(), desc: $("#ce-sd").value.trim(), og: imgVal("ce-og"), kw: ($("#ce-kw") || { value: "" }).value.trim(), related: (it.seo || {}).related || [] };
      }
      function redrawBlocks() { $("#ce-blocks").innerHTML = d.blocks.map(blk).join(""); W.fillIcons($("#ce-blocks")); }
      function serp() {
        var ti = $("#ce-st").value || ($("#ce-title").value + " | Woodex Interior"), de = $("#ce-sd").value || $("#ce-dek").value;
        $("#sp-u").textContent = "woodex.com.pk › " + t.folder + " › " + ($("#ce-slug").value || "…"); $("#sp-t").textContent = ti; $("#sp-d").textContent = de;
        var a = ti.length, b = de.length; $("#ce-stc").textContent = a + "/60"; $("#ce-stc").className = a > 60 ? "bad" : ""; $("#ce-sdc").textContent = b + "/158"; $("#ce-sdc").className = b > 158 || (b && b < 110) ? "warnc" : "";
      }
      function bind() {
        serp(); var R = $("#ce"); bindP18i(R);
        R.addEventListener("input", function () { mark(); serp(); });
        $("#ce-title").addEventListener("input", function () { if (!it.rel && !it.id && !it._slugTouched) $("#ce-slug").value = slugify(this.value); serp(); });
        $("#ce-slug").addEventListener("input", function () { it._slugTouched = true; this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); });
        ["ce-hero", "ce-og", "ce-card"].forEach(function (k) { bindImg(k, mark); });
        function kvAdd(box, cls, a, b) { collect(); var div = document.createElement("div"); div.innerHTML = kv([{ k: "", v: "" }], cls, a, b); $(box).appendChild(div.firstChild); W.fillIcons($(box)); }
        $("#ce-meta-add").onclick = function () { kvAdd("#ce-meta", "meta", "Label", "Value"); };
        if ($("#ce-fact-add")) $("#ce-fact-add").onclick = function () { kvAdd("#ce-facts", "fact", "Label", "Text"); };
        R.addEventListener("click", function (e) { var x = e.target.closest(".kvr [data-del],.fq [data-del]"); if (x) { x.parentNode.remove(); mark(); } });
        $("#ce-blocks").onclick = function (e) {
          var b = e.target.closest(".bk"); if (!b) return; var i = +b.dataset.i; collect();
          if (e.target.closest("[data-up]") && i > 0) { d.blocks.splice(i - 1, 0, d.blocks.splice(i, 1)[0]); redrawBlocks(); mark(); }
          else if (e.target.closest("[data-dn]") && i < d.blocks.length - 1) { d.blocks.splice(i + 1, 0, d.blocks.splice(i, 1)[0]); redrawBlocks(); mark(); }
          else if (e.target.closest("[data-rm]")) { d.blocks.splice(i, 1); redrawBlocks(); mark(); }
          else if (e.target.closest("[data-gx]")) { d.blocks[i].imgs.splice(+e.target.closest("[data-gx]").dataset.gx, 1); redrawBlocks(); mark(); }
          else if (e.target.closest("[data-pickb]")) { var pk = e.target.closest("[data-pickb]").dataset.pickb; pickImage(function (u) { collect(); var B = d.blocks[i]; if (pk === "gal") (B.imgs = B.imgs || []).push({ src: u, alt: "" }); else if (pk === "before" || pk === "after") B[pk] = u; else B.src = u; redrawBlocks(); mark(); }); }
          else if (e.target.closest("[data-improve]")) { var btn = e.target.closest("button"), ta = $("[data-f=text]", b); if (!ta.value.trim()) return; busy(btn, true); ai("improve", { text: ta.value }).then(function (tx) { ta.value = tx.trim(); mark(); }).catch(function () {}).then(function () { busy(btn, false); }); }
          else if (e.target.closest("[data-alt]")) { var bt = e.target.closest("button"); busy(bt, true); ai("alt", { file: d.blocks[i].src, context: $("#ce-title").value + ". " + ($("[data-f=caption]", b).value || "") }).then(function (tx) { $("[data-f=alt]", b).value = tx.trim().replace(/^"|"$/g, ""); mark(); }).catch(function () {}).then(function () { busy(bt, false); }); }
        };
        $$("[data-add]", R).forEach(function (bt) { bt.onclick = function () { collect(); var k = bt.dataset.add; d.blocks.push(k === "list" ? { t: k, items: [] } : k === "img" ? { t: k, src: "", alt: "", caption: "" } : k === "gallery" ? { t: k, imgs: [], caption: "" } : k === "ba" ? { t: k, before: "", after: "", caption: "" } : k === "cta" ? { t: k, title: "", text: "", label: "", href: "/contact/" } : { t: k, text: "" }); redrawBlocks(); mark(); var last = $("#ce-blocks .bk:last-child input,#ce-blocks .bk:last-child textarea"); if (last) last.focus(); if (k === "img") pickImage(function (u) { collect(); d.blocks[d.blocks.length - 1].src = u; redrawBlocks(); }); }; });
        if ($("#ce-faq-add")) $("#ce-faq-add").onclick = function () { collect(); d.faqs.push({ q: "", a: "" }); $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); };
        function fgLink() {
          var box = $("#ce-fg-link"); if (!box) return; var g = d.faqGroup ? faqGroups.find(function (x) { return x.id === +d.faqGroup; }) : null;
          $("#ce-faqs").hidden = $("#ce-faq-add").hidden = !!g;
          box.innerHTML = g ? '<div class="fg-linked">' + ic("link") + '<div><b>Linked to “' + esc(g.title) + '”</b><small>' + ((g.data || {}).items || []).length + ' questions · edit them in Content → FAQ groups and this page updates too.</small><ol>' + ((g.data || {}).items || []).map(function (f) { return "<li>" + esc(f.q) + "</li>"; }).join("") + '</ol></div><button type="button" class="btn sm" id="ce-fg-un">Unlink &amp; edit a copy</button></div>' : (d.faqGroup ? '<p class="muted">The linked FAQ group was deleted; the questions below are kept.</p>' : "");
          W.fillIcons(box);
          if ($("#ce-fg-un")) $("#ce-fg-un").onclick = function () { d.faqs = ((g.data || {}).items || []).map(function (f) { return { q: f.q, a: f.a }; }); delete d.faqGroup; $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); fgLink(); mark(); };
        }
        fgLink();
        if ($("#ce-fg")) $("#ce-fg").onchange = function () { if (this.value.charAt(0) === "L") { var lg = faqGroups.find(function (x) { return "L" + x.id === this.value; }, this); this.value = ""; if (!lg) return; collect(); d.faqGroup = lg.id; d.faqs = ((lg.data || {}).items || []).map(function (f) { return { q: f.q, a: f.a }; }); $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); fgLink(); mark(); return; } var g = faqGroups.find(function (x) { return x.id === +this.value; }, this); if (!g) return; collect(); d.faqs = d.faqs.concat(((g.data || {}).items || []).map(function (f) { return { q: f.q, a: f.a }; })); $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); this.value = ""; mark(); };
        // AI
        function bodyText() { collect(); return d.blocks.map(function (b) { return b.t === "list" ? (b.items || []).join("\n") : b.text || ""; }).join("\n\n"); }
        function tplPick(first) {
          modal("<h3>" + (first ? "Start a new article" : "Article templates") + '</h3><p class="muted">' + (first ? "Pick a template to start from, or begin with a blank page." : "Applying a template <b>replaces</b> the current content.") + '</p><div class="tp-g" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px">' +
            Object.keys(TPL).map(function (k) { return '<button type="button" class="card card-b" data-tp="' + k + '" style="text-align:left;cursor:pointer;border:1px solid var(--line,#e5e7eb)"><b>' + TPL[k].icon + " " + esc(TPL[k].name) + '</b><p class="muted" style="margin:6px 0 0;font-size:12.5px">' + esc(TPL[k].desc) + "</p></button>"; }).join("") +
            '</div><div class="modal-actions">' + (first ? '<button class="btn" id="tp-blank">Blank article</button>' : '<button class="btn" id="tp-blank">Cancel</button>') + (aiReady ? '<button class="btn pri" id="tp-ai">' + ic("sparkles") + "Let AI write it</button>" : "") + "</div>", "wide");
          W.fillIcons($(".modal") || document.body);
          $("#tp-blank").onclick = closeModal; if ($("#tp-ai")) $("#tp-ai").onclick = function () { closeModal(); writer(); };
          $$("[data-tp]").forEach(function (b) { b.onclick = function () { var k = b.dataset.tp, T2 = TPL[k]; collect(); d.blocks = T2.blocks(); if (!it.title) it.title = ""; if (!d.kicker) d.kicker = T2.kicker; var m = (d.meta || []).find(function (x) { return x.k === "Category"; }); if (m && !m.v) m.v = T2.cat; d.tpl = k; closeModal(); draw(); mark(); if (!it.title) { $("#ce-title").placeholder = T2.title; $("#ce-title").focus(); } toast(T2.name + " template added"); }; });
        }
        function writer() {
          collect();
          modal('<h3>AI SEO writer</h3><p class="muted">Writes a full article in English, then checks it with the SEO analyser and rewrites weak parts until the score is 70+ (up to 2 fixes). It <b>replaces</b> the current content; add photos and review before publishing.</p>' +
            '<label>Topic or title<input id="aw-t" value="' + esc(it.title) + '" placeholder="e.g. Kitchen renovation cost in Lahore"></label><label>Focus keyphrase<input id="aw-k" value="' + esc((it.seo || {}).kw || "") + '" placeholder="e.g. kitchen renovation cost Lahore"></label>' +
            '<div class="g2"><label>Template<select id="aw-tp">' + Object.keys(TPL).map(function (k) { return '<option value="' + k + '"' + (d.tpl === k ? " selected" : "") + ">" + esc(TPL[k].name) + "</option>"; }).join("") + '</select></label><label>Length<select id="aw-w"><option value="900">Short (~900 words)</option><option value="1400" selected>Standard (~1,400 words)</option><option value="2000">Long (~2,000 words)</option></select></label></div>' +
            '<label>Notes for the writer <small>(facts, prices, projects, points to include)</small><textarea id="aw-n" rows="4" placeholder="e.g. PKR 2,500–6,000 per sq ft, we give 3D views first, 10-year warranty on cabinets"></textarea></label>' +
            '<div id="aw-log" class="muted" style="font-size:13px;min-height:20px"></div><div class="modal-actions"><button class="btn" id="aw-x">Cancel</button><button class="btn pri" id="aw-go">' + ic("sparkles") + "Write article</button></div>", "wide");
          W.fillIcons($(".modal") || document.body); $("#aw-x").onclick = closeModal;
          $("#aw-go").onclick = function () {
            var b = this, kw = $("#aw-k").value.trim(), topic = $("#aw-t").value.trim(), tp = $("#aw-tp").value, words = $("#aw-w").value, notes = $("#aw-n").value;
            if (!topic || !kw) return toast("Add a topic and a focus keyphrase", true);
            var log = function (m) { $("#aw-log").innerHTML = m; }, url = "/" + t.folder + "/" + (it.slug || "new-article") + "/", round = 0;
            busy(b, true); log("✍️ Writing the article… (about 30–60 seconds)");
            ai("article", { title: topic, kw: kw, structure: tplStructure(tp), words: words, notes: notes }).then(function step(tx) {
              var j = aiJson(tx); d.tpl = tp; applyAi(d, it, j); if (!it.seo.kw) it.seo.kw = kw;
              if (!it.rel && !it.slug) it.slug = String(it.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
              draw(); url = "/" + t.folder + "/" + (it.slug || "new-article") + "/";
              return build().then(function (h) {
                var r = WXSEO.analyze(h, { kw: kw, url: url }), bad = r.seo.checks.concat(r.read.checks).filter(function (c) { return c.status !== "good"; });
                log("📊 Round " + (round + 1) + ": SEO <b>" + r.seo.score + "</b> · Readability <b>" + r.read.score + "</b>");
                if ((r.seo.score >= 70 && r.read.score >= 60) || round >= 2) return r;
                round++; log($("#aw-log").innerHTML + "<br>🔧 Fixing " + bad.length + " issue(s)…");
                return ai("fix", { kw: kw, issues: bad.map(function (c) { return "- " + c.text; }).join("\n"), article: JSON.stringify({ title: it.title, dek: d.dek, seoTitle: it.seo.title, seoDesc: it.seo.desc, blocks: d.blocks.map(function (x) { var y = Object.assign({}, x); delete y.hint; return y; }), summary: d.summary, faqs: d.faqs }) }).then(step);
              });
            }).then(function (r) {
              busy(b, false); if (!r || !r.seo) return; mark(); closeModal(); draw(); toast("Article written · SEO " + r.seo.score + " · Readability " + r.read.score + ". Add photos, review, then publish.");
              setTimeout(function () { if ($("#ce-seo-an")) $("#ce-seo-an").click(); }, 300);
            }).catch(function (e) { busy(b, false); log('<span class="bad">The AI reply could not be read. Try again.</span>'); });
          };
        }
        if ($("#ce-tpl")) $("#ce-tpl").onclick = function () { tplPick(false); };
        if ($("#ce-ai-writer")) $("#ce-ai-writer").onclick = function () { if (!aiReady) return toast("Add an AI key first (AI settings)", true); writer(); };
        if (type === "post" && !it.id && !d.tpl && !d._asked) { d._asked = true; setTimeout(function () { tplPick(true); }, 50); }
        if ($("#ce-ai-draft")) $("#ce-ai-draft").onclick = function () {
          var btn = this; collect(); if (!it.title) return toast("Write a title first", true);
          modal('<h3>Draft article with AI</h3><p class="muted">The AI writes sections, takeaways, FAQs and a pull quote from your title and notes. It <b>replaces</b> the current content; review every line before publishing.</p><label>Notes for the writer <small>(facts, prices, points to include)</small><textarea id="ai-n" rows="5" placeholder="e.g. mention 3D before build, PKR ranges per sq ft, Lahore climate"></textarea></label><div class="modal-actions"><button class="btn" id="ai-x">Cancel</button><button class="btn pri" id="ai-go">' + ic("sparkles") + "Write draft</button></div>");
          $("#ai-x").onclick = closeModal;
          $("#ai-go").onclick = function () {
            var b2 = this; busy(b2, true);
            ai("outline", { title: it.title, notes: $("#ai-n").value }).then(function (tx) {
              var j = aiJson(tx); if (j.dek && !d.dek) d.dek = j.dek; if (Array.isArray(j.blocks)) d.blocks = j.blocks.map(function (b) { return b.t === "list" ? { t: "list", items: b.items || [] } : { t: b.t === "h" ? "h" : "p", text: b.text || "" }; });
              if (Array.isArray(j.summary)) d.summary = j.summary; if (Array.isArray(j.faqs)) d.faqs = j.faqs.filter(function (f) { return f.q; }); if (j.quote) d.quote = j.quote;
              closeModal(); draw(); mark(); toast("Draft written. Review it before publishing.");
            }).catch(function () { busy(b2, false); toast("The AI reply could not be read. Try again.", true); });
          };
          void btn;
        };
        if ($("#ce-ai-seo")) $("#ce-ai-seo").onclick = function () { var b = this; busy(b, true); ai("meta", { title: $("#ce-title").value, text: $("#ce-dek").value + "\n" + bodyText() }).then(function (tx) { var j = aiJson(tx); if (j.title) $("#ce-st").value = j.title; if (j.desc) $("#ce-sd").value = j.desc; serp(); mark(); }).catch(function () {}).then(function () { busy(b, false); }); };
        if ($("#ce-ai-card")) $("#ce-ai-card").onclick = function () { var b = this; busy(b, true); ai("excerpt", { title: $("#ce-title").value, text: $("#ce-dek").value + "\n" + bodyText() }).then(function (tx) { $("#ce-ct").value = tx.trim(); mark(); }).catch(function () {}).then(function () { busy(b, false); }); };
        if ($("#ce-ai-faq")) $("#ce-ai-faq").onclick = function () { var b = this; busy(b, true); ai("faqs", { title: $("#ce-title").value, text: bodyText() }).then(function (tx) { var j = aiJson(tx); collect(); d.faqs = d.faqs.concat(j.filter(function (f) { return f.q; })); $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); mark(); }).catch(function () {}).then(function () { busy(b, false); }); };
        // actions
        if ($("#ce-seo-an")) $("#ce-seo-an").onclick = seoCheck;
        $("#ce-prev").onclick = function () { collect(); build().then(function (h) { preview(h); }).catch(function (e) { toast(e.message, true); }); };
        $("#ce-save").onclick = function () { save({}).then(function (ok) { if (ok) toast("Saved"); }); };
        $("#ce-pub").onclick = function () { publish(this); };
        if ($("#ce-sch")) $("#ce-sch").onclick = function () {
          var v = $("#ce-at").value; if (!v) return toast("Pick a date and time", true); var at = localToUtc(v); if (new Date(v) < new Date()) return toast("Pick a time in the future", true);
          collect(); if (!check()) return;
          build().then(function (h) { return save({ status: "scheduled", publishAt: at, pending: { rel: t.folder + "/" + it.slug + "/index.html", html: h, card: (it.data || {}).visibility === "unlisted" ? "" : listCard(type, it) } }); }).then(function (ok) { if (ok) { toast("Scheduled for " + fmtLocal(at)); draw(); } }).catch(function (e) { toast(e.message, true); });
        };
        if ($("#ce-unsch")) $("#ce-unsch").onclick = function () { save({ status: "draft" }).then(function (ok) { if (ok) { toast("Schedule cancelled"); draw(); } }); };
        if ($("#ce-del")) $("#ce-del").onclick = function () { if (!confirm("Delete this draft?")) return; api("cms_delete", { id: it.id }).then(function (r) { if (!r.ok) return toast(r.error, true); dirty = false; toast("Deleted"); location.hash = "#/" + t.list; }); };
        window.onbeforeunload = function () { return dirty && $("#ce") ? "Unsaved changes" : undefined; };
      }
      function check() {
        if (!it.title) { toast("Add a title", true); $("#ce-title").focus(); return false; }
        if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(it.slug)) { toast("Page address: lowercase letters, numbers and dashes", true); $("#ce-slug").focus(); return false; }
        if (!(d.hero || {}).src) { toast("Choose a hero image", true); return false; }
        return true;
      }
      function save(extra) {
        collect(); if (!it.title) { toast("Add a title", true); return Promise.resolve(false); }
        if (!it.slug) it.slug = slugify(it.title);
        return api("cms_save", Object.assign({ id: it.id || 0, type: type, title: it.title, slug: it.slug, data: d, seo: it.seo }, extra)).then(function (r) {
          if (!r.ok) { toast(r.error, true); return false; }
          var fresh = !it.id; Object.assign(it, r.item); dirty = false; if ($("#ce-dirty")) $("#ce-dirty").hidden = true;
          if (fresh) history.replaceState(null, "", "#/" + t.ed + "/" + it.id);
          return true;
        });
      }
      function shellHtml() {
        var rel = it.rel || (others.find(function (o) { return o.rel; }) || {}).rel || t.shell;
        return (W.tplReady ? W.tplReady() : Promise.resolve()).then(function () { return bapi("load", { path: rel }); }).then(function (r) { if (!r.ok) throw new Error("Template page could not be loaded: " + (r.error || rel)); return r; });
      }
      function build() { return shellHtml().then(function (r) { return renderPage(type, it, r.html, others); }); }
      function seoCheck() {
        if (!window.WXSEO || !$("#ce-seo-r")) return; collect(); var url = "/" + t.folder + "/" + (it.slug || "new") + "/";
        build().then(function (h) { var r = WXSEO.analyze(h, { kw: it.seo.kw, url: url }); WXSEO.render($("#ce-seo-r"), r, { url: url }); });
      }

      function publish(btn) {
        collect(); if (!check()) return;
        if (it.rel && it.imported && !it.republished && !confirm("This rebuilds the live page from the form fields. Did you check Preview?")) return;
        busy(btn, true);
        save({}).then(function (ok) {
          if (!ok) throw 0;
          var rel = t.folder + "/" + it.slug + "/index.html";
          return build().then(function (h) {
            if (it.rel) return bapi("load", { path: rel }).then(function (cur) { return bapi("save", { path: rel, html: h, mtime: cur.mtime }); });
            return bapi("page_new", { folder: t.folder, slug: it.slug, html: h });
          }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || "Page could not be written");
            return updateListing(type, it).then(function () { return api("cms_published", { id: it.id, rel: rel }); });
          }).then(function (r) { if (!r.ok) throw new Error(r.error); Object.assign(it, r.item); it.republished = true; toast("Published: /" + t.folder + "/" + it.slug + "/"); draw(); });
        }).catch(function (e) { if (e) toast(e.message || String(e), true); }).then(function () { busy(btn, false); });
      }
    };
  }
  function preview(html) {
    var o = document.createElement("div"); o.className = "pv"; o.innerHTML = '<div class="pv-bar"><b>Preview</b><span class="muted">Not published yet</span><div class="seg"><button class="on" data-w="100%">Desktop</button><button data-w="390px">Mobile</button></div><button class="btn" data-x>Close</button></div><iframe></iframe>';
    document.body.appendChild(o); var f = o.querySelector("iframe");
    f.srcdoc = html.replace(/<head>/i, '<head><base href="' + location.origin + '/">');
    o.querySelector("[data-x]").onclick = function () { o.remove(); };
    o.querySelectorAll("[data-w]").forEach(function (b) { b.onclick = function () { o.querySelectorAll("[data-w]").forEach(function (x) { x.classList.toggle("on", x === b); }); f.style.width = b.dataset.w; f.style.margin = b.dataset.w === "100%" ? "0" : "12px auto"; }; });
  }

  // ------------------------------------------------------------------ testimonials / team (sections on chosen pages)
  var SEC = {
    testimonial: { view: "testimonials", title: "Testimonials", one: "testimonial", marker: "testimonials", icon: "message-square" },
    member: { view: "team", title: "Team", one: "team member", marker: "team", icon: "users" }
  };
  function stars(n) { n = Math.max(0, Math.min(5, +n || 5)); return '<div class="wx-stars" aria-label="' + n + ' out of 5">' + "★★★★★".slice(0, n) + '<span>' + "★★★★★".slice(n) + "</span></div>"; }
  /** P17 C8: 5 testimonial designs (CSS only, no JS) */
  var TST_DESIGNS = [["cards", "Cards", "3 cards in a row (classic)"], ["spotlight", "Spotlight", "One big featured review + smaller ones"], ["slider", "Slider", "Swipe row of cards — good for many reviews"], ["wall", "Wall", "Masonry wall of short quotes"], ["band", "Navy band", "Dark band with big quote and average rating"]];
  function tstHtml(items, set, design) {
    var m = SEC.testimonial.marker, ds = design || set.design || "cards"; if (!TST_DESIGNS.some(function (x) { return x[0] === ds; })) ds = "cards";
    var mx = +set.max || 0; if (mx > 0) items = items.slice(0, mx); if (!items.length) return "";
    function ini(x) { return esc(String(x.title).split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase()); }
    function who(x, big) { var d = x.data || {}, sub = [d.role, [d.project, d.city].filter(Boolean).join(", ")].filter(Boolean).join(" · "); return "<figcaption>" + (d.photo ? '<img src="' + esc(d.photo) + '" alt="" width="' + (big ? 64 : 48) + '" height="' + (big ? 64 : 48) + '" loading="lazy" decoding="async">' : '<span class="wx-av">' + ini(x) + "</span>") + "<span><b>" + esc(x.title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></figcaption>"; }
    function card(x, cls) { var d = x.data || {}; return '    <figure class="wx-tst-card' + (cls ? " " + cls : "") + '">' + stars(d.rating) + "<blockquote>" + esc(d.text) + "</blockquote>" + who(x, cls === "is-big") + "</figure>\n"; }
    var avg = items.reduce(function (a, x) { return a + (+(x.data || {}).rating || 5); }, 0) / items.length;
    var headH = '  <div class="wx-sec-h"><p class="wx-kicker">' + esc(set.kicker || "Client words") + '</p><h2 id="wx-tst-title">' + esc(set.heading || "What our clients say") + "</h2>" + (ds === "band" || ds === "spotlight" ? '<p class="wx-tst-avg"><b>' + avg.toFixed(1) + '</b> ' + stars(Math.round(avg)).replace(/^<div/, "<span").replace(/<\/div>$/, "</span>") + " <span>from " + items.length + " client review" + (items.length > 1 ? "s" : "") + "</span></p>" : "") + "</div>\n", body;
    if (ds === "spotlight") body = '  <div class="wx-tst-spot">\n' + card(items[0], "is-big") + (items.length > 1 ? '    <div class="wx-tst-side">\n' + items.slice(1, 4).map(function (x) { return card(x); }).join("") + "    </div>\n" : "") + "  </div>\n";
    else if (ds === "slider") body = '  <div class="wx-tst-track" tabindex="0" aria-label="Client reviews, scroll sideways">\n' + items.map(function (x) { return card(x); }).join("") + "  </div>\n";
    else if (ds === "wall") body = '  <div class="wx-tst-wall">\n' + items.map(function (x) { return card(x); }).join("") + "  </div>\n";
    else if (ds === "band") body = '  <div class="wx-tst-band">\n' + card(items[0], "is-big") + (items.length > 1 ? '    <div class="wx-tst-row">\n' + items.slice(1, 4).map(function (x) { return card(x); }).join("") + "    </div>\n" : "") + "  </div>\n";
    else body = '  <div class="wx-tst-grid">\n' + items.map(function (x) { return card(x); }).join("") + "  </div>\n";
    return "<!--wx:" + m + '-->\n<section class="wx-tst wx-tst--' + ds + '" aria-labelledby="wx-tst-title"><div class="wrap">\n' + headH + body + "</div></section>\n<!--/wx:" + m + "-->";
  }
  W.TST_DESIGNS = TST_DESIGNS; W.tstHtml = tstHtml;
  function sectionHtml(kind, items, set, design) {
    var m = SEC[kind].marker;
    if (!items.length) return "";
    if (kind === "testimonial") return tstHtml(items, set, design);
    return "<!--wx:" + m + '-->\n<section class="wx-team" aria-labelledby="wx-team-title"><div class="wrap">\n  <div class="wx-sec-h"><p class="wx-kicker">' + esc(set.kicker || "The studio") + '</p><h2 id="wx-team-title">' + esc(set.heading || "The people behind the work") + '</h2></div>\n  <div class="wx-team-grid">\n' +
      items.slice().sort(function (a, b) { return ((b.data || {}).featured ? 1 : 0) - ((a.data || {}).featured ? 1 : 0); }).map(function (x) { var d = x.data || {}; return '    <article class="wx-team-card' + (d.featured ? " is-featured" : "") + '">' + (d.photo ? '<img src="' + esc(d.photo) + '" alt="' + esc(x.title) + '" width="600" height="720" loading="lazy" decoding="async">' : '<div class="wx-team-ph"></div>') + "<h3>" + esc(x.title) + "</h3><p class=\"wx-team-role\">" + esc([d.role, d.dept].filter(Boolean).join(" · ")) + "</p>" + (d.years ? '<p class="wx-team-yr">' + esc(d.years) + "+ years experience</p>" : "") + (d.bio ? "<p>" + esc(d.bio) + "</p>" : "") +
        ((d.showContact && (d.email || d.phone)) || d.linkedin ? '<p class="wx-team-links">' + (d.showContact && d.phone ? '<a href="tel:' + esc(String(d.phone).replace(/\s+/g, "")) + '">' + esc(d.phone) + "</a>" : "") + (d.showContact && d.email ? '<a href="mailto:' + esc(d.email) + '">' + esc(d.email) + "</a>" : "") + (d.linkedin ? '<a href="' + esc(d.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : "") + "</p>" : "") + "</article>\n"; }).join("") +
      "  </div>\n</div></section>\n<!--/wx:" + m + "-->";
  }
  function placeOnPage(html, kind, block) {
    var m = SEC[kind].marker, re = new RegExp("\\n?<!--wx:" + m + "-->[\\s\\S]*?<!--/wx:" + m + "-->");
    if (re.test(html)) return html.replace(re, block ? "\n" + block : "");
    if (!block) return html;
    var at = html.indexOf('<section class="wx-trust"'); if (at < 0) at = html.indexOf("</main>"); if (at < 0) return html;
    return html.slice(0, at) + block + "\n" + html.slice(at);
  }
  function tstPick(set) {
    return '<div class="tst-pick"><b>Design</b> <small class="muted">default for all pages; you can change it per page below</small><div class="tst-ds">' + TST_DESIGNS.map(function (x) { return '<label class="tst-d' + ((set.design || "cards") === x[0] ? " on" : "") + '"><input type="radio" name="pl-d" value="' + x[0] + '"' + ((set.design || "cards") === x[0] ? " checked" : "") + '><i class="tst-ic tst-ic-' + x[0] + '"><s></s><s></s><s></s></i><span>' + x[1] + "</span><small>" + x[2] + "</small></label>"; }).join("") + '</div><label class="tst-max">Show at most <input id="pl-m" type="number" min="0" max="30" value="' + (+set.max || 0) + '"> reviews <small class="muted">(0 = all live)</small></label><div class="tst-pv"><iframe id="pl-pv" title="Design preview"></iframe></div></div>';
  }
  function bindTstPick(items) {
    var live = items.filter(function (x) { return x.status === "published"; });
    function pv() { var d = ($("[name=pl-d]:checked") || {}).value || "cards"; $$(".tst-d").forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); });
      var f = $("#pl-pv"); if (!f) return; var h = tstHtml(live.length ? live : [{ title: "Sample Client", data: { rating: 5, text: "Add testimonials and mark them Live to see them here.", role: "Owner" } }], { kicker: $("#pl-k").value, heading: $("#pl-h").value, max: +$("#pl-m").value || 0 }, d);
      f.srcdoc = '<!doctype html><html><head><base href="' + location.origin + '/"><link rel="stylesheet" href="/assets/site-p21.css"><link rel="stylesheet" href="/assets/v1-p21.css"><link rel="stylesheet" href="/assets/theme.css"><style>body{margin:0}</style></head><body>' + h + "</body></html>"; }
    $$("[name=pl-d]").forEach(function (r) { r.onchange = pv; }); ["#pl-k", "#pl-h", "#pl-m"].forEach(function (q) { if ($(q)) $(q).addEventListener("input", pv); }); pv();
    $("#modal-card").classList.add("wide");
  }
  function sectionView(kind) {
    return function (el) {
      var k = SEC[kind], items = [], placements = {}, pages = [];
      el.innerHTML = head(k.title, k.title, '<button class="btn" id="sx-pl">' + ic("layout") + 'Pages & heading</button><button class="btn" id="sx-push">' + ic("upload") + 'Update website</button><button class="btn pri" id="sx-new">' + ic("plus") + "Add " + k.one + "</button>") +
        (kind === "testimonial" ? '<div class="p19-how"><b>How testimonials reach your website</b><ol><li><b>Add</b> a testimonial (name, what they said, rating, photo) and keep <b>Live</b> ticked.</li><li>Press <b>Pages &amp; heading</b>: tick the pages where reviews should appear (e.g. Home, Kitchens) and pick a design for each.</li><li>Press <b>Update website</b>. The reviews section is added above the footer on those pages. Edit or re-order later, then press Update website again.</li></ol></div>' : '<div class="p19-how"><b>How the team section works</b><ol><li><b>Add</b> each team member with role, department and photo (portrait 5:6 looks best). Tick <b>Featured</b> for partners/leads.</li><li>Press <b>Pages &amp; heading</b> and tick the pages (e.g. About).</li><li>Press <b>Update website</b>. Drag cards to change the order.</li></ol></div>') + '<div class="banner" hidden>' + ic("info") + ' Live items appear as a section on the chosen pages. Drag cards to change the order, then press <b>Update website</b>.</div><div id="sx-grid" class="sx-grid"></div>';
      W.fillIcons(el);
      function load() { Promise.all([api("cms_list", { type: kind }), api("cms_placements")]).then(function (rs) { items = (rs[0].items || []).sort(function (a, b) { return (a.order || 999) - (b.order || 999) || a.id - b.id; }); placements = rs[1].placements || {}; draw(); }); }
      function draw() {
        $("#sx-grid").innerHTML = items.map(function (x) {
          var d = x.data || {};
          return '<div class="sx card" draggable="true" data-id="' + x.id + '"><div class="sx-top">' + (d.photo ? '<img src="' + esc(d.photo) + '" alt="">' : '<span class="wx-av">' + esc(String(x.title).slice(0, 1)) + "</span>") + "<div><b>" + esc(x.title) + "</b><small>" + esc([d.role, d.project, d.city].filter(Boolean).join(" · ")) + "</small></div>" + badge(x) + "</div>" +
            (kind === "testimonial" ? '<p class="sx-q">' + stars(d.rating) + esc(d.text) + "</p>" : '<p class="sx-q">' + esc(d.bio || "") + "</p>") +
            '<div class="sx-ft"><label class="switch"><input type="checkbox" data-live' + (x.status === "published" ? " checked" : "") + '><span></span> Live</label><button class="btn sm" data-ed>Edit</button></div></div>';
        }).join("") || '<div class="card card-b empty">' + ic(k.icon) + "<p>No " + k.title.toLowerCase() + " yet.</p></div>";
        W.fillIcons($("#sx-grid"));
      }
      load();
      var drag = null;
      $("#sx-grid").addEventListener("dragstart", function (e) { drag = e.target.closest(".sx"); if (drag) drag.classList.add("drag"); });
      $("#sx-grid").addEventListener("dragover", function (e) { e.preventDefault(); var o = e.target.closest(".sx"); if (!drag || !o || o === drag) return; var r = o.getBoundingClientRect(); o.parentNode.insertBefore(drag, (e.clientX - r.left) > r.width / 2 ? o.nextSibling : o); });
      $("#sx-grid").addEventListener("dragend", function () { if (!drag) return; drag.classList.remove("drag"); drag = null; var ids = $$("#sx-grid .sx").map(function (c) { return +c.dataset.id; }); api("cms_reorder", { ids: ids }).then(function () { items.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); toast("Order saved. Press Update website to apply."); }); });
      $("#sx-grid").onclick = function (e) {
        var c = e.target.closest(".sx"); if (!c) return; var x = items.find(function (i) { return i.id === +c.dataset.id; });
        if (e.target.closest("[data-live]")) { api("cms_status", { id: x.id, status: e.target.checked ? "published" : "draft" }).then(function (r) { if (r.ok) { x.status = r.item.status; draw(); toast("Saved. Press Update website to apply."); } }); return; }
        if (e.target.closest("[data-ed]")) edit(x);
      };
      $("#sx-new").onclick = function () { edit(null); };
      function edit(x) {
        var d = (x && x.data) || { rating: 5 };
        modal("<h3>" + (x ? "Edit " : "Add ") + k.one + '</h3><form id="sx-f"><div class="g2"><label>Name<input id="sx-n" value="' + esc(x ? x.title : "") + '" required></label><label>' + (kind === "testimonial" ? "Role / company" : "Role") + '<input id="sx-r" value="' + esc(d.role) + '"></label></div>' +
          (kind === "testimonial" ? '<div class="g2"><label>Project <small>(optional)</small><input id="sx-p" value="' + esc(d.project) + '" placeholder="Office fit-out, Gulberg"></label><label>City <small>(optional)</small><input id="sx-c" value="' + esc(d.city) + '" placeholder="Lahore"></label></div><div class="g2"><label>Rating<select id="sx-s">' + [5, 4, 3].map(function (n) { return "<option" + (+d.rating === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + '</select></label></div><label>What they said<textarea id="sx-t" rows="4" required>' + esc(d.text) + "</textarea></label>" : '<div class="g2"><label>Department<select id="sx-dp">' + ["", "Leadership", "Design studio", "Projects & site", "Sales & client care", "Workshop / production", "Admin & accounts"].map(function (o) { return "<option" + (d.dept === o ? " selected" : "") + ' value="' + esc(o) + '">' + (o || "—") + "</option>"; }).join("") + '</select></label><label>Years of experience <small>(optional)</small><input id="sx-yr" type="number" min="0" max="60" value="' + esc(d.years || "") + '"></label></div>' +
            '<label>Short bio <small>(optional)</small><textarea id="sx-t" rows="3">' + esc(d.bio) + "</textarea></label>" +
            '<div class="g2"><label>Phone / WhatsApp <small>(optional)</small><input id="sx-ph2" value="' + esc(d.phone || "") + '"></label><label>Email <small>(optional)</small><input id="sx-em" type="email" value="' + esc(d.email || "") + '"></label></div>' +
            '<label>LinkedIn link <small>(optional)</small><input id="sx-li" value="' + esc(d.linkedin || "") + '" placeholder="https://linkedin.com/in/…"></label>' +
            '<div class="g2"><label class="check"><input type="checkbox" id="sx-pub"' + (d.showContact ? " checked" : "") + '> Show email / phone on the website</label><label class="check"><input type="checkbox" id="sx-ft"' + (d.featured ? " checked" : "") + '> Featured (shown first, larger)</label></div>') +
          imgField("sx-ph", d.photo, "Photo " + (kind === "testimonial" ? "(optional)" : "")) +
          '<label class="check"><input type="checkbox" id="sx-live"' + (!x || x.status === "published" ? " checked" : "") + '> Live</label><p class="err" id="sx-err"></p><div class="modal-actions">' + (x ? '<button type="button" class="btn ghost danger" id="sx-del" style="margin-right:auto">Delete</button>' : "") + '<button type="button" class="btn" id="sx-x">Cancel</button><button class="btn pri">Save</button></div></form>');
        bindImg("sx-ph");
        $("#sx-x").onclick = closeModal;
        if ($("#sx-del")) $("#sx-del").onclick = function () { if (!confirm("Delete " + x.title + "?")) return; api("cms_delete", { id: x.id }).then(function (r) { if (!r.ok) return toast(r.error, true); closeModal(); load(); toast("Deleted. Press Update website to apply."); }); };
        $("#sx-f").onsubmit = function (e) {
          e.preventDefault();
          var data = kind === "testimonial" ? { role: $("#sx-r").value.trim(), project: $("#sx-p").value.trim(), city: $("#sx-c").value.trim(), rating: +$("#sx-s").value, text: $("#sx-t").value.trim(), photo: imgVal("sx-ph") } : { role: $("#sx-r").value.trim(), dept: $("#sx-dp").value, years: $("#sx-yr").value ? +$("#sx-yr").value : "", bio: $("#sx-t").value.trim(), phone: $("#sx-ph2").value.trim(), email: $("#sx-em").value.trim(), linkedin: /^https?:\/\//.test($("#sx-li").value.trim()) ? $("#sx-li").value.trim() : "", showContact: $("#sx-pub").checked, featured: $("#sx-ft").checked, photo: imgVal("sx-ph") }; /*P19 F3*/
          api("cms_save", { id: x ? x.id : 0, type: kind, title: $("#sx-n").value.trim(), data: data, order: x ? x.order : items.length + 1, status: $("#sx-live").checked ? "published" : "draft" }).then(function (r) {
            if (!r.ok) { $("#sx-err").textContent = r.error; return; }
            if (!$("#sx-live").checked && r.item.status === "published") api("cms_status", { id: r.item.id, status: "draft" });
            closeModal(); load(); toast("Saved. Press Update website to apply.");
          });
        };
      }
      $("#sx-pl").onclick = function () {
        bapi("pages").then(function (r) {
          pages = (r.pages || []).map(function (p) { return p.path || p; }).filter(function (p) { return !/^(insights|projects)\/[^/]+\//.test(p); }).sort();
          var cur = placements[kind] || [], set = placements[kind + "Set"] || {};
          modal("<h3>" + k.title + ': pages & heading</h3><div class="g2"><label>Small label<input id="pl-k" value="' + esc(set.kicker || "") + '" placeholder="' + (kind === "testimonial" ? "Client words" : "The studio") + '"></label><label>Heading<input id="pl-h" value="' + esc(set.heading || "") + '" placeholder="' + (kind === "testimonial" ? "What our clients say" : "The people behind the work") + '"></label></div>' + (kind === "testimonial" ? tstPick(set) : "") + '<label>Show on these pages <small>(placed above the “Why Woodex” strip)</small><input id="pl-q" placeholder="Filter pages…"></label><div class="pl-l">' +
            pages.map(function (p) { return '<label class="check"><input type="checkbox" value="' + esc(p) + '"' + (cur.indexOf(p) > -1 ? " checked" : "") + "> /" + esc(p.replace(/index\.html$/, "")) + (kind === "testimonial" ? '<select class="pl-pd" data-p="' + esc(p) + '"><option value="">Default design</option>' + TST_DESIGNS.map(function (x) { return '<option value="' + x[0] + '"' + (((set.designs || {})[p]) === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select>" : "") + "</label>"; }).join("") + '</div><div class="modal-actions"><button class="btn" id="pl-x">Cancel</button><button class="btn pri" id="pl-go">Save & update website</button></div>');
          $("#pl-x").onclick = closeModal; if (kind === "testimonial") bindTstPick(items);
          $("#pl-q").oninput = function () { var q = this.value.toLowerCase(); $$(".pl-l label").forEach(function (l) { l.hidden = l.textContent.toLowerCase().indexOf(q) < 0; }); };
          $("#pl-go").onclick = function () {
            var sel = $$(".pl-l input:checked").map(function (c) { return c.value; }), removed = cur.filter(function (p) { return sel.indexOf(p) < 0; });
            placements[kind] = sel; placements[kind + "Set"] = { kicker: $("#pl-k").value.trim(), heading: $("#pl-h").value.trim() }; if (kind === "testimonial") { var dz = {}; $$(".pl-pd").forEach(function (x) { if (x.value && sel.indexOf(x.dataset.p) > -1) dz[x.dataset.p] = x.value; }); Object.assign(placements[kind + "Set"], { design: ($("[name=pl-d]:checked") || {}).value || "cards", max: +$("#pl-m").value || 0, designs: dz }); }
            api("cms_placements_save", { placements: placements }).then(function (r2) { if (!r2.ok) return toast(r2.error, true); placements = r2.placements; closeModal(); push(removed); });
          };
        });
      };
      function push(removed) {
        var live = items.filter(function (x) { return x.status === "published"; }), block = sectionHtml(kind, live, placements[kind + "Set"] || {}), list = (placements[kind] || []).slice(), n = 0, fails = [];
        var tset = placements[kind + "Set"] || {}; var jobs = list.map(function (p) { return [p, kind === "testimonial" ? sectionHtml(kind, live, tset, (tset.designs || {})[p]) : block]; }).concat((removed || []).map(function (p) { return [p, ""]; }));
        if (!jobs.length) return toast("Choose pages first (Pages & heading)", true);
        toast("Updating " + jobs.length + " page(s)…");
        jobs.reduce(function (pr, j) {
          return pr.then(function () { return bapi("load", { path: j[0] }).then(function (r) { if (!r.ok) { fails.push(j[0]); return; } var h = placeOnPage(r.html, kind, j[1]); if (h === r.html) return; return bapi("save", { path: j[0], html: h, mtime: r.mtime }).then(function (s) { if (s.ok) n++; else fails.push(j[0]); }); }); });
        }, Promise.resolve()).then(function () { toast(n + " page(s) updated" + (fails.length ? ", " + fails.length + " failed" : ""), !!fails.length); });
      }
      $("#sx-push").onclick = function () { api("cms_placements").then(function (r) { placements = r.placements || {}; push([]); }); };
    };
  }

  // ------------------------------------------------------------------ FAQ groups
  W.faqBlock = function (id, d) {
    var m = "faq-" + id, ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: d.items.map(function (f) { return { "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }; }) };
    return "<!--wx:" + m + '-->\n<section class="wx-faqs" aria-labelledby="wx-faq-' + id + '"><div class="wrap">\n  <div class="wx-sec-h"><p class="wx-kicker">FAQ</p><h2 id="wx-faq-' + id + '">' + esc(d.heading || "Frequently asked questions") + "</h2></div>\n  <div class=\"wx-faq-list\">\n" +
      d.items.map(function (f, i) { return "    <details" + (i ? "" : " open") + "><summary>" + esc(f.q) + "</summary><p>" + esc(f.a).replace(/\n/g, "<br>") + "</p></details>\n"; }).join("") +
      '  </div>\n</div></section>\n<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>\n<!--/wx:" + m + "-->";
  };
  W.VIEWS.faqs = function (el) {
    el.innerHTML = head("FAQ groups", "FAQ groups", '<button class="btn pri" id="fg-new">' + ic("plus") + "New group</button>") + '<div class="banner">' + ic("info") + " <b>What are FAQ groups?</b> Questions &amp; answers you write once and reuse in 3 places: <b>1)</b> the <b>AI chat &amp; WhatsApp agent</b> answer customers from them (published groups only) · <b>2)</b> <b>link</b> a group to any <b>blog article</b> (article editor → FAQs → Use FAQ group): edit the group once and every linked live page updates. Need different questions for one page? <b>Duplicate</b> the group · <b>3)</b> <b>Google</b> can show them as FAQ results (SEO schema added automatically). Empty? Click <b>Add starter FAQ groups</b> (Renovation, Pricing, Process…).</div><div id=\"fg-l\"></div>";
    W.fillIcons(el);
    function load() { Promise.all([api("cms_list", { type: "faq" }), api("cms_list", { type: "post" })]).then(function (rs) { var g = rs[0].items || [], posts = rs[1].items || []; used = function (id) { return posts.filter(function (p) { return +((p.data || {}).faqGroup || 0) === id; }); }; allPosts = posts; $("#fg-l").innerHTML = g.map(function (x) { var n = ((x.data || {}).items || []).length, u = used(x.id); return '<div class="card fg" data-id="' + x.id + '"><div class="card-h"><h3>' + esc(x.title) + '</h3><div class="toolbar"><span class="badge">' + n + ' questions</span><button class="btn sm" data-dup title="Make a copy to change for one page">Duplicate</button><button class="btn sm" data-ed>Edit</button></div></div><div class="card-b"><ol class="fg-q">' + ((x.data || {}).items || []).slice(0, 4).map(function (f) { return "<li>" + esc(f.q) + "</li>"; }).join("") + (n > 4 ? '<li class="muted">…and ' + (n - 4) + " more</li>" : "") + '</ol><div class="fg-used">' + ic("link") + (u.length ? "<b>Used on " + u.length + (u.length > 1 ? " pages" : " page") + ":</b> " + u.map(function (p) { return '<a href="#/post/' + p.id + '">' + esc(p.title) + "</a>" + (p.rel ? "" : ' <span class="badge">draft</span>'); }).join(", ") : '<span class="muted">Not linked to any article yet · also used by the AI chat &amp; Google FAQ results</span>') + "</div></div></div>"; }).join("") || '<div class="card card-b empty">' + ic("help-circle") + "<p>No FAQ groups yet.</p></div>"; W.fillIcons($("#fg-l")); var byId = function (b) { return g.find(function (x) { return x.id === +b.closest(".fg").dataset.id; }); }; $$("#fg-l [data-ed]").forEach(function (b) { b.onclick = function () { edit(byId(b)); }; }); $$("#fg-l [data-dup]").forEach(function (b) { b.onclick = function () { var x = byId(b); api("cms_save", { id: 0, type: "faq", title: x.title + " (copy)", data: { items: ((x.data || {}).items || []).slice() }, status: "published" }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Copy created — edit it, then link it to the page that needs different questions"); load(); }); }; }); }); }
    var used = function () { return []; }, allPosts = [];
    /** P19 F5: place a FAQ group (+ FAQPage schema) on chosen frontend pages */
    function faqPush(id, d, oldPages) {
      if (!id) return; var m = "faq-" + id, re = new RegExp("\\n?<!--wx:" + m + "-->[\\s\\S]*?<!--/wx:" + m + "-->");
      var block = d.items.length ? W.faqBlock(id, d) : "";
      var jobs = d.pages.map(function (p) { return [p, block]; }).concat(oldPages.filter(function (p) { return d.pages.indexOf(p) < 0; }).map(function (p) { return [p, ""]; }));
      if (!jobs.length) return; var n = 0;
      jobs.reduce(function (pr, j) { return pr.then(function () { return bapi("load", { path: j[0] }).then(function (r) { if (!r.ok) return; var h = r.html; if (re.test(h)) h = h.replace(re, j[1] ? "\n" + j[1] : ""); else if (j[1]) { var at = h.indexOf('<section class="wx-trust"'); if (at < 0) at = h.indexOf("</main>"); if (at < 0) return; h = h.slice(0, at) + j[1] + "\n" + h.slice(at); } if (h === r.html) return; return bapi("save", { path: j[0], html: h, mtime: r.mtime }).then(function (s) { if (s.ok) n++; }); }); }); }, Promise.resolve()).then(function () { toast("FAQ: " + n + " website page(s) updated ✓"); });
    }
    /** republish every LIVE article linked to group id so the change shows on the site */
    function syncPages(id) {
      var L = used(id).filter(function (p) { return p.rel; }); if (!L.length) return Promise.resolve(0);
      var done = 0; return (W.tplReady ? W.tplReady(true) : Promise.resolve()).then(function () {
        return L.reduce(function (pr, p) { return pr.then(function () { return api("cms_get", { id: p.id }).then(function (gi) { var full = gi.item; return bapi("load", { path: full.rel }).then(function (cur) { if (!cur.ok) throw new Error(cur.error); return bapi("save", { path: full.rel, html: W.contentRender("post", full, cur.html, allPosts), mtime: cur.mtime }); }).then(function (r) { if (r && r.ok) done++; }); }).catch(function (e) { toast(p.title + ": " + (e.message || e), true); }); }); }, Promise.resolve());
      }).then(function () { return done; });
    }
    load();
    $("#fg-new").onclick = function () { edit(null); };
    function edit(x) {
      var items = x ? ((x.data || {}).items || []).slice() : [{ q: "", a: "" }];
      function rows() { return items.map(function (f, i) { return '<div class="fq" data-i="' + i + '"><input data-k="q" value="' + esc(f.q) + '" placeholder="Question"><textarea data-k="a" rows="2" placeholder="Answer">' + esc(f.a) + '</textarea><button type="button" class="btn sm ghost" data-del>' + ic("x") + "</button></div>"; }).join(""); }
      modal("<h3>" + (x ? "Edit" : "New") + ' FAQ group</h3><label>Group name<input id="fg-n" value="' + esc(x ? x.title : "") + '" placeholder="Renovation"></label><div id="fg-rows" class="fg-rows">' + rows() + '</div><button type="button" class="btn sm" id="fg-add">' + ic("plus") + 'Add question</button>' +
        '<div class="p19-how" style="margin-top:14px"><b>Show this group on website pages</b><ol><li>Tick the pages below (e.g. Kitchens, Renovation).</li><li>Press <b>Save</b>. An FAQ section (with Google FAQ markup) is added above the footer of those pages.</li><li>Untick a page and Save to remove it.</li></ol></div><label>Section heading<input id="fg-h" value="' + esc(x ? ((x.data || {}).heading || "") : "") + '" placeholder="Frequently asked questions"></label><div id="fg-pg" class="fg-pg muted">Loading pages…</div><p class="err" id="fg-err"></p><div class="modal-actions">' + (x ? '<button class="btn ghost danger" id="fg-del" style="margin-right:auto">Delete</button>' : "") + '<button class="btn" id="fg-x">Cancel</button><button class="btn pri" id="fg-go">Save</button></div>');
      $("#modal-card").classList.add("wide");
      var oldPages = x ? ((x.data || {}).pages || []) : [];
      bapi("pages").then(function (r) { var pg = (r.pages || []).map(function (p) { return p.path || p; }).filter(function (p) { return !/^(insights|projects)\/[^/]+\//.test(p) && !/^(admin|coming-soon|404|500|503)/.test(p); }).sort(); if ($("#fg-pg")) $("#fg-pg").innerHTML = pg.map(function (p) { return '<label class="check"><input type="checkbox" value="' + esc(p) + '"' + (oldPages.indexOf(p) > -1 ? " checked" : "") + "> /" + esc(p.replace(/index\.html$/, "")) + "</label>"; }).join("") || "No pages found"; });
      function grab() { items = $$("#fg-rows .fq").map(function (r) { return { q: $("[data-k=q]", r).value.trim(), a: $("[data-k=a]", r).value.trim() }; }); }
      $("#fg-add").onclick = function () { grab(); items.push({ q: "", a: "" }); $("#fg-rows").innerHTML = rows(); W.fillIcons($("#fg-rows")); };
      $("#fg-rows").onclick = function (e) { if (e.target.closest("[data-del]")) { e.target.closest(".fq").remove(); } };
      $("#fg-x").onclick = function () { $("#modal-card").classList.remove("wide"); closeModal(); };
      if ($("#fg-del")) $("#fg-del").onclick = function () { if (!confirm("Delete this group?")) return; if (oldPages.length) faqPush(x.id, { items: [], pages: [] }, oldPages); api("cms_delete", { id: x.id }).then(function (r) { if (!r.ok) return toast(r.error, true); $("#modal-card").classList.remove("wide"); closeModal(); load(); }); };
      $("#fg-go").onclick = function () { grab(); api("cms_save", { id: x ? x.id : 0, type: "faq", title: $("#fg-n").value.trim(), data: { items: items.filter(function (f) { return f.q && f.a; }), heading: $("#fg-h").value.trim(), pages: $$("#fg-pg input:checked").map(function (c) { return c.value; }) }, status: "published" }).then(function (r) { if (!r.ok) { $("#fg-err").textContent = r.error; return; } var gid = r.id || (r.item && r.item.id) || (x && x.id), nd = { items: items.filter(function (f) { return f.q && f.a; }), heading: $("#fg-h").value.trim(), pages: $$("#fg-pg input:checked").map(function (c) { return c.value; }) }; faqPush(gid, nd, oldPages); $("#modal-card").classList.remove("wide"); closeModal(); var live = x ? used(x.id).filter(function (p) { return p.rel; }).length : 0; if (!live) { load(); return toast("Saved"); } toast("Saved · updating " + live + " live page" + (live > 1 ? "s" : "") + "…"); syncPages(x.id).then(function (n) { toast("Saved · " + n + " live page" + (n === 1 ? "" : "s") + " updated ✓"); load(); }); }); };
    }
  };

  // ------------------------------------------------------------------ AI settings
  function aiSettings() {
    api("cms_ai_get").then(function (r) {
      if (!r.ok) return toast(r.error, true); var a = r.ai;
      var P = [["anthropic", "Claude (Anthropic)", "console.anthropic.com"], ["openai", "OpenAI (GPT / Codex)", "platform.openai.com"], ["openrouter", "OpenRouter (Hermes and others)", "openrouter.ai/keys"], ["custom", "Custom / local (9router, OmniRoute, LM Studio…)", "your endpoint (optional)"]];
      modal('<h3>AI writing help</h3><p class="muted">Choose one provider and paste its API key. Keys are stored on the server and never shown again.</p><div class="seg blk" id="ai-p">' + P.map(function (p) { return '<button type="button" data-p="' + p[0] + '"' + (a.provider === p[0] ? ' class="on"' : "") + ">" + p[1].split(" (")[0] + "</button>"; }).join("") + "</div>" +
        P.map(function (p) { return '<div class="ai-pp" data-pp="' + p[0] + '"' + (a.provider === p[0] ? "" : " hidden") + '><label>' + p[1] + ' API key <small>' + (a[p[0] + "KeySet"] ? "✓ saved. Leave empty to keep" : "get one at " + p[2]) + '</small><input type="password" id="ai-k-' + p[0] + '" autocomplete="off" placeholder="' + (a[p[0] + "KeySet"] ? "••••••••" : "Paste key") + '"></label>' +
          (p[0] === "custom" ? '<label>Endpoint URL <small>OpenAI-compatible, must be reachable from the internet (e.g. Cloudflare Tunnel) — localhost won’t work from Hostinger</small><input id="ai-u" value="' + esc(a.customUrl || "") + '" placeholder="https://ai.your-tunnel.com/v1"></label>' : "") +
          '<label>Model <small class="ai-ms" data-ms="' + p[0] + '"></small><div style="display:flex;gap:6px"><input id="ai-m-' + p[0] + '" list="ai-dl-' + p[0] + '" value="' + esc(a[p[0] + "Model"]) + '" placeholder="Click “Load models”" style="flex:1"><button type="button" class="btn" data-lm="' + p[0] + '">' + ic("refresh-cw") + ' Load models</button></div><datalist id="ai-dl-' + p[0] + '"></datalist></label></div>'; }).join("") +
        '<label>House style <small>(sent with every request)</small><textarea id="ai-v" rows="3">' + esc(a.voice) + '</textarea></label><p class="err" id="ai-err"></p><div class="modal-actions"><button class="btn" id="ai-t">Test</button><span style="flex:1"></span><button class="btn" id="ai-x">Cancel</button><button class="btn pri" id="ai-s">Save</button></div>');
      var prov = a.provider;
      $$("#ai-p [data-p]").forEach(function (b) { b.onclick = function () { prov = b.dataset.p; $$("#ai-p [data-p]").forEach(function (x) { x.classList.toggle("on", x === b); }); $$(".ai-pp").forEach(function (x) { x.hidden = x.dataset.pp !== prov; }); if (a[prov + "KeySet"] && !$("#ai-dl-" + prov).children.length) loadModels(prov, true); }; });
      // P16: fetch the model list from the provider and pick the recommended one automatically
      function loadModels(pv, auto) {
        var st = $('[data-ms="' + pv + '"]'), inp = $("#ai-m-" + pv); st.textContent = "loading…";
        api("cms_ai_models", { provider: pv, key: $("#ai-k-" + pv).value.trim(), url: pv === "custom" ? $("#ai-u").value.trim() : "" }).then(function (m) {
          if (!m.ok) { st.textContent = ""; if (!auto) $("#ai-err").textContent = m.error; return; }
          $("#ai-err").textContent = "";
          $("#ai-dl-" + pv).innerHTML = m.models.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("");
          if (!inp.value || m.models.indexOf(inp.value) < 0) inp.value = m.recommended;
          st.textContent = "· " + m.models.length + " available" + (inp.value === m.recommended ? " · recommended selected" : "");
        });
      }
      $$("[data-lm]").forEach(function (b) { b.onclick = function () { loadModels(b.dataset.lm, false); }; });
      $$(".ai-pp input[type=password]").forEach(function (k) { k.addEventListener("change", function () { if (k.value.trim()) loadModels(k.id.replace("ai-k-", ""), true); }); });
      if (a[prov + "KeySet"]) loadModels(prov, true);
      function body() { var s = { provider: prov, voice: $("#ai-v").value, customUrl: $("#ai-u").value.trim() }; P.forEach(function (p) { s[p[0] + "Key"] = $("#ai-k-" + p[0]).value.trim(); s[p[0] + "Model"] = $("#ai-m-" + p[0]).value.trim(); }); return s; }
      $("#ai-x").onclick = closeModal;
      $("#ai-s").onclick = function () { api("cms_ai_save", { ai: body() }).then(function (r2) { if (!r2.ok) { $("#ai-err").textContent = r2.error; return; } aiReady = !!r2.ai[r2.ai.provider + "KeySet"]; closeModal(); toast("AI settings saved"); W.route && W.route(); }); };
      $("#ai-t").onclick = function () { var b = this; busy(b, true); api("cms_ai_save", { ai: body() }).then(function () { return api("ai_test"); }).then(function (r2) { busy(b, false); $("#ai-err").textContent = r2.ok ? "" : r2.error; if (r2.ok) toast("Connected: " + r2.text); }); };
    });
  }
  W.aiSettings = aiSettings; W.pickImage = pickImage; W.cmsPreview = preview;

  W.VIEWS.blog = listView("post"); W.VIEWS.portfolio = listView("study");
  W.VIEWS.post = editorView("post"); W.VIEWS.study = editorView("study");
  W.VIEWS.testimonials = sectionView("testimonial"); W.VIEWS.team = sectionView("member");
  W.cms = { renderPage: renderPage, parsePage: parsePage, sectionHtml: sectionHtml, placeOnPage: placeOnPage, inl: inl };
})();
