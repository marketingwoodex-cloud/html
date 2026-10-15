<?php
/**
 * api/v2/lib/business.php — the studio's own details, and the one job that makes them hard: every page
 * has them.
 *
 * v2.1 kept these in `content.json` twice — `biz` (what the form held) and `bizApplied` (what the website
 * was last updated to) — and its screen updated the site **from the browser**, one page at a time through
 * the builder: read a page, replace the strings, save the page, move to the next. Three things were wrong
 * with that, and each one is a decision here.
 *
 *   · **A half-updated website was a normal outcome.** Closing the tab in the middle left some pages with
 *     the new phone number and some with the old, and nothing anywhere said which. Here the site walk is
 *     `wx_page_write_many()` — the same one-batch, one-undo write the header/footer screen uses — so the
 *     answer to "what changed and how do I put it back" is a batch id in the page history, not a memory of
 *     which tab was open.
 *
 *   · **What the site says was a guess.** `bizApplied` started as a copy of the defaults, so on the first
 *     visit the screen believed the site said `Mon–Sat 10:00–7:30` while the footer actually said
 *     `Mon–Sat 9:30–6:30`; every pair built from that baseline updated nothing, and the screen reported
 *     success. Here the baseline is **read off a real page** (`wx_biz_read_html()`) unless somebody has
 *     applied a change before, and the check counts matches per pair — so a pair that matches nowhere is
 *     visible before the button is pressed, not after.
 *
 *   · **The replacements were only the ones the browser guessed.** The pairs are built server-side by
 *     `wx_biz_pairs()`, a faithful port of v2.1's `bizPairs()` — the text, the digits-only phone variants,
 *     the seven hours spellings the site might carry, and the WhatsApp-number swap that has to happen last
 *     (or `wa.me/…` gets the office number pasted into it). One implementation, so the count the screen
 *     shows is the count the write produces.
 *
 * The company half of the same screen is the **letterhead**: name, tagline, address, phones, banks,
 * wallets, signatories, the next document number. It feeds `wx_company()` and so every quotation and
 * invoice — which is why it lives in `wx_settings` under `company.*` and not in a JSON file, and why the
 * next number is checked against the numbers already used rather than trusted.
 */

declare(strict_types=1);

/** The contact fields, in v2.1's order — the same keys, so a v2.1 `content.json` could be imported. */
const WX_BIZ_CONTACT = ['email', 'phone1', 'phone2', 'wa', 'addr1', 'addr2', 'city', 'country'];

/** The opening-hours fields. `open`/`close` are stored 24-hour (`19:30`); the site spells them in 12-hour. */
const WX_BIZ_HOURS = ['days', 'open', 'close'];

/** The social profiles, in v2.1's order and with its labels. The icon paths live in the screen, not here. */
const WX_BIZ_SOCIAL = [
    'facebook' => 'Facebook',
    'instagram' => 'Instagram',
    'linkedin' => 'LinkedIn',
    'youtube' => 'YouTube',
    'tiktok' => 'TikTok',
    'pinterest' => 'Pinterest',
    'x' => 'X (Twitter)',
];

/** v2.1's three day ranges. Anything else is refused rather than stored, because the hours pairs derive from it. */
const WX_BIZ_DAYS = ['Mon–Sat', 'Mon–Fri', 'Mon–Sun'];

/** The defaults are v2.1's `BIZ_DEF`, verbatim — they are what the live site shows today. */
const WX_BIZ_DEF = [
    'email' => 'info@woodex.com.pk',
    'phone1' => '+92 322 4000768',
    'phone2' => '+92 322 4000768',
    'wa' => '+92 322 4000768',
    'addr1' => 'M-71, Zainab Tower',
    'addr2' => 'Model Town Link Road',
    'city' => 'Lahore',
    'country' => 'Pakistan',
    'days' => 'Mon–Sat',
    'open' => '10:00',
    'close' => '19:30',
];

/**
 * The non-page files that carry the same details: the site's own script and the WhatsApp button.
 *
 * v2.1 rewrote exactly these two through `cms_biz_assets()`. They are rewritten here through
 * `wx_write_file_atomic()`, which is the only writer for a file that is not a page — and unlike a page,
 * these carry no version row, so the reply says so instead of pretending otherwise.
 */
const WX_BIZ_ASSETS = ['assets/site.js', 'assets/js/whatsapp-widget.js'];

/** The page the baseline is read from when nothing has been applied yet: the one every visitor sees. */
const WX_BIZ_SAMPLE = 'index.html';

/** How many pages one check or apply will walk. Same ceiling as the header/footer screen's diff. */
const WX_BIZ_MAX_PAGES = 400;

/** Where the draft and the applied copy live. Two settings, not one: "saved" and "on the site" differ. */
const WX_BIZ_SETTING_DRAFT = 'biz.draft';
const WX_BIZ_SETTING_APPLIED = 'biz.applied';

/** The letterhead fields, in v2.1's `company_cfg()` order, with its lists. */
const WX_CO_FIELDS = [
    'name', 'tagline', 'address', 'phones', 'email', 'web', 'ntn', 'bankName', 'bankTitle', 'bankAccount',
    'bankIban', 'signName', 'signTitle', 'prefix', 'validDays', 'consultant',
];
const WX_CO_LISTS = [
    'banks' => ['bank', 'title', 'account', 'iban', 'branch', 'code', 'use'],
    'wallets' => ['name', 'number'],
    'signers' => ['name', 'title'],
];
/** v2.1's defaults for the numbers, so a host that has never set them still issues WI-10100. */
const WX_CO_NUMBERS = ['nextNo' => 10100, 'wfNext' => 10050];
/** The `use` values a bank row may carry — v2.1 refused anything else and the bill screens filter on it. */
const WX_CO_BANK_USE = ['all', 'interior', 'furniture'];

/* ------------------------------------------------------------------ the details themselves */

/** Every key a business record holds: contact, hours, socials. */
function wx_biz_keys(): array
{
    return array_merge(WX_BIZ_CONTACT, WX_BIZ_HOURS, array_keys(WX_BIZ_SOCIAL));
}

/** The defaults, with the socials present-and-empty (v2.1 stored `''` for an unset profile). */
function wx_biz_defaults(): array
{
    $out = WX_BIZ_DEF;
    foreach (array_keys(WX_BIZ_SOCIAL) as $k) {
        $out[$k] = '';
    }
    return $out;
}

/**
 * A stored record, completed against the defaults.
 *
 * A missing key means "this host has never stored it", which is exactly what the default describes — so
 * completing is right, and an *empty* stored value stays empty (somebody deliberately blanked a social).
 */
function wx_biz_record(?array $raw): array
{
    return array_merge(wx_biz_defaults(), $raw ?? []);
}

/** A stored business record, or null when this host has never stored one. */
function wx_biz_stored(string $which = WX_BIZ_SETTING_APPLIED): ?array
{
    $raw = wx_setting($which, null);
    if ($raw === null || $raw === '') {
        return null;
    }
    $json = json_decode($raw, true);
    return is_array($json) ? wx_biz_record($json) : null;
}

/** Write one of the two records. JSON in a setting, so both halves of the screen move together. */
function wx_biz_store(string $which, array $biz): void
{
    wx_setting_set($which, (string) json_encode(wx_biz_record($biz), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/**
 * What the website carries now, and where that answer came from.
 *
 * `stored` means somebody applied a change through this console. `page` means nobody has, so it was read
 * off `index.html` — the honest alternative to v2.1's copy of the defaults, which is how a screen ends up
 * reporting "updated 1,500 places" for a change that matched nothing.
 */
function wx_biz_applied(): array
{
    $stored = wx_biz_stored(WX_BIZ_SETTING_APPLIED);
    if ($stored !== null) {
        $stored['source'] = 'stored';
        return $stored;
    }
    try {
        $read = wx_biz_from_site(WX_BIZ_SAMPLE);
        $biz = array_merge(wx_biz_defaults(), $read['values']);
        $biz['source'] = $read['rel'];
        $biz['found'] = $read['found'];
        return $biz;
    } catch (Throwable $e) {
        $biz = wx_biz_defaults();
        $biz['source'] = 'defaults';
        $biz['found'] = [];
        return $biz;
    }
}

/** Digits only — what a phone number means to a link, and how two spellings of one number are compared. */
function wx_biz_digits($s): string
{
    return (string) preg_replace('~\D~', '', is_scalar($s) ? (string) $s : '');
}

/** `923224000768` → `+92 322 4000768`, the shape the site writes and the pairs have to match. */
function wx_biz_phone_out(string $digits): string
{
    $d = wx_biz_digits($digits);
    if ($d === '') {
        return '';
    }
    /* A Pakistani mobile is 12 digits with the country code; anything else is left as digits with a plus. */
    if (strlen($d) === 12 && str_starts_with($d, '92')) {
        return '+92 ' . substr($d, 2, 3) . ' ' . substr($d, 5);
    }
    return '+' . $d;
}

/* ------------------------------------------------------------------ reading the site */

/**
 * The contact details a served page actually carries.
 *
 * This is what makes the screen truthful on a host nobody has ever applied a change to: instead of
 * believing a stored copy of the defaults, it reads the footer of a real page and reports what it found.
 * Only what it recognises is returned, so the caller can say "the page does not show opening hours"
 * rather than inventing them.
 *
 * Every pattern here is a shape the site itself writes: `tel:` and `mailto:` links (the link text is the
 * spelling people read), `wa.me/<digits>` in the WhatsApp button, an `<address>` block of `<br>`-separated
 * lines, and the hours as `Mon–Sat 9:30–6:30` inside a `<strong>`.
 *
 * @return array{values:array<string,string>, found:string[]}
 */
function wx_biz_read_html(string $html): array
{
    $found = [];
    $out = [];

    /* Phone numbers, in the order the page shows them. v2.1's two phone fields are the first two `tel:`
       links, which is exactly how the footer is written. */
    $tels = [];
    if (preg_match_all('~<a[^>]+href="tel:([^"]+)"[^>]*>(.*?)</a>~is', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $text = trim((string) preg_replace('~\s+~u', ' ', strip_tags((string) $one[2])));
            $text = $text !== '' && wx_biz_digits($text) !== '' ? $text : (string) $one[1];
            $d = wx_biz_digits($text);
            if ($d !== '' && !in_array($d, $tels, true)) {
                $tels[$d] = trim($text);
            }
        }
    }
    $tels = array_values($tels);
    if (isset($tels[0])) {
        $out['phone1'] = $tels[0];
        $found[] = 'phone1';
    }
    if (isset($tels[1])) {
        $out['phone2'] = $tels[1];
        $found[] = 'phone2';
    }

    /* The WhatsApp number: whatever `wa.me/` points at. It also fills `phone1` when the page has no `tel:`
       link at all, because the button is then the only number on it. */
    if (preg_match('~wa\.me/(\d{8,15})~', $html, $w)) {
        $wa = wx_biz_phone_out($w[1]);
        $out['wa'] = $wa;
        $found[] = 'wa';
        if (!isset($out['phone1'])) {
            $out['phone1'] = $wa;
            $found[] = 'phone1';
        }
    }

    /* The email: the link text when it looks like an address, otherwise the address in the href. */
    if (preg_match('~<a[^>]+href="mailto:([^"?]+)[^"]*"[^>]*>(.*?)</a>~is', $html, $m)) {
        $text = trim(strip_tags((string) $m[2]));
        $mail = preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', $text) ? $text : urldecode($m[1]);
        if (preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', $mail)) {
            $out['email'] = $mail;
            $found[] = 'email';
        }
    }

    /* The address block: line one and line two are the two address fields; a third line with a comma is
       the city and the country, as the site writes `Lahore, Pakistan`. */
    if (preg_match('~<address[^>]*>(.*?)</address>~is', $html, $m)) {
        $parts = array_values(array_filter(array_map(static function ($s): string {
            return trim((string) preg_replace('~\s+~u', ' ', strip_tags($s)));
        }, preg_split('~<br\s*/?>|\n~i', (string) $m[1])), static fn($s) => $s !== ''));
        if (isset($parts[0])) {
            $out['addr1'] = $parts[0];
            $found[] = 'addr1';
        }
        if (isset($parts[1])) {
            $out['addr2'] = $parts[1];
            $found[] = 'addr2';
        }
        if (isset($parts[2]) && str_contains($parts[2], ',')) {
            [$city, $country] = array_map('trim', explode(',', $parts[2], 2));
            if ($city !== '') {
                $out['city'] = $city;
                $found[] = 'city';
            }
            if ($country !== '') {
                $out['country'] = $country;
                $found[] = 'country';
            }
        }
    }

    /* The opening hours, as the footer writes them. The pattern is deliberately the same one the pairs are
       built from, so the hours that were read are the hours a later change can find again. */
    foreach ([[0, '~<strong[^>]*>(.*?)</strong>~is'], [1, '~class="[^"]*hours[^"]*"[^>]*>(.*?)<~is']] as $pair) {
        if (isset($out['days']) || !preg_match_all($pair[1], $html, $m)) {
            continue;
        }
        foreach ($m[1] as $text) {
            $seen = wx_biz_read_hours(trim((string) preg_replace('~\s+~u', ' ', strip_tags((string) $text))));
            if ($seen !== null) {
                $out += $seen;
                foreach (array_keys($seen) as $k) {
                    $found[] = $k;
                }
                break;
            }
        }
    }

    /* Social profiles, when the footer carries the row v2.1 generated. The site's current footer does not,
       and saying nothing is the right answer for that: the screen reports the row as absent instead of
       claiming to have found links that are not on the page. */
    if (preg_match_all('~<a[^>]+data-soc="([a-z]+)"[^>]+href="([^"]+)"~i', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $k = strtolower((string) $one[1]);
            if (isset(WX_BIZ_SOCIAL[$k]) && !isset($out[$k])) {
                $out[$k] = (string) $one[2];
                $found[] = $k;
            }
        }
    }

    return ['values' => $out, 'found' => array_values(array_unique($found))];
}

/** `Mon–Sat 9:30–6:30` → `['days'=>'Mon–Sat','open'=>'09:30','close'=>'18:30']`, or null. */
function wx_biz_read_hours(string $text): ?array
{
    $day = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun';
    if (!preg_match('~^(' . $day . ')\s*[–—−-]\s*(' . $day . ')?\s+(\d{1,2}[:.]\d{2})\s*[–—−-]\s*(\d{1,2}[:.]\d{2})$~u', $text, $m)) {
        return null;
    }
    $days = $m[2] !== '' ? $m[1] . '–' . $m[2] : $m[1] . '–' . $m[1];
    if (!in_array($days, WX_BIZ_DAYS, true)) {
        return null;
    }
    $open = wx_biz_hhmm($m[3]);
    $close = wx_biz_hhmm($m[4]);
    if ($open === null || $close === null || $open === $close) {
        return null;
    }
    /* The site prints 12-hour times; 9:30 is morning and 6:30 in an hours block is the evening. A close
       time that is not later than the open one is the evening reading v2.1's own pairs assumed. */
    if ($close <= $open && (int) substr($close, 0, 2) < 12) {
        $close = (string) ((int) substr($close, 0, 2) + 12) . substr($close, 2);
    }
    return ['days' => $days, 'open' => $open, 'close' => $close];
}

/** `9:30`, `09:30` and `0930` all mean the same minute; anything else is null. */
function wx_biz_hhmm($v): ?string
{
    $s = trim(is_scalar($v) ? (string) $v : '');
    if (!preg_match('~^(\d{1,2})[:.]?(\d{2})$~', $s, $m)) {
        return null;
    }
    $h = (int) $m[1];
    $min = (int) $m[2];
    if ($h > 23 || $min > 59) {
        return null;
    }
    return sprintf('%02d:%02d', $h, $min);
}

/** Read one page off the site and report what it says. */
function wx_biz_from_site(?string $rel = null): array
{
    $rel = wx_page_rel((string) ($rel === null || $rel === '' ? WX_BIZ_SAMPLE : $rel));
    $abs = WX_SITE_ROOT . '/' . $rel;
    if ($rel === '' || !is_file($abs)) {
        throw ApiError::validation('That page is not on the site', 'rel');
    }
    $read = wx_biz_read_html((string) file_get_contents($abs));
    return [
        'rel' => $rel,
        'url' => wx_page_url($rel),
        'values' => $read['values'],
        'found' => $read['found'],
    ];
}

/* ------------------------------------------------------------------ validating a change */

/**
 * A business record from client input, validated, with the old value kept where a field is blank.
 *
 * Refusals are per field, and each one names what a person would have to change: a malformed email, a
 * phone number with fewer than ten digits, a social link that is not `https://`, a time that is not a
 * time. v2.1 refused the same four things with one sentence at a time; the field name is what the screen
 * needs to point at the input rather than at the form.
 */
function wx_biz_clean($in, ?array $old = null): array
{
    $in = is_array($in) ? $in : [];
    $old = wx_biz_record($old);
    $s = static function (string $k) use ($in): string {
        $v = $in[$k] ?? null;
        return is_scalar($v) ? trim((string) $v) : '';
    };

    $out = [];
    foreach (array_merge(WX_BIZ_CONTACT, array_keys(WX_BIZ_SOCIAL)) as $k) {
        $v = $s($k);
        if ($v === '') {
            $out[$k] = (string) $old[$k];
            continue;
        }
        if (mb_strlen($v) > 160) {
            throw ApiError::validation('Keep this under 160 characters', $k);
        }
        $out[$k] = $v;
    }

    if (!preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', $out['email'])) {
        throw ApiError::validation('Check the email address', 'email');
    }
    foreach (['phone1', 'phone2', 'wa'] as $k) {
        if (strlen(wx_biz_digits($out[$k])) < 10) {
            throw ApiError::validation('Check the phone number — write it as +92 3xx xxxxxxx', $k);
        }
    }
    foreach (array_keys(WX_BIZ_SOCIAL) as $k) {
        if ($out[$k] !== '' && !preg_match('~^https://[^\s"<>]+$~', $out[$k])) {
            throw ApiError::validation('A social link must start with https://', $k);
        }
    }

    $days = $s('days') !== '' ? $s('days') : (string) $old['days'];
    if (!in_array($days, WX_BIZ_DAYS, true)) {
        throw ApiError::validation('Choose one of the working-day ranges', 'days');
    }
    $out['days'] = $days;
    foreach (['open', 'close'] as $k) {
        $t = wx_biz_hhmm($s($k) !== '' ? $s($k) : (string) $old[$k]);
        if ($t === null) {
            throw ApiError::validation('Use a 24-hour time, like 19:30', $k);
        }
        $out[$k] = $t;
    }
    return $out;
}

/* ------------------------------------------------------------------ the pairs, ported */

/** `19:30` → `7:30` — v2.1's spelling of a time inside the hours variants. */
function wx_biz_t12(string $t): string
{
    $p = explode(':', $t);
    $h = ((int) ($p[0] ?? '0')) % 12;
    return ($h === 0 ? 12 : $h) . ':' . ($p[1] ?? '00');
}

/** The long names v2.1's fifth hours variant spells out. */
const WX_BIZ_DAY_LONG = [
    'Mon' => 'Monday', 'Tue' => 'Tuesday', 'Wed' => 'Wednesday', 'Thu' => 'Thursday',
    'Fri' => 'Friday', 'Sat' => 'Saturday', 'Sun' => 'Sunday',
];

/**
 * Every way the site might have written these opening hours.
 *
 * A faithful port of v2.1's `hoursVariants()`, including the two oddities — the fifth spelling asserts
 * `AM … PM` whatever the times are, and the seventh uses the stored 24-hour times with a hyphen. They are
 * *search strings*, not claims: each one is only used if a page actually contains it, so an implausible
 * spelling costs nothing and a missing plausible one is a change that silently does not happen.
 */
function wx_biz_hours_variants(array $b): array
{
    $days = preg_split('~[–—−-]~u', (string) ($b['days'] ?? '')) ?: [];
    $a = trim((string) ($days[0] ?? ''));
    $z = trim((string) ($days[1] ?? '')) ?: $a;
    $open = (string) ($b['open'] ?? '');
    $close = (string) ($b['close'] ?? '');
    $o = wx_biz_t12($open);
    $c = wx_biz_t12($close);
    $longA = WX_BIZ_DAY_LONG[$a] ?? $a;
    $longZ = WX_BIZ_DAY_LONG[$z] ?? $z;

    return [
        $a . '–' . $z . ' ' . $o . '–' . $c,
        $a . '&ndash;' . $z . ' ' . $o . '&ndash;' . $c,
        $a . '-' . $z . ' ' . $o . '-' . $c,
        $a . ' to ' . $z . ' ' . $o . ' to ' . $c,
        $longA . ' to ' . $longZ . ', ' . $o . ' AM to ' . $c . ' PM',
        $a . '–' . $z . ' ' . $o . ' AM – ' . $c . ' PM',
        substr($a, 0, 2) . '-' . substr($z, 0, 2) . ' ' . $open . '-' . $close,
    ];
}

/**
 * The search/replace pairs that turn one business record into another.
 *
 * Ported from v2.1's `bizPairs()` with its order intact, because the order is what makes it work: the
 * WhatsApp number inside `wa.me/…` and `?phone=…` is held behind a sentinel **first**, the digits-only
 * phone pairs run in the middle (they would otherwise rewrite the number inside a WhatsApp link), and the
 * sentinel becomes the current WhatsApp number **last**. Two departures from v2.1, both because the port
 * had a bug in it:
 *
 *   · **Identical pairs are dropped.** v2.1 pushed `add()` results without checking, so a record whose two
 *     phone fields hold the same number produced the same pair twice — harmless to apply, but it doubles a
 *     count that a person reads as "places changed".
 *   · **The WhatsApp link is protected whenever a phone pair could reach into it**, not only when the
 *     WhatsApp number itself changes. On a site where `wa` and `phone1` are the same number (this one),
 *     changing the office line used to re-point the WhatsApp button at the office line — and the button
 *     still said WhatsApp.
 *
 * Each pair carries a third value: 1 when applying it is a visible change, 0 for the bookkeeping half of
 * the sentinel swap, which a later pair undoes. Nothing else reads it, and it is what lets the screen
 * report places rather than pairs.
 *
 * @return array<int,array{0:string,1:string,2:int}>
 */
function wx_biz_pairs(array $from, array $to): array
{
    $from = wx_biz_record($from);
    $to = wx_biz_record($to);
    $pairs = [];
    $seen = [];
    $add = static function ($a, $b, int $countable = 1) use (&$pairs, &$seen): void {
        $a = is_scalar($a) ? (string) $a : '';
        $b = is_scalar($b) ? (string) $b : '';
        if ($a === '' || $b === '' || $a === $b || isset($seen[$a . "\0" . $b])) {
            return;
        }
        $seen[$a . "\0" . $b] = true;
        $pairs[] = [$a, $b, $countable];
    };

    $sentinel = "\x01WA\x01";
    $oldWa = wx_biz_digits($from['wa']);
    $newWa = wx_biz_digits($to['wa']);
    $swap = $oldWa !== '' && $newWa !== '' && $oldWa !== $newWa;
    /* The guard fires only when there is something for it to do: the WhatsApp number is changing, or a
       phone field whose digits are the WhatsApp number is changing (so a digits pair would run and would
       find the number inside the button's link). An address-only change emits nothing extra. */
    $moved = static fn(string $k): bool => wx_biz_digits($to[$k]) !== wx_biz_digits($from[$k]);
    $guard = $oldWa !== '' && ($swap
        || ($moved('phone1') && $oldWa === wx_biz_digits($from['phone1']))
        || ($moved('phone2') && $oldWa === wx_biz_digits($from['phone2'])));
    if ($guard) {
        $add('wa.me/' . $oldWa, 'wa.me/' . $sentinel, 0);
        $add('phone=' . $oldWa, 'phone=' . $sentinel, 0);
    }

    $add($from['phone1'], $to['phone1']);
    $add(wx_biz_digits($from['phone1']), wx_biz_digits($to['phone1']));
    $add($from['phone2'], $to['phone2']);
    $add(wx_biz_digits($from['phone2']), wx_biz_digits($to['phone2']));
    if ($guard) {
        /* Countable only when the number really changes: with the guard alone the link is restored to the
           digits it already had, and counting that would report a change that did not happen. */
        $add($sentinel, $newWa, $swap ? 1 : 0);
    }

    $add($from['email'], $to['email']);
    $add($from['addr1'], $to['addr1']);
    $add($from['addr2'], $to['addr2']);

    $oldHours = wx_biz_hours_variants($from);
    $newHours = wx_biz_hours_variants($to);
    foreach ($oldHours as $i => $v) {
        $add($v, $newHours[$i]);
    }
    return $pairs;
}

/** v2.1's `applyPairs()`, unchanged: literal replacement, in order, everywhere in the document. */
function wx_biz_apply_pairs(string $html, array $pairs): string
{
    foreach ($pairs as $p) {
        $html = str_replace((string) ($p[0] ?? ''), (string) ($p[1] ?? ''), $html);
    }
    return $html;
}

/** The pairs a person sees, without the sentinel bookkeeping. */
function wx_biz_pairs_visible(array $pairs): array
{
    $out = [];
    foreach ($pairs as $p) {
        if ((int) ($p[2] ?? 1) === 1) {
            $out[] = [(string) $p[0], (string) $p[1]];
        }
    }
    return $out;
}

/** The social row's markup, from the links that are set — v2.1's `socHtml()`, same attributes. */
function wx_biz_social_html(array $biz): string
{
    $biz = wx_biz_record($biz);
    $out = '';
    foreach (WX_BIZ_SOCIAL as $key => $label) {
        if ((string) $biz[$key] === '') {
            continue;
        }
        $out .= '<a data-soc="' . $key . '" href="' . htmlspecialchars((string) $biz[$key], ENT_QUOTES) . '"'
            . ' target="_blank" rel="noopener" aria-label="' . htmlspecialchars($label, ENT_QUOTES) . '">'
            . '<span aria-hidden="true"></span></a>';
    }
    return $out;
}

/**
 * Replace the footer's social row with the current links, if the page has one.
 *
 * v2.1 wrapped the row in an SVG path per network. Those paths belong to the footer's markup — the
 * header/footer screen owns it and can change it — so this writes anchors with the same `data-soc`
 * attribute the v2.1 row used and nothing else. A page without the row is left alone and counted as such,
 * which is how the screen can say "the footer of this site has no social row yet" instead of "updated 0".
 *
 * @param bool|null $touched set to whether the row was found
 */
function wx_biz_social_block(string $html, array $biz, ?bool &$touched = null): string
{
    $touched = false;
    $next = preg_replace_callback(
        '~(<div class="footer-social"[^>]*>)(.*?)(</div>)~s',
        static function (array $m) use ($biz, &$touched): string {
            $touched = true;
            /* The row's own contents are dropped, not merged: the links in it are the old set, and keeping
               the paths of the ones that survive would keep the old order. */
            $inner = (string) preg_replace('~<a\b[^>]*data-soc="[^"]*".*?</a>~s', '', $m[2]);
            return $m[1] . $inner . wx_biz_social_html($biz) . $m[3];
        },
        $html
    );
    return $next ?? $html;
}

/**
 * One page through the whole edit: the pairs, then the social row.
 *
 * The count is taken as the replacements happen rather than up front, so a pair whose search string an
 * earlier pair has already consumed counts nothing — which is what makes the sentinel's two halves honest
 * (the protecting pair changes bytes, but a later pair puts them back).
 *
 * @return array{html:string, places:int, hits:int[], social:bool, changed:bool}
 */
function wx_biz_change(string $html, array $pairs, array $biz): array
{
    $original = $html;
    $places = 0;
    $hits = [];
    foreach ($pairs as $i => $p) {
        $n = substr_count($html, (string) $p[0]);
        $hits[$i] = $n;
        if ($n === 0) {
            continue;
        }
        $html = str_replace((string) $p[0], (string) $p[1], $html);
        if ((int) ($p[2] ?? 1) === 1) {
            $places += $n;
        }
    }
    $touched = false;
    $html = wx_biz_social_block($html, $biz, $touched);
    /* The social row is one more place: a change that only fills the row in would otherwise read
       "1 page, 0 places", and a person is right to read that as "nothing happened". */
    $social = $touched && $html !== $original && !str_contains($original, wx_biz_social_html($biz));
    if ($social) {
        $places += 1;
    }
    return [
        'html' => $html,
        'places' => $places,
        'hits' => $hits,
        'social' => $social,
        'changed' => $html !== $original,
    ];
}

/**
 * What applying this change would do, without writing anything.
 *
 * Per pair, how many pages contain it — so a pair built from a wrong baseline ("Mon–Sat 10:00–7:30" on a
 * site that says 9:30–6:30) is reported as matching nowhere *before* the button is pressed. v2.1's screen
 * counted only the total, which is a number that looks the same whether the change is right or wrong.
 */
function wx_biz_scan(array $pairs, array $biz, array $opt = []): array
{
    $limit = max(1, min(WX_BIZ_MAX_PAGES, (int) ($opt['limit'] ?? WX_BIZ_MAX_PAGES)));
    $only = isset($opt['rel']) && $opt['rel'] !== '' ? [wx_page_rel((string) $opt['rel'])] : wx_page_walk(WX_SITE_ROOT);
    $hits = array_fill(0, count($pairs), 0);
    $changed = [];
    $scanned = 0;
    $skipped = 0;
    $socialRows = 0;
    $socialPages = 0;

    foreach ($only as $rel) {
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            continue;
        }
        $html = (string) file_get_contents(WX_SITE_ROOT . '/' . $rel);
        foreach ($pairs as $i => $p) {
            $hits[$i] += substr_count($html, (string) $p[0]);
        }
        if (str_contains($html, 'class="footer-social"')) {
            $socialRows++;
        }
        $scanned++;
        $change = wx_biz_change($html, $pairs, $biz);
        if ($change['social']) {
            $socialPages++;
        }
        if (!$change['changed']) {
            $skipped++;
            continue;
        }
        if (count($changed) < $limit) {
            $changed[] = [
                'rel' => $rel,
                'url' => wx_page_url($rel),
                'places' => $change['places'],
                'social' => $change['social'],
            ];
        }
    }

    $none = [];
    foreach ($pairs as $i => $p) {
        if ($hits[$i] === 0) {
            $none[] = (string) $p[0];
        }
    }
    sort($none);
    return [
        'pairs' => count($pairs),
        'scanned' => $scanned,
        'skipped' => $skipped,
        'changed' => $changed,
        'pages' => count($changed),
        'places' => array_sum($hits),
        'none' => $none,
        'social' => ['rows' => $socialRows, 'pages' => $socialPages],
        'truncated' => count($changed) >= $limit,
    ];
}

/* ------------------------------------------------------------------ writing the change */

/**
 * Save the details and put them on the site, as one edit.
 *
 * The order is deliberate: the **pages first** (one batch, so one undo), then the two asset files, then the
 * stored copy of what the site now says. If a page write throws, nothing has been recorded as applied and
 * the batch that did land is named by the exception's own audit row — the failure mode is "some pages
 * changed and the console knows which", never "the console thinks it changed".
 */
function wx_biz_apply(array $biz, array $me, string $note = ''): array
{
    $applied = wx_biz_applied();
    $pairs = wx_biz_pairs($applied, $biz);

    $changed = [];
    $places = 0;
    $socialPages = 0;
    $scanned = 0;
    foreach (wx_page_walk(WX_SITE_ROOT) as $rel) {
        if (!is_file(WX_SITE_ROOT . '/' . $rel)) {
            continue;
        }
        $scanned++;
        $change = wx_biz_change((string) file_get_contents(WX_SITE_ROOT . '/' . $rel), $pairs, $biz);
        if (!$change['changed']) {
            continue;
        }
        $changed[] = $rel;
        $places += $change['places'];
        $socialPages += $change['social'] ? 1 : 0;
    }

    $batch = '';
    if ($changed) {
        $result = wx_page_write_many(
            $changed,
            static function (string $rel, string $html) use ($pairs, $biz): ?string {
                return wx_biz_change($html, $pairs, $biz)['html'];
            },
            $me,
            $note !== '' ? $note : 'Business details'
        );
        $batch = (string) $result['batch'];
    }

    /* The two non-page files. They carry no version row, so the reply says which ones moved — a count of
       pages is not a count of everything that changed. */
    $assets = [];
    foreach (WX_BIZ_ASSETS as $rel) {
        $abs = WX_SITE_ROOT . '/' . $rel;
        if (!is_file($abs)) {
            $assets[] = ['rel' => $rel, 'changed' => false, 'reason' => 'not on this host'];
            continue;
        }
        $before = (string) file_get_contents($abs);
        $after = wx_biz_apply_pairs($before, $pairs);
        if ($after === $before) {
            $assets[] = ['rel' => $rel, 'changed' => false, 'reason' => 'nothing to change'];
            continue;
        }
        wx_write_file_atomic($abs, $after);
        $assets[] = ['rel' => $rel, 'changed' => true, 'reason' => 'updated'];
    }

    wx_biz_store(WX_BIZ_SETTING_DRAFT, $biz);
    wx_biz_store(WX_BIZ_SETTING_APPLIED, $biz);

    return [
        'biz' => wx_biz_record($biz),
        'applied' => wx_biz_record($biz),
        'batch' => $batch,
        'pages' => count($changed),
        'places' => $places,
        'scanned' => $scanned,
        'social' => $socialPages,
        'assets' => $assets,
        'pairs' => count($pairs),
        'undo' => $batch !== '' ? 'POST /pages/history/' . $batch . '/rollback' : '',
    ];
}

/** Save the form without putting it on the site. v2.1's `cms_biz_save` — the draft half of the pair. */
function wx_biz_save_draft(array $biz): array
{
    wx_biz_store(WX_BIZ_SETTING_DRAFT, $biz);
    return ['draft' => wx_biz_record($biz), 'applied' => wx_biz_applied()];
}

/* ------------------------------------------------------------------ the letterhead */

/**
 * The company record documents are printed with.
 *
 * `wx_company()` already reads these from `wx_settings`; this is the same record with the lists and the
 * numbers added, because the screen has to edit what the documents use. It deliberately does not invent a
 * second store: `company.*` was already the letterhead's home before this slice.
 */
function wx_company_full(): array
{
    $c = wx_company();
    $out = array_merge($c, WX_CO_NUMBERS);
    foreach (array_keys(WX_CO_LISTS) as $k) {
        $rows = json_decode((string) wx_setting('company.' . $k, ''), true);
        $out[$k] = is_array($rows) ? $rows : [];
    }
    $out['ntn'] = (string) ($c['ntn'] ?? '');
    $out['bankName'] = (string) ($c['bankName'] ?? '');
    $out['bankTitle'] = (string) ($c['bankTitle'] ?? '');
    $out['bankAccount'] = (string) ($c['bankAccount'] ?? '');
    $out['bankIban'] = (string) ($c['bankIban'] ?? '');
    $out['consultant'] = (string) ($c['consultant'] ?? '');
    return $out;
}

/** v2.1's `co_list()`: a list of banks, wallets or signatories, clipped and dropped when it says nothing. */
function wx_company_list(string $key, $rows): array
{
    $fields = WX_CO_LISTS[$key] ?? null;
    if ($fields === null || !is_array($rows)) {
        return [];
    }
    $out = [];
    foreach (array_slice(array_values($rows), 0, 8) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $one = [];
        foreach ($fields as $f) {
            $one[$f] = mb_substr(trim(is_scalar($row[$f] ?? null) ? (string) $row[$f] : ''), 0, 120);
        }
        if ($key === 'banks') {
            $one['use'] = in_array($one['use'], WX_CO_BANK_USE, true) ? $one['use'] : 'all';
        }
        /* v2.1 kept a row only when it had a name or a number: half a bank account is not a bank account,
           and a blank row is what an empty form sends. */
        if (implode('', $one) !== '' && ($one[$fields[0]] !== '' || ($one[$fields[1]] ?? '') !== '')) {
            $out[] = $one;
        }
    }
    return $out;
}

/** The highest document number already used, so the next one cannot be set behind it. */
function wx_company_used_no(): int
{
    $used = 0;
    if (wx_table_exists('wx_quotes')) {
        foreach (wx_all('SELECT DISTINCT no FROM wx_quotes WHERE no IS NOT NULL AND no <> \'\'') as $r) {
            $used = max($used, (int) preg_replace('~\D~', '', (string) $r['no']));
        }
    }
    if (wx_table_exists('wx_invoices')) {
        foreach (wx_all('SELECT DISTINCT no FROM wx_invoices WHERE no IS NOT NULL AND no <> \'\'') as $r) {
            $used = max($used, (int) preg_replace('~\D~', '', (string) $r['no']));
        }
    }
    return $used;
}

/**
 * A letterhead from client input, validated, saving only the fields the caller actually sent.
 *
 * Absent means untouched — the same rule the header/footer screen uses, and for the same reason: a form
 * that carries one tab's fields must not blank another tab's.
 */
function wx_company_save(array $in): array
{
    $before = wx_company_full();
    $after = $before;
    $sent = static fn(string $k): bool => array_key_exists($k, $in);

    foreach (WX_CO_FIELDS as $k) {
        if ($sent($k)) {
            $after[$k] = mb_substr(trim(is_scalar($in[$k]) ? (string) $in[$k] : ''), 0, $k === 'address' ? 300 : 160);
        }
    }
    foreach (['nextNo', 'wfNext'] as $k) {
        if ($sent($k)) {
            $after[$k] = max(1, (int) round(is_numeric($in[$k]) ? (float) $in[$k] : 0.0));
        }
    }
    if ($sent('validDays')) {
        $after['validDays'] = max(1, min(365, (int) round(is_numeric($in['validDays']) ? (float) $in['validDays'] : 15)));
    }
    foreach (['prefix', 'wfPrefix'] as $k) {
        if ($sent($k)) {
            $after[$k] = mb_substr((string) preg_replace('~[^A-Za-z0-9\-/]~', '', is_scalar($in[$k]) ? (string) $in[$k] : ''), 0, 12);
        }
    }
    foreach (array_keys(WX_CO_LISTS) as $k) {
        if ($sent($k)) {
            $after[$k] = wx_company_list($k, $in[$k]);
        }
    }

    /* Everything is validated *before* anything is written: a refused save that has already moved the
       document counter is the worst of both answers — an error on screen and a changed next number. */
    $used = wx_company_used_no();
    if ((int) $after['nextNo'] <= $used) {
        throw ApiError::validation('The next quotation number must be higher than ' . $used . ', which is already used', 'nextNo');
    }
    if (!preg_match('~^[^@\s]+@[^@\s]+\.[^@\s]+$~', (string) $after['email'])) {
        throw ApiError::validation('Check the email address', 'email');
    }
    if (strlen(wx_biz_digits((string) $after['phones'])) < 10) {
        throw ApiError::validation('Check the phone numbers — write them as +92 3xx xxxxxxx', 'phones');
    }

    /* Only what the caller sent is written: saving the bank tab must not blank the signatories. */
    foreach (WX_CO_FIELDS as $k) {
        if ($sent($k)) {
            wx_setting_set('company.' . $k, (string) $after[$k]);
        }
    }
    foreach (['nextNo', 'wfNext', 'validDays'] as $k) {
        if ($sent($k)) {
            wx_setting_set('company.' . $k, (string) $after[$k]);
        }
    }
    foreach (['prefix', 'wfPrefix'] as $k) {
        if ($sent($k)) {
            wx_setting_set('company.' . $k, (string) $after[$k]);
        }
    }
    foreach (array_keys(WX_CO_LISTS) as $k) {
        if ($sent($k)) {
            wx_setting_set('company.' . $k, (string) json_encode($after[$k], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
    }

    return ['company' => wx_company_full(), 'before' => $before, 'used' => $used];
}
