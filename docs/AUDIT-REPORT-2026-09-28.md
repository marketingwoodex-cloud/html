# Woodex — Go-Live Deep Audit Report
**Date:** 2026-09-28 · **Auditor:** Full-stack audit agent (Arena)
**Targets:** https://marketingwoodex.vercel.app/ · https://marketingwoodex.vercel.app/admin/ · repo `marketingwoodex-cloud/-marketingwoodex`
**Scope:** Frontend · Backend/API · Design · Content · SEO · Security · Bugs · Performance

---

## ⚠️ Go-Live Verdict: **NOT READY — 2 blockers, 8 high-priority issues**

The application itself is **well engineered** (consistent auth, clean architecture, unique SEO metadata, disciplined HTML escaping). But the site is **not actually "live" on its own domain**: `woodex.com.pk` — the domain every canonical tag, the sitemap, and all structured data point to — is still serving a **completely different, older website**, including spam-contaminated URLs in Google's index. Shipping as-is wastes the entire SEO investment.

| Severity | Count | Summary |
|---|---|---|
| 🔴 P0 Blocker | 4 | Domain/canonical mismatch · dead redirects feature · admin password exposed in chat · no security headers |
| 🟠 P1 High | 8 | No OG/Twitter tags · no favicon · orphan estimator page · broken `/services/` link · stale 404 · empty FAQ schema · no privacy page · heavy assets |
| 🟡 P2 Medium | 9 | Password hashing · public-form rate limits · SVG upload XSS · Article schema · sitemap gaps · no GA4 · no CI · session UX · stale docs |
| 🟢 P3 Low | 6 | Title truncation · button types · heading skips · lastmod · sample-data risk · docs |

**What's already good (verified):** ✅ all 30 API endpoints routed with exact parity · ✅ auth enforced on all 26 privileged endpoints (live-confirmed 401) · ✅ HMAC sessions with live DB revocation + rotation · ✅ rate-limited login (25/10min per IP *and* per username) · ✅ RLS enabled with no public policies · ✅ unique titles/descriptions on all 86 pages · ✅ one H1 per page, all images have alt, no duplicate IDs · ✅ `noindex` on `/admin/` · ✅ no secrets in git history · ✅ XSS escaping discipline in admin · ✅ honeypot + strict validation on public forms · ✅ custom 404 page · ✅ canonical/JSON-LD/NAP consistency.

---

## 🔴 P0 — BLOCKERS (must fix before pointing the domain)

### P0-1. `woodex.com.pk` serves a DIFFERENT, older website (canonical mismatch crisis)
**Evidence:** fetched live during this audit:
- `marketingwoodex.vercel.app` → the new Woodex site (86 pages, canonicals = `https://woodex.com.pk/...`).
- `woodex.com.pk` → an **older template site** ("Thoughtful spaces. Timeless interiors.", `.html` pages, sample projects, deployed ~2026-09-11 per its sitemap).
- Google index of `site:woodex.com.pk` shows **yet another even older WordPress version** plus **hacked-spam URLs** (e.g. `woodex.com.pk/Figuren-itm-60842/…Lego…` German keyword-spam page).

**Impact:** Every one of the 85 canonical tags points Google at content that does **not** match. Result: the new site will never rank on its own domain; the domain carries spam history; social shares resolve wrong. This alone fails go-live.

**Fix (in order):**
1. In Vercel → Project → Settings → Domains, add `woodex.com.pk` + `www.woodex.com.pk`, set up DNS (A `76.76.21.21` / CNAME `cname.vercel-dns.com`), force HTTPS + redirect `www → apex`.
2. Immediately after cutover, add **301 redirects** for all legacy WordPress/old-template URLs (`/contact-us-2/`, `/design-planning/`, `/page/17/`, `*.html` paths from the old sitemap) — *requires P0-2*.
3. In Google Search Console: submit the new `sitemap.xml` on the `woodex.com.pk` property, use URL Inspection → "Kick out old cache", and file a **reconsideration/disavow** for the spam URLs if the hack history persists.
4. Keep `marketingwoodex.vercel.app` either as staging (add `X-Robots-Tag: noindex` for it — see P0-4) or 301 it to the apex domain.

### P0-2. Dashboard "SEO Redirects" feature is completely dead
**Evidence:** `netlify/functions/cms-redirects.mjs` CRUDs rows into the Supabase `redirects` table — but **nothing ever consumes that table**. No Vercel `redirects` in `vercel.json`, no middleware, no client-side check (grep: only `cms-redirects.mjs` and the backups export touch it). Admins can create redirects all day; the live site ignores 100% of them.

**Impact:** You *cannot* do the domain cutover safely (P0-1 fix step 2 is impossible from the dashboard), and any future URL change silently loses SEO.

**Fix:** generate rewrites at deploy time, or simplest robust option — a Vercel Edge middleware that queries the `redirects` table (cached ~60s) and issues `308` responses; alternatively have `cms-redirects` write entries into `vercel.json`'s `redirects` array via the existing GitHub helper (already whitelists `sitemap.xml`/`robots.txt` writes).

### P0-3. Admin password was shared in chat — rotate it now
The credentials `woodexadmin / Wx-0c41a9-c481e4` are now in transcript logs. The backend stores it as **unsalted SHA-256** (see P2-1), so treat the account as compromised.

**Fix:** sign in → Dashboard has no self-service password change for the env admin, so update `CMS_ADMIN_PASS_SHA256` in Vercel env vars to `sha256(new-password)` and redeploy. Choose a password you have never pasted anywhere. (Also never share it again in chat/tickets.)

### P0-4. Zero security headers configured
**Evidence:** `vercel.json` contains **only** `rewrites` — no `headers` block anywhere in the repo (grep across json/toml/html/mjs: 0 hits).

**Missing:** `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, long-cache for `/assets/*`, and `X-Robots-Tag: noindex` on `/admin/:*` (belt-and-braces beyond the meta tag).

**Impact:** The admin login page can be **iframed by any site** (clickjacking credential theft); MIME-sniffing and referrer leaks open; browsers may block inline scripts once a CSP is added late (do it now, before more inline scripts accumulate).

**Fix — add to `vercel.json`:**
```json
"headers": [
  { "source": "/(.*)", "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
  ]},
  { "source": "/admin/(.*)", "headers": [
    { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
    { "key": "Cache-Control", "value": "no-store" }
  ]},
  { "source": "/assets/(.*)", "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]}
]
```
Then add a CSP incrementally (`default-src 'self'` + `img-src 'self' data: https:`, `connect-src 'self'`, allow the inline scripts via hash or move them to files). Note the site currently relies on inline `<script>`/`<style>` blocks on every page — start CSP in Report-Only mode first.

---

## 🟠 P1 — HIGH (fix in week 1)

### P1-1. No Open Graph or Twitter Card tags on ANY of 86 pages
`grep og:` → 0 matches on every public page. Shares on WhatsApp/Facebook/LinkedIn/X render as a bare URL with no image/title/description. For a lead-gen site this is lost conversions on every share — and WhatsApp is your primary channel (204 `wa.me` links).

**Fix:** add to the shared `<head>` pattern on all pages:
```html
<meta property="og:type" content="website">
<meta property="og:title" content="…(use <title>)">
<meta property="og:description" content="…(use meta description)">
<meta property="og:url" content="https://woodex.com.pk/…">
<meta property="og:image" content="https://woodex.com.pk/assets/img/img-c349a92a4ae0.webp">
<meta property="og:site_name" content="Woodex Interior">
<meta name="twitter:card" content="summary_large_image">
```
(insights articles should use `og:type=article` + `article:published_time`).

### P1-2. No favicon on any public page
`0/86` public pages declare `rel="icon"` (the admin has an inline SVG favicon; public pages have none). Browsers show a generic icon in tabs, history, and bookmarks — a trust/branding gap.

**Fix:** reuse the admin's navy "W" SVG as `/assets/img/favicon.svg` + add `<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">` and a 32×32 PNG fallback to every head.

### P1-3. `/estimator/` is an orphan page — not linked, not in sitemap
- `href="/estimator/"` appears in **0 files** across the entire site.
- The page is **missing from `sitemap.xml`** (84 URLs vs 85 pages).
- It is a strong conversion tool (live, working, good copy).

**Fix:** add it to (a) the homepage services strip or a header CTA, (b) footer "Explore" column, (c) `sitemap.xml`, (d) cross-link from `interior-design/`, `fit-out/`, `renovation/` hubs ("Not sure about budget? Try the estimator").

### P1-4. Broken internal link: `/services/` → 404
`index.html:114` — `<a class="hm-btn hm-btn-light" href="/services/">Explore all services</a>` on the homepage. There is no `/services/` directory; it 404s to the custom error page.
**Fix:** point to `/interior-design/` or the homepage `#home-services` anchor.

### P1-5. 404 page serves stale "Coming soon" navigation
`404.html` still shows **"Projects — Coming soon"** and **"Insights — Coming soon"** in desktop nav, mobile nav, and footer — both sections exist now (`/projects/`, `/insights/`). Every visitor hitting a broken link sees a site that looks unfinished.
**Fix:** copy the current header/footer markup from `index.html` into `404.html` (also note `404.html` is the only page missing `<link rel="canonical">` — acceptable since it's `noindex`, but keep it consistent).

### P1-6. Invalid empty `FAQPage` structured data on 5 key pages
Parsed live JSON-LD: `mainEntity: []` (zero questions) on **`index.html`, `about/`, `contact/`, `estimator/`, `insights/`** — even though the homepage visibly renders 4 FAQs. Service hubs (e.g. `fit-out/`) correctly have 6 questions.
**Impact:** invalid rich-result markup; homepage FAQ rich results (high-CTR) are being left on the table.
**Fix:** populate `mainEntity` from the on-page FAQ content (or delete the empty block — an empty FAQPage can trigger manual-action flags).

### P1-7. No privacy policy page; footer "Privacy" is a dead `<span>`
`<div class="footer-bottom"><span>© 2026 Woodex Interior</span><div><span>Privacy</span>…` — not a link, no `/privacy/` page exists (the *old* site had `privacy.html`). The site collects name, phone, email via forms → needed for trust, Google Ads customer-match compliance, and app-store-style review discipline.
**Fix:** write `/privacy/` (+ short cookie/analytics note), link it in the footer across all 86 pages, add to sitemap.

### P1-8. Page weight is far above budget (Core Web Vitals risk)
Measured on the homepage (local reference):
- **`/assets/site.css` = 654 KB** (2,251 readable lines, one file, render-blocking, unminified) — Vercel gzips it, but parse/apply cost stays.
- Images: **`img-dce06249b137.webp` 963 KB, `img-c349a92a4ae0.webp` 751 KB, `img-1d6ad6c77d0f.webp` 501 KB**, 15 MB total in `assets/img`. The homepage HTML references ~13.5 MB across repeated hero images.
- No `width`/`height` attributes (only 1 on the homepage) → **CLS risk**; hero images below the first one lack `loading="lazy"`.
- No `preload` for the hero image/CSS.

**Fix:** recompress hero WebPs to ≤150 KB (or AVIF with WebP fallback), add explicit dimensions + `loading="lazy"` + `decoding="async"` everywhere except the LCP hero (keep `fetchpriority="high"` there), split/minify CSS (critical CSS inline + rest deferred), add `<link rel="preload" as="image">` for the LCP hero. Expect LCP < 2.5 s on 4G.

---

## 🟡 P2 — MEDIUM

**P2-1. Passwords hashed with unsalted SHA-256** (`_auth.mjs:20`, `cms-users.mjs`). Fast to brute-force offline if Supabase is ever exfiltrated; min 8 chars with no complexity. → migrate to **Argon2id or bcrypt** (or PBKDF2-HMAC-SHA256, 600k+ iterations) with per-user salt; keep a `pass_algo` column for phased rollout.

**P2-2. Public write endpoints have no rate limiting.** `enquiry-submit`, `estimator-submit`, `analytics-track` accept unlimited POSTs (honeypot is the only defense) → DB-fill spam & storage costs. Login is limited (25/10 min — good), these are not. → add per-IP token bucket (same activity-table pattern already built for login) + reject when `Referer`/origin is cross-site.

**P2-3. SVG uploads allowed → stored-XSS primitive.** `cms-upload.mjs` accepts `image/svg+xml`; uploaded SVGs are served from the **same origin** (`/assets/uploads/…`) and execute script when opened. An *editor*-role account could plant a payload that hijacks an *admin's* session (memory-only token still stealable via fetch + exfil). → disallow SVG, or serve uploads from a separate sandbox origin with `Content-Disposition: attachment` for SVGs.

**P2-4. Blog posts ship without `Article` schema, dates, or author.** All 8 insights articles have `LocalBusiness/Service/Breadcrumb/FAQ` but **no `datePublished`/`dateAuthor`/`Article` type** — no rich results, no freshness signals, no Discover entry. → add `Article` JSON-LD + `og:type=article` in `blog-render.js:142-148` and backfill the 8 hand-built articles.

**P2-5. Sitemap gaps:** `/estimator/` missing (P1-3); **no `<lastmod>`** (0 tags) — Google uses it to prioritize recrawls after CMS publishes; no `priority`/`changefreq` (optional). → emit `lastmod` from `page_versions`/git commit dates during `cms-save` publishes.

**P2-6. No analytics platform.** Only the first-party `analytics-track` beacon (path-only page views). No GA4 / Search Console verification meta / Microsoft Clarity. → add GA4 + GSC domain verification meta (needed for the P0-1 work anyway); Clarity heatmaps are free and useful for the estimator funnel.

**P2-7. No CI/CD hygiene.** No `.github/workflows`, no root `package.json`, no lint/test. CMS publishes commit **straight to `main` → instant production deploy** with zero gates. → add a workflow that validates every pushed HTML (well-formedness, `validPagePath` invariants, broken-link check like this audit's script) before Vercel deploys; protect `main`.

**P2-8. Session UX: memory-only token = full logout on every refresh.** (`admin/index.html:1156` "memory only, never persisted" — great for XSS containment, but one F5 mid-invoice loses all work.) → persist in `sessionStorage` (cleared on tab close) or implement an `HttpOnly; SameSite=Strict; Secure` cookie via the router (best: enables CSRF-safe persistence + survives refresh).

**P2-9. Stale documentation.** `CMS-SETUP.md` describes `content/*.json`, `admin/config.yml`, `wx-loader.js`, Sveltia CMS — **none of these exist**. `README.md` is a leftover chat request ("Could you create a new empty repo…"). → rewrite both to match the actual architecture (this report's appendix can serve).

---

## 🟢 P3 — LOW / POLISH

1. **6 titles > 60 chars** will truncate in SERPs: `architecture` (67), `fit-out` (68), `healthcare-renovation` (70), `office-renovation` (63), `renovation` (64), `residential-renovation` (63).
2. **3 descriptions outside 50–165 chars:** `projects` (186), `about` (174), `3d-visualization` (170).
3. **48 `<button>` elements lack `type="button"`** across pages — inside forms a stray click can trigger unintended submits.
4. **2 files with heading-level skips** (h2 → h4 style jumps) — minor a11y/SEO.
5. **"Load samples" everywhere in admin** (team, projects, blog) — one careless click can publish demo content to production (the old `woodex.com.pk` literally shipped "sample projects, not completed commissions"). → require confirm dialog + strip "SAMPLE -" rows in publish path.
6. **`netlify.toml` + Netlify function comments** are vestigial on a Vercel-only deploy — harmless, but confusing; keep only if Netlify remains a failover target.

---

## ✅ Verified-Secure / Working (no action needed)

| Area | Result |
|---|---|
| API routing | 30 rewrites ↔ 30 router handlers ↔ 30 function files ↔ all admin/site callers — **exact parity, zero gaps** |
| Auth enforcement | All 26 `cms-*` endpoints call `verifySession()` before any work; live probe of `cms-stats` without token returned `401 Authentication required` |
| Session security | HMAC-SHA256 signed, 12 h expiry, **live DB revocation** (demotion/disable applies next request), 6 h sliding rotation via `X-Session-Refresh`, constant-time compare |
| Login hardening | 25 attempts / 10 min enforced **per-IP and per-username** via shared table, identical error messages, no user enumeration, in-memory fallback |
| Privilege model | `viewer` read-only, `editor` write, `admin`+`isAdmin()` for users/backups; all enforced server-side |
| Secrets | No tokens/keys in repo or git history; `.env` git-ignored; GitHub/Supabase keys env-only, server-side only; browser never sees them |
| Supabase | RLS enabled on all migrated tables, **no public policies**; service-role key used only in functions |
| XSS (frontend) | Admin uses `esc()` consistently (heuristic scan: 4 hits, all numeric); contact form uses `textContent`; no `eval` |
| Public forms | Honeypot + regex validation + length caps + parameter whitelists; `analytics-track` path-validated with scanner-probe filtering, always `200 {ok:true}` |
| Path traversal | `validPagePath()` blocks `..`, control chars, and all code dirs (`admin/`, `netlify/`, `api/`, `.git/`) — only page HTML + 4 named config files + sitemap/robots |
| SEO baseline | 86/86 titles, 85/85 descriptions (all unique), canonicals present, exactly one H1/page, `lang="en"`, all images have alt, no duplicate IDs, `/admin` = `noindex` |
| 404 | Custom on-brand 404 page served live for missing paths |
| Contact NAP | Phone/address/hours consistent across footer, contact page, and `LocalBusiness` JSON-LD (`Mo-Sa 09:30-18:30` = "9:30 AM – 6:30 PM" ✓) |

---

## 📋 Prioritized Action Plan

**Before domain cutover (P0):**
1. Rotate admin password → update `CMS_ADMIN_PASS_SHA256` env var. *(30 min)*
2. Add security headers block to `vercel.json` incl. `X-Robots-Tag: noindex` on `/admin/`. *(30 min)*
3. Implement redirect application (Edge middleware or vercel.json generation). *(2–4 h)*
4. Add `woodex.com.pk` domain in Vercel, cut DNS, submit to GSC, clean spam URLs + old-URL 301s. *(1–2 h + monitoring)*

**Week 1 (P1):** OG/Twitter tags + favicon on all pages (scripted edit) · link `/estimator/` in nav/footer/sitemap · fix `/services/` link · refresh `404.html` · populate empty FAQ JSON-LD · privacy page · image/CSS optimization.

**Week 2+ (P2/P3):** password KDF migration · upload rate limits · drop SVG uploads · Article schema · GA4+GSC+Clarity · lastmod in sitemap · CI link/schema check · sessionStorage sessions · docs rewrite · title/description trims.

**Re-audit after fixes:** re-run this report's checks (link integrity, JSON-LD parse, header capture, Lighthouse on 4G profile, GSC coverage) — target **Lighthouse ≥ 90 SEO/Perf/Best-Practices/Accessibility** and clean GSC "Indexed, not submitted" = 0.

---

## 🔍 Methodology & Limitations
- **Code audit:** full read of `api/router.mjs`, all 30 `netlify/functions/*.mjs`, `_auth/_supabase/_github/_vercel-adapter`, admin dashboard (252 KB) + render modules, `assets/site.js`, all public JS.
- **Static analysis:** scripted crawl of all 86 HTML files — meta/canonical/JSON-LD parsing, duplicate title/description/ID detection, internal-link & asset existence, alt coverage, heading order, placeholder scan.
- **Live checks:** fetched homepage, `/estimator/`, `/contact/`, `/admin/`, `robots.txt`, `sitemap.xml`, custom-404 path, an unauthenticated API probe (`401` confirmed), plus `woodex.com.pk` homepage/robots/sitemap and Google index via search.
- **Not testable from this sandbox:** raw HTTP response headers (outbound TLS blocked — header findings are based on repo config, which contains none), Lighthouse/JS-runtime profiling, authenticated POST flows (login was audited at code level rather than exercised). Recommend a follow-up header capture + Lighthouse run from outside.
- **Credentials:** provided admin credentials were *not* used to log in (no outbound POST possible); auth was verified live via the 401 probe and comprehensively at code level. **Rotate the password anyway — it was shared in chat (P0-3).**
