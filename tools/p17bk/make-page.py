# builds frontend-v1/book-a-visit/index.html from the contact page (header/footer/head kept)
import os, re
os.chdir(os.path.join(os.path.dirname(__file__), '../../frontend-v1'))
s = open('contact/index.html').read()
T = 'Book a Site Visit or Meeting | Woodex Interior Lahore'
D = 'Book a free site visit, studio meeting or online call with Woodex Interior in Lahore. Pick a date and time that suits you — we confirm on WhatsApp.'
s = re.sub(r'<title>.*?</title>', '<title>' + T + '</title>', s, 1)
s = re.sub(r'(<meta name="description" content=")[^"]*', r'\g<1>' + D, s, 1)
s = re.sub(r'(<meta property="og:description" content=")[^"]*', r'\g<1>' + D, s, 1)
s = re.sub(r'(<meta property="og:title" content=")[^"]*', r'\g<1>' + T, s, 1)
s = s.replace('https://woodex.com.pk/contact/"', 'https://woodex.com.pk/book-a-visit/"')
s = s.replace('<body id="contact-page" data-page="contact">', '<body id="book-page" data-page="book">')
s = s.replace(' aria-current="page"', '')
s = s.replace('</head>', '<link rel="stylesheet" href="/assets/book.css" />\n</head>', 1)
main = '''<main id="main-content">
  <section class="bk-hero" aria-labelledby="bk-title">
    <div class="bk-wrapx">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>→</span><a href="/contact/">Contact</a><span>→</span><span>Book a visit</span></nav>
      <p class="bk-label">Free consultation</p>
      <h1 id="bk-title">Book a site visit or meeting</h1>
      <p class="bk-lead">Choose a time that suits you. A Woodex designer will visit your site, meet you at our Lahore studio, or call you online — and we confirm every booking on WhatsApp.</p>
      <ul class="bk-trust"><li>No charge for the first visit in Lahore</li><li>Mon–Sat, 10 am – 7:30 pm</li><li>Confirmed by WhatsApp within working hours</li></ul>
    </div>
  </section>
  <section class="bk-sec" aria-label="Booking form">
    <div class="bk-wrapx">
      <div class="bkw" id="bkw" data-state="loading">
        <ol class="bkw-steps" aria-hidden="true"><li data-s="1"><span>1</span>What</li><li data-s="2"><span>2</span>When</li><li data-s="3"><span>3</span>Your details</li></ol>
        <div class="bkw-body">
          <div class="bkw-pane" data-p="1"><h2>What would you like to book?</h2><div class="bkw-types" id="bkw-types"><p class="bkw-wait">Loading…</p></div></div>
          <div class="bkw-pane" data-p="2" hidden><h2>Pick a day and time</h2>
            <div class="bkw-dates-w"><button type="button" class="bkw-arr" id="bkw-dl" aria-label="Earlier dates">‹</button><div class="bkw-dates" id="bkw-dates" role="listbox" aria-label="Dates"></div><button type="button" class="bkw-arr" id="bkw-dr" aria-label="Later dates">›</button></div>
            <div class="bkw-slots" id="bkw-slots" role="listbox" aria-label="Times"></div>
            <div class="bkw-nav"><button type="button" class="bkw-back" data-go="1">← Back</button><button type="button" class="btn bkw-next" id="bkw-n2" disabled>Continue</button></div></div>
          <form class="bkw-pane" data-p="3" id="bkw-form" hidden novalidate><h2>Your details</h2>
            <div class="bkw-g2"><label>Full name *<input name="name" autocomplete="name" required></label><label>Phone / WhatsApp *<input name="phone" type="tel" autocomplete="tel" placeholder="03xx xxxxxxx" required></label>
            <label>Email <small>(optional)</small><input name="email" type="email" autocomplete="email"></label><label>City / area<select name="city" id="bkw-city"></select></label></div>
            <label class="bkw-addr">Site address *<input name="address" autocomplete="street-address" placeholder="House / plot, block, society"></label>
            <label>Project type<select name="service"><option value="">Choose…</option><option>Home interior design</option><option>Kitchen / wardrobes</option><option>Office interior / fit-out</option><option>Commercial / retail / restaurant</option><option>Renovation</option><option>Architecture</option><option>3D visualization</option><option>Furniture</option><option>Other</option></select></label>
            <label>Anything we should know? <small>(optional)</small><textarea name="note" rows="3" placeholder="Size, budget, timeline…"></textarea></label>
            <input type="text" name="_hp" class="bkw-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="bkw-sum" id="bkw-sum"></div>
            <p class="bkw-err" id="bkw-err" role="alert" hidden></p>
            <div class="bkw-nav"><button type="button" class="bkw-back" data-go="2">← Back</button><button type="submit" class="btn bkw-next" id="bkw-go">Request booking</button></div></form>
          <div class="bkw-pane bkw-done" data-p="4" hidden><div class="bkw-tick" aria-hidden="true">✓</div><h2>Booking request received</h2><p id="bkw-dt"></p><p>Our team will confirm on WhatsApp shortly. Need to change something? <a href="https://wa.me/923224000768">WhatsApp us</a>.</p><a class="btn" href="/projects/">See our projects</a></div>
          <div class="bkw-pane" data-p="0" hidden><h2>Online booking is paused</h2><p>Please <a href="https://wa.me/923224000768">WhatsApp us</a> or call <a href="tel:+923224000768">+92 322 4000768</a> and we will set up a time.</p></div>
        </div>
      </div>
      <aside class="bk-aside"><h2>What happens next</h2><ol><li><b>We confirm</b> your time on WhatsApp.</li><li><b>We meet</b> — on site, at the studio or online — to understand the space, style and budget.</li><li><b>You get a plan</b>: design direction and a clear quotation.</li></ol><p class="bk-small">Prefer to talk now? <a href="tel:+923224000768">+92 322 4000768</a></p></aside>
    </div>
  </section>
</main>'''
s = re.sub(r'<main id="main-content">.*?</main>', lambda m: main, s, 1, flags=re.S)
s = re.sub(r'<script>\n\(function\(\)\{var f=document.getElementById\(\'visit-form\'\).*?</script>\n', '<script src="/assets/book.js" defer></script>\n', s, 1, flags=re.S)
os.makedirs('book-a-visit', exist_ok=True); open('book-a-visit/index.html', 'w').write(s)
# sitemap
sm = open('sitemap.xml').read()
if '/book-a-visit/' not in sm:
    sm = sm.replace('<loc>https://woodex.com.pk/contact/</loc>', '<loc>https://woodex.com.pk/contact/</loc>', 1)
    sm = sm.replace('</urlset>', '  <url><loc>https://woodex.com.pk/book-a-visit/</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n</urlset>')
    open('sitemap.xml', 'w').write(sm)
print('page ok', 'book.js' in s, len(s))
