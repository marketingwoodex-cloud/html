#!/usr/bin/env node
/**
 * tests/conformance.mjs — the checks that must pass before Phase 1 can be called done.
 *
 * Why this file exists rather than a promise: the Phase 1 gate in the master plan is "a signed-in
 * request round-trips cookie → CSRF → controller → MySQL → envelope; the eight Critical findings are
 * closed and verified". Half of that needs a live host. The other half is structural, and structure is
 * exactly what regresses silently — a route added without a permission check, a query built by string
 * concatenation, a cookie that loses its flags in a refactor.
 *
 * So this suite reads the source and asserts the invariants. It runs anywhere, in a second, and it is
 * wired into CI. Behavioural tests that need PHP + MySQL live in tests/run.php.
 *
 *   node tests/conformance.mjs            human output
 *   node tests/conformance.mjs --json     machine output (CI)
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";

/* The starter-template generator is imported rather than run as a subprocess: `check()` is synchronous and
   would swallow a promise, which is how an async check passes without asserting anything. Importing it here
   means the extraction runs in this process and the comparison below is a real one. */
const { extractStarters, render: renderStarters } = await import(new URL("../tools/gen-quote-starters.mjs", import.meta.url).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const exists = (p) => existsSync(join(ROOT, p));

/**
 * Source with comments removed. Several checks below assert "this pattern is absent", and a comment
 * that *explains* the pattern is not a regression — without this, documenting a fix fails its own
 * test, and the pressure is to delete the explanation.
 *
 * It has to walk the source rather than reach for a regex, and it had to learn that the hard way: a
 * fixture key that ends in a star (the sample for one page of a kind) contains the two characters that
 * open a block comment, and the regex version then deleted everything from that string to the next
 * end-of-comment marker — in one file, both the sample the new screen reads and the list of samples
 * that says so. The check that exists to catch a missing sample reported the file as fine, which is
 * the worst possible failure for a tool. Strings are copied verbatim, which is what makes the rest
 * safe: a double slash *outside* a string opens a comment whether it is at the start of a line or
 * after code on it, while a hash only opens one at the start of a line, because a hash-bracket is a
 * PHP attribute and a hash on its own is a private name in TypeScript.
 */
const stripComments = (src) => {
  let out = "";
  let lineStart = true;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      for (i++; i < src.length; i++) {
        out += src[i];
        if (src[i] === "\\") { i++; out += src[i] ?? ""; continue; }
        if (src[i] === q) break;
        if (src[i] === "\n") lineStart = true;
      }
      lineStart = false;
      continue;
    }
    if (c === "/" && n === "*") {
      /* Counted, not swallowed: the newlines stay so the rest of the file keeps its line numbers. */
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; lineStart = true; continue; }
    if (lineStart && c === "#" && n !== "[") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; lineStart = true; continue; }
    out += c;
    lineStart = c === "\n" || (lineStart && (c === " " || c === "\t" || c === "\r"));
  }
  return out;
};
const readCode = (p) => stripComments(read(p));

/**
 * SQL source with its comments removed and its string literals kept.
 *
 * A naive `--` regex is not enough, and not stripping at all is worse: several checks below assert
 * that a pattern is *absent*, and the migration files explain in a comment why the pattern is absent
 * ("MySQL 8 has no ADD COLUMN IF NOT EXISTS", "the alternative was paisa"). Without this, documenting
 * a decision fails the test that guards the decision — which is how documentation gets deleted.
 */
const stripSql = (src) => {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === "-" && n === "-") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 1; continue; }
    if (c === "'" || c === '"') {
      const q = c; out += c;
      for (i++; i < src.length; i++) {
        out += src[i];
        if (src[i] === "\\") { i++; out += src[i] ?? ""; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    out += c;
  }
  return out;
};
const readSql = (p) => stripSql(read(p));

let passed = 0;
const failures = [];
const notes = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error("assertion returned false");
    if (typeof result === "string") notes.push(`${name}: ${result}`);
    passed += 1;
  } catch (err) {
    failures.push(`${name} — ${err.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEq = (a, b, msg) => { if (a !== b) throw new Error(`${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); };

/* ============================================================== 1. route integrity */

const router = read("api/v2/lib/router.php");
const routeFiles = readdirSync(join(ROOT, "api/v2/routes")).filter((f) => f.endsWith(".php"));

/** Parse the route table literal out of router.php: ['GET', 'leads/{id}', 'leads', 'wx_route_leads_get', 'get_lead'] */
function parseRoutes() {
  const body = router.slice(router.indexOf("$routes = ["), router.indexOf("];", router.indexOf("$routes = [")));
  const routes = [];
  /* Digits matter: `wx_route_login_2fa` and the two-factor routes in routes/security.php were invisible
     to every check in this file while the handler pattern was [a-z_]+ — the checks that should have
     covered the newest, most security-sensitive routes were silently skipping them. */
  for (const m of body.matchAll(/\[\s*'([A-Z]+)',\s*'([^']+)',\s*'([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*(null|'[a-z0-9_]+')\s*\]/g)) {
    routes.push({ method: m[1], pattern: m[2], file: m[3], fn: m[4], action: m[5] === "null" ? null : m[5].slice(1, -1) });
  }
  return routes;
}
const routes = parseRoutes();

check("router declares routes", () => assert(routes.length >= 15, `only ${routes.length} routes parsed`));

check("the route table is parsed completely", () => {
  /* A parser that quietly skips a line makes every check below it weaker without saying so. Count the
     lines that look like route registrations and require the parse to have found all of them. */
  const src = readCode("api/v2/lib/router.php");
  const starts = (src.match(/\n\s*\['(GET|POST|PATCH|PUT|DELETE)',/g) || []).length;
  assertEq(routes.length, starts, `parsed ${routes.length} of ${starts} route lines`);
});

check("every route file exists", () => {
  const missing = [...new Set(routes.map((r) => r.file))].filter((f) => !routeFiles.includes(`${f}.php`));
  assertEq(missing.length, 0, `route files that do not exist: ${missing.join(", ")}`);
});

check("every library is included, or nothing uses it", () => {
  /* A lib that nothing includes is dead code that looks alive: `docs.php` held wx_doc_get,
     wx_doc_put and wx_payload_column — the document layer the whole money path calls — and no file
     required it. Lint passes, conformance passes, and every one of those calls is a fatal at runtime.
     Until this check existed, the only way to find it was to run a request that touched a document. */
  const bootstrap = readCode("api/v2/lib/bootstrap.php");
  const included = new Set([...bootstrap.matchAll(/\/lib\/([a-z0-9_]+\.php)/g)].map((m) => m[1]));
  const tree = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "dist", "build", "_private"].includes(e.name)) walk(rel);
      } else if (e.name.endsWith(".php")) tree.push(rel);
    }
  };
  for (const d of ["api/v2", "tests", "db"]) walk(d);

  const offenders = [];
  for (const file of readdirSync(join(ROOT, "api/v2/lib"))) {
    if (!file.endsWith(".php") || included.has(file)) continue;
    const src = readCode(`api/v2/lib/${file}`);
    for (const m of src.matchAll(/^function\s+([a-z0-9_]+)\s*\(/gm)) {
      const fn = m[1];
      for (const f of tree) {
        const other = read(f);
        if (!other.includes(fn + "(")) continue;
        const lines = other.split("\n").filter((l) => l.includes(fn + "(") && !/^\s*(\*|\/\/|#)/.test(l));
        const real = lines.filter((l) => !new RegExp(`function\\s+${fn}\\s*\\(`).test(l));
        if (real.length) {
          offenders.push(`lib/${file} defines ${fn}(), which ${f} calls, but bootstrap.php never includes it`);
          break;
        }
      }
    }
  }
  assertEq(offenders.length, 0, offenders.slice(0, 4).join(" | "));
});

check("no file declares the same function twice", () => {
  /* PHP dies with "Cannot redeclare" the moment the file is loaded, so a duplicate is not a subtle
     bug — but it is an invisible one, because route files are only loaded when a request reaches them.
     bookings.php carried a duplicate copy of two functions that way: lint-clean, conformance-clean,
     and fatal on the first booking anyone tried to create. */
  const offenders = [];
  for (const f of [...routeFiles.map((x) => `api/v2/routes/${x}`), ...readdirSync(join(ROOT, "api/v2/lib")).filter((x) => x.endsWith(".php")).map((x) => `api/v2/lib/${x}`)]) {
    const names = [...readCode(f).matchAll(/^function\s+([a-z0-9_]+)\s*\(/gm)].map((m) => m[1]);
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) offenders.push(`${f} → ${n}`);
      seen.add(n);
    }
  }
  assertEq(offenders.length, 0, `functions declared twice: ${offenders.join(", ")}`);
});

check("every bridged action points at a handler that exists", () => {
  /* A bridge entry is a promise that a v2.1 caller still works. A typo in it — a function renamed, a route
     deleted — is not a lint error and not a test failure anywhere else: it is a 500 for whoever called the
     old name. This reads the list and checks each entry against the file it names and the route table. */
  const legacy = readCode("api/v2/routes/legacy.php");
  const body = legacy.match(/function wx_legacy_bridged\(\): array\s*\{([\s\S]*?)\n\}/);
  assert(body, "the bridged list must be readable");
  const entries = [...body[1].matchAll(/'([a-z0-9_]+)'\s*=>\s*\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'/g)];
  assert(entries.length >= 140, `only ${entries.length} bridged actions parsed`);
  const bad = [];
  for (const [, action, file, fn] of entries) {
    const path = `api/v2/routes/${file}.php`;
    if (!existsSync(join(ROOT, path))) {
      bad.push(`${action} -> ${path} (no such file)`);
    } else if (!new RegExp(`function ${fn}\\(`).test(readCode(path))) {
      bad.push(`${action} -> ${fn}() is not in ${path}`);
    } else if (!routes.some((r) => r.fn === fn)) {
      bad.push(`${action} -> ${fn}() is not in the route table`);
    }
  }
  assertEq(bad.length, 0, bad.join(" | "));
});

check("a bridged caller's parameter names are translated, not guessed", () => {
  /* v2.1 says `path`, the route says `rel`. Passing the body through unchanged is how a bridged action
     answers "Missing rel" to a caller that never had one — the bridge has to say which legacy name maps to
     which route name, and there has to be more than one of them for this to be more than a coincidence. */
  const legacy = readCode("api/v2/routes/legacy.php");
  assert(/function wx_legacy_params\(/.test(legacy), "the bridge must translate v2.1's parameter names");
  assert(/wx_legacy_params\(\$paramKeys/.test(legacy), "and it must be used for every bridged action");
  const aliased = [...legacy.matchAll(/'[a-z0-9_]+'\s*=>\s*\[\s*'[a-z0-9_]+'\s*,\s*'[a-z0-9_]+'\s*,\s*\[[^\]]*=>[^\]]*\]/g)];
  assert(aliased.length >= 3, `only ${aliased.length} entries declare an alias; the page actions take a path`);
});

check("every route handler is declared in its file", () => {
  const missing = [];
  for (const r of routes) {
    const src = read(`api/v2/routes/${r.file}.php`);
    if (!new RegExp(`function\\s+${r.fn}\\s*\\(`).test(src)) missing.push(`${r.fn} (${r.pattern})`);
  }
  assertEq(missing.length, 0, `handlers not found: ${missing.join(", ")}`);
});

/* The public list is read from router.php rather than repeated here: a second copy of it is a second
   thing to forget, and the failure mode of forgetting is a route that quietly stops asking who you are. */
function publicRoutes() {
  const src = readCode("api/v2/lib/router.php");
  const at = src.indexOf("function wx_public_routes(");
  assert(at >= 0, "router.php must declare wx_public_routes()");
  const body = src.slice(at, src.indexOf("\n}", at));
  const out = new Set();
  for (const m of body.matchAll(/'([a-z0-9_/{}.\-]+)'/g)) out.add(m[1]);
  return out;
}

check("every route that is not declared public enforces authentication", () => {
  const publicList = publicRoutes();
  const patterns = new Set(routes.map((r) => r.pattern));
  for (const p of publicList) assert(patterns.has(p), `wx_public_routes() names /${p}, which is not a registered route`);
  const offenders = [];
  for (const r of routes) {
    if (publicList.has(r.pattern)) continue;
    const src = readCode(`api/v2/routes/${r.file}.php`);
    const at = src.indexOf(`function ${r.fn}(`);
    assert(at >= 0, `${r.fn} not found in its file`);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 10) === -1 ? undefined : src.indexOf("\nfunction ", at + 10));
    /* wx_appr_route() calls wx_require_user() itself, first thing, before it can queue anything —
       that order is the point of it (see lib/approvals.php), so a handler that delegates to it has
       authenticated the caller. */
    if (!/wx_require_user\s*\(/.test(body) && !/wx_appr_route\s*\(/.test(body)) {
      offenders.push(`${r.fn} (${r.method} /${r.pattern})`);
    }
  }
  assertEq(offenders.length, 0, `these routes never call wx_require_user(): ${offenders.join(", ")}`);
});

check("public write routes are rate-limited instead of authenticated", () => {
  /* A session is what protects a signed-in route. A stranger's POST has no session to check, so the
     control has to be the rate limit plus whatever token the route carries — otherwise "public" means
     "unprotected", which is how a contact form becomes a way to send ten thousand emails. */
  const exempt = new Set([
    "book/config", "chat/config",        // reads
    "chat/poll",                          // reads; the widget polls every few seconds by design
    "auth/login", "auth/login/2fa",       // throttled by wx_throttle() + wx_login_attempts in lib/auth.php
    "auth/logout",                        // ends the caller's own session; nothing to spend
    "me",                                 // reads, or writes only the caller's own row
    "health", "version",                  // GET only
  ]);
  const offenders = [];
  for (const r of routes) {
    if (r.method === "GET" || exempt.has(r.pattern)) continue;
    const src = readCode(`api/v2/routes/${r.file}.php`);
    const at = src.indexOf(`function ${r.fn}(`);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 10) === -1 ? undefined : src.indexOf("\nfunction ", at + 10));
    const publicList = publicRoutes();
    if (!publicList.has(r.pattern)) continue;
    /* Same one-level rule as the audit check: a handler that calls a helper which limits is limited,
       and requiring the call in the handler as well would spend the budget twice. wx_book_rate() is
       wx_rate() with the booking form's wording; wx_r404_log() limits per IP before it writes. */
    const limitingHelpers = new Set();
    const libText = readdirSync(join(ROOT, "api/v2/lib")).filter((f) => f.endsWith(".php"))
      .map((l) => readCode(`api/v2/lib/${l}`)).join("\n");
    for (const block of (src + "\n" + libText).split(/\nfunction /).slice(1)) {
      const n = block.slice(0, block.indexOf("("));
      if (/wx_(\w*_)?rate\s*\(/.test(block)) limitingHelpers.add(n);
    }
    const limited = /wx_(\w*_)?rate\s*\(/.test(body)
      || [...limitingHelpers].some((h) => h !== r.fn && new RegExp(`\\b${h}\\s*\\(`).test(body));
    if (!limited) offenders.push(`${r.fn} (${r.method} /${r.pattern})`);
  }
  assertEq(offenders.length, 0, `public writes with no rate limit: ${offenders.join(", ")}`);
});

check("every route's permission action exists in the generated alias table", () => {
  const aliases = read("api/v2/aliases.php");
  const missing = [];
  for (const r of routes) {
    if (r.action === null) continue;
    if (!aliases.includes(`'${r.action}' =>`)) missing.push(`${r.action} (${r.pattern})`);
  }
  assertEq(missing.length, 0, `permission keys that no v2.1 action matches — these would fail closed and lock users out: ${missing.join(", ")}`);
});

/* ============================================================== 2. envelope discipline */

const libs = readdirSync(join(ROOT, "api/v2/lib")).filter((f) => f.endsWith(".php"));

check("only the front controller and the single exit point may write output", () => {
  /* Two files may emit a byte: index.php, and lib/http.php's wx_respond(), which is the one place an
     envelope leaves the process (it also discards any stray buffer first, so a warning cannot corrupt
     the JSON). Everywhere else, writing to the response is a bug. */
  const offenders = [];
  for (const f of [...routeFiles.map((f) => `routes/${f}`), ...libs.map((f) => `lib/${f}`), "index.php"]) {
    const src = readCode(`api/v2/${f}`);
    if (/(^|[^_a-zA-Z])(echo|print|printf|var_dump|print_r)\s*[(\s'"]/.test(src)) {
      if (f === "index.php" || f === "lib/http.php") continue;
      offenders.push(f);
    }
  }
  assertEq(offenders.length, 0, `files writing output directly: ${offenders.join(", ")}`);
});

check("no PHP warnings can leak into a response body", () => {
  const index = readCode("api/v2/index.php");
  assert(/ini_set\(\s*'display_errors'\s*,\s*'0'\s*\)/.test(index), "the front controller must switch display_errors off itself, not trust php.ini");
  assert(/error_reporting\(E_ALL\)/.test(index), "every error must still be reported — to the log, not to the client");
  assert(/log_errors/.test(index) || /error_log/.test(index), "there must be somewhere for a suppressed warning to go");
});

check("the front controller catches everything, not just PDOException", () => {
  const index = readCode("api/v2/index.php");
  assert(/catch\s*\(\s*Throwable/.test(index), "index.php must have a Throwable boundary");
  assert(/wx_error_boundary/.test(index), "unexpected throwables must go through wx_error_boundary");
});

check("error codes are the closed set", () => {
  const errors = readCode("api/v2/lib/errors.php");
  const declared = [...errors.matchAll(/const WX_ERROR_CODES = \[([^\]]+)\]/g)][0][1];
  const codes = [...declared.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  assertEq(codes.length, 8, "exactly eight codes, as §6.1 specifies");
  // Anywhere a code is thrown as a literal, it must be one of the eight.
  const used = new Set();
  for (const f of [...libs, ...routeFiles.map((f) => `../routes/${f}`)]) {
    const p = f.startsWith("../") ? `api/v2/${f.slice(3)}` : `api/v2/lib/${f}`;
    for (const m of readCode(p).matchAll(/new ApiError\(\s*'([A-Z_]+)'/g)) used.add(m[1]);
  }
  const invented = [...used].filter((c) => !codes.includes(c));
  assertEq(invented.length, 0, `codes outside the closed set: ${invented.join(", ")}`);
});

check("an unknown error code cannot become a ninth code", () => {
  const errors = readCode("api/v2/lib/errors.php");
  assert(/!in_array\(\$code, WX_ERROR_CODES, true\)/.test(errors), "an unknown code must fall back to INTERNAL");
});

check("request ids are validated when supplied by a client", () => {
  const http = readCode("api/v2/lib/http.php");
  assert(/preg_match/.test(http) && /X-WX-REQUEST-ID/i.test(read("api/v2/lib/http.php")), "a client-supplied request id must be shape-checked");
});

/* ============================================================== 3. session and CSRF */

const http = readCode("api/v2/lib/http.php");
const auth = readCode("api/v2/lib/auth.php");

check("the session cookie is HttpOnly + Secure + SameSite", () => {
  const flags = read("api/v2/lib/http.php");
  assert(/HttpOnly/.test(flags), "HttpOnly is missing");
  assert(/SameSite/i.test(flags), "SameSite is missing");
  assert(/Secure/i.test(flags), "Secure is missing (it must be conditionally off for plain-HTTP localhost only)");
  assert(/localhost/.test(flags), "the Secure exception must be limited to localhost");
});

check("the session cookie value is never stored in the database", () => {
  assert(/hash\('sha256'/.test(auth) || /hash\(\s*'sha256'/.test(auth) || /sha256/.test(auth), "the session id must be stored as a hash, never as the cookie value");
});

check("CSRF is required for every unsafe method", () => {
  assert(/wx_csrf_ok_for_method/.test(auth), "the CSRF decision must be centralised");
  const fn = auth.slice(auth.indexOf("function wx_csrf_ok_for_method"));
  assert(/GET/.test(fn) && /HEAD/.test(fn), "GET/HEAD must be the safe methods");
});

check("sessions die when the password changes", () => {
  assert(/pw_ver/.test(auth), "sessions must carry the password version they were created with");
});

check("the application secret is stored with a checksum", () => {
  const m = readSql("db/migrations/000_platform.sql");
  assert(/wx_secrets/.test(m), "wx_secrets must exist");
  assert(/checksum/.test(m), "the secret must be stored with a checksum so it can be verified without being printed");
});

check("login is throttled per account as well as per IP", () => {
  assert(/wx_login_attempts/.test(auth), "failures must be recorded per account");
  assert(/wx_throttle/.test(auth), "the IP throttle must still apply");
});

check("sign-in does not reveal whether an account exists", () => {
  const fn = auth.slice(auth.indexOf("function wx_login"));
  const first = fn.slice(0, 4000);
  assert(!/does not exist|no such user|unknown user/i.test(first), "the sign-in path must not distinguish a missing account from a wrong password");
});

check("the two-factor algorithm is unchanged from v2.1", () => {
  // v2.1: SHA-1, 30-second period, 6 digits, ±1 step. Changing any of these locks every enrolled user
  // out of their own account, which is the kind of 'improvement' nobody forgives.
  assert(/sha1/.test(auth), "2FA must keep using HMAC-SHA1 (RFC 6238)");
  assert(/30/.test(auth), "the 30-second period must be preserved");
  assert(/6/.test(auth), "six digits must be preserved");
});

check("the no-CORS decision is explicit", () => {
  const h = read("api/v2/lib/http.php");
  assert(/Access-Control-Allow-Origin/.test(h) === false || /never|deliberately|no CORS/i.test(h), "CORS must not be enabled by accident");
});

/* ============================================================== 4. database discipline */

const db = readCode("api/v2/lib/db.php");

check("UPDATE cannot run without a WHERE clause", () => {
  const fn = db.slice(db.indexOf("function wx_update"));
  assert(/where/.test(fn), "wx_update must require a where array");
  const guards = /if\s*\(\s*!\s*\$set\s*\|\|\s*!\s*\$where\s*\)/.test(fn)
    || /if\s*\(\s*!\s*\$where\s*\|\|\s*!\s*\$set\s*\)/.test(fn)
    || /(empty|count)\s*\(\s*\$where/.test(fn);
  assert(guards, "wx_update must refuse an empty where array");
});

check("no query is built by interpolating a variable into SQL", () => {
  const offenders = [];
  for (const f of [...libs.map((x) => `lib/${x}`), ...routeFiles.map((x) => `routes/${x}`)]) {
    const src = readCode(`api/v2/${f}`);
    for (const m of src.matchAll(/wx_(q|all|one|val|count)\(\s*"([^"]*)"/g)) {
      if (/\$\{?\w/.test(m[2])) offenders.push(`${f}: ${m[2].slice(0, 60)}`);
    }
  }
  assertEq(offenders.length, 0, `SQL built by string interpolation: ${offenders.join(" | ")}`);
});

check("a table name reaches SQL only after being checked", () => {
  /* Table names cannot be bound as query parameters, so they are the one identifier in the data layer
     that has to be concatenated. Every call site passes a literal — the check exists for the day one
     does not. */
  const db = readCode("api/v2/lib/db.php");
  assert(/function wx_table_name\(/.test(db), "db.php must own the table-name check");
  const fn = db.slice(db.indexOf("function wx_table_name("));
  const body = fn.slice(0, fn.indexOf("\n}", 10));
  assert(/preg_match/.test(body), "the check must be a pattern, not a list that goes stale");
  for (const caller of ["wx_insert", "wx_update", "wx_table_exists"]) {
    const at = db.indexOf(`function ${caller}(`);
    assert(at >= 0, `${caller} not found`);
    const chunk = db.slice(at, db.indexOf("\n}", at));
    assert(/wx_table_name\(\$table\)/.test(chunk), `${caller} must not paste an unvalidated table name into SQL`);
  }
});

check("a JSON store path cannot escape _private", () => {
  const store = readCode("api/v2/lib/store.php");
  const fn = store.slice(store.indexOf("function wx_store("));
  const body = fn.slice(0, fn.indexOf("\n}", 10));
  assert(/preg_match/.test(body), "the store name must be validated, not trusted — it becomes a path");
  assert(/'~\^\.\.|str_contains\(\$name, '\.\.'|strpos\(\$name, '\.\.'/.test(body), "a traversal segment must be refused");
  assert(/WX_PRIVATE_DIR/.test(body), "the path must be built from WX_PRIVATE_DIR, never the document root");
});

check("the sequence of schema changes matches the shipped dump", () => {
  const m = readCode("db/migrations/003_document_columns.sql");
  assert(/wx_quotes/.test(m) && /wx_invoices/.test(m) && /wx_projects/.test(m), "document columns must cover the three document tables");
  assert(/information_schema/.test(m), "every ALTER must be guarded through information_schema");
});

check("every ALTER is guarded so a re-run cannot fail", () => {
  const guards = [];
  for (const f of readdirSync(join(ROOT, "db/migrations")).filter((x) => x.endsWith(".sql"))) {
    const src = readSql(`db/migrations/${f}`);
    const alters = (src.match(/ALTER TABLE/g) || []).length;
    const prepared = (src.match(/PREPARE wx_stmt FROM @sql/g) || []).length;
    if (alters > prepared) guards.push(`${f}: ${alters} ALTERs, ${prepared} guards`);
  }
  assertEq(guards.length, 0, `unguarded ALTERs: ${guards.join(", ")}`);
});

check("the DDL guard pattern is the information_schema one", () => {
  const sql = readSql("db/migrations/000_platform.sql");
  assert(/ADD COLUMN IF NOT EXISTS/.test(sql) === false, "MySQL 8 has no ADD COLUMN IF NOT EXISTS — do not use it");
  assert(/information_schema\.COLUMNS/.test(sql), "column guards must read information_schema.COLUMNS");
  assert(/information_schema\.STATISTICS/.test(sql), "index guards must read information_schema.STATISTICS");
});

check("001_roles.sql is generated, not hand-written", () => {
  const src = read("db/migrations/001_roles.sql");
  assert(/GENERATED FILE — do not edit by hand/.test(src), "the generated header must say so");
  assert(/tools\/gen-caps\.mjs/.test(src), "the generator must be named");
  assert(/GENERATED FILE/.test(read("db/migrations/README.md")) || /generated/.test(read("db/migrations/README.md")), "the README must say 001 is generated");
});

/* ============================================================== 5. the eight Criticals */

check("C1: no shared demo password is printed or hard-coded", () => {
  const offenders = [];
  /* The trees that are in the repository. `woodex-vlive-P20/` and the other retired copies were deleted in P25
     (the record is in the memory's §8f, the bytes are in git history), so this check reads what ships. */
  for (const dir of ["frontend-v1", "woodex-live-p29-v2.1-pro/site"]) {
    if (!exists(dir)) continue;
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith(".php") || x.endsWith(".html"))) {
      const src = read(`/${dir}/${f}`.slice(1));
      /* Match the credential itself: the constant that held it, or the string. Not the word "demo" —
         the fixed installer still says "Demo Owner", which is a display name, not a password. */
      if (/Demo@Woodex2026|DEMO_PASS/.test(src)) offenders.push(`${dir}/${f}`);
    }
  }
  assertEq(offenders.length, 0, `hard-coded demo credentials still present: ${offenders.join(", ")}`);
});

check("C1b: the installer does not seed a well-known account", () => {
  const install = read("frontend-v1/wx-install.php");
  assert(!/['"]admin['"]\s*,\s*['"]admin['"]/.test(install), "the installer must not create admin/admin");
  assert(/password|pass_hash/i.test(install), "the installer must require a real password");
});

check("C2: cookies are HttpOnly everywhere they are set", () => {
  const h = read("api/v2/lib/http.php");
  const sets = [...h.matchAll(/setcookie\s*\(/g)].length + [...h.matchAll(/header\s*\(\s*['"]Set-Cookie/g)].length;
  if (sets > 0) {
    assert(/HttpOnly/.test(h), "every cookie this platform sets must be HttpOnly");
  }
});

check("C3: no credentials or secrets are tracked in the repository", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  const bad = tracked.filter((f) => /(^|\/)(\.env|db\.json|security\.json|demo\.json|credentials\.json)$/.test(f) && !/example/i.test(f));
  assertEq(bad.length, 0, `secret files tracked by git: ${bad.join(", ")}`);
});

check("C4: _private is not web-readable", () => {
  /* The API reads its credentials from WX_PRIVATE_DIR, which resolves to the *site root's* _private —
     api/v2/lib/bootstrap.php computes it as dirname(dirname(WX_V2_DIR)) . '/_private'. So the guard has
     to exist in every deployment root, not inside the library folder. */
  const guarded = [];
  for (const dir of ["_private", "frontend-v1/_private"]) {
    if (!exists(`${dir}/.htaccess`)) continue;
    const rule = read(`${dir}/.htaccess`);
    assert(/Require all denied|Deny from all/.test(rule), `${dir}/.htaccess exists but does not deny`);
    guarded.push(dir);
  }
  assert(guarded.length >= 2, `only ${guarded.length} _private director(ies) carry a deny rule`);
  assert(guarded.includes("_private"), "the site root the v2 API deploys to must ship _private/.htaccess");
  /* And the API's own folder must not serve its libraries: a route file run directly executes without
     the front controller's error boundary. */
  const api = read("api/v2/.htaccess");
  assert(/RedirectMatch 404 \^\/api\/v2\/lib\//.test(api), "api/v2/.htaccess must deny direct access to lib/");
  assert(/RedirectMatch 404 \^\/api\/v2\/routes\//.test(api), "api/v2/.htaccess must deny direct access to routes/");
});

check("C5: the login form does not pre-fill credentials", () => {
  const html = exists("admin-v25/index.html") ? read("admin-v25/index.html") : "";
  assert(!/value\s*=\s*['"](admin|owner|manager)['"]/i.test(html), "the app shell must not pre-fill a username");
  const api = read("admin-v25/src/lib/api.ts");
  assert(!/password\s*[:=]\s*['"][^'"]+['"]/.test(api), "no password may appear in the client source");
});

check("C6: no default-credential hint is served to visitors", () => {
  for (const f of ["frontend-v1/downloads.html", "admin-v25/dist/index.html"]) {
    if (!exists(f)) continue;
    const src = read(f);
    assert(!/sign\s*in\s*(with|as)\s*admin/i.test(src), `${f} must not advertise default sign-in credentials`);
  }
});

check("C7: writes must be audited", () => {
  const offenders = [];
  for (const f of routeFiles) {
    const src = readCode(`api/v2/routes/${f}`);
    /* Helpers that audit on their caller's behalf. wx_chat_lead_from() writes the lead and its audit row
       together, so a handler calling it has recorded the change — and the row is written in the right
       place, beside the row it describes rather than in the handler that asked for it. */
    const publicFns = new Set(routes.filter((rt) => publicRoutes().has(rt.pattern)).map((rt) => rt.fn));
    const auditingHelpers = new Set();
    for (const block of src.split(/\nfunction /).slice(1)) {
      const n = block.slice(0, block.indexOf("("));
      if (/wx_audit\s*\(/.test(block)) auditingHelpers.add(n);
    }
    /* The obligation is on the handler, not on every helper it uses: wx_chat_add() appends a message
       and is called by handlers that audit the change it belongs to (chat.reply, chat.note). Scanning
       helpers too would push an audit row into the middle of a transaction that is already covered. */
    for (const block of src.split(/\nfunction /).slice(1)) {
      const name = block.slice(0, block.indexOf("("));
      if (!name.startsWith("wx_route_")) continue;
      const writes = /wx_(insert|update|q)\(\s*['"`]?(INSERT|UPDATE|DELETE)/i.test(block) || /wx_doc_put|wx_insert|wx_update/.test(block);
      const audits = /wx_audit\s*\(/.test(block)
        || [...auditingHelpers].some((h) => h !== name && new RegExp(`\\b${h}\\s*\\(`).test(block));
      /* Two kinds of exception, both of which would be noise in the audit trail rather than facts in
         it: approval and login routes (the approval row and the session row are the record), and the
         infrastructure writers — the notification log and the rate-limit counter, which record that a
         message was queued or a request was refused, not that the business changed. */
      /* Exempt with a reason: the two counters and logs (a queued message, a refused request), and the
         two presence writes — clearing the unread badge and setting a typing timestamp. None of them is
         a change to the business, and an audit row for each would bury the ones that are. */
      const infra = /^(wx_route_chats_get|wx_route_chats_typing)$/.test(name);
      /* A visitor has no identity to attribute an audit row to. What protects those routes is the rate
         limit (checked separately above), and what records them is the conversation itself: wx_chats,
         wx_chat_msgs, and — the moment a phone number or an email appears — the lead and its audit row. */
      const anonRoute = publicFns.has(name);
      if (writes && !audits && !infra && !anonRoute && !/approval|auth|health/.test(f)) offenders.push(`${f} → ${name}`);
    }
  }
  assertEq(offenders.length, 0, `handlers that write without auditing: ${offenders.join(", ")}`);
});

check("C8: JSON stores are written atomically", () => {
  const store = readCode("api/v2/lib/store.php");
  assert(/flock/.test(store), "the store must lock");
  assert(/rename/.test(store), "the store must write to a temporary file and rename");
  assert(/tmp/i.test(store), "the temporary file must be named");
});

check("C8b: the non-atomic write pattern is gone from the new code", () => {
  const offenders = [];
  for (const f of libs) {
    const src = readCode(`api/v2/lib/${f}`);
    if (/file_put_contents\s*\(\s*[^,]+,\s*json_encode/.test(src)) offenders.push(f);
  }
  assertEq(offenders.length, 0, `unlocked JSON writes: ${offenders.join(", ")}`);
});

/* ============================================================== 6. the client */

check("the client keeps no session state in web storage", () => {
  for (const f of ["admin-v25/src/lib/api.ts", "admin-v25/src/lib/session.ts", "admin-v25/src/main.tsx"]) {
    if (!exists(f)) continue;
    /* readCode, not read: api.ts explains in a comment that the token is never written to
       localStorage, and an absence check that reads prose would fail the file for documenting itself. */
    const src = readCode(f);
    assert(!/localStorage|sessionStorage/.test(src), `${f} must not use web storage for session state`);
  }
});

check("the client sends the CSRF header on writes and never on reads", () => {
  const api = read("admin-v25/src/lib/api.ts");
  assert(/X-WX-CSRF/.test(api), "the CSRF header must be sent");
  assert(/(GET|HEAD)/.test(api) && /csrf/i.test(api), "the header must be conditioned on the method");
  assert(/credentials:\s*["']same-origin["']/.test(api), "the client must send the cookie");
});

check("the prototype does not contain a second API layer", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".smoke") continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith("lib/api.ts")) files.push(p);
    }
  };
  walk("admin-v25/src");
  const offenders = files.filter((f) => /fetch\(\s*['"`]\/api\//.test(read(f)));
  assertEq(offenders.length, 0, `screens calling the API directly instead of through lib/api.ts: ${offenders.join(", ")}`);
});

/* ============================================================== 7. generated artefacts */

check("the alias table is current", () => {
  const out = execFileSync("node", ["tools/gen-aliases.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert(/up to date|current/i.test(out), `gen-aliases --check said: ${out.trim()}`);
});

check("the capability matrix is current", () => {
  const out = execFileSync("node", ["tools/gen-caps.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert(/match|current/i.test(out), `gen-caps --check said: ${out.trim()}`);
});

check("the alias table covers every action the live admin calls", () => {
  const json = JSON.parse(read("api/v2/aliases.json"));
  const count = json.count ?? json.total ?? Object.keys(json.actions || json).length;
  assert(count >= 365, `the alias table lists ${count} actions; the live dispatcher has 365`);
});

/* ============================================================== 8. the legacy door */

const legacy = read("api/v2/routes/legacy.php");

check("the legacy bridge is an explicit allow-list", () => {
  assert(/function wx_legacy_bridged\(\)/.test(legacy), "the bridged actions must be an explicit list");
  assert(/Not served by api\/v2 yet/.test(legacy), "an unbridged action must say so rather than guess");
});

check("the legacy door returns the v2.1 shape, not the v2 envelope", () => {
  assert(/array_merge\(\['ok' => true\], \$payload/.test(legacy), "legacy responses must stay flat for old clients");
  assert(/'error' => \$e->getMessage\(\)/.test(legacy), "legacy clients render `error` as a string");
  const index = read("api/v2/index.php");
  assert(/wx_is_legacy_request\(\)/.test(index), "the front controller must branch on the legacy door");
});

/* ============================================================== 9. documentation */

check("the shipped plan names the same action count", () => {
  /* The plan that stands is MASTER-PLAN-P25.2.md (15 Oct clean-up: the superseded master plans are in
     git history, and one plan family is the point). The guard is unchanged: documentation must carry
     the real action count, and no stale one. */
  const plan = read("MASTER-PLAN-P25.2.md");
  assert(/365/.test(plan), "the plan must state the action count");
  assert(!/\b364\b/.test(plan.replace(/364[-–]/g, "three-sixty-four-")), "no stale 364 may remain in the plan");
});

check("the plan records its local-engine evidence by name", () => {
  const plan = read("MASTER-PLAN-P25.2.md");
  assert(/conformance\.mjs/.test(plan), "the plan must name the conformance suite");
  assert(/roundtrip/.test(plan), "the plan must name the round-trip test");
});

/* ============================================================== 10. the money rule */

const routesSrc = readCode("api/v2/routes/leads.php");

check("money is validated in one place", () => {
  assert(/function wx_v_pkr\(/.test(readCode("api/v2/lib/validate.php")), "wx_v_pkr must live in validate.php");
  assert(!/\(int\)\s*round\([^)]*\*\s*100\s*\)/.test(routesSrc), "a route must not do its own money conversion");
});

/* ============================================================== 11. Phase 2 structure
   Phase 2 is the money path. The checks below are the ones whose failure would be expensive and
   quiet: a total computed in two places, a receipt number that can be reissued, an approval policy
   that drifted from the one people have been using, a permission check that happens after the
   request has already been filed. */

const money = read("api/v2/lib/money.php");
const invoices = read("api/v2/routes/invoices.php");
const approvals = read("api/v2/lib/approvals.php");
const approvalsRoute = read("api/v2/routes/approvals.php");
const migration6 = read("db/migrations/006_payments_approvals.sql");

check("money is a whole number of rupees everywhere in v2", () => {
  const scanned = readdirSync(join(ROOT, "api/v2/lib")).map((f) => readCode(`api/v2/lib/${f}`))
    .concat(readdirSync(join(ROOT, "api/v2/routes")).map((f) => readCode(`api/v2/routes/${f}`)));
  const offenders = scanned.filter((src) => /wx_v_money|wx_money_out/.test(src));
  assertEq(offenders.length, 0, "the paisa helpers still exist — the unit must be the rupee, as v2.1 stores it");
  const validate = readCode("api/v2/lib/validate.php");
  assert(/function wx_v_pkr\(/.test(validate), "wx_v_pkr must be the money validator");
  assert(/function wx_pkr_out\(/.test(validate), "wx_pkr_out must be the formatter");
  /* And the unit has to be written down where a schema reader will find it. */
  const col3 = readSql("db/migrations/003_document_columns.sql");
  for (const col of ["subtotal", "tax", "total", "paid", "value"]) {
    assert(new RegExp(`ADD COLUMN ${col} BIGINT`).test(col3), `${col} must be BIGINT rupees, not INT — the INT ceiling is 2.1 billion and it fails on the biggest invoice of the year`);
  }
  assert(/DECIMAL|FLOAT|DOUBLE/.test(col3) === false, "money must not be a float column — 0.1 + 0.2 is not a rupee");
  assert(/whole rupees/i.test(read("db/migrations/003_document_columns.sql")), "003 must state the unit in prose too");
});

check("document arithmetic has exactly one implementation", () => {
  const writers = [];
  for (const dir of ["api/v2/lib", "api/v2/routes"]) {
    for (const f of readdirSync(join(ROOT, dir))) {
      const src = readCode(`${dir}/${f}`);
      if (/\$\w+\['tax'\]\s*=/.test(src) && f !== "money.php") writers.push(`${dir}/${f}`);
    }
  }
  assertEq(writers.length, 0, `tax is computed outside lib/money.php: ${writers.join(", ")}`);
  assert(/function wx_doc_totals\(/.test(money), "wx_doc_totals must exist as the single implementation");
  assert(/function wx_numv\(/.test(money), "numv() must be ported, not re-invented, or negative quantities slip through");
});

check("an invoice's displayed total is the stored total, not a recomputation", () => {
  const fn = money.slice(money.indexOf("function wx_inv_public("));
  const body = fn.slice(0, fn.indexOf("\nfunction ", 10));
  assert(/isset\(\$invoice\['total'\]\)/.test(body), "wx_inv_public must use the stored total and only compute when it is absent");
  assert(/\$invoice\['total'\]/.test(body), "wx_inv_public must read the stored total");
});

check("milestone billing is percentage-based, as v2.1 bills it", () => {
  const projects = readCode("api/v2/routes/projects.php");
  assert(/'label'\s*=>\s*wx_v_string/.test(projects) && /'pct'\s*=>\s*\$pct/.test(projects), "milestones must carry label + pct");
  assert(/abs\(\$sum - 100\)/.test(projects), "the milestone percentages must be required to add up to 100");
  assert(/already billed/.test(projects), "a billed milestone must refuse to change");
  assert(/projects\/\{id\}\/bill/.test(router), "the bill route must be registered");
});

check("the migrations are present, numbered in order, with no gaps", () => {
  const files = readdirSync(join(ROOT, "db/migrations")).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const numbers = files.map((f) => Number(f.slice(0, 3)));
  /* Derived from the directory rather than a literal: the count in this assertion went stale three
     migrations in a row, which is the definition of a check that tests nothing. What matters is that the
     series starts at 000, has no hole in it, and that the file the README's table describes exists. */
  assertEq(numbers[0], 0, `the series must start at 000, found ${numbers[0]}`);
  numbers.forEach((n, i) => assertEq(n, i, `gap in the migration series at ${files[i]}`));
  numbers.forEach((n, i) => assertEq(n, i, `migration ${String(n).padStart(3, "0")} leaves a gap in the series`));
});

check("the Phase 2 migrations only add: they never drop or rewrite business data", () => {
  for (const f of ["006_payments_approvals.sql", "007_inbox_columns.sql", "008_security_state.sql"]) {
    const c = readSql(`db/migrations/${f}`);
    assert(!/\bDROP\b/i.test(c), `${f} must not drop anything`);
    assert(!/\bDELETE\b/i.test(c), `${f} must not delete rows`);
    assert(!/^\s*UPDATE\b/im.test(c), `${f} must not rewrite existing rows`);
  }
  const code = readSql("db/migrations/006_payments_approvals.sql");
  assert(!/\bDROP\b/i.test(code), "006 must not drop anything");
  assert(!/\bDELETE\b/i.test(code), "006 must not delete rows — moving data is db/backfill_payments.php's job");
  assert(!/^\s*UPDATE\b/im.test(code), "006 must not rewrite existing rows");
  assert(/CREATE TABLE IF NOT EXISTS wx_invoice_payments/.test(code), "the payments table must be created");
  assert(/CREATE TABLE IF NOT EXISTS wx_approvals/.test(code), "the approvals table must be created");
});

check("a receipt is a row, not an element of the invoice JSON", () => {
  const scheme = readSql("db/migrations/006_payments_approvals.sql");
  assert(/UNIQUE KEY wx_payments_rcpt_uniq \(rcpt\)/.test(scheme), "receipt numbers must be unique in the database");
  assert(!/\$inv\['payments'\]\[\]/.test(readCode("api/v2/routes/invoices.php")), "nothing may push onto the invoice's payments array");
  assert(/wx_invoice_payments/.test(readCode("api/v2/lib/money.php")), "payments are read from their table");
});

check("a receipt number cannot be reissued after a reversal", () => {
  const src = readCode("api/v2/routes/invoices.php");
  assert(/\$seq = \(int\) \(\$inv\['seqPay'\] \?\? 0\) \+ 1/.test(src), "receipt numbers must come from the invoice's monotonic seqPay counter");
  assert(!/-R' \. \(count\(/.test(src), "counting the payment rows reissues a number after a reversal");
  assert(/reversed_at/.test(src), "a reversal must mark the row rather than delete it");
});

check("the approval policy is a copy of v2.1's, verified as a copy", () => {
  const v21 = read("frontend-v1/api/approvals-lib.php");
  const literal = (src, name) => {
    const m = new RegExp(name + "\\s*=\\s*'(~[\\s\\S]*?~)'").exec(src);
    assert(m, `${name} not found`);
    return m[1];
  };
  assertEq(literal(approvals, "WX_APPR_SKIP"), literal(v21, "APPR_SKIP"), "the never-queued list has drifted from v2.1");
  assertEq(literal(approvals, "WX_APPR_WRITE"), literal(v21, "APPR_WRITE"), "the write-detection pattern has drifted from v2.1");
  const list = (src, name) => {
    const m = new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]").exec(src);
    return m[1].split(",").map((x) => x.trim()).filter(Boolean).sort();
  };
  for (const k of ["EXTRA_WRITE", "READS", "BUILDER_WRITE"]) {
    assertEq(list(approvals, "WX_APPR_" + k).join("|"), list(v21, "APPR_" + k).join("|"), `the ${k} list has drifted from v2.1`);
  }
});

check("an approved request is replayed, never retyped", () => {
  assert(/function wx_appr_replay\(/.test(approvals), "the replay must exist");
  assert(/WX_APPR_REPLAY/.test(approvals), "a replay must be marked so it cannot be queued again");
  assert(/status' => 'applying'/.test(approvals), "a replay in progress must be visible on the queue");
  assert(/returned to the queue/.test(approvals), "a failed replay must return the item to pending with its error");
});

check("only the Master decides", () => {
  for (const fn of ["wx_route_approvals_approve", "wx_route_approvals_reject", "wx_route_approvals_cfg_save"]) {
    const body = approvalsRoute.slice(approvalsRoute.indexOf(`function ${fn}(`));
    const chunk = body.slice(0, body.indexOf("\nfunction ", 10));
    assert(/wx_is_master\(\$u\)/.test(chunk), `${fn} must require the Master`);
  }
  assert(/function wx_is_master\(/.test(readCode("api/v2/lib/auth.php")), "wx_is_master must be the one definition of the Master role");
});

check("every unsafe route either passes the approval gate or is explicitly never queued", () => {
  /* The list of actions the policy never queues lives in approvals.php and is asserted to match v2.1's
     byte for byte above. Reading it here means a route cannot be ungated by accident, and an action
     cannot be quietly dropped from the queue by adding a row to a regex — the two have to agree. */
  const skip = /WX_APPR_SKIP\s*=\s*'(~[\s\S]*?~)'/.exec(read("api/v2/lib/approvals.php"))[1];
  const skipRe = new RegExp(skip.slice(1, -1));
  const ungated = [];
  for (const r of routes) {
    if (r.action === null || ["GET", "HEAD", "OPTIONS"].includes(r.method)) continue;
    const src = readCode(`api/v2/routes/${r.file}.php`);
    const at = src.indexOf(`function ${r.fn}(`);
    if (at < 0) continue;
    const next = src.indexOf("\nfunction ", at + 10);
    const body = src.slice(at, next === -1 ? undefined : next);
    if (/wx_appr_route\s*\(|wx_appr_wrap\s*\(/.test(body) || skipRe.test(r.action)) continue;
    ungated.push(`${r.method} /${r.pattern} (${r.action})`);
  }
  assertEq(ungated.length, 0, `unsafe routes that bypass the queue without the policy saying so: ${ungated.join(", ")}`);
});

/* The mirror image, and it was a real bug: a route wrapped in the gate whose action the policy would never
   queue has a gate that is decoration. POST /pages passed `page_write` — a name no verb matches — so a
   Manager could edit any of the 150 pages with no approval, while needing one to change a section block.
   The same read now checks the direction the first check cannot see. */
check("a gated route's action can actually be queued, or the policy says why not", () => {
  const approvals = read("api/v2/lib/approvals.php");
  const write = /WX_APPR_WRITE\s*=\s*'(~[\s\S]*?~)'/.exec(approvals)[1];
  const writeRe = new RegExp(write.slice(1, -1));
  const skip = /WX_APPR_SKIP\s*=\s*'(~[\s\S]*?~)'/.exec(approvals)[1];
  const skipRe = new RegExp(skip.slice(1, -1));
  const listOf = (name) => {
    const m = new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]").exec(approvals);
    return m ? m[1].split(",").map((x) => x.trim().replace(/^'|'$/g, "")).filter(Boolean) : [];
  };
  /* `WX_APPR_NEVER` is a map of action → reason, with comments between the entries, so its keys are read
     with a pattern rather than by splitting on commas: an entry whose reason stopped parsing would silently
     turn into an "unexplained" entry, which is the one thing the list must never contain. */
  const neverBody = /const WX_APPR_NEVER = \[([\s\S]*?)\n\];/.exec(approvals);
  const never = neverBody ? [...neverBody[1].matchAll(/'([a-z0-9_]+)'\s*=>/g)].map((m) => m[1]) : [];
  const entries = neverBody ? [...neverBody[1].matchAll(/'([a-z0-9_]+)'\s*=>\s*'([^']{10,})'/g)].map((m) => m[1]) : [];
  const extra = listOf("WX_APPR_EXTRA_WRITE");
  const builder = listOf("WX_APPR_BUILDER_WRITE");
  const reads = listOf("WX_APPR_READS");
  const queued = (action, src) => {
    if (never.includes(action) || skipRe.test(action) || reads.includes(action)) return false;
    if (src === "builder") return builder.includes(action);
    return extra.includes(action) || writeRe.test(action);
  };
  /* "The policy says why not" has three forms, and all three are checked facts rather than absences: the
     never-queued map (with its reason), v2.1's own skip/read lists (asserted byte-identical above), and a
     queued action for either source. Anything else is a gate that cannot fire. */
  const whyNot = (action) => never.includes(action) || skipRe.test(action) || reads.includes(action);

  const decorative = [];
  for (const r of routes) {
    if (["GET", "HEAD", "OPTIONS"].includes(r.method)) continue;
    const src = readCode(`api/v2/routes/${r.file}.php`);
    const at = src.indexOf(`function ${r.fn}(`);
    if (at < 0) continue;
    const next = src.indexOf("\nfunction ", at + 10);
    const body = src.slice(at, next === -1 ? undefined : next);
    const m = /wx_appr_route\s*\(\s*'([a-z0-9_]+)'/.exec(body);
    if (!m) continue;
    const action = m[1];
    if (queued(action, "admin") || queued(action, "builder") || whyNot(action)) continue;
    decorative.push(`${r.method} /${r.pattern} (${action})`);
  }
  assertEq(decorative.length, 0, `gated routes whose action can never be queued: ${decorative.join(", ")}`);

  /* Every entry in the never-queued list has to carry a reason. The list is the only place standing between
     a route and a silent skip, and "we do not queue this" without a why is how that happens. */
  assertEq(entries.length, never.length, `WX_APPR_NEVER entries without a reason: ${never.filter((a) => !entries.includes(a)).join(", ")}`);
});

check("a change is permission-checked before it is filed for approval", () => {
  const offenders = [];
  for (const f of readdirSync(join(ROOT, "api/v2/routes"))) {
    const src = readCode(`api/v2/routes/${f}`);
    for (const block of src.split(/\nfunction /).slice(1)) {
      if (!/wx_appr_wrap\(/.test(block)) continue;
      const name = block.slice(0, block.indexOf("("));
      /* wx_appr_route() is wx_appr_wrap() with the permission check built in; calling the raw wrapper
         without one is what this check exists to catch. */
      if (!/wx_require_user\(/.test(block) && !/wx_appr_route\(/.test(block)) offenders.push(`${f} → ${name}`);
    }
  }
  assertEq(offenders.length, 0, `these queue a request without checking the requester may make it: ${offenders.join(", ")}`);
});

check("the queue and the receipts live in the database, not in files", () => {
  for (const f of readdirSync(join(ROOT, "api/v2/lib"))) {
    const src = readCode(`api/v2/lib/${f}`);
    assert(!/approvals\.json|approvals-cfg\.json/.test(src), `${f} still reads the v2.1 approval file`);
  }
  assert(/wx_approvals/.test(approvals), "the queue must be the wx_approvals table");
  assert(/wx_invoice_payments/.test(readCode("api/v2/routes/invoices.php")), "receipts must be rows");
});

check("a document number is reserved under a lock and proven free", () => {
  const src = readCode("api/v2/lib/docs.php");
  assert(/function wx_next_doc_no\(string \$line = ''/.test(src), "numbering must take the business line, because furniture has its own series");
  assert(/wx_tx\(/.test(src), "the counter must be reserved inside a transaction");
  assert(/AND v = \?/.test(src), "the reservation must be conditional on the value that was read");
  assert(/SELECT no FROM wx_invoices WHERE no = \?/.test(src), "a rolled-back counter must not reissue a number that exists");
});

check("the payments backfill can be run twice without changing anything", () => {
  const src = readCode("db/backfill_payments.php");
  assert(/--dry-run/.test(src), "the backfill must support a dry run");
  assert(/already present|isset\(\$existing\[\$rcpt\]\)/.test(src), "the backfill must skip receipts that are already copied");
  assert(/--verify/.test(src), "the backfill must be able to prove the two stores agree");
});

check("the site's own script drives what the admin writes", () => {
  /* Two of the three hero features are markup plus styles; the third is behaviour, and behaviour lives in
     `assets/site.js` — a file the admin never touches and no test had ever looked at. It was wrong in three
     ways when this check was written, and all three were invisible from the admin: a hidden slide was still
     rotated into view, the interval the screen sets was ignored in favour of a constant, and a page switched
     to the slider design had no driver at all — it would sit on slide one forever. */
  const js = read("assets/site.js");
  assert(/:not\(\[data-hm-off\]\)/.test(js), "a slide the admin hid must not be rotated back into view");
  assert(/getAttribute\('data-interval'\)/.test(js), "the interval the screen writes must be the interval the site uses");
  assert(/\.wxh--slider/.test(js) && /querySelectorAll\('\.wxh-slide'/.test(js), "the slider design the admin can give any page needs its driver");
  assert(/prefers-reduced-motion/.test(js), "and a visitor who asked for less motion must not get a slideshow anyway");
});

check("the designs the admin writes are in the stylesheet the site loads", () => {
  /* The same class of bug from the other side: markup written into a page is only a design if a stylesheet
     the page actually links draws it. `assets/site.css` is the only sheet a live page loads, so every class
     the hero renderer writes has to be in there. */
  const css = read("assets/site.css");
  const php = read("api/v2/lib/heroes.php");
  const wanted = ["wxh", "wxh-in", "wxh-media", "wxh-copy", "wxh-crumbs", "wxh-k", "wxh-t", "wxh-lead", "wxh-btns", "wxh-btn", "wxh-btn--ghost", "wxh-dots", "wxh-dot"];
  for (const cls of wanted) {
    assert(css.includes(`.${cls}`), `the hero designs write .${cls}, so assets/site.css has to draw it`);
  }
  for (const tpl of ["image", "split", "center", "plain", "compact", "slider"]) {
    assert(php.includes(`'${tpl}' =>`), `the ${tpl} design is one of the six and has to be declared`);
    assert(css.includes(`.wxh--${tpl}`), `and the stylesheet has to draw .wxh--${tpl}`);
  }
});

check("the projects screens read the fields the server actually sends", () => {
  /* A row is built once, on the server (`wx_proj_row()`), and read by two screens — the table and the
     timeline. This is the drift check: every field those screens read has to be a key the server sets, or a
     column silently renders blank and somebody reports "the balance column is empty" months later. It runs
     the other way too — the two progress numbers are asserted by name, because v2.1 shipped one field that
     meant two different things and printed it as both. */
  const php = readCode("api/v2/routes/projects.php");
  const row = php.slice(php.indexOf("function wx_proj_row("), php.indexOf("function wx_proj_kpi("));
  const keys = new Set([...row.matchAll(/^\s{8}'([A-Za-z_][A-Za-z0-9_]*)' =>/gm)].map((m) => m[1]));
  for (const k of ["stageProgress", "billedPct", "invoiced", "received", "balance", "unbilled", "late", "milestones"]) {
    assert(keys.has(k), `wx_proj_row() has to set "${k}" — the screens read it by that name`);
  }
  assert(!/^\s{8}'progress' =>/m.test(row), "and there is no bare `progress`: two different answers cannot share one name");

  const screen = readCode("admin-v25/src/screens/LiveProjects.tsx") + readCode("admin-v25/src/screens/LiveTimeline.tsx");
  for (const k of ["stageProgress", "billedPct", "invoicedDisplay", "balanceDisplay", "unbilledDisplay", "milestones" ]) {
    assert(screen.includes(k), `the screens read "${k}" — so the server must keep sending it`);
  }
  /* The filters are the one place a person's text reaches SQL, and the parameters are built separately
     exactly so this can be checked. */
  const filter = php.slice(php.indexOf("function wx_proj_filter("), php.indexOf("function wx_proj_row("));
  assert(/\$params\[\] = \$line/.test(filter), "a filter value is a bound parameter");
  assert(!/\$where\[\] = .*\$line\b(?!.*\?)/.test(filter.replace(/\$cols\['line'\]/g, "")), "and never part of a SQL fragment");
  assert(!/\$text\b.*\$where\[\] = [^;]*\$text/.test(filter), "neither is the search string");
});

check("the client's page is one page and cannot be scripted into", () => {
  /* The page a client opens with no session is the one place in the product that renders text a member of
     staff typed to somebody outside the company. Two properties keep it safe and they are both structural:
     it carries no JavaScript at all (so a note cannot become code, whatever it contains), and every attribute
     it writes goes through htmlspecialchars. Asserted on the source, so a later edit that adds a script tag to
     "make it nicer" fails here rather than in a client's browser. */
  const cv = readCode("api/v2/lib/clientview.php");
  assert(!/<script/i.test(cv), "the client's page carries no script tag");
  assert(!/onclick=|onerror=|onload=/i.test(cv), "and no inline handler");
  assert(/htmlspecialchars\(/.test(cv), "every value it prints is escaped");
  /* The update it shows is decided by one function, which is what makes "did the client see this?" answerable. */
  assert(/function wx_cv_visible\(/.test(cv), "what the client may read is one function");
  assert(/empty\(\$u\['toClient'\]\)/.test(cv), "and an entry without the mark is not it");
  /* The link token is the same construction as the quotation link: an HMAC over the id and the number, and a
     shape check before any query runs. */
  assert(/hash_hmac\('sha256', WX_CV_PREFIX/.test(cv), "the link is an HMAC, not a guessable id");
  assert(/function wx_cv_token_ok\(/.test(cv), "and its shape is checked before the database is asked");
});

check("a message this console cannot carry is never recorded as sent", () => {
  /* v2.5 has no WhatsApp or SMTP transport yet — the plan puts it in Phase 4 with the WhatsApp suite — and the
     plan's own record (v2.1's notify-lib.php) is the live sender. The failure mode to guard against is a log
     that says "queued" while nothing left the building: a studio that believes a customer was told when
     nobody was, and a once-only mark that silences the message for good. So the word does not appear. */
  const notify = readCode("api/v2/lib/notify.php");
  assert(!/'queued'/.test(notify), "the notify library never records a message as queued");
  assert(/const WX_NOTIFY_TRANSPORT = false;/.test(notify), "the transport is declared, not implied");
  assert(/no transport yet/.test(notify), "and a channel that is configured but cannot send says so");
  /* The mark that means "the client has been told" is only set when something was actually carried. */
  const stage = notify.slice(notify.indexOf("function wx_notify_project_stage("));
  assert(/\$r\['carried'\]/.test(stage), "the once-only mark waits for a message that left");
  /* The screen has to say it too, in words, or the operator never learns it. */
  const screen = readCode("admin-v25/src/screens/LiveUpdates.tsx");
  assert(/Phase 4/.test(screen) && /records/.test(screen), "the notifications screen explains who sends today");
  assert(/client’s own page/.test(screen) || /client's own page/.test(screen), "and that the page is what works now");
  /* Which events are live here is a server fact (`WX_NOTIFY_WIRED`), so the screen reads it rather than
     knowing it — a second copy of that list is a second opinion about what the product does. */
  assert(/transport\.wired/.test(screen), "the screen reads which events this build composes from the API");
});

check("the checker\u2019s own comment stripper keeps string literals", () => {
  /* This file reads PHP and TSX as text and asserts things about it, so its own reader is part of the
     evidence — and it was wrong in a way that hid data: a fixture key ending in a star (the sample behind
     one page of a kind) contains the two characters that open a block comment, so the regex version
     deleted everything from that string to the next end-of-comment marker and the check below reported
     the file as fine. A tool that quietly drops the thing it is checking is worse than no tool. */
  const src = 'const a = "/x/*";\n/* a comment */\nconst b = "kept"; // trailing\n';
  const out = stripComments(src);
  assert(out.includes('"/x/*"'), "a string that looks like a comment opener is left alone");
  assert(out.includes('"kept"'), "and code after a real block comment survives");
  assert(!out.includes("a comment"), "the real block comment is gone");
  assert(!out.includes("trailing"), "and so is a line-leading one, after the quote closed");
});
check("no screen has a sample behind it, and every screen that reads the API says so when it cannot", () => {
  /* This replaced the check that demo mode answered exactly the screens with a fixture. The fixtures are gone —
     `lib/demo.ts`, `lib/mock.ts`, the door, the banner, `?demo=1`, `VITE_WX_DEMO` — and the failure mode this
     guards is the reverse of the old one: a screen that still has a way to draw numbers nobody sent. The three
     things asserted are (1) nothing sample-shaped survives anywhere in the console, (2) every screen that reads
     a path through `useLive` has a branch for a host that does not answer, and (3) the offline sentence is the
     shell's own words rather than each screen's invention. */
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk("admin-v25/src");
  assert(files.length >= 40, `the console has sources to read (found ${files.length})`);
  assert(!existsSync("admin-v25/src/lib/demo.ts") && !existsSync("admin-v25/src/lib/mock.ts"), "the sample files are deleted, not merely unused");

  const forbidden = [
    [/VITE_WX_DEMO/, "the demo flag"],
    [/demoFixture|\bmock\.ts\b|\.\/lib\/demo\b/, "an import of a fixture"],
    [/DemoBanner|DemoDoor/, "the banner or the door"],
    [/[?&]demo=1/, "the query string"],
  ];
  const offenders = [];
  for (const f of files) {
    const src = stripComments(read(f));
    for (const [re, what] of forbidden) if (re.test(src)) offenders.push(`${f} → ${what}`);
  }
  assertEq(offenders.length, 0, `sample data reaching a screen again: ${offenders.join(", ")}`);

  /* A screen is not only a file in `screens/`: the panels live in `components/`. Every file that reads a path
     on mount has to have an answer for a host that does not answer it — the state a cut-over spends its time
     in, and the state that used to be papered over with a sample. */
  const screens = ["LiveProjects", "LiveTimeline", "LiveUpdates", "LiveForms", "LiveEstimator", "LiveHeroes",
    "LiveTemplates", "LiveBusiness", "LiveApprovals", "LiveSeo", "LivePages", "LiveLibrary", "LiveSiteTheme",
    "LivePlacements", "LiveRedirects", "LiveContent", "LiveMedia", "LiveGlobal"];
  const path = (n) => (n === "LiveGlobal" ? "admin-v25/src/screens/LiveGlobal.tsx" : `admin-v25/src/screens/${n}.tsx`);
  const silent = [];
  let readers = 0;
  for (const n of screens) {
    const src = read(path(n));
    if (!/useLive</.test(src)) continue;
    readers++;
    /* The offline branch: either the screen names the host itself, or it hands the same state to `Empty` and
       the shared pill says it — both are honest, so the check accepts either and requires one. */
    if (!/api\/v2 is not answering|Not connected|link === "offline"/.test(src)) silent.push(n);
  }
  assert(readers >= 12, `screens read the API at all (found ${readers})`);
  assertEq(silent.length, 0, `screens with no state for a host that does not answer: ${silent.join(", ")}`);

  /* And the sentence is one function, so it cannot differ between screens. */
  const live = readCode("admin-v25/src/lib/live.ts");
  assert(/export function linkLabel\(/.test(live), "the strip's sentence is one function");
  assert(/api\/v2 is not answering/.test(live), "and it names the host rather than a sample");
  assert(!/demo data/i.test(live), "with no clause about sample data left in it");
  const shell = readCode("admin-v25/src/components/Shell.tsx");
  assert(/linkPill\(link\)/.test(shell) && /linkText/.test(shell), "the shell draws the pill and the sentence it was given");
  assert(!/demo/i.test(shell), "and the shell carries no demo anything");
});

check("the starter quotation templates are generated from the file the site loads", () => {
  /* Nine BOQ templates and eighty line items exist twice on purpose: once as the site's own
     `assets/js/quotation-templates.js` (what the studio edits and the website loads) and once as
     `api/v2/data/quote-starters.json` (what the console imports from). Generated by
     `tools/gen-quote-starters.mjs`, so this check is the same extraction run again — a rate changed in one
     copy and not the other fails here rather than becoming a quotation with the old price in it. */
  const generated = renderStarters(extractStarters());
  const onDisk = read("api/v2/data/quote-starters.json");
  /* Compared line by line so the failure says *where* the two copies disagree. Dumping nine templates and
     eighty line items into a one-line assertion turns a five-second fix into a scroll. */
  if (onDisk !== generated) {
    const a = onDisk.split("\n");
    const b = generated.split("\n");
    const i = a.findIndex((line, n) => line !== b[n]);
    throw new Error(
      `api/v2/data/quote-starters.json has drifted from the file the site loads — run node tools/gen-quote-starters.mjs ` +
        `(line ${i + 1}: ${JSON.stringify(a[i])}, expected ${JSON.stringify(b[i])})`,
    );
  }
  const rows = JSON.parse(onDisk);
  assertEq(rows.length, 9, "nine templates ship");
  assert(
    rows.every((t) => t.name && t.sections.length && t.sections.every((s) => s.items.length)),
    "every starter has a name, sections and lines",
  );
  const kinds = new Set(["design", "fitout", "renovation", "other"]);
  assert(rows.every((t) => kinds.has(t.kind)), "and a kind the server accepts, so nothing is filed under Other by accident");
});

check("the business details are read off the site, and written as one undoable batch", () => {
  /* The two things v2.1's Business info screen got wrong, asserted as properties of the code rather than
     described in a comment. First: it believed a stored copy of its own defaults was what the website
     said, so on this site — where the footer opens at 9:30 and the default record said 10:00 — every
     replacement matched nothing and the screen reported success. Second: it wrote the pages one at a time
     from the browser, so a tab closed halfway left half the pages updated with nothing recording which. */
  const lib = readCode("api/v2/lib/business.php");
  const routes = readCode("api/v2/routes/business.php");

  /* The baseline, in the order that makes it honest: what this console applied, else what a real page
     says, else the defaults — and it says which of the three it used. */
  const applied = lib.slice(lib.indexOf("function wx_biz_applied("));
  const body = applied.slice(0, applied.indexOf("\n}\n"));
  assert(/wx_biz_stored\(WX_BIZ_SETTING_APPLIED\)/.test(body), "the applied copy is read first");
  assert(/wx_biz_from_site\(/.test(body), "and when nobody has applied anything, a real page is read");
  assert(/source/.test(body), "the answer carries where it came from, so a screen can name it");
  assert(/function wx_biz_read_html\(/.test(lib), "reading what a page says is a function, not an assumption");

  /* One batch, one undo: the pages go through the same writer the header/footer screen uses, and the two
     asset files through the only writer of a non-page file. */
  const apply = lib.slice(lib.indexOf("function wx_biz_apply("));
  const applyBody = apply.slice(0, apply.indexOf("\n}\n"));
  assert(/wx_page_write_many\(/.test(applyBody), "the pages are written as one batch, so the change is one rollback");
  assert(/wx_write_file_atomic\(/.test(applyBody), "and the site's scripts through the atomic file writer");
  assert(/wx_biz_store\(WX_BIZ_SETTING_APPLIED/.test(applyBody), "the applied copy is recorded after the write, not before it");
  /* The report lists what a person typed. The sentinel moves that protect the WhatsApp link stay out of the
     list and are counted instead, so the screen can say the link is being rewritten rather than imply a
     search string of "\x01WA\x01" is something somebody types. */
  assert(/wx_biz_pairs_visible\(\$pairs\)/.test(routes), "the check reports the pairs a person typed, not the internal moves");
  assert(/wx_audit\s*\(/.test(routes), "the change is audited by the route that makes it");
});

check("a business pair is never built out of an empty string", () => {
  /* The one mistake in this port that would have been catastrophic rather than wrong: `str_replace('', 'x')`
     inserts between every byte of every page. v2.1 guarded its `add()` helper and nothing else; the
     sentinel pairs it pushed by hand are guarded here too. Asserted structurally because the property is
     about a combination of inputs a test can only sample. */
  const lib = readCode("api/v2/lib/business.php");
  const fn = lib.slice(lib.indexOf("function wx_biz_pairs("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert(/\$a === '' \|\| \$b === ''/.test(body) || /=== ''/.test(body), "the pair builder refuses an empty side");
  assert(/\$seen\[/.test(body), "and refuses to emit the same pair twice");
  assert(/\$sentinel/.test(body), "the WhatsApp number travels through a sentinel, as v2.1's did");
  /* Every pair goes through `$add()` — the guarded helper. A bare `$pairs[] =` is how an unguarded pair
     gets in, and the sentinel swap is the one place it would be tempting. */
  const pushes = (body.match(/\$pairs\[\]\s*=/g) || []).length;
  assertEq(pushes, 1, "there is exactly one place a pair is pushed — the guarded helper");
  assert(body.indexOf("=== ''") < body.indexOf("$pairs[] ="), "and the guard is above it, so no pair can skip it");
  assert((body.match(/\$sentinel/g) || []).length >= 3, "the swap needs both halves and the restore, all through $add()");
  assert(/\$guard = /.test(body), "and the swap only runs when there is something for it to protect");
});

check("the announcement bar is one file the site draws, and both halves of it ship", () => {
  /* The failure this check exists for was structural, and it was real: an announcement could be saved
     into a file that no page read. The bar's script and its styles lived in the older copy of this site
     and never made it into the files `index.html` actually links — so "saved" and "the site shows it"
     were two different facts with nothing tying them together. This ties them: the file the server
     writes, the script that fetches it, and the stylesheet that dresses it, sharing one set of colour
     ids, plus the check that the screen reads the endpoint whose file it edits. */
  const lib = readCode("api/v2/lib/announce.php");
  const routes = readCode("api/v2/routes/chrome.php");
  const router = readCode("api/v2/lib/router.php");
  const screen = readCode("admin-v25/src/screens/LiveGlobal.tsx");
  const js = read("assets/site.js");
  const css = read("assets/site.css");

  /* One file, named once, in the server's constant and in the script's fetch. */
  assert(/WX_ANN_REL = 'assets\/announce\.json'/.test(lib), "the server names the file the browser fetches");
  assert(js.includes('"/assets/announce.json"'), "and the site's own script fetches exactly that path");

  /* The three colours, in the server's list, the script's class name and the stylesheet's rules — the
     same three, or a saved colour would arrive unstyled. */
  const styles = (/WX_ANN_STYLES = \[([^\]]*)\]/.exec(lib)?.[1] || "").match(/'[a-z]+'/g)?.map((x) => x.slice(1, -1)) || [];
  assertEq(styles.join(","), "navy,wood,cream", "the server's three colours are v2.1's three");
  assert(js.includes('"wx-ann wx-ann--" + (a.style || "navy")'), "the script builds the class from the stored colour");
  assert(css.includes(".wx-ann{") && css.includes(".wx-ann a{") && css.includes(".wx-ann button{"), "the stylesheet dresses the bar, its link and its close button");
  for (const c of styles) {
    assert(css.includes(`.wx-ann--${c}`), `the ${c} colour has its own rule`);
  }

  /* The header offset is this design's, not v2.1's: this header is fixed, so the bar moves it down. */
  assert(/wx-has-ann \.site-header\{top:/.test(css), "the fixed header is moved down by the bar's height, not by a margin");
  assert(/wx-has-ann \.mobile-panel\{top:/.test(css), "and the mobile menu with it");

  /* Six keys, v2.1's — the older site reads this same file. */
  assert(/WX_ANN_DEF = \['on' => false, 'text' => '', 'link' => '', 'linkText' => '', 'style' => 'navy', 'v' => 0\]/.test(lib), "the record is v2.1's six keys, so the file stays readable by both consoles");
  assert(/function wx_ann_clean/.test(lib) && /WX_ANN_LINK_RE/.test(lib), "one validator, with the link rule in one place");

  /* A file, not 150 pages: nothing here may write a page, and the store must be the atomic one — and it
     must be readable by the web server, which is why the mode is 0644 rather than the private 0640. */
  assert(!/wx_page_write_many\(|wx_page_write\(/.test(lib), "the announcement never rewrites a page");
  assert(/new JsonStore\(wx_ann_path\(\), true, 0644\)/.test(lib), "it is written through the atomic store, world-readable");

  /* The site's two halves are the ones this console serves, and it says which half is missing. */
  assert(/WX_ANN_SCRIPT = 'assets\/site\.js'/.test(lib) && /WX_ANN_STYLE = 'assets\/site\.css'/.test(lib), "both halves are named, so the screen can say which one is absent");
  assert(/function wx_ann_site_ready/.test(lib) && /function wx_ann_pages/.test(lib), "and both are checked at read time rather than promised");

  /* The endpoints keep v2.1's action names, because the role map and the approval policy are written in
     terms of them: an Editor may read, a Manager's save waits for the Master. */
  assert(/wx_require_user\('cms_announce_get', \['owner', 'admin', 'editor'\]\)/.test(routes), "an Editor can see what the bar says");
  assert(/wx_require_user\('cms_announce_save', \['owner', 'admin'\]\)/.test(routes), "and only a Manager or the Master can change it");
  assert(/wx_appr_route\('cms_announce_save'/.test(routes), "a Manager's change is queued, as v2.1 queued it");
  assert(router.includes("'chrome/announce'") && router.includes("'cms_announce_get'") && router.includes("'cms_announce_save'"), "the route table carries both rows under the action names");
  assert(/'cms_announce_save' =>/.test(readCode("api/v2/lib/approvals.php")), "and the queue names it in words the Master reads");
  assert(/useLive<AnnounceData>\("\/chrome\/announce"\)/.test(screen), "the screen reads the endpoint it saves to");
});

/**
 * The announcement block of `assets/site.js`, run against a stub browser.
 *
 * A test that only reads the source can say the class name is spelled the same in three files and nothing
 * about whether a bar appears. This runs the shipped block — the real bytes of `assets/site.js` — with the
 * smallest document it needs, and asks what it put on the page. The promise chain is made synchronous on
 * purpose: `check()` in this file is synchronous, and an async check that never asserts is worse than none.
 */
function runAnnounceBlock(file, ann, opts = {}) {
  const src = file.slice(file.indexOf("/* Announcement bar"));
  const made = [];
  const store = new Map(Object.entries(opts.saved || {}));
  const node = (tag) => {
    const n = {
      tag, attrs: {}, children: [], className: "", textContent: "", innerHTML: "", style: {}, parent: null,
      setAttribute(k, v) { n.attrs[k] = v; },
      appendChild(c) { c.parent = n; n.children.push(c); return c; },
      insertBefore(c, ref) {
        c.parent = n;
        const i = ref ? n.children.indexOf(ref) : -1;
        if (i < 0) n.children.unshift(c); else n.children.splice(i, 0, c);
        return c;
      },
      remove() {
        if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n);
      },
      classList: {
        set: new Set(),
        add(c) { this.set.add(c); },
        remove(c) { this.set.delete(c); },
        contains(c) { return this.set.has(c); },
      },
    };
    made.push(n);
    return n;
  };
  const documentElement = node("html");
  const document = {
    documentElement,
    body: node("body"),
    createElement: node,
  };
  /* A promise stand-in whose handlers run immediately and whose value flows down the chain. */
  const sync = (value) => ({ then: (h) => sync(h(value)), catch: () => sync(value) });
  const fetcher = () => sync({ ok: true, json: () => ann });
  const context = {
    document,
    /* The block asks `window.fetch` whether it can, then calls `fetch` — which is how a browser exposes it. */
    fetch: fetcher,
    location: { pathname: "/", host: "woodex.com.pk" },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    window: { fetch: fetcher },
    sessionStorageKeys: store,
  };
  runInNewContext(src, context);
  return { body: document.body, html: documentElement, store, made };
}

check("the bar the console writes is the bar the browser draws", () => {
  const js = read("assets/site.js");
  const base = { on: true, text: "Free site visit in Lahore this month", link: "/contact/", linkText: "Book now", style: "wood", v: 7 };

  const out = runAnnounceBlock(js, base);
  assertEq(out.body.children.length, 1, "one bar is inserted, above everything else");
  const bar = out.body.children[0];
  assertEq(bar.className, "wx-ann wx-ann--wood", "with the class the stylesheet dresses, in the colour that was saved");
  assertEq(bar.children[0].textContent, base.text, "the words are the words");
  assertEq(bar.children[1].href, "/contact/", "the link goes where it was typed");
  assertEq(bar.children[1].textContent, "Book now", "and is called what it was called");
  assertEq(bar.attrs["aria-label"], "Announcement", "the region is announced to a screen reader");
  assertEq(bar.children[2].attrs["aria-label"], "Close announcement", "as is the way to close it");
  assert(out.html.classList.contains("wx-has-ann"), "and the page is marked, which is what moves the fixed header down");

  /* Off, and nothing is inserted — not an empty bar, not a hidden one. */
  const off = runAnnounceBlock(js, { ...base, on: false });
  assertEq(off.body.children.length, 0, "with the bar off nothing is put on the page");
  assertEq(off.html.classList.contains("wx-has-ann"), false, "and the header is not moved down for it");

  /* A visitor who closed this version is not shown it again; a new version is shown to everyone. */
  const closed = runAnnounceBlock(js, base, { saved: { ["wx-ann-" + base.v]: "1" } });
  assertEq(closed.body.children.length, 0, "a bar this visitor already closed stays closed");
  const edited = runAnnounceBlock(js, { ...base, v: base.v + 1 }, { saved: { ["wx-ann-" + base.v]: "1" } });
  assertEq(edited.body.children.length, 1, "and an edit — a new version — is shown again, to everybody");

  /* The one design detail that is this site's and not v2.1's: an external link opens in a new tab with
     `noopener`, an internal one does not. */
  const ext = runAnnounceBlock(js, { ...base, link: "https://woodex.com.pk/offer/" });
  assertEq(ext.body.children[0].children[1].target, undefined, "a link to this same host stays in the tab");
  const other = runAnnounceBlock(js, { ...base, link: "https://example.com/offer/" });
  assertEq(other.body.children[0].children[1].target, "_blank", "an outside link opens in a new tab");
  assertEq(other.body.children[0].children[1].rel, "noopener", "without handing it the window");
});

check("the strip tells one story about the host, and no number on any screen comes from a fixture", () => {
  /* What this replaced: a check that the demo strip said one true thing per clause. The strip had three clauses
     and one of them was stale; then it had a sample behind it to explain; now there is no sample, so the strip
     has a single job — keep "we cannot reach your site" apart from "the API answered and said no" — and the
     failure this guards is a screen that counts something. The dashboard's approvals banner once said "3
     changes are waiting for the master" out of `lib/mock.ts`, presented as a fact about the studio. */
  const shell = readCode("admin-v25/src/components/Shell.tsx");
  const live = readCode("admin-v25/src/lib/live.ts");
  const dash = readCode("admin-v25/src/screens/Dashboard.tsx");
  assert(!/demo/i.test(shell), "no clause in the strip mentions a sample");
  assert(!shell.includes("layouts and interactions from the v2.5 Pro plan"), "nor the stale prototype clause");
  /* Four states, four sentences: each one is a different claim about the host, and the pill agrees with it. */
  for (const [what, re] of [
    ["checking", /link === "checking"/],
    ["offline", /link === "offline"/],
    ["signed out", /link === "signedOut"/],
    ["answering but not ready", /health\.ready/],
  ]) assert(re.test(live), `the strip has a sentence for ${what}`);
  /* `sample` is a live word in this file — a quotation template has a sample document printed on it, marked as
     such on the page — so the check is about the phrase the strip used to carry. */
  assert(!/demo data/i.test(live), "and none of them is about sample data");

  /* The dashboard: no count it did not receive. The screen must not hold a number of its own — it draws what
     the API sent, and with no API it draws the notice instead. */
  assert(!/changes are waiting/.test(dash), "the dashboard does not announce a number of its own");
  assert(/api\/v2 is not answering|Not connected|link === "offline"/.test(dash), "and says what it is when there is no API");
  /* The dashboard is a two-state wrapper: with a session it renders the screen that reads the API, and the
     reading itself is asserted in that file, so this is where the delegation is checked rather than assumed. */
  assert(/LiveDashboard/.test(dash), "with a session the dashboard is the screen that reads the API");
  assert(/useLive</.test(read("admin-v25/src/screens/LiveDashboard.tsx")), "and that screen reads it rather than drawing it");

  /* The sidebar's counts are the server's answer or nothing at all — never a fixture's. */
  const app = readCode("admin-v25/src/App.tsx");
  assert(/badgeCounts\(bell\.data\)/.test(app.replace(/\s+/g, " ")), "the sidebar counts come from the bell endpoint's answer");
  assert(!/mock|fixture/i.test(app), "and not from a fixture");

  /* And the queue itself exists: the badge used to point at a build-plan card, so "3 waiting" had nowhere to
     go. The screen and its route are separate facts, so both are asserted. */
  assert(app.includes('import { LiveApprovals }'), "the approvals screen is imported");
  /* Every route the nav knows is either built here or served by the placeholder, and `approvals` is built. */
  assert(/const BUILT_IDS = new Set\(\[/.test(app), "the built screens are one list the router reads");
  assert(/BUILT_IDS\.has\(r\.id\)/.test(app), "so a screen is built by being in it, not by being edited into the router");
  const built = app.slice(app.indexOf("const BUILT_IDS"), app.indexOf("];", app.indexOf("const BUILT_IDS")));
  assert(/"approvals"/.test(built), "and approvals is in it, so the queue has a screen rather than a build plan");
  assert(app.includes('path="/approvals" element={<LiveApprovals />}'), "with a route of its own");
  const screen = readCode("admin-v25/src/screens/LiveApprovals.tsx");
  assert(/api\.post<[^>]*>\(`\/approvals\/\$\{id\}\/\$\{kind\}`/.test(screen.replace(/\s+/g, " ")) || /\/approvals\/\$\{id\}\/\$\{kind\}/.test(screen), "approving posts to the replay endpoint rather than retyping the change");
  assert(screen.includes("Only the master decides"), "and a manager is told whose buttons those are");
  assert(!/demo/i.test(screen), "with no sample branch in it");
});

check("the pages screen publishes through the API, and reads the three facts rather than working them out", () => {
  /* Publishing a page is a decision with two consequences a person cannot see: the address leaves
     `sitemap.xml`, and search engines are told not to index it. The failure modes this guards are the two
     that look fine in a screenshot — a screen that decided a page's status from the HTML it is editing (so
     its answer drifts from the file the server keeps), and a screen that wrote the head tags itself instead
     of calling the route, which would leave `_private/pages.json` — v2.1's file — disagreeing with the page. */
  const screen = readCode("admin-v25/src/screens/LivePages.tsx").replace(/\s+/g, " ");
  assert(/api\.post<[^>]*>\(`\/pages\/\$\{/.test(screen) && /\/publish`/.test(screen), "the status is changed through the publish endpoint");
  assert(!/<meta\b/i.test(screen), "and the screen never writes a meta tag itself");
  assert(/state\.inSitemap/.test(screen) && /state\.indexable/.test(screen) && /state\.status/.test(screen), "the three facts are read from the server's answer");
  assert(/status: "draft"/.test(screen), "a new page is saved as a draft, as v2.1 started them");
  const lib = readCode("api/v2/lib/pages.php");
  assert(/function wx_page_head_plan\(/.test(lib), "the rules are one pure function, so a host without a database can still test them");
  assert(/function wx_page_sitemap_set\(/.test(lib), "and the sitemap follows the status both ways");
  const route = readCode("api/v2/routes/pages.php");
  assert(/wx_appr_route\('page_meta_save'/.test(route), "the route keeps v2.1's action name, so the queue reads what it always read");
  const legacy = readCode("api/v2/routes/legacy.php");
  assert(/'page_meta_save'\s*=>\s*\['pages'/.test(legacy), "and v2.1's own call for it lands on the same handler");
});

/* ============================================================== report */

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ passed, failed: failures.length, failures, notes }, null, 2));
} else {
  for (const n of notes) console.log(`  · ${n}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\n  ${passed} passed · ${failures.length} failed\n`);
}
process.exit(failures.length ? 1 : 0);
