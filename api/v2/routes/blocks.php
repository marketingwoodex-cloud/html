<?php
/**
 * api/v2/routes/blocks.php — the section library, and pushing a global section to the pages that use it.
 *
 * Six routes over the six v2.1 actions (`blocks_list`, `blocks_save`, `blocks_delete`, `blocks_import`,
 * `blocks_usage`, `blocks_sync`), so the permission matrix and the approval policy stay the ones the
 * business already agreed to: the three writers match the policy's write verbs and are queued for a Manager
 * exactly as they were in the builder.
 *
 * The one route that is not a translation is `POST /blocks/{blk}/sync`. In v2.1 it was `blocks_sync`, which
 * copied every changed page to `_private/backups/<page>/` and wrote the file. Here it goes through
 * `wx_page_write_many()`: the push is a *change*, with a batch id, and it can be rolled back from the page
 * history like the header change. The backup folder was a version store with no index and no undo; this is
 * the same idea with both.
 */

declare(strict_types=1);

const WX_BLOCKS_EDIT = ['owner', 'admin', 'editor'];

/** GET /blocks — the library. `?import=1` reads the v2.1 file across once; `?cat=` `?global=1` filter. */
function wx_route_blocks_list(array $ctx): array
{
    wx_require_user('blocks_list', WX_BLOCKS_EDIT);
    $import = null;
    if (!empty($ctx['query']['import'])) {
        $import = wx_blocks_import_legacy();
    }
    $global = isset($ctx['query']['global']) ? true : null;
    return ['data' => wx_blocks_list((string) ($ctx['query']['cat'] ?? ''), $global) + ['import' => $import]];
}

/** GET /blocks/usage — which pages carry each global section, in one walk of the site. */
function wx_route_blocks_usage(array $ctx): array
{
    wx_require_user('blocks_usage', WX_BLOCKS_EDIT);
    $usage = wx_blocks_usage_all();
    $total = 0;
    foreach ($usage as $u) {
        $total += count($u['pages']);
    }
    return ['data' => [
        'usage' => $usage,
        'globals' => count($usage),
        'placements' => $total,
        'pages' => count(wx_page_walk(WX_SITE_ROOT)),
    ]];
}

/** POST /blocks — create or edit. An edit keeps the block's token, because pages carry it. */
function wx_route_blocks_save(array $ctx): array
{
    return wx_appr_route('blocks_save', $ctx, 'blocks', 'wx_route_blocks_save_do', static fn() => wx_route_blocks_save_do($ctx));
}

function wx_route_blocks_save_do(array $ctx): array
{
    $u = wx_require_user('blocks_save', WX_BLOCKS_EDIT);
    return wx_guard('blocks.save', static fn() => ['data' => wx_block_save(is_array($ctx['body']) ? $ctx['body'] : [], $u)]);
}

/** POST /blocks/import — the builder's export shape, pasted in. */
function wx_route_blocks_import(array $ctx): array
{
    return wx_appr_route('blocks_import', $ctx, 'blocks', 'wx_route_blocks_import_do', static fn() => wx_route_blocks_import_do($ctx));
}

function wx_route_blocks_import_do(array $ctx): array
{
    $u = wx_require_user('blocks_import', WX_BLOCKS_EDIT);
    $blocks = is_array($ctx['body']['blocks'] ?? null) ? $ctx['body']['blocks'] : [];
    if (!$blocks) {
        throw ApiError::validation('Send the blocks to import in `blocks`', 'blocks');
    }
    return wx_guard('blocks.import', static fn() => ['data' => wx_blocks_import($blocks, $u) + wx_blocks_list(null, null)]);
}

/** DELETE /blocks/{blk}?force=1 — remove it, detaching any copies if it is in use and `force` is set. */
function wx_route_blocks_delete(array $ctx): array
{
    return wx_appr_route('blocks_delete', $ctx, 'blocks', 'wx_route_blocks_delete_do', static fn() => wx_route_blocks_delete_do($ctx));
}

function wx_route_blocks_delete_do(array $ctx): array
{
    $u = wx_require_user('blocks_delete', WX_BLOCKS_EDIT);
    $blk = (string) ($ctx['params']['blk'] ?? $ctx['body']['blk'] ?? '');
    $force = !empty($ctx['body']['force']) || !empty($ctx['query']['force']);
    return wx_guard('blocks.delete', static fn() => ['data' => wx_block_delete($blk, $force, $u) + wx_blocks_list(null, null)]);
}

/**
 * POST /blocks/{blk}/sync — push the current block to every page that carries its token.
 *
 * Returns the batch id, so the screen can say the push is one undo rather than "148 files were written".
 */
function wx_route_blocks_sync(array $ctx): array
{
    return wx_appr_route('blocks_sync', $ctx, 'blocks', 'wx_route_blocks_sync_do', static fn() => wx_route_blocks_sync_do($ctx));
}

function wx_route_blocks_sync_do(array $ctx): array
{
    $u = wx_require_user('blocks_sync', WX_BLOCKS_EDIT);
    $blk = (string) ($ctx['params']['blk'] ?? $ctx['body']['blk'] ?? '');
    return wx_guard('blocks.sync', static fn() => ['data' => wx_block_sync($blk, $u)]);
}
