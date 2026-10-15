<?php
/**
 * P18 G — cron worker for WhatsApp automation (campaign queue + auto flows).
 * Hostinger → Advanced → Cron jobs → every 5 minutes:
 *   wget -q -O /dev/null "https://woodex.com.pk/api/wa-cron.php?key=YOUR_KEY"
 * The key is shown in Admin → WhatsApp automation → Settings.
 */
declare(strict_types=1);
define('WX_LIB_ONLY', true);
require __DIR__ . '/admin.php';
header('Content-Type: application/json');
if (!is_file(DB_FILE)) { http_response_code(503); exit('{"ok":false}'); }
$d = wag_load();
if (!hash_equals((string)$d['cfg']['cronKey'], (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('{"ok":false,"error":"bad key"}'); }
try { $soc = function_exists('soc_tick') ? soc_tick() : []; try { if (function_exists('conn_tick')) $soc += ['backups' => conn_tick()]; } catch (Throwable $e) { error_log('conn: ' . $e->getMessage()); } try { if (function_exists('sag_tick')) $soc += sag_tick(); } catch (Throwable $e) { error_log('sag: ' . $e->getMessage()); } echo json_encode(['ok' => true] + wag_tick() + $soc); } catch (Throwable $e) { http_response_code(500); echo json_encode(['ok' => false, 'error' => $e->getMessage()]); }
