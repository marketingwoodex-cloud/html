/* Woodex Admin — P17 C4–C6: page templates for articles, portfolio studies and city pages.
   Templates set the layout (hero style, sections on/off, order, table of contents). Page text is never changed.
   Apply to new and existing pages with a preview first; every page is backed up by the builder on save. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, bapi = W.bapi, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast, head = W.head;
  var A = function (s) { return esc(s == null ? "" : String(s)); };
  var TYPES = { post: ["Article", "Articles", "Blog & insights"], study: ["Portfolio", "Portfolio studies", "Portfolio"], city: ["City", "City pages", "City pages"] };
  var SEC = { body: "Main content (headings, text, images)", summary: "“The short version” summary", faqs: "FAQs", quote: "Pull quote", related: "Related articles / studies" };
  var HERO = { image: ["Full photo", "Big photo behind the title (current look)"], navy: ["Navy, no photo", "Clean navy title band — fastest"], media: ["Navy + photo below", "Title on navy, wide photo overlapping below"] };
  var FIXED = /^(cta)$/;

  // ------------------------------------------------------------------ cache used by the content renderer
  var cache = null, wait = null;
  W.tplReady = function (force) {
    if (cache && !force) return Promise.resolve(cache);
    if (wait && !force) return wait;
    wait = Promise.all([api("cms_tpl_list", {}), api("cms_list", { type: "faq" })]).then(function (rs) { wait = null; if (!(rs[0] && rs[0].ok)) return []; /* not signed in yet: don't cache */ cache = rs[0].tpls || []; FAQG = {}; ((rs[1] && rs[1].items) || []).forEach(function (g) { FAQG[g.id] = g; }); wait = null; return cache; }, function () { wait = null; return []; });
    return wait;
  };
  var FAQG = {};
  /** P17 C7: questions of a linked FAQ group (null when the group is gone) */
  W.faqGroup = function (id) { return FAQG[+id] || null; };
  W.faqItems = function (id) { var g = FAQG[+id]; return g ? ((g.data || {}).items || []).filter(function (f) { return f.q && f.a; }).map(function (f) { return { q: f.q, a: f.a }; }) : null; };
  var override = null; // used by the live preview
  W.tplFor = function (type, it) {
    if (override && override.type === type) return override;
    var L = cache || [], id = +((it && it.data && it.data.tpl) || 0);
    return (id && L.filter(function (t) { return t.id === id && t.type === type; })[0]) || L.filter(function (t) { return t.type === type && t.default; })[0] || null;
  };
  W.tplOptions = function (type, cur) {
    var L = (cache || []).filter(function (t) { return t.type === type; }), def = L.filter(function (t) { return t.default; })[0];
    return '<option value="">' + (def ? "Default — " + A(def.name) : "Default layout") + "</option>" + L.map(function (t) { return '<option value="' + t.id + '"' + (+cur === t.id ? " selected" : "") + ">" + A(t.name) + "</option>"; }).join("");
  };

  // ------------------------------------------------------------------ helpers
  var cityName = function (title, slug) { var m = /in ([^|<]+?)\s*(\||$)/.exec(title || ""); return m ? m[1].trim() : slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  function cityPages() {
    return Promise.all([bapi("pages"), api("cms_page_kinds")]).then(function (r) {
      var k = (r[1] && r[1].kinds) || {};
      return ((r[0] && r[0].pages) || []).filter(function (p) { return k[p.path] === "city"; }).map(function (p) { var slug = p.path.split("/")[0]; return { slug: slug, path: p.path, url: p.url, name: cityName(p.title, slug) }; });
    });
  }
  function citySections(html) {
    var d = new DOMParser().parseFromString(html, "text/html"), main = d.querySelector("main"); if (!main) return [];
    return Array.prototype.slice.call(main.querySelectorAll(":scope > section[id]")).filter(function (s) { return !FIXED.test(s.id); }).map(function (s) {
      var h = s.querySelector("h2,h1"); return { id: s.id, label: (h ? h.textContent.replace(/\s+/g, " ").trim() : s.id).slice(0, 60) };
    });
  }
  /** Reorder / hide / add sections on one city page. Text already on the page is kept. */
  function applyCity(html, tpl, srcHtml, src, to) {
    var d = new DOMParser().parseFromString(html, "text/html"), main = d.querySelector("main"); if (!main) throw new Error("Page has no main content");
    var sd = srcHtml ? new DOMParser().parseFromString(srcHtml, "text/html") : null;
    var anchor = main.querySelector(":scope > section#cta") || null;
    var mine = {}; Array.prototype.forEach.call(main.querySelectorAll(":scope > section[id]"), function (s) { mine[s.id] = s; });
    var placed = [];
    tpl.order.forEach(function (o) {
      var s = mine[o.id];
      if (!o.on) { if (s) s.remove(); return; }
      if (!s && sd) { // copy the missing section from the template city, swapping the city name
        var from = sd.querySelector("main > section#" + CSS.escape(o.id)); if (!from) return;
        var wrapped = W.fields && W.fields.cloneCity ? W.fields.cloneCity("<head></head><main>" + from.outerHTML + "</main>", src, to) : from.outerHTML;
        var t = d.createElement("div"); t.innerHTML = wrapped.slice(wrapped.indexOf("<main>") + 6, wrapped.lastIndexOf("</main>")); s = t.firstElementChild;
      }
      if (s) placed.push(s);
    });
    // ordered sections first, then any section the template doesn't mention (never lose content), all before the contact block
    var rest = Array.prototype.slice.call(main.querySelectorAll(":scope > section[id]")).filter(function (s) { return !FIXED.test(s.id) && placed.indexOf(s) < 0 && !s.classList.contains("ct-hero"); });
    placed.concat(rest).forEach(function (s) { if (anchor) main.insertBefore(s, anchor); else main.appendChild(s); });
    var out = "<!DOCTYPE html>\n" + d.documentElement.outerHTML;
    var ms = html.indexOf("<main"), me = html.indexOf("</main>") + 7, nm = out.indexOf("<main"), nme = out.indexOf("</main>") + 7;
    return html.slice(0, ms) + out.slice(nm, nme) + html.slice(me); // only <main> is replaced; head/header/footer stay byte-identical
  }

  // ------------------------------------------------------------------ view
  W.VIEWS.pagetpl = function (el, parts) {
    var tab = (parts && TYPES[parts[0]]) ? parts[0] : (W.S.tplTab || "post"), L = [], items = [];
    el.innerHTML = head("Page templates", "Templates", '<button class="btn" id="tp-lib">' + ic("blocks") + 'Template library</button><button class="btn" id="tp-imp">' + ic("upload") + 'Import</button><button class="btn pri" id="tp-new">' + ic("plus") + "New template</button>") +
      '<div class="banner">' + ic("info") + "<span>A template controls the <b>layout</b> — hero style, which sections show and their order. Your text and photos stay as they are. Apply a template to new <b>and</b> existing pages; each page is previewed and backed up first.</span></div>" +
      '<div class="seg" id="tp-tabs" style="margin:6px 0 16px">' + Object.keys(TYPES).map(function (k) { return '<button data-t="' + k + '">' + TYPES[k][1] + "</button>"; }).join("") + "</div><div id=\"tp-list\"><div class='empty'>Loading…</div></div>";
    W.fillIcons && W.fillIcons(el);
    function load() {
      W.S.tplTab = tab; $$("#tp-tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === tab); });
      Promise.all([W.tplReady(true), tab === "city" ? cityPages() : api("cms_list", { type: tab }).then(function (r) { return (r.items || []); })]).then(function (r) {
        L = r[0].filter(function (t) { return t.type === tab; }); items = r[1]; draw();
      });
    }
    function used(t) { return tab === "city" ? 0 : items.filter(function (x) { return +(x.data && x.data.tpl) === t.id || (!x.data || !x.data.tpl) && t.default; }).length; }
    function draw() {
      var h = L.length ? "<div class='tp-grid'>" + L.map(function (t) {
        var secs = tab === "city" ? t.order.filter(function (o) { return o.on; }).map(function (o) { return o.label || o.id; }) : t.sections.filter(function (s) { return s.on; }).map(function (s) { return s.k; });
        return "<div class='card tp-card'><div class='tp-thumb tp-" + (t.hero || "city") + "'>" + thumb(t) + "</div><div class='card-b'><div class='tp-h'><b>" + A(t.name) + "</b>" + (t.default ? "<span class='badge gold'>Default</span>" : "") + "</div>" +
          "<p class='muted'>" + A(t.desc || (tab === "city" ? "Based on " + (t.source || "a city") : HERO[t.hero][0] + (t.toc ? " · contents list" : ""))) + "</p><p class='tp-secs'>" + secs.map(A).join(" · ") + "</p>" +
          (tab !== "city" ? "<small class='muted'>Used by " + used(t) + " " + TYPES[tab][1].toLowerCase() + "</small>" : "") +
          "<div class='tp-acts'><button class='btn sm pri' data-ap='" + t.id + "'>Apply to pages</button><button class='btn sm' data-ed='" + t.id + "'>Edit</button><button class='btn sm' data-dup='" + t.id + "'>Duplicate</button><button class='btn sm' data-ex='" + t.id + "'>Export</button><button class='btn sm' data-del='" + t.id + "' title='Delete'>" + ic("trash") + "</button></div></div></div>";
      }).join("") + "</div>" : "<div class='empty card' style='padding:30px'><p>No " + TYPES[tab][0].toLowerCase() + " templates yet.</p><button class='btn pri' id='tp-start'>" + ic("sparkles") + "Create starter templates</button></div>";
      $("#tp-list").innerHTML = h; W.fillIcons && W.fillIcons(el);
      var st = $("#tp-start"); if (st) st.onclick = starters;
    }
    function thumb(t) {
      if (tab === "city") return "<i class='tb-hero'></i>" + t.order.filter(function (o) { return o.on; }).slice(0, 5).map(function () { return "<i class='tb-sec'></i>"; }).join("");
      return "<i class='tb-hero'></i>" + (t.hero === "media" ? "<i class='tb-media'></i>" : "") + (t.toc ? "<i class='tb-toc'></i>" : "") + t.sections.filter(function (s) { return s.on; }).map(function (s) { return "<i class='tb-" + s.k + "'></i>"; }).join("");
    }
    function starters() {
      var S = tab === "city" ? null : [
        { name: "Magazine (current look)", desc: "Full-width photo, all sections — the current design.", hero: "image", toc: false, default: true, sections: ["body", "summary", "faqs", "quote", "related"] },
        { name: tab === "post" ? "Guide with contents" : "Story with photo", desc: tab === "post" ? "Navy title, contents list, summary first — best for long guides." : "Navy title with a wide photo below; quote before the story.", hero: tab === "post" ? "navy" : "media", toc: tab === "post", sections: tab === "post" ? ["summary", "body", "faqs", "related", "quote"] : ["quote", "body", "summary", "faqs", "related"] },
        { name: "Minimal", desc: "Title and text only — fastest page.", hero: "navy", toc: false, sections: ["body", "related"], off: ["summary", "faqs", "quote"] }
      ];
      if (S) return Promise.all(S.map(function (s) {
        var secs = s.sections.map(function (k) { return { k: k, on: true }; }).concat((s.off || []).map(function (k) { return { k: k, on: false }; }));
        return api("cms_tpl_save", { tpl: { type: tab, name: s.name, desc: s.desc, hero: s.hero, toc: s.toc, default: !!s.default, sections: secs } });
      })).then(function () { toast("3 starter templates added"); load(); });
      cityPages().then(function (cs) {
        var src = cs.filter(function (c) { return c.slug === "lahore"; })[0] || cs[0]; if (!src) return toast("No city pages found", true);
        bapi("load", { path: src.path }).then(function (r) {
          var secs = citySections(r.html); if (!secs.length) return toast("No sections found on " + src.name, true);
          var all = secs.map(function (s) { return { id: s.id, label: s.label, on: true }; });
          var short = secs.map(function (s) { return { id: s.id, label: s.label, on: !/note|process/.test(s.id) }; });
          Promise.all([api("cms_tpl_save", { tpl: { type: "city", name: "Full city page", desc: "All sections, as on " + src.name + ".", source: src.slug, order: all, default: true } }),
            api("cms_tpl_save", { tpl: { type: "city", name: "Short city page", desc: "Services, FAQs and nearby areas only.", source: src.slug, order: short } })]).then(function () { toast("2 starter city templates added"); load(); });
        });
      });
    }

    // ---------------------------------------------------------------- editor with live preview
    function editor(t) {
      t = JSON.parse(JSON.stringify(t || (tab === "city" ? { type: "city", name: "", order: [], source: "" } : { type: tab, name: "", hero: "image", toc: false, meta: true, facts: true, sections: Object.keys(SEC).map(function (k) { return { k: k, on: true }; }) })));
      W.modal("<h2>" + (t.id ? "Edit template" : "New " + TYPES[tab][0].toLowerCase() + " template") + "</h2><div class='tp-ed'><div class='tp-form' id='tp-form'></div><div class='tp-prev'><div class='tp-pbar'><b>Preview</b><select id='tp-sample'></select></div><div class='tp-fbox'><iframe id='tp-frame' title='Preview'></iframe></div></div></div>" +
        "<div class='bk-acts'><button class='btn pri' id='tp-save'>" + ic("check") + "Save template</button><button class='btn' data-close>Cancel</button></div>", "wide tp-modal");
      $("#modal-card [data-close]").onclick = function () { $("#modal").hidden = true; override = null; };
      var form = $("#tp-form"), srcHtml = "", cities = [];
      function sampleList() {
        var sel = $("#tp-sample");
        if (tab === "city") return cityPages().then(function (cs) { cities = cs; sel.innerHTML = cs.map(function (c) { return "<option value='" + A(c.slug) + "'>" + A(c.name) + "</option>"; }).join(""); if (!t.source && cs[0]) t.source = (cs.filter(function (c) { return c.slug === "lahore"; })[0] || cs[0]).slug; });
        var pub = items.filter(function (x) { return x.rel; }); sel.innerHTML = (pub.length ? pub : items).map(function (x) { return "<option value='" + x.id + "'>" + A(x.title) + "</option>"; }).join("") || "<option value=''>No items yet</option>";
        return Promise.resolve();
      }
      function drawForm() {
        var h = "<label>Name<input id='tf-n' value='" + A(t.name) + "' placeholder='e.g. Long guide'></label><label>Short description<input id='tf-d' value='" + A(t.desc) + "'></label>" +
          "<label class='check'><input type='checkbox' id='tf-def'" + (t.default ? " checked" : "") + "> Use as the <b>default</b> for new " + TYPES[tab][1].toLowerCase() + "</label>";
        if (tab === "city") {
          h += "<label>Template city <small>(sections come from this page)</small><select id='tf-src'>" + cities.map(function (c) { return "<option value='" + A(c.slug) + "'" + (c.slug === t.source ? " selected" : "") + ">" + A(c.name) + "</option>"; }).join("") + "</select></label>";
          h += "<h4 class='bk-h4'>Sections — tick to show, arrows to reorder</h4><div class='tp-secl'>" + t.order.map(function (o, i) { return row(i, o.label || o.id, o.on, o.id); }).join("") + "</div><p class='muted' style='font-size:12px'>Hero, the contact block and the trust strip always stay. Sections missing on a city are copied from the template city with the name swapped.</p>";
        } else {
          h += "<h4 class='bk-h4'>Hero style</h4><div class='tp-heros'>" + Object.keys(HERO).map(function (k) { return "<label class='tp-hero" + (t.hero === k ? " on" : "") + "'><input type='radio' name='tf-h' value='" + k + "'" + (t.hero === k ? " checked" : "") + "><i class='tp-hi tp-hi-" + k + "'></i><b>" + HERO[k][0] + "</b><small>" + HERO[k][1] + "</small></label>"; }).join("") + "</div>" +
            "<label class='check'><input type='checkbox' id='tf-toc'" + (t.toc ? " checked" : "") + "> Show an “On this page” contents list <small class='muted'>(3+ headings)</small></label>" +
            "<label class='check'><input type='checkbox' id='tf-meta'" + (t.meta !== false ? " checked" : "") + "> Show the details strip under the title</label>" +
            (tab === "study" ? "<label class='check'><input type='checkbox' id='tf-facts'" + (t.facts !== false ? " checked" : "") + "> Show the study facts sidebar</label>" : "") +
            "<h4 class='bk-h4'>Sections — tick to show, arrows to reorder</h4><div class='tp-secl'>" + t.sections.map(function (s, i) { return row(i, SEC[s.k], s.on, s.k); }).join("") + "</div>";
        }
        form.innerHTML = h; W.fillIcons && W.fillIcons(form);
      }
      function row(i, label, on, key) { return "<div class='tp-sr'><input type='checkbox' data-on='" + i + "'" + (on ? " checked" : "") + "><span>" + A(label) + (tab === "city" ? " <small class='muted'>#" + A(key) + "</small>" : "") + "</span><button class='btn sm' data-mv='" + i + "|-1' aria-label='Move up'>↑</button><button class='btn sm' data-mv='" + i + "|1' aria-label='Move down'>↓</button></div>"; }
      function read() {
        t.name = $("#tf-n").value.trim(); t.desc = $("#tf-d").value.trim(); t.default = $("#tf-def").checked;
        if (tab === "city") { t.source = $("#tf-src").value; $$("#tp-form [data-on]").forEach(function (c) { t.order[+c.dataset.on].on = c.checked; }); }
        else { var hr = $("#tp-form [name=tf-h]:checked"); t.hero = hr ? hr.value : "image"; t.toc = $("#tf-toc").checked; t.meta = $("#tf-meta").checked; if ($("#tf-facts")) t.facts = $("#tf-facts").checked; $$("#tp-form [data-on]").forEach(function (c) { t.sections[+c.dataset.on].on = c.checked; }); }
      }
      var ptimer = 0;
      function preview() {
        clearTimeout(ptimer); ptimer = setTimeout(function () {
          var fr = $("#tp-frame"); if (!fr) return; var put = function (html) { fr.srcdoc = html.replace(/<head>/i, '<head><base href="/" target="_blank">'); };
          if (tab === "city") {
            var c = cities.filter(function (x) { return x.slug === $("#tp-sample").value; })[0], src = cities.filter(function (x) { return x.slug === t.source; })[0]; if (!c || !src) return;
            Promise.all([bapi("load", { path: c.path }), src.slug === c.slug ? Promise.resolve(null) : bapi("load", { path: src.path })]).then(function (r) {
              try { put(applyCity(r[0].html, t, r[1] ? r[1].html : r[0].html, src, c)); } catch (e) { toast(e.message, true); }
            });
            return;
          }
          var id = +$("#tp-sample").value, it = items.filter(function (x) { return x.id === id; })[0]; if (!it || !W.contentRender) return;
          api("cms_get", { id: id }).then(function (g) {
            var full = g.item || it, T = W.contentT[tab], rel = full.rel || T.shell;
            bapi("load", { path: rel }).then(function (r) { override = Object.assign({}, t, { type: tab }); try { put(W.contentRender(tab, full, r.html, items)); } catch (e) { toast(e.message, true); } override = null; });
          });
        }, 250);
      }
      function srcChanged() {
        var src = cities.filter(function (c) { return c.slug === t.source; })[0]; if (!src) return Promise.resolve();
        return bapi("load", { path: src.path }).then(function (r) {
          srcHtml = r.html; var secs = citySections(r.html), have = {}; t.order.forEach(function (o) { have[o.id] = o; });
          var merged = t.order.filter(function (o) { return secs.some(function (s) { return s.id === o.id; }); }).map(function (o) { var s = secs.filter(function (x) { return x.id === o.id; })[0]; return { id: o.id, on: o.on, label: s.label }; });
          secs.forEach(function (s) { if (!have[s.id]) merged.push({ id: s.id, label: s.label, on: true }); }); t.order = merged;
        });
      }
      form.addEventListener("click", function (e) {
        var b = e.target.closest("[data-mv]"); if (!b) return; read(); var q = b.dataset.mv.split("|"), i = +q[0], j = i + +q[1], arr = tab === "city" ? t.order : t.sections;
        if (j < 0 || j >= arr.length) return; arr.splice(j, 0, arr.splice(i, 1)[0]); drawForm(); preview();
      });
      form.addEventListener("change", function (e) { read(); if (e.target.id === "tf-src") return srcChanged().then(function () { drawForm(); preview(); }); if (e.target.name === "tf-h") drawForm(); preview(); });
      $("#tp-sample").onchange = preview;
      $("#tp-save").onclick = function () {
        read(); if (!t.name) return toast("Give the template a name", true);
        api("cms_tpl_save", { tpl: t }).then(function (r) { if (!r.ok) return toast(r.error, true); $("#modal").hidden = true; toast("Template saved"); load(); });
      };
      sampleList().then(function () { return tab === "city" ? srcChanged() : null; }).then(function () { drawForm(); preview(); });
    }

    // ---------------------------------------------------------------- apply to pages
    function applyTo(t) {
      var list = tab === "city" ? null : items;
      var open = function (rows) {
        W.modal("<h2>Apply “" + A(t.name) + "”</h2><p class='muted'>Choose pages. Each page is <b>backed up</b> before it is changed and keeps its own text. Drafts are only switched to this template (no page is written).</p>" +
          "<label class='check'><input type='checkbox' id='ta-all'> Select all</label><div class='tp-apl'>" + rows.map(function (x, i) {
            return "<label class='tp-ar'><input type='checkbox' data-i='" + i + "'><span><b>" + A(x.name) + "</b><small class='muted'>" + A(x.note) + "</small></span>" + (x.live ? "<span class='badge ok'>Live</span>" : "<span class='badge'>Draft</span>") + "<button class='btn sm' data-pv='" + i + "'>Preview</button></label>";
          }).join("") + "</div><div class='tp-prog' id='ta-prog' hidden></div><div class='bk-acts'><button class='btn pri' id='ta-go'>" + ic("check") + "Apply to selected</button><button class='btn' data-close>Close</button></div>", "wide");
        $("#modal-card [data-close]").onclick = function () { $("#modal").hidden = true; };
        $("#ta-all").onchange = function () { $$("#modal-card [data-i]").forEach(function (c) { c.checked = $("#ta-all").checked; }); };
        $$("#modal-card [data-pv]").forEach(function (b) { b.onclick = function (e) { e.preventDefault(); render(rows[+b.dataset.pv]).then(function (h) { var w = window.open("", "_blank"); if (w) { w.document.write(h.replace(/<head>/i, '<head><base href="/">')); w.document.close(); } else toast("Allow pop-ups to preview", true); }).catch(function (er) { toast(er.message, true); }); }; });
        $("#ta-go").onclick = function () {
          var sel = $$("#modal-card [data-i]").filter(function (c) { return c.checked; }).map(function (c) { return rows[+c.dataset.i]; }); if (!sel.length) return toast("Choose at least one page", true);
          if (!confirm("Apply this template to " + sel.length + " page(s)? Each live page is backed up first.")) return;
          var pr = $("#ta-prog"), n = 0, bad = 0; pr.hidden = false; $("#ta-go").disabled = true;
          sel.reduce(function (p, x) { return p.then(function () { pr.textContent = "Updating " + (++n) + " of " + sel.length + ": " + x.name + "…"; return x.run().catch(function (er) { bad++; toast(x.name + ": " + er.message, true); }); }); }, Promise.resolve())
            .then(function () { pr.textContent = "Done — " + (sel.length - bad) + " updated" + (bad ? ", " + bad + " failed" : "") + "."; $("#ta-go").disabled = false; toast("Template applied"); load(); });
        };
      };
      var render;
      if (tab === "city") {
        cityPages().then(function (cs) {
          var src = cs.filter(function (c) { return c.slug === t.source; })[0] || cs[0]; if (!src) return toast("No city pages", true);
          bapi("load", { path: src.path }).then(function (sr) {
            render = function (x) { return bapi("load", { path: x.c.path }).then(function (r) { return applyCity(r.html, t, sr.html, src, x.c); }); };
            open(cs.map(function (c) { return { name: c.name, note: c.url, live: true, c: c, run: function () { return bapi("load", { path: c.path }).then(function (r) { var h = applyCity(r.html, t, sr.html, src, c); if (h === r.html) return; return bapi("save", { path: c.path, html: h, mtime: r.mtime }).then(function (s) { if (!s.ok) throw new Error(s.error || "Save failed"); }); }); } }; }));
          });
        });
        return;
      }
      render = function (x) { return api("cms_get", { id: x.it.id }).then(function (g) { var full = g.item; full.data = Object.assign({}, full.data, { tpl: t.id }); return bapi("load", { path: full.rel || W.contentT[tab].shell }).then(function (r) { override = Object.assign({}, t, { type: tab }); try { return W.contentRender(tab, full, r.html, list); } finally { override = null; } }); }); };
      open(list.map(function (it) {
        return { name: it.title, note: "/" + W.contentT[tab].folder + "/" + it.slug + "/", live: !!it.rel, it: it, run: function () {
          return api("cms_get", { id: it.id }).then(function (g) {
            var full = g.item; full.data = Object.assign({}, full.data, { tpl: t.id });
            return api("cms_save", { id: full.id, type: tab, title: full.title, slug: full.slug, data: full.data, seo: full.seo }).then(function (s) {
              if (!s.ok) throw new Error(s.error || "Save failed"); if (!full.rel) return;
              return bapi("load", { path: full.rel }).then(function (r) { override = Object.assign({}, t, { type: tab }); var h; try { h = W.contentRender(tab, full, r.html, list); } finally { override = null; } return bapi("save", { path: full.rel, html: h, mtime: r.mtime }); }).then(function (x) { if (x && !x.ok) throw new Error(x.error || "Page save failed"); });
            });
          });
        } };
      }));
    }

    // ---------------------------------------------------------------- import / export
    function exportT(t) {
      var o = JSON.parse(JSON.stringify(t)); delete o.id; delete o.by; delete o.updated_at; o.default = false;
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ woodexPageTemplate: 1, template: o }, null, 2)], { type: "application/json" }));
      a.download = "woodex-" + t.type + "-template-" + t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json"; document.body.appendChild(a); a.click(); a.remove();
    }
    $("#tp-imp").onclick = function () {
      var f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
      f.onchange = function () { var file = f.files[0]; if (!file || file.size > 200000) return toast("Choose a template file (max 200 KB)", true);
        file.text().then(function (x) { var j; try { j = JSON.parse(x); } catch (e) { return toast("Not a valid file", true); }
          var t = j && j.woodexPageTemplate ? j.template : null; if (!t || !TYPES[t.type]) return toast("This is not a Woodex page template", true);
          delete t.id; t.name = t.name + " (imported)";
          api("cms_tpl_save", { tpl: t }).then(function (r) { if (!r.ok) return toast(r.error, true); tab = t.type; toast("Template imported"); load(); });
        }); };
      f.click();
    };
    $("#tp-new").onclick = function () { editor(null); };
    /* P19 F9: template library — ready-made layouts, add with one click */
    var LIB = {
      post: [["Long guide", "Big photo, contents list, every section. For 1,500+ word guides.", "image", true, ["summary", "body", "faqs", "quote", "related"], []],
        ["Cost guide", "Navy title, contents, summary first, FAQs. For “price of…” articles.", "navy", true, ["summary", "body", "faqs", "related"], ["quote"]],
        ["Quick tip", "Navy title, text and related only. Short posts, fastest load.", "navy", false, ["body", "related"], ["summary", "faqs", "quote"]],
        ["Photo story", "Title on navy with a wide photo below; quote highlighted.", "media", false, ["body", "quote", "related"], ["summary", "faqs"]],
        ["News & updates", "Simple navy band, text and related posts.", "navy", false, ["body", "related"], ["summary", "faqs", "quote"]]],
      study: [["Full case study", "Big photo, project facts, summary, story, FAQs, quote.", "image", false, ["summary", "body", "quote", "faqs", "related"], []],
        ["Photo showcase", "Photo-led: wide image under the title, story and client quote.", "media", false, ["body", "quote", "related"], ["summary", "faqs"]],
        ["Before & after", "Summary of the change, story with images, client quote.", "image", false, ["summary", "body", "quote", "related"], ["faqs"]],
        ["Commercial project", "Clean navy title, facts, summary, scope, FAQs for B2B clients.", "navy", false, ["summary", "body", "faqs", "related"], ["quote"]]]
    };
    $("#tp-lib").onclick = function () {
      if (tab === "city") return toast("City templates are built from a real city page: use “Create starter templates” or New template", true);
      var have = L.map(function (t) { return t.name.toLowerCase(); });
      W.modal("<h3>Template library: " + TYPES[tab][1] + "</h3><p class='muted'>Ready-made layouts. Adding one doesn’t change any page until you press <b>Apply to pages</b>.</p><div class='tp-lib'>" + LIB[tab].map(function (x, i) { var on = have.indexOf(x[0].toLowerCase()) > -1; return "<div class='tp-li'><div class='tp-thumb tp-" + x[2] + "'>" + thumb({ hero: x[2], toc: x[3], sections: x[4].map(function (k) { return { k: k, on: true }; }) }) + "</div><div><b>" + A(x[0]) + "</b><p class='muted'>" + A(x[1]) + "</p></div><button class='btn sm" + (on ? "" : " pri") + "' data-li='" + i + "'" + (on ? " disabled" : "") + ">" + (on ? "✓ Added" : "Add") + "</button></div>"; }).join("") + "</div><div class='modal-actions'><button class='btn' id='tl-x'>Close</button></div>");
      $("#tl-x").onclick = W.closeModal;
      $$("[data-li]").forEach(function (b) { b.onclick = function () { var x = LIB[tab][+b.dataset.li]; b.disabled = true;
        api("cms_tpl_save", { tpl: { type: tab, name: x[0], desc: x[1], hero: x[2], toc: x[3], sections: x[4].map(function (k) { return { k: k, on: true }; }).concat(x[5].map(function (k) { return { k: k, on: false }; })) } }).then(function (r) { if (!r.ok) { b.disabled = false; return toast(r.error, true); } b.textContent = "✓ Added"; b.classList.remove("pri"); toast(x[0] + " added"); load(); }); }; });
    };
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.t) { tab = b.dataset.t; load(); return; }
      var id = +(b.dataset.ed || b.dataset.dup || b.dataset.ex || b.dataset.del || b.dataset.ap || 0), t = L.filter(function (x) { return x.id === id; })[0]; if (!t) return;
      if (b.dataset.ed) editor(t);
      else if (b.dataset.dup) { var c = JSON.parse(JSON.stringify(t)); delete c.id; c.name += " (copy)"; c.default = false; api("cms_tpl_save", { tpl: c }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Duplicated"); load(); }); }
      else if (b.dataset.ex) exportT(t);
      else if (b.dataset.ap) applyTo(t);
      else if (b.dataset.del && confirm("Delete “" + t.name + "”? Pages using it switch to the default layout next time they are published.")) api("cms_tpl_delete", { id: id }).then(function () { toast("Deleted"); load(); });
    });
    load();
  };
})();
