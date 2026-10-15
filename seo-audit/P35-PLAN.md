# P35 Plan: pending pages (services, locations, blog)
_Audit of frontend-v1 on 2026-10-07. Approve the phases you want; nothing below is built yet._

## Done now
- **/services/** hub: 53 services in 6 groups (Interior · Commercial · Hospitality/Healthcare · Fit-out · Renovation · Architecture), image cards, 4 steps, FAQ, contact block.
  Schema: CollectionPage + ItemList + Breadcrumb + FAQ + speakable. Added to sitemap and llms.txt.
- Header "Services" now opens /services/ on click (dropdown still opens on hover). Footer "Services" → /services/ on all pages.

## What the analysis found
| Area | Status | Gap |
|---|---|---|
| Service pages | 53 pages, all 800+ words | All share ONE social image (og:image); 13 group-overview links reuse the same pillar pages |
| Missing services (searched in PK) | none | Bathroom design · Wardrobe design · False ceiling design · Apartment interior · Dressing room · Kitchen renovation |
| City pages | 12 cities | Lahore page thinnest (698 words) |
| Lahore area pages | 0 | DHA · Bahria Town · Gulberg · Johar Town · Model Town · Cantt · Lake City · Wapda Town |
| Blog | 38 posts | 10 newest are ~300–500 words (target 900+); no named author (Person schema = 0) |
| Claims | | PKR on 62 pages; "fixed pricing" on 10+ pages; needs Nabeel's OK (OWNER-CLAIMS.md) |

## Proposed phases (recommended order)
1. **P35-A Quick SEO fixes**: unique og:image per service page (its own hero), expand Lahore page with local content.
2. **P35-B 6 new service pages**: bathroom, wardrobe, false ceiling, apartment, dressing room, kitchen renovation. Same template as current service pages, add to /services/ + menu.
3. **P35-C 8 Lahore area pages**: /lahore/dha/ etc. Unique local content per area (house sizes, typical projects, nearby), LocalBusiness areaServed, link from /lahore/.
4. **P35-D Blog**: expand the 10 new posts to 900+ words; write 10 more (area guides + new services topics); add named author once you send names.
5. **P35-E Claims cleanup**: after Nabeel confirms, remove or keep PKR and "fixed pricing" text.

## Needed from you
- Author names and credentials · real project photos per service/area · real GBP reviews · Nabeel's answers on claims.
