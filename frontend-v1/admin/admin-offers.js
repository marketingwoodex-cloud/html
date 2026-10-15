/* Woodex Admin — P16 WhatsApp: discount offers to leads + WhatsApp connection card (connect / change number / disconnect). */
(function () {
  "use strict";
  var W = window.WXA, api = W.api, esc = W.esc, ic = W.ic, $ = W.$, toast = W.toast, modal = W.modal, closeModal = W.closeModal, head = W.head;
  var $$ = W.$$ || function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var STAGE = { new: "New", contacted: "Contacted", visit: "Site visit", quote: "Quote sent", won: "Won", lost: "Lost" };
  var DEF_MSG = "Assalam o Alaikum {name}! Woodex Interior has a special offer for you: {percent}% off your interior project with code {code}. Valid until {expires}. Reply here to book a free site visit.";

  // ------------------------------------------------------------ Offers view
  W.VIEWS.offers = function (el) {
    el.innerHTML = head("WhatsApp offers", "Sales / Offers", '<button class="btn pri" id="of-new">' + ic("plus") + " New offer</button>") +
      '<div id="of-wa" class="banner" style="margin-bottom:16px">Checking WhatsApp…</div><div id="of-list"><div class="empty">Loading…</div></div>';
    W.fillIcons && W.fillIcons(el);
    var offers = [];
    function load() {
      api("crm_offers").then(function (r) {
        if (!r.ok) { $("#of-list").innerHTML = '<div class="empty"><b style="color:#d92d20">' + esc(r.error || "Could not load") + '</b> <button class="btn" id="of-retry">Retry</button></div>'; $("#of-retry").onclick = load; return; }
        offers = r.offers || [];
        $("#of-wa").innerHTML = r.waConnected ? ic("check") + " WhatsApp Cloud API connected: offers are sent automatically. Customers who haven't messaged you in 24 hours may not receive free-form messages (Meta rule) — use the <b>Open in WhatsApp</b> link shown for those."
          : ic("info") + ' WhatsApp Cloud API not connected. You can still send offers one by one with <b>Open in WhatsApp</b> links (free). <a href="#/settings">Connect WhatsApp</a>';
        $("#of-list").innerHTML = offers.length ? '<div class="grid g3">' + offers.map(function (o) {
          var exp = o.expires && o.expires < new Date().toISOString().slice(0, 10);
          return '<div class="card"><div class="card-h"><h3>' + esc(o.title) + '</h3><span class="badge ' + (exp ? "bad" : "ok") + '">' + (exp ? "Expired" : o.percent + "% off") + '</span></div><div class="card-b">' +
            (o.code ? '<p>Code <b style="font-family:monospace">' + esc(o.code) + "</b>" + (o.expires ? ' · until <b>' + esc(o.expires) + "</b>" : "") + "</p>" : "") +
            '<p class="muted" style="font-size:13px;white-space:pre-wrap">' + esc(o.msg) + '</p><p class="muted" style="font-size:12px">Sent to ' + (o.sent || 0) + ' lead(s)</p>' +
            '<div class="toolbar"><button class="btn pri sm" data-send="' + o.id + '">' + ic("send") + ' Send to leads</button><button class="btn sm" data-ed="' + o.id + '">Edit</button><button class="btn sm" data-del="' + o.id + '">Delete</button></div></div></div>';
        }).join("") + "</div>" : '<div class="card card-b empty">' + ic("send") + "<p>No offers yet. Create one (e.g. <b>Ramadan 10% off</b>) and send it to your leads on WhatsApp.</p></div>";
        W.fillIcons && W.fillIcons($("#of-list"));
        $$("[data-ed]").forEach(function (b) { b.onclick = function () { edit(offers.find(function (o) { return o.id === b.dataset.ed; })); }; });
        $$("[data-del]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this offer?")) api("crm_offer_delete", { id: b.dataset.del }).then(load); }; });
        $$("[data-send]").forEach(function (b) { b.onclick = function () { send(offers.find(function (o) { return o.id === b.dataset.send; })); }; });
      });
    }
    function edit(o) {
      o = o || { id: "", title: "", code: "", percent: 10, expires: "", msg: DEF_MSG };
      modal("<h3>" + (o.id ? "Edit" : "New") + ' offer</h3><label>Title<input id="oe-t" value="' + esc(o.title) + '" placeholder="Ramadan offer"></label>' +
        '<div class="g2"><label>Discount %<input id="oe-p" type="number" min="0" max="90" value="' + esc(o.percent) + '"></label><label>Coupon code<input id="oe-c" value="' + esc(o.code) + '" placeholder="WOODEX10"></label></div>' +
        '<label>Valid until<input id="oe-e" type="date" value="' + esc(o.expires) + '"></label>' +
        '<label>Message <small>use {name} {percent} {code} {expires}</small><textarea id="oe-m" rows="5">' + esc(o.msg) + "</textarea></label>" +
        '<p class="muted" style="font-size:12px" id="oe-pv"></p><p class="err" id="oe-err"></p><div class="modal-actions"><button class="btn" id="oe-x">Cancel</button><button class="btn pri" id="oe-s">Save</button></div>');
      function pv() { $("#oe-pv").textContent = "Preview: " + $("#oe-m").value.replace(/\{name\}/g, "Ahmed").replace(/\{percent\}/g, $("#oe-p").value).replace(/\{code\}/g, $("#oe-c").value.toUpperCase()).replace(/\{expires\}/g, $("#oe-e").value); }
      ["#oe-m", "#oe-p", "#oe-c", "#oe-e"].forEach(function (s) { $(s).oninput = pv; }); pv();
      $("#oe-x").onclick = closeModal;
      $("#oe-s").onclick = function () {
        api("crm_offer_save", { id: o.id, title: $("#oe-t").value, percent: $("#oe-p").value, code: $("#oe-c").value, expires: $("#oe-e").value, msg: $("#oe-m").value }).then(function (r) {
          if (!r.ok) { $("#oe-err").textContent = r.error; return; } closeModal(); toast("Offer saved ✓"); load();
        });
      };
    }
    function send(o) {
      api("leads_list").then(function (r) {
        if (!r.ok) return toast(r.error, true);
        var leads = (r.leads || []).filter(function (l) { return l.phone; });
        modal('<h3>Send “' + esc(o.title) + '”</h3><div class="toolbar" style="flex-wrap:wrap;margin-bottom:8px"><select id="os-st"><option value="">All stages</option>' +
          Object.keys(STAGE).map(function (k) { return '<option value="' + k + '">' + STAGE[k] + "</option>"; }).join("") + '</select><button class="btn sm" id="os-all">Select all shown</button><span class="muted" id="os-n"></span></div>' +
          '<div id="os-l" style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:10px"></div><p class="muted" style="font-size:12px">Max 50 per send. Each lead gets a note in its history.</p><div id="os-res"></div>' +
          '<div class="modal-actions"><button class="btn" id="os-x">Close</button><button class="btn pri" id="os-go">' + ic("send") + " Send</button></div>");
        $("#modal-card").classList.add("wide");
        function draw() {
          var st = $("#os-st").value;
          $("#os-l").innerHTML = leads.filter(function (l) { return !st || l.stage === st; }).map(function (l) {
            return '<label class="check" style="display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid var(--line);margin:0"><input type="checkbox" value="' + l.id + '"><span style="flex:1"><b>' + esc(l.name) + '</b> <span class="muted">' + esc(l.phone) + '</span></span><span class="badge">' + esc(STAGE[l.stage] || l.stage) + "</span></label>";
          }).join("") || '<p class="muted" style="padding:12px">No leads with a phone number in this stage.</p>';
          count();
        }
        function count() { $("#os-n").textContent = $$("#os-l input:checked").length + " selected"; }
        $("#os-l").onchange = count; $("#os-st").onchange = draw; draw();
        $("#os-all").onclick = function () { $$("#os-l input").slice(0, 50).forEach(function (c) { c.checked = true; }); count(); };
        $("#os-x").onclick = function () { closeModal(); load(); };
        $("#os-go").onclick = function () {
          var ids = $$("#os-l input:checked").map(function (c) { return +c.value; }); if (!ids.length) return toast("Choose at least one lead", true);
          var b = this; b.disabled = true; b.textContent = "Sending…";
          api("crm_offer_send", { id: o.id, leads: ids }).then(function (x) {
            b.disabled = false; b.innerHTML = ic("send") + " Send";
            if (!x.ok) return toast(x.error, true);
            $("#os-res").innerHTML = '<div class="card card-b" style="margin-top:10px"><b>' + x.sent + " of " + x.results.length + " sent automatically.</b>" +
              x.results.filter(function (y) { return !y.ok; }).map(function (y) { return '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:13px"><span style="flex:1">' + esc(y.name) + ' <span class="muted">— ' + esc(y.error) + "</span></span>" + (y.link ? '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(y.link) + '">Open in WhatsApp</a>' : "") + "</div>"; }).join("") + "</div>";
          });
        };
      });
    }
    $("#of-new").onclick = function () { edit(null); };
    load();
  };

  // ------------------------------------------------------------ WhatsApp card in Settings → Integrations
  function waCard(box) {
    box.innerHTML = '<p class="muted">Checking WhatsApp…</p>';
    api("crm_wa_status").then(function (r) {
      if (!r.ok) { box.innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
      var i = r.info || {};
      box.innerHTML = (r.connected ? '<p><span class="badge ok">Connected</span> <b>' + esc(i.number) + "</b> · " + esc(i.name) + (i.quality ? ' · quality <b>' + esc(i.quality) + "</b>" : "") + "</p>"
        : (i.error ? '<p><span class="badge bad">Not working</span> ' + esc(i.error) + "</p>" : '<p><span class="badge warn">Not connected</span> Website visitors still reach you via free wa.me links.</p>')) +
        '<details' + (r.connected ? "" : " open") + '><summary style="cursor:pointer;font-weight:600;margin:6px 0">' + (r.connected ? "Change number / token" : "Connect WhatsApp Cloud API") + "</summary>" +
        '<ol style="font-size:13px;padding-left:18px"><li>developers.facebook.com → your app → <b>WhatsApp → API Setup</b>.</li><li>To change the number: <b>Add phone number</b>, verify it by SMS, then copy its <b>Phone number ID</b>.</li><li>Create a <b>permanent token</b> (Business settings → System users → Generate token, permission <i>whatsapp_business_messaging</i>).</li></ol>' +
        '<label>Phone number ID<input id="wa-pid" placeholder="e.g. 123456789012345"></label><label>Access token <small>' + (r.connected ? "leave empty to keep the current one" : "") + '</small><input id="wa-tok" type="password" autocomplete="off"></label>' +
        '<div class="toolbar"><button class="btn pri" id="wa-go">Verify &amp; connect</button>' + (r.connected ? '<button class="btn" id="wa-off">Disconnect</button>' : "") + '<a class="btn" href="#/offers">Discount offers</a></div><p class="st-res" id="wa-res"></p></details>';
      if (!document.body.contains(box)) return; // screen changed while loading
      $("#wa-go").onclick = function () {
        var b = this; b.disabled = true; $("#wa-res").textContent = "Checking with Meta…";
        api("crm_wa_connect", { phoneId: $("#wa-pid").value, token: $("#wa-tok").value }).then(function (x) { b.disabled = false; if (!x.ok) { $("#wa-res").textContent = x.error; return; } toast("WhatsApp connected: " + x.info.number); waCard(box); });
      };
      if ($("#wa-off")) $("#wa-off").onclick = function () { if (confirm("Disconnect WhatsApp? Automatic replies, alerts and offers stop until you connect again.")) api("crm_wa_disconnect").then(function () { toast("Disconnected"); waCard(box); }); };
    });
  }
  // attach whenever the Integrations tab renders its WhatsApp card
  new MutationObserver(function () {
    var card = document.getElementById("in-wa"); if (!card || card.querySelector("#wa-box")) return;
    var body = card.querySelector(".card-b") || card; [].slice.call(body.querySelectorAll(".st-p")).forEach(function (c) { c.remove(); });
    var bd = card.querySelector(".card-h .badge"); if (bd) bd.remove();
    var box = document.createElement("div"); box.id = "wa-box"; body.appendChild(box); waCard(box);
  }).observe(document.body, { childList: true, subtree: true });
})();
