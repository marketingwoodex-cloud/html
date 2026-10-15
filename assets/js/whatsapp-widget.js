/* Woodex WhatsApp handoff widget.
 * Floating chat button on every public page. Opens a small panel with quick
 * replies; sending hands off to WhatsApp (wa.me) with a prefilled message.
 * The number comes from /assets/js/site-config.js (dashboard Settings),
 * falling back to the studio default. No tracking, no storage.
 */
(function () {
  "use strict";
  if (window.__wxWaWidget) return;
  window.__wxWaWidget = true;

  var DEFAULT_NUMBER = "923224000768";

  function loadConfig(done) {
    var cfg = window.WOODEX_CONFIG || null;
    if (cfg) { done(cfg); return; }
    var s = document.createElement("script");
    s.src = "/assets/js/site-config.js";
    s.onload = function () { done(window.WOODEX_CONFIG || {}); };
    s.onerror = function () { done({}); };
    document.head.appendChild(s);
  }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function init(cfg) {
    if (cfg.whatsapp_widget === false) return;
    if (location.pathname.indexOf("/admin") === 0) return;
    var number = String((cfg && cfg.whatsapp) || DEFAULT_NUMBER).replace(/\D/g, "") || DEFAULT_NUMBER;

    var css = [
      ".wx-wa{position:fixed;right:18px;bottom:18px;z-index:9990;font-family:inherit}",
      ".wx-wa-btn{width:58px;height:58px;border-radius:50%;border:0;background:#0a0f1e;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(10,15,30,.35)}",
      ".wx-wa-btn svg{width:30px;height:30px;fill:#fff}",
      ".wx-wa-btn:hover{transform:scale(1.05)}",
      ".wx-wa-panel{position:fixed;right:18px;bottom:88px;z-index:9990;width:320px;max-width:calc(100vw - 36px);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(10,15,30,.25);display:none}",
      ".wx-wa-panel.open{display:block}",
      ".wx-wa-head{background:#0a0f1e;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}",
      ".wx-wa-head .t{font-weight:700;font-size:15px}",
      ".wx-wa-head .s{font-size:12px;opacity:.75}",
      ".wx-wa-x{margin-left:auto;background:none;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}",
      ".wx-wa-body{padding:14px 14px 10px;background:#f4f5f7}",
      ".wx-wa-msg{background:#fff;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.5;color:#0a0f1e;box-shadow:0 1px 2px rgba(0,0,0,.06);margin-bottom:10px}",
      ".wx-wa-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}",
      ".wx-wa-chip{border:1px solid #0a0f1e;background:#fff;color:#0a0f1e;border-radius:999px;padding:7px 12px;font-size:13px;cursor:pointer}",
      ".wx-wa-chip:hover{background:#0a0f1e;color:#fff}",
      ".wx-wa-row{display:flex;gap:8px}",
      ".wx-wa-in{flex:1;border:1px solid #dfe2e8;border-radius:999px;padding:9px 14px;font-size:14px;outline:none}",
      ".wx-wa-in:focus{border-color:#0a0f1e}",
      ".wx-wa-send{width:42px;height:42px;border-radius:50%;border:0;background:#0a0f1e;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}",
      ".wx-wa-send svg{width:18px;height:18px;fill:#fff}",
      ".wx-wa-foot{padding:8px 14px 12px;background:#f4f5f7;font-size:11px;color:#8a8f9c;text-align:center}"
    ].join("\n");
    var style = el("style", null, css);
    document.head.appendChild(style);

    var waGlyph = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.6 2 6.5L4 29l7.7-2c1.8 1 3.9 1.6 6.1 1.6h.2c6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.6 1.2 1.2-4.4-.3-.4c-1.1-1.7-1.6-3.6-1.6-5.6 0-5.6 4.6-10.2 10.2-10.2 5.6 0 10.2 4.6 10.2 10.2 0 5.6-4.6 10.2-10.2 10.2zm5.6-7.6c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.2-.9.5-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.4c.2.2 2.3 3.5 5.5 4.9 1.3.6 2 .7 2.7.6.5-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.7-.4z"/></svg>';
    var sendGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20l18-8L3 4v6l12 2-12 2v6z"/></svg>';

    var wrap = el("div", "wx-wa");
    var btn = el("button", "wx-wa-btn", waGlyph);
    btn.type = "button";
    btn.setAttribute("aria-label", "Chat with Woodex on WhatsApp");
    wrap.appendChild(btn);

    var panel = el("div", "wx-wa-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "WhatsApp chat");
    var head = el("div", "wx-wa-head",
      '<div><div class="t">Woodex Interior</div><div class="s">Typically replies within a few hours</div></div>');
    var x = el("button", "wx-wa-x", "&times;");
    x.type = "button";
    x.setAttribute("aria-label", "Close chat");
    head.appendChild(x);
    var body = el("div", "wx-wa-body");
    body.appendChild(el("div", "wx-wa-msg", "Assalam-o-Alaikum! Tell us about your space and we will take it from there."));
    var chips = el("div", "wx-wa-chips");
    ["Get a quote", "Book a site visit", "Ask a question"].forEach(function (label) {
      var c = el("button", "wx-wa-chip", label);
      c.type = "button";
      c.addEventListener("click", function () { send(label); });
      chips.appendChild(c);
    });
    body.appendChild(chips);
    var row = el("div", "wx-wa-row");
    var input = el("input", "wx-wa-in");
    input.type = "text";
    input.placeholder = "Type your message";
    input.setAttribute("aria-label", "Type your message");
    var sendBtn = el("button", "wx-wa-send", sendGlyph);
    sendBtn.type = "button";
    sendBtn.setAttribute("aria-label", "Send via WhatsApp");
    row.appendChild(input);
    row.appendChild(sendBtn);
    body.appendChild(row);
    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(el("div", "wx-wa-foot", "Opens WhatsApp with your message ready to send."));
    document.body.appendChild(panel);
    document.body.appendChild(wrap);

    function send(text) {
      text = String(text || "").trim();
      if (!text) return;
      var url = "https://wa.me/" + number + "?text=" + encodeURIComponent(text);
      window.open(url, "_blank", "noopener");
    }

    function toggle(force) {
      var open = typeof force === "boolean" ? force : !panel.classList.contains("open");
      panel.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    }

    btn.addEventListener("click", function () { toggle(); });
    x.addEventListener("click", function () { toggle(false); });
    sendBtn.addEventListener("click", function () { send(input.value); input.value = ""; });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { send(input.value); input.value = ""; }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggle(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { loadConfig(init); });
  } else {
    loadConfig(init);
  }
})();
