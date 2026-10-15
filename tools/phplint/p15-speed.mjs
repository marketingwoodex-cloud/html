// P15 Speed dashboard test (server must run with PSI_FAKE=1). Copy to ~/.cache/pb and run.
import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 1000 }); a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true }); await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
console.log("nav item:", await a.$$eval('a[href="#/speed"]', (x) => x.length));
await a.evaluate(() => (location.hash = "#/speed")); await a.waitForSelector("#sp-one", { timeout: 15000 });
console.log("pages in picker:", await a.$$eval("#sp-page option", (x) => x.length));
await a.$eval("#sp-one", (e) => e.click());
await a.waitForFunction(() => document.querySelectorAll(".sp-ring").length >= 8, { timeout: 30000 });
console.log("rings:", await a.$$eval(".sp-ring", (x) => x.length), "tips:", await a.$$eval(".sp-tip", (x) => x.length));
await a.$eval("#sp-all", (e) => e.click());
await a.waitForFunction(() => !document.querySelector("#sp-all").disabled && [...document.querySelectorAll(".tbl tbody tr td:nth-child(2) b")].every((b) => b.textContent !== "–"), { timeout: 60000 });
console.log("key pages tested:", await a.$$eval(".tbl tbody tr td:nth-child(2) b", (x) => x.map((b) => b.textContent).join(",")));
await a.$eval("#sp-one", (e) => e.click()); await new Promise((r) => setTimeout(r, 1500));
console.log("history bars:", await a.$$eval(".sp-2 .sp-hist i", (x) => x.length));
await a.screenshot({ path: OUT + "p15-speed.png", fullPage: true });
await a.setViewport({ width: 400, height: 900 }); await new Promise((r) => setTimeout(r, 400)); await a.screenshot({ path: OUT + "p15-speed-mobile.png" });
console.log("errors:", errs.length ? errs : "none");
await b.close();
