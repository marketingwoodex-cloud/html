// P16 3.9 — every public page at 390px and 1366px: JS errors, horizontal overflow, broken images, failed requests.
import puppeteer from "puppeteer-core"; import fs from "fs"; import path from "path";
const R = "/home/user/-marketingwoodex/frontend-v1", B = "http://localhost:8080";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const pages = walk(R).filter((f) => f.endsWith("index.html")).map((f) => "/" + path.relative(R, f).replace(/index\.html$/, "")).filter((u) => !/^\/(admin|builder|api|_)/.test(u)).sort();
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const issues = {}; const add = (u, m) => (issues[u] ||= new Set()).add(m);
for (const [W, H] of [[390, 844], [1366, 900]]) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: H }); let cur = "";
  p.on("pageerror", (e) => add(cur, W + " JSERR " + e.message.slice(0, 100)));
  p.on("requestfailed", (r) => { const u = r.url(); if (u.startsWith(B) && !/r404|chat\.php|forms\.php/.test(u)) add(cur, W + " REQFAIL " + u.replace(B, "")); });
  p.on("response", (r) => { const u = r.url(); if (u.startsWith(B) && r.status() >= 400 && !/r404/.test(u)) add(cur, W + " HTTP" + r.status() + " " + u.replace(B, "")); });
  for (const u of pages) { cur = u;
    await p.goto(B + u, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => add(u, W + " LOAD " + e.message.slice(0, 60)));
    const r = await p.evaluate(async () => { document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager")); await new Promise((x) => setTimeout(x, 400));
      const over = document.documentElement.scrollWidth - innerWidth; const wide = over > 1 ? [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 2).map((e) => e.tagName + "." + String(e.className).split(" ")[0]) : [];
      const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.replace(location.origin, "")).slice(0, 3);
      return { over, wide, broken }; });
    if (r.over > 1) add(u, W + " OVERFLOW " + r.over + "px " + r.wide.join(","));
    r.broken.forEach((s) => add(u, W + " BROKEN-IMG " + s));
  }
  await p.close();
}
console.log("pages:", pages.length, "× 2 widths; pages with issues:", Object.keys(issues).length);
for (const [u, s] of Object.entries(issues)) console.log(" ", u, "\n     " + [...s].slice(0, 6).join("\n     "));
await b.close();
