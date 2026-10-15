import puppeteer from "puppeteer-core";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1500,height:950}); const errs=[]; a.on("pageerror",e=>errs.push(e.message)); a.on("console",m=>{if(m.type()==="error")console.log("CONSOLE",m.text().slice(0,200));});
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m);
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await new Promise(r=>setTimeout(r,1500));
const tok=await a.evaluate(()=>WXA.S.token);
const api=(ac,d)=>a.evaluate(async(ac,d,t)=>(await fetch("/api/admin.php?action="+ac,{method:"POST",headers:{"Content-Type":"application/json","X-WX-ADM":t},body:JSON.stringify({action:ac,...d})})).json(),ac,d,tok);
// B4 lead activity without note but with follow-up
const L=await api("lead_save",{name:"P19 Test",phone:"03001112233",source:"manual"}); const lid=L.lead?L.lead.id:L.id;
let r=await api("lead_activity",{id:lid,kind:"call",text:"",outcome:"",next_at:"2026-10-09T11:00"}); ok(r.ok,"B4 activity saves without a note "+(r.error||""));
r=await api("lead_activity",{id:lid,kind:"note",text:"",outcome:""}); ok(!r.ok&&/short note/.test(r.error),"B4 empty note gives clear message");
// B4 draft
await a.evaluate(()=>{location.hash="#/enquiries";}); await new Promise(r=>setTimeout(r,1500));
const addBtn="s17-add"; await new Promise(r=>setTimeout(r,2500)); console.log("VIEW", await a.evaluate(()=>location.hash+" | "+document.querySelector("#view").innerText.slice(0,120).replace(/\n/g," / ")+" | ids:"+[...document.querySelectorAll("#view button[id]")].map(b=>b.id).join(","))); await a.waitForSelector("#s17-add",{timeout:5000}); await a.click("#s17-add");
await new Promise(r=>setTimeout(r,500)); await a.type("#al-n","Draft Person"); await a.evaluate(()=>WXA.closeModal());
await a.click("#s17-add"); await new Promise(r=>setTimeout(r,500));
ok(await a.$eval("#al-n",e=>e.value)==="Draft Person","B4 draft restored after closing ("+addBtn+")");
await a.evaluate(()=>WXA.closeModal());
// B5 quote blocks in classic
const q=await api("quote_save",{client:{name:"Block Test"},project:"P19",layout:"classic",sections:[{name:"Kitchen",area:100,items:[{desc:"Cabinets",qty:2,unit:"job",rate:1000}]}],blocks:["-summary","items","-terms","-bank","totals","sign","scope"]});
const qid=q.quote?q.quote.id:q.id; ok(!!qid,"quote saved "+(q.error||""));
const html=await a.evaluate(async(id,t)=>{const x=await (await fetch("/api/admin.php?action=quote_get",{method:"POST",headers:{"Content-Type":"application/json","X-WX-ADM":t},body:JSON.stringify({action:"quote_get",id})})).json(); return WXPrint.quote(x.quote,x.company);},qid,tok);
ok(!/Summary of cost/.test(html),"B5 classic: summary hidden"); ok(!/Terms &amp; conditions/.test(html),"B5 classic: terms hidden"); ok(/Detailed bill/.test(html)&&/Cabinets/.test(html),"B5 classic: items shown");
ok(html.indexOf("Detailed bill")<html.indexOf("TOTAL"),"B5 order: items before totals"); ok(/xf-t/.test(html),"B5 footer strip present");
await a.evaluate((id)=>{location.hash="#/quote/"+id;},qid); await new Promise(r=>setTimeout(r,2000));
await a.click("#q17-live").catch(()=>{}); await new Promise(r=>setTimeout(r,1500));
await a.evaluate(()=>{const el=document.querySelector("#qe-blocks");el&&el.scrollIntoView({block:"center"});}); await new Promise(r=>setTimeout(r,400));
await a.screenshot({path:OUT+"p19-b5.png"});
ok(errs.length===0,"no JS errors "+errs.join("|"));
await b.close();
