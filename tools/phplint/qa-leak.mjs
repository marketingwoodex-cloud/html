// Regression: click handlers must not leak between admin screens (#view reused). cp to ~/.cache/pb
import pp from "puppeteer-core";
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms)), ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await W(2500); }
const nT = () => a.evaluate(async () => ((await WXA.api("cms_tpl_list", {})).tpls || []).length), nF = () => a.evaluate(async () => ((await WXA.api("cms_list", { type: "faq" })).items || []).length);
await a.evaluate(() => (location.hash = "#/pagetpl")); await W(2000);
if (!(await nT())) { await a.evaluate(() => { const s = document.querySelector("#tp-start"); s && s.click(); }); await W(2500); }
await a.evaluate(async () => { if (!((await WXA.api("cms_list", { type: "faq" })).items || []).length) await WXA.api("cms_save", { type: "faq", title: "Leak FAQ", status: "published", data: { items: [{ q: "Q?", a: "A." }] } }); });
const t0 = await nT(), f0 = await nF();
await a.evaluate(() => (location.hash = "#/faqs")); await W(2000);
await a.evaluate(() => document.querySelector("#fg-l [data-dup]").click()); await W(2000);
ok((await nT()) === t0 && (await nF()) === f0 + 1, `FAQ Duplicate copies only the FAQ (templates ${t0}→${await nT()}, faq ${f0}→${await nF()})`);
await a.evaluate(() => (location.hash = "#/dashboard")); await W(1200); await a.evaluate(() => (location.hash = "#/pagetpl")); await W(1800); await a.evaluate(() => (location.hash = "#/settings")); await W(1200); await a.evaluate(() => (location.hash = "#/pagetpl")); await W(2000);
const t1 = await nT(); await a.evaluate(() => document.querySelector("#tp-list [data-dup]").click()); await W(2000);
ok((await nT()) === t1 + 1, `template Duplicate after 2 visits adds exactly 1 (${t1}→${await nT()})`);
await a.evaluate(() => (location.hash = "#/settings")); await W(1200);
await a.evaluate(() => [...document.querySelectorAll("#view button")].slice(0, 12).forEach((x) => { if (!/sign out|delete|reset|disconnect/i.test(x.textContent)) try { x.click(); } catch (e) {} })); await W(1200);
ok(!errs.some((e) => /admin-templates/.test(e)), "no template-screen errors on other screens");
console.log("errors:", JSON.stringify(errs.slice(0, 5))); await b.close();
