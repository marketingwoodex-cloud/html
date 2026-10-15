<?php
/**
 * api/v2/lib/heroes.php — the hero at the top of every page, read and written as rules.
 *
 * v2.1's Hero slides screen (admin-hero.js) was the last big screen that lived only in a browser. It did
 * three things, and all three are here as functions a test can call:
 *
 *   1. the home slider — add, remove, hide, reorder and edit slides, with the interval;
 *   2. every other page's hero — which design it uses, and its text and photo;
 *   3. six templates, for a page whose hero should be one of the studio's own designs rather than
 *      whatever that page happens to carry.
 *
 * **The shape of the port, and why it is not the same shape.** v2.1 read the page into the DOM, edited
 * nodes, serialised the document and posted the whole thing back as a builder save. That is a browser
 * doing HTML surgery with no record of which field it was touching, and two consequences followed:
 * a field with no node in that page's hero (a kicker the design does not have) was **silently dropped**,
 * and re-serialising the document rewrote parts of the page nobody asked about. Here the geometry is
 * computed first — where each field's text or attribute sits, as byte offsets — and then the new values
 * are spliced in. Two rules fall out of that, and both are asserted in `tests/run.php`:
 *
 *   · a field the request wants to set but the hero has no home for is **refused by name**, never dropped;
 *   · nothing else in the page is touched, because nothing else is written.
 *
 * The reader and the writer share `wx_hero_parts()` for exactly that reason: the byte range a field is
 * read from is the byte range it is written at, so the two can never drift apart.
 *
 * Nothing here needs the database. A hero is part of a page, pages are files, and the file is the record —
 * which is also why an edit is undoable through page history like every other page change.
 */

declare(strict_types=1);

/** v2.1's own list of hero designs, by the class the studio's pages carry. */
const WX_HERO_FAMILIES = [
    'dx-hero' => 'Article header',
    'ct-hero' => 'City page',
    'as-hero' => 'Architecture service',
    'rv-hero' => 'Renovation service',
    'bd-hero' => 'Interior service',
    'fo-hero' => 'Fit-out service',
    'hm-hero' => 'Home slider',
    'hx-hero' => 'Hub header',
    'est-hero' => 'Tool / legal header',
];

/** The six templates, in the order they are offered. A page switched to one is marked `data-wxh`. */
const WX_HERO_TEMPLATES = [
    'image' => ['Full image', 'Photo fills the hero, text bottom-left. Strong first impression.'],
    'split' => ['Split', 'Text left, photo right, on cream. Calm and clear.'],
    'center' => ['Centered', 'Photo behind, centred title. Good for campaigns.'],
    'plain' => ['Plain cream', 'No photo. Title, text and buttons only. Fast to load.'],
    'compact' => ['Compact band', 'Short navy band with title. Best for legal and utility pages.'],
    'slider' => ['Slider', 'Several slides that rotate, each with its own photo and buttons.'],
];

/** Home is one page, and its slider is one block inside it. */
const WX_HERO_HOME = 'index.html';

/** The two fields a hero cannot do without, on any design. */
const WX_HERO_NEEDS = ['title'];

/* ============================================================ geometry */

/**
 * The hero section of a page, as a byte range.
 *
 * v2.1's rule, kept exactly: the first section inside `<main>` whose class contains `hero`, and if the
 * page has no `<main>` (or no hero inside it) the first such section anywhere. The end is found by
 * counting `<section>` / `</section>` — the site's pages nest sections inside heroes, and the first
 * `</section>` is very often not this section's.
 *
 * Pure: takes HTML, returns offsets. No file is read here, so the rule is testable on a literal.
 *
 * @return array{start:int, end:int, open:string, body:string, family:array}|null
 */
function wx_hero_section(string $html): ?array
{
    $main = stripos($html, '<main');
    $zones = [];
    if ($main !== false) {
        $zones[] = [$main, strlen($html)];
    }
    $zones[] = [0, strlen($html)];
    foreach ($zones as [$from, $to]) {
        $at = $from;
        while (true) {
            $pos = stripos($html, '<section', $at);
            if ($pos === false || $pos >= $to) {
                break;
            }
            $gt = strpos($html, '>', $pos);
            if ($gt === false) {
                break;
            }
            $open = substr($html, $pos, $gt - $pos + 1);
            if (preg_match('~class\s*=\s*"([^"]*)"~i', $open, $m) && stripos($m[1], 'hero') !== false) {
                $end = wx_hero_end($html, $gt);
                if ($end === null) {
                    break;
                }
                return [
                    'start' => $pos,
                    'end' => $end,
                    'open' => $open,
                    'body' => substr($html, $pos, $end - $pos),
                    'family' => wx_hero_family($open),
                ];
            }
            $at = $gt + 1;
        }
    }
    return null;
}

/**
 * Where the section whose opening tag ends at `$pos` ends, by balanced `<section>` counting.
 *
 * The count starts at **one** rather than zero because the scan starts after the opening tag: the section
 * is already open, and the first `</section>` after it is this section's only if nothing inside it is
 * still open. (Getting this wrong is invisible on a hero with no nested section and wrong on one with.)
 */
function wx_hero_end(string $html, int $pos): ?int
{
    $depth = 1;
    if (!preg_match_all('~</?section\b[^>]*>~i', $html, $m, PREG_OFFSET_CAPTURE, $pos)) {
        return null;
    }
    foreach ($m[0] as [$tag, $at]) {
        if ($at < $pos) {
            continue;
        }
        $depth += $tag[1] === '/' ? -1 : 1;
        if ($depth === 0) {
            return $at + strlen($tag);
        }
    }
    return null;
}

/**
 * What a hero is, from its opening tag: the template it was switched to, the studio's own design, or
 * a one-off. The label is what a person reads in the list, so it is never a bare class name.
 *
 * @return array{0:string,1:string,2:string}  [id, label, note]
 */
function wx_hero_family(string $open): array
{
    if (preg_match('~data-wxh\s*=\s*"([a-z]+)"~i', $open, $m)) {
        $k = strtolower($m[1]);
        return ['tpl-' . $k, 'Template: ' . (WX_HERO_TEMPLATES[$k][0] ?? $k), WX_HERO_TEMPLATES[$k][1] ?? ''];
    }
    $class = preg_match('~class\s*=\s*"([^"]*)"~i', $open, $c) ? $c[1] : '';
    foreach (preg_split('~\s+~', trim($class)) ?: [] as $token) {
        if ($token !== '' && isset(WX_HERO_FAMILIES[$token])) {
            return [$token, WX_HERO_FAMILIES[$token], ''];
        }
    }
    foreach (preg_split('~\s+~', trim($class)) ?: [] as $token) {
        if ($token !== '' && preg_match('~-hero$|^hero$~', $token)) {
            return ['custom', 'One-off design', $token];
        }
    }
    return ['none', 'No hero', ''];
}

/** The first span of a tag matching `$re` at or after `$from`, as [openStart, openEnd, closeStart, closeEnd]. */
/** Tags that never have a closing partner. Their content is nothing, and their attributes are everything. */
const WX_HERO_VOID = ['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'track', 'wbr'];

function wx_hero_tag_span(string $html, string $re, int $from = 0): ?array
{
    if (!preg_match($re, $html, $m, PREG_OFFSET_CAPTURE, $from)) {
        return null;
    }
    $at = $m[0][1];
    $open = $m[0][0];
    $gt = strpos($html, '>', $at);
    if ($gt === false) {
        return null;
    }
    $name = preg_match('~^<\s*([a-z0-9]+)~i', $open, $n) ? strtolower($n[1]) : '';
    if ($name === '') {
        return null;
    }
    if (in_array($name, WX_HERO_VOID, true)) {
        return ['openStart' => $at, 'openEnd' => $gt + 1, 'closeStart' => $gt + 1, 'closeEnd' => $gt + 1];
    }
    /* The closing tag is matched exactly (`</a>` and not `</article>`, `</p>` and not `</param>`): a prefix
       search would end a link at the next article, which is the kind of bug that only shows on one page. */
    if (!preg_match('~</' . $name . '\s*>~i', $html, $c, PREG_OFFSET_CAPTURE, $gt + 1)) {
        return null;
    }
    return ['openStart' => $at, 'openEnd' => $gt + 1, 'closeStart' => $c[0][1], 'closeEnd' => $c[0][1] + strlen($c[0][0])];
}

/** The byte range of an attribute's *value* inside one opening tag. Null when the attribute is absent. */
function wx_hero_attr_span(string $html, array $tagSpan, string $attr): ?array
{
    $open = substr($html, $tagSpan['openStart'], $tagSpan['openEnd'] - $tagSpan['openStart']);
    if (preg_match('~\s' . preg_quote($attr, '~') . '\s*=\s*"([^"]*)"~i', $open, $m, PREG_OFFSET_CAPTURE)) {
        $start = $tagSpan['openStart'] + $m[1][1];
        return [$start, $start + strlen($m[1][0])];
    }
    return null;
}

/**
 * Where every field of one hero sits, as byte offsets into the section's HTML.
 *
 * The fields are the ones the studio's heroes actually carry, and they are found the same way v2.1 found
 * them — a kicker is a paragraph whose class says so (or the paragraph immediately above the heading), a
 * lead is the first substantial paragraph after the heading, buttons are the first two `<a>`s whose class
 * contains `btn` and which are not breadcrumbs.
 *
 * @return array{title:?array,kicker:?array,lead:?array,img:?array,alt:?array,btns:array,crumbs:bool,heading:string}
 */
function wx_hero_parts(string $section): array
{
    $out = [
        'title' => null, 'kicker' => null, 'lead' => null, 'img' => null, 'alt' => null,
        'btns' => [], 'crumbs' => stripos($section, '<nav') !== false, 'heading' => 'h1',
    ];

    /* The heading: v2.1 preferred `h1`, and fell back to `h2` for a slider slide that is not the first. */
    $h = wx_hero_tag_span($section, '~<(?P<tag>h1)\b[^>]*>~i');
    if ($h === null) {
        $out['heading'] = 'h2';
        $h = wx_hero_tag_span($section, '~<(?P<tag>h2)\b[^>]*>~i');
    }
    if ($h !== null) {
        $out['title'] = [$h['openEnd'], $h['closeStart']];
    }

    /* The kicker: a paragraph whose class says kicker / label / eyebrow / `-k`, above the heading. */
    $ps = [];
    $at = 0;
    while (($p = wx_hero_tag_span($section, '~<(?P<tag>p)\b[^>]*>~i', $at)) !== null) {
        $ps[] = $p;
        $at = $p['openEnd'];
    }
    $headingAt = $h === null ? null : $h['openStart'];
    foreach ($ps as $p) {
        $class = preg_match('~class\s*=\s*"([^"]*)"~i', substr($section, $p['openStart'], $p['openEnd'] - $p['openStart']), $c) ? $c[1] : '';
        $isKicker = $class !== '' && preg_match('~kicker|label|eyebrow|(^|\s|-|_)k($|\s)~i', $class);
        if (!$isKicker) {
            continue;
        }
        /* Above the heading, or there is no heading to be above. */
        if ($headingAt === null || $p['openStart'] < $headingAt) {
            $out['kicker'] = [$p['openEnd'], $p['closeStart']];
            break;
        }
    }
    if ($out['kicker'] === null && $h !== null) {
        /* v2.1's second answer: the paragraph immediately before the heading, whitespace between them. */
        foreach ($ps as $p) {
            if ($p['closeEnd'] <= $h['openStart'] && trim(substr($section, $p['closeEnd'], $h['openStart'] - $p['closeEnd'])) === '') {
                $out['kicker'] = [$p['openEnd'], $p['closeStart']];
            }
        }
    }

    /* The lead: the paragraph after the heading that is not the kicker.
       v2.1 preferred the first paragraph longer than 25 characters, to tell a lead from a stray label — and
       kept it as a *preference*, not a rule. It has to be a preference here too: if a short line were not
       read back, an editor who shortened a lead would find the field empty next time and the next save
       would not reach it. So: the first substantial one if there is one, otherwise the first one. */
    if ($h !== null) {
        $candidates = [];
        foreach ($ps as $p) {
            if ($p['openStart'] < $h['closeEnd'] || ($out['kicker'] !== null && $p['openStart'] === $out['kicker'][0])) {
                continue;
            }
            $candidates[] = [$p['openEnd'], $p['closeStart']];
        }
        foreach ($candidates as $span) {
            if (strlen(trim(strip_tags(substr($section, $span[0], $span[1] - $span[0])))) > 25) {
                $out['lead'] = $span;
                break;
            }
        }
        if ($out['lead'] === null && $candidates) {
            $out['lead'] = $candidates[0];
        }
    }

    /* The photo, and its description. Every design that has one keeps it in a `<figure>` or a `<div>`. */
    if (($img = wx_hero_tag_span($section, '~<(?P<tag>img)\b[^>]*>~i')) !== null) {
        $out['img'] = wx_hero_attr_span($section, $img, 'src');
        $out['alt'] = wx_hero_attr_span($section, $img, 'alt');
    }

    /* The buttons: v2.1's rule and no more — an `<a>` whose class contains `btn`, skipping breadcrumbs. */
    $crumbRange = null;
    if (($nav = wx_hero_tag_span($section, '~<(?P<tag>nav)\b[^>]*>~i')) !== null) {
        $crumbRange = [$nav['openStart'], $nav['closeEnd']];
    }
    $at = 0;
    while (count($out['btns']) < 2 && ($a = wx_hero_tag_span($section, '~<(?P<tag>a)\b[^>]*>~i', $at)) !== null) {
        $at = $a['openEnd'];
        if ($crumbRange !== null && $a['openStart'] > $crumbRange[0] && $a['openStart'] < $crumbRange[1]) {
            continue;
        }
        $open = substr($section, $a['openStart'], $a['openEnd'] - $a['openStart']);
        if (!preg_match('~class\s*=\s*"([^"]*)"~i', $open, $c) || stripos($c[1], 'btn') === false) {
            continue;
        }
        $out['btns'][] = [
            'text' => [$a['openEnd'], $a['closeStart']],
            'href' => wx_hero_attr_span($section, $a, 'href'),
            'class' => $c[1],
            'route' => preg_match('~data-page-route\s*=\s*"([^"]*)"~i', $open, $r) ? $r[1] : '',
        ];
    }
    return $out;
}

/** The text inside a span, as a person would read it. */
function wx_hero_text(string $section, ?array $span): string
{
    if ($span === null) {
        return '';
    }
    $raw = substr($section, $span[0], $span[1] - $span[0]);
    return trim(html_entity_decode(strip_tags($raw), ENT_QUOTES | ENT_HTML5));
}

/** One hero's fields, read through its geometry. The order of this array is the order a screen shows. */
function wx_hero_fields(string $section): array
{
    $p = wx_hero_parts($section);
    return [
        'kicker' => wx_hero_text($section, $p['kicker']),
        'title' => wx_hero_text($section, $p['title']),
        'lead' => wx_hero_text($section, $p['lead']),
        'img' => $p['img'] === null ? '' : substr($section, $p['img'][0], $p['img'][1] - $p['img'][0]),
        'alt' => $p['alt'] === null ? '' : substr($section, $p['alt'][0], $p['alt'][1] - $p['alt'][0]),
        'b1t' => wx_hero_text($section, $p['btns'][0]['text'] ?? null),
        'b1h' => ($p['btns'][0]['href'] ?? null) === null ? '' : substr($section, $p['btns'][0]['href'][0], $p['btns'][0]['href'][1] - $p['btns'][0]['href'][0]),
        'b2t' => wx_hero_text($section, $p['btns'][1]['text'] ?? null),
        'b2h' => ($p['btns'][1]['href'] ?? null) === null ? '' : substr($section, $p['btns'][1]['href'][0], $p['btns'][1]['href'][1] - $p['btns'][1]['href'][0]),
        'crumbs' => $p['crumbs'],
    ];
}

/* ============================================================ slides */

/**
 * The `article`s of a slider — the home page's, or a hero switched to the slider template.
 *
 * @return array<int, array{start:int, end:int, html:string, open:string}>
 */
function wx_hero_slides(string $section): array
{
    $out = [];
    $at = 0;
    while (($a = wx_hero_tag_span($section, '~<(?P<tag>article)\b[^>]*>~i', $at)) !== null) {
        $at = $a['closeEnd'];
        $out[] = [
            'start' => $a['openStart'],
            'end' => $a['closeEnd'],
            'html' => substr($section, $a['openStart'], $a['closeEnd'] - $a['openStart']),
            'open' => substr($section, $a['openStart'], $a['openEnd'] - $a['openStart']),
        ];
    }
    /* A slider that has not been switched to the template yet may keep its slides in `<div>`s. Read those
       when there are no articles, so a page built by hand is still readable — and therefore editable. */
    if (!$out) {
        $at = 0;
        while (($d = wx_hero_tag_span($section, '~<(?P<tag>div)\b[^>]*(?:wxh-slide|data-home-slide|hm-slide)[^>]*>~i', $at)) !== null) {
            $at = $d['closeEnd'];
            $out[] = [
                'start' => $d['openStart'],
                'end' => $d['closeEnd'],
                'html' => substr($section, $d['openStart'], $d['closeEnd'] - $d['openStart']),
                'open' => substr($section, $d['openStart'], $d['openEnd'] - $d['openStart']),
            ];
        }
    }
    return $out;
}

/** Is this slide switched off? v2.1 wrote both `data-hm-off` and `hidden`; either one means off. */
function wx_hero_slide_off(string $open): bool
{
    /* `hidden` is a word here, not a substring: `aria-hidden="false"` contains the letters and means the
       opposite — the site's script tells a screen reader which slide is the one showing. */
    return (bool) preg_match('~\bdata-hm-off\b|\bdata-wxh-off\b|(?<![\w-])hidden(?!=[\w-])~i', $open);
}

/**
 * The home slider, read: its slides in order, its interval, and whether each slide shows.
 *
 * @return array{slides:array, interval:int, off:int}
 */
function wx_hero_read_home(string $section): array
{
    $slides = [];
    foreach (wx_hero_slides($section) as $s) {
        $f = wx_hero_fields($s['html']);
        $f['word'] = '';
        $f['m1'] = '';
        $f['m2'] = '';
        if (($w = wx_hero_tag_span($s['html'], '~<(?P<tag>strong)\b[^>]*>~i')) !== null) {
            $f['word'] = wx_hero_text($s['html'], [$w['openEnd'], $w['closeStart']]);
        }
        $spans = [];
        $at = 0;
        while (($sp = wx_hero_tag_span($s['html'], '~<(?P<tag>span)\b[^>]*>~i', $at)) !== null) {
            $at = $sp['closeEnd'];
            $spans[] = [$sp['openEnd'], $sp['closeStart']];
        }
        $f['m1'] = wx_hero_text($s['html'], $spans[0] ?? null);
        $f['m2'] = wx_hero_text($s['html'], $spans[1] ?? null);
        $f['off'] = wx_hero_slide_off($s['open']);
        $slides[] = $f;
    }
    $interval = 5;
    if (preg_match('~data-interval\s*=\s*"(\d+)"~i', $section, $m)) {
        $interval = max(2, min(30, (int) $m[1]));
    }
    return ['slides' => $slides, 'interval' => $interval, 'off' => count(array_filter($slides, static fn($s) => $s['off']))];
}

/* ============================================================ writing */

/** Every string a hero writes goes through here. One rule, one function. */
function wx_hero_esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5);
}

/**
 * Splice new values into a hero, in place: only the byte ranges the fields occupy are rewritten.
 *
 * `$updates` is field => value. A field whose value is unchanged is not written at all, which is what
 * keeps a save from touching markup nobody edited. A field the hero has no home for, but which the
 * request wants to set, is refused **by name** — v2.1 dropped those silently, and a kicker that vanishes
 * without a word is worse than an error that says which design cannot hold it.
 *
 * Splicing runs back to front so the offsets computed on the original string stay valid.
 */
function wx_hero_apply(string $section, array $updates): string
{
    $p = wx_hero_parts($section);
    $edits = [];   // [start, end, replacement]
    $missing = [];

    $text = ['kicker' => 'kicker', 'title' => 'title', 'lead' => 'lead'];
    foreach ($text as $field => $key) {
        if (!array_key_exists($field, $updates)) {
            continue;
        }
        $value = trim((string) $updates[$field]);
        if ($p[$key] === null) {
            if ($value !== '') {
                $missing[] = $field;
            }
            continue;
        }
        $now = wx_hero_text($section, $p[$key]);
        if ($now === $value) {
            continue;
        }
        $edits[] = [$p[$key][0], $p[$key][1], wx_hero_esc($value)];
    }

    if (array_key_exists('img', $updates)) {
        $value = trim((string) $updates['img']);
        if ($p['img'] === null) {
            if ($value !== '') {
                $missing[] = 'img';
            }
        } elseif (substr($section, $p['img'][0], $p['img'][1] - $p['img'][0]) !== $value) {
            $edits[] = [$p['img'][0], $p['img'][1], wx_hero_esc($value)];
        }
    }
    if (array_key_exists('alt', $updates)) {
        $value = trim((string) $updates['alt']);
        if ($p['alt'] === null) {
            if ($value !== '') {
                $missing[] = 'alt';
            }
        } elseif (substr($section, $p['alt'][0], $p['alt'][1] - $p['alt'][0]) !== $value) {
            $edits[] = [$p['alt'][0], $p['alt'][1], wx_hero_esc($value)];
        }
    }

    foreach ([0 => ['b1t', 'b1h'], 1 => ['b2t', 'b2h']] as $i => [$tk, $hk]) {
        $btn = $p['btns'][$i] ?? null;
        foreach ([[$tk, 'text'], [$hk, 'href']] as [$field, $which]) {
            if (!array_key_exists($field, $updates)) {
                continue;
            }
            $value = trim((string) $updates[$field]);
            $span = $btn === null ? null : $btn[$which];
            if ($span === null) {
                if ($value !== '') {
                    $missing[] = $field;
                }
                continue;
            }
            if ($which === 'text') {
                $now = wx_hero_text($section, $span);
                if ($now === $value) {
                    continue;
                }
                $edits[] = [$span[0], $span[1], wx_hero_esc($value)];
                continue;
            }
            if (substr($section, $span[0], $span[1] - $span[0]) !== $value) {
                $edits[] = [$span[0], $span[1], wx_hero_esc($value)];
            }
        }
    }

    if ($missing) {
        throw ApiError::validation(
            'This hero has no place for: ' . implode(', ', $missing) . '. Empty those fields, or switch the page to a template that has them.',
            $missing[0]
        );
    }

    usort($edits, static fn($a, $b) => $b[0] <=> $a[0]);
    foreach ($edits as [$start, $end, $replacement]) {
        $section = substr($section, 0, $start) . $replacement . substr($section, $end);
    }
    return $section;
}

/**
 * Switch a slide on or off, without rewriting it: the two attributes the site's script reads.
 *
 * `hidden` is what the browser needs, `data-home-off`/`data-hm-off` is what the script reads, and it
 * matters which is which — the slide stays in the file so its text is not lost by hiding it.
 */
function wx_hero_slide_toggle(string $slide, bool $off, string $flag = 'data-hm-off'): string
{
    $gt = strpos($slide, '>');
    if ($gt === false) {
        return $slide;
    }
    $open = substr($slide, 0, $gt + 1);
    $open = preg_replace('~\s(' . preg_quote($flag, '~') . '|(?<![\w-])hidden)(="[^"]*")?~i', '', $open);
    if ($off) {
        $open = rtrim(substr($open, 0, -1)) . ' ' . $flag . ' hidden>';
    }
    return $open . substr($slide, $gt + 1);
}

/** One slide of the home slider, in the shape the live page already uses. */
function wx_hero_build_slide(array $f, int $i, bool $first): string
{
    $title = trim((string) ($f['title'] ?? ''));
    $h = $first
        ? '<h1 class="hm-hero-title" id="home-hero-title">' . wx_hero_esc($title) . '</h1>'
        : '<h2 class="hm-hero-title">' . wx_hero_esc($title) . '</h2>';
    $btns = '';
    foreach ([[$f['b1t'] ?? '', $f['b1h'] ?? '', 'hm-btn-light'], [$f['b2t'] ?? '', $f['b2h'] ?? '', 'hm-btn-ghost']] as [$t, $h_, $class]) {
        $t = trim((string) $t);
        if ($t === '') {
            continue;
        }
        $btns .= '<a class="hm-btn ' . $class . '" href="' . wx_hero_esc(trim((string) $h_) !== '' ? trim((string) $h_) : '/contact/') . '">' . wx_hero_esc($t) . '</a>';
    }
    $img = trim((string) ($f['img'] ?? ''));
    $figure = '<figure class="hm-slide-image"><img src="' . wx_hero_esc($img) . '" alt="' . wx_hero_esc((string) ($f['alt'] ?? '')) . '"'
        . ($first ? ' fetchpriority="high"' : ' loading="lazy"') . '></figure>';
    $off = !empty($f['off']);
    return "\n        <article class=\"hm-slide" . ($first ? ' is-active' : '') . '" data-home-slide="' . $i . '" aria-hidden="' . ($first ? 'false' : 'true') . '"'
        . ($off ? ' data-hm-off hidden' : '') . '>'
        . $figure
        . "\n          <div class=\"hm-wrap hm-hero-content\">\n            <div class=\"hm-hero-copy hm-slide-copy\">\n              <div class=\"hm-slide-text\">"
        . '<p class="hm-kicker">' . wx_hero_esc((string) ($f['kicker'] ?? '')) . '</p>' . $h
        . "</div>\n              <div class=\"hm-hero-aside\"><p>" . wx_hero_esc((string) ($f['lead'] ?? '')) . '</p><div class="actions">' . $btns . '</div></div>'
        . "\n            </div>\n            <strong class=\"hm-display\" aria-hidden=\"true\">" . wx_hero_esc((string) ($f['word'] ?? '')) . '</strong>'
        . "\n            <div class=\"hm-hero-footer\"><div class=\"hm-hero-meta\"><span>" . wx_hero_esc((string) ($f['m1'] ?? '')) . '</span><span>' . wx_hero_esc((string) ($f['m2'] ?? '')) . '</span></div></div>'
        . "\n          </div>\n        </article>";
}

/** The dots under a slider. One per *showing* slide, because a hidden slide is not a choice. */
function wx_hero_dots(array $showing, string $dotClass, string $attr, string $wrapClass): string
{
    $dots = '';
    foreach (array_values($showing) as $i => $s) {
        $label = trim((string) ($s['kicker'] ?? '')) !== '' ? (string) $s['kicker'] : (string) ($s['title'] ?? '');
        $dots .= '<button class="' . $dotClass . ($i === 0 ? ' is-active' : '') . '" type="button" ' . $attr . '="' . $i . '" aria-label="Show slide ' . ($i + 1) . ': ' . wx_hero_esc($label) . '" aria-current="' . ($i === 0 ? 'true' : 'false') . '"></button>';
    }
    return '<div class="' . $wrapClass . '" role="group" aria-label="Choose a slide">' . $dots . '</div>';
}

/**
 * Render one of the six templates for a page. The markup is the design the studio's own stylesheet draws,
 * and it is the same markup in every state — the preview a screen shows is what gets written.
 */
function wx_hero_render(string $tpl, array $f, string $rel = ''): string
{
    if (!isset(WX_HERO_TEMPLATES[$tpl])) {
        throw ApiError::validation('Unknown hero template: "' . $tpl . '"', 'tpl');
    }
    $title = trim((string) ($f['title'] ?? ''));
    if ($title === '') {
        throw ApiError::validation('A hero needs a title', 'title');
    }
    $img = trim((string) ($f['img'] ?? ''));
    $alt = (string) ($f['alt'] ?? '');
    $crumbs = !empty($f['crumbs']) && $rel !== '' && $rel !== WX_HERO_HOME ? wx_hero_crumbs($title, $rel) : '';
    $kicker = trim((string) ($f['kicker'] ?? ''));
    $lead = trim((string) ($f['lead'] ?? ''));

    $media = $img === '' ? '' : '<figure class="wxh-media"><img src="' . wx_hero_esc($img) . '" alt="' . wx_hero_esc($alt) . '" fetchpriority="high"></figure>';
    $btns = ['', ''];
    foreach ([[0, 'b1t', 'b1h', ''], [1, 'b2t', 'b2h', ' wxh-btn--ghost']] as [$i, $tk, $hk, $extra]) {
        $t = trim((string) ($f[$tk] ?? ''));
        if ($t === '') {
            continue;
        }
        $h = trim((string) ($f[$hk] ?? ''));
        $btns[$i] = '<a class="wxh-btn' . $extra . '" href="' . wx_hero_esc($h !== '' ? $h : '/contact/') . '">' . wx_hero_esc($t) . '</a>';
    }
    $btnRow = trim($btns[0] . $btns[1]) === '' ? '' : '<div class="wxh-btns">' . $btns[0] . $btns[1] . '</div>';

    $inner = static function (array $s, bool $h1, bool $withCrumbs) use ($crumbs, $rel): string {
        $t = trim((string) ($s['title'] ?? ''));
        $head = $h1 ? '<h1 id="wxh-title">' . wx_hero_esc($t) . '</h1>' : '<h2 class="wxh-t">' . wx_hero_esc($t) . '</h2>';
        $b = '';
        foreach ([[$s['b1t'] ?? '', $s['b1h'] ?? '', ''], [$s['b2t'] ?? '', $s['b2h'] ?? '', ' wxh-btn--ghost']] as [$t2, $h2, $x2]) {
            $t2 = trim((string) $t2);
            if ($t2 === '') {
                continue;
            }
            $h2v = trim((string) $h2);
            $b .= '<a class="wxh-btn' . $x2 . '" href="' . wx_hero_esc($h2v !== '' ? $h2v : '/contact/') . '">' . wx_hero_esc($t2) . '</a>';
        }
        return ($withCrumbs && $h1 ? $crumbs : '')
            . (trim((string) ($s['kicker'] ?? '')) !== '' ? '<p class="wxh-k">' . wx_hero_esc((string) $s['kicker']) . '</p>' : '')
            . $head
            . (trim((string) ($s['lead'] ?? '')) !== '' ? '<p class="wxh-lead">' . wx_hero_esc((string) $s['lead']) . '</p>' : '')
            . ($b !== '' ? '<div class="wxh-btns">' . $b . '</div>' : '');
    };

    if ($tpl === 'slider') {
        $slides = array_values(array_filter(
            is_array($f['slides'] ?? null) ? $f['slides'] : [$f],
            static fn($s) => is_array($s) && empty($s['off'])
        ));
        if (!$slides) {
            $slides = [$f];
        }
        $body = '';
        foreach ($slides as $i => $s) {
            $s['crumbs'] = !empty($s['crumbs']);
            $m = trim((string) ($s['img'] ?? '')) === '' ? '' : '<figure class="wxh-media"><img src="' . wx_hero_esc((string) $s['img']) . '" alt="' . wx_hero_esc((string) ($s['alt'] ?? '')) . '"' . ($i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') . '></figure>';
            $body .= "\n" . '<div class="wxh-slide' . ($i === 0 ? ' is-on' : '') . '" aria-hidden="' . ($i === 0 ? 'false' : 'true') . '">' . $m
                . '<div class="wxh-in"><div class="wxh-copy">' . $inner($s, $i === 0, true) . '</div></div></div>';
        }
        $dots = count($slides) > 1 ? wx_hero_dots($slides, 'wxh-dot', 'data-wxh-dot', 'wxh-dots') : '';
        return '<section class="wxh wxh--slider" data-wxh="slider" data-interval="' . max(2, min(30, (int) ($f['interval'] ?? 6))) . '" aria-roledescription="carousel" aria-labelledby="wxh-title">'
            . $body . $dots . '</section>';
    }

    $noImg = $tpl === 'plain' || $tpl === 'compact';
    $copy = '<div class="wxh-copy">' . $inner($f, true, true) . '</div>';
    $section = '<section class="wxh wxh--' . $tpl . '" data-wxh="' . $tpl . '" aria-labelledby="wxh-title">'
        . ($noImg || $tpl === 'split' ? '' : $media)
        . '<div class="wxh-in">' . ($tpl === 'split' ? $media . $copy : $copy) . '</div></section>';
    return $section;
}

/** A breadcrumb trail for a page at `services/x/index.html` — the same words v2.1's editor produced. */
function wx_hero_crumbs(string $title, string $rel): string
{
    $parts = array_values(array_filter(explode('/', preg_replace('~index\.html$~', '', $rel) ?: '')));
    if (!$parts) {
        return '';
    }
    $out = '<a href="/">Home</a><span>→</span>';
    if (count($parts) > 1) {
        $label = ucfirst(str_replace('-', ' ', $parts[0]));
        $out .= '<a href="/' . wx_hero_esc($parts[0]) . '/">' . wx_hero_esc($label) . '</a><span>→</span>';
    }
    return '<nav class="wxh-crumbs" aria-label="Breadcrumb">' . $out . '<span>' . wx_hero_esc($title) . '</span></nav>';
}

/**
 * Only one `<h1>` on a page.
 *
 * v2.1 demoted every `h1` outside the new hero after switching a page to a template, because a second
 * `h1` is a second claim about what the page is about. Kept as a rule here, and asserted.
 */
function wx_hero_one_h1(string $html): string
{
    $hero = wx_hero_section($html);
    if ($hero === null) {
        return $html;
    }
    /* Inside the hero: the first heading is the page's, and any other is demoted rather than deleted —
       the words stay where they were, with the rank they now deserve. */
    $first = true;
    $body = (string) preg_replace_callback('~<h1\b([^>]*)>(.*?)</h1>~is', static function (array $m) use (&$first): string {
        if ($first) {
            $first = false;
            return $m[0];
        }
        return '<h2' . $m[1] . '>' . $m[2] . '</h2>';
    }, $hero['body']);
    /* Outside it: every `h1` belongs to something that is not the hero, so all of them are demoted. */
    $demote = static fn(string $part): string => (string) preg_replace('~<h1\b([^>]*)>(.*?)</h1>~is', '<h2$1>$2</h2>', $part);
    return $demote(substr($html, 0, $hero['start'])) . $body . $demote(substr($html, $hero['end']));
}

/* ============================================================ the pages */

/** A page a hero may live in: the same rule the rest of the CMS uses, and never a machinery folder. */
function wx_hero_rel_ok(string $rel): bool
{
    if (!preg_match('~^[a-z0-9][a-z0-9/_\-.]*\.html$~i', $rel) || str_contains($rel, '..')) {
        return false;
    }
    foreach (WX_PAGE_SKIP as $skip) {
        if (str_starts_with($rel, $skip . '/')) {
            return false;
        }
    }
    return true;
}

/** Read one page's hero. The page is the record, so there is nothing to look up anywhere else. */
function wx_hero_page(string $rel): array
{
    $rel = wx_page_rel($rel);
    $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    if (!preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m)) {
        $title = $rel;
    } else {
        $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5));
    }
    $hero = wx_hero_section($html);
    $tpl = '';
    if ($hero !== null && preg_match('~data-wxh\s*=\s*"([a-z]+)"~i', $hero['open'], $w)) {
        $tpl = strtolower($w[1]);
    }
    $home = $rel === WX_HERO_HOME;
    $fields = $hero === null ? wx_hero_blank() : wx_hero_fields($hero['body']);
    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'title' => $title,
        'bytes' => strlen($html),
        'family' => $hero === null ? ['none', 'No hero', ''] : $hero['family'],
        'tpl' => $tpl,
        'hasHero' => $hero !== null,
        'fields' => $fields,
        'slides' => $home ? [] : [],
        'home' => $home,
        'interval' => 0,
        'templates' => wx_hero_templates(),
    ];
}

/** The shape a screen fills in for a page that has no hero yet. */
function wx_hero_blank(): array
{
    return [
        'kicker' => '', 'title' => '', 'lead' => '', 'img' => '', 'alt' => '',
        'b1t' => 'Start your project', 'b1h' => '/contact/', 'b2t' => '', 'b2h' => '', 'crumbs' => true,
    ];
}

/** The home slider, read from the page that carries it. */
function wx_hero_home(): array
{
    $rel = WX_HERO_HOME;
    $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    $hero = wx_hero_section($html);
    if ($hero === null) {
        return ['rel' => $rel, 'url' => '/', 'title' => 'Home', 'present' => false, 'slides' => [], 'interval' => 5, 'family' => ['none', 'No hero', ''], 'templates' => wx_hero_templates()];
    }
    $read = wx_hero_read_home($hero['body']);
    return [
        'rel' => $rel, 'url' => '/', 'title' => 'Home', 'present' => true,
        'slides' => $read['slides'], 'interval' => $read['interval'], 'hidden' => $read['off'],
        'family' => $hero['family'], 'templates' => wx_hero_templates(),
    ];
}

/** The six designs, as the gallery shows them. */
function wx_hero_templates(): array
{
    $out = [];
    foreach (WX_HERO_TEMPLATES as $id => [$label, $desc]) {
        $out[] = ['id' => $id, 'label' => $label, 'desc' => $desc];
    }
    return $out;
}

/** The sample content the gallery previews use — the same words v2.1's gallery demonstrated with. */
function wx_hero_sample(): array
{
    return [
        'kicker' => 'Interior design · Lahore',
        'title' => 'Spaces shaped by purpose',
        'lead' => 'Design, build and furniture with one accountable team, from the first sketch to handover.',
        'img' => '/assets/img/img-c349a92a4ae0.webp',
        'alt' => 'Contemporary residential interior with warm timber and tailored furniture',
        'b1t' => 'Start your project', 'b1h' => '/contact/',
        'b2t' => 'See our work', 'b2h' => '/projects/',
        'crumbs' => true, 'slides' => [],
    ];
}

/**
 * Every page's hero, for the list.
 *
 * v2.1 walked the tree in the browser, eight pages at a time, because it had no other way to. Here it is
 * one pass over the files, and only the first 256 KB of each is read — a hero is at the top of a page,
 * and reading 150 whole pages to find 150 heroes would be work for nobody's benefit.
 *
 * @return array{pages:array, counts:array, total:int, without:int}
 */
function wx_hero_scan(int $limit = 400): array
{
    $pages = [];
    $counts = [];
    $without = 0;
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (count($pages) >= $limit) {
            break;
        }
        if (!wx_hero_rel_ok($rel) || preg_match('~^(404|500|503)\.html$~', $rel)) {
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel, false, null, 0, 262_144);
        $hero = wx_hero_section($html);
        $title = '';
        if (preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m)) {
            $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5));
        }
        $title = trim((string) preg_replace('~\s*[|·–-]\s*Woodex.*$~i', '', $title));
        $family = $hero === null ? ['none', 'No hero', ''] : $hero['family'];
        $counts[$family[1]] = ($counts[$family[1]] ?? 0) + 1;
        if ($hero === null) {
            $without++;
        }
        $heroTitle = $hero === null ? '' : wx_hero_fields($hero['body'])['title'];
        $pages[] = [
            'rel' => $rel,
            'url' => wx_page_url($rel),
            'title' => $title !== '' ? $title : $rel,
            'family' => $family[0],
            'familyLabel' => $family[1],
            'familyNote' => $family[2],
            'heroTitle' => $heroTitle,
            'home' => $rel === WX_HERO_HOME,
        ];
    }
    usort($pages, static fn($a, $b) => $a['rel'] === WX_HERO_HOME ? -1 : ($b['rel'] === WX_HERO_HOME ? 1 : strcmp($a['rel'], $b['rel'])));
    arsort($counts);
    return ['pages' => $pages, 'counts' => $counts, 'total' => count($pages), 'without' => $without];
}

/* ============================================================ saving */

/** The fields a hero write may carry, and nothing else. */
function wx_hero_updates(array $in): array
{
    $out = [];
    foreach (['kicker' => 200, 'title' => 200, 'lead' => 600, 'img' => 300, 'alt' => 300, 'b1t' => 90, 'b1h' => 300, 'b2t' => 90, 'b2h' => 300] as $k => $max) {
        if (!array_key_exists($k, $in)) {
            continue;
        }
        $v = trim((string) $in[$k]);
        if (mb_strlen($v) > $max) {
            throw ApiError::validation('That ' . $k . ' is longer than this page can show (' . $max . ' characters)', $k);
        }
        $out[$k] = $v;
    }
    return $out;
}

/**
 * Save one page's hero: edit it where it stands, or switch it to one of the six designs.
 *
 * Either way it is one page write through `wx_page_write()` — which means a snapshot, a version row and
 * an audit entry, so a hero change is undoable from page history exactly like every other page change.
 * `tpl = keep` edits in place; anything else replaces the section with that design's markup.
 */
function wx_hero_save_page(string $rel, array $in, array $me): array
{
    $rel = wx_page_rel($rel);
    if (!wx_hero_rel_ok($rel)) {
        throw ApiError::validation('That is not a page this screen may edit', 'rel');
    }
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no page at /' . $rel);
    }
    $html = (string) file_get_contents($abs);
    $hero = wx_hero_section($html);
    $tpl = strtolower(trim((string) ($in['tpl'] ?? 'keep')));
    if ($tpl !== 'keep' && !isset(WX_HERO_TEMPLATES[$tpl])) {
        throw ApiError::validation('Unknown hero template: "' . $tpl . '"', 'tpl');
    }
    if ($hero === null && $tpl === 'keep') {
        throw ApiError::validation('This page has no hero to edit — choose one of the designs instead.', 'tpl');
    }
    $before = $hero === null ? '' : $hero['body'];
    if ($tpl === 'keep') {
        $body = wx_hero_apply($before, wx_hero_updates($in));
        $out = substr($html, 0, $hero['start']) . $body . substr($html, $hero['end']);
        $how = 'edited in place';
        $family = $hero['family'];
    } else {
        $current = $hero === null ? wx_hero_blank() : wx_hero_fields($hero['body']);
        $fields = array_merge($current, wx_hero_updates($in));
        $fields['slides'] = is_array($in['slides'] ?? null) ? $in['slides'] : [];
        $fields['interval'] = (int) ($in['interval'] ?? 6);
        if ($fields['title'] === '') {
            throw ApiError::validation('A hero needs a title', 'title');
        }
        if (!in_array($tpl, ['plain', 'compact'], true) && trim((string) $fields['img']) === '') {
            throw ApiError::validation('This design needs a photo — pick one, or choose Plain cream or Compact band.', 'img');
        }
        $body = wx_hero_render($tpl, $fields, $rel);
        $out = $hero === null
            ? wx_hero_insert($html, $body)
            : substr($html, 0, $hero['start']) . $body . substr($html, $hero['end']);
        $out = wx_hero_one_h1($out);
        $how = 'switched to the ' . WX_HERO_TEMPLATES[$tpl][0] . ' design';
        $family = ['tpl-' . $tpl, 'Template: ' . WX_HERO_TEMPLATES[$tpl][0], WX_HERO_TEMPLATES[$tpl][1]];
    }
    if ($out === $html) {
        return ['rel' => $rel, 'url' => wx_page_url($rel), 'changed' => false, 'note' => 'Nothing changed — the page already reads that way.', 'family' => $family, 'tpl' => $tpl];
    }
    $write = wx_page_write($rel, $out, $me, ['note' => 'hero: ' . ($tpl === 'keep' ? 'edit' : $tpl)]);
    wx_audit($me, 'hero.save', $rel, ['how' => $how, 'template' => $tpl, 'bytes' => $write['bytes'], 'batch' => $write['batch']]);

    $fresh = wx_hero_section($out);
    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'changed' => true,
        'how' => $how,
        'family' => $fresh === null ? $family : $fresh['family'],
        'tpl' => $tpl,
        'fields' => $fresh === null ? [] : wx_hero_fields($fresh['body']),
        'bytes' => $write['bytes'],
        'version' => $write['version'],
        'batch' => $write['batch'],
    ];
}

/** Where a hero goes on a page that has none: right after `<main>`, where v2.1 put it. */
function wx_hero_insert(string $html, string $body): string
{
    if (preg_match('~<main\b[^>]*>~i', $html, $m, PREG_OFFSET_CAPTURE)) {
        $at = $m[0][1] + strlen($m[0][0]);
        return substr($html, 0, $at) . "\n" . $body . substr($html, $at);
    }
    if (preg_match('~<body\b[^>]*>~i', $html, $m, PREG_OFFSET_CAPTURE)) {
        $at = $m[0][1] + strlen($m[0][0]);
        return substr($html, 0, $at) . "\n" . $body . substr($html, $at);
    }
    throw ApiError::conflict('This page has neither a <main> nor a <body> to put a hero in.', ['rel' => '']);
}

/**
 * Save the home slider.
 *
 * The slides are edited **in place** wherever they already exist — so everything inside a slide that this
 * screen does not manage (the `data-page-route` hints the site's own script added, the pixel dimensions on
 * the photograph) survives the save — and rebuilt only when a slide is new. Order comes from the request,
 * and the first *showing* slide is the one that carries the `h1`, because that is the heading the page
 * offers a search engine.
 *
 * Writes `index.html` once, through the same page writer, so the whole slider is one change and one undo.
 */
function wx_hero_save_home(array $in, array $me): array
{
    $rel = WX_HERO_HOME;
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no home page at /' . $rel);
    }
    $html = (string) file_get_contents($abs);
    $hero = wx_hero_section($html);
    if ($hero === null) {
        throw ApiError::validation('The home page has no hero. Give it the slider design first — one slide is enough to start.', 'tpl');
    }
    $existing = wx_hero_slides($hero['body']);
    $incoming = is_array($in['slides'] ?? null) ? $in['slides'] : [];
    if (!$incoming) {
        throw ApiError::validation('A slider needs at least one slide', 'slides');
    }
    if (count($incoming) > 12) {
        throw ApiError::validation('A slider is at most 12 slides — beyond that nobody reaches the last one', 'slides');
    }
    $interval = max(2, min(30, (int) ($in['interval'] ?? 5)));

    $built = [];
    $showing = 0;
    foreach (array_values($incoming) as $s) {
        if (!is_array($s)) {
            continue;
        }
        $off = !empty($s['off']);
        if (!$off) {
            $showing++;
        }
        if (!$off && trim((string) ($s['title'] ?? '')) === '') {
            throw ApiError::validation('Every slide that shows needs a title', 'slides');
        }
    }
    if ($showing === 0) {
        throw ApiError::validation('At least one slide has to show — a slider nobody sees is a blank page', 'slides');
    }

    /* The slides block: everything between the slides container's opening tag and the controls. */
    $openPos = null;
    if (preg_match('~<(div|section)\b[^>]*(?:id="hm-slides"|class="[^"]*hm-slides)[^>]*>~i', $hero['body'], $m, PREG_OFFSET_CAPTURE)) {
        $openPos = $m[0][1] + strlen($m[0][0]);
    }
    if ($openPos === null && preg_match('~<(div|section)\b[^>]*(?:data-wxh-slides|class="[^"]*wxh-slides)[^>]*>~i', $hero['body'], $m, PREG_OFFSET_CAPTURE)) {
        $openPos = $m[0][1] + strlen($m[0][0]);
    }
    if ($openPos === null) {
        throw ApiError::conflict('This slider has no slide container, so there is nowhere to put the slides.', ['rel' => $rel]);
    }
    $closePos = null;
    $depth = 1;
    if (preg_match_all('~</?div\b[^>]*>~i', substr($hero['body'], $openPos), $m2, PREG_OFFSET_CAPTURE)) {
        foreach ($m2[0] as [$tag, $at]) {
            $depth += str_starts_with($tag, '</') ? -1 : 1;
            if ($depth === 0) {
                $closePos = $openPos + $at;
                break;
            }
        }
    }
    if ($closePos === null) {
        throw ApiError::conflict('This slider\'s slide container is not closed properly.', ['rel' => $rel]);
    }

    $out = [];
    $i = 0;
    foreach (array_values($incoming) as $s) {
        if (!is_array($s)) {
            continue;
        }
        $key = isset($s['i']) ? (int) $s['i'] : -1;
        $off = !empty($s['off']);
        $src = ($key >= 0 && isset($existing[$key])) ? $existing[$key]['html'] : null;
        if ($src !== null) {
            $src = wx_hero_apply($src, wx_hero_updates($s));   // refuses a field this slide has no place for
            $src = wx_hero_slide_text($src, ['word' => (string) ($s['word'] ?? ''), 'm1' => (string) ($s['m1'] ?? ''), 'm2' => (string) ($s['m2'] ?? '')]);
            $src = wx_hero_slide_toggle($src, $off);
            $src = wx_hero_slide_head($src, $i === 0);
            $src = wx_hero_slide_index($src, $i);
        } else {
            $src = wx_hero_build_slide($s, $i, $i === 0);
        }
        $out[] = $src;
        $i++;
    }
    $block = implode('', $out) . "\n      ";
    $body = substr($hero['body'], 0, $openPos) . $block . substr($hero['body'], $closePos);

    /* The dots: one per showing slide. Rebuilt, because a dot is not an article and nothing in it is
       worth preserving. */
    $showingSlides = [];
    foreach (array_values($incoming) as $s) {
        if (is_array($s) && empty($s['off'])) {
            $showingSlides[] = $s;
        }
    }
    $dots = wx_hero_dots($showingSlides, 'hm-slider-dot', 'data-home-dot', 'hm-slider-dots');
    if (preg_match('~<div class="hm-slider-dots"[^>]*>.*?</div>~is', $body, $m3, PREG_OFFSET_CAPTURE)) {
        $body = substr($body, 0, $m3[0][1]) . $dots . substr($body, $m3[0][1] + strlen($m3[0][0]));
    } elseif (preg_match('~<div class="wxh-dots"[^>]*>.*?</div>~is', $body, $m4, PREG_OFFSET_CAPTURE)) {
        $body = substr($body, 0, $m4[0][1]) . wx_hero_dots($showingSlides, 'wxh-dot', 'data-wxh-dot', 'wxh-dots') . substr($body, $m4[0][1] + strlen($m4[0][0]));
    }

    /* The interval, on the section — replacing whatever was there, adding it if it never was. */
    $body = preg_replace('~\sdata-interval\s*=\s*"\d+"~i', '', $body);
    $body = preg_replace('~^<section([^>]*)>~i', '<section$1 data-interval="' . $interval . '">', $body, 1);

    $next = substr($html, 0, $hero['start']) . $body . substr($html, $hero['end']);
    $next = wx_hero_one_h1($next);
    if ($next === $html) {
        return ['rel' => $rel, 'changed' => false, 'note' => 'Nothing changed — the slider already reads that way.', 'slides' => $showing, 'interval' => $interval];
    }
    $write = wx_page_write($rel, $next, $me, ['note' => 'home slider: ' . $showing . ' slide(s)']);
    wx_audit($me, 'hero.home', $rel, ['slides' => $showing, 'interval' => $interval, 'bytes' => $write['bytes'], 'batch' => $write['batch']]);

    $fresh = wx_hero_section($next);
    $read = $fresh === null ? ['slides' => [], 'interval' => $interval] : wx_hero_read_home($fresh['body']);
    return [
        'rel' => $rel, 'url' => '/', 'changed' => true,
        'slides' => count($read['slides']), 'showing' => $showing, 'interval' => $read['interval'],
        'bytes' => $write['bytes'], 'version' => $write['version'], 'batch' => $write['batch'],
        'read' => $read['slides'],
    ];
}

/** The three fields that only a slider has: the big word and the two info lines. */
function wx_hero_slide_text(string $slide, array $values): string
{
    $edits = [];
    if (($w = wx_hero_tag_span($slide, '~<(?P<tag>strong)\b[^>]*>~i')) !== null && array_key_exists('word', $values)) {
        $now = wx_hero_text($slide, [$w['openEnd'], $w['closeStart']]);
        if ($now !== trim((string) $values['word'])) {
            $edits[] = [$w['openEnd'], $w['closeStart'], wx_hero_esc(trim((string) $values['word']))];
        }
    }
    $spans = [];
    $at = 0;
    while (($sp = wx_hero_tag_span($slide, '~<(?P<tag>span)\b[^>]*>~i', $at)) !== null) {
        $at = $sp['closeEnd'];
        $spans[] = [$sp['openEnd'], $sp['closeStart']];
    }
    foreach ([['m1', 0], ['m2', 1]] as [$k, $idx]) {
        if (!array_key_exists($k, $values) || !isset($spans[$idx])) {
            continue;
        }
        $now = wx_hero_text($slide, $spans[$idx]);
        if ($now !== trim((string) $values[$k])) {
            $edits[] = [$spans[$idx][0], $spans[$idx][1], wx_hero_esc(trim((string) $values[$k]))];
        }
    }
    usort($edits, static fn($a, $b) => $b[0] <=> $a[0]);
    foreach ($edits as [$start, $end, $replacement]) {
        $slide = substr($slide, 0, $start) . $replacement . substr($slide, $end);
    }
    return $slide;
}

/** First slide gets the `h1` and the id it is labelled by; the rest are `h2`. */
function wx_hero_slide_head(string $slide, bool $first): string
{
    if ($first) {
        $slide = preg_replace('~<h2 class="hm-hero-title">~', '<h1 class="hm-hero-title" id="home-hero-title">', $slide, 1);
        $slide = str_replace('</h2>', '</h1>', $slide);
        /* `aria-hidden` follows, because it is the same statement to a different reader: this is the slide
           that is showing, and its heading is what the page is about. */
        $slide = str_replace('aria-hidden="true"', 'aria-hidden="false"', $slide);
        return preg_replace('~<article class="hm-slide(?! is-active)~', '<article class="hm-slide is-active', $slide, 1);
    }
    $slide = preg_replace('~<h1 class="hm-hero-title" id="home-hero-title">~', '<h2 class="hm-hero-title">', $slide, 1);
    $slide = str_replace('</h1>', '</h2>', $slide);
    $slide = preg_replace('~<article class="hm-slide is-active~', '<article class="hm-slide', $slide, 1);
    return str_replace('aria-hidden="false"', 'aria-hidden="true"', $slide);
}

/** Keep each slide's index in step with its position, since the site's script navigates by it. */
function wx_hero_slide_index(string $slide, int $i): string
{
    return preg_replace('~(data-home-slide\s*=\s*")[^"]*(")~i', '${1}' . $i . '${2}', $slide, 1) ?? $slide;
}

/** An entire small document, for the gallery's iframe: a design on the stylesheet the live pages load. */
function wx_hero_preview(string $tpl, ?string $rel = null): string
{
    $f = wx_hero_sample();
    if ($tpl === 'slider') {
        $two = $f;
        $two['title'] = 'Workplaces that work';
        $two['kicker'] = 'Commercial · Lahore';
        $two['img'] = '/assets/img/img-1d6ad6c77d0f.webp';
        $f['slides'] = [$f, $two];
    }
    $body = wx_hero_render($tpl, $f, $rel ?? 'services/demo/index.html');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<link rel="stylesheet" href="/assets/site.css"><style>body{margin:0}</style></head><body>' . $body . '</body></html>';
}
