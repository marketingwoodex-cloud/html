/* Woodex Admin v2 — A6b
 * Smart-field editor: any page's text, links, images, FAQs and SEO as a form; the design stays exactly as it is.
 * Service pages + City pages (edit, create from a template city, bulk-create with AI as drafts) + Business info (one change → every page).
 */
(function () {
  "use strict";
  var W = window.WXA, S = W.S, api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var SITE = "https://woodex.com.pk";
  var INLINE = { STRONG: 1, EM: 1, B: 1, I: 1, A: 1, BR: 1 };
  var SKIP = "script,style,svg,noscript,template,iframe,select,input,textarea,option,nav,[class*=breadcrumb],[class*=crumb],.wx-trust,.wx-tst,.wx-team";
  var kindsCache = null, aiReady = false;

  function kinds() { return kindsCache ? Promise.resolve(kindsCache) : api("cms_page_kinds").then(function (r) { kindsCache = r.ok ? r.kinds : {}; return kindsCache; }); }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  function inl(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:|#)[^)\s]*)\)/g, function (m, t, u) { return '<a href="' + u + '">' + t + "</a>"; }).replace(/\n/g, "<br>");
  }
  function md(node) {
    var out = "";
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, " "); return; } if (n.nodeType !== 1) return;
      var t = n.tagName, inner = md(n);
      if (t === "BR") out += "\n"; else if (t === "STRONG" || t === "B") out += "**" + inner + "**"; else if (t === "EM" || t === "I") out += "*" + inner + "*";
      else if (t === "A") out += "[" + inner + "](" + (n.getAttribute("href") || "") + ")"; else out += inner;
    });
    return out.replace(/ *\n */g, "\n").trim();
  }
  function okInline(el) {
    return Array.prototype.every.call(el.children, function (c) { return INLINE[c.tagName] && Array.prototype.every.call(c.children, function (g) { return g.tagName === "BR" || (INLINE[g.tagName] && g.tagName !== "A" && !g.children.length); }) && !(c.tagName === "A" && c.children.length); });
  }
  function hasText(el) { return /[A-Za-z0-9\u0600-\u06FF]/.test(el.textContent) && !/^[\W\d]{0,2}$/.test(el.textContent.trim()); }
  function label(el) {
    if (el.closest('[class*="faq-q"]')) return "Question"; if (el.closest('[class*="faq-a"]')) return "Answer";
    var t = el.tagName; return { H1: "Main heading", H2: "Heading", H3: "Sub-heading", H4: "Sub-heading", P: /label|kicker|eyebrow/.test(el.className) ? "Label" : "Text", LI: "List item", A: /btn/.test(el.className) ? "Button" : "Link", DT: "Term", DD: "Detail", FIGCAPTION: "Caption", BLOCKQUOTE: "Quote", BUTTON: "Button", TD: "Table cell", TH: "Table heading" }[t] || (/price|amount/.test(el.className) ? "Price" : "Short text");
  }

  // ------------------------------------------------------------------ extract / apply
  function extract(doc) {
    var main = doc.querySelector("main") || doc.body, sections = [], n = 0;
    function walk(root, out) {
      Array.prototype.forEach.call(root.children, function (el) {
        if (el.matches(SKIP)) return;
        if (el.tagName === "IMG") { out.push({ id: "f" + n++, kind: "img", el: el, src: el.getAttribute("src") || "", alt: el.getAttribute("alt") || "", deco: el.getAttribute("aria-hidden") === "true" || !!el.closest("[aria-hidden=true]") }); return; }
        if (!el.textContent.trim() && !el.querySelector("img")) return;
        if (okInline(el) && hasText(el) && !/^(SECTION|ARTICLE|MAIN|HEADER|FOOTER|NAV|UL|OL|DL|FIGURE|PICTURE|FORM|TABLE|TBODY|THEAD|TR)$/.test(el.tagName)) {
          var f = { id: "f" + n++, kind: "text", el: el, md: md(el), label: label(el) };
          if (el.tagName === "A") f.href = el.getAttribute("href") || "";
          out.push(f); return;
        }
        if (el.tagName === "A" && el.getAttribute("href")) out.push({ id: "f" + n++, kind: "link", el: el, href: el.getAttribute("href"), label: "Link address" });
        walk(el, out);
      });
    }
    var groups = [], cur = null;
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.matches(SKIP) || el.nodeType !== 1) return;
      var h = el.querySelector("h1,h2"), name = h ? h.textContent.replace(/\s+/g, " ").trim() : (el.id || el.className.split(" ")[0] || el.tagName.toLowerCase());
      var fields = []; walk(el, fields); if (!fields.length) return;
      groups.push({ name: name.slice(0, 80), fields: fields, hero: /hero/.test(el.className) });
    });
    void cur; void sections;
    var q = function (s) { return doc.querySelector(s); };
    var seo = { title: (q("title") || {}).textContent || "", desc: (q('meta[name="description"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "", og: ((q('meta[property="og:image"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "").replace(SITE, "") };
    return { groups: groups, seo: seo };
  }
  function setAttr(doc, sel, v) { var m = doc.querySelector(sel); if (m) m.setAttribute("content", v); }
  /** Apply form values to the parsed document. Only changed fields are touched, so untouched markup stays byte-identical in the DOM. Returns number of changes. */
  function apply(doc, model, vals) {
    var n = 0, faqTouched = false;
    model.groups.forEach(function (g) {
      g.fields.forEach(function (f) {
        var v = vals[f.id]; if (!v) return;
        if (f.kind === "text") {
          if (v.md !== undefined && v.md !== f.md) { f.el.innerHTML = inl(v.md); n++; if (f.el.closest('[class*="faq-"]')) faqTouched = true; }
          if (f.href !== undefined && v.href !== undefined && v.href !== f.href) { f.el.setAttribute("href", v.href); n++; }
        } else if (f.kind === "link") { if (v.href !== undefined && v.href !== f.href) { f.el.setAttribute("href", v.href); n++; } }
        else if (f.kind === "img") {
          if (v.src !== undefined && v.src !== f.src) { f.el.setAttribute("src", v.src); f.el.removeAttribute("srcset"); f.el.removeAttribute("sizes"); var pic = f.el.closest("picture"); if (pic) $$("source", pic).forEach(function (s) { s.remove(); }); n++; }
          if (v.alt !== undefined && v.alt !== f.alt) { f.el.setAttribute("alt", v.alt); n++; }
        }
      });
    });
    var s = vals.seo || {};
    if (s.title !== undefined && s.title !== model.seo.title) { var t = doc.querySelector("title"); if (t) t.textContent = s.title; setAttr(doc, 'meta[property="og:title"]', s.title); setAttr(doc, 'meta[name="twitter:title"]', s.title); n++; }
    if (s.desc !== undefined && s.desc !== model.seo.desc) { setAttr(doc, 'meta[name="description"]', s.desc); setAttr(doc, 'meta[property="og:description"]', s.desc); setAttr(doc, 'meta[name="twitter:description"]', s.desc); n++; }
    if (s.og !== undefined && s.og !== model.seo.og && s.og) { var u = /^https?:/.test(s.og) ? s.og : SITE + s.og; setAttr(doc, 'meta[property="og:image"]', u); setAttr(doc, 'meta[name="twitter:image"]', u); n++; }
    if (faqTouched) syncFaqLd(doc);
    return n;
  }
  function syncFaqLd(doc) {
    var items = $$('[class*="faq-item"]', doc).map(function (it) { var q = it.querySelector('[class*="faq-q"] span') || it.querySelector('[class*="faq-q"]'), a = it.querySelector('[class*="faq-a"]'); return q && a ? { q: q.textContent.trim(), a: a.textContent.replace(/\s+/g, " ").trim() } : null; }).filter(Boolean);
    if (!items.length) return;
    $$('script[type="application/ld+json"]', doc).forEach(function (sc) {
      try {
        var j = JSON.parse(sc.textContent), arr = Array.isArray(j) ? j : [j], hit = false;
        arr.forEach(function (x) { if (x && x["@type"] === "FAQPage") { x.mainEntity = items.map(function (f) { return { "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }; }); hit = true; } });
        if (hit) sc.textContent = JSON.stringify(Array.isArray(j) ? arr : arr[0]).replace(/<\//g, "<\\/");
      } catch (e) {}
    });
  }
  function serialize(doc) { return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML + "\n"; }
  function parse(html) { return new DOMParser().parseFromString(html, "text/html"); }

  // ------------------------------------------------------------------ editor UI (shared by live pages and city drafts)
  /** src: { title, load(): Promise<html>, save(html): Promise, crumb, back, extraButtons, onReady } */
  function fieldEditor(el, src) {
    el.innerHTML = '<p class="muted">Loading…</p>';
    var doc, model, html0;
    Promise.all([src.load(), api("cms_list", { type: "faq" })]).then(function (rs) {
      html0 = rs[0]; aiReady = rs[1].aiReady; doc = parse(html0); model = extract(doc); draw();
    }).catch(function (e) { el.innerHTML = '<div class="card card-b">' + esc(e.message || e) + "</div>"; });
    var dirty = false;
    function field(f) {
      if (f.kind === "img") return '<div class="sf sf-img" data-f="' + f.id + '"><div class="imf-p" style="background-image:url(\'' + esc(f.src) + '\')" data-pick></div><div class="sf-imgf"><span class="sf-l">' + (f.deco ? "Background image" : "Image") + '</span><button type="button" class="btn sm" data-pick>Change image</button>' + (f.deco ? "" : '<input data-k="alt" value="' + esc(f.alt) + '" placeholder="Alt text (describe the photo)">') + "</div></div>";
      if (f.kind === "link") return '<div class="sf sf-link" data-f="' + f.id + '"><span class="sf-l">' + ic("link") + ' Link address</span><input data-k="href" value="' + esc(f.href) + '"></div>';
      var long = f.md.length > 90 || f.md.indexOf("\n") > -1 || f.label === "Text" || f.label === "Answer";
      return '<div class="sf" data-f="' + f.id + '"><span class="sf-l">' + esc(f.label) + "</span>" + (long ? '<textarea data-k="md" rows="' + Math.min(8, Math.max(2, Math.ceil(f.md.length / 90))) + '">' + esc(f.md) + "</textarea>" : '<input data-k="md" value="' + esc(f.md) + '">') + (f.href !== undefined ? '<div class="sf-href">' + ic("link") + '<input data-k="href" value="' + esc(f.href) + '"></div>' : "") + "</div>";
    }
    function draw() {
      var total = model.groups.reduce(function (a, g) { return a + g.fields.length; }, 0);
      el.innerHTML = '<div id="fe">' + head(src.title, src.crumb, '<span class="badge" id="fe-dirty" hidden>Unsaved</span>' + (src.extraButtons || "") + '<button class="btn" id="fe-prev">' + ic("eye") + 'Preview</button><button class="btn pri" id="fe-save">' + ic("send") + (src.saveLabel || "Publish changes") + "</button>") +
        (src.banner ? '<div class="banner">' + ic("info") + "<span>" + src.banner + "</span></div>" : "") +
        '<div class="qe"><div class="qe-main"><div class="fe-bar card"><input id="fe-q" placeholder="Find text on this page…"><span class="muted">' + total + " editable fields in " + model.groups.length + ' sections</span><button class="btn sm" id="fe-all">Expand all</button></div>' +
        model.groups.map(function (g, gi) {
          return '<details class="card fe-sec"' + (gi < 2 ? " open" : "") + '><summary><span class="fe-n">' + (gi + 1) + "</span><b>" + esc(g.name) + '</b><span class="badge">' + g.fields.length + "</span>" + ic("chevron-down") + '</summary><div class="fe-body">' + g.fields.map(field).join("") + "</div></details>";
        }).join("") + '</div><div class="qe-side">' +
        '<div class="card card-b"><div class="side-hr"><h4 class="side-h">Search & sharing</h4>' + (aiReady ? '<button type="button" class="btn sm ai" id="fe-ai">' + ic("sparkles") + "Write</button>" : "") + '</div><label>SEO title <small id="fe-stc"></small><input id="fe-st" value="' + esc(model.seo.title) + '"></label><label>Meta description <small id="fe-sdc"></small><textarea id="fe-sd" rows="4">' + esc(model.seo.desc) + '</textarea></label><div class="imf" id="fe-og"><div class="imf-p" style="background-image:url(\'' + esc(model.seo.og) + '\')"></div><div><b>Share image</b><div class="imf-b"><button type="button" class="btn sm" id="fe-ogp">Change</button></div></div><input type="hidden" value="' + esc(model.seo.og) + '"></div><div class="serp"><span>' + esc(src.url || "") + '</span><b id="fe-spt"></b><p id="fe-spd"></p></div></div>' +
        (src.side || "") +
        '<div class="card card-b"><h4 class="side-h">Tips</h4><p class="muted" style="margin:0;font-size:13px">Only text, links and images change here; the design stays exactly as it is. Use **bold**, *italic* and [link](/contact/) in text. For layout changes, use the page builder.</p></div></div></div></div>';
      W.fillIcons(el); bind();
    }
    function serp() { var t = $("#fe-st").value, d = $("#fe-sd").value; $("#fe-spt").textContent = t; $("#fe-spd").textContent = d; $("#fe-stc").textContent = t.length + "/60"; $("#fe-stc").className = t.length > 60 ? "bad" : ""; $("#fe-sdc").textContent = d.length + "/158"; $("#fe-sdc").className = d.length > 158 || (d.length && d.length < 110) ? "warnc" : ""; }
    var imgVals = {};
    function vals() {
      var v = { seo: { title: $("#fe-st").value, desc: $("#fe-sd").value, og: $("#fe-og input").value } };
      $$("#fe .sf").forEach(function (b) { var o = {}; $$("[data-k]", b).forEach(function (i) { o[i.dataset.k] = i.dataset.k === "md" ? i.value.replace(/\r/g, "").trim() : i.value.trim(); }); if (imgVals[b.dataset.f]) o.src = imgVals[b.dataset.f]; v[b.dataset.f] = o; });
      return v;
    }
    function build() { var d2 = parse(html0), m2 = extract(d2); var n = apply(d2, m2, vals()); return { html: serialize(d2), n: n }; }
    function bind() {
      serp(); var R = $("#fe");
      R.addEventListener("input", function (e) { if (e.target.id === "fe-q") return; dirty = true; $("#fe-dirty").hidden = false; serp(); });
      $("#fe-q").oninput = function () { var q = this.value.toLowerCase(); $$("#fe .fe-sec").forEach(function (s) { var any = false; $$(".sf", s).forEach(function (f) { var hit = !q || $$("input,textarea", f).some(function (i) { return i.value.toLowerCase().indexOf(q) > -1; }); f.hidden = !hit; any = any || hit; }); s.hidden = !any; if (q && any) s.open = true; }); };
      $("#fe-all").onclick = function () { var open = this.textContent === "Expand all"; $$("#fe .fe-sec").forEach(function (s) { s.open = open; }); this.textContent = open ? "Collapse all" : "Expand all"; };
      R.addEventListener("click", function (e) {
        var p = e.target.closest("[data-pick]"); if (!p) return; var b = p.closest(".sf");
        W.pickImage(function (u) { imgVals[b.dataset.f] = u; $(".imf-p", b).style.backgroundImage = "url('" + u + "')"; dirty = true; $("#fe-dirty").hidden = false; });
      });
      $("#fe-ogp").onclick = function () { W.pickImage(function (u) { $("#fe-og input").value = u; $("#fe-og .imf-p").style.backgroundImage = "url('" + u + "')"; dirty = true; $("#fe-dirty").hidden = false; }); };
      if ($("#fe-ai")) $("#fe-ai").onclick = function () {
        var b = this; b.disabled = true; var text = model.groups.slice(0, 4).map(function (g) { return g.fields.filter(function (f) { return f.kind === "text"; }).map(function (f) { return f.md; }).join("\n"); }).join("\n");
        api("ai_run", { task: "meta", input: { title: src.title, text: text } }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); try { var j = JSON.parse(r.text.match(/\{[\s\S]*\}/)[0]); if (j.title) $("#fe-st").value = j.title; if (j.desc) $("#fe-sd").value = j.desc; serp(); dirty = true; $("#fe-dirty").hidden = false; } catch (x) { toast("AI reply could not be read", true); } });
      };
      $("#fe-prev").onclick = function () { var r = build(); W.cmsPreview(r.html); };
      $("#fe-save").onclick = function () {
        var r = build(), b = this; if (!r.n && !src.alwaysSave) return toast("No changes to publish");
        b.disabled = true;
        src.save(r.html, r.n).then(function (ok) { b.disabled = false; if (ok === false) return; dirty = false; html0 = r.html; doc = parse(html0); model = extract(doc); imgVals = {}; draw(); toast(src.savedMsg || r.n + " change(s) published"); }).catch(function (e) { b.disabled = false; toast(e.message || String(e), true); });
      };
      if (src.onReady) src.onReady({ build: build, vals: vals });
      window.onbeforeunload = function () { return dirty && $("#fe") ? "Unsaved changes" : undefined; };
    }
  }
  function livePage(rel) {
    var mt = 0;
    return {
      load: function () { return bapi("load", { path: rel }).then(function (r) { if (!r.ok) throw new Error(r.error || "Page not found"); mt = r.mtime; return r.html; }); },
      save: function (html) { return bapi("save", { path: rel, html: html, mtime: mt }).then(function (r) { if (r.ok) { mt = r.mtime; return true; } if (r.error && /changed elsewhere/.test(r.error) && confirm(r.error + "\n\nOverwrite?")) return bapi("save", { path: rel, html: html, force: true }).then(function (r2) { if (!r2.ok) throw new Error(r2.error); mt = r2.mtime; return true; }); throw new Error(r.error || "Save failed"); }); },
      url: "woodex.com.pk › " + rel.replace(/index\.html$/, "").replace(/\/$/, "").split("/").join(" › ")
    };
  }
  W.VIEWS.fields = function (el, parts) {
    var rel = decodeURIComponent(parts.join("/")), src = livePage(rel), back = /^[a-z0-9-]+\/index\.html$/.test(rel) && kindsCache && kindsCache[rel] === "city" ? "cities" : "services";
    src.title = rel === "index.html" ? "Home page" : "/" + rel.replace(/index\.html$/, "");
    src.crumb = (back === "cities" ? "Cities" : "Service pages") + " / " + src.title;
    src.extraButtons = '<a class="btn" href="/' + esc(rel.replace(/index\.html$/, "")) + '" target="_blank">' + ic("external-link") + 'View live</a><a class="btn" href="#/builder/' + encodeURIComponent(rel) + '">' + ic("square-pen") + "Open in builder</a>";
    fieldEditor(el, src);
  };

  // ------------------------------------------------------------------ service pages list
  W.VIEWS.services = function (el) {
    el.innerHTML = head("Service & site pages", "Service pages", '<a class="btn" href="#/pagetpl">' + ic("blocks") + 'From a template</a><button class="btn pri" id="sv-new">' + ic("plus") + 'New service page</button>') + '<div class="p19-how"><b>Add a service page</b><ol><li><b>New service page</b>: copy the layout of an existing service page (or start blank), then give it a title and address.</li><li><b>Duplicate</b> on any row: same thing, starting from that page.</li><li>It opens in the builder as a <b>draft</b>. Edit, then publish from Pages.</li></ol></div>'  + '<div class="card"><div class="card-h"><h3>Pages</h3><input id="sv-q" class="sm-in" placeholder="Search…"></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th>Address</th><th>Type</th><th></th></tr></thead><tbody id="sv-rows"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>';
    Promise.all([bapi("pages"), kinds()]).then(function (rs) {
      if (!rs[0].ok) { $("#sv-rows").innerHTML = '<tr><td colspan="4"><b style="color:#d92d20">Could not load pages:</b> ' + esc(rs[0].error || "no answer") + ' <button class="btn sm" id="sv-retry">Retry</button> <a href="#/system">System check</a></td></tr>'; $("#sv-retry").onclick = function () { W.VIEWS.services(el); }; return; }
      var pages = (rs[0].pages || []).filter(function (p) { var k = rs[1][p.path]; return k !== "city" && !/^(insights|projects)\//.test(p.path) && !/^(404|500|503|coming-soon)\.html$/.test(p.path); });
      function draw() {
        var q = $("#sv-q").value.toLowerCase();
        $("#sv-rows").innerHTML = pages.filter(function (p) { return !q || (p.title + p.url).toLowerCase().indexOf(q) > -1; }).map(function (p) { return '<tr class="click" data-p="' + esc(p.path) + '"><td><b>' + esc(p.title.replace(/\s*\|\s*Woodex.*$/, "")) + '</b></td><td class="muted">' + esc(p.url) + '</td><td><span class="badge">' + esc(rs[1][p.path] || "page") + '</span></td><td class="r"><span class="btn sm ghost" data-dup>' + ic("copy") + 'Duplicate</span> <span class="btn sm">' + ic("edit") + "Edit content</span></td></tr>"; }).join("");
        W.fillIcons($("#sv-rows"));
      }
      draw(); $("#sv-q").oninput = draw;
      S.plist = S.plist && S.plist.length ? S.plist : rs[0].pages || [];
      var svc = function () { return pages.find(function (p) { return rs[1][p.path] === "service"; }) || null; };
      $("#sv-new").onclick = function () { if (W.newPage) W.newPage(svc()); };
      $("#sv-rows").onclick = function (e) { var tr = e.target.closest("tr[data-p]"); if (tr && e.target.closest("[data-dup]")) { var pg = pages.find(function (p) { return p.path === tr.dataset.p; }); if (W.newPage) W.newPage(pg); return; } if (tr) location.hash = "#/fields/" + encodeURIComponent(tr.dataset.p); };
    });
  };

  // ------------------------------------------------------------------ cities
  function titleCase(s) { return String(s).trim().replace(/\s+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function cityName(p) { var m = /in ([^|<]+?)\s*(\||$)/.exec(p.title || ""); return m ? m[1].trim() : titleCase(p.path.split("/")[0].replace(/-/g, " ")); }
  function reWord(w) { return new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"); }
  /** Clone a city page: swap the city name and address in <head> and <main> only (header/footer city links stay intact). */
  function cloneCity(html, from, to) {
    var hs = html.indexOf("<head"), he = html.indexOf("</head>"), ms = html.indexOf("<main"), me = html.indexOf("</main>");
    if (hs < 0 || he < 0 || ms < 0 || me < 0) throw new Error("The template city page has an unexpected layout");
    function sw(s) { return s.replace(new RegExp("/" + from.slug + "/", "g"), "/" + to.slug + "/").replace(reWord(from.name), to.name); }
    return html.slice(0, hs) + sw(html.slice(hs, he)) + html.slice(he, ms) + sw(html.slice(ms, me)) + html.slice(me);
  }
  W.VIEWS.cities = function (el) {
    el.innerHTML = head("City pages", "Cities", '<button class="btn" id="ct-bulk">' + ic("sparkles") + 'Bulk create with AI</button><button class="btn pri" id="ct-new">' + ic("plus") + "New city</button>") +
      '<div class="banner">' + ic("info") + '<span>New cities are copied from a template city, then saved as <b>drafts</b>. Review each draft, then publish it. Add new cities to the footer menu in <a href="#/global">Header & footer</a>.</span></div>' +
      '<div class="card"><div class="card-h"><h3>Cities</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>City</th><th>Status</th><th>Address</th><th></th></tr></thead><tbody id="ct-rows"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>';
    W.fillIcons(el);
    var live = [], drafts = [];
    function load() {
      kindsCache = null;
      Promise.all([bapi("pages"), kinds(), api("cms_list", { type: "city" })]).then(function (rs) {
        aiReady = rs[2].aiReady;
        if (!rs[0].ok) { $("#ct-rows").innerHTML = '<tr><td colspan="4"><b style="color:#d92d20">Could not load city pages:</b> ' + esc(rs[0].error || "no answer") + ' <button class="btn sm" id="ct-retry">Retry</button> <a href="#/system">System check</a></td></tr>'; $("#ct-retry").onclick = function () { W.VIEWS.cities ? W.VIEWS.cities(el) : location.reload(); }; return; }
        live = (rs[0].pages || []).filter(function (p) { return rs[1][p.path] === "city"; }).map(function (p) { return { name: cityName(p), slug: p.path.split("/")[0], path: p.path, url: p.url }; });
        drafts = (rs[2].items || []).filter(function (x) { return !x.rel; });
        $("#ct-rows").innerHTML = drafts.map(function (d) { return '<tr class="click" data-d="' + d.id + '"><td><b>' + esc(d.title) + '</b></td><td><span class="badge warn">Draft</span></td><td class="muted">/' + esc(d.slug) + '/</td><td class="r"><span class="btn sm">Review</span></td></tr>'; }).join("") +
          live.map(function (c) { return '<tr class="click" data-p="' + esc(c.path) + '"><td><b>' + esc(c.name) + '</b></td><td><span class="badge ok">Live</span></td><td><a href="' + esc(c.url) + '" target="_blank" onclick="event.stopPropagation()">' + esc(c.url) + '</a></td><td class="r"><span class="btn sm">' + ic("edit") + "Edit content</span></td></tr>"; }).join("");
        W.fillIcons($("#ct-rows"));
      });
    }
    load();
    $("#ct-rows").onclick = function (e) { var tr = e.target.closest("tr"); if (!tr) return; if (tr.dataset.d) location.hash = "#/citydraft/" + tr.dataset.d; else if (tr.dataset.p) location.hash = "#/fields/" + encodeURIComponent(tr.dataset.p); };
    function srcOptions() { if (!live.length) return '<option value="">No city pages loaded — press Retry on the list or check System check</option>'; var def = live.find(function (c) { return c.slug !== "lahore"; }) || live[0] || {}; return live.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === def.slug ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join(""); }
    function create(name, from, useAi, progress) {
      var to = { name: titleCase(name), slug: slugify(name) }, src = live.find(function (c) { return c.slug === from; });
      if (!src) return Promise.reject(new Error("Choose a city to copy from (the list is empty — see System check)"));
      if (!to.slug) return Promise.reject(new Error("Enter a city name"));
      if (live.some(function (c) { return c.slug === to.slug; })) return Promise.reject(new Error(to.name + " already has a page"));
      return bapi("load", { path: src.path }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        var html = cloneCity(r.html, src, to);
        if (!useAi) return html;
        progress && progress("Writing local text for " + to.name + "…");
        var d = parse(html), m = extract(d), tf = []; m.groups.forEach(function (g) { g.fields.forEach(function (f) { if (f.kind === "text" && f.md.length > 25) tf.push(f); }); });
        return api("ai_run", { task: "city", input: { city: to.name, source: src.name, texts: tf.map(function (f) { return f.md; }) } }).then(function (a) {
          if (!a.ok) { toast(to.name + ": " + a.error + " (created without AI text)", true); return html; }
          var arr; try { arr = JSON.parse(a.text.match(/\[[\s\S]*\]/)[0]); } catch (e) { arr = null; }
          if (!Array.isArray(arr) || arr.length !== tf.length) { toast(to.name + ": AI reply did not match. Created without AI text", true); return html; }
          var v = {}; tf.forEach(function (f, i) { if (typeof arr[i] === "string" && arr[i].trim()) v[f.id] = { md: arr[i].trim() }; }); apply(d, m, v); return serialize(d);
        });
      }).then(function (html) { return api("cms_save", { type: "city", title: to.name, slug: to.slug, data: { html: html, source: from } }); }).then(function (r) { if (!r.ok) throw new Error(r.error); return r.item; });
    }
    $("#ct-new").onclick = function () {
      modal('<h3>New city page</h3><form id="nc-f"><div class="g2"><label>City name<input id="nc-n" required placeholder="Gujrat"></label><label>Copy from<select id="nc-s">' + srcOptions() + '</select></label></div><p class="muted" id="nc-u">Address: /…/</p>' + (aiReady ? '<label class="check"><input type="checkbox" id="nc-ai" checked> Rewrite the text for this city with AI</label>' : '<p class="muted">Tip: add an AI key (Blog → AI settings) to localise the text automatically.</p>') + '<p class="err" id="nc-err"></p><div class="modal-actions"><button type="button" class="btn" id="nc-x">Cancel</button><button class="btn pri" id="nc-go">Create draft</button></div></form>');
      $("#nc-x").onclick = closeModal; $("#nc-n").oninput = function () { $("#nc-u").textContent = "Address: /" + (slugify(this.value) || "…") + "/"; };
      $("#nc-f").onsubmit = function (e) { e.preventDefault(); var b = $("#nc-go"); b.disabled = true; b.textContent = "Creating…"; create($("#nc-n").value, $("#nc-s").value, $("#nc-ai") && $("#nc-ai").checked, function (m) { b.textContent = m; }).then(function (it) { closeModal(); toast("Draft created: review it, then publish"); location.hash = "#/citydraft/" + it.id; }).catch(function (x) { b.disabled = false; b.textContent = "Create draft"; $("#nc-err").textContent = x.message; }); };
    };
    $("#ct-bulk").onclick = function () {
      modal('<h3>Bulk create cities</h3><p class="muted">One city per line. Each becomes a draft copied from the template' + (aiReady ? ", with local text written by AI" : "") + '. Nothing goes live until you publish it.</p>' + (aiReady ? "" : '<p class="banner" style="margin:0 0 12px">No AI key yet: drafts will only have the city name swapped. Add a key in Blog → AI settings.</p>') + '<label>Cities<textarea id="bk-l" rows="6" placeholder="Gujrat\nSargodha\nSahiwal\nRahim Yar Khan"></textarea></label><label>Copy from<select id="bk-s">' + srcOptions() + '</select></label><div id="bk-p" class="bk-prog"></div><div class="modal-actions"><button class="btn" id="bk-x">Close</button><button class="btn pri" id="bk-go">' + ic("sparkles") + "Create drafts</button></div>");
      $("#bk-x").onclick = function () { closeModal(); load(); };
      $("#bk-go").onclick = function () {
        var names = $("#bk-l").value.split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 25), from = $("#bk-s").value, b = this, P = $("#bk-p");
        if (!names.length) return; b.disabled = true;
        P.innerHTML = names.map(function (n, i) { return '<div data-i="' + i + '"><span class="dot"></span>' + esc(titleCase(n)) + ' <small class="muted">waiting</small></div>'; }).join("");
        names.reduce(function (pr, n, i) {
          return pr.then(function () {
            var row = $('[data-i="' + i + '"]', P), st = function (t, c) { row.className = c || ""; $("small", row).textContent = t; };
            st("working…", "run");
            return create(n, from, aiReady, function (m) { st(m.replace(/ for .*/, ""), "run"); }).then(function () { st("draft ready", "ok"); }).catch(function (e) { st(e.message, "bad"); });
          });
        }, Promise.resolve()).then(function () { b.disabled = false; toast("Done. Review the drafts in the list"); });
      };
    };
  };
  W.VIEWS.citydraft = function (el, parts) {
    var id = +parts[0], item, src;
    fieldEditor(el, src = {
      title: "City draft", crumb: "Cities / Draft", saveLabel: "Publish city", alwaysSave: true, savedMsg: "City published",
      banner: "Draft: not on the website yet. Review every section (especially facts like addresses and areas), then press <b>Publish city</b>.",
      extraButtons: '<button class="btn" id="cd-save">' + ic("save") + 'Save draft</button><button class="btn ghost danger" id="cd-del">Delete</button>',
      load: function () { return api("cms_get", { id: id }).then(function (r) { if (!r.ok) throw new Error(r.error); item = r.item; if (item.rel) { location.hash = "#/fields/" + encodeURIComponent(item.rel); throw new Error("Already published"); } src.title = item.title + " (draft)"; src.crumb = "Cities / " + item.title; src.url = "woodex.com.pk › " + item.slug; return item.data.html; }); },
      url: "woodex.com.pk › …",
      save: function (html) {
        return bapi("page_new", { folder: "", slug: item.slug, html: html }).then(function (r) {
          if (!r.ok) throw new Error(r.error || "Could not create the page");
          return api("cms_published", { id: id, rel: item.slug + "/index.html" });
        }).then(function (r) { if (!r.ok) throw new Error(r.error); kindsCache = null; setTimeout(function () { location.hash = "#/fields/" + encodeURIComponent(item.slug + "/index.html"); }, 400); return true; });
      },
      onReady: function (ctx) {
        $("#cd-save").onclick = function () { var r = ctx.build(); api("cms_save", { id: id, type: "city", title: item.title, slug: item.slug, data: { html: r.html, source: item.data.source } }).then(function (s) { if (!s.ok) return toast(s.error, true); item = s.item; toast("Draft saved"); }); };
        $("#cd-del").onclick = function () { if (!confirm("Delete this draft?")) return; api("cms_delete", { id: id }).then(function (r) { if (!r.ok) return toast(r.error, true); location.hash = "#/cities"; }); };
      }
    });
  };

  // ------------------------------------------------------------------ business info
  var DAYS = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  function t12(t) { var p = t.split(":"), h = +p[0] % 12 || 12; return h + ":" + p[1]; }
  function hoursVariants(b) {
    var d = b.days.split(/[–-]/), a = d[0], z = d[1] || d[0], o = t12(b.open), c = t12(b.close);
    return [a + "–" + z + " " + o + "–" + c, a + "&ndash;" + z + " " + o + "&ndash;" + c, a + "-" + z + " " + o + "-" + c, a + " to " + z + " " + o + " to " + c, DAYS[a] + " to " + DAYS[z] + ", " + o + " AM to " + c + " PM", a + "–" + z + " " + o + " AM – " + c + " PM", a.slice(0, 2) + "-" + z.slice(0, 2) + " " + b.open + "-" + b.close];
  }
  var digits = function (s) { return String(s).replace(/\D/g, ""); };
  function bizPairs(o, n) {
    var P = [], add = function (a, b) { if (a && b && a !== b) P.push([a, b]); };
    var WA = "\u0001WA\u0001";
    if (digits(o.wa) !== digits(n.wa)) { P.push(["wa.me/" + digits(o.wa), "wa.me/" + WA]); P.push(["phone=" + digits(o.wa), "phone=" + WA]); }
    add(o.phone1, n.phone1); add(digits(o.phone1), digits(n.phone1)); add(o.phone2, n.phone2); add(digits(o.phone2), digits(n.phone2));
    if (digits(o.wa) !== digits(n.wa)) P.push([WA, digits(n.wa)]);
    add(o.email, n.email); add(o.addr1, n.addr1); add(o.addr2, n.addr2);
    var ov = hoursVariants(o), nv = hoursVariants(n); ov.forEach(function (v, i) { add(v, nv[i]); });
    return P;
  }
  function applyPairs(s, P) { P.forEach(function (p) { s = s.split(p[0]).join(p[1]); }); return s; }
  var SOC = [["facebook", "Facebook", "M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v7h4v-7h3l1-4h-4V8z"], ["instagram", "Instagram", "M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7 M17 6.8v.01"], ["linkedin", "LinkedIn", "M4 9h4v11H4z M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M10 9h4v2a4 4 0 0 1 7 3v6h-4v-6a2 2 0 0 0-3 0v6h-4z"], ["youtube", "YouTube", "M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z M10 9l5 3-5 3z"], ["tiktok", "TikTok", "M14 3v11a3.5 3.5 0 1 1-3.5-3.5 M14 3a5 5 0 0 0 5 5"], ["pinterest", "Pinterest", "M12 3a9 9 0 0 0-3.3 17.4 M12 7a5 5 0 0 1 2 9.6c-1.5.6-3-.3-3-1.6 M11 11l-3 10"], ["x", "X (Twitter)", "M4 4l16 16 M20 4L4 20"]];
  function socChanged(o, n) { return SOC.some(function (k) { return (o[k[0]] || "") !== (n[k[0]] || ""); }); }
  function socHtml(n) { return SOC.filter(function (k) { return n[k[0]]; }).map(function (k) { return '<a data-soc="' + k[0] + '" href="' + esc(n[k[0]]) + '" target="_blank" rel="noopener" aria-label="' + k[1] + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + k[2] + '"/></svg></a>'; }).join(""); }
  function applySoc(h, n) { return h.replace(/(<div class="footer-social"[^>]*>)([\s\S]*?)(<\/div>)/, function (m, a, b, c) { return a + b.replace(/<a data-soc="[^"]*"[\s\S]*?<\/a>/g, "") + socHtml(n) + c; }); }
  W.VIEWS.business = function (el) {
    el.innerHTML = head("Business info", "Business info", "") + '<p class="muted">Loading…</p>';
    api("cms_biz_get").then(function (r) {
      if (!r.ok) { el.innerHTML = '<div class="card card-b">' + esc(r.error) + "</div>"; return; }
      var b = r.biz, applied = r.applied, admin = W.can ? W.can("owner,admin") : true;
      var F = [["email", "Email"], ["phone1", "Main phone"], ["phone2", "Second phone"], ["wa", "WhatsApp number"], ["addr1", "Address line 1"], ["addr2", "Address line 2"], ["city", "City"], ["country", "Country"]];
      el.innerHTML = head("Business info", "Business info", "") +
        '<div class="banner">' + ic("info") + "<span>These details appear on almost every page (about 85 pages, 1,500+ places). Change them here and press <b>Update website</b>: every page, the WhatsApp button and the search-engine data are updated together.</span></div>" +
        '<div class="tabs" id="bz-tabs"><button class="on" data-t="contact">Contact & hours</button><button data-t="brand">Brand & logo</button><button data-t="social">Social profiles</button></div><div data-bzp="brand" hidden></div>' +
        '<div class="qe" data-bzp="form"><div class="qe-main"><div class="card card-b"><form id="bz-f"><div data-bzp="social" hidden><h4 class="sub-h" style="margin-top:0">Social profiles</h4><p class="muted">Paste full links (https://…). Filled profiles show as icons in the footer of every page after <b>Update website</b>. Leave empty to hide.</p><div class="g2">' + SOC.map(function (k) { return '<label>' + k[1] + '<input id="bz-' + k[0] + '" type="url" placeholder="https://" value="' + esc(b[k[0]] || "") + '"' + (admin ? "" : " disabled") + "></label>"; }).join("") + '</div></div><div data-bzp="contact"><div class="g2">' + F.map(function (f) { return '<label>' + f[1] + '<input id="bz-' + f[0] + '" value="' + esc(b[f[0]]) + '"' + (admin ? "" : " disabled") + "></label>"; }).join("") + "</div>" +
        '<h4 class="sub-h">Opening hours</h4><div class="g3"><label>Days<select id="bz-days">' + ["Mon–Sat", "Mon–Fri", "Mon–Sun"].map(function (d) { return "<option" + (b.days === d ? " selected" : "") + ">" + d + "</option>"; }).join("") + '</select></label><label>Opens<input type="time" id="bz-open" value="' + esc(b.open) + '"></label><label>Closes<input type="time" id="bz-close" value="' + esc(b.close) + '"></label></div>' +
        '</div><p class="err" id="bz-err"></p>' + (admin ? '<div class="modal-actions" style="justify-content:flex-start"><button type="button" class="btn" id="bz-chk">' + ic("search") + 'Check changes</button><button class="btn pri" id="bz-go">' + ic("send") + "Update website</button></div>" : "") + '</form></div><div class="card" id="bz-res" hidden></div></div>' +
        '<div class="qe-side"><div class="card card-b"><h4 class="side-h">How it shows</h4><div class="bz-prev" id="bz-prev"></div></div></div></div>';
      W.fillIcons(el);
      var brandDone = false;
      $("#bz-tabs").onclick = function (e) { var t = e.target.closest("button"); if (!t) return; [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === t); }); var k = t.getAttribute("data-t");
        el.querySelector('[data-bzp="brand"]').hidden = k !== "brand"; el.querySelector('[data-bzp="form"]').hidden = k === "brand"; el.querySelector('[data-bzp="contact"]').hidden = k !== "contact"; el.querySelector('[data-bzp="social"]').hidden = k !== "social";
        if (k === "brand" && !brandDone && W.VIEWS.settings) { brandDone = true; var d = el.querySelector('[data-bzp="brand"]'); W.VIEWS.settings(d, ["general"]); var hide = function () { var x = d.querySelector(".ph"); if (x) x.hidden = true; }; hide(); setTimeout(hide, 300); } };
      function cur() { var o = {}; F.forEach(function (f) { o[f[0]] = $("#bz-" + f[0]).value.trim(); }); SOC.forEach(function (k) { o[k[0]] = $("#bz-" + k[0]).value.trim(); }); o.days = $("#bz-days").value; o.open = $("#bz-open").value; o.close = $("#bz-close").value; return o; }
      function prev() { var o = cur(); $("#bz-prev").innerHTML = "<address>" + esc(o.addr1) + "<br>" + esc(o.addr2) + "<br>" + esc(o.city) + ", " + esc(o.country) + "</address><p><a>" + esc(o.phone1) + "</a><br><a>" + esc(o.phone2) + "</a><br><a>" + esc(o.email) + "</a></p><p><b>" + esc(hoursVariants(o)[0]) + "</b> · Sunday closed</p><p class='muted'>WhatsApp: wa.me/" + esc(digits(o.wa)) + "</p>"; }
      prev(); el.addEventListener("input", prev); el.addEventListener("change", prev);
      if (!admin) return;
      function scan(write) {
        var P = bizPairs(applied, cur()), S = socChanged(applied, cur()), NB = cur(), res = $("#bz-res");
        if (!P.length && !S) { res.hidden = false; res.innerHTML = '<div class="card-b">Nothing to change: the website already uses these details.</div>'; return Promise.resolve(); }
        res.hidden = false; res.innerHTML = '<div class="card-b"><b>' + (write ? "Updating" : "Checking") + ' pages…</b> <span id="bz-pn">0</span></div>';
        return bapi("pages").then(function (pr) {
          var pages = pr.pages || [], hits = [], i = 0, fails = [];
          return pages.reduce(function (p, pg) {
            return p.then(function () {
              return bapi("load", { path: pg.path }).then(function (lr) {
                $("#bz-pn").textContent = ++i + " / " + pages.length; if (!lr.ok) return;
                var h = applyPairs(lr.html, P); if (S) h = applySoc(h, NB); if (h === lr.html) return;
                var n = P.reduce(function (a, q) { return a + (lr.html.split(q[0]).length - 1); }, 0) || 1; hits.push([pg.url, n]);
                if (write) return bapi("save", { path: pg.path, html: h, mtime: lr.mtime }).then(function (s) { if (!s.ok) fails.push(pg.url); });
              });
            });
          }, Promise.resolve()).then(function () {
            var tot = hits.reduce(function (a, h) { return a + h[1]; }, 0);
            var body = '<div class="card-h"><h3>' + (write ? "Website updated" : "Changes found") + '</h3><span class="badge ' + (write ? "ok" : "warn") + '">' + tot + " places · " + hits.length + " pages</span></div><div class=\"card-b\"><ul class=\"bz-pairs\">" + P.filter(function (p) { return p[0].indexOf("\u0001") < 0 && p[1].indexOf("\u0001") < 0; }).map(function (p) { return "<li><s>" + esc(p[0]) + "</s> → <b>" + esc(p[1]) + "</b></li>"; }).join("") + "</ul>" + (fails.length ? '<p class="err">Failed: ' + fails.map(esc).join(", ") + "</p>" : "") + "</div>";
            if (!write) { res.innerHTML = body; return; }
            return api("cms_biz_assets", { pairs: P }).then(function (ar) {
              return api("cms_biz_save", { biz: cur(), applied: !fails.length }).then(function (sr) { if (sr.ok) { applied = sr.applied; b = sr.biz; } res.innerHTML = body.replace("</div>", "") + '<p class="muted">WhatsApp button & scripts: ' + (ar.ok ? ar.files + " file(s) updated" : esc(ar.error)) + "</p></div>"; toast("Website updated: " + tot + " places"); });
            });
          });
        });
      }
      $("#bz-chk").onclick = function () { var bt = this; bt.disabled = true; api("cms_biz_save", { biz: cur() }).then(function (sr) { if (!sr.ok) { $("#bz-err").textContent = sr.error; bt.disabled = false; return; } $("#bz-err").textContent = ""; scan(false).then(function () { bt.disabled = false; }); }); };
      $("#bz-f").onsubmit = function (e) { e.preventDefault(); var bt = $("#bz-go"); if (!confirm("Update every page of the website with these details?")) return; bt.disabled = true; api("cms_biz_save", { biz: cur() }).then(function (sr) { if (!sr.ok) { $("#bz-err").textContent = sr.error; bt.disabled = false; return; } $("#bz-err").textContent = ""; scan(true).then(function () { bt.disabled = false; }); }); };
    });
  };
  W.fields = { extract: extract, apply: apply, serialize: serialize, cloneCity: cloneCity, bizPairs: bizPairs, applyPairs: applyPairs, hoursVariants: hoursVariants };
})();
