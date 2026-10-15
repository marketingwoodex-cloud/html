<?php
/**
 * api/v2/lib/ai.php — the studio's AI settings, and the one HTTP call the console makes outward.
 *
 * v2.1 kept this in `frontend-v1/api/content-lib.php`: an `ai` record inside `_private/content.json`, four
 * providers, a per-provider key and model, and a free-text "voice" that every prompt is wrapped in. That
 * contract is kept here exactly, because the file is shared with v2.1 while the strangler runs: same store,
 * same keys, same defaults, so whichever admin saved last, the other one reads what it expects.
 *
 * Four things were wrong in v2.1 and each one is a decision here.
 *
 *   · **A read could leak a key.** v2.1's `ai_pub()` blanked the secrets and added `<k>Set` booleans, which
 *     is right — but it was called on the way out of one branch, so any future branch that answered with
 *     `$c['ai']` would have printed them. Here the masking is the *only* way the record is serialised:
 *     `wx_ai_state()` is what every route answers with, and it never contains a secret.
 *   · **Empty meant "clear".** A form that submitted all four key fields empty — every ordinary save of the
 *     voice, say — wiped the keys. v2.1 guarded this with a `<k>Clear` flag and so does this: a field that
 *     is absent is kept, a field that arrives empty is kept, and only an explicit `<k>Clear` erases.
 *   · **Over-long values were clipped in silence.** `clip($v, 300)` turned a mistyped API key into a
 *     shorter, wrong key that then failed at request time with a provider error. This refuses instead and
 *     names the field, the same way the announcement bar refuses rather than shortening a sentence.
 *   · **The network call was the only implementation of three separate things.** Building the request,
 *     deciding whether it succeeded, and reading the text out of the provider's answer were all inside one
 *     function that only ran on a host with cURL and a key. They are three pure functions here
 *     (`wx_ai_request()`, `wx_ai_text()`, `wx_ai_models_clean()`), which is what makes them testable in a
 *     sandbox that can reach no provider at all — and the untestable part is one `curl_exec()`.
 *
 * The sandbox this was written in has no cURL, no key and no route to any provider, so the honest half is
 * the larger: every mistake a person can make is caught before a request is attempted, and the two failures
 * that are the server's (`cURL` missing, the provider unreachable) are named as such rather than reported as
 * a bad key.
 */

declare(strict_types=1);

/** The file v2.1 reads and writes. Shared on purpose — see the header. */
const WX_AI_FILE = 'content.json';
const WX_AI_KEY = 'ai';

/** The key that must be erased and never echoed. `wx_ai_pub()` is the only serialiser for them. */
const WX_AI_SECRETS = ['anthropicKey', 'openaiKey', 'openrouterKey', 'customKey'];

/** The four providers, with the label the screen shows and the model field each one uses. */
const WX_AI_PROVIDERS = [
    'anthropic' => ['label' => 'Claude (Anthropic)', 'model' => 'claude-sonnet-4-5'],
    'openai' => ['label' => 'OpenAI', 'model' => 'gpt-4o-mini'],
    'openrouter' => ['label' => 'OpenRouter', 'model' => 'nousresearch/hermes-3-llama-3.1-405b'],
    'custom' => ['label' => 'Custom / local endpoint', 'model' => ''],
];

/** v2.1's record, byte for byte — including the default voice, which is what every prompt is prefixed with. */
const WX_AI_DEF = [
    'customKey' => '',
    'customModel' => '',
    'customUrl' => '',
    'provider' => 'anthropic',
    'anthropicKey' => '',
    'anthropicModel' => 'claude-sonnet-4-5',
    'openaiKey' => '',
    'openaiModel' => 'gpt-4o-mini',
    'openrouterKey' => '',
    'openrouterModel' => 'nousresearch/hermes-3-llama-3.1-405b',
    'voice' => 'Calm, plain, confident British English. Short sentences. No hype, no exclamation marks. Woodex Interior is a design, fit-out and renovation studio in Lahore, Pakistan.',
];

/** The writing voice is the one field a person needs room in; everything else is a key, a model id or a URL. */
const WX_AI_VOICE_MAX = 800;
const WX_AI_FIELD_MAX = 300;

/** Sent as `max_tokens`, v2.1's number: enough for an article, bounded so one click cannot cost a fortune. */
const WX_AI_MAX_TOKENS = 6000;

/** Seconds. A model list is a list; a completion is the thing somebody is waiting for. */
const WX_AI_TIMEOUT_MODELS = 20;
const WX_AI_TIMEOUT_CALL = 60;

/** A custom endpoint has to be an address a server can dial. v2.1's rule. */
const WX_AI_URL_RE = '~^https?://[^\s]+$~i';


/** Models the chat endpoints do not serve... */
const WX_AI_MODEL_DROP = '~(embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search)~i';
/** ...and, for OpenAI alone, the ones worth offering. A list of 60 models is not a choice. */
const WX_AI_MODEL_OPENAI = '~^(gpt|o\d|chatgpt)~';

/** v2.1 answered `cms_ai_models` with at most this many, and a preference order for the picker's default. */
const WX_AI_MODELS_MAX = 400;
const WX_AI_MODEL_PREF = [
    'anthropic' => ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet'],
    'openai' => ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'],
    'openrouter' => ['anthropic/claude-sonnet-4', 'openai/gpt-4o-mini'],
    'custom' => [],
];

/** The store: v2.1's `_private/content.json`, through the same atomic JSON store as everything else. */
function wx_ai_store(): JsonStore
{
    /* `WX_AI_TEST_FILE` is the one seam in this file, and it exists because of what this store holds: on a
       host that has been running a while, the file contains the studio's keys. A test suite that wrote to
       it could erase them, so the tests point this at a scratch file instead. */
    $file = defined('WX_AI_TEST_FILE') ? WX_AI_TEST_FILE : WX_PRIVATE_DIR . '/' . WX_AI_FILE;
    return new JsonStore($file, true, 0600);
}

/**
 * The AI record as stored, over v2.1's defaults.
 *
 * The `custom` provider is special in v2.1 for a good reason: a tunnel to a laptop, LM Studio or Ollama
 * needs an address and no key, and demanding a key would make a working setup look broken. A set URL with
 * no key therefore reads as `customKeySet`, without the literal `none` v2.1 wrote into the file ever being
 * stored — the file stays valid for both admins, and the screen offers to clear a key that is not there.
 */
function wx_ai_record(): array
{
    $raw = wx_ai_store()->read();
    $ai = is_array($raw[WX_AI_KEY] ?? null) ? $raw[WX_AI_KEY] : [];
    $out = WX_AI_DEF;
    foreach (WX_AI_DEF as $k => $def) {
        if (!array_key_exists($k, $ai)) {
            continue;
        }
        $out[$k] = is_scalar($ai[$k]) ? (string) $ai[$k] : $def;
    }
    if (!isset(WX_AI_PROVIDERS[$out['provider']])) {
        $out['provider'] = WX_AI_DEF['provider'];
    }
    if ($out['customKey'] === '' && $out['customUrl'] !== '') {
        $out['customKey'] = 'none';
    }
    return $out;
}

/**
 * One AI record with every secret replaced by whether it is set. The only way this record leaves PHP.
 *
 * @return array<string,mixed>
 */
function wx_ai_pub(array $ai): array
{
    /* Readiness is decided from the record *before* the secrets are emptied below — asking afterwards would
       report every provider as unconfigured, which is the kind of bug that makes a screen lie quietly. */
    $ready = wx_ai_configured($ai);
    $out = $ai;
    foreach (WX_AI_SECRETS as $k) {
        $out[$k . 'Set'] = (string) ($ai[$k] ?? '') !== '';
        $out[$k] = '';
    }
    /* `none` is the local-endpoint placeholder v2.1 wrote, not a key somebody typed: a custom endpoint that
       needs no key is ready, and its field is not offered for clearing. */
    $out['customKeySet'] = $out['customKeySet'] && (string) ($ai['customKey'] ?? '') !== 'none';
    $out['ready'] = $ready;
    return $out;
}

/** Whether a provider can be called at all right now: a key for the three hosted ones, a URL for `custom`. */
function wx_ai_configured(array $ai): bool
{
    $p = (string) ($ai['provider'] ?? 'anthropic');
    if ($p === 'custom') {
        return (string) ($ai['customUrl'] ?? '') !== '';
    }
    return (string) ($ai[($p . 'Key')] ?? '') !== '';
}

/**
 * Validate a submitted record against the one being replaced. Pure: no disk, no network.
 *
 * The rule for the four key fields is the whole point of the function, so it is spelled out: a field that
 * is **absent** is kept, a field that arrives **empty** is kept (an ordinary save does not send keys at
 * all), and `<k>Clear` set to a truthy value erases. A key of `none` is stored as empty — it is the
 * local-endpoint placeholder, not something to hash into a header.
 *
 * @return array{0:array,1:array} the record to store, and the fields that actually changed
 */
function wx_ai_clean(array $in, array $prev): array
{
    $ai = $prev;
    $changed = [];

    foreach (array_keys(WX_AI_DEF) as $k) {
        $max = $k === 'voice' ? WX_AI_VOICE_MAX : WX_AI_FIELD_MAX;
        $isSecret = in_array($k, WX_AI_SECRETS, true);
        $clear = !empty($in[$k . 'Clear']);

        if ($isSecret && $clear) {
            if ((string) ($ai[$k] ?? '') !== '') {
                $changed[] = $k;
            }
            $ai[$k] = '';
            continue;
        }
        if (!array_key_exists($k, $in)) {
            continue;
        }
        $sent = is_scalar($in[$k]) ? trim((string) $in[$k]) : '';
        /* An empty secret is "leave it alone", not "delete it". An empty *non*-secret is a real edit. */
        if ($isSecret && $sent === '') {
            continue;
        }
        if ($sent === ($ai[$k] ?? '') && $sent !== 'none') {
            continue;
        }
        if (mb_strlen($sent) > $max) {
            throw ApiError::validation(
                $isSecret
                    ? 'That key is longer than ' . $max . ' characters — check it was pasted whole'
                    : 'Keep this under ' . $max . ' characters',
                $k
            );
        }
        $ai[$k] = $sent === 'none' && $isSecret ? '' : $sent;
        $changed[] = $k;
    }

    if (!isset(WX_AI_PROVIDERS[$ai['provider']])) {
        throw ApiError::validation('Pick one of the four providers', 'provider');
    }
    $ai['customUrl'] = (string) $ai['customUrl'];
    if ($ai['customUrl'] !== '' && !preg_match(WX_AI_URL_RE, $ai['customUrl'])) {
        throw ApiError::validation('The custom endpoint must start with https:// (or http://)', 'customUrl');
    }
    if ($ai['provider'] === 'custom') {
        $ai['customUrl'] = rtrim($ai['customUrl'], '/');
    }
    return [$ai, array_values(array_unique($changed))];
}

/**
 * Save the record. Read-modify-write under one lock, so two admins saving at once cannot lose each other's
 * keys — and the rest of v2.1's file (`items`, `seq`, `placements`, …) is carried through untouched, because
 * it is the same file.
 *
 * @return array{0:array,1:array} the stored record, and the fields that changed
 */
function wx_ai_save(array $in): array
{
    $saved = null;
    $changed = [];
    wx_ai_store()->update(static function (array $raw) use ($in, &$saved, &$changed): array {
        $ai = is_array($raw[WX_AI_KEY] ?? null) ? $raw[WX_AI_KEY] : [];
        $prev = WX_AI_DEF;
        foreach (WX_AI_DEF as $k => $def) {
            $prev[$k] = (is_scalar($ai[$k] ?? null) && array_key_exists($k, $ai)) ? (string) $ai[$k] : $def;
        }
        [$saved, $changed] = wx_ai_clean($in, $prev);
        $raw[WX_AI_KEY] = $saved;
        return $raw;
    });
    return [$saved ?? wx_ai_record(), $changed];
}

/**
 * The chat-completions URL for the OpenAI-shaped providers, and the human names v2.1 used in its errors.
 * Pure.
 */
function wx_ai_chat_url(array $ai): string
{
    $p = (string) $ai['provider'];
    if ($p === 'custom') {
        $b = rtrim((string) $ai['customUrl'], '/');
        return preg_match('~/chat/completions$~', $b) ? $b : $b . '/chat/completions';
    }
    return $p === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
}

function wx_ai_provider_name(string $p): string
{
    return (string) (WX_AI_PROVIDERS[$p]['label'] ?? $p);
}

/**
 * Build one request: the URL, the headers and the body. Pure — no clock, no disk, no network.
 *
 * Anthropic's API is not OpenAI-shaped: its own endpoint, the system prompt as a top-level field, and an
 * `anthropic-version` header. Getting that wrong produces a 400 that reads like a bad key, which is why it
 * lives in a function a test can look at.
 *
 * @return array{url:string,headers:array<int,string>,body:array<string,mixed>}
 */
function wx_ai_request(array $ai, string $system, string $user): array
{
    $p = (string) $ai['provider'];
    $key = (string) ($ai[$p . 'Key'] ?? '');
    $model = (string) ($ai[$p . 'Model'] ?? '');
    if ($model === '') {
        throw ApiError::validation('Choose a model for ' . wx_ai_provider_name($p), $p . 'Model');
    }
    if ($p === 'anthropic') {
        return [
            'url' => 'https://api.anthropic.com/v1/messages',
            'headers' => [
                'x-api-key: ' . $key,
                'anthropic-version: 2023-06-01',
                'content-type: application/json',
            ],
            'body' => [
                'model' => $model,
                'max_tokens' => WX_AI_MAX_TOKENS,
                'system' => $system,
                'messages' => [['role' => 'user', 'content' => $user]],
            ],
        ];
    }
    return [
        'url' => wx_ai_chat_url($ai),
        'headers' => [
            'authorization: Bearer ' . $key,
            'content-type: application/json',
            /* OpenRouter asks who is calling; a studio's own name in the header is v2.1's behaviour. */
            'HTTP-Referer: https://woodex.com.pk',
            'X-Title: Woodex Admin',
        ],
        'body' => [
            'model' => $model,
            'max_tokens' => WX_AI_MAX_TOKENS,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
        ],
    ];
}

/** The text out of a provider's answer. Pure: Anthropic nests it in `content[]`, the others in `choices[]`. */
function wx_ai_text(string $provider, array $json): string
{
    if ($provider === 'anthropic') {
        $out = '';
        foreach ((array) ($json['content'] ?? []) as $part) {
            $out .= is_array($part) ? (string) ($part['text'] ?? '') : '';
        }
        return $out;
    }
    return (string) ($json['choices'][0]['message']['content'] ?? '');
}

/**
 * The model ids worth offering, out of whatever the provider returned, in v2.1's order and with its
 * preference for the picker's default. Pure.
 *
 * @param array $rows the provider's `data[]` or `models[]`, as sent
 * @return array{models:array<int,string>,recommended:string}
 */
function wx_ai_models_clean(string $provider, array $rows): array
{
    $ids = [];
    foreach ($rows as $m) {
        if (!is_array($m)) {
            continue;
        }
        $id = (string) ($m['id'] ?? $m['name'] ?? '');
        if ($id === '') {
            continue;
        }
        if ($provider === 'openai' && !preg_match(WX_AI_MODEL_OPENAI, $id)) {
            continue;
        }
        if (preg_match(WX_AI_MODEL_DROP, $id)) {
            continue;
        }
        $ids[] = $id;
    }
    $ids = array_values(array_unique($ids));
    if (!$ids) {
        throw ApiError::upstream('No chat models came back from ' . wx_ai_provider_name($provider));
    }
    $best = $ids[0];
    foreach (WX_AI_MODEL_PREF[$provider] ?? [] as $want) {
        foreach ($ids as $id) {
            if (str_starts_with($id, $want)) {
                $best = $id;
                break 2;
            }
        }
    }
    /* Anthropic's list arrives newest-first and is short; the others are alphabetical, as v2.1 sorted them. */
    if ($provider !== 'anthropic') {
        sort($ids);
    }
    return ['models' => array_slice($ids, 0, WX_AI_MODELS_MAX), 'recommended' => $best];
}

/** Fetch a provider's model list. Types a key before it is saved — v2.1 let you test a key from the field. */
function wx_ai_models_fetch(array $in): array
{
    $ai = wx_ai_record();
    $p = is_scalar($in['provider'] ?? null) ? (string) $in['provider'] : $ai['provider'];
    if (!isset(WX_AI_PROVIDERS[$p])) {
        throw ApiError::validation('Unknown provider', 'provider');
    }
    $key = is_scalar($in['key'] ?? null) ? trim((string) $in['key']) : '';
    if ($key === '') {
        $key = (string) ($ai[$p . 'Key'] ?? '');
    }
    if ($key === 'none') {
        $key = '';
    }
    $url = is_scalar($in['url'] ?? null) ? trim((string) $in['url']) : '';
    if ($url === '') {
        $url = (string) $ai['customUrl'];
    }
    $base = rtrim(preg_replace('~/chat/completions$~', '', rtrim($url, '/')) ?? '', '/');

    if ($p === 'custom') {
        if (!preg_match(WX_AI_URL_RE, $base)) {
            throw ApiError::validation('Enter the endpoint URL first (for example https://your-tunnel.example.com/v1)', 'url');
        }
    } elseif ($key === '' && $p !== 'openrouter') {
        /* OpenRouter lists models without a key; the other two do not, and saying which is which is the
           difference between "type your key" and "the provider refused it". */
        throw ApiError::validation('Enter the API key first', 'key');
    }

    $endpoint = [
        'anthropic' => 'https://api.anthropic.com/v1/models?limit=100',
        'openai' => 'https://api.openai.com/v1/models',
        'openrouter' => 'https://openrouter.ai/api/v1/models',
        'custom' => $base . '/models',
    ][$p];
    $headers = $p === 'anthropic'
        ? ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01']
        : ($key !== '' ? ['authorization: Bearer ' . $key] : []);

    $res = wx_http_call($endpoint, $headers, null, WX_AI_TIMEOUT_MODELS);
    $rows = (array) ($res['json']['data'] ?? $res['json']['models'] ?? []);
    return wx_ai_models_clean($p, $rows);
}

/**
 * Ask the provider for text. The caller passes the system prompt (the voice) and one user prompt.
 *
 * Written but not reachable in this sandbox: no cURL, no key, no route to a provider. It is exercised here
 * only as far as `wx_ai_request()` — the shipped parts that decide what the request *is* — and the rest is
 * for the first host run.
 */
function wx_ai_call(array $ai, string $system, string $user): string
{
    $p = (string) $ai['provider'];
    if (!wx_ai_configured($ai)) {
        throw ApiError::validation('Add a key for ' . wx_ai_provider_name($p) . ' first', $p . 'Key');
    }
    $req = wx_ai_request($ai, $system, $user);
    $res = wx_http_call($req['url'], $req['headers'], $req['body'], WX_AI_TIMEOUT_CALL);
    $text = wx_ai_text($p, $res['json']);
    if (trim($text) === '') {
        throw ApiError::upstream('The provider answered with nothing to use');
    }
    return $text;
}

/** The system prompt every task is wrapped in — v2.1's one line, kept because prompts are style. */
function wx_ai_system(array $ai): string
{
    return 'You write website copy for Woodex Interior. ' . (string) $ai['voice'];
}

/**
 * Everything the AI settings screen needs, with the secrets already gone.
 *
 * @return array<string,mixed>
 */
function wx_ai_state(): array
{
    $ai = wx_ai_record();
    $providers = [];
    foreach (WX_AI_PROVIDERS as $id => $meta) {
        $providers[] = [
            'id' => $id,
            'label' => $meta['label'],
            'model' => (string) ($ai[$id . 'Model'] ?? ''),
            'keySet' => (string) ($ai[$id . 'Key'] ?? '') !== '',
            'ready' => wx_ai_configured(['provider' => $id] + $ai),
        ];
    }
    return [
        'ai' => wx_ai_pub($ai),
        'providers' => $providers,
        'limits' => ['voice' => WX_AI_VOICE_MAX, 'field' => WX_AI_FIELD_MAX],
        'file' => WX_AI_FILE,
        'exists' => is_file(wx_ai_store()->path()),
        /* Three facts the screen cannot find out by itself, and the reason a failed call reads the way it
           does: whether this PHP can make the request at all, and whether a key or an address is in place. */
        'server' => [
            'curl' => function_exists('curl_init'),
            'cafile' => wx_http_cafile() !== null,
            'ready' => wx_ai_configured($ai),
            'provider' => (string) $ai['provider'],
        ],
    ];
}
