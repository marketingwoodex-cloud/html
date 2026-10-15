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
await a.evaluate(()=>location.hash="#/settings"); await w(1200); await a.click('#st-tabs [data-t=integrations]'); await w(1500);
console.log(await a.evaluate(()=>[...document.querySelectorAll("#view .card h3")].map(h=>h.textContent.trim()).join(" | ")));
await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-integ.png", fullPage:true});
await a.click('[data-o="in-wa"]'); await w(700); await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-integ-open.png"});
console.log("open:", await a.evaluate(()=>[...document.querySelectorAll(".st-card")].filter(c=>getComputedStyle(c).display!=="none"&&!c.closest("[hidden]")).map(c=>c.id)));
await a.click('#ig-all'); await w(400);
await a.setViewport({width:390,height:844}); await w(600); await a.screenshot({path:"/home/user/-marketingwoodex/tools/p16-integ-m.png"});
console.log(JSON.stringify(log)); await b.close();
