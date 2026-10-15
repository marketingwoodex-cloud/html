<?php
/**
 * api/v2/lib/pageedit.php — writing a page's HTML, and the script rule that guards it.
 *
 * Two things live here, and they are the two things that made v2.1's builder safe enough to use:
 *
 * **1. The code guard.** v2.1's security audit (F-05) found that a Manager could paste a `<script>` into a
 * page through the builder, and since the builder *previews* pages inside the admin, that script would run
 * in an authenticated session. The fix, which this keeps, is not "sanitise the HTML" — pages are hand-written
 * and a sanitiser would quietly change them. It is a rule about *additions*:
 *
 *   · only the **owner** may add script, embeds or `on…=` handlers to a page;
 *   · anybody may *keep* what is already there — editing a page's headline must not require rewriting its
 *     analytics tag;
 *   · and anything already used somewhere else on the site is allowed for anybody, because a site-wide tag
 *     is the site's, not a privilege.
 *
 * The comparison is by *token*: the exact script block, the exact `onclick="…"`, the exact `javascript:`
 * URL. That is what makes "keep what is there" work — the tokens are compared against the version being
 * replaced, not against a list of dangerous patterns, so a page's own scripts never read as new.
 *
 * The tokens are read after decoding HTML entities and stripping whitespace, so `java&Tab;script:` and
 * `&#106;avascript:` are the same token as `javascript:` — the classic way a pattern-matching guard is
 * walked around.
 *
 * **2. The editor-marker rule.** The builder marked elements it was editing (`data-wx-ed`,
 * `contenteditable`). If a page is saved with those markers, the next person to open it in the admin edits
 * inside somebody else's half-finished session, and — worse — `contenteditable` is a live editing surface in
 * the browser. A save that carries them is refused.
 */

declare(strict_types=1);

/**
 * Every piece of *code* in a page: scripts, event handlers, script URLs and embeds.
 *
 * The list is deliberately narrow and exact — these are the things that execute or fetch. A `<style>` block
 * is not on it, an inline SVG is not on it, and neither is anything a page can be expected to contain.
 */
function wx_code_tokens(string $html): array
{
    $tokens = [];

    /* Closed script blocks. `application/ld+json` is data, not code — a page's structured data is not a
       privilege, and the whole schema.org block on the site is written by hand. */
    preg_match_all('~<script\b[^>]*>.*?</script\s*>~is', $html, $m);
    foreach ($m[0] as $x) {
        if (!preg_match('~^<script\b[^>]*type\s*=\s*["\']?application/ld\+json~i', $x)) {
            $tokens[] = (string) preg_replace('~\s+~', ' ', $x);
        }
    }
    /* A script tag that never closes is its own token: the browser will still run it, and it cannot be
       compared block-by-block. */
    preg_match_all('~<script\b(?![^>]*>.*?</script)~is', $html, $m2);
    foreach ($m2[0] as $x) {
        $tokens[] = '<script-unclosed>' . (string) preg_replace('~\s+~', ' ', mb_substr($x, 0, 120));
    }

    $decode = static function (string $v): string {
        $v = (string) preg_replace_callback(
            '~&#(?:x0*([0-9a-f]+)|0*([0-9]+));?~i',
            static fn($e) => mb_chr($e[1] !== '' ? (int) hexdec($e[1]) : (int) $e[2]),
            $v
        );
        return strtolower((string) preg_replace('~[\x00-\x20]+~', '', html_entity_decode(html_entity_decode($v, ENT_QUOTES | ENT_HTML5), ENT_QUOTES | ENT_HTML5)));
    };

    /* Only *inside* tags, and with comments removed: a paragraph that talks about `onclick` is text, and a
       page that mentions javascript: in a sentence must not read as code. */
    $tags = (string) preg_replace('~<!--.*?-->~s', '', $html);
    preg_match_all('~<[a-z][^>]*>~is', $tags, $found);
    foreach ($found[0] as $tag) {
        preg_match_all('~[\s/"\']on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)~i', $tag, $m);
        foreach ($m[0] as $x) {
            $tokens[] = trim((string) preg_replace('~\s+~', ' ', $x));
        }
        preg_match_all('~[\s/"\'](?:href|src|action|formaction|data|xlink:href|srcdoc|poster|background|cite|ping)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)~i', $tag, $m);
        foreach ($m[1] as $k => $v) {
            $d = $decode(trim($v, '"\''));
            if (preg_match('~^(javascript|vbscript|data:text/html|data:image/svg)~', $d) || preg_match('~<script|on[a-z]+=~', $d)) {
                $tokens[] = trim((string) preg_replace('~\s+~', ' ', (string) $m[0][$k]));
            }
        }
    }

    preg_match_all('~<(iframe|object|embed|base|frame|frameset)\b[^>]*>|<meta\b[^>]*http-equiv[^>]*>~i', $html, $m);
    foreach ($m[0] as $x) {
        $tokens[] = (string) preg_replace('~\s+~', ' ', $x);
    }

    return array_values(array_unique($tokens));
}

/** The code tokens in `$html` that are not in `$base` — what this edit would *add*. */
function wx_code_new_tokens(string $html, string $base): array
{
    return array_values(array_diff(wx_code_tokens($html), wx_code_tokens($base)));
}

/** Every code token used anywhere on the site, so a site-wide tag is nobody's privilege. */
function wx_site_code_tokens(): array
{
    $all = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $all = array_merge($all, wx_code_tokens((string) file_get_contents(WX_SITE_ROOT . '/' . $rel)));
    }
    return array_values(array_unique($all));
}

/**
 * Refuse an edit that adds code, unless the person making it is the owner.
 *
 * @param array $opt `siteTokens` lets a caller pass the site-wide tokens it already read (a screen saving
 *                   two pages should not walk the site twice); `skipFor` is the owner check.
 */
function wx_code_guard(string $html, string $base, string $role, array $opt = []): void
{
    if ($role === 'owner') {
        return;
    }
    $new = wx_code_new_tokens($html, $base);
    if (!$new) {
        return;
    }
    $site = $opt['siteTokens'] ?? wx_site_code_tokens();
    $new = array_values(array_diff($new, $site));
    if ($new) {
        /* The field is `html` because that is where the person has to look, and the first token is named in
           the message: "add code" is not actionable, "remove this script tag" is. `ApiError::forbidden()`
           takes no context bag, so the tokens travel in the sentence rather than being dropped. */
        $shown = array_slice($new, 0, 2);
        throw ApiError::forbidden(
            'Only the owner can add scripts, embeds or on…= event code to a page. '
            . count($new) . ' thing' . (count($new) === 1 ? '' : 's') . ' to remove: '
            . implode(' · ', array_map(static fn($t) => mb_substr((string) $t, 0, 90), $shown))
            . (count($new) > 2 ? ' …' : ''),
            'html'
        );
    }
}

/**
 * The rules a page's HTML has to pass before it is written.
 *
 * v2.1 checked three things, and all three are kept: the page is a complete document, it is not bigger than
 * the builder could handle (3 MB), and it does not carry the editor's own markers.
 */
function wx_page_html_ok(string $html, string $what = 'page'): void
{
    if (strlen($html) > 3 * 1024 * 1024) {
        throw ApiError::validation('That ' . $what . ' is larger than 3 MB', 'html');
    }
    if (stripos($html, '<html') === false || stripos($html, '</html>') === false) {
        throw ApiError::validation('A ' . $what . ' has to be a complete document, with <html> and </html> — a fragment would be published as a broken page', 'html');
    }
    if (preg_match('~<[^>]+\s(contenteditable|data-wx-ed)[\s=>]~i', $html)) {
        throw ApiError::validation(
            'That HTML still carries editor markers (contenteditable / data-wx-ed). Saving it would put an editable surface into a live page, and the next person would be editing inside your session.',
            'html'
        );
    }
}

/**
 * Save one page's HTML.
 *
 * The optimistic-concurrency rule is v2.1's and it is worth stating plainly: if the caller tells us when it
 * loaded the file and the file has changed since, the save is **refused** with a 409 unless `force` is set.
 * Without it, two people editing one page is a silent overwrite — and the person who loses is the one who
 * saved first, who sees their work disappear with no message anywhere.
 */
function wx_page_save_html(string $rel, string $html, array $me, string $role, array $opt = []): array
{
    $rel = wx_page_rel($rel);
    $abs = WX_SITE_ROOT . '/' . $rel;
    if (!is_file($abs)) {
        throw ApiError::notFound('There is no page at /' . $rel . ' — a new page is created first, then edited');
    }
    wx_page_html_ok($html);
    $current = (string) file_get_contents($abs);
    wx_code_guard($html, $current, $role, $opt);

    if (!empty($opt['mtime']) && !empty($opt['force']) === false) {
        $disk = (int) filemtime($abs);
        if ((int) $opt['mtime'] < $disk) {
            throw ApiError::conflict(
                'This page changed on the server since you opened it (' . gmdate('Y-m-d H:i:s', $disk) . '). Reload it and make your change again — or save again to replace what is there.',
                ['mtime' => (int) $opt['mtime'], 'serverMtime' => $disk]
            );
        }
    }

    $result = wx_page_write($rel, $html, $me, ['note' => (string) ($opt['note'] ?? 'edited in the admin')]);
    return [
        'rel' => $rel,
        'batch' => $result['batch'],
        'version' => $result['version'],
        'bytes' => $result['bytes'],
        'mtime' => (int) filemtime($abs),
        'title' => wx_page_title_of($html),
    ];
}

/**
 * Create a page that does not exist yet.
 *
 * The address rules are v2.1's `page_new`: lower-case letters, digits and dashes for the slug, a folder that
 * cannot escape the site, and the reserved folders refused. The HTML is the same bar as a save, and the code
 * guard compares against an empty page — a brand-new page has nothing to keep, so anything that executes in
 * it is an addition.
 */
function wx_page_new(string $folder, string $slug, string $html, array $me, string $role, array $opt = []): array
{
    $slug = strtolower(trim($slug));
    $folder = trim($folder, '/');
    if (!preg_match('~^[a-z0-9][a-z0-9-]{0,59}$~', $slug)) {
        throw ApiError::validation('The address is lower-case letters, numbers and dashes', 'slug');
    }
    if ($folder !== '' && (!preg_match('~^[a-z0-9][a-z0-9\-/]{0,79}$~', $folder) || str_contains($folder, '..'))) {
        throw ApiError::validation('That folder name is not usable', 'folder');
    }
    $rel = ($folder !== '' ? $folder . '/' : '') . $slug . '/index.html';
    $rel = wx_page_rel($rel);
    if (is_file(WX_SITE_ROOT . '/' . $rel)) {
        throw ApiError::conflict('There is already a page at /' . $rel, ['rel' => $rel]);
    }
    wx_page_html_ok($html);
    wx_code_guard($html, '', $role, $opt);

    $result = wx_page_write($rel, $html, $me, ['note' => (string) ($opt['note'] ?? 'new page')]);
    wx_audit($me, 'page.new', $rel, ['bytes' => $result['bytes'], 'batch' => $result['batch']]);
    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'batch' => $result['batch'],
        'version' => $result['version'],
        'bytes' => $result['bytes'],
        'title' => wx_page_title_of($html),
    ];
}
