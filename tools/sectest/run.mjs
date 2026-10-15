import { loadNodeRuntime } from '@php-wasm/node'; import { PHP } from '@php-wasm/universal'; import fs from 'fs'; import path from 'path';
const php = new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:1}})); php.setSapiName?.('cli');
const SRC='/home/user/-marketingwoodex/frontend-v1';
function cp(d,t){ php.mkdir(t); for(const f of fs.readdirSync(d)){ const a=path.join(d,f); if(fs.statSync(a).isDirectory()){ if(['api','_private'].includes(f)||t!=='/www') cp(a,t+'/'+f);} else if(t!=='/www'||f.endsWith('.php')) php.writeFile(t+'/'+f,fs.readFileSync(a)); } }
cp(SRC,'/www');
php.writeFile('/www/_private/db.json', JSON.stringify({host:'127.0.0.1',name:'x',user:'x',pass:'x'}));
for (const [sp,body] of [['admin.php',{action:'status'}],['builder.php',{action:'status'}],['forms.php',{name:'x'}],['chat.php',{action:'poll'}],['quote-view.php',{}],['r404.php',{p:'/x'}],['whatsapp.php',{}],['mcp.php',{}],['wa-cron.php',{}]]) {
  let r; try { r = await php.run({ scriptPath:'/www/api/'+sp, relativeUri:'/api/'+sp, method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) }); } catch(e){ r=e.response; }
  console.log(sp, r.httpStatusCode, r.text.slice(0,300), r.errors.slice(0,600));
}
process.exit(0);
