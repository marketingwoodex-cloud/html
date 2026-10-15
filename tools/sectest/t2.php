<?php
function grab($file,$name){ $s=file_get_contents($file); $i=strpos($s,"function $name("); $d=0;$st=false; for($j=$i;$j<strlen($s);$j++){ if($s[$j]=='{'){$d++;$st=true;} if($s[$j]=='}'){$d--; if($st&&$d==0) return substr($s,$i,$j-$i+1);} } }
define('ROOT_DIR','/site'); function fail($m){ throw new Exception($m); } $DB=null; function a7_db_restore($d){ global $DB; $DB=$d; return 0; }
eval(grab('/api/media-lib.php','a7_restore_blocked')); eval(grab('/api/media-lib.php','a7_restore'));
@mkdir('/site/_private',0777,true); file_put_contents('/site/_private/config.json','{"secret":"REAL"}'); file_put_contents('/site/.htaccess','REAL');
$z=new ZipArchive(); $z->open('/tmp/evil.zip',ZipArchive::CREATE);
$evil=['_private/config.json'=>'{"secret":"HACKED"}','_private/security.json'=>'x','.htaccess'=>'AddHandler application/x-httpd-php .jpg','assets/uploads/.htaccess'=>'x','assets/img/shell.php'=>'<?php system($_GET[c]);','assets/img/a.phtml'=>'x','../escape.html'=>'x','api/admin.php'=>'x','_private/backups/x'=>'x','assets/.user.ini'=>'auto_prepend_file=x'];
foreach($evil as $k=>$v) $z->addFromString($k,$v);
$z->addFromString('about/index.html','<h1>ok</h1>'); $z->addFromString('_private/crm.json','{}');
$z->addFromString('db-dump.json',json_encode(['wx_users'=>[['id'=>1,'role'=>'owner','email'=>'attacker@x']],'wx_leads'=>[]])); $z->close();
a7_restore('/tmp/evil.zip');
$bad=0; foreach(['/site/_private/security.json','/site/assets/uploads/.htaccess','/site/assets/img/shell.php','/site/assets/img/a.phtml','/escape.html','/site/api/admin.php','/site/_private/backups/x','/site/assets/.user.ini'] as $f) if(file_exists($f)){echo "WRITTEN: $f\n";$bad++;}
if(file_get_contents('/site/_private/config.json')!=='{"secret":"REAL"}'){echo "config.json OVERWRITTEN\n";$bad++;}
if(file_get_contents('/site/.htaccess')!=='REAL'){echo ".htaccess OVERWRITTEN\n";$bad++;}
echo file_exists('/site/about/index.html')&&file_exists('/site/_private/crm.json')?"legit files restored OK\n":"legit restore BROKEN\n";
// users table protection lives in a7_db_restore: check the constant
$src=file_get_contents('/api/media-lib.php'); echo preg_match("~A7_DB_KEEP = \['wx_throttle', 'wx_users'\]~",$src)&&strpos($src,'in_array($table, A7_DB_KEEP, true)')?"wx_users skipped on DB restore: OK\n":"wx_users NOT protected\n";
// owner-only gates
foreach(["case 'backup_run': \$u = need(['owner'])","case 'backup_restore':\n            \$u = need(['owner'])","case 'backup_delete':\n            \$u = need(['owner'])","\$u['role'] !== 'owner') fail('Only the owner can download, upload","\$u['role'] !== 'owner') { http_response_code(403)"] as $g) if(strpos($src,$g)===false){echo "GATE MISSING: $g\n";$bad++;}
echo "attack files blocked: ".(count($evil)+2-$bad)."/".(count($evil)+2)." | issues=$bad\n";
