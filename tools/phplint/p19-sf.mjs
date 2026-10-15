import puppeteer from "puppeteer-core"; import fs from "fs";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1440,height:950}); const errs=[]; a.on("pageerror",e=>errs.push(e.message));
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m); const w=t=>new Promise(r=>setTimeout(r,t));
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await w(1200);
const api=(ac,d)=>a.evaluate((ac,d)=>WXA.api(ac,d),ac,d);
// Services
await a.evaluate(()=>location.hash="#/services"); await w(2000);
ok(await a.$("#sv-new")&&await a.$('a[href="#/pagetpl"]'),"services: New + From template buttons");
ok((await a.$$("#sv-rows [data-dup]")).length>3,"services: Duplicate on rows");
await a.evaluate(()=>document.querySelector("#sv-new").click()); await w(800);
ok(await a.$("#np-tpl")!==null,"services: new-page dialog opens");
await a.screenshot({path:OUT+"p19sf-svc.png"}); await a.evaluate(()=>WXA.closeModal());
// Forms
await a.evaluate(()=>location.hash="#/forms"); await w(2000);
ok(await a.$("#fm-de")!==null,"forms: default email box");
await a.evaluate(()=>{document.querySelector("#fm-de").value="woodexinterior.pk@gmail.com";document.querySelector("#fm-deon").checked=true;document.querySelector(".fm-card [data-f=waTo]").value="+92 322 4000768";});
await a.evaluate(()=>document.querySelector("#fm-save").click()); await w(1200);
let g=await api("forms_get",{}); ok(g.defaults.emailTo==="woodexinterior.pk@gmail.com"&&g.defaults.emailOn,"forms: default email saved");
ok(g.forms[0].cfg.waTo==="923224000768","forms: per-form WhatsApp number saved "+g.forms[0].cfg.waTo);
const bad=await api("forms_save",{forms:{[g.forms[0].id]:{waTo:"123"}}}); ok(!bad.ok,"forms: bad number rejected");
await a.evaluate(()=>location.hash="#/forms"); await w(1500); await a.screenshot({path:OUT+"p19sf-forms.png"});
// Sheet import → leads + clients
const csv="Jan 2025 Lead Management\nDate,Company,Name,Contact,Designation,Location,Lead Source,Status,Assigned To,Quotation,Last Contact,Action,Meeting Schedule,Note\n05/01/2025,Test Foods,Imran Test,0300-1112223,Owner,Gulberg Lahore,New lead,Interior,Owner,Proposal,07/01/2025,Meeting,10/01/2025,Office fit-out\n06/01/2025,,Sara Test,03001112224,,DHA Lahore,Client,Furniture,,Pending,,Hold,,Sofa set\n07/01/2025,,Sara Test 2,+92 300 1112224,,DHA,Client,Furniture,,,,Won,,Same phone\n";
fs.writeFileSync("/tmp/sheet.csv",csv);
const c0=(await api("clients_master",{})).clients.length;
await a.evaluate(()=>location.hash="#/enquiries"); await w(2000);
const [fc]=await Promise.all([a.waitForFileChooser(),a.evaluate(()=>document.querySelector("#s17-imp").click())]); await fc.accept(["/tmp/sheet.csv"]); await w(1500);
ok(await a.$("#im-cl")!==null,"import: clients checkbox"); await a.screenshot({path:OUT+"p19sf-imp.png"});
await a.evaluate(()=>document.querySelector("#im-go").click()); await w(2000);
const L=(await api("leads_list",{})).leads.filter(l=>/Test/.test(l.name)); const C=(await api("clients_master",{})).clients;
ok(L.length===3&&L.every(l=>l.client_id),"import: 3 leads, all linked to clients");
ok(C.length-c0===2,"import: 2 new clients (same phone merged) "+(C.length-c0));
ok(L.find(l=>l.name==="Imran Test").created_at.startsWith("2025-01-05"),"import: sheet date kept");
ok(errs.length===0,"no JS errors "+errs.join("|")); await b.close();
