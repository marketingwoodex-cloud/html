<?php
function grab($file,$name){ $s=file_get_contents($file); $i=strpos($s,"function $name("); $d=0;$st=false; for($j=$i;$j<strlen($s);$j++){ if($s[$j]=='{'){$d++;$st=true;} if($s[$j]=='}'){$d--; if($st&&$d==0) return substr($s,$i,$j-$i+1);} } }
$P=0;$F=0; function ck($ok,$m){global $P,$F; if($ok)$P++; else {$F++; echo "FAIL: $m\n";}}
// ---- T3 webhook: run the real signature block
$w=file_get_contents('/api/whatsapp.php'); $a=strpos($w,'$raw = (string)file_get_contents'); $b=strpos($w,'$j = json_decode($raw');
$blk=substr($w,$a,$b-$a); $blk=str_replace("(string)file_get_contents('php://input')",'$GLOBALS["BODY"]',$blk); $blk=preg_replace('~exit\(([^)]*)\);~','throw new Exception("refused");',$blk);
function hook($secret,$body,$sig){ $GLOBALS['BODY']=$body; $cfg=['waSecret'=>$secret]; if($sig!==null) $_SERVER['HTTP_X_HUB_SIGNATURE_256']=$sig; else unset($_SERVER['HTTP_X_HUB_SIGNATURE_256']); try { eval($GLOBALS['blk']); return 'accepted'; } catch(Exception $e){ return 'refused'; } }
$body='{"entry":[{"changes":[{"value":{"messages":[{"from":"923001234567","text":{"body":"STOP"}}]}}]}]}';
ck(hook('',$body,null)==='refused','no secret + unsigned accepted (fail-open)');
ck(hook('',$body,'sha256=00')==='refused','no secret + fake sig accepted');
ck(hook('s3cret',$body,null)==='refused','missing signature accepted');
ck(hook('s3cret',$body,'sha256='.hash_hmac('sha256',$body,'wrong'))==='refused','wrong-key signature accepted');
ck(hook('s3cret',$body,'sha256='.hash_hmac('sha256',$body.' ','s3cret'))==='refused','tampered body accepted');
ck(hook('s3cret',$body,'SHA256='.hash_hmac('sha256',$body,'s3cret'))==='refused','case trick accepted');
ck(hook('s3cret',$body,'sha256='.hash_hmac('sha256',$body,'s3cret'))==='accepted','valid Meta signature refused');
echo "T3 webhook done\n";
// ---- T4 SSRF: real per-hop URL checks (DNS stubbed)
$bsrc=file_get_contents('/api/builder.php'); preg_match('~\$p = parse_url\(\$u\); \$host = strtolower\(\$p\[\'host\'\] \?\? \'\'\);\s*(if \(.*?\) fail\(\'Only public https image links are allowed\'\);)~s',$bsrc,$m); $chk=$m[1];
preg_match("~foreach \(\\\$ips as \\\$ip\) (if .*?fail\('Only public https image links are allowed'\);)~",$bsrc,$m2); $ipchk=$m2[1];
function urlok($u,$ips){ $p=parse_url($u); $host=strtolower($p['host']??''); try{ eval(str_replace("fail(","throw new Exception(",$GLOBALS['chk'])); foreach($ips as $ip) eval(str_replace("fail(","throw new Exception(",$GLOBALS['ipchk'])); return true; }catch(Exception $e){return false;} }
$bad=['http://example.com/a.jpg'=>['93.184.216.34'],'https://127.0.0.1/a.jpg'=>[],'https://[::1]/a.jpg'=>[],'https://localhost/a.jpg'=>[],'https://2130706433/a.jpg'=>['127.0.0.1'],'https://0x7f000001/a.jpg'=>['127.0.0.1'],'https://127.0.0.1.nip.io/a.jpg'=>['127.0.0.1'],'https://evil.com/a.jpg#internal'=>['10.0.0.5'],'https://metadata.internal/'=>['169.254.169.254'],'https://x.com:8080/a.jpg'=>['1.2.3.4'],'https://user:pw@x.com/a.jpg'=>['1.2.3.4'],'https://rebind.example/'=>['1.2.3.4','192.168.1.1'],'https://aws.example/'=>['169.254.169.254'],'file:///etc/passwd'=>[],'gopher://x/'=>[],'https://db.local/'=>['10.0.0.1']];
foreach($bad as $u=>$ips) ck(!urlok($u,$ips),"SSRF allowed: $u");
ck(urlok('https://images.unsplash.com/photo.jpg',['151.101.1.1']),'legit image URL refused');
ck(strpos($bsrc,"'follow_location' => 0")!==false && strpos($bsrc,"'follow_location' => 1")===false,'auto-redirect still on');
echo "T4 SSRF done\n";
// ---- T5 forms relay: real forms_reply_ok on SQLite
$pdo=new PDO('sqlite::memory:'); $pdo->exec('CREATE TABLE wx_throttle (ip TEXT PRIMARY KEY, n INT, t INT)');
function q($s,$a=[]){ global $pdo; $st=$pdo->prepare($s); $st->execute($a); return $st; }
eval(grab('/api/forms.php','forms_reply_ok'));
ck(forms_reply_ok('+92 300 1234567','v@x.com')===true,'first reply blocked');
ck(forms_reply_ok('+923001234567','')===false,'same phone (reformatted) got 2nd reply');
ck(forms_reply_ok('+92 311 0000000','V@X.COM')===false,'same email (case) got 2nd reply');
$sent=1; for($i=0;$i<200;$i++) if(forms_reply_ok('+92 3'.str_pad((string)$i,9,'0',STR_PAD_LEFT),"u$i@x.com")) $sent++;
ck($sent<=60,"daily cap broken: $sent sent"); echo "relay attack: 201 victims tried, $sent auto-replies sent (cap 60)\n";
$f=file_get_contents('/api/forms.php'); ck(strpos($f,"\$form !== 'whatsapp' && forms_reply_ok(")!==false,'whatsapp form still auto-replies');
echo "T3-5 pass=$P fail=$F\n";
