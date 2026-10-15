// P17 C9 media library e2e. cp to ~/.cache/pb, run: LD_LIBRARY_PATH=$PWD/al/lib node p17-c9.mjs
import pp from "puppeteer-core";
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 1000 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms)), S = "/home/user/-marketingwoodex/tools/shot-c9-", ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const API = (o) => fetch("http://127.0.0.1:8080/api/admin.php", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
const st = await API({ action: "status" }); if (st.needsSetup) await API({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" });
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await W(2500); }
// seed: one unused upload from an existing site image
const up = await a.evaluate(async () => { const bl = await (await fetch("/assets/img/img-00e6912a64f2-480.webp")).blob(); const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(bl); });
  await WXA.api("media_folder", { name: "kitchens" }); return WXA.api("media_upload", { data: b64, name: "test-kitchen.webp", folder: "" }); });
ok(up.ok, "seed upload");
await a.evaluate(() => (location.hash = "#/media")); await W(3500);
ok(await a.$$eval(".md-stat", (x) => x.length === 5), "5 stat cards"); await a.screenshot({ path: S + "1grid.png" });
await a.click('#md-st [data-f="unused"]'); await W(500); const nUn = await a.$$eval("#md-g .md-card", (x) => x.length); ok(nUn >= 1, "unused filter via stat card (" + nUn + ")");
await a.click('#md-vw [data-v="list"]'); await W(700); ok(!!(await a.$("table.md-tbl")), "list view"); await a.screenshot({ path: S + "2list.png" });
await a.select("#md-ty", "webp"); await a.select("#md-so", "big"); await W(400);
// select the uploaded test file & move
await a.evaluate((u) => { const r = document.querySelector('#md-g [data-u="' + u + '"] .md-chk'); r.click(); }, up.url); await W(300);
await a.click("#md-bmv"); await W(500); await a.select("#mv-to", "kitchens"); await a.click("#mv-go"); await W(1500);
const L = await a.evaluate(() => WXA.api("media_list")); const moved = L.files.find((f) => f.folder === "kitchens" && /test-kitchen/.test(f.name)); ok(!!moved, "moved to folder");
const blk = await a.evaluate(() => WXA.api("media_move", { urls: ["/assets/img/img-00e6912a64f2-480.webp"], folder: "kitchens" })); ok(blk.ok && blk.blocked.length === 1, "site/used image not moved");
// crop
await a.click('#md-vw [data-v="grid"]'); await a.select("#md-flt", "all"); await a.select("#md-ty", ""); await W(500);
await a.evaluate((u) => document.querySelector('#md-g [data-u="' + u + '"] .md-th').click(), moved.url); await W(1200);
await a.click("#dt-crop"); await W(1500); await a.click('#cr-r [data-i="3"]'); await W(300); await a.$eval("#cr-w", (i) => { i.value = 300; i.dispatchEvent(new Event("input")); });
await a.screenshot({ path: S + "3crop.png" });
await a.click("#cr-go"); await W(2500);
const L2 = await a.evaluate(() => WXA.api("media_list")); const cr = L2.files.find((f) => /test-kitchen.*300w/.test(f.name)); ok(!!cr && cr.folder === "kitchens", "cropped copy saved in same folder");
const dim = await a.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), cr && cr.url); ok(dim[0] === 300 && dim[1] === 300, "crop 1:1 @300px → " + dim);
console.log("errors:", JSON.stringify(errs.slice(0, 5))); await b.close();
