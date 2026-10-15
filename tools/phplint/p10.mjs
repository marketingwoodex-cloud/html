// Phase 10 browser test (run from ~/.cache/pb with LD_LIBRARY_PATH set)
import puppeteer from "puppeteer-core";
import fs from "fs";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox", "--disable-gpu"] });
const errs = [], OUT = "/home/user/-marketingwoodex/tools/", B = "http://localhost:8080";
const v = await b.newPage(); await v.setViewport({ width: 1280, height: 860 }); v.on("pageerror", (e) => errs.push("site: " + e.message));
// visitor chat
await v.goto(B + "/renovation/", { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 600));
await v.click(".wx-wa-btn"); await new Promise((r) => setTimeout(r, 400));
await v.screenshot({ path: OUT + "p10-home.png" });
await v.click('[data-go="chat"]'); await new Promise((r) => setTimeout(r, 300));
await v.type(".wx-ch-form textarea", "Hi, I need renovation of my 10 marla house. My name is Bilal Khan"); await v.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 1200));
await v.type(".wx-ch-form textarea", "My number is 0300 1234567"); await v.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 1200));
// admin
const a = await b.newPage(); await a.setViewport({ width: 1366, height: 860 }); a.on("pageerror", (e) => errs.push("admin: " + e.message)); a.on("dialog", (d) => d.accept());
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true });
// forgot password flow
await a.click("#l-forgot"); await a.type("#fp-email", "o@woodex.pk"); await a.click("#fp-btn"); await new Promise((r) => setTimeout(r, 600));
console.log("forgot:", await a.$eval("#fp-ok", (e) => e.textContent));
const ob = "/home/user/-marketingwoodex/frontend-v1/_private/outbox/", rf = fs.readdirSync(ob).filter((f) => f.endsWith("-reset.txt")).sort().pop();
const tok = fs.readFileSync(ob + rf, "utf8").split("#reset=")[1].trim();
await a.goto(B + "/admin/#reset=" + tok, { waitUntil: "load" }); await a.waitForSelector("#rp-form:not([hidden])", { timeout: 8000 });
await a.type("#rp-pass", "Woodex@2026x"); await a.type("#rp-pass2", "Woodex@2026x"); await a.click("#rp-btn"); await new Promise((r) => setTimeout(r, 700));
console.log("reset → login visible:", await a.$eval("#login-form", (e) => !e.hidden));
await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await new Promise((r) => setTimeout(r, 2500));
console.log("bell count:", await a.$eval("#nt-n", (e) => (e.hidden ? 0 : e.textContent)));
await a.click("#nt-btn"); await new Promise((r) => setTimeout(r, 300)); await a.screenshot({ path: OUT + "p10-bell.png" }); await a.click("#nt-btn");
await a.evaluate(() => (location.hash = "#/chat")); await new Promise((r) => setTimeout(r, 1200));
await a.click(".lc-it"); await new Promise((r) => setTimeout(r, 1200));
await a.type("#lc-in textarea", "Assalam-o-Alaikum Bilal! This is Owner from Woodex. When can we visit the site?"); await a.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 1000));
await a.screenshot({ path: OUT + "p10-inbox.png" });
// visitor sees agent reply
await new Promise((r) => setTimeout(r, 3800));
console.log("visitor sees:", await v.$$eval(".wx-m", (els) => els.map((e) => e.textContent.slice(0, 60))));
await v.screenshot({ path: OUT + "p10-chat.png" });
console.log("leads:", await a.evaluate(() => WXA.api("leads_list").then((r) => r.leads.filter((l) => l.source === "chat").map((l) => l.name + " " + l.phone))));
console.log("errors:", errs);
await b.close();
