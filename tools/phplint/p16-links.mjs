// P16 3.9 — static public-site audit: every internal href/src resolves; basic SEO tags per page.
import fs from "fs"; import path from "path";
const R = path.resolve("frontend-v1"), skip = /^(admin|builder|api|_private|assets\/vendor)\//;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const pages = walk(R).filter((f) => f.endsWith(".html")).map((f) => path.relative(R, f)).filter((r) => !skip.test(r) && !r.startsWith("_"));
const red = JSON.parse(fs.readFileSync(R + "/api/redirect-plan.json", "utf8"));
const bad = {}, seo = []; let links = 0;
const exists = (u) => { u = decodeURIComponent(u.split(/[?#]/)[0]); if (!u || u === "/") return true; const p = path.join(R, u);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return true; if (fs.existsSync(path.join(p, "index.html"))) return true;
  return u.startsWith("/api/"); };
for (const rel of pages) {
  const h = fs.readFileSync(path.join(R, rel), "utf8"), dir = "/" + path.dirname(rel).replace(/^\.$/, "") + "/";
  for (const m of h.matchAll(/\s(?:href|src|srcset|data-src)="([^"]+)"/g)) {
    for (let u of m[1].split(",").map((s) => s.trim().split(/\s+/)[0])) {
      if (!u || /^(https?:|mailto:|tel:|#|data:|javascript:|whatsapp:|sms:)/i.test(u) || u.includes("{")) { if (/^https?:\/\/(www\.)?woodex\.com\.pk/i.test(u)) u = u.replace(/^https?:\/\/(www\.)?woodex\.com\.pk/i, ""); else continue; }
      if (!u.startsWith("/")) u = path.posix.normalize(dir.replace(/\/+/g, "/") + u);
      links++; if (!exists(u)) (bad[u] ||= []).push(rel);
    }
  }
  if (rel === "404.html") continue;
  const miss = []; if (!/<title>[^<]{5,}/.test(h)) miss.push("title"); if (!/name="description" content="[^"]{20,}/.test(h)) miss.push("description");
  if (!/rel="canonical"/.test(h)) miss.push("canonical"); if ((h.match(/<h1[\s>]/g) || []).length !== 1) miss.push("h1×" + (h.match(/<h1[\s>]/g) || []).length);
  if (/<img(?![^>]*\balt=)[^>]*>/.test(h)) miss.push("img-no-alt"); if (miss.length) seo.push(rel + ": " + miss.join(","));
}
const sm = fs.readFileSync(R + "/sitemap.xml", "utf8"), locs = [...sm.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);
const smBad = locs.filter((u) => !exists(u)), smRed = locs.filter((u) => red.some((r) => r.from.toLowerCase() === (u.endsWith("/") ? u : u + "/").toLowerCase()));
console.log("pages:", pages.length, "links checked:", links, "broken targets:", Object.keys(bad).length);
for (const [u, f] of Object.entries(bad).slice(0, 40)) console.log("  BROKEN", u, "←", f.slice(0, 3).join(" "), f.length > 3 ? "+" + (f.length - 3) : "");
console.log("sitemap URLs:", locs.length, "missing:", smBad.join(" ") || "none", "| redirected-in-sitemap:", smRed.join(" ") || "none");
console.log("SEO issues:", seo.length); seo.slice(0, 30).forEach((s) => console.log("  " + s));
