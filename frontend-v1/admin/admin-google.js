/* Woodex Admin — P16 Google Analytics + Search Console (free, service account). Card in Settings → Integrations. */
(function () {
  "use strict";
  var W = window.WXA, api = W.api, esc = W.esc, ic = W.ic, toast = W.toast;
  function q(s, r) { return (r || document).querySelector(s); }

  function draw(box) {
    box.innerHTML = '<p class="muted">Checking…</p>';
    api("gdata_status").then(function (r) {
      if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
      box.innerHTML =
        (r.connected ? '<p><span class="badge ok">Key saved</span> Robot account: <code style="word-break:break-all">' + esc(r.email) + '</code> <button class="btn sm" id="gd-cp">Copy</button></p>'
          : '<p><span class="badge warn">Not connected</span> Show visitors, top pages, Google searches and clicks on your dashboard — free.</p>') +
        '<details' + (r.connected && r.ga4 && r.gsc ? "" : " open") + '><summary style="cursor:pointer;font-weight:600;margin:6px 0">Setup steps (5 minutes, one time)</summary><ol style="font-size:13px;padding-left:18px;line-height:1.6">' +
        '<li>Open <b>console.cloud.google.com</b> → create a project (e.g. “Woodex website”).</li>' +
        '<li><b>APIs &amp; Services → Library</b>: turn on <b>Google Analytics Data API</b> and <b>Google Search Console API</b>.</li>' +
        '<li><b>IAM &amp; Admin → Service accounts → Create</b> (name: woodex-dashboard, no roles needed) → open it → <b>Keys → Add key → JSON</b>. A file downloads — upload it below.</li>' +
        '<li><b>Google Analytics → Admin → Property access management → +</b>: add the robot e-mail as <b>Viewer</b>. Copy the <b>Property ID</b> (Admin → Property details, numbers only).</li>' +
        '<li><b>Search Console → Settings → Users and permissions → Add user</b>: the robot e-mail, <b>Restricted</b>.</li></ol></details>' +
        '<label>Service-account key file (.json)<input type="file" id="gd-f" accept=".json,application/json"></label>' +
        '<div class="g2"><label>GA4 Property ID<input id="gd-ga" value="' + esc(r.ga4) + '" placeholder="e.g. 412345678"></label>' +
        '<label>Search Console property<input id="gd-sc" value="' + esc(r.gsc) + '" placeholder="sc-domain:woodex.com.pk"></label></div>' +
        '<div class="toolbar"><button class="btn pri" id="gd-s">Save</button><button class="btn" id="gd-t"' + (r.connected ? "" : " disabled") + ">Test connection</button>" + (r.connected ? '<button class="btn" id="gd-x">Remove</button>' : "") + '</div><div class="st-res" id="gd-res"></div>';
      if (q("#gd-cp", box)) q("#gd-cp", box).onclick = function () { navigator.clipboard.writeText(r.email).then(function () { toast("Copied ✓"); }); };
      q("#gd-s", box).onclick = function () {
        var f = q("#gd-f", box).files[0], b = this; b.disabled = true;
        (f ? f.text() : Promise.resolve("")).then(function (txt) {
          return api("gdata_save", { keyJson: txt, ga4: q("#gd-ga", box).value, gsc: q("#gd-sc", box).value.trim() });
        }).then(function (x) { b.disabled = false; if (!x.ok) { q("#gd-res", box).textContent = x.error; return; } toast("Google settings saved ✓"); draw(box); });
      };
      if (q("#gd-t", box)) q("#gd-t", box).onclick = function () {
        var b = this; b.disabled = true; q("#gd-res", box).textContent = "Asking Google… (up to 20 seconds)";
        api("gdata_report", { days: 28, fresh: 1 }).then(function (x) {
          b.disabled = false; if (!x.ok) { q("#gd-res", box).textContent = x.error; return; }
          var g = x.ga4 || {}, s = x.gsc || {};
          q("#gd-res", box).innerHTML = "<b>Analytics:</b> " + (g.error ? '<span class="bad">' + esc(g.error) + "</span>" : "✓ " + Math.round(g.totals.users) + " visitors in 28 days") +
            "<br><b>Search Console:</b> " + (s.error ? '<span class="bad">' + esc(s.error) + "</span>" : "✓ " + s.totals.clicks + " clicks from Google, " + s.totals.impressions + " impressions");
        });
      };
      if (q("#gd-x", box)) q("#gd-x", box).onclick = function () { if (confirm("Remove the Google key? The dashboard stops showing Analytics and Search Console.")) api("gdata_clear").then(function () { toast("Removed"); draw(box); }); };
    });
  }
  W.googleDataCard = draw;
  // Add the card to Settings → Integrations (next to WhatsApp) whenever that tab renders
  new MutationObserver(function () {
    var wa = document.getElementById("in-wa"); if (!wa || document.getElementById("in-gdata")) return;
    var c = document.createElement("div"); c.className = "card st-card"; c.id = "in-gdata";
    c.innerHTML = '<div class="card-h"><h3>' + ic("activity") + ' Google Analytics &amp; Search Console</h3><span class="badge">Free</span></div><div class="card-b"><div id="gd-box"></div></div>';
    wa.parentNode.insertBefore(c, wa); W.fillIcons && W.fillIcons(c); draw(c.querySelector("#gd-box"));
  }).observe(document.body, { childList: true, subtree: true });
})();
