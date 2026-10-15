<?php
/**
 * api/v2/routes/files.php — the file manager: everything under `assets/`, and nothing outside it.
 *
 * The four shared folders are read-only to this screen (js, css, fonts, vendor): those are the files a
 * deploy owns, and an editor renaming `app.css` from the admin is a broken site with a plausible-looking
 * cause. Everything else under `assets/` is the person's to organise.
 *
 * `GET /files/zip` is the one route that answers with a file rather than JSON — it returns a spec and the
 * front controller streams it, then deletes the temporary archive.
 */

declare(strict_types=1);

const WX_FILES_READ = ['owner', 'admin', 'editor', 'sales', 'support'];
const WX_FILES_WRITE = ['owner', 'admin', 'editor'];

/** GET /files — one folder, its entries, and the tree to navigate with. */
function wx_route_files_list(array $ctx): array
{
    wx_require_user('fm_list', WX_FILES_READ);
    $dir = (string) ($ctx['query']['dir'] ?? '');
    return ['data' => wx_fm_list($dir) + ['tree' => wx_fm_tree(), 'crumbs' => wx_fm_crumbs((string) ($ctx['query']['dir'] ?? ''))]];
}

/** POST /files/upload — one file, base64, extension on the list, SVG inspected. */
function wx_route_files_upload(array $ctx): array
{
    return wx_appr_route('fm_upload', $ctx, 'files', 'wx_route_files_upload_do', static fn() => wx_route_files_upload_do($ctx));
}

function wx_route_files_upload_do(array $ctx): array
{
    $u = wx_require_user('fm_upload', WX_FILES_WRITE);
    $r = wx_guard('file.upload', static fn() => wx_fm_upload(
        (string) ($ctx['body']['dir'] ?? ''),
        (string) ($ctx['body']['name'] ?? ''),
        (string) ($ctx['body']['data'] ?? ''),
        $u
    ));
    return ['data' => $r + ['folder' => wx_fm_list((string) ($ctx['body']['dir'] ?? ''), $u)]];
}

/** POST /files/folder — a new folder. */
function wx_route_files_folder(array $ctx): array
{
    return wx_appr_route('fm_mkdir', $ctx, 'files', 'wx_route_files_folder_do', static fn() => wx_route_files_folder_do($ctx));
}

function wx_route_files_folder_do(array $ctx): array
{
    $u = wx_require_user('fm_mkdir', WX_FILES_WRITE);
    $dir = (string) ($ctx['body']['dir'] ?? '');
    $r = wx_guard('file.mkdir', static fn() => wx_fm_mkdir($dir, (string) ($ctx['body']['name'] ?? ''), $u));
    return ['data' => ['path' => $r, 'folder' => wx_fm_list($dir, $u)]];
}

/** POST /files/rename — rename, refusing (or reporting) the pages it breaks. */
function wx_route_files_rename(array $ctx): array
{
    return wx_appr_route('fm_rename', $ctx, 'files', 'wx_route_files_rename_do', static fn() => wx_route_files_rename_do($ctx));
}

function wx_route_files_rename_do(array $ctx): array
{
    $u = wx_require_user('fm_rename', WX_FILES_WRITE);
    $path = (string) ($ctx['body']['path'] ?? '');
    $force = !empty($ctx['body']['force']);
    return wx_guard('file.rename', static fn() => ['data' => wx_fm_rename($path, (string) ($ctx['body']['name'] ?? ''), $force, $u)]);
}

/** DELETE /files — to the trash, with the 30-day sweep. */
function wx_route_files_delete(array $ctx): array
{
    return wx_appr_route('fm_delete', $ctx, 'files', 'wx_route_files_delete_do', static fn() => wx_route_files_delete_do($ctx));
}

function wx_route_files_delete_do(array $ctx): array
{
    $u = wx_require_user('fm_delete', WX_FILES_WRITE);
    $path = (string) ($ctx['body']['path'] ?? '');
    $force = !empty($ctx['body']['force']);
    return wx_guard('file.delete', static fn() => ['data' => wx_fm_delete($path, $force, $u)]);
}

/** GET /files/trash — what is in it, and whether each file's address is free. */
function wx_route_files_trash(array $ctx): array
{
    wx_require_user('fm_trash', WX_FILES_READ);
    return ['data' => ['items' => wx_fm_trash_list()]];
}

/** POST /files/trash/{id}/restore — put a trashed file back where it was. */
function wx_route_files_restore(array $ctx): array
{
    return wx_appr_route('fm_restore', $ctx, 'files', 'wx_route_files_restore_do', static fn() => wx_route_files_restore_do($ctx));
}

function wx_route_files_restore_do(array $ctx): array
{
    $u = wx_require_user('fm_restore', WX_FILES_WRITE);
    /* The id is `20261014-093000-ab12cd`, so it is never cast to an int on the way in — the legacy
       client posts it in the body, a v2.5 client puts it in the path. */
    $id = (string) ($ctx['body']['id'] ?? $ctx['params']['id'] ?? '');
    return wx_guard('file.restore', static fn() => ['data' => wx_fm_restore($id, $u) + ['items' => wx_fm_trash_list()]]);
}

/**
 * GET /files/zip — download a folder as a zip.
 *
 * Not wrapped in the approval gate: reading a copy of files the person can already read one by one is not
 * a change to anything. It is audited, because "who downloaded the whole assets folder" is worth a row.
 */
function wx_route_files_zip(array $ctx): array
{
    $u = wx_require_user('fm_zip', WX_FILES_READ);
    $dir = (string) ($ctx['query']['dir'] ?? '');
    return ['__file' => wx_fm_zip($dir, $u)];
}

/** The path from `assets` down to the current folder, for a breadcrumb. */
function wx_fm_crumbs(string $dir): array
{
    $dir = trim($dir, '/');
    if ($dir === '' || $dir === 'assets') {
        return [['rel' => 'assets', 'label' => 'assets']];
    }
    $parts = explode('/', $dir);
    $out = [['rel' => 'assets', 'label' => 'assets']];
    $acc = '';
    foreach ($parts as $p) {
        $acc = $acc === '' ? $p : $acc . '/' . $p;
        $out[] = ['rel' => $acc, 'label' => $p];
    }
    return $out;
}
