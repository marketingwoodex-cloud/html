import { loadNodeRuntime } from '@php-wasm/node'; import { PHP } from '@php-wasm/universal'; import fs from 'fs'; import path from 'path';
const S='/home/user/-marketingwoodex/frontend-v1';
for (const ver of ['8.3','7.4']) {
  const php = new PHP(await loadNodeRuntime(ver,{emscriptenOptions:{processId:1}}));
  php.mkdir('/www/api'); php.mkdir('/www/_private');
  for (const f of fs.readdirSync(S+'/api')) if (f.endsWith('.php')) php.writeFile('/www/api/'+f, fs.readFileSync(S+'/api/'+f));
  php.writeFile('/www/wx-check.php', fs.readFileSync(S+'/wx-check.php')); php.writeFile('/www/_private/.htaccess','x');
  php.writeFile('/www/_private/db.json', JSON.stringify({host:'127.0.0.1',name:'u1_woodex',user:'u1_woodex',pass:'secret'}));
  for (const sp of ['wx-check.php','api/admin.php']) { let r; try { r = await php.run({ scriptPath:'/www/'+sp, method:'POST', headers:{'content-type':'application/json'}, body: new TextEncoder().encode('{"action":"status"}') }); } catch(e){ r=e.response; }
    const t=r.text.replace(/<style[\s\S]*?<\/style>/,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    console.log(`PHP ${ver} ${sp} -> ${r.httpStatusCode}: ${t.slice(0, sp==='wx-check.php'?900:200)} ${r.errors.slice(0,200)}`); }
}
process.exit(0);
