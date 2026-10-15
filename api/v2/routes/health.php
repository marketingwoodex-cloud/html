<?php
/**
 * api/v2/routes/health.php — liveness, version, and whether the platform is actually usable.
 *
 * Phase 1 needs a probe that answers "is the round trip wired" without a signed-in user, because
 * that is what the deploy check and the CI smoke run look at. It reports database reachability and
 * migration state, and deliberately nothing that could help an attacker map the install: no table
 * names, no counts, no paths.
 */

declare(strict_types=1);

function wx_route_health(array $ctx): array
{
    $db = ['reachable' => false, 'migrated' => false];
    try {
        wx_val('SELECT 1');
        $db['reachable'] = true;
        $db['migrated'] = wx_table_exists('wx_sessions') && wx_table_exists('wx_role_groups');
    } catch (Throwable $e) {
        $db['error'] = $e instanceof ApiError ? $e->code : 'INTERNAL';
    }

    $ready = $db['reachable'] && $db['migrated'];
    return [
        'data' => [
            'service' => 'woodex-api',
            'version' => WX_V2_VERSION,
            'php' => PHP_VERSION,
            'ready' => $ready,
            'db' => $db,
            'time' => gmdate('c'),
        ],
        'meta' => ['status' => $ready ? 'ok' : 'degraded'],
    ];
}

function wx_route_version(array $ctx): array
{
    return ['data' => ['version' => WX_V2_VERSION, 'api' => 2]];
}
