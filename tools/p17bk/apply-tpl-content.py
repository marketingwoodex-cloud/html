# P17 C4/C5: template-aware mainHtml in admin-content.js (idempotent)
import os, re
os.chdir(os.path.join(os.path.dirname(__file__), '../../frontend-v1/admin'))
p = 'admin-content.js'; s = open(p).read()
if 'P17 templates' in s: print('already'); raise SystemExit
i = s.index('  function mainHtml(type, it, others) {'); j = s.index('  function ldJson(')
new = r'''  /* P17 templates: section order / on-off / hero style come from the item's template (W.tplFor); no template = original layout */
  var TPL_DEF = { hero: "image", toc: false, meta: true, facts: true, sections: [{ k: "body", on: true }, { k: "summary", on: true }, { k: "faqs", on: true }, { k: "quote", on: true }, { k: "related", on: true }] };
  function tplOf(type, it) { var x = W.tplFor && W.tplFor(type, it); return x && x.sections ? x : TPL_DEF; }
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
'''
s = s[:i] + new + s[j:]
open(p, 'w').write(s); print('ok')
