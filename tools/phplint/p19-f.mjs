import puppeteer from "puppeteer-core";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1440,height:900}); const errs=[]; a.on("pageerror",e=>errs.push(e.message));
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m); const w=t=>new Promise(r=>setTimeout(r,t));
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await w(1500);
const tok=await a.evaluate(()=>WXA.S.token);
const api=(ac,d)=>a.evaluate(async(ac,d,t)=>(await fetch("/api/admin.php?action="+ac,{method:"POST",headers:{"Content-Type":"application/json","X-WX-ADM":t},body:JSON.stringify({action:ac,...d})})).json(),ac,d,tok);
const mk=async(n,st,v,ph)=>{const r=await api("lead_save",{name:n,phone:ph||"",service:"Kitchen",value:v,source:"manual",assigned_to:2});const id=r.lead.id; if(st!=="new") await api("lead_save",{id,stage:st}); return id;};
const L1=await mk("Ayesha Siddiqui","contacted",450000,"03001234567"); await mk("Bilal Interiors","visit",1200000); await mk("Hamza Builders","quote",2500000,"03219876543"); const L4=await mk("Sara Khan","new",0);
await api("lead_activity",{id:L1,kind:"call",next_at:"2026-10-01T10:00"});
await a.evaluate(()=>{location.hash="#/pipeline";}); await w(2000);
const cols=await a.$$eval(".p19-col",c=>c.map(x=>x.dataset.st)); ok(cols.length>=6,"columns "+cols.join(","));
const k=await a.$eval(".p19-kpi",e=>e.innerText.replace(/\n/g," | ")); ok(/Pipeline value/.test(k),"KPIs: "+k.slice(0,200));
const sw=await a.evaluate(()=>{const k=document.querySelector(".p19-kb");return [k.scrollWidth,k.clientWidth];}); ok(sw[0]<=sw[1]+2,"board fits screen (no side scroll) "+sw);
ok(await a.$(".p19-card.od")!==null,"overdue follow-up highlighted");
// filter
await a.type("#p19-q","Hamza"); await w(300); ok((await a.$$(".p19-card")).length===1,"search filters"); await a.evaluate(()=>{const i=document.querySelector("#p19-q");i.value="";i.dispatchEvent(new Event("input"));});
// lost via move
await a.evaluate(()=>{});
const dropped=await a.evaluate((id)=>{const c=document.querySelector('.p19-card[data-id="'+id+'"]'),col=document.querySelector('.p19-col[data-st="lost"]');const dt=new DataTransfer();dt.setData("text/plain",String(id));col.dispatchEvent(new DragEvent("drop",{dataTransfer:dt,bubbles:true}));return !!document.querySelector("#p19-lg");},L4);
ok(dropped,"lost → reason dialog"); await a.click("#p19-lg"); await w(900);
const lr=(await api("leads_list",{})).leads.find(l=>l.id===L4); ok(lr.stage==="lost"&&/Price/.test(lr.lost_reason),"lost saved with reason: "+lr.lost_reason);
await a.hover('.p19-card[data-id="'+L1+'"]'); await w(300);
await a.screenshot({path:OUT+"p19f.png"});
await a.setViewport({width:390,height:844}); await w(600); await a.screenshot({path:OUT+"p19f-m.png"});
ok(errs.length===0,"no JS errors "+errs.join("|"));
await b.close();
