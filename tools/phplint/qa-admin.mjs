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
const routes = await a.$$eval("#side a[href^='#/']", (x) => x.map((e) => [e.getAttribute("href"), e.textContent.trim()]));
for (const [h, name] of routes) {
  cur = name + " " + h;
  await a.evaluate((h) => (location.hash = h), h); await new Promise((r) => setTimeout(r, 2200));
  const info = await a.evaluate(() => { const m = document.querySelector("#view,main,.content"); const t = (m || document.body).innerText; return { loading: /Loading…|Loading\.\.\./.test(t), len: t.length, soon: /Phase A\d|coming soon/i.test(t) }; });
  if (info.loading) add("STUCK Loading…"); if (info.len < 80) add("EMPTY view"); if (info.soon) add("SAYS coming soon / Phase badge");
  if (!log[cur]) log[cur] = ["ok"];
}
for (const [k, v] of Object.entries(log)) console.log(k.padEnd(38), "|", [...new Set(v)].join(" ; "));
await b.close();
