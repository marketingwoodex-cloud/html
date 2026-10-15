// P15: image optimiser for frontend-v1.
// 1) jpg/png -> webp (originals kept in assets/img/_orig/)
// 2) creates -480 / -960 webp variants for wide images
// 3) rewrites <img> in public html: webp src, srcset/sizes, width/height, lazy (except first/hero)
// Run: NODE_PATH=~/.cache/sh/node_modules node tools/p15-images.mjs
import fs from "fs"; import path from "path"; import { createRequire } from "module";
const sharp = createRequire(process.env.HOME + "/.cache/sh/")("sharp");
sharp.cache(false);
const ROOT = path.resolve("frontend-v1"), IMG = path.join(ROOT, "assets/img"), ORIG = path.join(IMG, "_orig");
fs.mkdirSync(ORIG, { recursive: true });
const WIDTHS = [480, 960];
const meta = {};           // "/assets/img/x.webp" -> {w,h,variants:[[url,w]]}
const renamed = {};        // old url -> new url

for (const f of fs.readdirSync(IMG)) {
  const p = path.join(IMG, f), ext = path.extname(f).toLowerCase();
  if (!fs.statSync(p).isFile() || ![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;
  if (/-(480|960)\.webp$/.test(f)) continue;
  let base = f.slice(0, -ext.length), webp = path.join(IMG, base + ".webp");
  if (ext !== ".webp") {
    if (!fs.existsSync(path.join(ORIG, f))) fs.copyFileSync(p, path.join(ORIG, f));
    const im = sharp(p); const m = await im.metadata();
    const w = Math.min(m.width, 1920);
    await sharp(p).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(webp + ".tmp");
    fs.renameSync(webp + ".tmp", webp);
    renamed["/assets/img/" + f] = "/assets/img/" + base + ".webp";
  } else if ((await sharp(p).metadata()).width > 1920) {
    if (!fs.existsSync(path.join(ORIG, f))) fs.copyFileSync(p, path.join(ORIG, f));
    const buf = await sharp(path.join(ORIG, f)).resize({ width: 1920 }).webp({ quality: 78 }).toBuffer();
    fs.writeFileSync(p, buf);
  }
  const m = await sharp(webp).metadata();
  const variants = [];
  for (const w of WIDTHS) if (m.width > w * 1.2) {
    const out = path.join(IMG, `${base}-${w}.webp`);
    if (!fs.existsSync(out)) await sharp(webp).resize({ width: w }).webp({ quality: 72 }).toFile(out);
    variants.push([`/assets/img/${base}-${w}.webp`, w]);
  }
  meta["/assets/img/" + base + ".webp"] = { w: m.width, h: m.height, variants };
}

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (["admin", "builder", "_private", "api", "node_modules"].includes(f) && d === ROOT) continue;
    if (fs.statSync(p).isDirectory()) walk(p, out); else if (f.endsWith(".html")) out.push(p);
  }
  return out;
}
const attr = (t, a) => (t.match(new RegExp(`\\s${a}="([^"]*)"`)) || [])[1];
const setA = (t, a, v) => attr(t, a) !== undefined ? t.replace(new RegExp(`\\s${a}="[^"]*"`), ` ${a}="${v}"`) : t.replace(/^<img/, `<img ${a}="${v}"`);
let pages = 0, tags = 0;
for (const file of walk(ROOT)) {
  let html = fs.readFileSync(file, "utf8"), orig = html, n = 0;
  for (const [o, nw] of Object.entries(renamed)) html = html.split(o).join(nw);
  html = html.replace(/<img\b[^>]*>/g, (t) => {
    n++;
    const src = attr(t, "src"); const m = meta[src]; if (!m) return t;
    if (m.variants.length) {
      t = setA(t, "srcset", [...m.variants.map(([u, w]) => `${u} ${w}w`), `${src} ${m.w}w`].join(", "));
      const hero = /fetchpriority="high"/.test(t) || /hm-slide|hero/.test(t);
      if (!attr(t, "sizes")) t = setA(t, "sizes", hero ? "100vw" : "(max-width: 768px) 100vw, 50vw");
    }
    if (!attr(t, "width")) { t = setA(t, "width", m.w); t = setA(t, "height", m.h); }
    const eager = /fetchpriority="high"/.test(t) || /loading="eager"/.test(t);
    if (!eager && n > 1 && !/loading=/.test(t)) t = t.replace(/^<img/, '<img loading="lazy" decoding="async"');
    tags++; return t;
  });
  if (html !== orig) { fs.writeFileSync(file, html); pages++; }
}
// css / json / js references to renamed files
for (const f of ["assets/site.css", "assets/v1.css", "_private/content.json", "assets/site.js"]) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, "utf8"), o = s;
  for (const [a, b] of Object.entries(renamed)) s = s.split(a).join(b);
  if (s !== o) fs.writeFileSync(p, s);
}
console.log("converted", Object.keys(renamed).length, "pages", pages, "imgs", tags);
