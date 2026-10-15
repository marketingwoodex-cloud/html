<?php
/**
 * api/v2/routes/business.php — the details the studio shows the world, and the details it bills with.
 *
 * Six routes, and the split between them is the point:
 *
 *   1. `GET /business` — what the website says now, what the form holds, and where the first answer came
 *      from (`stored` when somebody has applied a change, `index.html` when nobody has and it was read off
 *      a real page, `defaults` when there is no page to read). v2.1 answered this from a copy of its own
 *      defaults, which is how a footer that says `9:30–6:30` ends up being "updated" to `10:00–7:30`
 *      with nothing changing.
 *   2. `POST /business/check` — *what would change*, per page and per pair, writing nothing. This is the
 *      route that makes the button honest: a pair that matches nowhere is listed before anything moves.
 *   3. `POST /business` — write it, as one batch, and answer with the batch id that undoes it.
 *   4. `GET /business/from-site` — read the current details off one page (the footer of another page, a
 *      page a designer rewrote by hand). It is how a wrong baseline gets corrected in one click.
 *   5. `GET /business/company` — the letterhead every quotation and invoice is printed with, its banks,
 *      wallets and signatories, and the next document number.
 *   6. `POST /business/company` — change the letterhead. Only the fields the caller sends are written.
 *
 * v2.1's four names (`cms_biz_get`, `cms_biz_save`, `cms_biz_assets`, `company_get`, `company_save`) are
 * still served by `content-lib.php` and `sales-lib.php` on a v2.5 host, and deliberately not listed in
 * `routes/legacy.php`. Two of them cannot be honoured here without lying: `cms_biz_assets` takes the
 * search/replace pairs the *browser* computed from its own copy of the site, and `cms_biz_save` records a
 * draft as "applied" the moment the screen asks it to. The bridge is for callers that still work; a
 * translation that changes what a name means is worse than the 404 that names the v2.1 file.
 */

declare(strict_types=1);

/** v2.1's roles for the website half: an editor may read the details, only the Master and Manager write them. */
const WX_BIZ_READ_ROLES = ['owner', 'admin', 'editor'];
const WX_BIZ_WRITE_ROLES = ['owner', 'admin'];

/** v2.1's roles for the letterhead: the sales desk reads it (a quotation shows it), the owner writes it. */
const WX_CO_READ_ROLES = ['owner', 'admin', 'editor', 'sales'];

/**
 * GET /business — the details, what the website carries, and where that answer came from.
 *
 * The paired `draft` is v2.1's own second copy and it earns its place: it is what makes "saved but not on
 * the site yet" sayable. When the two are equal the screen says so instead of showing a diff of nothing.
 */
function wx_route_biz_get(array $ctx): array
{
    wx_require_user('cms_biz_get', WX_BIZ_READ_ROLES);
    $applied = wx_biz_applied();
    $draft = wx_biz_stored(WX_BIZ_SETTING_DRAFT);

    $pages = wx_page_walk(WX_SITE_ROOT);
    $withRow = 0;
    foreach ($pages as $rel) {
        if (str_contains((string) file_get_contents(WX_SITE_ROOT . '/' . $rel), 'class="footer-social"')) {
            $withRow++;
        }
    }

    return ['data' => [
        'biz' => $draft ?? $applied,
        'applied' => $applied,
        'draft' => $draft,
        'source' => (string) ($applied['source'] ?? 'defaults'),
        'found' => $applied['found'] ?? [],
        'same' => $draft !== null && $draft === $applied,
        'contact' => WX_BIZ_CONTACT,
        'hours' => WX_BIZ_HOURS,
        'days' => WX_BIZ_DAYS,
        'socials' => WX_BIZ_SOCIAL,
        'assets' => WX_BIZ_ASSETS,
        'sample' => WX_BIZ_SAMPLE,
        'site' => ['pages' => count($pages), 'socialRow' => $withRow],
    ]];
}

/**
 * POST /business/check — the same edit as the apply, without writing.
 *
 * Not wrapped in the approval gate, and not because it is harmless: it writes nothing at all, so a queued
 * approval for it would put a *read* in front of the Master. Its permission is the role the handler asks
 * for — the write roles, since reading the whole site is a job for the people who are allowed to change it.
 */
function wx_route_biz_check(array $ctx): array
{
    wx_require_user('cms_biz_get', WX_BIZ_WRITE_ROLES);
    $biz = wx_biz_clean($ctx['body']['biz'] ?? $ctx['body'], wx_biz_applied());
    $pairs = wx_biz_pairs(wx_biz_applied(), $biz);
    /* Two kinds of pair come back from the builder, and they are not the same thing to a person: the
       replacements the studio typed, and the internal sentinel moves that swap the WhatsApp number without
       letting the digits-only pairs rewrite a `wa.me` address. The report lists the first kind — those are
       the strings it says the site is missing — and counts the second, so the WhatsApp rewrite is stated
       rather than hidden inside a number. The scan itself still runs over all of them, because all of them
       are edits that land on a page. */
    $visible = wx_biz_pairs_visible($pairs);
    return ['data' => [
        'biz' => $biz,
        'pairs' => $visible,
        'moves' => count($pairs) - count($visible),
        'scan' => wx_biz_scan($pairs, $biz, ['limit' => (int) ($ctx['body']['limit'] ?? 60)]),
    ]];
}

/** POST /business — save the details and put them on the website, as one batch. */
function wx_route_biz_apply(array $ctx): array
{
    return wx_appr_route('cms_biz_save', $ctx, 'business', 'wx_route_biz_apply_do', static fn() => wx_route_biz_apply_do($ctx));
}

function wx_route_biz_apply_do(array $ctx): array
{
    $u = wx_require_user('cms_biz_save', WX_BIZ_WRITE_ROLES);
    return wx_guard('business.apply', static function () use ($ctx, $u) {
        $biz = wx_biz_clean($ctx['body']['biz'] ?? $ctx['body'], wx_biz_applied());
        $note = trim(mb_substr((string) ($ctx['body']['note'] ?? ''), 0, 160));
        $result = wx_biz_apply($biz, $u, $note);
        /* One audit row for the change as a whole, on top of the page batch's own row: the batch answers
           "which pages", this answers "which details, and who decided they were right". */
        wx_audit($u, 'business.apply', $result['pages'] . ' page(s)', [
            'places' => $result['places'],
            'batch' => $result['batch'],
            'assets' => array_values(array_filter(array_map(
                static fn(array $a): string => $a['changed'] ? (string) $a['rel'] : '',
                $result['assets']
            ))),
            'note' => $note,
        ]);
        return ['data' => $result];
    });
}

/**
 * GET /business/from-site — read the current contact details off one page.
 *
 * The baseline is read automatically on the first visit; this is for the case the automatic one gets
 * wrong, which is real: the site's own footer is hand-written, and a host that changed it after the last
 * apply has pages that no longer say what the console thinks they say.
 */
function wx_route_biz_from_site(array $ctx): array
{
    wx_require_user('cms_biz_get', WX_BIZ_READ_ROLES);
    $rel = (string) ($ctx['query']['rel'] ?? $ctx['body']['rel'] ?? WX_BIZ_SAMPLE);
    $read = wx_biz_from_site($rel);
    return ['data' => $read + [
        'known' => wx_biz_keys(),
        'missing' => array_values(array_diff(WX_BIZ_CONTACT, $read['found'])),
    ]];
}

/** GET /business/company — the letterhead, the lists, and the number the next document will take. */
function wx_route_company_get(array $ctx): array
{
    wx_require_user('company_get', WX_CO_READ_ROLES);
    return ['data' => [
        'company' => wx_company_full(),
        'fields' => WX_CO_FIELDS,
        'lists' => WX_CO_LISTS,
        'bankUse' => WX_CO_BANK_USE,
        'used' => wx_company_used_no(),
    ]];
}

/** POST /business/company — change the letterhead documents are printed with. */
function wx_route_company_save(array $ctx): array
{
    return wx_appr_route('company_save', $ctx, 'business', 'wx_route_company_save_do', static fn() => wx_route_company_save_do($ctx));
}

function wx_route_company_save_do(array $ctx): array
{
    $u = wx_require_user('company_save', WX_BIZ_WRITE_ROLES);
    return wx_guard('company.save', static function () use ($ctx, $u) {
        $body = is_array($ctx['body'] ?? null) ? $ctx['body'] : [];
        $in = is_array($body['company'] ?? null) ? $body['company'] : $body;
        $result = wx_company_save($in);
        $changed = [];
        foreach ((array) $result['company'] as $k => $v) {
            if (is_array($v)) {
                continue;
            }
            if ((string) $v !== (string) ($result['before'][$k] ?? '')) {
                $changed[] = $k;
            }
        }
        wx_audit($u, 'settings.company', implode(', ', $changed), ['fields' => $changed]);
        return ['data' => ['company' => $result['company'], 'changed' => $changed, 'used' => $result['used']]];
    });
}
