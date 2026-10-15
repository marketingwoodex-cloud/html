# Woodex Interior: Go-Live Deep Audit Report
**Date:** 29 Sep 2026 · **Scope:** `frontend-v1/` (87 public pages, Builder v3, Admin v2 A1–A8, PHP API) · **Commit audited:** `69238db`

## How it was tested
- **Headless Chromium run on all 87 pages** at desktop width and at mobile width (390px). It recorded failed requests, console errors, page weight, lazy-loading, sideways overflow, forms, links and structured data.
- **All 8 PHP files parsed cleanly** with a PHP 8.1 syntax parser. A code review covered SQL, auth, uploads, secrets and `.htaccess`.
- **Static SEO scan:** titles, descriptions, alt text, canonicals, sitemap, JSON-LD and Open Graph images.
- **Limitation:** PHP and MySQL cannot run in this sandbox. The PHP/MySQL admin has only been exercised through its Node mirror. **It must be smoke-tested on Hostinger before launch** (see the checklist).

---

## Verdict
**The site is close to launch-ready.** SEO basics are excellent and the server hardening is solid.
- **2 blockers:** the builder's password login, and the untested PHP runtime.
- **4 high-priority fixes:** mobile layout on 2 pages, broken script requests on every page, and hero images that load lazily.

All of these are small fixes, about 1–2 hours of work in total.

## Summary table
| # | Severity | Issue | Where | Effort |
|---|---|---|---|---|
| B1 | 🔴 Blocker | The builder still accepts its shared password. That bypasses admin roles, 2FA and session revoke. | `api/builder.php` L138–151 | 30 min |
| B2 | 🔴 Blocker | The PHP/MySQL admin has never been run for real | Hostinger | 1 h testing |
| H1 | 🟠 High | Builder tokens issued by the admin aren't tied to the admin session. A revoked session or disabled user keeps builder access for up to 12h. | `api/builder.php` | 30 min |
| H2 | 🟠 High | Mobile layout breaks: the page is 654px wide on a 390px phone, so the whole page zooms out | `/kitchen-design/` (`.kd-copy` grid) | 10 min |
| H3 | 🟠 High | Mobile layout breaks: the price panel is squeezed to 44px and the page is 473px wide | `/commercial-interior/` (`.ci-price-panel`) | 10 min |
| H4 | 🟠 High | 3 failed requests (404) on **every page** | `assets/site.js`, `assets/js/whatsapp-widget.js` | 15 min |
| M1 | 🟡 Medium | The main hero image (LCP) is set to load lazily, which slows first paint | Home `.hm-hero`, `/lahore/` `.ct-hero`, `/commercial-interior/` `.ci-hero` | 15 min |
| M2 | 🟡 Medium | No Content-Security-Policy header | `.htaccess` | 20 min |
| M3 | 🟡 Medium | Heavy pages, up to 1.7 MB | 5 pages, listed below | 30 min |
| M4 | 🟡 Medium | Backup zips include `_private` secrets such as SMTP and API keys | Media → Backups | Process |
| M5 | 🟡 Medium | Default development passwords (`Woodex@2026`) | Deploy | 5 min |
| L1 | 🟢 Low | Leftover Netlify form script | `privacy/index.html` | 2 min |
| L2 | 🟢 Low | About 21 tap targets under 24px per page (footer and breadcrumb links) | Global CSS | 20 min |
| L3 | 🟢 Low | 6 titles over 60 characters, 2 under 30; 5 descriptions over 160 characters | Admin → SEO | 15 min |
| L4 | 🟢 Low | `robots.txt` lists `/_private/`, which advertises the folder (it is still blocked by `.htaccess`) | `robots.txt` | 1 min |
| L5 | 🟢 Low | HSTS has no `includeSubDomains` | `.htaccess` | 1 min |
| L6 | 🟢 Low | The cron URL is public. It is safe (repeat runs change nothing) but can be triggered by anyone. | `api/admin.php?cron` | 10 min |
| L7 | 🟢 Low | Home services cards fix (from an earlier review) is still pending | Home | 20 min |

---

## Details and fixes

### B1: The builder's shared password bypasses admin security
`api/builder.php` still has `login`/`setup` actions that accept the old shared builder password. They issue `exp.hmac` tokens, so anyone with that password can edit every page. They skip Admin v2 roles, 2FA, login alerts and session revoke.
**Fix:** once an admin user exists, reject `login`/`setup` with the message "Use /admin/". Keep the admin-issued token as the only way in.

### H1: Builder tokens are not bound to the admin session
Admin-issued builder tokens (`exp.uid.hmac`, valid 12h) never check whether the admin session is still alive. They also don't check whether the user is still active or still has a role that allows builder access.
**Fix:** use the token format `exp.uid.sid.hmac`. On every builder request, check that the session exists in `security.json`, and that the user is active with the owner, admin or editor role.

### H2 and H3: Mobile overflow
- `/kitchen-design/`: the `.kd-copy` paragraphs sit in a two-column grid that doesn't collapse. Their right edge is at 654px, so phones zoom the whole page out, as the screenshot showed.
  **Fix:** under `@media (max-width: 760px)`, make the grid a single column and set `min-width: 0`.
- `/commercial-interior/`: the `.ci-price-panel` grid squeezes its cards to 44–85px wide.
  **Fix:** make it a single column on mobile.

### H4: Broken requests on every page
| Request | Source | Fix |
|---|---|---|
| `/.netlify/functions/analytics-track` | Beacon in `site.js` | Remove it; the site no longer runs on Netlify |
| `/assets/js/theme-config.js` | Loaded by `site.js` | Remove the loader, or add the file |
| `/assets/js/site-config.js` | Loaded by `whatsapp-widget.js` | Remove the loader, or add the file |

These cause console errors that Lighthouse "Best Practices" penalises, plus wasted requests.

### M1: Lazy-loaded hero images
The largest image in the first screen has `loading="lazy"`. **Fix:** on hero images, use `loading="eager"` and `fetchpriority="high"`. The mega-menu image can stay lazy, because it is hidden until the menu opens.

### M2: CSP
Add a CSP in report-only mode first, then enforce it:
`default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'`
`unsafe-inline` is needed because pages built with the builder contain inline code.

### M3: Page weight
- **Heaviest pages:**
  - `/residential-bedroom-design/` 1.7 MB
  - `/3d-visualization/` 1.37 MB
  - `/residential-dining-room-design/` 1.33 MB
  - `/2-kanal-house-design/` 1.24 MB
  - `/quetta/` 1.05 MB
- **Typical page:** 326 KB, 48 requests. No third-party hosts.
- **Remaining non-WebP images:** 7 JPG/PNG files, the largest being `img-469cf01b2548.jpg` at 623 KB. Convert them to WebP, and add `srcset` for gallery images.

### M4 and M5: Secrets and passwords
- Store backup zips off-site in a private location, and delete old ones.
- After deploy, set new strong passwords for every admin user and remove the builder password (B1).
- Turn on **2FA for every owner and admin account**.

---

## What passed ✅
- **SEO:**
  - 87/87 pages have `lang="en"`, exactly one H1, a matching canonical, a meta description and a unique title.
  - The sitemap matches the pages exactly: 86 URLs plus the 404 page.
  - `robots.txt` blocks /admin, /builder, /api and /_private.
- **Structured data:**
  - JSON-LD is valid on every page: LocalBusiness on 62 pages, Service, BreadcrumbList and FAQPage.
  - Business name, address and phone are consistent everywhere: M-71 Zainab Tower, Model Town Link Road · +92 322 4000768 / +92 321 4686884 · info@woodex.com.pk · Mo–Sa 09:30–18:30.
- **Images:** all have width and height set, so there is no layout shift. All Open Graph images exist. Images without alt text are decorative (`alt=""`).
- **Conversion:** every page has WhatsApp and `tel:` links. All 5 forms post to `/api/forms.php`, which has a honeypot, Turnstile and a rate limit.
- **Performance:** 4 self-hosted DM Sans font files, no external requests, local median load 0.8s.
- **Security:**
  - SQL uses bound parameters only, and passwords use `password_hash`.
  - Logins are throttled to 8 attempts per 10 minutes. 2FA, sessions and login alerts are available.
  - `display_errors` is off.
  - `.htaccess` forces HTTPS and sets HSTS, nosniff, SAMEORIGIN and Referrer-Policy. It also blocks dotfiles and `_private`, and enables caching and gzip.
  - The uploads folder has PHP disabled and blocks html, js and svg files.

---

## Hostinger go-live checklist
1. ☐ Fix B1, H1–H4 and M1 (about 2 hours).
2. ☐ Create the MySQL database and user in hPanel, and add their credentials to `_private/config.php`.
3. ☐ Upload `frontend-v1/` contents to `public_html/`. Confirm `_private/` returns **403** in the browser.
4. ☐ Open `/admin/`, create the owner account, then **turn on 2FA**.
5. ☐ **Smoke test (B2):**
   - log in and out;
   - submit a lead on the contact form and confirm it appears in the CRM and the alert email arrives;
   - create a quote, export the PDF, convert it to an invoice;
   - edit a page in the builder and publish it;
   - upload media;
   - take a backup;
   - run a health scan.
6. ☐ Settings → Integrations:
   - SMTP (Hostinger mail);
   - Turnstile site and secret keys;
   - AI key, if used;
   - PageSpeed API key.
7. ☐ In hPanel → Cron Jobs, run `curl -s https://woodex.com.pk/api/admin.php?cron=1` every 15 minutes (scheduled posts and backups).
8. ☐ Make sure SSL is active, then check that `http://` and `www` redirect to `https://woodex.com.pk`.
9. ☐ Submit `sitemap.xml` in Google Search Console, and check the Google Business Profile matches the site's address and phone.
10. ☐ Run PageSpeed Insights on the home page, `/kitchen-design/` and `/lahore/` for mobile and desktop. Target: 90+ for SEO and Best Practices, 75+ for mobile Performance.
11. ☐ Tell all users to sign in again, since sessions reset on deploy.
12. ☐ Take the first backup and download it off-site.

---

## Update 29 Sep 2026: fixes applied and builder QA
**Fixed:**
- **B1:** The builder password is retired once Woodex Admin is installed; builder sign-in goes through the admin, with 2FA.
- **H1:** Builder tokens are tied to the admin session. Signing out, "sign out other devices", a password change, disabling a user or downgrading their role ends builder access immediately.
- **H2 and H3:** Mobile overflow fixed. All 87 pages have no sideways scroll at 390px or 360px.
- **H4:** The 3 broken requests on every page (Netlify beacon, theme-config, site-config) are removed.
- **M1:** On 64 pages, the first-screen image now loads eagerly, and the first one gets `fetchpriority="high"`.
- **L1, L3, L4:** Privacy page Netlify script removed, 6 titles and 5 descriptions resized, `/_private/` removed from `robots.txt`.

**Builder bugs found and fixed during QA:**
1. The **Contact form element posted to `/api/contact` (404)**, so leads were lost. It now goes to `/api/forms.php` with a honeypot, Turnstile and the WhatsApp thank-you box, and leads reach the CRM.
2. After a session expired mid-edit, the **sign-in card appeared behind the editor** and couldn't be clicked. Fixed. Re-signing in through Woodex Admin, including from a second tab, now hands the session back safely, point-to-point. Edits are kept.
3. There was no leave-page warning while header/footer changes were being copied to all pages. A warning now appears and page switching is blocked until it finishes.
4. Images covered by text overlays, such as hero images, couldn't be selected. A second click now selects the layer underneath.
5. A stale panel could throw a JS error. A guard was added.

**QA coverage:** 150+ automated checks.
- **Security:** 26 checks.
- **Editor:** select and edit text, toolbar, right-click menu, undo/redo, save, history/restore, autosave draft recovery, styles per device and state, advanced settings, all 12 sections and 30 elements.
- **Panels and media:** layers, pages, SEO, theme, media, upload validation, blocks, global sections with push to all pages.
- **Page management:** new and duplicate page, ZIP and HTML export, page code, header propagation to all 87 pages, edit-conflict warning (409).
- **Live pages:** elements tested on the published page (accordion, tabs, counters, countdown, bars, form → CRM).
- **Roles:** editors get builder access; sales and other roles don't.
- **Round-trip:** every page opened and saved with no content change (87/87).

**Still open (see checklist):** PHP/MySQL smoke test on Hostinger (B2), CSP (M2, needs testing with the live tracking codes), page weight (M3), backup storage (M4), new passwords and 2FA (M5).
