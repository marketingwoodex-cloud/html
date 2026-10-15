<?php
/**
 * api/v2/lib/pages.php — every write to a page file goes through here.
 *
 * The site is static HTML on Apache. That is not changing in this phase, so the one thing that has to
 * be true is this: **nobody writes a page without a version of what it was.**
 *
 * v2.1 did have `cms_file_backup()`, and it is worth being precise about why that is not enough. It
 * copied the page into `_private/page-backups/<name>-<stamp>.html` — a file per write, with no record of
 * what the write *was*, who made it, or that forty other files were changed by the same button. The one
 * thing an editor actually asks after a bad change — "put this morning's header back" — could not be
 * answered without knowing which of 150 timestamps belonged to it.
 *
 * So a write here does three things, in this order:
 *
 *   1. **Copy the current content into `wx_page_versions`** under a batch id, with a note and a name.
 *   2. **Write the new content atomically** — temporary file in the same directory, then rename.
 *   3. **Update the index row and the audit trail**, and prune that page's history to 20 versions.
 *
 * The batch is the important part. One action that touches 150 pages shares one batch id, so rollback is
 * one call and it restores exactly that action — not "everything written in the last five minutes", which
 * might include somebody else's work.
 */

declare(strict_types=1);

/** How many versions of a page to keep. 20 × the largest page on this site is still under 2 MB. */
const WX_PAGE_KEEP = 20;

/** Folders that are not content: a page-walk never enters them and a write never targets them. */
const WX_PAGE_SKIP = ['_private', 'admin', 'admin-v25', 'api', 'builder', 'assets', 'node_modules', 'tools', 'db', 'ci'];

/**
 * Normalise a page path and refuse anything that is not a content page under the site root.
 *
 * This is the only door into the filesystem that a request body reaches, so it refuses rather than
 * repairs: an absolute path, a `..`, a system folder or a non-HTML extension is an error, not something
 * to be sanitised into something else.
 */
function wx_page_rel(string $rel): string
{
    $rel = ltrim(str_replace('\\', '/', trim($rel)), '/');
    $rel = (string) preg_replace('~/{2,}~', '/', $rel);
    if ($rel === '' || str_contains($rel, '..') || str_starts_with($rel, '.')) {
        throw ApiError::validation('That is not a page path', 'rel');
    }
    if (str_contains($rel, "\0")) {
        throw ApiError::validation('That is not a page path', 'rel');
    }
    $top = explode('/', $rel)[0];
    if (in_array($top, WX_PAGE_SKIP, true) || in_array($top, ['admin.php', 'api', 'index.php'], true)) {
        throw ApiError::validation('"' . $top . '" is not a content folder', 'rel');
    }
    if (!preg_match('~^[a-z0-9][a-z0-9/_.-]*\.html?$~i', $rel)) {
        throw ApiError::validation('Pages are .html files — "' . $rel . '" is not one', 'rel');
    }
    $abs = WX_SITE_ROOT . '/' . $rel;
    /* A symlink out of the site is a way to write anywhere on the host, so the resolved path has to stay
       inside the site root. Done on the directory, because the file itself may be about to be created. */
    $dir = realpath(dirname($abs)) ?: '';
    $root = realpath(WX_SITE_ROOT) ?: '';
    if ($dir === '' || $root === '' || ($dir !== $root && !str_starts_with($dir, $root . '/'))) {
        throw ApiError::validation('That page is outside the site', 'rel');
    }
    return $rel;
}

function wx_page_path(string $rel): string
{
    return WX_SITE_ROOT . '/' . wx_page_rel($rel);
}

function wx_page_exists(string $rel): bool
{
    return is_file(wx_page_path($rel));
}

/** Every content page on disk, relative to the site root, sorted. */
function wx_page_walk(string $dir, bool $top = true): array  /* $top: kept for the callers; the skip list applies at every depth */
{
    $out = [];
    if (!is_dir($dir)) {
        return $out;
    }
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '' || $f[0] === '.') {
            continue;
        }
        $abs = $dir . '/' . $f;
        if (is_dir($abs)) {
            /* Skipped wherever they appear, not only at the top: on the host `admin/` and `builder/`
               are top-level, but in the development tree they live under `frontend-v1/`, and counting
               their screens as content pages was finding N13 — the announcement bar's coverage claim
               failed on the real tree while passing on the mounted one. None of these names is a
               content folder on this site (checked, and refused as a page path by wx_page_path). */
            if (in_array($f, WX_PAGE_SKIP, true)) {
                continue;
            }
            $out = array_merge($out, wx_page_walk($abs, false));
        } elseif (preg_match('~\.html?$~i', $f)) {
            $out[] = ltrim(substr($abs, strlen(WX_SITE_ROOT)), '/');
        }
    }
    sort($out);
    return $out;
}

/**
 * The page index: what is on disk, joined with what the admin knows about it.
 *
 * The disk is the source of truth, so a page that appeared by ftp still shows up here — with no title
 * and no author, which is exactly the right way for it to look. `stale` marks a page whose bytes no
 * longer match the recorded size, i.e. somebody edited it outside the admin since the last write.
 */
function wx_page_list(bool $reindex = false): array
{
    $rows = [];
    foreach (wx_all('SELECT * FROM wx_pages') as $r) {
        $rows[(string) $r['rel']] = $r;
    }
    $out = [];
    $seen = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $seen[$rel] = true;
        $abs = WX_SITE_ROOT . '/' . $rel;
        $r = $rows[$rel] ?? null;
        $size = (int) filesize($abs);
        $out[] = [
            'rel' => $rel,
            'title' => $r !== null ? (string) ($r['title'] ?? '') : '',
            'folder' => str_contains($rel, '/') ? dirname($rel) : '',
            'bytes' => $size,
            'mtime' => gmdate('Y-m-d H:i:s', (int) filemtime($abs)),
            'updatedAt' => $r['updated_at'] ?? null,
            'updatedBy' => $r['updated_by_name'] ?? null,
            'stale' => $r !== null && (int) $r['bytes'] !== $size,
            'versions' => 0,
        ];
    }
    /* The version count for every page in one query — the alternative is a query per row in a list of
       hundreds of pages, which is the shape that makes a screen feel slow for no reason. */
    foreach (wx_all('SELECT rel, COUNT(*) n FROM wx_page_versions GROUP BY rel') as $r) {
        foreach ($out as $i => $p) {
            if ($p['rel'] === (string) $r['rel']) {
                $out[$i]['versions'] = (int) $r['n'];
            }
        }
    }
    /* Pages the index remembers but the disk no longer has: not deleted here, just reported. */
    $missing = [];
    foreach ($rows as $rel => $r) {
        if (!isset($seen[$rel])) {
            $missing[] = ['rel' => $rel, 'updatedAt' => $r['updated_at'], 'updatedBy' => $r['updated_by_name']];
        }
    }
    if ($reindex) {
        foreach ($out as $p) {
            wx_page_index($p['rel'], null, (int) $p['bytes'], null);
        }
    }
    return ['pages' => $out, 'missing' => $missing];
}

/** Read a page: the HTML plus what the index knows. */
function wx_page_get(string $rel, ?int $version = null): array
{
    $rel = wx_page_rel($rel);
    if ($version !== null) {
        $v = wx_one('SELECT * FROM wx_page_versions WHERE id = ? AND rel = ?', [$version, $rel]);
        if ($v === null) {
            throw ApiError::notFound('That version of the page is not in the history');
        }
        return ['rel' => $rel, 'html' => (string) $v['html'], 'version' => (int) $v['id'], 'createdAt' => $v['created_at'], 'createdBy' => $v['created_by_name'], 'note' => $v['note']];
    }
    if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
        throw ApiError::notFound('Page not found');
    }
    $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    return ['rel' => $rel, 'html' => $html, 'version' => null, 'bytes' => strlen($html), 'sha' => sha1($html)];
}

/** Upsert the index row for a page. Title is only touched when a title is passed. */
function wx_page_index(string $rel, ?string $title, int $bytes, ?array $me, ?string $sha = null): void
{
    $row = [
        'bytes' => $bytes,
        'sha' => $sha ?? sha1((string) @file_get_contents(WX_SITE_ROOT . '/' . $rel)),
        'updated_at' => wx_now(),
    ];
    if ($title !== null) {
        $row['title'] = mb_substr(trim($title), 0, 200);
    }
    if ($me !== null) {
        $row['updated_by'] = (int) $me['id'];
        $row['updated_by_name'] = (string) $me['name'];
    }
    if (wx_val('SELECT rel FROM wx_pages WHERE rel = ?', [$rel]) === null) {
        wx_insert('wx_pages', ['rel' => $rel, 'kind' => 'page'] + $row);
    } else {
        wx_update('wx_pages', $row, ['rel' => $rel]);
    }
}

/** The title a page already carries, so an index refresh does not throw it away. */
function wx_page_title_of(string $html): string
{
    return preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m) ? trim((string) preg_replace('~\s+~', ' ', $m[1])) : '';
}

/**
 * Keep a version of the page as it is right now, and return its id.
 *
 * Called before a write, so the table holds what the page *was*. If the file does not exist yet, there
 * is nothing to keep and this returns 0 — a new page has no "before".
 */
function wx_page_snapshot(string $rel, array $me, string $note = '', ?string $batch = null, ?string $html = null): int
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    if ($html === null) {
        if (!is_file($abs)) {
            return 0;
        }
        $html = (string) file_get_contents($abs);
    }
    $id = wx_insert('wx_page_versions', [
        'rel' => $rel,
        'html' => $html,
        'bytes' => strlen($html),
        'sha' => sha1($html),
        'note' => mb_substr(trim($note), 0, 200) ?: null,
        'batch' => $batch,
        'created_at' => wx_now(),
        'created_by' => (int) $me['id'],
        'created_by_name' => (string) $me['name'],
    ]);
    wx_page_prune($rel);
    return $id;
}

/** Keep a page's history to WX_PAGE_KEEP versions. Oldest first, so the rows removed are the oldest. */
function wx_page_prune(string $rel): int
{
    $ids = array_column(wx_all('SELECT id FROM wx_page_versions WHERE rel = ? ORDER BY id DESC', [$rel]), 'id');
    $drop = array_slice($ids, WX_PAGE_KEEP);
    if (!$drop) {
        return 0;
    }
    foreach ($drop as $id) {
        wx_q('DELETE FROM wx_page_versions WHERE id = ?', [(int) $id]);
    }
    return count($drop);
}

/**
 * Write one page. The one function in the product that puts HTML on the site.
 *
 * @param array{note?:string, batch?:?string, title?:?string, snapshot?:bool} $opt
 * @return array{rel:string, bytes:int, before:int, version:int, batch:string}
 */
function wx_page_write(string $rel, string $html, array $me, array $opt = []): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    $batch = $opt['batch'] ?? wx_uuid();
    $note = (string) ($opt['note'] ?? '');
    $version = 0;
    $before = 0;
    if (($opt['snapshot'] ?? true) === true && is_file($abs)) {
        $before = (int) filesize($abs);
        $version = wx_page_snapshot($rel, $me, $note, $batch);
    }
    $dir = dirname($abs);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw ApiError::internal('Could not create the folder for ' . $rel);
    }
    /* Temporary file in the same directory, then rename: a half-written page is a page nobody can load,
       and the rename is what makes the change appear complete or not at all. */
    $tmp = $abs . '.wx' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $html, LOCK_EX) === false) {
        throw ApiError::internal('Could not write ' . $rel . ' — is the site folder writable by the web server?');
    }
    if (!@rename($tmp, $abs)) {
        @unlink($tmp);
        throw ApiError::internal('Could not replace ' . $rel);
    }
    @chmod($abs, 0644);
    wx_page_index($rel, $opt['title'] ?? null, strlen($html), $me);
    wx_audit($me, 'page.write', $rel, ['bytes' => strlen($html), 'before' => $before, 'version' => $version, 'batch' => $batch, 'note' => $note]);
    return ['rel' => $rel, 'bytes' => strlen($html), 'before' => $before, 'version' => $version, 'batch' => $batch];
}

/**
 * Write many pages as one change.
 *
 * This is what "change the header across 150 pages" is. Every page shares the batch id, so the history
 * screen can show the change as one item and rollback restores exactly those files. The callback does
 * the edit: it receives the page's current HTML and returns the new HTML, or null to leave it alone —
 * which is how a header rewrite skips the pages that do not contain the header.
 *
 * @param callable(string $rel, string $html):?string $edit
 * @return array{batch:string, changed:array<int,string>, skipped:int, versions:array<string,int>}
 */
function wx_page_write_many(array $rels, callable $edit, array $me, string $note = ''): array
{
    $batch = wx_uuid();
    $changed = [];
    $versions = [];
    $skipped = 0;
    foreach ($rels as $rel) {
        $rel = wx_page_rel((string) $rel);
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            $skipped++;
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        $next = $edit($rel, $html);
        if ($next === null || $next === $html) {
            $skipped++;
            continue;
        }
        $r = wx_page_write($rel, $next, $me, ['note' => $note, 'batch' => $batch]);
        $changed[] = $rel;
        $versions[$rel] = $r['version'];
    }
    if ($changed) {
        wx_audit($me, 'page.write_many', count($changed) . ' page(s)', ['batch' => $batch, 'note' => $note, 'files' => array_slice($changed, 0, 20)]);
    }
    return ['batch' => $batch, 'changed' => $changed, 'skipped' => $skipped, 'versions' => $versions];
}

/**
 * The copies v2.1's builder kept, which are still on disk and still readable.
 *
 * v2.1 wrote a copy of a page into `_private/backups/<page>/<stamp>.html` before every save and kept the
 * last few. Those files are the only record of changes made *before* this API existed, so they are read
 * here rather than imported and forgotten: the version table answers "what has this page been since we cut
 * over", and these answer "what was it before". Both are returned by the same route, and each one says
 * which store it came from — a caller that cannot tell them apart would restore the wrong thing.
 *
 * The name is validated as a whole (`20261013-141530-482.html`) rather than sanitised, because the caller
 * supplies it and a file name is a path.
 */
/** v2.1's own mangling of a page path into one folder name — kept exactly, or its files are not found. */
function wx_page_backup_slug(string $rel): string
{
    return (string) preg_replace('~[^a-z0-9]+~i', '_', trim($rel, '/'));
}

function wx_page_backup_dir(string $rel): string
{
    return WX_PRIVATE_DIR . '/backups/' . wx_page_backup_slug(wx_page_rel($rel));
}

function wx_page_backup_name_ok(string $name): bool
{
    return preg_match('~^\d{8}-\d{6}(-\d{3})?\.html$~', $name) === 1;
}

/** @return array<int,array{file:string,size:int,at:string}> newest first, as v2.1 listed them. */
function wx_page_backup_files(string $rel): array
{
    $dir = wx_page_backup_dir($rel);
    if (!is_dir($dir)) {
        return [];
    }
    $out = [];
    foreach (glob($dir . '/*.html') ?: [] as $f) {
        $name = basename($f);
        if (!wx_page_backup_name_ok($name)) {
            continue;
        }
        $out[] = ['file' => $name, 'size' => (int) filesize($f), 'at' => gmdate('Y-m-d H:i:s', (int) filemtime($f))];
    }
    /* The names sort chronologically by construction, so the newest is the largest string. */
    usort($out, static fn(array $a, array $b): int => strcmp($b['file'], $a['file']));
    return $out;
}

/** One copy's HTML, with the same promise the editor makes: a page is a whole document or it is refused. */
function wx_page_backup_read(string $rel, string $file): string
{
    if (!wx_page_backup_name_ok($file)) {
        throw ApiError::validation('That is not the name of a saved copy', 'file');
    }
    $path = wx_page_backup_dir($rel) . '/' . $file;
    if (!is_file($path)) {
        throw ApiError::notFound('There is no saved copy of that page with that name');
    }
    $html = (string) file_get_contents($path);
    if ($html === '' || preg_match('~^\s*(<!doctype html|<html)~i', $html) !== 1) {
        throw ApiError::validation('That saved copy is not a whole page', 'file');
    }
    return $html;
}

/** Page history, newest first, with the batch each version belongs to. */
function wx_page_history(string $rel, int $limit = 50): array
{
    $rel = wx_page_rel($rel);
    $out = [];
    foreach (wx_all('SELECT id, rel, bytes, sha, note, batch, restored_from, created_at, created_by, created_by_name FROM wx_page_versions WHERE rel = ? ORDER BY id DESC LIMIT ' . max(1, min(200, $limit)), [$rel]) as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'bytes' => (int) $r['bytes'],
            'note' => (string) ($r['note'] ?? ''),
            'batch' => $r['batch'],
            'restoredFrom' => $r['restored_from'] !== null ? (int) $r['restored_from'] : null,
            'at' => (string) $r['created_at'],
            'by' => (string) ($r['created_by_name'] ?? ''),
            'byId' => $r['created_by'] !== null ? (int) $r['created_by'] : null,
        ];
    }
    return $out;
}

/**
 * Restore one version of one page.
 *
 * The restore is itself a write, so the content it replaces is kept first — undo has an undo. The new
 * version records `restored_from` so the history reads "back to 12:40" rather than showing an anonymous
 * edit at 14:02.
 */
function wx_page_restore(int $versionId, array $me): array
{
    $v = wx_one('SELECT * FROM wx_page_versions WHERE id = ?', [$versionId]);
    if ($v === null) {
        throw ApiError::notFound('That version is not in the history');
    }
    $rel = (string) $v['rel'];
    $r = wx_page_write($rel, (string) $v['html'], $me, [
        'note' => 'restored version #' . $versionId . ($v['created_by_name'] ? ' (' . $v['created_by_name'] . ', ' . $v['created_at'] . ')' : ''),
        'snapshot' => true,
    ]);
    wx_q('UPDATE wx_page_versions SET restored_from = ? WHERE id = ?', [$versionId, $r['version']]);
    return $r + ['from' => $versionId];
}

/**
 * Roll back a whole batch: the header change across 150 pages, undone in one call.
 *
 * For each page in the batch, the *oldest* version in that batch is the content from before the change,
 * so restoring that version is the rollback. A page that was new (no version in the batch) is not
 * deleted — a rollback that removes pages is a different, scarier operation, and saying so here is
 * better than doing it quietly.
 *
 * @return array{batch:string, restored:array<int,string>, missing:array<int,string>, errors:array<int,array{rel:string,message:string}>}
 */
function wx_page_rollback_batch(string $batch, array $me): array
{
    $batch = trim($batch);
    if ($batch === '') {
        throw ApiError::validation('Which change? Pass the batch id', 'batch');
    }
    $rows = wx_all('SELECT rel, MIN(id) id FROM wx_page_versions WHERE batch = ? GROUP BY rel', [$batch]);
    if (!$rows) {
        throw ApiError::notFound('That change is not in the history');
    }
    $restored = [];
    $missing = [];
    $errors = [];
    $undo = wx_uuid();
    foreach ($rows as $r) {
        $rel = (string) $r['rel'];
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            $missing[] = $rel;
            continue;
        }
        try {
            $v = wx_one('SELECT * FROM wx_page_versions WHERE id = ?', [(int) $r['id']]);
            wx_page_write($rel, (string) $v['html'], $me, ['note' => 'rolled back change ' . substr($batch, 0, 8), 'batch' => $undo]);
            $restored[$rel] = (int) $r['id'];
        } catch (Throwable $e) {
            /* One unwritable page does not abandon the other 149 — the caller is told exactly which. */
            $errors[] = ['rel' => $rel, 'message' => $e->getMessage()];
        }
    }
    wx_audit($me, 'page.rollback', substr($batch, 0, 8), ['restored' => count($restored), 'missing' => count($missing), 'errors' => count($errors), 'batch' => $batch, 'undo' => $undo]);
    return ['batch' => $batch, 'undoBatch' => $undo, 'restored' => array_keys($restored), 'missing' => $missing, 'errors' => $errors];
}

/**
 * Recent changes, **grouped by batch** — what the history screen shows.
 *
 * The rows in `wx_page_versions` are one per file, so the change that rewrote 148 pages is 148 rows with
 * the same batch id. Listing the rows is why a history screen is useless in practice: the first screenful
 * is one change, and "undo that change" looks like an operation on a single file. Grouping turns it back
 * into the thing the person did.
 *
 * Grouped in PHP from the recent rows rather than with SQL aggregates, because the values are the *same*
 * in every row of a batch and MIN()/MAX() over a note would be a way to hide a bug rather than a way to
 * be correct. The reads are bounded (a multiple of the requested number of changes).
 *
 * @return array<int, array{batch:string, note:string, by:string, at:string, pages:int, bytes:int, sample:string[], undoable:bool}>
 */
function wx_page_changes_grouped(int $limit = 40): array
{
    $limit = max(1, min(100, $limit));
    $rows = wx_all(
        'SELECT rel, bytes, note, batch, created_at, created_by_name FROM wx_page_versions ORDER BY id DESC LIMIT ' . ($limit * 40)
    );
    $groups = [];
    foreach ($rows as $r) {
        $batch = (string) ($r['batch'] ?? '');
        /* A version with no batch is a single-page write from before batches existed, or one the writer
           chose not to group. It is its own change, keyed by the row — this keeps that honest instead of
           lumping every unbatched version into one fake change. */
        $key = $batch !== '' ? $batch : 'single:' . (string) $r['rel'] . ':' . (string) $r['created_at'];
        if (!isset($groups[$key])) {
            if (count($groups) >= $limit) {
                continue;
            }
            $groups[$key] = [
                'batch' => $batch,
                'note' => (string) ($r['note'] ?? ''),
                'by' => (string) ($r['created_by_name'] ?? ''),
                'at' => (string) $r['created_at'],
                'pages' => 0,
                'bytes' => 0,
                'sample' => [],
                'undoable' => $batch !== '',
            ];
        }
        $groups[$key]['pages']++;
        $groups[$key]['bytes'] += (int) $r['bytes'];
        if (count($groups[$key]['sample']) < 8) {
            $groups[$key]['sample'][] = (string) $r['rel'];
        }
    }
    return array_values($groups);
}

/** Recent changes across every page, newest first — one row per file, for callers that want the detail. */
function wx_page_changes(int $limit = 100): array
{
    $out = [];
    foreach (wx_all('SELECT id, rel, bytes, note, batch, created_at, created_by_name FROM wx_page_versions ORDER BY id DESC LIMIT ' . max(1, min(500, $limit))) as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'rel' => (string) $r['rel'],
            'bytes' => (int) $r['bytes'],
            'note' => (string) ($r['note'] ?? ''),
            'batch' => $r['batch'],
            'at' => (string) $r['created_at'],
            'by' => (string) ($r['created_by_name'] ?? ''),
        ];
    }
    return $out;
}

/**
 * Rewrite every page that contains a given string, as one batch.
 *
 * The primitive the header/footer work and the media rewriters both use: find the pages, let the caller
 * transform each one, write them all under one batch id. Returning the batch is what makes it
 * reversible.
 *
 * @param callable(string, string):?string $transform
 */
function wx_page_rewrite_all(string $needle, callable $transform, array $me, string $note): array
{
    $rels = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        if ($needle === '' || str_contains($html, $needle)) {
            $rels[] = $rel;
        }
    }
    return wx_page_write_many($rels, $transform, $me, $note) + ['scanned' => count($rels)];
}

/**
 * Write a generated file that is not a page — the sitemap today, the launch announcement next.
 *
 * Same discipline as a page write (temporary file, rename, chmod) without a version row: these files are
 * *derived* from data that is itself versioned or queryable, so keeping history here would be history of
 * a cache. What it does keep is the property that matters on a live server — a reader never sees a
 * half-written file.
 */
function wx_write_file_atomic(string $abs, string $contents): bool
{
    $dir = realpath(dirname($abs)) ?: '';
    $root = realpath(WX_SITE_ROOT) ?: '';
    if ($dir === '' || $root === '' || ($dir !== $root && !str_starts_with($dir, $root . '/'))) {
        throw ApiError::validation('That file is outside the site', 'path');
    }
    $tmp = $abs . '.wx' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $contents, LOCK_EX) === false) {
        throw ApiError::internal('Could not write ' . basename($abs) . ' — is the site folder writable?');
    }
    if (!@rename($tmp, $abs)) {
        @unlink($tmp);
        throw ApiError::internal('Could not replace ' . basename($abs));
    }
    @chmod($abs, 0644);
    return true;
}

/** A batch id that is a real UUID v4 — the history groups by it and it travels in URLs. */
function wx_uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/* ============================================================ publishing a page

   v2.1 kept two facts about a page *outside* its file: the `<meta>` tags in its `<head>`, and one word in
   `_private/pages.json` — published, hidden or draft. Between them they decided three things a reader cares
   about and cannot see from the text of the page: whether search engines are told not to index it, whether
   `sitemap.xml` lists it, and whether v2.1's own screens treat it as public.

   That is the whole of what `page_meta_save` did, and this is the same operation with one correction. **The
   sitemap now follows the answer both ways.** v2.1 had `sitemap_add()` and no counterpart, so a page that was
   hidden or drafted kept its line in the sitemap for good: the studio's own "unpublish" went on telling
   Google that the address was current. Here a page that is not public and indexable loses its line, and gets
   it back when it is published again, in the same change.

   Two files are named by a constant as well as by their real path — `WX_PAGE_STATE_FILE` and
   `WX_PAGE_SITEMAP_FILE` — because they are the two files this writes, and one of them is the site's own
   sitemap. A test must be able to prove what a hidden page does to a sitemap without editing the live one.
*/

/** Published, hidden or a draft. v2.1's three words, and the absent status means the first. */
const WX_PAGE_STATUS = ['published', 'hidden', 'draft'];

/** The page-status map — v2.1's own file, which the old admin still reads and writes. */
function wx_page_state_file(): string
{
    return defined('WX_PAGE_STATE_FILE') ? (string) WX_PAGE_STATE_FILE : WX_PRIVATE_DIR . '/pages.json';
}

/** The sitemap this site publishes. */
function wx_page_sitemap_file(): string
{
    return defined('WX_PAGE_SITEMAP_FILE') ? (string) WX_PAGE_SITEMAP_FILE : WX_SITE_ROOT . '/sitemap.xml';
}

/**
 * Every page v2.1 recorded as not simply published: `rel => ['status' => …]`.
 *
 * A corrupt map is an error rather than an empty one. Empty would mean "every page is published", which is
 * the one answer that cannot be wrong quietly — it would put drafts back in the sitemap and tell the screens
 * a hidden page is live.
 */
function wx_page_state_map(): array
{
    $file = wx_page_state_file();
    if (!is_file($file)) {
        return [];
    }
    $raw = json_decode((string) file_get_contents($file), true);
    if (!is_array($raw)) {
        throw ApiError::internal(basename($file) . ' is not readable JSON — delete it and set the page statuses again');
    }
    return $raw;
}

function wx_page_state_write(array $map): bool
{
    ksort($map);
    return wx_write_file_atomic(
        wx_page_state_file(),
        json_encode($map, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n"
    );
}

/** The address this site publishes a page at, spelled the way the sitemap spells it. */
function wx_page_loc(string $rel): string
{
    return WX_CONTENT_SITE . wx_page_url($rel);
}

/** Is one address in the sitemap? */
function wx_page_in_sitemap(string $rel): bool
{
    $file = wx_page_sitemap_file();
    if (!is_file($file)) {
        return false;
    }
    $loc = wx_page_loc($rel);
    $xml = (string) file_get_contents($file);
    return str_contains($xml, '<loc>' . htmlspecialchars($loc, ENT_XML1) . '</loc>') || str_contains($xml, '<loc>' . $loc . '</loc>');
}

/**
 * Add or remove one address in a sitemap, and say whether the file changed.
 *
 * The file is an argument rather than an assumption so that the test can use a copy; in production the caller
 * passes `wx_page_sitemap_file()`. Both directions go through the same atomic write as every other file here,
 * so an interruption leaves the sitemap as it was rather than half of a pair of edits.
 */
function wx_page_sitemap_set(string $file, string $rel, bool $listed): bool
{
    if (!is_file($file)) {
        return false;
    }
    $xml = (string) file_get_contents($file);
    $escaped = htmlspecialchars(wx_page_loc($rel), ENT_XML1);
    $has = str_contains($xml, '<loc>' . $escaped . '</loc>') || str_contains($xml, '<loc>' . wx_page_loc($rel) . '</loc>');
    if ($listed === $has) {
        return false;
    }
    if ($listed) {
        return wx_sitemap_write($file, $xml, wx_page_loc($rel));
    }
    $next = (string) preg_replace('~[ \t]*<url><loc>' . preg_quote($escaped, '~') . '</loc>.*?</url>\n?~s', '', $xml);
    return $next !== $xml && wx_write_file_atomic($file, $next);
}

/**
 * Put one `<head>` tag in a page: replace it where the page already has it, add it where it does not.
 *
 * v2.1's `set_meta()` — the reason it is a *replacer* rather than an appender is that a page carrying
 * `og:image` twice is a page whose preview shows the wrong picture, and one that gains a second `<title>` is
 * one Google reads the first of. `$pattern` is the tag as the page writes it today (matching is generous:
 * attribute order, quoting and spacing are the page's business).
 */
function wx_head_set(string $html, string $pattern, string $tag): string
{
    if (preg_match($pattern, $html)) {
        return (string) preg_replace($pattern, $tag, $html, 1);
    }
    return str_contains(strtolower($html), '</head>')
        ? (string) preg_replace('~</head>~i', '  ' . $tag . "\n</head>", $html, 1)
        : $html . "\n  " . $tag;
}

/** The content of one `<meta>` tag, or null when the page has none. */
function wx_head_meta(string $html, string $name, string $attr = 'name'): ?string
{
    $pattern = '~<meta\b[^>]*\b' . preg_quote($attr, '~') . '\s*=\s*["\']' . preg_quote($name, '~') . '["\'][^>]*>~i';
    if (!preg_match($pattern, $html, $m)) {
        return null;
    }
    return preg_match('~\bcontent\s*=\s*(["\'])(.*?)\1~is', $m[0], $v) ? (string) $v[2] : '';
}

/**
 * One page's publication state, in the three facts a screen has to show.
 *
 * `status` comes from the map (absent means published, as v2.1 meant it), `indexable` from the page's own
 * robots line — the two are independent, because a page can be published *and* deliberately kept out of
 * search — and `inSitemap` from the file on disk rather than from either of them, since that is the thing a
 * person is asking about.
 */
function wx_page_state(string $rel): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    $html = is_file($abs) ? (string) file_get_contents($abs, false, null, 0, 400_000) : '';
    $map = wx_page_state_map();
    $status = (string) ($map[$rel]['status'] ?? 'published');
    if (!in_array($status, WX_PAGE_STATUS, true)) {
        $status = 'published';
    }
    $robots = (string) (wx_head_meta($html, 'robots') ?? '');
    return [
        'rel' => $rel,
        'status' => $status,
        'title' => wx_page_title_of($html),
        'description' => (string) (wx_head_meta($html, 'description') ?? ''),
        'robots' => $robots,
        'indexable' => stripos($robots, 'noindex') === false,
        'inSitemap' => wx_page_in_sitemap($rel),
    ];
}

/**
 * What publishing does to a page's `<head>` — and the refusals that come before it.
 *
 * Pure: page HTML in, new HTML and the facts out, no file read and no write. That is deliberate, because
 * this is where every rule lives, and a rule inside a function that also writes files can only be tested on
 * a host with a database attached. The harness has neither, so the rules would have gone unproven — which is
 * how v2.1's version of this ended up sending `clip($v, 300)` at a key and treating an empty field as
 * "erase".
 *
 * `$in` is the request body. **A field that is absent is left alone** — a status change sent from a screen
 * that does not carry the canonical link must not remove the page's canonical link. The same rule as the AI
 * keys, for the same reason: a form that erases what it was not told about is a form that loses work.
 *
 * @param array $in title, description, canonical, ogImage, noindex — all optional
 * @return array{html:string, title:string, description:string, noindex:bool, listed:bool, note:string}
 */
function wx_page_head_plan(string $rel, string $html, string $status, array $in): array
{
    if (!in_array($status, WX_PAGE_STATUS, true)) {
        throw ApiError::validation('A page is published, hidden or a draft', 'status');
    }
    /* v2.1's rule, and it is about the site rather than the page: the home page is what somebody typing the
       domain gets, so there is no version of "not published" that is not a broken website. */
    if ($status === 'draft' && wx_page_url($rel) === '/') {
        throw ApiError::validation('The home page cannot be a draft — it is the site', 'status');
    }
    $title = array_key_exists('title', $in) ? trim((string) $in['title']) : wx_page_title_of($html);
    if ($title === '') {
        throw ApiError::validation('A page needs a title — it is the line Google shows', 'title');
    }
    foreach (['canonical', 'ogImage'] as $field) {
        if (!array_key_exists($field, $in)) {
            continue;
        }
        $v = trim((string) $in[$field]);
        if ($v !== '' && !preg_match('~^(https?://|/)[^\s"<>]*$~i', $v)) {
            throw ApiError::validation('A link here starts with https:// or /', $field);
        }
    }

    $head = wx_head_set($html, '~<title>.*?</title>~is', '<title>' . wx_h($title) . '</title>');
    if (array_key_exists('description', $in)) {
        $desc = trim((string) $in['description']);
        $head = $desc === ''
            ? (string) preg_replace('~[ \t]*<meta\s+name="description"[^>]*>\s*~i', '', $head, 1)
            : wx_head_set($head, '~<meta\s+name="description"[^>]*>~i', '<meta name="description" content="' . wx_h($desc) . '">');
        /* v2.1's rule for an empty value: the tag goes, and no empty one is written in its place. An
           `<meta … content="">` is worse than no tag — it is a tag a crawler reads. */
        $head = $desc === ''
            ? (string) preg_replace('~[ \t]*<meta\s+property="og:description"[^>]*>\s*~i', '', $head, 1)
            : wx_head_set($head, '~<meta\s+property="og:description"[^>]*>~i', '<meta property="og:description" content="' . wx_h($desc) . '">');
    }
    $head = wx_head_set($head, '~<meta\s+property="og:title"[^>]*>~i', '<meta property="og:title" content="' . wx_h($title) . '">');
    if (array_key_exists('ogImage', $in)) {
        $og = trim((string) $in['ogImage']);
        $head = $og === ''
            ? (string) preg_replace('~[ \t]*<meta\s+property="og:image"[^>]*>\s*~i', '', $head, 1)
            : wx_head_set($head, '~<meta\s+property="og:image"[^>]*>~i', '<meta property="og:image" content="' . wx_h($og) . '">');
    }
    if (array_key_exists('canonical', $in)) {
        $can = trim((string) $in['canonical']);
        $head = $can === ''
            ? (string) preg_replace('~[ \t]*<link\b[^>]*rel=["\']canonical["\'][^>]*>\s*~i', '', $head, 1)
            : wx_head_set($head, '~<link\b[^>]*rel=["\']canonical["\'][^>]*>~i', '<link rel="canonical" href="' . wx_h($can) . '">');
    }

    /* A draft and a hidden page are not indexed whatever the request said; a page going public has the
       noindex line removed, and a robots line that says something else is the page's own business. */
    $noindex = !empty($in['noindex']) || $status !== 'published';
    if ($noindex) {
        $head = wx_head_set($head, '~<meta\s+name="robots"[^>]*>~i', '<meta name="robots" content="noindex, follow">');
    } elseif (stripos((string) (wx_head_meta($head, 'robots') ?? ''), 'noindex') !== false) {
        $head = (string) preg_replace('~[ \t]*<meta\s+name="robots"[^>]*>\s*~i', '', $head, 1);
    }

    $note = $status === 'published'
        ? ($noindex ? 'published, kept out of search' : 'published')
        : ($status === 'hidden' ? 'hidden from the site' : 'draft');
    return [
        'html' => $head,
        'title' => $title,
        'description' => (string) (wx_head_meta($head, 'description') ?? ''),
        'noindex' => $noindex,
        'listed' => $status === 'published' && !$noindex,
        'note' => $note,
    ];
}

/**
 * Publish, hide or draft a page — v2.1's `page_meta_save`, whole.
 *
 * The head tags, the status file and the sitemap are one change, and all three are reported: the page's HTML
 * goes through the same versioned writer every other edit uses (so a publish is one undo in the history) and
 * the audit log carries the status, the robots line and what happened to the sitemap.
 *
 * When nothing in the file changes — the page already had that title and that robots line — the file is
 * **not** rewritten, and the answer says so. A publish is not allowed to bump a page's mtime under somebody
 * who is editing it, and a version that contains no change is noise in the history.
 *
 * The rules themselves are in `wx_page_head_plan()`, which is pure; this function is the reading and the
 * writing. No code guard runs: the transformation writes head tags and cannot introduce script.
 */
function wx_page_publish(string $rel, string $status, array $in, array $me): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $before = (string) file_get_contents($abs);
    $plan = wx_page_head_plan($rel, $before, $status, $in);

    $wrote = $plan['html'] !== $before;
    $r = $wrote
        ? wx_page_write($rel, $plan['html'], $me, ['note' => 'page ' . $plan['note']])
        : ['batch' => null, 'version' => 0, 'bytes' => strlen($before)];

    $map = wx_page_state_map();
    if ($status === 'published') {
        unset($map[$rel]);
    } else {
        $map[$rel] = ['status' => $status];
    }
    wx_page_state_write($map);

    $sitemapChanged = wx_page_sitemap_set(wx_page_sitemap_file(), $rel, $plan['listed']);

    wx_audit($me, 'page.meta', $rel, [
        'status' => $status, 'noindex' => $plan['noindex'], 'sitemap' => $plan['listed'],
        'sitemapChanged' => $sitemapChanged, 'wrote' => $wrote,
    ]);

    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'status' => $status,
        'noindex' => $plan['noindex'],
        'title' => $plan['title'],
        'description' => $plan['description'],
        'listed' => $plan['listed'],
        'inSitemap' => wx_page_in_sitemap($rel),
        'sitemapChanged' => $sitemapChanged,
        'wrote' => $wrote,
        'version' => $r['version'],
        'batch' => $r['batch'],
        'bytes' => $r['bytes'],
        'note' => $plan['note'],
    ];
}
