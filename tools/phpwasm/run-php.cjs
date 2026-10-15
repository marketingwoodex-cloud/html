#!/usr/bin/env node
/**
 * run-php.cjs — run a PHP script from this repository without a PHP binary.
 *
 * Why: the build sandbox has no `php` and no root to install one, but the v2 platform is PHP and its
 * tests need to execute, not just parse. `@php-wasm/node` provides a real PHP 8.2 build (it reports
 * `pdo_mysql`, `pdo_sqlite`, `flock`, `password_hash`, `mbstring`, `curl`) compiled to WebAssembly,
 * and this harness mounts the repository into that runtime and runs a script inside it.
 *
 * Usage:
 *   node tools/phpwasm/run-php.cjs tests/run.php
 *   node tools/phpwasm/run-php.cjs tests/run.php --verbose
 *   node tools/phpwasm/run-php.cjs db/migrate.php --status     (needs a reachable MySQL)
 *
 * Setup (one time; the dependencies are deliberately not committed — they are ~60 MB of wasm):
 *   npm i --prefix tools/phpwasm @php-wasm/node@3.1.58
 *   ln -sfn <repo>/tools/phpwasm/node_modules/@php-wasm/node-8-2/asyncify/8_2_33 ./.phpwasm/8_2_33
 *
 * THE CWD MATTERS: the wasm loader resolves `8_2_33/php_8_2.wasm` relative to the process working
 * directory, not relative to the module. Running from a directory that does not contain `8_2_33/`
 * fails with ENOENT on that path — hence the symlink above and the chdir in main().
 *
 * The ESM/CJS trap: importing `@php-wasm/universal` as ESM while `@php-wasm/node` pulls its CJS copy
 * splits the runtime registry in two, and `new PHP(runtimeId)` then fails with "Runtime with id 1 not
 * found". Everything here is loaded through `require()` so both sides share one module instance.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const HERE = __dirname;
const WASM_DIR = path.join(HERE, ".phpwasm");

function fail(msg) {
  process.stderr.write("\n  " + msg + "\n\n");
  process.exit(2);
}

/* ------------------------------------------------------------------ arguments */
const argv = process.argv.slice(2);
if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
  process.stdout.write(
    "\n  node tools/phpwasm/run-php.cjs <script.php> [args…]\n\n" +
      "  Runs a PHP script from this repository inside a WebAssembly PHP 8.2 runtime.\n" +
      "  Run from tools/phpwasm (or let this script chdir for you) so 8_2_33/ resolves.\n\n",
  );
  process.exit(0);
}

const scriptRel = argv[0].replace(/^\.\//, "");
const scriptArgs = argv.slice(1);
const scriptAbs = path.join(ROOT, scriptRel);
if (!fs.existsSync(scriptAbs)) fail("No such script: " + scriptRel);

/* ------------------------------------------------------------------ dependencies */
let PHP;
let loadPHPRuntime;
let getPHPLoaderModule;
let createNodeFsMountHandler;
try {
  const universal = require(path.join(HERE, "node_modules", "@php-wasm", "universal"));
  const node = require(path.join(HERE, "node_modules", "@php-wasm", "node"));
  PHP = universal.PHP;
  loadPHPRuntime = universal.loadPHPRuntime;
  getPHPLoaderModule = node.getPHPLoaderModule;
  createNodeFsMountHandler = node.createNodeFsMountHandler;
} catch (err) {
  fail(
    "php-wasm is not installed:\n" +
      "      npm i --prefix tools/phpwasm @php-wasm/node@3.1.58\n" +
      "    (" + err.message + ")",
  );
}

/* The loader looks for the wasm relative to the process CWD. */
const wasmRel = "8_2_33";
if (!fs.existsSync(path.join(process.cwd(), wasmRel))) {
  const shipped = path.join(HERE, "node_modules", "@php-wasm", "node-8-2", "asyncify", "8_2_33");
  if (fs.existsSync(shipped)) {
    if (!fs.existsSync(WASM_DIR)) fs.mkdirSync(WASM_DIR, { recursive: true });
    const link = path.join(WASM_DIR, wasmRel);
    if (!fs.existsSync(link)) fs.symlinkSync(shipped, link);
    process.chdir(WASM_DIR);
  } else {
    fail("Cannot find " + shipped + " — is @php-wasm/node-8-2 installed?");
  }
}

/* ------------------------------------------------------------------ files to mount
 * Only what a PHP script in this repository can legitimately read: the API, the tests, the
 * migrations. Mounting the whole repo would copy node_modules and .git into an in-memory filesystem
 * for no reason.
 */
const MOUNT = ["api", "tests", "db", "frontend-v1/api", "frontend-v1/_database"];

/* Whole files from the site itself, mounted so a test can assert what the console *reads off the site*
 * rather than against a constant: the home page's footer is where the business details live, and the two
 * scripts beside it are the files an apply rewrites. Without them the sandbox skips that leg and the only
 * place it runs is a host — which is the same as never running it in the gate. */
const MOUNT_FILES = ["index.html", "assets/site.js", "assets/site.css", "assets/js/whatsapp-widget.js",
  /* v2.1's social-row table and the site it wrote, so the parity test runs here and not only on CI. */
  "frontend-v1/index.html", "frontend-v1/admin/admin-fields.js"];

function copyTree(from, to, php, stats) {
  for (const entry of fs.readdirSync(from)) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
    const src = path.join(from, entry);
    const dst = to + "/" + entry;
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      try { php.mkdir(dst); } catch { /* exists */ }
      copyTree(src, dst, php, stats);
    } else if (/\.(php|sql|json|md)$/.test(entry)) {
      php.writeFile(dst, fs.readFileSync(src));
      stats.files += 1;
      stats.bytes += st.size;
    }
  }
}

/* ------------------------------------------------------------------ run */
(async () => {
  const loader = await getPHPLoaderModule("8.2");
  loader.processId = process.pid % 100000; // the loader requires a *number*
  const runtime = await loadPHPRuntime(loader, { processId: loader.processId });
  const php = new PHP(runtime);

  const stats = { files: 0, bytes: 0 };
  /* WX_HOST_FS=1: mount the repository itself at /wx, so a write (a SQLite file, a migration's
     bookkeeping) lands on disk and survives the process. The default copies a read-only subset into
     memory: right for tests, wrong for anything that must persist. */
  const hostFs = process.env.WX_HOST_FS === "1";
  if (hostFs) {
    await php.mount("/wx", createNodeFsMountHandler(ROOT));
  } else {
  try { php.mkdir("/wx"); } catch { /* exists */ }
  // A script outside the mounted trees (an ad-hoc probe at the repo root) still has to be present.
  if (!MOUNT.some((m) => scriptRel.startsWith(m + "/") || scriptRel === m)) {
    try { php.writeFile("/wx/" + scriptRel, fs.readFileSync(scriptAbs)); stats.files += 1; } catch { /* nested dirs handled below */ }
  }
  for (const rel of MOUNT_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const parts = rel.split("/");
    let dir = "/wx";
    for (const p of parts.slice(0, -1)) {
      dir += "/" + p;
      try { php.mkdir(dir); } catch { /* exists */ }
    }
    php.writeFile("/wx/" + rel, fs.readFileSync(abs));
    stats.files += 1;
    stats.bytes += fs.statSync(abs).size;
  }
  for (const rel of MOUNT) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const dst = "/wx/" + rel;
    const parts = rel.split("/");
    let acc = "/wx";
    for (const p of parts) {
      acc += "/" + p;
      try { php.mkdir(acc); } catch { /* exists */ }
    }
    if (fs.statSync(abs).isDirectory()) copyTree(abs, dst, php, stats);
    else { php.writeFile(dst, fs.readFileSync(abs)); stats.files += 1; }
  }
  }
  process.stdout.write(hostFs
    ? "  php-wasm: repository mounted at /wx (host filesystem)\n"
    : `  php-wasm: ${stats.files} file(s), ${(stats.bytes / 1024 / 1024).toFixed(1)} MB mounted at /wx\n`);

  /* The runner: set up the CLI globals a script expects, then include it. A `require` inside a
     wasm request cannot carry argv, so the wrapper provides it. */
  const argsLiteral = JSON.stringify(scriptArgs);
  const wrapper = `<?php
$__args = ${argsLiteral};
$argv = array_merge(['/wx/${scriptRel}'], $__args);
$argc = count($argv);
$_SERVER['argv'] = $argv;
$_SERVER['argc'] = $argc;
$_SERVER['SCRIPT_FILENAME'] = '/wx/${scriptRel}';
$_SERVER['SCRIPT_NAME'] = '/${scriptRel}';
$_SERVER['DOCUMENT_ROOT'] = '/wx';
$_SERVER['REQUEST_METHOD'] = 'CLI';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
chdir('/wx');
require '/wx/${scriptRel}';
`;

  const response = await php.run({ code: wrapper });
  process.stdout.write(response.text || "");
  if (response.errors && response.errors.trim()) {
    process.stderr.write("\n  --- PHP stderr ---\n" + response.errors + "\n");
  }

  /* Set exitCode and let Node drain stdout. Calling process.exit() here truncates the PHP output
     when stdout is a pipe — the mount line above survives (it was flushed during the await) while
     the test summary, written microseconds before the exit, is lost. */
  process.exitCode = typeof response.exitCode === "number" ? response.exitCode : 0;
})().catch((err) => {
  process.stderr.write("\n  php-wasm failed: " + (err && err.message) + "\n\n");
  process.exitCode = 1;
});
