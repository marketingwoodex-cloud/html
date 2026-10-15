// P17 C1/C2 builder test: designer → My sections; pick from a page → review → save; My sections filter. cp to ~/.cache/pb
import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/";
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const a = await b.newPage(); await a.setViewport({ width: 1440, height: 900 }); a.on("dialog", (d) => d.accept());
const errs = []; a.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const w = (ms) => new Promise((r) => setTimeout(r, ms));
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true }); await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
import fs from "node:fs";
const call = (act, o = {}) => a.evaluate((act, o) => WXA.api(act, o), act, o);
await a.evaluate(() => (location.hash = "#/profile")); await a.waitForSelector("#pr .pr-cover", { timeout: 8000 });
ok(!!(await a.$(".pr-dl")) && !!(await a.$(".pr-stats")) && !!(await a.$(".pr-sec")) && !!(await a.$(".pr-tl")), "cover, personal info, stats, security, activity");
// edit
await a.click("#pr-ed"); await a.waitForSelector("#pe-n");
await a.evaluate(() => { const v = { "pe-t": "Senior interior designer", "pe-c": "Lahore", "pe-p": "+92 322 4000768", "pe-w": "+92 322 4000768", "pe-b": "I plan homes and offices." }; for (const k in v) document.getElementById(k).value = v[k]; });
await a.click("#pe-go"); await w(1200);
const t = await a.$eval("#pr", (e) => e.innerText); ok(/Senior interior designer/.test(t) && /Lahore/.test(t) && /\+92 322 4000768/.test(t) && /I plan homes/.test(t), "details saved + shown");
ok(!!(await a.$('.pr-chip[href^="https://wa.me/923224000768"]')), "WhatsApp chip link");
// validation
const bad = await call("me_save", { phone: "call me<script>" }); ok(!bad.ok && /Phone/.test(bad.error), "bad phone refused");
const xs = await call("me_save", { name: "<b>x</b>" }); ok(!xs.ok, "HTML in name refused");
// avatar: make a PNG in the page and upload via the file input path
const png = await a.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400; const g = c.getContext("2d"); g.fillStyle = "#b8956a"; g.fillRect(0, 0, 600, 400); g.fillStyle = "#0c1628"; g.fillRect(200, 100, 200, 200); return c.toDataURL("image/png"); });
fs.writeFileSync("/tmp/av.png", Buffer.from(png.split(",")[1], "base64"));
const inp = await a.$("#pr-file"); await inp.uploadFile("/tmp/av.png"); await w(2000);
const av = await a.$eval(".pr-av img", (i) => i.getAttribute("src")).catch(() => ""); ok(/^\/assets\/uploads\/avatars\/u\d+-[0-9a-f]{8}\.jpg$/.test(av), "photo uploaded (square JPEG): " + av);
const dim = await a.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), av); ok(dim[0] === 400 && dim[1] === 400, "cropped to 400×400");
ok(await a.evaluate(() => document.querySelector("#u-av").classList.contains("has-img")), "photo shown in top bar");
ok(!(await call("me_avatar", { data: "data:image/png;base64," + Buffer.from("not an image").toString("base64") })).ok, "fake image refused");
await a.screenshot({ path: OUT + "p18-j-profile.png" });
await a.setViewport({ width: 390, height: 844 }); await w(600); await a.screenshot({ path: OUT + "p18-j-mobile.png", fullPage: false }); await a.setViewport({ width: 1440, height: 900 });
// reload keeps the new screen (direct load)
await a.reload({ waitUntil: "load" }); await w(3000); ok(!!(await a.$("#pr .pr-cover")), "direct load of #/profile shows new page");
// password modal
await a.click("#pr-pw"); await a.waitForSelector("#pp-c"); await a.type("#pp-c", "Woodex@2026x"); await a.type("#pp-n", "Woodex@2026y"); await a.type("#pp-r", "Woodex@2026z"); await a.click("#pp button.pri"); await w(500);
ok(/do not match/.test(await a.$eval("#pp-err", (e) => e.textContent)), "password mismatch caught");
await a.evaluate(() => { document.querySelector("#pp-r").value = "Woodex@2026y"; }); await a.click("#pp button.pri"); await w(1500);
ok((await call("me_get")).ok, "still signed in after password change");
const back = await call("password", { current: "Woodex@2026y", next: "Woodex@2026x" }); ok(back.ok, "password changed back"); await a.evaluate((t) => { WXA.S.token = t; sessionStorage.setItem("wxaTok", t); }, back.token);
// remove photo
await a.evaluate(() => (location.hash = "#/dashboard")); await w(500); await a.evaluate(() => (location.hash = "#/profile")); await a.waitForSelector("#pr-rm"); await a.click("#pr-rm"); await w(1200);
ok(!(await a.$(".pr-av img")) && !fs.existsSync("/home/user/-marketingwoodex/frontend-v1" + av), "photo removed + file deleted");
ok(!errs.length, "no JS errors " + errs.join(" | ")); await b.close();
