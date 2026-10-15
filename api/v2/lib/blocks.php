<?php
/**
 * api/v2/lib/blocks.php — the section library, and the global sections that live inside pages.
 *
 * A block is a piece of a page: a hero, a services grid, a testimonial band, a contact strip. The library
 * exists so that the fifth page assembly reuses the first page's hero instead of inventing a sixth one, and
 * so that "the phone number in that band is wrong" is one edit rather than 150.
 *
 * **Two kinds of block, and the difference is where they live.**
 *
 *   · A **library block** is a piece of HTML you copy into a page. The library is a catalogue; the page
 *     holds its own copy from the moment it is inserted.
 *   · A **global section** is inserted *by reference*: the block's root element carries
 *     `data-wx-global="<token>"` in the page, and the token is what ties the copy to the library. Editing
 *     the block and pressing Push rewrites every page that carries the token — and because those pages are
 *     written through the versioned page writer, the push is one batch with one undo.
 *
 * That reference is why `blk` is a 12-hex token rather than a row id: it is written into HTML files, and it
 * has to survive a database that is restored from a backup, re-seeded, or rebuilt.
 *
 * **What is refused.** Scripts and event handlers, in every block — a block is pasted into pages by people
 * who are not thinking about script injection, so the rule is absolute here rather than role-dependent.
 * And a block that will be *global* must be a single element: replacing "everything between the markers"
 * only means something if there is one element to replace. v2.1 refused the same thing for the same reason,
 * with the same sentence ("convert it first" was its answer, meaning: wrap it in one element).
 */

declare(strict_types=1);

/** The categories the library files blocks under. v2.1's list, verbatim — a screen's filter is a promise. */
const WX_BLOCK_CATS = ['Hero', 'Services', 'Features', 'Projects', 'Testimonials', 'CTA', 'FAQ', 'Contact', 'Content', 'Process', 'Stats', 'Pricing', 'Team', 'Gallery', 'Footer', 'Custom'];

const WX_BLOCK_MAX = 200;
const WX_BLOCK_HTML_MAX = 200 * 1024;

/**
 * Validate and normalise a block coming from a request.
 *
 * `$old` is the stored block when this is an edit: three fields fall back to it (name, html, category) so a
 * request that only changes the tags cannot blank the block, and the token and creation time are carried
 * over — the token is in the pages, so a new one would orphan every copy.
 */
function wx_block_clean(array $in, ?array $old = null): array
{
    $name = mb_substr(trim((string) ($in['name'] ?? ($old['name'] ?? ''))), 0, 60);
    $html = (string) ($in['html'] ?? ($old['html'] ?? ''));
    if ($name === '' || $html === '') {
        throw ApiError::validation('A block needs a name and its HTML', 'name');
    }
    if (strlen($html) > WX_BLOCK_HTML_MAX) {
        throw ApiError::validation('That block is larger than 200 KB — split it, or save it as a page', 'html');
    }
    wx_chrome_no_scripts($html, 'block');
    if (str_contains($html, 'data-wx-ed') || preg_match('~\scontenteditable[\s=>]~i', $html)) {
        /* The builder marks elements while someone is editing. A marker saved into the library would be
           pasted into every page that uses the block, and the next person would edit somebody's session. */
        throw ApiError::validation('That HTML still carries editor markers — save it from the page, not from the canvas', 'html');
    }

    $cat = in_array($in['cat'] ?? '', WX_BLOCK_CATS, true) ? (string) $in['cat'] : (string) ($old['cat'] ?? 'Custom');
    $tagsIn = $in['tags'] ?? ($old['tags'] ?? []);
    if (!is_array($tagsIn)) {
        $tagsIn = explode(',', (string) $tagsIn);
    }
    $tags = [];
    foreach (array_slice(array_values($tagsIn), 0, 12) as $t) {
        $t = mb_substr(strtolower(trim((string) $t)), 0, 24);
        if ($t !== '' && !in_array($t, $tags, true)) {
            $tags[] = $t;
        }
    }

    $global = array_key_exists('global', $in) ? !empty($in['global']) : !empty($old['is_global']);
    if ($global && (!preg_match('~\s*<[a-z]~i', $html) || preg_match('~\s*<!--~', $html))) {
        throw ApiError::validation(
            'A global section has to be a single element — the site replaces that element wherever it appears, and there is nothing to replace if the block is loose text or several elements.',
            'html'
        );
    }

    return [
        'blk' => (string) ($old['blk'] ?? bin2hex(random_bytes(6))),
        'name' => $name,
        'kind' => ($in['kind'] ?? ($old['kind'] ?? '')) === 'element' ? 'element' : 'section',
        'cat' => $cat,
        'tags' => implode(',', $tags),
        'is_global' => $global ? 1 : 0,
        'html' => $html,
    ];
}

/** One block as the screens read it. */
function wx_block_public(array $row): array
{
    return [
        'blk' => (string) $row['blk'],
        'name' => (string) $row['name'],
        'kind' => (string) $row['kind'],
        'cat' => (string) $row['cat'],
        'tags' => $row['tags'] === '' ? [] : explode(',', (string) $row['tags']),
        'global' => (int) $row['is_global'] === 1,
        'bytes' => strlen((string) $row['html']),
        'html' => (string) $row['html'],
        'createdAt' => (string) $row['created_at'],
        'updatedAt' => (string) $row['updated_at'],
        'updatedBy' => (string) ($row['updated_by'] ?? ''),
    ];
}

/**
 * The library, optionally one category's.
 *
 * The HTML is included, because a library screen that cannot show a preview is a list of names — but the
 * *usage* is not: that is a walk over the site, so it is asked for separately (`GET /blocks/usage`) and comes
 * back only for the blocks that are actually global. See `wx_block_usage()`.
 */
function wx_blocks_list(?string $cat = null, ?bool $globalOnly = null): array
{
    $sql = 'SELECT * FROM wx_blocks';
    $where = [];
    $params = [];
    if ($cat !== null && $cat !== '' && in_array($cat, WX_BLOCK_CATS, true)) {
        $where[] = 'cat = ?';
        $params[] = $cat;
    }
    if ($globalOnly === true) {
        $where[] = 'is_global = 1';
    }
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY cat, name LIMIT ' . (WX_BLOCK_MAX + 20);
    $out = [];
    foreach (wx_all($sql, $params) as $r) {
        $out[] = wx_block_public($r);
    }
    $counts = [];
    foreach (wx_all('SELECT cat, COUNT(*) n FROM wx_blocks GROUP BY cat') as $r) {
        $counts[(string) $r['cat']] = (int) $r['n'];
    }
    return [
        'blocks' => $out,
        'cats' => WX_BLOCK_CATS,
        'counts' => $counts,
        'globals' => (int) wx_val('SELECT COUNT(*) FROM wx_blocks WHERE is_global = 1'),
        'total' => (int) wx_val('SELECT COUNT(*) FROM wx_blocks'),
        'limit' => WX_BLOCK_MAX,
    ];
}

/** Save a block: a new one, or an edit that keeps its token. */
function wx_block_save(array $in, array $me): array
{
    $blk = (string) ($in['blk'] ?? '');
    $old = $blk !== '' ? wx_one('SELECT * FROM wx_blocks WHERE blk = ?', [$blk]) : null;
    if ($blk !== '' && $old === null) {
        throw ApiError::notFound('That block is not in the library');
    }
    if ($old === null && (int) wx_val('SELECT COUNT(*) FROM wx_blocks') >= WX_BLOCK_MAX) {
        throw ApiError::validation('The library holds ' . WX_BLOCK_MAX . ' blocks already — delete one first');
    }
    $clean = wx_block_clean($in, $old);
    $now = wx_now();
    if ($old === null) {
        wx_insert('wx_blocks', $clean + ['created_at' => $now, 'updated_at' => $now, 'updated_by' => (string) $me['name']]);
    } else {
        wx_update('wx_blocks', $clean + ['updated_at' => $now, 'updated_by' => (string) $me['name']], ['blk' => $clean['blk']]);
    }
    $row = (array) wx_one('SELECT * FROM wx_blocks WHERE blk = ?', [$clean['blk']]);
    $block = wx_block_public($row);
    /* If the block is global and its HTML changed, say what it would take to push it — the screen shows
       that as a button, and the number comes from the same walk the push will do. */
    $used = $block['global'] ? wx_block_usage($block['blk']) : [];
    wx_audit($me, $old === null ? 'blocks.create' : 'blocks.save', $block['name'], [
        'blk' => $block['blk'],
        'global' => $block['global'],
        'used' => count($used),
    ]);
    return ['block' => $block, 'usedOn' => $used, 'canPush' => count($used) > 0];
}

/**
 * Delete a block. A global section that is in use is refused unless the caller says `force`, and then the
 * copies are *detached* rather than deleted: the page keeps the markup it is showing, and stops being tied
 * to a block that will no longer exist. v2.1 did the same, and the reason is the same — deleting the library
 * entry must not take a section out of a live page behind somebody's back.
 */
function wx_block_delete(string $blk, bool $force, array $me): array
{
    $row = wx_one('SELECT * FROM wx_blocks WHERE blk = ?', [$blk]);
    if ($row === null) {
        throw ApiError::notFound('That block is not in the library');
    }
    $used = wx_block_usage($blk);
    if ($used && !$force) {
        throw ApiError::conflict(
            'This is a global section and it is used on ' . count($used) . ' page' . (count($used) === 1 ? '' : 's') . '. Deleting it will leave that markup in place but stop keeping it in step.',
            ['usedOn' => $used]
        );
    }
    $detached = [];
    if ($used) {
        $detached = wx_block_detach($blk, $me);
    }
    wx_q('DELETE FROM wx_blocks WHERE blk = ?', [$blk]);
    wx_audit($me, 'blocks.delete', (string) $row['name'], ['blk' => $blk, 'detached' => count($detached)]);
    return ['detached' => $detached];
}

/** Import a list of blocks (the shape v2.1's `blocks_import` took: the builder's own export). */
function wx_blocks_import(array $blocks, array $me): array
{
    $add = array_slice(array_values($blocks), 0, WX_BLOCK_MAX);
    $room = WX_BLOCK_MAX - (int) wx_val('SELECT COUNT(*) FROM wx_blocks');
    if (count($add) > $room) {
        throw ApiError::validation('The library holds ' . WX_BLOCK_MAX . ' blocks; there is room for ' . max(0, $room) . ' more');
    }
    $added = 0;
    $skipped = 0;
    foreach ($add as $b) {
        if (!is_array($b)) {
            $skipped++;
            continue;
        }
        unset($b['blk'], $b['id']); // an import never carries a token: two sites' tokens would collide
        try {
            $clean = wx_block_clean($b, null);
        } catch (Throwable $e) {
            $skipped++;
            continue;
        }
        wx_insert('wx_blocks', $clean + ['created_at' => wx_now(), 'updated_at' => wx_now(), 'updated_by' => (string) $me['name']]);
        $added++;
    }
    wx_audit($me, 'blocks.import', $added . ' block(s)', ['skipped' => $skipped]);
    return ['added' => $added, 'skipped' => $skipped];
}

/* ===================================================== the global sections, inside pages
   Everything below is a pure function of page HTML. No database, no filesystem — which is deliberate:
   this is the part that can break a live page in a way nobody notices until a customer does, so it is
   the part that is unit-tested.
*/

/**
 * The outer [start, end) of every element carrying `data-wx-global="<token>"`.
 *
 * The element is found by its opening tag and then **balanced by tag name**, because the closing tag is not
 * necessarily the next one of that name: a global `<section>` may contain two more `<section>`s, and a
 * `<div>` certainly does. v2.1 walked the tags counting depth, and this is the same walk written out.
 *
 * A token is matched as a whole attribute value (`data-wx-global="abc"`), so a token that is a prefix of
 * another (`abc` versus `abcd`) cannot match the wrong element.
 */
function wx_block_ranges(string $html, string $blk): array
{
    $blk = (string) preg_replace('~[^a-f0-9]~', '', strtolower($blk));
    if ($blk === '') {
        return [];
    }
    $attr = '~<([a-z][a-z0-9-]*)\b[^>]*\bdata-wx-global="' . $blk . '"[^>]*>~i';
    $out = [];
    $pos = 0;
    while (preg_match($attr, $html, $m, PREG_OFFSET_CAPTURE, $pos)) {
        $start = $m[0][1];
        $tag = strtolower($m[1][0]);
        $i = $start + strlen($m[0][0]);
        $depth = 1;
        $closed = false;
        while ($depth > 0 && preg_match('~<(/?)' . preg_quote($tag, '~') . '\b[^>]*>~i', $html, $t, PREG_OFFSET_CAPTURE, $i)) {
            $depth += $t[1][0] === '/' ? -1 : (str_ends_with((string) $t[0][0], '/>') ? 0 : 1);
            $i = $t[0][1] + strlen((string) $t[0][0]);
            if ($depth === 0) {
                $closed = true;
            }
        }
        if (!$closed) {
            /* An element that never closes: the file is not something to rewrite blindly. The caller gets
               nothing for this page, and the push reports it as a page it could not safely change. */
            break;
        }
        $out[] = [$start, $i];
        $pos = $i;
    }
    return $out;
}

/** Replace every instance of one global token with the block's markup. */
function wx_block_replace(string $html, string $blk, string $blockHtml): string
{
    foreach (array_reverse(wx_block_ranges($html, $blk)) as [$a, $b]) {
        $html = substr($html, 0, $a) . $blockHtml . substr($html, $b);
    }
    return $html;
}

/**
 * Put the token on the block's own root element.
 *
 * The attribute is what makes a block global, and it goes on the *result*, not on the library copy: the same
 * block may be used as an ordinary section on one page and as a global section on another, and the library
 * HTML stays clean because of it.
 */
function wx_block_stamp(string $html, string $blk): string
{
    if (!preg_match('~\s*<[a-z][a-z0-9-]*~i', $html)) {
        throw ApiError::validation('A global section has to be a single element');
    }
    $blk = (string) preg_replace('~[^a-f0-9]~', '', strtolower($blk));
    $stamped = (string) preg_replace('~^\s*<([a-z][a-z0-9-]*)~i', '<$1 data-wx-global="' . $blk . '"', trim($html), 1);
    if (str_contains($stamped, 'data-wx-global="' . $blk . '"')) {
        return $stamped;
    }
    throw ApiError::validation('The token could not be placed on that block');
}

/** Which pages carry this token — the answer to "where is this section used?". */
function wx_block_usage(string $blk): array
{
    $out = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        if (wx_block_ranges($html, $blk)) {
            $out[] = $rel;
        }
    }
    return $out;
}

/** Usage for every global block, in one walk of the site. */
function wx_blocks_usage_all(): array
{
    $blocks = [];
    foreach (wx_all('SELECT blk, name FROM wx_blocks WHERE is_global = 1 ORDER BY name') as $r) {
        $blocks[(string) $r['blk']] = ['name' => (string) $r['name'], 'pages' => []];
    }
    if (!$blocks) {
        return [];
    }
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        foreach (array_keys($blocks) as $blk) {
            if (wx_block_ranges($html, $blk)) {
                $blocks[$blk]['pages'][] = $rel;
            }
        }
    }
    return $blocks;
}

/**
 * Push a global section to every page that carries it, as one change.
 *
 * This is the same shape as the header/footer push: the pages are written through `wx_page_write_many()`, so
 * the whole push is one batch and one undo. Pages whose markup is already current are skipped and counted —
 * "nothing happened" and "the block did not match anything" look identical otherwise.
 *
 * A page whose element never closes is *not* written, and is reported: guessing how to close it would be the
 * one way this feature could destroy a page.
 */
function wx_block_sync(string $blk, array $me): array
{
    $row = wx_one('SELECT * FROM wx_blocks WHERE blk = ?', [$blk]);
    if ($row === null) {
        throw ApiError::notFound('That block is not in the library');
    }
    if ((int) $row['is_global'] !== 1) {
        throw ApiError::validation('Only a global section can be pushed to pages — this one is a library block, and pages hold their own copies', 'blk');
    }
    $block = wx_block_public($row);
    $stamped = wx_block_stamp($block['html'], $block['blk']);
    $used = wx_block_usage($block['blk']);

    $result = wx_page_write_many(
        $used,
        static function (string $rel, string $html) use ($stamped, $block): ?string {
            $next = wx_block_replace($html, $block['blk'], $stamped);
            return $next === $html ? null : $next;
        },
        $me,
        'global section: ' . $block['name']
    );

    wx_audit($me, 'blocks.sync', $block['name'], [
        'blk' => $block['blk'],
        'used' => count($used),
        'changed' => count($result['changed']),
        'batch' => $result['batch'],
    ]);
    return [
        'blk' => $block['blk'],
        'usedOn' => $used,
        'batch' => $result['batch'],
        'changed' => $result['changed'],
        'skipped' => $result['skipped'],
        'pages' => count($result['changed']),
    ];
}

/** Stop every page referring to a block, keeping the markup that is there. */
function wx_block_detach(string $blk, array $me): array
{
    $used = wx_block_usage($blk);
    if (!$used) {
        return [];
    }
    $attr = '~ data-wx-global="' . (string) preg_replace('~[^a-f0-9]~', '', strtolower($blk)) . '"~';
    $result = wx_page_write_many(
        $used,
        static function (string $rel, string $html) use ($attr): ?string {
            $next = (string) preg_replace($attr, '', $html);
            return $next === $html ? null : $next;
        },
        $me,
        'detached a global section'
    );
    return $result['changed'];
}

/**
 * Read the v2.1 `_private/blocks.json` across once.
 *
 * Tokens are carried over deliberately — they are in the pages, and a new token would leave every global
 * section on the site detached from its block, silently. The file keeps working for v2.1 until the cleanup
 * phase; from the import onwards the table is the truth.
 */
function wx_blocks_import_legacy(): array
{
    $path = WX_SITE_ROOT . '/' . (string) wx_setting('blocks.legacy_path', '_private/blocks.json');
    if (!is_file($path)) {
        return ['blocks' => 0];
    }
    $raw = json_decode((string) file_get_contents($path), true);
    if (!is_array($raw)) {
        return ['blocks' => 0];
    }
    $n = 0;
    foreach (array_slice(array_values($raw), 0, WX_BLOCK_MAX) as $b) {
        if (!is_array($b) || !isset($b['id'], $b['name'], $b['html'])) {
            continue;
        }
        $blk = (string) preg_replace('~[^a-f0-9]~', '', strtolower((string) $b['id']));
        if ($blk === '' || wx_val('SELECT id FROM wx_blocks WHERE blk = ?', [$blk]) !== null) {
            continue;
        }
        try {
            $clean = wx_block_clean([
                'name' => $b['name'],
                'html' => $b['html'],
                'cat' => $b['cat'] ?? 'Custom',
                'tags' => $b['tags'] ?? [],
                'global' => !empty($b['global']),
                'kind' => $b['kind'] ?? 'section',
            ], ['blk' => $blk, 'cat' => 'Custom', 'is_global' => !empty($b['global']) ? 1 : 0]);
        } catch (Throwable $e) {
            /* A file that fails a rule that did not exist when it was written (a script in a 2023 block,
               say) is skipped and counted rather than silently made law. */
            continue;
        }
        wx_insert('wx_blocks', $clean + [
            'created_at' => isset($b['t']) ? gmdate('Y-m-d H:i:s', (int) ($b['t'] / 1000)) : wx_now(),
            'updated_at' => isset($b['updated']) ? gmdate('Y-m-d H:i:s', (int) ($b['updated'] / 1000)) : wx_now(),
            'updated_by' => 'v2.1 import',
        ]);
        $n++;
    }
    wx_setting_set('blocks.imported_at', wx_now());
    return ['blocks' => $n];
}
