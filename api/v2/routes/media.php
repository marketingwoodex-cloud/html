<?php
/**
 * api/v2/routes/media.php — the library, the derivatives, and the alt-text queue.
 *
 * The screen this serves is the one Phase 3 asks for: every picture on the site, which pages use it,
 * which ones have no alt text, and what has been deleted. It is also where the browser does the resizing
 * (canvas), so the API's job on that path is to receive what the browser produced and write it into the
 * pages that show the image — as one reversible batch.
 *
 * Writes go through `wx_appr_route()`: the v2.1 policy decides which of them a Manager must ask the
 * Master about (a replacement that changes a live picture is queued; an upload is not), and this file
 * does not have an opinion of its own about that.
 */

declare(strict_types=1);

const WX_MEDIA_EDIT = ['owner', 'admin', 'editor'];
const WX_MEDIA_KEEP = ['owner', 'admin'];

/** GET /media — the library, with usage, derivatives and the two counts the screen leads with. */
function wx_route_media_list(array $ctx): array
{
    wx_require_user('media_list', WX_MEDIA_EDIT);
    $import = null;
    if (!empty($ctx['query']['import'])) {
        /* Read that writes, idempotent, and the first person on this screen after the upgrade should see
           their existing alt text rather than an empty library. */
        $import = wx_media_import_legacy();
    }
    return ['data' => wx_media_list() + ['tree' => wx_media_tree(), 'import' => $import]];
}

/** GET /media/alt — the alt-text queue: images nobody has looked at. */
function wx_route_media_alt_queue(array $ctx): array
{
    wx_require_user('media_alt', WX_MEDIA_EDIT);
    $limit = (int) ($ctx['query']['limit'] ?? 200);
    $missing = wx_media_missing_alt($limit);
    $urgent = [];
    if ($missing) {
        /* Which of them are on a live page *now* — the queue is sorted by nothing more useful than
           "newest first", and the images that are actually being served to somebody are the ones to
           describe first. */
        $hay = wx_media_haystack();
        foreach ($missing as $m) {
            $urgent[$m['url']] = count(wx_media_used($m['url'], $hay));
        }
        arsort($urgent);
    }
    return ['data' => [
        'missing' => $missing,
        'usedOn' => $urgent,
        'total' => count($missing),
        'checked' => (int) wx_val('SELECT COUNT(*) FROM wx_media_alt WHERE checked_at IS NOT NULL'),
    ]];
}

/** POST /media/alt — save alt text, and optionally fill it into the pages that show the image. */
function wx_route_media_alt_save(array $ctx): array
{
    return wx_appr_route('media_alt', $ctx, 'media', 'wx_route_media_alt_save_do', static fn() => wx_route_media_alt_save_do($ctx));
}

function wx_route_media_alt_save_do(array $ctx): array
{
    $u = wx_require_user('media_alt', WX_MEDIA_EDIT);
    $url = (string) ($ctx['body']['url'] ?? '');
    $alt = (string) ($ctx['body']['alt'] ?? '');
    $apply = !empty($ctx['body']['apply']);
    return wx_guard('media.alt', static fn() => ['data' => wx_media_alt_save($url, $alt, $apply, $u)]);
}

/** POST /media/upload — store an image (the browser has already resized it if it needed to). */
function wx_route_media_upload(array $ctx): array
{
    return wx_appr_route('media_upload', $ctx, 'media', 'wx_route_media_upload_do', static fn() => wx_route_media_upload_do($ctx));
}

function wx_route_media_upload_do(array $ctx): array
{
    $u = wx_require_user('media_upload', WX_MEDIA_EDIT);
    $r = wx_guard('media.upload', static fn() => wx_media_upload(
        (string) ($ctx['body']['data'] ?? ''),
        (string) ($ctx['body']['name'] ?? 'image'),
        (string) ($ctx['body']['folder'] ?? ''),
        (string) ($ctx['body']['alt'] ?? ''),
        $u
    ));
    wx_audit($u, 'media.upload', $r['url'], ['bytes' => $r['bytes']]);
    return ['data' => $r];
}

/** POST /media/replace — swap the bytes behind an address the pages already point at. */
function wx_route_media_replace(array $ctx): array
{
    return wx_appr_route('media_replace', $ctx, 'media', 'wx_route_media_replace_do', static fn() => wx_route_media_replace_do($ctx));
}

function wx_route_media_replace_do(array $ctx): array
{
    $u = wx_require_user('media_replace', WX_MEDIA_KEEP);
    return wx_guard('media.replace', static fn() => ['data' => wx_media_replace(
        (string) ($ctx['body']['url'] ?? ''),
        (string) ($ctx['body']['data'] ?? ''),
        $u
    )]);
}

/** POST /media/sizes — the derivatives the browser rendered, plus the srcset into the pages. */
function wx_route_media_sizes(array $ctx): array
{
    return wx_appr_route('media_sizes', $ctx, 'media', 'wx_route_media_sizes_do', static fn() => wx_route_media_sizes_do($ctx));
}

function wx_route_media_sizes_do(array $ctx): array
{
    $u = wx_require_user('media_sizes', WX_MEDIA_EDIT);
    $files = is_array($ctx['body']['files'] ?? null) ? $ctx['body']['files'] : [];
    return wx_guard('media.sizes', static fn() => ['data' => wx_media_sizes(
        (string) ($ctx['body']['url'] ?? ''),
        (int) ($ctx['body']['ow'] ?? 0),
        $files,
        $u
    )]);
}

/** POST /media/folder — a new folder under assets/uploads. */
function wx_route_media_folder(array $ctx): array
{
    return wx_appr_route('media_folder', $ctx, 'media', 'wx_route_media_folder_do', static fn() => wx_route_media_folder_do($ctx));
}

function wx_route_media_folder_do(array $ctx): array
{
    $u = wx_require_user('media_folder', WX_MEDIA_EDIT);
    $name = wx_media_folder((string) ($ctx['body']['name'] ?? ''));
    wx_audit($u, 'media.folder', $name);
    return ['data' => ['name' => $name, 'folders' => wx_media_list()['folders']]];
}

/** POST /media/move — move images that no page uses into another folder. */
function wx_route_media_move(array $ctx): array
{
    return wx_appr_route('media_move', $ctx, 'media', 'wx_route_media_move_do', static fn() => wx_route_media_move_do($ctx));
}

function wx_route_media_move_do(array $ctx): array
{
    $u = wx_require_user('media_move', WX_MEDIA_EDIT);
    $urls = is_array($ctx['body']['urls'] ?? null) ? $ctx['body']['urls'] : [];
    return wx_guard('media.move', static fn() => ['data' => wx_media_move($urls, (string) ($ctx['body']['folder'] ?? ''), $u)]);
}

/** DELETE /media — move images to the trash (refused while a page still uses them, unless forced). */
function wx_route_media_trash(array $ctx): array
{
    return wx_appr_route('media_trash', $ctx, 'media', 'wx_route_media_trash_do', static fn() => wx_route_media_trash_do($ctx));
}

function wx_route_media_trash_do(array $ctx): array
{
    $u = wx_require_user('media_trash', WX_MEDIA_KEEP);
    $urls = is_array($ctx['body']['urls'] ?? null) ? $ctx['body']['urls'] : [];
    $force = !empty($ctx['body']['force']);
    return wx_guard('media.trash', static fn() => ['data' => wx_media_trash($urls, $force, $u)]);
}

/** GET /media/trash — what was deleted or replaced, and whether it can come back. */
function wx_route_media_trash_list(array $ctx): array
{
    wx_require_user('media_trash_list', WX_MEDIA_KEEP);
    return ['data' => [
        'items' => wx_media_trash_list(),
        'bytes' => (int) wx_val('SELECT COALESCE(SUM(bytes),0) FROM wx_media_trash'),
    ]];
}

/** POST /media/trash/{id}/restore — put it back, or put the old picture back over the new one. */
function wx_route_media_restore(array $ctx): array
{
    return wx_appr_route('media_restore', $ctx, 'media', 'wx_route_media_restore_do', static fn() => wx_route_media_restore_do($ctx));
}

function wx_route_media_restore_do(array $ctx): array
{
    $u = wx_require_user('media_restore', WX_MEDIA_KEEP);
    $id = (int) ($ctx['params']['id'] ?? 0);
    return wx_guard('media.restore', static fn() => ['data' => wx_media_restore($id, $u)]);
}

/** DELETE /media/trash/{id} — drop it for good. DELETE /media/trash empties the trash. */
function wx_route_media_purge(array $ctx): array
{
    return wx_appr_route('media_purge', $ctx, 'media', 'wx_route_media_purge_do', static fn() => wx_route_media_purge_do($ctx));
}

function wx_route_media_purge_do(array $ctx): array
{
    $u = wx_require_user('media_purge', WX_MEDIA_KEEP);
    $id = isset($ctx['params']['id']) ? (int) $ctx['params']['id'] : null;
    return wx_guard('media.purge', static fn() => ['data' => wx_media_purge($id, $id === null, $u)]);
}

/**
 * The folders the library shows: the two fixed homes (`site` for assets/img, `uploads` for the root of
 * assets/uploads) and every folder somebody made.
 */
function wx_media_tree(): array
{
    $list = wx_media_list();
    $folders = [['rel' => 'site', 'label' => 'Site images', 'writable' => false]];
    $folders[] = ['rel' => 'uploads', 'label' => 'Uploads', 'writable' => true];
    foreach ($list['folders'] as $f) {
        $folders[] = ['rel' => $f, 'label' => $f, 'writable' => true];
    }
    return $folders;
}

/**
 * POST /media/import — pull a stock image in from a public https link (v2.1's `import_url`).
 *
 * The two interesting parts are not in this function: which links may be requested at all is
 * `lib/fetch.php` (https only, no credentials, no port, a name rather than an address, every resolved
 * address public, every redirect hop re-checked), and what may be *stored* is the same `wx_media_upload()`
 * the upload button uses — so a link that answers with an HTML page, a zip or an SVG is refused by the
 * content check rather than by this handler remembering to look.
 */
function wx_route_media_import(array $ctx): array
{
    return wx_appr_route('import_url', $ctx, 'media', 'wx_route_media_import_do', static fn() => wx_route_media_import_do($ctx));
}

function wx_route_media_import_do(array $ctx): array
{
    $u = wx_require_user('import_url', WX_MEDIA_EDIT);
    $url = (string) ($ctx['body']['url'] ?? '');
    $name = (string) ($ctx['body']['name'] ?? 'stock');
    $folder = (string) ($ctx['body']['folder'] ?? '');
    $alt = (string) ($ctx['body']['alt'] ?? '');
    $img = wx_fetch_image($url);
    $stored = wx_guard('media.import', static fn(): array => wx_media_upload(
        base64_encode($img['body']),
        $name,
        $folder,
        $alt,
        $u
    ));
    /* The receipt says where the bytes came from: an image whose origin is not written down is an image
       nobody can check later. */
    wx_audit($u, 'media.import', $stored['url'], ['from' => mb_substr($img['url'], 0, 300), 'bytes' => $stored['bytes']]);
    return ['data' => $stored + ['from' => $img['url']]];
}
