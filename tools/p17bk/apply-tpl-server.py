# P17 templates: cms_tpl_list / cms_tpl_save / cms_tpl_delete in content-lib.php + Node mirror (idempotent)
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../..'))
def ed(p, a, b):
    s = open(p).read()
    if b in s: return
    assert a in s, (p, a[:50]); open(p, 'w').write(s.replace(a, b, 1))
PHP_FN = r'''
/** P17 templates (article / portfolio / city): validated template record. */
const CMS_TPL_SEC = ['body', 'summary', 'faqs', 'quote', 'related'];
function cms_tpl_clean(array $t): array {
    $type = (string)($t['type'] ?? ''); if (!in_array($type, ['post', 'study', 'city'], true)) fail('Unknown template type');
    $name = clip($t['name'] ?? '', 60); if ($name === '') fail('Give the template a name');
    $o = ['type' => $type, 'name' => $name, 'desc' => clip($t['desc'] ?? '', 200), 'default' => !empty($t['default'])];
    if ($type === 'city') {
        $o['source'] = preg_match('~^[a-z0-9-]{1,60}$~', (string)($t['source'] ?? '')) ? $t['source'] : '';
        $o['order'] = []; foreach (array_slice((array)($t['order'] ?? []), 0, 30) as $x) if (is_array($x) && preg_match('~^[a-z0-9_-]{1,60}$~i', (string)($x['id'] ?? ''))) $o['order'][] = ['id' => $x['id'], 'on' => !empty($x['on']), 'label' => clip($x['label'] ?? '', 60)];
        if (!$o['order']) fail('Pick the sections for this city template');
    } else {
        $o['hero'] = in_array($t['hero'] ?? '', ['image', 'navy', 'media'], true) ? $t['hero'] : 'image';
        foreach (['toc' => false, 'meta' => true, 'facts' => true] as $k => $def) $o[$k] = array_key_exists($k, $t) ? !empty($t[$k]) : $def;
        $seen = []; $o['sections'] = [];
        foreach ((array)($t['sections'] ?? []) as $x) { $k = (string)($x['k'] ?? ''); if (in_array($k, CMS_TPL_SEC, true) && !isset($seen[$k])) { $seen[$k] = 1; $o['sections'][] = ['k' => $k, 'on' => !empty($x['on'])]; } }
        foreach (CMS_TPL_SEC as $k) if (!isset($seen[$k])) $o['sections'][] = ['k' => $k, 'on' => true];
    }
    return $o;
}
function content_actions(string $action, array $in): bool {'''
ed('frontend-v1/api/content-lib.php', '\nfunction content_actions(string $action, array $in): bool {', PHP_FN)
ed('frontend-v1/api/content-lib.php', "        case 'cms_page_kinds':", r"""        case 'cms_tpl_list': need($ED); out(['ok' => true, 'tpls' => array_values($c['tpls'] ?? [])]);
        case 'cms_tpl_save':
            $u = need($ED); $o = cms_tpl_clean((array)($in['tpl'] ?? [])); $L = array_values($c['tpls'] ?? []); $id = (int)($in['tpl']['id'] ?? 0); $k = -1;
            foreach ($L as $j => $x) if ((int)$x['id'] === $id) $k = $j;
            if ($k < 0 && count($L) >= 60) fail('Too many templates');
            $o['id'] = $k >= 0 ? $id : (int)($c['tplSeq'] = (int)($c['tplSeq'] ?? 0) + 1); $o['updated_at'] = cms_now(); $o['by'] = $u['name'] ?? '';
            if ($o['default']) foreach ($L as $j => $x) if ($x['type'] === $o['type']) $L[$j]['default'] = false;
            if ($k >= 0) $L[$k] = $o; else $L[] = $o;
            $c['tpls'] = $L; cms_save_file($c); log_act($u, 'template.save', $o['type'] . ': ' . $o['name']); out(['ok' => true, 'tpl' => $o, 'tpls' => $L]);
        case 'cms_tpl_delete':
            $u = need($ED); $id = (int)($in['id'] ?? 0); $L = array_values(array_filter($c['tpls'] ?? [], fn($x) => (int)$x['id'] !== $id));
            foreach ($c['items'] as $j => $x) if ((int)($x['data']['tpl'] ?? 0) === $id) unset($c['items'][$j]['data']['tpl']);
            $c['tpls'] = $L; cms_save_file($c); log_act($u, 'template.delete', '#' . $id); out(['ok' => true, 'tpls' => $L]);
        case 'cms_page_kinds':""")
# Node mirror
JS = r'''      case "cms_tpl_list": { need(ED); return { ok: true, tpls: c.tpls || [] }; }
      case "cms_tpl_save": {
        const u = need(ED), t = inp.tpl || {}, type = String(t.type || ""); if (!["post", "study", "city"].includes(type)) throw new Fail("Unknown template type");
        const name = clip(t.name, 60); if (!name) throw new Fail("Give the template a name");
        const o = { type, name, desc: clip(t.desc, 200), default: !!t.default };
        if (type === "city") { o.source = /^[a-z0-9-]{1,60}$/.test(t.source || "") ? t.source : ""; o.order = (t.order || []).slice(0, 30).filter((x) => x && /^[a-z0-9_-]{1,60}$/i.test(x.id || "")).map((x) => ({ id: x.id, on: !!x.on, label: clip(x.label, 60) })); if (!o.order.length) throw new Fail("Pick the sections for this city template"); }
        else { const SEC = ["body", "summary", "faqs", "quote", "related"]; o.hero = ["image", "navy", "media"].includes(t.hero) ? t.hero : "image"; o.toc = !!t.toc; o.meta = "meta" in t ? !!t.meta : true; o.facts = "facts" in t ? !!t.facts : true;
          const seen = new Set(); o.sections = []; for (const x of t.sections || []) if (SEC.includes(x.k) && !seen.has(x.k)) { seen.add(x.k); o.sections.push({ k: x.k, on: !!x.on }); } for (const k of SEC) if (!seen.has(k)) o.sections.push({ k, on: true }); }
        const L = c.tpls = c.tpls || []; const k = L.findIndex((x) => x.id === +t.id); if (k < 0 && L.length >= 60) throw new Fail("Too many templates");
        o.id = k >= 0 ? +t.id : (c.tplSeq = (c.tplSeq || 0) + 1); o.updated_at = now(); o.by = u.name;
        if (o.default) L.forEach((x) => { if (x.type === type) x.default = false; });
        if (k >= 0) L[k] = o; else L.push(o); log(db, u, "template.save", type + ": " + name, ip); return done({ ok: true, tpl: o, tpls: L });
      }
      case "cms_tpl_delete": { const u = need(ED), id = +inp.id; c.tpls = (c.tpls || []).filter((x) => x.id !== id); (c.items || []).forEach((x) => { if (x.data && +x.data.tpl === id) delete x.data.tpl; }); log(db, u, "template.delete", "#" + id, ip); return done({ ok: true, tpls: c.tpls }); }
      case "cms_page_kinds":'''
ed('tools/frontend-v1-admin.mjs', '      case "cms_page_kinds":', JS)
print('server ok')
