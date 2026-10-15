import { loadNodeRuntime } from '@php-wasm/node'; import { PHP } from '@php-wasm/universal'; import fs from 'fs';
const php = new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:1}}));
const D='/home/user/-marketingwoodex/frontend-v1/'; const files=[];
(function w(d){ for(const f of fs.readdirSync(D+d)){ const r=d+f; if(fs.statSync(D+r).isDirectory()){ if(!/^(node_modules)$/.test(f)) w(r+'/'); } else if(f.endsWith('.php')) files.push(r);} })('');
php.mkdir('/c'); let bad=0;
for (const f of files) { php.writeFile('/c/x.php', fs.readFileSync(D+f));
  let r; try { r = await php.run({ code: '<?php try { eval("return; ?>" . str_replace("declare(strict_types=1);", "", file_get_contents("/c/x.php"))); echo "OK"; } catch (Throwable $e) { echo "ERR ", get_class($e), ": ", $e->getMessage(), " line ", $e->getLine(); }' }); } catch(e){ r=e.response; }
  const t=(r.text+r.errors).trim(); if(!t.startsWith('OK')||r.errors){ bad++; console.log(f, '=>', t.slice(0,300)); } }
console.log(files.length, 'PHP files compiled,', bad, 'problems'); process.exit(0);
