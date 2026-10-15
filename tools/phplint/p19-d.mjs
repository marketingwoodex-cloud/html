import puppeteer from "puppeteer-core";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1440,height:900}); const errs=[]; a.on("pageerror",e=>errs.push(e.message));
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m); const w=t=>new Promise(r=>setTimeout(r,t));
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await w(1500);
const navTxt=await a.$eval("#nav",e=>e.innerText); ok(!/Backups|File manager|WhatsApp automation/.test(navTxt),"sidebar: sub-screens hidden"); ok(/Settings/.test(navTxt)&&/WhatsApp/.test(navTxt),"sidebar: Settings + WhatsApp shown");
for (const v of ["settings","business","users","security","backups","maintenance","files","database","activity","system","offers","wauto"]) {
  await a.evaluate(v=>{location.hash="#/"+v;},v); await w(1300);
  const r=await a.evaluate(()=>{const b=document.querySelector("#view .hub-bar");return b?{n:b.querySelectorAll("a").length,on:(b.querySelector(".on")||{}).textContent,h1:(document.querySelector("#view h1")||{}).textContent}:null;});
  ok(r&&r.on, v+" → tab '"+(r&&r.on)+"' ("+(r&&r.n)+" tabs) h1="+(r&&r.h1));
  if(v==="backups"||v==="offers") await a.screenshot({path:OUT+"p19d-"+v+".png"});
}
ok(errs.length===0,"no JS errors "+errs.join("|"));
await b.close();
