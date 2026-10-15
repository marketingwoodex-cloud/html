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

  /* Template slider heroes (.wxh--slider) — the design the admin can give any page.
     v2.1's P38 block, ported with it: the interval comes from the section, the first slide is the one that
     is on, and a visitor who has asked for reduced motion still gets a working slider they can click. */
  Array.prototype.forEach.call(doc.querySelectorAll('.wxh--slider'), function (h) {
    var ss = Array.prototype.slice.call(h.querySelectorAll('.wxh-slide')), ds = Array.prototype.slice.call(h.querySelectorAll('.wxh-dot')), i = 0, t = null;
    if (ss.length < 2) return;
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ms = Math.max(3, Math.min(15, Number(h.getAttribute('data-interval')) || 6)) * 1000;
    function go(n) { i = (n + ss.length) % ss.length; ss.forEach(function (s, k) { s.classList.toggle('is-on', k === i); s.setAttribute('aria-hidden', String(k !== i)); }); ds.forEach(function (d, k) { d.classList.toggle('is-on', k === i); d.setAttribute('aria-current', String(k === i)); }); }
    function run() { if (!rm && !t) t = setInterval(function () { if (doc.visibilityState === 'visible') go(i + 1); }, ms); }
    function halt() { if (t) { clearInterval(t); t = null; } }
    ds.forEach(function (d, k) { d.addEventListener('click', function () { go(k); halt(); run(); }); });
    h.addEventListener('mouseenter', halt); h.addEventListener('mouseleave', run);
    go(0); run();
  });

  /* Home hero slider — first slide is active in markup; this adds rotation. */
  var hero = doc.getElementById('hm-hero');
  if (hero) {
    /* `:not([data-hm-off])` is the whole point of the Hide button: the admin writes a hidden slide back
       into the file (so its words are not lost), and this is what keeps it off the screen. */
    var slides = Array.prototype.slice.call(hero.querySelectorAll('[data-home-slide]:not([data-hm-off])'));
    var dots = Array.prototype.slice.call(hero.querySelectorAll('[data-home-dot]'));
    var prev = doc.getElementById('hm-hero-prev'), next = doc.getElementById('hm-hero-next');
    /* The interval the admin writes on the section. It used to be a constant here, which meant the screen
       could say eight seconds and the site would take six and a half — a setting nobody could observe. */
    var ms = Math.max(3, Math.min(15, Number(hero.getAttribute('data-interval')) || 6)) * 1000;
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
      }, ms);
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
    }
    prevBtn.addEventListener('click', function () { at--; update(false); });
    if (nextBtn) nextBtn.addEventListener('click', function () { at++; update(false); });
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

  /* Quote/brief forms via mailto (same fields as the original). */
  function wireForm(id, statusId, subjectOf, bodyOf) {
    var form = doc.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var d = new FormData(form);
      var st = doc.getElementById(statusId);
      if (st) st.classList.add('show');
      window.location.href = 'mailto:info@woodex.com.pk?subject=' +
        encodeURIComponent(subjectOf(d)) + '&body=' + encodeURIComponent(bodyOf(d));
    });
  }
  wireForm('brief-form', 'form-status',
    function (d) { return '3D Visualization Brief: ' + d.get('service'); },
    function (d) {
      return ['Full Name: ' + d.get('name'), 'Phone: ' + d.get('phone'), 'Email: ' + d.get('email'),
        'Professional Type: ' + d.get('professional'), 'Service Required: ' + d.get('service'),
        'Outputs: ' + d.get('outputs'), 'Timeline: ' + d.get('timeline'), '',
        'Project Details:', '' + d.get('details')].join('\n');
    });
  wireForm('fitout-quote-form', 'fitout-form-status',
    function (d) { return 'Office Fit-Out Quote: ' + d.get('location'); },
    function (d) {
      return ['Full Name: ' + d.get('name'), 'Phone: ' + d.get('phone'), 'Email: ' + d.get('email'),
        'Office Location: ' + d.get('location'), 'Approximate Size: ' + d.get('size'),
        'Headcount: ' + d.get('headcount'), 'Current Condition: ' + d.get('condition'),
        'Rooms Needed: ' + d.get('rooms'), 'Target Timeline: ' + d.get('timeline'),
        'Budget Range: ' + d.get('budget'), '', 'Additional Notes:', '' + (d.get('notes') || '')].join('\n');
    });
  wireForm('fitout-hub-form', 'fitout-hub-form-status',
    function (d) { return 'Fit-Out Quote: ' + d.get('sector') + ' · ' + d.get('location'); },
    function (d) {
      return ['Full Name: ' + d.get('name'), 'Phone: ' + d.get('phone'), 'Email: ' + d.get('email'),
        'Fit-Out Type: ' + d.get('sector'), 'Location: ' + d.get('location'),
        'Approximate Area: ' + (d.get('area') || 'Not provided'),
        'Budget Range: ' + (d.get('budget') || 'Not provided'), '',
        'Project Details:', '' + d.get('details')].join('\n');
    });

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
    Array.prototype.forEach.call(doc.querySelectorAll('#mobile-menu a'), function (a) {
      a.addEventListener('click', function () {
        menuCb.checked = false;
        menuCb.dispatchEvent(new Event('change'));
      });
    });
  }
})();

/* Page-view counter for the dashboard Analytics view — anonymous path only. */
(function () {
  if (location.pathname.indexOf("/admin") === 0) return;
  try {
    var vid = null;
    try {
      vid = localStorage.getItem("wx_vid");
      if (!vid || !/^[0-9a-f-]{36}$/i.test(vid)) {
        vid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
        if (vid) localStorage.setItem("wx_vid", vid);
      }
    } catch (e) { /* storage blocked: send path only */ }
    var payload = JSON.stringify({ path: location.pathname, vid: vid });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/.netlify/functions/analytics-track", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/.netlify/functions/analytics-track", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
    }
  } catch (e) { /* analytics must never break the page */ }
})();

/* Dashboard-managed theme — loads only on public pages. */
(function () {
  if (location.pathname.indexOf("/admin") === 0) return;
  var c = document.createElement("script");
  c.src = "/assets/js/theme-config.js";
  c.defer = true;
  c.onload = function () {
    var s = document.createElement("script");
    s.src = "/assets/js/theme-apply.js";
    s.defer = true;
    document.head.appendChild(s);
  };
  c.onerror = function () { /* no theme published yet; skip silently */ };
  document.head.appendChild(c);
})();

/* WhatsApp handoff widget — loads on every public page. */
(function () {
  if (location.pathname.indexOf("/admin") === 0) return;
  var s = document.createElement("script");
  s.src = "/assets/js/whatsapp-widget.js";
  s.defer = true;
  document.head.appendChild(s);
})();

/* Announcement bar — one file the console writes (Header & footer → Announcement bar).
   The bar is fetched rather than built into 150 pages, so switching it on, editing it or hiding it again
   is one write and no page is rewritten. `v` is the version: it busts the fetch cache and it is the key a
   visitor's dismissal is remembered under, so an edit shows the new bar to everyone who closed the old one.
   Progressive: with no file, no network or no JavaScript, the page is exactly what it is now. */
(function () {
  if (!window.fetch || /^\/(admin|builder)\//.test(location.pathname)) return;
  fetch("/assets/announce.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
    if (!a || !a.on || !a.text) return;
    var k = "wx-ann-" + (a.v || 0);
    try { if (sessionStorage.getItem(k)) return; } catch (e) {}
    var b = document.createElement("div");
    b.className = "wx-ann wx-ann--" + (a.style || "navy");
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", "Announcement");
    var t = document.createElement("span");
    t.textContent = a.text;
    b.appendChild(t);
    if (a.link) {
      var l = document.createElement("a");
      l.href = a.link;
      l.textContent = a.linkText || "Learn more";
      if (/^https:/.test(a.link) && a.link.indexOf(location.host) < 0) { l.target = "_blank"; l.rel = "noopener"; }
      b.appendChild(l);
    }
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Close announcement");
    x.innerHTML = "&times;";
    b.appendChild(x);
    x.onclick = function () {
      b.remove();
      document.documentElement.classList.remove("wx-has-ann");
      try { sessionStorage.setItem(k, "1"); } catch (e) {}
    };
    document.body.insertBefore(b, document.body.firstChild);
    document.documentElement.classList.add("wx-has-ann");
  }).catch(function () {});
})();
