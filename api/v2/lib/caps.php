<?php
/**
 * api/v2/lib/caps.php — who may call what.
 *
 * v2.1 hardcoded the whole matrix in roles-lib.php: wx_role_groups() returned a literal array per
 * role, wx_action_group() matched a literal list of regexes, SHARED and EXPAND were consts, and
 * per-user grants lived in _private/security.json. That is why permissions could not be inspected,
 * audited or changed without a deploy — and why the analysis report originally mistook those five
 * function names for missing tables.
 *
 * The decision *procedure* below is a faithful port, because porting behaviour is the point of a
 * strangler migration: a user who can see the pipeline in v2.1 can see it in v2.5 on day one. What
 * changed is where the rules live — seeded rows in wx_roles, wx_role_groups, wx_action_groups,
 * wx_action_shared, wx_action_roles and wx_user_perms (db/migrations/001_roles.sql). Same answers,
 * now auditable:
 *
 *   node tools/gen-caps.mjs --check     confirms the seeded rows still match roles-lib.php
 */

declare(strict_types=1);

/** The matrix, loaded once per request. */
function wx_caps_load(): array
{
    static $caps = null;
    if ($caps !== null) {
        return $caps;
    }
    $caps = ['role_groups' => [], 'expand' => [], 'shared' => [], 'groups' => [], 'regex' => [], 'roles' => [], 'labels' => []];

    if (!wx_table_exists('wx_role_groups')) {
        // Pre-migration install: fail closed rather than granting anything.
        throw ApiError::internal('The database is not migrated yet (wx_role_groups missing) — see db/migrations');
    }

    foreach (wx_all('SELECT role, grp, expand FROM wx_role_groups') as $r) {
        $caps['role_groups'][(string) $r['role']][] = (string) $r['grp'];
        if ((int) $r['expand'] === 1) {
            $caps['expand'][(string) $r['grp']][] = (string) $r['role'];
        }
    }
    foreach (wx_all('SELECT action, grp FROM wx_action_shared') as $r) {
        $caps['shared'][(string) $r['action']][] = (string) $r['grp'];
    }
    // Ordered: two patterns can match the same action, and v2.1 answers with the first in its array.
    foreach (wx_all('SELECT pattern, grp, is_regex FROM wx_action_groups ORDER BY ord ASC') as $r) {
        if ((int) $r['is_regex'] === 1) {
            $caps['regex'][] = [(string) $r['pattern'], (string) $r['grp']];
        } else {
            $caps['groups'][(string) $r['pattern']] = (string) $r['grp'];
        }
    }
    foreach (wx_all('SELECT action, role FROM wx_action_roles') as $r) {
        $caps['roles'][(string) $r['action']][] = (string) $r['role'];
    }
    foreach (wx_all('SELECT id, label FROM wx_roles') as $r) {
        $caps['labels'][(string) $r['id']] = (string) $r['label'];
    }
    return $caps;
}

/** Per-user extra groups. v2.1 read these from security.json; now they are rows. */
function wx_user_perms(int $userId): array
{
    static $cache = [];
    if (array_key_exists($userId, $cache)) {
        return $cache[$userId];
    }
    if (!wx_table_exists('wx_user_perms')) {
        $cache[$userId] = [];
        return [];
    }
    $rows = wx_all('SELECT grp FROM wx_user_perms WHERE user_id = ?', [$userId]);
    $perms = array_map(static function ($r) { return (string) $r['grp']; }, $rows);
    $cache[$userId] = array_values(array_intersect($perms, array_keys(WX_PERM_GROUPS)));
    return $cache[$userId];
}

/** Which permission group an action belongs to, or null when the action has no group rule. */
function wx_action_group(string $action): ?string
{
    $caps = wx_caps_load();
    if (isset($caps['groups'][$action])) {
        return $caps['groups'][$action];
    }
    foreach ($caps['regex'] as $pair) {
        if (preg_match($pair[0], $action) === 1) {
            return $pair[1];
        }
    }
    return null;
}

/**
 * The v2.1 decision, reproduced:
 *   · an action in SHARED needs any one of its groups;
 *   · an action matching no group has no rule, and the caller's own role list decides (null);
 *   · otherwise the role's groups (plus per-user grants) must include the action's group, and where
 *     the action's legacy check listed fewer roles, the EXPAND table can still allow it.
 *
 * $legacyRoles is the role list the route declares, the equivalent of need(['owner','admin']).
 */
function wx_can(array $user, string $action, array $legacyRoles = []): bool
{
    $caps = wx_caps_load();
    $role = (string) $user['role'];
    $extra = wx_user_perms((int) $user['id']);
    $mine = array_merge($caps['role_groups'][$role] ?? [], $extra);

    if (isset($caps['shared'][$action])) {
        foreach ($caps['shared'][$action] as $grp) {
            if (in_array($grp, $mine, true)) {
                return true;
            }
            if ($grp === 'support_view' && in_array('sales', $mine, true)) {
                return true;
            }
        }
        return false;
    }

    $grp = wx_action_group($action);
    if ($grp === null) {
        // No rule for this action: the route's declared roles decide.
        return !$legacyRoles || in_array($role, $legacyRoles, true);
    }

    // Screens that stay owner+admin even though a broader group pattern also matches them. v2.1
    // hardcoded this list inside wx_allowed(); it is wx_action_roles now, generated from that same
    // list by tools/gen-caps.mjs — so the answer is unchanged, and a change to it is a reviewable row.
    if (!empty($caps['roles'][$action])) {
        return in_array($role, $caps['roles'][$action], true);
    }

    $has = in_array($grp, $mine, true)
        || (in_array($grp, ['support_view', 'updates'], true) && in_array('sales', $mine, true));
    if (!$has) {
        return false;
    }
    if (!$legacyRoles || in_array($role, $legacyRoles, true)) {
        return true;
    }
    return in_array($role, $caps['expand'][$grp] ?? [], true) || in_array($grp, $extra, true);
}

/** The /me payload: what this user may open. Mirrors v2.1's wx_caps() with the same keys. */
function wx_caps(array $user): array
{
    $role = (string) $user['role'];
    $caps = wx_caps_load();
    $extra = wx_user_perms((int) $user['id']);
    return [
        'label' => $caps['labels'][$role] ?? (WX_ROLE_LABELS[$role] ?? ucfirst($role)),
        'groups' => array_values(array_unique(array_merge($caps['role_groups'][$role] ?? [], $extra))),
        'perms' => $extra,
    ];
}

/** Grant or remove a per-user group. Owner-only at the route layer. */
function wx_user_perms_set(int $userId, array $groups): void
{
    $clean = array_values(array_intersect(array_map('strval', $groups), array_keys(WX_PERM_GROUPS)));
    wx_q('DELETE FROM wx_user_perms WHERE user_id = ?', [$userId]);
    foreach ($clean as $g) {
        wx_insert('wx_user_perms', ['user_id' => $userId, 'grp' => $g]);
    }
}
