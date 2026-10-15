// P17 C3 header/footer design test. cp to ~/.cache/pb; restore pages after: git diff --name-only | grep html$ | xargs git checkout --
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
await a.evaluate(() => (location.hash = "#/global")); await w(3500);
ok(await a.$("[data-gt='design']") && await a.$("#hf-export") && await a.$("#hf-import"), "Design tab + import/export buttons");
await a.click("[data-gt='design']"); await w(700);
ok((await a.$$(".c3-pre")).length === 5, "5 presets");
await a.screenshot({ path: OUT + "c3-a2.png" });
await a.evaluate(() => [...document.querySelectorAll(".c3-pre")].find((b) => /Navy bar/.test(b.textContent)).click()); await w(500);
await a.click("[data-pc='design.phoneShow']"); await a.type("[data-p='design.phone']", "+92 322 4000768"); await w(900);
const fr = await (await a.$("#hf-frame")).contentFrame();
const pv = await fr.evaluate(() => ({ st: !!document.getElementById("wx-chrome-style"), ph: !!document.querySelector(".site-header .wx-hphone"), bg: getComputedStyle(document.querySelector(".site-header")).backgroundColor, cta: getComputedStyle(document.querySelector("#header-cta")).backgroundColor }));
ok(pv.st && pv.ph && pv.bg === "rgb(12, 22, 40)" && pv.cta === "rgb(184, 149, 106)", "live preview applies design " + JSON.stringify(pv));
await a.screenshot({ path: OUT + "c3-b2.png" });
await a.click("#hf-publish"); await w(5000);
const pg = await a.evaluate(() => Promise.all(["/", "/about/", "/renovation/"].map((u) => fetch(u).then((r) => r.text()))));
ok(pg.every((h) => /<style id="wx-chrome-style"/.test(h) && /class="wx-hphone" href="tel:\+923224000768"/.test(h)), "published to pages (style + phone)");
const vs = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", headers: { "X-WX-ADM": "" }, body: JSON.stringify({ action: "chrome_versions" }) }).then((r) => r.json()).catch(() => ({})));
// reload editor: design is read back from the page
await a.evaluate(() => (location.hash = "#/dashboard")); await w(800); await a.evaluate(() => (location.hash = "#/global/design")); await w(3500);
ok(await a.evaluate(() => document.querySelector("[data-p='design.hStyle']").value === "bar" && document.querySelector("[data-p='design.phone']").value === "+92 322 4000768"), "design read back after reload");
// bad style rejected by server
const bad = await a.evaluate(() => window.WXA.api("global_chrome", { design: 1, style: '<style id="wx-chrome-style" data-cfg="">body{background:url(javascript:x)}</style>' }));
ok(!bad.ok, "unsafe CSS rejected");
// reset
await a.evaluate(() => document.querySelector("button[data-reset]").click()); await w(300);
await a.click("#hf-publish"); await w(5000);
const pg2 = await a.evaluate(() => fetch("/about/").then((r) => r.text()));
ok(!/wx-chrome-style|wx-hphone/.test(pg2), "reset removes style + phone from pages");
ok(!errs.length, "no JS errors " + errs.join(" | "));
await b.close();
