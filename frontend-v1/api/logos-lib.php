<?php
/* P20: client logos shown on the home page ("Our clients"). Public data: /assets/data/clients.json
   Actions: logos_get, logos_save (owner, admin, editor). Logos are uploaded with media_upload. */
const LOGOS_FILE = ROOT_DIR . '/assets/data/clients.json';
function logos_clean(array $in): array {
    $mode = in_array($in['mode'] ?? '', ['grid', 'slider'], true) ? $in['mode'] : 'grid';
    $items = [];
    foreach (array_slice((array)($in['items'] ?? []), 0, 40) as $it) {
        $logo = (string)($it['logo'] ?? ''); $url = trim((string)($it['url'] ?? ''));
        if (!preg_match('~^/assets/(uploads|img)/[\w./-]+\.(webp|png|jpe?g|gif|svg)$~i', $logo) || strpos($logo, '..') !== false) continue;
        if ($url !== '' && !preg_match('~^https?://~i', $url)) $url = '';
        $items[] = ['name' => mb_substr(trim(strip_tags((string)($it['name'] ?? ''))), 0, 80), 'logo' => $logo, 'url' => mb_substr($url, 0, 300)];
    }
    return ['title' => mb_substr(trim(strip_tags((string)($in['title'] ?? 'Our clients'))), 0, 80) ?: 'Our clients',
        'kicker' => mb_substr(trim(strip_tags((string)($in['kicker'] ?? 'Trusted by'))), 0, 60),
        'mode' => $mode, 'speed' => max(10, min(90, (int)($in['speed'] ?? 30))), 'grey' => !empty($in['grey']), 'show' => !array_key_exists('show', $in) || !empty($in['show']), 'items' => $items];
}
function logos_actions(string $action, array $in): bool {
    if (!in_array($action, ['logos_get', 'logos_save'], true)) return false;
    $u = need(['owner', 'admin', 'editor']);
    if ($action === 'logos_get') out(['ok' => true, 'data' => logos_clean(jread(LOGOS_FILE))]);
    $d = logos_clean((array)($in['data'] ?? []));
    if (!is_dir(dirname(LOGOS_FILE))) mkdir(dirname(LOGOS_FILE), 0755, true);
    jwrite(LOGOS_FILE, $d); log_act($u, 'logos.save', count($d['items']) . ' logos, ' . $d['mode']);
    out(['ok' => true, 'data' => $d]);
}
