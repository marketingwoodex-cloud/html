/* Woodex Admin — P38 messaging upgrade: a "How this works" flow + live system status on
   Inbox, Offers & broadcasts, Automation & templates, Client updates and Train AI. Wraps the existing views (no logic rewritten). */
(function () {
  "use strict";
  var W = window.WXA; if (!W) return;
  var esc = W.esc, api = W.api;
  var FLOWS = {
    chat: ["How the inbox works", [
      ["Customer writes", "Website chat bubble or your WhatsApp number. Both land here."],
      ["AI answers first", "Uses AI agent training: tone, Q&A, hours, topics to avoid. Replies in the customer's language."],
      ["Details go to CRM", "Name, phone, area, project type and budget are saved to the lead automatically."],
      ["Hand-over", "Asks for a person, is upset or ready to book → tagged “needs you” + alert."],
      ["You take over", "Reply here and the AI stops for that chat. Hand back to AI any time."],
      ["Close", "Close the chat when done. The lead continues in Enquiries → Pipeline."]]],
    offers: ["How offers & broadcasts work", [
      ["Choose audience", "A saved segment: stage, city, service, last contact. Opted-out numbers are always skipped."],
      ["Choose template", "A WhatsApp template approved by Meta (needed for messages outside the 24-hour window)."],
      ["Add the offer", "Discount or message, with {name} and other fields filled per person."],
      ["Send or schedule", "Sent in safe batches with a daily cap, so your number stays healthy."],
      ["Track results", "Sent → delivered → read → replied for every person."],
      ["Replies → Inbox", "Answers arrive in the Inbox; “STOP” opts the person out automatically."]]],
    wauto: ["How automation works", [
      ["Event happens", "New enquiry, quotation sent, invoice due or site visit coming up."],
      ["Flow checks rules", "Only if the flow is on, the person has a number and has not opted out."],
      ["Template is sent", "The approved template for that flow, with their details filled in."],
      ["Logged on the lead", "A note is added to the lead so the team sees what went out."],
      ["Customer replies", "The reply opens a chat in the Inbox and the 24-hour window starts."]]],
    updates: ["How client updates work", [
      ["Project moves a step", "Enquiry received · Quotation sent · Work started · Handover."],
      ["Message is chosen", "Your English + Urdu text for that step, with name and project filled in."],
      ["Sent on 2 channels", "WhatsApp (when connected) and email, once per step, never twice."],
      ["Saved to timeline", "Shown on the client and project, so everyone knows what the client was told."]]],
    train: ["How the AI agent learns", [
      ["Set the voice", "Tone, office hours, price rule and topics it must never discuss."],
      ["Add knowledge", "Q&A pairs and studio facts. Published website FAQs are added automatically."],
      ["Test it here", "Chat as a customer. The green note shows what it saved to the CRM."],
      ["Save", "Live at once on the website chat and WhatsApp."],
      ["Improve weekly", "Read real chats in the Inbox and add a Q&A wherever the AI was unsure."]]]
  };
  var status = null;
  function getStatus() {
    if (status) return Promise.resolve(status);
    var adm = W.can && W.can("owner,admin");
    return Promise.all([api("crm_wa_status").catch(function () { return {}; }), adm ? api("chat_cfg_get").catch(function () { return {}; }) : Promise.resolve({})]).then(function (r) {
      var wa = r[0] || {}, c = r[1] || {}, cfg = c.cfg || {};
      status = { wa: wa.ok ? !!wa.connected : null, ai: c.aiReady, chatOn: cfg.on, aiOn: cfg.ai, lead: cfg.autoLead, hours: cfg.hours, known: !!c.ok };
      return status;
    });
  }
  function chip(on, yes, no, href) { return '<a class="fw-st ' + (on ? "ok" : "no") + '"' + (href ? ' href="' + href + '"' : "") + "><i></i>" + (on ? yes : no) + "</a>"; }
  function card(key) {
    var F = FLOWS[key], open = localStorage.getItem("wxFlow-" + key) !== "0";
    var d = document.createElement("details"); d.className = "card fw"; d.open = open;
    d.innerHTML = '<summary><b>' + esc(F[0]) + '</b><span class="fw-sts" id="fw-sts"></span><small class="muted">' + (open ? "Hide" : "Show") + "</small></summary>" +
      '<ol class="fw-steps">' + F[1].map(function (s, i) { return '<li><span class="fw-n">' + (i + 1) + "</span><b>" + esc(s[0]) + "</b><small>" + esc(s[1]) + "</small></li>"; }).join("") + "</ol>";
    d.addEventListener("toggle", function () { localStorage.setItem("wxFlow-" + key, d.open ? "1" : "0"); d.querySelector("summary small").textContent = d.open ? "Hide" : "Show"; });
    getStatus().then(function (s) {
      var box = d.querySelector("#fw-sts"); if (!box) return;
      box.innerHTML = (s.wa === null ? "" : chip(s.wa, "WhatsApp connected", "WhatsApp not connected", "#/settings")) + (s.known ? chip(s.ai && s.aiOn, "AI agent on", s.ai ? "AI agent off" : "No AI key", "#/train") + chip(s.lead, "Auto-save leads on", "Auto-save leads off", "#/chat") + (s.hours ? '<span class="fw-st"><i style="background:#94a3b8"></i>' + esc(s.hours) + "</span>" : "") : "");
    });
    return d;
  }
  function wrap(key) {
    var base = W.VIEWS[key]; if (!base || base._p38) return;
    W.VIEWS[key] = function (el, a) {
      var r = base.apply(this, arguments);
      var put = function () { if (el.querySelector(".fw")) return true; var ph = el.querySelector(".ph"); if (!ph) return false; ph.after(card(key)); return true; };
      put(); var n = 0, t = setInterval(function () { if (!el.isConnected || ++n > 40) return clearInterval(t); put(); }, 150);
      return r;
    };
    W.VIEWS[key]._p38 = 1;
  }
  function install() { ["chat", "offers", "wauto", "updates", "train"].forEach(wrap); }
  install(); setTimeout(install, 1500); // late-loaded views
  var st = document.createElement("style");
  st.textContent = ".fw{margin:0 0 18px;padding:0;overflow:hidden}.fw summary{display:flex;align-items:center;gap:12px;padding:14px 18px;cursor:pointer;list-style:none;flex-wrap:wrap}.fw summary::-webkit-details-marker{display:none}.fw summary small{margin-left:auto}" +
    ".fw-sts{display:flex;gap:6px;flex-wrap:wrap}.fw-st{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;background:#f2f4f7;color:#344054;text-decoration:none}.fw-st i{width:7px;height:7px;border-radius:50%;background:#12b76a}.fw-st.no i{background:#f79009}.fw-st.no{background:#fffaeb;color:#93370d}" +
    ".fw-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0;margin:0;padding:4px 18px 18px;list-style:none;counter-reset:s}.fw-steps li{position:relative;padding:12px 14px 4px 0}.fw-steps li:not(:last-child):after{content:'';position:absolute;top:25px;left:34px;right:8px;height:2px;background:linear-gradient(90deg,#b8956a,#e8dccb)}" +
    ".fw-n{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#0c1628;color:#fff;font-size:12px;font-weight:700;margin-bottom:8px;box-shadow:0 0 0 4px #fff}.fw-steps b{display:block;font-size:13px;margin-bottom:3px}.fw-steps small{display:block;font-size:12px;color:#667085;line-height:1.45;padding-right:6px}" +
    ".lc-ch{display:flex;gap:4px;padding:6px 8px;overflow-x:auto;border-bottom:1px solid var(--line,#e5e7eb)}.lc-ch button{flex:none;border:1px solid var(--line,#e5e7eb);background:#fff;border-radius:99px;padding:3px 9px;font:inherit;font-size:11.5px;cursor:pointer}.lc-ch button.on{background:#0c1628;color:#fff;border-color:#0c1628}" +
    "@media(max-width:700px){.fw-steps{grid-template-columns:1fr}.fw-steps li:after{display:none}}";
  document.head.appendChild(st);
})();
