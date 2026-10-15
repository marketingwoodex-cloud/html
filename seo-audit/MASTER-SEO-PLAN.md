# Woodex — Master SEO Plan & To-Do (P30)

Date: 2026-10-07 · Site: https://woodex.com.pk · Business type: **local service** (interior design, fit-out, renovation, architecture; HQ Lahore, serves Pakistan)
Method: claude-seo v2.4 (`tools/skills/claude-seo/`) categories, run as 9 parallel checkers by `tools/seo-audit/audit.py` over all **107 public pages** in `frontend-v1/`. You can re-run it any time with `python3 tools/seo-audit/audit.py`.
Findings by category: `seo-audit/findings/*.md`. Raw data: `seo-audit/audit-data.json`.

## 1. Scorecard (code in the repo, before deploy)

| Category | Score | Main issue |
|---|---|---|
| On-page (titles, meta, H1) | 100 | No issues: every page has a unique title, description and one H1 |
| Images | 100 | All images have alt text and dimensions; WebP in 3 sizes |
| Schema | 100 | LocalBusiness, Service, FAQPage, Breadcrumb, BlogPosting present |
| Sitemap | 97 | No `<lastmod>`, no image entries |
| Internal links | 96 | 0 broken, 0 orphans; 12 weakly linked pages; 64 service pages link to no article |
| AI search / GEO | 95 | No `llms.txt`; no explicit AI-bot policy |
| Technical | 94 | **No www → non-www 301** |
| Local SEO (NAP) | 86 | **2 phones, 2 emails, 6 spellings of the address** |
| Content & E-E-A-T | 74 | **No named author**; 8 city pages ~62% identical; 4 thin pages |
| **Overall health** | **92** | |

### Biggest issue: the live site is out of date
https://woodex.com.pk/insights/ still serves an older build: the Gmail address, hours 10:00–7:30, the "Why Woodex" section, and only 8 articles. **None of P25–P29 is live yet, including the 20 new articles.** Every on-page improvement waits on uploading the zip.
Google still lists old WordPress and hacked spam URLs (they return 404). These need a 410 plus removal in Search Console.

## 2. What could not be checked from the sandbox (needs your access or keys)
- **Google Business Profile:** categories, photos, posts, Q&A and reviews. Needs owner login.
- **Maps geo-grid ranks and competitor radius:** needs a DataForSEO or Local Falcon key (paid).
- **Search Console and GA4 data** (indexing, queries, Core Web Vitals field data): the admin already connects through the service account (P16). Run it once the site is live.
- **Backlinks and citations:** Bing Places, Apple Business Connect, Brownbook and PK directories. Manual work.

## 3. Master to-do list (priority order)

### Phase A: Go-live and technical fixes (Critical, in code)
- [ ] A1. Upload the current zip to Hostinger (makes P25–P29 and the 20 articles live)
- [x] A2. `.htaccess`: 301 www → non-www and http → https in one hop; HSTS, nosniff and Referrer-Policy headers
- [x] A3. `.htaccess`: return 410 Gone for old WordPress and spam URL patterns (`/?p=`, `/wp-*`, `/product/`, spam slugs)
- [x] A4. Sitemap: add `<lastmod>` (from git dates) and image entries; generate it automatically in the builder
- [ ] A5. Search Console: submit the sitemap and request removal of the spam URLs (step guide)

### Phase B: NAP and local signals (High)
- [x] B1. One phone number everywhere: choose between +92 322 4000768 (used 329 times) and +92 321 4686884 (15 times)
- [x] B2. One email everywhere: info@woodex.com.pk (214) or woodexinterior.pk@gmail.com (64 pages still use it)
- [x] B3. One exact address string in all schema and footers: "M-71, Zainab Tower, Model Town Link Road, Lahore 54700"
- [ ] B4. LocalBusiness schema: add geo coordinates, `openingHoursSpecification` (Mon–Sat 9:30–6:30), `sameAs` (GBP, Facebook, Instagram, LinkedIn) and `hasMap`
- [x] B5. GBP checklist: primary category "Interior designer", secondary categories, services matching site pages, weekly posts, photo plan, review request flow (WhatsApp template after handover)
- [x] B6. Citation list: the 15 key PK and global directories with the exact NAP

### Phase C: E-E-A-T and content quality (High)
- [ ] C1. Author system: named designer profiles (`/about/team/<name>/`) with credentials; `author: Person` plus `reviewedBy` on all 28 articles; visible byline
- [ ] C2. Add BlogPosting schema, dates and bylines to the 8 older articles
- [ ] C3. Rewrite the 8 near-duplicate city pages with unique local content (areas served, local projects, travel/site-visit policy, local FAQs) to remove the doorway-page risk
- [ ] C4. Expand the thin pages (/contact, /book-a-visit, /estimator, /projects) with process, FAQ, map and trust content
- [ ] C5. Add real prices or ranges to the cost articles (Nabeel); add project case studies with photos

### Phase D: Internal links and topic clusters (Medium)
- [ ] D1. Pillar → cluster map: Interior Design, Renovation, Fit-out, Kitchens, Architecture, 3D (pillars) ↔ the 28 articles
- [ ] D2. "Related guides" block on all 64 service and location pages (2–3 matching articles each)
- [ ] D3. Lift the 12 weakly linked pages to 3+ inbound links
- [ ] D4. Breadcrumb trail visible on articles and services

### Phase E: AI Overviews / GEO (Medium)
- [ ] E1. `/llms.txt` (company facts, services, key pages, contacts)
- [ ] E2. robots.txt: explicit Allow for GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot and Google-Extended
- [ ] E3. A 40–60 word "answer first" paragraph under each service H1; FAQ blocks on About, Projects and Contact
- [ ] E4. Organization schema: `sameAs`, `foundingDate` 2016, `numberOfEmployees`, `knowsAbout`

### Phase F: Strategy and growth (ongoing)
- [ ] F1. Content briefs for the next 20 articles (keyword, outline, internal links), from the gaps: city-specific cost, bathroom, flooring, paint, 10-marla, office in Gulberg, salon/clinic fit-out
- [ ] F2. Monthly audit re-run (`audit.py`) plus Search Console review in the admin
- [ ] F3. Backlinks: supplier and brand pages, PK design press, project features

## 4. Recommended order
**A → B → C → D → E → F.** A and B are quick and have the biggest impact. C is the main ranking lever for a local service business. D and E build on C.

---
## P31: Per-page deep audit + implementation (2026-10-07)
- Tool: `tools/seo-audit/page_audit.py`, one worker per page in parallel, 107 pages. Report: `seo-audit/PAGE-AUDIT-INDEX.md` plus `seo-audit/pages/<page>.md`, with sections: target keywords · title/meta/H1 · section blocks · internal links · schema · issues · fix list · E-E-A-T · owner claims.
- Fixer: `tools/seo-audit/fix_pages.py` (safe to re-run). It never touches claims.
- **Average page score 80 → 97. Site health 92 → 95.**
- Done:
  - [x] Hours text set to Mon–Sat 9:30–6:30 on 26 pages
  - [x] 112 "placeholder" image alts rewritten
  - [x] Keyword-led titles and metas on 35 pages (home, 3D, 11 cities, 8 older articles, 6 project studies, hubs, lahore, renovation, fit-out, contact, estimator)
  - [x] Schema: Organization + WebSite (home), AboutPage, ContactPage, CollectionPage ×2, BlogPosting ×8, CreativeWork ×6
  - [x] "Related guides" block on 64 service, pillar and city pages (topic-matched articles)
  - [x] Service links from the older articles
- Waiting on the owner: `seo-audit/OWNER-CLAIMS.md` (prices on 60 pages, "free" on 49, timelines on 56, warranty on 16, superlatives on 34, absolute claims on 7)
- Still open:
  - C1 named authors
  - C3 unique city content (8 near-duplicate pages)
  - creative H1s on /interior-design/ and the project studies (design choice, not changed)
  - kitchen card image on /interior-design/
  - raster logo for schema (currently favicon.svg)
