# Woodex — Master Redirect Plan (P16 step 3.8b)

Verified 30 Sep 2026 against: the live sitemap (89 URLs), Google `site:woodex.com.pk` results, live fetches of each old URL, and the local `frontend-v1` build.

## Decisions (recommended defaults; user skipped the questions, so these can still be changed)
- Official address: **https://woodex.com.pk** (no www). One site-wide 301 sends www to non-www, keeping the path.
- Hacked spam URLs: **410 Gone**. Never redirect them to real pages.
- Dashboard Redirects manager: **full upgrade** (see below).
- Go-live: rules are **preloaded and active in the final 3.10 zip**, and can be edited or disabled in Admin → SEO → Redirects.

## A. Site-wide rules (.htaccess, managed block)
| Rule | Result |
|---|---|
| `www.woodex.com.pk/*` | 301 to `https://woodex.com.pk/*` (live today: www serves a full duplicate site) |
| `http://` | 301 to `https://` (already in place) |
| `/page/N/` (old WordPress pagination, e.g. `/page/17/` is indexed) | 301 to `/` |
| `/feed/`, `/wp-admin/*`, `/wp-login.php`, `/wp-content/*`, `/?p=N` | 410 |

## B. 301 redirects (old URL → new URL). All targets verified live ✅
| # | From | To | Source |
|---|---|---|---|
| 1 | /contact-us-2/ | /contact/ | **Google index** (404 today) |
| 2 | /design-planning/ | /interior-design/ | **Google index** (404 today) |
| 3 | /services/ | /interior-design/ | Old WP menu "Service" |
| 4 | /service/ | /interior-design/ | Old WP menu |
| 5 | /studio/ | /about/ | Old WP menu "Studio" |
| 6 | /portfolio/ | /projects/ | Old WP menu (404 today) |
| 7 | /interior-design/bedroom/ | /residential-bedroom-design/ | User table |
| 8 | /interior-design/home-office/ | /residential-home-office-design/ | User table |
| 9 | /interior-design/kitchen/ | /kitchen-design/ | User table |
| 10 | /architecture/educational/ | /educational-buildings-design/ | User table |
| 11 | /architecture/master-planning/ | /master-planning/ | User table |
| 12 | /renovation/residential/ | /residential-renovation/ | User table |
| 13 | /renovation/office/ | /office-renovation/ | User table |
| 14 | /renovation/commercial/ | /commercial-renovation/ | User table |
| 15 | /renovation/retail/ | /retail-showroom-renovation/ | User table |
| 16 | /commercial/restaurant/ | /restaurant-interior-design/ | User table |
| 17 | /commercial/beauty-salon/ | /beauty-salon-design/ | User table |
| 18 | /3d-studio/ | /3d-visualization/ | User table + old menu "3D Studio" |
| 19 | /project-the-open-house/ | /projects/ | User table |
| 20 | /insight-layering-light/ | /insights/ | User table |
| 21 | /insights/small-rooms/ | /insights/small-space-ideas/ | User table |
| 22 | /insights/costs-in-pakistan/ | /insights/interior-design-cost-pakistan/ | User table |
| 23 | /journal/ | /insights/ | Old menu "Journal" |
| 24 | /free-consultation/ | /contact/ | Old menu "Free Consultation" |

## C. 410 Gone (hacked spam, confirmed in Google's index)
- /gratis-gokkasten-spelen-netent/
- /777-nl-casino-nl-2025-review/
- /Figuren-itm-60842/* (Lego spam; pattern rule)
- /He&/ ("Hello world!")
- /cgi-sys/suspendedpage.cgi
- Pattern: any URL containing `casino|gokkasten|slot|itm-[0-9]+` → 410

## D. No redirect (live and correct)
`/`, `/about/`, `/contact/`, `/architecture/`, `/fit-out/`, `/privacy/`, `/estimator/`.
**Never redirect `/contact/`.** The estimator is linked from contact instead.

## E. Not a website fix
- `interior.woodex.com.pk` (a Dubai company on your subdomain): remove or fix the DNS record in Hostinger → DNS Zone. Steps go in the README.
- After upload: in Search Console, use Removals → "Temporarily remove" for the spam URLs, and resubmit the sitemap.

## F. Dashboard upgrade (Admin → SEO → Redirects), improving the existing module, not rewriting it
1. Rule types: 301 / 302 / **410 Gone**, plus exact or **pattern** (`/page/*`) matching.
2. **www switch** (on by default) writes the site-wide rule.
3. **Plan preloaded** with every row above, each tagged with its source (Google / old menu / plan).
4. **Test button**: checks that the target exists (so no redirect points to a 404), and flags loops and chains (A→B→C gets flattened).
5. **404 monitor**: the 404 page sends a tiny log entry, and the dashboard shows the top broken URLs visitors hit, each with a one-click "Redirect this".
6. CSV import/export and a hit counter per rule.
7. Backward compatible: existing saved redirects keep working.

## G. QA (part of 3.9)
- Mirror test: every row returns the right code (301/410) and Location header, with no chains.
- `/contact/`, `/estimator/` and all 89 sitemap URLs still return 200.
- The sitemap never contains redirected or 410 URLs.
