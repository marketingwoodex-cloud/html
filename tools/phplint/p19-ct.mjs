import puppeteer from "puppeteer-core";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1440,height:950}); const errs=[]; a.on("pageerror",e=>errs.push(e.message));
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m); const w=t=>new Promise(r=>setTimeout(r,t));
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await w(1200);
// FAQ
await a.evaluate(()=>location.hash="#/faqs"); await w(1500);
await a.evaluate(()=>document.querySelector("#fg-new").click()); await w(1500);
await a.type("#fg-n","P19 test group"); await a.type("#fg-rows [data-k=q]","Do you visit the site?"); await a.type("#fg-rows [data-k=a]","Yes, free in Lahore.");
await a.type("#fg-h","Kitchen questions");
const pg=await a.evaluate(()=>{const c=document.querySelector('#fg-pg input[value="about/index.html"]')||document.querySelector("#fg-pg input");c.checked=true;return c.value;});
await a.screenshot({path:OUT+"p19ct-faq.png"});
await a.evaluate(()=>document.querySelector("#fg-go").click()); await w(3500);
let h=await (await fetch(B+"/"+pg.replace(/index\.html$/,""))).text();
const g0=await a.evaluate(async()=>(await WXA.api("cms_list",{type:"faq"})).items.find(x=>x.title==="P19 test group"));
ok(h.includes("wx:faq-"+g0.id)&&/Kitchen questions/.test(h)&&/"FAQPage"/.test(h)&&/Do you visit the site\?/.test(h),"FAQ placed on /"+pg+" with schema");
// unplace
const g=await a.evaluate(async()=>{const r=await WXA.api("cms_list",{type:"faq"});return r.items.find(x=>x.title==="P19 test group");});
await a.evaluate(id=>{location.hash="#/faqs";},0); await w(1200);
await a.evaluate(t=>{const c=[...document.querySelectorAll("#fg-l .card")].find(e=>e.textContent.includes(t));c.querySelector("[data-ed]").click();},"P19 test group"); await w(2000);
const opened=await a.$("#fg-pg"); if(opened){ await w(1000); await a.evaluate(()=>document.querySelectorAll("#fg-pg input").forEach(c=>c.checked=false)); await a.evaluate(()=>document.querySelector("#fg-go").click()); await w(3000);
 h=await (await fetch(B+"/"+pg.replace(/index\.html$/,""))).text(); ok(!h.includes("wx:faq-"+g0.id),"FAQ removed when unticked"); } else ok(false,"reopen group");
await a.evaluate(id=>WXA.api("cms_delete",{id}),g.id);
// Team
await a.evaluate(()=>location.hash="#/team"); await w(1500);
ok(await a.$(".p19-how")!==null,"team guide shown");
await a.evaluate(()=>document.querySelector("#sx-new").click()); await w(1200);
ok(await a.$("#sx-dp")&&await a.$("#sx-li")&&await a.$("#sx-ft"),"team form has dept / LinkedIn / featured");
await a.screenshot({path:OUT+"p19ct-team.png"});
const tb=await a.evaluate(()=>WXA.VIEWS&&1);
await a.evaluate(()=>location.hash="#/testimonials"); await w(1500);
ok(/How testimonials reach your website/.test(await a.evaluate(()=>document.body.innerText)),"testimonials guide");
await a.screenshot({path:OUT+"p19ct-tst.png"});
ok(errs.length===0,"no JS errors "+errs.join("|"));
await b.close();
