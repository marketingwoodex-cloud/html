// P15: per-page critical CSS. Inlines rules the page actually uses as <style id="wx-crit">,
// loads site.css + v1.css non-blocking (preload/onload + noscript). Re-runnable (idempotent).
// Run (server on :8080): node tools/p15-critcss.mjs [page-path ...]
import fs from "fs"; import path from "path"; import { createRequire } from "module";
const req = createRequire(process.env.HOME + "/.cache/pb/");
const puppeteer = req("puppeteer-core");
const ROOT = path.resolve("frontend-v1"), BASE = "http://localhost:8080";
const ASYNC = ["/assets/site.css", "/assets/v1.css"];

function pages() {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (d === ROOT && ["admin", "builder", "_private", "api"].includes(f)) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".html")) out.push("/" + path.relative(ROOT, p).replace(/index\.html$/, ""));
    }
  })(ROOT);
  return out.filter((u) => fs.readFileSync(path.join(ROOT, u.endsWith("/") || u === "/" ? u + "index.html" : u), "utf8").includes('/assets/site.css'));
}

function extract() { // runs in page
  const STATE = /::?(hover|focus|focus-visible|focus-within|active|visited|before|after|placeholder|marker|selection|first-letter|first-line|-webkit-[a-z-]+|-moz-[a-z-]+|backdrop|file-selector-button)\b(\([^)]*\))?/g;
  const used = (sel) => sel.split(",").some((s) => {
    s = s.replace(STATE, "").trim() || "*";
    try { return !!document.querySelector(s); } catch { return true; }
  });
  const walk = (rules) => {
    let css = "", h1w = "";
    for (const r of rules) {
      if (r instanceof CSSStyleRule) { if (used(r.selectorText)) css += r.cssText; }
      else if (r instanceof CSSMediaRule) { const i = walk(r.cssRules); if (i) css += `@media ${r.conditionText}{${i}}`; }
      else if (r instanceof CSSSupportsRule) { const i = walk(r.cssRules); if (i) css += `@supports ${r.conditionText}{${i}}`; }
      else if (r instanceof CSSFontFaceRule) { if (!/dm-sans/.test(r.cssText) && /-(400|500|600|700)\.woff2/.test(r.cssText)) css += r.cssText; }
      else if (r instanceof CSSKeyframesRule) css += r.cssText;
      else if (r.cssRules) { const i = walk(r.cssRules); if (i) css += r.cssText.split("{")[0] + "{" + i + "}"; }
    }
    return css;
  };
  const want = ["/assets/site.css", "/assets/v1.css"];
  return want.map((h) => { const s = [...document.styleSheets].find((x) => x.href && new URL(x.href).pathname === h); return s ? walk(s.cssRules) : ""; }).join("");
}

function rewrite(html, crit, h1w) {
  html = html.replace(/<link rel="preload" href="[^"]+" as="font" type="font\/woff2" crossorigin data-wx-h1font \/>\n?/g, "");
  if (h1w && h1w !== "400") html = html.replace(/(<link rel="preload" href="\/assets\/fonts\/[^"]+" as="font"[^>]*>)/, `$1\n<link rel="preload" href="/assets/fonts/plus-jakarta-sans-${h1w}.woff2" as="font" type="font/woff2" crossorigin data-wx-h1font />`);
  html = html.replace(/<style id="wx-crit">[\s\S]*?<\/style>\n?/, "");
  html = html.replace(/<noscript><link rel="stylesheet" href="([^"]+)"( \/)?><\/noscript>\n?/g, "");
  html = html.replace(/<link rel="preload" href="([^"]+)" as="style" onload="[^"]*"( \/)?>/g, '<link rel="stylesheet" href="$1" />');
  html = html.replace('href="/assets/fonts/dm-sans-400.woff2"', 'href="/assets/fonts/plus-jakarta-sans-400.woff2"');
  const first = html.indexOf('<link rel="stylesheet" href="/assets/site.css"');
  if (first < 0) throw new Error("no site.css link");
  html = html.slice(0, first) + `<style id="wx-crit">${crit.replace(/<\/style/gi, "<\\/style")}</style>\n` + html.slice(first);
  for (const h of ASYNC) html = html.replace(new RegExp(`<link rel="stylesheet" href="${h}"\\s*/?>`),
    `<link rel="preload" href="${h}" as="style" onload="this.onload=null;this.rel='stylesheet'" /><noscript><link rel="stylesheet" href="${h}" /></noscript>`);
  return html;
}

const list = process.argv.slice(2).length ? process.argv.slice(2) : pages();
const browser = await puppeteer.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const page = await browser.newPage();
let total = 0;
for (const u of list) {
  const file = path.join(ROOT, u.endsWith("/") ? u + "index.html" : u);
  // measure on the un-optimised version so all stylesheets are loaded normally
  const src = rewrite(fs.readFileSync(file, "utf8"), "").replace(/<style id="wx-crit"><\/style>\n/, "");
  const undo = src.replace(/<link rel="preload" href="([^"]+)" as="style" onload="[^"]*" \/><noscript>.*?<\/noscript>/g, '<link rel="stylesheet" href="$1" />');
  fs.writeFileSync(file, undo);
  let css = "", h1w = "";
  for (const vp of [{ width: 412, height: 900 }, { width: 1366, height: 900 }]) {
    await page.setViewport(vp);
    await page.goto(BASE + u, { waitUntil: "load", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 300));
    const c = await page.evaluate(extract);
    if (c.length > css.length) css = c;
    h1w = h1w || await page.evaluate(() => { const h = document.querySelector("h1"); if (!h) return ""; const w = getComputedStyle(h).fontWeight; return ["500","600","700"].includes(w) ? w : ""; });
  }
  fs.writeFileSync(file, rewrite(undo, css, h1w));
  total += css.length;
  console.log(u, Math.round(css.length / 1024) + "KB");
}
await browser.close();
console.log("avg", Math.round(total / list.length / 1024) + "KB");
