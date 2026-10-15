// P17 booking test: public widget → admin approve → clash / settings. cp to ~/.cache/pb
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
const call = (o) => a.evaluate((o) => fetch("/api/forms.php", { method: "POST", body: JSON.stringify(o) }).then((r) => r.json()), o);
const adm = (act, o) => a.evaluate((act, o) => window.WXA.api(act, o), act, o || {});
// reset settings + bookings for a clean run
await adm("bk_cfg_save", { cfg: { on: true, maxDay: 3, minHours: 12, blocked: [], days: [1, 2, 3, 4, 5, 6] } });
const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 }); p.on("pageerror", (e) => errs.push("pub: " + e.message.slice(0, 160)));
await p.goto(B + "/book-a-visit/", { waitUntil: "networkidle0" });
ok((await p.$$(".bkw-type")).length === 3, "3 booking types on the page");
await p.screenshot({ path: OUT + "bk-pub1.png" });
await p.click('.bkw-type[data-t="visit"]'); await w(1200);
const day = await p.evaluate(() => document.querySelector(".bkw-date[aria-selected=true]")?.dataset.d);
const nSlots = (await p.$$(".bkw-slot")).length; ok(day && nSlots > 0, "first open day " + day + " has " + nSlots + " slots");
const tm = await p.evaluate(() => { const s = document.querySelector(".bkw-slot"); s.click(); return s.dataset.tm; });
await p.screenshot({ path: OUT + "bk-pub2.png" });
await p.click("#bkw-n2"); await w(400);
await p.type("[name=name]", "Test Booker"); await p.type("[name=phone]", "03001234567"); await p.type("[name=address]", "House 12, DHA Phase 5");
await p.screenshot({ path: OUT + "bk-pub3.png" });
await p.click("#bkw-go"); await w(1500);
ok(await p.evaluate(() => !document.querySelector('[data-p="4"]').hidden), "success shown: " + (await p.evaluate(() => document.getElementById("bkw-dt").textContent)));
const s2 = await call({ action: "book_slots", type: "visit", date: day }); ok(!s2.slots.includes(tm), "booked slot no longer free");
const dup = await call({ action: "book_create", type: "visit", date: day, time: tm, name: "X Y", phone: "03001112223", address: "Somewhere 1" }); ok(!dup.ok && /taken/.test(dup.error), "double booking blocked");
// admin calendar
await a.evaluate(() => (location.hash = "#/bookings")); await w(2500);
const L = await adm("bk_list", {}); const bk = L.pending.find((x) => x.name === "Test Booker");
ok(bk && bk.lead_id > 0 && bk.status === "pending", "pending booking + lead created");
ok(await a.evaluate(() => document.querySelectorAll("#bk-pend [data-ok]").length >= 1 && document.querySelectorAll(".bk-chip").length >= 1), "calendar + approval queue render");
await a.screenshot({ path: OUT + "bk-adm1.png" });
await a.evaluate((id) => document.querySelector("#bk-pend [data-ok='" + id + "']").click(), bk.id); await w(1500);
const L2 = await adm("bk_list", {}); ok(L2.items.find((x) => x.id === bk.id).status === "confirmed", "confirm from queue");
const leads = await adm("leads_list", {}); const ld = leads.leads.find((l) => l.id === bk.lead_id); ok(ld && ld.source === "booking" && ld.stage === "visit", "lead source=booking stage=visit");
// team booking clash + force
const c1 = await adm("bk_save", { name: "Walk In", phone: "0300", type: "office", d: day, tm, dur: 60 }); ok(c1.clash, "team booking clash warned");
const c2 = await adm("bk_save", { name: "Walk In", phone: "0300", type: "office", d: day, tm, dur: 60, force: true }); ok(c2.ok, "force books anyway");
// week + list views, view modal
for (const v of ["week", "list"]) { await a.evaluate((v) => document.querySelector("#bk-v [data-v='" + v + "']").click(), v); await w(900); }
ok(await a.evaluate(() => document.querySelectorAll(".bk-row").length >= 2), "list view rows");
await a.evaluate(() => document.querySelector(".bk-row").click()); await w(500);
ok(await a.evaluate(() => /Edit \/ reschedule/.test(document.getElementById("modal-card").textContent)), "booking detail modal");
await a.evaluate(() => (document.getElementById("modal").hidden = true));
await a.evaluate(() => document.querySelector("#bk-v [data-v='month']").click()); await w(900);
// settings: block the day → public shows closed
await adm("bk_cfg_save", { cfg: { blocked: [day] } });
const cfg = await call({ action: "book_cfg" }); ok(cfg.days[day] === 0, "blocked date closed on website");
const s3 = await call({ action: "book_slots", type: "visit", date: day }); ok(s3.slots.length === 0, "no slots on blocked day");
await adm("bk_cfg_save", { cfg: { blocked: [] } });
await a.evaluate(() => document.getElementById("bk-set").click()); await w(500);
await a.screenshot({ path: OUT + "bk-adm2.png" });
await a.evaluate(() => (document.getElementById("modal").hidden = true));
// cleanup
for (const x of (await adm("bk_list", {})).items) if (/Test Booker|Walk In/.test(x.name)) await adm("bk_status", { id: x.id, status: "cancelled", notify: false });
ok(!errs.length, "no JS errors " + errs.join(" | "));
await b.close();
