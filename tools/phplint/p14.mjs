import puppeteer from "puppeteer-core";
const B = "http://localhost:8080", OUT = "/home/user/-marketingwoodex/tools/", KW = "kitchen renovation cost Lahore";
const para = (n) => `Also, a ${KW} estimate depends on size, finishes and layout. For example, a small kitchen needs fewer cabinets, so the budget stays lower. However, premium stone adds cost. We share honest ranges first. Then we confirm after a site visit. See our [kitchen design](/kitchen-design/) page and the [cost estimator](/estimator/).`;
const art = (fix) => ({ title: "Kitchen renovation cost in Lahore: 2026 price guide", kicker: "Cost guide", dek: `What a ${KW} project really costs, with PKR ranges.`, seoTitle: fix ? "Kitchen Renovation Cost Lahore (2026 Guide) | Woodex" : "Prices", seoDesc: fix ? `See the real ${KW} in 2026: PKR ranges per size, what drives price and how to save. Book a free site visit today.` : "Prices for kitchens.", category: "Cost guide", readMin: 7,
  blocks: [{ t: "p", text: `The ${KW} in 2026 ranges from Rs 6 lakh to Rs 25 lakh. ` + para() }, { t: "table", rows: [["Scope", "Budget", "Mid-range", "Premium"], ["Cabinets", "Rs 3 lakh", "Rs 6 lakh", "Rs 12 lakh"], ["Counter", "Rs 1 lakh", "Rs 2.5 lakh", "Rs 5 lakh"]] },
    { t: "h", text: `What affects the ${KW}` }, { t: "list", items: ["**Size:** bigger rooms need more material.", "**Finishes:** acrylic costs more than laminate.", "**Appliances:** built-ins add cost."] }, { t: "p", text: para() },
    { t: "h", text: "Cost by size" }, { t: "table", rows: [["Size", "Approx. cost"], ["8 x 10 ft", "Rs 6–9 lakh"], ["10 x 12 ft", "Rs 9–14 lakh"]] }, { t: "p", text: para() },
    { t: "h", text: `How to save on ${KW}` }, { t: "list", items: ["Keep the plumbing where it is.", "Mix laminate and acrylic.", "Plan in 3D first."] }, { t: "p", text: para() + " " + para() },
    { t: "h", text: "An example budget" }, { t: "p", text: para() + " " + para() }, { t: "cta", title: "Get an exact quote", text: "Book a free site visit in Lahore.", label: "Book a site visit", href: "/contact/" },
    { t: "h", text: "Frequently asked questions" }, { t: "faq", items: [{ q: "How long does a kitchen renovation take?", a: "Usually 3 to 6 weeks." }, { q: "Do you give 3D views?", a: "Yes, before we build." }] }], summary: ["Budget Rs 6–25 lakh", "Finishes drive price", "3D first saves money"], faqs: [] });
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const errs = [], calls = []; const a = await b.newPage(); await a.setViewport({ width: 1366, height: 900 }); a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
await a.setRequestInterception(true);
a.on("request", async (r) => {
  if (r.url().endsWith("/api/admin.php") && r.method() === "POST") { let j = {}; try { j = JSON.parse(r.postData() || "{}"); } catch {}
    if (j.action === "ai_run" && (j.task === "article" || j.task === "fix")) { calls.push(j.task); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: JSON.stringify(art(j.task === "fix")) }) }); }
    if (j.action === "cms_list") { const res = await fetch(r.url(), { method: "POST", headers: r.headers(), body: r.postData() }); const x = await res.json(); x.aiReady = true; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(x) }); } }
  r.continue();
});
await a.goto(B + "/admin/", { waitUntil: "load" });
const st = await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "status" }) }).then((r) => r.json()));
if (st.needsSetup) { await a.evaluate(() => fetch("/api/admin.php", { method: "POST", body: JSON.stringify({ action: "setup", builderPassword: "Woodex@2026", name: "Owner", email: "o@woodex.pk", password: "Woodex@2026x" }) })); await a.reload({ waitUntil: "load" }); }
await a.waitForSelector("#l-email", { visible: true }); await a.type("#l-email", "o@woodex.pk"); await a.type("#l-pass", "Woodex@2026x"); await a.click("#l-btn"); await a.waitForSelector("#app:not([hidden])");
await a.evaluate(() => (location.hash = "#/post/new")); await a.waitForSelector("[data-tp]", { timeout: 15000 });
await a.screenshot({ path: OUT + "p14-templates.png" });
await a.$eval("#tp-ai", (e) => e.click()); await a.waitForSelector("#aw-go");
await a.type("#aw-t", "Kitchen renovation cost in Lahore"); await a.type("#aw-k", KW); await a.$eval("#aw-go", (e) => e.click());
await a.waitForFunction(() => document.querySelector("#modal").hidden, { timeout: 20000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 2000));
console.log("ai calls:", calls.join(" → "), "| title:", await a.$eval("#ce-title", (e) => e.value));
console.log("seo check:", await a.$eval("#ce-seo-r", (e) => (e.querySelector(".sx-h") || {}).textContent || "-"));
await a.screenshot({ path: OUT + "p14-editor.png" });
// add before/after photos + preview page render
await a.$eval("#ce-prev", (e) => e.click()); await a.waitForSelector(".pv iframe"); await new Promise((r) => setTimeout(r, 3000));
const html = await a.$eval(".pv iframe", (f) => f.srcdoc);
const fr = a.frames().find((f) => f !== a.mainFrame()); if (fr) { const el = await fr.$(".wx-tbl"); if (el) await el.scrollIntoView(); } await new Promise((r) => setTimeout(r, 800)); await a.screenshot({ path: OUT + "p14-preview.png" });
console.log("rendered:", ["wx-tbl", "wx-faq", "wx-cta"].map((c) => c + ":" + (html.split(c).length - 1)).join(" "), "len", html.length);
console.log("errors:", errs); await b.close();
