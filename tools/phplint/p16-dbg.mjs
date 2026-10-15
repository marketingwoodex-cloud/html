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
const w = ms => new Promise(r=>setTimeout(r,ms));
a.on("console", m=>console.log("CON", m.text().slice(0,200)));
console.log(await a.evaluate(()=>({q:typeof WXA.VIEWS.quotes, i:typeof WXA.VIEWS.invoices, c:typeof WXA.VIEWS.clients, n:Object.keys(WXA.VIEWS).length})));
await a.evaluate(()=>location.hash="#/quotes"); await w(1500); console.log(await a.evaluate(()=>location.hash+" | "+document.querySelector(".content h1, #view h1")?.innerText + " | nav:" + document.querySelector(".side .on, .side [aria-current]")?.innerText));
await b.close();
