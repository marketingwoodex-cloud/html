// Deep QA: visit every admin route, log JS errors, failed API calls, stuck "Loading…". Copy to ~/.cache/pb.
import puppeteer from "puppeteer-core";
const B = "http://localhost:8080";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("dialog", (d) => d.accept());
let cur = "", log = {};
const add = (m) => { (log[cur] ||= []).push(m); };
a.on("pageerror", (e) => add("JSERR " + e.message.slice(0, 160)));
a.on("response", async (r) => { const u = r.url(); if (!/\/api\//.test(u) || r.request().method() !== "POST") return; let j; try { j = await r.json(); } catch { return add("NONJSON " + u.split("/api/")[1] + " " + r.status()); } if (j && j.ok === false) { let act = ""; try { act = JSON.parse(r.request().postData() || "{}").action; } catch {} add("APIFAIL " + u.split("/api/")[1] + ":" + act + " → " + String(j.error).slice(0, 120)); } });
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true }); await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
const w = ms => new Promise(r=>setTimeout(r,ms)); await a.setViewport({width:1440,height:900});
await a.evaluate(()=>location.hash="#/builder"); await w(4000);
const f = a.frames().find(x=>/\/builder\//.test(x.url())); 
console.log("templates:", await f.evaluate(()=>window.WX_TEMPLATES.length), "cats:", await f.evaluate(()=>[...document.querySelectorAll("#v26-cat option")].map(o=>o.textContent).filter(t=>/UI kit/.test(t)).length));
await f.evaluate(()=>{ const s=document.querySelector("#v26-cat"); s.value=[...s.options].find(o=>/Pricing/.test(o.textContent)&&/UI kit/.test(o.textContent)).value; s.dispatchEvent(new Event("change")); });
await w(500); console.log("buttons:", await f.evaluate(()=>[...document.querySelectorAll("#lib-v26 button")].map(b=>b.textContent.trim()).join(" | ")));
await f.click("#lib-v26 button"); await w(1500);
const cv = f.frames ? null : null; const inner = a.frames().find(x=>x.parentFrame()===f);
console.log("inserted:", inner ? await inner.evaluate(()=>document.querySelectorAll(".uk-price").length) : "no canvas frame", await f.evaluate(()=>document.querySelector("#modal-body")?.innerText?.slice(0,120)||""));
await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-uk-builder.png"});
console.log(JSON.stringify(log)); await b.close();
