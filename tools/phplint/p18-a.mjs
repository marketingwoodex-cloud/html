import pp from "puppeteer-core"; import fs from "fs";
const OUT = "/home/user/-marketingwoodex/tools/", DL = "/tmp/p18dl"; fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL);
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const w = (t) => new Promise((r) => setTimeout(r, t));
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => { errs.push("DIALOG " + d.message()); d.dismiss(); });
const cdp = await a.target().createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(2500);
await a.evaluate(() => (location.hash = "#/quote/3")); await w(2500);
ok(await a.$$eval("#qe-blocks li", (l) => l.length) === 7, "7 blocks listed");
ok(await a.$eval("#qe-bal", (e) => !e.hidden && e.textContent.includes("3,207,300")), "balance payable shown (4,207,300 − 1,000,000)");
// move Payment details to top with ↑ repeatedly, hide Scope
const order0 = await a.$$eval("#qe-blocks .blk-n", (l) => l.map((x) => x.textContent));
console.log("order:", order0.join(" | "));
await a.evaluate(() => { const li = [...document.querySelectorAll("#qe-blocks li")].find((x) => /Payment/.test(x.textContent)); li.querySelector("[data-up]").click(); });
await w(300); const ord1 = await a.$$eval("#qe-blocks .blk-n", (l) => l.map((x) => x.textContent)); ok(ord1.indexOf("Payment details") === order0.indexOf("Payment details") - 1, "↑ moves block up");
// drag Summary to first
await a.evaluate(() => { const L = [...document.querySelectorAll("#qe-blocks li")]; const s = L.find((x) => /Summary/.test(x.textContent)), t = L[0]; const dt = new DataTransfer(); s.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true })); t.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); t.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
await w(300); ok((await a.$$eval("#qe-blocks .blk-n", (l) => l.map((x) => x.textContent)))[0] === "Summary of cost", "drag & drop to top");
await a.evaluate(() => { const li = [...document.querySelectorAll("#qe-blocks li")].find((x) => /Signatures/.test(x.textContent)); li.querySelector("input").click(); });
await w(200); ok(await a.$eval("#qe-save", (x) => !x.disabled), "change marks dirty");
await a.click("#qe-save"); await w(1500);
const saved = await a.evaluate(async () => (await (await fetch("/api/admin.php", { method: "POST", headers: { "content-type": "application/json", "X-WX-ADM": sessionStorage.getItem("wxadm") || localStorage.getItem("wxadm") || "" }, body: JSON.stringify({ action: "quote_get", id: 3 }) })).json()));
console.log("saved blocks:", JSON.stringify(saved.quote ? saved.quote.blocks : saved.error));
await a.screenshot({ path: OUT + "p18-a-editor.png" });
// preview
await a.evaluate(() => document.getElementById("qe-pdf").click()); await w(3000);
const pv = await a.$(".pv iframe"); const fr = await pv.contentFrame();
const txt = await fr.evaluate(() => document.body.innerText);
ok(/GRAND TOTAL/.test(txt) && /Rent \/ transport/.test(txt) && /BALANCE PAYABLE/.test(txt), "preview shows Rent, Grand total, Advance, Balance payable");
ok(!/Accepted by client/.test(txt), "hidden Signatures block not printed");
ok(await fr.evaluate(() => { const h = [...document.querySelectorAll("h3")].map((x) => x.textContent); return h[0] === "Summary of cost"; }), "Summary printed first");
ok(/woodexinterior\.pk@gmail\.com/.test(txt) && /Thank you for your business/.test(txt), "footer strip contacts");
ok(await a.$eval(".pv-bar .muted", (e) => e.textContent).then((t) => /WI-10101-Quotation\.pdf/.test(t)), "file name shown: " + (await a.$eval(".pv-bar .muted", (e) => e.textContent)));
await a.screenshot({ path: OUT + "p18-a-preview.png" });
await fr.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await w(300); await a.screenshot({ path: OUT + "p18-a-preview-end.png" });
await a.click("[data-dl]"); for (let i = 0; i < 40 && !fs.readdirSync(DL).some((f) => f.endsWith(".pdf")); i++) await w(500);
const f = fs.readdirSync(DL); ok(f.includes("WI-10101(-Option-2)?-Quotation\.pdf"), "PDF downloaded: " + f.join(","));
if (f[0]) { const buf = fs.readFileSync(DL + "/" + f[0]); const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length; ok(buf.length > 20000 && pages >= 2, `PDF ${Math.round(buf.length / 1024)} KB, ${pages} pages`); }
ok(!errs.length, "no JS errors " + JSON.stringify(errs.slice(0, 3)));
await b.close();
