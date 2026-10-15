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
await a.evaluate(() => (location.hash = "#/builder")); await w(4500);
const f = a.frames().find((x) => /\/builder\//.test(x.url())); f.on && 0;
const pe = []; a.frames().forEach(() => 0);
ok(await f.evaluate(() => !!document.querySelector("#p17-new") && !!window.__wx17), "buttons + module loaded");
await f.evaluate(async () => { const r = await window.__wx5.api("blocks_list"); for (const x of r.blocks) if (x.tags.includes("kitchen-page") || x.name === "Kitchen benefits + photo") await window.__wx5.api("blocks_delete", { id: x.id, force: true }); window.__wx5.renderMine(); }); await w(500);
const before = await f.evaluate(() => window.__wx5.api("blocks_list").then((r) => r.blocks.length));
// ---- designer
await f.click("#p17-new"); await w(600);
await f.type("#ds-n", "Kitchen benefits + photo"); await f.select("#ds-c", "Features"); await f.type("#ds-t", "kitchen, lahore");
await f.click(".p17-lay button[data-l='64']"); await f.select("#ds-bg", "wx-bg-light"); await f.select("[data-add='0']", "list"); await w(900);
await a.screenshot({ path: OUT + "c2-designer.png" });
await f.click("#ds-save"); await w(900);
let L = await f.evaluate(() => window.__wx5.api("blocks_list").then((r) => r.blocks));
const d = L.find((x) => x.name === "Kitchen benefits + photo");
ok(d && d.cat === "Features" && d.tags.join() === "kitchen,lahore" && /wx-bg-light/.test(d.html) && /grid-template-columns:3fr 2fr/.test(d.html) && /<img/.test(d.html), "designer saved section with category, tags, layout 3fr/2fr, image");
ok(await f.evaluate(() => [...document.querySelectorAll("#lib-mine button[data-id]")].some((b) => /Kitchen benefits/.test(b.textContent))), "appears in My sections immediately");
// ---- pick from a page
await f.click("#p17-pick"); await w(800);
const opt = await f.evaluate(() => { const o = [...document.querySelectorAll("#pk-page option")].find((o) => /kitchen-design/.test(o.value)); return o && o.value; });
ok(!!opt, "site pages listed in picker: " + opt);
await f.select("#pk-page", opt); await w(2500);
const pk = a.frames().find((x) => x.name() === "" && x.parentFrame() === f && x !== f && x.url() === "about:srcdoc" && 1);
const pf = await (await f.$("#pk-frame")).contentFrame();
const n = pf ? await pf.evaluate(() => document.querySelectorAll("[data-p17]").length) : 0; ok(n >= 3, "page sections detected: " + n);
await pf.evaluate(() => { const s = document.querySelectorAll("[data-p17]"); s[0].click(); s[2].click(); s[2].scrollIntoView(); }); await w(400);
await a.screenshot({ path: OUT + "c1-picker.png" });
ok((await f.evaluate(() => document.querySelector("#pk-n").textContent)) === "2 selected", "2 selected");
await f.click("#pk-next"); await w(1500);
await f.type("#rv-bt", "kitchen-page"); await f.evaluate(() => document.querySelector("#rv-bt").dispatchEvent(new Event("change")));
await f.evaluate(() => { const s = document.querySelector("#rv-bc"); s.value = "Hero"; s.dispatchEvent(new Event("change")); }); await w(1200);
await a.screenshot({ path: OUT + "c1-review.png" });
await f.click("#rv-lib"); await w(1000);
L = await f.evaluate(() => window.__wx5.api("blocks_list").then((r) => r.blocks));
const imp = L.filter((x) => x.tags.includes("kitchen-page"));
ok(imp.length === 2 && imp.every((x) => x.cat === "Hero" && x.tags.includes("from-kitchen-design") && !/data-p17|p17-on/.test(x.html)), "2 picked sections saved with bulk category + tags, picker markers stripped");
ok(L.length === before + 3, "library grew by 3");
// ---- filter
await f.select("#p17-mc", "Features"); await w(200);
const vis = await f.evaluate(() => [...document.querySelectorAll("#lib-mine button[data-id]")].filter((b) => !b.hidden).map((b) => b.textContent));
ok(vis.length >= 1 && vis.every((t) => /Kitchen benefits|./.test(t)) && vis.some((t) => /Kitchen benefits/.test(t)), "category filter → " + vis.length);
await f.select("#p17-mc", ""); await f.type("#p17-mq", "kitchen-page"); await w(200);
ok((await f.evaluate(() => [...document.querySelectorAll("#lib-mine button[data-id]")].filter((b) => !b.hidden).length)) === 2, "tag search finds the 2 imported");
// ---- import JSON with tags via paste
const res = await f.evaluate(() => { const r = window.__wx17.parseText(JSON.stringify({ blocks: [{ name: "X", cat: "FAQ", tags: ["a", "b"], html: "<section onclick='alert(1)'><h2>Hi</h2><script>x()</script></section>" }] })); return r; });
ok(res.list.length === 1 && res.list[0].tags.join() === "a,b" && res.list[0].cat === "FAQ" && !/onclick|script/.test(res.list[0].html) && res.removed === 2, "JSON import keeps cat/tags, strips 2 unsafe items");
// ---- external fetch guard
const g = await f.evaluate(() => window.__wx5.api("fetch_page", { url: "http://127.0.0.1/" })); ok(!g.ok, "fetch_page blocks non-https/local: " + g.error);
console.log("errors:", JSON.stringify(errs)); await b.close();
