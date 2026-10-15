# Woodex master to-do (7 Oct 2026)
One list for everything still open, skipped or parked. Replaces scattered lists in PENDING-TASKS.md, MASTER-SEO-PLAN.md and P35-PLAN.md.

Legend: [x] done · [~] fallback live, real data still needed · [ ] open

## 1. QA and security pass (done 7 Oct)
- [x] JavaScript syntax check: every .js file passes
- [x] PHP syntax check: all 35 PHP files pass (PHP 8.2 parser)
- [x] Admin: all 47 screens opened in a browser, 0 console errors
- [x] Website: all 142 pages opened on a mobile screen, 0 errors, 0 broken requests, 0 sideways scrolling
- [x] Internal links and images: fixed the 2 broken ones (services image, coming-soon favicon)
- [x] Claims wording (Phase E): fixed leftover sentence fragments ("5M–12M.", "ft. benchmark.") and re-ran safely
- [x] 5 meta descriptions over 160 characters shortened
- [x] SEO audit score 98/100 (the remaining 2 points need named authors, item 3.1)
- [x] Security: internal `*-lib.php`, `error_log`, `.log`, `.sql`, `.bak`, `.md` files are blocked from the web
- [x] Security: `wx-check.php` no longer shows PHP errors to visitors (needs the database password); display_errors off
- [x] Security: Permissions-Policy header added (HTTPS, HSTS, nosniff, frame and referrer headers were already set)
- [x] Secrets scan: no keys or passwords in code; `_private/` data is not in git or the zip
- [x] Fresh full Hostinger zip rebuilt from the repo (`woodex-vlive-P20/woodex-v20-master.zip`)

## 2. You must do (only you can)
- [ ] 2.1 Upload the zip to Hostinger (File Manager → public_html → Extract, Overwrite), then open `/wx-install.php`
- [ ] 2.2 Sign in with admin / admin and change the password at once (My security)
- [ ] 2.3 Delete `wx-demo.php` and `wx-check.php` after testing
- [ ] 2.4 Search Console: submit `https://woodex.com.pk/sitemap.xml`, remove the old WordPress/spam URLs
- [ ] 2.5 WhatsApp Cloud API: connect in Settings (needs Meta Business setup)
- [ ] 2.6 AI key: Blog & insights → AI settings
- [ ] 2.7 Google Analytics + Search Console: upload the service-account JSON key (Settings → Integrations)

## 3. Waiting for your information
- [~] 3.1 Named author and reviewer on the 48 articles. Now: "By Woodex Studio". Send: name, role, credentials
- [ ] 3.2 Real project photos to replace stock/AI images (Portfolio)
- [~] 3.3 Real Google reviews. Now: sample slider + "See all reviews on Google" link. Send: review text
- [ ] 3.4 Social profile links (Facebook, Instagram, LinkedIn, Google Business) for `sameAs` schema and the footer
- [ ] 3.5 Exact map pin (Google Maps share link) for `geo` coordinates in the schema
- [ ] 3.6 Any claim that is actually true and should come back (prices, warranty, timelines, 4K, showroom): tell us the number from PHASE-E-APPROVAL.md

## 4. Optional improvements (no input needed, not started)
- [ ] 4.1 Visible breadcrumb trail on the 48 articles (schema is already there)
- [ ] 4.2 Content briefs for the next 20 articles
- [ ] 4.3 Monthly re-run of the SEO audit (Admin → SEO → Site audit → Re-check all pages)
- [ ] 4.4 Backlinks: supplier/brand pages, Pakistani design press, project features

## Already done (from older lists)
llms.txt · AI crawlers allowed in robots.txt · FAQ + FAQPage schema on service pages · topic links to insights · image sitemap · OG images · 48 articles 900+ words · services hub, 8 Lahore area pages · hero slides manager · v26 section library · WhatsApp/AI agent flow · SEO site audit, bulk meta, internal links, keyphrases · claims safe wording.
