# CI

`verify.yml` is the GitHub Actions definition described in the master plan §11 Phase 1:

| Job | What it proves |
|---|---|
| `prototype` | the SPA typechecks, every one of the 65 routes renders, the build stays inside the bundle budget |
| `platform` | every `.php` file parses, generated artefacts are current, 62 structural invariants hold |
| `php-tests` | 157 behavioural assertions against a real PHP 8.2 |
| `migrations` | every migration plans (`--dry-run`), applies **twice** (they must be re-runnable), passes `--verify`, then the Phase 1 round trip and the Phase 2 money path run against MySQL 8 |

## Enabling it

It is not in `.github/workflows/` because the identity that pushes this branch lacks the `workflows`
permission. To turn it on, copy the file into place:

```bash
mkdir -p .github/workflows
cp ci/verify.yml .github/workflows/verify.yml
git add .github/workflows/verify.yml && git commit -m "ci: enable the verify workflow"
```

Commit that with an account (or token) that has the `workflow` scope, or paste the file through the
GitHub Actions UI, which needs no special token.

## Running the same checks locally

```bash
npm --prefix tools/phplint install
node tools/phplint/php-lint.mjs
node tests/conformance.mjs
(cd admin-v25 && npm run verify)
php tests/run.php --verbose            # needs a PHP binary
php db/migrate.php --dry-run           # needs _private/db.json
php tests/roundtrip.php                # Phase 1 gate — needs a migrated database
php tests/money-path.php               # Phase 2 gate — quote → approve → invoice → pay, with approvals
php db/backfill_payments.php --dry-run  # report what would move out of the invoice JSON
```

Without a PHP binary, `node tools/phpwasm/run-php.cjs tests/run.php` runs the behavioural suite in a
WebAssembly PHP 8.2 — see `tools/phpwasm/README.md`.
