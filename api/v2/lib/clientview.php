<?php
/**
 * api/v2/lib/clientview.php — what a client opens without signing in.
 *
 * The studio's updates and the page the client reads are one record, not two. An update is marked
 * `toClient` at the moment somebody decides to share it, and this page renders exactly those — never the
 * internal notes, never a stage change nobody chose to announce. That is the whole design: there is no
 * second copy of the text to drift, and no "what did we actually tell them?" question a month later.
 *
 * It follows v2.1's client link (`api/quote-view.php`) in the parts that matter:
 *
 *   · **No session.** The link carries an HMAC of the project's id and number, so it cannot be guessed and
 *     needs no account — the same construction, adopted for a second kind of document, and compared with
 *     `hash_equals` so a wrong token takes the same time as a right one.
 *   · **Nothing is indexed.** `noindex, nofollow`, `Referrer-Policy: no-referrer`, and no links out except
 *     the studio's own contact.
 *   · **The first view is recorded** — once every twelve hours, so a client refreshing the page is not
 *     forty notifications, and the studio can see that the link was opened.
 *
 * What it is *not*: this is a progress page, not the client portal. Approving a quotation, signing and
 * paying (master plan §11 Phase 6) are not here, and `wx_cv_page()` returns only what a progress page
 * needs — which is also why it can be pure and every rule below is asserted without a browser.
 */

declare(strict_types=1);

/** The token's domain separator. A project link and a quotation link can never be swapped for one another. */
const WX_CV_PREFIX = 'pv';

/** How often a repeat view is worth recording. v2.1's quotation page used twelve hours; so does this. */
const WX_CV_VIEW_WINDOW = 43200;

/** Which rows of `updates[]` a client sees. One function, so the page and the sender cannot disagree. */
function wx_cv_visible(array $p): array
{
    $out = [];
    foreach (is_array($p['updates'] ?? null) ? $p['updates'] : [] as $u) {
        if (!is_array($u) || empty($u['toClient'])) {
            continue;
        }
        $out[] = [
            't' => (string) ($u['t'] ?? ''),
            'text' => (string) ($u['text'] ?? ''),
            'photo' => (string) ($u['photo'] ?? ''),
            'stage' => (string) ($u['stage'] ?? ''),
        ];
    }
    return $out;
}

/** The link the studio sends and the client opens. Absolute, because it travels in a message. */
function wx_cv_link(array $p): string
{
    $base = rtrim((string) (wx_setting('site.url', 'https://woodex.com.pk') ?? 'https://woodex.com.pk'), '/');
    return $base . wx_cv_path($p);
}

/** The same link without a host, for the screen that offers it to be copied. */
function wx_cv_path(array $p): string
{
    return '/api/v2/client/project/' . (int) ($p['id'] ?? 0) . '?t=' . wx_cv_token($p);
}

/** The token: an HMAC of the id and the number, exactly as the quotation link is computed. */
function wx_cv_token(array $p): string
{
    return substr(hash_hmac('sha256', WX_CV_PREFIX . '|' . (int) ($p['id'] ?? 0) . '|' . (string) ($p['no'] ?? ''), wx_secret()), 0, 32);
}

/** A token from a URL, or empty when it is not even the right shape — checked before any query is made. */
function wx_cv_token_ok(string $t): bool
{
    return (bool) preg_match('~^[a-f0-9]{32}$~', $t);
}

/**
 * Record that the page was opened, at most once per window.
 *
 * Returns the project with the marker appended, or null when nothing should be written — and it is the
 * caller that writes, so a read-only view of a database that is down cannot fail here. The marker goes in
 * as an internal update (`toClient` is absent), which is the point: "the client opened the link" is not
 * something to show the client.
 */
function wx_cv_mark_viewed(array $p, string $now): ?array
{
    $last = (string) ($p['viewed_at'] ?? '');
    if ($last !== '' && strtotime($last) > strtotime($now) - WX_CV_VIEW_WINDOW) {
        return null;
    }
    $p['viewed_at'] = $now;
    $p['views'] = (int) ($p['views'] ?? 0) + 1;
    $p['updates'] = is_array($p['updates'] ?? null) ? $p['updates'] : [];
    $p['updates'][] = ['t' => $now, 'user' => 'Client', 'text' => 'Viewed the progress page', 'sys' => true];
    return $p;
}

/**
 * Everything the page shows, and nothing else.
 *
 * Pure: a project, its invoices and three settings in; a page's data out. Which is what makes it possible
 * to assert the two rules that matter — that an update the studio did not share is not on the page, and
 * that money is the same figure the console shows (both from `wx_proj_row()`, not recomputed here).
 */
function wx_cv_page(array $p, array $invoices, array $company): array
{
    require_once WX_V2_DIR . '/routes/projects.php';
    $row = wx_proj_row($p, $invoices, [], date('Y-m-d'));

    $stage = (string) ($p['stage'] ?? 'planning');
    $stages = [];
    foreach (WX_PROJECT_STAGES as $s) {
        $stages[] = [
            'id' => $s,
            'label' => WX_PROJECT_STAGE_LABELS[$s] ?? $s,
            'done' => wx_proj_stage_pct($s) <= wx_proj_stage_pct($stage),
            'current' => $s === $stage,
        ];
    }

    return [
        'name' => $row['name'],
        'no' => $row['no'],
        'site' => $row['site'],
        'client' => (string) ($p['client_name'] ?? ''),
        'stage' => $stage,
        'stageLabel' => WX_PROJECT_STAGE_LABELS[$stage] ?? $stage,
        'stages' => $stages,
        'start' => $row['start'],
        'target' => $row['target'],
        'late' => $row['late'],
        'valueDisplay' => $row['valueDisplay'],
        'invoicedDisplay' => $row['invoicedDisplay'],
        'receivedDisplay' => $row['receivedDisplay'],
        'balanceDisplay' => $row['balanceDisplay'],
        'billedPct' => $row['billedPct'],
        'invoices' => array_map(static fn(array $i): array => [
            'no' => (string) $i['no'],
            'total' => (string) $i['totalDisplay'],
            'status' => (string) $i['status'],
            /* A client reading this needs the day, not the timestamp. */
            'issued' => substr((string) $i['issued'], 0, 10),
        ], $invoices),
        'updates' => array_reverse(wx_cv_visible($p)),
        'company' => [
            'name' => (string) ($company['name'] ?? 'Woodex Interior'),
            'phones' => (string) ($company['phones'] ?? ''),
            'whatsapp' => (string) ($company['whatsapp'] ?? ''),
        ],
        'generated' => date('Y-m-d H:i'),
    ];
}

/**
 * The page itself.
 *
 * Pure, self-contained, and deliberately without JavaScript: a client opens this on a phone in a network
 * that may not be generous, and a page that renders its own text with no bundle is a page that works. The
 * stylesheet is inline for the same reason — nothing about this page depends on the site's assets being
 * where they are expected to be, so a change to the theme cannot blank the client's view of their project.
 */
function wx_cv_html(array $d): string
{
    $e = static fn($v): string => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $wa = (string) preg_replace('~\D~', '', (string) (($d['company']['whatsapp'] ?? '') !== '' ? $d['company']['whatsapp'] : ($d['company']['phones'] ?? '')));
    if (str_starts_with($wa, '0')) {
        $wa = '92' . substr($wa, 1);
    }

    $out = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
        . "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        . "<meta name=\"robots\" content=\"noindex,nofollow\">"
        . '<title>' . $e($d['name']) . ' · ' . $e($d['company']['name']) . '</title>'
        . '<style>'
        . '*{box-sizing:border-box}body{margin:0;background:#eef0f4;color:#0a0f1e;'
        . 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}'
        . '.wrap{max-width:760px;margin:0 auto;padding:0 16px 48px}'
        . 'header{background:#0c1628;color:#fff;padding:18px 0;margin-bottom:20px}'
        . 'header .wrap{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}'
        . 'header b{font-size:17px}header small{opacity:.75}'
        . '.card{background:#fff;border:1px solid #dfe3ea;border-radius:12px;padding:16px;margin:0 0 14px}'
        . 'h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;'
        . 'color:#5b6472;margin:0 0 10px}'
        . '.muted{color:#5b6472;font-size:13px}'
        . '.steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}'
        . '.step{border:1px solid #dfe3ea;border-radius:999px;padding:5px 11px;font-size:12px;color:#5b6472}'
        . '.step.done{background:#eaf6ee;border-color:#bfe3cb;color:#1d6b3a}'
        . '.step.now{background:#0c1628;border-color:#0c1628;color:#fff;font-weight:600}'
        . '.money{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}'
        . '.money div{border:1px solid #e5e8ee;border-radius:10px;padding:10px}'
        . '.money b{display:block;font-size:16px}.money span{font-size:12px;color:#5b6472}'
        . '.bar{height:8px;background:#e5e8ee;border-radius:999px;overflow:hidden;margin-top:10px}'
        . '.bar i{display:block;height:100%;background:#b8956a}'
        . 'table{width:100%;border-collapse:collapse;font-size:14px}'
        . 'th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #eef0f4}'
        . 'th{font-size:12px;color:#5b6472;text-transform:uppercase;letter-spacing:.04em}'
        . 'td.r,th.r{text-align:right}'
        . 'article{border-top:1px solid #eef0f4;padding:12px 0}article:first-of-type{border-top:0}'
        . 'article time{font-size:12px;color:#5b6472;display:block;margin-bottom:3px}'
        . 'article img{max-width:100%;border-radius:10px;margin-top:8px;display:block}'
        . '.pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;'
        . 'background:#eef0f4;color:#5b6472}.pill.paid{background:#eaf6ee;color:#1d6b3a}'
        . '.pill.partial{background:#fdf3e3;color:#8a5a09}'
        . '.late{color:#b42318;font-weight:600}'
        . 'footer{color:#5b6472;font-size:12px;text-align:center;margin-top:22px}'
        . 'a.btn{display:inline-block;background:#b8956a;color:#0c1628;text-decoration:none;font-weight:600;'
        . 'border-radius:999px;padding:10px 16px;margin-top:10px}'
        . '@media(max-width:520px){h1{font-size:18px}}'
        . '</style></head><body>'
        . '<header><div class="wrap"><b>' . $e($d['company']['name']) . '</b>'
        . '<small>' . $e($d['name']) . ($d['no'] !== '' ? ' · ' . $e($d['no']) : '') . '</small></div></header>'
        . '<div class="wrap">';

    $out .= '<div class="card"><h1>' . $e($d['name']) . '</h1><p class="muted">'
        . ($d['site'] !== '' ? $e($d['site']) : '')
        . ($d['client'] !== '' ? ($d['site'] !== '' ? ' · ' : '') . $e($d['client']) : '')
        . '</p><p class="muted">'
        . 'Started ' . ($d['start'] !== '' ? $e($d['start']) : '—')
        . ' · Handover ' . ($d['target'] !== '' ? $e($d['target']) : '—')
        . ($d['late'] ? ' <span class="late">(running past the planned date)</span>' : '')
        . '</p><div class="steps">';
    foreach ($d['stages'] as $s) {
        $cls = $s['current'] ? 'step now' : ($s['done'] ? 'step done' : 'step');
        $out .= '<span class="' . $cls . '">' . $e($s['label']) . '</span>';
    }
    $out .= '</div></div>';

    $out .= '<div class="card"><h2>Progress</h2><div class="money">'
        . '<div><span>Contract</span><b>' . $e($d['valueDisplay']) . '</b></div>'
        . '<div><span>Invoiced</span><b>' . $e($d['invoicedDisplay']) . '</b></div>'
        . '<div><span>Received</span><b>' . $e($d['receivedDisplay']) . '</b></div>'
        . '<div><span>Balance</span><b>' . $e($d['balanceDisplay']) . '</b></div>'
        . '</div><div class="bar"><i style="width:' . (int) $d['billedPct'] . '%"></i></div>'
        . '<p class="muted">The bar is how much of the contract has been invoiced so far.</p></div>';

    if ($d['invoices']) {
        $out .= '<div class="card"><h2>Invoices</h2><table><thead><tr><th>Invoice</th><th>Issued</th>'
            . '<th class="r">Amount</th><th>Status</th></tr></thead><tbody>';
        foreach ($d['invoices'] as $i) {
            $label = $i['status'] === 'paid' ? 'Paid' : ($i['status'] === 'partial' ? 'Part paid' : 'Outstanding');
            $out .= '<tr><td>' . $e($i['no']) . '</td><td>' . $e($i['issued']) . '</td>'
                . '<td class="r">' . $e($i['total']) . '</td>'
                . '<td><span class="pill ' . $e($i['status']) . '">' . $label . '</span></td></tr>';
        }
        $out .= '</tbody></table></div>';
    }

    $out .= '<div class="card"><h2>Updates from our team</h2>';
    if (!$d['updates']) {
        $out .= '<p class="muted">No updates have been shared yet. As work moves forward, this page fills in — '
            . 'photographs and notes appear here the moment our team posts them.</p>';
    } else {
        foreach ($d['updates'] as $u) {
            $out .= '<article><time>' . $e($u['t']) . ($u['stage'] !== '' ? ' · ' . $e($u['stage']) : '') . '</time>'
                . '<div>' . nl2br($e($u['text'])) . '</div>';
            if ($u['photo'] !== '' && preg_match('~^/assets/uploads/projects/[a-z0-9._-]+$~i', $u['photo'])) {
                $out .= '<img src="' . $e($u['photo']) . '" alt="Site photo" loading="lazy">';
            }
            $out .= '</article>';
        }
    }
    $out .= '</div>';

    $out .= '<div class="card"><h2>Talk to us</h2><p class="muted">'
        . ($d['company']['phones'] !== '' ? 'Call ' . $e($d['company']['phones']) . '. ' : '')
        . 'Any question about this project — just reply.</p>';
    if ($wa !== '') {
        $out .= '<a class="btn" href="https://wa.me/' . $e($wa) . '?text='
            . rawurlencode('About project ' . (string) $d['name'] . ($d['no'] !== '' ? ' (' . (string) $d['no'] . ')' : '') . ':')
            . '">Message us on WhatsApp</a>';
    }
    $out .= '</div>';

    $out .= '<footer>' . $e($d['company']['name']) . ' · updated ' . $e($d['generated'])
        . '<br>This page is for the client on this project. It is not indexed and needs no password.</footer>'
        . '</div></body></html>';
    return $out;
}
