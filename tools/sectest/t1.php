<?php
$R='/api/';
function grab($file,$name){ $s=file_get_contents($file); $i=strpos($s,"function $name("); $d=0;$st=false; for($j=$i;$j<strlen($s);$j++){ if($s[$j]=='{'){$d++;$st=true;} if($s[$j]=='}'){$d--; if($st&&$d==0) return substr($s,$i,$j-$i+1);} } }
eval(grab($R.'media-lib.php','a7_restore_blocked'));
eval(grab($R.'builder.php','code_tokens'));
$pass=0;$fail=0; function ck($ok,$m){global $pass,$fail; if($ok)$pass++; else {$fail++; echo "FAIL: $m\n";}}
// --- zip slip / secret overwrite payloads: all must be BLOCKED
foreach (['_private/config.json','_private/security.json','_private/db.json','_private/mcp.json','_private/google-sa.json','.htaccess','assets/.htaccess','_private/.htaccess','assets/uploads/.user.ini','../index.html','a/../../x.html','/etc/passwd','api/admin.php','admin/admin.js','builder/index.html','assets/x.php','assets/x.PHP','assets/x.phtml','assets/x.php7','assets/x.phar','x.pht','assets/a.htaccess','php.ini','./_private/config.json','_private//config.json','_private/backups/x.zip',"assets\\..\\..\\x","x.html\0.php",'tools/a.mjs','deploy/x.zip','',"_private/./config.json"] as $p) ck(a7_restore_blocked($p), "restore allowed: ".json_encode($p));
// legit content must be ALLOWED
foreach (['index.html','about/index.html','assets/v1.css','assets/js/site.js','assets/img/a.webp','sitemap.xml','robots.txt','_private/crm.json','_private/content.json','_private/forms.json'] as $p) ck(!a7_restore_blocked($p), "legit blocked: $p");
// --- XSS payloads: each must produce at least one NEW token vs a clean base
$base='<html><body><main><h1>Hi</h1><img src="/a.webp" alt=""></main><script src="/assets/site.js"></script></body></html>';
$bt=code_tokens($base);
$x=['<script>alert(1)</script>','<SCRIPT>alert(1)</SCRIPT>','<script src=//evil.com/x.js></script>','<script/x>alert(1)</script>','<script>alert(1)','<img src=x onerror=alert(1)>','<img src=x OnErRoR="alert(1)">','<svg onload=alert(1)>','<svg/onload=alert(1)>','<body onpageshow=alert(1)>','<a href="javascript:alert(1)">x</a>','<a href=" javascript:alert(1)">x</a>','<a href="JaVaScRiPt:alert(1)">x</a>','<iframe src="//evil.com"></iframe>','<iframe srcdoc="<script>alert(1)</script>"></iframe>','<object data="//evil.com/x.swf"></object>','<embed src="//evil.com">','<base href="//evil.com/">','<meta http-equiv="refresh" content="0;url=//evil.com">','<form action="javascript:alert(1)"><button>x</button></form>','<button formaction="javascript:alert(1)">x</button>','<a href="data:text/html,<script>alert(1)</script>">x</a>','<details open ontoggle=alert(1)>','<div style="x" onmouseover=alert(1)>','<input autofocus onfocus=alert(1)>','<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>','<math><a href="javascript:alert(1)">x</a></math>','<video><source onerror=alert(1)></video>','<a href="&#106;avascript:alert(1)">x</a>','<a href="java&#x09;script:alert(1)">x</a>','<svg><script>alert(1)</script></svg>','<img/src=x/onerror=alert(1)>','<frameset onload=alert(1)>',"<img src=x onerror\n=alert(1)>","<a href='java\tscript:alert(1)'>x</a>",'<a href="javascript&colon;alert(1)">x</a>','<a href="&#x6A;&#x61;vascript:alert(1)">x</a>','<img src=x"onerror=alert(1)>','<iframe src=x>','<a href=javascript:alert(1)>x</a>','<object data="data:text/html;base64,PHNjcmlwdD4=">','<img src="data:image/svg+xml,<svg onload=alert(1)>">','<a href="&#0000106avascript:alert(1)">x</a>','<script >alert(1)</script >'];
foreach($x as $p){ $h=str_replace('<h1>Hi</h1>','<h1>Hi</h1>'.$p,$base); ck((bool)array_diff(code_tokens($h),$bt), "XSS NOT caught: $p"); }
// JSON-LD allowed
ck(!array_diff(code_tokens(str_replace('</main>','<script type="application/ld+json">{"@type":"Org"}</script></main>',$base)),$bt),"json-ld blocked");
// false positives: plain text edits on every real page
$pg=json_decode(file_get_contents("/pages.json"),true); foreach($pg as $h){ $t0=code_tokens($h); $h2=preg_replace("~</main>~","<p>New text: call online = fast, onboarding=1, see javascript: guide.</p></main>",$h,1); ck(!array_diff(code_tokens($h2),$t0),"false positive on text edit"); }
echo count($pg)," pages checked\n";
echo "pass=$pass fail=$fail\n";
