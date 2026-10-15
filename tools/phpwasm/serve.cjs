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

const server = http.createServer(async (req, res) => {
  try {
    const body = await readBody(req);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "connection" || k === "keep-alive" || k === "transfer-encoding") continue;
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    const response = await enqueue(() =>
      handler.request({ url: req.url || "/", method: req.method || "GET", headers, body }),
    );
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
