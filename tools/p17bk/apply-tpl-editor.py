# P17 templates: template picker in article/portfolio editor + wait for templates before rendering (idempotent)
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../../frontend-v1/admin'))
p='admin-content.js'; s=open(p).read()
def ed(a,b):
    global s
    if b in s: return
    assert a in s, a[:60]; s=s.replace(a,b,1)
ed('''          imgField("ce-hero", (d.hero || {}).src, "Hero image") +''','''          '<label>Template <small>(layout &amp; sections — manage in Content → Templates)</small><select id="ce-tpl" data-cur="' + esc(d.tpl || "") + '">' + (W.tplOptions ? W.tplOptions(type, d.tpl) : '<option value="">Default layout</option>') + "</select></label>" +
          imgField("ce-hero", (d.hero || {}).src, "Hero image") +''')
ed('''        d.kicker = $("#ce-kicker").value.trim(); d.dek = $("#ce-dek").value.trim();''','''        if ($("#ce-tpl")) { var tv = +$("#ce-tpl").value || 0; if (tv) d.tpl = tv; else delete d.tpl; }
        d.kicker = $("#ce-kicker").value.trim(); d.dek = $("#ce-dek").value.trim();''')
ed('''        return bapi("load", { path: rel }).then(function (r) { if (!r.ok) throw new Error("Template page could not be loaded: " + (r.error || rel)); return r; });''','''        return (W.tplReady ? W.tplReady() : Promise.resolve()).then(function () { return bapi("load", { path: rel }); }).then(function (r) { if (!r.ok) throw new Error("Template page could not be loaded: " + (r.error || rel)); return r; });''')
open(p,'w').write(s); print('editor ok')
