#!/usr/bin/env node
/**
 * serve.cjs — a development web server for api/v2, running PHP 8.2 inside WebAssembly.
 *
 * It replaces `php -S 127.0.0.1:8080 -t .. ../api/v2/index.php` in the sandbox, where there is no PHP
 * binary. Behaviour matches the built-in server for this project:
 *   - the document root is the repository root, so /assets/... and the site's files are served as they are;
 *   - every /api/v2/... request is handed to api/v2/index.php, with the original REQUEST_URI intact,
 *     which is what the front controller reads (it strips the /api/v2 mount itself);
 *   - the repository is mounted into the PHP filesystem with a real host mount, so the SQLite file and the
 *     _private/ JSON stores are written to disk and survive a restart.
 *
 * Usage:
 *   node tools/phpwasm/serve.cjs                 (127.0.0.1:8080)
 *   node tools/phpwasm/serve.cjs --port 8090
 *   node tools/phpwasm/serve.cjs --host 0.0.0.0  (only if you mean to expose the API directly)
 *
 * Requests run one at a time: a single PHP instance is not re-entrant, and the file stores assume it.
 * The first request after start takes a few seconds while the runtime loads (the wasm is ~22 MB).
 *
 * Setup is the same as tools/phpwasm/run-php.cjs (npm i --prefix tools/phpwasm @php-wasm/node@3.1.58);
 * this script creates the 8_2_33 symlink itself if it is missing.
 */

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..", "..");
const WASM_DIR = path.join(HERE, ".phpwasm");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PORT = Number(arg("--port", process.env.PORT || 8080));
const HOST = arg("--host", "127.0.0.1");

function fail(msg) {
  process.stderr.write("\n  " + msg + "\n\n");
  process.exit(2);
}

/* The loader resolves ./8_2_33/php_8_2.wasm against the CWD, so enter a directory that has it. */
const shipped = path.join(HERE, "node_modules", "@php-wasm", "node-8-2", "asyncify", "8_2_33");
if (!fs.existsSync(shipped)) fail("php-wasm is not installed: npm i --prefix tools/phpwasm @php-wasm/node@3.1.58");
if (!fs.existsSync(WASM_DIR)) fs.mkdirSync(WASM_DIR, { recursive: true });
const link = path.join(WASM_DIR, "8_2_33");
if (!fs.existsSync(link)) fs.symlinkSync(shipped, link);
process.chdir(WASM_DIR);

const universal = require(path.join(HERE, "node_modules", "@php-wasm", "universal"));
const node = require(path.join(HERE, "node_modules", "@php-wasm", "node"));

const API_FRONT = "/api/v2/index.php";

let handler = null;

/* The request's own cookie header, per request. @php-wasm's request handler replaces it with the
   runtime's own cookie jar — one jar for every client of the process — so a second user's login would
   answer the first user's requests as the second user (and fail their CSRF check with a valid token).
   Real PHP builds $_COOKIE from the request it is handling; this store makes the engine do the same:
   remember nothing, and hand the runtime exactly the cookie header that arrived. */
let currentCookie = "";
const perRequestCookieStore = {
  rememberCookiesFromResponseHeaders() {
    /* Set-Cookie belongs to the client's jar, not ours. */
  },
  getCookieRequestHeader() {
    /* A space, not empty: the runtime only calls wasm_set_cookies for a truthy value, so an empty
       string would leave the previous request's cookies in place. */
    return currentCookie === "" ? " " : currentCookie;
  },
};

async function boot() {
  const loader = await node.getPHPLoaderModule("8.2");
  loader.processId = process.pid % 100000;
  const runtime = await universal.loadPHPRuntime(loader, { processId: loader.processId });
  const php = new universal.PHP(runtime);
  await php.mount("/wx", node.createNodeFsMountHandler(ROOT));
  handler = new universal.PHPRequestHandler({
    php,
    documentRoot: "/wx",
    absoluteUrl: `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`,
    cookieStore: perRequestCookieStore,
    getFileNotFoundAction: (pathname) => {
      // Anything under /api/v2/ that is not a real file is the front controller's business.
      if (pathname === "/api/v2" || pathname.startsWith("/api/v2/")) {
        return { type: "internal-redirect", uri: API_FRONT };
      }
      return { type: "404" };
    },
  });
  // Warm the runtime so the first browser request does not pay for it.
  await handler.request({ url: "/api/v2/index.php/health", method: "GET" });
}

/* Serialise every request through one queue. */
let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(parts.length ? Buffer.concat(parts) : undefined));
    req.on("error", reject);
  });
}

/**
 * The v2.5 console's routing, answered the way the host answers it.
 *
 * `tools/make-release.mjs` writes this rule into the payload's `.htaccess`: everything under
 * `/admin-next/` that is not a real file is answered with `admin-next/index.html`, because the console is a
 * single-page app and `/admin-next/leads` is a route, not a file. Apache does that on Hostinger; this server
 * did not, so a refresh (or a deep link, or any in-app navigation that happened to be a full page load)
 * asked for a file that has never existed and got a 404 with an empty body — a white page, indistinguishable
 * from a console that failed to start. A development server that disagrees with the host about routing is
 * worse than no development server: it hides the one defect the host would show.
 */
function consoleRoute(url) {
  const q = url.indexOf("?");
  const pathname = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? "" : url.slice(q);
  if (pathname !== "/admin-next" && !pathname.startsWith("/admin-next/")) return url;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return url; /* a bad escape is not a route; let the file lookup answer it */
  }
  /* A real file (the index itself, the JS/CSS bundles, an image) is left exactly as asked for. */
  if (fs.existsSync(path.join(ROOT, decoded))) return url;
  return "/admin-next/index.html" + query;
}

/**
 * The one page this server answers itself.
 *
 * The v2.1 console (`/admin/`) opens by asking `/api/admin.php` for its status. On a host with MySQL that
 * status is fine. Here it answers `{"dbError":true,"driver":"mysql"}` — there is no MySQL in the sandbox, and
 * P25.1's database is SQLite behind api/v2 — and admin.js reacts by doing `location.replace("/wx-install.php")`.
 * That file is **deliberately not in the pack** (it creates a database and demo logins; the release refuses to
 * ship it) and the payload's `.htaccess` blocks `wx-*.php` with a `403`. A refusal with a nine-byte body is a
 * white page, which reads as "the dashboard is broken" rather than "this is the old console and it wants a
 * database that is not here".
 *
 * So the refusal keeps its status — 403, exactly what the host would return — and gains a sentence saying
 * which console does work on this machine. It is served only by this development server: nothing here is in
 * the release payload, and `tools/make-release.mjs` never sees it.
 */
function refusedInstaller(pathname) {
  if (!/^\/wx-(install|demo|check)\.php$/.test(pathname)) return null;
  const which = pathname.slice(1);
  return (
    "<!doctype html><meta charset=\"utf-8\"><title>403 — not shipped</title>" +
    "<div style=\"font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:44rem;margin:12vh auto;padding:0 24px\">" +
    "<p style=\"font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.6\">Woodex · local rehearsal · 403</p>" +
    "<h1 style=\"font-size:22px;margin:8px 0 12px\">" + which + " is not part of this release.</h1>" +
    "<p>The v2.1 console asked for it because <code>/api/admin.php</code> reported <code>dbError</code>, and " +
    "that is true here: this machine runs the P25.1 stack — <b>SQLite behind <code>/api/v2</code></b> — with no " +
    "MySQL, so the old console cannot load its data. The installer is not the answer: releases after P25.1 " +
    "refuse to ship it (it creates a database and demo logins), which is why the server answers 403.</p>" +
    "<p><a href=\"/admin-next/\">Open the v2.5 console at /admin-next/</a> — it is the one that runs on this " +
    "stack, and it is the one that will replace this screen on the host.</p>" +
    "</div>"
  );
}

/**
 * `/admin/` — the v2.1 console, which cannot run on this machine, answered with the way forward.
 *
 * The site's own admin link points here (and so do people's bookmarks). The v2.1 console is a MySQL
 * application: its page loads, asks `/api/admin.php` for its status, gets `dbError` — this stack is SQLite
 * behind `/api/v2`, with no MySQL anywhere in the sandbox — and then does `location.replace("/wx-install.php")`
 * itself. That installer is deliberately not in the pack, so the browser lands on a 403 with a page that
 * explains the refusal. Explaining a refusal is not the same as answering the question the visitor asked,
 * which was "where is the dashboard?", so this intercepts the request *before* the redirect and says it once:
 * the old console needs MySQL, this machine has SQLite, and the console that runs here is /admin-next/.
 *
 * It is a development-server behaviour only, decided per request by asking the API's own status endpoint — the
 * payload is untouched, and on the host, where MySQL answers, nothing here is reached.
 */
async function v21WithoutMysql() {
  try {
    const status = await handler.request({ url: "/api/admin.php", method: "GET", headers: {}, body: undefined });
    const text = Buffer.from(status.bytes || new Uint8Array()).toString("utf8");
    const json = JSON.parse(text);
    return json && json.dbError === true;
  } catch {
    /* If even the status cannot be read, say nothing rather than guessing. */
    return false;
  }
}

function pointerPage() {
  return (
    "<!doctype html><meta charset=\"utf-8\"><title>Dashboard moved to /admin-next/</title>" +
    "<div style=\"font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:44rem;margin:11vh auto;padding:0 24px\">" +
    "<p style=\"font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.6\">Woodex · local rehearsal</p>" +
    "<h1 style=\"font-size:22px;margin:8px 0 12px\">The dashboard is at <code>/admin-next/</code>.</h1>" +
    "<p>You asked for <code>/admin/</code>, which is the <b>old v2.1 console</b>. It is a MySQL application: " +
    "it needs the account in <code>_private/db.json</code> and a MySQL server to answer, and this machine runs " +
    "the P25.1 stack — <b>SQLite behind <code>/api/v2</code></b> — with no MySQL. Left alone it asks for its own " +
    "installer, which every release after P25.1 refuses to ship, and that refusal is what you were looking at.</p>" +
    "<p style=\"font-size:19px;margin:20px 0\"><a href=\"/admin-next/\">Open the v2.5 console → /admin-next/</a></p>" +
    "<p style=\"opacity:.8\">Sign in with <b>owner@woodex.local</b> and the password in " +
    "<code>_private/dev-owner.txt</code>. On the live host, where MySQL exists, <code>/admin/</code> still works " +
    "exactly as before — this page is only ever shown by the local development server.</p>" +
    "</div>"
  );
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    /* The old console, before its own JavaScript can send the browser to an installer that is not there. */
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      if (await v21WithoutMysql()) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(pointerPage());
        return;
      }
    }
    const refused = refusedInstaller(url.pathname);
    if (refused) {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(refused);
      return;
    }
    const body = await readBody(req);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "connection" || k === "keep-alive" || k === "transfer-encoding") continue;
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    const response = await enqueue(() => {
      /* Inside the queue, so the cookie the runtime sees is always this request's own. */
      currentCookie = String(headers.cookie ?? headers.Cookie ?? "");
      return handler.request({ url: consoleRoute(req.url || "/"), method: req.method || "GET", headers, body });
    });
    const out = {};
    for (const [k, v] of Object.entries(response.headers || {})) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      out[k] = v;
    }
    res.writeHead(response.httpStatusCode || 200, out);
    res.end(Buffer.from(response.bytes || new Uint8Array()));
    if (process.env.WX_SERVE_LOG) process.stdout.write(`${req.method} ${req.url} ${response.httpStatusCode}\n`);
    if (response.errors && response.errors.trim()) {
      process.stderr.write(response.errors.trim() + "\n");
    }
  } catch (err) {
    process.stderr.write("[serve] " + (err && err.stack ? err.stack : err) + "\n");
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "The local PHP server failed", field: null }, meta: { requestId: "serve" } }));
  }
});

boot()
  .then(() => {
    server.listen(PORT, HOST, () => {
      process.stdout.write(`  api/v2 (PHP 8.2 in WebAssembly, SQLite) on http://${HOST}:${PORT}\n`);
    });
  })
  .catch((err) => {
    process.stderr.write("[serve] boot failed: " + (err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
