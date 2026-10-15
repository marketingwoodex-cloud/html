<?php
/**
 * P40 Part E — Social media planner (Facebook Page + Instagram Business).
 *  - Posts: draft → scheduled → published / failed. Text, one image (from the Media library) and an optional link.
 *  - AI captions in the Woodex designer voice (no prices), with hashtags, per platform.
 *  - Scheduled posts are published by the existing cron job (api/wa-cron.php → soc_tick()).
 *  - Manager changes go to Master approval automatically (approvals-lib: "save"/"submit"/"send" actions).
 * State: _private/social.json  { cfg: {pageId, igId, token, tz}, posts: [...] }
 */
const SOC_FILE = PRIVATE_DIR . '/social.json';
const SOC_GRAPH = 'https://graph.facebook.com/v21.0/';

function soc_load(): array {
    $d = jread(SOC_FILE);
    $d['cfg'] = array_merge(['pageId' => '', 'igId' => '', 'token' => '', 'tags' => '#WoodexInterior #InteriorDesignLahore #Lahore', 'autoDraft' => true, 'autoSince' => '', 'liOrg' => '', 'liToken' => '', 'gAcc' => '', 'gLoc' => '', 'gClient' => '', 'gSecret' => '', 'gRefresh' => ''], is_array($d['cfg'] ?? null) ? $d['cfg'] : []);
    $d['seen'] = is_array($d['seen'] ?? null) ? $d['seen'] : [];
    $d['comments'] = is_array($d['comments'] ?? null) ? $d['comments'] : [];
    $d['posts'] = array_values(is_array($d['posts'] ?? null) ? $d['posts'] : []);
    return $d;
}
function soc_save(array $d): void { jwrite(SOC_FILE, $d); }
function soc_id(): string { return 'p' . bin2hex(random_bytes(5)); }
function soc_base(): string { $h = preg_replace('~[^a-z0-9.:-]~i', '', (string)($_SERVER['HTTP_HOST'] ?? '')); return $h !== '' ? 'https://' . $h : 'https://woodex.com.pk'; }
const SOC_SECRETS = ['token', 'liToken', 'gSecret', 'gRefresh'];
const SOC_NETS = ['fb', 'ig', 'li', 'gb'];
function soc_pub_cfg(array $c): array { $o = $c; foreach (SOC_SECRETS as $k) { $o[$k . 'Set'] = $c[$k] !== ''; $o[$k] = ''; } $o['tokenSet'] = $c['token'] !== ''; return $o; }
function soc_ready(array $c): array { return ['fb' => $c['token'] !== '' && $c['pageId'] !== '', 'ig' => $c['token'] !== '' && $c['igId'] !== '', 'li' => $c['liToken'] !== '' && $c['liOrg'] !== '', 'gb' => $c['gRefresh'] !== '' && $c['gClient'] !== '' && $c['gSecret'] !== '' && $c['gAcc'] !== '' && $c['gLoc'] !== '']; }
/** JSON HTTP call (LinkedIn / Google). */
function soc_http(string $method, string $url, array $headers, $body = null, bool $raw = false): array {
    if (!function_exists('curl_init')) return ['_code' => 0, 'error' => ['message' => 'The server has no cURL']];
    $ch = curl_init($url); $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_HEADER => true];
    if ($body !== null) $o[CURLOPT_POSTFIELDS] = $raw ? $body : (is_string($body) ? $body : json_encode($body));
    curl_setopt_array($ch, $o); if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $res = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) return ['_code' => 0, 'error' => ['message' => $err ?: 'No answer']];
    $head = substr($res, 0, $hs); $j = json_decode(substr($res, $hs), true); $j = is_array($j) ? $j : [];
    if (preg_match('~^x-restli-id:\s*(\S+)~mi', $head, $m)) $j['_id'] = trim($m[1]);
    $j['_code'] = $code; return $j;
}
function soc_li_post(array $cfg, string $text, string $img, string $link, string $title): array {
    $H = ['Authorization: Bearer ' . $cfg['liToken'], 'LinkedIn-Version: 202409', 'X-Restli-Protocol-Version: 2.0.0', 'Content-Type: application/json'];
    $owner = 'urn:li:organization:' . $cfg['liOrg']; $content = null;
    if ($img !== '') {
        $bytes = ''; // security: local files only from /assets (no ../), remote only https pictures, max 8 MB
        if (!preg_match('~^https?://~', $img)) { $f = realpath(ROOT_DIR . '/' . ltrim(parse_url($img, PHP_URL_PATH) ?: '', '/')); $base = realpath(ROOT_DIR . '/assets');
            if ($f && $base && str_starts_with($f, $base . DIRECTORY_SEPARATOR) && preg_match('~\.(jpe?g|png|webp|gif)$~i', $f) && filesize($f) < 8388608) $bytes = (string)file_get_contents($f); }
        elseif (preg_match('~^https://~', $img)) { $bytes = (string)@file_get_contents($img, false, stream_context_create(['http' => ['timeout' => 20, 'follow_location' => 0]]), 0, 8388608); if ($bytes !== '' && !preg_match('~^(\xFF\xD8|\x89PNG|RIFF|GIF8)~', $bytes)) $bytes = ''; }
        if ($bytes !== '') {
            $init = soc_http('POST', 'https://api.linkedin.com/rest/images?action=initializeUpload', $H, ['initializeUploadRequest' => ['owner' => $owner]]);
            $up = (string)($init['value']['uploadUrl'] ?? ''); $urn = (string)($init['value']['image'] ?? '');
            if ($up !== '' && $urn !== '') { $put = soc_http('PUT', $up, ['Authorization: Bearer ' . $cfg['liToken'], 'Content-Type: application/octet-stream'], $bytes, true); if ($put['_code'] < 300) $content = ['media' => ['id' => $urn, 'title' => mb_substr($title ?: 'Woodex Interior', 0, 100)]]; }
        }
    }
    if (!$content && $link !== '') $content = ['article' => ['source' => $link, 'title' => mb_substr($title ?: 'Woodex Interior', 0, 200)]];
    $body = ['author' => $owner, 'commentary' => mb_substr($text . ($link !== '' && isset($content['media']) ? "\n\n" . $link : ''), 0, 3000), 'visibility' => 'PUBLIC', 'distribution' => ['feedDistribution' => 'MAIN_FEED', 'targetEntities' => [], 'thirdPartyDistributionChannels' => []], 'lifecycleState' => 'PUBLISHED', 'isReshareDisabledByAuthor' => false];
    if ($content) $body['content'] = $content;
    $j = soc_http('POST', 'https://api.linkedin.com/rest/posts', $H, $body);
    if ($j['_code'] >= 300) return ['error' => (string)($j['message'] ?? ('LinkedIn error ' . $j['_code'])) . ($j['_code'] === 401 ? ' (token expired: LinkedIn tokens last 60 days, paste a new one in Settings)' : '')];
    return ['id' => (string)($j['_id'] ?? ''), 't' => now()];
}
function soc_g_token(array $cfg): string {
    $j = soc_http('POST', 'https://oauth2.googleapis.com/token', ['Content-Type: application/x-www-form-urlencoded'], http_build_query(['client_id' => $cfg['gClient'], 'client_secret' => $cfg['gSecret'], 'refresh_token' => $cfg['gRefresh'], 'grant_type' => 'refresh_token']), true);
    return (string)($j['access_token'] ?? '');
}
function soc_gb_post(array $cfg, string $text, string $url, string $link): array {
    $tok = soc_g_token($cfg); if ($tok === '') return ['error' => 'Google sign-in failed: check the client ID, secret and refresh token'];
    $body = ['languageCode' => 'en', 'summary' => mb_substr(preg_replace('~(^|\s)#\w+~u', '', $text), 0, 1500), 'topicType' => 'STANDARD'];
    if ($link !== '') $body['callToAction'] = ['actionType' => 'LEARN_MORE', 'url' => $link]; else $body['callToAction'] = ['actionType' => 'CALL'];
    if ($url !== '') $body['media'] = [['mediaFormat' => 'PHOTO', 'sourceUrl' => $url]];
    $j = soc_http('POST', 'https://mybusiness.googleapis.com/v4/accounts/' . rawurlencode($cfg['gAcc']) . '/locations/' . rawurlencode($cfg['gLoc']) . '/localPosts', ['Authorization: Bearer ' . $tok, 'Content-Type: application/json'], $body);
    if ($j['_code'] >= 300) return ['error' => (string)($j['error']['message'] ?? ('Google error ' . $j['_code']))];
    return ['id' => (string)($j['name'] ?? 'posted'), 't' => now(), 'url' => (string)($j['searchUrl'] ?? '')];
}

/** One Graph API call. Returns decoded JSON or ['error' => ['message' => ...]]. */
function soc_graph(string $path, array $post, string $token): array {
    if (!function_exists('curl_init')) return ['error' => ['message' => 'The server has no cURL']];
    $ch = curl_init(SOC_GRAPH . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($post + ['access_token' => $token])]);
    if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $raw = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    $j = json_decode((string)$raw, true);
    return is_array($j) ? $j : ['error' => ['message' => $err ?: 'No answer from Meta']];
}

/** Publish one post to its platforms. Updates $p in place (status, results). */
function soc_publish(array &$p, array $cfg): void {
    $img = trim((string)($p['image'] ?? '')); $url = $img === '' ? '' : (preg_match('~^https?://~', $img) ? $img : soc_base() . '/' . ltrim($img, '/'));
    $text = trim((string)$p['text']); $link = trim((string)($p['link'] ?? ''));
    $res = is_array($p['res'] ?? null) ? $p['res'] : [];
    foreach ((array)$p['nets'] as $n) {
        if (!empty($res[$n]['id'])) continue; // already published there
        if ($n === 'li') { $res['li'] = soc_ready($cfg)['li'] ? soc_li_post($cfg, $text, $img, $link, (string)($p['title'] ?? '')) : ['error' => 'Connect LinkedIn first (Social media → Settings)']; continue; }
        if ($n === 'gb') { $res['gb'] = soc_ready($cfg)['gb'] ? soc_gb_post($cfg, $text, $url, $link) : ['error' => 'Connect Google Business Profile first (Social media → Settings)']; continue; }
        if ($cfg['token'] === '') { $res[$n] = ['error' => 'Connect Facebook first (Social media → Settings)']; continue; }
        if ($n === 'fb') {
            if ($cfg['pageId'] === '') { $res['fb'] = ['error' => 'Facebook Page ID is missing']; continue; }
            $j = $url !== '' ? soc_graph($cfg['pageId'] . '/photos', ['url' => $url, 'caption' => $text . ($link ? "\n\n" . $link : '')], $cfg['token'])
                             : soc_graph($cfg['pageId'] . '/feed', ['message' => $text] + ($link ? ['link' => $link] : []), $cfg['token']);
            $res['fb'] = isset($j['error']) ? ['error' => (string)($j['error']['error_user_msg'] ?? $j['error']['message'])] : ['id' => (string)($j['post_id'] ?? $j['id'] ?? ''), 't' => now()];
        } elseif ($n === 'ig') {
            if ($cfg['igId'] === '') { $res['ig'] = ['error' => 'Instagram account ID is missing']; continue; }
            if ($url === '') { $res['ig'] = ['error' => 'Instagram needs an image']; continue; }
            if (preg_match('~\.(webp|gif|svg|avif)(\?|$)~i', $url)) { $res['ig'] = ['error' => 'Instagram only accepts JPG images. Choose a .jpg from the Media library']; continue; }
            $c = soc_graph($cfg['igId'] . '/media', ['image_url' => $url, 'caption' => $text], $cfg['token']);
            if (isset($c['error']) || empty($c['id'])) { $res['ig'] = ['error' => (string)($c['error']['error_user_msg'] ?? $c['error']['message'] ?? 'Upload failed')]; continue; }
            $j = soc_graph($cfg['igId'] . '/media_publish', ['creation_id' => $c['id']], $cfg['token']);
            $res['ig'] = isset($j['error']) ? ['error' => (string)($j['error']['error_user_msg'] ?? $j['error']['message'])] : ['id' => (string)($j['id'] ?? ''), 't' => now()];
        }
    }
    $p['res'] = $res; $ok = 0; $bad = [];
    foreach ((array)$p['nets'] as $n) { if (!empty($res[$n]['id'])) $ok++; elseif (!empty($res[$n]['error'])) $bad[] = strtoupper($n) . ': ' . $res[$n]['error']; }
    $p['status'] = $ok === count((array)$p['nets']) ? 'published' : ($ok ? 'partial' : 'failed'); $p['error'] = implode(' · ', $bad);
    if ($ok) $p['published_at'] = now();
}

/** GET from the Graph API. */
function soc_graph_get(string $path, array $q, string $token): array {
    if (!function_exists('curl_init')) return ['error' => ['message' => 'The server has no cURL']];
    $ch = curl_init(SOC_GRAPH . $path . '?' . http_build_query($q + ['access_token' => $token]));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);
    if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $raw = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
    $j = json_decode((string)$raw, true);
    return is_array($j) ? $j : ['error' => ['message' => $err ?: 'No answer from Meta']];
}

/** New published articles / case studies → draft social posts (once each). Returns how many were added. */
function soc_auto_drafts(array &$d): int {
    if (empty($d['cfg']['autoDraft']) || !function_exists('cms_load')) return 0;
    if ($d['cfg']['autoSince'] === '') { $d['cfg']['autoSince'] = now(); return -1; } // start from today: older items are skipped
    $n = 0; $tags = $d['cfg']['tags'];
    foreach ((cms_load()['items'] ?? []) as $it) {
        if (!in_array($it['type'] ?? '', ['post', 'study'], true) || ($it['status'] ?? '') !== 'published' || empty($it['rel'])) continue;
        $key = $it['type'] . ':' . $it['id'];
        if (isset($d['seen'][$key]) || (string)($it['published_at'] ?? '') < $d['cfg']['autoSince']) continue;
        $d['seen'][$key] = now();
        $url = soc_base() . '/' . preg_replace('~index\.html$~', '', ltrim((string)$it['rel'], '/'));
        $dek = trim(strip_tags((string)($it['data']['dek'] ?? $it['seo']['desc'] ?? '')));
        $img = trim((string)($it['data']['hero'] ?? $it['seo']['og'] ?? ''));
        if ($img !== '' && (!preg_match('~^(/[\w\-./%]+|https://[^\s"<>]+)$~', $img) || str_contains($img, '..'))) $img = '';
        $nets = ['fb']; if ($img !== '' && preg_match('~\.jpe?g(\?|$)~i', $img)) $nets[] = 'ig';
        $lead = $it['type'] === 'study' ? 'New project story: ' : 'New on the Woodex journal: ';
        $text = $lead . $it['title'] . ($dek ? "\n\n" . $dek : '') . "\n\nRead it here: " . $url . "\n\n" . $tags;
        $d['posts'][] = ['id' => soc_id(), 'created_at' => now(), 'res' => [], 'nets' => $nets, 'text' => mb_substr($text, 0, 2200), 'image' => $img, 'link' => $url, 'when' => '', 'status' => 'draft', 'error' => '', 'title' => mb_substr(($it['type'] === 'study' ? 'Project: ' : 'Article: ') . $it['title'], 0, 80), 'by' => 'Auto (website)', 'auto' => $key];
        $n++;
    }
    return $n;
}

/** Pull recent comments for published posts (last 30 days, max 25 posts). */
function soc_fetch_comments(array &$d): array {
    $cfg = $d['cfg']; if ($cfg['token'] === '') return ['error' => 'Connect Facebook first'];
    $old = []; foreach ($d['comments'] as $c) $old[$c['id']] = $c;
    $lim = date('Y-m-d H:i:s', time() - 30 * 86400); $k = 0; $errs = [];
    foreach (array_reverse($d['posts']) as $p) {
        if ($k >= 25) break; if (!in_array($p['status'] ?? '', ['published', 'partial'], true) || (string)($p['published_at'] ?? '') < $lim) continue; $k++;
        foreach (['fb', 'ig'] as $n) {
            $mid = (string)($p['res'][$n]['id'] ?? ''); if ($mid === '') continue;
            $j = $n === 'fb' ? soc_graph_get($mid . '/comments', ['fields' => 'id,message,from{name},created_time', 'limit' => 50, 'order' => 'reverse_chronological'], $cfg['token'])
                             : soc_graph_get($mid . '/comments', ['fields' => 'id,text,username,timestamp', 'limit' => 50], $cfg['token']);
            if (isset($j['error'])) { $errs[] = strtoupper($n) . ': ' . ($j['error']['message'] ?? 'error'); continue; }
            foreach ((array)($j['data'] ?? []) as $c) {
                $id = (string)($c['id'] ?? ''); if ($id === '' || isset($old[$id])) continue;
                $ts = strtotime((string)($c['created_time'] ?? $c['timestamp'] ?? '')) ?: time();
                $old[$id] = ['id' => $id, 'net' => $n, 'post' => $p['id'], 'postTitle' => $p['title'] ?: mb_substr($p['text'], 0, 50), 'name' => mb_substr((string)($c['from']['name'] ?? $c['username'] ?? 'Someone'), 0, 80), 'text' => mb_substr((string)($c['message'] ?? $c['text'] ?? ''), 0, 1000), 't' => date('Y-m-d H:i:s', $ts), 'read' => false, 'reply' => ''];
            }
        }
    }
    uasort($old, fn($a, $b) => strcmp($b['t'], $a['t']));
    $d['comments'] = array_values(array_slice($old, 0, 500)); $d['commentsAt'] = now();
    return ['ok' => true, 'errors' => $errs];
}

/** Cron: publish posts whose time has come (max 5 per run). */
function soc_tick(): array {
    $d = soc_load(); $n = 0;
    foreach ($d['posts'] as &$p) { if ($n >= 5) break; if (($p['status'] ?? '') === 'scheduled' && (string)$p['when'] !== '' && $p['when'] <= now()) { soc_publish($p, $d['cfg']); $n++; } } unset($p);
    $a = 0; try { $a = soc_auto_drafts($d); } catch (Throwable $e) { error_log('soc auto: ' . $e->getMessage()); }
    $c = 0; if ($d['cfg']['token'] !== '' && (string)($d['commentsAt'] ?? '') < date('Y-m-d H:i:s', time() - 900)) { $before = count($d['comments']); soc_fetch_comments($d); $c = count($d['comments']) - $before; }
    if ($n || $a || ($d['commentsAt'] ?? '') !== '') soc_save($d);
    return ['social' => $n, 'socialDrafts' => max(0, $a), 'socialComments' => max(0, $c)];
}

function soc_clean(array $in, ?array $old): array {
    $nets = array_values(array_intersect(SOC_NETS, (array)($in['nets'] ?? [])));
    if (!$nets) fail('Choose at least one: Facebook, Instagram, LinkedIn or Google');
    $text = mb_substr(trim(strip_tags((string)($in['text'] ?? ''))), 0, 2200); if ($text === '') fail('Write the post text');
    $img = trim((string)($in['image'] ?? '')); if ($img !== '' && (!preg_match('~^(/[\w\-./%]+|https://[^\s"<>]+)$~', $img) || str_contains($img, '..') || !preg_match('~\.(jpe?g|png|webp|gif)(\?.*)?$~i', $img))) fail('Image must be a picture from the Media library or an https link');
    $link = trim((string)($in['link'] ?? '')); if ($link !== '' && !preg_match('~^https?://[^\s"<>]+$~', $link)) fail('The link must start with https://');
    if (in_array('ig', $nets, true) && $img === '') fail('Instagram posts need an image');
    $when = trim((string)($in['when'] ?? '')); if ($when !== '') { $ts = strtotime($when); if (!$ts) fail('Pick a valid date and time'); $when = date('Y-m-d H:i:00', $ts); }
    $st = (string)($in['status'] ?? 'draft'); if (!in_array($st, ['draft', 'scheduled'], true)) $st = 'draft';
    if ($st === 'scheduled' && $when === '') fail('Pick a date and time to schedule');
    return array_merge($old ?? ['id' => soc_id(), 'created_at' => now(), 'res' => []], ['nets' => $nets, 'text' => $text, 'image' => $img, 'link' => $link, 'when' => $when, 'status' => $st, 'error' => '', 'title' => mb_substr(trim((string)($in['title'] ?? '')), 0, 80)]);
}

function soc_actions(string $action, array $in): bool {
    if (!preg_match('~^soc_~', $action)) return false;
    $OA = ['owner', 'admin'];
    switch ($action) {
        case 'soc_get':
            $u = need($OA); $d = soc_load(); if (soc_auto_drafts($d) !== 0) soc_save($d); $c = $d['cfg'];
            $posts = $d['posts']; usort($posts, fn($a, $b) => strcmp((string)($b['when'] ?: $b['created_at']), (string)($a['when'] ?: $a['created_at'])));
            out(['ok' => true, 'cfg' => soc_pub_cfg($c), 'connected' => in_array(true, soc_ready($c), true), 'ready' => soc_ready($c), 'posts' => $posts, 'comments' => array_slice($d['comments'], 0, 200), 'unread' => count(array_filter($d['comments'], fn($x) => empty($x['read']))), 'commentsAt' => $d['commentsAt'] ?? '', 'now' => now()]);
        case 'soc_cfg_save':
            $u = need($OA); $d = soc_load(); $s = (array)($in['cfg'] ?? []);
            foreach (['pageId', 'igId'] as $k) if (isset($s[$k])) $d['cfg'][$k] = substr(preg_replace('~\D~', '', (string)$s[$k]), 0, 30);
            if (isset($s['token']) && trim((string)$s['token']) !== '') $d['cfg']['token'] = substr(preg_replace('~[^A-Za-z0-9_\-|.]~', '', (string)$s['token']), 0, 600);
            if (!empty($s['clearToken'])) $d['cfg']['token'] = '';
            foreach (['liOrg', 'gAcc', 'gLoc'] as $k) if (isset($s[$k])) $d['cfg'][$k] = substr(preg_replace('~\D~', '', (string)$s[$k]), 0, 30);
            if (isset($s['gClient'])) $d['cfg']['gClient'] = substr(preg_replace('~[^A-Za-z0-9_.\-]~', '', (string)$s['gClient']), 0, 200);
            foreach (['liToken', 'gSecret', 'gRefresh'] as $k) if (isset($s[$k]) && trim((string)$s[$k]) !== '') $d['cfg'][$k] = substr(preg_replace('~[^A-Za-z0-9_\-|./~+=]~', '', (string)$s[$k]), 0, 1000);
            foreach ((array)($s['clear'] ?? []) as $k) if (in_array($k, ['liToken', 'gRefresh'], true)) $d['cfg'][$k] = '';
            if (isset($s['autoDraft'])) $d['cfg']['autoDraft'] = (bool)$s['autoDraft'];
            if (isset($s['tags'])) $d['cfg']['tags'] = mb_substr(trim(strip_tags((string)$s['tags'])), 0, 300);
            soc_save($d); log_act($u, 'social.cfg', ''); out(['ok' => true, 'cfg' => soc_pub_cfg($d['cfg'])]);
        case 'soc_post_save':
            $u = need($OA); $d = soc_load(); $id = (string)($in['post']['id'] ?? ''); $old = null; $ix = -1;
            foreach ($d['posts'] as $i => $p) if ($p['id'] === $id) { $old = $p; $ix = $i; }
            if ($old && in_array($old['status'], ['published', 'partial'], true)) fail('This post is already published. Duplicate it to post again.');
            $p = soc_clean((array)($in['post'] ?? []), $old); $p['by'] = $u['name']; $p['updated_at'] = now();
            if ($ix >= 0) $d['posts'][$ix] = $p; else { if (count($d['posts']) >= 1000) array_shift($d['posts']); $d['posts'][] = $p; }
            soc_save($d); log_act($u, 'social.post', $p['status'] . ' ' . mb_substr($p['text'], 0, 40)); out(['ok' => true, 'post' => $p]);
        case 'soc_post_delete':
            $u = need($OA); $d = soc_load(); $id = (string)($in['id'] ?? '');
            $d['posts'] = array_values(array_filter($d['posts'], fn($p) => $p['id'] !== $id)); soc_save($d); log_act($u, 'social.delete', $id); out(['ok' => true]);
        case 'soc_post_send': // publish now
            $u = need($OA); $d = soc_load(); $id = (string)($in['id'] ?? ''); $hit = null;
            foreach ($d['posts'] as &$p) if ($p['id'] === $id) { soc_publish($p, $d['cfg']); $hit = $p; } unset($p);
            if (!$hit) fail('Post not found'); soc_save($d); log_act($u, 'social.publish', $hit['status']);
            out(['ok' => $hit['status'] !== 'failed', 'post' => $hit, 'error' => $hit['status'] === 'failed' ? $hit['error'] : null]);
        case 'soc_comments_sync':
            $u = need($OA); $d = soc_load(); $r = soc_fetch_comments($d); if (isset($r['error'])) fail($r['error']); soc_save($d);
            out(['ok' => true, 'comments' => array_slice($d['comments'], 0, 200), 'errors' => $r['errors'], 'commentsAt' => $d['commentsAt']]);
        case 'soc_comment_read':
            $u = need($OA); $d = soc_load(); $ids = array_map('strval', (array)($in['ids'] ?? []));
            foreach ($d['comments'] as &$c) if (in_array($c['id'], $ids, true) || !empty($in['all'])) $c['read'] = true; unset($c);
            soc_save($d); out(['ok' => true]);
        case 'soc_comment_reply':
            $u = need($OA); $d = soc_load(); $id = (string)($in['id'] ?? ''); $text = mb_substr(trim(strip_tags((string)($in['text'] ?? ''))), 0, 1000);
            if ($text === '') fail('Write a reply'); if ($d['cfg']['token'] === '') fail('Connect Facebook first');
            $ix = -1; foreach ($d['comments'] as $i => $c) if ($c['id'] === $id) $ix = $i; if ($ix < 0) fail('Comment not found');
            $c = $d['comments'][$ix];
            $j = $c['net'] === 'ig' ? soc_graph($id . '/replies', ['message' => $text], $d['cfg']['token']) : soc_graph($id . '/comments', ['message' => $text], $d['cfg']['token']);
            if (isset($j['error'])) fail('Meta: ' . ($j['error']['error_user_msg'] ?? $j['error']['message'] ?? 'reply failed'));
            $d['comments'][$ix]['reply'] = $text; $d['comments'][$ix]['replyBy'] = $u['name']; $d['comments'][$ix]['replyAt'] = now(); $d['comments'][$ix]['read'] = true;
            soc_save($d); log_act($u, 'social.reply', mb_substr($text, 0, 40)); out(['ok' => true, 'comment' => $d['comments'][$ix]]);
        case 'soc_ai_reply':
            $u = need($OA); $d = soc_load(); $id = (string)($in['id'] ?? ''); $c = null; foreach ($d['comments'] as $x) if ($x['id'] === $id) $c = $x; if (!$c) fail('Comment not found');
            $sys = "You reply to social media comments for Woodex Interior, a design-and-build studio in Lahore. Voice: a friendly, experienced interior designer. Reply in the same language as the comment, 1-3 short sentences. Never quote prices or promises; for price or project questions invite them to WhatsApp +92 322 4000768 or send a message. Return only the reply text.";
            $r = trim((string)ai_call(cms_load()['ai'], $sys, "Post: " . $c['postTitle'] . "\nComment from " . $c['name'] . ": " . $c['text']));
            out(['ok' => true, 'text' => mb_substr($r, 0, 1000)]);
        case 'soc_ai_caption':
            $u = need($OA); $topic = mb_substr(trim(strip_tags((string)($in['topic'] ?? ''))), 0, 600); if ($topic === '') fail('Describe the post first (e.g. "DHA office fit-out, walnut and brass, 40 seats")');
            $nets = array_values(array_intersect(SOC_NETS, (array)($in['nets'] ?? ['fb', 'ig']))); $tone = (string)($in['tone'] ?? 'designer');
            $d = soc_load(); $co = function_exists('company_cfg') ? company_cfg() : ['phones' => '+92 322 4000768'];
            $sys = "You write social media captions for Woodex Interior, a design-and-build studio in Lahore (200+ completed spaces, in-house 3D studio). Voice: an experienced interior designer, warm and specific, never salesy. " .
                "Rules: no prices, rates, discounts or promises; no 'free', 'guarantee', 'warranty'; no invented facts or project names; plain English; 1–2 emojis at most. " .
                "Write 3 short options. Each: a strong first line, 2–3 sentences about the design thinking (materials, light, layout, how the space is used), then a soft call to action (WhatsApp " . $co['phones'] . " or 'link in bio' for Instagram). " .
                "End each option with 6–10 relevant hashtags including: " . $d['cfg']['tags'] . ". Return ONLY JSON: {\"options\":[\"...\",\"...\",\"...\"]}";
            $raw = ai_call(cms_load()['ai'], $sys, 'Platforms: ' . implode(' + ', array_map(fn($n) => ['fb' => 'Facebook', 'ig' => 'Instagram', 'li' => 'LinkedIn (professional tone, fewer hashtags)', 'gb' => 'Google Business Profile (no hashtags, under 1500 characters)'][$n], $nets)) . "\nTone: $tone\nPost about: $topic");
            $j = json_decode(preg_replace('~^[^{]*|[^}]*$~s', '', $raw), true); $opts = array_values(array_filter(array_map(fn($x) => mb_substr(trim((string)$x), 0, 2200), (array)($j['options'] ?? []))));
            if (!$opts) $opts = [trim($raw)];
            out(['ok' => true, 'options' => array_slice($opts, 0, 3)]);
    }
    return false;
}
