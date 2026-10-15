/* Phase 13: Yoast-style SEO + readability analyzer (shared by Admin SEO manager, page builder and content editors).
   WXSEO.analyze(html, { kw, related: [], url, title, desc }) → { seo: {score, checks}, read: {score, checks}, info } */
(function (g) {
  var STOP = /^(a|an|the|of|in|on|for|to|and|or|with|at|by|from|is|are|ka|ki|ke|mein|aur)$/i;
  var TRANS = ["also", "however", "therefore", "because", "for example", "for instance", "in addition", "moreover", "first", "second", "finally", "then", "next", "so", "but", "although", "instead", "meanwhile", "as a result", "in fact", "of course", "similarly", "likewise", "besides", "furthermore", "in short", "overall", "after", "before", "while", "since", "thus", "that is why", "on the other hand", "in conclusion", "whether", "unless", "even though"];
  function norm(s) { return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
  function has(text, kw) { var t = " " + norm(text) + " ", k = norm(kw); return !!k && t.indexOf(" " + k + " ") > -1; }
  function count(text, kw) { var t = " " + norm(text) + " ", k = " " + norm(kw) + " ", n = 0, i = 0; if (!norm(kw)) return 0; while ((i = t.indexOf(k, i)) > -1) { n++; i += k.length - 1; } return n; }
  function words(s) { var t = norm(s); return t ? t.split(" ") : []; }
  function sentences(s) { return String(s || "").replace(/\s+/g, " ").split(/(?<=[.!?؟۔])\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return words(x).length > 2; }); }
  function syl(w) { w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, ""); var m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1; }
  function slugWords(url) { return norm(decodeURIComponent(String(url || "").replace(/index\.html$/, "").split("/").filter(Boolean).pop() || "")).split(" "); }

  function extract(html) {
    var d = new DOMParser().parseFromString(String(html || ""), "text/html");
    var meta = function (sel) { var m = d.querySelector(sel); return m ? m.getAttribute("content") || "" : ""; };
    var info = { title: (d.querySelector("title") || {}).textContent || "", desc: meta('meta[name="description"]'), og: meta('meta[property="og:image"]'), robots: meta('meta[name="robots"]'),
      canonical: (d.querySelector('link[rel="canonical"]') || { getAttribute: function () { return ""; } }).getAttribute("href") || "",
      schema: [].map.call(d.querySelectorAll('script[type="application/ld+json"]'), function (s) { var t = []; try { (function walk(o) { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk); if (o["@type"]) t.push([].concat(o["@type"]).join("/")); if (o["@graph"]) walk(o["@graph"]); })(JSON.parse(s.textContent)); } catch (e) {} return t; }).reduce(function (a, b) { return a.concat(b); }, []) };
    var b = d.body || d.createElement("body");
    [].forEach.call(b.querySelectorAll("script,style,noscript,template,header.site-header,nav.mobile-panel,footer,.footer,.wx-wa,.wx-edit-btn,[data-seo-skip]"), function (n) { n.remove(); });
    info.h1 = [].map.call(b.querySelectorAll("h1"), function (h) { return h.textContent.replace(/\s+/g, " ").trim(); });
    info.subs = [].map.call(b.querySelectorAll("h2,h3"), function (h) { return h.textContent.replace(/\s+/g, " ").trim(); });
    info.imgs = [].map.call(b.querySelectorAll("img"), function (i) { return { alt: (i.getAttribute("alt") || "").trim(), src: i.getAttribute("src") || "" }; });
    var links = [].map.call(b.querySelectorAll("a[href]"), function (a) { return a.getAttribute("href"); }).filter(function (h) { return h && !/^(#|mailto:|tel:|javascript:)/i.test(h); });
    info.internal = links.filter(function (h) { return !/^https?:\/\//i.test(h) || /woodex\.com\.pk/i.test(h); }).length;
    info.external = links.length - info.internal;
    var paras = [].map.call(b.querySelectorAll("p,li"), function (p) { return p.textContent.replace(/\s+/g, " ").trim(); }).filter(function (t) { return words(t).length > 3; });
    info.paras = paras; info.intro = paras.slice(0, 2).join(" ");
    info.text = b.textContent.replace(/\s+/g, " ").trim(); info.words = words(info.text).length;
    // text blocks between headings (for subheading distribution)
    var blocks = [], cur = 0; (function walk(n) { [].forEach.call(n.childNodes, function (c) { if (c.nodeType === 1 && /^H[1-4]$/.test(c.tagName)) { blocks.push(cur); cur = 0; } else if (c.nodeType === 1 && /^(P|LI)$/.test(c.tagName)) cur += words(c.textContent).length; else if (c.nodeType === 1) walk(c); }); })(b); blocks.push(cur);
    info.maxBlock = Math.max.apply(null, blocks);
    return info;
  }

  function analyze(html, o) {
    o = o || {}; var i = extract(html); if (o.title != null) i.title = o.title; if (o.desc != null) i.desc = o.desc;
    var kw = String(o.kw || "").trim(), rel = (o.related || []).filter(Boolean), S = [], R = [];
    function add(list, id, st, text) { list.push({ id: id, status: st, text: text }); }
    var tl = i.title.length, dl = i.desc.length;
    // ---- SEO
    if (!kw) add(S, "kw", "bad", "No focus keyphrase set. Add the main search phrase for this page.");
    else {
      var kwW = words(kw).filter(function (w) { return !STOP.test(w); });
      var inT = has(i.title, kw); add(S, "kwTitle", inT ? (norm(i.title).indexOf(norm(kw)) < 12 ? "good" : "ok") : "bad", inT ? (norm(i.title).indexOf(norm(kw)) < 12 ? "Keyphrase at the start of the SEO title." : "Keyphrase is in the title; move it closer to the start.") : "Keyphrase is not in the SEO title.");
      add(S, "kwDesc", has(i.desc, kw) ? "good" : "bad", has(i.desc, kw) ? "Keyphrase appears in the meta description." : "Add the keyphrase to the meta description.");
      var sw = slugWords(o.url), sHit = kwW.filter(function (w) { return sw.indexOf(w) > -1; }).length;
      add(S, "kwUrl", !o.url || o.url === "/" ? "good" : sHit === kwW.length ? "good" : sHit ? "ok" : "bad", !o.url || o.url === "/" ? "Home page URL is fine." : sHit === kwW.length ? "Keyphrase is in the URL." : sHit ? "Part of the keyphrase is in the URL." : "The URL does not contain the keyphrase.");
      var h1k = i.h1.some(function (h) { return has(h, kw); }); add(S, "kwH1", h1k ? "good" : "bad", h1k ? "Keyphrase is in the main heading (H1)." : "Put the keyphrase in the H1 heading.");
      add(S, "kwIntro", has(i.intro, kw) ? "good" : kwW.every(function (w) { return has(i.intro, w); }) ? "ok" : "bad", has(i.intro, kw) ? "Keyphrase appears in the first paragraph." : "Use the keyphrase in the first paragraph.");
      var n = count(i.text, kw), dens = i.words ? n * words(kw).length / i.words * 100 : 0;
      add(S, "kwDensity", n === 0 ? "bad" : dens < 0.5 ? "ok" : dens > 3 ? "bad" : "good", "Keyphrase found " + n + "× (density " + dens.toFixed(1) + "%). " + (n === 0 ? "Use it in the text." : dens < 0.5 ? "Use it a few more times." : dens > 3 ? "Too often; this looks like keyword stuffing." : "Good."));
      var subK = i.subs.filter(function (h) { return kwW.some(function (w) { return has(h, w); }); }).length;
      add(S, "kwSubs", !i.subs.length ? "ok" : subK ? "good" : "ok", !i.subs.length ? "No subheadings (H2/H3) on the page." : subK ? "Keyphrase words appear in " + subK + " subheading(s)." : "Use the keyphrase in at least one H2/H3 subheading.");
      var altK = i.imgs.some(function (m) { return kwW.some(function (w) { return has(m.alt, w); }); });
      add(S, "kwAlt", !i.imgs.length ? "ok" : altK ? "good" : "ok", !i.imgs.length ? "No images on the page." : altK ? "Keyphrase words appear in image alt text." : "Add the keyphrase to one image's alt text.");
      rel.forEach(function (r, k) { var c = count(i.text, r); add(S, "rel" + k, c ? "good" : "ok", "Related keyphrase “" + r + "” " + (c ? "used " + c + "×." : "is not used yet.")); });
    }
    add(S, "title", tl >= 30 && tl <= 60 ? "good" : tl && tl <= 70 ? "ok" : "bad", "SEO title is " + tl + " characters " + (tl >= 30 && tl <= 60 ? "(good)." : tl < 30 ? "(too short; aim for 30–60)." : "(too long; Google cuts it after ~60)."));
    add(S, "desc", dl >= 120 && dl <= 160 ? "good" : dl >= 70 && dl <= 175 ? "ok" : "bad", dl ? "Meta description is " + dl + " characters " + (dl >= 120 && dl <= 160 ? "(good)." : dl < 120 ? "(aim for 120–160)." : "(too long; aim for 120–160).") : "No meta description. Write one of 120–160 characters.");
    add(S, "h1", i.h1.length === 1 ? "good" : i.h1.length ? "ok" : "bad", i.h1.length === 1 ? "The page has one H1." : i.h1.length ? "The page has " + i.h1.length + " H1 headings; use just one." : "The page has no H1 heading.");
    add(S, "len", i.words >= 600 ? "good" : i.words >= 300 ? "ok" : "bad", "The text has " + i.words + " words. " + (i.words >= 600 ? "Good length." : i.words >= 300 ? "Fine; 600+ ranks better." : "Too short; write at least 300 words."));
    var noAlt = i.imgs.filter(function (m) { return !m.alt; }).length; add(S, "alt", !i.imgs.length ? "ok" : noAlt ? "bad" : "good", !i.imgs.length ? "Add at least one image." : noAlt ? noAlt + " image(s) have no alt text." : "All images have alt text.");
    add(S, "intLinks", i.internal >= 3 ? "good" : i.internal ? "ok" : "bad", i.internal + " internal link(s). " + (i.internal >= 3 ? "Good." : "Link to more related pages."));
    add(S, "extLinks", i.external ? "good" : "ok", i.external ? i.external + " outbound link(s)." : "No outbound links (optional: link to a trusted source).");
    add(S, "og", i.og ? "good" : "ok", i.og ? "Social share image is set." : "No social share image (og:image).");
    add(S, "schema", i.schema.length ? "good" : "ok", i.schema.length ? "Schema found: " + i.schema.filter(function (v, k, a) { return a.indexOf(v) === k; }).slice(0, 6).join(", ") + "." : "No schema (structured data) found.");
    if (/noindex/i.test(i.robots)) add(S, "noindex", "bad", "This page is set to noindex; Google will not show it.");
    // ---- Readability
    var sent = sentences(i.paras.join(". ")), long = sent.filter(function (s) { return words(s).length > 20; }).length, lp = sent.length ? long / sent.length * 100 : 0;
    var ws = words(i.paras.join(" ")), sy = ws.reduce(function (a, w) { return a + syl(w); }, 0), fre = sent.length && ws.length ? 206.835 - 1.015 * (ws.length / sent.length) - 84.6 * (sy / ws.length) : 0;
    add(R, "flesch", fre >= 60 ? "good" : fre >= 40 ? "ok" : "bad", "Flesch reading ease: " + Math.round(fre) + (fre >= 60 ? " (easy to read)." : fre >= 40 ? " (fairly difficult; use shorter words and sentences)." : " (difficult to read)."));
    add(R, "sentLen", lp <= 25 ? "good" : lp <= 35 ? "ok" : "bad", Math.round(lp) + "% of sentences are longer than 20 words " + (lp <= 25 ? "(good)." : "(aim for under 25%)."));
    var longP = i.paras.filter(function (p) { return words(p).length > 150; }).length; add(R, "paraLen", longP ? "ok" : "good", longP ? longP + " paragraph(s) are longer than 150 words." : "Paragraphs are a good length.");
    add(R, "subDist", i.maxBlock > 300 ? "bad" : i.maxBlock > 250 ? "ok" : "good", i.maxBlock > 250 ? "A section has " + i.maxBlock + " words without a subheading; add H2/H3s." : "Subheadings are well spread.");
    var tr = sent.filter(function (s) { var t = " " + norm(s) + " "; return TRANS.some(function (w) { return t.indexOf(" " + w + " ") > -1; }); }).length, tp = sent.length ? tr / sent.length * 100 : 0;
    add(R, "trans", tp >= 30 ? "good" : tp >= 20 ? "ok" : "bad", Math.round(tp) + "% of sentences use transition words " + (tp >= 30 ? "(good)." : "(aim for 30%+, e.g. “also”, “because”, “for example”)."));
    var pas = sent.filter(function (s) { return /\b(is|are|was|were|be|been|being|get|got)\s+(\w+ly\s+)?\w+(ed|en)\b/i.test(s); }).length, pp = sent.length ? pas / sent.length * 100 : 0;
    add(R, "passive", pp <= 10 ? "good" : pp <= 15 ? "ok" : "bad", Math.round(pp) + "% passive voice " + (pp <= 10 ? "(good)." : "(aim for under 10%)."));
    var rep = 0; for (var k = 2; k < sent.length; k++) { var f = function (x) { return (words(x)[0] || ""); }; if (f(sent[k]) && f(sent[k]) === f(sent[k - 1]) && f(sent[k]) === f(sent[k - 2])) rep++; }
    add(R, "repeat", rep ? "ok" : "good", rep ? rep + " time(s) three sentences in a row start with the same word." : "Sentence openings are varied.");
    function score(list) { var p = { good: 1, ok: 0.5, bad: 0 }, t = list.reduce(function (a, c) { return a + p[c.status]; }, 0); return list.length ? Math.round(t / list.length * 100) : 0; }
    var order = { bad: 0, ok: 1, good: 2 }; function sort(l) { return l.sort(function (a, b) { return order[a.status] - order[b.status]; }); }
    var ss = score(S); if (!kw) ss = Math.min(ss, 60);
    return { seo: { score: ss, checks: sort(S) }, read: { score: score(R), checks: sort(R) }, info: { title: i.title, desc: i.desc, h1: i.h1[0] || "", words: i.words, schema: i.schema, og: i.og, canonical: i.canonical, noindex: /noindex/i.test(i.robots) } };
  }
  function color(s) { return s >= 70 ? "good" : s >= 40 ? "ok" : "bad"; }
  /** Renders a Google-style result preview + both check lists into el. */
  function render(el, r, o) {
    o = o || {}; var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var li = function (c) { return '<li class="sx-' + c.status + '"><i></i>' + esc(c.text) + "</li>"; };
    el.innerHTML = (o.noPreview ? '' : '<div class="sx-g"><div class="sx-u">woodex.com.pk' + esc((o.url || "/").replace(/\/$/, "").replace(/\//g, " › ")) + '</div><div class="sx-t">' + esc(r.info.title.length > 62 ? r.info.title.slice(0, 60) + "…" : r.info.title || "(no title)") + '</div><div class="sx-d">' + esc(r.info.desc.length > 162 ? r.info.desc.slice(0, 158) + "…" : r.info.desc || "Google will pick text from the page. Write a meta description.") + "</div></div>") +
      '<div class="sx-h"><span class="sx-b sx-' + color(r.seo.score) + '">SEO ' + r.seo.score + '</span><span class="sx-b sx-' + color(r.read.score) + '">Readability ' + r.read.score + "</span></div>" +
      "<details open><summary>SEO analysis</summary><ul class='sx-l'>" + r.seo.checks.map(li).join("") + "</ul></details><details><summary>Readability</summary><ul class='sx-l'>" + r.read.checks.map(li).join("") + "</ul></details>";
  }
  var css = ".sx-g{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;font-family:arial,sans-serif;margin-bottom:10px}.sx-u{font-size:12px;color:#4d5156}.sx-t{font-size:18px;color:#1a0dab;margin:3px 0;line-height:1.3}.sx-d{font-size:13px;color:#4d5156;line-height:1.45}" +
    ".sx-h{display:flex;gap:6px;margin:8px 0}.sx-b{font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;color:#fff}.sx-b.sx-good{background:#16a34a}.sx-b.sx-ok{background:#f59e0b}.sx-b.sx-bad{background:#dc2626}" +
    ".sx-l{list-style:none;margin:6px 0 10px;padding:0;font-size:13px}.sx-l li{display:flex;gap:8px;padding:4px 0;line-height:1.4}.sx-l i{flex:0 0 10px;height:10px;border-radius:50%;margin-top:4px}.sx-good i{background:#16a34a}.sx-ok i{background:#f59e0b}.sx-bad i{background:#dc2626}details>summary{cursor:pointer;font-weight:600;font-size:13.5px;padding:4px 0}" +
    ".sx-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle}.sx-dot.sx-good{background:#16a34a}.sx-dot.sx-ok{background:#f59e0b}.sx-dot.sx-bad{background:#dc2626}";
  if (typeof document !== "undefined") { var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); }
  g.WXSEO = { analyze: analyze, render: render, color: color, extract: extract };
})(window);
