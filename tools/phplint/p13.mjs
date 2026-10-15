import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("pageerror", (e) => errs.push(e.message));
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true });
await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await a.evaluate(() => (location.hash = "#/seo")); await a.waitForSelector("#so-b tr");
await a.click("#so-all"); for (let k = 0; k < 6; k++) { await new Promise((r) => setTimeout(r, 2000)); console.log(await a.evaluate(() => (document.querySelector("#so-all") || {}).textContent + " | dots:" + document.querySelectorAll("#so-b .sx-dot").length)); } await new Promise((r) => setTimeout(r, 2500));
await a.screenshot({ path: OUT + "p13-list.png" });
await a.evaluate(() => (location.hash = "#/seo/renovation%2Findex.html")); await a.waitForSelector(".sx-g", { timeout: 15000 });
await a.type("#se-kw", "renovation company Lahore"); await a.click('.se-s[value="BreadcrumbList"]').catch(() => {}); await a.click("#se-save"); await new Promise((r) => setTimeout(r, 2500));
await a.screenshot({ path: OUT + "p13-edit.png", fullPage: true });
console.log("saved:", await a.evaluate(() => WXA.api("seo_page", { path: "renovation/index.html" }).then((r) => JSON.stringify({ kw: r.seo && r.seo.kw, seo: r.seo && r.seo.seo, managed: r.managed }))));
console.log("errors:", errs); await b.close();
