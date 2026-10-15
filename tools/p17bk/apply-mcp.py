# P17 C4-C6: MCP tools for templates / articles / portfolio / cities (PHP + Node mirror), idempotent
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../..'))
def ed(p, a, b):
    s = open(p).read()
    if b in s: return
    assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))
P = 'frontend-v1/api/mcp.php'
ed(P, "    'create_blog_draft' => [", r"""    'list_content' => ['Lists articles (post), portfolio studies (study) or city pages (city) with id, title, address, status and template.', $S('', ['type' => $str('post, study or city'), 'search' => $str('Matches the title or address')], ['type']), true],
    'get_content' => ['Full fields of one article or portfolio study (text blocks, summary, FAQs, details, template).', $S('', ['id' => $int('Content id from list_content')], ['id']), true],
    'list_templates' => ['Lists page templates (layout presets) for post, study or city. Use the id in save_content_draft.', $S('', ['type' => $str('post, study or city')]), true],
    'save_content_draft' => ['Creates a NEW article/portfolio draft, or updates an existing one (pass id). Only fields you send are changed. Never publishes: a live page changes only when the team presses Publish. Body in simple markdown.', $S('', ['type' => $str('post or study'), 'id' => $int('Existing item id (omit to create)'), 'title' => $str('Title'), 'slug' => $str('Page address for a new item (optional)'), 'kicker' => $str('Small line above the title'), 'dek' => $str('One-sentence standfirst'), 'body' => $str('Main text in simple markdown (## headings, - lists)'),
        'summary' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Short-version bullet points'], 'faqs' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['q' => $str('Question'), 'a' => $str('Answer')]], 'description' => 'FAQs'],
        'meta' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['k' => $str('Label'), 'v' => $str('Value')]], 'description' => 'Details strip, e.g. Location / Area / Year'], 'quote' => $str('Pull quote'), 'template' => $int('Template id from list_templates (0 = default)')], ['type']), false],
    'create_city_draft' => ['Creates a DRAFT city page by copying a template city page and swapping the city name. The team reviews and publishes it in Admin → City pages.', $S('', ['city' => $str('City name, e.g. Sialkot'), 'source' => $str('Page address of the city to copy (default lahore)')], ['city']), false],
    'create_blog_draft' => [""")
ed(P, "    case 'create_blog_draft':", r"""    case 'list_content':
        $ty = (string)($a['type'] ?? ''); if (!in_array($ty, ['post', 'study', 'city'], true)) rpc_out($rid, mcp_text('type must be post, study or city', true));
        $q = strtolower(trim((string)($a['search'] ?? ''))); $rows = [];
        foreach (cms_load()['items'] as $x) if ($x['type'] === $ty && ($q === '' || str_contains(strtolower($x['title'] . ' ' . $x['slug']), $q))) $rows[] = ['id' => $x['id'], 'title' => $x['title'], 'slug' => $x['slug'], 'status' => $x['status'], 'live' => !empty($x['rel']), 'template' => (int)($x['data']['tpl'] ?? 0)];
        if ($ty === 'city') foreach (glob(ROOT_DIR . '/*/index.html') as $f) { $h = (string)file_get_contents($f, false, null, 0, 400000); if (preg_match('~<body[^>]*data-page="city"~', $h) && ($q === '' || str_contains(basename(dirname($f)), $q))) $rows[] = ['slug' => basename(dirname($f)), 'status' => 'published', 'live' => true]; }
        mcp_log_call($tool, true); rpc_out($rid, mcp_text(['count' => count($rows), 'items' => $rows]));
    case 'get_content':
        foreach (cms_load()['items'] as $x) if ((int)$x['id'] === (int)($a['id'] ?? 0) && in_array($x['type'], ['post', 'study'], true)) { unset($x['pending']); mcp_log_call($tool, true); rpc_out($rid, mcp_text($x)); }
        rpc_out($rid, mcp_text('Article / study not found', true));
    case 'list_templates':
        $ty = (string)($a['type'] ?? ''); $L = array_values(array_filter(cms_load()['tpls'] ?? [], fn($t) => $ty === '' || $t['type'] === $ty));
        mcp_log_call($tool, true); rpc_out($rid, mcp_text(['count' => count($L), 'templates' => array_map(fn($t) => array_intersect_key($t, array_flip(['id', 'type', 'name', 'desc', 'default', 'hero', 'toc', 'sections', 'order'])), $L)]));
    case 'save_content_draft':
        $ty = (string)($a['type'] ?? ''); if (!in_array($ty, ['post', 'study'], true)) rpc_out($rid, mcp_text('type must be post or study', true));
        $c = cms_load(); $it = null; if (!empty($a['id'])) { foreach ($c['items'] as $x) if ((int)$x['id'] === (int)$a['id'] && $x['type'] === $ty) $it = $x; if (!$it) rpc_out($rid, mcp_text('Item not found', true)); }
        $title = trim((string)($a['title'] ?? ($it['title'] ?? ''))); if ($title === '') rpc_out($rid, mcp_text('title is required for a new item', true));
        $d = $it['data'] ?? []; foreach (['kicker' => 160, 'dek' => 400, 'quote' => 600] as $k => $n) if (array_key_exists($k, $a)) $d[$k] = clip($a[$k], $n);
        if (isset($a['body']) && trim((string)$a['body']) !== '') $d['blocks'] = md_blocks((string)$a['body']);
        if (isset($a['summary']) && is_array($a['summary'])) $d['summary'] = array_slice(array_map(fn($x) => clip($x, 400), $a['summary']), 0, 12);
        if (isset($a['faqs']) && is_array($a['faqs'])) $d['faqs'] = array_slice(array_values(array_filter(array_map(fn($f) => ['q' => clip($f['q'] ?? '', 300), 'a' => clip($f['a'] ?? '', 1500)], $a['faqs']), fn($f) => $f['q'] !== '' && $f['a'] !== '')), 0, 15);
        if (isset($a['meta']) && is_array($a['meta'])) $d['meta'] = array_slice(array_map(fn($m) => ['k' => clip($m['k'] ?? '', 40), 'v' => clip($m['v'] ?? '', 80)], $a['meta']), 0, 8);
        if (array_key_exists('template', $a)) { $tv = (int)$a['template']; if ($tv) { $ok = false; foreach ($c['tpls'] ?? [] as $t) if ((int)$t['id'] === $tv && $t['type'] === $ty) $ok = true; if (!$ok) rpc_out($rid, mcp_text('Template not found for this type (see list_templates)', true)); $d['tpl'] = $tv; } else unset($d['tpl']); }
        $d['aiAgent'] = $T['name']; $d['aiEdited'] = now();
        if ($it) { $in = ['id' => $it['id'], 'type' => $ty, 'title' => $title, 'slug' => $it['slug'], 'data' => $d, 'seo' => $it['seo'] ?? []]; }
        else {
            $slug = strtolower(trim((string)($a['slug'] ?? ''))) ?: trim(preg_replace('~[^a-z0-9]+~', '-', strtolower($title)), '-'); $slug = substr(preg_replace('~[^a-z0-9-]~', '', $slug), 0, 60) ?: $ty . '-' . date('Ymd-His');
            foreach ($c['items'] as $x) if ($x['type'] === $ty && $x['slug'] === $slug) $slug = substr($slug, 0, 50) . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
            $in = ['type' => $ty, 'title' => $title, 'slug' => $slug, 'status' => 'draft', 'data' => $d, 'seo' => ['desc' => clip($a['dek'] ?? '', 160)]];
        }
        run_action('cms_save', $in, $tool, fn($r) => ['ok' => true, 'id' => $r['item']['id'] ?? null, 'slug' => $r['item']['slug'] ?? '', 'status' => $r['item']['status'] ?? 'draft', 'message' => !empty($r['item']['rel']) ? 'Saved. The live page updates when the team presses Publish in Admin.' : 'Draft saved. The team reviews, adds images and publishes it in Admin.']);
    case 'create_city_draft':
        $city = trim(preg_replace('~\s+~', ' ', (string)($a['city'] ?? ''))); $slug = trim(preg_replace('~[^a-z0-9]+~', '-', strtolower($city)), '-');
        if ($city === '' || $slug === '') rpc_out($rid, mcp_text('city is required', true));
        $src = preg_replace('~[^a-z0-9-]~', '', strtolower((string)($a['source'] ?? 'lahore'))) ?: 'lahore'; $sf = ROOT_DIR . '/' . $src . '/index.html';
        $html = is_file($sf) ? (string)file_get_contents($sf) : ''; if (!preg_match('~<body[^>]*data-page="city"~', $html)) rpc_out($rid, mcp_text('Source is not a city page', true));
        $srcName = preg_match('~<title>[^<]*?in ([^|<]+?)\s*(\||</title>)~', $html, $m) ? trim($m[1]) : ucwords(str_replace('-', ' ', $src));
        $hs = strpos($html, '<head'); $he = strpos($html, '</head>'); $ms = strpos($html, '<main'); $me = strpos($html, '</main>');
        $sw = fn($s) => preg_replace('~\b' . preg_quote($srcName, '~') . '\b~', $city, str_replace('/' . $src . '/', '/' . $slug . '/', $s));
        $html = substr($html, 0, $hs) . $sw(substr($html, $hs, $he - $hs)) . substr($html, $he, $ms - $he) . $sw(substr($html, $ms, $me - $ms)) . substr($html, $me);
        run_action('cms_save', ['type' => 'city', 'title' => ucwords($city), 'slug' => $slug, 'data' => ['html' => $html, 'source' => $src, 'aiAgent' => $T['name']]], $tool, fn($r) => ['ok' => true, 'id' => $r['item']['id'] ?? null, 'slug' => $slug, 'status' => 'draft', 'message' => 'City draft saved. Review the local text in Admin → City pages, then publish.']);
    case 'create_blog_draft':""")
# ---------------- Node mirror
N = 'tools/frontend-v1-admin.mjs'
ed(N, "      create_blog_draft: [", r"""      list_content: ["Lists articles (post), portfolio studies (study) or city pages (city) with id, title, address, status and template.", S({ type: st("post, study or city"), search: st("Matches the title or address") }, ["type"]), true],
      get_content: ["Full fields of one article or portfolio study.", S({ id: it("Content id") }, ["id"]), true],
      list_templates: ["Lists page templates (layout presets) for post, study or city.", S({ type: st("post, study or city") }), true],
      save_content_draft: ["Creates a NEW article/portfolio draft, or updates an existing one (pass id). Never publishes.", S({ type: st("post or study"), id: it("Existing item id"), title: st("Title"), slug: st("Address"), kicker: st("Kicker"), dek: st("Standfirst"), body: st("Markdown body"), summary: { type: "array", items: { type: "string" } }, faqs: { type: "array", items: { type: "object" } }, meta: { type: "array", items: { type: "object" } }, quote: st("Pull quote"), template: it("Template id") }, ["type"]), false],
      create_city_draft: ["Creates a DRAFT city page by copying a template city and swapping the name.", S({ city: st("City name"), source: st("City address to copy (default lahore)") }, ["city"]), false],
      create_blog_draft: [""")
ed(N, '      case "create_blog_draft": {', r"""      case "list_content": case "get_content": case "list_templates": case "save_content_draft": case "create_city_draft": {
        const C = jr(CMS, {}), items = C.items || [], ty = String(a.type || "");
        const md = (src) => { const b = []; for (const chunk of String(src).replace(/\r/g, "").trim().split(/\n{2,}/)) { for (const ln of chunk.split("\n").map((x) => x.trim()).filter(Boolean)) { let m; if ((m = /^#{1,4}\s+(.+)$/.exec(ln))) b.push({ t: "h", text: m[1] }); else if ((m = /^[-*•]\s+(.+)$/.exec(ln))) { const l = b[b.length - 1]; if (l && l.t === "list") l.items.push(m[1]); else b.push({ t: "list", items: [m[1]] }); } else { const l = b[b.length - 1]; if (l && l.t === "p" && !l.end) l.text += " " + ln; else b.push({ t: "p", text: ln }); } } const l = b[b.length - 1]; if (l) l.end = true; } return b.map(({ end, ...x }) => x).slice(0, 120); };
        if (tool === "list_content") { if (!["post", "study", "city"].includes(ty)) return rpc(text("type must be post, study or city", true)); const q = String(a.search || "").toLowerCase(); const rows = items.filter((x) => x.type === ty && (!q || (x.title + " " + x.slug).toLowerCase().includes(q))).map((x) => ({ id: x.id, title: x.title, slug: x.slug, status: x.status, live: !!x.rel, template: +(x.data && x.data.tpl) || 0 }));
          if (ty === "city") for (const d of fs.readdirSync(ROOT)) { const f = path.join(ROOT, d, "index.html"); if (fs.existsSync(f) && /<body[^>]*data-page="city"/.test(fs.readFileSync(f, "utf8")) && (!q || d.includes(q))) rows.push({ slug: d, status: "published", live: true }); }
          logCall(tool, true); return rpc(text({ count: rows.length, items: rows })); }
        if (tool === "get_content") { const x = items.find((i) => i.id === +a.id && ["post", "study"].includes(i.type)); if (!x) return rpc(text("Article / study not found", true)); logCall(tool, true); return rpc(text(x)); }
        if (tool === "list_templates") { const L = (C.tpls || []).filter((t) => !ty || t.type === ty); logCall(tool, true); return rpc(text({ count: L.length, templates: L })); }
        if (tool === "save_content_draft") {
          if (!["post", "study"].includes(ty)) return rpc(text("type must be post or study", true));
          const old = a.id ? items.find((i) => i.id === +a.id && i.type === ty) : null; if (a.id && !old) return rpc(text("Item not found", true));
          const title = String(a.title || (old && old.title) || "").trim(); if (!title) return rpc(text("title is required for a new item", true));
          const d = { ...((old && old.data) || {}) }; for (const k of ["kicker", "dek", "quote"]) if (k in a) d[k] = clip(a[k], 600);
          if (String(a.body || "").trim()) d.blocks = md(a.body); if (Array.isArray(a.summary)) d.summary = a.summary.map((x) => clip(x, 400)).slice(0, 12);
          if (Array.isArray(a.faqs)) d.faqs = a.faqs.map((f) => ({ q: clip(f.q, 300), a: clip(f.a, 1500) })).filter((f) => f.q && f.a).slice(0, 15); if (Array.isArray(a.meta)) d.meta = a.meta.map((m) => ({ k: clip(m.k, 40), v: clip(m.v, 80) })).slice(0, 8);
          if ("template" in a) { const tv = +a.template || 0; if (tv) { if (!(C.tpls || []).some((t) => t.id === tv && t.type === ty)) return rpc(text("Template not found for this type (see list_templates)", true)); d.tpl = tv; } else delete d.tpl; }
          d.aiAgent = T.name; d.aiEdited = now();
          let inp; if (old) inp = { id: old.id, type: ty, title, slug: old.slug, data: d, seo: old.seo || {} };
          else { let slug = (String(a.slug || "").toLowerCase().trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).replace(/[^a-z0-9-]/g, "").slice(0, 60) || ty + "-" + Date.now(); if (items.some((x) => x.type === ty && x.slug === slug)) slug = slug.slice(0, 50) + "-" + Math.random().toString(16).slice(2, 7); inp = { type: ty, title, slug, status: "draft", data: d, seo: { desc: clip(a.dek, 160) } }; }
          return run("cms_save", inp, (r) => ({ ok: true, id: r.item && r.item.id, slug: r.item && r.item.slug, status: r.item && r.item.status, message: r.item && r.item.rel ? "Saved. The live page updates when the team presses Publish in Admin." : "Draft saved. The team reviews and publishes it in Admin." }));
        }
        const city = String(a.city || "").trim().replace(/\s+/g, " "), slug = city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); if (!slug) return rpc(text("city is required", true));
        const src = String(a.source || "lahore").toLowerCase().replace(/[^a-z0-9-]/g, "") || "lahore", sf = path.join(ROOT, src, "index.html"); let html = fs.existsSync(sf) ? fs.readFileSync(sf, "utf8") : "";
        if (!/<body[^>]*data-page="city"/.test(html)) return rpc(text("Source is not a city page", true));
        const m = /<title>[^<]*?in ([^|<]+?)\s*(\||<\/title>)/.exec(html), sn = m ? m[1].trim() : src; const hs = html.indexOf("<head"), he = html.indexOf("</head>"), ms = html.indexOf("<main"), me = html.indexOf("</main>");
        const sw = (s) => s.split("/" + src + "/").join("/" + slug + "/").replace(new RegExp("\\b" + sn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), city);
        html = html.slice(0, hs) + sw(html.slice(hs, he)) + html.slice(he, ms) + sw(html.slice(ms, me)) + html.slice(me);
        return run("cms_save", { type: "city", title: city.replace(/\b\w/g, (c) => c.toUpperCase()), slug, data: { html, source: src, aiAgent: T.name } }, (r) => ({ ok: true, id: r.item && r.item.id, slug, status: "draft", message: "City draft saved. Review it in Admin → City pages, then publish." }));
      }
      case "create_blog_draft": {""")
print('mcp ok')
