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
await a.evaluate(async()=>{ for (const [n,e,r] of [["Sara Sales","sara@woodex.pk","sales"],["Eddie Editor","ed@woodex.pk","editor"]]) await WXA.api("user_save",{id:0,name:n,email:e,role:r,password:"Woodex@2026x",active:true}); });
await a.evaluate(()=>location.hash="#/users"); await w(1500);
await a.click('#us-r [data-r="sales"]'); await w(300); console.log("sales rows:", await a.evaluate(()=>[...document.querySelectorAll("#u-rows tr")].filter(r=>r.style.display!=="none").length));
await a.click('#us-r [data-r="all"]'); await w(300);
await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-users.png"});
await a.click('.us-act[data-n="Sara Sales"]'); await w(1500); console.log("activity q:", await a.evaluate(()=>document.querySelector("#a-q")?.value), await a.evaluate(()=>document.querySelector("#us-tabs .on")?.textContent));
await a.evaluate(()=>location.hash="#/security"); await w(1500); console.log("security tabs:", await a.evaluate(()=>!!document.querySelector("#us-tabs")));
await a.evaluate(()=>location.hash="#/profile"); await w(1000); await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-profile.png"});
console.log(JSON.stringify(log)); await b.close();
