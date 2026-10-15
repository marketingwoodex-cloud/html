# Woodex Interior: Google Business Profile, social links and NAP

Plan item **G4**, done on 15 October 2026. Every link below was opened and checked against the studio's
NAP (D-6: M-71 Zainab Tower, Model Town Link Road · +92 322 4000768 · info@woodex.com.pk). The data
behind the website lives in `tools/entity.json`, and `tools/apply-entity.py` writes it into the pages.

## 1. The verified links

| Profile | Link | What was checked |
|---|---|---|
| **Google Business Profile** | https://maps.google.com/?cid=301798693140782080 | Listing "Woodex Interior", category Interior designer. M-71, Zainab Tower, Model Town Link Rd, Lahore 54700. +92 322 4000768, woodex.com.pk, Mon–Sat 09:30–18:30, Sunday closed. 5.0 from 12 reviews, 18 photos, last owner post 27 Sep 2026. |
| Facebook | https://www.facebook.com/woodexinterior | Page "Woodex interior", Lahore, "an interior designing firm… since 2015", 728 likes. Linked from the previous website. |
| LinkedIn | https://www.linkedin.com/company/woodexinterior | Company page "woodexinterior" (Architecture and Planning), shown by LinkedIn itself. The founder's profile lists it. |
| X (Twitter) | https://x.com/woodexinterior | "Woodex Interior believes in the power of design…". **Dormant:** 4 followers, no recent posts. |

The other Google links, all for the same listing (place ID `ChIJt4DGF8wHGTkRAFxV-k80MAQ`):

| Use | Link |
|---|---|
| Open the listing (website buttons) | https://www.google.com/maps/search/?api=1&query=Woodex%20Interior%20Lahore&query_place_id=ChIJt4DGF8wHGTkRAFxV-k80MAQ |
| Directions | https://www.google.com/maps/dir/?api=1&destination=Woodex%20Interior%20Lahore&destination_place_id=ChIJt4DGF8wHGTkRAFxV-k80MAQ |
| **Ask a client for a review** (G5) | https://search.google.com/local/writereview?placeid=ChIJt4DGF8wHGTkRAFxV-k80MAQ |
| The Google search panel | https://www.google.com/search?kgmid=/g/11pxjybmwp |

The review link opens Google's sign-in, then the review form for Woodex Interior. Send it on WhatsApp after
every handover. The "Ask for reviews" button in the Google Business Profile dashboard gives a short
`g.page/r/…` link that does the same job.

## 2. Confirm these before they go on the site

| Account | Why it is not used yet |
|---|---|
| https://www.instagram.com/woodexinterior/ | Linked from the previous website (archived Dec 2024), but Instagram blocks every outside check. |
| https://www.pinterest.com/woodex_interior/ | Same: linked from the previous website, not checkable from outside. |
| https://www.tiktok.com/@woodexinterior | The account exists, but it is private and has 0 posts. Is it ours? |

If an account is yours and active, choose one of these:

- **Repo:** add it to `tools/entity.json`, under `sameAs` and also under `footerSocial` if it should show in the footer. Then run `python3 tools/apply-entity.py` and commit.
- **Live site only:** paste it into Admin → Business info → Social profiles.

**Never link these look-alikes:**
- `linktr.ee/woodex` and Instagram `be.woodex`, `view.woodex`, `woodex.grp` (a showroom in Kuwait)
- LinkedIn `woodexme` (Kuwait City)
- Instagram `woodexofficial` (UK wood art)
- Instagram `woodx_interior`
- the "Woodex Interior" entries on archiipedia.com (India)

## 3. Sister brand: Woodex Furniture

Woodex Furniture has its **own** Google listing:
- LG 89, Zainab Tower; Office furniture store
- 4.7 from 15 reviews
- woodexfurniture.pk, same phone number

It stays separate. Never put its links in Woodex Interior's `sameAs`, and never show its reviews as Woodex Interior's.

**Its listing's hours read 10:30 to 07:30 the next morning, most days. Please correct them.**

## 4. NAP check: website against the Google listing

| Field | Website | Google listing | |
|---|---|---|---|
| Name | Woodex Interior | Woodex Interior | ✓ |
| Address | M-71, Zainab Tower, Model Town Link Road, Lahore 54700 | M-71, Zainab Tower, Model Town Link Rd, Phase 3 GECH Society, Lahore 54700 | ✓ (Google adds the area name) |
| Phone | +92 322 4000768 | +92 322 4000768 | ✓ |
| Hours | Mon–Sat 9:30–6:30, Sunday closed | Mon–Sat 09:30–18:30, Sunday closed | ✓ |
| Website | https://woodex.com.pk/ | **http**://woodex.com.pk/ | ✗ change it to https in the listing |
| Founded | 2016 (site, schema, llms.txt) | n/a (Facebook says "since 2015") | ✗ choose one year |
| Reviews | **was** "4.5 stars, based on 267 reviews" | 5.0 from 12 reviews | fixed in the repo, see 5.2 |

## 5. What changed in the repository (PR #8)

### 5.1 Commit `c0b3e97`: one identity on every page

- **Schema:** all 102 LocalBusiness blocks now have the shared `@id`, the postal code 54700 and the listing's map pin (`geo`). Their map link (`hasMap`) is the Google listing, and their `sameAs` lists the Google listing, Facebook, LinkedIn and X. The home page's Organization block also has `sameAs`.
- **Map links:** 493 Google Maps links now open the listing, with its reviews and photos. Before, they ran a search for the street address. The contact page's map now pins the listing, not just the building.
- **Footer:** Facebook and LinkedIn icons are on every page. The markup is exactly what the admin's Business info screen writes; running the admin's own code over the result changes nothing.
- **Other files:** `llms.txt` now has the postal code and an "Official profiles" section, and the builder's Social icons widget points at the real profiles.

### 5.2 Commit `c69a5eb`: honest reviews on the home page

- **Score panel:** it showed "4.5 stars, based on 267 reviews" next to "See all reviews on Google". A visitor who clicked through found 12. It now shows "5.0, based on 12 Google reviews", taken from `tools/entity.json`.
- **"Verified" ticks:** the blue ticks on the three review cards are gone, because Google says its reviews are not verified.
- **Check the three cards (Amna Zafar, Shah Nawaz, Shahroz Ahmed):** please confirm they are reviews on the **Woodex Interior** listing. Their "5 months ago" dates are fixed text and will go stale.

### 5.3 Commit `914fb7c`: v2.5 writes the footer icons (N16)

v2.5's Business screen wrote social links as empty boxes with no icon. It now writes v2.0's markup byte for byte, and a test holds the two to each other.

### 5.4 CI

`ci/verify.yml` runs `python3 tools/apply-entity.py --check`, which fails if a page drifts from `tools/entity.json`.

## 6. Putting it on the live site (admin v2.0)

The footer can be updated today from the admin, with no file upload. Steps A and B can be done in either order.

**A. Footer icons.**
1. Open Admin → Business info → **Social profiles**.
2. Facebook: `https://www.facebook.com/woodexinterior`
3. LinkedIn: `https://www.linkedin.com/company/woodexinterior`
4. Leave the other fields empty.
5. Press **Check changes**, then **Update website**.

**B. Footer map links.**
1. Open Admin → Header & footer → **Find & replace**.
2. Tick **Footer** only.
3. Copy each "find" text exactly, including `&amp;`. The tool searches the page source.
4. Press **Preview matches**, then **Replace everywhere**. Each changed page is backed up.

| # | Find | Replace with | Expected |
|---|---|---|---|
| 1 | `https://www.google.com/maps/search/?api=1&amp;query=M-71%2C%20Zainab%20Tower%2C%20Model%20Town%20Link%20Road%2C%20Lahore` | `https://www.google.com/maps/search/?api=1&amp;query=Woodex%20Interior%20Lahore&amp;query_place_id=ChIJt4DGF8wHGTkRAFxV-k80MAQ` | about 290 matches (address link and map icon) |
| 2 | `https://www.google.com/maps/search/?api=1&amp;query=Woodex+Interior+Zainab+Tower+Model+Town+Link+Road+Lahore` | the same replacement as row 1 | about 145 matches (the "Location" link) |

**C. Schema, in-page links and the review panel.** These are outside the header and footer, so the
admin's Find & replace cannot reach them. They go live with the next website release (P23), which is
built from this repository after the production file inventory. Do not upload these pages over the live
site before that inventory: live pages may carry admin edits that the repository does not have.

The "267 reviews" line is the exception: it should not wait. If the page builder lets you edit that line
on the home page, change it to "Based on 12 Google reviews" now.

## 7. Owner checklist outside the website

1. **Google listing (business.google.com):**
   1. Change the website to `https://woodex.com.pk/`.
   2. Add the social profiles (Edit profile → Contact → Social profiles: Facebook, LinkedIn, and Instagram once confirmed).
   3. Then continue G4: services, weekly photos, posts, and seeding Q&A.
2. **Facebook and LinkedIn pages:** use the same website (https), phone and M-71 address. Fix the founding year once it is decided (Facebook says 2015).
3. **Woodex Furniture's listing:** fix its overnight hours.
4. **Reviews (G5):** send the review link after every handover, and reply to every review.

## 8. Follow-ups for development

- **v2.5 schema sync:** when the Business screen saves social profiles, v2.5 should update `sameAs` in the schema as well as the footer. Until then, `tools/entity.json` plus the tool keep them in step.
- **Blog author:** the 88 blog posts name their author organization "Woodex Studio". Use the official name or a real designer, and change the visible byline and the schema together.
