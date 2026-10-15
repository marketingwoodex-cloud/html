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
const w = ms => new Promise(r=>setTimeout(r,ms)); await a.setViewport({width:1366,height:900});
await a.evaluate(async()=>{for(const n of ["Ayesha Khan","Bilal Ahmed","Sana Tariq"]) await WXA.api("lead_save",{name:n,phone:"+92 300 1234"+Math.floor(Math.random()*999),service:"Kitchen"});});
for (const r of (process.env.R||"enquiries,clients,quotes,invoices").split(",")) { await a.evaluate(r=>location.hash="#/"+r, r); await w(1500); await a.screenshot({path:`/home/user/-marketingwoodex/tools/p16-l-${r.replace(/\W/g,"")}.png`}); }
await a.evaluate(()=>location.hash="#/services"); await w(1500); console.log("pager:", await a.evaluate(()=>document.querySelector(".lp-bar")?.innerText.replace(/\n/g," ")));
await a.click(".lp-bar [data-p='2']"); await w(400); console.log("page2:", await a.evaluate(()=>document.querySelector(".lp-bar small")?.innerText));
await a.type("#view input[type=search], #view input[placeholder^='Search']","kanal"); await w(800); console.log("search:", await a.evaluate(()=>[...document.querySelectorAll("#view tbody tr")].filter(r=>r.style.display!=="none").length, ), await a.evaluate(()=>document.querySelector(".lp-bar")?"bar":"no bar"));
await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-l-page.png"});
await a.setViewport({width:390,height:844}); await a.evaluate(()=>location.hash="#/enquiries"); await w(1500); await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-l-mob.png"});
console.log(JSON.stringify(log)); await b.close();
