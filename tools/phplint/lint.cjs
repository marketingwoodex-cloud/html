const P=require('php-parser'),fs=require('fs');const p=new P({parser:{php8:true,suppressErrors:false}});let bad=0;
for(const f of process.argv.slice(2)){try{p.parseCode(fs.readFileSync(f,'utf8'));console.log('OK',f)}catch(e){bad=1;console.log('ERR',f,e.message)}}process.exit(bad)
