// P18 C: responsive sizes + srcset, replace picture (any format → same address), upload auto-sizes, bulk
import pp from "puppeteer-core"; import fs from "fs";
const ROOT = "/home/user/-marketingwoodex/frontend-v1", w = (t) => new Promise((r) => setTimeout(r, t));
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const IMG = "/assets/img/img-5194dc486e09.webp", stem = IMG.replace(/\.webp$/, "");
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 1000 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("dialog", (d) => d.accept());
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(2500);
await a.evaluate(() => (location.hash = "#/media")); await w(3000);
ok(!!(await a.$("#md-rsall")) && !!(await a.$("option[value=nors]")), "Make responsive button + 'Not responsive yet' filter");
const open = async (u) => { await a.evaluate((u) => { const c = document.querySelector(`.md-card[data-u="${u}"] .md-th`) || document.querySelector(`[data-u="${u}"]`); c.scrollIntoView(); c.click(); }, u); await w(900); };
await a.evaluate(() => { const q = document.getElementById("md-q"); q.value = "img-5194dc486e09"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await w(600);
await open(IMG);
ok(!!(await a.$("#dt-mkrs")) && !!(await a.$("#dt-rep")), "detail has Make responsive + Replace picture");
await a.click("#dt-mkrs"); await w(5000);
const have = [480, 960, 1600].filter((x) => fs.existsSync(ROOT + stem + ".w" + x + ".webp")); ok(have.length >= 2, "WebP sizes written: " + have.join("/"));
const pages = fs.readFileSync(ROOT + "/index.html", "utf8").includes(stem + ".w480.webp") || [...fs.readdirSync(ROOT)].some((d) => { try { return fs.readFileSync(`${ROOT}/${d}/index.html`, "utf8").includes(stem + ".w480.webp 480w"); } catch { return false; } });
ok(pages, "srcset added on pages");
const tag = (() => { for (const d of fs.readdirSync(ROOT)) { try { const h = fs.readFileSync(`${ROOT}/${d}/index.html`, "utf8"); const m = h.match(new RegExp(`<img[^>]*src="${IMG}"[^>]*>`)); if (m && m[0].includes("srcset")) return m[0]; } catch {} } return ""; })();
ok(/data-wx-rs/.test(tag) && /sizes="/.test(tag) && (tag.match(/srcset=/g) || []).length === 1, "img tag: " + tag.slice(0, 170));
ok(/Responsive sizes/.test(await a.$eval("#dt-rs", (x) => x.textContent)), "detail shows sizes: " + (await a.$eval("#dt-rs", (x) => x.textContent)));
const cards = await a.$$eval(".md-rs", (L) => L.length); ok(cards >= 1, "RS badge on card");
// list must not show the .w480 copies as separate files
const li = await a.evaluate(async () => (await WXA.api("media_list")).files.filter((f) => /\.w\d+\.webp$/.test(f.url)).length); ok(li === 0, "variant files hidden from the library");
// remake is idempotent (one srcset)
await a.click("#dt-mkrs"); await w(5000);
const tag2 = (() => { for (const d of fs.readdirSync(ROOT)) { try { const m = fs.readFileSync(`${ROOT}/${d}/index.html`, "utf8").match(new RegExp(`<img[^>]*src="${IMG}"[^>]*>`)); if (m && m[0].includes("srcset")) return m[0]; } catch {} } return ""; })();
ok((tag2.match(/srcset=/g) || []).length === 1, "remake keeps a single srcset");
// replace with a PNG → stays .webp at the same address
const png = await a.evaluate(() => new Promise((r) => { const c = document.createElement("canvas"); c.width = 1200; c.height = 800; const g = c.getContext("2d"); g.fillStyle = "#b8956a"; g.fillRect(0, 0, 1200, 800); g.fillStyle = "#0c1628"; g.fillRect(100, 100, 400, 300); c.toBlob((bb) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(bb); }, "image/png"); }));
fs.writeFileSync("/tmp/rep.png", Buffer.from(png, "base64"));
const beforeSize = fs.statSync(ROOT + IMG).size;
const [fc] = await Promise.all([a.waitForFileChooser(), a.click("#dt-rep")]); await fc.accept(["/tmp/rep.png"]); await w(6000);
const nb = fs.readFileSync(ROOT + IMG); ok(nb.slice(8, 12).toString() === "WEBP" && nb.length !== beforeSize, "replaced: still WebP, same address, new content (" + beforeSize + " → " + nb.length + " B)");
ok(fs.existsSync(ROOT + stem + ".w960.webp") && fs.statSync(ROOT + stem + ".w960.webp").mtimeMs > Date.now() - 15000, "sizes regenerated after replace");
await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-media-detail.png" });
// bulk dialog
await a.evaluate(() => document.querySelector("[data-x]") && document.querySelector("[data-x]").click()); await w(1500);
await a.click("#md-rsall"); await w(800); const bl = await a.$$eval("#rs-l [data-i]", (L) => L.length); ok(bl >= 0 && bl < 60, "bulk list (old P15 copies count as responsive): " + bl + " used images not yet responsive");
// upload: auto sizes
const big = await a.evaluate(() => new Promise((r) => { const c = document.createElement("canvas"); c.width = 1800; c.height = 1200; const g = c.getContext("2d"); g.fillStyle = "#f4efe7"; g.fillRect(0, 0, 1800, 1200); c.toBlob((bb) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(bb); }, "image/jpeg", 0.9); }));
fs.writeFileSync("/tmp/p18-upload-test.jpg", Buffer.from(big, "base64"));
await a.evaluate(() => document.querySelector("[data-x]").click()); await w(800);
const up = await a.$("#md-up"); await up.uploadFile("/tmp/p18-upload-test.jpg"); await w(7000);
const L = await a.evaluate(async () => (await WXA.api("media_list")).files.filter((f) => /p18-upload-test/.test(f.name)));
ok(L.length === 1 && L[0].sizes.length === 3, "upload made " + (L[0] || {}).sizes + " sizes for " + (L[0] || {}).name);
if (L[0]) await a.evaluate((u) => WXA.api("media_trash", { urls: [u] }), L[0].url); await w(500);
ok(L[0] && ![480, 960, 1600].some((x) => fs.existsSync(ROOT + L[0].url.replace(/\.[a-z]+$/, "") + ".w" + x + ".webp")), "trash removes the size copies too");
ok(!errs.length, "no JS errors " + errs.join("|")); await b.close();
