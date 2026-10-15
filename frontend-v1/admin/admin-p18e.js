/* Woodex Admin — P18 E: Content → Estimator (rate book, formula, live preview) and Content → Forms (where each form is used,
 * fields, submissions, where alerts go, auto-reply to the customer). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var api = W.api, esc = W.esc, ic = W.ic, $ = W.$, $$ = W.$$, toast = W.toast;
  var css = document.createElement("style");
  css.textContent =
    ".es-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,1fr);gap:20px;align-items:start}@media(max-width:1100px){.es-grid{grid-template-columns:1fr}}" +
    ".es-tbl input,.es-tbl select{margin:0;min-height:38px;font-size:13.5px}.es-tbl td{vertical-align:top;padding:6px 6px}.es-tbl .num{width:110px;text-align:right}.es-tbl th{font-size:12px;white-space:nowrap}" +
    ".es-svc{border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--card,#fff)}.es-svc .r{display:grid;grid-template-columns:1.2fr 1.6fr .8fr 1fr;gap:8px}.es-svc .r2{display:grid;grid-template-columns:repeat(3,1fr) auto;gap:8px;margin-top:8px;align-items:end}" +
    ".es-svc small{display:block;font-size:11.5px;color:var(--mut);margin-bottom:2px}.es-svc input,.es-svc select{margin:0}.es-svc .bad{border-color:#e11d48}" +
    ".es-prev{position:sticky;top:12px}.es-out{background:#0c1628;color:#fff;border-radius:14px;padding:18px;margin-top:12px}.es-out small{opacity:.7;display:block;font-size:12px}.es-out b{font-size:22px;display:block;margin:2px 0 10px}.es-out .row{display:flex;gap:16px}.es-out .row>div{flex:1}" +
    ".es-tp{display:grid;gap:14px}.es-tp-r>b{display:block;font-size:13px;margin-bottom:6px}.es-chips{display:flex;flex-wrap:wrap;gap:6px}.es-sv{display:inline-flex;gap:2px}.es-inl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}.es-inl input{margin:0;max-width:280px}" +
    ".es-f{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--bg,#f6f6f7);border-radius:10px;padding:10px 12px;line-height:1.6}" +
    ".fm-card{border:1px solid var(--line,#e5e7eb);border-radius:14px;background:var(--card,#fff);margin-bottom:14px;overflow:hidden}.fm-h{display:flex;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line,#e5e7eb)}.fm-h h3{margin:0;font-size:15px}.fm-h .sp{flex:1}" +
    ".fm-stat{font-size:12.5px;color:var(--mut)}.fm-stat b{color:var(--txt,#111);font-size:15px}.fm-b{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:14px 16px}@media(max-width:900px){.fm-b{grid-template-columns:1fr}}" +
    ".fm-chips{display:flex;flex-wrap:wrap;gap:6px}.fm-chips span,.fm-chips a{font-size:12px;padding:3px 8px;border-radius:999px;background:var(--bg,#f4f4f5);color:inherit;text-decoration:none}.fm-b h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}";
  document.head.appendChild(css);

  var FIN = ["essential", "standard", "premium"];
  var fmt = function (n) { n = Math.round(n); if (n >= 10000000) return "Rs " + (n / 10000000).toFixed(n % 10000000 ? 1 : 0).replace(/\.0$/, "") + " crore"; if (n >= 100000) return "Rs " + (n / 100000).toFixed(n % 100000 ? 1 : 0).replace(/\.0$/, "") + " lac"; return "Rs " + n.toLocaleString("en-PK"); };

  // ================================================================ Estimator
  /* P19 F8: ready-made service templates (starting figures, PKR, Lahore 2026 — review before publishing) */
  var EST_LIB = [
    ["Kitchen", "Cabinets, counter, hardware and fitting", "sqft", "Kitchen area (sq ft)", 3500, 5500, 9000],
    ["Wardrobes & storage", "Built-in wardrobes, per sq ft of front", "sqft", "Wardrobe front (sq ft)", 2200, 3500, 5500],
    ["Bedroom interior", "Bed wall, wardrobe, ceiling and lighting", "sqft", "Room area (sq ft)", 1800, 3000, 5000],
    ["Living & lounge", "TV wall, ceiling, lighting, loose furniture", "sqft", "Area (sq ft)", 2000, 3200, 5200],
    ["Complete home interior", "All rooms, turnkey", "sqft", "Covered area (sq ft)", 2400, 3800, 6200],
    ["Restaurant / café fit-out", "Kitchen-ready shell to opening day", "sqft", "Area (sq ft)", 3500, 5500, 8500],
    ["Salon / clinic fit-out", "Stations, plumbing, lighting, branding", "sqft", "Area (sq ft)", 3000, 4800, 7500],
    ["Retail shop fit-out", "Display, lighting, signage, flooring", "sqft", "Area (sq ft)", 2600, 4200, 6800],
    ["Front elevation", "Facade design and execution", "sqft", "Facade area (sq ft)", 900, 1600, 2800],
    ["Grey structure", "Construction up to grey structure", "sqft", "Covered area (sq ft)", 2600, 3000, 3600],
    ["House construction (complete)", "Grey structure + finishing", "sqft", "Covered area (sq ft)", 5200, 6800, 9500],
    ["False ceiling", "Gypsum / board ceiling with cove", "sqft", "Ceiling area (sq ft)", 180, 280, 450],
    ["Flooring", "Tiles, wood or marble, laid", "sqft", "Floor area (sq ft)", 350, 700, 1400],
    ["3D renders", "Photo-real 3D views", "views", "Number of views", 8000, 15000, 25000]
  ];
  W.VIEWS.estimator = function (el) {
    el.innerHTML = W.head("Estimator", "Content", '<a class="btn" href="/estimator/" target="_blank" rel="noopener">' + ic("external-link") + 'Open estimator page</a><button class="btn pri" id="es-save">' + ic("save") + "Save &amp; publish</button>") + '<div class="empty">Loading the rate book…</div>';
    W.fillIcons(el);
    var R = null, orig = "", pv = { s: 0, f: "standard", q: 1000 }, TP = null;
    api("est_tpls").then(function (r) { TP = r.ok ? r.templates : []; if (R && el.querySelector(".es-grid")) { collect(); draw(); } });
    var s0 = document.createElement("script"); s0.src = "/assets/js/estimator-rates.js?v=" + Date.now();
    s0.onload = function () { R = JSON.parse(JSON.stringify(window.WX_RATES || { services: [], finishes: [] })); R.catalog = R.catalog || []; R.terms = R.terms || []; orig = JSON.stringify(R); draw(); };
    s0.onerror = function () { el.querySelector(".empty").textContent = "Could not load /assets/js/estimator-rates.js"; };
    document.head.appendChild(s0);
    function draw() {
      var box = el.querySelector(".empty") || el.querySelector(".es-grid"); var g = document.createElement("div"); g.className = "es-grid";
      var fin = function (k) { return R.finishes.filter(function (f) { return f.key === k; })[0] || { key: k, label: k, hint: "" }; };
      g.innerHTML = '<div><div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + ic("layers") + ' Templates</h3><small class="muted">nothing goes live until you press Save &amp; publish</small></div><div class="card-b es-tp">' +
        '<div class="es-tp-r"><b>1. Add a ready-made service</b><div class="es-chips">' + EST_LIB.map(function (t, i) { var have = R.services.some(function (s) { return s.label.toLowerCase() === t[0].toLowerCase(); }); return '<button class="btn sm' + (have ? " ghost" : "") + '" data-lib="' + i + '"' + (have ? " disabled title=\"Already in the list\"" : "") + ">" + (have ? "✓ " : "+ ") + esc(t[0]) + "</button>"; }).join("") + "</div></div>" +
        '<div class="es-tp-r"><b>2. Saved rate books</b><div class="es-chips" id="es-saved">' + (TP === null ? '<span class="muted">Loading…</span>' : TP.length ? TP.map(function (t) { return '<span class="es-sv"><button class="btn sm" data-tap="' + esc(t.name) + '" title="Saved ' + esc(String(t.at).slice(0, 16)) + '">' + esc(t.name) + " · " + t.rates.services.length + '</button><button class="btn sm ghost" data-tdel="' + esc(t.name) + '" title="Delete">✕</button></span>'; }).join("") : '<span class="muted">None yet. Save the current rates as e.g. “2026 standard” before big changes.</span>') + '</div><div class="es-inl"><input id="es-tn" placeholder="Template name, e.g. 2026 standard"><button class="btn sm" id="es-tsave">' + ic("save") + "Save current as template</button></div></div>" +
        '<div class="es-tp-r"><b>3. Adjust all rates</b><div class="es-inl"><input id="es-pct" type="number" step="1" value="8" style="max-width:90px"> %<button class="btn sm" id="es-padj">Apply to every service</button><small class="muted">e.g. 8 for yearly increase, −5 for a promotion. Rounded to 10.</small></div></div></div></div>' +
        '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Services &amp; rates (PKR)</h3><button class="btn sm" id="es-add">' + ic("plus") + "Service</button></div><div class=\"card-b\" id=\"es-svcs\">" +
        R.services.map(function (s, i) {
          return '<div class="es-svc" data-i="' + i + '"><div class="r"><label><small>Service name</small><input data-k="label" value="' + esc(s.label) + '"></label><label><small>Short description</small><input data-k="hint" value="' + esc(s.hint || "") + '"></label>' +
            '<label><small>Priced per</small><select data-k="unit"><option value="sqft"' + (s.unit !== "views" ? " selected" : "") + '>sq ft</option><option value="views"' + (s.unit === "views" ? " selected" : "") + '>view (3D)</option></select></label><label><small>Quantity label</small><input data-k="unitLabel" value="' + esc(s.unitLabel || "") + '"></label></div>' +
            '<div class="r2">' + FIN.map(function (k) { return '<label><small>' + esc(fin(k).label) + " rate</small><input type=\"number\" min=\"0\" step=\"10\" data-r=\"" + k + '" value="' + (s.rates[k] || 0) + '"></label>'; }).join("") +
            '<span style="display:flex;gap:4px"><button class="btn sm" data-mv="' + i + '|-1" title="Move up">↑</button><button class="btn sm" data-mv="' + i + '|1" title="Move down">↓</button><button class="btn sm danger" data-rm="' + i + '" title="Remove">✕</button></span></div></div>';
        }).join("") + "</div></div>" +
        '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Finish levels</h3></div><div class="card-b"><table class="tbl es-tbl"><thead><tr><th>Level</th><th>Name shown</th><th>Description</th></tr></thead><tbody>' +
        FIN.map(function (k) { var f = fin(k); return "<tr><td><b>" + k + '</b></td><td><input data-fk="' + k + '" data-ff="label" value="' + esc(f.label) + '"></td><td><input data-fk="' + k + '" data-ff="hint" value="' + esc(f.hint || "") + '"></td></tr>'; }).join("") + "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><h3>Quotation terms</h3><small class="muted">used by the quotation builder · one per line</small></div><div class="card-b"><textarea id="es-terms" rows="4" style="margin:0">' + esc(R.terms.join("\n")) + '</textarea><p class="muted" style="margin:8px 0 0;font-size:12.5px">' + R.catalog.length + " line items in the quotation catalogue are kept as they are.</p></div></div></div>" +
        '<div class="es-prev"><div class="card"><div class="card-h"><h3>Formula &amp; live preview</h3></div><div class="card-b">' +
        '<div class="es-f">Range from = <b>Essential rate</b> × quantity<br>Range to = <b>Premium rate</b> × quantity<br>Your selection = <b>chosen level rate</b> × quantity</div>' +
        '<label style="margin-top:12px;display:block">Service<select id="pv-s">' + R.services.map(function (s, i) { return '<option value="' + i + '"' + (i === pv.s ? " selected" : "") + ">" + esc(s.label) + "</option>"; }).join("") + "</select></label>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Quantity<input id="pv-q" type="number" min="1" value="' + pv.q + '"></label><label>Finish<select id="pv-f">' + FIN.map(function (k) { return '<option value="' + k + '"' + (k === pv.f ? " selected" : "") + ">" + esc(fin(k).label) + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="es-out" id="pv-out"></div><p class="muted" style="font-size:12px;margin:10px 0 0">The public page shows the same figures. Visitors see “starting range — final quote after a site visit”.</p></div></div></div>';
      box.replaceWith(g); W.fillIcons(g); prev(); dirty();
    }
    function prev() {
      var o = $("#pv-out"); if (!o || !R.services.length) return; var s = R.services[Math.min(pv.s, R.services.length - 1)], q = +pv.q || 0;
      o.innerHTML = '<div class="row"><div><small>From</small><b>' + fmt(s.rates.essential * q) + '</b></div><div><small>To</small><b>' + fmt(s.rates.premium * q) + "</b></div></div><small>Selection · " + esc(s.label) + " · " + q.toLocaleString("en-PK") + (s.unit === "views" ? " views" : " sq ft") + "</small><b style=\"font-size:18px;margin:2px 0 0\">" + fmt((s.rates[pv.f] || 0) * q) + "</b>";
      $$(".es-svc", el).forEach(function (c) { var x = R.services[+c.dataset.i]; if (!x) return; var bad = !(x.rates.essential > 0 && x.rates.essential <= x.rates.standard && x.rates.standard <= x.rates.premium); $$("[data-r]", c).forEach(function (inp) { inp.classList.toggle("bad", bad); inp.title = bad ? "Rates must go up: Essential ≤ Standard ≤ Premium" : ""; }); });
    }
    function dirty() { var b = $("#es-save"); if (b) b.classList.toggle("pri", JSON.stringify(collect()) !== orig || true); }
    function collect() { if (!R) return null; var t = $("#es-terms"); if (t) R.terms = t.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); return R; }
    el.addEventListener("input", function (e) {
      var t = e.target, c = t.closest(".es-svc");
      if (c) { var s = R.services[+c.dataset.i]; if (t.dataset.k) s[t.dataset.k] = t.value; if (t.dataset.r) s.rates[t.dataset.r] = +t.value || 0; if (t.dataset.k === "label") { var o = $('#pv-s option[value="' + c.dataset.i + '"]'); if (o) o.textContent = t.value; } }
      if (t.dataset.fk) { var f = R.finishes.filter(function (x) { return x.key === t.dataset.fk; })[0]; if (!f) R.finishes.push(f = { key: t.dataset.fk, label: "", hint: "" }); f[t.dataset.ff] = t.value; }
      if (t.id === "pv-q") pv.q = +t.value || 0;
      prev();
    });
    el.addEventListener("change", function (e) { var t = e.target; if (t.id === "pv-s") pv.s = +t.value; if (t.id === "pv-f") pv.f = t.value; if (t.dataset.k === "unit") { var s = R.services[+t.closest(".es-svc").dataset.i]; if (!s.unitLabel || /^(Area \(sq ft\)|Number of views)$/.test(s.unitLabel)) s.unitLabel = t.value === "views" ? "Number of views" : "Area (sq ft)"; draw(); return; } prev(); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !R) return;
      if (b.dataset.lib) { var t = EST_LIB[+b.dataset.lib]; collect(); R.services.push({ key: "", label: t[0], hint: t[1], unit: t[2], unitLabel: t[3], rates: { essential: t[4], standard: t[5], premium: t[6] } }); pv.s = R.services.length - 1; draw(); toast(t[0] + " added. Check the rates, then Save & publish"); return; }
      if (b.id === "es-tsave") { var nm = $("#es-tn").value.trim(); if (!nm) return toast("Type a template name first", true); api("est_tpl_save", { name: nm, rates: collect() }).then(function (r) { if (!r.ok) return toast(r.error, true); TP = r.templates; collect(); draw(); toast("Template “" + nm + "” saved ✓"); }); return; }
      if (b.dataset.tap) { var tp = (TP || []).filter(function (x) { return x.name === b.dataset.tap; })[0]; if (!tp || !confirm("Replace the rates on screen with “" + tp.name + "”? (Not live until you press Save & publish)")) return; R = JSON.parse(JSON.stringify(tp.rates)); R.catalog = R.catalog || []; R.terms = R.terms || []; pv.s = 0; draw(); toast("“" + tp.name + "” loaded. Press Save & publish to make it live"); return; }
      if (b.dataset.tdel) { if (!confirm("Delete template “" + b.dataset.tdel + "”?")) return; api("est_tpl_save", { name: b.dataset.tdel, delete: 1 }).then(function (r) { if (r.ok) { TP = r.templates; collect(); draw(); } }); return; }
      if (b.id === "es-padj") { var pc = +$("#es-pct").value || 0; if (!pc) return; collect(); R.services.forEach(function (s) { ["essential", "standard", "premium"].forEach(function (k) { s.rates[k] = Math.max(10, Math.round(s.rates[k] * (1 + pc / 100) / 10) * 10); }); }); draw(); toast("All rates " + (pc > 0 ? "+" : "") + pc + "%. Press Save & publish to make it live"); return; }
      if (b.id === "es-add") { collect(); R.services.push({ key: "", label: "New service", hint: "", unit: "sqft", unitLabel: "Area (sq ft)", rates: { essential: 1000, standard: 1500, premium: 2500 } }); pv.s = R.services.length - 1; draw(); setTimeout(function () { var x = $$(".es-svc", el).pop(); x.scrollIntoView({ block: "center" }); x.querySelector("input").select(); }, 30); }
      else if (b.dataset.rm) { if (R.services.length < 2) return toast("Keep at least one service", true); if (!confirm("Remove “" + R.services[+b.dataset.rm].label + "” from the estimator?")) return; collect(); R.services.splice(+b.dataset.rm, 1); pv.s = 0; draw(); }
      else if (b.dataset.mv) { var q = b.dataset.mv.split("|"), i = +q[0], to = i + +q[1]; if (to < 0 || to >= R.services.length) return; collect(); R.services.splice(to, 0, R.services.splice(i, 1)[0]); draw(); }
      else if (b.id === "es-save") { b.disabled = true; api("est_save", { rates: collect() }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); R = r.rates; orig = JSON.stringify(R); window.WX_RATES = JSON.parse(orig); draw(); toast("Estimator updated — the public page shows the new rates now ✓"); }); }
    });
  };

  // ================================================================ Forms
  W.VIEWS.forms = function (el) {
    el.innerHTML = W.head("Forms", "Content", '<button class="btn pri" id="fm-save">' + ic("save") + "Save</button>") + '<div id="fm-l"><div class="empty">Loading…</div></div>';
    W.fillIcons(el);
    var D = null;
    api("forms_get").then(function (r) {
      if (!r.ok) return ($("#fm-l").innerHTML = '<div class="empty">' + esc(r.error) + "</div>"); D = r; var d = r.defaults;
      $("#fm-l").innerHTML = '<div class="card fm-def"><div class="card-h"><h3>' + ic("send") + ' Default alerts (used when a form has no own email / number)</h3></div><div class="card-b"><div class="g2"><label>Default alert email(s)<input id="fm-de" value="' + esc(d.emailTo || "") + '" placeholder="woodexinterior.pk@gmail.com"></label><label class="check" style="align-self:end"><input type="checkbox" id="fm-deon"' + (d.emailOn ? " checked" : "") + '> Send email alerts</label></div>' + (!d.emailTo ? '<p class="err" style="margin:6px 0 0">No default email yet. Type one above and press Save, otherwise enquiries only show in the admin.</p>' : "") + (!d.smtpReady ? '<p class="muted" style="margin:6px 0 0">Email sending needs mail settings (SMTP) in <a href="#/leads">Enquiries → Alerts &amp; spam</a>.</p>' : "") + '<p class="muted" style="margin:6px 0 0">WhatsApp alerts: ' + (d.waOn && d.waReady ? "on" + (d.waTo ? " → " + esc(d.waTo) : "") : 'off (connect WhatsApp in <a href="#/offers">WhatsApp</a>)') + ". Auto-replies use the “Enquiry received” message from <a href=\"#/updates\">Client updates</a> unless you write a custom one.</p></div></div>" +
        r.forms.map(function (f) { var c = f.cfg;
          return '<div class="fm-card" data-id="' + esc(f.id) + '"><div class="fm-h"><span class="ic-box">' + ic("file-text") + "</span><div><h3>" + esc(f.label) + '</h3><span class="fm-stat">' + (f.last ? "last " + esc(W.ago ? W.ago(f.last) : f.last) : "no submissions yet") + '</span></div><span class="sp"></span><span class="fm-stat"><b>' + f.month + '</b> in 30 days</span><span class="fm-stat"><b>' + f.total + '</b> total</span><a class="btn sm" href="#/leads">View</a></div>' +
            '<div class="fm-b"><div><h4>Used on (' + f.pages.length + ')</h4><div class="fm-chips">' + (f.pages.length ? f.pages.slice(0, 14).map(function (p) { return '<a href="' + esc(p) + '" target="_blank" rel="noopener">' + esc(p) + "</a>"; }).join("") + (f.pages.length > 14 ? "<span>+" + (f.pages.length - 14) + " more</span>" : "") : '<span class="muted">not found on pages</span>') + "</div>" +
            '<h4 style="margin-top:14px">Fields received</h4><div class="fm-chips">' + f.fields.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div></div>" +
            '<div><h4>Where submissions go</h4><label>Alert email(s) <small class="muted">— blank = default</small><input data-f="alertTo" placeholder="' + esc(d.emailTo || "team@example.com") + '" value="' + esc(c.alertTo) + '"></label>' +
            '<label>WhatsApp alert number(s) <small class="muted">— blank = default · with country code</small><input data-f="waTo" placeholder="' + esc(d.waTo || "923224000768") + '" value="' + esc(c.waTo || "") + '"></label>' +
            '<label class="check"><input type="checkbox" data-f="waAlert"' + (c.waAlert ? " checked" : "") + "> WhatsApp alert to the team</label>" +
            '<label class="check"><input type="checkbox" data-f="reply"' + (c.reply ? " checked" : "") + "> Auto-reply to the customer (WhatsApp + email)</label>" +
            '<label>Custom auto-reply <small class="muted">— optional · {name} {company} {phone} {ref}</small><textarea data-f="replyText" rows="3" placeholder="Leave blank to use the standard “Enquiry received” message">' + esc(c.replyText) + "</textarea></label></div></div></div>";
        }).join("");
      W.fillIcons($("#fm-l"));
    });
    $("#fm-save").onclick = function () {
      var b = this, out = {}; $$(".fm-card", el).forEach(function (c) { var o = {}; $$("[data-f]", c).forEach(function (x) { o[x.dataset.f] = x.type === "checkbox" ? x.checked : x.value; }); out[c.dataset.id] = o; });
      b.disabled = true; api("forms_save", { forms: out, defaults: { emailTo: $("#fm-de").value.trim(), emailOn: $("#fm-deon").checked } }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.error, true); toast("Form settings saved ✓"); });
    };
  };
})();
