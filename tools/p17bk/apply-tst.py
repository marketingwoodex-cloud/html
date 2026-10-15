# P17 C8: testimonials — city field + 5 designs (per page) — idempotent
import os, re
os.chdir(os.path.join(os.path.dirname(__file__), '../..'))
def ed(p, a, b):
    s = open(p).read()
    if b in s: return
    assert a in s, (p, a[:70]); open(p, 'w').write(s.replace(a, b, 1))
C = 'frontend-v1/admin/admin-content.js'
# ---- renderer
s = open(C).read()
if 'TST_DESIGNS' not in s:
  a = s.index('    if (kind === "testimonial") return "<!--wx:" + m + \'-->')
  b = s.index('    return "<!--wx:" + m + \'-->\\n<section class="wx-team"', a)
if 'TST_DESIGNS' not in s:
    s = s[:a] + r'''    if (kind === "testimonial") return tstHtml(items, set, design);
''' + s[b:]
    s = s.replace('  function sectionHtml(kind, items, set) {', r'''  /** P17 C8: 5 testimonial designs (CSS only, no JS) */
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
  function sectionHtml(kind, items, set, design) {''')
open(C, 'w').write(s)
# ---- city field
ed(C, '''<label>Project <small>(optional)</small><input id="sx-p" value="' + esc(d.project) + '" placeholder="Office fit-out, Gulberg"></label><label>Rating''',
'''<label>Project <small>(optional)</small><input id="sx-p" value="' + esc(d.project) + '" placeholder="Office fit-out, Gulberg"></label><label>City <small>(optional)</small><input id="sx-c" value="' + esc(d.city) + '" placeholder="Lahore"></label></div><div class="g2"><label>Rating''')
ed(C, '''project: $("#sx-p").value.trim(), rating:''', '''project: $("#sx-p").value.trim(), city: $("#sx-c").value.trim(), rating:''')
ed(C, '''esc([d.role, d.project].filter(Boolean).join(" · "))''', '''esc([d.role, d.project, d.city].filter(Boolean).join(" · "))''')
# ---- placements modal: design picker + per-page override + max
s = open(C).read()
if 'id="pl-d"' not in s:
    i = s.index("modal(\"<h3>\" + k.title + ': pages & heading</h3>"); j = s.index("\n", i); line = s[i:j]
    # inject design block right after the heading row (before the page list search)
    line2 = line.replace('"></label></div><label>Show on', '"></label></div>' + "' + (kind === \"testimonial\" ? tstPick(set) : \"\") + '" + '<label>Show on', 1)
    assert line2 != line, 'pl inject'
    s = s[:i] + line2 + s[j:]
    # per-page design selects: append select after each page checkbox label
    s = s.replace('''pages.map(function (p) { return '<label class="check"><input type="checkbox" value="' + esc(p) + '"' + (cur.indexOf(p) > -1 ? " checked" : "") + "> /" + esc(p.replace(/index\\.html$/, "")) + "</label>"; }).join("")''',
    '''pages.map(function (p) { return '<label class="check"><input type="checkbox" value="' + esc(p) + '"' + (cur.indexOf(p) > -1 ? " checked" : "") + "> /" + esc(p.replace(/index\\.html$/, "")) + (kind === "testimonial" ? '<select class="pl-pd" data-p="' + esc(p) + '"><option value="">Default design</option>' + TST_DESIGNS.map(function (x) { return '<option value="' + x[0] + '"' + (((set.designs || {})[p]) === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select>" : "") + "</label>"; }).join("")''', 1)
    s = s.replace('''placements[kind + "Set"] = { kicker: $("#pl-k").value.trim(), heading: $("#pl-h").value.trim() };''',
    '''placements[kind + "Set"] = { kicker: $("#pl-k").value.trim(), heading: $("#pl-h").value.trim() }; if (kind === "testimonial") { var dz = {}; $$(".pl-pd").forEach(function (x) { if (x.value && sel.indexOf(x.dataset.p) > -1) dz[x.dataset.p] = x.value; }); Object.assign(placements[kind + "Set"], { design: ($("[name=pl-d]:checked") || {}).value || "cards", max: +$("#pl-m").value || 0, designs: dz }); }''', 1)
    s = s.replace('''          $("#pl-x").onclick = closeModal;''', '''          $("#pl-x").onclick = closeModal; if (kind === "testimonial") bindTstPick(items);''', 1)
    # push per page design
    s = s.replace('''var jobs = list.map(function (p) { return [p, block]; })''', '''var tset = placements[kind + "Set"] || {}; var jobs = list.map(function (p) { return [p, kind === "testimonial" ? sectionHtml(kind, live, tset, (tset.designs || {})[p]) : block]; })''', 1)
    s = s.replace('  function sectionView(kind) {', r'''  function tstPick(set) {
    return '<div class="tst-pick"><b>Design</b> <small class="muted">default for all pages; you can change it per page below</small><div class="tst-ds">' + TST_DESIGNS.map(function (x) { return '<label class="tst-d' + ((set.design || "cards") === x[0] ? " on" : "") + '"><input type="radio" name="pl-d" value="' + x[0] + '"' + ((set.design || "cards") === x[0] ? " checked" : "") + '><i class="tst-ic tst-ic-' + x[0] + '"><s></s><s></s><s></s></i><span>' + x[1] + "</span><small>" + x[2] + "</small></label>"; }).join("") + '</div><label class="tst-max">Show at most <input id="pl-m" type="number" min="0" max="30" value="' + (+set.max || 0) + '"> reviews <small class="muted">(0 = all live)</small></label><div class="tst-pv"><iframe id="pl-pv" title="Design preview"></iframe></div></div>';
  }
  function bindTstPick(items) {
    var live = items.filter(function (x) { return x.status === "published"; });
    function pv() { var d = ($("[name=pl-d]:checked") || {}).value || "cards"; $$(".tst-d").forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); });
      var f = $("#pl-pv"); if (!f) return; var h = tstHtml(live.length ? live : [{ title: "Sample Client", data: { rating: 5, text: "Add testimonials and mark them Live to see them here.", role: "Owner" } }], { kicker: $("#pl-k").value, heading: $("#pl-h").value, max: +$("#pl-m").value || 0 }, d);
      f.srcdoc = '<!doctype html><html><head><base href="' + location.origin + '/"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/v1.css"><link rel="stylesheet" href="/assets/theme.css"><style>body{margin:0}</style></head><body>' + h + "</body></html>"; }
    $$("[name=pl-d]").forEach(function (r) { r.onchange = pv; }); ["#pl-k", "#pl-h", "#pl-m"].forEach(function (q) { if ($(q)) $(q).addEventListener("input", pv); }); pv();
    $("#modal-card").classList.add("wide");
  }
  function sectionView(kind) {''', 1)
    open(C, 'w').write(s)
# ---- server whitelist (PHP + mirror)
P = 'frontend-v1/api/content-lib.php'
ed(P, "$c['placements'][$k . 'Set'] = ['kicker' => clip($s['kicker'] ?? '', 60), 'heading' => clip($s['heading'] ?? '', 120)];",
"$c['placements'][$k . 'Set'] = ['kicker' => clip($s['kicker'] ?? '', 60), 'heading' => clip($s['heading'] ?? '', 120)];\n                if ($k === 'testimonial') { $D = ['cards', 'spotlight', 'slider', 'wall', 'band']; $c['placements'][$k . 'Set']['design'] = in_array($s['design'] ?? '', $D, true) ? $s['design'] : 'cards'; $c['placements'][$k . 'Set']['max'] = max(0, min(30, (int)($s['max'] ?? 0))); $dz = []; foreach ((array)($s['designs'] ?? []) as $pg => $dv) if (in_array($pg, $c['placements'][$k], true) && in_array($dv, $D, true)) $dz[$pg] = $dv; $c['placements'][$k . 'Set']['designs'] = (object)$dz; }")
N = 'tools/frontend-v1-admin.mjs'
ed(N, 'c.placements[k + "Set"] = { kicker: clip(st.kicker, 60), heading: clip(st.heading, 120) }; });',
'c.placements[k + "Set"] = { kicker: clip(st.kicker, 60), heading: clip(st.heading, 120) }; if (k === "testimonial") { const D = ["cards", "spotlight", "slider", "wall", "band"], o = c.placements[k + "Set"]; o.design = D.includes(st.design) ? st.design : "cards"; o.max = Math.max(0, Math.min(30, +st.max || 0)); o.designs = {}; for (const [pg, dv] of Object.entries(st.designs || {})) if (c.placements[k].includes(pg) && D.includes(dv)) o.designs[pg] = dv; } });')
print('tst ok')
