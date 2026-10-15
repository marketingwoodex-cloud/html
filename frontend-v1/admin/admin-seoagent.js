/* P41 — SEO agent: scan all pages, prioritised fixes, AI proposals (Claude / OpenAI-Codex / Hermes / local), review + apply. API: sag_* */
(function () {
  var W = window.WXA; if (!W) return;
  var V = W.VIEWS, api = W.api, esc = W.esc, toast = W.toast, ic = W.ic;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  var D = null, flt = "all", Q = {}; // Q: proposals by issue id
  var SEV = { 3: ["Urgent", "bad"], 2: ["Important", "warn"], 1: ["Minor", ""] };
  var KIND = { title: "Title", desc: "Description", alt: "Image alt", h1: "H1", kw: "Keyphrase", thin: "Content", schema: "Schema", canonical: "Canonical" };
  function nice(s) { if (!s) return ""; var d = new Date(s.replace(" ", "T")); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  function url(rel) { return "/" + rel.replace(/index\.html$/, ""); }

  V.seoagent = function (el) {
    el.innerHTML = W.head("SEO agent", "Website / SEO agent", '<button class="btn pri" id="sa-scan">' + ic("search") + "Scan all pages</button>") + '<div id="sa-b"><div class="card"><div class="empty">Loading…</div></div></div>';
    $("#sa-scan").onclick = scan; W.fillIcons(el);
    api("sag_get").then(function (r) { if (!r.ok) { $("#sa-b").innerHTML = '<div class="card"><div class="empty">' + esc(r.error) + "</div></div>"; return; } D = r; draw(); });
  };
  function scan() {
    var b = $("#sa-scan"); b.disabled = true; b.textContent = "Scanning…";
    api("sag_scan").then(function (r) { b.disabled = false; b.innerHTML = ic("search") + "Scan all pages"; W.fillIcons(b.parentNode); if (!r.ok) return toast(r.error, true); D.last = r.last; D.history = r.history; Q = {}; draw(); toast("Scan done: " + r.last.issues.length + " things to improve"); });
  }
  function draw() {
    var b = $("#sa-b"); if (!b) return; var L = D.last, E = D.engines, cur = D.cfg.engine || E.default;
    var eng = '<div class="card" style="margin-bottom:14px"><div class="card-b" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' + ic("sparkles") +
      '<div style="flex:1;min-width:220px"><b>AI engine</b><br><small class="muted">The agent writes fixes with this model. Keys are set in Blog &amp; insights → AI settings.</small></div>' +
      '<select id="sa-eng" style="width:auto;margin:0">' + E.list.map(function (x) { return '<option value="' + x.id + '"' + (x.id === cur ? " selected" : "") + ">" + esc(x.label) + (x.ready ? "" : " (no key)") + "</option>"; }).join("") + "</select>" +
      '<input id="sa-mod" value="' + esc(D.cfg.model || "") + '" placeholder="Model (optional) e.g. ' + esc((E.list.filter(function (x) { return x.id === cur; })[0] || {}).model || "") + '" style="width:230px;margin:0">' +
      '<label class="check" style="margin:0"><input type="checkbox" id="sa-wk"' + (D.cfg.weekly ? " checked" : "") + "><span>Weekly check + Telegram report</span></label>" +
      '<button class="btn" id="sa-esv">Save</button><a class="btn" href="#/blog">AI keys</a></div></div>';
    if (!L) { b.innerHTML = eng + '<div class="card"><div class="empty">No scan yet. Click <b>Scan all pages</b>: the agent checks titles, descriptions, headings, keyphrases, image alt text, thin pages, schema and canonical links on every page.</div></div>'; W.fillIcons(b); bindEng(); return; }
    var col = L.score >= 85 ? "#11692f" : L.score >= 65 ? "#8a5a00" : "#b42318", hist = (D.history || []).slice(-8);
    var head = '<div class="sa-top"><div class="card sa-sc"><div class="card-b"><div class="sa-ring" style="--v:' + L.score + ";--c:" + col + '"><b>' + L.score + "</b><small>/100</small></div><div><b>Site SEO health</b><br><small class=\"muted\">" + L.pages + " pages · scanned " + nice(L.at) + "</small>" +
      (hist.length > 1 ? '<div class="sa-sp">' + hist.map(function (h) { return '<i title="' + esc(h.at) + ": " + h.score + '" style="height:' + Math.max(8, h.score * 0.34) + 'px"></i>'; }).join("") + "</div>" : "") + "</div></div></div>" +
      ["3", "2", "1"].map(function (k) { var n = L.issues.filter(function (x) { return String(x.sev) === k; }).length; return '<button class="card sa-k' + (flt === k ? " on" : "") + '" data-f="' + k + '"><div class="card-b"><b>' + n + "</b><span>" + SEV[k][0] + "</span></div></button>"; }).join("") + "</div>";
    var I = L.issues.filter(function (x) { return flt === "all" || String(x.sev) === flt || (flt === "ai" && !x.manual); });
    var fixable = L.issues.filter(function (x) { return !x.manual; }).length;
    var bar = '<div class="toolbar" style="margin:14px 0 10px;align-items:center"><div class="seg" id="sa-f"><button data-f="all"' + (flt === "all" ? ' class="on"' : "") + ">All " + L.issues.length + '</button><button data-f="ai"' + (flt === "ai" ? ' class="on"' : "") + ">AI can fix " + fixable + "</button></div><span style=\"flex:1\"></span>" +
      '<button class="btn" id="sa-auto"' + (fixable ? "" : " disabled") + ">" + ic("sparkles") + "Write fixes for the top 10</button></div>";
    var groups = {}; I.slice(0, 200).forEach(function (x) { (groups[x.page] = groups[x.page] || []).push(x); });
    var list = Object.keys(groups).length ? '<div class="card">' + Object.keys(groups).map(function (pg) {
      return '<div class="sa-pg"><div class="sa-pgh"><b>' + esc(url(pg)) + '</b><a class="muted" href="' + esc(url(pg)) + '" target="_blank" rel="noopener">open ↗</a></div>' + groups[pg].map(row).join("") + "</div>";
    }).join("") + "</div>" : '<div class="card"><div class="empty">Nothing here. 🎉</div></div>';
    b.innerHTML = eng + head + bar + list + '<p class="muted" style="font-size:12.5px;margin-top:10px">The agent only changes titles, meta descriptions and image alt text, and only when you click Apply. Every change backs up the page first. Body text and headings stay in your hands (Page builder / Blog editor).</p>';
    W.fillIcons(b); bindEng(); bind(b);
  }
  function row(x) {
    var s = SEV[x.sev], p = Q[x.id];
    var h = '<div class="sa-row" data-id="' + x.id + '"><div class="sa-rh"><span class="badge ' + s[1] + '">' + s[0] + '</span><span class="sa-kd">' + (KIND[x.kind] || x.kind) + "</span><span style=\"flex:1\">" + esc(x.msg) + "</span>" +
      (x.manual ? '<small class="muted">fix by hand</small>' : '<button class="btn sm" data-ai>' + ic("sparkles") + (p ? "Rewrite" : "Write fix") + "</button>") + "</div>";
    if (p && p.alt != null) h += '<div class="sa-fx"><label>New alt text<input data-alt value="' + esc(p.alt) + '"></label><div class="toolbar"><button class="btn sm pri" data-ap>' + ic("check") + "Apply</button></div></div>";
    else if (p) h += '<div class="sa-fx"><div class="sa-old"><small>Now</small><div>' + esc(p.old.title || "(no title)") + "</div><div class=\"muted\">" + esc(p.old.desc || "(no description)") + "</div></div>" +
      '<label>New title <small class="muted" data-tc></small><input data-t value="' + esc(p.title) + '"></label><label>New description <small class="muted" data-dc></small><textarea rows="2" data-d>' + esc(p.desc) + "</textarea></label>" +
      (p.why ? '<small class="muted">💡 ' + esc(p.why) + (p.kw ? " · keyphrase: <b>" + esc(p.kw) + "</b>" : "") + "</small>" : "") +
      '<div class="toolbar"><button class="btn sm pri" data-ap>' + ic("check") + "Apply</button></div></div>";
    return h + "</div>";
  }
  function bindEng() {
    $("#sa-esv").onclick = function () { api("sag_cfg_save", { cfg: { engine: $("#sa-eng").value, model: $("#sa-mod").value, weekly: $("#sa-wk").checked } }).then(function (r) { if (r.pending) return toast("Sent to Master for approval"); if (!r.ok) return toast(r.error, true); D.cfg = r.cfg; toast("Saved ✓"); }); };
  }
  function propose(x, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Writing…"; }
    return api("sag_propose", { issue: x, engine: $("#sa-eng") && $("#sa-eng").value }).then(function (r) { if (btn) btn.disabled = false; if (!r.ok) { toast(r.error, true); return false; } Q[x.id] = r.fix; return true; });
  }
  function bind(b) {
    $$("[data-f]", b).forEach(function (x) { x.onclick = function () { flt = flt === x.dataset.f && x.classList.contains("sa-k") ? "all" : x.dataset.f; draw(); }; });
    var find = function (id) { return D.last.issues.filter(function (q) { return q.id === id; })[0]; };
    $$(".sa-row", b).forEach(function (r) {
      var x = find(r.dataset.id), ai = $("[data-ai]", r), ap = $("[data-ap]", r);
      if (ai) ai.onclick = function () { propose(x, ai).then(function (ok) { if (ok) draw(); }); };
      var t = $("[data-t]", r), d = $("[data-d]", r), cnt = function () { if (t) $("[data-tc]", r).textContent = "(" + t.value.length + "/60)"; if (d) $("[data-dc]", r).textContent = "(" + d.value.length + "/155)"; };
      if (t) { t.oninput = cnt; d.oninput = cnt; cnt(); }
      if (ap) ap.onclick = function () {
        var p = Q[x.id], fix = p.alt != null ? { alt: $("[data-alt]", r).value, src: x.src } : { title: t.value, desc: d.value, kw: p.kw };
        // one title/description fix also solves the page's other title/description issues
        var ids = D.last.issues.filter(function (q) { return q.page === x.page && (p.alt != null ? q.id === x.id : (q.kind === "title" || q.kind === "desc")); }).map(function (q) { return q.id; });
        ap.disabled = true;
        api("sag_fix_save", { page: x.page, fix: fix, ids: ids }).then(function (y) { ap.disabled = false; if (y.pending) { toast("Sent to Master for approval"); return; } if (!y.ok) return toast(y.error, true);
          D.last.issues = D.last.issues.filter(function (q) { return ids.indexOf(q.id) < 0; }); ids.forEach(function (i) { delete Q[i]; }); toast("Applied ✓ (page backed up)"); draw(); });
      };
    });
    var au = $("#sa-auto", b); if (au) au.onclick = function () {
      var seen = {}, todo = D.last.issues.filter(function (x) { if (x.manual || Q[x.id]) return false; var k = x.kind === "alt" ? x.id : x.page + ":meta"; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 10);
      if (!todo.length) return toast("Fixes are already written below");
      au.disabled = true; var n = 0; au.textContent = "Writing 0/" + todo.length + "…";
      (function next() { if (n >= todo.length) { au.disabled = false; flt = "ai"; draw(); toast("Review the fixes and click Apply on the ones you like"); return; }
        propose(todo[n]).then(function () { n++; au.textContent = "Writing " + n + "/" + todo.length + "…"; next(); }); })();
    };
  }
  var css = document.createElement("style");
  css.textContent = ".sa-top{display:grid;grid-template-columns:minmax(260px,2fr) repeat(3,minmax(0,1fr));gap:12px}@media(max-width:900px){.sa-top{grid-template-columns:1fr 1fr}}" +
    ".sa-sc .card-b{display:flex;gap:16px;align-items:center}.sa-ring{width:78px;height:78px;border-radius:50%;flex:none;display:grid;place-items:center;align-content:center;background:conic-gradient(var(--c) calc(var(--v)*1%),var(--line) 0);position:relative}.sa-ring:before{content:'';position:absolute;inset:7px;border-radius:50%;background:var(--card)}.sa-ring b,.sa-ring small{position:relative;line-height:1}.sa-ring b{font-size:22px}.sa-ring small{font-size:10px;color:var(--mut)}" +
    ".sa-sp{display:flex;gap:3px;align-items:flex-end;height:36px;margin-top:6px}.sa-sp i{width:8px;background:#b8956a;border-radius:2px;opacity:.8}" +
    ".sa-k{border:1px solid var(--line);cursor:pointer;text-align:left;font:inherit;color:inherit;padding:0}.sa-k .card-b{display:flex;flex-direction:column}.sa-k b{font-size:24px}.sa-k span{font-size:12.5px;color:var(--mut)}.sa-k.on{border-color:#b8956a;box-shadow:0 0 0 1px #b8956a inset}" +
    ".sa-pg{border-bottom:1px solid var(--line);padding:10px 16px}.sa-pg:last-child{border-bottom:0}.sa-pgh{display:flex;gap:10px;align-items:baseline;margin-bottom:4px}.sa-pgh a{font-size:12px}" +
    ".sa-row{padding:6px 0}.sa-rh{display:flex;gap:8px;align-items:center;font-size:13.5px;flex-wrap:wrap}.sa-kd{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;min-width:78px}" +
    ".sa-fx{margin:8px 0 6px;padding:10px 12px;border:1px dashed #b8956a;border-radius:10px;background:#fffaf0}.sa-fx label{margin:6px 0}.sa-fx .toolbar{justify-content:flex-end;margin-top:6px}.sa-old{font-size:12.5px;margin-bottom:6px}.sa-old small{font-weight:700;color:var(--mut)}";
  document.head.appendChild(css);
  W.route();
})();
