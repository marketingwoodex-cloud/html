# P17 C9: media library upgrade (idempotent)
import os
os.chdir(os.path.join(os.path.dirname(__file__), '../..'))
def ed(p, a, b):
    s = open(p).read()
    if b in s: return
    assert a in s, (p, a[:70]); open(p, 'w').write(s.replace(a, b, 1))
# ---------- API: media_move (unused uploads only; alt text follows)
P = 'frontend-v1/api/media-lib.php'
ed(P, "        case 'media_trash':\n", r"""        case 'media_move':
            $u = need($ED); $to = preg_replace('~[^a-z0-9-]~', '', (string)($in['folder'] ?? '')); $dir = ROOT_DIR . '/assets/uploads' . ($to ? '/' . $to : ''); if ($to && !is_dir($dir)) fail('Folder not found');
            $urls = array_slice(array_values(array_filter(is_array($in['urls'] ?? null) ? $in['urls'] : [], 'a7_media_ok')), 0, 200); $corpus = a7_corpus(); $m = a7_media(); $moved = []; $blocked = [];
            foreach ($urls as $url) {
                $abs = ROOT_DIR . $url; if (!is_file($abs) || strpos($url, '/assets/uploads/') !== 0) { $blocked[] = $url; continue; }
                $hit = false; foreach ($corpus as $t) if (strpos($t, ltrim($url, '/')) !== false) { $hit = true; break; } if ($hit) { $blocked[] = $url; continue; }
                $nu = '/assets/uploads/' . ($to ? $to . '/' : '') . basename($abs); if ($nu === $url) continue; if (is_file(ROOT_DIR . $nu)) { $blocked[] = $url; continue; }
                rename($abs, ROOT_DIR . $nu); if (isset($m['alt'][$url])) { $m['alt'][$nu] = $m['alt'][$url]; unset($m['alt'][$url]); } $moved[] = $nu;
            }
            jwrite(MEDIA_FILE, $m); log_act($u, 'media.move', count($moved) . ' → ' . ($to ?: 'uploads')); out(['ok' => true, 'moved' => $moved, 'blocked' => $blocked]);
        case 'media_trash':
""")
N = 'tools/frontend-v1-admin.mjs'
ed(N, '      case "media_trash": {\n', r"""      case "media_move": {
        const u = need(ED), to = String(inp.folder || "").replace(/[^a-z0-9-]/g, ""), dir = path.join(ROOT, "assets/uploads", to); if (to && !fs.existsSync(dir)) throw new Fail("Folder not found");
        const urls = (Array.isArray(inp.urls) ? inp.urls : []).filter(mediaRelOk).slice(0, 200), corpus = usageCorpus(), m = mediaLoad(), moved = [], blocked = [];
        for (const url of urls) { const abs = path.join(ROOT, url); if (!fs.existsSync(abs) || !url.startsWith("/assets/uploads/") || corpus.some(([, t]) => t.includes(url.slice(1)))) { blocked.push(url); continue; }
          const nu = "/assets/uploads/" + (to ? to + "/" : "") + path.basename(abs); if (nu === url) continue; if (fs.existsSync(path.join(ROOT, nu))) { blocked.push(url); continue; }
          fs.renameSync(abs, path.join(ROOT, nu)); if (m.alt && m.alt[url]) { m.alt[nu] = m.alt[url]; delete m.alt[url]; } moved.push(nu); }
        jw(MEDIA, m); log(db, u, "media.move", moved.length + " file(s)", ip); save(db); return { ok: true, moved, blocked };
      }
      case "media_trash": {
""")
# ---------- UI
J = 'frontend-v1/admin/admin-media.js'
ed(J, '''<div class="card md-top"><div class="md-folders" id="md-f"></div><div class="md-tools"><input id="md-q" placeholder="Search file name or alt text…"><select id="md-flt"><option value="all">All images</option><option value="unused">Not used anywhere</option><option value="big">Large (over 350 KB)</option><option value="noalt">No alt text</option></select></div></div>''',
'''<div class="md-stats" id="md-st"></div><div class="card md-top"><div class="md-folders" id="md-f"></div><div class="md-tools"><input id="md-q" placeholder="Search file name or alt text…"><select id="md-flt"><option value="all">All images</option><option value="unused">Not used anywhere</option><option value="big">Large (over 350 KB)</option><option value="noalt">No alt text</option></select><select id="md-ty" title="File type"><option value="">All types</option><option value="webp">WebP</option><option value="jpg">JPG</option><option value="png">PNG</option><option value="svg">SVG</option><option value="gif">GIF</option></select><select id="md-so" title="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="big">Largest first</option><option value="name">Name A–Z</option></select><div class="seg md-view" id="md-vw"><button data-v="grid" title="Grid">' + ic("layout-dashboard") + '</button><button data-v="list" title="List">' + ic("menu") + '</button></div></div></div>''')
ed(J, '''<b id="md-bn"></b><button class="btn sm" id="md-bclr">Clear</button>''', '''<b id="md-bn"></b><button class="btn sm" id="md-ball">Select all shown</button><button class="btn sm" id="md-bclr">Clear</button><button class="btn sm" id="md-bcp">''' + "' + ic(\"copy\") + '" + '''Copy URLs</button><button class="btn sm" id="md-bmv">''' + "' + ic(\"folder\") + '" + '''Move to folder</button>''')
# filters + sort
ed(J, '''        return !q || (f.name + " " + f.alt).toLowerCase().indexOf(q) > -1;
      });''', '''        if (st.type && ext(f.name) !== st.type) return false;
        return !q || (f.name + " " + f.alt).toLowerCase().indexOf(q) > -1;
      }).sort(function (a, b) { return st.sort === "old" ? (a.mtime < b.mtime ? -1 : 1) : st.sort === "big" ? b.size - a.size : st.sort === "name" ? a.name.localeCompare(b.name) : (a.mtime < b.mtime ? 1 : -1); });''')
ed(J, '''    function list() {''', '''    function ext(n) { var e = (n.split(".").pop() || "").toLowerCase(); return e === "jpeg" ? "jpg" : e; }
    try { st.view = localStorage.getItem("wx-md-view") || "grid"; } catch (e) { st.view = "grid"; } st.type = ""; st.sort = "new";
    function stats() {
      var F = st.files, tot = F.reduce(function (a, f) { return a + f.size; }, 0), un = F.filter(function (f) { return !f.used.length; }), na = F.filter(function (f) { return !f.alt && !/\\.svg$/.test(f.name); }), bg = F.filter(function (f) { return f.size > BIG; });
      $("#md-st").innerHTML = [["all", "image", "Images", F.length, ""], ["", "hard-drive", "Storage used", kb(tot), ""], ["unused", "triangle-alert", "Not used", un.length, kb(un.reduce(function (a, f) { return a + f.size; }, 0)) + " can be freed"], ["noalt", "eye", "Missing alt text", na.length, "hurts SEO & accessibility"], ["big", "zap", "Large files", bg.length, "over 350 KB"]].map(function (x) { return '<button class="card md-stat' + (x[0] && st.filter === x[0] ? " on" : "") + '"' + (x[0] ? ' data-f="' + x[0] + '"' : " disabled") + ">" + ic(x[1]) + "<span><small>" + x[2] + "</small><b>" + x[3] + "</b>" + (x[4] ? "<em>" + x[4] + "</em>" : "") + "</span></button>"; }).join("");
      W.fillIcons($("#md-st"));
    }
    function list() {''')
# list view rendering: wrap grid output
ed(J, '''      var L = list();
      $("#md-g").innerHTML = L.length ? L.map(function (f) {''', '''      var L = list(); stats(); $$("#md-vw button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === st.view); }); $("#md-g").className = st.view === "list" ? "md-list card" : "md-grid";
      if (st.view === "list") { $("#md-g").innerHTML = L.length ? '<table class="tbl md-tbl"><thead><tr><th style="width:34px"></th><th>File</th><th>Folder</th><th>Type</th><th>Size</th><th>Used</th><th>Alt text</th><th>Added</th></tr></thead><tbody>' + L.map(function (f) { return '<tr class="md-card' + (st.sel[f.url] ? " sel" : "") + '" data-u="' + esc(f.url) + '"><td><input type="checkbox" class="md-chk"' + (st.sel[f.url] ? " checked" : "") + '></td><td><div class="md-lf"><img loading="lazy" src="' + esc(f.url) + '" alt=""><b title="' + esc(f.name) + '">' + esc(f.name) + "</b></div></td><td>" + esc(f.folder) + '</td><td><span class="badge">' + ext(f.name).toUpperCase() + '</span></td><td class="' + (f.size > BIG ? "warnc" : "") + '">' + kb(f.size) + "</td><td>" + (f.used.length ? f.used.length : '<span class="bad">unused</span>') + "</td><td>" + (f.alt ? '<span class="md-alt">' + esc(f.alt) + "</span>" : /\\.svg$/.test(f.name) ? "–" : '<span class="warnc">missing</span>') + '</td><td class="muted">' + esc(f.mtime.slice(0, 10)) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted" style="padding:16px">No images match.</p>'; W.fillIcons($("#md-f")); bulk(); return; }
      $("#md-g").innerHTML = L.length ? L.map(function (f) {''')
ed(J, '''    $("#md-flt").onchange = function () { st.filter = this.value; draw(); };''', '''    $("#md-flt").onchange = function () { st.filter = this.value; draw(); };
    $("#md-ty").onchange = function () { st.type = this.value; draw(); }; $("#md-so").onchange = function () { st.sort = this.value; draw(); };
    $("#md-vw").onclick = function (e) { var b = e.target.closest("[data-v]"); if (!b) return; st.view = b.dataset.v; try { localStorage.setItem("wx-md-view", st.view); } catch (x) {} draw(); };
    $("#md-st").onclick = function (e) { var b = e.target.closest("[data-f]"); if (!b) return; st.filter = st.filter === b.dataset.f && b.dataset.f !== "all" ? "all" : b.dataset.f; $("#md-flt").value = st.filter; draw(); };
    $("#md-ball").onclick = function () { list().forEach(function (f) { st.sel[f.url] = 1; }); draw(); };
    $("#md-bcp").onclick = function () { var t = Object.keys(st.sel).map(function (u) { return location.origin + u; }).join("\\n"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(Object.keys(st.sel).length + " URL(s) copied"); }, function () { prompt("Copy these URLs", t); }); };
    $("#md-bmv").onclick = function () {
      var urls = Object.keys(st.sel); modal('<h3>Move ' + urls.length + ' image(s)</h3><p class="muted">Only <b>unused uploads</b> can be moved, so no page ever shows a broken image. Images used on pages stay where they are.</p><label>Folder<select id="mv-to"><option value="">Uploads (main)</option>' + st.folders.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + "</option>"; }).join("") + '</select></label><div class="modal-actions"><button class="btn" data-x>Cancel</button><button class="btn pri" id="mv-go">Move</button></div>');
      $("[data-x]").onclick = closeModal;
      $("#mv-go").onclick = function () { api("media_move", { urls: urls, folder: $("#mv-to").value }).then(function (r) { if (!r.ok) return toast(r.error, true); st.sel = {}; closeModal(); toast(r.moved.length + " moved" + (r.blocked.length ? ", " + r.blocked.length + " kept (in use or site design)" : ""), !!r.blocked.length); load(); }); };
    };''')
# crop / resize button in detail
ed(J, ''''<button type="button" class="btn" data-x>Close</button>' + (svg ? "" : '<button type="button" class="btn pri" id="dt-save">Save alt text</button>')''',
''''<button type="button" class="btn" data-x>Close</button>' + (svg || /\\.gif$/.test(f.name) ? "" : '<button type="button" class="btn" id="dt-crop">' + ic("layout") + 'Crop / resize</button><button type="button" class="btn pri" id="dt-save">Save alt text</button>')''')
ed(J, '''        "</div></div></div>", "wide");
      W.fillIcons(document.querySelector("#modal-card"));
      $("[data-x]").onclick = closeModal;
''', '''        "</div></div></div>", "wide");
      W.fillIcons(document.querySelector("#modal-card"));
      $("[data-x]").onclick = closeModal;
      if ($("#dt-crop")) $("#dt-crop").onclick = function () { cropper(f); };
''')
# cropper implementation before detail()
ed(J, '''    // detail
    function detail(f) {''', r'''    /** P17 C9: crop / resize → saved as a NEW WebP copy (original untouched) */
    function cropper(f) {
      var R = [["free", "Free"], [16 / 9, "16:9"], [4 / 3, "4:3"], [1, "1:1"], [3 / 4, "3:4"], [1200 / 630, "Social 1200×630"]], ratio = "free";
      modal('<h3>Crop &amp; resize</h3><p class="muted">Drag the box (or its corner) to choose the area. Saves a <b>new WebP copy</b>; the original stays as it is.</p><div class="seg" id="cr-r">' + R.map(function (x, i) { return '<button data-i="' + i + '"' + (i ? "" : ' class="on"') + ">" + x[1] + "</button>"; }).join("") + '</div><div class="cr-stage" id="cr-s"><img id="cr-img" src="' + esc(f.url) + "?v=" + Date.now() + '" alt=""><div class="cr-box" id="cr-b"><i class="cr-h"></i></div></div><div class="cr-row"><label>Output width <input id="cr-w" type="number" min="200" max="2400" step="10"> px</label><span class="muted" id="cr-info"></span><label>Quality <input id="cr-q" type="range" min="60" max="95" value="82"></label></div><div class="modal-actions"><button class="btn" data-x>Cancel</button><button class="btn pri" id="cr-go">' + ic("check") + "Save as new image</button></div>", "wide");
      W.fillIcons($("#modal-card")); $("[data-x]").onclick = closeModal;
      var img = $("#cr-img"), box = $("#cr-b"), S = $("#cr-s"), b = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, nw = 0, nh = 0;
      function info() { var cw = Math.round(b.w * nw), ch = Math.round(b.h * nh), ow = Math.min(+$("#cr-w").value || cw, cw); $("#cr-info").textContent = "Area " + cw + " × " + ch + " px → output " + ow + " × " + Math.round(ow * ch / cw) + " px"; }
      function put() { box.style.left = b.x * 100 + "%"; box.style.top = b.y * 100 + "%"; box.style.width = b.w * 100 + "%"; box.style.height = b.h * 100 + "%"; info(); }
      function fit() { if (ratio === "free") return put(); var r = ratio * nh / nw; b.w = Math.min(b.w, 1 - b.x); b.h = b.w / r; if (b.y + b.h > 1) { b.h = 1 - b.y; b.w = b.h * r; } if (b.w > 1) { b.w = 1; b.h = 1 / r; } put(); }
      img.onload = function () { nw = img.naturalWidth; nh = img.naturalHeight; $("#cr-w").value = Math.min(nw, 2000); put(); };
      $("#cr-w").oninput = info;
      $("#cr-r").onclick = function (e) { var x = e.target.closest("[data-i]"); if (!x) return; $$("#cr-r button").forEach(function (y) { y.classList.toggle("on", y === x); }); ratio = R[+x.dataset.i][0]; b = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }; fit(); };
      var drag = null;
      box.onpointerdown = function (e) { e.preventDefault(); box.setPointerCapture(e.pointerId); drag = { mode: e.target.classList.contains("cr-h") ? "size" : "move", sx: e.clientX, sy: e.clientY, b: Object.assign({}, b) }; };
      box.onpointermove = function (e) { if (!drag) return; var r = S.getBoundingClientRect(), dx = (e.clientX - drag.sx) / r.width, dy = (e.clientY - drag.sy) / r.height, o = drag.b;
        if (drag.mode === "move") { b.x = Math.max(0, Math.min(1 - o.w, o.x + dx)); b.y = Math.max(0, Math.min(1 - o.h, o.y + dy)); }
        else { b.w = Math.max(0.05, Math.min(1 - o.x, o.w + dx)); b.h = ratio === "free" ? Math.max(0.05, Math.min(1 - o.y, o.h + dy)) : b.w * nw / ratio / nh; if (b.y + b.h > 1) { b.h = 1 - b.y; if (ratio !== "free") b.w = b.h * ratio * nh / nw; } }
        put(); };
      box.onpointerup = function () { drag = null; };
      $("#cr-go").onclick = function () {
        var bt = this, cw = Math.round(b.w * nw), ch = Math.round(b.h * nh), ow = Math.max(50, Math.min(+$("#cr-w").value || cw, cw)), oh = Math.round(ow * ch / cw), c = document.createElement("canvas"); c.width = ow; c.height = oh;
        var g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, Math.round(b.x * nw), Math.round(b.y * nh), cw, ch, 0, 0, ow, oh);
        bt.disabled = true; c.toBlob(function (blob) {
          if (!blob) { bt.disabled = false; return toast("This browser could not create the image", true); }
          blobToB64(blob).then(function (b64) { var fo = /^\/assets\/uploads\/([a-z0-9-]+)\//.exec(f.url); return api("media_upload", { data: b64, name: f.name.replace(/\.[a-z0-9]+$/i, "") + "-" + ow + "w.webp", folder: fo ? fo[1] : "", alt: f.alt || "" }); })
            .then(function (r) { bt.disabled = false; if (!r.ok) return toast(r.error, true); closeModal(); toast("Saved new image " + ow + "×" + oh + " (" + kb(r.size) + ")"); load().then(function () { var nf = st.files.find(function (x) { return x.url === r.url; }); if (nf) detail(nf); }); });
        }, "image/webp", +$("#cr-q").value / 100);
      };
    }
    // detail
    function detail(f) {''')
print('media ok')
