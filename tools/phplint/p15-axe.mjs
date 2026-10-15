// axe audit on all pages (copy to ~/.cache/pb; needs ~/.cache/lh/node_modules/axe-core)
import puppeteer from "puppeteer-core"; import fs from "fs";
const axe = fs.readFileSync(process.env.HOME + "/.cache/lh/node_modules/axe-core/axe.min.js", "utf8");
const list = fs.readFileSync("/tmp/pages.txt", "utf8").trim().split("\n");
const b = await puppeteer.launch({ executablePath: process.env.HOME + "/.cache/pb/al/chromium", headless: "shell", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 412, height: 900, isMobile: true });
const agg = {};
for (const u of list) {
  await p.goto("http://localhost:8080" + u, { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(axe);
  const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map((x) => [x.id, x.nodes.map((n) => { const d = n.any.concat(n.all)[0]; const dd = d && d.data; return n.target.join(" ").split(" ").slice(-2).join(" ") + (dd && dd.fgColor ? ` [${dd.fgColor} on ${dd.bgColor} ${dd.contrastRatio}]` : ""); })]));
  for (const [id, nodes] of v) for (const n of nodes) { const k = id + " | " + n.replace(/:nth-child\(\d+\)/g, ""); (agg[k] ||= new Set()).add(u); }
}
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].size - a[1].size)) console.log(v.size, k, "|", [...v].slice(0, 2).join(" "));
await b.close();
