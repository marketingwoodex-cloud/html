/* Woodex site enhancements — progressive only. All content is fully visible without this file. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  html.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* Page-specific js hooks (mirror the original gating classes). */
  var page = doc.body.getAttribute('data-page') || '';
  var jsHooks = {
    home: 'home-js', kitchen: 'kd-js', officeInterior: 'oi-js', commercialInterior: 'ci-js',
    coworking: 'cw-js', showroom: 'sr-js', shoppingMall: 'mm-js', retail: 'rt-js',
    cafe: 'cf-js', hotel: 'ht-js', beautySalon: 'bs-js', spa: 'sp-js', gym: 'gy-js',
    healthcare: 'hc-js', restaurant: 'rs-js', homeRefurbishment: 'hr-js', architecture: 'arch-js'
  };
  if (jsHooks[page]) html.classList.add(jsHooks[page]);

  /* Scroll reveals — same classes and thresholds as the original build. */
  var revealSpecs = [
    ['kd-motion-ready', '.kd-reveal'], ['bd-motion-ready', '.bd-reveal'],
    ['lr-motion-ready', '.lr-reveal'], ['dr-motion-ready', '.dr-reveal'],
    ['ho-motion-ready', '.ho-reveal'], ['kr-motion-ready', '.kr-reveal'],
    ['bs-motion-ready', '.bs-reveal'], ['oi-motion-ready', '.oi-reveal'],
    ['ci-motion-ready', '.ci-reveal'], ['cw-motion-ready', '.cw-reveal'],
    ['sr-motion-ready', '.sr-reveal'], ['mm-motion-ready', '.mm-reveal'],
    ['rt-motion-ready', '.rt-reveal'], ['cf-motion-ready', '.cf-reveal'],
    ['ht-motion-ready', '.ht-reveal'], ['sp-motion-ready', '.sp-reveal'],
    ['gy-motion-ready', '.gy-reveal'], ['hc-motion-ready', '.hc-reveal'],
    ['rs-motion-ready', '.rs-reveal'], ['hr-motion-ready', '.hr-reveal'],
    ['rv-motion-ready', '.rv-reveal'], ['as-motion-ready', '.as-reveal'],
    ['fo-motion-ready', '.fo-reveal'], ['reno-motion-ready', '.reno-reveal'],
    ['arch-motion-ready', '.arch-reveal'], ['id-motion-ready', '.id-reveal'],
    ['ch-motion-ready', '[data-ch-reveal]'], ['about-motion-ready', '[data-about-reveal]'],
    ['contact-motion-ready', '[data-contact-reveal]'],
    ['fitout-hub-motion-ready', '[data-hub-reveal]'],
    ['home-motion-ready', '[data-home-reveal]'],
    ['home-svc-motion-ready', '[data-svc-reveal]'],
    ['ih-motion-ready', '[data-ih-reveal]'], ['in-motion-ready', '[data-in-reveal]'],
    ['ph-motion-ready', '[data-ph-reveal]'], ['st-motion-ready', '[data-st-reveal]'],
    ['ct-motion-ready', '[data-ct-reveal]'],
    ['fitout-motion-ready', '.fitout-word-inner,#fitout-about .fitout-intro-copy,#fitout-includes .fitout-scope-card,#fitout-business .fitout-business,#fitout-cost .fitout-price-card,#fitout-compare .fitout-compare-card,#fitout-faq .faq-item,#fitout-quote .fitout-contact,#fitout-quote .fitout-quote-form']
  ];
  if (!reduceMotion && hasIO) {
    revealSpecs.forEach(function (spec) {
      var els = doc.querySelectorAll(spec[1]);
      if (!els.length) return;
      html.classList.add(spec[0]);
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
      Array.prototype.forEach.call(els, function (el) { io.observe(el); });
    });
    var animEls = doc.querySelectorAll('[data-anim]');
    if (animEls.length) {
      html.classList.add('anim-ready');
      var aio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); aio.unobserve(e.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
      Array.prototype.forEach.call(animEls, function (el) { aio.observe(el); });
    }
  }

  /* P38 template slider heroes (.wxh--slider) */
  Array.prototype.forEach.call(doc.querySelectorAll('.wxh--slider'), function (h) {
    var ss = Array.prototype.slice.call(h.querySelectorAll('.wxh-slide')), ds = Array.prototype.slice.call(h.querySelectorAll('.wxh-dot')), i = 0, t = null;
    if (ss.length < 2) return;
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, ms = Math.max(3, Math.min(15, Number(h.getAttribute('data-interval')) || 6)) * 1000;
    function go(n) { i = (n + ss.length) % ss.length; ss.forEach(function (s, k) { s.classList.toggle('is-on', k === i); s.setAttribute('aria-hidden', String(k !== i)); }); ds.forEach(function (d, k) { d.classList.toggle('is-on', k === i); d.setAttribute('aria-current', String(k === i)); }); }
    function run() { if (!rm && !t) t = setInterval(function () { if (doc.visibilityState === 'visible') go(i + 1); }, ms); }
    function halt() { clearInterval(t); t = null; }
    ds.forEach(function (d, k) { d.addEventListener('click', function () { go(k); halt(); run(); }); });
    h.addEventListener('mouseenter', halt); h.addEventListener('mouseleave', run);
    go(0); run();
  });

  /* Home hero slider — first slide is active in markup; this adds rotation. */
  var hero = doc.getElementById('hm-hero');
  if (hero) {
    var slides = Array.prototype.slice.call(hero.querySelectorAll('[data-home-slide]:not([data-hm-off])'));
    var hmInt = Math.max(3, Math.min(15, Number(hero.getAttribute('data-interval')) || 5)) * 1000;
    var dots = Array.prototype.slice.call(hero.querySelectorAll('[data-home-dot]'));
    var prev = doc.getElementById('hm-hero-prev'), next = doc.getElementById('hm-hero-next');
    var idx = 0, paused = false, timer = null;
    function show(i, user) {
      if (!slides.length) return;
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === idx;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
      });
      dots.forEach(function (d, k) {
        var on = k === idx;
        d.classList.toggle('is-active', on);
        d.setAttribute('aria-current', String(on));
      });
      if (user && !reduceMotion) restart();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      if (reduceMotion || paused || timer || !slides.length) return;
      timer = setInterval(function () {
        if (doc.visibilityState === 'visible') show(idx + 1, false);
      }, hmInt);
    }
    function restart() { stop(); start(); }
    dots.forEach(function (d) {
      d.addEventListener('click', function () { show(Number(d.getAttribute('data-home-dot')), true); });
    });
    if (prev) prev.addEventListener('click', function () { show(idx - 1, true); });
    if (next) next.addEventListener('click', function () { show(idx + 1, true); });
    hero.addEventListener('mouseenter', function () { paused = true; stop(); });
    hero.addEventListener('mouseleave', function () { paused = false; start(); });
    hero.addEventListener('touchstart', function () { paused = true; stop(); }, { passive: true });
    hero.addEventListener('touchend', function () { paused = false; start(); }, { passive: true });
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden') stop(); else start();
    });
    show(0, false); start();
  }

  /* Generic card-track carousels (prev/next/status wired by id convention). */
  function visibleCount(track) {
    var cards = track.children;
    if (!cards.length) return 1;
    var vp = track.parentElement;
    var w = cards[0].getBoundingClientRect().width || cards[0].offsetWidth || 300;
    var gap = parseFloat(getComputedStyle(track).gap) || 16;
    return Math.max(1, Math.round((vp.clientWidth + gap) / (w + gap)));
  }
  Array.prototype.forEach.call(doc.querySelectorAll('button[id$="-prev"]'), function (prevBtn) {
    var base = prevBtn.id.slice(0, -5);
    var track = doc.getElementById(base + '-track');
    if (!track || !track.children.length) return;
    var nextBtn = doc.getElementById(base + '-next');
    var status = doc.getElementById(base + '-status');
    var cards = Array.prototype.slice.call(track.children);
    var at = 0;
    function update(skip) {
      var max = Math.max(0, cards.length - visibleCount(track));
      at = Math.max(0, Math.min(at, max));
      if (skip) track.style.transition = 'none';
      track.style.transform = 'translate3d(' + (-cards[at].offsetLeft) + 'px,0,0)';
      if (skip) requestAnimationFrame(function () { track.style.transition = ''; });
      prevBtn.disabled = at === 0;
      if (nextBtn) nextBtn.disabled = at === max;
      if (status) status.textContent = String(at + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
      track.dispatchEvent(new CustomEvent('wx-slide', { detail: at }));
    }
    prevBtn.addEventListener('click', function () { at--; update(false); kick(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { at++; update(false); kick(); });
    /* v26 Phase 3: autoplay (5 s) while on screen; pauses on hover, focus or touch; loops to the start. */
    var section = track.parentElement, hold = false, inView = false, auto = null;
    function tick() {
      if (hold || !inView || doc.visibilityState !== 'visible') return;
      var max = Math.max(0, cards.length - visibleCount(track));
      if (max === 0) return;
      at = at >= max ? 0 : at + 1; update(false);
    }
    function kick() { if (auto) clearInterval(auto); auto = reduceMotion ? null : setInterval(tick, 5000); }
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) { section.addEventListener(ev, function () { hold = true; }, { passive: true }); });
    ['mouseleave', 'focusout', 'touchend'].forEach(function (ev) { section.addEventListener(ev, function () { hold = false; }, { passive: true }); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; }, { threshold: 0.35 }).observe(track.parentElement);
    /* Swipe on touch screens */
    var sx = null;
    section.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    section.addEventListener('touchend', function (e) {
      if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 45) { at += dx < 0 ? 1 : -1; update(false); kick(); }
    }, { passive: true });
    kick();
    window.addEventListener('resize', function () { update(true); });
    update(true);
  });

  /* FAQ accordions. */
  Array.prototype.forEach.call(doc.querySelectorAll('button[class*="faq-q"]'), function (btn) {
    btn.addEventListener('click', function () {
      var scope = btn.closest('section') || doc;
      var open = btn.getAttribute('aria-expanded') === 'true';
      Array.prototype.forEach.call(scope.querySelectorAll('button[class*="faq-q"]'), function (b) {
        b.setAttribute('aria-expanded', 'false');
      });
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* Site forms → /api/forms.php (saved to Woodex Admin), then an optional "Continue on WhatsApp" button. */
  var WA_NUMBER = '923224000768';
  var WXForms = window.WXForms = {
    cfg: null,
    config: function () {
      if (!WXForms.cfg) WXForms.cfg = fetch('/api/forms.php', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
      return WXForms.cfg;
    },
    /* Adds a Cloudflare Turnstile check to the form, only when the site key is set in the admin. */
    guard: function (form) {
      if (!form) return;
      WXForms.config().then(function (c) {
        if (!c || !c.turnstile || form.querySelector('.cf-turnstile')) return;
        var box = doc.createElement('div'); box.className = 'cf-turnstile'; box.setAttribute('data-sitekey', c.turnstile); box.style.margin = '12px 0';
        var btn = form.querySelector('[type=submit]'); (btn && btn.parentNode === form ? form : (btn ? btn.parentNode : form)).insertBefore(box, btn && btn.parentNode !== form ? btn : (btn || null));
        if (!doc.getElementById('cf-ts')) { var sc = doc.createElement('script'); sc.id = 'cf-ts'; sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; sc.async = true; sc.defer = true; doc.head.appendChild(sc); }
        else if (window.turnstile) window.turnstile.render(box);
      });
    },
    send: function (key, data, form) {
      data.form = key; data.page = location.pathname;
      var t = form && form.querySelector('[name="cf-turnstile-response"]'); if (t) data['cf-turnstile-response'] = t.value;
      return fetch('/api/forms.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || 'Could not send.'); return d; }); })
        .finally(function () { if (window.turnstile && form && form.querySelector('.cf-turnstile')) try { window.turnstile.reset(form.querySelector('.cf-turnstile')); } catch (e) {} });
    },
    waLink: function (data, id, lines) {
      var msg = ['Hi Woodex, I just sent an enquiry on your website' + (id ? ' (ref #' + id + ')' : '') + '.', 'Name: ' + (data.name || '')].concat(lines || []).join('\n');
      return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
    },
    /* Renders the thank-you box with the WhatsApp button into el. */
    success: function (el, data, id, lines) {
      if (!el) return;
      el.innerHTML = '<strong style="display:block;font-size:16px;margin-bottom:4px">Thank you' + (data.name ? ', ' + String(data.name).split(' ')[0].replace(/[<>&"]/g, '') : '') + '. Your enquiry has been received.</strong>' +
        '<span style="display:block;margin-bottom:12px">We will call you within one working day' + (id ? ' (reference #' + id + ')' : '') + '. Want a faster reply?</span>' +
        '<a class="wx-wa-btn" target="_blank" rel="noopener" href="' + WXForms.waLink(data, id, lines) + '" style="display:inline-flex!important;align-items:center;gap:8px;width:auto!important;height:auto!important;min-width:0;background:#25d366!important;color:#fff!important;font-weight:700;font-size:15px;line-height:1.2;padding:12px 20px!important;border-radius:999px!important;white-space:nowrap;text-decoration:none;box-shadow:none">' +
        '<svg width="18" height="18" style="flex:none;width:18px;height:18px" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.3-.6-.4zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.8 9.8 0 1 1 8.3 4.6zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.9L.1 24l6.3-1.6a11.8 11.8 0 0 0 5.6 1.4A11.8 11.8 0 0 0 20.4 3.6z"/></svg>Continue on WhatsApp</a>';
      el.style.display = 'block'; el.classList.add('show'); el.setAttribute('role', 'status');
    }
  };
  function wireForm(id, statusId, key, pick) {
    var form = doc.getElementById(id);
    if (!form) return;
    WXForms.guard(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var d = {}; new FormData(form).forEach(function (v, k) { if (k !== 'cf-turnstile-response') d[k] = String(v); });
      var st = doc.getElementById(statusId), btn = form.querySelector('[type=submit]'), label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      var extra = pick(d);
      WXForms.send(key, d, form).then(function (r) {
        form.reset(); WXForms.success(st, d, r.id, extra);
      }).catch(function (err) {
        if (st) { st.textContent = err.message + ' You can also WhatsApp us on +92 322 4000768.'; st.style.display = 'block'; st.classList.add('show'); }
      }).finally(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    });
  }
  /* Forms added with the page builder ("Contact form" element) → same pipeline: honeypot, Turnstile, CRM, WhatsApp. */
  Array.prototype.forEach.call(doc.querySelectorAll('form.wx-form, form[action="/api/contact"]'), function (form) {
    if (form.dataset.wxWired) return; form.dataset.wxWired = '1';
    form.setAttribute('action', '/api/forms.php'); form.setAttribute('novalidate', '');
    if (!form.querySelector('[name="_hp"]')) { var hp = doc.createElement('input'); hp.type = 'text'; hp.name = '_hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'; form.appendChild(hp); }
    var st = doc.createElement('div'); st.className = 'wx-form-status'; st.setAttribute('aria-live', 'polite'); st.style.cssText = 'display:none;margin-top:12px;padding:14px 16px;border-radius:10px;background:#f3efe6;color:#0a0f1e;font-size:15px;line-height:1.5'; form.after(st);
    WXForms.guard(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var d = {}; new FormData(form).forEach(function (v, k) { if (k !== 'cf-turnstile-response') d[k] = String(v); });
      if (!d.service) d.service = form.getAttribute('data-wx-service') || (doc.title || '').split('|')[0].trim();
      var btn = form.querySelector('[type=submit]'), label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      WXForms.send(form.getAttribute('data-wx-form') || 'website', d, form).then(function (r) {
        form.reset(); WXForms.success(st, d, r.id, d.service ? ['Page: ' + d.service] : []);
      }).catch(function (err) {
        st.textContent = err.message + ' You can also WhatsApp us on +92 322 4000768.'; st.style.display = 'block';
      }).finally(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    });
  });
  wireForm('brief-form', 'form-status', 'brief', function (d) { d.message = d.details || ''; delete d.details; return ['Service: ' + (d.service || '-'), 'Timeline: ' + (d.timeline || '-')]; });
  wireForm('fitout-quote-form', 'fitout-form-status', 'office-fitout', function (d) { d.service = 'Office fit-out'; d.message = d.notes || ''; delete d.notes; return ['Office fit-out: ' + (d.location || '') + (d.size ? ', ' + d.size : ''), 'Budget: ' + (d.budget || '-')]; });
  wireForm('fitout-hub-form', 'fitout-hub-form-status', 'fitout-hub', function (d) { d.service = 'Fit-out: ' + (d.sector || ''); d.message = d.details || ''; delete d.details; return ['Fit-out: ' + (d.sector || '') + ', ' + (d.location || '')]; });

  /* Fit-Out hero title word animation. */
  var fitoutTitle = doc.getElementById('fitout-hero-title');
  if (fitoutTitle && !reduceMotion) {
    var words = fitoutTitle.textContent.trim().split(/\s+/);
    fitoutTitle.textContent = '';
    words.forEach(function (word, i) {
      var outer = doc.createElement('span'), inner = doc.createElement('span');
      outer.className = 'fitout-word'; inner.className = 'fitout-word-inner';
      inner.textContent = word; inner.style.transitionDelay = (i * 70) + 'ms';
      outer.appendChild(inner); fitoutTitle.appendChild(outer);
      if (i < words.length - 1) fitoutTitle.appendChild(doc.createTextNode(' '));
    });
  }

  /* Mobile menu label: keep aria-expanded in sync (checkbox does the work). */
  var menuCb = doc.getElementById('menu-cb');
  var menuLabel = doc.querySelector('label.menu-toggle');
  if (menuCb && menuLabel) {
    menuCb.addEventListener('change', function () {
      var open = menuCb.checked;
      menuLabel.setAttribute('aria-expanded', String(open));
      menuLabel.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      doc.body.classList.toggle('menu-open', open);
    });
    menuLabel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menuCb.checked = !menuCb.checked; menuCb.dispatchEvent(new Event('change')); }
    });
    Array.prototype.forEach.call(doc.querySelectorAll('#mobile-menu a'), function (a) {
      a.addEventListener('click', function () {
        menuCb.checked = false;
        menuCb.dispatchEvent(new Event('change'));
      });
    });
  }
})();

/* (Page views are measured by the GA4 / Tag Manager codes set in Woodex Admin → Settings → Integrations.
   The builder theme is a static /assets/theme.css link, so no runtime theme loader is needed.) */

/* WhatsApp handoff widget — loads on every public page. */
(function () {
  if (location.pathname.indexOf("/admin") === 0) return;
  var s = document.createElement("script");
  s.src = "/assets/js/whatsapp-widget.js?v=p41c";
  s.defer = true;
  document.head.appendChild(s);
})();

/* v26 theme: alternate white / cream on light sections only (dark sections untouched) */
(function(){
  function run(){
    if(window.self!==window.top)return;
    var secs=[].slice.call(document.querySelectorAll('main > section, main > div > section'));
    var n=0;
    secs.forEach(function(s){
      var bg=getComputedStyle(s).backgroundColor, img=getComputedStyle(s).backgroundImage;
      var white=(bg==='rgb(255, 255, 255)'||bg==='rgba(0, 0, 0, 0)')&&img==='none';
      if(!white){n=0;return;}
      if(s.querySelector(':scope > img, :scope > picture, :scope > video, iframe')&&s.offsetHeight>0&&s.className.indexOf('map')>-1)return;
      if(n%2===1)s.classList.add('wx-cream');
      n++;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();


/* ===== v26 Phase 3a: motion (scroll reveal, step images, studies filter) ===== */
(function () {
  var doc = document, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.self !== window.top) return; /* never inside the page builder */
  function managed(el) { /* skip elements already animated by a page's own script */
    for (var n = el; n && n !== doc.body; n = n.parentElement) {
      if (n.classList && (n.classList.contains('seen') || /(^|\s|-)reveal(\s|$)/.test(n.className))) return true;
      if (n.attributes) for (var i = 0; i < n.attributes.length; i++) if (/^data-.*reveal/.test(n.attributes[i].name)) return true;
    }
    return false;
  }
  /* 1. Scroll reveal: headings, labels, lead text, cards and images rise in, cards staggered. */
  if (!reduce && 'IntersectionObserver' in window) {
    var secs = [].slice.call(doc.querySelectorAll('main section'));
    secs.shift(); /* hero stays instant */
    var targets = [];
    secs.forEach(function (sec) {
      [].slice.call(sec.querySelectorAll('h2, h3, [class*="label"], [class*="kicker"], .eyebrow, .lead, [class*="-card"], [class*="-item"], figure, .btn, [class*="-step"]')).forEach(function (el) {
        if (el.closest('.mega-menu, .site-header, form, [id$="-track"]') || managed(el) || el.offsetHeight === 0) return;
        if (el.parentElement && el.parentElement.closest('.wxr')) return;
        var r = el.getBoundingClientRect(); if (r.top < innerHeight * 0.9) return; /* already on screen */
        el.classList.add(el.tagName === 'FIGURE' ? 'wxr-img' : 'wxr', 'wxr');
        var sib = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = Math.min(sib, 5) * 90 + 'ms';
        targets.push(el);
      });
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('wxr-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
    setTimeout(function () { targets.forEach(function (el) { el.classList.add('wxr-in'); }); }, 12000); /* safety */
  }
  /* 2. Process sliders: the side image changes with every step (renovation "Built around occupancy" and similar). */
  var pool = [];
  [].forEach.call(doc.querySelectorAll('main img'), function (im) { var s = im.getAttribute('src'); if (s && pool.indexOf(s) < 0 && !/logo|\.svg/.test(s)) pool.push(s); });
  [].forEach.call(doc.querySelectorAll('[id$="-process-track"], [id$="-journey-track"]'), function (track) {
    var sec = track.closest('section'); if (!sec || pool.length < 2) return;
    var fig = [].filter.call(sec.querySelectorAll('figure, [class*="media"], [class*="image"]'), function (f) { return f.querySelector('img') && !track.contains(f); })[0];
    if (!fig) return;
    var img = fig.querySelector('img'), start = pool.indexOf(img.getAttribute('src'));
    fig.classList.add('wx-swap');
    track.addEventListener('wx-slide', function (e) {
      var src = pool[(Math.max(start, 0) + e.detail) % pool.length];
      if (img.getAttribute('src') === src) return;
      var ghost = img.cloneNode(); ghost.className = 'wx-swap-ghost'; ghost.src = src; ghost.removeAttribute('loading');
      fig.appendChild(ghost);
      ghost.onload = function () { requestAnimationFrame(function () { ghost.classList.add('in'); }); setTimeout(function () { img.src = src; ghost.remove(); }, 750); };
    });
  });
  /* 3. Filter tabs (home "Selected studies"). */
  [].forEach.call(doc.querySelectorAll('.wx-filter'), function (bar) {
    var grid = bar.nextElementSibling; if (!grid) return;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]'); if (!b) return;
      var k = b.getAttribute('data-filter');
      [].forEach.call(bar.children, function (x) { x.setAttribute('aria-selected', String(x === b)); });
      [].forEach.call(grid.children, function (c) {
        var show = k === 'all' || (' ' + c.getAttribute('data-cat') + ' ').indexOf(' ' + k + ' ') > -1;
        c.classList.toggle('is-out', !show);
        if (show) { c.hidden = false; c.classList.remove('is-pop'); void c.offsetWidth; c.classList.add('is-pop'); }
        else setTimeout(function () { if (c.classList.contains('is-out')) c.hidden = true; }, 260);
      });
    });
  });
})();

/* Phase 14: before/after slider */
(function () {
  function init() { document.querySelectorAll(".wx-ba-r").forEach(function (r) { var w = r.parentNode; var f = function () { w.style.setProperty("--p", r.value + "%"); }; r.addEventListener("input", f); f(); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* P20: home "Our clients" logos from /assets/data/clients.json (managed in Admin → Content → Client logos) */
(function () {
  var sec = document.getElementById("home-clients"); if (!sec || !window.fetch) return;
  fetch("/assets/data/clients.json?v=" + Math.floor(Date.now() / 60000), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.items) return;
    if (d.show === false || !d.items.length) { sec.hidden = true; return; }
    var e = function (s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var k = sec.querySelector(".hm-kicker"), h = sec.querySelector("h2"); if (k) k.textContent = d.kicker || ""; if (h) h.textContent = d.title || "Our clients";
    var li = d.items.map(function (it) { var img = '<img src="' + e(it.logo) + '" alt="' + e(it.name) + '" width="320" height="160" loading="lazy">'; return "<li>" + (it.url ? '<a href="' + e(it.url) + '" target="_blank" rel="noopener" aria-label="' + e(it.name) + '">' + img + "</a>" : img) + "</li>"; }).join("");
    var ul = sec.querySelector(".hm-logo-grid"); if (!ul) return;
    sec.classList.toggle("lg-color", !d.grey);
    if (d.mode === "slider") {
      var box = document.createElement("div"); box.className = "hm-logo-slider"; box.innerHTML = '<ul class="hm-logo-run" style="animation-duration:' + (+d.speed || 30) + 's">' + li + li.replace(/<li>/g, '<li aria-hidden="true">') + "</ul>";
      ul.replaceWith(box);
    } else ul.innerHTML = li;
  }).catch(function () {});
})();

/* P20: 3D Studio capability list (auto-advance, hover/click) + reveal for trust block + about counters */
(function () {
  var sec = document.querySelector("#why.wx-cap");
  if (sec) {
    var rows = sec.querySelectorAll(".wx-cap-row"), imgs = sec.querySelectorAll(".wx-cap-img img"), ps = sec.querySelectorAll(".wx-cap-desc p"), cur = 0, t = null, inView = false;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var go = function (i, user) {
      cur = (i + rows.length) % rows.length;
      [].forEach.call(rows, function (r, k) { r.classList.toggle("on", k === cur); r.classList.remove("run"); r.setAttribute("aria-selected", k === cur ? "true" : "false"); });
      [].forEach.call(imgs, function (m, k) { m.classList.toggle("on", k === cur); });
      [].forEach.call(ps, function (p, k) { p.classList.toggle("on", k === cur); });
      clearTimeout(t); if (reduce || !inView) return;
      void rows[cur].offsetWidth; rows[cur].classList.add("run");
      t = setTimeout(function () { go(cur + 1); }, user ? 9000 : 5000);
    };
    [].forEach.call(rows, function (r, k) { r.addEventListener("click", function () { go(k, true); }); r.addEventListener("mouseenter", function () { if (matchMedia("(hover:hover)").matches) go(k, true); }); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) go(cur); else clearTimeout(t); }, { threshold: .35 }).observe(sec);
  }
  var obs = "IntersectionObserver" in window ? new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("wx-in"); o.unobserve(e.target); } }); }, { threshold: .2 }) : null;
  [].forEach.call(document.querySelectorAll(".wx-trust,#about-story"), function (el) { obs ? obs.observe(el) : el.classList.add("wx-in"); });
  // count-up numbers in the about story stats
  [].forEach.call(document.querySelectorAll("#about-story .ab-stat strong"), function (s) {
    var m = /^(\d+)(\+?)$/.exec(s.textContent.trim()); if (!m || +m[1] > 3000 || +m[1] >= 1900) return;
    var end = +m[1], plus = m[2]; s.textContent = "0" + plus;
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es, o) { if (!es[0].isIntersecting) return; o.disconnect(); var t0 = performance.now(); (function step(n) { var p = Math.min(1, (n - t0) / 1400), v = Math.round(end * (1 - Math.pow(1 - p, 3))); s.textContent = v + plus; if (p < 1) requestAnimationFrame(step); })(t0); }) : null;
    io ? io.observe(s) : (s.textContent = end + plus);
  });
})();

/* P25: article contents — highlight the section in view */
(function () {
  var toc = document.querySelector("#insight-page .dx-toc"); if (!toc || !("IntersectionObserver" in window)) return;
  var links = {}; [].forEach.call(toc.querySelectorAll("a"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && links[e.target.id]) { for (var k in links) links[k].classList.remove("on"); links[e.target.id].classList.add("on"); } }); }, { rootMargin: "-20% 0px -70% 0px" });
  Object.keys(links).forEach(function (id) { var h = document.getElementById(id); if (h) io.observe(h); });
})();

/* P27: auto-sliding tracks (home reviews + insights) — pause on hover/touch, loop, arrows */
(function () {
  function slider(track, prev, next, ms) {
    if (!track) return;
    var step = function () { var c = track.firstElementChild; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 16) : 300; };
    var go = function (d) { var max = track.scrollWidth - track.clientWidth - 4; if (d > 0 && track.scrollLeft >= max) track.scrollTo({ left: 0 }); else if (d < 0 && track.scrollLeft <= 4) track.scrollTo({ left: max }); else track.scrollBy({ left: d * step() }); };
    prev && prev.addEventListener("click", function () { go(-1); }); next && next.addEventListener("click", function () { go(1); });
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var hold = false, vis = false, t = setInterval(function () { if (!hold && vis && !document.hidden) go(1); }, ms);
    ["mouseenter", "touchstart", "focusin"].forEach(function (e) { track.addEventListener(e, function () { hold = true; }, { passive: true }); });
    ["mouseleave", "touchend", "focusout"].forEach(function (e) { track.addEventListener(e, function () { setTimeout(function () { hold = false; }, 2500); }, { passive: true }); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }).observe(track); else vis = true;
  }
  var rv = document.querySelector("#home-page .hm-rv-track");
  if (rv && !document.querySelector(".hm-rv-nav")) { var n = document.createElement("div"); n.className = "hm-rv-nav"; n.innerHTML = '<button type="button" aria-label="Previous review">←</button><button type="button" aria-label="Next review">→</button>'; rv.parentNode.parentNode.insertBefore(n, rv.parentNode.nextSibling); slider(rv, n.children[0], n.children[1], 4500); }
  slider(document.querySelector("#home-page .hm-ins-track"), document.querySelector(".hm-ins-prev"), document.querySelector(".hm-ins-next"), 5000);
})();
/* Phase 3 — announcement bar (edited in Admin → Header & footer). */
(function () {
  if (!window.fetch || /^\/(admin|builder)\//.test(location.pathname)) return;
  fetch("/assets/announce.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
    if (!a || !a.on || !a.text) return; var k = "wx-ann-" + (a.v || 0); try { if (sessionStorage.getItem(k)) return; } catch (e) {}
    var b = document.createElement("div"); b.className = "wx-ann wx-ann--" + (a.style || "navy"); b.setAttribute("role", "region"); b.setAttribute("aria-label", "Announcement");
    var t = document.createElement("span"); t.textContent = a.text; b.appendChild(t);
    if (a.link) { var l = document.createElement("a"); l.href = a.link; l.textContent = a.linkText || "Learn more"; if (/^https:/.test(a.link) && a.link.indexOf(location.host) < 0) { l.target = "_blank"; l.rel = "noopener"; } b.appendChild(l); }
    var x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label", "Close announcement"); x.innerHTML = "&times;"; b.appendChild(x);
    x.onclick = function () { b.remove(); document.documentElement.classList.remove("wx-has-ann"); try { sessionStorage.setItem(k, "1"); } catch (e) {} };
    document.body.insertBefore(b, document.body.firstChild); document.documentElement.classList.add("wx-has-ann");
  }).catch(function () {});
})();
