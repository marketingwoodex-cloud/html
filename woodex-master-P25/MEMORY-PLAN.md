# Woodex admin v2.5 — work-sandbox memory

*Written 15 October 2026, at `aa2a57f`, on branch `arena/4150341e-marketingwoodex`.*
*The design authority is `ADMIN-V2.5-MASTER-PLAN-2026-10-13.md` (the 18-page plan, also as PDF). This
document is the memory: where things are, what is already true, what is next, and what bit us on the way.
Where the two disagree, the plan wins for design and this file wins for state.*

---

## 1. Resume in five minutes

```bash
git fetch origin && git reset --hard origin/arena/4150341e-marketingwoodex
cd admin-v25 && npm ci && cd ..                 # the console's dependencies
cd tools/phpwasm && npm ci && cd ../..          # php-wasm (the only PHP this sandbox has)
cd tools/phplint && npm ci && cd ../..

# the gate, in the order that fails fastest
node tools/phpwasm/run-php.cjs tests/run.php            # 1283 passed · 0 failed · 14 skipped
node tests/conformance.mjs                              # 86 passed · 0 failed
node tools/phplint/php-lint.mjs                         # 163 PHP files parse clean
cd admin-v25 && npm run typecheck && npm run smoke && cd ..   # tsc clean · 154 checks · 65 routes
node tools/gen-aliases.mjs --check && node tools/gen-caps.mjs --check

# the console (the API cannot run here — see §3; there is no sample data and no flag that turns any on)
cd admin-v25 && npm exec vite -- --host 0.0.0.0 --port 5173
```

The preview is proxied under the sandbox's own hostname; bind `0.0.0.0`, never `127.0.0.1`. Prove the
preview is *current* by fetching a source module, not the HTML shell — the build stamp lives in
`src/components/Shell.tsx` (a `+` after the short SHA means tracked files differ from that commit, which is
what an uncommitted screen looks like):

```bash
curl -s http://127.0.0.1:5173/src/components/Shell.tsx | grep -o 'built [0-9-]* [0-9:]*Z'
```

**A turn can come back re-cloned.** The workspace keeps the files but not `.git` or its `node_modules`: the
repository arrives at the base commit `782b50b` with the branch checked out and everything committed-to-date
sitting in the working tree as untracked or modified files, no dependencies installed, and the preview
process dead. The recovery, in this order, and the third step is the one that loses work if it is skipped:

```bash
cp <any file you changed since the last commit> /tmp/                 # reset --hard clobbers colliding files
git fetch origin && git reset --hard origin/arena/4150341e-marketingwoodex
cp /tmp/<that file> back                                              # then reinstall, restart the preview
```

`php-lint` is a quick detector of a half-restored tree: it prints the number of files it parsed, so 159 where
161 is expected means two files are missing from the working tree.

**There is no PHP and no MySQL in this sandbox.** `api/v2` cannot answer here: every screen is honest
about that (`not answering` in the status strip, `demo data` only in demo mode). Verification is by
tests, by `php-wasm`, and by running the console against sample data — the gate itself (§6) is a host run.

---

## 2. The two site generations — the single most confusing thing about this repo

The repository holds **two complete websites** and a stack of older admin generations. Knowing which is
which saves an hour every time.

| Tree | What it is | Evidence |
|---|---|---|
| `frontend-v1/` | **The live site as it ships to Hostinger.** 150 HTML pages, the v2.1 PHP API (`api/*.php`), the v2.1 admin (`admin/`, 69 files), `_private/`, `_database/`, `_templates/`, `.htaccess`, the installer (`wx-install.php`). Every P20–P22 release zip was built from this tree — the P22 payload is byte-identical to it. | `find frontend-v1 -name '*.html' \| wc -l` → **150**, the number the plan quotes |
| the repository root | **The v2.5 work area.** `api/v2/` (the new API), `admin-v25/` (the new console), `db/` (migrations), `tests/`, `tools/`, the plans — *plus* a second, newer marketing site (86 pages, `assets/site.css` + `assets/site.js`, enquiries posted to `/.netlify/functions/*`) that was built for the v26 redesign. | root `index.html` references `/assets/site.css`; root `contact/index.html` posts to a Netlify function |

The console edits **the tree under `WX_SITE_ROOT`**, which is `dirname(dirname(api/v2))` — the repository
root here, `public_html` on the host. So in this sandbox the console's page/hero/chrome/business screens
read the *root* (v26) pages, while the release carries the *`frontend-v1`* pages.

**Why the release is still right.** The cut-over in plan §14.2 is additive: `api/v2` is deployed beside
`api/`, the console beside `admin/`, and nothing of the live site is replaced. Three facts make the
console work on the live pages, and all three were checked against `frontend-v1/` before the P25 zip was
built:

- the chrome anchors the header/footer editor rewrites are present
  (`#header-cta` ×6, `.footer-main` ×2, `nav.desktop-nav` ×6 in `frontend-v1/index.html`);
- the form ids it recognises are present (`est-form`, `brief-form`, `fitout-hub-form`, `fitout-quote-form`);
- the announcement bar's contract is present: `frontend-v1/assets/site.js` already fetches
  `assets/announce.json` and applies `wx-ann--<style>` / `wx-has-ann`, `frontend-v1/assets/v1-p21.css`
  styles it, and `frontend-v1/assets/announce.json` exists (`{"on":false,…,"v":0}`).

**Open question for the owner (§9 Q7):** should the v26 pages replace the `frontend-v1` pages in the
release, or is the v26 site the Netlify deployment and Hostinger the admin/API host? Until that is
answered the release stays additive — it never replaces a live page.

---

## 3. Where everything lives

```
api/v2/                     the new API — one front controller and one file per resource
  index.php                 router, envelope, request-id, error boundary, shutdown guard
  .htaccess                 every path under /api/v2/ → index.php; lib/ and routes/ 404
  lib/            (33 files) bootstrap · errors · http · store · db · settings · validate · money · audit
                            auth · caps · approvals · router · pages · chrome · heroes · content · media
                            library · placements · theme · redirects · forms · estimator · notify
                            clientview · projects · clients · templates · business · announce · ai
  routes/         (33 files) one per router `file` name — the router loads exactly the matched one
  data/*.json               generated data (quote starters, section library, city templates…)
  aliases.php               the 365 v2.1 actions and where each was served from (generated)
db/migrations/000…014.sql   forward-only migrations; `db/migrate.php` runs them, `db/owner.php` gets you in
tests/run.php               the API's own suite, run under php-wasm (no database)
tests/conformance.mjs       duplicate functions, route-table parse, dead includes, gate coverage, SQL
                            interpolation, rate limits — and the shipped browser blocks run against stubs
admin-v25/src/
  lib/            nav.ts · api.ts · live.ts · format.ts · session.tsx · theme.ts
  components/     primitives.tsx · Shell.tsx · CommandPalette.tsx · charts.tsx · AiSettings.tsx
  screens/        23 live screens (the two prototype screens were deleted in P25.1)
tools/            phpwasm · phplint · gen-aliases · gen-caps · gen-quote-starters · gen-connectors · make-release
docs/             the audit and plan documents (moved here in P25; the P19 security audit joined them in P25.1)
frontend-v1/      the live site (§2)
woodex-master-P25/  the release pack: README · CHANGELOG · MANIFEST.json · this file · the zip
deploy/           one file left (`agentbridge.zip`); P15–P20 were deleted in P25.1
```

**What is *not* here any more, and where to find it.** The retired admin generations (`admin/` — the v1
"Woodex Dashboard" — and `wf-admin/`), the P20 site copy (`woodex-vlive-P20/`) and the superseded release
material under `deploy/` (P15–P20) were deleted in P25.1: about 1,045 files, ~67 MB. Nothing reads them;
`tests/conformance.mjs` used to walk two of them and now walks `frontend-v1/` alone. Any of it comes back with
`git log --diff-filter=A -- <path>` then `git show <sha>:<path>`.

Two slices have landed since P25 was packed: **the AI settings** (`lib/ai.php` + `routes/ai.php`, the panel in
`components/AiSettings.tsx`, §8a) and **publishing a page** (`wx_page_head_plan()` / `wx_page_publish()` /
`wx_page_state()` in `lib/pages.php`, `POST /pages/{rel}/publish`, the card in `screens/LivePages.tsx`, §8c).

Rules the publish slice added, which the next slice touching pages must keep:

- the *rules* of a page change live in a **pure** function (`wx_page_head_plan()` — HTML in, HTML and the
  facts out) and the reading/writing is the thin function around it. That split is why they are tested at all
  in a sandbox with no database;
- **absent means keep, empty means remove** — a request that does not carry a field must not erase it;
- the two files a page change writes besides the page are named by a constant *as well as* by their real path
  (`WX_PAGE_STATE_FILE`, `WX_PAGE_SITEMAP_FILE`) so a test can point them at scratch paths. `_private/pages.json`
  is v2.1's file and the old admin still reads it;
- `wx_write_file_atomic()` refuses any path outside `WX_SITE_ROOT`, so scratch files in a test live *inside*
  the site tree (a dot-named file is skipped by the page walk) and are deleted at the end.

House rules that the codebase now enforces, and that a new file must not break:

- a library is included from `lib/bootstrap.php` in dependency order — a new `lib/*.php` needs a line there;
- a route file's name must equal the `file` column its router rows declare (`routes/ai.php` ↔ `ai`);
- route wrappers are two lines (`wx_appr_route(...)` + `..._do`); route files load per request through
  `wx_route_match()`, never from `bootstrap.php`;
- every write route goes through the approval gate with a label in `WX_APPR_LABELS` when it is policy-wrapped;
- money is whole rupees, computed by `doc_totals()`; the screen prints, it never re-adds;
- `wx_settings` is the only settings writer; JSON stores go through `JsonStore` (`lib/store.php`).

---

## 4. What is built, and where it was proved

69 commits. The recent ones, newest first — the commit messages carry the reasoning, and they are worth
reading before changing the files they touch.

| Commit | Slice | The one thing it decided |
|---|---|---|
| `ac4156d` | **The sidebar's counts** | A count beside *Leads* is a claim about the studio's day: the server's answer, the sample **only** in demo mode, and otherwise nothing (a zero draws no badge). `badgeCounts()` is a function so all three states are asserted. |
| `bd6e6f8` | **Findability** (the SEO screen) | The audit moved from the browser to the server, the rules became two functions with no I/O (so they are tested at all), and no score is stored — the route that used to receive one recomputes it. `{rel:any}` so a page in a folder can be addressed. |
| `4bbefe5` | **The pages screen** listens to publishing | Where a page is public, in three facts read from the server, with the consequence written under the buttons; the service and city views are filters over the pages, not collections. |
| `e2ab209` | **Publishing a page** | v2.1's `page_meta_save` with one repair: the sitemap now follows the status both ways, so unpublishing takes the address out instead of leaving Google a promise. The rules are one pure function. |
| `93b66f0` | **The AI settings** | v2.1's record in v2.1's file; the key never leaves the server; and the request, the response and the model filter are three pure functions, which is the only reason the first outward call this API makes is tested at all. |
| `12d54cd` | **The P25 pack**, rebuilt | The release artifact for the commit that carries it; `gitSha` is deliberately one commit behind, because an artifact cannot contain its own hash. |
| `47cde56` | **Approvals screen** + the strip's stale clause | The Master's queue is a screen: read it, judge one request, decide it, change the policy. Approving replays the stored request; a preview never offers the button. |
| `76ea06a` | Business check reports visible pairs | A sentinel pair kept the phone-number spellings working without ever being *shown* as a string that was looked for. |
| `2cd5756` | **Business info** + **announcement bar** | The company details are read off the site, not out of a copy of the defaults; the bar is one JSON file with the site's own script fetching it. |
| `d59427a` | **Quote templates** | The nine BOQ shapes are *generated* from the site's own `assets/js/quotation-templates.js`, never hand-typed twice. |
| `4f9c269` | **Demo mode** *(deleted in `aa2a57f`)* | `VITE_WX_DEMO=1` / `?demo=1` only. A path with no fixture gets no answer; demo is never inferred and never a fallback. |
| `a6abdbf`, `93c41f5`, `7081759` | **Client updates** | The client page a link opens, the seven events, the channels — and the sending is described as it really is (`sent` only with a transport). |
| `cd368c2` | **Projects + timeline** | The money a project has actually billed, on its own date axis; a milestone-billed project is not "unbilled". |
| `3ad9116` | Forms + rate book | Which pages carry a form, where each enquiry goes, and the figures every price starts from. |
| `82e0b66` | Page heroes | Edit a hero where it stands (byte-range geometry), or pick one of six designs. |
| `b2945b5`, `750a59e`, `0114426` | Sign in + build stamp | Sign in with the name you have; the bundle names itself; the door says what is true before it is pressed. |
| `c67d564` | City pages | An address rule and a furniture rule, not copy-and-edit. |
| `f4ae6b9` | Builder bridge | v2.1's 19 builder actions: 17 served, 2 named as decisions; parameter names translated (`path` → `rel`). |
| `b78e054` … `876a9c3` | Fetchers, media upload, theme, page editor, section library | The Phase 3 gate's three sentences became one undoable write each. |
| `3deb37d`, `b97d3d8`, `81bb80d` | Header & footer, content CMS, chrome across pages | The header is one edit across every page; the article is composed by the server. |
| `158346e`, `7f8deb1`, `ba060b0`, `a031f93` | Redirects, media library, library, placements | The first Phase 3 screens, and the verdict keyed by the rule the API names. |

| `13d37db` | **The demo rule, and the identity in the chrome** | Three states, not two (see §8c3); the identity (`mailto:`, `tel:`, `wa.me`) as a fifth region of the chrome apply, with one preview, one batch and one undo for 150 pages. |
| `c058f12` | Connectors groundwork | The 24-card gallery generated from `admin-conn.js`, and the API's only outward call moved to `lib/http.php` (`wx_http_call()`), which the connector tests need next. |
| `aa2a57f` | **No sample data anywhere** | The console's fixtures, its door, its banner and its flag are deleted, and so are the two screens that existed only as prototypes (Pipeline, Quotations — their routes stay registered as `planned`). The smoke test's job changed with them: instead of asserting that a sample reaches the screen it asserted the *absence* — one sweep over 28 offline renders for the sentence, and no figures and no sample words anywhere in them. The retired admin copies and the superseded P15–P20 release material went in the same pass. |
| `c0d661b` | **The integrations, API half** | Five of the seven `conn_*` actions with routes, the 0600 store and its write-only secret, `conn_test` reporting statuses instead of raising them, the off-site backup asserted by opening it, and the two Gmail actions named as the remainder (§8c4). |

Measured at `aa2a57f`: **1283** API tests · **86** conformance checks · **163** PHP files lint clean ·
**154** smoke checks over **65** console routes · `tsc` clean · 365 legacy actions named, **163** bridged
(43% — the seven `seo_*` actions are the newest, and `page_meta_save` was the first *pages* one to cross).
The smoke count *fell* by 17 in P25.1 while the suite got stricter: 24 checks that rendered a screen twice —
once with a sample, once without — were replaced by one sweep over 28 offline renders that fails if any of
them shows a figure.

---

## 5. The gate, and what each part of it catches

| Command | Catches |
|---|---|
| `node tools/phpwasm/run-php.cjs tests/run.php` | behaviour: validation, approvals, money, page writes, publishing a page, the content composer, the announce block, the AI settings, the client page, the audit's rules, the seo store and the two public files, the identity swap the chrome screen applies, and the connector store with the backup it builds |
| `node tests/conformance.mjs` | the mistakes a compiler cannot see: a duplicated function name, a route row pointing at a missing handler, a dead `include`, a write route with no approval gate, SQL built by interpolation, the shipped browser blocks run against stubs |
| `node tools/phplint/php-lint.mjs` | PHP 8 grammar over `api/v2`, `db/`, `tests/` (the shipped command-line tools are shipped code) |
| `cd admin-v25 && npm run typecheck` | TypeScript, screens included |
| `cd admin-v25 && npm run smoke` | every route renders, and every state a server can cause is rendered by hand: signed out, checking, live, and **28 renders with no API behind them** — one sweep asserting each names the state it is in and that none of them shows a figure, or the words `Demo data` / `In this sample`. The sweep is the check that would catch a sample creeping back in, which is why it is written as a list of named renders rather than a count |
| `node tools/gen-aliases.mjs --check`, `gen-caps.mjs --check` | generated artefacts drifted from their source (365 actions; `001_roles.sql` byte-identical to v2.1's matrix) |

Two habits worth keeping: run `tests/conformance.mjs` after touching a route table, and rebuild the
smoke bundle after touching a screen — the smoke test reads a *built* bundle, so a stale `.smoke/`
proves nothing.

**The real gate is on the host** (plan §11, Appendix A): an editor publishes an article, changes the
header across 150 pages, and rolls the change back from page history. Migrations 000–014 are written and
re-runnable, but they have never run against MySQL — `php db/migrate.php --dry-run` is the first thing to
run there.

---

## 6. Traps — the ones that cost time, with the fix

**The sandbox**
- No PHP, no MySQL, no PHP extensions. `node tools/phpwasm/run-php.cjs <script>` mounts a *filtered* tree
  (plus `MOUNT_FILES`), excludes dot-directories, and does not mount `/tmp`.
- `npx tsc --noEmit` works only from inside `admin-v25/`.
- The API through the 5173 proxy answers `502 UPSTREAM` — by design. The console's answer to a missing
  API is a sentence, never data.
- Stale preview servers must be stopped before restarting (`pkill -f "vite --host 0.0.0.0 --port 5173"`), and
  a re-cloned turn leaves the old one dead — the port is free and the preview must be started again.
- A turn can come back re-cloned at the base commit: check `git log --oneline -1` before assuming. Then
  `git fetch origin && git reset --hard origin/<branch>` — **after backing up anything uncommitted**, because
  `reset --hard` deletes untracked files that collide with tracked paths. Dependencies and the preview
  process are gone too (§1).
- The JS/CDN dependencies of `tools/*` are not part of the workspace snapshot: `npm i --prefix tools/phpwasm
  @php-wasm/node@3.1.58`, `npm --prefix tools/phplint install`, `npm ci` in `admin-v25`.

**The console**
- React does not run effects during `renderToString`: a screen must feed its state from the fetched value
  (`draft ?? server`), never from an effect, or the smoke test sees an empty screen.
- Assertions in `smoke.tsx` read module-scope `let`s; a `const` declared inside the render pass is invisible.
- `at()`, the helper that renders a screen against a session, is declared *inside* one try block in
  `smoke.tsx` — a new render goes there too, or TypeScript says `TS2304`.
- Primitives: `Btn` is `default|primary|ghost` (plus `size`, `iconOnly`, `icon`) — there is no `danger`;
  there is no `.icon-btn` and no `.field`. Two-up rows are `.grid.grid-2`; wrappers are `className="stack"`.
- `ErrorCode` accepts only real codes — narrow an envelope with `isPending(r)` before reading it.
- SSR entity-encodes apostrophes and inserts `<!-- -->` between adjacent text children: interpolate into
  one template literal.
- `App.tsx` must import every primitive a screen renders, and a screen is not real until its id is in
  `BUILT_IDS` *and* it has a `<Route>` — otherwise the link opens the build-plan card (§8f).

**The API**
- Never call a helper without checking it exists; the v2.1 names are close enough to invent plausibly.
- **A path parameter matches one segment unless it says `any`.** `{rel}` is `[A-Za-z0-9_.-]+`, so
  `/seo/pages/services/kitchens/index.html` matched nothing at all — a page in a folder could not be
  addressed. `{rel:any}` is `(.+)`, which is what the SEO routes use (`wx_route_regex()` builds the pattern
  segment by segment, so a placeholder can absorb the rest of the path).
- `$a + $b` does not override keys — `array_merge()` does.
- `wx_doc_put`/`wx_doc_get` throw outside `WX_DOC_TABLES`.
- PHP single-quoted strings: a literal `'` or an unquoted word after `, ` is a parse error;
  `php-lint --verbose` names file:line.
- A JSON body is not a validation: every write goes through `wx_v_*`, and a refusal names the *field*.
- **A bridged id that is a string must be mapped as `['id' => 'id']`, not `['id']`.** The bridge's shorthand
  casts to int, so a connector id (`c` + ten hex characters) would arrive as `0` and every bridged call would
  address the first record — the same trap as the digit-key one below, wearing different clothes.
- **A PHP array key that looks like a number is an int.** `wa.me/923224000768` collected into a count map
  comes back as `[923224000768 => 1]`, so `array_keys()` is `[int]` and a test comparing it to `['…']` fails
  while the code is right. The survey casts everywhere it reads a key (`(string) $v`); the test casts too.
- **A regex looking for "the last text before `</a>`" can run into the *next* anchor.** The identity reader
  first matched `.*?([^<>]+)</a>`, which skipped an icon-only `tel:` link and captured the following mailto's
  address as that phone's label — a swap would then have written a phone number over an email address. Match
  the anchor first (`>(.*?)</a>`) and read the label out of its own content.

**The shell**
- **`tests/conformance.mjs` reads PHP and TSX as text, and its own reader can hide data.** It stripped
  comments with three regexes, so a fixture key ending in a star (the sample behind one page of a kind)
  contains the two characters that open a block comment — and everything from that string to the next
  end-of-comment marker vanished, including, in one file, both the sample the new screen reads and the list
  of samples that says so. The check whose whole job is to notice a missing sample then reported the file as
  fine. It walks strings now (`stripComments()`), strips a double slash only outside them, and has a
  self-check. If a string in a checked file looks like a comment opener, suspect the tool, not the check.
- **A very long table cell in the plan inflates the PDF.** A 2,000-character `Note` rendered to 18 pages
  instead of one (32 pages → 49), and the same text split in half rendered fine — the renderer loses its
  place on an over-long cell. Keep the plan's cells under ~1,800 characters and put the long-form reasoning
  here; the PDF is the copy the owner reads, so `tools/md2pdf.py` and the page count are part of the gate.
- A failed command inside a compound `&&` line does not stop the next command (a pipeline's exit code is
  the last command's). Re-grep after every patch.
- Backticks in `git commit -m` are substituted — write the message to a file and use `-F`.
- `git status --porcelain` needs `--untracked-files=no` to mean "tracked edits only".
- Python patch scripts must match their anchor exactly and write at the end; an `AssertionError` aborts
  before the write while the shell carries on.

---

## 7. The P25 release pack

`woodex-master-P25/` — `README.md` (install + upgrade), `CHANGELOG.md`, `MANIFEST.json`, this document, and
`woodex-master-P25.zip` (~29.16 MB · 727 files in the payload · 894 entries in the zip · 42.8 MB
uncompressed; the exact bytes and the SHA-256 are the manifest's, never this file's — the console's build
stamp is inside the zip, so two builds of the same commit differ by a byte). Rebuilt in P25.1, so the zipped console is the one with no sample data in it — its bundle
carries no `DemoBanner`, no fixture and no flag, and it does carry the sentence that replaced them.

**What the zip is.** The Hostinger payload: the live 150-page site (`frontend-v1/`) untouched, plus
`api/v2/`, `db/` (migrations + `migrate.php` + `owner.php`), and `admin-next/` — the built console at
`/admin-next/` per plan §14.2 step 2. The only site file the pack edits is `.htaccess`, and only by
appending a marked block that serves the console's deep links its own `index.html`.

**What the zip is not.** It is not the v26 marketing site (§2) and it does not replace any live page. It
is not an install: on a host that has never run v2.1 there is no database, and `wx-install.php` (included)
is the way to make one.

**How it is built.** `node tools/make-release.mjs` — repeatable, refuses to ship a credential
(`_private/db.json`, `.env`, `*.pem` except the CA bundle, anything named like a secret), refuses to build
if the console's build fails, appends the `.htaccess` block, zips with `-X` (no host metadata) and writes
`MANIFEST.json` with the git SHA, the console's own build stamp, file counts, SHA-256 of `api/v2/index.php`,
the console's `index.html`, and the zip itself, plus the migration list. `--dry-run` lists without copying;
`--skip-console` reuses an existing build. Two builds of one commit differ by exactly one line — the
console's build stamp, which carries the minute the bundle was built and is deliberately kept (it is what
makes a screenshot arguable). The payload is therefore bound to *commit + stamp*, and the manifest records
both, so no claim of byte-identical rebuilds is being made: an earlier claim in this project was wrong, and
the comment in `tools/make-release.mjs` says why.

**Upgrading a live site** (File Manager, not Hostinger's "Import website" tool):

1. back up `public_html` and the database;
2. upload the zip, extract over `public_html` (Overwrite), delete the zip;
3. `php db/migrate.php --status` → `--dry-run` → run it (it needs `_private/db.json`, which v2.1's install
   wrote);
4. open `/admin-next/` — sign in with an existing `wx_users` account (or `php db/owner.php --status`);
5. leave `/admin/` alone: it is the v2.1 admin and the rollback path until coverage is complete;
6. check the three generation facts from §2 on the host once, then roll back by restoring the previous
   release zip.

**Where the pack lives.** The Drive folder carries the zip, `MANIFEST.json`, `MEMORY-PLAN.md`, `CHANGELOG.md`
and the plan's PDF; P25.1 refreshed all five, trashing the three superseded copies rather than leaving two
generations side by side — a folder with two zips in it is a folder where somebody uploads the wrong one.
Committed in this repository at `woodex-master-P25/` (so the GitHub link is the
file's own page: <https://github.com/marketingwoodex-cloud/-marketingwoodex/tree/arena/4150341e-marketingwoodex/woodex-master-P25>, direct download <https://github.com/marketingwoodex-cloud/-marketingwoodex/raw/arena/4150341e-marketingwoodex/woodex-master-P25/woodex-master-P25.zip>), published as release
[`p25`](https://github.com/marketingwoodex-cloud/-marketingwoodex/releases/tag/p25), and copied to a public Drive folder for sharing:
<https://drive.google.com/drive/folders/12rpZKxUpHibqPZNMLi1VBMxlmWgTpBuz>. The release carries notes and a
tag rather than the file as an asset: `uploads.github.com` is blocked from the build sandbox (`github.com`
and `api.github.com` are not), so the payload was committed and pushed instead — the same bytes, with the
SHA-256 in the manifest to check either copy against.

**What the pack does not contain.** It is bound to commit + stamp (§7), so it stops matching the branch the
moment anything is committed after it — and one thing is deliberately true of every pack: the `gitSha` in the
manifest is one commit behind the pack's own commit, because an artifact cannot contain its own hash. The
pack was rebuilt twice in P25.1 (once for the demo deletion, once after this document was written); the rule
for the next slice is the same three publishing steps, in this order — **commit every document first, then
build, then publish** — because a pack built before its own documentation is a pack whose memory copy and
hashes are stale on arrival.

**One ordering trap, learned here.** The console's build stamp carries the *minute* it was built and the
commit it was built at (a `+` in the stamp means tracked files differ). Patching a document after the pack is
built therefore invalidates the pack twice over: the memory copy inside it is old, and the zip's hash changes
on the next build because the stamp does. Commit the documents, then build.

Rollback for any single file: `git show <sha>:<path>` on this branch — the manifest records the SHA the
payload was built from.

---

## 8. What is next, in order

### a. AI settings (`cms_ai_*`) — delivered, and the first outward call this API makes

`api/v2/lib/ai.php` + `routes/ai.php` (`GET|POST /ai/settings`, `POST /ai/models`, `POST /ai/test`), the
`AiSettings` panel at the foot of the Content screen, and the fixtures behind it. v2.1's contract is kept
exactly, because the record lives in **v2.1's own file** (`_private/content.json`) and both admins read it:
`AI_DEF`'s eleven keys, `anthropic` by default, the two per-provider defaults, and the writing voice with its
own 800-character limit while every other field stops at 300.

Four things were wrong in v2.1 and each is a decision here:

- **a read could leak a key** — `wx_ai_pub()` is the only serialiser, and a test asserts the key appears
  nowhere in the answer;
- **an empty key field meant *erase*** — absent and empty both mean *keep*; only `<k>Clear` deletes;
- **`clip($v, 300)` shortened a mistyped key into a wrong one** — this refuses and names the field;
- **the request, the response and the model filter lived inside one function** that only ran with cURL and a
  key — they are three pure functions now (`wx_ai_request()`, `wx_ai_text()`, `wx_ai_models_clean()`).

The call itself (`wx_ai_http()`) is the one `curl_exec()` in this API and **has never run**: this sandbox has
no cURL, no key and no route to a provider. The tests pin everything up to it — the request Claude needs
(`anthropic-version`, the voice as a top-level field, `max_tokens` 6000), the same request in OpenAI's shape
(the voice as the first message), the custom-endpoint URL rule, the model filter (OpenAI cut to
`^(gpt|o\d|chatgpt)`, embeddings/whisper/tts/dall-e/audio dropped, 400 maximum, the preferred default
suggested), the two shapes an answer carries text in, and the failure that names *which* thing is missing —
cURL or the key — instead of blaming the key.

On the host, the first thing to try is **Test the key** on the Content screen: it is one small request, and
its two failure messages are written to say which of the two it is.

### b. The announcement bar — delivered, and worth reading before touching

Built already (`api/v2/lib/announce.php`, `GET|POST /chrome/announce`, the panel in `LiveGlobal.tsx`, the
site's own script in `assets/site.js`), and it is the clearest example of this project's recurring shape: the
server half is small and the honest half is smaller. The contract, kept exactly:

- `assets/announce.json` — `{on, text, link, linkText, style, v}`; text ≤ 160, linkText ≤ 40;
- the link must match `^(/[^\s"<>]*|https://[^\s"<>]+|tel:\+?[0-9 ]+|mailto:[^\s"<>]+)$`;
- styles `navy|wood|cream`; `on` with empty text is a validation error naming the field;
- `v` is the visitor's dismissal key and moves only when the announcement changes;
- the write is atomic (`wx_write_file_atomic()`) — v2.1 truncated before it locked, so a page fetched during
  a save could get half a file and show nothing at all.

The feature had been working in the *older copy* of this site and was absent from the files `index.html`
actually links, so the console could have saved an announcement no visitor could ever see. That is why the
screen reports which half is missing — and how many pages load the script — instead of promising a bar, and
why the site side (`assets/site.js` + `assets/site.css`) shipped in the same slice.

### c. Services and cities — delivered, in the two halves it always had

The plan's row said "services & cities" and it turned out to be two different things, which is worth keeping
straight:

- **cities** are content items of type `city` published at a root-level address by the address rule and the
  furniture rule (`wx_content_rel()`, `wx_content_shell_rel()`, §8's `c67d564`); the `/cities` screen is the
  content studio with the city preset. v2.1's copy-and-rewrite flow is *not* ported, deliberately — plan §11.
- **services** were never a collection: v2.1's services screen was a *view* of the pages (kind ≠ city, minus
  articles and studies, minus the machinery), and the pages screen now offers exactly that filter, plus the
  cities the other way round, with each page's own `<body data-page>` as the kind.

Neither half could say whether a page was public, so **publishing a page** came with them: the status card on
the pages screen, `POST /pages/{rel}/publish` (v2.1's `page_meta_save`, bridged for the old admin), one pure
function for the rules and one thin function that writes the page, `_private/pages.json` and the sitemap.

### c2. Findability — delivered, and where the working out now lives

v2.1's SEO manager had the right three parts and the working out in the wrong place. `admin-seo38.js` fetched
all 150 pages six at a time, parsed them with `DOMParser`, counted the words and links, worked out a score and
posted the numbers back into `_private/seo.json` for the server to keep. So "how findable is the site" was a
question only a browser holding the whole site could answer, the answer changed with the machine, and a stored
number could say a page was an 82 while the page had no description.

Where everything is now:

- `api/v2/lib/seo.php` — `wx_seo_facts()` (one page, read once: title, description, H1s, words, images and
  the images without alt text, links, status, indexability, sitemap membership), `wx_seo_issues()` (findings,
  in sentences, each naming the field to fix), `wx_seo_score()` (the findings and nothing else — error 8,
  warn 3, note 1, floored at zero), `wx_seo_audit()` (all of it, worst first, with a tally), the schema
  builders (`wx_seo_schema_block()` / `wx_seo_schema_html()`), the robots pair and the sitemap helpers.
- `api/v2/routes/seo.php` — `GET /seo/pages`, `GET /seo/audit`, `GET|POST /seo/pages/{rel:any}`,
  `POST …/suggest`, `GET|POST /seo/robots`, `GET|POST /seo/sitemap`. The action names are v2.1's
  (`seo_list`, `seo_page`, `seo_save`, `seo_scores`, `seo_robots_save`, `seo_sitemap`, `seo_ai`) because the
  permission matrix and the approval policy are keyed on them: `seo_save` ends in `save`, so a Manager's
  change waits for the Master; `seo_sitemap` is recorded in `WX_APPR_NEVER` with its reason, because a
  sitemap is derived from the pages.
- `admin-v25/src/screens/LiveSeo.tsx` on `/seo` — the audit worst-first (score, page, phrase, findings), a
  per-page panel, the robots editor and the rebuild. Every field is `draft ?? server`, never seeded in an
  effect (PublishPanel's lesson).

Four decisions worth knowing before touching it:

1. **No score is stored.** `wx_seo_put()` keeps v2.1's file and v2.1's three fields (the phrase, the related
   phrases, the schema choice) and drops anything else, so the bridged `seo_scores` still answers the old
   screen without a second opinion about a page going stale in the store.
2. **The page's own head is not this screen's business.** Title, description, canonical and `noindex` stay
   `page_meta_save`'s (`POST /pages/{rel}/publish`); this screen reads them and says what Google will do.
3. **A schema choice is a change to the page**: one managed JSON-LD block (`id="wx-seo-schema"`) written
   through the versioned writer, so it lands in the page's history and rolls back from there. A type the page
   already declares is never added twice, and a page with no questions declares no FAQ.
4. **Both public files keep v2.1's refusals.** `Disallow: /` needs asking twice; a rebuild that would drop an
   address no page explains refuses instead of deleting somebody's own addition; and the sitemap follows the
   page status *out* as well as in.

Testing it without a database: `WX_SEO_TEST_FILE` and `WX_SEO_ROBOTS_FILE` are the seams (`define()` them
before the store/robots groups, as `WX_AI_TEST_FILE` is for the AI slice). The sitemap group is the one that
has to write real files — its explanations come from pages on disk, so it creates a scratch tree under
`WX_SITE_ROOT`, a scratch `_private/pages.json` and a root `500.html`, and deletes them at the end. The four
files that are not addresses (`404`, `500`, `503`, `coming-soon`) are one constant; the shipped
`sitemap.xml` lists exactly the 142 pages that remain.

### c3. The demo rule, and the identity in the chrome — delivered, and the sample data deleted in P25.1

**Three states, not two.** Four screens (`/dashboard`, `/leads`, `/pipeline`, `/quotes`) were one branch —
"the API answers, or draw the design's sample" — so anywhere without an API they showed names and figures that
were nobody's beside a strip saying the host was not answering. The rule became three states: the server's
numbers when there is a server, a sentence saying which state it is in when there is not, and — for two
releases — the design's own sample in demo mode for a design review on a host with no PHP. Pipeline and
quotations read no API at all, so outside demo mode they rendered their build plan and the nav said SOON.
The identity (`mailto:`, `tel:`, `wa.me`) landed in the same week and is described below.

**Then the owner was asked, and answered: delete the sample data entirely.** P25.1 removed it: `lib/demo.ts`,
`lib/mock.ts`, the door on the sign-in screen, the banner above the screens, the `?demo=1` query string, the
`VITE_WX_DEMO` build flag and the plumbing that carried them through ~15 files. The pipeline board and the
quotation builder were prototype screens with no API behind them at all — they went with the fixtures, and
their routes (`/pipeline`, `/quotes`) are registered `planned`, so the nav says SOON and the tile says what it
will do. `Dashboard.tsx` and `Leads.tsx` are now two-state wrappers: with a session they render the reading
screen, and without one they render a sentence. The smoke test's assertions were rewritten to the absence —
see §5 — and the *two* conformance checks that had proved demo mode's coverage now prove that nothing
sample-shaped is reachable from a screen.

**The identity.** `mailto:`, `tel:` and `wa.me` are the three facts a page states, each with more than one
spelling. `wx_chrome_identity_links()` reads a page (value, count, and the words a visitor reads — the last
text run inside the anchor, which is why the footer's `<span class="fl">E</span>` does not leak into it),
`wx_chrome_identity()` walks the site and answers what the *pages* say beside what the studio record says
(`matches` is computed server-side), and `wx_chrome_identity_html()` swaps href, words and the WhatsApp link.
It is a fifth `regions` value on `POST /chrome`, so it rides the existing preview, batch write and per-page
history — "the header across 150 pages" now includes the phone number, with one undo. The console shows it as
*Get in touch* on the Footer tab of `/global` (which now also takes `?tab=footer`). It follows links, not
prose: a number in a sentence, a map link or a PDF is left alone, and the counts say what it found.

### c4. What is left of Phase 3

**The integrations, from the console side.** The API half is in (`c0d661b`): five routes —
`GET /connectors`, `POST /connectors`, `DELETE /connectors/{id}`, `POST /connectors/{id}/test`,
`POST /connectors/{id}/push` — the 0600 store with its write-only secret, the generated 24-card gallery, and
the off-site backup. What is left is **`/connectors` itself**: a screen replacing the `Placeholder` tile at
`App.tsx:265` (the tile already names the actions, and `Placeholder.tsx` carries the `integrations:` row). There
are no fixtures to write for it any more (§8c3) — the screen reads `GET /connectors` and has one sentence for
a host that does not answer. Then, separately, `conn_gmail_send`/`conn_gmail_use`, which need an SMTP client
this API does not have yet — they are named in `wx_conn_list()['unported']` so the screen can say which half
it has.

Still open elsewhere in the phase: `page_delete` (trash + redirect) has no route, and
`LiveServices`/`LiveCities` as screens of their own stay unbuilt on purpose — both are views over the pages. The pages screen's remaining v2.1 action is
`page_delete` (trash + a redirect): the API has no route for it yet, and it is the one destructive page action
nobody has asked for. `LiveServices`/`LiveCities` as screens of their own are still unbuilt and probably
should stay that way — both are views over the pages, and the pages screen already offers them as filters.

### d. Phases 4–6

Read plan §12 for the schedule: 4 — AI centre, automation, WhatsApp (the AI half of findability —
`seo_agent`'s suggestions — is the SEO screen's `/suggest` route, already delivered); 5 — the rest of the
marketing surfaces; 6 — the client portal (tokenised, no login; the HMAC pattern already exists in
`quote-view.php`). Nothing else in those phases is started. `cms_ai_*` (§8a) was the first thing Phase 4
needed, and it is done.

### e. The host run — the only thing that proves the phase

On the host, after the upgrade in §7: publish an article as an editor; change the header through the
console and watch 150 pages change as one batch; roll that batch back from page history; check
`/api/v2/health`; check that `/admin/` (v2.1) still works. Record the numbers in the plan's §11 table —
they are the reason the table exists.

### f. Housekeeping, in the order it hurts

1. ~~Four screens fall back to the design's mock when the API does not answer.~~ **Done at `13d37db`** (the
   fallback became demo mode only), and **closed at `aa2a57f`**: the owner was asked whether to keep, hide or
   delete demo mode and answered *delete it entirely*. The fixtures, the door, the banner, the flag and the two
   prototype screens are gone (§8c3).
2. ~~Four admin generations coexist~~ — **two now** (`frontend-v1/admin/`, the live v2.0 admin, and the v2.5
   console; history's v2.1 is not in the tree). `admin/` (v1) and `wf-admin/` (v2 serverless) were deleted in
   P25.1, which is the point at which plan §2's finding stopped being true.
3. ~~The old release zips~~ — **the sweep completed in P25.1**: `deploy/p15…p20`, `deploy/release/`,
   `woodex-vlive-P20/` and the two retired admin copies are out of the tree; the P19 security audit was kept and
   moved to `docs/p19-security-audit/`. `woodex-master-P22/` (28 KB of documents, its zips long gone) and
   `deploy/agentbridge.zip` (25 KB, not one of ours) were left in place deliberately. The record is in
   `CHANGELOG.md`; the bytes come back with `git log --diff-filter=A -- <path>` then `git show <sha>:<path>`.
4. The v26 pages at the root are not the release's pages (§2). Either they replace the live ones later, or
   the release should stop carrying the older generation — an owner decision, not a build decision.

---

## 9. Open questions for the owner

The plan's §17 six decisions are still open and still block *design sign-off*, not the build: the
navigation model, the density/typography direction, the dashboard's one job, the client-facing document
design, the search & command palette's scope, and the portal's branding. They were deliberately not
re-asked.

New, found while packaging:

1. **Which generation of pages is the live site?** (§2) — the release currently ships both, additively.
2. **Do the sections' enquiries keep going to Netlify on the Hostinger copy, or move to `api/v2`?** The
   forms screen names the address each page posts to; Phase 4 is where the address changes.
3. **Should `/admin/` be repointed at the console now?** Plan §14.2 step 4 says when coverage is complete;
   with Phase 3 half-built, the honest answer is not yet — but the 302 is a five-minute change.

---

## 10. Working agreements

These were all learned the hard way in this project; they are the difference between a fix and a second bug.

1. **Fix the function that produces a label, not the string.** When something wrong appears on screen,
   find the one place that computes it (`linkLabel()`, `wx_notify_*`) and make *that* true, so the same
   wrongness cannot appear from a second screen.
2. **The console never presents a prototype as the product**, and never invents a number — *anywhere, for any
   reason, including a design review*. `not answering` with a reason when the host is silent,
   `live · api/v2 <version>` when it is not, and a sentence with **no figures at all** in between. Since P25.1
   there is no flag, no fixture and no query string that can put a number on a screen the server did not send;
   the smoke test's sweep over the offline renders is what keeps it that way (§5).
3. **A pasted label is evidence, not a complaint to be deleted.** Trace it to the code, then fix the code.
4. **The preview must be current, and proving it is part of restarting it** — fetch a module, not the HTML
   shell, and say which commit it is serving.
5. **A bare phase signal is approval to build.** Don't re-ask the plan's decisions; don't stop for the host
   gate; the next slice follows without a pause.
6. **The server is the only place a number is computed.** Screens print; they never re-add, round or
   re-derive money, counts or totals.
7. **Write the reasoning in the commit message.** `git log` is the project's other document — the plans say
   what should be true, the commits say why it is.
