import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("pageerror", (e) => errs.push(e.message));
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true });
await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await a.evaluate(() => (location.hash = "#/train")); await a.waitForSelector("#t-qa-add");
await a.click('.tr-tabs button[data-i="1"]'); await a.click("#t-qa-add"); await a.type(".tr-qa .q", "Do you work outside Lahore?"); await a.type(".tr-qa .a", "Yes, Islamabad and Karachi too.");
await a.click("#tr-save"); await new Promise((r) => setTimeout(r, 1200));
await a.type("#t-i", "10 marla ghar ka interior kitne ka?"); await a.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 800));
await a.screenshot({ path: OUT + "p11-train.png" });
await a.click('.tr-tabs button[data-i="5"]'); await new Promise((r) => setTimeout(r, 300)); await a.screenshot({ path: OUT + "p11-wa.png" });
console.log("saved qa:", await a.evaluate(() => WXA.api("chat_cfg_get").then((r) => JSON.stringify(r.cfg.qa) + " verify:" + !!r.cfg.waVerify)));
console.log("errors:", errs); await b.close();
