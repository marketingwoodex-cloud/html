<?php
/**
 * api/v2/routes/projects.php — a project, its milestones and its money.
 *
 * v2.1 keeps `wx_projects` as a JSON document with `milestones[]` and `updates[]` inside, and reads
 * **every** project on every screen — `projs_table` pulls the whole table into PHP and maps over it.
 * That is the read the plan singled out (§4, the 1.4 s table). Here:
 *
 *   · the list takes a page of rows in SQL and decodes only that page;
 *   · the derived money (billed, received, outstanding) comes from the invoice rows, not from a field
 *     somebody typed into the payload;
 *   · a project's milestone moves are recorded as history events, so "who slipped the date" has an
 *     answer.
 *
 * The payload shape is v2.1's, because the print pages and the client link read it: an unrecognised
 * field is preserved rather than dropped, so a v2.5 save cannot silently delete data the old admin
 * still uses.
 */

declare(strict_types=1);

/* ============================================================ the three pure pieces
   The list below is one SQL page, one money query and one aggregate; everything that *means* something
   about a project — its progress, its lateness, whether a milestone is billed, and the site-wide totals —
   is computed here, from data, with no database and no clock of its own. That is what makes the rules
   assertable: `tests/run.php` feeds these functions a project and its invoices and checks the answer,
   including the cases v2.1 got wrong on screen. */

/**
 * The WHERE a list request asks for, as fragments and bound parameters.
 *
 * Pure, and that is the point: the caller's string never reaches SQL. A filter the screen did not offer is
 * *ignored* rather than guessed at, so `?view=whatever` returns the default list instead of an error — and
 * the parameters come back separately, so "is anything interpolated?" is a question a test can answer.
 *
 * `$cols` is the caller's own column expressions, passed in rather than built here. That is not tidiness:
 * building them means asking the database which payload column this install uses (`payload` after
 * migration 003, `data` before it), and a function that reaches for a database cannot be tested in the
 * sandbox that has none — which is where every one of these rules is actually asserted.
 *
 * @param array<string,string> $cols keys: stage, target, line, name, no, client, site, ptype, invoice_id, invoice_project
 * @return array{where:array<int,string>, params:array<int,mixed>, view:string, stage:string, line:string}
 */
function wx_proj_filter(array $q, string $today, array $cols): array
{
    $stages = WX_PROJECT_STAGES;
    $stage = (string) ($q['stage'] ?? '');
    if ($stage !== '' && !in_array($stage, $stages, true)) {
        $stage = '';
    }
    $views = ['all', 'active', 'late', 'due', 'closed'];
    $view = (string) ($q['view'] ?? 'active');
    if (!in_array($view, $views, true)) {
        $view = 'active';
    }
    $line = (string) ($q['line'] ?? '');
    if ($line !== '' && !preg_match('~^[a-z0-9_-]{1,20}$~', $line)) {
        $line = '';
    }

    $where = [];
    $params = [];
    $stageSql = $cols['stage'];
    $targetSql = $cols['target'];
    $closed = 'closed'; // the last stage: a project that is finished is not late, and is not active

    if ($stage !== '') {
        $where[] = $stageSql . ' = ?';
        $params[] = $stage;
    } elseif ($view === 'active') {
        $where[] = $stageSql . ' <> ?';
        $params[] = $closed;
    } elseif ($view === 'closed') {
        $where[] = $stageSql . ' = ?';
        $params[] = $closed;
    } elseif ($view === 'late') {
        /* Late is a rule about an unfinished project whose handover date has gone by, so both halves are in
           the query — a filter that forgot the first half would list finished projects as late forever. */
        $where[] = $stageSql . ' <> ?';
        $params[] = $closed;
        $where[] = '(' . $targetSql . " <> '' AND " . $targetSql . ' < ?)';
        $params[] = $today;
    } elseif ($view === 'due') {
        /* Billed money that has not arrived yet, over both ways an invoice can belong to a project. The
           payments subquery is correlated, so an invoice with no payments row counts as unpaid rather than
           dropping out of the filter — a project whose only invoice has never been paid is exactly the one
           this view exists to show. */
        $where[] = '(EXISTS (SELECT 1 FROM wx_invoices i WHERE (i.id = ' . $cols['invoice_id'] . ' OR ' . $cols['invoice_project'] . ' = wx_projects.id)'
            . ' AND i.total > COALESCE((SELECT SUM(ip.amount) FROM wx_invoice_payments ip WHERE ip.invoice_id = i.id AND ip.reversed_at IS NULL), 0)))';
    }
    if ($line !== '') {
        $where[] = $cols['line'] . ' = ?';
        $params[] = $line;
    }
    /* The search is the one place a person's text arrives: two bound parameters, never a fragment. */
    $text = trim((string) ($q['q'] ?? ''));
    if ($text !== '') {
        $like = '%' . mb_substr($text, 0, 60) . '%';
        $where[] = '(' . $cols['name'] . ' LIKE ?'
            . ' OR ' . $cols['no'] . ' LIKE ?'
            . ' OR ' . $cols['client'] . ' LIKE ?'
            . ' OR ' . $cols['site'] . ' LIKE ?'
            . ' OR ' . $cols['ptype'] . ' LIKE ?)';
        for ($i = 0; $i < 5; $i++) {
            $params[] = $like;
        }
    }
    return ['where' => $where, 'params' => $params, 'view' => $view, 'stage' => $stage, 'line' => $line];
}

/** Where a stage sits in the studio's own order, as a percentage — the bar beside the stage name. */
function wx_proj_stage_pct(string $stage): int
{
    $at = array_search($stage, WX_PROJECT_STAGES, true);
    $last = count(WX_PROJECT_STAGES) - 1;
    return ($at === false || $last < 1) ? 0 : (int) round($at / $last * 100);
}

/**
 * One project, as the screens read it.
 *
 * $inv is every invoice belonging to this project — both kinds, because a project can be billed two ways:
 * one invoice for the whole contract (`invoice_id` on the project) or one invoice per milestone (each
 * invoice carries `project_id`). v2.1's own row read both; reading only the first would show a project
 * billed in three milestones as having invoiced nothing, which is the kind of wrong number that gets
 * chased for a week.
 *
 * @param array<string,mixed> $p     a decoded project document
 * @param array<int,array>    $inv   its invoices, each ['id','no','total','paid']
 * @param array<int,string>   $names user id → name, for the manager and the team
 */
function wx_proj_row(array $p, array $inv = [], array $names = [], string $today = ''): array
{
    $today = $today !== '' ? $today : date('Y-m-d');
    $value = (int) ($p['value'] ?? 0);
    $invoiced = 0;
    $received = 0;
    foreach ($inv as $i) {
        $invoiced += (int) ($i['total'] ?? 0);
        $received += (int) ($i['paid'] ?? 0);
    }
    $byId = [];
    foreach ($inv as $i) {
        $byId[(int) ($i['id'] ?? 0)] = $i;
    }

    $stage = (string) ($p['stage'] ?? 'planning');
    if (!in_array($stage, WX_PROJECT_STAGES, true)) {
        $stage = 'planning';
    }
    $target = (string) ($p['target'] ?? '');
    $late = $stage !== 'closed' && $target !== '' && $target < $today;

    /* Milestones are percentages of the contract. The amount, the invoice that billed it and whether that
       invoice is paid are three different facts, and the screen has to be able to tell them apart:
       a milestone whose invoice was deleted must not look unbilled (`inv_id` is set) and must not look
       paid (`missing`). */
    $milestones = [];
    $done = 0;
    foreach (is_array($p['milestones'] ?? null) ? $p['milestones'] : [] as $m) {
        if (!is_array($m)) {
            continue;
        }
        $pct = (float) ($m['pct'] ?? 0);
        $invId = (int) ($m['inv_id'] ?? 0);
        $i = $invId ? ($byId[$invId] ?? null) : null;
        $paid = (int) ($i['paid'] ?? 0);
        $total = (int) ($i['total'] ?? 0);
        $status = !$invId ? 'unbilled' : ($i === null ? 'missing' : ($paid >= $total ? 'paid' : ($paid > 0 ? 'partial' : 'billed')));
        if ($invId) {
            $done++;
        }
        $milestones[] = [
            'label' => (string) ($m['label'] ?? ''),
            'pct' => $pct,
            'amount' => (int) round($value * $pct / 100),
            'amountDisplay' => wx_pkr_out((int) round($value * $pct / 100)),
            'inv_id' => $invId ?: null,
            'inv_no' => (string) ($i['no'] ?? ''),
            'paid' => $paid,
            'status' => $status,
        ];
    }

    $updates = is_array($p['updates'] ?? null) ? $p['updates'] : [];
    $last = $updates ? $updates[count($updates) - 1] : null;
    $team = [];
    foreach (is_array($p['team'] ?? null) ? $p['team'] : [] as $t) {
        $id = (int) $t;
        if ($id > 0) {
            $team[] = $id;
        }
    }
    $manager = (int) ($p['manager'] ?? 0);

    return [
        'id' => (int) ($p['id'] ?? 0),
        'no' => (string) ($p['no'] ?? ''),
        'name' => (string) ($p['name'] ?? ''),
        'client_id' => (int) ($p['client_id'] ?? 0),
        'client_name' => (string) ($p['client_name'] ?? ''),
        'site' => (string) ($p['site'] ?? ''),
        'line' => (string) ($p['line'] ?? ''),
        'ptype' => (string) ($p['ptype'] ?? ''),
        'area' => (int) ($p['area'] ?? 0),
        'stage' => $stage,
        'start' => (string) ($p['start'] ?? ''),
        'target' => $target,
        'late' => $late,
        /* Two progress numbers, named for what each one is: how far along the studio's stages the project
           has moved, and how much of the contract has been billed. v2.1 used one field for the first and
           printed the second beside the money; a single `progress` meant neither could be read honestly. */
        'stageProgress' => wx_proj_stage_pct($stage),
        'billedPct' => $value > 0 ? (int) round(min(100, 100 * $invoiced / $value)) : 0,
        'value' => $value,
        'valueDisplay' => wx_pkr_out($value),
        'invoiced' => $invoiced,
        'invoicedDisplay' => wx_pkr_out($invoiced),
        'received' => $received,
        'receivedDisplay' => wx_pkr_out($received),
        'balance' => max(0, $invoiced - $received),
        'balanceDisplay' => wx_pkr_out(max(0, $invoiced - $received)),
        'unbilled' => max(0, $value - $invoiced),
        'unbilledDisplay' => wx_pkr_out(max(0, $value - $invoiced)),
        'milestones' => $milestones,
        'milestonesDone' => $done,
        'milestoneCount' => count($milestones),
        'manager' => $manager ?: null,
        'manager_name' => $manager ? (string) ($names[$manager] ?? '') : '',
        'team' => $team,
        'team_names' => array_values(array_filter(array_map(static fn($t) => (string) ($names[$t] ?? ''), $team))),
        'quote_id' => (int) ($p['quote_id'] ?? 0) ?: null,
        'invoice_id' => (int) ($p['invoice_id'] ?? 0) ?: null,
        'photos' => is_array($p['photos'] ?? null) ? count($p['photos']) : 0,
        'last' => $last === null ? null : ['t' => (string) ($last['t'] ?? ''), 'text' => (string) ($last['text'] ?? '')],
    ];
}

/**
 * The six numbers at the top of the screen, from SQL aggregates rather than from the page on screen.
 *
 * A "contract value" computed from the fifty rows a screen happens to be holding is a lie the moment there
 * are fifty-one projects. So the counts and the money come from two grouped queries over **every** project,
 * and this function only arranges them. Money is summed over every project, exactly as v2.1 summed it,
 * because "invoiced" is not a property of the active ones.
 *
 * @param array<int,array> $stages rows of ['stage','n','value','late'] — one per stage in the table
 * @param array<string,int> $money  ['invoiced'=>int,'received'=>int]
 */
function wx_proj_kpi(array $stages, array $money): array
{
    $kpi = ['active' => 0, 'value' => 0, 'late' => 0, 'invoiced' => (int) ($money['invoiced'] ?? 0), 'received' => (int) ($money['received'] ?? 0)];
    foreach ($stages as $row) {
        $stage = (string) ($row['stage'] ?? '');
        if ($stage === 'closed') {
            continue;
        }
        $kpi['active'] += (int) ($row['n'] ?? 0);
        $kpi['value'] += (int) ($row['value'] ?? 0);
        $kpi['late'] += (int) ($row['late'] ?? 0);
    }
    $kpi['balance'] = max(0, $kpi['invoiced'] - $kpi['received']);
    $kpi['receivedPct'] = $kpi['invoiced'] > 0 ? (int) round(100 * $kpi['received'] / $kpi['invoiced']) : 0;
    foreach (['value', 'invoiced', 'received', 'balance'] as $k) {
        $kpi[$k . 'Display'] = wx_pkr_out((int) $kpi[$k]);
    }
    return $kpi;
}

/**
 * id → name for every user, so a row prints its manager and its team without a query per project.
 *
 * Deliberately every user, not the assignable ones: a team list saved years ago can name somebody who has
 * since changed role, and a project showing "—" where a person's name belongs would be the screen losing
 * information the database still has.
 */
function wx_proj_names(): array
{
    $names = [];
    foreach (wx_all('SELECT id, name FROM wx_users') as $u) {
        $names[(int) $u['id']] = (string) $u['name'];
    }
    return $names;
}

/** Who a project can be assigned to: v2.1 offered owner, admin and sales, for the manager and the team. */
function wx_proj_team(): array
{
    $team = [];
    foreach (wx_all("SELECT id, name FROM wx_users WHERE active = 1 AND role IN ('owner','admin','sales') ORDER BY name") as $u) {
        $team[] = ['id' => (int) $u['id'], 'name' => (string) $u['name']];
    }
    return $team;
}

function wx_route_projects_list(array $ctx): array
{
    wx_require_user('projs_table');
    $limit = wx_limit($ctx['query']['limit'] ?? 50, 200);
    $offset = wx_offset($ctx['query']['offset'] ?? 0);
    $today = date('Y-m-d');
    $f = wx_proj_filter(is_array($ctx['query']) ? $ctx['query'] : [], $today, [
        'stage' => wx_doc_json('wx_projects', '$.stage'),
        'target' => wx_doc_json('wx_projects', '$.target'),
        'line' => wx_doc_json('wx_projects', '$.line'),
        'name' => wx_doc_json('wx_projects', '$.name'),
        'no' => wx_doc_json('wx_projects', '$.no'),
        'client' => wx_doc_json('wx_projects', '$.client_name'),
        'site' => wx_doc_json('wx_projects', '$.site'),
        'ptype' => wx_doc_json('wx_projects', '$.ptype'),
        'invoice_id' => wx_doc_json('wx_projects', '$.invoice_id'),
        'invoice_project' => wx_doc_json('wx_invoices', '$.project_id'),
    ]);
    $sqlWhere = $f['where'] ? ' WHERE ' . implode(' AND ', $f['where']) : '';

    $total = (int) wx_val('SELECT COUNT(*) FROM wx_projects' . $sqlWhere, $f['params']);
    $rows = wx_all(
        'SELECT id, ' . wx_doc_payload_sql('wx_projects') . ' FROM wx_projects' . $sqlWhere . ' ORDER BY id DESC LIMIT ' . $limit . ' OFFSET ' . $offset,
        $f['params']
    );

    $projects = [];
    $ids = [];
    $linked = [];
    foreach ($rows as $row) {
        $p = json_decode((string) $row['payload'], true);
        if (!is_array($p)) {
            continue;
        }
        $p['id'] = (int) $row['id'];
        $projects[] = $p;
        $ids[] = (int) $row['id'];
        if (!empty($p['invoice_id'])) {
            $linked[] = (int) $p['invoice_id'];
        }
    }

    /* Two ways an invoice can belong to a project, and both are read here: the project points at one
       (`invoice_id`, a whole-contract invoice) or the invoice points at the project (`project_id`, what
       milestone billing writes). One query either way, keyed by project, with the payments summed in SQL. */
    $byProject = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $paySql = wx_table_exists('wx_invoice_payments')
            ? 'COALESCE((SELECT SUM(ip.amount) FROM wx_invoice_payments ip WHERE ip.invoice_id = i.id AND ip.reversed_at IS NULL), 0)'
            : '0';
        $sql = 'SELECT i.id, i.no, i.total, ' . $paySql . ' AS paid,'
            . ' ' . wx_doc_json('wx_invoices', '$.project_id') . ' AS project_id'
            . ' FROM wx_invoices i WHERE ' . wx_doc_json('wx_invoices', '$.project_id') . ' IN (' . $ph . ')'
            . ($linked ? ' OR i.id IN (' . implode(',', array_fill(0, count($linked), '?')) . ')' : '');
        $params = array_merge($ids, $linked);
        foreach (wx_all($sql, $params) as $i) {
            $pid = (int) ($i['project_id'] ?? 0);
            $row = ['id' => (int) $i['id'], 'no' => (string) $i['no'], 'total' => (int) $i['total'], 'paid' => (int) $i['paid']];
            if ($pid > 0) {
                $byProject[$pid][] = $row;
            }
            foreach ($projects as $p) {
                if ((int) ($p['invoice_id'] ?? 0) === (int) $i['id'] && !in_array($row, $byProject[(int) $p['id']] ?? [], true)) {
                    $byProject[(int) $p['id']][] = $row;
                }
            }
        }
    }

    $names = wx_proj_names();
    $out = [];
    foreach ($projects as $p) {
        $out[] = wx_proj_row($p, $byProject[(int) $p['id']] ?? [], $names, $today);
    }

    /* The site-wide numbers: one grouped query for the stages and one for the money — not a read of every
       project into PHP, which is the 1.4-second table the plan set out to replace. */
    $stageSql = wx_doc_json('wx_projects', '$.stage');
    $valueSql = wx_doc_json('wx_projects', '$.value');
    $targetSql = wx_doc_json('wx_projects', '$.target');
    $stageRows = wx_all(
        'SELECT COALESCE(' . $stageSql . ", 'planning') AS stage, COUNT(*) AS n,"
        . ' COALESCE(SUM(CAST(' . $valueSql . ' AS SIGNED)), 0) AS value,'
        . ' SUM(CASE WHEN ' . $targetSql . " <> '' AND " . $targetSql . ' < ? THEN 1 ELSE 0 END) AS late'
        . ' FROM wx_projects GROUP BY stage',
        [$today]
    );
    $paySqlAll = wx_table_exists('wx_invoice_payments')
        ? 'COALESCE((SELECT SUM(ip.amount) FROM wx_invoice_payments ip WHERE ip.invoice_id = i.id AND ip.reversed_at IS NULL), 0)'
        : '0';
    $money = wx_one('SELECT COALESCE(SUM(i.total), 0) AS invoiced, COALESCE(SUM(' . $paySqlAll . '), 0) AS received FROM wx_invoices i') ?? [];
    $kpi = wx_proj_kpi($stageRows, ['invoiced' => (int) ($money['invoiced'] ?? 0), 'received' => (int) ($money['received'] ?? 0)]);

    return ['data' => [
        'projects' => $out,
        'total' => $total,
        'limit' => $limit,
        'offset' => $offset,
        'stages' => WX_PROJECT_STAGES,
        'stageLabels' => WX_PROJECT_STAGE_LABELS,
        'lines' => WX_PROJECT_LINES,
        'kpi' => $kpi,
        'view' => $f['view'],
        'stage' => $f['stage'],
        'line' => $f['line'],
        'team' => wx_proj_team(),
    ]];
}

/** The invoices of one project, with their payments summed — the single-project form of the list's batch. */
/**
 * One invoice as the project screens and the client's page both read it.
 *
 * One function, because these four derived figures are what "paid", "balance" and "outstanding" mean
 * everywhere in the product: the drawer's invoice table, the milestone statuses and the client's page all
 * ask this and get the same answer. The console and the client disagreeing about what is owed is the most
 * expensive kind of bug this codebase can ship.
 *
 * @param array $r     id, no, issued_at, due_at (the row)
 * @param int   $total the invoice total
 * @param int   $paid  what has arrived against it
 */
function wx_proj_invoice_row(array $r, int $total, int $paid): array
{
    return [
        'id' => (int) $r['id'],
        'no' => (string) $r['no'],
        'total' => $total,
        'totalDisplay' => wx_pkr_out($total),
        'paid' => $paid,
        'paidDisplay' => wx_pkr_out($paid),
        'balance' => max(0, $total - $paid),
        'balanceDisplay' => wx_pkr_out(max(0, $total - $paid)),
        'status' => $paid <= 0 ? 'unpaid' : ($paid >= $total ? 'paid' : 'partial'),
        'issued' => (string) ($r['issued_at'] ?? ''),
        'due' => (string) ($r['due_at'] ?? ''),
    ];
}

function wx_proj_invoices(int $projectId, int $linkedId = 0): array
{
    $paySql = wx_table_exists('wx_invoice_payments')
        ? 'COALESCE((SELECT SUM(ip.amount) FROM wx_invoice_payments ip WHERE ip.invoice_id = i.id AND ip.reversed_at IS NULL), 0)'
        : '0';
    $rows = wx_all(
        'SELECT i.id, i.no, i.total, ' . $paySql . ' AS paid, i.due_at, i.issued_at, '
        . wx_doc_json('wx_invoices', '$.project_id') . ' AS project_id'
        . ' FROM wx_invoices i WHERE ' . wx_doc_json('wx_invoices', '$.project_id') . ' = ?'
        . ($linkedId > 0 ? ' OR i.id = ?' : '')
        . ' ORDER BY i.id ASC',
        $linkedId > 0 ? [$projectId, $linkedId] : [$projectId]
    );
    $out = [];
    foreach ($rows as $r) {
        $out[] = wx_proj_invoice_row($r, (int) $r['total'], (int) $r['paid']);
    }
    return $out;
}

/**
 * GET /projects/{id} — one project, in the same shape the list uses, plus the whole document.
 *
 * The row is built by `wx_proj_row()` and not by a second mapping written next to it: the drawer and the
 * table showing different progress for the same project is the kind of disagreement nobody reports and
 * everybody half-notices. `document` carries the fields the editor writes (name, site, dates, value, line,
 * type, area, team, manager, and the milestone plan's labels and percentages).
 */
function wx_route_projects_get(array $ctx): array
{
    wx_require_user('proj_meta');
    $id = (int) $ctx['params']['id'];
    $p = wx_doc_get_row('wx_projects', $id);
    if ($p === null) {
        throw ApiError::notFound('That project does not exist');
    }
    $p['id'] = $id;
    $invoices = wx_proj_invoices($id, (int) ($p['invoice_id'] ?? 0));
    $row = wx_proj_row($p, $invoices, wx_proj_names(), date('Y-m-d'));

    $updates = is_array($p['updates'] ?? null) ? $p['updates'] : [];
    $log = [];
    foreach (array_slice(array_reverse($updates), 0, 40) as $u) {
        if (!is_array($u)) {
            continue;
        }
        $log[] = [
            't' => (string) ($u['t'] ?? ''),
            'user' => (string) ($u['user'] ?? ''),
            'text' => (string) ($u['text'] ?? ''),
            'photo' => (string) ($u['photo'] ?? ''),
            'sys' => !empty($u['sys']),
            /* Whether this entry is on the client's page. The drawer says so per entry, because "I wrote it
               here" and "the client read it" are different facts and the screen used to imply the second. */
            'toClient' => !empty($u['toClient']),
            'stage' => (string) ($u['stage'] ?? ''),
        ];
    }

    return ['data' => [
        'project' => $row,
        'invoices' => $invoices,
        'updates' => $log,
        /* The client's page: the link the studio sends, and whether it has been opened. `shared` counts the
           entries a client can read, so the screen can say how much of the feed is theirs without guessing. */
        'client' => [
            'link' => wx_cv_link($p),
            'path' => wx_cv_path($p),
            'views' => (int) ($p['views'] ?? 0),
            'viewedAt' => (string) ($p['viewed_at'] ?? ''),
            'shared' => count(wx_cv_visible($p)),
            'hasContact' => wx_notify_contacts($p)['phone'] !== '' || wx_notify_contacts($p)['email'] !== '',
        ],
        'photos' => is_array($p['photos'] ?? null) ? array_values($p['photos']) : [],
        'document' => [
            'name' => (string) ($p['name'] ?? ''),
            'no' => (string) ($p['no'] ?? ''),
            'site' => (string) ($p['site'] ?? ''),
            'start' => (string) ($p['start'] ?? ''),
            'target' => (string) ($p['target'] ?? ''),
            'value' => (int) ($p['value'] ?? 0),
            'line' => (string) ($p['line'] ?? ''),
            'ptype' => (string) ($p['ptype'] ?? ''),
            'area' => (int) ($p['area'] ?? 0),
            'manager' => (int) ($p['manager'] ?? 0) ?: null,
            'team' => $row['team'],
            'plan' => array_map(static fn($m) => ['label' => $m['label'], 'pct' => $m['pct']], $row['milestones']),
        ],
        'stages' => WX_PROJECT_STAGES,
        'stageLabels' => WX_PROJECT_STAGE_LABELS,
        'lines' => WX_PROJECT_LINES,
        'team' => wx_proj_team(),
        /* True when the project carries one invoice for the whole contract: the drawer asks before the first
           milestone replaces it, which is exactly the question the bill route asks on the server. */
        'full_invoice' => $row['invoice_id'] !== null && count($invoices) === 1,
    ]];
}

/** Projects are not created here — an invoice creates one (see quotations.invoice). This edits it. */
function wx_route_projects_save(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_projects_save_do() below. */
    return wx_appr_route('proj_meta', $ctx, 'projects', 'wx_route_projects_save_do', static fn() => wx_route_projects_save_do($ctx));
}

function wx_route_projects_save_do(array $ctx): array
{
    $u = wx_require_user('proj_meta');
    $id = (int) $ctx['params']['id'];

    return wx_guard('projects.save', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $p = wx_doc_get_row('wx_projects', $id, true);
            if ($p === null) {
                throw ApiError::notFound('That project does not exist');
            }
            $b = $ctx['body'];
            foreach (['name' => 190, 'site' => 300, 'target' => 10, 'start' => 10] as $k => $max) {
                if (array_key_exists($k, $b)) {
                    $p[$k] = wx_v_opt_string($b[$k], $k, $max) ?? '';
                }
            }
            $beforeStage = (string) ($p['stage'] ?? '');
            if (array_key_exists('stage', $b)) {
                $to = wx_v_enum($b['stage'], WX_PROJECT_STAGES, 'stage');
                if ($to !== ($p['stage'] ?? '')) {
                    $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
                    $p['updates'][] = ['t' => wx_now(), 'user' => (string) $u['name'], 'text' => 'Stage: ' . (string) ($p['stage'] ?? '?') . ' → ' . $to];
                }
                $p['stage'] = $to;
            }
            if (array_key_exists('manager', $b)) {
                $p['manager'] = wx_v_opt_int($b['manager'], 'manager', 1);
            }
            /* Milestones are **percentages of the contract value**, not amounts — that is v2.1's model
               (`plan[{label, pct}]`), and it is load-bearing: project billing raises one invoice per
               milestone for `value x pct / 100`. The rules below are v2.1's, kept because each one
               prevents a specific mistake:
                 · at most 12 milestones;
                 · the percentages must add up to 100 (a milestone plan that does not add up is a plan
                   nobody agreed to);
                 · a milestone that has already been billed cannot be changed or removed — its invoice
                   exists and the client has it. */
            if (array_key_exists('plan', $b) || array_key_exists('milestones', $b)) {
                $raw = is_array($b['plan'] ?? null) ? $b['plan'] : (is_array($b['milestones'] ?? null) ? $b['milestones'] : []);
                $old = is_array($p['milestones'] ?? null) ? $p['milestones'] : [];
                $clean = [];
                $sum = 0.0;
                foreach (array_slice(array_values($raw), 0, 12) as $i => $m) {
                    if (!is_array($m)) {
                        continue;
                    }
                    $pct = round(wx_numv($m['pct'] ?? 0), 2);
                    if ($pct <= 0) {
                        continue;
                    }
                    $sum += $pct;
                    $clean[] = [
                        'label' => wx_v_string($m['label'] ?? '', 'plan.' . $i . '.label', 1, 80) ?: 'Milestone ' . ($i + 1),
                        'pct' => $pct,
                        'inv_id' => $old[$i]['inv_id'] ?? null,
                    ];
                }
                foreach ($old as $j => $m) {
                    if (!empty($m['inv_id']) && (($clean[$j]['inv_id'] ?? null) !== $m['inv_id'] || (float) $clean[$j]['pct'] !== (float) $m['pct'])) {
                        throw ApiError::conflict('Milestone ' . ($j + 1) . ' is already billed; it cannot be changed', ['index' => $j]);
                    }
                }
                if ($clean && abs($sum - 100) > 0.01) {
                    throw ApiError::validation('Milestones must add up to 100% (now ' . $sum . '%)', 'plan');
                }
                $p['milestones'] = $clean;
            }
            /* The business line and the team belong to the project, not to the invoice (v2.1's
               proj_meta). `line` decides which invoice series project billing draws from. */
            if (array_key_exists('line', $b)) {
                $p['line'] = wx_v_enum((string) $b['line'], array_merge([''], array_keys(WX_PROJECT_LINES)), 'line');
            }
            if (array_key_exists('ptype', $b)) {
                $p['ptype'] = wx_v_opt_string($b['ptype'], 'ptype', 60) ?? '';
            }
            if (array_key_exists('site', $b)) {
                $p['site'] = wx_v_opt_string($b['site'], 'site', 300) ?? '';
            }
            if (array_key_exists('value', $b)) {
                $p['value'] = wx_v_pkr($b['value'], 'value', 0);
            }
            if (array_key_exists('team', $b)) {
                $ids = is_array($b['team']) ? array_slice(array_values($b['team']), 0, 30) : [];
                $p['team'] = array_values(array_unique(array_filter(array_map(static fn($v) => (int) $v, $ids))));
            }

            $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                throw ApiError::internal('Could not encode the project', ['json_error' => json_last_error_msg()]);
            }
            wx_update('wx_projects', ['payload' => $json], ['id' => $id]);
            $p['id'] = $id;
            /* A stage change is a thing the client is told about — "work has started" the first time the
               project reaches production, "ready for handover" at handover, a progress update for the
               stages in between — and each one is sent once. The decision lives in lib/notify.php,
               including the per-project marks that keep it once-only; inside the transaction, so a
               failed save cannot send a notification about a change that did not happen. */
            if ((string) $p['stage'] !== $beforeStage) {
                $p = wx_notify_project_stage($p, $beforeStage);
            }
            wx_audit($u, 'project.save', 'project:' . $id, ['stage' => $p['stage'] ?? null, 'from' => $beforeStage]);
            return ['data' => ['project' => $p]];
        });
    });
}

/**
 * Bill one milestone — the point where a project becomes money.
 *
 * Ported from v2.1's proj_bill, including the parts that look odd until you know why:
 *
 *   · the invoice number is the project's own series plus the milestone index (`WI-10120-2`), so a
 *     client receiving the second milestone's invoice can see where it belongs in the sequence;
 *   · the project's first billed milestone claims the project number, which may have to come from the
 *     company counter — that is v2.1's behaviour and it keeps one series per project;
 *   · a project that already has a **full contract invoice** keeps it, unless the invoice has no
 *     payments — in which case the caller must say `replace: true`, because replacing a document a
 *     client has already paid against would be the worst kind of silent edit. The question is asked
 *     once, in words, and the answer is explicit.
 */
function wx_route_projects_bill(array $ctx): array
{
    wx_require_user('proj_bill');
    $id = (int) $ctx['params']['id'];
    $k = (int) ($ctx['body']['k'] ?? -1);
    $name = (string) (wx_val('SELECT ' . wx_doc_json('wx_projects', '$.name') . ' FROM wx_projects WHERE id = ?', [$id]) ?? '');
    return wx_appr_wrap('proj_bill', 'projects', 'wx_route_projects_bill_do', $ctx,
        'Bill milestone ' . ($k + 1) . ($name !== '' ? ' on ' . $name : ''), static fn() => wx_route_projects_bill_do($ctx));
}

function wx_route_projects_bill_do(array $ctx): array
{
    $u = wx_require_user('proj_bill');
    $id = (int) $ctx['params']['id'];
    $k = (int) ($ctx['body']['k'] ?? -1);
    $replace = !empty($ctx['body']['replace']);

    return wx_guard('projects.bill', static function () use ($u, $id, $k, $replace) {
        return wx_tx(static function () use ($u, $id, $k, $replace) {
            $p = wx_doc_get_row('wx_projects', $id, true);
            if ($p === null) {
                throw ApiError::notFound('That project does not exist');
            }
            $m = $p['milestones'][$k] ?? null;
            if (!is_array($m)) {
                throw ApiError::notFound('That milestone does not exist on this project');
            }
            if (!empty($m['inv_id'])) {
                throw ApiError::conflict('This milestone is already billed');
            }
            $value = (int) ($p['value'] ?? 0);
            if ($value <= 0) {
                throw ApiError::validation('Set the contract value before billing a milestone', 'value');
            }

            $base = (string) ($p['no'] ?? '');
            $line = (string) ($p['line'] ?? '') ?: 'project';

            // A full contract invoice stands until it has money against it.
            $fullId = (int) ($p['invoice_id'] ?? 0);
            if ($fullId) {
                $full = wx_doc_get('wx_invoices', $fullId, true);
                $taken = $full === null ? [] : (wx_invoice_payments($fullId) ?: wx_invoice_payments_legacy($full));
                if ($taken) {
                    throw ApiError::conflict('The full contract invoice on this project has payments, so it cannot be replaced by milestone invoices');
                }
                if (!$replace) {
                    throw ApiError::conflict(
                        'This project has one invoice for the whole contract' . ($full ? ' (' . $full['no'] . ')' : '') . '. Billing by milestone replaces it — confirm to continue.',
                        ['sentinel' => 'REPLACE', 'invoice' => $fullId]
                    );
                }
                wx_q('DELETE FROM wx_invoices WHERE id = ?', [$fullId]);
                $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
                $p['updates'][] = ['t' => wx_now(), 'user' => (string) $u['name'], 'text' => 'Full invoice ' . (string) ($full['no'] ?? '') . ' replaced by milestone invoices', 'sys' => true];
                $p['invoice_id'] = null;
            }

            if ($base === '') {
                $base = wx_next_doc_no($line);
                $p['no'] = $base;
            }
            $no = $base . '-' . ($k + 1);
            if (wx_val('SELECT id FROM wx_invoices WHERE no = ?', [$no]) !== null) {
                throw ApiError::conflict('Invoice ' . $no . ' already exists — check the numbering before billing');
            }

            $amount = (int) round($value * (float) $m['pct'] / 100);
            $clientId = (int) ($p['client_id'] ?? 0);
            $who = $clientId
                ? []
                : [
                    'name' => (string) ($p['client_name'] ?? '') ?: (string) ($p['name'] ?? ''),
                    'company' => (string) ($p['client_name'] ?? ''),
                    'phone' => '',
                    'email' => '',
                    'address' => (string) ($p['site'] ?? ''),
                ];
            $clientId = wx_client_for($who, $clientId ?: null, $u);

            $desc = 'Milestone ' . ($k + 1) . ': ' . (string) ($m['label'] ?? '') . ' — ' . (float) $m['pct'] . '% of contract value Rs '
                . number_format($value) . ($base !== '' ? ' (' . $base . ')' : '');
            $invoice = wx_doc_totals([
                'sections' => [[
                    'name' => 'Milestone billing',
                    'note' => '',
                    'items' => [['desc' => $desc, 'qty' => 1, 'unit' => 'job', 'rate' => $amount, 'amount' => $amount]],
                ]],
                'discount' => 0,
                'taxPct' => 0,
                'rent' => 0,
            ]);

            $invoice += [
                'no' => $no,
                'quote_id' => null,
                'quote_label' => $base,
                'client' => ['name' => (string) ($p['client_name'] ?? '') ?: (string) ($p['name'] ?? ''), 'phone' => '', 'email' => '', 'address' => (string) ($p['site'] ?? ''), 'company' => ''],
                'client_id' => $clientId,
                'project' => (string) ($p['name'] ?? ''),
                'project_id' => (int) $p['id'],
                'site' => (string) ($p['site'] ?? ''),
                'issue_date' => date('Y-m-d'),
                'due_date' => date('Y-m-d', time() + 7 * 86400),
                'terms' => '',
                'notes' => '',
                'schedule' => '',
                'payments' => [],
                'seqPay' => 0,
                'created_by' => (string) $u['name'],
                'created_at' => wx_now(),
                'po' => '',
                'delivery_date' => '',
                'delivered' => '',
                'line' => $line,
                'mode' => '',
                'track_note' => 'Milestone ' . ($k + 1) . ' · ' . (string) ($m['label'] ?? ''),
            ];
            $invoice = wx_doc_put('wx_invoices', $invoice, wx_doc_columns('wx_invoices', $invoice));

            $p['milestones'][$k]['inv_id'] = (int) $invoice['id'];
            $p['client_id'] = $clientId;
            $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
            $p['updates'][] = ['t' => wx_now(), 'user' => (string) $u['name'], 'text' => 'Invoice ' . $no . ' raised: ' . (string) ($m['label'] ?? '') . ' (' . (float) $m['pct'] . '%) Rs ' . number_format($amount), 'sys' => true];
            $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                throw ApiError::internal('Could not encode the project', ['json_error' => json_last_error_msg()]);
            }
            wx_update('wx_projects', ['payload' => $json], ['id' => (int) $p['id']]);

            wx_audit($u, 'project.bill', 'project:' . (int) $p['id'], ['milestone' => $k + 1, 'amount' => $amount, 'invoice' => $no]);
            return ['data' => ['invoice' => wx_inv_public($invoice, []), 'project_id' => (int) $p['id'], 'milestone' => $k + 1, 'amount' => $amount, 'amountDisplay' => wx_pkr_out($amount)]];
        });
    });
}

/**
 * Add a progress update or a photo reference. v2.1 keeps both inside the project document; keeping the
 * shape means the client link and the v2.1 screens keep rendering it.
 */
function wx_route_projects_update(array $ctx): array
{
    /* Two lines, and deliberately the only place this route decides anything: the change itself
       lives in wx_route_projects_update_do() below. */
    return wx_appr_route('proj_update', $ctx, 'projects', 'wx_route_projects_update_do', static fn() => wx_route_projects_update_do($ctx));
}

function wx_route_projects_update_do(array $ctx): array
{
    $u = wx_require_user('proj_meta');
    $id = (int) $ctx['params']['id'];

    return wx_guard('projects.update', static function () use ($ctx, $u, $id) {
        return wx_tx(static function () use ($ctx, $u, $id) {
            $p = wx_doc_get_row('wx_projects', $id, true);
            if ($p === null) {
                throw ApiError::notFound('That project does not exist');
            }
            $text = wx_v_opt_string($ctx['body']['text'] ?? null, 'text', 2000);
            $photo = wx_v_opt_string($ctx['body']['photo'] ?? null, 'photo', 300);
            if (($text === null || $text === '') && !$photo) {
                throw ApiError::validation('Write the update, or attach a photo', 'text');
            }
            /* Off by default: an update typed here is a note on the project until somebody says it goes to
               the client, and the box it was typed in says exactly which of the two happened. */
            $toClient = !empty($ctx['body']['sendToClient']);
            $posted = wx_proj_update_post($p, (string) $u['name'], (string) ($text ?? ''), $photo !== null && $photo !== '' ? [$photo] : [], $toClient);
            $p = $posted['project'];

            $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            wx_update('wx_projects', ['payload' => $json], ['id' => $id]);
            wx_audit($u, 'project.update', 'project:' . $id, ['photo' => (bool) $photo, 'to_client' => $toClient, 'result' => $posted['result']]);
            $p['id'] = $id;
            $last = $p['updates'] ? $p['updates'][count($p['updates']) - 1] : null;
            return ['data' => [
                'project_id' => $id,
                'updates' => count($p['updates']),
                'entry' => $last,
                'toClient' => $toClient,
                'result' => $posted['result'],
            ]];
        });
    });
}
