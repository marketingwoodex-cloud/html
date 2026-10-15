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
await a.evaluate(() => (location.hash = "#/builder")); await w(5000);
const f = a.frames().find((x) => /\/builder\//.test(x.url()));
ok(await f.evaluate(() => !!window.__wx18f), "P18 F module loaded");
const tabs = await f.$$eval(".fk-tabs button", (L) => L.map((x) => x.textContent)); ok(tabs.join() === "Sections,UI kit,Templates,Images", "tabs: " + tabs.join(" | "));
const nSec = await f.$$eval('[data-pane="sec"] .lib button', (L) => L.length); ok(nSec === 62, "Sections tab: 50 v26 + 12 basic = " + nSec);
await a.screenshot({ path: OUT + "p18-f-sec.png" });
await f.click('[data-fk="uk"]'); await w(300); ok((await f.$$eval('[data-pane="uk"] .lib button', (L) => L.length)) === 40, "UI kit tab: 40 blocks");
await f.type('[data-pane="uk"] .lib-q', "pricing"); await w(200); const np = await f.$$eval('[data-pane="uk"] .lib button', (L) => L.length); ok(np >= 3 && np < 40, "search filters: " + np);
await f.click('[data-fk="tpl"]'); await w(300);
ok((await f.$$eval(".fk-lay", (L) => L.length)) === 6 && !!(await f.$("#lib-mine")), "6 starter layouts + My sections in Templates");
await a.screenshot({ path: OUT + "p18-f-tpl.png" });
const fr = (await f.$("#pk-frame")) ? await (await f.$("#pk-frame")).contentFrame() : null;
const before = await f.evaluate(() => window.__wx5.S.doc.querySelector("main").children.length);
await f.click('.fk-lay[data-l="0"]'); await w(500); if (await f.$("#fk-ap")) { await f.click("#fk-ap"); await w(800); }
const after = await f.evaluate(() => window.__wx5.S.doc.querySelector("main").children.length); ok(after === before + 6, "Service page layout adds 6 sections: " + before + " → " + after);
// export: capture download payload
const exp = await f.evaluate(() => new Promise((res) => { const X = window.__wx5, o = X.download; X.download = function (n, t) { X.download = o; res({ n, t }); }; window.__wx18f.exportPage(); }));
ok(/^woodex-template-.*\.json$/.test(exp.n) && JSON.parse(exp.t).blocks.length === after, "export page template: " + exp.n + " (" + JSON.parse(exp.t).blocks.length + " sections)");
await f.click('[data-fk="img"]'); await w(1500);
const ni = await f.$$eval("#fk-ig button", (L) => L.length); ok(ni > 5, "Images tab shows library: " + ni);
await a.screenshot({ path: OUT + "p18-f-img.png" });
await f.click('[data-fk="tpl"]'); await w(300); await a.screenshot({ path: OUT + "p18-f-tpl2.png" }); ok(await f.evaluate(() => [...document.querySelector(".lp[data-lp=sections]").children].every((n) => n.hidden || /H2|P/.test(n.tagName) || n.matches(".fk-tabs,.fk-pane"))), "panel tidy: only tabs + panes");
ok(!errs.length, "no JS errors " + errs.join(" | ")); await b.close();
