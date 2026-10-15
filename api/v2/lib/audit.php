<?php
/**
 * api/v2/lib/audit.php — every write leaves a trace.
 *
 * Master plan §6.4 rule 4: actor, action, target, request-id and IP go into wx_activity. v2.1 had
 * wx_activity but only wrote to it from a handful of call sites and never recorded the request, so
 * two edits a second apart were indistinguishable.
 *
 * The table gains req_id and meta_json in db/migrations/000_platform.sql. Writing an audit row must
 * never break the operation being audited, so failures are logged and swallowed.
 */

declare(strict_types=1);

/**
 * @param array|null $actor  the signed-in user row, or null for anonymous (login attempts, public forms)
 * @param string     $action dotted action name, e.g. "lead.save"
 * @param string     $target what it happened to, e.g. "lead:42"
 * @param array      $meta   small non-secret extras (changed fields, old value, reason)
 */
function wx_audit(?array $actor, string $action, string $target = '', array $meta = []): void
{
    static $columns = null;
    try {
        if ($columns === null) {
            $columns = [
                'req_id' => wx_column_exists('wx_activity', 'req_id'),
                'meta_json' => wx_column_exists('wx_activity', 'meta_json'),
            ];
        }
        $row = [
            'user_id' => isset($actor['id']) ? (int) $actor['id'] : null,
            'user_name' => isset($actor['name']) ? (string) $actor['name'] : null,
            'action' => substr($action, 0, 60),
            'target' => substr($target, 0, 255),
            'ip' => wx_ip(),
            'created_at' => wx_now(),
        ];
        if ($columns['req_id']) {
            $row['req_id'] = wx_request_id();
        }
        if ($columns['meta_json'] && $meta) {
            $row['meta_json'] = substr((string) json_encode($meta, JSON_UNESCAPED_SLASHES), 0, 2000);
        }
        wx_insert('wx_activity', $row);
    } catch (Throwable $e) {
        error_log('[wx-v2] audit failed for ' . $action . ': ' . $e->getMessage());
    }
}

/** Read side of the audit log, paginated, filterable — used by the Activity screen in P2. */
function wx_activity_page(array $filter = [], int $limit = 50, int $offset = 0): array
{
    $where = [];
    $params = [];
    if (!empty($filter['user_id'])) {
        $where[] = 'user_id = ?';
        $params[] = (int) $filter['user_id'];
    }
    if (!empty($filter['action'])) {
        $where[] = 'action LIKE ?';
        $params[] = (string) $filter['action'] . '%';
    }
    if (!empty($filter['since'])) {
        $where[] = 'created_at >= ?';
        $params[] = (string) $filter['since'];
    }
    $sql = 'FROM wx_activity' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $total = (int) wx_val('SELECT COUNT(*) ' . $sql, $params);
    $rows = wx_all('SELECT * ' . $sql . ' ORDER BY id DESC LIMIT ' . $limit . ' OFFSET ' . $offset, $params);
    return ['rows' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}
