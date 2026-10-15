# P18 A1: rent + advance + block order for quotes/invoices (PHP + Node mirror). Idempotent.
import re,sys
R="/home/user/-marketingwoodex/"
def sub(path,old,new,tag):
    s=open(R+path).read()
    if tag in s: return
    assert old in s,(path,old[:60]); s=s.replace(old,new,1); open(R+path,"w").write(s)
P="frontend-v1/api/sales-lib.php"; M="tools/frontend-v1-admin.mjs"
sub(P,"$d['tax'] = (int)round(($d['subtotal'] - $d['discount']) * $d['taxPct'] / 100); $d['total'] = $d['subtotal'] - $d['discount'] + $d['tax'];",
 "$d['rent'] = max(0, (int)round(numv($d['rent'] ?? 0))); /*P18rent*/\n    $d['tax'] = (int)round(($d['subtotal'] - $d['discount'] + $d['rent']) * $d['taxPct'] / 100); $d['total'] = $d['subtotal'] - $d['discount'] + $d['rent'] + $d['tax'];\n    $d['advance'] = min(max(0, (int)round(numv($d['advance'] ?? 0))), $d['total']);","P18rent")
sub(P,"function q_label(array $x)","function p18_blocks($b): array { $ok = ['summary', 'scope', 'items', 'totals', 'terms', 'bank', 'sign']; $o = []; foreach ((is_array($b) ? $b : []) as $k) { $k = (string)$k; $n = ltrim($k, '-'); if (in_array($n, $ok, true) && !in_array($n, array_map(fn($x) => ltrim($x, '-'), $o), true)) $o[] = $k; } return $o; }\nfunction q_label(array $x)","p18_blocks")
sub(P,"'sign_title' => clip($in['sign_title'] ?? '', 80), 'updated_at' => now()]);","'sign_title' => clip($in['sign_title'] ?? '', 80), 'rent' => numv($in['rent'] ?? 0), 'advance' => numv($in['advance'] ?? 0), 'blocks' => p18_blocks($in['blocks'] ?? []), 'updated_at' => now()]);","'rent' => numv($in['rent']")
sub(P,"foreach (['notes', 'schedule', 'terms'] as $k) if (array_key_exists($k, $in)) $i[$k] = clip($in[$k], 3000);","foreach (['notes', 'schedule', 'terms'] as $k) if (array_key_exists($k, $in)) $i[$k] = clip($in[$k], 3000);\n            if (array_key_exists('blocks', $in)) $i['blocks'] = p18_blocks($in['blocks']); /*P18inv*/","P18inv")
sub(M,"doc.tax = Math.round((doc.subtotal - doc.discount) * doc.taxPct / 100); doc.total = doc.subtotal - doc.discount + doc.tax; return doc;",
 "doc.rent = Math.max(0, Math.round(num(doc.rent))); /*P18rent*/ doc.tax = Math.round((doc.subtotal - doc.discount + doc.rent) * doc.taxPct / 100); doc.total = doc.subtotal - doc.discount + doc.rent + doc.tax; doc.advance = Math.min(Math.max(0, Math.round(num(doc.advance))), doc.total); return doc;","P18rent")
sub(M,"  const ensureA5 = (db) =>","  const p18Blocks = (b) => { const ok = [\"summary\", \"scope\", \"items\", \"totals\", \"terms\", \"bank\", \"sign\"], o = []; (Array.isArray(b) ? b : []).forEach((k) => { k = String(k); const n = k.replace(/^-+/, \"\"); if (ok.includes(n) && !o.some((x) => x.replace(/^-+/, \"\") === n)) o.push(k); }); return o; };\n  const ensureA5 = (db) =>","p18Blocks = ")
sub(M,"sign_title: clip(inp.sign_title, 80), updated_at: now() });","sign_title: clip(inp.sign_title, 80), rent: num(inp.rent), advance: num(inp.advance), blocks: p18Blocks(inp.blocks), updated_at: now() });","rent: num(inp.rent)")
sub(M,"[\"notes\", \"schedule\", \"terms\"].forEach((k) => { if (k in inp) i[k] = clip(inp[k], 3000); });","[\"notes\", \"schedule\", \"terms\"].forEach((k) => { if (k in inp) i[k] = clip(inp[k], 3000); }); if (\"blocks\" in inp) i.blocks = p18Blocks(inp.blocks); /*P18inv*/","P18inv")
print("ok")
