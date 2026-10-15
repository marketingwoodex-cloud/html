// Deep QA: visit every admin route, log JS errors, failed API calls, stuck "Loading…". Copy to ~/.cache/pb.
import puppeteer from "puppeteer-core";
const B = "http://localhost:8080";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("dialog", (d) => d.accept());
let cur = "", log = {};
const add = (m) => { (log[cur] ||= []).push(m); };
a.on("pageerror", (e) => add("JSERR " + e.message.slice(0, 120) + " @ " + String(e.stack||"").split("\n").slice(1,3).join(" | ").replace(/http:\/\/localhost:8080/g,"").slice(0,200)));
a.on("response", async (r) => { const u = r.url(); if (!/\/api\//.test(u) || r.request().method() !== "POST") return; let j; try { j = await r.json(); } catch { return add("NONJSON " + u.split("/api/")[1] + " " + r.status()); } if (j && j.ok === false) { let act = ""; try { act = JSON.parse(r.request().postData() || "{}").action; } catch {} add("APIFAIL " + u.split("/api/")[1] + ":" + act + " → " + String(j.error).slice(0, 120)); } });
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true }); await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
// P16 3.9 — visit every admin route; record JS errors (with stack), failed API calls, console errors and empty screens.
const w = ms => new Promise(r=>setTimeout(r,ms));
a.on("console", (m) => { if (m.type() === "error" && !/favicon|404 \(Not Found\)|net::ERR/.test(m.text())) add("CONSOLE " + m.text().slice(0, 160)); });
cur = "(after login)"; await w(2500);
const ids = await a.evaluate(()=>[...document.querySelectorAll(".nav-a[data-v]")].map(x=>x.dataset.v));
const empty = [];
for (const v of ids) { cur = v; await a.evaluate(v=>location.hash="#/"+v, v); await w(v==="builder"?2500:1100);
  const t = await a.evaluate(()=>{ const x=document.querySelector("#view"); return { h: (x.querySelector("h1")||{}).textContent||"", n: x.innerText.trim().length }; });
  if (!t.h || t.n < 40) empty.push(v + "(" + t.n + ")"); }
cur = "settings-tabs"; await a.evaluate(()=>location.hash="#/settings"); await w(1200);
const tabs = await a.$$eval("#view .tabs button, #view [data-tab]", b=>b.length);
for (let i=0;i<tabs;i++){ await a.evaluate(i=>{const b=[...document.querySelectorAll("#view .tabs button, #view [data-tab]")][i]; b&&b.click();}, i); await w(700); }
console.log("settings tabs clicked:", tabs);
console.log(ids.length + " routes; empty:", empty.join(", ") || "none");
for (const [k, v] of Object.entries(log)) console.log("•", k, "\n   " + [...new Set(v)].join("\n   "));
await b.close();
