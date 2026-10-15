<?php
/**
 * api/v2/lib/media.php — the pictures, their responsive copies, their alt text.
 *
 * Ported from `media-lib.php`, with the parts that decide *how a change is recorded* rewritten rather
 * than translated:
 *
 * · **Alt text is a table, and it has a queue.** "Which images have no alt text" is a question a person
 *   asks before a launch, and it is a query now (`wx_media_missing_alt()`). An image that was looked at
 *   and marked decorative is distinguishable from one nobody has opened, because the screen records the
 *   check separately from the text — otherwise everyone writes "decorative" into an empty field to make
 *   a number go down, and the accessibility work looks done while it is not.
 *
 * · **Deleting is a row, not a growing JSON blob.** The file moves to `_private/media-trash`, the row
 *   says where it came from, who removed it and why ('deleted' or 'replaced' — a replacement must not be
 *   restored over the new picture by accident).
 *
 * · **Every page rewrite goes through `wx_page_write()`.** v2.1 called `cms_file_backup()` and wrote the
 *   file. That kept a copy but no history: a srcset pass over 40 pages left 40 unrelated files and no way
 *   to reverse the pass as a unit. Here it is one batch, and the history screen can undo it.
 *
 * · **The usage check is one pass over the site, not one pass per image.** v2.1 re-read every page and
 *   stylesheet for every file in the listing — O(files × corpus), which is why the media screen felt
 *   slow. The corpus is read once into a haystack and each image is a substring search in it.
 *
 * What is deliberately unchanged: images are still converted and resized **in the browser** (canvas), so
 * the server needs no GD or Imagick — the hosting has neither, and this is the design that let the site
 * ship responsive images at all. The server's job is to store the derivatives it is handed.
 */

declare(strict_types=1);

const WX_MEDIA_DIRS = ['assets/img', 'assets/uploads'];
const WX_MEDIA_RS_W = [480, 960, 1600];
const WX_MEDIA_MAX = 8 * 1024 * 1024;          // one image, 8 MB
const WX_MEDIA_VARIANT_MAX = 3 * 1024 * 1024;  // one derivative, 3 MB
const WX_MEDIA_TRASH_DIR = WX_PRIVATE_DIR . '/media-trash';
const WX_MEDIA_EXT = 'webp|jpe?g|png|gif|svg|avif';

/** The only shape an image URL may have. Also the guard for anything that reaches the filesystem. */
function wx_media_ok($url): bool
{
    return is_string($url)
        && preg_match('~^/assets/(img|uploads)/([a-z0-9-]+/)?[a-z0-9][a-z0-9._-]*\.(' . WX_MEDIA_EXT . ')$~i', $url) === 1
        && !str_contains($url, '..');
}

/** What the bytes actually are — the extension is the uploader's opinion, this is not. */
function wx_media_sniff(string $b): ?string
{
    if (strncmp($b, "\xFF\xD8", 2) === 0) {
        return 'jpg';
    }
    if (strncmp($b, "\x89PNG", 4) === 0) {
        return 'png';
    }
    if (substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') {
        return 'webp';
    }
    if (substr($b, 0, 3) === 'GIF') {
        return 'gif';
    }
    /* AVIF is an ISO base media file: the brand is at bytes 8–12. The plan allows .avif in the library
       (the guard does), so an upload that is a real AVIF is accepted rather than refused for the file
       type the site already serves. */
    if (substr($b, 4, 4) === 'ftyp' && in_array(substr($b, 8, 4), ['avif', 'avis'], true)) {
        return 'avif';
    }
    return null;
}

/** The responsive copy for a width: `kitchen-1.webp` → `kitchen-1.w960.webp`. */
function wx_media_variant(string $url, int $w): string
{
    return (string) preg_replace('~\.[a-z0-9]+$~i', '', $url) . '.w' . $w . '.webp';
}

/** Which derivatives exist for an image. */
function wx_media_have(string $url): array
{
    $out = [];
    foreach (WX_MEDIA_RS_W as $w) {
        if (is_file(WX_SITE_ROOT . wx_media_variant($url, $w))) {
            $out[] = $w;
        }
    }
    return $out;
}

/** The P15-era copies (`name-960.webp`), still referenced by hand-written srcset attributes. */
function wx_media_legacy_have(string $url): array
{
    $out = [];
    $stem = (string) preg_replace('~\.[a-z0-9]+$~i', '', $url);
    foreach (WX_MEDIA_RS_W as $w) {
        if (is_file(WX_SITE_ROOT . $stem . '-' . $w . '.webp')) {
            $out[] = $w;
        }
    }
    return $out;
}

/** Is this absolute path one of those legacy copies, whose original is still beside it? */
function wx_media_is_legacy_copy(string $abs): bool
{
    if (!preg_match('~^(.*)-(480|960|1600)\.webp$~', $abs, $m)) {
        return false;
    }
    foreach (['webp', 'jpg', 'jpeg', 'png'] as $e) {
        if (is_file($m[1] . '.' . $e)) {
            return true;
        }
    }
    return false;
}

/** Absolute path of an image URL, refusing anything that is not inside assets/img or assets/uploads. */
function wx_media_path(string $url): string
{
    if (!wx_media_ok($url)) {
        throw ApiError::validation('Invalid image address', 'url');
    }
    $abs = WX_SITE_ROOT . $url;
    $root = realpath(WX_SITE_ROOT);
    $dir = realpath(dirname($abs));
    if ($root === false || $dir === false || !str_starts_with($dir, $root . '/')) {
        throw ApiError::validation('Invalid image address', 'url');
    }
    return $abs;
}

/**
 * One pass over everything that could reference an image, as a single string.
 *
 * Pages, the stylesheets and scripts that carry background images, and the values in `wx_settings` (the
 * company logo lives there). A JSON side-file is no longer in it: the alt map is a table now, and a
 * file that mentions an image is not "using" it.
 */
function wx_media_haystack(): string
{
    $h = '';
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $h .= (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
    }
    foreach (['assets/css', 'assets/js'] as $d) {
        foreach (glob(WX_SITE_ROOT . '/' . $d . '/*.{css,js}', GLOB_BRACE) ?: [] as $f) {
            $h .= (string) file_get_contents($f);
        }
    }
    foreach (wx_all('SELECT v FROM wx_settings') as $r) {
        $h .= (string) $r['v'];
    }
    return $h;
}

/** Does anything on the site mention this image? Returns the pages that do, by URL. */
function wx_media_used(string $url, ?string $hay = null): array
{
    $base = ltrim($url, '/');
    $name = basename($url);
    if ($hay === null) {
        $hay = wx_media_haystack();
    }
    if (!str_contains($hay, $base) && !(strlen($name) > 10 && str_contains($hay, $name))) {
        return [];
    }
    $hits = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        if (str_contains($html, $base) || (strlen($name) > 10 && str_contains($html, $name))) {
            $hits[] = $rel;
            if (count($hits) >= 8) {
                break;
            }
        }
    }
    return $hits;
}

/** Alt text by URL, and whether it has been looked at. */
function wx_media_alt_map(): array
{
    $out = [];
    foreach (wx_all('SELECT * FROM wx_media_alt') as $r) {
        $out[(string) $r['url']] = [
            'alt' => (string) $r['alt'],
            'checked' => $r['checked_at'] !== null,
            'at' => $r['updated_at'],
        ];
    }
    return $out;
}

/** Images with no alt text and no record of anyone looking at them. */
function wx_media_missing_alt(int $limit = 200): array
{
    $alt = wx_media_alt_map();
    $out = [];
    foreach (wx_media_scan() as $f) {
        $a = $alt[$f['url']] ?? null;
        if (($a['alt'] ?? '') !== '' || ($a['checked'] ?? false)) {
            continue;
        }
        $out[] = $f;
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/** Every image on disk, newest first, without the usage check — the listing and the queue share this. */
function wx_media_scan(): array
{
    $alt = wx_media_alt_map();
    $files = [];
    foreach (WX_MEDIA_DIRS as $d) {
        $dir = WX_SITE_ROOT . '/' . $d;
        if (!is_dir($dir)) {
            continue;
        }
        foreach (wx_media_walk($dir, '~\.(' . WX_MEDIA_EXT . ')$~i') as $abs) {
            if (preg_match('~\.w(480|960|1600)\.webp$~', $abs) || wx_media_is_legacy_copy($abs)) {
                continue; // derivatives are shown on their original, not as pictures in their own right
            }
            $url = '/' . ltrim(substr($abs, strlen(WX_SITE_ROOT)), '/');
            $sub = trim(dirname(substr($abs, strlen($dir))), '/.');
            $files[] = [
                'url' => $url,
                'name' => basename($abs),
                'folder' => $d === 'assets/img' ? 'site' : ($sub !== '' ? $sub : 'uploads'),
                'size' => (int) filesize($abs),
                'mtime' => gmdate('Y-m-d H:i:s', (int) filemtime($abs)),
                'alt' => $alt[$url]['alt'] ?? '',
                'checked' => $alt[$url]['checked'] ?? false,
                'sizes' => wx_media_have($url) ?: wx_media_legacy_have($url),
            ];
        }
    }
    usort($files, static fn($a, $b) => strcmp($b['mtime'], $a['mtime']));
    return $files;
}

function wx_media_walk(string $dir, string $re): array
{
    $out = [];
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '' || $f[0] === '.') {
            continue;
        }
        $abs = $dir . '/' . $f;
        if (is_dir($abs)) {
            $out = array_merge($out, wx_media_walk($abs, $re));
        } elseif (preg_match($re, $f)) {
            $out[] = $abs;
        }
    }
    return $out;
}

/**
 * The library screen: every image, which pages use it, which have alt text and which are waiting.
 *
 * @return array{files:array,folders:array,trash:int,missingAlt:int}
 */
function wx_media_list(): array
{
    $hay = wx_media_haystack();
    $files = [];
    foreach (wx_media_scan() as $f) {
        $f['used'] = wx_media_used($f['url'], $hay);
        $files[] = $f;
    }
    $folders = [];
    foreach (glob(WX_SITE_ROOT . '/assets/uploads/*', GLOB_ONLYDIR) ?: [] as $d) {
        $folders[] = basename($d);
    }
    sort($folders);
    return [
        'files' => $files,
        'folders' => $folders,
        'trash' => (int) wx_val('SELECT COUNT(*) FROM wx_media_trash'),
        'missingAlt' => count(wx_media_missing_alt(500)),
    ];
}

/** Create a folder under assets/uploads. Letters and digits only, like v2.1. */
function wx_media_folder(string $name): string
{
    $n = trim((string) preg_replace('~[^a-z0-9]+~', '-', strtolower($name)), '-');
    $n = substr($n, 0, 40);
    if ($n === '') {
        throw ApiError::validation('Folder name: letters and numbers', 'name');
    }
    $dir = WX_SITE_ROOT . '/assets/uploads/' . $n;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw ApiError::internal('Could not create the folder — is assets/uploads writable?');
    }
    return $n;
}

/**
 * Store an uploaded image.
 *
 * The name is rebuilt from the request rather than trusted: a file called `../../index.html` or
 * `logo.php.jpg` is a name, and this is the function that has to not care. Format comes from the bytes;
 * the size ceiling is applied to the decoded data, before it is written.
 *
 * @return array{url:string,bytes:int,ext:string}
 */
function wx_media_upload(string $data, string $name, string $folder, string $alt, array $me): array
{
    $raw = wx_media_b64($data);
    $ext = wx_media_sniff($raw);
    if ($ext === null) {
        throw ApiError::validation('Only JPG, PNG, WebP, GIF or AVIF images are allowed', 'data');
    }
    $folder = (string) preg_replace('~[^a-z0-9-]~', '', $folder);
    $dir = WX_SITE_ROOT . '/assets/uploads' . ($folder !== '' ? '/' . $folder : '');
    if ($folder !== '' && !is_dir($dir)) {
        throw ApiError::validation('Folder "' . $folder . '" does not exist — create it first', 'folder');
    }
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw ApiError::internal('Could not create assets/uploads');
    }
    $base = trim((string) preg_replace('~[^a-z0-9]+~', '-', (string) preg_replace('~\.[a-z0-9]+$~i', '', strtolower($name))), '-');
    $base = $base !== '' ? substr($base, 0, 40) : 'image';
    /* Six random hex characters: two people uploading "kitchen.jpg" at the same moment get two files,
       and neither can guess the other's address. */
    $file = $base . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
    if (@file_put_contents($dir . '/' . $file, $raw, LOCK_EX) === false) {
        throw ApiError::internal('Could not save the image');
    }
    @chmod($dir . '/' . $file, 0644);
    $url = '/assets/uploads/' . ($folder !== '' ? $folder . '/' : '') . $file;
    if (trim($alt) !== '') {
        wx_media_alt_save($url, $alt, false, $me);
    }
    return ['url' => $url, 'bytes' => strlen($raw), 'ext' => $ext];
}

/**
 * Replace an image in place, keeping its address.
 *
 * The format must stay the same. A page references `/assets/img/kitchen.webp`; answering that request
 * with PNG bytes because the content type said so is a broken image on somebody else's screen. The old
 * file goes to the trash first — so "put the old picture back" stays possible — and the derivatives are
 * dropped, because a 960 px WebP of the previous picture is worse than no derivative at all.
 *
 * @return array{url:string,before:int,after:int,pages:int,sizes:array}
 */
function wx_media_replace(string $url, string $data, array $me): array
{
    $abs = wx_media_path($url);
    if (!is_file($abs)) {
        throw ApiError::notFound('Image not found');
    }
    $raw = wx_media_b64($data);
    $ext = wx_media_sniff($raw);
    if ($ext === null) {
        throw ApiError::validation('Only JPG, PNG, WebP, GIF or AVIF images are allowed', 'data');
    }
    $current = str_replace('jpeg', 'jpg', strtolower(pathinfo($abs, PATHINFO_EXTENSION)));
    if ($current !== $ext) {
        throw ApiError::validation('The new file must be the same format (' . strtoupper($current) . ') — the pages point at .' . $current, 'data');
    }
    $before = (int) filesize($abs);
    wx_media_trash_put($url, $abs, 'replaced', $me);
    foreach (wx_media_have($url) as $w) {
        @unlink(WX_SITE_ROOT . wx_media_variant($url, $w));
    }
    if (@file_put_contents($abs, $raw, LOCK_EX) === false) {
        throw ApiError::internal('Could not write the new image');
    }
    @chmod($abs, 0644);
    /* `?v=` on every use: the address did not change, so without it a browser and a CDN keep serving the
       picture the visitor already has. */
    $pages = wx_media_bust($url, $me);
    return ['url' => $url, 'before' => $before, 'after' => strlen($raw), 'pages' => $pages, 'sizes' => []];
}

/**
 * Save the derivatives the browser rendered, and write the srcset into every page that shows the image.
 *
 * @param array<int|string,string> $files width ⇒ base64 WebP
 * @return array{sizes:array<int,int>,pages:int}
 */
function wx_media_sizes(string $url, int $originalWidth, array $files, array $me): array
{
    if (!wx_media_ok($url) || !preg_match('~\.(jpe?g|png|webp)$~i', $url) || preg_match('~\.w\d+\.webp$~', $url)) {
        throw ApiError::validation('Choose an original image (JPG, PNG or WebP)', 'url');
    }
    $abs = wx_media_path($url);
    if (!is_file($abs)) {
        throw ApiError::notFound('Image not found');
    }
    /* Drop what is there first: the browser sends the set it decided on, and a leftover 1600 px copy of
       the previous version would silently win the srcset. */
    foreach (wx_media_have($url) as $w) {
        @unlink(WX_SITE_ROOT . wx_media_variant($url, $w));
    }
    $originalWidth = max(1, $originalWidth);
    $made = [];
    foreach (WX_MEDIA_RS_W as $w) {
        if (!isset($files[(string) $w]) && !isset($files[$w])) {
            continue;
        }
        if ($w >= $originalWidth) {
            continue; // a "smaller" copy that is larger than the original is a lie in the srcset
        }
        $raw = wx_media_b64((string) ($files[(string) $w] ?? $files[$w]));
        if (wx_media_sniff($raw) !== 'webp') {
            throw ApiError::validation($w . 'px is not a valid WebP image', 'files');
        }
        if (@file_put_contents(WX_SITE_ROOT . wx_media_variant($url, $w), $raw, LOCK_EX) === false) {
            throw ApiError::internal('Could not save the ' . $w . 'px copy');
        }
        @chmod(WX_SITE_ROOT . wx_media_variant($url, $w), 0644);
        $made[] = $w;
    }
    $result = wx_media_apply_srcset($url, $originalWidth, $me);
    return ['sizes' => $made, 'pages' => $result['changed']];
}

/**
 * Save alt text, and optionally write it into every page that shows the image.
 *
 * `apply` only ever *fills in* an image that has no alt attribute, or one that is empty. It does not
 * overwrite a description somebody wrote in the HTML — the library is the newer and more convenient
 * home for alt text, but it is not a licence to overwrite the page.
 *
 * @return array{url:string,alt:string,checked:bool,pages:int,batch:?string}
 */
function wx_media_alt_save(string $url, string $alt, bool $apply, array $me): array
{
    if (!wx_media_ok($url)) {
        throw ApiError::validation('Invalid image address', 'url');
    }
    $alt = mb_substr(trim((string) preg_replace('~\s+~', ' ', $alt)), 0, 300);
    $now = wx_now();
    $exists = wx_val('SELECT url FROM wx_media_alt WHERE url = ?', [$url]) !== null;
    $row = ['alt' => $alt, 'checked_at' => $now, 'checked_by' => (int) $me['id'], 'updated_at' => $now];
    if ($exists) {
        wx_update('wx_media_alt', $row, ['url' => $url]);
    } else {
        wx_insert('wx_media_alt', ['url' => $url] + $row);
    }
    $pages = 0;
    $batch = null;
    if ($apply && $alt !== '') {
        $esc = htmlspecialchars($alt, ENT_QUOTES | ENT_HTML5);
        $r = wx_page_rewrite_all($url, static function (string $rel, string $html) use ($url, $esc) {
            $next = preg_replace_callback('~<img\b[^>]*>~i', static function ($m) use ($url, $esc) {
                $tag = $m[0];
                $quoted = preg_quote($url, '~');
                if (!preg_match('~\ssrc="([^"]*)"~i', $tag, $sm) || !preg_match('~^' . $quoted . '(\?\d+)?$~', $sm[1])) {
                    return $tag;
                }
                if (preg_match('~\salt="[^"]+"~i', $tag)) {
                    return $tag; // somebody wrote a description already
                }
                return preg_match('~\salt=""~i', $tag)
                    ? (string) preg_replace('~\salt=""~i', ' alt="' . $esc . '"', $tag, 1)
                    : (string) preg_replace('~^<img~i', '<img alt="' . $esc . '"', $tag, 1);
            }, $html);
            return $next === $html ? null : $next;
        }, $me, 'alt text for ' . basename($url));
        $pages = count($r['changed']);
        $batch = $r['changed'] ? $r['batch'] : null;
    }
    wx_audit($me, 'media.alt', $url, ['pages' => $pages, 'apply' => $apply, 'batch' => $batch]);
    return ['url' => $url, 'alt' => $alt, 'checked' => true, 'pages' => $pages, 'batch' => $batch];
}

/**
 * Write (or refresh) the srcset attribute on every page that shows this image.
 *
 * Two things are deliberately left alone: an `<img>` whose srcset somebody hand-wrote — unless it is one
 * of the old P15 `name-960.webp` copies, which are this feature's own earlier output — and any image that
 * is not this URL.
 *
 * @return array{changed:int,batch:?string}
 */
function wx_media_apply_srcset(string $url, int $originalWidth, array $me): array
{
    $have = wx_media_have($url);
    $set = [];
    foreach ($have as $w) {
        $set[] = wx_media_variant($url, $w) . ' ' . $w . 'w';
    }
    if ($set && $originalWidth > (int) end($have)) {
        $set[] = $url . ' ' . $originalWidth . 'w';
    }
    $attr = $set
        ? ' srcset="' . implode(', ', $set) . '" sizes="(max-width: 640px) 100vw, (max-width: 1200px) 80vw, 1200px" data-wx-rs'
        : '';
    $r = wx_page_rewrite_all($url, static function (string $rel, string $html) use ($url, $attr) {
        $next = preg_replace_callback('~<img\b[^>]*>~i', static function ($m) use ($url, $attr) {
            $tag = $m[0];
            $quoted = preg_quote($url, '~');
            if (!preg_match('~\ssrc="([^"]*)"~i', $tag, $sm) || !preg_match('~^' . $quoted . '(\?v=\d+)?$~', $sm[1])) {
                return $tag;
            }
            $stem = preg_quote((string) preg_replace('~\.[a-z0-9]+$~i', '', $url), '~');
            if (preg_match('~\ssrcset="([^"]*)"~i', $tag, $sm2)
                && !str_contains($tag, 'data-wx-rs')
                && !preg_match('~' . $stem . '-\d+\.webp~', $sm2[1])) {
                return $tag; // hand-made srcset: somebody chose those sizes
            }
            $tag = (string) preg_replace(['~\ssrcset="[^"]*"~i', '~\ssizes="[^"]*"~i', '~\sdata-wx-rs(="")?~'], '', $tag);
            return $attr === '' ? $tag : (string) preg_replace('~^<img~i', '<img' . $attr, $tag, 1);
        }, $html);
        return $next === $html ? null : $next;
    }, $me, ($have ? implode('/', $have) . 'px copies' : 'drop stale srcset') . ' for ' . basename($url));
    wx_audit($me, 'media.sizes', $url, ['sizes' => $have, 'pages' => count($r['changed']), 'batch' => $r['changed'] ? $r['batch'] : null]);
    return ['changed' => count($r['changed']), 'batch' => $r['changed'] ? $r['batch'] : null];
}

/** Stamp `?v=<time>` on every use of an image, so browsers and CDNs pick up the new file. */
function wx_media_bust(string $url, array $me): int
{
    $v = time();
    $r = wx_page_rewrite_all($url, static function (string $rel, string $html) use ($url, $v) {
        $next = (string) preg_replace('~' . preg_quote($url, '~') . '(\?v=\d+)?(?=["\')\s,])~', $url . '?v=' . $v, $html);
        return $next === $html ? null : $next;
    }, $me, 'cache bust for ' . basename($url));
    return count($r['changed']);
}

/** Move images between upload folders. Refuses to move one that a page still points at. */
function wx_media_move(array $urls, string $folder, array $me): array
{
    $to = (string) preg_replace('~[^a-z0-9-]~', '', $folder);
    $dir = WX_SITE_ROOT . '/assets/uploads' . ($to !== '' ? '/' . $to : '');
    if ($to !== '' && !is_dir($dir)) {
        throw ApiError::validation('Folder "' . $to . '" does not exist', 'folder');
    }
    $hay = wx_media_haystack();
    $moved = [];
    $blocked = [];
    foreach (array_slice(array_values(array_filter($urls, 'wx_media_ok')), 0, 200) as $url) {
        $abs = WX_SITE_ROOT . $url;
        if (!is_file($abs) || !str_starts_with($url, '/assets/uploads/')) {
            $blocked[] = ['url' => $url, 'why' => 'not in uploads'];
            continue;
        }
        if (wx_media_used($url, $hay)) {
            $blocked[] = ['url' => $url, 'why' => 'in use'];
            continue;
        }
        $newUrl = '/assets/uploads/' . ($to !== '' ? $to . '/' : '') . basename($abs);
        if ($newUrl === $url) {
            continue;
        }
        if (is_file(WX_SITE_ROOT . $newUrl)) {
            $blocked[] = ['url' => $url, 'why' => 'name taken'];
            continue;
        }
        if (!@rename($abs, WX_SITE_ROOT . $newUrl)) {
            $blocked[] = ['url' => $url, 'why' => 'could not move'];
            continue;
        }
        /* The alt text and any derivatives belong to the picture, not to its address. */
        if (wx_val('SELECT url FROM wx_media_alt WHERE url = ?', [$url]) !== null) {
            wx_q('UPDATE wx_media_alt SET url = ? WHERE url = ?', [$newUrl, $url]);
        }
        foreach (wx_media_have($url) as $w) {
            @rename(WX_SITE_ROOT . wx_media_variant($url, $w), WX_SITE_ROOT . wx_media_variant($newUrl, $w));
        }
        $moved[] = $newUrl;
    }
    wx_audit($me, 'media.move', count($moved) . ' file(s) → ' . ($to !== '' ? $to : 'uploads'), ['blocked' => count($blocked)]);
    return ['moved' => $moved, 'blocked' => $blocked];
}

/** Copy a file aside before it is deleted or replaced. */
function wx_media_trash_put(string $url, string $abs, string $why, array $me): int
{
    if (!is_dir(WX_MEDIA_TRASH_DIR) && !mkdir(WX_MEDIA_TRASH_DIR, 0750, true)) {
        throw ApiError::internal('Could not create the media trash folder');
    }
    $file = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-' . basename($abs);
    if (!@copy($abs, WX_MEDIA_TRASH_DIR . '/' . $file)) {
        throw ApiError::internal('Could not put a copy in the trash — refusing to delete the original');
    }
    return wx_insert('wx_media_trash', [
        'url' => $url,
        'file' => $file,
        'bytes' => (int) filesize($abs),
        'why' => $why === 'replaced' ? 'replaced' : 'deleted',
        'at' => wx_now(),
        'by_id' => (int) $me['id'],
        'by_name' => (string) $me['name'],
    ]);
}

/**
 * Move images to the trash.
 *
 * `force` is what the screen uses after showing the person the pages that use the image — without it, an
 * image that is used anywhere is refused, because deleting it leaves a broken picture on a live page.
 * Forcing also rewrites the referencing pages to drop the srcset pointing at the copies that are going.
 */
function wx_media_trash(array $urls, bool $force, array $me): array
{
    $hay = $force ? '' : wx_media_haystack();
    $moved = [];
    $blocked = [];
    foreach (array_slice(array_values(array_filter($urls, 'wx_media_ok')), 0, 200) as $url) {
        if (!wx_media_ok($url)) {
            continue;
        }
        $abs = WX_SITE_ROOT . $url;
        if (!is_file($abs)) {
            continue;
        }
        if ($force === false && wx_media_used($url, $hay)) {
            $blocked[] = ['url' => $url, 'why' => 'in use'];
            continue;
        }
        wx_media_trash_put($url, $abs, 'deleted', $me);
        if (wx_val('SELECT url FROM wx_media_alt WHERE url = ?', [$url]) !== null) {
            wx_q('DELETE FROM wx_media_alt WHERE url = ?', [$url]);
        }
        if (!@unlink($abs)) {
            throw ApiError::internal('Could not remove ' . $url . ' — the copy in the trash is intact');
        }
        foreach (wx_media_have($url) as $w) {
            @unlink(WX_SITE_ROOT . wx_media_variant($url, $w));
        }
        if ($force) {
            wx_media_apply_srcset($url, 0, $me);
        }
        $moved[] = $url;
    }
    wx_audit($me, 'media.trash', count($moved) . ' file(s)', ['blocked' => count($blocked), 'force' => $force]);
    return ['moved' => $moved, 'blocked' => $blocked];
}

/** What is in the trash, newest first, and whether the address it came from is free again. */
function wx_media_trash_list(): array
{
    $out = [];
    foreach (wx_all('SELECT * FROM wx_media_trash ORDER BY id DESC LIMIT 500') as $r) {
        $file = WX_MEDIA_TRASH_DIR . '/' . basename((string) $r['file']);
        $out[] = [
            'id' => (int) $r['id'],
            'url' => (string) $r['url'],
            'bytes' => (int) $r['bytes'],
            'why' => (string) $r['why'],
            'at' => (string) $r['at'],
            'by' => (string) ($r['by_name'] ?? ''),
            'onDisk' => is_file($file),
            'addressFree' => !is_file(WX_SITE_ROOT . (string) $r['url']),
        ];
    }
    return $out;
}

/**
 * Put a deleted image back, or — for a replacement — put the *old* picture back over the new one.
 *
 * A restore whose address is occupied is only allowed for a replacement, which is the one case where the
 * address being taken is the point.
 */
function wx_media_restore(int $id, array $me): array
{
    $row = wx_one('SELECT * FROM wx_media_trash WHERE id = ?', [$id]);
    if ($row === null) {
        throw ApiError::notFound('That file is not in the trash');
    }
    $src = WX_MEDIA_TRASH_DIR . '/' . basename((string) $row['file']);
    if (!is_file($src)) {
        throw ApiError::conflict('The file itself is gone from _private/media-trash — only the record is left', ['id' => $id]);
    }
    $url = (string) $row['url'];
    if (!wx_media_ok($url)) {
        throw ApiError::validation('The address we recorded is not a valid image address');
    }
    $dst = WX_SITE_ROOT . $url;
    if (is_file($dst) && (string) $row['why'] !== 'replaced') {
        throw ApiError::conflict('Something is at that address again', ['url' => $url]);
    }
    if (!is_dir(dirname($dst)) && !mkdir(dirname($dst), 0755, true)) {
        throw ApiError::internal('Could not create the folder for ' . $url);
    }
    if (is_file($dst)) {
        /* A replacement being undone: what is there now takes the old copy's place in the trash, so the
           swap is reversible in both directions. */
        wx_media_trash_put($url, $dst, 'replaced', $me);
    }
    if (!@copy($src, $dst)) {
        throw ApiError::internal('Could not restore the file');
    }
    @chmod($dst, 0644);
    @unlink($src);
    wx_q('DELETE FROM wx_media_trash WHERE id = ?', [$id]);
    $pages = (string) $row['why'] === 'replaced' ? wx_media_bust($url, $me) : 0;
    wx_audit($me, 'media.restore', $url, ['why' => $row['why'], 'pages' => $pages]);
    return ['url' => $url, 'pages' => $pages];
}

/** Drop one trashed file for good, or empty the trash. Irreversible, and named as such. */
function wx_media_purge(?int $id, bool $all, array $me): array
{
    $rows = $all
        ? wx_all('SELECT * FROM wx_media_trash')
        : ($id !== null ? array_filter([wx_one('SELECT * FROM wx_media_trash WHERE id = ?', [$id])]) : []);
    if (!$rows) {
        throw ApiError::notFound('Nothing in the trash to purge');
    }
    $bytes = 0;
    $n = 0;
    foreach ($rows as $r) {
        $file = WX_MEDIA_TRASH_DIR . '/' . basename((string) $r['file']);
        if (is_file($file)) {
            $bytes += (int) filesize($file);
            @unlink($file);
        }
        wx_q('DELETE FROM wx_media_trash WHERE id = ?', [(int) $r['id']]);
        $n++;
    }
    wx_audit($me, 'media.purge', $all ? 'all' : ('#' . $id), ['files' => $n, 'bytes' => $bytes]);
    return ['purged' => $n, 'bytes' => $bytes, 'rows' => wx_media_trash_list()];
}

/**
 * Base64 in, bytes out, with the two things that must be checked before anything is written: it decodes,
 * and it is not too big. The size check is on the decoded data for a reason — base64 is 4/3 the size, so
 * checking the encoded string would let a 10 MB image through an 8 MB limit.
 */
function wx_media_b64(string $data): string
{
    $clean = (string) preg_replace('~^data:[a-z0-9/+.-]+;base64,~i', '', trim($data));
    $raw = base64_decode($clean, true);
    if ($raw === false || $raw === '') {
        throw ApiError::validation('The image data is empty or not valid base64', 'data');
    }
    if (strlen($raw) > WX_MEDIA_MAX) {
        throw ApiError::validation('Images up to 8 MB', 'data');
    }
    return $raw;
}

/**
 * Move v2.1's `_private/media.json` into the two tables, once.
 *
 * The JSON keeps working for v2.1 until the cleanup phase; this reads it across and leaves it alone. Alt
 * entries that are empty strings are skipped on purpose — an empty string is not a decision, and copying
 * it would mark those images as "looked at" and take them out of the alt queue.
 */
function wx_media_import_legacy(): array
{
    $raw = wx_store('media.json', true)->tryRead();
    $alt = 0;
    $trash = 0;
    if (!is_array($raw)) {
        return ['alt' => 0, 'trash' => 0];
    }
    foreach ((array) ($raw['alt'] ?? []) as $url => $text) {
        $url = (string) $url;
        $text = trim((string) $text);
        if ($text === '' || !wx_media_ok($url) || wx_val('SELECT url FROM wx_media_alt WHERE url = ?', [$url]) !== null) {
            continue;
        }
        wx_insert('wx_media_alt', ['url' => $url, 'alt' => mb_substr($text, 0, 300), 'checked_at' => null, 'updated_at' => wx_now()]);
        $alt++;
    }
    foreach ((array) ($raw['trash'] ?? []) as $t) {
        if (!is_array($t) || !isset($t['file'], $t['url'])) {
            continue;
        }
        $file = basename((string) $t['file']);
        if (wx_val('SELECT id FROM wx_media_trash WHERE file = ?', [$file]) !== null) {
            continue;
        }
        wx_insert('wx_media_trash', [
            'url' => (string) $t['url'],
            'file' => $file,
            'bytes' => (int) ($t['size'] ?? 0),
            'why' => ($t['why'] ?? 'deleted') === 'replaced' ? 'replaced' : 'deleted',
            'at' => isset($t['at']) ? substr((string) $t['at'], 0, 19) : wx_now(),
            'by_name' => isset($t['by']) ? mb_substr((string) $t['by'], 0, 120) : null,
        ]);
        $trash++;
    }
    return ['alt' => $alt, 'trash' => $trash];
}
