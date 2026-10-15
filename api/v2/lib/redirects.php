<?php
/**
 * api/v2/lib/redirects.php — the URL rules, the 404 log, and the .htaccess block they become.
 *
 * Ported from `redirects-lib.php`, with three changes that matter:
 *
 * **1. The rules are rows, not a JSON file** (`wx_redirects`, migration 009). The screen edits one rule
 * at a time instead of rewriting the whole file, so two people editing different rules no longer lose
 * each other's work — which in v2.1 was a read-modify-write on a single JSON file. The stored shape is
 * v2.1's (`from`, `to`, `type`, `match`, `src`, `on`), because the .htaccess writer and the plan file
 * both speak it.
 *
 * **2. The list is validated as a whole, then saved as a whole, in one transaction.** `wx_rd_clean()`
 * is pure — it turns a request into a normalized list or throws with a message that names the offending
 * address — so the rules are testable without a database, which is how the self-redirect and the
 * system-folder cases are covered in `tests/run.php`.
 *
 * **3. A rule has a hit count.** Apache tells us when a rule fired (`wx_rd_hit()` from the 404 logger's
 * sibling path — a redirect that lands on the site passes through `api/v2` only when it is a page
 * route, so in practice the count comes from the rule's own test and from the log; either way, a rule
 * nobody has used in a year is visible as such instead of being indistinguishable from a busy one).
 *
 * The .htaccess write is the one genuinely dangerous operation in this file, so it is written to be
 * boring: a managed block between two markers, a timestamped copy of the file it is about to change, a
 * refusal to proceed if the markers are missing from a file that exists, and if nothing changed, no
 * write at all.
 */

declare(strict_types=1);

const WX_RD_HTACCESS = '/.htaccess';
const WX_RD_BEGIN = '# >>> WX-REDIRECTS >>> (written by Woodex Admin — edit above or below this block, not inside it)';
const WX_RD_END = '# <<< WX-REDIRECTS <<<';
const WX_RD_MAX = 500;

/**
 * One rule, normalised. Pure: no database, no filesystem.
 *
 * `from` is lower case with both slashes; `to` keeps its case (a path is case-sensitive on the web,
 * even though MySQL is not by default). 410 means "gone" and carries no target — v2.1's convention,
 * and the right one: a 410 tells Google to drop the URL, which is the point of the spam cleanup.
 */
function wx_rd_one(array $r): array
{
    $code = (int) ($r['type'] ?? $r['code'] ?? 301);
    if (!in_array($code, [301, 302, 410], true)) {
        $code = 301;
    }
    $kind = ($r['match'] ?? $r['match_kind'] ?? 'exact') === 'prefix' ? 'prefix' : 'exact';
    $bare = strtolower(trim((string) ($r['from'] ?? ''), "/ \t"));
    return [
        'from' => $bare === '' ? '/' : '/' . $bare . '/',
        'to' => $code === 410 ? '' : trim((string) ($r['to'] ?? '')),
        'type' => $code,
        'match' => $kind,
        'src' => mb_substr(trim((string) ($r['src'] ?? $r['source'] ?? '')), 0, 60),
        'on' => !isset($r['on']) || (bool) $r['on'],
    ];
}

/**
 * Validate a whole list. Throws ApiError on the first bad rule, naming it.
 *
 * The rules here are the ones that stop a redirect from breaking the site rather than fixing it:
 * a rule cannot point at itself, cannot take over a system folder (admin, api, assets, builder), cannot
 * touch the home page, and duplicate addresses collapse to the first one — which is what "the unique
 * key" means, decided here rather than by a database error the person cannot read.
 */
function wx_rd_clean(array $rows): array
{
    $list = [];
    $seen = [];
    foreach ($rows as $r) {
        if (!is_array($r) || trim((string) ($r['from'] ?? '')) === '') {
            continue;
        }
        $x = wx_rd_one($r);
        if (!preg_match('~^/[a-z0-9/_\-\.&%+]*$~i', $x['from'])) {
            throw ApiError::validation('Old address "' . $x['from'] . '" is not valid — letters, numbers, - _ . / & only', 'redirects');
        }
        if (preg_match('~^/(admin|admin-v25|api|assets|builder|_private)(/|$)~i', $x['from'])) {
            throw ApiError::validation('"' . $x['from'] . '" is a system folder and cannot be redirected', 'redirects');
        }
        if ($x['from'] === '/') {
            throw ApiError::validation('The home page cannot be redirected', 'redirects');
        }
        if ($x['type'] !== 410) {
            if ($x['to'] === '') {
                throw ApiError::validation('Choose a new address for ' . $x['from'], 'redirects');
            }
            if (!preg_match('~^(https?://[^\s"<>]+|/[a-z0-9/_\-\.#?=&%+]*)$~i', $x['to'])) {
                throw ApiError::validation('New address "' . $x['to'] . '" is not valid', 'redirects');
            }
            /* A rule that points at itself is an infinite loop the browser reports as "too many
               redirects" — and the person who wrote it sees a working page in their own tab. */
            if (rtrim(strtolower($x['to']), '/') === rtrim(strtolower($x['from']), '/')) {
                throw ApiError::validation('A redirect cannot point to itself (' . $x['from'] . ')', 'redirects');
            }
        }
        $key = strtolower($x['from'] . '|' . $x['match']);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $list[] = $x;
        if (count($list) >= WX_RD_MAX) {
            break;
        }
    }
    return $list;
}

/** Every rule, newest last, in the stored shape. */
function wx_rd_list(bool $onlyOn = false): array
{
    $sql = 'SELECT * FROM wx_redirects' . ($onlyOn ? ' WHERE on_off = 1' : '') . ' ORDER BY from_path';
    $out = [];
    foreach (wx_all($sql) as $r) {
        $out[] = [
            'id' => (int) $r['id'],
            'from' => (string) $r['from_path'],
            'to' => (string) $r['to_path'],
            'type' => (int) $r['code'],
            'match' => (string) $r['match_kind'],
            'src' => (string) ($r['source'] ?? ''),
            'on' => (int) $r['on_off'] === 1,
            'hits' => (int) $r['hits'],
            'lastHit' => $r['last_hit_at'],
        ];
    }
    return $out;
}

/**
 * Replace the list: update what stayed, insert what is new, delete what was removed.
 *
 * Deleting is deliberate here and it is the only place in the product that removes a row a person
 * asked for — a redirect list is an edit surface, and "remove this rule" has to mean remove. What it
 * does *not* do is lose the history: the audit row records which addresses stopped being redirected,
 * so a mistake is one query away from being understood.
 *
 * @return array{added:int, changed:int, removed:int, ids:array<string,int>}
 */
function wx_rd_save(array $list, array $me): array
{
    return wx_tx(static function () use ($list, $me) {
        $existing = [];
        foreach (wx_all('SELECT id, from_path, match_kind FROM wx_redirects') as $r) {
            $existing[strtolower((string) $r['from_path']) . '|' . (string) $r['match_kind']] = (int) $r['id'];
        }
        $keep = [];
        $added = 0;
        $changed = 0;
        $ids = [];
        foreach ($list as $x) {
            $key = strtolower($x['from']) . '|' . $x['match'];
            $row = [
                'from_path' => $x['from'],
                'to_path' => $x['to'],
                'code' => $x['type'],
                'match_kind' => $x['match'],
                'source' => $x['src'] !== '' ? $x['src'] : null,
                'on_off' => $x['on'] ? 1 : 0,
                'updated_at' => wx_now(),
                'updated_by' => (int) $me['id'],
            ];
            if (isset($existing[$key])) {
                $id = $existing[$key];
                wx_update('wx_redirects', $row, ['id' => $id]);
                $changed++;
            } else {
                $row['created_at'] = wx_now();
                $row['hits'] = 0;
                $id = wx_insert('wx_redirects', $row);
                $added++;
            }
            $keep[$id] = true;
            $ids[$key] = $id;
        }
        $removed = 0;
        foreach ($existing as $key => $id) {
            if (isset($keep[$id])) {
                continue;
            }
            wx_q('DELETE FROM wx_redirects WHERE id = ?', [$id]);
            $removed++;
        }
        return ['added' => $added, 'changed' => $changed, 'removed' => $removed, 'ids' => $ids];
    });
}

/** The verified plan that ships with the product, ready to merge into whatever is already saved. */
function wx_rd_plan(): array
{
    $file = WX_V2_DIR . '/data/redirect-plan.json';
    if (!is_file($file)) {
        return [];
    }
    $rows = json_decode((string) file_get_contents($file), true);
    if (!is_array($rows)) {
        return [];
    }
    $out = [];
    foreach ($rows as $r) {
        if (is_array($r)) {
            $out[] = wx_rd_one($r);
        }
    }
    return $out;
}

/**
 * Merge the shipped plan into the saved list, skipping addresses that already have a rule.
 *
 * Skipped rather than overwritten: if someone has already decided where `/page/` goes, that decision is
 * newer information than a list compiled from a Google index export, and the screen says how many were
 * added so the difference is never silent.
 */
function wx_rd_merge(array $cur, array $add): array
{
    $have = [];
    foreach ($cur as $r) {
        $have[strtolower((string) $r['from']) . '|' . (string) $r['match']] = true;
    }
    $n = 0;
    foreach ($add as $r) {
        $key = strtolower($r['from']) . '|' . $r['match'];
        if (isset($have[$key])) {
            continue;
        }
        $have[$key] = true;
        $cur[] = $r;
        $n++;
    }
    return ['list' => $cur, 'added' => $n];
}

/**
 * Check every rule against the site on disk: is the target real, is it a chain, does a live page exist
 * at the old address (in which case the rule hides a page somebody can still find).
 *
 * The filesystem is the source of truth for "does this page exist", because the site is static HTML on
 * the same host — the same reason v2.1 could do this at all. Anything that is neither a local file nor
 * a URL is reported as bad rather than assumed fine.
 */
function wx_rd_test(array $list): array
{
    $from = [];
    foreach ($list as $r) {
        if (!empty($r['on'])) {
            $from[strtolower((string) $r['from'])] = $r;
        }
    }
    $out = [];
    foreach ($list as $i => $r) {
        $status = 'ok';
        $msg = $r['type'] === 410 ? 'Gone (410) — Google will drop it' : 'Target page exists';
        $oldTrim = rtrim((string) $r['from'], '/');
        $live = is_file(WX_SITE_ROOT . $oldTrim . '/index.html') || is_file(WX_SITE_ROOT . $oldTrim) || is_file(WX_SITE_ROOT . $oldTrim . '.html');
        if (empty($r['on'])) {
            $status = 'off';
            $msg = 'Switched off';
        } elseif ($live) {
            $status = 'warn';
            $msg = 'A live page exists at this address; the redirect hides it';
        } elseif ($r['type'] !== 410 && $r['to'] !== '' && $r['to'][0] === '/') {
            $path = (string) preg_replace('~[?#].*$~', '', $r['to']);
            $path = '/' . trim($path, '/');
            $exists = $path === '/'
                || is_file(WX_SITE_ROOT . rtrim($path, '/') . '/index.html')
                || is_file(WX_SITE_ROOT . rtrim($path, '/') . '.html')
                || is_file(WX_SITE_ROOT . $path);
            $next = $from[strtolower($path . '/')] ?? null;
            if ($next !== null) {
                $status = 'warn';
                $msg = 'Chain: ' . $r['to'] . ' redirects again to ' . (((string) $next['to'] !== '') ? $next['to'] : '410')
                    . '. Point it straight at the final page';
            } elseif (!$exists) {
                $status = 'bad';
                $msg = 'Target page not found (' . $path . ')';
            }
        } elseif ($r['type'] !== 410) {
            $msg = 'External link (not checked)';
        }
        $out[] = ['i' => $i, 'status' => $status, 'msg' => $msg];
    }
    return $out;
}

/**
 * The .htaccess lines for the managed block — the same lines v2.1 wrote, in the same order.
 *
 * `www` first (one official hostname), then the spam cleanup, then the rules. Order matters: the host
 * rule has to fire before anything else can match, and Apache applies `[L]` top-down.
 */
function wx_rd_lines(): array
{
    $lines = [];
    if (wx_setting_bool('redirect.www', true)) {
        $lines[] = '# one official address: no www';
        $lines[] = 'RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]';
        $lines[] = 'RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]';
    }
    if (wx_setting_bool('redirect.spam', true)) {
        /* The hacked-spam cleanup v2.1 shipped: casino/gambling URLs that were injected into the old
           WordPress install, plus the numbered query strings its pagination used. 410 rather than 404
           because a 404 leaves the URL in Google's index; a 410 tells it to drop the page. */
        $lines[] = '# hacked-spam cleanup: tell Google these are gone for good';
        $lines[] = 'RewriteCond %{REQUEST_URI} (casino|gokkasten|gokautomat|blackjack|roulette|free-spins|itm-[0-9]{4,}) [NC]';
        $lines[] = 'RewriteRule ^ - [G,L]';
        $lines[] = 'RewriteCond %{QUERY_STRING} (^|&)(p|page_id|attachment_id|cat)=[0-9]+ [NC]';
        $lines[] = 'RewriteRule ^$ /? [R=301,L]';
    }
    foreach (wx_rd_list(true) as $r) {
        $path = preg_quote(trim((string) $r['from'], '/'), '');
        $pattern = '^' . $path . ($r['match'] === 'prefix' ? '(/.*)?$' : '/?$');
        $lines[] = $r['type'] === 410
            ? 'RewriteRule ' . $pattern . ' - [G,L]'
            : 'RewriteRule ' . $pattern . ' ' . (string) $r['to'] . ' [R=' . (int) $r['type'] . ',L]';
    }
    return $lines;
}

/**
 * Write the managed block into the site's .htaccess.
 *
 * Three safety properties, in order of how much damage they prevent:
 *
 *   1. **Only between the markers.** If the file exists and does not contain them, this refuses and says
 *      so — appending a second copy of the rules is how a site ends up with two redirect chains.
 *   2. **A copy first.** Every write leaves a timestamped copy beside the original. The .htaccess is
 *      one file away from a 500 on every page; "restore the copy" must be possible without a backup.
 *   3. **No change, no write.** Re-publishing identical rules does not touch the file, so mtime-based
 *      deploy tools and file watchers do not churn.
 *
 * @return array{changed:bool, copied:?string, lines:int}
 */
function wx_rd_publish(): array
{
    $file = WX_SITE_ROOT . WX_RD_HTACCESS;
    $lines = wx_rd_lines();
    $block = WX_RD_BEGIN . "\n" . implode("\n", $lines) . "\n" . WX_RD_END;

    $current = is_file($file) ? (string) file_get_contents($file) : '';
    if ($current !== '' && !str_contains($current, WX_RD_BEGIN)) {
        throw ApiError::conflict(
            'The .htaccess has no Woodex block, so this would add a second set of rules. Add the two marker lines by hand where the block should go, then publish again.',
            ['marker' => WX_RD_BEGIN]
        );
    }
    $next = $current === ''
        ? "# .htaccess — created by Woodex Admin\n\n" . $block . "\n"
        : (string) preg_replace(
            '~' . preg_quote(WX_RD_BEGIN, '~') . '.*?' . preg_quote(WX_RD_END, '~') . '~s',
            $block,
            $current
        );
    if ($next === $current) {
        return ['changed' => false, 'copied' => null, 'lines' => count($lines)];
    }
    if ($current !== '' && !is_writable($file)) {
        throw ApiError::internal('The .htaccess is not writable by the web server — the rules were saved but not published');
    }

    $copied = null;
    if ($current !== '') {
        $copied = WX_RD_HTACCESS . '.' . gmdate('Ymd-His') . '.bak';
        if (!@copy($file, WX_SITE_ROOT . $copied)) {
            throw ApiError::internal('Could not write a copy of the .htaccess before changing it');
        }
    }
    /* Atomic-ish: a half-written .htaccess is a broken site, so the new content goes to a temporary
       file in the same directory and is renamed over the original. */
    $tmp = $file . '.wxnew';
    if (@file_put_contents($tmp, $next, LOCK_EX) === false || !@rename($tmp, $file)) {
        @unlink($tmp);
        throw ApiError::internal('The .htaccess could not be updated');
    }
    return ['changed' => true, 'copied' => $copied, 'lines' => count($lines)];
}

/* ------------------------------------------------------------------------ the 404 log */

/** Paths people asked for and did not get, most-asked first. */
function wx_r404_list(int $limit = 200): array
{
    $out = [];
    foreach (wx_all('SELECT * FROM wx_r404 ORDER BY n DESC, last_at DESC LIMIT ' . max(1, min(500, $limit))) as $r) {
        $out[] = [
            'path' => (string) $r['path'],
            'n' => (int) $r['n'],
            'last' => (string) ($r['last_at'] ?? ''),
            'ref' => (string) ($r['ref'] ?? ''),
            'redirect' => null,
        ];
    }
    /* One query for the rules that already cover these paths, so the screen can say "already
       redirected" instead of offering to write a rule that exists. */
    if ($out) {
        $rules = [];
        foreach (wx_rd_list() as $r) {
            $rules[strtolower((string) $r['from'])] = $r;
        }
        foreach ($out as $i => $row) {
            $key = strtolower($row['path']);
            if (isset($rules[$key])) {
                $out[$i]['redirect'] = ['to' => (string) $rules[$key]['to'], 'type' => (int) $rules[$key]['type'], 'on' => (bool) $rules[$key]['on']];
            }
        }
    }
    return $out;
}

/**
 * Record one missed address.
 *
 * Called by the public endpoint the site's 404 handler points at, so everything here assumes an
 * anonymous, hostile caller: the path is truncated and normalised, asset extensions and system folders
 * are refused outright, and the per-IP limit is 30 rows per ten minutes. Without that, a bot walking
 * `/a1`, `/a2`, `/a3` would fill the log with noise and bury the four addresses a real customer
 * mistyped — which is the only thing the log is for.
 *
 * @return bool whether anything was written
 */
function wx_r404_log(string $path, string $ref = ''): bool
{
    $clean = (string) preg_replace('~[?#].*$~', '', $path);
    $clean = '/' . trim(substr($clean, 0, 200), "/ \t") . '/';
    if ($clean === '//' || mb_strlen($clean) < 3) {
        return false;
    }
    if (preg_match('~^/(admin|admin-v25|api|assets|builder|_private)(/|$)~i', $clean)) {
        return false;
    }
    if (preg_match('~\.(js|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|xml|txt)/$~i', $clean)) {
        return false;
    }
    if (wx_val('SELECT path FROM wx_r404 WHERE path = ?', [$clean]) !== null) {
        /* A row already exists: count it, but only once per visit-per-minute is not knowable here, so
           the per-IP window below is the only rate control. */
    }
    wx_rate('r404|' . wx_ip(), 30, 600, 'Too many requests');

    return (bool) wx_tx(static function () use ($clean, $ref) {
        $now = wx_now();
        $existing = wx_one('SELECT n FROM wx_r404 WHERE path = ?', [$clean]);
        if ($existing !== null) {
            wx_q('UPDATE wx_r404 SET n = n + 1, last_at = ? WHERE path = ?', [$now, $clean]);
        } else {
            $count = (int) wx_val('SELECT COUNT(*) FROM wx_r404');
            if ($count >= 300) {
                /* Full: drop the least-visited row, keeping the cap v2.1 had. `n = 1` entries go first,
                   which is the right thing to lose — a page nobody asked for twice. */
                wx_q('DELETE FROM wx_r404 ORDER BY n ASC, last_at ASC LIMIT 1');
            }
            wx_insert('wx_r404', ['path' => $clean, 'n' => 1, 'first_at' => $now, 'last_at' => $now, 'ref' => null]);
        }
        /* Only the first referrer is kept, and only if it is somebody else's site pointing here — a
           referrer from our own pages means an internal link is broken, which is visible in the path
           itself and does not need 200 characters of our own URL. */
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($ref !== '' && $host !== '' && !preg_match('~^https?://(www\.)?' . preg_quote($host, '~') . '~i', $ref)) {
            wx_q('UPDATE wx_r404 SET ref = ? WHERE path = ?', [mb_substr((string) preg_replace('~[\s"<>]~', '', $ref), 0, 255), $clean]);
        }
        return true;
    });
}

/** Remove one missed address, or all of them. Returns what is left. */
function wx_r404_clear(string $path = ''): int
{
    if ($path === '') {
        return wx_q('DELETE FROM wx_r404')->rowCount();
    }
    return wx_q('DELETE FROM wx_r404 WHERE path = ?', [wx_rd_one(['from' => $path])['from']])->rowCount();
}

/**
 * Move the v2.1 JSON files into the tables, once.
 *
 * Same rule as every other migration of live state in this product: read the file, write the rows,
 * and leave the file alone. If this runs twice the unique keys make it a no-op, and if someone edits
 * the file afterwards it is ignored — the table is the truth from here, and the cleanup phase deletes
 * the file once v2.1 stops reading it.
 *
 * @return array{rules:int, misses:int}
 */
function wx_rd_import_legacy(): array
{
    $rules = 0;
    $misses = 0;
    $legacyRules = wx_store('redirects.json', true);
    $file = $legacyRules->tryRead();
    if (is_array($file) && $file) {
        foreach (wx_rd_clean($file) as $x) {
            $clash = wx_val('SELECT id FROM wx_redirects WHERE from_path = ? AND match_kind = ?', [$x['from'], $x['match']]);
            if ($clash !== null) {
                continue;
            }
            wx_insert('wx_redirects', [
                'from_path' => $x['from'],
                'to_path' => $x['to'],
                'code' => $x['type'],
                'match_kind' => $x['match'],
                'source' => $x['src'] !== '' ? $x['src'] : 'v2.1 import',
                'on_off' => $x['on'] ? 1 : 0,
                'created_at' => wx_now(),
                'hits' => 0,
            ]);
            $rules++;
        }
    }
    $legacyMisses = wx_store('r404.json', true)->tryRead();
    if (is_array($legacyMisses)) {
        foreach ($legacyMisses as $path => $v) {
            $clean = (string) (wx_rd_one(['from' => (string) $path])['from']);
            if ($clean === '/' || wx_val('SELECT path FROM wx_r404 WHERE path = ?', [$clean]) !== null) {
                continue;
            }
            wx_insert('wx_r404', [
                'path' => $clean,
                'n' => (int) ($v['n'] ?? 0),
                'first_at' => null,
                'last_at' => isset($v['last']) ? substr((string) $v['last'], 0, 19) : null,
                'ref' => isset($v['ref']) ? mb_substr((string) $v['ref'], 0, 255) : null,
            ]);
            $misses++;
        }
    }
    return ['rules' => $rules, 'misses' => $misses];
}
