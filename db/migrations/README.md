# Migrations

Five rules, in order of how much damage breaking them does.

**1. Additive only.** v2.1 is still serving customers on this same database while v2.5 is built behind
it. Nothing here drops a column, renames one, or rewrites a row that v2.1 reads. That is why
`wx_quotes.data` is still called `data`: renaming it to `payload` would break the admin that is taking
payments right now. `api/v2` resolves the column name at runtime (`wx_payload_column()`) and works with
either, and the rename belongs to the cleanup phase — after the old admin stops reading it.

**2. Re-runnable, because DDL cannot be atomic.** MySQL implicitly commits DDL, so a transaction around
a migration is an illusion. Instead every statement is written to be safe on a second run: `CREATE TABLE
IF NOT EXISTS`, `INSERT IGNORE`, and `ALTER` guarded by an `information_schema` lookup through
`PREPARE`/`EXECUTE` (MySQL 8 has no `ADD COLUMN IF NOT EXISTS`; MariaDB does, and the host may be
either). A migration that fails when re-run is not a migration — it is a trap for the next deploy.

**3. Never destroy a row to satisfy a constraint.** Where the live data violates a new foreign key, the
orphan's reference is set to `NULL` and the row keeps its text (`004_fk.sql`). Where a `NOT NULL` child
column would force `ON DELETE CASCADE`, no foreign key is added and the reason is written down. The only
`DELETE` in the series is in `db/backfill_payments.php`, and it is guarded by a dry run.

**4. Say why.** Every migration explains what was wrong, not just what changed. The next person reading
`002_indexes.sql` needs to know which screen was slow, not that an index exists.

**5. One thing per file.** A file that creates a table and rewrites business data cannot be reviewed as
either one thing or the other, and it cannot be re-run safely. Moving receipts out of the invoice JSON
is `db/backfill_payments.php`, deliberately not part of `006`.

## The series

| File | What it is |
|---|---|
| `000_platform.sql` | the four tables api/v2 needs: `wx_sessions`, `wx_login_attempts`, `wx_secrets`, `wx_migrations`; plus the request-id and JSON columns `wx_activity` gains, and the two-factor columns `wx_users` gains |
| `001_roles.sql` | **generated** — the capability matrix, extracted from `frontend-v1/api/roles-lib.php` by `tools/gen-caps.mjs`. Never hand-edit: `node tools/gen-caps.mjs --check` fails in CI when it drifts from v2.1 |
| `002_indexes.sql` | the indexes the slow screens need, one per query, with the screen named in a comment |
| `003_document_columns.sql` | the fields of a quotation, invoice and project that are asked questions about, promoted to real columns beside the JSON |
| `004_fk.sql` | foreign keys where they are safe: orphans repaired first, `CASCADE` only where the child is meaningless without the parent |
| `005_settings_seed.sql` | the settings v2.5 reads, seeded with v2.1's values. `INSERT IGNORE` throughout: a seed adds what is missing and never overwrites a decision a person has made |
| `006_payments_approvals.sql` | `wx_invoice_payments` (a receipt is a record, not an array element) and `wx_approvals` (the queue, with who decided what) |
| `007_inbox_columns.sql` | the four columns the unified inbox needs on `wx_chats` (`assigned_to`, `tags`, `handoff`, `ext`) plus its two index shapes. v2.1 created these on first use inside a try/catch; a schema that three hosts disagree about is the result — this file is the same columns, created once, recorded like everything else |
| `008_security_state.sql` | two columns on `wx_users`: `totp_last` (a code cannot be replayed inside its own 30-second window) and `alerts` (one person's preference, not a settings row named after them). This is the last of the security state that v2.1 kept in `_private/security.json` |

## Money

Totals in migration 003 are `BIGINT` **whole rupees** — the unit v2.1 already uses
(`doc_totals()` rounds with `(int)round()`, `pay_add` with `(int)round(numv(...))`).

Paisa was considered and rejected. During the cut-over the v2.1 admin reads these same rows, so a
change of unit makes every invoice off by 100× in whichever admin has not been rebuilt yet — and a
100× error on an invoice is worse than sub-rupee precision the product never uses. Line-item rates
inside a document `payload` keep two decimals, as v2.1 stores them.

All the arithmetic lives in one place, `api/v2/lib/money.php`, so no screen can invent its own
rounding — which is how v2.1 ended up with two pages disagreeing about one total.

## Running them

```bash
php db/migrate.php --status          # what is applied, what is pending, what was edited after applying
php db/migrate.php --dry-run         # plan only — needs a database, because the plan reads the schema
php db/migrate.php                   # apply everything pending
php db/migrate.php --verify          # fail if anything is pending or was edited after being applied
php db/migrate.php --only 006        # one file
php db/migrate.php --baseline        # record as applied WITHOUT running — for a host that already has
                                     # these tables from an earlier release
```

An applied file whose checksum has changed stops the runner. That is deliberate: a database that no
longer matches the migrations in the repository is how staging and production start disagreeing about
the schema, and the disagreement always surfaces at the worst time. The fix is a new migration, never an
edit to an old one.

## Rollback

There is none, and that is a decision rather than a gap. Rolling back `004_fk.sql` would mean dropping
constraints the application now relies on; rolling back `003` would mean dropping columns that hold the
totals the invoices were printed from. The supported rollback is a restore from backup (`db/backup.php`
on v2.1, the backups screen in v2.5), which is tested in the plan's Phase 5. What makes that acceptable
is rule 1: every migration is additive, so the previous release keeps working against the new schema.
