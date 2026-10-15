// P17 admin screenshots. cp to ~/.cache/pb and run: LD_LIBRARY_PATH=$PWD/al/lib node p17-shot.mjs <tag> "#/route|file" ...
import pp from "puppeteer-core";
const [tag, ...routes] = process.argv.slice(2);
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 950 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message)); a.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
if (await a.$("input[type=password]")) { await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await new Promise((r) => setTimeout(r, 1800)); }
for (const r of routes) { const [h, w] = r.split("@"); if (w) await a.setViewport({ width: +w, height: 900 }); await a.evaluate((h) => (location.hash = h), h); await new Promise((r) => setTimeout(r, 1500));
  const f = `/home/user/-marketingwoodex/tools/shot-${tag}-${h.replace(/\W+/g, "")}${w || ""}.png`; await a.screenshot({ path: f }); console.log(f); }
console.log("errors:", JSON.stringify(errs.slice(0, 8))); await b.close();
