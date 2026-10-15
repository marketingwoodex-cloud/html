<?php
/** P16 3.8b — 404 monitor beacon (public). The 404 page posts {p, r}; the admin sees the top missed URLs. */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'POST' && is_dir(PRIVATE_DIR)) {
    $in = json_decode((string)file_get_contents('php://input', false, null, 0, 2000), true) ?: [];
    rd_404_log((string)($in['p'] ?? ''), (string)($in['r'] ?? ''));
}
http_response_code(204);
