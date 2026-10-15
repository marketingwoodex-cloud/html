<?php
/**
 * frontend-v1/api/intake-lib.php — the rules an enquiry passes before it becomes a lead (plan P25.2 §5.1).
 *
 * **Why this file exists.** The four intake defects this phase fixes are decisions, not plumbing: an
 * unreachable Cloudflare silently waving a submission through, a double-tap making two leads, attribution
 * nobody could see, and an alert that failed without a trace. A decision written as a comment inside
 * `forms.php` cannot be tested, and a rule that lives only in a comment is the failure mode this project
 * keeps finding. So the rules live here — no database, no network, no `$_SERVER`, no `exit` — and
 * `forms.php` is a thin caller. Every branch that decides what happens to a visitor's enquiry is exercised
 * by `tests/run.php`, on the command line, without a host.
 *
 * Three things are here:
 *
 *   1. **The duplicate rule.** A submission is recognised by the phone it carries and by the email, each
 *      together with the form and the page, inside a short window (`INTAKE_DEDUPE_SECONDS`). The claim itself
 *      is atomic in production (`IntakeThrottleStore`, one row in `wx_throttle` whose primary key is the
 *      claim) and in memory for a test (`IntakeMemoryStore`), and both take the same decision from
 *      `intake_claim_decision()`. A genuine second enquiry five minutes later is a lead; a double-tap is not.
 *
 *   2. **Cloudflare Turnstile's failure mode**, as a function rather than a comment: unreachable Cloudflare
 *      accepts the enquiry and records it as *unverified*, a delivered answer of "no" refuses it. The
 *      compensating controls are the honeypot, the rate limit and this duplicate guard. The decision is
 *      written down in `docs/INTAKE-RULES-P25.2.md` and asserted here.
 *
 *   3. **The delivery log** (`intake_delivery_merge()`): one small state file the console reads, so a failed
 *      alert or Sheets push is a fact on the Forms screen instead of a line in an error log nobody opens.
 *      Counters survive trimming, so a number shown to a person is a count and never the length of a list.
 *
 * `forms.php` writes it; `api/v2/lib/forms.php` reads it; a test rounds it trip, which is what keeps the two
 * ends from drifting apart.
 */
declare(strict_types=1);

/**
 * How long two submissions count as the same enquiry.
 *
 * Longer than a double-tap (seconds) and longer than a person re-sending after a slow page (a minute),
 * shorter than somebody genuinely writing again about something else. Five minutes, and the window is part
 * of the rule rather than a detail: after it, the same person on the same page is a new enquiry.
 */
const INTAKE_DEDUPE_SECONDS = 300;

/** The channels one submission can be delivered on. Anything else in a request is ignored rather than stored. */
const INTAKE_CHANNELS = ['alert', 'reply', 'sheets'];

/** How many recent submissions and how many failures the log keeps. The counters beside them never trim. */
const INTAKE_LOG_RECENT = 50;
const INTAKE_LOG_FAILS = 20;

/** Every string this file writes into the log is clipped to this, so one long SMTP error cannot bloat it. */
const INTAKE_DETAIL_MAX = 240;

function intake_clip(string $s, int $n = INTAKE_DETAIL_MAX): string
{
    $s = trim(preg_replace('~\s+~u', ' ', $s) ?? $s);
    return mb_substr($s, 0, $n);
}

/**
 * The digits a phone number is recognised by: the **last ten**, so `+92 322 4000768` and `0322 4000768` are
 * one person rather than two. Ten is the local length in Pakistan; a country code in front of it changes
 * nothing about who is calling.
 */
function intake_digits(string $phone): string
{
    $d = preg_replace('~\D~', '', $phone) ?? '';
    return $d === '' ? '' : substr($d, -10);
}

/**
 * Every identity a submission can be recognised by: the phone, and the email when one was given.
 *
 * The key is a hash of `identity | form | page`, as the plan asks, so a double-tap on the contact form is a
 * duplicate while the same person using the estimator on another page is not — the two are different
 * enquiries about different things.
 *
 * @return list<string> one or two keys, most specific first
 */
function intake_dedupe_keys(string $phone, string $email, string $source, string $page): array
{
    $form = strtolower(trim($source));
    $where = intake_clip(trim($page), 200);
    $keys = [];
    $digits = intake_digits($phone);
    if ($digits !== '') {
        $keys[] = 'dup:' . substr(sha1('p|' . $digits . '|' . $form . '|' . $where), 0, 40);
    }
    $mail = strtolower(trim($email));
    if ($mail !== '' && str_contains($mail, '@')) {
        $keys[] = 'dup:' . substr(sha1('e|' . $mail . '|' . $form . '|' . $where), 0, 40);
    }
    return $keys;
}

/**
 * A claim store: the one piece of state the duplicate rule needs.
 *
 * `seen()` answers when a key was last claimed (null = never), `claim()` tries to take it and says whether
 * this request got it, and `release()` gives a key back — which happens when a submission is judged a
 * duplicate on one identity after already claiming another, so the store does not remember a claim that
 * never became a lead.
 */
interface IntakeStore
{
    public function seen(string $key): ?int;

    public function claim(string $key, int $now): bool;

    public function release(string $key): void;
}

/** In memory: what the tests drive, and what a dry run of the rule would use. */
final class IntakeMemoryStore implements IntakeStore
{
    /** @var array<string,int> */
    private array $claims = [];

    public function seen(string $key): ?int
    {
        return $this->claims[$key] ?? null;
    }

    public function claim(string $key, int $now): bool
    {
        $this->claims[$key] = $now;
        return true;
    }

    public function release(string $key): void
    {
        unset($this->claims[$key]);
    }

    /** Every key this store holds, for a test that wants to look. */
    public function keys(): array
    {
        return array_keys($this->claims);
    }
}

/**
 * The production store: one row in `wx_throttle`, a table this site already has and whose primary key
 * (`ip VARCHAR(64)`) is the claim.
 *
 * It takes an executor rather than reaching for a database itself, so the same class is what
 * `tests/run.php --db` drives against SQLite and what `forms.php` drives against MySQL on the host — one
 * implementation, exercised in both places. The INSERT is the atomic step: if two requests pass `seen()` at
 * the same instant, exactly one INSERT succeeds and the other is told the row already exists, which is the
 * duplicate answer. That is the whole reason the claim goes in a table rather than a JSON file.
 */
final class IntakeThrottleStore implements IntakeStore
{
    /** @var callable(string,array):array */
    private $exec;

    /**
     * @param callable(string,array):array $exec run one prepared statement and return its rows
     */
    public function __construct(callable $exec)
    {
        $this->exec = $exec;
    }

    public function seen(string $key): ?int
    {
        $rows = ($this->exec)('SELECT t FROM wx_throttle WHERE ip = ?', [$key]);
        return isset($rows[0]['t']) ? (int) $rows[0]['t'] : null;
    }

    public function claim(string $key, int $now): bool
    {
        if ($this->seen($key) !== null) {
            ($this->exec)('UPDATE wx_throttle SET n = 1, t = ? WHERE ip = ?', [$now, $key]);
            return true;
        }
        try {
            ($this->exec)('INSERT INTO wx_throttle (ip, n, t) VALUES (?, 1, ?)', [$key, $now]);
            return true;
        } catch (Throwable $e) {
            return false;   // another request inserted this key first: the submission is theirs
        }
    }

    public function release(string $key): void
    {
        try {
            ($this->exec)('DELETE FROM wx_throttle WHERE ip = ?', [$key]);
        } catch (Throwable $e) {
            /* Giving a key back is housekeeping; a failure here must never lose the visitor's enquiry. */
        }
    }
}

/**
 * The claim decision, in one function so the SQL store, the memory store and the tests cannot disagree:
 * a key claimed inside the window is a duplicate, one claimed before it is stale and may be taken over.
 */
function intake_claim_decision(?int $seenAt, int $now, int $window = INTAKE_DEDUPE_SECONDS): string
{
    return ($seenAt !== null && $now - $seenAt < $window) ? 'duplicate' : 'free';
}

/**
 * The verdict for one submission: is this a lead, or the same enquiry arriving twice?
 *
 * Every identity the submission carries is claimed. The first key already claimed inside the window makes
 * the whole submission a duplicate, and the keys this request took are given back, so a duplicate leaves the
 * store exactly as it found it.
 *
 * @param list<string> $keys
 * @return array{duplicate:bool, since:?int, claimed:list<string>}
 */
function intake_verdict(IntakeStore $store, array $keys, int $now, int $window = INTAKE_DEDUPE_SECONDS): array
{
    $claimed = [];
    foreach ($keys as $key) {
        $seen = $store->seen($key);
        if (intake_claim_decision($seen, $now, $window) === 'duplicate') {
            foreach ($claimed as $mine) {
                $store->release($mine);
            }
            return ['duplicate' => true, 'since' => $seen, 'claimed' => []];
        }
        /* Two requests can pass `seen()` at the same instant; the claim is what decides, and losing it means
           the other request is already writing this lead. */
        if (!$store->claim($key, $now)) {
            foreach ($claimed as $mine) {
                $store->release($mine);
            }
            return ['duplicate' => true, 'since' => $now, 'claimed' => []];
        }
        $claimed[] = $key;
    }
    return ['duplicate' => false, 'since' => null, 'claimed' => $claimed];
}

/**
 * Which earlier lead a duplicate answer points at.
 *
 * The visitor is told "ok" either way; this decides the id the answer (and the log) carries. The rows come
 * earliest-first and are matched by the **identity the claim used** — the same phone digits or the same
 * email — so `0322 4000768` finds the lead that was saved as `+92 322 4000768`. A row that matches no
 * identity still returns the earliest id rather than zero: pointing somewhere real beats pointing nowhere.
 *
 * @param list<array{id:int|string, phone?:string, email?:string}> $rows earliest first
 */
function intake_first_id(array $rows, string $phone, string $email): int
{
    $digits = intake_digits($phone);
    $mail = strtolower(trim($email));
    $fallback = 0;
    foreach ($rows as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        if ($fallback === 0) {
            $fallback = $id;
        }
        $samePhone = $digits !== '' && intake_digits((string) ($row['phone'] ?? '')) === $digits;
        $sameMail = $mail !== '' && str_contains($mail, '@') && strtolower(trim((string) ($row['email'] ?? ''))) === $mail;
        if ($samePhone || $sameMail) {
            return $id;
        }
    }
    return $fallback;
}

/**
 * Cloudflare Turnstile's answer — and the decision about no answer (15 Oct, written down here and in
 * `docs/INTAKE-RULES-P25.2.md`).
 *
 * `$reachable` is false when the request to Cloudflare failed or timed out. The enquiry is then **accepted**
 * and recorded as `unverified`: the honeypot, the 5-per-10-minutes limit and the duplicate guard are the
 * compensating controls, and losing a real enquiry because Cloudflare had a bad minute is the worse failure
 * for a studio whose leads are its income. A *delivered* answer of "not successful" still refuses.
 *
 * @param array<string,mixed>|null $json the siteverify response, when there was one
 * @return array{accept:bool, verdict:string, detail:string} verdict is ok|fail|unverified
 */
function intake_turnstile(bool $reachable, ?array $json): array
{
    if (!$reachable) {
        return ['accept' => true, 'verdict' => 'unverified', 'detail' => 'Cloudflare was unreachable'];
    }
    if (!empty($json['success'])) {
        return ['accept' => true, 'verdict' => 'ok', 'detail' => ''];
    }
    $codes = array_values(array_filter(array_map('strval', (array) ($json['error-codes'] ?? []))));
    return ['accept' => false, 'verdict' => 'fail', 'detail' => intake_clip($codes ? implode(', ', $codes) : 'the check was not successful')];
}

/**
 * One delivery channel's outcome, from whatever the sender returned.
 *
 * `send_alerts()` answers `['email' => 'sent'|'failed: …', 'whatsapp' => …]`; `notify_client()` answers the
 * same shape plus `skipped` and `error`. One reader for both, because "did it arrive?" must not have two
 * answers depending on which sender a person is looking at.
 *
 * @param array<string,mixed> $result
 * @return array{ok:bool, detail:string, skipped:bool}
 */
function intake_channel_outcome(array $result): array
{
    if (isset($result['error'])) {
        return ['ok' => false, 'detail' => 'error: ' . intake_clip((string) $result['error']), 'skipped' => false];
    }
    if (isset($result['skipped'])) {
        return ['ok' => true, 'detail' => 'skipped: ' . intake_clip((string) $result['skipped'], 80), 'skipped' => true];
    }
    $sent = [];
    $failed = [];
    foreach ($result as $which => $value) {
        $v = trim((string) $value);
        if ($v === '' || $v === 'sent' || $v === 'ok') {
            $sent[] = (string) $which;
        } else {
            $failed[] = $which . ': ' . intake_clip($v, 120);
        }
    }
    if (!$sent && !$failed) {
        return ['ok' => true, 'detail' => 'nothing to send', 'skipped' => true];
    }
    $detail = ($sent ? 'sent: ' . implode(', ', $sent) : 'sent: nothing') . ($failed ? ' · failed: ' . implode(' · ', $failed) : '');
    return ['ok' => !$failed, 'detail' => intake_clip($detail), 'skipped' => false];
}

/** The empty log, so a reader and a writer agree on its shape. */
function intake_log_state(): array
{
    return [
        'recent' => [],
        'last' => [],
        'fails' => [],
        'counts' => ['total' => 0, 'duplicates' => 0, 'bots' => 0, 'unverified' => 0, 'failed' => 0],
        'today' => ['date' => '', 'total' => 0, 'duplicates' => 0, 'bots' => 0],
    ];
}

/**
 * Fold one submission into the log the console reads.
 *
 * `$record` is what happened to it:
 *
 *   ['at' => '2026-10-15 18:04:11', 'id' => 412, 'source' => 'contact', 'page' => '/contact/',
 *    'verdict' => 'new'|'duplicate'|'bot', 'turnstile' => 'ok'|'fail'|'unverified'|'off',
 *    'channels' => ['alert' => ['ok' => true, 'detail' => 'sent: email'], 'reply' => …, 'sheets' => …]]
 *
 * The log keeps the last `$cap` submissions, the last outcome **per channel** (what a person means by "are
 * alerts working?"), every failure since the last `$failCap`, and counters that survive trimming — so the
 * numbers a screen shows are counts, never the length of a trimmed list.
 *
 * @param array<string,mixed> $state
 * @param array<string,mixed> $record
 * @return array<string,mixed>
 */
function intake_delivery_merge(array $state, array $record, int $cap = INTAKE_LOG_RECENT, int $failCap = INTAKE_LOG_FAILS): array
{
    $state = array_replace(intake_log_state(), $state);
    $at = (string) ($record['at'] ?? date('Y-m-d H:i:s'));
    $id = (int) ($record['id'] ?? 0);
    $verdict = (string) ($record['verdict'] ?? 'new');
    $date = substr($at, 0, 10);

    if ((string) ($state['today']['date'] ?? '') !== $date) {
        $state['today'] = ['date' => $date, 'total' => 0, 'duplicates' => 0, 'bots' => 0];
    }

    $channels = [];
    foreach ((array) ($record['channels'] ?? []) as $name => $outcome) {
        if (!in_array((string) $name, INTAKE_CHANNELS, true)) {
            continue;
        }
        $ok = !empty($outcome['ok']);
        $detail = intake_clip((string) ($outcome['detail'] ?? ''));
        $channels[(string) $name] = ['ok' => $ok, 'detail' => $detail];
        $state['last'][(string) $name] = ['at' => $at, 'id' => $id, 'ok' => $ok, 'detail' => $detail];
        if (!$ok) {
            array_unshift($state['fails'], ['at' => $at, 'id' => $id, 'kind' => (string) $name, 'detail' => $detail]);
            $state['counts']['failed'] = (int) $state['counts']['failed'] + 1;
        }
    }
    $state['fails'] = array_slice($state['fails'], 0, max(1, $failCap));

    array_unshift($state['recent'], [
        'at' => $at,
        'id' => $id,
        'source' => intake_clip((string) ($record['source'] ?? ''), 40),
        'page' => intake_clip((string) ($record['page'] ?? ''), 200),
        'verdict' => $verdict,
        'turnstile' => intake_clip((string) ($record['turnstile'] ?? 'off'), 20),
        'channels' => $channels,
    ]);
    $state['recent'] = array_slice($state['recent'], 0, max(1, $cap));

    $state['counts']['total'] = (int) $state['counts']['total'] + 1;
    $state['today']['total'] = (int) $state['today']['total'] + 1;
    if ($verdict === 'duplicate') {
        $state['counts']['duplicates'] = (int) $state['counts']['duplicates'] + 1;
        $state['today']['duplicates'] = (int) $state['today']['duplicates'] + 1;
    }
    if ($verdict === 'bot') {
        $state['counts']['bots'] = (int) $state['counts']['bots'] + 1;
        $state['today']['bots'] = (int) $state['today']['bots'] + 1;
    }
    if ((string) ($record['turnstile'] ?? '') === 'unverified') {
        $state['counts']['unverified'] = (int) $state['counts']['unverified'] + 1;
    }
    return $state;
}
