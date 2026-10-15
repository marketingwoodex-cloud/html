<?php
/**
 * api/v2/lib/placements.php — putting testimonials and the team *inside* pages.
 *
 * These two kinds of content never become pages of their own: a reviews strip appears on the home page, the
 * team appears on About. v2.1 let the studio choose the pages, a small label, a heading, one of five
 * testimonial designs and a maximum number of items. All of that is kept here, value for value, and so is
 * the **marker** that says a section is generated:
 *
 *     <!--wx:testimonials--> … <!--/wx:testimonials-->
 *
 * The marker is the whole mechanism. It is how a push replaces yesterday's review instead of adding a
 * second one, and it is how taking a page off the list removes the section from it. v2.1's admin still
 * writes that marker during the cut-over, so it is kept exactly as it was rather than redesigned.
 *
 * What changed is *where the markup is composed.* v2.1 built the section in the browser and posted every
 * page back one at a time — 150 requests, each carrying a whole page, and a failure halfway through left
 * the site in two states. Here the server composes the section and writes the changed pages as **one
 * batch**, which means one entry in the page history and one undo (the same undo the header change uses).
 *
 * The rendered HTML is never stored. It is built from the live items at the moment somebody presses Update
 * website, so editing a testimonial is enough — nobody has to remember to press it twice.
 *
 * The class names (`wx-tst-*`, `wx-team-*`, `wx-stars`) are the P20 design system's, and their rules were
 * moved into `assets/site.css` (the only stylesheet the live pages load) when this was ported. The designs
 * are therefore the ones the studio already reviewed, not a new interpretation of them.
 */

declare(strict_types=1);

/** The content kinds that appear inside pages, with v2.1's own marker and item type for each. */
const WX_PLACE_KINDS = [
    'testimonial' => ['marker' => 'testimonials', 'type' => 'testimonial', 'title' => 'Testimonials', 'one' => 'testimonial', 'label' => 'Client words'],
    'member' => ['marker' => 'team', 'type' => 'member', 'title' => 'Team', 'one' => 'team member', 'label' => 'The studio'],
];

/** v2.1's five testimonial designs, with the sentence the picker showed. */
const WX_PLACE_DESIGNS = [
    'cards' => ['Cards', '3 cards in a row (classic)'],
    'spotlight' => ['Spotlight', 'One big featured review + smaller ones'],
    'slider' => ['Slider', 'Swipe row of cards — good for many reviews'],
    'wall' => ['Wall', 'Masonry wall of short quotes'],
    'band' => ['Navy band', 'Dark band with big quote and average rating'],
];

/** Where a section goes when the page has no marker yet: v2.1's anchor, then the end of main. */
const WX_PLACE_ANCHORS = ['<section class="wx-trust"', '</main>'];

function wx_place_kind_ok(string $kind): bool
{
    return isset(WX_PLACE_KINDS[$kind]);
}

function wx_place_kind(string $kind): array
{
    if (!wx_place_kind_ok($kind)) {
        throw ApiError::validation('That is not something that appears inside a page: ' . $kind, 'kind');
    }
    return WX_PLACE_KINDS[$kind];
}

/** The marker a section is wrapped in, as v2.1 wrote it. */
function wx_place_marker(string $kind, bool $close = false): string
{
    $m = wx_place_kind($kind)['marker'];
    return '<!--' . ($close ? '/' : '') . 'wx:' . $m . '-->';
}

/* ============================================================ the section, as HTML */

/**
 * The stars, as v2.1 drew them: five glyphs, the remainder dimmed by a span rather than drawn twice.
 *
 * `★★★★☆` is not in the markup on purpose — the aria-label carries the meaning for anybody who cannot see
 * the glyphs, and the dimmed half is a presentation detail the stylesheet owns.
 */
function wx_place_stars(int $n): string
{
    $n = max(0, min(5, $n));
    return '<div class="wx-stars" aria-label="' . $n . ' out of 5">' . str_repeat('★', $n)
        . '<span>' . str_repeat('★', 5 - $n) . '</span></div>';
}

/** Initials for a review with no photograph: the first letter of up to two names. */
function wx_place_initials(string $name): string
{
    $out = '';
    foreach (preg_split('~\s+~', trim($name)) ?: [] as $word) {
        if ($word !== '') {
            $out .= mb_substr($word, 0, 1);
        }
        if (mb_strlen($out) >= 2) {
            break;
        }
    }
    return mb_strtoupper($out);
}

/** One review: the stars, what they said, and who said it. */
function wx_place_tst_card(array $item, bool $big = false): string
{
    $d = is_array($item['data'] ?? null) ? $item['data'] : [];
    $name = (string) $item['title'];
    $sub = trim(implode(' · ', array_filter([
        trim((string) ($d['role'] ?? '')),
        trim(implode(', ', array_filter([trim((string) ($d['project'] ?? '')), trim((string) ($d['city'] ?? ''))]))),
    ], static fn(string $s): bool => $s !== '')));
    $photo = trim((string) ($d['photo'] ?? ''));
    $who = $photo !== ''
        ? '<img src="' . wx_h($photo) . '" alt="" width="' . ($big ? 64 : 48) . '" height="' . ($big ? 64 : 48) . '" loading="lazy" decoding="async">'
        : '<span class="wx-av">' . wx_h(wx_place_initials($name)) . '</span>';

    return '    <figure class="wx-tst-card' . ($big ? ' is-big' : '') . '">' . wx_place_stars((int) ($d['rating'] ?? 5))
        . '<blockquote>' . wx_h((string) ($d['text'] ?? '')) . '</blockquote>'
        . '<figcaption>' . $who . '<span><b>' . wx_h($name) . '</b>'
        . ($sub !== '' ? '<small>' . wx_h($sub) . '</small>' : '')
        . "</span></figcaption>\n    </figure>\n";
}

/**
 * The reviews section, in one of the five designs.
 *
 * `$design` is the per-page override; a design the list does not know falls back to cards rather than
 * producing a section with no styles at all.
 */
function wx_place_tst_block(array $items, array $set, ?string $design = null): string
{
    $ds = (string) ($design ?: ($set['design'] ?? '') ?: 'cards');
    if (!isset(WX_PLACE_DESIGNS[$ds])) {
        $ds = 'cards';
    }
    $max = (int) ($set['max'] ?? 0);
    if ($max > 0) {
        $items = array_slice($items, 0, $max);
    }
    if (!$items) {
        return '';
    }

    $sum = 0;
    foreach ($items as $x) {
        $sum += (float) (($x['data']['rating'] ?? 5) ?: 5);
    }
    $avg = $sum / count($items);

    $withAvg = $ds === 'band' || $ds === 'spotlight';
    $head = '  <div class="wx-sec-h"><p class="wx-kicker">'
        . wx_h((string) ($set['kicker'] ?? '') !== '' ? (string) $set['kicker'] : 'Client words')
        . '</p><h2 id="wx-tst-title">'
        . wx_h((string) ($set['heading'] ?? '') !== '' ? (string) $set['heading'] : 'What our clients say')
        . '</h2>';
    if ($withAvg) {
        $head .= '<p class="wx-tst-avg"><b>' . number_format($avg, 1) . '</b> '
            . '<span class="wx-stars" aria-label="' . number_format($avg, 1) . ' out of 5">' . str_repeat('★', (int) round($avg))
            . '<span>' . str_repeat('★', 5 - (int) round($avg)) . '</span></span> '
            . '<span>from ' . count($items) . ' client review' . (count($items) > 1 ? 's' : '') . '</span></p>';
    }
    $head .= "</div>\n";

    $body = '';
    if ($ds === 'spotlight') {
        $body = "  <div class=\"wx-tst-spot\">\n" . wx_place_tst_card($items[0], true);
        if (count($items) > 1) {
            $body .= "    <div class=\"wx-tst-side\">\n";
            foreach (array_slice($items, 1, 3) as $x) {
                $body .= wx_place_tst_card($x);
            }
            $body .= "    </div>\n";
        }
        $body .= "  </div>\n";
    } elseif ($ds === 'slider') {
        $body = "  <div class=\"wx-tst-track\" tabindex=\"0\" aria-label=\"Client reviews, scroll sideways\">\n";
        foreach ($items as $x) {
            $body .= wx_place_tst_card($x);
        }
        $body .= "  </div>\n";
    } elseif ($ds === 'wall') {
        $body = "  <div class=\"wx-tst-wall\">\n";
        foreach ($items as $x) {
            $body .= wx_place_tst_card($x);
        }
        $body .= "  </div>\n";
    } elseif ($ds === 'band') {
        $body = "  <div class=\"wx-tst-band\">\n" . wx_place_tst_card($items[0], true);
        if (count($items) > 1) {
            $body .= "    <div class=\"wx-tst-row\">\n";
            foreach (array_slice($items, 1, 3) as $x) {
                $body .= wx_place_tst_card($x);
            }
            $body .= "    </div>\n";
        }
        $body .= "  </div>\n";
    } else {
        $body = "  <div class=\"wx-tst-grid\">\n";
        foreach ($items as $x) {
            $body .= wx_place_tst_card($x);
        }
        $body .= "  </div>\n";
    }

    return wx_place_marker('testimonial') . "\n"
        . '<section class="wx-tst wx-tst--' . $ds . '" aria-labelledby="wx-tst-title"><div class="wrap">' . "\n"
        . $head . $body . "</div></section>\n"
        . wx_place_marker('testimonial', true);
}

/**
 * The team, as v2.1 drew it: featured people first (and larger), the rest in a grid.
 *
 * `showContact` is a decision the studio makes per person — the phone and the email are only printed when
 * it is ticked, and the LinkedIn link is printed whenever there is one, exactly as v2.1 did.
 */
function wx_place_team_block(array $items, array $set): string
{
    if (!$items) {
        return '';
    }
    $sorted = array_values($items);
    /* Featured first, order otherwise kept. PHP sorts stably, so two people with the same flag stay in the
       order the screen shows them in — which is the order the studio arranged. */
    usort($sorted, static fn(array $a, array $b): int => ((int) !empty($b['data']['featured'])) <=> ((int) !empty($a['data']['featured'])));

    $out = '  <div class="wx-team-grid">' . "\n";
    foreach ($sorted as $x) {
        $d = is_array($x['data'] ?? null) ? $x['data'] : [];
        $name = (string) $x['title'];
        $photo = trim((string) ($d['photo'] ?? ''));
        $role = trim(implode(' · ', array_filter([trim((string) ($d['role'] ?? '')), trim((string) ($d['dept'] ?? ''))])));

        $out .= '    <article class="wx-team-card' . (!empty($d['featured']) ? ' is-featured' : '') . '">'
            . ($photo !== ''
                ? '<img src="' . wx_h($photo) . '" alt="' . wx_h($name) . '" width="600" height="720" loading="lazy" decoding="async">'
                : '<div class="wx-team-ph"></div>')
            . '<h3>' . wx_h($name) . '</h3>'
            . '<p class="wx-team-role">' . wx_h($role) . '</p>'
            . (!empty($d['years']) ? '<p class="wx-team-yr">' . (int) $d['years'] . '+ years experience</p>' : '')
            . (trim((string) ($d['bio'] ?? '')) !== '' ? '<p>' . wx_h((string) $d['bio']) . '</p>' : '');

        $showContact = !empty($d['showContact']);
        $phone = trim((string) ($d['phone'] ?? ''));
        $email = trim((string) ($d['email'] ?? ''));
        $linkedin = trim((string) ($d['linkedin'] ?? ''));
        $links = '';
        if ($showContact && $phone !== '') {
            $links .= '<a href="tel:' . wx_h((string) preg_replace('~\s+~', '', $phone)) . '">' . wx_h($phone) . '</a>';
        }
        if ($showContact && $email !== '') {
            $links .= '<a href="mailto:' . wx_h($email) . '">' . wx_h($email) . '</a>';
        }
        if ($linkedin !== '') {
            $links .= '<a href="' . wx_h($linkedin) . '" target="_blank" rel="noopener">LinkedIn</a>';
        }
        if ($links !== '') {
            $out .= '<p class="wx-team-links">' . $links . '</p>';
        }
        $out .= "</article>\n";
    }
    $out .= "  </div>\n";

    return wx_place_marker('member') . "\n"
        . '<section class="wx-team" aria-labelledby="wx-team-title"><div class="wrap">' . "\n"
        . '  <div class="wx-sec-h"><p class="wx-kicker">'
        . wx_h((string) ($set['kicker'] ?? '') !== '' ? (string) $set['kicker'] : 'The studio')
        . '</p><h2 id="wx-team-title">'
        . wx_h((string) ($set['heading'] ?? '') !== '' ? (string) $set['heading'] : 'The people behind the work')
        . "</h2></div>\n"
        . $out . "</div></section>\n"
        . wx_place_marker('member', true);
}

/**
 * The block for a kind, or an empty string when there is nothing live to show.
 *
 * An empty string is not a failure: it is what removes a section from a page that no longer has any live
 * items, and what takes a page off the list when the studio unticks it.
 */
function wx_place_block(string $kind, array $items, array $set, ?string $design = null): string
{
    if (!$items) {
        return '';
    }
    return $kind === 'testimonial' ? wx_place_tst_block($items, $set, $design) : wx_place_team_block($items, $set);
}

/* ============================================================ putting it in a page */

/**
 * What would happen to this page — computed first, applied second.
 *
 * The preview and the push run the *same* function, which is the only way the sentence "this is what will
 * change" stays true of what actually changes. The anchors are v2.1's: the trust strip if the page has one,
 * otherwise the end of `<main>`.
 *
 * @return array{action:string,anchor:string,at:?int,block:int}
 */
function wx_place_plan(string $html, string $kind, string $block): array
{
    $open = preg_quote(wx_place_marker($kind), '~');
    $close = preg_quote(wx_place_marker($kind, true), '~');
    $re = '~\n?' . $open . '.*?' . $close . '~s';
    if (preg_match($re, $html, $m, PREG_OFFSET_CAPTURE)) {
        return [
            'action' => $block !== '' ? 'replace' : 'remove',
            'anchor' => 'the section already there',
            'at' => (int) $m[0][1],
            'block' => strlen($block),
        ];
    }
    if ($block === '') {
        return ['action' => 'none', 'anchor' => '', 'at' => null, 'block' => 0];
    }
    foreach (WX_PLACE_ANCHORS as $anchor) {
        $at = strpos($html, $anchor);
        if ($at !== false) {
            return ['action' => 'insert', 'anchor' => $anchor === '</main>' ? 'the end of main content' : 'the trust strip', 'at' => $at, 'block' => strlen($block)];
        }
    }
    /* No marker and no anchor: the page is not one this section can be written into, and saying so is
       better than appending it to the end of the document where nobody will see it. */
    return ['action' => 'no-anchor', 'anchor' => '', 'at' => null, 'block' => strlen($block)];
}

/** Apply the plan. Returns the page and what was done to it. */
function wx_place_apply(string $html, string $kind, string $block): array
{
    $plan = wx_place_plan($html, $kind, $block);
    $open = preg_quote(wx_place_marker($kind), '~');
    $close = preg_quote(wx_place_marker($kind, true), '~');
    $re = '~\n?' . $open . '.*?' . $close . '~s';

    switch ($plan['action']) {
        case 'replace':
        case 'remove':
            $next = (string) preg_replace($re, $block !== '' ? "\n" . $block : '', $html, 1);
            break;
        case 'insert':
            $at = (int) $plan['at'];
            $next = substr($html, 0, $at) . $block . "\n" . substr($html, $at);
            break;
        default:
            $next = $html;
    }
    return ['html' => $next, 'plan' => $plan, 'changed' => $next !== $html];
}

/**
 * A short look at where a section lands — enough to see the spot, not the whole page.
 *
 * A live page is 60–90 KB; a preview that shipped it to the browser to point at one line would be sending
 * somebody's work to be looked at rather than read. This returns the sentence either side of the insertion
 * point with the whitespace folded, which is what the screen shows in a `<pre>`.
 *
 * @return array{before:string,after:string,at:string} `at` is whatever the insertion point is sitting in front of
 *                                            — a marker comment, or the tag that anchors it.
 */
function wx_place_excerpt(string $html, int $at, int $span = 130): array
{
    $clean = static fn(string $s): string => trim((string) preg_replace('~\s+~', ' ', $s));
    $before = $clean(substr($html, max(0, $at - $span * 2), min($span * 2, max(0, $at))));
    $after = $clean(substr($html, $at, $span * 2));
    $tag = '';
    if (preg_match('~^(<!--[^>]{0,80}-->|</?[a-z][^>]{0,200}>)~i', $after, $m)) {
        $tag = $m[0];
    }
    return ['before' => mb_substr($before, -$span), 'after' => mb_substr($after, 0, $span), 'at' => $tag];
}

/** The pages that currently carry a kind's marker — found by looking, not by asking the settings. */
function wx_place_marker_pages(string $kind): array
{
    $out = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) @file_get_contents(WX_SITE_ROOT . '/' . $rel);
        if (str_contains($html, wx_place_marker($kind))) {
            $out[] = $rel;
        }
    }
    return $out;
}

/* ============================================================ the settings */

/** v2.1's rule for a page a section may be placed on: an .html file, not in a private folder. */
function wx_place_rel_ok(string $rel): bool
{
    return preg_match('~^[a-z0-9][a-z0-9/_\-.]*\.html$~i', $rel) === 1
        && !str_contains($rel, '..')
        && preg_match('~^(_private|builder|admin|api|assets)/~', $rel) !== 1;
}

/** The setting row for a kind, with the defaults a site that has never chosen anything gets. */
function wx_place_set(string $kind): array
{
    wx_place_kind($kind);
    $row = wx_one('SELECT * FROM wx_placement_sets WHERE kind = ?', [$kind]);
    return [
        'kicker' => (string) ($row['kicker'] ?? ''),
        'heading' => (string) ($row['heading'] ?? ''),
        'design' => isset(WX_PLACE_DESIGNS[(string) ($row['design'] ?? '')]) ? (string) $row['design'] : 'cards',
        'max' => (int) ($row['max_items'] ?? 0),
        'updatedAt' => $row['updated_at'] ?? null,
        'updatedBy' => $row['updated_by_name'] ?? null,
    ];
}

/** The pages a kind is placed on, in the order they were chosen. */
function wx_place_pages(string $kind): array
{
    wx_place_kind($kind);
    $rels = [];
    $designs = [];
    foreach (wx_all('SELECT rel, design FROM wx_placements WHERE kind = ? ORDER BY id ASC', [$kind]) as $r) {
        $rels[] = (string) $r['rel'];
        if ($r['design'] !== null && isset(WX_PLACE_DESIGNS[(string) $r['design']])) {
            $designs[(string) $r['rel']] = (string) $r['design'];
        }
    }
    return ['pages' => $rels, 'designs' => $designs];
}

/** The live items of a kind, in the order the screen shows them. */
function wx_place_items(string $kind, int $limit = 80): array
{
    $type = wx_place_kind($kind)['type'];
    $rows = wx_all(
        'SELECT * FROM wx_content WHERE type = ? AND status = ? ORDER BY flag_order ASC, id DESC LIMIT ' . max(1, min(200, $limit)),
        [$type, 'published']
    );
    return array_map('wx_content_item', $rows);
}

/**
 * Everything a screen needs: the settings, v2.1's own shape, and where the markers are.
 *
 * `placements` is written in **v2.1's JSON shape** (`{testimonial: [...], testimonialSet: {...}}`) because
 * the v2.1 admin reads that shape through `cms_placements` and the two admins are both live during the
 * cut-over. Two admins, one truth.
 */
function wx_place_state(): array
{
    $placements = [];
    $counts = [];
    $markers = [];
    $items = [];
    foreach (array_keys(WX_PLACE_KINDS) as $kind) {
        $p = wx_place_pages($kind);
        $set = wx_place_set($kind);
        $placements[$kind] = $p['pages'];
        $placements[$kind . 'Set'] = [
            'kicker' => $set['kicker'],
            'heading' => $set['heading'],
            'design' => $set['design'],
            'max' => $set['max'],
            'designs' => (object) $p['designs'],
        ];
        $items[$kind] = wx_place_items($kind);
        $counts[$kind] = count($items[$kind]);
        $markers[$kind] = wx_place_marker_pages($kind);
    }
    return [
        'placements' => $placements,
        'kinds' => array_map(static fn(array $k): array => [
            'kind' => $k['marker'],
            'title' => $k['title'],
            'one' => $k['one'],
        ], WX_PLACE_KINDS),
        'designs' => array_map(static fn(string $k, array $v): array => ['id' => $k, 'label' => $v[0], 'note' => $v[1]], array_keys(WX_PLACE_DESIGNS), array_values(WX_PLACE_DESIGNS)),
        'counts' => $counts,
        'markerPages' => $markers,
        'anchors' => WX_PLACE_ANCHORS,
    ];
}

/**
 * Save the settings, in v2.1's shape and with v2.1's rules.
 *
 * The whole set is replaced, as `cms_placements_save` did: a placement map is a decision about where things
 * appear, and a request that mentions one page cannot say whether the others were kept.
 *
 * @return array the new state, in v2.1's shape
 */
function wx_place_save(array $in, array $me): array
{
    $posted = is_array($in['placements'] ?? null) ? $in['placements'] : [];
    foreach (array_keys(WX_PLACE_KINDS) as $kind) {
        $rels = [];
        foreach ((array) ($posted[$kind] ?? []) as $rel) {
            if (is_string($rel) && wx_place_rel_ok($rel) && !in_array($rel, $rels, true)) {
                $rels[] = $rel;
            }
            if (count($rels) >= 80) {
                break; // v2.1's own cap: this is a decision about a website, not a mailing list.
            }
        }
        $set = is_array($posted[$kind . 'Set'] ?? null) ? $posted[$kind . 'Set'] : [];
        $design = (string) ($set['design'] ?? '');
        $design = isset(WX_PLACE_DESIGNS[$design]) ? $design : 'cards';
        $max = max(0, min(30, (int) ($set['max'] ?? 0)));
        $designs = [];
        foreach ((array) ($set['designs'] ?? []) as $rel => $d) {
            if (in_array((string) $rel, $rels, true) && is_string($d) && isset(WX_PLACE_DESIGNS[$d])) {
                $designs[(string) $rel] = $d;
            }
        }

        wx_q('DELETE FROM wx_placements WHERE kind = ?', [$kind]);
        foreach ($rels as $rel) {
            wx_insert('wx_placements', [
                'kind' => $kind,
                'rel' => $rel,
                'design' => $designs[$rel] ?? null,
                'updated_at' => wx_now(),
                'updated_by_name' => (string) $me['name'],
            ]);
        }
        $row = [
            'kicker' => mb_substr(trim((string) ($set['kicker'] ?? '')), 0, 60),
            'heading' => mb_substr(trim((string) ($set['heading'] ?? '')), 0, 120),
            'design' => $design,
            'max_items' => $max,
            'updated_at' => wx_now(),
            'updated_by_name' => (string) $me['name'],
        ];
        if (wx_one('SELECT kind FROM wx_placement_sets WHERE kind = ?', [$kind]) === null) {
            wx_insert('wx_placement_sets', ['kind' => $kind] + $row);
        } else {
            wx_update('wx_placement_sets', $row, ['kind' => $kind]);
        }
    }
    wx_audit($me, 'content.placements', implode(', ', array_keys(WX_PLACE_KINDS)), [
        'pages' => array_map(static fn(string $k): int => count((array) ($posted[$k] ?? [])), array_keys(WX_PLACE_KINDS)),
    ]);
    return wx_place_state()['placements'];
}

/* ============================================================ the push */

/**
 * Work out what a push would do, page by page, without writing anything.
 *
 * This is the check the screen shows before anybody presses the button: which pages change, which are
 * already right, and which cannot take the section at all.
 *
 * @return array{pages:array<int,array>,changed:int,unchanged:int,blocked:int,bytes:int}
 */
function wx_place_plan_all(array $kinds, int $limit = 200): array
{
    $blocks = [];
    foreach ($kinds as $kind) {
        $cfg = wx_place_kind($kind);
        $set = wx_place_set($kind);
        $blocks[$kind] = ['html' => wx_place_block($kind, wx_place_items($kind), $set), 'pages' => wx_place_pages($kind)['pages'], 'designs' => wx_place_pages($kind)['designs']];
    }
    $rels = [];
    foreach ($kinds as $kind) {
        foreach (array_merge($blocks[$kind]['pages'], wx_place_marker_pages($kind)) as $rel) {
            $rels[$rel] = true;
        }
    }
    $out = [];
    $changed = 0;
    $unchanged = 0;
    $blocked = 0;
    $bytes = 0;
    foreach (array_slice(array_keys($rels), 0, max(1, $limit)) as $rel) {
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        $row = ['rel' => $rel, 'kinds' => []];
        foreach ($kinds as $kind) {
            $design = $blocks[$kind]['designs'][$rel] ?? null;
            $block = $kind === 'testimonial' && $design !== null
                ? wx_place_block($kind, wx_place_items($kind), wx_place_set($kind), $design)
                : $blocks[$kind]['html'];
            $p = wx_place_plan($html, $kind, $block);
            $row['kinds'][] = ['kind' => $kind, 'action' => $p['action'], 'anchor' => $p['anchor'], 'bytes' => strlen($block)];
            if ($p['action'] === 'no-anchor') {
                $blocked++;
            } elseif ($p['action'] !== 'none') {
                $changed++;
                $bytes += strlen($block);
            } else {
                $unchanged++;
            }
            $html = wx_place_apply($html, $kind, $block)['html'];
        }
        $out[] = $row;
    }
    return ['pages' => $out, 'changed' => $changed, 'unchanged' => $unchanged, 'blocked' => $blocked, 'bytes' => $bytes];
}

/**
 * Push the sections to the pages, as one change.
 *
 * Every page that changes shares one batch id, so the history shows the push as one thing and rolling it
 * back puts every page back the way it was — which is the same undo the header change uses, and the reason
 * this is a server-side batch rather than the page-by-page walk v2.1's admin did in the browser.
 *
 * @return array{batch:string,changed:array<int,string>,skipped:int,versions:array<string,int>,plans:array<int,array>}
 */
function wx_place_push(array $kinds, array $me): array
{
    $kinds = array_values(array_filter($kinds, 'wx_place_kind_ok'));
    if (!$kinds) {
        throw ApiError::validation('Say which section to update (' . implode(' or ', array_keys(WX_PLACE_KINDS)) . ')', 'kinds');
    }
    $items = [];
    $sets = [];
    $designs = [];
    $rels = [];
    foreach ($kinds as $kind) {
        $items[$kind] = wx_place_items($kind);
        $sets[$kind] = wx_place_set($kind);
        $p = wx_place_pages($kind);
        $designs[$kind] = $p['designs'];
        foreach (array_merge($p['pages'], wx_place_marker_pages($kind)) as $rel) {
            $rels[$rel] = true;
        }
    }
    $plans = [];
    $edit = static function (string $rel, string $html) use ($kinds, $items, $sets, $designs, &$plans): ?string {
        $before = $html;
        $row = ['rel' => $rel, 'kinds' => []];
        foreach ($kinds as $kind) {
            $block = wx_place_block($kind, $items[$kind], $sets[$kind], $designs[$kind][$rel] ?? null);
            $applied = wx_place_apply($html, $kind, $block);
            $html = $applied['html'];
            $row['kinds'][] = ['kind' => $kind, 'action' => $applied['plan']['action'], 'anchor' => $applied['plan']['anchor']];
        }
        $plans[] = $row;
        return $html === $before ? null : $html;
    };
    $note = 'placements: ' . implode(' + ', $kinds);
    $r = wx_page_write_many(array_keys($rels), $edit, $me, $note);
    if ($r['changed']) {
        wx_audit($me, 'placements.push', implode(', ', $kinds), [
            'batch' => $r['batch'],
            'changed' => count($r['changed']),
            'skipped' => $r['skipped'],
        ]);
    }
    return $r + ['plans' => $plans, 'items' => array_map('count', $items)];
}

/**
 * Read v2.1's placements out of `_private/content.json`, once.
 *
 * The same shape as the media and section-library imports: an idempotent read of the old file so the studio
 * does not re-tick thirty pages on the first morning. It never invents a placement — a file that says
 * nothing about a kind leaves that kind alone.
 */
function wx_place_import_legacy(): array
{
    $f = WX_PRIVATE_DIR . '/content.json';
    if (!is_file($f)) {
        return ['imported' => false, 'why' => 'No _private/content.json on this site'];
    }
    $c = json_decode((string) file_get_contents($f), true);
    if (!is_array($c) || !is_array($c['placements'] ?? null)) {
        return ['imported' => false, 'why' => 'That file has no placements in it'];
    }
    $p = $c['placements'];
    $out = [];
    foreach (array_keys(WX_PLACE_KINDS) as $kind) {
        $rels = [];
        foreach ((array) ($p[$kind] ?? []) as $rel) {
            if (is_string($rel) && wx_place_rel_ok($rel)) {
                $rels[] = $rel;
            }
        }
        if (!$rels && !is_array($p[$kind . 'Set'] ?? null)) {
            continue;
        }
        $set = is_array($p[$kind . 'Set'] ?? null) ? $p[$kind . 'Set'] : [];
        $row = wx_one('SELECT kind FROM wx_placement_sets WHERE kind = ?', [$kind]);
        $keep = [
            'kicker' => mb_substr(trim((string) ($set['kicker'] ?? '')), 0, 60),
            'heading' => mb_substr(trim((string) ($set['heading'] ?? '')), 0, 120),
            'design' => isset(WX_PLACE_DESIGNS[(string) ($set['design'] ?? '')]) ? (string) $set['design'] : 'cards',
            'max_items' => max(0, min(30, (int) ($set['max'] ?? 0))),
            'updated_at' => wx_now(),
            'updated_by_name' => 'imported from v2.1',
        ];
        if ($row === null) {
            wx_insert('wx_placement_sets', ['kind' => $kind] + $keep);
        } else {
            wx_update('wx_placement_sets', $keep, ['kind' => $kind]);
        }
        if (!wx_val('SELECT COUNT(*) FROM wx_placements WHERE kind = ?', [$kind]) && $rels) {
            foreach ($rels as $rel) {
                $d = (string) (($set['designs'][$rel] ?? ''));
                wx_insert('wx_placements', [
                    'kind' => $kind,
                    'rel' => $rel,
                    'design' => isset(WX_PLACE_DESIGNS[$d]) ? $d : null,
                    'updated_at' => wx_now(),
                    'updated_by_name' => 'imported from v2.1',
                ]);
            }
        }
        $out[$kind] = count($rels);
    }
    return ['imported' => true, 'placements' => $out];
}
