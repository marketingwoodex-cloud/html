/* Woodex Live Builder — section library. Every block uses v1.css classes only. */
window.WX_BLOCKS = [
  { id: "cta", name: "Call-to-action band", icon: "📣", html: `
<section class="wx-cta"><div class="wrap wx-cta-inner">
  <div><h2>Ready to plan your space?</h2><p>Share your brief and we will confirm the right next step within one working day.</p></div>
  <div class="wx-actions"><a class="btn wx-btn-light" href="/contact/">Start your project</a></div>
</div></section>` },

  { id: "split", name: "Text + image", icon: "🖼️", html: `
<section class="wx-split"><div class="wrap wx-split-grid">
  <div class="wx-split-copy"><p class="wx-kicker">About the approach</p><h2>A heading that explains the benefit</h2>
    <p>Write two or three sentences here. Explain what the client gets, how it works and why it matters.</p>
    <ul><li>First key point</li><li>Second key point</li><li>Third key point</li></ul>
    <div class="wx-actions"><a class="btn wx-btn-dark" href="/contact/">Talk to us</a></div></div>
  <figure class="wx-split-media"><img src="/assets/img/img-c349a92a4ae0.webp" alt="Describe this image" loading="lazy" width="1600" height="1200"></figure>
</div></section>` },

  { id: "split-rev", name: "Image + text", icon: "🪞", html: `
<section class="wx-split wx-reverse"><div class="wrap wx-split-grid">
  <div class="wx-split-copy"><p class="wx-kicker">Craft</p><h2>Joinery made to the drawing</h2>
    <p>Kitchens, wardrobes and joinery built to the same drawings the site team uses, so everything fits on the first install.</p>
    <div class="wx-actions"><a class="btn wx-btn-outline" href="/projects/">See projects</a></div></div>
  <figure class="wx-split-media"><img src="/assets/img/img-f655d51401e8.webp" alt="Describe this image" loading="lazy" width="1600" height="1200"></figure>
</div></section>` },

  { id: "cards", name: "Feature cards (3)", icon: "🗂️", html: `
<section class="wx-features"><div class="wrap">
  <header class="wx-block-head"><p class="wx-kicker">What you get</p><h2>Three reasons clients choose Woodex</h2><p>A short line that introduces the cards below.</p></header>
  <div class="wx-cards">
    <article class="wx-cardx"><h3>Feature one</h3><p>Describe the benefit in one or two short sentences.</p></article>
    <article class="wx-cardx"><h3>Feature two</h3><p>Describe the benefit in one or two short sentences.</p></article>
    <article class="wx-cardx"><h3>Feature three</h3><p>Describe the benefit in one or two short sentences.</p></article>
  </div>
</div></section>` },

  { id: "stats", name: "Numbers strip", icon: "🔢", html: `
<section class="wx-stats" aria-label="Key numbers"><div class="wrap wx-stats-grid">
  <div class="wx-stat"><strong>2016</strong><span>Practising from Lahore</span></div>
  <div class="wx-stat"><strong>200+</strong><span>Completed spaces</span></div>
  <div class="wx-stat"><strong>6</strong><span>Disciplines, one team</span></div>
  <div class="wx-stat"><strong>4</strong><span>Cities served</span></div>
</div></section>` },

  { id: "process", name: "Process steps (4)", icon: "🪜", html: `
<section class="wx-process"><div class="wrap">
  <header class="wx-process-head"><div><p class="wx-kicker">How we work</p><h2>Four clear stages</h2></div><p>Explain the process in one sentence.</p></header>
  <ol class="wx-steps">
    <li class="wx-step"><h3>Brief</h3><p>What happens in this stage.</p></li>
    <li class="wx-step"><h3>Design</h3><p>What happens in this stage.</p></li>
    <li class="wx-step"><h3>Build</h3><p>What happens in this stage.</p></li>
    <li class="wx-step"><h3>Handover</h3><p>What happens in this stage.</p></li>
  </ol>
</div></section>` },

  { id: "gallery", name: "Image gallery", icon: "🏛️", html: `
<section class="wx-gallery"><div class="wrap">
  <header class="wx-block-head"><p class="wx-kicker">Gallery</p><h2>Recent spaces</h2></header>
  <div class="wx-gallery-grid">
    <figure><img src="/assets/img/img-dce06249b137.webp" alt="Project image" loading="lazy" width="1920" height="1280"></figure>
    <figure><img src="/assets/img/img-1d6ad6c77d0f.webp" alt="Project image" loading="lazy" width="1920" height="1280"></figure>
    <figure><img src="/assets/img/img-f655d51401e8.webp" alt="Project image" loading="lazy" width="1920" height="1280"></figure>
    <figure><img src="/assets/img/img-c349a92a4ae0.webp" alt="Project image" loading="lazy" width="2240" height="1120"></figure>
    <figure><img src="/assets/img/img-27c481fa9a3d.webp" alt="Project image" loading="lazy" width="1920" height="1280"></figure>
  </div>
</div></section>` },

  { id: "quotes", name: "Testimonials", icon: "💬", html: `
<section class="wx-testimonials wx-bg-light"><div class="wrap">
  <header class="wx-block-head"><p class="wx-kicker">Client words</p><h2>What our clients say</h2></header>
  <div class="wx-quotes">
    <blockquote class="wx-quote"><p>“Replace with a real client quote. Keep it short and specific.”</p><footer><strong>Client name</strong>Project type, City</footer></blockquote>
    <blockquote class="wx-quote"><p>“Replace with a real client quote. Keep it short and specific.”</p><footer><strong>Client name</strong>Project type, City</footer></blockquote>
    <blockquote class="wx-quote"><p>“Replace with a real client quote. Keep it short and specific.”</p><footer><strong>Client name</strong>Project type, City</footer></blockquote>
  </div>
</div></section>` },

  { id: "faq", name: "FAQ", icon: "❓", html: `
<section class="wx-faq"><div class="wrap">
  <header class="wx-block-head"><p class="wx-kicker">Questions</p><h2>Frequently asked questions</h2></header>
  <div class="wx-faq-list">
    <details open><summary>First question?</summary><p>Answer the question clearly in one or two sentences.</p></details>
    <details><summary>Second question?</summary><p>Answer the question clearly in one or two sentences.</p></details>
    <details><summary>Third question?</summary><p>Answer the question clearly in one or two sentences.</p></details>
  </div>
</div></section>` },

  { id: "prose", name: "Text block", icon: "📝", html: `
<section class="wx-text"><div class="wrap"><div class="wx-prose">
  <h2>Section heading</h2>
  <p>Write your paragraph here. Click any text in the preview to edit it directly.</p>
  <p>Add a second paragraph if needed.</p>
</div></div></section>` },

  { id: "logos", name: "Clients / logos strip", icon: "🏷️", html: `
<section class="wx-clients wx-pad-s"><div class="wrap">
  <div class="wx-logos"><span>CLIENT ONE</span><span>CLIENT TWO</span><span>CLIENT THREE</span><span>CLIENT FOUR</span><span>CLIENT FIVE</span></div>
</div></section>` },

  { id: "trust", name: "Why Woodex", icon: "🛡️", html: `
<section class="wx-trust"><div class="wrap wx-trust-grid">
  <div class="wx-trust-copy"><p class="wx-kicker">Why Woodex</p><h2>One accountable team from brief to handover</h2><p>Architecture, interiors, fit-out, renovation, 3D and custom furniture from one Lahore studio.</p>
    <div class="wx-actions"><a class="btn wx-btn-dark" href="/contact/">Start your project</a></div></div>
  <ul class="wx-trust-list">
    <li><strong>200+ completed spaces</strong><span>Homes, offices, retail and hospitality.</span></li>
    <li><strong>In-house 3D studio</strong><span>See the space before work begins.</span></li>
    <li><strong>Clear programme</strong><span>Quantities, phasing and handover dates agreed up front.</span></li>
    <li><strong>Clear programme</strong><span>Dates agreed up front.</span></li>
  </ul>
</div></section>` }
];

/* Small elements — dropped into an existing section */
window.WX_ELEMENTS = [
  { id: "h2", name: "Heading", icon: "H", html: `<h2>New heading</h2>` },
  { id: "h3", name: "Sub-heading", icon: "h", html: `<h3>New sub-heading</h3>` },
  { id: "p", name: "Paragraph", icon: "¶", html: `<p>Write your text here. Click to edit it directly.</p>` },
  { id: "kicker", name: "Small label", icon: "ᴬ", html: `<p class="wx-kicker">Small label</p>` },
  { id: "btn", name: "Button", icon: "▭", html: `<div class="wx-actions"><a class="btn wx-btn-dark" href="/contact/">Button text</a></div>` },
  { id: "btn2", name: "Two buttons", icon: "▭▭", html: `<div class="wx-actions"><a class="btn wx-btn-dark" href="/contact/">Start your project</a><a class="btn wx-btn-outline" href="/estimator/">Get an estimate</a></div>` },
  { id: "img", name: "Image", icon: "🖼", html: `<figure class="wx-split-media"><img src="/assets/img/img-c349a92a4ae0.webp" alt="Describe this image" loading="lazy" width="1600" height="1200"></figure>` },
  { id: "video", name: "Video (YouTube)", icon: "▶", html: `<div class="wx-el-video" data-wx-video><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video" loading="lazy" allowfullscreen></iframe></div>` },
  { id: "list", name: "Check list", icon: "✓", html: `<ul class="wx-el-list"><li>First point</li><li>Second point</li><li>Third point</li></ul>` },
  { id: "quote", name: "Quote", icon: "❝", html: `<blockquote class="wx-quote"><p>“A short client quote goes here.”</p><footer><strong>Client name</strong>Project, City</footer></blockquote>` },
  { id: "cols2", name: "2 columns", icon: "▥", html: `<div class="wx-cols wx-cols-2"><div><h3>Column one</h3><p>Text for the first column.</p></div><div><h3>Column two</h3><p>Text for the second column.</p></div></div>` },
  { id: "cols3", name: "3 columns", icon: "▦", html: `<div class="wx-cols wx-cols-3"><div><h3>One</h3><p>Short text.</p></div><div><h3>Two</h3><p>Short text.</p></div><div><h3>Three</h3><p>Short text.</p></div></div>` },
  { id: "box", name: "Card box", icon: "▢", html: `<div class="wx-el-box"><h3>Card title</h3><p>Card text goes here.</p></div>` },
  { id: "spacer", name: "Spacer", icon: "↕", html: `<div class="wx-el-spacer" aria-hidden="true"></div>` },
  { id: "divider", name: "Divider line", icon: "—", html: `<hr class="wx-el-divider">` },
  { id: "map", name: "Google map", icon: "📍", html: `<div class="wx-el-map" data-wx-map><iframe src="https://www.google.com/maps?q=Lahore&output=embed" title="Map" loading="lazy"></iframe></div>` }
];

/* Phase 4 — components & widgets (icons are filled in by the builder from the icon set) */
window.WX_ELEMENTS = (window.WX_ELEMENTS || []).concat([
  { id: "icon", name: "Icon", icon: "★", cat: "Widgets", html: `<span class="wx-icon-box" data-wx-icon="star"></span>` },
  { id: "iconcards", name: "Icon features (3)", icon: "✦", cat: "Components", html: `<div class="wx-cols wx-cols-3"><div class="wx-el-box"><span class="wx-icon-box" data-wx-icon="ruler"></span><h3>Planning</h3><p>Measured layouts and clear drawings.</p></div><div class="wx-el-box"><span class="wx-icon-box" data-wx-icon="hammer"></span><h3>Build</h3><p>One team from shell to handover.</p></div><div class="wx-el-box"><span class="wx-icon-box" data-wx-icon="sofa"></span><h3>Furnish</h3><p>Furniture made for the space.</p></div></div>` },
  { id: "accordion", name: "Accordion", icon: "☰", cat: "Components", html: `<div class="wx-acc"><details open><summary>First question</summary><div><p>Answer to the first question.</p></div></details><details><summary>Second question</summary><div><p>Answer to the second question.</p></div></details><details><summary>Third question</summary><div><p>Answer to the third question.</p></div></details></div>` },
  { id: "tabs", name: "Tabs", icon: "⊟", cat: "Components", html: `<div class="wx-tabs"><input type="radio" name="wxt" id="wxt-1" checked><label for="wxt-1">Residential</label><input type="radio" name="wxt" id="wxt-2"><label for="wxt-2">Commercial</label><input type="radio" name="wxt" id="wxt-3"><label for="wxt-3">Hospitality</label><div class="wx-tab"><p>Homes planned around the way you live.</p></div><div class="wx-tab"><p>Offices and retail built to programme.</p></div><div class="wx-tab"><p>Restaurants, cafés and hotels.</p></div></div>` },
  { id: "alert", name: "Alert / notice", icon: "ⓘ", cat: "Components", html: `<div class="wx-alert" role="note"><strong>Note:</strong> Site visits are available Monday to Saturday.</div>` },
  { id: "badges", name: "Badges", icon: "◉", cat: "Components", html: `<div class="wx-badges"><span class="wx-badge">Residential</span><span class="wx-badge">Commercial</span><span class="wx-badge">Turnkey</span></div>` },
  { id: "progress", name: "Progress bars", icon: "▰", cat: "Components", html: `<div class="wx-progress"><div><span>Design<em>100%</em></span><i><b style="width:100%"></b></i></div><div><span>Construction<em>70%</em></span><i><b style="width:70%"></b></i></div><div><span>Furniture<em>40%</em></span><i><b style="width:40%"></b></i></div></div>` },
  { id: "table", name: "Table", icon: "▦", cat: "Components", html: `<div style="overflow-x:auto"><table class="wx-table"><thead><tr><th>Package</th><th>Includes</th><th>From</th></tr></thead><tbody><tr><td>Design only</td><td>Layouts, 3D, drawings</td><td>PKR —</td></tr><tr><td>Design + Build</td><td>Everything, one team</td><td>PKR —</td></tr></tbody></table></div>` },
  { id: "form", name: "Contact form", icon: "✉", cat: "Components", html: `<form class="wx-form" action="/api/forms.php" method="post" data-wx-form="website"><label>Name<input type="text" name="name" autocomplete="name" required></label><label>Phone<input type="tel" name="phone" autocomplete="tel" required></label><label>Email <small>(optional)</small><input type="email" name="email" autocomplete="email"></label><label>Message<textarea name="message" rows="4"></textarea></label><button class="btn wx-btn-dark" type="submit">Send message</button></form>` },
  { id: "counters", name: "Counters", icon: "#", cat: "Widgets", html: `<div class="wx-counters"><div><strong data-wx-count="250">250</strong><span>Projects delivered</span></div><div><strong data-wx-count="10">10</strong><span>Years in practice</span></div><div><strong data-wx-count="6">6</strong><span>Cities served</span></div></div>` },
  { id: "countdown", name: "Countdown", icon: "⏱", cat: "Widgets", html: `<div class="wx-countdown" data-wx-countdown="2026-12-31T23:59:00"><div><b data-u="d">00</b><small>Days</small></div><div><b data-u="h">00</b><small>Hours</small></div><div><b data-u="m">00</b><small>Minutes</small></div><div><b data-u="s">00</b><small>Seconds</small></div></div>` },
  { id: "bars", name: "Bar chart", icon: "▮", cat: "Widgets", html: `<div class="wx-bars" role="img" aria-label="Projects per year"><div><b style="--v:40%"></b><small>2022</small></div><div><b style="--v:60%"></b><small>2023</small></div><div><b style="--v:80%"></b><small>2024</small></div><div><b style="--v:100%"></b><small>2025</small></div></div>` },
  { id: "social", name: "Social icons", icon: "@", cat: "Widgets", html: `<div class="wx-social"><a href="https://www.instagram.com/" aria-label="Instagram" target="_blank" rel="noopener" data-wx-icon="instagram"></a><a href="https://www.facebook.com/" aria-label="Facebook" target="_blank" rel="noopener" data-wx-icon="facebook"></a><a href="https://www.linkedin.com/" aria-label="LinkedIn" target="_blank" rel="noopener" data-wx-icon="linkedin"></a><a href="https://www.youtube.com/" aria-label="YouTube" target="_blank" rel="noopener" data-wx-icon="youtube"></a></div>` },
  { id: "whatsapp", name: "WhatsApp button", icon: "☏", cat: "Widgets", html: `<a class="wx-wa" href="https://wa.me/923000000000" target="_blank" rel="noopener" aria-label="Chat on WhatsApp" data-wx-icon="message-circle"><span>WhatsApp</span></a>` }
]);

/* Phase 2 — 8 more sections (library = 50). Styles: v1.css "wb-" block. */
window.WX_BLOCKS.push(
  { id: "team", name: "Team members", icon: "👥", html: `
<section class="wb-sec"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">Studio</p><h2>The people behind your project</h2></header>
  <div class="wb-team"><article><img src="/assets/img/img-00e6912a64f2.webp" alt="Team member" loading="lazy"><h3>Name Surname</h3><p>Principal designer</p></article><article><img src="/assets/img/img-197da8ddab9b.webp" alt="Team member" loading="lazy"><h3>Name Surname</h3><p>Project manager</p></article><article><img src="/assets/img/img-1d6ad6c77d0f.webp" alt="Team member" loading="lazy"><h3>Name Surname</h3><p>Site engineer</p></article><article><img src="/assets/img/img-1f4b4ef86cb5.webp" alt="Team member" loading="lazy"><h3>Name Surname</h3><p>Joinery lead</p></article></div>
</div></section>` },
  { id: "pricing", name: "Packages / pricing", icon: "💼", html: `
<section class="wb-sec wb-cream"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">Packages</p><h2>Choose the level of service</h2></header>
  <div class="wb-price"><article><h3>Design only</h3><p class="wb-p">Concept, 3D views and drawings</p><ul><li>Space planning</li><li>3D visuals</li><li>Material board</li></ul><a class="btn wx-btn-outline" href="/contact/">Ask about this</a></article><article class="on"><span class="wb-tag">Most chosen</span><h3>Design &amp; build</h3><p class="wb-p">One team from sketch to handover</p><ul><li>Everything in Design</li><li>Fit-out &amp; joinery</li><li>Site management</li></ul><a class="btn wx-btn-dark" href="/contact/">Start your project</a></article><article><h3>Turnkey</h3><p class="wb-p">Ready to use, furniture included</p><ul><li>Everything in Design &amp; build</li><li>Furniture &amp; styling</li><li>Aftercare</li></ul><a class="btn wx-btn-outline" href="/contact/">Ask about this</a></article></div>
</div></section>` },
  { id: "timeline", name: "Timeline", icon: "🕒", html: `
<section class="wb-sec"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">How it runs</p><h2>Project timeline</h2></header>
  <ol class="wb-time"><li><b>Week 1</b><h3>Brief &amp; site visit</h3><p>We measure, listen and agree the scope.</p></li><li><b>Week 2–3</b><h3>Design</h3><p>Layouts, 3D views and a clear quotation.</p></li><li><b>Week 4–10</b><h3>Build</h3><p>Fit-out and workshop joinery in parallel.</p></li><li><b>Handover</b><h3>Ready to use</h3><p>Snag list closed and aftercare begins.</p></li></ol>
</div></section>` },
  { id: "compare", name: "Comparison table", icon: "⚖️", html: `
<section class="wb-sec wb-cream"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">Why one team</p><h2>Woodex vs separate contractors</h2></header>
  <div class="wb-cmp"><table class="wx-tbl"><thead><tr><th></th><th>Woodex</th><th>Separate contractors</th></tr></thead><tbody><tr><td>One point of contact</td><td>✓</td><td>—</td></tr><tr><td>Fixed, itemised quotation</td><td>✓</td><td>Varies</td></tr><tr><td>Own joinery workshop</td><td>✓</td><td>—</td></tr><tr><td>Single handover &amp; warranty</td><td>✓</td><td>—</td></tr></tbody></table></div>
</div></section>` },
  { id: "banner", name: "Image banner", icon: "🏞️", html: `
<section class="wb-banner"><img src="/assets/img/img-27c481fa9a3d.webp" alt="" loading="lazy"><div class="wrap"><p class="wx-kicker">Featured</p><h2>Interiors that work as well as they look</h2><a class="btn wx-btn-light" href="/projects/">See projects</a></div></section>` },
  { id: "contactstrip", name: "Contact strip", icon: "📞", html: `
<section class="wb-sec wb-cream"><div class="wrap wb-cstrip"><div><h3>Call us</h3><p><a href="tel:+923224000768">+92 322 4000768</a></p></div><div><h3>Email</h3><p><a href="mailto:info@woodex.com.pk">info@woodex.com.pk</a></p></div><div><h3>Visit</h3><p>M-71, Zainab Tower, Model Town Link Road, Lahore</p></div><div><h3>Hours</h3><p>Mon–Sat · 9:30–6:30</p></div></div></section>` },
  { id: "posts", name: "Article cards", icon: "📰", html: `
<section class="wb-sec"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">Insights</p><h2>From the studio</h2></header>
  <div class="wb-posts"><a href="/insights/"><img src="/assets/img/img-27ed3ac85189.webp" alt="" loading="lazy"><span>Planning</span><h3>Article title goes here</h3></a><a href="/insights/"><img src="/assets/img/img-00e6912a64f2.webp" alt="" loading="lazy"><span>Materials</span><h3>Article title goes here</h3></a><a href="/insights/"><img src="/assets/img/img-197da8ddab9b.webp" alt="" loading="lazy"><span>Fit-out</span><h3>Article title goes here</h3></a></div>
</div></section>` },
  { id: "materials", name: "Material swatches", icon: "🎨", html: `
<section class="wb-sec wb-cream"><div class="wrap"><header class="wx-block-head"><p class="wx-kicker">Materials</p><h2>Finishes we work with</h2></header>
  <div class="wb-sw"><figure><i style="background:#8b5a3c"></i><figcaption>Walnut veneer</figcaption></figure><figure><i style="background:#d8c3a5"></i><figcaption>Natural oak</figcaption></figure><figure><i style="background:#e9e4dc"></i><figcaption>Matt lacquer</figcaption></figure><figure><i style="background:#3b3b3b"></i><figcaption>Graphite</figcaption></figure><figure><i style="background:#c9b79c"></i><figcaption>Travertine</figcaption></figure><figure><i style="background:#b8956a"></i><figcaption>Brushed brass</figcaption></figure></div>
</div></section>` }
);
