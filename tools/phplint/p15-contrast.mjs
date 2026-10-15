// Finds real colour-contrast failures on all pages (animations off) and prints CSS fixes.
import puppeteer from "puppeteer-core"; import fs from "fs";
const axe = fs.readFileSync(process.env.HOME + "/.cache/lh/node_modules/axe-core/axe.min.js", "utf8");
const list = fs.readFileSync("/tmp/pages.txt", "utf8").trim().split("\n");
const b = await puppeteer.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 412, height: 900, isMobile: true });
const rules = {};
for (const u of list) {
  await p.goto("http://localhost:8080" + u, { waitUntil: "load" });
  await p.addStyleTag({ content: "*,*:before,*:after{transition:none!important;animation:none!important}.wxr,[class*=reveal]{opacity:1!important;transform:none!important}" });
  await new Promise((r) => setTimeout(r, 300));
  await p.evaluate(axe);
  const out = await p.evaluate(async () => {
    const res = await axe.run(document, { runOnly: ["color-contrast"] });
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };
    const r = [];
    for (const v of res.violations) for (const n of v.nodes) {
      const el = document.querySelector(n.target[0]); if (!el) continue;
      const d = (n.any[0] || {}).data || {}; if (!d.bgColor) continue;
      if (el.closest(".footer-word")) continue;
      const cls = (e) => (typeof e.className == "string" && e.className.trim()) ? "." + e.className.trim().split(/\s+/).filter((c) => !/^(wxr|is-|reveal)/.test(c))[0] : "";
      const own = el.tagName.toLowerCase() + (cls(el) || "");
      const par = el.parentElement && cls(el.parentElement) ? cls(el.parentElement) + " > " : "";
      const bgEl = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c !== "rgba(0, 0, 0, 0)" && !/, 0\.0\d+\)$/.test(c)) return x; } return document.body; };
      const full = (e) => e.tagName.toLowerCase() + (typeof e.className == "string" ? e.className.trim().split(/\s+/).filter((c) => c && !/^(wxr|is-|reveal)|-reveal$/.test(c)).map((c) => "." + c).join("") : "");
      const host = bgEl(el), dark = lum(d.bgColor) < 128;
      const sel = (host === el.parentElement ? "" : full(host) + " ") + par + own;
      let ok = true;
      try { for (const m of document.querySelectorAll(sel)) { const c = getComputedStyle(bgEl(m)).backgroundColor.match(/\d+/g).map(Number); if (((c[0]*299+c[1]*587+c[2]*114)/1000 < 128) !== dark) ok = false; } } catch { ok = false; }
      if (ok) r.push([sel, dark ? "dark" : "light", d.contrastRatio]); else r.push(["SKIP " + sel, "skip", 0]);
    }
    return r;
  });
  for (const [s, t] of out) (rules[t] ||= new Set()).add(s);
}
await b.close();
const css = [];
if (rules.light) css.push([...rules.light].join(",\n") + "{color:#5c5c5c!important}");
if (rules.dark) css.push([...rules.dark].join(",\n") + "{color:rgba(255,255,255,.78)!important}");
fs.writeFileSync("/tmp/contrast.css", css.join("\n"));
if (rules.skip) console.log([...rules.skip].join("\n"));
console.log("light", rules.light?.size || 0, "dark", rules.dark?.size || 0);
