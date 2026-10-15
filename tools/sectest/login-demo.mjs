import { loadNodeRuntime } from '@php-wasm/node'; import { PHP } from '@php-wasm/universal'; import fs from 'fs'; import path from 'path';
const S='/home/user/-marketingwoodex/frontend-v1';
const V=process.env.V||'8.3';
const php = new PHP(await loadNodeRuntime(V,{emscriptenOptions:{processId:1}}));
function cp(d,t){ php.mkdir(t); for(const f of fs.readdirSync(d)){ const a=path.join(d,f); if(fs.statSync(a).isDirectory()){ if(t==='/www' && !['api','_private','admin'].includes(f)) continue; cp(a,t+'/'+f);} else php.writeFile(t+'/'+f,fs.readFileSync(a)); } }
cp(S,'/www');
let a=php.readFileAsText('/www/api/admin.php');
a=a.replace(/function connect\(array \$c\): PDO \{[\s\S]*?\n\}/, `function connect(array $c): PDO { $p = new PDO('sqlite:/tmp/t.db', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); return $p; }`);
php.writeFile('/www/api/admin.php', a);
php.writeFile('/www/_private/db.json', JSON.stringify({host:'localhost',name:'u128159657_woodex',user:'u128159657_woodex',pass:'x'}));
// db with users like the live one
await php.run({ code: `<?php $p=new PDO('sqlite:/tmp/t.db'); $p->exec("CREATE TABLE wx_users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT, pass_hash TEXT, active INT, pw_ver INT, created_at TEXT, last_login TEXT)");
$p->exec("CREATE TABLE wx_activity (id INTEGER PRIMARY KEY, user_id INT, user_name TEXT, action TEXT, target TEXT, ip TEXT, created_at TEXT)");
$p->exec("CREATE TABLE wx_throttle (ip TEXT PRIMARY KEY, n INT, t INT)"); $p->exec("CREATE TABLE wx_settings (k TEXT PRIMARY KEY, v TEXT)");
$h=password_hash('Test@12345', PASSWORD_DEFAULT); $p->prepare("INSERT INTO wx_users VALUES (1,'Woodex Owner','owner@woodex.local','owner',?,1,4,'2026-09-30','2026-10-05')")->execute([$h]); $p->prepare("INSERT INTO wx_users VALUES (7,'Demo Sales','sales@demo.woodex.pk','sales',?,1,1,'2026-10-06',NULL)")->execute([$h]); echo "seeded";` });
php.writeFile('/www/_private/demo.json', JSON.stringify({until: Math.floor(Date.now()/1000) + (process.env.EXP ? -10 : 3600)}));
async function call(body, hdr={}) { let r; try { r = await php.run({ scriptPath:'/www/api/admin.php', method:'POST', headers:Object.assign({'content-type':'application/json'},hdr), body:new TextEncoder().encode(JSON.stringify(body)), $_SERVER:{REMOTE_ADDR:'1.2.3.4', HTTP_HOST:'woodex.com.pk', HTTPS:'on'} }); } catch(e){ r=e.response; } return r; }
for (const b of [{action:'login',email:'owner@woodex.local',password:'Test@12345'},{action:'login',email:'sales@demo.woodex.pk',password:'Test@12345'}]) {
  const r=await call(b); console.log(`PHP ${V} ${b.email}${b.password?'('+b.password+')':''} -> ${r.httpStatusCode}: ${r.text.slice(0,180)} | ${r.errors.replace(/\n/g,' ').slice(0,400)}`);
  if (b.password==='Test@12345') { try { const j=JSON.parse(r.text); if (j.token) { const m=await call({action:'me'},{'X-WX-ADM':j.token}); console.log(`PHP ${V} me -> ${m.httpStatusCode}: ${m.text.slice(0,140)} | ${m.errors.slice(0,300)}`); const d=await call({action:'dash_data'},{'X-WX-ADM':j.token}); console.log(`PHP ${V} dash_data -> ${d.httpStatusCode}: ${d.text.slice(0,120)} | ${d.errors.replace(/\n/g,' ').slice(0,300)}`);} } catch(e){} }
}
process.exit(0);
