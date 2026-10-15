# P17 C7: linked FAQ groups (idempotent)
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../..', 'frontend-v1/admin'))
def ed(p, a, b):
    s = open(p).read()
    if b in s or (a.startswith('    wait = Promise.all') and 'FAQG = {}' in s) or (a.startswith('    wait = api("cms_tpl_list"') and 'FAQG = {}' in s): return
    assert a in s, (p, a[:70]); open(p, 'w').write(s.replace(a, b, 1))
C = 'admin-content.js'; T = 'admin-templates.js'
# 1) groups cache loaded together with templates
ed(T, '''    wait = api("cms_tpl_list", {}).then(function (r) { cache = (r && r.ok && r.tpls) || []; wait = null; return cache; }, function () { cache = []; wait = null; return cache; });''',
'''    wait = Promise.all([api("cms_tpl_list", {}), api("cms_list", { type: "faq" })]).then(function (rs) { cache = (rs[0] && rs[0].ok && rs[0].tpls) || []; FAQG = {}; ((rs[1] && rs[1].items) || []).forEach(function (g) { FAQG[g.id] = g; }); wait = null; return cache; }, function () { cache = []; wait = null; return cache; });''')
ed(T, '  var override = null; // used by the live preview', '''  var FAQG = {};
  /** P17 C7: questions of a linked FAQ group (null when the group is gone) */
  W.faqGroup = function (id) { return FAQG[+id] || null; };
  W.faqItems = function (id) { var g = FAQG[+id]; return g ? ((g.data || {}).items || []).filter(function (f) { return f.q && f.a; }).map(function (f) { return { q: f.q, a: f.a }; }) : null; };
  var override = null; // used by the live preview''')
# 2) renderer resolves linked group
ed(C, '''  function renderPage(type, it, shell, others) {
''', '''  function renderPage(type, it, shell, others) {
    if (it.data && it.data.faqGroup && W.faqItems) { var fgi = W.faqItems(it.data.faqGroup); if (fgi) it = Object.assign({}, it, { data: Object.assign({}, it.data, { faqs: fgi }) }); }
''')
# 3) editor: link select + linked banner
ed(C, '''(faqGroups.length ? '<select id="ce-fg" class="sm-in"><option value="">Insert FAQ group…</option>' + faqGroups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.title) + " (" + ((g.data || {}).items || []).length + ")</option>"; }).join("") + "</select>" : "")''',
'''(faqGroups.length ? '<select id="ce-fg" class="sm-in"><option value="">Use FAQ group…</option><optgroup label="Link (stays in sync)">' + faqGroups.map(function (g) { return '<option value="L' + g.id + '">' + esc(g.title) + " (" + ((g.data || {}).items || []).length + ")</option>"; }).join("") + '</optgroup><optgroup label="Copy questions (edit here)">' + faqGroups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.title) + "</option>"; }).join("") + "</optgroup></select>" : "")''')
ed(C, '''<div class="card-b"><div id="ce-faqs">' + faqRows(d.faqs) + '</div><button type="button" class="btn sm" id="ce-faq-add">''',
'''<div class="card-b"><div id="ce-fg-link"></div><div id="ce-faqs">' + faqRows(d.faqs) + '</div><button type="button" class="btn sm" id="ce-faq-add">''')
ed(C, '''        if ($("#ce-fg")) $("#ce-fg").onchange = function () { var g = faqGroups.find(function (x) { return x.id === +this.value; }, this); if (!g) return;''',
'''        function fgLink() {
          var box = $("#ce-fg-link"); if (!box) return; var g = d.faqGroup ? faqGroups.find(function (x) { return x.id === +d.faqGroup; }) : null;
          $("#ce-faqs").hidden = $("#ce-faq-add").hidden = !!g;
          box.innerHTML = g ? '<div class="fg-linked">' + ic("link") + '<div><b>Linked to “' + esc(g.title) + '”</b><small>' + ((g.data || {}).items || []).length + ' questions · edit them in Content → FAQ groups and this page updates too.</small><ol>' + ((g.data || {}).items || []).map(function (f) { return "<li>" + esc(f.q) + "</li>"; }).join("") + '</ol></div><button type="button" class="btn sm" id="ce-fg-un">Unlink &amp; edit a copy</button></div>' : (d.faqGroup ? '<p class="muted">The linked FAQ group was deleted; the questions below are kept.</p>' : "");
          W.fillIcons(box);
          if ($("#ce-fg-un")) $("#ce-fg-un").onclick = function () { d.faqs = ((g.data || {}).items || []).map(function (f) { return { q: f.q, a: f.a }; }); delete d.faqGroup; $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); fgLink(); mark(); };
        }
        fgLink();
        if ($("#ce-fg")) $("#ce-fg").onchange = function () { if (this.value.charAt(0) === "L") { var lg = faqGroups.find(function (x) { return "L" + x.id === this.value; }, this); this.value = ""; if (!lg) return; collect(); d.faqGroup = lg.id; d.faqs = ((lg.data || {}).items || []).map(function (f) { return { q: f.q, a: f.a }; }); $("#ce-faqs").innerHTML = faqRows(d.faqs); W.fillIcons($("#ce-faqs")); fgLink(); mark(); return; } var g = faqGroups.find(function (x) { return x.id === +this.value; }, this); if (!g) return;''')
print('faq editor ok')
# 4) FAQ groups screen: usage, duplicate, sync linked pages
s = open(C).read()
i = s.index('  W.VIEWS.faqs = function (el) {'); j = s.index('    function load() {', i); k = s.index('\n', j)
NEW_LOAD = '''    function load() { Promise.all([api("cms_list", { type: "faq" }), api("cms_list", { type: "post" })]).then(function (rs) { var g = rs[0].items || [], posts = rs[1].items || []; used = function (id) { return posts.filter(function (p) { return +((p.data || {}).faqGroup || 0) === id; }); }; allPosts = posts; $("#fg-l").innerHTML = g.map(function (x) { var n = ((x.data || {}).items || []).length, u = used(x.id); return '<div class="card fg" data-id="' + x.id + '"><div class="card-h"><h3>' + esc(x.title) + '</h3><div class="toolbar"><span class="badge">' + n + ' questions</span><button class="btn sm" data-dup title="Make a copy to change for one page">Duplicate</button><button class="btn sm" data-ed>Edit</button></div></div><div class="card-b"><ol class="fg-q">' + ((x.data || {}).items || []).slice(0, 4).map(function (f) { return "<li>" + esc(f.q) + "</li>"; }).join("") + (n > 4 ? '<li class="muted">…and ' + (n - 4) + " more</li>" : "") + '</ol><div class="fg-used">' + ic("link") + (u.length ? "<b>Used on " + u.length + (u.length > 1 ? " pages" : " page") + ":</b> " + u.map(function (p) { return '<a href="#/post/' + p.id + '">' + esc(p.title) + "</a>" + (p.rel ? "" : ' <span class="badge">draft</span>'); }).join(", ") : '<span class="muted">Not linked to any article yet · also used by the AI chat &amp; Google FAQ results</span>') + "</div></div></div>"; }).join("") || '<div class="card card-b empty">' + ic("help-circle") + "<p>No FAQ groups yet.</p></div>"; W.fillIcons($("#fg-l")); var byId = function (b) { return g.find(function (x) { return x.id === +b.closest(".fg").dataset.id; }); }; $$("#fg-l [data-ed]").forEach(function (b) { b.onclick = function () { edit(byId(b)); }; }); $$("#fg-l [data-dup]").forEach(function (b) { b.onclick = function () { var x = byId(b); api("cms_save", { id: 0, type: "faq", title: x.title + " (copy)", data: { items: ((x.data || {}).items || []).slice() }, status: "published" }).then(function (r) { if (!r.ok) return toast(r.error, true); toast("Copy created — edit it, then link it to the page that needs different questions"); load(); }); }; }); }); }
    var used = function () { return []; }, allPosts = [];
    /** republish every LIVE article linked to group id so the change shows on the site */
    function syncPages(id) {
      var L = used(id).filter(function (p) { return p.rel; }); if (!L.length) return Promise.resolve(0);
      var done = 0; return (W.tplReady ? W.tplReady(true) : Promise.resolve()).then(function () {
        return L.reduce(function (pr, p) { return pr.then(function () { return api("cms_get", { id: p.id }).then(function (gi) { var full = gi.item; return bapi("load", { path: full.rel }).then(function (cur) { if (!cur.ok) throw new Error(cur.error); return bapi("save", { path: full.rel, html: W.contentRender("post", full, cur.html, allPosts), mtime: cur.mtime }); }).then(function (r) { if (r && r.ok) done++; }); }).catch(function (e) { toast(p.title + ": " + (e.message || e), true); }); }); }, Promise.resolve());
      }).then(function () { return done; });
    }'''
s = s[:j] + NEW_LOAD + s[k:] if 'function syncPages(id)' not in s else s
open(C, 'w').write(s)
ed(C, '''status: "published" }).then(function (r) { if (!r.ok) { $("#fg-err").textContent = r.error; return; } $("#modal-card").classList.remove("wide"); closeModal(); load(); toast("Saved"); }); };''',
'''status: "published" }).then(function (r) { if (!r.ok) { $("#fg-err").textContent = r.error; return; } $("#modal-card").classList.remove("wide"); closeModal(); var live = x ? used(x.id).filter(function (p) { return p.rel; }).length : 0; if (!live) { load(); return toast("Saved"); } toast("Saved · updating " + live + " live page" + (live > 1 ? "s" : "") + "…"); syncPages(x.id).then(function (n) { toast("Saved · " + n + " live page" + (n === 1 ? "" : "s") + " updated ✓"); load(); }); }); };''')
print('faq view ok')
