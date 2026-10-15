// Local PREVIEW server for frontend-v1 (NOT deployed — Hostinger uses api/builder.php).
// Zero dependencies: starts instantly. Implements the same JSON API as
// frontend-v1/api/builder.php so /builder/ works identically in the preview.
//   run: node tools/frontend-v1-server.mjs      (PORT=8080, WX_DEV_PASSWORD=Woodex@2026)
import http from "node:http";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAdmin } from "./frontend-v1-admin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend-v1");
const PRIV = path.join(ROOT, "_private");
const BACKUPS = path.join(PRIV, "backups");
const UPLOADS = path.join(ROOT, "assets/uploads");
const PORT = +process.env.PORT || 8080;
const DEV_CFG = path.join(PRIV, "dev-password.txt");
fs.mkdirSync(BACKUPS, { recursive: true });
let PASSWORD = process.env.WX_DEV_PASSWORD || (fs.existsSync(DEV_CFG) ? fs.readFileSync(DEV_CFG, "utf8").trim() : "") || "Woodex@2026";
const secret = () => crypto.createHash("sha256").update("wx-dev|" + PASSWORD).digest("hex");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };

// ---------------------------------------------------------------- auth
const makeToken = () => { const exp = String(Math.floor(Date.now() / 1000) + 12 * 3600); return exp + "." + crypto.createHmac("sha256", secret()).update("wx|" + exp).digest("hex"); };
function loggedIn(req) {
  // Once Woodex Admin is installed, only admin-issued tokens (exp.uid.sid.hmac, bound to a live admin session) are accepted.
  const t = String(req.headers["x-wx-csrf"] || "");
  if (adminApi.installed()) return adminApi.builderOk(t);
  const m = /^(\d{10})\.([a-f0-9]{64})$/.exec(t); // legacy builder-password token (before admin setup only)
  if (!m || +m[1] < Date.now() / 1000) return false;
  const good = crypto.createHmac("sha256", secret()).update("wx|" + m[1]).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(m[2]));
}
const tokenUid = (req) => { const m = /^\d{10}\.(\d+)\./.exec(String(req.headers["x-wx-csrf"] || "")); return m ? +m[1] : null; };
const safeEq = (a, b) => { const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const tries = new Map();
const adminApi = createAdmin({ ROOT, secret, builderPassword: () => PASSWORD });

// ---------------------------------------------------------------- helpers
class Fail extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }
function pagePath(rel) {
  rel = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (!/^[a-z0-9][a-z0-9/_\-.]*\.html$/i.test(rel) || rel.includes("..")) throw new Fail("Invalid page path");
  if (/^(_private|builder|admin|api|assets)\//.test(rel)) throw new Fail("That file cannot be edited");
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Fail("Page not found", 404);
  return { rel, abs };
}
const backupDir = (rel) => path.join(BACKUPS, rel.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_"));
const stamp = () => { const d = new Date(), p = (n, l = 2) => String(n).padStart(l, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}.html`; };
const mtime = (f) => Math.floor(fs.statSync(f).mtimeMs / 1000);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function listPages() {
  const pages = walk(ROOT).filter((f) => f.endsWith(".html")).map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
    .filter((r) => !/^(_private|builder|admin|api|assets)\//.test(r)).map((rel) => {
      const head = fs.readFileSync(path.join(ROOT, rel), "utf8").slice(0, 4000);
      const t = (/<title>([\s\S]*?)<\/title>/i.exec(head) || [])[1] || rel;
      return { path: rel, mtime: mtime(path.join(ROOT, rel)), url: "/" + rel.replace(/index\.html$/, ""), title: t.trim().replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') };
    });
  return pages.sort((a, b) => (a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)));
}
function imageSize(buf) {
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString("ascii", 0, 3) === "GIF") return { ext: "gif", w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const k = buf.toString("ascii", 12, 16);
    if (k === "VP8X") return { ext: "webp", w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (k === "VP8 ") return { ext: "webp", w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (k === "VP8L") { const b = buf.readUInt32LE(21); return { ext: "webp", w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { ext: "jpg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}
function parseMultipart(buf, ctype) {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ctype); if (!b) return {};
  const boundary = Buffer.from("--" + (b[1] || b[2])), out = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length); if (next === -1) break;
    const part = buf.subarray(pos + boundary.length + 2, next - 2);
    const sep = part.indexOf("\r\n\r\n");
    if (sep > 0) {
      const head = part.subarray(0, sep).toString(), body = part.subarray(sep + 4);
      const name = (/name="([^"]*)"/.exec(head) || [])[1], filename = (/filename="([^"]*)"/.exec(head) || [])[1];
      if (name) out[name] = filename !== undefined ? { filename, data: body } : body.toString();
    }
    pos = next;
  }
  return out;
}


// ---------------------------------------------------------------- A3: global sections
const BLOCK_CATS = ["Hero", "Services", "Features", "Projects", "Testimonials", "CTA", "FAQ", "Contact", "Content", "Process", "Stats", "Pricing", "Team", "Gallery", "Footer", "Custom"];
/** outer range of every element carrying data-wx-global="id" (balanced by tag name) */
function globalRanges(h, id) {
  const out = [], re = new RegExp('<([a-z][a-z0-9-]*)\\b[^>]*\\bdata-wx-global="' + id.replace(/[^a-f0-9]/g, "") + '"[^>]*>', "gi"); let m;
  while ((m = re.exec(h))) {
    const tag = m[1].toLowerCase(), tr = new RegExp("<(/?)" + tag + "\\b[^>]*>", "gi"); tr.lastIndex = m.index + m[0].length; let depth = 1, t;
    while (depth && (t = tr.exec(h))) depth += t[1] ? -1 : /\/>$/.test(t[0]) ? 0 : 1;
    if (depth) break; out.push([m.index, tr.lastIndex]); re.lastIndex = tr.lastIndex;
  }
  return out;
}
function replaceGlobal(h, id, html) { for (const [a, b] of globalRanges(h, id).reverse()) h = h.slice(0, a) + html + h.slice(b); return h; }
function blockUsage(id) { return listPages().filter((p) => globalRanges(fs.readFileSync(path.join(ROOT, p.path), "utf8"), id).length).map((p) => p.path); }
function detachGlobal(id) {
  for (const p of blockUsage(id)) { const abs = path.join(ROOT, p); fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").split(' data-wx-global="' + id + '"').join("")); }
}

// ---------------------------------------------------------------- API (mirrors builder.php)
const THEME_ALLOWED = { "--wx-wood": "color", "--wx-cream": "color", "--wx-preset": "name", "--wx-h1": "len", "--wx-h2": "len", "--wx-h3": "len", "--wx-c1": "color", "--wx-c2": "color", "--wx-c3": "color", "--wx-c4": "color", "--wx-navy": "color", "--wx-ink": "color", "--wx-muted": "color", "--wx-paper": "color", "--wx-surface": "color", "--wx-beige": "color", "--wx-accent": "color",
  "--wx-font": "font", "--wx-font-head": "font", "--wx-section": "len", "--wx-container": "len", "--wx-btn-radius": "len", "--wx-r-lg": "len", "--wx-base-size": "len" };
const FONTS = { dm: '"DM Sans",system-ui,sans-serif', system: 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: "ui-monospace,Consolas,monospace" };

async function api(req, body) {
  const ct = String(req.headers["content-type"] || "");
  const inp = ct.startsWith("multipart/form-data") ? parseMultipart(body, ct) : (() => { try { return JSON.parse(body.toString() || "{}"); } catch { return {}; } })();
  const action = String(inp.action || "status");
  const need = () => { if (!loggedIn(req)) throw new Fail("Not signed in", 401); };
  const ip = req.socket.remoteAddress;
  // P39 Phase 2: Manager builder changes wait for the Master
  if (action === "appr_apply" || (loggedIn(req) && adminApi.installed())) { if (action === "appr_apply") need(); const ar = await adminApi.builderAppr(req, inp, (x) => api(req, Buffer.from(JSON.stringify(x)))); if (ar) return ar; }

  switch (action) {
    case "status": return { ok: true, loggedIn: loggedIn(req), needsSetup: false, adminOnly: adminApi.installed() };
    case "setup": throw new Fail("Already set up", 403);
    case "login": {
      if (adminApi.installed()) throw new Fail("Sign in through Woodex Admin (/admin/) to edit pages", 403);
      const t = tries.get(ip) || { n: 0, t: 0 };
      if (t.n >= 8 && Date.now() - t.t < 600000) throw new Fail("Too many attempts — wait 10 minutes", 429);
      if (!safeEq(inp.password || "", PASSWORD)) { tries.set(ip, { n: t.n + 1, t: Date.now() }); await new Promise((r) => setTimeout(r, 400)); throw new Fail("Wrong password", 401); }
      tries.delete(ip); return { ok: true, csrf: makeToken() };
    }
    case "logout": return { ok: true };
    case "password": {
      if (adminApi.installed()) throw new Fail("Change your password in Woodex Admin → Profile", 403);
      need();
      if (!safeEq(inp.current || "", PASSWORD)) throw new Fail("Current password is wrong", 401);
      if (String(inp.next || "").length < 8) throw new Fail("New password must be at least 8 characters");
      PASSWORD = String(inp.next); fs.writeFileSync(DEV_CFG, PASSWORD, { mode: 0o600 });
      return { ok: true, csrf: makeToken() };
    }
    case "pages": need(); return { ok: true, pages: listPages() };
    case "load": { need(); const { abs } = pagePath(inp.path); return { ok: true, html: fs.readFileSync(abs, "utf8"), mtime: mtime(abs) }; }
    case "save": {
      need(); const { rel, abs } = pagePath(inp.path); const html = String(inp.html || "");
      if (html.length > 3 * 1024 * 1024 || !/<html/i.test(html) || !/<\/html>/i.test(html)) throw new Fail("Invalid page HTML");
      if (/<[^>]+\s(contenteditable|data-wx-ed)[\s=>]/i.test(html)) throw new Fail("Editor markup detected — save aborted to protect the page");
      if (inp.mtime && +inp.mtime < mtime(abs) && !inp.force) throw new Fail("This page was changed elsewhere since you opened it. Reload, or save again to overwrite.", 409);
      const bd = backupDir(rel); fs.mkdirSync(bd, { recursive: true }); fs.copyFileSync(abs, path.join(bd, stamp()));
      const old = fs.readdirSync(bd).filter((f) => f.endsWith(".html")).sort(); while (old.length > 30) fs.unlinkSync(path.join(bd, old.shift()));
      fs.writeFileSync(abs, html); return { ok: true, mtime: mtime(abs) };
    }
    case "backups": {
      need(); const { rel } = pagePath(inp.path); const bd = backupDir(rel);
      const files = fs.existsSync(bd) ? fs.readdirSync(bd).filter((f) => f.endsWith(".html")).sort().reverse() : [];
      return { ok: true, backups: files.map((f) => ({ file: f, size: fs.statSync(path.join(bd, f)).size })) };
    }
    case "backup_get": {
      need(); const { rel } = pagePath(inp.path); const file = path.basename(String(inp.file || ""));
      if (!/^\d{8}-\d{6}(-\d{3})?\.html$/.test(file)) throw new Fail("Invalid backup");
      const src = path.join(backupDir(rel), file); if (!fs.existsSync(src)) throw new Fail("Backup not found", 404);
      return { ok: true, html: fs.readFileSync(src, "utf8") };
    }
    case "restore": {
      need(); const { rel, abs } = pagePath(inp.path); const file = path.basename(String(inp.file || ""));
      if (!/^\d{8}-\d{6}(-\d{3})?\.html$/.test(file)) throw new Fail("Invalid backup");
      const src = path.join(backupDir(rel), file); if (!fs.existsSync(src)) throw new Fail("Backup not found", 404);
      const content = fs.readFileSync(src); fs.copyFileSync(abs, path.join(backupDir(rel), stamp())); fs.writeFileSync(abs, content);
      return { ok: true, mtime: mtime(abs) };
    }
    case "media": {
      need();
      const pick = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(webp|jpe?g|png|gif|svg)$/i.test(f)).map((f) => "/" + path.relative(ROOT, path.join(d, f)).split(path.sep).join("/")) : []);
      return { ok: true, media: [...pick(path.join(ROOT, "assets/img")), ...pick(UPLOADS)].reverse() };
    }
    case "media_usage": case "media_delete": {
      need(); const url = String(inp.url || "");
      const used = listPages().filter((pg) => fs.readFileSync(path.join(ROOT, pg.path), "utf8").includes(url.replace(/^\//, ""))).map((pg) => pg.url);
      if (action === "media_usage") return { ok: true, used };
      if (!/^\/assets\/uploads\/[a-z0-9-]+\.(jpe?g|png|webp|gif)$/i.test(url)) throw new Fail("Only uploaded images can be deleted");
      if (used.length && !inp.force) return { ok: false, error: "Image is used on: " + used.join(", "), used, status: 409 };
      const abs = path.join(UPLOADS, path.basename(url)); if (fs.existsSync(abs)) fs.unlinkSync(abs); return { ok: true };
    }
    case "fetch_page": {
      need(); let u; try { u = new URL(String(inp.url || "")); } catch { throw new Fail("Paste a public https:// page link"); }
      if (u.protocol !== "https:" || /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname)) throw new Fail("Paste a public https:// page link");
      let r; try { r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (WoodexBuilder section picker)", accept: "text/html" }, signal: AbortSignal.timeout(20000) }); } catch { throw new Fail("Could not open that page"); }
      if (r.status >= 300 && r.status < 400) throw new Fail("That link redirects; open it in your browser and paste the final address");
      const html = await r.text(); if (html.length > 3 * 1024 * 1024) throw new Fail("That page is larger than 3 MB"); if (!/<(html|body|section|div)[\s>]/i.test(html)) throw new Fail("That link is not an HTML page");
      return { ok: true, html, url: u.href };
    }
    case "import_url": {
      need(); let u; try { u = new URL(String(inp.url || "")); } catch { throw new Fail("Invalid URL"); }
      if (u.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|169\.254\.)/.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) throw new Fail("Only public https image links are allowed");
      const r = await fetch(u, { redirect: "follow" }).catch(() => null); if (!r || !r.ok) throw new Fail("Could not download that image");
      const data = Buffer.from(await r.arrayBuffer()); if (data.length > 8 * 1024 * 1024) throw new Fail("Image is larger than 8 MB");
      const info = imageSize(data); if (!info) throw new Fail("That link is not a JPG, PNG, WebP or GIF image");
      fs.mkdirSync(UPLOADS, { recursive: true });
      const base = (String(inp.name || "stock").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stock").slice(0, 40);
      const name = `${base}-${crypto.randomBytes(3).toString("hex")}.${info.ext}`; fs.writeFileSync(path.join(UPLOADS, name), data);
      return { ok: true, url: "/assets/uploads/" + name, width: info.w, height: info.h };
    }
    case "upload": {
      need(); const f = inp.file;
      if (!f || !f.data || !f.data.length) throw new Fail("Upload failed");
      if (f.data.length > 8 * 1024 * 1024) throw new Fail("Image is larger than 8 MB");
      const info = imageSize(f.data); if (!info) throw new Fail("Only JPG, PNG, WebP or GIF images are allowed");
      fs.mkdirSync(UPLOADS, { recursive: true });
      const base = (path.parse(f.filename).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "image").slice(0, 40);
      const name = `${base}-${crypto.randomBytes(3).toString("hex")}.${info.ext}`;
      fs.writeFileSync(path.join(UPLOADS, name), f.data);
      return { ok: true, url: "/assets/uploads/" + name, width: info.w, height: info.h };
    }
    case "theme": {
      need(); const vars = inp.vars || {}, lines = [], saved = {}, imports = new Set(); let faces = "";
      const LOCAL = { jakarta: ["Plus Jakarta Sans", "plus-jakarta-sans", "sans-serif"], inter: ["Inter", "inter", "sans-serif"], manrope: ["Manrope", "manrope", "sans-serif"], poppins: ["Poppins", "poppins", "sans-serif"], playfair: ["Playfair Display", "playfair-display", "serif"], cormorant: ["Cormorant Garamond", "cormorant-garamond", "serif"] };
      for (const [k, type] of Object.entries(THEME_ALLOWED)) {
        if (vars[k] == null) continue; let v = String(vars[k]).trim();
        if (type === "color" && !/^#[0-9a-f]{3,8}$/i.test(v)) throw new Fail("Invalid colour for " + k);
        if (type === "name") { if (!/^[a-z0-9-]{1,30}$/.test(v)) throw new Fail("Invalid preset"); saved[k] = v; continue; }
        if (type === "len" && !/^\d{1,4}(\.\d+)?(px|rem|em|%)$/.test(v)) throw new Fail("Invalid size for " + k);
        saved[k] = v; if (type === "font") { const g = /^g:([A-Za-z0-9 ]{2,40}):([0-9;]{0,40})$/.exec(v); if (g) { imports.add(g[1].trim().replace(/ /g, "+") + (g[2] ? ":wght@" + g[2] : "")); v = '"' + g[1].trim() + '",system-ui,sans-serif'; } else if (LOCAL[v]) { const L = LOCAL[v]; if (v !== "jakarta" && !faces.includes(L[1])) for (const w of [400, 500, 600, 700]) faces += `@font-face{font-family:"${L[0]}";src:url("/assets/fonts/${L[1]}-${w}.woff2") format("woff2");font-weight:${w};font-display:swap}\n`; v = `"${L[0]}",system-ui,${L[2]}`; } else if (!FONTS[v]) throw new Fail("Invalid font for " + k); else v = FONTS[v]; }
        lines.push(`  ${k}:${v};`);
      }
      const head = imports.size ? `@import url("https://fonts.googleapis.com/css2?${[...imports].map((f) => "family=" + f).join("&")}&display=swap");\n` : "";
      const hs = ["h1", "h2", "h3"].filter((h) => saved["--wx-" + h]).map((h) => `main ${h}{font-size:var(--wx-${h})!important}`).join("\n");
      const css = head + `/* Woodex theme — generated by the Live Page Builder on ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Edit via /builder/ → Theme. */\n:root{\n${lines.join("\n")}\n}\n` +
        ":root{--navy:var(--wx-navy);--navy-2:var(--wx-navy);--ink:var(--wx-ink);--muted:var(--wx-muted)}\n" + (saved["--wx-wood"] ? ":root{--wood:var(--wx-wood);--wood-2:var(--wx-wood)}\n" : "") + (saved["--wx-cream"] ? ":root{--cream:var(--wx-cream);--surface:var(--wx-cream);--beige:var(--wx-cream);--wx-surface:var(--wx-cream);--wx-beige:var(--wx-cream)}\n" : "") + "html{font-size:var(--wx-base-size,16px)}\nbody,button,input,select,textarea{font-family:var(--wx-font)!important}\nmain h1,main h2,main h3{font-family:var(--wx-font-head,var(--wx-font))}\n";
      const tf = path.join(ROOT, "assets/theme.css"); if (fs.existsSync(tf)) fs.copyFileSync(tf, path.join(BACKUPS, "theme-" + stamp().replace(".html", ".css")));
      fs.writeFileSync(tf, faces + css + (hs ? hs + "\n" : "")); fs.writeFileSync(path.join(PRIV, "theme.json"), JSON.stringify(saved, null, 2));
      return { ok: true };
    }
    case "page_new": {
      need(); const folder = String(inp.folder || "").replace(/^\/+|\/+$/g, ""), slug = String(inp.slug || ""), html = String(inp.html || "");
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) throw new Fail("Page address: use lowercase letters, numbers and dashes only");
      if (folder && (!/^[a-z0-9][a-z0-9\-/]{0,79}$/.test(folder) || folder.includes(".."))) throw new Fail("Invalid folder");
      const rel = (folder ? folder + "/" : "") + slug + "/index.html";
      if (/^(_private|builder|admin|api|assets)\//.test(rel)) throw new Fail("That folder is reserved");
      if (html.length > 3 * 1024 * 1024 || !/<html/i.test(html) || !/<\/html>/i.test(html)) throw new Fail("Invalid page HTML");
      if (/<[^>]+\s(contenteditable|data-wx-ed)[\s=>]/i.test(html)) throw new Fail("Editor markup detected");
      const abs = path.join(ROOT, rel); if (fs.existsSync(abs)) throw new Fail("A page already exists at that address");
      fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, html); return { ok: true, path: rel };
    }
    case "blocks_list": { need(); const f = path.join(PRIV, "blocks.json"); return { ok: true, blocks: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [] }; }
    case "blocks_save": case "blocks_delete": case "blocks_import": {
      need(); const f = path.join(PRIV, "blocks.json"); let list = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
      const clean = (b, old) => {
        const name = String(b.name ?? (old && old.name) ?? "").trim().slice(0, 60), html = String(b.html ?? (old && old.html) ?? "");
        if (!name || !html || html.length > 200 * 1024) throw new Fail("Block needs a name and HTML (max 200 KB)");
        if (/<script|\son[a-z]+\s*=|javascript:/i.test(html)) throw new Fail("Scripts are not allowed in blocks");
        const cat = BLOCK_CATS.includes(b.cat) ? b.cat : (old && old.cat) || "Custom";
        const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags ?? (old ? (old.tags || []).join(",") : "")).split(",")).map((t) => String(t).trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 12);
        const global = b.global !== undefined ? !!b.global : !!(old && old.global);
        if (global && (/^\s*<!--/.test(html) || !/^\s*<[a-z]/i.test(html))) throw new Fail("A global section must be a single element (convert it first)");
        return { id: old ? old.id : crypto.randomBytes(6).toString("hex"), name, kind: (b.kind || (old && old.kind)) === "element" ? "element" : "section", cat, tags, global, html, t: old ? old.t : Date.now(), updated: Date.now() };
      };
      if (action === "blocks_delete") {
        const id = String(inp.id), used = blockUsage(id);
        if (used.length && !inp.force) return { ok: false, error: "This global section is used on " + used.length + " page(s)", used };
        if (used.length) detachGlobal(id);
        list = list.filter((b) => b.id !== id);
      } else if (action === "blocks_import") {
        const add = (Array.isArray(inp.blocks) ? inp.blocks : []).slice(0, 200);
        if (list.length + add.length > 200) throw new Fail("Library full (200 blocks)");
        for (const b of add) list.push(clean(Object.assign({}, b, { id: undefined })));
      } else {
        const old = inp.id ? list.find((b) => b.id === String(inp.id)) : null;
        if (inp.id && !old) throw new Fail("Block not found", 404);
        if (!old && list.length >= 200) throw new Fail("Library full (200 blocks)");
        const b = clean(inp, old); if (old) list[list.indexOf(old)] = b; else list.push(b);
      }
      fs.writeFileSync(f, JSON.stringify(list)); return { ok: true, blocks: list };
    }
    case "blocks_usage": { need(); const f = path.join(PRIV, "blocks.json"), list = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [], u = {}; list.filter((b) => b.global).forEach((b) => (u[b.id] = blockUsage(b.id))); return { ok: true, usage: u }; }
    case "blocks_sync": {
      need(); const f = path.join(PRIV, "blocks.json"), list = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
      const b = list.find((x) => x.id === String(inp.id)); if (!b || !b.global) throw new Fail("Global section not found", 404);
      const html = b.html.trim().replace(/^<([a-z][a-z0-9-]*)/i, (m, t) => "<" + t + ' data-wx-global="' + b.id + '"');
      let n = 0;
      for (const p of listPages()) {
        const abs = path.join(ROOT, p.path), o = fs.readFileSync(abs, "utf8"), h = replaceGlobal(o, b.id, html);
        if (h !== o) { const bd = backupDir(p.path); fs.mkdirSync(bd, { recursive: true }); fs.copyFileSync(abs, path.join(bd, stamp())); fs.writeFileSync(abs, h); n++; }
      }
      return { ok: true, changed: n };
    }
    case "theme_get": { need(); const f = path.join(PRIV, "theme.json"); return { ok: true, vars: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {} }; }
    default: throw new Fail("Unknown action");
  }
}

// ---------------------------------------------------------------- HTTP
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    if (p.includes("..") || /^\/_private(\/|$)/.test(p)) { res.writeHead(403); return res.end("Forbidden"); }

    if (p === "/api/builder.php") {
      const chunks = []; for await (const c of req) chunks.push(c);
      let status = 200, out;
      try {
        out = await api(req, Buffer.concat(chunks));
        // activity line for Woodex Admin (same format as builder.php act())
        let inp = {}; try { inp = JSON.parse(Buffer.concat(chunks).toString()); } catch { inp = { action: "upload" }; }
        const A = { save: inp.path, restore: inp.path, page_new: out.path, media_delete: inp.url, upload: out.url, import_url: out.url, theme: "", blocks_save: "blocks_save", blocks_delete: "blocks_delete", blocks_import: "blocks_import", blocks_sync: "blocks_sync" };
        if (out && out.ok && inp.action in A) fs.appendFileSync(path.join(PRIV, "activity.jsonl"), JSON.stringify({ t: Math.floor(Date.now() / 1000), uid: tokenUid(req), action: /^blocks/.test(inp.action) ? "blocks" : inp.action, target: A[inp.action] || "", ip: req.socket.remoteAddress }) + "\n");
      } catch (e) { status = e.code || 500; out = { ok: false, error: e instanceof Fail ? e.message : "Server error" }; if (!(e instanceof Fail)) console.error(e); }
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(out));
    }

    if (p === "/api/quote-view.php") { const r = adminApi.quoteView(url.searchParams.get("id"), url.searchParams.get("t") || ""); res.writeHead(r.status, { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" }); return res.end(r.html); }
    if (p === "/api/mcp.php") {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version" };
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      if (req.method !== "POST") { res.writeHead(405, { ...cors, Allow: "POST", "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "This is the Woodex MCP endpoint. Connect with an MCP client using POST." })); }
      const chunks = []; for await (const c of req) chunks.push(c);
      let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      let r; try { r = await adminApi.mcp(req, body); } catch (e) { console.error(e); r = { status: 500, body: { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Server error" } } }; }
      res.writeHead(r.status, { ...cors, ...(r.headers || {}), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(r.body ? JSON.stringify(r.body) : "");
    }
    if (p === "/api/r404.php") { const ch = []; for await (const c of req) ch.push(c); adminApi.r404(Buffer.concat(ch).toString().slice(0, 2000)); res.writeHead(204); return res.end(); }
    if (p === "/api/chat.php") {
      const chunks = []; for await (const c of req) chunks.push(c);
      let status = 200, out; try { let inp = {}; try { inp = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {} out = adminApi.chat(req, inp); } catch (e) { status = e.code || 500; out = { ok: false, error: e.code ? e.message : "Server error" }; if (!e.code) console.error(e); }
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); return res.end(JSON.stringify(out));
    }
    if (p === "/api/forms.php") {
      const chunks = []; for await (const c of req) chunks.push(c);
      let status = 200, out;
      try { let inp = {}; const raw = Buffer.concat(chunks).toString(); try { inp = JSON.parse(raw || "{}"); } catch { inp = Object.fromEntries(new URLSearchParams(raw)); } if (req.method === "GET") inp = { action: "config" }; else if (req.method !== "POST") throw Object.assign(new Error("POST required"), { code: 405 }); out = await adminApi.forms(req, inp); }
      catch (e) { status = e.code || 500; out = { ok: false, error: e.code ? e.message : "Server error" }; if (!e.code) console.error(e); }
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(out));
    }

    if (p === "/api/admin.php" && ["backup_up", "db_dl", "db_up"].includes(url.searchParams.get("action"))) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = adminApi.rawAction(req, url.searchParams.get("action"), Buffer.concat(chunks));
      res.writeHead(r.status, Object.assign({ "Content-Type": r.type, "Cache-Control": "no-store" }, r.name ? { "Content-Disposition": 'attachment; filename="' + r.name + '"' } : {}));
      return res.end(r.body);
    }
    if (p === "/api/admin.php" && url.searchParams.get("action") === "backup_dl") {
      const f = adminApi.backupFile(req, String(url.searchParams.get("name") || ""));
      if (!f) { res.writeHead(403); return res.end("Forbidden"); }
      res.writeHead(200, { "Content-Type": "application/gzip", "Content-Disposition": 'attachment; filename="woodex-' + path.basename(f) + '"', "Content-Length": fs.statSync(f).size });
      return fs.createReadStream(f).pipe(res);
    }
    if (p === "/api/admin.php") {
      const chunks = []; for await (const c of req) chunks.push(c);
      let status = 200, out;
      try { let inp = {}; try { inp = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {} if (req.method === "GET" && url.searchParams.get("action") === "cron") inp = { action: "cron" }; out = await adminApi(req, inp); }
      catch (e) { status = e.code || 500; out = { ok: false, error: e.code ? e.message : "Server error" }; if (!e.code) console.error(e); }
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(out));
    }

    if (!/^\/(admin|builder|api|assets)\//.test(p)) {
      const rel = (p.endsWith("/") ? p + "index.html" : /\.[a-z0-9]+$/i.test(p) ? p : p + "/index.html").replace(/^\/+/, "");
      const g = adminApi.publicGuard(rel, req);
      if (g && g.maint) { res.writeHead(503, { "Content-Type": MIME[".html"], "Retry-After": "3600" }); return fs.createReadStream(path.join(ROOT, g.maint)).pipe(res); }
      if (g && g.redirect) { res.writeHead(g.code || 301, { Location: g.redirect }); return res.end(); }
      if (g && g.gone) { res.writeHead(410, { "Content-Type": "text/plain" }); return res.end("410 Gone"); }
      if (g && g.notFound) { res.writeHead(404, { "Content-Type": MIME[".html"] }); return fs.createReadStream(path.join(ROOT, "404.html")).pipe(res); }
    }
    let file = path.join(ROOT, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" + url.search }); return res.end(); }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": MIME[".html"] }); return fs.createReadStream(path.join(ROOT, "404.html")).pipe(res); }
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html" && !/^\/(builder|admin)/.test(p)) {
      // Preview-only "Edit this page" button (never written into the site files)
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const btn = `<a href="/builder/#${encodeURIComponent(rel)}" style="position:fixed;left:20px;bottom:20px;z-index:99999;background:#d4af6a;color:#0a0f1e;font:600 14px/1 system-ui,sans-serif;padding:14px 18px;border-radius:999px;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.35)">✏️ Edit this page</a>`;
      const lh = /Lighthouse|PageSpeed/i.test(req.headers["user-agent"] || ""); // speed tests see the page exactly as on Hostinger
      const body = fs.readFileSync(file, "utf8").replace(/<\/body>/i, (lh ? "" : btn) + "</body>");
      if (/gzip/.test(req.headers["accept-encoding"] || "")) { res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache", "Content-Encoding": "gzip", Vary: "Accept-Encoding" }); return res.end(zlib.gzipSync(body)); }
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      return res.end(body);
    }
    // mirror Hostinger .htaccess: gzip text (mod_deflate) + 30-day cache for static assets
    const cache = /^\.(webp|jpe?g|png|gif|svg|woff2|avif)$/.test(ext) && !/^\/(builder|admin)/.test(p) ? "public, max-age=2592000" : "no-cache";
    if (/^\.(css|js|svg|json|txt|xml)$/.test(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) { res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cache, "Content-Encoding": "gzip", Vary: "Accept-Encoding" }); return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res); }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cache });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500); res.end("Server error"); }
}).listen(PORT, "0.0.0.0", () => console.log(`frontend-v1 preview → :${PORT}  builder: /builder/  password: ${process.env.WX_DEV_PASSWORD ? "(from env)" : PASSWORD === "Woodex@2026" ? "Woodex@2026" : "(custom)"}`));
process.on("uncaughtException", (e) => console.error("uncaught:", e));
