import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
await a.goto(B + "/admin/", { waitUntil: "load" }); await a.waitForSelector("#l-email", { visible: true });
await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await a.evaluate(() => (location.hash = "#/post/new")); await a.waitForSelector("#ce-seo-an", { timeout: 15000 });
await a.type("#ce-title", "Interior design cost in Pakistan"); await a.type("#ce-kw", "interior design cost"); await a.$eval("#ce-seo-an", (e) => { e.scrollIntoView(); e.click(); }); await a.waitForSelector("#ce-seo-r .sx-h", { timeout: 15000 });
console.log("blog:", await a.$eval("#ce-seo-r .sx-h", (e) => e.textContent));
const p = a; p.on("pageerror", (e) => errs.push("builder: " + e.message));
await p.goto(B + "/builder/", { waitUntil: "domcontentloaded" }); await new Promise((r) => setTimeout(r, 800));

await new Promise((r) => setTimeout(r, 4000)); await p.$eval(".rl[data-left=\"seo\"]", (e) => e.click()); await new Promise((r) => setTimeout(r, 800));
await p.type("#seo-kw", "interior design Lahore"); await new Promise((r) => setTimeout(r, 800));
console.log("builder:", await p.$eval("#seo-an", (e) => e.querySelector(".sx-h") ? e.querySelector(".sx-h").textContent : "empty"));
await p.screenshot({ path: OUT + "p13-builder.png" });
console.log("errors:", errs); await b.close();
