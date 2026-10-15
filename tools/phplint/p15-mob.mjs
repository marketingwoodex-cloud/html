// P15 mobile audit: copy to ~/.cache/pb and run with LD_LIBRARY_PATH=$PWD/al/lib node p15-mob.mjs [width]
import puppeteer from "puppeteer-core"; import fs from "fs";
const list = fs.readFileSync("/tmp/pages.txt", "utf8").trim().split("\n");
const WIDTH = +process.argv[2] || 375;
const b = await puppeteer.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: WIDTH, height: 800, isMobile: true, hasTouch: true });
const agg = {};
for (const u of list) {
  await p.goto("http://localhost:8080" + u, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 300));
  const r = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    const sel = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className == "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : "");
    const vis = (e) => { const s = getComputedStyle(e); return s.display != "none" && s.visibility != "hidden" && e.offsetWidth > 0; };
    for (const e of document.querySelectorAll("body *")) {
      if (!vis(e)) continue; const R = e.getBoundingClientRect();
      if (R.right > W + 2 && R.width < W * 3) {
        let a = e.parentElement, clipped = false;
        while (a && a !== document.body) { if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX)) { clipped = true; break; } a = a.parentElement; }
        if (!clipped) out.push("OVERFLOW " + sel(e) + " < " + sel(e.parentElement));
      }
    }
    if (document.documentElement.scrollWidth > W + 1) out.push("PAGE-HSCROLL");
    for (const e of document.querySelectorAll("a[class*=btn],button,a[class*=button],a[class*=cta]")) {
      if (!vis(e)) continue; const s = getComputedStyle(e), lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
      const R = e.getBoundingClientRect();
      if (e.innerText.trim() && R.height > lh * 1.9 + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom)) out.push("WRAP-BTN " + sel(e));
      if (R.height < 30 && R.width < 30) out.push("SMALL-TAP " + sel(e));
    }
    for (const e of document.querySelectorAll("p,li,a,span,td,small")) if (vis(e) && e.innerText && e.innerText.trim().length > 3 && e.children.length == 0 && parseFloat(getComputedStyle(e).fontSize) < 11.5) out.push("TINY-TEXT " + sel(e));
    return [...new Set(out)];
  });
  for (const k of r) (agg[k] ||= []).push(u);
}
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].length - a[1].length)) console.log(v.length, k, "|", v.slice(0, 3).join(" "));
await b.close();
