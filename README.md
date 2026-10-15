# Woodex — the site, and Admin v2.5

This repository holds the studio's website **and** the admin that runs it. The admin is being rebuilt
(React + TypeScript) on top of the existing PHP/MySQL backend — what the plan calls the strangler: v2.1
keeps working while v2.5 takes over one screen at a time.

> **Where this copy came from — 15 October 2026.** This is the **P25.1** project, imported whole: the same
> 1,778 files as `marketingwoodex-cloud/-marketingwoodex` at `aa96524` (tag `p25`), verified file for file,
> so that the gate runs and the release rebuilds from here. One file is deliberately absent —
> `woodex-master-P25/woodex-master-P25.zip` — because `node tools/make-release.mjs` rebuilds it (proved in a
> scratch clone of this content: 727 files, 42.8 MB uncompressed, zip 29,158,456 bytes, `gitDirty:false`).
> The links further down still point at the project's original home. The repository's previous content (two
> archives and a one-page README) and the 15 October analysis report were removed at the owner's direction
> before the import; the plan for what happens next is **`MASTER-PLAN-P25.2.md`**.

**Read these two first:**

- **`ADMIN-V2.5-MASTER-PLAN-2026-10-13.md`** — the design authority: the audit, the API specification,
  the phases, the gates, the schedule. (PDF beside it.)
- **`WORK-SANDBOX-MEMORY.md`** — the working memory: what is built and proved, how to run the gate, the
  traps, and exactly what is next.

**The release:** `woodex-master-P25/` — the Hostinger payload (`woodex-master-P25.zip`), its manifest, and
the install/upgrade notes in its `README.md`.

| Link | What |
|---|---|
| [Repository](https://github.com/marketingwoodex-cloud/-marketingwoodex) | this code, public |
| [Payload zip](https://github.com/marketingwoodex-cloud/-marketingwoodex/raw/arena/4150341e-marketingwoodex/woodex-master-P25/woodex-master-P25.zip) | the P25 release, 29.2 MB — also in [`woodex-master-P25/`](https://github.com/marketingwoodex-cloud/-marketingwoodex/tree/arena/4150341e-marketingwoodex/woodex-master-P25) |
| [Pull request #7](https://github.com/marketingwoodex-cloud/-marketingwoodex/pull/7) | the v2.5 build, phase by phase, with the reasoning in the commit messages |
| [Release `p25`](https://github.com/marketingwoodex-cloud/-marketingwoodex/releases/tag/p25) | what this release is, and where to check its bytes |
| [Google Drive](https://drive.google.com/drive/folders/12rpZKxUpHibqPZNMLi1VBMxlmWgTpBuz) | the same pack, for sharing: the zip, the manifest, the memory plan and the install notes |

## The map

```
frontend-v1/          the live site as it ships (150 pages, the v2.1 PHP API in api/, the v2.1 admin)
api/v2/               the new API: one front controller, one file per resource, 365 v2.1 actions bridged
admin-v25/            the new console: React 18 + TypeScript, 24 live screens and one still on mock data
db/migrations/        forward-only migrations, with db/migrate.php and db/owner.php
tests/                run.php (the API, under php-wasm) and conformance.mjs (the mistakes a compiler misses)
tools/                phpwasm · phplint · the generators · make-release.mjs (builds the payload zip)
docs/                 the audits and plans that led here — see docs/README.md
woodex-master-P25/    the release pack
```

The repository root is also the *site root* in development: `api/v2` treats `dirname(dirname(api/v2))` as
the site and edits the pages it finds there. On the host that is `public_html`; here it is this folder.

**One thing to know before touching pages.** There are two site generations in this repository:
`frontend-v1/` (the live 150-page site, the one the release ships) and the newer v26 pages at the root
(the ones enquiries post to Netlify from). `WORK-SANDBOX-MEMORY.md` §2 explains which is which, and why the
release is additive until that is decided.

## Working here

```bash
cd admin-v25 && npm ci && cd tools/phpwasm && npm ci && cd ../phplint && npm ci && cd ../..

node tools/phpwasm/run-php.cjs tests/run.php    # 1283 passed · 0 failed · 14 skipped
node tests/conformance.mjs                      # 86 passed · 0 failed
node tools/phplint/php-lint.mjs                 # 163 PHP files parse clean
cd admin-v25 && npm run typecheck && npm run smoke && cd ..   # tsc clean · 154 checks · 65 routes

cd admin-v25 && npm exec vite -- --host 0.0.0.0 --port 5173   # the console, against api/v2
```

There is no PHP and no MySQL in a build sandbox — `api/v2` cannot answer there, and every screen says so
rather than inventing data. The console has no sample data and no flag to turn any on: the four generators
(`node tools/gen-*.mjs --check`) are the other four gates, and they compare the console's constants against
the v2.1 files they were read from. The real gate (an editor publishes an article, the header changes across 150
pages, the change rolls back from page history) is a host run; `WORK-SANDBOX-MEMORY.md` §5 and §8e have the
steps.

## Making a release

```bash
node tools/make-release.mjs --dry-run     # what would be copied
node tools/make-release.mjs               # builds the console, assembles the payload, writes MANIFEST.json
```

The script refuses to ship a credential or to build on a broken console, and records the git SHA, the
console's own build stamp, file counts and hashes in the manifest — the artifact and the commit that
produced it stay tied together.
