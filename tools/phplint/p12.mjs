import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("pageerror", (e) => errs.push(e.message));
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true });
await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await a.evaluate(() => (location.hash = "#/updates")); await a.waitForSelector(".nt-ev");
await a.type("#nt-tp", "03001234567"); await a.click('.nt-ev[data-k="started"] .ts'); await new Promise((r) => setTimeout(r, 1500));
await a.screenshot({ path: OUT + "p12-updates.png" });
console.log("errors:", errs); await b.close();
