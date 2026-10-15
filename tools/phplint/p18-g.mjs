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
await a.evaluate(() => (location.hash = "#/wauto")); await w(2500);
ok(!!(await a.$("#wg-tabs")), "WhatsApp automation screen opens");
// template
const t = await call("wag_tpl_save", { label: "Eid offer", name: "eid_offer_2026", lang: "en", cat: "marketing", body: "Assalam o Alaikum {{1}}, Woodex Interior has an Eid offer for {{2}}.", params: ["{name}", "{city}"] });
ok(t.ok && t.tpl.params.length === 2, "template saved with 2 variables");
ok(!(await call("wag_tpl_save", { name: "Bad Name!", body: "x" })).ok, "bad Meta name rejected");
const u = await call("wag_tpl_save", { label: "Visit reminder", name: "visit_reminder", lang: "en", cat: "utility", body: "Hi {{1}}, reminder: site visit on {{2}} at {{3}}.", params: ["{name}", "{date}", "{time}"] });
// audience
const all = await call("wag_audience", { filter: {} }); ok(all.ok && all.count > 0, "audience: everyone = " + all.count);
const ld = await call("wag_audience", { filter: { who: "leads", stages: ["new"] } }); ok(ld.ok && ld.count <= all.count, "filter leads/new = " + ld.count);
const sg = await call("wag_seg_save", { name: "All contacts", filter: {} }); ok(sg.ok, "segment saved");
// campaign: send now (simulated in preview)
const c = await call("wag_camp_save", { name: "Eid test", tpl: t.tpl.id, params: ["{name}", "{city}"], filter: {}, when: "" });
ok(c.ok && c.camp.stats.sent > 0, "campaign sent: " + (c.camp ? JSON.stringify(c.camp.stats) : c.error));
// webhook: delivered + read + reply + STOP
const g = await call("wag_camp_get", { id: c.camp.id }); const R = g.camp.rcp.filter((x) => x.s === "sent");
const sx = (id, s) => ({ id, status: s });
await call("wag_sim", { payload: { entry: [{ changes: [{ value: { statuses: [sx(R[0].w, "delivered"), sx(R[0].w, "read")].concat(R[1] ? [sx(R[1].w, "delivered")] : []), messages: [{ from: R[0].p, text: { body: "Yes please, price?" } }].concat(R[1] ? [{ from: R[1].p, text: { body: "STOP" } }] : []) } }] }] } });
const g2 = await call("wag_camp_get", { id: c.camp.id });
ok(g2.camp.stats.replied === 1 && g2.camp.stats.read >= 1 && g2.camp.stats.delivered >= (R[1] ? 2 : 1), "report: " + JSON.stringify(g2.camp.stats));
if (R[1]) { const L = await call("wag_optout_list"); ok(L.list.some((x) => x.phone === "+" + R[1].p), "STOP added to opt-outs");
  const a2 = await call("wag_audience", { filter: {} }); ok(a2.count === all.count - 1 && a2.optedOut === 1, "opted-out excluded from audience"); }
// scheduled + cancel
const s2 = await call("wag_camp_save", { name: "Later", tpl: t.tpl.id, filter: { who: "leads" }, when: "2030-01-01T10:00" }); ok(s2.ok && s2.camp.status === "scheduled", "campaign scheduled");
ok((await call("wag_camp_action", { id: s2.camp.id, do: "cancel" })).ok, "scheduled campaign cancelled");
// flows: welcome on → new enquiry gets a message
const fl = await call("wag_flows_save", { flows: { welcome: { on: true, tpl: t.tpl.id, params: ["{name}", "{city}"] }, booking: { on: true, tpl: u.tpl.id } } }); ok(fl.ok, "auto flows saved");
await a.evaluate(() => fetch("/api/forms.php", { method: "POST", body: JSON.stringify({ form: "contact", name: "Flow Test " + Date.now(), phone: "0333" + String(Date.now()).slice(-7), message: "hi", page: "/contact/" }) }).then((r) => r.json()));
const tk = await call("wag_tick"); const G = await call("wag_get"); ok(G.flows.welcome.sent >= 1, "welcome flow sent to the new enquiry (sent " + G.flows.welcome.sent + ")");
const tk2 = await call("wag_tick"); ok(tk2.flows === 0, "welcome not sent twice");
ok(!(await call("wag_tpl_delete", { id: t.tpl.id })).ok, "can't delete a template used by an active flow");
// UI tabs
await a.evaluate(() => WXA.route()); await w(2000);
await a.screenshot({ path: OUT + "p18-g-camps.png" });
await a.click('#wg-tabs [data-t="flows"]'); await w(500); ok((await a.$$(".wg-flow")).length === 4, "4 auto flows listed"); await a.screenshot({ path: OUT + "p18-g-flows.png" });
await a.click('#wg-tabs [data-t="aud"]'); await w(1200); ok(/\d/.test(await a.$eval("#sgf-cnt", (x) => x.textContent)), "audience builder live count");
await a.click('#wg-tabs [data-t="tpl"]'); await w(400); await a.click('#wg-tabs [data-t="set"]'); await w(800); ok(/wa-cron\.php\?key=/.test(await a.$eval("#wg-body", (x) => x.textContent)), "cron command shown");
await a.click("#wg-new"); await w(1500); ok(!!(await a.$("#cg-pv .wg-bub")), "campaign dialog with preview"); await a.screenshot({ path: OUT + "p18-g-new.png" });
await a.click("#cg-c"); await a.click('#wg-tabs [data-t="camps"]'); await w(500); await a.click("[data-c]"); await w(1200); await a.screenshot({ path: OUT + "p18-g-detail.png" });
ok(!errs.length, "no JS errors " + errs.join(" | ")); await b.close();
