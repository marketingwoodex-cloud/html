/* Woodex Admin, P20: Client logos for the home page "Our clients" section.
   Add / remove / reorder logos, set name + link, and control the layout (grid or sliding row), speed and grey style.
   Data: /assets/data/clients.json (public). APIs: logos_get, logos_save, media_upload. */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = W.esc, api = W.api, toast = W.toast, ic = W.ic || function () { return ""; };
  var D = null;
  function b64(file) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(",")[1]); }; fr.onerror = no; fr.readAsDataURL(file); }); }

  W.VIEWS.logos = function (el) {
    el.innerHTML = W.head("Client logos", "Client logos", '<a class="btn" href="/#home-clients" target="_blank" rel="noopener">' + ic("eye") + 'View on website</a><button class="btn pri" id="lg-save">' + ic("save") + "Save</button>") +
      '<div class="lg-wrap"><div class="card lg-set"><h3>Display</h3>' +
      '<label class="lg-row"><span>Show section on home page</span><label class="switch"><input type="checkbox" id="lg-show"><span></span></label></label>' +
      '<label>Small title<input id="lg-kicker" maxlength="60"></label><label>Heading<input id="lg-title" maxlength="80"></label>' +
      '<div class="lg-lbl">Layout</div><div class="lg-seg"><button type="button" data-m="grid">Grid</button><button type="button" data-m="slider">Sliding row</button></div>' +
      '<label id="lg-speedw">Slide speed <b id="lg-speedv"></b><input type="range" id="lg-speed" min="10" max="90" step="5"><small>Lower = faster. Seconds for one full loop.</small></label>' +
      '<label class="lg-row"><span>Grey logos (colour on hover)</span><label class="switch"><input type="checkbox" id="lg-grey"><span></span></label></label>' +
      '<div class="lg-lbl">Preview</div><div class="lg-prev" id="lg-prev"></div></div>' +
      '<div class="card lg-list"><div class="lg-lh"><h3>Logos <small id="lg-count"></small></h3><label class="btn pri">' + ic("upload") + 'Add logos<input type="file" id="lg-up" accept="image/png,image/jpeg,image/webp" multiple hidden></label></div>' +
      '<p class="muted">Use a logo on a white or transparent background (PNG/WebP, about 320 × 160). Drag the arrows to change the order.</p><div id="lg-items"></div></div></div>';
    api("logos_get").then(function (r) { if (!r.ok) return toast(r.error || "Could not load", "err"); D = r.data; fill(); });

    function fill() {
      $("#lg-show").checked = D.show !== false; $("#lg-kicker").value = D.kicker || ""; $("#lg-title").value = D.title || ""; $("#lg-grey").checked = !!D.grey; $("#lg-speed").value = D.speed;
      draw();
    }
    function draw() {
      [].forEach.call(el.querySelectorAll(".lg-seg button"), function (b) { b.classList.toggle("on", b.dataset.m === D.mode); });
      $("#lg-speedw").style.display = D.mode === "slider" ? "" : "none"; $("#lg-speedv").textContent = D.speed + "s";
      $("#lg-count").textContent = D.items.length + " logos";
      $("#lg-items").innerHTML = D.items.length ? D.items.map(function (it, i) {
        return '<div class="lg-it" data-i="' + i + '"><div class="lg-img"><img src="' + esc(it.logo) + '" alt=""></div><div class="lg-f"><input data-k="name" placeholder="Client name" value="' + esc(it.name) + '"><input data-k="url" placeholder="Website link (optional) https://…" value="' + esc(it.url) + '"></div>' +
          '<div class="lg-act"><button class="btn sm" data-a="up" title="Move up"' + (i ? "" : " disabled") + '>↑</button><button class="btn sm" data-a="down" title="Move down"' + (i < D.items.length - 1 ? "" : " disabled") + '>↓</button><button class="btn sm danger" data-a="del" title="Remove">' + ic("trash") + "</button></div></div>";
      }).join("") : '<p class="muted">No logos yet. Click “Add logos”.</p>';
      var tiles = D.items.map(function (it) { return '<span><img src="' + esc(it.logo) + '" alt="" style="' + (D.grey ? "filter:grayscale(1);opacity:.75" : "") + '"></span>'; }).join("");
      $("#lg-prev").className = "lg-prev " + D.mode; $("#lg-prev").innerHTML = D.mode === "slider" ? '<div class="lg-run" style="animation-duration:' + D.speed + 's">' + tiles + tiles + "</div>" : tiles;
    }
    el.addEventListener("input", function (e) {
      var row = e.target.closest(".lg-it"); if (row && e.target.dataset.k) { D.items[+row.dataset.i][e.target.dataset.k] = e.target.value; return; }
      if (e.target.id === "lg-speed") { D.speed = +e.target.value; draw(); }
    });
    el.addEventListener("change", function (e) { if (e.target.id === "lg-grey") { D.grey = e.target.checked; draw(); } });
    el.addEventListener("click", function (e) {
      var m = e.target.closest(".lg-seg button"); if (m) { D.mode = m.dataset.m; draw(); return; }
      var b = e.target.closest("[data-a]"); if (!b) return; var i = +b.closest(".lg-it").dataset.i, a = b.dataset.a;
      if (a === "del") { if (!confirm("Remove " + (D.items[i].name || "this logo") + "?")) return; D.items.splice(i, 1); }
      if (a === "up" && i > 0) D.items.splice(i - 1, 0, D.items.splice(i, 1)[0]);
      if (a === "down" && i < D.items.length - 1) D.items.splice(i + 1, 0, D.items.splice(i, 1)[0]);
      draw();
    });
    $("#lg-up").addEventListener("change", function (e) {
      var files = [].slice.call(e.target.files || []); e.target.value = ""; if (!files.length) return;
      toast("Uploading " + files.length + " logo(s)…");
      files.reduce(function (p, f) { return p.then(function () { return b64(f).then(function (d) { return api("media_upload", { data: d, name: f.name, folder: "" }); }).then(function (r) {
        if (!r.ok) return toast(f.name + ": " + (r.error || "upload failed"), "err"); D.items.push({ name: f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "), logo: r.url, url: "" }); draw(); }); }); }, Promise.resolve())
        .then(function () { toast("Added. Click Save to publish."); });
    });
    $("#lg-save").addEventListener("click", function () {
      D.show = $("#lg-show").checked; D.kicker = $("#lg-kicker").value; D.title = $("#lg-title").value;
      api("logos_save", { data: D }).then(function (r) { if (!r.ok) return toast(r.error || "Could not save", "err"); D = r.data; fill(); toast("Saved. The home page is updated."); });
    });
  };
  var css = ".lg-wrap{display:grid;grid-template-columns:minmax(280px,380px) 1fr;gap:20px;align-items:start}.lg-wrap .card{padding:20px}.lg-wrap h3{margin:0 0 14px}.lg-wrap label{display:block;margin:0 0 12px;font-size:13px;font-weight:600}.lg-wrap label input:not([type=checkbox]):not([type=range]){display:block;width:100%;margin-top:5px}" +
    ".lg-row{display:flex!important;align-items:center;justify-content:space-between;gap:10px}.lg-lbl{font-size:13px;font-weight:600;margin:4px 0 6px}.lg-seg{display:flex;gap:6px;margin-bottom:14px}.lg-seg button{flex:1;padding:9px;border:1px solid var(--line,#e4e7ec);background:#fff;border-radius:10px;cursor:pointer;font:inherit;font-weight:600}.lg-seg button.on{background:#0c1628;color:#fff;border-color:#0c1628}" +
    "#lg-speed{width:100%}.lg-wrap small{display:block;color:#667085;font-weight:400}.lg-prev{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f4efe7;border-radius:12px;padding:10px;overflow:hidden}.lg-prev span{background:#fff;border-radius:8px;aspect-ratio:2/1;display:grid;place-items:center;padding:6px}.lg-prev img{max-width:100%;max-height:44px}" +
    ".lg-prev.slider{display:block}.lg-run{display:flex;gap:8px;width:max-content;animation:lgrun linear infinite}.lg-run span{width:96px;flex:none}@keyframes lgrun{to{transform:translateX(-50%)}}" +
    ".lg-lh{display:flex;align-items:center;justify-content:space-between;gap:10px}.lg-lh small{color:#667085;font-weight:500;font-size:13px}.lg-it{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line,#eaecf0)}" +
    ".lg-img{background:#fff;border:1px solid #eaecf0;border-radius:10px;aspect-ratio:2/1;display:grid;place-items:center;padding:6px}.lg-img img{max-width:100%;max-height:44px}.lg-f{display:grid;gap:6px}.lg-act{display:flex;gap:4px}" +
    ".lg-wrap label.switch{display:inline-flex;margin:0;flex:none}.lg-wrap .switch span{flex:none}" +
    "@media(max-width:900px){.lg-wrap{grid-template-columns:1fr}.lg-it{grid-template-columns:80px 1fr}.lg-act{grid-column:1/-1}}";
  var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
})();
