// P17 C7 linked FAQ groups e2e. cp to ~/.cache/pb, run: LD_LIBRARY_PATH=$PWD/al/lib node p17-c7.mjs
import pp from "puppeteer-core";
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms)), S = "/home/user/-marketingwoodex/tools/shot-c7-", ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await W(2500); }
const ids = await a.evaluate(async () => { const g = await WXA.api("cms_save", { type: "faq", title: "Renovation FAQ", status: "published", data: { items: [{ q: "How long does renovation take?", a: "6-10 weeks." }, { q: "Do you give warranty?", a: "Yes, 1 year." }] } });
  const p = await WXA.api("cms_save", { type: "post", title: "Linked FAQ test article", slug: "linked-faq-test-" + Date.now() % 1e5, status: "draft", data: { dek: "Test", hero: { src: "/assets/img/img-00e6912a64f2-480.webp", alt: "Office" }, blocks: [{ t: "h", text: "Intro" }, { t: "p", text: "Hello world text for the page." }], faqs: [], summary: [], meta: [] }, seo: { title: "Linked FAQ test", desc: "Testing linked groups" } });
  return { g: g.item.id, p: p.item.id, slug: p.item.slug }; });
await a.evaluate((id) => (location.hash = "#/post/" + id), ids.p); await W(3000);
await a.select("#ce-fg", "L" + ids.g); await W(500);
ok(await a.$eval("#ce-fg-link", (e) => /Linked to/.test(e.textContent)), "linked banner shown");
await a.$eval("#ce-fg-link", (e) => e.scrollIntoView({ block: "center" })); await a.screenshot({ path: S + "1editor.png" });
await a.evaluate(() => { const bt = [...document.querySelectorAll("button")].find((x) => /^\s*publish/i.test(x.textContent)); bt.click(); }); await W(5000);
const U = "http://127.0.0.1:8080/insights/" + ids.slug + "/";
let h = await (await fetch(U)).text(); ok(/How long does renovation take/.test(h), "published page has group FAQs");
await a.evaluate(() => (location.hash = "#/faqs")); await W(2500);
ok(await a.$eval("#fg-l", (e) => /Used on 1 page/.test(e.textContent)), "used-on list");
await a.screenshot({ path: S + "2groups.png" });
await a.evaluate((id) => document.querySelector('.fg[data-id="' + id + '"] [data-ed]').click(), ids.g); await W(800);
await a.evaluate(() => { document.querySelector("#fg-rows .fq [data-k=q]").value = "How many weeks does a renovation take?"; }); await a.click("#fg-go"); await W(5000);
h = await (await fetch(U)).text(); ok(/How many weeks does a renovation take/.test(h) && !/How long does renovation take/.test(h), "live page synced after group edit");
await a.evaluate((id) => document.querySelector('.fg[data-id="' + id + '"] [data-dup]').click(), ids.g); await W(1500);
ok(await a.$eval("#fg-l", (e) => /Renovation FAQ \(copy\)/.test(e.textContent)), "duplicate");
console.log("errors:", JSON.stringify(errs.slice(0, 5))); await b.close();
