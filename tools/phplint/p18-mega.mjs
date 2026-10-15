// P18 B: mega menu readable in every colour setup
import pp from "puppeteer-core";
const w = (t) => new Promise((r) => setTimeout(r, t));
const ok = (x, m) => { console.log((x ? "PASS " : "FAIL ") + m); if (!x) process.exitCode = 1; };
const b = await pp.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", args: ["--no-sandbox"], headless: "shell", defaultViewport: { width: 1440, height: 1000 } });
const a = await b.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message));
await a.goto("http://127.0.0.1:8080/admin/", { waitUntil: "networkidle0" });
await a.type("input[type=email]", "o@woodex.pk"); await a.type("input[type=password]", "Woodex@2026x"); await a.keyboard.press("Enter"); await w(2500);
const cases = [["white text, auto", { hText: "#ffffff" }], ["navy bar, auto", { hBg: "#0c1628", hText: "#ffffff" }], ["light", { hText: "#ffffff", mStyle: "light" }], ["dark", { mStyle: "dark" }], ["custom", { mStyle: "custom", mBg: "#f4efe7", mText: "#3a2a1a" }]];
await a.evaluate(() => (location.hash = "#/global")); await w(2500);
const css = await a.evaluate((C) => C.map(([n, g]) => window.WXA.__wxChrome.designCss(window.WXA.__wxChrome.dfix(g))), cases);
const p = await b.newPage(); await p.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle0" });
for (let i = 0; i < cases.length; i++) {
  const r = await p.evaluate((c) => {
    let s = document.getElementById("t-css"); if (!s) { s = document.createElement("style"); s.id = "t-css"; document.head.appendChild(s); } s.textContent = c;
    const m = document.querySelector(".mega-menu"); m.style.display = "grid"; m.style.opacity = 1; m.style.visibility = "visible";
    return new Promise((res) => setTimeout(() => {
    const rgb = (x) => x.match(/[\d.]+/g).slice(0, 3).map(Number), L = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    let el = m, bg = "rgba(0, 0, 0, 0)"; while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    const out = [...m.querySelectorAll(".mega-title, .mega-column a:not(.mega-title)")].slice(0, 3).map((x) => { const A = L(rgb(getComputedStyle(x).color)), B = L(rgb(bg)); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); });
    res({ bg, min: Math.min(...out) }); }, 700));
  }, css[i]);
  ok(r.min >= 4.5, `${cases[i][0]}: panel ${r.bg}, worst contrast ${r.min.toFixed(1)}:1`);
}
await a.evaluate(() => (location.hash = "#/global")); await w(2000);
const tab = await a.$$eval("button, a", (L) => { const t = L.find((x) => /^\s*Design\s*$/.test(x.textContent)); t && t.click(); return !!t; }); await w(800);
ok(tab && !!(await a.$("[data-p='design.mStyle']")), "Design tab has mega-menu style");
await a.select("[data-p='design.mStyle']", "custom"); await w(600);
ok(!!(await a.$("[data-p='design.mBg']")) && !!(await a.$("[data-p='design.mText']")), "Custom shows background + text pickers");
ok(/:1/.test(await a.$eval("#hf-mratio", (x) => x.textContent)), "contrast readout: " + (await a.$eval("#hf-mratio", (x) => x.textContent)));
await a.screenshot({ path: "/home/user/-marketingwoodex/tools/p18-mega-ui.png", fullPage: true });
ok(!errs.length, "no JS errors " + errs.join("|")); await b.close();
