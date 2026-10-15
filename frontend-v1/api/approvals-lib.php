<?php
/** P39 Phase 2: Master approval.
 *  A Manager (role admin) change is not run. It is saved as "pending" with the full request.
 *  The Master opens Approvals, sees what was asked, and Approves (the same request is replayed under the Master's sign-in)
 *  or Rejects with a note. Used by admin.php and builder.php (one shared queue in _private/approvals.json). */

if (!defined('APPR_FILE')) define('APPR_FILE', dirname(__DIR__) . '/_private/approvals.json');
if (!defined('APPR_CFG')) define('APPR_CFG', dirname(__DIR__) . '/_private/approvals-cfg.json');
const APPR_MAX_PAYLOAD = 3000000; // 3 MB
const APPR_EXPIRE_DAYS = 14;

/** Never queued: own account, chat replies, uploads (not live until used), read-only actions. */
const APPR_SKIP = '~^(me|me_[a-z_]+|profile|password|login[a-z_0-9]*|logout|ping|poll|notif_poll|typing|status|setup|sec_[a-z0-9_]+|google_(me|link|unlink|login)|pw_[a-z_]+|chat_[a-z_]+|soc_comment_[a-z]+|soc_comments_sync|soc_ai_[a-z]+|lead_note|add_lead_note|media_upload|fm_upload|upload|import_url|fetch_page|appr_[a-z_]+|[a-z0-9_]*_test|ai_test|health_(scan|psi|speed)|seo_ai|ai_run|outline|improve|excerpt|meta|text|button|alt|fix|article|city|location|faqs|interactive|initialize|load)$~';
/** Admin actions that change something. */
const APPR_WRITE = '~(save|submit|delete|send|_new|restore|import|import2|merge|convert|_status|toggle|clear|purge|move|rename|trash|replace|reorder|connect|disconnect|_add|update|_action|mkdir|_zip|bill|photo|regen|revoke|_set|close|copy|invoice|link|sync|folder|_run|tick|optout|camp_action|delete)$~';
const APPR_EXTRA_WRITE = ['global_menu', 'global_chrome', 'media_alt', 'proj_meta', 'proj_milestones', 'dbx_row'];
const APPR_READS = ['crm_wa_status', 'gdata_status'];
const APPR_BUILDER_WRITE = ['save', 'restore', 'theme', 'page_new', 'media_delete', 'blocks_save', 'blocks_delete', 'blocks_import', 'blocks_sync'];

function appr_read(string $f, array $def = []): array { $d = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null; return is_array($d) ? $d : $def; }
function appr_write(string $f, array $d): void { @file_put_contents($f, json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX); }
function appr_cfg(): array { return array_merge(['manager' => true, 'developer' => false, 'notify' => true], appr_read(APPR_CFG)); }

/** Should this request wait for the Master? $src = admin|builder */
function appr_needed(string $role, string $action, string $src): bool {
    if (!empty($GLOBALS['WX_APPR_REPLAY'])) return false;
    $c = appr_cfg();
    if (!(($role === 'admin' && $c['manager']) || ($role === 'editor' && $c['developer']))) return false;
    if ($src === 'builder') return in_array($action, APPR_BUILDER_WRITE, true);
    if (preg_match(APPR_SKIP, $action) || in_array($action, APPR_READS, true)) return false;
    if ($action === 'health_settings') return count(array_diff(array_keys($GLOBALS['in'] ?? []), ['action'])) > 0;
    return in_array($action, APPR_EXTRA_WRITE, true) || (bool)preg_match(APPR_WRITE, $action);
}

/** Plain-language summary for the Master. */
function appr_summary(string $src, string $action, array $in): string {
    $t = function ($k) use ($in) { $v = $in[$k] ?? ''; return is_scalar($v) ? trim(mb_substr((string)$v, 0, 80)) : ''; };
    $what = $t('title') ?: $t('name') ?: $t('path') ?: $t('email') ?: $t('client') ?: $t('label') ?: ($t('id') !== '' ? '#' . $t('id') : '');
    $verb = preg_match('~delete|trash|purge~', $action) ? 'Delete' : (preg_match('~send|camp_action~', $action) ? 'Send' : (preg_match('~new|add|import~', $action) ? 'Add' : (preg_match('~restore~', $action) ? 'Restore' : 'Change')));
    $area = $src === 'builder' ? ($action === 'theme' ? 'website theme' : (strpos($action, 'blocks') === 0 ? 'section library' : 'page')) : str_replace('_', ' ', preg_replace('~_(save|delete|send|new|add|status|update|set)$~', '', $action));
    return trim($verb . ' ' . $area . ($what !== '' ? ': ' . $what : ''));
}

function appr_queue(array $u, string $src, string $action, array $in): array {
    unset($in['action']);
    $raw = json_encode($in, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($raw === false || strlen($raw) > APPR_MAX_PAYLOAD) return ['ok' => false, 'error' => 'This change is too large to send for approval. Ask the Master to make it.'];
    $all = appr_read(APPR_FILE); $id = 'A' . date('ymdHis') . substr(bin2hex(random_bytes(3)), 0, 4);
    $item = ['id' => $id, 'src' => $src, 'action' => $action, 'in' => $in, 'summary' => appr_summary($src, $action, $in), 'by' => ['id' => (int)$u['id'], 'name' => (string)($u['name'] ?? ''), 'role' => (string)$u['role']], 'at' => date('c'), 'status' => 'pending'];
    array_unshift($all, $item); $all = array_slice($all, 0, 500); appr_write(APPR_FILE, $all);
    appr_alert($item);
    if (function_exists('tg_alert')) tg_alert('appr', "🛡 <b>Waiting for Master approval</b>\n" . tg_h($item['summary']) . ' · by ' . tg_h((string)$item['by']['name']));
    return ['ok' => true, 'pending' => true, 'approval' => $id, 'message' => 'Sent to the Master for approval: ' . $item['summary']];
}

/** Bell + optional email to the Master (uses the admin notification feed when available). */
function appr_alert(array $item): void {
    if (!appr_cfg()['notify']) return;
    $feed = dirname(__DIR__) . '/_private/appr-feed.json'; $f = appr_read($feed);
    array_unshift($f, ['id' => $item['id'], 'text' => $item['by']['name'] . ' asks approval: ' . $item['summary'], 'at' => $item['at']]); appr_write($feed, array_slice($f, 0, 100));
    if (function_exists('crm_cfg') && function_exists('crm_mail') && function_exists('q')) {
        try { $c = crm_cfg(); foreach (q("SELECT email FROM wx_users WHERE role='owner' AND active=1")->fetchAll() as $o) if (filter_var($o['email'], FILTER_VALIDATE_EMAIL) && !empty($c['smtpHost'])) @crm_mail($o['email'], 'Approval needed: ' . $item['summary'], $item['by']['name'] . " asked for this change in Woodex Admin.\nOpen Admin -> Approvals to approve or reject."); } catch (Throwable $e) { error_log('appr mail: ' . $e->getMessage()); }
    }
}

function appr_list(string $status = 'pending'): array {
    $all = appr_read(APPR_FILE); $now = time(); $changed = false;
    foreach ($all as &$a) if ($a['status'] === 'pending' && strtotime($a['at']) < $now - APPR_EXPIRE_DAYS * 86400) { $a['status'] = 'expired'; $changed = true; }
    unset($a); if ($changed) appr_write(APPR_FILE, $all);
    return array_values(array_filter($all, fn($a) => $status === 'all' || $a['status'] === $status));
}
function appr_get(string $id): ?array { foreach (appr_read(APPR_FILE) as $a) if ($a['id'] === $id) return $a; return null; }
function appr_set(string $id, array $patch): void { $all = appr_read(APPR_FILE); foreach ($all as &$a) if ($a['id'] === $id) $a = array_merge($a, $patch); unset($a); appr_write(APPR_FILE, $all); }

/** Master approves: mark, then hand back [action, in] for the caller to run. Result is recorded at shutdown. */
function appr_begin_replay(array $master, string $id, string $src): array {
    if (($master['role'] ?? '') !== 'owner') { http_response_code(403); echo json_encode(['ok' => false, 'error' => 'Only the Master can approve changes']); exit; }
    $a = appr_get($id);
    if (!$a || $a['src'] !== $src) { echo json_encode(['ok' => false, 'error' => 'Approval not found']); exit; }
    if ($a['status'] !== 'pending') { echo json_encode(['ok' => false, 'error' => 'Already ' . $a['status']]); exit; }
    $edits = $GLOBALS['WX_APPR_EDITS'] ?? null; $in = is_array($edits) ? array_merge($a['in'], $edits) : $a['in'];
    appr_set($id, ['status' => 'applying', 'decidedBy' => (string)($master['name'] ?? 'Master'), 'decidedAt' => date('c')]);
    $GLOBALS['WX_APPR_REPLAY'] = true;
    ob_start();
    register_shutdown_function(function () use ($id) {
        $o = trim((string)ob_get_contents()); $j = json_decode($o, true); if (!is_array($j) && ($p = strrpos($o, "\n{")) !== false) $j = json_decode(substr($o, $p + 1), true);
        if (is_array($j) && !empty($j['ok'])) appr_set($id, ['status' => 'approved']);
        else appr_set($id, ['status' => 'pending', 'lastError' => is_array($j) ? (string)($j['error'] ?? 'Failed') : 'Failed']);
        if (ob_get_level()) ob_end_flush();
    });
    $in['action'] = $a['action'];
    return [$a['action'], $in];
}
