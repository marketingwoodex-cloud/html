import puppeteer from "puppeteer-core";
const B="http://localhost:8080",OUT="/home/user/-marketingwoodex/tools/";
const b=await puppeteer.launch({executablePath:process.cwd()+"/al/chromium",headless:"shell",args:["--no-sandbox"]});
const a=await b.newPage(); await a.setViewport({width:1440,height:950}); const errs=[]; a.on("pageerror",e=>errs.push(e.message));
const ok=(c,m)=>console.log((c?"PASS ":"FAIL ")+m); const w=t=>new Promise(r=>setTimeout(r,t));
await a.goto(B+"/admin/",{waitUntil:"load"}); await a.waitForSelector("#l-email",{visible:true}); await a.type("#l-email","o@woodex.pk"); await a.type("#l-pass","Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])"); await w(1500);
const tok=await a.evaluate(()=>WXA.S.token);
const api=(ac,d)=>a.evaluate(async(ac,d,t)=>(await fetch("/api/admin.php?action="+ac,{method:"POST",headers:{"Content-Type":"application/json","X-WX-ADM":t},body:JSON.stringify({action:ac,...d})})).json(),ac,d,tok);
const render=(fn,id)=>a.evaluate(async(fn,id,t)=>{const g=fn==="quote"?"quote_get":"inv_get";const x=await (await fetch("/api/admin.php?action="+g,{method:"POST",headers:{"Content-Type":"application/json","X-WX-ADM":t},body:JSON.stringify({action:g,id})})).json();return fn==="quote"?WXPrint.quote(x.quote,x.company):WXPrint.invoice(x.invoice,x.company);},fn,id,tok);
const secs=[{name:"Kitchen",area:120,items:[{desc:"Base cabinets, MDF with acrylic",qty:14,unit:"rft",rate:18000},{desc:"Quartz counter",qty:22,unit:"sft",rate:6500}]},{name:"Wardrobes",area:80,items:[{desc:"Sliding wardrobe 8ft",qty:2,unit:"no",rate:145000}]}];
for (const lay of ["classic","single","project"]) {
  const r=await api("quote_save",{client:{name:"Flow "+lay,phone:"03001112233"},project:"Villa 12, DHA",layout:lay,scope:"Design\nManufacture\nInstallation",sections:secs,discount:20000,rent:15000,taxPct:0,advance:200000});
  ok(r.ok,lay+": saved "+(r.error||"")); const q=r.quote;
  ok(q.total===q.subtotal-20000+15000,lay+": total "+q.total+" = subtotal "+q.subtotal+" − 20,000 + rent 15,000");
  let h=await render("quote",q.id);
  ok(/xf-t/.test(h)&&/Thank you for your business/.test(h),lay+": footer strip");
  ok(/Kitchen/.test(h)&&/Quartz counter/.test(h),lay+": items");
  ok(/Summary of cost/.test(h)===(lay!=="single"),lay+": summary default "+(lay!=="single"?"on":"off"));
  ok(/Bank|IBAN/i.test(h)&&/Accepted by client/.test(h),lay+": bank + signature");
  ok(/Balance|advance/i.test(h),lay+": advance/balance shown");
  const tog=lay==="single"?["summary","items","totals","terms","bank","sign","scope"]:["-summary","totals","items","terms","bank","sign","scope"];
  await api("quote_save",{...(await api("quote_get",{id:q.id})).quote,blocks:tog}); h=await render("quote",q.id);
  ok(/Summary of cost/.test(h)===(lay==="single"),lay+": summary switch works");
  await a.evaluate(id=>{location.hash="#/quote/"+id;},q.id); await w(1800);
  await a.click("#q17-live").catch(()=>{}); await w(1800);
  await a.screenshot({path:OUT+"p19q-"+lay+".png"});
  await api("quote_status",{id:q.id,status:"sent"}); const ap=await api("quote_status",{id:q.id,status:"approved"}); if(!ap.ok) console.log("approve:",ap.error); const iv=await api("quote_invoice",{id:q.id}); ok(iv.ok,lay+": converted to invoice "+(iv.error||(iv.invoice&&iv.invoice.no)));
  if(iv.ok){const ih=await render("invoice",iv.invoice.id); ok(/xf-t/.test(ih)&&/INVOICE/i.test(ih)&&ih.includes(q.no||"WI-"),lay+": invoice renders with footer + same number");}
}
ok(errs.length===0,"no JS errors "+errs.join("|"));
await b.close();
