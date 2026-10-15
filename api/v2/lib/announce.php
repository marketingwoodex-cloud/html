<?php
/**
 * api/v2/lib/announce.php — the thin bar above the header, on every page.
 *
 * v2.1 kept this in one file, `assets/announce.json`, which is exactly the right place: the site's own
 * JavaScript fetches it and builds the bar in the browser, so nothing has to be rewritten on the 150
 * pages and switching it off is one byte. What was wrong was everything around it —
 *
 *   · the write was `file_put_contents(…, LOCK_EX)`, which truncates before it locks: a visitor loading
 *     a page in that window fetches a half-written file and the bar silently does not appear;
 *   · a save that changed nothing still bumped `v`, and because the version is what marks a bar as
 *     "already dismissed, do not show this one again", re-saving the same sentence showed it again to
 *     everybody who had closed it;
 *   · a bad link or a 200-character sentence was silently clipped instead of being refused, so the
 *     screen said "saved" about something that was not what the operator typed.
 *
 * The store here is the same file, through the atomic JSON store the rest of the console uses, and the
 * record is validated by field with the refusal naming the field. `wx_ann_site_ready()` answers the
 * question the screen cannot see for itself: does the site this console is pointed at actually carry
 * the code that draws the bar? It is a two-file check because the answer used to be no — the bar's
 * script and styles reached v2.1's copy of the site and never made it into the pages this console
 * serves — and a switch that turns on nothing is the failure this whole phase is about.
 */

declare(strict_types=1);

/** The file the site fetches. Public on purpose: it is read by the browser, not by PHP. */
const WX_ANN_REL = 'assets/announce.json';

/** The class the script adds to the bar, and the file it is loaded from. Both are checked at read time. */
const WX_ANN_MARK = 'wx-ann';
const WX_ANN_SCRIPT = 'assets/site.js';
const WX_ANN_STYLE = 'assets/site.css';

/** The three colours the screen offers. `navy` is the default and the fallback in the stylesheet. */
const WX_ANN_STYLES = ['navy', 'wood', 'cream'];

/** Field limits, in characters — v2.1's own numbers. */
const WX_ANN_TEXT_MAX = 160;
const WX_ANN_LINK_MAX = 300;
const WX_ANN_LINK_TEXT_MAX = 40;

/**
 * What the site draws when the file is missing or has never been saved. `v` is the version: it is the
 * cache-buster in the fetch and the key under which a visitor's *dismissal* is remembered, so it moves
 * only when the announcement itself changes.
 */
const WX_ANN_DEF = ['on' => false, 'text' => '', 'link' => '', 'linkText' => '', 'style' => 'navy', 'v' => 0];

/** A link a browser can follow safely: a path, https, a phone number or an email. v2.1's rule. */
const WX_ANN_LINK_RE = '~^(/[^\s"<>]*|https://[^\s"<>]+|tel:\+?[0-9 ]+|mailto:[^\s"<>]+)$~';

/** The file's absolute path. */
function wx_ann_path(): string
{
    return WX_SITE_ROOT . '/' . WX_ANN_REL;
}

/**
 * The store. Public mode 0644: the web server reads this one, unlike everything in `_private`.
 *
 * `optional` is true because the file not existing yet is the normal state of a site that has never
 * shown an announcement — it is not an error, and the read below turns it into the defaults.
 */
function wx_ann_store(): JsonStore
{
    return new JsonStore(wx_ann_path(), true, 0644);
}

/** Whether anything has ever been saved. The screen says "nothing has been saved yet" rather than "off". */
function wx_ann_exists(): bool
{
    return is_file(wx_ann_path());
}

/**
 * The announcement as stored, over the defaults.
 *
 * A damaged file raises (from the store) rather than reading as "off": a bar that is on cannot be
 * reported as off to the one person who could fix it. The screen shows the store's own message.
 */
function wx_ann_read(): array
{
    $raw = wx_ann_store()->read();
    $out = WX_ANN_DEF;
    foreach (WX_ANN_DEF as $k => $def) {
        if (!array_key_exists($k, $raw)) {
            continue;
        }
        $out[$k] = $k === 'on' ? (bool) $raw[$k] : ($k === 'v' ? (int) $raw[$k] : (string) $raw[$k]);
    }
    return $out;
}

/**
 * Validate one announcement and stamp it. Pure: no disk, no clock of its own — `$now` is passed in so a
 * test can pin the version.
 *
 * @param array      $in   what the screen sent: on, text, link, linkText, style
 * @param array|null $prev the record being replaced, so the version only moves when the bar changed
 */
function wx_ann_clean(array $in, array $prev = null, int $now = 0): array
{
    $now = $now > 0 ? $now : time();
    $prev = $prev === null ? WX_ANN_DEF : array_merge(WX_ANN_DEF, $prev);

    $on = !empty($in['on']);
    $text = wx_v_string($in['text'] ?? '', 'text', 0, WX_ANN_TEXT_MAX);
    $link = wx_v_string($in['link'] ?? '', 'link', 0, WX_ANN_LINK_MAX);
    $linkText = wx_v_string($in['linkText'] ?? '', 'linkText', 0, WX_ANN_LINK_TEXT_MAX);

    /* v2.1's two refusals, in its own words, because they are the two mistakes that produce a bar
       nobody can use: no words, or a link that is not a link. */
    if ($on && $text === '') {
        throw ApiError::validation('Write the announcement text', 'text');
    }
    if ($link !== '' && !preg_match(WX_ANN_LINK_RE, $link)) {
        throw ApiError::validation('The link must start with /, https://, tel: or mailto:', 'link');
    }

    /* A style that was not sent at all falls back to navy, as v2.1 did; one that was sent and is not one
       of the three is refused rather than quietly rewritten — the screen offers three and nothing else. */
    $style = WX_ANN_DEF['style'];
    if (array_key_exists('style', $in) && (string) $in['style'] !== '') {
        $style = wx_v_enum($in['style'], WX_ANN_STYLES, 'style');
    } elseif ((string) ($prev['style'] ?? '') !== '' && in_array((string) $prev['style'], WX_ANN_STYLES, true)) {
        $style = (string) $prev['style'];
    }

    $out = ['on' => $on, 'text' => $text, 'link' => $link, 'linkText' => $linkText, 'style' => $style, 'v' => (int) $prev['v']];

    /* The version moves only when the announcement did, and never collides with itself: two saves in
       the same second still produce two different versions, so a dismissal of the first cannot hide the
       second. */
    $changed = false;
    foreach (['on', 'text', 'link', 'linkText', 'style'] as $k) {
        if ($out[$k] !== $prev[$k]) {
            $changed = true;
            break;
        }
    }
    if ($changed || $out['v'] <= 0) {
        $out['v'] = max($now, (int) $prev['v'] + 1);
    }
    return $out;
}

/**
 * Save one announcement. Read-modify-write under one lock, through the atomic store, so a page fetched
 * during a save gets the old file or the new one — never half of either.
 */
function wx_ann_save(array $in, int $now = 0): array
{
    $saved = null;
    wx_ann_store()->update(static function (array $current) use ($in, $now, &$saved): array {
        $saved = wx_ann_clean($in, $current, $now);
        return $saved;
    });
    return $saved ?? wx_ann_read();
}

/** Does the shipped file carry the bar's code? Chunked, so a 700 KB stylesheet is not read to find out. */
function wx_ann_file_has(string $rel, string $needle = WX_ANN_MARK): bool
{
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        return false;
    }
    $fh = @fopen($abs, 'rb');
    if ($fh === false) {
        return false;
    }
    $carry = '';
    $found = false;
    while (!feof($fh)) {
        $chunk = (string) fread($fh, 262144);
        if ($chunk === '') {
            break;
        }
        /* The previous chunk's tail is kept: a marker split across two reads is still a marker. */
        if (str_contains($carry . $chunk, $needle)) {
            $found = true;
            break;
        }
        $carry = substr($chunk, -64);
    }
    fclose($fh);
    return $found;
}

/**
 * Whether the site can draw the bar at all: the script that fetches it and the stylesheet that dresses
 * it. Both are checked because both were missing from the pages this console serves.
 *
 * @return array{script:bool,style:bool,ready:bool,scriptFile:string,styleFile:string}
 */
function wx_ann_site_ready(): array
{
    $script = wx_ann_file_has(WX_ANN_SCRIPT);
    $style = wx_ann_file_has(WX_ANN_STYLE);
    return [
        'script' => $script,
        'style' => $style,
        'ready' => $script && $style,
        'scriptFile' => WX_ANN_SCRIPT,
        'styleFile' => WX_ANN_STYLE,
    ];
}

/**
 * How many public pages load the script. "Every page" is the promise the bar makes, and this is the
 * count that keeps it honest — a page without the script shows no bar however the switch is set.
 *
 * @return array{total:int,script:int}
 */
function wx_ann_pages(): array
{
    $total = 0;
    $withScript = 0;
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $total++;
        $html = (string) @file_get_contents(WX_SITE_ROOT . '/' . $rel);
        if (str_contains($html, WX_ANN_SCRIPT)) {
            $withScript++;
        }
    }
    return ['total' => $total, 'script' => $withScript];
}

/**
 * Everything the screen needs in one answer: the announcement, the three colours with their names, the
 * limits the fields enforce, the file it lives in, whether the site carries the code, and how many
 * pages load it.
 */
function wx_ann_state(): array
{
    return [
        'ann' => wx_ann_read(),
        'styles' => [
            ['id' => 'navy', 'label' => 'Navy'],
            ['id' => 'wood', 'label' => 'Wood / gold'],
            ['id' => 'cream', 'label' => 'Cream'],
        ],
        'limits' => ['text' => WX_ANN_TEXT_MAX, 'link' => WX_ANN_LINK_MAX, 'linkText' => WX_ANN_LINK_TEXT_MAX],
        'file' => WX_ANN_REL,
        'exists' => wx_ann_exists(),
        'site' => wx_ann_site_ready(),
        'pages' => wx_ann_pages(),
    ];
}
