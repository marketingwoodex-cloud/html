import { loadNodeRuntime } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';
import fs from 'fs';
const php = new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:1}}));
const A='/home/user/-marketingwoodex/frontend-v1/api/';
php.mkdir('/api'); php.writeFile('/pages.json', fs.readFileSync('pages.json')); for (const f of fs.readdirSync(A)) if (f.endsWith('.php')) php.writeFile('/api/'+f, fs.readFileSync(A+f));
try { const r = await php.run({ code: fs.readFileSync(process.argv[2],'utf8') }); process.stdout.write(r.text + (r.errors||'')); }
catch(e){ console.log(e.response ? e.response.text + e.response.errors : e.message); }
process.exit(0);
