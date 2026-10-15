<?php
/**
 * api/v2/routes/ai.php — the studio's AI settings, and the two calls that use them.
 *
 * Four routes, and only one of them changes anything:
 *
 *   1. `GET  /ai/settings` — the record with every key masked, the four providers, the limits, and whether
 *      this server can make the request at all.
 *   2. `POST /ai/settings` — save. Queued for a Manager under v2.1's own policy for `cms_ai_save`.
 *   3. `POST /ai/models`   — list a provider's chat models, using a key you have just typed or the saved one.
 *   4. `POST /ai/test`     — one small request, to prove the key works before anybody writes an article.
 *
 * Who may do it: v2.1 asked for owner or admin (`need($OA)`) on all four, and that is kept. A key is a
 * company secret and a model list costs money to fetch; neither is an editor's job.
 */

declare(strict_types=1);

const WX_AI_ROLES = ['owner', 'admin'];

/** GET /ai/settings — what is stored, masked, with the facts the screen cannot work out for itself. */
function wx_route_ai_get(array $ctx): array
{
    wx_require_user('cms_ai_get', WX_AI_ROLES);
    return ['data' => wx_ai_state()];
}

/**
 * POST /ai/settings — save the record.
 *
 * The gate is v2.1's: `cms_ai_save` ends in `save`, so an admin with the manager switch on asks the Master
 * first, exactly as they did before the screens moved.
 */
function wx_route_ai_save(array $ctx): array
{
    return wx_appr_route('cms_ai_save', $ctx, 'ai', 'wx_route_ai_save_do', static fn() => wx_route_ai_save_do($ctx));
}

function wx_route_ai_save_do(array $ctx): array
{
    $u = wx_require_user('cms_ai_save', WX_AI_ROLES);
    $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    $in = is_array($body['ai'] ?? null) ? $body['ai'] : $body;

    return wx_guard('ai.save', static function () use ($u, $in) {
        [$ai, $changed] = wx_ai_save($in);
        /* v2.1's audit action and target, so the activity log reads the same. The *fields* are recorded
           and the values are not: an audit row that named a key would be a second copy of the secret. */
        wx_audit($u, 'settings.ai', (string) $ai['provider'], ['changed' => $changed]);
        return ['data' => wx_ai_state() + ['changed' => $changed]];
    });
}

/**
 * POST /ai/models — a provider's chat models.
 *
 * Not queued and not a write: it is a read of somebody else's list, it changes nothing, and v2.1 let it run
 * from the settings screen the moment a key was typed — which is when it is useful.
 */
function wx_route_ai_models(array $ctx): array
{
    return wx_appr_route('cms_ai_models', $ctx, 'ai', 'wx_route_ai_models_do', static fn() => wx_route_ai_models_do($ctx));
}

function wx_route_ai_models_do(array $ctx): array
{
    $u = wx_require_user('cms_ai_models', WX_AI_ROLES);
    $in = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
    return wx_guard('ai.models', static function () use ($u, $in) {
        $out = wx_ai_models_fetch($in);
        wx_audit($u, 'ai.models', (string) ($in['provider'] ?? ''), ['count' => count($out['models'])]);
        return ['data' => $out];
    });
}

/** POST /ai/test — one short request: "say OK", and the provider's answer cut to 60 characters. */
function wx_route_ai_test(array $ctx): array
{
    return wx_appr_route('ai_test', $ctx, 'ai', 'wx_route_ai_test_do', static fn() => wx_route_ai_test_do($ctx));
}

function wx_route_ai_test_do(array $ctx): array
{
    $u = wx_require_user('ai_test', WX_AI_ROLES);
    return wx_guard('ai.test', static function () use ($u) {
        $ai = wx_ai_record();
        $text = wx_ai_call($ai, 'Reply with one word.', 'Say OK.');
        wx_audit($u, 'ai.test', (string) $ai['provider']);
        return ['data' => ['provider' => (string) $ai['provider'], 'text' => mb_substr($text, 0, 60)]];
    });
}
