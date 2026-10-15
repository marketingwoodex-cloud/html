import { loadNodeRuntime } from '@php-wasm/node'; import { PHP } from '@php-wasm/universal'; import fs from 'fs';
const php = new PHP(await loadNodeRuntime(process.env.V||'8.3',{emscriptenOptions:{processId:1}}));
php.mkdir('/www/_database'); php.mkdir('/www/_private');
php.writeFile('/www/wx-install.php', fs.readFileSync('/home/user/-marketingwoodex/frontend-v1/wx-install.php'));
php.writeFile('/www/_database/woodex-v20.sql', fs.readFileSync('/home/user/-marketingwoodex/frontend-v1/_database/woodex-v20.sql'));
for (const r of [{method:'GET'},{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'host=localhost&name=u1&user=u1&pass=x'}]) {
  let res; try { res = await php.run({scriptPath:'/www/wx-install.php', ...r}); } catch(e){ res=e.response; }
  const t = res.text; console.log(process.env.V, r.method, res.httpStatusCode, /Install<\/button>/.test(t)?'form-ok':'', (t.match(/class="err">([^<]*)/)||[])[1]||'', res.errors||'');
}
process.exit(0);
