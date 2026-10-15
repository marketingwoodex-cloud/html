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
const call = (act, o = {}) => a.evaluate((act, o) => WXA.api(act, o), act, o);
const visitor = async (p) => { const r = await fetch(B + p); return [r.status, await r.text()]; }; // node fetch = no cookie
// ---- maintenance
await a.evaluate(() => (location.hash = "#/maintenance")); await w(2500);
ok((await a.$$(".mt-pg")).length === 4, "4 error pages listed");
const on = await call("mt_set", { on: true, mode: "maintenance" }); ok(on.ok && on.on, "maintenance ON");
let [s1, h1] = await visitor("/about/"); ok(s1 === 503 && /improving the website/.test(h1), "visitor gets 503 maintenance page (" + s1 + ")");
ok((await visitor("/assets/v1.css"))[0] === 200, "assets still load for visitors");
const staff = await a.evaluate(() => fetch("/about/").then((r) => r.status)); ok(staff === 200, "signed-in staff still see the site (" + staff + ")");
await call("mt_set", { on: true, mode: "soon" }); [s1, h1] = await visitor("/"); ok(s1 === 503 && /on its way/.test(h1), "coming-soon mode shows coming-soon page");
const fs = await import("node:fs"); const ht = fs.readFileSync("/home/user/-marketingwoodex/frontend-v1/.htaccess", "utf8");
ok(/ErrorDocument 503 \/coming-soon\.html/.test(ht) && /R=503,L/.test(ht) && /wx_mt=/.test(ht), ".htaccess has 503 rule + staff cookie bypass");
await a.reload(); await w(3000); await a.evaluate(() => (location.hash = "#/maintenance")); await w(2000);
ok(!!(await a.$("#mt-badge")), "orange 'Maintenance mode is ON' badge in admin");
await a.screenshot({ path: OUT + "p18-h-maint.png" });
await call("mt_set", { on: false }); ok((await visitor("/about/"))[0] === 200, "maintenance OFF → site live");
ok(!/R=503,L/.test(fs.readFileSync("/home/user/-marketingwoodex/frontend-v1/.htaccess", "utf8")), "503 rule removed from .htaccess");
// ---- files
await a.evaluate(() => (location.hash = "#/files")); await w(2000);
const ls = await call("fm_list", { dir: "assets" }); ok(ls.ok && ls.items.some((x) => x.name === "uploads") && ls.items.find((x) => x.name === "js").ro, "assets listed; js read-only");
ok(!(await call("fm_list", { dir: "api" })).ok && !(await call("fm_list", { dir: "assets/../api" })).ok, "can't leave /assets");
ok(!(await call("fm_upload", { dir: "assets/js", name: "x.png", data: "aGk=" })).ok, "upload to read-only folder refused");
ok(!(await call("fm_upload", { dir: "assets/uploads", name: "x.php", data: "aGk=" })).ok, ".php upload refused");
ok(!(await call("fm_upload", { dir: "assets/uploads", name: "x.svg", data: Buffer.from('<svg onload="alert(1)"></svg>').toString("base64") })).ok, "SVG with script refused");
await call("fm_mkdir", { dir: "assets/uploads", name: "qa-h" });
const up = await call("fm_upload", { dir: "assets/uploads/qa-h", name: "Test File.TXT", data: Buffer.from("hello").toString("base64") }); ok(up.ok && /test-file\.txt$/.test(up.path), "upload: " + up.path);
const rn = await call("fm_rename", { path: up.path, name: "renamed.exe" }); ok(rn.ok && /renamed\.txt$/.test(rn.path), "rename keeps extension: " + rn.path);
const dl0 = await call("fm_delete", { path: rn.path }); ok(dl0.ok, "delete → trash");
const tr = await call("fm_trash"); const it = tr.items.find((x) => x.path === rn.path); ok(!!it, "file in trash");
ok((await call("fm_restore", { id: it.id })).ok && fs.existsSync("/home/user/-marketingwoodex/frontend-v1/" + rn.path), "restore from trash");
await a.evaluate(() => WXA.route()); await w(1200); await a.evaluate(() => { const g = document.querySelector('[data-go="assets/uploads/qa-h"]'); if (g) g.click(); }); await w(1200);
await a.screenshot({ path: OUT + "p18-h-files.png" });
const z = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", headers: { "Content-Type": "application/json", "X-WX-ADM": WXA.S.token }, body: JSON.stringify({ action: "fm_zip", dir: "assets/uploads/qa-h" }) }).then((r) => r.json()));
ok(z.ok && z.zip64 && atob(z.zip64.slice(0, 4)).startsWith("PK"), "zip download");
await call("fm_delete", { path: rn.path }); fs.rmSync("/home/user/-marketingwoodex/frontend-v1/assets/uploads/qa-h", { recursive: true, force: true });
// ---- database
await a.evaluate(() => (location.hash = "#/database")); await w(2500);
const tb = await call("dbx_tables"); ok(tb.ok && tb.tables.some((t) => t.name === "wx_leads"), "tables: " + tb.tables.length);
const ut = tb.tables.find((t) => t.name === "wx_users"); if (ut) { const br = await call("dbx_browse", { table: "wx_users" }); const pw = Object.keys(br.rows[0]).find((k) => /pass|hash/i.test(k)); ok(!pw || br.rows[0][pw] === "••••••", "passwords masked (" + pw + ")"); }
const sr = await call("dbx_browse", { table: "wx_leads", q: "Ali" }); ok(sr.ok && sr.rows.every((r) => JSON.stringify(r).toLowerCase().includes("ali")), "search: " + sr.total + " rows");
ok(!(await call("dbx_browse", { table: "mysql.user" })).ok, "only wx_ tables");
const cs = await call("dbx_export", { table: "wx_leads", fmt: "csv" }); ok(cs.ok && /^\uFEFF?id,/.test(cs.content), "CSV export");
const sq = await call("dbx_export", { table: "*", fmt: "sql" }); ok(sq.ok && /INSERT INTO `wx_leads`/.test(sq.content), "SQL export all tables");
await a.evaluate(() => WXA.route()); await w(2000); await a.screenshot({ path: OUT + "p18-h-db.png" });
ok(!errs.length, "no JS errors " + errs.join(" | ")); await b.close();
