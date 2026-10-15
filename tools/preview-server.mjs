// preview-server.mjs — local live preview of the arena branch.
// Serves the static site + /admin/ and routes /.netlify/functions/* through
// the real api/router.mjs (same handlers Vercel runs). A background loop
// fast-forwards the working tree from origin so Save/Publish done through
// this preview (which commit to GitHub) appear here within ~10 seconds.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import router from "../api/router.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);
const BRANCH = process.env.CMS_GITHUB_BRANCH || "arena/01a0e87c-marketingwoodex";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm",
  ".pdf": "application/pdf",
};

function safeJoin(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  if (p.includes("\0")) return null;
  const abs = path.normalize(path.join(ROOT, p));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}

// Site redirects — same rules Vercel applies (vercel.json), so /admin -> /admin/
// etc. work locally too. Sources are repo-controlled path-to-regexp patterns;
// for this file's simple entries a regex literal match is equivalent.
let REDIRECTS = [];
try {
  REDIRECTS = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).redirects || [];
} catch { /* no redirects */ }

const server = http.createServer((req, res) => {
  let urlPath;
  let urlSearch = "";
  try {
    const u = new URL(req.url, "http://local");
    urlPath = u.pathname;
    urlSearch = u.search;
  } catch { return send(res, 400, "bad url"); }

  // API: emulate vercel.json rewrite /.netlify/functions/<fn> -> /api/router?fn=<fn>
  if (urlPath.startsWith("/.netlify/functions/") || urlPath === "/api/router") {
    const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    if (urlPath.startsWith("/.netlify/functions/")) {
      const fn = urlPath.slice("/.netlify/functions/".length).replace(/\/+$/, "");
      req.url = `/api/router?fn=${encodeURIComponent(fn)}${search ? "&" + search.slice(1) : ""}`;
    } else {
      req.url = "/api/router" + search;
    }
    return router(req, res);
  }

  // 1) configured redirects (Vercel parity)
  for (const r of REDIRECTS) {
    let m = null;
    try { m = urlPath.match(new RegExp("^(?:" + r.source + ")$")); } catch { /* bad pattern */ }
    if (m) {
      const dest = String(r.destination || "").replace(/\$(\d+)/g, (_, n) => m[Number(n)] || "");
      if (dest && dest !== urlPath) {
        res.writeHead(r.permanent === false ? 302 : 301, { location: dest + urlSearch, "cache-control": "no-store" });
        return res.end();
      }
    }
  }

  // 2) directory without trailing slash -> redirect (so ./relative assets resolve)
  if (!urlPath.endsWith("/")) {
    const asDir = safeJoin(urlPath + "/index.html");
    if (asDir && fs.existsSync(asDir) && fs.statSync(asDir).isFile()) {
      res.writeHead(302, { location: urlPath + "/" + urlSearch, "cache-control": "no-store" });
      return res.end();
    }
  }

  const abs = safeJoin(urlPath === "/" ? "/index.html" : urlPath);
  if (!abs) return send(res, 403, "forbidden");
  let file = abs;
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) file = path.join(file, "index.html");
  } catch { /* fall through to 404 */ }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const nf = path.join(ROOT, "404.html");
    if (fs.existsSync(nf) && !path.extname(urlPath)) {
      return send(res, 404, fs.readFileSync(nf), { "content-type": MIME[".html"] });
    }
    return send(res, 404, "Not found");
  }
  const ext = path.extname(file).toLowerCase();
  const headers = { "content-type": MIME[ext] || "application/octet-stream" };
  if (ext !== ".html") headers["cache-control"] = "public, max-age=60";
  const data = fs.readFileSync(file);
  headers["content-length"] = data.length;
  res.writeHead(200, headers);
  res.end(data);
});

// Background sync: publishes go to GitHub; refresh this working tree so the
// preview serves the latest committed files.
function pullLoop() {
  execFile(
    "git",
    ["pull", "--ff-only", "origin", BRANCH],
    { cwd: ROOT, timeout: 15000 },
    () => setTimeout(pullLoop, 8000)
  );
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`woodex preview on http://0.0.0.0:${PORT} (branch: ${BRANCH})`);
  pullLoop();
});
