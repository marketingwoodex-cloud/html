# Phase 15 — Responsive + PageSpeed 90+ : Task list

Legend: [x] done · [~] in progress · [ ] pending

## A. Speed (done)
- [x] Preview server gzip + image caching (`cb28c7f` parent)
- [x] Images → WebP, originals kept in `assets/img/_orig/`
- [x] 480/960 px mobile copies + `srcset` on all 599 images, lazy-load below the fold
- [x] Hero: first slide loads first (`fetchpriority=high`), other slides lazy
- [x] Per-page critical CSS inlined, `site.css` + `v1.css` load in background (87 pages)
- [x] Font preload fixed (Plus Jakarta Sans), unused DM Sans removed
- [x] Builder save keeps the fast CSS loading

## B. Mobile layout (done — `e8914b3`)
- [x] Hero / CTA buttons stack full width on phones
- [x] No sideways scroll at 320 / 375 / 768 px (all 87 pages)
- [x] Home slider dots + arrows fit
- [x] Text min 12px, tap targets min 32px

## C. Accessibility 84–88 → 97–100 (done)
- [x] C1. List the failing checks per page (Lighthouse a11y audit on key templates)
- [x] C2. Colour contrast fixes (small grey text on cream / navy)
- [x] C3. Links/buttons without names (icon buttons, slider arrows/dots, WhatsApp button)
- [x] C4. Heading order + image alt gaps
- [x] C5. Re-score: Home, Renovation, Insights, Kitchen, Contact, a city page, a blog post

## D. Final speed pass (done — mobile 91–97 all templates, desktop 98–99, a11y 97–100)
- [x] D1. Lighthouse on one page of every template (service, city, house-size, blog, estimator)
- [x] D2. Fix any page under 90 (mobile)
- [x] D3. Desktop check (expected 95+)

## E. Admin Speed dashboard (done — Admin → Speed)
- [x] E1. New admin page "Speed": choose page → run Google PageSpeed (mobile + desktop)
- [x] E2. Show scores, FCP / LCP / TBT / CLS and top 5 suggestions
- [x] E3. Save history per page (reuse `health_psi` from Site health), optional PSI API key in settings
- [x] E4. "Test all key pages" button + table
- [x] E5. PHP lint + Node mirror + browser test

## F. Ship (done)
- [x] F1. Restore test side-effect files (`.htaccess`, `renovation/index.html`, `sitemap.xml`)
- [x] F2. Build `deploy/p15/woodex-live-p15-full.zip` (full site, user choice) + Reconnect-database screen
- [x] F3. Update `LIVE-AUDIT-AND-MASTER-PLAN.md` (P15 done) + commit + push
- [x] F4. Upload steps for Hostinger + run PageSpeed on the live site from the Speed page
