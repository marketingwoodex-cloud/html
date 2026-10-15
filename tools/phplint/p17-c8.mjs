// P17 C8 testimonials designs e2e. cp to ~/.cache/pb, run: LD_LIBRARY_PATH=$PWD/al/lib node p17-c8.mjs
import pp from "puppeteer-core";
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 1000 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms)), S = "/home/user/-marketingwoodex/tools/shot-c8-", ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const API = (o) => fetch("http://127.0.0.1:8080/api/admin.php", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
const st = await API({ action: "status" }); if (st.needsSetup) await API({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" });
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await W(2500); }
await a.evaluate(async () => { const L = (await WXA.api("cms_list", { type: "testimonial" })).items || []; if (L.length >= 4) return;
  const T = [["Usman Tariq", "Admin Manager, Packages Mall", "Retail fit-out", "Lahore", 5, "Woodex delivered our 6,000 sft retail floor in seven weeks, on budget and with zero snags at handover. The site team was always reachable."], ["Dr Sana Malik", "Owner", "Dental clinic interior", "Gulberg", 5, "They understood clinic hygiene rules better than we did. Patients now compliment the reception every single day."], ["Kamran Shah", "Procurement, Haier", "Office furniture", "Model Town", 4, "Clear quotation, honest timeline, solid workstations."], ["Ali Raza", "Home owner", "Full home renovation", "DHA Phase 6", 5, "From 3D design to the last light fitting, everything matched the render. Highly recommended."]];
  let o = 1; for (const t of T) await WXA.api("cms_save", { type: "testimonial", title: t[0], status: "published", order: o++, data: { role: t[1], project: t[2], city: t[3], rating: t[4], text: t[5] } }); });
await a.evaluate(() => (location.hash = "#/testimonials")); await W(2500);
ok(await a.$eval("#sx-grid", (e) => /DHA Phase 6/.test(e.textContent)), "city shown on card");
await a.click("#sx-pl"); await W(1500);
ok(!!(await a.$("#pl-pv")), "design picker + preview");
for (const d of ["cards", "spotlight", "slider", "wall", "band"]) { await a.evaluate((d) => { const r = document.querySelector('[name=pl-d][value="' + d + '"]'); r.checked = true; r.dispatchEvent(new Event("change")); }, d); await W(1200);
  const cls = await a.$eval("#pl-pv", (f) => (f.contentDocument.querySelector("section.wx-tst") || {}).className); ok(cls && cls.includes("wx-tst--" + d), "preview " + d);
  if (d === "spotlight" || d === "band") { const el = await a.$(".tst-pick"); await el.screenshot({ path: S + "pick-" + d + ".png" }); } }
// pick 2 pages: home default (band), about override wall
await a.evaluate(() => { const set = (p, on) => { const c = document.querySelector('.pl-l input[value="' + p + '"]'); if (c) c.checked = on; return !!c; }; set("index.html", true); set("about/index.html", true); const s = document.querySelector('.pl-pd[data-p="about/index.html"]'); if (s) s.value = "wall"; });
await a.click("#pl-go"); await W(6000);
const home = await (await fetch("http://127.0.0.1:8080/")).text(), about = await (await fetch("http://127.0.0.1:8080/about/")).text();
ok(/wx-tst--band/.test(home) && /DHA Phase 6/.test(home), "home uses default design (band)"); ok(/wx-tst--wall/.test(about), "about uses per-page override (wall)");
await a.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle0" }); const sec = await a.$("section.wx-tst"); if (sec) { await sec.scrollIntoView(); await W(600); await sec.screenshot({ path: S + "live-band.png" }); }
await a.setViewport({ width: 390, height: 900 }); await a.goto("http://127.0.0.1:8080/about/", { waitUntil: "networkidle0" }); const s2 = await a.$("section.wx-tst"); if (s2) { await s2.scrollIntoView(); await W(600); await s2.screenshot({ path: S + "live-wall-mob.png" }); }
console.log("errors:", JSON.stringify(errs.slice(0, 5))); await b.close();
