<?php
/**
 * api/v2/lib/theme.php — the site's theme: v2.1's builder settings, applied to the file the live site reads.
 *
 * v2.1's builder wrote `assets/theme.css` and every page linked it. **This site has no such file**: the live
 * pages load `/assets/site.css` and nothing else, and `:root` there holds the tokens the whole design is
 * drawn from. So the port keeps the *design surface* — the exact list of variables the Theme screen has
 * always offered, with the exact validation it has always used — and changes only where the values land:
 * a marked block inside the stylesheet the site actually loads.
 *
 * Two marked blocks, both additive and both removable:
 *
 *   • at the very top, the Google Fonts `@import` — it is only valid before any rule, so it cannot live in
 *     the block at the end;
 *   • at the end, the chosen custom properties, the aliases that map this stylesheet's own token names onto
 *     them, and the three rules v2.1 emitted for type size and font family.
 *
 * Consequences worth stating, because they are the reason for the design:
 *
 *   • A theme change is a *diff of a few dozen lines*, so the version store shows what changed rather than
 *     a regenerated file nobody can review.
 *   • Every version is a normal entry in `wx_page_versions` keyed by `assets/site.css`, so the one undo
 *     story — history, batches, rollback — covers the theme as well as the pages.
 *   • Clearing every setting removes the blocks and the site is back to its own tokens, byte for byte.
 *   • A marker with no matching end marker is refused, never guessed at: a half-written block is how a
 *     stylesheet stops parsing.
 *
 * `--wx-preset` is stored but never emitted, as in v2.1, and the record stays at `_private/theme.json`
 * because the v2.1 builder reads that file too — during the cut-over both screens must see one truth.
 */

declare(strict_types=1);

/** The file the live site loads, and the only file this module writes. */
const WX_THEME_FILE = 'assets/site.css';

/** v2.1's record of the chosen values, at v2.1's path. */
const WX_THEME_RECORD = 'theme.json';

const WX_THEME_OPEN = '/* wx:theme:start */';
const WX_THEME_CLOSE = '/* wx:theme:end */';
const WX_THEME_IMPORT_OPEN = '/* wx:theme:import:start */';
const WX_THEME_IMPORT_CLOSE = '/* wx:theme:import:end */';

/**
 * The settings the Theme screen offers — v2.1's list, name for name and type for type.
 *
 * `to` is this stylesheet's own spelling of the same idea: v2.1's site aliased `--wx-*` onto its tokens in
 * the file it generated, so the values arrived at the design without the screen knowing its names. This
 * stylesheet is not generated, so the alias lines are emitted here instead, and this table is the whole of
 * that mapping. The tokens this site has that the theme has never touched — `WX_THEME_UNTOUCHED` — stay
 * exactly as they were; the screen says so rather than leaving the omission to be discovered.
 */
function wx_theme_tokens(): array
{
    return [
        '--wx-navy'      => ['type' => 'color', 'label' => 'Deep navy',   'to' => ['--navy', '--navy-2']],
        '--wx-ink'       => ['type' => 'color', 'label' => 'Ink',         'to' => ['--ink']],
        '--wx-muted'     => ['type' => 'color', 'label' => 'Muted text',  'to' => ['--muted']],
        '--wx-paper'     => ['type' => 'color', 'label' => 'Paper',       'to' => ['--paper']],
        '--wx-surface'   => ['type' => 'color', 'label' => 'Surface',     'to' => ['--surface']],
        '--wx-beige'     => ['type' => 'color', 'label' => 'Beige',       'to' => ['--beige']],
        '--wx-accent'    => ['type' => 'color', 'label' => 'Accent',      'to' => ['--accent']],
        '--wx-wood'      => ['type' => 'color', 'label' => 'Wood',        'to' => ['--wood', '--wood-2']],
        '--wx-cream'     => ['type' => 'color', 'label' => 'Cream',       'to' => ['--cream', '--surface', '--beige']],
        '--wx-c1'        => ['type' => 'color', 'label' => 'Chart 1',     'to' => ['--c1']],
        '--wx-c2'        => ['type' => 'color', 'label' => 'Chart 2',     'to' => ['--c2']],
        '--wx-c3'        => ['type' => 'color', 'label' => 'Chart 3',     'to' => ['--c3']],
        '--wx-c4'        => ['type' => 'color', 'label' => 'Chart 4',     'to' => ['--c4']],
        '--wx-font'      => ['type' => 'font',  'label' => 'Body font',   'to' => ['--font']],
        '--wx-font-head' => ['type' => 'font',  'label' => 'Heading font', 'to' => ['--font-head']],
        '--wx-base-size' => ['type' => 'len',   'label' => 'Base size',   'to' => []],
        '--wx-h1'        => ['type' => 'len',   'label' => 'H1 size',     'to' => []],
        '--wx-h2'        => ['type' => 'len',   'label' => 'H2 size',     'to' => []],
        '--wx-h3'        => ['type' => 'len',   'label' => 'H3 size',     'to' => []],
        '--wx-section'   => ['type' => 'len',   'label' => 'Section gap',  'to' => ['--section']],
        '--wx-container' => ['type' => 'len',   'label' => 'Container',   'to' => ['--container']],
        '--wx-btn-radius' => ['type' => 'len',  'label' => 'Button radius', 'to' => ['--btn-radius']],
        '--wx-r-lg'      => ['type' => 'len',   'label' => 'Large radius', 'to' => ['--r-lg']],
        '--wx-preset'    => ['type' => 'name',  'label' => 'Preset',      'to' => []],
    ];
}

/**
 * The tokens this site has that the theme deliberately does not touch.
 *
 * They are structure, not choice: the greys the borders and shadows are built from, the two radii that go
 * with them, and the easing curve. A theme screen that could move them would let a presale page break its
 * own hierarchy, and v2.1 never offered them. Listed so `GET /theme` can say what is outside the theme.
 */
function wx_theme_untouched(): array
{
    return ['--black', '--charcoal', '--silver', '--jet', '--light-gray', '--deep-gray', '--line', '--navy-line', '--shadow', '--r-xl', '--r-md', '--ease'];
}

/** The stacks a font may be set to without a download, as in v2.1. */
function wx_theme_fonts(): array
{
    return [
        'dm' => '"DM Sans",system-ui,sans-serif',
        'system' => 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
        'serif' => 'Georgia,"Times New Roman",serif',
        'mono' => 'ui-monospace,Consolas,monospace',
    ];
}

/**
 * The self-hosted families, as v2.1 listed them: [display name, file slug, fallback].
 *
 * Plus Jakarta Sans is the site's own body font and is already loaded by the stylesheet, so it is offered
 * but emits no `@font-face` — the same exception v2.1 made, for the same reason.
 */
function wx_theme_local(): array
{
    return [
        'jakarta' => ['Plus Jakarta Sans', 'plus-jakarta-sans', 'sans-serif'],
        'inter' => ['Inter', 'inter', 'sans-serif'],
        'manrope' => ['Manrope', 'manrope', 'sans-serif'],
        'poppins' => ['Poppins', 'poppins', 'sans-serif'],
        'playfair' => ['Playfair Display', 'playfair-display', 'serif'],
        'cormorant' => ['Cormorant Garamond', 'cormorant-garamond', 'serif'],
    ];
}

/**
 * Validate the submitted settings. v2.1's rules, value for value.
 *
 * The strictness is the point: this text ends up inside a `:root` block, so a value that is not a colour,
 * a length or a known font is a way to close the block and write arbitrary CSS. Every branch below is
 * v2.1's, and the refusal names the setting so the screen can point at the field.
 *
 * @return array{vars:array<string,string>,faces:string,import:string}
 */
function wx_theme_clean(array $vars): array
{
    $allowed = wx_theme_tokens();
    $fonts = wx_theme_fonts();
    $local = wx_theme_local();
    $clean = [];
    $faces = [];
    $imports = [];

    foreach ($vars as $key => $raw) {
        $key = trim((string) $key);
        if (!isset($allowed[$key])) {
            throw ApiError::validation('That is not a theme setting: ' . $key, 'vars');
        }
        $v = trim((string) $raw);
        if ($v === '') {
            continue; // An empty value clears the setting rather than writing an empty declaration.
        }
        $type = $allowed[$key]['type'];

        if ($type === 'color' && !preg_match('~^#[0-9a-f]{3,8}$~i', $v)) {
            throw ApiError::validation('Colours look like #1b2a3a: ' . $key, 'vars');
        }
        if ($type === 'name') {
            if (!preg_match('~^[a-z0-9-]{1,30}$~', $v)) {
                throw ApiError::validation('A preset name is letters, numbers and dashes: ' . $key, 'vars');
            }
            $clean[$key] = $v;
            continue;
        }
        if ($type === 'len' && !preg_match('~^\d{1,4}(\.\d+)?(px|rem|em|%)$~', $v)) {
            throw ApiError::validation('Sizes look like 18px, 1.1rem or 100%: ' . $key, 'vars');
        }
        if ($type === 'font') {
            if (preg_match('~^g:([A-Za-z0-9 ]{2,40}):([0-9;]{0,40})$~', $v, $g)) {
                /* A Google font is a family name and a weight list; the family goes into the import line,
                   and the value stored is the quoted family so the CSS never needs the `g:` form. */
                $family = trim($g[1]);
                $imports[] = str_replace(' ', '+', $family) . ($g[2] !== '' ? ':wght@' . $g[2] : '');
                $v = '"' . $family . '",system-ui,sans-serif';
            } elseif (isset($local[$v])) {
                [$name, $slug, $fallback] = $local[$v];
                if ($v !== 'jakarta') {
                    foreach ([400, 500, 600, 700] as $weight) {
                        /* Deduped by family, not by a substring of everything emitted so far: the v2.1
                           check could miss a family whose slug appeared inside another family's name. */
                        $faces[$slug . '-' . $weight] = '@font-face{font-family:"' . $name . '";src:url("/assets/fonts/'
                            . $slug . '-' . $weight . '.woff2") format("woff2");font-weight:' . $weight . ';font-display:swap}';
                    }
                }
                $v = '"' . $name . '",system-ui,' . $fallback;
            } elseif (!isset($fonts[$v])) {
                throw ApiError::validation('Pick one of the listed fonts (or a Google font as g:Family:400;700): ' . $key, 'vars');
            } else {
                $v = $fonts[$v];
            }
        }
        $clean[$key] = $v;
    }

    $head = '';
    if ($imports) {
        $head = '@import url("https://fonts.googleapis.com/css2?' . implode('&', array_map(
            static fn(string $f): string => 'family=' . $f,
            array_unique($imports)
        )) . '&display=swap");';
    }

    return ['vars' => $clean, 'faces' => implode("\n", $faces), 'import' => $head];
}

/**
 * The generated CSS, inside its markers.
 *
 * The alias lines are what makes a value arrive: `--navy:var(--wx-navy)` is how a chosen navy reaches the
 * stylesheet without this module rewriting a byte that a person wrote. Blocks are emitted only for the
 * settings that were supplied, as in v2.1 — a theme that sets the navy and nothing else changes the navy
 * and nothing else.
 *
 * Two lines differ from v2.1's output, both on purpose:
 *   • `--surface` is aliased to `--wx-surface` in the first line. v2.1 accepted a surface colour and then
 *     never used it unless a cream was also chosen — a setting that silently did nothing.
 *   • Every declaration carries the value it came from as a comment when the block is empty of it, so the
 *     read-back below can tell "chosen" from "the stylesheet's own".
 */
function wx_theme_block(array $vars, string $faces, string $import): string
{
    if (!$vars && $faces === '' && $import === '') {
        return '';
    }
    $tokens = wx_theme_tokens();
    $lines = [];
    foreach ($vars as $k => $v) {
        /* `--wx-preset` names the preset; it is not a value the design reads, so it stays out of the CSS —
           v2.1's generated sheet did not carry it either. It is kept in `_private/theme.json`. */
        if (($tokens[$k]['type'] ?? '') === 'name') {
            continue;
        }
        $lines[] = '  ' . $k . ':' . $v . ';';
    }
    $aliases = [];
    $map = static function (array $vars, string $wx, array $targets): array {
        if (!isset($vars[$wx])) {
            return [];
        }
        $out = [];
        foreach ($targets as $t) {
            $out[] = $t . ':var(' . $wx . ')';
        }
        return $out;
    };
    foreach ($tokens as $wx => $meta) {
        $aliases = array_merge($aliases, $map($vars, $wx, $meta['to']));
    }
    $rules = '';
    if (isset($vars['--wx-base-size'])) {
        $rules .= 'html{font-size:var(--wx-base-size)' . "}\n";
    }
    if (isset($vars['--wx-font'])) {
        $rules .= "body,button,input,select,textarea{font-family:var(--wx-font)!important}\n";
    }
    if (isset($vars['--wx-font-head'])) {
        $rules .= "main h1,main h2,main h3{font-family:var(--wx-font-head,var(--wx-font))}\n";
    }
    foreach (['h1', 'h2', 'h3'] as $h) {
        if (isset($vars['--wx-' . $h])) {
            $rules .= "main $h{font-size:var(--wx-$h)!important}\n";
        }
    }
    $out = WX_THEME_OPEN . "\n";
    if ($faces !== '') {
        $out .= $faces . "\n";
    }
    if ($lines) {
        $out .= ":root{\n" . implode("\n", $lines) . "\n}\n";
    }
    if ($aliases) {
        $out .= ':root{' . implode(';', $aliases) . "}\n";
    }
    $out .= $rules;
    $out .= WX_THEME_CLOSE . "\n";
    return $out;
}

/** True when the file is safe to edit: no marker without its partner. */
function wx_theme_balanced(string $css): bool
{
    foreach ([[WX_THEME_OPEN, WX_THEME_CLOSE], [WX_THEME_IMPORT_OPEN, WX_THEME_IMPORT_CLOSE]] as [$open, $close]) {
        if (substr_count($css, $open) !== substr_count($css, $close)) {
            return false;
        }
        if (substr_count($css, $open) > 1) {
            return false;
        }
    }
    return true;
}

/** Remove both marked blocks — everything this module ever wrote, and nothing else. */
function wx_theme_strip(string $css): string
{
    /* Each block is removed together with the newline that follows it, because that newline is part of what
       wx_theme_apply() added. What is left is the file exactly as whoever wrote it left it — which is what
       "remove the theme" has to mean for a stylesheet that is edited by hand as well as through the admin. */
    $css = (string) preg_replace('~\/\* wx:theme:import:start \*\/.*?\/\* wx:theme:import:end \*\/\n~s', '', $css);
    $css = (string) preg_replace('~\/\* wx:theme:start \*\/.*?\/\* wx:theme:end \*\/~s', '', $css);
    return rtrim($css, "\n") . "\n";
}
/**
 * Apply settings to a stylesheet: strip whatever this module wrote last time, then append the new blocks.
 *
 * Stripping first is what makes the write idempotent and the diff small — applying the same settings twice
 * leaves the file identical, so a saved form with no edits writes nothing and creates no version.
 */
function wx_theme_apply(string $css, array $clean): string
{
    $bare = wx_theme_strip($css);
    $block = wx_theme_block($clean['vars'], (string) $clean['faces'], (string) $clean['import']);
    if ($block === '') {
        return $bare;
    }
    $head = $clean['import'] !== ''
        ? WX_THEME_IMPORT_OPEN . "\n" . $clean['import'] . "\n" . WX_THEME_IMPORT_CLOSE . "\n"
        : '';
    $tail = rtrim($bare) . "\n\n" . $block;
    return $head . $tail;
}

/** The settings currently written into a stylesheet — what the site is actually using right now. */
function wx_theme_vars(string $css): array
{
    if (!preg_match('~/\* wx:theme:start \*/(.*?)/\* wx:theme:end \*/~s', $css, $m)) {
        return [];
    }
    $vars = [];
    if (preg_match_all('~\s(--wx-[a-z0-9-]+)\s*:\s*([^;}]+);~', $m[1], $mm, PREG_SET_ORDER)) {
        foreach ($mm as $row) {
            $vars[$row[1]] = trim($row[2]);
        }
    }
    return $vars;
}

/** What a stylesheet is, for a screen that has to say whether it is looking at the file or a copy. */
function wx_theme_meta(string $css): array
{
    return [
        'bytes' => strlen($css),
        'sha' => sha1($css),
        'lines' => substr_count($css, "\n") + 1,
        'theme' => wx_theme_vars($css) !== [],
        'markers' => wx_theme_balanced($css),
    ];
}

/** The stylesheet as it is on disk, or null when the site has no such file. */
function wx_theme_read(): ?string
{
    $abs = WX_SITE_ROOT . '/' . WX_THEME_FILE;
    return is_file($abs) ? (string) file_get_contents($abs) : null;
}

/** v2.1's record: the chosen values, at v2.1's path, in v2.1's shape. */
function wx_theme_record(): array
{
    $f = WX_PRIVATE_DIR . '/' . WX_THEME_RECORD;
    if (!is_file($f)) {
        return [];
    }
    $vars = json_decode((string) file_get_contents($f), true);
    return is_array($vars) ? $vars : [];
}

function wx_theme_record_write(array $vars): void
{
    $f = WX_PRIVATE_DIR . '/' . WX_THEME_RECORD;
    if (!is_dir(dirname($f))) {
        @mkdir(dirname($f), 0755, true);
    }
    /* Small, single write, and the v2.1 builder reads it too — one file, one truth during the cut-over. */
    @file_put_contents($f, (string) json_encode($vars, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

/**
 * Write a theme.
 *
 * The order is the same as every other write in this API: snapshot what is there, put the new bytes in a
 * temporary file in the same directory, rename. A reader either sees the whole block or none of it.
 *
 * `$expect` is the file time the screen loaded, and `$force` is the person saying "yes, overwrite the newer
 * file". The stylesheet is edited by hand as well as through this API, so two people — or one person and a
 * deploy — can be looking at different files; without the guard the second save silently discards the first.
 *
 * @return array{changed:bool,vars:array<string,string>,version:int,bytes:int,meta:array<string,mixed>}
 */
function wx_theme_write(array $vars, array $me, string $note = '', int $expect = 0, bool $force = false): array
{
    $abs = WX_SITE_ROOT . '/' . WX_THEME_FILE;
    if (!is_file($abs)) {
        throw ApiError::internal('The site stylesheet is missing, so there is nothing to theme: ' . WX_THEME_FILE);
    }
    $disk = (int) @filemtime($abs);
    if (!$force && $expect > 0 && $disk > $expect) {
        throw ApiError::conflict(
            'The stylesheet changed on the server since this screen loaded it (server time '
            . gmdate('Y-m-d H:i:s', $disk) . '). Reload it, or apply anyway to replace what is there.',
            ['mtime' => $expect, 'serverMtime' => $disk, 'file' => WX_THEME_FILE]
        );
    }
    $css = (string) file_get_contents($abs);
    if (!wx_theme_balanced($css)) {
        throw ApiError::conflict(
            'assets/site.css has a theme marker with no matching end marker, so the block cannot be replaced safely. '
            . 'Fix the stylesheet by hand first — guessing where a block ends is how a stylesheet stops parsing.'
        );
    }
    $clean = wx_theme_clean($vars);
    $out = wx_theme_apply($css, $clean);
    $stored = $clean['vars'];
    /* The record keeps the raw choice, including the preset, exactly as v2.1 stored it. */
    wx_theme_record_write($stored);
    if ($out === $css) {
        return [
            'changed' => false,
            'vars' => $stored,
            'version' => 0,
            'bytes' => strlen($css),
            'meta' => wx_theme_meta($css),
        ];
    }
    $version = wx_page_snapshot(WX_THEME_FILE, $me, $note !== '' ? $note : 'theme change', null, $css);
    $tmp = $abs . '.wx' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $out, LOCK_EX) === false) {
        throw ApiError::internal('Could not write ' . WX_THEME_FILE . ' — is the site folder writable by the web server?');
    }
    if (!@rename($tmp, $abs)) {
        @unlink($tmp);
        throw ApiError::internal('Could not replace ' . WX_THEME_FILE);
    }
    @chmod($abs, 0644);
    wx_audit($me, 'theme.save', WX_THEME_FILE, [
        'vars' => array_keys($stored),
        'before' => strlen($css),
        'after' => strlen($out),
        'version' => $version,
        'note' => $note,
    ]);
    return [
        'changed' => true,
        'vars' => $stored,
        'version' => $version,
        'bytes' => strlen($out),
        'meta' => wx_theme_meta($out),
    ];
}

/** The theme's own history: the same version store every page uses, filtered to the stylesheet. */
function wx_theme_history(int $limit = 10): array
{
    $rows = wx_all(
        'SELECT id, bytes, note, created_at, created_by_name FROM wx_page_versions WHERE rel = ? ORDER BY id DESC LIMIT ' . max(1, min(50, $limit)),
        [WX_THEME_FILE]
    );
    return array_map(static fn(array $r): array => [
        'id' => (int) $r['id'],
        'bytes' => (int) $r['bytes'],
        'note' => (string) ($r['note'] ?? ''),
        'at' => (string) $r['created_at'],
        'by' => (string) ($r['created_by_name'] ?? ''),
    ], $rows);
}

/**
 * What the Theme screen needs: the settings the site is using, the settings somebody chose, and the file
 * both of those live in.
 *
 * `chosen` comes from `_private/theme.json` (v2.1's record) and `live` is read back out of the stylesheet.
 * They can disagree — a hand-edited stylesheet, a file restored from a backup, a v2.1 builder that wrote
 * before this admin existed — and a screen that showed only one of them would be confidently wrong.
 */
function wx_theme_state(): array
{
    $css = wx_theme_read();
    $live = $css === null ? [] : wx_theme_vars($css);
    $chosen = wx_theme_record();
    $allowed = wx_theme_tokens();
    $tokens = [];
    foreach ($allowed as $name => $meta) {
        $tokens[] = [
            'name' => $name,
            'type' => $meta['type'],
            'label' => $meta['label'],
            'targets' => $meta['to'],
            'chosen' => (string) ($chosen[$name] ?? ''),
            'live' => (string) ($live[$name] ?? ''),
        ];
    }
    /* Drift compares the values that reach the design. The preset is a name for the file rather than a
       value in it, so it is in the record and not in the stylesheet — comparing it would leave the screen
       permanently claiming the file and the choice disagree. */
    $emitted = static function (array $vars) use ($allowed): array {
        return array_filter($vars, static fn(string $k): bool => ($allowed[$k]['type'] ?? '') !== 'name', ARRAY_FILTER_USE_KEY);
    };
    return [
        'file' => WX_THEME_FILE,
        'exists' => $css !== null,
        'meta' => $css === null ? null : wx_theme_meta($css) + [
            /* Both spellings of the same instant: the epoch is what the screen sends back with a save (so
               the old file can refuse to be overwritten by a stale form), the text is what a person reads. */
            'mtime' => gmdate('Y-m-d H:i:s', (int) @filemtime(WX_SITE_ROOT . '/' . WX_THEME_FILE)),
            'mtimeEpoch' => (int) @filemtime(WX_SITE_ROOT . '/' . WX_THEME_FILE),
        ],
        'chosen' => $chosen,
        'live' => $live,
        'drift' => $emitted($chosen) !== $emitted($live),
        'tokens' => $tokens,
        'untouched' => wx_theme_untouched(),
        'fonts' => wx_theme_fonts(),
        'local' => wx_theme_local(),
        'history' => wx_theme_history(),
    ];
}

/**
 * Put a version back.
 *
 * Like the pages, this reads a version out of the store and writes its bytes as a *new* version — so
 * undoing the undo is another rollback, and no version is ever destroyed.
 */
function wx_theme_rollback(int $versionId, array $me): array
{
    $v = wx_one('SELECT * FROM wx_page_versions WHERE id = ? AND rel = ?', [$versionId, WX_THEME_FILE]);
    if ($v === null) {
        throw ApiError::notFound('That version of the stylesheet is not in the history');
    }
    $abs = WX_SITE_ROOT . '/' . WX_THEME_FILE;
    if (!is_file($abs)) {
        throw ApiError::internal('The site stylesheet is missing: ' . WX_THEME_FILE);
    }
    $current = (string) file_get_contents($abs);
    $html = (string) $v['html'];
    $newId = wx_page_snapshot(WX_THEME_FILE, $me, 'before rolling back to version #' . $versionId, null, $current);
    $tmp = $abs . '.wx' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $html, LOCK_EX) === false || !@rename($tmp, $abs)) {
        @unlink($tmp);
        throw ApiError::internal('Could not restore ' . WX_THEME_FILE);
    }
    @chmod($abs, 0644);
    wx_theme_record_write(wx_theme_vars($html));
    wx_audit($me, 'theme.rollback', WX_THEME_FILE, ['version' => $versionId, 'saved' => $newId]);
    return [
        'rolledBackTo' => $versionId,
        'saved' => $newId,
        'vars' => wx_theme_vars($html),
        'meta' => wx_theme_meta($html),
    ];
}
