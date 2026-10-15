<?php
/**
 * P40 A — AI Assistant settings centre.
 * One place to control how the AI answers on the website chat, WhatsApp and Telegram:
 * reply style (Concise / Balanced / Expressive), creativity (→ temperature), reply length (→ max tokens + prompt),
 * custom instructions, assistant persona, per-channel extra notes, and a health check of every connection.
 * Stored inside the chat settings file (key 'aic') so the existing chat / WhatsApp / Telegram code picks it up.
 */
const AIC_STYLES = ['concise' => 'Concise: get to the point in 1–2 short sentences, no small talk.', 'balanced' => 'Balanced: friendly but efficient, 2–3 sentences.', 'expressive' => 'Expressive: warm and descriptive, paint a picture of the result, up to 4 sentences.'];
const AIC_LENGTHS = ['short' => ['Keep every reply under 45 words.', 220], 'medium' => ['Keep replies under 80 words.', 380], 'long' => ['Replies may be up to 140 words when the question needs detail.', 600]];
const AIC_CHANNELS = ['web' => 'Website chat', 'wa' => 'WhatsApp', 'tg' => 'Telegram'];

function aic_def(): array {
    return ['style' => 'balanced', 'creativity' => 40, 'length' => 'short', 'instructions' => '',
        'persona' => ['name' => '', 'role' => 'Interior design assistant', 'about' => ''],
        'chan' => ['web' => ['on' => true, 'style' => '', 'note' => ''], 'wa' => ['on' => true, 'style' => '', 'note' => ''], 'tg' => ['on' => true, 'style' => '', 'note' => '']],
        'urdu' => 'match', 'signoff' => false];
}
function aic_cfg(): array {
    $c = chat_cfg(); $s = is_array($c['aic'] ?? null) ? $c['aic'] : []; $d = aic_def();
    $o = array_merge($d, array_intersect_key($s, $d));
    $o['persona'] = array_merge($d['persona'], is_array($s['persona'] ?? null) ? $s['persona'] : []);
    foreach (AIC_CHANNELS as $k => $_) $o['chan'][$k] = array_merge($d['chan'][$k], is_array($s['chan'][$k] ?? null) ? $s['chan'][$k] : []);
    return $o;
}
/** Extra system-prompt lines for this channel. */
function aic_prompt(string $ch = 'web'): string {
    try { $a = aic_cfg(); } catch (Throwable $e) { return ''; }
    $ch = isset(AIC_CHANNELS[$ch]) ? $ch : 'web'; $cc = $a['chan'][$ch];
    $style = $cc['style'] !== '' && isset(AIC_STYLES[$cc['style']]) ? $cc['style'] : $a['style'];
    $p = "\n\nREPLY STYLE (set by the business owner, follow it): " . (AIC_STYLES[$style] ?? AIC_STYLES['balanced']) . ' ' . (AIC_LENGTHS[$a['length']][0] ?? AIC_LENGTHS['short'][0]);
    $pe = $a['persona'];
    if (trim($pe['name']) !== '') $p .= "\nYour name is " . $pe['name'] . ' (' . ($pe['role'] ?: 'assistant') . ' at the company). Introduce yourself by name only in your first reply.';
    if (trim($pe['about']) !== '') $p .= "\nAbout the team / how we work: " . $pe['about'];
    if ($a['urdu'] === 'roman') $p .= "\nIf the customer writes Urdu, reply in Roman Urdu (Latin letters).";
    elseif ($a['urdu'] === 'script') $p .= "\nIf the customer writes Urdu (Roman or script), reply in Urdu script.";
    if (trim($a['instructions']) !== '') $p .= "\nOWNER INSTRUCTIONS:\n" . $a['instructions'];
    if (trim($cc['note']) !== '') $p .= "\nFOR " . strtoupper(AIC_CHANNELS[$ch]) . ' ONLY: ' . $cc['note'];
    if ($a['signoff']) $p .= "\nEnd your first reply with: — " . ($pe['name'] ?: 'Woodex team') . ', Woodex Interior';
    return $p;
}
/** [temperature, max_tokens] for the AI call. */
function aic_gen(): array {
    try { $a = aic_cfg(); } catch (Throwable $e) { return [0.5, 400]; }
    return [round(max(0, min(100, (int)$a['creativity'])) / 100, 2), (int)(AIC_LENGTHS[$a['length']][1] ?? 380)];
}
/** Is the AI allowed to answer on this channel? (team still gets the messages) */
function aic_channel_on(string $ch): bool { try { return !empty(aic_cfg()['chan'][$ch]['on'] ?? true); } catch (Throwable $e) { return true; } }

/** Health check: everything the assistant depends on, with a fix hint and a link. */
function aic_health(): array {
    $o = []; $add = function (string $k, string $label, string $st, string $msg, string $link = '') use (&$o) { $o[] = ['k' => $k, 'label' => $label, 'st' => $st, 'msg' => $msg, 'link' => $link]; };
    $c = chat_cfg(); $ai = cms_load()['ai'] ?? []; $p = (string)($ai['provider'] ?? ''); $key = $p !== '' ? (string)($ai[$p . 'Key'] ?? '') : '';
    $add('ai', 'AI key', $key !== '' ? 'ok' : 'bad', $key !== '' ? 'Provider: ' . $p . ($ai[$p . 'Model'] ?? '' ? ' · ' . $ai[$p . 'Model'] : '') : 'No AI key. The chat uses Q&A rule answers only. Add it in Blog & insights → AI settings.', '#/blog');
    $add('chat', 'Website chat', !empty($c['on']) ? (!empty($c['ai']) ? 'ok' : 'warn') : 'bad', !empty($c['on']) ? (!empty($c['ai']) ? 'On, AI answers first' : 'On, but AI replies are off (team answers only)') : 'Chat bubble is turned off', '#/train');
    $crm = crm_cfg(); $wa = $crm['waToken'] !== '' && $crm['waPhoneId'] !== '';
    $add('wa', 'WhatsApp Cloud API', $wa ? 'ok' : 'warn', $wa ? 'Connected' : 'Not connected. Customers can still click to WhatsApp you, but replies are not in the Inbox.', '#/settings/connections');
    $add('waai', 'WhatsApp AI agent', !$wa ? 'off' : (!empty($c['waAgent']) ? 'ok' : 'warn'), !$wa ? 'Needs WhatsApp connected first' : (!empty($c['waAgent']) ? 'AI answers WhatsApp messages' : 'Off: the team answers WhatsApp manually'), '#/train');
    if (function_exists('tg_cfg')) { $t = tg_cfg(); $tr = function_exists('tg_ready') && tg_ready();
        $add('tg', 'Telegram bot', $tr ? 'ok' : 'warn', $tr ? 'Bot @' . ($t['bot'] ?? '') . ' connected' : 'Not connected (optional: team alerts and replies from Telegram)', '#/telegram');
        $add('tgg', 'Telegram team group', !$tr ? 'off' : (($t['group'] ?? '') !== '' ? 'ok' : 'warn'), !$tr ? 'Needs the bot first' : (($t['group'] ?? '') !== '' ? 'Alerts go to ' . ($t['groupTitle'] ?? 'the group') : 'No team group yet: hand-offs and reminders are not posted'), '#/telegram'); }
    $em = $crm['smtpHost'] !== ''; $add('mail', 'Email (SMTP)', $em ? 'ok' : 'warn', $em ? 'Set up' : 'Not set up: email alerts and client emails are not sent', '#/settings');
    if (function_exists('wag_load')) { $d = wag_load(); $lt = $d['lastTick'] ?? null; $fresh = $lt && strtotime($lt) > time() - 1800;
        $add('cron', 'Automation worker (cron)', $fresh ? 'ok' : ($lt ? 'warn' : 'bad'), $fresh ? 'Last ran ' . $lt : ($lt ? 'Last ran ' . $lt . ': check the Hostinger cron job' : 'Never ran: follow-ups, rules and reminders will not send. Add the cron job (every 5 min).'), '#/wauto');
        $ap = count(array_filter($d['tpls'], fn($x) => ($x['status'] ?? '') === 'APPROVED'));
        $add('tpl', 'WhatsApp templates', $d['tpls'] ? ($ap ? 'ok' : 'warn') : 'warn', $d['tpls'] ? $ap . ' of ' . count($d['tpls']) . ' approved by Meta' : 'No templates yet (needed for follow-ups after 24 hours)', '#/wauto'); }
    $qa = count((array)$c['qa']); $add('qa', 'Training Q&A', $qa >= 10 ? 'ok' : 'warn', $qa . ' answer' . ($qa === 1 ? '' : 's') . ($qa < 10 ? ': add at least 10 common questions' : ''), '#/train');
    try { $un = (int)q("SELECT COUNT(*) FROM wx_ai_unans WHERE status='open'")->fetchColumn(); } catch (Throwable $e) { $un = 0; }
    $add('un', 'Unanswered questions', $un ? 'warn' : 'ok', $un ? $un . ' question' . ($un > 1 ? 's' : '') . ' to review' : 'Nothing to review', '#/aireport');
    $ts = $crm['tsSite'] !== '' && $crm['tsSecret'] !== ''; $add('spam', 'Spam protection (Turnstile)', $ts ? 'ok' : 'warn', $ts ? 'On' : 'Off: forms use honeypot + rate limit only', '#/settings');
    return $o;
}

function aic_actions(string $action, array $in): bool {
    if (!preg_match('~^aic_~', $action)) return false;
    switch ($action) {
        case 'aic_get':
            need(['owner', 'admin']); $c = chat_cfg();
            out(['ok' => true, 'aic' => aic_cfg(), 'styles' => array_map(fn($x) => explode(':', $x)[0], AIC_STYLES), 'channels' => AIC_CHANNELS,
                'base' => ['greeting' => $c['greeting'], 'waGreeting' => $c['waGreeting'], 'tone' => $c['tone'], 'tones' => array_keys(CHAT_TONES), 'noPrices' => !empty($c['noPrices']), 'ai' => !empty($c['ai']), 'waAgent' => !empty($c['waAgent']), 'on' => !empty($c['on']), 'hours' => $c['hours']],
                'health' => aic_health()]);
        case 'aic_health':
            need(['owner', 'admin']); out(['ok' => true, 'health' => aic_health()]);
        case 'aic_save':
            $u = need(['owner', 'admin']); $s = is_array($in['aic'] ?? null) ? $in['aic'] : []; $a = aic_cfg();
            if (isset($s['style']) && isset(AIC_STYLES[$s['style']])) $a['style'] = $s['style'];
            if (isset($s['length']) && isset(AIC_LENGTHS[$s['length']])) $a['length'] = $s['length'];
            if (isset($s['creativity'])) $a['creativity'] = max(0, min(100, (int)$s['creativity']));
            if (isset($s['instructions'])) $a['instructions'] = mb_substr(trim((string)$s['instructions']), 0, 2000);
            if (isset($s['urdu']) && in_array($s['urdu'], ['match', 'roman', 'script'], true)) $a['urdu'] = $s['urdu'];
            if (array_key_exists('signoff', $s)) $a['signoff'] = !empty($s['signoff']);
            if (isset($s['persona']) && is_array($s['persona'])) foreach (['name' => 40, 'role' => 60, 'about' => 1000] as $k => $n) if (isset($s['persona'][$k])) $a['persona'][$k] = mb_substr(trim(strip_tags((string)$s['persona'][$k])), 0, $n);
            if (isset($s['chan']) && is_array($s['chan'])) foreach (AIC_CHANNELS as $k => $_) { $x = $s['chan'][$k] ?? null; if (!is_array($x)) continue;
                if (array_key_exists('on', $x)) $a['chan'][$k]['on'] = !empty($x['on']);
                if (isset($x['style'])) $a['chan'][$k]['style'] = isset(AIC_STYLES[$x['style']]) ? $x['style'] : '';
                if (isset($x['note'])) $a['chan'][$k]['note'] = mb_substr(trim((string)$x['note']), 0, 600); }
            $c = jread(CHAT_FILE); $c['aic'] = $a;
            // shared basics edited on the same screen
            $b = is_array($in['base'] ?? null) ? $in['base'] : [];
            foreach (['greeting' => 500, 'waGreeting' => 500] as $k => $n) if (isset($b[$k])) $c[$k] = mb_substr(trim((string)$b[$k]), 0, $n);
            if (isset($b['tone']) && isset(CHAT_TONES[$b['tone']])) $c['tone'] = $b['tone'];
            foreach (['noPrices', 'ai', 'waAgent', 'on'] as $k) if (array_key_exists($k, $b)) $c[$k] = !empty($b[$k]);
            jwrite(CHAT_FILE, $c); log_act($u, 'ai.settings', ''); out(['ok' => true, 'aic' => aic_cfg()]);
    }
    return false;
}
