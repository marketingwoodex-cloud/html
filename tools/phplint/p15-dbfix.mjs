// P15 reconnect-DB test (server started with WX_DB_BROKEN=1). Copy to ~/.cache/pb and run.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); await a.setViewport({ width: 1100, height: 950 });
await a.goto("http://localhost:8080/admin/", { waitUntil: "load" });
await a.waitForSelector("#db-form:not([hidden])", { timeout: 8000 });
await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p15-dbfix.png" });
await a.type("#d-name", "u128159657_woodexdb"); await a.type("#d-user", "u128159657_woodexuser"); await a.type("#d-dpass", "x"); await a.type("#d-bpass", "wrong");
await a.click("#d-btn"); await new Promise((r) => setTimeout(r, 700)); console.log("wrong pw:", await a.$eval("#d-err", (e) => e.textContent));
await a.$eval("#d-bpass", (e) => (e.value = "")); await a.type("#d-bpass", "Woodex@2026");
await a.click("#d-btn"); await a.waitForSelector("#login-form:not([hidden])", { timeout: 5000 }); console.log("after reconnect: login form shown, db form hidden:", await a.$eval("#db-form", (e) => e.hidden));
console.log("errors:", errs.length ? errs : "none"); await b.close();
