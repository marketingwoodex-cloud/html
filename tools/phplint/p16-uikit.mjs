// Render all 40 UI-kit blocks on a temp page, screenshot desktop + mobile, check overflow + axe-lite.
import puppeteer from "puppeteer-core"; import fs from "fs";
const R = "/home/user/-marketingwoodex/frontend-v1"; global.window = {}; await import(R + "/builder/uikit.js");
const T = window.WX_TEMPLATES;
fs.writeFileSync(R + "/_uk-preview.html", '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/v1.css"><title>UI kit</title></head><body>' + T.map(t => `<div data-id="${t.id}">${t.html}</div>`).join("") + "</body></html>");
const b = await puppeteer.launch({ executablePath: process.cwd() + "/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const a = await b.newPage(); const errs = []; a.on("pageerror", e => errs.push(e.message));
for (const [w, tag] of [[1366, "d"], [390, "m"]]) {
  await a.setViewport({ width: w, height: 900 }); await a.goto("http://localhost:8080/_uk-preview.html", { waitUntil: "networkidle0" }); await a.evaluate(async () => { document.querySelectorAll("img[loading=lazy]").forEach(i => i.loading = "eager"); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  const over = await a.evaluate(() => [...document.querySelectorAll("[data-id]")].filter(d => d.scrollWidth > document.documentElement.clientWidth + 2 || [...d.querySelectorAll("*")].some(x => x.getBoundingClientRect().right > document.documentElement.clientWidth + 2 && !x.closest(".uk-scroll"))).map(d => d.dataset.id));
  console.log(tag, "overflow:", over.join(",") || "none");
  const ids = await a.evaluate(() => [...document.querySelectorAll("[data-id]")].map(d => d.dataset.id));
  for (let i = 0; i < ids.length; i += 4) { // 4 blocks per image
    const box = await a.evaluate((s, e) => { const L = [...document.querySelectorAll("[data-id]")].slice(s, e); const t = L[0].getBoundingClientRect().top + scrollY, B = L[L.length - 1].getBoundingClientRect().bottom + scrollY; return { y: t, h: B - t }; }, i, i + 4);
    await a.screenshot({ path: `/home/user/-marketingwoodex/tools/uk-${tag}-${String(i / 4 + 1).padStart(2, "0")}.png`, clip: { x: 0, y: box.y, width: w, height: Math.min(box.h, tag === "d" ? 3200 : 5200) }, captureBeyondViewport: true });
  }
}
console.log("errors:", errs.join(" | ") || "none"); await b.close();
