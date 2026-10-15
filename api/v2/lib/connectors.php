<?php
/**
 * api/v2/lib/connectors.php — the studio's integrations: what is saved, whether it works, and the backups.
 *
 * v2.1's Settings → Integrations is two things wearing one screen, and both of them come from
 * `frontend-v1/admin/admin-conn.js` + `frontend-v1/api/conn-lib.php`:
 *
 *   · The **gallery** — 24 cards across five tabs (Facebook, Messenger, Instagram, Threads, Google, Gmail,
 *     Slack, TikTok, Drive, GitHub…) each knowing what the service is for, what to paste into the *account*
 *     field and what to paste into the *secret* field. It is static: nobody saves a Facebook card, they save
 *     the *record* that says what they pasted. Here the same 24 cards are generated from the v2.1 file into
 *     `api/v2/data/connectors.json` (`tools/gen-connectors.mjs`) and read back, so the console holds a
 *     catalogue it can search rather than a screenful of HTML nobody can diff.
 *   · The **connections** that do work: a Gmail app password, and two places a backup can go (a GitHub
 *     repository, or a Google Drive folder through an Apps Script web app). These are records in
 *     `_private/connectors.json`, keyed and typed, and three of the seven v2.1 actions do something with
 *     them: `conn_test` asks the service whether the secret works, `conn_push` sends the site's pages and
 *     database out, and `conn_tick` — the cron's — does the same once a day for whatever is switched on.
 *
 * **A secret is write-only, and this is the whole reason the file is 0600.** The browser sends it once and
 * reads back four characters (`hint`), so a token cannot be lifted out of a screenshot, a support session or
 * a page somebody printed. Because of that the store is one of the few places in this API where the *absence*
 * of a key means "leave it alone" rather than "clear it" — a form that re-sent an empty secret by accident
 * would otherwise disable every connection it touched, which is exactly the failure v2.1's screen had to be
 * written around too.
 *
 * **Two of the seven actions are deliberately not here.** `conn_gmail_send` and `conn_gmail_use` are a real
 * SMTP client, and this API has none yet: `lib/notify.php` says so in its own header ("no SMTP client yet —
 * those arrive with the channel work"), and the live sender is still `frontend-v1/api/notify-lib.php`. Porting
 * a second SMTP client here — untestable in this sandbox, with no way to prove a password works — would be
 * the exact kind of thing this project exists to remove, so the two actions are named as the remainder
 * (plan §11, and the console says which half it has) rather than half-written.
 *
 * @package Woodex\Api\V2
 */

declare(strict_types=1);

/** The store, under `_private` — never web-readable, and 0600 because it holds tokens and app passwords. */
const WX_CONN_FILE = 'connectors.json';

/** The generated gallery, beside the quote starters. */
const WX_CONN_CATALOG_FILE = '/data/connectors.json';

/** What may be saved, and how much of it. v2.1's own limits, kept so the file stays small and readable. */
const WX_CONN_NAME_MAX = 60;
const WX_CONN_CAT_MAX = 40;
const WX_CONN_ACCOUNT_MAX = 160;
const WX_CONN_URL_MAX = 300;
const WX_CONN_NOTES_MAX = 400;
const WX_CONN_SECRET_MAX = 2000;

/** The three states a record can be in, as v2.1 named them. */
const WX_CONN_STATUS = ['connected', 'error', 'setup'];

/** A backup over this is refused rather than uploaded: v2.1's own ceiling, and GitHub's is lower still. */
const WX_CONN_PUSH_MAX = 41943040;

/** The tick's interval — v2.1's twenty hours, which is "once a day" with room for a slow host. */
const WX_CONN_TICK_HOURS = 20;

/**
 * The store. `WX_CONN_TEST_FILE` is the seam the tests use, because the real file lives under `_private`
 * and holds whatever the studio pasted; the tests must never read or write that.
 */
function wx_conn_store(): JsonStore
{
    $file = defined('WX_CONN_TEST_FILE')
        ? (string) WX_CONN_TEST_FILE
        : WX_PRIVATE_DIR . '/' . WX_CONN_FILE;
    return new JsonStore($file, false, 0600);
}

/** The file, for a screen that wants to say where this lives. */
function wx_conn_file(): string
{
    return wx_conn_store()->path();
}

/** Every saved record, in the order they were added. A malformed file is the store's own error, not ours. */
function wx_conn_items(): array
{
    $raw = wx_conn_store()->read();
    $items = is_array($raw['items'] ?? null) ? array_values($raw['items']) : [];
    return array_values(array_filter($items, 'is_array'));
}

/** Write the list and answer with what is on disk, so a caller never reports a save it did not make. */
function wx_conn_write(array $items): array
{
    wx_conn_store()->write(['items' => array_values($items)]);
    return wx_conn_items();
}

/** Where a record sits in the list, or -1. Ids are opaque; the list order is the only order there is. */
function wx_conn_index(array $items, string $id): int
{
    foreach ($items as $i => $c) {
        if ((string) ($c['id'] ?? '') === $id) {
            return (int) $i;
        }
    }
    return -1;
}

/** The record as the browser may see it: no secret, whether there is one, and its last four characters. */
function wx_conn_public(array $c): array
{
    $p = $c;
    unset($p['secret']);
    $p['hasSecret'] = !empty($c['secret']);
    $p['status'] = in_array((string) ($p['status'] ?? ''), WX_CONN_STATUS, true) ? (string) $p['status'] : 'setup';
    return $p;
}

/** v2.1's own sanitiser: tags out, trimmed, cut to length. Every field below goes through it. */
function wx_conn_text(mixed $v, int $max): string
{
    return mb_substr(trim(strip_tags((string) $v)), 0, $max);
}

/** The key is a slug — it decides which of the three working connections this record is. */
function wx_conn_key(mixed $v): string
{
    $key = (string) preg_replace('~[^a-z0-9_-]~', '', strtolower(trim((string) $v)));
    return $key !== '' ? mb_substr($key, 0, 40) : 'custom';
}

/**
 * The generated gallery — 24 cards, five tabs, nine featured — from `api/v2/data/connectors.json`.
 *
 * Malformed is an internal error, not an empty gallery: a screen that shows no cards because the file was
 * damaged is worse than one that says the catalogue could not be read, because the first looks like a
 * product decision. `wx_tpl_starters()` makes the same choice for the same reason.
 */
function wx_conn_catalog(): array
{
    $file = WX_V2_DIR . WX_CONN_CATALOG_FILE;
    $raw = is_file($file) ? (string) file_get_contents($file) : '';
    $data = $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($data) || !is_array($data['connectors'] ?? null) || !is_array($data['tabs'] ?? null)) {
        throw ApiError::internal('The connector gallery could not be read (api/v2/data/connectors.json)');
    }
    return [
        'source' => (string) ($data['source'] ?? ''),
        'tabs' => array_values((array) $data['tabs']),
        'featured' => array_values((array) ($data['featured'] ?? [])),
        'cards' => array_values((array) $data['connectors']),
    ];
}

/**
 * The list the screen reads: the records, the gallery, and whether the two things a backup needs are here.
 *
 * `ready` is not decoration: without ZipArchive there is nothing to upload, and without cURL there is nowhere
 * to upload it. A screen that offered "Back up now" on a host missing either would be promising something the
 * host cannot do, so the answer says which extension is missing and the button explains itself.
 */
function wx_conn_list(): array
{
    $items = wx_conn_items();
    $catalog = wx_conn_catalog();
    return [
        'items' => array_map('wx_conn_public', $items),
        'count' => count($items),
        'catalog' => $catalog['cards'],
        'tabs' => $catalog['tabs'],
        'featured' => $catalog['featured'],
        'keys' => array_values(array_unique(array_map(static fn(array $c): string => (string) ($c['key'] ?? 'custom'), $items))),
        'file' => wx_conn_file(),
        'ready' => [
            'zip' => class_exists('ZipArchive'),
            'curl' => function_exists('curl_init'),
            'host' => 'smtp.gmail.com:465',
        ],
        'limits' => [
            'name' => WX_CONN_NAME_MAX,
            'account' => WX_CONN_ACCOUNT_MAX,
            'url' => WX_CONN_URL_MAX,
            'notes' => WX_CONN_NOTES_MAX,
            'secret' => WX_CONN_SECRET_MAX,
            'push' => WX_CONN_PUSH_MAX,
        ],
        'unported' => [
            'conn_gmail_send' => 'sending through the Gmail app password needs the mail channel — this API has no SMTP client yet',
            'conn_gmail_use' => 'the same client, pointed at every alert and client email',
        ],
        'note' => 'A secret is write-only: it is stored, and read back as its last four characters. Leaving the '
            . 'field empty on a save keeps the secret that is already there.',
    ];
}

/**
 * Save one record — v2.1's `conn_save`, with the same fields, the same limits and the same write-only rule.
 *
 * The rule is the interesting part. `array_key_exists('secret')` decides whether the field was *sent*; a sent
 * empty string clears the secret (a person who empties the box means it), and an absent key leaves it alone
 * (a form that does not carry secrets, or a save from the test button). v2.1 wrote `if ($sec !== '')` and so
 * could never clear one, which meant a token pasted from a screenshot and then revoked could only be fixed by
 * deleting the whole record.
 */
function wx_conn_save(array $in, array $me): array
{
    $items = wx_conn_items();
    $id = trim((string) ($in['id'] ?? ''));
    $i = $id !== '' ? wx_conn_index($items, $id) : -1;
    if ($id !== '' && $i < 0) {
        throw ApiError::notFound('There is no saved connector with that id');
    }

    $name = wx_conn_text($in['name'] ?? '', WX_CONN_NAME_MAX);
    if ($name === '') {
        throw ApiError::validation('Give the connector a name', 'name');
    }
    $url = trim((string) ($in['url'] ?? ''));
    if ($url !== '' && !preg_match('~^https?://[^\s<>"]+$~i', $url)) {
        throw ApiError::validation('The address must start with https://', 'url');
    }

    $c = $i >= 0 ? $items[$i] : ['id' => 'c' . bin2hex(random_bytes(5)), 'added' => time()];
    $c['key'] = wx_conn_key($in['key'] ?? 'custom');
    $c['name'] = $name;
    $c['cat'] = wx_conn_text($in['cat'] ?? 'Custom', WX_CONN_CAT_MAX) ?: 'Custom';
    $c['account'] = wx_conn_text($in['account'] ?? '', WX_CONN_ACCOUNT_MAX);
    $c['url'] = mb_substr($url, 0, WX_CONN_URL_MAX);
    $c['notes'] = wx_conn_text($in['notes'] ?? '', WX_CONN_NOTES_MAX);
    $c['on'] = !array_key_exists('on', $in) || !empty($in['on']);

    if (array_key_exists('secret', $in)) {
        $sec = trim((string) $in['secret']);
        if ($sec === '') {
            unset($c['secret'], $c['hint']);
        } else {
            $c['secret'] = mb_substr($sec, 0, WX_CONN_SECRET_MAX);
            $c['hint'] = mb_substr($c['secret'], -4);
        }
    }

    $c['status'] = (!empty($c['secret']) || $c['account'] !== '') ? 'connected' : 'setup';
    $c['updated'] = time();
    $c['updatedBy'] = (string) ($me['name'] ?? '');

    if ($i >= 0) {
        $items[$i] = $c;
    } else {
        $items[] = $c;
    }
    $saved = wx_conn_write($items);
    wx_audit($me, 'conn.save', $name, ['key' => $c['key'], 'id' => $c['id']]);

    return ['item' => wx_conn_public($c), 'items' => array_map('wx_conn_public', $saved)];
}

/** Delete one record, and answer with the rest. v2.1's `conn_delete`, including the 404 it gave a bad id. */
function wx_conn_delete(string $id, array $me): array
{
    $items = wx_conn_items();
    $i = wx_conn_index($items, $id);
    if ($i < 0) {
        throw ApiError::notFound('There is no saved connector with that id');
    }
    $gone = $items[$i];
    array_splice($items, $i, 1);
    $left = wx_conn_write($items);
    wx_audit($me, 'conn.delete', (string) ($gone['name'] ?? $id), ['key' => (string) ($gone['key'] ?? '')]);
    return ['deleted' => (string) ($gone['id'] ?? $id), 'items' => array_map('wx_conn_public', $left)];
}

/**
 * Ask the service whether the secret works — v2.1's `conn_test`, with the same four branches and the same
 * sentences, because those sentences are the only instructions the owner gets.
 *
 * **Nothing here reaches the network in a test run.** The GitHub and Gmail checks are decided by the shape of
 * what was saved; only the "any other address" branch actually calls out, and a *failed test is a result, not
 * an error* — which is why the call is made with the wrapper's non-throwing mode. A screen that turned "the
 * token is wrong" into a red 500 would be hiding the sentence that tells somebody what to fix.
 */
function wx_conn_test(string $id, array $me): array
{
    $items = wx_conn_items();
    $i = wx_conn_index($items, $id);
    if ($i < 0) {
        throw ApiError::notFound('There is no saved connector with that id');
    }
    $c = $items[$i];
    $key = (string) ($c['key'] ?? '');
    $acc = trim((string) ($c['account'] ?? ''));
    $sec = (string) ($c['secret'] ?? '');
    $url = (string) ($c['url'] ?? '');
    $ok = !empty($sec) || $acc !== '';
    $msg = 'Saved. No address to check, so there was nothing to test.';

    if ($key === 'github') {
        if (!preg_match('~^[\w.-]+/[\w.-]+$~', $acc) || $sec === '') {
            $ok = false;
            $msg = 'Enter the repository as owner/name and a token.';
        } else {
            $r = wx_conn_try('https://api.github.com/repos/' . $acc, [
                'User-Agent: WoodexAdmin',
                'Accept: application/vnd.github+json',
                'Authorization: Bearer ' . $sec,
            ], null, 10);
            $code = $r['code'];
            $j = $r['json'];
            $ok = $code === 200;
            $msg = $ok
                ? 'Connected to ' . (string) ($j['full_name'] ?? $acc)
                    . (!empty($j['private']) ? ' (private)' : ' (public: make it private!)')
                    . (empty($j['permissions']['push']) ? ' · token can only read' : ' · write access OK')
                : ($code === 401 ? 'Token rejected. Create a new token.'
                    : ($code === 404 ? 'Repository not found, or the token has no access to it.'
                        : 'GitHub did not answer (' . ($r['error'] !== '' ? $r['error'] : 'HTTP ' . $code) . ')'));
        }
    } elseif ($key === 'gmail') {
        $ok = (bool) filter_var($acc, FILTER_VALIDATE_EMAIL) && strlen((string) preg_replace('~\s+~', '', $sec)) === 16;
        $msg = $ok
            ? 'Gmail address and 16-letter app password look right. Sending through them is the mail channel; '
                . 'the Notifications screen says which one the site is on.'
            : 'Enter a Gmail address and the 16-letter app password (not your normal password).';
    } elseif ($key === 'gdrive') {
        $ok = (bool) preg_match('~^https://drive\.google\.com/(drive/(u/\d+/)?folders/|open\?id=)[\w-]+~', $acc . ' ')
            || (bool) preg_match('~^https://drive\.google\.com/~', $url);
        $msg = $ok
            ? 'Drive folder link saved. A backup needs the Apps Script address as well.'
            : 'Paste a folder link that starts with https://drive.google.com/drive/folders/';
    } elseif ($url !== '' && preg_match('~^https://~i', $url)) {
        $r = wx_conn_try($url, ['User-Agent: WoodexAdmin'], null, 8);
        $ok = $r['code'] >= 200 && $r['code'] < 400;
        $msg = $r['code'] > 0
            ? 'Address answered with HTTP ' . $r['code']
            : 'Address did not answer' . ($r['error'] !== '' ? ': ' . $r['error'] : '');
    }

    $items[$i]['status'] = $ok ? 'connected' : 'error';
    $items[$i]['checked'] = time();
    $items[$i]['note'] = $msg;
    $stored = wx_conn_write($items);
    wx_audit($me, 'conn.test', (string) $c['name'], ['ok' => $ok]);

    return [
        'pass' => $ok,
        'message' => $msg,
        'items' => array_map('wx_conn_public', $stored),
    ];
}

/**
 * One outward call, as a *result* rather than an exception.
 *
 * `wx_http_call()` throws on a status the provider refused, which is right for the AI screens — a key that
 * does not work is not an answer. Here every status is an answer: 401 and 404 are the two sentences that tell
 * the owner what to fix, so this catches the wrapper's refusal and keeps the code and the provider's words.
 *
 * @return array{code:int, json:array, raw:string, error:string}
 */
function wx_conn_try(string $url, array $headers, ?array $body, int $timeout, ?string $method = null): array
{
    try {
        $r = wx_http_call($url, $headers, $body, $timeout, $method, false);
        return ['code' => (int) $r['code'], 'json' => (array) $r['json'], 'raw' => (string) $r['raw'], 'error' => ''];
    } catch (ApiError $e) {
        return ['code' => 0, 'json' => [], 'raw' => '', 'error' => $e->getMessage()];
    }
}

/**
 * The off-site backup: every page, the public files, and the database — without the secrets.
 *
 * v2.1's `p22_offsite_zip()` did exactly this and its exclusions are the important part: `wx_users`,
 * `wx_throttle` and `wx_settings` are left out, so a backup that lands in a repository or a shared Drive folder
 * carries the studio's *content* and none of its logins, session throttles or API keys. `database.json` still
 * records an error if the database cannot be read, because a backup that silently contains no database is the
 * one failure nobody notices until they need it.
 *
 * @return array{0:string, 1:string} path ('' on failure) and the reason
 */
function wx_conn_offsite_zip(): array
{
    if (!class_exists('ZipArchive')) {
        return ['', 'The ZipArchive PHP extension is not enabled, so there is nothing to upload'];
    }
    @set_time_limit(300);
    $tmp = tempnam(sys_get_temp_dir(), 'wxb');
    if ($tmp === false) {
        return ['', 'Could not create the backup file'];
    }
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        return ['', 'Could not create the backup file'];
    }
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        $abs = WX_SITE_ROOT . '/' . $rel;
        if (is_file($abs)) {
            $zip->addFile($abs, $rel);
        }
    }
    foreach (['sitemap.xml', 'robots.txt', 'llms.txt', 'assets/site.js', 'assets/site.css', 'assets/announce.json'] as $rel) {
        if (is_file(WX_SITE_ROOT . '/' . $rel)) {
            $zip->addFile(WX_SITE_ROOT . '/' . $rel, $rel);
        }
    }
    $db = [];
    try {
        if (function_exists('wx_all')) {
            foreach (wx_all("SHOW TABLES LIKE 'wx\\_%'") as $row) {
                $table = (string) array_values($row)[0];
                if (in_array($table, ['wx_users', 'wx_throttle', 'wx_settings'], true)) {
                    continue;
                }
                $db[$table] = wx_all('SELECT * FROM `' . $table . '`');
            }
        }
    } catch (Throwable $e) {
        $db['_error'] = $e->getMessage();
    }
    $zip->addFromString('database.json', (string) json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $zip->addFromString('README.txt', "Woodex off-site backup " . gmdate('Y-m-d H:i') . " UTC\n"
        . "The site's pages, its public files and the database — no passwords, no API keys, no session data.\n"
        . "Restore: upload the pages with File Manager; the database is loaded by the installer or by hand.\n");
    $zip->close();
    return [$tmp, ''];
}

/**
 * Push a backup to where this connector says — v2.1's `p22_push()`, through the one HTTP call this API has.
 *
 * GitHub takes a file through the contents API (a `PUT` with the bytes base64-encoded, expecting 201);
 * a Drive backup goes through an Apps Script web app the owner deploys, because Drive has no upload endpoint
 * a bare token can reach. Both leave the record saying when it last ran and whether it worked, which is what
 * the screen shows instead of "backed up" as a hope.
 *
 * @param array $c  the record, by reference: its status, note and lastPush are updated
 * @return array{ok:bool, message:string}
 */
function wx_conn_push(array &$c, ?string $now = null): array
{
    $key = (string) ($c['key'] ?? '');
    $acc = trim((string) ($c['account'] ?? ''));
    $sec = (string) ($c['secret'] ?? '');
    $url = trim((string) ($c['url'] ?? ''));
    $at = $now ?? time();
    $done = static function (bool $ok, string $m) use (&$c, $at): array {
        $c['lastPush'] = $at;
        $c['pushOk'] = $ok;
        $c['note'] = $m;
        $c['checked'] = $at;
        if ($ok) {
            $c['status'] = 'connected';
        }
        return ['ok' => $ok, 'message' => $m];
    };

    if ($key !== 'github' && $key !== 'gdrive') {
        return ['ok' => false, 'message' => 'Backups work with GitHub and Google Drive — save one of those to send one'];
    }
    if ($key === 'github' && (!preg_match('~^[\w.-]+/[\w.-]+$~', $acc) || $sec === '')) {
        return $done(false, 'Save the repository (owner/name) and a token first');
    }
    $folder = '';
    if ($key === 'gdrive') {
        if (!preg_match('~^https://script\.google\.com/macros/s/[\w-]+/exec$~', $url) || $sec === ''
            || !preg_match('~folders/([\w-]+)~', $acc, $fm)) {
            return $done(false, 'Save the Drive folder link, the Apps Script address and the script key first');
        }
        $folder = (string) $fm[1];
    }

    [$file, $err] = wx_conn_offsite_zip();
    if ($file === '') {
        return $done(false, $err);
    }
    $size = (int) filesize($file);
    if ($size > WX_CONN_PUSH_MAX) {
        @unlink($file);
        return $done(false, 'The backup is too big to upload (' . round($size / 1048576) . ' MB of a '
            . round(WX_CONN_PUSH_MAX / 1048576) . ' MB ceiling)');
    }
    $name = 'woodex-backup-' . gmdate('Ymd-His') . '.zip';
    $b64 = base64_encode((string) file_get_contents($file));
    @unlink($file);

    if ($key === 'github') {
        $r = wx_conn_try(
            'https://api.github.com/repos/' . $acc . '/contents/backups/' . $name,
            [
                'User-Agent: WoodexAdmin',
                'Accept: application/vnd.github+json',
                'Authorization: Bearer ' . $sec,
                'Content-Type: application/json',
            ],
            ['message' => 'Woodex backup ' . gmdate('Y-m-d H:i'), 'content' => $b64],
            120,
            'PUT'
        );
        if ($r['code'] === 201) {
            return $done(true, 'Backup uploaded to GitHub: backups/' . $name . ' (' . round($size / 1024) . ' KB)');
        }
        $why = $r['code'] === 401 ? 'GitHub rejected the token'
            : (($r['code'] === 403 || $r['code'] === 404) ? 'The token cannot write to this repository (it needs Contents: read and write)'
                : ($r['code'] > 0 ? 'GitHub upload failed (HTTP ' . $r['code'] . ')' : 'GitHub could not be reached'));
        return $done(false, $why);
    }

    $r = wx_conn_try($url, ['Content-Type: application/json'], [
        'key' => $sec,
        'folder' => $folder,
        'name' => $name,
        'data' => $b64,
    ], 120);
    if (!empty($r['json']['ok'])) {
        return $done(true, 'Backup saved in Google Drive: ' . $name . ' (' . round($size / 1024) . ' KB)');
    }
    $said = (string) ($r['json']['error'] ?? ($r['error'] !== '' ? $r['error'] : 'HTTP ' . $r['code']));
    return $done(false, 'Drive upload failed: ' . mb_substr($said, 0, 160));
}

/** Push one saved connector by id, and answer with the refreshed list. */
function wx_conn_push_id(string $id, array $me): array
{
    $items = wx_conn_items();
    $i = wx_conn_index($items, $id);
    if ($i < 0) {
        throw ApiError::notFound('There is no saved connector with that id');
    }
    $r = wx_conn_push($items[$i]);
    $stored = wx_conn_write($items);
    wx_audit($me, 'conn.push', (string) $items[$i]['name'] . ': ' . $r['message'], ['ok' => $r['ok']]);
    return [
        'pass' => $r['ok'],
        'message' => $r['message'],
        'items' => array_map('wx_conn_public', $stored),
    ];
}

/**
 * v2.1's `conn_tick()`: one automatic backup a day for each switched-on GitHub or Drive connector.
 *
 * This is what the cron calls, so it never queues and never asks anybody — the record's `lastPush` is what
 * keeps it to one a day, and a push that failed is retried on the next tick rather than being remembered as
 * done. Its answers are sentences, because the cron's log is the only place anybody reads them.
 *
 * @return array<int,string>
 */
function wx_conn_tick(): array
{
    $items = wx_conn_items();
    $out = [];
    $changed = false;
    foreach ($items as $i => $c) {
        if (!in_array((string) ($c['key'] ?? ''), ['github', 'gdrive'], true) || empty($c['on']) || empty($c['secret'])) {
            continue;
        }
        if (time() - (int) ($c['lastPush'] ?? 0) <= WX_CONN_TICK_HOURS * 3600) {
            continue;
        }
        $r = wx_conn_push($items[$i]);
        $out[] = (string) ($c['name'] ?? $c['key'] ?? 'connector') . ': ' . $r['message'];
        $changed = true;
    }
    if ($changed) {
        wx_conn_write($items);
    }
    return $out;
}
