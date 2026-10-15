<?php
/**
 * Client view of a quotation (Phase 9): /api/quote-view.php?id=<id>&t=<token>
 * No sign-in. The token is an HMAC of id + number (q_view_token), so links can't be guessed.
 * Shows the quotation in its chosen design with "Download PDF" and "Print". First view is noted in the quote history.
 */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

function qv_die(string $m): void { http_response_code(404); echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quotation</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#0a0f1e;text-align:center"><div><h1 style="font-size:22px">' . htmlspecialchars($m) . '</h1><p><a href="/contact/">Contact Woodex Interior</a></p></div>'; exit; }

$id = (int)($_GET['id'] ?? 0); $t = (string)($_GET['t'] ?? '');
if ($id <= 0 || !preg_match('~^[a-f0-9]{32}$~', $t)) qv_die('This quotation link is not valid.');
try { $r = q('SELECT id,data FROM wx_quotes WHERE id=?', [$id])->fetch(); } catch (Throwable $e) { $r = null; }
if (!$r) qv_die('This quotation link is not valid.');
$x = ['id' => (int)$r['id']] + json_decode($r['data'], true);
if (!hash_equals(q_view_token($x), $t)) qv_die('This quotation link is not valid.');
if (($x['status'] ?? '') === 'superseded') qv_die('This quotation has been replaced by a newer version. Please ask us for the latest link.');

// note the view (at most once every 12 hours)
$last = (string)($x['viewed_at'] ?? '');
if ($last === '' || strtotime($last) < time() - 43200) {
    $x['viewed_at'] = now(); $x['views'] = (int)($x['views'] ?? 0) + 1; $x['history'][] = ['t' => now(), 'user' => 'Client', 'text' => 'Viewed online'];
    try { quote_put($x); } catch (Throwable $e) { error_log('quote view: ' . $e->getMessage()); }
}
$c = company_cfg(); $q = q_pub($x); unset($q['history'], $q['notes'], $q['created_by'], $q['lead_id'], $q['client_id'], $q['last_sent']);
$wa = preg_replace('~\D~', '', explode('·', (string)$c['phones'])[0]); if (strpos($wa, '0') === 0) $wa = '92' . substr($wa, 1);
$J = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE;
$title = 'Quotation ' . q_label($x) . ' · ' . $c['name'];
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title><?= htmlspecialchars($title) ?></title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#e9ebf0;color:#0a0f1e}
.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;background:#0c1628;color:#fff}
.bar img{height:28px;filter:brightness(0) invert(1)}.bar b{font-size:15px}.bar small{opacity:.75;display:block;font-size:12px}.bar .sp{flex:1}
.bar a,.bar button{font:600 14px/1 inherit;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.pri{background:#b8956a;color:#0c1628}.sec{background:rgba(255,255,255,.12);color:#fff}.wa{background:#25d366;color:#fff}
iframe{display:block;width:100%;border:0;height:calc(100vh - 56px)}
@media(max-width:640px){.bar .t{flex-basis:100%}.bar a,.bar button{padding:9px 12px;font-size:13px}}
</style></head><body>
<div class="bar"><img src="/assets/img/img-f941b08b9510.png" alt="Woodex"><div class="t"><b>Quotation <?= htmlspecialchars(q_label($x)) ?></b><small>For <?= htmlspecialchars((string)$x['client']['name']) ?> · Rs <?= number_format((float)$x['total']) ?></small></div><span class="sp"></span>
<button class="pri" id="dl">Download PDF</button><button class="sec" id="pr">Print</button>
<?php if ($wa): ?><a class="wa" target="_blank" rel="noopener" href="https://wa.me/<?= $wa ?>?text=<?= rawurlencode('Hi Woodex, about quotation ' . q_label($x) . ':') ?>">WhatsApp us</a><?php endif; ?></div>
<iframe id="f" title="Quotation"></iframe>
<script src="/admin/admin-print.js"></script>
<script src="/admin/admin-print17.js"></script>
<script>
(function () {
  var q = <?= json_encode($q, $J) ?>, c = <?= json_encode($c, $J) ?>, f = document.getElementById("f");
  f.srcdoc = WXPrint.quote(q, c);
  document.getElementById("pr").onclick = function () { f.contentWindow.focus(); f.contentWindow.print(); };
  var b = document.getElementById("dl");
  b.onclick = function () { b.disabled = true; b.textContent = "Preparing…"; WXPrint.quotePdf(q, c).then(function (r) { WXPrint.download(r.blob, r.name); b.textContent = "Download PDF"; b.disabled = false; }, function () { b.textContent = "Download PDF"; b.disabled = false; f.contentWindow.print(); }); };
})();
</script>
</body></html>
