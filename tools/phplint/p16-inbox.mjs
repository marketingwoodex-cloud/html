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
const P = (b)=>a.evaluate(b=>fetch("/api/chat.php",{method:"POST",body:JSON.stringify(b)}).then(r=>r.json()),b);
for (const [n,t] of [["Ayesha Khan","Hi, I need a quote for a 10 marla kitchen."],["Bilal Ahmed","Do you do office fit-outs in DHA?"],["","What are your prices for wardrobes?"]]) { const r = await P({action:"send",name:n,text:t,page:"/kitchen/"}); }
await a.evaluate(()=>location.hash="#/chat"); await w(1500);
const first = await a.evaluate(()=>document.querySelector(".lc-it")?.getAttribute("href")); if (first) { await a.evaluate(h=>location.hash=h, first); await w(1500); }
await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-inbox4.png"});
await a.setViewport({width:390,height:844}); await w(700); await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-inbox4-m.png"});
console.log(JSON.stringify(log)); await b.close();
