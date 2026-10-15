<?php
/**
 * api/v2/lib/files.php — the file manager over `assets/`.
 *
 * Ported from the `fm_*` handlers, with the same read-only list (`assets/js`, `assets/css`,
 * `assets/fonts`, `assets/vendor`) and the same 30-day trash.
 *
 * Two things are deliberately *not* changed from v2.1, because they are the file manager working as
 * designed rather than as a CMS:
 *
 *   · **The trash is a pair of files, not a row.** A deleted file's bytes have to live somewhere, and
 *     `_private/trash/<id>.bin` with `<id>.json` beside it keeps the bytes and the metadata in the same
 *     place — a row pointing at a `.bin` that a deploy or a restore did not bring along is worse than a
 *     JSON file next to the bytes it describes. The row-per-deletion idea is right for the *media
 *     library* (`wx_media_trash`), where the record is the interesting part and the file is a picture
 *     somebody can also find on disk; here the file is the interesting part.
 *
 *   · **A file that a page uses is not renamed or deleted by accident.** `wx_fm_used()` finds the pages
 *     that reference it and the handler refuses without `force`, which then does the rename and reports
 *     what it broke. This is the check that keeps "tidy up the assets folder" from taking the logo off
 *     the home page.
 *
 * What *is* different: the trash listing reports whether each file's address is free again, and every
 * write is audited by name.
 */

declare(strict_types=1);

const WX_FM_ROOT = 'assets';
const WX_FM_RO = ['assets/js', 'assets/css', 'assets/fonts', 'assets/vendor'];
const WX_FM_TRASH = WX_PRIVATE_DIR . '/trash';
const WX_FM_KEEP_DAYS = 30;
const WX_FM_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'ico', 'pdf', 'mp4', 'webm', 'mp3',
    'woff2', 'woff', 'txt', 'csv', 'json', 'zip', 'docx', 'xlsx', 'pptx'];

/**
 * Resolve a path inside `assets/`, or refuse.
 *
 * Three refusals, all of them load-bearing: a path that is not under `assets`, a path with a `..` or a
 * hidden component in it, and a path whose real location (after symlinks) is outside the folder. The
 * last one is why this cannot be a string check — `assets/link-to-et-c` is a legal-looking string.
 */
function wx_fm_path(string $rel, bool $mustExist = true): string
{
    $rel = trim(str_replace('\\', '/', $rel), '/');
    if ($rel === '') {
        $rel = WX_FM_ROOT;
    }
    if (!preg_match('~^' . WX_FM_ROOT . '(/|$)~', $rel)
        || preg_match('~(^|/)\.\.?(/|$)~', $rel)
        || preg_match('~(^|/)\.~', $rel)
        || str_contains($rel, "\0")) {
        throw ApiError::validation('That path is outside the files you can manage', 'path');
    }
    $abs = WX_SITE_ROOT . '/' . $rel;
    if ($mustExist && !file_exists($abs)) {
        throw ApiError::notFound('Not found');
    }
    $root = realpath(WX_SITE_ROOT . '/' . WX_FM_ROOT);
    $real = realpath($mustExist ? $abs : dirname($abs));
    if ($root === false || $real === false || ($real !== $root && !str_starts_with($real, $root . '/'))) {
        throw ApiError::validation('That path is outside the files you can manage', 'path');
    }
    return $abs;
}

/** Is this folder off limits for writing? The root and the four shared asset folders are. */
function wx_fm_ro(string $rel): bool
{
    $rel = trim($rel, '/');
    foreach (WX_FM_RO as $r) {
        if ($rel === $r || str_starts_with($rel, $r . '/')) {
            return true;
        }
    }
    return $rel === WX_FM_ROOT;
}

/** A safe file name: lower case, no spaces, no surprises. */
function wx_fm_clean(string $n): string
{
    $n = (string) preg_replace('~[^a-z0-9._-]+~', '-', strtolower(trim($n)));
    $n = (string) preg_replace('~-+~', '-', $n);
    return trim($n, '-.');
}

/** Pages that reference a file, up to eight of them. */
function wx_fm_used(string $url): array
{
    $hits = [];
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (str_contains((string) file_get_contents(WX_SITE_ROOT . '/' . $rel), $url)) {
            $hits[] = $rel;
            if (count($hits) >= 8) {
                break;
            }
        }
    }
    return $hits;
}

/** One folder: its entries, sorted folders-first, and whether it can be written to. */
function wx_fm_list(string $rel, ?array $me = null): array
{
    $rel = trim($rel, '/');
    if ($rel === '') {
        $rel = WX_FM_ROOT;
    }
    $abs = wx_fm_path($rel);
    if (!is_dir($abs)) {
        throw ApiError::validation('Not a folder', 'dir');
    }
    $items = [];
    foreach (scandir($abs) ?: [] as $n) {
        if ($n === '' || $n[0] === '.') {
            continue;
        }
        $a = $abs . '/' . $n;
        $isDir = is_dir($a);
        $items[] = [
            'name' => $n,
            'path' => $rel . '/' . $n,
            'dir' => $isDir,
            'size' => $isDir ? null : (int) filesize($a),
            'mtime' => gmdate('Y-m-d H:i', (int) filemtime($a)),
            'count' => $isDir ? count(array_diff(scandir($a) ?: [], ['.', '..'])) : null,
            'ro' => wx_fm_ro($rel . '/' . $n),
            'used' => $isDir ? [] : wx_fm_used('/' . $rel . '/' . $n),
        ];
    }
    usort($items, static fn($x, $y) => [$y['dir'], strtolower($x['name'])] <=> [$x['dir'], strtolower($y['name'])]);
    return [
        'dir' => $rel,
        'ro' => wx_fm_ro($rel),
        'items' => $items,
        'trash' => count(wx_fm_trash_ids()),
        'maxUpload' => (string) ini_get('upload_max_filesize'),
        'writable' => is_writable($abs),
    ];
}

/** Folder names under assets/ for the tree, two levels deep — enough to navigate, not a full walk. */
function wx_fm_tree(): array
{
    $out = [];
    $root = WX_SITE_ROOT . '/' . WX_FM_ROOT;
    foreach (glob($root . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        $rel = WX_FM_ROOT . '/' . basename($d);
        $kids = [];
        foreach (glob($d . '/*', GLOB_ONLYDIR) ?: [] as $k) {
            $kids[] = $rel . '/' . basename($k);
        }
        $out[] = ['rel' => $rel, 'ro' => wx_fm_ro($rel), 'children' => $kids];
    }
    return $out;
}

/**
 * Store an uploaded file.
 *
 * The extension has to be on the list, and an SVG is inspected for script — an uploaded SVG is HTML as
 * far as a browser is concerned, and `assets/` is served from the same origin as the admin.
 */
function wx_fm_upload(string $dir, string $name, string $data, array $me): array
{
    $dir = trim($dir, '/');
    $abs = wx_fm_path($dir);
    if (wx_fm_ro($dir)) {
        throw ApiError::validation('This folder is read-only — upload into assets/uploads or assets/img', 'dir');
    }
    $raw = (string) preg_replace('~^data:[^,]*,~', '', trim($data));
    $raw = base64_decode($raw, true) === false ? '' : (string) base64_decode($raw, true);
    if ($raw === '') {
        throw ApiError::validation('The upload is empty', 'data');
    }
    if (strlen($raw) > 25 * 1024 * 1024) {
        throw ApiError::validation('Files up to 25 MB', 'data');
    }
    $clean = wx_fm_clean($name);
    $ext = strtolower((string) pathinfo($clean, PATHINFO_EXTENSION));
    if ($clean === '' || !in_array($ext, WX_FM_EXT, true)) {
        throw ApiError::validation('This file type is not allowed (.' . $ext . ')', 'name');
    }
    if ($ext === 'svg' && preg_match('~<script|on[a-z]+\s*=|javascript:~i', $raw)) {
        throw ApiError::validation('This SVG contains scripts and was blocked', 'data');
    }
    $stem = (string) pathinfo($clean, PATHINFO_FILENAME);
    $dst = $abs . '/' . $clean;
    $i = 2;
    while (file_exists($dst)) {
        $dst = $abs . '/' . $stem . '-' . $i++ . '.' . $ext;
    }
    if (@file_put_contents($dst, $raw, LOCK_EX) === false) {
        throw ApiError::internal('Could not save the file');
    }
    @chmod($dst, 0644);
    $rel = $dir . '/' . basename($dst);
    wx_audit($me, 'file.upload', $rel, ['bytes' => strlen($raw)]);
    return ['path' => $rel, 'bytes' => strlen($raw)];
}

/** Create a folder. Letters, numbers and dashes only, like v2.1. */
function wx_fm_mkdir(string $dir, string $name, array $me): string
{
    $dir = trim($dir, '/');
    $abs = wx_fm_path($dir);
    if (wx_fm_ro($dir)) {
        throw ApiError::validation('This folder is read-only', 'dir');
    }
    $n = wx_fm_clean($name);
    if ($n === '' || str_contains($n, '.')) {
        throw ApiError::validation('Use letters, numbers and - only', 'name');
    }
    if (file_exists($abs . '/' . $n)) {
        throw ApiError::conflict('Something with that name is already there', ['name' => $n]);
    }
    if (!mkdir($abs . '/' . $n, 0755)) {
        throw ApiError::internal('Could not create the folder');
    }
    wx_audit($me, 'file.mkdir', $dir . '/' . $n);
    return $dir . '/' . $n;
}

/**
 * Rename a file or folder.
 *
 * A file's extension is kept: renaming `hero.webp` to `hero` would leave a WebP that Apache serves as
 * `application/octet-stream`, which is a broken image with a correct-looking name.
 *
 * @return array{path:string, used:array<int,string>, forced:bool}
 */
function wx_fm_rename(string $path, string $name, bool $force, array $me): array
{
    $path = trim($path, '/');
    $abs = wx_fm_path($path);
    if (wx_fm_ro($path) || wx_fm_ro(dirname($path))) {
        throw ApiError::validation('Files in this folder are read-only', 'path');
    }
    $n = wx_fm_clean($name);
    if ($n === '') {
        throw ApiError::validation('Enter a name', 'name');
    }
    if (is_file($abs)) {
        $old = strtolower((string) pathinfo($abs, PATHINFO_EXTENSION));
        if (strtolower((string) pathinfo($n, PATHINFO_EXTENSION)) !== $old) {
            $n = (string) pathinfo($n, PATHINFO_FILENAME) . '.' . $old;
        }
    }
    $dst = dirname($abs) . '/' . $n;
    if (file_exists($dst)) {
        throw ApiError::conflict('A file with that name already exists', ['name' => $n]);
    }
    $used = is_file($abs) ? wx_fm_used('/' . $path) : [];
    if ($used && !$force) {
        throw new ApiError('VALIDATION', 'This file is used on ' . count($used) . ' page(s). Renaming will break it there.', null, 'force', ['used' => $used]);
    }
    if (!@rename($abs, $dst)) {
        throw ApiError::internal('Could not rename it');
    }
    $new = dirname($path) . '/' . $n;
    wx_audit($me, 'file.rename', $path, ['to' => $new, 'brokePages' => $used, 'forced' => $force]);
    return ['path' => $new, 'used' => $used, 'forced' => $used && $force];
}

/**
 * Move a file to the trash.
 *
 * The trash row is written *after* the file is in place, and if the rename fails nothing is recorded —
 * the listing is a description of what is on disk, and it must never claim a file it does not have.
 */
function wx_fm_delete(string $path, bool $force, array $me): array
{
    $path = trim($path, '/');
    $abs = wx_fm_path($path);
    if (wx_fm_ro($path)) {
        throw ApiError::validation('This item is read-only', 'path');
    }
    if (is_dir($abs)) {
        if (count(array_diff(scandir($abs) ?: [], ['.', '..']))) {
            throw ApiError::validation('The folder is not empty', 'path');
        }
        if (!@rmdir($abs)) {
            throw ApiError::internal('Could not remove the folder');
        }
        wx_audit($me, 'file.delete', $path, ['dir' => true]);
        return ['path' => $path, 'trash' => null];
    }
    $used = wx_fm_used('/' . $path);
    if ($used && !$force) {
        throw new ApiError('VALIDATION', 'This file is used on ' . count($used) . ' page(s). Deleting it will break the page.', null, 'force', ['used' => $used]);
    }
    if (!is_dir(WX_FM_TRASH) && !mkdir(WX_FM_TRASH, 0750, true)) {
        throw ApiError::internal('Could not create the trash folder');
    }
    $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3));
    if (!@rename($abs, WX_FM_TRASH . '/' . $id . '.bin')) {
        throw ApiError::internal('Could not move the file to the trash');
    }
    (new JsonStore(WX_FM_TRASH . '/' . $id . '.json'))->write([
        'path' => $path,
        'size' => (int) filesize(WX_FM_TRASH . '/' . $id . '.bin'),
        't' => wx_now(),
        'by' => (string) $me['name'],
    ]);
    wx_fm_gc();
    wx_audit($me, 'file.delete', $path, ['trash' => $id, 'brokePages' => $used, 'forced' => $used && $force]);
    return ['path' => $path, 'trash' => $id];
}

/** Trash ids, newest first. */
function wx_fm_trash_ids(): array
{
    $ids = [];
    foreach (glob(WX_FM_TRASH . '/*.json') ?: [] as $j) {
        $ids[] = basename($j, '.json');
    }
    rsort($ids);
    return $ids;
}

/** What is in the trash, with whether the bytes are still there and the address is free. */
function wx_fm_trash_list(): array
{
    $out = [];
    foreach (wx_fm_trash_ids() as $id) {
        $meta = wx_store_at(WX_FM_TRASH . '/' . $id . '.json');
        $bin = WX_FM_TRASH . '/' . $id . '.bin';
        $out[] = [
            'id' => $id,
            'path' => (string) ($meta['path'] ?? ''),
            'size' => (int) ($meta['size'] ?? 0),
            'at' => (string) ($meta['t'] ?? ''),
            'by' => (string) ($meta['by'] ?? ''),
            'onDisk' => is_file($bin),
            'addressFree' => ($meta['path'] ?? '') !== '' && !file_exists(WX_SITE_ROOT . '/' . $meta['path']),
        ];
    }
    return $out;
}

/** Read a JSON file without creating it — the trash metadata is written by v2.1 too. */
function wx_store_at(string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $raw = json_decode((string) file_get_contents($file), true);
    return is_array($raw) ? $raw : [];
}

/** Put a trashed file back where it came from. */
function wx_fm_restore(string $id, array $me): array
{
    $id = (string) preg_replace('~[^0-9a-z-]~', '', strtolower($id));
    $meta = wx_store_at(WX_FM_TRASH . '/' . $id . '.json');
    $bin = WX_FM_TRASH . '/' . $id . '.bin';
    if (!$meta || !is_file($bin)) {
        throw ApiError::notFound('That file is not in the trash');
    }
    $rel = (string) $meta['path'];
    $abs = wx_fm_path($rel, false);
    if (file_exists($abs)) {
        throw ApiError::conflict('Something is at ' . $rel . ' again', ['path' => $rel]);
    }
    if (!is_dir(dirname($abs)) && !mkdir(dirname($abs), 0755, true)) {
        throw ApiError::internal('Could not recreate the folder');
    }
    if (!@rename($bin, $abs)) {
        throw ApiError::internal('Could not restore the file');
    }
    @chmod($abs, 0644);
    @unlink(WX_FM_TRASH . '/' . $id . '.json');
    wx_audit($me, 'file.restore', $rel);
    return ['path' => $rel];
}

/** Forget trashed files after 30 days — the same sweep v2.1 ran on every delete. */
function wx_fm_gc(): int
{
    $n = 0;
    foreach (glob(WX_FM_TRASH . '/*.json') ?: [] as $j) {
        if ((int) filemtime($j) >= time() - WX_FM_KEEP_DAYS * 86400) {
            continue;
        }
        @unlink($j);
        @unlink(substr($j, 0, -5) . '.bin');
        $n++;
    }
    return $n;
}

/**
 * Zip a folder for download.
 *
 * The zip is built in the system temporary directory and deleted by the response writer once it has been
 * sent, so a download does not leave a copy of the site's assets lying about. Entries are named relative
 * to the requested folder, which is what makes the archive open cleanly on Windows as well as Linux.
 */
function wx_fm_zip(string $dir, array $me): array
{
    if (!class_exists('ZipArchive')) {
        throw ApiError::internal('Zip is not available on this server');
    }
    $dir = trim($dir, '/');
    $abs = wx_fm_path($dir);
    if (!is_dir($abs)) {
        throw ApiError::validation('Not a folder', 'dir');
    }
    $tmp = tempnam(sys_get_temp_dir(), 'wxz');
    if ($tmp === false) {
        throw ApiError::internal('Could not create a temporary file');
    }
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        throw ApiError::internal('Could not create the archive');
    }
    $files = 0;
    $bytes = 0;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($abs, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($it as $f) {
        /** @var SplFileInfo $f */
        if (!$f->isFile() || str_contains((string) $f->getFilename(), '.wx')) {
            continue;
        }
        $local = ltrim(substr((string) $f->getPathname(), strlen($abs)), '/');
        $zip->addFile((string) $f->getPathname(), $local);
        $files++;
        $bytes += (int) $f->getSize();
    }
    $zip->close();
    wx_audit($me, 'file.zip', $dir, ['files' => $files, 'bytes' => $bytes]);
    return [
        'path' => $tmp,
        'name' => str_replace('/', '-', $dir) . '-' . gmdate('Ymd-His') . '.zip',
        'mime' => 'application/zip',
        'delete' => true,
        'files' => $files,
        'bytes' => $bytes,
    ];
}
