# Woodex Frontend Master Audit — 2026-09-29

**Scope:** every public HTML page in the repo (175 files scanned, 88 unique public pages plus the `wf-admin/` mirror), `assets/site.css`, `assets/site.js`, images, SEO metadata, accessibility, performance and deploy readiness for **Hostinger** (plan D11).
**Method:** a static crawl script checked every page for titles/descriptions, canonical, OG, JSON-LD, H1 count, `<main>`, image alt/lazy/dimensions, broken internal links, form labels and inline styles. Spot-checks were done by hand.

---

## Verdict: 🟠 Pages are almost done; deploy is not ready

The HTML is in good shape. Every public page has one H1, a canonical tag, OG/Twitter tags, JSON-LD, a viewport tag, `lang`, and a unique title and description. No internal links are broken, and every image in `assets/img` is used. The remaining problems are **structural and performance problems, not page-level ones**.

| Severity | Count |
|---|---|
| 🔴 P0 Blocker | 3 |
| 🟠 P1 High | 5 |
| 🟡 P2 Medium | 7 |
| 🟢 P3 Low | 5 |

---

## 🔴 P0 — Fix before go-live

**P0-1. `wf-admin/` is a full copy of the whole site (87 duplicate pages).**
`diff -rq . wf-admin` finds only one difference (`UPLOAD-NOTES.md`). This folder causes **87 duplicate titles and 87 duplicate meta descriptions**. If it is uploaded to Hostinger, Google will see duplicate content, and `wf-admin/admin/` is a second admin panel. `robots.txt` does not block it.
→ Delete `wf-admin/` from the deploy (or from git), or move it outside `public_html`.

**P0-2. Security headers and redirects don't apply on Hostinger.**
Your CSP, X-Frame-Options and redirects live in `vercel.json` / `netlify.toml`. Hostinger (Apache/LiteSpeed) ignores both files. **There is no `.htaccess`.**
→ Add an `.htaccess` with: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, forced HTTPS plus redirects to non-www, `ErrorDocument 404 /404.html`, gzip/brotli, and long cache headers for `/assets/`.

**P0-3. `robots.txt` doesn't block private areas.**
It is currently just `Allow: /`.
→ Add `Disallow: /admin/`, `/wf-admin/`, `/api/`, `/mcp-server/`, `/tools/`, `/supabase/` and `/docs/`. Also keep planning files (`*.md`, `*.pdf`, `supabase/`, `netlify/`, `vercel.json`) out of `public_html`: right now anyone who knows the URL can read them.

---

## 🟠 P1 — High priority

**P1-1. `assets/site.css` is 648 KB and blocks rendering on every page.**
It has 7,386 rules and 5,403 unique selectors. The CSS for every page is bundled into one file, and there are 54 separate `@media(max-width:600px)` blocks, 53 at 820px and 50 `prefers-reduced-motion` blocks. That is roughly 10–20× larger than a site like this needs, and it's the biggest cause of slow LCP on mobile.
→ Split it into `core.css` (header, footer, grid, type, about 40 KB) plus page-type files (`service.css`, `location.css`, `project.css`, `estimator.css`). Merge the duplicate media queries, run PurgeCSS, minify, and inline the critical CSS.

**P1-2. The hero images are too heavy.**
`assets/img` totals 5.6 MB. The largest files are `img-469cf01b2548.jpg` (638 KB), `img-27c481fa9a3d.webp` (374 KB), `img-dce06249b137.webp` (329 KB) and `img-c349a92a4ae0.webp` (256 KB, the home LCP image at 2240×1120). Six images are still JPG or PNG.
→ Make responsive `srcset` sizes (640/1024/1600) and compress to under 150 KB each. Convert the JPGs to WebP or AVIF. The logo PNG should be SVG.

**P1-3. Three estimator inputs have no label.**
`#est-name`, `#est-phone` and `#est-email` rely only on placeholder text, which fails WCAG 1.3.1 / 3.3.2.
→ Add `<label for>` or `aria-label`. (The contact form is fine.)

**P1-4. The mobile menu toggle doesn't announce its state.**
It's a CSS checkbox hack: `<label ... aria-expanded="false">`. An `aria-expanded` attribute on a `<label>` is invalid, and it never changes.
→ Use a real `<button aria-expanded aria-controls>` and toggle it in `site.js`. Also close the menu on Esc and trap focus while it's open.

**P1-5. Leftover platform files conflict with the Hostinger-only plan (D11).**
`vercel.json`, `netlify.toml`, `netlify/`, `supabase/` and parts of `api/router.mjs` are still in the repo, and the README is an unrelated chat message.
→ Remove or archive them and rewrite the README (structure, how to deploy to Hostinger).

---

## 🟡 P2 — Medium

1. **Titles over 65 characters** (get cut off in Google): `architecture/`, `fit-out/`, `healthcare-renovation/`.
2. **Meta descriptions outside 70–165 characters:** `3d-visualization/`, `about/`, `projects/`.
3. **`404.html`** already has `noindex` ✅. It has no canonical tag, which is correct.
4. **Inline `style=""` on 47 pages.** This blocks a strict CSP (`style-src` without `'unsafe-inline'`). Move these into classes.
5. **Too many near-duplicate service pages.** `healthcare-design`, `healthcare-facilities-design`, `healthcare-fit-out` and `healthcare-renovation` overlap, and so do `fit-out`, `commercial-fit-out` and `office-fit-out`. Check that each has at least 60% unique body copy, or merge them to avoid thin or cannibalising content.
6. **Every page links to both phone numbers** (`+92 322 4000768` about 1,030 times and `+92 321 4686884` about 736 times). Decide which is primary for WhatsApp, calls and schema so the business details stay consistent.
7. **The logo `<img alt="">`** is fine because the link has an `aria-label`. Just make sure the footer logo does too.

## 🟢 P3 — Low

1. Add `width`/`height` to images injected by JS in the admin panels, to prevent layout shift (CLS).
2. Add `<link rel="preload">` for the LCP hero image and the fonts.
3. Update sitemap `lastmod` dates on each deploy (86 URLs, which matches the public pages ✅).
4. Look for heading-level skips on inner pages; the home page structure H1→H2→H3 is correct ✅.
5. Add a visible "skip to content" link.

---

## ✅ Checks that passed

- 88/88 public pages: title, description, canonical (except 404), OG, Twitter card, JSON-LD, viewport, `lang`
- Exactly one `<h1>` and a `<main>` landmark on every page
- No broken internal `href`/`src` in public pages (the only hits are template strings inside `wf-admin` JS)
- All content images have descriptive alt text; below-the-fold images use `loading="lazy"` and the hero uses `fetchpriority="high"`
- No `localhost` references, no lorem ipsum, no `href="#"` in public pages
- Schema types in use: LocalBusiness, Service, FAQPage, BreadcrumbList
- Contact form uses labels, `autocomplete`, and a honeypot field
- The site has `prefers-reduced-motion` support

---

## Still to do before a complete HTML frontend

| # | Task | Effort |
|---|---|---|
| 1 | Remove `wf-admin/` and non-public files from the deploy | 15 min |
| 2 | Write `.htaccess` (headers, HTTPS, 404, cache, compression) | 1 h |
| 3 | Harden `robots.txt` | 5 min |
| 4 | Split, purge and minify `site.css` | 1–2 days |
| 5 | Image pipeline (srcset, WebP/AVIF, compression) | 0.5 day |
| 6 | Estimator labels + accessible menu button | 2 h |
| 7 | Fix 3 titles and 3 descriptions | 30 min |
| 8 | Move inline styles into classes | 2 h |
| 9 | Content-uniqueness review of overlapping service pages | 1 day |
| 10 | Clean up README and legacy Vercel/Netlify/Supabase files | 1 h |
| 11 | Run Lighthouse and axe on the live Hostinger URL (target ≥ 90 mobile) | 1 h |
