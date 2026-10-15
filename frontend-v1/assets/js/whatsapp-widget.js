/* Woodex WhatsApp widget v2 (Phase 8).
 * Floating button on every public page → panel with office-hours status, a service picker (pre-selected from the page),
 * quick intents, optional name + phone and a message. Sending opens WhatsApp (wa.me) with a complete, prefilled message.
 * If name + phone are given the enquiry is also saved in Admin → Enquiries (source “WhatsApp widget”), so no lead is lost.
 * An anonymous click counter (page + service, no personal data) feeds Admin → Enquiries → WhatsApp stats.
 * Number: studio default below (Business info updates it) or window.WOODEX_CONFIG.whatsapp. Per-page greeting:
 * <body data-wa-msg="…"> or window.WOODEX_CONFIG.waMessage. Disable: window.WOODEX_CONFIG.whatsapp_widget = false. */
(function () {
  "use strict";
  if (window.__wxWaWidget) return;
  window.__wxWaWidget = true;

  var DEFAULT_NUMBER = "923224000768";
  var SERVICES = [
    ["Interior design", /interior|bedroom|living|kitchen|bath|dining|lounge|wardrobe|home|residential|apartment|villa/],
    ["Renovation", /renovat|remodel|makeover/],
    ["Fit-out", /fit-?out|office|retail|shop|restaurant|cafe|clinic|salon|showroom|commercial/],
    ["Turnkey", /turnkey|design-build/],
    ["Architecture", /architect|elevation|planning|house-design|construction/],
    ["3D visualization", /3d|visuali|render/],
    ["Furniture", /furniture/]
  ];
  var INTENTS = [["Get a quote", "I would like a quotation."], ["Book a site visit", "I would like to book a site visit."], ["Ask a question", "I have a question."]];

  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function post(body) { try { return fetch("/api/forms.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {}); } catch (e) { return null; } }
  // Office hours: Mon–Sat 10:00–19:30 Pakistan time (UTC+5, no DST)
  function officeOpen() { var d = new Date(Date.now() + 5 * 36e5), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return day !== 0 && m >= 570 && m < 1110; }

  function init() {
    var cfg = window.WOODEX_CONFIG || {};
    if (cfg.whatsapp_widget === false || location.pathname.indexOf("/admin") === 0 || location.pathname.indexOf("/builder") === 0) return;
    var number = String(cfg.whatsapp || DEFAULT_NUMBER).replace(/\D/g, "") || DEFAULT_NUMBER;
    var path = location.pathname.toLowerCase(), pageSvc = "";
    SERVICES.some(function (s) { if (s[1].test(path)) { pageSvc = s[0]; return true; } return false; });
    var title = (document.querySelector("h1") || {}).textContent || document.title.split("|")[0];
    title = String(title).replace(/\s+/g, " ").trim().slice(0, 80);
    var greet = document.body.getAttribute("data-wa-msg") || cfg.waMessage || (pageSvc ? "Assalam-o-Alaikum! Planning " + pageSvc.toLowerCase() + "? Tell us about your space and we’ll help." : "Assalam-o-Alaikum! Tell us about your space and we will take it from there.");
    var open = officeOpen();

    var css = [
      ".wx-wa{position:fixed;right:18px;bottom:18px;z-index:9990;font-family:inherit}",
      ".wx-wa-btn{width:58px;height:58px;padding:0!important;min-width:0!important;border-radius:50%;border:0;background:#0c1628;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(12,22,40,.38),0 0 0 4px rgba(184,149,106,.22);position:relative;transition:transform .2s}",
      ".wx-wa-btn>svg{flex:none;width:27px!important;height:27px!important;fill:none!important;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;display:block}.wx-wa-badge{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:#25d366;border:2px solid #fff;display:flex;align-items:center;justify-content:center}.wx-wa-badge svg{width:13px;height:13px;fill:#fff}",
      ".wx-wa-btn:hover{transform:scale(1.05)}.wx-wa-dot{position:absolute;top:3px;right:3px;width:12px;height:12px;border-radius:50%;background:#b8956a;border:2px solid #fff}",
      ".wx-wa-panel{position:fixed;right:18px;bottom:88px;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(12,22,40,.25);z-index:9991;display:none;font-family:inherit;color:#0c1628}",
      ".wx-wa-panel.open{display:block;animation:wxwa .22s ease}@keyframes wxwa{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
      ".wx-wa-head{padding:14px 14px 14px 16px!important;background:linear-gradient(135deg,#0c1628,#1a2840);border-bottom:2px solid #b8956a;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}",
      ".wx-wa-av{width:38px;height:38px;border-radius:50%;background:#b8956a;color:#0c1628;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none}",
      ".wx-wa-head .t{font-weight:700;font-size:15px;line-height:1.2}.wx-wa-head .s{font-size:12px;opacity:.85;display:flex;align-items:center;gap:6px;white-space:nowrap}.wx-wa-head>div{min-width:0}",
      ".wx-wa-head .s i{width:8px;height:8px;border-radius:50%;background:" + (open ? "#4ade80" : "#fbbf24") + ";display:inline-block}",
      ".wx-wa-x{margin-left:auto;background:none!important;border:0!important;color:#fff!important;font-size:22px;cursor:pointer;line-height:1;padding:0 4px!important;min-width:0!important}",
      ".wx-wa-body{padding:16px 16px 6px;background:#f6f1e9}",
      ".wx-wa-msg{background:#fff;border-radius:4px 14px 14px 14px;padding:12px 14px;font-size:14px;line-height:1.55;box-shadow:0 1px 2px rgba(12,22,40,.08);margin-bottom:16px}",
      ".wx-wa-lbl{display:block;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8a6a43;margin:0 0 8px}",
      ".wx-wa-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}",
      ".wx-wa-chip{border:1px solid #ddd3c4!important;background:#fff!important;color:#0c1628!important;border-radius:999px!important;padding:7px 13px!important;font-size:12.5px!important;font-weight:500;cursor:pointer;min-width:0!important;line-height:1.3!important;transition:border-color .2s,background .2s}.wx-wa-chip:hover{border-color:#b8956a!important}",
      ".wx-wa-chip.on{background:#0c1628!important;border-color:#0c1628!important;color:#fff!important}",
      ".wx-wa-in{width:100%;box-sizing:border-box;border:1px solid #e3d9ca;border-radius:12px;padding:11px 13px;font:inherit;font-size:14px;outline:none;background:#fff;color:#0c1628;margin:0 0 10px;min-height:44px}",
      ".wx-wa-in:focus{border-color:#b8956a;box-shadow:0 0 0 3px rgba(184,149,106,.18)}.wx-wa-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.wx-wa-two .wx-wa-in{min-width:0}",
      "textarea.wx-wa-in{resize:none;min-height:72px;line-height:1.45}",
      ".wx-wa-send{width:100%;border:0!important;border-radius:999px!important;background:#0c1628!important;color:#fff!important;font-weight:700;font-size:15px;padding:13px!important;margin-top:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 8px 18px -8px rgba(12,22,40,.5);transition:background .2s,transform .2s}.wx-wa-send:active{transform:scale(.98)}",
      ".wx-wa-send svg{width:18px;height:18px;fill:#25d366}.wx-wa-send:hover{background:#1a2840!important}",
      ".wx-wa-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}",
      ".wx-back{background:none!important;border:0!important;color:#fff!important;font-size:28px;line-height:1;padding:0 4px 0 0!important;min-width:0!important;cursor:pointer}",
      ".wx-opt{display:flex!important;align-items:center;gap:12px;width:100%;text-align:left;background:#fff!important;border:1px solid #e3d9ca!important;border-radius:14px!important;padding:12px!important;margin:0 0 8px;cursor:pointer;color:#0c1628!important;font:inherit}",
      ".wx-opt:hover{border-color:#b8956a!important;transform:translateY(-1px)}.wx-opt .ic{width:40px;height:40px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;flex:none;font-size:19px}.wx-opt .ic.ch{background:#0c1628;color:#fff}.wx-opt .ic.ch svg{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.wx-opt .ic svg{width:22px;height:22px;fill:#fff}",
      ".wx-opt b{display:block;font-size:14.5px}.wx-opt small{display:block;font-size:12px;color:#667781;margin-top:2px}",
      ".v-chat{display:flex;flex-direction:column;background:#f6f1e9}.v-chat[hidden]{display:none}.wx-ch-list{height:340px;max-height:calc(100vh - 260px);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px}",
      ".wx-m{max-width:84%;padding:8px 11px;border-radius:10px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 1px rgba(0,0,0,.08)}",
      ".wx-m.them{background:#fff;align-self:flex-start;border-top-left-radius:2px}.wx-m.me{background:#efe3cf;align-self:flex-end;border-top-right-radius:2px}.wx-m small{display:block;font-size:10.5px;color:#667781;margin-bottom:2px;font-weight:600}",
      ".wx-m.sys{align-self:center;background:#fff7d6;font-size:12.5px;box-shadow:none;text-align:center}.wx-typing{align-self:flex-start;background:#fff;border-radius:10px;padding:9px 12px;font-size:13px;color:#667781}",
      ".wx-ch-form{display:flex;gap:8px;padding:8px 10px;background:#f0f2f5;align-items:flex-end;margin:0}.wx-ch-form textarea{flex:1;border:0;border-radius:20px;padding:10px 14px;font:inherit;font-size:14px;resize:none;max-height:110px;outline:none;background:#fff;color:#0c1628}",
      ".wx-ch-form button{width:42px;height:42px;border-radius:50%!important;border:0!important;background:#0c1628!important;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0!important;min-width:0!important}.wx-ch-form button svg{width:18px;height:18px;fill:#fff}",
      ".wx-ch-form button.wx-ch-x{width:36px;height:42px;background:transparent!important;border-radius:10px!important}.wx-ch-form button.wx-ch-x svg{fill:none;stroke:#54656f;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;width:21px;height:21px}.wx-ch-form button.wx-ch-x.rec{background:#e11d48!important;width:auto;padding:0 10px!important;color:#fff;font:600 12px/1 inherit}.wx-ch-form button.wx-ch-x.rec svg{display:none}",
      ".wx-m img{display:block;max-width:200px;max-height:200px;border-radius:8px;margin-top:2px}.wx-m audio{display:block;width:210px;max-width:100%;height:36px}.wx-m a.wx-f{color:inherit;font-weight:600}.wx-ch-ty{font-size:12px;color:#667781;font-style:italic;padding:2px 12px;min-height:18px;background:#f6f1e9}",
      ".wx-opt .ic.tg{background:#229ED9}.wx-opt .ic.tg svg{width:20px;height:20px;fill:#fff}.wx-ch-q{display:flex;gap:6px;overflow-x:auto;padding:6px 10px 2px;background:#f6f1e9;scrollbar-width:none}.wx-ch-q::-webkit-scrollbar{display:none}.wx-ch-q button{flex:none;border:1px solid #d9c7ab!important;background:#fff!important;color:#0c1628!important;border-radius:999px!important;padding:6px 12px!important;font:600 12.5px/1.2 inherit;cursor:pointer;min-width:0!important}.wx-ch-q button:hover{border-color:#b8956a!important;background:#fbf6ee!important}.wx-ch-q .tg{background:#229ED9!important;border-color:#229ED9!important;color:#fff!important}",
      ".wx-wa-btn.m-whatsapp{background:#1f9d55}.wx-wa-btn.m-telegram{background:#229ED9}.wx-wa-btn.m-telegram .wx-st{display:none}",
      /* P40 B: clean launcher, status ring, unread count, teaser, typing dots, times, mobile full screen */
      ".wx-wa-btn .wx-st{position:absolute;right:1px;bottom:1px;width:14px;height:14px;border-radius:50%;border:2.5px solid #fff;background:" + (open ? "#22c55e" : "#94a3b8") + "}.wx-wa-btn .wx-n{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#b8956a;color:#0c1628;font:700 11px/20px system-ui,sans-serif;border:2px solid #fff;text-align:center;box-sizing:border-box}",
      ".wx-tease{position:absolute;right:70px;bottom:6px;width:max-content;max-width:240px;background:#fff;color:#0c1628;border-radius:14px 14px 4px 14px;padding:11px 30px 11px 14px;font-size:13.5px;line-height:1.4;box-shadow:0 10px 30px rgba(12,22,40,.18);cursor:pointer;animation:wxwa .3s ease}.wx-tease b{display:block;font-size:13.5px}.wx-tease span{color:#667781;font-size:12.5px}.wx-tease button{position:absolute;top:4px;right:4px;border:0!important;background:none!important;color:#94a3b8!important;font-size:17px;line-height:1;cursor:pointer;padding:4px!important;min-width:0!important}",
      ".wx-m{animation:wxin .28s ease-out both}@keyframes wxin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.wx-m .tx{white-space:pre-wrap}" + ".wx-typing{display:inline-flex;gap:4px;align-items:center;padding:11px 13px!important}.wx-typing i{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:wxdot 1.2s infinite}.wx-typing i:nth-child(2){animation-delay:.15s}.wx-typing i:nth-child(3){animation-delay:.3s}@keyframes wxdot{0%,60%,100%{opacity:.35;transform:none}30%{opacity:1;transform:translateY(-3px)}}",
      ".wx-m .tm{display:block;font-size:10px;color:#8696a0;text-align:right;margin-top:3px;font-weight:400}.wx-m.ai small,.wx-m.them small{color:#8a6a43}.wx-join{align-self:center;font-size:12px;color:#0c1628;background:#efe3cf;border-radius:999px;padding:5px 12px;margin:4px 0}",
      "@media(max-width:520px){.wx-wa-panel{right:0;bottom:0;width:100vw;max-width:100vw;max-height:100dvh;height:100dvh;border-radius:0;display:none;flex-direction:column}.wx-wa-panel.open{display:flex;z-index:2147483000}.wx-wa-panel .v-chat{flex:1;min-height:0}.wx-ch-list{height:auto!important;flex:1;max-height:none!important}.wx-tease{max-width:200px}}",
      ".wx-wa-foot{padding:10px 18px 16px;line-height:1.5;background:#f6f1e9;font-size:11px;color:#667781;text-align:center}"
    ].join("\n");
    document.head.appendChild(el("style", null, css));

    var waGlyph = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.6 2 6.5L4 29l7.7-2c1.8 1 3.9 1.6 6.1 1.6h.2c6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.6 1.2 1.2-4.4-.3-.4c-1-1.6-1.6-3.5-1.6-5.5 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10.8-9 10.8zm5.5-7.5c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.6-.4z"/></svg>';
    var sendGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l18-8L3 4v6l12 2-12 2v6z"/></svg>';

    var MODE = "chat", SITE_TG = "", SITE_TGBOT = false;
    var ICONS = {
      chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5Z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.4"/></svg>',
      whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 8.6c.2-.5.6-.6.9-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.4-.2.6-.1l1.6.7c.2.1.3.3.3.5v.5c0 .4-.2.7-.6.9-.6.3-1.3.4-2 .2A8 8 0 0 1 9 10.6c-.2-.7-.2-1.4 0-2Z" stroke-width="1.3"/></svg>',
      telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4.5 3.6 11.3c-.8.3-.8 1.4 0 1.7l4.2 1.4 1.6 5c.2.7 1.1.9 1.6.4l2.4-2.3 4.3 3.2c.6.4 1.4.1 1.6-.6L22 5.6c.2-.8-.5-1.4-1-1.1Z"/><path d="m8 14.4 9.5-6.6-6.9 7.4"/></svg>'
    };
    try { var m0 = sessionStorage.getItem("wxMode"); if (m0) MODE = m0; } catch (x) {}
    var wrap = el("div", "wx-wa"), btn = el("button", "wx-wa-btn m-" + MODE, (ICONS[MODE] || ICONS.chat) + '<span class="wx-st" aria-hidden="true"></span>');
    btn.type = "button"; btn.setAttribute("aria-label", "Chat with Woodex"); btn.setAttribute("aria-expanded", "false"); wrap.appendChild(btn);

    var panel = el("div", "wx-wa-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chat with Woodex");
    panel.innerHTML =
      '<div class="wx-wa-head"><button type="button" class="wx-back" aria-label="Back" hidden>&#8249;</button><span class="wx-wa-av">W</span><div><div class="t" id="wx-nm">Woodex Interior</div><div class="s"><i></i>' + (open ? "Design team online · replies in a few minutes" : "Away · replies from 9:30 am, Mon–Sat") + '</div></div><button type="button" class="wx-wa-x" aria-label="Close chat">&times;</button></div>' +
      '<div class="v-home"><div class="wx-wa-body"><div class="wx-wa-msg">Assalam-o-Alaikum! How would you like to talk to us?</div>' +
      '<button type="button" class="wx-opt" data-go="chat"><span class="ic ch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg></span><span><b>Live chat with a designer</b><small>Instant answers here · our team can join</small></span></button>' +
      '<button type="button" class="wx-opt" data-go="wa"><span class="ic">' + waGlyph + '</span><span><b>WhatsApp</b><small>Message us on +92 322 4000768</small></span></button>' +
      '<button type="button" class="wx-opt" data-tg hidden><span class="ic tg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.4 11.6c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z"/></svg></span><span><b>Telegram</b><small class="wx-tg-s">Chat with us on Telegram</small></span></button></div></div>' +
      '<div class="v-chat" hidden><div class="wx-ch-list" aria-live="polite"></div><div class="wx-ch-ty" aria-live="polite"></div><div class="wx-ch-q" hidden></div><form class="wx-ch-form"><input class="wx-wa-hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="button" class="wx-ch-x" data-x="file" aria-label="Send a photo or PDF" title="Send a photo or PDF"><svg viewBox="0 0 24 24"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg></button><input type="file" class="wx-ch-fi" accept="image/jpeg,image/png,image/webp,application/pdf" hidden><textarea rows="1" maxlength="2000" placeholder="Type your message…" aria-label="Message"></textarea><button type="button" class="wx-ch-x" data-x="rec" aria-label="Record a voice note" title="Record a voice note"><svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg></button><button type="submit" aria-label="Send">' + sendGlyph + '</button></form></div>' +
      '<div class="v-wa" hidden><div class="wx-wa-body"><div class="wx-wa-msg">' + esc(greet) + '</div>' +
      '<span class="wx-wa-lbl">Service</span><div class="wx-wa-chips" data-g="svc">' + SERVICES.map(function (s) { return '<button type="button" class="wx-wa-chip' + (s[0] === pageSvc ? " on" : "") + '" data-v="' + esc(s[0]) + '">' + esc(s[0]) + "</button>"; }).join("") + "</div>" +
      '<span class="wx-wa-lbl">I would like to</span><div class="wx-wa-chips" data-g="int">' + INTENTS.map(function (x, i) { return '<button type="button" class="wx-wa-chip' + (i === 0 ? " on" : "") + '" data-v="' + i + '">' + esc(x[0]) + "</button>"; }).join("") + "</div>" +
      '<div class="wx-wa-two"><input class="wx-wa-in" id="wx-wa-n" placeholder="Your name" autocomplete="name" maxlength="120" aria-label="Your name"><input class="wx-wa-in" id="wx-wa-p" type="tel" placeholder="Phone (optional)" autocomplete="tel" maxlength="40" aria-label="Phone"></div>' +
      '<textarea class="wx-wa-in" id="wx-wa-m" rows="2" placeholder="Area, city, budget or anything else (optional)" maxlength="1000" aria-label="Message"></textarea>' +
      '<input class="wx-wa-hp" id="wx-wa-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="button" class="wx-wa-send">' + sendGlyph + "Continue on WhatsApp</button></div>" +
      '<div class="wx-wa-foot">Opens WhatsApp with your message ready. Adding your phone lets us call you back.</div></div>';
    document.body.appendChild(panel); document.body.appendChild(wrap);

    var $ = function (s) { return panel.querySelector(s); };
    panel.addEventListener("click", function (e) {
      var c = e.target.closest(".wx-wa-chip"); if (!c) return;
      var g = c.parentNode, wasOn = c.classList.contains("on");
      [].forEach.call(g.querySelectorAll(".wx-wa-chip"), function (x) { x.classList.remove("on"); });
      if (!(wasOn && g.dataset.g === "svc")) c.classList.add("on"); // service can be cleared; intent always has one
    });
    function pick(g) { var c = panel.querySelector('[data-g="' + g + '"] .on'); return c ? c.getAttribute("data-v") : ""; }

    function send() {
      var name = $("#wx-wa-n").value.trim(), phone = $("#wx-wa-p").value.trim(), msg = $("#wx-wa-m").value.trim(), svc = pick("svc"), it = INTENTS[+pick("int") || 0];
      var text = "Assalam-o-Alaikum Woodex," + (name ? " this is " + name + "." : "") + "\n" + it[1] + (svc ? "\nService: " + svc : "") + (msg ? "\n" + msg : "") + "\nPage: " + title + " (" + location.origin + location.pathname + ")";
      window.open("https://wa.me/" + number + "?text=" + encodeURIComponent(text), "_blank", "noopener"); // open first: keeps popup blockers happy
      post({ action: "wa_click", page: location.pathname, service: svc });
      if (name.length >= 2 && /^[+\d][\d\s()-]{6,}$/.test(phone)) post({ form: "whatsapp", name: name, phone: phone, service: svc, message: it[0] + (msg ? " — " + msg : ""), page: location.pathname, _hp: $("#wx-wa-hp").value });
      if (window.gtag) try { window.gtag("event", "whatsapp_click", { service: svc || "none" }); } catch (e) {}
      if (window.fbq) try { window.fbq("track", "Contact"); } catch (e) {}
    }
    // ---------- views + live chat
    var CH = { greet: "Assalam-o-Alaikum and welcome to Woodex Interior. Thank you for connecting with us. Tell us a little about your space, and share your WhatsApp number. A designer from our team will join you shortly.", on: false, id: 0, tok: "", last: 0, timer: null, busy: false, joined: {}, unread: 0, asst: "" }, view = "home";
    try { CH.joined = JSON.parse(localStorage.getItem("wxJoined") || "{}") || {}; } catch (e) {}
    try { var sv = JSON.parse(localStorage.getItem("wxChat") || "null"); if (sv && sv.id && sv.tok) { CH.id = sv.id; CH.tok = sv.tok; } } catch (e) {}
    function show(v) {
      if (MODE !== "both" && v === "home") v = MODE === "whatsapp" ? "wa" : "chat";
      view = v; ["home", "chat", "wa"].forEach(function (k) { panel.querySelector(".v-" + k).hidden = k !== v; });
      $(".wx-back").hidden = v === "home" || MODE !== "both";
      if (v === "chat") { if (!CH.last && CH.id) poll(); else if (!CH.id) draw([{ who: "ai", name: "Woodex assistant", text: CH.greet }], true); setTimeout(function () { $(".wx-ch-form textarea").focus(); }, 60); startPoll(); }
      if (v === "wa") setTimeout(function () { $("#wx-wa-n").focus(); }, 50);
    }
    function chatApi(body) { return fetch("/api/chat.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
    // Human feel: typing dots for a moment (longer for longer answers), then the reply types itself out
    function human(msgs) {
      var q = (msgs || []).filter(function (m) { return !(m.id && m.id <= CH.last); });
      var lastMe = 0; q.forEach(function (m) { if (m.who === "visitor" && (m.id || 0) > lastMe) lastMe = m.id || 0; });
      var vis = q.filter(function (m) { return m.who === "visitor" || m.who === "sys" || (m.id && m.id < lastMe); }), rest = q.filter(function (m) { return vis.indexOf(m) < 0; });
      if (vis.length) draw(vis); if (!rest.length) { draw([]); return; }
      var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; if (reduce) { draw(rest); return; }
      CH.busy = true; var L = $(".wx-ch-list"), i = 0;
      (function next() {
        if (i >= rest.length) { CH.busy = false; return; }
        var m = rest[i++], n = String(m.text || "").length;
        if (!L.querySelector(".wx-typing")) { L.insertAdjacentHTML("beforeend", '<div class="wx-typing" aria-label="typing"><i></i><i></i><i></i></div>'); L.scrollTop = L.scrollHeight; }
        setTimeout(function () { draw([m], false, true); setTimeout(next, Math.min(900, n * 8) + 250); }, Math.max(700, Math.min(1800, 450 + n * 8)) + (i === 1 ? 250 : 0));
      })();
    }
    function typeOut(node, text) {
      var words = text.split(/(\s+)/), k = 0, L = $(".wx-ch-list"), step = Math.max(1, Math.ceil(words.length / 60));
      var t = setInterval(function () { k += step; node.textContent = words.slice(0, k).join(""); L.scrollTop = L.scrollHeight; if (k >= words.length) { clearInterval(t); node.textContent = text; } }, 28);
    }
    function draw(msgs, reset, anim) {
      var L = $(".wx-ch-list"); if (reset) L.innerHTML = "";
      var ty = L.querySelector(".wx-typing"); if (ty) ty.remove();
      msgs.forEach(function (m) {
        if (m.id && m.id <= CH.last) return; if (m.id) CH.last = m.id;
        if (m.who === "agent" && !CH.joined[m.name || "team"]) { CH.joined[m.name || "team"] = 1; try { localStorage.setItem("wxJoined", JSON.stringify(CH.joined)); } catch (x) {} if (!reset || CH.last) L.appendChild(el("div", "wx-join", "👋 " + esc(m.name || "A designer") + " from the Woodex team joined the chat")); }
        var d = el("div", "wx-m " + (m.who === "visitor" ? "me" : m.who === "sys" ? "sys" : m.who === "ai" ? "them ai" : "them"));
        var a = m.att && /^\/assets\/uploads\/chat\//.test(m.att.u) ? m.att : null, au = a ? esc(a.u) : "";
        var at = a ? (a.k === "img" ? '<a href="' + au + '" target="_blank" rel="noopener"><img src="' + au + '" alt="Photo"></a>' : a.k === "voice" ? '<audio controls preload="metadata" src="' + au + '"></audio>' : '<a class="wx-f" href="' + au + '" target="_blank" rel="noopener">📄 ' + esc(a.n || "File") + "</a>") : "";
        var tm = m.t ? String(m.t).slice(11, 16) : ""; if (tm) { var hh = +tm.slice(0, 2); tm = ((hh % 12) || 12) + ":" + tm.slice(3) + (hh < 12 ? " am" : " pm"); }
        d.innerHTML = (m.who === "agent" ? "<small>" + esc(m.name || "Woodex team") + " · Woodex team</small>" : m.who === "ai" && CH.asst ? "<small>" + esc(CH.asst) + "</small>" : "") + (a && /^(🎤 Voice note|📷 Photo|📎 .*)$/.test(m.text) ? "" : (anim && !a ? '<span class="tx"></span>' : esc(m.text))) + at + (tm && m.who !== "sys" ? '<span class="tm">' + tm + "</span>" : ""); L.appendChild(d);
        if (anim && !a) typeOut(d.querySelector(".tx"), String(m.text || ""));
      });
      L.scrollTop = L.scrollHeight;
    }
    function poll() { if (!CH.id || CH.busy) return; chatApi({ action: "poll", chat_id: CH.id, token: CH.tok, since: CH.last }).then(function (r) { if (r.ok) { var tyEl = $(".wx-ch-ty"); if (tyEl) tyEl.textContent = r.typing ? "A designer is typing…" : ""; if (r.messages.length) { var fresh = r.messages.filter(function (m) { return m.id > CH.last && m.who !== "visitor"; }).length; if (!CH.last || !panel.classList.contains("open") || view !== "chat") draw(r.messages, !CH.last); else human(r.messages); if (fresh && (!panel.classList.contains("open") || view !== "chat")) dotOn(fresh); } } else if (r.error === "Chat not found") { CH.id = 0; CH.tok = ""; CH.last = 0; localStorage.removeItem("wxChat"); } }).catch(function () {}); }
    function startPoll() { clearInterval(CH.timer); if (!CH.id) return; CH.timer = setInterval(poll, panel.classList.contains("open") && view === "chat" ? 3000 : 15000); }
    function dotOn(n) { CH.unread += n || 1; var b = btn.querySelector(".wx-n"); if (!b) { btn.insertAdjacentHTML("beforeend", '<span class="wx-n" aria-hidden="true"></span>'); b = btn.querySelector(".wx-n"); } b.textContent = CH.unread > 9 ? "9+" : CH.unread; btn.setAttribute("aria-label", "Chat with Woodex, " + CH.unread + " new message" + (CH.unread > 1 ? "s" : "")); tease(true); }
    panel.querySelector(".v-home").addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) show(b.dataset.go); });
    $(".wx-back").addEventListener("click", function () { show("home"); startPoll(); });
    var ta = $(".wx-ch-form textarea");
    ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; });
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $(".wx-ch-form").requestSubmit ? $(".wx-ch-form").requestSubmit() : $(".wx-ch-form button").click(); } });
    // P18 D: typing status + photo / PDF / voice note (after the first message, when the chat exists)
    var lastTy = 0; ta.addEventListener("input", function () { if (CH.id && Date.now() - lastTy > 3000) { lastTy = Date.now(); chatApi({ action: "typing", chat_id: CH.id, token: CH.tok }).catch(function () {}); } });
    // P20: offline / error fallback, so the visitor always gets a helpful answer and the lead is saved
    var FB = { asked: false, saved: false };
    function fallback(t) {
      var L = $(".wx-ch-list"), ty = L.querySelector(".wx-typing"); if (ty) ty.remove();
      var me = el("div", "wx-m me"); me.textContent = t; L.appendChild(me);
      var ph = (t.replace(/[\s-]/g, "").match(/(\+?92|0)3\d{9}/) || [])[0], reply;
      if (ph && !FB.saved) { FB.saved = true; post({ form: "whatsapp", name: "Website chat visitor", phone: ph, service: "Live chat", message: "Live chat (offline): " + t, page: location.pathname });
        reply = "Thank you! We have your number " + ph + ". A Woodex designer will message you on WhatsApp " + (open ? "shortly" : "from 9:30 am (Mon–Sat)") + ". Anything you would like us to know about your space?"; }
      else if (FB.saved) reply = "Noted, thank you. Our team will continue with you on WhatsApp soon.";
      else { reply = FB.asked ? "To connect you with a designer, please type your WhatsApp number (for example 0300 1234567)." : "Thank you for your message! Please share your WhatsApp number and a Woodex designer will join you shortly."; FB.asked = true; }
      var d = el("div", "wx-m them"); d.innerHTML = "<small>Woodex assistant</small>" + esc(reply); L.appendChild(d); L.scrollTop = L.scrollHeight;
    }
    function sys(t) { var L = $(".wx-ch-list"), d = el("div", "wx-m sys"); d.textContent = t; L.appendChild(d); L.scrollTop = L.scrollHeight; }
    function sendFile(blob, name, voice) {
      if (!CH.id) return sys("Please type a short message first, then you can send photos or voice notes.");
      if (blob.size > 8 * 1024 * 1024) return sys("Files must be 8 MB or smaller.");
      var L = $(".wx-ch-list"), w = el("div", "wx-m me"); w.textContent = voice ? "Sending voice note…" : "Sending " + name + "…"; L.appendChild(w); L.scrollTop = L.scrollHeight;
      var fr = new FileReader(); fr.onload = function () {
        chatApi({ action: "file", chat_id: CH.id, token: CH.tok, data: String(fr.result).split(",")[1], name: name, voice: voice ? 1 : 0, since: CH.last }).then(function (r) { w.remove(); if (!r.ok) return sys(r.error || "Could not send the file."); draw(r.messages); startPoll(); }).catch(function () { w.remove(); sys("Connection problem. Please try again."); });
      }; fr.readAsDataURL(blob);
    }
    var fi = $(".wx-ch-fi"), rec = null;
    fi.addEventListener("change", function () { var f = fi.files[0]; fi.value = ""; if (f) sendFile(f, f.name, false); });
    $(".wx-ch-form").addEventListener("click", function (e) {
      var b = e.target.closest(".wx-ch-x"); if (!b) return; e.preventDefault();
      if (b.dataset.x === "file") return fi.click();
      if (rec) return rec.stop();
      if (!CH.id) return sys("Please type a short message first, then you can send photos or voice notes.");
      if (!navigator.mediaDevices || !window.MediaRecorder) return sys("Voice notes are not supported in this browser.");
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        var ty = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].filter(function (x) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0] || "";
        var mr = new MediaRecorder(st, ty ? { mimeType: ty } : {}), parts = [], t0 = Date.now(), tk; rec = mr; b.classList.add("rec");
        var lab = function () { var s = Math.round((Date.now() - t0) / 1000); b.lastChild.nodeType === 3 ? (b.lastChild.textContent = "● " + s + "s Stop") : b.appendChild(document.createTextNode("● " + s + "s Stop")); if (s >= 120) mr.stop(); }; lab(); tk = setInterval(lab, 500);
        mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) parts.push(ev.data); };
        mr.onstop = function () { clearInterval(tk); rec = null; st.getTracks().forEach(function (x) { x.stop(); }); b.classList.remove("rec"); if (b.lastChild.nodeType === 3) b.removeChild(b.lastChild);
          var bl = new Blob(parts, { type: (mr.mimeType || "audio/webm").split(";")[0] }); if (Date.now() - t0 < 700 || !bl.size) return; sendFile(bl, "Voice note", true); };
        mr.start(250);
      }).catch(function () { sys("Microphone permission was blocked."); });
    });
    $(".wx-ch-form").addEventListener("submit", function (e) {
      e.preventDefault(); var t = ta.value.trim(); if (!t || CH.busy) return; ta.value = ""; ta.style.height = "auto";
      var L = $(".wx-ch-list"), mine = el("div", "wx-m me"); mine.textContent = t; L.appendChild(mine); L.insertAdjacentHTML("beforeend", '<div class="wx-typing" aria-label="typing"><i></i><i></i><i></i></div>'); L.scrollTop = L.scrollHeight;
      CH.busy = true;
      chatApi({ action: "send", chat_id: CH.id || 0, token: CH.tok, text: t, page: location.pathname, since: CH.last, _hp: $(".wx-ch-form [name=hp]").value }).then(function (r) {
        CH.busy = false; mine.remove();
        if (r && r.ok && !r.messages) return fallback(t);
        if (!r.ok && !CH.on) return fallback(t);
        if (!r.ok) { var ty = L.querySelector(".wx-typing"); if (ty) ty.remove(); var er = el("div", "wx-m sys"); er.innerHTML = esc(CH.on ? (r.error || "Could not send.") : "Our live team is away right now.") + ' <a href="https://wa.me/' + number + '?text=' + encodeURIComponent(t) + '" target="_blank" rel="noopener" style="font-weight:700;color:#0c1628">Continue on WhatsApp →</a>'; L.appendChild(er); return; }
        if (r.token) { CH.id = r.chat_id; CH.tok = r.token; CH.last = 0; localStorage.setItem("wxChat", JSON.stringify({ id: CH.id, tok: CH.tok })); L.innerHTML = ""; }
        human(r.messages); startPoll();
        if (window.gtag && r.token) try { window.gtag("event", "chat_start"); } catch (x) {}
      }).catch(function () { CH.busy = false; mine.remove(); fallback(t); });
    });
    function goTg() { // continue this chat on Telegram (same conversation) or just open the bot
      var w = window.open("about:blank", "_blank");
      var fin = function (u) { if (w) w.location = u; else location.href = u; };
      if (!CH.id) return fin("https://t.me/" + CH.tg.bot);
      chatApi({ action: "tglink", chat_id: CH.id, token: CH.tok }).then(function (r) { fin(r && r.ok ? r.link : "https://t.me/" + CH.tg.bot); }).catch(function () { fin("https://t.me/" + CH.tg.bot); });
    }
    function quick(r) {
      var q = (r.quick || []).slice(0, 6), box = $(".wx-ch-q"); if (!box || (!q.length && !r.tg)) return;
      box.innerHTML = q.map(function (x, i) { return '<button type="button" data-q="' + i + '">' + esc(x.label) + "</button>"; }).join("") + (r.tg ? '<button type="button" class="tg" data-qtg>Continue on Telegram</button>' : "");
      box.hidden = false;
      box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.hasAttribute("data-qtg")) return goTg(); var x = q[+b.dataset.q]; if (!x) return; ta.value = x.text || x.label; $(".wx-ch-form").requestSubmit ? $(".wx-ch-form").requestSubmit() : $(".wx-ch-form button[type=submit]").click(); });
    }
    chatApi({ action: "cfg" }).then(function (r) {
      if (r && r.ok && r.site) setMode(r.site);
      if (r && r.ok && r.tg && r.tg.bot) { CH.tg = r.tg; var t = panel.querySelector("[data-tg]"); t.hidden = false; if (r.tg.waDown) panel.querySelector(".wx-tg-s").textContent = "WhatsApp is busy right now: reach us on Telegram"; t.addEventListener("click", goTg); }
      if (r && r.ok && r.on) quick(r);
      if (r && r.ok && r.assistant && r.assistant.name) { CH.asst = r.assistant.name + (r.assistant.role ? " · " + r.assistant.role : ""); $("#wx-nm").textContent = r.assistant.name + " · Woodex Interior"; $(".wx-wa-av").textContent = r.assistant.name.charAt(0).toUpperCase(); }
      if (r && r.ok && r.on && !CH.id) setTimeout(function () { tease(false, r.assistant && r.assistant.name); }, 7000);
      CH.on = !!(r && r.ok && r.on); CH.greet = (r && r.greeting) || CH.greet; show(CH.on && CH.id ? "chat" : "home"); if (CH.on && CH.id) { poll(); startPoll(); }
    }).catch(function () { show("home"); });
    // One contact button, chosen in Admin → Telegram → Website contact button: chat | whatsapp | telegram
    function setMode(st) {
      MODE = st.mode || "chat"; try { sessionStorage.setItem("wxMode", MODE); } catch (x) {}
      if (st.tgLink) { SITE_TG = st.tgLink; SITE_TGBOT = !!st.tgBot; }
      btn.querySelector("svg").outerHTML = ICONS[MODE] || ICONS.chat; btn.className = "wx-wa-btn m-" + MODE;
      btn.setAttribute("aria-label", MODE === "whatsapp" ? "Message Woodex on WhatsApp" : MODE === "telegram" ? "Message Woodex on Telegram" : "Chat with Woodex");
      if (MODE !== "both") show(MODE === "whatsapp" ? "wa" : "chat");
    }
    function openTg() { var w = window.open("about:blank", "_blank"); var fin = function (u) { if (w) w.location = u; else location.href = u; };
      if (!SITE_TGBOT || !CH.id) return fin(SITE_TG); chatApi({ action: "tglink", chat_id: CH.id, token: CH.tok }).then(function (r) { fin(r && r.ok ? r.link : SITE_TG); }).catch(function () { fin(SITE_TG); }); }
    function toggle(force) {
      if (MODE === "telegram" && force !== false) { tease(true); return openTg(); }
      var o = typeof force === "boolean" ? force : !panel.classList.contains("open");
      panel.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o));
      var dot = btn.querySelector(".wx-n"); if (o && dot) { dot.remove(); CH.unread = 0; btn.setAttribute("aria-label", "Chat with Woodex"); } if (o) tease(true);
      if (o && view === "wa") setTimeout(function () { $("#wx-wa-n").focus(); }, 50);
      if (o && view === "chat") { poll(); setTimeout(function () { ta.focus(); }, 60); } startPoll();
    }
    // P40 B: one gentle greeting bubble per visit (not when a chat already exists or the panel is open)
    function tease(hide, nm) {
      var t = wrap.querySelector(".wx-tease"); if (hide) { if (t) t.remove(); return; }
      if (t || panel.classList.contains("open") || CH.id) return; try { if (sessionStorage.getItem("wxTease")) return; sessionStorage.setItem("wxTease", "1"); } catch (x) {}
      t = el("div", "wx-tease", "<b>" + (open ? "👋 Planning a space?" : "👋 Leave us a message") + "</b><span>" + (open ? (nm ? esc(nm) + " and our designers are" : "Our designers are") + " online. Ask anything." : "We reply from 9:30 am, Mon–Sat.") + '</span><button type="button" aria-label="Dismiss">×</button>');
      wrap.appendChild(t); t.addEventListener("click", function (e) { t.remove(); if (!e.target.closest("button")) { toggle(true); if (CH.on) show("chat"); } });
      setTimeout(function () { if (t.isConnected) t.remove(); }, 15000);
    }
    btn.addEventListener("click", function () { toggle(); });
    $(".wx-wa-x").addEventListener("click", function () { toggle(false); });
    $(".wx-wa-send").addEventListener("click", send);
    $("#wx-wa-m").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
    // other page buttons can open it: <a href="#whatsapp"> or [data-wa-open]
    document.addEventListener("click", function (e) { var a = e.target.closest('a[href="#whatsapp"],[data-wa-open]'); if (a) { e.preventDefault(); toggle(true); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
